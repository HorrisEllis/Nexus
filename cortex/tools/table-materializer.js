'use strict';
/**
 * cortex/tools/table-materializer.js — decompiles a real JAA table's rows
 * into real per-system node files, one row at a time, applying the real
 * three-way filter James named directly: "i mean only keep data that
 * serves a purpose or is novel."
 *
 * §MAP FIRST, 2026-09-13 — built to fix a real, confirmed violation: the
 * `components` JAA table (294 rows) lives inside cortex/data/memory, but
 * its rows are namespaced to every real system (guardian.*, copilot.*,
 * etc.) — cortex has been physically warehousing other systems' own
 * component declarations, not bookkeeping a pointer to them. Traced to
 * the 2026-09 node-taxonomy migration, which chose cortex as a "host
 * store" for convenience — never a sovereignty decision, not committed
 * (data/ is gitignored), easily revisited. This tool is the fix,
 * generalized past `components` to any table with the same shape of
 * problem, per direct instruction: "do it for all tables."
 *
 * ── THE THREE-WAY FILTER (not two-way) ──────────────────────────────────
 * A row becomes exactly one of:
 *   1. NEW NODE     — passes proofCheck (or none was given, i.e. the row
 *                      is already-real observed data, not a declaration
 *                      needing external proof) AND its fingerprint
 *                      matches no already-materialized node in its
 *                      owner's directory.
 *   2. OCCURRENCE BUMP — passes proofCheck, but an already-materialized
 *                      node with the same fingerprint exists: occurrences
 *                      and lastSeenAt are bumped on that EXISTING file
 *                      (lib/node-export.js's real updateOccurrence()) —
 *                      no new file, nothing duplicated.
 *   3. GAP, NOT A NODE — proofCheck was given and the row fails it (e.g.
 *                      a declared component with no real route serving
 *                      it). §1.1 "nothing exists until proven" — an
 *                      unproven declaration doesn't become a node just
 *                      because a row exists for it; it becomes a real
 *                      gap instead (lib/gap-field.js's report()), same
 *                      "reported, not silently dropped" precedent
 *                      capability-map.js's own unserved[] already uses.
 *
 * ── OWNERSHIP ROUTING ────────────────────────────────────────────────────
 * ownerOf(row) decides which system's own data/nodes/<type>/ directory a
 * row's node belongs in. Returning null/undefined means "cannot determine
 * a real owner" — the row is NOT guessed into a system; it stays under
 * cortex's own data/nodes/ instead, exactly the honest fallback §1.2
 * requires (never fabricate what can't be determined).
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────
 * dryRun defaults true, matching cli/compact.js/cli/dedup.js's own
 * established convention — a real, explicit dryRun:false is required to
 * write anything. This tool never deletes or modifies the SOURCE JAA
 * table row — it only ever creates a projection (§0.3, nothing lost);
 * removing the now-migrated row from cortex's own table is a distinct,
 * separate, explicitly-confirmed follow-up step, not done here.
 */

const fs = require('fs');
const path = require('path');
const nodeExport = require('../../lib/node-export.js');
const nodeSchemas = require('../../lib/node-schemas.js');
const gapField = require('../../lib/gap-field.js');

const ROOT = path.join(__dirname, '../..');

function _defaultDestRoot(system) {
  return path.join(ROOT, system, 'data', 'nodes');
}

/** Scan an existing node directory for a file whose envelope.fingerprint matches. */
function _findByFingerprint(destDir, type, fingerprint) {
  if (!fingerprint) return null;
  const docs = nodeExport.queryDir(destDir, { type });
  return docs.find(d => d.fingerprint === fingerprint) || null;
}

