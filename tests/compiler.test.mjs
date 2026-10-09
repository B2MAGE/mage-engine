import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileShader } from '../dist/compiler.js';
import { normalizeCompiledShader } from '../dist/compiled-shader.js';

const baseline = JSON.parse(await readFile(new URL('./fixtures/compiler-parity.json', import.meta.url), 'utf8'));

test('all existing templates preserve the exact compiled program and uniforms at each supported ceiling', () => {
  assert.equal(baseline.fixtures.length, 16);
  for (const fixture of baseline.fixtures) for (const expected of fixture.outputs) {
    const artifact = compileShader(fixture.source, { maxRaymarchIterations: expected.ceiling });
    const actual = createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
    assert.equal(actual, expected.sha256, `${fixture.sceneId}, ceiling ${expected.ceiling}`);
  }
});

test('compiler preserves dynamic helpers and clamps authored rendering work', () => {
  for (const source of ['box(vec3(0.5));', 'boxFrame(vec3(0.5), 0.1);',
    'torus(0.5, 0.2);', 'cylinder(0.5, 0.2);',
    'setStepSize(0.8); setMaxIterations(9999); sphere(0.5);']) {
    const artifact = compileShader(source, { maxRaymarchIterations: 32 });
    assert.match(artifact.frag, /const int MAX_ITERATIONS = 32;/, source);
    assert.deepEqual(normalizeCompiledShader(artifact), artifact);
  }
});

test('compiled boundary rejects executable properties and modified shader scaffolding', () => {
  const artifact = compileShader('sphere(0.5);');
  let invoked = false;
  assert.throws(() => normalizeCompiledShader({ ...artifact, get frag() { invoked = true; return artifact.frag; } }));
  assert.equal(invoked, false);
  assert.throws(() => normalizeCompiledShader({ ...artifact, callback() {} }));
  assert.throws(() => normalizeCompiledShader({ ...artifact, vert: 'void main() { gl_Position = vec4(0.0); }' }));
  assert.throws(() => normalizeCompiledShader({ ...artifact, frag: artifact.frag + '\nvoid attack() { while(true) {} }' }));
});
