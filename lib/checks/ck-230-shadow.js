'use strict';
/**
 * lib/checks/ck-230-shadow.js — CK-230 "expected but absent" (cos/spec/check-catalogue.spec, family shadow).
 * component_id: nexus.lib.checks.ck-230-shadow
 *
 * Invariant: every step that declares what it will produce settles that declaration; an unsettled one is a gap.
 * Reads lib/shadow.js (declare / settle): a step's shadow
 *   - still open, past its age (condition.olderThanMs, default 0)      → fail, naming what it still expects
 *   - settled with something absent                                   → fail, naming the absences
 *   - settled with everything present                                 → pass
 *   - never declared                                                  → unverifiable (no shadow is no evidence)
 *
 *   run({ step, olderThanMs }, ctx) → { ok, verifiable, evidence, reason, items }
 */
const ID = 'CK-230';

function run(c = {}, { shadow = null } = {}) {
  const S = shadow || require('../shadow.js');
  const step = c.step || null;
  if (!step) return { ok: false, verifiable: false, reason: `unverifiable: ${ID} names no step ({ check: ${ID}, step })` };
  const open = S.open({ step, olderThanMs: Number(c.olderThanMs) || 0 });
  if (open.length) {
    const items = open.map(s => ({ shadowId: s.id, declaredAt: s.declaredAt, expects: s.expects }));
    const what = [].concat(...open.map(s => [...s.expects.files, ...s.expects.events, ...s.expects.fields])).slice(0, 8);
    return { ok: false, verifiable: true, items, reason: `${ID}: ${open.length} ${step} shadow(s) still open — expected ${what.join(', ') || 'its output'} and nothing settled it` };
  }
  const last = S.settled({ step, limit: 1 })[0];
  if (!last) return { ok: false, verifiable: false, reason: `unverifiable: no ${step} shadow was declared (nothing said what it would produce)` };
  const absent = [...(last.absent.files || []), ...(last.absent.events || []), ...(last.absent.fields || [])];
  if (!last.ok) return { ok: false, verifiable: true, items: absent.map(a => ({ absent: a })), reason: `${ID}: ${step} settled with ${absent.length} expected thing(s) absent — ${absent.slice(0, 8).join(', ')}` };
  return { ok: true, verifiable: true, evidence: { check: ID, step, shadowId: last.shadowId, settledAt: last.settledAt } };
}

module.exports = { ID, run };
