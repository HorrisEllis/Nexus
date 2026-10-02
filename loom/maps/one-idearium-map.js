'use strict';
/**
 * loom/maps/one-idearium-map.js — 0.39.271: the Phases manager, the living spec, the COS debug report and the
 * per-system node generator, mapped into LOOM one component per FILE with every real edge as a wire.
 * Mirrors loom/maps/agent-memory-map.js. Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec.
 * comp_id: nexus.loom.maps.one-idearium
 * UUID: nexus-loom-map-one-idearium-v1-0000-2026-0927-271
 *
 * idearium/repo/phases.js and living-spec.js are reached from idearium/api/index.js by `await import()` — an edge
 * the source scanner does not follow — and idearium/api, copilot/server and lib/cos-run are hand-mapped elsewhere
 * (the scanner skips them), so those consumer edges are declared here. Scanned consumers (orchestrator.js,
 * guardian/server.js, cli/nodes.js) require lib/system-nodes.js by a literal require(), which the scanner wires.
 */
const { idFor } = require('../scanners/source-map');

const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['idearium/repo/phases.js', I('idearium/repo/phases.js'), [
    I('idearium/repo/roadmap.js'),            // collectPhasemaps, buildRoadmap, isPhasemapPath
    I('lib/nexus-self/store.js'),             // head(), loadSnapshot(), filesOf(), getBlob() — NEXUS's phasemaps
    I('lib/nexus-self/systems.js'),           // systemForLoomTag() — a system's own phases
    I('loom/scanners/phasemap-map.js'),       // parsePhasemapText() — the one phase parser
  ]],
  ['idearium/repo/living-spec.js', I('idearium/repo/living-spec.js'), [
    I('idearium/repo/nexus-self.js'),         // specsFor(), fileText() — a nexus system's spec/ from the immutable base
    I('lib/nexus-self/systems.js'),           // names(), get() — each system's primary spec
  ]],
  ['lib/cos-debug-report.js', I('lib/cos-debug-report.js'), []],
  ['lib/system-nodes.js', I('lib/system-nodes.js'), [
    I('lib/node-export.js'),                  // wrap/exportToFile/importFromFile — the one envelope
    'nexus.guardian.command-index',           // SERVED: guardian/server.js's dispatch
    'nexus.ollama.command-index',             // SERVED: ollama/routes/*.js
    I('lib/nexus-self/systems.js'),           // the kernel table: port, entry
    I('lib/hat-forge.js'),                    // list() — every forged hat → .hat + .agent
    I('lib/repo-agent-node.js'),              // commandIds() — an agent's commands as command ids
  ]],
];

// export hooks nothing declared yet (checked on a fresh bootstrap of this tree): this map's consumed files, two
// scanned files the scanner gave no export hook, and the two command-index extractors, which are registered
// under their comp_ids (nexus.guardian.command-index, nexus.ollama.command-index), not path ids, with no hooks.
const BOUNDARY_EXPORTS = [
  I('idearium/repo/phases.js'), I('idearium/repo/living-spec.js'), I('lib/cos-debug-report.js'),
  'nexus.idearium.repo.roadmap', 'nexus.idearium.repo.nexus-self', 'nexus.lib.repo-agent-node',
  'nexus.guardian.command-index', 'nexus.ollama.command-index',
  // §0.39.283 N30 — cli/import-history.js is run as a child process, never require()d, so nothing gave it an export hook
  I('cli/import-history.js'), I('lib/history-import-job.js'),
  // §0.39.284 W3 — the work surface is reached only by `await import()` from idearium/api (index.js, build-surface.js)
  I('idearium/repo/work-surface.js'), I('idearium/repo/architecture.js'),
  // §0.39.286 RG1 — the routing policy, reached through createRequire from ESM (idearium/api, chunk-dispatch, the CLI)
  I('lib/pipeline-routing.js'),
  // §0.39.290 IL1 — reached only by await import() / createRequire
  I('idearium/lib/spec-library-import.js'),   // lib/spec-library.js gets its export hook from the scanner (a literal require)
  // §0.39.294 SW1 — the spec workshop: no longer here (0.39.295) — idearium/lib/void.js imports it with a literal import,
  // so the scanner gives it its export hook; declaring it here too was a duplicate (loom.unique-id)
  // §0.39.295 — the spatial void, reached only by await import() from idearium/api
  I('idearium/lib/void.js'),
  // §0.39.298 AR2 — the Architect, reached only by await import() from idearium/api
  I('idearium/lib/architect.js'),
  // §0.39.302 PR1 — the delivery checker, reached only by await import() from idearium/api
  I('idearium/repo/proof-run.js'),
];

