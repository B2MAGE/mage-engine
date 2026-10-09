import { COMPILED_SHADER_SHELL as SHELL } from './compiled-shader-shell.generated.js';

export const COMPILED_SHADER_LIMITS = Object.freeze({
  fragBytes: 524288, vertBytes: 65536, geometryBytes: 262144, colorBytes: 262144,
  totalShaderBytes: 786432, uniforms: 80, uniformMagnitude: 1000000,
  maxIterations: 200, maxReflections: 2, minStepSize: 0.005, maxStepSize: 1,
});
const COMPONENTS = ['x', 'y', 'z', 'w'];
const TYPES = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
const REQUIRED = { time: 'float', opacity: 'float', _scale: 'float', mouse: 'vec3', stepSize: 'float', resolution: 'vec2' };
const RESERVED_UNIFORMS = new Set([
  '__proto__', 'prototype', 'constructor', 'projectionMatrix', 'modelViewMatrix', 'modelMatrix',
  'viewMatrix', 'normalMatrix', 'cameraPosition', 'msdf', 'worldPos', 'sculptureCenter',
  'position', 'normal', 'uv', 'pc_fragColor', 'MAX_ITERATIONS', 'MAX_REFLECTIONS', 'STEP_SIZE_CONSTANT',
  'PI', 'TAU', 'TWO_PI', 'max_dist', 'intersection_threshold', 'Material', 'ShadedMaterial',
]);
const fail = () => { throw new Error('Invalid compiled shader artifact.'); };
function record(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const keys = Reflect.ownKeys(value);
  if (keys.length < required.length || keys.length > required.length + optional.length
    || keys.some(key => typeof key !== 'string' || (!required.includes(key) && !optional.includes(key)))) fail();
  const data = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail();
    data[key] = descriptor.value;
  }
  if (required.some(key => !Object.hasOwn(data, key))) fail();
  return data;
}
function denseArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail();
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isInteger(length) || length < 0 || length > COMPILED_SHADER_LIMITS.uniforms) fail();
  if (Reflect.ownKeys(value).length !== length + 1) fail();
  const values = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail();
    values.push(descriptor.value);
  }
  return values;
}
function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > COMPILED_SHADER_LIMITS.uniformMagnitude) fail();
  return value;
}
function vector(value, dimensions) {
  const keys = COMPONENTS.slice(0, dimensions);
  const data = record(value, keys);
  return Object.fromEntries(keys.map(key => [key, number(data[key])]));
}
function uniform(value, names) {
  const data = record(value, ['name', 'type', 'value'], ['min', 'max']);
  if (typeof data.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(data.name)
    || /^(?:gl_|webgl_|_webgl_)/i.test(data.name) || data.name.includes('__')
    || RESERVED_UNIFORMS.has(data.name) || names.has(data.name)
    || typeof data.type !== 'string' || !Object.hasOwn(TYPES, data.type)) fail();
  names.add(data.name);
  const copy = data.type === 'float' ? number : value => vector(value, TYPES[data.type]);
  const result = { name: data.name, type: data.type, value: copy(data.value),
    ...(Object.hasOwn(data, 'min') ? { min: copy(data.min) } : {}),
    ...(Object.hasOwn(data, 'max') ? { max: copy(data.max) } : {}) };
  for (const key of data.type === 'float' ? [null] : COMPONENTS.slice(0, TYPES[data.type])) {
    const component = value => key === null ? value : value?.[key];
    const actual = component(result.value), min = component(result.min), max = component(result.max);
    if ((min !== undefined && actual < min) || (max !== undefined && actual > max)
      || (min !== undefined && max !== undefined && min > max)) fail();
  }
  return result;
}
function text(value, max) {
  if (typeof value !== 'string' || !value.length || value.length > max) fail();
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes > max) fail();
  return bytes;
}
function withoutComments(source) {
  // GLSL processes backslash line splicing before comments. Refuse it so token
  // boundaries here cannot differ from the driver's preprocessor.
  if (/[\\\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source)) fail();
  source = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  let result = '', offset = 0;
  while (offset < source.length) {
    if (source.startsWith('//', offset)) {
      const end = source.indexOf('\n', offset + 2);
      if (end < 0) return result + ' ';
      result += '\n'; offset = end + 1;
    } else if (source.startsWith('/*', offset)) {
      const end = source.indexOf('*/', offset + 2);
      if (end < 0) fail();
      result += source.slice(offset, end + 2).replace(/[^\n]/g, ' '); offset = end + 2;
    } else { result += source[offset++]; }
  }
  return result;
}
const SHELL_FUNCTIONS = new Set([...withoutComments(SHELL.sculptureStarterCode + SHELL.fragFooter)
  .matchAll(/\b([A-Za-z_]\w*)\s*\(/g)]
  .map(match => match[1]).filter(name => name !== 'surfaceDistance' && name !== 'shade'));
for (const name of SHELL_FUNCTIONS) RESERVED_UNIFORMS.add(name);
const GLSL_KEYWORDS = new Set(('attribute const uniform varying buffer shared coherent volatile restrict readonly writeonly '
  + 'atomic_uint layout centroid flat smooth noperspective patch sample break continue do for while switch case default '
  + 'if else subroutine in out inout float double int void bool true false invariant precise discard return '
  + 'mat2 mat3 mat4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uint uvec2 uvec3 uvec4 '
  + 'struct lowp mediump highp precision sampler2D samplerCube').split(' '));
for (const name of GLSL_KEYWORDS) RESERVED_UNIFORMS.add(name);

const shaderTokens = source => source.match(/[A-Za-z_][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[^\s]/g) ?? [];
// CSG intersect(float,float) and raymarch intersect(vec3,vec3,float) have
// different call graphs. Keep their arities separate when checking cycles.
const signature = (name, arity) => `${name}/${arity}`;
function argumentCounts(tokens) {
  const stack = [], counts = new Map();
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] === '(') stack.push({ index, count: tokens[index + 1] === ')'
      || (tokens[index + 1] === 'void' && tokens[index + 2] === ')') ? 0 : 1 });
    else if (tokens[index] === ',' && stack.length) stack.at(-1).count++;
    else if (tokens[index] === ')') {
      const call = stack.pop();
      if (!call) fail();
      counts.set(call.index, call.count);
    }
  }
  if (stack.length) fail();
  return counts;
}
function scaffoldCalls() {
  const clean = withoutComments(SHELL.sculptureStarterCode + SHELL.fragFooter);
  const graph = new Map();
  const definitions = /\b(?:void|float|int|bool|vec[234]|mat[234]|Material|ShadedMaterial)\s+([A-Za-z_]\w*)\s*\([^{};]*\)\s*\{/g;
  for (const match of clean.matchAll(definitions)) {
    const start = match.index + match[0].length;
    let end = start, depth = 1;
    while (end < clean.length && depth) {
      if (clean[end] === '{') depth++;
      if (clean[end] === '}') depth--;
      end++;
    }
    if (depth) fail();
    const parameters = match[0].slice(match[0].indexOf('(') + 1, match[0].lastIndexOf(')')).trim();
    const key = signature(match[1], parameters && parameters !== 'void' ? parameters.split(',').length : 0);
    const calls = graph.get(key) ?? new Set();
    const tokens = shaderTokens(clean.slice(start, end)), counts = argumentCounts(tokens);
    for (let index = 0; index < tokens.length; index++) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[index]) && tokens[index + 1] === '(') {
        calls.add(signature(tokens[index], counts.get(index + 1)));
      }
    }
    graph.set(key, calls);
  }
  return graph;
}
const SCAFFOLD_CALLS = scaffoldCalls();
function rejectRecursion(functions) {
  // Include calls through trusted helpers: intersect/shadow/occlusion call the
  // submitted surfaceDistance function and can otherwise hide a recursive cycle.
  const graph = new Map([...SCAFFOLD_CALLS, ...functions]);
  const incoming = new Map([...graph.keys()].map(name => [name, 0]));
  for (const calls of graph.values()) for (const call of calls) {
    if (incoming.has(call)) incoming.set(call, incoming.get(call) + 1);
  }
  const ready = [...incoming].filter(([, count]) => count === 0).map(([name]) => name);
  for (let index = 0; index < ready.length; index++) {
    for (const call of graph.get(ready[index])) if (incoming.has(call)) {
      const count = incoming.get(call) - 1;
      incoming.set(call, count);
      if (!count) ready.push(call);
    }
  }
  if (ready.length !== graph.size) fail();
}

