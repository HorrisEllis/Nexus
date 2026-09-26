'use strict';
/**
 * lib/idea-provenance.js — the tagging discipline that makes idearium a safe
 * landing zone for AI-proposed ideas.
 * comp_id: nexus.lib.idea-provenance
 * UUID: nexus-idea-provenance-v1-0000-2026-0809-001
 * Version: 0.1.0
 *
 * WHY (James, 2026-08-09): "if idearium is the landing zone... needs to have
 * extensive tagging system to differentiate user from agent."
 *
 * Right, and the current state makes the point. Every idea in idearium_ideas
 * today carries freeform tags — ["test"], ["e2e"] — and a freeform `source`
 * (verify, e2e). There is NO way to tell an idea James had from one a machine
 * produced. The moment copilot can land ideas there, that distinction is the
 * most important field in the row, and it does not exist.
 *
 * ── THE ONE RULE THAT MATTERS ───────────────────────────────────────────────
 * AN AGENT CANNOT ACCEPT ITS OWN PROPOSAL. review() refuses any accept whose
 * reviewer is an agent. Without that, a system that proposes improvements to
 * itself and approves them is not adaptive, it is unsupervised — and the accept
 * /reject surface is decoration. This is enforced in code, not in a convention.
 *
 * ── EVIDENCE, NOT WISHES ────────────────────────────────────────────────────
 * An agent proposal REQUIRES evidence: what it observed, and where. A proposal
 * with no evidence is a wish, and a queue of wishes trains the reviewer to stop
 * reading the queue. Evidence names its source — a lens reading, a movement
 * snapshot, a manifest sigma, a failing test — so a reviewer can go and look.
 *
 * ── NAMESPACED TAGS, SO A FILTER IS EXACT ───────────────────────────────────
 * Freeform tags cannot be filtered reliably: "test" means three things. Every
 * provenance tag here is `namespace:value`, validated against a closed
 * vocabulary. An unknown namespace is REFUSED rather than stored, because a tag
 * nobody can filter on is worse than no tag — it looks like structure.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TABLE = 'idearium_ideas';

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

// ── The vocabulary. Closed on purpose. ──────────────────────────────────────
const TAG_NS = Object.freeze({
  // WHO produced it. The distinction James asked for, first-class.
  origin:   ['user', 'agent', 'system'],
  // WHICH agent, when origin:agent. Open value, but the namespace is required.
  agent:    null,
  // WHAT it is about — improving NEXUS, the AI itself, or the user's work.
  about:    ['nexus', 'self', 'user', 'process'],
  // WHERE the idea came from — required for origin:agent.
  evidence: ['lens', 'movement', 'manifest', 'test', 'gap', 'sigma', 'ledger', 'observation'],
  // Review state. Only a human review moves this off `proposed`.
  status:   ['proposed', 'accepted', 'rejected', 'built', 'superseded'],
  // Which system it concerns. Open value.
  system:   null,
  // How much it would cost/risk, as the proposer sees it — a claim, not a fact.
  effort:   ['small', 'medium', 'large', 'unknown'],
});

const AGENT_ORIGINS = new Set(['agent', 'system']);

/** parse a "ns:value" tag. Returns null for anything malformed. */
function parseTag(t) {
  if (typeof t !== 'string') return null;
  const i = t.indexOf(':');
  if (i < 1 || i === t.length - 1) return null;
  return { ns: t.slice(0, i), value: t.slice(i + 1) };
}

/** validateTags(tags) — every tag must be a KNOWN namespace with a legal value. */
function validateTags(tags) {
  const errors = [];
  const seen = {};
  for (const t of tags || []) {
    const p = parseTag(t);
    if (!p) { errors.push(`"${t}": tags must be namespace:value — freeform tags cannot be filtered on`); continue; }
    if (!(p.ns in TAG_NS)) { errors.push(`"${t}": unknown namespace "${p.ns}" — one of: ${Object.keys(TAG_NS).join(', ')}`); continue; }
    const allowed = TAG_NS[p.ns];
    if (allowed && !allowed.includes(p.value)) { errors.push(`"${t}": ${p.ns} must be one of ${allowed.join(' | ')}`); continue; }
    (seen[p.ns] = seen[p.ns] || []).push(p.value);
  }
  if (seen.origin && seen.origin.length > 1) errors.push(`origin declared ${seen.origin.length} times — an idea has ONE origin`);
  return { ok: errors.length === 0, errors, byNs: seen };
}

