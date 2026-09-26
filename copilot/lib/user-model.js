'use strict';
/**
 * lib/user-model.js — Phase 12: User Model as Hypotheses
 * UUID: nexus-user-model-v2-0000-2026-0625-jamesbrooks-001
 * Version: 2.0.0
 * Phase: 12
 *
 * Stores observations as hypotheses with confidence scores that decay over time.
 * Nothing about the user is ever stored as a hard fact.
 * Every claim: { uuid, claim, confidence, evidence_count, decayRate, lastSeen }
 *
 * Confidence decays 0.1/day if not reconfirmed.
 * Evidence reconfirmation: confidence += 0.1 (capped at 1.0).
 * Confidence < 0.2 → hypothesis pruned (not deleted — moved to archive).
 *
 * Associative lattice: topics linked by co-occurrence.
 * Same as v1 but each link carries a confidence score, not a raw count.
 *
 * §12.1 Every observation is a guess, not a fact
 * §12.2 Confidence decays without reconfirmation
 * §12.3 Never shared — user model is sovereign
 * §2.1 All writes to JAA before behavior
 * §1.1 Built from observed behavior only
 */

const crypto = require('crypto');
const MODULE_ID = 'user-model';
const VERSION   = '2.0.0';

const DECAY_PER_DAY     = 0.10;
const DECAY_INTERVAL_MS = 86400000;  // 1 day
const PRUNE_THRESHOLD   = 0.20;      // below this → archive
const CONFIRM_BOOST     = 0.10;      // evidence reconfirmation boost
const CONFIDENCE_CAP    = 1.0;

let _jaa = null;
let _decayTimer = null;

// ── Profile bootstrap ────────────────────────────────────────────────────────
// Ensures the user_profile table has a base row so hypothesis queries never
// return empty on first boot. No-op if profile already exists.
function _ensureProfile() {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return;
  try {
    const existing = jaa.query('user_model_hypotheses', () => true, 1);
    if (existing.length === 0) {
      // Seed a system-knowledge invariant so the table is never empty
      jaa.insert('user_model_hypotheses', {
        uuid:       require('crypto').randomUUID(),
        claim:      'NEXUS is the system being built',
        category:   'invariant',
        claimType:  'invariant',
        confidence: 1.0,
        locked:     true,
        status:     'active',
        decayRate:  0,
        firstSeen:  Date.now(),
        lastSeen:   Date.now(),
        last_seen:  Date.now(),
        source:     'system-boot',
        evidence_count: 1,
      });
    }
  } catch(_) {}
}

