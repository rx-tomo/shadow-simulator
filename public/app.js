// public/app.js — エントリポイント（モジュール統合・起動）

import { state, el, getFootprints, DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_PITCH } from './state.js';
import { initMap, setupMapErrorHandler, setBasemap, applyExternalBuildingColorTheme, showFileNotice, updatePlateauErrorNotice } from './map-init.js';
import { ensurePlateauLayers, ensureBuildingLayers, ensureShadowLayers, updateShadows, reorderCustomLayers, computeShadowForBuilding } from './shadow-ui.js';
import { setupPanelToggle, setupBuildingControls, setupDateTimeControls, setupPlayDay, initDateTimeControls, setupViewControls, setupBasemapControls, setupPlateauToggle, setupBasemapBuildingsToggle, setupPlateauPopup, updateTimeSliderRange, searchPlace } from './panel.js';
import { initTerraDraw, updateBuildings, setUiFromDefaults } from './building.js';
import { decodeMapState, encodeMapState, applyUrlParams, updateUrlFromState } from './url-params.js';
import { refreshProFeatures, bindProFeatureControls, createCurrentComparisonSnapshot, saveComparisonBaseline, clearComparisonBaseline, renderComparisonReport } from './pro-features-ui.js?v=20260908-1';
import { restoreSharedInputs, bindMapHashSync, bindShareButton } from './share-ui.js';
import { bindExportButtons } from './export-ui.js';
import { refreshAfterMapMove } from './analytics-policy.js';
import { plateauObservability } from './plateau-observability.js';
import { setupOnboarding } from './onboarding.js?v=20260731-1';

const QUICK_START_WINTER_MONTH_DAY = '12-22';
const QUICK_START_WINTER_TIME = '14:00';
const QUICK_START_WINTER_MINUTES = 14 * 60;
const QUICK_START_TOKYO_CENTER = [139.767, 35.681];

function getQuickStartWinterDate() {
  const now = luxon.DateTime.now().setZone(state.timezone);
  const currentYearWinter = luxon.DateTime.fromISO(`${now.year}-${QUICK_START_WINTER_MONTH_DAY}`, { zone: state.timezone });
  const target = now > currentYearWinter ? currentYearWinter.plus({ years: 1 }) : currentYearWinter;
  return target.toISODate();
}

function getAttributionParams() {
  const params = new URLSearchParams(location.search);
  return {
    source_campaign: params.get('utm_campaign') || '(none)',
    source_content: params.get('utm_content') || '(none)',
  };
}

function getEntryParams() {
  const params = new URLSearchParams(location.search);
  return {
    entry_surface: params.get('entry_surface') || '(none)',
    entry_cta: params.get('entry_cta') || '(none)',
  };
}

function updateQuickStartUrlFallback(preset, date, time) {
  const decoded = decodeMapState(location.hash);
  const center = preset === "tokyo_winter"
    ? QUICK_START_TOKYO_CENTER
    : [decoded?.lng ?? DEFAULT_CENTER[0], decoded?.lat ?? DEFAULT_CENTER[1]];
  const hash = encodeMapState({
    lat: center[1],
    lng: center[0],
    zoom: preset === "tokyo_winter" ? DEFAULT_ZOOM : decoded?.zoom ?? DEFAULT_ZOOM,
    bearing: preset === "tokyo_winter" ? 0 : decoded?.bearing ?? 0,
    pitch: preset === "tokyo_winter" ? DEFAULT_PITCH : decoded?.pitch ?? DEFAULT_PITCH,
    date,
    time,
    note: el("shareNoteInput")?.value || decoded?.note || undefined,
  });
  if (hash) {
    history.replaceState(null, "", "#" + hash);
  }
}

