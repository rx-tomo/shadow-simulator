import { describe, expect, it } from 'vitest';

import {
  createShadowCache,
  createShadowComputationKey,
  roundSunPosition,
} from '../public/shadow-cache.js';

const basePayload = {
  userFeatures: [{
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [139.767, 35.681],
        [139.768, 35.681],
        [139.768, 35.682],
        [139.767, 35.681],
      ]],
    },
    properties: { height: 12 },
  }],
  plateauFeatures: [],
  basemapFeatures: [],
  sunForUi: { altitude: Math.PI / 4, azimuth: Math.PI },
  defaultHeight: 6.2,
  floorHeight: 3.1,
};

describe('shadow computation cache key', () => {
  it('rounds sun altitude and azimuth to 0.1 degree by default', () => {
    const rounded = roundSunPosition({
      altitude: 20.049 * Math.PI / 180,
      azimuth: 179.951 * Math.PI / 180,
    });

    expect(rounded.altitudeDeg).toBe(20);
    expect(rounded.azimuthDeg).toBe(180);
  });

  it('is stable for equivalent objects regardless of property order', () => {
    const reordered = {
      ...basePayload,
      userFeatures: [{
        properties: { height: 12 },
        geometry: basePayload.userFeatures[0].geometry,
      }],
    };

    expect(createShadowComputationKey(basePayload))
      .toBe(createShadowComputationKey(reordered));
  });

  it('changes when geometry, height defaults, or rounded sun position changes', () => {
    const baseKey = createShadowComputationKey(basePayload);
    const moved = structuredClone(basePayload);
    moved.userFeatures[0].geometry.coordinates[0][0][0] += 0.001;
    const higherDefault = { ...basePayload, defaultHeight: 8 };
    const laterSun = {
      ...basePayload,
      sunForUi: { ...basePayload.sunForUi, azimuth: basePayload.sunForUi.azimuth + 0.2 * Math.PI / 180 },
    };

    expect(createShadowComputationKey(moved)).not.toBe(baseKey);
    expect(createShadowComputationKey(higherDefault)).not.toBe(baseKey);
    expect(createShadowComputationKey(laterSun)).not.toBe(baseKey);
  });
});

describe('bounded LRU shadow cache', () => {
  it('returns hits and refreshes recency before eviction', () => {
    const cache = createShadowCache({ maxEntries: 2, maxBytes: 10_000 });
    cache.set('a', { value: 1 });
    cache.set('b', { value: 2 });

    expect(cache.get('a')).toEqual({ value: 1 });
    cache.set('c', { value: 3 });

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toEqual({ value: 1 });
    expect(cache.get('c')).toEqual({ value: 3 });
    expect(cache.stats()).toMatchObject({ entries: 2, hits: 3, misses: 1, evictions: 1 });
  });

  it('enforces byte limits and skips entries that can never fit', () => {
    const cache = createShadowCache({ maxEntries: 5, maxBytes: 150 });
    cache.set('first', { value: 'a'.repeat(40) });
    cache.set('second', { value: 'b'.repeat(40) });
    expect(cache.stats().estimatedBytes).toBeLessThanOrEqual(150);

    expect(cache.set('oversize', { value: 'x'.repeat(500) })).toBe(false);
    expect(cache.stats()).toMatchObject({ skipped: 1 });
  });

  it('reports a development hit rate without exposing cached inputs', () => {
    const cache = createShadowCache({ maxEntries: 2, maxBytes: 10_000 });
    cache.set('a', { value: 1 });
    cache.get('a');
    cache.get('missing');

    expect(cache.stats()).toEqual({
      entries: 1,
      estimatedBytes: expect.any(Number),
      maxEntries: 2,
      maxBytes: 10_000,
      hits: 1,
      misses: 1,
      evictions: 0,
      skipped: 0,
      hitRate: 0.5,
    });
  });
});