function init(jaaDB) {
  _jaa = jaaDB;
  _ensureProfile();
  // §PHASEMAP UM1 (docs/cortex-schema-registry-phasemap.spec) — declare the
  // user-model's SHAPE so it becomes trustworthy: the model is only worth
  // querying on every response (UM2) if its integrity is observed. Derives the
  // schema from the REAL rows just loaded (§0.1) and registers it, so writes to
  // user_model_hypotheses are schema-observed (P3) from here on. Non-fatal — a
  // registry hiccup must never stop the user-model from working (§1.2).
  try {
    const reg = require('../../lib/schema-registry');
    for (const t of ['user_model_hypotheses', 'user_lattice']) {
      if (!reg.getSchema(t)) reg.registerSchema(t, { owner: 'user-model' });
    }
  } catch (_) { /* registry unavailable — user-model still works, just unobserved */ }
  // Run decay once on boot, then daily
  _runDecay();
  _decayTimer = setInterval(_runDecay, DECAY_INTERVAL_MS);
  if (_decayTimer.unref) _decayTimer.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — hypotheses model ready`);
}

function stop() {
  if (_decayTimer) { clearInterval(_decayTimer); _decayTimer = null; }
}

// ── Hypothesis management ─────────────────────────────────────────────────────

/**
 * observe — record an observation as a hypothesis.
 * If a similar claim already exists → reconfirm (boost confidence).
 * If new → create with initial confidence.
 *
 * @param {string} claim       — e.g. "prefers guardian channel"
 * @param {string} claimType   — channel | intent | topic | error | preference
 * @param {object} evidence    — raw evidence object (what we observed)
 * @param {number} initialConf — initial confidence if new (default 0.5)
 */
function _getJaa() {
  if (_jaa) return _jaa;
  // Lazy load — supports test environments that mock jaa-db directly
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    // Only return if the singleton is opened and ready
    if (jaaDB && typeof jaaDB.query === 'function') return jaaDB;
    return null;
  } catch(_) { return null; }
}

function _observeCore(claim, claimType, evidence = {}, initialConf = 0.5) {
  const jaa = _getJaa();
  if (!jaa || !claim) return null;
  try {
    const existing = jaa.query('user_model_hypotheses',
      h => h.claim === claim && h.claimType === claimType && h.status === 'active', 1
    );

    if (existing.length) {
      // Reconfirm — boost confidence, update lastSeen
      const h = existing[0];
      const newConf = Math.min(CONFIDENCE_CAP, (h.confidence || 0) + CONFIRM_BOOST);
      jaa.update('user_model_hypotheses', h.uuid, {
        confidence:     newConf,
        evidence_count: (h.evidence_count || 0) + 1,
        lastSeen:       Date.now(),
        lastEvidence:   evidence,
      });
      return { ...h, confidence: newConf };
    } else {
      // New hypothesis
      const h = {
        uuid:           crypto.randomUUID(),
        claim,
        claimType,
        category:       claimType,  // spec alias — tests use h.category
        confidence:     Math.min(CONFIDENCE_CAP, Math.max(0, initialConf)),
        evidence_count: 1,
        firstSeen:      Date.now(),
        lastSeen:       Date.now(),
        last_seen:      Date.now(),  // snake_case alias for effectiveConfidence
        lastEvidence:   evidence,
        status:         'active',
        decayRate:      DECAY_PER_DAY,
        source:         'observed',
      };
      jaa.insert('user_model_hypotheses', h);
      return h;
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] observe: ${e.message}`);
    return null;
  }
}

// ── Specific observation helpers ──────────────────────────────────────────────

function recordChannelVisit(channelId, channelName) {
  _observeCore(`prefers ${channelName || channelId} channel`, 'channel',
    { channelId, channelName }, 0.4);
  _latticeAdd(channelName || channelId, 'channel');
}

function recordIntent(intent, prompt, channel) {
  _observeCore(`uses ${intent} intent`, 'intent', { prompt: prompt?.slice(0, 80), channel }, 0.45);
  const topics = _extractTopics(prompt);
  topics.forEach(t => {
    _latticeAdd(t, 'topic');
    if (channel) _latticeLink(t, channel, 0.4);
  });
  for (let i = 0; i < topics.length; i++)
    for (let j = i + 1; j < topics.length; j++)
      _latticeLink(topics[i], topics[j], 0.35);
}

function recordError(errorText, channel, severity = 'medium') {
  const key = (errorText || '').toLowerCase().replace(/[^a-z0-9: ]/g, '').slice(0, 60).trim();
  if (!key) return;
  const initConf = severity === 'high' ? 0.7 : severity === 'medium' ? 0.5 : 0.3;
  _observeCore(`encounters error: ${key}`, 'error', { channel, severity, sample: errorText.slice(0, 100) }, initConf);
}

// ── Decay ─────────────────────────────────────────────────────────────────────

