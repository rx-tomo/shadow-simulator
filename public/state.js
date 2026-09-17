// public/state.js — 共有状態・定数・ヘルパー（最下層モジュール）

export const MAPLIBRE_VERSION = "5.13.0";
export const APP_BUILD = "20260209-2";

// --- 建物デフォルト値 ---
/** @const {number} デフォルト階高(m) */
export const DEFAULT_FLOOR_HEIGHT = 3.1;
/** @const {number} デフォルト建物高さ(m) */
export const DEFAULT_BUILDING_HEIGHT = 6.2;
/** @const {number} デフォルト階数 */
export const DEFAULT_BUILDING_FLOORS = 2;

// --- 建物clamp範囲 ---
/** @const {number} 建物高さ最小値(m) */
export const MIN_BUILDING_HEIGHT = 1;
/** @const {number} 建物高さ最大値(m) */
export const MAX_BUILDING_HEIGHT = 500;
/** @const {number} 階数最小値 */
export const MIN_BUILDING_FLOORS = 1;
/** @const {number} 階数最大値 */
export const MAX_BUILDING_FLOORS = 100;
/** @const {number} 階高最小値(m) */
export const MIN_FLOOR_HEIGHT = 2.5;
/** @const {number} 階高最大値(m) */
export const MAX_FLOOR_HEIGHT = 5.0;

// --- PLATEAU関連 ---
/** @const {number} PLATEAUレイヤー最小ズームレベル */
export const PLATEAU_MIN_ZOOM = 14;
/** @const {number} PLATEAU高さ属性欠損時のデフォルト高さ(m) */
export const DEFAULT_PLATEAU_HEIGHT = 5;
/** @const {number} ベースマップ建物高さ属性欠損時のデフォルト高さ(m) */
export const DEFAULT_BASEMAP_HEIGHT = 10;
/** @const {number} 影計算の太陽高度閾値(rad) — これ未満は夜間扱い */
export const MIN_SUN_ALTITUDE_RAD = 0.001;
/** @const {number} フォールバック通知トースト自動消去時間(ms) */
export const FALLBACK_TOAST_DURATION_MS = 10000;
/** @const {number} ソースレイヤー検出タイムアウト(ms) */
export const SOURCE_LAYER_DETECT_TIMEOUT_MS = 5000;

// --- UI・時刻制御 ---
/** @const {number} TerraDraw座標精度（小数桁数） */
export const COORDINATE_PRECISION = 7;
/** @const {string} 初期表示時刻 */
export const DEFAULT_TIME = "12:00";
/** @const {number} 初期表示時刻（分換算） */
export const DEFAULT_TIME_MINUTES = 720;
/** @const {number} 時間レンジ最小値（分） — 0:00 */
export const MIN_TIME_MINUTES = 0;
/** @const {number} 時間レンジ最大値（分） — 23:59 */
export const MAX_TIME_MINUTES = 1439;
/** @const {number} 検索結果のデフォルトズームレベル */
export const SEARCH_RESULT_ZOOM = 17;
/** @const {number} 1日再生の分ステップ */
export const PLAY_DAY_STEP_MINUTES = 5;
/** @const {number} 1日再生のインターバル(ms) */
export const PLAY_DAY_INTERVAL_MS = 120;

// --- 地図初期ビュー ---
/** @const {[number, number]} 初期中心座標（東京駅） */
export const DEFAULT_CENTER = [139.767, 35.681];
/** @const {number} 初期ズームレベル */
export const DEFAULT_ZOOM = 16;
/** @const {number} 初期ピッチ(度) */
export const DEFAULT_PITCH = 55;
/** @const {number} トップビューのピッチ(度) */
export const PITCH_TOP = 0;
/** @const {number} 斜めビューのピッチ(度) */
export const PITCH_OBLIQUE = 30;
/** @const {number} ローアングルビューのピッチ(度) */
export const PITCH_LOW = 55;