function applyQuickStart(map, preset) {
  const dateInput = el("dateInput");
  const timeInput = el("timeInput");
  const timeRange = el("timeRange");
  const winterDate = getQuickStartWinterDate();

  if (dateInput) dateInput.value = winterDate;
  if (timeInput) timeInput.value = QUICK_START_WINTER_TIME;
  if (timeRange) timeRange.value = String(QUICK_START_WINTER_MINUTES);

  if (map && preset === "tokyo_winter") {
    map.jumpTo({
      center: QUICK_START_TOKYO_CENTER,
      zoom: 16,
      pitch: 55,
      bearing: 0,
    });
    const pitchRange = el("pitchRange");
    const bearingRange = el("bearingRange");
    if (pitchRange) pitchRange.value = "55";
    if (bearingRange) bearingRange.value = "0";
  }

  if (map) {
    updateTimeSliderRange();
    if (timeRange) timeRange.value = String(QUICK_START_WINTER_MINUTES);
    if (timeInput) timeInput.value = QUICK_START_WINTER_TIME;
    updateShadows();
    updateUrlFromState(map);
    refreshProFeatures(map);
  } else {
    updateQuickStartUrlFallback(preset, winterDate, QUICK_START_WINTER_TIME);
  }

  window.shadowAnalytics.track('quick_start_click', {
    preset,
    ...getAttributionParams(),
  });
}

function bindQuickStartControls(getMap) {
  const tokyoButton = el("quickStartTokyoWinterButton");
  const hereButton = el("quickStartWinterHereButton");

  tokyoButton?.addEventListener("click", () => {
    applyQuickStart(getMap?.(), "tokyo_winter");
  });

  hereButton?.addEventListener("click", () => {
    applyQuickStart(getMap?.(), "winter_here");
  });
}