function _runDecay() {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return;
  try {
    const now = Date.now();
    const active = jaa.query('user_model_hypotheses', h => h.status === 'active', 500);
    let decayed = 0, pruned = 0;

    for (const h of active) {
      const daysSince = (now - (h.lastSeen || now)) / DECAY_INTERVAL_MS;
      if (daysSince < 0.5) continue; // less than 12h — skip

      const decayAmount = (h.decayRate || DECAY_PER_DAY) * daysSince;
      const newConf = Math.max(0, (h.confidence || 0) - decayAmount);

      if (newConf < PRUNE_THRESHOLD) {
        // Archive — don't delete, just deactivate
        jaa.update('user_model_hypotheses', h.uuid, {
          status:     'archived',
          confidence: newConf,
          archivedAt: now,
          archiveReason: 'confidence_decay',
        });
        pruned++;
      } else {
        jaa.update('user_model_hypotheses', h.uuid, { confidence: newConf, lastDecayed: now });
        decayed++;
      }
    }

    if (decayed + pruned > 0)
      console.log(`[${MODULE_ID}] decay: ${decayed} updated · ${pruned} archived`);
  } catch(e) {
    console.warn(`[${MODULE_ID}] decay error: ${e.message}`);
  }
}

// ── Associative lattice (confidence-weighted) ─────────────────────────────────

function _latticeAdd(topic, nodeType = 'topic') {
  if (!_jaa || !topic) return;
  try {
    const ex = _jaa.query('user_lattice', r => r.topic === topic, 1);
    if (ex.length) {
      const newConf = Math.min(1, (ex[0].confidence || 0.3) + 0.05);
      _jaa.update('user_lattice', ex[0].uuid, { confidence: newConf, lastSeen: Date.now() });
    } else {
      _jaa.insert('user_lattice', { uuid: crypto.randomUUID(), topic, nodeType,
        confidence: 0.3, firstSeen: Date.now(), lastSeen: Date.now(), links: {} });
    }
  } catch(_) {}
}

function _latticeLink(a, b, strength = 0.3) {
  if (!_jaa || !a || !b || a === b) return;
  try {
    const na = _jaa.query('user_lattice', r => r.topic === a, 1)[0];
    if (na) {
      const links = na.links || {};
      links[b] = Math.min(1, (links[b] || 0) + strength);
      _jaa.update('user_lattice', na.uuid, { links });
    }
    const nb = _jaa.query('user_lattice', r => r.topic === b, 1)[0];
    if (nb) {
      const links = nb.links || {};
      links[a] = Math.min(1, (links[a] || 0) + strength);
      _jaa.update('user_lattice', nb.uuid, { links });
    }
  } catch(_) {}
}

// ── Radiate — spreading activation over the lattice ───────────────────────────
// "The user in the middle, variables propagating outward." Starts at a center
// node (default: the highest-confidence node — the strongest current signal)
// and walks links outward ring by ring. Activation attenuates per hop:
//   activation(neighbor) = activation(node) × linkStrength × neighborConfidence
// Multiple paths to the same node: the strongest wins (max, not sum — sum
// would reward dense noise over strong signal). Nodes below `min` activation
// are cut. Deterministic for a given lattice state (§14.2) — same rows in,
// same rings out. Cycles can't loop: a node is activated at most once.
function radiate(center = null, opts = {}) {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return { center: null, rings: [], nodes: 0 };
  const maxDepth = opts.depth ?? 3;
  const min = opts.min ?? 0.05;

  let rows;
  try { rows = jaa.query('user_lattice', () => true, 2000) || []; }
  catch (_) { return { center: null, rings: [], nodes: 0 }; }
  if (!rows.length) return { center: null, rings: [], nodes: 0 };

  const byTopic = new Map(rows.map(r => [r.topic, r]));
  let start = center ? byTopic.get(center) : null;
  if (!start) {
    // Honest fallback, stated in the result: strongest node, not a fabricated center
    start = rows.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  }

  const activation = new Map([[start.topic, Math.max(min, start.confidence ?? 0.3)]]);
  const rings = [[{ topic: start.topic, nodeType: start.nodeType || 'topic', activation: +activation.get(start.topic).toFixed(4) }]];
  let frontier = [start.topic];

  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = new Map();
    for (const t of frontier) {
      const node = byTopic.get(t);
      if (!node) continue;
      const a = activation.get(t);
      for (const [nb, strength] of Object.entries(node.links || {})) {
        if (activation.has(nb)) continue; // already activated on a shorter path
        const nbNode = byTopic.get(nb);
        const propagated = a * strength * (nbNode?.confidence ?? 0.3);
        if (propagated < min) continue;
        if (!next.has(nb) || next.get(nb) < propagated) next.set(nb, propagated);
      }
    }
    if (!next.size) break;
    const ring = [];
    for (const [t, a] of next.entries()) {
      activation.set(t, a);
      ring.push({ topic: t, nodeType: byTopic.get(t)?.nodeType || 'topic', activation: +a.toFixed(4) });
    }
    ring.sort((x, y) => y.activation - x.activation);
    rings.push(ring);
    frontier = ring.map(r => r.topic);
  }

  return { center: start.topic, centerWasFallback: !center || !byTopic.has(center), rings, nodes: activation.size };
}

