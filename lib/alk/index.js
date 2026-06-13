'use strict';
/**
 * lib/alk/index.js — Associative Lattice Kernel
 * UUID: nexus-alk-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Records every decision made by: user, LLM, RAID engine, system.
 * Links decisions via causedBy chains.
 * Enables rewind (control-Z) of any decision.
 *
 * ACTORS:
 *   user    — James. Commands, config changes, spec inputs.
 *   llm     — Guardian dispatch output. Generated artifacts.
 *   raid    — Routing decisions. Provider selection.
 *   system  — Self-heal patches, gap resolutions, Orion adjustments.
 *
 * DECISION NODE:
 *   { uuid, type, actor, intent, payload, outcome, causedBy, reversedBy, sigma, ts }
 *
 * RULES:
 *   UUID = address only. Lattice = semantics. Bus = behavior. causedBy = history.
 *   Decisions are immutable once written — reversedBy marks undo, never deletes.
 *   §2.1: every decision on disk before function returns.
 *   §A-4: append-only. No deletions.
 */

const { randomUUID } = require('crypto');
const fs             = require('fs');
const path           = require('path');

const ROOT      = path.join(__dirname, '../..');
const DATA_DIR  = process.env.NEXUS_DATA_ROOT
  ? path.join(process.env.NEXUS_DATA_ROOT, 'alk')
  : path.join(ROOT, 'data', 'alk');

const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.jsonl');
const INDEX_FILE     = path.join(DATA_DIR, 'index.json'); // uuid → line offset (future)

// ── Ensure dir ────────────────────────────────────────────────────────────────
function _ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── In-memory index (this session) ────────────────────────────────────────────
const _index = new Map(); // uuid → decision node

// ── _persist(node) — §2.1 synchronous write ───────────────────────────────────
function _persist(node) {
  _ensureDir();
  fs.appendFileSync(DECISIONS_FILE, JSON.stringify(node) + '\n', 'utf8');
}

// ── record(decision) — the primary API ───────────────────────────────────────
// Records a decision node. Returns the node with uuid and ts stamped.
// actor:   'user' | 'llm' | 'raid' | 'system'
// intent:  what was decided (verb phrase: 'route', 'generate', 'heal', 'config', ...)
// payload: what was decided (the data)
// outcome: filled in later via resolve(uuid, outcome)
// causedBy: uuid of the decision that triggered this one
function record({ actor, intent, payload = {}, causedBy = null, sigma = 0 } = {}) {
  if (!actor) throw new Error('[ALK] record() requires actor');
  if (!intent) throw new Error('[ALK] record() requires intent');

  const node = {
    uuid:       randomUUID(),
    type:       'decision',
    actor,
    intent,
    payload,
    outcome:    null,         // filled by resolve()
    causedBy,                 // parent decision uuid
    reversedBy: null,         // set by rewind()
    sigma,                    // system tension at decision time
    ts:         Date.now(),
  };

  _index.set(node.uuid, node);
  _persist(node);
  return node;
}

// ── resolve(uuid, outcome) — record the outcome of a decision ─────────────────
// Writes a mutation tombstone with the outcome attached.
// The original decision is immutable — outcome lives in a patch record.
function resolve(uuid, outcome = {}) {
  const node = _index.get(uuid);
  if (!node) {
    process.stderr.write(`[ALK] resolve() — uuid not found in session: ${uuid}\n`);
    return null;
  }
  const patch = {
    _mutation:  true,
    uuid,
    outcome,
    resolvedAt: Date.now(),
  };
  node.outcome = outcome;
  _persist(patch);
  return node;
}

