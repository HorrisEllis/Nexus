'use strict';
/**
 * lib/activity-log/compartment.js — a compartment's activity log: one durable row per thing that happened in it. §0.39.368 AL1
 * The family: lib/activity-log/index.js (2026-08-04) logs each SYSTEM's events from the ledger fan-in into cortex's
 * event_log; this logs each COMPARTMENT's work (a repo: its agent's calls, its phase runs, its proposals, its faults).
 * Two granularities, one family — BrainOS (BO1) reads both.
 * UUID: nexus-lib-activity-log-v1-0000-2026-1007-jamesbrooks-001
 * Map: docs/2026-10-07-compartment-control-and-activity-phasemap.spec (AL1_activity_log)
 *
 * James: "I also want to have a full extensive activity log in each repo."
 *
 * The facts already existed, in five places (phase runs, the agent's exchanges, faults, proposals, charter checks) and
 * the Tasks panel only in memory. This is the one record they are all written to as they happen, at the points that
 * already exist — never a second copy assembled later:
 *   task.<kind>     an agent wearing the hat started / ended a call (lib/repo-activity.js)
 *   phase.<state>   a phase-run row (idearium's appendRow)
 *   inject.<event>  a proposal of an agent's file: proposed / applied / rejected / reverted / staged — the actor is the
 *                   agent, or the person who approved or undid it (lib/repo-inject.js)
 *   fault.<class>   a fault with a repo on it (lib/fault-log.js)
 *
 * row { uuid, compartment, kind, status, actor, hat, title, ref, detail, ms, ts }
 *   compartment  the repo's uuid (a Nexus system's repo included); later a COS compartment id (DT1)
 *   ref          what the row is about, to open it: a task id, a run id, an inject uuid, a fault uuid
 *   status       ok | failed | running | proposed | … — what a filter reads; 'failed' rows are the failures, first class
 * record() never throws and never blocks the action it records.
 */
const crypto = require('crypto');

const TABLE = 'activity_log';
const MAX_TITLE = 300;
const MAX_DETAIL = 1200;

function _jaa() { try { return require('../../cortex/memory/jaa-db.js').jaaDB; } catch (_) { return null; } }
let _onRecord = null;
/** onRecord(fn) — each row as it is written (idearium broadcasts it to an open Log view) */
function onRecord(fn) { _onRecord = typeof fn === 'function' ? fn : null; }

function _s(x, n) { return x == null ? null : String(x).slice(0, n); }

/** record({ compartment, kind, status, actor, hat, title, ref, detail, ms, ts }) -> row | null */
function record(r = {}) {
  if (!r.compartment || !r.kind) return null;
  const row = {
    uuid: crypto.randomUUID(),
    compartment: String(r.compartment),
    kind: _s(r.kind, 60),
    status: _s(r.status || 'ok', 30),
    actor: _s(r.actor, 120),
    hat: _s(r.hat, 80),
    title: _s(r.title, MAX_TITLE),
    ref: _s(r.ref, 160),
    detail: r.detail == null ? null : (typeof r.detail === 'string' ? _s(r.detail, MAX_DETAIL) : r.detail),
    ms: Number.isFinite(r.ms) ? Math.round(r.ms) : null,
    ts: Number.isFinite(r.ts) ? r.ts : Date.now(),
  };
  try { const jaa = _jaa(); if (jaa) jaa.insert(TABLE, row); } catch (e) { console.warn(`[activity-log] not persisted: ${e.message}`); }
  if (_onRecord) { try { _onRecord(row); } catch (_) {} }
  return row;
}

/**
 * list(compartment, { kind, actor, status, q, before, limit }) -> { rows, more } — newest first. compartment '*': every one. kind matches a prefix
 * ('inject' is every inject.*); before is a ts, for paging back; q is plain words in title/actor/kind.
 */
function list(compartment, { kind = null, actor = null, status = null, q = null, before = null, limit = 100 } = {}) {
  const jaa = _jaa();
  if (!jaa || !compartment) return { rows: [], more: false };
  const every = compartment === '*';   // §0.39.373 BO1 — every compartment at once (BrainOS's system-wide view)
  const words = q ? String(q).toLowerCase().split(/\s+/).filter(Boolean) : [];
  let rows = [];
  try {
    rows = jaa.query(TABLE, (x) => (every || x.compartment === compartment)
      && (!kind || x.kind === kind || String(x.kind || '').startsWith(`${kind}.`))
      && (!actor || x.actor === actor)
      && (!status || x.status === status)
      && (!before || (x.ts || 0) < before)
      && (!words.length || words.every(w => `${x.title || ''} ${x.actor || ''} ${x.kind || ''}`.toLowerCase().includes(w))), 100000) || [];
  } catch (_) { rows = []; }
  // newest first; rows of the same millisecond, the one written last first (the store's order is the write order)
  rows = rows.map((x, i) => [x, i]).sort((a, b) => ((b[0].ts || 0) - (a[0].ts || 0)) || (b[1] - a[1])).map(p => p[0]);
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  return { rows: rows.slice(0, lim), more: rows.length > lim };
}

/** facets(compartment) -> { kinds: {kind: n}, actors: {actor: n}, statuses: {status: n}, total } — what a filter offers */
function facets(compartment) {
  const jaa = _jaa();
  const out = { kinds: {}, actors: {}, statuses: {}, total: 0 };
  if (!jaa || !compartment) return out;
  let rows = []; try { rows = jaa.query(TABLE, x => x.compartment === compartment, 100000) || []; } catch (_) {}
  for (const x of rows) {
    out.total++;
    const k = String(x.kind || '').split('.')[0]; out.kinds[k] = (out.kinds[k] || 0) + 1;
    if (x.actor) out.actors[x.actor] = (out.actors[x.actor] || 0) + 1;
    out.statuses[x.status] = (out.statuses[x.status] || 0) + 1;
  }
  return out;
}

module.exports = { MODULE_ID: 'nexus.lib.activity-log', VERSION: '1.0.0', TABLE, record, list, facets, onRecord };