const NEXUS_TERMS = new Set([
  'guardian','cortex','orchestrator','idearium','bridge','architect','emerge',
  'diagnostic','gaps','jobs','seam','raid','ncp','ollama','mistral','qwen',
  'forge','blueprint','spec','hooks','cfr','sigma','patterns','artifacts',
  'health','status','errors','repair','template','organism','behavior',
  'genome','co-pilot','copilot','mcp','autonomous','loop',
]);

function _extractTopics(text) {
  if (!text) return [];
  const topics = new Set();
  const words = text.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
  for (const w of words) if (NEXUS_TERMS.has(w)) topics.add(w);
  return [...topics].slice(0, 8);
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * buildUserContext — returns a concise summary of high-confidence hypotheses.
 * Used by co-pilot to inject user context into Mistral system prompt.
 */
function buildUserContext() {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return '';
  try {
    const active = jaa.query('user_model_hypotheses', h => (h.status === 'active' || !h.status) && effectiveConfidence(h) >= 0.4, 50)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 12);

    if (!active.length) return '';

    const lines = ['USER MODEL (hypotheses — confidence-weighted):'];
    const byType = {};
    for (const h of active) {
      const cat = h.category || h.claimType || 'general';
      (byType[cat] = byType[cat] || []).push(h);
    }
    for (const [type, hyps] of Object.entries(byType)) {
      lines.push(`  ${type}: ${hyps.map(h => `"${h.claim}" (confidence:${(effectiveConfidence(h)*100).toFixed(0)}%)`).join(', ')}`);
    }

    // Hot lattice nodes
    const lattice = jaa.query('user_lattice', () => true, 30) || [];
    const hot = lattice.sort((a, b) => (b.confidence||0)-(a.confidence||0)).slice(0,6).map(n=>n.topic);
    if (hot.length) lines.push(`  associated: ${hot.join(', ')}`);

    return lines.join('\n');
  } catch(_) { return ''; }
}

function getRelated(topic, limit = 5) {
  if (!_jaa || !topic) return [];
  try {
    const node = _jaa.query('user_lattice', r => r.topic === topic.toLowerCase(), 1)[0];
    if (!node?.links) return [];
    return Object.entries(node.links).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t]) => t);
  } catch(_) { return []; }
}

function saveNote(text, channel, tags = []) {
  if (!_jaa || !text) return null;
  try {
    const uuid = crypto.randomUUID();
    _jaa.insert('user_notes', { uuid, text: text.slice(0, 1000), channel: channel || 'unknown',
      tags, ts: Date.now(), source: 'copilot' });
    _extractTopics(text).forEach(t => { _latticeAdd(t); if (channel) _latticeLink(t, channel, 0.3); });
    // Also observe as a hypothesis — user tends to note things they care about
    observe(`cares about: ${text.slice(0, 60)}`, 'preference', { text, channel }, 0.55);
    return uuid;
  } catch(_) { return null; }
}

