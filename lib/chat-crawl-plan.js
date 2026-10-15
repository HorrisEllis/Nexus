'use strict';
/**
 * lib/chat-crawl-plan.js — which chat to read next, when to stop, and proof that none was missed (PI5, 0.60.55)
 * comp_id: nexus.lib.chat-crawl-plan
 * UUID: nexus-lib-chat-crawl-plan-v1-0000-2026-1015-jamesbrooks-001
 * Map: docs/2026-10-15-personal-chat-import-phasemap.spec (PI5_the_crawler)
 *
 * James, 2026-10-15: "log each chat, by url, one by one until it's done. then once thats done it logs one by one until it's caught up. only logging
 * novel data, but each one interconnected." · "i dont [want] anything missed. then it only logs the chaturl once unless it has new data, maybe check
 * the previous chat url once, but use it as an edge for a stopping point for catching up."
 *
 * Pure: no tab, no timer, no disk. The caller (clear-glass/src/chats/crawler.js) gives it the chat list it saw and the result of each visit; it
 * says what to do next. The state is a plain object the caller stores, so a restart continues from the same place. `now` and `rng` are arguments.
 *
 * TWO PHASES in one queue
 *   backfill   every chat the account holds is visited once. It is DONE only when the list was loaded to its end AND no chat is pending AND no
 *              chat has failed. A failed chat stays in the audit with its reason; nothing is dropped quietly (§1.2).
 *   caught-up  the list is looked at on a timer (cheap: no chat visited). A chat is visited only if it is new, or its `updated` differs from what was
 *              logged. The list is newest-first, so the first run of `anchorRun` unchanged logged chats is the STOPPING EDGE: nothing past it is looked at.
 *              The edge chat is re-checked once (verifyAnchor); if it has changed, the walk goes on past it. A periodic full sweep compares the whole list.
 * A chat already logged and unchanged is never visited twice. A visit that finds the same hash and turns is counted as "unchanged", not as new data.
 */
const S = require('./chat-crawl-settings.js');
const MODULE_ID = 'nexus.lib.chat-crawl-plan';
const HOUR = 3600e3, DAY = 24 * HOUR;

function create(accountKey) {
  return { accountKey, phase: 'backfill', status: 'running', pausedReason: null, pausedUntil: null, items: {}, order: [], queue: [], verify: null, extend: 0,
    listComplete: false, lastListAt: 0, lastSweepAt: 0, failuresInRow: 0, coolDowns: 0, stamps: [], nextAllowedAt: 0, anchor: null,
    counts: { logged: 0, unchanged: 0, failed: 0, skipped: 0 }, visiting: null };
}

const _hit = (text, list) => { const t = String(text || '').toLowerCase(); return list.some(x => x && t.includes(String(x).toLowerCase())); };
function _skipReason(e, cfg) {
  if (cfg.skipNexusChats && e.nexus) return 'started by Nexus';
  if (_hit(e.url, cfg.excludeUrls)) return 'url excluded in Settings';
  if (_hit(e.title, cfg.excludeTitles)) return 'title excluded in Settings';
  return null;
}
const _changed = (e, it) => !!(e.updated && it.updated && String(e.updated) !== String(it.updated));

/**
 * observeList(state, list, { complete, now }, cfg) → { queued, needMore, anchor }
 * list: [{ url, title?, updated?, nexus? }] newest first. complete: the list was scrolled to its end.
 */
