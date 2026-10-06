'use strict';
// tests/modules/test-workshop-full.test.js — 0.39.354 WS7 the full workshop (docs/2026-10-02-workshop-codex-rewind-phasemap.spec)
// James: "okay spec workshop looks like shit. needs to be enterprise grade. feed the pipeline" · "needs to be a full
// workshop. like a full document writter. emerge. like we talked about. animated, alive, like void, like not a small
// little ui,fully featured,"
//
//   WF-01  the lib: parts in tiers from the spec engine's real blocks; a part kept on add; sections move; modes; each
//          mode says itself in the agent's prompt
//   WF-02  the API hands the page its parts and modes (show, update, feed, decide) and takes a mode
//   — driven by Clear Glass (clear-glass/src/driver/glass.js), never Playwright (AXIOMS §4.1): the REAL page, css and js
//     against a server in this process that answers like idearium, with the REAL lib/workshop.js behind it —
//   WF-03  the start emerges in the Void: the sky drawn, the three sources counted, his workshops as cards; WHAT ARE YOU
//          SPECCING + Enter opens a blank spec in the writer
//   WF-05  the writer: one document; typing is kept as typed (case too); the outline moves a section; remove → kept
//          under REMOVED → restore
//   WF-04  the parts: MINIMUM 0 of 5; manual adds a part with no agent call; assisted adds and drafts it; the draft is a
//          proposal until accepted, then it fills the part and the gauge moves
//   WF-06  STRETCHED carries the idea through every missing part, one at a time — each a proposal, none accepted
//   WF-07  SEND TO THE PIPELINE: save → plan (the agent's run, watched to its end) → the phases in order → BUILD NEXT
//   WF-08  the plan fails → PLAN FROM THE SPEC NOW derives it; the phases still come
//   WF-09  CAPS / AS TYPED; no lowercase tooltip; no browser prompt()/confirm(); the old page archived, not deleted
// No engine on the machine: the browser part is SKIPPED, said, never passed.
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const UI = path.join(ROOT, 'idearium', 'ui');
let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const BLOCKS = require('js-yaml').load(fs.readFileSync(path.join(ROOT, 'idearium/spec-engine/blocks.yaml'), 'utf8')).blocks.map(b => ({ id: b.id, title: b.title }));

