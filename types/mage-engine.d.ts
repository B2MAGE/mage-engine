import type { AudioResponseEvent } from "./audio-mapping.js";
import type { CompiledShaderArtifact } from "./compiled-shader.js";
import type { AudioAnalysisFrame, AudioAnalysisSnapshot } from "./audio-analysis.js";
import type { AudioResponseConfig, AudioResponseMode, AudioResponseSignal, AudioResponseTarget } from "./audio-response.js";
// Maintained public declarations; copied into dist by scripts/build-package.mjs.
// This declaration intentionally exposes only the supported public API surface.
/**
 * MAGEPreset represents a serializable snapshot of the MAGE engine's state, including all parameters, settings, and configurations necessary to recreate a specific visual output. It is an opaque type that can contain any data structure as long as it can be serialized and deserialized to restore the engine's state accurately.
 * The exact structure of the MAGEPreset is not defined here, as it is meant to be flexible and extensible to accommodate various use cases and future features of the MAGE engine. Users of the MAGE engine can create, save, and load presets to easily share and reproduce specific visual configurations without needing to understand the internal workings of the engine.
 * The MAGEPreset can include information such as shader parameters, audio settings, camera configurations, post-processing effects, and any other relevant data that defines the visual output of the MAGE engine at a given moment. It serves as a convenient way to capture and restore complex visual states in a single, serializable object.
 * The MAGEPreset can be used in conjunction with the loadPreset and toPreset methods of the MAGEEngineAPI to save and restore engine states, enabling users to create a library of presets for different visual styles and effects.
 */
export interface MAGEPreset {
  audioResponse?: AudioResponseMode;
  audioResponseConfig?: AudioResponseConfig;
  // The structure of the preset is not defined here, as it is considered an opaque type.
  // It can be any serializable object that represents the state of the MAGE engine.
  [key: string]: any;
}

/** Numeric measurements supplied by a host-owned audio session. No media crosses this API. */
export interface MAGEExternalAudioFrame {
  frame: AudioAnalysisFrame | null;
  /** Normalized frequency-bin magnitude for the original response mode. */
  legacyAmplitude: number;
  /** AudioContext clock, in seconds; analysis frame/hit times use this same clock. */
  audioTime: number;
  playing: boolean;
  loaded: boolean;
}

/** Host-owned visual time. The renderer extrapolates at most a quarter second. */
export interface MAGEExternalClock {
  time: number;
  rate: number;
  playing: boolean;
}

/**
 * InputState represents externally-managed pointer and interaction signals that can be fed into the engine.
 * This is useful when the host application wants full control over input routing (for example React apps with layered DOM).
 */

export interface InputState {
  clientX?: number;
  clientY?: number;
  pointerOverUi?: boolean;
  currPointerDown?: number;
  requestWheelDirection?: -1 | 0 | 1 | number;
  requestToggleUI?: boolean;
  requestResetVisualizer?: boolean;
  requestNextShader?: boolean;
  requestPreviousShader?: boolean;
}

/**
 * InputSource is an optional adapter interface for host-managed input.
 * - getState() provides an initial snapshot.
 * - subscribe(handler) streams updates and may return an unsubscribe callback.
 * This interface allows host applications to manage input state and feed it into the MAGE engine, 
 * providing greater control over input routing and handling. By implementing the InputSource interface, 
 * host applications can integrate custom input mechanisms or adapt existing ones to work seamlessly 
 * with the MAGE engine's input system.
 */
export interface InputSource {
  getState?: () => InputState;
  subscribe?: (handler: (state: InputState) => void) => void | (() => void);
}

/**
 * CaptureFramePreviewOptions defines the options for capturing a single frame preview from the MAGE engine. It allows users to specify the dimensions, output format, and quality of the captured thumbnail image. The options include:
 * - width: The width of the captured thumbnail in pixels (default is 224).
 * - height: The height of the captured thumbnail in pixels (default is 224).
 * - type: The MIME type of the output image, such as 'image/png' or 'image/jpeg' (default is 'image/png').
 * - quality: The quality of the output image, a number between 0 and 1, where 1 is the highest quality (default is 0.84). This option is only applicable for lossy formats like 'image/jpeg'.
 * These options allow users to customize the appearance and format of the captured frame preview according to their needs, making it easier to generate thumbnails or snapshots of the current visual state of the MAGE engine.
 */
