'use strict';
/**
 * loom/schema/gates.js — Warp Gates for LOOM's four declaration types.
 * comp_id: nexus.loom.gates
 * UUID: nexus-loom-gates-v1-0000-2026-0701-jamesbrooks-001
 *
 * Each Gate is pure per Warp's design law: matches(event) -> bool,
 * transform(event) -> Event[]. No disk I/O, no registry mutation here —
 * that happens in driver.js, after a Gate's output is known. A Gate
 * only ever answers "is this declaration structurally valid," never
 * "does this collide with something already registered" (that needs
 * registry state, which is what the Axioms in axioms.js are for —
 * Axiom.check explicitly receives streamState, Gate.transform does not).
 */
const { Gate, Event } = require('../../warp/core');
const {
  COMPONENT_SCHEMA, SEAM_SCHEMA, HOOK_SCHEMA, WIRE_SCHEMA, CONCERN_SCHEMA, KNOWN_HOOK_TYPES,
} = require('./definitions');

function _rejectEvent(kind, event, validation, extraReason) {
  return new Event(`loom.${kind}.rejected`, {
    input: event.data,
    missing: validation.missing,
    wrongType: validation.wrongType,
    reason: extraReason || 'schema validation failed',
  });
}

// §SB1 2026-08-14 (docs/nexus-self-build-pipeline-phasemap.spec) — additive,
// optional-field type-checking, scoped to loom's own gates rather than
// warp/core/Gate.js. Checked Gate.validateOutput directly (warp/core/Gate.js)
// before writing this: it only checks `schema.types` for keys already in
// `schema.requiredKeys` — an optional field listed in `types` but not
// `requiredKeys` is silently never validated at all, by design (required
// vs. optional are the same loop there). Modifying that shared class would
// change behavior for every gate in the system (§16.6 — a local need
// doesn't get to change a global invariant's shared implementation).
// This is the local, sovereign equivalent: check an optional field's TYPE
// only when the field is actually present. Absent stays fully valid
// (old rows, and any caller that never sends the field, both still work
// exactly as before this existed).
function _checkOptionalTypes(data, optionalTypes) {
  const wrongType = [];
  for (const [key, expected] of Object.entries(optionalTypes)) {
    if (data != null && key in data && data[key] != null && typeof data[key] !== expected) {
      wrongType.push({ key, expected, actual: typeof data[key] });
    }
  }
  return { ok: wrongType.length === 0, wrongType };
}

// §SB1-EXT 2026-08-14 — comp_status. Three tiers, per the person's own
// correction of an earlier naming collision draft (two tiers were both
// called "Acceptable" — would have made the field unable to distinguish
// them, defeating its purpose):
//   stub      — mapped, or doesn't execute yet.
//   acceptable — minimum working code for the intention; tested, ran,
//                verified. Maps naturally to a pre-1.0.0 component version
//                (lib/version.js's own real semver bump rules already treat
//                1.0.0 as "stable public contract" — this reuses that
//                convention rather than inventing a second one).
//   release   — fully functional to the spec's intention. 1.0.0+.
// Enum, not a free string — an invalid value is rejected the same way a
// wrong-type value is, not silently accepted as a typo.
const COMP_STATUS_VALUES = Object.freeze(['stub', 'acceptable', 'release']);
function _checkCompStatus(data) {
  if (data == null || !('comp_status' in data) || data.comp_status == null) return { ok: true };
  if (typeof data.comp_status !== 'string' || !COMP_STATUS_VALUES.includes(data.comp_status)) {
    return { ok: false, wrongType: [{ key: 'comp_status', expected: COMP_STATUS_VALUES.join('|'), actual: JSON.stringify(data.comp_status) }] };
  }
  return { ok: true };
}

// §SB1-EXT 2026-08-14 — comp_dependencies. A DECLARED array of component
// ids, deliberately NOT a replacement for loom's real, wire-derived
// dependency graph (registry.js's impactOf()/dependents, computed from
// actual require() edges — checked directly before writing this, §10.3).
// This is the other half of the same "declared vs real" pattern this
// session already found bugs in twice (R3's dormant wire, wire intent
// nulls): a component can DECLARE an intended dependency that has no real
// wire behind it yet, and that mismatch is itself useful, surfaceable
// data — lib/loom-map.js's checkDependencyDrift() (added alongside this)
// is where that comparison happens, not here — this gate only validates
// shape (an array of strings), never cross-references registry state
// (Gate.transform is pure per this file's own header, no disk I/O).
function _checkCompDependencies(data) {
  if (data == null || !('comp_dependencies' in data) || data.comp_dependencies == null) return { ok: true };
  if (!Array.isArray(data.comp_dependencies)) {
    return { ok: false, wrongType: [{ key: 'comp_dependencies', expected: 'array', actual: typeof data.comp_dependencies }] };
  }
  const nonString = data.comp_dependencies.findIndex(d => typeof d !== 'string');
  if (nonString !== -1) {
    return { ok: false, wrongType: [{ key: `comp_dependencies[${nonString}]`, expected: 'string', actual: typeof data.comp_dependencies[nonString] }] };
  }
  return { ok: true };
}

// §SB1 2026-08-14 — schemaVersion default. AXIOMS §5.4 ("versions persist
// across the entire project") applied to loom's own declared schema shape:
// a component/wire registered from today forward carries the schema
// version it was validated against, so a future schema change can tell
// "this row predates the change" from "this row was validated under it"
// without guessing from registeredAt alone (registeredAt says WHEN, not
// WHICH schema shape was in force). Old rows simply don't have this field
// — read code must treat its absence as "pre-versioning," never as an
// error (same additive discipline as dir/type/intent below).
const SCHEMA_VERSION = '1.2.0'; // 1.0.0 original 4-primitive shape. 1.1.0 (SB1, 2026-08-14) added dir/type/intent. 1.2.0 (same day) added comp_status (stub|acceptable|release) + comp_dependencies (declared, cross-checked against the real wire graph, not a replacement for it).

