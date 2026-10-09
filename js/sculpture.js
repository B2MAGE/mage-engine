import { BackSide, Mesh, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { compileShader } from './compiler.js';
import { normalizeCompiledShader } from './compiled-shader.js';

/** Preserve ShaderPark's mesh/material behavior while accepting inert compiled data. */
export function createSculptureWithGeometry(geometry, source, uniformCallback = () => ({}), params = {}, generatedGLSL) {
  const options = { maxRaymarchIterations: params.maxRaymarchIterations ?? 200 };
  const artifact = generatedGLSL ? normalizeCompiledShader(generatedGLSL, options) : compileShader(source, options);
  const constructors = { vec2: Vector2, vec3: Vector3, vec4: Vector4 };
  const components = ['x', 'y', 'z', 'w'];
  const uniforms = Object.fromEntries(artifact.uniforms.map(uniform => [uniform.name, {
    value: uniform.type === 'float' ? uniform.value
      : new constructors[uniform.type](...components.slice(0, Number(uniform.type.at(-1))).map(key => uniform.value[key])),
  }]));
  geometry.computeBoundingSphere();
  uniforms.opacity.value = 1;
  uniforms.mouse.value = new Vector3();
  uniforms._scale.value = params.radius ?? geometry.boundingSphere.radius;
  const material = new ShaderMaterial({ uniforms, vertexShader: artifact.vert,
    fragmentShader: artifact.frag, transparent: true, side: BackSide });
  material.extensions.fragDepth = false;
  material.uniformDescriptions = artifact.uniforms;
  const mesh = new Mesh(geometry, material);
  mesh.onBeforeRender = () => {
    const next = uniformCallback();
    if (!next || typeof next !== 'object') throw new TypeError('Expected a uniform update object.');
    for (const [name, value] of Object.entries(next)) {
      if (Object.hasOwn(material.uniforms, name)) material.uniforms[name].value = value;
    }
  };
  return mesh;
}
