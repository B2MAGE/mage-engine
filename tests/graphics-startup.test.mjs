import assert from 'node:assert/strict';
import test from 'node:test';
import { initMAGE } from '../dist/mage-engine.js';
import { fixture } from './helpers/graphics-harness.mjs';
test('empty startup avoids generated default shader and skybox without changing the default API', () => {
  for (const [mode, expectedDefaults] of [['empty', 0], [undefined, 1], ['default', 1]]) {
    const { engine, calls, frame } = fixture(mode);
    engine.start();
    assert.equal(calls.defaultScenes, expectedDefaults);
    assert.equal(calls.skyboxes, expectedDefaults);
    assert.equal(engine.getGraphicsDiagnostics().contextsCreated, 1);
    assert.equal(engine.getGraphicsDiagnostics().firstFrameAt, null, 'empty startup draw is not a scene first frame');
    frame();
    const diagnostics = engine.getGraphicsDiagnostics();
    assert.equal(diagnostics.submittedFrames, expectedDefaults);
    assert.equal(diagnostics.firstFrameAt, expectedDefaults ? 30 : null);
    engine.stop(); engine.start();
    assert.equal(calls.defaultScenes, expectedDefaults, 'resume cannot create another default scene');
    assert.equal(engine.getGraphicsDiagnostics().contextsCreated, 1, 'resume keeps context');
    engine.dispose(); engine.dispose();
    assert.equal(calls.disposed, 1); assert.equal(calls.losses, 1);
    assert.equal(engine.getGraphicsDiagnostics().contextsDisposed, 1);
  }
});

test('graphics diagnostics retain bounded peaks and immutable snapshots without retaining scenes', () => {
  const { engine, frame } = fixture();
  engine.start(); frame();
  const snapshot = engine.getGraphicsDiagnostics();
  assert.equal(snapshot.geometries, 1); assert.equal(snapshot.textures, 2); assert.equal(snapshot.programs, 1);
  assert.throws(() => { snapshot.contextsCreated = 0; }, TypeError);
  const renderer = engine.getEngineFields().renderer;
  renderer.info.memory.geometries = 0; renderer.info.memory.textures = 0; renderer.info.programs = [];
  const next = engine.getGraphicsDiagnostics();
  assert.equal(next.geometries, 0); assert.equal(next.peakGeometries, 1);
  assert.equal(next.peakTextures, 2); assert.equal(next.peakPrograms, 1);
  engine.dispose();
  assert.equal(engine.getGraphicsDiagnostics().disposed, true);
  assert.equal(engine.getGraphicsDiagnostics().geometries, 0);
  assert.equal(snapshot.disposed, false);
});

test('packaged initialization validates empty-scene opt-in before graphics allocation', () => {
  for (const initialScene of ['empty', 'default', undefined]) {
    const engine = initMAGE({ initialScene });
    assert.equal(engine.getGraphicsDiagnostics().contextsCreated, 0);
    assert.equal(engine.getGraphicsDiagnostics().firstFrameAt, null);
    engine.dispose();
  }
  for (const initialScene of [null, '', 'generated', {}, false]) {
    assert.throws(() => initMAGE({ initialScene }), /Unsupported initial scene/);
  }
});
