import {
  Scene,
  SphereGeometry,
  Vector3,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  Timer,
  AudioListener,
  Audio,
  AudioLoader,
  AudioAnalyser,
  CubeTextureLoader,
  Raycaster,
  RGBAFormat,
  UnsignedByteType,
  WebGLRenderTarget,
  SRGBColorSpace,
  NoToneMapping,
  LinearToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  log,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSculptureWithGeometry } from 'shader-park-core';
import { generateshaderparkcode } from './generateshaderparkcode.js';
import effects from './effects.js';
import { reverseAudioBuffer } from './helpers.js';
import { getEmbeddedSkyboxFaces } from './skyboxes.js';

const MAGE_VERSION = '1.1.0';

export class MAGEPreset {
  constructor({
    controls = null,
    settings = null,
    state = null,
    intent = null,
    fx = null,
    visualizer = null,
    audioPath = null,
  } = {}) {
    this.controls = controls;
    this.settings = settings;
    this.state = state;
    this.intent = intent;
    this.fx = fx;
    this.visualizer = visualizer;
    this.audioPath = audioPath;
  }

  static from(input) {
    if (!input) {
      return null;
    }
    if (input instanceof MAGEPreset) {
      return input;
    }

    let data = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch {
        return null;
      }
    }
    if (!data || typeof data !== 'object') {
      return null;
    }

    return new MAGEPreset({
      controls: data.controls ?? null,
      settings: data.settings ?? null,
      state: data.state ?? null,
      intent: data.intent ?? null,
      fx: data.fx ?? null,
      visualizer: data.visualizer ?? null,
      audioPath: data.audioPath ?? data.audio ?? null,
    });
  }
}

class MAGEVisualizer {
  constructor(engine) {
    this.engine = engine;
    this.shaderIndex = -1;
    this.shaders = [];
    this.skyboxPreset = null;
    this.mesh = null;
    this.shader = null;
    this.scale = 10.0;
    this.intersected = false;
    this.clickable = false;
    this.controllingAudio = false;
    this.render_tooltips = true;
    this.centerClickRadiusNdc = 0.35;
  }

  load(options = {shader: null, addToHistory: false, clearHistory: false}) {
    const engine = this.engine;
    if (engine.log) console.log('Loading visualizer... ');

    // Remove old mesh before creating a new sculpture.
    if (this.mesh && engine.scene) {
      engine.scene.remove(this.mesh);
    }

    // If shader input is missing/invalid, generate one.
    let finalShaderCode = null;
    if (typeof options.shader === 'string') {
      finalShaderCode = options.shader;
    } else if (
      shaderCode &&
      typeof shaderCode === 'object' &&
      typeof shaderCode.shader === 'string'
    ) {
      finalShaderCode = shaderCode.shader;
    } else {
      finalShaderCode = generateshaderparkcode('generator_v1.1');
    }
    if (!finalShaderCode) {
      if (engine.log) console.warn('Invalid shader code input; failed to load visualizer.', { shaderCode });
      return null;
    }
    if (options.clearHistory) {
      this.shaders = [];
      this.shaderIndex = -1;
    }
    if (options.addToHistory) {
      this.shaders.push({
        id: engine._idFromShaderCode(finalShaderCode),
        shader: finalShaderCode,
        timestamp: Date.now(),
      });
      this.shaderIndex = this.shaders.length - 1;
      if (engine.log) console.log('Active shaders: ', this.shaders);
    }

    if (engine.log) console.log('Loaded visualizer with shader:', finalShaderCode);
    this.shader = finalShaderCode;
    engine._createMeshes();
    return finalShaderCode;
  }

  previousShader() {
    if (this.shaders.length <= 1) {
      return;
    }
    let nextShader;
    if (this.shaderIndex <= 0) {
      this.engine._showViewportMessage(`Reached first visualizer.`, 25);
      return;
    } else {
      nextShader = this.shaders[this.shaderIndex - 1];
      this.shaderIndex--;
    }
    this.load({ shader: nextShader.shader, addToHistory: false});
    this.engine._showViewportMessage(`Loading previous visualizer...`, 25);
    return;
  }

  nextShader() {
    if (this.shaders.length <= 1) {
      return;
    }
    let nextShader;
    if (this.shaderIndex >= this.shaders.length - 1) {
      this.engine._showViewportMessage(`Reached latest visualizer.`, 25);
      return;
    } else {
      nextShader = this.shaders[this.shaderIndex + 1];
      this.shaderIndex++;
    }
    this.load({ shader: nextShader.shader, addToHistory: false });
    this.engine._showViewportMessage(`Loading next visualizer...`, 25);
    return;
  }
}

// Core runtime for MAGE - responsible for managing Three.js scene, camera, renderer, audio, visualizer state, and more.
export class MAGEEngine {
  constructor(canvas, options = {log: false}) {
    // console log version
    if (options.log) {
      console.log(`Initializing MAGE Engine v${MAGE_VERSION}...`);
    }

    // Optional HTMLCanvasElement to render into. If not provided, a canvas
    // will be created and appended to document.body, matching current behavior.
    this.canvas = canvas || null;
    this.log = options.log || false;

    // Core Three.js objects
    this.scene = null;
    this.renderer = null;
    this.composer = null;
    this.camera = null;
    this.renderTarget = null;
    this.rtScene = null;
    this.rtCamera = null;
    this.controls = null;
    this.clock = null;
    this.listener = null;

    // Audio state (detailed wiring to be migrated from index.js)
    this.audio = null;
    this.reversedAudio = null;
    this.audioAnalyser = null;
    this.audioBuffer = null;
    this.playbackTime = 0;
    this.isReversed = false;

    this.visualizer = new MAGEVisualizer(this);

    this.inputs = {
      currMouse: new Vector3(),
      pointerDown: 0.0,
      currPointerDown: 0.0,
    };

    this.state = {
      time_multiplier: 1.0,
      mouse: new Vector3(),
      currMouse: new Vector3(),
      size: 0.0,
      pointerDown: 0.0,
      pointerDownMultiplier: 0.0,
      currPointerDown: 0.0,
      currAudio: 0.0,
      time: 0.0,
      volume_multiplier: 0.0,
      minimizing_factor: 0.8,
      power_factor: 8.0,
      base_speed: 0.2,
      easing_speed: 0.6,
      camTilt: 0.0,
    };

    this.timeIncreasing = true;
    this.screenShake = this._createScreenShake();
    this.currentPreset = null;

    // Engine Hooks - can be set by external code (e.g. controls.js) to integrate with engine lifecycle and state
    this.onAfterFrame = null;
    this.onPresetLoaded = null;
    this.exportSettingsState = null;
    this.refreshSettingsUI = null;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.viewportToast = {
      el: null,
      visible: false,
      shownAt: 0,
      durationMs: 1000,
      fadeMs: 700,
    };
    this._pendingSkyboxLoad = null;
    // this._previewCaptureQueue = Promise.resolve();
    // this.savedPresets = [];
    // this._presetGalleryWindow = null;

    // Bind render loop so we can use it with requestAnimationFrame
    this._render = this._render.bind(this);
  }

  // PUBLIC API