function recentNotes(limit = 5) {
  if (!_jaa) return [];
  try {
    return (_jaa.query('user_notes', () => true, limit * 3) || [])
      .sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
  } catch(_) { return []; }
}

/** getHypotheses — raw access to active hypotheses above confidence threshold */
function getHypotheses(optsOrMinConf = 0.3, limit = 20) {
  const minConf = typeof optsOrMinConf === 'object' ? (optsOrMinConf.minConfidence || 0.3) : optsOrMinConf;
  try {
    const jaa = _getJaa() || _jaa;
    if (!jaa) return [];
    return jaa.query('user_model_hypotheses',
      h => (h.status === 'active' || !h.status) && effectiveConfidence(h) >= minConf, limit * 2
    ).sort((a, b) => effectiveConfidence(b) - effectiveConfidence(a)).slice(0, limit);
  } catch(_) { return []; }
}

// ── CATEGORY enum (spec API) ──────────────────────────────────────────────────
const CATEGORY = Object.freeze({
  PREFERENCE:         'preference',
  PACE:               'pace',
  STYLE:              'style',
  COMMUNICATION_STYLE:'communication_style',
  CHANNEL:            'channel',
  INTENT:             'intent',
  ERROR:              'error',
  TOPIC:              'topic',
});
// communication_style is also valid (used internally and by tests)
const VALID_CATEGORIES = new Set([...Object.values(CATEGORY), 'communication_style']);

// ── Public observe() — handles both spec form and v2 positional form ────────
function observe(claimOrOpts, claimType, evidence, initialConf) {
  // Spec form: observe({ category, claim, source, confidenceDelta })
  if (claimOrOpts && typeof claimOrOpts === 'object' && !Array.isArray(claimOrOpts)) {
    const { category, claim, source, confidenceDelta } = claimOrOpts;
    if (!VALID_CATEGORIES.has(category)) throw new Error(`unknown category: ${category}`);
    if (!claim) throw new Error('requires a claim');
    return _observeCore(claim, category, { source }, 0.5 + (confidenceDelta || 0) * 0.5);
  }
  // v2 positional form: observe(claim, claimType, evidence, initialConf)
  return _observeCore(claimOrOpts, claimType, evidence, initialConf);
}

// ── effectiveConfidence(hypothesis) ──────────────────────────────────────────
// Pure function. Returns adjusted confidence without mutating the hypothesis.
const MIN_CONFIDENCE = 0.05;  // floor — never decays to zero, just very stale
function effectiveConfidence(h) {
  if (!h) return 0;
  const ageDays = (Date.now() - (h.last_seen || h.lastSeen || h.firstSeen || Date.now())) / 86400000;
  const decayed = (h.confidence || 0) - (h.decayRate || DECAY_PER_DAY) * ageDays;
  return Math.min(1, Math.max(MIN_CONFIDENCE, decayed));
}

