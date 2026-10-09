const EMBEDDED_PRESET_V2_MODULES = import.meta.glob('../resources/presets/*/preset.v2.json', {
  eager: true,
});

const EMBEDDED_PRESET_V1_MODULES = import.meta.glob('../resources/presets/*/preset.json', {
  eager: true,
});

const EMBEDDED_PRESET_RECORDS = new Map();

function getPresetIdFromPath(path) {
  const match = /\/presets\/preset(\d+)\//.exec(path);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function readModuleJson(moduleValue) {
  if (!moduleValue || typeof moduleValue !== 'object') {
    return null;
  }
  if ('default' in moduleValue) {
    return moduleValue.default;
  }
  return moduleValue;
}

function loadEmbeddedPresets() {
  if (EMBEDDED_PRESET_RECORDS.size > 0) {
    return;
  }

  for (const [path, moduleValue] of Object.entries(EMBEDDED_PRESET_V1_MODULES)) {
    const id = getPresetIdFromPath(path);
    const json = readModuleJson(moduleValue);
    if (id === null || !json) {
      continue;
    }
    EMBEDDED_PRESET_RECORDS.set(id, json);
  }

  // Prefer v2 files whenever present.
  for (const [path, moduleValue] of Object.entries(EMBEDDED_PRESET_V2_MODULES)) {
    const id = getPresetIdFromPath(path);
    const json = readModuleJson(moduleValue);
    if (id === null || !json) {
      continue;
    }
    EMBEDDED_PRESET_RECORDS.set(id, json);
  }
}

export function getEmbeddedPresetById(id) {
  loadEmbeddedPresets();
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return null;
  }
  const data = EMBEDDED_PRESET_RECORDS.get(numericId);
  return MAGEPreset.from(data);
}

export function getEmbeddedPresetIds() {
  loadEmbeddedPresets();
  return [...EMBEDDED_PRESET_RECORDS.keys()].sort((a, b) => a - b);
}



export class MAGEPreset {
  constructor({
    controls = null,
    settings = null,
    state = null,
    intent = null,
    fx = null,
    visualizer = null,
    audioPath = null,
  } = {}) {
    this.controls = controls;
    this.settings = settings;
    this.state = state;
    this.intent = intent;
    this.fx = fx;
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
      intent: data.intent ?? null,
      fx: data.fx ?? null,
      visualizer: data.visualizer ?? null,
      audioPath: data.audioPath ?? data.audio ?? null,
    });
  }
}