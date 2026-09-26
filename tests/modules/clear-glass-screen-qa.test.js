'use strict';
/**
 * tests/modules/clear-glass-screen-qa.test.js
 *
 * §BUILT 2026-09-21 — James: "clearglass needs to help me with job
 * applications, answering on screen questions... inject dom into
 * copilot cli and have it answer any questions on the screen."
 *
 * Backend kernel only (clear-glass/src/screen-qa/detector.js's own
 * header names what's still unbuilt on top of it — hotkey, right-click
 * menu, element-picker mode, settings UI, dual preview). These tests
 * cover exactly what was built: deriveQuestion (pure), detectOpenQuestions
 * (real orchestration against a stubbed dom, same stubbing shape
 * clear-glass-accounts.test.js already uses for its own dependencies),
 * buildAnswerPrompt (pure), answerQuestion and injectAnswer (real
 * orchestration against injected send/dom, honestly failing when either
 * does).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function atest(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

function freshAutofillStore() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-screen-qa-'));
  process.env.HOME = tmpHome;
  delete require.cache[require.resolve('../../clear-glass/src/autofill/store.js')];
  const { AutofillStore } = require('../../clear-glass/src/autofill/store.js');
  return { AutofillStore, cleanup: () => fs.rmSync(tmpHome, { recursive: true, force: true }) };
}

async function main() {
  const origHome = process.env.HOME;
  const D = require('../../clear-glass/src/screen-qa/detector.js');

  // ── deriveQuestion — pure ────────────────────────────────────────────
  await atest('a real <label> wins over everything else', async () => {
    const r = D.deriveQuestion({ label: 'Why do you want this role?', attrs: { 'aria-label': 'x', placeholder: 'y' }, name: 'z' });
    assert.deepStrictEqual(r, { question: 'Why do you want this role?', source: 'label' });
  });
  await atest('aria-label is used when there is no label', async () => {
    const r = D.deriveQuestion({ label: null, attrs: { 'aria-label': 'Describe a challenge' }, name: 'z' });
    assert.deepStrictEqual(r, { question: 'Describe a challenge', source: 'aria-label' });
  });
  await atest('placeholder is used when there is no label or aria-label', async () => {
    const r = D.deriveQuestion({ label: null, attrs: { placeholder: 'Tell us about yourself' }, name: 'z' });
    assert.deepStrictEqual(r, { question: 'Tell us about yourself', source: 'placeholder' });
  });
  await atest('a humanized field name is the last resort, capitalized', async () => {
    const r = D.deriveQuestion({ label: null, attrs: {}, name: 'coverLetterText' });
    assert.strictEqual(r.source, 'name');
    assert.strictEqual(r.question, 'Cover Letter Text');
  });
  await atest('nothing discoverable -> null, never an empty-string guess', async () => {
    assert.strictEqual(D.deriveQuestion({ label: null, attrs: {}, name: null }), null);
  });

  // ── detectOpenQuestions — real orchestration, stubbed dom ────────────
  await atest('a plain open-ended textarea with a label is offered', async () => {
    const dom = { handleQuery: async () => ([
      { id: 'cg1', tag: 'textarea', type: undefined, attrs: {}, label: 'Why do you want to work here?', name: 'why' },
    ]) };
    const r = await D.detectOpenQuestions(dom, null, { agentId: 'default' });
    assert.strictEqual(r.totalFields, 1);
    assert.strictEqual(r.questions.length, 1);
    assert.strictEqual(r.questions[0].question, 'Why do you want to work here?');
  });
  await atest('checkbox/radio/hidden/submit/file inputs are never offered as open questions', async () => {
    const dom = { handleQuery: async () => (['checkbox', 'radio', 'hidden', 'submit', 'file'].map((type, i) => ({ id: `cg${i}`, tag: 'input', type, attrs: { 'aria-label': 'x' }, label: null, name: 'x' }))) };
    const r = await D.detectOpenQuestions(dom, null, {});
    assert.strictEqual(r.questions.length, 0);
  });
  await atest('a field with no real cgId is skipped, same discipline as autofill', async () => {
    const dom = { handleQuery: async () => ([{ tag: 'textarea', attrs: {}, label: 'x', name: 'x' }]) };
    const r = await D.detectOpenQuestions(dom, null, {});
    assert.strictEqual(r.questions.length, 0);
  });
  await atest('a query error is passed through honestly, not swallowed', async () => {
    const dom = { handleQuery: async () => ({ error: 'no live window for default' }) };
    const r = await D.detectOpenQuestions(dom, null, {});
    assert.strictEqual(r.error, 'no live window for default');
  });
  await atest('without a profileId, nothing is excluded — every open-shaped field is offered', async () => {
    const dom = { handleQuery: async () => ([{ id: 'cg1', tag: 'input', type: 'text', attrs: { autocomplete: 'email' }, label: null, name: 'email' }]) };
    const r = await D.detectOpenQuestions(dom, null, {});
    assert.strictEqual(r.questions.length, 1);
  });
  await atest('with a profileId, a field autofill would confidently fill is excluded — the AI is never asked to invent someone\'s own email', async () => {
    const { AutofillStore, cleanup } = freshAutofillStore();
    const store = new AutofillStore();
    store.load();
    const profile = store.createProfile({ label: 'me', fields: { email: 'a@b.com' } });
    const dom = { handleQuery: async () => ([
      { id: 'cg1', tag: 'input', type: 'text', attrs: { autocomplete: 'email' }, label: null, name: 'email' },
      { id: 'cg2', tag: 'textarea', attrs: {}, label: 'Why this company?', name: 'why' },
    ]) };
    const r = await D.detectOpenQuestions(dom, store, { profileId: profile.id });
    assert.strictEqual(r.questions.length, 1);
    assert.strictEqual(r.questions[0].cgId, 'cg2');
    cleanup();
  });

  // ── buildAnswerPrompt — pure ──────────────────────────────────────────
  await atest('the prompt states the question and the context plainly', async () => {
    const p = D.buildAnswerPrompt({ question: 'Why this role?', context: 'Backend engineer, 5 years Node.js.' });
    assert.ok(p.includes('Question: Why this role?'));
    assert.ok(p.includes('Backend engineer, 5 years Node.js.'));
  });
  await atest('no context is stated honestly, not silently omitted', async () => {
    const p = D.buildAnswerPrompt({ question: 'Why this role?', context: '' });
    assert.ok(p.includes('(none given)'));
  });
  await atest('the prompt tells the agent not to invent facts outside the given context', async () => {
    const p = D.buildAnswerPrompt({ question: 'x', context: 'y' });
    assert.ok(/do not invent/i.test(p));
  });

  // ── answerQuestion — real orchestration, injected send ───────────────
  await atest('a real answer is returned trimmed', async () => {
    const r = await D.answerQuestion({ question: 'Why?', context: '' }, async () => '  Because I love building things.  ');
    assert.deepStrictEqual(r, { ok: true, answer: 'Because I love building things.' });
  });
  await atest('no question is refused before any send call is made', async () => {
    let called = false;
    const r = await D.answerQuestion({ question: '', context: '' }, async () => { called = true; return 'x'; });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(called, false);
  });
  await atest('no send function -> honest refusal, not a crash', async () => {
    const r = await D.answerQuestion({ question: 'x' }, null);
    assert.strictEqual(r.ok, false);
    assert.ok(/no answering agent/.test(r.error));
  });
  await atest('send throwing is reported, not fabricated into a fake answer', async () => {
    const r = await D.answerQuestion({ question: 'x' }, async () => { throw new Error('guardian unreachable'); });
    assert.strictEqual(r.ok, false);
    assert.ok(/guardian unreachable/.test(r.error));
  });
  await atest('send returning empty is reported, not treated as a real empty answer', async () => {
    const r = await D.answerQuestion({ question: 'x' }, async () => '   ');
    assert.strictEqual(r.ok, false);
    assert.ok(/no real answer/.test(r.error));
  });

  // ── injectAnswer — real orchestration, stubbed dom ───────────────────
  await atest('injectAnswer calls the real dom.handleMutate with the given cgId and text', async () => {
    let seen = null;
    const dom = { handleMutate: async (args) => { seen = args; return { ok: true }; } };
    const r = await D.injectAnswer(dom, { agentId: 'a1', cgId: 'cg9', text: 'my answer' });
    assert.deepStrictEqual(seen, { agentId: 'a1', cgId: 'cg9', mutation: { value: 'my answer' } });
    assert.deepStrictEqual(r, { ok: true });
  });
  await atest('no cgId is refused before dom is touched', async () => {
    let called = false;
    const dom = { handleMutate: async () => { called = true; } };
    const r = await D.injectAnswer(dom, { text: 'x' });
    assert.ok(r.error);
    assert.strictEqual(called, false);
  });

  // ── the real label-association helper lives where it's used, once ────
  const ARCH = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass', 'src', 'dom', 'archaeology.js'), 'utf8');
  await atest('buildMeta carries label text for real form fields, derived once (not duplicated in detector.js)', () => {
    assert.ok(/function _labelFor\(el\)/.test(ARCH));
    assert.ok(/label:\s*isField \? _labelFor\(el\) : null/.test(ARCH));
  });
  await atest('the label lookup never uses a nested template literal inside DOM_OBSERVER_SCRIPT (it would close the outer script string early)', () => {
    const start = ARCH.indexOf('const DOM_OBSERVER_SCRIPT = `') + 'const DOM_OBSERVER_SCRIPT = `'.length;
    const end = ARCH.indexOf('`;', start);
    const script = ARCH.slice(start, end);
    assert.ok(!/`/.test(script), 'a backtick inside the script body would break it');
    // and the extracted script really does parse as real JS on its own
    new Function(script);
  });

  // ── the REST surface (structural — bridge.js requires electron, not
  // installed in this sandbox, same limit every other clear-glass
  // structural test already states) ────────────────────────────────────
  const BRIDGE = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass', 'src', 'ipc', 'bridge.js'), 'utf8');
  await atest('detect/answer/inject are real routes, delegating to the one real detector module', () => {
    assert.ok(/app\.get\('\/cli\/screen-qa\/detect'/.test(BRIDGE));
    assert.ok(/app\.post\('\/cli\/screen-qa\/answer'/.test(BRIDGE));
    assert.ok(/app\.post\('\/cli\/screen-qa\/inject'/.test(BRIDGE));
    assert.ok(/require\('\.\.\/screen-qa\/detector\.js'\)/.test(BRIDGE));
  });
  await atest('answer never auto-injects — it is a separate call, preview-first per James\'s own answer', () => {
    const answerRoute = BRIDGE.slice(BRIDGE.indexOf("'/cli/screen-qa/answer'"), BRIDGE.indexOf("'/cli/screen-qa/inject'"));
    assert.ok(!/_screenQaInject/.test(answerRoute));
  });
  await atest('answer routes through the real, already-initialized copilot bridge (this.copilot.send), not a new HTTP call', () => {
    const answerRoute = BRIDGE.slice(BRIDGE.indexOf("'/cli/screen-qa/answer'"), BRIDGE.indexOf("'/cli/screen-qa/inject'"));
    assert.ok(/this\.copilot\.send\(/.test(answerRoute));
  });

  process.env.HOME = origHome;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => { console.error('  ! crashed:', e.stack); process.exit(1); });
