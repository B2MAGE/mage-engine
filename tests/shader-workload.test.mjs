import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BoxGeometry } from 'three';
import { initMAGE } from '../dist/mage-engine.js';
import { compileShader } from '../dist/compiler.js';
import { analyzeCompiledShader, normalizeCompiledShader, SHADER_WORKLOAD_LIMITS } from '../dist/compiled-shader.js';
import { createSculptureWithGeometry } from '../js/sculpture.js';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/shader-workload.v1.json', import.meta.url), 'utf8'));
const base = compileShader('sphere(0.5);');
function geometryArtifact(body, functions = '') {
  const geoGLSL = `${functions}\nfloat surfaceDistance(vec3 p) { ${body} }`;
  return { ...base, geoGLSL, frag: base.frag.replace(base.geoGLSL, geoGLSL) };
}
function chain(depth, multiplicity, leaf = 'sin(x)') {
  const functions = [`float work0(float x) { return ${leaf}; }`];
  for (let index = 1; index <= depth; index++) {
    functions.push(`float work${index}(float x) { return ${Array(multiplicity).fill(`work${index - 1}(x)`).join('+')}; }`);
  }
  return geometryArtifact(`return work${depth}(p.x);`, functions.join('\n'));
}
function rejection(limit) {
  return error => {
    assert.equal(error.name, 'ShaderWorkloadError');
    assert.equal(error.limit, limit);
    if (error.actual !== undefined) {
      assert.ok(Number.isSafeInteger(error.actual));
      assert.ok(error.actual > error.maximum);
      assert.match(error.message, /exceeds/);
      assert.doesNotMatch(error.message, /malicious/i);
    }
    return true;
  };
}

test('versioned accepted fixtures keep their program unchanged while reporting bounded work', () => {
  assert.equal(fixtures.policyVersion, SHADER_WORKLOAD_LIMITS.policyVersion);
  for (const fixture of fixtures.accepted) {
    const artifact = compileShader(fixture.source);
    const result = analyzeCompiledShader(artifact);
    assert.deepEqual(result.artifact, artifact, fixture.id);
    for (const value of Object.values(result.workload)) assert.ok(Number.isSafeInteger(value) && value >= 0);
  }
});

for (const fixture of fixtures.rejected) test(`versioned rejected fixture: ${fixture.id}`, () => {
  const artifact = fixture.kind === 'chain' ? chain(fixture.depth, fixture.multiplicity) : geometryArtifact(fixture.body);
  assert.throws(() => normalizeCompiledShader(artifact), rejection(fixture.limit));
});

test('multiplicity includes duplicate calls, diamond paths and both conditional branches', () => {
  const one = analyzeCompiledShader(chain(5, 1)).workload.geometryCost;
  const two = analyzeCompiledShader(chain(5, 2)).workload.geometryCost;
  assert.ok(two > one * 10);
  const leaf = 'float work0(float x) { return fractalNoise(vec3(x)); }';
  const straight = analyzeCompiledShader(geometryArtifact('return work0(p.x);', leaf)).workload;
  const branch = analyzeCompiledShader(geometryArtifact('if(p.x>0.0) return work0(p.x); else return work0(p.y);', leaf)).workload;
  assert.ok(branch.geometryCost >= straight.geometryCost * 2);
  const diamond = analyzeCompiledShader(geometryArtifact('return a(p.x) + b(p.y);', leaf
    + 'float a(float x){return work0(x);} float b(float x){return work0(x);}')).workload;
  assert.ok(diamond.geometryCost >= straight.geometryCost * 2);
});

test('expensive helper bodies, overloads and fixed noise iterations contribute to the estimate', () => {
  const cost = expression => analyzeCompiledShader(geometryArtifact(`return ${expression};`)).workload.geometryCost;
  assert.ok(cost('noise(p)') > cost('sphere(p,0.5)') * 5);
  assert.ok(cost('fractalNoise(p)') > cost('noise(p)') * 10);
  assert.equal(cost('noise(p)') + 2, cost('noise(p.xy)'));
  // Same-arity helper overloads are conservatively summed rather than selecting
  // a cheaper overload based on untrusted/partial type information.
  assert.ok(cost('intersect(p.x,p.y)') < 100);
});

test('effective iterations, reflections, normals and shading surface calls are charged', () => {
  const high = compileShader('setMaxIterations(200); setMaxReflections(2); sphere(0.5);');
  const full = analyzeCompiledShader(high).workload;
  const capped = analyzeCompiledShader(high, { maxRaymarchIterations: 20 }).workload;
  assert.equal(capped.raymarchIterations, 20);
  assert.equal(capped.reflections, 2);
  assert.ok(full.fragmentCost > capped.fragmentCost * 3);
  const plain = analyzeCompiledShader(base).workload;
  assert.ok(full.fragmentCost > plain.fragmentCost * 2);
  const shadows = analyzeCompiledShader(compileShader('occlusion(1); sphere(0.5);')).workload;
  assert.ok(shadows.fragmentCost > plain.fragmentCost);
  const expensive = chain(9, 2, 'noise(vec3(x))');
  assert.throws(() => normalizeCompiledShader(expensive), rejection('fragment-cost'));
});

test('parser bounds apply before graph expansion and reject pathological input promptly', () => {
  assert.throws(() => normalizeCompiledShader(geometryArtifact(`return ${'('.repeat(65)}p.x${')'.repeat(65)};`)), rejection('nesting'));
  const preprocessor = '#ifdef USE_PBR\n'.repeat(65) + 'float surfaceDistance(vec3 p){return p.x;}\n' + '#endif\n'.repeat(65);
  assert.throws(() => normalizeCompiledShader({ ...base, geoGLSL: preprocessor, frag: base.frag.replace(base.geoGLSL, preprocessor) }), rejection('nesting'));
  const functions = Array.from({ length: 513 }, (_, i) => `float helper${i}(){return 0.0;}`).join('\n');
  assert.throws(() => normalizeCompiledShader(geometryArtifact('return p.x;', functions)), rejection('functions'));
  assert.throws(() => normalizeCompiledShader(geometryArtifact(`return ${Array(31000).fill('1.').join('+')};`)), rejection('tokens'));
  assert.throws(() => normalizeCompiledShader({ ...base, geoGLSL: ' '.repeat(262145) }));
});

test('forged claimed budgets cannot bypass any engine submission boundary', () => {
  const excessive = chain(20, 2);
  assert.throws(() => normalizeCompiledShader({ ...excessive, workload: { fragmentCost: 0 } }));
  assert.throws(() => normalizeCompiledShader(excessive), rejection('expanded-cost'));
  const geometry = new BoxGeometry(2, 2, 2);
  let touchedGeometry = false;
  geometry.computeBoundingSphere = () => { touchedGeometry = true; };
  assert.throws(() => createSculptureWithGeometry(geometry, '', () => ({}), {}, excessive), rejection('expanded-cost'));
  assert.equal(touchedGeometry, false, 'must fail before material or geometry work');
  geometry.dispose();
  const engine = initMAGE({ autoStart: false });
  const visualizer = engine.getEngineFields().visualizer;
  let touchedMesh = false;
  visualizer.createMesh = () => { touchedMesh = true; };
  try {
    assert.throws(() => visualizer.loadCompiled('inert metadata', excessive), rejection('expanded-cost'));
    assert.throws(() => engine.loadCompiledPreset({ visualizer: { shader: 'inert metadata' } }, excessive), rejection('expanded-cost'));
    assert.equal(touchedMesh, false);
  } finally { engine.dispose(); }
});
