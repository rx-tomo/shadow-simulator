/**
 * User-intent analytics policies shared by runtime code and deterministic tests.
 */

/**
 * MapLibre also emits moveend for programmatic jump/ease/orbit operations.
 * Only a browser input event represents an explicit map interaction by a user.
 * @param {{ originalEvent?: Event } | null | undefined} event
 * @returns {boolean}
 */
export function shouldTrackMapInteraction(event) {
  return Boolean(event?.originalEvent);
}

/**
 * Shadow statistics are rendering state, not analytics. They must refresh for
 * both user-driven and programmatic moves (for example, a shared URL restore).
 *
 * @param {{ originalEvent?: Event } | null | undefined} event
 * @param {{ updateShadows: () => void, onUserInteraction: () => void }} effects
 * @returns {boolean} whether the move came from browser input
 */
export function refreshAfterMapMove(event, { updateShadows, onUserInteraction }) {
  updateShadows();
  if (!shouldTrackMapInteraction(event)) return false;
  onUserInteraction();
  return true;
}
