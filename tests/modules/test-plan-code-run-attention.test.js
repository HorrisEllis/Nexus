'use strict';
/**
 * tests/modules/test-plan-code-run-attention.test.js — 0.60.0
 *
 * James (2026-10-12): "an intent for the reasoning, to map and plan, then ollama codes in chunks" · "always read the code
 * first, the atlas and the .spec. loom map and then map the phases. make sure the right system is being mapped" · "nexus
 * learning from the agents" · "the plan panel … needs a clear button" · "play, pause and rewind … like the way vmware
 * pauses the state of the vm" · "guardian should detect when a sign in is needed … popup … element picker".
 *
 *   PC-0x  lib/phase-plan.js: the plan is parsed, mapped to the registry, the system checked, briefs and exports
 *   PC-1x  lib/pipeline-routing.js planMode / coderRungs / the routing.* keys; lib/plan-learning.js lessons and coder order
 *   RS-0x  lib/repo-run-state.js: pause freezes a waiter, play releases it; the dispatch door waits on it
 *   GA-0x  guardian/lib/provider-attention.js: page state, cooldown, clear; Clear Glass's panel + picker with a fake window
 *   WR-0x  the wiring: _phaseBuild plans then codes, the routes, the Plan panel's clear and run controls
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('\ntest-plan-code-run-attention\n');
  try {
    // ── PC: the plan ──────────────────────────────────────────────────────────
    const PP = require(path.join(ROOT, 'lib/phase-plan.js'));
    const registry = PP.registryOf({
      specRegistry: { components: [{ id: 'store', file: 'lib/store.js', layer: 'kernel', exports: ['read', 'write'], purpose: 'the key value store' }] },
      architecture: { components: [{ id: 'app.cache', file: 'lib/cache.js', layer: 'engine', type: 'module', exports: ['cacheGet'] }, { id: 'doc', file: 'README.md', type: 'doc', exports: [] }] },
    });
    check('PC-01 registry: the spec\'s components first, then the code\'s modules; docs left out', registry.map(c => c.file).join() === 'lib/store.js,lib/cache.js' && registry[0].source === 'spec', JSON.stringify(registry));
    const good = '```json\n' + JSON.stringify({
      system: 'core', read: ['lib/store.js', 'README.md ### core'], intent: 'a cached store',
      files: [
        { path: 'lib/cached-store.js', new: true, layer: 'engine', purpose: 'reads through the cache', imports: ['./store.js: read', './cache.js: cacheGet'], exports: [{ name: 'cachedRead', signature: 'cachedRead(key) -> value', does: 'reads' }], steps: ['look in the cache', 'else read the store'] },
        { path: 'lib/store.js', component: 'store', imports: [], exports: [{ name: 'read' }, { name: 'write' }], steps: ['keep a map'] },
      ],
      order: ['lib/cached-store.js', 'lib/store.js'],
      conditions: [{ says: 'the store parses', check: { kind: 'command', run: 'node --check lib/store.js' } }, { says: 'bad', check: { kind: 'vibes' } }],
    }) + '\n```';
    const p1 = PP.parsePlan(good, { phaseFiles: ['lib/cached-store.js'], registry });
    check('PC-02 a plan that maps every file is accepted; the order is fixed to dependencies first', p1.ok && p1.plan.order.join() === 'lib/store.js,lib/cached-store.js' && p1.warnings.some(w => /order/.test(w)), JSON.stringify({ problems: p1.problems, order: p1.plan && p1.plan.order }));
    check('PC-03 the conditions from the intent are kept; one with no real kind is a warning, not a condition', p1.plan.conditions.length === 1 && p1.warnings.some(w => /check kind/.test(w)));
    check('PC-04 the plan knows what it mapped and what is new, and what was read', p1.plan.mapped === 1 && p1.plan.added === 1 && p1.plan.read.length === 2);
    const p2 = PP.parsePlan(JSON.stringify({ files: [{ path: 'lib/other.js', exports: [{ name: 'x' }] }] }), { phaseFiles: ['lib/cached-store.js'], registry });
    check('PC-05 a file mapped to nothing, and a phase file left out, refuse the plan', !p2.ok && p2.problems.some(x => /maps to no registry component/.test(x)) && p2.problems.some(x => /leaves out lib\/cached-store\.js/.test(x)), JSON.stringify(p2.problems));
    const p3 = PP.parsePlan(JSON.stringify({ system: 'guardian', files: [{ path: 'guardian/x.js', new: true, layer: 'engine' }] }), { registry, system: 'idearium', ownerOf: (f) => f.split('/')[0] });
    check('PC-06 the wrong system is refused: the plan says another, and its file belongs to another', !p3.ok && p3.problems.some(x => /this phase builds idearium/.test(x)) && p3.problems.some(x => /belongs to guardian/.test(x)), JSON.stringify(p3.problems));
    const p4 = PP.parsePlan(JSON.stringify({ files: [{ path: 'lib/k.js', new: true, layer: 'kernel', imports: ['./r.js'] }, { path: 'lib/r.js', new: true, layer: 'runtime' }] }), { registry });
    check('PC-07 a kernel file importing a runtime file is refused (a lower layer leaning on a higher one)', !p4.ok && p4.problems.some(x => /lower layer/.test(x)), JSON.stringify(p4.problems));
    const brief = PP.chunkBrief({ plan: p1.plan, path: 'lib/cached-store.js', done: [{ path: 'lib/store.js', exports: ['read', 'write'] }], repoName: 'demo', phaseKey: 'P1' });
    check('PC-08 the coder\'s brief: one file, exact exports, imports with what was really written, numbered steps, the addressed fence', /Write ONE file: lib\/cached-store\.js/.test(brief.message) && /cachedRead — cachedRead\(key\) -> value/.test(brief.message) && /really exports: read, write/.test(brief.message) && /1\. look in the cache/.test(brief.message) && /```js lib\/cached-store\.js/.test(brief.message) && brief.message.length <= 2400, brief.message);
    const cc = PP.checkChunk('function cachedRead(k) {}\nmodule.exports = { other };', p1.plan, 'lib/cached-store.js');
    check('PC-09 a file that came back without its planned export is caught', !cc.ok && cc.missing.join() === 'cachedRead');
    check('PC-10 phases.js exportsOf is the same implementation', /require\('\.\.\/\.\.\/lib\/phase-plan\.js'\)\.exportsOf/.test(src('idearium/repo/phases.js')));
    const prompt = PP.planPrompt({ phaseKey: 'P1', body: 'P1: build it', intent: 'cache reads', files: ['lib/cached-store.js'], registry, system: 'core', atlas: '### core\nshared code', loom: ['core.x | lib'], reuse: PP.reuseCandidates(registry, 'read the store through the cache'), lessons: '- coder ollama:q landed 3 of 4' });
    check('PC-11 the planner reads first: code, atlas, spec, loom — in that order — and is given each', /READ FIRST, IN THIS ORDER.*\(1\) the code.*\(2\) the atlas.*\(3\) the spec.*\(4\) the loom map/s.test(prompt) && /THE ATLAS/.test(prompt) && /THE LOOM MAP/.test(prompt) && /REUSE FIRST/.test(prompt) && /EARLIER PLANNED BUILDS/.test(prompt) && /"system" is "core"/.test(prompt));
    check('PC-21 in a nexus-system repo the planner slots components the template way: registry entry + nodes, handoffs not requires, a module when big enough', /registry-components\.js entry/.test(PP.planPrompt({ phaseKey: 'X', skeleton: true })) && /a handoff/.test(PP.planPrompt({ phaseKey: 'X', skeleton: true })) && !/nexus-system template/.test(PP.planPrompt({ phaseKey: 'X' })));
    const atlas = PP.atlasSection(src('README.md'), 'guardian');
    check('PC-12 the atlas section is the README\'s own words for the system, and nothing past the next system', /^### guardian/.test(atlas) && !/\n### idearium/.test(atlas), atlas.slice(0, 80));
    const ts = PP.targetSystem({ files: ['guardian/a.js', 'guardian/b.js', 'lib/x.js'], tags: ['GUARDIAN'], ownerOf: (f) => (f.startsWith('guardian/') ? 'guardian' : 'core'), tagSystem: (t) => t.toLowerCase(), declared: 'core' });
    check('PC-13 the system is voted by the files and loom tags; the repo\'s own system losing is a conflict, said', ts.system === 'guardian' && /point at guardian/.test(ts.conflict || ''), JSON.stringify(ts));
    const ls = PP.loomSlice({ available: true, systems: { guardian: { componentIds: ['guardian.ncp'] } }, components: { 'guardian.ncp': { dir: 'guardian/lib', comp_status: 'active' } } }, 'guardian');
    check('PC-14 the loom slice lists the system\'s registered components', ls.total === 1 && /guardian\.ncp \| guardian\/lib/.test(ls.lines[0]));

    // ── PC: routing + learning ────────────────────────────────────────────────
    const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));
    const rungs = [{ provider: 'claude', base: 'claude' }, { provider: 'ollama:qwen2.5-coder:3b', base: 'ollama', model: 'qwen2.5-coder:3b' }, { provider: 'chatgpt', base: 'chatgpt' }];
    const pm = PR.planMode(PR.policyFrom({}), { rungs });
    check('PC-15 auto: a reasoning agent on the ladder plans, Ollama codes', pm.plan && pm.planner === 'claude', JSON.stringify(pm));
    check('PC-16 never / no Ollama / planner named', !PR.planMode(PR.policyFrom({ plan_code: 'never' }), { rungs }).plan && !PR.planMode(PR.policyFrom({}), { rungs: [rungs[0]] }).plan && PR.planMode(PR.policyFrom({ planner: 'gemini' }), { rungs }).planner === 'gemini');
    check('PC-17 the coder ladder puts Ollama first', PR.coderRungs(rungs).map(r => r.provider).join() === 'ollama:qwen2.5-coder:3b,claude,chatgpt');
    const cfg = require(path.join(ROOT, 'idearium/lib/config-core.cjs'));
    const cfgText = src('idearium/lib/config-core.cjs');
    check('PC-18 routing.plan_code, planner, plan_attempts, chunk_phases and ladder_learn are declared config', ['plan_code:', 'planner:', 'plan_attempts:', 'chunk_phases:', 'ladder_learn:'].every(k => cfgText.includes(k)) && !!cfg);
    const PL = require(path.join(ROOT, 'lib/plan-learning.js'));
    const runs = [
      { state: 'planned', runId: 'r1', targetRepo: 'R', plan: { system: 'core', files: [{ path: 'lib/store.js', layer: 'kernel', exports: [{ name: 'read' }] }] } },
      ...[1, 2, 3].map(i => ({ state: 'replied', planned: true, file: 'lib/store.js', provider: 'ollama:a' })),
      ...[1, 2, 3].map(i => ({ state: 'incomplete', planned: true, file: 'lib/store.js', provider: 'ollama:b', missingExports: ['write'] })),
      { state: 'replied', planned: true, file: 'lib/store.js', provider: 'ollama:b' },
      { state: 'plan-refused', problems: ['lib/x.js: maps to no registry component'] },
      { state: 'proven', buildRunId: 'r1' },
    ];
    const L = PL.lessons(runs, { system: 'core', files: ['lib/store.js'] });
    check('PC-19 lessons: who lands which layer, which export gets dropped, what plans are refused for, what is already built and proven',
      /coder ollama:a: landed 3 of 3/.test(L.text) && /dropped exports write×3/.test(L.text) && /refused 1× for/.test(L.text) && /lib\/store\.js was already built from a plan and proven/.test(L.text), L.text);
    const oc = PL.orderCoders([{ provider: 'ollama:b', base: 'ollama' }, { provider: 'ollama:a', base: 'ollama' }, { provider: 'claude', base: 'claude' }], runs);
    check('PC-20 the coders are ordered by their record on planned files', oc.changed && oc.rungs.map(r => r.provider).join() === 'ollama:a,ollama:b,claude', JSON.stringify(oc));

    // ── RS: play / pause ──────────────────────────────────────────────────────
    const RS = require(path.join(ROOT, 'lib/repo-run-state.js'));
    RS._setFile(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rs-')), 'run.json'));
    check('RS-01 a repo plays until paused', RS.get('R1').state === 'playing' && !RS.isPaused('R1'));
    const p = RS.pause('R1', { by: 'test', reason: 'look', snapshot: 'c1' });
    check('RS-02 pause records when, by whom and the version it was paused at; pausing again keeps it', p.state === 'paused' && p.snapshot === 'c1' && RS.pause('R1').already === true);
    let released = false, said = null;
    const w = RS.wait('R1', { onPause: (st) => { said = st.reason; }, pollMs: 20 }).then(() => { released = true; });
    await new Promise(r => setTimeout(r, 80));
    check('RS-03 work waits while paused, and is told why', !released && said === 'look');
    RS.resume('R1');
    await w;
    check('RS-04 play releases the waiting work; the history keeps both', released && RS.get('R1').history.map(h => h.op).join() === 'pause,resume');
    check('RS-05 the dispatch door waits on the run state before any agent call', /async function _whenPlaying\(o, RAct\) \{[\s\S]{0,200}repo-run-state\.js[\s\S]{0,200}RS\.wait\(o\.repo\.uuid/.test(src('lib/repo-agent.js')));

    // ── GA: Guardian attention + Clear Glass panel ────────────────────────────
    const GA = require(path.join(ROOT, 'guardian/lib/provider-attention.js'));
    check('GA-01 page state: a sign-in page, an auth host, off the agent\'s site, the chat',
      GA.pageState('https://claude.ai/login', ['claude.ai']) === 'signin' && GA.pageState('https://accounts.google.com/o/oauth2', ['gemini.google.com']) === 'signin'
      && GA.pageState('https://example.com/', ['claude.ai']) === 'off-host' && GA.pageState('https://claude.ai/new', ['claude.ai']) === 'ok');
    const posted = [], emitted = [];
    let t = 1000;
    const A = GA.createAttention({ post: async (p, b) => { posted.push([p, b]); return { ok: true }; }, emit: (ty, d) => emitted.push(ty), cooldownMs: 500, now: () => t });
    const r1 = await A.raise({ provider: 'claude', reason: 'signin', note: 'sign in' });
    const r2 = await A.raise({ provider: 'claude', reason: 'signin' });
    check('GA-02 the person is asked once (Clear Glass\'s attention route), not again inside the cooldown', r1.sent && r2.skipped === 'cooldown' && posted.length === 1 && posted[0][0] === '/providers/claude/attention' && emitted[0] === 'guardian.provider.attention');
    A.clear('claude');
    const r3 = await A.raise({ provider: 'claude', reason: 'signin' });
    check('GA-03 connected (cleared): the next problem is asked at once', r3.sent && posted.length === 2);
    check('GA-04 an unknown reason is refused', (await A.raise({ provider: 'claude', reason: 'nap' })).error);
    const S = src('guardian/server.js'), K = src('guardian/ask.js');
    check('GA-05 guardian raises it on a sign-in wall, on a selector it cannot find, clears it on connect; the no-tab wait looks at the page and waits for the sign-in',
      /state === 'wall' \|\| state === 'signed-out'\) _providerAttention\(\)\.raise/.test(S) && /reason: signin \? 'signin' : 'map'/.test(S) && /_providerAttention\(\)\.clear\(provider\)/.test(S)
      && /A\.pageOf\(p\)/.test(K) && /jobs\.signin_wait_ms/.test(K));
    const CA = require(path.join(ROOT, 'clear-glass/src/providers/attention.js'));
    for (const k of ['input', 'send', 'resp']) new Function(`return ${CA.pickerScript(k)}`);
    new Function(`return ${CA.panelScript({ provider: 'claude', reason: 'signin', note: 'it\'s "here"' })}`);
    check('GA-06 the panel and the picker are page scripts that parse', true);
    // a fake window: panel → pick input → picker answers → assign → panel → hide
    const calls = []; const answers = [{ action: 'pick', key: 'input' }, { selector: '#prompt', matched: 1, url: 'https://claude.ai/new', tag: 'div' }, { action: 'hide' }];
    const win = { id: 7, shown: 0, hidden: 0, destroyed: false, isDestroyed() { return this.destroyed; }, show() { this.shown++; }, hide() { this.hidden++; }, focus() {}, setSkipTaskbar() {}, setTitle() {},
      webContents: { executeJavaScript: async (code) => { calls.push(code.slice(0, 40)); return answers.shift(); }, getURL: () => 'https://claude.ai/new' } };
    const assigned = [];
    // pickerSource: null — the one-click picker this fake window's answers script (0.60.71 picks use the Guardian picker
    // first; its walk is tested on a real DOM in test-guardian-field-pick)
    const H = CA.createAttentionHandler({ pickerSource: null, providerHost: { windows: new Map([['claude', win]]), agentTabs: new Map(), start: async () => ({ ok: true }) }, assign: async (x) => { assigned.push(x); return { ok: true }; } });
    const at = await H.attend('claude', { reason: 'map', note: 'cannot find the input' });
    await new Promise(r => setTimeout(r, 50));
    check('GA-07 Clear Glass shows the hidden tab, the panel, runs the picker, sends the pick to Guardian with its evidence, then hides',
      at.ok && win.shown === 1 && calls.length === 3 && assigned.length === 1 && assigned[0].key === 'input' && assigned[0].selector === '#prompt' && assigned[0].evidence.matched === 1 && win.hidden === 1, JSON.stringify({ at, calls: calls.length, assigned, hidden: win.hidden }));
    const agentWin = { ...win, id: 8, shown: 0 }; agentWin.webContents = { executeJavaScript: async () => ({ action: 'hide' }), getURL: () => '' };
    const H2 = CA.createAttentionHandler({ providerHost: { windows: new Map([['claude', win]]), agentTabs: new Map([['claude::repo-x', { win: agentWin }]]) }, assign: async () => ({ ok: true }) });
    const at2 = await H2.attend('claude', { reason: 'signin', agentId: 'repo-x' });
    check('GA-08 a job routed to a repo\'s own agent tab shows that tab, not the provider\'s', at2.ok && /for repo-x/.test(at2.window) && agentWin.shown === 1);
    check('GA-09 Clear Glass\'s bridge serves POST /providers/:id/attention', /\/providers\/:id\/attention/.test(src('clear-glass/src/ipc/bridge.js')));

    // ── WR: wiring ────────────────────────────────────────────────────────────
    const API = src('idearium/api/index.js');
    check('WR-01 the phase build plans when planMode says so, Ollama-first coders, a verified export per file, and the plan\'s conditions prove it',
      /PRt\.planMode\(policy/.test(API) && /planning\.plan \? runPlanned\(\)/.test(API) && /PRt\.coderRungs\(rungs\)/.test(API) && /PP\.checkChunk\(code, plan, file\)/.test(API) && /generated && Array\.isArray\(generated\.conditions\)/.test(API));
    check('WR-02 the planner is grounded: atlas, loom map, reuse, lessons; the system voted, not the first file\'s owner',
      /PP\.atlasSection\(/.test(API) && /PP\.loomSlice\(/.test(API) && /PP\.reuseCandidates\(/.test(API) && /PL\.lessons\(/.test(API) && /targetSystem\(\{ files: node\.files/.test(API) && !/map\(f => SYS\.ownerOf\(String\(f\)\.split\(\/\[\\s\(\]\/\)\[0\]\)\)\.find\(Boolean\)/.test(API));
    check('WR-03 play/pause/rewind routes; a paused repo\'s spec is neither queued nor built; a phase attempt waits',
      /'repo\.run\.control'/.test(API) && /api','repos',    ':uuid','run',':op'/.test(API) && /REPO_PAUSED/.test(API) && /isPaused\(rr\.uuid\)\) continue/.test(API) && /RSx\.wait\(target\.uuid\)/.test(API));
    const PPN = src('idearium/ui/js/plan-panel.js'), RCT = src('idearium/ui/js/repo-card-time.js');
    check('WR-04 the Plan panel has ⌫ clear done (with restore) and ▶ ⏸ ⏮; the repo card has the run bar and ⏮ per version',
      /planClearDone\(\)/.test(PPN) && /planRestoreDone\(\)/.test(PPN) && /ppRunLoad\(\)/.test(PPN) && /function rcRunBar/.test(RCT) && /rcRun\('\$\{uuid\}','rewind','\$\{_rcEsc\(c\.commitId\)\}'\)/.test(RCT));
    check('WR-05 the routing settings show Plan, then code', /data-rt-pc/.test(src('idearium/ui/settings.html')));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
