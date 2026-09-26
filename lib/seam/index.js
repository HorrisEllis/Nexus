'use strict';
/**
 * lib/seam/index.js — SEAM Delivery System
 * UUID: nexus-seam-v1-0000-2026-0702-jamesbrooks-001
 *
 * Sovereign quality-gate layer for AI provider delivery.
 * Transport-agnostic — accepts any deliverFn (ncpPush, ollamaDispatch, etc).
 *
 * State machine: QUEUED → INJECTING → GENERATING → DETECTING → VERIFIED
 *                                                      ↓ fail
 *                                                   RETRYING (context/shorter/forensic)
 *                                                      ↓ exhausted
 *                                                   ESCALATED → gap opened
 *
 * Usage (guardian/NCP):
 *   const { SEAMQueue } = require('../lib/seam');
 *   const q = new SEAMQueue({ provider:'claude', ncpPush: ncp.push, jaa, busEmit });
 *
 * Usage (ollama):
 *   const { SEAMQueue } = require('../lib/seam');
 *   const q = new SEAMQueue({ provider:'ollama', ncpPush: (_, data) => ollamaDispatch(data), jaa, busEmit });
 *
 * ── §ADDED 2026-07-05 — build-contract chunking, separate concern ──────────
 * The above (SEAMQueue/Detector/spec-parser) is the prose-spec →
 * ollama/chatgpt delivery pipeline guardian already uses. It is untouched.
 *
 * What's new below is for structured `modules:`/`schemas:` build
 * contracts (runtime.spec-style) rather than prose: buildSeamRegistry
 * turns an already-compiled KnowledgeGraph into seam records, and
 * createSeamStream wires those records through classify/axiom/cascade/
 * persist as an event stream — nothing here imports WARP, RAID, or
 * Cortex. Those are opt-in adapters (see lib/seam/adapters/), wired in
 * only if a caller wants them:
 *
 *   const { buildSeamRegistry, createSeamStream } = require('../lib/seam');
 *   const { createWarpDispatch } = require('../lib/seam/adapters/warp-cascade');
 *   const { createCortexPersist } = require('../lib/seam/adapters/cortex-persist');
 *
 *   const registry = buildSeamRegistry(compileResult);
 *   const stream = createSeamStream({
 *     dispatch: createWarpDispatch({ generate, crystallizer, population }), // optional
 *     persist:  createCortexPersist('idearium', { buildId }),               // optional
 *   });
 *   for (const record of registry) stream.emit(new Event('seam.record.ready', { record }));
 *
 * A caller that wants neither WARP nor Cortex passes its own dispatch/
 * persist functions, or omits them entirely and only registers
 * RegistryGate + ClassifyGate for a read-only classification feed.
 */
module.exports = {
  get SEAMQueue()    { return require('./queue.js').SEAMQueue; },
  get STATE()        { return require('./queue.js').STATE; },
  get Watchdog()     { return require('./watchdog.js').createSeamWatchdog; },
  get Detector()     { return require('./detector.js').Detector; },
  get parseSpec()    { return require('./spec-parser.js').parseSpec; },
  get parseSpecFile(){ return require('./spec-parser.js').parseSpecFile; },
  get extractPrerequisite() { return require('./spec-parser.js').extractPrerequisite; },
  get parseCosSeams(){ return require('./cos-seam-parser.js').parseCosSeams; },

  // ── build-contract chunking (agnostic — no WARP/RAID/Cortex import) ──────
  get Event()  { return require('./stream.js').Event; },
  get Gate()   { return require('./stream.js').Gate; },
  get Stream() { return require('./stream.js').Stream; },
  get buildSeamRecord()   { return require('./kg-seam-bridge.js').buildSeamRecord; },
  get buildSeamRegistry() { return require('./kg-seam-bridge.js').buildSeamRegistry; },
  get buildAxiomsForSeam(){ return require('./axioms.js').buildAxiomsForSeam; },
  get RegistryGate()  { return require('./gates.js').RegistryGate; },
  get ClassifyGate()  { return require('./gates.js').ClassifyGate; },
  get AxiomGate()     { return require('./gates.js').AxiomGate; },
  get CascadeGate()   { return require('./gates.js').CascadeGate; },
  get PersistGate()   { return require('./gates.js').PersistGate; },
  get registerPersistGates() { return require('./gates.js').registerPersistGates; },
  get createSeamStream() { return require('./build-contract.js').createSeamStream; },
};
