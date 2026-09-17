// public/building.js — 建物描画・TerraDraw・選択/編集

import { state, el, getFootprints, stopOrbit, MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT, MIN_BUILDING_FLOORS, MAX_BUILDING_FLOORS, COORDINATE_PRECISION } from './state.js';
import { clamp, round } from './calc.js';
import { updateShadows } from './shadow-ui.js';

export function setUiFrom(height, floors) {
  state.uiHeight = clamp(Number(height), MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT);
  state.uiFloors = clamp(Number(floors), MIN_BUILDING_FLOORS, MAX_BUILDING_FLOORS);

  el("heightInput").value = String(round(state.uiHeight, 1));
  el("heightRange").value = String(round(state.uiHeight, 1));
  el("floorsInput").value = String(state.uiFloors);
  el("floorsRange").value = String(state.uiFloors);
}

export function setUiFromDefaults() {
  setUiFrom(state.defaultHeight, state.defaultFloors);
}

export function getSelectedFeatureIds(features) {
  const selectedByProperty = features
    .filter((f) => f?.properties?.selected === true)
    .map((f) => f.id)
    .filter(Boolean);
  if (selectedByProperty.length) return selectedByProperty;

  const fallbackIds = Array.from(state.selectedFeatureIds ?? []).filter(Boolean);
  if (!fallbackIds.length) return [];
  const existingIds = new Set(features.map((f) => f.id).filter(Boolean));
  return fallbackIds.filter((id) => existingIds.has(id));
}

export function applyUiToSelectionOrDefaults() {
  // 選択があれば選択対象だけ更新。なければ「今後作る建物のデフォルト」を更新する。
  const ids = Array.from(state.selectedFeatureIds ?? []);
  if (ids.length && state.terraInstance?.updateFeatureProperties) {
    for (const id of ids) {
      try {
        state.terraInstance.updateFeatureProperties(id, {
          height: state.uiHeight,
          floors: state.uiFloors,
        });
      } catch (e) {
        console.warn('[building] updateFeatureProperties failed:', e.message);
      }
    }
  } else {
    state.defaultHeight = state.uiHeight;
    state.defaultFloors = state.uiFloors;
  }
  updateBuildings();
}

