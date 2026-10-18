'use strict';
/**
 * lib/work-journal.js — an agent's reply kept on disk as it streams, never only when it ends (TL1b, 0.60.143)
 * comp_id: nexus.lib.work-journal
 * UUID: nexus-lib-work-journal-v1-0000-2026-1018-jamesbrooks-001
 * Map: docs/2026-10-16-durable-work-timeline-phasemap.spec (TL1_chunks_land_as_they_arrive, addendum d: TL1b)
 *
 * James, 2026-10-18, after 0.60.142 streamed the agent's thinking and reply into the Code tab: "We need persistent data look at
 * the last commit." · 2026-10-16: "it need has to be physcial files in the backedn for persistence" · "all data  is meant to
 * persist."
 *
 * Found (read in code, 2026-10-18): every frame of a repo agent's reply (guardian.job.* through lib/guardian-stream.cjs, and
 * Ollama's through POST /api/repos/:uuid/agent/stream) lived only in the page's AGENT_FEED map and in lib/repo-activity.js's
 * in-memory tasks. Guardian's response-sink writes a .response node at the END (guardian/lib/response-sink.js). So a page
 * reload, an Idearium restart or a Clear Glass close mid-reply showed "no job for this agent since this page opened" and the
 * reply and the thinking so far were gone — the .response half of the 17-chunk loss (TL0, GW27 addendum b).
 *
 * One folder per job: <dir>/<repo>/<job>/
 *   reply.response   a .response node (lib/node-export.js), the reply and the thinking SO FAR, rewritten atomically (tmp +
 *                    rename, as lib/run-state.js does) on every frame that changes them: a crash leaves the last whole file
 *   timeline.jsonl   append-only, one line per event (no text: the text is in the node), so what happened and when survives
 *
 *   record(frame)                  → the job's view, after merging one feed frame { repoUuid, jobId, event, text, fullLen, reset,
 *                                    source, thinking, thinkingLen, provider, generating, gate/label/state, anchor, mutations }
 *   list(repoUuid, { limit })      → newest first; a job left open with no frame for 15 min reads 'stale' (never silently 'live')
 *   get(repoUuid, jobId, { timeline }) → one job, with its timeline when asked
 *   gates(repoUuid, { brick })     → §TL1c 0.60.144 — per contract gate, every attempt's reply in order (James: "You got it
 *                                    persistent per gate"); list({ brick }) the same jobs, newest first
 *   mergeText(prev, frame)         → the reply after one chunk (the same rules the page uses, app.js _agentFeedIn)
 *
 * The page keeps painting from its own frames; this is what it (and every agent, through `repo feed`) reads back.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.work-journal';
const VERSION = '1.2.0';
const TEXT_MAX = 200000;      // a reply is kept whole up to this; the page shows its tail
const THINK_MAX = 40000;
const STALE_MS = 15 * 60 * 1000;
const STATUS_OF = { dispatched: 'open', delivered: 'open', queued: 'open', chunk: 'responding', complete: 'complete', error: 'error', timeout: 'timeout' };
const ENDED = new Set(['complete', 'error', 'timeout']);

const _cache = new Map();     // `${repo}/${job}` -> record (a restart reads the file back)

function dir() { return process.env.WORK_JOURNAL_DIR || path.join(__dirname, '..', 'data', 'work'); }
function _safe(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'x'; }
function _jobDir(repo, job) { return path.join(dir(), _safe(repo), _safe(job)); }
function _nx() { return require('./node-export.js'); }

/** mergeText(prev, frame) — a chunk that IS the whole reply, or restates the shown text and continues it, replaces; a repeat of
 *  the tail is dropped; anything else continues it. Ollama's deltas are exact and appended. (app.js _agentFeedIn, 0.39.261) */
function mergeText(prev, p) {
  prev = prev || '';
  if (typeof p.text !== 'string' || !p.text) return prev;
  const t = p.text;
  let s;
  if (p.source === 'ollama') s = prev + t;
  else if (p.reset || (p.fullLen && t.length === p.fullLen) || (prev && t.startsWith(prev))) s = t;
  else if (prev && prev.endsWith(t)) s = prev;
  else s = prev + t;
  if (p.source !== 'ollama' && p.fullLen && s.length > p.fullLen) s = s.slice(-p.fullLen);
  return s.slice(-TEXT_MAX);
}

function _key(repo, job) { return `${_safe(repo)}/${_safe(job)}`; }
function _load(repo, job) {
  const k = _key(repo, job);
  if (_cache.has(k)) return _cache.get(k);
  let r = null;
  try { r = _nx().importFromFile(path.join(_jobDir(repo, job), 'reply.response')).payload || null; } catch (_) { r = null; }
  if (r) _cache.set(k, r);
  return r;
}

