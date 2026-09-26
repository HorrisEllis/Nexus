'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-nexus-wake.js
//
// Two things carry the weight here:
//   · the browser matcher and the backend matcher must agree exactly, or a
//     phrase works in one runtime and not the other
//   · an intercepted turn must NOT reach the host model, and a failed ask must
//     say so rather than silently swallowing the message
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const ROOT   = path.join(__dirname, '..', '..');

const WAKE = require(path.join(ROOT, 'guardian', 'userscript-nexus-wake.js'));
const AC   = require(path.join(ROOT, 'lib', 'agent-chat.js'));
const SRC  = fs.readFileSync(path.join(ROOT, 'guardian', 'userscript-nexus-wake.js'), 'utf8');

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${id} ${name}`); }
  catch (e) { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); }
}

console.log('\n\u2550\u2550 NEXUS WAKE \u2014 "hey nexus" in any agent tab \u2550\u2550\n');

// ── Grammar parity ───────────────────────────────────────────────────────────
test('NW-001', 'the wake phrase is recognised in its real forms', () => {
  for (const s of ['hey nexus, what is open?', 'Hey Nexus: run the tests',
                   'ok nexus, status', 'HEY NEXUS   list the gaps']) {
    assert.strictEqual(WAKE.parseWake(s).addressed, true, `not recognised: "${s}"`);
  }
});

test('NW-002', 'THE MATCHERS AGREE \u2014 browser and backend cannot diverge', () => {
  // A phrase that works in the composer but not in lib/agent-chat (or the
  // reverse) is the worst kind of bug to chase: the feature works "sometimes".
  const cases = ['hey nexus, go', 'Hey Nexus: do it', 'ok nexus, x',
                 'can you explain nexus', 'nexus is a system', 'hey there',
                 'hey nexus,   ', '', 'heynexus go'];
  for (const c of cases) {
    const a = WAKE.parseWake(c), b = AC.parseWake(c);
    assert.strictEqual(a.addressed, b.addressed, `divergence on "${c}": userscript=${a.addressed} backend=${b.addressed}`);
    assert.strictEqual(a.ask, b.ask, `ask text differs on "${c}"`);
  }
  assert.strictEqual(String(WAKE.WAKE_RE), String(AC.WAKE_RE), 'the two regexes are no longer identical');
});

test('NW-003', 'ordinary conversation is NOT hijacked', () => {
  for (const s of ['can you explain nexus to me', 'hey, what about nexus?',
                   'nexus is a system I built', 'what does nexus do']) {
    assert.strictEqual(WAKE.parseWake(s).addressed, false, `wrongly intercepted: "${s}"`);
  }
});

test('NW-004', 'a wake word with no request is ignored, not sent as an empty prompt', () => {
  assert.strictEqual(WAKE.parseWake('hey nexus,    ').addressed, false);
  assert.strictEqual(WAKE.parseWake('hey nexus,').addressed, false);
});

// ── The endpoint ─────────────────────────────────────────────────────────────
test('NW-005', 'IT ASKS THE REAL CO-PILOT \u2014 not a provider round-trip', () => {
  // The first version pointed at guardian's /api/copilot/prompt, which calls
  // askSync() and dispatches to ANOTHER PROVIDER. "hey nexus" would have gone
  // back out to ChatGPT and returned a model's guess about NEXUS wearing
  // co-pilot's name \u2014 the fabricated-compartments failure with a better label.
  // Scan the CODE, not the whole file. The first version of this assertion
  // matched anywhere in the source and failed on the comment that explains the
  // fix — a string-scanning test cannot distinguish code from prose, which is
  // exactly the trap BL-001 sprang on 2026-08-17. Comments are stripped first.
  // The (?<!:) matters: a naive //-stripper eats "http://" and then reports the
  // endpoint missing from its own source. Caught by this test failing while the
  // code was correct — the second time in this file that a scanner mistook one
  // kind of text for another.
  //
  // §UPDATED 2026-08-27 — this test itself was the stale one this time, not
  // the code. askNexus() moved from fetch(COPILOT_PROMPT) to
  // GM_xmlhttpRequest({url:COPILOT_PROMPT,...}) on 2026-08-22 for a real,
  // documented, unavoidable reason (guardian/userscript-nexus-wake.js's own
  // comment at that call site): plain fetch() from an https:// chat page to
  // a real http://127.0.0.1 target is blocked by the browser as mixed
  // content, exactly like EventSource is — no server-side CORS header can
  // fix that. Checked the current code directly before touching this
  // assertion, not assumed — confirmed the fetch(COPILOT_PROMPT) shape no
  // longer exists anywhere in this file, on purpose. Updated to assert the
  // REAL current mechanism instead of reverting correct code to satisfy a
  // stale check, which would have silently reintroduced the mixed-content
  // bug this file's own 2026-08-22 fix already found and closed.
  const code = SRC.replace(/(?<!:)\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/127\.0\.0\.1:3750/.test(code), 'must target the sovereign co-pilot on :3750');
  assert.ok(/GM_xmlhttpRequest\s*\(\s*\{[\s\S]{0,80}url:\s*COPILOT_PROMPT\b/.test(code),
    'the ask must use GM_xmlhttpRequest targeting COPILOT_PROMPT — plain fetch() to a real http:// target from an https:// page is blocked as mixed content, no CORS header can fix that');
  assert.ok(!/(?<!GM_x)fetch\(\s*COPILOT_PROMPT/.test(code),
    'must not regress back to plain fetch(COPILOT_PROMPT) — that is the exact mixed-content bug this file already fixed once');
  assert.ok(!/copilot\/prompt/.test(code),
    'guardian\u2019s relay dispatches to a provider \u2014 that is not NEXUS answering');
});

test('NW-006', 'a 200 with no text is a STATED failure, not a blank bubble', () => {
  assert.ok(/answered 200 with no text/.test(SRC),
    'an empty answer must not render as silence the user reads as being ignored');
});

test('NW-007', 'an unreachable co-pilot says the turn was NOT sent to the host model', () => {
  assert.ok(/NOT sent to \$\{provider\}/.test(SRC),
    'the user must know their message went nowhere \u2014 otherwise they wait for an answer from a model that never received it');
});

test('NW-008', 'follow-ups keep context \u2014 one co-pilot session per chat tab', () => {
  assert.ok(/sessionId: _sessionId\(\)/.test(SRC), 'a sessionId must be sent');
  assert.ok(/location\.pathname\.match/.test(SRC),
    'derived from the chat URL so a reload continues the thread rather than silently starting a new one');
});

// ── Interception ─────────────────────────────────────────────────────────────
test('NW-009', 'the listener is CAPTURE-PHASE \u2014 it must beat the host Enter handler', () => {
  assert.ok(/addEventListener\('keydown', onKeyDown, true\)/.test(SRC),
    'without capture the host app sends the turn first and the interception is too late');
});

test('NW-010', 'an intercepted turn is fully stopped \u2014 the model never sees it', () => {
  for (const call of ['preventDefault()', 'stopPropagation()', 'stopImmediatePropagation()']) {
    assert.ok(SRC.includes(call), `missing ${call} \u2014 the turn can still reach the host model`);
  }
});

// ── The agent hint ───────────────────────────────────────────────────────────
test('NW-011', 'hint mode is PER-PROVIDER and matches the plan economics', () => {
  const d = WAKE.HINT_MODE_DEFAULTS;
  assert.strictEqual(d.claude, 'off', 'claude is metered \u2014 no per-turn injection by default');
  for (const p of ['chatgpt', 'gemini', 'perplexity']) {
    assert.strictEqual(d[p], 'once', `${p} is flat-rate \u2014 once is enough for the model to know the tool exists`);
  }
});

test('NW-012', "'once' really means once \u2014 the second turn is untouched", () => {
  const w = _installStub({ provider: 'chatgpt' });
  const a = w.decorate('first');
  const b = w.decorate('second');
  assert.ok(a.includes('[NEXUS]'), 'the first turn should carry the hint');
  assert.strictEqual(b, 'second', 'the second turn must be clean \u2014 repeated trailing text is what makes a model start remarking on it');
  w.uninstall();
});

test('NW-013', "'off' never injects, on any turn", () => {
  const w = _installStub({ provider: 'claude' });
  for (let i = 0; i < 3; i++) assert.strictEqual(w.decorate('x'), 'x');
  w.uninstall();
});

test('NW-014', "'every' is available because it was asked for, and is NOT a default", () => {
  const w = _installStub({ provider: 'chatgpt', hintMode: 'every' });
  assert.ok(w.decorate('a').includes('[NEXUS]'));
  assert.ok(w.decorate('b').includes('[NEXUS]'));
  w.uninstall();
  assert.ok(!Object.values(WAKE.HINT_MODE_DEFAULTS).includes('every'),
    "'every' must not be any provider's default");
});

test('NW-015', 'resetHint() makes "once" mean once per CONVERSATION', () => {
  const w = _installStub({ provider: 'chatgpt' });
  assert.ok(w.decorate('one').includes('[NEXUS]'));
  assert.strictEqual(w.decorate('two'), 'two');
  w.resetHint();
  assert.ok(w.decorate('new chat').includes('[NEXUS]'));
  w.uninstall();
});

test('NW-016', 'the hint tells the model to ASK rather than guess at system state', () => {
  assert.ok(/Prefer asking over guessing/.test(WAKE.HINT),
    'the whole point is replacing invented system state with real state');
});

test('NW-017', 'install without a provider is refused (\u00a71.1)', () => {
  assert.strictEqual(WAKE.install({}), null);
  assert.strictEqual(WAKE.install(), null);
});

test('NW-018', 'health() reports what is armed \u2014 discoverable, not folklore', () => {
  const w = _installStub({ provider: 'gemini' });
  const h = w.health();
  assert.strictEqual(h.installed, true);
  assert.strictEqual(h.provider, 'gemini');
  assert.strictEqual(h.hintMode, 'once');
  assert.ok(/hey nexus/.test(h.wakeWord));
  w.uninstall();
  assert.strictEqual(w.health().installed, false);
});

// ── Real answer injection — James: "so close, just needs to send it back
// as a job and ack to inject into the chat like its user input" ───────────
test('NW-019', 'install(ctx) destructures injectText/submit from ctx, not just provider/tabId/log', () => {
  assert.ok(/const \{ provider, tabId, ncpUrl[^}]*injectText, submit/.test(SRC),
    'expected injectText/submit to actually be pulled out of ctx, not just documented in a comment');
});

test('NW-020', 'a real, successful answer calls injectText(answer) — the actual fix, not just the render-to-a-floating-box path', () => {
  const idx = SRC.indexOf('askNexus(ask)');
  const block = SRC.slice(idx, idx + 2200);
  // §UPDATED 2026-09-12 — both real call sites (onKeyDown here, and
  // checkMessage below) now route through the one shared _injectAndTrack()
  // helper instead of each having its own copy of the same guard+call, so
  // there's one real mechanism instead of two that could drift (§10.3) —
  // the actual injectText() guard+call this test cares about now lives in
  // _injectAndTrack's own definition, checked directly in NW-033 below.
  assert.ok(/_injectAndTrack\(answer\)/.test(block));
});

test('NW-021', 'the real fix deliberately never calls submit() after injectText() — confirmed real: each provider\'s own submit() clicks the actual send button, which would dispatch nexus\'s own answer AS A NEW TURN to the real, costed model — exactly what this whole feature exists to avoid', () => {
  const idx = SRC.indexOf('askNexus(ask)');
  const block = SRC.slice(idx, idx + 2200);
  assert.ok(!/injectText\(answer\);[\s\S]{0,80}submit\(\)/.test(block),
    'submit() must not be chained after injectText() — that would spend a real request on nexus\'s own answer text');
});

test('NW-022', 'all 5 real provider userscripts now actually pass injectText/submit into install() — confirmed missing from every real call site before this fix, not assumed present from the ctx docstring alone', () => {
  for (const f of ['nexus-hey-claude.user.js', 'userscript-chatgpt.js', 'userscript-claude.js', 'userscript-gemini.js', 'userscript-perplexity.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', f), 'utf8');
    assert.ok(/NexusWake\.install\(\{ provider: PROVIDER, tabId: MY_TAB, injectText, submit,/.test(src),
      `${f} should pass its own real injectText/submit into install()`);
  }
});

test('NW-023', 'each of the 5 real provider files genuinely defines its own injectText/submit functions being passed in — not passing an undefined identifier', () => {
  for (const f of ['nexus-hey-claude.user.js', 'userscript-chatgpt.js', 'userscript-claude.js', 'userscript-gemini.js', 'userscript-perplexity.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', f), 'utf8');
    assert.ok(/^function injectText\(/m.test(src), `${f} should define its own real injectText()`);
    assert.ok(/^function submit\(/m.test(src), `${f} should define its own real submit()`);
  }
});

// ── Agent-echo wake detection — James: "you know it activates when the
// agents say it right?" ─────────────────────────────────────────────────
test('NW-024', 'chatgpt.js now has a real wakeHandledIndex dedup field on _nexus, matching claude.js\'s already-proven real fix', () => {
  const chatgptSrc = fs.readFileSync(path.join(ROOT, 'guardian', 'userscript-chatgpt.js'), 'utf8');
  assert.ok(/wakeHandledIndex:\s*-1/.test(chatgptSrc));
});

test('NW-025', 'chatgpt.js\'s observer callback checks for the wake phrase on EVERY mutation, not just when msgs.length changes — the exact real bug class claude.js already found and fixed for streaming messages', () => {
  const chatgptSrc = fs.readFileSync(path.join(ROOT, 'guardian', 'userscript-chatgpt.js'), 'utf8');
  const idx = chatgptSrc.indexOf('function _nexusStartObserver');
  const block = chatgptSrc.slice(idx, idx + 2000);
  const checkIdx = block.indexOf('window.__nexusWakeInstance__.checkMessage');
  const shortCircuitIdx = block.indexOf('if (msgs.length === _nexus.lastMsgCount) return;');
  assert.ok(checkIdx !== -1 && shortCircuitIdx !== -1, 'expected both the real wake-check and the count short-circuit to exist');
  assert.ok(checkIdx < shortCircuitIdx, 'the wake-check must run BEFORE the count-gated short-circuit, or a streaming message is only ever checked once, while still empty');
});

test('NW-026', 'chatgpt.js\'s wake-check correctly dedups on wakeHandledIndex — will not re-fire askNexus() on every mutation of an already-handled message', () => {
  const chatgptSrc = fs.readFileSync(path.join(ROOT, 'guardian', 'userscript-chatgpt.js'), 'utf8');
  const idx = chatgptSrc.indexOf('function _nexusStartObserver');
  const block = chatgptSrc.slice(idx, idx + 2000);
  assert.ok(/_nexus\.wakeHandledIndex !== newestIdx/.test(block));
  assert.ok(/if \(handled\) _nexus\.wakeHandledIndex = newestIdx;/.test(block));
});

test('NW-027', '0.39.252 — checkMessage() no longer answers in the page: no askNexus, no overlay, no injectText (was: injected the answer into the composer unsent)', () => {
  const idx = SRC.indexOf('checkMessage(role, text) {');
  const end = SRC.indexOf('uninstall()', idx);
  const block = SRC.slice(idx, end);
  assert.ok(idx > 0 && end > idx);
  for (const re of [/askNexus\(/, /_render\(/, /injectText\(/, /_injectAndTrack\(/, /ledgerWrite\(/]) assert.ok(!re.test(block), `checkMessage still calls ${re}`);
});

test('NW-028', 'checkMessage() never calls submit() either — same real cost-safety principle as the onKeyDown path', () => {
  const idx = SRC.indexOf('checkMessage(role, text)');
  const block = SRC.slice(idx, idx + 900);
  assert.ok(!/injectText\(answer\);[\s\S]{0,80}submit\(\)/.test(block));
});

test('NW-029', 'HONEST GAP, named not hidden — gemini.js and perplexity.js still have ZERO message-observing architecture at all (no _nexusStartObserver, no _nexusGetMessages), confirmed directly — this fix covers claude and chatgpt only (2 of 5 real providers); the other two need a genuinely new observer built, not this same porting fix', () => {
  for (const f of ['userscript-gemini.js', 'userscript-perplexity.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', f), 'utf8');
    assert.ok(!/function _nexusStartObserver/.test(src), `${f} confirmed to still lack this architecture — if this ever fails, update this test, don't just delete it`);
  }
});

