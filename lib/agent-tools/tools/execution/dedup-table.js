'use strict';
/**
 * lib/agent-tools/tools/execution/dedup-table.js — real .tool wrapper
 * around cortex/memory/table-deduplicator.js's own dedupeAll(). Built on
 * request: "the dedup tool" didn't exist as a registered .tool before this
 * — the mechanism (table-deduplicator.js) was real, nothing exposed it to
 * an agent. This wraps it, doesn't reinvent it.
 *
 * §HONEST SCOPE — this tool only ever triggers table-deduplicator.js's
 * PASS 1 (exact uuid-collision removal, always-on, never a guess). PASS 2
 * (content-level dedup) is opt-in via a caller-supplied `fingerprint(row)`
 * function in the real module — a live JS function can't cross a JSON tool
 * call, so it is deliberately NOT exposed here. An agent needing
 * content-level dedup for a specific table still needs a direct code call
 * to dedupeTable(jaa, table, {fingerprint}), same as before this tool
 * existed.
 */

function _jaa() {
  try { return require('../../../../cortex/memory/jaa-db.js').jaaDB; }
  catch (_) { return null; }
}

module.exports = {
  name: 'dedup_table',
  description:
    'Remove exact uuid-collision duplicate rows from one or more real JAA tables (cortex/memory/' +
    'table-deduplicator.js\'s always-on pass 1). Requires an explicit tables[] list — no default ' +
    'table set is guessed. Every removed batch is logged to dedup_log before the delete. Does not ' +
    'perform content-level (fingerprint-based) dedup — that requires a direct code call with a ' +
    'caller-supplied fingerprint function, which cannot cross this tool\'s JSON parameters.',
  parameters: {
    type: 'object',
    properties: {
      tables: {
        type: 'array',
        items: { type: 'string' },
        description: 'Explicit list of real JAA table names to dedupe, e.g. ["chat_log", "artifacts"]. Required — never defaulted or guessed.',
      },
    },
    required: ['tables'],
  },
  async execute({ tables }) {
    if (!Array.isArray(tables) || !tables.length) {
      return { error: 'tables[] is required and must be a non-empty array — no default table set is guessed' };
    }
    const jaa = _jaa();
    if (!jaa) return { error: 'jaaDB unavailable — cortex/memory/jaa-db.js could not be loaded' };

    const { dedupeAll } = require('../../../../cortex/memory/table-deduplicator.js');
    let results;
    try { results = dedupeAll(jaa, tables); }
    catch (e) { return { error: `dedupeAll failed: ${e.message}` }; }

    const removedTotal = results.reduce((s, r) => s + (r.removed || 0), 0);
    return {
      ok: true,
      tablesProcessed: tables.length,
      removedTotal,
      results,
      next: removedTotal
        ? `Removed ${removedTotal} duplicate row(s) — see dedup_log for the audit entries.`
        : 'No exact uuid-collision duplicates found in the given tables.',
    };
  },
};
