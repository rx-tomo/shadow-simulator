// public/panel.js — パネルUI操作・日時制御

import { state, el, stopOrbit, MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT, MIN_BUILDING_FLOORS, MAX_BUILDING_FLOORS, MIN_FLOOR_HEIGHT, MAX_FLOOR_HEIGHT, DEFAULT_TIME, DEFAULT_TIME_MINUTES, MIN_TIME_MINUTES, MAX_TIME_MINUTES, SEARCH_RESULT_ZOOM, PLAY_DAY_STEP_MINUTES, PLAY_DAY_INTERVAL_MS, PITCH_TOP, PITCH_OBLIQUE, PITCH_LOW, PLATEAU_MIN_ZOOM } from './state.js';
import { clamp, round } from './calc.js';
import { setBasemap } from './map-init.js';
import { updateShadows, togglePlateauVisibility } from './shadow-ui.js';
import { applyUiToSelectionOrDefaults } from './building.js';

export function syncHeightFloors(from) {
  if (from === "height") {
    state.uiHeight = clamp(Number(el("heightInput").value), MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT);
    state.uiFloors = clamp(
      Math.round(state.uiHeight / state.floorHeight),
      MIN_BUILDING_FLOORS,
      MAX_BUILDING_FLOORS
    );
  } else if (from === "floors") {
    state.uiFloors = clamp(Number(el("floorsInput").value), MIN_BUILDING_FLOORS, MAX_BUILDING_FLOORS);
    state.uiHeight = clamp(state.uiFloors * state.floorHeight, MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT);
  } else if (from === "floorHeight") {
    state.floorHeight = clamp(Number(el("floorHeightInput").value), MIN_FLOOR_HEIGHT, MAX_FLOOR_HEIGHT);
    state.uiHeight = clamp(state.uiFloors * state.floorHeight, MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT);
  }

  el("heightInput").value = String(round(state.uiHeight, 1));
  el("heightRange").value = String(round(state.uiHeight, 1));
  el("floorsInput").value = String(state.uiFloors);
  el("floorsRange").value = String(state.uiFloors);

  applyUiToSelectionOrDefaults();
}

export function initDateTimeControls() {
  const now = luxon.DateTime.now().setZone(state.timezone);
  el("dateInput").value = now.toISODate();
  // 初期表示は日中にして「影が出ない」混乱を避ける
  el("timeInput").value = DEFAULT_TIME;
  el("timeRange").value = String(DEFAULT_TIME_MINUTES);
  // 初期化時はmapが未初期化のため、map load後にupdateTimeSliderRangeを呼ぶ
}

export function getSunlightRange(dateStr, center) {
  const date = new Date(dateStr + "T12:00:00");
  const times = SunCalc.getTimes(date, center.lat, center.lng);
  const sunrise = luxon.DateTime.fromJSDate(times.sunrise).setZone(state.timezone);
  const sunset = luxon.DateTime.fromJSDate(times.sunset).setZone(state.timezone);
  // 白夜/極夜で Invalid Date の場合はフォールバック
  if (!sunrise.isValid || !sunset.isValid) {
    return { startMin: MIN_TIME_MINUTES, endMin: MAX_TIME_MINUTES, sunrise: null, sunset: null };
  }
  const startMin = Math.max(MIN_TIME_MINUTES, sunrise.hour * 60 + sunrise.minute - 30);
  const endMin = Math.min(MAX_TIME_MINUTES, sunset.hour * 60 + sunset.minute + 30);
  return { startMin, endMin, sunrise, sunset };
}

