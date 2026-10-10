'use strict';
// tests/sim/loop.js — Idearium's main loop end to end through the real stack (0.58.0): idea → workshop → save (a repo) → plan →
// phases → build a phase (tests/sim/fake-tab.js MODE=smart writes the code) → the proposal → apply → versioned. Each step timed.
// Start versionium, guardian, copilot and Idearium from the tree and a smart fake tab, then: node tests/sim/loop.js
const http = require('http');
const BASE = { host: '127.0.0.1', port: 4800 };
const call = (method, path, body, timeoutMs = 60000) => new Promise((resolve) => {
  const data = body == null ? null : JSON.stringify(body);
  const t0 = Date.now();
  const r = http.request({ ...BASE, path, method, timeout: timeoutMs, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (rs) => {
    let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: rs.statusCode, json: j, raw: d.slice(0, 400), ms: Date.now() - t0 }); });
  });
  r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: `timed out after ${timeoutMs} ms`, ms: Date.now() - t0 }); });
  r.on('error', (e) => resolve({ status: 0, error: e.message, ms: Date.now() - t0 }));
  if (data) r.write(data); r.end();
});
const step = (n, r, note = '') => { const okk = r.status >= 200 && r.status < 300 && !(r.json && r.json.ok === false); console.log(`${okk ? 'OK  ' : 'FAIL'} ${n} — ${r.status} in ${r.ms} ms${note ? ` · ${note}` : ''}${okk ? '' : ` · ${(r.json && (r.json.error || JSON.stringify(r.json).slice(0, 300))) || r.error || r.raw}`}`); return okk; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const provider = process.env.PROVIDER || 'chatgpt';
  // 1. an idea → the workshop
  let r = await call('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Loop ${Date.now() % 100000}` });
  if (!step('workshop: a new spec from an idea', r)) return;
  const w = r.json.workshop;
  r = await call('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'Keep a list of tasks with a title and done flag.' }, { add: true, title: 'Data schema', body: 'A task has an id, a title and done (true/false).' }, { add: true, title: 'API', body: 'add(title), list(), done(id).' }] });
  step('workshop: write its parts', r);
  // 2. save → a repo
  r = await call('POST', `/api/workshop/${w.uuid}/save`, {});
  if (!step('save: the spec becomes a repo', r, r.json && r.json.repoUuid)) return;
  const U = r.json.repoUuid;
  r = await call('GET', `/api/repos/${U}`);
  const specPath = (r.json && (r.json.specPath || (r.json.repo && r.json.repo.specPath))) || null;
  const rs = await call('GET', `/api/repos/${U}/spec/plan`);
  step('the repo\'s spec and plan state', rs, JSON.stringify(rs.json || {}).slice(0, 200));
  const sp = specPath || (rs.json && (rs.json.spec || (rs.json.specs && rs.json.specs[0]))) || null;
  // 3. plan with the agent (the fake tab) — watched to its end
  r = await call('POST', `/api/repos/${U}/spec/plan`, { ...(sp ? { path: sp } : {}), provider });
  step('plan: the agent is asked for the phases', r, r.json && `${r.json.state} · map ${r.json.mapPath}`);
  let plan = r.json || {};
  for (let i = 0; i < 90 && plan.state === 'building'; i++) { await sleep(2000); const g = await call('GET', `/api/repos/${U}/spec/plan${sp ? `?path=${encodeURIComponent(sp)}` : ''}`); plan = (g.json && (g.json.run || g.json)) || plan; }
  console.log(`     plan ended: ${plan.state} · by ${plan.plannedBy || '?'}${plan.note ? ` · ${plan.note}` : ''}`);
  // 4. the phases
  r = await call('GET', `/api/repos/${U}/phases`);
  if (!step('phases: listed', r, r.json && `${(r.json.phases || []).length} phase(s)`)) return;
  const ph = (r.json.phases || []).find(p => p.ready) || (r.json.phases || [])[0];
  if (!ph) { console.log('FAIL no phase to build'); return; }
  // 5. build the first ready phase
  r = await call('POST', `/api/repos/${U}/phases/build`, { map: ph.map, phase: ph.phase_key, provider });
  if (!step(`build: ${ph.phase_key}`, r, r.json && `${r.json.runId} · ${r.json.state}`)) return;
  const runId = r.json.runId;
  let run = null;
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const g = await call('GET', `/api/repos/${U}/phases/runs`);
    run = ((g.json && g.json.runs) || []).find(x => x.runId === runId) || run;
    if (run && !['building', 'queued', 'retrying', 'running'].includes(run.state)) break;
  }
  console.log(`     build ended: ${run ? `${run.state}${run.error ? ` · ${run.error}` : ''}${run.provider ? ` · ${run.provider}` : ''}` : 'no run row'}`);
  // 6. the proposal(s) → apply → a version
  r = await call('GET', `/api/repos/${U}/injects`);
  const inj = ((r.json && (r.json.injects || r.json.list)) || []);
  step('proposals: the code the agent wrote', r, `${inj.length} · ${inj.map(i => `${i.path}:${i.status}`).join(', ')}`);
  const pending = inj.find(i => i.status === 'proposed' || i.status === 'pending');
  if (pending) {
    r = await call('POST', `/api/repos/${U}/injects/${encodeURIComponent(pending.uuid || pending.id)}/apply`, { approvedBy: 'loop' });
    step(`apply: ${pending.path}`, r);
  }
  await sleep(2500);
  r = await call('GET', `/api/repos/${U}/snapshots`);
  step('versions: the change is a commit', r, `${((r.json && r.json.snapshots) || []).length} version(s) · newest: ${(((r.json && r.json.snapshots) || [])[0] || {}).message || '—'}`);
  r = await call('GET', `/api/repos/${U}/phases`);
  const after = ((r.json && r.json.phases) || []).find(p => p.phase_key === ph.phase_key);
  console.log(`     ${ph.phase_key} now: ${after ? `${after.status}${after.lastRun ? ` · last run ${after.lastRun.state}` : ''}` : '?'}`);
  console.log(`\nrepo ${U}`);
})();
