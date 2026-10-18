'use strict';
/**
 * lib/work-journal.js — the contract ledger: one append-only ledger per contract, every gate's attempts, jobs and replies (TL2a-4,
 * 0.60.146; first the reply journal of TL1b, 0.60.143)
 * comp_id: nexus.lib.work-journal
 * UUID: nexus-lib-work-journal-v1-0000-2026-1018-jamesbrooks-001
 * Map: docs/2026-10-16-durable-work-timeline-phasemap.spec (addenda d, e, f, g)
 *
 * James, 2026-10-18: "We need persistent data look at the last commit." (TL1b) · "You got it persistent per gate" (TL1c) ·
 * "okay only one record. maybe use it as a contract ledger for each contract." (TL2a-4, 0.60.146)
 *
 * WHY THE SHAPE CHANGED (0.60.146). 0.60.143 kept every reply in a folder per job (reply.response + timeline.jsonl). Clear Glass
 * already keeps every chat's reply and thinking as the page streams it (clear-glass/src/downloads/chat-ledger.js, 0.39.278), so
 * a browser agent's reply was kept twice. His decision: one record, and this becomes a ledger for each contract.
 *
 * One ledger per contract: <dir>/<repo>/<map>::<phase>.ledger.jsonl (safe-named); a job with no gate (an Agent tab chat) is in
 * the repo's agent.ledger.jsonl. Append-only (a crash loses at most the line being written; a torn last line is skipped).
 *   { t:'job',   ts, jobId, brick, runId, taskId, session, provider, model, source, startedAt }   — first seen, or its fields grew
 *   { t:'link',  ts, jobId, chatKey, turn }        — the chat ledger turn the reply is written in: its text is read from there
 *   { t:'frame', ts, jobId, event, status, len, thinkingLen, generating, gate…, error… }            — what happened, no text
 *   { t:'text',  ts, jobId, add, at } | { set }    — the reply, only when no other record holds it (an Ollama reply; a tab
 *   { t:'think', ts, jobId, add, at } | { set }      outside Clear Glass; a linked turn the chat ledger turned out not to have)
 *   { t:'handled', ts, jobId, by, state }          — an attempt judged it: never reused (TL2a)
 *   { t:'moved', ts, jobId, to }                   — its gate became known: it continues in its contract's ledger
 * <dir>/<repo>/jobs.index.json maps a job to its ledger: a projection, rebuilt by scanning the ledgers when missing.
 * Guardian's .response (the Responses index) stays guardian's own record of a job's answer (§10.1); it is read by reuse, not copied.
 * The folders 0.60.143–0.60.145 wrote (<dir>/<repo>/<job>/reply.response) are still read (§0.3).
 *
 *   record(frame)                  → the job's view after one feed frame { repoUuid, jobId, event, text, fullLen, reset, source,
 *                                    thinking, thinkingLen, provider, generating, gate/label/state, anchor, mutations, brick, runId,
 *                                    taskId, session, chatId, turn }
 *   list(repoUuid, { limit, brick }) → newest first; an open job silent 15 min reads 'stale' (never silently 'live')
 *   get(repoUuid, jobId, { timeline }) → one job as kept here (a linked reply's text only while it streams), its timeline
 *   read(repoUuid, jobId, { timeline }) → async: the same, with a linked reply's text from Clear Glass's chat ledger (its route)
 *   gates(repoUuid, { brick })     → per gate, every attempt in order (TL1c)
 *   ledger(repoUuid, contract)     → one contract's ledger, replayed: its jobs and its lines (0.60.146)
 *   mark / reusable                → TL2a: handled, never reused; the gate's newest guardian job no attempt handled
 *   mergeText(prev, frame)         → the reply after one chunk (the same rules the page uses, app.js _agentFeedIn)
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.work-journal';
const VERSION = '2.0.0';
const TEXT_MAX = 200000;
const THINK_MAX = 40000;
const STALE_MS = 15 * 60 * 1000;
const VERIFY_MS = Number(process.env.WORK_JOURNAL_VERIFY_MS) || 3000;       // the page posts the chat ledger's settled delta a moment after the job's last frame
const STATUS_OF = { dispatched: 'open', delivered: 'open', queued: 'open', chunk: 'responding', complete: 'complete', error: 'error', timeout: 'timeout' };
const ENDED = new Set(['complete', 'error', 'timeout']);
const AGENT_LEDGER = 'agent';

const _cache = new Map();     // `${repo}/${job}` -> the job's record (live, or replayed)
const _held = new Map();      // `${repo}/${job}` -> { text, thinking } written to the ledger so far (for add/at deltas)

function dir() { return process.env.WORK_JOURNAL_DIR || path.join(__dirname, '..', 'data', 'work'); }
function _safe(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/:/g, '~').replace(/^-+|-+$/g, '').slice(0, 140) || 'x'; }
function _safeOld(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'x'; }
function _repoDir(repo) { return path.join(dir(), _safeOld(repo)); }
function _key(repo, job) { return `${_safeOld(repo)}/${_safeOld(job)}`; }
/** the contract a gate belongs to: <map>::<phase>::<gate> → <map>::<phase> */
function contractOf(brick) { if (!brick) return null; const p = String(brick).split('::'); return p.length >= 2 ? `${p[0]}::${p[1]}` : String(brick); }
function _ledgerFile(repo, name) { return path.join(_repoDir(repo), `${_safe(name)}.ledger.jsonl`); }
// §0.60.146 — Clear Glass is another system: its chat ledger is read through its own route (GET /cli/downloads/ledgers/:chatKey,
// clear-glass/src/ipc/bridge.js), never by requiring its code (the drawbridge, docs/2026-10-17-system-drawbridge-phasemap.spec)
function _cgUrl() { return (process.env.CLEAR_GLASS_URL || `http://127.0.0.1:${process.env.CLEAR_GLASS_PORT || 7701}`).replace(/\/$/, ''); }
function chatKeyOf(provider, chatId) { return `${provider}:${chatId}`; }   // the chat ledger's own key shape (chat-ledger.js chatKeyOf)
const _chatCache = new Map();   // chatKey -> { at, chat } — a moment's cache, so a list of jobs in one chat asks once
async function _chat(chatKey) {
  const hit = _chatCache.get(chatKey);
  if (hit && Date.now() - hit.at < 1500) return hit.chat;
  let chat = null;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2000); if (t.unref) t.unref();
    const r = await fetch(`${_cgUrl()}/cli/downloads/ledgers/${encodeURIComponent(chatKey)}`, { signal: ac.signal });
    clearTimeout(t);
    chat = r.ok ? ((await r.json()) || {}).chat || null : (r.status === 404 ? false : null);
  } catch (_) { chat = null; }   // null: Clear Glass not reachable; false: reachable, no such chat
  _chatCache.set(chatKey, { at: Date.now(), chat });
  return chat;
}

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

