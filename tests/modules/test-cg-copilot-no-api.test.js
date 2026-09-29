'use strict';
/**
 * tests/modules/test-cg-copilot-no-api.test.js — 0.39.274. James: "nexus settings are depreciated. fix it. copilot,
 * is either ollama or guardian. no api".
 *
 * The Clear Glass co-pilot pane (clear-glass/src/copilot/bridge.js) with copilot :3750 DOWN answers through Ollama or
 * a Guardian agent directly — never an external API — and when nothing answers it says what it tried.
 *
 *   NA-001  copilot down, route copilot → Ollama answers (ollama/ollama-runtime.js), model from the setting
 *   NA-002  copilot down, route guardian → Guardian answers (/command, then /jobs?id= until complete)
 *   NA-003  Ollama down too → Guardian is tried next; both down → a reply naming all three and why
 *   NA-004  "Route through NEXUS co-pilot" off → copilot is not called at all
 *   NA-005  a follow-up round (tool results) stays on the backend that answered
 *   NA-006  settings: the retired key fields are dropped on load and on set, never public; no api.anthropic.com in the pane
 */
require('../../lib/test-sandbox.js').ensure();
{ const _log = console.log, _warn = console.warn; const chatter = (a) => typeof a[0] === 'string' && /^\[[\w./ :-]+\]/.test(a[0]);
  console.log = (...a) => { if (!chatter(a)) _log(...a); }; console.warn = (...a) => { if (!chatter(a)) _warn(...a); }; }
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n      ${String(e.stack || e.message).split('\n').slice(0, 4).join('\n      ')}`); }
}
const listen = (h) => new Promise(r => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)); });
const body = (q) => new Promise(r => { let d = ''; q.on('data', c => d += c); q.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (_) { r({}); } }); });

async function main() {
  console.log('\ntest-cg-copilot-no-api\n');
  // a stub Ollama (the real /api/generate stream shape); OLLAMA_HOST is read when the runtime is first required
  const ollamaSeen = [];
  let ollamaUp = true;
  const ollama = await listen(async (q, s) => {
    const b = await body(q); ollamaSeen.push(b);
    if (!ollamaUp) { s.statusCode = 500; return s.end(JSON.stringify({ error: 'model not loaded' })); }
    s.write(JSON.stringify({ response: 'from ', done: false }) + '\n');
    s.end(JSON.stringify({ response: 'ollama', done: true }) + '\n');
  });
  process.env.OLLAMA_HOST = `127.0.0.1:${ollama.address().port}`;

  // a stub Guardian: /command → jobId, /jobs?id= → running once, then complete
  const guardianSeen = [];
  let polls = 0;
  const guardian = await listen(async (q, s) => {
    if (q.method === 'POST' && q.url === '/command') { guardianSeen.push(await body(q)); return s.end(JSON.stringify({ ok: true, jobId: 'job-1', status: 'pending', provider: 'claude' })); }
    if (q.url.startsWith('/jobs?id=job-1')) { polls++; return s.end(JSON.stringify({ ok: true, job: polls < 2 ? { id: 'job-1', status: 'dispatched' } : { id: 'job-1', status: 'complete', provider: 'claude', result: 'from guardian' } })); }
    s.statusCode = 404; s.end('{}');
  });

  const Bridge = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
  const settings = (values) => ({
    get: () => ({ copilotTimeoutMs: 8000, copilotToolRounds: 1, copilotDomContext: false, ...values }),
    copilotDirectUrl: (p) => `http://127.0.0.1:1${p}`,                               // copilot :3750 is DOWN
    guardianDirectUrl: (p) => `http://127.0.0.1:${values.guardianOff ? 1 : guardian.address().port}${p}`,
    ollamaDirectUrl: (p) => `http://127.0.0.1:1${p}`,
    cortexUrl: (p) => `http://127.0.0.1:1${p}`,
  });
  const make = (values = {}) => { const b = new Bridge({ sse: { emit: () => {} }, apiSettings: settings(values) }); b._liveToolsPrompt = async () => 'TOOLS'; return b; };

  await t('NA-001', 'copilot down, route copilot → Ollama answers directly, with the configured model and the Clear Glass context', async () => {
    const r = await make({ copilotBackend: 'copilot', copilotOllamaModel: 'qwen-test' }).send({ message: 'go to google.com', agentId: 'default', noDom: true });
    assert.strictEqual(r.text, 'from ollama');
    assert.strictEqual(r.route.modelUsed, 'ollama:qwen-test');
    const last = ollamaSeen[ollamaSeen.length - 1];
    assert.strictEqual(last.model, 'qwen-test'); assert.strictEqual(last.prompt, 'go to google.com');
    assert.match(last.system, /Clear Glass Browser Context/);
    assert.strictEqual(guardianSeen.length, 0, 'guardian was not needed');
  });
  await t('NA-002', 'copilot down, route guardian → the Guardian agent answers (/command, then /jobs?id= until complete)', async () => {
    const r = await make({ copilotBackend: 'guardian', copilotAgent: 'claude' }).send({ message: 'summarise this page', agentId: 'w1', noDom: true });
    assert.strictEqual(r.text, 'from guardian');
    assert.strictEqual(r.route.modelUsed, 'guardian:claude');
    assert.strictEqual(guardianSeen[0].provider, 'claude'); assert.strictEqual(guardianSeen[0].source, 'clear-glass-copilot');
    assert.match(guardianSeen[0].prompt, /summarise this page$/);
    assert.ok(polls >= 2);
  });
  await t('NA-003', 'Ollama down → Guardian next; both down → one reply that names all three and why, never an API', async () => {
    ollamaUp = false; polls = 0; guardianSeen.length = 0;
    const r = await make({ copilotBackend: 'ollama' }).send({ message: 'x', agentId: 'w2', noDom: true });
    assert.strictEqual(r.text, 'from guardian', r.text);
    const none = await make({ copilotBackend: 'ollama', guardianOff: true }).send({ message: 'x', agentId: 'w3', noDom: true });
    assert.match(none.text, /^Nothing answered\. Tried:/);
    assert.match(none.text, /copilot :3750/); assert.match(none.text, /ollama — /); assert.match(none.text, /guardian :7820 \(claude\)/);
    assert.doesNotMatch(none.text, /API key|NEXUS Settings/i);
    assert.strictEqual(none.route.modelUsed, 'none');
    ollamaUp = true;
  });
  await t('NA-004', '"Route through NEXUS co-pilot" off → straight to the backend, copilot never called', async () => {
    const b = make({ useCortex: false, copilotBackend: 'copilot' });
    let called = 0; const orig = b._callNexusCopilot.bind(b); b._callNexusCopilot = (...a) => { called++; return orig(...a); };
    const r = await b.send({ message: 'hi', agentId: 'w4', noDom: true });
    assert.strictEqual(called, 0); assert.strictEqual(r.text, 'from ollama');
  });
  await t('NA-005', 'a follow-up round with tool results stays on the backend that answered the first round', async () => {
    const b = make({ copilotBackend: 'copilot', copilotToolRounds: 1, copilotAutoRunCommands: true });
    b._driver = { exec: async () => ({ ok: true, url: 'https://x' }) };
    const before = ollamaSeen.length; guardianSeen.length = 0;
    // first answer carries a driver block → one follow-up round
    const origDirect = b._callOllamaDirect.bind(b); let n = 0;
    b._callOllamaDirect = async (o) => { n++; return n === 1 ? { text: '```driver\n{"action":"getUrl"}\n```', modelUsed: 'ollama:x' } : origDirect(o); };
    const r = await b.send({ message: 'where am i', agentId: 'w5', noDom: true });
    assert.strictEqual(n, 2, 'both rounds went to Ollama'); assert.strictEqual(guardianSeen.length, 0);
    assert.match(ollamaSeen[before].prompt, /^\[tool results\]/);
    assert.strictEqual(r.text, 'from ollama');
  });
  await t('NA-006', 'settings: the retired API-key fields are dropped on load and set and never public; no external API in the pane', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'), 'utf8');
    assert.doesNotMatch(src, /api\.anthropic\.com|x-api-key|fallbackApiKey/);
    const S = require(path.join(ROOT, 'clear-glass/src/api/settings.js'));
    const inst = new S();
    await inst.set({ fallbackApiKey: 'sk-test', fallbackModel: 'x', copilotOllamaModel: 'm1' });
    assert.ok(!('fallbackApiKey' in inst.get()) && !('fallbackModel' in inst.get()));
    assert.strictEqual(inst.get().copilotOllamaModel, 'm1');
    assert.ok(!('hasFallbackKey' in inst.getPublic()) && !('fallbackApiKey' in inst.getPublic()));
    const ui = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/settings/sections/copilot.js'), 'utf8');
    assert.doesNotMatch(ui, /sk-ant|Anthropic API key|fallbackApiKey/);
  });

  ollama.close(); guardian.close();
  console.log(`\n${failed ? '✗' : '✓'} cg-copilot-no-api: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
