'use strict';
/**
 * tests/modules/test-loom-phasemap-status.js — the status parser in
 * loom/scanners/phasemap-map.js.
 *
 * §WHY THIS FILE EXISTS — tests/modules/test-loom-phasemap.js asserts
 * that every phase HAS a status ('done'|'pending'|'in-progress') and that
 * SOME phase is done. Both of those pass with every single status
 * inverted, which is exactly what was happening: measured across the 528
 * real phases in docs/, 23 phases whose status literally reads
 * "NOT STARTED" were reported 'in-progress' (/STARTED/i matches inside
 * "NOT STARTED") and 8 whose status begins with a bare "DONE" were
 * reported 'pending'. Both errors point the wrong way for deciding what
 * to work on: unstarted work looks started so it gets skipped, finished
 * work looks pending so it gets redone. A third bug compounded it — the
 * status was read from a fixed [header, +1, +2] line window, so a phase
 * whose `status:` key sits on its third line had its status read from
 * lines that do not contain it.
 *
 * So this file asserts the VALUE, not the presence. Every case is a real
 * .spec file written to a real directory and read by the real scanner
 * via NEXUS_PHASEMAP_DIR.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phasemap-status-'));

/** write a real fixture phasemap and read it with the real scanner */
function statusesFor(content) {
  const dir = fs.mkdtempSync(path.join(tmp, 'd-'));
  fs.writeFileSync(path.join(dir, 'fixture-phasemap.spec'), content, 'utf8');
  process.env.NEXUS_PHASEMAP_DIR = dir;
  delete require.cache[require.resolve('../../loom/scanners/phasemap-map.js')];
  const pm = require('../../loom/scanners/phasemap-map.js');
  const out = {};
  for (const p of pm.loadAll().phases) out[p.id] = p.status;
  return out;
}

console.log('\n── the two measured inversions ────────────────────────────');

t('PS-001 "NOT STARTED" is pending, not in-progress', () => {
  const s = statusesFor('spec:\n  P1_thing:\n    status: "NOT STARTED"\n');
  assert.strictEqual(s.P1_thing, 'pending', 'NOT STARTED read as started');
});

t('PS-002 a status value beginning with a bare DONE is done, not pending', () => {
  const s = statusesFor('spec:\n  P2_thing:\n    status: "DONE 2026-09-15."\n');
  assert.strictEqual(s.P2_thing, 'done');
});

t('PS-003 a block-scalar DONE whose value is on the NEXT line is done', () => {
  const s = statusesFor('spec:\n  P3_thing:\n    status: >\n      DONE 2026-09-19. Built and verified.\n');
  assert.strictEqual(s.P3_thing, 'done');
});

t('PS-004 THE WINDOW BUG: status on the phase\'s third line is still read', () => {
  // The exact real shape that was misreported live (MCO1_graph_layer):
  // depends_on first, then a block-scalar status.
  const s = statusesFor(
    'spec:\n  P4_thing:\n    depends_on: [P1_thing]\n    status: >\n      DONE 2026-09-19. Real work, real tests.\n');
  assert.strictEqual(s.P4_thing, 'done', 'status key past the old fixed window was not read');
});

t('PS-005 and the same window fix works for a late NOT STARTED', () => {
  const s = statusesFor(
    'spec:\n  P5_thing:\n    depends_on: [P4_thing]\n    does: >\n      some description\n    status: "NOT STARTED"\n');
  assert.strictEqual(s.P5_thing, 'pending');
});

console.log('\n── it must not regress the 2026-08-13 fix ─────────────────');

t('PS-006 the word "completely" in prose does NOT mark a phase done', () => {
  // The real regression this parser was hardened against: three pending
  // phases quoting "completely break down and rebuild" all reported as
  // shipped.
  const s = statusesFor(
    'spec:\n  P6_thing:\n    status: "OPEN"\n    why: >\n      completely break down and rebuild the thing\n');
  assert.strictEqual(s.P6_thing, 'pending', 'prose marked a pending phase done again');
});

t('PS-007 a lowercase "done" in prose does not mark a phase done', () => {
  const s = statusesFor(
    'spec:\n  P7_thing:\n    status: "OPEN"\n    note: >\n      this is not done yet and will not be done soon\n');
  assert.strictEqual(s.P7_thing, 'pending');
});

t('PS-008 glyph markers still work (✓ DONE, ← DONE, # DONE, COMPLETE)', () => {
  const s = statusesFor(
    'spec:\n  P8_a:\n    status: "✓ DONE"\n  P8_b:\n    status: "← DONE"\n  P8_c:\n    status: "# DONE"\n  P8_d:\n    status: "COMPLETE"\n');
  assert.deepStrictEqual(
    [s.P8_a, s.P8_b, s.P8_c, s.P8_d], ['done', 'done', 'done', 'done']);
});

console.log('\n── the rest of the real vocabulary ───────────────────────');

t('PS-009 OPEN and DRAFT are pending', () => {
  const s = statusesFor('spec:\n  P9_a:\n    status: "OPEN"\n  P9_b:\n    status: "DRAFT"\n');
  assert.strictEqual(s.P9_a, 'pending');
  assert.strictEqual(s.P9_b, 'pending');
});

t('PS-010 IN PROGRESS and PARTIAL are in-progress', () => {
  const s = statusesFor('spec:\n  P10_a:\n    status: "IN PROGRESS"\n  P10_b:\n    status: "PARTIAL — half built"\n');
  assert.strictEqual(s.P10_a, 'in-progress');
  assert.strictEqual(s.P10_b, 'in-progress');
});

t('PS-011 a phase with no status key at all is pending, not a crash', () => {
  const s = statusesFor('spec:\n  P11_thing:\n    does: >\n      something with no status field\n');
  assert.strictEqual(s.P11_thing, 'pending');
});

