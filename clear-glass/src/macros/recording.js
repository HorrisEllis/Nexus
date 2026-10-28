'use strict';
/**
 * src/macros/recording.js — recorded page events → macro steps (pure)
 * component_id: cg.macros.recording
 *
 * §BUILT 2026-09-26 — James: "make the macros way more user friendly."
 * The driver has had a recorder since record.start/record.stop were added
 * (src/driver/index.js) but nothing turned what it captured into a macro.
 * This is that conversion, pure so it's testable without a browser:
 *
 *   click                        → click {selector}
 *   input/change on the same el  → one type {selector, text} (last value wins)
 *   keydown Enter + submit       → type {selector, text:'\n'} (Enter alone is not kept)
 *   submit after a click         → dropped: it is the click's effect
 *   scroll                       → scroll {deltaY} (0.60.57: kept, summed per scroller)
 *   arrow/Page/Home/End/Space    → driver_exec pressKey (0.60.57)
 *   gap >= 1.5 s                 → wait {ms} (0.60.57, capped 5 s)
 *   navigation                   → navigate {url} for the start url and each new url
 *
 * Password fields are never stored in clear: their value becomes the
 * {{password}} parameter, so a recorded login replays without the macro
 * ever holding the secret.
 */

const GAP_MS = 1500, MAX_WAIT_MS = 5000;
const PAGE_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Space']);
const SENSITIVE = /pass(word)?|pwd|secret|otp|cvv|cvc|pin\b/i;

