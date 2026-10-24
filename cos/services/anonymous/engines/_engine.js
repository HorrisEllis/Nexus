'use strict';
/**
 * engines/_engine.js — SDK required by every engine
 * anonymousservers.info
 *
 * Every engine requires this at the top:
 *   const { ipc, conf, log, claimPort, isInit } = require('./_engine');
 */

const fs   = require('fs');
const path = require('path');
const rl   = require('readline');

const NAME = process.env.NEXUS_ENGINE || 'unknown';
const ROOT = process.env.NEXUS_ROOT   || path.join(__dirname, '..');
const CONF = path.join(ROOT, 'conf');

// ─── IPC (newline-delimited JSON over stdin/stdout) ───────────────────────────

let _msgId = 0;
const _pending  = new Map();
const _handlers = new Map();

// Reply context for the message currently being dispatched.
// When a handler is invoked from a `route` envelope, any send() it makes
// without an explicit `to` is addressed back to the caller and stamped with
// the caller's requestId. This is what closes the request/reply loop.
let _ctx = null;

function dispatch(type, payload, envelope) {
  const fns = _handlers.get(type);
  if (!fns || !fns.length) return false;
  for (const fn of fns) {
    // A throwing handler must not take the process down. Before this guard, a
    // ReferenceError inside a single status:ping handler killed the engine, the
    // kernel restarted it, monitor pinged it again, and it died again — an
    // endless restart loop from one bad line. Fail loudly, keep serving.
    try {
      const r = fn(payload, envelope);
      if (r && typeof r.catch === 'function') {
        r.catch(e => reportHandlerError(type, e));
      }
    } catch (e) {
      reportHandlerError(type, e);
    }
  }
  return true;
}

function reportHandlerError(type, e) {
  const detail = (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  try {
    process.stdout.write(JSON.stringify({
      from: NAME,
      type: 'log',
      payload: {
        msg: `handler for '${type}' threw: ${detail}`,
        level: 'ERROR',
      },
    }) + '\n');
  } catch { /* stdout gone; nothing useful left to do */ }
}

const reader = rl.createInterface({ input: process.stdin, terminal: false });
reader.on('line', raw => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  if (msg.id && _pending.has(msg.id)) {
    const { resolve, reject } = _pending.get(msg.id);
    _pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error));
    else resolve(msg.result !== undefined ? msg.result : msg);
    return;
  }

  // ── route envelope ─────────────────────────────────────────────────────────
  // The kernel forwards `{ type:'route', to, payload:{ type:<inner>, ... } }`
  // verbatim. Engines register handlers for the INNER type, so unwrap here
  // rather than requiring every engine to know about the envelope.
  if (msg.type === 'route' && msg.payload && typeof msg.payload.type === 'string') {
    const inner = msg.payload;
    const prev  = _ctx;
    _ctx = { from: msg.from, requestId: inner.requestId, envelopeId: msg.id, type: inner.type };
    try {
      const handled = dispatch(inner.type, inner, msg);
      if (!handled) {
        // Loud, specific failure — a silently dropped route is the single
        // hardest class of bug to find in this architecture.
        send('route:unhandled', {
          requestId: inner.requestId,
          engine:    NAME,
          type:      inner.type,
          error:     `engine '${NAME}' has no handler for '${inner.type}'`,
        }, msg.from);
      }
    } finally { _ctx = prev; }
    return;
  }

  dispatch(msg.type, msg.payload, msg);
});

function send(type, payload, to) {
  const id  = ++_msgId;
  let out   = payload;
  let dest  = to;

  // Inside a route handler, an unaddressed send is a reply to the caller.
  if (_ctx && dest === undefined) {
    dest = _ctx.from;
    if (out && typeof out === 'object' && !Array.isArray(out) && out.requestId === undefined) {
      out = { ...out, requestId: _ctx.requestId };
    }
  }

  const msg = { from: NAME, type, id, payload: out };
  if (dest) msg.to = dest;
  process.stdout.write(JSON.stringify(msg) + '\n');
  return id;
}

// Explicit reply — for handlers that answer asynchronously, where the
// synchronous _ctx has already been torn down.
function reply(envelope, type, payload) {
  const from = envelope?.from || envelope?.to;
  const rid  = envelope?.payload?.requestId ?? envelope?.requestId;
  const out  = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? { requestId: rid, ...payload }
    : payload;
  return send(type, out, from);
}

function request(type, payload, to) {
  return new Promise((resolve, reject) => {
    const id = send(type, payload, to);
    _pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (_pending.has(id)) { _pending.delete(id); reject(new Error(`IPC timeout: ${type}`)); }
    }, 10000);
  });
}

function on(type, handler) {
  if (!_handlers.has(type)) _handlers.set(type, []);
  _handlers.get(type).push(handler);
}

// ─── DB proxy ─────────────────────────────────────────────────────────────────

const db = {
  insert: (table, row)         => request('db:insert', { table, row }),
  all:    (table)              => request('db:all',    { table }),
  query:  (table, gate)        => request('db:query',  { table, gate: gate.toString() }),
  update: (table, gate, patch) => request('db:update', { table, gate: gate.toString(), patch }),
  delete: (table, gate)        => request('db:delete', { table, gate: gate.toString() }),
  upsert: (table, gate, row)   => request('db:upsert', { table, gate: gate.toString(), row }),
};

// ─── config ───────────────────────────────────────────────────────────────────

function confFile() { return path.join(CONF, `${NAME}.conf`); }

function loadConf(defaults = {}) {
  try {
    const raw = fs.readFileSync(confFile(), 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return { ...defaults }; }
}

function saveConf(obj) {
  fs.mkdirSync(CONF, { recursive: true });
  const tmp = confFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, confFile());
}

function initConf(defaults) {
  if (!fs.existsSync(confFile())) saveConf(defaults);
}

// ─── log / util ───────────────────────────────────────────────────────────────

function log(msg, level = 'INFO') {
  send('log', { msg, level });
}

function claimPort(port) {
  send('port:claim', { port });
}

function route(toEngine, type, payload) {
  return request('route', payload, toEngine);
}

function isInit() { return process.env.NEXUS_INIT === '1'; }

module.exports = {
  ipc: { send, on, request, route, reply, db },
  conf: { load: loadConf, save: saveConf, init: initConf, file: confFile },
  log,
  claimPort,
  isInit,
  NAME,
  ROOT,
};
