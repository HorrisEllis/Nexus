'use strict';
/**
 * tests/modules/test-pf3-append-store.test.js — §0.41.0 PF3: append, never rewrite (guardian/jaa-store.js).
 * James: "whats up with the optimization? it seems almost worst?" · "yes, lets improve the intelligence system."
 * Real child processes writing one shared table at once, on a tiny SEGMENT_MAX so segments close and fold mid-run.
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const STORE = path.join(__dirname, '../../guardian/jaa-store.js');
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pf3-'));
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const open = (dir) => quiet(() => { const { JaaStore } = require(STORE); return new JaaStore(dir, { settings: false }); });
function child(dir, code, env = {}) {
  return new Promise((res) => {
    const p = spawn(process.execPath, ['-e', `const {JaaStore}=require(${JSON.stringify(STORE)});const s=new JaaStore(${JSON.stringify(dir)},{settings:false});${code}`],
      { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; }); p.on('exit', (c) => res({ code: c, err }));
  });
}

(async () => {
  console.log('\n⬡  PF3 — append, never rewrite\n');

  await test('PF-04', 'six processes × 300 rows at once, segments closing and folding mid-run: every row once, no EPERM, no fold error', async () => {
    const dir = tmp();
    const runs = await Promise.all([1, 2, 3, 4, 5, 6].map(n => child(dir,
      `let i=0;(function w(){for(let k=0;k<30;k++){s.insert('event_log',{id:'p${n}-'+i,n:${n},i});i++;}s._flush('event_log');if(i<300)setTimeout(w,5);else{s.flushAll();process.exit(0);}})();`,
      { JAA_SEGMENT_MAX_BYTES: '4096' })));
    for (const r of runs) { assert.strictEqual(r.code, 0, r.err); assert.ok(!/EPERM|fold error|append error/.test(r.err), r.err); }
    const rows = open(dir).all('event_log');
    assert.strictEqual(rows.length, 1800);
    assert.strictEqual(new Set(rows.map(r => r.id)).size, 1800);
  });

  await test('PF-05', 'the later write wins across processes — and still wins after it is folded under an older open line (the watermark)', async () => {
    const dir = tmp();
    const b = open(dir); b.insert('t', { id: 'x', v: 1 }); b._flush('t');                 // B (alive): v1 on its open segment
    await new Promise(r => setTimeout(r, 15));
    await child(dir, `s.update('t',{id:'x'},{v:2});s._flush('t');s.flushAll();`);           // A: v2, then folds it into the base
    assert.ok(!fs.readdirSync(dir).some(f => /^t\.\d+\.\d+\.closed/.test(f)), 'A did not fold');
    assert.strictEqual(open(dir).get('t', { id: 'x' }).v, 2, "B's older open line overrode the folded newer write");
    b.reloadTable('t'); assert.strictEqual(b.get('t', { id: 'x' }).v, 2);
  });

  await test('PF-06', "another process's insert and delete reach a running store by reading only the new lines", async () => {
    const dir = tmp();
    const a = open(dir); a.insert('t', { id: 'keep' }); a.insert('t', { id: 'gone' }); a._flush('t');
    await child(dir, `s.delete('t',{id:'gone'});s.insert('t',{id:'new'});s._flush('t');`);
    a.reloadTable('t');
    assert.deepStrictEqual(a.all('t').map(r => r.id).sort(), ['keep', 'new']);
  });

  await test('PF-07', 'one new row in a 100,000-row table costs the row, not the table', async () => {
    const dir = tmp();
    const s = open(dir);
    for (let i = 0; i < 100000; i++) s.insert('big', { id: `r${i}`, ts: i, body: 'x'.repeat(40) });
    s.flushAll();
    let t = process.hrtime.bigint();
    for (let i = 0; i < 50; i++) { s.insert('big', { id: `n${i}`, ts: i }); s._flush('big'); }
    const perWriteMs = Number(process.hrtime.bigint() - t) / 1e6 / 50;
    assert.ok(perWriteMs < 20, `${perWriteMs.toFixed(1)} ms per write`);
    assert.strictEqual(open(dir).count('big'), 100050);
  });

  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
