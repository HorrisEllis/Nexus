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
 *   nexusIntent(msg)         "nexus> census", "/nexus census" → { line } — a Nexus command, run without a model (0.59.9)
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
  // §FQ2 0.60.264 — a block the model left unclosed at the end of its reply ("```driver {\"action\":\"readPage\"}") is still a command, not text for him
  const re = /```(driver|tool)\s*\n?([\s\S]*?)(?:```|$)/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const body = m[2].trim();
    if (!body) continue;
    out.push(parseBlock(body));
  }
  return out;
}

// §0.59.9 — "ok go to google.com", "just go to x", "go to: x", "go to localhost:9000" reached the model: an opener word or
// two and a colon are allowed, and localhost / an IP with a port is a site too
const INTENT_RE = /^\s*(?:(?:hey|ok(?:ay)?|now|so|just|copilot|co-pilot)[\s,]+)*(?:please\s+|can you\s+|could you\s+)?(?:just\s+)?(?:visit|go\s+to|goto|open(?:\s+up)?|navigate\s+to|browse\s+to|take\s+me\s+to|load)\s*:?\s+(?:the\s+(?:site|page|website)\s+)?<?((?:https?:\/\/)?(?:localhost(?::\d+)?|[\w-]+(?:\.[\w-]+)+(?::\d+)?)(?:\/[^\s>]*)?)>?[\s,.!?;:]*(.*)$/i;
function browseIntent(message) {
  const m = INTENT_RE.exec(String(message || ''));
  if (!m) return null;
  const u = m[1].replace(/[.,!?]+$/, '');
  const local = /^(?:localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(?:[:/]|$)/i.test(u);   // a local system is plain http
  return { url: local ? `http://${u}` : normalize({ action: 'navigate', url: u }).url, rest: (m[2] || '').trim() };
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

// §0.59.9 — James: "hooked into copilot so you can talk to nexus". A line typed in the pane as `nexus> census`, `nexus: …`
// or `/nexus …` is a Nexus command: it runs through the one command tool and the answer is said, no model in between.
const NEXUS_RE = /^\s*(?:nexus>|nexus:|\/nexus\b)[ \t\u00a0]*([\s\S]*?)\s*$/i;
function nexusIntent(message) {
  const m = NEXUS_RE.exec(String(message || ''));
  return m ? { line: m[1].split('\n')[0].trim() } : null;
}

// §AD3 0.60.251 — James, 2026-10-18: "need help with the autofill for fiverr." (the co-pilot answered "fill this in for me"
// with chat) · 2026-10-25: "need clearglass' fiverr, job application automation, autofill and macros working fully, including
// with the agents and copilot." His rule, 2026-10-13: "Deterministic first." These words need no model: "fill this in (for
// me)", "autofill", "fill out the application" run the fill; "pick github" opens the picker for one field type; "record a
// macro (called x)" / "stop recording" drive the recorder. Anything more ("fill it with my other email") goes to the model.
const OPENER = String.raw`^\s*(?:(?:hey|ok(?:ay)?|now|so|just|copilot|co-pilot)[\s,]+)*(?:please\s+|can you\s+|could you\s+)?`;
// §FQ2 0.60.264 — James: "fill in this page" reached the model (it printed a driver block instead of filling): "this page", "this form", "my gig" count too
const WHAT = String.raw`(?:(?:this|that|my)\s+(?:form|application|page|gig|listing)|this|it|that|the\s+(?:form|application|page|gig|listing))`;
const FILL_RE = new RegExp(`${OPENER}(?:auto-?fill(?:\\s+${WHAT})?|fill(?:\\s+${WHAT})?(?:\\s+(?:in|out))(?:\\s+${WHAT})?|fill\\s+${WHAT})(?:\\s+for\\s+me)?[\\s,.!?]*(?:please)?[\\s.!?]*$`, 'i');
function fillIntent(message) { return FILL_RE.test(String(message || '')) ? { kind: 'fill' } : null; }
const PICK_RE = new RegExp(`${OPENER}pick\\s+(?:the\\s+)?([a-z][a-z_]*)(?:\\s+(?:field|box|input))?[\\s.!?]*$`, 'i');
function pickIntent(message) { const m = PICK_RE.exec(String(message || '')); return m ? { kind: 'pick', fieldType: m[1].toLowerCase() } : null; }
const REC_START_RE = new RegExp(`${OPENER}(?:start\\s+)?record(?:ing)?\\s+(?:a\\s+|this\\s+as\\s+a\\s+)?macro(?:\\s+(?:called|named)\\s+["']?(.+?)["']?)?[\\s.!?]*$`, 'i');
const REC_STOP_RE = new RegExp(`${OPENER}(?:stop|end|finish)\\s+(?:the\\s+)?record(?:ing)?(?:\\s+(?:the\\s+)?macro)?[\\s.!?]*$`, 'i');
function recordIntent(message) {
  const t = String(message || '');
  const m = REC_START_RE.exec(t); if (m) return { kind: 'record.start', name: m[1] ? m[1].trim() : null };
  return REC_STOP_RE.test(t) ? { kind: 'record.stop' } : null;
}
// §UP4 0.60.252 — "is there an update?", "check for updates", "update nexus": the check runs (never the apply — that is his yes, UP_D2)
const UPDATE_RE = new RegExp(`${OPENER}(?:(?:check\\s+for|any|are\\s+there(?:\\s+any)?|is\\s+there\\s+an?)\\s+)?(?:new\\s+)?updates?(?:\\s+(?:for\\s+)?nexus)?[\\s?.!]*$|${OPENER}update\\s+nexus[\\s?.!]*$`, 'i');
function updateIntent(message) { return UPDATE_RE.test(String(message || '')) ? { kind: 'update' } : null; }
// a Fiverr gig editor (create or edit): fiverr.com/users/<you>/manage_gigs/…
function isGigEditor(url) { try { const u = new URL(url); return /(^|\.)fiverr\.com$/i.test(u.hostname) && /\/manage_gigs\b/i.test(u.pathname); } catch (_) { return false; } }

// what one of those runs says back, from its result (§1.2: a failure is said with its reason, never as done)
function describeJob(job, r = {}) {
  const names = (a, k) => (a || []).map(x => (typeof x === 'string' ? x : x[k] || x.fieldType || x.key)).filter(Boolean);
  if (!r || r.error && !r.needsGig && !r.cancelled) return `Did not ${job.kind === 'fill' ? 'fill' : job.kind}: ${(r && r.error) || 'no reply from Clear Glass'}`;
  if (job.kind === 'fill' && job.gig) {
    if (r.needsGig) return r.error;
    const left = r.leftToCopy || [];
    return `Filled the gig "${r.title || ''}": ${names(r.filled, 'key').join(', ') || 'nothing matched'}${r.drafted ? ' (written from your Fiverr profile just now)' : ''}.` +
      `${left.length ? ` Left to copy by hand: ${left.join(', ')}.` : ''}${(r.failed || []).length ? ` Failed: ${names(r.failed, 'key').join(', ')}.` : ''} Nothing was saved or published.`;
  }
  if (job.kind === 'fill') {
    const un = (r.needsPick && r.needsPick.unplaced) || [];
    return `Filled ${(r.filled || []).length} of ${r.totalFields || 0} fields: ${names(r.filled, 'fieldType').join(', ') || 'none'}.` +
      `${(r.skipped || []).length ? ` Skipped (low confidence): ${names(r.skipped, 'fieldType').join(', ')}.` : ''}${(r.failed || []).length ? ` Failed: ${names(r.failed, 'fieldType').join(', ')}.` : ''}` +
      `${un.length ? ` No field took: ${un.join(', ')} — say "pick ${un[0]}" and click its box; it is kept for this site.` : ''} Nothing was submitted.`;
  }
  if (job.kind === 'pick') {
    if (r.cancelled || r.ok === false) return `Not saved: ${r.error || 'cancelled'}`;
    const f = r.fill || {};
    return `${r.origin}: "${r.fieldKey}" is ${r.fieldType} from now on${r.macro ? `; macro "${r.macro.name || r.macro}" updated` : ''}.${f.filled ? ` Filled again: ${f.filled.length}.` : ''}`;
  }
  if (job.kind === 'update') {
    if (r.ok === false) return `Could not check for an update: ${r.error}`;
    if (r.upToDate) return `Nexus ${r.current} is up to date with GitHub.`;
    const rel = (r.releases || []).slice(0, 6).map(x => `${x.version}${x.quote ? ` — "${String(x.quote).slice(0, 120)}"` : ''}`).join('\n');
    return `Nexus ${r.current} → ${r.latest} on GitHub (${r.behind} commit(s)).\n${rel}${(r.plan && r.plan.blocks || []).length ? `\nIt would refuse: your edits to ${r.plan.blocks.map(b => b.file).slice(0, 4).join(', ')}.` : ''}${r.can ? `\n${r.can}` : '\nSay "yes, update" and I will apply it, or open the Updates page.'}`;
  }
  if (job.kind === 'record.start') return r.ok === false ? `Not recording: ${r.error}` : `Recording "${r.name || 'macro'}" — do the steps, then say "stop recording".`;
  if (job.kind === 'record.stop') return r.ok === false ? `Not stopped: ${r.error}` : `Recorded ${(r.steps || []).length} steps${(r.params || []).length ? ` (params: ${r.params.join(', ')})` : ''}${r.file ? ` → ${r.file}` : ''}. Say "save it as a macro called …" or open it in Settings › Macros.`;
  return JSON.stringify(r).slice(0, 400);
}

function label(raw) {
  const c = parseBlock(raw);
  if (c && c.__unreadable) return '[driver: unreadable — reported]';
  if (!c) return '[driver]';
  const what = c.action || c.name || '?';
  const arg = c.url || c.selector || (c.n != null ? `#${c.n}` : '') || c.text || '';
  return `[driver: ${what}${arg ? ` ${String(arg).slice(0, 60)}` : ''}]`;
}

module.exports = { parseBlock, normalize, parseCommands, browseIntent, archiveImportIntent, screenIntent, nexusIntent, fillIntent, pickIntent, recordIntent, updateIntent, isGigEditor, describeJob, label, ALIASES };
