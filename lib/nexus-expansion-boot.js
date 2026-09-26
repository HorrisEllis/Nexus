'use strict';
// ── lib/nexus-expansion-boot.js ───────────────────────────────────────────────
// UUID: nexus-expansion-boot-v1-0000-4000-0000-000000000006
// Version: 1.0.0
// Phase: 14.9 — Expansion Module Boot Integration
//
// THE WIRING GUIDE.
//
// This module bootstraps all Phase 14.x expansion modules in the correct order
// and provides the integration shims for existing subsystems.
//
// ── MODULES WIRED HERE ───────────────────────────────────────────────────────
//   lib/sigma-writer.js              — sigma_records producer (fixes autonomous-loop safety)
//   lib/gap-ledger.js                — gap table crash durability (fixes autonomous-loop replay)
//   lib/diag-engines/index.js        — 12-engine diagnostic health pack (fixes diagnostic service)
//   lib/contract-registry-writer.js  — constitutional write-back loop (closes the self-modification arc)
//   lib/open-loop-taxonomy.patch.js  — status 'open' → 'pending' fix (activates gap-loop for all types)
//
// ── BOOT ORDER ───────────────────────────────────────────────────────────────
// Phase 0: Apply taxonomy patch (no dependencies — patches the module in-memory)
// Phase 1: Init gap-ledger (filesystem only — no JAA dependency at init)
// Phase 2: Init sigma-writer (depends on bus, CFR, event-ledger — all must be up)
// Phase 3: Init contract-registry-writer (depends on JAA, bus, contracts file)
// Phase 4: Register diag-engines with diagnostic service (provide the composite runner)
//
// ── WHERE TO CALL THIS ───────────────────────────────────────────────────────
// In cortex/boot.js, after Phase 1 HARD (JAA-DB open + FileStore init) and
// after the bus and event-ledger are initialized. Before gap-loop starts.
//
// Suggested placement in cortex/boot.js:
//   // After: await phases.run('1', 'HARD', 'jaa-db', () => openJAA())
//   // Before: _gapLoop.start()
//   const expansion = require('../lib/nexus-expansion-boot');
//   await expansion.boot({ jaaDB, bus, eventLedger });
//
// ── GAP-LOOP REPLAY INTEGRATION ──────────────────────────────────────────────
// Add this to gap-loop.js init(), before _interval = setInterval(_tick, POLL_MS):
//
//   const gapLedger = require('../lib/gap-ledger');
//   const survived  = gapLedger.replayGaps();
//   if (survived.length) {
//     console.log(`[gap-loop] Replaying ${survived.length} gaps from crash ledger`);
//     for (const gap of survived) {
//       const existing = jaaDB.query('gaps', r => r.uuid === gap.uuid, 1)[0];
//       if (!existing) jaaDB.insert('gaps', gap);
//     }
//   }
//   // Then wrap jaaDB for future gap operations:
//   const durableJAA = gapLedger.wrapJAAGaps(jaaDB);
//   // Use durableJAA everywhere jaaDB was used for gaps
//
// ── DIAGNOSTIC SERVICE INTEGRATION ───────────────────────────────────────────
// In diagnostic service (wherever _getDiagEngines() is called), replace:
//
//   function _getDiagEngines() { return null; } // <-- the absent module
//
// With:
//
//   const diagEngines = require('../lib/diag-engines');
//   function _getDiagEngines() { return diagEngines; }
//
// The diagnostic service already null-checks every call and returns 503 on null.
// Providing the real module makes all 12 engines operational immediately.
//
// ── CONTRACT REGISTRY WRITER INTEGRATION ─────────────────────────────────────
// The contract-registry-writer polls on its own once init() is called.
// No additional wiring needed beyond booting it. The gap-loop CONSTITUTIONAL
// handler already sets status:'resolved' when humans act — this module picks
// that up on the next poll cycle.
//
// For the Orchestrator CLI, add these routes:
//   GET  /api/contracts/proposals → contractRegistryWriter.getProposals()
//   GET  /api/contracts/applied   → contractRegistryWriter.getApplied()
//   POST /api/contracts/apply     → contractRegistryWriter.applyProposal(body)

const MODULE_ID = 'nexus-expansion-boot';
const VERSION   = '1.0.0';

// ── Lazy module refs ─────────────────────────────────────────────────────────
let _sigmaWriter, _gapLedger, _diagEngines, _contractWriter;

