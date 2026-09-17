const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_SUN_PRECISION_DEG = 0.1;
const DEFAULT_MAX_ENTRIES = 24;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

function roundToPrecision(value, precision) {
  const decimals = Math.max(0, Math.ceil(-Math.log10(precision)));
  return Number((Math.round((value + Number.EPSILON) / precision) * precision).toFixed(decimals));
}

export function roundSunPosition(sunForUi, precisionDeg = DEFAULT_SUN_PRECISION_DEG) {
  if (!Number.isFinite(precisionDeg) || precisionDeg <= 0) {
    throw new Error('sun precision must be a positive number');
  }
  return {
    altitudeDeg: roundToPrecision(Number(sunForUi?.altitude) * RAD_TO_DEG, precisionDeg),
    azimuthDeg: roundToPrecision(Number(sunForUi?.azimuth) * RAD_TO_DEG, precisionDeg),
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function createShadowComputationKey(payload, precisionDeg = DEFAULT_SUN_PRECISION_DEG) {
  const {
    userFeatures = [],
    plateauFeatures = [],
    basemapFeatures = [],
    defaultHeight,
    floorHeight,
    sunForUi,
  } = payload || {};
  return stableStringify({
    version: 1,
    sun: roundSunPosition(sunForUi, precisionDeg),
    defaultHeight,
    floorHeight,
    userFeatures,
    plateauFeatures,
    basemapFeatures,
  });
}

function estimateBytes(key, value) {
  return (key.length + stableStringify(value).length) * 2;
}

export function createShadowCache(options = {}) {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new Error('maxEntries must be a positive integer');
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive number');

  const entries = new Map();
  let estimatedBytes = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  let skipped = 0;

  function removeOldest() {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) return false;
    estimatedBytes -= entries.get(oldestKey).bytes;
    entries.delete(oldestKey);
    evictions++;
    return true;
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) {
        misses++;
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      hits++;
      return entry.value;
    },

    set(key, value) {
      const bytes = estimateBytes(key, value);
      if (bytes > maxBytes) {
        skipped++;
        return false;
      }
      const previous = entries.get(key);
      if (previous) {
        estimatedBytes -= previous.bytes;
        entries.delete(key);
      }
      while (entries.size >= maxEntries || estimatedBytes + bytes > maxBytes) {
        if (!removeOldest()) break;
      }
      entries.set(key, { value, bytes });
      estimatedBytes += bytes;
      return true;
    },

    clear() {
      entries.clear();
      estimatedBytes = 0;
    },

    stats() {
      const requests = hits + misses;
      return {
        entries: entries.size,
        estimatedBytes,
        maxEntries,
        maxBytes,
        hits,
        misses,
        evictions,
        skipped,
        hitRate: requests === 0 ? 0 : hits / requests,
      };
    },
  };
}
