import {
  NoToneMapping,
  LinearToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
} from 'three';
import { Pane } from 'tweakpane';
import effects from './effects.js';

export function initControls(engine) {
  const scene = engine.scene;
  const renderer = engine.renderer;
  const camera = engine.camera;
  const controls = engine.controls;

  const state = engine.state;
  const visualizer = engine.visualizer;
  const inputs = engine.inputs;

  const SKYBOX_COUNT = 10;
  const EMBEDDED_PRESET_IDS = [1, 2, 3, 4, 5];

  let composer = engine.composer;
  let audio = engine.audio;
  let reversedAudio = engine.reversedAudio;
  let pane = null;

  const tooltipUI = {
    visible: false,
    x: 0,
    y: 0,
    element: document.createElement('div'),
  };
  tooltipUI.element.style.position = 'fixed';
  tooltipUI.element.style.zIndex = '5';
  tooltipUI.element.style.pointerEvents = 'none';
  tooltipUI.element.style.display = 'none';
  tooltipUI.element.innerHTML = '<img src="../resources/controltips.png" alt="controls" />';
  document.body.appendChild(tooltipUI.element);

  const previousAfterFrame = engine.onAfterFrame;
  engine.onAfterFrame = engineInstance => {
    if (typeof previousAfterFrame === 'function') {
      previousAfterFrame(engineInstance);
    }

    if (tooltipUI.visible) {
      tooltipUI.element.style.display = 'block';
      tooltipUI.element.style.left = `${tooltipUI.x + 3}px`;
      tooltipUI.element.style.top = `${tooltipUI.y + 3}px`;
    } else {
      tooltipUI.element.style.display = 'none';
    }
  };

  const randomizeSettings = () => {
    state.minimizing_factor = Math.random() * 1.99 + 0.01;
    state.power_factor = Math.random() * 5 + 4;
    state.pointerDownMultiplier = Math.random();
    state.base_speed = Math.random() * 0.89 + 0.01;
    state.easing_speed = Math.random() * 0.89 + 0.01;
    visualizer.scale = Math.random() * 29 + 1;

    effects.bloom.settings.enabled = Math.random() > 0.5;
    if (effects.bloom.settings.enabled) {
      effects.bloom.settings.strength = Math.random() * 10;
      effects.bloom.settings.radius = Math.random() * 20 - 10;
      effects.bloom.settings.threshold = Math.random() * 10;
    }

    effects.toneMapping.method = Math.ceil(Math.random() * 7);
    effects.toneMapping.exposure = 1.0;
    effects.RGBShift.enabled = Math.random() > 0.7;
    effects.sobelShader.enabled = Math.random() > 0.7;
    effects.luminosityShader.enabled = Math.random() > 0.75;
    effects.kaleidoShader.enabled = Math.random() > 0.85;
    effects.gammaCorrectionShader.enabled = Math.random() > 0.75;
    effects.halftonePass.enabled = Math.random() > 0.75;
    effects.afterImagePass.enabled = Math.random() > 0.75;

    controls.update();
    if (pane) {
      pane.refresh();
    }
    composer = effects.applyPostProcessing(scene, renderer, camera, composer);
    engine.composer = composer;
  };

  const loadEmbeddedPresetById = async presetId => {
    const candidates = [
      `../resources/preset${presetId}/preset.v2.json`,
    ];

    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          continue;
        }

        const presetPayload = await response.json();
        const applied = engine.loadPreset(presetPayload, { log: true });
        if (applied) {
          return true;
        }
      } catch {
        // Try next path candidate.
      }
    }

    console.warn(`[MAGE] Failed to load embedded preset ${presetId}. Checked preset.json in known resource folders.`);
    return false;
  };

  const initTweakpane = () => {
    const host = engine.canvas?.parentElement || renderer.domElement.parentElement || document.body;
    const quickPresetHost = document.createElement('div');
    let quickPresetButtons = [];

    // Ensure host can anchor absolutely-positioned children
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    const setQuickPresetsVisible = visible => {
      quickPresetHost.style.display = visible ? 'flex' : 'none';
    };

    quickPresetHost.className = 'mage-embedded-presets';
    Object.assign(quickPresetHost.style, {
      position: 'absolute',
      top: '8px',
      left: '8px',
      zIndex: '21',
      display: 'none',
      gap: '6px',
      padding: '6px',
      borderRadius: '8px',
      background: 'rgba(10, 12, 18, 0.7)',
      backdropFilter: 'blur(4px)',
    });
    host.appendChild(quickPresetHost);

    const setQuickPresetButtonsDisabled = disabled => {
      for (const button of quickPresetButtons) {
        button.disabled = disabled;
        button.style.opacity = disabled ? '0.6' : '1';
        button.style.cursor = disabled ? 'progress' : 'pointer';
      }
    };

    quickPresetButtons = EMBEDDED_PRESET_IDS.map(presetId => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Preset ${presetId}`;
      Object.assign(button.style, {
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.08)',
        color: '#fff',
        fontSize: '12px',
        lineHeight: '1',
        padding: '8px 10px',
        cursor: 'pointer',
      });

      button.addEventListener('click', async () => {
        setQuickPresetButtonsDisabled(true);
        const ok = await loadEmbeddedPresetById(presetId);
        setQuickPresetButtonsDisabled(false);
        if (ok) {
          setQuickPresetsVisible(false);
        }
      });

      quickPresetHost.appendChild(button);
      return button;
    });

    const previousPresetLoaded = engine.onPresetLoaded;
    engine.onPresetLoaded = preset => {
      if (typeof previousPresetLoaded === 'function') {
        previousPresetLoaded(preset);
      }
      setQuickPresetsVisible(!preset);
    };

    engine.setEmbeddedPresetButtonsVisible = visible => {
      setQuickPresetsVisible(Boolean(visible));
    };

    // Show quick presets only in default mode (no preset has been applied yet).
    setQuickPresetsVisible(!engine.currentPreset);

    const paneMount = document.createElement('div');
    paneMount.className = 'mage-pane-host';
    Object.assign(paneMount.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '20',
    });
    host.appendChild(paneMount);

    pane = new Pane({ container: paneMount });

    pane
      .addButton({
        title: 'Randomize',
        label: '???',
      })
      .on('click', () => {
        randomizeSettings();
        pane.refresh();
      });

    const skyboxOptions = {};
    for (let i = 1; i <= SKYBOX_COUNT; i++) {
      skyboxOptions[`${i}`] = i;
    }

    pane
      .addBinding(visualizer, 'skyboxPreset', {
        label: 'Skybox',
        options: skyboxOptions,
      })
      .on('change', () => {
        engine._loadSkybox({
          type: 'preset',
          presetId: Number.parseInt(`${visualizer.skyboxPreset}`, 10) || 0,
        });
      });

    const firstTab = pane.addTab({
      pages: [{ title: 'Scene Settings' }, { title: 'Post Processing' }],
    });

    {
      const vizui = firstTab.pages[0];

      vizui.addBinding(state, 'minimizing_factor', {
        min: 0.01,
        max: 2.0,
        label: 'MOD 1',
      });
      vizui.addBinding(state, 'power_factor', {
        min: 1.0,
        max: 10.0,
        label: 'MOD 2',
      });
      vizui.addBinding(state, 'pointerDownMultiplier', {
        min: 0.0,
        max: 1.0,
        label: 'MOD 3',
      });
      vizui.addBinding(state, 'base_speed', {
        min: 0.01,
        max: 0.9,
        label: 'Base Speed',
      });
      vizui.addBinding(state, 'easing_speed', {
        min: 0.01,
        max: 0.9,
        label: 'Easing Speed',
      });
      vizui.addBinding(visualizer, 'scale', {
        min: 1,
        max: 200.0,
        label: 'Scale',
      });
      // vizui.addBinding(state, 'time_multiplier', {
      //   min: 0.1,
      //   max: 100,
      //   label: 'Time',
      // });
      vizui.addBinding(controls, 'autoRotate', { label: 'Auto Rotate' });
      vizui.addBinding(controls, 'autoRotateSpeed', {
        min: 0.1,
        max: 50.0,
        label: 'Rotation Speed',
      });
    }

    {
      const bloomui = firstTab.pages[1]
        .addFolder({ title: 'Bloom Settings' })
        .on('change', () => {
          setTimeout(() => {
            composer = effects.applyPostProcessing(scene, renderer, camera, composer);
            engine.composer = composer;
          }, 10);
        });
      bloomui.addBinding(effects.bloom.settings, 'strength', {
        min: 0.0,
        max: 10.0,
        label: 'Strength',
      });
      bloomui.addBinding(effects.bloom.settings, 'radius', {
        min: -10.0,
        max: 10.0,
        label: 'Radius',
      });
      bloomui.addBinding(effects.bloom.settings, 'threshold', {
        min: 0.0,
        max: 10.0,
        label: 'Threshold',
      });
      bloomui.addBinding(effects.bloom, 'enabled', { label: 'Enable Bloom' });
    }

    {
      const ppui = firstTab.pages[1]
        .addFolder({ title: 'Post Processing Effects' })
        .on('change', () => {
          setTimeout(() => {
            composer = effects.applyPostProcessing(scene, renderer, camera, composer);
            engine.composer = composer;
          }, 10);
        });

      {
        ppui
          .addBinding(effects.toneMapping, 'method', {
            label: 'ToneMapping',
            options: {
              Linear: LinearToneMapping,
              Cineon: CineonToneMapping,
              Filmic: ACESFilmicToneMapping,
              NoTone: NoToneMapping,
              Reinhard: ReinhardToneMapping,
              AGX: AgXToneMapping,
              Neutral: NeutralToneMapping,
            },
          })
          .on('change', () => {
            effects.outputPass.enabled = true;
            composer = effects.applyPostProcessing(scene, renderer, camera, composer);
            engine.composer = composer;
            renderer.toneMapping = effects.toneMapping.method;
            pane.refresh();
          });
        ppui.addBinding(renderer, 'toneMappingExposure', {
          min: -500.0,
          max: 500.0,
          label: 'Exposure',
        });
      }

      const pptab = ppui.addTab({
        pages: [{ title: 'Effect Enabled' }, { title: 'Effect Settings' }],
      });

      const rgbShiftAmount = pptab.pages[1].addBinding(
        effects.RGBShift.shader.uniforms.amount,
        'value',
        { min: 0, max: 0.1, label: 'RGB Shift' },
      );
      const rgbShiftAngle = pptab.pages[1].addBinding(
        effects.RGBShift.shader.uniforms.angle,
        'value',
        { min: 0, max: Math.PI * 2, label: 'Angle' },
      );
      rgbShiftAmount.hidden = true;
      rgbShiftAngle.hidden = true;
      pptab.pages[0]
        .addBinding(effects.RGBShift, 'enabled', { label: 'RGBShift' })
        .on('change', () => {
          if (effects.RGBShift.enabled) {
            rgbShiftAmount.hidden = false;
            rgbShiftAngle.hidden = false;
          } else {
            rgbShiftAmount.hidden = true;
            rgbShiftAngle.hidden = true;
          }
        });

      pptab.pages[0].addBinding(effects.dotShader, 'enabled', { label: 'Dot FX' });
      pptab.pages[0].addBinding(effects.technicolorShader, 'enabled', {
        label: 'Technicolor',
      });
      pptab.pages[0].addBinding(effects.luminosityShader, 'enabled', {
        label: 'Luminosity',
      });

      const afterImageDamp = pptab.pages[1].addBinding(
        effects.afterImagePass.shader.uniforms.damp,
        'value',
        {
          min: 0.0,
          max: 1.0,
          label: 'After Image Damp',
        },
      );
      afterImageDamp.hidden = true;
      pptab.pages[0]
        .addBinding(effects.afterImagePass, 'enabled', {
          label: 'After Image',
        })
        .on('change', () => {
          effects.afterImagePass.enabled
            ? (afterImageDamp.hidden = false)
            : (afterImageDamp.hidden = true);
        });

      pptab.pages[0]
        .addBinding(effects.sobelShader, 'enabled', { label: 'Sobel' })
        .on('change', () => {
          const bufferWidth = renderer.domElement.width || window.innerWidth * window.devicePixelRatio;
          const bufferHeight = renderer.domElement.height || window.innerHeight * window.devicePixelRatio;
          effects.sobelShader.shader.uniforms.resolution.value.x =
            bufferWidth;
          effects.sobelShader.shader.uniforms.resolution.value.y =
            bufferHeight;
        });

      pptab.pages[0].addBinding(effects.glitchPass, 'enabled', {
        label: 'Glitch',
      });

      const colorifyHue = pptab.pages[1].addBinding(effects.colorifyShader, 'color', {
        label: 'Colorify Hue',
      });
      colorifyHue.hidden = true;
      pptab.pages[0]
        .addBinding(effects.colorifyShader, 'enabled', {
          label: 'Colorify',
        })
        .on('change', () => {
          effects.colorifyShader.enabled
            ? (colorifyHue.hidden = false)
            : (colorifyHue.hidden = true);
        });

      pptab.pages[0].addBinding(effects.halftonePass, 'enabled', {
        label: 'Halftone',
      });
      pptab.pages[0].addBinding(effects.gammaCorrectionShader, 'enabled', {
        label: 'Gamma Correction',
      });

      const kaleidoSides = pptab.pages[1].addBinding(
        effects.kaleidoShader.shader.uniforms.sides,
        'value',
        { label: 'Kaleidoscope sides' },
      );
      const kaleidoAngle = pptab.pages[1].addBinding(
        effects.kaleidoShader.shader.uniforms.angle,
        'value',
        { label: 'Kaleidoscope angle' },
      );
      kaleidoAngle.hidden = true;
      kaleidoSides.hidden = true;
      pptab.pages[0]
        .addBinding(effects.kaleidoShader, 'enabled', { label: 'Kaleid' })
        .on('change', () => {
          if (effects.kaleidoShader.enabled) {
            kaleidoAngle.hidden = false;
            kaleidoSides.hidden = false;
          } else {
            kaleidoAngle.hidden = true;
            kaleidoSides.hidden = true;
          }
        });

      pptab.pages[0].addBinding(effects.outputPass, 'enabled', {
        label: 'Output Pass',
      });
    }

    {
      const camui = pane
        .addFolder({ title: 'Camera Settings' })
        .on('change', () => {
          camera.updateProjectionMatrix();
        });
      camui.addBinding(camera, 'fov', { min: 1, max: 359, label: 'FOV' });
      camui
        .addBinding(state, 'camTilt', {
          min: 0.0,
          max: 2 * Math.PI,
          label: 'Camera Orientation',
        })
        .on('change', () => {
          camera.up.set(
            Math.sin(state.camTilt),
            Math.cos(state.camTilt),
            -Math.sin(state.camTilt),
          );
        });
      camui
        .addButton({
          title: 'Reset',
          label: 'Camera Position',
        })
        .on('click', () => {
          controls.reset();
        });
    }

    pane.addBinding(effects.copyShader, 'enabled');

    pane.hidden = true;

    // Expose tweakpane state export so engine.toPreset can include settings.
    engine.exportSettingsState = () => {
      if (!pane) {
        return null;
      }
      return pane.exportState();
    };

    engine.importSettingsState = state => {
      if (!pane) {
        return;
      } else {
        pane.importState(state);
        pane.refresh();

        renderer.toneMapping = effects.toneMapping.method;
        if (effects.sobelShader?.shader?.uniforms?.resolution?.value) {
          const bufferWidth = renderer.domElement.width || window.innerWidth * window.devicePixelRatio;
          const bufferHeight = renderer.domElement.height || window.innerHeight * window.devicePixelRatio;
          effects.sobelShader.shader.uniforms.resolution.value.x =
            bufferWidth;
          effects.sobelShader.shader.uniforms.resolution.value.y =
            bufferHeight;
        }

        composer = effects.applyPostProcessing(scene, renderer, camera, composer);
        engine.composer = composer;
      } 
    };

    engine.refreshSettingsUI = () => {
      if (!pane) {
        return;
      }
      pane.refresh();
    };
  };

  const getOS = () => {
    const userAgent = window.navigator.userAgent;
    const platform =
      window.navigator?.userAgentData?.platform || window.navigator.platform;
    const macosPlatforms = ['macOS', 'Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
    const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
    const iosPlatforms = ['iPhone', 'iPad', 'iPod'];
    let os = null;

    if (macosPlatforms.indexOf(platform) !== -1) {
      os = 'Mac OS';
    } else if (iosPlatforms.indexOf(platform) !== -1) {
      os = 'iOS';
    } else if (windowsPlatforms.indexOf(platform) !== -1) {
      os = 'Windows';
    } else if (/Android/.test(userAgent)) {
      os = 'Android';
    } else if (/Linux/.test(platform)) {
      os = 'Linux';
    }

    return os;
  };

  const toggleUI = () => {
    // const buttonsContainer = document.querySelector('.ui_buttons');
    // buttonsContainer.style.display =
    //   buttonsContainer.style.display === 'flex' ? 'none' : 'flex';
  };

  const switchControls = () => {
    visualizer.render_tooltips = false;
    if (pane) {
      pane.hidden = true;
    }
    toggleUI();
    const hideUIbutton = document.getElementById('ui_hide');
    hideUIbutton.style.display = 'none';
  };

  const eventSetup = () => {
    const bindClick = (id, handler) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', handler);
      }
    };

    window.addEventListener('resize', () => {
      if (typeof engine._syncViewport === 'function') {
        engine._syncViewport(true);
      }
      if (effects.sobelShader?.shader?.uniforms?.resolution?.value) {
        const bufferWidth = renderer.domElement.width || window.innerWidth * window.devicePixelRatio;
        const bufferHeight = renderer.domElement.height || window.innerHeight * window.devicePixelRatio;
        effects.sobelShader.shader.uniforms.resolution.value.x = bufferWidth;
        effects.sobelShader.shader.uniforms.resolution.value.y = bufferHeight;
      }
      composer = effects.applyPostProcessing(scene, renderer, camera, composer);
      engine.composer = composer;
    });

    window.addEventListener('pointermove', event => {
      const rect = renderer.domElement.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width;
      const relY = (event.clientY - rect.top) / rect.height;

      const inside = relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1;

      // Raycast input (NDC)
      if (inside) {
        inputs.currMouse.x = relX * 2 - 1;
        inputs.currMouse.y = -relY * 2 + 1;
      } else {
        inputs.currMouse.x = 2;
        inputs.currMouse.y = 2;
      }

      // Animation/audio input source
      if (visualizer.controllingAudio) {
        state.currMouse.x = relX * 2 - 1;
        state.currMouse.y = -relY * 2 + 1;
      } else {
        state.currMouse.x = relX / 4 - 1;
        state.currMouse.y = -relY / 4 + 1;
      }

      tooltipUI.x = event.clientX;
      tooltipUI.y = event.clientY;
      tooltipUI.visible = visualizer.clickable && visualizer.render_tooltips;
    });

    window.addEventListener('pointerdown', event => {
      state.currPointerDown = 1.0;

      if (!visualizer.clickable || !visualizer.intersected) {
        return;
      }

      controls.enabled = false;
      if (event.button === 1) {
        visualizer.controllingAudio = true;
      }

      if (event.button === 2) {
        const tooltipImage = tooltipUI.element.querySelector('img');
        if (tooltipImage) {
          tooltipImage.hidden = false;
        }
        visualizer.render_tooltips = true;
        tooltipUI.visible = true;
        if (pane) {
          pane.hidden = !pane.hidden;
        }
        toggleUI();
      }
    });

    window.addEventListener('pointerup', event => {
      visualizer.controllingAudio = false;
      controls.enabled = true;
      if (audio && audio.setPlaybackRate) {
        audio.setPlaybackRate(1);
      }
      if (reversedAudio && reversedAudio.pause) {
        reversedAudio.pause();
      }
      state.currPointerDown = 0.0 + 1 * state.pointerDownMultiplier;

      if (!visualizer.intersected || !visualizer.clickable) {
        return;
      }

      if (event.button === 0) {
        if (!audio || !audio.isPlaying) {
          engine.play();
        } else {
          engine.pause();
        }
      }

      if (event.button === 1) {
        if (reversedAudio && reversedAudio.pause) {
          reversedAudio.pause();
        }
        engine.play();
      }
    });

    bindClick('ui_regenerate', () => {
      engine.loadVisualizer();
    });

    bindClick('ui_upload', () => {
      engine.loadAudio();
      audio = engine.audio;
      reversedAudio = engine.reversedAudio;
    });

    bindClick('ui_hide', () => {
      const tooltipImage = tooltipUI.element.querySelector('img');
      if (tooltipImage) {
        tooltipImage.hidden = true;
      }
      visualizer.render_tooltips = false;
      if (pane) {
        pane.hidden = true;
      }
      toggleUI();
    });

    bindClick('ui_settings', () => {
      if (pane) {
        pane.hidden = !pane.hidden;
      }
    });
  };

  initTweakpane();
  eventSetup();
  if (getOS() !== ('Windows' || 'Mac OS' || 'Linux')) {
    switchControls();
  }
  return pane;
}
