'use strict';
/**
 * lib/opportunity/store.js — the opportunity pipeline's persistence: cortex's JAA store, six tables, one ledger.
 * comp_id: nexus.lib.opportunity.store
 * Version: 1.0.0
 *
 * TABLES (none decays — they are not in cortex/memory/tiers.js TABLE_TIERS, so they are long-lived by default):
 *   opportunity_profile    one row per profile ('default' unless named): who James is on paper, what he wants
 *   opportunities          one row per job/gig/lead, with stage, score, drafts, fill report, failure_log, history
 *   opportunity_ledger     append-only: every transition and every action. shortid | ts | type | shape | tags | context | progress
 *   opportunity_answers    the answer bank: reusable answers to screening questions, approved by James before reuse
 *   opportunity_templates  the drafting prompts, editable (defaults in draft.js; a stored edit is never overwritten)
 *   opportunity_recipes    per-site overrides (reply box selector, submit button text) James can fix without code
 *   opportunity_outcomes   0.39.272 — one row per result (responded/interview/offer/rejected/no_response): what gets learned from
 * Tests write to a sandbox automatically (lib/test-sandbox.js via cortex/memory/jaa-db.js).
 */

const crypto = require('crypto');

const T = Object.freeze({
  profile: 'opportunity_profile', opps: 'opportunities', ledger: 'opportunity_ledger',
  answers: 'opportunity_answers', templates: 'opportunity_templates', recipes: 'opportunity_recipes',
  outcomes: 'opportunity_outcomes',   // 0.39.272 (L4) — what each application led to
});

function jaa() { return require('../../cortex/memory/jaa-db.js').jaaDB; }
const shortid = () => crypto.randomBytes(4).toString('hex');

function ledger(type, { oppId = null, shape = null, tags = [], context = null, progress = null } = {}) {
  const row = { id: crypto.randomUUID(), shortid: shortid(), ts: Date.now(), type, oppId, shape, tags, context, progress };
  try { jaa().insert(T.ledger, row); } catch (e) { console.warn(`[opportunity] ledger write failed (${type}): ${e.message}`); }
  return row;
}

function ledgerFor(oppId, limit = 50) {
  return jaa().query(T.ledger, r => r.oppId === oppId).sort((a, b) => a.ts - b.ts).slice(-limit);
}

module.exports = { T, jaa, ledger, ledgerFor, shortid };
