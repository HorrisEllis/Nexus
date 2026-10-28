'use strict';
/**
 * tests/modules/test-automation-registry.test.js — AU1: the automation union.
 * Map: docs/2026-10-24-agent-orchestration-phasemap.spec (AU1 / AU_D1) · Spec: docs/brainos-in-idearium.spec.
 *
 * James: "copilot system, ollama, lib folder, clearglass, idearium, and brainos have automation" · "Clearglass
 * automation, and macros, continue." One neutral registry over the six via an adapter per source. The transport is
 * injected so the whole thing runs without a live backend: a fake engine stands in for Clear Glass :7704.
 * Proves the spec's own acceptance: lists workflows from each present source; a run records UNDER the source; an
 * absent source is NAMED, not thrown (§1.2).
 */
const assert = require('assert');
const REG = require('../../lib/automation-registry.js');
let passed = 0, failed = 0;
const reg = [];
function test(id, desc, fn) { reg.push({ id, desc, fn }); }

// a fake Clear Glass engine over the injected http(system, {method, path, body}) transport
function fakeEngine({ up = true, ran = [] } = {}) {
  return async function http(system, { method = 'GET', path = '/' } = {}) {
    if (system === 'copilot') return up && path === '/health' ? { ok: true } : { ok: false, error: 'co-pilot not reachable on :3750' };
    if (system !== 'clear-glass' && system !== 'clearglass') return { ok: false, error: `${system} not reachable` };
    if (!up) return { ok: false, error: 'Clear Glass is not reachable on :7704 (ECONNREFUSED)' };
    if (path === '/automation/active') return { ok: true, runs: [] };
    if (path === '/automation/workflows') return { ok: true, workflows: [{ id: 'wf-1', name: 'Nightly scrape', status: 'active', runCount: 3 }] };
    if (path === '/automation/nodes') return { ok: true, nodes: [{ file: 'login.macro', name: 'Login' }, { file: 'x.workflow', name: 'X' }] };
    if (method === 'POST' && /\/automation\/workflows\/.+\/run$/.test(path)) { ran.push(path); return { ok: true, runId: 'run-9', status: 'ok', output: 42 }; }
    return { ok: false, error: `unexpected ${method} ${path}` };
  };
}
const deps = (over = {}) => ({ http: fakeEngine(over), libNodeTypes: () => ['macro', 'workflow', 'debug_macro'], ...over.extra });

test('A1', 'exports the neutral door (sources, list, run, describe)', () => {
  for (const k of ['sources', 'list', 'run', 'describe']) assert.strictEqual(typeof REG[k], 'function', `exports ${k}`);
  assert.deepStrictEqual(REG.SOURCE_IDS, ['copilot', 'ollama', 'lib', 'clear-glass', 'idearium', 'brainos'], 'his six, in his order');
});

test('A2', 'describe() is the honest self-model: one engine, drivers, in-process, absent', () => {
  const d = REG.describe();
  const byId = Object.fromEntries(d.sources.map(s => [s.id, s]));
  assert.strictEqual(byId['clear-glass'].kind, 'engine');
  assert.strictEqual(byId.brainos.kind, 'engine-store');
  assert.strictEqual(byId.copilot.kind, 'driver');
  assert.strictEqual(byId.idearium.kind, 'driver');
  assert.strictEqual(byId.lib.kind, 'in-process');
  assert.strictEqual(byId.ollama.kind, 'absent');
});

test('A3', 'sources(): ollama is named absent, lib is present (node types), clear-glass present when engine is up', async () => {
  const s = await REG.sources(deps({ up: true }));
  const byId = Object.fromEntries(s.map(x => [x.id, x]));
  assert.strictEqual(byId.ollama.present, false);
  assert.match(byId.ollama.why, /no automation surface/);
  assert.strictEqual(byId.lib.present, true, 'lib defines node types in-process');
  assert.strictEqual(byId['clear-glass'].present, true);
  assert.strictEqual(byId.brainos.present, true, 'brainos shares the engine store');
});