function observeList(state, list, { complete = false, now = Date.now() } = {}, cfg = S.defaults()) {
  state.order = list.map(e => e.url); state.listComplete = !!complete; state.lastListAt = now;
  const queued = []; const add = (u) => { if (!state.queue.includes(u) && state.visiting !== u && u !== state.verify) { state.queue.push(u); queued.push(u); } };
  for (const e of list) {                       // record every chat seen, skipped ones too, with the reason
    const it = state.items[e.url] || (state.items[e.url] = { url: e.url, state: 'pending', attempts: 0, turns: 0, hash: null, updated: null, error: null });
    it.title = e.title || it.title || null;
    const why = _skipReason(e, cfg);
    if (why) { if (it.state !== 'skipped') state.counts.skipped++; it.state = 'skipped'; it.error = why; }
    else if (it.state === 'skipped') { it.state = 'pending'; it.error = null; }   // an exclusion removed in Settings
  }
  if (state.phase === 'backfill') {
    let todo = list.filter(e => ['pending'].includes(state.items[e.url].state));
    if (cfg.backfillOrder === 'oldest') todo = todo.slice().reverse();
    const doneN = Object.values(state.items).filter(i => i.state === 'logged').length;
    if (cfg.maxBackfillChats > 0) todo = todo.slice(0, Math.max(0, cfg.maxBackfillChats - doneN - state.queue.length));
    todo.forEach(e => add(e.url));
    _maybeFinishBackfill(state, cfg);
    return { queued: queued.length, needMore: !state.listComplete && state.phase === 'backfill', anchor: state.anchor };
  }
  // caught-up: walk newest first to the stopping edge
  const sweep = cfg.fullSweepDays > 0 && now - state.lastSweepAt >= cfg.fullSweepDays * DAY;
  const need = cfg.anchorRun + (state.extend || 0);
  let run = 0, anchor = null;
  for (const e of list) {
    const it = state.items[e.url];
    if (it.state === 'skipped') continue;
    if (it.state !== 'logged' || _changed(e, it)) { add(e.url); run = 0; continue; }
    run++;
    if (run >= need && !sweep) { anchor = e.url; break; }
  }
  if (sweep) state.lastSweepAt = now;
  if (anchor) { state.anchor = anchor; if (cfg.verifyAnchor && queued.length && !state.verify) state.verify = anchor; }
  state.extend = 0;
  return { queued: queued.length, needMore: false, anchor: state.anchor };
}

function _maybeFinishBackfill(state, cfg) {
  const items = Object.values(state.items);
  const open = items.filter(i => i.state === 'pending').length + state.queue.length + (state.visiting ? 1 : 0);
  const limitHit = cfg.maxBackfillChats > 0 && items.filter(i => i.state === 'logged').length >= cfg.maxBackfillChats;
  if (open === 0 && (state.listComplete || limitHit)) { state.phase = 'caught-up'; state.anchor = state.order[0] || null; state.lastSweepAt = state.lastSweepAt || Date.now(); }
}

function _quiet(cfg, now) {
  if (cfg.quietFrom < 0 || cfg.quietTo < 0) return 0;
  const d = new Date(now), h = d.getHours();
  const inQ = cfg.quietFrom <= cfg.quietTo ? (h >= cfg.quietFrom && h < cfg.quietTo) : (h >= cfg.quietFrom || h < cfg.quietTo);
  if (!inQ) return 0;
  const end = new Date(d); end.setMinutes(0, 0, 0); while (end.getHours() !== cfg.quietTo || end <= d) end.setHours(end.getHours() + 1);
  return end - d;
}

/** next(state, cfg, now, rng) → { action: 'visit', url, why } | { action: 'wait', ms, why } | { action: 'idle' } | { action: 'stopped', reason } */
function next(state, cfg = S.defaults(), now = Date.now(), rng = Math.random) {
  if (state.status === 'paused') {
    if (state.pausedUntil && now >= state.pausedUntil) { state.status = 'running'; state.pausedReason = null; state.pausedUntil = null; }
    else return state.pausedUntil ? { action: 'wait', ms: state.pausedUntil - now, why: `paused: ${state.pausedReason}` } : { action: 'stopped', reason: state.pausedReason };
  }
  state.stamps = state.stamps.filter(t => now - t < DAY);
  const q = _quiet(cfg, now); if (q) return { action: 'wait', ms: q, why: 'quiet hours' };
  const hour = state.stamps.filter(t => now - t < HOUR);
  if (hour.length >= cfg.perHour) return { action: 'wait', ms: Math.min(...hour) + HOUR - now, why: `hourly cap of ${cfg.perHour}` };
  if (state.stamps.length >= cfg.perDay) return { action: 'wait', ms: Math.min(...state.stamps) + DAY - now, why: `daily cap of ${cfg.perDay}` };
  if (now < state.nextAllowedAt) return { action: 'wait', ms: state.nextAllowedAt - now, why: 'pace' };
  let url = state.queue.shift(), why = state.phase === 'backfill' ? 'backfill' : 'new or changed';
  if (!url && state.verify) { url = state.verify; state.verify = null; why = 'verify the stopping chat'; state.verifying = url; }
  if (!url) return { action: 'idle' };
  state.visiting = url; state.stamps.push(now);
  state.nextAllowedAt = now + Math.round((cfg.paceMinSec + rng() * (cfg.paceMaxSec - cfg.paceMinSec)) * 1000);
  return { action: 'visit', url, why };
}