function _write(r) {
  const d = _jobDir(r.repoUuid, r.jobId);
  fs.mkdirSync(d, { recursive: true });
  const tags = [`repo:${r.repoUuid}`, `job:${r.jobId}`, `status:${r.status}`];
  if (r.provider) tags.push(`provider:${r.provider}`);
  if (r.session) tags.push(`session:${r.session}`);
  const env = _nx().wrap('response', r.jobId, r, { context: 'an agent reply as it streams, kept so a reload or a restart shows it again (TL1b)', system: 'core', tags,
    summary: `${r.status} · ${r.textLen}ch reply · ${r.thinkingLen}ch thinking · ${r.provider || '?'}` });
  const f = path.join(d, 'reply.response'); const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, _nx().toYaml(env), 'utf8');
  fs.renameSync(tmp, f);
}

function _line(r, p, now) {
  const row = { ts: Number(p.guardianTs) || now, event: p.event || null };
  for (const k of ['stage', 'gate', 'label', 'state', 'how', 'reason', 'error', 'transport', 'source']) if (p[k] != null && p[k] !== '') row[k] = String(p[k]).slice(0, 300);
  if (p.detail) row.detail = String(p.detail).slice(0, 300);
  if (p.event === 'chunk') { row.len = r.textLen; if (r.thinkingLen) row.thinkingLen = r.thinkingLen; }
  try { fs.appendFileSync(path.join(_jobDir(r.repoUuid, r.jobId), 'timeline.jsonl'), JSON.stringify(row) + '\n', 'utf8'); } catch (_) { /* the journal never stops the feed */ }
}

/** record(frame) → the job's view; null when the frame names no repo or job. Never throws into the feed. */
function record(p = {}) {
  if (!p || !p.repoUuid || !p.jobId) return null;
  const repo = String(p.repoUuid), job = String(p.jobId).slice(0, 120);
  const now = Date.now();
  let r = _load(repo, job);
  const fresh = !r;
  if (!r) {
    r = { jobId: job, repoUuid: repo, provider: null, model: null, session: null, source: null, status: 'open', generating: null,
      brick: null, runId: null, taskId: null, handled: null,
      text: '', textLen: 0, thinking: '', thinkingLen: 0, gate: null, anchor: null, mutations: null, events: 0,
      startedAt: Number(p.guardianTs) || now, updatedAt: now, endedAt: null };
    _cache.set(_key(repo, job), r);
  }
  const before = `${r.status}|${r.textLen}|${r.thinkingLen}|${r.generating}|${r.gate && r.gate.state}|${r.provider}`;
  if (p.provider) r.provider = String(p.provider).slice(0, 120);
  if (p.model) r.model = String(p.model).slice(0, 120);
  if (p.session) r.session = String(p.session).slice(0, 120);
  if (p.source) r.source = String(p.source).slice(0, 40);
  // §TL1c 0.60.144 — the contract gate (brick) this reply works on, <map>::<phase>::<gate>, and its phase run: kept once known
  const gateBefore = r.brick;
  if (p.brick && !r.brick) r.brick = String(p.brick).slice(0, 240);
  if (p.runId && !r.runId) r.runId = String(p.runId).slice(0, 120);
  if (p.taskId && !r.taskId) r.taskId = String(p.taskId).slice(0, 80);
  if (p.generating != null) r.generating = !!p.generating;
  if (p.mutations != null) r.mutations = Number(p.mutations) || 0;
  if (p.anchor && typeof p.anchor === 'object') r.anchor = { path: p.anchor.path || null, tag: p.anchor.tag || null, textLen: p.anchor.textLen || 0 };
  if (p.event === 'chunk' && !ENDED.has(r.status)) {   // a frame after the end is a re-read of the same reply: kept off
    r.text = mergeText(r.text, p);
    r.textLen = p.fullLen && p.source !== 'ollama' ? Number(p.fullLen) : r.text.length;
  }
  if (typeof p.thinking === 'string' && p.thinking) { r.thinking = p.thinking.slice(-THINK_MAX); r.thinkingLen = Number(p.thinkingLen) || p.thinking.length; }
  if (p.event === 'gate') r.gate = { label: p.label || p.gate || null, state: p.state || null, detail: p.detail ? String(p.detail).slice(0, 300) : null };
  const st = STATUS_OF[p.event];
  if (st && !(ENDED.has(r.status) && !ENDED.has(st))) r.status = st;   // a late chunk never reopens an ended job
  if (ENDED.has(r.status)) { r.generating = false; if (!r.endedAt) r.endedAt = Number(p.guardianTs) || now; }
  if (p.event === 'complete' && p.chars && !r.textLen) r.textLen = Number(p.chars) || 0;
  r.events++;
  r.updatedAt = now;
  const pulse = p.event === 'progress' && p.stage === 'dom';
  try {
    // a dom pulse (each second) is kept in memory and written with the next frame that changes something
    if (fresh || !pulse || r.brick !== gateBefore || before !== `${r.status}|${r.textLen}|${r.thinkingLen}|${r.generating}|${r.gate && r.gate.state}|${r.provider}`) _write(r);
    if (!pulse) _line(r, p, now);
  } catch (e) { r.writeError = e.message; }
  return view(r, now);
}

