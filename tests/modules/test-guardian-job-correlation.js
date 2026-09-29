'use strict';
/**
 * tests/modules/test-guardian-job-correlation.js
 * §2026-09-22 — James, from a real run: "injected, didn't recieve back... then
 * did it again, still open ui, no response. also it used the first response
 * from the first job for the second attempt." Plus: it only worked with the
 * Clear Glass render open, and chat URLs were not logged consistently.
 *
 * The stale-reply logic is exercised for real: startWatch/checkStable is
 * extracted VERBATIM from each userscript and run against a fake DOM that
 * behaves the way a provider tab does — the previous answer already on screen,
 * stable, with nothing generating.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const PROVIDERS = ['chatgpt', 'claude', 'gemini', 'deepseek', 'perplexity'];

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

// Class methods have no `function` keyword; extract by brace matching from
// the method header so the REAL implementation is what runs in these tests.
function extractMethod(src, name) {
  const m = new RegExp(`\\n  (?:async )?${name}\\s*\\(`).exec(src);
  if (!m) throw new Error(`${name} not found`);
  const start = m.index + 1;
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  const body = src.slice(start, i + 1).replace(/^\s*(async\s+)?/, '');
  return `function ${body.slice(body.indexOf(name))}`;
}

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}

/**
 * Runs the REAL startWatch against a scripted tab.
 * reply: null = the tab never answers (the previous answer just sits there);
 *        string = the new answer appears after `afterMs`.
 */
function runWatch(src, { previous, reply = null, afterMs = 1700, noReplyMs = 6000, giveUpMs = 14000, noElement = false, clockScale = 1 }) {
  return new Promise((resolve) => {
    const sent = [];
    // noElement: the page has NO element findResponseEl() recognises (0.39.238).
    let el = noElement ? null : { innerText: previous };   // the PREVIOUS answer, already rendered
    const t0 = Date.now();
    const clock = clockScale === 1 ? Date : { now: () => t0 + (Date.now() - t0) * clockScale };
    const started = Date.now();
    if (reply !== null) setTimeout(() => { el = { innerText: reply }; }, afterMs);
    const sandbox = {
      findResponseEl: () => el,
      // §0.39.282 — startWatch reads the reply through each userscript's _replyText(el) (added with the both-sides
      // readers, 0.39.279); the fake tab's element is plain text, so the helper is its innerText.
      _replyText: (x) => (x && x.innerText ? String(x.innerText).trim() : ''),
      _isGenerating: () => false,                 // settled, as a finished previous answer is
      send: (m) => { sent.push(m); if (m.type === 'GUARDIAN_ERROR') resolve({ sent, done: null }); },
      getAccount: () => 'acct',
      PROVIDER: 'test-provider',
      // Helpers some providers' watch loop calls; stubbed so the REAL
      // startWatch runs unmodified (deepseek checks a search-mode banner).
      detectSearchMode: () => false, _isSearching: () => false, _dismissBanner: () => {},
      detectResponseErrors: () => [], _toolCallCounts: new Map(),
      _log: () => {},
      setJobBar: () => {},
      stopWatch: () => {},
      _streamToCortex: () => {},
      _onJobComplete: (jobId, text) => resolve({ sent, done: { jobId, text } }),
      // 0.39.244 — the node-anchor helper and mutation counters the watch loop now reports
      _nexusAnchor: () => null, _nexusMutations: 0, _nexusPulseAt: 0, _nexusPulseSeen: 0,
      NO_REPLY_MS: noReplyMs,
      MutationObserver: class { observe() {} disconnect() {} },
      document: { querySelector: () => null, body: {} },
      location: { href: 'https://provider.example/c/abc123' },
      setTimeout, clearTimeout, Date: clock,
      currentJobId: null, jobActive: false, _watchStart: 0, _watchObs: null, _watchTimer: null,
    };
    const body = `${extractFn(src, 'startWatch')}; startWatch('job-2', 'the second question', 0);`;
    const fn = new Function(...Object.keys(sandbox), body);
    fn(...Object.values(sandbox));
    setTimeout(() => resolve({ sent, done: null, timedOut: true }), giveUpMs);
  });
}

