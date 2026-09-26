'use strict';
/**
 * loom/scanners/wiring-gaps.js — the bridge James asked for directly:
 * "component registry is supposed to be the system that detects when
 * something isn't wired." That detection already existed, twice over, and
 * neither instance reached anywhere NEXUS could act on:
 *
 *   dangling-report.js  — real, broken require()/import paths (17 files,
 *                          confirmed live this session)
 *   component-ledger.js — real writes with no hook/wire declared for them
 *                          (221 flagged live this session, via _hookWarned,
 *                          which existed but was never exported until now)
 *
 * Both were real and correct. Both only ever printed. This module is the
 * missing third piece: run both, and report every real finding through
 * lib/gap-field.js's report() — the SAME agnostic gap pipeline self-heal,
 * the escalation ladder, and copilot's own autonomous-repair already
 * listen on (confirmed this session: "gap-field.found events for
 * chunk-build exhaustion now trigger real diagnose->raid.verify->apply").
 *
 * This is the self-build loop James asked for, built from three pieces
 * that already existed and were already correct, not a fourth parallel
 * mechanism:
 *
 *   THIS FILE        — detects (dangling-report + component-ledger, now
 *                       reported as real gaps instead of console lines)
 *   gap-field.js      — the real, agnostic gap store, already wired to
 *                       copilot's autonomous-repair
 *   self_repair.js /
 *   agent-build-loop.js — the real propose/test/promote pipeline that can
 *                       already act on a gap once one exists
 *
 * §1.2 — a scan that finds nothing real reports nothing; it never
 * fabricates a gap to have something to show.
 */

const dangling = require('./dangling-report.js');
const ledger = require('../../lib/component-ledger.js');
const gapField = require('../../lib/gap-field.js');

const MODULE_ID = 'loom.scanners.wiring-gaps';
const VERSION = '1.0.0';

/**
 * scanAndReport() — runs both real scanners, reports each genuine finding
 * as a real gap. Returns a summary, not a partial guess — every count here
 * is either the number of gaps actually created or actually deduped by
 * gap-field's own existing rule (never re-created if still open).
 */
function scanAndReport() {
  const results = { danglingReported: 0, unwiredReported: 0, errors: [] };

  // ── dangling requires ────────────────────────────────────────────────
  // Uses report().wrong specifically — the scanner's own pre-filtered,
  // actionable subset (a real file of that name exists elsewhere in the
  // tree, so this is very likely a wrong path, not a legitimately absent
  // optional dependency). Confirmed shape by reading dangling-report.js
  // directly: report() returns { byFile: Map, wrong: [] }.
  try {
    const { wrong } = dangling.report();
    for (const item of wrong) {
      const r = gapField.report({
        type: 'dangling-require',
        // §FIXED live, same run: gapField's dedup_key is domain::type::source
        // only — a constant source here collapsed all 78 real, distinct
        // findings into repeat occurrences of one gap (confirmed: only 1 of
        // 78 was ever actually created before this fix). source now carries
        // the real per-finding identity the key needs.
        source: `${MODULE_ID}:${item.file}`,
        body: `${item.file} requires '${item.spec}', which does not resolve from there. A file of that name exists at: ${item.candidates.join(', ')}.`,
        domain: 'system',
        severity: 'low',
        meta: { file: item.file, spec: item.spec, candidates: item.candidates },
      });
      if (r && r.created) results.danglingReported++;
    }
  } catch (e) {
    results.errors.push(`dangling-report: ${e.message}`);
  }

  // ── unwired writes ───────────────────────────────────────────────────
  try {
    const unwired = ledger.unwiredComponents();
    for (const component of unwired) {
      const r = gapField.report({
        type: 'unwired-write',
        source: `${MODULE_ID}:${component}`,
        body: `'${component}' writes to the ledger without a declared hook/wire — the movement is recorded but not locatable in the architecture.`,
        domain: 'system',
        severity: 'low',
        meta: { component },
      });
      if (r && r.created) results.unwiredReported++;
    }
  } catch (e) {
    results.errors.push(`component-ledger: ${e.message}`);
  }

  return results;
}

module.exports = { scanAndReport, MODULE_ID, VERSION };
