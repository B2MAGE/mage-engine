const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const resourcesDir = path.join(projectRoot, 'resources');
const outputFile = path.join(projectRoot, 'js', 'skyboxes.js');

const FACE_NAMES = ['left', 'right', 'up', 'down', 'front', 'back'];
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function findFaceFile(presetDir, faceName) {
  for (const ext of EXTENSIONS) {
    const candidate = path.join(presetDir, `sky_${faceName}.${ext}`);
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, ext };
    }
  }
  return null;
}

function fileToDataUri(filePath, ext) {
  const bytes = fs.readFileSync(filePath);
  const base64 = bytes.toString('base64');
  return `data:${MIME_TYPES[ext]};base64,${base64}`;
}

function collectPresetIds() {
  const entries = fs.readdirSync(resourcesDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && /^preset\d+$/.test(entry.name))
    .map(entry => Number.parseInt(entry.name.replace('preset', ''), 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function collectPresetIdsWithCompleteSkyboxes() {
  const ids = collectPresetIds();
  const complete = [];

  for (const presetId of ids) {
    const presetDir = path.join(resourcesDir, `preset${presetId}`);
    let hasAnyFace = false;
    let isComplete = true;

    for (const faceName of FACE_NAMES) {
      const faceFile = findFaceFile(presetDir, faceName);
      if (faceFile) {
        hasAnyFace = true;
      } else {
        isComplete = false;
      }
    }

    if (!hasAnyFace) {
      continue;
    }

    if (!isComplete) {
      throw new Error(
        `Preset preset${presetId} has partial skybox images. Include all six faces (${FACE_NAMES.join(', ')}) or remove the partial files.`,
      );
    }

    complete.push(presetId);
  }

  return complete;
}

function parseArgs(argv) {
  const parsed = {
    minPreset: null,
    maxPreset: null,
    presetIds: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--minPreset' && i + 1 < argv.length) {
      parsed.minPreset = Number.parseInt(argv[++i], 10);
      continue;
    }
    if (token === '--maxPreset' && i + 1 < argv.length) {
      parsed.maxPreset = Number.parseInt(argv[++i], 10);
      continue;
    }
    if (token === '--presetIds' && i + 1 < argv.length) {
      parsed.presetIds = argv[++i]
        .split(',')
        .map(value => Number.parseInt(value.trim(), 10))
        .filter(Number.isFinite)
        .filter(value => value >= 0)
        .sort((a, b) => a - b);
    }
  }

  return parsed;
}

function buildTargetPresetIds(options) {
  if (Array.isArray(options.presetIds) && options.presetIds.length > 0) {
    return [...new Set(options.presetIds)];
  }

  const hasRange = Number.isFinite(options.minPreset) || Number.isFinite(options.maxPreset);
  if (!hasRange) {
    return collectPresetIdsWithCompleteSkyboxes();
  }

  const minPreset = Number.isFinite(options.minPreset) ? options.minPreset : 0;
  const maxPreset = Number.isFinite(options.maxPreset) ? options.maxPreset : minPreset;
  if (maxPreset < minPreset) {
    throw new Error(`Invalid range: maxPreset (${maxPreset}) is smaller than minPreset (${minPreset}).`);
  }

  const presetIds = [];
  for (let id = minPreset; id <= maxPreset; id++) {
    presetIds.push(id);
  }
  return presetIds;
}

function buildEmbeddedSkyboxes(targetPresetIds) {
  const embedded = {};
  const availablePresetIds = new Set(collectPresetIds());

  for (const presetId of targetPresetIds) {
    if (!availablePresetIds.has(presetId)) {
      throw new Error(`Missing resources folder for preset${presetId}.`);
    }

    const presetDir = path.join(resourcesDir, `preset${presetId}`);
    const faces = {};

    for (const faceName of FACE_NAMES) {
      const faceFile = findFaceFile(presetDir, faceName);
      if (!faceFile) {
        throw new Error(`Missing sky_${faceName} image in preset${presetId}. Expected one of: ${EXTENSIONS.join(', ')}.`);
      }
      faces[faceName] = fileToDataUri(faceFile.filePath, faceFile.ext);
    }

    embedded[presetId] = faces;
  }

  return embedded;
}

function toModuleSource(embedded) {
  const serialized = JSON.stringify(embedded, null, 2);

  return `const EMBEDDED_SKYBOXES = ${serialized};\n\n`
    + `function deepClone(value) {\n`
    + `  return JSON.parse(JSON.stringify(value));\n`
    + `}\n\n`
    + `export function hasEmbeddedSkybox(presetId) {\n`
    + `  const key = Number.parseInt(\`${'${presetId}'}\`, 10);\n`
    + `  return Number.isFinite(key) && Object.hasOwn(EMBEDDED_SKYBOXES, key);\n`
    + `}\n\n`
    + `export function getEmbeddedSkyboxFaces(presetId) {\n`
    + `  const key = Number.parseInt(\`${'${presetId}'}\`, 10);\n`
    + `  if (!Number.isFinite(key) || !Object.hasOwn(EMBEDDED_SKYBOXES, key)) {\n`
    + `    return null;\n`
    + `  }\n`
    + `\n`
    + `  return deepClone(EMBEDDED_SKYBOXES[key]);\n`
    + `}\n\n`
    + `export function registerEmbeddedSkybox(presetId, faces) {\n`
    + `  const key = Number.parseInt(\`${'${presetId}'}\`, 10);\n`
    + `  if (!Number.isFinite(key) || key < 0) {\n`
    + `    return false;\n`
    + `  }\n`
    + `\n`
    + `  if (!faces || typeof faces !== 'object' || Array.isArray(faces)) {\n`
    + `    return false;\n`
    + `  }\n`
    + `\n`
    + `  const requiredFaces = ['left', 'right', 'up', 'down', 'front', 'back'];\n`
    + `  for (const face of requiredFaces) {\n`
    + `    if (typeof faces[face] !== 'string' || !faces[face].startsWith('data:image/')) {\n`
    + `      return false;\n`
    + `    }\n`
    + `  }\n`
    + `\n`
    + `  EMBEDDED_SKYBOXES[key] = deepClone(faces);\n`
    + `  return true;\n`
    + `}\n\n`
    + `export { EMBEDDED_SKYBOXES };\n`;
}

function main() {
  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`Resources directory not found: ${resourcesDir}`);
  }

  const options = parseArgs(process.argv.slice(2));
  const targetPresetIds = buildTargetPresetIds(options);
  if (targetPresetIds.length === 0) {
    throw new Error('No complete skybox presets found. Add sky_left/right/up/down/front/back images under resources/presetX.');
  }

  const embedded = buildEmbeddedSkyboxes(targetPresetIds);
  const source = toModuleSource(embedded);

  fs.writeFileSync(outputFile, source, 'utf8');

  const generatedCount = Object.keys(embedded).length;
  const generatedIds = targetPresetIds.join(', ');
  console.log(
    `Generated ${path.relative(projectRoot, outputFile)} with ${generatedCount} embedded skybox preset(s) for ids: ${generatedIds}.`,
  );
}

main();
