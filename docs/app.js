const MAPLIBRE_VERSION = "5.13.0";
const APP_BUILD = "20251212-8";

const state = {
  floorHeight: 3.1,
  defaultHeight: 6.2,
  defaultFloors: 2,
  uiHeight: 6.2,
  uiFloors: 2,
  selectedFeatureIds: new Set(),
  activeMode: "render", // render | select | angled-rectangle
  timezone: "Asia/Tokyo",
  orbiting: false,
  orbitTimer: null,
  playingDay: false,
  playDayTimer: null,
  basemap: "voyager",
  map: null,
  terraInstance: null,
};

const el = (id) => document.getElementById(id);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function syncHeightFloors(from) {
  if (from === "height") {
    state.uiHeight = clamp(Number(el("heightInput").value), 1, 500);
    state.uiFloors = clamp(
      Math.round(state.uiHeight / state.floorHeight),
      1,
      100
    );
  } else if (from === "floors") {
    state.uiFloors = clamp(Number(el("floorsInput").value), 1, 100);
    state.uiHeight = clamp(state.uiFloors * state.floorHeight, 1, 500);
  } else if (from === "floorHeight") {
    state.floorHeight = clamp(Number(el("floorHeightInput").value), 2.5, 5.0);
    state.uiHeight = clamp(state.uiFloors * state.floorHeight, 1, 500);
  }

  el("heightInput").value = String(round(state.uiHeight, 1));
  el("heightRange").value = String(round(state.uiHeight, 1));
  el("floorsInput").value = String(state.uiFloors);
  el("floorsRange").value = String(state.uiFloors);

  applyUiToSelectionOrDefaults();
}

function initDateTimeControls() {
  const now = luxon.DateTime.now().setZone(state.timezone);
  el("dateInput").value = now.toISODate();
  // 初期表示は日中にして「影が出ない」混乱を避ける
  el("timeInput").value = "12:00";
  el("timeRange").value = String(12 * 60);
}

function timeRangeToTimeInput() {
  const m = Number(el("timeRange").value);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  el("timeInput").value = `${hh}:${mm}`;
}

function timeInputToRange() {
  const [hh, mm] = el("timeInput").value.split(":").map(Number);
  if (Number.isFinite(hh) && Number.isFinite(mm)) {
    el("timeRange").value = String(hh * 60 + mm);
  }
}

function getCurrentDateTimeUtc() {
  const date = el("dateInput").value;
  const time = el("timeInput").value || "00:00";
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return luxon.DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: state.timezone }
  ).toUTC();
}

function setupViewControls(map) {
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

function applyViewPreset(map, preset) {
  if (preset === "top") {
    stopOrbit();
    map.easeTo({ pitch: 0, bearing: map.getBearing(), duration: 500 });
  } else if (preset === "oblique") {
    stopOrbit();
    map.easeTo({ pitch: 30, duration: 500 });
  } else if (preset === "low") {
    stopOrbit();
    map.easeTo({ pitch: 55, duration: 500 });
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

function startOrbit(map) {
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

function stopOrbit() {
  state.orbiting = false;
  if (state.orbitTimer) {
    window.clearInterval(state.orbitTimer);
    state.orbitTimer = null;
  }
}

async function searchPlace(map) {
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
    const item = json[0];
    const lng = Number(item.lon);
    const lat = Number(item.lat);
    map.easeTo({ center: [lng, lat], zoom: 17, duration: 700 });
  } catch {
    // ignore
  }
}

function initMap() {
  // MapLibre v5 は環境によって CSP worker が必要なため、同一ディレクトリの worker を使う。
  // file:// でも動く可能性があるが、ブラウザ制限で動かない場合はHTTP配信（serve.command）を推奨。
  maplibregl.setWorkerUrl(`./maplibre-gl-csp-worker.js?v=${APP_BUILD}`);

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        cartoVoyager: {
          type: "raster",
          // tile.openstreetmap.org はCORS制限で黒画面になることがあるため、CORS対応のベースマップを使う
          tiles: [
            "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors © CARTO",
        },
        cartoLight: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors © CARTO",
        },
        cartoDark: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors © CARTO",
        },
      },
      layers: [
        { id: "basemap-voyager", type: "raster", source: "cartoVoyager" },
        {
          id: "basemap-light",
          type: "raster",
          source: "cartoLight",
          layout: { visibility: "none" },
        },
        {
          id: "basemap-dark",
          type: "raster",
          source: "cartoDark",
          layout: { visibility: "none" },
        },
      ],
    },
    center: [139.767, 35.681],
    zoom: 15,
    pitch: 30,
    bearing: 0,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

  return map;
}