/** Output and transient capture rendering are bounded to 230400 pixels and a 640px longest edge. */
export interface CaptureFramePreviewOptions {
  width?: number; // Width of the captured thumbnail in pixels (default: 224)
  height?: number; // Height of the captured thumbnail in pixels (default: 224)
  type?: string; // MIME type of the output image (default: 'image/png')
  quality?: number; // Quality of the output image between 0 and 1 (default: 0.84)
}

/**
 * CaptureThumbnailOptions extends CaptureFramePreviewOptions by adding an additional option to specify the number of frames to wait for the scene to settle before capturing the thumbnail. This is useful in scenarios where the visual output may be changing rapidly, and waiting for a few frames can help ensure that the captured thumbnail represents a stable and accurate representation of the scene. The settleFrames option allows users to specify how many frames to wait before capturing, with a default value of 0, meaning that the thumbnail will be captured immediately without waiting.
 * By using CaptureThumbnailOptions, users can have more control over the timing of the thumbnail capture, ensuring that they get the best possible representation of the scene in their captured images. This can be particularly beneficial when capturing thumbnails for presets or sharing visual configurations, as it helps to avoid capturing transient or unstable visual states.
 * The CaptureThumbnailOptions can be used with the captureThumbnail method of the MAGEEngineAPI to generate thumbnails that are more representative of the intended visual output, especially in dynamic scenes where the visuals may be changing frequently.
 */
export interface CaptureThumbnailOptions extends CaptureFramePreviewOptions {
  settleFrames?: number; // Bounded to 1-4 settling renders (default: 2)
}

/** 
 * MAGEFxPassOrder defines the valid pass names for the post-processing effects in the MAGE engine. 
 * It is a union type that includes all the possible pass names that can be used to specify the order 
 * of post-processing effects applied to the visual output. The valid pass names include:
 * - 'glitchPass'
 * - 'bloom'
 * - 'RGBShift'
 * - 'dotShader'
 * - 'technicolorShader'
 * - 'luminosityShader'
 * - 'afterImagePass'
 * - 'sobelShader'
 * - 'colorifyShader'
 * - 'halftonePass'
 * - 'gammaCorrectionShader'
 * - 'kaleidoShader'
 * - 'copyShader'
 * - 'bleachBypassShader'
 * - 'toonShader'
 * - 'outputPass'
 * By defining MAGEFxPassOrder as a union of string literals, we can ensure that only valid pass names 
 * are used when specifying the order of post-processing effects in the MAGE engine. This helps to prevent 
 * errors and ensures that the engine can correctly apply the specified effects in the desired order.
*/
type MAGEFxPass = 
  | 'glitchPass' | 'bloom' | 'RGBShift' | 'dotShader' 
  | 'technicolorShader' | 'luminosityShader' | 'afterImagePass' 
  | 'sobelShader' | 'colorifyShader' | 'halftonePass' 
  | 'gammaCorrectionShader' | 'kaleidoShader' | 'copyShader' 
  | 'bleachBypassShader' | 'toonShader';

export type MAGEFxPassOrder = [...MAGEFxPass[], 'outputPass'];

/** 
 * MAGEFxAPI provides a set of methods for controlling the effects in the MAGE engine.
 * @description This interface allows users to get/set effect settings programmatically.
 * @example
 * engine.fx.setBloomEnabled(true);
 * engine.fx.setBloomStrength(1.5);
 * const isBloomEnabled = engine.fx.getBloomEnabled();
 */
export interface MAGEFxAPI {
  // Bloom Controls
  getBloomEnabled(): boolean;
  setBloomEnabled(value: boolean): void;
  getBloomStrength(): number;
  setBloomStrength(value: number): void;
  getBloomRadius(): number;
  setBloomRadius(value: number): void;
  getBloomThreshold(): number;
  setBloomThreshold(value: number): void;
  
  // RGB Shift Controls
  getRGBShiftEnabled(): boolean;
  setRGBShiftEnabled(value: boolean): void;
  getRGBShiftAmount(): number;
  setRGBShiftAmount(value: number): void;
  getRGBShiftAngle(): number;
  setRGBShiftAngle(value: number): void;
  
  // After Image Controls
  getAfterImageEnabled(): boolean;
  setAfterImageEnabled(value: boolean): void;
  getAfterImageDamp(): number;
  setAfterImageDamp(value: number): void;
  
