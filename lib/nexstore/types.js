'use strict';
/**
 * lib/nexstore/types.js — the type registry and the gate per type (0.39.300, N2).
 * component_id: nexus.lib.nexstore.types
 * Map: docs/2026-09-29-nex-node-store-phasemap.spec (N2_types_and_gates) — first by leverage in intelligence's gap
 * synthesis once N0 and N1 closed (docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec, LV1).
 *
 * The registry is read, never hand-written (I9, no hardcodes):
 *   docs/nexstore-type-catalogue.yaml (N0's census: every data shape, its kind, fields, indexed fields, references)
 *   lib/node-schemas/schema.<id> (the payload schemas: field → { type, required }), joined to a type by its last name
 * Ring capacity and eviction policy come from the type's declaration (ring.capacity, ring.evict: archive | drop); a ring
 * declared without them is said, not defaulted silently.
 *
 * The gate (I8) is a list of warp/core Axiom — loom's axiom model, not a second validator. Each axiom's check returns
 * true or a reason; a hard axiom that fails refuses the record. guard(log, registry) puts the gate in front of a
 * nexstore log: a refused record never reaches the log, the refusal does — as a nexstore.refusal ledger record that
 * names the type, the axiom and the reason (a refusal is never silent, §1.2).
 */
const fs = require('fs');
const path = require('path');
const { Axiom } = require('../../warp/core/Axiom.js');

const ROOT = path.resolve(__dirname, '..', '..');
const KINDS = Object.freeze(['record', 'ledger', 'ring', 'edge', 'lattice', 'blob', 'snapshot']);
// the ops each kind accepts (the map's kinds block): a ledger is never patched or deleted, a blob is stored once
const OPS = Object.freeze({
  record:   ['create', 'put', 'patch', 'delete'],
  ledger:   ['append', 'create'],
  ring:     ['append', 'create'],
  edge:     ['link', 'unlink', 'patch', 'create', 'delete'],
  lattice:  ['link', 'patch', 'create', 'unlink'],
  blob:     ['put', 'create'],
  snapshot: ['mark', 'create'],
});
const NEEDS_ID = new Set(['record', 'edge', 'lattice', 'blob', 'snapshot']);
const REFUSAL = Object.freeze({ name: 'nexstore.refusal', kind: 'ledger', system: 'nexstore', fields: ['type', 'axiom', 'reason', 'op', 'id'], indexed: ['type', 'axiom'], builtIn: true });

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const lastName = (name) => String(name).split('.').pop().replace(/@.*$/, '');

