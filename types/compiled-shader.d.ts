export type CompiledShaderOptions = { maxRaymarchIterations?: number };
export declare const COMPILED_SHADER_LIMITS: Readonly<{
  fragBytes: 524288; vertBytes: 65536; geometryBytes: 262144; colorBytes: 262144;
  totalShaderBytes: 786432; uniforms: 80; uniformMagnitude: 1000000;
  maxIterations: 200; maxReflections: 2; minStepSize: 0.005; maxStepSize: 1;
}>;
export declare const SHADER_WORKLOAD_LIMITS: Readonly<{
  policyVersion: 1; tokens: 60000; nesting: 64; functions: 512; callDepth: 64;
  expandedCost: 2000000; fragmentCost: 80000000;
}>;
export type ShaderWorkloadLimit = 'tokens' | 'nesting' | 'functions' | 'call-depth'
  | 'expanded-cost' | 'fragment-cost' | 'unsupported' | 'cycles';
export declare class ShaderWorkloadError extends Error {
  readonly code: 'shader-workload-limit' | 'shader-workload-unsupported';
  readonly limit: ShaderWorkloadLimit;
  readonly actual?: number;
  readonly maximum?: number;
  constructor(limit: ShaderWorkloadLimit, actual?: number, maximum?: number);
}
/** Conservative abstract work units, not elapsed time or GPU instructions. */
export type ShaderWorkloadReport = {
  policyVersion: 1; geometryCost: number; colorCost: number; fragmentCost: number;
  functionCount: number; callDepth: number; tokenCount: number; nestingDepth: number;
  raymarchIterations: number; reflections: number;
};
export type CompiledVector2 = { x: number; y: number };
export type CompiledVector3 = CompiledVector2 & { z: number };
export type CompiledVector4 = CompiledVector3 & { w: number };
type Uniform<T extends string, V> = { name: string; type: T; value: V; min?: V; max?: V };
export type CompiledUniform = Uniform<'float', number> | Uniform<'vec2', CompiledVector2>
  | Uniform<'vec3', CompiledVector3> | Uniform<'vec4', CompiledVector4>;
/** Data only. A conservative accepted estimate cannot certify GPU-driver behavior. */
export type CompiledShaderArtifact = { version: 1; uniforms: CompiledUniform[]; frag: string; vert: string; geoGLSL: string; colorGLSL: string };
/** Rejects malformed data/scaffolds, copies accepted data and enforces trusted render ceilings. */
export declare function normalizeCompiledShader(value: unknown, options?: CompiledShaderOptions): CompiledShaderArtifact;
/** Independently validate and estimate submitted GLSL; compiler-reported budgets are never trusted. */
export declare function analyzeCompiledShader(value: unknown, options?: CompiledShaderOptions): {
  artifact: CompiledShaderArtifact; workload: ShaderWorkloadReport;
};