  // Colorify Controls
  getColorifyEnabled(): boolean;
  setColorifyEnabled(value: boolean): void;
  getColorifyColor(): number;
  setColorifyColor(hex: number): void;
  
  // Kaleid Controls
  getKaleidEnabled(): boolean;
  setKaleidEnabled(value: boolean): void;
  getKaleidSides(): number;
  setKaleidSides(value: number): void;
  getKaleidAngle(): number;
  setKaleidAngle(value: number): void;
  
  // Tone Mapping Controls
  getToneMappingMethod(): any;
  setToneMappingMethod(method: any): void;
  getToneMappingExposure(): number;
  setToneMappingExposure(value: number): void;
  
  // Individual Pass Toggles
  getGlitchEnabled(): boolean;
  setGlitchEnabled(value: boolean): void;
  getDotEnabled(): boolean;
  setDotEnabled(value: boolean): void;
  getTechnicolorEnabled(): boolean;
  setTechnicolorEnabled(value: boolean): void;
  getLuminosityEnabled(): boolean;
  setLuminosityEnabled(value: boolean): void;
  getSobelEnabled(): boolean;
  setSobelEnabled(value: boolean): void;
  getHalftoneEnabled(): boolean;
  setHalftoneEnabled(value: boolean): void;
  getGammaCorrectionEnabled(): boolean;
  setGammaCorrectionEnabled(value: boolean): void;
  getCopyShaderEnabled(): boolean;
  setCopyShaderEnabled(value: boolean): void;
  getBleachBypassEnabled(): boolean;
  setBleachBypassEnabled(value: boolean): void;
  getToonEnabled(): boolean;
  setToonEnabled(value: boolean): void;
  getOutputPassEnabled(): boolean;
  setOutputPassEnabled(value: boolean): void;
  
  // Pass Order
  /** 
   * Gets the current order of post-processing passes applied in the MAGE engine. The order is represented as an array of pass names, 
     which can include any combination of the valid pass names defined in MAGEFxPassOrder. The order of the passes determines how 
     the post-processing effects are applied to the visual output, with earlier passes being applied before later ones. By retrieving 
     the current pass order, users can understand how the effects are currently configured and make informed decisions when modifying
     the pass order or enabling/disabling specific effects.
  */
  getPassOrder(): string[];
  /** 
   * Sets the order of post-processing passes in the MAGE engine. The order is specified as an array of pass names, which must be 
     valid pass names defined in MAGEFxPassOrder. The order of the passes determines how the post-processing effects are applied 
     to the visual output, with earlier passes being applied before later ones.
  */
  setPassOrder(order: MAGEFxPassOrder): void;
  getDefaultPassOrder(): MAGEFxPassOrder;
  movePass(fromIndex: number, newIndex: number): void;

  // randomize
  randomizeSettings(): void;
}

/**
 * @API MAGEEngineAPI
 * @description The MAGEEngineAPI provides a set of methods for controlling the MAGE engine, including audio management, preset loading, canvas manipulation, fullscreen toggling, engine time retrieval, preset conversion, viewport messaging, frame preview and thumbnail capture, and resource disposal. It serves as the primary interface for interacting with the MAGE engine and enables users to create and manipulate visual configurations in a flexible and efficient manner.
 * @example
 * const engine = initMAGE({ canvas: myCanvas, log: true, withControls: { active: true, integrated: false }, autoStart: true });
 * engine.loadPreset(myPreset);
 * engine.play();
 * const thumbnail = await engine.captureThumbnail({ width: 128, height: 128, type: 'image/jpeg', quality: 0.9, settleFrames: 5 });
 * console.log('Captured thumbnail:', thumbnail);
 * engine.dispose();
 */