// Consumers that are HAND-MAPPED elsewhere (the scanner skips them): [consumer id, dependency id, where].
const CONSUMERS = [
  ['nexus.idearium.api', I('idearium/repo/proof-run.js'),  'idearium/api/index.js repo.deliver.* — the delivery checker (await import)'],
  ['nexus.idearium.api', I('idearium/repo/phases.js'),      'idearium/api/index.js repo.phases.* (await import)'],
  ['nexus.idearium.api', I('idearium/repo/living-spec.js'), 'idearium/api/index.js repo.living-spec (await import)'],
  ['nexus.idearium.api', I('lib/cos-debug-report.js'),      'idearium/api/index.js repo.run — failures keep their compact debug report'],
  ['nexus.idearium.api', I('lib/nexus-self/apply.js'),      'idearium/api/index.js _phaseWrite — a nexus phase edit goes through the apply gate'],
  // §0.39.283 N30 — the archive drop box: idearium runs the import as a background job, the job spawns the CLI
  ['nexus.idearium.api', I('lib/history-import-job.js'),    'idearium/api/index.js history.import.* — start/status/upload behind /archive-import.html'],
  [I('lib/history-import-job.js'), I('cli/import-history.js'), 'lib/history-import-job.js start() — spawn(node cli/import-history.js --jsonl --list), a real edge the scanner cannot see'],
  // §0.39.284 W3 — the work surface: GET /api/repos/:uuid/worksurface, and each plan run's toolsBrief
  ['nexus.idearium.api', I('idearium/repo/work-surface.js'), 'idearium/api/index.js repo.worksurface + build-surface.js specPlan toolsBrief (await import)'],
  // §0.39.284 W7 — the repo's component registry + wiring map (GET|POST /api/repos/:uuid/architecture), over lib/code-intel
  ['nexus.idearium.api', I('idearium/repo/architecture.js'), 'idearium/api/index.js repo.architecture (await import)'],
  // §0.39.286 RG — routing and fallback: the API plans each chunk's route, chunk-dispatch walks it, the CLI shows it
  ['nexus.idearium.api', I('lib/pipeline-routing.js'), 'idearium/api/index.js _routingPolicy, routing.show/plan/breaker.reset, speceng.build plan()'],
  [I('idearium/spec-engine/chunk-dispatch.js'), I('lib/pipeline-routing.js'), 'idearium/spec-engine/chunk-dispatch.js _walkRoute + _dispatchChunkOnce (_req) — classify, breaker, shouldFallback'],
  // §0.39.288 PF2/PF5 — nexus-self is handed the engine and the repo layer (injected, never imported), so the scanner sees neither edge
  ['nexus.idearium.repo.nexus-self', I('idearium/spec-engine/index.js'), 'idearium/repo/nexus-self.js syncSystem — updateIngestedSpecAsync, ingestFilesAsSpecAsync on the injected engine'],
  // §0.39.291 PV1–PV3 — verify + prove: the API reaches the verifier by _require; agent-suite reaches the hardened Ollama
  // client by _require (createRequire) — edges the scanner cannot see
  ['nexus.idearium.api', I('lib/build-verify.js'), 'idearium/api/index.js repo.verify / repo.prove (_verifyRepo, _proveLoop) — verify + repairText'],
  [I('idearium/agent-suite/index.js'), I('ollama/lib/ollama-client.js'), 'idearium/agent-suite/index.js generateWithOllama — callOllamaRaw (streamed, idle timeout, think:false, continuation)'],
  // §0.39.290 IL1 — the spec library: the API and the CLI reach the importer by await import(); it reaches the scanner by createRequire
  ['nexus.idearium.api', I('idearium/lib/spec-library-import.js'), 'idearium/api/index.js spec-library.import / spec-library.list / spec-library.to-repo (await import; to-repo hands in _promoteSpecToRepo + RepoLayer.writeFile)'],
  [I('idearium/cli/index.js'), I('idearium/lib/spec-library-import.js'), 'idearium/cli/index.js spec-library.import (no server) / spec-library.list (await import)'],
  [I('idearium/lib/spec-library-import.js'), I('lib/spec-library.js'), 'idearium/lib/spec-library-import.js importLibrary — scan + convert (createRequire)'],
  // §0.39.294 SW1 — the spec workshop: the API owns its store and repos, hands it the agent (setAsk → copilot /api/prompt
  // through lib/repo-agent.js's default provider) and saves through the library's pipeline for a library document
  ['nexus.idearium.api', I('idearium/lib/workshop.js'), 'idearium/api/index.js workshop.* (_workshop: await import, setAsk)'],
  ['nexus.idearium.api', I('lib/repo-agent.js'), 'idearium/api/index.js _workshop ask — defaultProvider / routeFor / COPILOT_URL (_require)'],
  // §0.39.295 — the spatial void: the API owns the ideas, the echoes table and the agent (_agentAsk); void.js shapes it
  ['nexus.idearium.api', I('idearium/lib/void.js'), 'idearium/api/index.js void.* (await import) — echoPrompt, makeEcho, take, shapeVoid, glow'],
  // §0.39.298 AR2 — the Architect: the API owns its store and the agent; reuse candidates come from loom's registry
  // (read as a file) and the component store (_require — an edge the scanner cannot see)
  ['nexus.idearium.api', I('idearium/lib/architect.js'), 'idearium/api/index.js architect.* (await import) — makeArchitecture, editComponent, matchesFor, analyze, archText'],
  ['nexus.idearium.api', I('lib/component-store.js'), 'idearium/api/index.js _archReuseSources + the build path — find / put / markFailed (_require)'],
  // §0.39.289 CT1 — a cut reply is finished: chunk-dispatch reaches the continuation through createRequire (_req)
  [I('ollama/lib/ollama-client.js'), I('lib/reply-continuation.js'), 'ollama/lib/ollama-client.js callOllamaRaw — a reply stopped at num_predict (or in an open fence) is continued and stitched (require inside the function)'],
  [I('idearium/spec-engine/chunk-dispatch.js'), I('lib/reply-continuation.js'), 'idearium/spec-engine/chunk-dispatch.js _dispatchChunkOnce — looksCut/complete before the detector judges'],
  ['nexus.idearium.repo.nexus-self', I('idearium/repo/index.js'), 'idearium/repo/nexus-self.js syncSystem — rl.specUpdatedInPlace / replaceSpec / purgeSpecsOf on the injected repo layer'],
];
// the job requires only node built-ins, so the scanner gave it no import hook for the spawn wire to land on
const BOUNDARY_IMPORTS = [I('lib/history-import-job.js')];

