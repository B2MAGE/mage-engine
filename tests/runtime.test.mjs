import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, BackSide } from 'three';
import { initMAGE } from '../dist/mage-engine.js';
import { createSculptureWithGeometry } from '../js/sculpture.js';
import { compileShader } from '../dist/compiler.js';
import { normalizeAudioResponseMode } from '../dist/audio-response.js';

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

test('bounded defaults and Original/Selective audio modes survive packaging', () => {
  const engine = initMAGE({ autoStart: false, renderBudget: { maxRaymarchIterations: 9999, maxRenderPixels: 320000 } });
  try {
    assert.equal(engine.getRenderBudget().maxRaymarchIterations, 200);
    assert.equal(engine.getRenderBudget().maxRenderPixels, 320000);
    for (const mode of ['legacy', 'mapped-v1']) {
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

test('unsupported modes are rejected before changing the current audio configuration or queued frames', () => {
  const engine = initMAGE({ autoStart: false });
  const invalidModes = ['transient-v1', 'mapped-v2', '', null, 0, false, {}, []];
  try {
    assert.equal(normalizeAudioResponseMode(undefined), 'legacy');
    for (const mode of ['legacy', 'mapped-v1']) {
      engine.setAudioResponseMode(mode);
      if (mode === 'mapped-v1') engine.setAudioResponseConfig({ version: 1, sensitivity: 2, mappings: [
        { target: 'size', source: 'bass-level', amount: 1.5, attack: 0.1, release: 0.4 },
      ] });
      engine.setExternalAudioFrame({
        frame: { sequence: 1, time: 2, levels: { bass: 0.8, mid: 0.3, treble: 0.1, overall: 0.5 }, hits: [] },
        legacyAmplitude: 0.4, audioTime: 2, playing: true, loaded: true,
      });
      const config = engine.getAudioResponseConfig();
      const queued = engine.getAudioAnalysis().queuedFrames;
      for (const value of invalidModes) {
        assert.throws(() => normalizeAudioResponseMode(value), /Unsupported music response version/);
        assert.throws(() => engine.setAudioResponseMode(value), /Unsupported music response version/);
        assert.equal(engine.getAudioResponseDiagnostics().mode, mode);
        assert.deepEqual(engine.getAudioResponseConfig(), config);
        assert.equal(engine.getAudioAnalysis().queuedFrames, queued);
      }
    }
    engine.setAudioResponseMode();
    assert.equal(engine.getAudioResponseDiagnostics().mode, 'legacy');
    assert.equal(engine.getAudioResponseConfig(), null);
  } finally { engine.dispose(); }
});

test('presets with unsupported audio modes fail before mutating current settings', () => {
  const engine = initMAGE({ autoStart: false });
  try {
    engine.setAudioResponseMode('mapped-v1');
    const state = engine.getEngineFields().state;
    const previousSpeed = state.base_speed;
    for (const audioResponse of ['transient-v1', 'invalid', null]) {
      const preset = { audioResponse, state: { base_speed: previousSpeed + 1 } };
      for (const input of [preset, JSON.stringify(preset)]) {
        assert.throws(() => engine.loadPreset(input), /Unsupported music response version/);
        assert.equal(engine.getAudioResponseDiagnostics().mode, 'mapped-v1');
        assert.equal(state.base_speed, previousSpeed);
      }
    }
  } finally { engine.dispose(); }
});
