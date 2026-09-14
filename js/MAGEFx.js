import { RenderPass } from 'three/addons/postprocessing/RenderPass'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { DotScreenShader } from 'three/addons/shaders/DotScreenShader.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GlitchPass } from './GlitchPass.js';
import { LuminosityShader } from 'three/addons/shaders/LuminosityShader.js';
import { SobelOperatorShader } from 'three/addons/shaders/SobelOperatorShader.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { ColorifyShader } from 'three/addons/shaders/ColorifyShader.js';
import { Color } from 'three';
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js';
import { KaleidoShader } from 'three/addons/shaders/KaleidoShader.js';
import { TechnicolorShader } from 'three/addons/shaders/TechnicolorShader.js';
import { ToonShader1, ToonShader2, ToonShaderHatching, ToonShaderDotted } from 'three/addons/shaders/ToonShader.js';
import { BleachBypassShader } from 'three/addons/shaders/BleachBypassShader.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { Vector2 } from 'three';
import {
  LinearToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
} from 'three';

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
export class MAGEEffects {
  constructor(engine) {
    if (engine.log) console.log('Initializing MAGEEffects with engine instance:', engine);
    this.engine = engine;
    //console.log('Engine host:', engine.getHost());
    const fields = engine.getEngineFields();
    this.scene = fields.scene;
    this.renderer = fields.renderer;
    this.camera = fields.camera;
    this.controls = fields.controls;
    this.canvas = fields.canvas;
    this.state = fields.state;
    this.visualizer = fields.visualizer;
    this.controlSettings = fields.controlSettings;
    this.passOrder = [...DEFAULT_PASS_ORDER];
    this.toneMapping = {
      exposure: 1.5,
      method: 0,
    };
    this.sobelShader = {
      shader: new ShaderPass(SobelOperatorShader),
      enabled: false,
    };
    this.halftonePass = {
      shader: new HalftonePass(),
      enabled: false,
    };
    this.luminosityShader = {
      shader: new ShaderPass(LuminosityShader),
      enabled: false,
    };
    this.gammaCorrectionShader = {
      shader: new ShaderPass(GammaCorrectionShader),
      enabled: false,
    };
    this.dotShader = {
      shader: new ShaderPass(DotScreenShader),
      scale: 4.0,
      enabled: false,
    };
    /** @type {any} */
    this.colorifyShader = {
      shader: new ShaderPass(ColorifyShader),
      enabled: false,
      color: new Color(),
      update: function () {
        this.shader.uniforms.color.value = this.color;
      },
    };
    this.technicolorShader = {
      shader: new ShaderPass(TechnicolorShader),
      enabled: false,
    };
    /** @type {any} */
    this.toonShader = {
      shader: new ShaderPass(ToonShader1),
      enabled: false,
      toonShaderChoice: 0,
      update: function () {
        this.shader = new ShaderPass(this.toonShaderChoice);
      },
    };
    this.copyShader = {
      shader: new ShaderPass(CopyShader),
      enabled: false,
    };
    this.bleachBypassShader = {
      shader: new ShaderPass(BleachBypassShader),
      enabled: false,
    };
    this.RGBShift = {
      shader: new ShaderPass(RGBShiftShader),
      enabled: false,
    };
    /** @type {any} */
    this.bloom = {
      settings: {
        strength: 1.0,
        radius: 0.2,
        threshold: 0.1,
      },
      shader: new UnrealBloomPass(
        new Vector2(window.innerWidth, window.innerHeight),
        1.6,
        0.2,
        0.2,
      ),
      enabled: false,
      update: function (renderer) {
        const resolution = new Vector2(window.innerWidth, window.innerHeight);
        if (renderer && renderer.getDrawingBufferSize) {
          renderer.getDrawingBufferSize(resolution);
        }

        this.shader?.dispose();
        this.shader = new UnrealBloomPass(
          resolution,
          this.settings.strength,
          this.settings.radius,
          this.settings.threshold,
        );
      },
    };
    this.afterImagePass = {
      shader: new AfterimagePass(),
      enabled: false,
    };
    this.kaleidoShader = {
      shader: new ShaderPass(KaleidoShader),
      enabled: false,
    };
    this.glitchPass = {
      threshold: 0.025,
      shader: new GlitchPass(() => {
        const trigger = engine.glitchPassTrigger;
        const thresh = this.glitchPass.threshold;
        return trigger > thresh;
      }, 64),
      enabled: false,
    };
    this.outputPass = {
      shader: new OutputPass(),
      enabled: true,
    };
  }

