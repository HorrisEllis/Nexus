'use strict';
/**
 * tests/modules/test-agent-maps-phase.test.js — SL8 (0.60.228): the agent maps what Nexus cannot.
 * James, 2026-10-23: "agent needs to map dependancies if nexus cant map one."
 *
 *   AM-01  mapOne checks every part of the answer by code: an existing file, a new file in an existing folder; an unsafe path, a file
 *          in a folder that does not exist, a depends_on that names nothing, the phase itself, or one downstream (a cycle) are refused
 *   AM-02  kept per phase text: a second call asks nothing; a changed phase is asked again; an answer about another phase, prose, or
 *          no answer maps nothing and says why
 *   AM-03  the real router: a phase with no files and nothing in its words is mapped by the agent and gets past DG2 (no NO_GRAPH), the
 *          agent asked once; built again, asked nothing; an agent that cannot map it → 409 NO_GRAPH naming what it answered
 *   AM-04  the run says so: the plan history carries mappedBy and rebuild, the Plan panel shows them
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };

const MAP = `phases:
  N0_store:
    status: DONE
    depends_on: []
    files: [lib/store.js]
  N1_vague:
    status: OPEN
    depends_on: []
    does: make the notes searchable by any word, quickly
  N2_after:
    status: OPEN
    depends_on: [N1_vague]
    files: [lib/later.js]
`;
const ans = (o) => JSON.stringify({ phases: [o] });

(async () => {
  const PM = await import(path.join(ROOT, 'idearium/repo/phase-mapping.js'));
  const PF = require(path.join(ROOT, 'lib/phase-files.js'));
  const files = new Set(['lib/store.js']), dirs = new Set(['lib']);
  const env = { exists: (p) => files.has(p), dirExists: (d) => dirs.has(d) };
  const ph = PF.phasesOf(MAP, 'docs/n-phasemap.spec').find(p => p.id === 'N1_vague');
  const keys = { N0_store: 'docs/n-phasemap.spec::N0_store', N2_after: 'docs/n-phasemap.spec::N2_after', N1_vague: 'docs/n-phasemap.spec::N1_vague' };
  const resolveDep = (d) => keys[d] || null;
  const wouldCycle = (k) => k === keys.N2_after;   // N2 depends on N1: N1 depending on N2 would close a cycle
  const memStore = () => { const m = {}; return { get: (k) => m[k] || null, set: (k, v) => { m[k] = v; }, all: () => m }; };

  await test('AM-01', 'every part of the answer is checked by code; what fails is refused, each with why', async () => {
    let prompt = '';
    const r = await PM.mapOne({ phase: ph, ...env, resolveDep, wouldCycle, store: memStore(), depChoices: [{ id: 'N0_store', does: 'the store' }],
      ask: async (p) => { prompt = p; return { ok: true, by: 'scripted', text: ans({ id: 'N1_vague', files: [{ path: 'lib/store.js' }, { path: 'lib/search.js', new: true }, { path: '../etc/passwd' }, { path: 'nowhere/x.js', new: true }], depends_on: ['N0_store', 'ZZ9', 'N1_vague', 'N2_after'] }) }; } });
    assert.ok(/depends_on/.test(prompt) && /N0_store: the store/.test(prompt), 'the brief asks for depends_on from the list');
    assert.strictEqual(r.ok, true, r.why);
    assert.deepStrictEqual(r.mapping.files.map(f => [f.path, f.exists]), [['lib/store.js', true], ['lib/search.js', false]]);
    assert.deepStrictEqual(r.mapping.dependsOn, [keys.N0_store]);
    const why = r.mapping.refused.map(x => `${x.what}: ${x.why}`).join(' | ');
    for (const w of ['unsafe', 'nowhere/x.js', 'ZZ9: names no phase', 'N1_vague: the phase itself', 'N2_after:']) assert.ok(why.includes(w), `${w} in ${why}`);
    assert.strictEqual(r.mapping.by, 'agent:scripted');
  });

  await test('AM-02', 'kept per phase text; a changed phase is asked again; a wrong or empty answer maps nothing, said', async () => {
    const store = memStore(); let n = 0;
    const ask = async () => { n++; return { ok: true, by: 'scripted', text: ans({ id: 'N1_vague', files: [{ path: 'lib/search.js', new: true }], depends_on: [] }) }; };
    assert.strictEqual((await PM.mapOne({ phase: ph, ...env, resolveDep, wouldCycle, store, ask })).asked, true);
    const again = await PM.mapOne({ phase: ph, ...env, resolveDep, wouldCycle, store, ask });
    assert.deepStrictEqual([again.ok, again.asked, n], [true, false, 1]);
    const changed = await PM.mapOne({ phase: { ...ph, body: `${ph.body}\n    also: ranks them` }, ...env, resolveDep, wouldCycle, store, ask });
    assert.deepStrictEqual([changed.asked, n], [true, 2]);
    const other = await PM.mapOne({ phase: ph, ...env, resolveDep, wouldCycle, store: memStore(), ask: async () => ({ ok: true, by: 's', text: ans({ id: 'N0_store', files: [{ path: 'lib/x.js', new: true }] }) }) });
    assert.strictEqual(other.ok, false); assert.ok(/not in the answer/.test(other.why), other.why);
    const prose = await PM.mapOne({ phase: ph, ...env, resolveDep, wouldCycle, store: memStore(), ask: async () => ({ ok: true, by: 's', text: 'I think it touches the search module.' }) });
    assert.strictEqual(prose.ok, false); assert.ok(/not the JSON asked for/.test(prose.why), prose.why);
    const none = await PM.mapOne({ phase: ph, ...env, resolveDep, wouldCycle, store: memStore(), ask: async () => ({ ok: false, error: 'timed out' }) });
    assert.strictEqual(none.ok, false); assert.ok(/did not answer: timed out/.test(none.why));
    const m = PM.mapped(store.get(keys.N1_vague));
    assert.strictEqual(m.source, 'agent'); assert.deepStrictEqual(m.files.map(f => f.path), ['lib/search.js']);
  });

  await test('AM-03', 'the real router: mapped by the agent past DG2, asked once; an agent that cannot map it → NO_GRAPH naming why', async () => {
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `am-${Date.now()}`, source: 'test', compartmentId: 'c-am', files: [{ path: 'docs/n-phasemap.spec', content: MAP }, { path: 'lib/store.js', content: 'module.exports = {};\n' }] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    assert.ok(made && made.repo, JSON.stringify(made).slice(0, 200));
    const u = made.repo.uuid;
    let asked = 0, mode = 'good';
    api._setAgentAsk(async (prompt, o) => {
      if (o.channel !== 'idearium-phase-map') return { ok: false, error: 'not this test' };
      asked++;
      return mode === 'good' ? { ok: true, by: 'scripted', text: ans({ id: 'N1_vague', files: [{ path: 'lib/search.js', new: true }], depends_on: ['N0_store'] }) }
        : { ok: true, by: 'scripted', text: 'no idea' };
    });
    try {
      const b = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/n-phasemap.spec', phase: 'N1_vague' }));
      assert.notStrictEqual(b.json.detail && b.json.detail.code, 'NO_GRAPH', `past DG2: ${JSON.stringify(b.json).slice(0, 300)}`);
      assert.strictEqual(asked, 1);
      const kept = JSON.parse(fs.readFileSync(path.join(process.env.IDEARIUM_DATA_DIR || path.join(ROOT, 'idearium/data'), 'phase-mapping', `${u}.agent-maps.json`), 'utf8'));
      assert.deepStrictEqual(kept['docs/n-phasemap.spec::N1_vague'].files.map(f => f.path), ['lib/search.js']);
      const b2 = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/n-phasemap.spec', phase: 'N1_vague' }));
      assert.notStrictEqual(b2.json.detail && b2.json.detail.code, 'NO_GRAPH');
      assert.strictEqual(asked, 1, 'built again: the kept mapping, nothing asked');
      // a second repo whose agent cannot map the phase
      mode = 'bad';
      const made2 = await quiet(async () => L.ingest({ name: `am2-${Date.now()}`, source: 'test', compartmentId: 'c-am2', files: [{ path: 'docs/n-phasemap.spec', content: `${MAP}# a second project\n` }, { path: 'lib/store.js', content: 'module.exports = { second: true };\n' }] }));
      assert.notStrictEqual(made2.repo.uuid, u, 'a second repo');
      const r = await quiet(() => api._route('POST', `/api/repos/${made2.repo.uuid}/phases/build`, { map: 'docs/n-phasemap.spec', phase: 'N1_vague' }));
      assert.strictEqual(r.status, 409, JSON.stringify(r.json).slice(0, 400)); assert.strictEqual(r.json.detail.code, 'NO_GRAPH');
      assert.ok(/the agent could not map it: agent:scripted named no file that passed the checks/.test(r.json.error), r.json.error);
    } finally { api._setAgentAsk(null); }
  });

  await test('AM-04', 'the run says it: the plan history carries mappedBy (and rebuild), the Plan panel shows them', async () => {
    const BP = await import(path.join(ROOT, 'idearium/repo/build-plan.js'));
    const h = BP.historyOf([{ runId: 'r1', ts: 1, state: 'building', rebuild: true, mappedBy: { by: 'agent:x', files: ['lib/a.js'], dependsOn: ['m::P0_x'], asked: true } }, { runId: 'r1', ts: 2, state: 'proven' }]);
    assert.strictEqual(h.runs[0].rebuild, true); assert.strictEqual(h.runs[0].mappedBy.by, 'agent:x');
    const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    assert.ok(/r\.mappedBy \?[\s\S]{0,400}mapped by/.test(pp) && /r\.rebuild \?[\s\S]{0,300}built again on request/.test(pp));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
