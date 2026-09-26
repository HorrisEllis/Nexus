'use strict';
/**
 * lib/nerve-gap-bridge.js — R8: nerve's real CFR field state, wired to gap-field
 * UUID: nexus-nerve-gap-bridge-v1-0000-2026-0812-001
 *
 * docs/repair-contract-and-loom-hub-phasemap.spec R8. James: "co-pilot
 * should be able to use clear-glass to understand where the user is
 * accessing the system and what isn't working when interacting using
 * nerve and the gated interactions."
 *
 * Checked before building: lib/nerve/index.js is real, already computes a
 * global CFR field (sigma/coherence/friction/entropy) and exposes it via
 * getSnapshot()/onChange(fn) — a real subscription hook, not polling. Its
 * snapshot.stresses array is non-empty exactly when _field.stressCount > 0,
 * a real, meaningful "something's elevated" signal, not invented here.
 *
 * §8.6 — reuses onChange() as-is, reuses gap-field.report() as-is. This
 * file is the wire between two things that already existed and had never
 * spoken to each other, not a new detection mechanism.
 */

let _unsubscribe = null;
let _lastReportedAt = 0;
const MIN_REPORT_INTERVAL_MS = 30000;   // real stress can persist across many snapshot ticks — don't spam a gap per tick

function wireNerveToGapField(opts = {}) {
  const nerve = opts.nerve || require('./nerve/index');
  const gapField = opts.gapField || require('./gap-field');

  if (_unsubscribe) return { ok: true, alreadyWired: true };

  _unsubscribe = nerve.onChange((snapshot) => {
    if (!snapshot || !snapshot.stresses || snapshot.stresses.length === 0) return;
    const now = Date.now();
    if (now - _lastReportedAt < MIN_REPORT_INTERVAL_MS) return;
    _lastReportedAt = now;

    const strongest = snapshot.stresses.reduce((a, b) => (b.strength > (a?.strength || 0) ? b : a), null);
    try {
      gapField.report({
        type: 'nerve.field-stress',
        body: `CFR field showing real elevated stress across ${snapshot.nodes.length} node(s) — strength ${strongest?.strength}`,
        source: 'nerve', domain: 'system',
        severity: strongest && strongest.strength > 300 ? 'high' : 'medium',
        systemsInvolved: snapshot.nodes.map(n => n.system).filter((v, i, a) => a.indexOf(v) === i),
        meta: { nodeCount: snapshot.nodes.length, stresses: snapshot.stresses, ts: snapshot.ts },
      });
    } catch (_) { /* §1.2 — a gap-report failure must never break nerve's own rendering/polling */ }
  });

  return { ok: true, alreadyWired: false };
}

function unwire() {
  if (_unsubscribe) { try { _unsubscribe(); } catch (_) {} _unsubscribe = null; }
}

function _resetForTest() { unwire(); _lastReportedAt = 0; }

module.exports = { wireNerveToGapField, unwire, _resetForTest, MODULE_ID: 'nerve-gap-bridge', VERSION: '1.0.0' };