export function updateTimeSliderRange() {
  const dateStr = el("dateInput").value;
  if (!state.map) return;
  const center = state.map.getCenter();
  const { startMin, endMin, sunrise, sunset } = getSunlightRange(dateStr, center);
  const range = el("timeRange");
  range.min = String(startMin);
  range.max = String(endMin);
  // 現在値がレンジ外なら補正
  const current = Number(range.value);
  if (current < startMin) range.value = String(startMin);
  if (current > endMin) range.value = String(endMin);
  timeRangeToTimeInput();
  // 日の出/日の入り時刻をラベルに表示
  const sunriseEl = el("sunriseTime");
  const sunsetEl = el("sunsetTime");
  if (sunriseEl) sunriseEl.textContent = sunrise ? `日の出 ${sunrise.toFormat("H:mm")}` : "日の出 --:--";
  if (sunsetEl) sunsetEl.textContent = sunset ? `日の入り ${sunset.toFormat("H:mm")}` : "日の入り --:--";
}

export function timeRangeToTimeInput() {
  const m = Number(el("timeRange").value);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  el("timeInput").value = `${hh}:${mm}`;
}

export function timeInputToRange() {
  const [hh, mm] = el("timeInput").value.split(":").map(Number);
  if (Number.isFinite(hh) && Number.isFinite(mm)) {
    el("timeRange").value = String(hh * 60 + mm);
  }
}

export function setupViewControls(map) {
  el("pitchRange").addEventListener("input", () => {
    map.setPitch(Number(el("pitchRange").value));
  });

  el("bearingRange").addEventListener("input", () => {
    map.setBearing(Number(el("bearingRange").value));
  });

  el("viewPresetRow").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-view]");
    if (!btn) return;
    const view = btn.dataset.view;
    applyViewPreset(map, view);
  });

  map.on("dragstart", stopOrbit);
  map.on("rotatestart", stopOrbit);
  map.on("pitchstart", stopOrbit);
  map.on("rotate", () => {
    el("bearingRange").value = String(Math.round(map.getBearing()));
  });
  map.on("pitch", () => {
    el("pitchRange").value = String(Math.round(map.getPitch()));
  });
}

export function applyViewPreset(map, preset) {
  if (preset === "top") {
    stopOrbit();
    map.easeTo({ pitch: PITCH_TOP, bearing: map.getBearing(), duration: 500 });
  } else if (preset === "oblique") {
    stopOrbit();
    map.easeTo({ pitch: PITCH_OBLIQUE, duration: 500 });
  } else if (preset === "low") {
    stopOrbit();
    map.easeTo({ pitch: PITCH_LOW, duration: 500 });
  } else if (preset === "north") {
    stopOrbit();
    map.easeTo({ bearing: 0, duration: 500 });
    el("bearingRange").value = "0";
  } else if (preset === "orbit") {
    startOrbit(map);
  }
  el("pitchRange").value = String(Math.round(map.getPitch()));
  el("bearingRange").value = String(Math.round(map.getBearing()));
}

export function startOrbit(map) {
  stopOrbit();
  state.orbiting = true;
  const center = map.getCenter();
  let bearing = map.getBearing();

  state.orbitTimer = window.setInterval(() => {
    bearing = (bearing + 2) % 360;
    map.easeTo({
      center,
      bearing,
      pitch: map.getPitch(),
      duration: 80,
      easing: (t) => t,
    });
    el("bearingRange").value = String(Math.round(map.getBearing()));
  }, 100);
}

export async function searchPlace(map) {
  const q = el("searchInput").value.trim();
  if (!q) return;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "ja" },
    });
    const json = await res.json();
    if (!json?.length) return;
    window.shadowAnalytics.track('search_place', {
      query: q,
      result_count: json.length,
    });
    const item = json[0];
    const lng = Number(item.lon);
    const lat = Number(item.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    map.easeTo({ center: [lng, lat], zoom: SEARCH_RESULT_ZOOM, duration: 700 });
  } catch (e) {
    console.warn('[panel] searchPlace failed:', e.message);
  }
}

export function setupBasemapControls(map) {
  const select = el("basemapSelect");
  if (!select) return;
  select.value = state.basemap;
  select.addEventListener("change", () => {
    stopPlayDay();
    setBasemap(map, select.value);
  });
}