// ── §BUILT 2026-09-07 — James, with a real screenshot: "see the black
// box, thats where it gets delivered. it needs to deliver as a job."
// A wake-word exchange only ever existed in the floating overlay,
// invisible to guardian's real ledger/job system. Real fix reuses the
// exact same GUARDIAN_LEDGER_WRITE mechanism this same userscript
// family already sends elsewhere for other real events.

test('NW-030', '0.39.252 — checkMessage() only REPORTS a wake: it asks nothing, renders nothing, types nothing, writes no ledger — guardian\'s wake-loop answers the agent from the completed reply, as a job (James: "it is for the agents to talk to nexus. not me")', () => {
  const writes = [], typed = [], sent = [], gm = [], made = [];
  global.GM_xmlhttpRequest = (r) => gm.push(r);
  const inst = _installStub({ provider: 'chatgpt', tabId: 't1', ledgerWrite: (e) => writes.push(e),
    injectText: (t) => typed.push(t), submit: () => sent.push(1) });
  const createElement = global.document.createElement;
  global.document.createElement = (...a) => { made.push(a[0]); return createElement(...a); };
  try {
    // The exact streaming fragment from James's log, then the finished line.
    assert.strictEqual(inst.checkMessage('assistant', 'hey nexus, w'), true);
    assert.strictEqual(inst.checkMessage('assistant', 'hey nexus, what\'s the current state of the dangling-hook failures?'), true);
    assert.strictEqual(inst.checkMessage('assistant', 'the build is green'), false);
    assert.deepStrictEqual([writes.length, typed.length, sent.length, gm.length, made.length], [0, 0, 0, 0, 0],
      `side effects: ledger ${writes.length}, typed ${typed.length}, sent ${sent.length}, copilot requests ${gm.length}, elements ${made.length}`);
  } finally { delete global.GM_xmlhttpRequest; global.document.createElement = createElement; }
});

