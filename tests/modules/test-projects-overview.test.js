'use strict';
/**
 * tests/modules/test-projects-overview.test.js — COSA10 (docs/2026-10-15-cos-app-phasemap.spec, addendum 2026-10-16)
 * James, 2026-10-16: "i figure cos could be helpfui for managing my projects so im not so overwhelmed."
 * The overview on fixtures (sorting, what counts as a project, what needs him, a reader failing out loud), then one request
 * through the real Idearium router with a real repo, a real note and a real phasemap.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-ov-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-ov-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.on('exit', () => { for (const d of [_data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const PJ = require(path.join(ROOT, 'idearium/lib/projects.cjs'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

(async () => {
  const repos = [
    { uuid: 'a', name: 'old-site', updatedAt: 1 },
    { uuid: 'b', name: 'gig-writer', updatedAt: 2 },
    { uuid: 'c', name: 'raid-contract-123', source: 'raid-contract' },
    { uuid: 'n0', name: 'nexus', nexusSelf: { role: 'parent' } },
    { uuid: 'n1', name: 'nexus/core', nexusSelf: { role: 'system', system: 'core' } },
    { uuid: 'n2', name: 'nexus/guardian', nexusSelf: { role: 'system', system: 'guardian' } },
  ];
  const acts = { a: { ts: 300, title: 'phase built', kind: 'phase.run' }, n1: { ts: 500, title: 'gate passed', kind: 'gate' } };
  const notes = { b: { open: 3, todo: 2, question: 1 } };
  const phases = { a: { summary: { total: 3, complete: 1, active: 1, ready: 1 }, phases: [
    { map: 'm', phase_key: 'P1', title: 'P1 · done', status: 'complete' },
    { map: 'm', phase_key: 'P2', title: 'P2 · ready', status: 'planned', ready: true },
    { map: 'm', phase_key: 'P3', title: 'P3 · going', status: 'active', ready: true }] } };

  await test('PJ-01', 'his projects only, newest activity first; Nexus is one project (its core repo), RAID contract repos are not projects', async () => {
    const v = await PJ.overview({ repos, activityOf: u => acts[u] || null, notesOf: u => notes[u] || null, phasesOf: r => phases[r.uuid] || null });
    assert.deepStrictEqual(v.projects.map(p => p.name), ['nexus/core', 'old-site', 'gig-writer']);
    assert.strictEqual(v.counts.projects, 3);
  });

  await test('PJ-02', 'what needs him is said: questions and todos waiting, the phase in progress before a ready one', async () => {
    const v = await PJ.overview({ repos, activityOf: u => acts[u] || null, notesOf: u => notes[u] || null, phasesOf: r => phases[r.uuid] || null });
    const gig = v.projects.find(p => p.name === 'gig-writer');
    assert.deepStrictEqual(gig.attention, ['1 question waiting on you', '2 todos open']);
    const site = v.projects.find(p => p.name === 'old-site');
    assert.deepStrictEqual(site.phases.next, { map: 'm', key: 'P3', title: 'P3 · going', status: 'active' });
    assert.strictEqual(site.attention[0], 'in progress: P3 · going');
    assert.strictEqual(v.counts.questions, 1); assert.strictEqual(v.counts.todos, 2); assert.strictEqual(v.counts.inProgress, 1);
  });

  await test('PJ-03', 'a reader that fails is said on the row, and the row stays', async () => {
    const v = await PJ.overview({ repos: [{ uuid: 'x', name: 'broken' }], phasesOf: () => { throw new Error('no maps dir'); }, notesOf: () => { throw new Error('db down'); } });
    assert.strictEqual(v.projects.length, 1);
    assert.deepStrictEqual(v.projects[0].errors, ['notes: db down', 'phases: no maps dir']);
    assert.strictEqual(v.failed.length, 1);
  });

  await test('PJ-04', 'without a core repo, the Nexus parent is the one Nexus project', async () => {
    assert.ok(PJ.isProject({ nexusSelf: { role: 'parent' } }, [{ nexusSelf: { role: 'parent' } }]));
    assert.ok(!PJ.isProject({ nexusSelf: { role: 'system', system: 'guardian' } }, []));
  });

  await test('PJ-05', 'GET /api/my-projects through the real router: a real repo with a question note', async () => {
    await import('../../idearium/spec-engine/index.js');   // the repo layer stores content through it
    const api = await import('../../idearium/api/index.js');
    // the spec engine loads asynchronously on first use (idearium/api getSpecEngine); wait for it as the server's boot does
    let made = null;
    for (let i = 0; i < 40; i++) { made = await api._route('POST', '/api/repos', { name: 'pj-fixture', bare: true, source: 'create' }); if (made.json && made.json.repo) break; await new Promise(r => setTimeout(r, 100)); }
    const repo = made.json && made.json.repo;
    assert.ok(repo && repo.uuid, `a repo was created: ${JSON.stringify(made.json).slice(0, 200)}`);
    const RN = require(path.join(ROOT, 'lib/repo-notes.js'));
    RN.add({ repoUuid: repo.uuid, body: 'answer the gig buyer', kind: 'question' });
    const r = await api._route('GET', '/api/my-projects');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const row = r.json.projects.find(p => p.uuid === repo.uuid);
    assert.ok(row, 'the repo is listed');
    assert.strictEqual(row.notes.question, 1);
    assert.ok(row.attention.includes('1 question waiting on you'));
  });

  // Found while building this: GET /api/projects already existed (the uploaded-zip shelf, project.list), and the router
  // takes the first match without a word, so the new route was silently shadowed. A collision is a hard error (SISO law 1).
  await test('PJ-06', 'no two Idearium API routes share a method and path (a later one would be silently shadowed)', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const re = /\[\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*\[([^\]]*)\]\s*,\s*'([\w.-]+)'\s*\]/g;
    const seen = new Map(); const dup = []; let m;
    while ((m = re.exec(src))) {
      const k = `${m[1]} /${m[2].replace(/[\s']/g, '').split(',').filter(Boolean).join('/')}`;
      if (seen.has(k)) dup.push(`${k}: ${seen.get(k)} and ${m[3]}`); else seen.set(k, m[3]);
    }
    assert.ok(seen.size > 300, `read the route table (${seen.size})`);
    assert.deepStrictEqual(dup, []);
    assert.strictEqual(seen.get('GET /api/my-projects'), 'projects.overview');
  });

  // §RT1 0.60.78 — the My projects panel reads what RAID's officiator holds back from cortex; cortex down is said, not an empty list
  await test('PJ-07', 'GET /api/raid/held: cortex not answering is a 502 that says so; the panel and the command rows are wired', async () => {
    const api = await import('../../idearium/api/index.js');
    const r = await api._route('GET', '/api/raid/held');
    assert.ok(r.status === 502 && /cortex did not answer/.test(JSON.stringify(r.json)) || r.status === 200, JSON.stringify(r));
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/projects.js'), 'utf8');
    assert.ok(ui.includes("api('/api/raid/held')") && ui.includes('/api/raid/held/unpark'));
    const rc = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    assert.ok(rc.includes("key: 'raid.parked'") && rc.includes("key: 'raid.unpark'"));
    const boot = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
    assert.ok(boot.includes("p === '/api/raid/officiator'") && boot.includes("p === '/api/raid/officiator/unpark' && method === 'POST'"));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
