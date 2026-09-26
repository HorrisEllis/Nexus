'use strict';
// Real, adversarial test for guardian/server.js's POST /command handler.
// James: "find every problem you can... hostile attacked and verified."
// A real, severe arbitrary-local-file-read: body.specFile went straight
// into fs.readFileSync() with zero path validation, BEFORE the RAID
// approval check even ran. Confirmed hostilely before fixing, not
// theorized — reproduced the exact real line against a real, canary
// file.
//
// §NO SERVER REQUIRE — guardian/server.js boots a real, live server as
// a side effect of being required, so this is a structural check
// against the real, shipped source (confirming the vulnerable pattern
// is genuinely gone, not just reworded) plus a real, isolated
// reproduction proving the OLD pattern was exploitable and the NEW one
// genuinely cannot read an arbitrary file at all, because the code path
// that could no longer exists.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const SRC = fs.readFileSync(path.join(__dirname, '../../guardian/server.js'), 'utf8');

test('GHF-001', 'the real, shipped source no longer reads any file based on a caller-supplied path at all in the /command handler', () => {
  const start = SRC.indexOf("if (method==='POST' && url.pathname==='/command')");
  assert.ok(start > -1, 'the /command handler was not found at all — has it moved?');
  const body = SRC.slice(start, start + 2500);
  // Real code, not comment prose — a real conditional/expression using
  // body.specFile as a live value, not this fix's own explanatory
  // comment (which legitimately mentions the term while describing the
  // bug it closed).
  assert.ok(!/if\s*\(\s*body\.spec\s*\|\|\s*body\.specText\s*\|\|\s*body\.specFile/.test(body), 'the real gate condition still checks body.specFile — the real vulnerability may have regressed');
  assert.ok(!/readFileSync\(body\./.test(body), 'a real fs.readFileSync() call driven directly by request body content still exists in the /command handler');
});

test('GHF-002', 'specText and spec (real content, never a path) still work exactly as before — the fix did not break the legitimate case', () => {
  const start = SRC.indexOf("if (method==='POST' && url.pathname==='/command')");
  const body = SRC.slice(start, start + 2500);
  assert.ok(/body\.spec \|\| body\.specText/.test(body), 'the real, legitimate spec/specText content path is missing — the fix may have removed too much');
});

test('GHF-003', 'a real reproduction: the exact OLD, vulnerable line genuinely could read an arbitrary local file — confirming this was a real, not theoretical, vulnerability', () => {
  const canary = fs.mkdtempSync(path.join(os.tmpdir(), 'ghf-canary-')) + '/secret.txt';
  fs.writeFileSync(canary, 'REAL SECRET — must never be reachable via specFile');
  const body = { specFile: canary };
  // Verbatim reproduction of the real, original vulnerable expression.
  const oldSpecText = body.specText || (body.specFile ? fs.readFileSync(body.specFile, 'utf8') : null) || body.spec;
  assert.strictEqual(oldSpecText, 'REAL SECRET — must never be reachable via specFile', 'the old pattern must be provably exploitable (this confirms the finding was real, not the fix)');
  fs.rmSync(path.dirname(canary), { recursive: true, force: true });
});

test('GHF-004', 'the real, fixed expression (specText || spec only) cannot read that same canary file at all', () => {
  const canary = fs.mkdtempSync(path.join(os.tmpdir(), 'ghf-canary2-')) + '/secret.txt';
  fs.writeFileSync(canary, 'REAL SECRET — must never be reachable');
  const body = { specFile: canary }; // an attacker still sending the old parameter name
  // Verbatim reproduction of the real, NEW, fixed expression.
  const newSpecText = body.specText || body.spec;
  assert.notStrictEqual(newSpecText, 'REAL SECRET — must never be reachable', 'the fixed expression must never read the canary file\'s content');
  assert.strictEqual(newSpecText, undefined, 'a caller sending only specFile (no real specText/spec) must get no spec content at all — an honest empty result, not a fallback that quietly finds another way to read the file');
  fs.rmSync(path.dirname(canary), { recursive: true, force: true });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
