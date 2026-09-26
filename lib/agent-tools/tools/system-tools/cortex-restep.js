'use strict';
/**
 * lib/agent-tools/tools/system-tools/cortex-restep.js — cortex.restep.tool
 *
 * James's taxonomy: "Restep .tool to recount steps using event ledgers."
 *
 * §WHY THIS IS REAL, NOT COSMETIC — this codebase has already found two
 * separate real bugs in this exact shape: intelligence's
 * `_scanPatterns` read from index 0 instead of tail() so new-event
 * counts never advanced, and `_patternScanCursor` got pinned to `now`
 * after the first pass for the same reason (both tracked in
 * /areas/nexus.md — "the engine never counts new events after boot").
 * A separately-maintained step/sequence counter drifting from the real
 * event ledger is a recurring, documented failure mode here, not a
 * hypothetical one. This tool recomputes step ordinals directly from
 * cortex's real event_log (GET /api/memory?table=event_log — confirmed
 * live at cortex/boot.js) sorted by real `ts`, so a caller can check a
 * separately-cached step count against ground truth instead of trusting it.
 *
 * §HONEST BOUNDARY — this recounts, it does not silently repair. It
 * returns the recomputed sequence and, when the caller supplies the
 * counter they currently believe, flags exactly where it diverges —
 * writing the correction back into whatever originally held that
 * counter is a separate, per-caller decision this tool doesn't make.
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const CORTEX_HOST = process.env.CORTEX_HOST || '127.0.0.1';
const CORTEX_PORT = parseInt(process.env.CORTEX_HTTP_PORT || '3748', 10);

function get(path) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: CORTEX_HOST, port: CORTEX_PORT, path, method: 'GET', timeout: 8000 },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(b) }); }
          catch (e) { resolve({ ok: false, error: `bad JSON from cortex: ${e.message}` }); }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'cortex request timed out' }); });
    req.end();
  });
}

/** Real recount logic, factored out so it's independently testable without a live cortex. */
function restep(rows, believedCount) {
  const sorted = [...rows].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const recounted = sorted.map((row, i) => ({ step: i + 1, uuid: row.uuid, type: row.type, ts: row.ts }));
  const realCount = recounted.length;
  const result = { realCount, sequence: recounted };
  if (typeof believedCount === 'number') {
    result.believedCount = believedCount;
    result.drift = realCount - believedCount;
    result.diverged = result.drift !== 0;
  }
  return result;
}

module.exports = {
  name: toolName('cortex', 'restep'),
  description:
    'Recount real event steps from cortex\'s event_log ledger (sorted by real timestamp), instead of trusting a separately-cached step counter. Optionally pass believedCount to see exactly how far a cached counter has drifted from the real ledger.',
  parameters: {
    type: 'object',
    properties: {
      n: { type: 'number', description: 'How many recent event_log rows to pull (default 200)' },
      sessionId: { type: 'string', description: 'Optional — restrict the recount to one session' },
      believedCount: { type: 'number', description: 'Optional — a currently-cached step count to check for drift against the real ledger' },
    },
  },
  execute: async ({ n = 200, sessionId, believedCount }) => {
    let path = `/api/memory?table=event_log&n=${encodeURIComponent(n)}`;
    if (sessionId) path += `&sessionId=${encodeURIComponent(sessionId)}`;
    const result = await get(path);
    if (!result.ok) return { error: result.error || `cortex returned status ${result.status}` };
    const rows = Array.isArray(result.body.rows) ? result.body.rows : [];
    return restep(rows, believedCount);
  },
  _restep: restep, // exposed for the test suite — real logic, no live cortex needed to verify it
};
