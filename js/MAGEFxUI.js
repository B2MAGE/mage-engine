/**
 * MAGEControlsUI
 * Handles all UI rendering for the MAGE engine controls.
 * Separated from core engine logic to allow independent UI customization and testing.
 */

import {
  LinearToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
} from 'three';
import { getEmbeddedSkyboxIds } from './skyboxes.js';

/**
 * Initializes the complete UI for the MAGE engine controls.
 * @param {MAGEEngine} engine - The MAGE engine instance
 * @returns {Object} UI controller with open/close methods
 */
export function initControlsUI(engine) {
    const fields = engine.getEngineFields();
    const scene = fields.scene;
    const renderer = fields.renderer;
    const camera = fields.camera;
    const controls = fields.controls;
    const canvas = fields.canvas;
    const state = fields.state;
    const visualizer = fields.visualizer;
    const controlSettings = fields.controlSettings;

  const showUiInViewport = true; // Set to true to integrate controls into the viewport, false for separate dock

  if (!engine || !engine.isRunning()) {
    console.warn('Cannot initialize UI: Engine is not running.');
    return null;
  }

  const host = canvas.parentElement || document.body;

  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  let fxStudioOverlay = null;
  let sceneCameraDock = null;
  const controller = new AbortController();

  const rebuildComposer = () => {
    engine.refreshFx();
  };

  // Safe getBoundingClientRect wrapper to avoid errors in environments
  // where renderer.domElement may be missing (e.g. React SSR or detached canvases).
  const safeGetRendererRect = () => {
    try {
      const el = renderer && renderer.domElement;
      if (el && typeof el.getBoundingClientRect === 'function') {
        return el.getBoundingClientRect();
      }
    } catch (e) {
      // fall through to fallback
    }
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  };

  const getOS = () => {
    const userAgent = window.navigator.userAgent;
    const platform = window.navigator?.userAgentData?.platform || window.navigator.platform;
    const macosPlatforms = ['macOS', 'Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
    const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
    const iosPlatforms = ['iPhone', 'iPad', 'iPod'];
    let os = null;

    if (macosPlatforms.indexOf(platform) !== -1) {
      os = 'Mac OS';
    } else if (windowsPlatforms.indexOf(platform) !== -1) {
      os = 'Windows';
    } else if (iosPlatforms.indexOf(platform) !== -1) {
      os = 'iOS';
    } else if (/Android/.test(userAgent)) {
      os = 'Android';
    } else if (/Linux/.test(platform)) {
      os = 'Linux';
    }

    return os;
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
      if (!engine.fx.sobelShader?.shader?.uniforms?.resolution?.value) {
        return;
      }
      const bufferWidth = renderer.domElement.width || window.innerWidth * window.devicePixelRatio;
      const bufferHeight = renderer.domElement.height || window.innerHeight * window.devicePixelRatio;
      engine.fx.sobelShader.shader.uniforms.resolution.value.x = bufferWidth;
      engine.fx.sobelShader.shader.uniforms.resolution.value.y = bufferHeight;
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
    const syncers = [];

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
      syncers.push(sync);
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

      const sync = () => {
        input.value = getValue();
      };

      sync();
      syncers.push(sync);

      row.appendChild(labelEl);
      row.appendChild(input);
      parent.appendChild(row);
    };

    const addButtonToPass = (parent, { label, onClick }) => {
      const button = document.createElement('button');
      button.textContent = label;
      const clickFn = async () => {
        button.textContent = 'Processing...';
        await onClick();
        button.textContent = label;
      }
      button.addEventListener('click', async () => {
        await clickFn();
      });
      parent.appendChild(button);
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

      select.value = `${engine.fx.toneMapping.method}`;
      select.addEventListener('change', () => {
        engine.fx.toneMapping.method = Number.parseFloat(select.value);
        renderer.toneMapping = engine.fx.toneMapping.method;
        rebuildComposer();
      });

      const sync = () => {
        select.value = `${engine.fx.toneMapping.method}`;
      };

      sync();
      syncers.push(sync);

      row.appendChild(labelEl);
      row.appendChild(select);
      parent.appendChild(row);
    };

    const addSettingsForPass = (passId, parent) => {
      if (passId === 'bloom') {
        addRangeControl(parent, {
          label: 'Strength', min: 0, max: 10, step: 0.001,
          getValue: () => engine.fx.bloom.settings.strength,
          setValue: value => { engine.fx.bloom.settings.strength = value; },
        });
        addRangeControl(parent, {
          label: 'Radius', min: -10, max: 10, step: 0.001,
          getValue: () => engine.fx.bloom.settings.radius,
          setValue: value => { engine.fx.bloom.settings.radius = value; },
        });
        addRangeControl(parent, {
          label: 'Threshold', min: 0, max: 10, step: 0.001,
          getValue: () => engine.fx.bloom.settings.threshold,
          setValue: value => { engine.fx.bloom.settings.threshold = value; },
        });
      }

      if (passId === 'RGBShift') {
        addRangeControl(parent, {
          label: 'Amount', min: 0, max: 0.1, step: 0.0001,
          getValue: () => engine.fx.RGBShift.shader.uniforms.amount.value,
          setValue: value => { engine.fx.RGBShift.shader.uniforms.amount.value = value; },
        });
        addRangeControl(parent, {
          label: 'Angle', min: 0, max: Math.PI * 2, step: 0.001,
          getValue: () => engine.fx.RGBShift.shader.uniforms.angle.value,
          setValue: value => { engine.fx.RGBShift.shader.uniforms.angle.value = value; },
        });
      }

      if (passId === 'afterImagePass') {
        addRangeControl(parent, {
          label: 'Damp', min: 0, max: 1, step: 0.001,
          getValue: () => engine.fx.afterImagePass.shader.uniforms.damp.value,
          setValue: value => { engine.fx.afterImagePass.shader.uniforms.damp.value = value; },
        });
      }

      if (passId === 'colorifyShader') {
        addColorControl(parent, {
          label: 'Hue',
          getValue: () => `#${engine.fx.colorifyShader.color.getHexString()}`,
          setValue: value => { engine.fx.colorifyShader.color.set(value); },
        });
      }

      if (passId === 'kaleidoShader') {
        addRangeControl(parent, {
          label: 'Sides', min: 1, max: 24, step: 1,
          getValue: () => engine.fx.kaleidoShader.shader.uniforms.sides.value,
          setValue: value => { engine.fx.kaleidoShader.shader.uniforms.sides.value = Math.max(1, Math.round(value)); },
        });
        addRangeControl(parent, {
          label: 'Angle', min: 0, max: Math.PI * 2, step: 0.001,
          getValue: () => engine.fx.kaleidoShader.shader.uniforms.angle.value,
          setValue: value => { engine.fx.kaleidoShader.shader.uniforms.angle.value = value; },
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

      if (passId === 'glitchPass') {
        addRangeControl(parent, {
          label: 'Trigger Threshold', min: 0, max: 1, step: 0.001,
          getValue: () => engine.fx.getGlitchThreshold(),
          setValue: value => { engine.fx.setGlitchThreshold(value); },
        });
        addButtonToPass(parent, {
          label: 'Reset Glitch Trigger',
          onClick: async () => {
            if (engine.fx.glitchPass) {
              const thresh = await engine.fx.normalizeGlitchThreshold();
              refresh();
            }
          },
        });
      }
    };

    const renderStack = () => {
      syncers.length = 0;
      stackList.innerHTML = '';
      const orderedLayers = engine.fx.getPassOrder();

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
        toggle.checked = Boolean(engine.fx[passId]?.enabled);
        toggle.addEventListener('change', () => {
          if (!engine.fx[passId]) {
            return;
          }
          engine.fx[passId].enabled = toggle.checked;
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

          const currentOrder = engine.fx.getPassOrder();
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
          engine.fx.setPassOrder([...movable, 'outputPass']);
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
      gap: '8px',
      marginTop: '6px',
    });

    const randomizeEffectsButton = document.createElement('button');
    randomizeEffectsButton.type = 'button';
    randomizeEffectsButton.textContent = 'Randomize Effects';
    Object.assign(randomizeEffectsButton.style, {
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.1)',
      color: '#fff',
      padding: '6px 10px',
      cursor: 'pointer',
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
      renderStack();
    };

    const close = () => {
      clearDropIndicators();
      overlay.style.display = 'none';
    };

    const positionDock = () => {
      const rect = safeGetRendererRect();
      const gutter = 12;
      const viewportMargin = 8;

      if (showUiInViewport) {
        const panelWidth = Math.max(320, Math.min(320, Math.floor(rect.width * 0.28)));
        const maxHeight = Math.max(200, Math.floor(rect.height - viewportMargin * 2));
        const left = Math.max(viewportMargin, rect.right - panelWidth - viewportMargin);
        const top = Math.max(viewportMargin, rect.top + viewportMargin);

        panel.style.width = `${panelWidth}px`;
        panel.style.maxHeight = `${Math.floor(maxHeight)}px`;
        overlay.style.left = `${Math.round(left)}px`;
        overlay.style.top = `${Math.round(top)}px`;
        return;
      }

      let panelWidth = Math.min(320, Math.max(280, Math.floor(window.innerWidth * 0.32)));
      const maxAllowed = Math.max(320, window.innerWidth - viewportMargin * 2);
      panelWidth = Math.min(panelWidth, maxAllowed);
      panel.style.width = `${panelWidth}px`;

      const rightSpace = window.innerWidth - rect.right - gutter;
      const leftSpace = rect.left - gutter;

      let left = rect.right + gutter;

      if (rightSpace < panelWidth && leftSpace >= panelWidth) {
        left = rect.left - panelWidth - gutter;
      } else if (rightSpace < panelWidth && leftSpace < panelWidth) {
        panelWidth = Math.max(320, Math.min(window.innerWidth - viewportMargin * 2, panelWidth));
        panel.style.width = `${panelWidth}px`;
        left = Math.max(
          viewportMargin,
          Math.min(rect.right + gutter, window.innerWidth - panelWidth - viewportMargin),
        );
      }

      const top = Math.max(viewportMargin, Math.min(rect.top, window.innerHeight - 120));
      const maxHeight = Math.max(220, Math.min(rect.height, window.innerHeight - top - viewportMargin));

      overlay.style.left = `${Math.round(left)}px`;
      overlay.style.top = `${Math.round(top)}px`;
      panel.style.maxHeight = `${Math.floor(maxHeight)}px`;
    };

    const handleViewportLayoutChange = () => {
      if (overlay.style.display !== 'none') {
        // positionDock();
      }
    };

    const open = () => {
      refresh();
      positionDock();
      overlay.style.display = 'block';
    };

    closeButton.addEventListener('click', close);
    randomizeEffectsButton.addEventListener('click', () => {
      engine.randomizeEffects();
      refresh();
    });
    window.addEventListener('resize', handleViewportLayoutChange, { signal: controller.signal });
    window.addEventListener('scroll', handleViewportLayoutChange, { capture: true, signal: controller.signal });

    closeRow.appendChild(randomizeEffectsButton);
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
    // Scene and camera dock creation (keeping the same structure as before)
    // This is a large block - incorporating the full createSceneCameraDock logic here
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
        if (!Number.isFinite(value)) return `${min}`;
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
        if (typeof onCommit === 'function') onCommit();
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
        if (typeof onCommit === 'function') onCommit();
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
        if (typeof onCommit === 'function') onCommit();
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
        if (typeof onCommit === 'function') onCommit();
      });

      row.appendChild(select);
      syncers.push(sync);
      sync();
    };

    const embeddedSkyboxIds = getEmbeddedSkyboxIds();

    if (embeddedSkyboxIds.length > 0 && !embeddedSkyboxIds.includes(Number.parseInt(`${visualizer.skyboxPreset}`, 10))) {
      visualizer.skyboxPreset = embeddedSkyboxIds[0];
    }

    addSelectControl(sceneSection.content, {
      label: 'Skybox',
      options: embeddedSkyboxIds.map(id => ({ label: `${id}`, value: id })),
      getValue: () => Number.parseInt(`${visualizer.skyboxPreset}`, 10) || embeddedSkyboxIds[0] || 0,
      setValue: value => {
        visualizer.skyboxPreset = value;
        engine.loadSkybox({ type: 'preset', presetId: Number.parseInt(`${value}`, 10) || 0 });
      },
    });

    addRangeControl(sceneSection.content, { label: 'MOD 1', min: 0.01, max: 2.0, getValue: () => state.minimizing_factor, setValue: value => { state.minimizing_factor = value; } });
    addRangeControl(sceneSection.content, { label: 'MOD 2', min: 1.0, max: 10.0, step: 0.01, getValue: () => state.power_factor, setValue: value => { state.power_factor = value; } });
    addRangeControl(sceneSection.content, { label: 'MOD 3', min: 0.0, max: 1.0, getValue: () => state.pointerDownMultiplier, setValue: value => { state.pointerDownMultiplier = value; } });
    addRangeControl(sceneSection.content, { label: 'Base Speed', min: 0.01, max: 0.9, getValue: () => state.base_speed, setValue: value => { state.base_speed = value; } });
    addRangeControl(sceneSection.content, { label: 'Easing Speed', min: 0.01, max: 0.9, getValue: () => state.easing_speed, setValue: value => { state.easing_speed = value; } });
    addRangeControl(sceneSection.content, { label: 'Scale', min: 1, max: 200, step: 0.1, getValue: () => visualizer.scale, setValue: value => { visualizer.scale = value; } });
    addCheckboxControl(sceneSection.content, { label: 'Auto Rotate', getValue: () => controls.autoRotate, setValue: value => { controls.autoRotate = value; } });
    addRangeControl(sceneSection.content, { label: 'Rotation Speed', min: 0.1, max: 50, step: 0.01, getValue: () => controls.autoRotateSpeed, setValue: value => { controls.autoRotateSpeed = value; } });

    addRangeControl(cameraSection.content, { label: 'FOV', min: 1, max: 359, step: 1, getValue: () => camera.fov, setValue: value => { camera.fov = value; camera.updateProjectionMatrix(); } });
    addRangeControl(cameraSection.content, { label: 'Camera Orientation', min: 0, max: 2 * Math.PI, step: 0.001, getValue: () => state.camTilt, setValue: value => { state.camTilt = value; camera.up.set(Math.sin(value), Math.cos(value), -Math.sin(value)); } });

    const resetRow = document.createElement('div');
    Object.assign(resetRow.style, { display: 'flex', justifyContent: 'flex-end', marginTop: '6px' });
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset Camera';
    Object.assign(resetButton.style, { border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', cursor: 'pointer' });
    resetButton.addEventListener('click', () => { controls.reset(); });
    resetRow.appendChild(resetButton);
    cameraSection.content.appendChild(resetRow);

    const closeRow = document.createElement('div');
    Object.assign(closeRow.style, { display: 'flex', justifyContent: 'flex-end', marginTop: '6px' });
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    Object.assign(closeButton.style, { border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', cursor: 'pointer' });

    const refresh = () => { syncers.forEach(sync => sync()); };
    const close = () => { overlay.style.display = 'none'; };

    const positionDock = () => {
      const rect = safeGetRendererRect();
      const gutter = 12;
      const viewportMargin = 8;

      if (showUiInViewport) {
        panel.style.width = '320px';
        const left = Math.max(viewportMargin, rect.left + viewportMargin);
        const top = Math.max(viewportMargin, rect.top + viewportMargin);
        overlay.style.left = `${Math.round(left)}px`;
        overlay.style.top = `${Math.round(top)}px`;
        panel.style.maxHeight = `${Math.floor(rect.height - viewportMargin * 2)}px`;
        return;
      }

      let panelWidth = Math.min(320, Math.max(280, Math.floor(window.innerWidth * 0.28)));
      panelWidth = Math.min(panelWidth, Math.max(320, window.innerWidth - viewportMargin * 2));
      panel.style.width = `${panelWidth}px`;

      const leftSpace = rect.left - gutter;
      let left = rect.left - panelWidth - gutter;

      if (leftSpace < panelWidth) {
        left = Math.max(viewportMargin, Math.min(rect.right + gutter, window.innerWidth - panelWidth - viewportMargin));
      }

      const top = Math.max(viewportMargin, Math.min(rect.top, window.innerHeight - 120));
      overlay.style.left = `${Math.round(left)}px`;
      overlay.style.top = `${Math.round(top)}px`;
      panel.style.maxHeight = `${Math.floor(Math.max(220, Math.min(rect.height, window.innerHeight - top - viewportMargin)))}px`;
    };

    const handleViewportLayoutChange = () => {
      // if (overlay.style.display !== 'none') positionDock();
    };

    const open = () => {
      refresh();
      positionDock();
      overlay.style.display = 'block';
    };

    closeButton.addEventListener('click', close);
    window.addEventListener('resize', handleViewportLayoutChange, { signal: controller.signal });
    window.addEventListener('scroll', handleViewportLayoutChange, { capture: true, signal: controller.signal });

    closeRow.appendChild(closeButton);
    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(sceneSection.section);
    panel.appendChild(cameraSection.section);
    panel.appendChild(closeRow);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    return { element: overlay, open, close, refresh };
  };

  const initTweakpane = () => {
    fxStudioOverlay = createFxStudioOverlay();
    sceneCameraDock = createSceneCameraDock();
  };

  const toggleUI = () => {
    if (fxStudioOverlay) {
      fxStudioOverlay.open();
    }
    if (sceneCameraDock) {
      sceneCameraDock.open();
    }
  };

  const switchControls = () => {
    toggleUI();
    const hideUIbutton = document.getElementById('ui_hide');
    if (hideUIbutton) {
      hideUIbutton.style.display = 'none';
    }
  };

  let open = false;

  // Initialize UI
  initTweakpane();

  return {
    show: () => {
      switchControls();
      open = true;
    },
    hide: () => {
      controller.abort();
      fxStudioOverlay?.close();
      sceneCameraDock?.close();
      open = false;
    },
    "open": open,
    toggle: () => {
      if (open) {
        controller.abort();
        fxStudioOverlay?.close();
        sceneCameraDock?.close();
      } else {
        switchControls();
      }
      open = !open;
    }
    ,
    // Refresh UI controls to reflect current engine state (use after loadPreset)
    refresh: () => {
      try {
        fxStudioOverlay?.refresh();
      } catch (e) {
        // ignore
      }
      try {
        sceneCameraDock?.refresh();
      } catch (e) {
        // ignore
      }
      try {
        rebuildComposer();
      } catch (e) {
        // ignore
      }
    },
    // Handler called by engine when a preset is loaded
    onPresetLoaded: preset => {
      // ensure UI elements reflect new preset values
      try {
        fxStudioOverlay?.refresh();
      } catch (e) {}
      try {
        sceneCameraDock?.refresh();
      } catch (e) {}
      try { rebuildComposer(); } catch (e) {}
    }
  };
}
