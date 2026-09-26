'use strict';
/**
 * lib/agent-tools/tools/query-intelligence.js — nexus_intelligence tool
 * UUID: nexus-agent-tools-query-intelligence-v1-0000-2026-0710-jamesbrooks-001
 *
 * §GAP CLOSED 2026-07-10 — "query and use the apis from all systems, event
 * ledgers, intelligence system, intuition, mastermind, cfr, rfr2, causal
 * graph, event ledgers, continuous event stream, and sse" was wired into
 * diagnose.js's "summary" action, but ONLY there — bundled into a full
 * per-system diagnosis. Copilot had no standalone way to ask a single
 * intelligence question (e.g. "what's the current CFR regime", "give me
 * intuition on X") without running an entire system summary to get it.
 * This is that direct access, one action per real surface, every one
 * verified against cortex/boot.js's actual route table first — same
 * endpoints _deepDiagnose() uses in service/nexus-diagnostic.js, just
 * exposed as their own callable actions instead of one bundled fan-out:
 *   events     → GET  /api/events?source=&limit=      (event ledger)
 *   status     → GET  /api/intelligence/status         (intelligence system)
 *   patterns   → GET  /api/intelligence/patterns?limit=
 *   rca        → GET  /api/intelligence/rca?limit=
 *   intuition  → GET  /api/intelligence/intuition?prompt=
 *   mastermind → POST /api/intelligence/mastermind     (causal analysis —
 *                reaches RFR2's causal toolkit internally via mastermind.js's
 *                existing lib/rfr2-bridge.js usage; no separate RFR2 action
 *                exists because RFR2 has no HTTP surface of its own)
 *   cfr        → GET  /cfr/health                      (CFR field state)
 *   lattice    → GET  /api/intelligence/lattice?about=        (associative/causal graph)
 *   stream     → live SSE liveness probe against a named system's own /sse
 *
 * §HONEST BOUNDARY — same as diagnose.js: reports what each endpoint
 * actually returns, an unreachable service is an error result per-action,
 * never a fabricated answer.
 */

const http = require('http');

const CORTEX_PORT = 3748;
// Intelligence is its own sovereign system (moved out of cortex 2026-09-19).
const INTEL_PORT  = parseInt(process.env.INTELLIGENCE_PORT || '3753', 10);
const ORCH_PORT   = parseInt(process.env.ORCHESTRATOR_PORT || '9000', 10); // CFR field authority

// Port registry for the `stream` action only — same static ports
// service/nexus-diagnostic.js's SYSTEMS registry uses. Duplicated here
// (not imported) because that file is a standalone service entrypoint,
// not a requirable module — this is the same tradeoff diagnose.js already
// makes going through the diagnostic service's own HTTP surface instead.
const SYSTEM_PORTS = {
  guardian: 7820, cortex: 3748, idearium: 4800, orchestrator: 9000,
  architect: 3747, bridge: 9999, emerge: 4242, diagnostic: 7825,
};

function _fetchJSON(url, { method = 'GET', body = null, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      timeout: timeoutMs,
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve({ error: `non-JSON response: ${d.slice(0, 150)}` }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

function _probeSSE(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false;
    const req = http.get(`http://127.0.0.1:${port}/sse`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { settled = true; req.destroy(); return resolve({ live: false, error: `status ${res.statusCode}` }); }
      let buf = '';
      res.on('data', (c) => {
        if (settled) return;
        buf += c;
        if (buf.includes('data:')) {
          settled = true; req.destroy();
          const frame = buf.split('data:')[1]?.split('\n')[0]?.trim().slice(0, 200);
          resolve({ live: true, sampleFrame: frame || null });
        }
      });
      res.on('end', () => { if (!settled) { settled = true; resolve({ live: false, error: 'stream closed before any frame' }); } });
    });
    req.on('error', (e) => { if (!settled) { settled = true; resolve({ live: false, error: e.message }); } });
    req.on('timeout', () => { if (!settled) { settled = true; req.destroy(); resolve({ live: false, error: 'no frame within timeout' }); } });
  });
}