// ── the index: job → ledger (a projection of the ledgers) ──────────────────────────────────────────────────────────────────
const _idx = new Map();   // repo -> { job: ledgerName }
function _indexFile(repo) { return path.join(_repoDir(repo), 'jobs.index.json'); }
function _index(repo) {
  const k = _safeOld(repo);
  if (_idx.has(k)) return _idx.get(k);
  let m = null;
  try { m = JSON.parse(fs.readFileSync(_indexFile(repo), 'utf8')); } catch (_) { m = null; }
  if (!m) {   // missing or torn: rebuilt from the ledgers themselves
    m = {};
    for (const name of _ledgers(repo)) for (const l of _lines(_ledgerFile(repo, name))) {
      if (l.t === 'job' && l.jobId) m[l.jobId] = name;
      if (l.t === 'moved' && l.jobId && l.to) m[l.jobId] = l.to;
    }
  }
  _idx.set(k, m);
  return m;
}
function _saveIndex(repo) {
  const f = _indexFile(repo); const tmp = `${f}.${process.pid}.tmp`;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(_index(repo)), 'utf8'); fs.renameSync(tmp, f); } catch (_) { /* rebuilt from the ledgers next time */ }
}
/** ledger names in a repo (from the files: <name>.ledger.jsonl) */
function _ledgers(repo) {
  let names = [];
  try { names = fs.readdirSync(_repoDir(repo)).filter(n => n.endsWith('.ledger.jsonl')); } catch (_) { return []; }
  return names.map(n => n.slice(0, -'.ledger.jsonl'.length).replace(/~/g, ':'));
}
function _lines(file) {
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const l of txt.split('\n')) { if (!l) continue; try { out.push(JSON.parse(l)); } catch (_) { /* a torn last line */ } }
  return out;
}
function _append(repo, name, line) {
  const f = _ledgerFile(repo, name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(line) + '\n', 'utf8');
}

