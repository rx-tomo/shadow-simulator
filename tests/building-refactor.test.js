import { describe, it, expect, vi, afterAll } from 'vitest';
import {
  createMapInteractionToggle,
  setModeButtonActive,
  createPolygonTracker,
  createChangeDetector,
  createTerraDrawInstance,
  getSelectedFeatureIds,
  handleDelete,
  bindPointerEvents,
} from '../public/building.js';
import { state } from '../public/state.js';

// =========================================================
// Helpers: mock factories
// =========================================================

function createMockMap(interactionsEnabled = true) {
  return {
    stop: vi.fn(),
    dragPan: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
    dragRotate: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
    scrollZoom: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
    boxZoom: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
    doubleClickZoom: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
    keyboard: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
    touchZoomRotate: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
    touchPitch: { isEnabled: () => interactionsEnabled, enable: vi.fn(), disable: vi.fn() },
  };
}

function createMockDraw(features) {
  let _features = features;
  return {
    getSnapshot: () => _features,
    _setSnapshot: (f) => { _features = f; },
  };
}

// =========================================================
// AC-18-2: 抽出した各関数が独立してexportされていること
// =========================================================

describe('AC-18-2: createMapInteractionToggle', () => {
  it('returns an object with disableAll, enableAll, disablePanRotate, enablePanRotate', () => {
    const mockMap = createMockMap();
    const toggle = createMapInteractionToggle(mockMap);
    expect(toggle).toBeDefined();
    expect(typeof toggle.disableAll).toBe('function');
    expect(typeof toggle.enableAll).toBe('function');
    expect(typeof toggle.disablePanRotate).toBe('function');
    expect(typeof toggle.enablePanRotate).toBe('function');
  });

  it('disableAll disables all map interactions', () => {
    const mockMap = createMockMap();
    const toggle = createMapInteractionToggle(mockMap);
    toggle.disableAll();
    expect(mockMap.dragPan.disable).toHaveBeenCalled();
    expect(mockMap.scrollZoom.disable).toHaveBeenCalled();
    expect(mockMap.boxZoom.disable).toHaveBeenCalled();
    expect(mockMap.doubleClickZoom.disable).toHaveBeenCalled();
    expect(mockMap.keyboard.disable).toHaveBeenCalled();
    expect(mockMap.touchZoomRotate.disable).toHaveBeenCalled();
    expect(mockMap.touchPitch.disable).toHaveBeenCalled();
  });

  it('enableAll enables all map interactions', () => {
    const mockMap = createMockMap(false);
    const toggle = createMapInteractionToggle(mockMap);
    toggle.enableAll();
    expect(mockMap.dragPan.enable).toHaveBeenCalled();
    expect(mockMap.scrollZoom.enable).toHaveBeenCalled();
  });

  it('disablePanRotate only disables dragPan and dragRotate', () => {
    const mockMap = createMockMap();
    const toggle = createMapInteractionToggle(mockMap);
    toggle.disablePanRotate();
    expect(mockMap.dragPan.disable).toHaveBeenCalled();
    expect(mockMap.dragRotate.disable).toHaveBeenCalled();
    // scrollZoom should NOT be called
    expect(mockMap.scrollZoom.disable).not.toHaveBeenCalled();
  });

  it('enablePanRotate only enables dragPan and dragRotate', () => {
    const mockMap = createMockMap(false);
    const toggle = createMapInteractionToggle(mockMap);
    toggle.enablePanRotate();
    expect(mockMap.dragPan.enable).toHaveBeenCalled();
    expect(mockMap.dragRotate.enable).toHaveBeenCalled();
    expect(mockMap.scrollZoom.enable).not.toHaveBeenCalled();
  });
});

