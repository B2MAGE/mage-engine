// Data-only runtime settings. Structural presets and playback state have no path
// through this API. Bounds mirror the frontend's version-1 scene policy.
const number = (min, max, integer = false) => ({ min, max, integer });
const angle = number(-Math.PI * 2, Math.PI * 2);
const vector = { x: number(-1000, 1000), y: number(-1000, 1000), z: number(-1000, 1000) };
export const LIVE_EFFECT_PASSES = Object.freeze({
  rgbShift: 'RGBShift', dot: 'dotShader', technicolor: 'technicolorShader',
  luminosity: 'luminosityShader', afterImage: 'afterImagePass', sobel: 'sobelShader',
  glitch: 'glitchPass', colorify: 'colorifyShader', halftone: 'halftonePass',
  gammaCorrection: 'gammaCorrectionShader', kaleid: 'kaleidoShader',
  bleachBypass: 'bleachBypassShader', toon: 'toonShader', outputPass: 'outputPass',
});
const passNames = new Set([...Object.values(LIVE_EFFECT_PASSES), 'bloom', 'copyShader']);
const schema = {
  visualizer: { scale: number(1, 200) },
  controls: { position0: vector, target0: vector, zoom0: number(.01, 100) },
  intent: {
    time_multiplier: number(0, 10), minimizing_factor: number(.01, 2),
    power_factor: number(1, 10), pointerDownMultiplier: number(0, 10),
    base_speed: number(0, 1), easing_speed: number(0, 1), camTilt: angle,
    camOrientationMode: number(0, 2, true), camOrientationSpeed: number(0, 10),
    autoRotate: 'boolean', autoRotateSpeed: number(-50, 50), fov: number(1, 179),
  },
  state: { volume_multiplier: number(0, 10) },
  fx: {
    passOrder: 'passOrder',
    bloom: { enabled: 'boolean', strength: number(0, 10), radius: number(-10, 10), threshold: number(0, 10) },
    toneMapping: { method: 'toneMapping', exposure: number(0, 10) },
    passes: Object.fromEntries(Object.keys(LIVE_EFFECT_PASSES).map(key => [key, 'boolean'])),
    params: {
      rgbShift: { amount: number(0, .1), angle }, afterImage: { damp: number(0, 1) },
      colorify: { color: 'color' }, kaleid: { sides: number(1, 24, true), angle },
    },
  },
};

/** Clone and validate the complete delta before touching engine state. */
export function normalizeLiveSettings(input) {
  const invalid = () => { throw new TypeError('Invalid live settings patch.'); };
  const visit = (value, rule) => {
    if (rule === 'boolean') { if (typeof value !== 'boolean') invalid(); return value; }
    if (rule === 'color') { if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) invalid(); return value; }
    if (rule === 'toneMapping') { if (![0, 1, 2, 3, 4, 6, 7].includes(value)) invalid(); return value; }
    if (rule === 'passOrder') {
      if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
      const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
      if (!Number.isInteger(length) || length > 16 || Reflect.ownKeys(value).length !== length + 1) invalid();
      const result = [];
      for (let index = 0; index < length; index++) {
        const entry = Object.getOwnPropertyDescriptor(value, String(index));
        if (!entry?.enumerable || !Object.hasOwn(entry, 'value') || !passNames.has(entry.value) || result.includes(entry.value)) invalid();
        result.push(entry.value);
      }
      return result;
    }
    if (Object.hasOwn(rule, 'min')) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.min || value > rule.max || rule.integer && !Number.isInteger(value)) invalid();
      return value;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length > Object.keys(rule).length) invalid();
    const result = {};
    for (const key of keys) {
      if (typeof key !== 'string' || !Object.hasOwn(rule, key)) invalid();
      const entry = Object.getOwnPropertyDescriptor(value, key);
      if (!entry?.enumerable || !Object.hasOwn(entry, 'value')) invalid();
      const copy = visit(entry.value, rule[key]);
      if (typeof copy !== 'object' || Array.isArray(copy) || Object.keys(copy).length) result[key] = copy;
    }
    return result;
  };
  return visit(input, schema);
}

/** Enforce the aggregate limit against the resulting configuration, not delta size. */
export function validateLiveEffectBudget(patch, effects) {
  const fx = patch.fx;
  let count = (fx?.bloom?.enabled ?? effects.bloom.enabled) ? 1 : 0;
  for (const [key, pass] of Object.entries(LIVE_EFFECT_PASSES)) {
    if (key !== 'outputPass' && (fx?.passes?.[key] ?? effects[pass].enabled)) count++;
  }
  if (count > 4) throw new TypeError('Live settings exceed the optional effect limit.');
}
