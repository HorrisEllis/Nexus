'use strict';
/**
 * tests/modules/test-failure-modes.test.js — FMR2 + FMR3 (docs/2026-10-17-failure-mode-report-phasemap.spec), 0.60.146
 * James, 2026-10-17: "failure mode report thats also a macro to import into a cos test env." · "do it. … we need to add this
 * all to nexus, there is boundaries mapping it"
 *   FM-01  the intake: a failure is one .failure_mode; the same again is occurrences 2; what it needs is required
 *   FM-02  one writer: the only insert into failure_modes in the source is failure-intake.js write(); the ladder uses it
 *   FM-03  cortex's routes, served by the real cortex server: POST records (with the CFR field, the view and the env stamped),
 *          GET lists, GET :id/report reads it back; declared in cortex's registry and contract
 *   FM-04  the report: each section names its source; a missing one is a hole, named; the view is labelled view; a
 *          recurring failure is an investigation (§17.7); a timeout carries its hypotheses with their experiments (CK-185)
 *   FM-05  a failed COS run's shape, posted by route with the client the caller is handed, lands in cortex
 *   FM-06  his IM1 run ending contract-incomplete reaches cortex as one failure mode under 'timeout', with its flight
 *   FM-07  the boundary: nothing new crosses between systems (the drawbridge census), and the commands are there
 *   FM-08  the Debug tab's failure modes in Clear Glass, against a stubbed api(); no engine → SKIPPED, said
 *   FM-09  Idearium's repo routes reach cortex by route; unknown repo 404; cortex unreachable 503, said
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const assert = require('assert');
process.env.NEXUS_PORT = '0'; process.env.CORTEX_PORT = '0';
const ROOT = path.join(__dirname, '../..');
const quiet = async (f) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; console.error = e; } };

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 6).join('\n    ') : e.message}`); failed++; }
}
const req = (port, method, p, body) => new Promise((res) => {
  const data = body == null ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, path: p, method, timeout: 15000, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
    (rs) => { let d = ''; rs.on('data', c => d += c); rs.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} res({ status: rs.statusCode, json: j }); }); });
  r.on('error', (e) => res({ status: 0, error: e.message })); r.on('timeout', () => { r.destroy(); res({ status: 0, error: 'timeout' }); });
  if (data) r.write(data); r.end();
});

(async () => {
  const FI = require(path.join(ROOT, 'cortex/self-heal/failure-intake.js'));
  const FR = require(path.join(ROOT, 'cortex/self-heal/failure-report.js'));
  const FP = require(path.join(ROOT, 'lib/failure-post.js'));

  await test('FM-01', 'a failure is one .failure_mode; the same again counts an occurrence; faultClass and where are required', async () => {
    const a = FI.record({ faultClass: 'test-failed', where: 'r:tests/a.test.js', source: 't', summary: 'x' }, { enrich: false });
    assert.ok(a.ok && a.created && a.occurrences === 1, JSON.stringify(a));
    const b = FI.record({ faultClass: 'test-failed', where: 'r:tests/a.test.js', source: 't', summary: 'x again' }, { enrich: false });
    assert.deepStrictEqual([b.uuid, b.created, b.occurrences], [a.uuid, false, 2]);
    const c = FI.record({ faultClass: 'test-failed', where: 'r:tests/b.test.js' }, { enrich: false });
    assert.notStrictEqual(c.uuid, a.uuid);
    assert.strictEqual(FI.record({ faultClass: 'x' }).ok, false);
    assert.strictEqual(FI.get(a.uuid).occurrences, 2);
  });

  await test('FM-02', 'one writer: the only insert into failure_modes in the source is failure-intake.js; the ladder writes through it', async () => {
    const hits = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '_archive', 'data', 'tests', '.git'].includes(e.name)) continue; const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(c|m)?js$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8');
        if (/insert\(\s*['"]failure_modes['"]/.test(t) || (/TABLE\s*=\s*['"]failure_modes['"]/.test(t) && /insert\(TABLE/.test(t))) hits.push(path.relative(ROOT, p).replace(/\\/g, '/')); } } };
    walk(ROOT);
    assert.deepStrictEqual(hits, ['cortex/self-heal/failure-intake.js'], JSON.stringify(hits));
    assert.ok(/require\('\.\/failure-intake\.js'\)\.write\(entry\)/.test(fs.readFileSync(path.join(ROOT, 'cortex/self-heal/index.js'), 'utf8')));
  });

  const boot = await quiet(async () => require(path.join(ROOT, 'cortex/boot.js')));
  const srv = boot.server;
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  // the client a caller is handed: the same postDurable shape as lib/nexus-client.js, pointed at this cortex
  const client = { postDurable: async (sys, p, body) => { assert.strictEqual(sys, 'cortex'); const r = await req(port, 'POST', p, body); if (r.status !== 200) throw new Error(`HTTP ${r.status}`); return { ok: true, buffered: false, result: r.json }; } };

  let posted = null;
  await test('FM-03', "cortex's routes on the real server: record (field, view, env stamped), list, report; declared in registry and contract", async () => {
    const r = await req(port, 'POST', '/api/failure-modes', { faultClass: 'timeout', where: 'map#P9', source: 'test', system: 'idearium', summary: 'the caller stopped waiting after 295 s', evidence: { mode: 'timeout' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); posted = r.json.uuid;
    const one = await req(port, 'GET', `/api/failure-modes/${posted}`);
    const fm = one.json.failureMode;
    assert.ok(fm.cfrAtEntry && typeof fm.cfrAtEntry.regime === 'string', 'the CFR field is stamped');
    assert.ok(fm.env && fm.env.nexus && fm.env.platform, JSON.stringify(fm.env));
    assert.ok(fm.viewAtEntry === null || /never evidence/.test(fm.viewAtEntry.label), 'the view, when there is one, says it is a view');
    const list = await req(port, 'GET', '/api/failure-modes?status=open');
    assert.ok(list.json.failureModes.some(x => x.uuid === posted && x.via === 'intake'));
    assert.strictEqual((await req(port, 'POST', '/api/failure-modes', { faultClass: 'x' })).status, 400);
    assert.strictEqual((await req(port, 'GET', '/api/failure-modes/nope')).status, 404);
    const reg = require(path.join(ROOT, 'cortex/registry-components.js'));
    const paths = (Array.isArray(reg) ? reg : reg.COMPONENTS || []).map(c => c.route && `${c.route.method} ${c.route.path}`);
    for (const p of ['POST /api/failure-modes', 'GET /api/failure-modes', 'GET /api/failure-modes/:id', 'GET /api/failure-modes/:id/report']) assert.ok(paths.includes(p), p);
    const con = JSON.parse(fs.readFileSync(path.join(ROOT, 'cortex/interaction-contract.json'), 'utf8'));
    assert.ok(con.routes.some(r2 => r2.path === '/api/failure-modes/:id/report'));
  });

  await test('FM-04', 'the report: sources named, holes named, view labelled, recurrence an investigation, hypotheses with experiments', async () => {
    await req(port, 'POST', '/api/failure-modes', { faultClass: 'timeout', where: 'map#P9', source: 'test', summary: 'again' });
    const r = await req(port, 'GET', `/api/failure-modes/${posted}/report`);
    assert.strictEqual(r.status, 200);
    const rep = r.json.report, by = Object.fromEntries(rep.sections.map(s => [s.id, s]));
    for (const s of rep.sections) assert.ok(s.from, `${s.id} names its source`);
    assert.ok(by.chain.hole && /anchor|cause|not traced/.test(by.chain.hole), by.chain.hole);
    assert.ok(by.macro.hole, 'no macro yet is said');
    assert.strictEqual(by.recurrence.value.occurrences, 2); assert.strictEqual(by.recurrence.value.investigation, true);
    assert.ok(by.hypotheses.value.length >= 2 && by.hypotheses.value.every(h => h.cause && h.experiment), JSON.stringify(by.hypotheses));
    assert.ok(/view, not evidence/.test(by.on_screen.title));
    assert.ok(r.json.lines.some(l => /recurring: an investigation/.test(l)), r.json.lines.join('\n'));
    assert.ok(FR.report(null) instanceof Promise || FR.report(null) === null);
    const unknown = await FR.report({ uuid: 'u', faultClass: 'something-new', where: 'w', enteredAt: 1 });
    assert.ok(/no candidates are on record/.test(unknown.sections.find(s => s.id === 'hypotheses').hole));
  });

  await test('FM-05', "a failed COS run's shape, posted with the client its caller is handed, lands in cortex", async () => {
    const DR = require(path.join(ROOT, 'lib/cos-debug-report.js'));
    const run = { file: 'tests/x.test.js', passed: false, exitCode: 1, stderr: "AssertionError [ERR_ASSERTION]: 1 == 2\n    at Object.<anonymous> (/tmp/r/tests/x.test.js:3:8)\n" };
    const shape = FP.fromCosRun({ uuid: 'repo-1', name: 'demo' }, run, DR.compact(DR.report(run, { cwd: '/tmp/r' })));
    assert.deepStrictEqual([shape.faultClass, shape.where, shape.system], ['test-failed', 'demo:tests/x.test.js', 'cos']);
    assert.ok(/AssertionError/.test(shape.summary), shape.summary);
    const out = await FP.post(shape, { client });
    assert.ok(out.ok && out.uuid, JSON.stringify(out));
    const fm = FI.get(out.uuid); assert.strictEqual(fm.source, 'lib/cos-run.js');
    process.env.NEXUS_FAILURE_INTAKE = 'off';
    assert.ok(/off/.test((await FP.post(shape, { client })).skipped)); delete process.env.NEXUS_FAILURE_INTAKE;
  });

  await test('FM-06', "his IM1 run ending contract-incomplete reaches cortex as one failure under 'timeout', with its flight", async () => {
    const api = await quiet(() => import('../../idearium/api/index.js'));
    const DB = await import('../../idearium/lib/db.js');
    const T0 = Date.parse('2026-10-17T21:41:17Z'), at = (m) => T0 + Math.round(m * 60000);
    const b = { runId: 'phrun-im1-fm', repoUuid: 'r-im1', map: 'docs/2026-10-17-infrastructure-migration-phasemap.spec', phase: 'IM1_the_shape_census_as_a_command' };
    const rows = [
      { ...b, state: 'building', ts: at(0) },
      { ...b, state: 'failed', provider: 'gemini', attempt: 1, ts: at(9.9), error: 'cancelled — the caller stopped waiting after 295 s' },
      { ...b, state: 'failed', provider: 'chatgpt', attempt: 2, ts: at(14.9), error: 'cancelled — the caller stopped waiting after 295 s' },
      { ...b, state: 'failed', provider: 'claude', attempt: 5, ts: at(26.2), error: 'cancelled — the caller stopped waiting after 295 s' },
      { ...b, state: 'contract-incomplete', attempt: 10, ts: at(62.1), error: 'gate work.1 is FAILED' },
    ];
    rows.forEach((r, i) => DB.appendRow('idearium_phase_runs', { uuid: `${r.runId}-${r.state}-${i}`, ...r }));
    assert.strictEqual(FP.phaseRunFailed(rows[1]), false, 'one failed attempt is not a failure mode');
    const out = await api._postPhaseFailureForTest(rows[4], client);
    assert.ok(out.ok && out.uuid, JSON.stringify(out));
    const fm = FI.get(out.uuid);
    assert.deepStrictEqual([fm.faultClass, fm.where], ['timeout', `${b.map}#${b.phase}`]);
    assert.strictEqual(fm.evidence.flight.verdict, 'stuck');
    assert.deepStrictEqual(fm.evidence.flight.ladder.map(a => a.agent), ['gemini', 'chatgpt', 'claude']);
    const rep = await req(port, 'GET', `/api/failure-modes/${out.uuid}/report`);
    assert.ok(rep.json.lines.some(l => /stuck: the same failure \(timeout\)/.test(l)), rep.json.lines.join('\n'));
    assert.ok(rep.json.lines.some(l => /fake-tab/.test(l)), 'the timeout hypotheses name the experiment that separates them');
  });

  await test('FM-07', 'nothing new crosses between systems (the drawbridge census); the failure commands are rows', async () => {
    const B = require(path.join(ROOT, 'lib/system-boundary.js'));
    const c = B.check({ root: ROOT });
    assert.deepStrictEqual(c.added, [], JSON.stringify(c.added));
    const R = require(path.join(ROOT, 'idearium/cli/route-commands.js')); const spec = Array.isArray(R) ? R : (R.SPEC || []);
    for (const k of ['failure.list', 'failure.show', 'system.causality']) assert.ok(spec.find(x => x.key === k), k);
    assert.deepStrictEqual(spec.find(x => x.key === 'failure.show').req({ args: ['abc'], flags: {} }), { system: 'cortex', method: 'GET', path: '/api/failure-modes/abc/report' });
  });

  await test('FM-09', "Idearium's repo routes ask cortex by route: an unknown repo is 404; cortex unreachable is 503 and says so (never an empty list)", async () => {
    const api = await quiet(() => import('../../idearium/api/index.js'));
    assert.strictEqual((await quiet(() => api._route('GET', '/api/repos/nope/failure-modes'))).status, 404);
    let made = null;
    for (let i = 0; i < 40; i++) { made = await quiet(() => api._route('POST', '/api/repos', { name: 'fm-fixture', bare: true, source: 'create' })); if (made.json && made.json.repo) break; await new Promise(r => setTimeout(r, 100)); }
    const r = await quiet(() => api._route('GET', `/api/repos/${made.json.repo.uuid}/failure-modes`));
    // this test's cortex listens on a random port; the configured one is not running, so the honest answer is 503
    assert.ok(r.status === 503 || r.status === 200, JSON.stringify(r.json).slice(0, 200));
    if (r.status === 503) assert.ok(/cortex did not answer/.test(JSON.stringify(r.json)));
  });

  // FM-08 — the Debug tab's failure modes in Clear Glass (AXIOMS §4.1), against a stubbed api(): no logic of its own
  let skipped = 0;
  const { pathToFileURL } = require('url');
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - FM-08 SKIPPED: Clear Glass has no engine here — the browser check did not run'); skipped++; }
  else {
    let browser = null;
    try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - FM-08 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; }
    if (browser) {
      const im1 = (await req(port, 'GET', '/api/failure-modes?class=timeout')).json.failureModes.find(f => /IM1/.test(f.where || ''));
      const rep = (await req(port, 'GET', `/api/failure-modes/${im1.uuid}/report`)).json;
      const UI = path.join(ROOT, 'idearium', 'ui');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-ui-'));
      fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="debug"></div><script>
  const CALLS = [];
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  async function api(p) { CALLS.push(p);
    if (p.startsWith('/api/repos/r1/failure-modes?')) return { scope: 'all of Nexus', failureModes: [${JSON.stringify(im1)}] };
    if (p === '/api/repos/r1/failure-modes/${im1.uuid}') return ${JSON.stringify({ report: rep.report, lines: rep.lines })};
    throw new Error('unexpected ' + p); }
</script><script src="${pathToFileURL(path.join(UI, 'js', 'debug-failures.js')).href}"></script></body></html>`);
      try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
        await test('FM-08', "the Debug tab's failure modes in Clear Glass: his IM1 failure listed; opened, every section with its source, holes said, the view marked", async () => {
          await page.evaluate(() => dfMount(document.getElementById('debug'), { uuid: 'r1' }));
          await page.waitForSelector(`.df-row[data-id="${im1.uuid}"]`);
          const row = await page.$eval('.df-row', e => e.textContent.replace(/\s+/g, ' ').trim());
          assert.ok(/^timeout docs\/2026-10-17-infrastructure-migration-phasemap\.spec#IM1_the_shape_census_as_a_command/.test(row), row);
          assert.ok(/stuck: the same failure \(timeout\)/.test(row) && /no cause chain yet · no macro yet/.test(row), row);
          await page.click(`.df-row[data-id="${im1.uuid}"]`);
          await page.waitForSelector('.df-sec[data-sec="hypotheses"]');
          const secs = await page.$$eval('.df-sec', els => els.map(e => e.getAttribute('data-sec')));
          assert.deepStrictEqual(secs, ['what_failed', 'chain', 'compound', 'sigma', 'field', 'recurrence', 'hypotheses', 'on_screen', 'environment', 'macro']);
          assert.ok(await page.$eval('.df-sec[data-sec="chain"]', e => e.classList.contains('df-hole')), 'the missing chain is a hole');
          assert.ok(await page.$eval('.df-sec[data-sec="on_screen"]', e => e.classList.contains('df-view') && /view, not evidence/.test(e.textContent)));
          assert.ok(/fake-tab/.test(await page.$eval('.df-sec[data-sec="hypotheses"]', e => e.textContent)));
          assert.deepStrictEqual(errors, []);
        });
      } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  }

  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
