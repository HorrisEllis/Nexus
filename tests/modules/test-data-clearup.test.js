'use strict';
/**
 * tests/modules/test-data-clearup.test.js — DL0/DL1 (docs/data-layout.spec): the census places every file, and the clear-up tool
 * moves safely and reverses exactly.
 * James, 2026-10-21: "make a file clearup tool, for safely moving and mapping tools." · "no data folder in the root."
 *
 *   DC-01  census: each file placed by the spec's ownership table (first match; <system> only when that folder exists; else ask),
 *          with the code files that still name its old path
 *   DC-02  plan: a path code still names waits (skipped-refs) unless forced; ask never moves; archive goes to _archive/clearup
 *   DC-03  apply: manifest first; moved files hash-equal at the destination; a destination with the same bytes → the source is
 *          archived as a duplicate; a different file → conflict, both untouched; emptied folders pruned; verify ok
 *   DC-04  rollback restores every moved and archived file byte for byte
 *   DC-05  the real spec's table: no rule sends anything under the root data/; the tool runs on this repo's data/ read-only
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '../..');
const DC = require(path.join(ROOT, 'lib/data-clearup.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const put = (root, p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };
const hashTree = (dir) => { const out = {}; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else out[path.relative(dir, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } })(dir); return out; };
const RULES = [
  { match: 'ledger/test/*', to: '_archive/clearup/test-residue/ledger/test/*', owner: 'none', status: 'archive', why: 'residue' },
  { match: 'ledger/<system>/*', to: '<system>/data/event_ledgers/*', owner: '<system>', status: 'move', why: 'ledger-writer' },
  { match: 'guardian/*', to: 'guardian/data/*', owner: 'guardian', status: 'move', why: 'guardian' },
  { match: 'vector-index/*', to: 'cortex/data/memory/vector-index/*', owner: 'cortex', status: 'move', why: 'memory' },
  { match: 'changelog-snapshot.json', to: 'orchestrator/data/changelog-snapshot.json', owner: 'orchestrator', status: 'move', why: 'one ref' },
];
function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  for (const s of ['guardian', 'cortex', 'orchestrator']) fs.mkdirSync(path.join(root, s));
  put(root, 'data/ledger/cortex/a/2026-10-01.jsonl', '{"a":1}\n');
  put(root, 'data/ledger/ghost/x.jsonl', 'who\n');
  put(root, 'data/ledger/test/t.jsonl', 'residue\n');
  put(root, 'data/guardian/state.json', '{"g":1}');
  put(root, 'data/guardian/same.json', 'same');
  put(root, 'guardian/data/same.json', 'same');
  put(root, 'data/guardian/clash.json', 'mine');
  put(root, 'guardian/data/clash.json', 'theirs');
  put(root, 'data/vector-index/index.json', '[1,2,3]');
  put(root, 'data/changelog-snapshot.json', '{}');
  put(root, 'orchestrator/lib/changelog.js', "const p = path.join(ROOT, 'data', 'changelog-snapshot.json');\n");
  return root;
}

console.log('\ntest-data-clearup — every file placed; moved safely; reversed exactly');

test('DC-01', 'census: rules, <system> only when it exists, refs to the old path', () => {
  const root = tree();
  const c = DC.census({ root, rules: RULES, tracked: new Set() });
  const by = Object.fromEntries(c.entries.map(e => [e.path, e]));
  assert.strictEqual(by['data/ledger/cortex/a/2026-10-01.jsonl'].to, 'cortex/data/event_ledgers/a/2026-10-01.jsonl');
  assert.strictEqual(by['data/ledger/ghost/x.jsonl'].status, 'ask');
  assert.ok(/no system folder 'ghost'/.test(by['data/ledger/ghost/x.jsonl'].why));
  assert.strictEqual(by['data/vector-index/index.json'].to, 'cortex/data/memory/vector-index/index.json');
  assert.deepStrictEqual(by['data/changelog-snapshot.json'].refs, ['orchestrator/lib/changelog.js']);
  assert.ok(/\| cortex \| 2 \|/.test(DC.toMarkdown(c)), DC.toMarkdown(c));
});

test('DC-02', 'plan: refs wait unless forced; ask never moves; archive planned', () => {
  const root = tree();
  const c = DC.census({ root, rules: RULES, tracked: new Set() });
  const p = Object.fromEntries(DC.plan(c).map(m => [m.from, m]));
  assert.strictEqual(p['data/changelog-snapshot.json'].status, 'skipped-refs');
  assert.strictEqual(p['data/ledger/ghost/x.jsonl'].status, 'ask');
  assert.ok(p['data/ledger/test/t.jsonl'].archive);
  assert.strictEqual(DC.plan(c, { force: true }).find(m => m.from === 'data/changelog-snapshot.json').status, 'planned');
});

let shared = null;
test('DC-03', 'apply: manifest first, hashes equal, duplicate archived, conflict untouched, folders pruned, verify ok', () => {
  const root = tree(); const before = hashTree(root);
  const r = DC.apply(DC.plan(DC.census({ root, rules: RULES, tracked: new Set() })), { root, by: 'test', stamp: 't1' });
  assert.ok(fs.existsSync(path.join(root, r.manifestPath)));
  const after = hashTree(root);
  assert.strictEqual(after['cortex/data/event_ledgers/a/2026-10-01.jsonl'], before['data/ledger/cortex/a/2026-10-01.jsonl']);
  assert.strictEqual(after['guardian/data/state.json'], before['data/guardian/state.json']);
  assert.ok(r.archived.some(x => x.from === 'data/guardian/same.json' && x.status === 'duplicate'));
  assert.ok(r.archived.some(x => x.from === 'data/ledger/test/t.jsonl' && x.status === 'archived'));
  assert.ok(r.conflicts.some(x => x.from === 'data/guardian/clash.json'));
  assert.strictEqual(fs.readFileSync(path.join(root, 'data/guardian/clash.json'), 'utf8'), 'mine');
  assert.strictEqual(fs.readFileSync(path.join(root, 'guardian/data/clash.json'), 'utf8'), 'theirs');
  assert.ok(fs.existsSync(path.join(root, 'data/ledger/ghost/x.jsonl')), 'ask stays');
  assert.ok(!fs.existsSync(path.join(root, 'data/vector-index')), 'an emptied folder is pruned');
  assert.strictEqual(r.failed.length, 0);
  assert.ok(DC.verify(r.manifestPath, { root }).ok);
  shared = { root, before, manifest: r.manifestPath };
});

test('DC-04', 'rollback restores every file byte for byte', () => {
  const { root, before, manifest } = shared;
  const r = DC.rollback(manifest, { root });
  assert.strictEqual(r.failed.length, 0);
  const after = hashTree(root);
  for (const [p, h] of Object.entries(before)) assert.strictEqual(after[p], h, p);
});

test('DC-05', 'the real table never targets the root data/; the real census runs read-only', () => {
  const rules = DC.loadRules(ROOT);
  assert.ok(rules.length >= 20);
  for (const r of rules) assert.ok(!/^data\//.test(r.to), `${r.match} → ${r.to}`);
  const before = fs.existsSync(path.join(ROOT, 'data')) ? Object.keys(hashTree(path.join(ROOT, 'data'))).length : 0;
  const c = DC.census({ root: ROOT });
  assert.strictEqual(c.entries.length, before);
  assert.ok(c.entries.every(e => e.status === 'ask' || e.to), 'every file placed or asked');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
