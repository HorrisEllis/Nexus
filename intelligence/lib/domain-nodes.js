'use strict';
// intelligence/lib/domain-nodes.js — real node files for intelligence's
// own domain data, following guardian/lib/agent-model-nodes.js's exact
// proven pattern (exportToFile writes the real file, nodeIndex.indexNode
// makes it queryable via jaaDB) — not a new mechanism, the same one
// every other system's own data/nodes/ + data/node-index/ already uses.
//
// §MAPPED, PER intelligence/spec/intelligence.node-taxonomy.md — before
// this file, that spec's own table said plainly: "node: NOT USED — real,
// confirmed gap." intelligence's own gap/pattern/crystal data existed
// only in jaaDB tables (gaps, bep_patterns, liminal-space's in-memory
// resonance_crystal items) with no standalone-file, importable/
// exportable "1 unit of measurement" form.
//
// §CORRECTED BEFORE SHIPPING — the first version of this file used the
// generic node-export types `pat` and `crystal`. Both are already taken
// by different, unrelated real mechanisms (`pat` <- lib/case-library.js's
// pattern_signature; `crystal` <- meta/crystal-lattice.js — node-export.js's
// own header names both explicitly, and its KNOWN_TYPES comment for
// resonance_crystal warns not to confuse the two). intelligence already
// had real, correctly-scoped types waiting unused: `bep_pattern` and
// `resonance_crystal`, each with a schema already verified (before this
// pass) against real production rows. Using them instead, not the
// generic ones, closes the gap without creating a second collision.
//
// §FOUR REAL SOURCES, THREE REAL TYPES — each real write site calls
// exactly one function below, right after its own real write succeeds:
//   .gap             <- intelligence/index.js's drift gap,
//                       intelligence/causal/compound.js's tidal-cascade
//                       gap (this system's own gap subsystem otherwise:
//                       gap/hunter.js, ledger.js, index.js, predicate.js).
//   .bep_pattern      <- intelligence/index.js's own two bep_patterns
//                       insert/upsert sites (co-occurrence/cross_system_
//                       causal and meta_noise_source — two real sub-
//                       shapes of the same real pipeline, reconciled into
//                       one schema with the fields unique to each made
//                       optional, not split into two types).
//   .pattern_sequence <- mastermind.js's detectRecurringPatterns(), a
//                       genuinely different real shape (upserts on
//                       'sequence', never assigns a uuid) — kept as its
//                       own type rather than forced into bep_pattern's
//                       schema; see schema.pattern_sequence's own header.
//   .resonance_crystal <- intelligence/liminal-space/index.js's own real
//                       crystal formation (the `crystal` object built
//                       right before `_bus.emit('liminal.crystallised',
//                       ...)`).
//
// §SCHEMA-VALIDATED ON WRITE — James: "each node type needs a schema to
// make sure they stay consistent." Every export here is checked against
// lib/node-schemas.js's real checkPayload() before being written to
// disk. A mismatch is logged loudly (once per distinct reason) and the
// export still proceeds — the goal is surfacing drift immediately, not
// silently blocking a real gap/pattern/crystal from being exported
// because its shape moved. (Note: fixing this schema module's own
// require-time crash — an unrelated, pre-existing YAML bug in
// lib/node-schemas/schema.repository — was a prerequisite found while
// wiring this in; see that file's own history.)
//
// §NOT WIRED THROUGH THE UNUSED PROXY — intelligence/gap/ledger.js's own
// wrapJAAGaps() already exists for exactly this kind of interception, but
// grepping the whole tree found zero real callers of it (dead, documented
// only). Retrofitting it here would mean rewiring every jaaDB reference
// in intelligence/index.js — a bigger, riskier change than adding one
// explicit, non-fatal call at each real write site, matching how guardian
// itself does agent_model (a direct call at the write site, not a proxy).
//
// §NON-FATAL, ALWAYS — the real data write (the gap, the pattern, the
// crystal) has already succeeded by the time any function here runs.
// A node-export or schema-check failure is logged once per distinct
// reason and never re-throws — losing the exported file view is bad;
// losing the gap/pattern/crystal itself because of a filesystem hiccup
// or a schema drift would be worse.

