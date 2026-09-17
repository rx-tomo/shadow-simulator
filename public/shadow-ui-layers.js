import {
  state,
  el,
  EXTERNAL_SHADOW_MIN_ZOOM,
  PLATEAU_MIN_ZOOM,
  DEFAULT_PLATEAU_HEIGHT,
} from './state.js';
import { applyExternalBuildingColorTheme, updatePlateauErrorNotice } from './map-init.js';
import { plateauObservability } from './plateau-observability.js';
import { updateShadows } from './shadow-ui-compute.js';

export const PLATEAU_PRIMARY_URL = "pmtiles://https://tiles.shadow.datagen-pro.com/releases/plateau-wu09-national-artifact-20260814-b/plateau-japan-bldg-lod1.pmtiles";
const PLATEAU_SOURCE_TIMEOUT_MS = 5000;
const PLATEAU_STATS_REFRESH_DEBOUNCE_MS = 180;

const PLATEAU_SOURCE_LAYER_CANDIDATES = [
  "plateau-bldg",
  "PLATEAU",
  "lod1_Building",
  "building",
  "bldg",
];

function buildPlateauSourceConfig() {
  return {
    type: "vector",
    url: PLATEAU_PRIMARY_URL,
    attribution: "出典: 3D都市モデル（Project PLATEAU）国土交通省 CC BY 4.0 を加工して作成",
  };
}

function buildPlateauHeightExpression() {
  return [
    "coalesce",
    ["to-number", ["get", "measuredHeight"]],
    ["to-number", ["get", "height"]],
    ["to-number", ["get", "z"]],
    DEFAULT_PLATEAU_HEIGHT
  ];
}

function addPlateauLayer(map, sourceLayerName) {
  if (map.getLayer("plateau-buildings")) return true;

  map.addLayer({
    id: "plateau-buildings",
    type: "fill-extrusion",
    source: "plateau",
    "source-layer": sourceLayerName,
    // minzoom: 14
    minzoom: PLATEAU_MIN_ZOOM,
    paint: {
      "fill-extrusion-color": "#9ca3af",
      "fill-extrusion-opacity": 0.3,
      "fill-extrusion-height": ["+", buildPlateauHeightExpression(), 0.05],
      "fill-extrusion-base": 0.05,
    },
  });
  applyExternalBuildingColorTheme(map);
  updateShadows();
  refreshShadowsWhenMapIdle(map);
  return true;
}

/**
 * `sourcedata` can arrive before the corresponding tile is rendered. Re-run
 * after MapLibre settles so the visible PLATEAU features reach the stats UI.
 */
export function refreshShadowsWhenMapIdle(map, refresh = updateShadows) {
  if (typeof map?.once !== "function") return false;
  map.once("idle", refresh);
  return true;
}

/**
 * PLATEAU tile content can arrive after the source-level load/idle events.
 * Coalescing those events and requesting one browser frame after the debounce
 * avoids starting worker computations before tiles are rendered or while
 * another tile is arriving. MapLibre `idle` is not reliable while the base
 * style keeps loading.
 */
export function createDebouncedPlateauStatsRefresh(
  map,
  refresh = updateShadows,
  {
    delayMs = PLATEAU_STATS_REFRESH_DEBOUNCE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    requestFrame,
  } = {},
) {
  let timerId = null;
  let frameRefreshPending = false;
  const scheduleFrame = requestFrame || ((callback) => setTimer(callback, 0));
  return () => {
    if (timerId !== null) clearTimer(timerId);
    timerId = setTimer(() => {
      timerId = null;
      if (frameRefreshPending) return;
      frameRefreshPending = true;
      const runRefresh = () => {
        frameRefreshPending = false;
        refresh();
      };
      scheduleFrame(runRefresh);
    }, delayMs);
  };
}

function addPlateauLayerSafely(map, sourceLayerName) {
  try {
    return addPlateauLayer(map, sourceLayerName);
  } catch (e) {
    console.warn('[shadow-ui] addPlateauLayer failed:', sourceLayerName, e.message);
    plateauObservability.operationalFailure('plateau_layer_initialization_failure', { stage: 'add_layer' });
    return false;
  }
}

function addPlateauLayerFromCandidates(map, sourceLayerNames = []) {
  const candidates = [...sourceLayerNames, ...PLATEAU_SOURCE_LAYER_CANDIDATES];
  const tried = new Set();
  for (const name of candidates) {
    if (!name || tried.has(name)) continue;
    tried.add(name);
    if (addPlateauLayerSafely(map, name)) return true;
  }
  return false;
}

function handlePlateauSourceLoad(map) {
  if (map.getLayer("plateau-buildings")) return;
  const src = map.getSource("plateau");
  if (!src) return;
  try {
    const layers = src.vectorLayerIds;
    if (layers && layers.length > 0) {
      if (addPlateauLayerFromCandidates(map, layers)) {
        plateauObservability.primarySuccess();
      }
    } else {
      addPlateauLayerFromCandidates(map);
    }
  } catch (err) {
    console.warn('[shadow-ui] vectorLayerIds access failed:', err.message);
    plateauObservability.operationalFailure('plateau_layer_initialization_failure', { stage: 'source_metadata' });
    addPlateauLayerFromCandidates(map);
  }
}

export function isPlateauSourceError({ message = '', sourceId, currentUrl }) {
  return sourceId === 'plateau' ||
    message.includes("plateau") ||
    Boolean(currentUrl && message.includes(currentUrl.replace("pmtiles://", "")));
}

