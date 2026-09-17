import { describe, expect, it, vi } from 'vitest';

import { createShadowCache } from '../public/shadow-cache.js';
import { createShadowWorkerHandler } from '../public/shadow-worker-core.js';

const payload = {
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
    properties: { height: 10 },
  }],
  plateauFeatures: [],
  basemapFeatures: [],
  sunForUi: { altitude: Math.PI / 4, azimuth: Math.PI },
  defaultHeight: 6.2,
  floorHeight: 3.1,
};

describe('shadow worker cache integration', () => {
  it('reuses an identical calculation and exposes cache monitoring stats', () => {
    const postMessage = vi.fn();
    const handler = createShadowWorkerHandler({
      postMessage,
      cache: createShadowCache({ maxEntries: 4, maxBytes: 100_000 }),
    });

    handler({ data: { type: 'compute', payload } });
    handler({ data: { type: 'compute', payload: structuredClone(payload) } });

    const first = postMessage.mock.calls[0][0];
    const second = postMessage.mock.calls[1][0];
    expect(first.type).toBe('result');
    expect(first.payload.cacheStats).toMatchObject({ hits: 0, misses: 1, hitRate: 0 });
    expect(second.payload.shadows).toEqual(first.payload.shadows);
    expect(second.payload.cacheStats).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5 });
  });

  it('does not reuse a result after the rounded sun position changes', () => {
    const postMessage = vi.fn();
    const handler = createShadowWorkerHandler({ postMessage });
    handler({ data: { type: 'compute', payload } });
    handler({
      data: {
        type: 'compute',
        payload: {
          ...payload,
          sunForUi: { ...payload.sunForUi, azimuth: payload.sunForUi.azimuth + 0.2 * Math.PI / 180 },
        },
      },
    });

    expect(postMessage.mock.calls[1][0].payload.cacheStats)
      .toMatchObject({ hits: 0, misses: 2 });
  });

  it('preserves worker validation errors', () => {
    const postMessage = vi.fn();
    const handler = createShadowWorkerHandler({ postMessage });

    handler({ data: { type: 'other' } });
    handler({ data: { type: 'compute', payload: null } });

    expect(postMessage.mock.calls[0][0]).toEqual({ type: 'error', error: 'Unknown message type' });
    expect(postMessage.mock.calls[1][0]).toEqual({ type: 'error', error: 'Invalid payload' });
  });
});
