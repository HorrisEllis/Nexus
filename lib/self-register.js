'use strict';
/**
 * lib/self-register.js — the self-registration convention
 * UUID: nexus-lib-self-register-v1-0000-2026-0725-001
 * Version: 1.0.0
 *
 * THE PRINCIPLE (James, 2026-07-25): "The registry needs to be updated always.
 * That way the system understands itself."
 *
 * Every gap this codebase has hit is the same gap: the thing EXISTED but the
 * registry didn't know about it, so nothing could act on it — hooks projected
 * from an empty table, consumer edges unpopulated, causedBy null, snapshots
 * never written, intelligence not registered, RAID routing to nothing. A
 * registry you have to REMEMBER to update is always wrong, because nobody
 * remembers. The fix is structural, not disciplinary: registration happens at
 * the moment of existence, automatically.
 *
 * This is NOT new machinery. lib/component-registry.register() already:
 *   - is idempotent (re-register = update), so calling every boot is safe
 *   - queues if called before init (boot-order cannot break it)
 *   - auto-projects the descriptor and emits component.registered
 *   - flows to grammar-engine (trie rebuild) AND the capability registry
 *     (which is a projection of components) — so a registered capability
 *     becomes RAID-routable with no extra step.
 * module-builder already calls register() when a HUMAN builds a tool. This
 * convention makes a SYSTEM call it for its own capabilities at boot — the
 * same path, extended to self-description (§16.5 — extend, don't invent).
 *
 * A system calls registerSelf() once at the end of its init, passing its
 * capabilities. From then on the registry mirrors that the system exists and
 * what it can do — the precondition for RAID routing to it, for the tablet
 * showing it, and for the system understanding itself.
 */

const MODULE_ID = 'lib/self-register';
const VERSION = '1.0.0';

/**
 * buildComponents(namespace, capabilities, opts) — pure: turns a
 * capability list into real component rows, same shape
 * lib/component-registry.js's register() expects. Factored out of
 * registerSelf() below so lib/self-register-remote.js (the cross-process
 * variant — see cortex/boot.js's POST /api/components/register-batch for
 * why one had to exist) builds the exact same shape rather than a second,
 * driftable copy of this logic.
 */
function buildComponents(namespace, capabilities, opts = {}) {
  const registeredBy = opts.registeredBy || namespace;
  const version = opts.version || '1.0.0';
  const components = [];
  const errors = [];

  for (const cap of capabilities) {
    if (!cap || !cap.name) { errors.push({ ok: false, error: 'capability.name required', cap }); continue; }
    const id = `${namespace}.${cap.name}`;
    // Grammar: RAID resolves intent by matching against grammar + description.
    // Default to the name plus description words so a bare capability is still
    // resolvable — never register something RAID can't find (§1.2).
    const grammar = Array.isArray(cap.grammar) && cap.grammar.length
      ? cap.grammar
      : [cap.name, ...String(cap.description || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)].slice(0, 8);

    components.push({
      id,
      namespace,
      name: cap.name,
      version,
      grammar,
      route: cap.route && cap.route.path ? cap.route : { method: 'POST', path: `/api/${namespace}/${cap.name}` },
      description: cap.description || `${namespace} ${cap.name}`,
      params: cap.params || [],
      registeredBy,
      available: true,   // resolve() filters on available:true — without this RAID cannot find it
      tags: ['self-registered', ...(cap.tags || [])],
    });
  }

  return { components, errors };
}

/**
 * registerSelf(namespace, capabilities, opts) — announce a system's
 * capabilities as components. Each capability becomes a component row that
 * flows through the existing projection chain.
 *
 * @param {string} namespace  — the owning system, e.g. 'intelligence'. A
 *        capability id is `${namespace}.${cap.name}` — and RAID's resolver
 *        treats the namespace AS the owning system (no separate mapping table).
 * @param {Array} capabilities — [{ name, description, route, grammar?, params? }]
 *        name:        short verb-ish id, e.g. 'mastermind' → intelligence.mastermind
 *        description: what it does (RAID matches intent against this)
 *        route:       { method, path } the real endpoint that fulfills it
 *        grammar:     optional string[] of phrasings; defaults to [name, ...description words]
 * @param {object} opts — { registeredBy?, version?, componentRegistry? }
 * @returns {{ ok, registered, failed, results }}
 *
 * §PROCESS SCOPE — this calls component-registry.js's register() directly,
 * in-process. Only correct for a system required straight into cortex's own
 * process (today: intelligence/index.js — see cortex/boot.js). Anything
 * running as its own OS process (guardian, copilot, clear-glass,
 * orchestrator — each has its own server.listen()) needs
 * lib/self-register-remote.js instead; calling this from one of those
 * processes would register against a throwaway, uninitialized registry
 * instance that cortex's RAID router never sees — not an error, just silently
 * useless, which is worse.
 */
function registerSelf(namespace, capabilities, opts = {}) {
  if (!namespace || typeof namespace !== 'string') {
    return { ok: false, error: 'namespace required', registered: 0, failed: 0, results: [] };
  }
  if (!Array.isArray(capabilities) || !capabilities.length) {
    return { ok: false, error: 'capabilities must be a non-empty array', registered: 0, failed: 0, results: [] };
  }

  let componentRegistry;
  try {
    componentRegistry = opts.componentRegistry || require('./component-registry');
  } catch (e) {
    return { ok: false, error: `component-registry unavailable: ${e.message}`, registered: 0, failed: 0, results: [] };
  }

  const { components, errors: buildErrors } = buildComponents(namespace, capabilities, opts);
  const results = buildErrors.slice();
  let registered = 0, failed = buildErrors.length;

  for (const component of components) {
    try {
      const r = componentRegistry.register(component);
      if (r.ok) { registered++; results.push({ ok: true, id: component.id, queued: !!r.queued }); }
      else { failed++; results.push({ ok: false, id: component.id, errors: r.errors }); }
    } catch (e) {
      failed++;
      results.push({ ok: false, id: component.id, error: e.message });
    }
  }

  return { ok: failed === 0, registered, failed, results };
}

module.exports = { MODULE_ID, VERSION, registerSelf, buildComponents };
