'use strict';
/**
 * tests/modules/test-hat-forge.js — hat IDENTITY: uuid, name, role.
 * UUID: nexus-test-hat-forge-v1-0000-2026-0818-001
 *
 * §12.1 — lib/hat-forge.js shipped permanent agent IDs on 2026-08-18 with no
 * test file at all (one file changed in f8d2a53; nothing under tests/ has ever
 * referenced hat-forge). Every defect this suite pins was found by running the
 * shipped code, not by reading it.
 *
 * The through-line: a hat has three identifiers doing three jobs —
 *   uuid    permanent, machine, for references
 *   name    mutable,   human,   for wearing and reading
 *   seedKey permanent, machine, for roles
 * and every defect below is two of them collapsed into one.
 *
 * §ISOLATION — this suite writes real rows. It requires cortex/memory/jaa-db.js
 * to honour JAA_DATA_DIR and REFUSES TO RUN if it does not, rather than
 * silently writing into the production store. That override is one line and is
 * not yet in the tree; see the check below for the exact edit.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'hat-forge-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

// ── §ISOLATION GATE — proven, not assumed ───────────────────────────────────
// A test that believes it is isolated and is not is worse than no isolation,
// because it is trusted. So this is a real write, checked on disk.
const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('hat_forge_isolation_probe', { id: 'probe', ts: Date.now() });
// Writes are debounced, so flush before looking — asking the filesystem a
// question the store has not answered yet would fail an isolation that works.
try { jaaDB._store().flushAll(); } catch (_) {}
const isolated = fs.existsSync(path.join(TMP, 'hat_forge_isolation_probe.json'));
if (!isolated) {
  console.log('  ✗ HAT-000 ISOLATION — cortex/memory/jaa-db.js ignores JAA_DATA_DIR');
  console.log('    This suite writes real hat rows and will not touch the production store.');
  console.log('    Fix (cortex/memory/jaa-db.js:35):');
  console.log("      const DATA_DIR = process.env.JAA_DATA_DIR || path.join(__dirname, '../../data/cortex/memory');");
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const hf    = require(path.join(ROOT, 'lib/hat-forge.js'));
const seed  = require(path.join(ROOT, 'lib/hat-seed.js'));
const sm    = require(path.join(ROOT, 'copilot/lib/self-model.js'));
const router= require(path.join(ROOT, 'lib/intent-hat-router.js'));
const sched = require(path.join(ROOT, 'lib/scheduler.js'));

const quiet = () => {};
let n = 0;
const uniq = (p) => `${p}_${Date.now().toString(36)}_${n++}`;
const mk = (over = {}) => hf.forge({ name: uniq('probe'), baseAgent: 'claude', ...over });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

(async () => {
  console.log('\nlib/hat-forge.js — permanent agent identity\n');

  // ── identity ──────────────────────────────────────────────────────────────
  await test('HAT-001', 'a forged hat\'s id is a real uuid, not its name', () => {
    const r = mk();
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.ok(UUID_RE.test(r.hat.uuid), `uuid was "${r.hat.uuid}"`);
    assert.notStrictEqual(r.hat.uuid, r.hat.name);
  });

  await test('HAT-002', 'the uuid and name namespaces cannot collide', () => {
    // A valid name can never look like a uuid — the name regex forbids the
    // hyphen. This is what makes uuid-before-name resolution safe.
    const r = hf.validate({ name: '550e8400-e29b-41d4-a716-446655440000', baseAgent: 'claude' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.startsWith('name:')), JSON.stringify(r.errors));
  });

  await test('HAT-003', 'rename keeps the uuid and moves the name', () => {
    const f = mk();
    const newName = uniq('renamed');
    const r = hf.rename(f.hat.name, newName);
    assert.ok(r.ok, r.reason);
    assert.strictEqual(r.hat.uuid, f.hat.uuid);
    assert.strictEqual(hf.get(f.hat.uuid).name, newName);
    assert.strictEqual(hf.get(f.hat.name), null, 'the old name must stop resolving');
  });

  await test('HAT-004', 'rename onto a name a DIFFERENT live hat holds is refused', () => {
    const a = mk(), b = mk();
    const r = hf.rename(a.hat.uuid, b.hat.name);
    assert.strictEqual(r.ok, false);
    assert.ok(/already worn by a different/.test(r.reason), r.reason);
  });

  await test('HAT-005', 'forging a name a live hat already holds is refused', () => {
    const a = mk();
    const r = hf.forge({ name: a.hat.name, baseAgent: 'ollama' });
    assert.strictEqual(r.ok, false, 'two live hats sharing a name makes get() arbitrary');
  });

  await test('HAT-006', 'a FREED name can be reused, as a genuinely separate identity', () => {
    const a = mk();
    const original = a.hat.name;
    hf.rename(a.hat.uuid, uniq('moved'));
    const b = hf.forge({ name: original, baseAgent: 'ollama' });
    assert.ok(b.ok, JSON.stringify(b.errors));
    assert.notStrictEqual(b.hat.uuid, a.hat.uuid);
    assert.strictEqual(hf.get(original).uuid, b.hat.uuid, 'the freed name must resolve to the NEW hat');
  });

  // ── §REGRESSION: legacy id === name (the live co_pilot row) ───────────────
  await test('HAT-007', 'a pre-uuid hat is migrated to a REAL uuid, not to its own old name', () => {
    // Exactly the shape in data/cortex/memory/forged_hats.json today.
    const legacyName = uniq('legacy');
    jaaDB.insert(hf.TABLE, { id: legacyName, uuid: legacyName, name: legacyName, baseAgent: 'ollama', ts: Date.now(), _forged: true });
    const r = hf.rename(legacyName, uniq('legacy_renamed'));
    assert.ok(r.ok, r.reason);
    assert.ok(UUID_RE.test(r.hat.uuid), `migrated uuid was "${r.hat.uuid}" — a name, not a uuid`);
    assert.strictEqual(r.hat.legacyId, legacyName, 'the old id must be kept so old references still resolve');
  });

  await test('HAT-008', 'after migration the old NAME is genuinely free, and resolves to whoever takes it', () => {
    const legacyName = uniq('legacy');
    jaaDB.insert(hf.TABLE, { id: legacyName, uuid: legacyName, name: legacyName, baseAgent: 'ollama', ts: Date.now(), _forged: true });
    const moved = hf.rename(legacyName, uniq('legacy_renamed'));
    const fresh = hf.forge({ name: legacyName, baseAgent: 'claude' });
    assert.ok(fresh.ok, JSON.stringify(fresh.errors));
    // Pre-fix this returned the RENAMED hat: its "uuid" was the string
    // legacyName, and get() tried the uuid map first.
    assert.strictEqual(hf.get(legacyName).uuid, fresh.hat.uuid, 'a name must never be outranked by an old id');
    assert.strictEqual(hf.get(moved.hat.uuid).uuid, moved.hat.uuid, 'and the migrated hat still resolves by uuid');
  });

  await test('HAT-009', 'a legacy id still resolves after migration — last, never first', () => {
    const legacyName = uniq('legacy');
    jaaDB.insert(hf.TABLE, { id: legacyName, uuid: legacyName, name: legacyName, baseAgent: 'ollama', ts: Date.now(), _forged: true });
    const m = hf.migrateLegacyIds();
    assert.ok(m.ok);
    const hat = hf.get(legacyName);
    assert.ok(hat && UUID_RE.test(hat.uuid), 'the old id must still find the hat');
    assert.strictEqual(hat.legacyId, legacyName);
  });

  await test('HAT-010', 'migrateLegacyIds is idempotent — a second run writes nothing', () => {
    hf.migrateLegacyIds();
    const again = hf.migrateLegacyIds();
    assert.deepStrictEqual(again.migrated, []);
  });

  // ── roles ─────────────────────────────────────────────────────────────────
  await test('HAT-011', 'a seedKey survives a rename', () => {
    const key = uniq('role');
    const f = mk({ seedKey: key });
    hf.rename(f.hat.uuid, uniq('renamed'));
    assert.strictEqual(hf.bySeedKey(key).uuid, f.hat.uuid);
  });

  await test('HAT-012', 'two live hats cannot hold the same role', () => {
    const key = uniq('role');
    mk({ seedKey: key });
    const second = hf.forge({ name: uniq('probe'), baseAgent: 'claude', seedKey: key });
    assert.strictEqual(second.ok, false);
    assert.ok(/already held/.test(second.errors[0]), JSON.stringify(second.errors));
  });

  await test('HAT-013', 'adoptSeedKey backfills a hat that has none, and never overwrites one', () => {
    const f = mk();
    const key = uniq('role');
    assert.ok(hf.adoptSeedKey(f.hat.uuid, key).ok);
    assert.strictEqual(hf.bySeedKey(key).uuid, f.hat.uuid);
    const overwrite = hf.adoptSeedKey(f.hat.uuid, uniq('role'));
    assert.strictEqual(overwrite.ok, false, 'a role label that can be reassigned is just a name again');
  });

  // ── §REGRESSION: rename a seed hat, reboot, get a duplicate ───────────────
  await test('HAT-014', 'renaming a seeded hat does NOT resurrect it on the next boot', () => {
    seed.seedHats({ knownTools: null, log: quiet });
    const before = hf.bySeedKey('the_auditor');
    assert.ok(before, 'seeding must fill the auditor role');
    hf.rename(before.uuid, 'the_inspector');

    seed.seedHats({ knownTools: null, log: quiet });   // the next boot

    const after = hf.bySeedKey('the_auditor');
    assert.strictEqual(after.uuid, before.uuid, 'the role must still be filled by the SAME hat');
    assert.strictEqual(after.name, 'the_inspector', 'under its new name');
    assert.strictEqual(hf.get('the_auditor'), null, 'and no empty duplicate under the old name');
    assert.strictEqual(hf.list().filter(h => h.seedKey === 'the_auditor').length, 1);
    hf.rename(after.uuid, 'the_auditor');              // restore for later tests
  });

  await test('HAT-015', 'a legacy seeded hat is ADOPTED into its role, not duplicated', () => {
    // The state actually on disk today: name-as-id, no uuid, no seedKey.
    for (const h of hf.list()) hf.revoke(h.uuid || h.id);
    jaaDB.insert(hf.TABLE, { id: 'the_builder', uuid: undefined, name: 'the_builder', baseAgent: 'claude', ts: Date.now(), _forged: true });
    const r = seed.seedHats({ knownTools: null, log: quiet });
    const held = hf.bySeedKey('the_builder');
    assert.ok(held, 'the role must be filled');
    assert.ok(UUID_RE.test(held.uuid), 'and by a hat with a real uuid now');
    assert.strictEqual(hf.list().filter(h => h.name === 'the_builder').length, 1, 'exactly one the_builder');
    assert.ok(r.migrated.includes('the_builder') || held.seedKey === 'the_builder');
  });

  // ── the worn hat ──────────────────────────────────────────────────────────
  await test('HAT-016', 'wearing a hat pins its uuid, not just its name', () => {
    const f = mk({ personaPrompt: 'probe persona' });
    const w = sm.setCurrentAgent(f.hat.name);
    assert.ok(w.ok, w.reason);
    assert.strictEqual(w.hatUuid, f.hat.uuid);
    assert.strictEqual(sm.getCurrentAgent().hatUuid, f.hat.uuid);
  });

  await test('HAT-017', 'the worn hat survives a rename — the name is resolved fresh', () => {
    const f = mk();
    sm.setCurrentAgent(f.hat.name);
    const newName = uniq('renamed');
    hf.rename(f.hat.uuid, newName);
    const cur = sm.getCurrentAgent();
    assert.strictEqual(cur.hatUuid, f.hat.uuid);
    assert.strictEqual(cur.hatName, newName, 'a stale worn name is a reference to nothing');
    assert.ok(!cur.hatMissing);
  });

  await test('HAT-018', 'a DIFFERENT hat taking the freed name is never silently worn', () => {
    const f = hf.forge({ name: uniq('worn'), baseAgent: 'claude', personaPrompt: 'the original' });
    sm.setCurrentAgent(f.hat.name);
    const freed = f.hat.name;
    hf.rename(f.hat.uuid, uniq('moved'));
    const impostor = hf.forge({ name: freed, baseAgent: 'ollama', personaPrompt: 'a different hat entirely' });
    assert.ok(impostor.ok, JSON.stringify(impostor.errors));
    const cur = sm.getCurrentAgent();
    assert.strictEqual(cur.hatUuid, f.hat.uuid, 'the worn hat must not change identity');
    assert.strictEqual(cur.personaPrompt, 'the original');
    assert.notStrictEqual(cur.hatUuid, impostor.hat.uuid);
  });

  await test('HAT-019', 'editing a hat changes the hat you are wearing', () => {
    const f = mk({ toolScope: ['read_file'] });
    sm.setCurrentAgent(f.hat.name);
    hf.rename(f.hat.uuid, uniq('renamed'));  // any new row; scope is resolved, not snapshotted
    assert.deepStrictEqual(sm.getCurrentAgent().toolScope, ['read_file']);
  });

  await test('HAT-020', 'a revoked worn hat reports missing, never a live-looking snapshot', () => {
    const f = mk();
    sm.setCurrentAgent(f.hat.name);
    hf.revoke(f.hat.uuid);
    const cur = sm.getCurrentAgent();
    assert.strictEqual(cur.hatMissing, true);
    assert.strictEqual(cur.stale, true);
  });

  await test('HAT-021', 'a pre-patch identity row (name, no uuid) still resolves, and says so', () => {
    const f = mk();
    const { jaaDB: db } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
    db.insert('copilot_identity', { id: 'agent', agent: 'claude', hatName: f.hat.name, toolScope: null, personaPrompt: null, ts: Date.now() });
    const cur = sm.getCurrentAgent();
    assert.strictEqual(cur.hatUuid, f.hat.uuid, 'resolved by name, once');
    assert.strictEqual(cur.resolvedByNameOnly, true, 'and flagged, because a name-only pointer is the ambiguity being retired');
  });

  // ── intent routing ────────────────────────────────────────────────────────
  await test('HAT-022', 'the verb table maps to ROLES that actually exist', () => {
    seed.seedHats({ knownTools: null, log: quiet });
    for (const key of new Set(Object.values(router.VERB_TO_HAT))) {
      assert.ok(seed.SEED_HATS.some(h => h.seedKey === key), `no seed hat holds role "${key}"`);
    }
  });

  await test('HAT-023', 'intent routing follows a renamed hat', () => {
    seed.seedHats({ knownTools: null, log: quiet });
    const builder = hf.bySeedKey('the_builder');
    assert.ok(builder, 'the builder role must be filled');
    hf.rename(builder.uuid, 'the_maker');
    const s = router.suggestHat('build a module that parses logs');
    assert.strictEqual(s.suggested, true, JSON.stringify(s));
    assert.strictEqual(s.hatUuid, builder.uuid);
    assert.strictEqual(s.hatName, 'the_maker');
    hf.rename(builder.uuid, 'the_builder');
  });

  await test('HAT-024', 'an UNFILLED role is reported as such, not as "no mapping"', () => {
    const builder = hf.bySeedKey('the_builder');
    if (builder) hf.revoke(builder.uuid);
    const s = router.suggestHat('build a module that parses logs');
    assert.strictEqual(s.suggested, false);
    assert.strictEqual(s.seedKey, 'the_builder', 'the role must be named — a missing hat and a non-hat verb are different');
    seed.seedHats({ knownTools: null, log: quiet });
  });

  // ── responsibilities across a restart ─────────────────────────────────────
  await test('HAT-025', 'an endless task survives the JSON round trip (Infinity is not null)', () => {
    sched._resetForTest && sched._resetForTest();
    sched.start({ skipRestore: true });
    const id = uniq('endless');
    sched.schedule({ id, name: 'probe', everyMs: 60000, maxRuns: Infinity, target: { kind: 'fn' }, fn: async () => {} });
    // what a fresh process sees: the persisted row, Infinity gone
    const persisted = JSON.parse(JSON.stringify(sched.get(id)));
    assert.strictEqual(persisted.maxRuns, null, 'this is the lossy step — pinned so it cannot surprise anyone again');
    sched._resetForTest && sched._resetForTest();
    const restored = sched.start().armed >= 0 && sched.get(id);
    assert.ok(restored, 'the task must come back');
    assert.strictEqual(restored.maxRuns, Infinity, 'restored as endless — `0 >= null` cancelled it on its first tick');
  });

  await test('HAT-026', 'a kind:fn task whose function did not survive fails LOUDLY', async () => {
    sched._resetForTest && sched._resetForTest();
    sched.start({ skipRestore: true });
    const id = uniq('lostfn');
    let ran = 0;
    sched.schedule({ id, name: 'probe', everyMs: 90, maxRuns: Infinity, target: { kind: 'fn' }, fn: async () => { ran++; } });
    await new Promise(r => setTimeout(r, 200));
    assert.ok(ran > 0, 'the fn must run while the process that registered it is alive');

    const runsBefore = sched.get(id).runs;
    sched._resetForTest && sched._resetForTest();   // the row survives; _fns does not
    sched.start();
    const ranBefore = ran;
    await new Promise(r => setTimeout(r, 250));

    const t = sched.get(id);
    assert.ok(t, 'the task must still exist, so re-registering the fn revives it');
    assert.strictEqual(ran, ranBefore, 'nothing can actually have run');
    assert.strictEqual(t.status, 'error', `silent success is the worst outcome — status was "${t.status}"`);
    assert.ok(/did not survive the process/.test(t.lastError || ''), `the error must name the cause: ${t.lastError}`);
    assert.strictEqual(t.runs, runsBefore, 'a tick that did nothing must not be counted as a run');
    sched._resetForTest && sched._resetForTest();
  });

  await test('HAT-027', 'the scheduler never reports delivery for a kind it cannot deliver', async () => {
    sched._resetForTest && sched._resetForTest();
    sched.start({ skipRestore: true });
    const id = uniq('unknownkind');
    sched.schedule({ id, name: 'probe', inMs: 50, target: { kind: 'telepathy', id: 'x' } });
    await new Promise(r => setTimeout(r, 200));
    const t = sched.get(id);
    if (t) assert.notStrictEqual(t.status, 'done', 'an undeliverable target must never be recorded as done');
  });

  // ── the tool surface ──────────────────────────────────────────────────────
  await test('HAT-028', 'rename is reachable from the agent tool, not just the library', async () => {
    const tool = require(path.join(ROOT, 'lib/agent-tools/tools/identity/hat-forge.js'));
    assert.ok(tool.parameters.properties.action.enum.includes('rename'));
    const f = mk();
    const newName = uniq('via_tool');
    const r = await tool.execute({ action: 'rename', name: f.hat.name, newName });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.hat.uuid, f.hat.uuid);
    const got = await tool.execute({ action: 'get', name: f.hat.uuid });
    assert.strictEqual(got.hat.name, newName, 'and get accepts the uuid too');
  });

  await test('HAT-029', 'a revoke tombstone keeps the whole record, not just the id', () => {
    const key = uniq('role');
    const f = mk({ seedKey: key, toolScope: ['read_file'] });
    hf.revoke(f.hat.uuid);
    const rows = jaaDB.query(hf.TABLE, r => (r.uuid === f.hat.uuid) && r._revoked, 5000);
    assert.ok(rows.length, 'a tombstone must exist');
    assert.strictEqual(rows[rows.length - 1].seedKey, key, 'what a revoked hat WAS must stay readable (§0.3)');
  });

  await test('HAT-030', 'deepseek is a real, valid base agent — James: "I want deepseek added as an agent"', () => {
    assert.ok(hf.VALID_BASE_AGENTS.has('deepseek'));
    const f = mk({ baseAgent: 'deepseek', allowedAgents: ['deepseek'] });
    assert.strictEqual(f.ok, true, `expected forge() to accept baseAgent:'deepseek', got: ${JSON.stringify(f.errors)}`);
    assert.strictEqual(f.hat.baseAgent, 'deepseek');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  // §FIXED 2026-08-19 — real root cause of the flush-lock ENOENT storm
  // found and closed, not deferred again: jaaDB's own real close() clears
  // every pending per-table flush timer (guardian/jaa-store.js:443-446)
  // before this ever ran, those timers kept firing after TMP was deleted
  // below, each one retrying against a directory that no longer existed —
  // which is also why the process never exited on its own and needed
  // `timeout` to force-kill it.
  try { jaaDB.close(); } catch (_) {}
  process.env.JAA_DATA_DIR = PRIOR_DIR;              // §ES-018 — never leak the redirect
  if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = failed ? 1 : 0;
})();
