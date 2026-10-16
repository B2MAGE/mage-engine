import assert from 'node:assert/strict';
import test from 'node:test';
import { compileShader } from '../dist/compiler.js';
import { fixture } from './helpers/graphics-harness.mjs';

const artifact = compileShader('sphere(0.5);');
const preset = (name, extra = {}) => ({ audioResponse: 'legacy', visualizer: { shader: name, scale: 10, skyboxPreset: 6 }, ...extra });
const install = async (engine, name, extra) => engine.activatePreparedPreset(await engine.prepareCompiledPreset(preset(name, extra), artifact));

test('replacement owns separate resources and activates without replacing renderer, camera, clock or pause intent', async () => {
  const f = fixture('empty'); const { engine, calls } = f;
  engine.start();
  await install(engine, 'active');
  const active = engine.getEngineFields();
  engine.state.time = 12;
  engine.pause();
  const token = await engine.prepareCompiledPreset(preset('next', { controls: {
    position0: { x: 2, y: 3, z: 4 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 2,
  }, fx: { toneMapping: { method: 1, exposure: 0.8 } } }), artifact);
  assert.equal(engine.getEngineFields().visualizer, active.visualizer);
  assert.equal(engine.getEngineFields().state, active.state);
  assert.equal(engine.isRunning(), false);
  assert.equal(calls.meshes[0].geometryDisposals, 0);
  const candidate = engine.getPreparedSceneFields(token);
  assert.notEqual(candidate.visualizer, active.visualizer);
  assert.equal(candidate.camera.position.x, 2);
  candidate.visualizer.mesh.material.uniforms.amount.value = 0.25;
  engine.activatePreparedPreset(token);
  assert.equal(engine.getEngineFields().renderer, active.renderer);
  assert.equal(engine.getEngineFields().camera, active.camera);
  assert.equal(engine.getEngineFields().camera.position.x, 2);
  assert.equal(engine.getEngineFields().renderer.toneMappingExposure, 0.8);
  assert.equal(engine.state.time, 12);
  assert.equal(engine.isRunning(), false);
  assert.equal(engine.getEngineFields().visualizer.mesh.material.uniforms.amount.value, 0.25);
  assert.equal(calls.meshes[0].geometryDisposals, 1);
  assert.equal(calls.meshes[0].materialDisposals, 1, 'picking clone does not double-dispose shared resources');
  assert.throws(() => engine.activatePreparedPreset(token), /unavailable/);
  assert.equal(engine.getGraphicsDiagnostics().contextsCreated, 1);
  assert.equal(engine.getGraphicsDiagnostics().contextsDisposed, 0);
  engine.dispose();
  assert.equal(calls.meshes[1].materialDisposals, 1);
  assert.ok(calls.composers.every(composer => composer.disposals === 1));
  assert.equal(calls.losses, 1, 'full session disposal still loses the graphics context');
});

test('same-mode activation preserves external audio and queued Selective measurements', async () => {
  const { engine } = fixture('empty'); engine.start();
  const extra = { audioResponse: 'mapped-v1' };
  await install(engine, 'active', extra);
  engine.setExternalAudioFrame({ legacyAmplitude: 0.4, audioTime: 3, playing: true, loaded: true,
    frame: { sequence: 7, time: 3, levels: { bass: 0.7, mid: 0.4, treble: 0.2, overall: 0.5 }, hits: [] } });
  const before = engine.getAudioAnalysis();
  assert.equal(before.queuedFrames, 1);
  await install(engine, 'next', extra);
  assert.equal(engine.getAudioAnalysis().queuedFrames, 1);
  assert.equal(engine.getAudioAnalysis().status, 'connected');
  assert.equal(engine.getAudioResponseDiagnostics().mode, 'mapped-v1');
  await install(engine, 'original', { audioResponse: 'legacy' });
  assert.equal(engine.getAudioResponseDiagnostics().mode, 'legacy');
  assert.equal(engine.getAudioAnalysis().status, 'connected', 'switching creative mode does not unload external audio');
  engine.dispose();
});

test('newest scene supersedes pending textures and late callbacks cannot replace or dispose it', async () => {
  const { engine, calls } = fixture('empty', { skyboxes: true, manualTextures: true }); engine.start();
  const first = engine.prepareCompiledPreset(preset('old'), artifact);
  const rejected = assert.rejects(first, /cancel|superseded/);
  await Promise.resolve();
  const second = engine.prepareCompiledPreset(preset('new'), artifact);
  await Promise.resolve();
  assert.equal(calls.pendingTextures.length, 2);
  calls.pendingTextures[1].success();
  const token = await second;
  engine.activatePreparedPreset(token);
  calls.pendingTextures[0].success(); calls.pendingTextures[0].failure();
  await rejected;
  assert.equal(engine.getEngineFields().visualizer.shader, 'new');
  assert.equal(calls.backgrounds[0].disposals, 1);
  assert.equal(calls.backgrounds[1].disposals, 0);
  assert.equal(calls.meshes[0].materialDisposals, 1);
  engine.discardPreparedPreset({});
  assert.equal(calls.meshes[1].materialDisposals, 0);
  engine.dispose();
  assert.equal(calls.backgrounds[1].disposals, 1);
});

test('candidate first-frame failure preserves healthy playback and emits no active render error', async () => {
  const { engine, calls, frame } = fixture('empty', { failDraw: name => name === 'broken' }); engine.start();
  await install(engine, 'healthy');
  const active = engine.getEngineFields().visualizer;
  const events = [];
  engine.subscribeRenderLifecycle(event => events.push(event.type));
  await assert.rejects(engine.prepareCompiledPreset(preset('broken'), artifact), /first frame/);
  assert.equal(engine.getEngineFields().visualizer, active);
  assert.equal(calls.meshes[0].materialDisposals, 0);
  assert.equal(calls.meshes[1].materialDisposals, 1);
  assert.equal(engine.isRunning(), true);
  frame();
  assert.deepEqual(events, ['frame']);
  assert.equal(engine.getGraphicsDiagnostics().candidatesDiscarded, 1);
  engine.dispose();
});

test('independent validation happens before candidate allocation or active-scene mutation', async () => {
  const { engine, calls } = fixture('empty'); engine.start(); await install(engine, 'active');
  const before = engine.getEngineFields();
  await assert.rejects(engine.prepareCompiledPreset(preset('invalid'), { ...artifact, claimedBudget: 0 }));
  assert.equal(calls.meshes.length, 1);
  assert.equal(engine.getGraphicsDiagnostics().candidatesStarted, 1);
  assert.equal(engine.getEngineFields().visualizer, before.visualizer);
  engine.dispose();
});

test('program preparation deadline stops its polling and releases only the candidate', async () => {
  const options = { parallel: true, programReady: name => name !== 'slow' };
  const { engine, calls } = fixture('empty', options); engine.start(); await install(engine, 'healthy');
  await assert.rejects(engine.prepareCompiledPreset(preset('slow'), artifact, { timeoutMs: 15 }), /timed out/);
  const polls = calls.programsPolled;
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls.programsPolled, polls);
  assert.equal(calls.meshes[1].materialDisposals, 1);
  assert.equal(calls.meshes[0].materialDisposals, 0);
  assert.equal(engine.isRunning(), true);
  assert.equal(engine.getGraphicsDiagnostics().preparationMode, 'parallel');
  engine.dispose();
});

