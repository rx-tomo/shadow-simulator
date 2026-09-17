import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initMap, setBasemap, setupMapErrorHandler, updatePlateauErrorNotice, applyExternalBuildingColorTheme, showFileNotice } from '../public/map-init.js';
import { state, BASEMAP_STYLES, APP_BUILD, DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_PITCH } from '../public/state.js';

describe('map-init setBasemap', () => {
  it('applies requested basemap style when key is valid', () => {
    const map = { setStyle: vi.fn() };

    setBasemap(map, 'bright');

    expect(state.basemap).toBe('bright');
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    expect(map.setStyle.mock.calls[0][0]).toBe(BASEMAP_STYLES.bright);
    expect(typeof map.setStyle.mock.calls[0][1].transformStyle).toBe('function');
  });

  it('falls back to liberty when key is invalid', () => {
    const map = { setStyle: vi.fn() };

    setBasemap(map, 'unknown-kind');

    expect(state.basemap).toBe('liberty');
    expect(map.setStyle.mock.calls[0][0]).toBe(BASEMAP_STYLES.liberty);
  });

  it('transformStyle keeps custom sources/layers from previous style', () => {
    const map = { setStyle: vi.fn() };
    setBasemap(map, 'liberty');
    const { transformStyle } = map.setStyle.mock.calls[0][1];

    const previousStyle = {
      sources: {
        plateau: { type: 'vector' },
        buildings: { type: 'geojson' },
        'td-abc': { type: 'geojson' },
        normal: { type: 'vector' },
      },
      layers: [
        { id: 'plateau-buildings', source: 'plateau' },
        { id: 'td-custom', source: 'td-abc' },
        { id: 'normal-layer', source: 'normal' },
      ],
    };
    const nextStyle = {
      sources: { base: { type: 'vector' } },
      layers: [{ id: 'base-layer', source: 'base' }],
    };

    const merged = transformStyle(previousStyle, nextStyle);

    expect(merged.sources.base).toBeDefined();
    expect(merged.sources.plateau).toBeDefined();
    expect(merged.sources.buildings).toBeDefined();
    expect(merged.sources['td-abc']).toBeDefined();
    expect(merged.sources.normal).toBeUndefined();
    expect(merged.layers.map((l) => l.id)).toEqual(['base-layer', 'plateau-buildings', 'td-custom']);
  });
});

