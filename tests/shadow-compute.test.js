import { describe, it, expect } from 'vitest';
import {
  computeUserBuildingShadows,
  computePlateauShadows,
  computeBasemapShadows,
  normalizeRad,
  getGeometryRings,
  getPrimaryRing as getPrimaryRingSC,
} from '../public/shadow-compute.js';
import { computeShadowForBuilding, getPlateauHeight, getBasemapHeight, getRingDedupeKey, getPrimaryRing } from '../public/shadow-ui.js';

// =========================================================
// 0. normalizeRad — 共通ユーティリティ
// =========================================================
describe('normalizeRad', () => {
  it('returns 0 for 0', () => {
    expect(normalizeRad(0)).toBe(0);
  });
  it('normalizes 2*PI to 0', () => {
    expect(normalizeRad(2 * Math.PI)).toBeCloseTo(0, 10);
  });
  it('normalizes negative radian to positive', () => {
    const result = normalizeRad(-Math.PI / 2);
    expect(result).toBeCloseTo(1.5 * Math.PI, 10);
  });
  it('normalizes 3*PI to PI', () => {
    expect(normalizeRad(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
  });
});

// =========================================================
// 1. computeUserBuildingShadows — ユーザー建物の影計算
// =========================================================
describe('computeUserBuildingShadows', () => {
  const sunForUi = { altitude: Math.PI / 4, azimuth: Math.PI }; // 45° altitude, south

  it('returns empty array for empty features', () => {
    const result = computeUserBuildingShadows([], sunForUi, 6.2, 3.1);
    expect(result.shadows).toEqual([]);
    expect(result.maxShadow).toBe(0);
  });

  it('computes shadow for a single user building', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { height: 10, floors: 3 },
    }];
    const result = computeUserBuildingShadows(features, sunForUi, 6.2, 3.1);
    expect(result.shadows).toHaveLength(1);
    expect(result.shadows[0].properties.source).toBe('user');
    expect(result.shadows[0].properties.height).toBe(10);
    expect(result.shadows[0].properties.floors).toBe(3);
    expect(result.maxShadow).toBeGreaterThan(0);
  });

  it('uses defaultHeight when feature has no valid height', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: {},
    }];
    const result = computeUserBuildingShadows(features, sunForUi, 15.0, 3.1);
    expect(result.shadows).toHaveLength(1);
    expect(result.shadows[0].properties.height).toBe(15.0);
  });

  it('clamps height to [1, 500]', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { height: 9999 },
    }];
    const result = computeUserBuildingShadows(features, sunForUi, 6.2, 3.1);
    expect(result.shadows[0].properties.height).toBe(500);
  });

  it('calculates floors from height when floors not specified', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { height: 9.3 },
    }];
    const result = computeUserBuildingShadows(features, sunForUi, 6.2, 3.1);
    // 9.3 / 3.1 = 3
    expect(result.shadows[0].properties.floors).toBe(3);
  });

  it('returns no shadow when sun altitude <= 0', () => {
    const nightSun = { altitude: -0.1, azimuth: Math.PI };
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { height: 10 },
    }];
    const result = computeUserBuildingShadows(features, nightSun, 6.2, 3.1);
    expect(result.shadows).toHaveLength(0);
  });

  it('is a pure function — same input produces same output', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { height: 10 },
    }];
    const result1 = computeUserBuildingShadows(features, sunForUi, 6.2, 3.1);
    const result2 = computeUserBuildingShadows(features, sunForUi, 6.2, 3.1);
    expect(result1).toEqual(result2);
  });
});

// =========================================================
// 2. computePlateauShadows — PLATEAU建物の影計算
// =========================================================
describe('computePlateauShadows', () => {
  const sunForUi = { altitude: Math.PI / 4, azimuth: Math.PI };

  it('returns empty result for empty features', () => {
    const result = computePlateauShadows([], sunForUi);
    expect(result.shadows).toEqual([]);
    expect(result.plateauBuildingCount).toBe(0);
    expect(result.plateauShadowCount).toBe(0);
    expect(result.maxShadow).toBe(0);
    expect(result.maxPlateauHeight).toBe(0);
    expect(result.plateauRingKeys).toBeInstanceOf(Set);
  });

  it('computes shadow for a PLATEAU building', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { measuredHeight: 25 },
    }];
    const result = computePlateauShadows(features, sunForUi);
    expect(result.shadows).toHaveLength(1);
    expect(result.shadows[0].properties.source).toBe('plateau');
    expect(result.plateauBuildingCount).toBe(1);
    expect(result.plateauShadowCount).toBe(1);
    expect(result.maxPlateauHeight).toBe(25);
  });

  it('deduplicates buildings with the same ring key', () => {
    const ring = [
      [139.767, 35.681],
      [139.768, 35.681],
      [139.768, 35.682],
      [139.767, 35.682],
      [139.767, 35.681],
    ];
    const features = [
      { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { measuredHeight: 10 } },
      { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { measuredHeight: 10 } },
    ];
    const result = computePlateauShadows(features, sunForUi);
    expect(result.plateauBuildingCount).toBe(1);
    expect(result.plateauShadowCount).toBe(1);
  });

  it('handles MultiPolygon geometry', () => {
    const features = [{
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[
            [139.767, 35.681],
            [139.768, 35.681],
            [139.768, 35.682],
            [139.767, 35.682],
            [139.767, 35.681],
          ]],
        ],
      },
      properties: { measuredHeight: 15 },
    }];
    const result = computePlateauShadows(features, sunForUi);
    expect(result.shadows).toHaveLength(1);
  });

  it('uses height fallback chain (measuredHeight > height > z > 5)', () => {
    const ring = [[139.767, 35.681], [139.768, 35.681], [139.768, 35.682], [139.767, 35.682], [139.767, 35.681]];
    expect(getPlateauHeight({ measuredHeight: 20 })).toBe(20);
    expect(getPlateauHeight({ height: 15 })).toBe(15);
    expect(getPlateauHeight({ z: 8 })).toBe(8);
    expect(getPlateauHeight({})).toBe(5);
  });

  it('tracks maxPlateauHeight correctly', () => {
    const makeFeature = (h) => ({
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767 + h * 0.001, 35.681],
          [139.768 + h * 0.001, 35.681],
          [139.768 + h * 0.001, 35.682],
          [139.767 + h * 0.001, 35.682],
          [139.767 + h * 0.001, 35.681],
        ]],
      },
      properties: { measuredHeight: h },
    });
    const features = [makeFeature(10), makeFeature(30), makeFeature(20)];
    const result = computePlateauShadows(features, sunForUi);
    expect(result.maxPlateauHeight).toBe(30);
  });

  it('returns serializable output (no DOM/map references)', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { measuredHeight: 10 },
    }];
    const result = computePlateauShadows(features, sunForUi);
    // Should be structured-clone-able (no functions, DOM nodes, etc.)
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized.shadows).toHaveLength(result.shadows.length);
    expect(serialized.plateauBuildingCount).toBe(result.plateauBuildingCount);
  });
});

