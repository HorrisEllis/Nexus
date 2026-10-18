'use strict';
/**
 * tests/modules/test-flight-data.test.js — FR6 (docs/2026-10-16-repo-carve-phasemap.spec), 0.60.144
 * James, 2026-10-17: "we need to continue building the flight recorder. look at rfr2, and cfr for friction and tension."
 *
 * The fixture is his IM1 run of 2026-10-17 as his log shows it (attachment, autopilot log 21:41–22:43): gemini cancelled at
 * 295 s, chatgpt the same, gemini again, then claude, then deepseek writing files that did not complete the contract,
 * ending contract-incomplete. The rows are in the shape idearium/api writes to idearium_phase_runs.
 *   FD-01  guardian's real timeout messages are classified as timeout (they were 'unknown')
 *   FD-02  his IM1 run reads STUCK: the ladder in order, the shared failure named across agents, every call wasted
 *   FD-03  a run that landed after one failed call: LANDED, only the failed call is wasted, friction 0.5
 *   FD-04  tension comes from CFR's own delta (ok → error is turbulent); a run still going is 'flying', its time so far
 *   FD-05  summary over many runs: landed vs stuck, the share of calls wasted, the recurring modes, each agent's record
 *   FD-06  GET /api/repos/:uuid/flight and /flight/:runId through the real router; the repo.flight command row
 *   FD-07  the Code tab's flight panel in Clear Glass against a stubbed api(); no engine → SKIPPED, said
 *   FD-08  0.60.146: CFR's delta is intelligence's, offered by route (POST /api/intelligence/cfr/delta), answered by its real handler
 *   FD-09  0.60.146: lib/flight-data.js crosses no system boundary (the drawbridge census), and Nexus's census adds nothing
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.env.NEXUS_EVIDENCE = 'off';
process.on('exit', () => { for (const d of [_data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const FD = require(path.join(ROOT, 'lib/flight-data.js'));
const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));
// CFR's delta the way production gets it: intelligence's real route handler (intelligence/routes.js), not a require from lib/
const _intel = require(path.join(ROOT, 'intelligence/routes.js')).createRoutes({ jaaDB: { query: () => [], count: () => 0, tail: () => [], insert: (t, r) => r, update: () => 0, get: () => null }, getField: () => ({ coherence: 0.5, friction: 0.5, resonance: 0.5, entropy: 0.5, regime: 'stable' }), intelligence: {}, refreshMs: 0 });
async function intelRoute(method, p, body) { let out = null; await _intel.handle(method, p, new URLSearchParams(), body, (status, b) => { out = { status, body: b }; }); return out; }
async function deltaByRoute(rows) { const pairs = FD.transitions(rows); const r = await intelRoute('POST', '/api/intelligence/cfr/delta', { pairs }); const m = new Map(pairs.map((p, i) => [`${p[0].ts}|${p[1].ts}|${p[1].type}`, r.body.deltas[i]])); return (a, b) => m.get(`${a.ts}|${b.ts}|${b.type}`) || null; }
const quiet = async (f) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const T0 = Date.parse('2026-10-17T21:41:17Z');
const at = (min) => T0 + Math.round(min * 60000);
const base = { runId: 'phrun-im1', repoUuid: 'nexus-id-repo-7ec8956b', map: 'docs/2026-10-17-infrastructure-migration-phasemap.spec', phase: 'IM1_the_shape_census_as_a_command' };
// his IM1 run, as the log shows it
const IM1 = [
  { ...base, uuid: 'a0', state: 'building', ts: at(0), promptChars: 24000 },
  { ...base, uuid: 'a1', state: 'failed', provider: 'gemini', attempt: 1, ts: at(9.9), error: 'cancelled — the caller stopped waiting after 295 s', promptChars: 24000 },
  { ...base, uuid: 'a1r', state: 'escalating', attempt: 2, ts: at(9.95) },
  { ...base, uuid: 'a2', state: 'failed', provider: 'chatgpt', attempt: 2, ts: at(14.9), error: 'cancelled — the caller stopped waiting after 295 s', promptChars: 24000 },
  { ...base, uuid: 'a3', state: 'failed', provider: 'chatgpt', attempt: 3, ts: at(19.9), error: 'cancelled — the caller stopped waiting after 295 s', promptChars: 24000 },
  { ...base, uuid: 'a4', state: 'failed', provider: 'gemini', attempt: 4, ts: at(23.0), error: 'no completion within 900000ms — real absence', promptChars: 24000 },
  { ...base, uuid: 'a5', state: 'failed', provider: 'claude', attempt: 5, ts: at(26.2), error: 'cancelled — the caller stopped waiting after 295 s', promptChars: 24000 },
  { ...base, uuid: 'a6', state: 'incomplete', provider: 'deepseek', attempt: 6, ts: at(27.8), absent: ['lib/system-boundary.js'], promptChars: 24000, replyChars: 10132 },
  { ...base, uuid: 'a7', state: 'retrying', attempt: 7, ts: at(27.9), error: '3 condition(s) unmet — attempt 7 of 10' },
  { ...base, uuid: 'a8', state: 'incomplete', provider: 'deepseek', attempt: 10, ts: at(62.0), absent: ['lib/system-boundary.js'], promptChars: 24000, replyChars: 7100 },
  { ...base, uuid: 'a9', state: 'contract-incomplete', attempt: 10, ts: at(62.1), error: 'gate work.1 is FAILED' },
];

(async () => {
  await test('FD-01', "guardian's own timeout messages are classified as timeout, not unknown", async () => {
    assert.strictEqual(PR.classify({ error: 'cancelled — the caller stopped waiting after 295 s', ok: false }), 'timeout');
    assert.strictEqual(PR.classify({ error: 'no completion within 900000ms — real absence, not a guess', ok: false }), 'timeout');
    assert.strictEqual(PR.classify({ error: 'ECONNREFUSED 127.0.0.1:7820', ok: false }), 'provider-down');   // unchanged
  });

  await test('FD-02', 'his IM1 run reads STUCK: the ladder in order, the failure shared across agents named, every call wasted', async () => {
    const f = FD.flight(IM1);
    assert.strictEqual(f.verdict, 'stuck', f.why);
    assert.strictEqual(f.landed, false); assert.strictEqual(f.ended, true); assert.strictEqual(f.attempts, 10);
    assert.deepStrictEqual(f.ladder.map(a => a.agent), ['gemini', 'chatgpt', 'claude', 'deepseek']);
    assert.strictEqual(f.faults.timeout, 5); assert.strictEqual(f.faults['missed-files'], 2);
    const shared = f.sharedFailure.find(s => s.mode === 'timeout');
    assert.ok(shared && shared.agents.length === 3, JSON.stringify(f.sharedFailure));
    assert.ok(/not the agent/.test(f.why), f.why);
    assert.strictEqual(f.wasted.calls, f.cost.calls); assert.strictEqual(f.cost.calls, 7);
    assert.strictEqual(f.friction, 1);
    assert.strictEqual(f.wasted.ms, at(62.1) - T0);
    assert.ok(FD.lines(f)[0].startsWith('STUCK'), FD.lines(f)[0]);
  });

  await test('FD-03', 'a run that landed after one failed call: LANDED, only the failed call wasted, friction 0.5', async () => {
    const b = { runId: 'phrun-ok', repoUuid: 'r', phase: 'P1' };
    const f = FD.flight([
      { ...b, state: 'building', ts: 1000 },
      { ...b, state: 'failed', provider: 'ollama:qwen2.5-coder:7b', attempt: 1, ts: 61000, error: 'request timed out', promptChars: 4000 },
      { ...b, state: 'replied', provider: 'claude', attempt: 2, ts: 121000, promptChars: 4000, replyChars: 2000 },
      { ...b, runId: 'phrun-ok-proof', state: 'proven', ts: 125000 },
    ]);
    assert.strictEqual(f.verdict, 'landed'); assert.strictEqual(f.runId, 'phrun-ok');
    assert.strictEqual(f.wasted.calls, 1); assert.strictEqual(f.wasted.ms, 60000);
    assert.strictEqual(f.friction, 0.5);
    assert.deepStrictEqual(f.ladder.map(a => [a.agent, a.local]), [['ollama:qwen2.5-coder:7b', true], ['claude', false]]);
  });

  await test("FD-04", "tension is CFR's own delta (ok → error turbulent); a run still going is 'flying' with its time so far", async () => {
    const f = FD.flight(IM1, { delta: await deltaByRoute(IM1) });
    assert.ok(f.tensionKnown && /POST \/api\/intelligence\/cfr\/delta/.test(f.sources.tension), f.sources.tension);
    const bare = FD.flight(IM1);   // no delta handed in: said, never a made-up zero
    assert.strictEqual(bare.tensionKnown, false); assert.ok(/unavailable/.test(bare.sources.tension)); assert.ok(/tension unavailable/.test(FD.lines(bare).join('\n')));
    assert.ok(f.tension.max >= 0.4, JSON.stringify(f.tension));
    assert.ok(f.turbulence.some(s => s.from === 'building' && s.to === 'failed'), JSON.stringify(f.turbulence));
    const g = FD.flight([{ ...base, runId: 'phrun-live', state: 'building', ts: 1000 }, { ...base, runId: 'phrun-live', state: 'escalating', ts: 2000 }], { now: 61000 });
    assert.strictEqual(g.verdict, 'flying'); assert.strictEqual(g.ended, false); assert.strictEqual(g.wallMs, 60000);
  });

  await test('FD-05', 'summary: landed vs stuck, the share of calls wasted, the recurring modes, each agent', async () => {
    const ok = [
      { runId: 'phrun-ok', repoUuid: 'r', phase: 'P1', state: 'failed', provider: 'gemini', attempt: 1, ts: 10, error: 'timeout' },
      { runId: 'phrun-ok', repoUuid: 'r', phase: 'P1', state: 'replied', provider: 'claude', attempt: 2, ts: 20 },
      { runId: 'phrun-ok-proof', repoUuid: 'r', phase: 'P1', state: 'proven', ts: 30 },
    ];
    const s = FD.summary([...IM1, ...ok]);
    assert.strictEqual(s.runs, 2); assert.strictEqual(s.landed, 1); assert.strictEqual(s.stuck, 1);
    assert.strictEqual(s.calls, 9); assert.strictEqual(s.wastedCalls, 8);
    assert.strictEqual(s.modes.timeout, 6);
    assert.strictEqual(s.agents.claude.landedRuns, 1); assert.strictEqual(s.agents.gemini.failed, 3);
    assert.ok(/8 of 9 call/.test(FD.summaryLines(s)[1]), FD.summaryLines(s)[1]);
  });

  await test('FD-06', 'GET /api/repos/:uuid/flight and /flight/:runId through the real router; the repo.flight row', async () => {
    const api = await quiet(() => import('../../idearium/api/index.js'));
    let made = null;
    for (let i = 0; i < 40; i++) { made = await quiet(() => api._route('POST', '/api/repos', { name: 'fd-fixture', bare: true, source: 'create' })); if (made.json && made.json.repo) break; await new Promise(r => setTimeout(r, 100)); }
    const uuid = made.json.repo.uuid;
    // the same table the phase build writes (idearium/lib/db.js, which idearium/api reads with loadTable)
    const DB = await import('../../idearium/lib/db.js');
    for (const r of IM1) DB.appendRow('idearium_phase_runs', { ...r, repoUuid: uuid });
    const list = await quiet(() => api._route('GET', `/api/repos/${uuid}/flight`));
    assert.strictEqual(list.status, 200, JSON.stringify(list.json).slice(0, 300));
    const d = list.json.data || list.json;
    assert.strictEqual(d.count, 1); assert.strictEqual(d.flights[0].verdict, 'stuck'); assert.strictEqual(d.totals.wastedCalls, 7);
    assert.strictEqual(d.flights[0].tension, null, 'intelligence is not running in this test: tension unavailable, not 0');
    const one = await quiet(() => api._route('GET', `/api/repos/${uuid}/flight/phrun-im1`));
    const o = one.json.data || one.json;
    assert.strictEqual(one.status, 200); assert.strictEqual(o.flight.verdict, 'stuck'); assert.ok(o.lines[0].startsWith('STUCK'));
    const miss = await quiet(() => api._route('GET', `/api/repos/${uuid}/flight/nope`));
    assert.strictEqual(miss.status, 404);
    const R = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const spec = Array.isArray(R) ? R : (R.SPEC || R.ROUTES || []);
    const row = spec.find(x => x.key === 'repo.flight');
    assert.ok(row, 'repo.flight row');
    assert.strictEqual(row.req({ repo: { uuid: 'u' }, args: ['phrun-im1'], flags: {} }).path, '/api/repos/u/flight/phrun-im1');
    const keys = spec.map(x => x.key); assert.strictEqual(new Set(keys).size, keys.length, 'command keys unique');
  });

  await test('FD-08', "CFR's delta by intelligence's route: its real handler answers each pair; wrong method and missing pairs are refused", async () => {
    const pairs = FD.transitions(IM1);
    const r = await intelRoute('POST', '/api/intelligence/cfr/delta', { pairs });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.deltas.length, pairs.length);
    assert.ok(r.body.deltas.every(d => typeof d.tension === 'number'));
    assert.strictEqual((await intelRoute('GET', '/api/intelligence/cfr/delta', {})).status, 405);
    assert.strictEqual((await intelRoute('POST', '/api/intelligence/cfr/delta', {})).status, 400);
    const reg = require(path.join(ROOT, 'intelligence/registry-components.js'));
    assert.ok((Array.isArray(reg) ? reg : reg.COMPONENTS || []).some(c => c.route && c.route.path === '/api/intelligence/cfr/delta'), 'declared in its registry');
  });

  await test('FD-09', 'lib/flight-data.js crosses no system boundary, and the census adds nothing past the baseline', async () => {
    const B = require(path.join(ROOT, 'lib/system-boundary.js'));
    const s = B.scan({ root: ROOT });
    const edges = s.crossings.filter(e => e.from === 'lib/flight-data.js' && e.kind !== 'kernel');
    assert.deepStrictEqual(edges, []);
    const c = B.check({ root: ROOT });
    assert.deepStrictEqual(c.added, [], JSON.stringify(c.added));
  });

  // FD-07 — the flight panel in Clear Glass (AXIOMS §4.1), against a stubbed api(): the page holds no logic of its own
  let skipped = 0;
  const { pathToFileURL } = require('url');
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - FD-07 SKIPPED: Clear Glass has no engine here — the browser check did not run'); skipped++; }
  else {
    let browser = null;
    try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - FD-07 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; }
    if (browser) {
      const UI = path.join(ROOT, 'idearium', 'ui');
      const f = FD.flight(IM1);
      const listed = { runId: f.runId, phase: f.phase, verdict: f.verdict, why: f.why, landed: false, ended: true, attempts: f.attempts, wallMs: f.wallMs, ladder: f.ladder.map(a => a.agent), calls: f.cost.calls, wasted: f.wasted, friction: f.friction, tension: null };
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-ui-'));
      fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="panel"></div><script>
  const CALLS = []; const CURRENT_API_REPO = { uuid: 'r1' };
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  async function api(p) { CALLS.push(p);
    if (p.startsWith('/api/repos/r1/flight?')) return { flights: [${JSON.stringify(listed)}], lines: ${JSON.stringify(FD.summaryLines(FD.summary(IM1)))} };
    if (p === '/api/repos/r1/flight/phrun-im1') return { flight: { runId: 'phrun-im1' }, lines: ${JSON.stringify(FD.lines(f))} };
    throw new Error('unexpected ' + p); }
</script><script src="${pathToFileURL(path.join(UI, 'js', 'code-tab-panels.js')).href}"></script>
<script src="${pathToFileURL(path.join(UI, 'js', 'code-tab-flight.js')).href}"></script>
<script>CX.panel = 'flight'; function _cxPaintPanel() { document.getElementById('panel').innerHTML = _cxPanelBody(); }</script></body></html>`);
      try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
        await test('FD-07', 'the flight panel in Clear Glass: the totals, his IM1 run STUCK with its ladder and why; a row opens the run whole', async () => {
          await page.evaluate(() => cxFlightLoad(CURRENT_API_REPO));
          await page.waitForSelector('.fl-run[data-run="phrun-im1"]');
          const totals = await page.$eval('.fl-totals', e => e.textContent);
          assert.ok(/1 run\(s\): 0 landed · 1 stuck/.test(totals) && /7 of 7 call\(s\) \(100%\)/.test(totals), totals);
          const row = await page.$eval('.fl-run', e => e.textContent.replace(/\s+/g, ' ').trim());
          assert.ok(/^stuck IM1_the_shape_census_as_a_command 10 attempt\(s\) · 62 min · 7 call\(s\), 7 wasted/.test(row), row);
          assert.ok(/gemini → chatgpt → claude → deepseek · friction 1\.00 · tension unavailable/.test(row) && /not the agent/.test(row), row);
          await page.click('.fl-run[data-run="phrun-im1"]');
          await page.waitForFunction(() => /ladder: gemini×2/.test((document.querySelector('.fl-detail') || {}).textContent || ''));
          assert.ok(await page.evaluate(() => CALLS.includes('/api/repos/r1/flight/phrun-im1')));
          assert.ok(await page.$eval('.fl-detail div', e => e.className === 'cs-bad'), 'the STUCK line is marked');
          assert.deepStrictEqual(errors, []);
        });
      } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
