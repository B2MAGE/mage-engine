import { RenderPass } from 'three/addons/postprocessing/RenderPass'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { DotScreenShader } from 'three/addons/shaders/DotScreenShader.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js'
import { LuminosityShader } from 'three/addons/shaders/LuminosityShader.js';
import { SobelOperatorShader } from 'three/addons/shaders/SobelOperatorShader.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { ColorifyShader } from 'three/addons/shaders/ColorifyShader.js';
import { Color } from 'three';
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js';
import { KaleidoShader } from 'three/addons/shaders/KaleidoShader.js';
import { TechnicolorShader } from 'three/addons/shaders/TechnicolorShader.js';
import { ToonShader1, ToonShader2, ToonShaderHatching, ToonShaderDotted} from 'three/addons/shaders/ToonShader.js';
import { BleachBypassShader } from 'three/addons/shaders/BleachBypassShader.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { Vector2 } from 'three';

/**
 * Full-screen textured quad shader
 */

const CopyShader = {

	name: 'CopyShader',

	uniforms: {

		'tDiffuse': { value: null },
		'opacity': { value: 1.0 }

	},

	vertexShader: /* glsl */`

		void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,

	fragmentShader: /* glsl */`

		#define hash(x) fract(sin(x) * 43758.5453123)
vec3 pal(float t){return .5+.5*cos(6.28*(1.*t+vec3(.0,.1,.1)));}
 float stepNoise(float x, float n) { // From Kamoshika shader
   const float factor = 0.3;
   float i = floor(x);
   float f = x - i;
   float u = smoothstep(0.5 - factor, 0.5 + factor, f);
   float res = mix(floor(hash(i) * n), floor(hash(i + 1.) * n), u);
   res /= (n - 1.) * 0.5;
   return res - 1.;
 }
 vec3 path(vec3 p){
   
      vec3 o = vec3(0.);
       o.x += stepNoise(p.z*.05,5.)*5.;
      o.y += stepNoise(p.z*.07,3.975)*5.;
     return o;
   }
   float diam2(vec2 p,float s){p=abs(p); return (p.x+p.y-s)*inversesqrt(3.);}
   vec3 erot(vec3 p,vec3 ax,float t){return mix(dot(ax,p)*ax,p,cos(t))+cross(ax,p)*sin(t);}
void main( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = (fragCoord-.5*iResolution.xy)/iResolution.y;

 vec3 col = vec3(0.);
  
  vec3 ro = vec3(0.,0.,-1.),rt=vec3(0.);
  ro.z+=iTime*5.;
  rt.z += iTime*5.;
  ro+=path(ro);
    rt+=path(rt);
  vec3 z = normalize(rt-ro);
  vec3 x = vec3(z.z,0.,-z.x);
  float i=0.,e=0.,g=0.;
  vec3 rd = mat3(x,cross(z,x),z)*erot(normalize(vec3(uv,1.)),vec3(0.,0.,1.),stepNoise(iTime+hash(uv.x*uv.y*iTime)*.05,6.));
  for(;i++<99.;){
     vec3 p= ro+rd*g;

    p-=path(p);
    float r = 0.;;
    vec3 pp=p;
    float sc=1.;
    for(float j=0.;j++<4.;){
        r = clamp(r+abs(dot(sin(pp*3.),cos(pp.yzx*2.))*.3-.1)/sc,-.5,.5);
        pp=erot(pp,normalize(vec3(.1,.2,.3)),.785+j);
        pp+=pp.yzx+j*50.;
        sc*=1.5;
        pp*=1.5;
      }
      
     float h = abs(diam2(p.xy,7.))-3.-r;
   
     p=erot(p,vec3(0.,0.,1.),path(p).x*.5+p.z*.2);
    float t = length(abs(p.xy)-.5)-.1;
     h= min(t,h);
     g+=e=max(.001,t==h ?abs(h):(h));
     col +=(t==h ?vec3(.3,.2,.1)*(100.*exp(-20.*fract(p.z*.25+iTime)))*mod(floor(p.z*4.)+mod(floor(p.y*4.),2.),2.) :vec3(.1))*.0325/exp(i*i*e);;
    }
    col = mix(col,vec3(.9,.9,1.1),1.-exp(-.01*g*g*g));
    // Output to screen
    fragColor = vec4(col,1.0);
    }`

};

const DEFAULT_PASS_ORDER = [
  'glitchPass',
  'bloom',
  'RGBShift',
  'dotShader',
  'technicolorShader',
  'luminosityShader',
  'afterImagePass',
  'sobelShader',
  'colorifyShader',
  'halftonePass',
  'gammaCorrectionShader',
  'kaleidoShader',
  'copyShader',
  'bleachBypassShader',
  'toonShader',
  'outputPass',
];

// threejs effects list
let effects = {
  passOrder : [...DEFAULT_PASS_ORDER],
  toneMapping : {
        exposure : 1.5,
        method : 0, // Default
  },
  sobelShader : {
      shader : new ShaderPass(SobelOperatorShader),
      enabled : false,
  },
  halftonePass : {
    shader : new HalftonePass(),
    enabled : false, 
  },
  luminosityShader : {
    shader : new ShaderPass(LuminosityShader),
    enabled : false,
  },
  gammaCorrectionShader : {
    shader : new ShaderPass(GammaCorrectionShader),
    enabled : false,
  },
  dotShader : {
    shader : new ShaderPass(DotScreenShader),
    scale : 4.0,
    enabled : false,
  },
  colorifyShader : {
    shader : new ShaderPass(ColorifyShader),
    enabled : false,
    color : new Color(),
    update : function() {
      this.shader.uniforms.color.value = this.color;
    },
  },
  technicolorShader : {
    shader : new ShaderPass(TechnicolorShader),
    enabled : false,
  },
  toonShader : {
    shader : new ShaderPass(ToonShader1),
    enabled : false,
    toonShaderChoice : 0,
    update : function() {
      this.shader = new ShaderPass(this.toonShaderChoice)
    },
  },
  copyShader : {
    shader : new ShaderPass(CopyShader),
    enabled : false,
  },
  bleachBypassShader : {
    shader : new ShaderPass(BleachBypassShader),
    enabled : false,
  },
  RGBShift : {
    shader : new ShaderPass(RGBShiftShader),
    enabled : false,
  },
  bloom : {
    settings : {
        strength : 1.0,
        radius : 0.2,
        threshold : 0.1,
    },
    shader : new UnrealBloomPass(
      new Vector2(window.innerWidth, window.innerHeight),
      1.6,
      0.2,
      0.2,
    ),
    
    enabled : false,
    
    update : function(renderer) {
      const resolution = new Vector2(window.innerWidth, window.innerHeight);
      if (renderer && renderer.getDrawingBufferSize) {
        renderer.getDrawingBufferSize(resolution);
      }

      this.shader?.dispose(); // CALL DISPOSE TO PREVENT MEM LEAKS
      this.shader = new UnrealBloomPass(
        resolution,
        this.settings.strength,
        this.settings.radius,
        this.settings.threshold
      );
    },
  },
  afterImagePass : {
    shader : new AfterimagePass(),
    enabled : false,
  },
  kaleidoShader : {
    shader : new ShaderPass(KaleidoShader),
    enabled : false,
  },
  glitchPass : {
    shader : new GlitchPass(64),
    enabled : false,
  },
  // outlinePass : {
  //   shader : null,
  //   enabled : false,
  //   init : function(resolution, scene, camera, selectedObjects) {
  //     this.shader = new OutlinePass();
  //   }
  // },
  outputPass : {
    shader : new OutputPass(),
    enabled : true,
  },
  getPassOrder : function() {
    return [...this.passOrder];
  },
  getDefaultPassOrder : function() {
    return [...DEFAULT_PASS_ORDER];
  },
  setPassOrder : function(nextOrder) {
    if (!Array.isArray(nextOrder)) {
      return false;
    }

    const requested = nextOrder.filter(value => typeof value === 'string');
    const valid = requested.filter(
      passId => this[passId] && typeof this[passId] === 'object' && this[passId].shader,
    );

    const seen = new Set();
    const deduped = [];
    for (const passId of valid) {
      if (seen.has(passId)) {
        continue;
      }
      seen.add(passId);
      deduped.push(passId);
    }

    for (const passId of DEFAULT_PASS_ORDER) {
      if (seen.has(passId)) {
        continue;
      }
      if (this[passId] && typeof this[passId] === 'object' && this[passId].shader) {
        seen.add(passId);
        deduped.push(passId);
      }
    }

    this.passOrder = deduped.filter(passId => passId !== 'outputPass');
    this.passOrder.push('outputPass');
    return true;
  },
  movePass : function(passId, direction) {
    if (!passId || typeof passId !== 'string') {
      return false;
    }
    if (passId === 'outputPass') {
      return false;
    }

    const order = this.getPassOrder();
    const index = order.indexOf(passId);
    if (index < 0) {
      return false;
    }

    const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (delta === 0) {
      return false;
    }

    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= order.length) {
      return false;
    }
    if (order[nextIndex] === 'outputPass') {
      return false;
    }

    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    this.setPassOrder(order);
    return true;
  },
  applyPostProcessing : function(scene, renderer, camera, composer) {
    
    // CALL DISPOSE TO PREVENT MEM LEAKS
    this.bloom.update(renderer); 
    this.toonShader.update();
    this.colorifyShader.update();

    // clean slate
    composer?.dispose();
    let newComposer = new EffectComposer(renderer);
    newComposer.addPass(new RenderPass(scene, camera));

    const orderedPassIds = this.getPassOrder();

    orderedPassIds.forEach(passId => {
      const passConfig = this[passId];
      if (!passConfig || !passConfig.enabled) {
        return;
      }
      newComposer.addPass(passConfig.shader);
    });

    return newComposer;
  }
}

export default effects;