function validateSnippet(source, entry, functions, uniformNames) {
  let clean = withoutComments(source);
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(clean)) fail();
  const conditionals = [];
  clean = clean.split('\n').map(line => {
    if (!line.includes('#')) return line;
    const directive = line.trim();
    if (directive === '#ifdef USE_PBR') conditionals.push(false);
    else if (directive === '#else' && conditionals.length && !conditionals.at(-1)) conditionals[conditionals.length - 1] = true;
    else if (directive === '#endif' && conditionals.length) conditionals.pop();
    else fail();
    return '';
  }).join('\n');
  if (conditionals.length || /["'`\[\]]/.test(clean)) fail();
  const tokens = shaderTokens(clean), counts = argumentCounts(tokens);
  if (tokens.some(token => ['for', 'while', 'do', 'uniform', 'attribute', 'varying', 'layout', 'buffer', 'struct',
    'precision', 'MAX_ITERATIONS', 'MAX_REFLECTIONS', 'STEP_SIZE_CONSTANT'].includes(token))) fail();
  const stack = [];
  let entryCount = 0;
  let calls = new Set();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    // Every top-level item must be a function definition: global variables,
    // prototypes and declarations cannot shadow the trusted scaffold.
    if (!stack.length) {
      if (!/^(?:void|float|int|bool|vec[234]|mat[234]|Material|ShadedMaterial)$/.test(token)) fail();
      const name = tokens[++index];
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name ?? '') || tokens[++index] !== '('
        || RESERVED_UNIFORMS.has(name) || uniformNames.has(name)
        || (name === 'surfaceDistance' && entry !== name) || (name === 'shade' && entry !== name)
        || /^(?:gl_|webgl_|_webgl_)/i.test(name) || name.includes('__')) fail();
      calls = new Set();
      const key = signature(name, counts.get(index));
      if (functions.has(key)) fail();
      functions.set(key, calls);
      if (name === entry) entryCount++;
      let depth = 1;
      while (++index < tokens.length && depth) {
        if (tokens[index] === '(') depth++;
        if (tokens[index] === ')') depth--;
        if (['{', '}', ';'].includes(tokens[index])) fail();
      }
      if (depth || tokens[index] !== '{') fail();
      stack.push('{');
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token) && tokens[index + 1] === '(') calls.add(signature(token, counts.get(index + 1)));
    if (['{', '(', '['].includes(token)) stack.push(token);
    else if (['}', ')', ']'].includes(token)) {
      if (stack.pop() !== ({ '}': '{', ')': '(', ']': '[' })[token]) fail();
    }
  }
  if (stack.length || entryCount !== 1) fail();
}
function shaderProgram(frag, uniforms, geoGLSL, colorGLSL, ceiling) {
  const prefix = SHELL.threeHeader + SHELL.usePBRHeader + SHELL.useHemisphereLight
    + uniforms.map(value => `uniform ${value.type} ${value.name};\n`).join('');
  if (!frag.startsWith(prefix)) fail();
  const header = frag.slice(prefix.length).match(/^const float STEP_SIZE_CONSTANT = (-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?);\nconst int MAX_ITERATIONS = (\d+);\n#define MAX_REFLECTIONS (\d+)\n/);
  if (!header) fail();
  const step = Number(header[1]), iterations = Number(header[2]), reflections = Number(header[3]);
  if (!Number.isFinite(step) || !Number.isSafeInteger(iterations) || !Number.isSafeInteger(reflections)
    || String(step) !== header[1] || String(iterations) !== header[2] || String(reflections) !== header[3]) fail();
  const suffix = SHELL.sculptureStarterCode + geoGLSL + '\n' + colorGLSL + '\n' + SHELL.fragFooter;
  if (frag !== prefix + header[0] + suffix) fail();
  const functions = new Map(), names = new Set(uniforms.map(value => value.name));
  validateSnippet(geoGLSL, 'surfaceDistance', functions, names);
  validateSnippet(colorGLSL, 'shade', functions, names);
  rejectRecursion(functions);
  return prefix + `const float STEP_SIZE_CONSTANT = ${Math.min(COMPILED_SHADER_LIMITS.maxStepSize, Math.max(COMPILED_SHADER_LIMITS.minStepSize, step))};\n`
    + `const int MAX_ITERATIONS = ${Math.min(ceiling, iterations)};\n#define MAX_REFLECTIONS ${Math.min(COMPILED_SHADER_LIMITS.maxReflections, reflections)}\n` + suffix;
}

/** Strict data and scaffold policy. It cannot certify arbitrary GPU work safe. */
export function normalizeCompiledShader(value, { maxRaymarchIterations = 200 } = {}) {
  if (!Number.isInteger(maxRaymarchIterations) || maxRaymarchIterations < 1 || maxRaymarchIterations > COMPILED_SHADER_LIMITS.maxIterations) fail();
  const data = record(value, ['version', 'uniforms', 'frag', 'vert', 'geoGLSL', 'colorGLSL']);
  if (data.version !== 1) fail();
  const names = new Set();
  const uniforms = denseArray(data.uniforms).map(value => uniform(value, names));
  for (const [name, type] of Object.entries(REQUIRED)) {
    if (!uniforms.some(value => value.name === name && value.type === type)) fail();
  }
  const bytes = text(data.frag, COMPILED_SHADER_LIMITS.fragBytes) + text(data.vert, COMPILED_SHADER_LIMITS.vertBytes)
    + text(data.geoGLSL, COMPILED_SHADER_LIMITS.geometryBytes) + text(data.colorGLSL, COMPILED_SHADER_LIMITS.colorBytes);
  if (bytes > COMPILED_SHADER_LIMITS.totalShaderBytes || data.vert !== SHELL.threeJSVertexSource) fail();
  const frag = shaderProgram(data.frag, uniforms, data.geoGLSL, data.colorGLSL, maxRaymarchIterations);
  if (bytes - new TextEncoder().encode(data.frag).byteLength + text(frag, COMPILED_SHADER_LIMITS.fragBytes) > COMPILED_SHADER_LIMITS.totalShaderBytes) fail();
  return { version: 1, uniforms, frag,
    vert: SHELL.threeJSVertexSource, geoGLSL: data.geoGLSL, colorGLSL: data.colorGLSL };
}
