'use strict';
/**
 * lib/agent-tools/tools/clear-glass/gate-eval.js — is a macro step's gate open, on a page's state (FP3, 0.60.221).
 * Pure: the gate and a state in, a check out. The only part that runs in the page is stateScript's expression, which collects the state;
 * the decision is made here. Spec: clear-glass/spec/flow-cores.spec MOD-FC-GATE · Map: docs/2026-10-28-first-principles-phasemap.spec FP3
 *
 * James, 2026-10-28: "fiverr working with gates for each step, each gate can be like blocks." · "gating for each step, that way it can
 * continue to a new page." · "the determinisitci is the foundation".
 * The fact (F3): macro.js ran steps with nothing checked after each, so a step that moves to a new page could not know it arrived.
 *
 * A gate: { url, selector, text, value, gone, timeoutMs, settleMs } — every condition given must hold.
 */

// 0.60.280 KB4 — choice: { column | row | selector, is } (a dropdown there shows this value, read by the driver's readChoice); retries: how many
// more times macro.js runs the step when the gate stays closed (James, 2026-10-29: "make the gates for them gated and have them check for the correct value")
const KEYS = Object.freeze(['url', 'selector', 'text', 'value', 'gone', 'timeoutMs', 'settleMs', 'choice', 'retries',
  // 2026-10-30 PL8 — James: "gates are for the pipelines for macro atuomation". The element gate's conditions (Clear Glass's element-gate.js
  // reads them, through the driver's gate action) and use: one of his gates by id — one gate idea for macros, workflows and pipelines
  'use', 'xpath', 'shows', 'checked', 'matches', 'equals', 'visible']);
const ELEMENT_KEYS = Object.freeze(['use', 'xpath', 'shows', 'checked', 'matches', 'equals', 'visible']);
const LIMITS = Object.freeze({ timeoutMs: [100, 300000], settleMs: [0, 10000], retries: [0, 5] });

function _regex(pattern) {
  const m = /^\/(.*)\/([a-z]*)$/.exec(String(pattern));
  if (m) return new RegExp(m[1], m[2]);
  const esc = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^?#]*').replace(/\u0000/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + esc + '$');
}

/** urlMatches(pattern, url) — a glob (* within the path, ** across it) or /regex/flags */
function urlMatches(pattern, url) { try { return _regex(pattern).test(String(url || '')); } catch (_) { return false; } }

/** validateGate(gate) → { ok, why } */
function validateGate(gate) {
  if (gate == null) return { ok: true, why: null };
  if (typeof gate !== 'object' || Array.isArray(gate)) return { ok: false, why: 'a gate is an object' };
  const unknown = Object.keys(gate).filter(k => !KEYS.includes(k));
  if (unknown.length) return { ok: false, why: `unknown gate key(s) ${unknown.join(', ')} — known: ${KEYS.join(', ')}` };
  for (const k of ['url', 'selector', 'text', 'value', 'gone']) if (gate[k] != null && typeof gate[k] !== 'string') return { ok: false, why: `${k} must be a string` };
  if (gate.value != null && !gate.selector) return { ok: false, why: 'value needs a selector (whose value it is)' };
  if (gate.choice != null) {
    const c = gate.choice;
    if (typeof c !== 'object' || Array.isArray(c)) return { ok: false, why: 'choice is { column | row | selector, is }' };
    const extra = Object.keys(c).filter(k => !['column', 'row', 'selector', 'is'].includes(k));
    if (extra.length) return { ok: false, why: `unknown choice key(s) ${extra.join(', ')} — known: column, row, selector, is` };
    if (c.is == null || String(c.is).trim() === '') return { ok: false, why: 'choice needs is: the value the dropdown must show' };
    if (!c.column && !c.row && !c.selector) return { ok: false, why: 'choice needs column, row or selector: which dropdown' };
  }
  if (gate.url != null) { try { _regex(gate.url); } catch (e) { return { ok: false, why: `url pattern does not compile: ${e.message}` }; } }
  for (const k of ['checked', 'visible']) if (gate[k] != null && typeof gate[k] !== 'boolean') return { ok: false, why: `${k} is true or false` };
  for (const k of ['use', 'xpath', 'shows', 'matches', 'equals']) if (gate[k] != null && typeof gate[k] !== 'string') return { ok: false, why: `${k} must be a string` };
  if (['shows', 'checked', 'matches', 'equals', 'visible'].some(k => gate[k] != null) && !gate.selector && !gate.xpath) return { ok: false, why: 'shows, checked, matches, equals and visible need the element (selector or xpath)' };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (gate[k] == null) continue;
    if (!Number.isInteger(gate[k]) || gate[k] < lo || gate[k] > hi) return { ok: false, why: `${k} must be an integer from ${lo} to ${hi}` };
  }
  return { ok: true, why: null };
}

