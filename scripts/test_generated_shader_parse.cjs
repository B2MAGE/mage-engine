// scripts/test_generated_shader_parse.cjs
// Shader generator regression test: runs generator for all families/seeds and checks Shader Park parser compatibility

const path = require('path');
const { generateShader } = require(path.join(__dirname, '../js/generateshaderparkcode.js'));
const { sculptToGLSL } = require('shader-park-core');

const families = ['ORB', 'BLOB', 'GRID', 'HELIX', 'HYBRID', 'COMPLEX'];
const seedsPerFamily = 30;
const complexity = 0.65;

let total = 0, fails = 0;
const failDetails = [];

for (const fam of families) {
  for (let i = 0; i < seedsPerFamily; i++) {
    total++;
    const seed = `${fam}-seed-${i}`;
    let code;
    try {
      code = generateShader(seed, { family: fam, complexity }).code;
      sculptToGLSL(code);
    } catch (e) {
      fails++;
      if (failDetails.length < 10) {
        failDetails.push({ fam, seed, error: String(e), code: code ? code.split('\n').slice(0, 20).join('\n') : '' });
      }
    }
  }
}

console.log(`\nShader Generator Parse Test Results:`);
console.log(`Total tested: ${total}`);
console.log(`Failures: ${fails}`);
if (failDetails.length) {
  console.log(`\nSample failures:`);
  for (const { fam, seed, error, code } of failDetails) {
    console.log(`\n--- FAIL: ${fam} ${seed} ---`);
    console.log(error);
    console.log(code);
  }
}
if (fails === 0) {
  console.log('All generated shaders parsed successfully!');
} else {
  console.log('Some generated shaders failed to parse. See above for details.');
  process.exit(1);
}
