'use strict';
/**
 * tests/modules/test-userscript-mixed-content-fix.js — real, structural
 * tests for the 2026-09-02 fix: every provider userscript's network
 * calls now go through GM_xmlhttpRequest instead of plain fetch()/
 * EventSource, which are blocked by mixed-content in a real standalone
 * browser (https://chatgpt.com -> http://127.0.0.1:7820).
 *
 * James, live, from a real screenshot (not clear-glass — a real,
 * standalone browser): "the userscript isn't connecting. make sure you
 * account for cors and user policy so i don't have to use header editor
 * or cors." Traced directly: wake-word arming only happens inside
 * EventSource's onopen handler — a blocked connection meant "hey nexus"
 * was never armed at all, not a separate bug from "Guardian:
 * DISCONNECTED."
 *
 * §HONEST LIMIT — same convention as this session's other userscript
 * tests: structural, source-text assertions (no jsdom/browser here).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const FILES = ['claude', 'chatgpt', 'gemini', 'perplexity'].map(name => ({
  name,
  src: fs.readFileSync(path.join(ROOT, `guardian/userscript-${name}.js`), 'utf8'),
}));

for (const { name, src } of FILES) {
  test(`GMFIX-${name}-01`, `${name}: _gmFetch and _gmEventSource are both defined`, () => {
    if (!src.includes('function _gmFetch(url, opts = {})')) throw new Error('missing _gmFetch definition');
    if (!src.includes('function _gmEventSource(url)')) throw new Error('missing _gmEventSource definition');
  });

  test(`GMFIX-${name}-02`, `${name}: zero plain fetch()/EventSource() calls remain — real, complete conversion, not partial`, () => {
    // Strip comment lines first — this fix's own explanatory comments
    // legitimately mention "fetch(" in prose (e.g. "these 4 used plain
    // fetch(...)"), which isn't a real remaining call site.
    const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
    const plainFetch = (codeOnly.match(/(?<!_gm)(?<!GM_xmlhttpRequest)\bfetch\(/g) || []).length;
    const plainES = (codeOnly.match(/new EventSource\(/g) || []).length;
    if (plainFetch !== 0) throw new Error(`found ${plainFetch} remaining plain fetch() call(s) — still broken by mixed content in a real standalone browser`);
    if (plainES !== 0) throw new Error(`found ${plainES} remaining literal EventSource() call(s)`);
  });

  test(`GMFIX-${name}-03`, `${name}: the real NCP connection uses _gmEventSource, not the native constructor`, () => {
    if (!src.includes('_es = _gmEventSource(')) throw new Error('NCP connection must use the real, privileged wrapper');
  });

  test(`GMFIX-${name}-04`, `${name}: _gmFetch degrades honestly (rejects) when GM_xmlhttpRequest itself is unavailable, never silently no-ops`, () => {
    const block = src.slice(src.indexOf('function _gmFetch'), src.indexOf('function _gmEventSource'));
    if (!block.includes("typeof GM_xmlhttpRequest !== 'function'")) throw new Error('missing the real, honest guard');
    if (!block.includes('reject(new Error(')) throw new Error('must reject honestly, not resolve as if the request succeeded');
  });

  test(`GMFIX-${name}-05`, `${name}: _gmEventSource parses real, complete SSE frames incrementally, not naive line-splitting`, () => {
    const block = src.slice(src.indexOf('function _gmEventSource'), src.indexOf('// ── NCP connection'));
    if (!block.includes("split('\\n\\n')")) throw new Error('missing real SSE frame-boundary parsing (blank-line-delimited)');
    if (!block.includes('_parsedLen')) throw new Error('missing the real incremental-position tracker — without it, a partial frame at the tail would be lost or double-parsed');
  });
}

test('GMFIX-root-cause', 'wake-word arming is still gated behind the real connection opening — the actual root cause this fix closes, not just symptom relief', () => {
  const claudeSrc = FILES.find(f => f.name === 'claude').src;
  const onopenBlock = claudeSrc.slice(claudeSrc.indexOf('_es.onopen = () => {'), claudeSrc.indexOf('_es.onopen = () => {') + 800);
  if (!onopenBlock.includes('window.NexusWake.install(')) {
    throw new Error('wake-word arming must still happen on real connection open — if this moved, the real fix (making that connection actually succeed) is what matters, not removing the dependency');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
