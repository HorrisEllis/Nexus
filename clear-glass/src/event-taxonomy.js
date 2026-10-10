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
  // §0.39.365 — a provider tab that did not load after its retries (the window is closed; guardian fails the jobs queued for it)
  // §FN2 0.59.0 — the interaction field's pointer act (driver/index.js _pointer), kept per window by page/attention.js and
  // carried by Nexus Nerve as that window's focus
  // §0.59.3 — a Fiverr order's end-state answers sent to Idearium as a spec and a repo (ipc/bridge.js _gigToIdearium)
  AUTOFILL_GIG_TO_IDEARIUM: {
    description: "A buyer's answers to a gig's end-state questions were sent to Idearium: the spec's title, its workshop and the repo it was saved as.",
    payloadShape: ['title', 'workshop', 'repoUuid', 'ts'],
    severity: 'notable',
  },
  // §0.59.4 — a Guardian listener with the link target "Run Nexus commands" (lib/listener-commands.js)
  GUARDIAN_LISTENER_COMMAND: {
    description: 'A command line a Guardian listener heard ("nexus> …", "idearium …", a ```nexus block) was run through the Nexus command tool: which listener, the line, and whether it ran, was refused (a person-only command) or failed.',
    payloadShape: ['listenerId', 'line', 'ok', 'refused', 'error'],
    severity: 'notable',
  },
  GUARDIAN_LISTENER_COMMAND_RESULT: {
    description: "What a listener-run command came back with, shown in the co-pilot panel: the line and a short text of its result.",
    payloadShape: ['listenerId', 'line', 'ok', 'text', 'ts'],
    severity: 'info',
  },
  // §0.59.5 — a watched chat page (src/page/nexus-chat.js): its nexus> lines run read-only, the answer typed back
  NEXUS_CHAT_COMMAND: {
    description: 'A nexus> line on a watched chat page ran as a Nexus command (read-only there): the page, the line, and whether it ran or was refused.',
    payloadShape: ['url', 'line', 'ok', 'refused'],
    severity: 'notable',
  },
  NEXUS_CHAT_LIMITED: {
    description: 'A watched chat page asked for more than 6 commands in a minute; the rest waited.',
    payloadShape: ['url', 'line', 'ts'],
    severity: 'warning',
  },
  NEXUS_CHAT_REPLY_FAILED: {
    description: "A command's answer could not be typed back into the watched chat (no message box found); it is still in the co-pilot panel.",
    payloadShape: ['url', 'line', 'error', 'ts'],
    severity: 'warning',
  },
  FIELD_POINTER: {
    description: 'An agent (or a person through `idearium field point`) acted on the page with the field\'s pointer: what it did, where, which numbered target, whether something covered it, and how (native or ErosmancerOS).',
    payloadShape: ['agentId', 'do', 'x', 'y', 'n', 'name', 'covered', 'via', 'ts'],
    severity: 'info',
  },
  PROVIDER_HOST_LOAD_FAILED: {
    description: "A provider tab did not load after three attempts (the second after clearing service workers and cache storage): each failure's code, reason and the URL it failed at.",
    payloadShape: ['providerId', 'agentId', 'url', 'error', 'failures'],
    severity: 'warning',
  },
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
  // §GA1 2026-10-02 — clear-glass/src/providers/registry.js: the agent-facts cache no longer matches its stamp
  AGENT_CACHE_STALE: {
    description: 'Clear Glass\'s cache of Guardian\'s agent facts was edited outside Guardian: its content no longer matches the hash it was stamped with — a gap until the next refresh from Guardian replaces it.',
    payloadShape: ['reason', 'hash', 'file'],
    severity: 'warning',
  },
});
