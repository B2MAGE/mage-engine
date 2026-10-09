import { getEmbeddedPresetById, getEmbeddedPresetIds } from './MAGEPreset.js';

export class MAGEPresetDock {
  constructor(
    engine,
    scene,
    renderer,
    camera,
    controls,
    canvas, 
    controlSettings,
  ) {
    this.engine = engine;
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.controls = controls;
    this.controlSettings = controlSettings;
    this.host = canvas.parentElement || this.renderer.domElement.parentElement || document.body;
    if (getComputedStyle(this.host).position === 'static') {
      this.host.style.position = 'relative';
    }

    this.useIntegratedControls = Boolean(controlSettings.integrated);
    
    this.EMBEDDED_PRESET_IDS = getEmbeddedPresetIds();
    this.quickPresetHost = document.createElement('div');
    this.visiblePresetIds = this.EMBEDDED_PRESET_IDS.filter(presetId => presetId !== 0);
    this.quickPresetButtons = [];
    this.quickPresetPreviewImages = new Map();
    this.imageSources = {};
    this.selectedPresetId = null;
    this.engineLoadingMask = document.createElement('div');
    this.engineLoadingLabel = document.createElement('div');
    this.previewSize = this.useIntegratedControls ? 128 : 256;
  }

  loadPresetById = async presetId => {
      const { engine } = this;
        const embeddedPreset = getEmbeddedPresetById(presetId);
        if (embeddedPreset) {
          const appliedEmbedded = engine.loadPreset(embeddedPreset);
          return Boolean(appliedEmbedded);
        }

        return false;
  };

  setQuickPresetsVisible = visible => {
        const { quickPresetHost } = this;
        quickPresetHost.style.display = visible ? 'flex' : 'none';
        if (visible) {
          this.positionPresetDock();
        }
  };

  setupUI = () => {
      const { host,  quickPresetHost, engineLoadingMask, engineLoadingLabel, useIntegratedControls } = this;
      quickPresetHost.className = 'mage-embedded-presets';
      Object.assign(quickPresetHost.style, {
        position: 'fixed',
        zIndex: '41',
        display: 'none',
        flexDirection: 'column',
        gap: useIntegratedControls ? '8px' : '10px',
        padding: useIntegratedControls ? '8px' : '10px',
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
  }

  setEngineLoadingMaskActive = (active, message = 'Loading engine...') => {
        const { engineLoadingMask, engineLoadingLabel, renderer, engine } = this;
        const visible = Boolean(active);
        engineLoadingMask.style.display = visible ? 'flex' : 'none';
        engineLoadingLabel.textContent = message;
        if (renderer?.domElement) {
          renderer.domElement.style.visibility = visible ? 'hidden' : 'visible';
        }
        if (visible && typeof engine.showViewportMessage === 'function') {
          engine.showViewportMessage(message, 1000);
        }
  };

  setQuickPresetButtonsDisabled = disabled => {
        const { quickPresetButtons } = this;
        for (const button of quickPresetButtons) {
          button.disabled = disabled;
          button.style.opacity = disabled ? '0.6' : '1';
          button.style.cursor = disabled ? 'progress' : 'pointer';
        }
  };

  createPresetButtons = () => {
      const { visiblePresetIds, quickPresetHost, loadPresetById, previewSize, useIntegratedControls } = this;
      this.quickPresetButtons = visiblePresetIds.map(presetId => {
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
          width: useIntegratedControls ? '160px' : '194px',
          textAlign: 'left',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
          transition: 'transform 120ms ease, filter 120ms ease, opacity 120ms ease',
        });

        const preview = document.createElement('img');
        preview.alt = `Preset ${presetId} preview`;
        preview.width = previewSize;
        preview.height = previewSize;
        preview.loading = 'lazy';
        // const thumbnailSrc = getEmbeddedPresetThumbnailById(presetId);
        // if (thumbnailSrc) {
        //   preview.src = thumbnailSrc;
        // }
        Object.assign(preview.style, {
          width: `${previewSize}px`,
          height: `${previewSize}px`,
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
        this.imageSources[presetId] = preview;

        button.addEventListener('mouseenter', () => {
          button.style.transform = 'translateY(-1px)';
          button.style.filter = 'brightness(1.06)';
        });
        button.addEventListener('mouseleave', () => {
          button.style.transform = 'translateY(0)';
          button.style.filter = 'brightness(1)';
        });

        button.addEventListener('click', async () => {
          this.setQuickPresetButtonsDisabled(true);
          const ok = await loadPresetById(presetId);
          this.setQuickPresetButtonsDisabled(false);
          if (ok) {
            this.selectedPresetId = presetId;
            this.setQuickPresetsVisible(false);
          }
        });

        quickPresetHost.appendChild(button);

        return button;
      });
  }

  replaceWithRuntimePresetPreviews = async () => {
      const { engine, visiblePresetIds, previewSize, setEngineLoadingMaskActive, setQuickPresetButtonsDisabled } = this;
        if (typeof engine.captureThumbnail !== 'function') {
          console.warn('Engine does not support thumbnail capture, skipping preset preview generation.');
          return;
        }
        console.log('Generating preset previews using engine capture...');
        setEngineLoadingMaskActive(true, 'Loading engine...');
        setQuickPresetButtonsDisabled(true);

        try {
          const total = visiblePresetIds.length;
          for (let index = 0; index < total; index += 1) {
              const presetId = visiblePresetIds[index];
              const preset = getEmbeddedPresetById(presetId);
            const imageEl = this.imageSources[presetId];
            if (!preset || !imageEl) {
              continue;
            }

            setEngineLoadingMaskActive(true, `Loading engine... (${index + 1}/${total})`);
            const settleFrames = index < 3 ? 4 : 2;
            const dataUrl = await engine.captureThumbnail(preset, {
              settleFrames,
              width: previewSize,
              height: previewSize,
            });

            if (dataUrl) {
              imageEl.src = dataUrl;
            }
          }
        } catch (error) {
          console.error('Error occurred while replacing preset previews:', error);
        } finally {
          setEngineLoadingMaskActive(false);
          setQuickPresetButtonsDisabled(false);
        }
  };

  setupThumbnails = () => {
      setTimeout(() => {
        this.replaceWithRuntimePresetPreviews().catch(() => {
          this.setEngineLoadingMaskActive(false);
          this.setQuickPresetButtonsDisabled(false);
        });
      }, 120);
  }

  positionPresetDock = () => {
        const { renderer, quickPresetHost, useIntegratedControls } = this;
        const rect = renderer.domElement.getBoundingClientRect();
        const gutter = 12;
        const viewportMargin = 8;
        const panelWidth = useIntegratedControls ? 182 : 214;

        if (useIntegratedControls) {
          const left = Math.max(viewportMargin, rect.right - panelWidth - viewportMargin);
          const top = Math.max(viewportMargin, rect.top + 62);
          const maxHeight = Math.max(180, Math.floor(rect.height - 70 - viewportMargin));

          quickPresetHost.style.left = `${Math.round(left)}px`;
          quickPresetHost.style.top = `${Math.round(top)}px`;
          quickPresetHost.style.maxHeight = `${Math.floor(maxHeight)}px`;
          return;
        }

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

  initialize = () => {
        this.setupUI();
        this.createPresetButtons();
        this.setupThumbnails();
        this.positionPresetDock();
        console.log('Preset dock initialized with embedded presets:', this.visiblePresetIds);
  }

  show = () => {
    this.setQuickPresetsVisible(true);
  }

}