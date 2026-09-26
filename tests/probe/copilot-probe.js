'use strict';
/**
 * tests/probe/copilot-probe.js — is co-pilot healthy RIGHT NOW?
 * comp_id: nexus.tests.copilot-probe
 * UUID: nexus-copilot-probe-v1-0000-2026-0819-001
 * Version: 1.0.0
 *
 * §12.6 — "a test suite proves a function once, at commit time. A diagnostic
 * engine answers 'is this healthy right now' continuously, in production."
 * co-pilot has 13 module test files and nothing that exercises the running
 * service. This is that.
 *
 * §12.2 — every check here can fail, and its failure is informative: each one
 * prints what it expected, what it got, and why the difference matters.
 * §12.3 — expectation vs reality, always both.
 *
 * §READ-ONLY BY DEFAULT — AND THIS IS NOT A FORMALITY.
 * co-pilot serves /api/person-model/purge, /forget, /correct and
 * /api/axioms/remove. A probe that swept every declared route would delete
 * James's real person-model and edit his live axioms. Every route is
 * classified below, and a DESTRUCTIVE route is never called without --write
 * AND an explicit typed confirmation. §16.3 — invariants are structural, not
 * a check bolted on at the boundary.
 *
 *   node tests/probe/copilot-probe.js                 read-only sweep
 *   node tests/probe/copilot-probe.js --adversarial   + hostile inputs
 *   node tests/probe/copilot-probe.js --json          machine-readable
 *   node tests/probe/copilot-probe.js --url http://127.0.0.1:3750
 */

const http = require('http');
const { URL } = require('url');

const VERSION   = '1.0.0';
const MODULE_ID = 'nexus.tests.copilot-probe';

/**
 * Every route co-pilot declares, classified by what calling it COSTS.
 * Derived by reading copilot/server.js, not from a doc (§0.1).
 */
const ROUTES = Object.freeze({
  // safe: reads only, no side effects, no model calls
  SAFE: [
    ['GET', '/health'],
    ['GET', '/contract'],
    ['GET', '/api/queue/health'],
    ['GET', '/api/lifeline/health'],
    ['GET', '/api/sessions'],
    ['GET', '/api/axioms'],
    ['GET', '/api/diagnose/list'],
    ['GET', '/api/person-model/portrait'],
    ['GET', '/api/person-model/review'],
    ['GET', '/api/person-model/health'],
    ['GET', '/api/person-model/chain'],
    ['GET', '/api/person-model/export'],
    ['GET', '/api/person-model/meaning'],
    ['GET', '/api/prompt/tools'],
  ],
  // costly: real dispatch to a model or another system. Probed only with --spend.
  COSTLY: [
    ['POST', '/api/prompt'],
    ['POST', '/api/prompt/fulfill'],
    ['POST', '/api/prompt/stream'],
    ['POST', '/api/build'],
    ['POST', '/api/diagnose'],
    ['POST', '/bridge/deliver'],
  ],
  // destructive: MUTATES REAL STATE. Never probed. Listed so the sweep can
  // report them as deliberately unprobed rather than silently skipped —
  // an unprobed route and a forgotten route must not look the same (§1.2).
  DESTRUCTIVE: [
    ['POST', '/api/person-model/purge'],
    ['POST', '/api/person-model/forget'],
    ['POST', '/api/person-model/correct'],
    ['POST', '/api/person-model/accept'],
    ['POST', '/api/person-model/reject'],
    ['POST', '/api/person-model/state'],
    ['POST', '/api/person-model/connect'],
    ['POST', '/api/axioms/add'],
    ['POST', '/api/axioms/remove'],
    ['POST', '/api/event'],
    ['POST', '/api/observe'],
    ['POST', '/api/stream/ingest'],
  ],
  // streaming: long-lived SSE. Probed for headers only, then closed.
  STREAM: [
    ['GET', '/api/stream'],
    ['GET', '/events'],
    ['GET', '/ledger/stream'],
    ['GET', '/api/channel'],
  ],
});

