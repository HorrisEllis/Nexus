'use strict';
/** guardian's job-protocol mesh client, the ladder's no-resend recovery, and the activity-aware completion watch. */
const assert = require('assert');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { EventEmitter } = require('events');
const { createMeshClient } = require('../../guardian/lib/mesh-client');
const { createAgentRegistry } = require('../../guardian/lib/agent-registry');
const { createLadder } = require('../../guardian/lib/dispatch-ladder');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`   ${id} ${desc}`); passed++; } catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// A fake Clear Glass (:7702) that speaks the job protocol. `behave(job, body)` decides the outcome.
function fakeGlass(behave = () => ({ ok: true, sent: true, text: 'done' }), { utf8 = true } = {}) {
  const jobs = new Map(), log = { sends: [], reads: [], diagnoses: [] };
  const srv = http.createServer((req, res) => {
    if (utf8) req.setEncoding('utf8');
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      const u = new URL(req.url, 'http://x'); const j = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      let b = {}; try { b = body ? JSON.parse(body) : {}; } catch (_) { b = { _corrupt: true }; }
      if (u.pathname === '/agent-mesh/send') {
        log.sends.push({ jobId: b.jobId, promptLen: (b.prompt || '').length, contentLen: (b.content || '').length, hash: sha((b.prompt || '') + (b.content || '')) });
        if (jobs.has(b.jobId)) return j(202, { ok: true, accepted: true, existing: true });
        const pre = behave.pre && behave.pre(b); if (pre) return j(200, { ok: false, accepted: false, ...pre });
        const job = { polls: 0, result: behave(b), reads: 0 }; jobs.set(b.jobId, job); return j(202, { ok: true, accepted: true });
      }
      if (u.pathname === '/agent-mesh/job') {
        const job = jobs.get(u.searchParams.get('jobId')); if (!job) return j(200, { ok: true, known: false });
        job.polls++;
        if (job.polls < 3) return j(200, { known: true, status: 'running', progress: { phase: 'wait', chars: job.polls * 100, generating: true } });
        return j(200, { known: true, status: 'done', result: job.reading ? job.reading : job.result });
      }
      if (u.pathname === '/agent-mesh/diagnose') { log.diagnoses.push(b); return j(200, behave.diagnose ? behave.diagnose(b) : { ok: true, repaired: false }); }
      if (u.pathname === '/agent-mesh/read') { log.reads.push(b); const job = jobs.get(b.jobId); if (!job) return j(200, { ok: false, error: 'unknown job' }); job.polls = 0; job.reading = behave.read ? behave.read(b) : { ok: true, sent: true, text: 'reread' }; return j(200, { ok: true }); }
      j(404, {});
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port, log, jobs, close: () => new Promise(c => srv.close(c)) })));
}
const client = (port, o = {}) => createMeshClient({ port, pollMs: 15, graceMs: 300, ...o });

