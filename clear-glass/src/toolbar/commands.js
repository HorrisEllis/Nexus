'use strict';
/**
 * src/toolbar/commands.js — Toolbar Command Registry
 * UUID: cg-toolbar-commands-v1-0000-0000-000000000001
 *
 * §STRUCTURAL 2026-08-24 — this list used to be SPOTLIGHT_COMMANDS, defined
 * inline inside clear-glass/renderer/browser.js. That made it invisible to
 * anything except that one renderer file: no CLI could list available
 * toolbar commands, no other backend code could ask "what's pinnable and
 * what's pinned by default," and options/store.js's DEFAULTS.pinnedToolbar
 * Buttons duplicated the "which ids are on by default" answer as a second,
 * separately-maintained array with no link back to this one — the two could
 * silently drift (add a command here, forget to update the other, and
 * store.js's default either references a dead id or omits a real one).
 *
 * The renderer's job is to be disposable — replaceable without losing any
 * logic, because the logic doesn't live there. This file is the one place
 * that answers "what commands exist, what do they do when activated, and
 * which are pinned by default." The renderer only renders it:
 *   - main process requires this directly (real Node require, real CLI
 *     access — `node -e "console.log(require('./src/toolbar/commands'))"`
 *     works with zero Electron/browser context).
 *   - ipc/bridge.js exposes it read-only over IPC ('toolbar:commands').
 *   - options/store.js derives its own DEFAULTS.pinnedToolbarButtons from
 *     this file's defaultPinned flags — one source, not two.
 *   - browser.js fetches it once via cg.toolbar.commands() and renders
 *     from the result. It does not know the command list ahead of time.
 *
 * Each entry:
 *   id         — DOM element id in the chrome bar, if this command IS a
 *                permanent toolbar button (pin/unpin toggles that button's
 *                visibility). Omit for palette-only actions (no id).
 *   action     — dispatch key for palette-only commands with no backing
 *                DOM element (handled in activateSpotlightCommand's switch).
 *   icon       — glyph shown in the toolbar button and the palette row.
 *   label      — human-readable name, shown in the command palette.
 *   group      — palette section heading.
 *   pinnable   — whether this command's toolbar button can be individually
 *                shown/hidden via the pin system. Palette-only actions
 *                (no `id`) are never pinnable — there's no button to pin.
 *   defaultPinned — true for the small set visible on a fresh install.
 *   pairsWith  — optional list of other DOM element ids whose visibility
 *                should track this command's pin state exactly (e.g. the
 *                Element Picker's route-selector and API-url input only
 *                make sense while the Element Picker button itself is
 *                visible — see §BUGFIX below).
 */

