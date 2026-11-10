'use strict';
/**
 * tests/modules/test-cos-pipeline.test.js — COS's pipeline module (cos/pipeline/): programmable gates (PC5) and requests kept as files.
 * Map: docs/2026-11-08-pipeline-canvas-phasemap.spec PC5 · Spec: cos/spec/pipeline-canvas.spec MOD-PC-GATE-TYPES, MOD-PC-RUNS.
 * James, 2026-11-09: "Gates can hold context, test, verify, gates would do a lot. But not the same everytime." · "This needs to be a module." ·
 * "Needs to use actual physical files in the backend, the steps. Like the dag and contract, and the relevant nodes. Like each step needs to be
 * persistent until the contract and conditions for the request from the dag have been met." · "The gates are temporary unless it didn't finish."
 *
 *   CP-00  Emerge's own tests: the box shape (with its dag hook) and the gate
 *   CP-01  the module is one folder with its registry; the shipped .gatetype files are listed; a try decides and does nothing
 *   CP-02  a request is files before it runs (run.run with its contract, dag.dag, a .step per step, a .gate per gated step); met, it moves to
 *          done/, its gates removed, its steps kept as the record; the run's events carry what passed and each verdict (the canvas's wires)
 *   CP-03  not met: it stays in active/ with its gates and every verdict; resumed from its step files, what was met is not run again; then met
 *   CP-04  not the same every time: three requests, the same reason: closed, closed, gap (held), learned through the step files, not the gates
 *   CP-05  an emerge gate hands Emerge the gap with its why and its task, and holds the request
 *   CP-06  his own gate type is checked in Emerge and kept; an agent's refused; a bad one named; a shipped id left alone
 *   CP-08  the data a request carries is nodes: a step gives a .context, the next takes it and gives a .contract, a node gate checks it
 *          against its schema; each is a file in nodes/, each step names what it took and gave, the DAG what each wire carries; a .chunk
 *          missing its schema's fields closes the gate, named (James: "the data that runs through the pipeline like idearium pipeline does")
 *   CP-09  BrainOS's conditions on a pipeline step: when false it is skipped, said, and so is what only waits on it; a join runs; the request is met
 *   CP-10  BrainOS's triggers and events in the engine: a held request, a gate gap, a COS ledger row and an event a system sends each start the
 *          workflows listening; an agent's event is refused
 *   CP-11  recursive and meta: a .framework that declares its steps compiles to a pipeline in the engine; one that only describes is refused,
 *          named; a pipeline runs it as a step; the child request and its parent step are linked both ways, its nodes in its own files
 *   CP-12  a framework as a step, recursive: a pipeline's framework step runs outer → mid → inner, each a request linked to its parent; a loop
 *          of frameworks is refused when compiled and when run, named; the schemas process and process_step are registered
 *   CP-13  every kind by name from a framework's step: a pipeline (its request linked), a workflow, a macro (Clear Glass's: without it running,
 *          the step fails and says so, and onFail continue goes on); schema.pipeline, schema.macro say where they sit
 *   CP-14  one contract, RAID's: each request's contract is a .contract v2 booked with Cortex by route; each step met is its evidence; met is
 *          RAID's answer; with Cortex down the request still runs, said whose verdict it is and that the books wait
 *   CP-15  a phase planned into its own .pipeline, end state first (its proof is the contract's outcome): context, dag, build, evidence, ledger,
 *          each an Idearium route with a gate; with chunks, a build step per file; build-next plans and runs the next ready phase to met;
 *          Idearium's real phases/one serves a real phase whole
 *   CP-18  (2026-11-10) a value a step's address needs, empty, is asked for before the run starts ({ needs }); given, it runs; Idearium's
 *          build pipeline names Nexus's own repo ("nexus") and a planned phase defaults to it
 *   CP-17  (2026-11-10) a pipeline drawn on ERAVOS's canvas (.erv: Step tools, a gate tool, wires, YAML) is made into its .pipeline node file and
 *          imported; run, it runs; drawn again with the same name it updates the same pipeline; a step naming nothing is said (422); an agent's is a 403
 *   CP-16  every pipeline a physical node file, imported: a system's own (fetched by its route, kept as a file first), COS's planned ones
 *          (written as their node file first); an unchanged file is left, a changed one updates in place (same id); all in the engine's list
 *   CP-07  an engine with no gate host refuses a typed gate, said; command rows for agents and copilot
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-pipeline-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
process.env.COS_FRAMEWORKS_DIR = path.join(tmp, 'frameworks');
const RUNS = path.join(tmp, 'data', 'pipeline', 'runs');

let passed = 0, failed = 0;
async function T(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
const req = (port, method, p, body) => new Promise((res, rej) => { const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(t || '{}') }); } catch (e) { rej(new Error(t)); } }); });
  q.on('error', rej); if (data) q.write(data); q.end(); });
const wait = async (fn, ms = 20000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error(`timed out: ${String(fn).slice(0, 140)}`); };
const stand = (handler) => new Promise((res) => { const s = http.createServer((q, r) => { let t = ''; q.on('data', c => t += c); q.on('end', () => handler(q, r, t)); }); s.listen(0, '127.0.0.1', () => res(s)); });
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const eg = (...a) => require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'emerge/emerge/lang/eg.js'), ...a], { cwd: ROOT, encoding: 'utf8' });

(async () => {
  console.log('\n⬢  COS: the pipeline module (gates, requests as files)\n');
  let passing = true; const tested = [], handed = [];
  const tester = await stand((q, r, t) => { if (q.url === '/api/tests/run') { tested.push(t); r.end(passing && /good/.test(t) ? '{"result":"3 passed"}' : '{"result":"1 failed"}'); } else r.end('{"ok":true}'); });
  // Cortex: the real RAID contract door (cortex/core/raid/contract-v2-door.js) on a temporary folder — RAID's own logic, Cortex's route
  const RAIDDIR = path.join(tmp, 'raid-contracts'); const DOOR = require(path.join(ROOT, 'cortex/core/raid/contract-v2-door.js'));
  let cortexUp = true;
  const cortex = await stand(async (q, r, t) => { if (!cortexUp) { r.statusCode = 503; return r.end('{"ok":false,"error":"down"}'); } let b = {}; try { b = JSON.parse(t || '{}'); } catch (_) {}
    const o = await DOOR.handle(q.method, q.url, b, { dir: RAIDDIR }); r.statusCode = o ? o.status : 404; r.end(JSON.stringify(o ? o.json : { ok: false })); });
  // Idearium, stood in: one phase whole, the queue, and the routes a planned pipeline calls (each answers ok, and is recorded)
  const PH = { key: 'docs/x-phasemap.spec::XY1_a_phase', id: 'XY1_a_phase', map: 'docs/x-phasemap.spec', does: 'make the parser', files: ['lib/a.js', 'lib/b.js'], depends_on: [], proof: 'test-parser 3/3' };
  const idCalls = [];
  let ideaSteps = 1;   // Idearium's own pipeline, as its node file says it (a step more when it changes)
  const IDEA_NODE = (n) => { const NE = require(path.join(ROOT, 'lib/node-export.js')); return NE.toYaml(NE.wrap('pipeline', 'idea-one', { id: 'idea-one', format: 'nexus-pipeline', version: 1, name: 'Idea one',
    tasks: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, depends_on: i ? [`s${i}`] : [], step: { type: 'set', config: { assign: { v: String(i) } } } })) })); };
  const ideariumStand = await stand((q, r, t) => { idCalls.push(`${q.method} ${q.url}`); r.setHeader('content-type', 'application/json');
    if (q.url.startsWith('/api/phases/one')) return r.end(JSON.stringify({ ok: true, ...PH }));
    if (q.url.startsWith('/api/phases/next')) return r.end(JSON.stringify({ ok: true, queue: [{ key: PH.key, id: PH.id }] }));
    if (q.url === '/api/pipelines') return r.end(JSON.stringify({ ok: true, pipelines: [{ id: 'idea-one', name: 'Idea one' }] }));
    if (q.url === '/api/pipelines/idea-one') return r.end(JSON.stringify({ ok: true, pipeline: { text: IDEA_NODE(ideaSteps) } }));
    r.end('{"ok":true}'); });
  const emerge = await stand((q, r, t) => { if (q.url === '/handoff') { handed.push(JSON.parse(t)); r.end('{"ok":true,"state":"queued"}'); } else r.end('{"ok":true}'); });
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'ledger.jsonl'), log: () => {}, declarations: [
    { name: 'tester', system: 'tester', cmd: process.execPath, args: ['-e', ''], healthUrl: `http://127.0.0.1:${tester.address().port}/health` },
    { name: 'emerge', system: 'emerge', cmd: process.execPath, args: ['-e', ''], healthUrl: `http://127.0.0.1:${emerge.address().port}/health` },
    { name: 'idearium', system: 'idearium', cmd: process.execPath, args: ['-e', ''], healthUrl: `http://127.0.0.1:${ideariumStand.address().port}/health` },
    { name: 'cortex', system: 'cortex', cmd: process.execPath, args: ['-e', ''], healthUrl: `http://127.0.0.1:${cortex.address().port}/health` }] });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: ROOT }); const M = mgr.address().port;
  const events = []; const es = http.get({ host: '127.0.0.1', port: M, path: '/api/cos/events' }, (r) => { let buf = ''; r.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2);
    const ev = (/^event: (.+)$/m.exec(blk) || [])[1], d = (/^data: (.+)$/m.exec(blk) || [])[1]; if (ev && d) { try { events.push({ ev, data: JSON.parse(d) }); } catch (_) {} } } }); });
  const make = async (name, tasks) => { const r = await req(M, 'POST', '/api/cos/automation/pipelines', { name, tasks, by: 'person' }); assert.ok(r.body.ok, JSON.stringify(r.body)); return (r.body.pipeline || r.body).id; };
  const ask = async (pipeline, vars) => { const r = await req(M, 'POST', '/api/cos/pipeline/requests', { pipeline, vars, by: 'person' }); assert.ok(r.body.ok, JSON.stringify(r.body)); return r.body; };
  const ended = async (id) => wait(async () => { const x = (await req(M, 'GET', `/api/cos/pipeline/requests/${id}`)).body; return x.ok && x.run.payload.finishedAt ? x : null; });
  const SET = (v) => ({ type: 'set', config: { assign: { v } } });
  const TEST = { type: 'test', with: { owner: 'tester', route: 'POST /api/tests/run', expect: 'passed' } };
  try {
    await T('CP-00', 'Emerge\'s own tests: the box shape (with its dag hook) and the gate', () => {
      for (const [f, n] of [['cos/pipeline/test/box.test.eg', 14], ['cos/pipeline/test/gate.test.eg', 8], ['cos/pipeline/test/runs.test.eg', 6], ['cos/pipeline/test/framework.test.eg', 8]]) { const r = eg('test', f); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, new RegExp(`${n} passed, 0 failed`)); }
    });

    await T('CP-01', 'one folder with its registry; the shipped .gatetype files listed; a try decides and does nothing', async () => {
      const reg = J(path.join(ROOT, 'cos/pipeline/registry.json'));
      assert.deepStrictEqual(reg.extensions.map(e => e.ext), ['.gatetype', '.run', '.dag', '.step', '.gate', '.contract']);
      for (const c of reg.components) assert.ok(fs.existsSync(path.join(ROOT, 'cos/pipeline', c.file)), c.file);
      const ts = (await req(M, 'GET', '/api/cos/gate-types')).body.types;
      assert.deepStrictEqual(ts.map(t => t.id).sort(), ['check', 'context', 'emerge', 'node', 'options', 'test', 'verify']);
      const d = (await req(M, 'POST', '/api/cos/gate-types/check/try', { output: 'failed', with: { contains: 'ok' } })).body.decision;
      assert.deepStrictEqual([d.outcome, d.why, d.actions], ['closed', 'the output does not contain "ok"', [{ do: 'retry', said: 'not done: a try' }]]);
      assert.ok(!fs.existsSync(RUNS), 'a try writes nothing');
    });

    let tested2;
    await T('CP-02', 'a request is files before it runs; met, it moves to done/, gates removed, steps kept; events carry the request through', async () => {
      const pid = await make('tested', [{ id: 'a', step: SET('{{vars.v}}'), gate: TEST }, { id: 'b', depends_on: ['a'], step: SET('next'), gate: { type: 'context' } }]);
      passing = false;   // held at the test, so the files can be read before it is met
      const r = await ask(pid, { v: 'good' }); const dir = path.join(RUNS, 'active', r.request);
      const run = J(path.join(dir, 'run.run'));
      assert.deepStrictEqual([run.type, run.payload.request.pipeline, run.payload.request.vars], ['run', pid, { v: 'good' }]);
      assert.deepStrictEqual(run.payload.contract.raid, r.request, 'its contract is RAID\'s, booked under the request\'s id');
      assert.deepStrictEqual(run.payload.conditions.map(c => [c.step, c.after, c.gate && c.gate.type]), [['a', [], 'test'], ['b', ['a'], 'context']]);
      for (const f of ['steps/a.step', 'steps/b.step', 'gates/a.gate', 'gates/b.gate']) assert.ok(fs.existsSync(path.join(dir, f)), f);
      const dag = await wait(() => fs.existsSync(path.join(dir, 'dag.dag')) && J(path.join(dir, 'dag.dag')));
      assert.deepStrictEqual(dag.payload.boxes.map(b => b.id), ['a', 'a-gate', 'b', 'b-gate'], 'the DAG: compartment, gate, compartment, gate');
      const x = await ended(r.request);
      assert.deepStrictEqual([x.where, x.run.payload.phase], ['active', 'not met']);
      passing = true;
      const r2 = await ask(pid, { v: 'good' }); tested2 = r2.request; const y = await ended(r2.request);
      assert.deepStrictEqual([y.where, y.raid.complete, y.run.payload.phase, y.run.payload.contract.verdict.by], ['done', true, 'met', "RAID's contract (Cortex)"]);
      const done = path.join(RUNS, 'done', r2.request);
      assert.ok(!fs.existsSync(path.join(RUNS, 'active', r2.request)) && !fs.existsSync(path.join(done, 'gates')), 'moved to done/, its gates removed');
      const a = J(path.join(done, 'steps/a.step')).payload; assert.deepStrictEqual([a.met, a.verdicts.slice(-1)[0].outcome], [true, 'open']);
      assert.match(JSON.stringify(a.output), /good/);
      const ev = events.find(e => e.ev === 'automation.pipeline.task' && e.data.runId === r2.engineRun && e.data.task === 'a' && e.data.status === 'done');
      assert.ok(ev && ev.data.gate.outcome === 'open' && /good/.test(JSON.stringify(ev.data.output)), 'the event carries what passed and the verdict');
    });

    await T('CP-03', 'not met: it stays with its gates and verdicts; resumed from its step files, what was met is not run again; then met', async () => {
      const pid = await make('resumes', [{ id: 'a', step: SET('{{vars.v}}') }, { id: 'b', depends_on: ['a'], step: SET('{{vars.v}}'), gate: TEST }]);
      passing = false; const r = await ask(pid, { v: 'good' }); const x = await ended(r.request);
      assert.deepStrictEqual([x.where, x.run.payload.phase], ['active', 'not met']); assert.ok(!x.raid.complete && x.raid.gates.find(g => g.id === 'b').status !== 'PASSED', JSON.stringify(x.raid));
      const dir = path.join(RUNS, 'active', r.request);
      assert.deepStrictEqual([J(path.join(dir, 'steps/a.step')).payload.met, J(path.join(dir, 'steps/b.step')).payload.met], [true, false]);
      assert.strictEqual(J(path.join(dir, 'gates/b.gate')).payload.verdicts.slice(-1)[0].outcome, 'closed', 'the gate is kept: the request did not finish');
      passing = true; const n = tested.length;
      const z = (await req(M, 'POST', `/api/cos/pipeline/requests/${r.request}/resume`, { by: 'person' })).body; assert.ok(z.ok, JSON.stringify(z));
      assert.deepStrictEqual(z.alreadyMet, ['a']);
      const y = await ended(r.request); assert.deepStrictEqual([y.where, y.run.payload.phase], ['done', 'met']);
      assert.strictEqual(tested.length, n + 1, 'only b ran again');
      const er = (await req(M, 'GET', `/api/cos/automation/pipeline-runs/${z.engineRun}`)).body; const eru = er.run || er;
      assert.strictEqual(eru.tasks.a.met, 'earlier');
      assert.strictEqual((await req(M, 'POST', `/api/cos/pipeline/requests/${r.request}/resume`, { by: 'agent:copilot' })).status, 403);
    });

    await T('CP-04', 'not the same every time: three requests, one reason: closed, closed, gap (held) — learned through the step files', async () => {
      const pid = await make('learns', [{ id: 'a', step: SET('{{vars.v}}'), gate: { type: 'check', with: { contains: 'ok' } } }]);
      const outs = [];
      for (let i = 0; i < 3; i++) { const r = await ask(pid, { v: 'nope' }); const x = await ended(r.request); const s = x.steps.find(s => s.payload.task === 'a').payload; outs.push(s.verdicts.slice(-1)[0].outcome + (x.run.payload.phase === 'held' ? '+held' : '')); }
      assert.deepStrictEqual(outs, ['closed', 'closed', 'gap+held']);
      const r = await ask(pid, { v: 'ok now' }); const y = await ended(r.request); assert.strictEqual(y.where, 'done');
      assert.strictEqual(J(path.join(RUNS, 'done', r.request, 'steps/a.step')).payload.gateContext.streak, 0, 'a pass resets what it learned');
    });

    await T('CP-05', 'an emerge gate hands Emerge the gap with its why and its task, and holds the request', async () => {
      const pid = await make('builds', [{ id: 'parse', step: SET('no code yet'), gate: { type: 'emerge', with: { contains: 'fn ', what: 'a parser for .gatetype files' } } }]);
      const r = await ask(pid, {}); const x = await ended(r.request);
      assert.strictEqual(x.run.payload.phase, 'held');
      assert.deepStrictEqual(handed[0], { kind: 'build.gap', from: 'cos.gate', what: 'a parser for .gatetype files', why: 'the output does not contain "fn "', pipeline: pid, task: 'parse' });
      assert.ok(x.gates[0].payload.verdicts[0].actions.some(a => a.do === 'route' && a.ok && a.to === 'emerge POST /handoff'));
    });

    await T('CP-06', 'his own gate type is checked in Emerge and kept; an agent\'s refused; a bad one named; a shipped id left alone', async () => {
      const mine = { id: 'long-enough', about: 'more than 20 characters', checks: [{ kind: 'holds', longerThan: 20 }], on: { closed: [{ do: 'stop' }] } };
      assert.strictEqual((await req(M, 'POST', '/api/cos/gate-types', { type: mine, by: 'agent:copilot' })).status, 403);
      const ok = await req(M, 'POST', '/api/cos/gate-types', { type: mine, by: 'person' }); assert.ok(ok.body.ok, JSON.stringify(ok.body));
      assert.ok(fs.existsSync(path.join(tmp, 'data', 'pipeline', 'gate-types', 'long-enough.gatetype')));
      const bad = await req(M, 'POST', '/api/cos/gate-types', { type: { id: 'bad', checks: [{ kind: 'vibes' }], on: { open: [{ do: 'dance' }] } }, by: 'person' });
      assert.strictEqual(bad.status, 400); assert.ok(bad.body.problems.some(p => /vibes/.test(p)) && bad.body.problems.some(p => /dance/.test(p)));
      assert.strictEqual((await req(M, 'POST', '/api/cos/gate-types', { type: { ...mine, id: 'check' }, by: 'person' })).status, 409);
    });


    await T('CP-08', 'the data is nodes: .context → .contract → .chunk on the wires, each a file, checked against its schema at the gate', async () => {
      const pid = await make('spine', [
        { id: 'ask', step: { type: 'set', config: { assign: { for: 'the request', items: '{{vars.items}}' } } }, gives: ['context'] },
        { id: 'plan', depends_on: ['ask'], step: { type: 'set', config: { assign: { uuid: 'c-1', forAgent: 'cos.pipeline', intention: 'build the parser', endState: 'its tests pass' } } }, takes: ['context'], gives: ['contract'],
          gate: { type: 'node', with: { type: 'contract' } } },
        { id: 'cut', depends_on: ['plan'], step: { type: 'set', config: { assign: { uuid: 'k-1', specUuid: 's-1' } } }, takes: ['contract'], gives: ['chunk'],
          gate: { type: 'node', with: { type: 'chunk' } } }]);
      const r = await ask(pid, { items: 'the atlas' }); const x = await ended(r.request);
      const dir = path.join(RUNS, 'active', r.request);
      const dag = J(path.join(dir, 'dag.dag')).payload;
      assert.deepStrictEqual(dag.wires.map(w => [w.from, w.to, w.carries]).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])), [['ask.out', 'plan.in', ['context']], ['plan.out', 'plan-gate.in', ['contract']], ['plan-gate.out', 'cut.in', ['contract']], ['cut.out', 'cut-gate.in', ['chunk']]].sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])));
      const ctx = J(path.join(dir, 'nodes/ask/out.context')); assert.deepStrictEqual([ctx.type, ctx.payload.items], ['context', 'the atlas']);
      const con = J(path.join(dir, 'nodes/plan/out.contract')); assert.deepStrictEqual([con.type, con.payload.endState], ['contract', 'its tests pass']);
      const plan = J(path.join(dir, 'steps/plan.step')).payload;
      assert.deepStrictEqual([plan.took, plan.gave, plan.met], [['nodes/ask/out.context'], ['nodes/plan/out.contract'], true]);
      const cut = J(path.join(dir, 'steps/cut.step')).payload;
      assert.deepStrictEqual([cut.took, cut.met], [['nodes/plan/out.contract'], false]);
      assert.match(cut.verdicts.slice(-1)[0].why, /the \.chunk lacks sectionId, chunkIdx, status/);
      assert.strictEqual(x.run.payload.phase, 'not met'); assert.ok(x.nodes.some(n => n.path === 'nodes/cut/out.chunk'), 'what it gave is kept, to be seen');
    });

    await T('CP-09', 'conditions: a step whose when is false is skipped, said; what only waits on it too; a join runs; the request is met', async () => {
      // James, 2026-11-09: "Also conditions, triggers, events, etc. migrate BrainOS' features to the engine."
      const pid = await make('branches', [
        { id: 'size', step: SET('{{vars.n}}') },
        { id: 'big', depends_on: ['size'], step: SET('big'), when: { left: '{{vars.n}}', op: '>', value: 10 } },
        { id: 'after-big', depends_on: ['big'], step: SET('after') },
        { id: 'small', depends_on: ['size'], step: SET('small'), when: { left: '{{vars.n}}', op: '<=', value: 10 } },
        { id: 'join', depends_on: ['after-big', 'small'], step: SET('joined') }]);
      const r = await ask(pid, { n: 3 }); const x = await ended(r.request);
      assert.deepStrictEqual([x.where, x.run.payload.phase], ['done', 'met'], JSON.stringify(x.raid && x.raid.why));
      const st = Object.fromEntries(x.steps.map(s => [s.payload.task, s.payload]));
      assert.deepStrictEqual(['size', 'big', 'after-big', 'small', 'join'].map(t => st[t].status), ['done', 'skipped', 'skipped', 'done', 'done']);
      assert.match(st.big.skipped, /its condition is false: 3 > 10/);
      assert.match(st['after-big'].skipped, /every step it waits on was skipped/);
      const bad = await req(M, 'POST', '/api/cos/automation/pipelines', { name: 'bad-when', tasks: [{ id: 'a', step: SET('x'), when: { left: 1, op: 'vibes', value: 2 } }], by: 'person' });
      assert.ok(!bad.body.ok && /when's op "vibes" is not one of/.test(bad.body.error), JSON.stringify(bad.body));
    });

    await T('CP-10', 'triggers and events: a held request, a gate gap, a ledger row and a system\'s event each start the workflows listening', async () => {
      const wf = async (event, match) => { const r = await req(M, 'POST', '/api/cos/automation/workflows', { name: `on ${event}`, status: 'active', by: 'person',
        steps: [{ type: 'trigger', config: { kind: 'event', event, ...(match ? { match } : {}), cooldownMs: 0 } }, { type: 'set', config: { assign: { heard: event } } }] });
        assert.ok(r.body.ok !== false, JSON.stringify(r.body)); return (r.body.workflow || r.body).id; };
      const runsOf = async (id) => ((await req(M, 'GET', `/api/cos/automation/workflows/${id}/runs`)).body.runs || []);
      const onHeld = await wf('pipeline.request.held'), onGap = await wf('pipeline.gate.gap'), onCustom = await wf('versionium.committed'), onLedger = await wf('cos.ledger', 'tester *');
      const pid = await make('gappy', [{ id: 'a', step: SET('nope'), gate: { type: 'check', with: { contains: 'ok' } } }]);
      for (let i = 0; i < 3; i++) await ended((await ask(pid, { })).request);   // closed, closed, gap → held
      await wait(async () => (await runsOf(onGap)).length >= 1 && (await runsOf(onHeld)).length >= 1);
      const sent = await req(M, 'POST', '/api/cos/automation/events', { name: 'versionium.committed', payload: { name: 'main' }, by: 'system:versionium' });
      assert.deepStrictEqual([sent.body.ok, sent.body.started], [true, 1]);
      await wait(async () => (await runsOf(onCustom)).length >= 1);
      sup.start('tester', { by: 'test' });   // a ledger row: "tester start"
      await wait(async () => (await runsOf(onLedger)).length >= 1);
      assert.strictEqual((await req(M, 'POST', '/api/cos/automation/events', { name: 'x.y', by: 'agent:copilot' })).status, 403);
      const SPEC = (await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href)).SPEC;
      assert.ok(SPEC.find(s => s.key === 'cos.event').personOnly());
    });

    await T('CP-11', 'recursive and meta: a .framework compiles to a pipeline; a pipeline runs it as a step; the two requests linked both ways', async () => {
      // James, 2026-11-09: "you did the .frameworks right? .macros? .pipeline? like for steps? its meant to be recursive and meta."
      const F = path.join(tmp, 'frameworks'); fs.mkdirSync(F, { recursive: true });
      fs.writeFileSync(path.join(F, 'prose.framework'), '# a method\nOnly what to do, in words.\n');
      fs.copyFileSync(path.join(ROOT, 'docs/innovation-toolkit.framework'), path.join(F, 'innovation-toolkit.framework'));
      fs.writeFileSync(path.join(F, 'method.framework'), '# a small method\nits prose.\n```json framework-steps\n' + JSON.stringify({ id: 'method', name: 'Method', status: 'his', steps: [
        { id: 'look', section: 'Look', gives: ['context'], run: { type: 'set', config: { assign: { for: 'the request', items: 'what is true' } } } },
        { id: 'bind', section: 'Bind', takes: ['context'], gives: ['contract'], run: { type: 'set', config: { assign: { uuid: 'c-9', forAgent: 'cos', intention: 'x', endState: 'y' } } } }] }) + '\n```\n');
      const list = (await req(M, 'GET', '/api/cos/frameworks')).body.frameworks;
      assert.deepStrictEqual(list.map(f => [f.file, f.runs]).sort(), [['innovation-toolkit.framework', true], ['method.framework', true], ['prose.framework', false]]);
      const no = await req(M, 'POST', '/api/cos/frameworks/prose.framework/pipeline', { by: 'person' });
      assert.strictEqual(no.status, 409); assert.match(no.body.error, /cannot run as a step: it only describes/);
      const draft = await req(M, 'POST', '/api/cos/frameworks/innovation-toolkit.framework/pipeline', { by: 'person' });
      assert.deepStrictEqual([draft.body.ok, draft.body.pipeline.name, draft.body.pipeline.steps], [true, 'framework: The Innovation Toolkit (draft)', 9]);
      const made = await req(M, 'POST', '/api/cos/frameworks/method.framework/pipeline', { by: 'person' }); assert.ok(made.body.ok, JSON.stringify(made.body));
      const outer = await make('uses-a-method', [{ id: 'think', step: { type: 'pipeline', config: { pipeline: 'framework: Method' } } }, { id: 'after', depends_on: ['think'], step: SET('done') }]);
      const r = await ask(outer, {}); const x = await ended(r.request);
      assert.deepStrictEqual([x.where, x.run.payload.phase], ['done', 'met'], JSON.stringify(x.raid && x.raid.why));
      const think = x.steps.find(s => s.payload.task === 'think').payload;
      assert.strictEqual((think.children || []).length, 1, 'the step names the request it started');
      const child = (await req(M, 'GET', `/api/cos/pipeline/requests/${think.children[0]}`)).body;
      assert.deepStrictEqual(child.run.payload.parent, { request: r.request, step: 'think' }, 'the child names its parent request and step');
      assert.deepStrictEqual(child.nodes.map(n => n.path).sort(), ['nodes/bind/out.contract', 'nodes/look/out.context']);
      assert.strictEqual(child.run.payload.phase, 'met');
      assert.strictEqual((await req(M, 'POST', '/api/cos/frameworks/method.framework/pipeline', { by: 'agent:copilot' })).status, 403);
    });

    await T('CP-12', 'a framework as a step, recursive: pipeline → outer → mid → inner, linked; a loop of frameworks refused, named', async () => {
      // James, 2026-11-09: "Frameworks as steps. Or a framework as a step. Recursive. Fully programmable. Executable processes. Schemas for them."
      const F = path.join(tmp, 'frameworks'); fs.mkdirSync(F, { recursive: true });
      const put = (id, o) => fs.writeFileSync(path.join(F, `${id}.framework`), `# ${id}\nits prose.\n\`\`\`json framework-steps\n${JSON.stringify(o)}\n\`\`\`\n`);
      put('outer', { id: 'outer', name: 'Outer', status: 'his', steps: [{ id: 'think', framework: 'mid', gives: ['synthesis'] }, { id: 'close', gives: ['output'], run: { type: 'set', config: { assign: { ok: 'true' } } } }] });
      put('mid', { id: 'mid', name: 'Mid', status: 'his', steps: [{ id: 'deep', framework: 'inner', gives: ['context'] }] });
      put('inner', { id: 'inner', name: 'Inner', status: 'his', steps: [{ id: 'look', gives: ['context'], run: { type: 'set', config: { assign: { for: 'x', items: 'y' } } } }] });
      put('loopa', { id: 'loopa', steps: [{ id: 's', framework: 'loopb', gives: ['output'] }] });
      put('loopb', { id: 'loopb', steps: [{ id: 's', framework: 'loopa', gives: ['output'] }] });
      const pid = await make('runs-a-framework', [{ id: 'go', step: { type: 'framework', config: { framework: 'outer' } } }]);
      const r = await ask(pid, {}); const x = await ended(r.request);
      assert.deepStrictEqual([x.where, x.run.payload.phase], ['done', 'met'], JSON.stringify(x.steps.map(s => [s.payload.task, s.payload.status, s.payload.error])));
      const childOf = async (reqId, step) => { const q = (await req(M, 'GET', `/api/cos/pipeline/requests/${reqId}`)).body; const s = q.steps.find(z => z.payload.task === step); return { q, kids: (s && s.payload.children) || [] }; };
      const a = await childOf(r.request, 'go'); assert.strictEqual(a.kids.length, 1, 'the pipeline step started outer');
      const b = await childOf(a.kids[0], 'think'); assert.strictEqual(b.kids.length, 1, 'outer started mid');
      const c = await childOf(b.kids[0], 'deep'); assert.strictEqual(c.kids.length, 1, 'mid started inner');
      const inner = (await req(M, 'GET', `/api/cos/pipeline/requests/${c.kids[0]}`)).body;
      assert.deepStrictEqual(inner.run.payload.parent, { request: b.kids[0], step: 'deep' });
      assert.deepStrictEqual(inner.nodes.map(n => n.path), ['nodes/look/out.context'], 'the deepest framework\'s data, in its own files');
      const no = await req(M, 'POST', '/api/cos/frameworks/loopa.framework/pipeline', { by: 'person' });
      assert.strictEqual(no.status, 409); assert.match(no.body.error, /a framework runs itself: loopa → loopb → loopa/);
      const lp = await make('runs-a-loop', [{ id: 'go', step: { type: 'framework', config: { framework: 'loopa' } } }]);
      const y = await ended((await ask(lp, {})).request);
      assert.match(y.steps[0].payload.error || '', /a framework runs itself/);
      const N = require(path.join(ROOT, 'lib/node-export.js')); assert.ok(N.KNOWN_TYPES.includes('process') && N.KNOWN_TYPES.includes('process_step'));
      for (const t of ['process', 'process_step']) assert.ok(fs.existsSync(path.join(ROOT, 'lib/node-schemas', `schema.${t}`)), t);
    });

    await T('CP-13', 'every kind by name: a framework runs a pipeline, a workflow and a macro (Clear Glass down: said; onFail continue goes on)', async () => {
      // James, 2026-11-09: "Also .pipelines and .macros. Is it done?"
      const F = path.join(tmp, 'frameworks'); fs.mkdirSync(F, { recursive: true });
      await make('leaf-pipe', [{ id: 'one', step: SET('from a pipeline') }]);
      const w = await req(M, 'POST', '/api/cos/automation/workflows', { name: 'leaf-wf', status: 'active', by: 'person', steps: [{ type: 'set', config: { assign: { from: 'a workflow' } } }] });
      assert.ok(w.body.ok !== false, JSON.stringify(w.body));
      fs.writeFileSync(path.join(F, 'mix.framework'), '# mix\n```json framework-steps\n' + JSON.stringify({ id: 'mix', name: 'Mix', status: 'his', steps: [
        { id: 'p', pipeline: 'leaf-pipe', gives: ['output'] },
        { id: 'w', workflow: 'leaf-wf', gives: ['output'] },
        { id: 'm', macro: 'choose category', gives: ['output'], onFail: 'continue' }] }) + '\n```\n');
      const pid = await make('runs-every-kind', [{ id: 'go', step: { type: 'framework', config: { framework: 'mix' } }, onFail: 'continue' }]);
      const r = await ask(pid, {}); const x = await ended(r.request);
      const go = x.steps[0].payload; assert.strictEqual(go.children.length, 1);
      const mix = (await req(M, 'GET', `/api/cos/pipeline/requests/${go.children[0]}`)).body;
      const st = Object.fromEntries(mix.steps.map(s => [s.payload.task, s.payload]));
      assert.deepStrictEqual([st.p.status, st.w.status, st.m.status], ['done', 'done', 'failed'], JSON.stringify(Object.values(st).map(s => [s.task, s.status, s.error])));
      assert.strictEqual((st.p.children || []).length, 1, 'the pipeline it ran is a child request');
      assert.match(st.m.error, /Clear Glass/, 'the macro says what it needs');
      const y = require('js-yaml');
      assert.match(y.load(fs.readFileSync(path.join(ROOT, 'lib/node-schemas/schema.macro'), 'utf8')).payload.note_2026_11_09, /a leaf/);
      assert.match(y.load(fs.readFileSync(path.join(ROOT, 'lib/node-schemas/schema.pipeline'), 'utf8')).payload.fields.tasks.description, /step.type may also be framework/);
    });

    await T('CP-14', 'one contract, RAID\'s: booked with Cortex per request, a step met is evidence, met is RAID\'s answer; Cortex down breaks nothing', async () => {
      // James, 2026-11-09: "Every. Thing nexus does, end state first, step by step, each gate checks, if it fails becomes a gap to fix to get the pipeline moving again."
      const pid = await make('booked', [{ id: 'a', step: SET('one') }, { id: 'b', depends_on: ['a'], step: SET('two') }]);
      const r = await ask(pid, {}); const x = await ended(r.request);
      const file = path.join(RAIDDIR, `${r.request}.contract`); assert.ok(fs.existsSync(file), 'the contract is a file in Cortex\'s books');
      assert.deepStrictEqual([x.where, x.raid.complete, x.raid.gates.map(g => g.status)], ['done', true, ['PASSED', 'PASSED']]);
      assert.deepStrictEqual([x.run.payload.contract.booked, x.run.payload.contract.verdict.by], [true, "RAID's contract (Cortex)"]);
      const raid = require('js-yaml').load(fs.readFileSync(file, 'utf8')); assert.deepStrictEqual(Object.keys(raid.payload.state.evidence).sort(), ['step:a', 'step:b']);
      cortexUp = false;
      const r2 = await ask(pid, {}); const y = await ended(r2.request);
      assert.deepStrictEqual([y.where, y.run.payload.contract.booked], ['done', false], 'the request ran; its contract was not booked');
      assert.match(y.run.payload.contract.why, /Cortex/); assert.match(y.run.payload.contract.verdict.by, /COS's own steps/);
      assert.strictEqual(y.raid.reached, false);
      cortexUp = true;
    });

    await T('CP-15', 'a phase planned into its own .pipeline, end state first; one chunk per file when asked; build-next runs the next ready one', async () => {
      // James, 2026-11-09: "Okay just needs to use the pipeline automation engine we built. Using a .pipeline. They build upon request, dynamically" · "It's end state first reasoning."
      const a = (await req(M, 'POST', '/api/cos/pipeline/plan', { key: PH.key, repo: 'nx', by: 'person' })).body;
      assert.ok(a.ok, JSON.stringify(a));
      assert.deepStrictEqual([a.pipeline.name, a.pipeline.endState.says, a.pipeline.steps], ['build: XY1_a_phase', 'test-parser 3/3', ['context', 'dag', 'build', 'evidence', 'ledger']]);
      const b = (await req(M, 'POST', '/api/cos/pipeline/plan', { key: PH.key, repo: 'nx', chunks: true, by: 'person' })).body;
      assert.deepStrictEqual(b.pipeline.steps, ['context', 'dag', 'build-1', 'build-2', 'evidence', 'ledger'], 'one chunk at a time: a build step per file');
      idCalls.length = 0;
      const n = (await req(M, 'POST', '/api/cos/pipeline/build-next', { repo: 'nx', by: 'person' })).body;
      assert.ok(n.ok && n.request, JSON.stringify(n));
      const x = await ended(n.request);
      assert.deepStrictEqual([x.where, x.run.payload.phase], ['done', 'met'], JSON.stringify(x.steps.map(s => [s.payload.task, s.payload.status, s.payload.error])));
      assert.ok(idCalls.some(c => c === 'POST /api/repos/nx/phases/build') && idCalls.some(c => c === 'POST /api/phases/ledger/log'), idCalls.join(' · '));
      const raidFile = require('js-yaml').load(fs.readFileSync(path.join(RAIDDIR, `${n.request}.contract`), 'utf8'));
      assert.strictEqual(raidFile.payload.outcome.what, 'test-parser 3/3', 'the end state first: the phase\'s proof is the contract\'s outcome');
      assert.strictEqual(raidFile.payload.outcome.from, PH.key);
      assert.strictEqual((await req(M, 'POST', '/api/cos/pipeline/build-next', { repo: 'nx', by: 'agent:copilot' })).status, 403);
      // Idearium's real route: a real phase, whole
      const api = await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href);
      const o = await api._route('GET', '/api/phases/one?key=' + encodeURIComponent('docs/2026-11-08-pipeline-canvas-phasemap.spec::PC7_iterate_to_the_end_state'), {});
      const body = o.json || o.body || o; assert.ok(body.ok !== false, JSON.stringify(body).slice(0, 300));
      assert.strictEqual(body.id, 'PC7_iterate_to_the_end_state'); assert.match(String(body.proof), /stand-in project/); assert.ok(body.files.length > 0);
    });

    await T('CP-16', 'every pipeline a physical node file, imported: a system\'s own, COS\'s planned; unchanged left, changed updated in place', async () => {
      // James, 2026-11-09: "Every pipeline should be in the automation tab imported by a physical node fil"
      const NODES = path.join(tmp, 'data', 'pipeline', 'nodes');
      const a = (await req(M, 'POST', '/api/cos/pipeline/sync', { by: 'person' })).body;
      assert.ok(a.ok, JSON.stringify(a));
      const idea = a.files.find(f => f.name === 'Idea one'); assert.ok(idea && idea.ok, JSON.stringify(a.files));
      assert.ok(fs.existsSync(path.join(NODES, 'from-idearium', 'idea-one.pipeline')), 'Idearium\'s pipeline kept as a file first');
      assert.ok(a.systems.some(x => x.system === 'idearium' && x.ok) && a.systems.some(x => x.system === 'clear-glass' && !x.ok), 'a system not there is said');
      const planned = a.files.find(f => f.name === 'build: XY1_a_phase'); assert.ok(planned && /build-xy1-a-phase\.pipeline$/.test(planned.file), 'the planned pipeline came from its own node file');
      const again = (await req(M, 'POST', '/api/cos/pipeline/sync', { by: 'person' })).body;
      assert.strictEqual(again.files.find(f => f.name === 'Idea one').action, 'unchanged');
      ideaSteps = 2;
      const third = (await req(M, 'POST', '/api/cos/pipeline/sync', { by: 'person' })).body; const t = third.files.find(f => f.name === 'Idea one');
      assert.deepStrictEqual([t.action, t.pipelineId], ['updated', idea.pipelineId], 'a changed file updates the same pipeline');
      const list = (await req(M, 'GET', '/api/cos/automation/pipelines')).body.pipelines;
      const inEngine = list.find(p => p.name === 'Idea one'); assert.ok(inEngine && inEngine.tasks.length === 2, 'in the Automation tab\'s list, as its file now says');
      const src = (await req(M, 'GET', '/api/cos/pipeline/sources')).body.sources; assert.ok(src.some(x => x.name === 'Idea one' && /from-idearium/.test(x.file)));
      assert.strictEqual((await req(M, 'POST', '/api/cos/pipeline/sync', { by: 'agent:copilot' })).status, 403);
    });

    await T('CP-17', 'a pipeline drawn on the canvas (.erv) becomes a .pipeline node file, imported, and runs; drawn again it updates; problems said', async () => {
      // James, 2026-11-10: "Also needs to be able to create pipelines. That's what the canvas is for."
      const step = (id, kind, ref, extra = {}) => ({ id, kind: 'tool', tool: 'eravos.agents.step', label: 'Step', on: true, state: { params: { kind, ref, step: id, state: '' }, extra: {} }, ...extra });
      const erv = (ref2) => ({ erv: 1, name: 'Drawn on the canvas', layers: [{ id: 'view', kind: 'canvas', data: null },
        { id: 'tools', kind: 'group', layers: [step('one', 'tool', JSON.stringify(SET('drawn'))), step('g', 'gate', JSON.stringify({ contains: 'drawn' })), step('two', 'tool', ref2)] },
        { id: 'wires', kind: 'wires', data: [{ from: ['one', 'step.hook.out'], to: ['g', 'step.hook.in'] }, { from: ['g', 'step.hook.out'], to: ['two', 'step.hook.in'] }] }] });
      const text = require('js-yaml').dump(erv(JSON.stringify(SET('two'))));
      const r = (await req(M, 'POST', '/api/cos/pipeline/from-erv', { text, by: 'person' })).body;
      assert.ok(r.ok, JSON.stringify(r)); assert.deepStrictEqual([r.action, r.steps], ['imported', 2]);
      assert.ok(fs.existsSync(path.join(ROOT, r.file)) || fs.existsSync(path.join(tmp, 'data', 'pipeline', 'nodes', 'drawn-on-the-canvas.pipeline')), 'its node file written first');
      const list = (await req(M, 'GET', '/api/cos/automation/pipelines')).body.pipelines; const p = list.find(x => x.name === 'Drawn on the canvas');
      assert.ok(p && p.tasks.length === 2 && p.tasks[0].gate && p.tasks[0].gate.contains === 'drawn' && p.tasks[1].depends_on[0] === 'one', JSON.stringify(p && p.tasks));
      const again = (await req(M, 'POST', '/api/cos/pipeline/from-erv', { text: require('js-yaml').dump(erv(JSON.stringify(SET('three')))), by: 'person' })).body;
      assert.deepStrictEqual([again.action, again.pipeline.id], ['updated', r.pipeline.id], 'drawn again: the same pipeline, updated');
      const bad = await req(M, 'POST', '/api/cos/pipeline/from-erv', { text: require('js-yaml').dump(erv('')), by: 'person' });
      assert.strictEqual(bad.status, 422); assert.match(bad.body.error, /names nothing/);
      assert.strictEqual((await req(M, 'POST', '/api/cos/pipeline/from-erv', { text, by: 'agent:copilot' })).status, 403);
      const SPEC = (await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href)).SPEC;
      assert.ok(SPEC.some(s => s.key === 'cos.pipeline-from-erv'));
    });

    await T('CP-18', 'an empty value in a step\'s address is asked for first (needs), never a broken address; "nexus" is the default repo', async () => {
      // James, 2026-11-10: "it is stuck" — GET /api/repos//phases/map → 404
      const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js')); const { Pipelines } = require(path.join(ROOT, 'lib/automation/pipeline.js'));
      const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'needs') });
      const c = P.create({ name: 'needs', vars: { repo: 'nexus', phase: '' }, tasks: [{ id: 'a', step: SET('x') }, { id: 'b', depends_on: ['a'], step: { type: 'api', config: { url: 'http://127.0.0.1:9/api/repos/{{vars.repo}}/phases/dag?phase={{vars.phase}}', method: 'GET' } } }] });
      const id = (c.pipeline || c).id;
      const r = await P.run(id, { wait: true }); assert.strictEqual(r.ok, false); assert.deepStrictEqual(r.needs, ['phase']); assert.match(r.error, /give vars\.phase first/);
      assert.deepStrictEqual(P.needs(P.get(id), { phase: 'PC4' }), [], 'given, nothing is needed');
      const y = require('js-yaml').load(fs.readFileSync(path.join(ROOT, 'idearium/pipelines/idearium-build.pipeline'), 'utf8'));
      assert.strictEqual(y.payload.vars.repo, 'nexus', 'Idearium\'s build pipeline names Nexus\'s own repo');
      assert.match(fs.readFileSync(path.join(ROOT, 'cos/pipeline/plan.eg'), 'utf8'), /if r == "" \{ return "nexus" \}/);
      assert.match(fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8'), /m\.params\.uuid === 'nexus'/, 'Idearium reads "nexus" as its parent repo');
    });

    await T('CP-07', 'an engine with no gate host refuses a typed gate, said; command rows for agents and copilot', async () => {
      const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js')); const { Pipelines } = require(path.join(ROOT, 'lib/automation/pipeline.js'));
      const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'bare') });
      const c = P.create({ name: 'bare', tasks: [{ id: 'a', step: SET('x'), gate: { type: 'check' } }] }); assert.ok(c.ok, JSON.stringify(c));
      const r = await P.run((c.pipeline || c).id, { wait: true }); assert.match(r.run.tasks.a.gate.why, /this engine has no gate types/);
      const SPEC = (await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href)).SPEC;
      for (const k of ['cos.gate-types', 'cos.gate-try', 'cos.request', 'cos.requests', 'cos.request-show', 'cos.request-resume']) assert.ok(SPEC.some(s => s.key === k), k);
      assert.ok(SPEC.find(s => s.key === 'cos.request').personOnly() && SPEC.find(s => s.key === 'cos.request-resume').personOnly(), 'an agent proposes; running is his');
    });
    // PC8 slice a (2026-11-10) — James: "each step measured by a delta, which could be used for the timing in between each step agnostically, to
    // establish a baseline." Through COS's door, end to end: the engine keeps each run, Emerge (cos/pipeline/baseline.eg) gives the baseline.
    await T('CP-19', 'a delta per step and its baseline across runs, from COS\'s door: below three runs no sigma; from three, a sigma and a z; the wait between steps', async () => {
      const made = (await req(M, 'POST', '/api/cos/automation/pipelines', { name: 'pc8-baseline', tasks: [{ id: 'a', step: SET('x') }, { id: 'b', depends_on: ['a'], step: SET('y') }] })).body;
      const id = (made.pipeline || made).id; assert.ok(id, JSON.stringify(made));
      const none = (await req(M, 'GET', `/api/cos/pipeline/baseline?pipeline=${id}`)).body;
      assert.strictEqual(none.ok, true, JSON.stringify(none)); assert.strictEqual(none.runs, 0); assert.deepStrictEqual(none.steps, {});
      for (let i = 0; i < 2; i++) { const r = (await req(M, 'POST', `/api/cos/automation/pipelines/${id}/run?wait=1`, {})).body; assert.ok(r.ok !== false, JSON.stringify(r).slice(0, 300)); }
      const two = (await req(M, 'GET', `/api/cos/pipeline/baseline?pipeline=${id}`)).body;
      assert.strictEqual(two.runs, 2); assert.strictEqual(two.steps.a.n, 2); assert.strictEqual(two.steps.a.sigma_ms, null, 'below three runs: no sigma');
      await req(M, 'POST', `/api/cos/automation/pipelines/${id}/run?wait=1`, {});
      const three = (await req(M, 'GET', `/api/cos/pipeline/baseline?pipeline=${id}`)).body;
      assert.strictEqual(three.steps.b.n, 3); assert.strictEqual(typeof three.steps.b.sigma_ms, 'number', 'from three runs: a sigma');
      assert.strictEqual(typeof three.steps.b.wait_mean_ms, 'number', 'the wait after the step it waits on has its own baseline');
      assert.ok(three.latestRun && Array.isArray(three.latestRun.decisions));
      const bad = await req(M, 'GET', '/api/cos/pipeline/baseline'); assert.strictEqual(bad.status, 400);
      const SPEC = (await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href)).SPEC;
      assert.ok(SPEC.some(s => s.key === 'cos.pipeline-baseline'), 'a command row, for agents and copilot');
    });
  } finally {
    es.destroy(); mgr.close(); sup.shutdown({ by: 'test' }); tester.close(); emerge.close(); cortex.close(); ideariumStand.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
