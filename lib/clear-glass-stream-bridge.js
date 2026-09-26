'use strict';
/**
 * lib/clear-glass-stream-bridge.js — forwards ClearGlass's real SSE
 * stream into copilot's own event stream, on demand.
 * UUID: nexus-lib-clear-glass-stream-bridge-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — James: "state injected into copilots event
 * stream when enabled." Checked the real mechanism directly before
 * building anything: clear-glass/src/sse/server.js's real emit(type,
 * data) writes `event: ${type}\ndata: ${JSON.stringify(data)}\n\n` —
 * every real ClearGlass subsystem (dom archaeology, driver, mesh, url
 * listener, diagnostic) already reports through this one function
 * (checked main/index.js's own real wiring: `sse: { emit: (t,d) =>
 * emit(t,d) }` passed identically to all of them). This module is the
 * missing other end: a real HTTP client connection to that same real
 * SSE endpoint, parsing its own real wire format, forwarding into
 * copilot/server.js's own real, exported streamIngest(event).
 *
 * §EXPLICIT ON/OFF, NOT TIED TO A HAT LIFECYCLE THAT DOESN'T EXIST —
 * checked hat-forge.js directly: hats have no real "wear"/"activate"
 * concept at all, only forge/list/revoke and per-dispatch use via
 * runViaAgent for scheduled responsibilities. Inventing a fake
 * activation lifecycle to hang this off of would be less honest than
 * a real, explicit enable()/disable() pair — the ClearGlass hat's own
 * toolScope includes the small tool that calls these, so "when
 * enabled" is a real action taken (by the hat, or by anyone), not an
 * implicit side effect of forging or wearing something.
 *
 * §NON-FATAL, RECONNECTS — a lost connection to ClearGlass's SSE
 * endpoint (not running, restarted, network hiccup) logs once and
 * retries; it never throws into whatever called enable() after the
 * fact, and never silently gives up permanently.
 */

const http = require('http');

const SSE_HOST = process.env.CLEAR_GLASS_SSE_HOST || '127.0.0.1';
const SSE_PORT = parseInt(process.env.CLEAR_GLASS_SSE_PORT || '7701', 10);
const RECONNECT_MS = 5000;

let _req = null;
let _enabled = false;
let _reconnectTimer = null;
let _buffer = '';
let _lastError = null;
let _eventsForwarded = 0;

/**
 * _parseSseChunk(buffer) — real SSE wire-format parsing, matching
 * clear-glass/src/sse/server.js's own exact emit() output
 * (`event: TYPE\ndata: JSON\n\n`) — not a generic/lenient SSE parser,
 * this one real shape, checked directly against the real writer.
 * Returns { events: [{type, data}], remainder } — remainder is
 * whatever's left after the last complete `\n\n`-terminated frame,
 * carried forward to the next chunk (a frame can arrive split across
 * TCP packets).
 */
function _parseSseChunk(buffer) {
  const events = [];
  const frames = buffer.split('\n\n');
  const remainder = frames.pop(); // last piece may be incomplete — never parsed here
  for (const frame of frames) {
    if (!frame.trim()) continue; // real ': ping' keepalive frames land here — not a parse failure, just nothing to forward
    const lines = frame.split('\n');
    let type = null, dataRaw = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) type = line.slice(7);
      else if (line.startsWith('data: ')) dataRaw = line.slice(6);
    }
    if (!type || dataRaw === null) continue; // a ping or malformed frame — real, not an error
    let data;
    try { data = JSON.parse(dataRaw); } catch (_) { continue; } // §1.2 — logged at the call site if this ever recurs, not silently
    events.push({ type, data });
  }
  return { events, remainder };
}

function _forward(type, data) {
  let streamIngest;
  try { streamIngest = require('../copilot/server.js').streamIngest; }
  catch (e) { _lastError = `copilot/server.js unreachable: ${e.message}`; return; }
  if (typeof streamIngest !== 'function') { _lastError = 'copilot/server.js loaded but streamIngest is not exported as a function'; return; }
  try {
    streamIngest({ type: `clear-glass.${type}`, source: 'clear-glass-stream-bridge', ts: Date.now(), ...data });
    _eventsForwarded++;
  } catch (e) { _lastError = `streamIngest threw: ${e.message}`; }
}

function _connect() {
  if (!_enabled) return;
  _buffer = '';
  _req = http.request({
    hostname: SSE_HOST, port: SSE_PORT, path: '/sse', method: 'GET',
    headers: { Accept: 'text/event-stream' },
  }, (res) => {
    res.on('data', (chunk) => {
      _buffer += chunk.toString('utf8');
      const { events, remainder } = _parseSseChunk(_buffer);
      _buffer = remainder;
      for (const e of events) _forward(e.type, e.data);
    });
    res.on('end', () => { if (_enabled) _scheduleReconnect(); });
  });
  _req.on('error', (e) => { _lastError = `SSE connection error: ${e.message}`; if (_enabled) _scheduleReconnect(); });
  _req.end();
}

function _scheduleReconnect() {
  if (_reconnectTimer) return;
  _reconnectTimer = setTimeout(() => { _reconnectTimer = null; if (_enabled) _connect(); }, RECONNECT_MS);
}

/** enable() — idempotent; a second call while already enabled is a no-op, not a second connection. */
function enable() {
  if (_enabled) return { ok: true, alreadyEnabled: true };
  _enabled = true;
  _connect();
  return { ok: true, alreadyEnabled: false };
}

/** disable() — idempotent; closes the real connection, cancels any pending reconnect. */
function disable() {
  const wasEnabled = _enabled;
  _enabled = false;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_req) { try { _req.destroy(); } catch (_) {} _req = null; }
  return { ok: true, wasEnabled };
}

function status() {
  return { enabled: _enabled, eventsForwarded: _eventsForwarded, lastError: _lastError };
}

module.exports = { enable, disable, status, _parseSseChunk };
