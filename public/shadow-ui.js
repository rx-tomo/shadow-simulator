// public/shadow-ui.js — facade (re-exports only)
export {
  ensurePlateauLayers,
  togglePlateauVisibility,
  ensureBuildingLayers,
  reorderCustomLayers,
  ensureShadowLayers,
} from './shadow-ui-layers.js';
export { updateShadows } from './shadow-ui-compute.js';
export {
  computeShadowForBuilding,
  getGeometryRings,
  getPrimaryRing,
  getPlateauHeight,
  getBasemapHeight,
  getRingAreaMetersSquared,
  getRingDedupeKey,
} from './shadow-compute.js';
