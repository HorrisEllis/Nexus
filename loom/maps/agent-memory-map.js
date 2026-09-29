'use strict';
/**
 * loom/maps/agent-memory-map.js — 0.39.267–269: the agent-provider list, agent memory over the Clear Glass download
 * manager, and copilot's activity recall, mapped into LOOM one component per FILE with every REAL edge as a wire:
 * require() edges (verified against the source) and the one HTTP edge the source scanner cannot see.
 * Mirrors loom/maps/cos-testenv-map.js / observability-map.js.
 * comp_id: nexus.loom.maps.agent-memory
 * UUID: nexus-loom-map-agent-memory-v1-0000-2026-0927-001
 *
 * Ids come from source-map.js idFor(), so the scanner (which excludes hand-mapped paths, loom/bootstrap.js) never
 * declares these twice. Edges INTO these files from their consumers (idearium/agent-suite, idearium/api,
 * idearium/spec-engine, lib/seam/adapters/warp-cascade, lib/repo-agent, copilot/intuition, copilot/server,
 * copilot/lifeline, copilot/analysis, ollama/lib/dispatch) are ordinary require()s in scanned files: the scanner
 * wires them to these ids itself.
 */
const { idFor } = require('../scanners/source-map');

const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['lib/agent-providers.js', I('lib/agent-providers.js'), [
    I('copilot/server.js'),                                   // HTTP: resolveCopilot() → GET :3750/api/prompt/resolve
  ]],
  ['lib/agent-memory.js', I('lib/agent-memory.js'), [
    I('clear-glass/src/downloads/artifact-chat-index.js'),    // record → recordResponse; recall → queryItems/readItem
    I('guardian/lib/response-sink.js'),                       // record → deliver() (.response node, ledger, downloads list)
    I('lib/chat-logger.js'),                                  // record → log() (chat_log + JSONL)
    I('lib/extract-code.js'),                                 // record → the code blocks of a reply
    I('lib/vector-memory.js'),                                // recall → search() over chat_log, when it runs
    I('lib/agent-providers.js'),                              // record → which providers guardian records itself
  ]],
  ['copilot/lib/activity-recall.js', I('copilot/lib/activity-recall.js'), [
    I('lib/ollama-activity.js'),                              // tail() — every Ollama call
    I('copilot/adversarial.js'),                              // lastResults(), INTERVAL_MS — the self-test
    I('lib/scheduler.js'),                                    // list() — scheduled tasks
    I('lib/triggers.js'),                                     // list() — armed triggers
    'nexus.cortex.jaa-db',                                    // chat_log, repo_agent_log (the id every map uses for jaa-db)
  ]],
];

const BOUNDARY_EXPORTS = ['nexus.lib.extract-code'];

// Consumers that are HAND-MAPPED elsewhere (so the source scanner skips them and never sees these requires). Each is a
// real require() in that file, added in 0.39.267–269: [consumer id, dependency id, where].
const CONSUMERS = [
  ['nexus.copilot.lifeline',       I('lib/agent-memory.js'),            'copilot/lifeline.js _tryOllama → recall()'],
  ['nexus.copilot.server',         I('copilot/lib/activity-recall.js'), 'copilot/server.js GET /api/activity'],
  ['nexus.ollama.lib.dispatch',    I('lib/agent-memory.js'),            'ollama/lib/dispatch.js _remember → record()'],
  ['nexus.idearium.api',           I('lib/agent-providers.js'),         'idearium/api/index.js GET /api/agent-providers, _buildIdentity'],
  ['nexus.idearium.api',           I('lib/agent-memory.js'),            'idearium/api/index.js _buildIdentity + speceng.build recall()'],
  ['nexus.idearium.spec-engine',   I('lib/agent-providers.js'),         'idearium/spec-engine/index.js setChunkAgent → normalize/isKnown'],
];
// copilot/server.js has an export hook but no import hook in the registry (checked on a fresh bootstrap of 0.39.268:
// nothing is wired INTO nexus.copilot.server, though copilot-capability-map.js lists its requires), so the
// /api/activity edge had no endpoint. Declared here; the capability map's own edges into server are its concern.
const BOUNDARY_IMPORTS = ['nexus.copilot.server'];

function mapAgentMemory(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0927-001` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  const requiredBy = new Set();
  for (const [, , req] of FILES) for (const d of req) requiredBy.add(d);
  for (const [, id, req] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0927-001` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0927-001` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  // lib/extract-code.js is hand-mapped by copilot-capability-map.js (so the scanner skips it) and nothing there
  // requires it, so it never got an export hook — every real consumer's wire to it had no endpoint. Its export hook
  // is declared here, once, on the existing component.
  for (const dep of BOUNDARY_EXPORTS) {
    const r = driver.declare('hook', { id: `${dep}.export`, component_id: dep, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${dep}-export-v1-0000-2026-0927-001` });
    (r.ok ? results.hooks : results.failures).push({ id: `${dep}.export`, r });
  }
  for (const c of BOUNDARY_IMPORTS) {
    const r = driver.declare('hook', { id: `${c}.import`, component_id: c, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${c}-import-v1-0000-2026-0927-001` });
    (r.ok ? results.hooks : results.failures).push({ id: `${c}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `agent-memory.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-agent-memory-wire-${n}-v1-0000-2026-0927-001`, external: true });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      // a dependency outside this map is a scanned file: its .export hook is the scanner's
      const r = driver.declare('wire', { id: `agent-memory.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-agent-memory-wire-${n}-v1-0000-2026-0927-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapAgentMemory, FILES, BOUNDARY_EXPORTS, CONSUMERS, BOUNDARY_IMPORTS };
