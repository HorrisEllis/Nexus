'use strict';
// run-all: timeout 240000
/**
 * tests/modules/test-phase-ledger.test.js — SL11, the phase ledger (docs/2026-10-23-self-building-loop-phasemap.spec SL11_the_phase_ledger_and_its_gate).
 * James, 2026-11-03: "We need a fucking ledger too of phases, and we need, like, so they stop getting written" · 2026-11-06: "we also need to add a
 * phase ledger, to idearium, then add to claude.md to to always log in the ledger".
 *   PL-01  the table over Nexus's real maps: every phase a row; ids written in more than one map; TB1 and PF1 listed as reused (SL11's own proof)
 *   PL-02  the gate: a phase sharing a file, or the same intent, is named to expand; unrelated work finds nothing
 *   PL-03  the log: an event appended and read back in order; a phase in no map refused (except written); a bad event, no why, an id in two maps
 *          without its map — each refused, said; the file is one JSON line per event
 *   PL-04  through Idearium's real API: GET ledger, GET history, POST covers; POST log refused with why (nothing written to the real ledger)
 *   PL-05  the command rows: phases ledger | log | history | covers
 *   PL-06  the Phases tab: a Ledger view with the counts, the log form, the latest events and the duplicate ids; a phase's detail has its ledger
 *   PL-07  CLAUDE.md and docs/CLAUDE.md carry his rule: always log in the ledger
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const L = require(path.join(ROOT, 'idearium/spec-engine/phase-ledger.cjs'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

// a fixture tree: two maps (one phase id in both), lib's parsers linked in
function fixture() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')); fs.mkdirSync(path.join(r, 'docs')); fs.symlinkSync(path.join(ROOT, 'lib'), path.join(r, 'lib'), 'dir');
  fs.writeFileSync(path.join(r, 'docs', '2026-01-01-a-phasemap.spec'), `phases:
  AA1_the_store:
    status: OPEN
    depends_on: []
    files: [shop/store.js, shop/store.test.js]
    does: "keep every component built in its own folder with its dependencies pinned, and find one again by its contract"
  AA2_the_page:
    status: OPEN
    depends_on: [AA1_the_store]
    files: [shop/page.html]
    does: "draw the shelf"
  ZZ1_twice:
    status: OPEN
    depends_on: []
    files: [x/one.js]
    does: "one thing"
`);
  fs.writeFileSync(path.join(r, 'docs', '2026-01-02-b-phasemap.spec'), `phases:
  ZZ1_twice:
    status: OPEN
    depends_on: []
    files: [x/two.js]
    does: "another thing"
`);
  return r;
}

(async () => {
  console.log('\n⬡  the phase ledger (SL11)\n');

  await test('PL-01', 'the table over the real maps; ids in more than one map; TB1 and PF1 reused', () => {
    const rows = L.rows({ root: ROOT });
    assert.ok(rows.length > 2000, `${rows.length} phases`); assert.ok(rows.every(r => r.id && r.map && Array.isArray(r.files)));
    assert.ok(rows.some(r => r.id === 'SL11_the_phase_ledger_and_its_gate'));
    const reused = L.duplicates(rows).map(d => d.id); assert.ok(reused.includes('TB1') && reused.includes('PF1'), 'TB1 and PF1 listed (SL11 proof)');
    const exact = L.exactDuplicates(rows); assert.ok(exact.length > 0 && exact.every(d => d.maps.length > 1));
    const led = L.ledger({ root: ROOT }); assert.strictEqual(led.total, rows.length); assert.strictEqual(led.file, 'idearium/phases/LEDGER.jsonl');
  });

  await test('PL-02', 'the gate: a shared file or the same intent names the phase to expand; unrelated work finds nothing', () => {
    const r = fixture();
    const byFile = L.covers({ root: r, files: ['shop/store.js'] }); assert.strictEqual(byFile[0].id, 'AA1_the_store'); assert.match(byFile[0].why, /shares 1 file/);
    const byIntent = L.covers({ root: r, does: 'keep every component built in its own folder, dependencies pinned' }); assert.strictEqual(byIntent[0].id, 'AA1_the_store'); assert.match(byIntent[0].why, /the same intent/);
    assert.deepStrictEqual(L.covers({ root: r, files: ['other/thing.js'], does: 'paint the sky purple' }), []);
  });

  await test('PL-03', 'the log: appended and read back; refusals said', () => {
    const r = fixture();
    const a = L.log({ root: r, phase: 'AA1_the_store', event: 'built', why: 'the store answers', by: 'coder', version: '0.0.1', at: '2026-11-06T10:00:00.000Z' });
    assert.ok(a.ok, a.error); assert.strictEqual(a.entry.map, 'docs/2026-01-01-a-phasemap.spec');
    assert.ok(L.log({ root: r, phase: 'AA1_the_store', event: 'closed', why: 'proof passed', at: '2026-11-06T11:00:00.000Z' }).ok);
    assert.deepStrictEqual(L.history({ root: r, phase: 'AA1_the_store' }).map(e => e.event), ['built', 'closed']);
    assert.deepStrictEqual(L.history({ root: r, phase: 'AA1' }).map(e => e.event), ['built', 'closed'], 'by its short id too');
    assert.match(L.log({ root: r, phase: 'NO1_nowhere', event: 'built', why: 'x' }).error, /no phase NO1_nowhere in any map: write it first/);
    assert.ok(L.log({ root: r, phase: 'NO1_nowhere', event: 'written', why: 'about to write it' }).ok, 'written may be logged as it is written');
    assert.match(L.log({ root: r, phase: 'AA1_the_store', event: 'shipped', why: 'x' }).error, /event is one of written, expanded, built, closed, note/);
    assert.match(L.log({ root: r, phase: 'AA1_the_store', event: 'note', why: '  ' }).error, /say why/);
    assert.match(L.log({ root: r, phase: 'ZZ1_twice', event: 'note', why: 'x' }).error, /is in 2 maps/);
    assert.ok(L.log({ root: r, phase: 'ZZ1_twice', event: 'note', why: 'x', map: 'docs/2026-01-02-b-phasemap.spec' }).ok);
    const lines = fs.readFileSync(path.join(r, L.LEDGER_REL), 'utf8').trim().split('\n'); assert.strictEqual(lines.length, 4); lines.forEach(l => JSON.parse(l));
    const led = L.ledger({ root: r }); assert.strictEqual(led.logged, 2); assert.strictEqual(led.recent[0].phase, 'ZZ1_twice', 'newest first');
    assert.deepStrictEqual(L.exactDuplicates(L.rows({ root: r })).map(d => d.id), ['ZZ1_twice']);
  });

  await test('PL-04', 'through Idearium\'s real API: ledger, history, covers; a bad log refused, nothing written', async () => {
    const before = fs.existsSync(path.join(ROOT, L.LEDGER_REL)) ? fs.readFileSync(path.join(ROOT, L.LEDGER_REL), 'utf8') : null;
    const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
    const g = await quiet(() => api._route('GET', '/api/phases/ledger?limit=5'));
    assert.strictEqual(g.status, 200, JSON.stringify(g.json).slice(0, 200)); assert.ok(g.json.total > 2000 && Array.isArray(g.json.exactDuplicates) && Array.isArray(g.json.recent));
    const h = await quiet(() => api._route('GET', '/api/phases/ledger/history?phase=SL11_the_phase_ledger_and_its_gate')); assert.strictEqual(h.status, 200); assert.ok(Array.isArray(h.json.history));
    const c = await quiet(() => api._route('POST', '/api/phases/ledger/covers', { files: ['lib/component-store.js'] })); assert.strictEqual(c.status, 200); assert.ok(c.json.covers.length > 0);
    const bad = await quiet(() => api._route('POST', '/api/phases/ledger/log', { phase: 'SL11_the_phase_ledger_and_its_gate', event: 'shipped', why: 'x' }));
    assert.strictEqual(bad.status, 400); assert.match(JSON.stringify(bad.json), /event is one of/);
    const after = fs.existsSync(path.join(ROOT, L.LEDGER_REL)) ? fs.readFileSync(path.join(ROOT, L.LEDGER_REL), 'utf8') : null; assert.strictEqual(after, before, 'the real ledger untouched');
  });

  await test('PL-05', 'the command rows: phases ledger | log | history | covers', () => {
    const R = require(path.join(ROOT, 'idearium/cli/route-commands.js')).SPEC; const row = (k) => R.find(r => r.key === k);
    assert.deepStrictEqual(row('phases.ledger').req({ args: [], flags: { system: 'cos' } }), { method: 'GET', path: '/api/phases/ledger?system=cos&limit=20' });
    assert.deepStrictEqual(row('phases.log').req({ args: ['SL11_x', 'built', 'it', 'answers'], flags: { version: '0.60.419' } }).body, { phase: 'SL11_x', event: 'built', why: 'it answers', by: 'person', version: '0.60.419', map: null });
    assert.strictEqual(row('phases.log').need({ args: ['SL11_x'] }), '<phase> <event> "<why>"');
    assert.strictEqual(row('phases.history').req({ args: ['SL11'], flags: {} }).path, '/api/phases/ledger/history?phase=SL11');
    assert.deepStrictEqual(row('phases.covers').req({ args: ['a.js'], flags: { does: 'x' } }).body, { files: ['a.js'], does: 'x' });
  });

  await test('PL-06', 'the Phases tab: the Ledger view, its log form, the latest events, the duplicate ids; the detail\'s ledger', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    assert.match(src, /\['ledger', 'ledger'\]/); assert.match(src, /PHASES\.view === 'ledger'\) body = _phLedger\(\)/);
    assert.match(src, /<div class="ph-d-sec">ledger<\/div><div class="ph2-files" id="ph-ledger-hist"/);
    assert.match(src, /`;\n  setTimeout\(_phLedgerHistory, 0\);/, 'filled after the paint, outside the template');
    const posts = [];
    const ctx = vm.createContext({ console, setTimeout: () => 0, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null, querySelector: () => null },
      escapeHtml: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'), api: async (p, o) => { posts.push([p, o && o.body]); return { ok: true, total: 3, maps: 2, done: 1, open: 2, logged: 1, file: 'idearium/phases/LEDGER.jsonl', exactDuplicates: [{ id: 'A1', maps: ['a', 'b'] }], recent: [{ at: '2026-11-06T10:00:00.000Z', event: 'built', phase: 'SL11_x', by: 'coder', why: 'it answers', version: '0.60.419' }] }; } });
    vm.runInContext(src + '\n;globalThis.__P = PHASES; globalThis.__L = _phLedger; globalThis.__load = phLedgerLoad;', ctx);
    assert.match(ctx.__L(), /reading the ledger/);
    await ctx.__load(); const html = ctx.__L();
    for (const w of ['ledger · 3 phases in 2 maps · 1 done · 2 open · 1 logged', 'id="ph-led-phase"', 'onclick="phLedgerLog()"', '<b>SL11_x</b>', 'it answers', 'A1', 'ids written in more than one map · 1']) assert.ok(html.includes(w), `${w} in the view`);
    assert.strictEqual(posts[0][0], '/api/phases/ledger?limit=40');
  });

  await test('PL-07', 'CLAUDE.md carries his rule: always log in the ledger', () => {
    for (const f of ['CLAUDE.md', 'docs/CLAUDE.md']) { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); assert.match(t, /always log in the (phase )?ledger/i, f); assert.match(t, /phase-ledger\.cjs log/, f); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
