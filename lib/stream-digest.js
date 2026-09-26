'use strict';
/**
 * lib/stream-digest.js — SHARED continuous stream normalizer (P7)
 * UUID: nexus-lib-stream-digest-v1-0000-2026-0707-jamesbrooks-001
 * Version: 1.0.0
 *
 * §GAP CLOSED 2026-07-07 — the last unbuilt piece of forge.spec's
 * "continuous stream". Checked what was already real first:
 * copilot/server.js's _stream buffer is ALREADY fed live from Cortex's
 * and Guardian's SSE /events, and ALREADY flows into context assembly
 * (cc.assemble({ eventBuffer: _stream }), assembleContext(_stream)). The
 * listen->buffer->context path exists. Two specific things named in the
 * ask were genuinely missing, and this is only those two:
 *
 *   1. NORMALIZE — raw events are JSON blobs; "parses the data into
 *      plain text" means turning {type:'guardian.job.complete',
 *      payload:{chars:840,ms:1200}} into "guardian finished a job (840
 *      chars, 1.2s)" — readable, the shape a model actually uses well.
 *   2. NOTHING LOST — the in-memory _stream is bounded and dies on
 *      restart. "Each conversation logged in a ledger, nothing lost"
 *      means periodically digesting the recent stream into Cortex
 *      (via the real push/recall built this session) so it survives
 *      and is recallable later, not just held in RAM until the next
 *      restart drops it.
 *
 *
 * §PHASEMAP P7 2026-07-30 — PROMOTED to lib/ from copilot/ so it is a SHARED
 * subscribable: copilot, Guardian's tool-loop, the tablet, and idearium all read
 * the SAME normalized digest from one source (§10.3 — one stream, many readers,
 * not N copies). copilot/stream-digest.js now re-exports this. The normalizer was
 * always sovereign (knows nothing about copilot) — this just moves it to a
 * neutral home so no consumer has to reach into the copilot module.
 *
 * Sovereign and injectable — takes getStream() and a pushToCortex()
 * function, knows nothing about copilot's internals or Cortex's HTTP
 * directly. Same dependency-injection discipline as everything real
 * this session.
 */

// ── Normalizer — raw event -> one readable plain-text line ────────────────────
// Handles the real event types this session actually touched. Unknown
// types get a safe generic rendering, never dropped silently and never
// crash on an unexpected shape.
function normalizeEvent(ev) {
  const t = ev.type || 'unknown';
  const p = ev.payload || ev.data || {};
  switch (t) {
    case 'guardian.job.complete':
      return `guardian finished a job${p.chars ? ` (${p.chars} chars` : ''}${p.ms ? `, ${(p.ms / 1000).toFixed(1)}s)` : p.chars ? ')' : ''}`;
    case 'guardian.artifact':
      return `guardian produced a ${p.lang || 'code'} artifact${p.chars ? ` (${p.chars} chars)` : ''}`;
    case 'cortex.gap.found':
      return `a gap was detected: ${p.type || 'unknown'}${p.description ? ` — ${p.description}` : ''}`;
    case 'system.heartbeat':
      return `${ev.source || 'a system'} checked in (${p.status || 'online'})`;
    case 'copilot.answered':
      return `co-pilot answered a ${p.intent || 'request'} (via ${p.modelUsed || 'model'})`;
    case 'heal-loop.result':
      return `heal-loop ${p.ok ? 'resolved' : 'could not resolve'} a gap`;
    case 'cortex.snapshot.rolled_back':
      return `cortex rolled back to a prior snapshot`;
    default:
      // Generic — readable, never a raw JSON dump, never a throw
      return `${ev.source ? ev.source + ': ' : ''}${t.replace(/\./g, ' ')}`;
  }
}

/**
 * normalizeStream(events, limit) — turn a slice of the raw event buffer
 * into a readable plain-text block, most-recent last, deduped on
 * identical consecutive lines (a flapping system shouldn't fill the
 * digest with 40 identical heartbeat lines).
 */