  start() {
    if (!this.scene) {
      this._createScene();
      this.composer = effects.applyPostProcessing(this.scene, this.renderer, this.camera);
      this._syncSobelResolution();
    }

    this._render();

    if (!this.currentPreset && !this.visualizer.mesh) {
      this._loadDefaultPreset();
    }
  }

  play() {
    if (this.audio && !this.audio.isPlaying) {
      this.audio.play();
    }
  }

  pause() {
    if (this.audio && this.audio.isPlaying) {
      this.audio.pause();
    }
  }

  loadAudio(filePath) {
    const previousVolume = this.audio?.getVolume();

    // pause previous audio
    this.audio?.pause();
    // this.audio?.dispose();
    this.reversedAudio?.pause();
    // this.reversedAudio?.dispose();

    // create an Audio source
    this.audio = new Audio(this.listener);
    this.audio.setVolume(previousVolume || 1.0);
    this.audio.setLoop(false);

    // create reversed audio source
    this.reversedAudio = new Audio(this.listener);
    this.reversedAudio.setVolume(previousVolume || 1.0);
    this.reversedAudio.setLoop(false);

    // create an AudioAnalyser, passing in the sound and desired fftSize
    this.audioAnalyser = new AudioAnalyser(this.audio, 64);

    const audioLoader = new AudioLoader();
    const fileInput = document.getElementById('file');

    // No path: fall back to upload via hidden input
    if (!filePath) {
      if (!fileInput) return;

      fileInput.addEventListener(
        'change',
        event => {
          const reader = new FileReader();
          reader.addEventListener('load', e => {
            this.audioBuffer = e.target.result;
            this.audio.context.decodeAudioData(this.audioBuffer, buffer => {
              this.audio.setBuffer(buffer);
              this.reversedAudio.setBuffer(reverseAudioBuffer(buffer, this.audio.context));
            });
          });
          this.audioFile = event.target.files[0];
          reader.readAsArrayBuffer(this.audioFile);
        },
        { once: true },
      );

      fileInput.click();
      this.audio.autoplay = true;
      return;
    }

    // Path provided: load preset/default audio from URL
    audioLoader.load(
      filePath,
      buffer => {
        this.audio.setBuffer(buffer);
        this.reversedAudio.setBuffer(
          reverseAudioBuffer(buffer, this.listener.context),
        );
      },
      () => {
        // progress callback unused
      },
      () => {
        console.log('No audio found at path', filePath);
      },
    );
  }

  loadPreset(presetInput) {
    const preset = MAGEPreset.from(presetInput);

    if (!preset) {  
      const message = 'Invalid preset input: must be a JSON string, object literal, or MAGEPreset instance.';
      if (this.log) console.warn('[MAGEEngine.loadPreset] ' + message, { input: presetInput });
      return;
    }

    this.currentPreset = preset;

    if (preset.controls) {
      this._loadControls(preset.controls);
    }

    if (preset.visualizer) {
      if (preset.visualizer.skyboxPreset !== undefined && preset.visualizer.skyboxPreset !== null) {
        const normalizedSkybox = this._normalizeSkyboxInput(preset.visualizer.skyboxPreset);
        if (normalizedSkybox) {
          this._loadSkybox(normalizedSkybox);
        } else if (this.log) 
          console.warn('[MAGEEngine.loadPreset] Invalid skyboxPreset input; expected preset id, preset path, or { type, presetId }', { input: preset.visualizer.skyboxPreset });
      }
      if (preset.visualizer.shader) {
        this.visualizer.load({ shader: preset.visualizer.shader, addToHistory: true, clearHistory: true });
      }
      if (typeof preset.visualizer.scale === 'number') {
        this.visualizer.scale = preset.visualizer.scale;
      }
    }

    if (preset.state) {
      this._applyStatePatch(preset.state, { applied: [], warnings: [] });
    }

    if (typeof this.importSettingsState === 'function' && preset.settings) {
      this.importSettingsState(preset.settings);
    }

    if (preset.intent) {
      this._applyCompactIntent(preset.intent);
    }

    if (preset.fx) {
      this._applyCompactFx(preset.fx);
    }

    // if (preset.audioPath) {
    //   this.loadAudio(preset.audioPath);
    // }

    this._syncPostProcessingFromState();
    this._syncSobelResolution();

    if (typeof this.refreshSettingsUI === 'function') {
      this.refreshSettingsUI();
    }

    if (typeof this.onPresetLoaded === 'function') {
      this.onPresetLoaded(preset);
    }

    return preset;
  }

  toPreset({
    includeState = true,
    includeSettings = true,
    includeThumbnail = true,
    thumbnailWidth = 224,
    thumbnailHeight = 224,
    thumbnailType = 'image/png',
    thumbnailQuality = 0.84,
    // trackHistory = true,
    schema = 'compact',
  } = {}) {
    if (this.controls && this.controls.saveState) {
      this.controls.saveState();
    }

    const controlsState = this.controls
      ? {
          target0: this.controls.target0,
          position0: this.controls.position0,
          zoom0: this.controls.zoom0,
        }
      : null;

    const preset = {
      visualizer: {
        shader: this.visualizer.shader,
        skyboxPreset: this.visualizer.skyboxPreset,
        scale: this.visualizer.scale,
        render_tooltips: this.visualizer.render_tooltips,
      },
      controls: controlsState,
    };

    if (includeSettings) {
      try {
        const settings = this.exportSettingsState();
        if (typeof this.exportSettingsState === 'function' && settings) {
          preset.settings = settings;
        }
      } catch (error) {
        console.warn('[MAGEEngine.toPreset] Failed to export settings state', error);
      }
    }

    console.log('Generated preset from current state:', preset);

    if (includeState) {
      preset.state = { ...this.state };
    }

    if (includeThumbnail) {
      const thumbnailDataUrl = this._captureFramePreviewDataUrlSync({
        width: thumbnailWidth,
        height: thumbnailHeight,
        type: thumbnailType,
        quality: thumbnailQuality,
      });
      if (thumbnailDataUrl) {
        preset.thumbnailDataUrl = thumbnailDataUrl;
      }
    }

    if (schema === 'compact') {
      const compact = this._toCompactPreset({ includeState, includeThumbnail, thumbnailDataUrl: preset.thumbnailDataUrl });
      // if (trackHistory) {
      //   this._trackSavedPreset(compact);
      // }
      return compact;
    }

    preset.version = MAGE_VERSION;
    // if (trackHistory) {
    //   this._trackSavedPreset(preset);
    // }

    return preset;
  }

  // getSavedPresets() {
  //   return this.savedPresets.map(entry => this._safeDeepClone(entry));
  // }

  // openSavedPresetsWindow() {
  //   if (typeof window === 'undefined' || typeof window.open !== 'function') {
  //     return null;
  //   }

  //   if (!this._presetGalleryWindow || this._presetGalleryWindow.closed) {
  //     this._presetGalleryWindow = window.open('', 'mage-saved-presets', 'width=560,height=700,resizable=yes,scrollbars=yes');
  //   }

  //   this._renderSavedPresetsWindow();
  //   return this._presetGalleryWindow;
  // }

