import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupPanelToggle, timeRangeToTimeInput, timeInputToRange, setPlayDayButtonActive, searchPlace, getSunlightRange, updateTimeSliderRange, syncHeightFloors, initDateTimeControls, setupViewControls, applyViewPreset, startOrbit, setupBasemapControls, setupPlateauToggle, setupBasemapBuildingsToggle, setupPlateauPopup, formatPlateauPopupHeight, setupBuildingControls, setupDateTimeControls, stopPlayDay, startPlayDay, setupPlayDay, isXMobileEntry, setupXMobileGuide } from '../public/panel.js';
import { SEARCH_RESULT_ZOOM, state, PLATEAU_MIN_ZOOM, PITCH_TOP, PITCH_OBLIQUE, PITCH_LOW, DEFAULT_FLOOR_HEIGHT, DEFAULT_BUILDING_HEIGHT, DEFAULT_BUILDING_FLOORS } from '../public/state.js';

function makeInput(value = '') {
  return {
    value,
    addEventListener: () => {},
  };
}

describe('panel.js', () => {
  beforeEach(() => {
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.innerWidth = 1024;
    globalThis.window.location = { search: '' };
    globalThis.window.shadowAnalytics = { isEnabled: false, track: vi.fn() };
    globalThis.fetch = undefined;
    globalThis.SunCalc = {
      getTimes: () => ({
        sunrise: new Date('2026-03-16T06:00:00Z'),
        sunset: new Date('2026-03-16T18:00:00Z'),
      }),
    };
    globalThis.luxon = {
      DateTime: {
        fromJSDate(date) {
          const jsDate = new Date(date);
          return {
            isValid: !Number.isNaN(jsDate.getTime()),
            setZone() {
              return {
                isValid: true,
                hour: jsDate.getUTCHours(),
                minute: jsDate.getUTCMinutes(),
                toFormat() {
                  return `${jsDate.getUTCHours()}:${String(jsDate.getUTCMinutes()).padStart(2, '0')}`;
                },
              };
            },
          };
        },
      },
    };
    globalThis.document = {
      getElementById: () => null,
    };
    state.map = null;
  });

  it('setupPanelToggle does not throw when toggle button is missing', () => {
    const panel = {
      classList: {
        add: () => {},
        remove: () => {},
      },
    };
    const openBtn = {
      classList: {
        add: () => {},
        remove: () => {},
      },
      addEventListener: () => {},
    };

    globalThis.document.getElementById = (id) => {
      if (id === 'panel') return panel;
      if (id === 'panelOpenBtn') return openBtn;
      return null;
    };

    expect(() => setupPanelToggle()).not.toThrow();
  });

  it('timeRangeToTimeInput converts minutes to HH:mm', () => {
    const timeRange = makeInput('545');
    const timeInput = makeInput('');

    globalThis.document.getElementById = (id) => {
      if (id === 'timeRange') return timeRange;
      if (id === 'timeInput') return timeInput;
      return null;
    };

    timeRangeToTimeInput();
    expect(timeInput.value).toBe('09:05');
  });

  it('timeInputToRange converts HH:mm to minutes', () => {
    const timeRange = makeInput('0');
    const timeInput = makeInput('18:30');

    globalThis.document.getElementById = (id) => {
      if (id === 'timeRange') return timeRange;
      if (id === 'timeInput') return timeInput;
      return null;
    };

    timeInputToRange();
    expect(timeRange.value).toBe('1110');
  });

  it('searchPlace does nothing when query is empty', async () => {
    const searchInput = makeInput('   ');
    globalThis.document.getElementById = (id) => {
      if (id === 'searchInput') return searchInput;
      return null;
    };
    globalThis.fetch = vi.fn();
    const map = { easeTo: vi.fn() };

    await searchPlace(map);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('searchPlace moves map when geocoding result is valid', async () => {
    const searchInput = makeInput('東京都庁');
    globalThis.document.getElementById = (id) => {
      if (id === 'searchInput') return searchInput;
      return null;
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => [{ lon: '139.6917', lat: '35.6895' }],
    });
    const map = { easeTo: vi.fn() };

    await searchPlace(map);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(map.easeTo).toHaveBeenCalledWith({
      center: [139.6917, 35.6895],
      zoom: SEARCH_RESULT_ZOOM,
      duration: 700,
    });
  });

  it('searchPlace ignores invalid coordinates', async () => {
    const searchInput = makeInput('invalid');
    globalThis.document.getElementById = (id) => {
      if (id === 'searchInput') return searchInput;
      return null;
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => [{ lon: '200', lat: '95' }],
    });
    const map = { easeTo: vi.fn() };

    await searchPlace(map);

    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('getSunlightRange falls back to full-day range when sunrise/sunset are invalid', () => {
    globalThis.SunCalc.getTimes = () => ({
      sunrise: 'invalid-date',
      sunset: 'invalid-date',
    });
    globalThis.luxon.DateTime.fromJSDate = () => ({
      isValid: false,
      setZone() {
        return this;
      },
    });

    const result = getSunlightRange('2026-03-16', { lat: 35.0, lng: 139.0 });

    expect(result.startMin).toBe(0);
    expect(result.endMin).toBe(1439);
    expect(result.sunrise).toBeNull();
    expect(result.sunset).toBeNull();
  });

  it('updateTimeSliderRange clamps range value and updates sunrise/sunset labels', () => {
    const timeRange = makeInput('0');
    const dateInput = makeInput('2026-03-16');
    const timeInput = makeInput('');
    const sunriseTime = { textContent: '' };
    const sunsetTime = { textContent: '' };

    state.map = {
      getCenter: () => ({ lat: 35.0, lng: 139.0 }),
      getZoom: () => PLATEAU_MIN_ZOOM,
    };

    globalThis.document.getElementById = (id) => {
      if (id === 'timeRange') return timeRange;
      if (id === 'dateInput') return dateInput;
      if (id === 'timeInput') return timeInput;
      if (id === 'sunriseTime') return sunriseTime;
      if (id === 'sunsetTime') return sunsetTime;
      return null;
    };

    updateTimeSliderRange();

    expect(timeRange.min).toBe('330');
    expect(timeRange.max).toBe('1110');
    expect(timeRange.value).toBe('330');
    expect(timeInput.value).toBe('05:30');
    expect(sunriseTime.textContent).toContain('日の出');
    expect(sunsetTime.textContent).toContain('日の入り');
  });
});

// =========================================================
// setPlayDayButtonActive (TD-06)
// =========================================================
describe('setPlayDayButtonActive', () => {
  function makeButton() {
    const classes = new Set();
    return {
      _ariaPressed: '',
      _text: '',
      _ariaLabel: '',
      classList: {
        toggle(cls, force) { force ? classes.add(cls) : classes.delete(cls); },
        has: (cls) => classes.has(cls),
      },
      setAttribute(attr, val) { this['_' + attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val; },
      get textContent() { return this._text; },
      set textContent(v) { this._text = v; },
    };
  }

  it('sets active state on button', () => {
    const btn = makeButton();
    globalThis.document = { getElementById: (id) => id === 'playDayButton' ? btn : null };

    setPlayDayButtonActive(true);
    expect(btn.classList.has('btn-primary')).toBe(true);
    expect(btn._ariaPressed).toBe('true');
    expect(btn.textContent).toBe('■ 停止');
  });

  it('sets inactive state on button', () => {
    const btn = makeButton();
    globalThis.document = { getElementById: (id) => id === 'playDayButton' ? btn : null };

    setPlayDayButtonActive(false);
    expect(btn.classList.has('btn-primary')).toBe(false);
    expect(btn._ariaPressed).toBe('false');
    expect(btn.textContent).toBe('▶ 1日再生');
  });

  it('does not throw when button is missing', () => {
    globalThis.document = { getElementById: () => null };
    expect(() => setPlayDayButtonActive(true)).not.toThrow();
  });
});

// =========================================================
// Helper: DOM element factory
// =========================================================
function makeEl(overrides = {}) {
  return {
    value: '',
    textContent: '',
    checked: false,
    addEventListener: vi.fn(),
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
      contains: vi.fn(() => false),
      has: vi.fn(() => false),
    },
    setAttribute: vi.fn(),
    ...overrides,
  };
}

function setupElMap(elMap) {
  globalThis.document = {
    getElementById: (id) => elMap[id] || null,
  };
}

// =========================================================
// syncHeightFloors
// =========================================================
describe('syncHeightFloors', () => {
  let elements;

  beforeEach(() => {
    state.uiHeight = DEFAULT_BUILDING_HEIGHT;
    state.uiFloors = DEFAULT_BUILDING_FLOORS;
    state.floorHeight = DEFAULT_FLOOR_HEIGHT;
    state.selectedFeatureIds = new Set();
    state.terraInstance = null;
    state.map = {
      getSource: vi.fn(() => null),
      queryRenderedFeatures: vi.fn(() => []),
    };

    elements = {
      heightInput: makeEl({ value: '10' }),
      heightRange: makeEl({ value: '10' }),
      floorsInput: makeEl({ value: '3' }),
      floorsRange: makeEl({ value: '3' }),
      floorHeightInput: makeEl({ value: '3.1' }),
    };
    setupElMap(elements);
  });

  it('syncs from height input', () => {
    elements.heightInput.value = '15';
    syncHeightFloors('height');
    expect(state.uiHeight).toBe(15);
    expect(state.uiFloors).toBe(Math.round(15 / state.floorHeight));
  });

  it('syncs from floors input', () => {
    elements.floorsInput.value = '5';
    syncHeightFloors('floors');
    expect(state.uiFloors).toBe(5);
    expect(state.uiHeight).toBe(5 * state.floorHeight);
  });

  it('syncs from floorHeight input', () => {
    state.uiFloors = 4;
    elements.floorHeightInput.value = '3.5';
    syncHeightFloors('floorHeight');
    expect(state.floorHeight).toBe(3.5);
    expect(state.uiHeight).toBe(4 * 3.5);
  });

  it('updates element values after sync', () => {
    elements.heightInput.value = '20';
    syncHeightFloors('height');
    expect(elements.heightInput.value).toBe(String(state.uiHeight));
    expect(elements.floorsInput.value).toBe(String(state.uiFloors));
  });
});

// =========================================================
// initDateTimeControls
// =========================================================
describe('initDateTimeControls', () => {
  it('sets default date and time values', () => {
    const dateInput = makeEl();
    const timeInput = makeEl();
    const timeRange = makeEl();

    setupElMap({ dateInput, timeInput, timeRange });

    globalThis.luxon = {
      DateTime: {
        now() {
          return {
            setZone() {
              return {
                toISODate() { return '2026-03-16'; },
              };
            },
          };
        },
      },
    };

    initDateTimeControls();
    expect(dateInput.value).toBe('2026-03-16');
    expect(timeInput.value).toBe('12:00');
    expect(timeRange.value).toBe('720');
  });
});

// =========================================================
// setupViewControls / applyViewPreset
// =========================================================
describe('setupViewControls', () => {
  let map;
  let elements;

  beforeEach(() => {
    map = {
      setPitch: vi.fn(),
      setBearing: vi.fn(),
      getBearing: vi.fn(() => 45),
      getPitch: vi.fn(() => 30),
      easeTo: vi.fn(),
      on: vi.fn(),
    };
    elements = {
      pitchRange: makeEl({ value: '30' }),
      bearingRange: makeEl({ value: '45' }),
      viewPresetRow: makeEl(),
    };
    setupElMap(elements);
    globalThis.window = { setInterval: vi.fn(() => 1), clearInterval: vi.fn() };
  });

  it('registers pitch and bearing input listeners', () => {
    setupViewControls(map);
    expect(elements.pitchRange.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(elements.bearingRange.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
  });

  it('registers map event listeners', () => {
    setupViewControls(map);
    const events = map.on.mock.calls.map(c => c[0]);
    expect(events).toContain('dragstart');
    expect(events).toContain('rotatestart');
    expect(events).toContain('pitchstart');
    expect(events).toContain('rotate');
    expect(events).toContain('pitch');
  });

  it('registers viewPresetRow click listener', () => {
    setupViewControls(map);
    expect(elements.viewPresetRow.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });
});

describe('applyViewPreset', () => {
  let map;
  let elements;

  beforeEach(() => {
    state.orbiting = false;
    state.orbitTimer = null;
    map = {
      easeTo: vi.fn(),
      getBearing: vi.fn(() => 90),
      getPitch: vi.fn(() => 30),
      getCenter: vi.fn(() => ({ lat: 35.0, lng: 139.0 })),
    };
    elements = {
      pitchRange: makeEl(),
      bearingRange: makeEl(),
    };
    setupElMap(elements);
    globalThis.window = { setInterval: vi.fn(() => 1), clearInterval: vi.fn() };
  });

  it('applies top preset', () => {
    applyViewPreset(map, 'top');
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: PITCH_TOP }));
  });

  it('applies oblique preset', () => {
    applyViewPreset(map, 'oblique');
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: PITCH_OBLIQUE }));
  });

  it('applies low preset', () => {
    applyViewPreset(map, 'low');
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: PITCH_LOW }));
  });

  it('applies north preset and resets bearing', () => {
    // After easeTo({ bearing: 0 }), getBearing should reflect the new value
    map.getBearing.mockReturnValue(0);
    applyViewPreset(map, 'north');
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ bearing: 0 }));
    expect(elements.bearingRange.value).toBe('0');
  });

  it('applies orbit preset', () => {
    applyViewPreset(map, 'orbit');
    expect(state.orbiting).toBe(true);
  });

  it('updates pitch/bearing range values', () => {
    map.getPitch.mockReturnValue(55);
    map.getBearing.mockReturnValue(180);
    applyViewPreset(map, 'top');
    expect(elements.pitchRange.value).toBe('55');
    expect(elements.bearingRange.value).toBe('180');
  });
});

