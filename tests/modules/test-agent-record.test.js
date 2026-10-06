'use strict';
/**
 * tests/modules/test-agent-record.test.js — §0.39.361 AR1: Nexus learns each agent's strengths and limits from the phases
 * it built, and orders the phase ladder by them.
 * James: "like needs to learn from this: routing and adapting" — BL15: chatgpt replied a bare path (James reverted it);
 * then every rung timed out, 3b → 7b → 16b → gemini → chatgpt → claude → deepseek.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const AR = require(path.join(ROOT, 'lib', 'agent-record.js'));
const PR = require(path.join(ROOT, 'lib', 'pipeline-routing.js'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

console.log('\ntest-agent-record\n');
const t0 = Date.parse('2026-10-06T10:00:00Z');
const TO = 'timed out after 90000ms — no gate reported yet';
let k = 0;
const run = (provider, state, extra = {}) => { const runId = `phrun-${++k}`; const ts = t0 + k * 60000;
  return [{ runId, state: 'building', promptChars: extra.chars || 16000, ts: ts - 1000, phase: extra.phase || 'BL15' },
    { runId, state, provider, ts, phase: extra.phase || 'BL15', targetRepo: 'R', ...(state === 'replied' ? { injects: { injected: extra.files || ['lib/agent-tools/index.js'] } } : {}), ...(extra.error ? { error: extra.error } : {}), ...(extra.row || {}) }]; };

const rows = [
  // BL15: chatgpt "replied" a bare path — James reverted it
  ...run('chatgpt', 'replied'),
  // every Ollama rung and the others time out on a 16k request
  ...run('ollama:qwen2.5-coder:3b', 'failed', { error: TO }), ...run('ollama:qwen2.5-coder:3b', 'failed', { error: TO, chars: 9000 }),
  ...run('ollama:qwen2.5-coder:7b', 'incomplete', { row: { unchanged: true } }),
  ...run('gemini', 'failed', { error: TO }),
  // claude lands twice, one proven; deepseek lands once
  ...run('claude', 'replied', { phase: 'BL9', files: ['a.js'] }), ...run('claude', 'replied', { phase: 'BL10', files: ['b.js'] }),
  ...run('deepseek', 'replied', { phase: 'BL17', files: ['c.js'], chars: 3000 }),
  // the 3b landed a small one
  ...run('ollama:qwen2.5-coder:3b', 'replied', { phase: 'BL22', files: ['d.js'], chars: 2500 }),
];
// claude's BL10 run was proven
const claudeB10 = rows.find(r => r.phase === 'BL10' && r.provider === 'claude');
rows.push({ runId: `${claudeB10.runId}-proof`, buildRunId: claudeB10.runId, state: 'proven', ts: claudeB10.ts + 5000 });
const chatRow = rows.find(r => r.provider === 'chatgpt' && r.state === 'replied');
const injects = [{ path: 'lib/agent-tools/index.js', status: 'reverted', createdAt: chatRow.ts - 2000, repoUuid: 'R' }];

const rec = AR.record(rows, { injects });
const P = rec.providers;
check('AR-01 every agent that attempted a phase has a record', ['chatgpt', 'ollama:qwen2.5-coder:3b', 'ollama:qwen2.5-coder:7b', 'gemini', 'claude', 'deepseek'].every(p => P[p]), Object.keys(P).join(','));
check('AR-02 a change the person reverted counts against the agent that wrote it (undone, not landed)', P.chatgpt.undone === 1 && P.chatgpt.landed === 0, JSON.stringify(P.chatgpt));
check('AR-03 a proof that passed counts for the agent that built it', P.claude.proven === 1 && P.claude.landed === 2);
check('AR-04 failures keep their cause (timeout, incomplete)', P.gemini.byClass.timeout === 1 && P['ollama:qwen2.5-coder:7b'].byClass.incomplete === 1, JSON.stringify(P.gemini.byClass));
check('AR-05 a limit: the 3b failed twice at 9000+ chars and only ever landed 2500 → limited from 9000',
  P['ollama:qwen2.5-coder:3b'].limit && P['ollama:qwen2.5-coder:3b'].limit.from === 9000 && P['ollama:qwen2.5-coder:3b'].maxLanded === 2500, JSON.stringify(P['ollama:qwen2.5-coder:3b'].limit));
check('AR-06 one failure is not a limit', !P.gemini.limit);

const rungs = PR.ladder({ ...PR.DEFAULTS, ollamaModels: ['qwen2.5-coder:3b', 'qwen2.5-coder:7b'] }).rungs;
const big = AR.orderLadder(rungs, rec, { promptChars: 16000, minRecords: 2 });
const order = big.rungs.map(r => r.provider);
check('AR-07 a big request: the agent that lands and proves goes first', order[0] === 'claude', order.join(' → '));
check('AR-08 an agent past its size limit goes last, said why', order[order.length - 1] === 'ollama:qwen2.5-coder:3b' && /past its limit/.test(big.why.find(w => w.provider === 'ollama:qwen2.5-coder:3b').why), order.join(' → '));
check('AR-09 an agent tried too little to judge keeps its place at 0.5 (still learning)', big.why.find(w => w.provider === 'gemini').score === 0.5 && /still learning|not tried/.test(big.why.find(w => w.provider === 'gemini').why));
const small = AR.orderLadder(rungs, rec, { promptChars: 2000, minRecords: 2 });
check('AR-10 a small request: the 3b is not past its limit there', !small.why.find(w => w.provider === 'ollama:qwen2.5-coder:3b').limited);
const none = AR.orderLadder(rungs, AR.record([]), { promptChars: 16000 });
check('AR-11 nothing learned → the ladder exactly as configured', !none.changed && none.rungs.map(r => r.provider).join() === rungs.map(r => r.provider).join());
check('AR-12 routing.ladder_learn reads from config, on by default', PR.policyFrom({}).ladderLearn === true && PR.policyFrom({ ladder_learn: false }).ladderLearn === false);

// wiring
const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
check('AR-20 a phase build orders its ladder by the record and keeps the route on its building row',
  /AR\.orderLadder\(rungs, AR\.record\(loadTable\('idearium_phase_runs'\)/.test(idx) && /state: 'building'[^\n]*promptChars: message\.length,\s*\n\s*\.\.\.\(rungs\.length \? \{ route:/.test(idx));
check('AR-21 every attempt row carries its request size', /elapsedMs: r && r\.elapsedMs \|\| null, promptChars: message\.length/.test(idx));
check('AR-22 GET /api/routing/agents serves the record', /\['api','routing','agents'\], 'routing\.agents'/.test(idx) && /case 'routing\.agents'/.test(idx));
const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
check('AR-23 the Plan shows each run\'s route and the agents table', /function _ppRoute\(r\)/.test(pp) && /\$\{_ppRoute\(l\.route\)\}/.test(pp) && /async function ppAgentsLoad/.test(pp));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
