'use strict';
/**
 * lib/uid/config-schema.js — Component Config Inheritance
 * UUID: nexus-uid-cfg-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * getConfig(componentId) → merged config for a component.
 *
 * Merge order (lowest to highest precedence):
 *   1. Component defaults (from component-map.js)
 *   2. Parent defaults (inherited, not overriding child's own keys)
 *   3. ENV overrides (blocked for immutable: true components)
 *
 * ENV key pattern:
 *   componentId = 'nexus-gu', key = 'MAX_CONCURRENT'
 *   → env key: NEXUS_GU_MAX_CONCURRENT
 *   (componentId uppercased, hyphens → underscores)
 *
 * IMMUTABLE COMPONENTS:
 *   Components with immutable: true have their config locked.
 *   ENV overrides are silently ignored — core behavior cannot be changed at runtime.
 *   This is intentional. The kernel is the kernel.
 *
 * §1.2  Unknown componentId returns {} with a warning, never throws.
 * §5.8  Composability over configuration — configs are minimal by design.
 */

const { COMPONENT_MAP } = require('./component-map');

// ── envKey(componentId, key) — derives the env var name ──────────────────────
function envKey(componentId, key) {
  return componentId.toUpperCase().replace(/-/g, '_') + '_' + key;
}

// ── getConfig(componentId, options?) ─────────────────────────────────────────
// Returns merged config for a component.
// options.includeParent (bool, default true) — include parent defaults as base
// options.env (object, default process.env) — injectable for testing
function getConfig(componentId, options = {}) {
  const {
    includeParent = true,
    env           = process.env,
  } = options;

  const entry = COMPONENT_MAP[componentId];
  if (!entry) {
    process.stderr.write(`[config-schema] §1.2 unknown componentId '${componentId}' — returning {}\n`);
    return { __componentId: componentId, __found: false };
  }

  // Start with parent defaults if requested
  let base = {};
  if (includeParent && entry.parent && COMPONENT_MAP[entry.parent]) {
    const parentConfig = COMPONENT_MAP[entry.parent].config || {};
    // Parent config is a base — child keys always win
    base = { ...parentConfig };
  }

  // Apply component's own defaults over parent
  const defaults = { ...(entry.config || {}) };
  const merged   = { ...base, ...defaults };

  // Apply ENV overrides — BLOCKED for immutable components
  if (entry.immutable) {
    // Immutable: return defaults only, no env override
    return {
      ...merged,
      __componentId: componentId,
      __immutable:   true,
      __found:       true,
    };
  }

  // Mutable: apply env overrides
  const overridden = {};
  for (const [key, defaultVal] of Object.entries(merged)) {
    if (key.startsWith('__')) continue;
    const eKey = envKey(componentId, key);
    const envVal = env[eKey];
    if (envVal !== undefined) {
      // Type-coerce: preserve the original type of the default value
      if (typeof defaultVal === 'number') {
        const n = Number(envVal);
        overridden[key] = isNaN(n) ? defaultVal : n;
      } else if (typeof defaultVal === 'boolean') {
        overridden[key] = envVal === 'true' || envVal === '1';
      } else if (Array.isArray(defaultVal)) {
        try { overridden[key] = JSON.parse(envVal); } catch { overridden[key] = defaultVal; }
      } else {
        overridden[key] = envVal;
      }
    } else {
      overridden[key] = defaultVal;
    }
  }

  return {
    ...overridden,
    __componentId: componentId,
    __immutable:   false,
    __found:       true,
  };
}

// ── getAllConfigs() — full config snapshot for all components ─────────────────
// Used by diagnostic /status and orchestrator /api/contract for config surfacing.
function getAllConfigs(env = process.env) {
  const result = {};
  for (const componentId of Object.keys(COMPONENT_MAP)) {
    result[componentId] = getConfig(componentId, { env });
  }
  return result;
}

// ── validateConfig(componentId, userConfig) ───────────────────────────────────
// Checks that all keys in userConfig exist in the component's declared config.
// Returns { valid: bool, unknown: string[], missing: string[] }
// Strict: unknown keys are flagged (§1.1 nothing pretends).
function validateConfig(componentId, userConfig = {}) {
  const entry = COMPONENT_MAP[componentId];
  if (!entry) return { valid: false, unknown: [], missing: [], error: `unknown component: ${componentId}` };

  const declared = new Set(Object.keys(entry.config || {}));
  const provided = new Set(Object.keys(userConfig).filter(k => !k.startsWith('__')));

  const unknown = [...provided].filter(k => !declared.has(k));
  const missing = []; // nothing is required — all have defaults

  return {
    valid:   unknown.length === 0,
    unknown,
    missing,
    componentId,
    immutable: entry.immutable,
  };
}

module.exports = { getConfig, getAllConfigs, validateConfig, envKey };