// ── component.declare ───────────────────────────────────────────────────────
const componentDeclareGate = new Gate('loom.component.declare', {
  schema: COMPONENT_SCHEMA,
  transform(event) {
    const v = componentDeclareGate.validateOutput(event.data);
    if (!v.ok) return [_rejectEvent('component', event, v)];
    // §SB1 — dir is optional (old callers, and any future caller that
    // genuinely doesn't have a filesystem path, both stay valid); when
    // present it must be a real string, checked here since the shared
    // Gate class doesn't check optional fields at all (see note above).
    const optV = _checkOptionalTypes(event.data, { dir: 'string' });
    if (!optV.ok) return [_rejectEvent('component', event, { missing: [], wrongType: optV.wrongType }, 'optional field type check failed')];
    const statusV = _checkCompStatus(event.data);
    if (!statusV.ok) return [_rejectEvent('component', event, { missing: [], wrongType: statusV.wrongType }, 'comp_status must be one of: ' + COMP_STATUS_VALUES.join(', '))];
    const depsV = _checkCompDependencies(event.data);
    if (!depsV.ok) return [_rejectEvent('component', event, { missing: [], wrongType: depsV.wrongType }, 'comp_dependencies must be an array of component id strings')];
    return [new Event('loom.component.registered', { ...event.data, schemaVersion: event.data.schemaVersion || SCHEMA_VERSION })];
  },
});

// ── seam.declare ─────────────────────────────────────────────────────────────
const VALID_SEAM_KINDS = Object.freeze(['ingress', 'egress', 'bidirectional']);
const seamDeclareGate = new Gate('loom.seam.declare', {
  schema: SEAM_SCHEMA,
  transform(event) {
    const v = seamDeclareGate.validateOutput(event.data);
    if (!v.ok) return [_rejectEvent('seam', event, v)];
    if (!VALID_SEAM_KINDS.includes(event.data.kind)) {
      return [_rejectEvent('seam', event, { missing: [], wrongType: [] },
        `kind must be one of ${VALID_SEAM_KINDS.join('|')}, got '${event.data.kind}'`)];
    }
    return [new Event('loom.seam.registered', { ...event.data })];
  },
});

// ── hook.declare ─────────────────────────────────────────────────────────────
const VALID_DIRECTIONS = Object.freeze(['in', 'out', 'bidirectional']);
const hookDeclareGate = new Gate('loom.hook.declare', {
  schema: HOOK_SCHEMA,
  transform(event) {
    const v = hookDeclareGate.validateOutput(event.data);
    if (!v.ok) return [_rejectEvent('hook', event, v)];
    if (!VALID_DIRECTIONS.includes(event.data.direction)) {
      return [_rejectEvent('hook', event, { missing: [], wrongType: [] },
        `direction must be one of ${VALID_DIRECTIONS.join('|')}, got '${event.data.direction}'`)];
    }
    // type is open-ended (KNOWN_HOOK_TYPES is a seed list) — a type
    // outside the seed list is not rejected, it's flagged for the
    // caller to consciously register as new, per the Architect spec's
    // "any invention you can think of" clause.
    const novel = !KNOWN_HOOK_TYPES.includes(event.data.type);
    return [new Event('loom.hook.registered', { ...event.data, novelType: novel })];
  },
});

// ── wire.declare ─────────────────────────────────────────────────────────────
const wireDeclareGate = new Gate('loom.wire.declare', {
  schema: WIRE_SCHEMA,
  transform(event) {
    const v = wireDeclareGate.validateOutput(event.data);
    if (!v.ok) return [_rejectEvent('wire', event, v)];
    if (event.data.from_hook_id === event.data.to_hook_id) {
      return [_rejectEvent('wire', event, { missing: [], wrongType: [] },
        'from_hook_id and to_hook_id must differ (no self-wire)')];
    }
    // §SB1 — type is optional (same reasoning as component.dir above);
    // intent already was (see definitions.js's own comment on it) — both
    // checked the same way, when present, never required.
    const optV = _checkOptionalTypes(event.data, { type: 'string', intent: 'string' });
    if (!optV.ok) return [_rejectEvent('wire', event, { missing: [], wrongType: optV.wrongType }, 'optional field type check failed')];
    return [new Event('loom.wire.registered', { ...event.data, schemaVersion: event.data.schemaVersion || SCHEMA_VERSION })];
  },
});

// ── concern.declare — §BUILT 2026-07-14, the roadmap primitive ─────────────
const VALID_SEVERITIES = Object.freeze(['low', 'medium', 'high']);
const concernDeclareGate = new Gate('loom.concern.declare', {
  schema: CONCERN_SCHEMA,
  transform(event) {
    const v = concernDeclareGate.validateOutput(event.data);
    if (!v.ok) return [_rejectEvent('concern', event, v)];
    if (!VALID_SEVERITIES.includes(event.data.severity)) {
      return [_rejectEvent('concern', event, { missing: [], wrongType: [] },
        `severity must be one of ${VALID_SEVERITIES.join('|')}, got '${event.data.severity}'`)];
    }
    // kind is open-ended, same philosophy as hook's type field — the real
    // kinds of concern aren't known in advance and shouldn't be a closed
    // enum a scanner has to fight to extend.
    return [new Event('loom.concern.registered', { ...event.data })];
  },
});

module.exports = {
  componentDeclareGate, seamDeclareGate, hookDeclareGate, wireDeclareGate, concernDeclareGate,
};
