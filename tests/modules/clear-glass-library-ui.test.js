'use strict';
/**
 * tests/modules/clear-glass-library-ui.test.js
 *
 * §BUILT 2026-09-21 — James: "the clearglass macros, autofill, keyboard
 * shortcuts... build them, then expand the ui, like it should have
 * been. index.html."
 *
 * Map, before this pass: keyboard shortcuts were already real (clear-
 * glass/renderer/browser.js). Macros and autofill each had a complete,
 * real IPC surface and ZERO reach from anywhere a person could click —
 * ui/library/index.html (built 2026-09-19, six tabs including Macros)
 * had no library-app.js (the file its own <script src> pointed at did
 * not exist) and no menu entry to even open it; autofill had no UI
 * surface anywhere, in this page or the main browser chrome.
 *
 * §MOVED 0.39.241 — James: "need control j to popout a window like the
 * screenshot... the settings ui but with the library." The Library left
 * ui/library/ (a page on :9000 opened inside an agent window) for its own
 * Clear Glass window, renderer/library.html, on the Settings runtime. The
 * checks below follow it; the behaviour ones (each area's endpoint, the
 * agent picker, read-only passwords) are the same assertions as before.
 *
 * §HONEST LIMIT — clear-glass/src/ipc/bridge.js and src/main/index.js
 * both `require('electron')` at the top level; no electron package is
 * installed in this sandbox (checked: `ls node_modules/electron` finds
 * nothing), so neither file can be require()'d in a plain node test —
 * same real limit clear-glass-accounts.test.js already states for
 * agent-mesh.js's driver/ctxMgr. These checks read the real source text
 * instead, same precedent as test-file-tree-plan.js's checks against
 * idearium/api/index.js. library-app.js and index.html have no Electron
 * dependency and are exercised more directly below (structurally, since
 * they're meant to run in a real browser window, not Node).
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const BRIDGE = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'ipc', 'bridge.js'), 'utf8');
  const MAIN = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'main', 'index.js'), 'utf8');
  const PRELOAD = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'preload', 'index.js'), 'utf8');
  const R = path.join(ROOT, 'clear-glass', 'renderer');
  const HTML = fs.readFileSync(path.join(R, 'library.html'), 'utf8');
  const CORE = fs.readFileSync(path.join(R, 'settings', 'core.js'), 'utf8');
  const BOOT = fs.readFileSync(path.join(R, 'library', 'boot.js'), 'utf8');
  const API = fs.readFileSync(path.join(R, 'library', 'api.js'), 'utf8');
  const SEC = path.join(R, 'library', 'sections');
  const area = (id) => fs.readFileSync(path.join(SEC, `${id}.js`), 'utf8');

  // ── bridge.js: the REST doors the Library reads (unchanged since 0.39.21x) ──
  check('GET /cli/agents reuses the real listOpenAgents(), not a second implementation',
    /app\.get\('\/cli\/agents'.*listOpenAgents/.test(BRIDGE));
  check('autofill profile CRUD is a real REST surface: list/get/create/update/delete',
    /app\.get\('\/cli\/autofill\/profiles'/.test(BRIDGE) &&
    /app\.get\('\/cli\/autofill\/profiles\/:id'/.test(BRIDGE) &&
    /app\.post\('\/cli\/autofill\/profiles'/.test(BRIDGE) &&
    /app\.put\('\/cli\/autofill\/profiles\/:id'/.test(BRIDGE) &&
    /app\.delete\('\/cli\/autofill\/profiles\/:id'/.test(BRIDGE));
  check('autofill detect/fill call the SAME real matcher functions the IPC handlers use, not a second implementation',
    (BRIDGE.match(/_autofillDetect\(this\.dom, this\.autofillStore/g) || []).length === 2 &&
    (BRIDGE.match(/_autofillFill\(this\.dom, this\.autofillStore/g) || []).length === 2);
  check('field-types route exposes the real store\'s FIELD_TYPES/DOCUMENT_FIELDS, not a hand-copied duplicate',
    /require\('\.\.\/autofill\/store\.js'\)/.test(BRIDGE) && /FIELD_TYPES, DOCUMENT_FIELDS/.test(BRIDGE));
  check('downloads:clearCompleted has a /cli/* door', /app\.post\('\/cli\/downloads\/clear-completed'.*clearCompleted/.test(BRIDGE));
  // 0.39.241 — found by tests/probe/clearglass-library-window.js: without this every
  // Delete/Remove/Edit in the Library was refused by the browser's CORS preflight.
  check('0.39.241: the CORS preflight allows DELETE/PUT/PATCH (every Library delete and edit was refused before)',
    /Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'/.test(BRIDGE));

  // ── 0.39.241: the Library is its own Clear Glass window ──────────────
  // James: "need control j to popout a window like the screenshot... the settings ui but with the library."
  check('openLibraryWindow() is a single-instance frameless window with the preload, like Settings',
    /function openLibraryWindow\(area\)/.test(MAIN) && /libraryWin = new BrowserWindow\(\{[\s\S]{0,200}frame: false[\s\S]{0,200}preload:\s+path\.join\(__dirname, '\.\.\/preload\/index\.js'\)/.test(MAIN) &&
    /if \(libraryWin && !libraryWin\.isDestroyed\(\)\)/.test(MAIN));
  check('…it loads renderer/library.html, with the area as the hash (library.html#downloads)',
    /libraryWin\.loadFile\(path\.join\(__dirname, '\.\.\/\.\.\/renderer\/library\.html'\), hash \? \{ hash \} : undefined\)/.test(MAIN));
  check('…an area name is checked before it reaches executeJavaScript', /LIBRARY_AREA_RE = \/\^\[a-z\]\{1,24\}\$\//.test(MAIN) && /LIBRARY_AREA_RE\.test\(area \|\| ''\)/.test(MAIN));
  // §0.39.265 — Ctrl+J is now the cg.library default of the general shortcut
  // handler (src/shortcuts/registry.js), still caught in main for every web contents.
  const SC = require(path.join(__dirname, '../../clear-glass/src/shortcuts/registry.js'));
  check('Ctrl+J is taken in the main process for EVERY web contents (chrome and page), and opens Downloads',
    SC.DEFAULT_BINDINGS['Ctrl+J'] === 'cg.library' &&
    /app\.on\('web-contents-created'[\s\S]{0,200}before-input-event/.test(MAIN) &&
    /if \(action === 'cg\.library'\) return openLibraryWindow\('downloads'\);/.test(MAIN) &&
    /if \(!owner && action !== 'cg\.library'/.test(MAIN));
  check('…Ctrl+Shift+J is left to DevTools', !SC.DEFAULT_BINDINGS['Ctrl+Shift+J'] && /\['i','j'\]\.includes\(input\.key\.toLowerCase\(\)\)/.test(MAIN));
  check('the tray\'s Library entry opens the same window, not ui/library/ in an agent window',
    /label: '⬡ Library',\s+accelerator: 'CmdOrCtrl\+J', click: \(\) => openLibraryWindow\('downloads'\)/.test(MAIN) && !/nexus-library/.test(MAIN));
  check('window:openLibrary / window:closeLibrary / downloads:openFile exist on BOTH sides (bridge handler + preload)',
    /ipcMain\.handle\('window:openLibrary'/.test(BRIDGE) && /ipcMain\.handle\('window:closeLibrary'/.test(BRIDGE) && /ipcMain\.handle\('downloads:openFile'/.test(BRIDGE) &&
    /openLibrary:\s+\(area\)\s+=> ipcRenderer\.invoke\('window:openLibrary', \{ area \}\)/.test(PRELOAD) &&
    /closeLibrary: \(\)\s+=> ipcRenderer\.invoke\('window:closeLibrary'\)/.test(PRELOAD) &&
    /openFile:\s+\(id\)\s+=> ipcRenderer\.invoke\('downloads:openFile',\s+\{ id \}\)/.test(PRELOAD));
  check('…openFile only opens a recorded, completed download', /downloads:openFile'[\s\S]{0,300}record\.state !== 'completed'/.test(BRIDGE));
  check('main passes openLibraryFn/closeLibraryFn into the bridge', /openLibraryFn: openLibraryWindow,\s+closeLibraryFn: closeLibraryWindow,/.test(MAIN));

  // ── library.html: the Settings runtime, not a lookalike ──────────────
  check('library.html loads Settings\' own stylesheet and runtime', HTML.includes('<link rel="stylesheet" href="settings/settings.css">') && HTML.includes('<script src="settings/core.js"></script>'));
  check('…and has the same frame (titlebar, rail, main, toasts) and the same CSP as settings.html',
    ['id="titlebar"', 'id="rail"', 'id="main"', 'id="toasts"', "script-src 'self';"].every(x => HTML.includes(x)));
  const AREAS = ['downloads', 'responses', 'bookmarks', 'history', 'accounts', 'passwords', 'autofill', 'macros'];
  const js = fs.readdirSync(SEC).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, '')).sort();
  const css = fs.readdirSync(SEC).filter(f => f.endsWith('.css')).map(f => f.replace(/\.css$/, '')).sort();
  check('eight areas, one JS + one CSS each, no orphans', JSON.stringify(js) === JSON.stringify([...AREAS].sort()) && JSON.stringify(css) === JSON.stringify(js), `${js} / ${css}`);
  check('every area file registers exactly one area named after the file', js.every(id => JSON.stringify([...area(id).matchAll(/section\(\{\s*id: '([a-z]+)'/g)].map(m => m[1])) === JSON.stringify([id])));
  check('library.html lists every area script, after api.js and before boot.js',
    AREAS.every(id => { const at = (f) => HTML.indexOf(`<script src="${f}"></script>`); const i = at(`library/sections/${id}.js`); return i > at('library/api.js') && at('library/api.js') > 0 && i < at('library/boot.js'); }));
  const unscoped = [];
  for (const id of css) {
    const src = fs.readFileSync(path.join(SEC, `${id}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '');
    for (const m of src.matchAll(/([^{}]+)\{/g)) for (const part of m[1].split(',')) if (part.trim() && !part.trim().startsWith(`body[data-area="${id}"]`)) unscoped.push(`${id}: ${part.trim()}`);
  }
  check('every area rule is scoped to body[data-area="<that area>"]', unscoped.length === 0, unscoped.join('; '));

  // ── each area reads its real endpoint (the same routes the old page used) ──
  const ENDPOINTS = { bookmarks: "'/cli/bookmarks'", history: "'/cli/history'", downloads: "'/cli/downloads'", responses: '/cli/downloads/responses',
    accounts: "'/cli/accounts'", macros: "'/cli/macros'", autofill: "'/cli/autofill/profiles'", passwords: "'/cli/passwords'" };
  for (const [id, ep] of Object.entries(ENDPOINTS)) check(`${id} reads its real endpoint (${ep})`, area(id).includes(ep));
  check('one fetch wrapper for every area (library/api.js), aimed at the bridge on :7702', (API.match(/fetch\(/g) || []).length === 1 && /const BRIDGE = 'http:\/\/127\.0\.0\.1:7702'/.test(API) &&
    AREAS.every(id => !/fetch\(/.test(area(id))));
  check('macro run and autofill fill pick a live agent window fresh each time (no "current tab" here)', /agentOptions\(\)/.test(area('macros')) && /agentOptions\(\)/.test(area('autofill')));
  check('passwords stays read-only (delete only) — vault.js list() never decrypts', !/method: 'POST'|method: 'PUT'/.test(area('passwords')) && /method: 'DELETE'/.test(area('passwords')));
  check('Downloads opens a file by its name and shows it in its folder, through the OS shell (IPC)', /cg\.downloads\.openFile\(d\.id\)/.test(area('downloads')) && /cg\.downloads\.openFolder\(d\.id\)/.test(area('downloads')));
  check('Downloads carries the Download Listeners form from the retired dropdown (same IPC)', /cg\.downloads\.registerListener\(/.test(area('downloads')) && /cg\.downloads\.removeListener\(/.test(area('downloads')) && /cg\.downloads\.listListeners\(/.test(area('downloads')));

  // ── core.js: one runtime, told what differs ──────────────────────────
  check('boot(opts) — groups, first area, CSS base, close, search mode — with Settings\' old values as the defaults',
    /function boot\(opts = \{\}\)/.test(CORE) && /Object\.assign\(CFG, opts\)/.test(CORE) && /groups: GROUPS, defaultId: 'accounts', cssBase: 'settings\/sections\/'/.test(CORE) && /close: \(\) => cg\.window\.closeSettings\(\), search: 'rail'/.test(CORE));
  check('the Library boots with its own groups, Downloads first, its CSS folder, closeLibrary and list search',
    /groups: \['Library', 'Identity', 'Agents'\]/.test(BOOT) && /defaultId: 'downloads'/.test(BOOT) && /cssBase: 'library\/sections\/'/.test(BOOT) && /closeLibrary\(\)/.test(BOOT) && /search: 'list'/.test(BOOT));

  // ── browser.js: ☰ and the key go to the window; the old dropdown is gone ──
  const BROWSER = fs.readFileSync(path.join(R, 'browser.js'), 'utf8');
  const BHTML = fs.readFileSync(path.join(R, 'browser.html'), 'utf8');
  check('the ☰ menu still has a Library row', /<div class="menu-item" data-action="library">📚 Library<\/div>/.test(BROWSER));
  check('…Library opens the window; Downloads opens it at Downloads', /data-action="library"\]'\)\.addEventListener\('click'[\s\S]{0,120}_openLibrary\(\)/.test(BROWSER) && /data-action="downloads"\]'\)\.addEventListener\('click'[\s\S]{0,120}_openLibrary\('downloads'\)/.test(BROWSER));
  check('…a failure to open is shown, not swallowed', /Could not open the Library: \$\{err\.message\}/.test(BROWSER));
  check('the Downloads dropdown it replaces is gone (no second download manager)', !/_renderDownloadsPanel/.test(BROWSER) && !/downloads-panel/.test(BHTML) && !/downloads-panel/.test(BROWSER));
  check('ui/library/ is retired — one Library', !fs.existsSync(path.join(ROOT, 'ui', 'library')));

  // ── jsdom: the list-search mode really filters and keeps the area ─────
  let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (_) {}
  if (JSDOM) {
    const dom = new JSDOM('<body><div id="rail"></div><main id="main"></main><div id="toasts"></div><button id="close"></button></body>', { url: 'http://localhost/library.html', runScripts: 'outside-only' });
    const w = dom.window; let closed = 0; w.ClearGlass = { window: { closeLibrary() { closed++; } } };
    w.eval(CORE);
    const seen = [];
    w.CGS.section({ id: 'downloads', group: 'Library', label: 'Downloads', render: async ({ query }) => { seen.push(query); return [w.document.createTextNode(`q=${query}`)]; } });
    w.CGS.section({ id: 'history', group: 'Library', label: 'History', render: async ({ query }) => [w.document.createTextNode(`h=${query}`)] });
    w.eval(BOOT);
    return new Promise(res => setTimeout(async () => {
      const sb = w.document.getElementById('search');
      check('jsdom: the Library opens on Downloads with the list-search placeholder', w.document.body.dataset.area === 'downloads' && sb.placeholder === 'Search this list');
      sb.value = 'ZIP'; sb.dispatchEvent(new w.Event('input'));
      await new Promise(r => setTimeout(r, 260));
      check('jsdom: typing re-renders the SAME area with the lower-cased query', seen[seen.length - 1] === 'zip' && w.document.body.dataset.area === 'downloads', JSON.stringify(seen));
      await w.CGS.show('history');
      check('jsdom: switching area clears the search', sb.value === '' && /h=$/.test(w.document.querySelector('.page').textContent));
      w.document.getElementById('close').click();
      check('jsdom: ✕ calls closeLibrary, not closeSettings', closed === 1);
      res();
    }, 30));
  }
}

async function run() {
  await main();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

run();