function _paramName(sel, used) {
  let base = String(sel || 'value').replace(/^[#.]/, '').replace(/\[name="?([^"\]]+)"?\]/, '$1').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'value';
  if (/^\d/.test(base)) base = 'f_' + base;
  let n = base, i = 2;
  while (used.has(n)) n = `${base}_${i++}`;
  used.add(n);
  return n;
}

/**
 * @param {Array<{type, sel, value?, url?, inputType?, ts}>} recording
 * @param {{ startUrl?: string }} opts
 * @returns {{ steps: object[], params: string[] }}
 */
function recordingToSteps(recording, { startUrl = null } = {}) {
  const steps = [];
  const params = [];
  const used = new Set();
  let lastUrl = null, lastTs = 0;
  const scrollY = new Map();
  const pushNav = (url) => {
    if (!url || url === lastUrl || /^about:|^data:/.test(url)) return;
    steps.push({ action: 'navigate', data: { url } });
    lastUrl = url;
  };
  pushNav(startUrl);

  for (let i = 0; i < (recording || []).length; i++) {
    const ev = recording[i] || {};
    if (ev.url && ev.url !== lastUrl && ev.type === 'navigate') { pushNav(ev.url); continue; }
    // MR2 (0.60.57): slow gaps become waits; scroll and paging keys are kept, because a chat read depends on them
    if (ev.ts && lastTs && ev.ts - lastTs >= GAP_MS && ev.type !== 'navigate') {
      const prevS = steps[steps.length - 1];
      const ms = Math.min(MAX_WAIT_MS, ev.ts - lastTs);
      if (prevS && prevS.action === 'wait') prevS.data.ms = Math.min(MAX_WAIT_MS, prevS.data.ms + ms); else steps.push({ action: 'wait', data: { ms } });
    }
    if (ev.ts) lastTs = ev.ts;
    if (ev.type === 'scroll') {
      const k = ev.sel || '';
      const from = scrollY.has(k) ? scrollY.get(k) : 0;
      scrollY.set(k, ev.y || 0);
      const dy = (ev.y || 0) - from;
      if (!dy) continue;
      const prev = steps[steps.length - 1];
      if (prev && prev.action === 'scroll' && (prev.data._k || '') === k) { prev.data.deltaY += dy; if (!prev.data.deltaY) steps.pop(); }
      else steps.push({ action: 'scroll', data: { deltaY: dy, ...(k ? { _k: k } : {}) } });
      continue;
    }
    if (ev.type === 'keydown' && ev.key && ev.key !== 'Enter') {
      if (PAGE_KEYS.has(ev.key)) steps.push({ action: 'driver_exec', data: { action: 'pressKey', key: ev.key === 'Space' ? ' ' : ev.key } });
      continue;
    }
    const sel = ev.sel;
    if (!sel) continue;
    // 0.60.224 — a checkbox or radio is a state: its change becomes check {selector, checked}, and the clicks that made it (on the box or
    // its label, within a moment before) are dropped, so a replay sets the state instead of toggling whatever is there
    if ((ev.type === 'change' || ev.type === 'input') && (ev.inputType === 'checkbox' || ev.inputType === 'radio')) {
      while (steps.length && steps[steps.length - 1].action === 'click' && steps[steps.length - 1]._ts && ev.ts && ev.ts - steps[steps.length - 1]._ts < 400) steps.pop();
      const prev = steps[steps.length - 1];
      if (prev && prev.action === 'check' && prev.data.selector === sel) prev.data.checked = ev.checked !== false;
      else steps.push({ action: 'check', data: { selector: sel, checked: ev.checked !== false } });
      continue;
    }
    if (ev.type === 'click') {
      const prev = steps[steps.length - 1];
      // a click on the field you then type into is implied by the type step
      const next = recording[i + 1];
      if (next && (next.type === 'input' || next.type === 'change') && next.sel === sel) continue;
      if (!(prev && prev.action === 'click' && prev.data.selector === sel)) steps.push({ action: 'click', data: { selector: sel }, _ts: ev.ts, ...(ev.text ? { label: ev.text } : {}) });   // label: what the button said (0.60.224)
      continue;
    }
    if (ev.type === 'input' || ev.type === 'change') {
      const prev = steps[steps.length - 1];
      const secret = ev.inputType === 'password' || SENSITIVE.test(sel);
      const text = ev.value == null ? '' : String(ev.value);
      if (prev && prev.action === 'type' && prev.data.selector === sel) {
        if (!prev._param) prev.data.text = text;
        continue;
      }
      const step = { action: 'type', data: { selector: sel, text } };
      if (secret) {
        const p = _paramName('password', used);
        step.data.text = `{{${p}}}`; step._param = p; params.push(p);
      }
      steps.push(step);
      continue;
    }
    if (ev.type === 'keydown' && ev.key === 'Enter') {
      const next = recording[i + 1];
      if (next && next.type === 'submit') { steps.push({ action: 'type', data: { selector: sel, text: '\n' } }); i++; }
      continue;
    }
    // submit after a recorded click is the click's effect; scroll/other keys are noise
  }
  return { steps: steps.map(({ _param, _ts, ...s }) => { if (s.data && s.data._k !== undefined) { const { _k, ...d } = s.data; return { ...s, data: d }; } return s; }), params };
}

/** One-line, plain-language description of a step (for the step list). */
function describeStep(step) {
  const d = (step && step.data) || {};
  if (step && step.engine === 'erosmancer') return `Erosmancer ${step.action}${step.targetUuid ? ' on ' + step.targetUuid.slice(0, 8) : ''}${d.payload ? ` “${String(d.payload).slice(0, 40)}”` : ''}`;
  switch (step && step.action) {
    case 'navigate':     return `Go to ${d.url || '(no url)'}`;
    case 'click':        return `Click ${d.selector || '(no selector)'}`;
    case 'type':         return d.text === '\n' ? `Press Enter in ${d.selector}` : `Type “${String(d.text ?? '').slice(0, 40)}” into ${d.selector || '(no selector)'}`;
    case 'check':        return `${d.checked === false ? 'Untick' : 'Tick'} ${d.selector || '(no selector)'}`;
    case 'hover':        return `Hover ${d.selector}`;
    case 'scroll':       return `Scroll ${d.selector || 'the page'}`;
    case 'wait':         return `Wait ${d.ms ?? '?'} ms`;
    case 'wait_for':     return `Wait until ${d.selector} appears`;
    case 'screenshot':   return 'Take a screenshot';
    case 'find_in_page': return `Find “${d.text}” on the page`;
    case 'toast':        return `Show “${d.text}”`;
    case 'eval':         return `Run script (${String(d.code || '').length} chars)`;
    default:             return `${(step && step.action) || '?'} ${Object.keys(d).length ? JSON.stringify(d).slice(0, 60) : ''}`.trim();
  }
}

module.exports = { recordingToSteps, describeStep, SENSITIVE };
