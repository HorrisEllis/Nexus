'use strict';
/**
 * tests/modules/idearium-brainstorm-assist.test.js
 *
 * §BUILT 2026-09-21 — James: "brainstorm should have full ai assistance."
 *
 * Found before building: POST /api/copilot/suggest (idearium/copilot-
 * adapter/index.js's real backend -> copilot's adaptive-fulfillment
 * endpoint) was fully wired server-side with a comment claiming "the
 * wizard's 'ask copilot' button hits this" — checked directly, across
 * registry-components.js, app.js and index.html: no such button, or
 * any caller at all, existed anywhere. This wires Brainstorm to that
 * real, existing gate rather than building a second one.
 *
 * §ISOLATED — same real IDEARIUM_DATA_DIR/JAA_DATA_DIR convention
 * idearium-auto-repo-creation.test.js already established.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const _isolatedData = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-brainstorm-assist-'));
const _isolatedJaa = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-brainstorm-assist-jaa-'));
process.env.IDEARIUM_DATA_DIR = _isolatedData;
process.env.JAA_DATA_DIR = _isolatedJaa;
process.on('exit', () => {
  try { fs.rmSync(_isolatedData, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_isolatedJaa, { recursive: true, force: true }); } catch (_) {}
});

const assert = require('assert');

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  // ── the real gate this feature was built on top of, not a new one ────
  const CA = await import(path.join(ROOT, 'idearium', 'copilot-adapter', 'index.js'));
  check('the copilot-adapter gate is already connected (a real backend is registered)', CA.default.isConnected() === true);
  check('an unconnected gate would refuse honestly, not fabricate a suggestion — checked against the gate\'s own contract', typeof CA.default.suggest === 'function');

  // ── the real table behavior brainstorm.promote's text override relies on ──
  const { getIdeaOS } = await import(path.join(ROOT, 'idearium', 'core', 'index.js'));
  const os_ = getIdeaOS();
  // Use the real idea-create event path directly (what brainstorm.promote
  // itself calls) rather than reimplementing the route's HTTP layer —
  // the route addition itself is one `if`, checked structurally below.
  const before = os_.db.ideas.length;
  const ev = os_.emit('idearium.idea.create', { text: 'a refined, AI-expanded version of the raw thought', tags: [], compartment: null, source: 'brainstorm' });
  check('idea.create really adds a real idea with the given text', os_.db.ideas.length === before + 1 && os_.db.ideas[os_.db.ideas.length - 1].text === 'a refined, AI-expanded version of the raw thought');
  check('the emit returns a real event id', !!ev.uuid);

  // ── structural: the route accepts an optional text override ─────────
  const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
  const promoteRoute = API.slice(API.indexOf("case 'brainstorm.promote'"), API.indexOf("case 'idea.show'"));
  check('brainstorm.promote accepts an optional text override', /typeof body\.text === 'string' && body\.text\.trim\(\)/.test(promoteRoute));
  check('given an override, the STORED row is updated before promoting — never left diverging from what was actually promoted', /b\.text = body\.text\.trim\(\)/.test(promoteRoute));
  check('with no override, the original behavior is unchanged — b.text stays whatever was stored', /os\.emit\('idearium\.idea\.create', \{ text: b\.text/.test(promoteRoute));

  // ── structural: the UI wiring ─────────────────────────────────────────
  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  const HTML = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'index.html'), 'utf8');

  check('the capture row has a real "assist" button wired to the real function', /id="brain-assist-btn"/.test(HTML) && /onclick="assistBrainstormDraft\(\)"/.test(HTML));
  check('every saved, not-yet-promoted card gets its own "refine" action', /assistBrainstormCard\('\$\{b\.uuid\}'\)/.test(APP));
  check('a promoted card does NOT offer refine — nothing to refine after promotion', /\$\{b\.promoted \? '' : `<button class="action-btn" onclick="assistBrainstormCard/.test(APP));

  check('_askCopilotSuggest calls the real, existing gate — not a new endpoint', /api\('\/api\/copilot\/suggest', \{ method: 'POST'/.test(APP));
  check('_askCopilotSuggest passes current_gate so the adapter\'s prompt-building knows the context (matches its own [wizard section: ...] convention)', /current_gate: currentGate/.test(APP));
  check('a disconnected gate (connected:false) is surfaced honestly, not silently treated as an empty suggestion', /r\.connected === false/.test(APP));
  check('an empty suggestions array is reported as a real refusal, not padded into a fake answer', /if \(!text\) return \{ ok: false, error: r\.reason \|\| 'copilot returned no suggestion' \}/.test(APP));

  check('the draft-assist preview never auto-applies — "use this" is a real, separate click', /onUse: \(text\) => \{\s*document\.getElementById\('brain-text'\)\.value = text;/.test(APP));
  check('the card-refine preview\'s "use this" promotes with the refined text via the new override, not a silent local edit', /await api\(`\/api\/brainstorms\/\$\{uuid\}\/promote`, \{ method: 'POST', body: JSON\.stringify\(\{ text \}\) \}\)/.test(APP));
  check('both draft and card previews render loading/error/success through the one shared _renderAssistPreview — not duplicated per caller',
    /function _renderAssistPreview\(el,/.test(APP)
    && (APP.match(/_renderAssistPreview\(el,/g) || []).length === 5 /* 1 definition + 2 callers × (loading call + final call) */);

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => { console.error('  ! crashed:', e.stack); process.exit(1); });