/** stateScript(gate) → a page expression returning { url, text, found, goneFound }, only what the gate asks for */
function stateScript(gate = {}) {
  const g = gate || {};
  return `(function(){
  var out = { url: location.href, text: null, found: null, goneFound: null };
  var sel = ${JSON.stringify(g.selector || null)}, gone = ${JSON.stringify(g.gone || null)}, wantText = ${JSON.stringify(g.text != null)};
  if (sel) { var el = null; try { el = document.querySelector(sel); } catch (_) {}
    if (el) { var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      out.found = { exists: true, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
        text: (el.innerText || el.textContent || '').trim().slice(0, 4000),
        value: el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : (el.value != null ? String(el.value) : '') };
    } else out.found = { exists: false, visible: false, text: '', value: '' }; }
  if (gone) { try { out.goneFound = !!document.querySelector(gone); } catch (_) { out.goneFound = false; } }
  if (wantText && !sel) out.text = (document.body && document.body.innerText || '').slice(0, 20000);
  return out; })()`;
}

/** evalGate(gate, state) → { open, saw, why } */
function evalGate(gate, state) {
  const v = validateGate(gate);
  if (!v.ok) return { open: false, saw: {}, why: v.why };
  const g = gate || {}, s = state || {}, saw = {};
  let why = null;
  const put = (k, want, got, ok, fail) => { saw[k] = { want, got, ok }; if (!ok && !why) why = fail; };
  if (g.url != null) put('url', g.url, s.url || null, urlMatches(g.url, s.url), `the page is ${s.url || 'unknown'}, not ${g.url}`);
  if (g.selector != null) {
    const f = s.found || { exists: false, visible: false };
    put('selector', g.selector, f.exists ? (f.visible ? 'visible' : 'hidden') : 'absent', !!(f.exists && f.visible), `${g.selector} is ${f.exists ? 'hidden' : 'not on the page'}`);
  }
  if (g.text != null) {
    const hay = g.selector ? ((s.found && s.found.text) || '') : (s.text || '');
    put('text', g.text, hay.length > 120 ? hay.slice(0, 120) + '…' : hay, hay.toLowerCase().includes(g.text.toLowerCase()), `"${g.text}" is not ${g.selector ? 'in ' + g.selector : 'on the page'}`);
  }
  if (g.value != null) {
    const got = (s.found && s.found.value) || '';
    put('value', g.value, got, got.trim() === g.value.trim(), `${g.selector} holds ${JSON.stringify(got)}, not ${JSON.stringify(g.value)}`);
  }
  if (g.gone != null) put('gone', g.gone, s.goneFound ? 'present' : 'gone', s.goneFound === false, `${g.gone} is still on the page`);
  return { open: !why, saw, why };
}

/** settled(history, settleMs, now) — open only when every check in the last settleMs was open, and the window is covered */
function settled(history, settleMs = 300, now) {
  const h = (Array.isArray(history) ? history : []).filter(x => x && Number.isFinite(x.ts));
  if (!h.length) return false;
  const t = Number.isFinite(now) ? now : h[h.length - 1].ts;
  if (!h[h.length - 1].open) return false;
  let firstOpen = h.length - 1;
  while (firstOpen > 0 && h[firstOpen - 1].open) firstOpen--;
  return t - h[firstOpen].ts >= settleMs;
}

module.exports = { KEYS, ELEMENT_KEYS, validateGate, stateScript, evalGate, settled, urlMatches };