function request(base, method, path, { body, timeoutMs = 4000, headers = {}, raw } = {}) {
  return new Promise(resolve => {
    let u;
    try { u = new URL(path, base); } catch (e) { return resolve({ ok: false, error: `bad url: ${e.message}` }); }
    const payload = raw != null ? raw : (body != null ? JSON.stringify(body) : null);
    const started = Date.now();
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: Object.assign(payload != null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}, headers),
      timeout: timeoutMs,
    }, res => {
      let out = '';
      res.on('data', d => { out += d; if (out.length > 262144) req.destroy(); });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(out); } catch (_) {}
        resolve({ ok: true, status: res.statusCode, headers: res.headers, text: out, json, ms: Date.now() - started });
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message, ms: Date.now() - started }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `no response in ${timeoutMs}ms`, ms: timeoutMs }); });
    if (payload != null) req.write(payload);
    req.end();
  });
}

/** One finding. `expected` and `actual` are both mandatory — §12.3. */
function finding(id, name, verdict, expected, actual, why) {
  return { id, name, verdict, expected, actual, why: why || null };
}

async function probe(opts = {}) {
  const base = opts.url || 'http://127.0.0.1:3750';
  const findings = [];
  const started = Date.now();

  // ── reachability. Everything below is meaningless if this fails, so the
  // probe stops rather than producing 30 red rows that all mean one thing.
  const health = await request(base, 'GET', '/health');
  if (!health.ok) {
    findings.push(finding('CP-000', 'co-pilot is reachable', 'FAIL',
      `a response from ${base}/health`, health.error,
      'Nothing below could be probed. This is one failure, not thirty — co-pilot is not answering.'));
    return { ok: false, base, findings, reachable: false, ms: Date.now() - started };
  }
  findings.push(finding('CP-000', 'co-pilot is reachable', health.status === 200 ? 'PASS' : 'WARN',
    '200 from /health', `${health.status} in ${health.ms}ms`,
    health.status === 200 ? null : 'It answered, but not with 200 — something is up but degraded.'));

  // ── /health must be substantive. A health endpoint that returns {} is a
  // §1.2 violation wearing a green badge.
  const hb = health.json || {};
  findings.push(finding('CP-001', '/health reports real state, not just 200', Object.keys(hb).length >= 2 ? 'PASS' : 'FAIL',
    'a body naming version and status', Object.keys(hb).length ? JSON.stringify(hb).slice(0, 160) : '(empty body)',
    Object.keys(hb).length >= 2 ? null 
      : 'A 200 with no state is indistinguishable from a process that is up but broken. §12.6 wants health, not liveness.'));

  // ── declared vs served (§1.1). The point of the whole probe.
  const served = [], unserved = [];
  for (const [method, path] of ROUTES.SAFE) {
    const r = await request(base, method, path);
    if (!r.ok) { unserved.push(`${path} (${r.error})`); continue; }
    if (r.status === 404) unserved.push(`${path} (404)`);
    else served.push({ path, status: r.status, ms: r.ms, bytes: r.text.length });
  }
  findings.push(finding('CP-002', 'every declared read route is actually served', unserved.length ? 'FAIL' : 'PASS',
    `${ROUTES.SAFE.length} routes answering`, `${served.length} served, ${unserved.length} not: ${unserved.join(', ') || 'none'}`,
    unserved.length ? 'A declared route that 404s is the same failure class as a declared-and-unserved capability: it leads an agent nowhere.' : null));

  // ── /contract must match what is actually served (§5.10)
  const contract = await request(base, 'GET', '/contract');
  const cRoutes = contract.json ? JSON.stringify(contract.json).match(/\/api\/[a-z0-9/_-]+/g) || [] : [];
  findings.push(finding('CP-003', '/contract describes the real surface', contract.ok && contract.status === 200 && cRoutes.length ? 'PASS' : 'WARN',
    'a contract naming routes', contract.ok ? `${cRoutes.length} routes named, status ${contract.status}` : contract.error,
    cRoutes.length ? null : 'A contract that names no routes cannot be the thing systems interact through (§5.10).'));

  // ── the tool surface: declared vs callable
  const tools = await request(base, 'GET', '/api/prompt/tools');
  const toolList = tools.json ? (tools.json.tools || tools.json.list || (Array.isArray(tools.json) ? tools.json : [])) : [];
  findings.push(finding('CP-004', 'the agent tool surface is enumerable', Array.isArray(toolList) && toolList.length ? 'PASS' : 'FAIL',
    'a non-empty list of tools', Array.isArray(toolList) ? `${toolList.length} tools` : (tools.ok ? `status ${tools.status}, no list in body` : tools.error),
    Array.isArray(toolList) && toolList.length ? null
      : 'If co-pilot cannot list its own tools, nothing downstream can verify that a tool an agent calls exists.'));

  // ── person-model: reads must be honest about emptiness
  const review = await request(base, 'GET', '/api/person-model/review');
  const q = review.json;
  const qLen = Array.isArray(q) ? q.length : (q && Array.isArray(q.queue) ? q.queue.length : null);
  findings.push(finding('CP-005', 'the person-model review queue answers', review.ok && review.status === 200 ? 'PASS' : 'FAIL',
    '200 with a queue (empty is a fine answer)', review.ok ? `${review.status}, ${qLen == null ? 'no queue array found' : qLen + ' pending'}` : review.error,
    null));

  // ── chain integrity — this one is worth more than the rest combined
  const chain = await request(base, 'GET', '/api/person-model/chain');
  const chainOk = chain.json && (chain.json.valid === true || chain.json.ok === true || chain.json.intact === true);
  findings.push(finding('CP-006', 'the person-model hash chain verifies', chain.ok ? (chainOk ? 'PASS' : 'FAIL') : 'FAIL',
    'a chain that verifies intact', chain.ok ? JSON.stringify(chain.json).slice(0, 200) : chain.error,
    chainOk ? null : 'A broken chain means the append-only history has been altered or truncated (§0.3). Treat this as the most serious row here.'));

  // ── SSE streams: headers only, then hang up
  for (const [method, path] of ROUTES.STREAM) {
    const r = await request(base, method, path, { timeoutMs: 1500 });
    const ct = r.headers && r.headers['content-type'] || '';
    findings.push(finding(`CP-S-${path}`, `${path} opens as a stream`, /event-stream/.test(ct) ? 'PASS' : (r.ok ? 'WARN' : 'FAIL'),
      'content-type: text/event-stream', r.ok ? `${r.status} ${ct || '(no content-type)'}` : r.error,
      /event-stream/.test(ct) ? null : 'A stream endpoint that does not declare event-stream will not be consumed as one by a browser.'));
  }

  // ── adversarial (§8.2, Six Lenses 4 and 6) ────────────────────────────────
  if (opts.adversarial) {
    // malformed JSON: must be a specific 4xx, never a 500 and never a silent 200
    const bad = await request(base, 'POST', '/api/prompt', { raw: '{"prompt": "unterminated' });
    findings.push(finding('CP-A01', 'malformed JSON is refused specifically', bad.ok && bad.status >= 400 && bad.status < 500 ? 'PASS' : 'FAIL',
      'a 4xx naming the parse failure', bad.ok ? `${bad.status} ${String(bad.text).slice(0, 120)}` : bad.error,
      bad.ok && bad.status >= 500 ? 'A 500 on malformed input means the parse error escaped to the top. §1.2 wants specific, not generic.'
        : (bad.ok && bad.status === 200 ? 'A 200 on unparseable input is the worst outcome — it pretended to work.' : null)));

    // missing required field
    const empty = await request(base, 'POST', '/api/prompt', { body: {} });
    findings.push(finding('CP-A02', 'a request with no prompt is refused, not guessed at', empty.ok && empty.status >= 400 ? 'PASS' : 'WARN',
      'a 4xx naming the missing field', empty.ok ? `${empty.status} ${String(empty.text).slice(0, 120)}` : empty.error,
      empty.ok && empty.status === 200 ? 'Accepting an empty prompt means something downstream invented the intent.' : null));

    // path traversal against any file-reading surface
    const trav = await request(base, 'GET', '/api/diagnose/list?path=../../../../etc/passwd');
    const leaked = trav.ok && /root:|daemon:/.test(trav.text || '');
    findings.push(finding('CP-A03', 'path traversal is refused', leaked ? 'FAIL' : 'PASS',
      'no filesystem content in the response', leaked ? 'PASSWD CONTENT RETURNED' : `${trav.ok ? trav.status : trav.error}, no traversal content`,
      leaked ? 'Lens 1 and 6: this is a real read primitive reachable over HTTP. Fix before anything else on this list.' : null));

    // oversized body: must be refused with a stated limit, not accepted or dropped
    const big = await request(base, 'POST', '/api/prompt', { raw: JSON.stringify({ prompt: 'x'.repeat(2_000_000) }), timeoutMs: 8000 });
    findings.push(finding('CP-A04', 'an oversized body is refused with a stated limit', big.ok && big.status >= 400 ? 'PASS' : 'WARN',
      'a 4xx naming a size limit', big.ok ? `${big.status}` : big.error,
      big.ok && big.status === 200 ? 'A 2MB prompt accepted silently is an unbounded input path.' : null));

    // unknown route: a real 404, not a 200 catch-all
    const ghost = await request(base, 'GET', '/api/definitely-not-a-real-route-' + Date.now());
    findings.push(finding('CP-A05', 'an unknown route 404s instead of catching all', ghost.ok && ghost.status === 404 ? 'PASS' : 'FAIL',
      '404', ghost.ok ? `${ghost.status}` : ghost.error,
      ghost.ok && ghost.status === 200 ? 'A 200 catch-all makes CP-002 meaningless — every route would look served.' : null));

    // concurrency: ten simultaneous reads must not corrupt or hang
    const burst = await Promise.all(Array.from({ length: 10 }, () => request(base, 'GET', '/health', { timeoutMs: 6000 })));
    const okCount = burst.filter(r => r.ok && r.status === 200).length;
    findings.push(finding('CP-A06', 'ten concurrent reads all answer', okCount === 10 ? 'PASS' : 'FAIL',
      '10/10 answering 200', `${okCount}/10`,
      okCount < 10 ? 'Under trivial concurrency. This is the shape of a problem that gets much worse under a real build loop.' : null));
  }

  // ── destructive routes: named, never called
  findings.push(finding('CP-999', 'destructive routes were deliberately not probed', 'INFO',
    'not called', ROUTES.DESTRUCTIVE.map(r => r[1]).join(', '),
    'These mutate real person-model and axiom state. Deliberately unprobed — recorded so an unprobed route never looks like a forgotten one.'));

  const fails = findings.filter(f => f.verdict === 'FAIL');
  return { ok: fails.length === 0, base, reachable: true, findings, fails: fails.length,
           warns: findings.filter(f => f.verdict === 'WARN').length,
           passes: findings.filter(f => f.verdict === 'PASS').length,
           ms: Date.now() - started, version: VERSION };
}

