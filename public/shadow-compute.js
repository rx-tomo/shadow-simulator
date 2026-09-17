// public/shadow-compute.js — 影計算の純粋関数群（DOM/state非依存）
// Web Worker対応: calc.jsのみに依存し、全計算関数を自己完結で提供

import { clamp, round, destinationLngLat, polygonCentroid, convexHull, EARTH_RADIUS_M } from './calc.js';
import {
  MIN_BUILDING_HEIGHT,
  MAX_BUILDING_HEIGHT,
  MIN_BUILDING_FLOORS,
  MAX_BUILDING_FLOORS,
  MAX_SHADOW_LENGTH,
  MIN_SUN_ALTITUDE_RAD,
  DEFAULT_PLATEAU_HEIGHT,
  DEFAULT_BASEMAP_HEIGHT,
} from './state.js';

/**
 * ラジアンを [0, 2*PI) の範囲に正規化
 * @param {number} rad
 * @returns {number}
 */
export function normalizeRad(rad) {
  const t = rad % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

/**
 * 単一建物の影ジオメトリを計算する
 * @param {Array<[number,number]>} ring - 建物フットプリントの座標リング
 * @param {number} buildingHeight - 建物高さ(m)
 * @param {{ altitude: number, azimuth: number }} sunForUi - 太陽位置
 * @param {function} normalizeRadFn - ラジアン正規化関数
 * @returns {Object|null} GeoJSON Feature or null
 */
export function computeShadowForBuilding(ring, buildingHeight, sunForUi, normalizeRadFn) {
  const altitude = sunForUi.altitude;
  const azimuth = sunForUi.azimuth;
  if (altitude <= MIN_SUN_ALTITUDE_RAD) return null;

  const sunBearing = normalizeRadFn(azimuth + Math.PI);
  const shadowBearing = normalizeRadFn(sunBearing + Math.PI);
  const L = Math.min(buildingHeight / Math.tan(altitude), MAX_SHADOW_LENGTH);

  const first = ring[0];
  const last = ring[ring.length - 1];
  const base =
    last && first && last[0] === first[0] && last[1] === first[1]
      ? ring.slice(0, -1)
      : ring.slice();
  const shifted = base.map(([lng, lat]) =>
    destinationLngLat(lng, lat, shadowBearing, L)
  );

  const centroid = polygonCentroid(ring);
  const lat0 = (centroid.lat * Math.PI) / 180;
  const lng0 = centroid.lng;
  const toXY = ([lng, lat]) => {
    const x = ((lng - lng0) * Math.PI) / 180 * EARTH_RADIUS_M * Math.cos(lat0);
    const y = ((lat - centroid.lat) * Math.PI) / 180 * EARTH_RADIUS_M;
    return { lng, lat, x, y };
  };

  const pts = [...base, ...shifted].map(toXY);
  const hull = convexHull(pts);
  if (hull.length < 3) return null;
  const hullRing = hull.map((p) => [p.lng, p.lat]);
  hullRing.push(hullRing[0]);

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [hullRing] },
    properties: {
      height: buildingHeight,
      shadowLength: L,
      sunBearing,
      altitude,
    },
  };
}

/**
 * ジオメトリから座標リングを抽出
 * @param {Object} geometry - GeoJSON geometry
 * @returns {Array<Array<[number,number]>>}
 */
export function getGeometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates?.[0]].filter(Boolean);
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).map((c) => c?.[0]).filter(Boolean);
  }
  return [];
}

/**
 * リングの面積をm^2で計算
 * @param {Array<[number,number]>} ring
 * @returns {number}
 */
export function getRingAreaMetersSquared(ring) {
  if (!ring || ring.length < 3) return 0;
  const centroid = polygonCentroid(ring);
  const lat0 = (centroid.lat * Math.PI) / 180;
  let area = 0;
  const base =
    ring[0] && ring[ring.length - 1] &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice();
  if (base.length < 3) return 0;

  const toXY = ([lng, lat]) => {
    const x = ((lng - centroid.lng) * Math.PI) / 180 * EARTH_RADIUS_M * Math.cos(lat0);
    const y = ((lat - centroid.lat) * Math.PI) / 180 * EARTH_RADIUS_M;
    return { x, y };
  };
  const points = base.map(toXY);
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area) / 2;
}

/**
 * ジオメトリから最大面積のリングを取得
 * @param {Object} geometry - GeoJSON geometry
 * @returns {Array<[number,number]>|null}
 */
export function getPrimaryRing(geometry) {
  const rings = getGeometryRings(geometry);
  if (!rings.length) return null;
  let selected = rings[0];
  let maxArea = getRingAreaMetersSquared(selected);
  for (let i = 1; i < rings.length; i++) {
    const area = getRingAreaMetersSquared(rings[i]);
    if (area > maxArea) {
      selected = rings[i];
      maxArea = area;
    }
  }
  return selected;
}

/**
 * リングの重複排除キーを生成
 * @param {Array<[number,number]>} ring
 * @returns {string}
 */
export function getRingDedupeKey(ring) {
  const centroid = polygonCentroid(ring);
  const area = getRingAreaMetersSquared(ring);
  return `${round(centroid.lng, 7)}:${round(centroid.lat, 7)}:${round(area, 1)}`;
}

/**
 * PLATEAU建物の高さを属性フォールバックチェーンで取得
 * @param {Object} props - Feature properties
 * @returns {number}
 */