test('cancelled first-frame fences and completed signals cannot affect an activated replacement', async () => {
  const options = { fences: true, fenceReady: true };
  const { engine, calls } = fixture('empty', options); engine.start();
  const completed = new AbortController();
  const ready = await engine.prepareCompiledPreset(preset('active'), artifact, { signal: completed.signal });
  engine.activatePreparedPreset(ready); completed.abort();
  assert.equal(calls.meshes[0].materialDisposals, 0);
  options.fenceReady = false;
  const pending = new AbortController();
  const preparation = engine.prepareCompiledPreset(preset('cancelled'), artifact, { signal: pending.signal });
  const rejected = assert.rejects(preparation, /cancel/);
  await new Promise(resolve => setTimeout(resolve, 5));
  pending.abort(); await rejected;
  assert.equal(calls.fencesDeleted, 2);
  assert.equal(engine.getEngineFields().visualizer.shader, 'active');
  assert.equal(calls.meshes[1].materialDisposals, 1);
  engine.dispose();
});

test('full disposal cancels and releases both active and pending scene resources exactly once', async () => {
  const options = { parallel: true, programReady: name => name !== 'pending' };
  const { engine, calls } = fixture('empty', options); engine.start(); await install(engine, 'active');
  const pending = engine.prepareCompiledPreset(preset('pending'), artifact);
  const rejected = assert.rejects(pending, /cancel|stopped/);
  await Promise.resolve(); engine.dispose(); engine.dispose(); await rejected;
  assert.ok(calls.meshes.every(record => record.materialDisposals === 1 && record.geometryDisposals === 1));
  assert.equal(calls.disposed, 1); assert.equal(calls.losses, 1);
});

