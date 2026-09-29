'use strict';
// UM2 (docs/cortex-schema-registry-phasemap.spec) — query the user-model on
// EVERY prompt path, not just the tool-loop. The shared _injectUserModel helper
// prepends buildUserContext() to the context on /api/prompt, /stream, /fulfill
// so co-pilot knows the user on every response. §8.4 all paths mapped first.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && (s.startsWith('[jaa]') || s.startsWith('[user-model]'))) return; _log(...a); };

const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const SERVER = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');

test('T-001', 'a shared _injectUserModel helper exists (one wire, not three copies — §8.6)', () => {
  assert.ok(/function _injectUserModel\(contextText\)/.test(SERVER), 'the helper must be defined once');
});

test('T-002', 'the helper queries buildUserContext (reads the model)', () => {
  const fn = SERVER.slice(SERVER.indexOf('function _injectUserModel'));
  assert.ok(/buildUserContext/.test(fn.slice(0, 400)), 'the helper must call buildUserContext');
});

test('T-003', 'ALL THREE prompt paths inject the user-model (not just the tool-loop)', () => {
  const callSites = (SERVER.match(/contextText = _injectUserModel\(contextText\)/g) || []).length;
  assert.strictEqual(callSites, 3, `expected 3 inject call sites (stream/fulfill/main), found ${callSites}`);
});

test('T-004', 'the user-model injects BEFORE session-history + recall (grounds the whole context)', () => {
  // in each path, _injectUserModel must appear before _injectSessionHistory
  const umIdxs = [...SERVER.matchAll(/contextText = _injectUserModel/g)].map(m => m.index);
  const shIdxs = [...SERVER.matchAll(/contextText = await _injectSessionHistory/g)].map(m => m.index);
  assert.strictEqual(umIdxs.length, 3);
  for (const um of umIdxs) {
    assert.ok(shIdxs.some(sh => sh > um && sh - um < 200), 'each user-model inject must be immediately followed by session-history');
  }
});

test('T-005', 'the injection is non-fatal — helper is wrapped so a model failure never breaks a response (§1.2)', () => {
  // §0.39.282 — was a fixed 400-char window; the inject-rule check (0.39.258 blocks) pushed the catch past it. The body, to its end:
  const at = SERVER.indexOf('function _injectUserModel');
  const fn = SERVER.slice(at, SERVER.indexOf('\n}\n', at) + 2);
  assert.ok(/try\s*\{/.test(fn) && /catch/.test(fn), 'the helper must swallow model errors, returning contextText unchanged');
});

test('T-006', 'the model actually returns real content to inject (live check)', () => {
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
  const um = require(path.join(ROOT, 'copilot/lib/user-model'));
  um.init(jaaDB);
  um.observe('prefers verification before handoff', 'preference', {}, 0.8);
  const ctx = um.buildUserContext();
  assert.ok(ctx && ctx.length > 0, 'buildUserContext must return injectable content');
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
