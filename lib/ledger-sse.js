'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// lib/ledger-sse.js — the cross-process ledger wire (agnostic lib tool)
// UUID: nexus-ledger-sse-v1-0000-2026-0817-001
// Version: 1.0.0
// Component: lib.ledger-sse
// Hook: lib.ledger-sse:v1:p0001
//
// James: "i need to see co-pilot activity in the autopilot… cos needs an sse,
// as well as the diagnostic system, with event ledger that matches the event
// ledger schema."
//
// THE FINDING THIS EXISTS FOR — lib/ledger-fanin holds its subscribers in
// module-level state (`let _subscribers = []`). That is per-PROCESS. Autopilot
// spawns copilot, cortex, diagnostic and the rest as separate `node` processes,
// each with its own fan-in instance. So autopilot's boot line
//
//     §P1 fan-in wired: activity-log, autopilot, snapshot-trigger
//                       (deferred: intelligence,copilot)
//
// was never going to resolve: "co-pilot subscribes at its own boot" means it
// subscribes to a DIFFERENT array in a DIFFERENT process. No event could ever
// cross. The fan-in is the right hub; it was simply missing a wire between
// processes. This is that wire, and nothing more.
//
// TWO SIDES, ONE MODULE (§10.3 one source of truth — the row shape must not be
// able to drift between emitter and consumer, which is exactly what happens
// when each system hand-rolls its own /sse):
//
//   mount(res, opts)      — emitter. A system serves its local fan-in as SSE.
//   subscribe(url, opts)  — consumer. Connects to a remote system's stream and
//                           replays each row into the LOCAL fan-in, tagged.
//
// §schema — every frame on the wire is a literal lib/component-ledger row:
//   { uuid, system, component, action, status, tags, detail, causedBy,
//     contractUuid, session, hook, wire, faultId, intent, sourceRef, ts }
// A frame that does not carry system/component/action is REFUSED at the wire
// (§1.1) rather than forwarded as a half-row that reads like evidence.
//
// §1.2 — a dead consumer, an unreachable emitter, and a malformed frame are
// each REPORTED and COUNTED, never silently dropped. health() answers "is this
// observable at all", which is a different question from "is it empty".
// §0.3 — a late subscriber replays the fan-in ring, so attaching mid-run does
// not start blind.
// §14.4 — a row that arrived FROM the wire is never re-emitted onto the wire,
// or two systems watching each other would loop forever.
// ─────────────────────────────────────────────────────────────────────────────

const http = require('http');
const { URL } = require('url');

const MODULE_ID = 'ledger-sse';
const VERSION   = '1.0.0';
const COMP_ID   = 'lib.ledger-sse';
const HOOK_ID   = 'lib.ledger-sse:v1:p0001';

// The canonical ledger row fields, in lib/component-ledger.write()'s own order.
// Kept here so a drifting emitter is detectable rather than merely wrong.
const LEDGER_FIELDS = ['uuid', 'system', 'component', 'action', 'status', 'tags',
  'detail', 'causedBy', 'contractUuid', 'session', 'hook', 'wire', 'faultId',
  'intent', 'sourceRef', 'ts'];

// Marks a row as having crossed the wire already. Prevents the A→B→A loop.
const RELAY_TAG = '_viaLedgerSSE';

const RECONNECT_MIN_MS  = 1000;
const RECONNECT_MAX_MS  = 30000;
const HEARTBEAT_MS      = 15000;   // keeps proxies/electron from reaping idle streams

let _fanin;   // lazy, same pattern as component-ledger
function _getFanin() {
  if (_fanin === undefined) {
    try { _fanin = require('./ledger-fanin'); } catch (_) { _fanin = null; }
  }
  return _fanin;
}

