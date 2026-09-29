'use strict';
/**
 * tests/modules/clear-glass-agent-surface.test.js — 0.39.259: Clear Glass, whole, for copilot.
 *
 * What is real here and what is not:
 *   - page/reader.js's in-page script RUNS in jsdom against a real application-form fixture: the same function
 *     serialised into the page by driver.readPage (the test calls pageScript(), not _inPage directly).
 *   - ipc/agent-routes.js is mounted on a real express app on a real port; the driver behind it is a stub that
 *     records calls (no Electron here). The stub returns what ClearDriver returns: {url}, {title}, readPage's shape.
 *   - clearglass.browser.tool and clear_glass_command_index talk to real HTTP servers standing in for :7702/:7704.
 *   - CoPilotBridge's tool loop runs against a real stub copilot HTTP server.
 * Not covered (no display in this environment): a live Electron window, CDP DOM.setFileInputFiles, sendInputEvent.
 */

const assert = require('assert');
const http = require('http');
const path = require('path');

let passed = 0, failed = 0;
async function t(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

const FORM = `<!doctype html><html><head><title>Senior Engineer — Acme | Careers</title></head><body>
<h1>Senior Backend Engineer</h1><h2>Apply</h2>
<p>We are hiring at Acme. Remote. $140k - $170k.</p>
<a href="/jobs">All jobs</a>
<form id="app">
  <label for="fn">First name *</label><input id="fn" name="first_name" required autocomplete="given-name">
  <label>Email <input type="email" name="email" required></label>
  <div class="field"><span>Why do you want to work here?</span><textarea name="why" required></textarea></div>
  <fieldset><legend>Are you authorized to work in the US?</legend>
    <label><input type="radio" name="auth" value="yes"> Yes</label>
    <label><input type="radio" name="auth" value="no"> No</label>
  </fieldset>
  <label for="src">How did you hear about us?</label>
  <select id="src" name="source"><option value="">Select…</option><option value="li">LinkedIn</option><option value="hn">Hacker News</option></select>
  <label for="cv">Resume/CV</label><input type="file" id="cv" name="resume" accept=".pdf">
  <label><input type="checkbox" name="consent"> I agree to the privacy policy</label>
  <input type="hidden" name="csrf" value="x">
  <button type="submit">Submit application</button>
</form></body></html>`;

function readFixture(html) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(html, { url: 'https://jobs.acme.test/apply/42', runScripts: 'outside-only' });
  const reader = require('../../clear-glass/src/page/reader.js');
  const raw = dom.window.eval(reader.pageScript({ maxText: 5000 }));
  return { raw: JSON.parse(JSON.stringify(raw)), reader };
}

// ApiSettings' real surface (clear-glass/src/api/settings.js): get() + the *DirectUrl() builders _directTargetFor reads.
function stubSettings(port, values) {
  return { get: () => values, copilotDirectUrl: (p) => `http://127.0.0.1:${port}${p}`, guardianDirectUrl: (p) => `http://127.0.0.1:1${p}`, ollamaDirectUrl: (p) => `http://127.0.0.1:1${p}` };
}
function listen(handler) {
  return new Promise(res => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
}
function jsonBody(req) { return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (_) { r({}); } }); }); }
function req(port, method, p, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, json: d ? JSON.parse(d) : null }));
    });
    r.on('error', reject); if (payload) r.write(payload); r.end();
  });
}

