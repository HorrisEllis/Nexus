'use strict';
/**
 * tests/modules/architect-spec-builder-theme.test.js
 *
 * §BUILT 2026-09-21 — James: "then the spec builder html rebuild for
 * ideariums theme and add ai assistance."
 *
 * §HONEST LIMIT, named here and in the file itself — this covers the
 * :root token retheme (CSS variables, traced to idearium/ui/index.html's
 * own real values) and the new AI-assist feature. NOT covered, and not
 * attempted: ~40 hardcoded hex colors OUTSIDE :root (CSS rules and JS
 * data — the z-layer L0–L7 array, chip colors, edge/SVG strokes) used
 * to keep 8+ distinct hues apart on the canvas. No live browser exists
 * in this sandbox to actually look at a remapping of those and confirm
 * it reads right, so they were left as-is rather than guessed at — this
 * test does not pretend otherwise.
 *
 * Uses jsdom for a real smoke test (not just node -c) — this file has
 * no Electron dependency, so unlike clear-glass's structural-only tests
 * it can actually be loaded and exercised, same technique already
 * proven on ui/library/library-app.js.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  const HTML_PATH = path.join(ROOT, 'architect', 'src', 'ui', 'spec-builder.html');
  const IDEARIUM_HTML_PATH = path.join(ROOT, 'idearium', 'ui', 'index.html');
  const SB = fs.readFileSync(HTML_PATH, 'utf8');
  const IDEA_HTML = fs.readFileSync(IDEARIUM_HTML_PATH, 'utf8');

  // ── every retheme value is traced to idearium's own real :root, not invented ──
  function ideariumToken(name) {
    const m = IDEA_HTML.match(new RegExp(`--${name}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  }
  const REAL_IDEARIUM_TOKENS = {
    bg: ideariumToken('bg'), bg1: ideariumToken('bg1'), bg2: ideariumToken('bg2'), bg3: ideariumToken('bg3'),
    sky: ideariumToken('sky'), sky2: ideariumToken('sky2'), mint: ideariumToken('mint'),
    amber: ideariumToken('amber'), coral: ideariumToken('coral'), violet: ideariumToken('violet'),
    text: ideariumToken('text'), text2: ideariumToken('text2'), text3: ideariumToken('text3'),
  };
  check('idearium really defines every token this retheme claims to trace (sanity check on the test itself)',
    Object.values(REAL_IDEARIUM_TOKENS).every(v => v && v.length));

  const rootBlock = SB.slice(SB.indexOf(':root{'), SB.indexOf('\n}', SB.indexOf(':root{')));
  check('--bg/--bg1/--bg2/--bg3 are idearium\'s own real background values, not invented ones',
    rootBlock.includes(REAL_IDEARIUM_TOKENS.bg) && rootBlock.includes(REAL_IDEARIUM_TOKENS.bg1) &&
    rootBlock.includes(REAL_IDEARIUM_TOKENS.bg2) && rootBlock.includes(REAL_IDEARIUM_TOKENS.bg3));
  check('--c/--c2 (the primary accent) are idearium\'s own real --sky/--sky2, not a new blue',
    rootBlock.includes(REAL_IDEARIUM_TOKENS.sky) && rootBlock.includes(REAL_IDEARIUM_TOKENS.sky2));
  check('--g (success) is idearium\'s own real --mint', rootBlock.includes(REAL_IDEARIUM_TOKENS.mint));
  check('--r (error) is idearium\'s own real --coral', rootBlock.includes(REAL_IDEARIUM_TOKENS.coral));
  check('--m (magenta/highlight) is idearium\'s own real --violet', rootBlock.includes(REAL_IDEARIUM_TOKENS.violet));
  check('--text/--text2/--text3 are idearium\'s own real text tones',
    rootBlock.includes(REAL_IDEARIUM_TOKENS.text) && rootBlock.includes(REAL_IDEARIUM_TOKENS.text2) && rootBlock.includes(REAL_IDEARIUM_TOKENS.text3));
  check('fonts are idearium\'s own real fonts (IBM Plex Mono/Sans), not the old Bebas Neue/DM Mono/Space Grotesk',
    /--mono:'IBM Plex Mono'/.test(rootBlock) && /--body:'IBM Plex Sans'/.test(rootBlock) && !/Bebas Neue|DM Mono|Space Grotesk/.test(SB));
  check('the Google Fonts import matches — no stale request for the old font family', /IBM\+Plex\+Mono.*IBM\+Plex\+Sans/.test(SB) && !/Bebas\+Neue/.test(SB));

  // ── node-type colors: derived using idearium's OWN opacity-tint
  //    technique (--b0/--b1/--b2 from --sky), not arbitrary rgba() ──
  check('node-type dark tints use the same low-opacity-of-a-real-accent technique idearium itself uses for --b0/--b1/--b2',
    /--nl:rgba\(167,139,250,\.08\)/.test(rootBlock) && /--ng:rgba\(56,189,248,\.08\)/.test(rootBlock));
  check('node-type bright borders are idearium\'s real named accents directly (violet/sky/mint/amber)',
    rootBlock.includes(`--nb:${REAL_IDEARIUM_TOKENS.violet}`) && rootBlock.includes(`--ngb:${REAL_IDEARIUM_TOKENS.sky}`) &&
    rootBlock.includes(`--nnb:${REAL_IDEARIUM_TOKENS.mint}`) && rootBlock.includes(`--ncb:${REAL_IDEARIUM_TOKENS.amber}`));

  // ── the honest limit is stated in the file itself, not just here ────
  check('the file itself names what was NOT retheme (z-layer array, chip/edge colors) rather than implying full coverage',
    /HONEST LIMIT, named not implied[\s\S]{0,400}z-layer/.test(SB));

  // ── AI assist — real smoke test via jsdom, not just structural ──────
  const dom = new JSDOM(SB, { runScripts: 'dangerously', resources: 'usable', url: 'http://127.0.0.1:3747/ui/spec-builder' });
  const w = dom.window;
  let fetchCalls = [];
  w.fetch = async (url) => {
    fetchCalls.push(url);
    if (String(url).includes('copilot/suggest')) {
      return { ok: true, json: async () => ({ suggestions: ['A concrete implementation note.'], confidence: 0.8, artifacts: [], connected: true }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  await new Promise(r => setTimeout(r, 300)); // let the page's own boot script settle

  check('assistNode is defined on the loaded page', typeof w.assistNode === 'function');
  check('the page calls idearium\'s real gate directly (cross-origin — this page is served by architect :3747, a different system)',
    /const IDEARIUM = `http:\/\/127\.0\.0\.1:4800`/.test(SB));

  const node = w.createNode('node', 100, 100);
  w.selectNode(node.id);
  w.document.getElementById('p-label').value = 'Test Node';
  w.document.getElementById('p-sub').value = 'Does a thing';
  await w.assistNode();
  await new Promise(r => setTimeout(r, 50));

  const preview = w.document.getElementById('node-assist-preview');
  check('the real gate was actually called (:4800/api/copilot/suggest)', fetchCalls.some(u => u.includes('127.0.0.1:4800/api/copilot/suggest')));
  check('a real suggestion renders in the preview', preview.style.display !== 'none' && preview.textContent.includes('A concrete implementation note.'));
  check('Notes is NOT overwritten before "use this" is clicked — preview-first, same discipline as brainstorm/screen-qa', w.document.getElementById('p-notes').value === '');

  const useBtn = [...preview.querySelectorAll('button')].find(b => b.textContent === 'use this');
  check('a real "use this" button exists in the rendered preview', !!useBtn);
  useBtn.click();
  check('clicking "use this" writes the suggestion into Notes — a real, separate action', w.document.getElementById('p-notes').value === 'A concrete implementation note.');
  check('the node\'s own in-memory data is updated too, not just the DOM field', node.notes === 'A concrete implementation note.');

  // ── honest failure paths — a disconnected gate or empty reply is
  //    surfaced, never fabricated into a fake answer ───────────────────
  const node2 = w.createNode('node', 200, 200);
  w.selectNode(node2.id);
  w.document.getElementById('p-label').value = 'Node 2';
  w.fetch = async () => ({ ok: true, json: async () => ({ suggestions: [], connected: false, reason: 'no copilot backend connected' }) });
  await w.assistNode();
  await new Promise(r => setTimeout(r, 50));
  check('a disconnected gate is reported honestly in the preview, not silently ignored',
    w.document.getElementById('node-assist-preview').textContent.includes('no copilot backend connected'));

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => { console.error('  ! crashed:', e.stack); process.exit(1); });
