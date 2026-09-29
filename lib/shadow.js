'use strict';
/**
 * lib/shadow.js — shadow and negative-space reasoning for build steps (0.39.282, N22 of
 * docs/2026-09-29-nex-node-store-phasemap.spec).
 *
 * James, 2026-09-29: "What about using shadow and negative space reasoning?"
 *
 * SHADOW: before a step runs it DECLARES what must exist afterwards — the files the plan names, the events it will
 * emit, the fields of what it writes. NEGATIVE SPACE: when the step settles, the difference between the shadow and
 * what actually exists is read as data. The planned file that never came back, the event that stayed silent, the
 * field that is missing: each ABSENCE becomes
 *   - a gap (lib/gap-field.js, type absent.<step>.<kind>) — traceable, deduped, the road into self-heal, and
 *   - a liminal-space item at L1/L3 (intelligence/liminal-space: "where shadow connections meet causal tracing"),
 *     so intelligence reasons over what did NOT happen as well as what did.
 * A settle also emits shadow.settled on nexus-bus, with what was present, what was absent and what came extra.
 *
 * A shadow is working memory until it settles (I0): only its findings persist, as nodes of the stores above.
 *
 *   declare({ step, expects: { files, events, fields }, subject, causedBy }) -> shadow
 *   settle(shadowOrId, { files, events, fields }) -> { ok, present, absent, extra, gaps }
 *   drop(shadowOrId) — the step failed outright (its failure is already recorded): no absences reported
 *   eventsSince(types, ts) -> the expected event types seen on nexus-bus since ts (for expects.events)
 */
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.shadow';
const VERSION = '1.0.0';
const _open = new Map();   // working memory: declared, not yet settled

function _bus() { try { return require('../nexus/nexus-bus.js'); } catch (_) { return null; } }
function _norm(p) { return String(p || '').replace(/\\/g, '/').replace(/^\.\//, ''); }

/** declare(...) -> { id, step, expects, subject, causedBy, declaredAt } */
function declare({ step, expects = {}, subject = null, causedBy = null } = {}) {
  if (!step) throw new Error('shadow.declare: step is required');
  const shadow = {
    id: crypto.randomUUID(), step, subject, causedBy, declaredAt: Date.now(),
    expects: {
      files: [...new Set((expects.files || []).map(_norm).filter(Boolean))],
      events: [...new Set((expects.events || []).filter(Boolean))],
      fields: [...new Set((expects.fields || []).filter(Boolean))],
    },
  };
  _open.set(shadow.id, shadow);
  const bus = _bus();
  try { if (bus) bus.emit('shadow.declared', { shadowId: shadow.id, step, expects: shadow.expects, subject }, { source: MODULE_ID, causedBy }); } catch (_) {}
  return shadow;
}

/** eventsSince(types, sinceTs) -> the subset of types seen on nexus-bus (its history ring) since sinceTs */
function eventsSince(types = [], sinceTs = 0) {
  const bus = _bus();
  const hist = (bus && Array.isArray(bus._history)) ? bus._history : [];
  const seen = new Set(hist.filter(e => e && e.ts >= sinceTs).map(e => e.type));
  return types.filter(t => seen.has(t));
}

function _report(shadow, kind, name) {
  const out = { kind, name, gapId: null, liminal: null };
  const text = `${shadow.step}: expected ${kind.replace(/s$/, '')} ${name} is absent${shadow.subject ? ` (${typeof shadow.subject === 'string' ? shadow.subject : JSON.stringify(shadow.subject).slice(0, 120)})` : ''}`;
  try {
    const g = require('./gap-field.js').report({
      type: `absent.${shadow.step}.${kind}`, source: MODULE_ID, domain: 'build', severity: 'medium', component: shadow.step,
      location: kind === 'files' ? name : null, body: text,
      meta: { shadowId: shadow.id, expected: name, kind, causedBy: shadow.causedBy, subject: shadow.subject },
    });
    out.gapId = g && g.gap ? (g.gap.id || g.gap.uuid || null) : null;
  } catch (_) { /* gap field unavailable: the absence is still returned and emitted */ }
  try {
    const h = require('../intelligence/liminal-space/index.js').hold('L1/L3',
      { text, type: 'absent', confidence: 0.5, causedBy: shadow.id, meta: { step: shadow.step, kind, expected: name } }, MODULE_ID);
    out.liminal = h && h.ok ? h.record.uuid : null;
  } catch (_) { /* liminal space unavailable in this process */ }
  return out;
}

/**
 * settle(shadowOrId, actual) — compare the shadow with what exists.
 * actual.files: paths written/staged/proposed; actual.events: event types seen (default: nexus-bus since declare);
 * actual.fields: field names present on what was written.
 */
function settle(shadowOrId, actual = {}) {
  const shadow = typeof shadowOrId === 'string' ? _open.get(shadowOrId) : shadowOrId;
  if (!shadow) return { ok: false, error: 'no open shadow with that id (settled already, or never declared)' };
  _open.delete(shadow.id);
  const have = {
    files: new Set((actual.files || []).map(_norm)),
    events: new Set(actual.events || eventsSince(shadow.expects.events, shadow.declaredAt)),
    fields: new Set(actual.fields || []),
  };
  const present = { files: [], events: [], fields: [] }, absent = { files: [], events: [], fields: [] };
  for (const kind of ['files', 'events', 'fields'])
    for (const x of shadow.expects[kind]) (have[kind].has(x) ? present : absent)[kind].push(x);
  const extra = { files: [...have.files].filter(f => !shadow.expects.files.includes(f)) };
  const gaps = [];
  for (const kind of ['files', 'events', 'fields']) for (const x of absent[kind]) gaps.push(_report(shadow, kind, x));
  const nAbsent = absent.files.length + absent.events.length + absent.fields.length;
  const result = { ok: nAbsent === 0, shadowId: shadow.id, step: shadow.step, present, absent, extra, gaps, settledAt: Date.now() };
  const bus = _bus();
  try { if (bus) bus.emit('shadow.settled', { shadowId: shadow.id, step: shadow.step, present, absent, extra, subject: shadow.subject }, { source: MODULE_ID, causedBy: shadow.causedBy }); } catch (_) {}
  if (nAbsent) console.warn(`[shadow] ${shadow.step}: ${nAbsent} expected thing(s) absent — ${[...absent.files, ...absent.events, ...absent.fields].join(', ').slice(0, 200)}`);
  return result;
}

/** drop(shadowOrId) — the step failed outright; its failure is already recorded, so no absences are reported for it */
function drop(shadowOrId) { const id = typeof shadowOrId === 'string' ? shadowOrId : shadowOrId && shadowOrId.id; return _open.delete(id); }

function open() { return [..._open.values()]; }

module.exports = { MODULE_ID, VERSION, declare, settle, drop, eventsSince, open };
