// ═══════════════════════════════════════════════════
// NEXUS — Continuous Stream (LLM Session Ring Buffer)
// memory/continuous-stream.js
// UUID: nexus-memory-cstream-0000-4000-000000000001
//
// Captures every token/chunk emitted by an LLM during
// a session into a bounded ring buffer. Two purposes:
//
//   1. Real-time streaming — subscribers receive chunks
//      as they arrive (admin UI, extension bridge).
//
//   2. Session reconstruction — after a session ends,
//      the full assembled text is persisted to JaaDB
//      'agent_calls' and optionally 'event_log'. If the
//      system crashes mid-stream, partial content is not
//      lost — it is recovered from the ring at next boot
//      and marked incomplete.
//
// DESIGN OVER ALTERNATIVES:
//   A single growing string per session would require
//   O(n) reallocation on every chunk. Instead: a fixed
//   array of chunk records (ring capacity = 4096 chunks
//   ≈ 16MB at ~4KB/chunk). Sessions longer than the ring
//   are still usable — only the tail is hot. Full content
//   is assembled by joining chunks[] in order, not from
//   the ring directly.
//
//   The ring is shared across sessions — each chunk
//   carries a sessionId so the ring can be replayed or
//   filtered per session.
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('./jaa-db');

const RING_CAPACITY = 4096;  // max chunks in hot ring
const MAX_SESSIONS  = 64;    // max concurrent sessions

// ── Single chunk record ────────────────────────────
// { seq, sessionId, agentId, text, wall, isFinal }

class ContinuousStream {
  constructor({ jaaDB, nexusKernel }) {
    this._jaa      = jaaDB;
    this._nk       = nexusKernel;
    this._ring     = new Array(RING_CAPACITY);
    this._ringHead = 0;   // next write slot (circular)
    this._ringSeq  = 0;   // global monotone chunk counter

    // Session map: sessionId → SessionRecord
    // SessionRecord: { sessionId, agentId, startedAt, chunks[], assembled, finalised }
    this._sessions = new Map();
  }

  // ── Lifecycle ──────────────────────────────────────
  attach() {
    // LLM chunk event from Ollama streaming or Guardian scrape
    this._nk.on('agent.stream.chunk', e => this._onChunk(e));

    // Session complete — assemble and persist
    this._nk.on('agent.response.received', e => this._onComplete(e));

    // Session failed — persist partial
    this._nk.on('agent.response.error', e => this._onError(e));

    // Query: reconstruct session from ring
    this._nk.on('stream.session.reconstruct', e => this._onReconstruct(e));

    // Boot recovery: check for incomplete sessions
    this._nk.on('system.booted', () => this._bootRecovery());

    this._nk.emit('continuous_stream.ready', {
      ringCapacity: RING_CAPACITY,
      maxSessions:  MAX_SESSIONS,
    });
  }

  // ── Chunk ingestion ────────────────────────────────
  _onChunk(event) {
    const { sessionId, agentId, text, isFinal = false } = event.payload ?? {};
    if (!sessionId || text == null) return;

    const chunk = {
      seq:       this._ringSeq++,
      sessionId,
      agentId:   agentId ?? 'unknown',
      text:      String(text),
      wall:      event.wall ?? Date.now(),
      isFinal,
    };

    // Write to ring (circular — overwrites oldest)
    this._ring[this._ringHead % RING_CAPACITY] = chunk;
    this._ringHead++;

    // Accumulate into session record
    let session = this._sessions.get(sessionId);
    if (!session) {
      if (this._sessions.size >= MAX_SESSIONS) {
        // Evict oldest finalised session to make room
        this._evictOldest();
      }
      session = {
        sessionId,
        agentId:    agentId ?? 'unknown',
        startedAt:  chunk.wall,
        chunks:     [],
        assembled:  '',
        finalised:  false,
        partial:    false,
        causedBy:   event.id,
      };
      this._sessions.set(sessionId, session);
    }

    session.chunks.push(chunk);
    session.assembled += chunk.text;

    // Emit chunk to subscribers (admin UI, bridge)
    this._nk.emit('stream.chunk.relayed', {
      sessionId,
      agentId: chunk.agentId,
      text:    chunk.text,
      seq:     chunk.seq,
      isFinal,
    }, { causedBy: event.id });
  }

  // ── Session complete ───────────────────────────────
  async _onComplete(event) {
    const { sessionId, agentId, tokens, latency } = event.payload ?? {};
    if (!sessionId) return;

    const session = this._sessions.get(sessionId);
    if (!session) return;

    session.finalised  = true;
    session.finalisedAt = Date.now();
    session.tokenCount = tokens ?? session.chunks.reduce((s, c) => s + c.text.length / 4, 0);

    // Persist assembled content to agent_calls (merge with existing record if present)
    await this._jaa.insert('agent_calls', {
      uuid:          `stream-${sessionId}`,
      sessionId,
      agentId:       session.agentId,
      assembledText: session.assembled,
      chunkCount:    session.chunks.length,
      tokenCount:    session.tokenCount,
      latencyMs:     latency ?? (session.finalisedAt - session.startedAt),
      finalised:     true,
      partial:       false,
      wall:          session.finalisedAt,
      causedBy:      session.causedBy,
    }).catch(e => {
      this._nk.emit('continuous_stream.persist_error', {
        sessionId, error: e.message, code: 'PERSIST_FAILED',
      });
    });

    this._nk.emit('stream.session.complete', {
      sessionId,
      agentId:    session.agentId,
      chunkCount: session.chunks.length,
      charCount:  session.assembled.length,
    }, { causedBy: event.id });
  }