export function updateBuildings() {
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

  const userCountEl = el("userBuildingCount");
  if (userCountEl) {
    userCountEl.textContent = String(features.length);
  }

  // 各建物ごとに height/floors を保持する（未設定はデフォルトを付与）
  const enriched = features.map((f) => {
    const currentHeight = Number(f.properties?.height);
    const currentFloors = Number(f.properties?.floors);

    const height = Number.isFinite(currentHeight)
      ? clamp(currentHeight, MIN_BUILDING_HEIGHT, MAX_BUILDING_HEIGHT)
      : state.defaultHeight;
    const floors = Number.isFinite(currentFloors)
      ? clamp(currentFloors, MIN_BUILDING_FLOORS, MAX_BUILDING_FLOORS)
      : clamp(Math.round(height / state.floorHeight), MIN_BUILDING_FLOORS, MAX_BUILDING_FLOORS);

    // 初回だけ store 側にもプロパティを持たせる（以後は個別編集）
    if (
      (!Number.isFinite(currentHeight) || !Number.isFinite(currentFloors)) &&
      state.terraInstance?.updateFeatureProperties &&
      f.id
    ) {
      try {
        state.terraInstance.updateFeatureProperties(f.id, { height, floors });
      } catch (e) {
        console.warn('[building] updateFeatureProperties initial failed:', e.message);
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

// =========================================================
// 抽出関数: 地図操作の有効/無効切替
// =========================================================
export function createMapInteractionToggle(map) {
  const interactions = [
    'dragPan', 'dragRotate', 'scrollZoom', 'boxZoom',
    'doubleClickZoom', 'keyboard', 'touchZoomRotate', 'touchPitch',
  ];

  const disableAll = () => {
    try {
      map.stop?.();
      for (const name of interactions) {
        if (map[name]?.isEnabled()) map[name].disable();
      }
    } catch (e) {
      console.warn('[building] disableAllMapInteractions failed:', e.message);
    }
  };

  const enableAll = () => {
    try {
      for (const name of interactions) {
        if (map[name] && !map[name].isEnabled()) map[name].enable();
      }
    } catch (e) {
      console.warn('[building] enableAllMapInteractions failed:', e.message);
    }
  };

  const disablePanRotate = () => {
    try {
      if (map.dragPan?.isEnabled()) map.dragPan.disable();
      if (map.dragRotate?.isEnabled()) map.dragRotate.disable();
    } catch (e) {
      console.warn('[building] disablePanRotateOnly failed:', e.message);
    }
  };

  const enablePanRotate = () => {
    try {
      if (map.dragPan && !map.dragPan.isEnabled()) map.dragPan.enable();
      if (map.dragRotate && !map.dragRotate.isEnabled()) map.dragRotate.enable();
    } catch (e) {
      console.warn('[building] enablePanRotateOnly failed:', e.message);
    }
  };

  return { disableAll, enableAll, disablePanRotate, enablePanRotate };
}

// =========================================================
// 抽出関数: モードボタンUI切替
// =========================================================
export function setModeButtonActive(activeIdOrNull) {
  const btnIds = ["drawRectButton", "selectButton"];
  for (const id of btnIds) {
    const btn = el(id);
    if (!btn) continue;
    const active = id === activeIdOrNull;
    btn.classList.toggle("btn-primary", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

// =========================================================
// 抽出関数: ポリゴン状態トラッキング
// =========================================================
export function createPolygonTracker(draw) {
  let trackedStates = new Map();
  const getSnapshotFeatures = () => {
    const snapshot = draw.getSnapshot?.();
    if (!snapshot) return [];
    return Array.isArray(snapshot) ? snapshot : snapshot.features ?? [];
  };
  const getPolygonSnapshotFeatures = () =>
    getSnapshotFeatures().filter((f) => f.geometry?.type === "Polygon");

  const refresh = (polys) => {
    if (!polys) polys = getPolygonSnapshotFeatures();
    trackedStates = new Map(
      polys.map((f) => [f.id, { currentlyDrawing: f?.properties?.currentlyDrawing === true }])
        .filter(([id]) => Boolean(id))
    );
  };
  const detectCompletedId = (polys) => {
    if (!polys) polys = getPolygonSnapshotFeatures();
    const next = new Map();
    let candidateId = null;
    for (const f of polys) {
      if (!f?.id) continue;
      const currentlyDrawing = f?.properties?.currentlyDrawing === true;
      next.set(f.id, { currentlyDrawing });
      const prev = trackedStates.get(f.id);
      if ((prev?.currentlyDrawing === true && !currentlyDrawing) || (!prev && !currentlyDrawing)) {
        candidateId = f.id;
      }
    }
    trackedStates = next;
    return candidateId;
  };
  return { getSnapshotFeatures, getPolygonSnapshotFeatures, refresh, detectCompletedId,
    get size() { return trackedStates.size; } };
}

// =========================================================
// 抽出関数: TerraDraw インスタンス生成
// =========================================================
export function createTerraDrawInstance(adapter) {
  return new terraDraw.TerraDraw({
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
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
          "angled-rectangle": {
            feature: {
              draggable: true,
              rotateable: true,
              scaleable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
      }),
    ],
  });
}

// =========================================================
// 抽出関数: 削除ハンドラ
// =========================================================
export function handleDelete(draw, tracker) {
  const selectedIds = Array.from(state.selectedFeatureIds ?? []).filter(Boolean);
  if (selectedIds.length && typeof draw.removeFeatures === "function") {
    draw.removeFeatures(selectedIds);
  } else if (typeof draw.clear === "function") {
    draw.clear();
  } else if (typeof draw.removeFeatures === "function") {
    const snap = draw.getSnapshot?.();
    const features = Array.isArray(snap) ? snap : snap?.features ?? [];
    const ids = features.map((f) => f.id).filter(Boolean);
    if (ids.length) draw.removeFeatures(ids);
  }
  state.selectedFeatureIds = new Set();
  setUiFromDefaults();
  updateBuildings();
  tracker.refresh();
}

// =========================================================
// 抽出関数: 変更検知スケジューラ
// =========================================================
export function createChangeDetector(tracker, onCompleted) {
  let lastFeatureCount = 0;
  let lastCoordHash = 0;
  let idleCheckScheduled = false;

  const check = (polys) => {
    const count = polys.length;
    let coordHash = count;
    for (const f of polys) {
      const coords = f.geometry.coordinates[0];
      if (coords) {
        const drawingMarker = f?.properties?.currentlyDrawing === true ? 17 : 0;
        coordHash += coords.length * 31 + (coords[0]?.[0] || 0) * 1000 + drawingMarker;
      }
    }
    if (count !== lastFeatureCount || coordHash !== lastCoordHash) {
      const completedId = tracker.detectCompletedId(polys);
      lastFeatureCount = count;
      lastCoordHash = coordHash;
      updateBuildings();
      if (completedId) onCompleted(completedId, polys);
    }
  };

  const scheduleIdle = () => {
    if (idleCheckScheduled) return;
    idleCheckScheduled = true;
    const cb = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 100);
    cb(() => {
      idleCheckScheduled = false;
      const polys = tracker.getPolygonSnapshotFeatures();
      if (!polys.length && tracker.size === 0) return;
      check(polys);
    });
  };

  return { check, scheduleIdle };
}

// =========================================================
// 抽出関数: ポインターイベントバインディング
// =========================================================
export function bindPointerEvents(canvas, mapToggle, tracker, onCompleted) {
  if (!canvas) return;
  let panRotateTemporarilyDisabled = false;

  const handlePointerEnd = () => {
    const polys = tracker.getPolygonSnapshotFeatures();
    const completedId = tracker.detectCompletedId(polys);
    updateBuildings();
    if (completedId) onCompleted(completedId, polys);
    updateShadows();
    if (panRotateTemporarilyDisabled && state.activeMode === "select") {
      panRotateTemporarilyDisabled = false;
      mapToggle.enablePanRotate();
    }
  };

  canvas.addEventListener("pointerdown", (ev) => {
    if (!state.terraInstance?.getFeaturesAtPointerEvent) return;
    if (state.activeMode !== "select") return;
    try {
      const hits = state.terraInstance.getFeaturesAtPointerEvent(ev) ?? [];
      if (hits.some((f) => f.geometry?.type === "Polygon")) {
        panRotateTemporarilyDisabled = true;
        mapToggle.disablePanRotate();
      }
    } catch (e) {
      console.warn('[building] getFeaturesAtPointerEvent failed:', e.message);
    }
  });
  canvas.addEventListener("pointerup", handlePointerEnd);
  canvas.addEventListener("pointercancel", handlePointerEnd);
}

// =========================================================
// initTerraDraw: オーケストレーター
// =========================================================
export function initTerraDraw(map) {
  const adapter = new terraDrawMaplibreGlAdapter.TerraDrawMapLibreGLAdapter({
    map, renderBelowLayerId: "buildings-fill", coordinatePrecision: COORDINATE_PRECISION, prefixId: "td",
  });
  const mapToggle = createMapInteractionToggle(map);
  const draw = createTerraDrawInstance(adapter);
  const tracker = createPolygonTracker(draw);

  const enterMode = (modeName) => {
    state.activeMode = modeName;
    if (modeName === "angled-rectangle") {
      mapToggle.disableAll();
      draw.setMode("angled-rectangle");
      setModeButtonActive("drawRectButton");
      el("drawHint")?.classList.remove("hidden");
      tracker.refresh();
    } else if (modeName === "select") {
      mapToggle.enableAll();
      draw.setMode("select");
      setModeButtonActive("selectButton");
      el("drawHint")?.classList.add("hidden");
    } else {
      mapToggle.enableAll();
      draw.setMode("render");
      setModeButtonActive(null);
      el("drawHint")?.classList.add("hidden");
      state.selectedFeatureIds = new Set();
      setUiFromDefaults();
      tracker.refresh();
    }
  };

  const autoSelectCompleted = (featureId, polys) => {
    if (!featureId || state.activeMode !== "angled-rectangle") return;
    if (typeof draw.hasFeature === "function" && !draw.hasFeature(featureId)) return;
    enterMode("select");
    if (typeof draw.selectFeature === "function") {
      try { draw.selectFeature(featureId); } catch (e) { console.warn('[building] selectFeature failed:', e.message); }
    }
    state.selectedFeatureIds = new Set([featureId]);
    const target = (polys || []).find((f) => f.id === featureId);
    const h = Number(target?.properties?.height);
    const fl = Number(target?.properties?.floors);
    if (Number.isFinite(h) && Number.isFinite(fl)) setUiFrom(h, fl);
    updateBuildings();
  };

  const toggleMode = (modeName) => {
    stopOrbit();
    enterMode(state.activeMode === modeName ? "render" : modeName);
  };

  draw.start();
  enterMode("render");

  el("drawRectButton").addEventListener("click", () => toggleMode("angled-rectangle"));
  el("selectButton").addEventListener("click", () => toggleMode("select"));
  el("deleteButton").addEventListener("click", () => handleDelete(draw, tracker));

  const detector = createChangeDetector(tracker, autoSelectCompleted);
  const canvas = map.getCanvas?.();
  canvas?.addEventListener("pointermove", () => {
    if (state.activeMode !== "render") detector.scheduleIdle();
  });
  bindPointerEvents(canvas, mapToggle, tracker, autoSelectCompleted);

  state.terraInstance = draw;
  return draw;
}