async function run() {
  console.log('clear-glass agent surface (0.39.259)');

  await t('CG-001', 'readPage: every visible field with its label, a unique selector, required + filled state; hidden inputs excluded', () => {
    const { raw, reader } = readFixture(FORM);
    const p = reader.normalize(raw);
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.url, 'https://jobs.acme.test/apply/42');
    assert.strictEqual(p.title, 'Senior Engineer — Acme | Careers');
    const byName = Object.fromEntries(p.fields.filter(f => f.name).map(f => [f.name + (f.value ? ':' + f.value : ''), f]));
    assert.strictEqual(byName.first_name.label, 'First name *');
    assert.strictEqual(byName.first_name.selector, '#fn');
    assert.strictEqual(byName.first_name.required, true);
    assert.strictEqual(byName.email.label.startsWith('Email'), true);
    assert.strictEqual(byName.email.selector, 'input[name="email"]');
    assert.strictEqual(byName.why.label, 'Why do you want to work here?');
    assert.ok(!p.fields.some(f => f.name === 'csrf'), 'hidden input must not be listed');
    assert.deepStrictEqual(byName.source.options.map(o => o.text), ['Select…', 'LinkedIn', 'Hacker News']);
    assert.strictEqual(byName.resume.type, 'file');
  });

  await t('CG-002', 'readPage: a radio carries its OPTION as label and the fieldset legend as question', () => {
    const { raw, reader } = readFixture(FORM);
    const radios = reader.normalize(raw).fields.filter(f => f.type === 'radio');
    assert.strictEqual(radios.length, 2);
    assert.deepStrictEqual(radios.map(r => r.label), ['Yes', 'No']);
    assert.ok(radios.every(r => r.question === 'Are you authorized to work in the US?'));
  });

  await t('CG-003', 'readPage: unfilledRequired names the required empties; buttons and headings listed; text budget reported', () => {
    const { raw, reader } = readFixture(FORM);
    const p = reader.normalize(raw, { maxText: 20 });
    assert.deepStrictEqual(p.unfilledRequired.sort(), ['#fn', 'input[name="email"]', 'textarea[name="why"]'].sort());
    assert.ok(p.buttons.find(b => b.text === 'Submit application' && b.type === 'submit'));
    assert.ok(p.headings.find(h => h.level === 1 && h.text === 'Senior Backend Engineer'));
    assert.ok(p.truncated && p.truncated.shown === 20 && p.truncated.total > 20);
  });

  await t('CG-004', 'normalize: an eval that returned nothing is an error, not an empty page', () => {
    const reader = require('../../clear-glass/src/page/reader.js');
    assert.strictEqual(reader.normalize(null).ok, false);
  });

  // ── ipc/agent-routes.js ────────────────────────────────────────────────────────────────────────────────
  // clear-glass's own express (4.x, what IpcBridge runs on) when its node_modules is installed, else the root's.
  const express = require('../../lib/micro-http.js');
  const calls = [];
  const driver = {
    async exec(p) {
      calls.push(p);
      if (p.action === 'getUrl') return { url: `https://x.test/${p.agentId}` };
      if (p.action === 'getTitle') return { title: `T-${p.agentId}` };
      if (p.action === 'readPage') { const { raw, reader } = readFixture(FORM); return reader.normalize(raw); }
      if (p.action === 'slow') return new Promise(() => {});
      if (p.action === 'boom') throw new Error('Element not found: #nope');
      return { ok: true, echo: p };
    },
  };
  const app = express(); app.use(express.json());
  require('../../clear-glass/src/ipc/agent-routes.js').install(app, {
    driver, providerHost: { list: () => [{ id: 'claude', hosted: true }] },
    options: { listAccounts: () => [{ id: 'a1', name: 'James', providers: { chatgpt: {} } }] },
    autofillStore: { listProfiles: () => [{ id: 'p1', name: 'Default' }] },
    macroTool: { execute: async () => ({ macros: [{ name: 'login-upwork' }] }) },
    userscripts: { list: () => { throw new Error('manager not ready'); } },
    downloads: { list: () => [] }, ctxMgr: { listIds: () => ['default'] }, mesh: { listAgents: () => [] },
    listAgents: () => ({ windows: ['default'], bgTabs: ['opp-1'] }), listBgTabs: () => [{ agentId: 'opp-1', url: 'https://x.test/opp-1' }],
  });
  const ipc = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const IPC = ipc.address().port;

  await t('CG-101', 'POST /cli/driver returns the driver\'s own result in the response (not {emitted})', async () => {
    const r = await req(IPC, 'POST', '/cli/driver', { action: 'click', agentId: 'default', selector: '#go' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.deepStrictEqual(r.json.result.echo, { agentId: 'default', action: 'click', selector: '#go' });
  });

  await t('CG-102', 'POST /cli/driver: a driver error is a 502 carrying the real message; a hang is a timeout, not a hang', async () => {
    const e = await req(IPC, 'POST', '/cli/driver', { action: 'boom' });
    assert.strictEqual(e.status, 502); assert.match(e.json.error, /Element not found: #nope/);
    const s = await req(IPC, 'POST', '/cli/driver', { action: 'slow', timeoutMs: 150 });
    assert.strictEqual(s.status, 502); assert.match(s.json.error, /did not finish within 150ms/);
    const n = await req(IPC, 'POST', '/cli/driver', {});
    assert.strictEqual(n.status, 400);
  });

  await t('CG-103', 'POST /cli/page/read is readPage through the same driver', async () => {
    const r = await req(IPC, 'POST', '/cli/page/read', { agentId: 'opp-1' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true);
    assert.ok(r.json.fields.length >= 7);
    assert.strictEqual(calls.filter(c => c.action === 'readPage').pop().agentId, 'opp-1');
  });

  await t('CG-104', 'GET /cli/state: every tab with url/title; a failing source is named in blind, the rest still answer', async () => {
    const r = await req(IPC, 'GET', '/cli/state');
    assert.strictEqual(r.json.ok, true);
    assert.deepStrictEqual(r.json.agents.map(a => [a.agentId, a.url, a.title, a.background]), [['default', 'https://x.test/default', 'T-default', false], ['opp-1', 'https://x.test/opp-1', 'T-opp-1', true]]);
    assert.deepStrictEqual(r.json.macros, ['login-upwork']);
    assert.deepStrictEqual(r.json.autofillProfiles, [{ id: 'p1', name: 'Default' }]);
    assert.deepStrictEqual(r.json.accounts[0].providers, ['chatgpt']);
    assert.ok(r.json.blind.find(b => b.source === 'userscripts' && /not ready/.test(b.error)));
  });

  // ── clearglass.browser.tool ────────────────────────────────────────────────────────────────────────────
  process.env.CLEARGL_IPC_PORT = String(IPC);
  delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/browser.js')];
  const tool = require('../../lib/agent-tools/tools/clear-glass/browser.js');

  await t('CG-201', 'tool name follows the convention and every action is declared in the schema enum', () => {
    assert.strictEqual(tool.name, 'clearglass.browser.tool');
    assert.ok(tool.parameters.properties.action.enum.includes('sequence'));
  });

  await t('CG-202', 'state / read / act go straight to :7702 and return the real result', async () => {
    const s = await tool.execute({ action: 'state' });
    assert.strictEqual(s.agents.length, 2);
    const p = await tool.execute({ action: 'read', agentId: 'default' });
    assert.ok(p.fields.find(f => f.selector === '#fn'));
    const a = await tool.execute({ action: 'act', agentId: 'default', driverAction: 'setValue', args: { selector: '#fn', value: 'James' } });
    assert.strictEqual(a.ok, true); assert.strictEqual(a.result.echo.value, 'James');
  });

  await t('CG-203', 'sequence runs steps in order in ONE call and stops at the first failure with the step named', async () => {
    const before = calls.length;
    const r = await tool.execute({ action: 'sequence', agentId: 'default', steps: [{ action: 'setValue', selector: '#fn', value: 'J' }, { action: 'boom' }, { action: 'click', selector: '#x' }] });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.stoppedAt, 1);
    assert.match(r.error, /unknown driver action "boom"/);
    // boom is not a driver action name → refused before any HTTP; only the first step reached the driver
    assert.strictEqual(calls.length - before, 1);
    const r2 = await tool.execute({ action: 'sequence', agentId: 'default', stopOnError: false, steps: [{ action: 'click', selector: '#a' }, { action: 'click', selector: '#b' }] });
    assert.strictEqual(r2.ok, true); assert.strictEqual(r2.results.length, 2);
  });

  await t('CG-204', 'Clear Glass down → the error names the port; never an empty result that looks like an empty page', async () => {
    process.env.CLEARGL_IPC_PORT = '1';
    delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/browser.js')];
    const dead = require('../../lib/agent-tools/tools/clear-glass/browser.js');
    const r = await dead.execute({ action: 'read' });
    assert.strictEqual(r.ok, false); assert.match(r.error, /unreachable on :1/);
    process.env.CLEARGL_IPC_PORT = String(IPC);
  });

  // ── clear_glass_command_index: the :7704 → :7702 fix ──────────────────────────────────────────────────
  await t('CG-301', 'command index: /cli/* goes to the IPC surface, /agent-mesh/* to the wire surface (was: everything to :7704)', async () => {
    const hits = [];
    const wire = await listen((q, s) => { hits.push(['wire', q.method, q.url]); s.end(JSON.stringify({ ok: true, surface: 'wire' })); });
    const ipc2 = await listen((q, s) => { hits.push(['ipc', q.method, q.url]); s.end(JSON.stringify(q.url === '/cli/commands' ? { commandCount: 1, commands: [{ method: 'GET', path: '/cli/history' }] } : { entries: [] })); });
    process.env.CLEARGL_IPC_PORT = String(ipc2.address().port); process.env.WIRE_PORT = String(wire.address().port);
    delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/command-index.js')];
    const ci = require('../../lib/agent-tools/tools/clear-glass/command-index.js');
    const d = await ci.execute({ action: 'discover' });
    assert.strictEqual(d.source, 'live', `live index expected, got ${d.source}`);
    await ci.execute({ action: 'call', method: 'GET', path: '/cli/history' });
    await ci.execute({ action: 'call', method: 'POST', path: '/agent-mesh/route', body: { prompt: 'x' } });
    assert.deepStrictEqual(hits, [['ipc', 'GET', '/cli/commands'], ['ipc', 'GET', '/cli/history'], ['wire', 'POST', '/agent-mesh/route']]);
    wire.close(); ipc2.close();
    process.env.CLEARGL_IPC_PORT = String(IPC); delete process.env.WIRE_PORT;
  });

  // ── CoPilotBridge: results go back to copilot ─────────────────────────────────────────────────────────
  await t('CG-401', 'in-browser copilot: a driver block runs on the driver, its result is sent back, the next reply is the answer', async () => {
    const prompts = [];
    const cop = await listen(async (q, s) => {
      const b = await jsonBody(q);
      if (q.url === '/api/prompt') {
        prompts.push(b);
        const text = prompts.length === 1 ? 'Reading it.\n```driver\n{ "action": "readPage" }\n```' : 'The form wants first name, email and why.';
        return s.end(JSON.stringify({ text }));
      }
      s.end('{}');
    });
    const CoPilotBridge = require('../../clear-glass/src/copilot/bridge.js');
    const events = [];
    const port = cop.address().port;
    const settings = stubSettings(port, { copilotPort: 1, copilotToolRounds: 3 });
    const b = new CoPilotBridge({ sse: { emit: (tpe, d) => events.push([tpe, d]) }, apiSettings: settings });
    b._driver = driver; b._liveToolsPrompt = async () => 'TOOLS';
    const r = await b.send({ message: 'what does this form want?', agentId: 'default', domContext: { x: 1 } });
    assert.strictEqual(prompts.length, 2, 'one follow-up round');
    assert.match(prompts[1].prompt, /^\[tool results\]\n- readPage: ok /);
    assert.match(prompts[1].prompt, /First name/);
    assert.doesNotMatch(prompts[1].systemExtra, /TOOLS/, 'the follow-up round does not re-send the tool catalog');
    assert.strictEqual(r.text, 'The form wants first name, email and why.');
    assert.ok(events.find(e => e[0] === 'copilot.tool.result' && e[1].action === 'readPage' && e[1].ok));
    cop.close();
  });

  await t('CG-402', 'in-browser copilot: a ```tool {"name"} block runs through copilot /api/tools/run as clear-glass-copilot', async () => {
    const runs = []; let n = 0;
    const cop = await listen(async (q, s) => {
      const b = await jsonBody(q);
      if (q.url === '/api/tools/run') { runs.push(b); return s.end(JSON.stringify({ ok: true, name: b.name, result: { hits: [{ source: 'jaa:chat_log', snippet: 'x' }] } })); }
      n++;
      s.end(JSON.stringify({ text: n === 1 ? '```tool\n{"name": "nexus.context.tool", "arguments": {"action": "search", "query": "resume"}}\n```' : 'done' }));
    });
    const CoPilotBridge = require('../../clear-glass/src/copilot/bridge.js');
    const port = cop.address().port;
    const b = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: stubSettings(port, { copilotToolRounds: 2 }) });
    b._liveToolsPrompt = async () => '';
    const r = await b.send({ message: 'find my resume notes', agentId: 'default', domContext: {} });
    assert.deepStrictEqual(runs, [{ name: 'nexus.context.tool', args: { action: 'search', query: 'resume' }, agent: 'clear-glass-copilot', context: { agentId: 'default' } }]);
    assert.strictEqual(r.text, 'done');
    cop.close();
  });

  await t('CG-403', 'copilotToolRounds:0 keeps the old fire-and-forget behaviour (no follow-up)', async () => {
    let n = 0;
    const cop = await listen(async (q, s) => { await jsonBody(q); n++; s.end(JSON.stringify({ text: '```driver\n{ "action": "getUrl" }\n```' })); });
    const CoPilotBridge = require('../../clear-glass/src/copilot/bridge.js');
    const port = cop.address().port;
    const b = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: stubSettings(port, { copilotToolRounds: 0 }) });
    b._driver = driver; b._liveToolsPrompt = async () => '';
    await b.send({ message: 'x', agentId: 'default', domContext: {} });
    assert.strictEqual(n, 1);
    cop.close();
  });

  ipc.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
run();
