'use strict';
// 0.60.538 — a step whose system does not answer waits for it, instead of spending its attempts at once.
// His run of the Idearium build, 2026-11-14: Idearium restarted mid-build; "The build landed" failed "fetch failed (after 6 attempts)" in 9.1 s,
// while Idearium took about 13 s to boot.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}: ${e.message}`); } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-wait-'));
  const { AutomationEngine } = require(path.join(ROOT, 'cos/automation/engine.js')); const { Pipelines } = require(path.join(ROOT, 'cos/automation/pipeline.js'));
  await t('PW-01', 'a system that comes up 3 s later is waited for: the step passes, its note said why it waited', async () => {
    const port = await freePort(); let srv = null;
    setTimeout(() => { srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"ok":true}'); }).listen(port, '127.0.0.1'); }, 3000);
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'a') });
    const notes = []; const em = P._emit.bind(P); P._emit = (type, d) => { if (d && d.note) notes.push(d.note); return em(type, d); };
    const c = P.create({ name: 'waits', tasks: [{ id: 'landed', label: 'The build landed', retries: 5, step: { type: 'api', config: { url: `http://127.0.0.1:${port}/x`, method: 'GET' } } }] });
    const t0 = Date.now(); const r = await P.run((c.pipeline || c).id, { wait: true });
    try { assert.strictEqual(r.run.tasks.landed.status, 'done', JSON.stringify(r.run.tasks.landed)); assert.ok(Date.now() - t0 >= 2500, 'it waited');
      assert.ok(notes.some(n => /did not answer; trying again in \d+ s/.test(n)), 'said: ' + notes.join(' | ')); } finally { if (srv) srv.close(); }
  });
  await t('PW-02', 'a step that answers with an error is not waited for (only a system that does not answer is)', async () => {
    const srv = http.createServer((q, r) => { r.statusCode = 500; r.end('{"ok":false}'); }); await new Promise(x => srv.listen(0, '127.0.0.1', x));
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'b') });
    const c = P.create({ name: 'fails', tasks: [{ id: 'x', retries: 3, step: { type: 'api', config: { url: `http://127.0.0.1:${srv.address().port}/x`, method: 'GET' } } }] });
    const t0 = Date.now(); const r = await P.run((c.pipeline || c).id, { wait: true }); srv.close();
    assert.strictEqual(r.run.tasks.x.status, 'failed'); assert.ok(Date.now() - t0 < 2000, `no waits: ${Date.now() - t0} ms`);
  });
  await t('PW-03', 'his "an event ledger per step": each step keeps every change in order (running, the wait said, done), saved with the run', async () => {
    const port = await freePort(); let srv = null;
    setTimeout(() => { srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"ok":true}'); }).listen(port, '127.0.0.1'); }, 1500);
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'c') });
    const c = P.create({ name: 'ledger', tasks: [{ id: 's', retries: 3, step: { type: 'api', config: { url: `http://127.0.0.1:${port}/x`, method: 'GET' } } }] });
    const r = await P.run((c.pipeline || c).id, { wait: true }); if (srv) srv.close();
    const ev = r.run.tasks.s.events; assert.ok(Array.isArray(ev) && ev.length >= 3, JSON.stringify(ev));
    assert.strictEqual(ev[0].status, 'running'); assert.ok(ev.some(e => /trying again/.test(e.note || '')), 'the wait is in it'); assert.strictEqual(ev[ev.length - 1].status, 'done');
    assert.ok(ev.every((e, i) => i === 0 || e.at >= ev[i - 1].at), 'in order');
    const saved = P.getRun(r.run.id); assert.deepStrictEqual(saved.tasks.s.events.length, ev.length, 'saved with the run');
  });
  await t('PW-04', 'his "each step can be a node file … stop using memory for storage": every step is a .process_step node on disk with its ledger and its whole output', async () => {
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'd') });
    const c = P.create({ name: 'nodes', tasks: [{ id: 'one', label: 'One', step: { type: 'set', config: { assign: { v: 'x'.repeat(3000) } } } }, { id: 'two', depends_on: ['one'], step: { type: 'set', config: { assign: { w: 'y' } } } }] });
    const r = await P.run((c.pipeline || c).id, { wait: true });
    const f = path.join(tmp, 'd', 'runs', r.run.id, 'one.process_step'); assert.ok(fs.existsSync(f), 'the step node file');
    const NX = require(path.join(ROOT, 'lib/node-export.js')); const d = NX.fromYaml(fs.readFileSync(f, 'utf8'));
    assert.strictEqual(d.type, 'process_step'); assert.strictEqual(d.payload.status, 'done'); assert.ok(d.payload.events.length >= 2, 'its ledger');
    assert.strictEqual(JSON.stringify(d.payload.output).includes('x'.repeat(3000)), true, 'the whole output, not a preview');
    assert.deepStrictEqual(Object.keys(P.steps(r.run.id)).sort(), ['one', 'two']);
  });
  await t('PW-05', 'his "persistence is non negiatiable until … the dag is complete": a run cut off by a restart resumes from disk; its finished steps are not run again', async () => {
    const dir = path.join(tmp, 'e'); const hits = [];
    const srv = http.createServer((q, r) => { hits.push(q.url); r.setHeader('content-type', 'application/json'); r.end('{"ok":true}'); }); await new Promise(x => srv.listen(0, '127.0.0.1', x));
    const A1 = new Pipelines(new AutomationEngine({}), { dir });
    const c = A1.create({ name: 'resume', vars: { tag: '' }, tasks: [{ id: 'first', step: { type: 'api', config: { url: `http://127.0.0.1:${srv.address().port}/first?t={{vars.tag}}`, method: 'GET' } } },
      { id: 'second', depends_on: ['first'], step: { type: 'api', config: { url: `http://127.0.0.1:${srv.address().port}/second?t={{vars.tag}}`, method: 'GET' } } }] });
    const pid = (c.pipeline || c).id;
    const done = await A1.run(pid, { wait: true, vars: { tag: 'x1' } }); assert.strictEqual(done.status, 'ok');
    // a restart in the middle: rewrite the run on disk as COS would leave it (second still running), and forget it in memory
    const runFile = path.join(dir, 'runs', `${done.run.id}.json`); const left = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    left.status = 'running'; left.finishedAt = null; left.tasks.second = { status: 'running', attempts: 1 }; fs.writeFileSync(runFile, JSON.stringify(left));
    hits.length = 0;
    const A2 = new Pipelines(new AutomationEngine({}), { dir });   // the new process after the restart
    const out = await A2.resumeInterrupted();
    assert.strictEqual(out.length, 1, JSON.stringify(out)); assert.deepStrictEqual(out[0].met, ['first']);
    let now = null; for (let k = 0; k < 50 && !(now && now.status === 'ok'); k++) { await new Promise(x => setTimeout(x, 100)); now = A2.getRun(out[0].now); }
    srv.close();
    assert.strictEqual(now.status, 'ok', JSON.stringify(now && now.tasks)); assert.strictEqual(now.resume_of, done.run.id);
    assert.deepStrictEqual(hits.map(h => h.split('?')[0]), ['/second'], 'only the unfinished step ran, with the run\'s own vars: ' + hits.join(' '));
    assert.ok(hits[0].includes('t=x1'), 'its vars came from disk');
    assert.strictEqual(A2.getRun(done.run.id).status, 'interrupted'); assert.strictEqual(A2.getRun(done.run.id).resumedBy, out[0].now);
  });
  await t('PW-06', 'his "track each file moving through the backend. tagging each step, and gate": a step\'s files are tags on its node; a file\'s trail spans runs, oldest first', async () => {
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'f') });
    const c = P.create({ name: 'files', tasks: [{ id: 'write', step: { type: 'set', config: { assign: { files: ['cos/x.js', 'lib\\y.js'], note: 'not a path' } } }, gate: { contains: 'x.js' } }] });
    const pid = (c.pipeline || c).id; const r1 = await P.run(pid, { wait: true }); const r2 = await P.run(pid, { wait: true });
    const NX = require(path.join(ROOT, 'lib/node-export.js')); const d = NX.fromYaml(fs.readFileSync(path.join(tmp, 'f', 'runs', r1.run.id, 'write.process_step'), 'utf8'));
    assert.deepStrictEqual(d.payload.files, ['cos/x.js', 'lib/y.js']);
    for (const tag of ['file:cos/x.js', 'file:lib/y.js', 'step:write', 'status:done', 'gate:open']) assert.ok(d.tags.includes(tag), `tag ${tag}: ${d.tags}`);
    const tr = P.trail('cos/x.js'); assert.deepStrictEqual(tr.map(x => x.run), [r1.run.id, r2.run.id]); assert.strictEqual(tr[0].gate, 'open');
    assert.deepStrictEqual(P.trail('nowhere.js'), []);
  });
  await t('PW-07', 'FX1a: a failed run resumed: what it finished is not run again, the failed step and the rest run; a step named in redo runs again', async () => {
    let fail = true; const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); if (fail) { r.statusCode = 409; r.end('{"ok":false}'); } else r.end('{"ok":true}'); });
    await new Promise(x => srv.listen(0, '127.0.0.1', x)); const port = srv.address().port;
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'g') });
    const c = P.create({ name: 'resume', tasks: [{ id: 'one', step: { type: 'set', config: { assign: { v: 1 } } } }, { id: 'two', depends_on: ['one'], step: { type: 'api', config: { url: `http://127.0.0.1:${port}/x`, method: 'GET' } } }, { id: 'three', depends_on: ['two'], step: { type: 'set', config: { assign: { w: 2 } } } }] });
    const pid = (c.pipeline || c).id; const r1 = await P.run(pid, { wait: true });
    try { assert.strictEqual(r1.run.tasks.two.status, 'failed'); fail = false;
      const busy = await P.resume('no-such-run'); assert.strictEqual(busy.ok, false);
      const r2 = await P.resume(r1.run.id, { by: 'test' }); assert.deepStrictEqual(r2.met, ['one'], JSON.stringify(r2));
      let run = null; for (let i = 0; i < 50 && !(run && run.status !== 'running'); i++) { await new Promise(x => setTimeout(x, 100)); run = P.getRun(r2.runId); }
      assert.strictEqual(run.status, 'ok', JSON.stringify(run.tasks)); assert.strictEqual(run.resume_of, r1.run.id);
      const r3 = await P.resume(r1.run.id, { by: 'test', redo: ['one'] }); assert.deepStrictEqual(r3.met, [], 'redo runs it again');
    } finally { srv.close(); }
  });
  await t('PW-08', 'his "set gates to open instead of pass, so we can have the whole pipeline debugged at once": a failing step is recorded and the steps after it run; the run ends debugged, never ok; without it, they are blocked', async () => {
    const srv = http.createServer((q, r) => { r.statusCode = 500; r.end('{"ok":false}'); }); await new Promise(x => srv.listen(0, '127.0.0.1', x));
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'h') });
    const c = P.create({ name: 'open', tasks: [{ id: 'a', step: { type: 'set', config: { assign: { v: 1 } } } }, { id: 'b', depends_on: ['a'], step: { type: 'api', config: { url: `http://127.0.0.1:${srv.address().port}/x`, method: 'GET' } } }, { id: 'c', depends_on: ['b'], step: { type: 'set', config: { assign: { w: 2 } } } }] });
    const pid = (c.pipeline || c).id;
    try {
      const shut = await P.run(pid, { wait: true });
      assert.strictEqual(shut.run.tasks.c.status, 'blocked', 'gates closed: c is blocked'); assert.strictEqual(shut.run.status, 'failed');
      const open = await P.run(pid, { wait: true, gates: 'open' });
      assert.strictEqual(open.run.tasks.c.status, 'done', JSON.stringify(open.run.tasks)); assert.ok(open.run.tasks.b.openGate && /would stop|HTTP|500|ok/i.test(open.run.tasks.b.note), JSON.stringify(open.run.tasks.b));
      assert.strictEqual(open.run.status, 'debugged'); assert.match(open.run.error, /1 step\(s\) would have stopped it/); assert.strictEqual(open.run.vars.gates, 'open');
      const again = await P.resume(open.run.id, { by: 'test', redo: ['b'] }); let rr = null; for (let i = 0; i < 50 && !(rr && rr.status !== 'running'); i++) { await new Promise(x => setTimeout(x, 100)); rr = P.getRun(again.runId); }
      assert.strictEqual(rr.status, 'debugged', 'a resume keeps its gates open');
    } finally { srv.close(); }
  });
  await t('PW-09', 'his "edit gates conditions. Not whole runs. Maybe even a debug gate … setting": a gate edited in place; set to debug, only that step\'s failure is recorded and passed; enforce again, it stops', async () => {
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'i') });
    const c = P.create({ name: 'gated', tasks: [{ id: 'a', step: { type: 'set', config: { assign: { v: 'hello' } } }, gate: { contains: 'nope' } }, { id: 'b', depends_on: ['a'], step: { type: 'set', config: { assign: { w: 2 } } } }] });
    const pid = (c.pipeline || c).id;
    const shut = await P.run(pid, { wait: true }); assert.strictEqual(shut.run.tasks.b.status, 'blocked', JSON.stringify(shut.run.tasks));
    const e1 = P.setGate(pid, 'a', { set: { contains: 'hel' } }); assert.strictEqual(e1.gate.contains, 'hel', JSON.stringify(e1));
    const ok = await P.run(pid, { wait: true }); assert.strictEqual(ok.run.status, 'ok', JSON.stringify(ok.run.tasks.a));
    const e3 = P.setGate(pid, 'a', { set: { contains: 'nope', debug: true } }); assert.strictEqual(e3.ok, true, JSON.stringify(e3));
    const dbg = await P.run(pid, { wait: true });
    assert.strictEqual(dbg.run.tasks.b.status, 'done'); assert.ok(dbg.run.tasks.a.openGate, JSON.stringify(dbg.run.tasks.a)); assert.strictEqual(dbg.run.status, 'debugged');
    const e2 = P.setGate(pid, 'a', { unset: ['debug'] }); assert.ok(!('debug' in e2.gate), JSON.stringify(e2));
    const again = await P.run(pid, { wait: true }); assert.strictEqual(again.run.tasks.b.status, 'blocked');
    assert.strictEqual(P.setGate(pid, 'zz', { set: { x: 1 } }).ok, false);
  });
  await t('PW-10', 'his "any gate that has passed. Doesn\'t need to be run again. Reuses the same step.": a gated step that passed is reused with its node\'s output; new inputs or redo run it again; a step with no gate always runs', async () => {
    let hits = 0; const srv = http.createServer((q, r) => { hits++; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ ok: true, n: hits })); });
    await new Promise(x => srv.listen(0, '127.0.0.1', x)); const port = srv.address().port;
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'j') });
    const c = P.create({ name: 'reuse', vars: { x: '1' }, tasks: [{ id: 'a', step: { type: 'api', config: { url: `http://127.0.0.1:${port}/a?x={{vars.x}}`, method: 'GET' } }, gate: { contains: 'ok' } }, { id: 'b', depends_on: ['a'], step: { type: 'set', config: { assign: { w: 2 } } } }] });
    const pid = (c.pipeline || c).id;
    try {
      const r1 = await P.run(pid, { wait: true }); assert.strictEqual(r1.run.status, 'ok'); assert.strictEqual(hits, 1);
      const r2 = await P.run(pid, { wait: true }); assert.strictEqual(hits, 1, 'a was not run again'); assert.ok(r2.run.tasks.a.reused && r2.run.tasks.a.reused.from === r1.run.id, JSON.stringify(r2.run.tasks.a));
      assert.strictEqual(r2.run.tasks.b.status, 'done'); assert.strictEqual(r2.run.status, 'ok');
      const r3 = await P.run(pid, { wait: true, vars: { x: '2' } }); assert.strictEqual(hits, 2, 'new inputs: run again'); assert.ok(!r3.run.tasks.a.reused);
      const r4 = await P.resume(r3.run.id, { by: 'test', redo: ['a'] }); let rr = null; for (let i = 0; i < 50 && !(rr && rr.status !== 'running'); i++) { await new Promise(x => setTimeout(x, 100)); rr = P.getRun(r4.runId); }
      assert.strictEqual(hits, 3, 'redo: run again'); assert.strictEqual(rr.status, 'ok');
    } finally { srv.close(); }
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