function mapOneIdearium(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0927-271` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  const requiredBy = new Set();
  for (const [, , req] of FILES) for (const d of req) requiredBy.add(d);
  for (const [, id, req] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0927-271` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0927-271` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  // lib/extract-code.js is hand-mapped by copilot-capability-map.js (so the scanner skips it) and nothing there
  // requires it, so it never got an export hook — every real consumer's wire to it had no endpoint. Its export hook
  // is declared here, once, on the existing component.
  for (const dep of BOUNDARY_EXPORTS) {
    const r = driver.declare('hook', { id: `${dep}.export`, component_id: dep, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${dep}-export-v1-0000-2026-0927-271` });
    (r.ok ? results.hooks : results.failures).push({ id: `${dep}.export`, r });
  }
  for (const c of BOUNDARY_IMPORTS) {
    const r = driver.declare('hook', { id: `${c}.import`, component_id: c, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${c}-import-v1-0000-2026-0927-271` });
    (r.ok ? results.hooks : results.failures).push({ id: `${c}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `one-idearium.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-one-idearium-wire-${n}-v1-0000-2026-0927-271`, external: true });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      // a dependency outside this map is a scanned file: its .export hook is the scanner's
      const r = driver.declare('wire', { id: `one-idearium.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-one-idearium-wire-${n}-v1-0000-2026-0927-271`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapOneIdearium, FILES, BOUNDARY_EXPORTS, CONSUMERS, BOUNDARY_IMPORTS };