// ── Row normalisation ────────────────────────────────────────────────────────
// The fan-in carries two shapes today: canonical component-ledger rows, and the
// looser { type, source, payload, ts } event shape that activity-log consumes.
// Both are real and both are already in use, so this coerces the loose one INTO
// the canonical one rather than rejecting it — but it never invents a hook or a
// wire to do so. Unknown stays null, exactly as component-ledger insists.
function toLedgerRow(input, fallbackSystem = null) {
  if (!input || typeof input !== 'object') return null;

  // Already canonical.
  if (input.system && input.component && input.action) {
    return _pick(input);
  }

  // ── component-ledger's OWN fan-in emit shape ──────────────────────────────
  // FOUND BY RUNNING IT, not by reading it. lib/component-ledger.js:275 emits:
  //
  //   { type: `${system}.${action}`,      // NOTE: system.action, not component.action
  //     source: system, component, _system: system,
  //     payload: { status, hook, wire, intent, faultId, detail },
  //     causedBy, ts }
  //
  // The real `component` is at the TOP level and `status`/`hook`/`wire` are
  // NESTED in payload. Re-deriving from `type` — which the generic branch
  // below does — silently produced component:'copilot' instead of
  // 'copilot.lifeline', and status:'info' for a row whose status was 'error'.
  // An error row arriving as info is worse than not arriving: it is wrong data
  // that looks right. This branch reads the fields that are actually there.
  // It must come FIRST — this is the shape all 22 ledger writers produce.
  if (input.component && (input.source || input._system) && input.payload && typeof input.payload === 'object') {
    const sys = input.source || input._system;
    const t   = typeof input.type === 'string' ? input.type : '';
    // type is `${system}.${action}` — strip the system prefix to recover the
    // action verbatim, rather than assuming it is the last dotted segment
    // (actions like 'route_decided' are single-token, but 'a.b' is possible).
    const action = t.startsWith(`${sys}.`) ? t.slice(sys.length + 1) : (t.split('.').pop() || 'unknown');
    const pl = input.payload;
    return _pick({
      uuid: input.uuid || null,
      system: sys, component: input.component, action,
      status: pl.status || _statusOf(input, pl),
      tags: Array.isArray(input.tags) ? input.tags : [],
      detail: pl.detail !== undefined ? pl.detail : null,
      causedBy: input.causedBy || null,
      contractUuid: input.contractUuid || pl.contractUuid || null,
      session: input.session || pl.session || null,
      hook: pl.hook || null,          // carried through as-is; still never derived
      wire: pl.wire || null,
      faultId: pl.faultId || null,
      intent: pl.intent || null,
      sourceRef: input.sourceRef || pl.sourceRef || null,
      ts: input.ts || Date.now(),
    });
  }

  // Loose fan-in event shape: { type:'copilot.prompt.received', source, payload }
  const type = typeof input.type === 'string' ? input.type : null;
  if (!type) return null;

  const system = input.source || input._system || fallbackSystem;
  if (!system) return null;

  // 'copilot.prompt.received' → component 'copilot.prompt', action 'received'.
  // A single-segment type has no component to speak of; the system stands in,
  // which is honest — it says "this system, unlocated" rather than guessing.
  const parts  = type.split('.');
  const action = parts.length > 1 ? parts[parts.length - 1] : type;
  const component = parts.length > 1 ? parts.slice(0, -1).join('.') : String(system);

  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};

  return _pick({
    uuid: input.uuid || null,
    system, component, action,
    status: _statusOf(input, payload),
    tags: Array.isArray(input.tags) ? input.tags : [],
    detail: input.detail != null ? input.detail : (Object.keys(payload).length ? payload : null),
    causedBy: input.causedBy || payload.causedBy || null,
    contractUuid: input.contractUuid || payload.contractUuid || null,
    session: input.session || payload.sessionId || null,
    hook: input.hook || null,      // never derived — see component-ledger §schema
    wire: input.wire || null,
    faultId: input.faultId || payload.faultId || null,
    intent: input.intent || payload.intent || null,
    sourceRef: input.sourceRef || null,
    ts: input.ts || Date.now(),
  });
}

// Mirrors lib/activity-log's _isError so error classification cannot disagree
// between the SSE wire and the error_log sink. One rule, two readers.
function _statusOf(row, payload) {
  if (row.status) return row.status;
  const t = String(row.type || '').toLowerCase();
  if (/error|fail|crash|denied|exception|fault|unreachable|reject/.test(t)) return 'error';
  if (payload && (payload.error || payload.failed || payload.severity === 'high')) return 'error';
  return 'info';
}