  async captureFramePreview({
    width = 224,
    height = 126,
    type = 'image/webp',
    quality = 0.84,
  } = {}) {
    if (!this.renderer?.domElement) {
      return null;
    }

    const w = Math.max(1, Number.parseInt(`${width}`, 10) || 224);
    const h = Math.max(1, Number.parseInt(`${height}`, 10) || 126);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      return null;
    }

    context.drawImage(this.renderer.domElement, 0, 0, w, h);
    return await new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), type, quality);
    });
  }

  async captureFramePreviewDataUrl(options = {}) {
    const blob = await this.captureFramePreview(options);
    if (!blob) {
      return null;
    }
    return await this._blobToDataUrl(blob);
  }

  async captureThumbnail(
    presetInput,
    {
      width = 224,
      height = 224,
      settleFrames = 2,
    } = {},
  ) {
    return await MAGEEngine.captureThumbnail(presetInput, {
      width,
      height,
      settleFrames,
    });
  }

  static async captureThumbnail(
    presetInput,
    {
      width = 224,
      height = 224,
      settleFrames = 2,
    } = {},
  ) {
    if (typeof document === 'undefined') {
      return null;
    }

    const w = Math.max(1, Number.parseInt(`${width}`, 10) || 224);
    const h = Math.max(1, Number.parseInt(`${height}`, 10) || 126);

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;

    const thumbnailEngine = new MAGEEngine(offscreenCanvas, { log: false });

    try {
      thumbnailEngine._createScene();
      // Use a fixed pixel ratio for deterministic output across devices.
      thumbnailEngine.renderer.setPixelRatio(1);
      thumbnailEngine._syncViewport(true);

      thumbnailEngine.composer = effects.applyPostProcessing(
        thumbnailEngine.scene,
        thumbnailEngine.renderer,
        thumbnailEngine.camera,
      );
      thumbnailEngine._syncSobelResolution();

      // Normalize interaction-driven runtime behavior for deterministic captures.
      if (thumbnailEngine.controls) {
        thumbnailEngine.controls.enabled = false;
        thumbnailEngine.controls.autoRotate = false;
      }

      const loadedPreset = thumbnailEngine.loadPreset(presetInput);
      if (!loadedPreset) {
        return null;
      }

      // Re-apply postprocessing graph after preset load to ensure pass toggles/settings are reflected.
      thumbnailEngine._syncPostProcessingFromState();

      // Wait for async skybox texture loading so background is present in thumbnail output.
      await thumbnailEngine._waitForPendingSkyboxLoad(2000);

      //use deterministic neutral defaults instead of runtime-derived values.
      thumbnailEngine.state.time = 0.0;
      thumbnailEngine.state.pointerDown = 1.0;
      thumbnailEngine.state.currPointerDown = 1.0;
      
      // increase size by nominal amount to prevent completely flat visualizer output for presets that derive size from audio or interactions.
      thumbnailEngine.state.size += 0.05;

      const frames = Math.max(1, Number.parseInt(`${settleFrames}`, 10) || 2);
      for (let i = 0; i < frames; i += 1) {
        thumbnailEngine._renderSingleFrame();
      }

      return thumbnailEngine._captureFramePreviewDataUrlSync({
        width: w,
        height: h,
        type: 'image/png',
        quality: 1,
      });
    } finally {
      thumbnailEngine._disposeForThumbnailCapture();
      offscreenCanvas.remove();
    }
  }

  async capturePresetPreviewDataUrl(
    presetInput,
    {
      settleFrames = 2,
      width = 224,
      height = 224,
    } = {},
  ) {
    // Backward-compatible alias for deterministic preset capture.
    return await this.captureThumbnail(presetInput, {
      settleFrames,
      width,
      height,
    });
  }

  // async buildPresetPreviewMap(
  //   presets,
  //   {
  //     getId = preset => preset?.id,
  //     onProgress = null,
  //     settleFrames = 2,
  //     width = 224,
  //     height = 224,
  //   } = {},
  // ) {
  //   const result = {};
  //   if (!Array.isArray(presets) || presets.length === 0) {
  //     return result;
  //   }

  //   for (let index = 0; index < presets.length; index += 1) {
  //     const preset = presets[index];
  //     const id = getId(preset, index);
  //     if (id === undefined || id === null) {
  //       continue;
  //     }

  //     const dataUrl = await this.captureThumbnail(preset, {
  //       settleFrames,
  //       width,
  //       height,
  //     });

  //     if (dataUrl) {
  //       result[`${id}`] = dataUrl;
  //     }

  //     if (typeof onProgress === 'function') {
  //       onProgress({ index, total: presets.length, id, hasPreview: Boolean(dataUrl) });
  //     }
  //   }

  //   return result;
  // }

  // Destroys the engine instance and releases resources. After calling this method, the engine should not be used.
  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.context = null;
      this.renderer.domElement = null;
      this.renderer = null;
    } 
    if (this.scene) {
      this.scene.traverse(object => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.scene = null;
    }
    if (this.renderTarget) {
      this.renderTarget.dispose();
      this.renderTarget = null;
    }
    if (this.rtScene) {
      this.rtScene.traverse(object => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }      
      });
      this.rtScene = null;
    }
    if (this.rtCamera) {
      this.rtCamera = null;
    }
    if (this.camera) {
      this.camera = null;
    }
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    if (this.listener) {
      this.listener = null;
    }
    if (this.audio) {
      this.audio.stop();
      this.audio.disconnect();
      this.audio = null;
    }
    if (this.reversedAudio) {
      this.reversedAudio.stop();
      this.reversedAudio.disconnect();
      this.reversedAudio = null;
    }
    if (this.audioAnalyser) {
      this.audioAnalyser = null;
    }
    if (this.visualizer) {
      this.visualizer.mesh = null;
      this.visualizer.shader = null;
      this.visualizer.shaders = [];
    }
    this.state = null;
    this.inputs = null;
    this.screenShake = null;
    this.currentPreset = null;
    // this._previewCaptureQueue = null;
    // this.savedPresets = [];
    // this._presetGalleryWindow = null;

    if (this.log) console.log('MAGE Engine disposed and resources released.');
  }


  // PRIVATE METHODS

  _waitFrames(frameCount = 1) {
    const total = Math.max(1, Number.parseInt(`${frameCount}`, 10) || 1);
    return new Promise(resolve => {
      let remaining = total;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  _waitForPendingSkyboxLoad(timeoutMs = 2000) {
    if (!this._pendingSkyboxLoad) {
      return Promise.resolve();
    }

    const timeout = Math.max(0, Number.parseInt(`${timeoutMs}`, 10) || 0);
    return Promise.race([
      this._pendingSkyboxLoad.catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, timeout)),
    ]);
  }

  _blobToDataUrl(blob) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  _renderSingleFrame() {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }
    this._syncViewport();
    this._syncSobelResolution();
    if (this.composer) {
      this.composer.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _showViewportMessage(message, durationMs = 1000) {
    this._ensureViewportToast();
    if (!this.viewportToast.el) {
      return;
    }

    this.viewportToast.durationMs =
      Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 1000;
    this.viewportToast.shownAt = performance.now();
    this.viewportToast.visible = true;

    this.viewportToast.el.textContent = String(message ?? '');
    this.viewportToast.el.style.opacity = '1';
    this.viewportToast.el.style.display = 'block';
  }

  _hideViewportMessage() {
    this._ensureViewportToast();
    if (!this.viewportToast.el) {
      return;
    }
    this.viewportToast.visible = false;
    this.viewportToast.el.style.opacity = '0';
    this.viewportToast.el.style.display = 'none';
  }

  _syncPostProcessingFromState() {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }

    this.renderer.toneMapping = effects.toneMapping.method;

    if (this.composer) {
      this.composer = effects.applyPostProcessing(this.scene, this.renderer, this.camera, this.composer);
    }

    this._syncSobelResolution();
  }

  _syncSobelResolution() {
    if (!this.renderer || !effects.sobelShader?.shader?.uniforms?.resolution?.value) {
      return;
    }

    const resolution = effects.sobelShader.shader.uniforms.resolution.value;
    const bufferWidth = this.renderer.domElement?.width || Math.max(1, Math.floor(window.innerWidth * window.devicePixelRatio));
    const bufferHeight = this.renderer.domElement?.height || Math.max(1, Math.floor(window.innerHeight * window.devicePixelRatio));
    resolution.x = bufferWidth;
    resolution.y = bufferHeight;
  }

  _toCompactPreset({ includeState = false, includeThumbnail = false, thumbnailDataUrl = null } = {}) {
    const compact = {
      version: MAGE_VERSION,
      visualizer: {
        shader: this.visualizer.shader,
        skyboxPreset: this.visualizer.skyboxPreset,
        scale: this.visualizer.scale,
      },
      controls: this.controls
        ? {
            target0: this.controls.target0,
            position0: this.controls.position0,
            zoom0: this.controls.zoom0,
          }
        : null,
      intent: {
        time_multiplier: this.state.time_multiplier,
        minimizing_factor: this.state.minimizing_factor,
        power_factor: this.state.power_factor,
        pointerDownMultiplier: this.state.pointerDownMultiplier,
        base_speed: this.state.base_speed,
        easing_speed: this.state.easing_speed,
        camTilt: this.state.camTilt,
        autoRotate: this.controls?.autoRotate,
        autoRotateSpeed: this.controls?.autoRotateSpeed,
        fov: this.camera?.fov,
      },
      fx: {
        passOrder: effects.getPassOrder(),
        bloom: {
          enabled: effects.bloom.enabled,
          strength: effects.bloom.settings.strength,
          radius: effects.bloom.settings.radius,
          threshold: effects.bloom.settings.threshold,
        },
        toneMapping: {
          method: effects.toneMapping.method,
          exposure: this.renderer?.toneMappingExposure,
        },
        passes: {
          rgbShift: effects.RGBShift.enabled,
          dot: effects.dotShader.enabled,
          technicolor: effects.technicolorShader.enabled,
          luminosity: effects.luminosityShader.enabled,
          afterImage: effects.afterImagePass.enabled,
          sobel: effects.sobelShader.enabled,
          glitch: effects.glitchPass.enabled,
          colorify: effects.colorifyShader.enabled,
          halftone: effects.halftonePass.enabled,
          gammaCorrection: effects.gammaCorrectionShader.enabled,
          kaleid: effects.kaleidoShader.enabled,
          outputPass: effects.outputPass.enabled,
        },
        params: {
          rgbShift: {
            amount: effects.RGBShift.shader.uniforms.amount.value,
            angle: effects.RGBShift.shader.uniforms.angle.value,
          },
          afterImage: {
            damp: effects.afterImagePass.shader.uniforms.damp.value,
          },
          colorify: {
            color: effects.colorifyShader.color,
          },
          kaleid: {
            sides: effects.kaleidoShader.shader.uniforms.sides.value,
            angle: effects.kaleidoShader.shader.uniforms.angle.value,
          },
        },
      },
    };

    if (includeState) {
      compact.state = { ...this.state };
    }

    if (includeThumbnail && thumbnailDataUrl) {
      compact.thumbnailDataUrl = thumbnailDataUrl;
    }

    return compact;
  }

  _captureFramePreviewDataUrlSync({
    width = 224,
    height = 126,
    type = 'image/png',
    quality = 0.84,
  } = {}) {
    if (!this.renderer?.domElement) {
      return null;
    }

    try {
      // Ensure a fresh frame has been drawn before reading the canvas snapshot.
      this._renderSingleFrame();

      const w = Math.max(1, Number.parseInt(`${width}`, 10) || 224);
      const h = Math.max(1, Number.parseInt(`${height}`, 10) || 126);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) {
        return null;
      }

      context.drawImage(this.renderer.domElement, 0, 0, w, h);
      return canvas.toDataURL(type, quality);
    } catch {
      return null;
    }
  }

  // _trackSavedPreset(preset) {
  //   if (!preset || typeof preset !== 'object') {
  //     return;
  //   }

  //   const cloned = this._safeDeepClone(preset);
  //   cloned._savedAt = new Date().toISOString();
  //   this.savedPresets.push(cloned);
  //   this._renderSavedPresetsWindow();
  // }

  _safeDeepClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  _escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