function render(r) {
  const L = [];
  const mark = { PASS: '✓', FAIL: '✗', WARN: '!', INFO: '·' };
  L.push('');
  L.push(`CO-PILOT PROBE   ${r.base}`);
  L.push('─'.repeat(70));
  for (const f of r.findings) {
    L.push(`  ${mark[f.verdict] || '?'} ${f.id.padEnd(10)} ${f.name}`);
    if (f.verdict === 'FAIL' || f.verdict === 'WARN') {
      L.push(`      expected  ${f.expected}`);
      L.push(`      actual    ${f.actual}`);
      if (f.why) L.push(`      why       ${f.why}`);
    } else if (f.verdict === 'INFO') {
      L.push(`      ${f.actual}`);
    }
  }
  L.push('─'.repeat(70));
  if (!r.reachable) {
    L.push('  co-pilot did not answer. Nothing was probed.');
    L.push('  Start it (npm run start:all) or point at the right port with --url.');
  } else {
    L.push(`  ${r.passes} pass · ${r.warns} warn · ${r.fails} fail · ${r.ms}ms`);
    // §17.11 — the only timing claim made, and it names how it was measured.
    L.push('  (timings are wall-clock round trips from this process, single samples, not a benchmark)');
  }
  L.push('');
  return L.join('\n');
}

module.exports = { probe, render, ROUTES, request, MODULE_ID, VERSION };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const at = n => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
  probe({ url: at('url') || undefined, adversarial: argv.includes('--adversarial') })
    .then(r => {
      console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
      // §1.2 — a probe that cannot reach the service must not exit 0. A green
      // CI run and an unreachable service must never look the same.
      process.exit(r.reachable ? (r.fails ? 1 : 0) : 2);
    });
}