// ── a server that answers like idearium, the real workshop lib behind it ───────────────────────────────────────────
function server(WS) {
  const S = { rows: [], calls: [], prompts: [], planFails: false, plan: null, runs: [], built: [] };
  const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.woff2': 'font/woff2' };
  const parts = (w) => WS.partsOf(w, BLOCKS);
  const phases = () => [
    { id: 'P1_schema', key: 'P1', layer: 'foundation', status: 'done', does: 'the schema', axioms: [] },
    { id: 'P2_api', key: 'P2', layer: 'api', status: 'pending', does: 'the routes', axioms: [] },
    { id: 'P3_ui', key: 'P3', layer: 'ui', status: 'pending', does: 'the page', axioms: [] },
  ];
  const planView = () => S.plan ? { ok: true, exists: true, valid: true, problems: [], layers: [], phases: phases(), next: 'P2_api', mapPath: 'spec/x-phasemap.spec', specChanged: false }
    : { ok: true, exists: false, mapPath: 'spec/x-phasemap.spec', layers: ['foundation', 'library', 'api', 'ui'] };
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), p = u.pathname, body = raw ? JSON.parse(raw) : undefined;
      const send = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      const ok = (j) => send(200, { ok: true, ...j }), bad = (code, e) => send(code, { ok: false, error: e });
      if (!p.startsWith('/api/')) {
        const f = path.join(UI, p.replace(/^\//, '')); if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); return res.end(fs.readFileSync(f));
      }
      S.calls.push({ m: req.method, p, q: Object.fromEntries(u.searchParams), body });
      let m;
      if (p === '/api/workshop' && req.method === 'GET') return ok({ count: S.rows.length, workshops: S.rows.map(WS.summary) });
      if (p === '/api/workshop/sources') return ok({ ideas: [{ uuid: 'i1', text: 'A tide clock for the harbour', phase: 'seed' }, { uuid: 'i2', text: 'Spec the drop builder', phase: 'seed' }], library: [{ sha: 'l1', title: 'Old spec', family: 'nexus', sections: 4 }], repos: [{ uuid: 'r9', name: 'eravos', specFiles: ['spec/eravos.spec'] }] });
      if (p === '/api/workshop' && req.method === 'POST') {
        const w = WS.makeSession({ title: body.title || 'Untitled spec', source: body.from || { kind: 'blank' }, sections: [] }).session;
        S.rows.push(w); return ok({ workshop: w });
      }
      if ((m = p.match(/^\/api\/workshop\/([^/]+)(?:\/(feed|save|proposal\/([^/]+)))?$/))) {
        const w = S.rows.find(x => x.uuid === m[1]); if (!w) return bad(404, 'workshop not found');
        if (!m[2] && req.method === 'GET') return ok({ workshop: w, parts: parts(w), modes: WS.MODES });
        if (!m[2]) {
          if (body.title) w.title = body.title;
          if (body.mode != null) { const r = WS.setMode(w, body.mode); if (r.error) return bad(400, r.error); }
          for (const e of body.sections || []) { const r = e.restore ? WS.restoreSection(w, e.restore) : WS.editSection(w, e); if (r.error) return bad(400, r.error); }
          return ok({ workshop: w, parts: parts(w) });
        }
        if (m[2] === 'feed') {
          const fp = WS.feedPrompt(w, body.kind, { sectionId: body.sectionId }); if (fp.error) return bad(400, fp.error);
          S.prompts.push({ kind: body.kind, mode: w.mode, sectionId: body.sectionId, prompt: fp.prompt });
          const s = w.sections.find(x => x.id === body.sectionId);
          const lines = body.kind === 'section' ? [`Draft of ${s.title}: the Tide table keeps every Port.`] : ['Who owns the tide data?', 'What happens offline?'];
          const r = WS.addProposals(w, body.kind, lines, fp.meta || {});
          return ok({ added: r.added, meta: fp.meta, workshop: w, parts: parts(w) });
        }
        if (m[2] === 'save') { w.repoUuid = 'r1'; w.specPath = 'spec/tide-clock.spec'; w.savedAt = Date.now(); return ok({ repoUuid: 'r1', specPath: w.specPath, madeRepo: 'new', created: true, workshop: w }); }
        const r = WS.decide(w, m[3], body); if (r.error) return bad(400, r.error);
        return ok({ proposal: r.proposal, section: r.section || null, workshop: w, parts: parts(w) });
      }
      if (p === '/api/repos/r1/spec/plan' && req.method === 'GET') return ok(planView());
      if (p === '/api/repos/r1/spec/plan') {
        if (body.derive) { S.plan = 'derived'; return ok({ mapPath: 'spec/x-phasemap.spec', state: 'replied', plannedBy: 'derived', phases: 3 }); }
        const runId = `plan-${S.runs.length + 1}`; S.runs.push({ runId, state: 'building' });
        // the agent's run settles on the page's second look
        setTimeout(() => { const r = S.runs.find(x => x.runId === runId); if (S.planFails) Object.assign(r, { state: 'failed', error: 'the agent failed (no model)' }); else { r.state = 'replied'; r.plannedBy = 'agent'; S.plan = 'agent'; } }, 3500);
        return ok({ runId, mapPath: 'spec/x-phasemap.spec', snapshot: 'abc123def4567890', state: 'building' });
      }
      if (p === '/api/repos/r1/plan') return ok({ map: u.searchParams.get('map'), planning: S.runs.slice().reverse() });
      if (p === '/api/repos/r1/spec/build') { S.built.push(body); return ok({ phase: body.phase || 'P2_api', layer: 'api', snapshot: 'feed0123456789', targetName: 'tide-clock', runId: 'run-1', mapPath: 'spec/x-phasemap.spec' }); }
      return bad(404, `no route ${req.method} ${p}`);
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ S, srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

async function main() {
  const WS = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/workshop.js')).href);

  await test('WF-01', 'the lib: parts in tiers from the real blocks, a part kept, sections move, modes said in the prompt', () => {
    assert.strictEqual(BLOCKS.length, 11, 'the spec engine has 11 blocks');
    const w = WS.makeSession({ title: 'Tide clock', sections: [{ id: 'purpose', title: 'Purpose & Intent', body: 'tell the tide' }] }).session;
    assert.strictEqual(w.mode, 'assisted', 'a new workshop is assisted');
    let P = WS.partsOf(w, BLOCKS);
    assert.deepStrictEqual(P.map(p => p.tier), [...Array(5).fill('minimum'), ...Array(5).fill('mods'), 'components']);
    assert.deepStrictEqual(P.filter(p => p.tier === 'minimum').map(p => p.id), ['meta', 'purpose', 'schema', 'api', 'build_order']);
    assert.ok(P.find(p => p.id === 'purpose').filled, 'Purpose & Intent fills purpose by its title');
    const a = WS.editSection(w, { add: true, title: 'Where the data lives', part: 'schema' });
    assert.strictEqual(a.section.part, 'schema');
    P = WS.partsOf(w, BLOCKS); assert.strictEqual(P.find(p => p.id === 'schema').sectionId, a.section.id, 'a section given a part fills it, whatever its title');
    assert.ok(!P.find(p => p.id === 'schema').filled, 'empty until written');
    WS.editSection(w, { id: a.section.id, move: 'up' });
    assert.deepStrictEqual(w.sections.map(s => s.id), [a.section.id, 'purpose']);
    assert.ok(WS.editSection(w, { id: a.section.id, move: 'up' }).error, 'past the top is refused');
    assert.ok(WS.setMode(w, 'wild').error); assert.ok(!WS.setMode(w, 'stretched').error); assert.strictEqual(w.mode, 'stretched');
    assert.match(WS.feedPrompt(w, 'section', { sectionId: 'purpose' }).prompt, /Mode STRETCHED: carry his idea all the way through/);
    WS.setMode(w, 'manual'); assert.match(WS.feedPrompt(w, 'open-loops').prompt, /Mode MANUAL: James writes this spec himself/);
    assert.strictEqual(WS.summary(w).mode, 'manual');
  });

  await test('WF-02', 'the API hands the page its parts and modes, and takes a mode', () => {
    const A = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(A, /async function _workshopParts\(WS, w\)[\s\S]{0,200}WS\.partsOf\(w, se\.SPEC_SECTIONS/);
    assert.match(A, /case 'workshop\.show':[\s\S]{0,400}parts: await _workshopParts\(WS, w\), modes: WS\.MODES/);
    assert.match(A, /case 'workshop\.update':[\s\S]{0,900}WS\.setMode\(w, body\.mode\)[\s\S]{0,700}return ok\(res, \{ workshop: w, parts: await _workshopParts\(WS, w\) \}\)/);
    assert.match(A, /return ok\(res, \{ added: r\.added, meta: r\.meta, workshop: w, parts: await _workshopParts\(WS, w\) \}\)/);
    assert.match(A, /return ok\(res, \{ proposal: r\.proposal, section: r\.section \|\| null, workshop: w, parts: await _workshopParts\(WS, w\) \}\)/);
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.match(app, /d\.subtab === 'phases'\) && typeof setRepoSubtab === 'function'\) setRepoSubtab\(d\.subtab\)/, 'idearium opens the repo on its Phases');
  });

  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - WF-03…WF-08 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 6; }
  else {
    let browser;
    try { browser = await glass.chromium.launch(); }
    catch (e) { console.log(`  - WF-03…WF-08 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 6; browser = null; }
    if (browser) {
      console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
      const { S, srv, url } = await server(WS);
      const old = WS.makeSession({ title: 'Harbour lights', source: { kind: 'idea', id: 'i0' }, sections: [{ id: 'purpose', title: 'Purpose', body: 'x' }] }).session; S.rows.push(old);
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const ws = () => S.rows[S.rows.length - 1];
      const until = (fn, ms = 8000) => page.waitForFunction(fn, undefined, { timeout: ms });
      const waitFor = async (pred, ms = 8000) => { const end = Date.now() + ms; while (!pred()) { if (Date.now() > end) throw new Error('timed out waiting on the server'); await page.waitForTimeout(50); } };
      try {
        await test('WF-03', 'the start emerges in the Void: the sky, the sources counted, his workshops; WHAT ARE YOU SPECCING opens a blank spec', async () => {
          await page.goto(`${url}/workshop.html`);
          await page.waitForSelector('#start .src');
          await until(() => document.getElementById('nIdea').textContent === '2');
          assert.strictEqual(await page.textContent('#nLibrary'), '1'); assert.strictEqual(await page.textContent('#nRepo'), '1');
          const lit = await page.evaluate(() => { const c = document.getElementById('sky'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 20) n++; return { n, w: c.width }; });
          assert.ok(lit.w > 0 && lit.n > 10, `the star field is drawn (${lit.n} lit pixels)`);
          assert.match(await page.textContent('.hero .title'), /THE SPEC WORKSHOP/);
          assert.strictEqual((await page.$$('.wscard')).length, 1); assert.match(await page.textContent('.wscard'), /HARBOUR LIGHTS|Harbour lights/i);
          await page.click('#srcIdea'); await page.waitForSelector('#picker .it[data-id="i1"]');
          await page.click('#picker [data-no]'); await page.waitForSelector('#picker', { state: 'detached' });
          await page.fill('#beginTitle', 'Tide clock');
          await page.click('#beginTitle'); await page.keyboard.press('Enter');
          await page.waitForSelector('#writer .doc-title');
          // the document scrolls smoothly; Clear Glass reads a button's place before the scroll ends, so the test reads it still
          await page.evaluate(() => { document.getElementById('page').style.scrollBehavior = 'auto'; });
          assert.strictEqual(ws().title, 'Tide clock'); assert.deepStrictEqual(ws().source, { kind: 'blank' });
          assert.strictEqual(await page.evaluate(() => document.getElementById('docTitle').value), 'Tide clock');
          assert.match(await page.evaluate(() => location.search), new RegExp(`id=${ws().uuid}`));
          assert.ok(await page.locator('#sendBtn').isVisible(), 'SEND TO THE PIPELINE is in the bar');
          assert.strictEqual(await page.locator('.blk').count(), 1, 'a blank spec opens on its Purpose');
          assert.match(await page.textContent('.blk .pt'), /MINIMUM · PURPOSE & INTENT/, 'the section says which part it fills');
        });

        await test('WF-04', 'the parts: MINIMUM 0 OF 5; manual adds with no agent; assisted adds and drafts; accepted, it fills the part', async () => {
          assert.match(await page.textContent('#minNote'), /MINIMUM 0 OF 5/);
          assert.strictEqual((await page.$$('#parts .part')).length, 11);
          await page.click('.mode[data-mode="manual"]'); await waitFor(() => ws().mode === 'manual'); await until(() => document.querySelector('.mode.on').dataset.mode === 'manual');
          await until(() => document.querySelector('#feeds [data-k="section"]').classList.contains('hidden'));
          const feeds0 = S.prompts.length;
          await page.click('#parts .part[data-part="meta"] .add');
          await until(() => document.querySelectorAll('.blk').length === 2);
          assert.strictEqual(ws().sections[1].part, 'meta'); assert.strictEqual(S.prompts.length, feeds0, 'manual: no agent call');
          await page.click('.mode[data-mode="assisted"]'); await waitFor(() => ws().mode === 'assisted'); await until(() => document.querySelector('.mode.on').dataset.mode === 'assisted');
          await page.click('#parts .part[data-part="schema"] .add');
          await waitFor(() => S.prompts.length === feeds0 + 1);
          const schema = ws().sections.find(x => x.part === 'schema');
          assert.strictEqual(S.prompts[feeds0].kind, 'section'); assert.strictEqual(S.prompts[feeds0].sectionId, schema.id);
          await until(() => document.querySelectorAll('#props .prop').length === 1);
          assert.strictEqual(schema.body, '', 'a draft is a proposal, not the spec');
          assert.match(await page.textContent('#props .prop [data-a="append"]'), /INTO WHERE|INTO DATA SCHEMA/, 'a draft goes into the part it was made for');
          await page.click('#props .prop [data-a="append"]');
          await waitFor(() => schema.body.includes('Tide table'));
          await until(() => /MINIMUM 1 OF 5/.test(document.getElementById('minNote').textContent));
          assert.match(await page.getAttribute('#minGauge i', 'style'), /width: 20%/);
          await page.waitForFunction((i) => document.querySelector(`#blk-${i} .b`).value.includes('Tide table'), schema.id, { timeout: 5000 });
        });

        await test('WF-05', 'the writer: kept as typed, case and all; the outline moves; remove → REMOVED → restore', async () => {
          const id = ws().sections[0].id;
          await page.waitForTimeout(400);   // WF-04's accept jumped to its section (focus lands 250 ms later)
          await page.fill(`#blk-${id} .b`, 'Name: Tide Clock. Owner: James.');
          await waitFor(() => ws().sections[0].body === 'Name: Tide Clock. Owner: James.', 5000);
          assert.ok(await page.evaluate((i) => document.activeElement === document.querySelector(`#blk-${i} .b`), id), 'the caret stays where he is writing');
          const total = ws().sections.reduce((n, s) => n + s.body.trim().split(/\s+/).filter(Boolean).length, 0);
          assert.strictEqual(await page.textContent('#sWords'), String(total), 'the word count is the document\'s');
          await page.click(`#outline .ol[data-id="${id}"]`);
          await page.click(`#outline .ol[data-id="${id}"] [data-mv="down"]`);
          await waitFor(() => ws().sections[1].id === id);
          await page.waitForFunction((i) => document.querySelectorAll('.blk')[1].dataset.id === i && document.querySelectorAll('#outline .ol')[1].dataset.id === i, id, { timeout: 5000 });
          await page.click(`#blk-${id} [data-act="rm"]`); await page.click('.dlg [data-ok]');
          await waitFor(() => ws().removed.length === 1);
          await page.waitForSelector('#removed [data-r]');
          await page.click('#removed [data-r]');
          await waitFor(() => ws().removed.length === 0 && ws().sections.length === 3);
          await page.waitForSelector(`.blk`);
        });

        await test('WF-06', 'STRETCHED carries it through every missing part, one at a time — each a proposal, none accepted', async () => {
          await page.click('.mode[data-mode="stretched"]'); await waitFor(() => ws().mode === 'stretched');
          await page.waitForSelector('#carryBtn');
          const before = S.prompts.length, missing = WS.partsOf(ws(), BLOCKS).filter(p => !p.filled).length;
          await page.click('#carryBtn');
          await waitFor(() => S.prompts.length === before + missing, 20000);
          await until(() => document.getElementById('live').classList.contains('hidden'), 8000);
          assert.ok(S.prompts.slice(before).every(p => p.kind === 'section' && p.mode === 'stretched' && /Mode STRETCHED/.test(p.prompt)));
          assert.strictEqual(new Set(S.prompts.slice(before).map(p => p.sectionId)).size, missing, 'each part once');
          assert.strictEqual(WS.partsOf(ws(), BLOCKS).filter(p => p.sectionId).length, 11, 'every part is a section now');
          assert.strictEqual(ws().proposals.filter(p => p.status === 'accepted').length, 1, 'nothing accepted for him (the one is WF-04\'s)');
          const order = ws().sections.map(s => s.part).filter(Boolean);
          assert.deepStrictEqual(order.slice(-3), ['failure_modes', 'tests', 'registry'], 'the parts arrive in tier order');
        });

        await test('WF-07', 'SEND TO THE PIPELINE: save → the agent plans (watched to its end) → the phases in order → BUILD NEXT', async () => {
          await page.click('#sendBtn');
          await page.waitForSelector('#pipeBack');
          await until(() => document.getElementById('pSave').classList.contains('done'));
          assert.match(await page.textContent('#pSave .s'), /spec\/tide-clock\.spec/);
          await waitFor(() => S.calls.some(c => c.m === 'POST' && c.p === '/api/repos/r1/spec/plan'));
          const post = S.calls.find(c => c.m === 'POST' && c.p === '/api/repos/r1/spec/plan');
          assert.deepStrictEqual(post.body, { path: 'spec/tide-clock.spec', replan: false });
          assert.ok(S.calls.some(c => c.p === '/api/repos/r1/spec/plan' && c.m === 'GET' && c.q.path === 'spec/tide-clock.spec'));
          await until(() => document.getElementById('pPlan').classList.contains('run'));
          await until(() => document.getElementById('pPhases').classList.contains('done'), 15000);
          assert.ok(S.calls.some(c => c.p === '/api/repos/r1/plan' && c.q.map === 'spec/x-phasemap.spec'), 'the run is watched on the plan route');
          assert.deepStrictEqual(await page.$$eval('#pList .ph .ky', els => els.map(e => e.textContent)), ['P1', 'P2', 'P3']);
          assert.ok(await page.evaluate(() => document.querySelector('#pList .ph.next .ky').textContent === 'P2'));
          assert.match(await page.textContent('#pPhases .s'), /1 OF 3 BUILT · NEXT P2/);
          await page.click('#pActs .btn.send');
          await waitFor(() => S.built.length === 1);
          assert.deepStrictEqual(S.built[0], { path: 'spec/tide-clock.spec' });
          await until(() => document.getElementById('pBuild').classList.contains('done'));
          assert.match(await page.textContent('#pMsg'), /P2_api IS BUILDING/);
          assert.match(await page.textContent('#pActs'), /OPEN IN IDEARIUM/);
          await page.click('#pClose'); await page.waitForSelector('#pipeBack', { state: 'detached' });
        });

        await test('WF-08', 'the plan fails → PLAN FROM THE SPEC NOW derives it; the phases still come', async () => {
          S.plan = null; S.planFails = true;
          await page.click('#sendBtn');
          await until(() => document.getElementById('pPlan').classList.contains('bad'), 15000);
          assert.match(await page.textContent('#pMsg'), /THE AGENT FAILED/i);
          await page.evaluate(() => [...document.querySelectorAll('#pActs .btn')].find(b => /PLAN FROM THE SPEC NOW/.test(b.textContent)).click());
          await waitFor(() => S.calls.some(c => c.m === 'POST' && c.p === '/api/repos/r1/spec/plan' && c.body.derive === true));
          await until(() => document.getElementById('pPhases').classList.contains('done'));
          assert.match(await page.textContent('#pPlan .s'), /DERIVED FROM THE SPEC/);
          await page.click('#pClose');
        });

        await test('WF-09', 'CAPS / AS TYPED, his choice kept for him; focus mode', async () => {
          assert.ok(!(await page.evaluate(() => document.body.classList.contains('as-typed'))), 'capitals by default');
          await page.click('#capsBtn');
          assert.ok(await page.evaluate(() => document.body.classList.contains('as-typed') && getComputedStyle(document.querySelector('.blk .b')).textTransform === 'none'));
          assert.strictEqual(await page.evaluate(() => localStorage.getItem('workshop.caps')), 'typed');
          await page.click('#capsBtn');
          assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.blk .b')).textTransform), 'uppercase');
          await page.click('#focusBtn'); assert.ok(await page.evaluate(() => document.body.classList.contains('focus')));
          await page.keyboard.press('Escape'); assert.ok(!(await page.evaluate(() => document.body.classList.contains('focus'))));
        });
      } finally { await browser.close(); srv.close(); }
    }
  }

  await test('WF-10', 'no lowercase tooltip, no browser prompt()/confirm(), the old page archived', () => {
    const html = fs.readFileSync(path.join(UI, 'workshop.html'), 'utf8'), js = fs.readFileSync(path.join(UI, 'js/workshop.js'), 'utf8');
    for (const src of [html, js]) {
      const tips = [...src.matchAll(/title="([^"$]*)"/g)].map(m => m[1]).filter(t => /[a-z]/.test(t));
      assert.deepStrictEqual(tips, [], 'no lowercase tooltip');
      const code = src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      assert.ok(!/\bprompt\(|\bconfirm\(/.test(code));
    }
    assert.match(html, /id="sky"/); assert.match(html, /js\/void-sky\.js/); assert.match(html, /css\/workshop\.css/); assert.match(html, /js\/workshop\.js/);
    assert.ok(fs.existsSync(path.join(UI, '_archive/workshop-0.39.300-ws4.html')), 'the WS4 page is kept (§0.3)');
  });

  console.log(`\nworkshop-full: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped (said above)` : ''}`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
