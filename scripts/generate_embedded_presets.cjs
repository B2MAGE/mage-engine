const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const resourcesDir = path.join(projectRoot, 'resources');
const outputFile = path.join(projectRoot, 'js', 'presets.js');

function collectPresetIds() {
  const entries = fs.readdirSync(resourcesDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && /^preset\d+$/.test(entry.name))
    .map(entry => Number.parseInt(entry.name.replace('preset', ''), 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function readPresetJsonFromDir(presetDir) {
  const candidates = ['preset.v2.json', 'preset.json'];

  for (const fileName of candidates) {
    const filePath = path.join(presetDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
  }

  return null;
}

function buildEmbeddedPresets() {
  const embedded = {};
  const presetIds = collectPresetIds();

  for (const presetId of presetIds) {
    const presetDir = path.join(resourcesDir, `preset${presetId}`);
    const preset = readPresetJsonFromDir(presetDir);
    if (!preset) {
      continue;
    }

    embedded[presetId] = preset;
  }

  return embedded;
}

function toModuleSource(embedded) {
  const serialized = JSON.stringify(embedded, null, 2);

  return `const EMBEDDED_PRESETS = ${serialized};\n\n`
    + `function deepClone(value) {\n`
    + `  return JSON.parse(JSON.stringify(value));\n`
    + `}\n\n`
    + `export function getEmbeddedPresetIds() {\n`
    + `  return Object.keys(EMBEDDED_PRESETS)\n`
    + `    .map(value => Number.parseInt(value, 10))\n`
    + `    .filter(Number.isFinite)\n`
    + `    .sort((a, b) => a - b);\n`
    + `}\n\n`
    + `export function getEmbeddedPresetById(presetId) {\n`
    + `  const key = Number.parseInt(\`${'${presetId}'}\`, 10);\n`
    + `  if (!Number.isFinite(key) || !Object.hasOwn(EMBEDDED_PRESETS, key)) {\n`
    + `    return null;\n`
    + `  }\n\n`
    + `  return deepClone(EMBEDDED_PRESETS[key]);\n`
    + `}\n\n`
    + `export function registerEmbeddedPreset(presetId, preset) {\n`
    + `  const key = Number.parseInt(\`${'${presetId}'}\`, 10);\n`
    + `  if (!Number.isFinite(key) || key < 0 || !preset || typeof preset !== 'object') {\n`
    + `    return false;\n`
    + `  }\n\n`
    + `  EMBEDDED_PRESETS[key] = deepClone(preset);\n`
    + `  return true;\n`
    + `}\n\n`
    + `export { EMBEDDED_PRESETS };\n`;
}

function main() {
  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`Resources directory not found: ${resourcesDir}`);
  }

  const embedded = buildEmbeddedPresets();
  if (Object.keys(embedded).length === 0) {
    throw new Error('No presets found. Expected resources/presetX/preset.v2.json or preset.json.');
  }

  const source = toModuleSource(embedded);
  fs.writeFileSync(outputFile, source, 'utf8');

  const ids = Object.keys(embedded)
    .map(value => Number.parseInt(value, 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  console.log(
    `Generated ${path.relative(projectRoot, outputFile)} with ${ids.length} embedded preset(s): ${ids.join(', ')}.`,
  );
}

main();
