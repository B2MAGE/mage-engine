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
import { getEmbeddedPresetById, getEmbeddedPresetIds } from './presets.js';
import { EMBEDDED_SKYBOXES } from './skyboxes.js';
import controlTipsImageDataUrl from '../resources/controltips.png?inline';

export function initControls(engine, options = {}) {
  const scene = engine.scene;
  const renderer = engine.renderer;
  const camera = engine.camera;
  const controls = engine.controls;

  const host = engine.canvas?.parentElement || renderer.domElement.parentElement || document.body;
  // Ensure host can anchor absolutely-positioned children
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  const state = engine.state;
  const visualizer = engine.visualizer;
  const inputs = engine.inputs;

  const EMBEDDED_PRESET_IDS = getEmbeddedPresetIds();

  let composer = engine.composer;
  let audio = engine.audio;
  let reversedAudio = engine.reversedAudio;
  let pane = null;
  let fxStudioOverlay = null;
  let sceneCameraDock = null;

  const rebuildComposer = () => {
    composer = effects.applyPostProcessing(scene, renderer, camera, composer);
    engine.composer = composer;
  };

  const tooltipUI = {
    visible: false,
    x: 0,
    y: 0,
    element: document.createElement('div'),
  };
  tooltipUI.element.style.position = 'fixed';
  tooltipUI.element.style.transform = 'translate(-50%, -50%)';
  tooltipUI.element.style.zIndex = '5';
  tooltipUI.element.style.pointerEvents = 'none';
  tooltipUI.element.style.display = 'none';
  tooltipUI.element.innerHTML = `<img src="${controlTipsImageDataUrl}" alt="controls" />`;
  document.body.appendChild(tooltipUI.element);

  const previousAfterFrame = engine.onAfterFrame;
  engine.onAfterFrame = engineInstance => {
    if (typeof previousAfterFrame === 'function') {
      previousAfterFrame(engineInstance);
    }

    if (tooltipUI.visible) {
      // hide regular mouse pointer
      engineInstance.renderer.domElement.style.cursor = 'none';
      tooltipUI.element.style.display = 'block';
      tooltipUI.element.style.left = `${tooltipUI.x}px`;
      tooltipUI.element.style.top = `${tooltipUI.y}px`;
    } else {
      tooltipUI.element.style.display = 'none';
      engineInstance.renderer.domElement.style.cursor = '';
    }
  };

  const randomizeSettings = () => {
    const randRange = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(randRange(min, max + 1));
    const randBool = (chance = 0.5) => Math.random() < chance;

    // Scene + camera controls
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

    const embeddedSkyboxIds = Object.keys(EMBEDDED_SKYBOXES)
      .map(value => Number.parseInt(value, 10))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (embeddedSkyboxIds.length > 0) {
      const skyboxId = embeddedSkyboxIds[randInt(0, embeddedSkyboxIds.length - 1)];
      visualizer.skyboxPreset = skyboxId;
      engine._loadSkybox({ type: 'preset', presetId: skyboxId });
    }

    // FX toggles + all adjustable FX parameters
    effects.bloom.enabled = randBool(0.55);
    effects.bloom.settings.strength = randRange(0.0, 10.0);
    effects.bloom.settings.radius = randRange(-10.0, 10.0);
    effects.bloom.settings.threshold = randRange(0.0, 10.0);

    effects.RGBShift.enabled = randBool(0.4);
    effects.RGBShift.shader.uniforms.amount.value = randRange(0.0, 0.1);
    effects.RGBShift.shader.uniforms.angle.value = randRange(0.0, 2 * Math.PI);

    effects.afterImagePass.enabled = randBool(0.35);
    effects.afterImagePass.shader.uniforms.damp.value = randRange(0.0, 1.0);

    effects.colorifyShader.enabled = randBool(0.35);
    effects.colorifyShader.color.setHSL(Math.random(), randRange(0.2, 1.0), randRange(0.2, 0.8));

    effects.kaleidoShader.enabled = randBool(0.3);
    effects.kaleidoShader.shader.uniforms.sides.value = randInt(1, 24);
    effects.kaleidoShader.shader.uniforms.angle.value = randRange(0.0, 2 * Math.PI);

    effects.glitchPass.enabled = randBool(0.25);
    effects.dotShader.enabled = randBool(0.25);
    effects.technicolorShader.enabled = randBool(0.25);
    effects.luminosityShader.enabled = randBool(0.25);
    effects.sobelShader.enabled = randBool(0.25);
    effects.halftonePass.enabled = randBool(0.25);
    effects.gammaCorrectionShader.enabled = randBool(0.25);
    effects.copyShader.enabled = randBool(0.2);
    effects.bleachBypassShader.enabled = randBool(0.2);
    effects.toonShader.enabled = randBool(0.2);

    const toneMappingMethods = [
      LinearToneMapping,
      CineonToneMapping,
      ACESFilmicToneMapping,
      NoToneMapping,
      ReinhardToneMapping,
      AgXToneMapping,
      NeutralToneMapping,
    ];
    effects.toneMapping.method = toneMappingMethods[randInt(0, toneMappingMethods.length - 1)];
    renderer.toneMapping = effects.toneMapping.method;
    renderer.toneMappingExposure = randRange(-500.0, 500.0);

    const currentOrder = effects.getPassOrder();
    const shuffled = currentOrder.filter(passId => passId !== 'outputPass');
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    effects.setPassOrder([...shuffled, 'outputPass']);

    controls.update();
    if (pane) {
      pane.refresh();
    }
    fxStudioOverlay?.refresh();
    sceneCameraDock?.refresh();
    rebuildComposer();
  };

  const loadPresetById = async presetId => {
    const embeddedPreset = getEmbeddedPresetById(presetId);
    if (embeddedPreset) {
      const appliedEmbedded = engine.loadPreset(embeddedPreset);
      return Boolean(appliedEmbedded);
    }

    return false;
  };

  const createFxStudioOverlay = () => {
    const toneMappingOptions = [
      { label: 'Linear', value: LinearToneMapping },
      { label: 'Cineon', value: CineonToneMapping },
      { label: 'Filmic', value: ACESFilmicToneMapping },
      { label: 'NoTone', value: NoToneMapping },
      { label: 'Reinhard', value: ReinhardToneMapping },
      { label: 'AGX', value: AgXToneMapping },
      { label: 'Neutral', value: NeutralToneMapping },
    ];

    const layerLabels = {
      bloom: 'Bloom',
      RGBShift: 'RGB Shift',
      dotShader: 'Dot FX',
      technicolorShader: 'Technicolor',
      luminosityShader: 'Luminosity',
      afterImagePass: 'After Image',
      sobelShader: 'Sobel',
      colorifyShader: 'Colorify',
      halftonePass: 'Halftone',
      gammaCorrectionShader: 'Gamma Correction',
      kaleidoShader: 'Kaleid',
      glitchPass: 'Glitch',
      copyShader: 'Copy Shader',
      bleachBypassShader: 'Bleach Bypass',
      toonShader: 'Toon',
      outputPass: 'Output Pass',
    };

    const syncSobelResolution = () => {
      if (!effects.sobelShader?.shader?.uniforms?.resolution?.value) {
        return;
      }
      const bufferWidth = renderer.domElement.width || window.innerWidth * window.devicePixelRatio;
      const bufferHeight = renderer.domElement.height || window.innerHeight * window.devicePixelRatio;
      effects.sobelShader.shader.uniforms.resolution.value.x = bufferWidth;
      effects.sobelShader.shader.uniforms.resolution.value.y = bufferHeight;
    };

    const overlay = document.createElement('div');
    overlay.className = 'mage-fx-studio-dock';
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '40',
      display: 'none',
      pointerEvents: 'none',
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: '360px',
      maxHeight: '84vh',
      overflow: 'auto',
      padding: '12px',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(13, 17, 26, 0.95)',
      color: '#fff',
      display: 'grid',
      gap: '10px',
      pointerEvents: 'auto',
      boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    });

    const title = document.createElement('div');
    title.textContent = 'FX Studio';
    Object.assign(title.style, {
      fontSize: '16px',
      fontWeight: '700',
    });

    const hint = document.createElement('div');
    hint.textContent = 'Drag rows to reorder. Each row combines enable and settings.';
    Object.assign(hint.style, {
      fontSize: '12px',
      opacity: '0.8',
    });

    const stackSection = document.createElement('div');
    Object.assign(stackSection.style, {
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '10px',
      padding: '8px',
      display: 'grid',
      gap: '8px',
    });

    const stackTitle = document.createElement('div');
    stackTitle.textContent = 'Effect Stack';
    Object.assign(stackTitle.style, {
      fontSize: '13px',
      fontWeight: '600',
    });

    const stackList = document.createElement('div');
    Object.assign(stackList.style, {
      display: 'grid',
      gap: '6px',
    });

    let draggedLayerId = null;

    const clearDropIndicators = () => {
      stackList
        .querySelectorAll('[data-layer-id]')
        .forEach(rowEl => {
          rowEl.style.outline = 'none';
          rowEl.style.background = 'rgba(255,255,255,0.03)';
        });
    };

    const addRangeControl = (parent, { label, min, max, step = 0.001, getValue, setValue }) => {
      const row = document.createElement('label');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '8px',
        alignItems: 'center',
        fontSize: '12px',
        marginBottom: '5px',
      });

      const labelEl = document.createElement('span');
      labelEl.textContent = label;

      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        minWidth: '210px',
        gap: '6px',
        alignItems: 'center',
      });

      const input = document.createElement('input');
      input.type = 'range';
      input.min = `${min}`;
      input.max = `${max}`;
      input.step = `${step}`;

      const stepText = `${step}`;
      const decimalPlaces = stepText.includes('.') ? stepText.split('.')[1].length : 0;
      const formatValue = value => {
        if (!Number.isFinite(value)) {
          return `${min}`;
        }
        return decimalPlaces > 0 ? value.toFixed(Math.min(6, decimalPlaces)) : `${Math.round(value)}`;
      };

      const valueEl = document.createElement('input');
      valueEl.type = 'number';
      valueEl.min = `${min}`;
      valueEl.max = `${max}`;
      valueEl.step = `${step}`;
      Object.assign(valueEl.style, {
        width: '82px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        background: 'rgba(0,0,0,0.5)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '4px',
        padding: '2px 4px',
      });

      const clamp = value => Math.max(min, Math.min(max, value));

      const sync = () => {
        const value = Number(getValue());
        const normalized = Number.isFinite(value) ? clamp(value) : min;
        input.value = `${normalized}`;
        valueEl.value = formatValue(normalized);
      };

      input.addEventListener('input', () => {
        const value = clamp(Number.parseFloat(input.value));
        setValue(value);
        valueEl.value = formatValue(value);
        rebuildComposer();
      });

      valueEl.addEventListener('change', () => {
        const parsed = Number.parseFloat(valueEl.value);
        if (!Number.isFinite(parsed)) {
          sync();
          return;
        }
        const value = clamp(parsed);
        setValue(value);
        input.value = `${value}`;
        valueEl.value = formatValue(value);
        rebuildComposer();
      });

      sync();
      wrap.appendChild(input);
      wrap.appendChild(valueEl);
      row.appendChild(labelEl);
      row.appendChild(wrap);
      parent.appendChild(row);
    };

    const addColorControl = (parent, { label, getValue, setValue }) => {
      const row = document.createElement('label');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '8px',
        alignItems: 'center',
        fontSize: '12px',
        marginBottom: '5px',
      });

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = getValue();
      Object.assign(input.style, {
        width: '40px',
        height: '22px',
        border: 'none',
        background: 'transparent',
      });

      input.addEventListener('input', () => {
        setValue(input.value);
        rebuildComposer();
      });

      row.appendChild(labelEl);
      row.appendChild(input);
      parent.appendChild(row);
    };

    const addToneMappingControl = parent => {
      const row = document.createElement('label');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '8px',
        alignItems: 'center',
        fontSize: '12px',
        marginBottom: '5px',
      });

      const labelEl = document.createElement('span');
      labelEl.textContent = 'Tone Mapping';

      const select = document.createElement('select');
      Object.assign(select.style, {
        minWidth: '150px',
        background: 'rgba(0,0,0,0.5)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '6px',
        padding: '4px 6px',
      });

      toneMappingOptions.forEach(option => {
        const el = document.createElement('option');
        el.value = `${option.value}`;
        el.textContent = option.label;
        select.appendChild(el);
      });

      select.value = `${effects.toneMapping.method}`;
      select.addEventListener('change', () => {
        effects.toneMapping.method = Number.parseFloat(select.value);
        renderer.toneMapping = effects.toneMapping.method;
        rebuildComposer();
      });

      row.appendChild(labelEl);
      row.appendChild(select);
      parent.appendChild(row);
    };

    const addSettingsForPass = (passId, parent) => {
      if (passId === 'bloom') {
        addRangeControl(parent, {
          label: 'Strength', min: 0, max: 10, step: 0.001,
          getValue: () => effects.bloom.settings.strength,
          setValue: value => { effects.bloom.settings.strength = value; },
        });
        addRangeControl(parent, {
          label: 'Radius', min: -10, max: 10, step: 0.001,
          getValue: () => effects.bloom.settings.radius,
          setValue: value => { effects.bloom.settings.radius = value; },
        });
        addRangeControl(parent, {
          label: 'Threshold', min: 0, max: 10, step: 0.001,
          getValue: () => effects.bloom.settings.threshold,
          setValue: value => { effects.bloom.settings.threshold = value; },
        });
      }

      if (passId === 'RGBShift') {
        addRangeControl(parent, {
          label: 'Amount', min: 0, max: 0.1, step: 0.0001,
          getValue: () => effects.RGBShift.shader.uniforms.amount.value,
          setValue: value => { effects.RGBShift.shader.uniforms.amount.value = value; },
        });
        addRangeControl(parent, {
          label: 'Angle', min: 0, max: Math.PI * 2, step: 0.001,
          getValue: () => effects.RGBShift.shader.uniforms.angle.value,
          setValue: value => { effects.RGBShift.shader.uniforms.angle.value = value; },
        });
      }

      if (passId === 'afterImagePass') {
        addRangeControl(parent, {
          label: 'Damp', min: 0, max: 1, step: 0.001,
          getValue: () => effects.afterImagePass.shader.uniforms.damp.value,
          setValue: value => { effects.afterImagePass.shader.uniforms.damp.value = value; },
        });
      }

      if (passId === 'colorifyShader') {
        addColorControl(parent, {
          label: 'Hue',
          getValue: () => `#${effects.colorifyShader.color.getHexString()}`,
          setValue: value => { effects.colorifyShader.color.set(value); },
        });
      }

      if (passId === 'kaleidoShader') {
        addRangeControl(parent, {
          label: 'Sides', min: 1, max: 24, step: 1,
          getValue: () => effects.kaleidoShader.shader.uniforms.sides.value,
          setValue: value => { effects.kaleidoShader.shader.uniforms.sides.value = Math.max(1, Math.round(value)); },
        });
        addRangeControl(parent, {
          label: 'Angle', min: 0, max: Math.PI * 2, step: 0.001,
          getValue: () => effects.kaleidoShader.shader.uniforms.angle.value,
          setValue: value => { effects.kaleidoShader.shader.uniforms.angle.value = value; },
        });
      }

      if (passId === 'outputPass') {
        addToneMappingControl(parent);
        addRangeControl(parent, {
          label: 'Exposure', min: -500, max: 500, step: 0.01,
          getValue: () => renderer.toneMappingExposure,
          setValue: value => { renderer.toneMappingExposure = value; },
        });
      }
    };

    const renderStack = () => {
      stackList.innerHTML = '';
      const orderedLayers = effects.getPassOrder();

      orderedLayers.forEach((passId, index) => {
        const row = document.createElement('div');
        row.dataset.layerId = passId;
        Object.assign(row.style, {
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '8px',
          padding: '6px',
          background: 'rgba(255,255,255,0.03)',
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: '8px',
        });

        const dragHandle = document.createElement('div');
        const isLocked = passId === 'outputPass';
        dragHandle.textContent = isLocked ? 'x' : '::';
        Object.assign(dragHandle.style, {
          opacity: isLocked ? '0.45' : '0.7',
          cursor: isLocked ? 'not-allowed' : 'grab',
          userSelect: 'none',
          fontWeight: '700',
          width: '18px',
          textAlign: 'center',
        });

        const nameEl = document.createElement('div');
        nameEl.textContent = `${index + 1}. ${layerLabels[passId] ?? passId}`;
        nameEl.style.fontSize = '13px';
        nameEl.style.fontWeight = '600';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = Boolean(effects[passId]?.enabled);
        toggle.addEventListener('change', () => {
          if (!effects[passId]) {
            return;
          }
          effects[passId].enabled = toggle.checked;
          if (passId === 'sobelShader') {
            syncSobelResolution();
          }
          rebuildComposer();
          renderStack();
        });

        header.appendChild(dragHandle);
        header.appendChild(nameEl);
        header.appendChild(toggle);
        row.appendChild(header);

        const settings = document.createElement('div');
        Object.assign(settings.style, {
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          display: toggle.checked || passId === 'outputPass' ? 'block' : 'none',
        });
        addSettingsForPass(passId, settings);
        if (settings.childElementCount > 0) {
          row.appendChild(settings);
        }

        row.draggable = false;
        if (!isLocked) {
          dragHandle.draggable = true;

          dragHandle.addEventListener('pointerdown', () => {
            row.draggable = true;
          });

          dragHandle.addEventListener('pointerup', () => {
            row.draggable = false;
          });

          dragHandle.addEventListener('pointercancel', () => {
            row.draggable = false;
          });

          row.addEventListener('dragstart', event => {
            if (event.target !== dragHandle) {
              event.preventDefault();
              row.draggable = false;
              return;
            }
            draggedLayerId = passId;
            row.style.opacity = '0.55';
            clearDropIndicators();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', passId);
          });

          row.addEventListener('dragend', () => {
            row.style.opacity = '1';
            draggedLayerId = null;
            clearDropIndicators();
            row.draggable = false;
          });
        }

        row.addEventListener('dragenter', event => {
          if (!draggedLayerId || draggedLayerId === passId) {
            return;
          }
          event.preventDefault();
          clearDropIndicators();
          row.style.outline = '2px solid rgba(123, 190, 255, 0.95)';
          row.style.background = 'rgba(123, 190, 255, 0.2)';
        });

        row.addEventListener('dragleave', event => {
          if (!event.currentTarget?.contains(event.relatedTarget)) {
            row.style.outline = 'none';
            row.style.background = 'rgba(255,255,255,0.03)';
          }
        });

        row.addEventListener('dragover', event => {
          if (!draggedLayerId) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        });

        row.addEventListener('drop', event => {
          if (!draggedLayerId) {
            return;
          }
          event.preventDefault();

          const currentOrder = effects.getPassOrder();
          const movable = currentOrder.filter(id => id !== 'outputPass');
          const from = movable.indexOf(draggedLayerId);
          if (from < 0) {
            return;
          }

          const targetLayerId = row.dataset.layerId;
          let to = movable.indexOf(targetLayerId);
          if (targetLayerId === 'outputPass') {
            to = movable.length - 1;
          }
          if (to < 0) {
            return;
          }

          const [moved] = movable.splice(from, 1);
          movable.splice(to, 0, moved);
          effects.setPassOrder([...movable, 'outputPass']);
          rebuildComposer();
          renderStack();
        });

        stackList.appendChild(row);
      });
    };

    const closeRow = document.createElement('div');
    Object.assign(closeRow.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: '6px',
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    Object.assign(closeButton.style, {
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.1)',
      color: '#fff',
      padding: '6px 10px',
      cursor: 'pointer',
    });

    const refresh = () => {
      renderStack();
    };

    const close = () => {
      clearDropIndicators();
      overlay.style.display = 'none';
    };

    const positionDock = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      const gutter = 12;
      const viewportMargin = 8;

      let panelWidth = Math.min(380, Math.max(280, Math.floor(window.innerWidth * 0.32)));
      const maxAllowed = Math.max(240, window.innerWidth - viewportMargin * 2);
      panelWidth = Math.min(panelWidth, maxAllowed);
      panel.style.width = `${panelWidth}px`;

      const rightSpace = window.innerWidth - rect.right - gutter;
      const leftSpace = rect.left - gutter;

      let left = rect.right + gutter;

      if (rightSpace < panelWidth && leftSpace >= panelWidth) {
        left = rect.left - panelWidth - gutter;
      } else if (rightSpace < panelWidth && leftSpace < panelWidth) {
        panelWidth = Math.max(240, Math.min(window.innerWidth - viewportMargin * 2, panelWidth));
        panel.style.width = `${panelWidth}px`;
        left = Math.max(
          viewportMargin,
          Math.min(rect.right + gutter, window.innerWidth - panelWidth - viewportMargin),
        );
      }

      const top = Math.max(
        viewportMargin,
        Math.min(rect.top, window.innerHeight - 120),
      );
      const maxHeight = Math.max(
        220,
        Math.min(rect.height, window.innerHeight - top - viewportMargin),
      );

      overlay.style.left = `${Math.round(left)}px`;
      overlay.style.top = `${Math.round(top)}px`;
      panel.style.maxHeight = `${Math.floor(maxHeight)}px`;
    };

    const handleViewportLayoutChange = () => {
      if (overlay.style.display !== 'none') {
        positionDock();
      }
    };

    const open = () => {
      refresh();
      positionDock();
      overlay.style.display = 'block';
    };

    closeButton.addEventListener('click', close);

    window.addEventListener('resize', handleViewportLayoutChange);
    window.addEventListener('scroll', handleViewportLayoutChange, true);

    closeRow.appendChild(closeButton);
    panel.appendChild(title);
    panel.appendChild(hint);
    stackSection.appendChild(stackTitle);
    stackSection.appendChild(stackList);
    panel.appendChild(stackSection);
    panel.appendChild(closeRow);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    return {
      element: overlay,
      open,
      close,
      refresh,
    };
  };

  const createSceneCameraDock = () => {
    const overlay = document.createElement('div');
    overlay.className = 'mage-scene-camera-dock';
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '40',
      display: 'none',
      pointerEvents: 'none',
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: '320px',
      maxHeight: '84vh',
      overflow: 'auto',
      padding: '12px',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(13, 17, 26, 0.95)',
      color: '#fff',
      display: 'grid',
      gap: '10px',
      pointerEvents: 'auto',
      boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    });

    const title = document.createElement('div');
    title.textContent = 'Scene + Camera';
    Object.assign(title.style, {
      fontSize: '16px',
      fontWeight: '700',
    });

    const hint = document.createElement('div');
    hint.textContent = 'Visualizer state and camera controls.';
    Object.assign(hint.style, {
      fontSize: '12px',
      opacity: '0.8',
    });

    const makeSection = label => {
      const section = document.createElement('div');
      Object.assign(section.style, {
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '10px',
        padding: '8px',
      });

      const sectionTitle = document.createElement('div');
      sectionTitle.textContent = label;
      Object.assign(sectionTitle.style, {
        fontSize: '13px',
        fontWeight: '600',
        marginBottom: '8px',
      });
      section.appendChild(sectionTitle);

      const content = document.createElement('div');
      content.style.display = 'grid';
      section.appendChild(content);
      return { section, content };
    };

    const makeRow = (parent, labelText) => {
      const row = document.createElement('label');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '6px',
        fontSize: '12px',
      });
      const label = document.createElement('span');
      label.textContent = labelText;
      row.appendChild(label);
      parent.appendChild(row);
      return row;
    };

    const sceneSection = makeSection('Scene Settings');
    const cameraSection = makeSection('Camera Settings');
    const syncers = [];

    const addRangeControl = (parent, { label, min, max, step = 0.001, getValue, setValue, onCommit }) => {
      const row = makeRow(parent, label);
      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: '8px',
        minWidth: '220px',
      });

      const input = document.createElement('input');
      input.type = 'range';
      input.min = `${min}`;
      input.max = `${max}`;
      input.step = `${step}`;

      const stepText = `${step}`;
      const decimalPlaces = stepText.includes('.') ? stepText.split('.')[1].length : 0;
      const formatValue = value => {
        if (!Number.isFinite(value)) {
          return `${min}`;
        }
        return decimalPlaces > 0 ? value.toFixed(Math.min(6, decimalPlaces)) : `${Math.round(value)}`;
      };

      const valueLabel = document.createElement('input');
      valueLabel.type = 'number';
      valueLabel.min = `${min}`;
      valueLabel.max = `${max}`;
      valueLabel.step = `${step}`;
      Object.assign(valueLabel.style, {
        width: '86px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        background: 'rgba(0,0,0,0.5)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '4px',
        padding: '2px 4px',
      });

      const clamp = value => Math.max(min, Math.min(max, value));

      const sync = () => {
        const value = Number(getValue());
        const normalized = Number.isFinite(value) ? clamp(value) : min;
        input.value = `${normalized}`;
        valueLabel.value = formatValue(normalized);
      };

      input.addEventListener('input', () => {
        const value = clamp(Number.parseFloat(input.value));
        setValue(value);
        valueLabel.value = formatValue(value);
        if (typeof onCommit === 'function') {
          onCommit();
        }
      });

      valueLabel.addEventListener('change', () => {
        const parsed = Number.parseFloat(valueLabel.value);
        if (!Number.isFinite(parsed)) {
          sync();
          return;
        }
        const value = clamp(parsed);
        setValue(value);
        input.value = `${value}`;
        valueLabel.value = formatValue(value);
        if (typeof onCommit === 'function') {
          onCommit();
        }
      });

      wrap.appendChild(input);
      wrap.appendChild(valueLabel);
      row.appendChild(wrap);
      syncers.push(sync);
      sync();
    };

    const addCheckboxControl = (parent, { label, getValue, setValue, onCommit }) => {
      const row = makeRow(parent, label);
      const input = document.createElement('input');
      input.type = 'checkbox';

      const sync = () => {
        input.checked = Boolean(getValue());
      };

      input.addEventListener('change', () => {
        setValue(input.checked);
        if (typeof onCommit === 'function') {
          onCommit();
        }
      });

      row.appendChild(input);
      syncers.push(sync);
      sync();
    };

    const addSelectControl = (parent, { label, options, getValue, setValue, onCommit }) => {
      const row = makeRow(parent, label);
      const select = document.createElement('select');
      Object.assign(select.style, {
        minWidth: '170px',
        background: 'rgba(0,0,0,0.5)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '6px',
        padding: '4px 6px',
      });

      options.forEach(option => {
        const el = document.createElement('option');
        el.value = `${option.value}`;
        el.textContent = option.label;
        select.appendChild(el);
      });

      const sync = () => {
        select.value = `${getValue()}`;
      };

      select.addEventListener('change', () => {
        setValue(Number.parseFloat(select.value));
        if (typeof onCommit === 'function') {
          onCommit();
        }
      });

      row.appendChild(select);
      syncers.push(sync);
      sync();
    };

    const embeddedSkyboxIds = Object.keys(EMBEDDED_SKYBOXES)
      .map(value => Number.parseInt(value, 10))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (
      embeddedSkyboxIds.length > 0
      && !embeddedSkyboxIds.includes(Number.parseInt(`${visualizer.skyboxPreset}`, 10))
    ) {
      visualizer.skyboxPreset = embeddedSkyboxIds[0];
    }

    addSelectControl(sceneSection.content, {
      label: 'Skybox',
      options: embeddedSkyboxIds.map(id => ({ label: `${id}`, value: id })),
      getValue: () => Number.parseInt(`${visualizer.skyboxPreset}`, 10) || embeddedSkyboxIds[0] || 0,
      setValue: value => {
        visualizer.skyboxPreset = value;
        engine._loadSkybox({
          type: 'preset',
          presetId: Number.parseInt(`${value}`, 10) || 0,
        });
      },
    });

    addRangeControl(sceneSection.content, {
      label: 'MOD 1',
      min: 0.01,
      max: 2.0,
      getValue: () => state.minimizing_factor,
      setValue: value => {
        state.minimizing_factor = value;
      },
    });

    addRangeControl(sceneSection.content, {
      label: 'MOD 2',
      min: 1.0,
      max: 10.0,
      step: 0.01,
      getValue: () => state.power_factor,
      setValue: value => {
        state.power_factor = value;
      },
    });

    addRangeControl(sceneSection.content, {
      label: 'MOD 3',
      min: 0.0,
      max: 1.0,
      getValue: () => state.pointerDownMultiplier,
      setValue: value => {
        state.pointerDownMultiplier = value;
      },
    });

    addRangeControl(sceneSection.content, {
      label: 'Base Speed',
      min: 0.01,
      max: 0.9,
      getValue: () => state.base_speed,
      setValue: value => {
        state.base_speed = value;
      },
    });

    addRangeControl(sceneSection.content, {
      label: 'Easing Speed',
      min: 0.01,
      max: 0.9,
      getValue: () => state.easing_speed,
      setValue: value => {
        state.easing_speed = value;
      },
    });

    addRangeControl(sceneSection.content, {
      label: 'Scale',
      min: 1,
      max: 200,
      step: 0.1,
      getValue: () => visualizer.scale,
      setValue: value => {
        visualizer.scale = value;
      },
    });

    addCheckboxControl(sceneSection.content, {
      label: 'Auto Rotate',
      getValue: () => controls.autoRotate,
      setValue: value => {
        controls.autoRotate = value;
      },
    });

    addRangeControl(sceneSection.content, {
      label: 'Rotation Speed',
      min: 0.1,
      max: 50,
      step: 0.01,
      getValue: () => controls.autoRotateSpeed,
      setValue: value => {
        controls.autoRotateSpeed = value;
      },
    });

    addRangeControl(cameraSection.content, {
      label: 'FOV',
      min: 1,
      max: 359,
      step: 1,
      getValue: () => camera.fov,
      setValue: value => {
        camera.fov = value;
        camera.updateProjectionMatrix();
      },
    });

    addRangeControl(cameraSection.content, {
      label: 'Camera Orientation',
      min: 0,
      max: 2 * Math.PI,
      step: 0.001,
      getValue: () => state.camTilt,
      setValue: value => {
        state.camTilt = value;
        camera.up.set(
          Math.sin(state.camTilt),
          Math.cos(state.camTilt),
          -Math.sin(state.camTilt),
        );
      },
    });

    const resetRow = document.createElement('div');
    Object.assign(resetRow.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: '6px',
    });
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset Camera';
    Object.assign(resetButton.style, {
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.1)',
      color: '#fff',
      padding: '6px 10px',
      cursor: 'pointer',
    });
    resetButton.addEventListener('click', () => {
      controls.reset();
    });
    resetRow.appendChild(resetButton);
    cameraSection.content.appendChild(resetRow);

    const closeRow = document.createElement('div');
    Object.assign(closeRow.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: '6px',
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    Object.assign(closeButton.style, {
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.1)',
      color: '#fff',
      padding: '6px 10px',
      cursor: 'pointer',
    });

    const refresh = () => {
      syncers.forEach(sync => sync());
    };

    const close = () => {
      overlay.style.display = 'none';
    };

    const positionDock = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      const gutter = 12;
      const viewportMargin = 8;

      let panelWidth = Math.min(360, Math.max(280, Math.floor(window.innerWidth * 0.28)));
      const maxAllowed = Math.max(240, window.innerWidth - viewportMargin * 2);
      panelWidth = Math.min(panelWidth, maxAllowed);
      panel.style.width = `${panelWidth}px`;

      const leftSpace = rect.left - gutter;
      const rightSpace = window.innerWidth - rect.right - gutter;
      const leftNudge = 30; // increase for more left shift

      let left = rect.left - panelWidth - gutter - leftNudge;
      if (leftSpace < panelWidth && rightSpace >= panelWidth) {
        left = rect.right + gutter;
      } else if (leftSpace < panelWidth && rightSpace < panelWidth) {
        left = viewportMargin;
      }

      const top = Math.max(viewportMargin, Math.min(rect.top, window.innerHeight - 120));
      const maxHeight = Math.max(220, Math.min(rect.height, window.innerHeight - top - viewportMargin));

      overlay.style.left = `${Math.round(left)}px`;
      overlay.style.top = `${Math.round(top)}px`;
      panel.style.maxHeight = `${Math.floor(maxHeight)}px`;
    };

    const handleViewportLayoutChange = () => {
      if (overlay.style.display !== 'none') {
        positionDock();
      }
    };

    const open = () => {
      refresh();
      positionDock();
      overlay.style.display = 'block';
    };

    closeButton.addEventListener('click', close);
    window.addEventListener('resize', handleViewportLayoutChange);
    window.addEventListener('scroll', handleViewportLayoutChange, true);

    closeRow.appendChild(closeButton);
    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(sceneSection.section);
    panel.appendChild(cameraSection.section);
    panel.appendChild(closeRow);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    return {
      element: overlay,
      open,
      close,
      refresh,
    };
  };

  const initTweakpane = () => {

    // const previousPresetLoaded = engine.onPresetLoaded;
    // engine.onPresetLoaded = preset => {
    //   if (typeof previousPresetLoaded === 'function') {
    //     previousPresetLoaded(preset);
    //   }
    //   setQuickPresetsVisible(!preset);
    // };

    // engine.setEmbeddedPresetButtonsVisible = visible => {
    //   setQuickPresetsVisible(Boolean(visible));
    // };

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

    fxStudioOverlay = createFxStudioOverlay();
    sceneCameraDock = createSceneCameraDock();
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
        if (typeof engine._syncSobelResolution === 'function') {
          engine._syncSobelResolution();
        }

        rebuildComposer();
        sceneCameraDock?.refresh();
        fxStudioOverlay?.refresh();
      } 
    };

    engine.refreshSettingsUI = () => {
      if (!pane) {
        return;
      }
      pane.refresh();
      fxStudioOverlay?.refresh();
      sceneCameraDock?.refresh();
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
            // const tooltipImage = tooltipUI.element.querySelector('img');
        // if (tooltipImage) {
        //   tooltipImage.hidden = false;
        // }
        // visualizer.render_tooltips = true;
        // tooltipUI.visible = true;
    if (pane) {
      pane.hidden = !pane.hidden;
      if (pane.hidden && fxStudioOverlay) {
        fxStudioOverlay.close();
      } else {
        fxStudioOverlay.open();
      }
      if (pane.hidden && sceneCameraDock) {
        sceneCameraDock.close();
      } else {
        sceneCameraDock.open();
      }
    }
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
    const quickPresetHost = document.createElement('div');
    const visiblePresetIds = EMBEDDED_PRESET_IDS.filter(presetId => presetId !== 0);
    let quickPresetButtons = [];
    const quickPresetPreviewImages = new Map();
    let selectedPresetId = null;
    const engineLoadingMask = document.createElement('div');
    const engineLoadingLabel = document.createElement('div');

    const setQuickPresetsVisible = visible => {
      quickPresetHost.style.display = visible ? 'flex' : 'none';
      if (visible) {
        positionPresetDock();
      }
    };

    quickPresetHost.className = 'mage-embedded-presets';
    Object.assign(quickPresetHost.style, {
      position: 'fixed',
      zIndex: '41',
      display: 'none',
      flexDirection: 'column',
      gap: '10px',
      padding: '10px',
      maxHeight: '72vh',
      overflowY: 'auto',
      overflowX: 'hidden',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'linear-gradient(150deg, rgba(18,26,38,0.78), rgba(11,16,25,0.82))',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      alignItems: 'flex-start',
    });
    document.body.appendChild(quickPresetHost);

    const positionPresetDock = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      const gutter = 12;
      const viewportMargin = 8;
      const panelWidth = 214;
      const leftSpace = rect.left - gutter;
      const rightSpace = window.innerWidth - rect.right - gutter;
      const leftNudge = 30;

      let left = rect.left - panelWidth - gutter - leftNudge;
      if (leftSpace < panelWidth && rightSpace >= panelWidth) {
        left = rect.right + gutter;
      } else if (leftSpace < panelWidth && rightSpace < panelWidth) {
        left = viewportMargin;
      }

      const top = Math.max(viewportMargin, Math.min(rect.top, window.innerHeight - 120));
      const maxHeight = Math.max(220, Math.min(rect.height, window.innerHeight - top - viewportMargin));

      quickPresetHost.style.left = `${Math.round(left)}px`;
      quickPresetHost.style.top = `${Math.round(top)}px`;
      quickPresetHost.style.maxHeight = `${Math.floor(maxHeight)}px`;
    };

    const handlePresetDockLayoutChange = () => {
      if (quickPresetHost.style.display !== 'none') {
        positionPresetDock();
      }
    };
    window.addEventListener('resize', handlePresetDockLayoutChange);
    window.addEventListener('scroll', handlePresetDockLayoutChange, true);

    engineLoadingMask.className = 'mage-engine-loading-mask';
    Object.assign(engineLoadingMask.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '35',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(6,10,16,0.9)',
      pointerEvents: 'auto',
      backdropFilter: 'blur(3px)',
    });

    engineLoadingLabel.textContent = 'Loading engine...';
    Object.assign(engineLoadingLabel.style, {
      color: '#fff',
      fontSize: '14px',
      fontWeight: '700',
      letterSpacing: '0.02em',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,0.22)',
      background: 'rgba(14,22,34,0.86)',
      padding: '10px 14px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
    });
    engineLoadingMask.appendChild(engineLoadingLabel);
    host.appendChild(engineLoadingMask);

    const setEngineLoadingMaskActive = (active, message = 'Loading engine...') => {
      const visible = Boolean(active);
      engineLoadingMask.style.display = visible ? 'flex' : 'none';
      engineLoadingLabel.textContent = message;
      if (renderer?.domElement) {
        renderer.domElement.style.visibility = visible ? 'hidden' : 'visible';
      }
      if (visible && typeof engine._showViewportMessage === 'function') {
        engine._showViewportMessage(message, 60_000);
      } else if (!visible && typeof engine._hideViewportMessage === 'function') {
        engine._hideViewportMessage();
      }
    };

    const setQuickPresetButtonsDisabled = disabled => {
      for (const button of quickPresetButtons) {
        button.disabled = disabled;
        button.style.opacity = disabled ? '0.6' : '1';
        button.style.cursor = disabled ? 'progress' : 'pointer';
      }
    };

    quickPresetButtons = visiblePresetIds.map(presetId => {
      const button = document.createElement('button');
      button.type = 'button';
      Object.assign(button.style, {
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: '10px',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
        color: '#fff',
        fontSize: '11px',
        fontWeight: '600',
        letterSpacing: '0.02em',
        lineHeight: '1',
        padding: '6px',
        cursor: 'pointer',
        display: 'grid',
        gap: '6px',
        width: '194px',
        textAlign: 'left',
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        transition: 'transform 120ms ease, filter 120ms ease, opacity 120ms ease',
      });

      const preview = document.createElement('img');
      preview.alt = `Preset ${presetId} preview`;
      preview.width = 184;
      preview.height = 184;
      preview.loading = 'lazy';
      // const thumbnailSrc = getEmbeddedPresetThumbnailById(presetId);
      // if (thumbnailSrc) {
      //   preview.src = thumbnailSrc;
      // }
      Object.assign(preview.style, {
        width: '100%',
        height: '184px',
        objectFit: 'contain',
        aspectRatio: '1 / 1',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.2)',
        background:
          'radial-gradient(circle at 20% 20%, rgba(66,191,255,0.35), rgba(49,129,255,0.2) 35%, rgba(15,20,30,0.9) 70%)',
        opacity: '0.92',
      });

      const caption = document.createElement('div');
      caption.textContent = `Preset ${presetId}`;
      Object.assign(caption.style, {
        fontSize: '11px',
        fontWeight: '700',
        padding: '0 2px 2px',
      });

      button.appendChild(preview);
      button.appendChild(caption);
      quickPresetPreviewImages.set(presetId, preview);

      button.addEventListener('mouseenter', () => {
        button.style.transform = 'translateY(-1px)';
        button.style.filter = 'brightness(1.06)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'translateY(0)';
        button.style.filter = 'brightness(1)';
      });

      button.addEventListener('click', async () => {
        setQuickPresetButtonsDisabled(true);
        const ok = await loadPresetById(presetId);
        setQuickPresetButtonsDisabled(false);
        if (ok) {
          selectedPresetId = presetId;
          setQuickPresetsVisible(false);
        }
      });

      quickPresetHost.appendChild(button);

      return button;
    });

    // Controls own quick-preset visibility state instead of reading engine.currentPreset.
    setQuickPresetsVisible(!selectedPresetId);

    const replaceWithRuntimePresetPreviews = async () => {
      if (typeof engine.captureThumbnail !== 'function') {
        return;
      }

      setEngineLoadingMaskActive(true, 'Loading engine...');
      setQuickPresetButtonsDisabled(true);

      try {
        const total = visiblePresetIds.length;
        for (let index = 0; index < total; index += 1) {
          const presetId = visiblePresetIds[index];
          const preset = getEmbeddedPresetById(presetId);
          const imageEl = quickPresetPreviewImages.get(presetId);
          if (!preset || !imageEl) {
            continue;
          }

          setEngineLoadingMaskActive(true, `Loading engine... (${index + 1}/${total})`);
          const settleFrames = index < 3 ? 4 : 2;
          const dataUrl = await engine.captureThumbnail(preset, {
            settleFrames,
            width: 184,
            height: 184,
          });

          if (dataUrl) {
            imageEl.src = dataUrl;
          }
        }
      } finally {
        setEngineLoadingMaskActive(false);
        setQuickPresetButtonsDisabled(false);
      }
    };

    setTimeout(() => {
      replaceWithRuntimePresetPreviews().catch(() => {
        setEngineLoadingMaskActive(false);
        setQuickPresetButtonsDisabled(false);
      });
    }, 120);

    const bindClick = (id, handler) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', handler);
      }
    };

    const isPointerInViewport = event => {
      const rect = renderer.domElement.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    };

    const clearViewportInteractionState = () => {
      // inputs.currMouse.x = 2;
      // inputs.currMouse.y = 2;
      visualizer.intersected = false;
      visualizer.clickable = false;
      visualizer.controllingAudio = false;
      tooltipUI.visible = false;
    };

    const isPaneOpen = () => Boolean(pane && !pane.hidden);

    const isPointerOverUi = event => {
      const target = event?.target;
      if (!(target instanceof Element)) {
        return false;
      }

      return Boolean(
        target.closest('.tp-dfwv')
        || target.closest('.mage-pane-host')
        || target.closest('.mage-embedded-presets')
        || target.closest('.mage-fx-layers-overlay')
        || target.closest('.mage-fx-studio-overlay')
        || target.closest('.mage-fx-studio-dock')
        || target.closest('.mage-scene-camera-dock')
        || target.closest('.mage-dock-launcher')
      );
    };

    const shouldBlockViewportInput = event => isPointerOverUi(event);

    window.addEventListener('wheel', function(event) {
        if (shouldBlockViewportInput(event)) {
            clearViewportInteractionState();
            return;
        }

        if (!isPointerInViewport(event)) {
            clearViewportInteractionState();
            return;
        }

        if (event.deltaY < 0) {
            // If the visualizer is clickable and the pointer is currently intersecting it, go to the next shader
            if (visualizer.clickable && visualizer.intersected) {
              visualizer.nextShader();
            }
        } else if (event.deltaY > 0) {
            // If the visualizer is clickable and the pointer is currently intersecting it, go to the previous shader
            if (visualizer.clickable && visualizer.intersected) {
              visualizer.previousShader();
            }
        }
        // You can also check event.deltaX for horizontal scrolling

        // If you do not want any actual scrolling to occur, you can prevent the default behavior
        // event.preventDefault(); 
    }, { passive: false }); // Use passive: false to allow preventDefault()

    window.addEventListener('resize', () => {
      if (typeof engine._syncViewport === 'function') {
        engine._syncViewport(true);
      }
      if (typeof engine._syncSobelResolution === 'function') {
        engine._syncSobelResolution();
      }
      rebuildComposer();
    });

    window.addEventListener('pointermove', event => {
      if (shouldBlockViewportInput(event)) {
        clearViewportInteractionState();
        // state.currMouse.x = 2;
        // state.currMouse.y = 2;
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width;
      const relY = (event.clientY - rect.top) / rect.height;

      const inside = relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1;

      if (!inside) {
        clearViewportInteractionState();
        // state.currMouse.x = 2;
        // state.currMouse.y = 2;
        return;
      }

      // Raycast input (NDC)
      inputs.currMouse.x = relX * 2 - 1;
      inputs.currMouse.y = -relY * 2 + 1;

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
      if (shouldBlockViewportInput(event)) {
        clearViewportInteractionState();
        state.currPointerDown = 0.0;
        return;
      }

      if (!isPointerInViewport(event)) {
        clearViewportInteractionState();
        return;
      }

      state.currPointerDown = 1.0;

      if (!visualizer.clickable || !visualizer.intersected) {
        return;
      }

      // stop threejs movement controls while interacting with visualizer
      //controls.enabled = false;
      
      // if (event.button === 1) {
      //   visualizer.controllingAudio = true;
      // }
    });

    window.addEventListener('pointerup', event => {
      // Always allow right-click toggle on the viewport, even when pane is open.
      if (event.button === 2) {
        if (isPointerInViewport(event) && !isPointerOverUi(event)) {
          setQuickPresetsVisible(false);
          toggleUI();
        }
        clearViewportInteractionState();
        state.currPointerDown = 0.0;
        return;
      }

      if (shouldBlockViewportInput(event)) {
        clearViewportInteractionState();
        state.currPointerDown = 0.0;
        return;
      }

      if (!isPointerInViewport(event)) {
        clearViewportInteractionState();
        return;
      }

      // stop controlling audio on pointer release
      visualizer.controllingAudio = false;

      // re-enable threejs movement controls when not interacting with visualizer
      controls.enabled = true;

      // if (audio && audio.setPlaybackRate) {
      //   audio.setPlaybackRate(1);
      // }
      // if (reversedAudio && reversedAudio.pause) {
      //   reversedAudio.pause();
      // }

      // Reset pointer down state with a slight delay to allow for any interactions that check this state on pointer up.
      state.currPointerDown = 0.0 + 1 * state.pointerDownMultiplier;

      // Only toggle play/pause on middle click release while pointer is intersecting visualizer and it's clickable.
      // This prevents conflicts with right click (context menu) interactions and ensures that play/pause is only 
      // toggled when the user is actively interacting with the visualizer.
      if (!visualizer.intersected || !visualizer.clickable) {
        return;
      }

      // if (event.button === 0) {
      //   if (!audio || !audio.isPlaying) {
      //     engine.play();
      //   } else {
      //     engine.pause();
      //   }
      // }

      // Regenerate visualizer on left click release while intersecting visualizer and it's clickable
      if (event.button === 0) {
        engine.visualizer.load({ shader: null, addToHistory: true, clearHistory: false });
        setQuickPresetsVisible(false);
      }

      // Open shaders context menu on middle click release while intersecting visualizer and it's clickable 
      if (event.button === 1) {
        // if (reversedAudio && reversedAudio.pause) {
        //   reversedAudio.pause();
        // }
        // engine.play();

        // open a selection window showing active shaders
        // openShaderSelectionWindow(engine.visualizer);
      }

    });

    renderer.domElement.addEventListener('pointerleave', () => {
      clearViewportInteractionState();
    });
  };

  // const openShaderSelectionWindow = visualizer => {
  //   if (!visualizer || !Array.isArray(visualizer.shaders) || visualizer.shaders.length === 0) {
  //     window.alert('No saved shaders available yet. Load a shader preset first.');
  //     return;
  //   }

  //   const existingOverlay = document.getElementById('mage-shader-picker-overlay');
  //   if (existingOverlay) {
  //     existingOverlay.remove();
  //   }

  //   const overlay = document.createElement('div');
  //   overlay.id = 'mage-shader-picker-overlay';
  //   Object.assign(overlay.style, {
  //     position: 'fixed',
  //     inset: '0',
  //     zIndex: '10000',
  //     background: 'rgba(0, 0, 0, 0.55)',
  //     display: 'flex',
  //     alignItems: 'center',
  //     justifyContent: 'center',
  //     padding: '12px',
  //   });

  //   const dialog = document.createElement('div');
  //   Object.assign(dialog.style, {
  //     width: 'min(640px, 96vw)',
  //     maxHeight: '80vh',
  //     overflow: 'auto',
  //     borderRadius: '10px',
  //     border: '1px solid rgba(255, 255, 255, 0.2)',
  //     background: 'rgba(20, 24, 30, 0.95)',
  //     color: '#fff',
  //     padding: '14px',
  //     fontFamily: 'sans-serif',
  //   });

  //   const title = document.createElement('div');
  //   title.textContent = 'Select Shader by ID';
  //   Object.assign(title.style, {
  //     fontSize: '16px',
  //     fontWeight: '600',
  //     marginBottom: '10px',
  //   });

  //   const selector = document.createElement('select');
  //   selector.size = Math.min(12, visualizer.shaders.length);
  //   Object.assign(selector.style, {
  //     width: '100%',
  //     minHeight: '180px',
  //     background: 'rgba(0, 0, 0, 0.35)',
  //     color: '#fff',
  //     border: '1px solid rgba(255, 255, 255, 0.25)',
  //     borderRadius: '8px',
  //     padding: '6px',
  //   });

  //   visualizer.shaders.forEach((shaderItem, index) => {
  //     const option = document.createElement('option');
  //     option.value = `${shaderItem.id}`;
  //     const isActive = index === visualizer.shaderIndex;
  //     option.textContent = `${isActive ? '* ' : ''}${shaderItem.id}`;
  //     option.selected = isActive;
  //     selector.appendChild(option);
  //   });

  //   const actions = document.createElement('div');
  //   Object.assign(actions.style, {
  //     display: 'flex',
  //     justifyContent: 'flex-end',
  //     gap: '8px',
  //     marginTop: '12px',
  //   });

  //   const cancelButton = document.createElement('button');
  //   cancelButton.type = 'button';
  //   cancelButton.textContent = 'Cancel';
  //   Object.assign(cancelButton.style, {
  //     border: '1px solid rgba(255, 255, 255, 0.2)',
  //     borderRadius: '6px',
  //     background: 'transparent',
  //     color: '#fff',
  //     padding: '8px 10px',
  //     cursor: 'pointer',
  //   });

  //   const applyButton = document.createElement('button');
  //   applyButton.type = 'button';
  //   applyButton.textContent = 'Apply';
  //   Object.assign(applyButton.style, {
  //     border: '1px solid rgba(255, 255, 255, 0.2)',
  //     borderRadius: '6px',
  //     background: '#2f6aff',
  //     color: '#fff',
  //     padding: '8px 10px',
  //     cursor: 'pointer',
  //   });

  //   const closeDialog = () => {
  //     overlay.remove();
  //   };

  //   const applySelectedShader = () => {
  //     const selectedShaderId = selector.value;
  //     const selectedIndex = visualizer.shaders.findIndex(
  //       shaderItem => `${shaderItem.id}` === `${selectedShaderId}`,
  //     );

  //     if (selectedIndex < 0) {
  //       return;
  //     }

  //     const selectedShader = visualizer.shaders[selectedIndex];
  //     visualizer.shaderIndex = selectedIndex;
  //     visualizer.load(selectedShader.shader, false);
  //     closeDialog();
  //   };

  //   cancelButton.addEventListener('click', closeDialog);
  //   applyButton.addEventListener('click', applySelectedShader);
  //   selector.addEventListener('dblclick', applySelectedShader);
  //   overlay.addEventListener('click', event => {
  //     if (event.target === overlay) {
  //       closeDialog();
  //     }
  //   });
  //   document.addEventListener(
  //     'keydown',
  //     event => {
  //       if (event.key === 'Escape' && document.body.contains(overlay)) {
  //         closeDialog();
  //       }
  //     },
  //     { once: true },
  //   );

  //   actions.appendChild(cancelButton);
  //   actions.appendChild(applyButton);
  //   dialog.appendChild(title);
  //   dialog.appendChild(selector);
  //   dialog.appendChild(actions);
  //   overlay.appendChild(dialog);
  //   document.body.appendChild(overlay);
  //   selector.focus();
  // };

  initTweakpane();
  eventSetup();
  if (getOS() !== ('Windows' || 'Mac OS' || 'Linux')) {
    switchControls();
  }
  
  return pane;
}