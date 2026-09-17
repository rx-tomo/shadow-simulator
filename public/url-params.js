// public/url-params.js — URLパラメータ共有機能（独立ESMモジュール）

import { el } from './state.js';
import { encodeMapState, decodeMapState } from './url-params-core.js';

// 純粋関数を re-export
export { encodeMapState, decodeMapState };

/**
 * デコード済みパラメータをmapとUIに適用する
 * @param {object} map - MapLibre GL JS map instance
 * @param {{ lat: number, lng: number, zoom: number, bearing: number, pitch: number, date: string|null, time: string|null, note: string|null }} decoded
 */
export function applyUrlParams(map, decoded) {
  if (!decoded) return;

  if (map) {
    map.jumpTo({
      center: [decoded.lng, decoded.lat],
      zoom: decoded.zoom,
      bearing: decoded.bearing,
      pitch: decoded.pitch,
    });
  }

  if (decoded.date) {
    const dateInput = el("dateInput");
    if (dateInput) dateInput.value = decoded.date;
  }

  if (decoded.time) {
    const timeInput = el("timeInput");
    if (timeInput) timeInput.value = decoded.time;
    // timeRangeも同期
    const [hh, mm] = decoded.time.split(":").map(Number);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      const timeRange = el("timeRange");
      if (timeRange) timeRange.value = String(hh * 60 + mm);
    }
  }

  const shareNoteInput = el("shareNoteInput");
  if (shareNoteInput) {
    shareNoteInput.value = decoded.note || "";
  }
}

/**
 * 現在のmap状態とUI日時からURLハッシュを更新する
 * @param {object} map - MapLibre GL JS map instance
 */
export function updateUrlFromState(map) {
  if (!map) return;

  const center = map.getCenter();
  const dateInput = el("dateInput");
  const timeInput = el("timeInput");
  const shareNoteInput = el("shareNoteInput");

  const hash = encodeMapState({
    lat: center.lat,
    lng: center.lng,
    zoom: map.getZoom(),
    bearing: Math.round(map.getBearing()),
    pitch: Math.round(map.getPitch()),
    date: dateInput ? dateInput.value : undefined,
    time: timeInput ? timeInput.value : undefined,
    note: shareNoteInput ? shareNoteInput.value : undefined,
  });

  if (hash) {
    history.replaceState(null, "", "#" + hash);
  }
}
