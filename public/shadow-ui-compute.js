import {
  state,
  el,
  MAX_SHADOW_BUILDINGS,
  EXTERNAL_SHADOW_MIN_ZOOM,
  SHADOW_BUILDING_CAP_LOW_ZOOM,
  SHADOW_BUILDING_CAP_MID_ZOOM,
  getCurrentDateTimeUtc,
  getFootprints,
  PLATEAU_MIN_ZOOM,
  DEFAULT_PLATEAU_HEIGHT,
} from './state.js';
import { round, calculateShadowBuffer } from './calc.js';
import {
  computeUserBuildingShadows,
  computePlateauShadows,
  computeBasemapShadows,
  normalizeRad,
} from './shadow-compute.js';
import { plateauObservability } from './plateau-observability.js';

let shadowWorker = null;
let workerFailed = false;
let shadowComputeSeq = 0;
let shadowProgressShowTimer = null;
let shadowProgressHideTimer = null;
let shadowProgressShownAt = 0;
let shadowProgressLastHiddenAt = 0;
const SHADOW_PROGRESS_SHOW_DELAY_MS = 320;
const SHADOW_PROGRESS_MIN_VISIBLE_MS = 260;
const SHADOW_PROGRESS_HIDE_DEBOUNCE_MS = 140;
const SHADOW_PROGRESS_COOLDOWN_MS = 420;

function getShadowWorker() {
  if (workerFailed) return null;
  if (shadowWorker) return shadowWorker;
  try {
    shadowWorker = new Worker('./shadow-worker.js?v=20260731-1', { type: 'module' });
    shadowWorker.onerror = (e) => {
      console.warn('[shadow-ui] Worker error, falling back to main thread:', e.message);
      plateauObservability.operationalFailure('shadow_compute_worker_fallback', { stage: 'worker_error' });
      finishShadowProgress();
      workerFailed = true;
      shadowWorker = null;
    };
    return shadowWorker;
  } catch (e) {
    console.warn('[shadow-ui] Worker creation failed, using main thread fallback:', e.message);
    plateauObservability.operationalFailure('shadow_compute_worker_fallback', { stage: 'worker_creation' });
    workerFailed = true;
    return null;
  }
}

function showShadowProgress() {
  const indicator = el("shadowProgress");
  if (!indicator) return;
  if (shadowProgressHideTimer) {
    clearTimeout(shadowProgressHideTimer);
    shadowProgressHideTimer = null;
  }
  shadowProgressShownAt = performance.now();
  indicator.classList.remove("hidden");
}

function hideShadowProgressNow() {
  const indicator = el("shadowProgress");
  if (!indicator) return;
  indicator.classList.add("hidden");
  shadowProgressLastHiddenAt = performance.now();
}

function scheduleShadowProgress() {
  const loadingOverlay = el("loadingOverlay");
  if (loadingOverlay && !loadingOverlay.classList.contains("hidden")) return;

  const indicator = el("shadowProgress");
  if (indicator && !indicator.classList.contains("hidden")) return;

  const now = performance.now();
  if (now - shadowProgressLastHiddenAt < SHADOW_PROGRESS_COOLDOWN_MS) return;

  if (shadowProgressShowTimer) {
    clearTimeout(shadowProgressShowTimer);
  }
  shadowProgressShowTimer = setTimeout(() => {
    shadowProgressShowTimer = null;
    showShadowProgress();
  }, SHADOW_PROGRESS_SHOW_DELAY_MS);
}

function finishShadowProgress() {
  if (shadowProgressShowTimer) {
    clearTimeout(shadowProgressShowTimer);
    shadowProgressShowTimer = null;
  }

  const indicator = el("shadowProgress");
  if (!indicator || indicator.classList.contains("hidden")) return;
  const elapsed = performance.now() - shadowProgressShownAt;
  const remaining = Math.max(
    SHADOW_PROGRESS_HIDE_DEBOUNCE_MS,
    SHADOW_PROGRESS_MIN_VISIBLE_MS - elapsed
  );
  if (shadowProgressHideTimer) clearTimeout(shadowProgressHideTimer);
  shadowProgressHideTimer = setTimeout(() => {
    shadowProgressHideTimer = null;
    hideShadowProgressNow();
  }, remaining);
}

