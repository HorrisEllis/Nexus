'use strict';
/**
 * copilot/capability-extend.js — CA4 of the awareness/routing phasemap
 * UUID: nexus-copilot-capability-extend-v1-0000-2026-0730-001
 *
 * §PHASEMAP CA4 (docs/copilot-awareness-routing-phasemap.spec, CHUNK B). "No is
 * not an answer" (James): when co-pilot has no tool AND no agent that can fulfill
 * a request, it does NOT refuse — it files a CAPABILITY-EXTENSION request (a gap)
 * so the missing capability becomes tracked work, routed toward module_builder/
 * forge. §1.2 — an unmet request is loud (a filed gap), never a silent dead end.
 * §8.6 — files through cortex's EXISTING gap engine (POST /api/gaps → gaps table
 * + cortex.gap.found bus, which gap-finder/forge already consume); builds no new
 * gap mechanism. §0.4 — this turns "I can't" into "not yet — here's the work".
 */

const http = require('http');

const CORTEX = { host: '127.0.0.1', port: 3748 };

function _post(path, body) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = http.request({ hostname: CORTEX.host, port: CORTEX.port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }, timeout: 4000 },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: res.statusCode < 400 }); } }); });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'cortex gap post timed out' }); });
    req.write(data); req.end();
  });
}

/**
 * extendCapability(request, opts) — file a capability-extension gap for an unmet
 * request. Returns { filed, gapId, message } — a legible response the user gets
 * INSTEAD of a refusal. Non-fatal: if cortex is unreachable the gap is described
 * anyway so the user still gets "not yet" rather than "no".
 */
async function extendCapability(request, opts = {}) {
  const gap = {
    kind: 'capability_extension',
    source: opts.source || 'copilot',
    title: `capability needed: ${_shorten(request)}`,
    detail: request,
    reason: opts.reason || 'no existing tool or agent could fulfill this request',
    requestId: opts.requestId || null,
    severity: 'capability',
    proposedPath: 'module_builder',   // the path that would close this gap (CA4→forge)
    status: 'open',
  };
  const r = await _post('/api/gaps', gap);
  const filed = !!(r && (r.ok || r.id));
  const gapId = r && r.id ? r.id : null;
  const message = filed
    ? `I can't do that with what I have yet — but I've logged it as a capability to build (gap ${gapId || 'filed'}). It's now tracked work, not a dead end.`
    : `I can't do that with what I have yet. I tried to log it as a capability to build, but cortex wasn't reachable — the need is real and should be filed: "${_shorten(request)}".`;
  return { filed, gapId, message, gap };
}

/**
 * shouldExtend(toolResult, agentResult) — decide whether a request went truly
 * unfulfilled (no tool matched AND no agent produced a usable answer), i.e. the
 * point where "no is not an answer" applies. Pure (§14.2).
 */
function shouldExtend(toolResult, agentResult) {
  const toolFailed = !toolResult || toolResult.error || toolResult.unfulfilled;
  const agentFailed = !agentResult || !agentResult.ok || !agentResult.text;
  return !!(toolFailed && agentFailed);
}

function _shorten(s, n = 80) { return (s || '').replace(/\s+/g, ' ').trim().slice(0, n); }

module.exports = { extendCapability, shouldExtend, MODULE_ID: 'copilot-capability-extend', VERSION: '1.0.0' };