function _pause(state, reason, until = null) { state.status = 'paused'; state.pausedReason = reason; state.pausedUntil = until; }

/** report(state, url, result, cfg, now) — result: { kind: 'ok'|'login'|'challenge'|'ratelimit'|'error'|'empty', turns, hash, updated, error } */
function report(state, url, result = {}, cfg = S.defaults(), now = Date.now()) {
  const it = state.items[url] || (state.items[url] = { url, state: 'pending', attempts: 0, turns: 0, hash: null, updated: null, error: null });
  if (state.visiting === url) state.visiting = null;
  const wasVerify = state.verifying === url; if (wasVerify) state.verifying = null;
  const kind = result.kind || (result.ok === false ? 'error' : 'ok');
  if (kind === 'ok') {
    const same = it.state === 'logged' && it.hash === result.hash && it.turns === result.turns;
    if (same) state.counts.unchanged++; else { state.counts.logged++; if (wasVerify) state.extend = cfg.anchorRun; }
    Object.assign(it, { state: 'logged', turns: result.turns || 0, hash: result.hash || null, updated: result.updated || it.updated, error: null, loggedAt: now, visits: (it.visits || 0) + 1 });
    state.failuresInRow = 0;
    if (state.phase === 'backfill') _maybeFinishBackfill(state, cfg);
    return { ok: true, newData: !same, extend: !!state.extend };
  }
  if (kind === 'login') { _pause(state, 'the account is signed out'); it.state = 'pending'; state.queue.unshift(url); return { ok: false, paused: state.pausedReason }; }
  if (kind === 'challenge' && cfg.stopOnChallenge) { _pause(state, 'a captcha or challenge page appeared'); it.state = 'pending'; state.queue.unshift(url); return { ok: false, paused: state.pausedReason }; }
  if (kind === 'ratelimit') { const ms = cfg.coolDownMin * 60e3 * Math.pow(2, state.coolDowns++); _pause(state, 'the provider said slow down', now + ms); it.state = 'pending'; state.queue.unshift(url); return { ok: false, paused: state.pausedReason, ms }; }
  it.attempts++; it.error = String(result.error || kind).slice(0, 200); state.failuresInRow++;
  if (it.attempts >= cfg.maxAttempts) { it.state = 'failed'; state.counts.failed++; } else { it.state = 'pending'; state.queue.push(url); }
  if (state.failuresInRow >= cfg.maxFailures) _pause(state, `${state.failuresInRow} failures in a row (last: ${it.error})`);
  if (state.phase === 'backfill') _maybeFinishBackfill(state, cfg);
  return { ok: false, failed: it.state === 'failed', paused: state.status === 'paused' ? state.pausedReason : null };
}

function resume(state) { state.status = 'running'; state.pausedReason = null; state.pausedUntil = null; state.failuresInRow = 0; return state; }

/** retryFailed(state) — put every failed chat back to pending with its attempts reset (the person's decision) */
function retryFailed(state) { let n = 0; for (const it of Object.values(state.items)) if (it.state === 'failed') { it.state = 'pending'; it.attempts = 0; state.queue.push(it.url); n++; } state.counts.failed = 0; return n; }

/** audit(state) → the proof nothing was missed: every chat the list showed is logged, skipped with a reason, or listed as outstanding */
function audit(state) {
  const items = Object.values(state.items); const by = (s) => items.filter(i => i.state === s);
  const failed = by('failed').map(i => ({ url: i.url, error: i.error, attempts: i.attempts }));
  const pending = by('pending').map(i => i.url);
  return { listed: items.length, logged: by('logged').length, skipped: by('skipped').map(i => ({ url: i.url, why: i.error })), failed, pending,
    listComplete: state.listComplete, phase: state.phase, status: state.status, pausedReason: state.pausedReason, anchor: state.anchor,
    nothingMissed: state.listComplete && pending.length === 0 && failed.length === 0 && !state.queue.length && !state.visiting };
}

module.exports = { MODULE_ID, create, observeList, next, report, resume, retryFailed, audit };
