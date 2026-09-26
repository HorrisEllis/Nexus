'use strict';
/**
 * src/plugins/schema.js — Clear Glass Plugin Manifest Validator
 * UUID: cg-plugin-schema-v1-0000-0000-000000000001
 *
 * §MAP FIRST 2026-08-24 — before writing this, checked what already exists
 * rather than assuming a blank slate (James: "look at the lib folder, or
 * clearglass"):
 *   - cos/plugin/schema.js is a real, proven manifest validator (COS-39),
 *     but its `contributes` vocabulary (runtimes, compilers, archetypes,
 *     blueprints, cliCommands, watchdogRules, themes, hooks) is COS-level —
 *     none of it maps to a browser plugin (an adblocker doesn't contribute
 *     a "runtime" or a "blueprint"). Not reused as-is; its FIELD VALIDATION
 *     (isUUID/isSemver/isKebab, from cos/foundation/hook-schema.js) is
 *     dependency-free and reused directly below rather than reimplemented —
 *     same discipline as reusing cos/plugin/schema.js's own shape.
 *   - Clear Glass already has a real, live, wired event bus
 *     (clear-glass/src/core/bus.js's getBus(), clear-glass/src/gates/
 *     index.js's ~20 real gates) built on clear-glass/siso/index.js — its
 *     OWN real SISO port, not warp/core, and NOT instanceof-compatible
 *     with warp/core's Event/Gate (checked directly: clear-glass's
 *     Stream.emit() does `if (!(event instanceof Event))` against its own
 *     Event class). Plugin contributions register as real Gates on THIS
 *     bus (host.js), using clear-glass's own Gate/Event — swapping the
 *     whole bus onto warp/core wholesale would break every one of the ~20
 *     already-wired production gates (they use a `gate(sig, transformFn)`
 *     factory that mutates a Gate instance's .transform after
 *     construction; warp's Gate constructor requires transform as a
 *     constructor argument and throws without it) for a change nobody
 *     asked for. See host.js's own header for how warp's actual
 *     differentiator (Axiom enforcement, not Event/Gate/Stream) gets used
 *     for real instead, via the exact ATTACH-don't-replace pattern
 *     lib/warp-bus.js already established for every other NEXUS system.
 *
 * Axioms this schema enforces directly (COS axioms are law per the
 * standing instruction — parsed from cos/foundation/axioms.js, not
 * reworded from memory):
 *   COS-1  "Nothing exists until proven — no stubs" — validateManifest
 *          throws, does not warn, on any missing/malformed required field.
 *   COS-3  "Every hook has UUID + contract + version" — id/version/
 *          contributes below are this axiom's plugin-level shape.
 *   COS-11 "Network isolation is default-on — opt-in to open" —
 *          permissions.network below has NO default; it must be an
 *          explicit boolean, same as COS-11's own enforce() requiring
 *          networkConfig.isolated to be explicit, never inferred.
 */

const { isUUID, isSemver, isKebab } = require('../../../cos/foundation/hook-schema.js');
const { CLEAR_GLASS_CONTRIBUTION_TYPE } = require('./contribution-types.js');

class PluginSchemaError extends Error {
  constructor(field, message, manifest = null) {
    super(`ClearGlassPluginSchema: ${field} — ${message}`);
    this.name     = 'PluginSchemaError';
    this.field    = field;
    this.manifest = manifest;
  }
}

// ─── permissions ────────────────────────────────────────────────────────────
// §COS-11 — every field here must be an explicit boolean. No defaults, no
// inference. A manifest that omits `network` is invalid, not "assumed
// false" — the axiom's own text is "opt-in to open," and silently
// defaulting a MISSING field to closed is still a form of inferring intent
// the axiom says not to infer. Explicit or rejected, either way.
function validatePermissions(perms, manifest) {
  if (!perms || typeof perms !== 'object') {
    throw new PluginSchemaError('permissions', 'must be an object', manifest);
  }
  const required = ['network', 'domStorage', 'webRequest', 'hostFs'];
  for (const field of required) {
    if (typeof perms[field] !== 'boolean') {
      throw new PluginSchemaError(`permissions.${field}`, 'is required and must be an explicit boolean (COS-11)', manifest);
    }
  }
}

