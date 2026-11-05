'use strict';
/**
 * clear-glass/src/eros/threats.js — what ErosmancerOS's hostile/ detections mean, in plain words, and the hand-over: when a page shows a bot
 * check, a running macro pauses and the page is his (ES3, 0.60.409). Map: docs/2026-11-05-cleardriver-mutators-and-erosmancer-surface-phasemap.spec
 * ES3, decision CM_D1 ("a threat hands over, never evades").
 * James, 2026-11-05: "add as much human ledgible options as possible, inscluding adding typescripts, threats, etc, all cli first".
 *
 * hostile/ is his module and is left as it is (his words the same day: "can you at least leave them alone"). This file only reads its answers
 * (GET /api/hostile/state) and says them; nothing here changes pace, routing or fingerprints to get past a check.
 *
 *   WORDS                       → { <ThreatType>: { what, then } }  every type hostile/ names (a test reads them from its source)
 *   typesFromSource(text)       → the ThreatType union in erosmancer-os/src/hostile/index.ts
 *   describe(states)            → [{ tab, level, score, signals: [{ type, what, then, evidence, at }] }]   (none → [])
 *   PAGE_CHECK                  → an expression run in the page: { challenge: <type> | null, saw }   the page's own signs, for the hand-over
 *   handOver({ check, pause, notify }) → checks the page; on a challenge pauses and tells him; returns { handedOver, type, saw }
 */
const fs = require('fs');
const path = require('path');

const HOSTILE = path.join(__dirname, '..', '..', 'erosmancer', 'erosmancer-os', 'src', 'hostile', 'index.ts');

const WORDS = Object.freeze({
  'cloudflare-challenge': { what: 'Cloudflare is checking that you are a person ("Just a moment…")', then: 'the page is yours: wait for it, or tick its box' },
  'cloudflare-turnstile': { what: 'a Cloudflare Turnstile box asks you to confirm you are a person', then: 'the page is yours: tick the box' },
  'cloudflare-fronted': { what: 'the site sits behind Cloudflare (no check yet)', then: 'nothing to do; it is only said' },
  recaptcha: { what: 'a Google reCAPTCHA', then: 'the page is yours: solve it' },
  hcaptcha: { what: 'an hCaptcha', then: 'the page is yours: solve it' },
  'custom-captcha': { what: 'the site\'s own CAPTCHA (a picture or a puzzle)', then: 'the page is yours: solve it' },
  honeypot: { what: 'a hidden field a person would never see (a trap for bots)', then: 'it is never filled' },
  'rate-limit': { what: 'the site says too many requests (slow down)', then: 'the automation waits; try again later' },
  'fingerprint-script': { what: 'a script that reads what kind of browser and machine this is', then: 'only said; nothing is changed to hide from it' },
  'cdp-detection': { what: 'a script that looks for an automated browser (DevTools)', then: 'only said; nothing is changed to hide from it' },
  'redirect-chain': { what: 'the page bounced through several addresses (often a check)', then: 'only said; if a check appears, the page is yours' },
  'unknown-hostile': { what: 'something hostile ErosmancerOS could not name', then: 'only said; look at the page' },
});
// the checks a person answers: a running macro pauses on these
const HAND_OVER = Object.freeze(['cloudflare-challenge', 'cloudflare-turnstile', 'recaptcha', 'hcaptcha', 'custom-captcha', 'rate-limit']);

function typesFromSource(text) {
  if (text == null) { try { text = fs.readFileSync(HOSTILE, 'utf8'); } catch (_) { return []; } }
  const m = /export type ThreatType =([\s\S]*?);/.exec(text); if (!m) return [];
  return (m[1].match(/"([\w-]+)"/g) || []).map(s => s.replace(/"/g, ''));
}

const LEVELS = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
function describe(states) {
  const out = [];
  for (const [tab, st] of Object.entries(states || {})) {
    if (!st) continue;
    const signals = (st.activeSignals || []).map(s => ({ type: s.type, level: s.level, ...(WORDS[s.type] || WORDS['unknown-hostile']), evidence: String(s.evidence || '').slice(0, 200), at: s.ts || null }));
    if (!signals.length && (LEVELS[st.level] || 0) === 0) continue;
    out.push({ tab, level: st.level, score: st.score, signals });
  }
  return out.sort((a, b) => (LEVELS[b.level] || 0) - (LEVELS[a.level] || 0));
}

// the page's own signs of a check a person must answer (read-only: it looks, it never clicks or changes anything)
const PAGE_CHECK = `(() => {
  const q = (s) => { try { return document.querySelector(s); } catch (_) { return null; } };
  const t = (document.title || '').toLowerCase();
  if (q('iframe[src*="challenges.cloudflare.com"]') || q('.cf-turnstile') || q('[name="cf-turnstile-response"]')) return { challenge: 'cloudflare-turnstile', saw: 'a Cloudflare Turnstile box' };
  if (q('#challenge-form') || q('#cf-challenge-running') || t.indexOf('just a moment') >= 0) return { challenge: 'cloudflare-challenge', saw: 'Cloudflare\\'s "Just a moment…" check' };
  if (q('iframe[src*="recaptcha"]') || q('.g-recaptcha')) return { challenge: 'recaptcha', saw: 'a reCAPTCHA' };
  if (q('iframe[src*="hcaptcha.com"]') || q('.h-captcha')) return { challenge: 'hcaptcha', saw: 'an hCaptcha' };
  if (q('#px-captcha') || q('[id^="px-captcha"]')) return { challenge: 'custom-captcha', saw: 'a press-and-hold check (PerimeterX)' };
  if (q('iframe[src*="captcha-delivery.com"]')) return { challenge: 'custom-captcha', saw: 'a DataDome check' };
  const b = (document.body && document.body.innerText || '').slice(0, 3000).toLowerCase();
  if (/too many requests|rate limit(ed)?|slow down/.test(b) && b.length < 1500) return { challenge: 'rate-limit', saw: 'the site says too many requests' };
  return { challenge: null, saw: null };
})()`;

/** handOver — check the page; on a check a person answers, pause the run and tell him which, on which page */
async function handOver({ check, pause = () => {}, notify = () => {}, url = null } = {}) {
  let r = null; try { r = await check(PAGE_CHECK); } catch (_) { return { handedOver: false, why: 'the page could not be read' }; }
  if (r && typeof r === 'object' && 'result' in r && !('challenge' in r)) r = r.result;
  if (!r || !r.challenge || !HAND_OVER.includes(r.challenge)) return { handedOver: false };
  const w = WORDS[r.challenge];
  try { pause(); } catch (_) {}
  const msg = `${w.what}${url ? ` on ${url}` : ''} — the macro is paused; ${w.then}, then press resume.`;
  try { notify(msg, r); } catch (_) {}
  return { handedOver: true, type: r.challenge, saw: r.saw, message: msg };
}

module.exports = { WORDS, HAND_OVER, PAGE_CHECK, typesFromSource, describe, handOver };
