'use strict';
// ── lib/grammar-misfire-tracker.js ──────────────────────────────────────────
// UUID: nexus-grammar-misfire-tracker-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 31 — Grammar ↔ Intent: Structured Pre-Classification
//
// NOTE: docs/grammar-engine.spec and the phase roadmap both marked Phase 31
// "pending" in full. It wasn't — confidence scoring (_resolveConfidence in
// lib/grammar-engine.js), the >0.8 fast-path threshold, and the
// grammar.low_confidence_demoted event were all already built and wired
// into lib/request-handler.js's Phase B (confirmed by grep, not assumed).
// This file is the one real remaining gap: "case-library hit/miss rates
// feed back into grammar confidence weights. 3 misfires on same pattern →
// Idearium review." Nothing else in this phase needed building.
//
// §2.1 persistence — streaks survive a restart (JAA-backed, not in-memory
// only). §1.2 nothing silent — escalation is a real POST to idearium with
// a traceable ledger event, not a console.log.

const crypto = require('crypto');

const MODULE_ID  = 'grammar-misfire-tracker';
const VERSION    = '1.0.0';
const MISFIRE_THRESHOLD = 3;
const TABLE      = 'grammar_misfire_streaks';

let _jaa = null;
let _ideariumUrl = 'http://127.0.0.1:4800';

function init(jaaDB, opts = {}) {
  _jaa = jaaDB;
  if (opts.ideariumUrl) _ideariumUrl = opts.ideariumUrl;
  return { ok: true };
}

function _streakKey(componentId, matched) {
  // Pattern = which command resolved + what the matched prefix was — two
  // different low-confidence matches against the same componentId (e.g.
  // partial input vs a typo) are different patterns, tracked separately,
  // so one streak doesn't get padded by unrelated misfires.
  return `${componentId}::${matched}`;
}

function _getStreak(key) {
  if (!_jaa) return { count: 0 };
  try {
    const rows = _jaa.query(TABLE, r => r.key === key, 1);
    return rows[0] || { count: 0 };
  } catch (_) {
    return { count: 0 };
  }
}

function _writeStreak(key, count, componentId, matched) {
  if (!_jaa) return;
  try {
    const existing = _jaa.query(TABLE, r => r.key === key, 1)[0];
    if (existing) {
      _jaa.update(TABLE, existing.uuid, { ...existing, count, lastSeen: Date.now() });
    } else {
      _jaa.insert(TABLE, {
        uuid: crypto.randomUUID(), key, componentId, matched, count,
        firstSeen: Date.now(), lastSeen: Date.now(),
      });
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] streak write failed: ${e.message}`);
  }
}

function _resetStreak(key) {
  if (!_jaa) return;
  try {
    const existing = _jaa.query(TABLE, r => r.key === key, 1)[0];
    if (existing) _jaa.update(TABLE, existing.uuid, { ...existing, count: 0, lastSeen: Date.now() });
  } catch (_) { /* best-effort — a failed reset just means the next hit recomputes from a stale count, not silent data loss */ }
}

async function _escalateToIdearium(componentId, matched, count) {
  if (typeof globalThis.fetch !== 'function') {
    console.warn(`[${MODULE_ID}] no fetch available — cannot escalate to idearium, logging only`);
    return { ok: false, reason: 'no_fetch' };
  }
  try {
    const r = await globalThis.fetch(`${_ideariumUrl}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Grammar misfire review: "${matched}" resolved to ${componentId} below confidence threshold ${count} times in a row. Either the alias/grammar entry needs adjustment, or this input pattern needs its own component.`,
        tags: ['grammar-misfire', 'phase-31', componentId],
      }),
      signal: globalThis.AbortSignal ? globalThis.AbortSignal.timeout(5000) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, idea: d };
  } catch (e) {
    console.warn(`[${MODULE_ID}] idearium escalation failed: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

/**
 * Call this from request-handler.js's existing low-confidence demotion
 * branch — the one already writing grammar.low_confidence_demoted to
 * event_log. This does not replace that event write; it's an additional
 * call right next to it.
 */
async function recordMisfire({ componentId, matched, requestId }) {
  if (!componentId || !matched) {
    return { ok: false, error: 'componentId and matched are required' };
  }
  const key = _streakKey(componentId, matched);
  const prev = _getStreak(key);
  const count = (prev.count || 0) + 1;
  _writeStreak(key, count, componentId, matched);

  if (count < MISFIRE_THRESHOLD) {
    return { ok: true, count, escalated: false };
  }

  // Threshold hit — escalate, then reset so the next streak starts clean
  // rather than re-escalating on every subsequent low-confidence hit.
  const escalation = await _escalateToIdearium(componentId, matched, count);
  _resetStreak(key);

  try {
    _jaa?.insert('event_log', {
      uuid: crypto.randomUUID(), type: 'grammar.misfire_escalated', source: MODULE_ID,
      ts: Date.now(),
      payload: { requestId, componentId, matched, count, escalation },
    });
  } catch (_) { /* escalation already happened — a failed log write doesn't undo that */ }

  return { ok: true, count, escalated: true, escalation };
}

module.exports = { init, recordMisfire, MODULE_ID, VERSION, MISFIRE_THRESHOLD };