function view(r, now = Date.now()) {
  const stale = !ENDED.has(r.status) && now - (r.updatedAt || r.startedAt) > STALE_MS;
  return { ...r, status: stale ? 'stale' : r.status, generating: stale ? false : r.generating };
}

function _timeline(repo, job, limit = 400) {
  let lines = [];
  try { lines = fs.readFileSync(path.join(_jobDir(repo, job), 'timeline.jsonl'), 'utf8').split('\n').filter(Boolean); } catch (_) { return []; }
  return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}

function _all(repoUuid) {
  let names = [];
  try { names = fs.readdirSync(path.join(dir(), _safe(repoUuid))); } catch (_) { return []; }
  const now = Date.now();
  return names.map(n => _load(String(repoUuid), n)).filter(Boolean).map(r => view(r, now));
}
/** a brick key matches itself, and a <map>::<phase> prefix matches every gate of that phase */
function _ofGate(r, brick) { return !!r.brick && (r.brick === brick || r.brick.startsWith(`${brick}::`)); }

/** list(repoUuid, { limit, brick }) → { jobs } newest first (by the last frame); with brick, only that gate's (or phase's) */
function list(repoUuid, { limit = 20, brick = null } = {}) {
  if (!repoUuid) return { jobs: [] };
  const jobs = _all(repoUuid).filter(r => !brick || _ofGate(r, String(brick)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, Math.max(1, Math.min(200, limit)));
  return { jobs };
}

/** gates(repoUuid, { brick }) → { gates } — per gate: every attempt's reply, oldest first (attempt 1, 2, …), and how the last
 *  ended. Read from the jobs themselves (no second record, §7.6). A job no gate was known for is counted apart, said. */
function gates(repoUuid, { brick = null } = {}) {
  if (!repoUuid) return { gates: [], ungated: 0 };
  const all = _all(repoUuid);
  const by = new Map();
  for (const r of all) {
    if (!r.brick) continue;
    if (brick && !_ofGate(r, String(brick))) continue;
    if (!by.has(r.brick)) by.set(r.brick, []);
    by.get(r.brick).push(r);
  }
  const out = [...by.entries()].map(([key, rs]) => {
    rs.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    const last = rs[rs.length - 1];
    return { brick: key, attempts: rs.map((r, i) => ({ attempt: i + 1, jobId: r.jobId, provider: r.provider, runId: r.runId, status: r.status,
      textLen: r.textLen, thinkingLen: r.thinkingLen, startedAt: r.startedAt, updatedAt: r.updatedAt, handled: r.handled || null })),
      last: { jobId: last.jobId, status: last.status, provider: last.provider, updatedAt: last.updatedAt } };
  }).sort((a, b) => (b.last.updatedAt || 0) - (a.last.updatedAt || 0));
  return { gates: out, ungated: all.filter(r => !r.brick).length };
}

function get(repoUuid, jobId, { timeline = false } = {}) {
  const r = _load(String(repoUuid), String(jobId));
  if (!r) return null;
  const v = view(r);
  return timeline ? { ...v, timeline: _timeline(r.repoUuid, r.jobId) } : v;
}

/** §TL2a 0.60.145 — mark(repoUuid, brick, { before, by, state }): every job of this gate started before `before` was handled by
 *  an attempt (its reply judged, applied or refused), so it is never reused. Attempts at one gate run one after another, so
 *  "started before this attempt ended" is exactly the jobs it (or an earlier one) handled. → the job ids marked */
function mark(repoUuid, brick, { before = Date.now(), by = null, state = null } = {}) {
  if (!repoUuid || !brick) return [];
  const done = [];
  for (const n of (() => { try { return fs.readdirSync(path.join(dir(), _safe(repoUuid))); } catch (_) { return []; } })()) {
    const r = _load(String(repoUuid), n);
    if (!r || r.brick !== brick || r.handled || (r.startedAt || 0) > before) continue;
    r.handled = { at: Date.now(), by: by ? String(by).slice(0, 120) : null, state: state ? String(state).slice(0, 40) : null };
    try { _write(r); done.push(r.jobId); } catch (_) { /* said by the caller's count */ }
  }
  return done;
}

/** §TL2a 0.60.145 — reusable(repoUuid, brick) → the gate's newest job no attempt handled, from guardian (an Ollama reply is not
 *  in the Responses index, so it cannot be adopted): { jobId, inflight } — inflight when it is still being written — or null */
function reusable(repoUuid, brick) {
  if (!repoUuid || !brick) return null;
  const open = _all(repoUuid).filter(r => r.brick === brick && !r.handled && r.source !== 'ollama' && !/^ollama/.test(r.provider || ''))
    .filter(r => r.status === 'complete' || r.status === 'open' || r.status === 'responding')
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const r = open[0];
  return r ? { jobId: r.jobId, inflight: r.status !== 'complete', status: r.status, provider: r.provider, textLen: r.textLen } : null;
}

function _reset() { _cache.clear(); }

module.exports = { MODULE_ID, VERSION, record, list, gates, get, mark, reusable, mergeText, view, dir, _reset };
