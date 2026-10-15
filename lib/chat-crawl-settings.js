'use strict';
/**
 * lib/chat-crawl-settings.js — every setting of the personal-chat capture, in one table (PI5, 0.60.55)
 * comp_id: nexus.lib.chat-crawl-settings
 * Map: docs/2026-10-15-personal-chat-import-phasemap.spec
 *
 * James, 2026-10-15: "make sure you add extensive settings for all of this, expand the settings the best you can."
 *
 * One table drives three things, so they cannot drift: the defaults the plan runs on, the clamp that refuses a nonsense value, and the Settings
 * screen (clear-glass/renderer/settings/sections/chats.js builds its rows from SCHEMA). A setting that is not here does not exist.
 * Everything that touches an account starts OFF: a person's chats are read only after he turns it on, per account (USER_AUTONOMY).
 */
const GROUPS = ['Capture', 'Backfill', 'Catch-up', 'Pace and limits', 'Stop rules', 'Reading a chat', 'What is kept', 'Links and keywords', 'Privacy'];

// type: bool | int | enum | list ; per: 'global' | 'account' (an account may override a global value)
const SCHEMA = [
  // Capture
  { key: 'enabled',        group: 'Capture', type: 'bool', def: false, per: 'account', label: 'Capture this account’s chats', help: 'Off until you turn it on, per account. Nothing is read from an account that is off.' },
  { key: 'skipNexusChats', group: 'Capture', type: 'bool', def: true,  per: 'global',  label: 'Skip chats Nexus started', help: 'Agent tabs and contract jobs are Nexus’s own and are already logged. Only your own chats are crawled.' },
  { key: 'startWithClearGlass', group: 'Capture', type: 'bool', def: false, per: 'global', label: 'Start crawling when Clear Glass starts', help: 'Otherwise it runs only after you press Start.' },
  { key: 'showIndicator',  group: 'Capture', type: 'bool', def: true,  per: 'global',  label: 'Show an indicator while it reads', help: 'A small badge on the crawling tab and in the toolbar, so you always know when a chat is being read.' },
  // Backfill
  { key: 'backfill',       group: 'Backfill', type: 'bool', def: true, per: 'account', label: 'Read every existing chat first', help: 'Visits each chat the account holds, once, until none is missing. Done only when the list is fully loaded and every chat is logged or listed as failed.' },
  { key: 'backfillOrder',  group: 'Backfill', type: 'enum', def: 'newest', options: ['newest', 'oldest'], per: 'account', label: 'Backfill order', help: 'Newest first puts recent work in sooner; oldest first builds links in time order.' },
  { key: 'maxBackfillChats', group: 'Backfill', type: 'int', def: 0, min: 0, max: 100000, per: 'account', label: 'Stop backfill after this many chats (0 = all)', help: 'A limit for a first trial, such as 10.' },
  // Catch-up
  { key: 'catchUp',        group: 'Catch-up', type: 'bool', def: true, per: 'account', label: 'Keep up with new chats', help: 'After backfill, look at the chat list on a timer and read only chats that are new or have changed.' },
  { key: 'catchUpEveryMin', group: 'Catch-up', type: 'int', def: 15, min: 2, max: 1440, per: 'account', label: 'Look at the list every (minutes)', help: 'Reads the list only. A chat is visited only if it is new or changed.' },
  { key: 'anchorRun',      group: 'Catch-up', type: 'int', def: 3, min: 1, max: 20, per: 'global', label: 'Stop the walk after this many unchanged chats in a row', help: 'The list is newest-first. The first run of unchanged, already-logged chats is the stopping edge. More than 1 tolerates pinned chats.' },
  { key: 'verifyAnchor',   group: 'Catch-up', type: 'bool', def: true, per: 'global', label: 'Re-check the stopping chat once', help: 'Visits the last logged chat once to confirm nothing sits between it and the new ones. If it changed, the walk continues past it.' },
  { key: 'fullSweepDays',  group: 'Catch-up', type: 'int', def: 7, min: 0, max: 365, per: 'global', label: 'Full list comparison every (days, 0 = never)', help: 'Compares the whole list with what is logged, to catch a chat that changed without moving to the top.' },
  // Pace and limits
  { key: 'paceMinSec',     group: 'Pace and limits', type: 'int', def: 20, min: 5, max: 3600, per: 'global', label: 'Shortest wait between chats (seconds)', help: 'One chat at a time. A random wait between the shortest and longest, so it does not run like a clock.' },
  { key: 'paceMaxSec',     group: 'Pace and limits', type: 'int', def: 60, min: 5, max: 7200, per: 'global', label: 'Longest wait between chats (seconds)', help: '' },
  { key: 'perHour',        group: 'Pace and limits', type: 'int', def: 40, min: 1, max: 600, per: 'account', label: 'Most chats per hour', help: 'A hard cap. Reaching it waits for the hour to roll over.' },
  { key: 'perDay',         group: 'Pace and limits', type: 'int', def: 300, min: 1, max: 5000, per: 'account', label: 'Most chats per day', help: '' },
  { key: 'quietFrom',      group: 'Pace and limits', type: 'int', def: -1, min: -1, max: 23, per: 'global', label: 'Do not crawl from hour (0–23, -1 = no quiet hours)', help: 'Local time.' },
  { key: 'quietTo',        group: 'Pace and limits', type: 'int', def: -1, min: -1, max: 23, per: 'global', label: '…until hour', help: '' },
  // Stop rules
  { key: 'maxFailures',    group: 'Stop rules', type: 'int', def: 3, min: 1, max: 20, per: 'global', label: 'Stop after this many failures in a row', help: 'It stops, says why, and waits for you. It never retries in a loop.' },
  { key: 'maxAttempts',    group: 'Stop rules', type: 'int', def: 3, min: 1, max: 10, per: 'global', label: 'Tries per chat before it is listed as failed', help: 'A failed chat stays on the list with its reason; it is never dropped.' },
  { key: 'coolDownMin',    group: 'Stop rules', type: 'int', def: 30, min: 1, max: 1440, per: 'global', label: 'Cool-down after a rate-limit message (minutes)', help: 'Doubles each time it happens again.' },
  { key: 'stopOnChallenge', group: 'Stop rules', type: 'bool', def: true, per: 'global', label: 'Stop on a captcha or challenge page', help: 'Always recommended. The crawler never tries to solve one.' },
  // Reading a chat
  { key: 'settleSeconds',  group: 'Reading a chat', type: 'int', def: 5, min: 1, max: 60, per: 'global', label: 'Chat is settled after no change for (seconds)', help: 'The page’s own DOM observer reports changes; when none arrive for this long the chat counts as read.' },
  { key: 'scrollToLoad',   group: 'Reading a chat', type: 'bool', def: true, per: 'global', label: 'Scroll to load long chats', help: 'Long chats load as you scroll. It scrolls until no new turns appear.' },
  { key: 'scrollVia',      group: 'Reading a chat', type: 'enum', def: 'erosmancer', options: ['erosmancer', 'keys', 'page'], per: 'global', label: 'Scroll with', help: 'ErosmancerOS (a real mouse wheel), the arrow keys (real keystrokes), or scrollBy in the page. ErosmancerOS must be running; if it is not, the read fails and says so, it does not switch by itself.' },
  { key: 'scrollDirection', group: 'Reading a chat', type: 'enum', def: 'up', options: ['up', 'down'], per: 'global', label: 'Scroll direction to load a chat', help: 'Older messages usually load as you scroll up. Unverified for each provider: test one chat with the \u201CRead one chat slowly\u201D workflow (Settings \u2192 Automation).' },
  { key: 'scrollStepPx',   group: 'Reading a chat', type: 'int', def: 120, min: 20, max: 2000, per: 'global', label: 'Each scroll step (pixels)', help: 'Small on purpose, so the page can load what it loads lazily.' },
  { key: 'scrollPauseMs',  group: 'Reading a chat', type: 'int', def: 700, min: 100, max: 30000, per: 'global', label: 'Wait after each scroll step (milliseconds)', help: '' },
  { key: 'scrollStableRounds', group: 'Reading a chat', type: 'int', def: 4, min: 1, max: 50, per: 'global', label: 'Finished after this many steps with nothing new', help: 'Nothing new = no new messages, no movement, no change in page height.' },
  { key: 'maxScrollRounds', group: 'Reading a chat', type: 'int', def: 60, min: 1, max: 500, per: 'global', label: 'Most scroll rounds per chat', help: '' },
  { key: 'listScrollRounds', group: 'Reading a chat', type: 'int', def: 80, min: 1, max: 1000, per: 'global', label: 'Most scroll rounds to load the chat list', help: 'Backfill is complete only when the list reaches its end.' },
  { key: 'expandThinking', group: 'Reading a chat', type: 'bool', def: true, per: 'global', label: 'Open thinking blocks', help: 'Reads the thinking text where the page shows it.' },
  // What is kept
  { key: 'keepThinking',   group: 'What is kept', type: 'bool', def: true, per: 'global', label: 'Keep thinking text', help: '' },
  { key: 'keepCode',       group: 'What is kept', type: 'bool', def: true, per: 'global', label: 'Keep code blocks', help: '' },
  { key: 'keepAttachmentsNames', group: 'What is kept', type: 'bool', def: true, per: 'global', label: 'Keep the names of attached files', help: 'Names only; attachments themselves are not downloaded.' },
  { key: 'keepDays',       group: 'What is kept', type: 'int', def: 0, min: 0, max: 36500, per: 'global', label: 'Delete logged chats after (days, 0 = keep)', help: 'Nothing is deleted unless you set this.' },
  // Links and keywords
  { key: 'keywords',       group: 'Links and keywords', type: 'bool', def: true, per: 'global', label: 'Extract keywords for each chat', help: 'Counted by plain code, no model.' },
  { key: 'keywordCount',   group: 'Links and keywords', type: 'int', def: 12, min: 3, max: 50, per: 'global', label: 'Keywords per chat', help: '' },
  { key: 'links',          group: 'Links and keywords', type: 'bool', def: true, per: 'global', label: 'Link related chats', help: 'Each link says why it exists: shared keywords, a quoted URL or file, closeness in time, an explicit continuation.' },
  { key: 'minLinkScore',   group: 'Links and keywords', type: 'int', def: 3, min: 1, max: 20, per: 'global', label: 'Shared keywords needed for a link', help: '' },
  { key: 'novelOnly',      group: 'Links and keywords', type: 'bool', def: true, per: 'global', label: 'Pass only what is new to Nexus on to the intelligence pass', help: 'Ideas, methods and tools Nexus already holds are not filed again.' },
  // Privacy
  { key: 'excludeUrls',    group: 'Privacy', type: 'list', def: [], per: 'account', label: 'Never read chats whose URL contains', help: 'One piece of text per line.' },
  { key: 'excludeTitles',  group: 'Privacy', type: 'list', def: [], per: 'account', label: 'Never read chats whose title contains', help: 'One word or phrase per line, such as “private”.' },
  { key: 'localModelOnly', group: 'Privacy', type: 'bool', def: true, per: 'global', label: 'Read chats with a local model only', help: 'Never sends a captured chat to another provider for analysis.' },
];
const BY_KEY = Object.fromEntries(SCHEMA.map(s => [s.key, s]));

