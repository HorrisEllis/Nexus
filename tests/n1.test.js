'use strict';
// tests/n1.test.js: phase N1, lib/semantic-variant.js
// Run with: node tests/n1.test.js
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 2026-11-18 — a plain relative require, so lib/test-map.js links this test to the file (a computed path.join is not seen); same module
const SV = require('../lib/semantic-variant.js');

const FENCE = '`'.repeat(3);   // built, never written literally, so the test survives code-block capture
const failures = [];
let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('ok   - ' + name); }
  catch (e) { failures.push(name); console.log('FAIL - ' + name + '\n       ' + (e && e.message)); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-semantic-variant-'));
const markers = (s) => (String(s).match(new RegExp(SV.MARK_RE.source, 'g')) || []);

const q = 'Can you fix lib/dispatcher.js so that runTask returns MAX_RETRIES at v1.2.3? See https://example.com/x and `npm test`.';
const PROTECTED = ['lib/dispatcher.js', 'runTask', 'MAX_RETRIES', 'v1.2.3', 'https://example.com/x', '`npm test`'];

// exports
check('exports exactly the planned names', () => {
  assert.deepStrictEqual(Object.keys(SV).sort(),
    ['MARK_RE', 'NoveltyStore', 'jsVariant', 'protect', 'restore', 'similarity', 'validate']);
  for (const f of ['protect', 'restore', 'validate', 'jsVariant', 'similarity', 'NoveltyStore']) {
    assert.strictEqual(typeof SV[f], 'function', f + ' must be a function');
  }
});

check('MARK_RE is a global regex matching \u27E6n\u27E7 and capturing n', () => {
  assert.ok(SV.MARK_RE instanceof RegExp);
  assert.ok(SV.MARK_RE.flags.includes('g'));
  const m = new RegExp(SV.MARK_RE.source).exec('see \u27E612\u27E7 here');
  assert.ok(m, 'marker 12 must match');
  assert.strictEqual(m[1], '12');
  assert.strictEqual(new RegExp(SV.MARK_RE.source).test('see [12] here'), false);
});

// protect / restore
const P = SV.protect(q);

check('protect returns { masked: string, tokens: string[] }', () => {
  assert.strictEqual(typeof P.masked, 'string');
  assert.ok(Array.isArray(P.tokens));
  for (const t of P.tokens) assert.strictEqual(typeof t, 'string');
});

check('protect sets aside path, camelCase, CONSTANT, version, URL and inline code exactly', () => {
  for (const t of PROTECTED) {
    assert.ok(P.tokens.includes(t), 'token ' + JSON.stringify(t) + ' missing from ' + JSON.stringify(P.tokens));
    assert.ok(!P.masked.includes(t), 'masked text still shows ' + JSON.stringify(t));
  }
});

check('protect leaves the prose readable and one marker per token', () => {
  assert.ok(P.masked.startsWith('Can you fix '), P.masked);
  assert.strictEqual(markers(P.masked).length, P.tokens.length);
  const idx = markers(P.masked).map(m => +m.slice(1, -1)).sort((a, b) => a - b);
  assert.deepStrictEqual(idx, P.tokens.map((_, i) => i));
});

check('restore(protect(x)) gives back x exactly', () => {
  assert.strictEqual(SV.restore(P.masked, P.tokens), q);
  const plain = 'nothing special in this sentence at all';
  const p2 = SV.protect(plain);
  assert.deepStrictEqual(p2.tokens, []);
  assert.strictEqual(p2.masked, plain);
  assert.strictEqual(SV.restore(p2.masked, p2.tokens), plain);
});

check('protect keeps a path inside fenced code within that one block', () => {
  const block = FENCE + '\nnode src/x.js --fast\n' + FENCE;
  const t = 'Run this:\n' + block + '\nthen tell me.';
  const p = SV.protect(t);
  assert.ok(p.tokens.includes(block), JSON.stringify(p.tokens));
  assert.ok(!p.tokens.includes('src/x.js'), 'the path must not be a separate token');
  assert.strictEqual(SV.restore(p.masked, p.tokens), t);
});

check('protect on empty input gives empty results', () => {
  assert.deepStrictEqual(SV.protect(''), { masked: '', tokens: [] });
});

check('restore leaves a marker with no token in place', () => {
  assert.strictEqual(SV.restore('a \u27E69\u27E7 b', []), 'a \u27E69\u27E7 b');
});

// validate
check('validate accepts a reworded variant that keeps every protected token', () => {
  const r = SV.validate(q, q.replace('Can you', 'Could you'), P.tokens);
  assert.deepStrictEqual(r, { ok: true, reasons: [] });
});

check('validate rejects the original itself', () => {
  const r = SV.validate(q, q, P.tokens);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reasons.includes('identical to the original'), JSON.stringify(r.reasons));
});

check('validate rejects a variant that changed a path', () => {
  const r = SV.validate(q, q.replace('lib/dispatcher.js', 'lib/dispatch.js') + ' ok', P.tokens);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reasons.some(x => /protected/.test(x)), JSON.stringify(r.reasons));
});

check('validate works out the tokens itself when none are given', () => {
  assert.strictEqual(SV.validate(q, q.replace('runTask', 'runJob') + ' ok').ok, false);
  assert.strictEqual(SV.validate(q, q.replace('Can you', 'Could you')).ok, true);
});

check('validate rejects empty and whitespace-only variants', () => {
  assert.deepStrictEqual(SV.validate(q, '', P.tokens), { ok: false, reasons: ['empty'] });
  assert.deepStrictEqual(SV.validate(q, '   \n ', P.tokens), { ok: false, reasons: ['empty'] });
  assert.deepStrictEqual(SV.validate(q, undefined, P.tokens), { ok: false, reasons: ['empty'] });
});