// ── rewind(uuid) — control-Z for a decision ──────────────────────────────────
// Creates a rewind decision node that links to the original.
// Emits REVERT events on nexus-bus for affected jobs.
// Uses versionium.commit() before reverting (snapshot before undo).
// §A-4: never deletes. reversedBy marks the undo.
function rewind(uuid, { reason = 'user-initiated rewind' } = {}) {
  const original = _index.get(uuid);
  if (!original) {
    process.stderr.write(`[ALK] rewind() — uuid not found in session: ${uuid}\n`);
    return null;
  }
  if (original.reversedBy) {
    process.stderr.write(`[ALK] rewind() — ${uuid} already reversed by ${original.reversedBy}\n`);
    return null;
  }

  // Snapshot before rewind (§VERSIONIUM)
  try {
    const versionium = require('../cortex/versionium/index');
    versionium.commit({ message: `pre-rewind: ${original.intent} (${uuid.slice(0,8)})`, causedBy: uuid });
  } catch(_) { /* versionium may not be loaded */ }

  // Record the rewind decision
  const rewindNode = record({
    actor:    'user',
    intent:   'rewind',
    payload:  { targetUuid: uuid, reason, original: { intent: original.intent, actor: original.actor } },
    causedBy: uuid,
    sigma:    original.sigma,
  });

  // Mark original as reversed
  const reversePatch = { _mutation: true, uuid, reversedBy: rewindNode.uuid, reversedAt: Date.now() };
  original.reversedBy = rewindNode.uuid;
  _persist(reversePatch);

  // Emit REVERT on nexus-bus
  try {
    const bus = require('../../nexus-bus');
    bus.emit('ALK_REVERT', {
      rewindUuid:   rewindNode.uuid,
      originalUuid: uuid,
      originalIntent: original.intent,
      originalActor:  original.actor,
      reason,
      ts: Date.now(),
    });
  } catch(_) { /* bus may not be available */ }

  return rewindNode;
}

// ── ancestors(uuid) — walk the causedBy chain ────────────────────────────────
// Returns [parent, grandparent, ...root] — nearest first.
function ancestors(uuid) {
  const chain = [];
  let current = uuid;
  const seen  = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = _index.get(current);
    if (!node?.causedBy) break;
    chain.push(node.causedBy);
    current = node.causedBy;
  }
  return chain;
}

// ── descendants(uuid) — find all decisions caused by this one ─────────────────
function descendants(uuid) {
  const result = [];
  for (const [, node] of _index) {
    if (node.causedBy === uuid) result.push(node);
  }
  return result;
}

// ── query(filter) — search decisions ─────────────────────────────────────────
// filter: { actor, intent, since, until, limit }
function query({ actor, intent, since, until, limit = 50 } = {}) {
  let results = [..._index.values()];
  if (actor)  results = results.filter(n => n.actor === actor);
  if (intent) results = results.filter(n => n.intent.includes(intent));
  if (since)  results = results.filter(n => n.ts >= since);
  if (until)  results = results.filter(n => n.ts <= until);
  return results.slice(-limit).reverse(); // newest first
}

// ── load() — hydrate from disk on boot ───────────────────────────────────────
// Reads decisions.jsonl into _index for session use.
// Respects reversedBy — marks reversed decisions.
function load() {
  _ensureDir();
  if (!fs.existsSync(DECISIONS_FILE)) return 0;
  const lines = fs.readFileSync(DECISIONS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  let loaded = 0;
  for (const line of lines) {
    try {
      const node = JSON.parse(line);
      if (node._mutation) {
        // Apply patch to existing node
        const existing = _index.get(node.uuid);
        if (existing) Object.assign(existing, node);
      } else {
        _index.set(node.uuid, node);
        loaded++;
      }
    } catch(_) { /* corrupt line — skip */ }
  }
  return loaded;
}

// ── stats() ───────────────────────────────────────────────────────────────────
function stats() {
  const nodes     = [..._index.values()];
  const byActor   = {};
  const byIntent  = {};
  let reversed    = 0;
  for (const n of nodes) {
    byActor[n.actor]   = (byActor[n.actor]   || 0) + 1;
    byIntent[n.intent] = (byIntent[n.intent] || 0) + 1;
    if (n.reversedBy) reversed++;
  }
  return { total: nodes.length, reversed, byActor, byIntent };
}

module.exports = { record, resolve, rewind, ancestors, descendants, query, load, stats };