function normalizeStream(events, limit = 30) {
  const lines = [];
  let last = null;
  for (const ev of events.slice(-limit)) {
    const line = normalizeEvent(ev);
    if (line !== last) { lines.push(line); last = line; }
  }
  return lines.join('\n');
}

/**
 * StreamDigest — the periodic "nothing lost" loop. Every intervalMs,
 * takes the recent normalized stream and pushes it into Cortex as one
 * digest entry (tier 'session'), so the live feed becomes durable,
 * recallable history instead of RAM that dies on restart.
 */
class StreamDigest {
  constructor({ getStream, pushToCortex, intervalMs = 60000, digestSize = 30 } = {}) {
    if (typeof getStream !== 'function') throw new Error('[stream-digest] getStream() required');
    if (typeof pushToCortex !== 'function') throw new Error('[stream-digest] pushToCortex() required');
    this._getStream = getStream;
    this._pushToCortex = pushToCortex;
    this._intervalMs = intervalMs;
    this._digestSize = digestSize;
    this._timer = null;
    this._lastDigestAt = 0;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._digest(), this._intervalMs);
    if (this._timer.unref) this._timer.unref(); // never keep the process alive just for digests
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  // Exposed for testing and for an explicit flush (e.g. before shutdown).
  _digest() {
    try {
      const events = this._getStream() || [];
      if (!events.length) return { ok: true, skipped: 'empty stream' };
      const text = normalizeStream(events, this._digestSize);
      if (!text) return { ok: true, skipped: 'nothing to digest' };
      const digest = `=== ACTIVITY DIGEST (${new Date().toISOString()}) ===\n${text}`;
      this._pushToCortex(digest, ['stream-digest', 'activity'], 'session');
      this._lastDigestAt = Date.now();
      return { ok: true, digested: events.length, chars: digest.length };
    } catch (e) {
      return { ok: false, error: e.message }; // never throw from a timer callback
    }
  }
}

module.exports = { normalizeEvent, normalizeStream, StreamDigest, classifyRelevance };

// §PHASEMAP P9 (bridge) — relevance classification. UI gated events (_logToData)
// already reach the stream; P9 is the missing half: a PURE classifier (§14.2)
// that detects a RELEVANT pattern co-pilot should act on — a repeated error or a
// stuck flow — so co-pilot assists proactively without being asked (§13.1). Soft
// signal (relevance is a judgment, not a hard gate). §8.6 — lives in the shared
// stream module, no new bus.
//
// @param {Array} events — recent stream events (each {type, payload, ts, ...})
// @param {object} opts — { errorThreshold=3, windowMs=120000 }
// @returns {{relevant, signals:[{kind, detail, count}]}}
function classifyRelevance(events, opts = {}) {
  const errorThreshold = opts.errorThreshold || 3;
  const windowMs = opts.windowMs || 120000;
  const now = Date.now();
  const recent = (events || []).filter(e => e && (now - (e.ts || now)) <= windowMs);
  const signals = [];

  // Repeated UI errors — the same error type recurring is a strong assist signal.
  const errorCounts = {};
  for (const e of recent) {
    const t = e.type || '';
    if (/error|fail|confusion|unhandled/i.test(t)) {
      const key = t;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
  }
  for (const [kind, count] of Object.entries(errorCounts)) {
    if (count >= errorThreshold) signals.push({ kind: 'repeated_error', detail: kind, count });
  }

  // Stuck flow — many interactions with no completion/answer in the window.
  const interactions = recent.filter(e => /^ui\./.test(e.type || '')).length;
  const completions = recent.filter(e => /answered|complete|response|success/i.test(e.type || '')).length;
  if (interactions >= 8 && completions === 0) {
    signals.push({ kind: 'stuck_flow', detail: 'many UI interactions, no completion', count: interactions });
  }

  return { relevant: signals.length > 0, signals };
}