// ── replay ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _blank(repo, job, ts) {
  return { jobId: job, repoUuid: repo, provider: null, model: null, session: null, source: null, status: 'open', generating: null,
    brick: null, runId: null, taskId: null, handled: null, chatKey: null, turn: null, ledger: null,
    text: '', textLen: 0, thinking: '', thinkingLen: 0, textHere: false, gate: null, anchor: null, mutations: null, events: 0,
    startedAt: ts, updatedAt: ts, endedAt: null };
}
function _applyDelta(prev, l) { return l.set != null ? String(l.set) : (Number.isInteger(l.at) && l.at <= prev.length ? prev.slice(0, l.at) : prev) + String(l.add || ''); }
/** every job of one ledger, replayed from its lines */
function _replay(repo, name) {
  const jobs = new Map(); const moved = new Set();
  for (const l of _lines(_ledgerFile(repo, name))) {
    if (!l || !l.jobId) continue;
    if (l.t === 'moved') { moved.add(l.jobId); continue; }
    let r = jobs.get(l.jobId);
    if (!r) { r = _blank(repo, l.jobId, l.startedAt || l.ts || 0); r.ledger = name; jobs.set(l.jobId, r); }
    if (l.t === 'job') { for (const k of ['brick', 'runId', 'taskId', 'session', 'provider', 'model', 'source']) if (l[k]) r[k] = l[k]; if (l.startedAt) r.startedAt = l.startedAt; if (l.snapshot) Object.assign(r, l.snapshot); }
    else if (l.t === 'link') { r.chatKey = l.chatKey || null; r.turn = Number.isInteger(l.turn) ? l.turn : null; }
    else if (l.t === 'text') { r.text = _applyDelta(r.text, l); r.textHere = true; if (!r.textLen || r.text.length > r.textLen) r.textLen = r.text.length; }
    else if (l.t === 'think') { r.thinking = _applyDelta(r.thinking, l); if (r.thinking.length > r.thinkingLen) r.thinkingLen = r.thinking.length; }
    else if (l.t === 'handled') r.handled = { at: l.ts, by: l.by || null, state: l.state || null };
    else if (l.t === 'frame') {
      r.events++; r.updatedAt = l.ts || r.updatedAt;
      if (l.status) r.status = l.status;
      if (l.len != null) r.textLen = l.len;
      if (l.thinkingLen != null) r.thinkingLen = l.thinkingLen;
      if (l.generating != null) r.generating = l.generating;
      if (l.gateState) r.gate = { label: l.label || l.gate || null, state: l.gateState, detail: l.detail || null };
      if (ENDED.has(r.status) && !r.endedAt) { r.endedAt = l.ts; r.generating = false; }
    }
  }
  for (const j of moved) if (jobs.has(j) && !_lines(_ledgerFile(repo, name)).some(l => l.t === 'job' && l.jobId === j && l.snapshot)) jobs.delete(j);
  return jobs;
}
/** a job folder written by 0.60.143–0.60.145, read as it was (nothing lost, §0.3) */
function _legacy(repo, job) {
  try { const r = require('./node-export.js').importFromFile(path.join(_repoDir(repo), _safeOld(job), 'reply.response')).payload; if (r) { r.legacy = true; r.textHere = true; } return r || null; }
  catch (_) { return null; }
}
function _legacyJobs(repo) {
  let names = [];
  try { names = fs.readdirSync(_repoDir(repo), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (_) { return []; }
  return names;
}
function _load(repo, job) {
  const k = _key(repo, job);
  if (_cache.has(k)) return _cache.get(k);
  const name = _index(repo)[job];
  let r = name ? (_replay(repo, name).get(job) || null) : null;
  if (!r) r = _legacy(repo, job);
  if (r) {
    // a handled mark may sit in a contract ledger for a job written before it (a legacy folder)
    if (!r.handled && r.legacy && r.brick) { const h = _replay(repo, contractOf(r.brick)).get(job); if (h && h.handled) r.handled = h.handled; }
    _cache.set(k, r);
    _held.set(k, { text: r.textHere ? r.text : '', thinking: r.thinking || '' });
  }
  return r;
}

// ── the text's one home ────────────────────────────────────────────────────────────────────────────────────────────────────
/** the chat ledger turn a linked job's reply is in → { text, thinking } | { missing: true } (Clear Glass answered: not there)
 *  | null (Clear Glass not reachable now) */
async function _fromChat(r) {
  if (!r || !r.chatKey || !Number.isInteger(r.turn)) return null;
  const c = await _chat(r.chatKey);
  if (c === null) return null;
  const t = c && c.turns && c.turns[r.turn];
  return t && t.role === 'assistant' ? { text: t.text || '', thinking: t.thinking || '' } : { missing: true };
}
/** a reply whose chat ledger turn should hold it: if, a moment after it ended, the turn does not, it is written here once */
function _verifyLater(r) {
  const k = _key(r.repoUuid, r.jobId);
  const check = async () => {
    const live = _cache.get(k) || r;
    _chatCache.delete(live.chatKey);
    const c = await _fromChat(live);
    const want = live.text || '';
    if (c && !c.missing && c.text.length >= Math.floor(want.length * 0.9)) return;
    const why = !c ? 'Clear Glass was not reachable to confirm its chat ledger holds this turn' : c.missing ? 'the chat ledger does not hold this turn' : 'the chat ledger turn is shorter than the reply';
    try { _append(live.repoUuid, live.ledger, { t: 'text', ts: Date.now(), jobId: live.jobId, set: want.slice(-TEXT_MAX), why }); live.textHere = true; } catch (_) {}
  };
  const t = setTimeout(check, VERIFY_MS); if (t.unref) t.unref();
  return check;
}

function _deltaLine(t, jobId, prev, now) {
  if (now === prev) return null;
  return now.startsWith(prev) ? { t, jobId, at: prev.length, add: now.slice(prev.length) } : { t, jobId, set: now };
}

/** record(frame) → the job's view; null when the frame names no repo or job. Never throws into the feed. */
function record(p = {}) {
  if (!p || !p.repoUuid || !p.jobId) return null;
  const repo = String(p.repoUuid), job = String(p.jobId).slice(0, 120);
  const k = _key(repo, job);
  const now = Date.now(), ts = Number(p.guardianTs) || now;
  let r = _load(repo, job);
  const lines = [];
  if (!r || r.legacy) {
    const old = r;
    r = _blank(repo, job, ts);
    if (old) Object.assign(r, { ...old, legacy: false, ledger: null });
    _cache.set(k, r); _held.set(k, { text: '', thinking: '' });
  }
  // which ledger: its contract's once its gate is known, else the repo's agent ledger; a job whose gate becomes known moves
  if (p.brick && !r.brick) r.brick = String(p.brick).slice(0, 240);
  const want = r.brick ? contractOf(r.brick) : AGENT_LEDGER;
  const fields = { brick: r.brick, runId: p.runId || r.runId || null, taskId: p.taskId || r.taskId || null, session: p.session || r.session || null,
    provider: p.provider || r.provider || null, model: p.model || r.model || null, source: p.source || r.source || null };
  const grew = Object.keys(fields).some(f => fields[f] && fields[f] !== r[f]);
  Object.assign(r, Object.fromEntries(Object.entries(fields).filter(([, v]) => v)));
  if (r.ledger !== want) {
    const from = r.ledger;
    r.ledger = want;
    const snap = from ? { snapshot: { status: r.status, textLen: r.textLen, thinkingLen: r.thinkingLen, events: r.events, handled: r.handled, chatKey: r.chatKey, turn: r.turn } } : {};
    lines.push({ t: 'job', ts, jobId: job, ...fields, startedAt: r.startedAt, ...snap });
    if (from) {
      try { _append(repo, from, { t: 'moved', ts, jobId: job, to: want }); } catch (_) {}
      if (r.textHere && r.text) lines.push({ t: 'text', jobId: job, set: r.text });
      if (!r.chatKey && r.thinking) lines.push({ t: 'think', jobId: job, set: r.thinking });
      _held.set(k, { text: r.textHere ? r.text : '', thinking: r.chatKey ? '' : r.thinking });
    }
    _index(repo)[job] = want; _saveIndex(repo);
  } else if (grew) lines.push({ t: 'job', ts, jobId: job, ...fields });
  // the chat ledger turn this reply is written in (a browser agent in Clear Glass): its text is read from there
  if (p.chatId && Number.isInteger(p.turn) && p.source !== 'ollama') {
    const chatKey = chatKeyOf(r.provider || p.provider || '', p.chatId);
    if (chatKey !== r.chatKey || p.turn !== r.turn) { r.chatKey = chatKey; r.turn = p.turn; lines.push({ t: 'link', ts, jobId: job, chatKey, turn: p.turn }); }
  }
  const before = `${r.status}|${r.textLen}|${r.thinkingLen}|${r.generating}|${r.gate && r.gate.state}`;
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
  const justEnded = ENDED.has(r.status) && !r.endedAt;
  if (ENDED.has(r.status)) { r.generating = false; if (!r.endedAt) r.endedAt = ts; }
  if (p.event === 'complete' && p.chars && !r.textLen) r.textLen = Number(p.chars) || 0;
  r.events++;
  r.updatedAt = now;
  // the text: only when nothing else holds it — not linked to a chat ledger turn (Ollama, a tab outside Clear Glass)
  const held = _held.get(k) || { text: '', thinking: '' };
  if (!r.chatKey) {
    const tl = _deltaLine('text', job, held.text, r.text); if (tl) { lines.push({ ts, ...tl }); held.text = r.text; r.textHere = true; }
    const th = _deltaLine('think', job, held.thinking, r.thinking || ''); if (th) { lines.push({ ts, ...th }); held.thinking = r.thinking; }
    _held.set(k, held);
  }
  const pulse = p.event === 'progress' && p.stage === 'dom';
  if (!pulse || before !== `${r.status}|${r.textLen}|${r.thinkingLen}|${r.generating}|${r.gate && r.gate.state}`) {
    const fl = { t: 'frame', ts, jobId: job, event: p.event || null, status: r.status, len: r.textLen };
    if (r.thinkingLen) fl.thinkingLen = r.thinkingLen;
    if (p.generating != null) fl.generating = !!p.generating;
    for (const f of ['stage', 'gate', 'label', 'how', 'reason', 'error', 'transport', 'source']) if (p[f] != null && p[f] !== '') fl[f] = String(p[f]).slice(0, 300);
    if (p.event === 'gate') { fl.gateState = p.state || null; if (p.detail) fl.detail = String(p.detail).slice(0, 300); }
    lines.push(fl);
  }
  try { for (const l of lines) _append(repo, r.ledger, l); } catch (e) { r.writeError = e.message; }
  if (justEnded && r.chatKey && r.status === 'complete') _verifyLater(r);
  return view(r, now);
}

function view(r, now = Date.now()) {
  const stale = !ENDED.has(r.status) && now - (r.updatedAt || r.startedAt) > STALE_MS;
  return { ...r, status: stale ? 'stale' : r.status, generating: stale ? false : r.generating };
}
/** a view as this process holds it: a linked reply's text is here only while it streams (read() fetches it from its home) */
function _full(r) {
  const v = view(r);
  v.textFrom = r.legacy ? 'legacy' : r.chatKey && !r.textHere ? (r.text ? 'live' : 'chat-ledger (not read)') : 'contract-ledger';
  return v;
}
/** read(repoUuid, jobId, { timeline }) → the job with its reply and thinking from their one home: Clear Glass's chat ledger
 *  (through its route) for a linked reply, else this ledger. Clear Glass not reachable: said (textFrom), never filled. */
async function read(repoUuid, jobId, opts = {}) {
  const r = _load(String(repoUuid), String(jobId));
  if (!r) return null;
  const v = get(repoUuid, jobId, opts);
  if (r.chatKey && !r.textHere) {
    const c = await _fromChat(r);
    if (c && !c.missing) {
      if (c.text.length >= (v.text || '').length) v.text = c.text;
      if ((c.thinking || '').length >= (v.thinking || '').length) v.thinking = c.thinking;
      v.textFrom = 'chat-ledger';
    } else v.textFrom = !c ? (v.text ? 'live (Clear Glass not reachable)' : 'chat-ledger (Clear Glass not reachable)') : (v.text ? 'live' : 'missing');
  }
  return v;
}

function _timeline(r, limit = 400) {
  if (r.legacy) {
    let lines = [];
    try { lines = fs.readFileSync(path.join(_repoDir(r.repoUuid), _safeOld(r.jobId), 'timeline.jsonl'), 'utf8').split('\n').filter(Boolean); } catch (_) { return []; }
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  }
  const out = [];
  for (const name of new Set([AGENT_LEDGER, r.ledger].filter(Boolean))) for (const l of _lines(_ledgerFile(r.repoUuid, name))) if (l.t === 'frame' && l.jobId === r.jobId) { const { t, jobId, ...rest } = l; out.push(rest); }
  return out.sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-limit);
}

function _all(repoUuid) {
  const repo = String(repoUuid);
  const seen = new Set(); const out = [];
  const now = Date.now();
  for (const job of Object.keys(_index(repo))) { const r = _load(repo, job); if (r) { seen.add(_safeOld(job)); out.push(view(r, now)); } }
  for (const n of _legacyJobs(repo)) { if (seen.has(n)) continue; const r = _load(repo, n); if (r) out.push(view(r, now)); }
  return out;
}
/** a brick key matches itself, and a <map>::<phase> prefix matches every gate of that phase */
function _ofGate(r, brick) { return !!r.brick && (r.brick === brick || r.brick.startsWith(`${brick}::`)); }

/** list(repoUuid, { limit, brick }) → { jobs } newest first (by the last frame); with brick, only that gate's (or phase's) */
function list(repoUuid, { limit = 20, brick = null } = {}) {
  if (!repoUuid) return { jobs: [] };
  const jobs = _all(repoUuid).filter(r => !brick || _ofGate(r, String(brick)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, Math.max(1, Math.min(200, limit)))
    .map(v => _full(_cache.get(_key(repoUuid, v.jobId)) || v));
  return { jobs };
}

/** gates(repoUuid, { brick }) → { gates } — per gate: every attempt's reply, oldest first (attempt 1, 2, …), and how the last
 *  ended. A job no gate was known for is counted apart, said. */
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
    return { brick: key, contract: contractOf(key), attempts: rs.map((r, i) => ({ attempt: i + 1, jobId: r.jobId, provider: r.provider, runId: r.runId, status: r.status,
      textLen: r.textLen, thinkingLen: r.thinkingLen, startedAt: r.startedAt, updatedAt: r.updatedAt, handled: r.handled || null, chatKey: r.chatKey || null })),
      last: { jobId: last.jobId, status: last.status, provider: last.provider, updatedAt: last.updatedAt } };
  }).sort((a, b) => (b.last.updatedAt || 0) - (a.last.updatedAt || 0));
  return { gates: out, ungated: all.filter(r => !r.brick).length };
}

