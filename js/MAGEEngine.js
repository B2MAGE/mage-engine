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
  BoxGeometry,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDomInputSource, createReactPointerHandlers } from './helpers.js';
import { MAGEVisualizer } from './MAGEVisualizer.js';
import { MAGEPreset } from './MAGEPreset.js';
import { MAGEEffects } from './MAGEFx.js';
import { MAGEPresetDock } from './MAGEPresetDock.js';
import { initControlsUI } from './MAGEFxUI.js';
import { hashSeedString } from './helpers.js';
import { normalizeAudioFeatures, reverseAudioBuffer } from './helpers.js';
import { getEmbeddedSkyboxFaces, getRandomSkyboxId } from './skyboxes.js';

import { createSculptureWithGeometry } from 'shader-park-core';
import { generateshaderparkcode } from './generateshaderparkcode.js';

const controlTipsImageDataUrl = new URL('../resources/controltips.png', import.meta.url).href;


const MAGE_VERSION = '1.1';

/**
 * @typedef {Object} EngineControlSettings
 * @property {boolean} active - Whether to create controls for the engine
 * @property {boolean} integrated - Whether controls are integrated into the viewport (true) or separate (false)
 */

/**
 * @typedef {Object} MAGEOptions
 * @property {HTMLCanvasElement} [canvas] - The canvas element to render into
 * @property {boolean} [log=false] - Enable debug logging
 * @property {EngineControlSettings} [withControls={ active: true, integrated: false }] - Enable scene controls and specify their layout
 * @property {boolean} [autoStart=false] - Automatically start rendering
 */

