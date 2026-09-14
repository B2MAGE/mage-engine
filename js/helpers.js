export function reverseAudioBuffer (buffer, audioContext) {
  const reversedBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const originalData = buffer.getChannelData(channel);
    const reversedData = reversedBuffer.getChannelData(channel);
    for (let i = 0; i < originalData.length; i++) {
      reversedData[i] = originalData[originalData.length - 1 - i];
    }
  }

  return reversedBuffer;
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function averageBand(freqData, startIndex, endIndex) {
  if (!freqData || freqData.length === 0) {
    return 0;
  }

  const lastIndex = Math.min(freqData.length - 1, endIndex);
  let total = 0;
  let weightSum = 0;

  for (let index = Math.max(0, startIndex); index <= lastIndex; index++) {
    const normalizedValue = clamp01((freqData[index] ?? 0) / 255);
    const weight = 1 + (index - startIndex) * 0.05;
    total += normalizedValue * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? total / weightSum : 0;
}

/**
 * Normalizes FFT data into stable audio features for visual mapping.
 * @param {ArrayLike<number>} freqData
 * @param {number} [previousEnergy=0]
 * @returns {{ bass: number, mid: number, treble: number, energy: number, centroid: number, energyTrend: number }}
 */
export function normalizeAudioFeatures(freqData, previousEnergy = 0) {
  if (!freqData || freqData.length === 0) {
    return {
      bass: 0,
      mid: 0,
      treble: 0,
      energy: 0,
      centroid: 0,
      energyTrend: 0.5,
    };
  }

  // since sample rate is not always known, use logarithmic scaling of human hearing to approximate based on bin numbers
  const totalBins = freqData.length;

  const bassStart = Math.floor(totalBins * 0.001); // Bottom edge (~20Hz)
  const bassEnd   = Math.floor(totalBins * 0.011); // Top of bass (~250Hz)
  const midEnd    = Math.floor(totalBins * 0.166); // Top of mids (~4000Hz)
  const trebleEnd = Math.floor(totalBins * 0.666); // Top of musical treble (~16000Hz)

  const bass   = averageBand(freqData, bassStart, bassEnd);
  const mid    = averageBand(freqData, bassEnd + 1, midEnd);
  const treble = averageBand(freqData, midEnd + 1, trebleEnd);

  let sumSquares = 0;
  let weightedSum = 0;
  let amplitudeSum = 0;

  for (let index = 0; index < freqData.length; index++) {
    const normalizedValue = clamp01((freqData[index] ?? 0) / 255);
    sumSquares += normalizedValue * normalizedValue;
    weightedSum += normalizedValue * index;
    amplitudeSum += normalizedValue;
  }

  const energy = clamp01(Math.sqrt(sumSquares / freqData.length));
  const centroid = amplitudeSum > 0 ? clamp01(weightedSum / amplitudeSum / Math.max(1, freqData.length - 1)) : 0;
  const previousEnergyValue = Number.isFinite(previousEnergy) ? clamp01(previousEnergy) : 0;
  const energyTrend = clamp01(0.5 + (energy - previousEnergyValue) * 0.5);

  return {
    bass,
    mid,
    treble,
    energy,
    centroid,
    energyTrend,
  };
}

export function hashSeedString(seed) {
  return xmur3(seed)();
  // Return a stable 32-bit unsigned integer seed for deterministic generators.
  return hashFactory();
}

export function normalizeSeed(seed) {
  if (seed === undefined || seed === null) {
    return hashSeedString('mage-default-seed');
  }
  if (typeof seed === 'string') {
    return hashSeedString(seed);
  }
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    // Ensure numeric seeds are whole numbers and unsigned 32-bit.
    return Math.trunc(seed) >>> 0;
  }
  // Fallback: coerce other types to string and hash to an integer seed.
  return hashSeedString(String(seed));
}

export function xmur3(seedText) {
  // Ensure seedText is a string so callers may pass numbers or other types
  seedText = String(seedText);
  let hash = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    hash = Math.imul(hash ^ seedText.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return function nextHash() {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
}

export function mulberry32(seedInt) {
  let state = seedInt >>> 0;
  return function nextFloat() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Export input bridge adapters (helps postbuild JSDoc/type extraction)
export { createDomInputSource, createReactPointerHandlers } from './inputBridgeAdapter.js';