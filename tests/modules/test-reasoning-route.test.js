'use strict';
/**
 * tests/modules/test-reasoning-route.test.js — 0.60.8
 * James (2026-10-13): "we need intent routing for the reasoning, for the complex tasks, i feel that is priority, do you?"
 *   RR-0x  lib/reasoning-route.js: how hard a request is, deterministically, and the kind/agent it routes to
 *   WR-0x  wired: the repo agent asks the door with that kind and reports outcomes under it; route, command, the reply line
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
console.log('\ntest-reasoning-route\n');
try {
  const R = require(path.join(ROOT, 'lib/reasoning-route.js'));
  const hard = 'plan and design the identity system: decompose the cookie vault, compare webview vs WebContentsView, and debug why the sign-in status is wrong. What are the trade-offs?';
  const a = R.assess(hard);
  check('RR-01 a design/debug/compare request is complex, and says why', a.level === 'complex' && a.signals.some(s => /reasoning asked for/.test(s)), JSON.stringify(a));
  check('RR-02 a simple ask stays simple', R.assess('rename foo to bar in app.js').level === 'simple' && R.assess('show the files').level === 'simple');
  check('RR-03 long, several asks, a stack trace: each adds and is named', R.assess('x'.repeat(5000)).signals.some(s => /long/.test(s))
    && R.assess('TypeError: x is undefined\n    at run (/a/b.js:12:5)').signals.some(s => /stack trace/.test(s)));
  const r = R.route(hard, { jobKind: 'agent:chat', policy: { planner: 'claude' } });
  check('RR-04 complex chat → kind agent:reason, the planner preferred, the why carries the signals', r.kind === 'agent:reason' && r.preferAgent === 'claude' && /complex/.test(r.why));
  check('RR-05 routing.reasoner wins over the planner; Ollama is never the reasoner (the door decides)', R.reasonerOf({ reasoner: 'gemini', planner: 'claude' }) === 'gemini' && R.reasonerOf({ planner: 'ollama:qwen' }) === null);
  check('RR-06 simple chat keeps its kind; a build is left alone (it already plans); routing.reason_route: off turns it off',
    R.route('show the files', { jobKind: 'agent:chat' }).kind === 'agent:chat' && R.route(hard, { jobKind: 'agent:build' }).kind === 'agent:build' && R.route(hard, { jobKind: 'agent:chat', policy: { reason_route: 'off' } }).kind === 'agent:chat');
  const RA = src('lib/repo-agent.js');
  check('WR-01 the repo agent asks the door with the routed kind and the reasoning agent, and reports the outcome under that kind',
    /reasoning-route\.js'\)\.route\(message/.test(RA) && /_doorRoute\(reasoning \? reasoning\.kind : jobKind, reasoning \? reasoning\.preferAgent : null\)/.test(RA) && /kind: \(viaCopilot && viaCopilot\.reasoning && viaCopilot\.reasoning\.kind\) \|\| jobKind/.test(RA));
  check('WR-02 route assess: the API route and the command every agent has', /\['api','route','assess'\]/.test(src('idearium/api/index.js')) && /key: 'route\.assess'/.test(src('idearium/cli/route-commands.js')));
  check('WR-03 the reply says when a reasoning agent was chosen (the Code surface and the agent panel)', /reasoning: complex/.test(src('idearium/ui/js/code-surface.js')) && /reasoning: complex/.test(src('idearium/ui/js/app.js')));
  // 0.60.8 — the one door every caller uses (chat, the pages, chunk builds)
  const D = require(path.join(ROOT, 'lib/model-door.js'));
  const res = (b) => (b === 'ollama' ? { backend: 'ollama' } : { backend: 'guardian', agent: b });
  const pol = { chain: ['ollama:small:3b', 'claude', 'chatgpt'] };
  const first = (kind, extra = {}) => D.route({ kind, policy: pol, ...extra }, { defaultProvider: 'auto', resolve: res }).route[0].provider;
  check('DR-01 spec, map, plan, read go to a reasoning agent; code and ideas stay on Ollama (only what Ollama cannot do)',
    ['page:workshop', 'page:architect', 'spec-plan', 'build:file.spec', 'build:file.md'].every(k => first(k) === 'claude') && ['build:file.js', 'page:void', 'agent:chat'].every(k => first(k) === 'ollama:small:3b'));
  check('DR-02 a complex message at the door goes to reasoning; a named routing.reasoner wins', first('agent:chat', { message: 'plan and design the identity system, compare webview vs WebContentsView and debug the sign-in' }) === 'claude'
    && D.route({ kind: 'page:workshop', policy: { ...pol, reasoner: 'chatgpt' } }, { defaultProvider: 'auto', resolve: res }).route[0].provider === 'chatgpt');
  check('DR-03 a spec block that names its agent is never overridden; routing.reason_route: off turns it off',
    first('page:workshop', { block: { id: 'b', agent: 'ollama:small:3b', fallback: [] } }) === 'ollama:small:3b' && D.route({ kind: 'page:workshop', policy: { ...pol, reason_route: 'off' } }, { defaultProvider: 'auto', resolve: res }).route[0].provider === 'ollama:small:3b');
} catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
