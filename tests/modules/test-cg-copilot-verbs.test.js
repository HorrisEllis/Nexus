'use strict';
/**
 * tests/modules/test-cg-copilot-verbs.test.js — 0.39.280 BS17. James: "i told it to visit google.com and it ran the blue
 * command but nothing happened." clear-glass/src/copilot/verbs.js (pure) and the REAL CoPilotBridge with a fake driver
 * and a fake copilot: "visit X" runs with no model; a loose block runs; an unreadable one is reported, never dropped.
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const V = require(path.join(ROOT, 'clear-glass/src/copilot/verbs.js'));
let passed = 0, failed = 0;
async function t(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); } }
const stubSettings = (port, values) => ({ get: () => values, copilotDirectUrl: (p) => `http://127.0.0.1:${port}${p}`, guardianDirectUrl: (p) => `http://127.0.0.1:1${p}`, ollamaDirectUrl: (p) => `http://127.0.0.1:1${p}` });
const listen = (h) => new Promise(res => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => res(s)); });
const jsonBody = (q) => new Promise(r => { let d = ''; q.on('data', c => d += c); q.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (_) { r({}); } }); });

(async () => {
  console.log('\n  test-cg-copilot-verbs.test.js');
  await t('CV-01', 'loose blocks a small model writes are repaired: bare keys, single quotes, trailing commas, a lone url, no scheme', () => {
    assert.deepStrictEqual(V.parseBlock('{action: "navigate", url: "google.com",}'), { action: 'navigate', url: 'https://google.com' });
    assert.deepStrictEqual(V.parseBlock("{'action': 'click', 'n': 3}"), { action: 'click', n: 3 });
    assert.deepStrictEqual(V.parseBlock('google.com'), { action: 'navigate', url: 'https://google.com' });
    assert.deepStrictEqual(V.parseBlock('Sure: {"action":"visit","url":"http://x.test"} done'), { action: 'navigate', url: 'http://x.test' });
    const bad = V.parseBlock('navigate there please');
    assert.ok(bad.__unreadable && /not a command the browser can read/.test(bad.error));
    assert.deepStrictEqual(V.parseCommands('a\n```driver\n{action:"getUrl"}\n```\nb\n```tool\n{"name":"x.tool","arguments":{}}\n```').map(c => c.action || c.name), ['getUrl', 'x.tool']);
  });
  await t('CV-02', '"visit google.com" is a browse intent; so is "open indeed.com and find remote jobs"; a question is not', () => {
    assert.deepStrictEqual(V.browseIntent('visit google.com'), { url: 'https://google.com', rest: '' });
    assert.deepStrictEqual(V.browseIntent('visit google.com what do you see'), { url: 'https://google.com', rest: 'what do you see' });
    assert.deepStrictEqual(V.browseIntent('Please open indeed.com and find remote jobs'), { url: 'https://indeed.com', rest: 'and find remote jobs' });
    assert.deepStrictEqual(V.browseIntent('go to https://www.upwork.com/nx/find-work/'), { url: 'https://www.upwork.com/nx/find-work/', rest: '' });
    assert.strictEqual(V.browseIntent('what do you know about me'), null);
    assert.strictEqual(V.browseIntent('open the settings'), null, 'not a site');
    assert.strictEqual(V.label('{action:"navigate",url:"google.com"}'), '[driver: navigate https://google.com]');
  });

  const CoPilotBridge = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
  const calls = [];
  const driver = { async exec(p) { calls.push(p);
    if (p.action === 'navigate') return { ok: true, url: p.url };
    if (p.action === 'getTitle') return { title: 'Google' };
    if (p.action === 'getUrl') return { url: 'https://www.google.com/' };
    if (p.action === 'field') return { targets: [{ n: 1, tag: 'textarea', name: 'Search', cx: 400, cy: 300, x: 300, y: 290, w: 200, h: 20, z: 0 }] };
    return { ok: true }; } };

  await t('CV-03', 'the bridge: "visit google.com" navigates with NO model and answers with what is on the page', async () => {
    let asked = 0;
    const cop = await listen(async (q, s) => { await jsonBody(q); asked++; s.end(JSON.stringify({ text: 'x' })); });
    const b = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: stubSettings(cop.address().port, { copilotRemember: false }) });
    b._driver = driver; b._liveToolsPrompt = async () => '';
    calls.length = 0;
    const r = await b.send({ message: 'visit google.com', agentId: 'w1', domContext: {} });
    assert.strictEqual(asked, 0, 'no model call');
    assert.deepStrictEqual(calls[0], { action: 'navigate', url: 'https://google.com', agentId: 'w1' });
    assert.match(r.text, /Opened "Google" — https:\/\/www\.google\.com\//);
    assert.match(r.text, /#1 textarea "Search"/);
    cop.close();
  });

  await t('CV-04', '"visit google.com where do i search": navigates, then the model is asked WITH the page', async () => {
    const prompts = [];
    const cop = await listen(async (q, s) => { const b = await jsonBody(q); prompts.push(b); s.end(JSON.stringify({ text: 'A search box.' })); });
    const b = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: stubSettings(cop.address().port, { copilotRemember: false }) });
    b._driver = driver; b._liveToolsPrompt = async () => '';
    const r = await b.send({ message: 'visit google.com where do i search', agentId: 'w1', domContext: {} });
    assert.strictEqual(r.text, 'A search box.');
    assert.match(prompts[0].prompt, /^where do i search\n\n\[you are on https:\/\/www\.google\.com\/ — "Google"/);
    cop.close();
  });

  await t('CV-05', 'a loose driver block from the model runs; an unreadable one comes back as a FAILED result, never silence', async () => {
    const prompts = [];
    const cop = await listen(async (q, s) => { const b = await jsonBody(q); prompts.push(b);
      s.end(JSON.stringify({ text: prompts.length === 1 ? 'ok\n```driver\n{action: "navigate", url: "indeed.com"}\n```\n```driver\nnavigate there\n```' : 'done' })); });
    const events = [];
    const b = new CoPilotBridge({ sse: { emit: (a, d) => events.push([a, d]) }, apiSettings: stubSettings(cop.address().port, { copilotRemember: false, copilotToolRounds: 2 }) });
    b._driver = driver; b._liveToolsPrompt = async () => '';
    calls.length = 0;
    const r = await b.send({ message: 'find me remote jobs', agentId: 'w1', domContext: {} });
    assert.deepStrictEqual(calls[0], { action: 'navigate', url: 'https://indeed.com', agentId: 'w1' });
    assert.ok(r.results.some(x => x.tool === 'driver' && x.ok === false && /not a command the browser can read/.test(x.error)));
    assert.match(prompts[1].prompt, /- driver: FAILED/);
    assert.ok(events.some(e => e[0] === 'copilot.tool.error' && e[1].action === 'driver'));
    cop.close();
  });

  await t('CV-06', 'the pane names the command a block carries', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.js'), 'utf8');
    assert.match(src, /function _driverLabel\(raw\)/);
    assert.doesNotMatch(src.match(/function formatReply[\s\S]*?\n  \}/)[0], /\[driver command sent\]/);
  });

  await t('CV-07', '§0.59.6 "what do you see" / "safeway.com its on the screen" / "visit google.com what do you see": the tab is read, the model is not asked', async () => {
    const prompts = [];
    const cop = await listen(async (q, s) => { prompts.push(await jsonBody(q)); s.end(JSON.stringify({ text: 'Could you please provide more details' })); });
    const b = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: stubSettings(cop.address().port, { copilotRemember: false }) });
    b._driver = driver; b._liveToolsPrompt = async () => '';
    for (const m of ['what do you see', 'safeway.com its on the screen', 'visit google.com what do you see']) {
      const r = await b.send({ message: m, agentId: 'w1', domContext: {} });
      assert.match(r.text, /Google/, m);
      assert.strictEqual(r.route.modelUsed, 'browser', m);
    }
    assert.strictEqual(prompts.length, 0, 'no model call');
    cop.close();
  });

  await t('CV-08', '§0.59.9 "ok go to google.com", "just go to x", "go to: x", localhost: the browse rule, not the model; prose still is not', () => {
    const V = require(path.join(ROOT, 'clear-glass/src/copilot/verbs.js'));
    for (const [m, u] of [['ok go to google.com', 'https://google.com'], ['hey, just go to bing.com', 'https://bing.com'], ['go to: google.com', 'https://google.com'],
      ['copilot, visit indeed.com', 'https://indeed.com'], ['go to localhost:9000', 'http://localhost:9000'], ['open 127.0.0.1:4800/x', 'http://127.0.0.1:4800/x']]) {
      const r = V.browseIntent(m); assert.ok(r, m); assert.strictEqual(r.url, u, m);
    }
    for (const m of ['help me with jobs', 'i want to go to bed', 'go to the store and buy milk']) assert.strictEqual(V.browseIntent(m), null, m);
  });

  await t('CV-09', '§0.59.9 "nexus> census --limit 4" in the pane runs through Nexus and says "⌘ Nexus ran: …" — no model, again each time', async () => {
    const V = require(path.join(ROOT, 'clear-glass/src/copilot/verbs.js'));
    assert.deepStrictEqual(V.nexusIntent('nexus> census --limit 4'), { line: 'census --limit 4' });
    assert.deepStrictEqual(V.nexusIntent('/nexus status'), { line: 'status' });
    assert.strictEqual(V.nexusIntent('tell me about nexus'), null);
    const prompts = [], events = [];
    const cop = await listen(async (q, s) => { prompts.push(1); s.end(JSON.stringify({ text: 'model' })); });
    const b = new CoPilotBridge({ sse: { emit: (...e) => events.push(e) }, apiSettings: stubSettings(cop.address().port, { copilotRemember: false }) });
    b._liveToolsPrompt = async () => '';
    const heard = [];
    b._nexusRunner = { hear: async (id, text) => { heard.push([id, text]); return [{ line: text.replace('nexus> ', ''), result: { text: '1232 phases: 563 shelf' } }]; } };
    const r = await b.send({ message: 'nexus> census --limit 4', agentId: 'w1' });
    assert.strictEqual(r.text, '⌘ Nexus ran: census --limit 4\n1232 phases: 563 shelf');
    assert.strictEqual(r.route.modelUsed, 'nexus');
    await b.send({ message: 'nexus> census --limit 4', agentId: 'w1' });
    assert.strictEqual(heard.length, 2, 'the same line typed again runs again');
    assert.notStrictEqual(heard[0][0], heard[1][0]);
    assert.strictEqual(prompts.length, 0, 'no model call');
    assert.ok(events.some(e => e[0] === 'copilot.response' && e[1].modelUsed === 'nexus'));
    cop.close();
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