const path = require('path');
const nodeExport = require('../../lib/node-export.js');
const nodeIndex = require('../../lib/node-index.js');
const nodeSchemas = require('../../lib/node-schemas.js');
const { JaaStore } = require('../../guardian/jaa-store.js');

const MODULE_ID = 'intelligence-domain-nodes';
const NODES_ROOT = path.join(__dirname, '..', 'data', 'nodes');
const NODE_INDEX_DIR = path.join(__dirname, '..', 'data', 'node-index');

// One lazily-created, per-system JaaStore — matches lib/node-index.js's
// own documented pattern for a caller that wants its own sovereign
// index rather than the shared central singleton (intelligence already
// has its own data/node-index/ directory; capability/command/system
// already write there — this joins that same real, existing store, not
// a second, competing one).
//
// §BUGFIX — found by actually running this against a real JaaStore, not
// assumed correct from reading its class: raw JaaStore has all(table,
// where, opts), not query(table, predicate) — lib/node-index.js's
// indexNode()/removeNode() call jaa.query(...) directly. versionium/lib/
// store.js already hit this exact same mismatch and solved it the same
// way: a thin adapter aliasing query -> all. Reused here, not reinvented.
let _indexJaa = null;
function _indexStore() {
  if (_indexJaa) return _indexJaa;
  const store = new JaaStore(NODE_INDEX_DIR);
  _indexJaa = {
    insert:  (table, row)         => store.insert(table, row),
    upsert:  (table, row, key)    => store.upsert(table, row, key),
    get:     (table, where)       => store.get(table, where),
    query:   (table, predicate)   => store.all(table, predicate),
    update:  (table, where, vals) => store.update(table, where, vals),
    delete:  (table, where)       => store.delete(table, where),
    count:   (table, where)       => store.count(table, where),
  };
  return _indexJaa;
}

const _lastError = {}; // type -> last error message, so a busy loop logs once per distinct reason, not every call
const _lastSchemaWarning = {}; // type -> last schema-mismatch signature, same reasoning

