'use strict';
/**
 * tests/modules/test-cg-job-intake.test.js — v0.39.227
 * Guardian writes the .job and CLAIMS it for Clear Glass on disk; Clear Glass's
 * intake takes in only claimed jobs (read back through guardian's /jobs?id=),
 * records each in its own <jobId>.intake, and survives a restart.
 * Real guardian job store, real ladder, real mesh-client, real HTTP on both
 * sides; only the DOM transport (the Electron tab) is a fake.
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.stack}`); failed++; } }
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

const { createJobIntake, guardianJobFetcher } = require(path.join(ROOT, 'clear-glass/src/jobs/intake.js'));

function fakeDom({ finish = { ok: true, sent: true, text: 'answer' } } = {}) {
  const jobs = new Map(); const sends = [];
  return {
    sends,
    sendViaDom: async (a) => { sends.push(a); jobs.set(a.jobId, { known: true, jobId: a.jobId, status: 'done', result: finish }); return { accepted: true, jobId: a.jobId, status: 'queued' }; },
    getDomJob: (id) => jobs.get(id) || { known: false },
    forget: () => jobs.clear(),
  };
}
const listen = (handler) => new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const body = (req) => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b ? JSON.parse(b) : {})); });

(async () => {
  console.log('\n  intake (unit)');
  const claimed = { id: 'j1', provider: 'claude', status: 'dispatched', transport: 'mesh', claimedBy: 'clear-glass' };
  const mk = (job, dom = fakeDom(), dir = tmp('intake-')) => ({ dom, dir, intake: createJobIntake({ dir, fetchGuardianJob: async (id) => (job && job.id === id ? job : null), sendViaDom: dom.sendViaDom, getDomJob: dom.getDomJob }) });

  await test('IN-01', 'a job guardian did not claim for Clear Glass is refused and nothing is queued', async () => {
    const { dom, intake } = mk({ ...claimed, transport: 'ncp', claimedBy: null });
    const r = await intake.intake({ jobId: 'j1', provider: 'claude', prompt: 'p' });
    assert.strictEqual(r.accepted, false); assert.strictEqual(r.sent, false); assert.strictEqual(r.stage, 'intake_refused'); assert.ok(/not claimed/.test(r.error));
    assert.strictEqual(dom.sends.length, 0);
  });
  await test('IN-02', 'unknown to guardian / already finished / provider mismatch / no jobId — all refused, never sent', async () => {
    for (const [job, payload, re] of [[null, { jobId: 'j1' }, /no job/], [{ ...claimed, status: 'delivered' }, { jobId: 'j1' }, /already delivered/],
      [claimed, { jobId: 'j1', provider: 'chatgpt' }, /provider mismatch/], [claimed, {}, /jobId required/]]) {
      const { dom, intake } = mk(job);
      const r = await intake.intake(payload);
      assert.strictEqual(r.accepted, false, JSON.stringify(r)); assert.ok(re.test(r.error), r.error); assert.strictEqual(dom.sends.length, 0);
    }
  });
  await test('IN-03', 'guardian unreachable => refused with the reason (fails closed)', async () => {
    const dom = fakeDom();
    const intake = createJobIntake({ dir: tmp('intake-'), fetchGuardianJob: guardianJobFetcher({ port: 1 }), sendViaDom: dom.sendViaDom, getDomJob: dom.getDomJob });
    const r = await intake.intake({ jobId: 'x' });
    assert.strictEqual(r.accepted, false); assert.ok(/guardian unreachable/.test(r.error)); assert.strictEqual(dom.sends.length, 0);
  });
  await test('IN-04', 'a claimed job: the .intake record is written BEFORE the send, then queued; the sent prompt is guardian\u2019s payload (wake hint kept)', async () => {
    const dom = fakeDom(); const dir = tmp('intake-'); let recAtSend = null;
    const intake = createJobIntake({ dir, fetchGuardianJob: async () => claimed, getDomJob: dom.getDomJob,
      sendViaDom: async (a) => { recAtSend = fs.existsSync(path.join(dir, 'j1.intake')); return dom.sendViaDom(a); } });
    const r = await intake.intake({ jobId: 'j1', provider: 'claude', prompt: '[hint] p' });
    assert.ok(r.accepted); assert.strictEqual(recAtSend, true);
    assert.strictEqual(dom.sends[0].prompt, '[hint] p');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'j1.intake'), 'utf8')).status, 'queued');
  });
  await test('IN-05', 'idempotent: asking again never re-sends', async () => {
    const { dom, intake } = mk(claimed);
    await intake.intake({ jobId: 'j1', provider: 'claude' });
    const r2 = await intake.intake({ jobId: 'j1', provider: 'claude' });
    assert.ok(r2.existing); assert.strictEqual(dom.sends.length, 1);
  });
  await test('IN-06', 'Clear Glass restart: an unfinished job reports clear_glass_restarted, sent:null (never resend) — in the shape waitForJob returns on', async () => {
    const dir = tmp('intake-');
    const slowDom = { sends: [], sendViaDom: async (a) => ({ accepted: true, jobId: a.jobId }), getDomJob: () => ({ known: false }) };
    const a = createJobIntake({ dir, fetchGuardianJob: async () => claimed, sendViaDom: slowDom.sendViaDom, getDomJob: slowDom.getDomJob });
    await a.intake({ jobId: 'j1', provider: 'claude' });
    const b = createJobIntake({ dir, fetchGuardianJob: async () => claimed, sendViaDom: slowDom.sendViaDom, getDomJob: () => ({ known: false }) });
    assert.strictEqual(b.recover().interrupted, 1);
    const s = b.status('j1');
    assert.strictEqual(s.status, 'done'); assert.strictEqual(s.result.sent, null); assert.strictEqual(s.result.stage, 'clear_glass_restarted');
    assert.strictEqual(b.recover().interrupted, 0, 'recover is idempotent');
  });
  await test('IN-07', 'the record follows the live job to done', async () => {
    const { intake, dir } = mk(claimed);
    await intake.intake({ jobId: 'j1', provider: 'claude' });
    assert.ok(intake.status('j1').result.ok);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'j1.intake'), 'utf8')).status, 'done');
  });

  console.log('\n  guardian ladder claim');
  const { createLadder } = require(path.join(ROOT, 'guardian/lib/dispatch-ladder.js'));
  const { createAgentRegistry } = require(path.join(ROOT, 'guardian/lib/agent-registry.js'));
  await test('CL-01', 'claim is recorded before the mesh is called; a failing claim means no send and an NCP fallback with the reason', async () => {
    const order = [];
    const registry = createAgentRegistry({ dir: tmp('reg-') });
    const mesh = { send: async () => { order.push('send'); return { ok: true, text: 't' }; }, diagnose: async () => ({ ok: false }) };
    const l1 = createLadder({ registry, mesh, picker: { request: async () => {} }, mode: () => 'mesh-first', claim: () => order.push('claim') });
    assert.strictEqual((await l1.attempt({ id: 'a', provider: 'claude', prompt: 'p' })).kind, 'complete');
    assert.deepStrictEqual(order, ['claim', 'send']);
    order.length = 0;
    const l2 = createLadder({ registry, mesh, picker: { request: async () => {} }, mode: () => 'mesh-first', claim: () => { throw new Error('disk full'); } });
    const r = await l2.attempt({ id: 'b', provider: 'claude', prompt: 'p' });
    assert.strictEqual(r.kind, 'ncp'); assert.strictEqual(r.reason, 'mesh_claim_failed'); assert.deepStrictEqual(order, []);
  });
  await test('CL-02', 'server wires claim as a REQUIRED .job write; dispatcher releases the claim on NCP fallback', () => {
    const srv = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    assert.ok(/claim: \(job, \{ agentId, accountId \}\) => \{\s*const j = updateJob\(job\.id, \{ transport: 'mesh', claimedBy: 'clear-glass'[^}]*\}, \{ required: true \}\)/.test(srv));
    assert.ok(/transport: 'ncp', claimedBy: null, transportFallbackReason/.test(fs.readFileSync(path.join(ROOT, 'guardian/lib/dispatcher.js'), 'utf8')));
  });

  console.log('\n  end to end over real HTTP');
  process.env.GUARDIAN_JOBS_DIR = tmp('gjobs-');
  delete require.cache[require.resolve(path.join(ROOT, 'guardian/lib/jobs.js'))];
  const store = require(path.join(ROOT, 'guardian/lib/jobs.js')).createJobStore();
  // guardian's own /jobs?id= (same shape as server.js)
  const gsrv = await listen((req, res) => {
    const u = new URL(req.url, 'http://x'); const id = u.searchParams.get('id'); const job = store.jobs.get(id);
    res.writeHead(job ? 200 : 404); res.end(JSON.stringify(job ? { ok: true, job } : { ok: false }));
  });
  const dom = fakeDom({ finish: { ok: true, sent: true, text: 'the answer' } });
  const cgDir = tmp('cg-intake-');
  const intake = createJobIntake({ dir: cgDir, fetchGuardianJob: guardianJobFetcher({ port: gsrv.address().port }), sendViaDom: dom.sendViaDom, getDomJob: dom.getDomJob });
  // Clear Glass's two routes, as main/index.js serves them
  const cgsrv = await listen(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/agent-mesh/send') { const r = await intake.intake(await body(req)); res.writeHead(r.accepted === false ? 200 : 202); return res.end(JSON.stringify({ ok: r.accepted !== false, ...r })); }
    if (u.pathname === '/agent-mesh/job') { res.writeHead(200); return res.end(JSON.stringify({ ok: true, ...intake.status(u.searchParams.get('jobId')) })); }
    res.writeHead(404); res.end('{}');
  });
  const { createMeshClient } = require(path.join(ROOT, 'guardian/lib/mesh-client.js'));
  const meshClient = createMeshClient({ port: cgsrv.address().port, pollMs: 10, sleep: (ms) => new Promise(r => setTimeout(r, ms)) });
  const claimFn = (job, { agentId, accountId }) => {
    const j = store.updateJob(job.id, { transport: 'mesh', claimedBy: 'clear-glass', claimedAt: Date.now(), status: 'dispatched', agentId, accountId }, { required: true });
    if (!j) throw new Error('not found');
  };
  const registry = createAgentRegistry({ dir: tmp('reg-') });
  const ladder = createLadder({ registry, mesh: meshClient, picker: { request: async () => {} }, mode: () => 'mesh-first', claim: claimFn });

  await test('E2E-01', '.job on disk -> claimed on disk -> Clear Glass takes it in via guardian\u2019s API -> answer comes back', async () => {
    const job = store.createJob({ provider: 'claude', prompt: 'hello', source: 'test' });
    const onDisk = () => fs.readFileSync(path.join(process.env.GUARDIAN_JOBS_DIR, `${job.id}.job`), 'utf8');
    assert.ok(!/claimedBy: clear-glass/.test(onDisk()), 'unclaimed at creation');
    const r = await ladder.attempt(store.jobs.get(job.id));
    assert.strictEqual(r.kind, 'complete', JSON.stringify(r)); assert.strictEqual(r.text, 'the answer');
    assert.ok(/claimedBy: clear-glass/.test(onDisk()), 'the claim is physically on the .job');
    assert.ok(fs.existsSync(path.join(cgDir, `${job.id}.intake`)), 'Clear Glass recorded its intake');
    assert.strictEqual(dom.sends.length, 1);
  });
  await test('E2E-02', 'a job posted straight to Clear Glass without guardian\u2019s claim is refused (no second delivery route)', async () => {
    const job = store.createJob({ provider: 'claude', prompt: 'sneak', source: 'test' });
    const r = await meshClient.send({ jobId: job.id, provider: 'claude', prompt: 'sneak', timeoutMs: 1000 });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.sent, false); assert.strictEqual(r.stage, 'intake_refused');
    assert.strictEqual(dom.sends.length, 1, 'still only the claimed job was ever sent');
  });
  gsrv.close(); cgsrv.close();

  await test('WR-01', 'Clear Glass main process routes /agent-mesh/send and /agent-mesh/job through the intake', () => {
    const src = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
    assert.ok(/await jobIntake\.intake\(parsed\)/.test(src)); assert.ok(/jobIntake\.status\(id\)/.test(src));
    assert.ok(/jobIntake\.recover\(\)/.test(src)); assert.ok(!/await mesh\.sendViaDom\(parsed\)/.test(src), 'no bypass left');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
