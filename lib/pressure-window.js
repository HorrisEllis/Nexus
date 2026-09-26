'use strict';
/**
 * lib/pressure-window.js — "what led to this?" answered as a story.
 * comp_id: nexus.lib.pressure-window
 * UUID: nexus-pressure-window-v1-0000-2026-0818-001
 * Version: 1.0.0
 * spec: docs/pressure-causality.spec § P3
 *
 * §11.1 — a cause cannot be understood without the field it occurred in. Both
 * halves already exist in this system and were never joined at query time:
 * `event_log` and `component_ledger` hold what happened, CFR/RFR2/sigma hold
 * the field it happened in, and `bep_patterns` holds what the intelligence
 * layer already worked out. Nothing asked them the same question at once.
 *
 * §10.2 — this is a PROJECTION. It writes nothing, ever. Every row comes from
 * its existing write authority (§10.1).
 *
 * §16.2 — the acceptance test is that the output reads like a story. Not a bag
 * of rows with a timestamp column. If a person cannot follow it top to bottom
 * and say "ah, that's why", this module has failed even if every field is
 * correct.
 *
 * §0.1 — and the story states its own blind spots. A narrator that renders
 * partial data as a confident account is worse than no narrator, because it is
 * believed. Every section that could not be filled says so, by name, with the
 * gap id from the spec.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const VERSION   = '1.0.0';
const MODULE_ID = 'nexus.lib.pressure-window';
const DEFAULT_WINDOW_MS = 120000;

/** Event types that ARE a pressure or death moment — the things worth explaining. */
const ANCHOR_TYPES = Object.freeze([
  'nexus.resource.pressure',
  'nexus.process.exited',
  'autopilot.spawn_gate_failed',
]);

/** Noise. High-volume bookkeeping that drowns a 120s window without explaining anything. */
const NOISE_TYPES = Object.freeze([
  'component.registered', 'component.updated',
  'ledger.cortex.updated', 'ledger.idearium.updated',
]);

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

function _rows(jaa, table, limit = 5000) {
  try { return jaa.query(table, () => true, limit) || []; } catch (_) { return []; }
}

/** §3.2 — eventTs is the ordering axis. Wall clock is display metadata only. */
function _eventTs(row) {
  const t = row.eventTs != null ? row.eventTs : row.ts;
  return typeof t === 'number' ? t : (t ? Date.parse(t) : 0);
}

