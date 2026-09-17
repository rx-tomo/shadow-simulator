// public/url-params-core.js — URLパラメータ encode/decode 純粋関数（依存なし）

/**
 * Map状態をURLSearchParams文字列にエンコードする
 * @param {{ lat?: number, lng?: number, zoom?: number, bearing?: number, pitch?: number, date?: string, time?: string, note?: string }} params
 * @returns {string} URLSearchParams形式の文字列
 */
export function encodeMapState({ lat, lng, zoom, bearing, pitch, date, time, note }) {
  const params = new URLSearchParams();
  if (lat != null) params.set("lat", lat.toFixed(6));
  if (lng != null) params.set("lng", lng.toFixed(6));
  if (zoom != null) params.set("z", zoom.toFixed(1));
  if (Number.isFinite(bearing) && bearing !== 0) params.set("b", String(Math.round(bearing)));
  if (Number.isFinite(pitch) && pitch !== 0) params.set("p", String(Math.round(pitch)));
  if (date) params.set("d", date);
  if (time) params.set("t", time);
  const normalizedNote = normalizeShareNote(note);
  if (normalizedNote) params.set("n", normalizedNote);
  return params.toString();
}

function normalizeShareNote(note) {
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

/**
 * URLハッシュ文字列からMap状態をデコードする
 * @param {string} hash - "#lat=35.68&lng=139.77&z=16" 形式（先頭#あり/なし両対応）
 * @returns {{ lat: number, lng: number, zoom: number, bearing: number, pitch: number, date: string|null, time: string|null, note: string|null } | null}
 */
export function decodeMapState(hash) {
  if (!hash) return null;
  const cleaned = hash.replace(/^#/, "");
  if (!cleaned) return null;

  const params = new URLSearchParams(cleaned);

  // lat, lng, z は必須
  const latStr = params.get("lat");
  const lngStr = params.get("lng");
  const zStr = params.get("z");
  if (!latStr || !lngStr || !zStr) return null;

  const lat = Number(latStr);
  const lng = Number(lngStr);
  const zoom = Number(zStr);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 22) return null;

  // bearing, pitch はオプション（デフォルト0）
  let bearing = 0;
  if (params.has("b")) {
    bearing = Number(params.get("b"));
    if (!Number.isFinite(bearing) || bearing < -180 || bearing > 180) return null;
  }

  let pitch = 0;
  if (params.has("p")) {
    pitch = Number(params.get("p"));
    if (!Number.isFinite(pitch) || pitch < 0 || pitch > 85) return null;
  }

  // date, time はオプション
  const date = params.get("d") || null;
  const time = params.get("t") || null;
  const note = normalizeShareNote(params.get("n"));

  // date形式バリデーション + セマンティックバリデーション
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [, , mo, da] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    if (!mo || +mo < 1 || +mo > 12 || +da < 1 || +da > 31) return null;
  }
  // time形式バリデーション + セマンティックバリデーション
  if (time) {
    if (!/^\d{2}:\d{2}$/.test(time)) return null;
    const [hh, mi] = time.split(":").map(Number);
    if (hh < 0 || hh > 23 || mi < 0 || mi > 59) return null;
  }

  return { lat, lng, zoom, bearing, pitch, date, time, note };
}
