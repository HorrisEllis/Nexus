'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// copilot/lib/self-model/lattice.js — one flat lattice, many lenses
// UUID: nexus-person-model-lattice-v1-0000-2026-0817-001
// Version: 1.0.0
// Component: copilot.person-model.lattice
// Hook: copilot.person-model.lattice:v1:p0001
//
// THE DESIGN DECISION, STATED SO IT CAN BE ARGUED WITH LATER —
//
// The question was: "each node in the associative lattice is either a graph or
// a meaning-making web?" The answer here is NO, and the reason is mechanical
// rather than aesthetic.
//
// A node that CONTAINS a graph forces two propagation rules: one for spreading
// activation inside a web, one for spreading between webs. They will disagree
// at the boundary, and there is no principled place to stop nesting — the inner
// web's nodes would have the same claim to containing webs of their own.
//
// So: ONE flat lattice. Typed nodes, typed edges. A "meaning-making web" is a
// LENS — a projection over the same nodes and edges, filtered and re-weighted
// by the question being asked. "What does safety mean to James" and "what does
// ambition mean to James" are two readings of one structure, not two nested
// graphs. Spreading activation stays a single rule (meta/alk already does it),
// and adding a new way of seeing costs a lens, not a schema migration.
//
// §lens contract — deliberately identical to tests/modules/lenses.test.js,
// which is already the proven pattern in this tree:
//   LN-1 every lens declares the QUESTION it answers
//   LN-3 a lens is FINDING | ABSTAIN | UNAVAILABLE | ERROR — never silently absent
//   LN-7 coverage is reported; a clean reading from BLIND lenses is the failure
//
// That last one is the load-bearing rule. A confident portrait assembled from
// lenses that could not see looks exactly like a real one. The only defence is
// to make blindness a first-class part of every answer.
// ─────────────────────────────────────────────────────────────────────────────

const MODULE_ID = 'person-model-lattice';
const VERSION   = '1.0.0';
const COMP_ID   = 'copilot.person-model.lattice';
const HOOK_ID   = 'copilot.person-model.lattice:v1:p0001';

// ── Node types ───────────────────────────────────────────────────────────────
// The identity surface. Open by design: addNodeType() extends it at runtime,
// because "add new metrics over time" was an explicit requirement and a closed
// enum would make that a code change every time.
const NODE_TYPE = {
  VALUE:      'value',       // what matters — integrity, autonomy, craft
  BELIEF:     'belief',      // what is held true about the world
  GOAL:       'goal',        // a stated outcome, dated, completable
  AMBITION:   'ambition',    // longer arc than a goal, not completable
  PASSION:    'passion',     // sustained, energising engagement
  INTEREST:   'interest',    // lighter than a passion; may decay
  PATTERN:    'pattern',     // observed regularity in behaviour
  PREFERENCE: 'preference',  // channel, tool, pace, format
  SKILL:      'skill',
  RELATION:   'relation',    // a person, and what they are to you
  PROJECT:    'project',
  BOUNDARY:   'boundary',    // a stated limit — "don't do X"
  TRIGGER:    'trigger',     // STATED-ONLY. see PROVENANCE below.
  SENSITIVE:  'sensitive',   // STATED-ONLY. history, trauma, hard subjects.
  LEXICON:    'lexicon',     // a word you use in a particular way
};

// Types that may ONLY hold user-stated content. Nothing may be inferred into
// them, ever. See PROVENANCE in ./index.js for the full reasoning; the short
// version is that these are the claims where being wrong is most expensive and
// the available evidence (tone, hesitation, topic-changes) is weakest. Reading
// undertone is the thinnest signal in the system, and these are the heaviest
// conclusions — pointing one at the other is the single worst wiring available.
const STATED_ONLY_TYPES = new Set([NODE_TYPE.TRIGGER, NODE_TYPE.SENSITIVE, NODE_TYPE.BOUNDARY]);

