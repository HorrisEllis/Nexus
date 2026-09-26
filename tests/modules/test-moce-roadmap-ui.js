'use strict';
/**
 * tests/modules/test-moce-roadmap-ui.js — the Roadmap repo subtab (MCO-E),
 * idearium/ui/js/app.js §ROADMAP + index.html.
 *
 * The fake `fetch` stands in for the server, but every body comes from the REAL
 * library (idearium/repo/roadmap.js) over a REAL phasemap file on disk (the real
 * docs/idearium-repository-overhaul-phasemap.spec copied into a temp repo), and
 * an edit really rewrites that file. What is under test is the view and the edit
 * flow. Prints SKIP, counting nothing, if jsdom (a devDependency) is absent.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (_) { console.log('SKIP: jsdom is not installed (devDependency) — Roadmap tab NOT verified'); console.log('\n✓ moce-roadmap-ui: 0 passed, 0 failed (skipped)\n'); process.exit(0); }

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const rm = await import(path.join(ROOT, 'idearium/repo/roadmap.js'));
  const loom = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moceui-'));

  const MAP = 'docs/idearium-repository-overhaul-phasemap.spec';
  const A = { uuid: 'ra', name: 'overhaul', files: [{ path: MAP }] }, dirA = path.join(tmp, 'ra');
  fs.mkdirSync(path.join(dirA, 'docs'), { recursive: true });
  // known starting point: the real file, with the two phases the tests edit set to planned
  // (the real statuses change every session), through the code under test
  fs.writeFileSync(path.join(dirA, MAP), ['MCO-E_roadmap_ui', 'MCO4_hooks_wires_flows_tools'].reduce((tx, id) => rm.setPhaseStatus({ text: tx, mapName: 'idearium-repository-overhaul-phasemap', phaseId: id, status: 'planned' }).text, fs.readFileSync(path.join(ROOT, MAP), 'utf8')));

  const B = { uuid: 'rb', name: 'chain', files: [{ path: 'x-phasemap.spec' }] }, dirB = path.join(tmp, 'rb');
  fs.mkdirSync(dirB, { recursive: true });
  fs.writeFileSync(path.join(dirB, 'x-phasemap.spec'), 'phases:\n  P1_first:\n    status: "NOT STARTED"\n  P2_second:\n    depends_on: [P1, "<img src=x onerror=alert(1)>"]\n    status: "NOT STARTED"\n');

  const C = { uuid: 'rc', name: 'nomap', files: [{ path: 'README.md' }] }, dirC = path.join(tmp, 'rc');
  fs.mkdirSync(dirC, { recursive: true }); fs.writeFileSync(path.join(dirC, 'README.md'), '# hi\n');

  const REPOS = { ra: [A, dirA], rb: [B, dirB], rc: [C, dirC] };
  const calls = []; const bodies = []; let failNext = null;
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body });
  const fakeFetch = async (url, opts = {}) => {
    const u = new URL(String(url)); const method = (opts.method || 'GET').toUpperCase();
    // 0.39.260 — the UI counts itself connected only on idearium's own health body (ok + version)
    if (u.pathname === '/health') return res(200, { ok: true, version: 'test' });
    const m = /^\/api\/repos\/([^/]+)\/roadmap(\/phase)?$/.exec(u.pathname);
    if (!m) return res(200, {});
    calls.push(`${method} ${u.pathname}`);
    const [repo, dir] = REPOS[m[1]] || []; if (!repo) return res(404, { ok: false, error: 'repo not found' });
    if (failNext) { const f = failNext; failNext = null; return res(f.status, { ok: false, error: f.error, detail: f.detail || null }); }
    if (!m[2] && method === 'GET') {
      const c = rm.collectPhasemaps(repo, dir);
      return res(200, { ok: true, repoUuid: repo.uuid, skipped: c.skipped, roadmap: rm.buildRoadmap({ projectId: repo.uuid, maps: c.maps }) });
    }
    const b = JSON.parse(opts.body); bodies.push(b);
    const found = rm.collectPhasemaps(repo, dir).maps.find(x => x.path === b.map);
    if (!found) return res(404, { ok: false, error: 'no phasemap' });
    let edit;
    try { edit = rm.setPhaseStatus({ text: found.text, mapName: b.map.split('/').pop().replace(/\.spec$/, ''), phaseId: b.phase, status: b.status, force: b.force === true, date: '2026-09-20' }); }
    catch (e) { return res(e.code === 'DEPS_INCOMPLETE' ? 409 : e.code === 'NOT_FOUND' ? 404 : e.code === 'ROUNDTRIP_FAILED' ? 422 : 400, { ok: false, error: e.message, detail: { code: e.code, blockers: e.blockers || null } }); }
    fs.writeFileSync(path.join(dir, b.map), edit.text);
    const c = rm.collectPhasemaps(repo, dir);
    return res(200, { ok: true, repoUuid: repo.uuid, change: { map: b.map, phase: b.phase, after: b.status }, skipped: c.skipped, roadmap: rm.buildRoadmap({ projectId: repo.uuid, maps: c.maps }) });
  };

  const UI = path.join(ROOT, 'idearium/ui');
  const dom = new JSDOM(fs.readFileSync(path.join(UI, 'index.html'), 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:4800/ui/index.html' });
  const { window } = dom;
  window.fetch = fakeFetch; window.EventSource = function () { this.close = () => {}; this.addEventListener = () => {}; };
  window.requestAnimationFrame = () => 0; window.HTMLCanvasElement.prototype.getContext = () => null;
  window.eval(fs.readFileSync(path.join(UI, 'js/app.js'), 'utf8') + `
    window.__ui = {
      use(r) { API_BASE = 'http://localhost:4800'; CONNECTED = true; CURRENT_API_REPO = r; API_REPOS = [r]; },
      open() { setRepoSubtab('roadmap'); },
      sub(n) { setRepoSubtab(n); },
      event(ev) { return refreshOnEvent(ev); },
      pick(sel, value) { sel.value = value; return setRoadmapPhaseStatus(sel); },
    };`);
  const d = window.document, q = (s) => d.querySelector(s), qa = (s) => [...d.querySelectorAll(s)];
  const panel = () => q('#repo-subtab-roadmap'); const text = () => panel().textContent; const settle = () => sleep(150);
  const toastText = () => qa('#toast-area .toast').map(x => x.textContent).join(' | ');
  const selFor = (key) => qa('.rm-status').find(s => s.dataset.phase.startsWith(key + '_'));
  const diskStatus = (dir, file, id) => loom.parsePhasemapText(fs.readFileSync(path.join(dir, file), 'utf8'), 'm').find(p => p.id === id).status;

  console.log('\n── structure ────────────────────────────────────────────');
  await t('a Roadmap nav button and its panel exist; every nav button still has a panel', () => {
    assert.ok(q('.repo-subtab-btn[data-subtab="roadmap"]') && panel());
    for (const b of qa('.repo-subtab-btn')) assert.ok(q(`#repo-subtab-${b.dataset.subtab}`), b.dataset.subtab);
  });

  console.log('\n── the real overhaul phasemap, rendered ─────────────────');
  window.__ui.use(A); window.__ui.open(); await settle();
  const road = rm.buildRoadmap({ projectId: 'ra', maps: rm.collectPhasemaps(A, dirA).maps });
  await t('every phase is a row, in dependency order, with its real status in the control', () => {
    const rows = qa('.rm-status');
    assert.strictEqual(rows.length, road.phases.length);
    assert.deepStrictEqual(rows.map(s => s.dataset.phase), road.phases.map(p => p.phase_key));
    for (const p of road.phases) assert.strictEqual(rows.find(s => s.dataset.phase === p.phase_key).value, p.status, p.phase_key);
  });
  await t('the summary line and progress match the data', () => {
    const S = road.summary;
    assert.ok(text().includes(`${S.total} phases in 1 phasemap`));
    assert.ok(text().includes(`${S.complete} complete · ${S.active} active · ${S.planned} planned`));
    assert.ok(text().includes(`${S.ready} ready to start · ${S.blocked} blocked`));
  });
  await t('layers are labelled, layer 0 first; a ready phase says ready; a done one says nothing', () => {
    assert.ok(/layer 0 — no dependencies/.test(text()));
    const roadmapEdit = selFor('MCO-E').closest('.rm-row');
    assert.ok(/ready/.test(roadmapEdit.textContent) && /after MCO-A/.test(roadmapEdit.textContent), roadmapEdit.textContent);
    assert.ok(!/ready|blocked/.test(selFor('MCO0').closest('.rm-row').textContent));
  });

  console.log('\n── editing a status ─────────────────────────────────────');
  const before = fs.readFileSync(path.join(dirA, MAP), 'utf8');
  await window.__ui.pick(selFor('MCO-E'), 'active'); await settle();
  await t('picking "active" writes the phasemap FILE, and loom\'s parser reads the change from disk', () => {
    assert.strictEqual(diskStatus(dirA, MAP, 'MCO-E_roadmap_ui'), 'in-progress');
    assert.ok(/# roadmap edit 2026-09-20/.test(fs.readFileSync(path.join(dirA, MAP), 'utf8')));
  });
  await t('every other phase is untouched on disk (as loom reads them)', () => {
    const sig = (tx) => loom.parsePhasemapText(tx, 'm').filter(p => p.id !== 'MCO-E_roadmap_ui').map(p => `${p.id}|${p.status}|${p.dependsOn}`);
    assert.deepStrictEqual(sig(fs.readFileSync(path.join(dirA, MAP), 'utf8')), sig(before));
  });
  await t('the tab repaints from the server\'s answer: control shows active, counts moved, a toast says it was read back', () => {
    assert.strictEqual(selFor('MCO-E').value, 'active');
    assert.ok(/1 active/.test(text()));
    assert.ok(/MCO-E: planned → active/.test(toastText()) && /read back/.test(toastText()), toastText());
  });
  await window.__ui.pick(selFor('MCO-E'), 'planned'); await settle();
  await t('and back to planned', () => assert.strictEqual(diskStatus(dirA, MAP, 'MCO-E_roadmap_ui'), 'pending'));

  console.log('\n── a blocked phase, force, and refusals ─────────────────');
  window.__ui.use(B); window.__ui.open(); await settle();
  await t('a chain shows blocked-by on the dependent and ready on the first', () => {
    assert.ok(/ready/.test(selFor('P1').closest('.rm-row').textContent));
    assert.ok(/blocked by P1/.test(selFor('P2').closest('.rm-row').textContent));
  });
  await t('a dependency that is not a phase is listed under notes, and HTML in it is escaped', () => {
    assert.ok(/notes \(1\)/.test(text()) && /not a phase here/.test(text()));
    assert.strictEqual(panel().querySelectorAll('img').length, 0, 'an <img> was injected');
    assert.ok(text().includes('<img src=x onerror=alert(1)>'));
  });
  window.confirm = () => false;
  const nb = bodies.length;
  await window.__ui.pick(selFor('P2'), 'complete'); await settle();
  await t('marking it complete while P1 is not: the server refuses (409), the UI asks, and DECLINING changes nothing', () => {
    assert.strictEqual(bodies.length, nb + 1); assert.strictEqual(bodies[nb].force, false);
    assert.strictEqual(selFor('P2').value, 'planned', 'the control must revert');
    assert.strictEqual(diskStatus(dirB, 'x-phasemap.spec', 'P2_second'), 'pending');
  });
  window.confirm = (m) => { window.__msg = m; return true; };
  await window.__ui.pick(selFor('P2'), 'complete'); await settle();
  await t('accepting resends with force:true and the file changes; the question named the blocker', () => {
    assert.ok(/P1_first/.test(window.__msg) && /anyway/.test(window.__msg), window.__msg);
    assert.strictEqual(bodies[bodies.length - 1].force, true);
    assert.strictEqual(diskStatus(dirB, 'x-phasemap.spec', 'P2_second'), 'done');
    assert.strictEqual(selFor('P2').value, 'complete');
  });
  await t('a server refusal other than that (e.g. 422 the phasemap cannot be read back) reverts the control and shows the reason', async () => {
    failNext = { status: 422, error: 'loom reads P1_first as pending after the edit; nothing was changed.', detail: { code: 'ROUNDTRIP_FAILED' } };
    await window.__ui.pick(selFor('P1'), 'complete'); await settle();
    assert.strictEqual(selFor('P1').value, 'planned');
    assert.ok(/not changed: loom reads P1_first/.test(toastText()), toastText());
    assert.strictEqual(diskStatus(dirB, 'x-phasemap.spec', 'P1_first'), 'pending');
  });
  await t('the control is usable again after a failure', () => assert.strictEqual(selFor('P1').disabled, false));

  console.log('\n── empty, live refresh, stale guard ─────────────────────');
  window.__ui.use(C); window.__ui.open(); await settle();
  await t('a repo with no phasemap: says so and how a roadmap is found, no controls', () => {
    assert.ok(/no phases found/.test(text()) && /phasemap/.test(text()));
    assert.strictEqual(qa('.rm-status').length, 0);
  });
  window.__ui.use(A); window.__ui.open(); await settle();
  await t('a roadmap.updated event for this repo re-reads it; one for another repo does not', async () => {
    const n = calls.length;
    window.__ui.event({ type: 'idearium.repo.roadmap.updated', payload: { repoUuid: 'ra' } }); await settle();
    assert.ok(calls.length > n);
    const n2 = calls.length;
    window.__ui.event({ type: 'idearium.repo.roadmap.updated', payload: { repoUuid: 'other' } }); await settle();
    assert.strictEqual(calls.length, n2);
  });
  await t('leaving the tab while a load is in flight does not paint over the new tab', async () => {
    window.__ui.open(); window.__ui.sub('home'); await settle();
    assert.ok(!/phases in \d+ phasemap/.test(d.querySelector('#repo-subtab-home').textContent));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${fail ? '✗' : '✓'} moce-roadmap-ui: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
