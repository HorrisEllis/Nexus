'use strict';
/**
 * loom/maps/component-intake-map.js — 0.60.5: a project decomposed into the component store (lib/project-decompose.js)
 * and the 0.60.0 build path's new libraries, mapped into LOOM with every REAL edge as a wire (require() edges, read
 * from the source on 0.60.5). Mirrors loom/maps/build-context-map.js.
 * comp_id: nexus.loom.maps.component-intake
 * UUID: nexus-loom-map-component-intake-v1-0000-2026-1013-001
 *
 * James, 2026-10-13: "i want to be able to copy projects and decompose them into components for the component store
 * with the dependancies zipped together in a organized structured way." · docs/CLAUDE.md rule 3: "Every new component
 * MUST be mapped into loom with its real require()/consumer edges as wires". Phase MX2 of
 * docs/2026-10-12-browser-providers-and-work-phasemap.spec names the 0.60.x components that owed this.
 *
 * lib/project-decompose.js is hand-mapped here (the scanner skips it, loom/bootstrap.js) with its three requires. Its
 * consumer, and the consumer of lib/phase-plan.js, lib/plan-learning.js and lib/repo-run-state.js, is idearium/api —
 * HAND-MAPPED, so the scanner never sees those requires; they are declared here. The three libraries themselves are
 * scanned (they require nothing hand-mapped), and their .export hooks are declared here because only a hand-mapped
 * file requires them.
 */
const { idFor } = require('../scanners/source-map');

const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['lib/project-decompose.js', I('lib/project-decompose.js'), [
    I('lib/component-store.js'),   // decompose → put / manifest; bundle → get / closure / storeDir
    I('lib/zip-ingest.js'),        // fromZip → extractZipToFiles (the importer's own bounds)
    I('lib/zip-writer.js'),        // bundle → createZip
  ]],
];

// [consumer id, dependency id, where] — real requires in hand-mapped files
const CONSUMERS = [
  ['nexus.idearium.api', I('lib/project-decompose.js'), 'idearium/api/index.js components.decompose / components.bundle'],
  ['nexus.idearium.api', I('lib/phase-plan.js'),        'idearium/api/index.js _phaseBuild → targetSystem, planPrompt, parsePlan, chunkBrief (0.60.0 PC1)'],
  ['nexus.idearium.api', I('lib/plan-learning.js'),     'idearium/api/index.js _phaseBuild → lessons, orderCoders (0.60.0)'],
  ['nexus.idearium.api', I('lib/repo-run-state.js'),    'idearium/api/index.js repo.run.control, the phase attempt\'s pause wait, speceng.build REPO_PAUSED (0.60.0)'],
  ['nexus.idearium.api', I('lib/repo-notes.js'),        'idearium/api/index.js repo.notes / notes.* (0.60.6)'],
  ['nexus.idearium.api', I('lib/repo-history.js'),      'idearium/api/index.js repo.versions.* / repo.history.import (0.60.7)'],
  ['nexus.idearium.api', I('lib/import-checks.js'),     'idearium/api/index.js repo.integrity / repo.integrity.notes, and every project import\'s finalize (0.60.7)'],
];

// scanned files whose only consumers are hand-mapped: their export hook is declared here so the wires above land
const SCANNED_EXPORTS = [I('lib/phase-plan.js'), I('lib/plan-learning.js'), I('lib/zip-writer.js'), I('lib/repo-notes.js'), I('lib/repo-history.js'), I('lib/import-checks.js')];   // repo-run-state and zip-ingest already have theirs (another map declares them)

function mapComponentIntake(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-1013-001` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  const exportsNeeded = new Set([...CONSUMERS.map(c => c[1]).filter(d => own.has(d)), ...SCANNED_EXPORTS]);
  for (const id of exportsNeeded) {
    const r = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-1013-001` });
    (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
  }
  for (const [, id, req] of FILES) {
    if (!req.length) continue;
    const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-1013-001` });
    (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
  }
  let n = 0;
  const wire = (dep, to) => {
    n++;
    const r = driver.declare('wire', { id: `component-intake.wire.${n}.${dep}--${to}`, from_hook_id: `${dep}.export`, to_hook_id: `${to}.import`, uuid: `nexus-loom-map-component-intake-wire-${n}-v1-0000-2026-1013-001`, external: !own.has(dep) });
    (r.ok ? results.wires : results.failures).push({ from: dep, to, r });
  };
  for (const [consumer, dep] of CONSUMERS) wire(dep, consumer);
  for (const [, id, req] of FILES) for (const dep of req) wire(dep, id);
  return results;
}

module.exports = { mapComponentIntake, FILES, CONSUMERS, SCANNED_EXPORTS };
