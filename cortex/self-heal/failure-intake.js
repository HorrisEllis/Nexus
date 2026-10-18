'use strict';
/**
 * cortex/self-heal/failure-intake.js — FMR2: every failure reaches the .failure_mode record, through its one writer.
 * comp_id: cortex.self-heal.failure-intake
 * Map: docs/2026-10-17-failure-mode-report-phasemap.spec (FMR2_every_failure_reaches_the_record)
 *
 * James, 2026-10-17: "failure mode report thats also a macro to import into a cos test env." · "do it. … we need to add this
 * all to nexus, there is boundaries mapping it" · and on 2026-09-12 (failure-mode-forensics.js): "each system needs
 * .failure_mode nodes … make a .failure_mode and .macro to replicate the bug."
 *
 * FOUND. failure_modes was written only by the self-heal ladder (index.js _enterFailureMode, a fault class reaching
 * FAILURE_MODE), so all 9 .failure_mode nodes on his machine were memory_pressure. A failed COS test, a phase that ended
 * contract-incomplete, a run that went STUCK never became one.
 *
 * ONE WRITER (§10.1). This file holds the only insert into failure_modes; the ladder writes through write() too. Other systems
 * reach it by route — cortex POST /api/failure-modes — never by require (the drawbridge: lib/nexus-client.js postDurable).
 *
 *   write(entry)                       → the row (the one insert; the ladder's path, unchanged in what it writes)
 *   record({ faultClass, where, source, system, summary, anchor, evidence, occurredAt })
 *                                      → { ok, uuid, created, occurrences }
 *       dedup by signature `<faultClass>::<where>` while the failure_mode is open: the same failure again is
 *       occurrences + 1 (and its newest evidence), never a second row — the count §17.7 and FMR0a read (second occurrence
 *       → investigation; recurrence → replay automatically, his call of 2026-10-17: "do it").
 *   list({ status, faultClass, limit }) · get(uuid)
 * A new row is enriched by failure-mode-forensics.js (the same path the ladder uses), with the posted anchor
 * ({ ledgerSystem, entryUuid }) so the chain and the compound class can be walked from it; best-effort, after the write.
 */
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'cortex.self-heal.failure-intake';
const VERSION = '1.0.0';
const TABLE = 'failure_modes';
const MAX_EVIDENCE = 4000;   // chars of evidence kept per row (the report reads the source for the rest)
const OPEN = (r) => !r.status || r.status === 'open';

function signatureOf(faultClass, where) { return `${String(faultClass || 'unknown')}::${String(where || 'unknown')}`; }

function _clip(v) {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > MAX_EVIDENCE ? { truncated: true, chars: s.length, head: s.slice(0, MAX_EVIDENCE) } : (typeof v === 'string' ? v : JSON.parse(s));
}

/** write(entry) — the one insert into failure_modes */
function write(entry) {
  const row = { uuid: entry.uuid || uid(), ...entry };
  jaaDB.insert(TABLE, row);
  return row;
}

/** record(failure) — dedup by signature, count occurrences, enrich a new one */
function record({ faultClass, where, source = null, system = null, summary = null, anchor = null, evidence = null, occurredAt = null } = {}, { enrich = true, forensics = null, context = null } = {}) {
  if (!faultClass || !where) return { ok: false, error: 'faultClass and where are required: what kind of failure, and where it happened (a test, a phase, a run)' };
  const signature = signatureOf(faultClass, where);
  const now = occurredAt || Date.now();
  const existing = (jaaDB.query(TABLE, r => r.signature === signature && OPEN(r), 1) || [])[0] || null;
  if (existing) {
    const occurrences = (existing.occurrences || 1) + 1;
    jaaDB.update(TABLE, { uuid: existing.uuid }, { occurrences, lastSeenAt: now, evidence: _clip(evidence) || existing.evidence || null, ...(anchor ? { anchor } : {}) });
    return { ok: true, uuid: existing.uuid, created: false, occurrences, signature };
  }
  const row = write({
    faultClass, gapUuid: null, friction: null, enteredAt: now, source: source || MODULE_ID,
    signature, where, system, summary: summary ? String(summary).slice(0, 400) : null, anchor: anchor || null,
    evidence: _clip(evidence), occurrences: 1, firstSeenAt: now, lastSeenAt: now, status: 'open', via: 'intake',
    // stamped by the route at the moment it arrived: the CFR field (truth), Nerve's windows (VIEW only — its own invariant:
    // never used to pick a cause), the environment. A report built later cannot recover any of these.
    ...(context && context.cfrAtEntry ? { cfrAtEntry: context.cfrAtEntry } : {}),
    ...(context && context.viewAtEntry ? { viewAtEntry: context.viewAtEntry } : {}),
    ...(context && context.env ? { env: context.env } : {}),
  });
  if (enrich) {
    // the forensics the ladder already uses; its context gatherer is handed the anchor this failure came with
    setImmediate(async () => {
      try {
        const F = forensics || require('./failure-mode-forensics.js');
        const gather = async () => ({ anchor: anchor || null, root: null, conditions: [], siblingDanglingHooks: [] });
        await F.enrichFailureMode(faultClass, null, row.uuid, gather);
      } catch (e) { console.warn(`[${MODULE_ID}] enrichment failed for ${row.uuid} (the row is written either way): ${e.message}`); }
    });
  }
  return { ok: true, uuid: row.uuid, created: true, occurrences: 1, signature };
}

function list({ status = null, faultClass = null, repoUuid = null, limit = 100 } = {}) {
  const rows = jaaDB.query(TABLE, r => (!status || (status === 'open' ? OPEN(r) : r.status === status)) && (!faultClass || r.faultClass === faultClass)
    && (!repoUuid || (r.evidence && r.evidence.repoUuid === repoUuid)), 100000) || [];
  return rows.sort((a, b) => (b.lastSeenAt || b.enteredAt || 0) - (a.lastSeenAt || a.enteredAt || 0)).slice(0, Math.max(1, Math.min(500, limit)));
}

function get(uuid) { return (jaaDB.query(TABLE, r => r.uuid === uuid, 1) || [])[0] || null; }

module.exports = { MODULE_ID, VERSION, TABLE, signatureOf, write, record, list, get };
