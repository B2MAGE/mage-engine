import { shaderParkGenerator } from "./generateshaderparkcode";
import { hashSeedString } from "./helpers.js";
import { BoxGeometry } from 'three';
import { createSculptureWithGeometry } from "shader-park-core";

export class MAGEVisualizer {
  constructor(engine) {
    this.engine = engine;
    this.shader = null;
    this.seed = null;
    this.shaderIndex = -1;
    this.shaders = [];
    this.skyboxPreset = null;
    this.mesh = null;
    this.scale = 10.0;
    this.intersected = false;
    this.clickable = false;
    this.controllingAudio = false;
    this.render_tooltips = true;
    this.centerClickRadiusNdc = 0.35;
  }

  /**
   * @typedef {Object} ShaderLoadOptions
   * @property {string|object} [shader] - The shader code to load, either as a string or an object containing a 'shader' property. If invalid or missing, a new shader will be generated.
   * @property {boolean} [addToHistory=false] - Whether to add the loaded shader to the history for navigation.
   * @property {boolean} [clearHistory=false] - Whether to clear the shader history when loading this shader.
   */

  /**
   * @param {ShaderLoadOptions} options 
   * @returns {string|null} The final shader code that was loaded, or null if loading failed.
   * @description Loads a shader into the visualizer, replacing the current one. If no valid shader code is provided, generates a new shader using the built-in generator. 
   * Optionally adds the shader to the history for navigation and can clear history when loading a new shader. Returns the final shader code that was loaded, or null 
   * if loading failed due to invalid input.
   */

  load({ seed = null, shader = null, addToHistory = true, clearHistory = false, generator = null } = {}){

    let finalShaderCode = null;
    let generatedSeed = null;

    // Prefer an explicit shader if provided (string or { shader, seed })
    if (shader) {
      if (this.engine.log) {
        console.log('MAGEVisualizer.load: Loading shader from input:', shader);
      }

      // use shader directly if it's a string, otherwise try to extract shader code from object 
      if (typeof shader === 'string') {
        finalShaderCode = shader;
      }

      // If a seed param is explicitly provided, prefer it for tracking/regeneration
      if (seed !== null) {
        generatedSeed = seed;
      }
    // If no shader provided but seed is provided, we can still generate a shader
    } else {
      const result = shaderParkGenerator(this, seed, generator);
      finalShaderCode = result.shader;
      generatedSeed = result.seed;
    }

    this.shader = finalShaderCode;
    this.seed = generatedSeed;

    if (!finalShaderCode) {
      throw new Error('Failed to load shader: No valid shader code provided and generation failed.');
    }

    if (clearHistory) {
      this.shaders = [];
      this.shaderIndex = -1;
    }

    if (addToHistory) {
      this.shaders.push({
        //id: MAGEEngine.#_idFromShaderCode(finalShaderCode),
        shader: this.shader,
        seed: this.seed,
        timestamp: Date.now(),
      });
      this.shaderIndex = this.shaders.length - 1;
    }

    this.createMesh(this.shader);
  }

  createMesh(shaderCode) {
    const state = this.engine.state;
    const geometry = new BoxGeometry(20000, 20000, 20000);
    
    // Only pass audio params if the shader declares them
    const hasAudioInputs = shaderCode &&
      shaderCode.includes('let bass = input()') &&
      shaderCode.includes('let mid = input()') &&
      shaderCode.includes('let treble = input()') &&
      shaderCode.includes('let energy = input()') &&
      shaderCode.includes('let spectralCentroid = input()') &&
      shaderCode.includes('let energyTrend = input()');

    const hasLegacyAudioInputs = shaderCode &&
      shaderCode.includes('let size = input()')
    
    this.mesh = createSculptureWithGeometry(geometry, shaderCode, () => {
          const callback = {
            time: state.time ?? 0,
            pointerDown: state.pointerDown ?? 0,
            mouse: state.mouse ?? { x: 0, y: 0 },
            _scale: this.scale ?? 1,
          };
          
          // Only add audio params if shader declares them (allows legacy shaders to work)
          if (hasAudioInputs) {
            callback.bass = state.currBass ?? 0;
            callback.mid = state.currMid ?? 0;
            callback.treble = state.currTreble ?? 0;
            callback.energy = state.currEnergy ?? 0;
            callback.spectralCentroid = state.currCentroid ?? 0;
            callback.energyTrend = state.currEnergyTrend ?? 0;
          }

          if (hasLegacyAudioInputs) {
            // scale curr energy to a 0-1 range and add to existing size input for legacy shader support, allowing older shaders to be influenced by audio without breaking their existing size mappings
            callback.size = state.currEnergy * 0.23 + state.size ?? 0;
          }
          
          return callback;
    });
  }

  getActiveShader() {
    if (this.shaderIndex >= 0 && this.shaderIndex < this.shaders.length) {
      return this.shaders[this.shaderIndex].shader;
    }
    return 'default';
  }

  previousShader() {
    if (this.shaders.length <= 1) {
      return;
    }
    let nextShader;
    if (this.shaderIndex <= 0) {
      this.engine.showViewportMessage(`Reached first visualizer.`, 25);
      return;
    } else {
      nextShader = this.shaders[this.shaderIndex - 1];
      this.shaderIndex--;
    }
    this.load({ shader: nextShader.shader, seed: nextShader.seed, addToHistory: false });
    this.engine.showViewportMessage(`Loading previous visualizer...`, 25);
    return;
  }

  nextShader() {
    if (this.shaders.length <= 1) {
      return;
    }
    let nextShader;
    if (this.shaderIndex >= this.shaders.length - 1) {
      this.engine.showViewportMessage(`Reached latest visualizer.`, 25);
      return;
    } else {
      nextShader = this.shaders[this.shaderIndex + 1];
      this.shaderIndex++;
    }
    this.load({ shader: nextShader.shader, seed: nextShader.seed, addToHistory: false });
    this.engine.showViewportMessage(`Loading next visualizer...`, 25);
    return;
  }

  isLegacyShader() {
     const shaderCode = this.getActiveShader();
     const isLegacy = shaderCode && shaderCode.includes('let size = input()') && !shaderCode.includes('let bass = input()');
     return isLegacy;
  }

  hasAudioInputs() {
    const shaderCode = this.getActiveShader();
    const hasAudio = shaderCode &&
      shaderCode.includes('let bass = input()') &&
      shaderCode.includes('let mid = input()') &&
      shaderCode.includes('let treble = input()') &&
      shaderCode.includes('let energy = input()') &&
      shaderCode.includes('let spectralCentroid = input()') &&
      shaderCode.includes('let energyTrend = input()');
    return hasAudio;
  }
}