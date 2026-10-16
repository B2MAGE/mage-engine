import { COMPILED_SHADER_SHELL as SHELL } from './compiled-shader-shell.generated.js';

export const COMPILED_SHADER_LIMITS = Object.freeze({
  fragBytes: 524288, vertBytes: 65536, geometryBytes: 262144, colorBytes: 262144,
  totalShaderBytes: 786432, uniforms: 80, uniformMagnitude: 1000000,
  maxIterations: 200, maxReflections: 2, minStepSize: 0.005, maxStepSize: 1,
});
// Versioned abstract work units, not a promise of elapsed GPU time. The trusted
// scaffold and its bounded loops are included in the same graph as authored GLSL.
export const SHADER_WORKLOAD_LIMITS = Object.freeze({
  policyVersion: 1, tokens: 60000, nesting: 64, functions: 512, callDepth: 64,
  expandedCost: 2000000, fragmentCost: 80000000,
});
const LIMIT_LABELS = { tokens: 'shader token count', nesting: 'shader nesting', functions: 'shader function count',
  'call-depth': 'function call depth', 'expanded-cost': 'expanded shader computation', 'fragment-cost': 'per-pixel shader computation' };
export class ShaderWorkloadError extends Error {
  constructor(limit, actual, maximum) {
    const unsupported = limit === 'unsupported' || limit === 'cycles';
    super(unsupported
      ? (limit === 'cycles' ? 'Scene shader contains a recursive function cycle.' : 'Scene shader uses an unsupported computation construct.')
      : `Scene shader exceeds the ${LIMIT_LABELS[limit]} limit (${actual} > ${maximum}). Simplify repeated shapes, noise, or rendering detail.`);
    this.name = 'ShaderWorkloadError';
    this.code = unsupported ? 'shader-workload-unsupported' : 'shader-workload-limit';
    this.limit = limit;
    if (!unsupported) { this.actual = actual; this.maximum = maximum; }
  }
}
const unsupported = () => { throw new ShaderWorkloadError('unsupported'); };
function checkLimit(limit, actual, maximum) {
  if (actual > maximum) throw new ShaderWorkloadError(limit, actual, maximum);
}
// Saturate before multiplication or addition so hostile expansion never creates
// large integers, Infinity, or an enormous expanded source/recursive JS stack.
const SATURATION = SHADER_WORKLOAD_LIMITS.fragmentCost + 1;
const addCost = (a, b) => a >= SATURATION - b ? SATURATION : a + b;
const multiplyCost = (a, b) => b !== 0 && a > Math.floor(SATURATION / b) ? SATURATION : a * b;
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

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const signature = (name, arity) => `${name}/${arity}`;
function shaderTokens(source, stats) {
  const tokens = [];
  const matcher = /[A-Za-z_][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[^\s]/g;
  for (const match of source.matchAll(matcher)) {
    tokens.push(match[0]);
    if (stats) checkLimit('tokens', ++stats.tokenCount, SHADER_WORKLOAD_LIMITS.tokens);
  }
  return tokens;
}
function delimiters(tokens, stats) {
  const stack = [], counts = new Map(), pairs = new Map();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '(' || token === '{') {
      stack.push({ index, token, count: tokens[index + 1] === ')'
        || (tokens[index + 1] === 'void' && tokens[index + 2] === ')') ? 0 : 1 });
      if (stats) {
        stats.nestingDepth = Math.max(stats.nestingDepth, stack.length);
        checkLimit('nesting', stack.length, SHADER_WORKLOAD_LIMITS.nesting);
      }
    } else if (token === ',' && stack.at(-1)?.token === '(') stack.at(-1).count++;
    else if (token === ')' || token === '}') {
      const open = stack.pop();
      if (!open || open.token !== (token === ')' ? '(' : '{')) fail();
      pairs.set(open.index, index);
      if (token === ')') counts.set(open.index, open.count);
    }
  }
  if (stack.length) fail();
  return { counts, pairs };
}
// Explicit built-in allowlist. Costs cover vector/matrix overloads conservatively;
// custom functions cannot shadow these names and bypass intrinsic accounting.
const BUILTIN_COSTS = new Map();
function builtins(names, arities, cost) {
  for (const name of names.split(' ')) for (const arity of arities) BUILTIN_COSTS.set(signature(name, arity), cost);
}
builtins('float int bool', [1], 1);
builtins('vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 mat2 mat3 mat4', Array.from({ length: 16 }, (_, i) => i + 1), 16);
builtins('Material', [5], 16);
builtins('ShadedMaterial', [3], 16);
builtins('abs sign floor ceil fract radians degrees', [1], 4);
builtins('min max mod step lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual', [2], 8);
builtins('clamp mix smoothstep faceforward refract', [3], 16);
builtins('dot cross distance reflect matrixCompMult', [2], 32);
builtins('length normalize inversesqrt sqrt', [1], 32);
builtins('sin cos tan asin acos exp log exp2 log2', [1], 64);
builtins('atan', [1, 2], 64);
builtins('pow', [2], 64);
builtins('any all not', [1], 4);
for (const key of BUILTIN_COSTS.keys()) RESERVED_UNIFORMS.add(key.split('/')[0]);

