'use strict';
/**
 * copilot/system-status.js — CA1 of the awareness/routing phasemap
 * UUID: nexus-copilot-system-status-v1-0000-2026-0730-001
 *
 * §PHASEMAP CA1 (docs/copilot-awareness-routing-phasemap.spec). When the user
 * asks "how are you" / "how's the system", co-pilot POLLS the live system and
 * reports a real status — systems online, open gaps, health, and loom's live
 * wiring — instead of the canned "I don't have enough context" the screenshot
 * showed. §8.6 — composes the EXISTING surfaces (orchestrator /health, cortex
 * gaps, loom :3752), builds no new monitoring. §16.2 — the report reads like a
 * story. Non-fatal: any unreachable source degrades to "unknown", never throws.
 */

const http = require('http');

const ENDPOINTS = {
  orchestrator: { port: 9000, path: '/health' },
  cortex:       { port: 3748, path: '/health' },
  guardian:     { port: 7820, path: '/health' },
  bridge:       { port: 9999, path: '/health' },
  idearium:     { port: 4800, path: '/health' },
  loom:         { port: 3752, path: '/health' },
  diagnostic:   { port: 7825, path: '/health' },
};

function _get(port, path, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', timeout: timeoutMs },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: res.statusCode < 400 }); } }); });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * pollStatus() — gather live status from every system. Returns a structured
 * object; each system is 'online' | 'offline' | 'unknown'.
 */
async function pollStatus() {
  const systems = {};
  await Promise.all(Object.entries(ENDPOINTS).map(async ([name, { port, path }]) => {
    const r = await _get(port, path);
    systems[name] = r ? (r.ok !== false ? 'online' : 'degraded') : 'offline';
  }));

  // Open gaps (cortex) + loom wiring counts, best-effort.
  let openGaps = null, loomWiring = null;
  const gapsResp = await _get(3748, '/api/gaps?status=open');
  if (gapsResp && Array.isArray(gapsResp.gaps)) openGaps = gapsResp.gaps.length;
  const loomResp = await _get(3752, '/api/registry/summary');
  if (loomResp) loomWiring = loomResp.components || loomResp.count || null;

  const online = Object.values(systems).filter(s => s === 'online').length;
  const total = Object.keys(systems).length;
  return { systems, online, total, openGaps, loomWiring, ts: Date.now() };
}

/**
 * statusReport() — a human, legible status string (§16.2 reads like a story).
 * This is what co-pilot says when asked how it/the system is doing.
 */
async function statusReport() {
  const s = await pollStatus();
  const offline = Object.entries(s.systems).filter(([, v]) => v !== 'online').map(([k]) => k);
  const lines = [];
  lines.push(`I'm running. ${s.online}/${s.total} systems online.`);
  if (offline.length) lines.push(`Offline or degraded: ${offline.join(', ')}.`);
  else lines.push(`Everything's online.`);
  if (s.openGaps != null) lines.push(`${s.openGaps} open gap${s.openGaps === 1 ? '' : 's'}.`);
  if (s.loomWiring != null) lines.push(`Loom is tracking ${s.loomWiring} wired components.`);
  return { text: lines.join(' '), status: s };
}

/**
 * isStatusQuery(prompt) — does this prompt ask how the system/co-pilot is doing?
 * Pure (§14.2). Used to trigger a status report instead of a generic answer.
 */
function isStatusQuery(prompt = '') {
  const p = prompt.toLowerCase().trim();
  return /\b(how are you|how('?s| is) (it going|the system|nexus|everything)|status report|system status|are you (ok|okay|good|healthy)|you doing|run diagnostics?|diagnostics?|what('?s| is) wrong|health check|how is nexus (doing|running))\b/.test(p);
}

module.exports = { pollStatus, statusReport, isStatusQuery, MODULE_ID: 'copilot-system-status', VERSION: '1.0.0' };