function tagsOf(idea) { return Array.isArray(idea && idea.tags) ? idea.tags : []; }
function nsValue(idea, ns) {
  for (const t of tagsOf(idea)) { const p = parseTag(t); if (p && p.ns === ns) return p.value; }
  return null;
}
const originOf = (idea) => nsValue(idea, 'origin');
const statusOf = (idea) => nsValue(idea, 'status') || 'proposed';

/**
 * propose(idea) — land an idea in idearium with enforced provenance.
 * @param idea { text, slug?, origin, agent?, about, evidence: [{kind, detail, where}], system?, effort? }
 */
function propose(idea = {}) {
  const errors = [];
  if (!idea.text || String(idea.text).trim().length < 20) errors.push('text: required, >=20 chars — state the idea, not a title');
  if (!idea.origin || !TAG_NS.origin.includes(idea.origin)) errors.push(`origin: required, one of ${TAG_NS.origin.join(' | ')}`);
  if (!idea.about || !TAG_NS.about.includes(idea.about)) errors.push(`about: required, one of ${TAG_NS.about.join(' | ')}`);

  const isAgent = AGENT_ORIGINS.has(idea.origin);
  if (isAgent && !idea.agent) errors.push('agent: required when origin is agent/system — an anonymous machine proposal cannot be traced');

  // §EVIDENCE — required from agents, optional from the user. A person is
  // allowed to have a hunch; a machine proposing changes to the system it runs
  // on is not, because nobody can check a hunch it cannot show.
  const ev = Array.isArray(idea.evidence) ? idea.evidence : [];
  if (isAgent) {
    if (!ev.length) errors.push('evidence: required for agent proposals — a proposal with no evidence is a wish, and a queue of wishes stops being read');
    ev.forEach((e, i) => {
      if (!e || !TAG_NS.evidence.includes(e.kind)) errors.push(`evidence[${i}].kind: one of ${TAG_NS.evidence.join(' | ')}`);
      if (!e || !e.detail) errors.push(`evidence[${i}].detail: required — what was observed`);
      if (!e || !e.where) errors.push(`evidence[${i}].where: required — file, route, table or command a reviewer can go and check`);
    });
  }
  if (errors.length) return { ok: false, errors, vocabulary: TAG_NS };

  const tags = [
    `origin:${idea.origin}`,
    `about:${idea.about}`,
    'status:proposed',
    `effort:${TAG_NS.effort.includes(idea.effort) ? idea.effort : 'unknown'}`,
  ];
  if (idea.agent) tags.push(`agent:${idea.agent}`);
  if (idea.system) tags.push(`system:${idea.system}`);
  for (const e of ev) tags.push(`evidence:${e.kind}`);

  const v = validateTags(tags);
  if (!v.ok) return { ok: false, errors: v.errors, vocabulary: TAG_NS };

  // §RE-PROPOSAL — an idea rejected before is not silently landed again. It is
  // allowed, but flagged with the prior rejection, because a machine re-raising
  // something a human already declined is itself the signal.
  const priorRejections = list({ status: 'rejected' })
    .filter(r => _similar(r.text, idea.text));

  const row = {
    slug: idea.slug || _slug(idea.text),
    text: String(idea.text),
    tags,
    phase: 'seed',
    source: isAgent ? `proposal:${idea.agent}` : 'proposal:user',
    evidence: ev,
    proposedAt: Date.now(),
    // Review fields exist from birth, empty. A row that gains fields on accept
    // is a row whose shape tells you the answer before you read it.
    reviewedBy: null, reviewedAt: null, reviewNote: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };

  const jaa = _jaa();
  if (!jaa) return { ok: false, errors: ['JAA unavailable — nothing was landed'] };
  try { jaa.insert(TABLE, row); }
  catch (e) { return { ok: false, errors: [`could not land the idea: ${e.message}`] }; }

  return {
    ok: true, slug: row.slug, tags, status: 'proposed',
    priorRejections: priorRejections.length
      ? priorRejections.map(r => ({ slug: r.slug, note: r.reviewNote, at: r.reviewedAt }))
      : undefined,
    note: priorRejections.length
      ? 'A similar idea was REJECTED before. It is landed anyway and flagged — a machine re-raising a declined idea is itself worth a reviewer seeing.'
      : undefined,
  };
}

