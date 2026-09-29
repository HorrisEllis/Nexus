'use strict';
/**
 * loom/maps/idearium-codebase-map.js — 0.39.273: idearium's codebase toolkit (structural chunker v2, chunk cards, the
 * search index, the edit engine, the /api/repos/:uuid/code/* surface and the eleven agent code tools), mapped into
 * LOOM one component per FILE with every real edge as a wire. Mirrors loom/maps/agent-memory-map.js.
 * Map: docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec.
 * comp_id: nexus.loom.maps.idearium-codebase
 * UUID: nexus-loom-map-idearium-codebase-v1-0000-2026-0927-273
 *
 * Why these files are hand-mapped rather than left to the scanner: idearium/repo/code-api.js reaches CJS modules
 * through createRequire's `_require(...)` (not a literal require the scanner reads) and is reached from
 * idearium/api/index.js by `await import()`; the agent tool reaches idearium over HTTP. The lib/code-intel files are
 * mapped with them so the whole toolkit is one readable map. Scanned consumers — idearium/repo/import-pipeline.js
 * (static import of lib/code-intel), lib/repo-context.js and lib/repo-agent.js (literal requires) — are wired by the
 * scanner itself; hand-mapped consumers (idearium/api, lib/agent-tools/index.js) are declared in CONSUMERS below.
 */
const { idFor } = require('../scanners/source-map');

const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['lib/code-intel/structure.js', I('lib/code-intel/structure.js'), []],
  ['lib/code-intel/decls.js', I('lib/code-intel/decls.js'), []],
  ['lib/code-intel/text.js', I('lib/code-intel/text.js'), []],
  ['lib/code-intel/chunker.js', I('lib/code-intel/chunker.js'), [
    I('lib/code-intel/structure.js'),         // lineInfo, indentWidth — depth + statement starts per line
    I('lib/code-intel/decls.js'),             // matchDecl, signatureOf — what a statement start declares
  ]],
  ['lib/code-intel/cards.js', I('lib/code-intel/cards.js'), [
    I('lib/code-intel/text.js'),              // identifiersOf, inlineRequires — what a chunk uses, by name
  ]],
  ['lib/code-intel/search.js', I('lib/code-intel/search.js'), [
    I('lib/code-intel/text.js'),              // terms — the one tokenizer for index and query
  ]],
  ['lib/code-intel/index.js', I('lib/code-intel/index.js'), [
    I('lib/code-intel/chunker.js'),           // planChunks, VERSION, LIMITS
    I('lib/code-intel/cards.js'),             // buildCards, TEST_RE
    I('lib/code-intel/search.js'),            // buildIndex, query, grep, chunkAt
    I('lib/code-intel/text.js'),              // terms
    I('lib/code-intel/structure.js'),         // re-exported for callers
  ]],
  ['lib/code-edit.js', I('lib/code-edit.js'), [
    I('lib/languages.js'),                    // diagnose — extension → language
    I('lib/code-intel/structure.js'),         // diagnose — brace balance where no checker exists
    I('lib/repo-inject.js'),                  // commit — list/propose/edit/apply/revert/reject/currentOf (passed in as RI)
  ]],
  ['idearium/repo/code-api.js', I('idearium/repo/code-api.js'), [
    I('idearium/repo/import-pipeline.js'),    // ensureIntel — index a repo that has no cards yet
    I('lib/code-intel/index.js'),             // every read: overview/tree/query/grepRepo/card/outline/definition/load
    I('lib/code-edit.js'),                    // every write: current/planEdits/unifiedDiff/diagnose/commit
    I('lib/repo-inject.js'),                  // modeFor, list, the trail every write goes through
    I('lib/repo-hat.js'),                     // getRepoHat — who the write is attributed to
    I('lib/registry-harness.js'),             // check: the registry's covering tests
    I('lib/cos-run.js'),                      // check: run a related test file (test.file)
    I('lib/cos-bridge.js'),                   // check: the repo's COS compartment
  ]],
  ['lib/agent-tools/tools/idearium/code.js', I('lib/agent-tools/tools/idearium/code.js'), [
    I('lib/agent-tools/naming.js'),           // toolName('idearium', 'code_*')
    I('idearium/api/index.js'),               // HTTP: :4800 /api/repos/:uuid/code/* and /injects/:id/revert|reject
  ]],
];

// export hooks nothing else declares (checked on a fresh bootstrap of this tree): idearium/api is hand-mapped with an
// import hook only, so the tool's HTTP edge into it had no endpoint
const BOUNDARY_EXPORTS = ['nexus.idearium.api'];

// Consumers that are HAND-MAPPED elsewhere (the scanner skips them): [consumer id, dependency id, where].
const CONSUMERS = [
  ['nexus.idearium.api',    I('idearium/repo/code-api.js'),              'idearium/api/index.js repo.code → handleCode (await import)'],
  // NOT declared: lib/agent-tools/index.js → the code tools (it registers all eleven). That consumer has no component in
  // the registry on a fresh bootstrap of 0.39.272 (its own `nexus.lib.agent-tools.export` is already in the STILL
  // UNRESOLVED list), so a wire into it can only be rejected. Stated here instead of adding a wire that cannot land;
  // it resolves the day copilot-capability-map.js's declaration of nexus.lib.agent-tools does.
];
// idearium/api's import hook is declared by session-2026-08-14-map.js
const BOUNDARY_IMPORTS = [];

function mapIdeariumCodebase(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0927-273` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  const requiredBy = new Set();
  for (const [, , req] of FILES) for (const d of req) requiredBy.add(d);
  for (const [, dep] of CONSUMERS) requiredBy.add(dep);
  for (const [, id, req] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0927-273` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0927-273` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  for (const dep of BOUNDARY_EXPORTS) {
    const r = driver.declare('hook', { id: `${dep}.export`, component_id: dep, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${dep}-export-v1-0000-2026-0927-273` });
    (r.ok ? results.hooks : results.failures).push({ id: `${dep}.export`, r });
  }
  for (const c of BOUNDARY_IMPORTS) {
    const r = driver.declare('hook', { id: `${c}.import`, component_id: c, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${c}-import-v1-0000-2026-0927-273` });
    (r.ok ? results.hooks : results.failures).push({ id: `${c}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `idearium-codebase.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-idearium-codebase-wire-${n}-v1-0000-2026-0927-273`, external: true });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      // a dependency outside this map is a scanned (or otherwise mapped) file: its .export hook is declared there
      const r = driver.declare('wire', { id: `idearium-codebase.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-idearium-codebase-wire-${n}-v1-0000-2026-0927-273`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapIdeariumCodebase, FILES, BOUNDARY_EXPORTS, CONSUMERS, BOUNDARY_IMPORTS };
