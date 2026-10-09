import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'vite';
import { parseScript } from 'esprima';

const root = fileURLToPath(new URL('../', import.meta.url));
const shared = ['audio-analysis', 'audio-mapping', 'audio-response', 'compiled-shader', 'live-settings', 'compiler'];
const shaderPark = await readFile(resolve(root, 'node_modules/shader-park-core/dist/shader-park-core.esm.js'), 'utf8');
const shell = {};
// ShaderPark does not export its Three header/vertex scaffold. Extract only
// static string data from the pinned package; never execute source to obtain it.
for (const name of ['threeHeader', 'usePBRHeader', 'useHemisphereLight', 'sculptureStarterCode', 'fragFooter', 'threeJSVertexSource']) {
  const declaration = `var ${name} = `;
  const at = shaderPark.indexOf(declaration);
  if (at < 0 || shaderPark.indexOf(declaration, at + declaration.length) >= 0) throw new Error(`Ambiguous scaffold: ${name}`);
  const literal = shaderPark.slice(at + declaration.length).match(/^(?:"(?:[^"\\\n\r]|\\.)*"|'(?:[^'\\\n\r]|\\.)*');/)?.[0];
  if (!literal) throw new Error(`Non-static scaffold: ${name}`);
  const expression = parseScript(literal).body[0]?.expression;
  if (expression?.type !== 'Literal' || typeof expression.value !== 'string') throw new Error(`Non-string scaffold: ${name}`);
  shell[name] = expression.value;
}
const shellSource = '// Generated from the pinned ShaderPark dependency by build-package.mjs. Do not edit.\n'
  + `export const COMPILED_SHADER_SHELL = Object.freeze(${JSON.stringify(shell, null, 2)});\n`;
await writeFile(resolve(root, 'js/compiled-shader-shell.generated.js'), shellSource);

const external = id => shared.some(name => id.replaceAll('\\', '/').endsWith(`/${name}.js`))
  || id.replaceAll('\\', '/').endsWith('/compiled-shader-shell.generated.js');
await build({ configFile: false, root, build: {
  lib: { entry: resolve(root, 'js/mage-lib.js'), name: 'MAGE', fileName: () => 'mage-engine.js', formats: ['es'] },
  sourcemap: true, minify: false, outDir: 'dist', emptyOutDir: true,
  rolldownOptions: { external, output: { paths: id => './' + id.replaceAll('\\', '/').split('/').at(-1) } },
} });

// Dynamic ShaderPark helpers are called through eval; static tree shaking and
// minification cannot prove them unused. Keep the complete lexical environment.
await build({ configFile: false, root, build: {
  lib: { entry: resolve(root, 'js/shader-park-compiler.js'), formats: ['es'], fileName: () => 'shader-park-compiler.generated.js' },
  sourcemap: true, minify: false, outDir: 'dist', emptyOutDir: false,
  rolldownOptions: { treeshake: false },
} });
await writeFile(resolve(root, 'dist/compiled-shader-shell.generated.js'), shellSource);
for (const name of shared) {
  const source = await readFile(resolve(root, `js/${name}.js`), 'utf8');
  // Source modules use the maintained adapter; the distributed entry uses its
  // self-contained build so consumers need no compiler dependencies or scripts.
  await writeFile(resolve(root, `dist/${name}.js`), name === 'compiler'
    ? source.replace("from './shader-park-compiler.js'", "from './shader-park-compiler.generated.js'")
    : source);
}
for (const filename of await readdir(resolve(root, 'types'))) {
  await cp(resolve(root, 'types', filename), resolve(root, 'dist', filename));
}
await mkdir(resolve(root, 'dist/licenses'), { recursive: true });
await cp(resolve(root, 'node_modules/shader-park-core/LICENSE'), resolve(root, 'dist/licenses/ShaderPark-LICENSE'));
await cp(resolve(root, 'node_modules/three/LICENSE'), resolve(root, 'dist/licenses/Three-LICENSE'));
