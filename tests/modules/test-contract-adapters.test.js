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
    const CMD = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    check('EA-10 every agent has the audit: contract.audit is a command row', CMD.includes("key: 'contract.audit'"));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