describe('map-init error notice and handlers', () => {
  beforeEach(() => {
    state.plateauVisible = true;
    state.pmtilesRangeError = false;
    globalThis.document = { getElementById: () => null };
  });

  it('updatePlateauErrorNotice toggles visibility by plateau/range-error flags', () => {
    const classList = { toggle: vi.fn() };
    const warningEl = { classList };
    globalThis.document.getElementById = (id) => (id === 'plateauErrorNote' ? warningEl : null);

    updatePlateauErrorNotice();
    expect(classList.toggle).toHaveBeenCalledWith('hidden', true);

    state.pmtilesRangeError = true;
    updatePlateauErrorNotice();
    expect(classList.toggle).toHaveBeenLastCalledWith('hidden', false);
  });

  it('setupMapErrorHandler marks range-related map errors and updates notice', () => {
    const classList = { toggle: vi.fn() };
    const warningEl = { classList };
    globalThis.document.getElementById = (id) => (id === 'plateauErrorNote' ? warningEl : null);
    const listeners = {};
    const map = {
      on: vi.fn((event, handler) => {
        listeners[event] = handler;
      }),
    };

    setupMapErrorHandler(map);
    listeners.error({ error: { message: 'Request failed: Content-Length and Range mismatch' } });

    expect(state.pmtilesRangeError).toBe(true);
    expect(classList.toggle).toHaveBeenLastCalledWith('hidden', false);
  });

  it('setupMapErrorHandler ignores non-range errors', () => {
    const listeners = {};
    const map = {
      on: vi.fn((event, handler) => {
        listeners[event] = handler;
      }),
    };

    setupMapErrorHandler(map);
    listeners.error({ error: { message: 'network timeout' } });

    expect(state.pmtilesRangeError).toBe(false);
  });

  it('applyExternalBuildingColorTheme updates both map layers when present', () => {
    const map = {
      getLayer: vi.fn((id) => id === 'building-3d' || id === 'plateau-buildings'),
      setPaintProperty: vi.fn(),
    };

    applyExternalBuildingColorTheme(map);

    expect(map.setPaintProperty).toHaveBeenCalledTimes(4);
    expect(map.setPaintProperty).toHaveBeenCalledWith('building-3d', 'fill-extrusion-color', expect.any(String));
    expect(map.setPaintProperty).toHaveBeenCalledWith('plateau-buildings', 'fill-extrusion-opacity', expect.any(Number));
  });

  it('showFileNotice reveals notice only on file protocol', () => {
    const classList = { remove: vi.fn() };
    const notice = { classList };
    globalThis.document.getElementById = (id) => (id === 'fileNotice' ? notice : null);

    globalThis.location = { protocol: 'file:' };
    showFileNotice();
    expect(classList.remove).toHaveBeenCalledWith('hidden');

    classList.remove.mockClear();
    globalThis.location = { protocol: 'https:' };
    showFileNotice();
    expect(classList.remove).not.toHaveBeenCalled();
  });

  it('applyExternalBuildingColorTheme handles setPaintProperty error gracefully', () => {
    const map = {
      getLayer: vi.fn(() => true),
      setPaintProperty: vi.fn()
        .mockImplementationOnce(() => { throw new Error('paint fail'); })
        .mockImplementation(() => {}),
    };

    expect(() => applyExternalBuildingColorTheme(map)).not.toThrow();
  });

  it('applyExternalBuildingColorTheme skips layers when not present', () => {
    const map = {
      getLayer: vi.fn(() => false),
      setPaintProperty: vi.fn(),
    };

    applyExternalBuildingColorTheme(map);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });

  it('setupMapErrorHandler detects byte serving error', () => {
    const listeners = {};
    const map = { on: vi.fn((event, handler) => { listeners[event] = handler; }) };

    setupMapErrorHandler(map);
    listeners.error({ error: { message: 'byte serving is not supported' } });
    expect(state.pmtilesRangeError).toBe(true);
  });

  it('setupMapErrorHandler detects partial content + range error', () => {
    state.pmtilesRangeError = false;
    const listeners = {};
    const map = { on: vi.fn((event, handler) => { listeners[event] = handler; }) };

    setupMapErrorHandler(map);
    listeners.error({ error: { message: 'Expected partial content with range header' } });
    expect(state.pmtilesRangeError).toBe(true);
  });

  it('setupMapErrorHandler ignores empty error message', () => {
    state.pmtilesRangeError = false;
    const listeners = {};
    const map = { on: vi.fn((event, handler) => { listeners[event] = handler; }) };

    setupMapErrorHandler(map);
    listeners.error({ error: {} });
    expect(state.pmtilesRangeError).toBe(false);
  });

  it('transformStyle handles null previousStyle', () => {
    const map = { setStyle: vi.fn() };
    setBasemap(map, 'liberty');
    const { transformStyle } = map.setStyle.mock.calls[0][1];

    const nextStyle = {
      sources: { base: { type: 'vector' } },
      layers: [{ id: 'base-layer', source: 'base' }],
    };

    const merged = transformStyle(null, nextStyle);
    expect(merged.sources).toEqual({ base: { type: 'vector' } });
    expect(merged.layers).toEqual([{ id: 'base-layer', source: 'base' }]);
  });
});

// =========================================================
// initMap
// =========================================================
describe('initMap', () => {
  it('creates map with expected config and adds controls', () => {
    const mockMap = {
      addControl: vi.fn(),
    };

    const MockMap = vi.fn(() => mockMap);
    const MockNav = vi.fn();
    const MockScale = vi.fn();

    globalThis.maplibregl = {
      setWorkerUrl: vi.fn(),
      Map: MockMap,
      NavigationControl: MockNav,
      ScaleControl: MockScale,
    };

    const result = initMap();

    expect(globalThis.maplibregl.setWorkerUrl).toHaveBeenCalledWith(
      `./vendor/maplibre-gl-csp-worker.js?v=${APP_BUILD}`
    );
    expect(MockMap).toHaveBeenCalledWith(expect.objectContaining({
      container: 'map',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
    }));
    expect(mockMap.addControl).toHaveBeenCalledTimes(2);
    expect(result).toBe(mockMap);
  });
});
