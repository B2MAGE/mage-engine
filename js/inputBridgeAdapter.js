/**
 * Input bridge adapter helpers for MAGEEngine external input sources.
 *
 * This module mirrors the engine's built-in viewport bridge so host apps can reuse the same
 * interaction behavior when they provide their own input layer.
 */

/**
 * @typedef {Object} EngineInputPatch
 * @property {number} [clientX]
 * @property {number} [clientY]
 * @property {boolean} [pointerOverUi]
 * @property {number} [currPointerDown]
 * @property {boolean} [requestToggleUI]
 * @property {boolean} [requestResetVisualizer]
 * @property {boolean} [requestNextShader]
 * @property {boolean} [requestPreviousShader]
 * @property {number} [requestWheelDirection]
 */

/**
 * @typedef {Object} ViewportInputSource
 * @property {() => EngineInputPatch} getState
 * @property {(handler: (patch: EngineInputPatch) => void) => void | (() => void)} subscribe
 * @property {(event: PointerEvent | WheelEvent | FocusEvent) => boolean} [onToggleUI]
 * @property {(event: PointerEvent | WheelEvent | FocusEvent) => boolean} [onHideQuickPresets]
 * @property {(payload: { visible: boolean, x: number, y: number }) => void} [onUpdateTooltip]
 * @property {() => void} [detach]
 */

function cloneState(state) {
  return {
    clientX: Number(state.clientX),
    clientY: Number(state.clientY),
    pointerOverUi: Boolean(state.pointerOverUi),
    currPointerDown: Number(state.currPointerDown),
    requestToggleUI: Boolean(state.requestToggleUI),
    requestResetVisualizer: Boolean(state.requestResetVisualizer),
    requestNextShader: Boolean(state.requestNextShader),
    requestPreviousShader: Boolean(state.requestPreviousShader),
    requestWheelDirection: Number(state.requestWheelDirection) || 0,
  };
}

function getEventPath(event) {
  if (typeof event?.composedPath === 'function') {
    return event.composedPath();
  }

  return [];
}

function isUiEvent(event, { rendererDomElement = null, pointerOverUiChecker = null, uiSelectors = [] } = {}) {
  if (typeof pointerOverUiChecker === 'function') {
    try {
      return Boolean(pointerOverUiChecker(event));
    } catch {
      return false;
    }
  }

  const target = event?.target;
  const path = getEventPath(event);

  if (rendererDomElement && path.length > 0 && !path.includes(rendererDomElement)) {
    return true;
  }

  if (!(target instanceof Element)) {
    return false;
  }

  for (const selector of uiSelectors) {
    if (typeof selector === 'string' && selector && target.closest(selector)) {
      return true;
    }
  }

  return false;
}

function createWindowDrivenSource(options = {}) {
  const {
    engine = null,
    rendererDomElement = null,
    pointerOverUiChecker = null,
    uiSelectors = [],
    onToggleUI = null,
    onHideQuickPresets = null,
    onUpdateTooltip = null,
  } = options;

  const inferredRendererDomElement =
    rendererDomElement ||
    engine?.getEngineFields?.()?.renderer?.domElement ||
    engine?.getEngineFields?.()?.canvas ||
    null;

  const state = {
    clientX: Number.NaN,
    clientY: Number.NaN,
    pointerOverUi: false,
    currPointerDown: 0,
    requestToggleUI: false,
    requestResetVisualizer: false,
    requestNextShader: false,
    requestPreviousShader: false,
    requestWheelDirection: 0,
  };

  let subscriber = null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;

  const emit = patch => {
    if (subscriber) {
      subscriber(cloneState({ ...state, ...patch }));
    }
  };

  const resetTransientState = () => {
    state.requestToggleUI = false;
    state.requestResetVisualizer = false;
    state.requestNextShader = false;
    state.requestPreviousShader = false;
    state.requestWheelDirection = 0;
    state.currPointerDown = 0;
    emit(state);
  };

  const syncPointer = event => {
    state.clientX = Number(event.clientX);
    state.clientY = Number(event.clientY);
    state.pointerOverUi = isUiEvent(event, { rendererDomElement: inferredRendererDomElement, pointerOverUiChecker, uiSelectors });
  };

  const attach = (target, type, handler, options) => {
    if (!target) {
      return;
    }

    const listenerOptions = controller ? { ...options, signal: controller.signal } : options;
    target.addEventListener(type, handler, listenerOptions);
  };

  attach(window, 'pointermove', event => {
    syncPointer(event);
    emit(state);
  }, { capture: true, passive: true });

  attach(window, 'pointerdown', event => {
    syncPointer(event);
    if (state.pointerOverUi) {
      resetTransientState();
      return;
    }

    state.currPointerDown = 1;
    emit(state);
  }, { capture: true, passive: true });

  attach(window, 'pointerup', event => {
    syncPointer(event);
    if (state.pointerOverUi) {
      resetTransientState();
      return;
    }

    state.currPointerDown = 0;
    state.requestToggleUI = event.button === 1 || event.button === 2;
    state.requestResetVisualizer = event.button === 0;
    emit(state);
  }, { capture: true, passive: true });

  attach(window, 'wheel', event => {
    syncPointer(event);
    if (state.pointerOverUi) {
      return;
    }

    state.requestWheelDirection = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0;
    emit(state);
  }, { capture: true, passive: true });

  attach(window, 'blur', () => {
    resetTransientState();
  }, {});

  attach(document, 'visibilitychange', () => {
    if (document.hidden) {
      resetTransientState();
    }
  }, {});

  const source = {
    onToggleUI,
    onHideQuickPresets,
    onUpdateTooltip,
    getState() {
      return cloneState(state);
    },
    subscribe(handler) {
      subscriber = handler;
      return () => {
        if (subscriber === handler) {
          subscriber = null;
        }
      };
    },
    detach() {
      if (controller) {
        controller.abort();
      }
      subscriber = null;
    },
  };

  return source;
}

