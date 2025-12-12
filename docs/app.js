const MAPLIBRE_VERSION = "5.13.0";

const state = {
  floorHeight: 3.1,
  height: 6.2,
  floors: 2,
  timezone: "Asia/Tokyo",
  orbiting: false,
  orbitTimer: null,
  map: null,
  drawControl: null,
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
    state.height = clamp(Number(el("heightInput").value), 1, 500);
    state.floors = clamp(
      Math.round(state.height / state.floorHeight),
      1,
      100
    );
  } else if (from === "floors") {
    state.floors = clamp(Number(el("floorsInput").value), 1, 100);
    state.height = clamp(state.floors * state.floorHeight, 1, 500);
  } else if (from === "floorHeight") {
    state.floorHeight = clamp(Number(el("floorHeightInput").value), 2.5, 5.0);
    state.height = clamp(state.floors * state.floorHeight, 1, 500);
  }

  el("heightInput").value = String(round(state.height, 1));
  el("heightRange").value = String(round(state.height, 1));
  el("floorsInput").value = String(state.floors);
  el("floorsRange").value = String(state.floors);

  updateBuildings();
}

function initDateTimeControls() {
  const now = luxon.DateTime.now().setZone(state.timezone);
  el("dateInput").value = now.toISODate();
  el("timeInput").value = now.toFormat("HH:mm");

  const minutes = now.hour * 60 + now.minute;
  el("timeRange").value = String(minutes);
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
  // MapLibre v5 は CSP worker を必要とする環境があるため、常に worker URL を明示する。
  // https 配信時は同一オリジンに置いた worker を使い、file:// の場合は CDN の CSP worker を使う。
  if (location.protocol === "file:") {
    maplibregl.setWorkerUrl(
      `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl-csp-worker.js`
    );
  } else {
    maplibregl.setWorkerUrl("./maplibre-gl-csp-worker.js");
  }

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
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

function initTerraDraw(map) {
  const terra = window.MaplibreTerradrawControl;
  const TerradrawControl = terra.MaplibreTerradrawControl;

  // UMD版ではデフォルトが自動適用されないケースがあるため、公式の defaultControlOptions を明示する
  const modes = terra.defaultControlOptions?.modes;
  const drawControl = new TerradrawControl({ modes });
  map.addControl(drawControl, "top-left");

  const instance =
    typeof drawControl.getTerraDrawInstance === "function"
      ? drawControl.getTerraDrawInstance()
      : drawControl.terradraw;

  const available = terra.AvailableModes;
  const values = Array.isArray(available) ? available : Object.values(available);
  const angledRectMode =
    values.find((v) => /angled/i.test(v) && /rect/i.test(v)) ||
    values.find((v) => /rect/i.test(v)) ||
    "angled_rectangle";
  const selectMode =
    values.find((v) => /select/i.test(v)) || "select";

  function setMode(mode) {
    if (typeof drawControl.setMode === "function") {
      drawControl.setMode(mode);
      return;
    }
    if (instance && typeof instance.setMode === "function") {
      instance.setMode(mode);
    }
  }

  el("drawRectButton").addEventListener("click", () => setMode(angledRectMode));
  el("selectButton").addEventListener("click", () => setMode(selectMode));
  el("deleteButton").addEventListener("click", () => {
    if (instance?.clear) instance.clear();
    else if (drawControl.clear) drawControl.clear();
  });

  if (instance?.on) {
    instance.on("finish", updateBuildings);
    instance.on("change", updateBuildings);
    instance.on("delete", updateBuildings);
  }

  state.drawControl = drawControl;
  state.terraInstance = instance;

  return { drawControl, instance };
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
      "fill-opacity": 0.15,
    },
  });

  map.addLayer({
    id: "buildings-extrusion",
    type: "fill-extrusion",
    source: "buildings",
    paint: {
      "fill-extrusion-color": "#6366f1",
      "fill-extrusion-opacity": 0.6,
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
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
  if (state.drawControl?.getFeatures) {
    return state.drawControl.getFeatures(true);
  }
  if (state.terraInstance?.getSnapshot) {
    return state.terraInstance.getSnapshot();
  }
  return { type: "FeatureCollection", features: [] };
}

function updateBuildings() {
  if (!state.map) return;
  const fc = getFootprints();
  const features = (fc?.features ?? []).filter(
    (f) => f.geometry?.type === "Polygon"
  );

  const enriched = features.map((f) => ({
    ...f,
    properties: {
      ...(f.properties || {}),
      height: state.height,
      floors: state.floors,
    },
  }));

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

  const fc = getFootprints();
  const features = (fc?.features ?? []).filter(
    (f) => f.geometry?.type === "Polygon"
  );
  const dtUtc = getCurrentDateTimeUtc();
  if (!dtUtc.isValid) return;
  const dateJs = dtUtc.toJSDate();

  const shadowFeatures = [];
  let maxShadow = 0;
  let firstSun = null;

  for (const f of features) {
    const ring = f.geometry.coordinates[0];
    const centroid = polygonCentroid(ring);

    const sun = SunCalc.getPosition(dateJs, centroid.lat, centroid.lng);
    const altitude = sun.altitude;
    const azimuth = sun.azimuth;
    if (!firstSun) firstSun = sun;

    if (altitude <= 0.001) continue;

    const sunBearing =
      (azimuth + Math.PI + 2 * Math.PI) % (2 * Math.PI);
    const shadowBearing = (sunBearing + Math.PI) % (2 * Math.PI);
    const L = state.height / Math.tan(altitude);
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
        height: state.height,
        floors: state.floors,
        shadowLength: L,
        sunBearing,
        altitude,
      },
    });
  }

  src.setData({ type: "FeatureCollection", features: shadowFeatures });

  if (firstSun) {
    const altitudeDeg = (firstSun.altitude * 180) / Math.PI;
    const bearingDeg =
      ((firstSun.azimuth + Math.PI) * 180) / Math.PI % 360;
    el("sunAltitude").textContent = `${round(altitudeDeg, 1)}°`;
    el("sunAzimuth").textContent = `${round(bearingDeg, 1)}°`;
  } else {
    el("sunAltitude").textContent = "—";
    el("sunAzimuth").textContent = "—";
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
    timeRangeToTimeInput();
    updateShadows();
  });
  el("timeInput").addEventListener("input", () => {
    timeInputToRange();
    updateShadows();
  });
  el("dateInput").addEventListener("input", updateShadows);
  el("resetTimeButton").addEventListener("click", initDateTimeControls);
  el("timezoneSelect").addEventListener("change", () => {
    state.timezone = el("timezoneSelect").value;
    initDateTimeControls();
    updateShadows();
  });
}

function setupPlayDay() {
  el("playDayButton").addEventListener("click", () => {
    let m = Number(el("timeRange").value);
    const timer = window.setInterval(() => {
      m = (m + 5) % 1440;
      el("timeRange").value = String(m);
      timeRangeToTimeInput();
      updateShadows();
      if (m === 0) {
        window.clearInterval(timer);
      }
    }, 120);
  });
}

function main() {
  showFileNotice();
  setupPanelToggle();
  setupBuildingControls();
  setupDateTimeControls();
  setupPlayDay();
  initDateTimeControls();
  syncHeightFloors("height");

  const map = initMap();
  setupViewControls(map);

  map.on("load", () => {
    state.map = map;
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
