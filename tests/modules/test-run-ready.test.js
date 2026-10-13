'use strict';
/**
 * tests/modules/test-run-ready.test.js — 0.60.28 PF1 + PF2, on their own.
 * James (2026-10-13): "can we work on inventing anything that will get this pipeline going. like why doesn't this work
 * yet?" → "A then B". The live run through the real build route is CP-07/CP-08 in test-contract-phase-build.
 */
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const PRd = require(path.join(ROOT, 'guardian/lib/provider-ready.js'));
const RR = require(path.join(ROOT, 'lib/run-ready.js'));
const PP = require(path.join(ROOT, 'lib/phase-plan.js'));
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

console.log('\ntest-run-ready\n');
const now = Date.now();
// his SB9: claude waiting on his ◎ pick, deepseek behind a sign-in wall; plus a spent chain and a limit with no fallback
const g = PRd.readiness({
  ids: ['claude', 'chatgpt', 'gemini', 'deepseek', 'perplexity'],
  connected: { claude: 'connected', chatgpt: 'connected', gemini: null, deepseek: 'connected', perplexity: 'connected' },
  channels: { perplexity: { usage: { limited: true, message: 'You have reached your limit' } } },
  login: { deepseek: 'Sign up · Log in' },
  jobs: [{ provider: 'claude', status: 'failed', failedAt: now - 60000, needsYou: 'pick the reply with ◎' }],
  chains: { chatgpt: { chain: ['a1', 'a2'], exhausted: [{ account: 'a1', until: now + 3600e3 }, { account: 'a2', until: now + 7200e3 }] } },
  now,
});
check('RR-01 Guardian: a sign-in wall, every account resting, and a usage limit with no fallback are not ready, each with its reason',
  !g.deepseek.ready && /sign-in/.test(g.deepseek.why) && !g.chatgpt.ready && /every chatgpt account is resting/.test(g.chatgpt.why) && !g.perplexity.ready && /usage limit/.test(g.perplexity.why), JSON.stringify(g));
check('RR-02 a ◎ wait is ready but goes last (never a drop: the pick clears it); a tab-less agent is ready and opened on demand',
  g.claude.ready && g.claude.order === 'last' && /waits on you/.test(g.claude.why) && g.gemini.ready && g.gemini.opens === true, JSON.stringify({ c: g.claude, gm: g.gemini }));
const g2 = PRd.readiness({ ids: ['claude'], connected: { claude: 'connected' }, jobs: [
  { provider: 'claude', status: 'failed', failedAt: now - 60000, needsYou: 'pick' }, { provider: 'claude', status: 'complete', completedAt: now - 1000 }], now });
const g3 = PRd.readiness({ ids: ['claude'], connected: { claude: 'connected' }, jobs: [{ provider: 'claude', status: 'failed', failedAt: now - 3 * 3600e3, needsYou: 'pick' }], now });
check('RR-03 a ◎ wait is cleared by a later completed job, and expires after two hours', g2.claude.ready && !g2.claude.order && g3.claude.ready && !g3.claude.order);

const rungs = [{ provider: 'ollama:qwen2.5-coder:7b', base: 'ollama' }, { provider: 'claude', base: 'claude' }, { provider: 'chatgpt', base: 'chatgpt' }, { provider: 'gemini', base: 'gemini' }, { provider: 'deepseek', base: 'deepseek' }, { provider: 'claude-code', base: 'claude-code' }];
const a = RR.apply(rungs, g, { planner: 'claude' });
check('RR-04 the ladder: not-ready agents are left off before the run, the ◎ wait goes last, local and non-Guardian rungs stay, in order',
  a.rungs.map(r => r.provider).join(',') === 'ollama:qwen2.5-coder:7b,gemini,claude-code,claude' && a.dropped.map(d => d.provider).join(',') === 'chatgpt,deepseek' && a.moved[0].provider === 'claude', a.rungs.map(r => r.provider).join(','));
check('RR-05 the planner: claude waits on the ◎ pick, so the first ready browser rung plans instead, said on the run',
  a.planner.use === 'gemini' && a.planner.was === 'claude' && /gemini plans instead/.test(a.planner.why) && /tried last: claude/.test(RR.line(a)) && /left off: chatgpt/.test(RR.line(a)), JSON.stringify(a.planner));
const b = RR.apply([{ provider: 'ollama:q', base: 'ollama' }], { claude: { ready: false, why: 'needs a sign-in' } }, { planner: 'claude' });
check('RR-06 no agent ready to plan → planner null: the plan is written without a model (PF2)', b.planner.use === null && /written without a model/.test(b.planner.why));
const c = RR.apply(rungs, null, { planner: 'claude', memoryLevel: 'critical' });
check('RR-07 Guardian not answering changes nothing and says so; critical memory is said, not acted on (local by default)',
  c.rungs.length === rungs.length && !c.dropped.length && c.planner.use === 'claude' && c.notes.some(n => /not checked/.test(n)) && c.notes.some(n => /memory is critical/.test(n)));

// PF2 — a plan without a model
const reg = [{ id: 'notes', file: 'lib/notes.js', layer: 'engine', purpose: 'keeps notes', exports: ['add'] }];
const d = PP.derivePlan({ phaseKey: 'N1', does: 'add list to notes', proof: 'list returns the notes', body: 'N1:\n  does: add list\n  - list returns every note in order\n',
  files: ['tests/modules/test-notes.js', 'lib/notes.js'], registry: reg, codeOf: (p) => (p === 'lib/notes.js' ? "module.exports = { add, list };" : p === 'tests/modules/test-notes.js' ? "const n = require('../../lib/notes.js');" : null) });
check('RR-08 derivePlan: the named files, an existing file keeps its exports, a new one gets a layer from its path, the order follows the imports, held by parsePlan',
  d.ok && d.plan.derived && d.plan.order.join(',') === 'lib/notes.js,tests/modules/test-notes.js' && d.plan.files.find(f => f.path === 'lib/notes.js').exports.map(e => e.name).join(',') === 'add,list'
  && d.plan.files.find(f => f.path === 'tests/modules/test-notes.js').layer === 'test' && d.plan.files[0].steps.includes('list returns every note in order') && d.plan.conditions.length === 2 && d.warnings.some(w => /without a model/.test(w)), JSON.stringify(d).slice(0, 600));
const e = PP.derivePlan({ phaseKey: 'BL30', does: 'check the systems', body: 'BL30:\n  does: check the 13 systems against the registry\n', registry: reg });
check('RR-09 a phase that names no file is not guessed at (his BL30): no plan, and the reason says what to add', !e.ok && /names no files.*add files:/.test(e.problems[0]), JSON.stringify(e.problems));
const f = PP.derivePlan({ phaseKey: 'X', body: '  does: wire `lib/foo.js` into idearium/api/index.js (the route)\n', registry: reg });
check('RR-10 0.60.29 PM0: the file paths a phase\'s text writes are NOT planned (27% of them are its files) — no files: means no plan, and the reason says how to map it',
  !f.ok && /names no files — map it/.test(f.problems[0]), JSON.stringify(f));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
