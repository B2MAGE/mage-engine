import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { initMAGE } from '../dist/mage-engine.js';
const packagedEngine = initMAGE();
const MAGEEffects = packagedEngine.fx.constructor;
packagedEngine.dispose();

// Execute the maintained lifecycle with a deterministic graphics driver. The
// real-browser suite separately verifies real WebGL programs and allocations.
const source = (await readFile(new URL('../js/MAGEEngine.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^const controlTipsImageDataUrl = .*;\r?\n/m, "const controlTipsImageDataUrl = '';\n")
  .replace('export class MAGEEngine', 'class MAGEEngine');

function fixture(initialScene) {
  const scheduled = new Map();
  const calls = { defaultScenes: 0, skyboxes: 0, renders: 0, disposed: 0, losses: 0 };
  let now = 10, nextFrame = 0;
  class Renderer {
    constructor({ canvas }) {
      this.domElement = canvas;
      this.debug = {};
      this.info = { memory: { geometries: 0, textures: 0 }, programs: [] };
    }
    setDrawingBufferSize(width, height) { this.domElement.width = width; this.domElement.height = height; }
    setClearColor() {}
    getDrawingBufferSize(target) { return target.set(this.domElement.width, this.domElement.height); }
    dispose() { calls.disposed++; }
    forceContextLoss() { calls.losses++; }
  }
  class Controls {
    constructor() {
      this.target = new THREE.Vector3(); this.target0 = new THREE.Vector3();
      this.position0 = new THREE.Vector3(); this.zoom0 = 1;
    }
    saveState() {} update() {} dispose() {} reset() {}
  }
  class Visualizer {
    constructor() { this.mesh = null; this.scale = 10; this.shaders = []; }
    load() {
      calls.defaultScenes++;
      this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    }
    getActiveShader() { return 'sphere(1);'; }
  }
  class Effects extends MAGEEffects {
    applyPostProcessing(scene, renderer) {
      return {
        setSize() {}, setPixelRatio() {},
        render() {
          calls.renders++;
          renderer.info.memory.geometries = scene.children.length;
          renderer.info.memory.textures = scene.children.length * 2;
          renderer.info.programs = scene.children.map(() => ({}));
        },
      };
    }
  }
  const dependencies = { ...THREE, WebGLRenderer: Renderer, OrbitControls: Controls,
    AudioListener: THREE.Object3D, MAGEVisualizer: Visualizer, MAGEEffects: Effects,
    Timer: class { reset() {} update() {} getDelta() { return 0.02; } },
    getEmbeddedSkyboxFaces: () => { calls.skyboxes++; return null; },
    performance: { now: () => now }, window: { devicePixelRatio: 1 },
    requestAnimationFrame: callback => { const id = ++nextFrame; scheduled.set(id, callback); return id; },
    cancelAnimationFrame: id => scheduled.delete(id),
  };
  const Engine = new Function(...Object.keys(dependencies), `${source}\nreturn MAGEEngine;`)(...Object.values(dependencies));
  const canvas = { width: 320, height: 180, isConnected: false, getBoundingClientRect: () => ({ width: 320, height: 180 }) };
  const engine = new Engine({ canvas, ...(initialScene === undefined ? {} : { initialScene }) });
  return { engine, calls, frame() {
    now += 20;
    const [id, callback] = scheduled.entries().next().value ?? [];
    scheduled.delete(id); callback?.();
  } };
}

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
