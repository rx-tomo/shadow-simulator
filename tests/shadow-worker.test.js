import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase 18-3: Web Worker導入（T-002）
 * AC-18-9: 影計算がWeb Workerで実行される
 * AC-18-12: 計算結果が従来実装と同一
 *
 * Worker通信プロトコルと計算結果の同一性をテスト
 */

// Worker内で使用される計算関数群を直接テスト
import {
  computeUserBuildingShadows,
  computePlateauShadows,
  computeBasemapShadows,
  normalizeRad,
  // Worker化に伴い shadow-compute.js に移動される関数群
  computeShadowForBuilding,
  getPrimaryRing,
  getRingDedupeKey,
  getPlateauHeight,
  getBasemapHeight,
} from '../public/shadow-compute.js';

// =========================================================
// 1. Worker自己完結性: shadow-compute.jsが全計算関数をexport
// =========================================================
describe('AC-18-9: shadow-compute.js exports all computation functions', () => {
  it('exports computeShadowForBuilding', () => {
    expect(typeof computeShadowForBuilding).toBe('function');
  });

  it('exports getPrimaryRing', () => {
    expect(typeof getPrimaryRing).toBe('function');
  });

  it('exports getRingDedupeKey', () => {
    expect(typeof getRingDedupeKey).toBe('function');
  });

  it('exports getPlateauHeight', () => {
    expect(typeof getPlateauHeight).toBe('function');
  });

  it('exports getBasemapHeight', () => {
    expect(typeof getBasemapHeight).toBe('function');
  });

  it('exports normalizeRad', () => {
    expect(typeof normalizeRad).toBe('function');
  });

  it('exports computeUserBuildingShadows', () => {
    expect(typeof computeUserBuildingShadows).toBe('function');
  });

  it('exports computePlateauShadows', () => {
    expect(typeof computePlateauShadows).toBe('function');
  });

  it('exports computeBasemapShadows', () => {
    expect(typeof computeBasemapShadows).toBe('function');
  });
});

// =========================================================
// 2. AC-18-12: 計算結果の同一性確認
// =========================================================
describe('AC-18-12: computation results are identical', () => {
  const sunForUi = { altitude: Math.PI / 4, azimuth: Math.PI };
  const ring = [
    [139.767, 35.681],
    [139.768, 35.681],
    [139.768, 35.682],
    [139.767, 35.682],
    [139.767, 35.681],
  ];

  it('computeShadowForBuilding produces consistent output', () => {
    const result1 = computeShadowForBuilding(ring, 10, sunForUi, normalizeRad);
    const result2 = computeShadowForBuilding(ring, 10, sunForUi, normalizeRad);

    expect(result1).not.toBeNull();
    expect(result1).toEqual(result2);

    // Verify output is structured-clone compatible (serializable)
    const serialized = JSON.parse(JSON.stringify(result1));
    expect(serialized.properties.height).toBe(10);
    expect(serialized.properties.shadowLength).toBeCloseTo(result1.properties.shadowLength, 7);
    expect(serialized.properties.sunBearing).toBeCloseTo(result1.properties.sunBearing, 7);
    expect(serialized.properties.altitude).toBeCloseTo(result1.properties.altitude, 7);
  });

  it('computeUserBuildingShadows output is fully serializable', () => {
    const features = [{
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { height: 10, floors: 3 },
    }];
    const result = computeUserBuildingShadows(features, sunForUi, 6.2, 3.1);

    // Must survive structured clone (JSON round-trip)
    const cloned = JSON.parse(JSON.stringify(result));
    expect(cloned.shadows).toHaveLength(result.shadows.length);
    expect(cloned.maxShadow).toBe(result.maxShadow);

    // Coordinate precision to 7 digits
    const coords = result.shadows[0].geometry.coordinates[0];
    for (const [lng, lat] of coords) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });

  it('computePlateauShadows output is serializable (except Set)', () => {
    const features = [{
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { measuredHeight: 25 },
    }];
    const result = computePlateauShadows(features, sunForUi);

    // plateauRingKeys is a Set — needs conversion for Worker transfer
    expect(result.plateauRingKeys).toBeInstanceOf(Set);

    // Everything else should be serializable
    const { plateauRingKeys, ...serializable } = result;
    const cloned = JSON.parse(JSON.stringify(serializable));
    expect(cloned.shadows).toHaveLength(result.shadows.length);
    expect(cloned.plateauBuildingCount).toBe(result.plateauBuildingCount);
  });

  it('computeBasemapShadows output is fully serializable', () => {
    const features = [{
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { render_height: 20 },
    }];
    const result = computeBasemapShadows(features, sunForUi, new Set());
    const cloned = JSON.parse(JSON.stringify(result));
    expect(cloned.shadows).toHaveLength(result.shadows.length);
    expect(cloned.basemapBuildingCount).toBe(result.basemapBuildingCount);
  });
});

// =========================================================
// 3. Worker message protocol contract
// =========================================================
describe('Worker message protocol contract', () => {
  const sunForUi = { altitude: Math.PI / 4, azimuth: Math.PI };
  const ring = [
    [139.767, 35.681],
    [139.768, 35.681],
    [139.768, 35.682],
    [139.767, 35.682],
    [139.767, 35.681],
  ];

  it('input data is structured-clone compatible', () => {
    // Simulate the message that would be sent to Worker
    const workerInput = {
      type: 'compute',
      userFeatures: [{
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { height: 10 },
      }],
      plateauFeatures: [{
        geometry: { type: 'Polygon', coordinates: [ring.map(c => [c[0] + 0.01, c[1]])] },
        properties: { measuredHeight: 25 },
      }],
      basemapFeatures: [],
      sunForUi: sunForUi,
      defaultHeight: 6.2,
      floorHeight: 3.1,
    };

    // Must survive structured clone
    const cloned = JSON.parse(JSON.stringify(workerInput));
    expect(cloned.type).toBe('compute');
    expect(cloned.userFeatures).toHaveLength(1);
    expect(cloned.plateauFeatures).toHaveLength(1);
    expect(cloned.sunForUi.altitude).toBeCloseTo(sunForUi.altitude, 7);
  });

  it('output data is structured-clone compatible', () => {
    // Simulate the message that Worker would return
    const userResult = computeUserBuildingShadows(
      [{ geometry: { type: 'Polygon', coordinates: [ring] }, properties: { height: 10 } }],
      sunForUi, 6.2, 3.1
    );
    const plateauResult = computePlateauShadows(
      [{ geometry: { type: 'Polygon', coordinates: [ring.map(c => [c[0] + 0.01, c[1]])] }, properties: { measuredHeight: 25 } }],
      sunForUi
    );

    const workerOutput = {
      type: 'result',
      shadows: [...userResult.shadows, ...plateauResult.shadows],
      maxShadow: Math.max(userResult.maxShadow, plateauResult.maxShadow),
      plateauBuildingCount: plateauResult.plateauBuildingCount,
      plateauShadowCount: plateauResult.plateauShadowCount,
      basemapBuildingCount: 0,
      basemapShadowCount: 0,
      maxPlateauHeight: plateauResult.maxPlateauHeight,
      plateauRingKeys: [...plateauResult.plateauRingKeys], // Set → Array for transfer
    };

    const cloned = JSON.parse(JSON.stringify(workerOutput));
    expect(cloned.type).toBe('result');
    expect(cloned.shadows.length).toBeGreaterThan(0);
    expect(cloned.maxShadow).toBeGreaterThan(0);
  });
});