function getExternalShadowBuildingCap(zoom) {
  if (!Number.isFinite(zoom)) return MAX_SHADOW_BUILDINGS;
  if (zoom < EXTERNAL_SHADOW_MIN_ZOOM) return 0;
  if (zoom < 16) return Math.min(MAX_SHADOW_BUILDINGS, SHADOW_BUILDING_CAP_LOW_ZOOM);
  if (zoom < 17) return Math.min(MAX_SHADOW_BUILDINGS, SHADOW_BUILDING_CAP_MID_ZOOM);
  return MAX_SHADOW_BUILDINGS;
}

function collectShadowInputs() {
  const features = getFootprints().filter((f) => f.geometry?.type === "Polygon");
  const dtUtc = getCurrentDateTimeUtc();
  if (!dtUtc.isValid) return null;

  const center = state.map.getCenter();
  const sunForUi = SunCalc.getPosition(dtUtc.toJSDate(), center.lat, center.lng);
  const zoom = state.map.getZoom();
  const externalCap = getExternalShadowBuildingCap(zoom);
  state.externalShadowCap = externalCap;
  state.externalShadowSuppressed = externalCap <= 0;

  if (externalCap <= 0) {
    state.plateauShadowTruncated = false;
    state.basemapShadowTruncated = false;
    return { features, plateauFeatures: [], basemapFeatures: [], sunForUi };
  }

  let plateauTruncated = false;
  let plateauFeatures = [];
  if (state.plateauVisible && state.map.getLayer("plateau-buildings")) {
    try {
      let pf = state.map.queryRenderedFeatures(undefined, { layers: ["plateau-buildings"] })
        .filter((f) => f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon");
      if (pf.length > externalCap) {
        pf = pf.slice(0, externalCap);
        plateauTruncated = true;
      }
      plateauFeatures = pf.map((f) => ({ geometry: f.geometry, properties: f.properties }));
    } catch (e) {
      console.warn("PLATEAU feature query failed:", e);
      plateauObservability.operationalFailure('plateau_feature_query_failure', { stage: 'query_features' });
    }
  }

  let basemapTruncated = false;
  let basemapFeatures = [];
  if (state.basemapBuildingsVisible && state.map.getLayer("building-3d")) {
    try {
      let bf = state.map.queryRenderedFeatures(undefined, { layers: ["building-3d"] })
        .filter((f) => f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon");
      if (bf.length > externalCap) {
        bf = bf.slice(0, externalCap);
        basemapTruncated = true;
      }
      basemapFeatures = bf.map((f) => ({ geometry: f.geometry, properties: f.properties }));
    } catch (e) {
      console.warn("Basemap feature query failed:", e);
      plateauObservability.operationalFailure('basemap_feature_query_failure', { stage: 'query_features' });
    }
  }

  state.plateauShadowTruncated = plateauTruncated;
  state.basemapShadowTruncated = basemapTruncated;

  return { features, plateauFeatures, basemapFeatures, sunForUi };
}

function applyShadowResults(src, features, sunForUi, workerPayload) {
  if (typeof window !== 'undefined' && workerPayload.cacheStats) {
    window.__shadowCacheStats = workerPayload.cacheStats;
  }
  const shadowFeatures = workerPayload.shadows;
  const maxShadow = workerPayload.maxShadow;
  const plateauResult = {
    ...workerPayload.plateauStats,
    plateauRingKeys: new Set(),
  };
  const basemapResult = workerPayload.basemapStats;

  src.setData({ type: "FeatureCollection", features: shadowFeatures });
  updateShadowStats(features.length, plateauResult, basemapResult, sunForUi, maxShadow);
  updateSunDisplay(sunForUi, features.length, plateauResult.plateauShadowCount, basemapResult.basemapShadowCount);
}

function computeShadowsSync(src, features, sunForUi, plateauFeatures, basemapFeatures) {
  const userResult = computeUserBuildingShadows(features, sunForUi, state.defaultHeight, state.floorHeight);
  const shadowFeatures = [...userResult.shadows];
  let maxShadow = userResult.maxShadow;

  let plateauResult = { shadows: [], plateauBuildingCount: 0, plateauShadowCount: 0, maxShadow: 0, maxPlateauHeight: 0, plateauRingKeys: new Set() };
  if (plateauFeatures.length > 0) {
    try {
      plateauResult = computePlateauShadows(plateauFeatures, sunForUi);
      shadowFeatures.push(...plateauResult.shadows);
      maxShadow = Math.max(maxShadow, plateauResult.maxShadow);
    } catch (e) {
      console.warn("PLATEAU shadow calculation failed:", e);
      plateauObservability.operationalFailure('plateau_shadow_calculation_failure', { stage: 'calculate_shadows' });
    }
  }

  let basemapResult = { shadows: [], basemapBuildingCount: 0, basemapShadowCount: 0, maxShadow: 0 };
  if (basemapFeatures.length > 0) {
    try {
      basemapResult = computeBasemapShadows(basemapFeatures, sunForUi, plateauResult.plateauRingKeys, state.floorHeight);
      shadowFeatures.push(...basemapResult.shadows);
      maxShadow = Math.max(maxShadow, basemapResult.maxShadow);
    } catch (e) {
      console.warn("Basemap shadow calculation failed:", e);
      plateauObservability.operationalFailure('basemap_shadow_calculation_failure', { stage: 'calculate_shadows' });
    }
  }

  src.setData({ type: "FeatureCollection", features: shadowFeatures });
  updateShadowStats(features.length, plateauResult, basemapResult, sunForUi, maxShadow);
  updateSunDisplay(sunForUi, features.length, plateauResult.plateauShadowCount, basemapResult.basemapShadowCount);
}

export function updateShadows() {
  if (!state.map) return;
  const src = state.map.getSource("shadows");
  if (!src?.setData) return;

  const inputs = collectShadowInputs();
  if (!inputs) return;
  const { features, plateauFeatures, basemapFeatures, sunForUi } = inputs;

  const worker = getShadowWorker();
  if (!worker) {
    computeShadowsSync(src, features, sunForUi, plateauFeatures, basemapFeatures);
    return;
  }

  scheduleShadowProgress();

  const thisSeq = ++shadowComputeSeq;
  worker.onmessage = (e) => {
    if (thisSeq !== shadowComputeSeq) return;
    finishShadowProgress();

    if (e.data.type === 'error') {
      console.warn('[shadow-ui] Worker computation error:', e.data.error);
      plateauObservability.operationalFailure('shadow_compute_worker_fallback', { stage: 'worker_compute' });
      computeShadowsSync(src, features, sunForUi, plateauFeatures, basemapFeatures);
      return;
    }
    if (e.data.type === 'result') {
      applyShadowResults(src, features, sunForUi, e.data.payload);
    }
  };

  worker.postMessage({
    type: 'compute',
    payload: {
      userFeatures: features,
      plateauFeatures,
      basemapFeatures,
      sunForUi,
      defaultHeight: state.defaultHeight,
      floorHeight: state.floorHeight,
    },
  });
}

function updateShadowStats(userCount, plateauResult, basemapResult, sunForUi, maxShadow) {
  state.plateauShadowCount = plateauResult.plateauShadowCount;
  state.plateauBuildingCount = plateauResult.plateauBuildingCount;
  state.basemapShadowCount = basemapResult.basemapShadowCount;
  state.basemapBuildingCount = basemapResult.basemapBuildingCount;

  const userCountEl = el("userBuildingCount");
  if (userCountEl) userCountEl.textContent = String(userCount);

  const plateauCountEl = el("plateauBuildingCount");
  if (plateauCountEl) plateauCountEl.textContent = String(plateauResult.plateauBuildingCount);
  const plateauShadowEl = el("plateauShadowCount");
  if (plateauShadowEl) plateauShadowEl.textContent = String(plateauResult.plateauShadowCount);

  const basemapCountEl = el("basemapBuildingCount");
  if (basemapCountEl) basemapCountEl.textContent = String(basemapResult.basemapBuildingCount);
  const basemapShadowEl = el("basemapShadowCount");
  if (basemapShadowEl) basemapShadowEl.textContent = String(basemapResult.basemapShadowCount);

  const bufferEl = el("shadowBufferDistance");
  if (bufferEl) {
    if (sunForUi.altitude > 0 && plateauResult.plateauShadowCount > 0) {
      const bufferDistance = calculateShadowBuffer(sunForUi.altitude, plateauResult.maxPlateauHeight || DEFAULT_PLATEAU_HEIGHT);
      bufferEl.textContent = `${round(bufferDistance, 0)} m`;
    } else {
      bufferEl.textContent = "—";
    }
  }

  const plateauStatsEl = el("plateauStats");
  if (plateauStatsEl) {
    const shouldShow =
      plateauResult.plateauBuildingCount > 0 ||
      basemapResult.basemapBuildingCount > 0 ||
      (state.plateauVisible && state.pmtilesRangeError);
    plateauStatsEl.classList.toggle("hidden", !shouldShow);
  }

  el("shadowLength").textContent = maxShadow > 0 ? `${round(maxShadow, 1)} m` : "—";
}

function updateSunDisplay(sunForUi, userFeatureCount, plateauShadowCount, basemapShadowCount) {
  const altitudeDeg = (sunForUi.altitude * 180) / Math.PI;
  const bearingDeg = (normalizeRad(sunForUi.azimuth + Math.PI) * 180) / Math.PI;
  el("sunAltitude").textContent = `${round(altitudeDeg, 1)}°`;
  el("sunAzimuth").textContent = `${round(bearingDeg, 1)}°`;

  const nightOverlay = el("nightOverlay");
  if (nightOverlay) {
    if (altitudeDeg <= 0) nightOverlay.classList.remove("hidden");
    else nightOverlay.classList.add("hidden");
  }

  const noteEl = el("sunNote");
  if (noteEl) {
    const noteMessages = [];
    if (state.plateauVisible && state.pmtilesRangeError) {
      noteMessages.push("PLATEAUデータ取得失敗（Range対応サーバが必要）");
    }
    if (altitudeDeg <= 0) {
      noteMessages.push("夜間（日の出前/日没後）です");
    } else if (!userFeatureCount && plateauShadowCount === 0 && basemapShadowCount === 0) {
      noteMessages.push("建物が未設定です");
    }
    if (state.externalShadowSuppressed) {
      noteMessages.push(`広域表示中のため外部建物の影計算を停止中（ズーム${EXTERNAL_SHADOW_MIN_ZOOM}以上で再開）`);
    }
    const zoom = state.map?.getZoom?.() ?? 0;
    if (
      state.plateauVisible &&
      zoom >= PLATEAU_MIN_ZOOM &&
      plateauShadowCount === 0 &&
      state.basemapBuildingsVisible &&
      basemapShadowCount > 0
    ) {
      noteMessages.push("この地点はPLATEAU未整備/未取得の可能性があります");
    }
    if (state.plateauShadowTruncated || state.basemapShadowTruncated) {
      noteMessages.push(`影計算対象を最大${state.externalShadowCap}棟に制限中（ズームインで改善）`);
    }
    noteEl.textContent = noteMessages.join(" / ");
  }
}
