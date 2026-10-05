'use strict';
/**
 * tests/modules/test-ollama-check.test.js — CT4 (docs/2026-10-05-code-tab-and-one-router-phasemap.spec), 0.39.350.
 * James: "make sure ollama is all wired into idearium."
 *
 *   OC-01  lib/ollama-check routes(): each caller's first hop, its Ollama hops, and what is not wired — no Ollama in the
 *          route, a hop that names no model, a model not installed, no route from copilot
 *   OC-02  ask(): an answer is ok with its time and text; an error, an empty reply and no copilot are failures, said
 *   OC-03  GET /api/ollama/check through idearium's real router, a stand-in bridge (:3749) and a stand-in copilot: the
 *          installed models, eight callers, the uninstalled model named
 *   OC-04  POST /api/ollama/check/ask: through copilot's /api/prompt with backend ollama and the model; a failure said;
 *          no model is a 400
 *   OC-05  the bridge down: said, with the callers still checked; copilot down: every caller says it was not routed
 *   OC-1x  Settings → Models in Clear Glass (the REAL ollama-check.js, a stubbed api()): models and callers listed,
 *          "ask every model" asks one at a time and shows each answer or failure, a caller with no Ollama is marked
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const UI = path.join(ROOT, 'idearium', 'ui');
const OC = require(path.join(ROOT, 'lib/ollama-check.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const listen = (handler, port = 0) => new Promise((res) => { const s = http.createServer(handler); s.on('error', () => res(null)); s.listen(port, '127.0.0.1', () => res(s)); });
const jsonServer = (fn) => (q, s) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { s.setHeader('content-type', 'application/json'); const r = fn(q.url, b ? JSON.parse(b) : {}); s.statusCode = r.status || 200; s.end(JSON.stringify(r.body)); }); };

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-ui-'));
  const css = fs.readFileSync(path.join(UI, 'css', 'ollama-check.css'), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="ollama-check"></div>
<script>
  const CALLS = []; let INFLIGHT = 0, MAXINFLIGHT = 0; let BRIDGE_UP = true;
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  async function api(p, opts) {
    CALLS.push({ p, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p === '/api/ollama/check') return BRIDGE_UP
      ? { bridge: { ok: true, active: 'big:7b' }, models: ['small:3b', 'big:7b'], probe: 'Reply with the single word: ready', copilot: { ok: true },
          callers: [{ id: 'void', label: 'the void', kind: 'page:void', preferAgent: 'ollama', ok: true, answers: { provider: 'ollama:small:3b', backend: 'ollama', model: 'small:3b', why: 'learned' }, ollamaHops: [{ provider: 'ollama:small:3b', model: 'small:3b', installed: true }], problems: [] },
                    { id: 'build-code', label: 'the build: a code file', kind: 'build:file.js', preferAgent: 'chatgpt', ok: true, answers: { provider: 'chatgpt', backend: 'guardian', model: null }, ollamaHops: [], problems: ['Ollama is not in its route (chatgpt → gemini)'] }] }
      : { bridge: { ok: false, error: 'ollama bridge unreachable: ECONNREFUSED' }, models: [], probe: 'x', copilot: { ok: true }, callers: [] };
    if (p === '/api/ollama/check/ask') {
      INFLIGHT++; MAXINFLIGHT = Math.max(MAXINFLIGHT, INFLIGHT);
      await new Promise(r => setTimeout(r, 40)); INFLIGHT--;
      const m = JSON.parse(opts.body).model;
      return m === 'big:7b' ? { ok: true, model: m, ms: 1300, text: 'ready' } : { ok: false, model: m, ms: 90000, error: 'the reply was truncated' };
    }
    return {};
  }
</script>
<script src="${pathToFileURL(path.join(UI, 'js', 'ollama-check.js')).href}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

(async () => {
  await test('OC-01', 'routes(): first hop, Ollama hops, and what is not wired', async () => {
    const table = {
      'page:void': { ok: true, route: [{ provider: 'ollama:small:3b', backend: 'ollama', model: 'small:3b', why: 'chain' }, { provider: 'ollama:gone:1b', backend: 'ollama', model: 'gone:1b' }] },
      'page:workshop': { ok: true, route: [{ provider: 'chatgpt', backend: 'guardian', agent: 'chatgpt' }] },
      'page:architect': { ok: true, route: [{ provider: 'ollama', backend: 'ollama', model: null }] },
    };
    const seen = [];
    const r = await OC.routes({ installed: ['small:3b'], defaultProvider: 'ollama', route: async (kind, prefer) => { seen.push([kind, prefer]); return table[kind] || { ok: false, error: 'copilot unreachable' }; } });
    assert.strictEqual(r.length, OC.CALLERS.length);
    const by = Object.fromEntries(r.map(c => [c.id, c]));
    assert.strictEqual(by.void.answers.provider, 'ollama:small:3b');
    assert.deepStrictEqual(by.void.problems, ['gone:1b is not installed']);
    assert.deepStrictEqual(by.void.ollamaHops.map(h => h.installed), [true, false]);
    assert.ok(/Ollama is not in its route \(chatgpt\)/.test(by.workshop.problems[0]));
    assert.ok(/names no model/.test(by.architect.problems[0]));
    assert.strictEqual(by.deliver.ok, false); assert.ok(/not route it/.test(by.deliver.problems[0]));
    assert.deepStrictEqual(seen.find(s => s[0] === 'agent:chat'), ['agent:chat', null], 'the copilot position prefers nothing');
    assert.ok(seen.some(s => s[0] === 'agent:chat' && s[1] === 'ollama'), 'and the agent set to Ollama with no model');
    assert.deepStrictEqual(seen.find(s => s[0] === 'page:void'), ['page:void', 'ollama'], 'pages prefer the default provider');
  });

  await test('OC-02', 'ask(): ok with time and text; an error, an empty reply, no copilot — failures, said', async () => {
    let sent = null;
    const a = await OC.ask({ model: 'big:7b', post: async (p) => { sent = p; return { status: 200, json: { ok: true, text: ' ready ' } }; } });
    assert.deepStrictEqual([a.ok, a.text, a.model], [true, 'ready', 'big:7b']);
    assert.deepStrictEqual([sent.backend, sent.model, sent.prompt], ['ollama', 'big:7b', OC.PROBE]);
    const b = await OC.ask({ model: 'x', post: async () => ({ status: 200, json: { ok: false, error: 'model "x" not found' } }) });
    assert.deepStrictEqual([b.ok, b.error], [false, 'model "x" not found']);
    const c = await OC.ask({ model: 'x', post: async () => ({ status: 200, json: { ok: true, text: '' } }) });
    assert.strictEqual(c.ok, false); assert.ok(/no text/.test(c.error));
    const d = await OC.ask({ model: 'x', post: async () => ({ status: 0, json: {} }) });
    assert.deepStrictEqual([d.ok, d.error], [false, 'copilot did not answer']);
    assert.strictEqual((await OC.ask({ post: async () => ({}) })).error, 'model is required');
  });

  // ── through idearium's real router ──
  const MD = require(path.join(ROOT, 'lib/model-door.js'));
  const resolve = (p) => (p === 'ollama' ? { backend: 'ollama', agent: null } : { backend: 'guardian', agent: p });
  const prompts = [];
  let copilot = await listen(jsonServer((url, body) => {
    if (url === '/api/route') return { body: MD.route({ ...body, records: [] }, { resolve }) };
    if (url === '/api/prompt') { prompts.push(body); return { body: body.model === 'big:7b' ? { ok: true, text: 'ready' } : { ok: false, error: 'the reply was truncated mid_sentence' } }; }
    return { status: 404, body: {} };
  }));
  const bridge = await listen(jsonServer((url) => (url === '/api/models' ? { body: { ok: true, models: ['small:3b', 'big:7b'], active: 'big:7b' } } : { status: 404, body: {} })), 3749);
  process.env.COPILOT_URL = `http://127.0.0.1:${copilot.address().port}`;
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const { setConfig } = await import(path.join(ROOT, 'idearium/lib/config.js'));
  await quiet(async () => { setConfig('routing.mode', 'learned'); setConfig('routing.chain', 'ollama,gemini'); setConfig('routing.ollama_models', 'small:3b,big:7b,gone:1b'); setConfig('repos.default_provider', 'ollama'); });

  if (!bridge) { console.log('  - OC-03 SKIPPED: port 3749 is in use (a real ollama bridge?) — not asserting against it'); skipped++; }
  else await test('OC-03', 'GET /api/ollama/check: the installed models, eight callers, the uninstalled model named', async () => {
    const r = await api._route('GET', '/api/ollama/check');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual([r.json.bridge.ok, r.json.models, r.json.bridge.active], [true, ['small:3b', 'big:7b'], 'big:7b']);
    assert.strictEqual(r.json.callers.length, 8); assert.strictEqual(r.json.copilot.ok, true);
    const v = r.json.callers.find(c => c.id === 'void');
    assert.strictEqual(v.answers.provider, 'ollama:small:3b');
    assert.ok(v.problems.includes('gone:1b is not installed'), JSON.stringify(v.problems));
    assert.ok(r.json.callers.every(c => c.ollamaHops.length), 'with Ollama in the chain every caller reaches it');
  });

  await test('OC-04', 'POST /api/ollama/check/ask: through copilot with backend ollama and the model; a failure said', async () => {
    const a = await api._route('POST', '/api/ollama/check/ask', { model: 'big:7b' });
    assert.deepStrictEqual([a.json.ok, a.json.text], [true, 'ready']);
    assert.deepStrictEqual([prompts[prompts.length - 1].backend, prompts[prompts.length - 1].model], ['ollama', 'big:7b']);
    const b = await api._route('POST', '/api/ollama/check/ask', { model: 'small:3b' });
    assert.strictEqual(b.json.ok, false); assert.ok(/truncated/.test(b.json.error));
    assert.strictEqual((await api._route('POST', '/api/ollama/check/ask', {})).status, 400);
  });

  await test('OC-05', 'the bridge down: said, the callers still checked; copilot down: no caller routed', async () => {
    if (bridge) await new Promise(r => bridge.close(r));
    const r = await api._route('GET', '/api/ollama/check');
    assert.strictEqual(r.json.bridge.ok, false); assert.ok(r.json.bridge.error, 'a reason');
    assert.deepStrictEqual(r.json.models, []);
    assert.strictEqual(r.json.callers.length, 8);
    await new Promise(x => copilot.close(x));
    const r2 = await api._route('GET', '/api/ollama/check');
    assert.strictEqual(r2.json.copilot.ok, false);
    assert.ok(r2.json.callers.every(c => !c.ok && /not route it/.test(c.problems[0])));
  });

  // ── the page in Clear Glass ──
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - OC-10…OC-12 SKIPPED: Clear Glass has no engine here — the browser checks did not run'); skipped += 3; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - OC-10…OC-12 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 3; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => renderOllamaCheck(document.getElementById('ollama-check')));
    await page.waitForSelector('tr[data-model]');

    await test('OC-10', 'models and callers listed; a caller with no Ollama is marked', async () => {
      assert.deepStrictEqual(await page.$$eval('tr[data-model]', e => e.map(x => x.dataset.model)), ['small:3b', 'big:7b']);
      assert.ok(/reached/.test(await page.textContent('.ds-mono')));
      const rows = await page.$$eval('tr[data-caller]', e => e.map(x => [x.dataset.caller, x.className.includes('oc-row-warn'), x.textContent]));
      assert.deepStrictEqual(rows.map(r => r.slice(0, 2)), [['void', false], ['build-code', true]]);
      assert.ok(/Ollama is not in its route/.test(rows[1][2]) && /wired/.test(rows[0][2]));
    });

    await test('OC-11', '"ask every model" asks one at a time and shows each answer or failure', async () => {
      await page.click('button:has-text("ask every model")');
      await page.waitForFunction(() => !OCHK.running);
      assert.strictEqual(await page.evaluate(() => MAXINFLIGHT), 1, 'never two at once');
      assert.ok(/failed.*truncated/.test(await page.textContent('tr[data-model="small:3b"]')));
      assert.ok(/answered in 1\.3s.*ready/.test(await page.textContent('tr[data-model="big:7b"]')));
      assert.ok(/1 of 2 asked answered/.test(await page.textContent('#ollama-check')));
    });

    await test('OC-12', 'a bridge not reached is said, not a blank; nothing threw', async () => {
      await page.evaluate(() => { BRIDGE_UP = false; return renderOllamaCheck(); });
      await page.waitForFunction(() => /not reached/.test(document.getElementById('ollama-check').textContent));
      const t = await page.textContent('#ollama-check');
      assert.ok(/ECONNREFUSED/.test(t) && /the bridge was not reached/.test(t), t);
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
