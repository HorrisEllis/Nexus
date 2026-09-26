'use strict';
/**
 * tests/modules/test-cookie-vault-ipc-roundtrip.js — real, structural
 * tests for the 2026-09-02 cookie-vault IPC round-trip.
 *
 * James: "check clear-glass for an ipc. if there isn't one lets make it
 * connect to p2p webrtc encrypted pipeline." Real finding: an IPC bridge
 * already existed (clear-glass/src/preload/webview-bridge.js's real
 * contextBridge relay, built 2026-07-09) — the real gap was a real
 * channel + a real round-trip for cookie-vault requests specifically,
 * not the bridge mechanism itself. WebRTC was not needed for this.
 *
 * §HONEST LIMIT — this is Electron main/renderer/webview IPC, which
 * cannot be exercised without a real Electron process. Same honest
 * convention as test-nexus-intelligence-section.js: real, structural,
 * source-text assertions confirming the real round-trip is wired
 * correctly end to end, not a live IPC simulation.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const bridgeSrc = fs.readFileSync(path.join(ROOT, 'clear-glass/src/preload/webview-bridge.js'), 'utf8');
const browserSrc = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(ROOT, 'clear-glass/src/preload/index.js'), 'utf8');
const ipcSrc = fs.readFileSync(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'), 'utf8');
const userscriptSrc = fs.readFileSync(path.join(ROOT, 'guardian/userscript-claude.js'), 'utf8');

test('CVI-001', 'webview-bridge.js allowlists the new nexus:cookie-request channel, not an open passthrough', () => {
  if (!bridgeSrc.includes("channel !== 'dom:pick-result' && channel !== 'dom:event' && channel !== 'nexus:cookie-request'")) {
    throw new Error('the allowlist check must name all three real channels explicitly');
  }
});

test('CVI-002', 'browser.js relays the new channel to window.ClearGlass._sendCookieRequest, the real preload export', () => {
  if (!browserSrc.includes("e.channel === 'nexus:cookie-request'")) throw new Error('missing real host-side channel check');
  if (!browserSrc.includes('window.ClearGlass?._sendCookieRequest?.(')) throw new Error('missing real relay call');
});

test('CVI-003', '_sendCookieRequest is a real preload export, fire-and-forget into the main process', () => {
  if (!preloadSrc.includes("_sendCookieRequest: (data) => ipcRenderer.send('nexus:cookie-request', data)")) {
    throw new Error('missing the real preload export');
  }
});

test('CVI-004', 'the real main-process handler reuses _countCookies() — the SAME logic the existing cookies:count handler uses, not a duplicate', () => {
  if (!ipcSrc.includes('const _countCookies = async')) throw new Error('missing the extracted, real, shared function');
  if (!ipcSrc.includes("ipcMain.handle('cookies:count', async (e, args) => _countCookies(args))")) throw new Error('cookies:count must call the shared function, not its own separate copy');
  if (!ipcSrc.includes("if (d?.op === 'count') {\n        result = await _countCookies(")) throw new Error('the new relay handler must call the same shared function too');
});

test('CVI-005', 'the real response is delivered back into the SAME webview that asked, via executeJavaScript — the same pattern injectAnswer() already uses', () => {
  const block = ipcSrc.slice(ipcSrc.indexOf("ipcMain.on('nexus:cookie-request'"), ipcSrc.indexOf("ipcMain.on('dom:pick-result'"));
  if (!block.includes('e.sender.executeJavaScript')) throw new Error('must deliver the response via e.sender.executeJavaScript, not a fabricated return value (ipcMain.on has none)');
  if (!block.includes('window.__nexusCookieResponse')) throw new Error('must call the real, page-side response receiver');
});

test('CVI-006', 'an unrecognized cookie op is refused honestly, not silently treated as count', () => {
  const block = ipcSrc.slice(ipcSrc.indexOf("ipcMain.on('nexus:cookie-request'"), ipcSrc.indexOf("ipcMain.on('dom:pick-result'"));
  if (!block.includes("result = { ok: false, error: `unknown cookie op")) throw new Error('missing the real, honest refusal for an unknown op');
});

test('CVI-007', 'the userscript exposes a real, promise-based nexusCookieCount(), with a real timeout so a lost response never hangs forever', () => {
  if (!userscriptSrc.includes('window.nexusCookieCount = (url) => new Promise')) throw new Error('missing the real page-side callable function');
  if (!userscriptSrc.includes("resolve({ ok: false, error: 'cookie request timed out")) throw new Error('missing a real timeout fallback');
});

test('CVI-008', 'nexusCookieCount() fails honestly, not silently, when __cg is not present (e.g. running outside clear-glass)', () => {
  const block = userscriptSrc.slice(userscriptSrc.indexOf('window.nexusCookieCount'));
  if (!block.includes("typeof window.__cg?.send !== 'function'")) throw new Error('missing the real, honest pre-check for the bridge existing at all');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
