'use strict';
/**
 * lib/gap-field.js — the single agnostic gap-reporting entry point (§P3 fix)
 * UUID: nexus-gap-field-v1-0000-2026-0809-001
 *
 * James: "gap-finder and diagnostic-causal both do gap-detection, live,
 * unreconciled. Merge gap-finder's sigma source INTO diagnostic-causal, keep
 * one output. Needs to stay agnostic. Gap field. This is also for modeling
 * me. Reducing ambiguity."
 *
 * ── WHAT WAS ACTUALLY FOUND, checking before building (same discipline
 * kernel-surface.js's header insists on) ──────────────────────────────────
 * P3 of nexus-live-mind-phasemap.spec (marked DONE 2026-08-07) built
 * lib/diagnostic-causal.js — but diagnoseDeep(findings) takes findings as a
 * PARAMETER; its one live caller (copilot/lib/nexus-awareness.js) defaults
 * to `opts.findings || []`. It was never wired to read real gaps at all.
 * Meanwhile THREE independent things write to the 'gaps' table, none aware
 * of each other:
 *   cortex/gap-finder     — system anomaly.detected + sigma.event.* → gap.
 *                           Deduped (dedup_key, occurrence bump), causal
 *                           wire (causedBy) already correct. Good logic —
 *                           kept, just extracted here instead of duplicated.
 *   user-model.checkContradictions — conflicting high-confidence hypotheses
 *                           about James → gap. This is "modeling me" — and
 *                           it had NO dedup check at all: every call that
 *                           found the same contradiction would insert a
 *                           fresh row. Real bug, found while unifying, fixed
 *                           for free by routing through the same path.
 *   diagnostic-causal      — explains a gap's causal conditions (RFR2), but
 *                           was never handed either of the above's output.
 *
 * ── THE AGNOSTIC PART ──────────────────────────────────────────────────────
 * report()'s shape doesn't know or care whether a gap came from system
 * telemetry or from the user model — `domain` is just a tag on an otherwise
 * identical record, same dedup/occurrence/causal-wire treatment either way.
 * That's the literal ask: system gaps and "gaps in understanding James" are
 * the same kind of object — unresolved ambiguity, worth tracing to its
 * conditions the same way regardless of what produced it.
 */

const { jaaDB, uid } = require('../cortex/memory/jaa-db');

const MODULE_ID = 'gap-field';
const VERSION = '1.0.0';
const TABLE = 'gaps';

function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }

function _dedupKey(type, source, domain) {
  return `${domain || 'system'}::${type}::${source || 'unknown'}`;
}

function _existingOpen(dedupKey) {
  const rows = jaaDB.query(TABLE, r => r.dedup_key === dedupKey && r.status === 'open', 1);
  return rows[0] || null;
}

/**
 * report({ type, body, source, domain, severity, meta, requested, received,
 *          systemsInvolved, location, error, resourceState }) — the one
 * entry point for any producer. domain is agnostic: 'system' (default) |
 * 'user-model' | any future domain — nothing here branches on it, it's a
 * tag for querying. meta.causedBy / meta.anomalyUuid / meta.sigmaUuid become
 * the causal parent (ported logic from gap-finder, §16.5 — not re-derived).
 *
 * §R1 2026-08-12 — docs/repair-contract-and-loom-hub-phasemap.spec's
 * repair_contract_schema, James's own words: "what was requested, what was
 * received, what the friction is and why, systems involved, resource
 * state, location, error." ALL FIVE new fields are OPTIONAL and additive —
 * every existing caller (gap-finder, user-model, intent-classifier, the
 * diagnostic kernel, autonomy-router) keeps working with zero changes,
 * verified by the untouched original test suite still passing. `why` is
 * deliberately NOT populated here — see explainWhy() below — a causal
 * trace is real work that shouldn't run on every single report() call,
 * only when something actually needs to explain a gap (§0.5 — complexity
 * earns its existence). `resourceState` IS auto-populated when not given
 * explicitly, because it's cheap (a local OS read, no external call) and
 * "what was the machine doing when this happened" is exactly the kind of
 * thing that's useless to reconstruct after the fact.
 */
function _autoResourceState() {
  try {
    const { sample, classify } = require('./resource-monitor');
    const s = sample();
    return { ...s, pressure: classify(s) };
  } catch (_) { return null; }
}

