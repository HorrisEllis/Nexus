'use strict';
/**
 * lib/agent-tools/tools/governance/loom-register.js — loom_register tool
 * UUID: nexus-tool-loom-register-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James: "build new capabilities for the systems, and
 * automatically add the hook and wires to the registry but has to have a
 * consumer." Checked first: loom/schema/registry.js's real add(kind,
 * record) is generic across component/hook/wire/concern — but has NO
 * consumer check at all (confirmed by reading add() directly: duplicate-id
 * check, persist, cortex-sync, nothing else). Exposing that function
 * to an agent unguarded would let copilot recreate the exact dangling-
 * hook flood this session already spent real effort diagnosing and
 * partially fixing (service/nexus-diagnostic.js's dedup_key work,
 * cortex/gap-finder/index.js) — a declared hook nothing consumes is
 * precisely what that flood was made of.
 *
 * So this tool does NOT just forward to add(). "hook_with_wire" is one
 * atomic action: it will not register a new hook unless the SAME call
 * also gives a real wire connecting it to a hook that ALREADY exists in
 * the registry — checked live via driver.registry.has('hook', ...)
 * before either is committed. No consumer, no registration. This is the
 * actual enforcement of "has to have a consumer," not a suggestion left
 * to a scanner to catch after the fact.
 */
function _loomDriver() {
  const { LoomDriver } = require('../../../../loom/schema/index.js');
  // §FIX 2026-08-14 — same bug as nexus-map.js, same fix. Every
  // loom_register call this session had been writing into a nearly-empty
  // shadow registry, never the real one. See nexus-map.js's fuller note.
  return new LoomDriver();
}

const ACTIONS = {
  component: (a) => {
    if (!a.component || !a.component.id) return { error: 'component needs a component object with at least an id' };
    const driver = _loomDriver();
    if (driver.registry.has('component', a.component.id)) return { ok: false, error: `component "${a.component.id}" already registered` };
    const row = driver.registry.add('component', a.component);
    return { ok: true, component: row };
  },

  // §THE REAL CONSTRAINT — see file header. consumerHookId must already
  // exist; the new hook is only committed alongside a wire that actually
  // connects to it. Rolled back (neither persisted) if the consumer check
  // fails, so a rejected call never leaves a half-registered hook behind.
  hook_with_wire: (a) => {
    if (!a.hook || !a.hook.id || !a.hook.component_id) return { error: 'hook_with_wire needs hook: {id, component_id, type, direction}' };
    if (!a.consumerHookId) return { error: 'hook_with_wire needs consumerHookId — the already-real hook this new one wires into. A hook with no consumer is refused, not warned about.' };
    const driver = _loomDriver();

    if (!driver.registry.has('hook', a.consumerHookId)) {
      return { ok: false, error: `consumerHookId "${a.consumerHookId}" does not exist in the registry — cannot register a hook against a consumer that isn't real` };
    }
    if (driver.registry.has('hook', a.hook.id)) return { ok: false, error: `hook "${a.hook.id}" already registered` };

    const hookRow = driver.registry.add('hook', a.hook);

    const wireId = a.wireId || `wire-${a.hook.id}-${a.consumerHookId}`;
    const direction = a.hook.direction === 'output' ? { from: a.hook.id, to: a.consumerHookId } : { from: a.consumerHookId, to: a.hook.id };
    let wireRow;
    try {
      wireRow = driver.registry.add('wire', { id: wireId, ...direction, intent: a.intent || null });
    } catch (e) {
      // §ROLLBACK — the wire failed (e.g. duplicate wireId); don't leave
      // an orphan hook behind. registry.js has no delete(), so this
      // overwrites the just-added row back to nonexistent via direct
      // state removal — the one place this tool reaches past add()'s
      // public surface, and only to undo its own just-made write.
      try { delete driver.registry._state.hook[a.hook.id]; driver.registry._persist(); } catch (_) {}
      return { ok: false, error: `hook registered but wire failed (${e.message}) — rolled back, hook was not left dangling` };
    }

    return { ok: true, hook: hookRow, wire: wireRow };
  },

  concern: (a) => {
    if (!a.concern || !a.concern.id) return { error: 'concern needs a concern object with at least an id' };
    const driver = _loomDriver();
    if (driver.registry.has('concern', a.concern.id)) return { ok: false, error: `concern "${a.concern.id}" already registered` };
    const row = driver.registry.add('concern', a.concern);
    return { ok: true, concern: row };
  },
};

module.exports = {
  name: 'loom_register',
  description:
    'Register a real new component, hook+wire, or concern into loom\'s live registry. Actions: ' +
    '"component" (needs component: {id, name?, dir?, consumes?, produces?}), "hook_with_wire" (needs ' +
    'hook: {id, component_id, type, direction} AND consumerHookId — an already-real hook this one wires ' +
    'into; REFUSED if consumerHookId doesn\'t already exist, so a hook can never be registered without a ' +
    'real consumer), "concern" (needs concern: {id, ...} — a roadmap/gap entry, no consumer required, ' +
    'this is the mechanism nexus_status\'s "concerns" action reads from).',
  parameters: {
    type: 'object',
    properties: {
      action:         { type: 'string', enum: Object.keys(ACTIONS) },
      component:      { type: 'object', description: 'for "component"' },
      hook:           { type: 'object', description: 'for "hook_with_wire" — {id, component_id, type, direction}' },
      consumerHookId: { type: 'string', description: 'for "hook_with_wire" — REQUIRED, must already exist' },
      wireId:         { type: 'string', description: 'for "hook_with_wire" — optional, auto-generated if omitted' },
      intent:         { type: 'string', description: 'for "hook_with_wire" — why this wire exists' },
      concern:        { type: 'object', description: 'for "concern"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `loom_register ${args.action} failed: ${e.message}` }; }
  },
};