describe('AC-18-2: setModeButtonActive', () => {
  it('is exported as a function', () => {
    expect(typeof setModeButtonActive).toBe('function');
  });

  it('toggles active class and aria-pressed on known buttons', () => {
    const makeButton = () => {
      const classes = new Set();
      return {
        classList: {
          toggle: (name, on) => {
            if (on) classes.add(name);
            else classes.delete(name);
          },
        },
        setAttribute: vi.fn(),
        hasClass: (name) => classes.has(name),
      };
    };
    const drawRectButton = makeButton();
    const selectButton = makeButton();
    const originalDocument = globalThis.document;
    globalThis.document = {
      getElementById: (id) => {
        if (id === 'drawRectButton') return drawRectButton;
        if (id === 'selectButton') return selectButton;
        return null;
      },
    };

    setModeButtonActive('selectButton');
    expect(selectButton.hasClass('btn-primary')).toBe(true);
    expect(drawRectButton.hasClass('btn-primary')).toBe(false);
    expect(selectButton.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(drawRectButton.setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');

    setModeButtonActive(null);
    expect(selectButton.hasClass('btn-primary')).toBe(false);
    expect(drawRectButton.hasClass('btn-primary')).toBe(false);
    expect(selectButton.setAttribute).toHaveBeenLastCalledWith('aria-pressed', 'false');
    expect(drawRectButton.setAttribute).toHaveBeenLastCalledWith('aria-pressed', 'false');

    globalThis.document = originalDocument;
  });
});

describe('AC-18-2: createPolygonTracker', () => {
  it('returns tracker with getPolygonSnapshotFeatures, refresh, detectCompletedId', () => {
    const mockDraw = createMockDraw([]);
    const tracker = createPolygonTracker(mockDraw);
    expect(tracker).toBeDefined();
    expect(typeof tracker.getSnapshotFeatures).toBe('function');
    expect(typeof tracker.getPolygonSnapshotFeatures).toBe('function');
    expect(typeof tracker.refresh).toBe('function');
    expect(typeof tracker.detectCompletedId).toBe('function');
  });

  it('getPolygonSnapshotFeatures filters to Polygon only', () => {
    const mockDraw = createMockDraw([
      { id: '1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: {} },
      { id: '2', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
    ]);
    const tracker = createPolygonTracker(mockDraw);
    const polys = tracker.getPolygonSnapshotFeatures();
    expect(polys).toHaveLength(1);
    expect(polys[0].id).toBe('1');
  });

  it('detectCompletedId detects a newly completed polygon', () => {
    // Step 1: feature is currently drawing
    const drawingFeature = {
      id: 'p1',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { currentlyDrawing: true },
    };
    const mockDraw = createMockDraw([drawingFeature]);
    const tracker = createPolygonTracker(mockDraw);
    tracker.refresh();

    // Step 2: feature is no longer drawing (completed)
    const completedFeature = { ...drawingFeature, properties: { currentlyDrawing: false } };
    mockDraw._setSnapshot([completedFeature]);
    const completedId = tracker.detectCompletedId();
    expect(completedId).toBe('p1');
  });

  it('detectCompletedId returns null when no changes', () => {
    const feature = {
      id: 'p1',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { currentlyDrawing: false },
    };
    const mockDraw = createMockDraw([feature]);
    const tracker = createPolygonTracker(mockDraw);
    tracker.refresh();
    // Call again with same state — should not re-detect
    const completedId = tracker.detectCompletedId();
    expect(completedId).toBeNull();
  });
});

describe('AC-18-2: createTerraDrawInstance', () => {
  it('is exported as a function', () => {
    expect(typeof createTerraDrawInstance).toBe('function');
  });

  it('constructs TerraDraw with required mode set', () => {
    const originalTerraDraw = globalThis.terraDraw;
    const terraCtor = vi.fn().mockImplementation((config) => ({ config }));
    globalThis.terraDraw = {
      TerraDraw: terraCtor,
      TerraDrawRenderMode: vi.fn().mockImplementation((opts) => opts),
      TerraDrawAngledRectangleMode: vi.fn().mockImplementation((opts) => opts),
      TerraDrawSelectMode: vi.fn().mockImplementation((opts) => opts),
    };

    const adapter = { kind: 'adapter-mock' };
    const instance = createTerraDrawInstance(adapter);

    expect(terraCtor).toHaveBeenCalledTimes(1);
    expect(instance.config.adapter).toBe(adapter);
    expect(instance.config.modes).toHaveLength(3);
    expect(instance.config.modes[0].modeName).toBe('render');
    expect(instance.config.modes[1].modeName).toBe('angled-rectangle');
    expect(instance.config.modes[2].modeName).toBe('select');

    globalThis.terraDraw = originalTerraDraw;
  });
});

describe('AC-18-2: createChangeDetector', () => {
  it('check calls onCompleted when tracker reports completed feature', () => {
    const polys = [{
      id: 'p1',
      geometry: { coordinates: [[[139.7, 35.6], [139.8, 35.6], [139.8, 35.7], [139.7, 35.6]]] },
      properties: { currentlyDrawing: false },
    }];
    const tracker = {
      detectCompletedId: vi.fn().mockReturnValue('p1'),
      getPolygonSnapshotFeatures: vi.fn().mockReturnValue(polys),
      size: 1,
    };
    const onCompleted = vi.fn();
    const detector = createChangeDetector(tracker, onCompleted);

    detector.check(polys);
    expect(tracker.detectCompletedId).toHaveBeenCalledWith(polys);
    expect(onCompleted).toHaveBeenCalledWith('p1', polys);
  });

  it('scheduleIdle coalesces duplicate schedules into one callback', () => {
    vi.useFakeTimers();
    const polys = [{
      id: 'p2',
      geometry: { coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] },
      properties: { currentlyDrawing: false },
    }];
    const tracker = {
      detectCompletedId: vi.fn().mockReturnValue(null),
      getPolygonSnapshotFeatures: vi.fn().mockReturnValue(polys),
      size: 1,
    };
    const onCompleted = vi.fn();
    const detector = createChangeDetector(tracker, onCompleted);
    const originalRequestIdleCallback = globalThis.requestIdleCallback;
    delete globalThis.requestIdleCallback;

    detector.scheduleIdle();
    detector.scheduleIdle();
    vi.advanceTimersByTime(101);

    expect(tracker.getPolygonSnapshotFeatures).toHaveBeenCalledTimes(1);
    expect(tracker.detectCompletedId).toHaveBeenCalledTimes(1);
    expect(onCompleted).not.toHaveBeenCalled();

    globalThis.requestIdleCallback = originalRequestIdleCallback;
    vi.useRealTimers();
  });
});

// =========================================================
// AC-18-1: initTerraDraw本体が100行以下
// =========================================================
describe('AC-18-1: initTerraDraw function length', () => {
  it('initTerraDraw function body is 100 lines or fewer', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../public/building.js', import.meta.url), 'utf-8');

    // Find the function body of initTerraDraw
    const funcStart = source.indexOf('export function initTerraDraw(');
    expect(funcStart).toBeGreaterThan(-1);

    // Count lines from function declaration to closing brace
    let braceDepth = 0;
    let started = false;
    let lineCount = 0;
    const lines = source.slice(funcStart).split('\n');
    for (const line of lines) {
      if (!started) {
        if (line.includes('{')) {
          started = true;
          braceDepth += (line.match(/{/g) || []).length;
          braceDepth -= (line.match(/}/g) || []).length;
          lineCount++;
        }
        continue;
      }
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      lineCount++;
      if (braceDepth <= 0) break;
    }

    expect(lineCount).toBeLessThanOrEqual(100);
  });
});

describe('building selected IDs', () => {
  it('prefers selected=true properties over fallback state IDs', () => {
    state.selectedFeatureIds = new Set(['fallback-1']);
    const features = [
      { id: 'a', properties: { selected: true } },
      { id: 'b', properties: { selected: false } },
    ];
    expect(getSelectedFeatureIds(features)).toEqual(['a']);
  });

  it('uses fallback IDs and filters unknown IDs when selected property is absent', () => {
    state.selectedFeatureIds = new Set(['keep', 'drop']);
    const features = [{ id: 'keep', properties: {} }];
    expect(getSelectedFeatureIds(features)).toEqual(['keep']);
  });
});

describe('building delete handler', () => {
  const originalDocument = globalThis.document;
  afterAll(() => {
    globalThis.document = originalDocument;
  });

  const installUiInputs = () => {
    const inputs = new Map([
      ['heightInput', { value: '' }],
      ['heightRange', { value: '' }],
      ['floorsInput', { value: '' }],
      ['floorsRange', { value: '' }],
    ]);
    globalThis.document = {
      getElementById: (id) => inputs.get(id) ?? null,
    };
  };

  it('removes selected IDs when removeFeatures is available', () => {
    installUiInputs();
    state.map = null;
    state.defaultHeight = 12;
    state.defaultFloors = 4;
    state.selectedFeatureIds = new Set(['x1', 'x2']);
    const draw = { removeFeatures: vi.fn(), clear: vi.fn() };
    const tracker = { refresh: vi.fn() };

    handleDelete(draw, tracker);

    expect(draw.removeFeatures).toHaveBeenCalledWith(['x1', 'x2']);
    expect(draw.clear).not.toHaveBeenCalled();
    expect([...state.selectedFeatureIds]).toEqual([]);
    expect(tracker.refresh).toHaveBeenCalledTimes(1);
  });

  it('falls back to clear() when no selected IDs', () => {
    installUiInputs();
    state.map = null;
    state.selectedFeatureIds = new Set();
    const draw = { clear: vi.fn(), removeFeatures: vi.fn() };
    const tracker = { refresh: vi.fn() };

    handleDelete(draw, tracker);

    expect(draw.clear).toHaveBeenCalledTimes(1);
    expect(draw.removeFeatures).not.toHaveBeenCalled();
  });

  it('removes all snapshot IDs when clear() is not available', () => {
    installUiInputs();
    state.map = null;
    state.selectedFeatureIds = new Set();
    const draw = {
      getSnapshot: () => ({ features: [{ id: 'a' }, { id: 'b' }, { id: null }] }),
      removeFeatures: vi.fn(),
    };
    const tracker = { refresh: vi.fn() };

    handleDelete(draw, tracker);

    expect(draw.removeFeatures).toHaveBeenCalledWith(['a', 'b']);
  });

});

describe('pointer binding', () => {
  it('temporarily disables pan/rotate on polygon hit and restores on pointer end', () => {
    state.map = null;
    state.activeMode = 'select';
    state.terraInstance = {
      getFeaturesAtPointerEvent: vi.fn().mockReturnValue([{ geometry: { type: 'Polygon' } }]),
    };
    const handlers = {};
    const canvas = {
      addEventListener: (event, fn) => {
        handlers[event] = fn;
      },
    };
    const mapToggle = {
      disablePanRotate: vi.fn(),
      enablePanRotate: vi.fn(),
    };
    const polys = [{ id: 'p1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } }];
    const tracker = {
      getPolygonSnapshotFeatures: vi.fn().mockReturnValue(polys),
      detectCompletedId: vi.fn().mockReturnValue('p1'),
    };
    const onCompleted = vi.fn();

    bindPointerEvents(canvas, mapToggle, tracker, onCompleted);
    handlers.pointerdown({ type: 'pointerdown' });
    handlers.pointerup();

    expect(mapToggle.disablePanRotate).toHaveBeenCalledTimes(1);
    expect(mapToggle.enablePanRotate).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith('p1', polys);
  });
});