function defaults() { return Object.fromEntries(SCHEMA.map(s => [s.key, Array.isArray(s.def) ? [] : s.def])); }

/** clean(raw) → settings with every key present, every value of its type, every number within its range. `notes` says what was changed. */
function clean(raw = {}) {
  const out = defaults(); const notes = [];
  for (const s of SCHEMA) {
    if (!(s.key in raw)) continue; let v = raw[s.key];
    if (s.type === 'bool') { out[s.key] = v === true || v === 'true' || v === 1; }
    else if (s.type === 'int') { let n = Math.round(Number(v)); if (!Number.isFinite(n)) { notes.push(`${s.key}: not a number, default kept`); continue; } const c = Math.min(s.max, Math.max(s.min, n)); if (c !== n) notes.push(`${s.key}: ${n} is outside ${s.min}–${s.max}, set to ${c}`); out[s.key] = c; }
    else if (s.type === 'enum') { if (s.options.includes(v)) out[s.key] = v; else notes.push(`${s.key}: ${v} is not one of ${s.options.join(', ')}, default kept`); }
    else if (s.type === 'list') { out[s.key] = (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => String(x).trim()).filter(Boolean).slice(0, 200); }
  }
  if (out.paceMaxSec < out.paceMinSec) { notes.push('paceMaxSec was below paceMinSec, raised to match'); out.paceMaxSec = out.paceMinSec; }
  if ((out.quietFrom === -1) !== (out.quietTo === -1)) { notes.push('quiet hours need both ends; cleared'); out.quietFrom = -1; out.quietTo = -1; }
  return { settings: out, notes };
}

/** effective(globalSettings, accountOverrides) → what one account runs on: only keys marked per:'account' may be overridden */
function effective(globalSettings = {}, overrides = {}) {
  const base = clean(globalSettings).settings; const o = {};
  for (const [k, v] of Object.entries(overrides || {})) if (BY_KEY[k] && BY_KEY[k].per === 'account') o[k] = v;
  return clean({ ...base, ...o }).settings;
}

module.exports = { GROUPS, SCHEMA, BY_KEY, defaults, clean, effective };
