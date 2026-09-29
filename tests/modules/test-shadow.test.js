'use strict';
/**
 * tests/modules/test-shadow.test.js — 0.39.282 N22 (docs/2026-09-29-nex-node-store-phasemap.spec)
 *
 * James: "What about using shadow and negative space reasoning?" A step declares what must exist afterwards (the
 * shadow); on settle, every absence becomes data: a gap (absent.<step>.<kind>) and a liminal-space item at L1/L3.
 *   SH-0x  lib/shadow.js itself — present / absent / extra, gaps, liminal items, bus events, drop
 *   SH-1x  the first adopter: a manage action in idearium's build surface, with repo-agent faked at its boundary
 */
require('../../lib/test-sandbox.js').ensure();
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('\ntest-shadow\n');
  const SH = require(path.join(ROOT, 'lib', 'shadow.js'));
  const GF = require(path.join(ROOT, 'lib', 'gap-field.js'));
  const bus = require(path.join(ROOT, 'nexus', 'nexus-bus.js'));
  const { jaaDB } = require(path.join(ROOT, 'cortex', 'memory', 'jaa-db.js'));
  const seen = []; bus.on('shadow.settled', e => seen.push(e)); bus.on('shadow.declared', e => seen.push(e));

  // ── SH-0x ──
  const s = SH.declare({ step: 'test.build', expects: { files: ['src/a.js', './src/b.js', 'src/c.js'], events: ['test.shadow.done', 'test.shadow.never'] }, subject: 'phase P1', causedBy: 'cause-9' });
  check('SH-01 declare records the shadow (paths normalised) and says so on the bus', s.expects.files.join() === 'src/a.js,src/b.js,src/c.js' && seen.some(e => e.type === 'shadow.declared' && e.payload.shadowId === s.id) && SH.open().some(x => x.id === s.id));
  bus.emit('test.shadow.done', {});
  const r = SH.settle(s.id, { files: ['src/a.js', 'src\\b.js', 'src/extra.js'] });
  check('SH-02 settle reads the negative space: present, absent and extra', !r.ok && r.present.files.join() === 'src/a.js,src/b.js' && r.absent.files.join() === 'src/c.js'
    && r.extra.files.join() === 'src/extra.js', JSON.stringify(r).slice(0, 300));
  check('SH-03 an expected event that fired is present; one that stayed silent is absent (read from the bus since declare)', r.present.events.join() === 'test.shadow.done' && r.absent.events.join() === 'test.shadow.never');
  const open = GF.openGaps();
  const gFile = open.find(g => g.type === 'absent.test.build.files');
  const gEvent = open.find(g => g.type === 'absent.test.build.events');
  check('SH-04 each absence is a gap (absent.<step>.<kind>) pointing at the shadow and naming what is missing', !!gFile && gFile.location === 'src/c.js' && (gFile.meta || {}).shadowId === s.id && !!gEvent && (gEvent.meta || {}).expected === 'test.shadow.never');
  const lim = jaaDB.query('interstitial_spaces', x => x.causedBy === s.id, 10);
  check('SH-05 each absence is held in liminal space at L1/L3 (shadow meets causal tracing), caused by the shadow', lim.length === 2 && lim.every(x => x.focalPoint === 'L1/L3' && x.type === 'absent'), JSON.stringify(lim).slice(0, 200));
  const settled = seen.find(e => e.type === 'shadow.settled' && e.payload.shadowId === s.id);
  check('SH-06 settle emits shadow.settled with the findings, caused by what caused the step', !!settled && settled.causedBy === 'cause-9' && settled.payload.absent.files.join() === 'src/c.js');
  check('SH-07 a shadow settles once; a second settle is refused, not double-reported', SH.settle(s.id, {}).ok === false && !SH.open().some(x => x.id === s.id));
  const whole = SH.declare({ step: 'test.whole', expects: { files: ['x.js'] } });
  check('SH-08 nothing absent → ok, no gap', SH.settle(whole, { files: ['x.js'] }).ok === true && !GF.openGaps().some(g => g.type === 'absent.test.whole.files'));
  const dropped = SH.declare({ step: 'test.dropped', expects: { files: ['y.js'] } });
  check('SH-09 drop (the step failed outright) reports no absences', SH.drop(dropped) === true && !GF.openGaps().some(g => g.type === 'absent.test.dropped.files') && SH.settle(dropped.id, {}).ok === false);

  // ── SH-1x the first adopter: idearium's manage action ──
  const BS = await import(path.join(ROOT, 'idearium', 'api', 'build-surface.js'));
  const rows = [];
  const mkDeps = (res) => ({
    getRepoLayer: () => ({ get: () => ({ uuid: 'r-shadow', name: 'shadow-repo' }), readTextFile: () => ({ content: 'const a = 1;\n' }) }),
    repoDir: () => '/tmp/nowhere',
    snapshot: async () => ({ ok: true, data: { commitId: 'c1' } }),
    appendRow: (t, row) => rows.push(row), emit: () => {},
    require: (p) => p.endsWith('repo-agent.js') ? { dispatch: async () => res } : require(path.join(ROOT, 'idearium', 'api', p)),
  });
  // a reply that rewrote a different file and not the one asked for
  const r1 = await BS.manage(mkDeps({ ok: true, text: 'x', injects: { injects: [{ path: 'src/other.js' }], refused: [], unresolved: [] } }), 'r-shadow', { path: 'src/kernel/state.js', action: 'rebuild' });
  await sleep(50);
  const done1 = rows.filter(x => x.runId === r1.json.data.runId).pop();
  check('SH-10 manage rebuild whose reply never brings the file back reads incomplete, naming the absent file', done1 && done1.state === 'incomplete' && (done1.absent || []).join() === 'src/kernel/state.js' && /did not bring back src\/kernel\/state\.js/.test(done1.error || ''), JSON.stringify(done1).slice(0, 300));
  check('SH-11 …and the absence is a gap on that file', GF.openGaps().some(g => g.type === 'absent.manage.rebuild.files' && g.location === 'src/kernel/state.js'));
  const r2 = await BS.manage(mkDeps({ ok: true, text: 'x', injects: { injects: [{ path: 'src/kernel/state.js' }], refused: [], unresolved: [] } }), 'r-shadow', { path: 'src/kernel/state.js', action: 'expand' });
  await sleep(50);
  check('SH-12 a reply that brings it back reads replied, the shadow settled whole', (rows.filter(x => x.runId === r2.json.data.runId).pop() || {}).state === 'replied' && !!r2.json.data.shadow);
  const r3 = await BS.manage(mkDeps({ ok: true, text: 'prose', injects: null }), 'r-shadow', { path: 'src/kernel/state.js', action: 'explain' });
  await sleep(50);
  check('SH-13 explain/review write nothing and declare no shadow', !r3.json.data.shadow && (rows.filter(x => x.runId === r3.json.data.runId).pop() || {}).state === 'replied');
  const before = SH.open().length;
  await BS.manage(mkDeps({ ok: false, error: 'provider down' }), 'r-shadow', { path: 'src/z.js', action: 'debug' });
  await sleep(50);
  check('SH-14 a failed dispatch drops its shadow (the failure is already recorded; no absence reported)', SH.open().length === before && !GF.openGaps().some(g => g.type === 'absent.manage.debug.files'));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}
run().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
