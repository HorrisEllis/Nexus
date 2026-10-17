'use strict';
/**
 * tests/modules/test-live-everywhere.test.js — LV1 + LV4 (0.60.142), the guardian and userscript side of "see it live".
 * Map: docs/2026-10-16-code-tab-rebuild-phasemap.spec addendum (h).
 * James, 2026-10-17: "modified a file but no where to be found. i want to see it live in the code tab. … like i want to see
 * all agent responses in realtime,"
 * (LV2's Code › changes and open-file streaming, and LV3's docked Plan, are driven in Clear Glass by test-agent-live LS-05
 * and test-plan-pieces PP-03.)
 *
 *   LV-01  guardian's NCP handler: a chunk carrying only the model's thinking (gemini thinks for minutes before its reply has
 *          a word) is passed on as guardian.job.chunk with its thinking, the job responding; a reply chunk carries its
 *          thinking too; a chunk with neither is nothing
 *   LV-02  the transcript streamer, run as the page runs it (gemini's own code, in a sandbox): while the reply is empty and
 *          the thinking grows, chunks go out with the thinking; when the reply starts, it streams with the thinking;
 *          nothing is sent twice; another turn's thinking is never sent; all five provider scripts carry the same change,
 *          and their versions moved
 *   LV-03  a picked selector without its volatile parts: his gemini pick (ng-tns-*, processing-state-visible,
 *          :nth-of-type(2)) becomes one that matches the next reply; stable selectors unchanged; a pick saved before is
 *          repaired on read (mapFor); a new pick is stored stable, the pick as made kept on its evidence
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  await test('LV-01', 'guardian passes a thinking-only chunk, and a reply chunk with its thinking', () => quiet(() => {
    const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));
    const bus = new EventEmitter(); const jobs = new Map();
    const h = createNCPMessageHandler({
      nc: null, ncp: { updateClient() {}, push() {}, pushTab() { return true; }, handleHeartbeat() {} },
      bus, jaa: { insert() {}, query: () => [] }, jobs,
      updateJob: (id, p) => { const j = jobs.get(id); if (j) Object.assign(j, p); return j; }, cockpitBroadcast() {},
      physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null, activeQueues: new Map(),
      extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null,
    });
    const seen = []; bus.on('guardian.job.chunk', (d) => seen.push(d));
    jobs.set('g1', { id: 'g1', provider: 'gemini', agentId: 'repo-r1', status: 'delivered' });
    h({ type: 'GUARDIAN_CHUNK', jobId: 'g1', text: '', thinking: 'Reading the phase…', thinkingLen: 18, source: 'transcript', generating: true });
    assert.strictEqual(seen.length, 1, 'the thinking went on');
    assert.deepStrictEqual([seen[0].text, seen[0].thinking, seen[0].thinkingLen, seen[0].provider], ['', 'Reading the phase…', 18, 'gemini']);
    assert.strictEqual(jobs.get('g1').status, 'responding', 'the job is answering');
    h({ type: 'GUARDIAN_CHUNK', jobId: 'g1', text: 'Here it is', full: 'Here it is', thinking: 'Reading the phase… done', source: 'transcript' });
    assert.strictEqual(seen.length, 2); assert.strictEqual(seen[1].text, 'Here it is'); assert.strictEqual(seen[1].thinking, 'Reading the phase… done');
    h({ type: 'GUARDIAN_CHUNK', jobId: 'g1', text: '' });
    assert.strictEqual(seen.length, 2, 'neither text nor thinking: nothing');
  }));

  await test('LV-02', 'the transcript streamer, as the page runs it: thinking first, then the reply; once each; five scripts', () => {
    const src = fs.readFileSync(path.join(ROOT, 'guardian/userscript-gemini.js'), 'utf8');
    const from = src.indexOf('const _TX_STREAM_MS'), to = src.indexOf('// §ANCHOR 0.39.244');
    assert.ok(from > 0 && to > from, 'the streamer is where it was');
    const sent = [];
    const ctx = { setTimeout, clearTimeout, sent, chat: { messages: [] }, currentJobId: 'g9',
      _nexusGetFullChat: () => ctx.chat, _isGenerating: () => true, send: (m) => sent.push(m), PROVIDER: 'gemini', location: { href: 'https://gemini.google.com/app/x' } };
    vm.createContext(ctx);
    vm.runInContext(`${src.slice(from, to)}\nthis._txJobStart = _txJobStart; this._txStreamTick = _txStreamTick;`, ctx);
    // an earlier turn on the page, with its own thinking: never this job's
    ctx.chat = { messages: [{ role: 'user', text: 'old question' }, { role: 'assistant', text: 'old answer', thinking: 'old thinking' }] };
    ctx._txJobStart({ jobId: 'g9', prompt: 'Build phase IM1 of the map' });
    ctx._txStreamTick();
    assert.strictEqual(sent.length, 0, 'its turn is not on the page yet: nothing, and never the old thinking');
    // its turn: the reply empty, the model thinking
    ctx.chat.messages.push({ role: 'user', text: 'Build phase IM1 of the map' }, { role: 'assistant', text: '', thinking: 'Reading the phase.' });
    ctx._txStreamTick();
    assert.strictEqual(sent.length, 1);
    assert.deepStrictEqual([sent[0].type, sent[0].text, sent[0].thinking, sent[0].thinkingLen], ['GUARDIAN_CHUNK', '', 'Reading the phase.', 18]);
    ctx._txStreamTick();
    assert.strictEqual(sent.length, 1, 'nothing changed: nothing sent');
    ctx.chat.messages[3].thinking = 'Reading the phase. The census needs a command row.';
    ctx._txStreamTick();
    assert.strictEqual(sent.length, 2); assert.match(sent[1].thinking, /census needs a command row/);
    ctx.chat.messages[3].text = 'Here it is:';
    ctx._txStreamTick();
    assert.strictEqual(sent.length, 3); assert.strictEqual(sent[2].text, 'Here it is:'); assert.ok(sent[2].thinking, 'the reply carries its thinking');
    for (const f of ['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity']) {
      const s = fs.readFileSync(path.join(ROOT, `guardian/userscript-${f}.js`), 'utf8');
      assert.ok(/let _txLastThinking = '';/.test(s) && /\.\.\.\(thinking \? \{ thinking: thinking\.slice\(-12000\), thinkingLen: thinking\.length \} : \{\}\)/.test(s), `${f}: the same change`);
      const v = (s.match(/@version\s+(\S+)/) || [])[1];
      assert.ok(v && s.includes(`'${v}'`), `${f}: header and VERSION agree (${v})`);
    }
  });

  await test('LV-03', 'a picked selector without its volatile parts; repaired on read; stored stable, the pick kept', () => quiet(() => {
    const SM = require(path.join(ROOT, 'guardian/lib/selector-map.js'));
    const his = 'div.presented-response-container.ng-tns-c3086213896-11:nth-of-type(2) > div.response-container-content.ng-tns-c3086213896-11 > div.response-content.ng-tns-c3086213896-11 > structured-content-container.model-response-text.processing-state-visible';
    assert.strictEqual(SM.stableSelector(his, { key: 'resp' }), 'div.presented-response-container > div.response-container-content > div.response-content > structured-content-container.model-response-text');
    for (const [sel, key] of [['div.group', 'resp'], ['textarea#prompt-textarea', 'input'], ['button[aria-label="Send message"]', 'send'], ['div[contenteditable="true"].ProseMirror', 'input']]) assert.strictEqual(SM.stableSelector(sel, { key }), sel, `${sel} unchanged`);
    assert.strictEqual(SM.stableSelector('li:nth-child(2) > button', { key: 'send' }), 'li:nth-child(2) > button', 'a send button keeps its position (it is not the last reply)');
    assert.strictEqual(SM.stableSelector('main article:nth-child(3) .markdown.is-streaming._ngcontent-abc-1', { key: 'resp' }), 'main article .markdown');
    assert.strictEqual(SM.stableSelector('.processing-state-visible', { key: 'resp' }), '*', 'nothing stable left: any element (the field map then takes the last)');
    // read: a pick saved before this release is repaired without picking again
    const store = { gemini: { selectors: { resp: his, input: 'rich-textarea .ql-editor' }, selectorHistory: [{ to: { resp: his }, source: 'picker', evidence: { url: 'https://gemini.google.com/app', matched: 1 } }] } };
    const reg = { get: (p) => store[p], recordRepair: (p, sel, meta) => { store[p].selectors = { ...store[p].selectors, ...sel }; store[p].selectorHistory.push({ to: sel, ...meta }); return { changed: true }; } };
    const m = SM.mapFor(reg, 'gemini');
    assert.strictEqual(m.selectors.resp, 'div.presented-response-container > div.response-container-content > div.response-content > structured-content-container.model-response-text');
    assert.strictEqual(m.verified.resp, true, 'still the person\'s verified pick');
    // a new pick: stored stable, the pick as made on its evidence
    const r = SM.assign(reg, { push: () => 1 }, 'gemini', { resp: 'model-response-text.processing-state-visible:nth-of-type(4)' }, { source: 'picker', evidence: { url: 'https://gemini.google.com/app/y', matched: 1 } });
    assert.ok(r.ok);
    assert.strictEqual(store.gemini.selectors.resp, 'model-response-text');
    const last = store.gemini.selectorHistory[store.gemini.selectorHistory.length - 1];
    assert.strictEqual(last.evidence.picked.resp, 'model-response-text.processing-state-visible:nth-of-type(4)', 'nothing lost: the pick as made');
  }));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
