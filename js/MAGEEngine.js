import {
  Scene,
  SphereGeometry,
  Vector3,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  Clock,
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
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSculptureWithGeometry } from 'shader-park-core';
import { generateshaderparkcode } from './generateshaderparkcode.js';
import effects from './effects.js';
import { reverseAudioBuffer } from './helpers.js';

const MAGE_VERSION = '1.1.0';

export class MAGEPreset {
  constructor({
    controls = null,
    settings = null,
    state = null,
    visualizer = null,
    audioPath = null,
  } = {}) {
    this.controls = controls;
    this.settings = settings;
    this.state = state;
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
      visualizer: data.visualizer ?? null,
      audioPath: data.audioPath ?? data.audio ?? null,
    });
  }
}

// Core runtime for MAGE - responsible for managing Three.js scene, camera, renderer, audio, visualizer state, and more.
export class MAGEEngine {
  constructor(canvas) {
    // Optional HTMLCanvasElement to render into. If not provided, a canvas
    // will be created and appended to document.body, matching current behavior.
    this.canvas = canvas || null;

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

    // Visualizer state (mirrors existing index.js structures)
    this.visualizer = {
      skyboxPreset: null,
      mesh: null,
      shader: null,
      scale: 10.0,
      intersected: false,
      clickable: false,
      controllingAudio: false,
      render_tooltips: true,
    };

    this.shaders = [
      'default',
      'dev',
      'og',
      'react',
      'example',
      'test',
      'test2',
      'test3',
    ];

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

    // Optional per-frame hook external code (UI, debug overlays,
    // analytics, etc.) can attach to. Called once at the end of
    // each render loop iteration; engine itself stays UI-agnostic.
    this.onAfterFrame = null;
    this.onPresetLoaded = null;
    this.exportSettingsState = null;
    this.viewportWidth = 0;
    this.viewportHeight = 0;

    // Bind render loop so we can use it with requestAnimationFrame
    this._render = this._render.bind(this);
  }

  // PUBLIC API

  start() {
    if (!this.scene) {
      this._createScene();
      this.composer = effects.applyPostProcessing(this.scene, this.renderer, this.camera);
    }
    if (!this.visualizer.mesh) {
      this._loadDefaultVisualizer();
    }
    this._render();
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
    this.audio?.dispose();
    this.reversedAudio?.pause();
    this.reversedAudio?.dispose();

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

  loadPreset(presetInput, options = {}) {
    const preset = MAGEPreset.from(presetInput);

    if (!preset) {  
      const message = 'Invalid preset input: must be a JSON string, object literal, or MAGEPreset instance.';
      if (options.log !== false) {
        console.warn('[MAGEEngine.loadPreset] ' + message, { input: presetInput });
      }
      return;
    }

    this.currentPreset = preset;

    if (preset.state) {
      this._applyStatePatch(preset.state, { applied: [], warnings: [] });
    }
    
    if (preset.controls) {
      this._loadControls(preset.controls);
    }

    if (preset.visualizer) {
      if (preset.visualizer.skyboxPreset) {
        const normalizedSkybox = this._normalizeSkyboxInput(preset.visualizer.skyboxPreset);
        if (normalizedSkybox) {
          this._loadSkybox(normalizedSkybox);
        } else if (options.log !== false) {
          console.warn('[MAGEEngine.loadPreset] Invalid skyboxPreset input; expected preset id, preset path, or { type, presetId }', { input: preset.visualizer.skyboxPreset });
        }
        if (preset.visualizer.shader) {
          this._loadVisualizer(preset.visualizer.shader);
        }
      }
      if (typeof preset.visualizer.scale === 'number') {
        this.visualizer.scale = preset.visualizer.scale;
      }
    }

    // if (preset.audioPath) {
    //   this.loadAudio(preset.audioPath);
    // }

    if (preset.settings && typeof this.exportSettingsState === 'function') {
      this.importSettingsState(preset.settings);
    }

    this.onPresetLoaded(preset);

    if (options.log !== false) {
      console.info('[MAGEEngine.loadPreset] Preset loaded successfully', { preset });
    }

    return preset;
  }

  // loadPreset(presetInput, options = {}) {
  //   const report = {
  //     success: false,
  //     inputType: Array.isArray(presetInput) ? 'array' : typeof presetInput,
  //     applied: [],
  //     missing: [],
  //     invalid: [],
  //     warnings: [],
  //     message: '',
  //     preset: null,
  //   };

  //   const root = this._coercePresetInput(presetInput, report);
  //   if (!root) {
  //     report.message = this._summarizePresetReport(report);
  //     if (options.log !== false) {
  //       console.warn('[MAGEEngine.loadPreset] ' + report.message, report);
  //     }
  //     return report;
  //   }

  //   const visualizerPatch = this._extractVisualizerPatch(root, report);
  //   const statePatch = this._extractStatePatch(root, report);
  //   const controlsPatch = this._extractControlsPatch(root, report);

  //   const normalizedPreset = new MAGEPreset({
  //     controls: controlsPatch,
  //     settings: root.settings && typeof root.settings === 'object' ? root.settings : null,
  //     state: statePatch,
  //     visualizer: visualizerPatch,
  //     audioPath: typeof root.audioPath === 'string' ? root.audioPath : typeof root.audio === 'string' ? root.audio : null,
  //   });

  //   this.currentPreset = normalizedPreset;
  //   report.preset = normalizedPreset;

  //   const shaderCode = visualizerPatch.shader ?? null;
  //   const skyboxInput = visualizerPatch.skyboxPreset ?? null;

  //   if (typeof visualizerPatch.scale === 'number') {
  //     this.visualizer.scale = visualizerPatch.scale;
  //     report.applied.push('visualizer.scale');
  //   } else if (Object.hasOwn(visualizerPatch, 'scale')) {
  //     report.invalid.push('visualizer.scale must be a finite number');
  //   }


  //   if (skyboxInput) {
  //     const normalizedSkybox = this._normalizeSkyboxInput(skyboxInput);
  //     if (normalizedSkybox) {
  //       this._loadSkybox(normalizedSkybox);
  //       report.applied.push('visualizer.skyboxPreset');
  //     } else {
  //       report.invalid.push('visualizer.skyboxPreset must be a preset id, a preset path, or { type, presetId }');
  //     }
  //   } else {
  //     report.missing.push('visualizer.skyboxPreset');
  //   }

  //   this._applyStatePatch(statePatch, report);

  //   if (typeof shaderCode === 'string' && shaderCode.trim()) {
  //     this._loadVisualizer(shaderCode);
  //     report.applied.push('visualizer.shader');
  //   } else if (!this.visualizer.mesh) {
  //     this._loadDefaultVisualizer();
  //     report.warnings.push('No valid visualizer.shader provided; loaded default visualizer because no mesh was active.');
  //   } else {
  //     report.missing.push('visualizer.shader');
  //   }

  //   if (controlsPatch) {
  //     this._loadControls(controlsPatch);
  //     report.applied.push('controls');
  //   } else {
  //     report.missing.push('controls');
  //   }

  //   report.success = report.invalid.length === 0;
  //   report.message = this._summarizePresetReport(report);

  //   if (typeof this.onPresetLoaded === 'function') {
  //     this.onPresetLoaded(normalizedPreset);
  //   }

  //   if (options.log !== false) {
  //     const logFn = report.invalid.length > 0 ? console.warn : console.info;
  //     logFn('[MAGEEngine.loadPreset] ' + report.message, report);
  //   }

  //   return report;
  // }

  toPreset({ includeState = false, includeSettings = true } = {}) {
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
      },
      controls: controlsState,
    };

