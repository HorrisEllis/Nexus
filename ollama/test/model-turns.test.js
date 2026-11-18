'use strict';
// ollama/test/model-turns.test.js — OL5b (docs/2026-11-18-ollama-local-agent-phasemap.spec). James, 2026-11-18: "okay. do it." ·
// "also what about saving performance metrics to a node file". node ollama/test/model-turns.test.js
const path = require('path');
const T = require(path.join(__dirname, '..', 'lib', 'model-turns.js'));
let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, why || ''); } };

(async () => {
  // pick: same model first; past the cap, the oldest whatever its model
  const W = (model, since) => ({ model, since });
  check('OL5b-1 the model already loaded goes next', T.pick([W('b', 1), W('a', 2)], 'a', 10, 1000) === 1);
  check('OL5b-2 no caller of it: the oldest', T.pick([W('b', 5), W('c', 1)], 'a', 10, 1000) === 1);
  check('OL5b-3 past the cap: the oldest goes first, whatever its model', T.pick([W('b', 0), W('a', 900)], 'a', 1000, 500) === 0);

  // run: three callers a, b, a while a runs → order a, a, b; one metric per turn, the swap marked
  let clock = 0; const nodes = []; const order = [];
  const turns = T.createTurns({ maxWaitMs: 60000, now: () => clock, freeMem: () => 1000, write: (n) => nodes.push(n) });
  let release; const first = turns.run('a', { caller: 'x', door: 'jobs' }, () => new Promise((r) => { release = r; }));
  const rest = [['b', 'b1'], ['a', 'a2'], ['b', 'b2']].map(([m, tag]) => turns.run(m, { caller: tag, door: 'generate' }, async () => { order.push(tag); clock += 5; return tag; }));
  clock = 10; release('a1'); await first; await Promise.all(rest);
  check('OL5b-4 a waiter for the loaded model jumps the line; models are batched', order.join() === 'a2,b1,b2', order.join());
  check('OL5b-5 one .metric node per turn, with wait, run, swap and memory', nodes.length === 4 && nodes.every((n) => n.type === 'metric' && n.payload && typeof n.payload.waitMs === 'number' && typeof n.payload.runMs === 'number' && 'swap' in n.payload && n.payload.freeMemMBBefore === 1000),
    JSON.stringify(nodes[0]));
  check('OL5b-6 only the change of model is a swap', nodes.map((n) => n.payload.swap).join() === 'false,false,true,false', nodes.map((n) => n.payload.swap).join());

  // a failed call still frees the line and is recorded
  const t2 = T.createTurns({ write: (n) => nodes.push(n) });
  let err = null; try { await t2.run('a', {}, async () => { throw new Error('boom'); }); } catch (e) { err = e; }
  const after = await t2.run('a', {}, async () => 'ok');
  check('OL5b-7 a failure is recorded and the line goes on', err && err.message === 'boom' && after === 'ok' && nodes[nodes.length - 2].payload.ok === false && nodes[nodes.length - 2].payload.error === 'boom');

  // the doors use the line
  const fs = require('fs'); const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  check('OL5b-8 the jobs and /api/generate wait their turn; /api/queue says the line', /model-turns\.js'\)\.shared\(\)\.run\(model/.test(src('lib/dispatch.js')) && /model-turns\.js'\)\.shared\(\)\.run\(_model/.test(src('routes/generate.js')) && /line: require\('\.\.\/lib\/model-turns\.js'\)/.test(src('routes/queue.js')));

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
