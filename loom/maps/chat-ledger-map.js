'use strict';
/**
 * loom/maps/chat-ledger-map.js — 0.39.278: the live chat ledger (Clear Glass download manager), the page-side stream
 * that feeds it, and the co-pilot pane's kept conversation, mapped into LOOM one component per FILE with every REAL
 * edge as a wire. Mirrors loom/maps/agent-memory-map.js.
 * comp_id: nexus.loom.maps.chat-ledger
 * UUID: nexus-loom-map-chat-ledger-v1-0000-2026-0929-001
 *
 * Why hand-mapped: two of the edges are not require()s, so the source scanner cannot see them —
 *   guardian/userscript-chat-stream.js → clear-glass/src/ipc/bridge.js   HTTP POST :7702/cli/downloads/ledger
 *   clear-glass/src/providers/host.js  → guardian/userscript-chat-stream.js   read from disk and injected as a prelude
 * The require() edges of these files are listed too (the scanner skips hand-mapped files, loom/bootstrap.js).
 */
const { idFor } = require('../scanners/source-map');

const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['clear-glass/src/downloads/chat-ledger.js', I('clear-glass/src/downloads/chat-ledger.js'), [
    I('clear-glass/src/downloads/artifact-chat-index.js'),    // defaultRoot() — the ledgers live beside the .response files
  ]],
  ['guardian/userscript-chat-stream.js', I('guardian/userscript-chat-stream.js'), [
    I('clear-glass/src/ipc/bridge.js'),                       // HTTP: POST :7702/cli/downloads/ledger
  ]],
  ['clear-glass/src/copilot/chat-store.js', I('clear-glass/src/copilot/chat-store.js'), [
    I('clear-glass/src/storage/jaa.js'),                      // store() — Clear Glass's own JAA store
  ]],
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('clear-glass/src/providers/host.js'), I('guardian/userscript-chat-stream.js'), 'providers/host.js _loadSharedPrelude — read and injected before each provider script'],
];

function mapChatLedger(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0929-001` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  // every file here is required by something (bridge, host, the pane) — each gets an export hook
  for (const [, id, req] of FILES) {
    const e = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0929-001` });
    (e.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r: e });
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0929-001` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `chat-ledger.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-chat-ledger-wire-${n}-v1-0000-2026-0929-001`, external: true });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      const r = driver.declare('wire', { id: `chat-ledger.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-chat-ledger-wire-${n}-v1-0000-2026-0929-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapChatLedger, FILES, CONSUMERS };
