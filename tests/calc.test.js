import { describe, it, expect } from 'vitest';
import { clamp, round, destinationLngLat, polygonCentroid, convexHull, calculateShadowBuffer, expandBounds } from '../public/calc.js';

// =========================================================
// 1. clamp()
// =========================================================
describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('returns min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('returns max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

// =========================================================
// 2. round()
// =========================================================
describe('round', () => {
  it('rounds to 1 decimal place by default', () => {
    expect(round(3.456)).toBe(3.5);
  });
  it('rounds to 0 decimal places (integer)', () => {
    expect(round(3.456, 0)).toBe(3);
  });
  it('rounds to 2 decimal places', () => {
    expect(round(3.456, 2)).toBe(3.46);
  });
});

// =========================================================
// 3. convexHull()
// =========================================================
describe('convexHull', () => {
  it('returns empty array for empty input', () => {
    // AC-6: edge case
    expect(convexHull([])).toEqual([]);
  });

  it('returns single point for single input', () => {
    const points = [{ x: 1, y: 1 }];
    expect(convexHull(points)).toEqual([{ x: 1, y: 1 }]);
  });

  it('returns both points for two inputs', () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const hull = convexHull(points);
    expect(hull).toHaveLength(2);
  });

  it('returns triangle for three non-collinear points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(3);
  });

  it('returns 4 vertices for a square', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
  });

  it('excludes interior points from hull', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 }, // interior point
      { x: 1, y: 1 }, // interior point
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
    const hasInterior = hull.some(p => (p.x === 2 && p.y === 2) || (p.x === 1 && p.y === 1));
    expect(hasInterior).toBe(false);
  });
});

// =========================================================
// 4. destinationLngLat()
// =========================================================
describe('destinationLngLat', () => {
  const tokyoLng = 139.7671;
  const tokyoLat = 35.6812;

  it('moves north by 100m', () => {
    const bearingNorth = 0;
    const [lng, lat] = destinationLngLat(tokyoLng, tokyoLat, bearingNorth, 100);
    expect(lng).toBeCloseTo(tokyoLng, 3);
    expect(lat).toBeGreaterThan(tokyoLat);
    expect(lat - tokyoLat).toBeCloseTo(0.0009, 3);
  });

  it('moves east by 1000m', () => {
    const bearingEast = Math.PI / 2;
    const [lng, lat] = destinationLngLat(tokyoLng, tokyoLat, bearingEast, 1000);
    expect(lat).toBeCloseTo(tokyoLat, 3);
    expect(lng).toBeGreaterThan(tokyoLng);
  });

  it('moves southwest by 500m', () => {
    const bearingSW = (225 * Math.PI) / 180;
    const [lng, lat] = destinationLngLat(tokyoLng, tokyoLat, bearingSW, 500);
    expect(lng).toBeLessThan(tokyoLng);
    expect(lat).toBeLessThan(tokyoLat);
  });

  it('returns same coordinates when distance is 0', () => {
    // AC-6: edge case
    const [lng, lat] = destinationLngLat(tokyoLng, tokyoLat, 0, 0);
    expect(lng).toBeCloseTo(tokyoLng, 5);
    expect(lat).toBeCloseTo(tokyoLat, 5);
  });
});

// =========================================================
// 5. polygonCentroid()
// =========================================================
describe('polygonCentroid', () => {
  it('calculates centroid of a square', () => {
    const ring = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    const c = polygonCentroid(ring);
    expect(c.lng).toBeCloseTo(2, 5);
    expect(c.lat).toBeCloseTo(2, 5);
  });

  it('calculates centroid of a triangle', () => {
    const ring = [
      [0, 0],
      [6, 0],
      [3, 6],
    ];
    const c = polygonCentroid(ring);
    expect(c.lng).toBeCloseTo(3, 5);
    expect(c.lat).toBeCloseTo(2, 5);
  });

  it('handles closed ring (first === last) same as open ring', () => {
    const openRing = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    const closedRing = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    const openCentroid = polygonCentroid(openRing);
    const closedCentroid = polygonCentroid(closedRing);
    expect(closedCentroid.lng).toBeCloseTo(openCentroid.lng, 5);
    expect(closedCentroid.lat).toBeCloseTo(openCentroid.lat, 5);
  });

  it('does not crash on empty ring', () => {
    // AC-6: edge case — zero division avoidance
    expect(() => polygonCentroid([])).not.toThrow();
  });

  it('returns {lng: 0, lat: 0} for empty ring', () => {
    const c = polygonCentroid([]);
    expect(c.lng).toBe(0);
    expect(c.lat).toBe(0);
  });
});

