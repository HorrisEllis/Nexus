'use strict';
// ── lib/autonomous-loop.js ───────────────────────────────────────────────────
// UUID: nexus-autonomous-loop-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 13 — Autonomous Loop
// Deps:  Phase 45 (intent-classifier) ✓ · Phase 46 (case-library) ✓ ·
//        Phase 25 (compartment-engine) ✓ — all three confirmed real and
//        tested in isolation, but nothing in the codebase called them
//        together in sequence before this file. This was the last unmet
//        dependency named across three separate phase-map entries
//        (Phase 25, Phase 26, Phase 46 summaries all point here).
//
// §WHAT THIS FILE ACTUALLY DOES — closes exactly one gap: gives
// compartment-engine.spawn() its first real caller. Nothing else changes.
// crystal-lattice, adversary-suite, and case-library indexing are NOT
// invoked directly here — they're already auto-registered extension
// points inside compartment-engine itself (_autoRegisterExtensions, fires
// on first spawn()). This file's only job is: classify -> query -> spawn
// -> execute. Everything downstream of spawn() was already wired; it
// simply never ran because nothing called spawn() in production.
//
// §SOVEREIGN — this module knows nothing about guardian, ollama, or
// copilot. `executor(workingMemory, constraintFrame)` is injected by the
// caller, same dependency-injection pattern already established for
// agent-tools' `callModel` and lib/seam's injected jaa/busEmit. Any
// system that wants a real autonomous-loop pass uses this same module;
// only the executor differs per caller.
//
// §HONESTY — a negative-crystal block from case-library.query() stops
// the loop before spawn() ever runs. That is the intended behavior, not
// a failure: "don't repeat this" is case-library's whole reason to exist,
// and honoring it here is the first time that check has ever gated a real
// spawn() call rather than only being exercised in its own test file.

const MODULE_ID = 'autonomous-loop';
const VERSION   = '1.0.0';

let _intentClassifier, _caseLibrary, _compartmentEngine;
function _getIntentClassifier() { return _intentClassifier || (_intentClassifier = require('./intent-classifier')); }
function _getCaseLibrary()      { return _caseLibrary      || (_caseLibrary      = require('./case-library')); }
function _getCompartmentEngine(){ return _compartmentEngine|| (_compartmentEngine= require('./compartment-engine')); }

// ── run — the loop itself ────────────────────────────────────────────────────
// req: same shape intent-classifier.classify() already accepts —
//      { text, source?, provider?, autonomous?, runId?, causedBy?, ... }
// executor: async (workingMemory, constraintFrame) => result — required.
// projectSeed: optional, from lib/project-compartment.js — real, external
//      project data (an imported zip/repo's file tree + bounded contents).
//      §COMPOSED, NOT OVERWRITTEN — case-library.query()'s own
//      workingMemorySeed is scoped to past-compartment pattern memory
//      (checked directly against that file before adding this param);
//      when both exist, projectSeed is added as a distinct `project` key
//      alongside whatever case-library returned, never replacing it —
//      "have I done this before" and "here is the project to do it to"
//      are two different, real facts about the same compartment.
// Returns: { ran, stage, intent, lowConfidence?, caseResult, compartment? }
async function run({ req, executor, budget, boundary, injectedFrameworks, projectSeed } = {}) {
  if (typeof executor !== 'function') {
    throw new Error(`[${MODULE_ID}] run() requires an executor(workingMemory, constraintFrame) function`);
  }

  const intentClassifier  = _getIntentClassifier();
  const caseLibrary       = _getCaseLibrary();
  const compartmentEngine = _getCompartmentEngine();

  // 1. Classify — Phase 45, unchanged, already production-tested elsewhere.
  const { intent, lowConfidence } = intentClassifier.classify(req);

  // 2. Query case library BEFORE spawn — the real point of building this
  //    loop at all. A negative crystal blocks here; nothing after this
  //    line runs if case-library says don't.
  const caseResult = caseLibrary.query(intent);

  if (caseResult.blocked) {
    return { ran: false, stage: 'case-library-blocked', reason: caseResult.reason, intent, caseResult };
  }

  // 3. Freeze intent (irreversible past this point — matches spec: intent
  //    is mutable until execution start) and spawn the compartment.
  const frozenIntent = intentClassifier.freeze(intent);
  let compartment;
  try {
    const workingMemorySeed = projectSeed
      ? { ...(caseResult.workingMemorySeed || {}), project: projectSeed }
      : caseResult.workingMemorySeed;
    compartment = await compartmentEngine.spawn({
      intent: frozenIntent, budget, boundary, injectedFrameworks,
      workingMemorySeed,
    });
  } catch (e) {
    return { ran: false, stage: 'spawn-error', reason: e.message, intent: frozenIntent, caseResult };
  }

  // 4. Execute + resolve. compartment-engine's own auto-registered
  //    extensions (adversary suite, QA/QC, crystal-lattice, case-library
  //    indexing) all fire inside this call — not duplicated here.
  const resolved = await compartmentEngine.execute(compartment, executor);

  return { ran: true, stage: 'resolved', intent: frozenIntent, lowConfidence, caseResult, compartment: resolved };
}

function validateWiring() {
  const checks = {
    intentClassifier:  !!_getIntentClassifier()?.classify,
    caseLibrary:       !!_getCaseLibrary()?.query,
    compartmentEngine: !!_getCompartmentEngine()?.spawn,
  };
  const online = Object.values(checks).filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/${Object.keys(checks).length} systems reachable`);
  return checks;
}

module.exports = { run, validateWiring, MODULE_ID, VERSION };