function report({ type, body, source, domain = 'system', severity = 'medium', meta = {},
                   requested = null, received = null, systemsInvolved = null,
                   location = null, error = null, resourceState, component = null } = {}) {
  if (!type) return { created: false, gap: null, reason: 'type required' };
  const dedup_key = _dedupKey(type, source, domain);
  const existing = _existingOpen(dedup_key);
  if (existing) {
    const bumped = { ...existing, occurrences: (existing.occurrences || 1) + 1, lastSeenAt: Date.now() };
    // §PRIORITY 2026-08-17 — James: "add anything that's ever a gap into
    // the diagnostic system, priority factored in." Recomputed on every
    // real bump, not just at creation — a gap firing repeatedly is itself
    // real evidence its priority may have changed (more real occurrences
    // feed gap-priority's own tension read once real events exist).
    // Additive: existing.priority is simply absent for gaps written by
    // any of the 6 real pre-existing callers until they next bump/re-fire,
    // nothing breaks for them in the meantime.
    try {
      const gp = require('./gap-priority.js');
      bumped.priority = gp.score({ system: existing.source, filePath: existing.location, componentId: existing.component, severity: existing.severity }).composite;
    } catch (_) { /* priority scoring unavailable — the gap itself still writes correctly, §1.2 non-blocking */ }
    try { jaaDB.update(TABLE, { id: existing.id }, { occurrences: bumped.occurrences, lastSeenAt: bumped.lastSeenAt, priority: bumped.priority }); }
    catch (e) { console.warn(`[${MODULE_ID}] occurrence bump failed: ${e.message}`); }
    // Return the bumped view, not the stale pre-update snapshot — the DB
    // write was always correct (verified), only this function's return
    // value lagged it, found while writing this file's own test suite.
    return { created: false, gap: bumped };
  }

  const causedBy = meta.causedBy || meta.anomalyUuid || meta.sigmaUuid || null;
  const gap = {
    uuid: uid(), type, domain, body, source, severity, status: 'open',
    causedBy, dedup_key, occurrences: 1, detectedAt: Date.now(), lastSeenAt: Date.now(),
    meta,
    // §R1 repair contract schema — additive, every field optional, none
    // required for backward compatibility with the 6 real existing callers.
    requested, received,
    systemsInvolved: systemsInvolved || (source ? [source] : []),
    location, error,
    resourceState: resourceState !== undefined ? resourceState : _autoResourceState(),
    why: null,
    // §GRANULARITY 2026-08-13 — same additive pattern as the R1 fields
    // above: optional, defaults to null, every existing caller (6 real
    // ones, verified by the untouched original test suite still passing)
    // keeps working with zero changes. `source` has always been the
    // SYSTEM; `component` is the specific thing inside that system loom's
    // registry actually knows about — "each system should log components
    // in the error log" made a first-class field instead of something a
    // caller has to remember to stuff into `meta`.
    component,
    // §PRIORITY 2026-08-17 — real, composite, bottom-up/architecture-first
    // score from lib/gap-priority.js, reusing this gap's own real
    // source/location/component/severity fields, not new inputs a caller
    // has to supply. Additive: absent (undefined, not a fabricated 0) if
    // scoring itself fails for any reason — never blocks the real write.
    priority: (() => {
      try { return require('./gap-priority.js').score({ system: source, filePath: location, componentId: component, severity }).composite; }
      catch (_) { return undefined; }
    })(),
  };
  let stored;
  try { stored = jaaDB.insert(TABLE, gap); }
  catch (e) { console.warn(`[${MODULE_ID}] gap write failed: ${e.message}`); return { created: false, gap: null }; }

  if (_fanin()) { try { _fanin().emit({ type: 'gap-field.found', domain: gap.domain, gapType: gap.type, severity: gap.severity, source: gap.source, uuid: gap.uuid, ts: Date.now() }); } catch (_) {} }
  return { created: true, gap: stored || gap };
}

/** openGaps(opts) — every open gap, optionally filtered by domain. Most
 * recently seen first — a diagnostic surfacing 100 gaps should show what's
 * CURRENT, not an arbitrary slice of whatever the store returns first. */