/**
 * review(slug, decision, opts) — accept or reject. HUMAN ONLY for accept.
 */
function review(slug, decision, opts = {}) {
  if (!['accepted', 'rejected', 'built', 'superseded'].includes(decision)) {
    return { ok: false, reason: `decision must be accepted | rejected | built | superseded` };
  }
  const reviewer = opts.reviewer;
  if (!reviewer) return { ok: false, reason: 'reviewer required — an unattributed decision cannot be audited' };

  // ── THE RULE ─────────────────────────────────────────────────────────────
  // A system that proposes improvements to itself and approves them is not
  // adaptive, it is unsupervised, and the accept/reject surface is decoration.
  if (decision === 'accepted' && opts.reviewerKind !== 'user') {
    return { ok: false, reason: `refused: only a USER can accept a proposal (reviewerKind was "${opts.reviewerKind || 'unset'}"). An agent may propose and may reject its own, never accept.` };
  }
  if (decision === 'rejected' && !opts.note) {
    return { ok: false, reason: 'a rejection requires a note — an unexplained rejection teaches the proposer nothing, and it will be re-proposed' };
  }

  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  const rows = (jaa.query(TABLE, () => true, 5000) || []).filter(r => r.slug === slug);
  if (!rows.length) return { ok: false, reason: `no idea with slug "${slug}"` };

  const row = rows[rows.length - 1];
  const tags = tagsOf(row).filter(t => !String(t).startsWith('status:')).concat(`status:${decision}`);
  try {
    jaa.update(TABLE, row.uuid || row.id, {
      tags, reviewedBy: reviewer, reviewerKind: opts.reviewerKind || null,
      reviewedAt: Date.now(), reviewNote: opts.note || null, updatedAt: Date.now(),
    });
  } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: true, slug, status: decision, reviewedBy: reviewer };
}

/** list(filter) — filter EXACTLY, by namespace. */
function list(filter = {}) {
  const jaa = _jaa();
  if (!jaa) return [];
  let rows;
  try { rows = jaa.query(TABLE, () => true, 5000) || []; } catch (_) { return []; }
  return rows.filter(r => {
    if (filter.origin && originOf(r) !== filter.origin) return false;
    if (filter.status && statusOf(r) !== filter.status) return false;
    if (filter.about && nsValue(r, 'about') !== filter.about) return false;
    if (filter.agent && nsValue(r, 'agent') !== filter.agent) return false;
    if (filter.system && nsValue(r, 'system') !== filter.system) return false;
    return true;
  });
}

/** pending() — the review queue. Agent proposals first: they are the ones that accumulate. */
function pending() {
  const rows = list({ status: 'proposed' });
  return rows.sort((a, b) => {
    const aa = AGENT_ORIGINS.has(originOf(a)) ? 0 : 1;
    const bb = AGENT_ORIGINS.has(originOf(b)) ? 0 : 1;
    return aa - bb || (b.proposedAt || 0) - (a.proposedAt || 0);
  });
}

/** stats() — the honest picture, including how much is UNTAGGED legacy. */
function stats() {
  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  const rows = jaa.query(TABLE, () => true, 5000) || [];
  const byOrigin = {}, byStatus = {};
  let untagged = 0;
  for (const r of rows) {
    const o = originOf(r);
    // §1.2 — pre-existing rows have freeform tags and NO origin. They are
    // counted as untagged, never bucketed into user or agent by guessing.
    if (!o) { untagged++; continue; }
    byOrigin[o] = (byOrigin[o] || 0) + 1;
    byStatus[statusOf(r)] = (byStatus[statusOf(r)] || 0) + 1;
  }
  return { ok: true, total: rows.length, byOrigin, byStatus, untagged,
    untaggedNote: untagged ? `${untagged} pre-existing ideas carry no origin tag — they are NOT counted as user or agent, because assigning one would be a guess` : undefined };
}

function _slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'idea';
}
function _similar(a, b) {
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 3);
  const A = new Set(norm(a)), B = norm(b);
  if (!A.size || !B.length) return false;
  const overlap = B.filter(w => A.has(w)).length / B.length;
  return overlap > 0.6;
}

module.exports = { TAG_NS, propose, review, list, pending, stats, validateTags, parseTag, originOf, statusOf, TABLE, VERSION: '0.1.0' };