function _loadModules() {
  try { _sigmaWriter    = require('../orchestrator/lib/sigma-writer'); }            catch (e) { console.warn(`[${MODULE_ID}] sigma-writer not found: ${e.message}`); }
  try { _gapLedger      = require('../intelligence/gap/ledger'); }              catch (e) { console.warn(`[${MODULE_ID}] gap-ledger not found: ${e.message}`); }
  try { _diagEngines    = require('./diag-engines'); }            catch (e) { console.warn(`[${MODULE_ID}] diag-engines not found: ${e.message}`); }
  try { _contractWriter = require('./contract-registry-writer'); } catch (e) { console.warn(`[${MODULE_ID}] contract-registry-writer not found: ${e.message}`); }

  // Taxonomy status bug fixed via direct 1-line edit in lib/open-loop-taxonomy.js
  // (createLoop() now defaults to status:'pending'). The monkey-patch module
  // (lib/open-loop-taxonomy.patch.js) is intentionally NOT required here —
  // §5.3 no monkey-patches when the surgical direct edit is already applied.
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot(ctx = {}) {
  console.log(`\n[${MODULE_ID}] v${VERSION} — Phase 14.x expansion boot`);
  _loadModules();

  const results = {};

  // Phase 0: Taxonomy patch (now a direct source edit, not a runtime patch — always true once this module loads)
  results.taxonomyPatch = true;

  // Phase 1: Gap ledger (crash durability)
  if (_gapLedger) {
    const s = _gapLedger.validateWiring();
    results.gapLedger = s;
    console.log(`[${MODULE_ID}] ✓ gap-ledger ready`);
  } else {
    results.gapLedger = null;
    console.warn(`[${MODULE_ID}] ✗ gap-ledger not available`);
  }

  // Phase 2: Sigma writer (depends on bus — defer if bus not ready)
  if (_sigmaWriter) {
    _sigmaWriter.init(ctx.sigmaWriterCfg || {});
    const w = _sigmaWriter.validateWiring();
    results.sigmaWriter = w;
    console.log(`[${MODULE_ID}] ✓ sigma-writer started`);
  } else {
    results.sigmaWriter = null;
    console.warn(`[${MODULE_ID}] ✗ sigma-writer not available`);
  }

  // Phase 3: Contract registry writer
  if (_contractWriter) {
    _contractWriter.init(ctx.contractWriterCfg || {});
    const w = _contractWriter.validateWiring();
    results.contractWriter = w;
    console.log(`[${MODULE_ID}] ✓ contract-registry-writer started`);
  } else {
    results.contractWriter = null;
    console.warn(`[${MODULE_ID}] ✗ contract-registry-writer not available`);
  }

  // Phase 4: Diag engines (stateless — just confirm available)
  if (_diagEngines) {
    results.diagEngines = { available: true, engineCount: 12 };
    console.log(`[${MODULE_ID}] ✓ diag-engines available (12 engines)`);
  } else {
    results.diagEngines = null;
    console.warn(`[${MODULE_ID}] ✗ diag-engines not available`);
  }

  const online = Object.values(results).filter(Boolean).length;
  const total  = Object.keys(results).length;
  console.log(`[${MODULE_ID}] Boot complete: ${online}/${total} expansion modules ready\n`);

  return results;
}

function stop() {
  _sigmaWriter?.stop();
  _contractWriter?.stop();
}

// ── Diagnostic snapshot builder ───────────────────────────────────────────────
// Builds the snapshot object that diag-engines expects from live JAA state.
// Call this from the diagnostic service's audit cycle.
function buildDiagSnapshot(jaaDB, bus) {
  if (!jaaDB) return {};
  function safeQuery(table, filter, limit) {
    try { return jaaDB.query(table, filter || (() => true), limit || 500); } catch (_) { return []; }
  }

  return {
    ledgerRows:        safeQuery('event_log'),
    gaps:              safeQuery('gaps'),
    failures:          safeQuery('failures'),
    sigmaRecords:      safeQuery('sigma_records', r => r.type === 'COMPOSITE', 100),
    failureModes:      safeQuery('failure_modes'),
    decisions:         safeQuery('decision_log'),
    registeredSystems: safeQuery('sessions').map(s => s.system || s.source).filter(Boolean),
    busMetrics: {
      historyRingSize: bus?._history?.length || 1000,
      subscriberCount: bus?.listenerCount?.('*') || 0,
    },
  };
}

function getDiagEngines() {
  return _diagEngines || null;
}

function getGapLedger() {
  return _gapLedger || null;
}

function getSigmaWriter() {
  return _sigmaWriter || null;
}

function getContractWriter() {
  return _contractWriter || null;
}

module.exports = {
  boot, stop,
  buildDiagSnapshot,
  getDiagEngines,
  getGapLedger,
  getSigmaWriter,
  getContractWriter,
  MODULE_ID, VERSION,
};
