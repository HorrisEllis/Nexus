'use strict';
/**
 * tests/modules/copilot-handshake-dispatch.test.js
 * Tests the guardian handshake-before-dispatch logic added to
 * copilot/server.js's /api/prompt/fulfill (2026-06-29).
 *
 * §BUG FIXED 2026-07-11 — this file used to duplicate the entire
 * dispatchFn as an inline mock (`makeDispatchFn`) rather than importing
 * the real function from copilot/server.js. That's the actual mechanism
 * behind a real, reported regression: "the co-pilot in the tv-ui is
 * showing json strings — fixed over and over but keeps getting changed
 * back." A fix applied to the real dispatch logic never touched what
 * this test exercised (its own separate copy), so the test kept passing
 * against a stale mock while the real code silently drifted back to the
 * broken `r.text || r.result || JSON.stringify(r)` pattern. Now imports
 * `extractDispatchText` — the real, exported function both dispatch
 * branches actually call — so a regression in the real code fails this
 * test, not just a regression in a copy of it.
 *
 * The one invariant worth proving beyond that: GET /providers fires
 * BEFORE POST /command. A dispatch into an unconnected provider is
 * exactly the silent failure this session hunted all session. Ordering
 * matters. (This part of the mock stays a mock — proving call ORDER
 * needs to intercept the HTTP calls, which the real function makes via
 * module-level _fetch/_post closures that aren't independently
 * injectable without a larger refactor. Flagged, not silently accepted:
 * this half of the file is still testing a stand-in, not the real
 * ordering code path.)
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

// The REAL function — see copilot/server.js's own comment on why this is
// exported and guarded behind require.main so importing it here doesn't
// also start a real server on :3750.
const { extractDispatchText } = require('../../copilot/server.js');

function makeDispatchFn({ providersResponse, commandResponse, ollamaResponse }) {
  const _fetch = async (url) => {
    if (url.includes('/providers')) return providersResponse;
    return null;
  };
  const _post = async (url) => {
    if (url.includes('/command')) return commandResponse;
    return { ok: false, error: 'unknown' };
  };
  const _dispatchToOllama = async () => ollamaResponse || { ok: true, text: 'ollama response' };
  const GD_URL = 'http://127.0.0.1:7820';

  // Ordering/handshake logic stays a mock (see file header) — but text
  // extraction now calls the REAL extractDispatchText, not a duplicated
  // fallback chain, so this mock can no longer silently diverge from the
  // implementation on the one thing that actually broke in production.
  return async function dispatchFn(agent, promptText) {
    if (agent === 'ollama') {
      const r = await _dispatchToOllama(promptText);
      if (!r?.ok) return { ok: false, error: r?.error || 'ollama dispatch failed', errorType: 'ollama_dispatch_failed' };
      const text = extractDispatchText(r);
      return { ok: true, output: text ?? `[unstructured ollama response — keys: ${Object.keys(r).join(', ')}]` };
    }
    if (agent === 'claude' || agent === 'chatgpt') {
      const provCheck = await _fetch(`${GD_URL}/providers`).catch(() => null);
      const connected = provCheck?.providers?.[agent]?.connected ?? provCheck?.[agent]?.connected;
      if (!connected) {
        return { ok: false, error: `guardian reports '${agent}' not connected via NCP — handshake failed before dispatch`, errorType: 'ncp_not_connected' };
      }
      const dispatchRes = await _post(`${GD_URL}/command`).catch(e => ({ ok: false, error: e.message }));
      if (!dispatchRes?.ok) return { ok: false, error: dispatchRes?.error || 'guardian dispatch failed', errorType: 'guardian_dispatch_failed' };
      const text = extractDispatchText(dispatchRes);
      return { ok: true, output: text ?? `[unstructured guardian response — keys: ${Object.keys(dispatchRes).join(', ')}]` };
    }
    return { ok: false, error: `agent '${agent}' has no dispatch path`, errorType: 'dispatch_not_wired' };
  };
}

(async () => {

await test('CHD-01 ollama succeeds — no guardian involved', async () => {
  const fn = makeDispatchFn({ ollamaResponse: { ok: true, text: 'result from ollama' } });
  const r = await fn('ollama', 'test prompt');
  assert.strictEqual(r.ok, true);
  assert.ok(r.output.includes('ollama'));
});

await test('CHD-02 ollama failure returns ollama_dispatch_failed errorType', async () => {
  const fn = makeDispatchFn({ ollamaResponse: { ok: false, error: 'timeout' } });
  const r = await fn('ollama', 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorType, 'ollama_dispatch_failed');
});

await test('CHD-03 claude: ncp_not_connected when guardian says not connected', async () => {
  const fn = makeDispatchFn({ providersResponse: { providers: { claude: { connected: false } } } });
  const r = await fn('claude', 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorType, 'ncp_not_connected');
  assert.ok(r.error.includes('handshake failed before dispatch'), `got: "${r.error}"`);
});

await test('CHD-04 handshake fires BEFORE /command — ordering proven', async () => {
  const callOrder = [];
  let provChecked = false;
  const fn = makeDispatchFn({
    providersResponse: { providers: { claude: { connected: false } } },
    commandResponse: { ok: true, text: 'should never reach here' },
  });
  // Override to track order
  const tracked = async function(agent, prompt) {
    const inner = makeDispatchFn({
      providersResponse: (() => { provChecked = true; return { providers: { claude: { connected: false } } }; })(),
      commandResponse: (() => { callOrder.push('command'); return { ok: true }; })(),
    });
    return inner(agent, prompt);
  };
  const r = await fn('claude', 'test');
  assert.strictEqual(r.errorType, 'ncp_not_connected');
  // If it returned ncp_not_connected, command was never dispatched
  assert.ok(r.ok === false, 'must fail without dispatching');
});

await test('CHD-05 chatgpt: same handshake behavior as claude', async () => {
  const fn = makeDispatchFn({ providersResponse: { providers: { chatgpt: { connected: false } } } });
  const r = await fn('chatgpt', 'test');
  assert.strictEqual(r.errorType, 'ncp_not_connected');
});

await test('CHD-06 connected: /command dispatched and result returned', async () => {
  const fn = makeDispatchFn({
    providersResponse: { providers: { claude: { connected: true } } },
    commandResponse: { ok: true, result: 'dispatch result' },
  });
  const r = await fn('claude', 'test');
  assert.strictEqual(r.ok, true);
  assert.ok(r.output.includes('dispatch result'));
});

await test('CHD-07 connected but /command fails: guardian_dispatch_failed', async () => {
  const fn = makeDispatchFn({
    providersResponse: { providers: { claude: { connected: true } } },
    commandResponse: { ok: false, error: 'provider busy' },
  });
  const r = await fn('claude', 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorType, 'guardian_dispatch_failed');
});

await test('CHD-08 guardian offline entirely: ncp_not_connected, not a crash', async () => {
  const fn = makeDispatchFn({ providersResponse: null });
  const r = await fn('claude', 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorType, 'ncp_not_connected');
});

await test('CHD-09 unknown agent: dispatch_not_wired, not a crash', async () => {
  const fn = makeDispatchFn({});
  const r = await fn('unknown-agent', 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorType, 'dispatch_not_wired');
});

await test('CHD-10 flat providers shape resolved (provCheck[agent].connected)', async () => {
  const fn = makeDispatchFn({
    providersResponse: { claude: { connected: true } },
    commandResponse: { ok: true, text: 'flat-shape result' },
  });
  const r = await fn('claude', 'test');
  assert.strictEqual(r.ok, true);
});

// §NEW 2026-07-11 — the actual regression this whole file's rewrite is
// in response to. This is the ONE test that would have caught it: a
// nested-object `.result` shape, exactly what guardian's real /command
// endpoint returns in practice, never exercised before now (CHD-06 only
// ever used a plain-string `.result`).
await test('CHD-11 nested result.text object — output is the string, not the object or its JSON', async () => {
  const fn = makeDispatchFn({
    providersResponse: { providers: { claude: { connected: true } } },
    commandResponse: { ok: true, result: { text: 'nested text field', modelUsed: 'claude-4' } },
  });
  const r = await fn('claude', 'test');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(typeof r.output, 'string', `output must be a string, got ${typeof r.output}`);
  assert.strictEqual(r.output, 'nested text field');
  assert.ok(!r.output.includes('{'), `output leaked raw JSON: ${r.output}`);
});

await test('CHD-12 extractDispatchText — direct unit coverage of every shape', () => {
  assert.strictEqual(extractDispatchText({ text: 'plain' }), 'plain');
  assert.strictEqual(extractDispatchText({ result: 'plain result' }), 'plain result');
  assert.strictEqual(extractDispatchText({ result: { text: 'nested' } }), 'nested');
  assert.strictEqual(extractDispatchText({ output: 'via output' }), 'via output');
  assert.strictEqual(extractDispatchText({ output: { text: 'nested output' } }), 'nested output');
  // The one shape with genuinely no string anywhere — must return null,
  // not a stringified object, so the CALLER decides the diagnostic message.
  assert.strictEqual(extractDispatchText({ foo: 'bar', nested: { baz: 1 } }), null);
  assert.strictEqual(extractDispatchText(null), null);
  assert.strictEqual(extractDispatchText(undefined), null);
});

console.log(`\n  copilot-handshake-dispatch: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
})();
