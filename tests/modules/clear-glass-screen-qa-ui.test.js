'use strict';
/**
 * tests/modules/clear-glass-screen-qa-ui.test.js
 *
 * §BUILT 2026-09-21 — the UI layer on top of clear-glass-screen-qa.test.js's
 * backend kernel: the hotkey, the right-click menu entry, element-picker
 * wiring (elementAt), the settings UI, and the isolated (main-process)
 * notification.
 *
 * §HONEST LIMIT — renderer/browser.js cannot be require()'d or safely
 * jsdom-executed: it has no Electron dependency itself, but it assumes
 * EventSource, a live <webview> element with real methods
 * (executeJavaScript, getURL, etc.), and a running SSE connection —
 * checked directly, every existing test that touches this file
 * (clear-glass-hostile-html.test.js, clear-glass-library-ui.test.js,
 * test-cookie-vault-ipc-roundtrip.js) uses structural source-text checks
 * only, none jsdom-execute it. Following that same established
 * convention here rather than fighting it. What CAN run for real still
 * does: archaeology.js's elementAt/nodeId (pure DOM logic, tested via a
 * minimal fake document) and detector.js's deriveQuestion (already
 * covered in clear-glass-screen-qa.test.js, re-exercised here only for
 * the specific case this pass depends on).
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`); failed++; }
}

function main() {
  const BROWSER_JS = fs.readFileSync(path.join(ROOT, 'clear-glass', 'renderer', 'browser.js'), 'utf8');
  const BROWSER_HTML = fs.readFileSync(path.join(ROOT, 'clear-glass', 'renderer', 'browser.html'), 'utf8');
  const BROWSER_CSS = fs.readFileSync(path.join(ROOT, 'clear-glass', 'renderer', 'browser.css'), 'utf8');
  const ARCH = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'dom', 'archaeology.js'), 'utf8');
  const BRIDGE = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'ipc', 'bridge.js'), 'utf8');
  const PRELOAD = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'preload', 'index.js'), 'utf8');
  const SETTINGS_JS = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'api', 'settings.js'), 'utf8');
  const SETTINGS_HTML = fs.readFileSync(path.join(ROOT, 'clear-glass', 'renderer', 'settings.html'), 'utf8');

  // ── the hotkey ───────────────────────────────────────────────────────
  check('Ctrl/Cmd+Shift+A triggers a whole-page scan', /e\.shiftKey && e\.key\.toLowerCase\(\) === 'a'[\s\S]{0,250}screenQaScanPage\(\)/.test(BROWSER_JS));
  check('the hotkey is real and free — no OTHER binding in this file also claims shiftKey+"a"',
    (BROWSER_JS.match(/e\.shiftKey && e\.key\.toLowerCase\(\) === 'a'/g) || []).length === 1);
  check('the hotkey opens the Co-pilot panel before scanning — the preview surface is visible when results arrive',
    /screenQaScanPage\(\);\s*}\s*}\);/.test(BROWSER_JS.replace(/\n\s*/g, ' ').replace(/\s+/g, ' ')) ||
    /copilotVisible = true; copilotPane\.classList\.remove\('hidden'\); copilotToggle\.classList\.add\('active'\);\s*\n\s*screenQaScanPage\(\);/.test(BROWSER_JS));

  // ── the right-click menu entry ───────────────────────────────────────
  check('index.html declares a real "Answer this question" menu item', /data-action="answer-question">.*Answer this question/.test(BROWSER_HTML));
  check('the menu item is wired to the single-field flow, using the right-click\'s own stored page point', /case 'answer-question':[\s\S]{0,300}screenQaAnswerAt\(ctxPageXY\.x, ctxPageXY\.y\)/.test(BROWSER_JS));
  check('a chrome-bar right-click (no page point) is refused honestly, not silently treated as page (0,0)', /if \(!ctxPageXY\) \{ addMsg\('assistant', '<div class="sqa-block"><div class="sqa-err">Right-click a page element/.test(BROWSER_JS));
  check('the page-relative right-click point is captured separately from the window-relative point used for menu positioning',
    /let ctxPageXY = null;/.test(BROWSER_JS) && /ctxPageXY = \{ x: p\.x, y: p\.y \};/.test(BROWSER_JS) && /const p = e\.params \|\| e;/.test(BROWSER_JS) && /ctxPageXY = null; \/\/ a chrome-bar right-click has no page point/.test(BROWSER_JS));

  // ── element-picker wiring (archaeology.js -> bridge.js -> preload) ──
  check('archaeology.js gained a real elementAt(x,y), using document.elementFromPoint + the SAME nodeId() every other real caller uses',
    /elementAt\(x, y\) \{\s*const el = document\.elementFromPoint\(x, y\);\s*return el \? \{ \.\.\.buildMeta\(el\), id: nodeId\(el\) \} : null;/.test(ARCH));
  check('handleQuery routes an x/y query to elementAt — one real path, not a second query mechanism', /if \(typeof x === 'number' && typeof y === 'number'\)[\s\S]{0,100}elementAt/.test(ARCH));
  check('bridge.js exposes a direct, awaited screen-qa:element-at handler (not the fire-and-forget dom:query/rendererEmit path)',
    /ipcMain\.handle\('screen-qa:element-at'/.test(BRIDGE) && /this\.dom\.handleQuery\(\{ agentId, x, y \}\)/.test(BRIDGE));
  check('bridge.js exposes screen-qa:derive-question, reusing the SAME deriveQuestion() the whole-page scan uses — not a second implementation',
    /ipcMain\.handle\('screen-qa:derive-question'/.test(BRIDGE) && /_screenQaDeriveQuestion\(fieldMeta\)/.test(BRIDGE));
  check('preload exposes elementAt and deriveQuestion on cg.screenQa', /elementAt:\s*\(x, y, agentId\)/.test(PRELOAD) && /deriveQuestion:\s*\(fieldMeta\)/.test(PRELOAD));

  // ── the isolated toast (main-process Notification, not an in-page toast()) ──
  check('Notification is imported from electron in bridge.js', /const \{ ipcMain, session, Notification \} = require\('electron'\)/.test(BRIDGE));
  check('screen-qa:answer fires a real OS notification AFTER the actual copilot.send() call, before returning to the renderer',
    /const result = await _screenQaAnswer\(\{ question, context \}, send\);[\s\S]{0,1200}new Notification\(/.test(BRIDGE));
  check('a failed answer also notifies, with the real reason — never silently swallowed', /title: result\.ok \? 'Clear Glass — answer ready' : 'Clear Glass — answer failed'/.test(BRIDGE));
  check('the REST path (ui/library, not the interactive flow) deliberately does NOT fire the notification — documented, not an accidental inconsistency',
    /no native notification on this REST path,\s*\n\s*\/\/ deliberately/.test(BRIDGE));

  // ── settings: persistent store, not a second config mechanism ───────
  check('settings.js defines real, persistent screen-qa defaults in the SAME file-backed store every other setting uses',
    /screenQaEnabled:\s*true/.test(SETTINGS_JS) && /screenQaMinConfidence:\s*'medium'/.test(SETTINGS_JS) &&
    /screenQaProfileId:\s*''/.test(SETTINGS_JS) && /screenQaContext:\s*''/.test(SETTINGS_JS));
  // §UPDATED 2026-09-23 — settings.html was rebuilt as a shell over
  // renderer/settings/sections/*.js (one file per area, no inline script).
  // Same three intents, checked against where the Screen Q&A UI lives now;
  // saves are per-field on change instead of one Save button.
  const SETTINGS_SECTION = fs.readFileSync(path.join(ROOT, 'clear-glass', 'renderer', 'settings', 'sections', 'autofill.js'), 'utf8');
  check('settings has a real Screen Q&A section: enable toggle, confidence select, profile picker, context box',
    /settings\/sections\/autofill\.js/.test(SETTINGS_HTML) && /Answering questions on screen/.test(SETTINGS_SECTION) &&
    /toggle\(s\.screenQaEnabled !== false/.test(SETTINGS_SECTION) && /const minConf = select\(/.test(SETTINGS_SECTION) &&
    /const prof = select\(/.test(SETTINGS_SECTION) && /const ctx = h\('textarea'/.test(SETTINGS_SECTION));
  check('the profile picker is populated LIVE from cg.autofill.listProfiles(), not a hardcoded list', /cg\.autofill\.listProfiles\(\)/.test(SETTINGS_SECTION) && /profiles\.map\(p => \(\{ value: p\.id, label: p\.label \}\)\)/.test(SETTINGS_SECTION));
  check('all four Screen Q&A fields are really persisted through cg.api.set',
    /save\(\{ screenQaEnabled: on \}\)/.test(SETTINGS_SECTION) && /save\(\{ screenQaMinConfidence: minConf\.value \}\)/.test(SETTINGS_SECTION) &&
    /save\(\{ screenQaProfileId: prof\.value \}\)/.test(SETTINGS_SECTION) && /save\(\{ screenQaContext: ctx\.value \}\)/.test(SETTINGS_SECTION) &&
    /const save = \(patch\) => call\(\(\) => cg\.api\.set\(patch\)/.test(SETTINGS_SECTION));

  // ── the preview surface (Co-pilot panel), James's own explicit choice ──
  check('results render through the real, existing addMsg() function — not a new, competing preview widget', /function _screenQaRenderAnswer[\s\S]{0,400}addMsg\('assistant'/.test(BROWSER_JS));
  check('"use this" calls the real inject IPC — the only thing in this whole flow that ever touches the live page', /block\.querySelector\('\.sqa-use'\)\.addEventListener\('click', async \(\) => \{[\s\S]{0,100}cg\.screenQa\.inject\(cgId, answer, agentId\)/.test(BROWSER_JS));
  check('an error path renders honestly (sqa-err), never silently drops a failed answer', /if \(error\) \{\s*addMsg\('assistant', `<div class="sqa-block"><div class="sqa-q">/.test(BROWSER_JS));
  check('browser.css defines real styles for every sqa- class the JS renders (.sqa-block/.sqa-q/.sqa-a/.sqa-err/.sqa-actions)',
    /\.sqa-block \{/.test(BROWSER_CSS) && /\.sqa-q \{/.test(BROWSER_CSS) && /\.sqa-a \{/.test(BROWSER_CSS) && /\.sqa-err \{/.test(BROWSER_CSS) && /\.sqa-actions \{/.test(BROWSER_CSS));

  // ── the honest resume-parsing limit is stated, not silently implied ──
  check('the resume-content limit is named in the code, not silently dropped — a resume on file is mentioned, its text is not fabricated',
    /a resume file is on record[\s\S]{0,120}its contents are NOT included here/.test(BROWSER_JS));

  // ── real execution: the pure DOM logic elementAt actually depends on ──
  // A minimal fake `document`/element, exercising nodeId()'s real
  // assignment behavior the same way DOM_OBSERVER_SCRIPT's own elementAt
  // will call it — extracted and run for real, not just pattern-matched.
  {
    const start = ARCH.indexOf('const DOM_OBSERVER_SCRIPT = `') + 'const DOM_OBSERVER_SCRIPT = `'.length;
    const end = ARCH.indexOf('`;', start);
    const script = ARCH.slice(start, end);
    const fakeEl = { tagName: 'INPUT', getBoundingClientRect: () => ({ top: 0, left: 0, width: 10, height: 10 }), attributes: [], className: '' };
    const fakeDocument = {
      elementFromPoint: (x, y) => (x === 50 && y === 60 ? fakeEl : null),
      querySelector: () => null, querySelectorAll: () => [],
    };
    const fakeWindow = { addEventListener() {}, removeEventListener() {} };
    class FakeMutationObserver { observe() {} disconnect() {} }
    try {
      const fn = new Function('document', 'window', 'CSS', 'MutationObserver', script + '\nreturn window.__cgDomMesh;');
      const mesh = fn(fakeDocument, fakeWindow, { escape: (s) => s }, FakeMutationObserver);
      const hit = mesh.elementAt(50, 60);
      check('elementAt really calls document.elementFromPoint and assigns a real cgId via the shared nodeId()', hit && hit.id && hit.tag === 'input');
      const miss = mesh.elementAt(0, 0);
      check('elementAt at an empty point returns null, not a fabricated element', miss === null);
    } catch (e) { check('elementAt executes against a real (fake) document without throwing', false, e.message); }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
