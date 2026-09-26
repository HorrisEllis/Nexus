/**
 * ui/lib/api.js — shared fetch helpers
 *
 * Extracted from ui/home/index.html (lines 706-708) per DECOMP.md's own
 * plan: "1609-1611 get/post/del helpers → ui/lib/api.js (shared utility)."
 * These three functions have zero dependency on home's state, channels, or
 * DOM — they're a pure HTTP tool, usable by any UI surface in the system,
 * which is exactly what belongs in lib/ rather than baked into one page.
 *
 * All three fail soft (return null on any error/timeout) rather than throw
 * — every existing call site across the UI already assumes that contract,
 * so it's preserved exactly, not "improved" as part of this extraction.
 *
 * §FIXED 2026-09-13 — James: floating co-pilot widget showing "no
 * response" on real, successful dispatches. Traced: post()'s hardcoded
 * AbortSignal.timeout(8000) — 8 real seconds — against a real backend
 * chain that routinely takes far longer: guardian/ask.js's own askSync
 * defaults to a 90000ms timeout, copilot/lifeline.js's own guardian
 * dispatch to 45000ms, and a real, successful NCP round trip observed
 * this same session took ~17s end to end. The browser was aborting and
 * post() was silently returning null (its own documented fail-soft
 * contract, working exactly as designed) minutes before guardian or
 * copilot had actually failed — every "no response"/"unreachable"
 * message the widget ever showed on a real dispatch was this, not a
 * broken pipe. timeoutMs is now a real parameter, defaulting to the
 * original 8000 so every OTHER existing caller (settings toggles, tile
 * actions, anything that's genuinely supposed to be fast) is completely
 * unaffected — only a caller that knows it's dispatching something
 * long-running (ui/copilot/copilot.js's send(), see that file) passes a
 * real, matching timeout explicitly.
 */
async function get(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return await r.json();
  } catch { return null; }
}

async function post(url, body, timeoutMs = 8000) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await r.json();
  } catch { return null; }
}

async function del(url) {
  try {
    const r = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
    return await r.json();
  } catch { return null; }
}
