import { sculptToThreeJSShaderSource } from './shader-park-compiler.js';
import { normalizeCompiledShader } from './compiled-shader.js';

/** Source can schedule later work; the owner must terminate this worker after the job. */
export function compileShader(source, options = {}) {
  if (typeof source !== 'string' || !source.trim() || source.length > 65536) throw new Error('Invalid shader source.');
  const ceiling = options.maxRaymarchIterations ?? 200;
  if (!Number.isFinite(ceiling) || ceiling < 1) throw new Error('Invalid compiler budget.');
  const generated = sculptToThreeJSShaderSource(source, ceiling);
  if (generated.error) throw new Error('Shader compilation failed.');
  // ShaderPark's built-in vectors use arrays while declared inputs use x/y/z/w.
  // Only serializable component values cross the new renderer boundary.
  const uniforms = generated.uniforms.map(uniform => {
    const convert = value => Array.isArray(value)
      ? Object.fromEntries(['x', 'y', 'z', 'w'].slice(0, value.length).map((key, index) => [key, value[index]])) : value;
    return { ...uniform, value: convert(uniform.value),
      ...(Object.hasOwn(uniform, 'min') ? { min: convert(uniform.min) } : {}),
      ...(Object.hasOwn(uniform, 'max') ? { max: convert(uniform.max) } : {}) };
  });
  return normalizeCompiledShader({ version: 1, uniforms, frag: generated.frag, vert: generated.vert,
    geoGLSL: generated.geoGLSL, colorGLSL: generated.colorGLSL }, options);
}