/** Only listed settings may be changed live. Omitted fields retain their values. */
export interface MAGESettingsPatch {
  visualizer?: { scale?: number };
  controls?: {
    position0?: Partial<{ x: number; y: number; z: number }>;
    target0?: Partial<{ x: number; y: number; z: number }>;
    zoom0?: number;
  };
  intent?: {
    time_multiplier?: number; minimizing_factor?: number; power_factor?: number;
    pointerDownMultiplier?: number; base_speed?: number; easing_speed?: number;
    camTilt?: number; camOrientationMode?: number; camOrientationSpeed?: number;
    autoRotate?: boolean; autoRotateSpeed?: number; fov?: number;
  };
  state?: { volume_multiplier?: number };
  fx?: {
    passOrder?: Array<MAGEFxPass | 'outputPass'>;
    bloom?: { enabled?: boolean; strength?: number; radius?: number; threshold?: number };
    toneMapping?: { method?: number; exposure?: number };
    passes?: Partial<Record<'rgbShift' | 'dot' | 'technicolor' | 'luminosity' | 'afterImage' |
      'sobel' | 'glitch' | 'colorify' | 'halftone' | 'gammaCorrection' | 'kaleid' |
      'bleachBypass' | 'toon' | 'outputPass', boolean>>;
    params?: {
      rgbShift?: { amount?: number; angle?: number }; afterImage?: { damp?: number };
      colorify?: { color?: string }; kaleid?: { sides?: number; angle?: number };
    };
  };
}