function _hhmmss(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function _pct(n) { return n == null ? null : `${Number(n).toFixed(1)}%`; }

/**
 * anchors(opts) — the moments worth explaining, newest first.
 * A caller that does not know an event id needs somewhere to start.
 */
function anchors(opts = {}) {
  const jaa = _jaa();
  if (!jaa) return [];
  return _rows(jaa, 'event_log')
    .filter(r => ANCHOR_TYPES.includes(r.type) || (r.payload && r.payload.level === 'critical'))
    .sort((a, b) => _eventTs(b) - _eventTs(a))
    .slice(0, opts.limit || 20)
    .map(r => ({
      id: r.uuid || r.id,
      ts: _eventTs(r),
      type: r.type,
      level: (r.payload && r.payload.level) || null,
      summary: _anchorSummary(r),
    }));
}

function _anchorSummary(r) {
  const p = r.payload || {};
  if (r.type === 'nexus.process.exited') return `${p.service || 'a service'} exited ${p.code != null ? p.code : '?'}`;
  if (Array.isArray(p.reasons) && p.reasons.length) return p.reasons[0];
  if (p.freeMemPct != null) return `free memory ${p.freeMemPct}%`;
  return r.type;
}

/**
 * explain(opts) — the window, assembled.
 *
 * @param {object} opts
 * @param {string} [opts.eventId]  anchor event uuid; defaults to the most recent anchor
 * @param {number} [opts.ts]       explain around a raw timestamp instead
 * @param {number} [opts.windowMs] how far back to look (default 120000)
 * @returns {object} a structured account — see render() for the readable form
 */
function explain(opts = {}) {
  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'cortex unavailable — nothing to read' };

  const events = _rows(jaa, 'event_log');
  if (!events.length) return { ok: false, reason: 'event_log is empty — there is nothing to explain, and that is the answer' };

  let anchor = null;
  if (opts.eventId) anchor = events.find(r => (r.uuid || r.id) === opts.eventId) || null;
  else if (opts.ts) anchor = { ts: opts.ts, type: '(timestamp)', payload: {} };
  else {
    const a = events.filter(r => ANCHOR_TYPES.includes(r.type)).sort((x, y) => _eventTs(y) - _eventTs(x));
    anchor = a[0] || null;
  }
  if (!anchor) {
    // §1.2 — "no pressure event exists" is a real, useful answer. It is not the
    // same as "here is a story about nothing", and must never render as one.
    return { ok: false, reason: 'no pressure or exit event found in event_log — nothing has gone wrong that the causal record knows about', anchors: [] };
  }

  const windowMs = opts.windowMs || DEFAULT_WINDOW_MS;
  const at    = _eventTs(anchor);
  const from  = at - windowMs;
  const gaps  = [];

  // ── what happened, in eventTs order (§3.2) ────────────────────────────────
  // The anchor is excluded from its own timeline — "the seconds before it"
  // means before it. Listing the event as a precursor to itself is the kind of
  // small dishonesty that makes a narrator untrustworthy at scale.
  const anchorId = anchor.uuid || anchor.id || null;
  const inWindow = events
    .filter(r => { const t = _eventTs(r); return t >= from && t <= at; })
    .filter(r => !anchorId || (r.uuid || r.id) !== anchorId)
    .sort((a, b) => _eventTs(a) - _eventTs(b));

  const timeline = inWindow
    .filter(r => !NOISE_TYPES.includes(r.type))
    .map(r => ({ ts: _eventTs(r), at: _hhmmss(_eventTs(r)), type: r.type, source: r.source || null, detail: _anchorSummary(r) }));

  const suppressed = inWindow.length - timeline.length;

  // ── who held the memory ───────────────────────────────────────────────────
  // autopilot.js:659 already computes real per-pid attribution and attaches it
  // to autopilot.instance_snapshot — NOT to the pressure event. So the holders
  // must be fetched from the nearest snapshot rather than from the anchor,
  // which is the join this module exists to make.
  const snaps = events
    .filter(r => r.type === 'autopilot.instance_snapshot' && _eventTs(r) <= at && _eventTs(r) >= from - windowMs)
    .sort((a, b) => _eventTs(b) - _eventTs(a));
  let holders = null, holdersFrom = null;
  if (snaps.length) {
    const p = snaps[0].payload || {};
    holdersFrom = _eventTs(snaps[0]);
    const per = p.perSystemMemMB;
    if (per && Object.keys(per).length) {
      holders = Object.entries(per).sort((a, b) => b[1] - a[1]).map(([system, mb]) => ({ system, mb }));
    } else {
      // §PC-INV-1 — unavailable is not empty. An empty object here means the OS
      // query returned nothing, which on Windows 11 may mean `wmic` is simply
      // gone. Stated as a suspicion, not a finding — it has not been checked.
      gaps.push('holders: the nearest snapshot carries no per-system memory. autopilot.js:659 ran and produced nothing — on Windows 11 `wmic` may no longer be present. UNVERIFIED; check before trusting any attribution here.');
    }
  } else {
    gaps.push('holders: no autopilot.instance_snapshot within reach of this window, so nothing attributes the memory.');
  }
  if (!ANCHOR_TYPES.includes(anchor.type) || anchor.type === 'nexus.resource.pressure') {
    if (!(anchor.payload && anchor.payload.holders)) {
      gaps.push('holders: the pressure event itself carries no attribution (PC-GAP-3). Attribution exists at autopilot.js:659 and is written to a different event.');
    }
  }

  // ── the field it happened in (§11.1) ──────────────────────────────────────
  const field = { regime: null, friction: null, sigma: null, rfr2: null };
  // The anchor's OWN field conditions come first — §11.1 is specifically about
  // the conditions at the moment of the event, not merely nearby ones. Window
  // events are the fallback when the event itself carried none.
  for (const r of [anchor, ...inWindow.slice().reverse()]) {
    const p = r.payload || {};
    if (field.regime == null && (p.regime || p.cfr)) { field.regime = p.regime || (p.cfr && p.cfr.regime) || null; field.friction = p.friction != null ? p.friction : (p.cfr && p.cfr.friction); }
    if (field.rfr2 == null && p.rfr2) field.rfr2 = p.rfr2;
  }
  const sigmaRows = _rows(jaa, 'sigma_records')
    .filter(r => { const t = _eventTs(r); return t >= from && t <= at; })
    .sort((a, b) => _eventTs(b) - _eventTs(a));
  if (sigmaRows.length) field.sigma = sigmaRows[0].score != null ? sigmaRows[0].score : (sigmaRows[0].sigma || null);
  else gaps.push('field: no sigma record inside the window.');
  if (field.regime == null) gaps.push('field: no CFR regime recorded on any event in the window (§11.1 — the event without its field conditions is an incomplete causal record).');

  // ── what the intelligence layer already knew ──────────────────────────────
  // This is the part that matters most and cost nothing: the pattern engine has
  // usually already named the cause, forward, before anyone asked backwards.
  const typesSeen = new Set(inWindow.map(r => r.type));
  const anchorKey = anchor.type;
  // §CAUGHT BY RUNNING IT 2026-08-18 — this first matched on the dotted event
  // type, and found nothing against real rows. The crystalliser writes human
  // phrasing: "nexus: resource pressure", not "nexus.resource.pressure". A
  // matcher tuned to the wrong dialect reports "nothing crystallised" for the
  // one section that carries the most value, and that reads as an absence of
  // knowledge rather than an absence of matching. Now the type is reduced to
  // its distinctive words and all of them must appear, in any punctuation.
  const anchorWords = anchorKey.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && w !== 'nexus');
  const known = _rows(jaa, 'bep_patterns')
    .filter(p => {
      if (!anchorWords.length) return false;
      const blob = JSON.stringify(p).toLowerCase();
      return anchorWords.every(w => blob.includes(w));
    })
    .slice(0, 8)
    .map(p => ({
      description: p.description || p.pattern || p.summary || p.type || '(unnamed pattern)',
      confidence:  p.confidence != null ? p.confidence : null,
      observed:    p.count != null ? p.count : (p.observed || null),
      crystallisedAt: _eventTs(p) || null,
      inWindow: typesSeen.size > 0,
    }));
  if (!known.length) gaps.push('prior knowledge: no crystallised pattern mentions this anchor. Either the intelligence layer has not seen enough of these yet, or the pattern is stored under a name this query does not match.');

  return {
    ok: true,
    version: VERSION,
    anchor: {
      id: anchor.uuid || anchor.id || null,
      ts: at,
      at: _hhmmss(at),
      type: anchor.type,
      level: (anchor.payload && anchor.payload.level) || null,
      reasons: (anchor.payload && anchor.payload.reasons) || [],
      summary: _anchorSummary(anchor),
    },
    window: { ms: windowMs, from, to: at, events: inWindow.length, shown: timeline.length, suppressed },
    timeline,
    holders,
    holdersFrom,
    field,
    known,
    gaps,           // §0.1 — what this answer does NOT know, by name
  };
}

