'use strict';
// tests/modules/test-nexus-inject-approval.test.js — 0.39.266.
// James: "really close to being able to use idearium to build nexus from inside nexus using you as
// the agent" → asked how agent code should reach the live tree: "just prompt for approval".
//
// Before: an .inject on a Nexus repo could be proposed, never applied (RepoLayer: IMMUTABLE).
// Now: it targets the apply gate; approving writes the live tree through lib/nexus-self/apply.js.
//
//   IG-001  an inject on a nexus repo targets the gate, owned by the path's system; the repo is always 'review'
//   IG-002  preview = the gate's plan + a diff against the live tree, nothing written
//   IG-003  approve writes the live file through the gate (recorded apply, new snapshot)
//   IG-004  revert is the gate's rollback of that apply
//   IG-005  from nexus/core, a guardian/ path is guardian's change — applied under guardian
//   IG-006  the live file moved after the proposal → refused as a conflict, nothing written
//   IG-007  a live edit to an unrelated file does not block (the gate compares against the tree now)
//   IG-008  an agent reply on a nexus repo proposes (flags approval), even with 'auto' stored for the repo
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-test-'));
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

async function main() {
  const live = fs.mkdtempSync(path.join(TMP, 'live-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(live, rel)), { recursive: true }); fs.writeFileSync(path.join(live, rel), text); };
  const r = (rel) => { try { return fs.readFileSync(path.join(live, rel), 'utf8'); } catch (_) { return null; } };
  w('guardian/server.js', 'module.exports = 1;\n');
  w('lib/util.js', 'module.exports = 3;\n');
  w('lib/other.js', 'module.exports = 4;\n');

  const se = await import('../../idearium/spec-engine/index.js');
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const NS = await import('../../idearium/repo/nexus-self.js');
  const RI = require('../../lib/repo-inject.js');
  const rl = new RepoLayer({ specEngine: se });
  await NS.sync(rl, se, { only: ['guardian', 'core'], liveRoot: live });
  const repoOf = (sys) => rl.list().find(x => x.nexusSelf && x.nexusSelf.system === sys);
  const guardian = repoOf('guardian'), core = repoOf('core');
  const opt = { liveRoot: live };

  let inj;
  await test('IG-001', 'an inject on a nexus repo targets the gate, owned by the path\'s system; always review', () => {
    const p = RI.propose({ layer: rl, repo: guardian, path: 'guardian/server.js', content: 'module.exports = 2;\n', ...opt });
    assert.ok(p.ok, JSON.stringify(p));
    inj = p.inject;
    assert.deepStrictEqual(inj.target, { kind: 'nexus-gate', system: 'guardian', path: 'guardian/server.js' });
    assert.strictEqual(inj.creates, false);
    assert.strictEqual(RI.modeFor(guardian), 'review');
  });

  await test('IG-002', 'preview is the gate plan + a diff, and writes nothing', () => {
    const pv = RI.preview(inj.uuid, opt);
    assert.strictEqual(pv.gate.plan.ok, true, JSON.stringify(pv.gate.plan));
    assert.strictEqual(pv.gate.system, 'guardian');
    assert.match(pv.gate.diff, /^-1: module\.exports = 1;$/m);
    assert.match(pv.gate.diff, /^\+1: module\.exports = 2;$/m);
    assert.strictEqual(r('guardian/server.js'), 'module.exports = 1;\n');
  });

  let applied;
  await test('IG-003', 'approve writes the live file through the gate (recorded apply, new snapshot)', () => {
    applied = RI.apply(inj.uuid, { layer: rl, approvedBy: 'james', ...opt });
    assert.ok(applied.ok, JSON.stringify(applied));
    assert.strictEqual(r('guardian/server.js'), 'module.exports = 2;\n');
    assert.match(applied.inject.applyId, /^apply-/);
    assert.strictEqual(applied.inject.via, 'nexus-self.apply');
    const rec = require('../../lib/nexus-self/apply.js').listApplies().find(a => a.id === applied.inject.applyId);
    assert.match(rec.reason, /approved inject .* approved by james/);
    assert.strictEqual(require('../../lib/nexus-self/store.js').head().hash, applied.gate.snapshot);
  });

  await test('IG-004', 'revert is the gate rollback of that apply', () => {
    const v = RI.revert(inj.uuid, { layer: rl, ...opt });
    assert.ok(v.ok, JSON.stringify(v));
    assert.strictEqual(r('guardian/server.js'), 'module.exports = 1;\n');
    assert.strictEqual(v.inject.status, 'reverted');
  });

  await test('IG-005', 'from nexus/core, a guardian/ path is guardian\'s change', () => {
    const p = RI.propose({ layer: rl, repo: core, path: 'guardian/new-tool.js', content: 'module.exports = "t";\n', ...opt });
    assert.strictEqual(p.inject.target.system, 'guardian');
    assert.strictEqual(p.inject.creates, true);
    const a = RI.apply(p.inject.uuid, { layer: rl, ...opt });
    assert.ok(a.ok, JSON.stringify(a));
    assert.strictEqual(a.gate.system, 'guardian');
    assert.strictEqual(r('guardian/new-tool.js'), 'module.exports = "t";\n');
  });

  await test('IG-006', 'a live file moved after the proposal is a conflict; nothing written', () => {
    const p = RI.propose({ layer: rl, repo: core, path: 'lib/util.js', content: 'module.exports = 30;\n', ...opt });
    w('lib/util.js', 'module.exports = "james edited";\n');
    const a = RI.apply(p.inject.uuid, { layer: rl, ...opt });
    assert.strictEqual(a.ok, false);
    assert.strictEqual(a.conflict, true);
    assert.match(a.errors.join(), /changed since this inject was proposed/);
    assert.strictEqual(r('lib/util.js'), 'module.exports = "james edited";\n');
    assert.strictEqual(RI.get(p.inject.uuid).status, 'proposed', 'still waiting for a decision');
  });

  await test('IG-007', 'a live edit to an unrelated file does not block approval', () => {
    const p = RI.propose({ layer: rl, repo: core, path: 'lib/other.js', content: 'module.exports = 40;\n', ...opt });
    w('lib/util.js', 'module.exports = "edited again";\n');   // not the inject's file; the last sync never saw it
    const a = RI.apply(p.inject.uuid, { layer: rl, ...opt });
    assert.ok(a.ok, JSON.stringify(a));
    assert.strictEqual(r('lib/other.js'), 'module.exports = 40;\n');
  });

  await test('IG-008', 'an agent reply on a nexus repo proposes and flags approval, even with auto stored', async () => {
    RI.setMode(guardian.uuid, 'auto');
    const text = 'here:\n```js guardian/server.js\nmodule.exports = 99;\n```\n';
    const out = await RI.fromReply({ layer: rl, repo: guardian, hat: null, text, ...opt });
    assert.strictEqual(out.mode, 'review');
    assert.strictEqual(out.approval, true);
    assert.strictEqual(out.injects.length, 1);
    assert.strictEqual(out.injects[0].status, 'proposed');
    assert.strictEqual(out.injects[0].system, 'guardian');
    assert.strictEqual(r('guardian/server.js'), 'module.exports = 1;\n', 'nothing written before approval');
    RI.setMode(guardian.uuid, 'review');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
