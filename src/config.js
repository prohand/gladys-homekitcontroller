// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  // Seconds between two full reads of every paired accessory. HomeKit pushes
  // most changes in real time (events): this refresh is only a safety net for
  // the characteristics that do not support events or for a lost event.
  poll_frequency: 60,
  // Seconds the Gladys core listens for HomeKit (mDNS `_hap._tcp`) answers
  // during a search.
  scan_timeout: 10,
};

const LIMITS = {
  poll_frequency: { min: 10, max: 3600 },
  scan_timeout: { min: 3, max: 30 },
};

function toBoundedNumber(raw, key) {
  const value = Number(raw ?? DEFAULT_CONFIG[key]);
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIG[key];
  }
  const { min, max } = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // Force the types: config may arrive as strings from a form.
    poll_frequency: toBoundedNumber(raw.poll_frequency, 'poll_frequency'),
    scan_timeout: toBoundedNumber(raw.scan_timeout, 'scan_timeout'),
  };
}