function setBasemap(map, kind) {
  const allowed = new Set(["voyager", "light", "dark"]);
  const next = allowed.has(kind) ? kind : "voyager";
  state.basemap = next;

  const idByKind = {
    voyager: "basemap-voyager",
    light: "basemap-light",
    dark: "basemap-dark",
  };
  const activeId = idByKind[next];
  for (const layerId of Object.values(idByKind)) {
    if (!map.getLayer(layerId)) continue;
    map.setLayoutProperty(
      layerId,
      "visibility",
      layerId === activeId ? "visible" : "none"
    );
  }
}

function setupBasemapControls(map) {
  const select = el("basemapSelect");
  if (!select) return;
  select.value = state.basemap;
  select.addEventListener("change", () => {
    stopPlayDay();
    setBasemap(map, select.value);
  });
}

function initTerraDraw(map) {
  const adapter = new terraDrawMaplibreGlAdapter.TerraDrawMapLibreGLAdapter({
    map,
    renderBelowLayerId: "buildings-fill",
    coordinatePrecision: 7,
    prefixId: "td",
  });

  const disableAllMapInteractions = () => {
    try {
      map.stop?.();
      if (map.dragPan?.isEnabled()) map.dragPan.disable();
      if (map.dragRotate?.isEnabled()) map.dragRotate.disable();
      if (map.scrollZoom?.isEnabled()) map.scrollZoom.disable();
      if (map.boxZoom?.isEnabled()) map.boxZoom.disable();
      if (map.doubleClickZoom?.isEnabled()) map.doubleClickZoom.disable();
      if (map.keyboard?.isEnabled()) map.keyboard.disable();
      if (map.touchZoomRotate?.isEnabled()) map.touchZoomRotate.disable();
      if (map.touchPitch?.isEnabled()) map.touchPitch.disable();
    } catch {
      // ignore
    }
  };

  const enableAllMapInteractions = () => {
    try {
      if (map.dragPan && !map.dragPan.isEnabled()) map.dragPan.enable();
      if (map.dragRotate && !map.dragRotate.isEnabled()) map.dragRotate.enable();
      if (map.scrollZoom && !map.scrollZoom.isEnabled()) map.scrollZoom.enable();
      if (map.boxZoom && !map.boxZoom.isEnabled()) map.boxZoom.enable();
      if (map.doubleClickZoom && !map.doubleClickZoom.isEnabled()) map.doubleClickZoom.enable();
      if (map.keyboard && !map.keyboard.isEnabled()) map.keyboard.enable();
      if (map.touchZoomRotate && !map.touchZoomRotate.isEnabled()) map.touchZoomRotate.enable();
      if (map.touchPitch && !map.touchPitch.isEnabled()) map.touchPitch.enable();
    } catch {
      // ignore
    }
  };

  const setModeButtonActive = (activeIdOrNull) => {
    const btnIds = ["drawRectButton", "selectButton"];
    for (const id of btnIds) {
      const btn = el(id);
      if (!btn) continue;
      const active = id === activeIdOrNull;
      btn.classList.toggle("btn-primary", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  };

  const enterMode = (modeName) => {
    state.activeMode = modeName;
    if (modeName === "angled-rectangle") {
      disableAllMapInteractions();
      draw.setMode("angled-rectangle");
      setModeButtonActive("drawRectButton");
      el("drawHint")?.classList.remove("hidden");
    } else if (modeName === "select") {
      enableAllMapInteractions();
      draw.setMode("select");
      setModeButtonActive("selectButton");
      el("drawHint")?.classList.add("hidden");
    } else {
      // render (解除)
      enableAllMapInteractions();
      draw.setMode("render");
      setModeButtonActive(null);
      el("drawHint")?.classList.add("hidden");
      // 解除時は選択状態をUIに反映しない（混乱を避ける）
      state.selectedFeatureIds = new Set();
      setUiFromDefaults();
    }
  };

  const toggleMode = (modeName) => {
    stopOrbit();
    if (state.activeMode === modeName) {
      enterMode("render");
      return;
    }
    enterMode(modeName);
  };

  const disablePanRotateOnly = () => {
    try {
      if (map.dragPan?.isEnabled()) map.dragPan.disable();
      if (map.dragRotate?.isEnabled()) map.dragRotate.disable();
    } catch {
      // ignore
    }
  };

  const enablePanRotateOnly = () => {
    try {
      if (map.dragPan && !map.dragPan.isEnabled()) map.dragPan.enable();
      if (map.dragRotate && !map.dragRotate.isEnabled()) map.dragRotate.enable();
    } catch {
      // ignore
    }
  };

  const draw = new terraDraw.TerraDraw({
    adapter,
    modes: [
      new terraDraw.TerraDrawRenderMode({ modeName: "render" }),
      new terraDraw.TerraDrawAngledRectangleMode({
        modeName: "angled-rectangle",
      }),
      new terraDraw.TerraDrawSelectMode({
        modeName: "select",
        flags: {
          polygon: {
            feature: {
              draggable: true,
              rotateable: true,
              scaleable: true,
              coordinates: {
                midpoints: true,
                draggable: true,
                deletable: true,
              },
            },
          },
          "angled-rectangle": {
            feature: {
              draggable: true,
              rotateable: true,
              scaleable: true,
              coordinates: {
                midpoints: true,
                draggable: true,
                deletable: true,
              },
            },
          },
        },
      }),
    ],
  });

  draw.start();
  enterMode("render");

  el("drawRectButton").addEventListener("click", () => {
    toggleMode("angled-rectangle");
  });

  el("selectButton").addEventListener("click", () => {
    toggleMode("select");
  });
  el("deleteButton").addEventListener("click", () => {
    const selectedIds = Array.from(state.selectedFeatureIds ?? []).filter(
      Boolean
    );
    if (selectedIds.length && typeof draw.removeFeatures === "function") {
      draw.removeFeatures(selectedIds);
      state.selectedFeatureIds = new Set();
      setUiFromDefaults();
    } else if (typeof draw.clear === "function") {
      draw.clear();
      state.selectedFeatureIds = new Set();
      setUiFromDefaults();
    } else if (typeof draw.removeFeatures === "function") {
      const snap = draw.getSnapshot?.();
      const features = Array.isArray(snap) ? snap : snap?.features ?? [];
      const ids = features.map((f) => f.id).filter(Boolean);
      if (ids.length) draw.removeFeatures(ids);
      state.selectedFeatureIds = new Set();
      setUiFromDefaults();
    }
    updateBuildings();
  });

  // terra-draw UMD のイベントは ready のみのため、スナップショット差分で更新を検知する
  let lastSignature = "";
  window.setInterval(() => {
    const snapshot = draw.getSnapshot?.();
    if (!snapshot) return;
    const features = Array.isArray(snapshot)
      ? snapshot
      : snapshot.features ?? [];
    const polys = features.filter(
      (f) => f.geometry?.type === "Polygon"
    );
    const signature = JSON.stringify(
      polys.map((f) => f.geometry.coordinates)
    );
    if (signature !== lastSignature) {
      lastSignature = signature;
      updateBuildings();
    }
  }, 500);

  // 操作完了時にも更新（描画/編集直後の反映を確実にする）
  const canvas = map.getCanvas?.();
  let panRotateTemporarilyDisabled = false;

  canvas?.addEventListener("pointerdown", (ev) => {
    // 選択/編集中は「図形を掴んだドラッグ」で地図が動かないようにする
    if (!state.terraInstance?.getFeaturesAtPointerEvent) return;
    if (state.activeMode !== "select") return;
    try {
      const hits = state.terraInstance.getFeaturesAtPointerEvent(ev) ?? [];
      const hitPolygon = hits.some((f) => f.geometry?.type === "Polygon");
      if (hitPolygon) {
        panRotateTemporarilyDisabled = true;
        disablePanRotateOnly();
      }
    } catch {
      // ignore
    }
  });
  canvas?.addEventListener("pointerup", () => {
    updateBuildings();
    updateShadows();
    if (panRotateTemporarilyDisabled && state.activeMode === "select") {
      panRotateTemporarilyDisabled = false;
      enablePanRotateOnly();
    }
  });
  canvas?.addEventListener("pointercancel", () => {
    updateBuildings();
    updateShadows();
    if (panRotateTemporarilyDisabled && state.activeMode === "select") {
      panRotateTemporarilyDisabled = false;
      enablePanRotateOnly();
    }
  });

  state.terraInstance = draw;

  return draw;
}

function ensureBuildingLayers(map) {
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

function ensureShadowLayers(map) {
  if (map.getSource("shadows")) return;

  map.addSource("shadows", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: "shadows-fill",
    type: "fill",
    source: "shadows",
    paint: {
      "fill-color": "#000000",
      "fill-opacity": 0.25,
    },
  });

  map.addLayer({
    id: "shadows-outline",
    type: "line",
    source: "shadows",
    paint: {
      "line-color": "#000000",
      "line-opacity": 0.35,
      "line-width": 1,
    },
  });

  if (map.getLayer("buildings-fill")) {
    map.moveLayer("shadows-fill", "buildings-fill");
    map.moveLayer("shadows-outline", "buildings-fill");
  }
}

function getFootprints() {
  const snapshot = state.terraInstance?.getSnapshot?.();
  if (!snapshot) return [];
  if (Array.isArray(snapshot)) return snapshot;
  if (Array.isArray(snapshot.features)) return snapshot.features;
  return [];
}

function setUiFrom(height, floors) {
  state.uiHeight = clamp(Number(height), 1, 500);
  state.uiFloors = clamp(Number(floors), 1, 100);

  el("heightInput").value = String(round(state.uiHeight, 1));
  el("heightRange").value = String(round(state.uiHeight, 1));
  el("floorsInput").value = String(state.uiFloors);
  el("floorsRange").value = String(state.uiFloors);
}

function setUiFromDefaults() {
  setUiFrom(state.defaultHeight, state.defaultFloors);
}

function getSelectedFeatureIds(features) {
  return features
    .filter((f) => f?.properties?.selected === true)
    .map((f) => f.id)
    .filter(Boolean);
}

function applyUiToSelectionOrDefaults() {
  // 選択があれば選択対象だけ更新。なければ「今後作る建物のデフォルト」を更新する。
  const ids = Array.from(state.selectedFeatureIds ?? []);
  if (ids.length && state.terraInstance?.updateFeatureProperties) {
    for (const id of ids) {
      try {
        state.terraInstance.updateFeatureProperties(id, {
          height: state.uiHeight,
          floors: state.uiFloors,
        });
      } catch {
        // ignore
      }
    }
  } else {
    state.defaultHeight = state.uiHeight;
    state.defaultFloors = state.uiFloors;
  }
  updateBuildings();
}

function updateBuildings() {
  if (!state.map) return;
  const snapshotFeatures = getFootprints();
  const features = snapshotFeatures.filter(
    (f) => f.geometry?.type === "Polygon"
  );

  // 選択状態の変化を検知して、UIの高さ/階数を選択対象に追従させる
  if (state.activeMode === "select") {
    const selected = getSelectedFeatureIds(features);
    const next = new Set(selected);
    const prev = state.selectedFeatureIds ?? new Set();
    const changed =
      selected.length !== prev.size || selected.some((id) => !prev.has(id));
    if (changed) {
      state.selectedFeatureIds = next;
      if (selected.length) {
        const first = features.find((f) => f.id === selected[0]);
        const h = Number(first?.properties?.height);
        const fl = Number(first?.properties?.floors);
        if (Number.isFinite(h) && Number.isFinite(fl)) {
          setUiFrom(h, fl);
        } else {
          setUiFromDefaults();
        }
      } else {
        setUiFromDefaults();
      }
    }
  }

  const buildingCountEl = el("buildingCount");
  if (buildingCountEl) buildingCountEl.textContent = String(features.length);

  // 各建物ごとに height/floors を保持する（未設定はデフォルトを付与）
  const enriched = features.map((f) => {
    const currentHeight = Number(f.properties?.height);
    const currentFloors = Number(f.properties?.floors);

    const height = Number.isFinite(currentHeight)
      ? clamp(currentHeight, 1, 500)
      : state.defaultHeight;
    const floors = Number.isFinite(currentFloors)
      ? clamp(currentFloors, 1, 100)
      : clamp(Math.round(height / state.floorHeight), 1, 100);

    // 初回だけ store 側にもプロパティを持たせる（以後は個別編集）
    if (
      (!Number.isFinite(currentHeight) || !Number.isFinite(currentFloors)) &&
      state.terraInstance?.updateFeatureProperties &&
      f.id
    ) {
      try {
        state.terraInstance.updateFeatureProperties(f.id, { height, floors });
      } catch {
        // ignore
      }
    }

    return {
      ...f,
      properties: {
        ...(f.properties || {}),
        height,
        floors,
      },
    };
  });

  const data = { type: "FeatureCollection", features: enriched };
  const src = state.map.getSource("buildings");
  if (src?.setData) src.setData(data);

  updateShadows();
}

function destinationLngLat(lng, lat, bearingRad, distanceM) {
  const R = 6378137;
  const δ = distanceM / R;
  const θ = bearingRad;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

function polygonCentroid(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const coords =
    last && first && last[0] === first[0] && last[1] === first[1]
      ? ring.slice(0, -1)
      : ring.slice();
  const sum = coords.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return { lng: sum.lng / coords.length, lat: sum.lat / coords.length };
}

function convexHull(points) {
  if (points.length <= 1) return points;
  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  const cross = (o, a, b) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function updateShadows() {
  if (!state.map) return;
  const src = state.map.getSource("shadows");
  if (!src?.setData) return;

  const snapshotFeatures = getFootprints();
  const features = snapshotFeatures.filter(
    (f) => f.geometry?.type === "Polygon"
  );
  const dtUtc = getCurrentDateTimeUtc();
  if (!dtUtc.isValid) return;
  const dateJs = dtUtc.toJSDate();

  const shadowFeatures = [];
  let maxShadow = 0;

  const normalizeRad = (rad) => {
    const t = rad % (2 * Math.PI);
    return t < 0 ? t + 2 * Math.PI : t;
  };

  const center = state.map.getCenter();
  const sunForUi = SunCalc.getPosition(dateJs, center.lat, center.lng);

  for (const f of features) {
    const ring = f.geometry.coordinates[0];
    const centroid = polygonCentroid(ring);
    const buildingHeight = Number.isFinite(Number(f.properties?.height))
      ? clamp(Number(f.properties?.height), 1, 500)
      : state.defaultHeight;

    const sun = SunCalc.getPosition(dateJs, centroid.lat, centroid.lng);
    const altitude = sun.altitude;
    const azimuth = sun.azimuth;

    if (altitude <= 0.001) continue;

    // SunCalc azimuth は「南=0、西=+」(ラジアン)。bearing(北=0, 時計回り)へ変換する。
    const sunBearing = normalizeRad(azimuth + Math.PI);
    const shadowBearing = normalizeRad(sunBearing + Math.PI);
    const L = buildingHeight / Math.tan(altitude);
    maxShadow = Math.max(maxShadow, L);

    const first = ring[0];
    const last = ring[ring.length - 1];
    const base =
      last && first && last[0] === first[0] && last[1] === first[1]
        ? ring.slice(0, -1)
        : ring.slice();
    const shifted = base.map(([lng, lat]) =>
      destinationLngLat(lng, lat, shadowBearing, L)
    );

    const lat0 = (centroid.lat * Math.PI) / 180;
    const lng0 = centroid.lng;
    const toXY = ([lng, lat]) => {
      const x = ((lng - lng0) * Math.PI) / 180 * 6378137 * Math.cos(lat0);
      const y = ((lat - centroid.lat) * Math.PI) / 180 * 6378137;
      return { lng, lat, x, y };
    };

    const pts = [...base, ...shifted].map(toXY);
    const hull = convexHull(pts);
    const hullRing = hull.map((p) => [p.lng, p.lat]);
    hullRing.push(hullRing[0]);

    shadowFeatures.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [hullRing] },
      properties: {
        height: buildingHeight,
        floors: Number(f.properties?.floors) || clamp(Math.round(buildingHeight / state.floorHeight), 1, 100),
        shadowLength: L,
        sunBearing,
        altitude,
      },
    });
  }

  src.setData({ type: "FeatureCollection", features: shadowFeatures });

  const noteEl = el("sunNote");
  const altitudeDeg = (sunForUi.altitude * 180) / Math.PI;
  const bearingDeg = (normalizeRad(sunForUi.azimuth + Math.PI) * 180) / Math.PI;
  el("sunAltitude").textContent = `${round(altitudeDeg, 1)}°`;
  el("sunAzimuth").textContent = `${round(bearingDeg, 1)}°`;

  const nightOverlay = el("nightOverlay");
  if (nightOverlay) {
    if (altitudeDeg <= 0) nightOverlay.classList.remove("hidden");
    else nightOverlay.classList.add("hidden");
  }

  if (noteEl) {
    if (altitudeDeg <= 0) {
      noteEl.textContent = "夜間（日の出前/日没後）です";
    } else if (!features.length) {
      noteEl.textContent = "建物が未設定です";
    } else {
      noteEl.textContent = "";
    }
  }

  el("shadowLength").textContent =
    maxShadow > 0 ? `${round(maxShadow, 1)} m` : "—";
}

function showFileNotice() {
  if (location.protocol === "file:") {
    const notice = el("fileNotice");
    if (notice) notice.classList.remove("hidden");
  }
}

function setupPanelToggle() {
  el("panelToggle").addEventListener("click", () => {
    el("panel").classList.toggle("collapsed");
  });
}

function setupBuildingControls() {
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

function setupDateTimeControls() {
  el("timeRange").addEventListener("input", () => {
    stopPlayDay();
    timeRangeToTimeInput();
    updateShadows();
  });
  el("timeInput").addEventListener("input", () => {
    stopPlayDay();
    timeInputToRange();
    updateShadows();
  });
  el("dateInput").addEventListener("input", () => {
    stopPlayDay();
    updateShadows();
  });
  el("resetTimeButton").addEventListener("click", () => {
    stopPlayDay();
    initDateTimeControls();
    updateShadows();
  });
  el("timezoneSelect").addEventListener("change", () => {
    stopPlayDay();
    state.timezone = el("timezoneSelect").value;
    initDateTimeControls();
    updateShadows();
  });
}

function setPlayDayButtonActive(active) {
  const btn = el("playDayButton");
  if (!btn) return;
  btn.classList.toggle("btn-primary", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}

function stopPlayDay() {
  state.playingDay = false;
  if (state.playDayTimer) {
    window.clearInterval(state.playDayTimer);
    state.playDayTimer = null;
  }
  setPlayDayButtonActive(false);
}

function startPlayDay() {
  stopPlayDay();
  state.playingDay = true;
  setPlayDayButtonActive(true);
  let m = Number(el("timeRange").value);
  state.playDayTimer = window.setInterval(() => {
    m = (m + 5) % 1440;
    el("timeRange").value = String(m);
    timeRangeToTimeInput();
    updateShadows();
    if (m === 0) {
      stopPlayDay();
    }
  }, 120);
}

function setupPlayDay() {
  el("playDayButton").addEventListener("click", () => {
    if (state.playingDay) stopPlayDay();
    else startPlayDay();
  });
}

function main() {
  showFileNotice();
  setupPanelToggle();
  setupBuildingControls();
  setupDateTimeControls();
  setupPlayDay();
  initDateTimeControls();
  setUiFromDefaults();

  const map = initMap();
  setupViewControls(map);

  map.on("load", () => {
    state.map = map;
    setupBasemapControls(map);
    setBasemap(map, el("basemapSelect")?.value || state.basemap);
    ensureBuildingLayers(map);
    ensureShadowLayers(map);
    initTerraDraw(map);
    updateBuildings();
  });

  el("searchButton").addEventListener("click", () => searchPlace(map));
  el("searchInput").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") searchPlace(map);
  });
}

main();