function _pick(row) {
  const out = {};
  for (const f of LEDGER_FIELDS) out[f] = row[f] !== undefined ? row[f] : null;
  if (!Array.isArray(out.tags)) out.tags = out.tags ? [out.tags] : [];
  if (!out.ts) out.ts = Date.now();
  if (!out.status) out.status = 'info';
  return out;
}

// ── EMITTER SIDE — mount() ───────────────────────────────────────────────────
const _streams = new Map();   // system → { clients:Set, unsub, sent, refused, opened }

/**
 * mount(res, opts) — serve this process's fan-in as an SSE of ledger rows.
 * Call from any system's HTTP handler:
 *
 *   if (url.pathname === '/ledger/stream') return ledgerSSE.mount(res, { system:'copilot' });
 *
 * @param {http.ServerResponse} res
 * @param {object}  opts
 * @param {string}  opts.system   — the mounting system's name (required, §1.1)
 * @param {number} [opts.replay]  — ring rows to send on connect (§0.3), default 50
 * @param {function}[opts.filter] — (row) => boolean
 * @returns {{ok:boolean, error?:string}}
 */
function mount(res, opts = {}) {
  const system = opts.system;
  if (!system) {
    // §1.1 — an anonymous stream is unattributable, so it is refused by name
    // rather than served as rows nobody can trace to a source.
    console.warn(`[${MODULE_ID}] §1.1 mount() refused — no system name given`);
    try { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'mount requires opts.system' })); } catch (_) {}
    return { ok: false, error: 'mount requires opts.system' };
  }

  try {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Ledger-Schema-Version': VERSION,
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const st = _ensureStream(system, opts);
  st.clients.add(res);
  st.opened++;

  // Announce the contract on connect, so a consumer can verify the shape it is
  // about to receive instead of inferring it from the first row that arrives.
  _write(res, 'ledger.schema', { system, version: VERSION, fields: LEDGER_FIELDS });

  // §0.3 — replay so a late consumer starts caught-up, not blind.
  const replayN = opts.replay == null ? 50 : opts.replay;
  if (replayN > 0) {
    const fanin = _getFanin();
    const ring = fanin && typeof fanin.replay === 'function' ? (fanin.replay(replayN) || []) : [];
    for (const raw of ring) {
      const row = toLedgerRow(raw, system);
      if (row && !_isRelayed(raw)) _write(res, 'ledger.row', row);
    }
  }

  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (_) {} }, HEARTBEAT_MS);
  if (hb.unref) hb.unref();

  const drop = () => { clearInterval(hb); st.clients.delete(res); };
  res.on('close', drop);
  res.on('error', drop);

  return { ok: true };
}

function _ensureStream(system, opts) {
  let st = _streams.get(system);
  if (st) return st;

  st = { clients: new Set(), unsub: null, sent: 0, refused: 0, opened: 0, since: Date.now() };
  _streams.set(system, st);

  const fanin = _getFanin();
  if (!fanin || typeof fanin.subscribe !== 'function') {
    // §1.2 — no fan-in means this stream can only ever be empty. Say so at
    // mount time; an empty stream that looks healthy is the failure mode this
    // whole module exists to remove.
    console.warn(`[${MODULE_ID}] '${system}' mounted but lib/ledger-fanin is unavailable — the stream will carry nothing. This is reported, not hidden.`);
    return st;
  }

  st.unsub = fanin.subscribe(`ledger-sse:${system}`, (raw) => {
    // §14.4 — never re-broadcast something that arrived over the wire.
    if (_isRelayed(raw)) return;

    const row = toLedgerRow(raw, system);
    if (!row) {
      st.refused++;
      return;   // counted, surfaced by health() — never a silent drop
    }
    if (opts.filter && !_safeFilter(opts.filter, row)) return;

    st.sent++;
    for (const c of st.clients) {
      try { _write(c, 'ledger.row', row); }
      catch (_) { st.clients.delete(c); }   // §1.2 one dead client never stops the fan-out
    }
  });

  return st;
}

