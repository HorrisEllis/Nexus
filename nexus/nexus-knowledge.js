'use strict';
/**
 * nexus-knowledge.js — Knowledge Memory Layer
 * UUID: nexus-knowledge-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * THE SURVIVAL LAYER. Facts that persist beyond events.
 *
 * An event is what happened. A fact is what was learned.
 *
 * Schema:
 *   fact: { id, type, subject, predicate, object, confidence, source, causedBy, ts, tags }
 *
 * Types:
 *   resolution  — "PORTS.bridge was fixed by adding bridge:9999 to PORTS"
 *   invariant   — "restore() must never call update() internally"
 *   pattern     — "when SNR < 0.45 and source=architect, gap is always structural"
 *   correction  — "field.js line 204: type.startsWith fails on object input"
 *   capability  — "ring-buffer can replay from any seq point"
 *   dependency  — "architect depends on spec-compiler for /api/compile"
 *
 * §A-4  Spec is living — knowledge is append-only, never deleted
 * §1.1  Nothing exists until proven — confidence required on every fact
 * §C-4  Timelines are first-class — every fact has full causality chain
 */

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DATA_DIR   = path.join(__dirname, '..', 'data', 'knowledge');
const LEDGER_FILE = path.join(DATA_DIR, 'facts.jsonl');
const INDEX_FILE  = path.join(DATA_DIR, 'index.json');

// ── In-memory index ───────────────────────────────────────────────────────────

const _facts = new Map();      // id → fact
const _byType = new Map();     // type → Set<id>
const _bySubject = new Map();  // subject → Set<id>
const _byTag = new Map();      // tag → Set<id>

let _loaded = false;

function _ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(_) {}
}

function _load() {
  if (_loaded) return;
  _loaded = true;
  _ensureDir();
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      const lines = fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try { _index(JSON.parse(line)); } catch(_) {}
      }
    }
  } catch(_) {}
}

function _index(fact) {
  _facts.set(fact.id, fact);
  if (!_byType.has(fact.type)) _byType.set(fact.type, new Set());
  _byType.get(fact.type).add(fact.id);
  if (!_bySubject.has(fact.subject)) _bySubject.set(fact.subject, new Set());
  _bySubject.get(fact.subject).add(fact.id);
  for (const tag of (fact.tags || [])) {
    if (!_byTag.has(tag)) _byTag.set(tag, new Set());
    _byTag.get(tag).add(fact.id);
  }
}

function _persist(fact) {
  _ensureDir();
  try { fs.appendFileSync(LEDGER_FILE, JSON.stringify(fact) + '\n'); } catch(_) {}
}

// ── Core API ──────────────────────────────────────────────────────────────────

function learn(fact) {
  _load();
  if (!fact.subject || !fact.predicate || !fact.object) {
    throw new Error('fact requires subject, predicate, object');
  }

  const entry = {
    id:         fact.id         ?? randomUUID(),
    type:       fact.type       ?? 'resolution',
    subject:    fact.subject,
    predicate:  fact.predicate,
    object:     fact.object,
    confidence: fact.confidence ?? 0.8,
    source:     fact.source     ?? 'system',
    causedBy:   fact.causedBy   ?? null,
    ts:         fact.ts         ?? Date.now(),
    tags:       fact.tags       ?? [],
    version:    fact.version    ?? '1.0.0',
    // Provenance
    session:    fact.session    ?? null,
    verified:   fact.verified   ?? false,
  };

  _index(entry);
  _persist(entry);
  return entry;
}

function recall(query = {}) {
  _load();
  let ids = null;

  if (query.type) {
    const set = _byType.get(query.type);
    ids = set ? [...set] : [];
  } else if (query.subject) {
    const set = _bySubject.get(query.subject);
    ids = set ? [...set] : [];
  } else if (query.tag) {
    const set = _byTag.get(query.tag);
    ids = set ? [...set] : [];
  } else {
    ids = [..._facts.keys()];
  }

  let facts = ids.map(id => _facts.get(id)).filter(Boolean);

  if (query.minConfidence) facts = facts.filter(f => f.confidence >= query.minConfidence);
  if (query.predicate)     facts = facts.filter(f => f.predicate === query.predicate);
  if (query.verified)      facts = facts.filter(f => f.verified);

  // Sort by confidence desc, then ts desc
  facts.sort((a, b) => b.confidence - a.confidence || b.ts - a.ts);

  return query.n ? facts.slice(0, query.n) : facts;
}

