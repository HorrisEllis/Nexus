'use strict';
/**
 * lib/cg-learning.js — what copilot learns from driving Clear Glass, and uses the next time.
 * comp_id: nexus.lib.cg-learning
 * UUID: nexus-lib-cg-learning-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * James, 2026-09-27: "expand it as much as possible. also have him learn."
 *
 * WHAT WAS THERE: every tool call already lands in tool_index (consumer/intent/edge case) and, on error, fault_log —
 * per TOOL. Nothing was kept per SITE: a selector that failed on upwork.com yesterday fails the same way today; a
 * five-step flow that worked is re-derived from scratch; the form field "Email" found by label is found again by
 * guessing. This module is that missing layer, and it only records what actually happened (I5: evidence):
 *
 *   observe()   one row per browser action: host, action, selector, the label/text it was aimed at, ok or the error,
 *               and — when a selector was healed — what it replaced. Table cg_site_memory (cortex JAA).
 *   hintsFor()  per host: selectors that worked (by the label they filled), selectors that keep failing, and the flows
 *               that worked there. Returned with every page read, so the next attempt starts from what is known.
 *   heal()      PURE. A step whose selector found nothing is re-aimed: first at a selector that worked for the same
 *               label on this host, then at the page's own field whose label/name best matches, or the button whose
 *               text does. One retry, recorded either way — a heal that worked becomes a hint.
 *   recordFlow()a sequence of ≥3 steps that all succeeded is kept per host (cg_learned_flows), counted each time it
 *               works again; password values are never stored (they become {{password}}).
 *   flows(), replayable steps, promote() to a Clear Glass macro (macro tool, mappable steps only), forget().
 *
 * Nothing here overrides James's explicit settings (recipes, macros, site settings win); a hint is a hint.
 */

const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.cg-learning';
const VERSION = '1.0.0';
const T = Object.freeze({ memory: 'cg_site_memory', flows: 'cg_learned_flows' });
const HEALABLE = new Set(['click', 'type', 'setValue', 'select', 'check', 'upload', 'waitFor', 'hover']);
const NOT_FOUND = /not found|no element|element not found|null is not|cannot read propert|no node/i;
const SECRET = /pass(word)?|pwd|secret|otp|2fa|cvv|card.?number|ssn/i;

function jaa() { return require('../cortex/memory/jaa-db.js').jaaDB; }
function hostOf(url) { try { return new URL(url).host.replace(/^www\./, ''); } catch (_) { return null; } }

