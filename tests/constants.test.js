import { describe, it, expect } from 'vitest';
import {
  // 既存定数
  MAX_SHADOW_LENGTH,
  MAX_SHADOW_BUILDINGS,
  BASEMAP_STYLES,
  MAPLIBRE_VERSION,
  APP_BUILD,
  // 新規定数 — Phase 20 T-009
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_BUILDING_HEIGHT,
  DEFAULT_BUILDING_FLOORS,
  PLATEAU_MIN_ZOOM,
  EXTERNAL_SHADOW_MIN_ZOOM,
  SHADOW_BUILDING_CAP_LOW_ZOOM,
  SHADOW_BUILDING_CAP_MID_ZOOM,
  DEFAULT_PLATEAU_HEIGHT,
  DEFAULT_BASEMAP_HEIGHT,
  MIN_SUN_ALTITUDE_RAD,
  FALLBACK_TOAST_DURATION_MS,
  SOURCE_LAYER_DETECT_TIMEOUT_MS,
  MIN_BUILDING_HEIGHT,
  MAX_BUILDING_HEIGHT,
  MIN_BUILDING_FLOORS,
  MAX_BUILDING_FLOORS,
  COORDINATE_PRECISION,
  MIN_FLOOR_HEIGHT,
  MAX_FLOOR_HEIGHT,
  DEFAULT_TIME,
  DEFAULT_TIME_MINUTES,
  MIN_TIME_MINUTES,
  MAX_TIME_MINUTES,
  SEARCH_RESULT_ZOOM,
  PLAY_DAY_STEP_MINUTES,
  PLAY_DAY_INTERVAL_MS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  BASEMAP_BUILDING_COLOR,
  BASEMAP_BUILDING_OPACITY,
  PLATEAU_THEME_COLOR,
  PLATEAU_THEME_OPACITY,
  PITCH_TOP,
  PITCH_OBLIQUE,
  PITCH_LOW,
} from '../public/state.js';

import {
  EARTH_RADIUS_M,
  SHADOW_BUFFER_COEFFICIENT,
  MAX_SHADOW_BUFFER_M,
  METERS_PER_DEGREE_LAT,
} from '../public/calc.js';

// =========================================================
// 1. 既存定数の確認（回帰テスト）
// =========================================================
describe('既存定数（回帰テスト）', () => {
  it('MAX_SHADOW_LENGTH が 2000', () => {
    expect(MAX_SHADOW_LENGTH).toBe(2000);
  });

  it('MAX_SHADOW_BUILDINGS が 3000', () => {
    expect(MAX_SHADOW_BUILDINGS).toBe(3000);
  });

  it('BASEMAP_STYLES に liberty と bright が存在', () => {
    expect(BASEMAP_STYLES).toHaveProperty('liberty');
    expect(BASEMAP_STYLES).toHaveProperty('bright');
    expect(typeof BASEMAP_STYLES.liberty).toBe('string');
    expect(typeof BASEMAP_STYLES.bright).toBe('string');
  });

  it('MAPLIBRE_VERSION が文字列', () => {
    expect(typeof MAPLIBRE_VERSION).toBe('string');
    expect(MAPLIBRE_VERSION.length).toBeGreaterThan(0);
  });

  it('APP_BUILD が文字列', () => {
    expect(typeof APP_BUILD).toBe('string');
    expect(APP_BUILD.length).toBeGreaterThan(0);
  });
});

// =========================================================
// 2. state.js 新規定数（建物デフォルト値）
// =========================================================
describe('建物デフォルト定数', () => {
  it('DEFAULT_FLOOR_HEIGHT が 3.1', () => {
    expect(DEFAULT_FLOOR_HEIGHT).toBe(3.1);
  });

  it('DEFAULT_BUILDING_HEIGHT が 6.2', () => {
    expect(DEFAULT_BUILDING_HEIGHT).toBe(6.2);
  });

  it('DEFAULT_BUILDING_FLOORS が 2', () => {
    expect(DEFAULT_BUILDING_FLOORS).toBe(2);
  });

  it('DEFAULT_BUILDING_HEIGHT === DEFAULT_FLOOR_HEIGHT * DEFAULT_BUILDING_FLOORS', () => {
    expect(DEFAULT_BUILDING_HEIGHT).toBe(DEFAULT_FLOOR_HEIGHT * DEFAULT_BUILDING_FLOORS);
  });
});

// =========================================================
// 3. state.js 新規定数（建物範囲）
// =========================================================
describe('建物clamp範囲定数', () => {
  it('MIN_BUILDING_HEIGHT が 1', () => {
    expect(MIN_BUILDING_HEIGHT).toBe(1);
  });

  it('MAX_BUILDING_HEIGHT が 500', () => {
    expect(MAX_BUILDING_HEIGHT).toBe(500);
  });

  it('MIN_BUILDING_FLOORS が 1', () => {
    expect(MIN_BUILDING_FLOORS).toBe(1);
  });

  it('MAX_BUILDING_FLOORS が 100', () => {
    expect(MAX_BUILDING_FLOORS).toBe(100);
  });

  it('MIN_FLOOR_HEIGHT が 2.5', () => {
    expect(MIN_FLOOR_HEIGHT).toBe(2.5);
  });

  it('MAX_FLOOR_HEIGHT が 5.0', () => {
    expect(MAX_FLOOR_HEIGHT).toBe(5.0);
  });
});

