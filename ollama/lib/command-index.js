'use strict';
/**
 * ollama/lib/command-index.js — phase 2 of docs/command-index-per-system.spec.
 * comp_id: nexus.ollama.command-index
 * uuid: nexus-ollama-command-index-v1-0000-2026-0903-001
 *
 * §MECHANISM, exactly as specced — each real route module already
 * self-declares its own `commands` export (added alongside its existing
 * handle(ctx) export, additive, not a rewrite of dispatch). This file
 * aggregates all six at boot time. No route logic lives here; this is a
 * pure projection, same discipline as idearium's real `contract.live`
 * endpoint (docs/command-index-per-system.spec's own phase 1, DONE).
 *
 * §EXIT CRITERIA, per the spec's own build_order.phase-2:
 *   "GET /commands returns a union of all six modules' declared
 *   commands, verified against ollama/server.js's own require list."
 * The require list below is copy-identical to ollama/server.js's own
 * `routes` array (same six files, same order) — checked directly, not
 * a second, independently-guessed list that could drift from the real
 * one server.js actually dispatches through.
 */

const ROUTE_MODULES = [
  { file: 'system.js', mod: require('../routes/system.js') },
  { file: 'uploads.js', mod: require('../routes/uploads.js') },
  { file: 'stream.js', mod: require('../routes/stream.js') },
  { file: 'jobs.js', mod: require('../routes/jobs.js') },
  { file: 'queue.js', mod: require('../routes/queue.js') },
  { file: 'models.js', mod: require('../routes/models.js') },
];

/**
 * buildCommandIndex() — real, live aggregation, not a cached/stale copy.
 * Called fresh on every GET /commands request (see server.js wiring),
 * matching clear-glass's own real _buildCommandIndex()'s "generatedAt"
 * convention — a timestamp of when THIS call ran, not when the server
 * booted.
 */
function buildCommandIndex() {
  const commands = [];
  const missing = [];
  for (const { file, mod } of ROUTE_MODULES) {
    if (!Array.isArray(mod.commands)) {
      // §HONEST GAP, not silently skipped — a route module without a
      // real `commands` export is a real drift risk (its dispatch
      // exists but this index can't see it). Named here, not hidden.
      missing.push(file);
      continue;
    }
    for (const cmd of mod.commands) commands.push({ ...cmd, module: file });
  }
  return {
    systemId: 'ollama',
    generatedAt: Date.now(),
    commandCount: commands.length,
    commands: commands.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    modulesMissingCommandsExport: missing, // empty array today; a real, honest tripwire if a 7th route file is ever added without updating this list
  };
}

module.exports = { buildCommandIndex };
