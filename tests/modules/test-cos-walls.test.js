'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-walls.test.js — CP1a: every system walled by COS. 0.60.355.
 * James, 2026-11-01: "continue moving the rest of the systems into cos." Map: docs/2026-11-01-the-compartment-phasemap.spec CP1a, CP_D5.
 * Spec: cos/spec/compartment.spec MOD-CP-WALLS. Before: 2 of 14 declared processes walled (loom, emerge); 12 bare.
 *   CW-01 every declared process declares a compartment and a wall, each equal to the census (scripts/cos-walls.js --check is clean)
 *   CW-02 an audit wall lets a crossing through, the crossing is a ledger line, and walls.report lists it (not enforce-ready)
 *   CW-03 Clear Glass (Electron) gets its wall through NODE_OPTIONS; a junctioned mount's real path is allowed too
 *   CW-04 the real Ollama bridge, started by COS's supervisor behind its enforcing wall, answers /health; the wall refused nothing
 *   CW-05 a real Electron main process, started the way Clear Glass is, is behind the wall through NODE_OPTIONS (found: a backslash path there failed)
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor, readDeclarations } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const walls = require(path.join(ROOT, 'cos/manager/walls.js'));
let passed = 0, failed = 0, skipped = 0;
async function test(id, d, fn) { try { const r = await fn(); if (r === 'skip') return; console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const until = async (fn, ms = 15000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 200)); } return null; };
const ok = (url) => new Promise(r => { const q = http.get(url, { timeout: 1500 }, (s) => { s.resume(); r(s.statusCode < 500); }); q.on('error', () => r(false)); q.on('timeout', () => { q.destroy(); r(false); }); });
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