function recallAbout(subject, predicate = null) {
  _load();
  const ids = _bySubject.get(subject) ?? new Set();
  let facts = [...ids].map(id => _facts.get(id)).filter(Boolean);
  if (predicate) facts = facts.filter(f => f.predicate === predicate);
  return facts.sort((a, b) => b.confidence - a.confidence);
}

function verify(id) {
  _load();
  const fact = _facts.get(id);
  if (!fact) return null;
  const verified = { ...fact, verified: true, verifiedAt: Date.now() };
  _facts.set(id, verified);
  _persist({ ...verified, _op: 'verify' });
  return verified;
}

function deprecate(id, reason) {
  _load();
  const fact = _facts.get(id);
  if (!fact) return null;
  const deprecated = { ...fact, deprecated: true, deprecatedAt: Date.now(), deprecationReason: reason };
  _facts.set(id, deprecated);
  _persist({ ...deprecated, _op: 'deprecate' });
  return deprecated;
}

function stats() {
  _load();
  const byType = {};
  for (const [type, ids] of _byType) byType[type] = ids.size;
  return {
    total:      _facts.size,
    byType,
    subjects:   _bySubject.size,
    tags:       _byTag.size,
    verified:   [..._facts.values()].filter(f => f.verified).length,
    deprecated: [..._facts.values()].filter(f => f.deprecated).length,
  };
}

// ── Seed with known system facts ──────────────────────────────────────────────

function seedSystemFacts() {
  _load();
  if (_facts.size > 0) return; // already seeded

  const seeds = [
    { type:'dependency', subject:'architect', predicate:'depends_on', object:'spec-compiler', confidence:1.0, source:'system', tags:['wiring','compile'] },
    { type:'dependency', subject:'spec-compiler', predicate:'reads_from', object:'cortex', confidence:0.95, source:'system', tags:['cortex','memory'] },
    { type:'invariant', subject:'field.restore', predicate:'must_not', object:'call update() internally — sets dimensions directly', confidence:1.0, source:'audit', tags:['cfr','fix'] },
    { type:'resolution', subject:'PORTS.bridge', predicate:'was_missing', object:'added bridge:9999 to nexus-connect.js PORTS', confidence:1.0, source:'audit', tags:['wiring','ports'] },
    { type:'invariant', subject:'boot-sequence', predicate:'must_start', object:'bridge first — §AXIOM', confidence:1.0, source:'spec', tags:['boot','axiom'] },
    { type:'capability', subject:'ring-buffer', predicate:'supports', object:'causal replay from any seq point with diff and rollback simulation', confidence:1.0, source:'system', tags:['ring-buffer','replay'] },
    { type:'pattern', subject:'gap-field-engine', predicate:'skips', object:'event and schema nodes — they are data declarations not implementations', confidence:1.0, source:'test', tags:['gap-field','events'] },
    { type:'capability', subject:'UTL', predicate:'extracts', object:'constraints, gaps, tensions, hooks from natural language with confidence scoring', confidence:0.95, source:'system', tags:['utl','translate'] },
    { type:'dependency', subject:'baseline-tracker', predicate:'called_from', object:'compiler/pipeline.js WritebackGate via .record()', confidence:1.0, source:'audit', tags:['baseline','pipeline'] },
    { type:'capability', subject:'SNRGate.route', predicate:'dispatches_to', object:'Guardian (score≥0.85), Idearium (score≥0.65), gap (score≥0.45), flagged (<0.45)', confidence:1.0, source:'system', tags:['snr','routing'] },
    { type:'invariant', subject:'node-ledger.upsert', predicate:'must_update', object:'_index in-memory after _write or get() returns null', confidence:1.0, source:'fix', tags:['node-ledger','index'] },
    { type:'pattern', subject:'spec-compiler.buildOrder', predicate:'includes', object:'confidence, specDepth, blastRadius per node since v1.1.1', confidence:1.0, source:'system', tags:['build-order','compiler'] },
  ];

  for (const s of seeds) learn({ ...s, ts: Date.now(), verified: true });
  console.log(`[knowledge] seeded ${seeds.length} system facts`);
}

module.exports = { learn, recall, recallAbout, verify, deprecate, stats, seedSystemFacts };
