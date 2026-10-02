'use strict';
/**
 * tests/modules/test-event-contracts.test.js — EV0 (3): the event contract, checked against the code
 * (lib/event-contract-check.js; docs/2026-10-02-emerge-field-memory-build-phasemap.spec, invariant E14).
 *
 *   EC-01  the reader: literal emits as a method or a bare helper, `?.(`, a ternary's two branches, the payload's
 *          top-level keys; a stream's own 'error' / 'data' is not a system event; ET1's key rule
 *   EC-01b SISO events (new Event, E, { type }) and constants read through the system's own tables; a table that lacks
 *          the key is MISSING (the emit sends undefined) and fails; one no table resolves is unread, said; quoted and
 *          commented calls are not emits
 *   EC-02  a template emit is unresolved unless its site names what it emits (`// emits: a, b`) — then those are checked
 *   EC-03  a system: undeclared, unused (said, not failed) and a collision (two names, one key — always a failure)
 *   EC-04  the ratchet: new drift fails, a baseline entry declared since fails until dropped, the baseline excuses nothing else
 *   EC-05  every system in contracts/event-contract-baseline.json, read from disk: no drift beyond its baseline, no
 *          collision, its taxonomy (when it has one) in ET1's shape
 *   EC-06  wired: `nexus contracts check` in the CLI; loom has the check as a component, wired to that CLI
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'lib/event-contract-check.js'));
const { validateTaxonomy } = require(path.join(ROOT, 'lib/event-taxonomy-pattern.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
const T = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, d]) => [k, { description: d, payloadShape: [], severity: 'info' }])));

test('EC-01', 'the reader: methods, bare helpers, ?.(, ternaries, payload keys; stream events skipped', () => {
  const src = [
    "bus.emit('a.thing.done', { id, ...base, n: 1 });",
    "_emitEvent('v.committed', { commitId, branch });",
    "busEmit?.('ncp.client.connected', { provider }, 'INFO');",
    "this.postEvent('autofill.gig.drafted', {});",
    "bus.emit(r.ok ? 'g.artifact.captured' : 'g.artifact.refused', r);",
    "stream.emit('error', e); s.emit('data', d); myemit('not.a.call'); emitter('nope.x');",
    "emit('ci:run:started', { runId });",
  ].join('\n');
  const e = C.extractEmits(src);
  const names = e.map(x => x.event).sort();
  assert.deepStrictEqual(names, ['a.thing.done', 'autofill.gig.drafted', 'ci:run:started', 'g.artifact.captured', 'g.artifact.refused', 'ncp.client.connected', 'v.committed']);
  assert.deepStrictEqual(e.find(x => x.event === 'a.thing.done').payload, ['id', '...base', 'n']);
  assert.strictEqual(e.find(x => x.event === 'a.thing.done').line, 1);
  assert.strictEqual(C.keyOf('idearium.phase.proven'), 'IDEARIUM_PHASE_PROVEN');
  assert.strictEqual(C.keyOf('ci:run:started'), 'CI_RUN_STARTED');
  assert.strictEqual(C.keyOf('idearium.spec-engine.created'), 'IDEARIUM_SPEC_ENGINE_CREATED');
});

test('EC-01b', 'SISO events and constants: new Event(…), E(…), { type }, a table in the system\'s own source', () => {
  const consts = C.constantTables(["const HOST = Object.freeze({ COMPARTMENT_CREATED: 'host:compartment:created' });\nconst VAULT = Object.freeze({ SET: 'vault:secret:set' });"]);
  const src = [
    "stream.emit(new Event(HOST.COMPARTMENT_CREATED, { id, name }));",
    "stream.emit(new Event('compiler.check', { file }));",
    "s.emit(E('field.settled'));",
    "bus.emit({ type: 'z.done', data });",
    "bus.emit(VAULT.INJECTED, { key });",
    "bus.emit(ELSEWHERE.THING, {});",
    "bus.emit(type, payload);",
    "decl('hook', { name: \"os.emit('quoted.not.real')\" }); // bus.emit('commented.out')",
  ].join('\n');
  const e = C.extractEmits(src, consts);
  assert.deepStrictEqual(e.filter(x => x.event).map(x => x.event), ['host:compartment:created', 'compiler.check', 'field.settled', 'z.done']);
  assert.deepStrictEqual(e.find(x => x.event === 'host:compartment:created').payload, ['id', 'name']);
  assert.deepStrictEqual(C.extractEmits("k.emit({ type: 'compartment.born', data: { id, purpose } });")[0].payload, ['id', 'purpose'], '{ type, data } — the data\'s keys');
  assert.deepStrictEqual(e.filter(x => x.unread).map(x => [x.constant, x.missing]), [['VAULT.INJECTED', true], ['ELSEWHERE.THING', false]]);
  const r = C.checkSources({ system: 's', sources: [{ file: 'k.js', text: "const VAULT = Object.freeze({ SET: 'vault:secret:set' });\nbus.emit(VAULT.INJECTED, {});" }], taxonomy: T({}) });
  assert.deepStrictEqual(r.missing, [{ constant: 'VAULT.INJECTED', site: 'k.js:2' }]);
  assert.strictEqual(r.ok, false, 'a missing key sends undefined: a failure');
});

test('EC-02', 'a template emit is unresolved until its site names its events', () => {
  const bare = C.extractEmits('os.emit(`idearium.cos.remote.${op}`, { id });');
  assert.strictEqual(bare.length, 1); assert.ok(bare[0].unresolved);
  const named = C.extractEmits('// emits: idearium.cos.remote.push, idearium.cos.remote.pull\nos.emit(`idearium.cos.remote.${op}`, { id });');
  assert.deepStrictEqual(named.map(x => x.event), ['idearium.cos.remote.push', 'idearium.cos.remote.pull']);
  const withProse = C.extractEmits('// emits: lab.info, lab.warn, lab.error — the levels _log is called with\nthis._emit(`lab.${level}`, {});');
  assert.deepStrictEqual(withProse.map(x => x.event), ['lab.info', 'lab.warn', 'lab.error'], 'prose after the names is not a name');
  const sameLine = C.extractEmits('os.emit(`x.${t}`, p); // emits: x.a, x.b');
  assert.deepStrictEqual(sameLine.map(x => x.event), ['x.a', 'x.b']);
  const r = C.checkSources({ system: 's', sources: [{ file: 'f.js', text: 'os.emit(`x.${t}`, p);' }], taxonomy: T({}) });
  assert.strictEqual(r.ok, false); assert.deepStrictEqual(r.unresolved, [{ template: 'x.${t}', site: 'f.js:1' }]);
});

test('EC-03', 'a system: undeclared and unused said; a collision is a failure', () => {
  const sources = [{ file: 's/a.js', text: "bus.emit('s.one', {a});\nbus.emit('s.two', {b});" }, { file: 's/b.js', text: "bus.emit('s.one', {c});" }];
  const r = C.checkSources({ system: 's', sources, taxonomy: T({ S_ONE: 'one', S_OLD: 'never emitted here' }) });
  assert.deepStrictEqual(r.undeclared.map(x => x.event), ['s.two']);
  assert.deepStrictEqual(r.unused, ['S_OLD']);
  const one = r.emitted.find(x => x.event === 's.one');
  assert.deepStrictEqual(one.sites, ['s/a.js:1', 's/b.js:1']); assert.deepStrictEqual(one.payload.sort(), ['a', 'c']);
  assert.strictEqual(r.ok, false);
  const ok = C.checkSources({ system: 's', sources, taxonomy: T({ S_ONE: 'one', S_TWO: 'two', S_OLD: 'kept' }) });
  assert.strictEqual(ok.ok, true, 'unused alone does not fail');
  const col = C.checkSources({ system: 's', sources: [{ file: 'c.js', text: "e.emit('s.a-b', {}); e.emit('s.a.b', {});" }], taxonomy: T({ S_A_B: 'x' }) });
  assert.strictEqual(col.ok, false); assert.deepStrictEqual(col.collisions, [{ key: 'S_A_B', events: ['s.a-b', 's.a.b'] }]);
});

test('EC-04', 'the ratchet: new drift fails, a declared baseline entry fails until dropped', () => {
  const rep = (undeclared, unresolved = []) => ({ undeclared: undeclared.map(event => ({ event })), unresolved: unresolved.map(template => ({ template })), collisions: [], loadError: null });
  assert.deepStrictEqual(C.againstBaseline(rep(['a.x']), { undeclared: ['a.x'] }), { ok: true, added: [], cleared: [] });
  const grew = C.againstBaseline(rep(['a.x', 'a.new']), { undeclared: ['a.x'] });
  assert.strictEqual(grew.ok, false); assert.deepStrictEqual(grew.added, ['a.new']);
  const shrank = C.againstBaseline(rep([]), { undeclared: ['a.x'] });
  assert.strictEqual(shrank.ok, false); assert.deepStrictEqual(shrank.cleared, ['a.x']);
  assert.strictEqual(C.againstBaseline(rep([], ['t.${x}']), { unresolved: ['t.${x}'] }).ok, true);
  assert.strictEqual(C.againstBaseline({ ...rep([]), collisions: [{ key: 'K' }] }, {}).ok, false, 'the baseline never excuses a collision');
  assert.strictEqual(C.againstBaseline({ ...rep([]), missing: [{ constant: 'V.X' }] }, { missing: ['V.X'] }).ok, true);
  assert.deepStrictEqual(C.againstBaseline({ ...rep([]), missing: [{ constant: 'V.Y' }] }, { missing: [] }).added, ['missing:V.Y']);
});

test('EC-05', 'every system held to the contract: nothing beyond its baseline, no collision, ET1 shape', () => {
  const base = C.loadBaseline(ROOT);
  const systems = Object.keys(base.systems);
  assert.ok(systems.length >= 12, `the baseline names ${systems.length} systems`);
  const problems = [];
  for (const s of systems) {
    const r = C.checkSystem(ROOT, s);
    const b = C.againstBaseline(r, base.systems[s]);
    if (b.added.length) problems.push(`${s}: emitted but not declared — ${b.added.map(e => `${e} (${(r.undeclared.find(x => x.event === e) || { sites: [] }).sites.join(', ')})`).join('; ')}. Declare it in ${r.taxonomyFile || `${s}/event-taxonomy.js`}.`);
    if (b.cleared.length) problems.push(`${s}: declared now, still in ${C.BASELINE_FILE} — drop ${b.cleared.join(', ')}`);
    if (r.collisions.length) problems.push(`${s}: collision ${JSON.stringify(r.collisions)}`);
    if (r.loadError) problems.push(`${s}: taxonomy did not load — ${r.loadError}`);
    if (r.taxonomyFile) { const v = validateTaxonomy(require(path.join(ROOT, r.taxonomyFile)), { systemName: s }); if (!v.ok) problems.push(...v.errors); }
  }
  assert.ok(!problems.length, '\n      ' + problems.join('\n      '));
});

test('EC-05b', 'an emit added without a declaration fails the check (the proof EV0 names)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev0-'));
  fs.mkdirSync(path.join(dir, 'sys'));
  fs.writeFileSync(path.join(dir, 'sys', 'event-taxonomy.js'), "module.exports = Object.freeze({ SYS_KNOWN: { description: 'k', payloadShape: [], severity: 'info' } });");
  fs.writeFileSync(path.join(dir, 'sys', 'a.js'), "bus.emit('sys.known', {});");
  assert.strictEqual(C.againstBaseline(C.checkSystem(dir, 'sys'), { undeclared: [] }).ok, true);
  fs.appendFileSync(path.join(dir, 'sys', 'a.js'), "\nbus.emit('sys.added.today', { id });");
  const r = C.checkSystem(dir, 'sys');
  const b = C.againstBaseline(r, { undeclared: [] });
  assert.strictEqual(b.ok, false); assert.deepStrictEqual(b.added, ['sys.added.today']);
  assert.deepStrictEqual(r.undeclared[0].sites, ['sys/a.js:2']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('EC-06', 'wired: the CLI verb and loom', () => {
  const cli = fs.readFileSync(path.join(ROOT, 'cli/nexus.js'), 'utf8');
  assert.ok(cli.includes('async contracts()') && cli.includes("require('../lib/event-contract-check.js')"), 'nexus contracts check');
  // loom's tree scan registers lib/*.js with its real require() edges (a hand-map entry would collide with it)
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'loom/data/registry.json'), 'utf8'));
  assert.ok(reg.component['nexus.lib.event-contract-check'], 'the check is a loom component');
  assert.ok(Object.values(reg.wire).some(w => w.from_hook_id === 'nexus.lib.event-contract-check.export' && w.to_hook_id === 'nexus.cli.nexus.import'), 'wired to the CLI that runs it');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
