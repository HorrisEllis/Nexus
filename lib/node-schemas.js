'use strict';
/**
 * lib/node-schemas.js — the real schema for every node/extension type
 * lib/node-export.js's envelope can carry.
 * UUID: nexus-node-schemas-v1-0000-2026-0903-001
 *
 * §SPLIT 2026-09-03 — James: "can you do the split now. all the contracts
 * schemas need to be that way also." One schema, one file, one place to
 * edit it.
 *
 * §CONVERTED 2026-09-11 — James: "the node type is the file extension.
 * not js. a yaml file with the node type as the extension, like the .nex
 * files." Every entry below used to be a require()'d .js module; now
 * every one is a real .schema node file (YAML, node-export.js's own
 * envelope format) under lib/node-schemas/ — a schema IS one of the 19
 * original node types (.schema), so schema DEFINITIONS are now real
 * instances of that type themselves, not bespoke hand-written code.
 * Loaded via node-export.js's importFromFile(), not require().
 *
 * §REGRESSION, NAMED NOT HIDDEN — two of these (hat, component) used to
 * be LIVE references: hat.js did `fields: require('../hat-forge.js')
 * .HAT_SCHEMA`, component.js pulled COMPONENT_SCHEMA.types.id from
 * loom/schema/definitions.js at require-time. The .schema YAML files
 * captured those real values correctly at conversion time (2026-09-11),
 * but are now frozen — if hat-forge.js's HAT_SCHEMA or loom's
 * COMPONENT_SCHEMA change later, these two .schema files will silently
 * go stale until someone re-runs the export. Every other type was
 * already a static object, so this regression is scoped to exactly
 * these two.
 *
 * §GROUNDING RULE (unchanged) — every schema is either (a) a direct
 * reference to a schema that already exists as real code, or (b) freshly
 * written from the real record-construction code for that type, cited in
 * each file's `source`. Nothing was invented from the extension name alone.
 *
 * Shape every payload follows:
 *   {
 *     status: 'REAL' | 'OPEN',        // REAL = grounded in existing code; OPEN = proposed, unbacked
 *     source: 'file.js — what real construction site this came from',
 *     fields: { name: { type, required, description } },
 *   }
 */

const fs = require('fs');
const path = require('path');
const nodeExport = require('./node-export.js');

const SCHEMAS_DIR = path.join(__dirname, 'node-schemas');

/**
 * loadAll() — reads every real .schema file in lib/node-schemas/ at
 * require-time (once, cached in SCHEMAS below — matching the old
 * require()'s own one-time-resolution behavior, not re-read per call).
 * A malformed or unreadable .schema file is a hard error, not silently
 * skipped — same discipline node-export.js's own validate() already
 * enforces on import.
 */
function loadAll() {
  const out = {};
  // §CHANGED 2026-09-12 — James: "the names need to be reversed. the node
  // type is always the actual file extension like .nex." Files renamed
  // from <name>.schema to schema.<name> (schema.agent, schema.capability,
  // etc.) so the real distinguishing node type sits last, as the actual
  // extension — same grammar this session already locked for data nodes
  // (<system>.<semantic>.<nodetype>, nodetype always last), applied here
  // to the schema-definition files themselves.
  const files = fs.readdirSync(SCHEMAS_DIR).filter(f => f.startsWith('schema.'));
  for (const f of files) {
    const doc = nodeExport.importFromFile(path.join(SCHEMAS_DIR, f));
    if (doc.type !== 'schema') {
      throw new Error(`lib/node-schemas.js: ${f} has type "${doc.type}", expected "schema"`);
    }
    out[doc.id] = doc.payload;
  }
  return out;
}

const SCHEMAS = loadAll();

/** get(type) -> the schema entry, or null if the type is unknown. */
function get(type) { return SCHEMAS[type] || null; }

/** list() -> [{type, status, source}] for every known type, real state at a glance. */
function list() {
  return Object.entries(SCHEMAS).map(([type, s]) => ({ type, status: s.status, source: s.source }));
}

/**
 * checkPayload(type, payload) -> {ok, missing, wrongType}. A real, shallow
 * typeof-based check — same depth loom's own Gate.schema uses (checks
 * required keys + top-level typeof only), not a deep structural validator.
 */
function checkPayload(type, payload) {
  const schema = get(type);
  if (!schema) return { ok: false, missing: [], wrongType: [], reason: `unknown type "${type}"` };
  if (!payload || typeof payload !== 'object') return { ok: false, missing: Object.keys(schema.fields), wrongType: [], reason: 'payload is not an object' };

  const missing = [];
  const wrongType = [];
  for (const [field, def] of Object.entries(schema.fields)) {
    if (def.required !== true) continue; // HAT_SCHEMA's {field: 'string'} entries have no .required flag — treated as documentation-only, not enforced here
    if (!(field in payload) || payload[field] === undefined) { missing.push(field); continue; }
    if (def.type && def.type !== 'any') {
      const actual = Array.isArray(payload[field]) ? 'array' : typeof payload[field];
      if (def.type !== actual) wrongType.push({ field, expected: def.type, actual });
    }
  }
  return { ok: missing.length === 0 && wrongType.length === 0, missing, wrongType };
}

module.exports = { SCHEMAS, get, list, checkPayload };
