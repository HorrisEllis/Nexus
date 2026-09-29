'use strict';
/**
 * copilot/lib/activity-recall.js — "what have you been up to?", answered from records.
 * comp_id: nexus.copilot.lib.activity-recall
 * UUID: nexus-copilot-activity-recall-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.267 — James: "i want to be able to talk to copilot and ask what its been up to."
 *
 * Nothing here is generated. Every line comes from something copilot already records:
 *   - lib/ollama-activity.js      — every Ollama call, whoever made it (data/ollama/activity.jsonl)
 *   - copilot/adversarial.js      — the self-test's last runs (in memory)
 *   - lib/scheduler.js            — scheduled tasks: runs, last run
 *   - lib/triggers.js             — armed triggers: fires, last fire
 *   - cortex chat_log             — questions copilot answered, and who answered them
 *   - cortex repo_agent_log       — Idearium repo-agent dispatches (hat, backend, ok/failed)
 *   - the live stream copilot keeps (_stream)
 * A source that can't be read is named as unreadable, never left out silently.
 *
 * recall({ sinceMs, stream }) -> structured object (GET /api/activity serves it)
 * format(recall, { focus })   -> the text copilot says
 * windowFrom(prompt)          -> { sinceMs, label } from "last hour", "today", "last 3 hours", …
 */

const DEFAULT_WINDOW_MS = 6 * 3600 * 1000;

