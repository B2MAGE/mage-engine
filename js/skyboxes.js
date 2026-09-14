const REQUIRED_FACES = ['left', 'right', 'up', 'down', 'front', 'back'];

const rawSkyboxFiles = {
  ...import.meta.glob('../resources/skyboxes/skybox*/sky_*.jpg', { eager: true }),
  ...import.meta.glob('../resources/skyboxes/skybox*/sky_*.jpeg', { eager: true }),
  ...import.meta.glob('../resources/skyboxes/skybox*/sky_*.png', { eager: true }),
  ...import.meta.glob('../resources/skyboxes/skybox*/sky_*.webp', { eager: true }),
};

const EMBEDDED_SKYBOXES = {};

for (const [path, mod] of Object.entries(rawSkyboxFiles)) {
  const match = path.match(/skybox(\d+)\/sky_(left|right|up|down|front|back)\.[^/.]+$/i);
  if (!match) {
    continue;
  }

  const skyboxId = match[1];
  const face = match[2].toLowerCase();
  const url = typeof mod === 'string' ? mod : mod.default;
  if (!url) {
    continue;
  }

  if (!EMBEDDED_SKYBOXES[skyboxId]) {
    EMBEDDED_SKYBOXES[skyboxId] = {};
  }

  EMBEDDED_SKYBOXES[skyboxId][face] = url;
}

for (const skyboxId of Object.keys(EMBEDDED_SKYBOXES)) {
  const faces = EMBEDDED_SKYBOXES[skyboxId];
  const hasAllFaces = REQUIRED_FACES.every(face => typeof faces[face] === 'string');
  if (!hasAllFaces) {
    delete EMBEDDED_SKYBOXES[skyboxId];
  }
}

export function getEmbeddedSkyboxIds() {
  return Object.keys(EMBEDDED_SKYBOXES)
    .map(value => Number.parseInt(value, 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

export function getEmbeddedSkyboxFaces(presetId) {
  const key = `${presetId}`;
  const faces = EMBEDDED_SKYBOXES[key];
  if (!faces) {
    return null;
  }

  return {
    left: faces.left,
    right: faces.right,
    up: faces.up,
    down: faces.down,
    front: faces.front,
    back: faces.back,
  };
}

export function getRandomSkyboxId() {
  const ids = getEmbeddedSkyboxIds();
  if (ids.length === 0) {
    return null;
  }

  return ids[Math.floor(Math.random() * ids.length)];
}

export { EMBEDDED_SKYBOXES };
