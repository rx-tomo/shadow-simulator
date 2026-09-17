import {
  computeUserBuildingShadows,
  computePlateauShadows,
  computeBasemapShadows,
} from './shadow-compute.js';
import { createShadowCache, createShadowComputationKey } from './shadow-cache.js';

export function createShadowWorkerHandler({
  postMessage,
  cache = createShadowCache(),
} = {}) {
  if (typeof postMessage !== 'function') throw new Error('postMessage is required');

  return function handleShadowWorkerMessage(event) {
    const { type, payload } = event?.data || {};
    if (type !== 'compute') {
      postMessage({ type: 'error', error: 'Unknown message type' });
      return;
    }
    if (!payload || typeof payload !== 'object') {
      postMessage({ type: 'error', error: 'Invalid payload' });
      return;
    }
    if (!payload.sunForUi || typeof payload.sunForUi.altitude !== 'number' || typeof payload.sunForUi.azimuth !== 'number') {
      postMessage({ type: 'error', error: 'Invalid sunForUi' });
      return;
    }

    try {
      const key = createShadowComputationKey(payload);
      const cached = cache.get(key);
      if (cached) {
        postMessage({
          type: 'result',
          payload: { ...cached, cacheStats: cache.stats() },
        });
        return;
      }

      const {
        userFeatures = [],
        plateauFeatures = [],
        basemapFeatures = [],
        sunForUi,
        defaultHeight,
        floorHeight,
      } = payload;
      const userResult = computeUserBuildingShadows(userFeatures, sunForUi, defaultHeight, floorHeight);
      const plateauResult = computePlateauShadows(plateauFeatures, sunForUi);
      const basemapResult = computeBasemapShadows(
        basemapFeatures,
        sunForUi,
        plateauResult.plateauRingKeys,
        floorHeight
      );
      const { plateauRingKeys, ...plateauStats } = plateauResult;
      const result = {
        shadows: [...userResult.shadows, ...plateauResult.shadows, ...basemapResult.shadows],
        userStats: { count: userResult.shadows.length, maxShadow: userResult.maxShadow },
        plateauStats,
        basemapStats: basemapResult,
        maxShadow: Math.max(userResult.maxShadow, plateauResult.maxShadow, basemapResult.maxShadow),
      };
      cache.set(key, result);
      postMessage({
        type: 'result',
        payload: { ...result, cacheStats: cache.stats() },
      });
    } catch (error) {
      postMessage({ type: 'error', error: error?.message || String(error) });
    }
  };
}