const ACTIONS = {
  events:     (a) => _fetchJSON(`http://127.0.0.1:${CORTEX_PORT}/api/events?limit=${a.limit || 20}${a.system ? `&source=${encodeURIComponent(a.system)}` : ''}`),
  status:     ()  => _fetchJSON(`http://127.0.0.1:${INTEL_PORT}/api/intelligence/status`),
  patterns:   (a) => _fetchJSON(`http://127.0.0.1:${INTEL_PORT}/api/intelligence/patterns?limit=${a.limit || 5}`),
  // §BUILT 2026-07-12 — chunk_3 of docs/nexus-copilot-recall.spec, re-verified
  // rather than assumed. Deliberately NOT named "patterns" — that name is
  // already taken above by a genuinely different capability (crystallized
  // (domain,verb,outcome) execution triples from meta/crystal-lattice.js,
  // read via cortex's _buildPatterns()). This is mastermind's real,
  // separately-built recurring CAUSAL pattern detector (RFR2's delta
  // engine, exposed as its own route this session) — different data
  // source (event_log's causal graph, not the crystals table), different
  // method (fractal/self-similarity detection over causal chains, not
  // outcome tallying). Reusing the name "patterns" for both would be
  // exactly the kind of silent collision this codebase's own convention
  // treats as a hard error, not a shortcut.
  //
  // §HONEST SCOPE — chunk_3's original framing was "log patterns ACROSS
  // CONVERSATIONS." This operates on event_log (system events: retries,
  // gaps, dispatches), not specifically chat_log (conversation content/
  // topics). It answers "what causal sequences keep recurring in the
  // system" for real — it does not yet answer "what topics keep coming up
  // in conversation," which would need chat_log entries fed into a graph
  // with their own causal/topical edges, a separate, real, not-yet-built
  // piece. Not overclaimed here.
  causalPatterns: (a) => _fetchJSON(`http://127.0.0.1:${INTEL_PORT}/api/intelligence/mastermind/patterns`, {
    method: 'POST', body: { limit: a.limit || 300, minOccurrences: a.minOccurrences, minChainLen: a.minChainLen },
  }),
  rca:        (a) => _fetchJSON(`http://127.0.0.1:${INTEL_PORT}/api/intelligence/rca?limit=${a.limit || 5}`),
  intuition:  (a) => a.prompt
    ? _fetchJSON(`http://127.0.0.1:${INTEL_PORT}/api/intelligence/intuition?prompt=${encodeURIComponent(a.prompt)}`)
    : Promise.resolve({ error: 'intuition requires a prompt' }),
  mastermind: (a) => a.prompt
    ? _fetchJSON(`http://127.0.0.1:${INTEL_PORT}/api/intelligence/mastermind`, { method: 'POST', body: { prompt: a.prompt, context: a.context || '' } })
    : Promise.resolve({ error: 'mastermind requires a prompt' }),
  cfr:        ()  => _fetchJSON(`http://127.0.0.1:${ORCH_PORT}/cfr/field`),
  lattice:    (a) => a.system
    ? _fetchJSON(`http://127.0.0.1:${INTEL_PORT}/api/intelligence/lattice?about=${encodeURIComponent(a.system)}`)
    : Promise.resolve({ error: 'lattice requires a system (or subject) name' }),
  stream:     (a) => {
    const port = a.system ? SYSTEM_PORTS[a.system] : null;
    if (!port) return Promise.resolve({ error: `unknown system '${a.system}' — known: ${Object.keys(SYSTEM_PORTS).join(', ')}` });
    return _probeSSE(port);
  },
};

module.exports = {
  name: 'nexus_intelligence',
  description:
    `Query NEXUS's live intelligence and event surfaces directly, one real signal at a time — ` +
    `use this instead of a full diagnose "summary" when you only need one answer, not a whole system report. Actions: ` +
    `"events" (event ledger — optional system filter), ` +
    `"status" (intelligence system health snapshot), ` +
    `"patterns" (crystallized execution-outcome log — domain/verb/outcome triples), ` +
    `"causalPatterns" (recurring CAUSAL event-sequence detection over the live causal graph — different from "patterns"; requires enough recent event_log activity, degrades to patternsFound:0 honestly when there isn't), ` +
    `"rca" (root cause analysis entries), ` +
    `"intuition" (fast intuition answer — requires prompt), ` +
    `"mastermind" (causal analysis — requires prompt; reaches RFR2's causal toolkit internally), ` +
    `"cfr" (current CFR field: coherence/friction/entropy/regime), ` +
    `"lattice" (associative/causal graph neighbors for a subject — requires system), ` +
    `"stream" (live SSE liveness probe on a named system — requires system).`,
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string', enum: Object.keys(ACTIONS), description: 'Which intelligence surface to query' },
      system:  { type: 'string', description: 'System/subject name — used by "events" (filter), "lattice", "stream"' },
      prompt:  { type: 'string', description: 'Required for "intuition" and "mastermind"' },
      context: { type: 'string', description: 'Optional extra context for "mastermind"' },
      limit:   { type: 'number', description: 'Row limit for "events"/"patterns"/"causalPatterns"/"rca"' },
      minOccurrences: { type: 'number', description: 'Optional, for "causalPatterns" — minimum recurrence count to count as a pattern' },
      minChainLen:    { type: 'number', description: 'Optional, for "causalPatterns" — minimum causal chain length to consider' },
    },
    required: ['action'],
  },
  execute: async (args = {}) => {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action '${args.action}' — valid: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `nexus_intelligence ${args.action} failed: ${e.message}` }; }
  },
};