test('failed activation rolls back camera and controls before changing active audio or resources', async () => {
  const { engine, calls } = fixture('empty'); engine.start(); await install(engine, 'active');
  const before = engine.getEngineFields();
  const position = before.camera.position.clone();
  const token = await engine.prepareCompiledPreset(preset('next', { audioResponse: 'mapped-v1' }), artifact);
  const copy = before.camera.copy;
  before.camera.copy = function () { this.position.x = 999; throw new Error('Camera commit failed.'); };
  assert.throws(() => engine.activatePreparedPreset(token), /Camera commit/);
  before.camera.copy = copy;
  assert.deepEqual(before.camera.position, position);
  assert.equal(engine.getEngineFields().visualizer, before.visualizer);
  assert.equal(engine.getAudioResponseDiagnostics().mode, 'legacy');
  assert.equal(calls.meshes[0].materialDisposals, 0);
  engine.discardPreparedPreset(token); engine.dispose();
});

test('shader failure is reported after Three unwinds and old cleanup failure cannot undo a committed scene', async () => {
  const { engine, calls } = fixture('empty', { shaderError: name => name === 'bad-program' });
  engine.start(); await install(engine, 'active');
  const active = engine.getEngineFields();
  const hook = active.renderer.debug.onShaderError;
  await assert.rejects(engine.prepareCompiledPreset(preset('bad-program'), artifact), /GPU program/);
  assert.equal(engine.getEngineFields().visualizer, active.visualizer);
  assert.equal(active.renderer.debug.onShaderError, hook);
  engine.fx.dispose = () => { throw new Error('Cleanup failure'); };
  await install(engine, 'new');
  assert.equal(engine.getEngineFields().visualizer.shader, 'new');
  assert.equal(calls.meshes[0].materialDisposals, 1);
  engine.dispose();
});

test('repeated replacements keep one context and release every obsolete bundle', async () => {
  const { engine, calls } = fixture('empty', { skyboxes: true }); engine.start();
  for (let index = 0; index < 16; index++) {
    await install(engine, `scene-${index}`);
    assert.equal(calls.meshes.filter(item => item.materialDisposals === 0).length, 1);
    assert.equal(calls.backgrounds.filter(item => item.disposals === 0).length, 1);
    assert.equal(calls.composers.filter(item => item.disposals === 0).length, 1);
  }
  assert.equal(engine.getGraphicsDiagnostics().candidatesActivated, 16);
  assert.equal(engine.getGraphicsDiagnostics().contextsCreated, 1);
  assert.equal(engine.getGraphicsDiagnostics().contextsDisposed, 0);
  engine.dispose();
  assert.ok(calls.meshes.every(item => item.materialDisposals === 1));
  assert.ok(calls.backgrounds.every(item => item.disposals === 1));
});

test('partial replacements start with fresh settings and effects rather than inheriting the previous scene', async () => {
  const { engine } = fixture('empty'); engine.start();
  const fresh = fixture('empty').engine; fresh.start();
  await install(fresh, 'plain');
  await install(engine, 'configured', {
    state: { volume_multiplier: 9, audioMappingIntensity: 3 },
    intent: { time_multiplier: 3, power_factor: 2, camTilt: 1, fov: 35, autoRotate: false, autoRotateSpeed: 4 },
    controls: { position0: { x: 2, y: 3, z: 4 }, target0: { x: 1, y: 2, z: 3 }, zoom0: 2 },
    fx: { toneMapping: { method: 2, exposure: 0.4 }, bloom: { enabled: true, strength: 2 },
      passes: { kaleid: true, afterImage: true }, params: { kaleid: { sides: 13 } } },
  });
  engine.state.time = 7; engine.state.currMouse.set(0.3, 0.6, 0);
  engine.pause();
  await install(engine, 'plain');
  assert.deepEqual({ ...engine.toPreset(), state: null }, { ...fresh.toPreset(), state: null });
  assert.equal(engine.state.volume_multiplier, fresh.state.volume_multiplier);
  assert.equal(engine.state.audioMappingIntensity, fresh.state.audioMappingIntensity);
  assert.deepEqual(engine.getEngineFields().camera.up, fresh.getEngineFields().camera.up);
  assert.equal(engine.state.time, 7, 'live time remains session-owned');
  assert.equal(engine.state.currMouse.x, 0.3, 'latest pointer input remains available');
  assert.equal(engine.isRunning(), false);
  engine.dispose(); fresh.dispose();
});

