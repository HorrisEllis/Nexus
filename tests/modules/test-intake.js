'use strict';
/**
 * tests/modules/test-intake.js — a download is a claim, not a change.
 * UUID: nexus-test-intake-v1-0000-2026-0818-001
 *
 * §12.1. Every test here runs against a real temp tree and real files on
 * disk — nothing is mocked, because the whole module is about what actually
 * happens to a filesystem.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT   = path.join(__dirname, '../..');
const intake = require(path.join(ROOT, 'lib/intake.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-test-'));
const TREE   = path.join(TMP, 'tree');       // stands in for the NEXUS repo
const DROPS  = path.join(TMP, 'downloads');  // stands in for Downloads
const STAGE  = path.join(TMP, 'intake');     // where drops are staged

function write(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); }
function tree(rel)   { return path.join(TREE, rel); }

fs.mkdirSync(TREE, { recursive: true });
write(tree('lib/hat-forge.js'), 'ORIGINAL hat-forge\n');
write(tree('lib/scheduler.js'), 'ORIGINAL scheduler\n');

let n = 0;
function makeDrop(files, name) {
  const dir = path.join(DROPS, `${name || 'drop'}-${n++}`);
  for (const [rel, body] of Object.entries(files)) write(path.join(dir, rel), body);
  return dir;
}
const opts = { intakeDir: STAGE, root: TREE };

(() => {
  console.log('\nlib/intake.js — staged drops, gated promotion\n');

  test('IN-001', 'the wrapper directory is stripped only onto a path that really exists', () => {
    const d = makeDrop({ 'nexus-hat-identity/lib/hat-forge.js': 'NEW hat-forge\n' });
    const r = intake.stage({ source: d, ...opts });
    assert.ok(r.ok, JSON.stringify(r.errors));
    const c = r.contract.claims[0];
    assert.strictEqual(c.target, 'lib/hat-forge.js');
    assert.strictEqual(c.mapped, true);
    assert.strictEqual(c.effect, 'OVERWRITE');
  });

  test('IN-002', 'a path that cannot be proven is UNPLACED, never guessed at', () => {
    const d = makeDrop({ 'somewhere/lib/brand-new-thing.js': 'x\n' });
    const r = intake.stage({ source: d, ...opts });
    const c = r.contract.claims[0];
    assert.strictEqual(c.effect, 'UNPLACED');
    assert.strictEqual(c.mapped, false);
  });

  test('IN-003', 'a re-download of the same bytes is IDENTICAL, not a pending change', () => {
    const d = makeDrop({ 'pkg/lib/scheduler.js': 'ORIGINAL scheduler\n' });
    const r = intake.stage({ source: d, ...opts });
    assert.strictEqual(r.contract.claims[0].effect, 'IDENTICAL');
    assert.strictEqual(r.contract.summary.overwrite, 0);
  });

  test('IN-004', 'staging changes NOTHING in the tree', () => {
    const before = fs.readFileSync(tree('lib/hat-forge.js'), 'utf8');
    intake.stage({ source: makeDrop({ 'p/lib/hat-forge.js': 'HOSTILE\n' }), ...opts });
    assert.strictEqual(fs.readFileSync(tree('lib/hat-forge.js'), 'utf8'), before);
  });

  test('IN-005', 'the contract records real provenance, and a real hash', () => {
    const d = makeDrop({ 'p/lib/hat-forge.js': 'NEW\n' });
    const r = intake.stage({ source: d, provenance: { provider: 'claude', chatUrl: 'https://claude.ai/chat/abc', filename: 'hat-forge.js' }, ...opts });
    assert.strictEqual(r.contract.provenance.provider, 'claude');
    assert.strictEqual(r.contract.provenance.chatUrl, 'https://claude.ai/chat/abc');
    assert.match(r.contract.claims[0].sha256, /^[0-9a-f]{64}$/);
  });

  test('IN-006', 'a freshly staged drop has NO verdict and is not promotable', () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/hat-forge.js': 'NEW\n' }), ...opts });
    assert.strictEqual(r.contract.verdict, null);
    assert.strictEqual(r.contract.state, intake.STATE.STAGED);
    const p = intake.promote(r.dropId, { by: 'user', ...opts });
    assert.strictEqual(p.ok, false);
    assert.match(p.reason, /no approving verdict/);
  });

  test('IN-007', "an agent's own assessment cannot become a verdict", () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/hat-forge.js': 'NEW\n' }), ...opts });
    for (const by of ['chatgpt', 'claude', 'copilot', 'agent', undefined]) {
      const v = intake.recordVerdict(r.dropId, { by, approved: true }, STAGE);
      assert.strictEqual(v.ok, false, `"${by}" must not be able to approve its own drop`);
    }
    assert.strictEqual(intake.read(r.dropId, STAGE).verdict, null);
  });

  test('IN-008', 'a missing answer is not an approval', () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/hat-forge.js': 'NEW\n' }), ...opts });
    const v = intake.recordVerdict(r.dropId, { by: 'raid.verify' }, STAGE);
    assert.strictEqual(v.ok, false);
    assert.match(v.reason, /approved must be true or false/);
  });

  test('IN-009', 'a gate REFUSAL blocks promotion just as hard as no verdict', () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/hat-forge.js': 'NEW\n' }), ...opts });
    intake.recordVerdict(r.dropId, { by: 'raid.verify', approved: false, reason: 'contract-shape' }, STAGE);
    assert.strictEqual(intake.read(r.dropId, STAGE).state, intake.STATE.REFUSED);
    assert.strictEqual(intake.promote(r.dropId, { by: 'user', ...opts }).ok, false);
  });

  test('IN-010', 'an approved drop still refuses a promoter that is not the user (§IP-5)', () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/hat-forge.js': 'NEW\n' }), ...opts });
    intake.recordVerdict(r.dropId, { by: 'raid.verify', approved: true }, STAGE);
    for (const by of ['chatgpt', 'copilot', 'raid.verify', undefined]) {
      const p = intake.promote(r.dropId, { by, ...opts });
      assert.strictEqual(p.ok, false, `"${by}" must not be able to promote`);
    }
    assert.strictEqual(fs.readFileSync(tree('lib/hat-forge.js'), 'utf8'), 'ORIGINAL hat-forge\n');
  });

  test('IN-011', 'gated + user promotes for real, and backs up what it replaced first', () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/hat-forge.js': 'PROMOTED CONTENT\n' }), ...opts });
    intake.recordVerdict(r.dropId, { by: 'raid.verify', approved: true }, STAGE);
    const p = intake.promote(r.dropId, { by: 'user', ...opts });
    assert.ok(p.ok, JSON.stringify(p.failed));
    assert.strictEqual(fs.readFileSync(tree('lib/hat-forge.js'), 'utf8'), 'PROMOTED CONTENT\n');
    assert.strictEqual(fs.readFileSync(path.join(p.backupDir, 'lib/hat-forge.js'), 'utf8'), 'ORIGINAL hat-forge\n');
  });

  test('IN-012', 'rollback restores exactly what promote replaced', () => {
    const r = intake.rollback(intake.list(STAGE).find(c => c.promoted).dropId, opts);
    assert.ok(r.ok);
    assert.strictEqual(fs.readFileSync(tree('lib/hat-forge.js'), 'utf8'), 'ORIGINAL hat-forge\n');
  });

  test('IN-013', 'an UNPLACED file is never written, even in an approved drop', () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/scheduler.js': 'NEW sched\n', 'p/wat/mystery.js': 'x\n' }), ...opts });
    intake.recordVerdict(r.dropId, { by: 'raid.verify', approved: true }, STAGE);
    const p = intake.promote(r.dropId, { by: 'user', ...opts });
    assert.ok(p.written.includes('lib/scheduler.js'));
    assert.ok(p.skipped.some(s => /mystery/.test(s.target)), JSON.stringify(p.skipped));
    assert.strictEqual(fs.existsSync(path.join(TREE, 'wat/mystery.js')), false, 'a guessed path must never be written');
    intake.rollback(r.dropId, opts);
  });

  test('IN-014', 'an archive is staged inert and stated, not half-handled', () => {
    const d = path.join(DROPS, 'zipdrop');
    write(path.join(d, 'files-9.zip'), 'PK\u0003\u0004 not really a zip');
    const r = intake.stage({ source: d, ...opts });
    assert.strictEqual(r.contract.summary.archives, 1);
    assert.deepStrictEqual(r.contract.summary.unexpandedArchives, ['files-9.zip']);
    assert.strictEqual(r.contract.claims[0].effect, 'UNPLACED', 'an unexpanded archive can never be promoted');
  });

  test('IN-015', 'a single downloaded file works, not just a folder', () => {
    const f = path.join(DROPS, 'hat-forge.js');
    write(f, 'SINGLE FILE\n');
    const r = intake.stage({ source: f, ...opts });
    assert.ok(r.ok);
    assert.strictEqual(r.contract.claims[0].target, 'hat-forge.js');
  });

  test('IN-016', 'a nonexistent source is refused loudly, with the path named', () => {
    const r = intake.stage({ source: path.join(TMP, 'not-there'), ...opts });
    assert.strictEqual(r.ok, false);
    assert.match(r.errors[0], /does not exist/);
  });

  test('IN-017', 'a verdict after promotion is refused — that is not a verdict', () => {
    const r = intake.stage({ source: makeDrop({ 'p/lib/scheduler.js': 'V2\n' }), ...opts });
    intake.recordVerdict(r.dropId, { by: 'raid.verify', approved: true }, STAGE);
    intake.promote(r.dropId, { by: 'user', ...opts });
    const late = intake.recordVerdict(r.dropId, { by: 'raid.verify', approved: false }, STAGE);
    assert.strictEqual(late.ok, false);
    intake.rollback(r.dropId, opts);
  });

  test('IN-018', 'every drop stays listed with its state — nothing is lost (§0.3)', () => {
    const all = intake.list(STAGE);
    assert.ok(all.length >= 10, `only ${all.length} drops listed`);
    for (const c of all) assert.ok(Object.values(intake.STATE).includes(c.state), `bad state ${c.state}`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = failed ? 1 : 0;
})();
