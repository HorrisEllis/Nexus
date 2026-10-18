'use strict';
/**
 * lib/gate-context.js — what a gate's next attempt is told about the attempts before it, from what Nexus kept (TL2a, 0.60.145)
 * comp_id: nexus.lib.gate-context
 * UUID: nexus-lib-gate-context-v1-0000-2026-1018-jamesbrooks-001
 * Map: docs/2026-10-16-durable-work-timeline-phasemap.spec addendum (f)
 *
 * James, 2026-10-18: "alright the gates need context. needs persistence, needs to survive restarts, reuse contracts, jobs and
 * responses."
 *
 * Nothing here is a store. Every line comes from a record that already survives a restart:
 *   the replies      lib/work-journal.js — every attempt at this gate (TL1b/c): agent, how it ended, its reply, its thinking
 *   the steps        lib/run-state.js — the brick's run (GW2): attempt, tool calls, files read and changed
 * (The contract's own feedback — what the gate's last check said — already goes with the next try as the carry box, TF1; it is
 * not repeated here.)
 *
 *   context(repoUuid, brick)       → async (the last reply's text may be in Clear Glass's chat ledger) { brick, attempts: [{ attempt, provider, status, textLen }], last: { tail, thinking },
 *                                      files: [changed], steps, runAttempt } — or null when the gate has no history
 *   note(ctx, { max })             → the block the next attempt's message carries (capped), '' when there is nothing before
 *   reuse({ repo, brick, message, repoDir, layer, waitMs }) → before an attempt asks again: the gate's newest guardian job that no
 *                                    attempt handled (lib/work-journal.js reusable) — finished, its reply adopted; still being
 *                                    written in its tab, waited for and then adopted — through repo-agent findLate + adoptLate,
 *                                    the same _finish a dispatch runs (idempotent per responseId). → { r, jobId, waitedMs } or
 *                                    { r: null, why } (nothing to reuse, said)
 *   handled(repoUuid, brick, { by, state }) → after an attempt ends: the gate's jobs so far are marked handled, never reused
 */
const MODULE_ID = 'nexus.lib.gate-context';
const VERSION = '1.0.0';
const NOTE_MAX = 2600;   // the block never crowds out the brief: a tail, not a transcript

function _WJ() { return require('./work-journal.js'); }
function _RS() { return require('./run-state.js'); }

async function context(repoUuid, brick) {
  if (!repoUuid || !brick) return null;
  let attempts = [];
  try { const g = (_WJ().gates(repoUuid, { brick }).gates || []).find(x => x.brick === brick); attempts = g ? g.attempts : []; } catch (_) { attempts = []; }
  let run = null;
  try { run = _RS().load(_RS().runIdFor({ repoUuid, brick })); } catch (_) { run = null; }
  if (!attempts.length && !run) return null;
  const lastA = attempts[attempts.length - 1];
  let last = null;
  if (lastA) { try { const j = await _WJ().read(repoUuid, lastA.jobId); if (j) last = { jobId: j.jobId, provider: j.provider, status: j.status, tail: String(j.text || '').slice(-1400), thinking: String(j.thinking || '').slice(-500) }; } catch (_) { last = null; } }
  return {
    brick,
    attempts: attempts.map(a => ({ attempt: a.attempt, jobId: a.jobId, provider: a.provider, status: a.status, textLen: a.textLen, handled: a.handled ? a.handled.state : null })),
    last,
    files: run ? (run.filesChanged || []).slice(-20) : [],
    read: run ? (run.filesRead || []).slice(-20) : [],
    steps: run ? (run.steps || []).slice(-8).map(s => `${s.name || s.tool || 'step'}${s.ok === false ? ' ✗' : ''}${s.path ? ` ${s.path}` : ''}`) : [],
    runAttempt: run ? run.attempt || null : null,
  };
}

