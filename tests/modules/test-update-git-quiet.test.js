'use strict';
// 0.60.541 — his screenshot, 2026-11-14: an empty git.exe window over COS while it checked GitHub; earlier the same day the Update tab showed git's
// raw "OutOfMemoryException … could not read Username … terminal prompts disabled". Git now runs hidden and never prompts; the error is said plainly.
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'); const U = require(path.join(ROOT, 'lib/nexus-update.js'));
let passed = 0, failed = 0; const t = (id, n, f) => { try { f(); passed++; console.log(`  ✓ ${id} ${n}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${n}: ${e.message}`); } };
t('UQ-01', 'every git the update tool starts is hidden and never prompts', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/nexus-update.js'), 'utf8');
  const calls = [...src.matchAll(/execFileSync\('git'[\s\S]*?\}\)/g)].map(m => m[0]); assert.ok(calls.length >= 3, 'found the calls');
  for (const c of calls) assert.ok(/windowsHide: true/.test(c) && /env: GIT_ENV/.test(c), c.slice(0, 120));
  assert.match(src, /GIT_TERMINAL_PROMPT: '0'/);
});
t('UQ-02', 'his two errors in plain words, with the fix', () => {
  assert.match(U.plain('Unhandled Exception: System.OutOfMemoryException. fatal: could not read Username for \'https://github.com\': terminal prompts disabled'), /ran out of memory.*Close some apps/);
  assert.match(U.plain("fatal: could not read Username for 'https://github.com': terminal prompts disabled"), /needs your sign-in once.*fetch origin main/);
  assert.strictEqual(U.plain('something else'), 'something else');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