  getBloomEnabled = () => this.bloom.enabled
  setBloomEnabled = (value) => {
    this.bloom.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getBloomStrength = () => this.bloom.settings.strength
  setBloomStrength = (value) => {
    this.bloom.settings.strength = Number(value);
  }
  getBloomRadius = () => this.bloom.settings.radius
  setBloomRadius = (value) => {
    this.bloom.settings.radius = Number(value);
  }
  getBloomThreshold = () => this.bloom.settings.threshold
  setBloomThreshold = (value) => {
    this.bloom.settings.threshold = Number(value);
  }

  // RGB Shift Controls
  getRGBShiftEnabled = () => this.RGBShift.enabled
  setRGBShiftEnabled = (value) => {
    this.RGBShift.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getRGBShiftAmount = () => this.RGBShift.shader.uniforms.amount.value
  setRGBShiftAmount = (value) => {
    this.RGBShift.shader.uniforms.amount.value = Number(value);
  }
  getRGBShiftAngle = () => this.RGBShift.shader.uniforms.angle.value
  setRGBShiftAngle = (value) => {
    this.RGBShift.shader.uniforms.angle.value = Number(value);
  }

  // After Image Controls
  getAfterImageEnabled = () => this.afterImagePass.enabled
  setAfterImageEnabled = (value) => {
    this.afterImagePass.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getAfterImageDamp = () => this.afterImagePass.shader.uniforms.damp.value
  setAfterImageDamp = (value) => {
    this.afterImagePass.shader.uniforms.damp.value = Number(value);
  }

  // Colorify Controls
  getColorifyEnabled = () => this.colorifyShader.enabled
  setColorifyEnabled = (value) => {
    this.colorifyShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getColorifyColor = () => this.colorifyShader.color.getHex()
  setColorifyColor = (hex) => {
    this.colorifyShader.color.setHex(Number(hex));
  }

  // Kaleid Controls
  getKaleidEnabled = () => this.kaleidoShader.enabled
  setKaleidEnabled = (value) => {
    this.kaleidoShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getKaleidSides = () => this.kaleidoShader.shader.uniforms.sides.value
  setKaleidSides = (value) => {
    this.kaleidoShader.shader.uniforms.sides.value = Number(value);
  }
  getKaleidAngle = () => this.kaleidoShader.shader.uniforms.angle.value
  setKaleidAngle = (value) => {
    this.kaleidoShader.shader.uniforms.angle.value = Number(value);
  }

  // Tone Mapping Controls
  getToneMappingMethod = () => this.toneMapping.method
  setToneMappingMethod = (method) => {
    this.toneMapping.method = method;
    this.engine.setToneMapping(method);
  }
  getToneMappingExposure = () => this.engine.getToneMappingExposure()
  setToneMappingExposure = (value) => {
    this.toneMapping.exposure = Number(value);
    this.engine.setToneMappingExposure(Number(value));
  }

  // custom glitch pass trigger based on audio input function
  getGlitchEnabled = () => this.glitchPass?.enabled || false
  setGlitchEnabled = (value) => {
    if (this.glitchPass) {
      this.glitchPass.enabled = Boolean(value);
      this.engine.refreshFx();
    }
  }
  setGlitchThreshold = (percentage) => {
    this.glitchPass.threshold = Number(percentage);
  }
  getGlitchThreshold = () => { return this.glitchPass.threshold; };
  normalizeGlitchThreshold = async () => {
    const threshold = await this._normalizeThresholdWithBuffer(() => this.engine.glitchPassTrigger);
    if (Number.isFinite(threshold)) {
      this.setGlitchThreshold(threshold);
    }
    return threshold;
  };

  // Individual Pass Toggles
  getDotEnabled = () => this.dotShader.enabled
  setDotEnabled = (value) => {
    this.dotShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getTechnicolorEnabled = () => this.technicolorShader.enabled
  setTechnicolorEnabled = (value) => {
    this.technicolorShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getLuminosityEnabled = () => this.luminosityShader.enabled
  setLuminosityEnabled = (value) => {
    this.luminosityShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getSobelEnabled = () => this.sobelShader.enabled
  setSobelEnabled = (value) => {
    this.sobelShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getHalftoneEnabled = () => this.halftonePass.enabled
  setHalftoneEnabled = (value) => {
    this.halftonePass.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getGammaCorrectionEnabled = () => this.gammaCorrectionShader.enabled
  setGammaCorrectionEnabled = (value) => {
    this.gammaCorrectionShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getCopyShaderEnabled = () => this.copyShader.enabled
  setCopyShaderEnabled = (value) => {
    this.copyShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getBleachBypassEnabled = () => this.bleachBypassShader.enabled
  setBleachBypassEnabled = (value) => {
    this.bleachBypassShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getToonEnabled = () => this.toonShader.enabled
  setToonEnabled = (value) => {
    this.toonShader.enabled = Boolean(value);
    this.engine.refreshFx();
  }
  getOutputPassEnabled = () => this.outputPass.enabled
  setOutputPassEnabled = (value) => {
    this.outputPass.enabled = Boolean(value);
    this.engine.refreshFx();
  }

  getPassOrder() {
    return [...this.passOrder];
  }

  getDefaultPassOrder() {
    return [...DEFAULT_PASS_ORDER];
  }

  setPassOrder(nextOrder) {
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
  }

  movePass(passId, direction) {
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
  }

  applyPostProcessing(scene, renderer, camera, composer) {
    this.bloom.update(renderer);
    this.toonShader.update();
    this.colorifyShader.update();

    composer?.dispose();
    const newComposer = new EffectComposer(renderer);
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

  randomizeSettings() {
    const engine = this.engine;
    const { visualizer, state, controls, camera, renderer, pane, fxStudioOverlay, sceneCameraDock } = engine.getEngineFields();
    const randRange = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(randRange(min, max + 1));
    const randBool = (chance = 0.5) => Math.random() < chance;

    state.minimizing_factor = randRange(0.01, 2.0);
    state.power_factor = randRange(1.0, 10.0);
    state.pointerDownMultiplier = randRange(0.0, 1.0);
    state.base_speed = randRange(0.01, 0.9);
    state.easing_speed = randRange(0.01, 0.9);
    visualizer.scale = randRange(1.0, 200.0);

    controls.autoRotate = randBool(0.5);
    controls.autoRotateSpeed = randRange(0.1, 50.0);

    camera.fov = randRange(1.0, 359.0);
    camera.updateProjectionMatrix();

    state.camTilt = randRange(0.0, 2 * Math.PI);
    camera.up.set(
      Math.sin(state.camTilt),
      Math.cos(state.camTilt),
      -Math.sin(state.camTilt),
    );

    engine.setRandomSkybox();
    engine.fx.bloom.enabled = randBool(0.55);
    engine.fx.bloom.settings.strength = randRange(0.0, 10.0);
    engine.fx.bloom.settings.radius = randRange(-10.0, 10.0);
    engine.fx.bloom.settings.threshold = randRange(0.0, 10.0);

    engine.fx.RGBShift.enabled = randBool(0.4);
    engine.fx.RGBShift.shader.uniforms.amount.value = randRange(0.0, 0.1);
    engine.fx.RGBShift.shader.uniforms.angle.value = randRange(0.0, 2 * Math.PI);

    engine.fx.afterImagePass.enabled = randBool(0.35);
    engine.fx.afterImagePass.shader.uniforms.damp.value = randRange(0.0, 1.0);

    engine.fx.colorifyShader.enabled = randBool(0.35);
    engine.fx.colorifyShader.color.setHSL(Math.random(), randRange(0.2, 1.0), randRange(0.2, 0.8));

    engine.fx.kaleidoShader.enabled = randBool(0.3);
    engine.fx.kaleidoShader.shader.uniforms.sides.value = randInt(1, 24);
    engine.fx.kaleidoShader.shader.uniforms.angle.value = randRange(0.0, 2 * Math.PI);

    engine.fx.glitchPass.enabled = randBool(0.25);
    engine.fx.dotShader.enabled = randBool(0.25);
    engine.fx.technicolorShader.enabled = randBool(0.25);
    engine.fx.luminosityShader.enabled = randBool(0.25);
    engine.fx.sobelShader.enabled = randBool(0.25);
    engine.fx.halftonePass.enabled = randBool(0.25);
    engine.fx.gammaCorrectionShader.enabled = randBool(0.25);
    engine.fx.copyShader.enabled = randBool(0.2);
    engine.fx.bleachBypassShader.enabled = randBool(0.2);
    engine.fx.toonShader.enabled = randBool(0.2);

    const toneMappingMethods = [
      LinearToneMapping,
      CineonToneMapping,
      ACESFilmicToneMapping,
      NoToneMapping,
      ReinhardToneMapping,
      AgXToneMapping,
      NeutralToneMapping,
    ];
    engine.fx.toneMapping.method = toneMappingMethods[randInt(0, toneMappingMethods.length - 1)];
    renderer.toneMapping = engine.fx.toneMapping.method;
    renderer.toneMappingExposure = randRange(-500.0, 500.0);

    const currentOrder = engine.fx.getPassOrder();
    const shuffled = currentOrder.filter(passId => passId !== 'outputPass');
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    engine.fx.setPassOrder([...shuffled, 'outputPass']);

    controls.update();
    if (pane) {
      pane.refresh();
    }
    fxStudioOverlay?.refresh();
    sceneCameraDock?.refresh();
    engine.refreshFx();
  };

  async _normalizeThresholdWithBuffer(getTriggerValueFn) {
    const sampleDurationMs = 3000;
    const samples = [];
    const startTime = performance.now();

    return await new Promise(resolve => {
      let resolved = false;

      const finish = () => {
        if (resolved) {
          return;
        }
        resolved = true;

        if (samples.length === 0) {
          resolve(this.glitchPass.threshold);
          return;
        }

        samples.sort((a, b) => a - b);
        const lastIndex = samples.length - 1;
        const percentileIndex = Math.min(lastIndex, Math.max(0, Math.floor(lastIndex * 0.9)));
        const upperQuartileIndex = Math.min(lastIndex, Math.max(0, Math.floor(lastIndex * 0.75)));
        const highSample = samples[percentileIndex];
        const upperQuartile = samples[upperQuartileIndex];

        const blendedThreshold = Number.isFinite(highSample) && Number.isFinite(upperQuartile)
          ? (highSample * 0.7) + (upperQuartile * 0.3)
          : highSample;

        resolve(Number.isFinite(blendedThreshold) ? Math.max(0, blendedThreshold) : this.glitchPass.threshold);
      };

      const sampleFrame = () => {
        if (resolved) {
          return;
        }

        const value = Number(getTriggerValueFn?.());
        if (Number.isFinite(value)) {
          samples.push(value);
        }

        if (performance.now() - startTime >= sampleDurationMs) {
          finish();
          return;
        }

        requestAnimationFrame(sampleFrame);
      };

      requestAnimationFrame(sampleFrame);
      setTimeout(finish, sampleDurationMs);
    });
  }
}

export default MAGEEffects;