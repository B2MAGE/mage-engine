import type { CompiledShaderArtifact, CompiledShaderOptions } from './compiled-shader.js';
export type { CompiledShaderArtifact, CompiledShaderOptions, CompiledUniform } from './compiled-shader.js';
/** Runs source synchronously. Call only inside a disposable, externally timed worker. */
export declare function compileShader(source: string, options?: CompiledShaderOptions): CompiledShaderArtifact;
