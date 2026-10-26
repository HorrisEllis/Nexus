'use strict';
// §0.39.282 — route() persists through lib/chat-logger (NEXUS_DATA_ROOT): sandboxed, or it writes data/copilot/ for real.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const { EventEmitter } = require('events');

// Real in-memory fake for Node's http module — matches the exact call
// shapes lifeline.js's _get/_post use (http.request(opts,cb) and
// http.get(url,opts,cb)), routed by path so /providers and /command
// behave like the real Guardian endpoints this test targets.
let _providersResponse = { providers: { chatgpt: { connected: true }, claude: { connected: false } } };
let _commandResponse = { ok: true, result: 'chatgpt says hello' };
let _commandCalls = [];

function _fakeReq(path, method) {
  const req = new EventEmitter();
  req.write = (b) => { req._body = (req._body || '') + b; };
  req.end = () => {
    process.nextTick(() => {
      const res = new EventEmitter();
      let body = '';
      if (path === '/api/copilot/prompt') {
        body = JSON.stringify(_commandResponse);
      } else if (path === '/providers') {
        body = JSON.stringify(_providersResponse);
      } else {
        body = JSON.stringify({ ok: false, error: 'unknown path in test fake' });
      }
      req.emit('response', res);
      process.nextTick(() => { res.emit('data', body); res.emit('end'); });
    });
  };
  return req;
}

const fakeHttp = {
  request: (opts, cb) => {
    const req = _fakeReq(opts.path, opts.method);
    if (opts.path === '/api/copilot/prompt' && opts.method === 'POST') {
      _commandCalls.push({ ...opts, req });   // 0.60.253 LG1 — the body is read after the call (req._body)
    }
    req.on('response', cb); // http.request's real signature calls cb(res) directly, not via 'response' event on req in most usages, but lifeline.js's real code passes cb as the request callback:
    return req;
  },
  get: (url, opts, cb) => {
    const u = new URL(url);
    const req = _fakeReq(u.pathname, 'GET');
    req.on('response', cb);
    req.end();
    return req;
  },
};

require.cache[require.resolve('http')] = { id: 'http', filename: 'http', loaded: true, exports: fakeHttp };

const lifeline = require('../../copilot/lifeline.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

(async () => {
  await test('T-001', 'extractExplicitAgent detects "talk to chatgpt"', () => {
    assert.strictEqual(lifeline.extractExplicitAgent('I want to talk to chatgpt'), 'chatgpt');
  });

  await test('T-002', 'extractExplicitAgent detects "use claude"', () => {
    assert.strictEqual(lifeline.extractExplicitAgent('use claude for this one'), 'claude');
  });

  await test('T-003', 'extractExplicitAgent returns null for a normal question', () => {
    assert.strictEqual(lifeline.extractExplicitAgent('what is the capital of France'), null);
  });

  // §SUPERSEDED 2026-07-09 — T-004/T-005 originally asserted that
  // _tryGuardian posts to /command "not the dead /api/copilot/prompt".
  // That was correct on 07-07: the endpoint did not exist. It now does
  // (guardian/ask.js), and was proven end-to-end against a real Clear
  // Glass NCP provider (574ms, real text returned).
  //
  // Two empirical facts make /command the wrong target, verified against a
  // booted guardian rather than assumed:
  //   1. POST /command returns { ok, jobId, status, provider } — it never
  //      returns text. _tryGuardian reads `result || text`, so it would
  //      return null on every call: silently, forever.
  //   2. Worse, /command's raw path calls parseCommand(body.raw); the old
  //      payload omitted `raw`, so the request actually 500s with
  //      "Cannot read properties of null (reading 'command')".
  // The old test asserted only that _post was CALLED with '/command'. It
  // never checked the outcome — so it passed while the feature could not
  // work. These now assert the endpoint that returns real text.
  // §0.39.282 — guardian's GET /providers is a flat map of name → 'connected' | 'null' (lifeline.js §BUGFIX 2026-08-28);
  // the fake still answered {connected:true} objects, so every explicit dispatch looked not connected.
  await test('T-004', 'route() bypasses Ollama and dispatches straight to the named agent when connected', async () => {
    _providersResponse = { providers: { chatgpt: 'connected' } };
    _commandResponse = { ok: true, text: 'hello from chatgpt' };
    _commandCalls = [];
    const r = await lifeline.route('I want to talk to chatgpt about my code');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.provider_used, 'chatgpt');
    assert.strictEqual(r.explicit_agent_request, true);
    assert.strictEqual(_commandCalls.length, 1);
  });

  await test('T-005', '_tryGuardian posts to /api/copilot/prompt (now real, returns text) not /command (returns only a jobId)', async () => {
    _providersResponse = { providers: { claude: 'connected' } };
    _commandResponse = { ok: true, text: 'hi' };
    _commandCalls = [];
    await lifeline.route('talk to claude please');
    assert.strictEqual(_commandCalls.length, 1);
    assert.strictEqual(_commandCalls[0].path, '/api/copilot/prompt');
  });

  // §0.60.253 LG1 — the contract T-006 held (2026-07-09: "fail closed on evidence": never dispatch to a tab that is not connected) is
  // kept for a caller that asks for it (noOpenTab). Its premise changed: Clear Glass now starts provider tabs on first real use, so
  // "not connected" at the first ask is the normal state, not evidence nothing can answer. James, 2026-10-25: "its not hooked into
  // guardian. look at idearium". Without noOpenTab the dispatch goes out with openTab (CL1's door): the tab is asked for, the job waits.
  await test('T-006', 'noOpenTab: _tryGuardian does not dispatch when NCP reports not connected (the 2026-07-09 contract, on request)', async () => {
    _providersResponse = { providers: { chatgpt: 'null' } };
    _commandCalls = [];
    const r = await lifeline.route('talk to chatgpt', { requestId: 'test-not-connected', noOpenTab: true });
    assert.strictEqual(_commandCalls.length, 0, 'should never dispatch when not connected and noOpenTab is set');
    assert.ok(!r.ok || r.provider_used !== 'chatgpt', 'and never claims chatgpt answered');
  });
  await test('T-006b', 'not connected yet (lazy tabs): the dispatch asks guardian to open the tab, and no success is fabricated', async () => {
    _providersResponse = { providers: { chatgpt: 'null' } };
    _commandCalls = [];
    const r = await lifeline.route('talk to chatgpt', { requestId: 'test-open-tab' });
    assert.strictEqual(_commandCalls.length, 1, 'one dispatch, with openTab');
    assert.strictEqual(JSON.parse(_commandCalls[0].req._body || '{}').openTab, true);
    if (!(_commandResponse && _commandResponse.text)) assert.ok(!r.ok || r.provider_used !== 'chatgpt', 'no text from guardian is not an answer');
  });

  console.log(`\n  lifeline-fluid-routing: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
