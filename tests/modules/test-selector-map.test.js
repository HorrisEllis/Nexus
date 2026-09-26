'use strict';
/**
 * tests/modules/test-selector-map.test.js — v0.39.249
 * One selector map per provider, from guardian's agent registry to the userscript.
 * Real guardian/lib/agent-registry.js (temp dir) + real guardian/lib/selector-map.js;
 * the userscript's REAL findResponseEl/_lastMatch/_builtInResponseEl run against a
 * stand-in document.
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SM = require(path.join(ROOT, 'guardian/lib/selector-map.js'));
const { createAgentRegistry } = require(path.join(ROOT, 'guardian/lib/agent-registry.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; } }
const reg = () => createAgentRegistry({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'selmap-')) });
const fakeNcp = () => { const pushed = []; return { pushed, push: (p, m) => { pushed.push({ p, m }); return 2; }, pushTab: (p, t, m) => { pushed.push({ p, t, m }); return true; } }; };

console.log('\n\u2B21  SELECTOR MAP — one map per provider, reaching the userscript\n');
test('SM-01', 'a fresh map comes from the seed and nothing in it is verified', () => {
  const m = SM.mapFor(reg(), 'chatgpt');
  assert.strictEqual(m.selectors.resp, '.markdown.prose');
  assert.deepStrictEqual(m.verified, { input: false, send: false, resp: false });
  assert.strictEqual(m.source.resp, 'seed');
});
test('SM-02', "a picker assignment WITH live-check evidence is recorded, verified, and pushed to every open tab", () => {
  const r = reg(), n = fakeNcp();
  const out = SM.assign(r, n, 'chatgpt', { resp: '[data-message-author-role="assistant"] .markdown' }, { source: 'picker', evidence: { url: 'https://chatgpt.com/c/x', matched: 3, text: 'Hello' } });
  assert.ok(out.ok && out.changed, JSON.stringify(out));
  assert.strictEqual(out.map.verified.resp, true); assert.strictEqual(out.map.source.resp, 'picker');
  assert.strictEqual(n.pushed.length, 1); assert.strictEqual(n.pushed[0].m.type, 'GUARDIAN_SELECTORS');
  assert.strictEqual(out.pushedToTabs, 2);
});
test('SM-03', 'a claim of a live check WITHOUT evidence is refused, not recorded', () => {
  const r = reg(), out = SM.assign(r, fakeNcp(), 'chatgpt', { resp: '.x' }, { source: 'picker' });
  assert.strictEqual(out.ok, false); assert.match(out.error, /evidence/);
  assert.strictEqual(SM.mapFor(r, 'chatgpt').selectors.resp, '.markdown.prose');
});
test('SM-04', 'an unverified source (copilot) is recorded but NOT marked verified', () => {
  const r = reg(), out = SM.assign(r, fakeNcp(), 'chatgpt', { resp: '.guess' }, { source: 'copilot' });
  assert.ok(out.ok); assert.strictEqual(out.map.verified.resp, false); assert.strictEqual(out.map.source.resp, 'copilot');
});
test('SM-05', 'unknown provider / unknown keys / no source are refused with the reason', () => {
  const r = reg(), n = fakeNcp();
  assert.match(SM.assign(r, n, 'nope', { resp: '.x' }, { source: 'copilot' }).error, /unknown provider/);
  assert.match(SM.assign(r, n, 'chatgpt', { footer: '.x' }, { source: 'copilot' }).error, /no known key/);
  assert.match(SM.assign(r, n, 'chatgpt', { resp: '.x' }, {}).error, /source required/);
});
test('SM-06', 'the map survives a restart (the registry persists it)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selmap-'));
  SM.assign(createAgentRegistry({ dir }), fakeNcp(), 'chatgpt', { resp: '.kept' }, { source: 'picker', evidence: { url: 'u', matched: 1 } });
  const again = SM.mapFor(createAgentRegistry({ dir }), 'chatgpt');
  assert.strictEqual(again.selectors.resp, '.kept'); assert.strictEqual(again.verified.resp, true);
});

console.log('\n\u2B21  USERSCRIPT PRECEDENCE — verified map > built-in > seed\n');
const US = fs.readFileSync(path.join(ROOT, 'guardian/userscript-chatgpt.js'), 'utf8');
const grab = (name) => { const i = US.indexOf(`function ${name}(`); let d = 0, k = US.indexOf(') {', i) + 2; for (; k < US.length; k++) { if (US[k] === '{') d++; else if (US[k] === '}' && --d === 0) break; } return US.slice(i, k + 1); };
const EL = { built: { id: 'built-in' }, mapped: { id: 'mapped' }, seed: { id: 'seed' } };
function run(map, { builtIn = true, mapped = true } = {}) {
  const document = {
    querySelector: () => null,
    querySelectorAll: (sel) => sel === '[data-message-author-role="assistant"]' ? (builtIn ? [EL.built] : [])
      : sel === '.mapped' ? (mapped ? [EL.mapped] : []) : sel === '.markdown.prose' ? [EL.seed] : [],
  };
  return new Function('document', '_nexusMap', `${grab('_lastMatch')}\n${grab('_builtInResponseEl')}\n${grab('findResponseEl')}\nreturn findResponseEl();`)(document, map);
}
test('US-01', 'with no map, the built-in lookup is used (behaviour unchanged)', () => assert.strictEqual(run(null), EL.built));
test('US-02', 'a VERIFIED map value wins over the built-in lookup', () =>
  assert.strictEqual(run({ selectors: { resp: '.mapped' }, verified: { resp: true } }), EL.mapped));
test('US-03', 'an UNVERIFIED (seed) value never overrides a working built-in lookup', () =>
  assert.strictEqual(run({ selectors: { resp: '.markdown.prose' }, verified: { resp: false } }), EL.built));
test('US-04', "…but is used when the built-in lookup finds nothing (today's live failure)", () =>
  assert.strictEqual(run({ selectors: { resp: '.markdown.prose' }, verified: { resp: false } }, { builtIn: false }), EL.seed));
test('US-05', 'a verified value that matches nothing falls back to the built-in lookup', () =>
  assert.strictEqual(run({ selectors: { resp: '.mapped' }, verified: { resp: true } }, { mapped: false }), EL.built));
test('US-06', 'a malformed selector in the map does not throw inside the watch', () => {
  const document = { querySelector: () => null, querySelectorAll: (sel) => { if (sel === '[[bad') throw new Error('SyntaxError'); return sel === '[data-message-author-role="assistant"]' ? [EL.built] : []; } };
  const r = new Function('document', '_nexusMap', `${grab('_lastMatch')}\n${grab('_builtInResponseEl')}\n${grab('findResponseEl')}\nreturn findResponseEl();`)(document, { selectors: { resp: '[[bad' }, verified: { resp: true } });
  assert.strictEqual(r, EL.built);
});
test('US-07', 'the userscript takes GUARDIAN_SELECTORS for its own provider', () =>
  assert.match(US, /case 'GUARDIAN_SELECTORS':[\s\S]{0,200}msg\.provider === PROVIDER[\s\S]{0,80}_nexusMap = /));

console.log('\n\u2B21  GUARDIAN WIRING\n');
const SRV = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
test('GW-01', 'every NCP connect pushes the map to that tab before queued jobs flush', () =>
  assert.match(SRV, /selector-map'\)\.pushToTab\(ncp, _agentRegistry, provider, tabId\)[\s\S]{0,200}flushQueuedJobs\(provider\)/));
test('GW-02', 'GET and POST /api/agents/:id/selectors exist', () => {
  assert.match(SRV, /\\\/api\\\/agents\\\/\(\[a-z0-9-\]\+\)\\\/selectors\$/);
  assert.match(SRV, /m && method === 'GET'[\s\S]{0,200}mapFor\(_agentRegistry/);
  assert.match(SRV, /m && method === 'POST'[\s\S]{0,300}\.assign\(_agentRegistry, ncp, m\[1\]/);
});

console.log(`\n  ${passed} passed \u00B7 ${failed} failed\n`);
process.exit(failed ? 1 : 0);