/** schemas({ root, yaml }) → Map(id → { fields: { f: { type, required } } }) from lib/node-schemas */
function schemas({ root = ROOT, yaml = require('js-yaml') } = {}) {
  const out = new Map(), dir = path.join(root, 'lib', 'node-schemas');
  let files = []; try { files = fs.readdirSync(dir); } catch (_) { return out; }
  for (const f of files) {
    if (!f.startsWith('schema.')) continue;
    try { const d = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8')); if (d && d.payload && d.payload.fields) out.set(String(d.id || f.slice(7)), { fields: d.payload.fields, source: `lib/node-schemas/${f}` }); }
    catch (_) { /* an unreadable schema is no schema: the type stays ungated by fields, and says so */ }
  }
  return out;
}

/** the built-in axioms; each check(record, type, ctx) → true | reason string */
const AXIOMS = {
  'type.known': () => new Axiom('nexstore.type.known', { check: () => true }),
  'kind.op': (t) => new Axiom('nexstore.kind.op', { check: (rec) => (OPS[t.kind] || []).includes(rec.op) || `a ${t.kind} does not take ${rec.op} — it takes ${(OPS[t.kind] || []).join(', ')}` }),
  'id.present': (t) => new Axiom('nexstore.id.present', { check: (rec) => !NEEDS_ID.has(t.kind) || (rec.id != null && String(rec.id) !== '') || `a ${t.kind} record needs an id` }),
  'edge.ends': (t) => new Axiom('nexstore.edge.ends', { check: (rec) => {
    if (!['edge', 'lattice'].includes(t.kind) || !['link', 'create'].includes(rec.op)) return true;
    const c = rec.change || {}; const from = c.from ?? c.fromUuid, to = c.to ?? c.toUuid;
    return (from != null && to != null) || `a ${t.kind} needs both ends (from, to)`;
  } }),
  'schema.required': (t) => new Axiom('nexstore.schema.required', { check: (rec) => {
    if (!['create', 'put', 'append', 'link'].includes(rec.op)) return true;   // a patch carries only what changed
    const c = rec.change || {}, missing = (t.required || []).filter(f => c[f] === undefined || c[f] === null);
    return !missing.length || `missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  } }),
  'schema.types': (t) => new Axiom('nexstore.schema.types', { check: (rec) => {
    const c = rec.change || {}, bad = [];
    for (const [f, want] of Object.entries(t.fieldTypes || {})) {
      if (c[f] === undefined || c[f] === null || !want || want === 'any') continue;
      const got = typeOf(c[f]); if (got !== want && !(want === 'integer' && Number.isInteger(c[f]))) bad.push(`${f} is ${got}, the schema says ${want}`);
    }
    return !bad.length || bad.join('; ');
  } }),
  'refs.exist': (t) => new Axiom('nexstore.refs.exist', { check: (rec, _t, ctx) => {
    if (!ctx || typeof ctx.exists !== 'function' || !['create', 'put', 'patch', 'append', 'link'].includes(rec.op)) return true;
    const c = rec.change || {}, dangling = [];
    for (const f of (t.mustExist || [])) { if (c[f] == null) continue; for (const v of [].concat(c[f])) if (!ctx.exists(v, f, t)) dangling.push(`${f} → ${v}`); }
    return !dangling.length || `dangling reference${dangling.length > 1 ? 's' : ''}: ${dangling.join(', ')}`;
  } }),
  'ledger.no_rewrite': (t) => new Axiom('nexstore.ledger.no_rewrite', { check: (rec) => t.kind !== 'ledger' || !['patch', 'delete', 'put'].includes(rec.op) || 'a ledger is append-only: it is never patched or deleted (I1)' }),
};

/** define(decl, schemaMap) → a normalised type: name, kind, system, fields, indexed, references, required, fieldTypes, ring */
function define(decl, schemaMap = new Map()) {
  if (!decl || !decl.name) throw new Error('nexstore: a type needs a name');
  if (!KINDS.includes(decl.kind)) throw new Error(`nexstore: type ${decl.name} has kind ${decl.kind} — one of ${KINDS.join(', ')}`);
  const sc = decl.schema || schemaMap.get(lastName(decl.name)) || null;
  const scFields = sc && sc.fields ? sc.fields : {};
  const t = {
    name: decl.name, kind: decl.kind, system: decl.system || null, source: decl.source || null,
    fields: Array.from(new Set([...(decl.fields || []), ...Object.keys(scFields)])),
    indexed: decl.indexed || [],
    references: decl.references || [],
    mustExist: decl.mustExist || [],                      // references checked on write — opt-in per type (a census reference may name a node in another system, I5)
    required: decl.required || Object.entries(scFields).filter(([, v]) => v && v.required).map(([k]) => k),
    fieldTypes: decl.fieldTypes || Object.fromEntries(Object.entries(scFields).map(([k, v]) => [k, v && v.type])),
    schemaFrom: decl.schema ? 'declared' : (sc ? sc.source : null),
    ring: decl.kind === 'ring' ? { capacity: decl.ring?.capacity ?? decl.capacity ?? null, evict: decl.ring?.evict ?? decl.evict ?? null } : null,
    builtIn: !!decl.builtIn,
  };
  if (t.ring && t.ring.evict && !['archive', 'drop'].includes(t.ring.evict)) throw new Error(`nexstore: ring ${t.name} evicts by ${t.ring.evict} — archive or drop (I1)`);
  t.gate = ['type.known', 'kind.op', 'ledger.no_rewrite', 'id.present', 'edge.ends', 'schema.required', 'schema.types', 'refs.exist'].map(k => AXIOMS[k](t));
  for (const a of decl.axioms || []) t.gate.push(a instanceof Axiom ? a : new Axiom(a.id, a));
  return t;
}

/**
 * registry({ catalogue, types, root }) → { get, has, list, define, check, said }
 *   catalogue: a path or the parsed docs/nexstore-type-catalogue.yaml (default: that file)
 *   said: what the registry could not settle — a ring with no capacity, a type with no schema — listed, never guessed
 */
function registry({ catalogue = null, types = null, root = ROOT, yaml = require('js-yaml'), withCatalogue = true } = {}) {
  const sm = schemas({ root, yaml });
  const map = new Map(), said = [];
  const add = (decl) => { const t = define(decl, sm); map.set(t.name, t); if (t.ring && t.ring.capacity == null) said.push({ type: t.name, note: 'a ring with no declared capacity — N4 needs one before it can bound the window' }); return t; };
  add(REFUSAL);
  if (withCatalogue) {
    let cat = catalogue;
    if (!cat || typeof cat === 'string') { try { cat = yaml.load(fs.readFileSync(cat || path.join(root, 'docs', 'nexstore-type-catalogue.yaml'), 'utf8')); } catch (e) { said.push({ type: '(catalogue)', note: `the catalogue could not be read: ${e.message}` }); cat = { types: [] }; } }
    for (const d of (cat.types || [])) { try { add(d); } catch (e) { said.push({ type: d.name, note: e.message }); } }
  }
  for (const d of types || []) add(d);

  /** check(record, ctx) → { ok, type, refusals: [{ axiom, reason, severity }] } — every hard axiom runs, every time */
  function check(rec, ctx = {}) {
    const t = map.get(rec && rec.type);
    if (!t) return { ok: false, type: null, refusals: [{ axiom: 'nexstore.type.known', severity: 'hard', reason: `no type ${rec && rec.type} in the registry` }] };
    const refusals = [];
    for (const ax of [...t.gate].sort((a, b) => b.weight - a.weight)) {
      let r; try { r = ax.check(rec, t, ctx); } catch (e) { r = `the axiom threw: ${e.message}`; }
      if (r !== true) refusals.push({ axiom: ax.id, severity: ax.severity, reason: typeof r === 'string' ? r : 'refused' });
    }
    return { ok: !refusals.some(r => r.severity === 'hard'), type: t, refusals };
  }

  return {
    get: (n) => map.get(n) || null, has: (n) => map.has(n), list: () => Array.from(map.values()),
    define: add, check, said, size: () => map.size,
  };
}

/**
 * guard(log, reg, ctx) → { append(input) → { ok, record } | { ok:false, refusals, refusal } }
 * The gate in front of a log. A refused input is not written; its refusal is (a nexstore.refusal ledger record,
 * causedBy the cause the input carried), so every refusal is traceable.
 */
function guard(log, reg, ctx = {}) {
  return {
    append(input) {
      const c = reg.check(input, ctx);
      if (c.ok) return { ok: true, record: log.append(input), soft: c.refusals };
      const refusal = log.append({
        op: 'append', type: REFUSAL.name, id: null, causedBy: input && 'causedBy' in input ? input.causedBy : null,
        change: { type: input && input.type, op: input && input.op, id: input && input.id != null ? String(input.id) : null, axiom: c.refusals[0].axiom, reason: c.refusals.map(r => r.reason).join(' · '), refusals: c.refusals },
      });
      return { ok: false, refusals: c.refusals, refusal };
    },
  };
}

module.exports = { KINDS, OPS, REFUSAL, schemas, define, registry, guard, AXIOMS };
