'use strict';
/**
 * clear-glass/src/copilot/verbs.js — how the co-pilot's words become browser actions. §0.39.280 BS17.
 * UUID: cg-copilot-verbs-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-build-surface-phasemap.spec (BS17).
 *
 * James: "i told it to visit google.com and it ran the blue command but nothing happened. its meant to be the ais
 * browser". Read, not assumed: bridge._parseCommands dropped any ```driver block that was not strict JSON
 * (catch (_) {}) — and a small local model rarely writes strict JSON — while the pane still said "[driver command
 * sent]". Nothing ran and nothing said so.
 *
 *   parseBlock(raw)          strict JSON, else repaired (bare keys quoted, single quotes, trailing commas, a lone
 *                            url) — else { __unreadable: raw, error } so the caller REPORTS it (§1.2)
 *   normalize(cmd)           a navigate without a scheme gets https://; "go"/"open"/"visit" → navigate
 *   parseCommands(text)      every ```driver / ```tool block, in order, through the two above
 *   browseIntent(message)    "visit google.com", "go to https://x", "open indeed.com and …" → { url, rest } | null —
 *                            the one verb that needs no model at all
 *   archiveImportIntent(msg) "import my archives", "/import-archives" → idearium's archive drop box (0.39.283 N30)
 *   label(raw)               what the pane shows for a block: "[driver: navigate https://google.com]"
 * Pure; bridge.js runs what these return.
 */

const ALIASES = { go: 'navigate', goto: 'navigate', open: 'navigate', visit: 'navigate', browse: 'navigate', url: 'navigate', load: 'navigate' };

function _repair(raw) {
  let t = String(raw || '').trim();
  if (/^[a-z][\w+.-]*:\/\/\S+$|^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t)) return { action: 'navigate', url: t };   // just a url
  t = t.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');              // prose around the object
  t = t.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, s) => JSON.stringify(s));   // 'x' → "x"
  t = t.replace(/([{,]\s*)([A-Za-z_$][\w$.-]*)\s*:/g, '$1"$2":');    // bare keys
  t = t.replace(/,\s*([}\]])/g, '$1');                                 // trailing commas
  return JSON.parse(t);
}

function parseBlock(raw) {
  const s = String(raw || '').trim();
  try { return normalize(JSON.parse(s)); } catch (_) {}
  try { return normalize(_repair(s)); } catch (e) { return { __unreadable: s.slice(0, 400), error: `not a command the browser can read (${e.message})` }; }
}

function normalize(cmd) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return cmd;
  const out = { ...cmd };
  if (out.action && ALIASES[String(out.action).toLowerCase()]) out.action = ALIASES[String(out.action).toLowerCase()];
  if (out.action === 'navigate') {
    const u = out.url || out.href || out.target || out.to;
    if (u) out.url = /^[a-z][\w+.-]*:/i.test(u) ? String(u) : `https://${String(u).replace(/^\/+/, '')}`;
  }
  return out;
}

function parseCommands(text) {
  const out = [];
  const re = /```(driver|tool)\s*\n?([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const body = m[2].trim();
    if (!body) continue;
    out.push(parseBlock(body));
  }
  return out;
}

const INTENT_RE = /^\s*(?:please\s+|can you\s+|could you\s+)?(?:visit|go\s+to|goto|open(?:\s+up)?|navigate\s+to|browse\s+to|take\s+me\s+to|load)\s+(?:the\s+(?:site|page|website)\s+)?<?((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+(?::\d+)?(?:\/[^\s>]*)?)>?[\s,.!?;:]*(.*)$/i;
function browseIntent(message) {
  const m = INTENT_RE.exec(String(message || ''));
  if (!m) return null;
  return { url: normalize({ action: 'navigate', url: m[1].replace(/[.,!?]+$/, '') }).url, rest: (m[2] || '').trim() };
}

// §0.59.6 — James's panel: "visit google.com what do you see" and "safeway.com its on the screen" got "Could you please
// provide more details". Reading the tab needs no model: the browser says what is there (title, url, numbered targets).
const SCREEN_RE = /^\s*(?:<?(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+\S*>?[\s,.-]+)?(?:what(?:'?s| is) (?:on|in) (?:(?:the|my|this) )?(?:screen|page|tab)|what (?:do|can) you see(?: (?:on|in) (?:(?:the|my|this) )?(?:screen|page|tab))?|(?:read|look at|describe|check)(?: (?:the|my|this))? (?:screen|page|tab)|(?:it'?s|its|it is) (?:on|up on) (?:the|my) screen|(?:on|see) (?:the|my) screen)[\s.!?]*$/i;
function screenIntent(message) { return SCREEN_RE.test(String(message || '').trim()); }

// §0.39.283 N30 — James: "give copilot a command … i want to import my archives of nexus. have it pull up a drop box ui
// and run the command". "/import-archives", "import my archives", "load the nexus zips" → idearium's drop box page.
const ARCHIVE_RE = /^\s*\/(?:import-archives|archives?)\b|\b(?:import|bring\s+in|load|restore)\b[^.\n]{0,40}\b(?:archives?|zips?|nexus\s+history)\b/i;
function archiveImportIntent(message, env = process.env) {
  if (!ARCHIVE_RE.test(String(message || ''))) return null;
  const port = parseInt(env.IDEARIUM_PORT || '4800', 10);
  return { kind: 'archive-import', url: `http://127.0.0.1:${port}/archive-import.html`, rest: '' };
}

function label(raw) {
  const c = parseBlock(raw);
  if (c && c.__unreadable) return '[driver: unreadable — reported]';
  if (!c) return '[driver]';
  const what = c.action || c.name || '?';
  const arg = c.url || c.selector || (c.n != null ? `#${c.n}` : '') || c.text || '';
  return `[driver: ${what}${arg ? ` ${String(arg).slice(0, 60)}` : ''}]`;
}

module.exports = { parseBlock, normalize, parseCommands, browseIntent, archiveImportIntent, screenIntent, label, ALIASES };
