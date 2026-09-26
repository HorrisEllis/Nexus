'use strict';
/**
 * lib/uid/normalize.js — NEXUS UID Normalization Layer
 * UUID: nexus-uid-norm-v001-000000000001
 * Status: pre-release
 *
 * THE PROBLEM (measured): 431 UUIDs on disk, 0% conform to the factory grammar
 * (componentId-vNNN-[12hex]). They were hand-typed across many sessions in ~6
 * different shapes: long-name (cortex-boot-v2-0000), short-code, dated
 * (forge-cli-contract-0003-2026-0530-jamesbrooks), and raw.
 *
 * THE APPROACH — flexibility first (§A-flex):
 *   Do NOT rewrite UUIDs in place. Rewriting strings that other things point to
 *   (causedBy chains, contract refs, ledger rows) is brittle and assumes the new
 *   format is final. Instead:
 *     1. NORMALIZE — derive the canonical structured UUID from ANY input format.
 *     2. ALIAS     — keep old→new (and new→old) so every existing reference still
 *                    resolves. Nothing ever breaks. Both forms are valid forever.
 *     3. TOLERATE  — unknown/new formats are accepted, aliased, never rejected.
 *
 * This is normalization, not enforcement. The system stays flexible: any format
 * works, canonical form is derived opportunistically, references never break.
 *
 * §1.2  never throws — unmappable input returns a best-effort alias, logs once.
 * §7.4  nothing discarded — the original is always preserved in the alias ledger.
 */

const crypto = require('crypto');
const { COMPONENT_MAP } = require('./component-map');
const { parseUid, isStructured } = require('./index');

// ── component resolution: map ANY name fragment → a registered componentId ─────
// Build a lookup from every clue we have: registered ids, names, and common
// long-name prefixes seen in the wild.
const _NAME_INDEX = (() => {
  const idx = {};
  for (const [cid, entry] of Object.entries(COMPONENT_MAP)) {
    idx[cid] = cid;                                   // 'nexus-cx' → 'nexus-cx'
    if (entry.name) idx[entry.name.toLowerCase()] = cid; // 'cortex' → 'nexus-cx'
  }
  // common long-form prefixes that appear in hand-typed UUIDs
  const aliases = {
    cortex: 'nexus-cx', guardian: 'nexus-gu', bridge: 'nexus-br',
    orchestrator: 'nexus-or', orch: 'nexus-or', idearium: 'nexus-id',
    architect: 'nexus-ar', emerge: 'nexus-em', diagnostic: 'nexus-dx',
    core: 'nexus-co', jaa: 'nexus-jaa', jaadb: 'nexus-jaa',
    system: 'nexus-co', nexus: 'nexus-co', project: 'nexus-co',
    cos: 'nexus-co', forge: 'nexus-gu', cobalt: 'nexus-co', siso: 'nexus-co',
  };
  for (const [k, v] of Object.entries(aliases)) if (COMPONENT_MAP[v]) idx[k] = v;
  return idx;
})();

function resolveComponent(raw) {
  if (!raw) return null;
  const lower = String(raw).toLowerCase();
  // direct hit
  if (_NAME_INDEX[lower]) return _NAME_INDEX[lower];
  // try the first 1-3 dash-segments as a name (cortex-boot → cortex, nexus-cx-... → nexus-cx)
  const parts = lower.split('-');
  for (let take = Math.min(3, parts.length); take >= 1; take--) {
    const cand = parts.slice(0, take).join('-');
    if (_NAME_INDEX[cand]) return _NAME_INDEX[cand];
    if (_NAME_INDEX[parts[take - 1]]) return _NAME_INDEX[parts[take - 1]];
  }
  // first segment as a bare name
  if (_NAME_INDEX[parts[0]]) return _NAME_INDEX[parts[0]];
  return null;
}

// ── extract a version integer from any legacy shape ───────────────────────────
function extractVersion(raw) {
  const m = String(raw).match(/v(\d+)/i);          // v2, v003, v1
  if (m) return parseInt(m[1], 10);
  return 1;
}

// ── derive a stable instance from the original (deterministic, so re-running
//    normalize on the same input yields the same canonical UUID — idempotent) ──
function deriveInstance(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0, 12);
}

// ── the alias ledger ──────────────────────────────────────────────────────────
// In-memory bidirectional map. Persisted by the migration tool to a JSONL so it
// survives restarts. old↔new, plus original-preserved.
class AliasLedger {
  constructor() { this.oldToNew = new Map(); this.newToOld = new Map(); }
  add(oldId, newId) {
    this.oldToNew.set(oldId, newId);
    if (!this.newToOld.has(newId)) this.newToOld.set(newId, oldId);
  }
  resolve(id) { return this.oldToNew.get(id) || (this.newToOld.has(id) ? id : null); }
  original(newId) { return this.newToOld.get(newId) || null; }
  get size() { return this.oldToNew.size; }
  toJSON() { return [...this.oldToNew.entries()].map(([o, n]) => ({ old: o, new: n })); }
}

const _ledger = new AliasLedger();

// ── normalize(rawUuid) → canonical structured UUID (+ records alias) ──────────
// Accepts ANY format. Never throws. Idempotent.
function normalize(rawUuid) {
  if (!rawUuid || typeof rawUuid !== 'string') {
    return { canonical: null, componentId: null, changed: false, reason: 'empty' };
  }
  // already canonical? leave it.
  if (isStructured(rawUuid)) {
    return { canonical: rawUuid, componentId: parseUid(rawUuid).componentId, changed: false, reason: 'already-structured' };
  }
  const componentId = resolveComponent(rawUuid);
  const version     = extractVersion(rawUuid);
  const instance    = deriveInstance(rawUuid);

  if (!componentId) {
    // §1.2 — can't map to a registered component. Keep original as its own alias,
    // flag it, do NOT discard (§7.4). System stays flexible: unmapped still works.
    _ledger.add(rawUuid, rawUuid);
    return { canonical: rawUuid, componentId: null, changed: false, reason: 'unmapped-component' };
  }

  const v = String(Math.max(1, version)).padStart(3, '0');
  const canonical = `${componentId}-v${v}-${instance}`;
  _ledger.add(rawUuid, canonical);
  return { canonical, componentId, version, changed: canonical !== rawUuid, reason: 'normalized' };
}

// ── resolveAny(id) — parse that tries alias ledger for legacy ids ─────────────
// This is the flexibility hook: parseUid alone returns null for legacy, but
// resolveAny falls back to the alias ledger so legacy ids still resolve to a
// component. Use everywhere a UUID needs to become a component.
function resolveAny(id) {
  const p = parseUid(id);
  if (p.structured) return p;
  // legacy → try alias
  const canon = _ledger.resolve(id);
  if (canon && canon !== id) return parseUid(canon);
  // last resort: derive on the fly (does not persist)
  const n = normalize(id);
  if (n.componentId) return parseUid(n.canonical);
  return p; // genuinely unmappable — return raw parse (componentId: null)
}

module.exports = { normalize, resolveAny, resolveComponent, AliasLedger, _ledger };