function _safeFilter(fn, row) { try { return !!fn(row); } catch (_) { return false; } }
function _isRelayed(raw) { return !!(raw && (raw[RELAY_TAG] || (raw.payload && raw.payload[RELAY_TAG]))); }

function _write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** unmount(system) — tear a mounted stream down (tests, shutdown). */
function unmount(system) {
  const st = _streams.get(system);
  if (!st) return false;
  if (st.unsub) { try { st.unsub(); } catch (_) {} }
  for (const c of st.clients) { try { c.end(); } catch (_) {} }
  _streams.delete(system);
  return true;
}

// ── CONSUMER SIDE — subscribe() ──────────────────────────────────────────────
const _subs = new Map();   // name → handle

/**
 * subscribe(url, opts) — connect to a remote system's ledger stream and push
 * every row into the LOCAL fan-in, tagged with its origin. This is the call
 * autopilot makes for copilot, cos and diagnostic.
 *
 * Reconnects with backoff. An unreachable emitter is a REPORTED state, never a
 * quiet zero: health() distinguishes "connected, nothing happening" from "never
 * reached it" — the same unknown-vs-zero distinction /graph already enforces.
 *
 * @param {string} url            — e.g. 'http://127.0.0.1:3750/ledger/stream'
 * @param {object} opts
 * @param {string} opts.name      — origin label, e.g. 'copilot' (required)
 * @param {function}[opts.onRow]  — extra sink, called with each canonical row
 * @param {boolean}[opts.toFanin] — replay into the local fan-in (default true)
 * @returns {{name, close, health}}
 */
function subscribe(url, opts = {}) {
  const name = opts.name;
  if (!name) throw new Error(`[${MODULE_ID}] §1.1 subscribe() requires opts.name — an unlabelled source cannot be attributed`);

  const state = {
    name, url, connected: false, everConnected: false,
    rows: 0, malformed: 0, attempts: 0, lastError: null,
    lastRowAt: null, since: Date.now(),
  };

  let req = null, timer = null, closed = false, backoff = RECONNECT_MIN_MS;

  const connect = () => {
    if (closed) return;
    state.attempts++;
    let u;
    try { u = new URL(url); }
    catch (e) { state.lastError = `bad url: ${e.message}`; return; }   // never retried — it will never parse

    req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: 'GET', headers: { Accept: 'text/event-stream' },
    }, (res) => {
      if (res.statusCode !== 200) {
        // §1.2 — a 404 here means the emitter has not mounted the stream. That
        // is a different fault from "unreachable" and is named as such.
        state.lastError = `HTTP ${res.statusCode} — does ${name} mount /ledger/stream?`;
        state.connected = false;
        res.resume();
        return retry();
      }
      state.connected = true;
      state.everConnected = true;
      state.lastError = null;
      backoff = RECONNECT_MIN_MS;

      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          _handleFrame(frame, state, opts);
        }
        // A frame larger than any sane ledger row means the peer is not
        // speaking this protocol. Drop the buffer loudly rather than growing
        // it until the process dies.
        if (buf.length > 1_000_000) {
          console.warn(`[${MODULE_ID}] '${name}' sent >1MB with no frame boundary — resetting buffer`);
          buf = '';
        }
      });
      res.on('end',   () => { state.connected = false; retry(); });
      res.on('error', (e) => { state.connected = false; state.lastError = e.message; retry(); });
    });

    req.on('error', (e) => {
      state.connected = false;
      state.lastError = e.code ? `${e.code} ${e.message}` : e.message;
      retry();
    });
    req.end();
  };

  const retry = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(connect, backoff);
    if (timer.unref) timer.unref();   // telemetry must never hold the process open
    backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
  };

  connect();

  const handle = {
    name,
    health: () => ({ ...state }),
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (req) { try { req.destroy(); } catch (_) {} }
      state.connected = false;
      _subs.delete(name);
    },
  };
  _subs.set(name, handle);
  return handle;
}

