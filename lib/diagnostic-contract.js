'use strict';
// ── lib/diagnostic-contract.js — Diagnostic Contract Lifecycle ──────────────
// Phase 23.13 — "needs to use the contract system, tracked, tagged, and
// queued, diagnose first, then log in the ledger, and explicit in the
// autopilot console, same with raid. one step at a time for now."
//
// This is step one: diagnose_and_repair. RAID gets the same treatment next
// — not done here, deliberately, per "one step at a time."
//
// Before this, a diagnose_and_repair dispatch was a bare job: created,
// sent to Ollama, response landed in a job's text field and chat_log, done.
// No tracked status, no tags, nothing showing it was ever queued versus
// dispatched versus actually answered. This gives it a real lifecycle:
//
//   queued -> dispatched -> diagnosed -> closed | no_action_taken
//
// "closed" only happens if gap-predicate's verifyClosure() actually proves
// the underlying gap resolved (a real artifact, not this contract's own
// say-so). Otherwise it lands on "no_action_taken" — diagnosis happened,
// nothing was applied, named honestly instead of left ambiguous. See
// service/nexus-diagnostic.js's §23.10 comment for why "diagnose_and_repair"
// as a job command name has never meant the second half actually runs.

const { jaaDB, uid } = require('../cortex/memory/jaa-db');

const MODULE_ID = 'diagnostic-contract';
const VERSION   = '1.0.0';

function _ledger(action, status, contract, detail) {
  try {
    require('./component-ledger').write({
      system: 'diagnostic', component: 'lib.diagnostic-contract',
      action, status, tags: [contract.gapType, contract.system].filter(Boolean),
      detail, causedBy: contract.gapUuid, contractUuid: contract.uuid,
    });
  } catch (_) {}
}

/**
 * create() — queue a new diagnostic contract. Call this instead of
 * creating a bare job directly; the contract IS the tracked unit, the job
 * is just how the diagnosis gets dispatched.
 */
function create({ gapUuid, gapType, system, tags = [], detail = null }) {
  const contract = {
    uuid: uid(), gapUuid: gapUuid || null, gapType: gapType || 'unknown', system: system || null,
    tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
    status: 'queued', agent: null, jobId: null, diagnosis: null,
    detail,
    createdAt: Date.now(), updatedAt: Date.now(),
    dispatchedAt: null, diagnosedAt: null, closedAt: null,
  };
  try {
    jaaDB.insert('diagnostic_contracts', contract);
  } catch (e) {
    console.error(`[${MODULE_ID}] §1.2 failed to insert contract — not silently dropped, logged:`, e.message);
    return null;
  }
  _ledger('queued', 'queued', contract, detail);
  return contract;
}

/** dispatched() — diagnosis is actually being sent to an agent. */
function dispatched(contractUuid, { agent, jobId } = {}) {
  const now = Date.now();
  try {
    jaaDB.update('diagnostic_contracts', contractUuid, { status: 'dispatched', agent, jobId, dispatchedAt: now, updatedAt: now });
  } catch (e) { console.error(`[${MODULE_ID}] §1.2 dispatched() update failed:`, e.message); return; }
  const contract = jaaDB.query('diagnostic_contracts', c => c.uuid === contractUuid, 1)[0];
  if (contract) _ledger('dispatched', 'dispatched', contract, `${agent} · job ${jobId?.slice(0,8)}`);
}

/** diagnosed() — the agent answered. Does not mean anything got fixed. */
function diagnosed(contractUuid, { diagnosis } = {}) {
  const now = Date.now();
  try {
    jaaDB.update('diagnostic_contracts', contractUuid, { status: 'diagnosed', diagnosis: (diagnosis || '').slice(0, 2000), diagnosedAt: now, updatedAt: now });
  } catch (e) { console.error(`[${MODULE_ID}] §1.2 diagnosed() update failed:`, e.message); return; }
  const contract = jaaDB.query('diagnostic_contracts', c => c.uuid === contractUuid, 1)[0];
  if (contract) _ledger('diagnosed', 'diagnosed', contract, (diagnosis || '').slice(0, 200));
}

/**
 * close() — terminal state. `resolved: true` only when something outside
 * this module (gap-predicate's verifyClosure) actually proved the gap
 * closed via a real artifact. Otherwise this honestly lands on
 * no_action_taken — diagnosis happened, nothing was applied.
 */
function close(contractUuid, { resolved = false, reason = null } = {}) {
  const now = Date.now();
  const status = resolved ? 'closed' : 'no_action_taken';
  try {
    jaaDB.update('diagnostic_contracts', contractUuid, { status, closedAt: now, updatedAt: now, closeReason: reason });
  } catch (e) { console.error(`[${MODULE_ID}] §1.2 close() update failed:`, e.message); return; }
  const contract = jaaDB.query('diagnostic_contracts', c => c.uuid === contractUuid, 1)[0];
  if (contract) _ledger('closed', status, contract, reason);
}

/** Summary for autopilot's console / status endpoint — counts by status,
 *  plus the most recent few, so "explicit in the autopilot console" means
 *  an actual number autopilot can print, not a promise to go check JAA. */
function summary(limit = 5) {
  try {
    const all = jaaDB.query('diagnostic_contracts', () => true, 500);
    const byStatus = {};
    for (const c of all) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const recent = all.slice(-limit).reverse().map(c => ({
      uuid: c.uuid.slice(0, 8), gapType: c.gapType, status: c.status, system: c.system,
    }));
    return { total: all.length, byStatus, recent };
  } catch (_) {
    return { total: 0, byStatus: {}, recent: [] };
  }
}

module.exports = { create, dispatched, diagnosed, close, summary, MODULE_ID, VERSION };