/**
 * Create an input source compatible with `MAGEEngine.attachInputSource(inputSource)`.
 * The source mirrors the built-in viewport bridge and can be used directly when the host
 * wants the engine to listen to window pointer events.
 *
 * @param {Object} [options]
 * @param {HTMLElement} [options.rendererDomElement] - renderer canvas element used for inside/outside viewport checks
 * @param {(event: Event) => boolean} [options.pointerOverUiChecker] - optional custom UI test
 * @param {string[]} [options.uiSelectors] - CSS selectors treated as UI hotspots
 * @param {() => void} [options.onToggleUI]
 * @param {() => void} [options.onHideQuickPresets]
 * @param {(payload: { visible: boolean, x: number, y: number }) => void} [options.onUpdateTooltip]
 * @returns {ViewportInputSource}
 */
export function createDomInputSource(options = {}) {
  return createWindowDrivenSource(options);
}

/**
 * Create React-friendly pointer handlers that attach a viewport input source to the engine and
 * forward React pointer events into it.
 *
 * Usage:
 * const handlers = createReactPointerHandlers(engine, { rendererDomElement: canvas });
 * <div {...handlers} />
 *
 * @param {Object} engine - `MAGEEngine` instance (must implement `attachInputSource`)
 * @param {Object} [options]
 * @param {HTMLElement} [options.rendererDomElement]
 * @param {(event: Event) => boolean} [options.pointerOverUiChecker]
 * @param {string[]} [options.uiSelectors]
 * @returns {{ onPointerMove: Function, onPointerDown: Function, onPointerUp: Function, onPointerEnter: Function, onPointerLeave: Function, onPointerCancel: Function }}
 */
export function createReactPointerHandlers(engine, options = {}) {
  if (!engine || typeof engine.attachInputSource !== 'function') {
    throw new Error('createReactPointerHandlers: engine must implement attachInputSource()');
  }

  const state = {
    clientX: Number.NaN,
    clientY: Number.NaN,
    pointerOverUi: false,
    currPointerDown: 0,
    requestToggleUI: false,
    requestResetVisualizer: false,
    requestNextShader: false,
    requestPreviousShader: false,
    requestWheelDirection: 0,
  };

  let subscriber = null;

  const source = {
    onToggleUI: null,
    onHideQuickPresets: null,
    onUpdateTooltip: null,
    getState() {
      return cloneState(state);
    },
    subscribe(handler) {
      subscriber = handler;
      return () => {
        if (subscriber === handler) {
          subscriber = null;
        }
      };
    },
    detach() {
      subscriber = null;
    },
  };

  engine.attachInputSource(source);

  const publish = patch => {
    Object.assign(state, patch);

    if (subscriber) {
      subscriber(cloneState(state));
    }
  };

  const isUi = event => isUiEvent(event, options);

  return {
    onPointerMove: event => publish({ clientX: event.clientX, clientY: event.clientY, pointerOverUi: isUi(event) }),
    onPointerDown: event => publish({ currPointerDown: 1, clientX: event.clientX, clientY: event.clientY, pointerOverUi: isUi(event), requestResetVisualizer: false, requestToggleUI: false }),
    onPointerUp: event => publish({ currPointerDown: 0, clientX: event.clientX, clientY: event.clientY, pointerOverUi: isUi(event), requestResetVisualizer: event.button === 0, requestToggleUI: event.button === 1 || event.button === 2 }),
    onPointerEnter: event => publish({ clientX: event.clientX, clientY: event.clientY, pointerOverUi: isUi(event) }),
    onPointerLeave: event => publish({ clientX: event.clientX, clientY: event.clientY, pointerOverUi: isUi(event), currPointerDown: 0 }),
    onPointerCancel: () => publish({ currPointerDown: 0, requestResetVisualizer: false, requestToggleUI: false, requestWheelDirection: 0 }),
  };
}