function _write(type, id, payload, meta) {
  // §SCHEMA CHECK — before writing, not instead of writing. A real,
  // grounded schema exists for every type this module uses (checked at
  // build time, not assumed): gap, bep_pattern, pattern_sequence,
  // resonance_crystal are all status:REAL in lib/node-schemas/.
  try {
    const check = nodeSchemas.checkPayload(type, payload);
    if (!check.ok) {
      const sig = `${check.missing.join(',')}|${check.wrongType.map(w => w.field).join(',')}`;
      if (_lastSchemaWarning[type] !== sig) {
        console.warn(`[${MODULE_ID}] ${type}/${id} does not match schema.${type} — missing: [${check.missing.join(', ') || 'none'}], wrong type: [${check.wrongType.map(w => `${w.field} (expected ${w.expected}, got ${w.actual})`).join(', ') || 'none'}]. Exporting anyway — this is a drift signal, not a block (§0.1: surfacing reality beats silently refusing it).`);
        _lastSchemaWarning[type] = sig;
      }
    } else {
      _lastSchemaWarning[type] = null;
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] ${type}/${id} schema check itself failed (non-fatal, exporting anyway): ${e.message}`);
  }

  try {
    const destDir = path.join(NODES_ROOT, type);
    const filePath = nodeExport.exportToFile(type, id, payload, meta, destDir);
    try {
      const doc = nodeExport.importFromFile(filePath); // re-read once, cheap, guarantees the indexed doc matches exactly what's on disk
      nodeIndex.indexNode(type, doc, filePath, _indexStore());
    } catch (e) {
      // §1.2 — the file write already succeeded; the index is a queryable
      // convenience on top of it, not the source of truth. Log, don't fail.
      console.warn(`[${MODULE_ID}] ${type}/${id} node-index write failed (non-fatal, file already saved): ${e.message}`);
    }
    _lastError[type] = null;
    return filePath;
  } catch (e) {
    if (_lastError[type] !== e.message) {
      console.warn(`[${MODULE_ID}] ${type}/${id} node export failed (non-fatal, the real gap/pattern/crystal itself is already saved in its own JAA table): ${e.message}`);
      _lastError[type] = e.message;
    }
    return null;
  }
}

/**
 * writeGapNode(gapRow) — one real .gap node per gap, id = the gap's own
 * uuid (every real gap insert site in this system already generates one).
 */
function writeGapNode(gapRow) {
  if (!gapRow || !gapRow.uuid) return null;
  return _write('gap', gapRow.uuid, gapRow, {
    context: `intelligence gap: ${gapRow.type || 'unknown'}`,
    system: 'intelligence',
    summary: gapRow.body || gapRow.type || null,
    tags: [gapRow.type, gapRow.severity, gapRow.status].filter(Boolean),
    source: 'intelligence.domain-nodes',
  });
}

// Slugging matches guardian/lib/agent-model-nodes.js's own exact
// precedent for turning a real, stable, non-uuid string into a valid
// node id.
function _slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'x';
}

/**
 * writePatternNode(patternRow) — one real node per crystallised pattern,
 * routed to the correct type by real shape rather than one being forced
 * into the other's schema:
 *   - intelligence/index.js's own bep_patterns rows (co-occurrence,
 *     cross_system_causal, meta_noise_source — all real uuid-keyed) ->
 *     .bep_pattern.
 *   - mastermind.js's detectRecurringPatterns() (no uuid, keyed on
 *     'sequence' instead) -> .pattern_sequence, id = slug(sequence).
 */
function writePatternNode(patternRow) {
  if (!patternRow) return null;
  if (patternRow.uuid) {
    return _write('bep_pattern', patternRow.uuid, patternRow, {
      context: `intelligence crystallised pattern: ${patternRow.patternType || 'unknown'}`,
      system: 'intelligence',
      summary: patternRow.description || patternRow.summary || null,
      tags: ['bep_patterns', patternRow.patternType, patternRow.source].filter(Boolean),
      source: 'intelligence.domain-nodes',
    });
  }
  if (patternRow.sequence) {
    const id = `seq-${_slug(patternRow.sequence)}`;
    return _write('pattern_sequence', id, patternRow, {
      context: `intelligence recurring pattern sequence`,
      system: 'intelligence',
      summary: patternRow.sequence,
      tags: ['bep_patterns', 'mastermind', patternRow.source].filter(Boolean),
      source: 'intelligence.domain-nodes',
    });
  }
  return null;
}

/**
 * writeCrystalNode(crystal) — one real .resonance_crystal node per
 * liminal-space crystal. Deliberately NOT the generic `crystal` type —
 * that one is meta/crystal-lattice.js's, a different, unrelated real
 * mechanism (node-export.js's own KNOWN_TYPES comment warns about
 * exactly this confusion by name). liminal-space's own crystal objects
 * always carry a real uuid (checked directly at the construction site).
 */
function writeCrystalNode(crystal) {
  if (!crystal || !crystal.uuid) return null;
  return _write('resonance_crystal', crystal.uuid, crystal, {
    context: `intelligence liminal-space resonance crystal: ${crystal.type || 'unknown'}`,
    system: 'intelligence',
    summary: crystal.focalPoint ? `focal point: ${crystal.focalPoint}` : null,
    tags: ['liminal-space', crystal.type].filter(Boolean),
    source: 'intelligence.domain-nodes',
  });
}

module.exports = { writeGapNode, writePatternNode, writeCrystalNode, NODES_ROOT, NODE_INDEX_DIR, MODULE_ID };
