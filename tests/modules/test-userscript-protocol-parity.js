'use strict';
/**
 * tests/modules/test-userscript-protocol-parity.js — real, structural
 * tests confirming all 4 provider userscripts have real protocol
 * parity on the capabilities this session added/fixed.
 *
 * James: "get the userscripts done." Real findings along the way:
 * - guardian/userscript-{gemini,perplexity}.js never wired
 *   window.__nexusInjectAnswer at all — a real, confirmed gap (a wake-
 *   word answer for those two providers would silently fail to render
 *   on-page). Fixed in both.
 * - guardian/userscript-chatgpt.js had the same gap, PLUS was missing
 *   the new Intelligence & Contracts panel claude got — chatgpt has
 *   the full 9-tab UI (unlike gemini/perplexity, whose own file headers
 *   explicitly document a deliberately leaner design — "not a copy
 *   with selectors swapped" — so they do NOT get this UI panel, only
 *   the underlying wake-answer + cookie-vault capability fixes).
 *
 * §HONEST LIMIT — same as this session's other userscript tests:
 * source-text structural assertions, not a live DOM render (no jsdom
 * in this environment).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const FILES = {
  claude:     fs.readFileSync(path.join(ROOT, 'guardian/userscript-claude.js'), 'utf8'),
  chatgpt:    fs.readFileSync(path.join(ROOT, 'guardian/userscript-chatgpt.js'), 'utf8'),
  gemini:     fs.readFileSync(path.join(ROOT, 'guardian/userscript-gemini.js'), 'utf8'),
  perplexity: fs.readFileSync(path.join(ROOT, 'guardian/userscript-perplexity.js'), 'utf8'),
};

// ── All 4: wake-word answer wiring (the real, confirmed gap) ───────────────
for (const [name, src] of Object.entries(FILES)) {
  test(`PARITY-${name}-01`, `${name}: window.__nexusInjectAnswer is real and wired, not missing`, () => {
    if (!src.includes('window.__nexusInjectAnswer = (text) => {')) throw new Error('missing the real wake-answer wiring');
    if (!src.includes("if (!window.__nexusWakeInstance__) return { ok: false")) throw new Error('missing the real, honest guard for an uninstalled wake module');
  });
}

// ── All 4: real cookie-vault capability, protocol parity ────────────────────
for (const [name, src] of Object.entries(FILES)) {
  test(`PARITY-${name}-02`, `${name}: nexusCookieCount() is real, present, and uses the real bridge`, () => {
    if (!src.includes('window.nexusCookieCount = (url) => new Promise')) throw new Error('missing the real cookie-count function');
    if (!src.includes("window.__cg.send('nexus:cookie-request'")) throw new Error('must use the real, allowlisted bridge channel');
  });
}

// ── Only claude + chatgpt: the real Intelligence & Contracts UI panel ──────
for (const name of ['claude', 'chatgpt']) {
  test(`PARITY-${name}-03`, `${name}: has the real Intelligence & Contracts panel (has the full tab UI)`, () => {
    if (!FILES[name].includes('function _renderNexusIntelligence()')) throw new Error('missing the real panel function');
    if (!FILES[name].includes('el.appendChild(_renderNexusIntelligence())')) throw new Error('panel not wired into renderNexus()');
  });
}

// ── gemini/perplexity deliberately do NOT get the tab-UI panel ──────────────
for (const name of ['gemini', 'perplexity']) {
  test(`PARITY-${name}-03`, `${name}: deliberately does NOT have the tab-UI panel (own file header documents a leaner design)`, () => {
    if (FILES[name].includes('function _renderNexusIntelligence()')) throw new Error(`${name} unexpectedly has the tab-UI panel — contradicts its own documented design intent, or the design decision changed and this test needs updating with James`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