const TOOLBAR_COMMANDS = [
  { id: 'btn-gig',         icon: '✦', label: 'Fiverr gigs',            group: 'Tools',   pinnable: true, defaultPinned: true },   // §0.59.3 James: "fiverr … this is my only chance"
  { id: 'btn-dom',         icon: '⛏', label: 'DOM Archaeology',        group: 'Tools',   pinnable: true, defaultPinned: false },
  // §BUGFIX 2026-08-24 — picker-route (the "→ SSE / → API" select) and
  // picker-api-url (the endpoint input, shown only when "→ API" is chosen)
  // were separate DOM elements with NO entry in the old inline
  // SPOTLIGHT_COMMANDS list at all, so applyToolbarPins() never touched
  // them — they stayed permanently visible in the chrome bar regardless of
  // whether Element Picker itself was pinned. A route selector for a
  // feature whose activator button is hidden is dead UI. pairsWith fixes
  // this at the source: unpinning picker-btn now hides its selector too.
  { id: 'picker-btn',      icon: '◎', label: 'Element Picker',         group: 'Tools',   pinnable: true, defaultPinned: false, pairsWith: ['picker-route', 'picker-api-url'] },
  { id: 'btn-mesh',        icon: '⬡', label: 'Agent Mesh',             group: 'Tools',   pinnable: true, defaultPinned: false },
  { id: 'copilot-toggle',  icon: '✦', label: 'Toggle Co-pilot',        group: 'Session', pinnable: true, defaultPinned: true  },
  { id: 'btn-bookmark',    icon: '★', label: 'Bookmark this page',     group: 'Session', pinnable: true, defaultPinned: true  },
  { id: 'btn-rewind',      icon: '⏮', label: 'Rewind session',         group: 'Session', pinnable: true, defaultPinned: false },
  { id: 'btn-providers',   icon: '⟳', label: 'NCP Providers',          group: 'Session', pinnable: true, defaultPinned: false },
  // §FIXED 2026-09-25 — James, pointing at the real "Customize Toolbar"
  // dialog (screenshot): "WHERE IS IT? anything outside of this, is
  // wrong." Root cause, found by reading this file plus browser.js's
  // dialog renderer, not assumed: `settings` used to be `action`-only
  // (no `id`), which per this file's own rule above means "no button to
  // pin" — structurally excluded from BOTH real discovery surfaces the
  // dialog offers: the draggable Toolbar/⋯-Menu zones (browser.js line
  // ~1483, `filter(c => c.id && c.pinnable)`) AND the ⋯ menu's own
  // auto-populated "Tools" section for unpinned commands (line ~1440,
  // same filter). It only ever showed up in the dialog's small,
  // scrollable "Actions" list at the bottom, mislabeled "API Settings…"
  // and grouped under "Window" next to New Agent Window / Mesh Queue —
  // exactly what a user scanning for "Settings" (his own reference:
  // Firefox's ☰ menu) would miss. Real fix, not a relabel: gave it a
  // real id + a real backing <button id="btn-settings"> in the chrome
  // bar's overflow slot (browser.html, same convention as btn-mesh /
  // btn-diag), pinnable like every other real tool here. That makes it
  // (a) draggable directly onto the toolbar or into the ⋯ Menu drop
  // zone in this exact dialog, and (b) automatically listed in the live
  // ⋯ menu's "Tools" section the moment it's unpinned — the actual gap
  // James is describing, closed at its structural cause instead of
  // papered over with a new label on the same invisible action.
  { id: 'btn-settings',    icon: '⚙', label: 'Settings',               group: 'Session', pinnable: true, defaultPinned: false },
  // §0.39.265 — James: "remove the old" — Diagnostics, Userscripts and Nexus
  // Options left the toolbar (each has a Settings section: Diagnostics, Agent
  // suite › Userscripts, General / Privacy & data), and the Window actions
  // (New Agent Window, Move to Background Tab, Maximize / Restore, Mesh Queue,
  // Reset toolbar to defaults) left the palette. The Customize Toolbar
  // dialog's own "Restore Defaults" button still resets the pins.
  // 0.39.272 — the page James is looking at (a job post, an Upwork gig, a Fiverr buyer message) into the opportunity
  // pipeline: copilot :3750 POST /api/opportunity/capture reads this tab through /cli/page/read, scores it, and says
  // where it landed. A palette action (no toolbar button), in the Tools group.
  { action: 'capture-opportunity', icon: '✚', label: 'Capture job / gig / lead to NEXUS', group: 'Tools' },
];

function defaultPinnedIds() {
  return TOOLBAR_COMMANDS.filter(c => c.pinnable && c.defaultPinned).map(c => c.id);
}

/**
 * registerPluginCommand(cmd) — §NEW 2026-08-24, src/plugins/host.js's
 * install(). A plugin's toolbar-command contribution lands HERE, in the
 * same array browser.js's cg.toolbar.commands() call returns — not a
 * second, plugin-owned list a renderer would need a second fetch for.
 * Mutates TOOLBAR_COMMANDS in place (module-level singleton, same
 * lifetime as the process) rather than returning a copy — every existing
 * reader (options/store.js's defaultPinnedIds(), the toolbar:commands IPC
 * handler) reads this same array reference, so a plugin installed after
 * boot is visible to a NEW renderer fetch without restarting anything.
 * Real, minimal duplicate-id guard: COS-3-shaped, a plugin's id is
 * already namespaced `plugin:<pluginId>:...` by schema.js before this is
 * ever called, so a collision here means the SAME plugin was installed
 * twice, not two different plugins colliding — surfaced as a real error,
 * not silently overwritten.
 */
function registerPluginCommand(cmd) {
  if (TOOLBAR_COMMANDS.some(c => c.id === cmd.id)) {
    throw new Error(`[toolbar/commands] duplicate command id: '${cmd.id}' (plugin already installed?)`);
  }
  TOOLBAR_COMMANDS.push(cmd);
  return cmd;
}

/**
 * unregisterPluginCommand(id) — the disable()/uninstall() counterpart.
 * No-op (returns false) if not found, matching Stream.deregister()'s own
 * no-op-if-absent convention elsewhere in this codebase — a caller
 * disabling an already-gone command is not an error.
 */
function unregisterPluginCommand(id) {
  const i = TOOLBAR_COMMANDS.findIndex(c => c.id === id);
  if (i === -1) return false;
  TOOLBAR_COMMANDS.splice(i, 1);
  return true;
}

module.exports = { TOOLBAR_COMMANDS, defaultPinnedIds, registerPluginCommand, unregisterPluginCommand };
