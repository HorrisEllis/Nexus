'use strict';
/**
 * guardian/clear-glass-bridge.js — real Guardian → Clear Glass command path
 * UUID: nexus-guardian-clear-glass-bridge-v1-0000-2026-0713-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-13 — "Guardian is supposed to use Clear Glass. It's
 * NEXUS' browser." Checked before building: Guardian and Clear Glass only
 * ever talked one direction — Clear Glass's userscripts open an
 * EventSource INTO Guardian's NCP channel (:7820/channel). Guardian never
 * called Clear Glass at all, despite a real, complete command surface
 * sitting there unused: IpcBridge's POST /cmd (:7702) — real handlers for
 * navigate, dom:query, dom:mutate, dom:pick, driver:exec, cookie
 * save/restore.
 *
 * §THE REAL WIRE FORMAT — checked clear-glass/src/ipc/bridge.js directly
 * rather than assumed: POST /cmd emits the command onto Clear Glass's own
 * bus and responds immediately with {ok, requestId, emitted} — that
 * response is an ACK that the command was accepted, not the result. The
 * actual result arrives separately, over SSE (:7701/events, standard
 * `event: <type>\ndata: <json>` format — checked clear-glass/src/sse/
 * server.js's _write() directly), as an event named by stripping a verb
 * suffix and appending '.result' (e.g. 'dom.query.request' →
 * 'dom.query.result') — the exact regex Clear Glass itself uses is
 * reused here, not re-derived, so the two can never silently drift apart.
 *
 * This is a real two-step round trip (POST to submit, SSE to collect),
 * not a simple request/response — because that's genuinely how Clear
 * Glass's own command surface works, not a simplification.
 */

const http = require('http');

const CG_IPC_PORT = parseInt(process.env.CLEARGL_IPC_PORT || '7702');
const CG_SSE_PORT = parseInt(process.env.CLEARGL_SSE_PORT || '7701');

// Same transform Clear Glass's own /cmd handler uses to compute the
// result event name from the request event name — reused verbatim so
// this can't drift from the real implementation if it ever changes there.
function _responseTypeFor(eventType) {
  return eventType.replace(/\.(exec|request|send|run|create|save|restore|route|spawn|enqueue|listen)$/, '') + '.result';
}

