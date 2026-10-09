export type CompiledShaderOptions = { maxRaymarchIterations?: number };
export declare const COMPILED_SHADER_LIMITS: Readonly<{
  fragBytes: 524288; vertBytes: 65536; geometryBytes: 262144; colorBytes: 262144;
  totalShaderBytes: 786432; uniforms: 80; uniformMagnitude: 1000000;
  maxIterations: 200; maxReflections: 2; minStepSize: 0.005; maxStepSize: 1;
}>;
export type CompiledVector2 = { x: number; y: number };
export type CompiledVector3 = CompiledVector2 & { z: number };
export type CompiledVector4 = CompiledVector3 & { w: number };
type Uniform<T extends string, V> = { name: string; type: T; value: V; min?: V; max?: V };
export type CompiledUniform = Uniform<'float', number> | Uniform<'vec2', CompiledVector2>
  | Uniform<'vec3', CompiledVector3> | Uniform<'vec4', CompiledVector4>;
/** Data only. This does not certify arbitrary GLSL as safe or bound all GPU work. */
export type CompiledShaderArtifact = { version: 1; uniforms: CompiledUniform[]; frag: string; vert: string; geoGLSL: string; colorGLSL: string };
/** Rejects malformed data/scaffolds, copies accepted data and enforces trusted render ceilings. */
export declare function normalizeCompiledShader(value: unknown, options?: CompiledShaderOptions): CompiledShaderArtifact;
