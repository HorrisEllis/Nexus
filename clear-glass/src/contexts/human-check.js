'use strict';
/**
 * clear-glass/src/contexts/human-check.js — a page asking "are you human?" is the person's, and the tab tells it the truth (HC1, 0.60.260)
 * comp_id: clear-glass.contexts.human-check
 * Map: docs/2026-10-26-human-check-phasemap.spec
 *
 * James, 2026-10-26, with a screenshot of Fiverr's "Before we continue… Press & Hold to confirm you are a human (and not a bot)" that never
 * let him through: "i can't get passed this. can you help? do everything you can, find out why and help. each step of the autofill can be gates."
 *
 * Why it never passed (traced, §0.1): every person tab is a Firefox persona (contexts/manager.js create → fingerprint engine: a Firefox
 * user agent, Firefox Accept headers, no client hints, a Firefox TLS handshake) on a Chromium engine whose JavaScript is Chromium's. A
 * human check (HUMAN/PerimeterX here) reads that mismatch as a bot, so the hold never verifies. Worse, ErosmancerOS's hostile detector
 * met a challenge by switching the tab to Firefox again (main/index.js /hook/hostile).
 *
 * What this does, and what it never does:
 *   - detects a human-check page (detectScript runs in the page; isHumanCheck reads what it returns);
 *   - the tab's session goes back to the engine's own identity (ContextManager.useEngineIdentity) and the site is remembered
 *     (site settings `identity: engine`), so the person can pass the check himself;
 *   - it NEVER presses, holds, clicks or solves the check, and every agent and autofill step stops at it (a gate: humanCheckGate).
 */
const PROVIDERS = Object.freeze([
  { id: 'human-perimeterx', test: (p) => /px-captcha|captcha\.px-cdn|px-cloud\.net|perimeterx/i.test(p.markers) || /press\s*(?:&|and)\s*hold/i.test(p.text) },
  { id: 'cloudflare', test: (p) => /challenges\.cloudflare\.com|cf-turnstile|cf-chl/i.test(p.markers) || /verify you are human|checking (?:if the site connection is secure|your browser)/i.test(p.text) || /^just a moment/i.test(p.title) },
  { id: 'recaptcha', test: (p) => /google\.com\/recaptcha|recaptcha\.net|g-recaptcha/i.test(p.markers) },
  { id: 'hcaptcha', test: (p) => /hcaptcha\.com|h-captcha/i.test(p.markers) },
  { id: 'datadome', test: (p) => /captcha-delivery\.com|datadome/i.test(p.markers) },
  { id: 'generic', test: (p) => /are you a robot|confirm you are (?:a )?human|not a bot/i.test(p.text) },
]);

/** detectScript — runs in the page (read only): what a check would show. Never touches the page. */
const detectScript = `(() => {
  const vis = (el) => { try { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; } catch (_) { return false; } };
  const frames = [...document.querySelectorAll('iframe')].filter(vis).map(f => f.src || f.id || '').join(' ');
  const ids = [...document.querySelectorAll('[id*="captcha" i],[class*="captcha" i],[id*="px-" i],.cf-turnstile,.g-recaptcha,.h-captcha')].filter(vis).map(e => e.id + ' ' + e.className).join(' ');
  const scripts = [...document.scripts].map(s => s.src).filter(Boolean).join(' ');
  return { url: location.href, title: document.title, text: (document.body && document.body.innerText || '').slice(0, 4000), markers: frames + ' ' + ids + ' ' + scripts };
})()`;

/** isHumanCheck(page) → { check: true, provider } | { check: false }. page: what detectScript returned. Scripts alone (a site that loads
 * PerimeterX on every page) do not count: something visible or the words must be there too. */
function isHumanCheck(page = {}) {
  const p = { markers: String(page.markers || ''), text: String(page.text || ''), title: String(page.title || '') };
  const visible = { ...p, markers: p.markers.split(/\s+/).filter(Boolean).filter(m => !/^https?:\/\/[^ ]+\.js(\?|$)/i.test(m)).join(' ') };
  for (const pr of PROVIDERS) if (pr.test(visible)) return { check: true, provider: pr.id };
  return { check: false };
}

/** the engine's own user agent: the default session's, already cleaned of Electron/Clear Glass at boot */
function engineUserAgent(electronSession) {
  let ua = ''; try { ua = electronSession.defaultSession.getUserAgent(); } catch (_) {}
  return require('../net/compartment').cleanUserAgent(ua);
}

/**
 * humanCheckGate({ page }) — the gate every autofill and agent step passes before it types or clicks (§HC3). page: detectScript's result.
 * → { pass: true } | { pass: false, needsPerson: true, provider, why }
 */
function humanCheckGate(page) {
  const h = isHumanCheck(page || {});
  return h.check ? { pass: false, needsPerson: true, provider: h.provider, why: `the page asks for a human (${h.provider}): it is yours to pass — nothing here presses, holds or solves it` } : { pass: true };
}

module.exports = { PROVIDERS, detectScript, isHumanCheck, engineUserAgent, humanCheckGate };