/**
 * materializeTable(opts) -> real summary, never a partial guess.
 * @param {string}   opts.table       real JAA table name (for reporting/gap context only)
 * @param {string}   opts.nodeType    one of lib/node-export.js's KNOWN_TYPES
 * @param {object[]} opts.rows        real rows already fetched by the caller (cortex owns its own jaaDB access — this tool never opens one itself, §5.9)
 * @param {function} opts.toPayload   (row) -> the real, type-shaped payload. Required — never derived generically.
 * @param {function} opts.fingerprint (row) -> a real, stable content-identity string. Required.
 * @param {function} [opts.ownerOf]   (row) -> real owning system namespace, or null/undefined if undeterminable. Defaults to always-cortex.
 * @param {function} [opts.proofCheck] (row) -> {ok, reason}. Omit entirely for tables whose rows are already real observed data (events, measurements) with nothing external to prove them against.
 * @param {function} [opts.destRootFor] (system) -> base dir for that system's node files. Defaults to <system>/data/nodes.
 * @param {function} [opts.idOf]       (row) -> real, stable node id. Defaults to row.uuid || row.id.
 * @param {boolean}  [opts.dryRun=true]
 */
function materializeTable(opts) {
  const {
    table, nodeType, rows, toPayload, fingerprint,
    ownerOf = () => 'cortex',
    proofCheck = null,
    destRootFor = _defaultDestRoot,
    idOf = (row) => row.uuid || row.id,
    dryRun = true,
  } = opts;

  if (!table) throw new Error('[table-materializer] table is required');
  if (!nodeType) throw new Error('[table-materializer] nodeType is required');
  if (!Array.isArray(rows)) throw new Error('[table-materializer] rows must be a real array');
  if (typeof toPayload !== 'function') throw new Error('[table-materializer] toPayload(row) is required');
  if (typeof fingerprint !== 'function') throw new Error('[table-materializer] fingerprint(row) is required');
  if (!nodeSchemas.get(nodeType)) throw new Error(`[table-materializer] no real schema for type "${nodeType}" — build that first`);

  const summary = {
    table, nodeType, dryRun,
    scanned: rows.length,
    created: 0, bumped: 0, skippedUnproven: 0, skippedInvalid: 0,
    byOwner: {},
    gapsReported: [],
    errors: [],
  };

  for (const row of rows) {
    let owner, id, fp, payload;
    try {
      owner = ownerOf(row) || 'cortex';
      id = idOf(row);
      if (!id) throw new Error('idOf(row) returned no real id — cannot export without one');
      fp = fingerprint(row);
      payload = toPayload(row);
    } catch (e) {
      summary.errors.push({ row: row && (row.uuid || row.id) || '(no id)', error: e.message });
      continue;
    }

    if (proofCheck) {
      let check;
      try { check = proofCheck(row); }
      catch (e) { summary.errors.push({ row: id, error: `proofCheck threw: ${e.message}` }); continue; }
      if (!check || !check.ok) {
        summary.skippedUnproven++;
        if (!dryRun) {
          const rep = gapField.report({
            type: `table-materializer.unproven.${table}`,
            body: `Row ${id} in ${table} has no real proof of service — not materialized as a .${nodeType} node. Reason: ${(check && check.reason) || 'unspecified'}`,
            source: table,
            domain: 'system',
            severity: 'low',
            meta: { table, nodeType, rowId: id, owner },
          });
          summary.gapsReported.push(rep.gap && rep.gap.uuid);
        }
        continue;
      }
    }

    const check = nodeSchemas.checkPayload(nodeType, payload);
    if (!check.ok) {
      summary.skippedInvalid++;
      summary.errors.push({ row: id, error: `schema-invalid: missing=${check.missing.join(',')} wrongType=${JSON.stringify(check.wrongType)}` });
      continue;
    }

    const destDir = destRootFor(owner) ? path.join(destRootFor(owner), nodeType) : path.join(_defaultDestRoot(owner), nodeType);
    summary.byOwner[owner] = summary.byOwner[owner] || { created: 0, bumped: 0 };

    const existing = fs.existsSync(destDir) ? _findByFingerprint(destDir, nodeType, fp) : null;
    if (existing) {
      summary.bumped++;
      summary.byOwner[owner].bumped++;
      if (!dryRun) nodeExport.updateOccurrence(nodeType, existing.id, destDir);
    } else {
      summary.created++;
      summary.byOwner[owner].created++;
      if (!dryRun) {
        nodeExport.exportToFile(nodeType, id, payload, {
          context: `cortex/tools/table-materializer.js — decompiled from cortex JAA table "${table}"`,
          system: owner,
          source: `cortex.table-materializer.${table}`,
          fingerprint: fp,
        }, destDir);
      }
    }
  }

  return summary;
}

module.exports = { materializeTable };
