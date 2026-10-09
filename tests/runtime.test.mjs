import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, BackSide } from 'three';
import { initMAGE } from '../dist/mage-engine.js';
import { createSculptureWithGeometry } from '../js/sculpture.js';
import { compileShader } from '../dist/compiler.js';

test('compiled mesh uses inert metadata and preserves material/uniform behavior', () => {
  const artifact = compileShader('let size = input(0.5); sphere(size);');
  globalThis.__mageSourceExecuted = false;
  const geometry = new BoxGeometry(2, 2, 2);
  const mesh = createSculptureWithGeometry(geometry,
    'globalThis.__mageSourceExecuted = true; throw new Error("must not compile");',
    () => ({ size: 0.8, unknown: 5 }), { radius: 3 }, artifact);
  try {
    assert.equal(globalThis.__mageSourceExecuted, false);
    assert.equal(mesh.material.fragmentShader, artifact.frag);
    assert.equal(mesh.material.vertexShader, artifact.vert);
    assert.equal(mesh.material.side, BackSide);
    assert.equal(mesh.material.transparent, true);
    assert.equal(mesh.material.uniforms._scale.value, 3);
    mesh.onBeforeRender();
    assert.equal(mesh.material.uniforms.size.value, 0.8);
    assert.equal(Object.hasOwn(mesh.material.uniforms, 'unknown'), false);
  } finally {
    mesh.material.dispose();
    geometry.dispose();
    delete globalThis.__mageSourceExecuted;
  }
});

test('live settings validate the entire change before mutation and cannot replace source', () => {
  const engine = initMAGE({ autoStart: false });
  const { state, visualizer } = engine.getEngineFields();
  try {
    assert.equal(engine.updateSettings({ state: { volume_multiplier: 2 }, visualizer: { scale: 15 } }), true);
    assert.equal(state.volume_multiplier, 2);
    assert.equal(visualizer.scale, 15);
    assert.throws(() => engine.updateSettings({ state: { volume_multiplier: 3 }, visualizer: { shader: 'sphere(1);' } }));
    assert.equal(state.volume_multiplier, 2);
    let invoked = false;
    assert.throws(() => engine.updateSettings({ get state() { invoked = true; return {}; } }));
    assert.equal(invoked, false);
  } finally { engine.dispose(); }
  assert.equal(engine.updateSettings({ state: { volume_multiplier: 1 } }), false);
});

test('bounded defaults and all existing audio modes survive packaging', () => {
  const engine = initMAGE({ autoStart: false, renderBudget: { maxRaymarchIterations: 9999, maxRenderPixels: 320000 } });
  try {
    assert.equal(engine.getRenderBudget().maxRaymarchIterations, 200);
    assert.equal(engine.getRenderBudget().maxRenderPixels, 320000);
    for (const mode of ['legacy', 'transient-v1', 'mapped-v1']) {
      engine.setAudioResponseMode(mode);
      assert.equal(engine.getAudioResponseDiagnostics().mode, mode);
    }
    const state = engine.getEngineFields().state;
    for (const key of ['currBass', 'currMid', 'currTreble', 'currEnergy', 'currCentroid', 'currEnergyTrend']) {
      assert.ok(Number.isFinite(state[key]), key);
    }
    engine.stop();
    engine.stop();
  } finally { engine.dispose(); engine.dispose(); }
});