test('NW-031', 'a missing ledgerWrite (an older caller that never passes it) does not crash checkMessage — real, honest default', () => {
  const inst = _installStub({ provider: 'chatgpt', tabId: 't1' }); // no ledgerWrite at all
  assert.doesNotThrow(() => inst.checkMessage('assistant', 'hey nexus, status'));
});

test('NW-032', 'all 4 real provider userscripts that call install() now pass a real ledgerWrite wired to their own send()', () => {
  for (const f of ['userscript-chatgpt.js', 'userscript-claude.js', 'userscript-gemini.js', 'userscript-perplexity.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'guardian', f), 'utf8');
    assert.ok(/ledgerWrite:\s*\(e\)\s*=>\s*send\(\{\s*type:'GUARDIAN_LEDGER_WRITE'/.test(src), `${f} does not wire a real ledgerWrite into install()`);
  }
});

// ── §BUGFIX 2026-09-12 — James: "wake word needs to work more than once."
// Root cause traced, not guessed: injectText(answer) (2026-09-07, correct
// and deliberate on its own) leaves nexus's answer sitting in the real
// composer. WAKE_RE is anchored ^\s* on purpose (this file's own header —
// a greedy match anywhere would hijack ordinary prose), so a second wake
// phrase typed after that leftover text no longer starts with "hey nexus"
// and silently falls through unintercepted. Fix: _injectAndTrack() records
// exactly what it injected; onKeyDown strips a leading exact match of that
// before running parseWake. NW-033 checks the shared helper's own real
// guard+tracking; NW-034 exercises the actual reported symptom end-to-end.
test('NW-033', '_injectAndTrack() is the one real place with the injectText guard, and it tracks what it injected', () => {
  const idx = SRC.indexOf('function _injectAndTrack');
  assert.ok(idx >= 0, '_injectAndTrack must exist as the one shared real mechanism (§10.3), not duplicated per call site');
  const block = SRC.slice(idx, idx + 300);
  assert.ok(/if \(typeof injectText !== 'function'\) return;/.test(block) || /typeof injectText === 'function'/.test(block));
  assert.ok(/injectText\(text\)/.test(block), '_injectAndTrack must call the real injectText()');
  assert.ok(/_lastInjectedAnswer\s*=\s*text/.test(block), '_injectAndTrack must record what it injected, or the strip-on-next-wake fix below has nothing to strip');
});

// ── minimal DOM so install() can run under node ─────────────────────────────
function _installStub(ctx) {
  const listeners = [];
  const el = { style: {}, setAttribute() {}, getAttribute() { return ''; },
               hasAttribute() { return false; }, appendChild() {}, remove() {},
               querySelector() { return null; }, onclick: null, textContent: '', innerHTML: '' };
  global.document = {
    addEventListener: (t, fn, cap) => listeners.push([t, fn, cap]),
    removeEventListener: () => {},
    querySelector: () => null,
    getElementById: () => null,
    createElement: () => ({ ...el, style: {}, appendChild() {}, setAttribute() {} }),
    body: { appendChild() {} },
  };
  global.location = { href: 'https://chatgpt.com/c/abc12345', pathname: '/c/abc12345' };
  return WAKE.install(ctx);
}

// ── NW-034 — real end-to-end async check, run in its own isolated tail
// (deliberately NOT using the shared, synchronous test() helper above: this
// test's assertions depend on askNexus()'s real Promise/.then() chain
// actually settling, which takes one real microtask tick after the
// synchronous keydown handler returns — making test() itself async would
// have required every OTHER call site in this file to be awaited too, for
// no benefit to 33 already-synchronous tests, and risked process.exit()
// firing before their deferred output flushed). Same id/pass/fail
// bookkeeping and console output shape as test(), just async. ─────────────
async function testAsync(id, name, fn) {
  try { await fn(); passed++; console.log(`  \u2713 ${id} ${name}`); }
  catch (e) { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); }
}

(async () => {
  await testAsync('NW-034', 'a second "hey nexus" typed right after the first answer was injected is still intercepted, not sent to the real model', async () => {
    const listeners = [];
    const fakeEl = { isContentEditable: true, textContent: '', closest: () => null };
    global.document = {
      addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
      removeEventListener: () => {},
      querySelector: () => null,
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild(){}, setAttribute(){}, remove(){}, querySelector(){ return null; }, get scrollHeight(){ return 0; } }),
      body: { appendChild() {} },
    };
    global.location = { href: 'https://chatgpt.com/c/nw034', pathname: '/c/nw034' };

    const injectedTexts = [];
    const askedPrompts = [];
    // Real GM_xmlhttpRequest is a browser-userscript global; mocked the
    // same way the wake feature's own real onload/resolve() contract
    // expects — not testing network behavior, only the composer-text-
    // stripping fix.
    global.GM_xmlhttpRequest = (opts) => {
      const body = JSON.parse(opts.data);
      // §FIX — this mock handles BOTH the real ask (askNexus, POST to
      // .../api/prompt/tools) and ackWakeJob's own separate follow-up call
      // (POST to .../wake-job-ack) — both real payloads happen to include
      // a `.prompt` field, so only counting the genuine ask here, by URL,
      // keeps askedPrompts an accurate count of real co-pilot asks.
      if (opts.url.endsWith('/wake-job-ack')) { opts.onload({ status: 200, responseText: '{}' }); return; }
      askedPrompts.push(body.prompt);
      opts.onload({ status: 200, responseText: JSON.stringify({ text: 'the real answer' }) });
    };

    const inst = WAKE.install({
      provider: 'chatgpt', tabId: 'tab-nw034',
      injectText: (t) => { injectedTexts.push(t); fakeEl.textContent = t; },
      submit: () => { throw new Error('submit() must never be called by this feature'); },
    });

    const kd = listeners.find(l => l.type === 'keydown');
    assert.ok(kd, 'onKeyDown must be registered via document.addEventListener');

    // §WHY THE FLUSH — askNexus() is itself an async function that
    // additionally returns `new Promise(...)` internally: unwrapping an
    // async function's own returned promise takes an extra microtask hop
    // on top of the inner Promise's own .then() hop. A handful of
    // Promise.resolve() ticks covers this reliably without depending on
    // an exact count that could drift with a future Node/engine version.
    async function flushMicrotasks(n = 6) { for (let i = 0; i < n; i++) await Promise.resolve(); }
    function pressEnter() {
      let defaultPrevented = false;
      kd.fn({ key: 'Enter', shiftKey: false, isComposing: false, target: fakeEl,
              preventDefault: () => { defaultPrevented = true; },
              stopPropagation: () => {}, stopImmediatePropagation: () => {} });
      return defaultPrevented;
    }

    // First wake — composer starts empty.
    fakeEl.textContent = 'hey nexus, first question';
    const firstIntercepted = pressEnter();
    await flushMicrotasks();
    assert.strictEqual(firstIntercepted, true, 'first wake phrase must be intercepted');
    assert.strictEqual(askedPrompts.length, 1);
    assert.strictEqual(injectedTexts.length, 1);

    // Composer now holds the injected answer, exactly as injectText leaves
    // it. A second wake phrase typed WITHOUT clearing it first — the real,
    // reported scenario — appends after the leftover text.
    fakeEl.textContent = injectedTexts[0] + 'hey nexus, second question';
    const secondIntercepted = pressEnter();
    await flushMicrotasks();
    assert.strictEqual(secondIntercepted, true,
      'second wake phrase must still be intercepted after leftover injected text — this is the exact reported bug');
    assert.strictEqual(askedPrompts.length, 2, 'the second ask must actually reach co-pilot');
    assert.strictEqual(askedPrompts[1], 'second question');

    inst.uninstall();
    delete global.GM_xmlhttpRequest;
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();