// =========================================================
// 6. calculateShadowBuffer()
// =========================================================
describe('calculateShadowBuffer', () => {
  it('calculates buffer at 45° sun altitude for 10m building', () => {
    // buffer = min(10 / tan(π/4) * 1.3, 2500) = 13.0
    expect(calculateShadowBuffer(Math.PI / 4, 10)).toBeCloseTo(13.0, 1);
  });

  it('returns 0 when sun altitude is 0 or negative', () => {
    expect(calculateShadowBuffer(0, 10)).toBe(0);
    expect(calculateShadowBuffer(-0.5, 10)).toBe(0);
  });

  it('caps buffer at 2500m for very low sun angles', () => {
    // Very low sun (0.01 rad ≈ 0.57°), 200m building → would be 26000m, capped to 2500
    expect(calculateShadowBuffer(0.01, 200)).toBe(2500);
  });

  it('handles realistic noon scenario (60° altitude, 50m building)', () => {
    // buffer = min(50 / tan(60°) * 1.3, 2500) = min(37.5, 2500) ≈ 37.5
    const result = calculateShadowBuffer(Math.PI / 3, 50);
    expect(result).toBeCloseTo(37.53, 0);
    expect(result).toBeLessThan(2500);
  });

  it('handles very small positive altitude', () => {
    const result = calculateShadowBuffer(0.001, 10);
    expect(result).toBe(2500); // capped
  });
});

// =========================================================
// 7. expandBounds()
// =========================================================
describe('expandBounds', () => {
  it('expands bounds by 1000m in all directions', () => {
    const bounds = { north: 35.7, south: 35.6, east: 139.8, west: 139.7 };
    const expanded = expandBounds(bounds, 1000);
    // ~0.009° per 1000m latitude
    expect(expanded.north).toBeGreaterThan(bounds.north);
    expect(expanded.south).toBeLessThan(bounds.south);
    expect(expanded.east).toBeGreaterThan(bounds.east);
    expect(expanded.west).toBeLessThan(bounds.west);

    const latDiff = expanded.north - bounds.north;
    expect(latDiff).toBeCloseTo(0.009, 2);
  });

  it('returns same bounds for 0 buffer', () => {
    const bounds = { north: 35.7, south: 35.6, east: 139.8, west: 139.7 };
    const expanded = expandBounds(bounds, 0);
    expect(expanded.north).toBeCloseTo(bounds.north, 5);
    expect(expanded.south).toBeCloseTo(bounds.south, 5);
    expect(expanded.east).toBeCloseTo(bounds.east, 5);
    expect(expanded.west).toBeCloseTo(bounds.west, 5);
  });

  it('accounts for longitude correction at different latitudes', () => {
    // At higher latitudes, longitude degrees cover less distance
    const equatorBounds = { north: 1, south: -1, east: 1, west: -1 };
    const tokyoBounds = { north: 36, south: 35, east: 140, west: 139 };

    const eqExpanded = expandBounds(equatorBounds, 1000);
    const tkExpanded = expandBounds(tokyoBounds, 1000);

    // Longitude expansion should be larger at Tokyo (higher lat) than equator
    const eqLngDiff = eqExpanded.east - equatorBounds.east;
    const tkLngDiff = tkExpanded.east - tokyoBounds.east;
    expect(tkLngDiff).toBeGreaterThan(eqLngDiff);
  });
});
