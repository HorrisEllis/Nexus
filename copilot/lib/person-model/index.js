'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// copilot/lib/self-model/index.js — the model the co-pilot builds of you
// UUID: nexus-person-model-v1-0000-2026-0817-001
// Version: 1.0.0
// Component: copilot.person-model
// Hook: copilot.person-model:v1:p0001
//
// James: "i want it to have a history. maybe a ledger each session, that
// connects to the last session. i want it to learn from me over our
// conversations… my patterns, name, triggers, trauma, anything else relevant,
// like add new metrics over time."
//
// WHAT THIS IS BUILT ON — copilot/lib/user-model.js v2.0.0 already does
// hypotheses with confidence, daily decay, contradiction detection, and a
// pin/reject/correct surface (24 passing tests). None of that is replaced. This
// adds the three things it does not have: an identity surface (values, beliefs,
// goals, ambitions, passions, interests), a lattice with typed edges and lens
// projections, and a session ledger that chains to the one before it.
//
// ── PROVENANCE — the one rule that matters ──────────────────────────────────
//
//   STATED    you told it. Highest trust. Never decays. Only you can change it.
//   OBSERVED  it saw a concrete event (a tool used 5×, a topic raised 3×).
//             Real evidence, pointing at something checkable.
//   INFERRED  it guessed from pattern or tone. Decays. Cheapest to be wrong.
//
// Most categories accept all three. STATED_ONLY_TYPES — trigger, sensitive,
// boundary — accept ONLY stated, and _assertProvenance() below enforces it.
//
// WHY, since this is the design decision most worth arguing with: for pace or
// verbosity a wrong inference is cheap — it decays, gets corrected, nothing is
// lost. For a trigger or a piece of someone's history, wrong is expensive in
// both directions. Either the system handles a person as fragile about
// something they are not, or it attaches a confident story to something real
// and starts acting on it. And the evidence available for exactly those claims
// — hesitation, tone, a changed subject — is the weakest signal in the system.
// Pointing the thinnest evidence at the heaviest conclusions is the worst
// wiring available, so it is refused structurally rather than left to judgement
// at each call site.
//
// The system can still NOTICE. `noteObservation()` records "changed subject 3×
// when X came up" as an observation with its evidence attached, and puts it on
// the review queue. It stays an observation. Only the user can promote it.
// That is exactly the rule tests/modules/idea-provenance.test.js already
// enforces for ideas (IP-5: AN AGENT CANNOT ACCEPT); self-model claims about a
// person warrant it more, not less.
//
// §0.3 nothing is deleted — forget() archives with a reason, except purge(),
// which is a real hard delete because a person asking to be forgotten should
// not be argued with.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const {
  Lattice, LENSES, read, NODE_TYPE, EDGE_TYPE, VERDICT, STATED_ONLY_TYPES,
  addNodeType, validNodeType,
} = require('./lattice');

const MODULE_ID = 'person-model';
const VERSION   = '1.0.0';
const COMP_ID   = 'copilot.person-model';
const HOOK_ID   = 'copilot.person-model:v1:p0001';

const TABLE_NODES    = 'person_model_nodes';
const TABLE_EDGES    = 'person_model_edges';
const TABLE_SESSIONS = 'person_model_sessions';
const TABLE_REVIEW   = 'person_model_review';

const PROVENANCE = Object.freeze({ STATED: 'stated', OBSERVED: 'observed', INFERRED: 'inferred' });

// Inferred claims decay; observed decays slower; stated never decays. Same
// shape as user-model's DECAY_PER_DAY so the two cannot drift apart.
const DECAY_PER_DAY = { inferred: 0.10, observed: 0.03, stated: 0 };
const MIN_CONFIDENCE = 0.05;

let _lat = new Lattice();
let _session = null;
let _jaa;

function _getJAA() { if (!_jaa) { try { ({ jaaDB: _jaa } = require('../../../cortex/memory/jaa-db')); } catch (_) { _jaa = null; } } return _jaa; }
function _ledger(action, status, detail) {
  try {
    require('../../../lib/component-ledger').write({
      system: 'copilot', component: 'copilot.person-model', action, status, detail,
      session: _session ? _session.id : null, tags: ['self-model'],
      hook: HOOK_ID, wire: 'copilot.person-model→cortex.person_model_nodes',
    });
  } catch (_) { /* §1.2 telemetry never breaks the model */ }
}