// =========================================================
// 3. computeBasemapShadows — ベースマップ建物の影計算
// =========================================================
describe('computeBasemapShadows', () => {
  const sunForUi = { altitude: Math.PI / 4, azimuth: Math.PI };

  it('returns empty result for empty features', () => {
    const result = computeBasemapShadows([], sunForUi, new Set());
    expect(result.shadows).toEqual([]);
    expect(result.basemapBuildingCount).toBe(0);
    expect(result.basemapShadowCount).toBe(0);
    expect(result.maxShadow).toBe(0);
  });

  it('computes shadow for a basemap building', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { render_height: 20 },
    }];
    const result = computeBasemapShadows(features, sunForUi, new Set());
    expect(result.shadows).toHaveLength(1);
    expect(result.shadows[0].properties.source).toBe('basemap');
    expect(result.basemapBuildingCount).toBe(1);
    expect(result.basemapShadowCount).toBe(1);
  });

  it('excludes buildings already in plateauRingKeys', () => {
    const ring = [
      [139.767, 35.681],
      [139.768, 35.681],
      [139.768, 35.682],
      [139.767, 35.682],
      [139.767, 35.681],
    ];
    const features = [{
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { render_height: 20 },
    }];
    // Simulate a plateauRingKeys set that already has this building
    const primaryRing = getPrimaryRing({ type: 'Polygon', coordinates: [ring] });
    const key = getRingDedupeKey(primaryRing);

    const plateauKeys = new Set([key]);
    const result = computeBasemapShadows(features, sunForUi, plateauKeys);
    expect(result.shadows).toHaveLength(0);
    expect(result.basemapBuildingCount).toBe(0);
  });

  it('deduplicates basemap buildings', () => {
    const ring = [
      [139.767, 35.681],
      [139.768, 35.681],
      [139.768, 35.682],
      [139.767, 35.682],
      [139.767, 35.681],
    ];
    const features = [
      { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { render_height: 20 } },
      { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { render_height: 20 } },
    ];
    const result = computeBasemapShadows(features, sunForUi, new Set());
    expect(result.basemapBuildingCount).toBe(1);
  });

  it('uses basemap height fallback (render_height > height > levels*floorHeight > 10)', () => {
    expect(getBasemapHeight({ render_height: 30 })).toBe(30);
    expect(getBasemapHeight({ height: 25 })).toBe(25);
    expect(getBasemapHeight({})).toBe(10);
  });

  it('is a pure function — no DOM or state references', () => {
    const features = [{
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139.767, 35.681],
          [139.768, 35.681],
          [139.768, 35.682],
          [139.767, 35.682],
          [139.767, 35.681],
        ]],
      },
      properties: { render_height: 10 },
    }];
    const result1 = computeBasemapShadows(features, sunForUi, new Set());
    const result2 = computeBasemapShadows(features, sunForUi, new Set());
    expect(result1).toEqual(result2);
  });
});

// =========================================================
// 6. getGeometryRings — ブランチカバレッジ補完 (TD-01)
// =========================================================
describe('getGeometryRings (shadow-compute.js)', () => {
  it('returns [] for unknown geometry type (e.g. Point)', () => {
    const geom = { type: 'Point', coordinates: [139.767, 35.681] };
    expect(getGeometryRings(geom)).toEqual([]);
  });

  it('returns [] for null geometry', () => {
    expect(getGeometryRings(null)).toEqual([]);
  });
});

// =========================================================
// 7. getPrimaryRing — MultiPolygon で後続リングが最大面積 (TD-01)
// =========================================================
describe('getPrimaryRing multipolygon area selection (shadow-compute.js)', () => {
  it('selects the ring with the largest area when the first is smaller', () => {
    // Small polygon (ring index 0)
    const smallRing = [
      [139.767, 35.681],
      [139.7671, 35.681],
      [139.7671, 35.6811],
      [139.767, 35.6811],
      [139.767, 35.681],
    ];
    // Large polygon (ring index 1) — 10x wider/taller
    const largeRing = [
      [139.760, 35.680],
      [139.770, 35.680],
      [139.770, 35.690],
      [139.760, 35.690],
      [139.760, 35.680],
    ];
    const multiPolygon = {
      type: 'MultiPolygon',
      coordinates: [[smallRing], [largeRing]],
    };
    const selected = getPrimaryRingSC(multiPolygon);
    // Should pick largeRing
    expect(selected).toEqual(largeRing);
  });
});
