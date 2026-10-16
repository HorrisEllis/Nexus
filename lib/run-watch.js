'use strict';
/**
 * lib/run-watch.js — 0.60.21 — no run is left in limbo.
 *
 * James (2026-10-13): "needs to retry when you reject it. what if you have copilot monitor repos every now and again if
 * they stall? or have an agent check in? the diagnostic system when it expierences a stall or gate not fire?"
 *
 * Seen on his machine: BL30's review ended `incomplete` and the run still read "running" twelve minutes later; nothing
 * noticed, nothing retried after he rejected the file. Pure functions over idearium_phase_runs rows (the record every
 * run already writes); the API decides what to do with them (close it as stalled, report a gap diagnostic sees, retry).
 *
 *   runsOf(rows)                          → Map(runId → { runId, rows (oldest first), last })
 *   isFinal(run)                          → did this run end (a terminal state for its kind of run)
 *   stalled(rows, { now, stallMs })       → [{ runId, repoUuid, targetRepo, map, phase, state, idleMs }]
 *   runForInject(rows, inject)            → the newest build run that brought back this file (its map and phase)
 *   retriesFor(rows, { phase, kind, sinceMs, now }) → how many automatic retries this phase already had
 */
const VERSION = '1.0.0';

// a build run ends here; a review or a proof run also ends on what closes its own step
// §0.60.78 — 'auto-retry' and 'auto-retry-held' are NOTES the retry logic writes into the same table (runId auto-<ts>), not runs.
// They were not in this set, so ten minutes after each one the watcher read it as a build that "stalled after auto-retry-held",
// closed it, and fired a stall retry — which the daily cap held, writing another auto-retry-held row: a loop every 10 minutes
// (James's Tasks list: three 'stalled — no new step for 10 min after "auto-retry-held"' rows in a row). A note is final the moment it is written.
const NOTES = new Set(['auto-retry', 'auto-retry-held']);
const FINAL = new Set(['proven', 'unproven', 'no-proof', 'failed', 'refused', 'stalled', 'cancelled', 'contract-complete', 'contract-incomplete', ...NOTES]);
const FINAL_SIDE = new Set(['reviewed', 'incomplete', 'blocked', 'skipped']);   // a -review / -proof run's own ends
const WAITING = new Set(['paused']);                                           // a person paused it: never a stall

function runsOf(rows = []) {
  const by = new Map();
  for (const r of rows) {
    if (!r || !r.runId) continue;
    const g = by.get(r.runId) || { runId: r.runId, rows: [] };
    g.rows.push(r);
    by.set(r.runId, g);
  }
  for (const g of by.values()) { g.rows.sort((a, b) => (a.ts || 0) - (b.ts || 0)); g.last = g.rows[g.rows.length - 1]; }
  return by;
}

function isFinal(run) {
  const last = run && run.last;
  if (!last) return true;
  if (last.chunkStopped) return true;
  if (FINAL.has(last.state)) return true;
  if (/-(review|proof)$/.test(run.runId) && FINAL_SIDE.has(last.state)) return true;
  return false;
}

function stalled(rows, { now = Date.now(), stallMs = 10 * 60 * 1000 } = {}) {
  const out = [];
  for (const run of runsOf(rows).values()) {
    if (isFinal(run) || WAITING.has(run.last.state)) continue;
    const idle = now - (run.last.ts || 0);
    if (idle < stallMs) continue;
    const l = run.last;
    out.push({ runId: run.runId, repoUuid: l.repoUuid || null, targetRepo: l.targetRepo || l.repoUuid || null, map: l.map || null, phase: l.phase || null, state: l.state, idleMs: idle,
      kind: /-review$/.test(run.runId) ? 'review' : /-proof$/.test(run.runId) ? 'proof' : 'build' });
  }
  return out;
}

/** the newest build run whose rows say they brought back this file (row.injects.injected or row.file) */
function runForInject(rows, inject) {
  if (!inject || !inject.path) return null;
  const hits = (rows || []).filter(r => r && r.phase && r.map && (r.targetRepo === inject.repoUuid || r.repoUuid === inject.repoUuid)
    && ((r.injects && Array.isArray(r.injects.injected) && r.injects.injected.includes(inject.path)) || r.file === inject.path))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const h = hits[0];
  if (!h) return null;
  return { runId: String(h.runId || '').replace(/-(review|proof)$/, ''), repoUuid: h.repoUuid, targetRepo: h.targetRepo || h.repoUuid, map: h.map, phase: h.phase };
}

function retriesFor(rows, { phase, kind, sinceMs = 24 * 3600 * 1000, now = Date.now() } = {}) {
  return (rows || []).filter(r => r && r.state === 'auto-retry' && r.phase === phase && (!kind || r.retryKind === kind) && (r.ts || 0) >= now - sinceMs).length;
}

/**
 * limitFor(kind, cfg) -> automatic retries a phase may have in a day, by what started the retry.
 * A REJECTION is a person's deliberate act and the agent is expected to change what it did: it has its own, higher cap
 * (repos.reject_retries, default 3) and is not held back by earlier stall retries. A STALL retry is the machine retrying
 * itself, so it keeps the tight cap (repos.auto_retries, default 2) — that is what stops a loop.
 */
function limitFor(kind, cfg = () => undefined) {
  const n = (k, d) => { const v = Number(cfg(k)); return Number.isFinite(v) ? v : d; };
  return kind === 'reject' ? n('repos.reject_retries', 3) : n('repos.auto_retries', 2);
}

module.exports = { VERSION, FINAL, NOTES, runsOf, isFinal, stalled, runForInject, retriesFor, limitFor };
