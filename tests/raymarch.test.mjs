import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import { compileShader } from '../dist/compiler.js';

// Execute the shipped GLSL loop's scalar control flow, sampling along a ray at
// distance t. Geometry stays in surfaceDistance; no copy of the loop lives here.
function marcher(iterations, surfaceDistance, step = 0.7) {
  const artifact = compileShader('sphere(0.5);', { maxRaymarchIterations: iterations });
  const body = artifact.frag.match(/float intersect\(vec3 ro, vec3 rd, float stepFraction\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body);
  const scalar = body.replace(/surfaceDistance\(\(ro \+ rd \* t\)\)/g, 'surfaceDistance(t)')
    .replace(/\b(?:float|int)\b/g, 'let');
  return new Script(`(function () {${scalar}})()`).runInNewContext({
    surfaceDistance, MAX_ITERATIONS: iterations, STEP_SIZE_CONSTANT: step,
    max_dist: 100, intersection_threshold: 0.00001,
  });
}

test('budget exhaustion cannot shade a false surface from a conservative thin-shape distance', () => {
  let samples = 0;
  const hit = marcher(96, t => { samples++; return (5 - t) * 0.01; });
  assert.equal(samples, 96);
  assert.equal(hit, 100);
});

test('actual surfaces still hit, including on the final permitted sample', () => {
  const hit = marcher(96, t => 5 - t);
  assert.ok(hit > 4.99999 && hit < 5);
  let samples = 0;
  assert.ok(Math.abs(marcher(3, () => [1, 0.5, 0][samples++]) - 1.05) < 1e-12);
  assert.equal(samples, 3);
  assert.equal(marcher(3, () => -0.1), 0);
});

test('rays that escape or never approach a surface miss within their existing budget', () => {
  let samples = 0;
  assert.equal(marcher(96, () => { samples++; return 200; }), 100);
  assert.equal(samples, 1);
  assert.equal(marcher(1, () => 1), 100);
  assert.equal(marcher(3, () => Number.NaN), 100);
});