const STOP = new Set('a an and the of to your you for in on at is are be please enter select choose required optional'.split(' '));
function words(s) { return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 1 && !STOP.has(w))); }
function sim(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / (A.size + B.size - n); }
// what a selector says about its target: input[name="email"] → "email"; #first_name → "first name"; text=Apply → "apply"
function selectorWords(sel) {
  return String(sel || '').replace(/nth-of-type\(\d+\)|:[a-z-]+\([^)]*\)/g, ' ').replace(/(text|label)=/g, ' ')
    .replace(/[#.[\]="'>:()*~^$|]/g, ' ').replace(/[-_]/g, ' ').replace(/\b(input|textarea|select|button|div|span|form|name|id|type|class)\b/g, ' ').trim();
}

/** observe({ url|host, action, selector, label, ok, error, healedFrom, agent }) */
function observe(o = {}) {
  const host = o.host || hostOf(o.url);
  if (!host || !o.action) return null;
  const row = { id: crypto.randomUUID(), host, url: o.url || null, action: o.action, selector: o.selector || null, label: o.label || null,
    ok: o.ok !== false, error: o.ok === false ? String(o.error || 'failed').slice(0, 300) : null, healedFrom: o.healedFrom || null,
    via: o.via || null, agent: o.agent || null, ts: Date.now() };
  try { jaa().insert(T.memory, row); } catch (e) { return null; }
  return row;
}

/** hintsFor(host) → { host, worked: [{label, selector, action, uses}], failing: [{selector, action, error, count}], healed: [...], flows: [...] } */
function hintsFor(host, { limit = 12 } = {}) {
  if (!host) return null;
  const rows = jaa().query(T.memory, r => r.host === host);
  if (!rows.length && !flows(host).length) return null;
  const worked = new Map(), failing = new Map();
  for (const r of rows) {
    if (r.ok && r.selector) {
      const k = `${r.label || ''}|${r.selector}`;
      const w = worked.get(k) || { label: r.label, selector: r.selector, action: r.action, uses: 0, last: 0 };
      w.uses++; w.last = Math.max(w.last, r.ts); worked.set(k, w);
    } else if (!r.ok && r.selector) {
      const f = failing.get(r.selector) || { selector: r.selector, action: r.action, error: r.error, count: 0, last: 0 };
      f.count++; f.last = Math.max(f.last, r.ts); failing.set(r.selector, f);
    }
  }
  // a selector that has since worked is not "failing"
  for (const w of worked.values()) { const f = failing.get(w.selector); if (f && w.last > f.last) failing.delete(w.selector); }
  return {
    host,
    worked: [...worked.values()].sort((a, b) => b.uses - a.uses || b.last - a.last).slice(0, limit).map(({ last, ...w }) => w),
    failing: [...failing.values()].sort((a, b) => b.count - a.count).slice(0, limit).map(({ last, ...f }) => f),
    healed: rows.filter(r => r.healedFrom && r.ok).slice(-limit).map(r => ({ from: r.healedFrom, to: r.selector, label: r.label, via: r.via })),
    flows: flows(host).slice(0, 6).map(f => ({ id: f.id, name: f.name, steps: f.steps.length, successes: f.successes })),
    observations: rows.length,
  };
}

/**
 * heal(step, page, { hints }) — PURE. → { selector, via, confidence } | null
 * step: { action, selector, label?, text? }   page: page/reader.js shape (fields, buttons, links)   hints: hintsFor()
 */
function heal(step = {}, page = {}, { hints = null } = {}) {
  if (!HEALABLE.has(step.action)) return null;
  const aim = step.label || step.text || selectorWords(step.selector);
  if (!String(aim || '').trim()) return null;
  // 1. a selector that worked on this host for the same label
  if (hints && step.label) {
    const w = (hints.worked || []).find(x => x.label && sim(x.label, step.label) >= 0.8 && x.selector !== step.selector);
    if (w) return { selector: w.selector, via: `learned on ${hints.host}: "${w.label}" → ${w.selector} (worked ${w.uses}×)`, confidence: 'high' };
  }
  // 2. the page's own field / button that best matches
  const isClick = step.action === 'click' || step.action === 'hover' || step.action === 'waitFor';
  const cands = [];
  for (const f of page.fields || []) {
    if (isClick && !['checkbox', 'radio'].includes(f.type)) continue;
    if (step.action === 'upload' && f.type !== 'file') continue;
    if (step.action === 'select' && f.type !== 'select') continue;
    const s = Math.max(sim(aim, f.label), sim(aim, f.name), sim(aim, f.question), sim(aim, f.id));
    if (s > 0) cands.push({ selector: f.selector, s, what: `field "${f.label || f.name}"` });
  }
  if (isClick) {
    for (const b of page.buttons || []) { const s = sim(aim, b.text); if (s > 0) cands.push({ selector: b.selector, s: s + 0.05, what: `button "${b.text}"` }); }
    for (const l of page.links || []) { const s = sim(aim, l.text); if (s > 0) cands.push({ selector: l.selector, s, what: `link "${l.text}"` }); }
  }
  cands.sort((a, b) => b.s - a.s);
  const best = cands[0];
  if (!best || best.s < 0.34 || best.selector === step.selector) return null;
  if (cands[1] && cands[1].s === best.s && cands[1].selector !== best.selector) return null;   // a tie is a guess — refuse
  return { selector: best.selector, via: `matched ${best.what} to "${String(aim).slice(0, 60)}" (${best.s.toFixed(2)})`, confidence: best.s >= 0.6 ? 'high' : 'medium' };
}

function _redact(steps) {
  return (steps || []).map(s => {
    const x = { ...s };
    for (const k of ['value', 'text']) if (x[k] !== undefined && (SECRET.test(String(x.selector || '')) || SECRET.test(String(x.label || '')))) x[k] = '{{password}}';
    delete x.timeoutMs;
    return x;
  });
}
const _flowKey = (host, steps) => crypto.createHash('sha1').update(host + '|' + JSON.stringify(steps.map(s => [s.action, s.selector || s.url || s.key || null]))).digest('hex').slice(0, 16);

/** recordFlow({ host|url, steps, name? }) — a sequence that fully worked. ≥3 steps; merged by shape; counted. */
function recordFlow({ host = null, url = null, steps = [], name = null, agent = null } = {}) {
  const h = host || hostOf(url);
  if (!h || !Array.isArray(steps) || steps.length < 3) return null;
  const clean = _redact(steps);
  const key = _flowKey(h, clean);
  const existing = jaa().get(T.flows, { key });
  if (existing) { jaa().update(T.flows, { id: existing.id }, { successes: (existing.successes || 1) + 1, lastOk: Date.now(), steps: clean }); return { ...existing, successes: (existing.successes || 1) + 1 }; }
  const first = steps.find(s => s.action === 'navigate');
  const row = { id: crypto.randomUUID(), key, host: h, name: name || `${h}: ${steps.length} steps${first ? ' from ' + String(first.url).replace(/^https?:\/\//, '').slice(0, 60) : ''}`,
    steps: clean, successes: 1, createdAt: Date.now(), lastOk: Date.now(), agent, promotedTo: null };
  jaa().insert(T.flows, row);
  return row;
}
function flows(host = null) { return jaa().query(T.flows, r => !host || r.host === host).sort((a, b) => (b.successes || 0) - (a.successes || 0) || (b.lastOk || 0) - (a.lastOk || 0)); }
function getFlow(id) { return jaa().get(T.flows, { id }) || jaa().query(T.flows, r => String(r.id).startsWith(String(id || '#')))[0] || null; }

/** toMacroSteps(flow) — the macro tool's step shape ({action, data}), or the first step that has no equivalent. */
function toMacroSteps(flow) {
  const map = { navigate: (s) => ({ action: 'navigate', data: { url: s.url } }), click: (s) => ({ action: 'click', data: { selector: s.selector } }),
    type: (s) => ({ action: 'type', data: { selector: s.selector, text: s.text || s.value || '' } }),
    setValue: (s) => ({ action: 'type', data: { selector: s.selector, text: s.value || s.text || '', clearFirst: true } }),
    waitFor: (s) => ({ action: 'wait_for', data: { selector: s.selector } }), wait: (s) => ({ action: 'wait', data: { ms: s.ms || 1000 } }),
    scroll: (s) => ({ action: 'scroll', data: { deltaY: s.deltaY || 400 } }), screenshot: () => ({ action: 'screenshot', data: {} }) };
  const out = [];
  for (let i = 0; i < flow.steps.length; i++) {
    const s = flow.steps[i]; const m = map[s.action];
    if (!m) return { ok: false, error: `step ${i} (${s.action}) has no macro equivalent — keep it as a learned flow (replay) or build a workflow with clear_glass_automation` };
    out.push(m(s));
  }
  return { ok: true, steps: out };
}

function forget({ host = null, flowId = null } = {}) {
  if (flowId) return { ok: jaa().delete(T.flows, { id: flowId }) > 0 };
  if (host) { const a = jaa().delete(T.memory, r => r.host === host); const b = jaa().delete(T.flows, r => r.host === host); return { ok: true, removed: a + b }; }
  return { ok: false, error: 'host or flowId required' };
}

function summary() {
  const rows = jaa().query(T.memory, () => true);
  const hosts = new Map();
  for (const r of rows) { const h = hosts.get(r.host) || { host: r.host, actions: 0, failed: 0, healed: 0, last: 0 }; h.actions++; if (!r.ok) h.failed++; if (r.healedFrom && r.ok) h.healed++; h.last = Math.max(h.last, r.ts); hosts.set(r.host, h); }
  return { hosts: [...hosts.values()].sort((a, b) => b.last - a.last), flows: flows().length, observations: rows.length };
}

module.exports = { MODULE_ID, VERSION, T, HEALABLE, NOT_FOUND, hostOf, observe, hintsFor, heal, recordFlow, flows, getFlow, toMacroSteps, forget, summary, selectorWords, sim };