// ── Edge types ───────────────────────────────────────────────────────────────
// Typed, because "related to" collapses distinctions that matter. A value that
// SUPPORTS a goal and a value that TENSIONS with it are the same edge under an
// untyped scheme, and the difference is most of the interesting content.
const EDGE_TYPE = {
  SUPPORTS:   'supports',    // A makes B more likely / easier / more valued
  TENSIONS:   'tensions',    // A pulls against B — real, and worth surfacing
  CAUSES:     'causes',      // A precedes and produces B
  INSTANCE_OF:'instance_of', // A is a concrete case of abstract B
  CO_OCCURS:  'co_occurs',   // observed together; NOT a causal claim
  CONTRADICTS:'contradicts', // A and B cannot both be true as stated
  ABOUT:      'about',       // A concerns B (a person, project, topic)
};

// Edges that are OBSERVATIONS, not claims. co_occurs in particular must never
// be read as causation — the difference between them is the thing
// test-intelligence-causal.js exists to protect ("coincidence and causation
// cannot look the same").
const OBSERVATIONAL_EDGES = new Set([EDGE_TYPE.CO_OCCURS]);

// ── Lens verdicts (LN-3) ─────────────────────────────────────────────────────
const VERDICT = { FINDING: 'FINDING', ABSTAIN: 'ABSTAIN', UNAVAILABLE: 'UNAVAILABLE', ERROR: 'ERROR' };

let _extraTypes = new Set();

function addNodeType(t) {
  if (!t || typeof t !== 'string') throw new Error(`[${MODULE_ID}] addNodeType requires a string`);
  _extraTypes.add(t);
  return t;
}
function validNodeType(t) { return Object.values(NODE_TYPE).includes(t) || _extraTypes.has(t); }
function validEdgeType(t) { return Object.values(EDGE_TYPE).includes(t); }

// ─────────────────────────────────────────────────────────────────────────────
// Lattice — nodes + edges, in memory, persisted by ./index.js
// ─────────────────────────────────────────────────────────────────────────────
class Lattice {
  constructor() {
    this.nodes = new Map();   // id → node
    this.edges = new Map();   // `${from}|${type}|${to}` → edge
  }

  /**
   * upsertNode — idempotent by id. Never silently replaces provenance: a node
   * first STATED by the user cannot be downgraded to INFERRED by a later
   * observation. Strength of evidence only ratchets one way.
   */
  upsertNode(node) {
    if (!node || !node.id) throw new Error(`[${MODULE_ID}] node requires an id`);
    if (!validNodeType(node.type)) throw new Error(`[${MODULE_ID}] unknown node type '${node.type}' — call addNodeType() first (§1.1 not guessed)`);

    const prev = this.nodes.get(node.id);
    if (!prev) {
      this.nodes.set(node.id, {
        id: node.id, type: node.type, label: node.label || node.id,
        provenance: node.provenance || 'inferred',
        confidence: node.confidence == null ? 0.5 : node.confidence,
        evidence: node.evidence ? [node.evidence] : [],
        evidenceCount: node.evidence ? 1 : 0,
        firstSeen: node.ts || Date.now(), lastSeen: node.ts || Date.now(),
        sessions: node.session ? [node.session] : [],
        pinned: !!node.pinned, archived: false, archivedReason: null,
        meta: node.meta || {},
      });
      return this.nodes.get(node.id);
    }

    prev.lastSeen = node.ts || Date.now();
    prev.evidenceCount++;
    if (node.evidence) { prev.evidence.push(node.evidence); if (prev.evidence.length > 50) prev.evidence.shift(); }
    if (node.session && !prev.sessions.includes(node.session)) prev.sessions.push(node.session);
    if (node.confidence != null && !prev.pinned) prev.confidence = Math.min(1, Math.max(0, node.confidence));
    // Provenance ratchets UP only: inferred → observed → stated. A thing you
    // told me does not become a guess because I later noticed it too.
    const rank = { inferred: 0, observed: 1, stated: 2 };
    if (rank[node.provenance] > rank[prev.provenance]) prev.provenance = node.provenance;
    if (node.meta) prev.meta = { ...prev.meta, ...node.meta };
    return prev;
  }

