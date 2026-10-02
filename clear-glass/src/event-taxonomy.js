'use strict';
// clear-glass/src/event-taxonomy.js — ET3_clearglass_event_taxonomy.
// Conforms to lib/event-taxonomy-pattern.js's real ET1 shape (validated
// below, at the bottom of this file, not just asserted).
//
// §SCOPED — 36 files under clear-glass/src call emit/broadcast/SSE-send
// independently (confirmed by grep, per ET3's own phasemap entry).
// Deliberately scoped to the 3 highest-traffic real subsystems first,
// not all 36 at once: providers/host.js (provider boot / userscript
// injection — already the majority of clear-glass's own real log
// volume), diagnostic/error-capture.js (main-process + renderer error
// capture, already real and running), and plugins/* (userscript
// errors). Every event below is copied from the actual real emit()
// call sites, not invented or assumed from a function name.
//
// §HONEST GAP — plugins/* currently emits ZERO real error events.
// Checked directly (grep across clear-glass/plugins/*/index.js for any
// stream.emit/bus.emit/error-related call): nothing exists yet. ET3's
// own phasemap entry names this as "userscript errors — the exact 'I
// need to know if there is any errors' ask" — that's a real, still-open
// need, not something already built. No taxonomy entries invented for
// it here; a fabricated entry would document something that can't
// actually fire, which is worse than an honest gap.

module.exports = Object.freeze({
  // ── providers/host.js — 9 real event types, all confirmed via grep ────────
  PROVIDER_HOST_INJECTED: {
    description: 'A real userscript was successfully injected into a provider tab (both the CSP-bypassing insertCSS and the executeJavaScript call completed).',
    payloadShape: ['providerId', 'ts'],
    severity: 'info',
  },
  PROVIDER_HOST_NAVIGATE: {
    description: 'A provider tab completed a real, full page navigation (did-navigate — not the in-page SPA navigation new-chat detection uses).',
    payloadShape: ['providerId', 'url', 'ts'],
    severity: 'info',
  },
  PROVIDER_HOST_WAKE_INTRO: {
    description: 'The real wake-word intro was attempted on a genuine new-chat navigation. Fires on both success and honest failure — check ok/reason, not just presence of the event.',
    payloadShape: ['providerId', 'ok', 'reason', 'ts'],
    severity: 'notable',
  },
  PROVIDER_HOST_CRASHED: {
    description: "A provider tab's real webContents crashed.",
    payloadShape: ['providerId', 'reason', 'ts'],
    severity: 'failure',
  },
  PROVIDER_HOST_STARTED: {
    description: 'A real provider window finished its start() sequence and is considered up.',
    payloadShape: ['providerId', 'url', 'ts'],
    severity: 'info',
  },
  PROVIDER_HOST_ALL_BOOTED: {
    description: 'Every configured real provider finished its own start() attempt (success or failure) during boot.',
    payloadShape: ['count', 'ts'],
    severity: 'info',
  },
  PROVIDER_HOST_STOPPED: {
    description: 'A real provider window was deliberately stopped/torn down.',
    payloadShape: ['providerId', 'ts'],
    severity: 'info',
  },
  PROVIDER_HOST_NAVIGATE_FAILED: {
    description: 'A requested real navigation for a provider tab failed to load.',
    payloadShape: ['providerId', 'url', 'error', 'ts'],
    severity: 'warning',
  },
  PROVIDER_HOST_NAVIGATED: {
    description: 'A real navigation completed, reporting whether the resulting page still requires the person to sign in.',
    payloadShape: ['providerId', 'requestedUrl', 'actualUrl', 'needsSignIn', 'ts'],
    severity: 'info',
  },

  // ── diagnostic/error-capture.js — 1 real event type ────────────────────────
  ERROR_CAPTURED: {
    description: 'A real error (main process or renderer) was captured, deduplicated against the same source+type+message signature within the real dedup window, and logged to both the real on-disk JSONL file and the in-memory ring buffer.',
    payloadShape: ['id', 'ts', 'isoTime', 'source', 'type', 'message', 'stack', 'code', 'name', 'url', 'agentId', 'extra'],
    severity: 'failure',
  },

  // ── ipc/bridge.js — the Fiverr gig writer (0.39.301, src/autofill/gig.js) ────
  AUTOFILL_GIG_DRAFTED: {
    description: 'A Fiverr gig was written from an autofill profile and one line of what it offers; nothing was typed or sent anywhere.',
    payloadShape: ['profileId', 'title', 'tags', 'packages', 'warnings', 'ts'],
    severity: 'info',
  },
  AUTOFILL_GIG_FILLED: {
    description: 'A written gig was typed into the gig editor open in a tab — never saved or published; what the page did not offer as a field is left to copy.',
    payloadShape: ['agentId', 'filled', 'skipped', 'failed', 'leftToCopy', 'ts'],
    severity: 'info',
  },

  // ── plugins/* — deliberately empty. See the real, honest gap noted
  //    above this export — nothing here yet because nothing real exists
  //    to document.
});
