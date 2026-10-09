import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import test from 'node:test';
import { build } from 'vite';
import { compileShader } from '../dist/compiler.js';

test('production consumer worker preserves dynamically referenced helper functions', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = await build({ configFile: false, root, logLevel: 'silent', build: {
    write: false, target: 'es2022', minify: true,
    lib: { entry: fileURLToPath(new URL('../dist/compiler.js', import.meta.url)), name: 'CompilerWorker', formats: ['iife'] },
    rolldownOptions: { treeshake: false },
  } });
  const bundle = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk').code;
  const context = { console, TextEncoder };
  new Script(bundle + '\nthis.compiler = CompilerWorker;').runInNewContext(context);
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/compiler-parity.json', import.meta.url), 'utf8'));
  const sources = [...fixtures.fixtures.map(item => item.source), 'box(vec3(0.5));', 'torus(0.5, 0.1);',
    'cylinder(0.5, 0.2);', 'setStepSize(0.8); setMaxIterations(96); sphere(0.5);'];
  for (const source of sources) {
    assert.equal(JSON.stringify(context.compiler.compileShader(source)), JSON.stringify(compileShader(source)));
  }
});
