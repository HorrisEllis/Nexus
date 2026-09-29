/**
 * idearium/repo/pipeline-events.js — the events the import pipeline really emits (MCO4, §20).
 * UUID: nexus-idearium-repo-pipeline-events-v1-0000-2026-0920-jamesbrooks-001
 * Spec: idearium/spec/idearium.repository-nodes.spec.
 *
 * ONE catalog, three readers. runImportPipeline emits these; repository-nodes.js
 * derives the repository hook and wire nodes from the same list; the tests run a
 * real pipeline and check that what was emitted is exactly what is declared here.
 * A hook that names an event nothing emits, or an emission nobody declared, is a
 * failing test, not a documentation drift.
 *
 * Names follow nexus-repository-system.spec §20: {layer}:{noun}:{verb}, three
 * colon-separated kebab parts, the form cos/foundation/hook-schema.js isEventType()
 * enforces. Dot notation is not used.
 *
 * §FLOOD CONTROL. `parse:file:*` fires once per file. That is fine to an
 * in-process listener but not to idearium's event bus, whose every event is
 * written to the ledger and the 5000-row event log. So the bus receives each
 * stage event, a capped number of failures, and never the per-file successes
 * (makeBusForwarder). The catalog's `bus` field says which.
 */

export const MAX_BUS_FAILURES = 20;

// stage = which hook group owns it; scope = per file or per run; bus = whether the bus gets it
export const PIPELINE_EVENTS = Object.freeze([
  { type: 'repository:import:start',    stage: 'import', scope: 'run',  bus: true },
  { type: 'repository:import:ready',    stage: 'import', scope: 'run',  bus: true },
  { type: 'repository:import:failed',   stage: 'import', scope: 'run',  bus: true },
  { type: 'parse:file:complete',        stage: 'parse',  scope: 'file', bus: false },
  { type: 'parse:file:failed',          stage: 'parse',  scope: 'file', bus: 'capped' },
  { type: 'parse:batch:complete',       stage: 'parse',  scope: 'run',  bus: true },
  { type: 'atlas:build:start',          stage: 'atlas',  scope: 'run',  bus: true },
  { type: 'atlas:build:complete',       stage: 'atlas',  scope: 'run',  bus: true },
  { type: 'chunk:decompose:start',      stage: 'chunk',  scope: 'run',  bus: true },
  { type: 'chunk:decompose:complete',   stage: 'chunk',  scope: 'run',  bus: true },
  { type: 'chunk:glyphs:complete',      stage: 'chunk',  scope: 'run',  bus: true },   // 0.39.261 — each chunk's glyph (lib/chunk-glyph.js) written to indexes/glyphs.json
  { type: 'chunk:verify:complete',      stage: 'verify', scope: 'run',  bus: true },
  { type: 'chunk:verify:failed',        stage: 'verify', scope: 'run',  bus: true },
  { type: 'index:build:complete',       stage: 'index',  scope: 'run',  bus: true },
  { type: 'graph:build:complete',       stage: 'graph',  scope: 'run',  bus: true },
  { type: 'spec:graph:complete',        stage: 'spec',   scope: 'run',  bus: true }, // 0.39.246 — specification graph
  { type: 'spec:graph:failed',          stage: 'spec',   scope: 'run',  bus: true },
  { type: 'intel:build:complete',       stage: 'intel',  scope: 'run',  bus: true }, // 0.39.273 — chunk cards + search index (lib/code-intel)
  { type: 'intel:build:failed',         stage: 'intel',  scope: 'run',  bus: true },
]);

const BY_TYPE = new Map(PIPELINE_EVENTS.map(e => [e.type, e]));
export const isCatalogued = (type) => BY_TYPE.has(type);

/**
 * makeEmitter(repository, onEvent) -> emit(type, payload)
 * Refuses a type that is not in the catalog (a typo would otherwise be an event
 * nothing is declared to receive). A listener that throws never breaks the run.
 */
export function makeEmitter(repository, onEvent) {
  let warned = false;
  return function emit(type, payload = {}) {
    if (!BY_TYPE.has(type)) throw new Error(`pipeline-events: '${type}' is not in PIPELINE_EVENTS — declare it there first`);
    if (typeof onEvent !== 'function') return;
    try { onEvent({ type, repository, at: Date.now(), payload }); }
    catch (e) { if (!warned) { warned = true; console.warn(`[pipeline-events] a listener threw on ${type} and will keep being called: ${e.message}`); } }
  };
}

/**
 * makeBusForwarder(busEmit) -> onEvent for ONE pipeline run.
 * Forwards every `bus:true` event, the first MAX_BUS_FAILURES `parse:file:failed`
 * (and, once, a `suppressed` count if there were more), and none of the per-file
 * successes.
 */
export function makeBusForwarder(busEmit, { maxFailures = MAX_BUS_FAILURES } = {}) {
  let failures = 0; let suppressed = 0; let repository = null;
  const forward = (e) => {
    repository = e.repository;
    const meta = BY_TYPE.get(e.type);
    if (!meta || meta.bus === false) return;
    if (meta.bus === 'capped') { if (++failures > maxFailures) { suppressed++; return; } }
    if (e.type === 'parse:batch:complete' && suppressed) e = { ...e, payload: { ...e.payload, failuresNotForwarded: suppressed } };
    busEmit(e.type, { repoUuid: e.repository, ...e.payload });
  };
  return forward;
}