// ─── contributes ────────────────────────────────────────────────────────────
function validateContributes(contributes, manifest) {
  if (!contributes || typeof contributes !== 'object') {
    throw new PluginSchemaError('contributes', 'must be an object with at least one contribution (COS-1: a plugin that contributes nothing is a stub)', manifest);
  }
  const keys = Object.keys(contributes);
  if (keys.length === 0) {
    throw new PluginSchemaError('contributes', 'must declare at least one contribution', manifest);
  }
  for (const type of keys) {
    if (!CLEAR_GLASS_CONTRIBUTION_TYPE.has(type)) {
      throw new PluginSchemaError(`contributes.${type}`, `unknown contribution type — must be one of: ${CLEAR_GLASS_CONTRIBUTION_TYPE.values.join(', ')}`, manifest);
    }
    if (!Array.isArray(contributes[type])) {
      throw new PluginSchemaError(`contributes.${type}`, 'must be an array', manifest);
    }
    for (const entry of contributes[type]) {
      if (typeof entry.signature !== 'string' || !entry.signature.startsWith(`plugin:${manifest.id}:`)) {
        // §COS-3-shaped — every contribution needs a stable, unique
        // signature, namespaced under the plugin's own id so two plugins
        // can never collide on a Gate signature (warp/clear-glass-siso's
        // own "collision is a hard error" law, enforced one level up: by
        // construction, not by hoping two plugin authors pick different
        // strings).
        throw new PluginSchemaError(`contributes.${type}[]`, `entry.signature must start with "plugin:${manifest.id}:"`, manifest);
      }
      if (typeof entry.handler !== 'string') {
        throw new PluginSchemaError(`contributes.${type}[]`, 'entry.handler must name an exported function in the plugin module', manifest);
      }
      if (type === 'userscript' && entry.linkTarget !== undefined) {
        // §NEW 2026-08-24 — validated against the REAL shape
        // ipc/bridge.js's _routeGuardianListenerEvent actually switches
        // on (read directly before writing this, not guessed): type must
        // be one of its four real cases, and 'compartment'/'sse-system'
        // both read target.system, so it's required for those two, not
        // universally. A manifest declaring an unroutable linkTarget
        // would fail silently at runtime (bridge.js's switch has no
        // default case, so an unknown type just... routes nowhere) —
        // COS-1 says that's a validation-time error, not a silent no-op
        // discovered later.
        const VALID_LINK_TYPES = ['ledger', 'compartment', 'sse-system', 'ollama-stream'];
        if (!VALID_LINK_TYPES.includes(entry.linkTarget?.type)) {
          throw new PluginSchemaError(`contributes.userscript[].linkTarget.type`, `must be one of: ${VALID_LINK_TYPES.join(', ')}`, manifest);
        }
        if (['compartment', 'sse-system'].includes(entry.linkTarget.type) && typeof entry.linkTarget.system !== 'string') {
          throw new PluginSchemaError(`contributes.userscript[].linkTarget.system`, `required and must be a string when linkTarget.type is '${entry.linkTarget.type}'`, manifest);
        }
      }
    }
  }
}

/**
 * Validates a Clear Glass Plugin Manifest. Throws PluginSchemaError.
 * @param {object} manifest
 * @returns {object} the validated manifest, unchanged
 */
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new PluginSchemaError('manifest', 'must be an object');
  }
  if (!isUUID(manifest.id)) {
    throw new PluginSchemaError('id', `must be a valid UUID v4, got: ${JSON.stringify(manifest.id)}`, manifest);
  }
  if (!isKebab(manifest.name)) {
    throw new PluginSchemaError('name', `must be kebab-case, got: ${JSON.stringify(manifest.name)}`, manifest);
  }
  if (!isSemver(manifest.version)) {
    throw new PluginSchemaError('version', `must be semver, got: ${JSON.stringify(manifest.version)}`, manifest);
  }
  for (const field of ['displayName', 'description', 'author', 'entryPoint']) {
    if (typeof manifest[field] !== 'string' || manifest[field].length < 1) {
      throw new PluginSchemaError(field, 'must be a non-empty string', manifest);
    }
  }
  validatePermissions(manifest.permissions, manifest);
  validateContributes(manifest.contributes, manifest);
  return manifest;
}

module.exports = { PluginSchemaError, validateManifest };