// =========================================================
// 4. state.js 新規定数（PLATEAU関連）
// =========================================================
describe('PLATEAU関連定数', () => {
  it('PLATEAU_MIN_ZOOM が 14', () => {
    expect(PLATEAU_MIN_ZOOM).toBe(14);
  });

  it('EXTERNAL_SHADOW_MIN_ZOOM が 15', () => {
    expect(EXTERNAL_SHADOW_MIN_ZOOM).toBe(15);
  });

  it('SHADOW_BUILDING_CAP_LOW_ZOOM が 720', () => {
    expect(SHADOW_BUILDING_CAP_LOW_ZOOM).toBe(720);
  });

  it('SHADOW_BUILDING_CAP_MID_ZOOM が 1500', () => {
    expect(SHADOW_BUILDING_CAP_MID_ZOOM).toBe(1500);
  });

  it('DEFAULT_PLATEAU_HEIGHT が 5', () => {
    expect(DEFAULT_PLATEAU_HEIGHT).toBe(5);
  });

  it('DEFAULT_BASEMAP_HEIGHT が 10', () => {
    expect(DEFAULT_BASEMAP_HEIGHT).toBe(10);
  });

  it('MIN_SUN_ALTITUDE_RAD が 0.001', () => {
    expect(MIN_SUN_ALTITUDE_RAD).toBe(0.001);
  });

  it('FALLBACK_TOAST_DURATION_MS が 10000', () => {
    expect(FALLBACK_TOAST_DURATION_MS).toBe(10000);
  });

  it('SOURCE_LAYER_DETECT_TIMEOUT_MS が 5000', () => {
    expect(SOURCE_LAYER_DETECT_TIMEOUT_MS).toBe(5000);
  });
});

// =========================================================
// 5. state.js 新規定数（UI・時刻制御）
// =========================================================
describe('UI・時刻制御定数', () => {
  it('COORDINATE_PRECISION が 7', () => {
    expect(COORDINATE_PRECISION).toBe(7);
  });

  it('DEFAULT_TIME が "12:00"', () => {
    expect(DEFAULT_TIME).toBe("12:00");
  });

  it('DEFAULT_TIME_MINUTES が 720（12 * 60）', () => {
    expect(DEFAULT_TIME_MINUTES).toBe(720);
  });

  it('MIN_TIME_MINUTES が 0', () => {
    expect(MIN_TIME_MINUTES).toBe(0);
  });

  it('MAX_TIME_MINUTES が 1439（23 * 60 + 59）', () => {
    expect(MAX_TIME_MINUTES).toBe(1439);
  });

  it('SEARCH_RESULT_ZOOM が 17', () => {
    expect(SEARCH_RESULT_ZOOM).toBe(17);
  });

  it('PLAY_DAY_STEP_MINUTES が 5', () => {
    expect(PLAY_DAY_STEP_MINUTES).toBe(5);
  });

  it('PLAY_DAY_INTERVAL_MS が 120', () => {
    expect(PLAY_DAY_INTERVAL_MS).toBe(120);
  });
});

// =========================================================
// 6. state.js 新規定数（地図初期ビュー）
// =========================================================
describe('地図初期ビュー定数', () => {
  it('DEFAULT_CENTER が [139.767, 35.681]（東京駅）', () => {
    expect(DEFAULT_CENTER).toEqual([139.767, 35.681]);
  });

  it('DEFAULT_ZOOM が 16', () => {
    expect(DEFAULT_ZOOM).toBe(16);
  });

  it('DEFAULT_PITCH が 55', () => {
    expect(DEFAULT_PITCH).toBe(55);
  });

  it('PITCH_TOP が 0', () => {
    expect(PITCH_TOP).toBe(0);
  });

  it('PITCH_OBLIQUE が 30', () => {
    expect(PITCH_OBLIQUE).toBe(30);
  });

  it('PITCH_LOW が 55', () => {
    expect(PITCH_LOW).toBe(55);
  });
});

// =========================================================
// 7. state.js 新規定数（建物カラー）
// =========================================================
describe('建物カラー定数', () => {
  it('BASEMAP_BUILDING_COLOR がCSS色文字列', () => {
    expect(BASEMAP_BUILDING_COLOR).toBe("#6b8caf");
  });

  it('BASEMAP_BUILDING_OPACITY が 0.40', () => {
    expect(BASEMAP_BUILDING_OPACITY).toBe(0.40);
  });

  it('PLATEAU_THEME_COLOR がCSS色文字列', () => {
    expect(PLATEAU_THEME_COLOR).toBe("#d97236");
  });

  it('PLATEAU_THEME_OPACITY が 0.55', () => {
    expect(PLATEAU_THEME_OPACITY).toBe(0.55);
  });
});

// =========================================================
// 8. calc.js ローカル定数
// =========================================================
describe('calc.js ローカル定数', () => {
  it('EARTH_RADIUS_M が 6378137', () => {
    expect(EARTH_RADIUS_M).toBe(6378137);
  });

  it('SHADOW_BUFFER_COEFFICIENT が 1.3', () => {
    expect(SHADOW_BUFFER_COEFFICIENT).toBe(1.3);
  });

  it('MAX_SHADOW_BUFFER_M が 2500', () => {
    expect(MAX_SHADOW_BUFFER_M).toBe(2500);
  });

  it('METERS_PER_DEGREE_LAT が 111320', () => {
    expect(METERS_PER_DEGREE_LAT).toBe(111320);
  });
});