export interface MAGEEngineAPI {
  /** Validates the entire delta before applying it. Throws TypeError for invalid input;
   * returns false after disposal. Retains the scene, effects, playback and camera state,
   * changing only supplied fields. A paused engine draws one frame without resuming. */
  updateSettings(patch: MAGESettingsPatch): boolean;
  /** Validates and copies bounded numeric input. Null detaches and resets the external session. */
  setExternalAudioFrame(value: MAGEExternalAudioFrame | null): void;
  /** Replaces the animation clock with a bounded host clock; null restores normal animation. */
  setExternalClock(value: MAGEExternalClock | null): void;
  /** Immutable copy of effective host-owned runtime ceilings. */
  getRenderBudget(): Readonly<MAGERenderBudget>;
  /**
   * Starts the MAGE engine, initiating the rendering loop and enabling audio playback.
   */
  start(): void;
  /** Stop rendering without disposing the scene. */
  stop(): void;
  /** Completed render submissions and render failures; independent of animation time. */
  subscribeRenderLifecycle(listener: (event: { type: 'frame' } | { type: 'error' }) => void): () => void;
  /**
   * Returns the total duration of the loaded audio in seconds. If no audio is loaded, it returns 0.
   */
  getAudioDuration(): number;
  /**
   * Returns the current playback time of the audio in seconds. If no audio is loaded, it returns 0.
   */
  getAudioTime(): number;
  /** Returns the active master volume, between 0 and 1. */
  getAudioVolume(): number;
  /** Sets both audio sources' volume, clamped between 0 and 1. Returns the applied volume. */
  setAudioVolume(volume: number): number;
  /**
   * Seeks to a specific time in the audio playback.
   * @param time 
   */
  seek(time: number): boolean;
  /**
   * Seeks the audio playback by a specific time offset in seconds. Positive values will seek forward, while negative values will seek backward.
   * @param time 
   */
  scrubAudio(time: number): boolean;
  /**
   * Plays the audio if it is loaded and not already playing. If the audio is already playing, this method has no effect.
   */
  play(): void;
  /**
   * Pauses the audio if it is currently playing. If the audio is already paused or no audio is loaded, this method has no effect.
   */
  pause(): void;
  /**
   * Returns true if the audio is currently playing, false otherwise. If no audio is loaded, it returns false.
   */
  isAudioLoaded(): boolean;
  /**
   * Loads audio from a URL/filepath.
   * @param path - The URL or filepath of the audio to load. This can be a string representing the path to the audio file or a URL pointing to an audio resource 
   * (URL must support CORS so things like YouTube will not work). 
   */
  loadAudio(path?: string | URL): void;
  /** Unloads the currently loaded audio and clears playback state. */
  unloadAudio(): void;
  /**
   * Enables or disables a silent, deterministic beat signal for lightweight scene previews.
   * Playing audio always takes precedence over the synthetic signal.
   * @param enabled Whether synthetic preview reactivity is enabled.
   * @param seed Stable value used to vary the preview rhythm.
   * @param tempoScale Preview-only tempo multiplier, clamped to 0.25-2; defaults to 1.
   */
  setSyntheticPreview(enabled: boolean, seed?: number, tempoScale?: number): void;
  /** Select versioned audio analysis. Missing/legacy preserves the original mapping. */
  setAudioResponseMode(mode?: AudioResponseMode): void;
  /** Updates settings without restarting playback. Mode remains explicitly opt-in. */
  setAudioResponseConfig(value: unknown): AudioResponseConfig;
  getAudioResponseConfig(): AudioResponseConfig | null;
  /** Non-consuming snapshot of the audio-clock analysis. */
  getAudioAnalysis(): AudioAnalysisSnapshot;
  getAudioResponseCapabilities(): {
    mode: AudioResponseMode; signals: AudioResponseSignal[]; targets: AudioResponseTarget[];
    supportedTargets: AudioResponseTarget[]; unsupportedTargets: AudioResponseTarget[]; warnings: string[];
  };
  /** Declared uniforms are routed independently, including event times in audioTime's clock. */
  getAudioResponseOutputs(): Record<string, number>;
  getAudioResponseEvents(afterId?: number): AudioResponseEvent[];
  getAudioResponseDiagnostics(): {
    mode: AudioResponseMode; config: AudioResponseConfig | null; analysis: AudioAnalysisSnapshot;
    outputs: Record<string, number>; events: AudioResponseEvent[]; source: 'audio' | 'synthetic' | 'none';
  };
  /**
   * Loads a MAGEPreset into the engine, applying all the settings and configurations contained in the preset to recreate the visual output. 
   * @param {MAGEPreset} preset - presetInput The preset to load into the engine.
   */
  loadPreset(preset: MAGEPreset): void;
  /** Applies an already compiled artifact. Shader source is retained only as inert metadata; no source fallback occurs. */
  loadCompiledPreset(preset: MAGEPreset, artifact: CompiledShaderArtifact): MAGEPreset;
  /**
   * Swaps the current rendering canvas with a new HTMLCanvasElement. This allows users to change the output canvas dynamically, which can be useful for 
   * integrating the MAGE engine into different parts of a web application or for implementing features like picture-in-picture or multi-view setups.
   * @param canvas 
   */
  swapCanvas(canvas: HTMLCanvasElement): void;
  /**
   * Toggles fullscreen mode for the MAGE engine's rendering canvas. When called, it will attempt to enter fullscreen mode if the canvas is not currently in 
   * fullscreen, or exit fullscreen mode if it is already in fullscreen.
   */
  toggleFullscreen(): void;
  /**
   * Returns the current engine time in seconds, which represents the total elapsed time since the engine was started. This can be used for synchronizing animations,
   * effects, or other time-based features within the MAGE engine. The engine time continues to advance as long as the engine is running, regardless of audio playback state.
   * @return The current engine time in seconds.
   */
  getEngineTime(): number;
  /**
   * Exports the current engine configuration as a preset object. The exported preset can include the current state, custom settings, and visualizer configuration, 
   * depending on the specified options.
   * @returns {MAGEPreset|Object} The exported preset as a MAGEPreset instance or a compact object depending on the specified schema.
   */
  toPreset(): MAGEPreset;
  /**
   * Displays a temporary message overlay on the viewport with the specified text. The message will automatically disappear after a certain duration, which can be customized by providing the durationMs parameter. This can be useful for providing feedback to users, such as confirming that a preset has been loaded, an action has been performed, or displaying any other relevant information without needing to use console logs or external UI elements.
   * @param message The text message to display on the viewport.
   * @param durationMs Optional duration in milliseconds for how long the message should be displayed before automatically disappearing. If not provided, a default duration will be used.
   */
  showViewportMessage(message: string, durationMs?: number): void;
  /**
   * Applies externally managed input state for this frame.
   * Calling this method automatically activates external input mode.
   */
  setInputState(inputState?: InputState): void;
  /**
   * Attaches an external input source adapter.
   */
  attachInputSource(inputSource?: InputSource | null): void;
  /**
   * Detaches any external input source and returns to internal window input listeners.
   */
  detachInputSource(): void;
  /**
   * Captures a single frame preview of the current visual output of the MAGE engine and returns it as a data URL string. 
   * @param options An optional object that specifies the options for capturing the frame preview, including width, height, type, and quality.
   * @return A promise that resolves to a data URL string representing the captured frame preview image, or null if the capture failed.
   */
  captureFramePreview(options?: CaptureFramePreviewOptions): Promise<string | null>;
  /**
   * Captures a thumbnail for a MAGEPreset object using a separate MAGEEngine instance and returns the image as a data URL string.
   * @param {MAGEPreset} preset - The MAGEPreset for which to capture the thumbnail. This preset will be loaded into a temporary MAGEEngine instance to generate the thumbnail.
   * @param options - An optional object that specifies the options for capturing the thumbnail, including width, height, type, quality, and settleFrames. The settleFrames option allows waiting for a specified number of frames to ensure the scene is stable before capturing the thumbnail.
   * @return A promise that resolves to a data URL string representing the captured thumbnail image, or null if the capture failed.
   */
  captureThumbnail(preset: MAGEPreset, options?: CaptureThumbnailOptions): Promise<string | null>;
  /**
   * Disposes of the MAGE engine instance, releasing all resources, stopping any ongoing processes, and cleaning up event listeners. 
   * After calling dispose, the engine instance should not be used anymore, and a new instance should be created if needed. 
   * This method is important for preventing memory leaks and ensuring that resources are properly released when the engine is no longer needed.
   */
  dispose(): void;
  /**
   * Initializes the tweakpane controls for the MAGE engine. This method sets up the user interface controls that 
   * allow users to interact with and modify the parameters of the MAGE engine in real-time. Also enables orbit controls for the camera,
   * allowing users to navigate the 3D scene by clicking and dragging the mouse. This method should be called after the engine has been initialized and is ready to accept user input.
   */
  initControls(inputSource?: InputSource | null): void;
  /**
   * MAGE Fx field provides access to the MAGEFxAPI for controlling post-processing effects.
   * This field is available if the engine was initialized with withControls.active set to true, 
   * which enables the creation of UI controls for managing effects. 
   * The MAGEFxAPI includes methods for getting and setting effect settings programmatically, 
   * allowing users to control various post-processing effects such as bloom, RGB shift, after image, colorify, kaleid, tone mapping, and individual pass toggles.
   */
  readonly fx: MAGEFxAPI;
  /**
   * Opens the preset dock, which is a user interface component that allows users to browse and select default MAGE presets. 
   * The preset dock is intended as a default method and is not necessarily required for all hosts. It is designed to provide
   * several examples of presets and can be used as a reference for how to implement preset browsing and selection in different
   * host applications. The implementation of the preset dock may vary depending on the specific requirements and design of the 
   * host application, and it is not a mandatory feature for all MAGE engine integrations.
   */
  openPresetDock(): void;
}

