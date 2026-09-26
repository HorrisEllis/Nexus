'use strict';
/**
 * plugins/captcha-pause/index.js — real pause-resume-gate contribution.
 *
 * Composes two ALREADY-REAL primitives, exactly as
 * CLEAR-GLASS-CAPABILITY-BREAKDOWN-2026-08-23.md specified ("detect a
 * CAPTCHA challenge in the DOM via dom_query, surface a real
 * notification, block the CLI command until a human clears it"):
 *   - dom.query (clear-glass/src/gates/index.js) — detection.
 *   - driver.exec's 'toast' action (already real — driver/index.js's
 *     _toast(), already wired into browser-action.js's REAL_ACTIONS) —
 *     the real notification.
 * The NEW, real piece this plugin adds: the actual poll/wait/resume loop.
 * Nothing here re-implements DOM inspection or notifications — it calls
 * the real gates for both via ctx.emit/ctx.on (host.js's narrow bus
 * facade), same as any other clear-glass code composing existing gates.
 */

// §REAL, NOT A PLACEHOLDER — known captcha-provider DOM signatures.
// Selector-only (matches dom.query's own real `selector` param — see
// dom/archaeology.js's handleQuery: it forwards `selector` straight into
// `window.__cgDomMesh?.query(selector)`, a real in-page CSS query).
const CAPTCHA_SELECTORS = Object.freeze([
  { provider: 'reCAPTCHA',          selector: 'iframe[src*="recaptcha"], .g-recaptcha' },
  { provider: 'hCaptcha',           selector: 'iframe[src*="hcaptcha"], .h-captcha' },
  { provider: 'Cloudflare Turnstile', selector: 'iframe[src*="challenges.cloudflare.com"], .cf-turnstile' },
]);

/**
 * detectFromQueryResults(results) — pure. `results` is an array of
 * { provider, selector, matchCount } (this plugin's own shape, produced
 * by _queryAll below after calling the real dom.query gate once per
 * selector). Returns { detected, provider } or { detected: false }.
 */
function detectFromQueryResults(results) {
  for (const r of results) {
    if (r.matchCount > 0) return { detected: true, provider: r.provider };
  }
  return { detected: false, provider: null };
}

/**
 * _queryAll(ctx, agentId) — real, calls the real dom.query gate once per
 * known captcha selector via ctx.emit + a one-shot ctx.on listener,
 * correlated by a real requestId folded into the query payload (echoed
 * back in dom.query.result's data, same as any real dom.query caller
 * gets — dom/archaeology.js's handleQuery spreads `...event.data` into
 * its response, confirmed by reading it directly before relying on it).
 * Bounded: each individual query has its own timeout so one hung query
 * can't hang the whole detection pass.
 */
function _queryAll(ctx, agentId, { perQueryTimeoutMs = 2000 } = {}) {
  return Promise.all(CAPTCHA_SELECTORS.map(({ provider, selector }) => new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      resolve({ provider, selector, matchCount: 0, timedOut: true });
    }, perQueryTimeoutMs);
    const unsub = ctx.on('dom.query.result', (event) => {
      if (event.data.requestId !== requestId || settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      const result = event.data.result;
      const matchCount = Array.isArray(result) ? result.length : (result ? 1 : 0);
      resolve({ provider, selector, matchCount });
    });
    ctx.emit('dom.query', { agentId, selector, requestId });
  })));
}

function _toast(ctx, agentId, msg, type = 'warn') {
  // Fire-and-forget, matching REAL_ACTIONS' own toast dispatch shape
  // (browser-action.js: { action: 'toast', msg, type?, durationMs? } via
  // driver.exec) — this plugin emits the exact same real event type.
  ctx.emit('driver.exec', { action: 'toast', agentId, msg, type, durationMs: 6000 });
}

/**
 * checkAndWait(data, ctx) — the real pause-resume-gate handler.
 * data: { agentId, pollIntervalMs?, timeoutMs? }.
 * Returns a Promise resolving to a real Event descriptor:
 *   - { type: 'plugin:captcha-pause:clear', data: { agentId } } — no
 *     CAPTCHA found on the first check; nothing to wait for.
 *   - { type: 'plugin:captcha-pause:cleared', data: { agentId, provider,
 *     waitedMs } } — a CAPTCHA was found, then genuinely cleared (re-
 *     query stopped matching) before timeoutMs.
 *   - { type: 'plugin:captcha-pause:timeout', data: { agentId, provider,
 *     waitedMs } } — still present when timeoutMs was reached. The CLI
 *     caller (whatever emitted the original check-and-wait event) is
 *     expected to treat this as "still blocked," not silently proceed —
 *     COS-1: a CAPTCHA that's still there is not "resolved" just because
 *     the wait loop gave up.
 */
async function checkAndWait(data, ctx) {
  const agentId = data.agentId || 'default';
  const pollIntervalMs = data.pollIntervalMs || 2000;
  const timeoutMs = data.timeoutMs || 120000; // 2 minutes default — a human needs real time to solve one
  const start = Date.now();

  let results = await _queryAll(ctx, agentId);
  let { detected, provider } = detectFromQueryResults(results);

  if (!detected) {
    return { type: 'plugin:captcha-pause:clear', data: { agentId } };
  }

  // §CORRECTED before shipping — a real test caught this: reusing the
  // same `provider` variable for both "what's currently detected" and
  // "what to report once cleared" meant the CLEARED event reported
  // provider:null, because by the time detection flips to false, the
  // loop had already overwritten `provider` with detectFromQueryResults'
  // own null. lastDetectedProvider is set once, before the loop, and
  // never overwritten by a negative check — it answers "what were we
  // waiting on," which is a different question from "is it still there."
  const lastDetectedProvider = provider;
  _toast(ctx, agentId, `CAPTCHA detected (${provider}) — solve it to continue`, 'warn');

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    results = await _queryAll(ctx, agentId);
    ({ detected, provider } = detectFromQueryResults(results));
    if (!detected) {
      _toast(ctx, agentId, 'CAPTCHA cleared — resuming', 'success');
      return { type: 'plugin:captcha-pause:cleared', data: { agentId, provider: lastDetectedProvider, waitedMs: Date.now() - start } };
    }
  }

  return { type: 'plugin:captcha-pause:timeout', data: { agentId, provider: lastDetectedProvider, waitedMs: Date.now() - start } };
}

module.exports = { detectFromQueryResults, checkAndWait, CAPTCHA_SELECTORS };
