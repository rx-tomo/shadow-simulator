// public/calc.js — ブラウザ(グローバル) + Vitest(ESM) 両対応

/** @const {number} 地球赤道半径(m) — WGS84 */
const EARTH_RADIUS_M = 6378137;
/** @const {number} 影バッファ係数 — 安全マージン */
const SHADOW_BUFFER_COEFFICIENT = 1.3;
/** @const {number} 影バッファ最大値(m) */
const MAX_SHADOW_BUFFER_M = 2500;
/** @const {number} 緯度1度あたりのメートル */
const METERS_PER_DEGREE_LAT = 111320;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function destinationLngLat(lng, lat, bearingRad, distanceM) {
  const R = EARTH_RADIUS_M;
  const δ = distanceM / R;
  const θ = bearingRad;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

function polygonCentroid(ring) {
  if (!ring || ring.length === 0) return { lng: 0, lat: 0 };
  const first = ring[0];
  const last = ring[ring.length - 1];
  const coords =
    last && first && last[0] === first[0] && last[1] === first[1]
      ? ring.slice(0, -1)
      : ring.slice();
  const sum = coords.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return { lng: sum.lng / coords.length, lat: sum.lat / coords.length };
}

function convexHull(points) {
  if (points.length <= 1) return points;
  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  const cross = (o, a, b) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function calculateShadowBuffer(sunAltitudeRad, maxBuildingHeight) {
  if (sunAltitudeRad <= 0) return 0;
  const raw = (maxBuildingHeight / Math.tan(sunAltitudeRad)) * SHADOW_BUFFER_COEFFICIENT;
  return Math.min(raw, MAX_SHADOW_BUFFER_M);
}

function expandBounds(bounds, bufferMeters) {
  const latDeg = bufferMeters / METERS_PER_DEGREE_LAT;
  const midLat = (bounds.north + bounds.south) / 2;
  const lngDeg = bufferMeters / (METERS_PER_DEGREE_LAT * Math.cos((midLat * Math.PI) / 180));
  return {
    north: bounds.north + latDeg,
    south: bounds.south - latDeg,
    east: bounds.east + lngDeg,
    west: bounds.west - lngDeg,
  };
}

// ブラウザのグローバルスコープに公開（app.js から参照するため）
if (typeof window !== 'undefined') {
  window.clamp = clamp;
  window.round = round;
  window.destinationLngLat = destinationLngLat;
  window.polygonCentroid = polygonCentroid;
  window.convexHull = convexHull;
  window.calculateShadowBuffer = calculateShadowBuffer;
  window.expandBounds = expandBounds;
}

// ESM export for Vitest
export { clamp, round, destinationLngLat, polygonCentroid, convexHull, calculateShadowBuffer, expandBounds, EARTH_RADIUS_M, SHADOW_BUFFER_COEFFICIENT, MAX_SHADOW_BUFFER_M, METERS_PER_DEGREE_LAT };
