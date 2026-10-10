'use strict';
/**
 * tests/modules/test-field-nerve.test.js — FN1–FN3 0.59.0 (docs/2026-10-10-shape-of-nexus-phasemap.spec).
 * James: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?"
 * The field's command rows (each one's request, and one run end to end against a stub Clear Glass); Clear Glass's
 * per-window attention record; Nerve reading it (and its fixed /bus/log fallback); the driver saying field.pointer.
 * The nerve canvas's node targets are proven in Clear Glass (tests/probe/nerve-field-glass.js).
 */
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const assert = require('assert');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const serve = (handler) => new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
const json = (rs, o, st = 200) => { rs.writeHead(st, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
const plain = new Proxy({}, { get: () => (s) => String(s) });

async function main() {
  const { SPEC, makeRouteCommands } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
  const row = (k) => SPEC.find(r => r.key === k);
  const a = (args = [], flags = {}) => ({ args, flags });

  await test('FN-01', 'every field row asks Clear Glass\'s driver for the right thing, in the window --on names (default: the main one)', async () => {
    const f = row('field').req(a([], { overlay: true, on: 'agent-7' }));
    assert.deepStrictEqual([f.system, f.method, f.path, f.body], ['clear-glass', 'POST', '/cli/driver', { agentId: 'agent-7', action: 'field', overlay: true, all: false }]);
    assert.strictEqual(row('field.off').req(a()).body.action, 'fieldOff');
    assert.strictEqual(row('field.off').req(a()).body.agentId, 'default');
    assert.deepStrictEqual(row('field.at').req(a(['412', '580'])).body, { agentId: 'default', action: 'at', x: 412, y: 580 });
    assert.ok(/<x> <y>/.test(row('field.at').need(a(['412']))));
    assert.deepStrictEqual(row('field.show').req(a(['3', 'the', 'apply', 'button'])).body, { agentId: 'default', action: 'spotlight', n: 3, label: 'the apply button' });
    assert.deepStrictEqual(row('field.show').req(a(['#go'])).body, { agentId: 'default', action: 'spotlight', selector: '#go' });
    assert.deepStrictEqual(row('field.show').req(a([], { off: true })).body, { agentId: 'default', action: 'spotlight', off: true });
    assert.deepStrictEqual(row('field.point').req(a(['3', 'type'], { text: 'hello', via: 'eros' })).body, { agentId: 'default', action: 'pointer', n: 3, do: 'type', text: 'hello', via: 'eros' });
    assert.strictEqual(row('field.point').req(a(['3'])).body.do, 'click');
    assert.ok(/what to do/.test(row('field.point').need(a(['3', 'smash']))));
    assert.ok(/a number/.test(row('field.point').need(a(['apply']))));
    assert.deepStrictEqual(row('field.windows').req(a()), { system: 'clear-glass', method: 'GET', path: '/cli/attention' });
    assert.deepStrictEqual(row('nerve').req(a()), { system: 'cortex', method: 'GET', path: '/nerve/snapshot' });
  });

  await test('FN-02', 'run end to end: `field` reaches Clear Glass with its body (it used to be dropped) and prints the text map', async () => {
    let got = null;
    const s = await serve((req, rs) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { got = { path: req.url, body: JSON.parse(b || '{}') };
      json(rs, { ok: true, action: 'field', agentId: got.body.agentId, result: { url: 'https://example.com/', targets: 2, overlay: true, text: '#1 link "Home" (40,20) 60×18 z0\n#2 button "Apply now" (412,580) 120×32 z0' } }); }); });
    process.env.CLEARGL_IPC_PORT = String(s.address().port);
    const out = []; const log = console.log; console.log = (...x) => out.push(x.join(' '));
    try {
      const cmds = makeRouteCommands({ api: async () => { throw new Error('not Idearium'); }, findRepo: () => null, shortRepo: (x) => x, die: (m) => { throw new Error(m); }, header: () => {}, port: 4800, c: plain });
      await cmds.field(null, { positional: [], flags: { overlay: true } });
    } finally { console.log = log; s.close(); delete process.env.CLEARGL_IPC_PORT; }
    assert.deepStrictEqual(got, { path: '/cli/driver', body: { agentId: 'default', action: 'field', overlay: true, all: false } });
    const text = out.join('\n');
    assert.ok(/#2 button "Apply now" \(412,580\)/.test(text) && /2 target\(s\)/.test(text) && /field point <n> click/.test(text), text);
  });

  await test('FN-03', 'Clear Glass\'s attention record keeps each window\'s page changes and the field\'s last map, spotlight and pointer — from the real event names', async () => {
    let t = 1000;
    const A = require(path.join(ROOT, 'clear-glass/src/page/attention.js')).createAttention({ now: () => t });
    assert.strictEqual(A.note('field.map', { url: 'x' }), false, 'no agentId — not kept');
    A.note('dom.injected', { agentId: 'default', url: 'https://example.com/', ts: 1000 });
    A.note('dom.mutations', { agentId: 'default', ts: 1100 });
    A.note('field.map', { agentId: 'default', url: 'https://example.com/', targets: 12, overlay: true, ts: 1200 });
    A.note('field.spotlight', { agentId: 'default', n: 3, label: '#3 Apply now', ok: true, ts: 1300 });
    A.note('field.pointer', { agentId: 'default', do: 'click', x: 412, y: 580, n: 3, name: 'Apply now', via: 'native', ts: 1400 });
    A.note('dom.mutations', { agentId: 'agent-2', ts: 900 });
    assert.strictEqual(A.note('copilot.reply', { agentId: 'default' }), false, 'other events are not attention');
    t = 2000;
    const [w, w2] = A.windows();
    assert.strictEqual(w.agentId, 'default', 'newest first');
    assert.deepStrictEqual([w.mutationCount, w.lastMutation, w.idle], [1, 1100, false]);
    assert.deepStrictEqual(w.focus.field, { targets: 12, url: 'https://example.com/', overlay: true, at: 1200 });
    assert.strictEqual(w.focus.spotlight.label, '#3 Apply now');
    assert.deepStrictEqual([w.focus.pointer.do, w.focus.pointer.n, w.focus.pointer.name], ['click', 3, 'Apply now']);
    assert.strictEqual(w2.agentId, 'agent-2');
    A.note('field.spotlight', { agentId: 'default', off: true, ts: 2000 });
    assert.strictEqual(A.windows()[0].focus.spotlight, null, 'spotlight off clears it');
    t = 2000 + 11 * 60000;
    assert.strictEqual(A.windows().length, 0, 'a window silent ten minutes is forgotten');
  });

  await test('FN-04', 'Nerve reads Clear Glass\'s attention: each window in the snapshot carries its focus; the old /bus/log path now reads `entries`', async () => {
    let mode = 'attention';
    const s = await serve((req, rs) => {
      if (req.url === '/cli/attention' && mode === 'attention') return json(rs, { ok: true, windows: [{ agentId: 'default', lastMutation: Date.now() - 1000, mutationCount: 4, idle: false,
        focus: { url: 'https://example.com/', field: { targets: 12, at: Date.now() - 500 }, spotlight: null, pointer: { do: 'click', n: 3, name: 'Apply now', at: Date.now() - 200 }, at: Date.now() - 200 } }] });
      if (req.url === '/cli/attention') return json(rs, { error: 'Cannot GET /cli/attention' }, 404);
      if (req.url === '/bus/log') return json(rs, { level: 'DATA', count: 1, entries: [{ seq: 1, time: Date.now() - 300, type: 'dom.mutations', data: { agentId: 'agent-9' } }] });
      json(rs, {}, 404);
    });
    process.env.CLEARGL_IPC_URL = `http://127.0.0.1:${s.address().port}`;
    process.env.NEXUS_CFR_URL = process.env.NEXUS_ORCH_URL = 'http://127.0.0.1:1';
    const modPath = require.resolve(path.join(ROOT, 'lib/nerve/index.js'));
    delete require.cache[modPath];
    try {
      const nerve = require(modPath);
      const snap = await nerve._pollDomOnce();
      const w = snap.windows.find(x => x.agentId === 'default');
      assert.ok(w && w.mutationCount === 4 && !w.idle, JSON.stringify(snap.windows));
      assert.deepStrictEqual([w.focus.pointer.do, w.focus.pointer.n, w.focus.field.targets], ['click', 3, 12]);
      mode = 'old';
      const snap2 = await nerve._pollDomOnce();
      assert.ok(snap2.windows.some(x => x.agentId === 'agent-9'), `the fallback reads entries: ${JSON.stringify(snap2.windows)}`);
    } finally { s.close(); delete require.cache[modPath]; delete process.env.CLEARGL_IPC_URL; }
  });

  await test('FN-05', 'the driver says every pointer act on the bus (field.pointer), as field.map and field.spotlight already were', async () => {
    const ClearDriver = require(path.join(ROOT, 'clear-glass/src/driver/index.js'));
    const d = Object.create(ClearDriver.prototype);
    const said = [];
    d.sse = { emit: (t, x) => said.push([t, x]) };
    d._pointerAct = async () => ({ via: 'native', x: 412, y: 580, action: 'click', target: { n: 3, name: 'Apply now', z: 1 }, covered: true });
    const r = await d._pointer('default', { n: 3 });
    assert.strictEqual(r.x, 412);
    assert.strictEqual(said[0][0], 'field.pointer');
    assert.deepStrictEqual((({ agentId, do: dd, x, y, n, name, covered, via }) => ({ agentId, do: dd, x, y, n, name, covered, via }))(said[0][1]), { agentId: 'default', do: 'click', x: 412, y: 580, n: 3, name: 'Apply now', covered: true, via: 'native' });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