/**
 * Configuration options for the MAGE Engine.
 */
/** Host configuration only; requested values can lower but never raise platform ceilings. */
export interface MAGERenderBudget {
  maxRenderPixels: number;
  maxLongestEdge: number;
  maxDevicePixelRatio: number;
  maxFramesPerSecond: number;
  maxRaymarchIterations: number;
}

export interface MAGEConfig {
  renderBudget?: Partial<MAGERenderBudget>;
  /** The HTML canvas element to render the engine on. */
  canvas: HTMLCanvasElement;
  /** Optional render density, capped by the host render budget (at most 1.5); defaults to the device pixel ratio. */
  pixelRatio?: number;
  /** Whether to enable engine logging. Defaults to false. */
  log?: boolean;
  /** Configuration for UI and input controls. */
  withControls?: {
    /** Whether controls are currently enabled. */
    active?: boolean;
    /** Whether controls are integrated directly into the engine. */
    integrated?: boolean;
  };
  /** Whether the engine should start automatically after initialization. */
  autoStart?: boolean;
}

/**
 * Initializes the MAGE engine with the specified options.
 * @param {MAGEConfig} options - The options for initializing the MAGE engine.
 * @return An object containing the initialized MAGE engine API for controlling the engine and its features.
 * @description This function serves as the main entry point for creating and configuring a MAGE engine instance. 
 */
export declare function initMAGE(options?: Partial<MAGEConfig>): MAGEEngineAPI;

/**
  * @param canvas The HTMLCanvasElement to render the preview on.
  * @param preset The MAGEPreset to preview. This preset will be loaded into the temporary MAGEEngine instance for rendering.
  * @param frameCount The number of frames to render the preview for before automatically disposing of the preview instance.
  * @return A MAGEEngine instance that is rendering the preview of the specified preset. 
  * @description This function creates a temporary MAGEEngine instance, loads the specified preset into it, and starts rendering. 
    The preview must be manually disposed by the caller when it is no longer needed to free up resources. 
    This function is useful for generating quick previews of presets without affecting the main engine instance, 
    allowing users to see what a preset looks like before applying it to their main scene.
*/
export declare function previewMAGE(canvas: HTMLCanvasElement, preset: MAGEPreset, frameCount?: number): MAGEEngineAPI;
