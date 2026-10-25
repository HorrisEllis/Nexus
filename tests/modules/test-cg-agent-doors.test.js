'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cg-agent-doors.test.js — AD1–AD5 + SI1 (0.60.251).
 * James, 2026-10-25: "need clearglass' fiverr, job application automation, autofill and macros working fully, including with
 * the agents and copilot." · "not letting me sign in."
 *
 *   AD-01  autofill_manage reaches Clear Glass's /cli/autofill/* routes (a real HTTP server stands in for :7702): fill carries vars,
 *          gig/pick/learn/learned/forget each hit their route; Clear Glass down names the port; a bad action is refused
 *   AD-02  the bridge's _macroWrite / _macroRecord: one implementation for IPC and HTTP, one shared recorder, no driver said
 *   AD-03  every new co-pilot tool has a dispatch to its route (tools.js ↔ copilot/bridge.js), and the route is served by ipc/bridge.js
 *   AD-04  the job verbs: "fill this in for me" / "pick github" / "record a macro" run without a model; a gig editor → autofill.gig,
 *          any other page → autofill.fill; describeJob says failures with their reason
 *   AD-05  the command rows exist and every path they call is served by ipc/bridge.js
 *   AD-06  SI1: a provider tab on its sign-in page is not injected (the reload loop in his log), its chat is
 *   AD-07  loom: the new edges are in the maps (rule 3)
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

const BRIDGE_SRC = read('clear-glass/src/ipc/bridge.js');
// a path the IPC bridge serves: '/cli/macros/x/run' is served by app.post('/cli/macros/:name/run', …)
const SERVED = [...BRIDGE_SRC.matchAll(/this\.app\.(get|post|put|delete)\('([^']+)'/g)].map(m => ({ method: m[1].toUpperCase(), re: new RegExp('^' + m[2].replace(/:[a-zA-Z]+/g, '[^/]+') + '$') }));
const served = (method, p) => SERVED.some(s => s.method === method && s.re.test(p.split('?')[0]));

function fakeClearGlass() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url.startsWith('/cli/autofill/fill') ? { profileId: 'p1', totalFields: 3, filled: [{ fieldType: 'email' }], skipped: [], failed: [], needsPick: { unplaced: ['github'], unmatched: [] } } : { ok: true, path: req.url }));
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, seen, port: srv.address().port })));
}

