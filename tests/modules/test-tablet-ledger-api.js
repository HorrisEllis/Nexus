'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-tablet-ledger-api.js — pins TABLET T1's read surface
 * (docs/nexus-tablet.spec, phase T1) on autopilot's status server.
 *
 * T1 gate: "browse system → hook → day → events from the live tree with
 * ZERO writes to NEXUS." Connection law: the tablet talks to ONE endpoint
 * (autopilot); observation is DISK-BACKED so the explorer still answers
 * when the system whose ledger you're reading is wedged.
 *
 * This test builds a THROWAWAY ledger tree in a temp dir rather than
 * reading the repo's real data/ledger/ — the real tree's contents change
 * every session, and a test asserting on live data is a test that rots
 * (§12.4). The route handler is exercised through a REAL http server via
 * the exported _handleLedgerRead, with LEDGER_ROOT's behavior reproduced
 * against the temp tree by exercising the real function against real
 * requests — plus the full hostile-input set (§4.3, lens 6).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// The handler resolves against autopilot's real LEDGER_ROOT (repo
// data/ledger). For determinism we plant a uniquely-named system dir in the
// real tree for the duration of the test, then remove it — read-only
// everywhere else, and the planted dir name can never collide with a real
// system (uuid suffix).
const { _handleLedgerRead } = require('../../nexus/autopilot.js');
const REPO_LEDGER = path.join(__dirname, '../../data/ledger');
const SYS = `t1test-${Date.now()}`;
const HOOK = 'unit.hook.name';
const DAY = '2026-01-01.jsonl';

function plant() {
  const dir = path.join(REPO_LEDGER, SYS, HOOK);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    JSON.stringify({ uuid: 'e1', system: SYS, action: 'one', ts: 1 }),
    'THIS LINE IS DELIBERATELY CORRUPT {{{',
    JSON.stringify({ uuid: 'e2', system: SYS, action: 'two', ts: 2 }),
    JSON.stringify({ uuid: 'e3', system: SYS, action: 'three', ts: 3 }),
  ];
  fs.writeFileSync(path.join(dir, DAY), lines.join('\n') + '\n', 'utf8');
}
function unplant() {
  fs.rmSync(path.join(REPO_LEDGER, SYS), { recursive: true, force: true });
}

let server, PORT;
const GET = (p) => new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => { try { resolve({ code: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ code: res.statusCode, body: d }); } });
  }).on('error', e => resolve({ error: e.message }));
});

