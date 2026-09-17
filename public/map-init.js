// public/map-init.js — 地図初期化・ベースマップ・エラーハンドリング

import { state, el, BASEMAP_STYLES, APP_BUILD, DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_PITCH, BASEMAP_BUILDING_COLOR, BASEMAP_BUILDING_OPACITY, PLATEAU_THEME_COLOR, PLATEAU_THEME_OPACITY } from './state.js';

export function initMap() {
  maplibregl.setWorkerUrl(`./vendor/maplibre-gl-csp-worker.js?v=${APP_BUILD}`);

  const map = new maplibregl.Map({
    container: "map",
    style: BASEMAP_STYLES.liberty,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: 0,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

  return map;
}

export function setBasemap(map, kind) {
  const allowed = new Set(Object.keys(BASEMAP_STYLES));
  const next = allowed.has(kind) ? kind : "liberty";
  state.basemap = next;

  map.setStyle(BASEMAP_STYLES[next], {
    transformStyle: (previousStyle, nextStyle) => {
      const customSourceIds = ["plateau", "buildings", "shadows", "td-"];
      const customSources = {};
      const customLayers = [];
      if (previousStyle) {
        for (const [id, src] of Object.entries(previousStyle.sources)) {
          if (customSourceIds.some(prefix => id.startsWith(prefix))) {
            customSources[id] = src;
          }
        }
        for (const layer of previousStyle.layers) {
          const isCustom = customSourceIds.some(prefix =>
            layer.source && layer.source.startsWith(prefix)
          ) || (layer.id && layer.id.startsWith("td-"));
          if (isCustom) customLayers.push(layer);
        }
      }
      return {
        ...nextStyle,
        sources: { ...nextStyle.sources, ...customSources },
        layers: [...nextStyle.layers, ...customLayers],
      };
    },
  });
}

export function applyExternalBuildingColorTheme(map) {
  // OpenFreeMap側の building-3d は style 由来レイヤーなので、存在時に都度上書きする。
  if (map.getLayer("building-3d")) {
    try {
      map.setPaintProperty("building-3d", "fill-extrusion-color", BASEMAP_BUILDING_COLOR);
      map.setPaintProperty("building-3d", "fill-extrusion-opacity", BASEMAP_BUILDING_OPACITY);
    } catch (e) {
      console.warn('[map-init] building-3d paint failed:', e.message);
    }
  }

  // PLATEAU は本アプリが追加するレイヤー。暖色寄りで区別を明確化。
  if (map.getLayer("plateau-buildings")) {
    try {
      map.setPaintProperty("plateau-buildings", "fill-extrusion-color", PLATEAU_THEME_COLOR);
      map.setPaintProperty("plateau-buildings", "fill-extrusion-opacity", PLATEAU_THEME_OPACITY);
    } catch (e) {
      console.warn('[map-init] plateau-buildings paint failed:', e.message);
    }
  }
}

export function updatePlateauErrorNotice() {
  const warningEl = el("plateauErrorNote");
  if (!warningEl) return;
  const show = state.plateauVisible && state.pmtilesRangeError;
  warningEl.classList.toggle("hidden", !show);
}

export function setupMapErrorHandler(map) {
  map.on("error", (event) => {
    const message = String(event?.error?.message || event?.error || "");
    if (!message) return;
    const m = message.toLowerCase();
    const isPmtilesRangeError =
      m.includes("byte serving") ||
      (m.includes("content-length") && m.includes("range")) ||
      (m.includes("partial content") && m.includes("range"));
    if (!isPmtilesRangeError) return;

    state.pmtilesRangeError = true;
    updatePlateauErrorNotice();
  });
}

export function showFileNotice() {
  if (location.protocol === "file:") {
    const notice = el("fileNotice");
    if (notice) notice.classList.remove("hidden");
  }
}
