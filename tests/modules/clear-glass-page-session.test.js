'use strict';
/**
 * tests/modules/clear-glass-page-session.test.js — PM5/PM6 (0.60.175): the page map as actions on a window, and Ollama feeling it
 * through Nexus Nerve.
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec
 * James, 2026-10-19: "interaction field, nexus nerve, hooking ollama in to feel with "nexus nerve", see with the interaction field
 * and scrips injected into each page." · "then it can be a map tool, chunk tool for understanding/analysing/ reverse engineering,,
 * web scraper."
 *
 *   PS-01  page-session on a real DOM (jsdom): map → lines, forms, the diff and its words; a second visit after the page changed
 *          says what changed; find → the target; outcome → learned; chunks by query; scrape as markdown and JSON; 'page.map' is
 *          emitted with the feel
 *   PS-02  the doors: the driver dispatches the five page actions, the co-pilot bridge allows them, the co-pilot tools list them,
 *          the command rows build the driver request
 *   PS-03  attention keeps page.map as the window's focus.page (what Nerve copies); an outcome is kept on it
 *   PS-04  the Nerve → Ollama bridge pushes the page's feel in words once, and not again while nothing changed
 *   PS-05  PM7 live: a mapped window is mapped again after its DOM settles (debounced, at most once per gap) and the new block is
 *          felt; live:false does not follow; a window whose read fails stops being live and says why; main/index.js hands
 *          dom.mutations to the driver
 *   PS-06  PM8 the panel in Clear Glass's engine (driver stubbed): the toolbar button maps the page; Find lists targets with why;
 *          Show spotlights the target; ✓ sends pageOutcome for that target; Scrape shows the markdown; no engine → SKIPPED, said
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '../..');
const PS = require(path.join(ROOT, 'clear-glass/src/page/page-session.js'));
const MEM = require(path.join(ROOT, 'clear-glass/src/page/page-memory.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const PAGE = (step = '') => `<html><head><title>Checkout</title></head><body><main><h1>Checkout</h1>
  <p>Your order is almost done; we only need your address to ship it to you.</p>
  <form aria-label="Address"><label for="st">Street</label><input id="st" required><label for="ci">City</label><input id="ci">${step}
  <button>Continue</button></form></main></body></html>`;
const win = (html) => { const dom = new JSDOM(html, { url: 'https://shop.example.com/checkout/88812', runScripts: 'outside-only' }); return (code) => JSON.parse(JSON.stringify(dom.window.eval(code))); };

(async () => {
  console.log('\nclear-glass-page-session — the page map as actions, and the feel through Nerve (PM5/PM6)');
  const events = [];
  const mem = MEM.createMemory({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'ps-mem-')) });
  const S = PS.createPageSession({ memory: mem, emit: (t, d) => events.push([t, d]) });

  await test('PS-01', 'map, a changed second visit in words, find, outcome, chunks, scrape; page.map emitted', async () => {
    const m1 = await S.map({ agentId: 'w1', evalJs: win(PAGE()) });
    assert.strictEqual(m1.site, 'https://shop.example.com/checkout/:id');
    assert.ok(m1.lines.some(l => l === 'form "Address" — 2 field(s) (Street*, City) → button "Continue"'), m1.lines.join('\n'));
    assert.ok(/^first visit: \d+ blocks$/.test(m1.feel), m1.feel);
    const m2 = await S.map({ agentId: 'w1', evalJs: win(PAGE('<label for="zp">Postcode</label><input id="zp">')) });
    assert.strictEqual(m2.visits, 2);
    assert.ok(/^\+1 \(textbox "Postcode"\)/.test(m2.feel), m2.feel);
    const pm = events.filter(e => e[0] === 'page.map');
    assert.strictEqual(pm.length, 2); assert.strictEqual(pm[1][1].feel, m2.feel); assert.strictEqual(pm[1][1].agentId, 'w1');
    const f = await S.find({ agentId: 'w1', evalJs: () => { throw new Error('should use the recent map'); }, intent: 'type the postcode' });
    assert.strictEqual(f.targets[0].name, 'Postcode'); assert.ok(f.targets[0].selector);
    await assert.rejects(() => S.find({ agentId: 'w1', evalJs: win(PAGE()), intent: ' ' }), /needs an intent/);
    const o = S.outcome({ agentId: 'w1', intent: 'type the postcode', id: f.targets[0].id, ok: true });
    assert.ok(o.ok && o.score === 1, JSON.stringify(o));
    assert.ok(!S.outcome({ agentId: 'nobody', intent: 'x', id: 'y' }).ok, 'no map, said');
    const ch = await S.chunks({ agentId: 'w1', evalJs: win(PAGE()), query: 'ship address' });
    assert.ok(ch.chunks.length >= 1 && ch.chunks.every(c => /ship|Address|address/i.test(c.text + c.title)), JSON.stringify(ch.chunks.map(c => c.title)));
    const md = await S.scrape({ agentId: 'w1', evalJs: win(PAGE()) });
    assert.ok(md.markdown.startsWith('# Checkout') && /almost done/.test(md.markdown), md.markdown);
    const js = await S.scrape({ agentId: 'w1', evalJs: win(PAGE()), format: 'json' });
    assert.ok(js.blocks.length && js.chunks.length && js.map.forms.length === 1);
  });

  await test('PS-02', 'the doors: driver actions, the bridge\'s allowlist, the co-pilot tools, the command rows', async () => {
    const drv = fs.readFileSync(path.join(ROOT, 'clear-glass/src/driver/index.js'), 'utf8');
    for (const a of ['pageMap', 'pageFind', 'pageChunks', 'pageScrape', 'pageOutcome']) assert.ok(new RegExp(`case '${a}':`).test(drv), a);
    const Bridge = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
    for (const a of ['pageMap', 'pageFind', 'pageChunks', 'pageScrape', 'pageOutcome']) assert.ok(Bridge.DRIVER_ACTIONS.has(a), a);
    const T = require(path.join(ROOT, 'clear-glass/src/copilot/tools.js'));
    const names = (T.TOOLS || T.tools || []).map(t => t.name);
    for (const a of ['pageMap', 'pageFind', 'pageChunks', 'pageScrape', 'pageOutcome']) assert.ok(names.includes(a), `${a} not a co-pilot tool`);
    const RC = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = (k) => (RC.SPEC || RC).find(r => r.key === k);
    assert.deepStrictEqual(row('page.find').req({ args: ['type', 'my', 'email'], flags: { on: 'w2' } }).body, { agentId: 'w2', action: 'pageFind', intent: 'type my email', fresh: false });
    assert.strictEqual(row('page.outcome').req({ args: ['click', 'apply', 'b1', 'fail'], flags: {} }).body.ok, false);
    assert.strictEqual(row('page.scrape').req({ args: [], flags: { json: true } }).body.format, 'json');
    assert.strictEqual(row('page').req({ args: [], flags: {} }).path, '/cli/driver');
  });

  const AT = require(path.join(ROOT, 'clear-glass/src/page/attention.js'));
  await test('PS-03', 'attention keeps page.map as focus.page; an outcome is kept on it', async () => {
    const a = AT.createAttention();
    const d = events.filter(e => e[0] === 'page.map')[1][1];
    assert.ok(a.note('page.map', d));
    a.note('page.outcome', { agentId: 'w1', intent: 'type the postcode', id: 'b1', ok: true });
    const w = a.windows().find(x => x.agentId === 'w1');
    assert.strictEqual(w.focus.page.feel, d.feel); assert.strictEqual(w.focus.page.site, 'https://shop.example.com/checkout/:id');
    assert.ok(w.focus.page.lines.length >= 1 && w.focus.page.lastOutcome.ok);
  });

  await test('PS-04', 'the Nerve → Ollama bridge pushes the page\'s feel once, in words, and not again unchanged', async () => {
    const got = [];
    const srv = await new Promise((res) => { const s = http.createServer((q, r) => { let b = ''; q.on('data', c => { b += c; }); q.on('end', () => { got.push({ url: q.url, body: JSON.parse(b) }); r.setHeader('content-type', 'application/json'); r.end('{"ok":true}'); }); }); s.listen(0, '127.0.0.1', () => res(s)); });
    process.env.OLLAMA_PORT = String(srv.address().port);
    const nervePath = require.resolve(path.join(ROOT, 'lib/nerve/index.js'));
    const bridgePath = require.resolve(path.join(ROOT, 'lib/nerve-ollama-bridge.js'));
    const page = { site: 'https://shop.example.com/checkout/:id', feel: '+1 (textbox "Postcode")', lines: ['Checkout — 9 blocks', 'form "Address" — 3 field(s)'], at: 1000 };
    let snap = { windows: [{ agentId: 'w1', mutationCount: 0, idle: true, msSinceLastMutation: null, focus: { url: 'https://shop.example.com/checkout/88812', page } }] };
    const prevNerve = require.cache[nervePath];
    require.cache[nervePath] = { id: nervePath, filename: nervePath, loaded: true, exports: { getSnapshot: () => snap } };
    delete require.cache[bridgePath];
    try {
      const B = require(bridgePath);
      B._resetForTest();
      const r1 = await B.pushContext('ch1');
      assert.ok(r1.pushed && r1.pagesFelt === 1, JSON.stringify(r1));
      assert.strictEqual(got.length, 1); assert.strictEqual(got[0].url, '/api/stream/ch1/context');
      assert.ok(/window w1 · https:\/\/shop\.example\.com\/checkout\/:id: \+1 \(textbox "Postcode"\) — Checkout — 9 blocks \| form "Address" — 3 field\(s\)/.test(got[0].body.context), got[0].body.context);
      const r2 = await B.pushContext('ch1');
      assert.ok(!r2.pushed && got.length === 1, 'nothing changed: nothing pushed');
      snap = { windows: [{ ...snap.windows[0], focus: { ...snap.windows[0].focus, page: { ...page, feel: '1 changed', at: 2000 } } }] };
      const r3 = await B.pushContext('ch1');
      assert.ok(r3.pushed && /1 changed/.test(got[1].body.context));
    } finally {
      srv.close(); delete process.env.OLLAMA_PORT; delete require.cache[bridgePath];
      if (prevNerve) require.cache[nervePath] = prevNerve; else delete require.cache[nervePath];
    }
  });

  await test('PS-05', 'live: re-mapped after the page settles, debounced; live:false not followed; a failed read stops it, said', async () => {
    let t = 100000; const timers = []; const ev = [];
    const L = PS.createPageSession({ memory: MEM.createMemory({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'ps-live-')) }), emit: (a, d) => ev.push([a, d]),
      now: () => t, quietMs: 1500, minGapMs: 5000, setTimer: (fn, ms) => { const h = { fn, at: t + ms, live: true }; timers.push(h); return h; }, clearTimer: (h) => { h.live = false; } });
    const run = async () => { const due = timers.filter(h => h.live && h.at <= t); for (const h of due) { h.live = false; await h.fn(); } };
    let html = PAGE();
    const evalJs = (code) => win(html)(code);
    await L.map({ agentId: 'w9', evalJs });
    assert.deepStrictEqual(L.live(), ['w9']);
    html = PAGE('<label for="ph">Phone</label><input id="ph">');
    assert.ok(L.poke('w9')); assert.ok(L.poke('w9'), 'a burst of mutations');
    assert.strictEqual(timers.filter(h => h.live).length, 1, 'debounced: one pending re-map');
    t += 1600; await run();
    assert.strictEqual(ev.filter(e => e[0] === 'page.map').length, 1, 'not before the gap since the last map (5 s)');
    t += 4000; await run();
    const live = ev.filter(e => e[0] === 'page.map');
    assert.strictEqual(live.length, 2); assert.strictEqual(live[1][1].via, 'live');
    assert.ok(/textbox "Phone"/.test(live[1][1].feel), live[1][1].feel);
    // live:false is not followed
    await L.map({ agentId: 'w8', evalJs, live: false });
    assert.ok(!L.poke('w8') && !L.live().includes('w8'));
    // a window that cannot be read any more stops being live, said
    await L.map({ agentId: 'w7', evalJs });
    html = null; const dead = L.live(); assert.ok(dead.includes('w7'));
    const bad = () => { throw new Error('webcontents destroyed'); };
    await L.map({ agentId: 'w7', evalJs: bad }).catch(() => {});
    L.poke('w7'); t += 6000; await run();
    assert.ok(!L.live().includes('w7'));
    const stop = ev.find(e => e[0] === 'page.live.stopped');
    assert.ok(stop && stop[1].agentId === 'w7' && /webcontents destroyed/.test(stop[1].why), JSON.stringify(stop));
    const main = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
    assert.ok(/ev\.type === 'dom\.mutations'[^\n]*driver\.pageMutated\(ev\.data\.agentId\)/.test(main), 'main hands dom.mutations to the driver');
  });

  // PS-06 — the panel in Clear Glass (AXIOMS §4.1)
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  const eng = glass.engine(); let browser = null;
  if (!eng) { console.log('  - PS-06 SKIPPED: Clear Glass has no engine here — the panel check did not run'); skipped++; }
  else { try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PS-06 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; } }
  if (browser) {
    const { pathToFileURL } = require('url');
    const html = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.html'), 'utf8');
    const markup = html.match(/<div id="page-map-panel"[\s\S]*?<div id="pm-out"><\/div>\n<\/div>/)[0];
    const btn = html.match(/<button class="nav-btn" id="btn-page-map"[^>]*>[^<]*<\/button>/)[0];
    const sess = PS.createPageSession({ memory: MEM.createMemory({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'ps-ui-')) }) });
    const m = await sess.map({ agentId: 'default', evalJs: win(PAGE()) });
    const f = await sess.find({ agentId: 'default', evalJs: win(PAGE()), intent: 'type the city' });
    const md = await sess.scrape({ agentId: 'default', evalJs: win(PAGE()) });
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-panel-'));
    fs.writeFileSync(path.join(d, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body>${btn}${markup}<script>
  const CALLS = []; const R = { pageMap: ${JSON.stringify(m)}, pageFind: ${JSON.stringify(f)}, pageScrape: ${JSON.stringify(md)}, pageOutcome: { ok: true, intent: 'city', score: 1 }, spotlight: { ok: true } };
  window.cg = { driver: { exec: async (p) => { CALLS.push(p); return { ok: true, result: R[p.action] }; } } };
</script><script src="${pathToFileURL(path.join(ROOT, 'clear-glass/renderer/page-map-panel.js')).href}"></script></body></html>`);
    try {
      const pg = await browser.newPage();
      const errors = []; pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(pathToFileURL(path.join(d, 'index.html')).href);
      await test('PS-06', 'the panel: map from the toolbar, Find with why, Show spotlights, ✓ teaches, Scrape shows markdown', async () => {
        await pg.click('#btn-page-map');
        await pg.waitForFunction(() => /form "Address"/.test(document.getElementById('pm-out').textContent));
        assert.ok(await pg.$eval('#page-map-panel', e => e.classList.contains('visible')));
        assert.ok(/shop\.example\.com\/checkout\/:id/.test(await pg.$eval('#pm-head', e => e.textContent)));
        await pg.fill('#pm-intent', 'type the city'); await pg.click('#pm-find');
        await pg.waitForSelector('.pm-target');
        const first = await pg.$eval('.pm-target', e => e.textContent.replace(/\s+/g, ' '));
        assert.ok(/textbox "City"/.test(first) && /a field/.test(first), first);
        await pg.click('.pm-target button[data-act="show"]');
        await pg.click('.pm-target button[data-act="ok"]');
        await pg.waitForFunction(() => CALLS.some(c => c.action === 'pageOutcome'));
        const calls = await pg.evaluate(() => CALLS);
        const sp = calls.find(c => c.action === 'spotlight'), oc = calls.find(c => c.action === 'pageOutcome');
        assert.ok(sp && sp.selector === f.targets[0].selector, JSON.stringify(sp));
        assert.deepStrictEqual([oc.intent, oc.id, oc.ok], ['type the city', f.targets[0].id, true]);
        await pg.click('#pm-scrape');
        await pg.waitForFunction(() => /# Checkout/.test((document.querySelector('.pm-md') || {}).textContent || ''));
        assert.deepStrictEqual(errors, []);
      });
    } finally { await browser.close(); fs.rmSync(d, { recursive: true, force: true }); }
  }

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
