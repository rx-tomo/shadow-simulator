import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const controls = new Map();
vi.mock('../public/state.js', () => ({
  state: { timezone: 'Asia/Tokyo' },
  el: (id) => controls.get(id),
  getFootprints: () => [],
}));
vi.mock('../public/url-params.js', () => ({ updateUrlFromState: vi.fn() }));

function control(value = '') {
  return {
    value, textContent: '', handlers: {},
    addEventListener(name, handler) { this.handlers[name] = handler; },
    classList: { add: vi.fn(), remove: vi.fn() },
    replaceChildren: vi.fn(), appendChild: vi.fn(),
  };
}

describe('comparison save and copy outcomes', () => {
  let ui;
  let store;
  let track;
  const map = { getCenter: () => ({ lat: 35.6812, lng: 139.7671 }), getZoom: () => 16 };

  beforeEach(async () => {
    vi.resetModules();
    controls.clear();
    for (const id of ['saveComparisonButton', 'copyComparisonReportButton', 'clearComparisonButton',
      'comparisonStatus', 'comparisonReportCard', 'comparisonReportSummary', 'comparisonReportDiffs',
      'comparisonReportUpdated', 'reportLabelInput', 'shareNoteInput', 'dateInput', 'timeInput']) {
      controls.set(id, control());
    }
    controls.get('reportLabelInput').value = 'private-label';
    controls.get('shareNoteInput').value = 'private-note';
    controls.get('dateInput').value = '2026-12-22';
    controls.get('timeInput').value = '09:00';
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => store.get(key) ?? null,
      setItem: vi.fn((key, value) => store.set(key, value)),
      removeItem: (key) => store.delete(key),
    });
    track = vi.fn();
    vi.stubGlobal('window', { shadowAnalytics: { track } });
    vi.stubGlobal('location', {
      origin: 'https://shadow.datagen-pro.com', pathname: '/',
      href: 'https://shadow.datagen-pro.com/?address=private-address#lat=35.6812&lng=139.7671',
    });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue() } });
    vi.stubGlobal('document', { createElement: () => control() });
    ui = await import('../public/pro-features-ui.js');
    ui.bindProFeatureControls(map);
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('tracks one explicit successful save, without private snapshot data or URL parameters', () => {
    controls.get('saveComparisonButton').handlers.click();
    expect(store.size).toBe(1);
    expect(controls.get('comparisonStatus').textContent).toBe('比較元を保存しました。');
    expect(track.mock.calls).toEqual([['comparison_baseline_save', {
      page_location: 'https://shadow.datagen-pro.com/',
    }]]);
    ui.refreshProFeatures(map);
    ui.refreshProFeatures(map);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('does not report success or replace the previous baseline when storage fails', () => {
    expect(ui.saveComparisonBaseline({ label: 'previous-baseline' })).toBe(true);
    localStorage.setItem.mockImplementation(() => { throw new Error('private-error'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    controls.get('saveComparisonButton').handlers.click();
    expect(track).not.toHaveBeenCalled();
    expect(controls.get('comparisonStatus').textContent).toContain('保存できませんでした');
    expect(ui.renderComparisonReport(map)).toContain('previous-baseline');
    expect(console.warn.mock.calls.flat().join(' ')).not.toContain('private-error');
  });

  it('counts copy only after clipboard success; missing baseline and rejection do not count', async () => {
    const copy = controls.get('copyComparisonReportButton').handlers.click;
    await copy();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    ui.saveComparisonBaseline({ label: 'saved' });
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await copy();
    expect(track).not.toHaveBeenCalled();
    await copy();
    expect(track.mock.calls).toEqual([['comparison_report_copy', {
      page_location: 'https://shadow.datagen-pro.com/',
    }]]);
  });
});
