'use strict';
/**
 * tests/modules/test-agent-record.test.js — §0.39.361 AR1: Nexus learns each agent's strengths and limits from the phases
 * it built, and orders the phase ladder by them.
 * James: "like needs to learn from this: routing and adapting" — BL15: chatgpt replied a bare path (James reverted it);
 * then every rung timed out, 3b → 7b → 16b → gemini → chatgpt → claude → deepseek.
 */
require('../../lib/test-sandbox.js').ensure();
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
  /AR\.orderLadder\(rungs, AR\.record\(loadTable\('idearium_phase_runs'\)/.test(idx) && /state: 'building'[^\n]*promptChars: message\.length,[\s\S]{0,400}\.\.\.\(rungs\.length \? \{ route:/.test(idx));
check('AR-21 every attempt row carries its request size', /elapsedMs: r && r\.elapsedMs \|\| null, promptChars: msg\.length/.test(idx));   // §0.39.361 SB51 — the size of the request actually sent (a chunk or the whole phase)
check('AR-22 GET /api/routing/agents serves the record', /\['api','routing','agents'\], 'routing\.agents'/.test(idx) && /case 'routing\.agents'/.test(idx));
const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
check('AR-23 the Plan shows each run\'s route and the agents table', /function _ppRoute\(r\)/.test(pp) && /\$\{_ppRoute\(l\.route\)\}/.test(pp) && /async function ppAgentsLoad/.test(pp));


// ── AR2: failure modes and faults are first-class data (lib/phase-faults.js → lib/fault-log.js) ──
const PF = require(path.join(ROOT, 'lib', 'phase-faults.js'));
check('AR-30 each fault row has its failure mode', PF.modeOf({ state: 'failed', error: TO }) === 'timeout' && PF.modeOf({ state: 'incomplete', unchanged: true }) === 'wrote-nothing'
  && PF.modeOf({ state: 'incomplete', absent: ['a.js'] }) === 'missed-files' && PF.modeOf({ state: 'refused', error: 'no snapshot: down' }) === 'no-snapshot'
  && PF.modeOf({ state: 'failed', toolErrors: true }) === 'tool-errors' && PF.modeOf({ state: 'unproven' }) === 'unproven');
check('AR-31 a row that is not a fault logs nothing (building, replied, escalating, proven)', ['building', 'replied', 'escalating', 'retrying', 'proven'].every(st => PF.faultsOf({ state: st }).length === 0));
const ex = PF.faultsOf({ uuid: 'phrun-x-r7t1-failed', runId: 'phrun-x', state: 'failed', provider: 'deepseek', phase: 'BL15', map: 'docs/m.spec', error: TO, promptChars: 16613, rung: 7, rungs: 7, ladderExhausted: true });
check('AR-32 a fault carries the agent, the phase, the request size, the error and what caused it', ex[0].agent === 'deepseek' && ex[0].faultClass === 'timeout' && ex[0].intent === 'BL15'
  && ex[0].meta.promptChars === 16613 && /90000ms/.test(ex[0].meta.error) && ex[0].causedBy === 'phrun-x-r7t1-failed' && ex[0].component === 'idearium.phase.build');
check('AR-33 every rung tried is also its own fault, of no one agent', ex.length === 2 && ex[1].faultClass === 'ladder-exhausted' && ex[1].agent === null);

const written = PF.log({ uuid: 'phrun-t-failed', runId: 'phrun-t', state: 'failed', provider: 'gemini', phase: 'AR_TEST_PHASE', error: TO, promptChars: 12000 });
const back = PF.list({ phase: 'AR_TEST_PHASE' });
check('AR-34 logged into fault_log and read back whole', written.length === 1 && back.some(f => f.uuid === written[0].uuid && f.mode === 'timeout' && f.agent === 'gemini' && f.meta.promptChars === 12000), `${written.length} written, ${back.length} back`);
PF.logInject({ mode: 'undone', node: { uuid: 'inj-1', path: 'lib/agent-tools/index.js', repoUuid: 'R', hatName: 'chatgpt' }, reason: 'reverted by the person' });
check('AR-35 an undone agent change is its own fault record', PF.list({ agent: 'chatgpt' }).some(f => f.mode === 'undone' && f.meta.path === 'lib/agent-tools/index.js'));

const prec = PF.precedent('BL15', [
  { uuid: 'f1', ts: t0, agent: 'chatgpt', mode: 'reply-collapse', phase: 'BL15', meta: { phase: 'BL15' } },
  { uuid: 'f2', ts: t0 + 1, agent: 'deepseek', mode: 'timeout', phase: 'BL15', meta: { phase: 'BL15', promptChars: 16613 } },
  { uuid: 'f3', ts: t0 + 2, agent: 'claude', mode: 'timeout', phase: 'BL9', meta: { phase: 'BL9' } }]);
check('AR-36 before acting: this phase\'s faults, in words the next agent can use, under 600 chars', prec.faults.length === 2 && /only a path/.test(prec.text) && /deepseek timed out \(request 16613 chars\)/.test(prec.text) && !/claude/.test(prec.text) && prec.text.length <= 600, prec.text);
check('AR-37 a phase that never failed adds nothing to the request', PF.precedent('NEVER', []).text === '');

const recF = AR.record(rows, { injects, faults: [{ uuid: 'f2', ts: t0, agent: 'deepseek', mode: 'timeout', phase: 'BL15', meta: { promptChars: 16613, error: TO } }, { uuid: 'f9', ts: t0, agent: null, mode: 'ladder-exhausted', phase: 'BL15', meta: {} }] });
check('AR-38 an agent\'s record carries its faults whole, and its modes', recF.providers.deepseek.faults[0].uuid === 'f2' && recF.providers.deepseek.faults[0].promptChars === 16613 && recF.providers.deepseek.modes.timeout === 1);
check('AR-39 a fault of no one agent is kept, not dropped', recF.unassigned.length === 1 && recF.unassigned[0].mode === 'ladder-exhausted');

check('AR-40 every phase-run row written goes through the fault hook', /function appendRow\(table, row\) \{\s*const out = _appendRowRaw\(table, row\);\s*if \(table === 'idearium_phase_runs'\) \{ try \{ _require\('\.\.\/\.\.\/lib\/phase-faults\.js'\)\.log\(row\)/.test(idx));
check('AR-41 a phase build reads its precedent before acting, hands it to the agent and keeps it on the building row', /precedent = _require\('\.\.\/\.\.\/lib\/phase-faults\.js'\)\.precedent\(phase\)/.test(idx) && /\[req\.message, precedent\.text/.test(idx) && /precedent: precedent\.faults\.map/.test(idx));
const ri = fs.readFileSync(path.join(ROOT, 'lib/repo-inject.js'), 'utf8');
check('AR-42 a collapsed reply and an undone agent change are logged from repo-inject', /mode: 'reply-collapse'/.test(ri) && (ri.match(/_undoneFault\(n, '(reverted|rejected)'/g) || []).length === 3);
check('AR-43 the Plan shows a run\'s precedent and each agent\'s faults', /function _ppPrecedent\(p\)/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8')) && /_ppFaultRow/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8')));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
