'use strict';
/**
 * tests/modules/test-cg-field.test.js — 0.39.279. The interaction field and the virtual pointer.
 *   FD-*  clear-glass/src/page/field.js (Node side): describe(), target(), pointerPath().
 *   DP-*  ClearDriver field/pointer/spotlight with a fake webContents (Electron stubbed): the pointer moves along a
 *         path that ends on the target centre, then presses; a covered target is reported; an off-screen one refused;
 *         via "eros" goes to ErosmancerOS; the verb is `do`.
 *   TL-*  clearglass.browser.tool field / pointer / spotlight → the driver actions, compact result.
 *   ER-*  ErosmancerOS /api/input exists and uses the behaviour engine's curved path.
 * The in-page half is proven in a real page by tests/probe/field-chromium.js (FD-10 runs it).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}

// Electron stub: the driver only needs the names at require time
const _load = Module._load;
Module._load = function (req, ...rest) { return req === 'electron' ? { BrowserWindow: {}, webContents: {} } : _load.call(this, req, ...rest); };

(async () => {
  console.log('\n  test-cg-field.test.js');
  const F = require(path.join(ROOT, 'clear-glass/src/page/field.js'));
  const MAP = { url: 'https://jobs.example.com/apply', title: 'Apply', viewport: { w: 1280, h: 800, scrollX: 0, scrollY: 0 }, overlay: true, targets: [
    { n: 1, tag: 'button', name: 'Apply now', selector: '#apply', x: 100, y: 100, w: 120, h: 40, cx: 160, cy: 120, z: 0 },
    { n: 2, tag: 'button', name: 'Hidden action', selector: '#under', x: 400, y: 100, w: 120, h: 40, cx: 460, cy: 120, z: 1 },
    { n: 3, tag: 'input', type: 'email', name: 'Email', selector: '#email', x: 100, y: 220, w: 228, h: 21, cx: 214, cy: 231, z: 0, value: 'a@b.c' },
    { n: 4, tag: 'a', name: 'Far link', selector: '#far', x: 100, y: 3000, w: 60, h: 18, cx: 130, cy: 799, z: -1 },
  ] };

  await t('FD-01', 'describe: one line per visible target; covered and values said; off-screen left out unless all', () => {
    const text = F.describe(MAP);
    assert.match(text, /^Apply — https:\/\/jobs\.example\.com\/apply\nviewport 1280×800 scroll 0,0/);
    assert.match(text, /#1 button "Apply now" \(160,120\) 120×40 z0\n/);
    assert.match(text, /#2 button "Hidden action" \(460,120\) 120×40 z1 covered×1/);
    assert.match(text, /#3 input\[email\] "Email" \(214,231\) 228×21 z0 value="a@b\.c"/);
    assert.ok(!text.includes('Far link'));
    assert.match(F.describe(MAP, { all: true }), /#4 a "Far link" .* z-1 off-screen/);
    assert.match(F.describe(MAP, { limit: 1 }), /…3 more/);
    assert.strictEqual(F.describe(null), '');
  });

  await t('FD-02', 'target(n) and pointerPath: a curved path of real steps that ends exactly on the target', () => {
    assert.strictEqual(F.target(MAP, 3).selector, '#email');
    assert.strictEqual(F.target(MAP, 9), null);
    let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const p = F.pointerPath({ x: 10, y: 10 }, { x: 160, y: 120 }, { steps: 12, rand });
    assert.strictEqual(p.length, 12);
    assert.deepStrictEqual(p[p.length - 1], { x: 160, y: 120 });
    assert.ok(p.some(q => q.x !== Math.round(10 + (150 * (p.indexOf(q) + 1)) / 12)), 'a straight line would be a robot');
    assert.strictEqual(F.pointerPath(null, { x: 5, y: 5 }, { rand }).slice(-1)[0].x, 5);
  });

  await t('FD-03', 'the in-page scripts are the real functions, called with their options', () => {
    assert.ok(F.fieldScript({ overlay: true }).startsWith('(function _fieldInPage(opts)'));
    assert.match(F.fieldScript({ overlay: true }), /"overlay":true/);
    assert.match(F.atScript({ x: 1, y: 2 }), /"x":1,"y":2/);
    assert.match(F.spotlightScript({ selector: '#a', label: 'L' }), /"selector":"#a","label":"L"/);
  });

  // ── the driver, with a fake page ─────────────────────────────────────────
  const ClearDriver = require(path.join(ROOT, 'clear-glass/src/driver/index.js'));
  function mk() {
    const events = [], evals = [], sse = [];
    const wc = { sendInputEvent: (e) => events.push(e), getURL: () => MAP.url };
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: (tp, x) => sse.push([tp, x]) } });
    d._getWebContents = () => wc;
    d._sleep = () => Promise.resolve();
    d._evalJs = async (_wc, code) => {
      evals.push(code);
      if (code.includes('_fieldInPage')) return JSON.parse(JSON.stringify(MAP));
      if (code.includes('_atInPage')) return { stack: [{ z: 0, tag: 'button', id: 'apply' }] };
      if (code.includes('_spotlightInPage')) return { ok: true };
      return null;
    };
    return { d, events, evals, sse };
  }

  await t('DP-01', 'field: returns the map + its text, keeps it per agent, tells the nerve', async () => {
    const { d, sse } = mk();
    const r = await d.exec({ action: 'field', agentId: 'w1', overlay: true });
    assert.strictEqual(r.targets.length, 4);
    assert.match(r.text, /#1 button "Apply now"/);
    assert.ok(d._fieldMaps().get('w1'));
    assert.ok(sse.some(([tp, x]) => tp === 'field.map' && x.agentId === 'w1' && x.targets === 4));
  });

  await t('DP-02', 'pointer n: spotlight first, a curved move ending on the centre, then down/up there', async () => {
    const { d, events, evals } = mk();
    await d.exec({ action: 'field', agentId: 'w1' });
    const r = await d.exec({ action: 'pointer', agentId: 'w1', n: 1 });
    const moves = events.filter(e => e.type === 'mouseMove');
    assert.ok(moves.length >= 10, `${moves.length} moves`);
    assert.deepStrictEqual([moves[moves.length - 1].x, moves[moves.length - 1].y], [160, 120]);
    assert.deepStrictEqual(events.slice(-2).map(e => [e.type, e.x, e.y, e.button]), [['mouseDown', 160, 120, 'left'], ['mouseUp', 160, 120, 'left']]);
    assert.ok(evals.some(c => c.includes('_spotlightInPage')), 'James sees the target before it is pressed');
    assert.deepStrictEqual([r.via, r.x, r.y, r.target.n], ['native', 160, 120, 1]);
  });

  await t('DP-03', 'a covered target is reported (not silently clicked through); an off-screen one is refused; no field = told', async () => {
    const { d } = mk();
    await assert.rejects(d.exec({ action: 'pointer', agentId: 'w9', n: 1 }), /call field first/);
    await d.exec({ action: 'field', agentId: 'w1' });
    const r = await d.exec({ action: 'pointer', agentId: 'w1', n: 2 });
    assert.strictEqual(r.covered, true); assert.match(r.note, /covered by 1 layer/);
    await assert.rejects(d.exec({ action: 'pointer', agentId: 'w1', n: 4 }), /off-screen — scroll/);
  });

  await t('DP-04', 'do: type clicks then types each character; double / right; a bad verb is refused', async () => {
    const { d, events } = mk();
    await d.exec({ action: 'field', agentId: 'w1' });
    await d.exec({ action: 'pointer', agentId: 'w1', n: 3, do: 'type', text: 'hi' });
    assert.deepStrictEqual(events.filter(e => e.type === 'char').map(e => e.keyCode), ['h', 'i']);
    events.length = 0;
    await d.exec({ action: 'pointer', agentId: 'w1', x: 50, y: 60, do: 'double', spotlight: false });
    assert.deepStrictEqual(events.filter(e => e.type === 'mouseDown').map(e => e.clickCount), [1, 2]);
    events.length = 0;
    await d.exec({ action: 'pointer', agentId: 'w1', x: 50, y: 60, do: 'right', spotlight: false });
    assert.strictEqual(events.find(e => e.type === 'mouseDown').button, 'right');
    await assert.rejects(d.exec({ action: 'pointer', agentId: 'w1', x: 1, y: 1, do: 'smash' }), /must be move\|click/);
  });

  await t('DP-05', 'via eros: ErosmancerOS gets the target centre and the verb; not wired = said, never a silent native click', async () => {
    const { d, events } = mk();
    await d.exec({ action: 'field', agentId: 'w1' });
    await assert.rejects(d.exec({ action: 'pointer', agentId: 'w1', n: 1, via: 'eros' }), /ErosmancerOS input is not wired/);
    const calls = [];
    d.erosInput = async (agentId, url, ev) => { calls.push([agentId, url, ev]); return { ok: true, steps: 12 }; };
    const before = events.filter(e => e.type === 'mouseDown').length;
    const r = await d.exec({ action: 'pointer', agentId: 'w1', n: 1, via: 'eros', do: 'click' });
    assert.deepStrictEqual(calls[0], ['w1', MAP.url, { x: 160, y: 120, action: 'click', text: undefined, deltaY: 300 }]);
    assert.strictEqual(r.via, 'eros');
    assert.strictEqual(events.filter(e => e.type === 'mouseDown').length, before, 'no native click as well');
  });

  await t('DP-06', 'spotlight n: rings the target by its selector with a label; unknown n is told', async () => {
    const { d, evals } = mk();
    await d.exec({ action: 'field', agentId: 'w1' });
    await d.exec({ action: 'spotlight', agentId: 'w1', n: 1 });
    assert.match(evals[evals.length - 1], /"selector":"#apply","label":"#1 Apply now"/);
    await assert.rejects(d.exec({ action: 'spotlight', agentId: 'w1', n: 99 }), /no target #99/);
  });

  await t('TL-01', 'clearglass.browser.tool: field / pointer / spotlight reach the driver; field comes back as its text map', async () => {
    const http = require('http');
    const got = [];
    const srv = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
      const body = JSON.parse(b || '{}'); got.push(body);
      const result = body.action === 'field' ? { ...MAP, text: F.describe(MAP) } : { ok: true };
      s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ ok: true, result }));
    }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.CLEARGL_IPC_PORT = String(srv.address().port);
    delete require.cache[require.resolve(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/browser.js'))];
    const T = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/browser.js'));
    try {
      const f = await T.execute({ action: 'field', agentId: 'w1' });
      assert.match(f.result.text, /#1 button "Apply now"/);
      assert.strictEqual(f.result.targets, 4, 'a count, not 150 objects');
      await T.execute({ action: 'pointer', agentId: 'w1', n: 3, do: 'type', text: 'x', via: 'eros' });
      await T.execute({ action: 'spotlight', agentId: 'w1', n: 1, label: 'about to apply' });
      const sent = got.filter(g => g.action !== 'getUrl');   // the learning record asks which site a pointer acted on
      assert.deepStrictEqual(sent.map(g => g.action), ['field', 'pointer', 'spotlight']);
      assert.deepStrictEqual([sent[0].overlay, sent[1].n, sent[1].do, sent[1].text, sent[1].via, sent[2].label], [true, 3, 'type', 'x', 'eros', 'about to apply']);
    } finally { srv.close(); }
  });

  await t('TL-02', 'the co-pilot pane can issue them (DRIVER_ACTIONS) and its compact tool list names them', () => {
    const B = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
    for (const a of ['field', 'fieldOff', 'at', 'spotlight', 'pointer']) assert.ok(B.DRIVER_ACTIONS.has(a), a);
    assert.match(require(path.join(ROOT, 'clear-glass/src/copilot/tools.js')).buildCompactToolsPrompt(), /- field: field, pointer, at, spotlight, fieldOff/);
  });

  await t('ER-01', 'ErosmancerOS /api/input: coordinates, the verbs, the behaviour engine\'s curved path; main wires the driver to it', () => {
    const srv = fs.readFileSync(path.join(ROOT, 'erosmancer/erosmancer-os/src/api/server.ts'), 'utf8');
    assert.match(srv, /app\.post\("\/api\/input"/);
    assert.match(srv, /curvedPath\(_lastPointer\.get\(tabId\) \?\? null, \{ x, y \}/);
    assert.match(srv, /"move", "click", "double", "right", "scroll", "type"/);
    const beh = fs.readFileSync(path.join(ROOT, 'erosmancer/erosmancer-os/src/behavior/index.ts'), 'utf8');
    assert.match(beh, /export function curvedPath\(/);
    const main = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
    assert.match(main, /driver\.erosInput = \(\.\.\.a\) => \(_erosInputFn \?/);
    assert.match(main, /_proxyEros\('POST', '\/api\/input', \{ tabId: tab\.tabId, x, y, action, text, deltaY \}/);
  });

  await t('FD-10', 'the field in a real page (Clear Glass\'s engine): tests/probe/field-chromium.js', () => {
    const probe = spawnSync(process.execPath, [path.join(ROOT, 'tests/probe/field-chromium.js')], { encoding: 'utf8', timeout: 180000 });
    if (probe.status === 3 || probe.error) { console.log(`    (skipped, not passed: no page engine — ${probe.error ? probe.error.message : 'electron not installed'})`); return; }
    assert.strictEqual(probe.status, 0, (probe.stdout || '').split('\n').filter(l => /"pass": ?false|summary/.test(l)).join('\n') || probe.stderr);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
