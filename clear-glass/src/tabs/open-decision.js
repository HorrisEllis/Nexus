'use strict';
/**
 * clear-glass/src/tabs/open-decision.js — where a page's request to open something goes: a tab, a window, or an Idearium compartment page
 * (FP1, 0.60.221). Pure: the request in, one decision out, named by the rule that made it.
 * Spec: clear-glass/spec/flow-cores.spec MOD-FC-OPEN · Map: docs/2026-10-28-first-principles-phasemap.spec FP1
 *
 * James, 2026-10-28: "why did fiverr open in a popout window? like none of the autofill works." · "I want it just to open in a new tab." ·
 * "we need to first principles this. only whats needed for a fact."
 * The fact (F1): compartment-window.js allowed every site popup as a bare window, and Fiverr's Edit Gig is a target=_blank link, so it left the
 * reach of every tab, driver, autofill and macro. A link meant as a tab is a tab. A sized popup (a sign-in, a payment) stays a window: it
 * reports back to the page that opened it through window.opener. A non-web url (about:blank, javascript:, blob:, data:) stays a window too:
 * its opener writes into it.
 */

const RULES = Object.freeze([
  'compartment-page: an Idearium page opens as its frameless compartment window',
  'not-web: a url that is not http(s) stays a window (its opener writes into it)',
  'foreground-tab: a link meant as a new tab opens a tab',
  'background-tab: a link meant as a background tab opens a tab behind',
  'new-window: a sized popup stays a window (window.opener is kept)',
  'other: anything else stays a window, as before',
]);

/** decideOpen({ url, disposition, features, compartment }) → { open: 'tab'|'window'|'compartment-page', background, why } */
function decideOpen({ url, disposition, compartment } = {}) {
  if (compartment) return { open: 'compartment-page', background: false, why: RULES[0] };
  let scheme = '';
  try { scheme = new URL(String(url || 'about:blank')).protocol; } catch (_) { scheme = ''; }
  if (scheme !== 'http:' && scheme !== 'https:') return { open: 'window', background: false, why: RULES[1] };
  if (disposition === 'foreground-tab') return { open: 'tab', background: false, why: RULES[2] };
  if (disposition === 'background-tab') return { open: 'tab', background: true, why: RULES[3] };
  if (disposition === 'new-window') return { open: 'window', background: false, why: RULES[4] };
  return { open: 'window', background: false, why: `${RULES[5]} (disposition ${JSON.stringify(disposition == null ? null : disposition)})` };
}

module.exports = { decideOpen, RULES };
