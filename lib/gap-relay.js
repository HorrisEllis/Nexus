'use strict';
/**
 * lib/gap-relay.js — cross-process gap event relay
 * UUID: nexus-gap-relay-v1-0000-2026-0709-jamesbrooks-001
 * Version: 1.0.0
 *
 * §GAP CLOSED 2026-07-09 — the real "self-heal doesn't fire" root cause,
 * traced rather than assumed:
 *
 *   service/nexus-heal-loop.js (moved from repo root 2026-08-23) is REAL
 *   and correctly written. It subscribes with
 *   bus.on('*', ev => ...) — the correct single-object signature — and
 *   matches ev.type against '.gap.found' / '.gap.opened' /
 *   'nexus.gap.detected'. It is required by orchestrator.js:130, so it
 *   listens on the ORCHESTRATOR's in-process EventEmitter bus.
 *
 *   But gap events are produced in OTHER PROCESSES:
 *     - guardian/userscript-*.js emit 'cortex.gap.found' on guardian's bus
 *     - service/nexus-diagnostic.js (:7825) detects gaps and calls
 *       broadcast({type:'gap.found'}) — its own SSE clients + its own ledger
 *
 *   orchestrator's only SSE consumer (connectBridgeRelay) pipes bridge
 *   events into broadcast() — orchestrator's SSE fan-out to ITS clients —
 *   NOT into bus.emit(). So nothing has ever carried a gap across the
 *   process boundary. heal-loop has been listening to a bus on which no
 *   gap has ever been emitted.
 *
 * This is that wire, and only that wire. It does not re-implement healing;
 * heal-loop already does that, including its own §1.2 shape check that
 * rejects malformed gaps rather than feeding Architect two spaces.
 *
 * §LOOP SAFETY — the relay re-emits onto a bus that other subscribers
 * (sigma-writer) also watch. Three guards, all real:
 *   1. Only gap-shaped types are relayed. Nothing else crosses.
 *   2. A relayed event is tagged `_relayed: true` and the relay refuses to
 *      re-relay anything already carrying that tag, so a mesh of relays
 *      cannot amplify one gap into a storm.
 *   3. De-duplication by (type + gap id/uuid) within a short window — the
 *      same gap arriving from two sources is healed once, not twice.
 *
 * §INJECTABLE — takes a bus and a list of sources. No hard require of
 * orchestrator internals; testable standalone against a fake SSE server.
 */
const http = require('http');

const GAP_TYPE_RE = /\.gap\.(found|opened)$|^nexus\.gap\.detected$|^gap\.found$/;
const DEDUPE_WINDOW_MS = 30000;

class GapRelay {
  /**
   * @param {object} opts
   *   bus     — the local event bus (must have .emit(type, payload, meta))
   *   sources — [{ name, host, port, path }] SSE endpoints to consume
   */
  constructor({ bus, sources = [] } = {}) {
    if (!bus?.emit) throw new Error('[gap-relay] a bus with .emit() is required');
    this.bus = bus;
    this.sources = sources;
    this._seen = new Map();     // dedupe key -> ts
    this._reqs = [];
    this._closed = false;
    this._backoff = new Map();  // source name -> ms
    this.relayed = 0;
    this.skipped = 0;
  }

  start() {
    for (const src of this.sources) this._connect(src);
  }

  stop() {
    this._closed = true;
    for (const r of this._reqs) { try { r.destroy(); } catch (_) {} }
    this._reqs = [];
  }

  _dedupeKey(type, payload) {
    const id = payload?.id || payload?.uuid || payload?.jobId || payload?.description || '';
    return `${type}::${id}`;
  }

  _isDuplicate(key) {
    const now = Date.now();
    // Sweep expired entries so this never grows without bound.
    for (const [k, ts] of this._seen) if (now - ts > DEDUPE_WINDOW_MS) this._seen.delete(k);
    if (this._seen.has(key)) return true;
    this._seen.set(key, now);
    return false;
  }

  /** handleEvent — exposed for testing; the SSE reader calls this per frame. */
  handleEvent(msg, sourceName) {
    const type = msg?.type;
    if (!type || typeof type !== 'string') return { relayed: false, reason: 'no type' };
    if (!GAP_TYPE_RE.test(type)) { this.skipped++; return { relayed: false, reason: 'not a gap type' }; }

    // §Guard 2 — never re-relay something a relay already carried.
    if (msg._relayed) { this.skipped++; return { relayed: false, reason: 'already relayed' }; }

    const payload = msg.gap || msg.payload;
    if (!payload) { this.skipped++; return { relayed: false, reason: 'no gap payload' }; }

    // §Guard 3 — the same gap from two sources heals once.
    const key = this._dedupeKey(type, payload);
    if (this._isDuplicate(key)) { this.skipped++; return { relayed: false, reason: 'duplicate' }; }

    // §CAUGHT BEFORE SHIPPING 2026-07-09 — heal-loop matches
    // ev.type.includes('.gap.found') with a LEADING DOT. nexus-diagnostic
    // broadcasts a bare 'gap.found', which fails that check. Relaying it
    // verbatim would have produced exactly this session's dominant bug: a
    // wire that is declared, connected, and does nothing. Normalize the
    // bare form to 'nexus.gap.detected' — heal-loop's exact-match type,
    // and the honest name for "nexus itself detected this". Prefixed types
    // ('cortex.gap.found', 'guardian.gap.opened') already match and pass
    // through unchanged, preserving their origin.
    const relayType = (type === 'gap.found') ? 'nexus.gap.detected' : type;

    this.bus.emit(relayType, { ...payload, _relayed: true }, { source: `gap-relay:${sourceName}` });
    this.relayed++;
    return { relayed: true, type: relayType };
  }

  _connect(src) {
    if (this._closed) return;
    const req = http.get({ host: src.host, port: src.port, path: src.path, headers: { Accept: 'text/event-stream' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return this._reconnect(src, `HTTP ${res.statusCode}`); }
      this._backoff.set(src.name, 1000);
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          try { this.handleEvent(JSON.parse(line.slice(5).trim()), src.name); } catch (_) {}
        }
      });
      res.on('end',   () => this._reconnect(src, 'stream ended'));
      res.on('error', e => this._reconnect(src, e.message));
    });
    req.on('error', e => this._reconnect(src, e.message));
    this._reqs.push(req);
  }

  _reconnect(src, reason) {
    if (this._closed) return;
    const wait = this._backoff.get(src.name) || 1000;
    this._backoff.set(src.name, Math.min(wait * 2, 30000));
    // §1.2 — a lost gap source is reported, not silently dropped.
    console.warn(`[gap-relay] ${src.name} disconnected (${reason}); retrying in ${wait}ms`);
    const t = setTimeout(() => this._connect(src), wait);
    if (t.unref) t.unref();
  }
}

module.exports = { GapRelay, GAP_TYPE_RE };