function openGaps(opts = {}) {
  const rows = jaaDB.query(TABLE, r => {
    if (r.status !== 'open') return false;
    if (!opts.domain) return true;
    // §found 2026-08-09 — pre-gap-field rows (autopilot's kernel_circuit_open,
    // 99 of them found live in this store; also CONSTITUTIONAL/intent.low_confidence)
    // have no domain field at all — treating that as invisible to a domain-
    // scoped query would silently lose real historical data, not just old test
    // rows. Untagged is 'system' by construction: every writer that predates
    // this file wrote system-level findings; nothing untagged is user-model.
    return (r.domain || 'system') === opts.domain;
  }, 10000) || [];
  return rows.sort((a, b) => (b.lastSeenAt || b.detectedAt || 0) - (a.lastSeenAt || a.detectedAt || 0)).slice(0, opts.limit || 100);
}

/**
 * asFindings(opts) — open gaps reshaped into the {type, system, severity,
 * uuid} finding shape lib/diagnostic-causal.explainFinding/diagnoseDeep
 * already expects — the actual wire that closes the loop (see that file's
 * default-findings fix, same commit).
 */
function asFindings(opts = {}) {
  return openGaps(opts).map(g => ({ type: g.type, system: g.source, severity: g.severity, uuid: g.uuid, domain: g.domain, entry: g }));
}

/**
 * explainWhy(gapUuid, opts) — populate a gap's `why` field via
 * diagnostic-causal.explainFinding() (RFR2 causality.traceToRoot +
 * sigma.classify), ON DEMAND — not run automatically on every report(),
 * only when something (R3's repair trigger, or a person) actually needs
 * to know why a specific gap happened. Reuses asFindings()'s exact shape
 * (type/system/severity/uuid/entry) so explainFinding() gets what it
 * already expects, not a re-derived one.
 */
async function explainWhy(gapUuid, opts = {}) {
  const gaps = openGaps({ limit: 10000 });
  const gap = gaps.find(g => g.uuid === gapUuid);
  if (!gap) return { ok: false, reason: 'gap not found' };

  const finding = { type: gap.type, system: gap.source, severity: gap.severity, uuid: gap.uuid, entry: gap };
  let explanation;
  try {
    const dc = opts.diagnosticCausal || require('./diagnostic-causal');
    explanation = await dc.explainFinding(finding, opts);
  } catch (e) {
    explanation = { available: false, reason: `explainFinding threw: ${e.message}` };
  }

  try { if (gap.id) jaaDB.update(TABLE, { id: gap.id }, { why: explanation }); }
  catch (e) { console.warn(`[${MODULE_ID}] why-persist failed: ${e.message}`); }

  return { ok: true, why: explanation };
}

/**
 * logFix({system, location, description, component, severity}) — James,
 * direct: "everytime you fix something, find an error, etc. add it to
 * the diagnostic system... expand each other as you work." No close()
 * existed anywhere in this file before this — a real, honest gap in
 * what was built earlier, not filled with a guess: gaps could be
 * created and bumped, never explicitly resolved. This writes a real gap
 * record, immediately closed, with the fix itself as first-class data —
 * same table, same real priority scoring (so "what got fixed and how
 * important was it" is queryable the exact same way open gaps are, not
 * a second, disconnected log).
 */
function logFix({ system, location = null, description, component = null, severity = 'medium', meta = {} } = {}) {
  if (!description) return { created: false, reason: 'description required' };
  let priority;
  try { priority = require('./gap-priority.js').score({ system, filePath: location, componentId: component, severity }).composite; }
  catch (_) { priority = undefined; }
  const record = {
    uuid: uid(), type: 'fix-log', domain: 'system', body: description, source: system,
    severity, status: 'closed', causedBy: null,
    dedup_key: `fix::${system}::${Date.now()}`, // fixes are events, not dedup'd against each other like open gaps
    occurrences: 1, detectedAt: Date.now(), lastSeenAt: Date.now(), resolvedAt: Date.now(),
    meta, location, error: null, resourceState: _autoResourceState(), why: null, component,
    priority, fix: description,
  };
  try { const stored = jaaDB.insert(TABLE, record); return { created: true, gap: stored || record }; }
  catch (e) { console.warn(`[${MODULE_ID}] fix log write failed: ${e.message}`); return { created: false, gap: null }; }
}

module.exports = { report, openGaps, asFindings, explainWhy, logFix, MODULE_ID, VERSION, TABLE };