  /**
   * connect — a typed edge, weight reinforced by repetition. Refuses an edge to
   * a node that does not exist: a dangling edge is a fabricated relationship,
   * and would read as evidence of a connection nobody ever observed.
   */
  connect(from, to, type = EDGE_TYPE.CO_OCCURS, opts = {}) {
    if (!validEdgeType(type)) throw new Error(`[${MODULE_ID}] unknown edge type '${type}'`);
    if (!this.nodes.has(from)) throw new Error(`[${MODULE_ID}] §1.1 refused — edge from unknown node '${from}'`);
    if (!this.nodes.has(to))   throw new Error(`[${MODULE_ID}] §1.1 refused — edge to unknown node '${to}'`);
    if (from === to) throw new Error(`[${MODULE_ID}] §1.1 refused — self-edge on '${from}' carries no information`);

    const key = `${from}|${type}|${to}`;
    const prev = this.edges.get(key);
    if (prev) {
      prev.weight = Math.min(1, prev.weight + (opts.delta == null ? 0.1 : opts.delta));
      prev.count++;
      prev.lastSeen = Date.now();
      if (opts.evidence) prev.evidence.push(opts.evidence);
      return prev;
    }
    const edge = {
      from, to, type,
      weight: opts.weight == null ? 0.5 : opts.weight,
      count: 1,
      observational: OBSERVATIONAL_EDGES.has(type),
      evidence: opts.evidence ? [opts.evidence] : [],
      firstSeen: Date.now(), lastSeen: Date.now(),
    };
    this.edges.set(key, edge);
    return edge;
  }

  neighbours(id, { type = null, minWeight = 0 } = {}) {
    const out = [];
    for (const e of this.edges.values()) {
      if (e.weight < minWeight) continue;
      if (type && e.type !== type) continue;
      if (e.from === id) out.push({ ...e, other: e.to, dir: 'out' });
      else if (e.to === id) out.push({ ...e, other: e.from, dir: 'in' });
    }
    return out.sort((a, b) => b.weight - a.weight);
  }