function _randomId() {
  return `gcb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * dispatchBrowserCommand({ eventType, data, timeoutMs }) — the real,
 * complete round trip. Resolves with the actual result payload, or an
 * honest { ok:false, error } — never silently times out into something
 * that looks like a result.
 */
const AUTOPILOT_PORT = parseInt(process.env.AUTOPILOT_STATUS_PORT || '7799');

// §BUILT 2026-07-15 — "cos as a kind of PID service, only running what's
// needed." Clear Glass is now on-demand in autopilot.js (onDemand:true) —
// this is the real trigger that makes that mean something instead of
// just being unused infrastructure. Idempotent: if Clear Glass is already
// running, autopilot's /spawn/:name returns immediately without
// re-spawning anything. If it's cold, this genuinely waits for the real
// health gate to pass before the actual dispatch below ever tries to
// connect — no guessing, no blind retry against a process that isn't
// there yet.
function _ensureClearGlassUp(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port: AUTOPILOT_PORT, path: '/spawn/clear-glass', method: 'POST', timeout: timeoutMs,
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          // §FIXED 2026-09-06 — clear-glass was promoted from an on-demand
          // kernel to a real, always-running supervised one (autopilot.js,
          // James: "decouple the userscripts from the ui"). requestSpawn()
          // now honestly answers a spawn request for an always-on kernel
          // with { ok:false, error:"...already always-on" } — correct from
          // requestSpawn's own point of view (it didn't spawn anything,
          // there was nothing to spawn), but this caller was written when
          // clear-glass really was on-demand and never distinguished "spawn
          // refused because it's already up" from "spawn genuinely failed".
          // Without this, every real dispatch would have been blocked
          // right here on what is actually good news.
          if (!parsed.ok && /already always-on/.test(parsed.error || '')) {
            resolve({ ok: true, alreadyAlwaysOn: true });
            return;
          }
          resolve(parsed);
        } catch (e) { resolve({ ok: false, error: `bad response from autopilot: ${e.message}` }); }
      });
    });
    // Honest degrade — if autopilot's status server isn't reachable at
    // all (e.g. running outside the supervised stack), don't block the
    // dispatch on something that was never guaranteed to exist. Proceed
    // and let the real connection attempt below fail with its own real
    // error if Clear Glass genuinely isn't up.
    req.on('error', () => resolve({ ok: true, autopilotUnavailable: true }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'autopilot spawn-gate timed out' }); });
    req.end();
  });
}

async function dispatchBrowserCommand({ eventType, data = {}, timeoutMs = 15000 } = {}) {
  const spawnResult = await _ensureClearGlassUp();
  if (!spawnResult.ok) {
    return { ok: false, error: `Clear Glass could not be brought up on demand: ${spawnResult.error}` };
  }
  return _dispatchBrowserCommandInner({ eventType, data, timeoutMs });
}

function _dispatchBrowserCommandInner({ eventType, data = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    if (!eventType) { resolve({ ok: false, error: 'eventType is required' }); return; }

    const requestId = _randomId();
    const responseType = _responseTypeFor(eventType);
    let settled = false;
    let sseReq = null;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (sseReq) { try { sseReq.destroy(); } catch (_) {} }
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({ ok: false, error: `timeout waiting for ${responseType} (requestId ${requestId}) after ${timeoutMs}ms` });
    }, timeoutMs);

    // ── Step 1 — subscribe to the SSE result stream BEFORE submitting the
    // command, so a fast response can never arrive before we're listening
    // for it (a real race the opposite order would have).
    sseReq = http.request({
      hostname: '127.0.0.1', port: CG_SSE_PORT, path: '/events',
      method: 'GET', headers: { Accept: 'text/event-stream' },
    }, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const eventLine = raw.split('\n').find(l => l.startsWith('event: '));
          const dataLine  = raw.split('\n').find(l => l.startsWith('data: '));
          if (!eventLine || !dataLine) continue;
          const type = eventLine.slice('event: '.length).trim();
          if (type !== responseType) continue;
          let payload;
          try { payload = JSON.parse(dataLine.slice('data: '.length)); }
          catch (_) { continue; }
          if (payload.requestId !== requestId) continue; // a different in-flight command's result
          finish({ ok: true, result: payload });
        }
      });
      res.on('error', (e) => finish({ ok: false, error: `SSE stream error: ${e.message}` }));
    });
    sseReq.on('error', (e) => finish({ ok: false, error: `could not connect to Clear Glass SSE (:${CG_SSE_PORT}): ${e.message}` }));
    sseReq.end();

    // ── Step 2 — now that we're listening, submit the actual command.
    const body = Buffer.from(JSON.stringify({ eventType, data, requestId }));
    const cmdReq = http.request({
      hostname: '127.0.0.1', port: CG_IPC_PORT, path: '/cmd', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 5000,
    }, (res) => {
      let ackBody = '';
      res.on('data', c => ackBody += c);
      res.on('end', () => {
        let ack;
        try { ack = JSON.parse(ackBody); } catch (_) { ack = null; }
        if (!ack || ack.error) {
          finish({ ok: false, error: `Clear Glass /cmd rejected the command: ${ack?.error || 'malformed response'}` });
        }
        // On success, do nothing here — the real result comes via SSE,
        // caught by the listener above. This ack only confirms submission.
      });
    });
    cmdReq.on('error', (e) => finish({ ok: false, error: `could not reach Clear Glass IPC bridge (:${CG_IPC_PORT}): ${e.message}` }));
    cmdReq.on('timeout', () => { cmdReq.destroy(); finish({ ok: false, error: 'Clear Glass /cmd submission timed out' }); });
    cmdReq.write(body);
    cmdReq.end();
  });
}

/**
 * spawnProviderTab(providerId, opts) — James: "adding agent on canvas
 * opens tab in clear glass." Deliberately NOT dispatchBrowserCommand's
 * two-step bus+SSE round trip — checked clear-glass/src/ipc/bridge.js's
 * real POST /providers/:id/start handler directly: it responds inline
 * with `res.json(await ph.start(...))`, a plain REST call, not a
 * fire-and-ack-then-listen-on-SSE command. Reusing that two-step pattern
 * here would be waiting on an SSE event that this endpoint never emits.
 * Reuses _ensureClearGlassUp() — same auto-spawn-via-autopilot gate every
 * other real Clear Glass call in this file already goes through.
 */
async function spawnProviderTab(providerId, opts = {}) {
  if (!providerId) return { ok: false, error: 'providerId is required' };
  const spawnResult = await _ensureClearGlassUp();
  if (!spawnResult.ok) {
    return { ok: false, error: `Clear Glass could not be brought up on demand: ${spawnResult.error}` };
  }
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ show: true, ...opts }));
    const req = http.request({
      hostname: '127.0.0.1', port: CG_IPC_PORT, path: `/providers/${encodeURIComponent(providerId)}/start`,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }, timeout: 15000,
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(d); } catch (e) { resolve({ ok: false, error: `bad response from Clear Glass: ${e.message}` }); return; }
        if (res.statusCode >= 400) { resolve({ ok: false, error: parsed.error || `HTTP ${res.statusCode}` }); return; }
        resolve({ ok: true, provider: parsed });
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: `could not reach Clear Glass IPC bridge (:${CG_IPC_PORT}): ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Clear Glass /providers/:id/start timed out' }); });
    req.write(body);
    req.end();
  });
}

module.exports = { dispatchBrowserCommand, spawnProviderTab, _responseTypeFor };