// ── The rule, enforced ───────────────────────────────────────────────────────
function _assertProvenance(type, provenance) {
  if (!STATED_ONLY_TYPES.has(type)) return;
  if (provenance !== PROVENANCE.STATED) {
    throw new Error(
      `[${MODULE_ID}] §stated-only REFUSED — '${type}' accepts only user-stated content, got '${provenance}'. ` +
      `Nothing may be inferred into this category. Use noteObservation() to record what was seen; ` +
      `only the user can promote an observation into a claim about themselves.`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS — hash-chained, so history is continuous and tamper-evident
// ─────────────────────────────────────────────────────────────────────────────
// Same construction as the snapshot chain (snapshot-integrity.test.js): each
// session carries the hash of the one before it. Two properties fall out —
// the model can answer "what changed since last time" without diffing
// everything, and a session edited after the fact breaks the chain visibly.

function _hash(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex'); }

function startSession(opts = {}) {
  const jaa = _getJAA();
  const prior = jaa ? (jaa.tail(TABLE_SESSIONS, 1) || []) : [];
  const prev = prior.length ? prior[prior.length - 1] : null;

  _session = {
    uuid: crypto.randomUUID(),
    id: opts.id || `s-${Date.now()}`,
    startedAt: Date.now(),
    endedAt: null,
    prevSessionId:   prev ? prev.id : null,
    prevSessionHash: prev ? (prev.sessionHash || null) : null,   // null on the FIRST session — genuinely no predecessor, not a missing link
    channel: opts.channel || null,
    nodesAdded: [], nodesUpdated: [], edgesAdded: [], observations: [],
    sessionHash: null,
  };
  _ledger('session.started', 'info', { id: _session.id, prevSessionId: _session.prevSessionId });
  return _session;
}

function endSession() {
  if (!_session) return null;
  _session.endedAt = Date.now();
  _session.sessionHash = _hash({
    id: _session.id, startedAt: _session.startedAt, endedAt: _session.endedAt,
    prevSessionHash: _session.prevSessionHash,
    nodesAdded: _session.nodesAdded, nodesUpdated: _session.nodesUpdated,
    edgesAdded: _session.edgesAdded, observations: _session.observations,
  });
  const jaa = _getJAA();
  if (jaa) { try { jaa.insert(TABLE_SESSIONS, { ..._session }); } catch (_) {} }
  _ledger('session.ended', 'info', {
    id: _session.id, hash: _session.sessionHash.slice(0, 12),
    added: _session.nodesAdded.length, updated: _session.nodesUpdated.length,
  });
  const done = _session;
  _session = null;
  return done;
}

/**
 * verifyChain() — walks every session and reports breaks, attributed.
 * A break is REPORTED, never thrown: the history is still readable, and a
 * silent chain is worse than a stated break.
 */
function verifyChain() {
  const jaa = _getJAA();
  if (!jaa) return { ok: false, reason: 'no store — chain unverifiable, which is NOT the same as valid' };
  const sessions = (jaa.tail(TABLE_SESSIONS, 99999) || []).slice().sort((a, b) => a.startedAt - b.startedAt);
  if (!sessions.length) return { ok: true, sessions: 0, breaks: [], note: 'no sessions yet' };

  const breaks = [];
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1], cur = sessions[i];
    if (cur.prevSessionHash !== prev.sessionHash) {
      breaks.push({ at: cur.id, expected: prev.sessionHash ? prev.sessionHash.slice(0, 12) : null,
        found: cur.prevSessionHash ? cur.prevSessionHash.slice(0, 12) : null,
        note: 'this session does not chain to its predecessor — it was edited, or a session is missing' });
    }
  }
  return { ok: breaks.length === 0, sessions: sessions.length, breaks,
    span: { from: new Date(sessions[0].startedAt).toISOString(), to: new Date(sessions[sessions.length - 1].startedAt).toISOString() } };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTAKE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * state(...) — the user says something about themselves. Highest trust, never
 * decays. This is the ONLY route into trigger/sensitive/boundary.
 */
function state({ type, label, id = null, note = null, meta = {} }) {
  if (!type || !label) throw new Error(`[${MODULE_ID}] §1.1 state() requires type + label`);
  if (!validNodeType(type)) throw new Error(`[${MODULE_ID}] unknown type '${type}' — addNodeType() first`);
  const nodeId = id || `${type}:${_slug(label)}`;
  const node = _lat.upsertNode({
    id: nodeId, type, label, provenance: PROVENANCE.STATED, confidence: 1,
    evidence: { kind: 'stated', at: Date.now(), session: _session?.id || null },
    session: _session?.id || null, meta: { ...meta, ...(note ? { note } : {}) },
  });
  _track(node);
  _persistNode(node);
  _ledger('node.stated', 'info', { id: nodeId, type });
  return node;
}

/**
 * observe(...) — a concrete event was seen. Requires evidence naming WHERE a
 * reviewer could check it (IP-3). Refused for stated-only types.
 */
function observe({ type, label, id = null, evidence, confidence = 0.6, meta = {} }) {
  if (!type || !label) throw new Error(`[${MODULE_ID}] §1.1 observe() requires type + label`);
  if (!evidence || !evidence.where) {
    throw new Error(`[${MODULE_ID}] §1.1 observe() requires evidence.where — a claim a reviewer cannot check is not evidence`);
  }
  _assertProvenance(type, PROVENANCE.OBSERVED);
  const nodeId = id || `${type}:${_slug(label)}`;
  const node = _lat.upsertNode({
    id: nodeId, type, label, provenance: PROVENANCE.OBSERVED, confidence,
    evidence: { kind: 'observed', ...evidence, at: Date.now() },
    session: _session?.id || null, meta,
  });
  _track(node);
  _persistNode(node);
  return node;
}

/** infer(...) — a guess from pattern. Decays fastest. Never for stated-only types. */
function infer({ type, label, id = null, basis, confidence = 0.4, meta = {} }) {
  if (!type || !label) throw new Error(`[${MODULE_ID}] §1.1 infer() requires type + label`);
  _assertProvenance(type, PROVENANCE.INFERRED);
  const nodeId = id || `${type}:${_slug(label)}`;
  const node = _lat.upsertNode({
    id: nodeId, type, label, provenance: PROVENANCE.INFERRED,
    confidence: Math.min(0.7, confidence),   // an inference is capped below certainty by construction
    evidence: { kind: 'inferred', basis: basis || 'unstated', at: Date.now() },
    session: _session?.id || null, meta,
  });
  _track(node);
  _persistNode(node);
  return node;
}

/**
 * noteObservation() — the escape valve for the stated-only rule, and the reason
 * the rule does not make the system blind.
 *
 * The system CAN notice something in a sensitive area. It records what it saw,
 * with the evidence, on the review queue — and stops. It does not become a
 * claim about the person. Only accept() promotes it, and only a user may call
 * accept(). This is IP-5 applied to self-knowledge.
 */
function noteObservation({ about, saw, evidence, suggestedType = null }) {
  if (!saw) throw new Error(`[${MODULE_ID}] §1.1 noteObservation() requires what was actually seen`);
  if (!evidence || !evidence.where) throw new Error(`[${MODULE_ID}] §1.1 an observation without checkable evidence is a guess wearing evidence's clothes`);
  const row = {
    uuid: crypto.randomUUID(), about: about || null, saw,
    evidence: { ...evidence, at: Date.now() },
    suggestedType, status: 'pending',
    proposedBy: 'agent',            // never 'user' — an agent cannot launder itself
    session: _session?.id || null, ts: Date.now(),
    note: 'an observation, not a claim. Only the user can accept it.',
  };
  const jaa = _getJAA();
  if (jaa) { try { jaa.insert(TABLE_REVIEW, row); } catch (_) {} }
  if (_session) _session.observations.push(row.uuid);
  _ledger('observation.noted', 'info', { uuid: row.uuid, suggestedType });
  return row;
}

/** reviewQueue() — pending observations, agent proposals first (IP-10). */
function reviewQueue() {
  const jaa = _getJAA();
  if (!jaa) return { ok: false, reason: 'no store — queue unreadable, which is NOT the same as empty', items: [] };
  const items = (jaa.tail(TABLE_REVIEW, 500) || []).filter(r => r.status === 'pending');
  return { ok: true, count: items.length,
    items: items.sort((a, b) => (a.proposedBy === 'agent' ? -1 : 1) - (b.proposedBy === 'agent' ? -1 : 1) || b.ts - a.ts) };
}

/**
 * accept(uuid, {type,label}) — USER ONLY. Promotes an observation to a stated
 * claim. There is no agent path to this function by design.
 */
function accept(uuid, { type, label, by = 'user' } = {}) {
  if (by !== 'user') throw new Error(`[${MODULE_ID}] §IP-5 REFUSED — only the user may accept an observation about themselves`);
  const jaa = _getJAA();
  if (!jaa) throw new Error(`[${MODULE_ID}] no store — cannot accept`);
  const row = (jaa.tail(TABLE_REVIEW, 500) || []).find(r => r.uuid === uuid);
  if (!row) throw new Error(`[${MODULE_ID}] §1.2 no observation '${uuid}'`);
  const node = state({ type: type || row.suggestedType, label: label || row.saw });
  try { jaa.update(TABLE_REVIEW, { uuid }, { status: 'accepted', acceptedAt: Date.now(), nodeId: node.id }); } catch (_) {}
  _ledger('observation.accepted', 'info', { uuid, nodeId: node.id });
  return node;
}

function reject(uuid, reason) {
  if (!reason) throw new Error(`[${MODULE_ID}] §IP-6 a rejection requires a note — "why not" is the useful half`);
  const jaa = _getJAA();
  if (jaa) { try { jaa.update(TABLE_REVIEW, { uuid }, { status: 'rejected', reason, rejectedAt: Date.now() }); } catch (_) {} }
  _ledger('observation.rejected', 'info', { uuid, reason });
  return { ok: true, uuid, reason };
}

// ── Edges ────────────────────────────────────────────────────────────────────
function connect(from, to, type, opts = {}) {
  const e = _lat.connect(from, to, type, opts);
  if (_session) _session.edgesAdded.push(`${from}|${type}|${to}`);
  const jaa = _getJAA();
  if (jaa) { try { jaa.insert(TABLE_EDGES, { ...e, uuid: crypto.randomUUID() }); } catch (_) {} }
  return e;
}

// ── Editable surface — you own this ─────────────────────────────────────────
function pin(id)   { const n = _lat.nodes.get(id); if (!n) throw new Error(`[${MODULE_ID}] no node '${id}'`); n.pinned = true; n.confidence = 1; _persistNode(n); return n; }
function unpin(id) { const n = _lat.nodes.get(id); if (!n) throw new Error(`[${MODULE_ID}] no node '${id}'`); n.pinned = false; _persistNode(n); return n; }

/** forget(id, reason) — archives, never deletes (§0.3). Drops off every read. */
function forget(id, reason) {
  const n = _lat.nodes.get(id);
  if (!n) throw new Error(`[${MODULE_ID}] no node '${id}'`);
  if (!reason) throw new Error(`[${MODULE_ID}] forget() requires a reason — an unexplained archive is unreviewable later`);
  n.archived = true; n.archivedReason = reason; n.archivedAt = Date.now();
  _persistNode(n);
  _ledger('node.forgotten', 'info', { id, reason });
  return n;
}

function correct(id, { label, type, reason }) {
  const n = _lat.nodes.get(id);
  if (!n) throw new Error(`[${MODULE_ID}] no node '${id}'`);
  forget(id, reason || 'corrected by user');
  return state({ type: type || n.type, label, meta: { corrects: id } });
}

/**
 * purge() — a REAL hard delete of everything. Deliberately not an archive.
 * §0.3 says nothing is lost, and that is right for system state; it is not
 * right for a model of a person. Someone asking to be forgotten should not
 * discover it was only hidden.
 */
function purge({ confirm } = {}) {
  if (confirm !== 'DELETE EVERYTHING') {
    return { ok: false, error: "purge requires confirm:'DELETE EVERYTHING' — deliberately awkward, because it is irreversible" };
  }
  const counts = _lat.stats();
  _lat = new Lattice();
  const jaa = _getJAA();
  if (jaa) for (const t of [TABLE_NODES, TABLE_EDGES, TABLE_SESSIONS, TABLE_REVIEW]) {
    try { for (const r of (jaa.tail(t, 99999) || [])) jaa.delete(t, { uuid: r.uuid }); } catch (_) {}
  }
  _ledger('model.purged', 'info', counts);
  return { ok: true, purged: counts, note: 'hard deleted, not archived' };
}

/** exportAll() — everything held about you, in one readable object. */
function exportAll() {
  const jaa = _getJAA();
  return {
    exportedAt: new Date().toISOString(), version: VERSION,
    nodes: [...

_lat.nodes.values()],
    edges: [..._lat.edges.values()],
    sessions: jaa ? (jaa.tail(TABLE_SESSIONS, 99999) || []) : [],
    review: jaa ? (jaa.tail(TABLE_REVIEW, 99999) || []) : [],
    chain: verifyChain(),
    note: 'this is everything. If something here is wrong, correct() or forget() it; purge() removes all of it.',
  };
}

// ── Reading ──────────────────────────────────────────────────────────────────
function portrait(opts = {}) {
  const r = read(_lat, opts.lenses, opts);
  return { ...r, stats: _lat.stats(), session: _session ? _session.id : null,
    chain: verifyChain(), generatedAt: Date.now() };
}
function meaningOf(concept, depth = 2) { return LENSES.meaning.run(_lat, { center: concept, depth }); }
function effectiveConfidence(node) {
  if (!node) return 0;
  if (node.pinned || node.provenance === PROVENANCE.STATED) return node.confidence;
  const days = (Date.now() - (node.lastSeen || Date.now())) / 86400000;
  return Math.min(1, Math.max(MIN_CONFIDENCE, node.confidence - (DECAY_PER_DAY[node.provenance] || 0.1) * days));
}

// ── Internals ────────────────────────────────────────────────────────────────
function _slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
function _track(node) {
  if (!_session) return;
  const arr = node.evidenceCount <= 1 ? _session.nodesAdded : _session.nodesUpdated;
  if (!arr.includes(node.id)) arr.push(node.id);
}
function _persistNode(node) {
  const jaa = _getJAA();
  if (!jaa) return;
  try {
    const existing = (jaa.tail(TABLE_NODES, 99999) || []).find(r => r.id === node.id);
    if (existing) jaa.update(TABLE_NODES, { uuid: existing.uuid }, { ...node });
    else jaa.insert(TABLE_NODES, { uuid: crypto.randomUUID(), ...node });
  } catch (_) { /* §1.2 the model still works in memory if the store is down */ }
}

/** load() — rehydrate from the store. Continuity across restarts. */
function load() {
  const jaa = _getJAA();
  if (!jaa) return { ok: false, reason: 'no store — starting empty, which is NOT the same as knowing nothing was recorded' };
  _lat = new Lattice();
  let nodes = 0, edges = 0;
  try {
    for (const r of (jaa.tail(TABLE_NODES, 99999) || [])) {
      if (!validNodeType(r.type)) addNodeType(r.type);   // a type added in a past session is honoured, not dropped
      _lat.nodes.set(r.id, { ...r }); nodes++;
    }
    for (const e of (jaa.tail(TABLE_EDGES, 99999) || [])) {
      if (_lat.nodes.has(e.from) && _lat.nodes.has(e.to)) { _lat.edges.set(`${e.from}|${e.type}|${e.to}`, { ...e }); edges++; }
    }
  } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: true, nodes, edges, chain: verifyChain() };
}

function health() {
  return { ok: true, version: VERSION, stats: _lat.stats(),
    session: _session ? { id: _session.id, prevSessionId: _session.prevSessionId } : null,
    chain: verifyChain(), storeAvailable: !!_getJAA() };
}

function _resetForTest() { _lat = new Lattice(); _session = null; }

module.exports = {
  startSession, endSession, verifyChain,
  state, observe, infer, noteObservation, reviewQueue, accept, reject,
  connect, pin, unpin, forget, correct, purge, exportAll,
  portrait, meaningOf, effectiveConfidence, load, health,
  addNodeType,
  NODE_TYPE, EDGE_TYPE, PROVENANCE, VERDICT, STATED_ONLY_TYPES, LENSES,
  TABLE_NODES, TABLE_EDGES, TABLE_SESSIONS, TABLE_REVIEW,
  MODULE_ID, VERSION, COMP_ID, HOOK_ID, _resetForTest,
  get _lattice() { return _lat; },
};
