// ═══════════════════════════════════════════════════
// NEXUS — CrystalBall Lattice Bridge
// crystalball/lattice-bridge.js
// UUID: nexus-cb-lattice-0000-4000-0000-000000000010
//
// Replicates every NEXUS bus event into an ALK-style
// associative lattice — adding multi-hop traversal and
// entity-indexed retrieval on top of the kernel's own
// direct causedBy graph.
//
// NOVEL over nexus-core kernel graph:
//   addRelated: semantic edges (not just causal)
//   traceToRoot: N-level causedBy traversal
//   Entity index: keyword → Set<eventId> (no LLM, pure regex)
//   relatedTo edges from payload metadata
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('../memory/jaa-db');

class LatticeBridge {
  constructor({ nexusKernel, jaaDB }) {
    this._nk        = nexusKernel;
    this._jaa       = jaaDB;
    this._entityIdx = new Map(); // keyword → Set<eventId>
    this._typeIdx   = new Map(); // eventType → Set<eventId>
    this._relIdx    = new Map(); // eventId → Set<relatedEventId>
  }

  attach() {
    // Wildcard — every event enters the lattice (§M1: no exceptions)
    this._nk.on('**', (ev) => this._ingest(ev));
  }

  _ingest(ev) {
    if (!ev?.id || !ev?.type) return;

    // Type index
    if (!this._typeIdx.has(ev.type)) this._typeIdx.set(ev.type, new Set());
    this._typeIdx.get(ev.type).add(ev.id);

    // relatedTo semantic edges
    if (Array.isArray(ev.relatedTo)) {
      for (const relId of ev.relatedTo) {
        if (!this._relIdx.has(relId)) this._relIdx.set(relId, new Set());
        this._relIdx.get(relId).add(ev.id);
      }
    }

    // Entity extraction from payload (pure regex, zero LLM)
    const entities = extractEntities(ev.payload, ev.type);
    for (const entity of entities) {
      const key = entity.value.toLowerCase();
      if (!this._entityIdx.has(key)) this._entityIdx.set(key, new Set());
      this._entityIdx.get(key).add(ev.id);

      // Persist to JaaDB (async, non-blocking — §1.2: log, never crash)
      this._jaa.insert('memory_index', {
        uuid:       `mi-${ev.id}-${key.slice(0, 8)}`,
        keyword:    key,
        entityType: entity.type,
        eventId:    ev.id,
        eventType:  ev.type,
        tick:       ev.tick,
        wall:       ev.wall ?? Date.now(),
      }).catch(e => this._nk.emit('crystalball.lattice.error', {
        code: 'INDEX_WRITE_FAILED', message: e.message, eventId: ev.id,
      }));
    }
  }

  // ── Query API ────────────────────────────────────

  queryByKeyword(keyword, limit = 30) {
    const ids = this._entityIdx.get(keyword.toLowerCase()) ?? new Set();
    return [...ids].slice(0, limit);
  }

  queryByType(typePattern, limit = 30) {
    // Supports wildcard: 'gate.*' matches gate.passed, gate.failed
    const escaped = typePattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]+');
    const regex   = new RegExp(`^${escaped}$`);
    const ids     = [];
    for (const [type, set] of this._typeIdx) {
      if (regex.test(type)) ids.push(...set);
    }
    return ids.slice(0, limit);
  }

  // Multi-hop causal traversal (backward — ancestors)
  causalChain(eventId, depth = 10) {
    return this._nk.ancestors(eventId, depth);
  }

  // Multi-hop causal traversal (forward — descendants)
  causalDescendants(eventId, depth = 5) {
    return this._nk.descendants(eventId, depth);
  }

  // Semantic related (bidirectional relatedTo index)
  related(eventId, limit = 20) {
    const ids = this._relIdx.get(eventId) ?? new Set();
    return [...ids].slice(0, limit);
  }

  // Full multi-hop: ancestors + descendants + related
  neighborhood(eventId, opts = {}) {
    const { depth = 5, includeRelated = true } = opts;
    const anc  = this.causalChain(eventId, depth);
    const desc = this.causalDescendants(eventId, Math.ceil(depth / 2));
    const rel  = includeRelated ? this.related(eventId) : [];
    // Dedup by id
    const seen = new Set();
    return [...anc, ...desc, ...rel].filter(n => {
      const id = n?.id ?? n;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  // Stats for admin panel
  get stats() {
    return {
      entityKeys: this._entityIdx.size,
      typeKeys:   this._typeIdx.size,
      relEdges:   this._relIdx.size,
    };
  }
}

// ── Entity extractor (no LLM, pure regex) ──────────
// Covers 80% of retrieval needs. Fast. Zero deps.
function extractEntities(payload, eventType) {
  const text     = JSON.stringify(payload ?? {});
  const entities = [];

  // File paths
  for (const m of text.matchAll(/[\w/.-]+\.(js|ts|json|html|md|yaml|yml)/g))
    entities.push({ type: 'file', value: m[0] });

  // Event channels
  for (const m of text.matchAll(/(nexus|alk|gate|agent|healer|raid|manifest|crystalball|memory|automation)\.[a-z._]+/g))
    entities.push({ type: 'channel', value: m[0] });

  // Gap types
  for (const m of text.matchAll(/\b(missing|broken|shadow|weak|intent)\b/gi))
    entities.push({ type: 'gap_type', value: m[0].toLowerCase() });

  // Agent IDs
  for (const m of text.matchAll(/\b(ollama|chatgpt|claude|gemini|deepseek)\b/gi))
    entities.push({ type: 'agent', value: m[0].toLowerCase() });

  // Severity levels
  for (const m of text.matchAll(/\b(fatal|high|medium|low)\b/gi))
    entities.push({ type: 'severity', value: m[0].toLowerCase() });

  // UUIDs
  for (const m of text.matchAll(/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/gi))
    entities.push({ type: 'uuid', value: m[0] });

  // Module/layer names from event type itself
  const parts = eventType.split('.');
  if (parts.length >= 2) entities.push({ type: 'module', value: parts[0] });

  return entities;
}

module.exports = { LatticeBridge, extractEntities };