// =========================================================
// startOrbit
// =========================================================
describe('startOrbit', () => {
  beforeEach(() => {
    state.orbiting = false;
    state.orbitTimer = null;
    globalThis.window = { setInterval: vi.fn(() => 42), clearInterval: vi.fn() };
  });

  it('starts orbit and sets timer', () => {
    const map = {
      getCenter: () => ({ lat: 35, lng: 139 }),
      getBearing: () => 0,
      getPitch: () => 30,
      easeTo: vi.fn(),
    };
    setupElMap({ bearingRange: makeEl() });

    startOrbit(map);
    expect(state.orbiting).toBe(true);
    expect(state.orbitTimer).toBe(42);
    expect(globalThis.window.setInterval).toHaveBeenCalled();
  });
});

// =========================================================
// setupBasemapControls
// =========================================================
describe('setupBasemapControls', () => {
  it('registers change listener on basemapSelect', () => {
    const select = makeEl({ value: 'liberty' });
    setupElMap({ basemapSelect: select });
    state.basemap = 'liberty';

    const map = { setStyle: vi.fn() };
    setupBasemapControls(map);

    expect(select.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('returns early when basemapSelect is missing', () => {
    setupElMap({});
    expect(() => setupBasemapControls({})).not.toThrow();
  });
});

// =========================================================
// setupPlateauToggle
// =========================================================
describe('setupPlateauToggle', () => {
  it('registers change and zoom listeners', () => {
    const toggle = makeEl({ checked: true });
    const label = makeEl();
    const hint = makeEl();
    setupElMap({ plateauToggle: toggle, plateauLabel: label, plateauHint: hint });

    const map = { on: vi.fn() };
    setupPlateauToggle(map);

    expect(toggle.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('zoom', expect.any(Function));
  });

  it('returns early when toggle is missing', () => {
    setupElMap({});
    expect(() => setupPlateauToggle({})).not.toThrow();
  });
});

// =========================================================
// setupBasemapBuildingsToggle
// =========================================================
describe('setupBasemapBuildingsToggle', () => {
  it('registers change listener', () => {
    const toggle = makeEl({ checked: true });
    const label = makeEl();
    setupElMap({ basemapBuildingsToggle: toggle, basemapBuildingsLabel: label });

    const map = { getLayer: vi.fn(), setLayoutProperty: vi.fn() };
    setupBasemapBuildingsToggle(map);

    expect(toggle.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('returns early when toggle is missing', () => {
    setupElMap({});
    expect(() => setupBasemapBuildingsToggle({})).not.toThrow();
  });
});

// =========================================================
// setupPlateauPopup
// =========================================================
describe('setupPlateauPopup', () => {
  it('registers click, mouseenter, mouseleave on map', () => {
    const map = { on: vi.fn(), getCanvas: () => ({ style: {} }) };
    setupElMap({});

    setupPlateauPopup(map);

    const events = map.on.mock.calls.map(c => [c[0], c[1]]);
    expect(events).toContainEqual(['click', 'plateau-buildings']);
    expect(events).toContainEqual(['mouseenter', 'plateau-buildings']);
    expect(events).toContainEqual(['mouseleave', 'plateau-buildings']);
  });
});

describe('formatPlateauPopupHeight', () => {
  it('uses the first positive numeric PLATEAU height', () => {
    expect(formatPlateauPopupHeight({ measuredHeight: '30.25', height: 20, z: 10 })).toBe('30.3 m');
    expect(formatPlateauPopupHeight({ measuredHeight: 0, height: '12.5', z: 10 })).toBe('12.5 m');
    expect(formatPlateauPopupHeight({ measuredHeight: 'invalid', height: 0, z: '8' })).toBe('8 m');
  });

  it('reports unknown when no positive finite height exists', () => {
    expect(formatPlateauPopupHeight({ measuredHeight: 'invalid', height: '0', z: -1 })).toBe('不明');
    expect(formatPlateauPopupHeight({})).toBe('不明');
  });
});

// =========================================================
// setupBuildingControls
// =========================================================
describe('setupBuildingControls', () => {
  it('registers input listeners on height/floors/floorHeight elements', () => {
    const heightInput = makeEl({ value: '10' });
    const heightRange = makeEl({ value: '10' });
    const floorsInput = makeEl({ value: '3' });
    const floorsRange = makeEl({ value: '3' });
    const floorHeightInput = makeEl({ value: '3.1' });

    setupElMap({ heightInput, heightRange, floorsInput, floorsRange, floorHeightInput });
    state.selectedFeatureIds = new Set();
    state.terraInstance = null;

    setupBuildingControls();

    expect(heightInput.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(heightRange.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(floorsInput.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(floorsRange.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(floorHeightInput.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
  });
});

// =========================================================
// setupDateTimeControls
// =========================================================
describe('setupDateTimeControls', () => {
  it('registers input listeners on time/date elements', () => {
    const timeRange = makeEl({ value: '720' });
    const timeInput = makeEl({ value: '12:00' });
    const dateInput = makeEl({ value: '2026-03-16' });
    const timezoneSelect = makeEl({ value: 'Asia/Tokyo' });

    setupElMap({ timeRange, timeInput, dateInput, timezoneSelect });
    state.playingDay = false;
    state.playDayTimer = null;
    state.map = null;

    globalThis.luxon = {
      DateTime: {
        now() {
          return { setZone() { return { toISODate() { return '2026-03-16'; } }; } };
        },
      },
    };

    setupDateTimeControls();

    expect(timeRange.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(timeInput.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(dateInput.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(timezoneSelect.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

// =========================================================
// stopPlayDay / startPlayDay / setupPlayDay
// =========================================================
describe('stopPlayDay', () => {
  beforeEach(() => {
    globalThis.window = { clearInterval: vi.fn(), setInterval: vi.fn(() => 99), shadowAnalytics: { isEnabled: false, track: vi.fn() } };
  });

  it('clears timer and resets state', () => {
    state.playingDay = true;
    state.playDayTimer = 42;

    const btn = makeEl();
    btn.classList = {
      toggle: vi.fn(),
      has: vi.fn(() => false),
    };
    setupElMap({ playDayButton: btn });

    stopPlayDay();
    expect(state.playingDay).toBe(false);
    expect(state.playDayTimer).toBeNull();
    expect(globalThis.window.clearInterval).toHaveBeenCalledWith(42);
  });
});

describe('startPlayDay', () => {
  beforeEach(() => {
    globalThis.window = { clearInterval: vi.fn(), setInterval: vi.fn(() => 77), shadowAnalytics: { isEnabled: false, track: vi.fn() } };
  });

  it('starts play day timer', () => {
    state.playingDay = false;
    state.playDayTimer = null;

    const btn = makeEl();
    btn.classList = { toggle: vi.fn(), has: vi.fn(() => false) };
    const timeRange = makeEl({ value: '600', min: '300', max: '1100' });
    const timeInput = makeEl();

    setupElMap({ playDayButton: btn, timeRange, timeInput });

    startPlayDay();
    expect(state.playingDay).toBe(true);
    expect(state.playDayTimer).toBe(77);
    expect(globalThis.window.setInterval).toHaveBeenCalled();
  });
});

describe('setupPlayDay', () => {
  it('registers click listener on playDayButton', () => {
    const btn = makeEl();
    setupElMap({ playDayButton: btn });

    globalThis.window = { clearInterval: vi.fn(), setInterval: vi.fn(), shadowAnalytics: { isEnabled: false, track: vi.fn() } };
    state.playingDay = false;
    state.playDayTimer = null;

    setupPlayDay();
    expect(btn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });
});

// =========================================================
// setupPanelToggle full behavior
// =========================================================
describe('setupPanelToggle full behavior', () => {
  it('toggleBtn click closes panel and shows openBtn', () => {
    const panel = makeEl();
    const openBtn = makeEl();
    const toggleBtn = makeEl();

    setupElMap({ panel, panelOpenBtn: openBtn, panelToggle: toggleBtn });

    setupPanelToggle();

    // Simulate toggleBtn click
    const clickHandler = toggleBtn.addEventListener.mock.calls.find(c => c[0] === 'click')[1];
    clickHandler();
    expect(panel.classList.add).toHaveBeenCalledWith('collapsed');
    expect(openBtn.classList.remove).toHaveBeenCalledWith('hidden');
  });

  it('openBtn click opens panel and hides openBtn', () => {
    const panel = makeEl();
    const openBtn = makeEl();
    const toggleBtn = makeEl();
    const xMobileGuide = makeEl();

    setupElMap({ panel, panelOpenBtn: openBtn, panelToggle: toggleBtn, xMobileGuide });

    setupPanelToggle();

    // Simulate openBtn click
    const openHandler = openBtn.addEventListener.mock.calls.find(c => c[0] === 'click')[1];
    openHandler();
    expect(panel.classList.remove).toHaveBeenCalledWith('collapsed');
    expect(openBtn.classList.add).toHaveBeenCalledWith('hidden');
    expect(xMobileGuide.classList.add).toHaveBeenCalledWith('hidden');
  });

  it('tracks X guide-driven panel open before hiding the guide', () => {
    const panel = makeEl();
    const openBtn = makeEl();
    const toggleBtn = makeEl();
    const xMobileGuide = makeEl();

    xMobileGuide.classList.contains = vi.fn(() => false);
    setupElMap({ panel, panelOpenBtn: openBtn, panelToggle: toggleBtn, xMobileGuide });
    globalThis.window.location = { search: '?utm_source=x&utm_campaign=x240cities-v05&utm_content=p85' };
    globalThis.window.shadowAnalytics = { track: vi.fn() };

    setupPanelToggle();

    const openHandler = openBtn.addEventListener.mock.calls.find(c => c[0] === 'click')[1];
    openHandler();

    expect(globalThis.window.shadowAnalytics.track).toHaveBeenCalledWith(
      'social_mobile_panel_open_from_guide',
      { source: 'x', source_campaign: 'x240cities-v05', source_content: 'p85' },
    );
  });
});

describe('X mobile entry guide', () => {
  it('detects X source and x240cities campaign entries', () => {
    expect(isXMobileEntry('?utm_source=x')).toBe(true);
    expect(isXMobileEntry('?utm_campaign=x240cities-v05')).toBe(true);
    expect(isXMobileEntry('?utm_source=newsletter&utm_campaign=other')).toBe(false);
  });

  it('shows guide only for mobile X entry and dismisses it', () => {
    const guide = makeEl();
    const closeBtn = makeEl();
    setupElMap({ xMobileGuide: guide, xMobileGuideClose: closeBtn });
    globalThis.window.innerWidth = 390;
    globalThis.window.location = { search: '?utm_source=x&utm_campaign=x240cities-v05&utm_content=p85' };
    globalThis.window.shadowAnalytics = { track: vi.fn() };

    setupXMobileGuide();

    expect(guide.classList.remove).toHaveBeenCalledWith('hidden');
    expect(globalThis.window.shadowAnalytics.track).toHaveBeenCalledWith(
      'social_mobile_guide_view',
      { source: 'x', source_campaign: 'x240cities-v05', source_content: 'p85' },
    );
    const closeHandler = closeBtn.addEventListener.mock.calls.find(c => c[0] === 'click')[1];
    closeHandler();
    expect(guide.classList.add).toHaveBeenCalledWith('hidden');
    expect(globalThis.window.shadowAnalytics.track).toHaveBeenCalledWith(
      'social_mobile_guide_close',
      { source: 'x', source_campaign: 'x240cities-v05', source_content: 'p85' },
    );
  });

  it('keeps guide hidden on desktop even for X entry', () => {
    const guide = makeEl();
    setupElMap({ xMobileGuide: guide });
    globalThis.window.innerWidth = 1024;
    globalThis.window.location = { search: '?utm_campaign=x240cities-v05' };

    setupXMobileGuide();

    expect(guide.classList.remove).not.toHaveBeenCalled();
  });
});

// =========================================================
// setupViewControls callback invocations
// =========================================================
describe('setupViewControls callbacks', () => {
  let map;
  let elements;

  beforeEach(() => {
    state.orbiting = false;
    state.orbitTimer = null;
    map = {
      setPitch: vi.fn(),
      setBearing: vi.fn(),
      getBearing: vi.fn(() => 45),
      getPitch: vi.fn(() => 30),
      easeTo: vi.fn(),
      on: vi.fn(),
      getCenter: vi.fn(() => ({ lat: 35, lng: 139 })),
    };
    elements = {
      pitchRange: makeEl({ value: '30' }),
      bearingRange: makeEl({ value: '45' }),
      viewPresetRow: makeEl(),
    };
    setupElMap(elements);
    globalThis.window = { setInterval: vi.fn(() => 1), clearInterval: vi.fn() };
  });

  it('pitch input callback calls map.setPitch', () => {
    setupViewControls(map);
    const pitchCb = elements.pitchRange.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    elements.pitchRange.value = '55';
    pitchCb();
    expect(map.setPitch).toHaveBeenCalledWith(55);
  });

  it('bearing input callback calls map.setBearing', () => {
    setupViewControls(map);
    const bearingCb = elements.bearingRange.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    elements.bearingRange.value = '90';
    bearingCb();
    expect(map.setBearing).toHaveBeenCalledWith(90);
  });

  it('viewPresetRow click callback dispatches to applyViewPreset', () => {
    setupViewControls(map);
    const clickCb = elements.viewPresetRow.addEventListener.mock.calls.find(c => c[0] === 'click')[1];

    // Simulate click on a button with data-view attribute
    const btn = { dataset: { view: 'oblique' } };
    clickCb({ target: { closest: vi.fn(() => btn) } });
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: PITCH_OBLIQUE }));
  });

  it('viewPresetRow click callback does nothing if no button found', () => {
    setupViewControls(map);
    const clickCb = elements.viewPresetRow.addEventListener.mock.calls.find(c => c[0] === 'click')[1];
    clickCb({ target: { closest: vi.fn(() => null) } });
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('map rotate event updates bearingRange', () => {
    setupViewControls(map);
    const rotateCb = map.on.mock.calls.find(c => c[0] === 'rotate')[1];
    map.getBearing.mockReturnValue(180);
    rotateCb();
    expect(elements.bearingRange.value).toBe('180');
  });

  it('map pitch event updates pitchRange', () => {
    setupViewControls(map);
    const pitchCb = map.on.mock.calls.find(c => c[0] === 'pitch')[1];
    map.getPitch.mockReturnValue(60);
    pitchCb();
    expect(elements.pitchRange.value).toBe('60');
  });
});

// =========================================================
// startOrbit interval callback
// =========================================================
describe('startOrbit interval callback', () => {
  it('increments bearing on each tick', () => {
    let intervalCb;
    globalThis.window = {
      setInterval: vi.fn((cb) => { intervalCb = cb; return 42; }),
      clearInterval: vi.fn(),
    };
    state.orbiting = false;
    state.orbitTimer = null;

    const bearingRange = makeEl();
    setupElMap({ bearingRange });

    const map = {
      getCenter: () => ({ lat: 35, lng: 139 }),
      getBearing: vi.fn(() => 10),
      getPitch: () => 30,
      easeTo: vi.fn(),
    };

    startOrbit(map);
    expect(intervalCb).toBeDefined();

    intervalCb();
    // bearing starts at 10 (from getBearing mock) and increments by 2
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ bearing: 12 }));
  });
});

// =========================================================
// setupBasemapControls change callback
// =========================================================
describe('setupBasemapControls change callback', () => {
  it('invokes setBasemap on change', () => {
    state.playingDay = false;
    state.playDayTimer = null;
    globalThis.window = { clearInterval: vi.fn(), shadowAnalytics: { isEnabled: false, track: vi.fn() } };

    const select = makeEl({ value: 'bright' });
    const playDayBtn = makeEl();
    playDayBtn.classList = { toggle: vi.fn(), has: vi.fn(() => false) };
    setupElMap({ basemapSelect: select, playDayButton: playDayBtn });
    state.basemap = 'liberty';

    const map = { setStyle: vi.fn() };
    setupBasemapControls(map);

    const changeCb = select.addEventListener.mock.calls.find(c => c[0] === 'change')[1];
    changeCb();
    expect(map.setStyle).toHaveBeenCalled();
  });
});

// =========================================================
// setupPlateauToggle change/zoom callbacks
// =========================================================
describe('setupPlateauToggle callbacks', () => {
  it('change callback toggles plateau visibility', () => {
    const toggle = makeEl({ checked: true });
    const label = makeEl();
    const hint = makeEl();
    setupElMap({ plateauToggle: toggle, plateauLabel: label, plateauHint: hint });
    state.map = {
      getSource: vi.fn(() => null),
      queryRenderedFeatures: vi.fn(() => []),
      getLayer: vi.fn(() => false),
      setLayoutProperty: vi.fn(),
    };
    state.plateauVisible = true;
    state.selectedFeatureIds = new Set();
    state.terraInstance = null;

    const map = { on: vi.fn(), getLayer: vi.fn(() => false), setLayoutProperty: vi.fn() };
    setupPlateauToggle(map);

    const changeCb = toggle.addEventListener.mock.calls.find(c => c[0] === 'change')[1];
    toggle.checked = false;
    changeCb();
    expect(label.textContent).toBe('OFF');
  });

  it('zoom callback shows hint when below min zoom', () => {
    const toggle = makeEl({ checked: true });
    const hint = makeEl();
    setupElMap({ plateauToggle: toggle, plateauLabel: makeEl(), plateauHint: hint });

    const map = { on: vi.fn(), getZoom: vi.fn(() => PLATEAU_MIN_ZOOM - 1) };
    setupPlateauToggle(map);

    const zoomCb = map.on.mock.calls.find(c => c[0] === 'zoom')[1];
    zoomCb();
    expect(hint.classList.remove).toHaveBeenCalledWith('hidden');
  });

  it('zoom callback hides hint when at or above min zoom', () => {
    const toggle = makeEl({ checked: true });
    const hint = makeEl();
    setupElMap({ plateauToggle: toggle, plateauLabel: makeEl(), plateauHint: hint });

    const map = { on: vi.fn(), getZoom: vi.fn(() => PLATEAU_MIN_ZOOM) };
    setupPlateauToggle(map);

    const zoomCb = map.on.mock.calls.find(c => c[0] === 'zoom')[1];
    zoomCb();
    expect(hint.classList.add).toHaveBeenCalledWith('hidden');
  });
});

// =========================================================
// setupBasemapBuildingsToggle change callback
// =========================================================
describe('setupBasemapBuildingsToggle callback', () => {
  it('change callback updates building visibility', () => {
    const toggle = makeEl({ checked: true });
    const label = makeEl();
    setupElMap({ basemapBuildingsToggle: toggle, basemapBuildingsLabel: label });
    state.basemapBuildingsVisible = true;
    state.map = {
      getSource: vi.fn(() => null),
      queryRenderedFeatures: vi.fn(() => []),
      getLayer: vi.fn(() => false),
      setLayoutProperty: vi.fn(),
    };
    state.selectedFeatureIds = new Set();
    state.terraInstance = null;

    const map = {
      getLayer: vi.fn(() => true),
      setLayoutProperty: vi.fn(),
    };
    setupBasemapBuildingsToggle(map);

    const changeCb = toggle.addEventListener.mock.calls.find(c => c[0] === 'change')[1];
    toggle.checked = false;
    changeCb();

    expect(state.basemapBuildingsVisible).toBe(false);
    expect(map.setLayoutProperty).toHaveBeenCalledWith('building-3d', 'visibility', 'none');
    expect(label.textContent).toBe('OFF');
  });
});

// =========================================================
// setupPlateauPopup click callbacks
// =========================================================
describe('setupPlateauPopup callbacks', () => {
  let map;

  beforeEach(() => {
    map = { on: vi.fn(), getCanvas: () => ({ style: {} }) };
    state.activeMode = 'render';
    globalThis.maplibregl = {
      Popup: vi.fn(() => ({
        setLngLat: vi.fn().mockReturnThis(),
        setHTML: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
      })),
    };
    setupElMap({});
  });

  it('click on plateau-buildings shows popup in render mode', () => {
    setupPlateauPopup(map);
    const clickCb = map.on.mock.calls.find(c => c[0] === 'click' && c[1] === 'plateau-buildings')[2];
    clickCb({
      features: [{ properties: { measuredHeight: 30, usage: '住宅' } }],
      lngLat: { lng: 139, lat: 35 },
    });
    expect(globalThis.maplibregl.Popup).toHaveBeenCalled();
  });

  it('click is ignored when not in render mode', () => {
    state.activeMode = 'select';
    setupPlateauPopup(map);
    const clickCb = map.on.mock.calls.find(c => c[0] === 'click' && c[1] === 'plateau-buildings')[2];
    clickCb({ features: [{ properties: {} }], lngLat: {} });
    expect(globalThis.maplibregl.Popup).not.toHaveBeenCalled();
  });

  it('mouseenter sets pointer cursor in render mode', () => {
    const style = {};
    map.getCanvas = () => ({ style });
    setupPlateauPopup(map);
    const enterCb = map.on.mock.calls.find(c => c[0] === 'mouseenter' && c[1] === 'plateau-buildings')[2];
    enterCb();
    expect(style.cursor).toBe('pointer');
  });

  it('mouseleave resets cursor', () => {
    const style = { cursor: 'pointer' };
    map.getCanvas = () => ({ style });
    setupPlateauPopup(map);
    const leaveCb = map.on.mock.calls.find(c => c[0] === 'mouseleave' && c[1] === 'plateau-buildings')[2];
    leaveCb();
    expect(style.cursor).toBe('');
  });
});

// =========================================================
// setupBuildingControls callbacks
// =========================================================
describe('setupBuildingControls callbacks', () => {
  beforeEach(() => {
    state.uiHeight = DEFAULT_BUILDING_HEIGHT;
    state.uiFloors = DEFAULT_BUILDING_FLOORS;
    state.floorHeight = DEFAULT_FLOOR_HEIGHT;
    state.selectedFeatureIds = new Set();
    state.terraInstance = null;
    state.map = {
      getSource: vi.fn(() => null),
      queryRenderedFeatures: vi.fn(() => []),
    };
  });

  it('heightRange input syncs height', () => {
    const heightInput = makeEl({ value: '10' });
    const heightRange = makeEl({ value: '10' });
    const floorsInput = makeEl({ value: '3' });
    const floorsRange = makeEl({ value: '3' });
    const floorHeightInput = makeEl({ value: '3.1' });
    setupElMap({ heightInput, heightRange, floorsInput, floorsRange, floorHeightInput });

    setupBuildingControls();
    const cb = heightRange.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    cb({ target: { value: '25' } });
    expect(heightInput.value).toBe(String(state.uiHeight));
  });

  it('floorHeightInput input syncs floor height', () => {
    const heightInput = makeEl({ value: '10' });
    const heightRange = makeEl({ value: '10' });
    const floorsInput = makeEl({ value: '3' });
    const floorsRange = makeEl({ value: '3' });
    const floorHeightInput = makeEl({ value: '3.1' });
    setupElMap({ heightInput, heightRange, floorsInput, floorsRange, floorHeightInput });

    setupBuildingControls();
    const cb = floorHeightInput.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    floorHeightInput.value = '3.5';
    cb();
    expect(state.floorHeight).toBe(3.5);
  });

  it('floorsRange input syncs floors', () => {
    const heightInput = makeEl({ value: '10' });
    const heightRange = makeEl({ value: '10' });
    const floorsInput = makeEl({ value: '3' });
    const floorsRange = makeEl({ value: '3' });
    const floorHeightInput = makeEl({ value: '3.1' });
    setupElMap({ heightInput, heightRange, floorsInput, floorsRange, floorHeightInput });

    setupBuildingControls();
    const cb = floorsRange.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    cb({ target: { value: '5' } });
    expect(floorsInput.value).toBe('5');
  });
});

// =========================================================
// setupDateTimeControls callbacks
// =========================================================
describe('setupDateTimeControls callbacks', () => {
  let elements;

  beforeEach(() => {
    state.playingDay = false;
    state.playDayTimer = null;
    state.map = null;
    state.timezone = 'Asia/Tokyo';
    globalThis.window = { clearInterval: vi.fn(), setInterval: vi.fn(), shadowAnalytics: { isEnabled: false, track: vi.fn() } };
    globalThis.luxon = {
      DateTime: {
        now() { return { setZone() { return { toISODate() { return '2026-03-16'; } }; } }; },
      },
    };
    globalThis.SunCalc = {
      getTimes: () => ({ sunrise: new Date('2026-03-16T06:00:00Z'), sunset: new Date('2026-03-16T18:00:00Z') }),
    };

    elements = {
      timeRange: makeEl({ value: '720' }),
      timeInput: makeEl({ value: '12:00' }),
      dateInput: makeEl({ value: '2026-03-16' }),
      timezoneSelect: makeEl({ value: 'Asia/Tokyo' }),
      playDayButton: makeEl(),
    };
    elements.playDayButton.classList = { toggle: vi.fn(), has: vi.fn(() => false) };
    setupElMap(elements);
  });

  it('timeRange input callback stops play day and updates time', () => {
    setupDateTimeControls();
    const cb = elements.timeRange.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    elements.timeRange.value = '600';
    cb();
    expect(elements.timeInput.value).toBe('10:00');
  });

  it('timeInput input callback stops play day and updates range', () => {
    setupDateTimeControls();
    const cb = elements.timeInput.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    elements.timeInput.value = '14:30';
    cb();
    expect(elements.timeRange.value).toBe('870');
  });

  it('dateInput input callback updates time slider range', () => {
    setupDateTimeControls();
    const cb = elements.dateInput.addEventListener.mock.calls.find(c => c[0] === 'input')[1];
    cb();
    // Should not throw; map is null so updateTimeSliderRange returns early
    expect(state.playingDay).toBe(false);
  });

  it('timezoneSelect change callback reinitializes controls', () => {
    setupDateTimeControls();
    const cb = elements.timezoneSelect.addEventListener.mock.calls.find(c => c[0] === 'change')[1];
    elements.timezoneSelect.value = 'UTC';
    cb();
    expect(state.timezone).toBe('UTC');
  });
});

// =========================================================
// startPlayDay interval callback / setupPlayDay click callback
// =========================================================
describe('startPlayDay interval callback', () => {
  it('increments time range value on each tick', () => {
    let intervalCb;
    globalThis.window = {
      clearInterval: vi.fn(),
      setInterval: vi.fn((cb) => { intervalCb = cb; return 88; }),
    };

    const btn = makeEl();
    btn.classList = { toggle: vi.fn(), has: vi.fn(() => false) };
    const timeRange = makeEl({ value: '600' });
    timeRange.min = '300';
    timeRange.max = '1100';
    const timeInput = makeEl();
    setupElMap({ playDayButton: btn, timeRange, timeInput });

    state.playingDay = false;
    state.playDayTimer = null;

    startPlayDay();
    expect(intervalCb).toBeDefined();

    intervalCb();
    expect(Number(timeRange.value)).toBe(605);
    expect(timeInput.value).toBe('10:05');
  });

  it('wraps around when exceeding max', () => {
    let intervalCb;
    globalThis.window = {
      clearInterval: vi.fn(),
      setInterval: vi.fn((cb) => { intervalCb = cb; return 88; }),
    };

    const btn = makeEl();
    btn.classList = { toggle: vi.fn(), has: vi.fn(() => false) };
    const timeRange = makeEl({ value: '1098' });
    timeRange.min = '300';
    timeRange.max = '1100';
    const timeInput = makeEl();
    setupElMap({ playDayButton: btn, timeRange, timeInput });

    state.playingDay = false;
    state.playDayTimer = null;

    startPlayDay();
    intervalCb();
    // 1098 + 5 = 1103 > 1100 → wraps to 300
    expect(Number(timeRange.value)).toBe(300);
  });
});

describe('setupPlayDay click callback', () => {
  it('toggles play day on click', () => {
    globalThis.window = {
      clearInterval: vi.fn(),
      setInterval: vi.fn(() => 99),
    };

    const btn = makeEl();
    btn.classList = { toggle: vi.fn(), has: vi.fn(() => false) };
    const timeRange = makeEl({ value: '600' });
    timeRange.min = '300';
    timeRange.max = '1100';
    const timeInput = makeEl();
    setupElMap({ playDayButton: btn, timeRange, timeInput });

    state.playingDay = false;
    state.playDayTimer = null;

    setupPlayDay();
    const clickCb = btn.addEventListener.mock.calls.find(c => c[0] === 'click')[1];

    // First click starts play
    clickCb();
    expect(state.playingDay).toBe(true);

    // Second click stops
    clickCb();
    expect(state.playingDay).toBe(false);
  });
});

// =========================================================
// searchPlace edge: fetch throws
// =========================================================
describe('searchPlace error handling', () => {
  beforeEach(() => {
    globalThis.SunCalc = { getTimes: () => ({ sunrise: new Date(), sunset: new Date() }) };
    globalThis.luxon = {
      DateTime: { fromJSDate: () => ({ isValid: true, setZone: () => ({ isValid: true, hour: 6, minute: 0, toFormat: () => '6:00' }) }) },
    };
  });

  it('handles fetch error gracefully', async () => {
    const searchInput = makeInput('東京');
    globalThis.document = { getElementById: (id) => id === 'searchInput' ? searchInput : null };
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const map = { easeTo: vi.fn() };

    await searchPlace(map);
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('handles empty result array', async () => {
    const searchInput = makeInput('nowhere');
    globalThis.document = { getElementById: (id) => id === 'searchInput' ? searchInput : null };
    globalThis.fetch = vi.fn().mockResolvedValue({ json: async () => [] });
    const map = { easeTo: vi.fn() };

    await searchPlace(map);
    expect(map.easeTo).not.toHaveBeenCalled();
  });
});
