'use strict';
/**
 * src/plugins/contribution-types.js — Clear Glass Plugin Contribution Types
 * UUID: cg-plugin-contrib-types-v1-0000-0000-000000000002
 *
 * cos/foundation/enums.js's PLUGIN_TYPE ('runtime', 'compiler', 'archetype',
 * 'blueprint', 'ui', 'cli', 'watchdog-rule', 'transform', 'theme', 'meta')
 * is COS-level vocabulary — checked directly, not reused, because none of
 * it names a browser-plugin concern. This is that vocabulary for Clear
 * Glass specifically. Same frozenEnum shape as cos/foundation/enums.js
 * (O(1) membership check via a Set) — not reused by require() because
 * enums.js's frozenEnum() is a 4-line pure function; copying that shape is
 * not copying a component, it's using the same idiom cos/foundation and
 * cos/plugin/schema.js both already use.
 *
 *   content-filter      — matches/blocks outbound requests before they're
 *                          sent (adblocker's contribution type).
 *   request-interceptor — inspects/modifies requests or responses without
 *                          necessarily blocking them (broader than
 *                          content-filter: header rewriting, logging).
 *   pause-resume-gate   — detects a real-page condition (e.g. a CAPTCHA
 *                          challenge) and blocks a CLI action until a
 *                          human clears it, then resumes. See
 *                          clear-glass/plugins/captcha-pause for the real
 *                          implementation — this is the exact "CAPTCHA-
 *                          aware CLI pause" shape from CLEAR-GLASS-
 *                          CAPABILITY-BREAKDOWN-2026-08-23.md, not a
 *                          generic passive detector.
 *   page-detector       — a general DOM-signature check that emits a real
 *                          event on match, no pause/block semantics.
 *   toolbar-command      — registers into the REAL toolbar command
 *                          registry (src/toolbar/commands.js), not a
 *                          separate plugin-owned toolbar list. A plugin
 *                          contributing this gets a real pinnable button
 *                          through the same registry browser.js already
 *                          reads — see host.js's installPlugin().
 *   context-menu-item   — adds a real entry to #ctx-menu (browser.html),
 *                          same real, wired dispatch documented in
 *                          CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23's §1.
 *   userscript          — §NEW 2026-08-24. Registers a real userscript
 *                          via the ALREADY-REAL UserscriptManager
 *                          (src/userscripts/manager.js — url-pattern
 *                          matching, auto-inject-on-navigation, all real,
 *                          all pre-existing) through the already-real
 *                          userscript.create/userscript.delete gates. The
 *                          real port target from GUARDIAN-ARCHIVE-MINING-
 *                          2026-08-23.md's #1 priority ("the social-media
 *                          listener pattern... genuinely the strongest
 *                          single piece of prior art") — a platform-aware
 *                          listener module, injected as a userscript,
 *                          emitting through the SAME guardian.listener.
 *                          start/guardian.listener.event wire protocol
 *                          guardian-picker.js (TX14) already established,
 *                          so it plugs into the identical, already-real
 *                          routing (ledger/compartment/sse-to-system/
 *                          ollama-stream) TX14's listener-config-modal
 *                          already offers — not a second, competing
 *                          listener system.
 *   permission-filter   — §NEW 2026-08-24. Decides allow/deny for a real
 *                          Electron session.setPermissionRequestHandler
 *                          request (camera/mic/geolocation/etc — the gap
 *                          named directly in CLEAR-GLASS-FULL-CHROME-MAP-
 *                          2026-08-23.md's §9: "session.setPermission
 *                          RequestHandler... doesn't exist in this tree
 *                          at all... currently, a page requesting
 *                          getUserMedia would hit Electron's own default
 *                          behavior, unconfigured"). Same shape as
 *                          content-filter (a request comes in, a plugin
 *                          decides), wired via src/plugins/
 *                          permission-adapter.js — but fail-CLOSED on
 *                          timeout, not fail-open like webrequest: an ad
 *                          request that hangs should still let the page
 *                          load; a permission request that hangs should
 *                          default to denied, not granted.
 */

function frozenEnum(values) {
  const arr = Object.freeze([...values]);
  const set = Object.freeze(new Set(arr));
  return { values: arr, has: (v) => set.has(v) };
}

const CLEAR_GLASS_CONTRIBUTION_TYPE = frozenEnum([
  'content-filter',
  'request-interceptor',
  'pause-resume-gate',
  'page-detector',
  'toolbar-command',
  'context-menu-item',
  'userscript',
  'permission-filter',
]);

module.exports = { CLEAR_GLASS_CONTRIBUTION_TYPE };
