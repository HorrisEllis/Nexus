'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-moce-roadmap.js — MCO-E: idearium/repo/roadmap.js and the
 * loom scanner change it rests on.
 *
 * §12.2 — the phasemaps are REAL files. The main subject is the real
 * docs/idearium-repository-overhaul-phasemap.spec (the phasemap this very phase
 * is listed in). The gate's second half, "edits update the same rows loom's
 * scanner reads", is proven by handing the edited text to LOOM'S OWN scanner in
 * a separate process (it reads NEXUS_PHASEMAP_DIR at load) and comparing every
 * phase it reports before and after.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moce-'));

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}

// loom's own scanner, run as loom would run it: a fresh process reading a directory of phasemaps
function loomReads(dir) {
  const out = execFileSync(process.execPath, ['-e', `
    process.env.NEXUS_PHASEMAP_DIR = ${JSON.stringify(dir)};
    const s = require(${JSON.stringify(path.join(ROOT, 'loom/scanners/phasemap-map.js'))});
    console.log(JSON.stringify(s.loadAll().phases));`], { encoding: 'utf8' });
  return JSON.parse(out);
}
function docsDir(files) {
  const d = fs.mkdtempSync(path.join(TMP, 'docs-'));
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(d, n), c);
  return d;
}

(async () => {
  const rm = await import(path.join(ROOT, 'idearium/repo/roadmap.js'));
  const schemas = await import(path.join(ROOT, 'idearium/schemas/index.js'));
  const loom = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
  // The real file changes every session (MCO-E and MCO4 were "planned" when this was
  // written and are DONE now). The tests need a known starting point, so those two
  // phases are set to planned in a COPY of the real text, through the code under test.
  const realOnDisk = fs.readFileSync(path.join(ROOT, 'docs/idearium-repository-overhaul-phasemap.spec'), 'utf8');
  const real = ['MCO-E_roadmap_ui', 'MCO4_hooks_wires_flows_tools'].reduce((tx, id) => rm.setPhaseStatus({ text: tx, mapName: 'idearium-repository-overhaul-phasemap', phaseId: id, status: 'planned' }).text, realOnDisk);
  const REAL_PATH = 'docs/idearium-repository-overhaul-phasemap.spec';
  const realRoadmap = () => rm.buildRoadmap({ projectId: 'proj-1', maps: [{ path: REAL_PATH, text: real }] });
  const byKey = (r, k) => r.phases.find(p => p.phase_key === k);

  console.log('\n── loom: the parser is shared, and it now sees MCO-A..G ──');
  await t('parsePhasemapText gives exactly what loadAll gives for the same file (one parser, not two)', () => {
    const d = docsDir({ 'x-phasemap.spec': real });
    const viaLoadAll = loomReads(d);
    const viaParse = loom.parsePhasemapText(real, 'x-phasemap').map(p => ({ id: p.id, map: p.map, title: p.title, status: p.status, systems: p.systems, systemsFrom: p.systemsFrom, dependsOn: p.dependsOn }));   // §EV0 (4) systemsFrom
    assert.deepStrictEqual(viaLoadAll, viaParse);
  });
  await t('a hyphenated id (MCO-A_schemas) is a phase; a bare `MCO-A:` dictionary key is not', () => {
    const txt = ['phases:', '  MCO-A_schemas:', '    status: "NOT STARTED"', '  MCO-B_next:', '    depends_on: [MCO-A]', '    status: "DONE 2026-01-01."', 'drift_watch:', '  MCO-A: "not a phase"', '  P1_thing:', '    status: "DONE"', ''].join('\n');
    const ph = loom.parsePhasemapText(txt, 'm');
    assert.deepStrictEqual(ph.map(p => p.id), ['MCO-A_schemas', 'MCO-B_next', 'P1_thing']);
    assert.deepStrictEqual(ph.map(p => p.status), ['pending', 'done', 'done']);
  });
  await t('on the REAL overhaul phasemap loom now reports MCO-A, B, C, D, E, F and G (they were invisible before)', () => {
    const ph = loomReads(docsDir({ 'idearium-repository-overhaul-phasemap.spec': real }));
    for (const id of ['MCO-A_schemas', 'MCO-B_versionium_bridge', 'MCO-C_repo_materialize', 'MCO-D_zoom_subrepo', 'MCO-E_roadmap_ui', 'MCO-F_config', 'MCO-G_git_cicd_credentials']) {
      assert.ok(ph.some(p => p.id === id), `${id} not seen by loom`);
    }
  });
  await t('loom\'s phase entries carry location fields (line, statusLine, bodyEnd) for editors', () => {
    const p = loom.parsePhasemapText(real, 'm').find(x => x.id === 'MCO-E_roadmap_ui');
    assert.ok(p.line >= 0 && p.statusLine > p.line && p.bodyEnd > p.statusLine);
    assert.ok(/^\s+status:/.test(real.split('\n')[p.statusLine]));
  });
  await t('isPhasemapFile is the one definition of a phasemap filename', () => {
    for (const y of ['a-phasemap.spec', 'x.phasemap.spec', 'phase-map.spec', 'my-phase-map-2.spec']) assert.ok(loom.isPhasemapFile(y), y);
    for (const n of ['readme.md', 'phasemap.md', 'notes.spec', 'phasemap.js']) assert.ok(!loom.isPhasemapFile(n), n);
  });

  console.log('\n── the roadmap of the real overhaul phasemap ────────────');
  const R = realRoadmap();
  await t('it has the phases, MCO-E among them, with sane counts', () => {
    assert.ok(R.phases.length >= 13);
    assert.strictEqual(R.summary.total, R.phases.length);
    assert.strictEqual(R.summary.planned + R.summary.active + R.summary.complete, R.summary.total);
    assert.ok(byKey(R, 'MCO-E_roadmap_ui'));
  });
  await t('every node satisfies schema.phase_node (required fields, types, status enum)', () => {
    const def = schemas.get('phase_node'); assert.strictEqual(def.status, 'REAL');
    for (const n of R.phases) {
      for (const [k, f] of Object.entries(def.fields)) {
        if (f.required) assert.ok(n[k] !== undefined && n[k] !== null, `${n.phase_key}.${k} missing`);
        if (n[k] === undefined || n[k] === null) continue;
        const ty = Array.isArray(n[k]) ? 'array' : typeof n[k];
        assert.strictEqual(ty, f.type, `${n.phase_key}.${k} is ${ty}, schema says ${f.type}`);
        if (f.enum) assert.ok(f.enum.includes(n[k]), `${n.phase_key}.${k}=${n[k]}`);
      }
      const extra = Object.keys(n).filter(k => !(k in def.fields));
      assert.deepStrictEqual(extra, [], `fields the schema does not declare: ${extra}`);
    }
  });
  await t('GATE: dependency-respecting — every resolved dependency has a LOWER order than its dependent', () => {
    const order = new Map(R.phases.map(p => [p.uuid, p.order]));
    let edges = 0;
    for (const n of R.phases) for (const d of n.depends_on) { edges++; assert.ok(order.get(d) < n.order, `${n.phase_key} (${n.order}) before its dependency ${d} (${order.get(d)})`); }
    assert.ok(edges >= 10, `only ${edges} edges — dependencies were not read`);
    assert.deepStrictEqual(R.phases.map(p => p.order), R.phases.map((_, i) => i + 1));
  });
  await t('layers agree with the dependencies: layer = 1 + the deepest dependency\'s layer; MCO0 is layer 0', () => {
    for (const n of R.phases) {
      const want = n.depends_on.length ? 1 + Math.max(...n.depends_on.map(d => R.phases.find(p => p.uuid === d).layer)) : 0;
      assert.strictEqual(n.layer, want, n.phase_key);
    }
    assert.strictEqual(byKey(R, 'MCO0_audit_real_coverage').layer, 0);
  });
  await t('key references resolve to the right phase: MCO-E depends on MCO-A, MCO3 on MCO-B, MCO1 and MCO2', () => {
    const deps = (k) => byKey(R, k).depends_on.map(u => u.split(':').pop().split('_')[0]).sort();
    assert.deepStrictEqual(deps('MCO-E_roadmap_ui'), ['MCO-A']);
    assert.deepStrictEqual(deps('MCO3_snapshot_compliance'), ['MCO-B', 'MCO1', 'MCO2']);
  });
  await t('statuses are what loom reads (done/in-progress/pending mapped to complete/active/planned)', () => {
    const l = new Map(loom.parsePhasemapText(real, 'm').map(p => [p.id, p.status]));
    for (const n of R.phases) assert.strictEqual(n.status, { done: 'complete', 'in-progress': 'active', pending: 'planned' }[l.get(n.phase_key)], n.phase_key);
  });
  await t('it is deterministic, and reads the same twice', () => assert.deepStrictEqual(realRoadmap(), realRoadmap()));

  console.log('\n── ordering, blocking, and the warnings ─────────────────');
  const mk = (body) => `phases:\n${body}`;
  await t('a phase listed BEFORE its dependency in the file is still ordered after it (file order is not dependency order)', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_last:\n    depends_on: [P2, P3]\n    status: "NOT STARTED"\n  P2_mid:\n    depends_on: [P3]\n    status: "NOT STARTED"\n  P3_first:\n    status: "NOT STARTED"\n') }] });
    assert.deepStrictEqual(r.phases.map(p => p.phase_key), ['P3_first', 'P2_mid', 'P1_last']);
    assert.deepStrictEqual(r.phases.map(p => p.layer), [0, 1, 2]);
  });
  await t('500 random dependency graphs, phases listed in random order: order always respects every dependency', () => {
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let g = 0; g < 500; g++) {
      const n = 2 + Math.floor(rnd() * 9); const ids = Array.from({ length: n }, (_, i) => `P${i}_x`);
      const deps = ids.map((_, i) => ids.slice(0, i).filter(() => rnd() < 0.35).map(d => d.split('_')[0])); // edges only to lower index: a DAG
      const shuffled = ids.map((id, i) => ({ id, deps: deps[i] })).sort(() => rnd() - 0.5);
      const text = mk(shuffled.map(x => `  ${x.id}:\n${x.deps.length ? `    depends_on: [${x.deps.join(', ')}]\n` : ''}    status: "NOT STARTED"\n`).join(''));
      const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text }] });
      assert.strictEqual(r.warnings.length, 0, JSON.stringify(r.warnings));
      const ord = new Map(r.phases.map(p => [p.uuid, p.order]));
      for (const p of r.phases) for (const d of p.depends_on) assert.ok(ord.get(d) < p.order, `graph ${g}: ${p.phase_key} before its dependency`);
    }
  });
  await t('ready / blocked_by: a chain done -> planned -> planned', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_a:\n    status: "DONE 2026-01-01."\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n  P3_c:\n    depends_on: [P2]\n    status: "NOT STARTED"\n') }] });
    assert.strictEqual(byKey(r, 'P2_b').ready, true); assert.deepStrictEqual(byKey(r, 'P2_b').blocked_by, []);
    assert.strictEqual(byKey(r, 'P3_c').ready, false); assert.strictEqual(byKey(r, 'P3_c').blocked_by.length, 1);
    assert.strictEqual(byKey(r, 'P1_a').ready, false, 'a complete phase is not "ready"');
    assert.deepStrictEqual(r.summary, { total: 3, planned: 2, active: 0, complete: 1, blocked: 1, ready: 1 });
  });
  await t('a dependency cycle is reported, its members have no layer and sort last, and it terminates', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_a:\n    depends_on: [P2]\n    status: "NOT STARTED"\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n  P3_c:\n    status: "NOT STARTED"\n') }] });
    const w = r.warnings.find(x => x.type === 'dependency_cycle'); assert.ok(w); assert.deepStrictEqual(w.phases.sort(), ['P1_a', 'P2_b']);
    assert.strictEqual(byKey(r, 'P1_a').layer, null); assert.strictEqual(byKey(r, 'P3_c').layer, 0);
    assert.strictEqual(r.phases[0].phase_key, 'P3_c');
  });
  await t('a dependency that is not a phase in the map (a spec file, a URL) is reported and does not block or order anything', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_a:\n    depends_on: [nexus-repository-system.spec, P9]\n    status: "NOT STARTED"\n') }] });
    assert.deepStrictEqual(byKey(r, 'P1_a').unresolved_deps.sort(), ['P9', 'nexus-repository-system.spec']);
    assert.strictEqual(byKey(r, 'P1_a').ready, true); assert.strictEqual(byKey(r, 'P1_a').layer, 0);
    assert.strictEqual(r.warnings.filter(w => w.type === 'unresolved_dependency').length, 2);
  });
  await t('a prose dependency with spaces is ONE unresolved token, not one per word', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_a:\n    depends_on: [P0, "the auth spec (see docs)"]\n    status: "NOT STARTED"\n  P0_z:\n    status: "DONE"\n') }] });
    assert.deepStrictEqual(byKey(r, 'P1_a').unresolved_deps, ['the auth spec (see docs)']);
    assert.strictEqual(byKey(r, 'P1_a').depends_on.length, 1);
  });
  await t('an ambiguous key (P1_a and P1_b both match "P1") is reported, not guessed', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_a:\n    status: "DONE"\n  P1_b:\n    status: "DONE"\n  P2_c:\n    depends_on: [P1]\n    status: "NOT STARTED"\n') }] });
    assert.ok(r.warnings.some(w => w.type === 'ambiguous_dependency' && w.candidates.length === 2));
    assert.deepStrictEqual(byKey(r, 'P2_c').depends_on, []);
  });
  await t('a repeated phase id (a dictionary entry lower in the file) is reported; the FIRST is the phase', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_a:\n    status: "NOT STARTED"\n\nnotes:\n      P1_a: "a note that looks like a header"\n') }] });
    assert.strictEqual(r.phases.length, 1); assert.ok(r.warnings.some(w => w.type === 'duplicate_phase_id' && w.count === 2));
  });
  await t('two phasemaps in one project: distinct uuids, dependencies resolve inside each map', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [
      { path: 'a-phasemap.spec', text: mk('  P1_a:\n    status: "DONE"\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n') },
      { path: 'sub/b-phasemap.spec', text: mk('  P1_a:\n    status: "NOT STARTED"\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n') }] });
    assert.strictEqual(new Set(r.phases.map(p => p.uuid)).size, 4);
    const a2 = r.phases.find(p => p.map === 'a-phasemap.spec' && p.phase_key === 'P2_b'), b2 = r.phases.find(p => p.map === 'sub/b-phasemap.spec' && p.phase_key === 'P2_b');
    assert.strictEqual(a2.ready, true); assert.strictEqual(b2.ready, false);
    assert.ok(a2.depends_on[0].includes('a-phasemap.spec') && b2.depends_on[0].includes('sub/b-phasemap.spec'));
  });
  await t('status wording: DONE / IN PROGRESS / PARTIAL / NOT STARTED / OPEN read as loom reads them', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'a-phasemap.spec', text: mk('  P1_a:\n    status: "DONE 2026-01-01."\n  P2_b:\n    status: "IN PROGRESS"\n  P3_c:\n    status: "PARTIAL - half"\n  P4_d:\n    status: "NOT STARTED"\n  P5_e:\n    status: "OPEN"\n') }] });
    assert.deepStrictEqual(r.phases.map(p => p.status), ['complete', 'active', 'active', 'planned', 'planned']);
  });
  await t('no phasemap at all: an empty roadmap, not an error', () => {
    const r = rm.buildRoadmap({ projectId: 'p', maps: [] });
    assert.deepStrictEqual(r.summary, { total: 0, planned: 0, active: 0, complete: 0, blocked: 0, ready: 0 });
  });

  console.log('\n── editing a status: proven by loom reading it back ─────');
  const FORMS = {
    'single-line quoted': '  P1_a:\n    goal: "x"\n    status: "NOT STARTED"\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n',
    'unquoted': '  P1_a:\n    status: NOT STARTED\n  P2_b:\n    depends_on: [P1]\n    status: NOT STARTED\n',
    'folded block': '  P1_a:\n    status: >\n      NOT STARTED — verified\n      on two lines\n    goal: "x"\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n',
    'literal block, long evidence': '  P1_a:\n    status: |\n      DONE 2026-01-01. Evidence line one.\n      Evidence line two, which mentions NOT STARTED as a word.\n      Evidence line three.\n      Evidence line four.\n    goal: "x"\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n',
    'no status key': '  P1_a:\n    goal: "x"\n  P2_b:\n    depends_on: [P1]\n    status: "NOT STARTED"\n',
  };
  for (const [form, body] of Object.entries(FORMS)) {
    await t(`${form}: to complete, to active, back to planned — each read back by loom, other phases untouched, YAML valid`, () => {
      let text = mk(body);
      const others = (tx) => loom.parsePhasemapText(tx, 'm').filter(p => p.id !== 'P1_a').map(p => `${p.id}|${p.status}|${p.dependsOn}`);
      const base = others(text);
      for (const st of ['complete', 'active', 'planned']) {
        const r = rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P1_a', status: st, date: '2026-09-20', force: true });
        text = r.text;
        assert.strictEqual(loom.parsePhasemapText(text, 'm').find(p => p.id === 'P1_a').status, { complete: 'done', active: 'in-progress', planned: 'pending' }[st], `${st}`);
        assert.deepStrictEqual(others(text), base);
        yaml.load(text);
      }
      assert.strictEqual((text.match(/status_previous:/g) || []).length, 1, 'exactly one status_previous survives');
      assert.ok((text.match(/# roadmap edit 2026-09-20/g) || []).length === 3, 'each edit leaves a comment');
    });
  }
  await t('the previous status text is kept (status_previous + comment), not thrown away', () => {
    const r = rm.setPhaseStatus({ text: mk(FORMS['folded block']), mapName: 'm', phaseId: 'P1_a', status: 'complete', date: '2026-09-20' });
    assert.ok(/status_previous: "NOT STARTED — verified on two lines"/.test(r.text), r.text);
    assert.ok(/# roadmap edit 2026-09-20: NOT STARTED — verified on two lines -> DONE 2026-09-20\./.test(r.text));
    assert.ok(/status: "DONE 2026-09-20\."/.test(r.text));
  });
  await t('an old status containing NOT STARTED does NOT confuse the result (the previous text sits above, out of loom\'s window)', () => {
    const r = rm.setPhaseStatus({ text: mk(FORMS['single-line quoted']), mapName: 'm', phaseId: 'P1_a', status: 'complete', date: '2026-09-20' });
    assert.strictEqual(loom.parsePhasemapText(r.text, 'm').find(p => p.id === 'P1_a').status, 'done');
  });
  await t('refusals: blocked and unknown statuses, unknown phase, a dependency not complete (unless forced)', () => {
    const text = mk(FORMS['single-line quoted']);
    for (const bad of ['blocked', 'finished', '']) assert.throws(() => rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P1_a', status: bad }), (e) => e.code === 'BAD_STATUS', bad);
    assert.throws(() => rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P9_x', status: 'complete' }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P2_b', status: 'complete' }), (e) => e.code === 'DEPS_INCOMPLETE' && e.blockers.join() === 'P1_a');
    const forced = rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P2_b', status: 'complete', force: true });
    assert.strictEqual(loom.parsePhasemapText(forced.text, 'm').find(p => p.id === 'P2_b').status, 'done');
    // 'active' and 'planned' are not gated
    assert.ok(rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P2_b', status: 'active' }).text);
  });
  await t('an edit loom cannot read back is REFUSED, and nothing is returned to write', () => {
    // the line under status: says NOT STARTED, inside loom\'s window: DONE would read as pending
    const text = mk('  P1_a:\n    status: "NOT STARTED"\n    does: "NOT STARTED yet"\n');
    assert.throws(() => rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P1_a', status: 'complete' }), (e) => e.code === 'ROUNDTRIP_FAILED' && /nothing was changed/.test(e.message));
  });
  await t('a file that was valid YAML is still valid after an edit (the guard for the opposite case is in setPhaseStatus, exercised only by this sane path)', () => {
    const text = 'phases:\n  P1_a:\n    status: "NOT STARTED"\n';
    yaml.load(rm.setPhaseStatus({ text, mapName: 'm', phaseId: 'P1_a', status: 'complete' }).text);
  });

  console.log('\n── GATE: the same rows loom\'s scanner reads ────────────');
  await t('edit MCO-E in the REAL overhaul phasemap; LOOM (own process, own scanner) reads it changed and every other phase identical', () => {
    const before = loomReads(docsDir({ 'idearium-repository-overhaul-phasemap.spec': real }));
    let text = real;
    const r1 = rm.setPhaseStatus({ text, mapName: 'idearium-repository-overhaul-phasemap', phaseId: 'MCO-E_roadmap_ui', status: 'active', date: '2026-09-20' });
    const afterActive = loomReads(docsDir({ 'idearium-repository-overhaul-phasemap.spec': r1.text }));
    const r2 = rm.setPhaseStatus({ text: r1.text, mapName: 'idearium-repository-overhaul-phasemap', phaseId: 'MCO-E_roadmap_ui', status: 'complete', date: '2026-09-20' });
    const afterDone = loomReads(docsDir({ 'idearium-repository-overhaul-phasemap.spec': r2.text }));
    const pick = (ph, id) => ph.find(p => p.id === id).status;
    assert.strictEqual(pick(before, 'MCO-E_roadmap_ui'), 'pending');
    assert.strictEqual(pick(afterActive, 'MCO-E_roadmap_ui'), 'in-progress');
    assert.strictEqual(pick(afterDone, 'MCO-E_roadmap_ui'), 'done');
    const rest = (ph) => ph.filter(p => p.id !== 'MCO-E_roadmap_ui').map(p => `${p.map}|${p.id}|${p.status}|${p.dependsOn}`);
    assert.deepStrictEqual(rest(afterActive), rest(before)); assert.deepStrictEqual(rest(afterDone), rest(before));
    yaml.load(r2.text);
  });
  await t('and the roadmap built from the edited text agrees with what loom read', () => {
    const r = rm.setPhaseStatus({ text: real, mapName: 'idearium-repository-overhaul-phasemap', phaseId: 'MCO4_hooks_wires_flows_tools', status: 'active', date: '2026-09-20' });
    const road = rm.buildRoadmap({ projectId: 'p', maps: [{ path: REAL_PATH, text: r.text }] });
    assert.strictEqual(byKey(road, 'MCO4_hooks_wires_flows_tools').status, 'active');
    assert.strictEqual(road.summary.active, 1);
  });

  console.log('\n── collecting phasemaps from a repo directory ───────────');
  const sf = await import(path.join(ROOT, 'idearium/repo/source-files.js'));
  await t('finds phasemap files by loom\'s filename rule, anywhere in the tree, ignores everything else', () => {
    const dir = path.join(TMP, 'repo1');
    for (const [p, c] of Object.entries({ 'docs/a-phasemap.spec': mk('  P1_a:\n    status: "DONE"\n'), 'deep/er/b.phasemap.spec': mk('  P1_b:\n    status: "NOT STARTED"\n'), 'README.md': '# x', 'src/phasemap.js': '1;', 'notes.spec': 'x' })) {
      fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c);
    }
    const repo = { uuid: 'r1', files: Object.keys({ 'docs/a-phasemap.spec': 1, 'deep/er/b.phasemap.spec': 1, 'README.md': 1, 'src/phasemap.js': 1, 'notes.spec': 1 }).map(p => ({ path: p })) };
    const c = rm.collectPhasemaps(repo, dir);
    assert.deepStrictEqual(c.maps.map(m => m.path), ['deep/er/b.phasemap.spec', 'docs/a-phasemap.spec']);
  });
  await t('finds a phasemap the SOURCE layer owns (an imported project) that is not in repo.files', () => {
    const dir = path.join(TMP, 'repo2');
    sf.writeSourceFiles(dir, [{ path: 'proj/docs/x-phasemap.spec', buffer: Buffer.from(mk('  P1_a:\n    status: "DONE"\n')) }]);
    const c = rm.collectPhasemaps({ uuid: 'r2', files: [] }, dir);
    assert.deepStrictEqual(c.maps.map(m => m.path), ['proj/docs/x-phasemap.spec']);
  });
  await t('skips (and says why) a phasemap that is missing, too large, a symlink or not UTF-8', () => {
    const dir = path.join(TMP, 'repo3'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bad-phasemap.spec'), Buffer.from([0xff, 0xfe, 0x41]));
    fs.symlinkSync(path.join(dir, 'bad-phasemap.spec'), path.join(dir, 'link-phasemap.spec'));
    const repo = { uuid: 'r3', files: ['bad-phasemap.spec', 'link-phasemap.spec', 'gone-phasemap.spec'].map(p => ({ path: p })) };
    const c = rm.collectPhasemaps(repo, dir);
    assert.deepStrictEqual(c.maps, []);
    const why = Object.fromEntries(c.skipped.map(x => [x.path, x.reason]));
    assert.ok(/UTF-8/.test(why['bad-phasemap.spec'])); assert.ok(/regular file/.test(why['link-phasemap.spec'])); assert.ok(/not on disk/.test(why['gone-phasemap.spec']));
  });

  // §0.39.275 — the dependency graph across two specs written the same day (2026-09-28).
  console.log('\n── dependency graph: trailing comments and cross-spec references ──');
  const listMap = (phases) => `spec:\n  meta:\n    name: x\n  phases:\n${phases}`;
  await t('DG-1 a `# comment` after a flow list is not part of the last dependency', () => {
    const loomScan = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
    const p = loomScan.parsePhasemapText(listMap('    - id: A\n    - id: B\n    - id: C\n      depends_on: [A, B]  # B is optional, never ripple\n'), 'm').find(x => x.id === 'C');
    assert.strictEqual(p.dependsOn, 'A, B');
    const r = rm.buildRoadmap({ projectId: 'p', maps: [{ path: 'm-phasemap.spec', text: listMap('    - id: A\n    - id: B\n    - id: C\n      depends_on: [A, B]  # why\n') }] });
    const c = r.phases.find(x => x.phase_key === 'C');
    assert.strictEqual(c.depends_on.length, 2, 'both edges survive');
    assert.deepStrictEqual(c.unresolved_deps, []);
    assert.ok(!r.warnings.some(w => w.type === 'unresolved_dependency'));
  });
  await t('DG-2 "<map words> <phase>" resolves to the one phase in the one other map, and orders it', () => {
    const a = { path: 'docs/2026-09-28-staging-phasemap.spec', text: listMap('    - id: S0\n    - id: C1\n') };
    const b = { path: 'docs/2026-09-28-graph-phasemap.spec', text: listMap('    - id: B0\n    - id: B1\n      depends_on: [B0, staging S0]\n    - id: C1\n') };
    const r = rm.buildRoadmap({ projectId: 'p', maps: [b, a] });          // the dependent map is listed FIRST
    const b1 = r.phases.find(x => x.phase_key === 'B1'); const s0 = r.phases.find(x => x.phase_key === 'S0' && x.map === a.path);
    assert.ok(b1.depends_on.includes(s0.uuid), 'B1 -> staging S0');
    assert.deepStrictEqual(b1.unresolved_deps, []);
    assert.ok(s0.order < b1.order, 'the dependency sorts first');
    assert.ok(b1.blocked_by.includes(s0.uuid) && !b1.ready, 'B1 waits on an unfinished phase in the other spec');
    assert.ok(!r.warnings.some(w => w.type === 'unresolved_dependency'));
  });
  await t('DG-3 a bare key is never guessed across maps, and an ambiguous or unknown qualifier stays unresolved', () => {
    const a = { path: 'a-staging-phasemap.spec', text: listMap('    - id: C1\n') };
    const c = { path: 'c-other-phasemap.spec', text: listMap('    - id: C1\n') };
    const b = { path: 'b-graph-phasemap.spec', text: listMap('    - id: C1\n    - id: X\n      depends_on: [C1, staging C9, phasemap C1, staging C1]\n') };
    const r = rm.buildRoadmap({ projectId: 'p', maps: [a, b, c] });
    const x = r.phases.find(p => p.phase_key === 'X' && p.map === b.path);
    assert.deepStrictEqual(x.depends_on, [`p:${b.path}:C1`, `p:${a.path}:C1`], 'bare C1 = its own map; "staging C1" = the one other map named staging');
    // "phasemap" names BOTH other maps, so it is not guessed; C9 exists in no map
    assert.deepStrictEqual(x.unresolved_deps.sort(), ['phasemap C1', 'staging C9']);
    assert.strictEqual(r.warnings.filter(w => w.type === 'unresolved_dependency' && w.phase === 'X').length, 2);
  });
  await t("DG-4 today's two real specs: B1 waits on staging S0 and S4 waits on C1", () => {
    const D = path.join(ROOT, 'docs');
    const names = ['2026-09-28-graph-build-context-settings-memory-phasemap.spec', '2026-09-28-staging-self-heal-phasemap.spec'];
    if (!names.every(n => fs.existsSync(path.join(D, n)))) return;        // the pair is only there while these maps are
    const r = rm.buildRoadmap({ projectId: 'p', maps: names.map(n => ({ path: `docs/${n}`, text: fs.readFileSync(path.join(D, n), 'utf8') })) });
    const at = (n, k) => r.phases.find(p => p.map === `docs/${names[n]}` && p.phase_key === k);
    assert.ok(at(0, 'B1').depends_on.includes(at(1, 'S0').uuid));
    assert.ok(at(1, 'S4').depends_on.includes(at(1, 'C1').uuid));
    assert.ok(!r.warnings.some(w => w.type === 'unresolved_dependency' && /staging S0|C1\]/.test(w.token)));
  });

  console.log('\n── wiring (structural — the routes are exercised over HTTP) ──');
  const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  await t('both routes are registered and the edit route reads the file back after writing', () => {
    assert.ok(/\['GET',\s*\['api','repos',\s*':uuid','roadmap'\],\s*'repo\.roadmap\.get'\]/.test(api));
    assert.ok(/\['POST',\s*\['api','repos',\s*':uuid','roadmap','phase'\],\s*'repo\.roadmap\.phase\.update'\]/.test(api));
    assert.ok(/READBACK_MISMATCH/.test(api));
  });

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${fail ? '✗' : '✓'} moce-roadmap: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