export class MAGEEngine {
  #engineVersion = MAGE_VERSION;
  #generatorType = 'generator_v' + MAGE_VERSION;
  #uiController = null;
  #canvas = null;
  #scene = null;
  #renderer = null;
  #composer = null;
  #camera = null;
  #renderTarget = null;
  #rtScene = null;
  #rtCamera = null;
  #controls = null;
  #clock = null;
  #listener = null;
  #audio = null;
  #audioFile = null;
  #reversedAudio = null;
  #audioAnalyser = null;
  #audioBuffer = null;
  #playbackTime = 0;
  #isReversed = false;
  #visualizer = null;
  #inputs = null;
  #lastAudioEnergy = 0;
  #state = null;
  #timeIncreasing = true;
  #screenShake = null;
  #currentPreset = null;
  #onAfterFrame = null;
  #onPresetLoaded = null;
  #cameraUpdateHook = null;
  #importSettingsState = null;
  #refreshSettingsUI = null;
  #animationFrameId = null;
  #isDisposed = false;
  #isRunning = false;
  #controlSettings = false;
  #viewportInputBridge = null;
  #windowInputBridge = null;
  #externalInputBridge = null;
  #externalInputUnsubscribe = null;
  #viewportWidth = 0;
  #viewportHeight = 0;
  #presetDock = null;
  #viewportToast = {
    el: null,
    visible: false,
    shownAt: 0,
    durationMs: 1000,
    fadeMs: 700,
  };
  #tooltipUI = {
    element: null,
    visible: false,
    x: 0,
    y: 0,
  };
  #_pendingSkyboxLoad = null;
  #_pendingControls = null;
  #previewMode = false;
  #previewFrameCount = 0;
  #previewFramesTarget = 0;
  #isLowQualityMode = false;
  #fftSize = 2048;
  log = false;
  constructor({ canvas, log = false, autoStart = false, withControls: { active = false, integrated = false } = {}, lowQualityMode = false } = {}) {
    // console log version
    if (log) {
      console.log(`Initializing MAGE Engine v${this.#engineVersion}...`);
      this.log = true;
    }

    this.fx = new MAGEEffects(this);

    // Optional HTMLCanvasElement to render into. If not provided, a canvas
    // will be created and appended to document.body, matching current behavior.
    this.#canvas = canvas || null;
    this.#controlSettings = {
      active: Boolean(active),
      integrated: Boolean(integrated)
    };

    this.#presetDock = null;

    // Core Three.js objects
    this.#scene = null;
    this.#renderer = null;
    this.#composer = null;
    this.#camera = null;
    this.#renderTarget = null;
    this.#rtScene = null;
    this.#rtCamera = null;
    this.#controls = null;
    this.#clock = null;
    this.#listener = null;

    // Audio state (detailed wiring to be migrated from index.js)
    this.#audio = null;
    this.#audioFile = null;
    this.#reversedAudio = null;
    this.#audioAnalyser = null;
    this.#audioBuffer = null;
    this.#playbackTime = 0;
    this.#isReversed = false;

    this.#inputs = {
      currMouse: new Vector3(),
      pointerDown: 0.0,
      currPointerDown: 0.0,
    };

    this.#state = {
      time_multiplier: 1.0,
      mouse: new Vector3(),
      currMouse: new Vector3(),
      size: 0.0,
      pointerDown: 0.0,
      pointerDownMultiplier: 0.0,
      currPointerDown: 0.0,
      currAudio: 0.0,
      currBass: 0.0,
      currMid: 0.0,
      currTreble: 0.0,
      currEnergy: 0.0,
      currCentroid: 0.0,
      currEnergyTrend: 0.5,
      audioMappingIntensity: 1.0,
      time: 0.0,
      volume_multiplier: 0.0,
      minimizing_factor: 0.8,
      power_factor: 8.0,
      base_speed: 0.2,
      easing_speed: 0.6,
      camTilt: 0.0,
      camOrientationMode: 0,
      camOrientationSpeed: 1.0,
    };
    
    this.#visualizer = new MAGEVisualizer(this);

    this.#timeIncreasing = true;
    this.#screenShake = this.#_createScreenShake();
    this.#currentPreset = null;

    // Engine Hooks - can be set by external code (e.g. controls.js) to integrate with engine lifecycle and state
    this.#onAfterFrame = null;
    this.#onPresetLoaded = null;
    this.#cameraUpdateHook = null;
    this.#importSettingsState = null;
    this.#refreshSettingsUI = null;
    this.#viewportWidth = 0;
    this.#viewportHeight = 0;
    this.#viewportToast = {
      el: null,
      visible: false,
      shownAt: 0,
      durationMs: 1000,
      fadeMs: 700,
    };
    this.#_pendingSkyboxLoad = null;
    this.#animationFrameId = null;
    this.#isDisposed = false;
    this.#isRunning = false;

    if (this.#controlSettings.active) {
      this.start();
      this.initControls();
      if (this.#controlSettings.integrated) {
        this.showIntegratedControls();
      }
    } else if (autoStart) {
      this.start();
    }

    if (lowQualityMode) {
      this.#isLowQualityMode = true;
    }

    // this._previewCaptureQueue = Promise.resolve();
    // this.savedPresets = [];
    // this._presetGalleryWindow = null;
  }

  // Getters and Setters
  get activeShader() {
    return this.#visualizer.getActiveShader();
  }

  set activeShader(shader) {
    try {
      createSculptureWithGeometry(new BoxGeometry(1, 1, 1), shader);
    } catch (error) {
      console.error('Failed to set active shader: shader code is invalid and failed to compile.', error);
      throw new Error(`Failed to set active shader: shader code is invalid and failed to compile. Error: ${error.message}`);
      return;
    }
    this.#visualizer.load({ shader: shader, addToHistory: true, clearHistory: false });
    this.#_updateVisualizer();
  }

  set fftSize(size) {
    this.#fftSize = Number.parseInt(`${size}`, 2048) || 2048;
  }

  get fftSize() {
    return this.#fftSize;
  }

  get state() {
    return this.#state;
  }

  // return normalized audio data with easing applied, suitable for passing to shaders; if audio is not loaded, returns default values
  get audioState() {
    if (!this.#state) {
      return {
        bass: 0,
        mid: 0,
        treble: 0,
        energy: 0,
        centroid: 0,
        energyTrend: 0.5,
        currAudio: 0,
      };
    }

    return {
      bass: this.#state.currBass ?? 0,
      mid: this.#state.currMid ?? 0,
      treble: this.#state.currTreble ?? 0,
      energy: this.#state.currEnergy ?? 0,
      centroid: this.#state.currCentroid ?? 0,
      energyTrend: this.#state.currEnergyTrend ?? 0.5,
      audioMappingIntensity: this.#state.audioMappingIntensity ?? 1,
      currAudio: this.#state.currAudio ?? 0,
    };
  }

  set generatorType(type) {
    if (typeof type !== 'string' || !type.startsWith('generator_')) {
      console.warn(`Invalid generator type: ${type}. Must be a string starting with 'generator_'.`);
      return;
    }
    this.#generatorType = type;
  }

  get generatorType() {
    return this.#generatorType;
  }
  
  set state(state) {
    this.#state = state;
  }

  get glitchPassTrigger() {
    if (this.#visualizer.isLegacyShader()) {
      return this.#state.size;
    } else {
      return this.#state.bass;
    }
  }

  /**
   * Enables preview mode for a preset. The engine will load the preset, simulate audio input for N frames to demonstrate the visualizer, then automatically reset.
   * @param {MAGEPreset} preset - The preset to preview.
   * @param {number} [frameCount=120] - Number of frames to preview (default 120 = ~2 seconds at 60fps).
   * @returns {void}
   */
  enablePreviewMode(preset, frameCount = 120) {
    this.#previewMode = true;
    this.#previewFrameCount = 0;
    this.#previewFramesTarget = Math.max(1, Number.parseInt(`${frameCount}`, 10) || 120);
    this.loadPreset(preset);
  }

  static previewPreset(canvas, preset, frameCount = 120) {
    const previewInstance = new MAGEEngine({
      canvas: canvas,
      log: false,
      autoStart: true,
      withControls: { active: false, integrated: false },
      presetPreview: preset,
    });
    previewInstance.enablePreviewMode(preset, frameCount);
    return previewInstance;
  }

  /**
   * Disables preview mode and resets the engine state.
   * @returns {void}
   */
  disablePreviewMode() {
    this.#previewMode = false;
    this.#previewFrameCount = 0;
    this.#previewFramesTarget = 0;
  }
  /**
   * Simulates audio input for preview mode. Generates a synthetic FFT-like pattern to demonstrate visualizer reactivity.
   * @private
   */
  #_simulatePreviewAudio() {
    const shaderCode = this.activeShader;

    if (!this.#state) {
      console.warn('Cannot simulate preview audio: engine state not initialized.');
      return;
    }

    // Simulate a sine wave modulated by frame count for dynamic visual feedback.
    const t = this.#previewFrameCount / this.#previewFramesTarget;
    const bass = Math.sin(t * Math.PI * 3.5) * 0.65 + 0.2; // oscillates between 0.2 and 0.7
    const mid = Math.sin(t * Math.PI * 2.2) * 0.45 + 0.25;
    const treble = Math.sin(t * Math.PI * 1.8) * 0.4 + 0.35;

    const bass_analysis = Math.pow(bass * this.#state.minimizing_factor, this.#state.power_factor);

    const isLegacyShader = this.#visualizer.isLegacyShader();
    const isAudioReactive = this.#visualizer.hasAudioInputs();

    // Apply audio parameters with easing; size stays independent.
    const mix = 1 - this.#state.easing_speed;
    if (isAudioReactive && !isLegacyShader) {
      this.#state.currBass += (bass - this.#state.currBass) * mix;
      this.#state.currMid += (mid - this.#state.currMid) * mix;
      this.#state.currTreble += (treble - this.#state.currTreble) * mix;
      this.#state.currAudio = this.#state.currBass;
    } else if (isLegacyShader) {
      // modulate size only for preview audio to demonstrate audio reactivity without affecting visualizer parameters that may be mapped to size
      this.#state.currAudio = bass_analysis + Math.sin(t) * this.#state.size * 0.1 + 0.05
      this.#state.size =
      (1 - this.#state.easing_speed) * this.#state.currAudio +
      this.#state.easing_speed * this.#state.size +
      this.#state.volume_multiplier * 0.01;
    } else {
      console.warn('Preview mode active but shader does not declare audio inputs. Simulated audio will not affect visualizer.');
    }
  }

  /**
   * Initializes the MAGE Engine, creating the Three.js scene, camera, renderer, and other core components.
   * @return {void}
   */
  start() {
    if (this.#isRunning) {
      return;
    }
    if (this.#isDisposed) {
      console.warn('Attempted to start MAGEEngine after it was disposed. This instance cannot be restarted.');
      return;
    }
    this.#isRunning = true;

    if (!this.#scene) {
      this.#_createScene();
      this.#composer = this.fx.applyPostProcessing(this.#scene, this.#renderer, this.#camera);
      this.#_syncSobelResolution();
    }

    this.#_render();

    if (!this.#currentPreset && !this.#visualizer.mesh) {
      this.#_loadDefaultPreset();
    }
  }

  #_updateAudioState(freqData) {
    if (!this.#state) {
      return;
    }
    const shaderCode = this.activeShader;
    const hasLegacyInputs = shaderCode && shaderCode.includes('let size = input()');

    const normalizedAudio = normalizeAudioFeatures(freqData, this.#lastAudioEnergy);

    const bass_analysis = Math.pow(normalizedAudio.bass * this.#state.minimizing_factor, this.#state.power_factor);
    const mid_analysis = Math.pow(normalizedAudio.mid * this.#state.minimizing_factor, this.#state.power_factor);
    const treble_analysis = Math.pow(normalizedAudio.treble * this.#state.minimizing_factor, this.#state.power_factor);

    this.#lastAudioEnergy = normalizedAudio.energy;

    const mix = 1 - this.#state.easing_speed;

    if (hasLegacyInputs) {
      // modulate size only for legacy shaders to allow newer shaders to take full advantage 
      // of audio features without being limited by size mappings, while still providing 
      // audio reactivity for older shaders that may rely on size input
      this.#state.currAudio = bass_analysis + Math.sin(this.#state.time) * this.#state.size * 0.1 + 0.05
      this.#state.size =
      (1 - this.#state.easing_speed) * this.#state.currAudio +
      this.#state.easing_speed * this.#state.size +
      this.#state.volume_multiplier * 0.01;
    } else {
      this.#state.currBass += (bass_analysis - this.#state.currBass) * mix;
      this.#state.currMid += (mid_analysis - this.#state.currMid) * mix;
      this.#state.currTreble += (treble_analysis - this.#state.currTreble) * mix;
      this.#state.currEnergy += (normalizedAudio.energy - this.#state.currEnergy) * mix;
      this.#state.currCentroid += (normalizedAudio.centroid - this.#state.currCentroid) * mix;
      this.#state.currEnergyTrend += (normalizedAudio.energyTrend - this.#state.currEnergyTrend) * mix;
    }

    this.#state.currAudio = this.#state.currBass;
  }

  /**
   * Randomizes the visualizer shader
   * @returns {void}
   *  
  */
  randomizeVisualizer() {
      this.#visualizer.load({ addToHistory: true, clearHistory: false, generator: 'generator_v1.1' });
      this.#_updateVisualizer();
  }

  randomizeEffects() {
    this.fx.randomizeSettings();
  }

  /**
   * Returns the duration of the currently loaded audio in seconds. If no audio is loaded, returns 0.
   * @return {number} Duration of the currently loaded audio in seconds, or 0 if no audio is loaded.
   */
  getAudioDuration() {
    if (!this.#audio || !this.#audio.buffer) {
      return 0;
    }
    const duration = Number(this.#audio.buffer.duration);
    return Number.isFinite(duration) ? duration : 0;
  }

  /**
   * Returns the current playback time of the audio in seconds, accounting for play/pause state and any seeking. If no audio is loaded, returns 0.
   * @returns {number} Current playback time of the audio in seconds, or 0 if no audio is loaded.
   */
  getAudioTime() {
    return this.#playbackTime;
  }

  /**
   * Seeks to a specific time in the audio.
   * @param {number} time - The time to seek to, in seconds.
   * @returns {boolean} True if the seek was successful, false otherwise.
   */
  seek(time) {
    const duration = this.getAudioDuration();
    if (duration <= 0) {
      return false;
    }

    const clampedTime = Math.max(0, Math.min(time, duration));
    this.#playbackTime = clampedTime;

    const forwardWasPlaying = Boolean(this.#audio.isPlaying);
    const reverseWasPlaying = Boolean(this.#reversedAudio?.isPlaying);

    this.#audio.offset = clampedTime;

    if (this.#reversedAudio?.buffer) {
      const reversedTime = Math.max(0, Math.min(duration - clampedTime, this.#reversedAudio.buffer.duration));
      this.#reversedAudio.offset = reversedTime;
    }

    if (forwardWasPlaying) {
      this.#audio.stop();
    }
    if (reverseWasPlaying && this.#reversedAudio) {
      this.#reversedAudio.stop();
    }

    if (forwardWasPlaying && reverseWasPlaying) {
      if (this.#isReversed && this.#reversedAudio?.buffer) {
        this.#reversedAudio.play();
      } else {
        this.#audio.play();
      }
    } else if (forwardWasPlaying) {
      this.#audio.play();
    } else if (reverseWasPlaying && this.#reversedAudio?.buffer) {
      this.#reversedAudio.play();
    }

    return true;
  }

  /**
   * Scrubs the audio to a specific time.
   * @param {number} time - The time to scrub to, in seconds.
   * @returns {boolean} True if the scrub was successful, false otherwise.
   */
  scrubAudio(time) {
    return this.seek(time);
  }

  /**
   * Plays the currently loaded audio if it is not already playing. If no audio is loaded, this method does nothing.
   * @returns {void}
   */
  play() {
    if (!this.isAudioLoaded()) {
      return;
    }
    if (this.#audio && !this.#audio.isPlaying) {
      this.#audio.play();
    }
  }

  /**
   * Pauses the currently playing audio. If no audio is loaded or if the audio is already paused, this method does nothing.
   * @return {void}
   */
  pause() {
    if (this.#audio?.isPlaying) {
      this.#audio.pause();
    }
    if (this.#reversedAudio?.isPlaying) {
      this.#reversedAudio.pause();
    }
  }

  /**
   * Returns whether audio is currently loaded in the engine. This checks for the presence of an audio buffer in either the forward or reversed audio sources, 
   * or a standalone audioBuffer (used for file uploads).
   * @returns 
   */
  isAudioLoaded() {
    return Boolean(this.#audio?.buffer || this.#reversedAudio?.buffer || this.#audioBuffer);
  }

  /**
   * Loads audio from a file path or uploads a file.
   * @param {string} [filePath] - The path to the audio file to load.
   * @returns {void}
   */
  loadAudio(filePath) {
    const previousVolume = this.#audio?.getVolume();

    // pause previous audio
    this.#audio?.pause();
    // this.#audio?.dispose();
    this.#reversedAudio?.pause();
    // this.#reversedAudio?.dispose();

    // create an Audio source
    this.#audio = new Audio(this.#listener);
    this.#audio.setVolume(previousVolume || 1.0);
    this.#audio.setLoop(false);

    // create reversed audio source
    this.#reversedAudio = new Audio(this.#listener);
    this.#reversedAudio.setVolume(previousVolume || 1.0);
    this.#reversedAudio.setLoop(false);

    // create an AudioAnalyser, passing in the sound and desired fftSize
    this.#audioAnalyser = new AudioAnalyser(this.#audio, this.#fftSize || 2048);

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
            this.#audioBuffer = e.target.result;
            this.#audio.context.decodeAudioData(this.#audioBuffer, buffer => {
              this.#audio.setBuffer(buffer);
              this.#reversedAudio.setBuffer(reverseAudioBuffer(buffer, this.#audio.context));
            });
          });
          this.#audioFile = event.target.files[0];
          reader.readAsArrayBuffer(this.#audioFile);
        },
        { once: true },
      );

      fileInput.click();
      return;
    }

    // Path provided: load preset/default audio from URL
    audioLoader.load(
      filePath,
      buffer => {
        this.#audio.setBuffer(buffer);
        this.#reversedAudio.setBuffer(
          reverseAudioBuffer(buffer, this.#listener.context),
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

  /**
   * Loads a preset into the engine.
   * @param {MAGEPreset} presetInput - The preset input to load.
   * @returns {MAGEPreset} The loaded preset.
   */
  loadPreset(presetInput) {
    const preset = MAGEPreset.from(presetInput);

    if (!preset) {
      const message = 'Invalid preset input: must be a JSON string, object literal, or MAGEPreset instance.';
      if (this.log) console.warn('[MAGEEngine.loadPreset] ' + message, { input: presetInput });
      return;
    }

    this.#currentPreset = preset;

    if (preset.controls) {
      if (this.#controls) {
        this.#_loadControls(preset.controls);
      } else {
        // controls not created yet (preset loaded before start()); apply later in _createScene
        this.#_pendingControls = preset.controls;
      }
    }

    if (preset.visualizer) {
      if (preset.visualizer.skyboxPreset !== undefined && preset.visualizer.skyboxPreset !== null) {
        const normalizedSkybox = this.#_normalizeSkyboxInput(preset.visualizer.skyboxPreset);
        if (normalizedSkybox) {
          this.loadSkybox(normalizedSkybox);
        } else if (this.log)
          console.warn('[MAGEEngine.loadPreset] Invalid skyboxPreset input; expected preset id, preset path, or { type, presetId }', { input: preset.visualizer.skyboxPreset });
      }
      if (preset.visualizer.seed) {
        this.#visualizer.load({ seed: preset.visualizer.seed, addToHistory: true, clearHistory: true });
        this.#_updateVisualizer();
      }
      // support legacy presets with shader field instead of seed
      if (preset.visualizer.shader) {
        this.#visualizer.load({ shader: preset.visualizer.shader, addToHistory: true, clearHistory: true });
        this.#_updateVisualizer();
      }
      if (typeof preset.visualizer.scale === 'number') {
        this.#visualizer.scale = preset.visualizer.scale;
      }
    }

    if (preset.state) {
      this.#_applyStatePatch(preset.state, { applied: [], warnings: [] });
    }

    if (typeof this.#importSettingsState === 'function' && preset.settings) {
      this.#importSettingsState(preset.settings);
    }

    if (preset.intent) {
      this.#_applyCompactIntent(preset.intent);
    }

    if (preset.fx) {
      this.#_applyCompactFx(preset.fx);
    }

    // if (preset.audioPath) {
    //   this.loadAudio(preset.audioPath);
    // }

    this.#_syncPostProcessingFromState();
    this.#_syncSobelResolution();

    if (typeof this.#refreshSettingsUI === 'function') {
      this.#refreshSettingsUI();
    }

    if (typeof this.#onPresetLoaded === 'function') {
      this.#onPresetLoaded(preset);
    }

    if (this.#controlSettings.active) {
      this.#controls.enabled = true;
    } else {
      this.#controls.enabled = false;
    }
    this.#_updateVisualizer();
    return preset;
  }

  /**
   * Swaps the current canvas with a new one.
   * @param {HTMLCanvasElement} newCanvas - The new canvas element to use.
   */
  swapCanvas(newCanvas) {
    if (this.#renderer) {
      this.#renderer.domElement.remove();
      this.#renderer.dispose();
      this.#renderer = null;
    }

    this.#canvas = newCanvas;
    this.#_createRenderer();
    if (this.#scene && this.#camera) {
      this.#composer = this.fx.applyPostProcessing(this.#scene, this.#renderer, this.#camera, this.#composer);
      this.#_syncSobelResolution();
    }
  }

  /**
   * Toggles fullscreen mode for the engine's canvas. If the canvas is not currently in fullscreen, it will request fullscreen. If it is already in fullscreen, it will exit fullscreen.
   * Note: Fullscreen behavior may vary across browsers and may require user interaction to trigger. This method does not handle browser-specific fullscreen API differences or 
   * potential errors that may arise from fullscreen requests.
   * @returns {void}
   */
  toggleFullscreen() {
    if (!this.#canvas) {
      return;
    }
    if (!document.fullscreenElement) {
      this.#canvas.requestFullscreen().catch(err => {
        console.error('Error attempting to enable fullscreen mode:', err);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.error('Error attempting to exit fullscreen mode:', err);
      });
    }
  }

  /**
   * Return the engine time from state
   * @returns {number} The engine time.
   */
  getEngineTime() {
    return this.#state.time;
  }

  /**
   * Exports the current engine configuration as a preset object. The exported preset can include the current state, custom settings, and visualizer configuration, 
   * depending on the specified options.
   * @returns {MAGEPreset} The exported preset as a MAGEPreset instance or a compact object depending on the specified schema.
   */
  toPreset() {
    // map current controls to internal THREE.js field
    this.#controls.saveState();

    const preset = {
      version: MAGE_VERSION,
      visualizer: {
        seed : this.#visualizer.seed,
        shader : this.activeShader,
        skyboxPreset: this.#visualizer.skyboxPreset,
        scale: this.#visualizer.scale,
      },
      controls: this.#controls
        ? {
          target0: this.#controls.target0,
          position0: this.#controls.position0,
          zoom0: this.#controls.zoom0,
        }
        : null,
      intent: {
        time_multiplier: this.#state.time_multiplier,
        minimizing_factor: this.#state.minimizing_factor,
        power_factor: this.#state.power_factor,
        pointerDownMultiplier: this.#state.pointerDownMultiplier,
        base_speed: this.#state.base_speed,
        easing_speed: this.#state.easing_speed,
        camTilt: this.#state.camTilt,
        camOrientationMode: this.#state.camOrientationMode,
        camOrientationSpeed: this.#state.camOrientationSpeed,
        autoRotate: this.#controls?.autoRotate,
        autoRotateSpeed: this.#controls?.autoRotateSpeed,
        fov: this.#camera?.fov,
      },
      fx: {
        passOrder: this.fx.getPassOrder(),
        bloom: {
          enabled: this.fx.bloom.enabled,
          strength: this.fx.bloom.settings.strength,
          radius: this.fx.bloom.settings.radius,
          threshold: this.fx.bloom.settings.threshold,
        },
        toneMapping: {
          method: this.fx.toneMapping.method,
          exposure: this.#renderer?.toneMappingExposure,
        },
        passes: {
          rgbShift: this.fx.RGBShift.enabled,
          dot: this.fx.dotShader.enabled,
          technicolor: this.fx.technicolorShader.enabled,
          luminosity: this.fx.luminosityShader.enabled,
          afterImage: this.fx.afterImagePass.enabled,
          sobel: this.fx.sobelShader.enabled,
          glitch: this.fx.glitchPass.enabled,
          colorify: this.fx.colorifyShader.enabled,
          halftone: this.fx.halftonePass.enabled,
          gammaCorrection: this.fx.gammaCorrectionShader.enabled,
          kaleid: this.fx.kaleidoShader.enabled,
          outputPass: this.fx.outputPass.enabled,
        },
        params: {
          rgbShift: {
            amount: this.fx.RGBShift.shader.uniforms.amount.value,
            angle: this.fx.RGBShift.shader.uniforms.angle.value,
          },
          afterImage: {
            damp: this.fx.afterImagePass.shader.uniforms.damp.value,
          },
          colorify: {
            color: this.fx.colorifyShader.color,
          },
          kaleid: {
            sides: this.fx.kaleidoShader.shader.uniforms.sides.value,
            angle: this.fx.kaleidoShader.shader.uniforms.angle.value,
          },
        },
      },
    };

    preset.state = { ...this.#state };

    if (this.log) {
      console.log('Generated preset from current state:', preset);
    }
    return preset;
  }

  showViewportMessage(message, durationMs = 1000) {
    this.#_ensureViewportToast();
    if (!this.#viewportToast.el) {
      return;
    }

    this.#viewportToast.durationMs =
      Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 1000;
    this.#viewportToast.shownAt = performance.now();
    this.#viewportToast.visible = true;

    this.#viewportToast.el.textContent = String(message ?? '');
    this.#viewportToast.el.style.opacity = '1';
    this.#viewportToast.el.style.display = 'block';
  }

  /**
   * Applies externally managed input state for this frame.
   * Calling this method automatically activates external input mode.
   * @param {Object} inputState
   * @returns {void}
   */
  setInputState(inputState = {}) {
    if (!this.#externalInputBridge) {
      this.#externalInputBridge = this.#_createInputBridgeState(this.#viewportInputBridge);
    }
    this.#_applyInputStatePatch(this.#externalInputBridge, inputState);
    this.#viewportInputBridge = this.#externalInputBridge;
  }

  /**
   * Attaches an external input source. The source can expose either:
   * - getState(): Object
   * - subscribe(handler): () => void
   * @param {Object} inputSource
   * @returns {void}
   */
  attachInputSource(inputSource = null) {
    this.detachInputSource();

    this.#externalInputBridge = this.#_createInputBridgeState(this.#viewportInputBridge);
    this.#viewportInputBridge = this.#externalInputBridge;

    if (inputSource && typeof inputSource === 'object') {
      if (typeof inputSource.onToggleUI === 'function') {
        this.#externalInputBridge.onToggleUI = inputSource.onToggleUI;
      }
      if (typeof inputSource.onHideQuickPresets === 'function') {
        this.#externalInputBridge.onHideQuickPresets = inputSource.onHideQuickPresets;
      }
      if (typeof inputSource.onUpdateTooltip === 'function') {
        this.#externalInputBridge.onUpdateTooltip = inputSource.onUpdateTooltip;
      }
      if (typeof inputSource.detach === 'function') {
        this.#externalInputBridge.detach = inputSource.detach;
      }
    }

    if (!inputSource || typeof inputSource !== 'object') {
      return;
    }

    if (typeof inputSource.getState === 'function') {
      const snapshot = inputSource.getState();
      this.#_applyInputStatePatch(this.#externalInputBridge, snapshot);
    }

    if (typeof inputSource.subscribe === 'function') {
      const unsubscribe = inputSource.subscribe(nextState => {
        this.#_applyInputStatePatch(this.#externalInputBridge, nextState);
      });

      if (typeof unsubscribe === 'function') {
        this.#externalInputUnsubscribe = unsubscribe;
      }
    }
  }

  /**
   * Detaches any external input source and returns to internal window input listeners.
   * @returns {void}
   */
  detachInputSource() {
    if (typeof this.#externalInputUnsubscribe === 'function') {
      this.#externalInputUnsubscribe();
    }
    this.#externalInputUnsubscribe = null;
    this.#externalInputBridge = null;

    if (this.#windowInputBridge) {
      this.#viewportInputBridge = this.#windowInputBridge;
    }
  }

  /**
   * Captures a thumbnail for the current visualizer and returns it as a data URL. 
   * This is a convenience method that wraps captureFramePreviewBlob and converts the resulting Blob to a data URL.
   * @param {CaptureFramePreviewOptions} options 
   * @returns {Promise<string|null>} A data URL representing the captured thumbnail, or null if the capture failed.
   */
  async captureFramePreview({
    width = 224,
    height = 224,
    type = 'image/png',
    quality = 0.84,
  } = {}) {
    const blob = await this.#_captureFramePreviewBlob({ width, height, type, quality });
    if (!blob) {
      return null;
    }
    return await this.#_blobToDataUrl(blob);
  }

  /**
   * Captures a thumbnail for the given preset. Prefer using current engine state and captureFramePreview when possible, but this method can be used to capture a thumbnail 
   * for any preset without affecting the current engine state.
   * @param {MAGEPreset} presetInput 
   * @param {CaptureThumbnailOptions} options 
   * @returns {Promise<string|null>} A data URL representing the captured thumbnail, or null if the capture failed.
   */
  async captureThumbnail(
    presetInput,
    {
      width = 224,
      height = 224,
      settleFrames = 2,
      quality = 0.84,
      type = 'image/png',
    } = {},
  ) {
    return await MAGEEngine.captureThumbnail(presetInput, {
      width,
      height,
      settleFrames,
      quality,
      type,
    });
  }

  /**
   * Captures a thumbnail for a given preset without requiring an instance of MAGEEngine.
   * @param {MAGEPreset} presetInput 
   * @param {CaptureThumbnailOptions} [options] 
   * @returns {Promise<string|null>} A data URL representing the captured thumbnail, or null if the capture failed.
    * @description This static method captures a thumbnail for a given preset without requiring an instance of MAGEEngine. 
    * It creates a temporary offscreen canvas and a new MAGEEngine instance to load the preset, render it for a few frames to allow for stabilization, 
    * and capture the resulting image as a data URL. This is useful for generating thumbnails for presets without affecting the current state of an existing engine instance.
   */
  static async captureThumbnail(
    presetInput,
    {
      width = 224,
      height = 224,
      settleFrames = 2,
      quality = 0.84,
      type = 'image/png',
    } = {},
  ) {
    if (typeof document === 'undefined') {
      return null;
    }

    const w = Math.max(1, Number.parseInt(`${width}`, 10) || 224);
    const h = Math.max(1, Number.parseInt(`${height}`, 10) || 224);

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = w;
    offscreenCanvas.height = h;

    const thumbnailEngine = new MAGEEngine({ canvas: offscreenCanvas, log: false });

    try {
      thumbnailEngine.#_createScene();
      // Use a fixed pixel ratio for deterministic output across devices.
      thumbnailEngine.#renderer.setPixelRatio(1);
      thumbnailEngine.#_syncViewport(true);

      thumbnailEngine.#composer = thumbnailEngine.fx.applyPostProcessing(
        thumbnailEngine.#scene,
        thumbnailEngine.#renderer,
        thumbnailEngine.#camera,
      );
      thumbnailEngine.#_syncSobelResolution();

      // Normalize interaction-driven runtime behavior for deterministic captures.
      if (thumbnailEngine.#controls) {
        thumbnailEngine.#controls.enabled = false;
        thumbnailEngine.#controls.autoRotate = false;
      }

      const loadedPreset = thumbnailEngine.loadPreset(presetInput);
      if (!loadedPreset) {
        return null;
      }

      // Re-apply postprocessing graph after preset load to ensure pass toggles/settings are reflected.
      thumbnailEngine.#_syncPostProcessingFromState();

      // Wait for async skybox texture loading so background is present in thumbnail output.
      await thumbnailEngine.#_waitForPendingSkyboxLoad(2000);

      //use deterministic neutral defaults instead of runtime-derived values.
      thumbnailEngine.#state.time = 0.0;
      thumbnailEngine.#state.pointerDown = 1.0;
      thumbnailEngine.#state.currPointerDown = 1.0;

      // increase size by nominal amount to prevent completely flat visualizer output for presets that derive size from audio or interactions.
      thumbnailEngine.#state.size += 0.05;

      const frames = Math.max(1, Number.parseInt(`${settleFrames}`, 10) || 2);
      for (let i = 0; i < frames; i += 1) {
        thumbnailEngine.#_renderSingleFrame();
      }

      return thumbnailEngine.#_captureFramePreviewDataUrlSync({
        width: w,
        height: h,
        type: type,
        quality: quality,
      });
    } finally {
      thumbnailEngine.#_disposeForThumbnailCapture();
      offscreenCanvas.remove();
    }
  }

  refreshFx() {
    if (!this.#scene || !this.#camera || !this.#renderer) {
      return;
    }
    this.#composer = this.fx.applyPostProcessing(this.#scene, this.#renderer, this.#camera, this.#composer);
  }

  // Destroys the engine instance and releases resources. After calling this method, the engine should not be used.

  /**
   * Disposes of the MAGE Engine instance, releasing all resources and references to allow for garbage collection. 
   * This includes disposing of the Three.js renderer, scene, render targets, audio sources, and any other objects 
   * created by the engine. After calling this method, the engine instance should not be used.
   * @returns {void}
   */
  dispose() {
    if (this.#isDisposed) {
      return;
    }
    if (!this.#isRunning) {
      return;
    }
    this.#isDisposed = true;
    this.#isRunning = false;
    if (this.#animationFrameId !== null) {
      cancelAnimationFrame(this.#animationFrameId);
      this.#animationFrameId = null;
    }
    if (this.#renderer) {
      this.#renderer.dispose();
      this.#renderer.forceContextLoss();
      this.#renderer.context = null;
      this.#renderer.domElement = null;
      this.#renderer = null;
    }
    if (this.#scene) {
      this.#scene.traverse(object => {
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
      this.#scene = null;
    }
    if (this.#renderTarget) {
      this.#renderTarget.dispose();
      this.#renderTarget = null;
    }
    if (this.#rtScene) {
      this.#rtScene.traverse(object => {
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
      this.#rtScene = null;
    }
    if (this.#rtCamera) {
      this.#rtCamera = null;
    }
    if (this.#camera) {
      this.#camera = null;
    }
    if (this.#controls) {
      this.#controls.dispose();
      this.#controls = null;
    }
    if (typeof this.#externalInputUnsubscribe === 'function') {
      this.#externalInputUnsubscribe();
    }
    if (this.#windowInputBridge && this.#windowInputBridge !== this.#viewportInputBridge) {
      this.#windowInputBridge.detach();
    }
    if (this.#viewportInputBridge) {
      this.#viewportInputBridge.detach();
      this.#viewportInputBridge = null;
    }
    this.#externalInputUnsubscribe = null;
    this.#externalInputBridge = null;
    this.#windowInputBridge = null;
    if (this.#listener) {
      this.#listener = null;
    }
    if (this.#audio) {
      this.#audio.stop();
      this.#audio.disconnect();
      this.#audio = null;
    }
    if (this.#reversedAudio) {
      this.#reversedAudio.stop();
      this.#reversedAudio.disconnect();
      this.#reversedAudio = null;
    }
    if (this.#audioAnalyser) {
      this.#audioAnalyser = null;
    }
    if (this.#visualizer) {
      this.#visualizer.mesh = null;
      this.#visualizer.shader = null;
      this.#visualizer.shaders = [];
    }
    this.#state = null;
    this.#inputs = null;
    this.#screenShake = null;
    this.#currentPreset = null;
    // this._previewCaptureQueue = null;
    // this.savedPresets = [];
    // this._presetGalleryWindow = null;

    if (this.log) console.log('MAGE Engine disposed and resources released.');
  }
  
  initControls(inputSource = null) {
    if (!this.#isRunning || this.#isDisposed) {
      if (this.log) console.warn('Cannot initialize controls: MAGEEngine is not running or has been disposed.');
      return;
    }

    // Calling initControls() should fully activate control mode,
    // including bridge-driven interactions (tooltips, click actions, docks).
    this.#controlSettings.active = true;

    // enable threejs orbit controls for mouse interaction
    this.#controls.enabled = true;

    const engine = this;
    const renderer = engine.#renderer;
    const camera = engine.#camera;
    const controls = engine.#controls;
    const state = engine.#state;
    const visualizer = engine.#visualizer;

    const createViewportInputBridge = () => {
      const controller = new AbortController();

      const bridge = {
        clientX: Number.NaN,
        clientY: Number.NaN,
        pointerOverUi: false,
        requestToggleUI: false,
        requestResetVisualizer: false,
        requestNextShader: false,
        requestPreviousShader: false,
        requestWheelDirection: 0,
        onToggleUI: null,
        onHideQuickPresets: null,
        onUpdateTooltip: null,
        detach() {
          controller.abort();
        },
      };

      const isUiEvent = event => {
        const target = event?.target;
        const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];

        if (!path.includes(renderer.domElement)) {
          return true;
        }

        if (!(target instanceof Element)) {
          return false;
        }

        // return Boolean(
        //   target.closest('.tp-dfwv')
        //   || target.closest('.mage-pane-host')
        //   || target.closest('.mage-embedded-presets')
        //   || target.closest('.mage-fx-layers-overlay')
        //   || target.closest('.mage-fx-studio-overlay')
        //   || target.closest('.mage-fx-studio-dock')
        //   || target.closest('.mage-scene-camera-dock')
        //   || target.closest('.mage-dock-launcher')
        // );
      };

      const syncPointer = event => {
        bridge.clientX = event.clientX;
        bridge.clientY = event.clientY;
        bridge.pointerOverUi = isUiEvent(event);
      };

      const resetState = () => {
        bridge.requestToggleUI = false;
        bridge.requestResetVisualizer = false;
        bridge.requestNextShader = false;
        bridge.requestPreviousShader = false;
        bridge.requestWheelDirection = 0;
        if (engine.#state) {
          engine.#state.currPointerDown = 0.0;
        }
      };

      window.addEventListener('pointermove', event => {
        syncPointer(event);
      }, { capture: true, passive: true, signal: controller.signal });

      window.addEventListener('pointerdown', event => {
        syncPointer(event);
        if (bridge.pointerOverUi) {
          resetState();
          return;
        }

        if (engine.#state) {
          engine.#state.currPointerDown = 1.0;
        }
      }, { capture: true, passive: true, signal: controller.signal });

      window.addEventListener('pointerup', event => {
        syncPointer(event);
        if (bridge.pointerOverUi) {
          resetState();
          return;
        }

        if (engine.#state) {
          engine.#state.currPointerDown = 0.0 + 1 * engine.#state.pointerDownMultiplier;
        }

        if (event.button === 2) {
          bridge.requestToggleUI = true;
        } else if (event.button === 0) {
          bridge.requestResetVisualizer = true;
        } else if (event.button === 1) {
          bridge.requestToggleUI = true;
        }
      }, { capture: true, passive: true, signal: controller.signal });

      window.addEventListener('wheel', event => {
        syncPointer(event);
        if (bridge.pointerOverUi) {
          return;
        }

        bridge.requestWheelDirection = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0;
      }, { capture: true, passive: true, signal: controller.signal });

      window.addEventListener('blur', resetState, { signal: controller.signal });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          resetState();
        }
      }, { signal: controller.signal });

      return bridge;
    };

    engine.#windowInputBridge = createViewportInputBridge();
    if (!engine.#externalInputBridge) {
      engine.#viewportInputBridge = engine.#windowInputBridge;
    } else {
      // if (typeof engine.#windowInputBridge.onToggleUI === 'function' && typeof engine.#externalInputBridge.onToggleUI !== 'function') {
      //   engine.#externalInputBridge.onToggleUI = engine.#windowInputBridge.onToggleUI;
      // }
      // if (typeof engine.#windowInputBridge.onHideQuickPresets === 'function' && typeof engine.#externalInputBridge.onHideQuickPresets !== 'function') {
      //   engine.#externalInputBridge.onHideQuickPresets = engine.#windowInputBridge.onHideQuickPresets;
      // }
      // if (typeof engine.#windowInputBridge.onUpdateTooltip === 'function' && typeof engine.#externalInputBridge.onUpdateTooltip !== 'function') {
      //   engine.#externalInputBridge.onUpdateTooltip = engine.#windowInputBridge.onUpdateTooltip;
      // }
      engine.#viewportInputBridge = engine.#externalInputBridge;
    }

    // Initialize optional UI layer
    if (engine.#controlSettings?.integrated !== false) {
      if (engine.log) {
        console.log('Initializing integrated controls...');
      }
      const uiController = initControlsUI(engine);
      engine.#uiController = uiController;
      // Wire engine hooks so loadPreset can ask the UI to refresh when presets are applied.
      this.#refreshSettingsUI = uiController.refresh;
      this.#onPresetLoaded = uiController.onPresetLoaded;
      uiController.toggle();
    }

    // replace mouse pointer with control tip UI
    const previousAfterFrame = engine.#onAfterFrame;
    this.#tooltipUI = {
      element: document.createElement('div'),
      visible: false,
      x: 0,
      y: 0,
    };
    const tooltipUI = this.#tooltipUI;
    tooltipUI.element.style.position = 'fixed';
    tooltipUI.element.style.transform = 'translate(-50%, -50%)';
    tooltipUI.element.style.zIndex = '5';
    tooltipUI.element.style.pointerEvents = 'none';
    tooltipUI.element.style.display = 'none';
    tooltipUI.element.innerHTML = `<img src="${controlTipsImageDataUrl}" alt="controls" />`;
    document.body.appendChild(tooltipUI.element);

    // engine.#viewportInputBridge.onUpdateTooltip = ({ visible, x, y }) => {
    //   tooltipUI.visible = Boolean(visible);
    //   tooltipUI.x = Number.isFinite(x) ? x : tooltipUI.x;
    //   tooltipUI.y = Number.isFinite(y) ? y : tooltipUI.y;
    // };

    engine.#onAfterFrame = engineInstance => {
      if (typeof previousAfterFrame === 'function') {
        previousAfterFrame(engineInstance);
      }

      const mousex = engineInstance.#viewportInputBridge?.clientX;
      const mousey = engineInstance.#viewportInputBridge?.clientY;
      const pointerOverUi = engineInstance.#viewportInputBridge?.pointerOverUi;

      if (tooltipUI.visible) {
        // hide regular mouse pointer
        engineInstance.#renderer.domElement.style.cursor = 'none';
        tooltipUI.element.style.display = 'block';
        tooltipUI.element.style.left = `${mousex}px`;
        tooltipUI.element.style.top = `${mousey}px`;
      } else {
        tooltipUI.element.style.display = 'none';
        engineInstance.#renderer.domElement.style.cursor = '';
      }
    };
  };

  setRandomSkybox() {
    const randomSkybox = getRandomSkyboxId();
    if (randomSkybox) {
      this.#visualizer.skyboxPreset = randomSkybox;
    }
    this.loadSkybox({ type: 'preset', presetId: randomSkybox });
  }

  showIntegratedControls() {
    if (!this.#controlSettings.active) {
      this.initControls();
    }
    if (this.#uiController) {
      this.#uiController.show();
    } else {
      if (this.log) console.warn('Integrated controls are not available. Please check control settings and initialization.');
    }
  }

  hideIntegratedControls() {
    if (this.#uiController) {
      this.#uiController.hide();
    } else {
      if (this.log) console.warn('Integrated controls are not available. Please check control settings and initialization.');
    }
  }

  toggleIntegratedControls() {
    if (!this.#controlSettings.active) {
      this.initControls();
    }
    if (this.#uiController) {
      this.#uiController.toggle();
    }
    else {
      if (this.log) console.warn('Integrated controls are not available. Please check control settings and initialization.');
    }
  }

  isRunning() {
    return this.#isRunning;
  }

  getEngineFields() {
    return {
      scene: this.#scene,
      renderer: this.#renderer,
      camera: this.#camera,
      controls: this.#controls,
      canvas: this.#canvas,
      state: this.#state,
      visualizer: this.#visualizer,
      controlSettings: this.#controlSettings,
    }
  }

  openPresetDock() {
    if (!this.#controlSettings.active) {
      this.initControls();
    }
    if (!this.#controlSettings.active) {
      return;
    }
    if (this.#presetDock) {
      this.#presetDock.show();
      return;
    }

    this.#presetDock = new MAGEPresetDock(
      this,
      this.#scene,
      this.#renderer,
      this.#camera,
      this.#controls,
      this.#canvas,
      this.#controlSettings,
    );

    this.#presetDock.initialize();

    this.#presetDock.show();

    const handlePresetDockLayoutChange = () => {
      const { quickPresetHost } = this.#presetDock;
      if (quickPresetHost.style.display !== 'none') {
        this.#presetDock.positionPresetDock();
      }
    };
    window.addEventListener('resize', handlePresetDockLayoutChange);
    window.addEventListener('scroll', handlePresetDockLayoutChange, true);


  }

  // similar to dispose, but reinitialize the engine with the exact same state as before,
  // with time = 0 to allow for engine preview where the preview resets after a couple seconds
  // and replays the same preset from the beginning, but without the overhead of creating a whole new engine instance and reloading all assets.
  reset() {
    if (!this.#isRunning || this.#isDisposed) {
      if (this.log) console.warn('Cannot reset engine: MAGEEngine is not running or has been disposed.');
      return;
    }
    this.#state.time = 0.0;
    this.loadPreset(this.#currentPreset);
    this.start();
  }

  // PRIVATE METHODS
  #_waitFrames(frameCount = 1) {
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

  /**
   * @typedef {Object} CaptureFramePreviewOptions
   * @property {number} [width = 224] - Width of the captured thumbnail in pixels (default: 224)
   * @property {number} [height = 224] - Height of the captured thumbnail in pixels (default: 224)
   * @property {string} [type = 'image/png'] - MIME type of the output image (default: 'image/png')
   * @property {number} [quality = 0.84] - Quality of the output image between 0 and 1 (default: 0.84)
   * @property {number} [settleFrames = 2] - Number of frames to render after loading preset before capturing thumbnail, to allow for any async loading and shader stabilization (default: 2)
   */
  async #_captureFramePreviewBlob({
    width = 224,
    height = 224,
    type = 'image/png',
    quality = 0.84,
  } = {}) {
    if (!this.#renderer?.domElement) {
      return null;
    }

    // Render one fresh frame right before readback to avoid stale/cleared canvas captures.
    this.#_renderSingleFrame();

    const w = Math.max(1, Number.parseInt(`${width}`, 10) || 224);
    const h = Math.max(1, Number.parseInt(`${height}`, 10) || 224);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      return null;
    }

    context.drawImage(this.#renderer.domElement, 0, 0, w, h);
    return await new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), type, quality);
    });
  }

  #_waitForPendingSkyboxLoad(timeoutMs = 2000) {
    if (!this.#_pendingSkyboxLoad) {
      return Promise.resolve();
    }

    const timeout = Math.max(0, Number.parseInt(`${timeoutMs}`, 10) || 0);
    return Promise.race([
      this.#_pendingSkyboxLoad.catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, timeout)),
    ]);
  }

  #_blobToDataUrl(blob) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  #_renderSingleFrame() {
    if (!this.#renderer || !this.#scene || !this.#camera) {
      return;
    }
    this.#_syncViewport();
    this.#_syncSobelResolution();
    if (this.#composer) {
      this.#composer.render(this.#scene, this.#camera);
    } else {
      this.#renderer.render(this.#scene, this.#camera);
    }
  }

  #_hideViewportMessage() {
    this.#_ensureViewportToast();
    if (!this.#viewportToast.el) {
      return;
    }
    this.#viewportToast.visible = false;
    this.#viewportToast.el.style.opacity = '0';
    this.#viewportToast.el.style.display = 'none';
  }

  #_syncPostProcessingFromState() {
    if (!this.#renderer || !this.#scene || !this.#camera) {
      return;
    }

    this.#renderer.toneMapping = this.fx.toneMapping.method;

    if (this.#composer) {
      this.#composer = this.fx.applyPostProcessing(this.#scene, this.#renderer, this.#camera, this.#composer);
    }

    this.#_syncSobelResolution();
  }

  #_syncSobelResolution() {
    if (!this.#renderer || !this.fx.sobelShader?.shader?.uniforms?.resolution?.value) {
      return;
    }

    const resolution = this.fx.sobelShader.shader.uniforms.resolution.value;
    const bufferWidth = this.#renderer.domElement?.width || Math.max(1, Math.floor(window.innerWidth * window.devicePixelRatio));
    const bufferHeight = this.#renderer.domElement?.height || Math.max(1, Math.floor(window.innerHeight * window.devicePixelRatio));
    resolution.x = bufferWidth;
    resolution.y = bufferHeight;
  }

  #_captureFramePreviewDataUrlSync({
    width = 224,
    height = 224,
    type = 'image/png',
    quality = 0.84,
  } = {}) {
    if (!this.#renderer?.domElement) {
      return null;
    }

    try {
      // Ensure a fresh frame has been drawn before reading the canvas snapshot.
      this.#_renderSingleFrame();

      const w = Math.max(1, Number.parseInt(`${width}`, 10) || 224);
      const h = Math.max(1, Number.parseInt(`${height}`, 10) || 224);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) {
        return null;
      }

      context.drawImage(this.#renderer.domElement, 0, 0, w, h);
      return canvas.toDataURL(type, quality);
    } catch {
      return null;
    }
  }

  // _trackSavedPreset(preset) {
  //   if (!preset || typeof preset !== 'object') {
  //     return;
  //   }

  //   const cloned = this.#_safeDeepClone(preset);
  //   cloned._savedAt = new Date().toISOString();
  //   this.savedPresets.push(cloned);
  //   this.#_renderSavedPresetsWindow();
  // }

  #_safeDeepClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  #_escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  //   #_renderSavedPresetsWindow() {
  //     if (!this._presetGalleryWindow || this._presetGalleryWindow.closed) {
  //       return;
  //     }

  //     const doc = this._presetGalleryWindow.document;
  //     const items = this.savedPresets
  //       .map((preset, index) => {
  //         const thumb = typeof preset.thumbnailDataUrl === 'string' ? preset.thumbnailDataUrl : '';
  //         const ts = preset._savedAt ? this.#_escapeHtml(new Date(preset._savedAt).toLocaleString()) : 'unknown';
  //         const pretty = this.#_escapeHtml(JSON.stringify(preset, null, 2));
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

  #_setCameraUpFromTilt(tiltValue = this.#state?.camTilt) {
    if (!this.#camera || typeof tiltValue !== 'number' || !Number.isFinite(tiltValue)) {
      return;
    }

    this.#camera.up.set(
      Math.sin(tiltValue),
      Math.cos(tiltValue),
      -Math.sin(tiltValue),
    );
  }

  #_applyCompactIntent(intent) {
    if (!intent || typeof intent !== 'object') {
      return;
    }

    this.#_applyStatePatch(intent, { applied: [], warnings: [] });

    if (this.#controls) {
      if (typeof intent.autoRotate === 'boolean') {
        this.#controls.autoRotate = intent.autoRotate;
      }
      if (typeof intent.autoRotateSpeed === 'number' && Number.isFinite(intent.autoRotateSpeed)) {
        this.#controls.autoRotateSpeed = intent.autoRotateSpeed;
      }
    }

    if (this.#camera && typeof intent.fov === 'number' && Number.isFinite(intent.fov)) {
      this.#camera.fov = intent.fov;
      this.#camera.updateProjectionMatrix();
    }

    if (typeof intent.camTilt === 'number' && Number.isFinite(intent.camTilt) && this.#camera) {
      this.#_setCameraUpFromTilt(intent.camTilt);
    }
  }

  #_applyCompactFx(fx) {
    if (!fx || typeof fx !== 'object') {
      return;
    }

    if (Array.isArray(fx.passOrder)) {
      this.fx.setPassOrder(fx.passOrder);
    }

    if (fx.bloom && typeof fx.bloom === 'object') {
      if (typeof fx.bloom.enabled === 'boolean') this.fx.bloom.enabled = fx.bloom.enabled;
      if (typeof fx.bloom.strength === 'number' && Number.isFinite(fx.bloom.strength)) this.fx.bloom.settings.strength = fx.bloom.strength;
      if (typeof fx.bloom.radius === 'number' && Number.isFinite(fx.bloom.radius)) this.fx.bloom.settings.radius = fx.bloom.radius;
      if (typeof fx.bloom.threshold === 'number' && Number.isFinite(fx.bloom.threshold)) this.fx.bloom.settings.threshold = fx.bloom.threshold;
    }

    if (fx.toneMapping && typeof fx.toneMapping === 'object') {
      if (typeof fx.toneMapping.method === 'number' && Number.isFinite(fx.toneMapping.method)) {
        this.fx.toneMapping.method = fx.toneMapping.method;
        if (this.#renderer) {
          this.#renderer.toneMapping = fx.toneMapping.method;
        }
      }
      if (typeof fx.toneMapping.exposure === 'number' && Number.isFinite(fx.toneMapping.exposure) && this.#renderer) {
        this.#renderer.toneMappingExposure = fx.toneMapping.exposure;
      }
    }

    if (fx.passes && typeof fx.passes === 'object') {
      if (typeof fx.passes.rgbShift === 'boolean') this.fx.RGBShift.enabled = fx.passes.rgbShift;
      if (typeof fx.passes.dot === 'boolean') this.fx.dotShader.enabled = fx.passes.dot;
      if (typeof fx.passes.technicolor === 'boolean') this.fx.technicolorShader.enabled = fx.passes.technicolor;
      if (typeof fx.passes.luminosity === 'boolean') this.fx.luminosityShader.enabled = fx.passes.luminosity;
      if (typeof fx.passes.afterImage === 'boolean') this.fx.afterImagePass.enabled = fx.passes.afterImage;
      if (typeof fx.passes.sobel === 'boolean') this.fx.sobelShader.enabled = fx.passes.sobel;
      if (typeof fx.passes.glitch === 'boolean') this.fx.glitchPass.enabled = fx.passes.glitch;
      if (typeof fx.passes.colorify === 'boolean') this.fx.colorifyShader.enabled = fx.passes.colorify;
      if (typeof fx.passes.halftone === 'boolean') this.fx.halftonePass.enabled = fx.passes.halftone;
      if (typeof fx.passes.gammaCorrection === 'boolean') this.fx.gammaCorrectionShader.enabled = fx.passes.gammaCorrection;
      if (typeof fx.passes.kaleid === 'boolean') this.fx.kaleidoShader.enabled = fx.passes.kaleid;
      if (typeof fx.passes.outputPass === 'boolean') this.fx.outputPass.enabled = fx.passes.outputPass;
    }

    if (fx.params && typeof fx.params === 'object') {
      if (fx.params.rgbShift && typeof fx.params.rgbShift === 'object') {
        if (typeof fx.params.rgbShift.amount === 'number' && Number.isFinite(fx.params.rgbShift.amount)) {
          this.fx.RGBShift.shader.uniforms.amount.value = fx.params.rgbShift.amount;
        }
        if (typeof fx.params.rgbShift.angle === 'number' && Number.isFinite(fx.params.rgbShift.angle)) {
          this.fx.RGBShift.shader.uniforms.angle.value = fx.params.rgbShift.angle;
        }
      }

      if (fx.params.afterImage && typeof fx.params.afterImage === 'object') {
        if (typeof fx.params.afterImage.damp === 'number' && Number.isFinite(fx.params.afterImage.damp)) {
          this.fx.afterImagePass.shader.uniforms.damp.value = fx.params.afterImage.damp;
        }
      }

      if (fx.params.kaleid && typeof fx.params.kaleid === 'object') {
        if (typeof fx.params.kaleid.sides === 'number' && Number.isFinite(fx.params.kaleid.sides)) {
          this.fx.kaleidoShader.shader.uniforms.sides.value = fx.params.kaleid.sides;
        }
        if (typeof fx.params.kaleid.angle === 'number' && Number.isFinite(fx.params.kaleid.angle)) {
          this.fx.kaleidoShader.shader.uniforms.angle.value = fx.params.kaleid.angle;
        }
      }

      if (fx.params.colorify && typeof fx.params.colorify === 'object' && fx.params.colorify.color !== undefined) {
        const colorValue = fx.params.colorify.color;
        if (this.fx.colorifyShader.color && typeof this.fx.colorifyShader.color.set === 'function') {
          try {
            this.fx.colorifyShader.color.set(colorValue);
          } catch {
            // Keep current color if payload is not parseable by three.Color.
          }
        }
      }
    }

    if (this.#composer) {
      this.#composer = this.fx.applyPostProcessing(this.#scene, this.#renderer, this.#camera, this.#composer);
    }
  }

  #_coercePresetInput(presetInput, report) {
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

  #_extractVisualizerPatch(root, report) {
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

  #_extractStatePatch(root, report) {
    const statePatch = {};
    if (root.state && typeof root.state === 'object' && !Array.isArray(root.state)) {
      Object.assign(statePatch, root.state);
    } else if (Object.hasOwn(root, 'state') && root.state !== null) {
      report.invalid.push('state must be an object');
    }

    return statePatch;
  }

  #_extractControlsPatch(root, report) {
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

  #_normalizeSkyboxInput(skyboxInput) {
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

  #_applyStatePatch(statePatch, report) {
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
      if (!Object.hasOwn(this.#state, key)) {
        report.warnings.push(`state.${key} is unknown and was ignored`);
        continue;
      }

      const currentValue = this.#state[key];
      const incomingValue = statePatch[key];

      if (currentValue instanceof Vector3) {
        report.applied.push(`state.${key}`);
        continue;
      }

      if (typeof currentValue === 'number') {
        this.#state[key] = incomingValue;
        report.applied.push(`state.${key}`);
        continue;
      }

      this.#state[key] = incomingValue;
      report.applied.push(`state.${key}`);
    }

    if (typeof this.#state.time_multiplier !== 'number' || !Number.isFinite(this.#state.time_multiplier)) {
      this.#state.time_multiplier = 1.0;
      report.warnings.push('state.time_multiplier was invalid after patch; reset to 1.0');
    }
  }

  #_resolveSkyboxPath({ type, presetId }) {
    if (type !== 'preset' || !Number.isInteger(presetId) || presetId < 0) {
      // TODO - support custom skybox paths in addition to preset-based ones
      return { skyboxId: -1, faceUrls: null };
    }

    const embeddedFaces = getEmbeddedSkyboxFaces(presetId);
    if (!embeddedFaces) {
      return { skyboxId: -1, faceUrls: null };
    }

    return {
      skyboxId: presetId,
      faceUrls: [
        embeddedFaces.left,
        embeddedFaces.right,
        embeddedFaces.up,
        embeddedFaces.down,
        embeddedFaces.front,
        embeddedFaces.back,
      ],
    };
  }

  #_getViewportSize() {
    if (this.#canvas) {
      const rect = this.#canvas.getBoundingClientRect();
      const width = Math.max(
        1,
        Math.floor(
          rect.width || this.#canvas.clientWidth || this.#canvas.width || 0,
        ),
      );
      const height = Math.max(
        1,
        Math.floor(
          rect.height || this.#canvas.clientHeight || this.#canvas.height || 0,
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

  #_syncViewport(force = false) {
    if (!this.#renderer || !this.#camera) {
      return;
    }

    const { width, height } = this.#_getViewportSize();
    if (!force && width === this.#viewportWidth && height === this.#viewportHeight) {
      return;
    }

    this.#viewportWidth = width;
    this.#viewportHeight = height;

    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();

    this.#renderer.setSize(width, height, false);

    if (this.#composer && this.#composer.setSize) {
      this.#composer.setSize(width, height);
    }

    if (this.#renderTarget && this.#renderTarget.setSize) {
      this.#renderTarget.setSize(
        Math.max(1, Math.floor(width / 4)),
        Math.max(1, Math.floor(height / 4)),
      );
    }

    this.#_syncSobelResolution();
  }

  #_ensureViewportToast() {
    if (this.#viewportToast.el && document.body.contains(this.#viewportToast.el)) {
      return;
    }

    // Skip toast creation for detached/offscreen canvases used for thumbnail capture.
    if (this.#canvas && !this.#canvas.isConnected) {
      return;
    }

    const host =
      this.#canvas?.parentElement ||
      this.#renderer?.domElement?.parentElement ||
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
    this.#viewportToast.el = toast;
  }

  #_disposeForThumbnailCapture() {
    this.#_pendingSkyboxLoad = null;
    const rendererCanvas = this.#renderer?.domElement || null;

    try {
      this.#controls?.dispose?.();
    } catch {
      // no-op
    }

    try {
      this.#renderTarget?.dispose?.();
    } catch {
      // no-op
    }

    try {
      this.#renderer?.dispose?.();
      this.#renderer?.forceContextLoss?.();
    } catch {
      // no-op
    }

    if (rendererCanvas?.parentElement) {
      rendererCanvas.parentElement.removeChild(rendererCanvas);
    }

    if (this.#viewportToast?.el?.parentElement) {
      this.#viewportToast.el.parentElement.removeChild(this.#viewportToast.el);
    }
    this.#viewportToast.el = null;
  }

  #_createRenderer() {
    const { width, height } = this.#_getViewportSize();
    const rendererOptions = {};
    if (this.#canvas) {
      rendererOptions.canvas = this.#canvas;
    }

    if (this.#isLowQualityMode) {
      rendererOptions.powerPreference = 'low-power';
    }
    
    this.#renderer = new WebGLRenderer(rendererOptions);
    
    if (this.#isLowQualityMode) {
      this.#renderer.setSize(Math.max(1, Math.floor(width / 4)), Math.max(1, Math.floor(height / 4)), false);
    } else {
      this.#renderer.setSize(width, height, false);
    }
    
    if (this.#isLowQualityMode) {
      this.#renderer.setPixelRatio(0.1);
    } else {
      this.#renderer.setPixelRatio(window.devicePixelRatio || 1);
    }

    this.#renderer.setClearColor(new Color(1, 1, 1), 0);
    // Match original renderer tone mapping exposure behavior
    this.#renderer.toneMappingExposure = this.fx.toneMapping.exposure;
    this.#renderer.outputColorSpace = SRGBColorSpace;
  }

  #_createScene() {
    const { width, height } = this.#_getViewportSize();

    // initialize scene
    this.#scene = new Scene();

    // initialize camera
    this.#camera = new PerspectiveCamera(75, width / height, 0.1, 100000);
    this.#camera.position.z = 5.5;
    this.#camera.lookAt(0, 10, 100);

    // init audio listener
    this.#listener = new AudioListener();
    this.#camera.add(this.#listener);

    // initialize renderer
    this.#_createRenderer();

    if (!this.#canvas) {
      // Match existing behavior: append the canvas to the body when not provided
      document.body.appendChild(this.#renderer.domElement);
    }

    // initialize clock
    this.#clock = new Timer();

    // Add mouse controls
    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.dampingFactor = 0.25;
    this.#controls.zoomSpeed = 0.5;
    this.#controls.rotateSpeed = 0.5;
    this.#controls.autoRotate = true;
    this.#controls.autoRotateSpeed = 0.2;
    this.#controls.enabled = false; // Start disabled until controls loaded

    // save initial state for reset
    this.#controls.saveState();

    this.#_ensureViewportToast();

    // If a preset with controls was loaded before the scene/controls existed,
    // apply those queued controls now so camera orientation is restored.
    if (this.#_pendingControls) {
      this.#_loadControls(this.#_pendingControls);
      this.#_pendingControls = null;
    }

    this.#_syncViewport(true);
  }

  #_loadControls(presetControls) {
    if (presetControls && this.#controls) {
      const { target0, position0, zoom0 } = presetControls;
      this.#controls.target0.copy(target0);
      this.#controls.position0.copy(position0);
      this.#controls.zoom0 = zoom0;
      this.#controls.reset();
    }
  }

  #_loadDefaultVisualizer() {
    this.#visualizer.load({ seed: 'default', addToHistory: true });
    this.loadSkybox({ type: 'preset', presetId: 6 });
    this.#_updateVisualizer();
    this.#currentPreset = this.toPreset();
  }

  #_loadDefaultPreset() {
    // const defaultPreset = getEmbeddedPresetById(1);
    // if (defaultPreset) {
    //   const loadedPreset = this.loadPreset(defaultPreset);
    //   if (loadedPreset) {
    //     return loadedPreset;
    //   }
    // }

    this.#_loadDefaultVisualizer();
    return null;
  }

  #_idFromShaderCode(shaderCode) {
    // Simple hash function to generate a unique ID from shader code
    let hash = 0;
    for (let i = 0; i < shaderCode.length; i++) {
      const char = shaderCode.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return `shader_${Math.abs(hash)}`;
  }

  loadSkybox({ type, presetId }) {
    const { skyboxId, faceUrls } = this.#_resolveSkyboxPath({ type: type, presetId: presetId });
    if (!faceUrls) {
      if (this.log) console.log('No valid skybox input provided:', presetId);
      return;
    }

    this.#visualizer.skyboxPreset = skyboxId;

    const loader = new CubeTextureLoader();

    this.#_pendingSkyboxLoad = new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) {
          return;
        }
        settled = true;
        this.#_pendingSkyboxLoad = null;
        resolve(result);
      };

      const texture = loader.load(
        faceUrls,
        () => finish(true),
        undefined,
        () => finish(false),
      );

      this.#scene.background = texture;
    });
  }

  #_clearScene() {
    if (this.#scene) {
      while (this.#scene.children.length > 0) {
        const child = this.#scene.children[0];
        this.#scene.remove(child);
      }
    }
  }

  #_updateVisualizer() {
    this.#_clearScene();
    const mesh = this.#visualizer.mesh;
    this.#scene.add(mesh);

    // Scene and camera for rendering Shader Park
    // Render target for Shader Park output for object picking
    this.#renderTarget = new WebGLRenderTarget(
      Math.max(1, Math.floor(this.#viewportWidth / 4)),
      Math.max(1, Math.floor(this.#viewportHeight / 4)),
      {
        // use quarter res to save frames
        format: RGBAFormat,
        type: UnsignedByteType,
      },
    );
    this.#rtScene = new Scene();
    this.#rtCamera = this.#camera;
    this.#rtScene.add(mesh.clone());
  }

  // maintains and bounds a time-based size value that can be used for effects in shaders
  #_staticAudioUpdate(delta) {
    const val = Math.sin(this.#state.time) * this.#state.size * 0.02 + 0.1; 
    const update = val * this.#state.base_speed + delta * this.#state.base_speed; 
    this.#state.size =
    (1 - this.#state.easing_speed) * update + 
    this.#state.easing_speed * this.#state.size + 
    this.#state.volume_multiplier * 0.01;
  }

  #_render = () => {
    if (this.#isDisposed || !this.#state || !this.#scene || !this.#camera || !this.#renderer) {
      return;
    }

    this.#animationFrameId = requestAnimationFrame(this.#_render);
    this.#_syncViewport();

    const delta = this.#clock.getDelta();
    this.#state.time = delta;
    if (!Number.isFinite(this.#state.time_multiplier)) {
      this.#state.time_multiplier = 1.0;
    }

    // alternates flow of time to prevent animation bugs
    if (this.#state.time < 180 && this.#timeIncreasing) {
      this.#state.time += this.#state.time_multiplier * delta;
    } else {
      this.#timeIncreasing = false;
      this.#state.time -= this.#state.time_multiplier * delta;
      if (this.#state.time <= 0) {
        this.#timeIncreasing = true;
      }
    }

    this.#_staticAudioUpdate(delta);

    const hasLiveAudio =
      this.#audioAnalyser &&
      ((this.#audio && this.#audio.isPlaying) || (this.#reversedAudio && this.#reversedAudio.isPlaying));

    // analyze audio using FFT
    if (hasLiveAudio) {
      const freqData = this.#audioAnalyser.getFrequencyData();
      this.#_updateAudioState(freqData);
    }

    // If in preview mode, simulate audio instead of reading from actual audio source
    if (this.#previewMode) {
      this.#_simulatePreviewAudio();
    }

    // Keep controls authoritative for camera motion, then apply tilt orientation once.
    this.#controls.update();

    this.#_updateViewportInteractionFromBridge();

    if (this.#viewportToast.el && this.#viewportToast.visible) {
      const elapsedMs = performance.now() - this.#viewportToast.shownAt;
      if (elapsedMs <= this.#viewportToast.durationMs) {
        this.#viewportToast.el.style.opacity = '1';
      } else if (elapsedMs <= this.#viewportToast.durationMs + this.#viewportToast.fadeMs) {
        const fadeProgress =
          (elapsedMs - this.#viewportToast.durationMs) / this.#viewportToast.fadeMs;
        this.#viewportToast.el.style.opacity = `${Math.max(0, 1 - fadeProgress)}`;
      } else {
        this.#viewportToast.visible = false;
        this.#viewportToast.el.style.opacity = '0';
        this.#viewportToast.el.style.display = 'none';
      }
    }

    // Check if preview mode should end
    if (this.#previewMode) {
      this.#previewFrameCount += 1;
      if (this.#previewFrameCount >= this.#previewFramesTarget) {
        this.#previewFrameCount = 0;
        this.reset();
      }
    }

    if (this.#onAfterFrame) {
      this.#onAfterFrame(this);
    }

    if (this.#cameraUpdateHook) {
      this.#cameraUpdateHook(this);
    }

    if (this.#composer) {
      this.#composer.render(this.#scene, this.#camera);
    } else {
      this.#renderer.render(this.#scene, this.#camera);
    }
  }

  #_growVisualizer() {
    this.#state.size += 0.035 * (1 - this.#state.easing_speed + 0.01);
  }

  #_isPointerNearVisualizerCenter(maxDistanceNdc = 0.35) {
    if (!this.#visualizer?.mesh || !this.#camera || !this.#inputs?.currMouse) {
      return false;
    }

    const meshCenterNdc = this.#visualizer.mesh.position.clone().project(this.#camera);
    if (!Number.isFinite(meshCenterNdc.x) || !Number.isFinite(meshCenterNdc.y)) {
      return false;
    }

    const dx = this.#inputs.currMouse.x - meshCenterNdc.x;
    const dy = this.#inputs.currMouse.y - meshCenterNdc.y;
    const distance = Math.hypot(dx, dy);
    return distance <= Math.max(0.01, Number(maxDistanceNdc) || 0.35);
  }

  #_createInputBridgeState(sourceBridge = null) {
    return {
      clientX: Number.NaN,
      clientY: Number.NaN,
      pointerOverUi: false,
      requestToggleUI: false,
      requestResetVisualizer: false,
      requestNextShader: false,
      requestPreviousShader: false,
      requestWheelDirection: 0,
      onToggleUI: sourceBridge?.onToggleUI || null,
      onHideQuickPresets: sourceBridge?.onHideQuickPresets || null,
      onUpdateTooltip: sourceBridge?.onUpdateTooltip || null,
      detach() { },
    };
  }

  #_applyInputStatePatch(bridge, patch) {
    if (!bridge || !patch || typeof patch !== 'object') {
      return;
    }

    if (Number.isFinite(patch.clientX)) bridge.clientX = Number(patch.clientX);
    if (Number.isFinite(patch.clientY)) bridge.clientY = Number(patch.clientY);
    if (typeof patch.pointerOverUi === 'boolean') bridge.pointerOverUi = patch.pointerOverUi;

    if (typeof patch.requestToggleUI === 'boolean') bridge.requestToggleUI = patch.requestToggleUI;
    if (typeof patch.requestResetVisualizer === 'boolean') bridge.requestResetVisualizer = patch.requestResetVisualizer;
    if (typeof patch.requestNextShader === 'boolean') bridge.requestNextShader = patch.requestNextShader;
    if (typeof patch.requestPreviousShader === 'boolean') bridge.requestPreviousShader = patch.requestPreviousShader;

    if (Number.isFinite(patch.requestWheelDirection)) {
      const raw = Number(patch.requestWheelDirection);
      bridge.requestWheelDirection = raw < 0 ? -1 : raw > 0 ? 1 : 0;
    }

    if (Number.isFinite(patch.currPointerDown) && this.#state) {
      this.#state.currPointerDown = Number(patch.currPointerDown);
    }
  }

  #_tryToGetInputsFromMouseEvents() {
    const inputSource = {
      getState() {
        return { clientX: 0, clientY: 0, pointerOverUi: false, currPointerDown: 0 };
      },
      subscribe(handler) {
        const onMove = event => {
          handler({
            clientX: event.clientX,
            clientY: event.clientY,
            pointerOverUi: false,
          });
        };

        const onDown = () => handler({ currPointerDown: 1.0 });
        const onUp = () => handler({ currPointerDown: 0.0 });

        window.addEventListener('pointermove', onMove, { capture: true });
        window.addEventListener('pointerdown', onDown, { capture: true });
        window.addEventListener('pointerup', onUp, { capture: true });

        return () => {
          window.removeEventListener('pointermove', onMove, { capture: true });
          window.removeEventListener('pointerdown', onDown, { capture: true });
          window.removeEventListener('pointerup', onUp, { capture: true });
        };
      },
    };

    return inputSource;
  }

  #_updateViewportInteractionFromBridge() {
    if (!this.#controlSettings.active) {
      return;
    }

    const bridge = this.#viewportInputBridge;
    if (!this.#renderer?.domElement || !this.#camera || !this.#visualizer || !this.#inputs || !this.#controls) {
      return;
    }

    if (!bridge) {
      // If no bridge, use defaults that allow interaction when pointer is over the canvas
      console.warn('MAGE WARNING: No input bridge available; falling back to mouse events for viewport interaction.');
      const input = this.#_tryToGetInputsFromMouseEvents();
      this.attachInputSource(input);
      return;
    }

    // use easing and linear interpolation to smoothly animate mouse this.fx
    this.#state.pointerDown = 0.1 * this.#state.currPointerDown + 0.9 * this.#state.pointerDown;
    this.#state.mouse.lerp(this.#state.currMouse, 0.05)
    const domElement = this.#renderer.domElement;
    const rect = domElement.getBoundingClientRect();
    const hasPointer = Number.isFinite(bridge.clientX) && Number.isFinite(bridge.clientY);
    const insideViewport = Boolean(
      hasPointer
      && bridge.clientX >= rect.left
      && bridge.clientX <= rect.right
      && bridge.clientY >= rect.top
      && bridge.clientY <= rect.bottom,
    );
    const isDesktopOS = ['Windows', 'Mac OS', 'Linux'].includes(this.#_getOS());
    const canRaycast = insideViewport && !bridge.pointerOverUi && this.#controls.enabled && isDesktopOS;

    if (canRaycast) {
      const relX = (bridge.clientX - rect.left) / rect.width;
      const relY = (bridge.clientY - rect.top) / rect.height;

      // Raycast input (NDC)
      this.#inputs.currMouse.x = relX * 2 - 1;
      this.#inputs.currMouse.y = -relY * 2 + 1;

      // Animation/audio input source
      if (this.#visualizer.controllingAudio) {
        this.#state.currMouse.x = relX * 2 - 1;
        this.#state.currMouse.y = -relY * 2 + 1;
      } else {
        this.#state.currMouse.x = relX / 4 - 1;
        this.#state.currMouse.y = -relY / 4 + 1;
      }



      const raycaster = new Raycaster();
      raycaster.setFromCamera(this.#inputs.currMouse, this.#camera);
      const intersects = this.#visualizer.mesh ? raycaster.intersectObject(this.#visualizer.mesh) : [];

      if (intersects.length > 0) {
        this.#visualizer.intersected = true;

        if (this.#renderTarget && this.#rtScene && this.#rtCamera) {
          this.#renderer.setRenderTarget(this.#renderTarget);
          this.#renderer.render(this.#rtScene, this.#rtCamera);
          this.#renderer.setRenderTarget(null);

          const pixelBuffer = new Uint8Array(4);
          const hitNdc = intersects[0].point.clone().project(this.#camera);
          const w = this.#renderTarget.width;
          const h = this.#renderTarget.height;
          const x = Math.max(0, Math.min(w - 1, Math.floor((hitNdc.x + 1) * 0.5 * (w - 1))));
          const y = Math.max(0, Math.min(h - 1, Math.floor((hitNdc.y + 1) * 0.5 * (h - 1))));

          this.#renderer.readRenderTargetPixels(this.#renderTarget, x, y, 1, 1, pixelBuffer);

          const nearCenter = this.#_isPointerNearVisualizerCenter(this.#visualizer.centerClickRadiusNdc);
          if (pixelBuffer[3] > 0 && nearCenter) {
            this.#tooltipUI.visible = true;
            this.#_growVisualizer();
            this.#visualizer.clickable = true;
          } else {
            this.#tooltipUI.visible = false;
            this.#visualizer.clickable = false;
          }
        }
      } else {
        this.#visualizer.intersected = false;
        this.#visualizer.clickable = false;
      }
    } else {
      this.#visualizer.intersected = false;
      this.#visualizer.clickable = false;
      this.#visualizer.controllingAudio = false;
    }

    // if (typeof bridge.onUpdateTooltip === 'function') {
    //   const tooltipVisible = Boolean(
    //     this.#visualizer.render_tooltips &&
    //     this.#visualizer.intersected &&
    //     this.#visualizer.clickable,
    //   );
    //   bridge.onUpdateTooltip({
    //     visible: tooltipVisible,
    //     x: bridge.clientX,
    //     y: bridge.clientY,
    //   });
    // }

    const canTriggerInteraction = this.#visualizer.intersected && this.#visualizer.clickable;

    if (bridge.requestWheelDirection !== 0) {
      if (canTriggerInteraction) {
        if (bridge.requestWheelDirection < 0) {
          this.#visualizer.nextShader();
          this.#_updateVisualizer();
        } else {
          this.#visualizer.previousShader();
          this.#_updateVisualizer();
        }
      }
      bridge.requestWheelDirection = 0;
    }

    if (bridge.requestToggleUI) {
      this.toggleIntegratedControls();
      bridge.requestToggleUI = false;
    }

    if (bridge.requestResetVisualizer) {
      if (canTriggerInteraction) {
        this.randomizeVisualizer()
        if (typeof bridge.onHideQuickPresets === 'function') {
          bridge.onHideQuickPresets();
        } else if (this.#presetDock) {
          this.#presetDock.setQuickPresetsVisible(false);
        }
      }
      bridge.requestResetVisualizer = false;
    }

    if (bridge.requestNextShader) {
      if (canTriggerInteraction) {
        this.#visualizer.nextShader();
        this.#_updateVisualizer();
      }
      bridge.requestNextShader = false;
    }

    if (bridge.requestPreviousShader) {
      if (canTriggerInteraction) {
        this.#visualizer.previousShader();
        this.#_updateVisualizer();
      }
      bridge.requestPreviousShader = false;
    }
  }

  #_getOS() {
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

  #_createScreenShake() {
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
        self.#controls.update();
      },

      getQuadra(t) {
        return 9.436896e-16 + 4 * t - 4 * (t * t);
      },
    };
  }
}