function functionBody(tokens, counts, pairs, trusted = false) {
  const node = { cost: 0, calls: new Map() };
  const loops = [], loopEnds = new Map();
  let multiplier = 1;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    // Trusted loops have an exact, reviewed shape. New upstream scaffold loops
    // cannot silently acquire an unaccounted multiplier.
    if (token === 'for') {
      if (!trusted) unsupported();
      const end = pairs.get(index + 1);
      const header = tokens.slice(index + 2, end).join('');
      const loop = header.match(/^int([is])=0;\1<(10|4|MAX_ITERATIONS|AO_SAMPLES|MAX_REFLECTIONS);(?:\1\+\+|\+\+\1)$/);
      if (!loop || tokens[end + 1] !== '{') throw new Error('Unsupported trusted shader loop; update workload policy.');
      const limit = { '10': 10, '4': 4, AO_SAMPLES: 8 }[loop[2]] ?? loop[2];
      loopEnds.set(end + 1, { end: pairs.get(end + 1), limit });
    }
    if (loopEnds.has(index)) {
      const loop = loopEnds.get(index);
      loops.push({ end: loop.end, previous: multiplier });
      multiplier = multiplyCost(multiplier, typeof loop.limit === 'number' ? loop.limit : trusted[loop.limit]);
    }
    node.cost = addCost(node.cost, multiplier);
    if (IDENTIFIER.test(token) && tokens[index + 1] === '(' && !['if', 'for', 'return'].includes(token)) {
      const call = signature(token, counts.get(index + 1));
      node.calls.set(call, addCost(node.calls.get(call) ?? 0, multiplier));
    }
    if (loops.at(-1)?.end === index) multiplier = loops.pop().previous;
  }
  return node;
}
// Parse static, pinned helper bodies once. Same-name/same-arity overloads (noise
// vec2/vec3) are summed: without type inference this deliberately overestimates.
function scaffoldDefinitions() {
  const clean = withoutComments(SHELL.sculptureStarterCode + SHELL.fragFooter);
  const definitions = [];
  const pattern = /\b(?:void|float|int|bool|vec[234]|mat[234]|Material|ShadedMaterial)\s+([A-Za-z_]\w*)\s*\([^{};]*\)\s*\{/g;
  for (const match of clean.matchAll(pattern)) {
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
    // Directives are fixed by the pinned scaffold. Counting both branch bodies is
    // conservative; only known trusted loop counts can lower their contribution.
    const tokens = shaderTokens(clean.slice(start, end - 1).replace(/^\s*#.*$/gm, ''));
    definitions.push({ key, tokens, ...delimiters(tokens) });
  }
  return definitions;
}
const SCAFFOLD_DEFINITIONS = scaffoldDefinitions();
if (!/const int AO_SAMPLES = 8;/.test(SHELL.sculptureStarterCode)) {
  throw new Error('Trusted occlusion sample count changed; update workload policy.');
}
function workload(functions, stats, iterations, reflections) {
  const graph = new Map();
  for (const definition of SCAFFOLD_DEFINITIONS) {
    const node = functionBody(definition.tokens, definition.counts, definition.pairs,
      { MAX_ITERATIONS: iterations, MAX_REFLECTIONS: reflections });
    const prior = graph.get(definition.key);
    if (prior) {
      prior.cost = addCost(prior.cost, node.cost);
      for (const [call, count] of node.calls) prior.calls.set(call, addCost(prior.calls.get(call) ?? 0, count));
    } else graph.set(definition.key, node);
  }
  for (const [key, node] of functions) graph.set(key, node);
  // Evaluate leaves first using Kahn's algorithm. Repeated edges retain their
  // multiplicity while dependency counts need only one edge per distinct callee.
  const waiting = new Map(), parents = new Map(), ready = [], results = new Map();
  for (const [key, node] of graph) {
    let dependencies = 0;
    for (const [call, count] of node.calls) {
      if (graph.has(call)) {
        dependencies++;
        const list = parents.get(call) ?? [];
        list.push(key); parents.set(call, list);
      } else if (BUILTIN_COSTS.has(call)) node.cost = addCost(node.cost, multiplyCost(BUILTIN_COSTS.get(call), count));
      else unsupported();
    }
    waiting.set(key, dependencies);
    if (!dependencies) ready.push(key);
  }
  let callDepth = 0;
  for (let index = 0; index < ready.length; index++) {
    const key = ready[index], node = graph.get(key);
    let cost = node.cost, depth = 1;
    for (const [call, count] of node.calls) if (graph.has(call)) {
      const result = results.get(call);
      cost = addCost(cost, multiplyCost(result.cost, count));
      depth = Math.max(depth, result.depth + 1);
    }
    checkLimit('call-depth', depth, SHADER_WORKLOAD_LIMITS.callDepth);
    if (functions.has(key)) checkLimit('expanded-cost', cost, SHADER_WORKLOAD_LIMITS.expandedCost);
    results.set(key, { cost, depth });
    callDepth = Math.max(callDepth, depth);
    for (const parent of parents.get(key) ?? []) {
      waiting.set(parent, waiting.get(parent) - 1);
      if (waiting.get(parent) === 0) ready.push(parent);
    }
  }
  if (results.size !== graph.size) throw new ShaderWorkloadError('cycles');
  const fragmentCost = results.get('main/0').cost;
  checkLimit('fragment-cost', fragmentCost, SHADER_WORKLOAD_LIMITS.fragmentCost);
  return { policyVersion: SHADER_WORKLOAD_LIMITS.policyVersion,
    geometryCost: results.get('surfaceDistance/1').cost, colorCost: results.get('shade/2').cost,
    fragmentCost, functionCount: functions.size, callDepth,
    tokenCount: stats.tokenCount, nestingDepth: stats.nestingDepth,
    raymarchIterations: iterations, reflections };
}

function validateSnippet(source, entry, functions, uniformNames, stats) {
  let clean = withoutComments(source);
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(clean)) fail();
  const conditionals = [];
  clean = clean.split('\n').map(line => {
    if (!line.includes('#')) return line;
    const directive = line.trim();
    if (directive === '#ifdef USE_PBR') {
      conditionals.push(false);
      stats.nestingDepth = Math.max(stats.nestingDepth, conditionals.length);
      checkLimit('nesting', conditionals.length, SHADER_WORKLOAD_LIMITS.nesting);
    }
    else if (directive === '#else' && conditionals.length && !conditionals.at(-1)) conditionals[conditionals.length - 1] = true;
    else if (directive === '#endif' && conditionals.length) conditionals.pop();
    else fail();
    return '';
  }).join('\n');
  if (conditionals.length || /["'`\[\]]/.test(clean)) fail();
  const tokens = shaderTokens(clean, stats), { counts, pairs } = delimiters(tokens, stats);
  if (tokens.some(token => ['for', 'while', 'do', 'uniform', 'attribute', 'varying', 'layout', 'buffer', 'struct',
    'precision', 'switch', 'case', 'default', 'goto', 'discard', 'MAX_ITERATIONS', 'MAX_REFLECTIONS', 'STEP_SIZE_CONSTANT'].includes(token))) unsupported();
  let entryCount = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    // Every top-level item must be a function definition: global variables,
    // prototypes and declarations cannot shadow the trusted scaffold.
    if (!/^(?:void|float|int|bool|vec[234]|mat[234]|Material|ShadedMaterial)$/.test(token)) fail();
    const name = tokens[++index];
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name ?? '') || tokens[++index] !== '('
      || RESERVED_UNIFORMS.has(name) || uniformNames.has(name)
      || (name === 'surfaceDistance' && entry !== name) || (name === 'shade' && entry !== name)
      || /^(?:gl_|webgl_|_webgl_)/i.test(name) || name.includes('__')) fail();
    const key = signature(name, counts.get(index));
    if (functions.has(key)) fail();
    if (name === entry) {
      if (counts.get(index) !== (entry === 'surfaceDistance' ? 1 : 2)) fail();
      entryCount++;
    }
    let depth = 1;
    while (++index < tokens.length && depth) {
      if (tokens[index] === '(') depth++;
      if (tokens[index] === ')') depth--;
      if (['{', '}', ';'].includes(tokens[index])) fail();
    }
    if (depth || tokens[index] !== '{') fail();
    const end = pairs.get(index);
    const body = tokens.slice(index + 1, end);
    const bodyDelimiters = delimiters(body);
    functions.set(key, functionBody(body, bodyDelimiters.counts, bodyDelimiters.pairs));
    checkLimit('functions', functions.size, SHADER_WORKLOAD_LIMITS.functions);
    index = end;
  }
  if (entryCount !== 1) fail();
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
  const stats = { tokenCount: 0, nestingDepth: 0 };
  validateSnippet(geoGLSL, 'surfaceDistance', functions, names, stats);
  validateSnippet(colorGLSL, 'shade', functions, names, stats);
  const report = workload(functions, stats, Math.min(ceiling, iterations), Math.min(COMPILED_SHADER_LIMITS.maxReflections, reflections));
  return { workload: report, frag: prefix + `const float STEP_SIZE_CONSTANT = ${Math.min(COMPILED_SHADER_LIMITS.maxStepSize, Math.max(COMPILED_SHADER_LIMITS.minStepSize, step))};\n`
    + `const int MAX_ITERATIONS = ${Math.min(ceiling, iterations)};\n#define MAX_REFLECTIONS ${Math.min(COMPILED_SHADER_LIMITS.maxReflections, reflections)}\n` + suffix };
}

/** Strict data and scaffold policy. It cannot certify arbitrary GPU work safe. */
export function analyzeCompiledShader(value, { maxRaymarchIterations = 200 } = {}) {
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
  const { frag, workload } = shaderProgram(data.frag, uniforms, data.geoGLSL, data.colorGLSL, maxRaymarchIterations);
  if (bytes - new TextEncoder().encode(data.frag).byteLength + text(frag, COMPILED_SHADER_LIMITS.fragBytes) > COMPILED_SHADER_LIMITS.totalShaderBytes) fail();
  return { artifact: { version: 1, uniforms, frag,
    vert: SHELL.threeJSVertexSource, geoGLSL: data.geoGLSL, colorGLSL: data.colorGLSL }, workload };
}

/** Recompute the trusted estimate; never accept a compiler-reported budget. */
export function normalizeCompiledShader(value, options) {
  return analyzeCompiledShader(value, options).artifact;
}
