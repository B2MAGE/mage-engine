import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { initMAGE } from '../../dist/mage-engine.js';
import { normalizeCompiledShader } from '../../dist/compiled-shader.js';
import { normalizeAudioResponseMode, normalizeAudioResponseConfig } from '../../dist/audio-response.js';
import { AudioResponseMapper, SyntheticAudioFrames } from '../../dist/audio-mapping.js';
import { AudioAnalysisSession } from '../../dist/audio-analysis.js';
const packagedEngine = initMAGE();
const MAGEEffects = packagedEngine.fx.constructor;
packagedEngine.dispose();

// Execute the maintained lifecycle with a deterministic graphics driver. The
// real-browser suite separately verifies real WebGL programs and allocations.
const source = (await readFile(new URL('../../js/MAGEEngine.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^const controlTipsImageDataUrl = .*;\r?\n/m, "const controlTipsImageDataUrl = '';\n")
  .replace('export class MAGEEngine', 'class MAGEEngine');

export function fixture(initialScene, options = {}) {
  const scheduled = new Map();
  const calls = { defaultScenes: 0, skyboxes: 0, renders: 0, disposed: 0, losses: 0,
    meshes: [], backgrounds: [], pendingTextures: [], composers: [], candidateDraws: [], visibleDraws: [], visibleTimes: [], compiledShaders: [], programsPolled: 0, fencesDeleted: 0 };
  let now = 10, nextFrame = 0;
  class Renderer {
    constructor({ canvas }) {
      this.domElement = canvas;
      this.debug = {};
      this.info = { memory: { geometries: 0, textures: 0 }, programs: [] };
      this.clearColor = new THREE.Color(); this.target = null;
      this.extensions = { has: () => options.parallel === true };
      const properties = new WeakMap();
      this.properties = { get: material => properties.get(material) };
      this.compile = scene => {
        const materials = new Set();
        scene.traverse(object => {
          if (!object.material) return;
          calls.compiledShaders.push(object.material.fragmentShader);
          materials.add(object.material);
          properties.set(object.material, { currentProgram: { isReady() {
            calls.programsPolled++;
            return options.programReady?.(object.material.name) ?? true;
          } } });
        });
        return materials;
      };
      this.context = { isContextLost: () => options.contextLost === true };
      if (options.fences) Object.assign(this.context, {
        SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, WAIT_FAILED: 4,
        fenceSync: () => ({}), flush() {}, deleteSync: () => calls.fencesDeleted++,
        clientWaitSync: () => options.fenceReady === false ? 0 : 2,
      });
    }
    setDrawingBufferSize(width, height) { this.domElement.width = width; this.domElement.height = height; }
    setClearColor(color) { this.clearColor.set(color); }
    getClearColor(target) { return target.copy(this.clearColor); }
    getClearAlpha() { return 0; }
    getRenderTarget() { return this.target; }
    setRenderTarget(target) { this.target = target; }
    getActiveCubeFace() { return 0; } getActiveMipmapLevel() { return 0; }
    getViewport(target) { return target.set(0, 0, 320, 180); }
    getScissor(target) { return target.set(0, 0, 320, 180); }
    getScissorTest() { return false; }
    setViewport() {} setScissor() {} setScissorTest() {} clear() {}
    getContext() { return this.context; }
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
    loadCompiled(source) {
      this.shader = source;
      this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({ uniforms: { amount: { value: 1 } } }));
      this.mesh.material.name = source;
      const record = { mesh: this.mesh, geometryDisposals: 0, materialDisposals: 0 };
      this.mesh.geometry.addEventListener('dispose', () => record.geometryDisposals++);
      this.mesh.material.addEventListener('dispose', () => record.materialDisposals++);
      calls.meshes.push(record);
    }
    getActiveShader() { return this.shader ?? 'sphere(1);'; }
  }
  class Effects extends MAGEEffects {
    applyPostProcessing(scene, renderer, camera) {
      const state = this.engine.state;
      const composer = {
        passes: [{ camera }], renderToScreen: true, disposals: 0,
        dispose() { this.disposals++; },
        setSize() {}, setPixelRatio() {},
        render() {
          calls.renders++;
          if (this.renderToScreen === false) {
            calls.candidateDraws.push(scene.children[0]?.material?.name);
            if (options.shaderError?.(scene.children[0]?.material?.name)) renderer.debug.onShaderError();
            if (options.failDraw?.(scene.children[0]?.material?.name)) throw new Error('Candidate first frame failed.');
          } else {
            calls.visibleDraws.push(scene.children[0]?.material?.name);
            calls.visibleTimes.push(state.time);
            if (options.failVisible?.(scene.children[0]?.material?.name)) throw new Error('Visible frame failed.');
          }
          renderer.info.memory.geometries = scene.children.length;
          renderer.info.memory.textures = scene.children.length * 2;
          renderer.info.programs = scene.children.map(() => ({}));
        },
      };
      calls.composers.push(composer); return composer;
    }
  }
  class CubeTextureLoader {
    load(urls, success, progress, failure) {
      const texture = new THREE.CubeTexture();
      const record = { texture, disposals: 0 };
      texture.addEventListener('dispose', () => record.disposals++);
      calls.backgrounds.push(record);
      calls.pendingTextures.push({ success, failure });
      if (!options.manualTextures) queueMicrotask(success);
      return texture;
    }
  }
  const dependencies = { ...THREE, WebGLRenderer: Renderer, OrbitControls: Controls,
    AudioListener: THREE.Object3D, MAGEVisualizer: Visualizer, MAGEEffects: Effects, CubeTextureLoader,
    MAGEPreset: { from: value => value }, normalizeCompiledShader, normalizeAudioResponseMode, normalizeAudioResponseConfig,
    AudioResponseMapper, SyntheticAudioFrames, AudioAnalysisSession,
    Timer: class { reset() {} update() {} getDelta() { return 0.02; } },
    getEmbeddedSkyboxFaces: () => { calls.skyboxes++; return options.skyboxes
      ? { left: 'left', right: 'right', up: 'up', down: 'down', front: 'front', back: 'back' } : null; },
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
