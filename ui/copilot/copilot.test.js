'use strict';
/**
 * ui/copilot/copilot.test.js — smoke test for the extracted co-pilot runtime.
 * Same spirit as ui/lib/api.test.js: load the real file into a real DOM,
 * verify it behaves exactly like the inline code it replaced.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function freshDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <input id="assistant-in">
    <div id="assistant-out"></div>
  </body></html>`, { runScripts: 'dangerously' });
  const { window } = dom;
  window.CP = { exec: () => {} }; // real one comes from spotlight.js — stub here
  window.NEXUS_UI_STATE = { snapshot: () => '{}' };
  const src = fs.readFileSync(path.join(__dirname, 'copilot.js'), 'utf8');
  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = src;
  window.document.body.appendChild(scriptEl);
  return window;
}

async function run() {
  let failures = 0;
  function check(cond, label) {
    if (cond) console.log('PASS:', label);
    else { console.error('FAIL:', label); failures++; }
  }

  // ── Case 1: loads clean, exposes the expected API ──────────────────────
  const w1 = freshDom();
  check(typeof w1.CoPilot === 'object', 'CoPilot loads as a global object');
  check(typeof w1.CoPilot.init === 'function'
     && typeof w1.CoPilot.send === 'function'
     && typeof w1.CoPilot.navigateHistory === 'function',
     'init/send/navigateHistory are all real functions');

  // ── Case 2: send() throws a clear error if init() was never called ─────
  const w2 = freshDom();
  w2.document.getElementById('assistant-in').value = 'hello';
  let threwUninitialized = false;
  try { await w2.CoPilot.send(); } catch (e) { threwUninitialized = /init\(deps\)/.test(e.message); }
  check(threwUninitialized, 'send() without init() fails loud with a clear message, not a silent no-op');

  // ── Case 3: send() posts the right shape and renders a successful reply ─
  const w3 = freshDom();
  let capturedUrl = null, capturedBody = null;
  const tuneCalls = [];
  w3.CoPilot.init({
    B: { orch: 'http://127.0.0.1:9000' },
    CH_META: [{ id: 'ch-overview', name: 'Overview' }],
    getCurCh: () => 0,
    tune: (idx) => tuneCalls.push(idx),
    post: async (url, body) => { capturedUrl = url; capturedBody = body; return { ok: true, text: 'hi there' }; },
  });
  w3.document.getElementById('assistant-in').value = 'hello';
  await w3.CoPilot.send();
  check(capturedUrl === 'http://127.0.0.1:9000/api/guardian/copilot/prompt', 'send() posts to the correct orchestrator route');
  check(capturedBody.prompt === 'hello' && capturedBody.channel === 'ch-overview', 'send() sends the correct prompt/channel shape');
  check(w3.document.getElementById('assistant-out').textContent === 'hi there', 'send() renders the response text into #assistant-out');
  check(w3.document.getElementById('assistant-in').value === '', 'send() clears the input after sending');

  // ── Case 4: null response (orchestrator/copilot unreachable) ───────────
  const w4 = freshDom();
  w4.CoPilot.init({
    B: { orch: 'http://127.0.0.1:9000' }, CH_META: [{ id: 'ch-overview' }], getCurCh: () => 0,
    tune: () => {}, post: async () => null,
  });
  w4.document.getElementById('assistant-in').value = 'hello';
  await w4.CoPilot.send();
  check(/Orchestrator unreachable/.test(w4.document.getElementById('assistant-out').textContent),
    'send() shows the correct unreachable message when post() returns null');

  // ── Case 5: navigateHistory cycles correctly across two prompts ────────
  const w5 = freshDom();
  w5.CoPilot.init({
    B: { orch: 'http://127.0.0.1:9000' }, CH_META: [{ id: 'ch-overview' }], getCurCh: () => 0,
    tune: () => {}, post: async () => ({ ok: true, text: 'ok' }),
  });
  w5.document.getElementById('assistant-in').value = 'first prompt';
  await w5.CoPilot.send();
  w5.document.getElementById('assistant-in').value = 'second prompt';
  await w5.CoPilot.send();
  const up1 = w5.CoPilot.navigateHistory('up');
  const up2 = w5.CoPilot.navigateHistory('up');
  const down1 = w5.CoPilot.navigateHistory('down');
  check(up1 === 'second prompt' && up2 === 'first prompt' && down1 === 'second prompt',
    'navigateHistory cycles most-recent-first, matches the original inline asHist/asIdx behavior');

  // ── Case 6: navigate action calls the injected tune() ──────────────────
  const w6 = freshDom();
  const tuneCalls6 = [];
  w6.CoPilot.init({
    B: { orch: 'http://127.0.0.1:9000' },
    CH_META: [{ id: 'ch-overview' }, { id: 'ch-guardian' }],
    getCurCh: () => 0,
    tune: (idx) => tuneCalls6.push(idx),
    post: async () => ({ ok: true, text: 'going', action: 'navigate', ui: { command: 'tuneById', arg: 'ch-guardian' } }),
  });
  w6.document.getElementById('assistant-in').value = 'go to guardian';
  await w6.CoPilot.send();
  await new Promise(r => setTimeout(r, 400)); // send() uses a 350ms setTimeout before calling tune()
  check(tuneCalls6[0] === 1, 'navigate action calls the injected tune() with the correct channel index');

  // ── Case 7: onGuardianEvent live-updates status/text while a send() is
  //    in flight, then the real response replaces it once post() resolves ─
  const w7 = freshDom();
  let resolvePost;
  const postPromise = new Promise((resolve) => { resolvePost = resolve; });
  let capturedTimeout = null;
  w7.CoPilot.init({
    B: { orch: 'http://127.0.0.1:9000' }, CH_META: [{ id: 'ch-overview' }], getCurCh: () => 0,
    tune: () => {},
    post: async (url, body, timeoutMs) => { capturedTimeout = timeoutMs; return postPromise; },
  });
  w7.document.getElementById('assistant-in').value = 'hello';
  const sendPromise = w7.CoPilot.send();

  // A live chunk event arrives while the dispatch is still pending.
  w7.CoPilot.onGuardianEvent({ type: 'job.chunk', jobId: 'job-abc123', full: 'partial live text', ts: Date.now() });
  const outDuring = w7.document.getElementById('assistant-out').textContent;
  check(outDuring.includes('job-abc1') && outDuring.includes('streaming') && outDuring.includes('partial live text'),
    'onGuardianEvent renders live jobId/status/text into #assistant-out while send() is pending');
  check(capturedTimeout === 90000, 'send() passes a real, matching dispatch timeout (90000ms) to post(), not the old 8s default');

  // An event for a DIFFERENT jobId is ignored (best-effort correlation
  // must not let an unrelated job overwrite this one's live preview).
  w7.CoPilot.onGuardianEvent({ type: 'job.chunk', jobId: 'unrelated-job', full: 'should not appear', ts: Date.now() });
  check(!w7.document.getElementById('assistant-out').textContent.includes('should not appear'),
    'onGuardianEvent ignores events for a jobId other than the one already adopted');

  // Real response lands — replaces the live preview entirely.
  resolvePost({ ok: true, text: 'the real final answer' });
  await sendPromise;
  check(w7.document.getElementById('assistant-out').textContent === 'the real final answer',
    'the real post() response replaces the live preview once it resolves');

  // ── Case 8: onGuardianEvent never throws with no pending send ──────────
  const w8 = freshDom();
  let threw8 = false;
  try { w8.CoPilot.onGuardianEvent({ type: 'job.chunk', jobId: 'x', full: 'y' }); }
  catch (e) { threw8 = true; }
  check(!threw8, 'onGuardianEvent is a safe no-op when no send() is in flight');

  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} — copilot.js ${failures === 0 ? 'is a safe drop-in replacement for the inline asSend()' : 'has real regressions, do not ship'}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch(e => { console.error('SMOKE TEST CRASHED:', e); process.exit(1); });