export function setupPlateauToggle(map) {
  const toggle = el("plateauToggle");
  const label = el("plateauLabel");
  const hint = el("plateauHint");
  if (!toggle) return;

  toggle.addEventListener("change", () => {
    const visible = toggle.checked;
    togglePlateauVisibility(map, visible);
    updateShadows();
    if (label) label.textContent = visible ? "ON" : "OFF";
  });

  map.on("zoom", () => {
    if (!hint) return;
    const zoom = map.getZoom();
    if (zoom < PLATEAU_MIN_ZOOM && toggle.checked) {
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }
  });
}

export function setupBasemapBuildingsToggle(map) {
  const toggle = el("basemapBuildingsToggle");
  const label = el("basemapBuildingsLabel");
  if (!toggle) return;

  toggle.addEventListener("change", () => {
    const visible = toggle.checked;
    state.basemapBuildingsVisible = visible;
    if (map.getLayer("building-3d")) {
      map.setLayoutProperty(
        "building-3d",
        "visibility",
        visible ? "visible" : "none"
      );
    }
    updateShadows();
    if (label) label.textContent = visible ? "ON" : "OFF";
  });
}

export function formatPlateauPopupHeight(props = {}) {
  for (const value of [props.measuredHeight, props.height, props.z]) {
    const height = Number(value);
    if (Number.isFinite(height) && height > 0) return `${round(height, 1)} m`;
  }
  return "不明";
}

export function setupPlateauPopup(map) {
  // HTML escaping helper
  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  map.on("click", "plateau-buildings", (e) => {
    // selectモードやdrawモード中はスキップ
    if (state.activeMode !== "render") return;
    const feature = e.features?.[0];
    if (!feature) return;
    const props = feature.properties || {};
    const heightStr = formatPlateauPopupHeight(props);
    const usage = props.usage || props.type || "";
    const safeHeightStr = escapeHtml(heightStr);
    const safeUsage = escapeHtml(usage);
    const html = `<dl class="plateau-popup">
      <dt>高さ</dt><dd>${safeHeightStr}</dd>
      ${safeUsage ? `<dt>用途</dt><dd>${safeUsage}</dd>` : ""}
    </dl>
    <a href="./articles/building-data-and-height/">この高さについて</a>`;
    new maplibregl.Popup({ closeButton: true, maxWidth: "240px" })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  // カーソル変更
  map.on("mouseenter", "plateau-buildings", () => {
    if (state.activeMode === "render") {
      map.getCanvas().style.cursor = "pointer";
    }
  });
  map.on("mouseleave", "plateau-buildings", () => {
    map.getCanvas().style.cursor = "";
  });
}

export function setupPanelToggle() {
  const panel = el("panel");
  const openBtn = el("panelOpenBtn");
  const toggleBtn = el("panelToggle");
  if (!panel || !toggleBtn) return;

  // パネル内「閉じる」ボタン
  toggleBtn.addEventListener("click", () => {
    panel.classList.add("collapsed");
    if (openBtn) openBtn.classList.remove("hidden");
    const legend = document.getElementById('legend');
    if (legend) legend.classList.add('legend-panel-closed');
  });

  // パネル外「開く」ボタン
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      const guide = document.getElementById("xMobileGuide");
      const shouldTrackGuideOpen = guide && !guide.classList.contains("hidden") && isXMobileEntry();
      panel.classList.remove("collapsed");
      openBtn.classList.add("hidden");
      guide?.classList.add("hidden");
      if (shouldTrackGuideOpen) {
        window.shadowAnalytics?.track?.(
          "social_mobile_panel_open_from_guide",
          getSocialMobileGuideParams()
        );
      }
      const legend = document.getElementById('legend');
      if (legend) legend.classList.remove('legend-panel-closed');
    });
  }

  // モバイル: 初期状態でパネルを閉じる
  if (window.innerWidth <= 640) {
    panel.classList.add("collapsed");
    if (openBtn) openBtn.classList.remove("hidden");
    const legend = document.getElementById('legend');
    if (legend) legend.classList.add('legend-panel-closed');
  }

  setupXMobileGuide();
}