function _handleFrame(frame, state, opts) {
  if (!frame || frame.startsWith(':')) return;   // heartbeat

  let event = 'message', data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (event === 'ledger.schema') return;   // contract announcement, not a row
  if (!data) return;

  let row;
  try { row = JSON.parse(data); }
  catch (_) { state.malformed++; return; }   // COUNTED — §1.2, never silently dropped

  // §1.1 — a frame missing system/component/action is not a ledger row. It is
  // refused at the wire rather than forwarded as something that reads like
  // evidence but cannot be located in the architecture.
  if (!row || !row.system || !row.component || !row.action) { state.malformed++; return; }

  state.rows++;
  state.lastRowAt = Date.now();

  if (opts.toFanin !== false) {
    const fanin = _getFanin();
    if (fanin && typeof fanin.emit === 'function') {
      try {
        fanin.emit({
          type: `${row.component}.${row.action}`,
          source: row.system,
          payload: row,
          causedBy: row.causedBy || null,
          ts: row.ts,
          [RELAY_TAG]: true,        // §14.4 — do not let this loop back out
          _ledgerRow: row,
        });
      } catch (e) {
        // §1.2 — a fan-in failure must never kill the subscription that feeds it.
        console.warn(`[${MODULE_ID}] '${state.name}' fan-in emit failed: ${e.message}`);
      }
    }
  }

  if (typeof opts.onRow === 'function') {
    try { opts.onRow(row); } catch (e) { console.warn(`[${MODULE_ID}] '${state.name}' onRow threw: ${e.message}`); }
  }
}

/**
 * attachAll(sources) — subscribe to many emitters at once. Autopilot's call.
 * Returns per-source handles AND the honest wiring report (§1.1 declared≠real).
 */
function attachAll(sources = [], opts = {}) {
  const handles = [], failed = [];
  for (const s of sources) {
    // accepts `system` or `name` — callers embedded in files that other tests
    // scan by string should prefer `system` (see autopilot's note on BL-001)
    try { handles.push(subscribe(s.url, { name: s.system || s.name, onRow: opts.onRow, toFanin: opts.toFanin })); }
    catch (e) { failed.push([s.name, e.message]); }
  }
  return {
    handles, failed,
    attached: handles.map(h => h.name),
    health: () => handles.map(h => h.health()),
    closeAll: () => handles.forEach(h => { try { h.close(); } catch (_) {} }),
  };
}

// ── Observability ────────────────────────────────────────────────────────────
/**
 * health() — answers "is this observable at all", separately from "is it empty".
 * A source that has never connected is reported as blind, NOT as a clean zero.
 */
function health() {
  const emitting = [];
  for (const [system, st] of _streams) {
    emitting.push({ system, clients: st.clients.size, sent: st.sent,
      refused: st.refused, wired: !!st.unsub, since: st.since });
  }
  const consuming = [...
    _subs.values()].map(h => {
    const s = h.health();
    return {
      name: s.name, url: s.url, connected: s.connected, rows: s.rows,
      malformed: s.malformed, lastError: s.lastError, lastRowAt: s.lastRowAt,
      // The distinction that matters: silent-because-quiet vs silent-because-blind.
      state: s.connected ? (s.rows ? 'live' : 'connected-idle')
           : (s.everConnected ? 'reconnecting' : 'never-reached'),
    };
  });
  return {
    ok: true, version: VERSION, faninAvailable: !!_getFanin(),
    emitting, consuming,
    blind: consuming.filter(c => c.state === 'never-reached').map(c => c.name),
  };
}

function _resetForTest() {
  for (const s of [..._streams.keys()]) unmount(s);
  for (const h of [..._subs.values()]) { try { h.close(); } catch (_) {} }
  _subs.clear();
}

module.exports = {
  mount, unmount, subscribe, attachAll, health,
  toLedgerRow, LEDGER_FIELDS, RELAY_TAG,
  MODULE_ID, VERSION, COMP_ID, HOOK_ID, _resetForTest,
};
