'use strict';
/**
 * lib/grammar-fallback.js — NEXUS Grammar-Driven Command Resolution
 * UUID: nexus-grammar-fallback-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * §PHASE-15: guardian's /cli/exec previously had zero grammar-engine
 * involvement — any command outside its hand-coded switch returned a flat
 * "Unknown command" error, with no path to anything registered dynamically
 * via component-registry. This is the single, shared resolution step that
 * closes that gap.
 *
 * §5.7 Low coupling, high cohesion: this is the one place that calls
 * grammar-engine.resolve() + component-registry.get() together for CLI
 * dispatch. guardian/server.js calls this; it does not duplicate the logic
 * inline. Any future CLI surface (nexus-repl.js, a future cockpit) should
 * call this too rather than re-implementing it.
 *
 * §5.5 / honesty note: this resolves a command to a component and reports
 * its declared route. It does NOT invoke that route. Nothing else in this
 * codebase dereferences component.route into a real HTTP call yet — that's
 * Phase 40 (Component Descriptor) territory. Building real invocation here
 * would be scope creep dressed up as a fix.
 */

const ge      = require('../../lib/grammar-engine');
const compReg = require('../../lib/component-registry');

const MODULE_ID = 'grammar-fallback';
const VERSION   = '1.0.0';

/**
 * Resolve a raw CLI command string against the live grammar tree.
 * @param {string} raw - the full command line, e.g. "cortex gaps list"
 * @param {object} [opts]
 * @param {string} [opts.orchestratorUrl] - defaults to local orchestrator
 * @returns {Promise<{resolved:boolean, componentId?:string, matched?:string,
 *   remainder?:string[], route?:object|null, note?:string}>}
 */
async function resolveCommand(raw, opts = {}) {
  const orchestratorUrl = opts.orchestratorUrl || 'http://127.0.0.1:9000';

  if (!ge.status().ready) {
    try { await ge.fetch(orchestratorUrl); }
    catch (_) { return { resolved: false, reason: 'grammar engine unavailable — orchestrator unreachable' }; }
  }

  const result = ge.resolve(raw);
  if (!result) return { resolved: false, reason: 'no grammar match' };

  let comp = null;
  try { comp = compReg.get(result.componentId); } catch (_) { /* registry unreachable — still report the match */ }

  return {
    resolved: true,
    componentId: result.componentId,
    matched: result.matched,
    remainder: result.remainder,
    route: comp?.route || null,
    note: comp?.route
      ? 'Resolved via grammar engine. Route invocation is not wired yet (Phase 40) — call it directly.'
      : 'Resolved via grammar engine, but this component has no registered route.',
  };
}

module.exports = { resolveCommand, MODULE_ID, VERSION };
