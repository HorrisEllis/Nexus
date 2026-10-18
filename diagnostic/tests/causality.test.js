'use strict';
// diagnostic/tests/causality.test.js — FMR0 (docs/2026-10-17-failure-mode-report-phasemap.spec), 0.60.146. Diagnostic's own test (D6).
// James, 2026-10-17: "do it. … we need to add this all to nexus, there is boundaries mapping it"
//   CA-01  a fixture tree: shares per system from every ledger layout; linked vs resolved vs dangling
//   CA-02  the ratchet: a share only rises; a fall is named; a rise moves the mark
//   CA-03  a big ledger is read from its tail only (cheap), and the cut first line is dropped, not misparsed
//   CA-04  GET /causality served by the real diagnostic server; declared in its contract and registry; the command row
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const D = path.resolve(__dirname, '..');
const C = require('../lib/causality.js');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'causality-'));
process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} });
const put = (rel, rows) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + '\n'); };
// three layouts: the component ledger, a system's own event_log, a data/<system> ledger
put('data/ledger/guardian/guardian.jobs/2026-10-17.jsonl', [{ uuid: 'g1', type: 'job.created' }, { uuid: 'g2', type: 'job.dispatched', causedBy: 'g1' }, { uuid: 'g3', type: 'job.failed', causedBy: 'g2' }, { uuid: 'g4', type: 'job.created' }]);
put('architect/data/event_log.jsonl', [{ id: 'a1', type: 'x' }, { id: 'a2', type: 'y' }]);
put('data/orchestrator/ledger/cfr/event_log.jsonl', [{ uuid: 'o1', type: 'z', payload: { causedBy: 'nowhere' } }, { uuid: 'o2', type: 'z' }]);
fs.mkdirSync(path.join(root, 'node_modules', 'x', 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'node_modules', 'x', 'data', 'event_log.jsonl'), '{"causedBy":"q"}\n');   // never read

(async () => {
  await test('CA-01', 'shares per system from every ledger layout; linked, resolved and dangling', async () => {
    const m = C.measure({ root });
    const by = Object.fromEntries(m.systems.map(s => [s.system, s]));
    assert.deepStrictEqual(Object.keys(by).sort(), ['architect', 'guardian', 'orchestrator']);
    assert.deepStrictEqual([by.guardian.rows, by.guardian.linked, by.guardian.resolved, by.guardian.share], [4, 2, 2, 0.5]);
    assert.deepStrictEqual([by.architect.linked, by.architect.share], [0, 0]);
    assert.deepStrictEqual([by.orchestrator.linked, by.orchestrator.dangling], [1, 1], 'a cause in the payload counts; one that names no row read is dangling');
    assert.deepStrictEqual([m.total.rows, m.total.linked, m.total.resolved], [8, 3, 2]);
    assert.ok(/3 of 8 ledger rows name their cause \(37\.5%\)/.test(C.lines(m)[0]), C.lines(m)[0]);
    assert.strictEqual(C.measure({ root, system: 'guardian' }).systems.length, 1);
  });

  await test('CA-02', 'the ratchet: a share only rises; a fall is named and the mark kept', async () => {
    const a = C.compare({ systems: [{ system: 'g', rows: 10, share: 0.3 }] }, {});
    assert.deepStrictEqual(a.highWater, { g: 0.3 }); assert.deepStrictEqual(a.fell, []);
    const b = C.compare({ systems: [{ system: 'g', rows: 10, share: 0.2 }] }, a.highWater);
    assert.deepStrictEqual(b.fell, [{ system: 'g', from: 0.3, to: 0.2 }]); assert.strictEqual(b.highWater.g, 0.3);
    assert.ok(C.lines({ total: { rows: 1, linked: 0, resolved: 0, dangling: 0, share: 0 }, systems: [], files: 1, tailBytes: 1048576 }, b).some(l => /^FELL g: 30\.0% → 20\.0%/.test(l)));
    assert.strictEqual(C.compare({ systems: [{ system: 'g', rows: 10, share: 0.5 }] }, b.highWater).highWater.g, 0.5);
  });

  await test('CA-03', 'a big ledger is read from its tail; the line cut in half is dropped, not misparsed', async () => {
    const rows = []; for (let i = 0; i < 3000; i++) rows.push({ uuid: `t${i}`, causedBy: i ? `t${i - 1}` : null, pad: 'x'.repeat(40) });
    put('data/ledger/big/big.c/2026-10-17.jsonl', rows);
    const m = C.measure({ root, system: 'big', tailBytes: 20000 });
    const s = m.systems[0];
    assert.ok(s.rows > 50 && s.rows < 3000, `read ${s.rows} rows from the tail`);
    assert.strictEqual(s.dangling, 1, 'only the oldest row read points before the tail');
  });

  await test('CA-04', 'GET /causality from the real diagnostic server; in its contract, its registry and the command table', async () => {
    const contract = JSON.parse(fs.readFileSync(path.join(D, 'interaction-contract.json'), 'utf8'));
    assert.ok(contract.routes.some(r => r.path === '/causality' && r.method === 'GET'));
    delete require.cache[require.resolve('../registry-components.js')];
    assert.ok(require('../registry-components.js').some(c => c.route.path === '/causality'));
    const R = require('../../idearium/cli/route-commands.js'); const spec = Array.isArray(R) ? R : (R.SPEC || []);
    const row = spec.find(x => x.key === 'system.causality');
    assert.deepStrictEqual(row.req({ args: ['guardian'], flags: {} }), { system: 'diagnostic', method: 'GET', path: '/causality?system=guardian' });
    const port = 17000 + Math.floor(Math.random() * 800);
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-data-'));
    const child = spawn(process.execPath, [path.join(D, 'server.js')], { env: { ...process.env, DIAGNOSTIC_PORT: String(port), DIAGNOSTIC_DATA_DIR: data }, stdio: 'ignore' });
    const get = (p) => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path: p, timeout: 15000 }, (rs) => { let d = ''; rs.on('data', c => d += c); rs.on('end', () => { try { res({ status: rs.statusCode, json: JSON.parse(d) }); } catch (_) { res({ status: rs.statusCode, json: null }); } }); }); r.on('error', () => res({ status: 0 })); r.on('timeout', () => { r.destroy(); res({ status: 0 }); }); });
    try {
      let h = { status: 0 }; for (let i = 0; i < 40 && h.status !== 200; i++) { await new Promise(r => setTimeout(r, 300)); h = await get('/health'); }
      assert.strictEqual(h.status, 200, 'the diagnostic server did not come up');
      const r = await get('/causality');
      assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true);
      assert.ok(r.json.total && typeof r.json.total.share === 'number' && Array.isArray(r.json.lines), JSON.stringify(r.json).slice(0, 200));
    } finally { child.kill(); try { fs.rmSync(data, { recursive: true, force: true }); } catch (_) {} }
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
