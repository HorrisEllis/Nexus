'use strict';
/**
 * lib/nerve-ollama-bridge.js — pushes Nerve's real snapshot into ollama's
 * standing stream channel as continuous context, never as a new job.
 * comp_id: nexus.lib.nerve-ollama-bridge
 * UUID: nexus-nerve-ollama-bridge-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P7c of docs/copilot-full-capability-phasemap.spec, the
 * last piece — Nerve's per-window attention (P7a) + ollama's standing
 * stream channel (P7b) both existed as of this same session; this connects
 * them). Deliberately dumb on purpose: reads Nerve's real getSnapshot(),
 * formats a compact diff, PUTs it to ollama's /api/stream/:channelId/context
 * route — which does NOT trigger a generation call (§P7b's own design).
 * No decision logic here either; Nerve's §attention-non-truth invariant
 * ("Nerve determines what is shown, not what is true") holds all the way
 * through this bridge — it relays a projection, it doesn't interpret one.
 *
 * §DIFF-ONLY, NOT EVERY POLL — pushing the full snapshot every 2s (Nerve's
 * own poll interval) would flood the channel with near-duplicate context on
 * every call. This only pushes when something actually changed (a window's
 * mutationCount moved, or a window went idle<->active), same "don't push
 * noise" discipline the SNR filter elsewhere in this codebase already
 * applies to a different signal.
 */
const http = require('http');

const OLLAMA_PORT = process.env.OLLAMA_PORT || 3749;
let _lastPushed = {}; // agentId → last-pushed mutationCount, to detect real change

function _put(path, body) {
  return new Promise(resolve => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1', port: OLLAMA_PORT, path, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }, timeout: 5000,
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({ ok: false, error: `unparseable (${res.statusCode})` }); } }); });
    req.on('error', e => resolve({ ok: false, error: `ollama unreachable: ${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timed out' }); });
    req.write(data); req.end();
  });
}

/**
 * pushContext(channelId) — read Nerve's real snapshot, push only what
 * changed since the last call as ollama context. Returns { ok, pushed,
 * reason } — pushed:false with a reason is a normal, expected outcome
 * (nothing changed), not an error.
 */
async function pushContext(channelId) {
  if (!channelId) return { ok: false, reason: 'channelId required' };
  let snap;
  try { snap = require('./nerve/index.js').getSnapshot(); }
  catch (e) { return { ok: false, reason: `nerve unavailable: ${e.message}` }; }

  const changed = (snap.windows || []).filter(w => _lastPushed[w.agentId] !== w.mutationCount);
  if (!changed.length) return { ok: true, pushed: false, reason: 'no change since last push' };

  for (const w of changed) _lastPushed[w.agentId] = w.mutationCount;

  const lines = changed.map(w =>
    `window ${w.agentId}: ${w.mutationCount} DOM mutations, ${w.idle ? 'idle' : 'active'} (${w.msSinceLastMutation}ms since last)`);
  const context = `Live window activity update:\n${lines.join('\n')}`;

  const r = await _put(`/api/stream/${encodeURIComponent(channelId)}/context`, { context });
  return { ok: !!r.ok, pushed: !!r.ok, windowsChanged: changed.length, ollamaResponse: r };
}

function _resetForTest() { _lastPushed = {}; }

module.exports = { pushContext, _resetForTest, MODULE_ID: 'nerve-ollama-bridge', VERSION: '1.0.0' };
