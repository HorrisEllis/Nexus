'use strict';
/**
 * lib/agent-tools/tools/propose-idea.js — copilot proposes improvements.
 * comp_id: nexus.lib.agent-tools.propose-idea
 * UUID: nexus-tool-propose-v1-0000-2026-0809-001
 *
 * Idearium is the landing zone; lib/idea-provenance.js is the discipline that
 * keeps a machine proposal distinguishable from one James had.
 *
 * You may PROPOSE and you may REJECT your own. You may never ACCEPT — that is
 * refused in code, not by convention. A system that proposes changes to itself
 * and approves them is unsupervised, and the review surface is decoration.
 *
 * Evidence is required. State what you OBSERVED and WHERE a reviewer can go and
 * check it. A proposal without evidence is a wish, and a queue of wishes stops
 * being read — which costs you every future proposal, not just this one.
 */
const path = require('path');
const P = require(path.join(__dirname, '../../../idea-provenance.js'));

const ACTIONS = {
  vocabulary: () => ({ ok: true, tagNamespaces: P.TAG_NS,
    rules: [
      'origin, about and text are required; evidence is required when origin is agent',
      'every evidence item needs { kind, detail, where } — where must be checkable',
      'an agent can propose and can reject its own; only a user can accept',
      'a rejection requires a note, or the idea will simply be re-proposed',
    ],
    example: { text: 'axiom_check reports passed:true for every input because the axioms table is empty',
      origin: 'agent', agent: 'claude', about: 'nexus', system: 'copilot', effort: 'small',
      evidence: [{ kind: 'lens', detail: 'axioms lens returns UNAVAILABLE, axiomCount 0', where: 'copilot/axiom-manager' }] } }),

  propose: (a) => P.propose({ ...a.idea, origin: (a.idea && a.idea.origin) || 'agent', agent: (a.idea && a.idea.agent) || 'copilot' }),

  pending: () => ({ ok: true, queue: P.pending().map(_brief),
    note: 'Agent proposals sort first — they are the ones that accumulate unread.' }),

  list: (a) => ({ ok: true, ideas: P.list({ origin: a.origin, status: a.status, about: a.about, system: a.system }).map(_brief) }),

  stats: () => P.stats(),

  reject: (a) => (a.slug && a.note)
    ? P.review(a.slug, 'rejected', { reviewer: a.reviewer || 'copilot', reviewerKind: 'agent', note: a.note })
    : { error: 'slug and note required — an unexplained rejection teaches nothing' },

  accept: () => ({ error: 'refused: an agent cannot accept a proposal. Use the review UI at /ideas, or have a user call review() with reviewerKind "user".' }),
};

function _brief(r) {
  return { slug: r.slug, text: String(r.text).slice(0, 160), tags: r.tags,
           origin: P.originOf(r), status: P.statusOf(r),
           evidence: (r.evidence || []).map(e => `${e.kind}: ${e.where}`),
           reviewedBy: r.reviewedBy || undefined, reviewNote: r.reviewNote || undefined };
}

module.exports = {
  name: 'propose_idea',
  description:
    'Propose an improvement to NEXUS, to yourself, to the user\'s process — it lands in idearium as a ' +
    'reviewable idea tagged with its provenance, so a machine proposal is never confused with one the ' +
    'user had. Actions: "vocabulary" (the required tags and an example — read this first), "propose", ' +
    '"pending" (the review queue), "list" (filter by origin/status/about/system), "stats", "reject" ' +
    '(with a mandatory note). You CANNOT accept — only a user can. Evidence is mandatory: say what you ' +
    'observed and where it can be checked.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      idea:   { type: 'object', description: '{ text, about, system?, effort?, evidence:[{kind,detail,where}] } — see action "vocabulary"' },
      origin: { type: 'string', description: 'filter: user | agent | system' },
      status: { type: 'string', description: 'filter: proposed | accepted | rejected | built | superseded' },
      about:  { type: 'string', description: 'filter: nexus | self | user | process' },
      system: { type: 'string' },
      slug:   { type: 'string', description: 'for reject' },
      note:   { type: 'string', description: 'required reason when rejecting' },
      reviewer: { type: 'string' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `propose_idea ${args.action} failed: ${e.message}` }; }
  },
};