export function handlePlateauSourceError(map, message, sourceId, {
  observability = plateauObservability,
} = {}) {
  if (!isPlateauSourceError({ message, sourceId, currentUrl: PLATEAU_PRIMARY_URL })) return;

  const loweredMessage = message.toLowerCase();
  const isTimeout = loweredMessage.includes("timeout") ||
    loweredMessage.includes("timed out");

  observability.primarySourceUnavailable({ failure_kind: isTimeout ? 'timeout' : 'source_error' });
  showUnavailableNotice();
}

export function handlePlateauSourceTimeout(map, {
  observability = plateauObservability,
  showNotice = showUnavailableNotice,
} = {}) {
  observability.primarySourceUnavailable({ failure_kind: 'timeout' });
  showNotice();
  return true;
}

export function ensurePlateauLayers(map, {
  refresh = updateShadows,
  statsRefreshDelayMs = PLATEAU_STATS_REFRESH_DEBOUNCE_MS,
  statsRefreshRequestFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : undefined,
} = {}) {
  if (map.getSource("plateau")) return;
  let sourceLoaded = false;
  let sourceLoadTimerId = null;
  const scheduleStatsRefresh = createDebouncedPlateauStatsRefresh(map, refresh, {
    delayMs: statsRefreshDelayMs,
    requestFrame: statsRefreshRequestFrame,
  });

  try {
    map.addSource("plateau", buildPlateauSourceConfig());
  } catch (e) {
    console.warn("Failed to add PLATEAU source:", e);
    plateauObservability.operationalFailure('plateau_source_initialization_failure', { stage: 'add_source' });
    return;
  }

  map.on("sourcedata", (e) => {
    if (e.sourceId !== "plateau") return;
    if (e.sourceDataType === "content") scheduleStatsRefresh();
    if (!e.isSourceLoaded) return;
    sourceLoaded = true;
    if (sourceLoadTimerId !== null) {
      clearTimeout(sourceLoadTimerId);
      sourceLoadTimerId = null;
    }
    handlePlateauSourceLoad(map);
    scheduleStatsRefresh();
  });

  map.on("error", (event) => {
    const msg = String(event?.error?.message || "");
    handlePlateauSourceError(map, msg, event?.sourceId);
  });

  sourceLoadTimerId = setTimeout(() => {
    sourceLoadTimerId = null;
    if (sourceLoaded) return;
    // Do not let optimistic addLayer calls mask a stalled PMTiles source.
    handlePlateauSourceTimeout(map);
  }, PLATEAU_SOURCE_TIMEOUT_MS);
}

export function togglePlateauVisibility(map, visible) {
  state.plateauVisible = visible;
  if (map.getLayer("plateau-buildings")) {
    map.setLayoutProperty(
      "plateau-buildings",
      "visibility",
      visible ? "visible" : "none"
    );
  }
  updatePlateauErrorNotice();
}

export function ensureBuildingLayers(map) {
  if (map.getSource("buildings")) return;

  map.addSource("buildings", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "buildings-fill",
    type: "fill",
    source: "buildings",
    paint: {
      "fill-color": "#4f46e5",
      "fill-opacity": 0.12,
    },
  });

  map.addLayer({
    id: "buildings-extrusion",
    type: "fill-extrusion",
    source: "buildings",
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["get", "height"],
        0,
        "#60a5fa",
        60,
        "#34d399",
        150,
        "#f97316",
        300,
        "#a855f7",
      ],
      "fill-extrusion-opacity": 0.55,
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-vertical-gradient": true,
    },
  });

  map.addLayer({
    id: "buildings-outline",
    type: "line",
    source: "buildings",
    paint: {
      "line-color": "#1f2937",
      "line-opacity": 0.35,
      "line-width": 1,
    },
  });
}

export function reorderCustomLayers(map) {
  if (!map.getLayer("shadows-fill")) return;

  const buildingLayerIds = [
    "buildings-fill",
    "buildings-extrusion",
    "plateau-buildings",
    "building-3d",
  ];
  const style = map.getStyle();
  if (!style || !style.layers) return;

  for (const layer of style.layers) {
    if (buildingLayerIds.includes(layer.id)) {
      try {
        map.moveLayer("shadows-fill", layer.id);
      } catch (e) {
        console.warn('[shadow-ui] moveLayer failed:', e.message);
      }
      break;
    }
  }
}

export function ensureShadowLayers(map) {
  if (map.getSource("shadows")) return;

  map.addSource("shadows", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  const beforeLayer =
    map.getLayer("building-3d") ? "building-3d" :
    map.getLayer("buildings-extrusion") ? "buildings-extrusion" :
    map.getLayer("plateau-buildings") ? "plateau-buildings" :
    map.getLayer("buildings-fill") ? "buildings-fill" :
    undefined;

  map.addLayer({
    id: "shadows-fill",
    type: "fill-extrusion",
    source: "shadows",
    paint: {
      "fill-extrusion-color": "#6b7280",
      "fill-extrusion-opacity": 0.32,
      "fill-extrusion-height": 0.1,
    },
  }, beforeLayer);
}

function showUnavailableNotice() {
  const notice = document.getElementById("plateauFallbackNotice");
  if (!notice) return;
  notice.textContent = 'PLATEAU建物データを取得できません。時間をおいて再読み込みしてください';
  notice.classList.remove("hidden");
}
