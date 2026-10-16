'use strict';
/**
 * tests/modules/test-work-funnel.test.js — FN0 (docs/2026-10-16-agent-work-funnel-phasemap.spec)
 * James, 2026-10-16: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk."
 * A fixture repo with each stop planted, so the test fails if a step answers what it cannot know or skips his order.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'funnel-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'funnel-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const WF = require(path.join(ROOT, 'lib/work-funnel.js'));
const AM = require(path.join(ROOT, 'lib/phase-map-auto.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'funnel-tree-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true }); fs.writeFileSync(path.join(tree, rel), text); };
put('lib/ledger.js', "'use strict';\nconst store = require('./store.js');\nfunction record(x) { return store.put(x); }\nmodule.exports = { record };\n");
put('lib/store.js', "'use strict';\nfunction put(x) { return x; }\nmodule.exports = { put };\n");
put('lib/gizmo.js', "'use strict';\nmodule.exports = { spin: () => 1 };\n");
put('lib/orphan.js', "'use strict';\nmodule.exports = {};\n");
put('lib/legacy.js', "'use strict';\nmodule.exports = {};\n");
const MAP = `phases:
  L1_ledger_records:
    status: OPEN
    files: [lib/ledger.js]
    specs: [docs/ledger.spec]
    does: "the ledger records through the store"
  G1_gizmo_spins:
    status: OPEN
    files: [lib/gizmo.js]
    does: "the gizmo spins"
  O1_old_work:
    status: DONE 0.1.0
    files: [lib/legacy.js]
    specs: [docs/legacy.spec]
`;
const maps = [{ path: 'docs/x-phasemap.spec', text: MAP }];
const specsOf = (p) => (p === 'lib/ledger.js' ? ['docs/ledger.spec'] : p === 'lib/gizmo.js' ? ['docs/gizmo.spec'] : []);
const env = AM.envFromTree(tree, { specsOf });
const run = (request, extra = {}) => WF.funnel({ request, root: tree, maps, specsOf, env, ...extra });

(async () => {
  await test('WF-01', 'a question is answered directly: explain does not enter the funnel', async () => {
    const f = run('explain how lib/ledger.js works');
    assert.strictEqual(f.intent, 'explain'); assert.strictEqual(f.enters, false); assert.strictEqual(f.dependencies, null);
  });

  await test('WF-02', 'all four, in his order: dependencies (with what they require), spec, the open phase, its chunks', async () => {
    const f = run('change lib/ledger.js so it records the source');
    assert.strictEqual(f.stoppedAt, null, JSON.stringify(f.missing));
    assert.deepStrictEqual(f.dependencies.files.map(x => x.path), ['lib/ledger.js']);
    assert.deepStrictEqual(f.dependencies.requires.map(x => x.path), ['lib/store.js']);
    assert.deepStrictEqual(f.spec.specs.map(s => s.path), ['docs/ledger.spec']);
    assert.strictEqual(f.phase.id, 'L1_ledger_records'); assert.deepStrictEqual(f.phase.overlap, ['lib/ledger.js']);
    assert.deepStrictEqual(f.chunks.map(c => [c.kind, c.file]), [['build', 'lib/ledger.js']], 'the unit is the chunk (his decision)');
    assert.ok(f.chunks[0].exports.includes('record'), 'the chunk carries what the file exports now');
  });

  await test('WF-03', 'nothing named that exists: it stops at dependencies and says so; nothing later is guessed', async () => {
    const f = run('change the thing that does the stuff');
    assert.strictEqual(f.stoppedAt, 'dependencies'); assert.strictEqual(f.spec, null); assert.strictEqual(f.phase, null); assert.deepStrictEqual(f.chunks, []);
  });

  await test('WF-04', 'no spec owns the files: it stops at spec (the spec comes first)', async () => {
    const f = run('change lib/orphan.js');
    assert.strictEqual(f.stoppedAt, 'spec'); assert.match(f.missing[0].why, /no spec owns lib\/orphan\.js/); assert.strictEqual(f.phase, null);
  });

  await test('WF-05', 'only a finished phase maps it: it stops at phase, naming the finished one; a closed phase is never picked', async () => {
    const f = run('build more in lib/legacy.js');
    assert.strictEqual(f.stoppedAt, 'phase'); assert.match(f.missing[0].why, /only finished ones: O1_old_work/);
    assert.strictEqual(f.spec.specs[0].path, 'docs/legacy.spec', 'the spec came from the phase that maps the file');
  });

  await test('WF-06', 'a short request may name a module by its plain word ("the gizmo"), when one file carries it', async () => {
    const f = run('fix the gizmo so it spins twice');
    assert.strictEqual(f.stoppedAt, null, JSON.stringify(f.missing));
    assert.match(f.dependencies.files[0].why, /names the module gizmo/);
    assert.strictEqual(f.phase.id, 'G1_gizmo_spins');
  });

  await test('WF-07', 'lines(): the four answers as plain lines', async () => {
    const L = WF.lines(run('change lib/ledger.js'));
    assert.ok(L.some(l => /^1 dependencies/.test(l)) && L.some(l => /^2 spec/.test(l)) && L.some(l => /^3 phase: docs\/x-phasemap\.spec::L1_ledger_records/.test(l)) && L.some(l => /^4 chunks: 1\. lib\/ledger\.js/.test(l)), L.join('\n'));
  });

  await test('WF-08', 'the route and the command: POST /api/repos/:uuid/funnel answers through the real router (a request is required)', async () => {
    const api = await import('../../idearium/api/index.js');
    let made = null;
    for (let i = 0; i < 40; i++) { made = await api._route('POST', '/api/repos', { name: 'funnel-fixture', bare: true, source: 'create' }); if (made.json && made.json.repo) break; await new Promise(r => setTimeout(r, 100)); }
    const uuid = made.json.repo.uuid;
    const none = await api._route('POST', `/api/repos/${uuid}/funnel`, {});
    assert.strictEqual(none.status, 400);
    const r = await api._route('POST', `/api/repos/${uuid}/funnel`, { request: 'change the thing' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const d = r.json.data || r.json;
    assert.strictEqual(d.stoppedAt, 'dependencies'); assert.ok(Array.isArray(d.lines) && d.lines.length);
    const rc = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    assert.ok(rc.includes("key: 'repo.funnel'"));
  });

  for (const d of [tree, _data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
