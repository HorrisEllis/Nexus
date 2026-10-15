'use strict';
/**
 * tests/modules/test-contract-adapters.test.js — 0.60.18 EX0 — the agent and phase adapters, tested on their own before
 * the phase build uses them (James: "build and test the adapters independently first, then connect the phase-build action").
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

(async () => {
  console.log('\ntest-contract-adapters\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-ca-'));
  try {
    const C = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
    const A = require(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'));
    const write = (rel, t) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), t); };
    const noBudget = { budget: () => null };
    write('docs/x-phasemap.spec', 'phases:\n  P1: { files: [lib/a.js, lib/b.js, lib/c.js] }\n');
    write('lib/a.js', 'module.exports = {};\n');   // a.js exists: the plan edits it
    const plan = {
      intent: 'three files', conditions: [],
      files: [
        { path: 'lib/a.js', component: 'a', new: false, layer: 'kernel', exports: [{ name: 'x' }], imports: [], steps: ['export x', 'document x'] },
        { path: 'lib/b.js', new: true, layer: 'engine', exports: [{ name: 'y' }], imports: ['./a.js: x'], steps: ['use x'] },
        { path: 'lib/c.js', new: true, layer: 'engine', exports: [{ name: 'z' }], imports: [], steps: ['export z'] },
      ],
      order: ['lib/a.js', 'lib/b.js', 'lib/c.js'],
    };
    const built = () => A.fromPhasePlan(plan, { phaseKey: 'P1', title: 'three', inputs: [{ id: 'map', path: 'docs/x-phasemap.spec' }], root: tmp });

    // EA-05 — plan → contract
    const L = built(); const p = L.payload;
    const b = (f) => p.gates.find(g => g.file === f);
    const ph = p.gates.find(g => g.id === 'phase');
    check('EA-05 plan → contract: a brick per file with its requirement and steps, the import edge as depends_on, explicit completion, and a parent integration gate',
      p.gates.length === 4 && b('lib/b.js').depends_on.includes(b('lib/a.js').id) && !b('lib/c.js').depends_on.length
      && b('lib/a.js').requirement.exports[0] === 'x' && b('lib/a.js').actions.length === 2 && b('lib/a.js').requires.includes('src.lib_a.js')
      && b('lib/b.js').pass_when.some(c => c.evidence === `${b('lib/b.js').id}.verified`) && ph.integration === 'phase.integrated'
      && ph.children.length === 3 && !C.validate(p).length, JSON.stringify(C.validate(p)));

    // EA-01 — the agent adapter: routed, dispatched, evidence of who and what
    const calls = []; const spans = {};
    let failB = 1;
    const dispatch = async (hops, { gate }) => {
      calls.push(gate.id); spans[gate.id] = [Date.now()];
      await new Promise(r => setTimeout(r, 60)); spans[gate.id].push(Date.now());
      if (gate.file === 'lib/b.js' && failB-- > 0) return { ok: false, provider: hops[0].provider, error: 'deliberate failure' };
      return { ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok — every planned export present' } };
    };
    let integrated = 'met 2/2';
    const integrate = async () => ({ ok: /^met/.test(integrated), evidence: { 'phase.integrated': integrated } });
    const agent = A.agentExecutor({ route: () => [{ provider: 'ollama:qwen2.5-coder:7b' }, { provider: 'claude' }], dispatch, boundaries: noBudget });
    const one = await agent('lib/c.js', {}, { gate: b('lib/c.js'), packet: C.packet(p, b('lib/c.js').id, { root: tmp }), contract: p, root: tmp });
    let door = null; try { door = A.doorRoute({ kind: 'build:file.js', packet: null }); } catch (e) { door = e; }
    check('EA-01 agent adapter: the brick goes to the first routed agent, and the selected agent, the route and the verification are its evidence; the default route is the model door',
      one.ok && one.agent === 'ollama:qwen2.5-coder:7b' && /ollama.*→ claude/.test(one.evidence[`${b('lib/c.js').id}.route`]) && /^ok/.test(one.evidence[`${b('lib/c.js').id}.verified`]) && Array.isArray(door), String(door && door.message || ''));

    // EA-02 — over every learned budget → decompose; the scheduler splits a brick that has pieces
    const tight = A.agentExecutor({ route: () => [{ provider: 'small' }], dispatch, boundaries: { budget: () => 1 } });
    const d = await tight('lib/a.js', {}, { gate: b('lib/a.js'), packet: C.packet(p, b('lib/a.js').id, { root: tmp }), contract: p, root: tmp });
    const Ld = built();
    const rd = await C.schedule(Ld.payload, { root: tmp, executors: { agent: tight, integrate }, maxRounds: 2 });
    check('EA-02 a brick bigger than every routed agent has passed is decomposed (split into its steps), never sent anyway',
      d.decompose && /passes reliably below/.test(d.why) && rd.log.some(l => l.status === 'SPLIT' && l.gate === Ld.payload.gates.find(g => g.file === 'lib/a.js' && !g.parent).id) && !rd.log.some(l => l.status === 'SPLIT' && /\.\d+$/.test(l.gate)), JSON.stringify(rd.log.slice(0, 3)));

    const one2 = await tight('lib/c.js', {}, { gate: b('lib/c.js'), packet: C.packet(p, b('lib/c.js').id, { root: tmp }), contract: p, root: tmp });
    check('EA-02b a brick over every budget that is one piece already is not blocked: it goes to the agents anyway, said on its route (escalation, not a silent stop)',
      one2.ok && /one piece, so tried anyway/.test(one2.evidence[`${b('lib/c.js').id}.route`]), JSON.stringify(one2));

    // EA-03 — no dispatcher: blocked/unsupported, not retried, not FAILED, not complete
    const Lu = built();
    const ru = await C.schedule(Lu.payload, { root: tmp, executors: { agent: A.agentExecutor({ boundaries: noBudget }), integrate } });
    const ua = Lu.payload.state.gates[Lu.payload.gates[0].id];
    check('EA-03 no executor available → reported blocked/unsupported, never retried, never FAILED, and the contract is not complete',
      ru.blocked.length === 2 && ru.blocked.every(x => /unsupported: no agent dispatcher/.test(x.why)) && ru.rounds === 1 && ua.status !== 'FAILED' && !ua.attempts && ru.complete === false, JSON.stringify(ru));

    // EA-04 + EA-06 overlap — the real lifecycle: independent bricks at once, a deliberate failure recovers, checkpoints saved
    const file = path.join(tmp, 'P1.contract');
    const saves = [];
    const run = async (Lx) => C.schedule(Lx.payload, { root: tmp, concurrency: 2, executors: { agent, integrate }, onCheckpoint: (px, g) => { saves.push(g); C.save(file, Lx); } });
    const r1 = await run(L);
    const ida = b('lib/a.js').id, idb = b('lib/b.js').id, idc = b('lib/c.js').id;
    const overlap = spans[ida] && spans[idc] && spans[ida][0] < spans[idc][1] && spans[idc][0] < spans[ida][1];
    check('EA-04 independent bricks overlap; a deliberately failed brick is retried and recovers; the phase completes',
      overlap && r1.log.some(l => l.gate === idb && l.status === 'FAILED') && r1.log.some(l => l.gate === idb && l.status === 'PASSED') && r1.complete === true, JSON.stringify({ spans, log: r1.log.map(l => `${l.gate}:${l.status}`) }));

    // EA-06 — change an input after checkpointing: only that brick and what depends on it re-run
    write('lib/a.js', 'module.exports = { x: 1 };\n');
    const o6 = A.openCheckpoint(file, built(), { root: tmp });
    calls.length = 0;
    const r6 = await run(o6.loaded);
    check('EA-06 a changed input after a checkpoint: that brick and its dependents are STALE and re-run; the unrelated brick keeps its checkpoint',
      o6.resumed && o6.stale.includes(ida) && o6.stale.includes(idb) && o6.kept.includes(idc) && calls.includes(ida) && calls.includes(idb) && !calls.includes(idc) && r6.complete, JSON.stringify({ o6: { ...o6, loaded: undefined }, calls }));

    // EA-07 — a changed plan rejects the checkpoint (archived, never deleted)
    const plan2 = JSON.parse(JSON.stringify(plan)); plan2.files[2].exports.push({ name: 'w' });
    const o7 = A.openCheckpoint(file, A.fromPhasePlan(plan2, { phaseKey: 'P1', inputs: [{ id: 'map', path: 'docs/x-phasemap.spec' }], root: tmp }), { root: tmp });
    check('EA-07 a stale checkpoint (the plan changed) is rejected: archived beside it, and the build starts fresh',
      !o7.resumed && o7.rejected && /plan changed/.test(o7.rejected.why) && fs.existsSync(o7.rejected.archived) && !fs.existsSync(file));

    // EA-08 — the phase cannot pass until integration succeeds
    integrated = 'unmet 1/2: lib/b.js does not load';
    const L8 = built();
    const r8 = await C.schedule(L8.payload, { root: tmp, executors: { agent, integrate } });
    const e8 = C.evaluate(L8.payload, { root: tmp });
    check('EA-08 every brick passed but the integration is unmet → the phase does not pass and the contract is not complete',
      e8.gates.filter(g => g.id !== 'phase').every(g => g.status === 'PASSED') && e8.gates.find(g => g.id === 'phase').status === 'FAILED' && r8.complete === false && (r8.failed || []).includes('phase'), JSON.stringify(r8.log.map(l => `${l.gate}:${l.status}`)));

    // EA-09 — the audit: every brick, dependency, checkpoint and gate
    const au = A.audit(o6.loaded.payload, { root: tmp });
    check('EA-09 the audit records every brick (with its agent and attempts), every dependency edge, every checkpoint and every gate',
      au.bricks.length === 3 && au.bricks.every(x => x.agent && x.status === 'PASSED') && au.dependencies.some(e => e.from === ida && e.to === idb)
      && au.checkpoints.length >= 6 && au.gates.length === 4 && au.complete, JSON.stringify({ ...au, why: undefined }).slice(0, 600));
    // §GT1 — gates classify before they learn: a planted failure of each class takes its own path; only capability and
    // context failures change routing or budgets
    const learned = { door: [], friction: [], bounds: [] };
    const learners = { door: (o) => learned.door.push(o), friction: (cls) => learned.friction.push(cls) };
    const realRecord = C.Boundaries.record;
    C.Boundaries.record = (row) => { learned.bounds.push(row); };
    const reset = () => { learned.door.length = 0; learned.friction.length = 0; learned.bounds.length = 0; };
    const plant = async (fileOf, fails, { mutate = null } = {}) => {
      const Lg = built(); if (mutate) mutate(Lg.payload);
      const g = Lg.payload.gates.find(x => x.file === fileOf && !x.parent);
      const seen = []; const queue = [...fails];
      const disp = async (hops, { gate, feedback }) => {
        seen.push({ gate: gate.id, first: hops[0].provider, feedback: feedback || null });
        if (gate.id === g.id && queue.length) return { provider: hops[0].provider, ...queue.shift() };
        return { ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok' } };
      };
      const ag = A.agentExecutor({ route: () => [{ provider: 'small' }, { provider: 'big' }], dispatch: disp, boundaries: noBudget });
      reset();
      const r = await C.schedule(Lg.payload, { root: tmp, executors: { agent: ag, integrate }, learners });
      const ev = Lg.payload.state.evidence || {};
      const st = Lg.payload.state.gates[g.id] || {};
      return { r, g, ev, st, seen: seen.filter(x => x.gate === g.id), bounds: learned.bounds.filter(x => x.ok === false), door: [...learned.door], friction: [...learned.friction] };
    };
    integrated = 'met 2/2';
    try {
      const t = await plant('lib/c.js', [{ ok: false, transient: true, error: 'timed out after 120s' }, { ok: false, error: 'ETIMEDOUT' }]);
      check('GT-01 transient (timed out, flagged or by its text): retried on the same agent, no retry spent, nothing learned about route or size',
        t.ev[`${t.g.id}.class`] === 'transient' && t.seen.length === 3 && t.seen.every(x => x.first === 'small') && t.st.status === 'PASSED' && t.st.attempts === 1
        && !t.bounds.length && !t.door.length && !t.ev[`${t.g.id}.exclude`] && t.friction.filter(c => c === 'transient').length === 2 && t.r.complete, JSON.stringify({ seen: t.seen, st: t.st, b: t.bounds.length, d: t.door }));

      const c = await plant('lib/c.js', [{ ok: false, error: 'the export z is missing' }]);
      check('GT-02 capability: the next attempt skips the agent that failed (escalation), the door\'s order learns it, Boundaries learns a size lesson, and the retry carries the check\'s words',
        c.ev[`${c.g.id}.class`] === 'capability' && JSON.parse(c.ev[`${c.g.id}.exclude`]).join() === 'small' && c.seen[1].first === 'big' && /failed it before, skipped: small/.test(c.ev[`${c.g.id}.route`])
        && c.door.length === 1 && c.door[0].provider === 'small' && c.door[0].class === 'capability' && c.door[0].verdict === 'failed' && c.bounds.length === 1 && c.bounds[0].agent === 'small'
        && /^capability: /.test(c.seen[1].feedback || '') && c.r.complete, JSON.stringify({ seen: c.seen, door: c.door, ev: c.ev[`${c.g.id}.route`] }));

      const x = await plant('lib/a.js', [{ ok: false, error: 'maximum context length is 8192 tokens' }]);
      check('GT-03 context: a brick with pieces is split at once; Boundaries learns the size; the route is not touched',
        x.ev[`${x.g.id}.class`] === 'context' && x.r.log.some(l => l.gate === x.g.id && l.status === 'SPLIT' && /^context: /.test(l.reasons[0])) && x.bounds.length === 1 && !x.door.length && !x.ev[`${x.g.id}.exclude`] && x.r.complete,
        JSON.stringify(x.r.log.map(l => `${l.gate}:${l.status}`)));

      const s = await plant('lib/c.js', [], { mutate: (pp) => { pp.gates.find(g => g.file === 'lib/c.js' && !g.parent).pass_when.push({ test: 'tests/no-such.test.js' }); } });
      check('GT-04 spec: a gate naming a test that does not exist becomes a question for a person — not retried, nothing learned, the contract not complete',
        s.ev[`${s.g.id}.class`] === 'spec' && /^spec: test tests\/no-such\.test\.js does not exist/.test(s.ev[`${s.g.id}.question`]) && s.st.attempts === 1 && s.seen.length === 1
        && s.r.blocked.some(b2 => b2.id === s.g.id) && !s.bounds.length && !s.door.length && s.r.complete === false, JSON.stringify({ st: s.st, blocked: s.r.blocked }));

      const tl = await plant('lib/c.js', [{ ok: false, error: '3 tool calls failed in a row' }]);
      check('GT-05 tool: failing tool calls set the brick aside with a question — not retried, no route or size lesson',
        tl.ev[`${tl.g.id}.class`] === 'tool' && /^tool: /.test(tl.ev[`${tl.g.id}.question`]) && tl.seen.length === 1 && !tl.bounds.length && !tl.door.length && tl.r.complete === false);

      const v = C.classifyFailure({ out: { ok: true }, result: { reasons: ['test tests/x.test.js exited null'] } });
      const all = [C.classifyFailure({ out: { unsupported: true } }).cls, C.classifyFailure({ result: { reasons: ['unverifiable: CK-9 has no executable check here yet'] } }).cls,
        C.classifyFailure({ out: { ok: false, error: 'not connected: no claude tab open' } }).cls, C.classifyFailure({ out: { ok: false, error: 'response truncated mid_sentence' } }).cls,
        C.classifyFailure({ out: { ok: true }, result: { reasons: ['evidence "x" does not match /y/'] } }).cls];
      check('GT-06 the classifier: a check whose runner died is verification; unsupported is tool; unverifiable is spec; a missing tab is transient; truncation is context; a failed check is capability',
        v.cls === 'verification' && all.join() === 'tool,spec,transient,context,capability' && C.FAILURE_CLASSES.length === 6, JSON.stringify([v, all]));

      const ex = await A.agentExecutor({ route: () => [{ provider: 'small' }], dispatch: async (h) => ({ ok: true, provider: h[0].provider }), boundaries: noBudget, sizeOf: () => 10 })
        ('lib/c.js', {}, { gate: b('lib/c.js'), packet: {}, contract: { state: { evidence: { [`${b('lib/c.js').id}.exclude`]: '["small"]' } } }, root: tmp });
      check('GT-07 every routed agent failed it before → all are tried again, said on the route (escalation, never a silent block)',
        ex.ok && ex.agent === 'small' && /every routed agent failed it before/.test(ex.evidence[`${b('lib/c.js').id}.route`]), JSON.stringify(ex));

      // GT-08 (§GT1a 0.60.35) — a ladder climbed to its end (transient AND exhausted) spends its attempt: before the fix
      // each such failure was refunded, so a failing brick re-climbed every agent up to retry_limit more times
      const Lx = built(); Lx.payload.failure = { retry_limit: 2 };
      const gx = Lx.payload.gates.find(x => x.file === 'lib/c.js' && !x.parent);
      let climbs = 0;
      const exAgent = A.agentExecutor({ route: () => [{ provider: 'small' }, { provider: 'big' }], boundaries: noBudget,
        dispatch: async (hops, { gate }) => { if (gate.id === gx.id) { climbs++; return { ok: false, provider: 'big', transient: true, exhausted: true, error: 'every rung failed' }; } return { ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok' } }; } });
      reset();
      const rx = await C.schedule(Lx.payload, { root: tmp, executors: { agent: exAgent, integrate }, learners, maxRounds: 12 });
      check('GT-08 a ladder climbed to its end spends its attempt (no free re-climbs): the brick stops after retry_limit climbs',
        climbs === 2 && (rx.failed || []).includes(gx.id) && Lx.payload.state.gates[gx.id].attempts === 2, JSON.stringify({ climbs, failed: rx.failed, st: Lx.payload.state.gates[gx.id] }));
    } finally { C.Boundaries.record = realRecord; }

    const CMD = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    check('EA-10 every agent has the audit: contract.audit is a command row', CMD.includes("key: 'contract.audit'"));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