function note(ctx, { max = NOTE_MAX } = {}) {
  if (!ctx || (!ctx.attempts.length && !ctx.files.length && !ctx.steps.length)) return '';
  const lines = [`THIS GATE BEFORE (kept by Nexus across agents and restarts — build on it, do not start over):`];
  if (ctx.attempts.length) lines.push(`- ${ctx.attempts.length} attempt(s): ${ctx.attempts.map(a => `${a.attempt}. ${a.provider || '?'} ${a.handled || a.status}`).join('; ')}`);
  if (ctx.files.length) lines.push(`- files already changed at this gate: ${ctx.files.join(', ')}`);
  if (ctx.steps.length) lines.push(`- its last steps: ${ctx.steps.join(' · ')}`);
  const head = lines.join('\n');
  let tail = '';
  if (ctx.last && ctx.last.tail) {
    const room = Math.max(0, max - head.length - 80);
    const t = ctx.last.tail.slice(-room);
    if (t) tail = `\n- the last reply (${ctx.last.provider || '?'}, ${ctx.last.status}) ended:\n${t}`;
  }
  return (head + tail).slice(0, max);
}

const WAIT_MS = 10 * 60 * 1000, POLL_MS = 3000;
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function reuse({ repo, brick, message, repoDir = null, layer = null, waitMs = WAIT_MS, pollMs = POLL_MS, judged = null } = {}) {
  if (!repo || !repo.uuid || !brick) return { r: null, why: 'no gate' };
  const WJ = _WJ();
  const u = WJ.reusable(repo.uuid, brick);
  if (!u) return { r: null, why: 'no reply at this gate that an attempt has not handled' };
  // the caller's run log is the second witness: an outcome row for this gate after the job started means an attempt judged it
  // (a reply journaled before 0.60.145 has no handled mark — this keeps it from being taken twice)
  if (typeof judged === 'function') {
    let j = null; try { j = WJ.get(repo.uuid, u.jobId); } catch (_) { j = null; }
    if (j && judged(j)) { handled(repo.uuid, brick, { before: j.startedAt || Date.now(), state: 'judged-before' }); return { r: null, why: `job ${u.jobId} was already judged at this gate (its run log says so)`, jobId: u.jobId }; }
  }
  const t0 = Date.now();
  if (u.inflight) {   // its tab is still writing it (Idearium restarted under it): wait for it rather than ask a second time
    for (;;) {
      const j = WJ.get(repo.uuid, u.jobId);
      if (!j || (j.status !== 'open' && j.status !== 'responding')) break;
      if (Date.now() - t0 >= waitMs) return { r: null, why: `job ${u.jobId} still writing after ${Math.round(waitMs / 1000)} s — asked again`, jobId: u.jobId };
      await _sleep(pollMs);
    }
  }
  const RAg = require('./repo-agent.js');
  let found = null;
  for (let i = 0; i < 3; i++) {   // guardian files the reply a moment after its last frame
    try { found = RAg.findLate({ repo, jobId: u.jobId }); } catch (e) { found = { ok: false, error: e.message }; }
    if (found && found.found) break;
    if (i < 2) await _sleep(Math.min(pollMs, 1500));
  }
  if (!found || !found.found) return { r: null, why: `job ${u.jobId}'s reply is not in the Responses index${found && found.error ? ` (${found.error})` : ''}`, jobId: u.jobId };
  let a;
  try { a = await RAg.adoptLate({ repo, repoDir, layer, responseId: found.responseId, message }); } catch (e) { a = { ok: false, error: e.message }; }
  if (!a || !a.ok || a.alreadyAdopted) return { r: null, why: a && a.alreadyAdopted ? `job ${u.jobId}'s reply was already taken` : `job ${u.jobId}'s reply could not be adopted: ${(a && a.error) || 'no answer'}`, jobId: u.jobId };
  return { r: { ...a, providerUsed: a.providerUsed || found.provider || null, reused: { jobId: u.jobId, responseId: found.responseId } }, jobId: u.jobId, provider: found.provider, waitedMs: Date.now() - t0 };
}

function handled(repoUuid, brick, { by = null, state = null, before = Date.now() } = {}) {
  try { return _WJ().mark(repoUuid, brick, { before, by, state }); } catch (_) { return []; }
}

module.exports = { MODULE_ID, VERSION, NOTE_MAX, context, note, reuse, handled };
