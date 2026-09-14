// scripts/test_audio_analysis.cjs
// Audio-reactive generator regression test: validates normalization and audio-sensitive output stability.

const path = require('path');
const { pathToFileURL } = require('url');
const { sculptToGLSL } = require('shader-park-core');

function assert(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

(async () => {
  const helpersUrl = pathToFileURL(path.join(__dirname, '..', 'js', 'helpers.js')).href;
  const generatorUrl = pathToFileURL(path.join(__dirname, '..', 'js', 'generateshaderparkcode.js')).href;
  const { normalizeAudioFeatures } = await import(helpersUrl);
  const { generateShader } = await import(generatorUrl);

  const failures = [];

  const silent = normalizeAudioFeatures(new Uint8Array(64));
  assert(silent.bass === 0, 'silent bass should normalize to 0', failures);
  assert(silent.mid === 0, 'silent mid should normalize to 0', failures);
  assert(silent.treble === 0, 'silent treble should normalize to 0', failures);
  assert(silent.energy === 0, 'silent energy should normalize to 0', failures);
  assert(silent.centroid === 0, 'silent centroid should normalize to 0', failures);
  assert(silent.energyTrend === 0.5, 'silent energy trend should be neutral', failures);

  const bassHeavy = new Uint8Array(64);
  bassHeavy[1] = 255;
  bassHeavy[2] = 240;
  bassHeavy[3] = 220;
  bassHeavy[12] = 35;
  bassHeavy[18] = 20;
  const bassFeatures = normalizeAudioFeatures(bassHeavy, 0.1);
  assert(bassFeatures.bass > bassFeatures.mid, 'bass-heavy input should produce stronger bass than mid', failures);
  assert(bassFeatures.bass > bassFeatures.treble, 'bass-heavy input should keep bass above treble', failures);
  assert(bassFeatures.energy >= 0 && bassFeatures.energy <= 1, 'energy should be normalized', failures);
  assert(bassFeatures.centroid >= 0 && bassFeatures.centroid <= 1, 'centroid should be normalized', failures);
  assert(bassFeatures.energyTrend >= 0 && bassFeatures.energyTrend <= 1, 'energy trend should be normalized', failures);

  const audioStateA = {
    bass: 0.18,
    mid: 0.32,
    treble: 0.44,
    energy: 0.41,
    centroid: 0.57,
    energyTrend: 0.63,
    audioMappingIntensity: 1,
  };
  const audioStateB = {
    bass: 0.82,
    mid: 0.28,
    treble: 0.21,
    energy: 0.76,
    centroid: 0.29,
    energyTrend: 0.41,
    audioMappingIntensity: 1,
  };

  const shaderA = generateShader('audio-seed', { family: 'ORB', complexity: 0.85, audioState: audioStateA });
  const shaderARepeat = generateShader('audio-seed', { family: 'ORB', complexity: 0.85, audioState: audioStateA });
  const shaderB = generateShader('audio-seed', { family: 'ORB', complexity: 0.85, audioState: audioStateB });

  assert(shaderA.code === shaderARepeat.code, 'same seed and audio should generate identical shader code', failures);
  assert(JSON.stringify(shaderA.params) === JSON.stringify(shaderARepeat.params), 'same seed and audio should generate identical params', failures);
  assert(shaderA.code !== shaderB.code, 'different audio should influence generated shader code', failures);

  try {
    sculptToGLSL(shaderA.code);
  } catch (error) {
    failures.push(`generated shader should parse successfully: ${String(error)}`);
  }

  console.log('\nAudio Analysis Test Results:');
  console.log(`Failures: ${failures.length}`);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('All audio analysis checks passed!');
})().catch(error => {
  console.error('Audio analysis test crashed:', error);
  process.exit(1);
});
