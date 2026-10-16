'use strict';
// JB-01..06 (0.60.85): the new ready-made jobs validate and RUN on the real automation engine with the network stubbed (GitHub, Ollama, Guardian, Clear Glass): they notify when they should and stay quiet when they should.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
const { AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR } = require(path.join(ROOT, 'clear-glass/src/mesh/automation-engine.js'));
const { TEMPLATES } = require(path.join(ROOT, 'clear-glass/src/automation/templates.js'));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); failed++; } }
const IDS = ['nexus-release', 'ollama-models', 'guardian-errors', 'chat-crawl-start', 'chat-crawl-report'];
const tpl = (id) => TEMPLATES.find(t => t.id === id);
const real = global.fetch;
function stub(map) { global.fetch = async (url, o = {}) => { const hit = Object.entries(map).find(([k]) => String(url).includes(k)); if (!hit) throw new Error('unreachable: ' + url); const v = typeof hit[1] === 'function' ? hit[1](url, o) : hit[1]; if (v instanceof Error) throw v; const body = JSON.stringify(v.body); return { ok: v.status ? v.status < 400 : true, status: v.status || 200, headers: { get: () => 'application/json' }, text: async () => body }; }; }
function rig(id, tweak) {
  for (const d of [WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  const notes = []; const e = new AutomationEngine({}); e.setHooks({ notifyFn: (n) => notes.push(n), browserFn: async () => ({}) });
  const t = tpl(id); const steps = t.steps.map(s => s.type === 'delay' ? { ...s, config: { ...s.config, ms: 1, jitterMs: 0 } } : s);
  const wf = e.create({ name: t.name, steps, vars: { ...(t.vars || {}), ...(tweak || {}) } }).workflow; return { e, wf, notes, run: () => e.run(wf.id, 'manual') };
}
(async () => {
  await test('JB-01 each new job is in the catalogue, validates, and uses only variables it declares', () => {
    for (const id of IDS) { const t = tpl(id); assert.ok(t, id + ' missing'); const r = rig(id); assert.deepStrictEqual(r.e.validate(r.wf.id).problems, [], id);
      const used = [...JSON.stringify(t.steps).matchAll(/vars\.(\w+)/g)].map(m => m[1]); assert.deepStrictEqual(used.filter(k => !(k in (t.vars || {}))), [], id + ' undeclared var'); }
  });
  await test('JB-02 new Nexus release: the first run only remembers; a changed tag notifies with it', async () => {
    const r = rig('nexus-release'); stub({ 'api.github.com': { body: { tag_name: 'v0.60.64', html_url: 'https://github.com/x/releases/v0.60.64' } } });
    assert.strictEqual((await r.run()).ok, true); assert.strictEqual(r.notes.length, 0, 'first run must not notify');
    assert.strictEqual((await r.run()).ok, true); assert.strictEqual(r.notes.length, 0, 'same tag: quiet');
    stub({ 'api.github.com': { body: { tag_name: 'v0.60.65', html_url: 'https://github.com/x/releases/v0.60.65' } } }); await r.run();
    assert.strictEqual(r.notes.length, 1); assert.match(r.notes[0].title, /v0\.60\.65/); assert.match(r.notes[0].body, /releases/);
  });
  await test('JB-03 Ollama: quiet when the model is there, says which model is missing, says when Ollama is down', async () => {
    const r = rig('ollama-models'); stub({ '/api/tags': { body: { models: [{ name: 'nomic-embed-text:latest' }, { name: 'qwen2.5-coder:7b' }] } } }); await r.run(); assert.strictEqual(r.notes.length, 0);
    stub({ '/api/tags': { body: { models: [{ name: 'qwen2.5-coder:7b' }] } } }); await r.run(); assert.strictEqual(r.notes.length, 1); assert.match(r.notes[0].title, /missing nomic-embed-text/); assert.match(r.notes[0].body, /ollama pull/);
    stub({ '/api/tags': new Error('connect ECONNREFUSED') }); await r.run(); assert.strictEqual(r.notes.length, 2); assert.match(r.notes[1].title, /not answering/);
  });
  await test('JB-04 Guardian failures: quiet at the limit, notifies above it with the count', async () => {
    const jobs = (n) => ({ body: { ok: true, jobs: Array.from({ length: n }, (_, i) => ({ id: 'j' + i, status: 'error', error: 'did nothing with it' })) } });
    const r = rig('guardian-errors', { max: '5' }); stub({ '/jobs': jobs(3) }); await r.run(); assert.strictEqual(r.notes.length, 0);
    stub({ '/jobs': jobs(8) }); await r.run(); assert.strictEqual(r.notes.length, 1); assert.match(r.notes[0].title, /8 Guardian jobs/); assert.match(r.notes[0].body, /did nothing with it/);
  });
  await test('JB-05 chat capture start: silent when it starts, says why when it does not', async () => {
    const r = rig('chat-crawl-start', { account: 'chatgpt:a1' }); let sent = null;
    stub({ '/cli/chats/crawl/start': (u, o) => { sent = JSON.parse(o.body); return { body: { ok: true, started: 'chatgpt:a1' } }; } }); await r.run(); assert.deepStrictEqual(sent, { account: 'chatgpt:a1' }); assert.strictEqual(r.notes.length, 0);
    stub({ '/cli/chats/crawl/start': { body: { ok: false, error: 'capture is off for this account' } } }); await r.run(); assert.strictEqual(r.notes.length, 1); assert.match(r.notes[0].body, /capture is off/);
  });
  await test('JB-06 chat capture report: reads status and notifies with it; changes nothing (a GET)', async () => {
    const r = rig('chat-crawl-report'); let method = null; stub({ '/cli/chats/crawl/status': (u, o) => { method = o.method; return { body: { ok: true, accounts: [{ account: 'chatgpt:a1', phase: 'backfill' }] } }; } });
    await r.run(); assert.strictEqual(method, 'GET'); assert.strictEqual(r.notes.length, 1); assert.match(r.notes[0].body, /chatgpt:a1/);
  });
  global.fetch = real; console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