  /**
   * spread — one propagation rule, over one flat structure. This is the whole
   * argument for not nesting graphs inside nodes: nesting would need a second
   * rule for crossing the boundary, and the two would disagree.
   *
   * Mirrors meta/alk's semantics deliberately (strongest path wins, never
   * summed; a node activates at most once, so cycles terminate).
   */
  spread(centerId, { depth = 2, min = 0.05 } = {}) {
    if (!this.nodes.has(centerId)) {
      return { ok: false, reason: `unknown center '${centerId}'`, activated: [] };
    }
    const act = new Map([[centerId, 1]]);
    let frontier = [centerId];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const id of frontier) {
        const a = act.get(id);
        for (const e of this.neighbours(id)) {
          const node = this.nodes.get(e.other);
          if (!node || node.archived) continue;
          const val = a * e.weight * (node.pinned ? 1 : node.confidence);
          if (val < min) continue;
          // Strongest path wins — never summed. Summing would let many weak
          // paths manufacture a strong conclusion out of nothing.
          if (!act.has(e.other) || act.get(e.other) < val) { act.set(e.other, val); next.push(e.other); }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    act.delete(centerId);
    return {
      ok: true, center: centerId,
      activated: [...act.entries()]
        .map(([id, a]) => ({ id, activation: +a.toFixed(4), node: this.nodes.get(id) }))
        .sort((x, y) => y.activation - x.activation),
    };
  }

  live() { return [...this.nodes.values()].filter(n => !n.archived); }
  byType(t) { return this.live().filter(n => n.type === t); }
  stats() {
    const byType = {};
    for (const n of this.live()) byType[n.type] = (byType[n.type] || 0) + 1;
    return { nodes: this.live().length, archived: this.nodes.size - this.live().length,
             edges: this.edges.size, byType };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LENSES — a meaning-making web is a projection, not a container
// ─────────────────────────────────────────────────────────────────────────────
// Each lens declares the QUESTION it answers (LN-1) and returns one of the four
// verdicts (LN-3). A lens with nothing to look at ABSTAINS — it does not return
// an empty table that a caller could mistake for "nothing there".

function _lens(id, question, fn) {
  return {
    id, question,
    run(lattice, opts = {}) {
      try {
        if (!lattice || !lattice.nodes || lattice.nodes.size === 0) {
          return { lens: id, question, verdict: VERDICT.UNAVAILABLE, reason: 'lattice is empty — nothing observed yet', findings: [] };
        }
        return fn(lattice, opts);
      } catch (e) {
        // §1.2 — an ERROR verdict, never a throw. A lens that crashes must not
        // take the whole reading down with it.
        return { lens: id, question, verdict: VERDICT.ERROR, reason: e.message, findings: [] };
      }
    },
  };
}

const LENSES = {
  // "What does X mean to me?" — the meaning-making web, as a projection.
  meaning: _lens('meaning', 'what does this concept mean to this person, in their own structure?',
    (lat, { center, depth = 2 } = {}) => {
      if (!center) return { lens: 'meaning', question: LENSES.meaning.question, verdict: VERDICT.ABSTAIN, reason: 'no center given — this lens needs a concept to read around', findings: [] };
      const sp = lat.spread(center, { depth });
      if (!sp.ok) return { lens: 'meaning', question: LENSES.meaning.question, verdict: VERDICT.ABSTAIN, reason: sp.reason, findings: [] };
      if (!sp.activated.length) return { lens: 'meaning', question: LENSES.meaning.question, verdict: VERDICT.ABSTAIN, reason: `'${center}' exists but connects to nothing yet`, findings: [] };
      return { lens: 'meaning', question: LENSES.meaning.question, verdict: VERDICT.FINDING, center,
        findings: sp.activated.map(a => ({ id: a.id, label: a.node.label, type: a.node.type,
          activation: a.activation, provenance: a.node.provenance })) };
    }),

  // Tension is the most useful thing a self-model can surface, and the thing a
  // flat list of traits can never show.
  tension: _lens('tension', 'where does this person pull against themselves?',
    (lat) => {
      const t = [...lat.edges.values()].filter(e => e.type === EDGE_TYPE.TENSIONS || e.type === EDGE_TYPE.CONTRADICTS);
      if (!t.length) return { lens: 'tension', question: LENSES.tension.question, verdict: VERDICT.ABSTAIN, reason: 'no tension edges recorded — this is an absence of observation, not an absence of tension', findings: [] };
      return { lens: 'tension', question: LENSES.tension.question, verdict: VERDICT.FINDING,
        findings: t.sort((a, b) => b.weight - a.weight).map(e => ({
          from: lat.nodes.get(e.from)?.label, to: lat.nodes.get(e.to)?.label,
          type: e.type, weight: e.weight, count: e.count })) };
    }),

  // Values ranked by how much of the structure actually leans on them.
  values: _lens('values', 'what does this person actually organise around, by structural load?',
    (lat) => {
      const vs = lat.byType(NODE_TYPE.VALUE);
      if (!vs.length) return { lens: 'values', question: LENSES.values.question, verdict: VERDICT.ABSTAIN, reason: 'no values recorded yet', findings: [] };
      return { lens: 'values', question: LENSES.values.question, verdict: VERDICT.FINDING,
        findings: vs.map(v => {
          const sup = lat.neighbours(v.id, { type: EDGE_TYPE.SUPPORTS });
          return { id: v.id, label: v.label, confidence: v.confidence, provenance: v.provenance,
            load: sup.length, supports: sup.map(s => lat.nodes.get(s.other)?.label).filter(Boolean) };
        }).sort((a, b) => b.load - a.load || b.confidence - a.confidence) };
    }),

  // Trajectory — goals and ambitions, and whether anything supports them.
  trajectory: _lens('trajectory', 'where is this person trying to go, and what is holding it up?',
    (lat) => {
      const g = [...lat.byType(NODE_TYPE.GOAL), ...lat.byType(NODE_TYPE.AMBITION)];
      if (!g.length) return { lens: 'trajectory', question: LENSES.trajectory.question, verdict: VERDICT.ABSTAIN, reason: 'no goals or ambitions recorded', findings: [] };
      return { lens: 'trajectory', question: LENSES.trajectory.question, verdict: VERDICT.FINDING,
        findings: g.map(n => ({ id: n.id, label: n.label, type: n.type, confidence: n.confidence,
          supportedBy: lat.neighbours(n.id, { type: EDGE_TYPE.SUPPORTS }).map(e => lat.nodes.get(e.other)?.label).filter(Boolean),
          tensionWith: lat.neighbours(n.id, { type: EDGE_TYPE.TENSIONS }).map(e => lat.nodes.get(e.other)?.label).filter(Boolean) })) };
    }),

  // Care — what the person has explicitly asked to be handled carefully.
  // STATED ONLY. This lens deliberately refuses to look at inferred nodes, so
  // it can never report a sensitivity nobody ever declared.
  care: _lens('care', 'what has this person explicitly asked to be handled with care?',
    (lat) => {
      const c = [...lat.byType(NODE_TYPE.TRIGGER), ...lat.byType(NODE_TYPE.SENSITIVE), ...lat.byType(NODE_TYPE.BOUNDARY)]
        .filter(n => n.provenance === 'stated');
      if (!c.length) return { lens: 'care', question: LENSES.care.question, verdict: VERDICT.ABSTAIN, reason: 'nothing stated — and nothing is inferred into this lens by design', findings: [] };
      return { lens: 'care', question: LENSES.care.question, verdict: VERDICT.FINDING,
        findings: c.map(n => ({ id: n.id, label: n.label, type: n.type, note: n.meta.note || null, statedAt: n.firstSeen })) };
    }),
};

/**
 * read(lattice, lensIds, opts) — run several lenses and report COVERAGE (LN-7).
 *
 * The `blind` list is the point. A portrait assembled from lenses that could
 * not see is indistinguishable from a real one unless the blindness travels
 * with the answer. So it does, on every read, whether or not anyone asked.
 */
function read(lattice, lensIds = Object.keys(LENSES), opts = {}) {
  const results = lensIds.map(id => {
    const l = LENSES[id];
    if (!l) return { lens: id, verdict: VERDICT.UNAVAILABLE, reason: 'no such lens', findings: [] };
    return l.run(lattice, opts);
  });
  const finding = results.filter(r => r.verdict === VERDICT.FINDING);
  const blind   = results.filter(r => r.verdict !== VERDICT.FINDING);
  return {
    results,
    coverage: { total: results.length, finding: finding.length, blind: blind.length,
      blindLenses: blind.map(b => ({ lens: b.lens, verdict: b.verdict, reason: b.reason })),
      pct: results.length ? +((finding.length / results.length) * 100).toFixed(1) : 0 },
    // LN-7 stated in the payload, so a caller cannot use the reading without
    // meeting the caveat.
    caveat: blind.length
      ? `${blind.length}/${results.length} lenses could not see. This reading is partial — treat it as such.`
      : null,
  };
}

module.exports = {
  Lattice, LENSES, read,
  NODE_TYPE, EDGE_TYPE, VERDICT, STATED_ONLY_TYPES, OBSERVATIONAL_EDGES,
  addNodeType, validNodeType, validEdgeType,
  MODULE_ID, VERSION, COMP_ID, HOOK_ID,
};
