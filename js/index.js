import { MAGEEngine } from './MAGEEngine.js';
import { initControls } from './controls.js';

let engine;

window.addEventListener('load', () => {
  engine = new MAGEEngine();
  engine.start();
  initControls(engine);

  // Public embed API: host pages can fetch presets from any source
  // (DB, API, CMS) and apply them directly through the engine.
  window.mageEngine = engine;
});
