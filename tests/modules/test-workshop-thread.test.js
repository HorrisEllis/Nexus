'use strict';
/**
 * tests/modules/test-workshop-thread.test.js — RS11 (docs/2026-10-05-spec-workshop-rebuild-phasemap.spec), 0.51.0.
 * James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected"
 *
 *   WT-01  the workshop's own spec text (lib/workshop.js specText) is read as its sections by lib/spec-document.js, its
 *          ids the section ids; planned (spec-plan derivePlan) and threaded (idearium/repo/thread.js) — each section names
 *          its phases, and an edited section stales only its own
 *   — driven by Clear Glass: the REAL workshop.html, css and js, against a server in this process that answers like
 *     idearium, the REAL lib/workshop.js, spec-plan, spec-document and thread behind it —
 *   WT-02  a saved workshop: each section shows its phases (key and state) and the outline its dots; a section with no
 *          phase says it is not in one yet
 *   WT-03  a section changed since it was planned says so (↻), and its dot is marked; a planned section edited but not
 *          saved says how many phases saving changes
 *   WT-04  ?block= opens the workshop at that section; a phase opens idearium on its Phases, with the spec and the phase
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const UI = path.join(ROOT, 'idearium', 'ui');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

(async () => {
  const WS = await import(path.join(ROOT, 'idearium/lib/workshop.js'));
  const SP = await import(path.join(ROOT, 'idearium/repo/spec-plan.js'));
  const TH = await import(path.join(ROOT, 'idearium/repo/thread.js'));
  const D = require(path.join(ROOT, 'lib/spec-document.js'));
  const P = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
  const yaml = require('js-yaml');

  const w = WS.makeSession({ title: 'Tide clock', sections: [] }).session;
  for (const [title, body] of [['Schema', 'A tide record: port, height, time.'], ['Storage', 'Tides kept in a JAA table, one node per port.'], ['API', 'GET /tides/:port returns the next tide.'], ['Notes', '']]) WS.editSection(w, { add: true, title, body });
  const all = w.sections.map(s => s.id);   // purpose (the idea's framing), schema, storage, api, notes (bookkeeping)
  const ids = ['schema', 'storage', 'api'];
  const SPEC = 'spec/tide-clock.spec';
  const text0 = WS.specText(w, yaml);
  const plan = SP.derivePlan({ specPath: SPEC, specText: text0, prefix: 'TC' });
  const MAP = 'spec/tide-clock-phasemap.spec';
  const threadOf = (text) => TH.thread({ specPath: SPEC, specText: text, maps: [{ path: MAP, text: plan.text }], runs: [{ map: MAP, phase: P.parsePhasemapText(plan.text, MAP)[0].id, state: 'escalating', provider: 'ollama:q:7b', rung: 2, rungs: 3, ts: 1 }], pending: [], parsePhases: P.parsePhasemapText, doc: D, sha: D.sha });

  await test('WT-01', 'the workshop spec read as its sections; planned and threaded; an edit stales only its own', () => {
    const doc = D.parse(text0, { path: SPEC });
    assert.strictEqual(doc.format, 'sections'); assert.strictEqual(D.serialize(doc), text0);
    assert.deepStrictEqual(doc.blocks.filter(b => b.kind === 'section').map(b => b.id), all);
    assert.deepStrictEqual(doc.blocks.filter(b => b.kind === 'section' && D.isBookkeeping(b)).map(b => b.id), ['purpose', 'notes'], 'the framing and the notes are not things to build');
    assert.ok(plan.ok, JSON.stringify(plan.problems));
    const planned = [...new Set(P.parsePhasemapText(plan.text, MAP).flatMap(x => x.blocks))].sort();
    assert.deepStrictEqual(planned, ['api', 'schema', 'storage']);
    const t = threadOf(text0);
    for (const id of ids.slice(0, 3)) assert.ok(t.spec.blocks.find(b => b.id === id).planned, `${id} planned`);
    assert.strictEqual(t.summary.stalePhases, 0);
    const w2 = JSON.parse(JSON.stringify(w)); WS.editSection(w2, { id: ids[1], body: 'Tides kept in a JAA table, one node per port, indexed by day.' });
    const t2 = threadOf(WS.specText(w2, yaml));
    assert.deepStrictEqual(t2.spec.blocks.filter(b => b.stale).map(b => b.id), [ids[1]]);
  });

  // the page, against a server that answers like idearium
  const S = { calls: [], text: text0 };
  w.repoUuid = 'r1'; w.specPath = SPEC; w.savedAt = Date.now();
  const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), p = u.pathname, body = raw ? JSON.parse(raw) : undefined;
      const send = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      const ok = (j) => send(200, { ok: true, ...j });
      if (!p.startsWith('/api/')) {
        const f = path.join(UI, p.replace(/^\//, '')); if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); return res.end(fs.readFileSync(f));
      }
      S.calls.push({ m: req.method, p, q: Object.fromEntries(u.searchParams), body });
      if (p === '/api/workshop' && req.method === 'GET') return ok({ count: 1, workshops: [WS.summary(w)] });
      if (p === `/api/workshop/${w.uuid}` && req.method === 'GET') return ok({ workshop: w, parts: [], modes: WS.MODES });
      if (p === `/api/workshop/${w.uuid}`) { for (const e of (body && body.sections) || []) WS.editSection(w, e); return ok({ workshop: w, parts: [] }); }
      if (p === '/api/repos/r1/thread' && u.searchParams.get('spec') === SPEC) return ok({ repoUuid: 'r1', workshop: { uuid: w.uuid, title: w.title }, ...threadOf(S.text) });
      return send(404, { ok: false, error: `no route ${req.method} ${p}` });
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;

  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - WT-02…WT-04 SKIPPED: Clear Glass has no engine here — the browser checks did not run'); skipped += 3; srv.close(); return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - WT-02…WT-04 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 3; srv.close(); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/workshop.html?id=${w.uuid}&block=${ids[2]}`);
    await page.waitForSelector(`#blk-${ids[0]} .thr .thr-ph`);

    await test('WT-02', 'each section its phases and their state; the outline\'s dots; a section with no phase says so', async () => {
      const strips = await page.$$eval('.blk', els => els.map(e => [e.dataset.id, (e.querySelector('.thr') || {}).textContent || '']));
      const by = Object.fromEntries(strips);
      assert.ok(/1 PHASE/.test(by[ids[0]]) && /TC0/.test(by[ids[0]]) && /ESCALATING/.test(by[ids[0]]), by[ids[0]]);
      assert.ok(/1 PHASE/.test(by[ids[1]]) && /PLANNED/.test(by[ids[1]]), by[ids[1]]);
      assert.strictEqual(by.purpose, '', 'the framing: context for every phase, nothing said');
      assert.strictEqual(by.notes, '');
      const dots = await page.$$eval('#outline .ol', els => els.map(e => [e.dataset.id, e.querySelectorAll('.phd i').length, e.querySelector('.phd i.busy') ? 'busy' : '']));
      assert.deepStrictEqual(dots.map(d => [d[0], d[1]]), [['purpose', 0], ['schema', 1], ['storage', 1], ['api', 1], ['notes', 0]]);
      assert.strictEqual(dots[1][2], 'busy', 'a phase mid-run shows busy');
      const thr = S.calls.find(c => c.p === '/api/repos/r1/thread');
      assert.ok(thr && thr.q.spec === SPEC, 'the thread of the saved spec was read');
    });

    await test('WT-03', 'a section changed since planned says ↻; a planned section edited and not saved says what saving changes', async () => {
      const w2 = JSON.parse(JSON.stringify(w)); WS.editSection(w2, { id: ids[1], body: 'Tides kept in a JAA table, one node per port, indexed by day.' });
      S.text = WS.specText(w2, yaml);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForSelector(`#blk-${ids[1]} .thr-stale`);
      assert.ok(/CHANGED SINCE IT WAS PLANNED/.test(await page.textContent(`#blk-${ids[1]} .thr`)));
      assert.strictEqual(await page.$$eval(`#outline .ol[data-id="${ids[1]}"] .phd i.stale`, e => e.length), 1);
      assert.strictEqual(await page.$$eval(`#blk-${ids[0]} .thr-stale`, e => e.length), 0, 'the others are not stale');
      await page.evaluate((id) => { const b = document.querySelector(`#blk-${id} .b`); b.focus(); b.value += ' And POST /tides.'; b.dispatchEvent(new Event('input', { bubbles: true })); }, ids[2]);   // typing, as the page hears it
      await page.waitForFunction((id) => /SAVING THIS CHANGES 1 PLANNED PHASE/.test(document.querySelector(`#blk-${id} .thr`).textContent), ids[2]);
    });

    await test('WT-04', '?block= opens at the section; a phase opens idearium on its Phases with the spec and the phase', async () => {
      assert.strictEqual(await page.evaluate(() => window.WORKSHOP && document.querySelector('.blk.on') && document.querySelector('.blk.on').dataset.id), ids[2]);
      const sent = await page.evaluate(() => { const got = []; Object.defineProperty(window, 'opener', { configurable: true, value: { closed: false, postMessage: (m) => got.push(m) } }); window.__got = got; return true; });
      assert.ok(sent);
      // the page opened at the API section (?block=): the Schema section's strip is scrolled out of view — bring it in, then click it as a person would
      // the page scrolls smoothly (it animates its jumps): the driver takes its coordinates while it still moves — stop the
      // animation for the test, so the click lands where the button is (found: it landed on the title input above it)
      await page.evaluate((id) => { const st = document.createElement('style'); st.textContent = '*{scroll-behavior:auto!important}'; document.head.appendChild(st); document.querySelector(`#blk-${id} .thr-ph`).scrollIntoView({ block: 'center' }); }, ids[0]);
      await page.waitForTimeout(150);
      await page.click(`#blk-${ids[0]} .thr-ph`);
      await page.waitForTimeout(200);
      const msg = await page.evaluate(() => window.__got[0]);
      const hit = await page.evaluate((id) => { const b = document.querySelector(`#blk-${id} .thr-ph`); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vh: innerHeight, vw: innerWidth, at: e ? `${e.tagName}.${e.className}#${e.id}` : null, inside: !!(e && (e === b || b.contains(e))) }; }, ids[0]);
      assert.ok(msg, `the click sent idearium a message — ${JSON.stringify(hit)}`);
      assert.deepStrictEqual([msg.type, msg.repoUuid, msg.subtab, msg.spec, /^TC0_/.test(msg.phase)], ['nexus:repo.open', 'r1', 'phases', SPEC, true]);
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); srv.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
