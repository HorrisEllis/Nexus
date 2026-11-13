'use strict';
/**
 * tests/modules/test-cos-memory-baseline.test.js — CP6a expanded 2026-11-13 (docs/2026-11-01-the-compartment-phasemap.spec, 0.60.501)
 * James, 2026-11-13: "also the resource manager, should use the baseline deviation when its applicable."
 *
 *   MB-01  no baseline yet (under memBaselineMin samples): the fixed floor decides, as before, and says so
 *   MB-02  with a baseline where ~11% free is usual, 11% under a 15% floor is NOT low (a floor bites only on a deviation)
 *   MB-03  ...and a drop well under that baseline (more than 2σ) is low, and says the baseline
 *   MB-04  under the absolute minimum (3%) a start is always refused, whatever the baseline
 *   MB-05  a real start: a system with a 15% floor is started at 11% free once the baseline says 11% is usual; refused before it
 *   MB-06  the baseline survives a restart of the supervisor (kept beside the ledger)
 *   MB-07  the halt rule and the balance rule ask the same judgement (resources.js reads sup.memoryJudge)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-memb-'));
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

const mk = (dir, free, extra = {}) => createSupervisor({ root: ROOT, declarations: [], ledgerFile: path.join(dir, 'ledger.jsonl'), freeMemPct: () => free.v, log: () => {}, ...extra });
const usual = (sup, n = 40) => { for (let i = 0; i < n; i++) sup.memoryObserve(0.11 + ((i % 5) - 2) * 0.006); };   // 9.8%..12.2%, mean 11%

(async () => {
  console.log('\n⬢  COS: memory floors judged against this machine\'s baseline (CP6a, 0.60.501)\n');
  const d1 = path.join(tmp, 'a'); fs.mkdirSync(d1);
  const free = { v: 0.11 };
  const sup = mk(d1, free);

  await test('MB-01', 'no baseline yet: the fixed floor decides, and says so', () => {
    const j = sup.memoryJudge(0.11, 0.15);
    assert.strictEqual(j.low, true); assert.ok(/no baseline yet/.test(j.why), j.why);
  });
  usual(sup);
  await test('MB-02', 'with ~11% usual, 11% under a 15% floor is not low', () => {
    const j = sup.memoryJudge(0.11, 0.15);
    assert.strictEqual(j.low, false, j.why); assert.ok(/usual here/.test(j.why) && /baseline 11\.0%/.test(j.why), j.why);
  });
  await test('MB-03', 'a drop more than 2σ under the baseline is low, and names it', () => {
    const j = sup.memoryJudge(0.07, 0.15);
    assert.strictEqual(j.low, true, j.why); assert.ok(/σ under this machine's baseline/.test(j.why), j.why);
  });
  await test('MB-04', 'under 3% is always low, whatever the baseline', () => {
    const s2 = mk(path.join(tmp, 'abs'), { v: 0.02 }); for (let i = 0; i < 40; i++) s2.memoryObserve(0.02 + (i % 2) * 0.001);
    const j = s2.memoryJudge(0.02, 0.15); assert.strictEqual(j.low, true); assert.ok(/absolute minimum/.test(j.why), j.why);
  });
  await test('MB-05', 'a real start: refused with no baseline, started once 11% is known to be usual', async () => {
    const dir = path.join(tmp, 'spawn'); fs.mkdirSync(dir);
    const script = path.join(dir, 'sys.js'); fs.writeFileSync(script, 'setTimeout(()=>{}, 3000);\n');
    const decl = { name: 'probe', cmd: process.execPath, args: [script], cwd: dir, haltPctOverride: 0.15, phase: 1 };
    const f = { v: 0.11 };
    const s3 = mk(dir, f, { declarations: [decl] });
    const lines = () => fs.existsSync(path.join(dir, 'ledger.jsonl')) ? fs.readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    s3.start('probe', { by: 'person' });
    assert.ok(lines().some(e => e.kind === 'refused' && /no baseline yet/.test(e.why)), JSON.stringify(lines().slice(-2)));
    s3.stop('probe', { by: 'person' });
    usual(s3);
    s3.start('probe', { by: 'person' });
    await new Promise(r => setTimeout(r, 300));
    assert.ok(lines().some(e => e.kind === 'spawn' && e.system === 'probe'), JSON.stringify(lines().slice(-3)));
    try { s3.stop('probe', { by: 'person' }); } catch (_) {}
    try { await s3.shutdown(); } catch (_) {}
  });
  await test('MB-06', 'the baseline is kept beside the ledger and read back by a new supervisor', () => {
    for (let i = 0; i < 10; i++) sup.memoryObserve(0.11);   // a save happens every 10 samples
    assert.ok(fs.existsSync(path.join(d1, 'memory-baseline.json')));
    const again = mk(d1, free); const b = again.memoryBaseline();
    assert.ok(b.established && Math.abs(b.mean - 0.11) < 0.005, JSON.stringify(b));
  });
  await test('MB-07', 'the halt and balance rules ask the supervisor\'s judgement', () => {
    const src = fs.readFileSync(path.join(ROOT, 'cos/manager/resources.js'), 'utf8');
    assert.ok(/const hj = judge\(free, P\.memoryHaltPct\)/.test(src) && /if \(hj\.low\)/.test(src));
    assert.ok(/const mj = judge\(freePct, B\.balanceMemPct\)/.test(src) && /memory: mj\.low/.test(src));
    assert.ok(/sup\.memoryObserve\(u\.host\.freeMemPct \/ 100\)/.test(src));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  try { await sup.shutdown(); } catch (_) {}
  process.exit(failed ? 1 : 0);
})();