export function isXMobileEntry(search = window.location?.search || "") {
  const params = new URLSearchParams(search);
  const source = (params.get("utm_source") || "").toLowerCase();
  const campaign = (params.get("utm_campaign") || "").toLowerCase();
  return source === "x" || campaign === "x240cities-v05";
}

function getSocialMobileGuideParams() {
  const params = new URLSearchParams(window.location?.search || "");
  return {
    source: params.get("utm_source") || "(none)",
    source_campaign: params.get("utm_campaign") || "(none)",
    source_content: params.get("utm_content") || "(none)",
  };
}

export function setupXMobileGuide() {
  const guide = document.getElementById("xMobileGuide");
  if (!guide || window.innerWidth > 640 || !isXMobileEntry()) return;

  guide.classList.remove("hidden");
  const analyticsParams = getSocialMobileGuideParams();
  window.shadowAnalytics?.track?.("social_mobile_guide_view", analyticsParams);
  const closeBtn = document.getElementById("xMobileGuideClose");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      guide.classList.add("hidden");
      window.shadowAnalytics?.track?.("social_mobile_guide_close", analyticsParams);
    });
  }
}

export function setupBuildingControls() {
  el("heightInput").addEventListener("input", () => syncHeightFloors("height"));
  el("heightRange").addEventListener("input", (e) => {
    el("heightInput").value = e.target.value;
    syncHeightFloors("height");
  });
  el("floorsInput").addEventListener("input", () => syncHeightFloors("floors"));
  el("floorsRange").addEventListener("input", (e) => {
    el("floorsInput").value = e.target.value;
    syncHeightFloors("floors");
  });
  el("floorHeightInput").addEventListener("input", () =>
    syncHeightFloors("floorHeight")
  );
}

export function setupDateTimeControls() {
  el("timeRange").addEventListener("input", () => {
    stopPlayDay();
    timeRangeToTimeInput();
    updateShadows();
  });
  el("timeRange").addEventListener("change", () => {
    window.shadowAnalytics.track('datetime_change', { field: 'time', control: 'range' });
  });
  el("timeInput").addEventListener("input", () => {
    stopPlayDay();
    timeInputToRange();
    updateShadows();
  });
  el("timeInput").addEventListener("change", () => {
    window.shadowAnalytics.track('datetime_change', { field: 'time', control: 'input' });
  });
  el("dateInput").addEventListener("input", () => {
    stopPlayDay();
    updateTimeSliderRange();
    updateShadows();
  });
  el("dateInput").addEventListener("change", () => {
    window.shadowAnalytics.track('datetime_change', { field: 'date', control: 'input' });
  });
  el("timezoneSelect").addEventListener("change", () => {
    stopPlayDay();
    state.timezone = el("timezoneSelect").value;
    initDateTimeControls();
    updateTimeSliderRange();
    updateShadows();
  });
}

export function setPlayDayButtonActive(active) {
  const btn = el("playDayButton");
  if (!btn) return;
  btn.classList.toggle("btn-primary", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
  btn.textContent = active ? "■ 停止" : "▶ 1日再生";
  btn.setAttribute("aria-label", active ? "1日再生を停止" : "1日の影を再生");
}

export function stopPlayDay() {
  state.playingDay = false;
  if (state.playDayTimer) {
    window.clearInterval(state.playDayTimer);
    state.playDayTimer = null;
  }
  setPlayDayButtonActive(false);
}

export function startPlayDay() {
  stopPlayDay();
  state.playingDay = true;
  setPlayDayButtonActive(true);
  const range = el("timeRange");
  const minVal = Number(range.min);
  const maxVal = Number(range.max);
  let m = Number(range.value);
  state.playDayTimer = window.setInterval(() => {
    m += PLAY_DAY_STEP_MINUTES;
    if (m > maxVal) m = minVal;
    range.value = String(m);
    timeRangeToTimeInput();
    updateShadows();
  }, PLAY_DAY_INTERVAL_MS);
}

export function setupPlayDay() {
  el("playDayButton").addEventListener("click", () => {
    if (state.playingDay) stopPlayDay();
    else startPlayDay();
  });
}