function _safe(fn, fallback) { try { return fn(); } catch (e) { return { _error: e.message, ...(fallback || {}) }; } }
function _ago(ts, now = Date.now()) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function _dur(ms) {
  if (ms == null) return '?';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
function _every(ms) {
  if (!ms) return 'once';
  if (ms < 60000) return `every ${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `every ${Math.round(ms / 60000)}m`;
  return `every ${(ms / 3600000).toFixed(ms % 3600000 ? 1 : 0)}h`;
}

/** windowFrom(prompt) — the time window a question asks about. */
function windowFrom(prompt = '') {
  const p = String(prompt).toLowerCase();
  const now = Date.now();
  let m = p.match(/(?:last|past)\s+(\d+)\s*(minute|min|hour|hr|day)s?/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = /^min/.test(m[2]) ? 60000 : /^(hour|hr)/.test(m[2]) ? 3600000 : 86400000;
    return { sinceMs: now - n * unit, label: `in the last ${n} ${m[2].replace(/^hr$/, 'hour').replace(/^min$/, 'minute')}${n === 1 ? '' : 's'}` };
  }
  if (/(last|past)\s+(an?\s+)?hour/.test(p)) return { sinceMs: now - 3600000, label: 'in the last hour' };
  if (/\btoday\b/.test(p)) { const d = new Date(); d.setHours(0, 0, 0, 0); return { sinceMs: d.getTime(), label: 'today' }; }
  if (/\b(yesterday|last day|24 ?h)/.test(p)) return { sinceMs: now - 86400000, label: 'in the last 24 hours' };
  if (/\b(this week|last week|7 days)\b/.test(p)) return { sinceMs: now - 7 * 86400000, label: 'in the last 7 days' };
  return { sinceMs: now - DEFAULT_WINDOW_MS, label: 'in the last 6 hours' };
}

// ── sources ───────────────────────────────────────────────────────────────────

function _ollama(sinceMs) {
  const OA = require('../../lib/ollama-activity.js');
  const rows = OA.tail(5000).filter(r => (r.ts || 0) >= sinceMs);
  const byCaller = new Map();
  for (const r of rows) {
    // "bridge job 5e889801 (adversarial-probe) for x" -> "bridge job (adversarial-probe)": one line per kind of caller
    const key = String(r.caller || '?').replace(/\b[0-9a-f]{8}\b\s*/, '').replace(/\s+for\s+\S+$/, '').trim();
    const c = byCaller.get(key) || { caller: key, calls: 0, failed: 0, ms: 0, models: new Set(), last: 0 };
    c.calls++; if (r.ok === false) c.failed++;
    c.ms += r.ms || 0; if (r.model) c.models.add(r.model); c.last = Math.max(c.last, r.ts || 0);
    byCaller.set(key, c);
  }
  const callers = [...byCaller.values()].map(c => ({ ...c, models: [...c.models] })).sort((a, b) => b.ms - a.ms);
  return {
    calls: rows.length,
    failed: rows.filter(r => r.ok === false).length,
    busyMs: rows.reduce((a, r) => a + (r.ms || 0), 0),
    last: rows.length ? rows[rows.length - 1] : null,
    callers,
  };
}

function _selfTest() {
  const adv = require('../adversarial.js');
  const runs = adv.lastResults ? adv.lastResults() : [];
  return {
    intervalMs: adv.INTERVAL_MS ?? null,
    lastRun: runs[0] ? { ts: runs[0].ts, violations: runs[0].violations, durationMs: runs[0].durationMs } : null,
    recentViolations: runs.reduce((a, r) => a + (r.violations || 0), 0),
    recentRuns: runs.length,
  };
}

function _scheduled() {
  return require('../../lib/scheduler.js').list().map(t => ({
    name: t.name || t.id, everyMs: t.everyMs || null, runs: t.runs || 0, lastRun: t.lastRun || null, status: t.status,
    lastError: t.lastError || null,
  }));
}

function _triggers() {
  return require('../../lib/triggers.js').list().map(t => ({
    name: t.name || t.id, fires: t.fires || 0, lastFired: t.lastFired || null, status: t.status,
    on: t.condition ? (t.condition.eventType || t.condition.type || null) : null,
  }));
}

function _table(name, sinceMs, limit = 1000) {
  const { jaaDB } = require('../../cortex/memory/jaa-db');
  try { jaaDB.reloadTable(name); } catch (_) { /* another process owns the writes; a stale read is still a read */ }
  return jaaDB.tail(name, limit).filter(r => (r.ts || 0) >= sinceMs);   // newest first
}

function _chats(sinceMs) {
  const rows = _table('chat_log', sinceMs);
  const by = {};
  for (const r of rows) { const k = r.modelUsed || r.source || 'unknown'; by[k] = (by[k] || 0) + 1; }
  return {
    count: rows.length,
    escalated: rows.filter(r => r.escalated).length,
    byAnswerer: by,
    recent: rows.slice(0, 3).map(r => ({ ts: r.ts, prompt: String(r.prompt || '').slice(0, 80), by: r.modelUsed || r.source || '?' })),
  };
}

function _repoAgent(sinceMs) {
  const rows = _table('repo_agent_log', sinceMs);
  const byBackend = {};
  for (const r of rows) { const k = r.backend || 'auto'; byBackend[k] = (byBackend[k] || 0) + 1; }
  return {
    count: rows.length,
    failed: rows.filter(r => r.ok === false).length,
    byBackend,
    hats: [...new Set(rows.map(r => r.hatName).filter(Boolean))],
    recent: rows.slice(0, 3).map(r => ({ ts: r.ts, hat: r.hatName, backend: r.backend, ok: r.ok, message: String(r.message || '').slice(0, 80), error: r.error ? String(r.error).slice(0, 100) : null })),
  };
}

function _stream(stream = []) {
  const types = {};
  for (const e of stream) { const t = (e && e.type) || '?'; types[t] = (types[t] || 0) + 1; }
  return { events: stream.length, top: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 5) };
}

/** recall({ sinceMs, stream }) — everything, structured. Never throws. */
function recall({ sinceMs = Date.now() - DEFAULT_WINDOW_MS, stream = [] } = {}) {
  return {
    since: sinceMs, now: Date.now(),
    ollama:    _safe(() => _ollama(sinceMs)),
    selfTest:  _safe(() => _selfTest()),
    scheduled: _safe(() => _scheduled()),
    triggers:  _safe(() => _triggers()),
    chats:     _safe(() => _chats(sinceMs)),
    repoAgent: _safe(() => _repoAgent(sinceMs)),
    stream:    _safe(() => _stream(stream)),
  };
}

// ── words ─────────────────────────────────────────────────────────────────────

function _fmtOllama(o, label, now) {
  if (o._error) return [`Ollama: couldn't read the activity log (${o._error}).`];
  if (!o.calls) return [`Ollama: no calls ${label}.`];
  const lines = [`Ollama: ${o.calls} call${o.calls === 1 ? '' : 's'} ${label}, ${_dur(o.busyMs)} generating${o.failed ? `, ${o.failed} failed` : ''}. Last one ${_ago(o.last && o.last.ts, now)}.`];
  for (const c of o.callers.slice(0, 6)) {
    lines.push(`  · ${c.caller}: ${c.calls}× · ${_dur(c.ms)}${c.failed ? ` · ${c.failed} failed` : ''}${c.models.length ? ` · ${c.models.join(', ')}` : ''} · last ${_ago(c.last, now)}`);
  }
  if (o.callers.length > 6) lines.push(`  · …and ${o.callers.length - 6} more callers`);
  return lines;
}

/** format(r, { focus, label }) — focus 'ollama' answers only what touched Ollama. */
function format(r, { focus = null, label = 'in the last 6 hours' } = {}) {
  const now = r.now || Date.now();
  const out = [];

  out.push(..._fmtOllama(r.ollama || {}, label, now));

  const st = r.selfTest || {};
  if (st._error) out.push(`Self-test: unreadable (${st._error}).`);
  else if (st.intervalMs === 0) out.push('Self-test: off.');
  else {
    out.push(`Self-test: ${st.intervalMs ? _every(st.intervalMs) : 'scheduled'}, 1 Ollama call per run. ` +
      (st.lastRun ? `Last run ${_ago(st.lastRun.ts, now)}, ${_dur(st.lastRun.durationMs)}, ${st.lastRun.violations} violation${st.lastRun.violations === 1 ? '' : 's'}.` : 'Hasn\'t run since boot.'));
  }
  if (focus === 'ollama') return out.join('\n');

  const ch = r.chats || {};
  if (ch._error) out.push(`Questions: chat log unreadable (${ch._error}).`);
  else if (!ch.count) out.push(`Questions: none ${label}.`);
  else {
    const by = Object.entries(ch.byAnswerer).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
    out.push(`Questions: answered ${ch.count} (${by})${ch.escalated ? `, ${ch.escalated} escalated to Guardian` : ''}.`);
    for (const x of ch.recent) out.push(`  · ${_ago(x.ts, now)} — "${x.prompt}" → ${x.by}`);
  }

  const ra = r.repoAgent || {};
  if (ra._error) out.push(`Idearium agents: log unreadable (${ra._error}).`);
  else if (!ra.count) out.push(`Idearium agents: no dispatches ${label}.`);
  else {
    const by = Object.entries(ra.byBackend).map(([k, n]) => `${k} ${n}`).join(', ');
    out.push(`Idearium agents: ${ra.count} dispatch${ra.count === 1 ? '' : 'es'} (${by})${ra.failed ? `, ${ra.failed} failed` : ''}${ra.hats.length ? ` · hats: ${ra.hats.slice(0, 4).join(', ')}` : ''}.`);
    for (const x of ra.recent) out.push(`  · ${_ago(x.ts, now)} — ${x.hat || 'hat?'} on ${x.backend || 'auto'}: "${x.message}"${x.ok ? '' : ` ✗ ${x.error || 'failed'}`}`);
  }

  const sc = Array.isArray(r.scheduled) ? r.scheduled.filter(t => t.status !== 'cancelled') : [];
  if (sc.length) {
    out.push(`Scheduled: ${sc.map(t => `${t.name} (${_every(t.everyMs)}, ${t.runs} run${t.runs === 1 ? '' : 's'}, last ${_ago(t.lastRun, now)}${t.lastError ? `, last error: ${String(t.lastError).slice(0, 60)}` : ''})`).join('; ')}.`);
  }
  const tr = Array.isArray(r.triggers) ? r.triggers.filter(t => t.status !== 'cancelled') : [];
  if (tr.length) {
    out.push(`Triggers: ${tr.map(t => `${t.name}${t.on ? ` on ${t.on}` : ''} (fired ${t.fires}×, last ${_ago(t.lastFired, now)})`).join('; ')}.`);
  }

  const s = r.stream || {};
  if (s.events) out.push(`Stream: ${s.events} recent events — mostly ${s.top.slice(0, 3).map(([t, n]) => `${t} ${n}×`).join(', ')}.`);

  return out.join('\n');
}

// Questions this answers. Checked before the greeting fast-path, so "hey, what have you been up to" lands here.
const ACTIVITY_RE = /\bwhat(?:'?s| have| has| did)?\s+(?:you|copilot|co-pilot)\s+(?:been\s+)?(?:up to|doing|do|done(?!\s+(?:to|with)\b)|working on)\b(?!\s+(?:to|with)\s|\s+in\s+(?:my|this|that)\b|\s+in\s+the\s+(?!last\b|past\b))|\bwhat(?:'s|s|\s+is|\s+has|\s+have)\s+ollama\s+(?:been\s+)?(?:doing|up to|done)\b|\b(?:your|copilot'?s?)\s+(?:recent\s+)?activity\b|^(?:show\s+(?:me\s+)?)?(?:the\s+|your\s+)?activity(?:\s+(?:report|summary))?\s*\??$|^\/activity\b|\bwhat(?:'?s| has| have)?\s+(?:been\s+)?(?:running|happening)\s+(?:in the background|lately|recently)\b|\bwho(?:'?s| is| has been)\s+using\s+ollama\b/i;
const OLLAMA_FOCUS_RE = /\bollama\b/i;

function matches(prompt) { return ACTIVITY_RE.test(String(prompt || '')); }

/** answer(prompt, stream) — the intuition-shaped reply, or null if this isn't an activity question. */
function answer(prompt, stream = []) {
  if (!matches(prompt)) return null;
  const w = windowFrom(prompt);
  const r = recall({ sinceMs: w.sinceMs, stream });
  const focus = OLLAMA_FOCUS_RE.test(prompt) ? 'ollama' : null;
  return { text: format(r, { focus, label: w.label }), modelUsed: 'data-only', intent: 'activity', source: 'intuition.activity', recall: r };
}

module.exports = { recall, format, answer, matches, windowFrom, ACTIVITY_RE, MODULE_ID: 'nexus.copilot.lib.activity-recall', VERSION: '1.0.0' };