(async () => {
  await test('AD-01', 'autofill_manage → /cli/autofill/* over :7702 (vars, gig, pick, learn, learned, forget); down names the port', async () => {
    const cg = await fakeClearGlass();
    process.env.CLEARGL_IPC_PORT = String(cg.port);
    for (const k of Object.keys(require.cache)) if (/agent-tools[\\/]tools[\\/](clear-glass[\\/]browser|autofill[\\/]autofill-manage)\.js$/.test(k)) delete require.cache[k];
    const AM = require('../../lib/agent-tools/tools/autofill/autofill-manage.js');
    try {
      const f = await AM.execute({ action: 'fill', data: { profileId: 'p1', agentId: 't1', vars: { company: 'micro1' } } });
      assert.ok(f.ok, JSON.stringify(f)); assert.deepStrictEqual(f.result.needsPick.unplaced, ['github']);
      const fill = cg.seen.find(s => s.url === '/cli/autofill/fill');
      assert.deepStrictEqual(fill.body, { agentId: 't1', profileId: 'p1', minConfidence: 'medium', vars: { company: 'micro1' } });
      for (const [action, data, method, url] of [
        ['gig', { offer: 'node scrapers' }, 'POST', '/cli/autofill/gig/autofill'],
        ['pick', { fieldType: 'github' }, 'POST', '/cli/autofill/pick'],
        ['learn', { fieldKey: 'Your code profile', fieldType: 'github' }, 'POST', '/cli/autofill/learn'],
        ['learned', { url: 'https://micro1.ai/' }, 'GET', '/cli/autofill/learned?url=https%3A%2F%2Fmicro1.ai%2F'],
        ['forget', { url: 'https://micro1.ai/', fieldKey: 'x' }, 'POST', '/cli/autofill/forget'],
        ['listProfiles', {}, 'GET', '/cli/autofill/profiles'],
        ['deleteProfile', { id: 'p 1' }, 'DELETE', '/cli/autofill/profiles/p%201'],
      ]) {
        const r = await AM.execute({ action, data });
        assert.ok(r.ok, `${action}: ${JSON.stringify(r)}`);
        assert.ok(cg.seen.some(s => s.method === method && s.url === url), `${action} → ${method} ${url}; saw ${JSON.stringify(cg.seen.map(s => s.method + ' ' + s.url))}`);
        assert.ok(served(method, url), `${method} ${url} is served by ipc/bridge.js`);
      }
      assert.match((await AM.execute({ action: 'pick', data: {} })).error, /needs \{fieldType\}/);
      assert.match((await AM.execute({ action: 'nope' })).error, /unknown action/);
    } finally { cg.srv.close(); }
    const down = await AM.execute({ action: 'listProfiles' });
    assert.match(down.error, new RegExp(`unreachable on :${cg.port}`), 'Clear Glass down is said with its port');
    assert.ok(!/_createGuardianJob|provider: 'autofill'/.test(read('lib/agent-tools/tools/autofill/autofill-manage.js').split('§AD1')[1] || ''), 'the Guardian job path is gone from the code that runs');
  });

  await test('AD-02', 'macro create/delete and recording: one method for IPC and HTTP, one recorder', async () => {
    const IpcBridge = require('../../clear-glass/src/ipc/bridge.js');
    const calls = [];
    const s = { macroTool: { execute: async (a) => { calls.push(a); return { ok: true, name: a.name }; } }, driver: {} };
    s._macroWrite = IpcBridge.prototype._macroWrite.bind(s); s._macroRecord = IpcBridge.prototype._macroRecord.bind(s);
    await s._macroWrite('create', { name: 'apply micro1', steps: [{ action: 'click', data: { selector: '#go' } }], urlPattern: 'https://micro1.ai/*', params: ['email'] });
    await s._macroWrite('delete', { name: 'apply micro1' });
    assert.deepStrictEqual(calls.map(c => c.action), ['create', 'delete']);
    assert.strictEqual(calls[0].urlPattern, 'https://micro1.ai/*');
    const rec = []; s._liveRecorder = { start: async (a) => { rec.push(['start', a]); return { ok: true, name: a.name, file: 'x.macro' }; }, stop: async (id) => { rec.push(['stop', id]); return { ok: true, steps: [{}], params: [] }; }, status: (id) => ({ ok: true, recording: true, id }) };
    assert.ok((await s._macroRecord('start', { agentId: 't1', name: 'm' })).ok);
    assert.strictEqual((await s._macroRecord('status', { agentId: 't1' })).recording, true);
    assert.ok((await s._macroRecord('stop', { agentId: 't1' })).ok);
    assert.deepStrictEqual(rec.map(r => r[0]), ['start', 'stop']);
    const noDriver = { macroTool: s.macroTool, driver: null }; noDriver._macroRecord = IpcBridge.prototype._macroRecord.bind(noDriver);
    assert.match((await noDriver._macroRecord('start', { agentId: 't1' })).error, /driver not wired/);
    assert.match(BRIDGE_SRC, /ipcMain\.handle\('macros:recordStart'[^\n]*this\._macroRecord\('start'/, 'IPC uses the shared method');
    for (const [m, p] of [['POST', '/cli/macros'], ['DELETE', '/cli/macros/x'], ['POST', '/cli/macros/record/start'], ['POST', '/cli/macros/record/stop'], ['GET', '/cli/macros/record/status']]) assert.ok(served(m, p), `${m} ${p} served`);
    assert.match(BRIDGE_SRC, /vars: req\.body\?\.vars/, 'POST /cli/autofill/fill passes vars');
  });

  await test('AD-03', 'every new co-pilot tool is declared, dispatched to its route, and the route is served', async () => {
    const T = require('../../clear-glass/src/copilot/tools.js');
    const names = (T.TOOLS || []).map(t => t.name);
    const B = require('../../clear-glass/src/copilot/bridge.js');
    const s = Object.create(B.prototype); s.sse = { emit() {} }; s._driver = null;
    const calls = [];
    s._ipcPost = async (p, b) => { calls.push(['POST', p, b]); return { ok: true }; };
    s._ipcGet = async (p) => { calls.push(['GET', p]); return { ok: true }; };
    s._ipcDelete = async (p) => { calls.push(['DELETE', p]); return { ok: true }; };
    const want = {
      'autofill.profiles': ['GET', '/cli/autofill/profiles'], 'autofill.detect': ['POST', '/cli/autofill/detect'], 'autofill.fill': ['POST', '/cli/autofill/fill'],
      'macro.list': ['GET', '/cli/macros'], 'macro.get': ['GET', '/cli/macros/m1'], 'macro.run': ['POST', '/cli/macros/m1/run'], 'macro.create': ['POST', '/cli/macros'],
      'macro.delete': ['DELETE', '/cli/macros/m1'], 'macro.record.start': ['POST', '/cli/macros/record/start'], 'macro.record.stop': ['POST', '/cli/macros/record/stop'],
      'macro.record.status': ['GET', '/cli/macros/record/status?agentId=t1'],
    };
    for (const [tool, [m, p]] of Object.entries(want)) {
      assert.ok(names.includes(tool), `${tool} is in tools.js`);
      calls.length = 0;
      await s._executeCommand({ action: tool, name: 'm1' }, 't1');
      assert.deepStrictEqual(calls.map(c => [c[0], c[1]]), [[m, p]], `${tool} → ${m} ${p}`);
      assert.ok(served(m, p), `${m} ${p} served by ipc/bridge.js`);
    }
    for (const tool of ['opportunity.show', 'opportunity.draft', 'opportunity.prepare_reply', 'opportunity.submit', 'opportunity.followups']) {
      assert.ok(names.includes(tool), `${tool} in tools.js`);
      assert.ok(Object.prototype.hasOwnProperty.call(require('../../lib/agent-tools/tools/opportunity/opportunity.js').parameters.properties.action.enum.reduce((o, k) => (o[k] = 1, o), {}), tool.split('.')[1]), `${tool} names a real nexus.opportunity.tool action`);
    }
    calls.length = 0; await s._executeCommand({ action: 'autofill.fill', vars: { a: 1 } }, 't9');
    assert.deepStrictEqual(calls[0][2], { agentId: 't9', profileId: null, minConfidence: 'medium', vars: { a: 1 } }, 'the co-pilot fill passes vars');
  });

  await test('AD-04', 'the job verbs run the engine before any model; a gig editor is the gig fill, any other page the application fill', async () => {
    const V = require('../../clear-glass/src/copilot/verbs.js');
    for (const m of ['fill this in for me', 'Fill it out', 'autofill', 'please fill in the application', 'can you fill out the form for me?']) assert.ok(V.fillIntent(m), m);
    for (const m of ['fill it with my other email', 'I filled it in', 'fill']) assert.strictEqual(V.fillIntent(m), null, m);
    assert.deepStrictEqual(V.pickIntent('pick the github field'), { kind: 'pick', fieldType: 'github' });
    assert.deepStrictEqual(V.recordIntent('record a macro called apply micro1'), { kind: 'record.start', name: 'apply micro1' });
    assert.deepStrictEqual(V.recordIntent('stop recording'), { kind: 'record.stop' });
    assert.ok(V.isGigEditor('https://www.fiverr.com/users/jb/manage_gigs/new?wizard=0'));
    assert.ok(!V.isGigEditor('https://micro1.ai/apply/1'));
    const B = require('../../clear-glass/src/copilot/bridge.js');
    for (const [url, action] of [['https://www.fiverr.com/users/jb/manage_gigs/new', 'autofill.gig'], ['https://micro1.ai/apply/1', 'autofill.fill']]) {
      const s = Object.create(B.prototype); const ran = [];
      s._driver = { exec: async () => ({ url }) }; s.postEvent = () => {};
      s._executeCommand = async (cmd) => { ran.push(cmd.action); return action === 'autofill.gig' ? { ok: true, title: 'g', filled: [{ key: 'title' }], leftToCopy: ['faq'] } : { totalFields: 3, filled: [{ fieldType: 'email' }], skipped: [], failed: [], needsPick: { unplaced: ['github'] } }; };
      const text = await s._runJobVerb({ kind: 'fill' }, 't1', '');
      assert.deepStrictEqual(ran, [action]);
      assert.match(text, action === 'autofill.gig' ? /Filled the gig "g": title\. Left to copy by hand: faq\. Nothing was saved or published/ : /Filled 1 of 3 fields: email\..*No field took: github — say "pick github"/);
    }
    assert.match(V.describeJob({ kind: 'fill' }, { error: 'no autofill profile "x"' }), /^Did not fill: no autofill profile/);
    assert.match(V.describeJob({ kind: 'fill', gig: true }, { ok: false, needsGig: true, error: 'No gig is written yet. Say in one line' }), /^No gig is written yet/);
    assert.match(read('clear-glass/src/copilot/bridge.js'), /V\.fillIntent\(message\) \|\| V\.pickIntent\(message\) \|\| V\.recordIntent\(message\)/, 'send() runs them before _ask');
  });

  await test('AD-05', 'the command rows exist and every path they call is served', async () => {
    const SPEC = require('../../idearium/cli/route-commands.js').SPEC;
    const by = Object.fromEntries(SPEC.map(r => [r.key, r]));
    const a = (args = [], flags = {}) => ({ args, flags });
    for (const [key, args] of [['autofill.profiles', []], ['autofill.detect', []], ['autofill.fill', []], ['gig.fill', ['node', 'scrapers']], ['gig.detect', []], ['macro.list', []], ['macro.show', ['m1']], ['macro.run', ['apply', 'micro1', 'email=j@x.com']], ['macro.record', ['m1']], ['macro.stop', []]]) {
      const r = by[key]; assert.ok(r, `row ${key}`);
      const q = r.req(a(args));
      assert.strictEqual(q.system, 'clear-glass');
      assert.ok(served(q.method, q.path), `${key}: ${q.method} ${q.path} served`);
      if (key === 'macro.run') { assert.strictEqual(q.path, '/cli/macros/apply%20micro1/run'); assert.deepStrictEqual(q.body.params, { email: 'j@x.com' }); }
      if (key === 'gig.fill') assert.strictEqual(q.body.offer, 'node scrapers');
    }
  });

  await test('AD-06', 'SI1: a provider tab on its sign-in page is not injected; its chat is', async () => {
    const Host = require('../../clear-glass/src/providers/host.js');
    assert.ok(Host.isSigninPage('https://chatgpt.com/auth/login?next=%2F'));
    for (const u of ['https://chatgpt.com/', 'https://chatgpt.com/c/abc', 'https://claude.ai/new']) assert.ok(!Host.isSigninPage(u), u);
    const ran = [];
    const s = Object.create(Host.prototype);
    s._stampAgent = async () => { ran.push('stamp'); }; s.loadUserscript = () => { ran.push('load'); return null; };
    const win = (url) => ({ webContents: { getURL: () => url, executeJavaScript: async () => { ran.push('exec'); } } });
    assert.strictEqual(await s._inject('chatgpt', win('https://chatgpt.com/auth/login?next=%2F')), false);
    assert.deepStrictEqual(ran, [], 'nothing runs in the sign-in page');
    await s._inject('chatgpt', win('https://chatgpt.com/'));
    assert.deepStrictEqual(ran, ['stamp', 'load'], 'the chat page goes on to the userscript');
  });

  await test('AD-07', 'loom: the new edges are wired', async () => {
    const eco = read('loom/maps/economy-map.js'), cap = read('loom/maps/copilot-capability-map.js');
    for (const s of ['0.60.251 AD1 autofill_manage', '0.60.251 AD3 autofill.profiles', '0.60.251 AD4 autofill profiles', '0.60.251 AD2 _macroRecord', '0.60.251 AD3 send(): fillIntent']) assert.ok(eco.includes(s), s);
    assert.match(cap, /autofill-manage',\s*\n\s*\['nexus\.lib\.agent-tools\.tools\.clearglass-browser-tool'\]/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
