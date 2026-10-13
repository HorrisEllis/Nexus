'use strict';
/**
 * tests/modules/test-phase-cost.test.js — 0.60.27 AG1a — lib/phase-cost.js on its own. James: "as little as possible."
 * The live count over a real build is CP-06 in test-contract-phase-build (counted calls === dispatches the agent saw).
 */
const path = require('path');
const PC = require(path.join(__dirname, '../../lib/phase-cost.js'));
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

console.log('\ntest-phase-cost\n');
const rows = [
  { runId: 'r1', state: 'building', ts: 1 },
  { runId: 'r1', state: 'planning', provider: 'claude', tokensIn: 1000, ts: 2 },
  { runId: 'r1', state: 'planned', provider: 'claude', ts: 3 },
  { runId: 'r1', state: 'failed', provider: 'ollama:qwen2.5-coder:7b', rung: 1, tokensIn: 400, tokensOut: 0, ts: 4 },
  { runId: 'r1', state: 'retrying', provider: 'ollama:qwen2.5-coder:7b', ts: 5 },
  { runId: 'r1', state: 'replied', provider: 'ollama:qwen2.5-coder:7b', rung: 1, tokensIn: 400, tokensOut: 300, ts: 6 },
  { runId: 'r1', state: 'escalating', provider: 'chatgpt', ts: 7 },
  { runId: 'r1', state: 'failed', chunkStopped: true, ts: 8 },
  { runId: 'r1-review', state: 'reviewing', reviewer: 'gemini', tokensIn: 600, ts: 9 },
  { runId: 'r1-review', state: 'reviewed', provider: 'gemini', tokensOut: 200, ts: 10 },
  { runId: 'r1-proof', state: 'proven', ts: 11 },
  { runId: 'r0', state: 'replied', provider: 'chatgpt', promptChars: 800, replyChars: 400, ts: 0 },   // an older row: no estimates
];
const c = PC.costOf(rows);
check('PCO-01 only calls count: planner, each coder attempt, the reviewer; retrying/escalating/chunk-stopped/proof rows are not calls',
  c.calls === 5 && c.byRole.plan === 1 && c.byRole.code === 3 && c.byRole.review === 1, JSON.stringify(c.byRole));
check('PCO-02 local vs remote: an Ollama model is local; claude, chatgpt and gemini are remote', c.local === 2 && c.remote === 3, `${c.local}/${c.remote}`);
check('PCO-03 tokens: estimates from the source, the review answer folded into its call, chars/4 for an older row, and the method says so',
  c.tokensIn === 1000 + 400 + 400 + 600 + 200 && c.tokensOut === 300 + 200 + 100 && /mixed/.test(c.method), JSON.stringify({ i: c.tokensIn, o: c.tokensOut, m: c.method }));
check('PCO-04 per run, newest first: a run\'s review belongs to that run', c.runs.length === 2 && c.runs[0].runId === 'r1' && c.runs[0].calls === 4 && c.runs[1].calls === 1, JSON.stringify(c.runs.map(r => [r.runId, r.calls])));
check('PCO-05 the line reads as one sentence', PC.line(c) === '5 calls (plan 1 · code 3 · review 1) · 2 local · 3 remote · ~2.6k tokens in, ~600 out' && PC.line(PC.costOf([])) === 'no agent calls yet', PC.line(c));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
