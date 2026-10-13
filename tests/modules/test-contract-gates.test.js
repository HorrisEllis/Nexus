'use strict';
/**
 * tests/modules/test-contract-gates.test.js — 0.60.15 — .contract v2, against his four acceptance conditions
 * (docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec CT0):
 *   CC-01  backward compatibility — the REAL legacy .contract files load and stay v1
 *   CC-02…05  evidence-driven evaluation — missing proof is never a pass; free sentences are unverifiable
 *   CC-06  reliable invalidation — a changed ref makes its gates and only their downstream STALE
 *   CC-07  the packet is one gate's context only
 *   (self-hosting — CT0's own contract — is tests/modules/test-contract-ct0-self.test.js: CT0's verify gate runs THIS file)
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

(async () => {
  console.log('\ntest-contract-gates\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-cg-'));
  try {
    const C = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
    const NE = require(path.join(ROOT, 'lib/node-export.js'));

    // CC-01 — every real legacy contract in the tree, read-only
    const legacy = [];
    for (const d of ['cortex/input', 'cortex/output', 'guardian/input', 'guardian/output']) {
      const dir = path.join(ROOT, d);
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.contract')) legacy.push(path.join(dir, f));
    }
    const results = legacy.map(f => { const before = fs.readFileSync(f, 'utf8'); const L = C.load(f); const ev = C.evaluate(L.payload); return { f, L, ev, same: fs.readFileSync(f, 'utf8') === before }; });
    check('CC-01 backward compatibility: every real legacy .contract loads as v1, evaluates as legacy (RAID runs it as before), validates, keeps its v1 fields, and is not rewritten',
      legacy.length >= 3 && results.every(r => r.L.legacy && r.ev.legacy && C.validate(r.L.payload).length === 0 && r.same && ['intention', 'contract', 'queueId'].some(k => k in r.L.payload)), `${legacy.length} files`);

    // a v2 contract in a sandbox root
    const write = (p, t) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), t); };
    write('src/a.js', 'module.exports = 1;\n// line 2\n// line 3\n');
    write('src/b.js', 'module.exports = 2;\n');
    write('t/ok.test.js', 'process.exit(0)');
    write('t/bad.test.js', 'console.log("nope"); process.exit(1)');
    const make = () => ({
      v: 2, uuid: 'demo',
      outcome: { what: 'a and b wired', why: 'the test', done_when: [{ gate: 'verify' }] },
      refs: { a: { path: 'src/a.js', lines: [1, 2] }, b: { path: 'src/b.js' } },
      invariants: [{ id: 'INV-1', says: 'a still exports 1', check: { gate: 'verify' } }],
      gaps: [],
      gates: [
        { id: 'ctx', type: 'context', requires: ['a', 'b'], pass_when: [{ exists: 'src/a.js' }, { exists: 'src/b.js' }] },
        { id: 'build', type: 'task', depends_on: ['ctx'], requires: ['a'], pass_when: [{ evidence: 'change_made', match: '^done' }] },
        { id: 'side', type: 'task', depends_on: ['ctx'], requires: ['b'], pass_when: [{ test: 't/ok.test.js' }] },
        { id: 'verify', type: 'verification', depends_on: ['build'], pass_when: [{ test: 't/ok.test.js' }, { gate: 'build' }] },
      ],
      failure: { retry_limit: 2 },
    });

    const bad = make(); bad.gates.push({ id: 'x', type: 'task', depends_on: ['nope'], requires: ['zzz'], pass_when: [] }); bad.gates[0].depends_on = ['verify'];
    const probs = C.validate(bad);
    check('CC-02 validate names every problem: an unknown ref, an unknown dependency, a gate with no conditions, a loop',
      probs.some(p => /ref "zzz"/.test(p)) && probs.some(p => /depends on "nope"/.test(p)) && probs.some(p => /no pass_when/.test(p)) && probs.some(p => /loop/.test(p)), JSON.stringify(probs));

    const p = make();
    let e = C.evaluate(p, { root: tmp });
    const st = (id) => e.gates.find(g => g.id === id).status;
    check('CC-03 order and readiness: the context gate is READY, everything after it BLOCKED (waits on), the contract not complete',
      st('ctx') === 'READY' && st('build') === 'BLOCKED' && st('verify') === 'BLOCKED' && e.complete === false);

    let r = await C.check(p, 'ctx', { root: tmp });
    r = await C.check(p, 'build', { root: tmp });
    check('CC-04 missing proof is never a pass: no evidence recorded → FAILED with the reason; wrong evidence → still FAILED',
      r.status === 'FAILED' && /no evidence recorded/.test(r.reasons.join()) && (C.record(p, 'change_made', 'not yet'), (await C.check(p, 'build', { root: tmp })).status === 'FAILED'));
    const free = make(); free.gates[1].pass_when = ['it looks finished'];
    await C.check(free, 'ctx', { root: tmp });
    const fr = await C.check(free, 'build', { root: tmp });
    check('CC-05 a free sentence is unverifiable and can never pass; a failing test fails; the retry limit stops a third try',
      fr.status === 'FAILED' && /unverifiable/.test(fr.reasons.join())
      && (await (async () => { const q = make(); q.gates[2].pass_when = [{ test: 't/bad.test.js' }]; await C.check(q, 'ctx', { root: tmp }); const a1 = await C.check(q, 'side', { root: tmp }); await C.check(q, 'side', { root: tmp }); const a3 = await C.check(q, 'side', { root: tmp }); return a1.status === 'FAILED' && /retry limit/.test(a3.reasons.join()); })()));

    p.failure.retry_limit = 5;   // CC-04 spent two attempts on purpose
    C.record(p, 'change_made', 'done: wired');
    await C.check(p, 'build', { root: tmp }); await C.check(p, 'side', { root: tmp }); await C.check(p, 'verify', { root: tmp });
    e = C.evaluate(p, { root: tmp });
    check('CC-05b real evidence passes each gate (recorded with the ref hashes it passed against); completion is derived — every gate, the invariant verified',
      e.gates.every(g => g.status === 'PASSED') && e.complete === true && p.state.gates.build.hashes.a && p.state.invariants['INV-1'] === 'verified', JSON.stringify(e.why));

    fs.appendFileSync(path.join(tmp, 'src/b.js'), '// changed\n');
    e = C.evaluate(p, { root: tmp });
    check('CC-06 a changed ref invalidates exactly its gates and their downstream: b changed → ctx and side STALE; build and verify (needing ctx) STALE; the contract not complete',
      st('ctx') === 'STALE' && st('side') === 'STALE' && st('build') === 'STALE' && e.complete === false && e.stale.join() === 'b', JSON.stringify(e.gates));
    const p2 = make();
    C.record(p2, 'change_made', 'done');
    for (const g of ['ctx', 'build', 'side', 'verify']) await C.check(p2, g, { root: tmp });
    fs.writeFileSync(path.join(tmp, 'src/a.js'), 'module.exports = 1;\n// line 2\n// line 3 edited\n');   // outside a's lines [1,2]
    const e2 = C.evaluate(p2, { root: tmp });
    check('CC-06b only what the gate referenced counts: an edit outside a ref\'s line range invalidates nothing; unrelated gates keep PASSED',
      e2.gates.every(g => g.status === 'PASSED'), JSON.stringify(e2.gates));

    const pk = C.packet(p2, 'build', { root: tmp });
    check('CC-07 the packet is one gate\'s context: its refs (a line range as an excerpt, with its hash), the evidence of the gate it depends on, the invariants — nothing of side or b',
      Object.keys(pk.refs).join() === 'a' && /module\.exports = 1/.test(pk.refs.a.excerpt) && pk.refs.a.hash && pk.upstream.ctx.status === 'PASSED' && !pk.refs.b && !JSON.stringify(pk).includes('"side"'));

    const sc = C.scaffold({ id: 'my-work', what: 'x' });
    const sf = path.join(tmp, 'my.contract'); fs.writeFileSync(sf, NE.toYaml(sc));
    check('CC-08 contract new: a v2 scaffold in the same envelope, valid, its three gates evaluable', C.load(sf).v === 2 && C.validate(C.load(sf).payload).length === 0 && C.evaluate(C.load(sf).payload, { root: tmp }).gates.length === 3);

    // CT1 — dynamic chunking
    const q = make(); q.gates[0].actions = ['read a', 'read b'];
    const kids = C.split(q, 'ctx', { by: 'requires' });
    const ev3 = C.evaluate(q, { root: tmp });
    const sg = (id) => ev3.gates.find(g => g.id === id).status;
    check('CC-11 split: one child per ref, each keeping its own condition and an evidence key; the parent becomes a phase that waits on its children; downstream unchanged; recorded',
      kids.join() === 'ctx.1,ctx.2' && q.gates.find(g => g.id === 'ctx.1').pass_when.some(c => c.exists === 'src/a.js') && q.gates.find(g => g.id === 'ctx').type === 'phase'
      && sg('ctx.1') === 'READY' && sg('ctx.2') === 'READY' && sg('ctx') === 'BLOCKED' && q.gates.find(g => g.id === 'build').depends_on.join() === 'ctx' && q.splits.length === 1 && C.validate(q).length === 0, JSON.stringify(ev3.gates));
    C.record(q, 'ctx.1.done', 'yes'); C.record(q, 'ctx.2.done', 'yes');
    await C.check(q, 'ctx.1', { root: tmp }); await C.check(q, 'ctx.2', { root: tmp });
    const pr = await C.check(q, 'ctx', { root: tmp });
    check('CC-12 the parent passes only when every child has, and its own conditions still hold', pr.status === 'PASSED' && pr.evidence.some(e => e.gate === 'ctx.1'));
    const big = make(); big.gates[0].actions = ['x', 'y'];
    const s1 = C.shouldSplit(big, 'ctx', { root: tmp, budget: 10 }), s2 = C.shouldSplit(big, 'ctx', { root: tmp, budget: 100000 }), s3 = C.shouldSplit(big, 'build', { root: tmp, budget: 1 });
    check('CC-13 shouldSplit: over the agent\'s budget → split; within → not; a one-ref one-action gate is already the smallest piece', s1.split && !s2.split && !s3.split && /smallest/.test(s3.why));
    for (let i = 0; i < 4; i++) C.Boundaries.record({ agent: 'small-model', kind: 'task', tokens: 1000 + i * 100, ok: true });
    C.Boundaries.record({ agent: 'small-model', kind: 'task', tokens: 1200, ok: false });
    const lb = C.Boundaries.budget('small-model', 'task');
    check('CC-14 boundaries are learned: from its passes and failures Nexus learns the size an agent handles (under its first failure); untried is null, not a guess',
      lb && lb <= 1200 && lb >= 960 && C.Boundaries.budget('never-seen', 'task') === null, String(lb));
    // 0.60.17 — the reviewer's adversarial cases and the scheduler
    const cyc = make(); cyc.gates[0].depends_on = ['verify'];
    check('CC-15 adversarial: a dependency cycle is refused by validate, naming the loop', C.validate(cyc).some(x => /loop/.test(x)));
    const ad = make(); ad.failure.retry_limit = 9;
    C.split(ad, 'ctx', { by: 'requires' });
    C.record(ad, 'ctx.1.done', 'y'); C.record(ad, 'ctx.2.done', 'y');
    await C.check(ad, 'ctx.1', { root: tmp });
    fs.writeFileSync(path.join(tmp, 'src/a.js'), 'module.exports = 11;\n// line 2\n// line 3\n');   // ctx.1's input (lines 1–2) changes while ctx.2 is still to run
    await C.check(ad, 'ctx.2', { root: tmp });
    const evm = C.evaluate(ad, { root: tmp });
    const sm = (id) => evm.gates.find(g => g.id === id).status;
    check('CC-16 adversarial: a child whose input goes stale mid-execution reads STALE and holds its parent back (the parent cannot pass on a stale piece)',
      sm('ctx.1') === 'STALE' && sm('ctx.2') === 'PASSED' && sm('ctx') === 'BLOCKED' && (await C.check(ad, 'ctx', { root: tmp })).status === 'BLOCKED');
    const ig = make(); ig.gates[0].pass_when = [{ gate: 'nope-never' }].slice(0, 0); ig.gates[0].pass_when = [{ evidence: 'ctx.done' }];
    C.split(ig, 'ctx', { by: 'requires' });
    const parent = ig.gates.find(g => g.id === 'ctx');
    C.record(ig, 'ctx.1.done', 'y'); C.record(ig, 'ctx.2.done', 'y');
    await C.check(ig, 'ctx.1', { root: tmp }); await C.check(ig, 'ctx.2', { root: tmp });
    const before = await C.check(ig, 'ctx', { root: tmp });
    C.record(ig, 'ctx.integrated', 'combined output verified');
    const after = await C.check(ig, 'ctx', { root: tmp });
    check('CC-17 adversarial: every child passed but the integration is not proven → the parent FAILS; proven integration → it passes (and validate refuses a split parent with no integration check)',
      parent.integration === 'ctx.integrated' && before.status === 'FAILED' && /ctx\.integrated/.test(before.reasons.join()) && after.status === 'PASSED'
      && C.validate({ v: 2, outcome: { what: 'x' }, refs: {}, gates: [{ id: 'k', type: 'task', pass_when: [{ evidence: 'k.done' }] }, { id: 'p', type: 'phase', children: ['k'], depends_on: ['k'], pass_when: [{ gate: 'k' }] }] }).some(x => /no integration check/.test(x)));
    const tv = make(); tv.gates[1].actions = ['one', 'two']; tv.gates[1].pass_when = ['looks right'];
    const td = make(); td.gates[1].actions = ['x', 'y', 'z']; td.gates[1].requires = ['a', 'b'];
    const kids2 = (() => { const k = make(); k.gates[0].actions = ['read a', 'read b']; C.split(k, 'ctx', { by: 'requires' }); return k.gates.find(g => g.id === 'ctx.1'); })();
    check('CC-18 more split triggers: a gate that cannot be verified as written, and separable work; each child carries the original requirement',
      /verification/.test(C.shouldSplit(tv, 'build', { root: tmp, budget: 1e9 }).why) && /dependency/.test(C.shouldSplit(td, 'build', { root: tmp, budget: 1e9 }).why)
      && kids2.requirement && kids2.requirement.gate === 'ctx' && kids2.requirement.outcome === 'a and b wired');
    // the scheduler: independent bricks at once, dependents after, outputs recorded, a missing executor said
    write('src/a.js', 'module.exports = 1;\n// line 2\n// line 3\n');
    const sc2 = make();
    sc2.gates[1].run = { tool: 'slow', args: { ms: 120 } }; sc2.gates[1].pass_when = [{ evidence: 'build.done' }];
    sc2.gates[2].run = { tool: 'slow', args: { ms: 120 } }; sc2.gates[2].pass_when = [{ evidence: 'side.done' }];
    sc2.gates.push({ id: 'browser', type: 'task', depends_on: ['ctx'], run: { glass: 'readPage' }, pass_when: [{ evidence: 'browser.done' }], optional: true });
    const spans = {};
    const res = await C.schedule(sc2, { root: tmp, executors: { tool: async (name, args, { gate }) => { spans[gate.id] = [Date.now()]; await new Promise(r => setTimeout(r, args.ms)); spans[gate.id].push(Date.now()); return { ok: true, name }; } } });
    const overlap = spans.build && spans.side && spans.build[0] < spans.side[1] && spans.side[0] < spans.build[1];
    const se = C.evaluate(sc2, { root: tmp });
    check('CC-19 the scheduler runs every READY brick — independent ones at the same time — records each output as evidence, checks each gate, and finishes when the evaluator says; a brick with no executor for its kind is reported blocked/unsupported (0.60.18: not waiting, never retried, never FAILED)',
      overlap && se.gates.filter(g => g.id !== 'browser').every(g => g.status === 'PASSED') && sc2.state.evidence['build.output'] && res.complete === true && res.blocked.some(w => w.id === 'browser' && /no executor/.test(w.why)) && !res.waiting.some(w => w.id === 'browser') && sc2.state.gates.browser.status !== 'FAILED' && !sc2.state.gates.browser.attempts, JSON.stringify({ spans, why: res.why, waiting: res.waiting, blocked: res.blocked }));
    const CMD = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    check('CC-10 every agent has it: contract new · gates · packet · check · evidence · status', ['contract.new', 'contract.gates', 'contract.packet', 'contract.check', 'contract.evidence', 'contract.status', 'contract.split', 'contract.budget', 'contract.run'].every(k => CMD.includes(`key: '${k}'`)));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