async function main() {
  console.log('\ntest-guardian-job-correlation\n');

  for (const p of PROVIDERS) {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', `userscript-${p}.js`), 'utf8');

    // THE BUG: the previous answer is on screen and settled; the new job gets nothing.
    const stale = await runWatch(src, { previous: 'FIRST JOB ANSWER', reply: null, noReplyMs: 1200, giveUpMs: 6000 });
    check(`${p}: a job that gets no reply NEVER completes with the previous answer`,
      stale.done === null, stale.done && stale.done.text);
    check(`${p}: …it reports a no-reply, loudly, with the chat url`,
      stale.sent.some(m => m.type === 'GUARDIAN_ERROR' && /no new response/.test(m.error) && m.chatUrl));

    // A real new answer still completes normally.
    const good = await runWatch(src, { previous: 'FIRST JOB ANSWER', reply: 'SECOND JOB ANSWER' });
    check(`${p}: a genuine new answer completes the job with ITS text`,
      good.done && good.done.text === 'SECOND JOB ANSWER', good.done && good.done.text);
    check(`${p}: the completed job is the one that was watched`, good.done && good.done.jobId === 'job-2');
    // Behavioural, not textual: the watch must actually EMIT the report when
    // it first sees new text — a source-only assertion passes even if the
    // branch is disabled.
    check(`${p}: it reports reply-started, with how much text it first saw`,
      good.sent.some(m => m.type === 'GUARDIAN_PROGRESS' && m.stage === 'reply-started' && /\d+ch/.test(String(m.how))));
    check(`${p}: a job that never gets a reply reports no reply-started at all`,
      !stale.sent.some(m => m.type === 'GUARDIAN_PROGRESS' && m.stage === 'reply-started'));

    // 0.39.238 — James's 2026-09-25 log: submitted, then silence. With no
    // element findResponseEl() recognises, the watch rescheduled itself forever.
    const noEl = await runWatch(src, { noElement: true, noReplyMs: 30000, clockScale: 20, giveUpMs: 6000 });
    check(`${p}: no reply element → reports no-reply-element early (seconds, not the deadline)`,
      noEl.sent.some(m => m.type === 'GUARDIAN_PROGRESS' && m.stage === 'no-reply-element' && m.chatUrl));
    check(`${p}: no reply element → fails loudly at the deadline, naming the selector, never silent`,
      noEl.sent.some(m => m.type === 'GUARDIAN_ERROR' && /no reply element found/.test(m.error) && /selector drift/.test(m.error)), noEl.timedOut ? 'timed out silently' : '');
    check(`${p}: no reply element → reports it once, not every poll`,
      noEl.sent.filter(m => m.stage === 'no-reply-element').length === 1);

    check(`${p}: the userscript version was bumped so the fix is visible in guardian's report`,
      /const VERSION\s*=\s*'10\.[1-9]/.test(src));
  }

  // 0.39.238 — ChatGPT's REAL findResponseEl against a page with several turns.
  {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', 'userscript-chatgpt.js'), 'utf8');
    const first = { id: 'first-answer' }, second = { id: 'second-answer' }, streamingEl = { id: 'streaming' };
    const doc = (streaming) => ({
      // Real DOM semantics for the two selector shapes: querySelector → first match or null.
      querySelector: (sel) => (streaming && /data-is-streaming|text-streaming/.test(sel)) ? streamingEl
        : (/:last-child/.test(sel) ? first : null),       // one wrapper per turn: EVERY message is :last-child, the first wins
      querySelectorAll: (sel) => /data-message-author-role="assistant"/.test(sel) ? [first, second] : [],
    });
    const run = (streaming) => new Function('document', `let _nexusMap = null; ${extractFn(src, '_lastMatch')}\n${extractFn(src, '_builtInResponseEl')}\n${extractFn(src, 'findResponseEl')}; return findResponseEl();`)(doc(streaming));
    check('chatgpt: findResponseEl returns the LAST assistant message, not the first', run(false) === second, run(false) && run(false).id);
    check('chatgpt: …and the streaming element while a reply is still being written', run(true) === streamingEl);
    const none = new Function('document', `let _nexusMap = null; ${extractFn(src, '_lastMatch')}\n${extractFn(src, '_builtInResponseEl')}\n${extractFn(src, 'findResponseEl')}; return findResponseEl();`)({ querySelector: () => null, querySelectorAll: () => [] });
    check('chatgpt: …and null (not a throw) on a page with no messages', none === null);
  }

  // Headless: the watch loop is timer-driven, so hidden windows must not throttle.
  const HOST = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'providers', 'host.js'), 'utf8');
  check('provider windows disable background throttling (jobs work with the UI closed)',
    /webPreferences:\s*\{[\s\S]{0,1600}backgroundThrottling:\s*false/.test(HOST));
  check('provider windows are still hidden and off the taskbar', /skipTaskbar:\s*true/.test(HOST));

  // chat_url on the path a dispatched job actually takes.
  const GS = fs.readFileSync(path.join(ROOT, 'guardian', 'server.js'), 'utf8');
  const update = GS.slice(GS.indexOf("jaa.update('jobs'"), GS.indexOf("jaa.update('jobs'") + 600);
  check('a completing job records the chat url on the UPDATE path, not only on insert',
    /chat_url: data\.chatUrl/.test(update));
  check('completion is logged once, consistently, with the chat it came from',
    /\[guardian\] job complete[\s\S]{0,200}chat=/.test(GS));

  // The agent config moved to Settings → Agents.
  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  check('Settings has a per-repo Agents section', APP.includes('repo-agents-section') && APP.includes('renderRepoAgentSettings'));
  check('renderRepoSettings renders it for the current repo', /renderRepoAgentSettings\(repo\)/.test(APP));
  const agentTab = extractFn(APP, 'renderRepoAgent');
  check('the Agent tab no longer carries the hat/provider control', !agentTab.includes('agent-use-guardian'));
  check('…and points at where it moved', /Settings → Agents/.test(agentTab));
  check('the Agent tab still has the CLI', /ask this project's agent/.test(APP));

  // ── TR1: a job reaches THAT repo's tab, not whichever is active ──
  const NCP  = fs.readFileSync(path.join(ROOT, 'guardian', 'lib', 'ncp.js'), 'utf8');
  const DISP = fs.readFileSync(path.join(ROOT, 'guardian', 'lib', 'dispatcher.js'), 'utf8');
  const HOST2 = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'providers', 'host.js'), 'utf8');
  const RA   = fs.readFileSync(path.join(ROOT, 'lib', 'repo-agent.js'), 'utf8');
  // 0.39.241 — the literal moved into agentIdFor(), shared with findLate/adoptLate (the Responses index files replies under the same id).
  check('repo-agent derives a per-repo agentId for guardian dispatches',
    /payload\.agentId = agentIdFor\(repo\.uuid\)/.test(RA) && /function agentIdFor\(repoUuid\) \{ return `repo-\$\{repoUuid\}`; \}/.test(RA));
  // §0.39.282 — was "only on the guardian backend". Since 0.39.269 agent memory works on any backend: lifeline.js
  // recalls memory by opts.agentId whichever backend answers, so copilot forwards agentId on every backend (0.39.277).
  check('copilot forwards agentId on every backend (agent memory is per agent, not per backend)',
    /dispatchFn\(prompt, \{[^\n]*agentId: body\.agentId \|\| undefined/.test(fs.readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8'))
    && /recall\(\{ agentId: opts\.memoryAgent \|\| opts\.agentId/.test(fs.readFileSync(path.join(ROOT, 'copilot', 'lifeline.js'), 'utf8')));
  // §ONE-TAB 0.39.247 — replaces the 0.39.237/TR1 per-repo tab checks: every
  // job, repo or not, goes to the provider's one active tab.
  check('the dispatcher sends every job, agentId or not, to the provider\'s one active tab',
    /const sent = ncp\.pushActive\(job\.provider, payload\)/.test(DISP));
  check('…and never aims at, waits for, or opens a per-repo tab',
    !/pushTab\(|_awaitAgentTab\(|spawnProviderTab/.test(DISP));
  check('pushTab targets exactly one client and reports miss as false',
    /function pushTab\(provider, tabId, data\)[\s\S]{0,200}if \(!client\) return false/.test(NCP));
  check('the host stamps the agent into the page BEFORE the userscript runs',
    /_stampAgent\(win, agentId\)/.test(HOST2) && HOST2.indexOf('_stampAgent(win, agentId)') < HOST2.indexOf('const source = await this._loadUserscript') || /async _inject\(providerId, win, agentId = null\) \{\s*\n\s*await this\._stampAgent/.test(HOST2));
  for (const p of PROVIDERS) {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', `userscript-${p}.js`), 'utf8');
    check(`${p}: registers under the stamped agentId when there is one`,
      /const MY_TAB = NEXUS_AGENT_ID \|\| sessionStorage\.getItem/.test(src));
    check(`${p}: falls back to its own session id when unstamped`,
      /NEXUS_AGENT_ID[\s\S]{0,260}\|\| null;/.test(src));
  }

  // ── TR2: per-agent tab policy (real methods, fake windows) ──
  const HOSTSRC = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'providers', 'host.js'), 'utf8');
  const fakeWin = (destroyed = false) => ({ isDestroyed: () => destroyed, destroy() { this._d = true; }, show() { this._shown = true; }, focus() {}, isVisible: () => !!this._shown });
  const mk = (name) => new Function('_log', `return ${extractMethod(HOSTSRC, name)};`)(() => {});
  const cap = mk('_enforceAgentTabCap'), sweep = mk('_sweepIdleAgentTabs'), list = mk('listAgentTabs'), closeT = mk('closeAgentTab'), showT = mk('showAgentTab');
  const host = { AGENT_TAB_MAX: 2, AGENT_IDLE_MS: 1000, agentTabs: new Map(), closeAgentTab: function (p, a) { return closeT.call(this, p, a); } };
  const put = (a, lastUsed) => host.agentTabs.set(`chatgpt::${a}`, { win: fakeWin(), agentId: a, providerId: 'chatgpt', lastUsed });
  put('repo-A', 100); put('repo-B', 200); put('repo-C', 300);
  check('TR2: the LRU agent tab is closed when the cap is exceeded',
    cap.call(host) === 1 && !host.agentTabs.has('chatgpt::repo-A') && host.agentTabs.has('chatgpt::repo-C'));
  check('TR2: tabs within the cap are kept', host.agentTabs.size === 2);
  host.agentTabs.get('chatgpt::repo-B').lastUsed = Date.now() - 5000;
  host.agentTabs.get('chatgpt::repo-C').lastUsed = Date.now();
  check('TR2: an idle agent tab is closed, a busy one is not',
    sweep.call(host, Date.now()) === 1 && !host.agentTabs.has('chatgpt::repo-B') && host.agentTabs.has('chatgpt::repo-C'));
  check('TR2: a destroyed window is reaped rather than reported live',
    (() => { host.agentTabs.set('chatgpt::repo-D', { win: fakeWin(true), agentId: 'repo-D', providerId: 'chatgpt', lastUsed: Date.now() });
             return list.call(host).every(t => t.agentId !== 'repo-D'); })());
  check('TR2: a tab can be brought forward on demand', showT.call(host, 'chatgpt', 'repo-C').ok === true);
  check('TR2: showing a tab that does not exist says so', showT.call(host, 'chatgpt', 'nope').ok === false);
  check('TR2: agent tabs are a separate registry, never keyed into this.windows',
    /this\.agentTabs\.set\(agentKey/.test(HOSTSRC) && !/this\.windows\.set\(`\$\{providerId\}::/.test(HOSTSRC));
  check('TR2: ensureAgentTab is idempotent — same agentId reuses the live tab',
    /if \(agentKey && this\.agentTabs\.has\(agentKey\)\)[\s\S]{0,240}status: 'already-running'/.test(HOSTSRC));
  check('TR2: the agent sweep runs inside the existing idle sweep',
    /_sweepIdle\(\) \{[\s\S]{0,120}_sweepIdleAgentTabs\(now\)/.test(HOSTSRC));
  check('TR2: opening a tab for an agent stamps that agent before injecting',
    /this\._inject\(providerId, win, agentId\)/.test(HOSTSRC));

  // ── Submit + watch evidence: a job that goes quiet must say WHERE ──
  // James's run: created -> dispatched -> acked -> silence, while the tab
  // showed a real answer. Neither the send nor the watch reported anything.
  for (const p of PROVIDERS) {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', `userscript-${p}.js`), 'utf8');
    const sub = extractFn(src, 'submit');
    check(`${p}: submit() reports which path sent the prompt`,
      /return \{ ok: true, how: 'button' \}/.test(sub) && /how: 'enter-key'/.test(sub));
    check(`${p}: submit() reports a real reason when nothing could send`,
      /return \{ ok: false, how: 'none', error:/.test(sub));
    check(`${p}: a prompt typed but never sent fails immediately with that reason`,
      /stage: s && s\.ok \? 'submitted' : 'submit-failed'/.test(src) && /never sent —/.test(src));
    check(`${p}: the watch only starts once the prompt really went out`,
      src.indexOf('if (!s || !s.ok)') > 0 && src.indexOf('if (!s || !s.ok)') < src.indexOf('startWatch(jobId, text, 0);'));
    check(`${p}: the watch reports the first new text it sees, so silence is diagnosable`,
      /stage:'reply-started'/.test(src) && /let _sawNew = false;/.test(src));
    check(`${p}: reply-started fires before the stale-baseline guard can skip the pass`,
      src.indexOf("stage:'reply-started'") < src.indexOf('if (el === _baseEl && text === _baseText) {'));
  }
  const NH = fs.readFileSync(path.join(ROOT, 'guardian', 'lib', 'ncp-handler.js'), 'utf8');
  check('guardian routes stage reports from the page',
    /case 'GUARDIAN_PROGRESS'[\s\S]{0,1200}bus\.emit\('guardian\.job\.progress'/.test(NH));   // §0.39.282 window widened: 0.39.259's resuming-chat handling sits between
  check('guardian logs one line per job stage, naming the chat',
    /guardian\.job\.progress[\s\S]{0,300}chat=/.test(fs.readFileSync(path.join(ROOT, 'guardian', 'server.js'), 'utf8')));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