(async () => {
  console.log('\n⬡  every system walled by COS (CP1a)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-walls-'));
  const sups = [];
  try {
    await test('CW-01', 'every declared process declares a compartment and a wall, each equal to the census', () => {
      const decl = readDeclarations(ROOT);
      assert.ok(decl.length >= 13, `${decl.length} declared`);   // 14 until 0.60.380 retired intelligence-consumer (SC6: one Intelligence)
      const bare = decl.filter(d => !(d.boundary && Array.isArray(d.boundary.allow))).map(d => d.name);
      assert.deepStrictEqual(bare, [], `bare: ${bare.join(', ')}`);
      for (const d of decl) assert.strictEqual(d.compartment, `nexus-self-${d.system === 'ollama' ? 'ollama' : d.system}`, `${d.name}'s compartment`);
      const rows = require(path.join(ROOT, 'scripts/cos-walls.js')).plan({ root: ROOT });
      const off = rows.filter(r => !['same', 'own'].includes(r.state)).map(r => `${r.process || r.system}: ${r.state}`);
      assert.deepStrictEqual(off, [], off.join('; '));
      for (const r of rows) assert.strictEqual(r.mode, r.out === 0 ? 'enforce' : 'audit', `${r.process}: ${r.out} way(s) out → ${r.mode}`);
    });

    await test('CW-02', 'an audit wall lets a crossing through, ledgers it, and walls.report lists it', async () => {
      fs.mkdirSync(path.join(dir, 'a')); fs.mkdirSync(path.join(dir, 'b'));
      fs.writeFileSync(path.join(dir, 'b', 'x.js'), 'module.exports = 1;');
      fs.writeFileSync(path.join(dir, 'a', 'main.js'), "try { require('../b/x.js'); console.log('REACHED') } catch (e) { console.log('CODE ' + e.code) } setInterval(() => {}, 1000);");
      const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'l.jsonl'), log: () => {}, policy: { stopGraceMs: 200 },
        declarations: [{ name: 'a', system: 'a', cmd: process.execPath, args: [path.join(dir, 'a', 'main.js')], compartment: 'nexus-self-a', boundary: { mode: 'audit', allow: [path.join(dir, 'a') + '/'] } }] });
      sups.push(sup); sup.start('a', { by: 'test' });
      assert.ok(await until(() => sup.logs('a').some(l => /REACHED/.test(l.line))), JSON.stringify(sup.logs('a')));
      assert.ok(await until(() => sup.ledger({ system: 'a' }).some(e => e.kind === 'wall' && /would refuse .*b[\\/]x\.js/.test(e.why))), 'the crossing is not on the ledger');
      const w = walls.report(sup).find(x => x.name === 'a');
      assert.deepStrictEqual([w.mode, w.via, w.crossings.length, w.enforceReady], ['audit', '--require', 1, false]);
      assert.ok(/b[\\/]x\.js$/.test(w.crossings[0].file) && /1 crossing/.test(w.said), w.said);
    });

    await test('CW-03', 'Electron gets its wall through NODE_OPTIONS; a junctioned mount\'s real path is allowed', () => {
      const sup = createSupervisor({ root: ROOT, ledgerFile: path.join(dir, 'cg.jsonl'), log: () => {}, declarations: readDeclarations(ROOT) });
      const cg = sup.commandOf('clear-glass');
      assert.strictEqual(cg.via, 'NODE_OPTIONS');
      assert.ok(/--require "[^"]+boundary\.js"/.test(cg.env.NODE_OPTIONS), cg.env.NODE_OPTIONS);
      assert.strictEqual(JSON.parse(cg.env.COS_BOUNDARY).mode, 'audit');
      assert.strictEqual(sup.get('clear-glass').wallVia, 'NODE_OPTIONS');
      const lm = JSON.parse(sup.commandOf('loom').env.COS_BOUNDARY);
      const nm = path.join(ROOT, 'node_modules'); let real = null; try { real = fs.realpathSync(nm); } catch (_) {}
      if (real && path.resolve(real) !== path.resolve(nm)) assert.ok(lm.allow.some(a => path.resolve(a) === path.resolve(real)), `the junction's target ${real} is not allowed: ${lm.allow.join(', ')}`);
      else assert.ok(lm.allow.length >= 3);   // no junction here: nothing to add, said by the assertion's branch
      sup.shutdown({ by: 'test' });
    });

    await test('CW-04', 'the real Ollama bridge, started by COS\'s supervisor behind its enforcing wall, answers /health; the wall refused nothing', async () => {
      const d = readDeclarations(ROOT).find(x => x.name === 'ollama-bridge');
      assert.strictEqual(d.boundary.mode, 'enforce');
      const port = await freePort();   // his live Nexus may hold :3749; this one runs beside it, told of a dead orchestrator so it registers nowhere
      const decl = { ...d, healthUrl: `http://127.0.0.1:${port}/health`, env: { ...(d.env || {}), OLLAMA_BRIDGE_PORT: String(port), ORCHESTRATOR_URL: 'http://127.0.0.1:9' } };
      const sup = createSupervisor({ root: ROOT, ledgerFile: path.join(dir, 'ollama.jsonl'), log: () => {}, policy: { stopGraceMs: 2000 }, declarations: [decl] });
      sups.push(sup); sup.start('ollama-bridge', { by: 'test' });
      assert.ok(await until(() => ok(decl.healthUrl), 40000), `the bridge did not answer ${decl.healthUrl}:\n${sup.logs('ollama-bridge').slice(-15).map(l => l.line).join('\n')}`);
      const led = sup.ledger({ system: 'ollama-bridge' });
      assert.ok(led.some(e => e.kind === 'spawn' && /in compartment nexus-self-ollama, behind its wall \(enforce\)/.test(e.why)), JSON.stringify(led.map(e => e.why)));
      assert.deepStrictEqual(led.filter(e => e.kind === 'wall').map(e => e.why), [], 'the wall refused something at boot');
      const w = walls.report(sup).find(x => x.name === 'ollama-bridge');
      assert.ok(/^enforce: isolated/.test(w.said), w.said);
    });
    await test('CW-05', 'a real Electron main process started as the supervisor starts Clear Glass is behind the wall (NODE_OPTIONS)', async () => {
      const bin = path.join(ROOT, 'node_modules', '.bin', 'electron');
      if (!fs.existsSync(bin) && !fs.existsSync(bin + '.cmd')) { console.log('  - CW-05 SKIPPED: Electron is not installed here'); skipped++; return 'skip'; }
      const app = path.join(dir, 'eapp'), out = path.join(dir, 'eout'); fs.mkdirSync(app); fs.mkdirSync(out);
      fs.writeFileSync(path.join(out, 'x.js'), 'module.exports = 1;');
      fs.writeFileSync(path.join(app, 'package.json'), '{"name":"cw05","main":"main.js"}');
      fs.writeFileSync(path.join(app, 'main.js'), "const { app } = require('electron'); try { require('../eout/x.js'); console.log('LOADED'); } catch (e) { console.log('CODE ' + e.code); } app.whenReady().then(() => app.quit());");
      const sup = createSupervisor({ root: ROOT, ledgerFile: path.join(dir, 'e.jsonl'), log: () => {}, policy: { stopGraceMs: 200 },
        declarations: [{ name: 'e', system: 'e', cmd: 'electron', cmdCandidates: [bin], args: [app], compartment: 'nexus-self-e', boundary: { mode: 'audit', allow: [app + path.sep, path.join(ROOT, 'node_modules') + path.sep] } }] });
      sups.push(sup); sup.start('e', { by: 'test' });
      assert.ok(await until(() => sup.ledger({ system: 'e' }).some(e => e.kind === 'wall' && /would refuse .*eout[\\/]x\.js \(from .*eapp[\\/]main\.js\)/.test(e.why)), 60000),
        `Electron's main process was not behind the wall:\n${sup.logs('e').slice(-10).map(l => l.line).join('\n')}`);
      assert.ok(sup.ledger({ system: 'e' }).some(e => e.kind === 'spawn' && /through NODE_OPTIONS/.test(e.why)));
    });
  } finally {
    for (const s of sups) s.shutdown({ by: 'test' });
    await new Promise(r => setTimeout(r, 2500));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