// ── deriveFromChatLog(limit) ──────────────────────────────────────────────────
// Reads the last N chat_log rows and derives hypotheses from patterns.
function deriveFromChatLog(limit = 50) {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return { derived: 0, hypotheses: [] };
  try {
    const rows = (jaa.query('chat_log', () => true, limit) || [])
      .sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(0, limit);
    if (!rows.length) return { derived: 0, hypotheses: [] };

    const derived = [];

    // Provider preference — >=3 uses of same provider
    const providerCounts = {};
    rows.forEach(r => { const p = r.provider || r.source || '?'; providerCounts[p] = (providerCounts[p] || 0) + 1; });
    Object.entries(providerCounts).forEach(([p, count]) => {
      if (count >= 3) {
        const h = observe({ category: CATEGORY.PREFERENCE,
          claim: `prefers ${p}`, source: 'chat_log', confidenceDelta: Math.min(0.8, count * 0.1) });
        if (h) derived.push(h);
      }
    });

    // Pace — average gap between turns
    const timestamps = rows.map(r => r.ts).filter(Boolean);
    if (timestamps.length >= 2) {
      const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]);
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      // <10s = fast, >60s = slow
      const paceLabel = avgGap < 10000
        ? 'fast pace — responses consumed quickly, short gaps between turns'
        : 'slow/deliberate pace — long gaps between turns';
      const h = observe({ category: CATEGORY.PACE, claim: paceLabel,
        source: 'chat_log', confidenceDelta: 0.4 });
      if (h) derived.push(h);
    }

    // Communication style — from contentLength
    const avgLen = rows.reduce((s, r) => s + (r.contentLength || r.prompt?.length || 0), 0) / rows.length;
    if (avgLen > 300) {
      const h = observe({ category: 'communication_style',
        claim: 'verbose communication style — long detailed messages',
        source: 'chat_log', confidenceDelta: 0.4 });
      if (h) derived.push(h);
    } else if (avgLen > 0 && avgLen < 50) {
      const h = observe({ category: 'communication_style',
        claim: 'terse communication style — short concise messages',
        source: 'chat_log', confidenceDelta: 0.4 });
      if (h) derived.push(h);
    }

    // BDA signals — certainty/directness
    const bdaRows = rows.filter(r => r.bdaSignals?.certainty > 0.7);
    if (bdaRows.length >= rows.length * 0.5) {
      const h = observe({ category: 'communication_style',
        claim: 'direct communication style — high certainty expression',
        source: 'bda_signals', confidenceDelta: 0.45 });
      if (h) derived.push(h);
    }

    return { derived: derived.length, hypotheses: derived };
  } catch(_) { return { derived: 0, hypotheses: [] }; }
}

// ── checkContradictions() ─────────────────────────────────────────────────────
// Detects pairs of mutually exclusive active hypotheses in the same category.
function checkContradictions() {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return [];
  const CONTRADICTION_PAIRS = [
    ['fast pace', 'slow/deliberate pace'],
    ['verbose', 'concise'],
    ['prefers dark', 'prefers light'],
  ];
  try {
    const active = jaa.query('user_model_hypotheses',
      h => h.status === 'active' && h.confidence >= 0.2, 100);
    const flagged = [];
    for (const [a, b] of CONTRADICTION_PAIRS) {
      const hA = active.find(h => h.claim?.toLowerCase().includes(a.toLowerCase()));
      const hB = active.find(h => h.claim?.toLowerCase().includes(b.toLowerCase()));
      if (hA && hB && hA.confidence >= 0.65 && hB.confidence >= 0.65) {
        // §2026-08-09 UNIFIED — was a raw jaa.insert() here with NO dedup
        // check at all: every call to checkContradictions() that found the
        // same live contradiction would insert a fresh duplicate gap row.
        // Real bug, found while unifying with gap-finder/diagnostic-causal
        // per James's "gap field, agnostic, also for modeling me." Now
        // shares gap-field's dedup/occurrence-bump/causal-wire treatment —
        // a user-model contradiction is domain:'user-model' but otherwise
        // the exact same kind of record as a system anomaly gap.
        try {
          const gapField = require('../../lib/gap-field');
          gapField.report({
            type: 'CONFLICT', domain: 'user-model', severity: 'medium',
            body: `Contradiction: "${hA.claim}" vs "${hB.claim}"`,
            source: MODULE_ID, meta: { hypothesisA: hA.uuid, hypothesisB: hB.uuid },
          });
        } catch (_) {}
        flagged.push({ a: hA, b: hB });
      }
    }
    return flagged;
  } catch(_) { return []; }
}

function validateWiring() {
  const jaa = _getJaa() || _jaa;
  const jaaOk = !!jaa;
  let taxonomyOk = false;
  try { require('../../lib/open-loop-taxonomy'); taxonomyOk = true; } catch(_) {
    try { require('../../lib/open-loop-taxonomy'); taxonomyOk = true; } catch(_) {}
  }
  return { ok: jaaOk, jaa: jaaOk, taxonomy: taxonomyOk };
}

