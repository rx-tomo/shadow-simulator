/**
 * Small, failure-safe telemetry boundary for the PLATEAU delivery path.
 *
 * Do not pass URLs, error messages, addresses, or map feature data here.
 * The accepted fields are short categorical values only so GA4 remains useful
 * for incident detection without becoming a source of user/location data.
 */

const ALLOWED_PARAM_KEYS = new Set(['failure_kind', 'trigger', 'stage', 'phase']);
const SAFE_VALUE = /^[a-z0-9_-]{1,48}$/;

function defaultTrack(name, params) {
  globalThis.window?.shadowAnalytics?.track?.(name, params);
}

function sanitizeParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([key, value]) => ALLOWED_PARAM_KEYS.has(key) && typeof value === 'string' && SAFE_VALUE.test(value))
  );
}

/**
 * @param {{ track?: (name: string, params: Record<string, string>) => void }} options
 */
export function createPlateauObservability({ track = defaultTrack } = {}) {
  let incidentActive = false;
  const lifecycleEvents = new Set();
  const operationalEvents = new Set();

  function send(name, params) {
    try {
      track(name, sanitizeParams(params));
    } catch (_) {
      // Analytics is optional. Never let a failed telemetry call affect maps.
    }
  }

  function lifecycle(name, params = {}) {
    if (lifecycleEvents.has(name)) return;
    lifecycleEvents.add(name);
    send(name, params);
  }

  function beginIncident() {
    if (incidentActive) return;
    incidentActive = true;
    lifecycleEvents.clear();
  }

  return {
    primarySourceUnavailable(params) {
      beginIncident();
      lifecycle('plateau_primary_source_unavailable', params);
    },
    primarySuccess() {
      // A successful primary source load ends a pre-fallback incident silently.
      // A later independent failure must be observable as a new incident.
      incidentActive = false;
      lifecycleEvents.clear();
    },
    operationalFailure(name, params = {}) {
      if (operationalEvents.has(name)) return;
      operationalEvents.add(name);
      send(name, params);
    },
  };
}

export const plateauObservability = createPlateauObservability();