function get(repoUuid, jobId, { timeline = false } = {}) {
  const r = _load(String(repoUuid), String(jobId));
  if (!r) return null;
  const v = _full(r);
  return timeline ? { ...v, timeline: _timeline(r) } : v;
}

/** ledger(repoUuid, contract) → { contract, file, jobs: [views, oldest first], lines } — one contract's ledger, replayed */
function ledger(repoUuid, contract) {
  if (!repoUuid || !contract) return null;
  const name = contractOf(contract);
  const file = _ledgerFile(repoUuid, name);
  const lines = _lines(file);
  if (!lines.length) return null;
  const jobs = [..._replay(String(repoUuid), name).values()].map(r => _full(_cache.get(_key(repoUuid, r.jobId)) || r)).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  return { contract: name, file, jobs, lines: lines.length };
}

/** §TL2a 0.60.145 — mark(repoUuid, brick, { before, by, state }): every job of this gate started before `before` was handled by
 *  an attempt (its reply judged, applied or refused), so it is never reused. → the job ids marked */
function mark(repoUuid, brick, { before = Date.now(), by = null, state = null } = {}) {
  if (!repoUuid || !brick) return [];
  const done = [];
  for (const v of _all(repoUuid)) {
    const r = _load(String(repoUuid), v.jobId);
    if (!r || r.brick !== brick || r.handled || (r.startedAt || 0) > before) continue;
    r.handled = { at: Date.now(), by: by ? String(by).slice(0, 120) : null, state: state ? String(state).slice(0, 40) : null };
    try { _append(String(repoUuid), contractOf(brick), { t: 'handled', ts: r.handled.at, jobId: r.jobId, by: r.handled.by, state: r.handled.state }); done.push(r.jobId); } catch (_) {}
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

function _reset() { _cache.clear(); _held.clear(); _idx.clear(); _chatCache.clear(); }

module.exports = { MODULE_ID, VERSION, record, list, gates, get, read, ledger, mark, reusable, contractOf, chatKeyOf, mergeText, view, dir, _reset };
