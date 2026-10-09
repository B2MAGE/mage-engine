import { sculptToGLSL } from 'shader-park-core';
import { COMPILED_SHADER_SHELL as shell } from './compiled-shader-shell.generated.js';

/** Source evaluation: run untrusted source only inside a disposable compiler worker. */
export function sculptToThreeJSShaderSource(source, requestedMaxIterations = 200) {
  const ceiling = Number.isFinite(requestedMaxIterations) && requestedMaxIterations > 0
    ? Math.min(200, Math.max(1, Math.floor(requestedMaxIterations))) : 200;
  const result = sculptToGLSL(source);
  if (result.error || !Number.isFinite(result.maxIterations)) throw new Error('Shader compilation failed.');
  const maxIterations = Math.max(0, Math.min(ceiling, Math.round(result.maxIterations)));
  const frag = shell.threeHeader + shell.usePBRHeader + shell.useHemisphereLight
    + result.uniforms.map(uniform => `uniform ${uniform.type} ${uniform.name};\n`).join('')
    + `const float STEP_SIZE_CONSTANT = ${result.stepSizeConstant};\nconst int MAX_ITERATIONS = ${maxIterations};\n#define MAX_REFLECTIONS ${result.maxReflections}\n`
    + shell.sculptureStarterCode + result.geoGLSL + '\n' + result.colorGLSL + '\n' + shell.fragFooter;
  return { uniforms: result.uniforms, frag, vert: shell.threeJSVertexSource,
    error: result.error, geoGLSL: result.geoGLSL, colorGLSL: result.colorGLSL };
}
