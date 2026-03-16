import { MAGEEngine, MAGEPreset } from './MAGEEngine.js';
import { initControls } from './controls.js';

export { MAGEEngine, MAGEPreset, initControls };

export function initMAGE({
  canvas,
  withControls = true,
  autoStart = false,
} = {}) {
  const engine = new MAGEEngine(canvas);

  // Controls require initialized renderer/camera/controls
  if (autoStart || withControls) {
    engine.start();
  }

  const controls = withControls ? initControls(engine) : null;
  return { engine, controls };
}