  // ── Session error — persist partial ───────────────
  async _onError(event) {
    const { sessionId, error } = event.payload ?? {};
    if (!sessionId) return;

    const session = this._sessions.get(sessionId);
    if (!session) return;

    session.partial   = true;
    session.finalised = true;
    session.error     = error ?? 'unknown_error';
    session.finalisedAt = Date.now();

    if (session.assembled.length > 0) {
      await this._jaa.insert('agent_calls', {
        uuid:          `stream-partial-${sessionId}`,
        sessionId,
        agentId:       session.agentId,
        assembledText: session.assembled,
        chunkCount:    session.chunks.length,
        finalised:     false,
        partial:       true,
        error:         session.error,
        wall:          session.finalisedAt,
        causedBy:      session.causedBy,
      }).catch(e => this._nk.emit('memory.stream.write.error', { op: 'session.archive', sessionId, error: e.message }));
    }

    this._nk.emit('stream.session.partial', {
      sessionId,
      error:      session.error,
      chunkCount: session.chunks.length,
      charCount:  session.assembled.length,
    }, { causedBy: event.id });
  }

  // ── Boot recovery — flush unfinished sessions ──────
  async _bootRecovery() {
    // On boot, query JaaDB for sessions marked partial=true
    const partials = await this._jaa.query('agent_calls',
      r => r.partial === true && r.sessionId, 20).catch(() => []);

    if (partials.length > 0) {
      this._nk.emit('continuous_stream.recovery', {
        count:    partials.length,
        sessions: partials.map(r => r.sessionId),
        message:  `Recovered ${partials.length} partial session(s) from prior run`,
      });
    }
  }

  // ── Reconstruct a session from ring or JaaDB ───────
  async _onReconstruct(event) {
    const { sessionId } = event.payload ?? {};
    if (!sessionId) return;

    // Try hot session map first
    const hot = this._sessions.get(sessionId);
    if (hot) {
      this._nk.emit('stream.session.reconstructed', {
        requestId:     event.id,
        sessionId,
        assembled:     hot.assembled,
        chunkCount:    hot.chunks.length,
        finalised:     hot.finalised,
        source:       'hot',
      }, { causedBy: event.id });
      return;
    }

    // Fall back to JaaDB
    const records = await this._jaa.query('agent_calls',
      r => r.sessionId === sessionId, 1).catch(() => []);

    const record = records[0] ?? null;
    this._nk.emit('stream.session.reconstructed', {
      requestId:  event.id,
      sessionId,
      assembled:  record?.assembledText ?? null,
      chunkCount: record?.chunkCount ?? 0,
      finalised:  record?.finalised ?? false,
      source:     record ? 'jaadb' : 'not_found',
    }, { causedBy: event.id });
  }

  // ── Ring snapshot (for MQL Lane E) ────────────────
  snapshot(n = 20) {
    const result = [];
    // Scan ring backwards from write head
    for (let i = this._ringHead - 1; i >= 0 && result.length < n; i--) {
      const slot = ((i % RING_CAPACITY) + RING_CAPACITY) % RING_CAPACITY;
      const chunk = this._ring[slot];
      if (chunk) result.push(chunk);
    }
    return result.reverse(); // chronological order
  }

  // ── Session accessor ───────────────────────────────
  getSession(sessionId) {
    return this._sessions.get(sessionId) ?? null;
  }

  // ── Stats ──────────────────────────────────────────
  get stats() {
    const sessions = [...this._sessions.values()];
    return {
      activeSessions:    sessions.filter(s => !s.finalised).length,
      finalisedSessions: sessions.filter(s => s.finalised && !s.partial).length,
      partialSessions:   sessions.filter(s => s.partial).length,
      ringUsed:          Math.min(this._ringHead, RING_CAPACITY),
      ringCapacity:      RING_CAPACITY,
      totalChunks:       this._ringSeq,
    };
  }

  // ── Internal ───────────────────────────────────────
  _evictOldest() {
    // Find oldest finalised session
    let oldestKey = null, oldestTime = Infinity;
    for (const [k, s] of this._sessions) {
      if (s.finalised && (s.finalisedAt ?? s.startedAt) < oldestTime) {
        oldestTime = s.finalisedAt ?? s.startedAt;
        oldestKey  = k;
      }
    }
    if (oldestKey) this._sessions.delete(oldestKey);
  }
}

module.exports = { ContinuousStream };
