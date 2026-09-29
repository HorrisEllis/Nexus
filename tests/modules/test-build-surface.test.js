'use strict';
/**
 * tests/modules/test-build-surface.test.js — 0.39.280, docs/2026-09-29-build-surface-phasemap.spec.
 *   BS2-*  idearium/repo/file-state.js    committed / modified / new / deleted / pending (greyed) / staged
 *   BS3-*  idearium/repo/deviation.js     from the baseline and since the last version; what a major change is
 *   BS4-*  cos/testenv/environment.js     downloaded / configured on a real temp repo; the options catalogue
 *   BS5-*  idearium/repo/spec-plan.js     the agent's ask carries the axioms; loom-parsed; bottom-up enforced; order
 *   BS6-*  idearium/repo/build-plan.js    gates as progress, the event ledger, the current step
 *   BS7-*  the routes through idearium's real router (added with BS7)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'build-surface-'));

let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}

(async () => {
  console.log('\n  test-build-surface.test.js');
  const FS = await import(path.join(ROOT, 'idearium/repo/file-state.js'));
  const DV = await import(path.join(ROOT, 'idearium/repo/deviation.js'));
  const SP = await import(path.join(ROOT, 'idearium/repo/spec-plan.js'));
  const BP = await import(path.join(ROOT, 'idearium/repo/build-plan.js'));
  const ENV = require(path.join(ROOT, 'cos/testenv/environment.js'));

  await t('BS2-01', 'every state: committed, modified, new, deleted; a proposal-only file is listed as pending (greyed); proposals and staged batches marked', () => {
    const r = FS.fileStates({
      disk: [{ path: 'a.js', sha256: 'A' }, { path: 'b.js', sha256: 'B2' }, { path: 'c.js', sha256: 'C' }],
      version: { commitId: 'vtm-1', entries: [{ path: 'a.js', sha256: 'A' }, { path: 'b.js', sha256: 'B' }, { path: 'gone.js', sha256: 'G' }] },
      injects: [{ uuid: 'i1', path: 'new.js', status: 'proposed', op: 'write' }, { uuid: 'i2', path: 'a.js', status: 'proposed', op: 'write' },
        { uuid: 'i3', path: 'b.js', status: 'staged', op: 'write' }, { uuid: 'i4', path: 'x.js', status: 'applied', op: 'write' },
        { uuid: 'i5', path: 'nothere.js', status: 'proposed', op: 'delete' }],
    });
    const s = r.states;
    assert.deepStrictEqual([s['a.js'].state, s['b.js'].state, s['c.js'].state, s['gone.js'].state, s['new.js'].state], ['committed', 'modified', 'new', 'deleted', 'pending']);
    assert.deepStrictEqual([s['a.js'].pending, s['b.js'].staged, s['new.js'].pending], [['i2'], ['i3'], ['i1']]);
    assert.ok(!s['x.js'] && !s['nothere.js'], 'applied injects and deletes of absent files change nothing');
    assert.deepStrictEqual([r.counts.pending, r.counts.withProposals, r.counts.withStaged, r.version], [1, 2, 1, 'vtm-1']);
    assert.strictEqual(FS.fileStates({ disk: [{ path: 'a.js', sha256: 'A' }] }).states['a.js'].state, 'new', 'no version yet: every file is new, said');
  });

  await t('BS3-01', 'deviation from the baseline and since the last version are two numbers, with provenance; a major change is thresholded', () => {
    const base = [{ path: 'a', sha256: '1', bytes: 100 }, { path: 'b', sha256: '2', bytes: 100 }, { path: 'c', sha256: '3', bytes: 100 }];
    const last = [{ path: 'a', sha256: '1', bytes: 100 }, { path: 'b', sha256: '9', bytes: 120 }, { path: 'c', sha256: '3', bytes: 100 }];
    const now = [{ path: 'a', sha256: '1', bytes: 100 }, { path: 'b', sha256: '9', bytes: 120 }, { path: 'd', sha256: '4', bytes: 50 }];
    const d = DV.deviation({ baseline: { commitId: 'vtm-b', entries: base }, last: { commitId: 'vtm-l', entries: last }, current: now, reason: 'version', at: 5 });
    assert.deepStrictEqual([d.fromBaseline.commitId, d.fromBaseline.added, d.fromBaseline.removed, d.fromBaseline.changed, d.fromBaseline.unchanged], ['vtm-b', 1, 1, 1, 1]);
    assert.strictEqual(d.fromBaseline.fraction, 0.75);
    assert.deepStrictEqual([d.sinceVersion.commitId, d.sinceVersion.added, d.sinceVersion.removed, d.sinceVersion.changed], ['vtm-l', 1, 1, 0]);
    assert.deepStrictEqual([d.reason, d.at, d.schema], ['version', 5, 'nexus.repo.deviation/1']);
    assert.match(DV.deviation({ current: now }).note, /no baseline snapshot yet/);
    assert.strictEqual(DV.isMajor(base, base).major, false);
    assert.strictEqual(DV.isMajor(base, now).major, true, '2 of 4 paths moved ≥ 0.1');
    const many = Array.from({ length: 200 }, (_, i) => ({ path: `f${i}`, sha256: 'x', bytes: 1 }));
    assert.strictEqual(DV.isMajor(many, many.map((e, i) => (i < 3 ? { ...e, sha256: 'y' } : e))).major, false, '3 of 200 is not major');
    assert.strictEqual(DV.isMajor(many, many.map((e, i) => (i < 10 ? { ...e, sha256: 'y' } : e))).major, true, '10 files is');
  });

  await t('BS4-01', 'environment check on a real repo dir: downloaded names missing/different files; node deps checked here; install plan; not ready until installed', () => {
    const dir = path.join(TMP, 'envrepo'); fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node t.js' }, dependencies: { leftpad: '1' } }));
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'a');
    const sha = require('crypto').createHash('sha256').update('a').digest('hex');
    let c = ENV.check(dir, { files: [{ path: 'src/a.js', sha256: sha }, { path: 'src/b.js' }, { path: 'package.json', sha256: 'nope' }], base: { ok: true, runtimes: ['node'] } });
    assert.ok(c.ok && !c.ready);
    assert.deepStrictEqual([c.downloaded.missing, c.downloaded.different], [['src/b.js'], ['package.json']]);
    const node = c.configured.stacks.find(s => s.stack === 'node');
    assert.deepStrictEqual([node.installed, node.missing], [false, ['leftpad']]);
    assert.ok(c.plan.install.some(i => /npm install/.test(i.command)) && c.plan.suite.some(s => s.command === 'npm test'));
    assert.ok(c.todo.some(x => /node: 1 of 1 dependencies not installed/.test(x)));
    fs.mkdirSync(path.join(dir, 'node_modules', 'leftpad'), { recursive: true }); fs.writeFileSync(path.join(dir, 'node_modules', 'leftpad', 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'b');
    c = ENV.check(dir, { files: [{ path: 'src/a.js', sha256: sha }, { path: 'src/b.js' }], base: { ok: true, runtimes: ['node'] } });
    assert.ok(c.ready, JSON.stringify(c.todo));
    assert.strictEqual(ENV.check(dir, { base: { ok: false, reason: 'QEMU not found' } }).ready, false, 'no VM = not ready, and said');
    assert.strictEqual(ENV.check(path.join(TMP, 'nope')).downloaded.ok, false);
  });

  await t('BS4-02', 'the options catalogue: every option typed with default and group; normalize bounds values and names what it dropped', () => {
    const o = ENV.options();
    assert.ok(o.length >= 15 && o.every(x => x.key && x.type && 'default' in x && x.group && x.does));
    for (const k of ['node', 'extras', 'services', 'network', 'ramMB', 'cpus', 'env', 'ports', 'testCommand', 'desktop']) assert.ok(o.some(x => x.key === k), k);
    const n = ENV.normalize({ ramMB: 99999999, cpus: '4', extras: ['go', 'cobol'], ports: '3000, abc 8080', env: { GOOD: 1, 'bad-key': 2 }, network: 'bogus', nope: 1 });
    assert.deepStrictEqual(n.options, { ramMB: 65536, cpus: 4, extras: ['go'], ports: ['3000', '8080'], env: { GOOD: '1' } });
    assert.deepStrictEqual(n.dropped.sort(), ['network', 'nope']);
    const c = ENV.check(path.join(TMP, 'envrepo'), { options: { install: 'custom', installCommand: 'make deps', testCommand: 'make check' } });
    assert.deepStrictEqual([c.plan.install[0].command, c.plan.suite[0].command], ['make deps', 'make check']);
  });

  const MAP = `spec:
  meta:
    name: lock-phasemap
    spec: spec/lock.spec
  phases:
    LK0_store:
      layer: foundation
      status: OPEN
      depends_on: []
      axioms: [§3.1, §1.3]
      files: [src/store.js]
      does: >-
        the lock table
      proof: >-
        test/store.test.js
    LK2_api:
      layer: api
      status: OPEN
      depends_on: [LK1]
      proof: test/api.test.js
    LK1_lib:
      layer: library
      status: DONE
      depends_on: [LK0]
      proof: test/lib.test.js
`;
  await t('BS5-01', 'the agent is asked for the WHOLE build, bottom-up by layer, carrying the axioms, as a file next to the spec', () => {
    assert.strictEqual(SP.phasemapPathFor('spec/lock.spec'), 'spec/lock-phasemap.spec');
    assert.strictEqual(SP.phasemapPathFor('lock.spec'), 'lock-phasemap.spec');
    const p = SP.planPrompt({ repo: { name: 'Lock' }, specPath: 'spec/lock.spec', specText: 'x' });
    assert.strictEqual(p.mapPath, 'spec/lock-phasemap.spec');
    assert.match(p.message, /WHOLE build of the spec spec\/lock\.spec/);
    assert.match(p.message, /foundation → library → api → cli → automation → ui/);
    for (const n of ['§3.1', '§3.3', '§3.4', '§1.3', '§17.5']) assert.ok(p.message.includes(n), n);
    assert.match(p.message, /spec_sha256: [0-9a-f]{64}/, 'provenance: which spec text it was planned from');
    assert.match(p.message, /Do not build any phase yet/);
  });

  await t('BS5-02', 'validatePlan: loom parses it; layer/proof read; a higher-layer dependency, an unknown one, a missing layer or proof is refused', () => {
    const v = SP.validatePlan(MAP, 'lock-phasemap');
    assert.ok(v.ok, v.problems.join('; '));
    assert.deepStrictEqual(v.phases.map(p => [p.key, p.layer, p.status]), [['LK0', 'foundation', 'pending'], ['LK2', 'api', 'pending'], ['LK1', 'library', 'done']]);
    assert.deepStrictEqual(v.phases[0].axioms, ['§3.1', '§1.3']);
    assert.strictEqual(v.meta.spec, 'spec/lock.spec');
    const bad = SP.validatePlan(MAP.replace('depends_on: []', 'depends_on: [LK2]').replace('proof: test/lib.test.js', 'proof:').replace('layer: api', 'layer: web') + '    LK3_x:\n      layer: ui\n      depends_on: [ZZ9]\n      proof: t\n', 'm');
    assert.ok(!bad.ok);
    assert.ok(bad.problems.some(x => /LK0_store \(foundation\) depends on LK2_api/.test(x)) || bad.problems.some(x => /layer "web"/.test(x)), bad.problems.join('\n'));
    assert.ok(bad.problems.some(x => /LK1_lib: no proof/.test(x)));
    assert.ok(bad.problems.some(x => /depends on ZZ9, which is not in this map/.test(x)));
    assert.ok(!SP.validatePlan('nothing here').ok);
  });

  await t('BS5-03', 'build order is layer then dependencies; the next ready phase skips the done and the blocked', () => {
    const v = SP.validatePlan(MAP, 'm');
    assert.deepStrictEqual(SP.orderPhases(v.phases).map(p => p.key), ['LK0', 'LK1', 'LK2']);
    assert.strictEqual(SP.nextReady(v.phases).key, 'LK0');
    const done0 = v.phases.map(p => (p.key === 'LK0' ? { ...p, status: 'done' } : p));
    assert.strictEqual(SP.nextReady(done0).key, 'LK2', 'LK1 is done already');
  });

  await t('BS6-01', 'gates as progress: mapped → snapshot → dispatched → replied → landed → closed; the ledger in time order; a failed run stops at its gate', () => {
    const phases = [
      { phase_key: 'LK0', map: 'm', title: 'store', status: 'complete' },
      { phase_key: 'LK1', map: 'm', title: 'lib', status: 'active' },
      { phase_key: 'LK2', map: 'm', title: 'api', status: 'planned' },
      { phase_key: 'LK3', map: 'm', title: 'ui', status: 'planned' },
    ];
    const runs = [
      { runId: 'r1', map: 'm', phase: 'LK1', state: 'building', snapshot: 'vtm-9', ts: 10 },
      { runId: 'r1', map: 'm', phase: 'LK1', state: 'replied', snapshot: 'vtm-9', ts: 20, startedAt: 10, injects: { injected: ['src/lib.js'] }, reply: 'done' },
      { runId: 'r2', map: 'm', phase: 'LK3', state: 'refused', error: 'no snapshot: versionium down', ts: 30 },
    ];
    const p = BP.buildPlan({ phases, runs });
    const [s0, s1, s2, s3] = p.steps;
    assert.deepStrictEqual([s0.progress, s0.gate], [1, null]);
    assert.deepStrictEqual(s1.gates.map(g => g.passed), [true, true, true, true, true, false]);
    assert.strictEqual(s1.gate, 'closed');
    assert.deepStrictEqual(s1.ledger.map(l => l.state), ['building', 'replied'], 'oldest first');
    assert.deepStrictEqual(s1.ledger[1].injected, ['src/lib.js']);
    assert.deepStrictEqual([s2.gate, s2.progress], ['snapshot', +(1 / 6).toFixed(3)]);
    assert.deepStrictEqual([s3.gate, s3.failed.state], ['snapshot', 'refused']);
    assert.ok(s1.current && p.summary.current === 'LK1');
    assert.deepStrictEqual([p.summary.total, p.summary.complete, p.summary.failed], [4, 1, 1]);
    assert.deepStrictEqual(BP.GATES, ['mapped', 'snapshot', 'dispatched', 'replied', 'landed', 'closed']);
  });

  // ── BS7: the routes (added with BS7) ────────────────────────────────────
  if (process.env.BS_SKIP_API !== '1' && fs.existsSync(path.join(__dirname, 'test-build-surface.api.js'))) await require('./test-build-surface.api.js')({ t, ROOT, TMP, assert });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('  ! crashed:', e && e.stack || e); process.exit(1); });