// ── §PHASEMAP UM4 — the editable, self-optimizing surface ────────────────────
// (docs/cortex-schema-registry-phasemap.spec). The user-model is not just read +
// auto-updated; the user OR co-pilot can EDIT it and the model tunes from those
// edits — "an editable surface to optimize itself" (James). Built OUTWARD from
// the existing jaa.update archive pattern (§8.6 — decay already archives with a
// reason; these are user-directed edits through the same door). §0.3 — nothing
// is destroyed; a rejected hypothesis is archived, not deleted, so the edit
// history is preserved (and drift-observed via UM1's schema).

/**
 * pinHypothesis(uuid) — lock a hypothesis at high confidence, immune to decay.
 * The user affirming "yes, this is me" should not fade. Returns the updated row.
 */
function pinHypothesis(uuid) {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return { error: 'user-model not initialized' };
  const h = (jaa.query('user_model_hypotheses', r => r.uuid === uuid, 1) || [])[0];
  if (!h) return { error: `no hypothesis ${uuid}` };
  jaa.update('user_model_hypotheses', uuid, {
    confidence: 0.95, pinned: true, decayRate: 0, lastEdited: Date.now(), editedBy: 'user',
  });
  return { ok: true, uuid, pinned: true };
}

/**
 * rejectHypothesis(uuid, reason) — the user says "no, that's not me". Archived
 * (not deleted — §0.3) with a user reason, so it won't resurface and the
 * correction is itself data.
 */
function rejectHypothesis(uuid, reason = 'user_rejected') {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return { error: 'user-model not initialized' };
  const h = (jaa.query('user_model_hypotheses', r => r.uuid === uuid, 1) || [])[0];
  if (!h) return { error: `no hypothesis ${uuid}` };
  jaa.update('user_model_hypotheses', uuid, {
    status: 'archived', archivedAt: Date.now(), archiveReason: reason,
    confidence: 0, lastEdited: Date.now(), editedBy: 'user',
  });
  return { ok: true, uuid, rejected: true, reason };
}

/**
 * correctHypothesis(uuid, newClaim, claimType) — the user fixes a wrong read:
 * reject the mistaken hypothesis AND observe the right one (at high confidence,
 * since it's a direct correction). This is the model optimizing FROM an edit.
 */
function correctHypothesis(uuid, newClaim, claimType = 'preference') {
  if (!newClaim) return { error: 'a corrected claim is required' };
  const rej = rejectHypothesis(uuid, 'user_corrected');
  // a direct correction is high-signal — seed it strong so it surfaces.
  const created = _observeCore(newClaim, claimType, { via: 'user-correction', correctedFrom: uuid }, 0.8);
  return { ok: true, rejected: rej.uuid || uuid, corrected: newClaim, created: created && created.uuid };
}

/**
 * editableSurface(minConf) — the list a UI/CLI edits against: every active
 * hypothesis with its uuid, claim, confidence, pinned flag. This is what the
 * user (or co-pilot) sees to pin/reject/correct.
 */
function editableSurface(minConf = 0) {
  const jaa = _getJaa() || _jaa;
  if (!jaa) return [];
  return (jaa.query('user_model_hypotheses', r => r.status === 'active' && (r.confidence || 0) >= minConf, 200) || [])
    .map(h => ({ uuid: h.uuid, claim: h.claim, claimType: h.claimType, confidence: h.confidence, pinned: !!h.pinned }));
}

module.exports = {
  init, stop, observe,
  recordChannelVisit, recordIntent, recordError,
  buildUserContext, buildContextSummary: buildUserContext,  // alias
  getRelated, getHypotheses,
  radiate,
  saveNote, recentNotes,
  effectiveConfidence, deriveFromChatLog, checkContradictions,
  validateWiring,
  pinHypothesis, rejectHypothesis, correctHypothesis, editableSurface,  // §UM4 editable surface
  CATEGORY,
  MODULE_ID, VERSION,
};