check('validate rejects a leftover marker', () => {
  const r = SV.validate(q, P.masked, []);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reasons.includes('left a marker unrestored'), JSON.stringify(r.reasons));
});

check('validate rejects changed code fences', () => {
  const o = 'Please run the build and report what happens:\n' + FENCE + '\nnpm run build\n' + FENCE;
  const r = SV.validate(o, 'Kindly run the build and report what happens: npm run build', []);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reasons.includes('changed the code blocks'), JSON.stringify(r.reasons));
});

check('validate rejects a length far outside the original', () => {
  const longer = SV.validate(q, q.replace('Can you', 'Could you') + ' ' + 'x'.repeat(q.length * 2), P.tokens);
  assert.strictEqual(longer.ok, false);
  assert.ok(longer.reasons.some(x => x.startsWith('length changed too much')), JSON.stringify(longer.reasons));
});

// jsVariant
check('jsVariant is deterministic for a given seed (number or string)', () => {
  assert.strictEqual(SV.jsVariant(q, 42), SV.jsVariant(q, 42));
  assert.strictEqual(SV.jsVariant(q, 'job-7'), SV.jsVariant(q, 'job-7'));
});

check('jsVariant keeps every protected token, leaves no marker, and passes validate', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const v = SV.jsVariant(q, seed);
    assert.strictEqual(typeof v, 'string');
    for (const t of PROTECTED) assert.ok(v.includes(t), 'seed ' + seed + ': lost ' + JSON.stringify(t) + ' in ' + JSON.stringify(v));
    assert.strictEqual(markers(v).length, 0, 'seed ' + seed + ': marker left in ' + JSON.stringify(v));
    const r = SV.validate(q, v, P.tokens);
    assert.ok(r.ok, 'seed ' + seed + ': ' + JSON.stringify(r.reasons) + ' for ' + JSON.stringify(v));
  }
});

check('jsVariant never returns the original, and different seeds give different wordings', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const v = SV.jsVariant(q, seed);
    assert.notStrictEqual(v, q, 'seed ' + seed + ' returned the original');
    seen.add(v);
  }
  assert.ok(seen.size >= 2, 'only ' + seen.size + ' distinct variant(s) across 10 seeds');
});

// similarity
check('similarity: identical wording is 1, nothing shared is 0', () => {
  assert.strictEqual(SV.similarity('the quick brown fox jumps over', 'the quick brown fox jumps over'), 1);
  assert.strictEqual(SV.similarity('alpha beta gamma delta epsilon', 'one two three four five'), 0);
});

check('similarity ignores case and punctuation', () => {
  assert.strictEqual(SV.similarity('Hello, World! Again now please.', 'hello world again now please'), 1);
});

check('similarity is symmetric and strictly between 0 and 1 for partial overlap', () => {
  const a = 'please review the parser module and report every failing case today';
  const b = 'please review the parser module and then fix the failing case tomorrow';
  const s = SV.similarity(a, b);
  assert.ok(s > 0 && s < 1, 'got ' + s);
  assert.strictEqual(s, SV.similarity(b, a));
});

// NoveltyStore
const dir = path.join(TMP, 'novelty');
const store = new SV.NoveltyStore({ dir, keep: 50, threshold: 0.6 });
const sent = 'please review the parser module and report every failing case today';

check('an empty store finds everything novel', () => {
  assert.deepStrictEqual(store.check('agentA', sent), { novel: true, maxSimilarity: 0, closest: null });
  assert.deepStrictEqual(store.recent('agentA'), []);
});

check('a recorded message is no longer novel for the same agent', () => {
  store.record('agentA', sent);
  const r = store.check('agentA', sent);
  assert.strictEqual(r.novel, false);
  assert.strictEqual(r.maxSimilarity, 1);
  assert.strictEqual(r.closest, sent);
  assert.ok(fs.existsSync(path.join(dir, 'agentA.jsonl')));
});

check('novelty is per agent', () => {
  assert.strictEqual(store.check('agentB', sent).novel, true);
});

check('a genuinely different message is still novel against the history', () => {
  const r = store.check('agentA', 'summarise yesterday deployment logs for the billing service');
  assert.strictEqual(r.novel, true);
  assert.ok(r.maxSimilarity < 0.6);
});

check('record keeps metadata with the text', () => {
  store.record('agentM', 'hello there my good friend', { job: 'j1' });
  const rec = store.recent('agentM');
  assert.strictEqual(rec.length, 1);
  assert.strictEqual(rec[0].text, 'hello there my good friend');
  assert.strictEqual(rec[0].job, 'j1');
  assert.strictEqual(typeof rec[0].at, 'number');
});

check('the store keeps only the last 50 sent per agent', () => {
  const texts = Array.from({ length: 60 }, (_, i) => 'message number ' + i + ' concerns topic ' + i + ' only');
  for (const t of texts) store.record('agentC', t);
  const rec = store.recent('agentC').map(x => x.text);
  assert.strictEqual(rec.length, 50);
  assert.strictEqual(rec[0], texts[10]);
  assert.strictEqual(rec[49], texts[59]);
  assert.ok(!rec.includes(texts[0]));
  const lines = fs.readFileSync(path.join(dir, 'agentC.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 50, 'the file on disk must be trimmed to 50');
});

check('an agent key cannot write outside the store folder', () => {
  store.record('../escape', 'should stay inside the store folder');
  assert.ok(!fs.existsSync(path.join(TMP, 'escape.jsonl')), 'wrote outside the store folder');
  for (const f of fs.readdirSync(dir)) assert.ok(f.endsWith('.jsonl'), f);
  assert.strictEqual(store.recent('../escape').length, 1);
});

// done
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('failed: ' + failures.join('; ')); process.exit(1); }