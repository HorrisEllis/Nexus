'use strict';
/**
 * lib/schema-registry.js — P1 of the cortex-schema-registry phasemap
 * UUID: nexus-schema-registry-v1-0000-2026-0730-001
 * Version: 1.0.0
 *
 * §PHASEMAP P1 (docs/cortex-schema-registry-phasemap.spec). Schemas for each
 * system's data, living IN cortex as EDITABLE rows — an expectation + integrity
 * layer. FLUID, not rigid (James): a schema DESCRIBES expected shape; deviation
 * is recorded as drift data (P3), never blocks a write. This lib is AGNOSTIC
 * (James's lib/ principle) — a service any system consults, knowing nothing
 * about the caller.
 *
 * P1 scope: the `schemas` table + derivation from REAL rows (§0.1 — derive from
 * data, never invent). P2 adds the conformance check; P3 the observe-on-write.
 *
 * §8.6 built outward from lib/uid/config-schema's validate-against-shape pattern
 * and the existing jaaDB store. §2.2 — schemas are cortex rows (source of truth),
 * not a frozen file, so they're editable (P4).
 */

const SCHEMAS_TABLE = 'schemas';

function _jaa() {
  // Lazy — the registry is agnostic and loads cortex only when used.
  return require('../cortex/memory/jaa-db');
}

/**
 * deriveSchema(table, sampleLimit) — read REAL rows and derive the shape (§0.1).
 * A field is `required` if present in every sampled row, else `optional`. Type
 * is the JS typeof of the first non-null value seen. Never invents fields.
 */
function deriveSchema(table, sampleLimit = 100) {
  const { jaaDB } = _jaa();
  const rows = (jaaDB.query(table, () => true, sampleLimit) || []);
  if (!rows.length) return { table, fields: [], derivedFrom: 0, note: 'no rows to derive from' };

  const seen = {};   // field -> { types:Set, count, firstType }
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (!seen[k]) seen[k] = { types: new Set(), count: 0, firstType: v === null ? 'null' : typeof v };
      seen[k].count++;
      seen[k].types.add(v === null ? 'null' : typeof v);
    }
  }
  const total = rows.length;
  const fields = Object.entries(seen).map(([name, info]) => ({
    name,
    type: info.firstType,
    required: info.count === total,
    presence: `${info.count}/${total}`,
  }));
  return { table, fields, derivedFrom: total };
}

/**
 * registerSchema(table, opts) — derive (or accept an explicit) schema and store
 * it as a cortex row. Versioned: re-registering bumps version, old row preserved
 * (§0.3 — P4 makes this a first-class editable surface). Returns the stored row.
 */
function registerSchema(table, opts = {}) {
  const { jaaDB, uid } = _jaa();
  const derived = opts.fields ? { table, fields: opts.fields, derivedFrom: 0 } : deriveSchema(table, opts.sampleLimit);
  const existing = getSchema(table);
  const version = existing ? (existing.version || 1) + 1 : 1;
  const row = {
    uuid: uid ? uid() : `schema-${table}-${Date.now()}`,
    kind: 'schema',
    table,
    version,
    fields: derived.fields,
    owner: opts.owner || 'schema-registry',
    derivedFrom: derived.derivedFrom,
    note: derived.note || null,
    updatedAt: Date.now(),
  };
  try { jaaDB.insert(SCHEMAS_TABLE, row); }
  catch (e) { return { error: `failed to persist schema for '${table}': ${e.message}` }; }
  return row;
}

/**
 * getSchema(table) — the CURRENT (highest-version) schema row for a table, or
 * null. Reads from cortex — the schema is data (§2.2).
 */
function getSchema(table) {
  const { jaaDB } = _jaa();
  const rows = (jaaDB.query(SCHEMAS_TABLE, r => r.table === table, 1000) || []);
  if (!rows.length) return null;
  return rows.reduce((a, b) => ((b.version || 1) >= (a.version || 1) ? b : a));
}

/** listSchemas() — every table that currently has a schema (current versions). */
function listSchemas() {
  const { jaaDB } = _jaa();
  const rows = (jaaDB.query(SCHEMAS_TABLE, () => true, 5000) || []);
  const byTable = {};
  for (const r of rows) {
    if (!byTable[r.table] || (r.version || 1) >= (byTable[r.table].version || 1)) byTable[r.table] = r;
  }
  return Object.values(byTable);
}

/**
 * checkShape(table, row) — P2 conformance check (docs/…schema-registry P2). PURE
 * and NON-THROWING (§14.2): compares a row against the table's CURRENT cortex
 * schema and reports deviation. It BLOCKS NOTHING (§1.2 loud, not fatal) — the
 * caller decides what to do; P3 uses this to record drift, never to reject.
 *
 * §8.6 built outward from lib/uid/config-schema.validateConfig's {valid, unknown,
 * missing} shape. If the table has NO schema, the row is "unobserved" — conforms
 * true, drift false (an unschematized table is simply not watched, §honest-risk).
 *
 * @returns {{conforms, unobserved?, missing:string[], typeMismatches:[{field,expected,actual}], unexpected:string[], drift:boolean, schemaVersion:number|null}}
 */
function checkShape(table, row) {
  const schema = getSchema(table);
  if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
    // No schema → unobserved, not a violation. Fluid: absence of a schema is
    // not drift, it's just "not watched yet".
    return { conforms: true, unobserved: true, missing: [], typeMismatches: [], unexpected: [], drift: false, schemaVersion: null };
  }
  const r = row || {};
  const declared = new Map(schema.fields.map(f => [f.name, f]));
  const provided = new Set(Object.keys(r));

  // Missing: a required field not present in the row.
  const missing = schema.fields
    .filter(f => f.required && !provided.has(f.name))
    .map(f => f.name);

  // Type mismatches: a present field whose JS type differs from the schema's.
  // null is tolerated (a field can be nullably present) — only a real type
  // divergence counts, to stay fluid rather than pedantic.
  const typeMismatches = [];
  for (const [name, f] of declared) {
    if (!provided.has(name)) continue;
    const v = r[name];
    if (v === null || v === undefined) continue;
    const actual = typeof v;
    if (f.type && f.type !== 'null' && actual !== f.type) {
      typeMismatches.push({ field: name, expected: f.type, actual });
    }
  }

  // Unexpected: a field in the row the schema doesn't declare. This is DATA, not
  // an error — often it's the schema that needs to grow (§13.4 drift is data).
  const unexpected = [...provided].filter(k => !declared.has(k));

  const drift = missing.length > 0 || typeMismatches.length > 0 || unexpected.length > 0;
  return {
    conforms: !drift,
    missing,
    typeMismatches,
    unexpected,
    drift,
    schemaVersion: schema.version || 1,
  };
}

module.exports = {
  SCHEMAS_TABLE,
  deriveSchema,
  registerSchema,
  getSchema,
  listSchemas,
  checkShape,
  VERSION: '1.1.0',
  MODULE_ID: 'schema-registry',
};
