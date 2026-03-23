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
  assetBaseUrl: '../resources', // Optional: base URL for assets (default: '../resources')
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
import { MAGEEngine, MAGEPreset } from './MAGEEngine.js';
import { initControls } from './controls.js';
import { getEmbeddedPresetById } from './presets.js';

export { MAGEEngine, MAGEPreset, initControls };

export function applyEmbeddedPreset(engine, presetId) {
  if (!engine || typeof engine.loadPreset !== 'function') {
    return false;
  }
  const preset = getEmbeddedPresetById(presetId);
  if (!preset) {
    return false;
  }
  return Boolean(engine.loadPreset(preset));
}

export function initMAGE({
  canvas,
  withControls = true,
  autoStart = false,
  options = { log: true },
} = {}) {
  // Initialize the MAGE Engine with the provided canvas and configuration options.
  const engine = new MAGEEngine(canvas, options);

  // Controls require initialized renderer/camera/controls
  if (autoStart || withControls) {
    engine.start();
  }

  // Initialize controls if requested
  const controls = withControls
    ? initControls(engine)
    : null;
  
  // Return the initialized engine and controls (if created) for external use.
  return { engine, controls };
}
