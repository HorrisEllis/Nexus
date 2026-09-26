'use strict';
/**
 * src/shortcuts/registry.js — keyboard shortcuts: the actions, their default
 * keys, and turning a key press into a binding.
 *
 * §0.39.265 — James: "add keyboard shortcuts including macro support."
 *
 * Shortcuts are caught in the MAIN process (before-input-event on every
 * window and every page inside it — src/main/index.js), because a key pressed
 * while a page has focus goes to that page's <webview>, never to the chrome's
 * own keydown listeners. So they work everywhere, not only when the toolbar
 * has focus.
 *
 * A binding maps an accelerator ("Ctrl+Shift+K") to an action id:
 *   - a browser action from ACTIONS below (run by that window's renderer), or
 *   - "macro:<name>"   — run a saved macro in the window you pressed it in,
 *   - "workflow:<id>"  — run an Automation workflow now.
 * The user's changes are stored as overrides on top of DEFAULT_BINDINGS
 * (options.shortcuts: { accel: action | null }; null = default removed).
 * Pure: no Electron here, so it runs under node for tests and the CLI.
 */

const ACTIONS = [
  // Tabs
  { id: 'tab.new',          group: 'Tabs',       label: 'New tab',                 keys: 'Ctrl+T' },
  { id: 'tab.close',        group: 'Tabs',       label: 'Close tab',               keys: 'Ctrl+W' },
  { id: 'tab.reopen',       group: 'Tabs',       label: 'Reopen closed tab',       keys: 'Ctrl+Shift+T' },
  { id: 'tab.next',         group: 'Tabs',       label: 'Next tab',                keys: 'Ctrl+Tab' },
  { id: 'tab.prev',         group: 'Tabs',       label: 'Previous tab',            keys: 'Ctrl+Shift+Tab' },
  { id: 'tab.last',         group: 'Tabs',       label: 'Last tab',                keys: 'Ctrl+9' },
  // Page
  { id: 'page.reload',      group: 'Page',       label: 'Reload',                  keys: 'Ctrl+R' },
  { id: 'page.back',        group: 'Page',       label: 'Back',                    keys: 'Alt+Left' },
  { id: 'page.forward',     group: 'Page',       label: 'Forward',                 keys: 'Alt+Right' },
  { id: 'page.find',        group: 'Page',       label: 'Find in page',            keys: 'Ctrl+F' },
  { id: 'page.print',       group: 'Page',       label: 'Print',                   keys: 'Ctrl+P' },
  { id: 'page.zoomIn',      group: 'Page',       label: 'Zoom in',                 keys: 'Ctrl+=' },
  { id: 'page.zoomOut',     group: 'Page',       label: 'Zoom out',                keys: 'Ctrl+-' },
  { id: 'page.zoomReset',   group: 'Page',       label: 'Reset zoom',              keys: 'Ctrl+0' },
  { id: 'page.address',     group: 'Page',       label: 'Go to the address bar',   keys: 'Ctrl+L' },
  { id: 'page.fullscreen',  group: 'Page',       label: 'Full screen',             keys: 'F11' },
  // Clear Glass
  { id: 'cg.bookmark',      group: 'Clear Glass', label: 'Bookmark this page',     keys: 'Ctrl+D' },
  { id: 'cg.history',       group: 'Clear Glass', label: 'History',                keys: 'Ctrl+H' },
  { id: 'cg.library',       group: 'Clear Glass', label: 'Library',                keys: 'Ctrl+J' },
  { id: 'cg.settings',      group: 'Clear Glass', label: 'Settings',               keys: 'Ctrl+,' },
  // Alt+Shift, not Ctrl+Shift: pages use Ctrl+Shift+Z (redo), Ctrl+Shift+F, … themselves
  { id: 'cg.copilot',       group: 'Clear Glass', label: 'Show or hide co-pilot',  keys: 'Alt+Shift+C' },
  { id: 'cg.rewind',        group: 'Clear Glass', label: 'Rewind this page',       keys: 'Alt+Shift+Z' },
  { id: 'cg.picker',        group: 'Clear Glass', label: 'Element picker',         keys: 'Alt+Shift+E' },
  { id: 'cg.autofill',      group: 'Clear Glass', label: 'Autofill this page',     keys: 'Alt+Shift+A' },
  { id: 'cg.macroRecord',   group: 'Clear Glass', label: 'Start or stop recording a macro', keys: 'Alt+Shift+R' },
];
const ACTION_IDS = new Set(ACTIONS.map(a => a.id));
const DEFAULT_BINDINGS = Object.fromEntries(ACTIONS.filter(a => a.keys).map(a => [a.keys, a.id]));

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const KEY_NAMES = { ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc', '+': '=' };

/**
 * accelFromInput({ key, control, alt, shift, meta }) — Electron's
 * before-input-event `input` (or a DOM KeyboardEvent mapped to the same
 * names) → "Ctrl+Shift+K". Returns null for a bare modifier press.
 */
function accelFromInput(input = {}) {
  let key = input.key;
  if (!key || ['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) return null;
  key = KEY_NAMES[key] || key;
  if (key.length === 1) key = key.toUpperCase();
  // Shift changes the printed character ("!" for 1); bind to the key itself when we can
  if (input.shift && input.code && /^Digit\d$/.test(input.code)) key = input.code.slice(5);
  if (input.shift && input.code && /^Key[A-Z]$/.test(input.code)) key = input.code.slice(3);
  const mods = [];
  if (input.control || input.ctrlKey) mods.push('Ctrl');
  if (input.alt || input.altKey) mods.push('Alt');
  if (input.shift || input.shiftKey) mods.push('Shift');
  if (input.meta || input.metaKey) mods.push('Meta');
  return [...mods, key].join('+');
}

/** normalize("shift+ctrl+k") → "Ctrl+Shift+K"; null if it is not a key combination. */
function normalize(accel) {
  if (!accel || typeof accel !== 'string') return null;
  const parts = accel.split('+').map(p => p.trim()).filter(Boolean);
  if (accel.trim().endsWith('++')) parts.push('=');
  if (!parts.length) return null;
  const mods = new Set(); let key = null;
  for (const p of parts) {
    const low = p.toLowerCase();
    if (['ctrl', 'control', 'cmdorctrl', 'commandorcontrol'].includes(low)) mods.add('Ctrl');
    else if (['alt', 'option'].includes(low)) mods.add('Alt');
    else if (low === 'shift') mods.add('Shift');
    else if (['meta', 'cmd', 'command', 'super', 'win'].includes(low)) mods.add('Meta');
    else key = KEY_NAMES[p] || (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1));
  }
  if (!key) return null;
  return [...MOD_ORDER.filter(m => mods.has(m)), key].join('+');
}

/**
 * isSafe(accel) — a shortcut must not steal ordinary typing: it needs Ctrl,
 * Alt or Meta, or be a function key (F1–F24). Shift+letter alone is typing.
 */
function isSafe(accel) {
  const a = normalize(accel);
  if (!a) return false;
  const parts = a.split('+'), key = parts[parts.length - 1];
  if (/^F([1-9]|1\d|2[0-4])$/.test(key)) return true;
  return parts.some(p => p === 'Ctrl' || p === 'Alt' || p === 'Meta');
}

/** isValidAction("macro:apply") — a known browser action, a named macro or a workflow id. */
function isValidAction(action) {
  if (typeof action !== 'string' || !action) return false;
  if (ACTION_IDS.has(action)) return true;
  return /^macro:.{1,120}$/.test(action) || /^workflow:[\w-]{1,80}$/.test(action);
}

/** effective(overrides) — defaults with the user's changes on top ({accel: action}; null removes a default). */
function effective(overrides = {}) {
  const out = { ...DEFAULT_BINDINGS };
  for (const [k, v] of Object.entries(overrides || {})) {
    const a = normalize(k);
    if (!a) continue;
    if (v === null) delete out[a]; else if (isValidAction(v)) out[a] = v;
  }
  return out;
}

/**
 * bind(overrides, accel, action) — the new overrides after binding accel to
 * action. One key does one thing, and one action keeps one key (its old key
 * is freed), so a rebind never leaves two keys fighting.
 * Returns { overrides, replaced } or { error }.
 */
function bind(overrides = {}, accel, action) {
  const a = normalize(accel);
  if (!a) return { error: 'not a key combination' };
  if (!isSafe(a)) return { error: `${a} would steal ordinary typing \u2014 use Ctrl, Alt or a function key` };
  if (!isValidAction(action)) return { error: `unknown action "${action}"` };
  const cur = effective(overrides);
  const replaced = cur[a] && cur[a] !== action ? cur[a] : null;
  const next = { ...overrides };
  // free the action's other key(s): a default is overridden with null, an added one just goes
  for (const [k, v] of Object.entries(cur)) {
    if (v !== action || k === a) continue;
    if (DEFAULT_BINDINGS[k]) next[k] = null; else delete next[k];
  }
  if (DEFAULT_BINDINGS[a] === action) delete next[a]; else next[a] = action;
  return { overrides: next, replaced };
}

/** unbind(overrides, accel) — remove whatever accel does (a default is overridden with null). */
function unbind(overrides = {}, accel) {
  const a = normalize(accel);
  if (!a) return { error: 'not a key combination' };
  const next = { ...overrides };
  if (DEFAULT_BINDINGS[a]) next[a] = null; else delete next[a];
  return { overrides: next };
}

/** describe(action, { macros, workflows }) — a person-readable name for any action id. */
function describe(action, { workflows = [] } = {}) {
  const a = ACTIONS.find(x => x.id === action);
  if (a) return a.label;
  if (String(action).startsWith('macro:')) return `Run macro “${action.slice(6)}”`;
  if (String(action).startsWith('workflow:')) {
    const w = workflows.find(x => x.id === action.slice(9));
    return `Run workflow “${w ? w.name : action.slice(9)}”`;
  }
  return action;
}

module.exports = { ACTIONS, DEFAULT_BINDINGS, accelFromInput, normalize, isSafe, isValidAction, effective, bind, unbind, describe };