function main() {
  showFileNotice();
  setupPanelToggle();
  setupOnboarding();
  setupBuildingControls();
  setupDateTimeControls();
  setupPlayDay();
  initDateTimeControls();
  setUiFromDefaults();

  // URLハッシュからパラメータを解析（map初期化前）
  const urlParams = decodeMapState(location.hash);

  // URLハッシュの日時/共有メモは map 不要なので先に復元
  restoreSharedInputs(urlParams);

  // UIラベル更新はmap不要なので先に登録（headless環境でmap.loadが遅延しても応答）
  el("plateauToggle").addEventListener("change", () => {
    el("plateauLabel").textContent = el("plateauToggle").checked ? "ON" : "OFF";
  });
  el("basemapBuildingsToggle").addEventListener("change", () => {
    el("basemapBuildingsLabel").textContent = el("basemapBuildingsToggle").checked ? "ON" : "OFF";
  });

  let map;
  try {
    map = initMap();
  } catch (e) {
    console.warn('[app] Map initialization failed:', e.message);
    plateauObservability.operationalFailure('map_initialization_failure', { stage: 'init_map' });
  }

  if (map) {
    if (window.__shadowAnalyticsTestConfig) {
      window.__shadowAnalyticsTestMap = map;
    }
    setupViewControls(map);
    bindProFeatureControls(map);
    refreshProFeatures(map);
  }
  el("searchButton").addEventListener("click", () => { if (map) searchPlace(map); });
  el("searchInput").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && map) searchPlace(map); });
  bindShareButton(map);
  bindExportButtons(map);
  bindQuickStartControls(() => map);

  // Track app load regardless of map state
  window.shadowAnalytics.track('app_load', {
    has_url_params: Boolean(location.hash && location.hash.length > 1),
    ...getAttributionParams(),
    ...getEntryParams(),
  });

  // Loading indicator can get stuck on some environments if map idle/load events do not settle.
  // Keep a global fallback timer outside map.load.
  let loadingOverlayHidden = false;
  let loadingOverlayHideTimer = null;
  const hideLoadingOverlay = () => {
    if (loadingOverlayHidden) return;
    loadingOverlayHidden = true;
    if (loadingOverlayHideTimer) {
      clearTimeout(loadingOverlayHideTimer);
      loadingOverlayHideTimer = null;
    }
    el("loadingOverlay")?.classList.add("hidden");
  };
  const scheduleLoadingOverlayHide = (delayMs = 0, reason = 'map_ready') => {
    if (loadingOverlayHidden) return;
    if (loadingOverlayHideTimer) clearTimeout(loadingOverlayHideTimer);
    loadingOverlayHideTimer = setTimeout(() => {
      if (reason === 'timeout') {
        plateauObservability.operationalFailure('map_loading_timeout', { stage: 'initial_load' });
      }
      hideLoadingOverlay();
    }, delayMs);
  };
  // Hard fallback: hide even if map "load" itself never fires.
  scheduleLoadingOverlayHide(8000, 'timeout');

  if (map) {
    map.on("load", () => {
      state.map = map;
      setupMapErrorHandler(map);

      // PMTiles protocol registration (optional - PLATEAU layer)
      try {
        if (typeof pmtiles !== "undefined" && pmtiles.Protocol) {
          const protocol = new pmtiles.Protocol();
          maplibregl.addProtocol("pmtiles", protocol.tile);
        } else {
          console.warn("PMTiles library not available – PLATEAU layer disabled");
          plateauObservability.operationalFailure('plateau_protocol_unavailable', { stage: 'protocol_check' });
        }
      } catch (e) {
        console.warn("PMTiles initialization failed:", e);
        plateauObservability.operationalFailure('plateau_protocol_initialization_failure', { stage: 'protocol_init' });
      }

      setupBasemapControls(map);
      setBasemap(map, el("basemapSelect")?.value || state.basemap);
      map.on("styledata", () => {
        applyExternalBuildingColorTheme(map);
        reorderCustomLayers(map);
        // ベースマップ建物トグル状態を復元
        if (!state.basemapBuildingsVisible && map.getLayer("building-3d")) {
          map.setLayoutProperty("building-3d", "visibility", "none");
        }
      });

      try {
        ensurePlateauLayers(map);
      } catch (e) {
        console.warn("PLATEAU layers failed:", e);
        plateauObservability.operationalFailure('plateau_initialization_failure', { stage: 'ensure_layers' });
      }

      ensureBuildingLayers(map);
      ensureShadowLayers(map);
      initTerraDraw(map);
      setupPlateauToggle(map);
      setupBasemapBuildingsToggle(map);
      updatePlateauErrorNotice();
      setupPlateauPopup(map);
      applyExternalBuildingColorTheme(map);
      updateTimeSliderRange();
      updateBuildings();

      // PLATEAU影をマップ移動後に再計算（デバウンス500ms）+ URL更新
      let shadowDebounceTimer = null;
      map.on("moveend", (event) => {
        if (shadowDebounceTimer) clearTimeout(shadowDebounceTimer);
        shadowDebounceTimer = setTimeout(() => {
          refreshAfterMapMove(event, {
            updateShadows,
            onUserInteraction: () => {
              updateUrlFromState(map);
              refreshProFeatures(map);
              window.shadowAnalytics.track('map_interact', {
                zoom_level: Math.round(map.getZoom()),
              });
            },
          });
        }, 500);
      });

      // URL復元のjumpTo()も上のmoveend listenerで統計を再集計するため、
      // listener登録後に適用する。
      if (urlParams) {
        applyUrlParams(map, urlParams);
        updateTimeSliderRange();
        map.once("idle", updateShadows);
      }
      if (window.__shadowAnalyticsTestConfig) {
        window.__shadowAnalyticsTestMapReady = true;
      }

      // 日時変更時もURL更新
      bindMapHashSync(map, () => refreshProFeatures(map));

      // 初回URL更新（map load直後）
      updateUrlFromState(map);
      refreshProFeatures(map);

      // Hide loading overlay with robust fallbacks (idle may not fire in some environments)
      map.once("idle", hideLoadingOverlay);
      map.once("sourcedata", () => {
        scheduleLoadingOverlayHide(400);
      });
      map.once("render", () => {
        scheduleLoadingOverlayHide(1200);
      });
      map.once("error", () => {
        scheduleLoadingOverlayHide(900);
      });

    });
  }

}

main();

// デバッグ/テスト用: モジュールスコープの変数・関数をグローバルに公開
if (typeof window !== 'undefined') {
  window.state = state;
  window.updateShadows = updateShadows;
  window.updateBuildings = updateBuildings;
  window.computeShadowForBuilding = computeShadowForBuilding;
  window.getFootprints = getFootprints;
  window.ensureShadowLayers = ensureShadowLayers;
  window.ensureBuildingLayers = ensureBuildingLayers;
  window.ensurePlateauLayers = ensurePlateauLayers;
  window.reorderCustomLayers = reorderCustomLayers;
  window.shadowAppTest = {
    createCurrentComparisonSnapshot,
    saveComparisonBaseline,
    clearComparisonBaseline,
    refreshProFeatures,
    renderComparisonReport,
  };
}