/**
 * render(result) — the story, for a human.
 *
 * §16.2 — "debugging a healthy system should resemble reading a story." This is
 * that sentence made executable. The last section is not decoration: an account
 * that hides its own holes gets believed in exactly the places it is weakest.
 */
function render(result) {
  if (!result || !result.ok) return `Nothing to explain — ${result ? result.reason : 'no result'}`;
  const L = [];
  const bar = '─'.repeat(64);

  L.push(bar);
  L.push(`WHAT HAPPENED   ${result.anchor.at}   ${result.anchor.type}${result.anchor.level ? '  ·  ' + result.anchor.level : ''}`);
  L.push(bar);
  L.push('');
  L.push(`  ${result.anchor.summary}`);
  for (const r of result.anchor.reasons.slice(1)) L.push(`  ${r}`);
  L.push('');

  L.push(`THE ${Math.round(result.window.ms / 1000)} SECONDS BEFORE IT`);
  if (!result.timeline.length) {
    L.push('  nothing else is recorded in this window — which is itself worth knowing');
  } else {
    for (const e of result.timeline.slice(-24)) {
      L.push(`  ${e.at}  ${String(e.type).padEnd(34)} ${e.detail !== e.type ? e.detail : ''}`.trimEnd());
    }
    if (result.window.suppressed) L.push(`  … ${result.window.suppressed} routine bookkeeping events hidden`);
  }
  L.push('');

  L.push('WHO HELD THE MEMORY');
  if (result.holders && result.holders.length) {
    L.push(`  as of ${_hhmmss(result.holdersFrom)}`);
    for (const h of result.holders.slice(0, 8)) L.push(`  ${String(h.system).padEnd(20)} ${String(h.mb).padStart(6)} MB`);
  } else {
    L.push('  not recorded — see WHAT THIS ANSWER DOES NOT KNOW');
  }
  L.push('');

  L.push('THE FIELD IT HAPPENED IN');
  L.push(`  CFR regime   ${result.field.regime || '—'}${result.field.friction != null ? `   friction ${Number(result.field.friction).toFixed(4)}` : ''}`);
  L.push(`  sigma        ${result.field.sigma != null ? result.field.sigma : '—'}`);
  L.push(`  RFR2         ${result.field.rfr2 ? JSON.stringify(result.field.rfr2) : '—'}`);
  L.push('');

  L.push('WHAT THE SYSTEM ALREADY KNEW');
  if (result.known.length) {
    for (const k of result.known) {
      const conf = k.confidence != null ? ` (${Math.round(k.confidence * 100)}%${k.observed ? `, ${k.observed}×` : ''})` : '';
      L.push(`  · ${k.description}${conf}`);
    }
  } else {
    L.push('  nothing crystallised that mentions this event');
  }
  L.push('');

  L.push('WHAT THIS ANSWER DOES NOT KNOW');
  if (!result.gaps.length) L.push('  nothing — every section was filled from real data');
  else for (const g of result.gaps) L.push(`  · ${g}`);
  L.push(bar);
  return L.join('\n');
}

module.exports = { explain, render, anchors, ANCHOR_TYPES, NOISE_TYPES, DEFAULT_WINDOW_MS, MODULE_ID, VERSION };