test('trusted candidate setup is verified before program compilation and can reject without affecting active playback', async () => {
  const { engine, calls } = fixture('empty'); engine.start(); await install(engine, 'active');
  const active = engine.getEngineFields().visualizer;
  await assert.rejects(engine.prepareCompiledPreset(preset('bad-config'), artifact, {
    configure() { throw new Error('Missing uniform'); },
  }), /Missing uniform/);
  assert.equal(engine.getEngineFields().visualizer, active);
  assert.equal(calls.meshes[1].materialDisposals, 1);
  const token = await engine.prepareCompiledPreset(preset('configured'), artifact, {
    configure({ visualizer }) { visualizer.mesh.material.fragmentShader = 'trusted pointer shader'; },
  });
  assert.equal(calls.compiledShaders.at(-1), 'trusted pointer shader');
  engine.activatePreparedPreset(token); engine.dispose();
});

test('an omitted replacement background does not inherit the previous scene texture', async () => {
  const { engine, calls } = fixture('empty', { skyboxes: true }); engine.start(); await install(engine, 'active');
  assert.ok(engine.getEngineFields().scene.background);
  const token = await engine.prepareCompiledPreset({ visualizer: { shader: 'no-background' } }, artifact);
  assert.equal(engine.getPreparedSceneFields(token).scene.background, null);
  engine.activatePreparedPreset(token);
  assert.equal(engine.getEngineFields().scene.background, null);
  assert.equal(calls.backgrounds[0].disposals, 1);
  engine.dispose();
});

test('activation presents a paused replacement once without resuming playback', async () => {
  const { engine, calls } = fixture('empty'); engine.start(); await install(engine, 'active'); engine.pause();
  const token = await engine.prepareCompiledPreset(preset('next'), artifact);
  assert.equal(calls.visibleDraws.at(-1), 'active');
  engine.activatePreparedPreset(token);
  assert.equal(calls.visibleDraws.at(-1), 'next');
  assert.equal(engine.isRunning(), false);
  assert.equal(engine.getGraphicsDiagnostics().submittedFrames, 2);
  engine.dispose();
});

test('authored activation time is validated and applied to the first visible frame without advancing audio', async () => {
  const { engine, calls } = fixture('empty'); engine.start(); await install(engine, 'active'); engine.pause();
  engine.state.time = 37;
  const token = await engine.prepareCompiledPreset(preset('next'), artifact);
  assert.throws(() => engine.activatePreparedPreset(token, { time: -1 }), /Invalid activation time/);
  assert.equal(engine.state.time, 37);
  engine.activatePreparedPreset(token, { time: 4 });
  assert.equal(calls.visibleTimes.at(-1), 4);
  assert.equal(engine.state.time, 4);
  assert.equal(engine.isRunning(), false);
  engine.dispose();
});

test('a visible activation failure repaints and retains the previous scene', async () => {
  const options = { failVisible: name => name === 'broken' };
  const { engine, calls } = fixture('empty', options); engine.start(); await install(engine, 'active');
  const events = []; engine.subscribeRenderLifecycle(event => events.push(event.type));
  const token = await engine.prepareCompiledPreset(preset('broken'), artifact);
  assert.throws(() => engine.activatePreparedPreset(token), /Visible frame failed/);
  assert.equal(calls.visibleDraws.at(-1), 'active');
  assert.equal(engine.getEngineFields().visualizer.shader, 'active');
  assert.equal(calls.meshes[0].materialDisposals, 0);
  assert.deepEqual(events, []);
  engine.discardPreparedPreset(token); engine.dispose();
});

test('failure to restore the active frame is a session error rather than a retained candidate failure', async () => {
  const options = {};
  const { engine } = fixture('empty', options); engine.start(); await install(engine, 'active');
  const events = []; engine.subscribeRenderLifecycle(event => events.push(event.type));
  const token = await engine.prepareCompiledPreset(preset('broken'), artifact);
  options.failVisible = () => true;
  assert.throws(() => engine.activatePreparedPreset(token), /could not restore/);
  assert.equal(engine.isRunning(), false);
  assert.deepEqual(events, ['error']);
  engine.dispose();
});