// --- 建物カラー ---
/** @const {string} ベースマップ建物色 */
export const BASEMAP_BUILDING_COLOR = "#6b8caf";
/** @const {number} ベースマップ建物透過度 */
export const BASEMAP_BUILDING_OPACITY = 0.40;
/** @const {string} PLATEAUテーマ色 */
export const PLATEAU_THEME_COLOR = "#d97236";
/** @const {number} PLATEAUテーマ透過度 */
export const PLATEAU_THEME_OPACITY = 0.55;

/** @const {number} 影長キャップ(m) — 極低角度での過剰計算防止 */
export const MAX_SHADOW_LENGTH = 2000;
/** @const {number} 外部建物の影計算対象上限（高ズーム時） */
export const MAX_SHADOW_BUILDINGS = 3000;
/** @const {number} 外部建物影を計算する最小ズーム（これ未満は停止） */
export const EXTERNAL_SHADOW_MIN_ZOOM = 15;
/** @const {number} 中ズーム(16未満)の外部建物影計算上限 */
export const SHADOW_BUILDING_CAP_LOW_ZOOM = 720;
/** @const {number} 準高ズーム(17未満)の外部建物影計算上限 */
export const SHADOW_BUILDING_CAP_MID_ZOOM = 1500;

export const state = {
  floorHeight: DEFAULT_FLOOR_HEIGHT,
  defaultHeight: DEFAULT_BUILDING_HEIGHT,
  defaultFloors: DEFAULT_BUILDING_FLOORS,
  uiHeight: DEFAULT_BUILDING_HEIGHT,
  uiFloors: DEFAULT_BUILDING_FLOORS,
  selectedFeatureIds: new Set(),
  activeMode: "render", // render | select | angled-rectangle
  timezone: "Asia/Tokyo",
  orbiting: false,
  orbitTimer: null,
  playingDay: false,
  playDayTimer: null,
  basemap: "liberty",
  plateauVisible: true,
  basemapBuildingsVisible: true,
  plateauShadowCount: 0,
  plateauBuildingCount: 0,
  basemapShadowCount: 0,
  basemapBuildingCount: 0,
  plateauShadowTruncated: false,
  basemapShadowTruncated: false,
  externalShadowSuppressed: false,
  externalShadowCap: MAX_SHADOW_BUILDINGS,
  pmtilesRangeError: false,
  map: null,
  terraInstance: null,
};

export const BASEMAP_STYLES = {
  liberty: "https://tiles.openfreemap.org/styles/liberty",
  bright: "https://tiles.openfreemap.org/styles/bright",
};

export const el = (id) => document.getElementById(id);

// --- 循環依存回避のため、以下の関数もstate.jsに配置 ---

export function getCurrentDateTimeUtc() {
  const date = el("dateInput").value;
  const time = el("timeInput").value || "00:00";
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return luxon.DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: state.timezone }
  ).toUTC();
}

/**
 * TerraDraw のスナップショットからフットプリント（GeoJSON Feature配列）を取得する。
 * terraInstance 未初期化時や不正データ時は安全に空配列を返す。
 *
 * @returns {Array<{type: string, geometry: {type: string, coordinates: Array} | null, properties: Object, id?: string}>}
 *   GeoJSON Feature 配列。
 */
export function getFootprints() {
  const snapshot = state.terraInstance?.getSnapshot?.();
  if (!snapshot) return [];
  if (Array.isArray(snapshot)) return snapshot;
  if (typeof snapshot === 'object' && snapshot !== null) {
    if (Array.isArray(snapshot.features)) return snapshot.features;
    return [];
  }
  // 数値・文字列・boolean 等の非オブジェクト型は想定外
  console.warn('[getFootprints] unexpected snapshot type:', typeof snapshot);
  return [];
}

export function stopOrbit() {
  state.orbiting = false;
  if (state.orbitTimer) {
    window.clearInterval(state.orbitTimer);
    state.orbitTimer = null;
  }
}
