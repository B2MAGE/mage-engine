// MAGE Engine - Modular Architecture for Graphics and Effects
// This module serves as the main entry point for the MAGE Engine, providing
// initialization and access to core components like the engine and controls.

/* USAGE:
import { initMAGE } from './mage-lib.js';
import { initMAGE } from './mage-engine.mjs // If using ES modules

Create a MAGE object with the desired configuration options. For example:
const { engine, controls } = initMAGE({
  canvas: document.getElementById('myCanvas'), // Optional: specify a canvas element
  withControls: true, // Optional: include controls (default: true)
  autoStart: true, // Optional: automatically start the engine (default: false)
  options: { log: true } // Optional: additional engine options (default: { log: true })
});

The returned object includes the initialized engine and controls (if created) for further use in your application.
i.e.
engine.start() -> Starts rendering inside the canvas element (begins as default preset)
engine.loadPreset(MAGEPreset.SOME_PRESET_JSON) -> Loads a preset from a JSON object or URL
engine.loadAudio('path/to/audio/file.mp3') -> Loads audio from a URL or file
engine.play() -> Plays the currently loaded audio (if not already playing)
engine.pause() -> Pauses the currently playing audio
engine.toPreset() -> returns the current preset as a MAGEPreset instance
*/


// Import core components and utilities
import { MAGEEngine } from './MAGEEngine.js';

export function initMAGE({ 
  canvas, 
  log = false, 
  withControls: { active = false, integrated = false } = {}, 
  autoStart = false, 
} = {}) {
  // Initialize the MAGE Engine with the provided canvas and configuration options.
  const engine = new MAGEEngine({ canvas, log, withControls:{ active, integrated }, autoStart });

  // Return the initialized engine and controls (if created) for external use.
  return engine;
}

export function previewMAGE(canvas, preset, frames) {
  const engine = MAGEEngine.previewPreset(canvas, preset, frames);
  return engine;
}

export function createViewportInputBridge(canvas) {
  const controller = new AbortController();

  const bridge = {
    clientX: Number.NaN,
    clientY: Number.NaN,
    pointerOverUi: false,
    currPointerDown: 0,
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

  const uiSelectors = [
    ".tp-dfwv",
    ".mage-pane-host",
    ".mage-embedded-presets",
    ".mage-fx-layers-overlay",
    ".mage-fx-studio-overlay",
    ".mage-fx-studio-dock",
    ".mage-scene-camera-dock",
    ".mage-dock-launcher",
    ".mage-engine__controls",
    ".mage-create-controls",
    ".mage-create-docks",
  ];

  const isUiEvent = (event) => {
    const target = event.target;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];

    // If event path does not include MAGE canvas, treat it as UI/host interaction.
    if (!path.includes(canvas)) {
      return true;
    }

    if (!(target instanceof Element)) {
      return false;
    }

    return uiSelectors.some((selector) => Boolean(target.closest(selector)));
  };

  const syncPointer = (event) => {
    bridge.clientX = event.clientX;
    bridge.clientY = event.clientY;
    bridge.pointerOverUi = isUiEvent(event);
  };

  const clearRequests = () => {
    bridge.requestToggleUI = false;
    bridge.requestResetVisualizer = false;
    bridge.requestNextShader = false;
    bridge.requestPreviousShader = false;
    bridge.requestWheelDirection = 0;
  };

  const resetState = () => {
    clearRequests();
    bridge.currPointerDown = 0;
  };

  const toInputState = () => ({
    clientX: bridge.clientX,
    clientY: bridge.clientY,
    pointerOverUi: bridge.pointerOverUi,
    currPointerDown: bridge.currPointerDown,
    requestToggleUI: bridge.requestToggleUI,
    requestResetVisualizer: bridge.requestResetVisualizer,
    requestNextShader: bridge.requestNextShader,
    requestPreviousShader: bridge.requestPreviousShader,
    requestWheelDirection: bridge.requestWheelDirection,
  });

  const inputSource = {
    getState: () => toInputState(),
    subscribe(handler) {
      const emit = (clearAfterEmit = false) => {
        handler(toInputState());
        if (clearAfterEmit) {
          clearRequests();
        }
      };

      window.addEventListener(
        "pointermove",
        (event) => {
          syncPointer(event);
          emit();
        },
        { capture: true, passive: true, signal: controller.signal }
      );

      window.addEventListener(
        "pointerdown",
        (event) => {
          syncPointer(event);
          if (bridge.pointerOverUi) {
            resetState();
            emit();
            return;
          }

          bridge.currPointerDown = 1.0;
          emit();
        },
        { capture: true, passive: true, signal: controller.signal }
      );

      window.addEventListener(
        "pointerup",
        (event) => {
          syncPointer(event);
          if (bridge.pointerOverUi) {
            resetState();
            emit();
            return;
          }

          bridge.currPointerDown = 0.0;
          if (event.button === 2 || event.button === 1) {
            bridge.requestToggleUI = true;
            bridge.onToggleUI?.();
          } else if (event.button === 0) {
            bridge.requestResetVisualizer = true;
            bridge.onHideQuickPresets?.();
          }

          emit(true);
        },
        { capture: true, passive: true, signal: controller.signal }
      );

      window.addEventListener(
        "wheel",
        (event) => {
          syncPointer(event);
          if (bridge.pointerOverUi) {
            emit();
            return;
          }

          bridge.requestWheelDirection = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0;
          emit(true);
        },
        { capture: true, passive: true, signal: controller.signal }
      );

      window.addEventListener(
        "blur",
        () => {
          resetState();
          emit();
        },
        { signal: controller.signal }
      );

      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) {
            resetState();
            emit();
          }
        },
        { signal: controller.signal }
      );

      return () => {
        controller.abort();
      };
    },
  };

  return { bridge, inputSource };
}