'use strict';
/**
 * tests/modules/test-repo-expand.test.js — 0.39.360 SB42 · SB43 · SB44 · SB45 (docs/2026-10-05-build-from-the-spec-phasemap.spec)
 *
 * James: "were building capacity to build the daw, not the daw" · "expanding using the specs, then phased, then chunked,
 * then coded. look at the nexus repo. skeletons need to be greyed out until they're coded."
 *   EX-01 SB42 expansion slots new components into a skeleton: registry, living spec and nodes; a component already in
 *              the system is refused with the reason; a repo that is not a skeleton gets nothing
 *   EX-02 SB43 the phasemap it writes is read by the phases manager's own parser: one phase per component, in build
 *              order (after the components it uses), its files, keys that never reuse the repo's
 *   EX-03 SB44 through the API on a real skeleton repo: a snapshot first; the registry, nodes and phasemap written; each
 *              code file a pending chunk; the Phases tab lists the phases; writing a file codes its chunk
 *   EX-04 SB45 the Files tab state: a planned file is 'uncoded' (greyed) until it is written; a skeleton with an empty
 *              slot is never complete and under 100%, and slotting something in reopens it
 *   EX-05       refusals write nothing: not a skeleton (409), nothing new (422), no snapshot (502)
 *   EX-06       wired: the Phases tab's + expand; the Files and Code tabs grey an uncoded file (U)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const listen = (fn, port = 0) => new Promise((res, rej) => {
  const s = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', () => { r.setHeader('content-type', 'application/json'); const o = fn(q, b ? JSON.parse(b) : {}); r.statusCode = o.status || 200; r.end(JSON.stringify(o.body || {})); }); });
  s.on('error', rej);
  s.listen(port, '127.0.0.1', () => res(s));
});
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

const FTP = require(path.join(ROOT, 'lib/file-tree-plan.js'));
const RX = require(path.join(ROOT, 'lib/repo-expand.js'));

async function skeletonFiles(name, slot) {
  const r = await FTP.plan({ name, templateIds: [FTP.SKELETON_ID], slot });
  return new Map(r.files.map(f => [f.path, f.content]));
}
const comps = (arr) => FTP.parseSlot(JSON.stringify(arr)).components;

async function main() {
  console.log('\ntest-repo-expand\n');

  await test('EX-01', 'expansion slots new components into a skeleton (registry, spec, nodes); an existing one is refused; a non-skeleton gets nothing', async () => {
    const files = await skeletonFiles('Probe Sys', comps([{ component: 'tracks', path: 'lib/tracks.js', capability: 'keep tracks', commands: ['add'] }]));
    const e = RX.expansion({ read: p => files.get(p), feature: 'audio mixing', ask: 'add mixing and effects', components: comps([
      { component: 'mixer', path: 'lib/mixer.js', purpose: 'mixes', capability: 'mix tracks', commands: ['mix', 'solo'], uses: ['tracks', 'fx'] },
      { component: 'fx', path: 'lib/fx.js', purpose: 'effects', capability: 'apply effects', commands: ['apply'] },
      { component: 'tracks', path: 'lib/tracks.js', commands: ['again'] },
    ]) });
    assert.ok(e.ok, JSON.stringify(e));
    assert.deepStrictEqual(e.ids, ['probe-sys.mixer', 'probe-sys.fx']);
    assert.deepStrictEqual(e.rejected.map(r => r.component), ['tracks']);
    const w = new Map(e.writes.map(x => [x.path, x.content]));
    assert.ok(/probe-sys\.tracks/.test(w.get('registry-components.js')) && /probe-sys\.mixer/.test(w.get('registry-components.js')), 'the old entry kept, the new added');
    assert.match(w.get('spec/probe-sys.spec'), /components: \[probe-sys\.tracks, probe-sys\.mixer, probe-sys\.fx\]/);
    for (const p of ['data/nodes/component/probe-sys.mixer.component', 'data/nodes/command/probe-sys.mixer.solo.command', 'data/nodes/route/probe-sys.fx.apply.route']) assert.ok(w.has(p), p);
    assert.ok(![...w.keys()].some(p => /^data\/nodes\/[a-z]+\/probe-sys\.tracks\./.test(p)), 'nothing rewritten for the existing component');
    assert.deepStrictEqual(e.code.map(c => `${c.path}:${c.layer}`).sort(), ['lib/fx.js:engine', 'lib/mixer.js:engine', 'tests/fx.test.js:test', 'tests/mixer.test.js:test']);
    const plain = new Map([['registry-components.js', 'module.exports = { components: [] };']]);
    assert.strictEqual(RX.expansion({ read: p => plain.get(p), components: e.ids.map(() => ({})) }).ok, false);
  });

  await test('EX-02', 'the phasemap is read by the phases manager: a phase per component, in build order, keys never reused', async () => {
    const files = await skeletonFiles('Probe Sys', []);
    const e = RX.expansion({ read: p => files.get(p), feature: 'audio mixing', takenKeys: ['AM1'], components: comps([
      { component: 'mixer', path: 'lib/mixer.js', commands: ['mix'], uses: ['fx'] }, { component: 'fx', path: 'lib/fx.js', commands: ['apply'] },
    ]), date: '2026-10-06' });
    assert.strictEqual(e.phasemap.path, 'docs/2026-10-06-audio-mixing-phasemap.spec');
    const { buildRoadmap, isPhasemapPath } = await import(path.join(ROOT, 'idearium/repo/roadmap.js'));
    assert.ok(isPhasemapPath(e.phasemap.path), 'its name is a phasemap the repo collects');
    const rm = buildRoadmap({ projectId: 'p', maps: [{ path: e.phasemap.path, text: e.phasemap.text }] });
    assert.deepStrictEqual(rm.warnings, []);
    const keys = rm.phases.map(p => p.phase_key).sort();
    assert.deepStrictEqual(keys, ['AM2_fx', 'AM3_mixer'], 'AM1 is taken; fx (used) is numbered first');
    assert.deepStrictEqual(rm.layers.map(l => l.map(id => id.split(':').pop())), [['AM2_fx'], ['AM3_mixer']], 'mixer builds after fx');
    assert.deepStrictEqual(rm.phases.find(p => p.phase_key === 'AM3_mixer').files, ['lib/mixer.js', 'tests/mixer.test.js']);
    assert.match(e.phasemap.text, /exports mix\(args, ctx\)/);
  });

  // ── through the API ──
  const { treeHashOf } = await import(path.join(ROOT, 'idearium/repo/snapshot-files.js'));
  const commits = [];
  const vers = await listen((q, body) => {
    if (q.url.startsWith('/api/versionium/commit')) { const id = `vtm-${commits.length + 1}`; commits.push(body); return { body: { commit: { commitId: id, branch: body.branch || 'x', wall: Date.now() } } }; }
    if (q.url.startsWith('/api/versionium/files/limits')) return { body: { maxRequestBytes: 50e6, maxFileBytes: 20e6, maxFiles: 100000 } };
    if (q.url.startsWith('/api/versionium/files/plan')) return { body: { ok: true, need: [], have: (body.tree || []).map(t => t.path) } };
    if (q.url.startsWith('/api/versionium/files/record')) return { body: { ok: true, recorded: true, treeHash: treeHashOf(body.tree || []) } };
    if (q.url.startsWith('/api/versionium/history')) return { body: { commits: [] } };
    return { status: 404, body: { error: 'stub' } };
  }, require(path.join(ROOT, 'lib/nexus-client.js')).resolve('versionium').port);   // Versionium is always reached at its configured port
  const api = await import(path.join(ROOT, 'idearium/api/index.js'));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const se = await import(path.join(ROOT, 'idearium/spec-engine/index.js'));

  let made = null;
  for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `expand-probe-${Date.now()}`, type: 'system', description: 'a probe system' }); if (made.status !== 503) break; await new Promise(x => setTimeout(x, 250)); }
  const body = made.json.data || made.json;
  const repoUuid = body.repoUuid, specUuid = (body.manifest || {}).uuid;

  await test('EX-04a', 'a skeleton with an empty slot is never complete, and under 100%', async () => {
    assert.ok(made.status < 300 && repoUuid && specUuid, JSON.stringify(made.json).slice(0, 300));
    const m = se.loadSpec(specUuid);
    assert.strictEqual(m.slotOpen, true, 'nothing of the idea is in it');
    assert.strictEqual(m.doneChunks, m.totalChunks, 'every skeleton file is written');
    assert.notStrictEqual(m.status, 'complete'); assert.ok(m.progress < 100, String(m.progress));
  });

  // a repo is snapshotted once it has been through the import pipeline (as the phase build requires) — chunk it
  const ch = await R('POST', `/api/repos/${repoUuid}/chunk`, {});
  if (ch.status >= 300) console.log(`  (chunking the repo answered ${ch.status}: ${JSON.stringify(ch.json).slice(0, 200)})`);
  let ex = null;
  await test('EX-03', 'through the API: snapshot first; registry, nodes, phasemap written; code files pending chunks; the Phases tab lists the phases', async () => {
    const before = commits.length;
    ex = await R('POST', `/api/repos/${repoUuid}/expand`, { feature: 'note taking', components: [
      { component: 'notes', path: 'lib/notes.js', purpose: 'keeps notes', capability: 'keep notes', commands: ['add', 'list'] },
      { component: 'search', path: 'lib/search.js', purpose: 'finds notes', capability: 'find notes', commands: ['find'], uses: ['notes'] },
    ] });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.json).slice(0, 500));
    const d = ex.json.data || ex.json;
    assert.ok(commits.length > before && d.snapshot, 'a snapshot was taken first');
    assert.deepStrictEqual(d.failed, []);
    const L = api.getRepoLayer();
    const sys = d.system;
    assert.match(L.readFile(repoUuid, 'registry-components.js').content, new RegExp(`${sys}\\.search`));
    assert.ok(!L.readFile(repoUuid, `data/nodes/command/${sys}.notes.list.command`).error, 'nodes written');
    assert.ok(!L.readFile(repoUuid, d.phasemap.path).error, 'the phasemap is in the repo');
    const m = se.loadSpec(specUuid);
    const pend = m.chunks.filter(c => c.status === 'pending').map(c => c.realPath).sort();
    assert.deepStrictEqual(pend, ['lib/notes.js', 'lib/search.js', 'tests/notes.test.js', 'tests/search.test.js']);
    assert.strictEqual(m.slotOpen, false); assert.notStrictEqual(m.status, 'complete'); assert.ok(m.progress < 100);
    const PH = await import(path.join(ROOT, 'idearium/repo/phases.js'));
    const view = PH.managerView({ repo: L.get(repoUuid), repoDir: L.get(repoUuid).materializeDir || L.materialize(repoUuid).dir, runs: [] });
    const mine = view.phases.filter(p => p.map === d.phasemap.path).map(p => p.phase_key);
    assert.deepStrictEqual(mine.sort(), d.phasemap.phases.map(p => p.id).sort(), JSON.stringify(view.phases.map(p => p.map)).slice(0, 300));
  });

  await test('EX-04b', 'the Files tab: a planned file is uncoded (greyed) until written; writing it codes its chunk', async () => {
    const st = await R('GET', `/api/repos/${repoUuid}/files/state`);
    const s = (st.json.data || st.json).states; if (!s) throw new Error(JSON.stringify(st.json).slice(0, 400));
    assert.strictEqual(s['lib/notes.js'] && s['lib/notes.js'].state, 'uncoded', JSON.stringify(s['lib/notes.js']));
    assert.notStrictEqual(s['registry-components.js'] && s['registry-components.js'].state, 'uncoded');
    const L = api.getRepoLayer();
    assert.ok(L.writeFile(repoUuid, 'lib/notes.js', 'module.exports = { add: (a) => a, list: () => [] };\n').ok);
    const c = se.loadSpec(specUuid).chunks.find(x => x.realPath === 'lib/notes.js');
    assert.strictEqual(c.status, 'complete', 'written = coded');
    const st2 = await R('GET', `/api/repos/${repoUuid}/files/state`);
    const s2 = (st2.json.data || st2.json).states;
    assert.ok(s2, JSON.stringify(st2.json).slice(0, 400));
    assert.ok(s2['lib/notes.js'] && s2['lib/notes.js'].state !== 'uncoded', JSON.stringify(s2['lib/notes.js']));
  });

  await test('EX-05', 'refusals write nothing: nothing new (422), not a skeleton (409), no snapshot (502)', async () => {
    const again = await R('POST', `/api/repos/${repoUuid}/expand`, { feature: 'again', components: [{ component: 'notes', path: 'lib/notes.js', commands: ['add'] }] });
    assert.strictEqual(again.status, 422, JSON.stringify(again.json).slice(0, 200));
    const plain = await quiet(() => api.getRepoLayer().ingest({ name: `plain-${Date.now()}`, files: [{ path: 'a.js', content: 'module.exports = 1;\n' }], source: 'test' }));
    const r2 = await R('POST', `/api/repos/${plain.repo.uuid}/expand`, { feature: 'x', components: [{ component: 'a', path: 'lib/a.js', commands: ['go'] }] });
    assert.strictEqual(r2.status, 409); assert.strictEqual((r2.json.code || (r2.json.detail || {}).code || (r2.json.extra || {}).code || JSON.stringify(r2.json).match(/NOT_SKELETON/) && 'NOT_SKELETON'), 'NOT_SKELETON');
    const before = api.getRepoLayer().readFile(repoUuid, 'registry-components.js').content;
    await new Promise(x => vers.close(x));   // Versionium gone: no snapshot
    const r3 = await R('POST', `/api/repos/${repoUuid}/expand`, { feature: 'tags', components: [{ component: 'tags', path: 'lib/tags.js', commands: ['tag'] }] });
    assert.ok(r3.status === 502 || r3.status === 409, String(r3.status));
    assert.strictEqual(api.getRepoLayer().readFile(repoUuid, 'registry-components.js').content, before, 'nothing written without a snapshot');
  });

  await test('EX-06', 'wired: the Phases tab expands; the Files and Code tabs grey an uncoded file (U)', async () => {
    const fs = require('fs');
    const ph = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    const fm = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/file-manage.js'), 'utf8');
    assert.match(ph, /api\(`\/api\/repos\/\$\{uuid\}\/expand`/); assert.match(ph, /onclick="phasesExpandOpen\(\)"/);
    assert.match(fm, /uncoded: 'U'/); assert.match(fm, /s\.state === 'uncoded'/);
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8'), /\.tree-node\.file\.fs-row-uncoded\{opacity:\.45/);
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/css/code-surface.css'), 'utf8'), /\.cs-file\.fs-row-uncoded\{opacity:\.45/);
  });

  if (vers.listening) vers.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
