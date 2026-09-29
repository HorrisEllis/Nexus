'use strict';
/**
 * lib/agent-tools/tools/opportunity/opportunity.js — nexus.opportunity.tool: the job/freelance pipeline for agents.
 * comp_id: nexus.agent-tools.opportunity
 * Version: 1.0.0
 *
 * Everything lib/opportunity does, except the two things only James does: approving an application and editing his
 * drafting templates. An agent asked to approve is told how James approves (CLI / HTTP / UI) — refused in code, not by
 * a prompt instruction. Submission by an agent goes through submit(by:'agent'): approved by James + policy 'auto' +
 * the platform's terms acknowledged where they forbid automation.
 */

const { toolName } = require('../../naming.js');
const O = () => require('../../../opportunity');

const HOW_JAMES_APPROVES = 'approval is James\'s: `node cli/opportunity.js approve <id>`, POST :3750/api/opportunity/<id>/approve, or set policy.<platform>.autoApproveAbove';

const ACTIONS = {
  status:        () => ({ ok: true, ...O().status() }),
  profile_get:   () => ({ ok: true, profile: O().getProfile() }),
  profile_set:   (a) => O().setProfile(a.profile || {}),
  import_resume: (a) => O().importResume(a.path),
  source_types:  () => ({ ok: true, types: Object.entries(O().sources.TYPES).map(([k, v]) => ({ type: k, needs: v.needs, describe: v.describe })) }),
  cycle:         (a) => O().cycle({ draft: typeof a.draft === 'number' ? a.draft : null }),
  rescore:       () => O().rescore(),
  list:          (a) => ({ ok: true, items: O().list({ stage: a.stage, kind: a.kind, limit: a.limit || 30, minScore: a.minScore ?? null, q: a.query || null }) }),
  show:          (a) => O().show(a.id),
  capture:       (a) => O().capture({ agentId: a.agentId || 'default', kind: a.kind || null }),
  draft:         (a) => O().draftFor(a.id, { kind: a.kind || null, extra: a.extra || {} }),
  dismiss:       (a) => O().dismiss(a.id, { by: 'agent', note: a.note || null }),
  approve:       () => ({ ok: false, error: HOW_JAMES_APPROVES, userOnly: true }),
  prepare:       (a) => O().prepare(a.id),
  prepare_reply: (a) => O().prepareReply(a.id, { kind: a.kind || null }),
  submit:        (a) => O().submit(a.id, { by: 'agent' }),
  mark:          (a) => O().markResponse(a.id, a.stage, { note: a.note || null, by: 'agent' }),
  followups:     () => O().followups(),
  answers:       (a) => ({ ok: true, answers: O().answers.list({ approvedOnly: !!a.approvedOnly }).map(r => ({ id: r.id, question: r.question, answer: r.answer, approved: r.approvedBy === 'user', uses: r.uses || 0 })) }),
  answer_add:    (a) => O().answers.add({ question: a.question, answer: a.answer, by: 'agent' }),
  answer_for:    (a) => ({ ok: true, match: O().answers.answerFor(a.question, O().getProfile(), { options: a.options || null }) }),
  templates:     () => ({ ok: true, templates: O().drafting.listTemplates() }),
  recipe_set:    (a) => O().setRecipe(a.host, a.recipe || {}),
  learned:       () => ({ ok: true, ...O().learnedWeights() }),   // 0.39.272 (L4) — what outcomes taught the scoring
  identity:      async () => { const p = await O().effectiveProfile(); return { ok: true, identitySource: p.identitySource, contact: p.contact, links: p.links, resumePath: p.resumePath || null }; },
};

module.exports = {
  name: toolName('nexus', 'opportunity'),
  description:
    'Job applications, freelance gigs and Fiverr/Upwork leads, end to end. status (what waits on James) · profile_get/' +
    'profile_set{profile} · import_resume{path} · source_types · cycle{draft?} (fetch sources, score, shortlist, draft top N) · ' +
    'list{stage?,kind?,query?} · show{id} · capture{agentId} (the job/gig/message on a Clear Glass page → pipeline) · ' +
    'draft{id,kind?: cover_letter|proposal|fiverr_reply|screening_answer|follow_up|gig_description, extra?} · dismiss{id} · ' +
    'prepare{id} (open + fill the application in Clear Glass, stops before submit) · prepare_reply{id} (type the approved ' +
    'reply into a Fiverr/Upwork thread) · submit{id} (only under James\'s auto policy) · mark{id,stage} · followups · ' +
    'answers / answer_add{question,answer} / answer_for{question,options?} · templates · recipe_set{host,recipe} · learned (what ' +
    'outcomes taught the scoring) · identity (who the forms are filled as — from James\'s Clear Glass autofill profile). ' +
    'approve is James\'s only.',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', enum: Object.keys(ACTIONS) },
      id:       { type: 'string', description: 'opportunity id (a unique prefix works)' },
      profile:  { type: 'object' }, path: { type: 'string' },
      draft:    { type: 'number', description: 'cycle: how many top shortlisted to draft (default profile.draftTop)' },
      stage:    { type: 'string' }, kind: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number' }, minScore: { type: 'number' },
      agentId:  { type: 'string' }, extra: { type: 'object' }, note: { type: 'string' },
      question: { type: 'string' }, answer: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, approvedOnly: { type: 'boolean' },
      host:     { type: 'string' }, recipe: { type: 'object' },
    },
    required: ['action'],
  },
  async execute(a = {}) {
    const fn = ACTIONS[a.action];
    if (!fn) return { ok: false, error: `unknown action "${a.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(a); } catch (e) { return { ok: false, error: e.message }; }
  },
  HOW_JAMES_APPROVES,
};
