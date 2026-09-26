'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-repo-toolbar-mode.js
 * UUID: nexus-test-repo-toolbar-mode-v1-0000-2026-0920-jamesbrooks-001
 *
 * §BUILT 2026-09-20 — covers the repo toolbar swap (James: "when you click
 * the repo and enter it, i want where the create repo and import repo
 * buttons are to change to run, branch, diagnose").
 *
 * §WHY IT IS SHAPED THIS WAY. idearium/ui/js/app.js is a 3000-line browser
 * script with heavy load-time DOM/fetch dependencies — the same reason
 * clear-glass's browser.js was never jsdom-tested (0.39.80). So this does
 * what that precedent established instead of pretending to boot the app:
 *   1. Parses the REAL index.html and asserts the real markup contract.
 *   2. Extracts _setRepoToolbarMode VERBATIM from the real app.js (no
 *      hand-copied duplicate that can drift) and runs it against that real
 *      markup — the actual risk is the function and the markup disagreeing.
 *   3. Structurally asserts all three real entry/exit points call it, so a
 *      future edit that adds a fourth path fails here loudly.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'index.html'), 'utf8');
const APP  = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ── Extract the real function, not a copy ─────────────────────────────────────
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in app.js`);
  let depth = 0, i = src.indexOf('{', start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`unbalanced braces extracting ${name}`);
  return src.slice(start, i + 1);
}

console.log('\ntest-repo-toolbar-mode\n');

// ── 1. Markup contract ────────────────────────────────────────────────────────
const dom = new JSDOM(HTML);
const doc = dom.window.document;

const lib = doc.getElementById('repo-tb-library');
const det = doc.getElementById('repo-tb-detail');

check('library group exists', !!lib);
check('detail group exists', !!det);

const libLabels = lib ? [...lib.querySelectorAll('button')].map(b => b.textContent.trim()) : [];
const detLabels = det ? [...det.querySelectorAll('button')].map(b => b.textContent.trim()) : [];

check('library group is Import repo + Create repo',
  JSON.stringify(libLabels) === JSON.stringify(['Import repo', 'Create repo']),
  JSON.stringify(libLabels));
check('detail group is Run + Branch + Diagnose',
  JSON.stringify(detLabels) === JSON.stringify(['Run', 'Branch', 'Diagnose']),
  JSON.stringify(detLabels));

check('detail group starts hidden (library view is the landing state)',
  /display:\s*none/.test(det?.getAttribute('style') || ''));
check('library group does NOT start hidden',
  !/display:\s*none/.test(lib?.getAttribute('style') || ''));

// Run must be visibly marked unwired for as long as no runner exists. If a
// real runner ever lands, this assertion is the deliberate place to remove.
const runBtn = doc.getElementById('repo-tb-run');
check('Run is wired (no longer .tb-unwired) — COS test environment',
  !!runBtn && !runBtn.classList.contains('tb-unwired'));
check('.tb-unwired has a real CSS rule (not a class that styles nothing)',
  /\.tb-btn\.tb-unwired\s*\{/.test(HTML));

// ── 2. The real function against the real markup ──────────────────────────────
const fnSrc = extractFn(APP, '_setRepoToolbarMode');
const _setRepoToolbarMode = new dom.window.Function(
  'document',
  `${fnSrc}; return _setRepoToolbarMode;`
)(doc);

_setRepoToolbarMode('detail');
check('detail mode shows Run/Branch/Diagnose', det.style.display !== 'none');
check('detail mode hides Import/Create', lib.style.display === 'none');

_setRepoToolbarMode('library');
check('library mode restores Import/Create', lib.style.display !== 'none');
check('library mode hides Run/Branch/Diagnose', det.style.display === 'none');

// Round-trip: entering, leaving and re-entering must not leave both visible.
_setRepoToolbarMode('detail');
_setRepoToolbarMode('library');
_setRepoToolbarMode('detail');
check('round-trip never shows both groups at once',
  !(det.style.display !== 'none' && lib.style.display !== 'none'));

// Missing markup must be tolerated, not thrown — this function runs inside
// view transitions that must not break if the toolbar is absent.
const bare = new JSDOM('<body></body>');
const bareFn = new bare.window.Function('document', `${fnSrc}; return _setRepoToolbarMode;`)(bare.window.document);
let threw = false;
try { bareFn('detail'); } catch { threw = true; }
check('no throw when the toolbar markup is absent', !threw);

// ── 3. Every real entry/exit point calls it ───────────────────────────────────
for (const [fnName, expected] of [
  ['enterRepoDetail', 'detail'],
  ['openRepoFor',     'detail'],
  ['exitRepoDetail',  'library'],
]) {
  const body = extractFn(APP, fnName);
  check(`${fnName}() sets toolbar mode '${expected}'`,
    body.includes(`_setRepoToolbarMode('${expected}')`));
}

// ── 4. The wired actions point at routes that actually exist ──────────────────
// Guards against a button that calls an endpoint nobody built — the exact
// failure this whole change was written to avoid for Run.
const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
check("Branch's endpoint (repo.fork) is a real registered route", API.includes("'repo.fork'"));
check("Diagnose's verification endpoint is a real registered route", API.includes("'repo.verification'"));
check("Diagnose's scan endpoint is a real registered route", API.includes("'repo.scan'"));
check("Re-run's reindex endpoint is a real registered route", API.includes("'repo.reindex'"));
check('repoBranch() delegates to the pre-existing forkApiRepo, not a second fork path',
  extractFn(APP, 'repoBranch').includes('forkApiRepo('));
check('repoRun() calls the real repo.run route', /\/run`/.test(extractFn(APP, 'repoRun')) && API.includes("'repo.run'"));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail === 0 ? 0 : 1;
