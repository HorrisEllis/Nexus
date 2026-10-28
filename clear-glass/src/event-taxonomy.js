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
    payloadShape: ['listenerId', 'url', 'line', 'ok', 'text', 'ts'],
    severity: 'info',
  },
  // §0.59.9 — a `nexus> …` line typed in the co-pilot pane runs as a Nexus command, no model
  COPILOT_NEXUS_COMMAND: {
    description: 'A nexus> line typed in the co-pilot pane ran as a Nexus command: the line, and whether it ran or was refused.',
    payloadShape: ['line', 'ok', 'refused'],
    severity: 'notable',
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
  // §0.60.0 — providers/attention.js: an agent's tab shown to the person with the COMPARTMENT OS panel
  PROVIDER_ATTENTION: {
    description: "Guardian asked for the person (sign in / map the chat / not connecting) and Clear Glass showed the agent's tab with the panel, or could not.",
    payloadShape: ['providerId', 'reason', 'note', 'shown', 'window'],
    severity: 'notable',
  },
  // 2026-10-12 — his gig import (renderer/gig-panel.js, settings → Autofill): a gig file was loaded
  AUTOFILL_GIG_IMPORTED: {
    description: 'A gig file (.gig; an old .gig.json loads too) was loaded into the gig writer and held to Fiverr\'s limits; nothing was saved, typed or published.',
    payloadShape: ['title', 'warnings', 'ts'],
    severity: 'info',
  },
  // §HC 0.60.260 — James, 2026-10-26: "i can't get passed this." A human check met: the tab tells the truth, and fills stop at it
  PAGE_HUMAN_CHECK: { description: "A person's tab met a human check (Press & Hold, Turnstile, a captcha): its session switched to the engine's own identity, the site remembered, the page reloaded once. Nothing presses or solves it.", payloadShape: ['provider', 'origin', 'switched', 'agentId', 'ts'], severity: 'notable' },
  AUTOFILL_GATE_HUMAN_CHECK: { description: 'An autofill or gig fill stopped at its first gate: the page asks for a human. It is his to pass; nothing was typed.', payloadShape: ['agentId', 'provider', 'url', 'ts'], severity: 'notable' },
  // §AT2 0.60.256 — James, 2026-10-26: "i want to be able to import and export the data." (src/autofill/transfer.js)
  AUTOFILL_EXPORTED: {
    description: 'The autofill data (profiles, learned fields, the last gig) was written out as one .autofill file for him to save.',
    payloadShape: ['profiles', 'learned', 'gig', 'ts'],
    severity: 'info',
  },
  AUTOFILL_IMPORTED: {
    description: 'An .autofill file was merged in: profiles added or replaced (newer only), learned fields set, the gig taken; what it replaced was kept for undo.',
    payloadShape: ['profilesAdded', 'profilesReplaced', 'profilesKept', 'learned', 'gig', 'refused', 'by', 'ts'],
    severity: 'notable',
  },
  AUTOFILL_IMPORT_UNDONE: {
    description: 'The last autofill import was undone: the profiles, the gig and the learned fields it replaced were put back.',
    payloadShape: ['profiles', 'gig', 'learned', 'ts'],
    severity: 'notable',
  },
  // §0.60.157 — emitted and never declared (test-event-contracts EC-05, red on main): the chat crawler (src/chats/crawler.js)
  // and the TLS layer's state (src/main/index.js); payloads read at the emit sites
  CRAWL_LIST: { description: 'The crawler read an account\'s chat list: how many it saw and queued, whether it needs more, where it stopped.', payloadShape: ['account', 'seen', 'queued', 'needMore', 'anchor'], severity: 'info' },
  CRAWL_LIST_FAILED: { description: 'The crawler could not read an account\'s chat list and paused, with the reason.', payloadShape: ['account', 'reason'], severity: 'warning' },
  CRAWL_BACKFILL_SKIPPED: { description: 'The backfill had nothing new to queue for an account.', payloadShape: ['account', 'chats'], severity: 'info' },
  CRAWL_VISIT: { description: 'The crawler opened a chat to file it, and why.', payloadShape: ['account', 'url', 'why'], severity: 'info' },
  CRAWL_VISITED: { description: 'The crawler finished a chat: what kind of page it was, whether it was new, whether it paused.', payloadShape: ['account', 'url', 'kind', 'newData', 'paused'], severity: 'info' },
  TLS_LAYER_STATE: { description: 'The TLS layer (cg-tls-helper) changed state: running on its port, or down with why — sessions then go direct, said.', payloadShape: ['state', 'port', 'why', 'bin', 'caFingerprint', 'restarts'], severity: 'notable' },
});