    if (includeSettings) {
      try {
        const settings = this.exportSettingsState();
        if (settings) {
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

    preset.version = MAGE_VERSION;

    return preset;
  }

  // PRIVATE METHODS

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
      const width = Math.max(1, Math.floor(rect.width || this.canvas.clientWidth || 0));
      const height = Math.max(1, Math.floor(rect.height || this.canvas.clientHeight || 0));
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
    this.renderer.toneMappingexposure = effects.toneMapping.exposure;
    this.renderer.outputColorSpace = SRGBColorSpace;

    if (!this.canvas) {
      // Match existing behavior: append the canvas to the body when not provided
      document.body.appendChild(this.renderer.domElement);
    }

    // initialize clock
    this.clock = new Clock();

    // Add mouse controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement, {
      enabledamping: true,
      dampingFactor: 0.25,
      zoomSpeed: 0.5,
      rotateSpeed: 0.5,
    });
    this.controls.enabledamping = true;
    // this.controls.autoRotate = this.state.rotate_toggle;
    // this.controls.autoRotateSpeed = this.state.rotate_speed;
    this.controls.saveState();

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
    console.log('Loading visualizer... ');

    // remove old mesh
    if (this.visualizer.mesh && this.scene) {
      this.scene.remove(this.visualizer.mesh);
    }
    
    // SHADER
    this.visualizer.shader = generateshaderparkcode('default');
    this._loadSkybox({ type: 'preset', presetId: 0 });
    this._createMeshes();
  }

  _loadVisualizer(shader_code) {
    console.log('Loading visualizer... ');

    // remove old mesh
    if (this.visualizer.mesh && this.scene) {
      this.scene.remove(this.visualizer.mesh);
    }

    // SHADER
    this.visualizer.shader = shader_code ?? generateshaderparkcode('default');

    this._createMeshes();
  }

  _loadSkybox({type, presetId}) {
    const { resolvedPath, skyboxId } = this._resolveSkyboxPath({ type: type, presetId: presetId });
    if (!resolvedPath) {
      console.log('No valid skybox input provided:', presetId);
      return;
    }

    this.visualizer.skyboxPreset = skyboxId;

    const loader = new CubeTextureLoader();
    loader.setPath(resolvedPath);
    const texture = loader.load([
      'sky_left.jpg',
      'sky_right.jpg',
      'sky_up.jpg',
      'sky_down.jpg',
      'sky_front.jpg',
      'sky_back.jpg',
    ]);
    this.scene.background = texture;
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

    console.log('Visualizer Loaded!');
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
          if (pixelBuffer[3] > 0) {
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