//   _renderSavedPresetsWindow() {
//     if (!this._presetGalleryWindow || this._presetGalleryWindow.closed) {
//       return;
//     }

//     const doc = this._presetGalleryWindow.document;
//     const items = this.savedPresets
//       .map((preset, index) => {
//         const thumb = typeof preset.thumbnailDataUrl === 'string' ? preset.thumbnailDataUrl : '';
//         const ts = preset._savedAt ? this._escapeHtml(new Date(preset._savedAt).toLocaleString()) : 'unknown';
//         const pretty = this._escapeHtml(JSON.stringify(preset, null, 2));
//         return `
//           <article class="card">
//             <div class="meta">
//               <strong>Preset ${index + 1}</strong>
//               <span>${ts}</span>
//             </div>
//             ${thumb ? `<img class="thumb" src="${thumb}" alt="Preset ${index + 1} thumbnail" />` : '<div class="thumb empty">No thumbnail</div>'}
//             <details>
//               <summary>JSON</summary>
//               <pre>${pretty}</pre>
//             </details>
//           </article>
//         `;
//       })
//       .join('');

//     doc.open();
//     doc.write(`<!doctype html>
// <html>
//   <head>
//     <meta charset="utf-8" />
//     <title>MAGE Saved Presets</title>
//     <style>
//       body { margin: 0; padding: 12px; background: #0f1117; color: #e8ebf2; font-family: Arial, sans-serif; }
//       h1 { margin: 0 0 10px; font-size: 16px; }
//       .list { display: grid; gap: 10px; }
//       .card { border: 1px solid #2f3440; border-radius: 10px; background: #171b24; padding: 10px; }
//       .meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 8px; }
//       .thumb { width: 100%; max-height: 180px; object-fit: contain; border-radius: 8px; border: 1px solid #394153; background: #0b0e14; }
//       .thumb.empty { display: grid; place-items: center; color: #8f98ad; min-height: 120px; }
//       details { margin-top: 8px; }
//       pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; color: #c8cfde; background: #10141c; border-radius: 8px; padding: 8px; }
//     </style>
//   </head>
//   <body>
//     <h1>Saved toPreset Snapshots (${this.savedPresets.length})</h1>
//     <div class="list">${items || '<div class="card">No presets saved yet.</div>'}</div>
//   </body>
// </html>`);
//     doc.close();
//   }

  _applyCompactIntent(intent) {
    if (!intent || typeof intent !== 'object') {
      return;
    }

    this._applyStatePatch(intent, { applied: [], warnings: [] });

    if (this.controls) {
      if (typeof intent.autoRotate === 'boolean') {
        this.controls.autoRotate = intent.autoRotate;
      }
      if (typeof intent.autoRotateSpeed === 'number' && Number.isFinite(intent.autoRotateSpeed)) {
        this.controls.autoRotateSpeed = intent.autoRotateSpeed;
      }
    }

    if (this.camera && typeof intent.fov === 'number' && Number.isFinite(intent.fov)) {
      this.camera.fov = intent.fov;
      this.camera.updateProjectionMatrix();
    }

    if (typeof intent.camTilt === 'number' && Number.isFinite(intent.camTilt) && this.camera) {
      this.camera.up.set(
        Math.sin(intent.camTilt),
        Math.cos(intent.camTilt),
        -Math.sin(intent.camTilt),
      );
    }
  }

  _applyCompactFx(fx) {
    if (!fx || typeof fx !== 'object') {
      return;
    }

    if (Array.isArray(fx.passOrder)) {
      effects.setPassOrder(fx.passOrder);
    }

    if (fx.bloom && typeof fx.bloom === 'object') {
      if (typeof fx.bloom.enabled === 'boolean') effects.bloom.enabled = fx.bloom.enabled;
      if (typeof fx.bloom.strength === 'number' && Number.isFinite(fx.bloom.strength)) effects.bloom.settings.strength = fx.bloom.strength;
      if (typeof fx.bloom.radius === 'number' && Number.isFinite(fx.bloom.radius)) effects.bloom.settings.radius = fx.bloom.radius;
      if (typeof fx.bloom.threshold === 'number' && Number.isFinite(fx.bloom.threshold)) effects.bloom.settings.threshold = fx.bloom.threshold;
    }

    if (fx.toneMapping && typeof fx.toneMapping === 'object') {
      if (typeof fx.toneMapping.method === 'number' && Number.isFinite(fx.toneMapping.method)) {
        effects.toneMapping.method = fx.toneMapping.method;
        if (this.renderer) {
          this.renderer.toneMapping = fx.toneMapping.method;
        }
      }
      if (typeof fx.toneMapping.exposure === 'number' && Number.isFinite(fx.toneMapping.exposure) && this.renderer) {
        this.renderer.toneMappingExposure = fx.toneMapping.exposure;
      }
    }

    if (fx.passes && typeof fx.passes === 'object') {
      if (typeof fx.passes.rgbShift === 'boolean') effects.RGBShift.enabled = fx.passes.rgbShift;
      if (typeof fx.passes.dot === 'boolean') effects.dotShader.enabled = fx.passes.dot;
      if (typeof fx.passes.technicolor === 'boolean') effects.technicolorShader.enabled = fx.passes.technicolor;
      if (typeof fx.passes.luminosity === 'boolean') effects.luminosityShader.enabled = fx.passes.luminosity;
      if (typeof fx.passes.afterImage === 'boolean') effects.afterImagePass.enabled = fx.passes.afterImage;
      if (typeof fx.passes.sobel === 'boolean') effects.sobelShader.enabled = fx.passes.sobel;
      if (typeof fx.passes.glitch === 'boolean') effects.glitchPass.enabled = fx.passes.glitch;
      if (typeof fx.passes.colorify === 'boolean') effects.colorifyShader.enabled = fx.passes.colorify;
      if (typeof fx.passes.halftone === 'boolean') effects.halftonePass.enabled = fx.passes.halftone;
      if (typeof fx.passes.gammaCorrection === 'boolean') effects.gammaCorrectionShader.enabled = fx.passes.gammaCorrection;
      if (typeof fx.passes.kaleid === 'boolean') effects.kaleidoShader.enabled = fx.passes.kaleid;
      if (typeof fx.passes.outputPass === 'boolean') effects.outputPass.enabled = fx.passes.outputPass;
    }

    if (fx.params && typeof fx.params === 'object') {
      if (fx.params.rgbShift && typeof fx.params.rgbShift === 'object') {
        if (typeof fx.params.rgbShift.amount === 'number' && Number.isFinite(fx.params.rgbShift.amount)) {
          effects.RGBShift.shader.uniforms.amount.value = fx.params.rgbShift.amount;
        }
        if (typeof fx.params.rgbShift.angle === 'number' && Number.isFinite(fx.params.rgbShift.angle)) {
          effects.RGBShift.shader.uniforms.angle.value = fx.params.rgbShift.angle;
        }
      }

      if (fx.params.afterImage && typeof fx.params.afterImage === 'object') {
        if (typeof fx.params.afterImage.damp === 'number' && Number.isFinite(fx.params.afterImage.damp)) {
          effects.afterImagePass.shader.uniforms.damp.value = fx.params.afterImage.damp;
        }
      }

      if (fx.params.kaleid && typeof fx.params.kaleid === 'object') {
        if (typeof fx.params.kaleid.sides === 'number' && Number.isFinite(fx.params.kaleid.sides)) {
          effects.kaleidoShader.shader.uniforms.sides.value = fx.params.kaleid.sides;
        }
        if (typeof fx.params.kaleid.angle === 'number' && Number.isFinite(fx.params.kaleid.angle)) {
          effects.kaleidoShader.shader.uniforms.angle.value = fx.params.kaleid.angle;
        }
      }

      if (fx.params.colorify && typeof fx.params.colorify === 'object' && fx.params.colorify.color !== undefined) {
        const colorValue = fx.params.colorify.color;
        if (effects.colorifyShader.color && typeof effects.colorifyShader.color.set === 'function') {
          try {
            effects.colorifyShader.color.set(colorValue);
          } catch {
            // Keep current color if payload is not parseable by three.Color.
          }
        }
      }
    }

    if (this.composer) {
      this.composer = effects.applyPostProcessing(this.scene, this.renderer, this.camera, this.composer);
    }
  }

  _coercePresetInput(presetInput, report) {
    if (presetInput instanceof MAGEPreset) {
      return presetInput;
    }

    if (typeof presetInput === 'string') {
      const trimmed = presetInput.trim();
      if (!trimmed) {
        report.invalid.push('Preset input string is empty.');
        return null;
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          report.invalid.push('Parsed JSON must be an object.');
          return null;
        }
        return parsed;
      } catch (error) {
        report.invalid.push(`Invalid JSON: ${error.message}`);
        return null;
      }
    }

    if (!presetInput || typeof presetInput !== 'object' || Array.isArray(presetInput)) {
      report.invalid.push('Preset input must be a JSON object, object literal, or MAGEPreset instance.');
      return null;
    }

    return presetInput;
  }

  _extractVisualizerPatch(root, report) {
    const visualizerPatch =
      root.visualizer && typeof root.visualizer === 'object' && !Array.isArray(root.visualizer)
        ? { ...root.visualizer }
        : {};

    if (!root.visualizer && (Object.hasOwn(root, 'shader') || Object.hasOwn(root, 'path'))) {
      report.warnings.push('Legacy preset fields detected; mapped top-level shader/path into visualizer.');
    }

    if (!Object.hasOwn(visualizerPatch, 'shader') && typeof root.shader === 'string') {
      visualizerPatch.shader = root.shader;
    }

    if (!Object.hasOwn(visualizerPatch, 'skyboxPreset')) {
      if (Object.hasOwn(root, 'skyboxPreset')) {
        visualizerPatch.skyboxPreset = root.skyboxPreset;
      } else if (typeof root.path === 'string') {
        visualizerPatch.skyboxPreset = root.path;
      }
    }

    if (
      Object.hasOwn(root, 'scale') &&
      !Object.hasOwn(visualizerPatch, 'scale')
    ) {
      visualizerPatch.scale = root.scale;
    }

    return visualizerPatch;
  }

  _extractStatePatch(root, report) {
    const statePatch = {};
    if (root.state && typeof root.state === 'object' && !Array.isArray(root.state)) {
      Object.assign(statePatch, root.state);
    } else if (Object.hasOwn(root, 'state') && root.state !== null) {
      report.invalid.push('state must be an object');
    }

    return statePatch;
  }

  _extractControlsPatch(root, report) {
    if (!root.controls) {
      return null;
    }

    if (typeof root.controls !== 'object' || Array.isArray(root.controls)) {
      report.invalid.push('controls must be an object with target0, position0, and zoom0');
      return null;
    }

    const { target0, position0, zoom0 } = root.controls;

    return {
      target0: target0,
      position0: position0,
      zoom0: zoom0,
    };
  }

  _normalizeSkyboxInput(skyboxInput) {
    if (skyboxInput && typeof skyboxInput === 'object' && !Array.isArray(skyboxInput)) {
      const { type, presetId } = skyboxInput;
      if (type === 'preset' && Number.isInteger(presetId) && presetId >= 0) {
        return { type, presetId };
      }
      return null;
    }

    if (Number.isInteger(skyboxInput) && skyboxInput >= 0) {
      return { type: 'preset', presetId: skyboxInput };
    }

    if (typeof skyboxInput === 'string') {
      const trimmed = skyboxInput.trim();
      if (!trimmed) {
        return null;
      }

      const numeric = Number.parseInt(trimmed, 10);
      if (Number.isInteger(numeric) && `${numeric}` === trimmed && numeric >= 0) {
        return { type: 'preset', presetId: numeric };
      }

      const pathMatch = trimmed.match(/preset(\d+)/i);
      if (pathMatch) {
        const presetId = Number.parseInt(pathMatch[1], 10);
        if (Number.isInteger(presetId) && presetId >= 0) {
          return { type: 'preset', presetId };
        }
      }
    }

    return null;
  }

  _applyStatePatch(statePatch, report) {
    if (!statePatch || typeof statePatch !== 'object') {
      report.missing.push('state');
      return;
    }

    const stateKeys = Object.keys(statePatch);
    if (stateKeys.length === 0) {
      report.missing.push('state');
      return;
    }

    for (const key of stateKeys) {
      if (!Object.hasOwn(this.state, key)) {
        report.warnings.push(`state.${key} is unknown and was ignored`);
        continue;
      }

      const currentValue = this.state[key];
      const incomingValue = statePatch[key];

      if (currentValue instanceof Vector3) {
        report.applied.push(`state.${key}`);
        continue;
      }

      if (typeof currentValue === 'number') {
        this.state[key] = incomingValue;
        report.applied.push(`state.${key}`);
        continue;
      }

      this.state[key] = incomingValue;
      report.applied.push(`state.${key}`);
    }

    if (typeof this.state.time_multiplier !== 'number' || !Number.isFinite(this.state.time_multiplier)) {
      this.state.time_multiplier = 1.0;
      report.warnings.push('state.time_multiplier was invalid after patch; reset to 1.0');
    }
  }

  _summarizePresetReport(report) {
    const parts = [];
    parts.push(report.applied.length ? `Applied ${report.applied.length} field(s)` : 'Applied no fields');
    if (report.missing.length) {
      parts.push(`missing: ${report.missing.join(', ')}`);
    }
    if (report.invalid.length) {
      parts.push(`invalid: ${report.invalid.join(', ')}`);
    }
    if (report.warnings.length) {
      parts.push(`warnings: ${report.warnings.join(', ')}`);
    }
    return parts.join(' | ');
  }

  _resolveSkyboxPath({ type, presetId }) {
    if (type !== 'preset' || typeof presetId !== 'number') {
      // TODO - support custom skybox paths in addition to preset-based ones
      return { resolvedPath: null, skyboxId: -1 };
    } else {
      return { resolvedPath: `../resources/preset${presetId}/`, skyboxId: presetId };
    }
  }

  _getViewportSize() {
    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(
        1,
        Math.floor(
          rect.width || this.canvas.clientWidth || this.canvas.width || 0,
        ),
      );
      const height = Math.max(
        1,
        Math.floor(
          rect.height || this.canvas.clientHeight || this.canvas.height || 0,
        ),
      );
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }

    return {
      width: Math.max(1, Math.floor(window.innerWidth || 1)),
      height: Math.max(1, Math.floor(window.innerHeight || 1)),
    };
  }

  _syncViewport(force = false) {
    if (!this.renderer || !this.camera) {
      return;
    }

    const { width, height } = this._getViewportSize();
    if (!force && width === this.viewportWidth && height === this.viewportHeight) {
      return;
    }

    this.viewportWidth = width;
    this.viewportHeight = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);

    if (this.composer && this.composer.setSize) {
      this.composer.setSize(width, height);
    }

    if (this.renderTarget && this.renderTarget.setSize) {
      this.renderTarget.setSize(
        Math.max(1, Math.floor(width / 4)),
        Math.max(1, Math.floor(height / 4)),
      );
    }

    this._syncSobelResolution();
  }

  _ensureViewportToast() {
    if (this.viewportToast.el && document.body.contains(this.viewportToast.el)) {
      return;
    }

    // Skip toast creation for detached/offscreen canvases used for thumbnail capture.
    if (this.canvas && !this.canvas.isConnected) {
      return;
    }

    const host =
      this.canvas?.parentElement ||
      this.renderer?.domElement?.parentElement ||
      document.body;

    if (host && getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '30',
      pointerEvents: 'none',
      borderRadius: '999px',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      background: 'rgba(8, 12, 16, 0.64)',
      color: '#ffffff',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
      fontSize: '14px',
      fontWeight: '600',
      lineHeight: '1.2',
      letterSpacing: '0.015em',
      whiteSpace: 'nowrap',
      padding: '10px 14px',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
      opacity: '0',
      display: 'none',
      transition: 'opacity 140ms linear',
    });

    host.appendChild(toast);
    this.viewportToast.el = toast;
  }

  _disposeForThumbnailCapture() {
    this._pendingSkyboxLoad = null;

    try {
      this.controls?.dispose?.();
    } catch {
      // no-op
    }

    try {
      this.renderTarget?.dispose?.();
    } catch {
      // no-op
    }

    try {
      this.renderer?.dispose?.();
      this.renderer?.forceContextLoss?.();
    } catch {
      // no-op
    }

    if (this.viewportToast?.el?.parentElement) {
      this.viewportToast.el.parentElement.removeChild(this.viewportToast.el);
    }
    this.viewportToast.el = null;
  }

  _createScene() {
    const { width, height } = this._getViewportSize();

    // initialize scene
    this.scene = new Scene();

    // initialize camera
    this.camera = new PerspectiveCamera(75, width / height, 0.1, 100000);
    this.camera.position.z = 5.5;
    this.camera.lookAt(0, 10, 100);

    // init audio listener
    this.listener = new AudioListener();
    this.camera.add(this.listener);

    // initialize renderer
    const rendererOptions = {};
    if (this.canvas) {
      rendererOptions.canvas = this.canvas;
    }
    this.renderer = new WebGLRenderer(rendererOptions);
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(new Color(1, 1, 1), 0);
    // Match original renderer tone mapping exposure behavior
    this.renderer.toneMappingExposure = effects.toneMapping.exposure;
    this.renderer.outputColorSpace = SRGBColorSpace;

    if (!this.canvas) {
      // Match existing behavior: append the canvas to the body when not provided
      document.body.appendChild(this.renderer.domElement);
    }

    // initialize clock
    this.clock = new Timer();

    // Add mouse controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement, {
      enabledamping: true,
      dampingFactor: 0.25,
      zoomSpeed: 0.5,
      rotateSpeed: 0.5,
    });
    this.controls.enabledamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.2;
    this.controls.saveState();

    this._ensureViewportToast();

    this._syncViewport(true);
  }

  _loadControls(presetControls) {
    if (presetControls && this.controls) {
      const { target0, position0, zoom0 } = presetControls;
      this.controls.target0.copy(target0);
      this.controls.position0.copy(position0);
      this.controls.zoom0 = zoom0;
      this.controls.reset();
    }
  }

  _loadDefaultVisualizer() {
    // SHADER
    this.visualizer.load({ shader: generateshaderparkcode('default'), addToHistory: false });
    this._loadSkybox({ type: 'preset', presetId: 6 });
  }

  _loadDefaultPreset() {
    // const defaultPreset = getEmbeddedPresetById(1);
    // if (defaultPreset) {
    //   const loadedPreset = this.loadPreset(defaultPreset);
    //   if (loadedPreset) {
    //     return loadedPreset;
    //   }
    // }

    this._loadDefaultVisualizer();
    return null;
  }

  _idFromShaderCode(shaderCode) {
    // Simple hash function to generate a unique ID from shader code
    let hash = 0;
    for (let i = 0; i < shaderCode.length; i++) {
      const char = shaderCode.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return `shader_${Math.abs(hash)}`;
  }

  _loadSkybox({type, presetId}) {
    const { resolvedPath, skyboxId } = this._resolveSkyboxPath({ type: type, presetId: presetId });
    if (!resolvedPath) {
      if (this.log) console.log('No valid skybox input provided:', presetId);
      return;
    }

    this.visualizer.skyboxPreset = skyboxId;

    const loader = new CubeTextureLoader();
    const embeddedFaces = getEmbeddedSkyboxFaces(skyboxId);

    const faceUrls = embeddedFaces
      ? [
          embeddedFaces.left,
          embeddedFaces.right,
          embeddedFaces.up,
          embeddedFaces.down,
          embeddedFaces.front,
          embeddedFaces.back,
        ]
      : [
          `${resolvedPath}sky_left.jpg`,
          `${resolvedPath}sky_right.jpg`,
          `${resolvedPath}sky_up.jpg`,
          `${resolvedPath}sky_down.jpg`,
          `${resolvedPath}sky_front.jpg`,
          `${resolvedPath}sky_back.jpg`,
        ];

    this._pendingSkyboxLoad = new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) {
          return;
        }
        settled = true;
        this._pendingSkyboxLoad = null;
        resolve(result);
      };

      const texture = loader.load(
        faceUrls,
        () => finish(true),
        undefined,
        () => finish(false),
      );

      this.scene.background = texture;
    });
  }

  _createMeshes() {
    // add shader to geometry
    const geometry = new SphereGeometry(160, 60, 60);
    this.visualizer.mesh = createSculptureWithGeometry(geometry, this.visualizer.shader, () => {
      return {
        time: this.state.time,
        size: this.state.size,
        pointerDown: this.state.pointerDown,
        mouse: this.state.mouse,
        _scale: this.visualizer.scale,
      };
    });
    this.scene.add(this.visualizer.mesh);

    // Scene and camera for rendering Shader Park
    // Render target for Shader Park output for object picking
    this.renderTarget = new WebGLRenderTarget(
      Math.max(1, Math.floor(this.viewportWidth / 4)),
      Math.max(1, Math.floor(this.viewportHeight / 4)),
      {
      // use quarter res to save frames
      format: RGBAFormat,
      type: UnsignedByteType,
      },
    );
    this.rtScene = new Scene();
    this.rtCamera = this.camera;
    const targetMesh = createSculptureWithGeometry(geometry, this.visualizer.shader, () => {
      return {
        time: this.state.time,
        size: this.state.size,
        pointerDown: this.state.pointerDown,
        mouse: this.state.mouse,
        _scale: this.visualizer.scale,
      };
    });
    this.rtScene.add(targetMesh);

    if (this.log) console.log('Visualizer Loaded!');
  }

  _render() {
    requestAnimationFrame(this._render);
    this._syncViewport();

    const delta = this.clock.getDelta();
    if (!Number.isFinite(this.state.time_multiplier)) {
      this.state.time_multiplier = 1.0;
    }

    // alternates flow of time to prevent animation bugs
    if (this.state.time < 180 && this.timeIncreasing) {
      this.state.time += this.state.time_multiplier * delta;
    } else {
      this.timeIncreasing = false;
      this.state.time -= this.state.time_multiplier * delta;
      if (this.state.time <= 0) {
        this.timeIncreasing = true;
      }
    }

    // // animate tab bar (document.title)
    // const timeCalc = (1 + Math.sin(this.state.time)) * 10 / 2;
    // if (this.audio && this.audio.isPlaying) {
    //   if (timeCalc > 5.0) {
    //     document.title = 'MAGE - Playing Audio...';
    //   } else {
    //     document.title = 'MAGE - Playing Audio';
    //   }
    // } else {
    //   document.title = 'MAGE';
    // }

    // use easing and linear interpolation to smoothly animate mouse effects
    this.state.pointerDown = 0.1 * this.state.currPointerDown + 0.9 * this.state.pointerDown;
    this.state.mouse.lerp(this.state.currMouse, 0.05);

    let bass_input = 0;
    let mid_input = 0;

    // analyze audio using FFT
    if (
      this.audioAnalyser &&
      ((this.audio && this.audio.isPlaying) || (this.reversedAudio && this.reversedAudio.isPlaying))
    ) {
      const freqData = this.audioAnalyser.getFrequencyData();

      // FFT Bucket 2
      const bass_analysis = Math.pow((freqData[2] / 255) * this.state.minimizing_factor, this.state.power_factor);
      bass_input = bass_analysis + delta * this.state.base_speed;

      // TODO: FFT MID AND HIGH - keep existing behavior
      const mid_analysis = Math.pow((freqData[4] / 255) * this.state.minimizing_factor, this.state.power_factor);
      mid_input = mid_analysis + delta * this.state.base_speed;
    }

    // add audio input to states
    const val = Math.sin(this.state.time) * this.state.size * 0.02 + 0.1;
    this.state.currAudio = bass_input + val * this.state.base_speed + delta * this.state.base_speed;
    this.state.size =
      (1 - this.state.easing_speed) * this.state.currAudio +
      this.state.easing_speed * this.state.size +
      this.state.volume_multiplier * 0.01;

    if (bass_input > 0.163) {
      // keep hook for shake behavior
      // this._shake();
      this.controls.update();
    }

    // this.screenShake.update(this.camera);
    this.controls.update();

    // ONLY CHECK PIXEL IF IT INTERSECTS
    const os = this._getOS();
    const isDesktopOS = os === 'Windows' || os === 'Mac OS' || os === 'Linux';
    if (this.controls.enabled && isDesktopOS) {
      const raycaster = new Raycaster();
      raycaster.setFromCamera(this.inputs.currMouse, this.camera);
      const intersects = this.visualizer.mesh ? raycaster.intersectObject(this.visualizer.mesh) : [];
      if (intersects.length > 0) {
        this.visualizer.intersected = true;

        // Render Shader Park material to the render target
        if (this.renderTarget && this.rtScene && this.rtCamera) {
          this.renderer.setRenderTarget(this.renderTarget);
          this.renderer.render(this.rtScene, this.rtCamera);
          this.renderer.setRenderTarget(null); // Reset to default framebuffer

          // Read pixel color from render target
          const pixelBuffer = new Uint8Array(4);
          const hitNdc = intersects[0].point.clone().project(this.camera);
          const w = this.renderTarget.width;
          const h = this.renderTarget.height;
          const x = Math.max(0, Math.min(w - 1, Math.floor((hitNdc.x + 1) * 0.5 * (w - 1))));
          const y = Math.max(0, Math.min(h - 1, Math.floor((hitNdc.y + 1) * 0.5 * (h - 1))));

          this.renderer.readRenderTargetPixels(this.renderTarget, x, y, 1, 1, pixelBuffer);

          // Check if pixel belongs to shader (e.g., non-zero alpha)
          const nearCenter = this._isPointerNearVisualizerCenter(this.visualizer.centerClickRadiusNdc);
          if (pixelBuffer[3] > 0 && nearCenter) {
            this._growVisualizer();
            this.visualizer.clickable = true;
          } else {
            this.visualizer.clickable = false;
          }
        }
      } else {
        this.visualizer.intersected = false;
        this.visualizer.clickable = false;
      }
    }

    if (this.viewportToast.el && this.viewportToast.visible) {
      const elapsedMs = performance.now() - this.viewportToast.shownAt;
      if (elapsedMs <= this.viewportToast.durationMs) {
        this.viewportToast.el.style.opacity = '1';
      } else if (elapsedMs <= this.viewportToast.durationMs + this.viewportToast.fadeMs) {
        const fadeProgress =
          (elapsedMs - this.viewportToast.durationMs) / this.viewportToast.fadeMs;
        this.viewportToast.el.style.opacity = `${Math.max(0, 1 - fadeProgress)}`;
      } else {
        this.viewportToast.visible = false;
        this.viewportToast.el.style.opacity = '0';
        this.viewportToast.el.style.display = 'none';
      }
    }

    if (this.onAfterFrame) {
      this.onAfterFrame(this);
    }

    if (this.composer) {
      this.composer.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _growVisualizer() {
    this.state.size += 0.03 * (1 - this.state.easing_speed + 0.01);
  }

  _isPointerNearVisualizerCenter(maxDistanceNdc = 0.35) {
    if (!this.visualizer?.mesh || !this.camera || !this.inputs?.currMouse) {
      return false;
    }

    const meshCenterNdc = this.visualizer.mesh.position.clone().project(this.camera);
    if (!Number.isFinite(meshCenterNdc.x) || !Number.isFinite(meshCenterNdc.y)) {
      return false;
    }

    const dx = this.inputs.currMouse.x - meshCenterNdc.x;
    const dy = this.inputs.currMouse.y - meshCenterNdc.y;
    const distance = Math.hypot(dx, dy);
    return distance <= Math.max(0.01, Number(maxDistanceNdc) || 0.35);
  }

  _getOS() {
    const userAgent = window.navigator.userAgent;
    const platform = window.navigator?.userAgentData?.platform || window.navigator.platform;
    const macosPlatforms = ['macOS', 'Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
    const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
    const iosPlatforms = ['iPhone', 'iPad', 'iPod'];
    let os = null;

    if (macosPlatforms.indexOf(platform) !== -1) {
      os = 'Mac OS';
    } else if (iosPlatforms.indexOf(platform) !== -1) {
      os = 'iOS';
    } else if (windowsPlatforms.indexOf(platform) !== -1) {
      os = 'Windows';
    } else if (/Android/.test(userAgent)) {
      os = 'Android';
    } else if (/Linux/.test(platform)) {
      os = 'Linux';
    }

    return os;
  }

  _createScreenShake() {
    const self = this;
    return {
      enabled: false,
      _timestampStart: undefined,
      _timestampEnd: undefined,
      _startPoint: undefined,
      _endPoint: undefined,

      update(camera) {
        if (this.enabled === true && camera) {
          const now = Date.now();
          if (this._timestampEnd > now) {
            const interval = (Date.now() - this._timestampStart) / (this._timestampEnd - this._timestampStart);
            this.computePosition(camera, interval);
          } else {
            if (this._startPoint) {
              camera.position.copy(this._startPoint);
            }
            this.enabled = false;
          }
        }
      },

      shake(camera, vecToAdd, milliseconds) {
        this.enabled = true;
        this._timestampStart = Date.now();
        this._timestampEnd = this._timestampStart + milliseconds;
        this._startPoint = new Vector3().copy(camera.position);
        this._endPoint = new Vector3().addVectors(camera.position, vecToAdd);
      },

      computePosition(camera, interval) {
        let position;
        if (interval < 0.4) {
          position = this.getQuadra(interval / 0.4);
        } else if (interval < 0.7) {
          position = this.getQuadra((interval - 0.4) / 0.3) * -0.6;
        } else if (interval < 0.9) {
          position = this.getQuadra((interval - 0.7) / 0.2) * 0.3;
        } else {
          position = this.getQuadra((interval - 0.9) / 0.1) * -0.1;
        }

        camera.position.lerpVectors(this._startPoint, this._endPoint, position);
        self.controls.update();
      },

      getQuadra(t) {
        return 9.436896e-16 + 4 * t - 4 * (t * t);
      },
    };
  }
}
