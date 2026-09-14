import { initMAGE, previewMAGE } from '@notrac/mage';

let engine;

window.addEventListener('load', () => {
  const engine = initMAGE();
  engine.start();
  const controls = engine.fx;
  controls.setBloomEnabled(true);
  controls.getBloomStrength();
  const passOrder = controls.getPassOrder();
  controls.setPassOrder()
  controls.randomizeSettings()

  // Public embed API: host pages can fetch presets from any source
  // (DB, API, CMS) and apply them directly through the engine.
  window.mageEngine = engine;
});