export function getPlateauHeight(props) {
  const measured = Number(props?.measuredHeight);
  if (measured > 0) return measured;
  const h = Number(props?.height);
  if (h > 0) return h;
  const z = Number(props?.z);
  if (z > 0) return z;
  return DEFAULT_PLATEAU_HEIGHT;
}

/**
 * ベースマップ建物の高さを属性フォールバックチェーンで取得
 * @param {Object} props - Feature properties
 * @param {number} [floorHeight=3.1] - 1階あたり高さ(m)
 * @returns {number}
 */
export function getBasemapHeight(props, floorHeight) {
  const fh = floorHeight || 3.1;
  const renderHeight = Number(props?.render_height);
  if (renderHeight > 0) return renderHeight;
  const h = Number(props?.height);
  if (h > 0) return h;
  const levels = Number(props?.["building:levels"] || props?.levels);
  if (levels > 0) return levels * fh;
  return DEFAULT_BASEMAP_HEIGHT;
}

/**
 * ユーザー建物の影を計算する純粋関数
 * @param {Array} features - Polygon型のGeoJSON Feature配列
 * @param {{ altitude: number, azimuth: number }} sunForUi - 太陽位置
 * @param {number} defaultHeight - 高さ未指定時のデフォルト (m)
 * @param {number} floorHeight - 1階あたり高さ (m)
 * @returns {{ shadows: Array, maxShadow: number }}
 */
export function computeUserBuildingShadows(features, sunForUi, defaultHeight, floorHeight) {
  const shadows = [];
  let maxShadow = 0;

  for (const f of features) {
    const ring = f.geometry.coordinates[0];
    const buildingHeight = Number.isFinite(Number(f.properties?.height))
      ? clamp(Number(f.properties?.height), MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT)
      : defaultHeight;

    const shadow = computeShadowForBuilding(ring, buildingHeight, sunForUi, normalizeRad);
    if (shadow) {
      shadow.properties.floors = Number(f.properties?.floors) || clamp(Math.round(buildingHeight / floorHeight), MIN_BUILDING_FLOORS, MAX_BUILDING_FLOORS);
      shadow.properties.source = "user";
      shadows.push(shadow);
      maxShadow = Math.max(maxShadow, shadow.properties.shadowLength);
    }
  }

  return { shadows, maxShadow };
}

/**
 * PLATEAU建物の影を計算する純粋関数
 * @param {Array} features - queryRenderedFeatures結果（Polygon/MultiPolygon）
 * @param {{ altitude: number, azimuth: number }} sunForUi - 太陽位置
 * @returns {{ shadows: Array, plateauBuildingCount: number, plateauShadowCount: number, maxShadow: number, maxPlateauHeight: number, plateauRingKeys: Set }}
 */
export function computePlateauShadows(features, sunForUi) {
  const shadows = [];
  let plateauShadowCount = 0;
  let maxPlateauHeight = 0;
  let maxShadow = 0;
  const plateauRingKeys = new Set();

  for (const pf of features) {
    const ring = getPrimaryRing(pf.geometry);
    if (!ring || ring.length < 3) continue;
    const ringKey = getRingDedupeKey(ring);
    if (plateauRingKeys.has(ringKey)) continue;
    plateauRingKeys.add(ringKey);

    const height = getPlateauHeight(pf.properties);
    if (height > maxPlateauHeight) maxPlateauHeight = height;

    const shadow = computeShadowForBuilding(ring, height, sunForUi, normalizeRad);
    if (!shadow) continue;
    shadow.properties.source = "plateau";
    shadows.push(shadow);
    maxShadow = Math.max(maxShadow, shadow.properties.shadowLength);
    plateauShadowCount++;
  }

  return {
    shadows,
    plateauBuildingCount: plateauRingKeys.size,
    plateauShadowCount,
    maxShadow,
    maxPlateauHeight,
    plateauRingKeys,
  };
}

/**
 * ベースマップ建物の影を計算する純粋関数
 * @param {Array} features - queryRenderedFeatures結果（Polygon/MultiPolygon）
 * @param {{ altitude: number, azimuth: number }} sunForUi - 太陽位置
 * @param {Set} plateauRingKeys - PLATEAU建物と重複排除するためのキーセット
 * @param {number} [floorHeight=3.1] - 1階あたり高さ(m)
 * @returns {{ shadows: Array, basemapBuildingCount: number, basemapShadowCount: number, maxShadow: number }}
 */
export function computeBasemapShadows(features, sunForUi, plateauRingKeys, floorHeight) {
  const shadows = [];
  let basemapShadowCount = 0;
  let maxShadow = 0;
  const basemapRingKeys = new Set();

  for (const bf of features) {
    const ring = getPrimaryRing(bf.geometry);
    if (!ring || ring.length < 3) continue;
    const key = getRingDedupeKey(ring);
    if (plateauRingKeys.has(key)) continue;
    if (basemapRingKeys.has(key)) continue;
    basemapRingKeys.add(key);

    const height = getBasemapHeight(bf.properties, floorHeight);

    const shadow = computeShadowForBuilding(ring, height, sunForUi, normalizeRad);
    if (!shadow) continue;
    shadow.properties.source = "basemap";
    shadows.push(shadow);
    maxShadow = Math.max(maxShadow, shadow.properties.shadowLength);
    basemapShadowCount++;
  }

  return {
    shadows,
    basemapBuildingCount: basemapRingKeys.size,
    basemapShadowCount,
    maxShadow,
  };
}