test('A4', 'list(): workflows AND macros from clear-glass, merged, tagged by source', async () => {
  const r = await REG.list({}, deps({ up: true }));
  assert.strictEqual(r.ok, true);
  const cg = r.items.filter(i => i.source === 'clear-glass');
  assert.ok(cg.some(i => i.kind === 'workflow' && i.id === 'wf-1'), 'a workflow is listed');
  assert.ok(cg.some(i => i.kind === 'macro' && /login\.macro/.test(i.id)), 'a macro is listed');
  // brainos surfaces the same workflow via the shared engine
  const bx = r.items.filter(i => i.source === 'brainos');
  assert.ok(bx.some(i => i.id === 'wf-1' && i.via === 'clear-glass'), 'brainos shows the engine workflow, via clear-glass');
  // lib contributes node types
  assert.ok(r.items.some(i => i.source === 'lib' && i.kind === 'node-type'), 'lib node types are listed');
});

test('A5', 'list(): every source is reported; an absent source is NAMED, not thrown (§1.2)', async () => {
  const r = await REG.list({}, deps({ up: true }));
  const byId = Object.fromEntries(r.sources.map(s => [s.id, s]));
  for (const id of REG.SOURCE_IDS) assert.ok(byId[id], `${id} reported`);
  assert.strictEqual(byId.ollama.present, false);
  assert.ok(byId.ollama.why, 'ollama failure named');
  assert.strictEqual(byId['clear-glass'].count >= 2, true, 'clear-glass counts its items');
});

test('A6', 'list(): the engine down is NAMED in sources[], never thrown; items stay empty for it', async () => {
  const r = await REG.list({}, deps({ up: false }));
  assert.strictEqual(r.ok, true, 'list never throws');
  const cg = r.sources.find(s => s.id === 'clear-glass');
  assert.strictEqual(cg.present, false);
  assert.ok(cg.why && /reachable|answer/.test(cg.why), `engine-down is named: ${cg.why}`);
  assert.strictEqual(r.items.filter(i => i.source === 'clear-glass').length, 0);
});

test('A7', 'run(): a clear-glass run records UNDER clear-glass and hits the engine run route', async () => {
  const ran = [];
  const r = await REG.run('clear-glass', 'wf-1', {}, { http: fakeEngine({ up: true, ran }), libNodeTypes: () => [] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, 'clear-glass');
  assert.strictEqual(r.runId, 'run-9');
  assert.ok(ran.some(p => /wf-1\/run$/.test(p)), 'the engine run route was called');
});

test('A8', 'run(): brainos/copilot/idearium delegate but record under their own source, with via', async () => {
  const H = fakeEngine({ up: true });
  for (const src of ['brainos', 'copilot', 'idearium']) {
    const r = await REG.run(src, 'wf-1', {}, { http: H, libNodeTypes: () => [] });
    assert.strictEqual(r.ok, true, `${src} ran`);
    assert.strictEqual(r.source, src, `recorded under ${src}`);
    assert.strictEqual(r.via, 'clear-glass', `${src} says it ran via the engine (no silent redirect)`);
  }
});

test('A9', 'run(): lib refuses honestly (says where it runs); ollama refuses honestly — neither throws', async () => {
  const lib = await REG.run('lib', 'macro', {}, deps({ up: true }));
  assert.strictEqual(lib.ok, false);
  assert.match(lib.error, /clear-glass/, 'lib says where it actually runs');
  const oll = await REG.run('ollama', 'anything', {}, deps({ up: true }));
  assert.strictEqual(oll.ok, false);
  assert.match(oll.error, /no automation surface/);
});

test('A10', 'run(): an unknown source and a missing id are named, not thrown', async () => {
  const u = await REG.run('nope', 'x', {}, deps());
  assert.strictEqual(u.ok, false); assert.match(u.error, /unknown automation source/);
  const m = await REG.run('clear-glass', '', {}, deps());
  assert.strictEqual(m.ok, false); assert.match(m.error, /which automation/);
});

test('A11', 'run(): a driver run refused when the engine is down — named, not thrown', async () => {
  const r = await REG.run('copilot', 'wf-1', {}, deps({ up: false, extra: {} }));
  // copilot present-check hits :3750 (its own door). With the fake engine only clear-glass answers, so copilot reads not-present.
  assert.strictEqual(r.ok, false);
  assert.ok(r.error, 'the refusal is named');
});

async function run() {
  for (const { id, desc, fn } of reg) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  process.stdout.write(`\n  test-automation-registry.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}
run();

module.exports = { passed: () => passed, failed: () => failed };
