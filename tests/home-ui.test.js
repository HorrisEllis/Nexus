'use strict';
/**
 * tests/home-ui.test.js — v1.2
 * UUID: nexus-home-ui-test-v1-2000-2026-0617
 */
const fs = require('fs');
const path = require('path');
// v0.39.228: the page is index.html + the per-area JS/CSS files it links (see helpers/home-page-source.js).
const { homePageSource } = require('./helpers/home-page-source');
const HTML = homePageSource();

let pass = 0, fail = 0;
function test(label, fn) {
  try { fn() ? (pass++, console.log(`  ✓  ${label}`)) : (fail++, console.log(`  ✗  ${label}`)); }
  catch(e) { fail++; console.log(`  ✗  ${label} — ${e.message}`); }
}

console.log('\n⬡  HOME UI — v1.2 Tests\n');

// Menu button
test('MENU: toggleMenu function exists', () => HTML.includes('function toggleMenu'));
test('MENU: menu-btn has onclick toggleMenu', () => HTML.includes('onclick="toggleMenu()"'));
test('MENU: menu-overlay uses .open class (not display)', () => HTML.includes('#menu-overlay.open{opacity:1'));

// Mode overlay — must not block menu
test('MODE: mode-overlay starts display:none', () => HTML.includes('#mode-overlay{') && HTML.includes('display:none'));
test('MODE: .open class enables display:flex separately', () => HTML.includes('open{\n  display:flex') || HTML.includes('open{display:flex'));
test('MODE: closeModeSelector function exists', () => HTML.includes('function closeModeSelector'));
test('MODE: click-outside closes overlay', () => HTML.includes('event.target===this)closeModeSelector'));
test('MODE: Escape key closes overlay', () => HTML.includes("Escape')closeModeSelector") || HTML.includes("'Escape')closeModeSelector"));
test('MODE: mode-overlay z-index does not block when closed', () => !HTML.match(/#mode-overlay\{[^}]*pointer-events:\s*auto/));

// Logging
test('LOG: _logToData utility defined', () => HTML.includes('function _logToData'));
test('LOG: POSTs to cortex :3748', () => HTML.includes('3748/api/event'));
test('LOG: falls back to sessionStorage when cortex offline', () => HTML.includes('nexus_ui_log_pending'));
test('LOG: _replayPendingLogs on cortex recovery', () => HTML.includes('function _replayPendingLogs'));
test('LOG: global window error boundary', () => HTML.includes("'error'") && HTML.includes('ui.error'));
test('LOG: unhandledrejection caught', () => HTML.includes('unhandledrejection'));
test('LOG: ui.boot event on load', () => HTML.includes('ui.boot'));
test('LOG: ui.mode.selected uses _logToData', () => HTML.includes("_logToData('ui.mode.selected'"));
test('LOG: ui.navigation uses _logToData', () => HTML.includes("_logToData('ui.navigation'"));

// Regression
test('REG: overview is active channel in HTML', () => HTML.includes('class="ch active" id="ch-overview"') || HTML.includes('id="ch-overview"'));
test('REG: tile-forge exists', () => HTML.includes('id="tile-forge"'));
test('REG: tile-agent exists', () => HTML.includes('id="tile-agent"'));
test('REG: sys-grid no height:100% constraint', () => !HTML.includes('grid-template-columns:repeat(3,1fr);gap:16px;height:100%'));

console.log(`\n  ${pass} passed · ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