(async () => {
  await test('MC-001', 'CODE BASE SCALE: a 3 MB prompt+content of multi-byte text reaches the mesh byte-for-byte (UTF-8 safe)', async () => {
    const g = await fakeGlass();
    const prompt = 'Refactor:\n' + '你好世界 héllo 🚀 — ünï\n'.repeat(60000);       // ~1.6 MB of 2-4 byte characters, guaranteed to straddle chunk boundaries
    const content = 'const s = "日本語のコメント";\n'.repeat(60000);
    const r = await client(g.port).send({ jobId: 'big', provider: 'claude', prompt, content, timeoutMs: 5000 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(g.log.sends[0].hash, sha(prompt + content), 'the payload was corrupted in transit');
    assert.ok(prompt.length + content.length > 2 * 1024 * 1024 / 4);
    await g.close();
  });

  await test('MC-001c', 'CONTROL: the old `body += chunk` pattern really does corrupt the same payload (this is the bug being prevented)', async () => {
    const g = await fakeGlass(() => ({ ok: true, sent: true, text: 'x' }), { utf8: false });
    // server above without setEncoding still concatenates Buffers via `body += c`
    const prompt = '你好世界🚀'.repeat(200000);
    await client(g.port).send({ jobId: 'ctl', provider: 'claude', prompt, timeoutMs: 5000 });
    const corrupted = g.log.sends[0].hash !== sha(prompt);
    console.log(`      (control: corruption ${corrupted ? 'REPRODUCED' : 'not reproduced on this platform/chunking'} without setEncoding)`);
    await g.close();
  });

  await test('MC-002', 'progress is streamed to the callback while a long job runs, then the final result is returned', async () => {
    const g = await fakeGlass(() => ({ ok: true, sent: true, text: '```js\nlet a = 1;\n```', chars: 20, continues: 2, via: 'attachment', chatUrl: 'https://claude.ai/c/9' }));
    const seen = []; const r = await client(g.port).send({ jobId: 'p1', provider: 'claude', prompt: 'x', timeoutMs: 5000, onProgress: (p) => seen.push(p) });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.text, '```js\nlet a = 1;\n```'); assert.strictEqual(r.continues, 2);
    assert.ok(seen.length >= 2 && seen.every(p => p.phase === 'wait')); await g.close();
  });

  await test('MC-003', 'nothing listening => sent:false mesh_unreachable (safe to fall back); a 404 endpoint is the same', async () => {
    const r = await client(1).send({ jobId: 'a', provider: 'claude', prompt: 'x', timeoutMs: 1000 });
    assert.deepStrictEqual([r.ok, r.sent, r.stage], [false, false, 'mesh_unreachable']);
    const s = http.createServer((q, w) => { w.writeHead(404); w.end('{}'); }); await new Promise(rs => s.listen(0, '127.0.0.1', rs));
    const r2 = await client(s.address().port).send({ jobId: 'b', provider: 'claude', prompt: 'x', timeoutMs: 1000 });
    assert.deepStrictEqual([r2.sent, r2.stage], [false, 'mesh_unreachable']); s.close();
  });

  await test('MC-004', 'a refusal by the mesh (accepted:false) passes its stage and sent through untouched', async () => {
    const g = await fakeGlass(Object.assign(() => ({}), { pre: () => ({ sent: false, stage: 'no_window', error: 'no tab' }) }));
    const r = await client(g.port).send({ jobId: 'n', provider: 'claude', prompt: 'x', timeoutMs: 1000 });
    assert.deepStrictEqual([r.sent, r.stage], [false, 'no_window']); await g.close();
  });

  await test('MC-005', 'the mesh FORGETTING a job it had accepted (restart) is sent:null => the ladder sends it to the user, never resends', async () => {
    const g = await fakeGlass(); const c = client(g.port);
    const p = c.send({ jobId: 'fg', provider: 'claude', prompt: 'x', timeoutMs: 5000 });
    await sleep(30); g.jobs.delete('fg');
    const r = await p; assert.deepStrictEqual([r.ok, r.sent, r.stage], [false, null, 'mesh_restarted']); await g.close();
  });

  await test('MC-006', 'losing the mesh mid-job beyond the grace window is sent:null (mesh_lost), not a fallback', async () => {
    const g = await fakeGlass(() => ({ ok: true, sent: true, text: 't' })); const c = client(g.port, { graceMs: 150 });
    const p = c.send({ jobId: 'lost', provider: 'claude', prompt: 'x', timeoutMs: 5000 });
    await sleep(25); await g.close();
    const r = await p; assert.deepStrictEqual([r.sent, r.stage], [null, 'mesh_lost']);
  });

  await test('MC-007', 'IDEMPOTENT across a guardian restart: asking again for the same jobId attaches, the mesh sees ONE job', async () => {
    const g = await fakeGlass(); const a = client(g.port), b = client(g.port);
    const p1 = a.send({ jobId: 'same', provider: 'claude', prompt: 'x', timeoutMs: 5000 }); await sleep(20);
    const p2 = b.send({ jobId: 'same', provider: 'claude', prompt: 'x', timeoutMs: 5000 });
    const [r1, r2] = await Promise.all([p1, p2]); assert.ok(r1.ok && r2.ok); assert.strictEqual(g.jobs.size, 1); await g.close();
  });

  await test('MC-010', 'LADDER e2e: response selector drifted after the prompt was SENT => diagnose, repair persists, RE-READ, complete, exactly ONE send', async () => {
    const g = await fakeGlass(Object.assign((b) => ({ ok: false, sent: true, stage: 'response_not_found', error: 'no text' }), {
      diagnose: () => ({ ok: true, repaired: true, selectors: { resp: '.new-resp' }, evidence: { candidates: 2 } }),
      read: () => ({ ok: true, sent: true, text: 'the whole answer', chatUrl: 'https://c/1' }) }));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-')); const registry = createAgentRegistry({ dir });
    const ladder = createLadder({ registry, mesh: client(g.port), picker: { request: async () => {} }, mode: () => 'mesh-first', timeoutMs: 5000 });
    const r = await ladder.attempt({ id: 'cb1', provider: 'claude', prompt: 'p', content: 'c' });
    assert.strictEqual(r.kind, 'complete'); assert.strictEqual(r.text, 'the whole answer');
    assert.strictEqual(g.log.sends.length, 1, 'the expensive prompt must not be sent again'); assert.strictEqual(g.log.reads.length, 1);
    assert.strictEqual(createAgentRegistry({ dir }).get('claude').selectors.resp, '.new-resp');
    assert.deepStrictEqual(r.trail.map(t => t.tier), ['mesh', 'repair', 'mesh-reread']); await g.close();
  });

  await test('MC-011', 'LADDER: attach_failed (content could not be delivered) falls back to the userscript WITHOUT tripping the circuit breaker', async () => {
    const g = await fakeGlass(() => ({ ok: false, sent: false, stage: 'attach_failed' }));
    const registry = createAgentRegistry({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'mc-')) });
    const ladder = createLadder({ registry, mesh: client(g.port), mode: () => 'mesh-first', breakerThreshold: 2, timeoutMs: 5000 });
    for (let i = 0; i < 4; i++) { const r = await ladder.attempt({ id: 'x' + i, provider: 'claude', prompt: 'p' }); assert.strictEqual(r.kind, 'ncp'); }
    assert.strictEqual(ladder.breakerOpen(), false); await g.close();
  });

  await test('MC-012', 'LADDER: progress from a long job is forwarded to guardian (heartbeat)', async () => {
    const g = await fakeGlass(); const seen = [];
    const ladder = createLadder({ registry: createAgentRegistry({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'mc-')) }), mesh: client(g.port), mode: () => 'mesh-first', timeoutMs: 5000, onProgress: (job, p) => seen.push([job.id, p.phase]) });
    await ladder.attempt({ id: 'hb', provider: 'claude', prompt: 'p' });
    assert.ok(seen.length >= 1 && seen[0][0] === 'hb'); await g.close();
  });

  // ── completion watch ─────────────────────────────────────────────────────────────────────────────
  const { createDispatcher } = require('../../guardian/lib/dispatcher');
  function watchHarness() {
    const bus = new EventEmitter(); const pending = new Map(); const updates = [];
    const ncp = { isConnected: () => true, push: (prov, msg) => { if (msg.type === 'GUARDIAN_PING') setImmediate(() => bus.emit('guardian.ncp.pong', { data: { provider: prov, pingId: msg.pingId } })); return 1; }, pushActive: () => 1 };
    const b2 = { on: (e, f) => bus.on(e, (d) => f(d)), off: (e, f) => bus.off(e, f), emit: (e, d) => bus.emit(e, d) };
    const d = createDispatcher({ updateJob: (id, p) => updates.push([id, p]), bus: { ...b2, on: (e, f) => bus.on(e, f), off: (e, f) => bus.off(e, f), emit: (e, d2) => bus.emit(e, d2) }, ncp, pendingQueue: pending, cockpitBroadcast() {}, dispatchToMistral: async () => {}, dispatchToDeepseek: async () => {}, completionTimeoutMs: 700, pingTimeoutMs: 800 });
    return { d, bus, pending, updates };
  }
  await test('DSP-001', 'a job that is still streaming (chunks arriving) is NOT requeued/resent by the completion watch', async () => {
    const h = watchHarness(); const job = { id: 'live', provider: 'claude', prompt: 'p', command: 'x' };
    await h.d._doDispatch(job);
    for (let i = 0; i < 8; i++) { await sleep(150); h.bus.emit('guardian.job.chunk', { jobId: 'live' }); }   // 1.2s total, far beyond the 0.7s idle window
    assert.strictEqual((h.pending.get('claude') || []).length, 0, 'requeued while alive (would resend the prompt)');
  });
  await test('DSP-002', 'and a job with NO activity is still requeued after the idle window (the safety net is intact)', async () => {
    const h = watchHarness(); const job = { id: 'dead', provider: 'claude', prompt: 'p', command: 'x' };
    await h.d._doDispatch(job); await sleep(1100);
    assert.strictEqual((h.pending.get('claude') || []).length, 1);
  });
  await test('DSP-003', 'defaults: completion watch is an idle window of 15 min (env-configurable), not a fixed 90s; response cap is not a silent 100 KB', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../guardian/lib/dispatcher.js'), 'utf8'), h = fs.readFileSync(path.join(__dirname, '../../guardian/lib/ncp-handler.js'), 'utf8');
    const code = (x) => x.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(/GUARDIAN_COMPLETION_TIMEOUT_MS \|\| '900000'/.test(code(src)));
    assert.ok(!/slice\(0, 100000\)/.test(code(h)) && /GUARDIAN_MAX_RESPONSE_CHARS/.test(code(h)) && /responseTruncated/.test(code(h)));
  });

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