console.log('\n── against the real tree ─────────────────────────────────');

t('PS-012 no real phase in docs/ says NOT STARTED while reporting in-progress', () => {
  delete process.env.NEXUS_PHASEMAP_DIR;
  delete require.cache[require.resolve('../../loom/scanners/phasemap-map.js')];
  const pm = require('../../loom/scanners/phasemap-map.js');
  const ROOT = path.join(__dirname, '../..');
  const docs = path.join(ROOT, 'docs');
  const byId = {};
  for (const p of pm.loadAll().phases) byId[`${p.map}::${p.id}`] = p.status;

  const offenders = [];
  for (const f of fs.readdirSync(docs).filter(x => /phase-?map.*\.spec$/.test(x))) {
    const lines = fs.readFileSync(path.join(docs, f), 'utf8').split('\n');
    const RE = /^\s{2,6}([A-Z]{1,3}\d+_[A-Za-z0-9_]*):(.*)$/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(RE);
      if (!m) continue;
      let end = i + 1;
      while (end < lines.length && end < i + 60 && !RE.test(lines[end])) end++;
      const body = lines.slice(i, end).join(' ');
      const key = `${f.replace(/\.spec$/, '')}::${m[1]}`;
      if (/\bNOT STARTED\b/i.test(body) && byId[key] === 'in-progress') offenders.push(key);
    }
  }
  assert.strictEqual(offenders.length, 0,
    `${offenders.length} real phases say NOT STARTED but report in-progress: ${offenders.slice(0, 4).join(', ')}`);
});

// §OR1 0.52.1 — docs/2026-10-09-one-roadmap-phasemap.spec. James: "we also need to declutter the roadmap."
t('PS-013 the value\'s first word: BUILT / CLOSED read done; the declutter\'s answers close or shelve; prose never counts', () => {
  delete require.cache[require.resolve('../../loom/scanners/phasemap-map.js')];
  const pm = require('../../loom/scanners/phasemap-map.js');
  const doc = (st) => ['spec:', '  phases:', '    QX1_a_phase:', `      status: ${st}`, '      does: x'].join('\n');
  const one = (st) => pm.parsePhasemapText(doc(st), 'm')[0];
  assert.strictEqual(one('"BUILT 0.39.282 (first slice)"').status, 'done');
  assert.strictEqual(one('"CLOSED 2026-09-05. Fixed"').status, 'done');
  assert.strictEqual(one('"MET — by finding"').status, 'done');
  const f = one('"FOLDED into one-model-engine ME5"'); assert.strictEqual(f.status, 'done'); assert.strictEqual(f.closedAs, 'folded');
  assert.strictEqual(one('"SUPERSEDED by RS9"').closedAs, 'superseded');
  assert.strictEqual(one('"DONE-ELSEWHERE build-from-the-spec SB10"').closedAs, 'done-elsewhere');
  const l = one('"LATER — the shelf: after the loop"'); assert.strictEqual(l.status, 'pending'); assert.strictEqual(l.shelf, true);
  assert.strictEqual(one('"PARTIAL 2026-08-29 — real correction"').status, 'in-progress');
  assert.strictEqual(one('"NOT STARTED — built later"').status, 'pending');
  assert.strictEqual(one('OPEN').status, 'pending');
  assert.strictEqual(one('"OPEN — the old builder is built and closed elsewhere"').status, 'pending', 'a word in prose never counts');
  const list = pm.parsePhasemapText(['phases:', '  - id: L1', '    status: later'].join('\n'), 'l')[0];
  assert.strictEqual(list.shelf, true);
  const s = pm.summary(); assert.ok('shelf' in s && 'closed' in s && 'roadmap' in s);
});

t('PS-014 a whole map answered in one line: roadmap: later shelves, roadmap: folded into X closes; done stays done; loadAll keeps the marks', () => {
  delete require.cache[require.resolve('../../loom/scanners/phasemap-map.js')];
  const pm = require('../../loom/scanners/phasemap-map.js');
  const doc = (r) => ['spec:', '  meta:', '    name: x', ...(r ? [`    roadmap: ${r}`] : []), '  phases:', '    QA1_one:', '      status: OPEN', '    QA2_two:', '      status: "DONE 0.1"'].join('\n');
  const l = pm.parsePhasemapText(doc('later — after the loop'), 'm');
  assert.deepStrictEqual(l.map(p => [p.status, !!p.shelf]), [['pending', true], ['done', false]]);
  const f = pm.parsePhasemapText(doc('folded into one-model-engine — same work'), 'm');
  assert.deepStrictEqual(f.map(p => [p.status, p.closedAs || null, p.foldedInto || null]), [['done', 'folded', 'one-model-engine'], ['done', null, null]]);
  assert.deepStrictEqual(pm.parsePhasemapText(doc(null), 'm').map(p => p.status), ['pending', 'done']);
  const fs2 = require('fs'), os = require('os'), dir = fs2.mkdtempSync(path.join(os.tmpdir(), 'ps14-'));
  fs2.writeFileSync(path.join(dir, 'a-phasemap.spec'), doc('later — x'));
  process.env.NEXUS_PHASEMAP_DIR = dir; delete require.cache[require.resolve('../../loom/scanners/phasemap-map.js')];
  const pm2 = require('../../loom/scanners/phasemap-map.js'); const sum = pm2.summary();
  delete process.env.NEXUS_PHASEMAP_DIR;
  assert.strictEqual(sum.shelf, 1, 'loadAll keeps shelf'); assert.strictEqual(sum.roadmap, 0);
});

console.log(`\n${fail === 0 ? '✓' : '✗'} phasemap status: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
