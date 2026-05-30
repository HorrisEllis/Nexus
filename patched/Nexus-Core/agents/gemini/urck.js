// ═══════════════════════════════════════════════════
// NEXUS Guardian — URCK Kernel
// guardian/urck.js
//
// Universal Replay & Callto Kernel.
// Event ledger: every callto execution is logged.
// Snapshot: full state serialisable at any tick.
// Replay: reconstruct session from seq:0.
//
// No external dependencies. Runs in service worker.
// Storage: browser.storage.local (persisted across
// extension restarts without a server).
//
// Design:
//   §M1   Everything stored. No exceptions.
//   §5.1  UUID on every event.
//   §1.2  Nothing silently fails — errors are entries.
//   Law II Every transition is an immutable event.
// ═══════════════════════════════════════════════════

'use strict';

const STORAGE_KEY = 'nexus_urck_ledger';
const MAX_LEDGER  = 2000;   // ring — oldest entries evicted beyond this

// ── Event types ───────────────────────────────────
const EV = {
  CALLTO_START:    'callto.start',
  CALLTO_DONE:     'callto.done',
  CALLTO_ERROR:    'callto.error',
  CALLTO_TIMEOUT:  'callto.timeout',
  INJECTION_START: 'injection.start',
  INJECTION_DONE:  'injection.done',
  SCRAPE_START:    'scrape.start',
  SCRAPE_DONE:     'scrape.done',
  USAGE_OBSERVED:  'usage.observed',
  RATE_LIMITED:    'rate.limited',
  PEER_SEEN:       'peer.seen',
  PEER_LOST:       'peer.lost',
  BRIDGE_CONNECT:  'bridge.connect',
  BRIDGE_DISCONNECT:'bridge.disconnect',
  SESSION_START:   'session.start',
  SESSION_END:     'session.end',
};

let _seq  = 0;
let _tick = 0;

// ── Immutable event constructor ───────────────────
function mkEvent(type, payload = {}, causedBy = null) {
  return Object.freeze({
    id:       `urck-${Date.now().toString(36)}-${(_seq++).toString(36)}`,
    type,
    tick:     ++_tick,
    wall:     Date.now(),
    causedBy,
    payload:  Object.freeze({ ...payload }),
  });
}

// ── URCK class ─────────────────────────────────────
class URCK {
  constructor() {
    this._ledger    = [];   // in-memory ring
    this._listeners = [];   // (ev) => void  for live streaming to popup/admin
    this._loaded    = false;
  }

  // ── Lifecycle ──────────────────────────────────

  async load() {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      this._ledger = stored[STORAGE_KEY] || [];
      _seq  = this._ledger.length;
      _tick = this._ledger.length;
    } catch {
      this._ledger = [];
    }
    this._loaded = true;
    this.append(EV.SESSION_START, { seq: _seq });
  }

  async flush() {
    // Compact ring before persisting
    const ring = this._ledger.slice(-MAX_LEDGER);
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: ring });
    } catch (e) {
      // §1.2 — log but never crash
      console.error('[URCK] flush failed:', e.message);
    }
  }

  // ── Ledger write ────────────────────────────────

  append(type, payload = {}, causedBy = null) {
    const ev = mkEvent(type, payload, causedBy);
    this._ledger.push(ev);
    if (this._ledger.length > MAX_LEDGER * 1.2) {
      this._ledger = this._ledger.slice(-MAX_LEDGER);
    }
    // Notify live listeners (popup, admin panel)
    for (const fn of this._listeners) {
      try { fn(ev); } catch {}
    }
    // Async persist (fire-and-forget — §1.2 handles errors)
    this.flush().catch(e => console.error('[URCK] flush failed:', e.message));
    return ev;
  }

  // ── Callto lifecycle helpers ───────────────────

  calltoStart(callto) {
    return this.append(EV.CALLTO_START, {
      uuid:     callto.uuid,
      selector: callto.selector,
      site:     callto.site,
      intent:   callto.intent,
    });
  }

  calltoDone(calltoUuid, response, startEventId) {
    return this.append(EV.CALLTO_DONE, {
      calltoUuid,
      responseLength: response?.length ?? 0,
      preview:        (response || '').slice(0, 120),
    }, startEventId);
  }

  calltoError(calltoUuid, error, startEventId) {
    return this.append(EV.CALLTO_ERROR, {
      calltoUuid,
      error: error?.message ?? String(error),
      stack: error?.stack?.slice(0, 300),
    }, startEventId);
  }

  calltoTimeout(calltoUuid, ms, startEventId) {
    return this.append(EV.CALLTO_TIMEOUT, { calltoUuid, ms }, startEventId);
  }

  // ── Query / replay ──────────────────────────────

  // All events of a type, newest-first
  byType(type, limit = 50) {
    return this._ledger
      .filter(e => e.type === type)
      .slice(-limit)
      .reverse();
  }

  // All events for a callto UUID
  forCallto(uuid) {
    return this._ledger.filter(e => e.payload.uuid === uuid || e.payload.calltoUuid === uuid);
  }

  // Full replay from seq:0 — returns ordered ledger
  replay() {
    return [...this._ledger];
  }

  // Snapshot: full state at current tick
  snapshot() {
    return {
      tick:       _tick,
      seq:        _seq,
      ledgerSize: this._ledger.length,
      lastEvent:  this._ledger[this._ledger.length - 1] ?? null,
      calltos:    this.byType(EV.CALLTO_START, 20).map(e => ({
        uuid:  e.payload.uuid,
        site:  e.payload.site,
        wall:  e.wall,
        done:  this._ledger.some(x => x.payload.calltoUuid === e.payload.uuid && x.type === EV.CALLTO_DONE),
        error: this._ledger.some(x => x.payload.calltoUuid === e.payload.uuid && x.type === EV.CALLTO_ERROR),
      })),
    };
  }

  // ── Live streaming ─────────────────────────────
  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(f => f !== fn); };
  }

  get ledger() { return [...this._ledger]; }
  get tick()   { return _tick; }
}

const urck = new URCK();
// Auto-load when module initialises in service worker
urck.load().catch(e => console.error('[URCK] load failed:', e));

module.exports = { URCK, urck, EV };
