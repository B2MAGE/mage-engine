import { MAGEEngine, MAGEPreset } from './MAGEEngine.js';
import { initControls } from './controls.js';

export { MAGEEngine, MAGEPreset, initControls };

export function initMAGE({
  canvas,
  withControls = true,
  autoStart = false,
  assetBaseUrl = '../resources',
} = {}) {
  const engine = new MAGEEngine(canvas);

  // Public config used by controls/preset helpers to resolve static assets.
  engine.assetBaseUrl = assetBaseUrl;

  // Controls require initialized renderer/camera/controls
  if (autoStart || withControls) {
    engine.start();
  }

  const controls = withControls
    ? initControls(engine, { assetBaseUrl })
    : null;
  
  return { engine, controls };
}