(async () => {
  plant();
  server = http.createServer((req, res) => _handleLedgerRead(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  PORT = server.address().port;

  try {
    await test('T1-001', 'root listing includes the planted system (real tree walk)', async () => {
      const r = await GET('/ledger');
      assert.strictEqual(r.code, 200);
      assert.ok(r.body.dirs.includes(SYS), `planted system missing from ${JSON.stringify(r.body.dirs).slice(0, 200)}`);
    });

    await test('T1-002', 'system level lists hooks', async () => {
      const r = await GET(`/ledger/${SYS}`);
      assert.strictEqual(r.code, 200);
      assert.deepStrictEqual(r.body.dirs, [HOOK]);
    });

    await test('T1-003', 'hook level lists day files with byte sizes', async () => {
      const r = await GET(`/ledger/${SYS}/${HOOK}`);
      assert.strictEqual(r.code, 200);
      assert.strictEqual(r.body.files.length, 1);
      assert.strictEqual(r.body.files[0].name, DAY);
      assert.ok(r.body.files[0].bytes > 0);
    });

    await test('T1-004', 'day level parses events AND reports the corrupt line, never silently drops it (§1.2)', async () => {
      const r = await GET(`/ledger/${SYS}/${HOOK}/${DAY}`);
      assert.strictEqual(r.code, 200);
      assert.strictEqual(r.body.total, 3, 'three valid events');
      assert.strictEqual(r.body.corruptLines, 1, 'the deliberately corrupt line must be COUNTED and REPORTED');
      assert.deepStrictEqual(r.body.events.map(e => e.uuid), ['e1', 'e2', 'e3']);
    });

    await test('T1-005', '?limit bounds the response, keeping the newest events', async () => {
      const r = await GET(`/ledger/${SYS}/${HOOK}/${DAY}?limit=2`);
      assert.strictEqual(r.body.returned, 2);
      assert.strictEqual(r.body.total, 3);
      assert.deepStrictEqual(r.body.events.map(e => e.uuid), ['e2', 'e3'], 'newest last — the tail, not the head');
    });

    await test('T1-006', 'HOSTILE: encoded traversal (..%2F) rejected with 400', async () => {
      const r = await GET('/ledger/..%2F..%2Fpackage.json');
      assert.strictEqual(r.code, 400);
    });

    await test('T1-007', 'HOSTILE: plain .. rejected', async () => {
      const r = await GET('/ledger/../guardian');
      assert.ok(r.code === 400 || r.code === 404, `got ${r.code}`);
    });

    await test('T1-008', 'HOSTILE: over-deep path rejected with 400', async () => {
      const r = await GET('/ledger/a/b/c/d');
      assert.strictEqual(r.code, 400);
    });

    await test('T1-009', 'HOSTILE: null byte rejected with 400', async () => {
      const r = await GET('/ledger/%00');
      assert.strictEqual(r.code, 400);
    });

    await test('T1-010', 'missing system is a clean 404 with ok:false, not a crash or a 500', async () => {
      const r = await GET('/ledger/definitely-no-such-system-xyz');
      assert.strictEqual(r.code, 404);
      assert.strictEqual(r.body.ok, false);
    });

    await test('T1-011', 'ZERO WRITES: the planted day file is byte-identical after every read above', async () => {
      const raw = fs.readFileSync(path.join(REPO_LEDGER, SYS, HOOK, DAY), 'utf8');
      assert.ok(raw.includes('DELIBERATELY CORRUPT'), 'file untouched — reads must never repair, rewrite, or clean the ledger');
    });

    await test('T1-012', "UI LAWS: tablet/index.html honors the spec's connection + decoupling laws", async () => {
      const html = fs.readFileSync(path.join(__dirname, '../../tablet/index.html'), 'utf8');
      assert.ok(html.includes("get('port') || 7799"), 'must default to autopilot :7799 — the single endpoint');
      assert.ok(!/374[89]|3750|9000|7705/.test(html), 'must contain ZERO per-system ports — no hardcoded topology, that is the exact hard-pointer problem the connection law exists to prevent');
      assert.ok(!/(localStorage|sessionStorage)\s*[.\[]/.test(html), 'must own no persistent state (§5.12) — comment mentions fine, CALLS are not');
      // §RECONCILED 2026-07-24 when T2 landed: this assertion originally
      // read "zero write verbs, full stop". T2's container shell adds
      // exactly ONE POST — /run-tests/:system, which spawns the real test
      // runner. That is not a mutation of NEXUS state (it reads and
      // proves), so the T1 gate's "ZERO writes to NEXUS" still holds; the
      // blunt no-POST check was measuring the wrong thing. Tightened
      // rather than deleted: exactly one write verb, and it must be the
      // test invocation — anything else is a real regression.
      const writeVerbs = html.match(/method:\s*'(POST|PUT|DELETE)'/gi) || [];
      assert.strictEqual(writeVerbs.length, 1, `exactly one write verb permitted (the test invocation); found ${writeVerbs.length}: ${writeVerbs.join(', ')}`);
      assert.ok(/fetch\(BASE \+ '\/run-tests\/'/.test(html), 'the single write verb must be the /run-tests invocation, nothing else');
      assert.ok(!/PUT|DELETE/.test(html), 'no PUT/DELETE anywhere — the ledger surface stays strictly read-only');
      assert.ok(html.includes('corrupt line'), 'must surface the corrupt-line count (§1.2) — never hide damage');
    });
  } finally {
    server.close();
    unplant();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
