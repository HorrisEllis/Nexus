'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-walled.test.js — LM6: COS manages Loom's compartment. 0.60.338.
 * James, 2026-11-01: "loom is already in a compartment. it needs to be managed by cos". Map: docs/2026-10-24-loom-into-cos-phasemap.spec
 * LM6, LM_D4. Until now only LI-08 started Loom in nexus-self-loom; the live boot started node loom/server.js with no wall.
 *   WL-01 Loom declares its compartment and its wall in its own compartment.json, equal to the census's boundaryFor('loom')
 *   WL-02 a walled process reaching into another folder is refused by the wall, and the refusal is a line on COS's ledger
 *   WL-03 the real Loom, started by COS's supervisor from its declaration, runs behind its wall and answers /health; the wall refused nothing
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor, readDeclarations } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
let passed = 0, failed = 0, skipped = 0;
async function test(id, d, fn) { try { const r = await fn(); if (r === 'skip') return; console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const until = async (fn, ms = 15000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 200)); } return null; };
const ok = (url) => new Promise(r => { const q = http.get(url, { timeout: 1500 }, (s) => { s.resume(); r(s.statusCode < 500); }); q.on('error', () => r(false)); q.on('timeout', () => { q.destroy(); r(false); }); });
const portFree = (p) => new Promise(r => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });

(async () => {
  console.log('\n⬡  COS manages Loom\'s compartment (LM6)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-walled-'));
  const sups = [];
  try {
    await test('WL-01', 'Loom declares its compartment and wall, equal to the census\'s boundaryFor(loom)', () => {
      const d = readDeclarations(ROOT).find(x => x.name === 'loom');
      const b = require(path.join(ROOT, 'loom/templates/cos-compartment.js')).boundaryFor('loom', { root: ROOT });
      assert.strictEqual(d.compartment, b.name); assert.strictEqual(d.boundary.mode, b.mode);
      const norm = (a) => a.map(p => path.resolve(p)).sort();
      assert.deepStrictEqual(norm(d.boundary.allow), norm(b.allow));
    });

    await test('WL-02', 'a walled process reaching into another folder is refused, and the refusal is on the ledger', async () => {
      fs.mkdirSync(path.join(dir, 'a')); fs.mkdirSync(path.join(dir, 'b'));
      fs.writeFileSync(path.join(dir, 'b', 'x.js'), 'module.exports = 1;');
      fs.writeFileSync(path.join(dir, 'a', 'main.js'), "try { require('../b/x.js'); console.log('REACHED') } catch (e) { console.log('CODE ' + e.code) } setInterval(() => {}, 1000);");
      const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'l.jsonl'), log: () => {}, policy: { stopGraceMs: 200 },
        declarations: [{ name: 'a', system: 'a', cmd: process.execPath, args: [path.join(dir, 'a', 'main.js')], compartment: 'test-a', boundary: { mode: 'enforce', allow: [path.join(dir, 'a') + '/'] } }] });
      sups.push(sup); sup.start('a', { by: 'test' });
      assert.ok(await until(() => sup.logs('a').some(l => /CODE COS_BOUNDARY/.test(l.line))), JSON.stringify(sup.logs('a')));
      assert.ok(!sup.logs('a').some(l => /REACHED/.test(l.line)), 'the wall let it through');
      const led = sup.ledger({ system: 'a' });
      assert.ok(led.some(e => e.kind === 'spawn' && /in compartment test-a, behind its wall \(enforce\)/.test(e.why)), 'the spawn says it is walled');
      assert.ok(led.some(e => e.kind === 'wall' && /refused .*b[\\/]x\.js/.test(e.why)), JSON.stringify(led.map(e => e.kind + ': ' + e.why)));
      const v = sup.get('a'); assert.deepStrictEqual([v.walled, v.compartment, v.wallMode], [true, 'test-a', 'enforce']);
    });

    await test('WL-03', 'the real Loom, started by COS\'s supervisor, runs behind its wall and answers /health; the wall refused nothing', async () => {
      const d = readDeclarations(ROOT).find(x => x.name === 'loom');
      const port = Number((/:(\d+)/.exec(d.healthUrl) || [])[1]);
      if (!(await portFree(port))) { console.log(`  - WL-03 SKIPPED: :${port} is in use here (a real Loom is running?), so a second cannot start`); skipped++; return 'skip'; }
      const sup = createSupervisor({ root: ROOT, ledgerFile: path.join(dir, 'loom.jsonl'), log: () => {}, policy: { stopGraceMs: 2000 }, declarations: [d] });
      sups.push(sup); sup.start('loom', { by: 'test' });
      assert.ok(await until(() => ok(d.healthUrl), 40000), `Loom did not answer ${d.healthUrl}:\n${sup.logs('loom').slice(-15).map(l => l.line).join('\n')}`);
      const led = sup.ledger({ system: 'loom' });
      assert.ok(led.some(e => e.kind === 'spawn' && /in compartment nexus-self-loom, behind its wall/.test(e.why)));
      assert.deepStrictEqual(led.filter(e => e.kind === 'wall').map(e => e.why), [], 'the wall refused something at boot');
    });
  } finally {
    for (const s of sups) s.shutdown({ by: 'test' });
    await new Promise(r => setTimeout(r, 2500));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
