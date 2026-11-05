'use strict';
/**
 * clear-glass/src/eros/options.js — every ErosmancerOS option in plain words: what it does, its value, its default, what changing it does
 * (ES1, 0.60.409). Map: docs/2026-11-05-cleardriver-mutators-and-erosmancer-surface-phasemap.spec ES1.
 * James, 2026-11-05: "can you expand erosmanceros. add as much human ledgible options as possible ... all cli first, then into the browser.html."
 * · "finish erosmancer" · "1, then 3? can".
 *
 * ErosmancerOS's code is not changed (he asked it be left alone, 2026-11-05: "can you at least leave them alone"). Its own door already takes
 * these: the connect-time ones as POST /api/connect { config } (src/api/server.ts), the pace as POST /api/behavior/profile, the routing as
 * POST /api/routing/level. Clear Glass keeps his choices in ErosmancerOS's data folder (data/erosmancer/options.json) and hands them over.
 *
 *   CATALOGUE                     → [{ key, section, words, does, kind, def, allowed?, min?, max?, when: 'connect' | 'live' }]
 *   defaultsFromSource(text)      → { 'bridge.reconnectDelayMs': 1000, … } read from erosmancer-os/src/types/index.ts DEFAULT_CONFIG
 *   leavesFromSource(text)        → every leaf of the OSConfig interface (so a test sees none is missing)
 *   createOptions({ file, record }) → { list(), get(key), set(key, value, { by }), reset(key), connectConfig() }
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const TYPES = path.join(ROOT, 'clear-glass', 'erosmancer', 'erosmancer-os', 'src', 'types', 'index.ts');
const STRATEGIES = ['uuid', 'cssSelector', 'xpath', 'textMatch', 'attributeFingerprint', 'relativePosition', 'boundingBox'];
const PACES = ['precise', 'cautious', 'exploratory', 'turbo'];
const ROUTES = ['direct', 'parallel', 'redundant'];

// what each strategy means, for the selector chain's words
const STRATEGY_WORDS = {
  uuid: 'its own id (the id ErosmancerOS gave the element)', cssSelector: 'a CSS selector', xpath: 'an XPath', textMatch: 'the text it shows',
  attributeFingerprint: 'its attributes (name, type, role, label)', relativePosition: 'where it sits next to what is around it', boundingBox: 'where it is on the screen',
};

const CATALOGUE = Object.freeze([
  // ── live: changed at once on the running ErosmancerOS ──
  { key: 'pace', section: 'How it moves', words: 'Pace', kind: 'enum', allowed: PACES, def: 'precise', when: 'live',
    does: 'How fast and how carefully its pointer and keys move: precise (steady, exact), cautious (slower, pauses more), exploratory (wanders a little, hovers first), turbo (fastest, fewest pauses). A pace set on an account (eros pace) wins on that account\'s pages.' },
  { key: 'routing', section: 'How it moves', words: 'Send each action', kind: 'enum', allowed: ROUTES, def: 'direct', when: 'live',
    does: 'direct: to the one page. parallel: to the page and a second copy at once. redundant: to both, and it compares the answers and says when they differ.' },
  // ── connect-time: kept, and used the next time Clear Glass connects it (reconnect to use now) ──
  { key: 'bridge.reconnectDelayMs', section: 'Connection to the browser', words: 'Wait before reconnecting', kind: 'ms', min: 100, max: 60000, when: 'connect',
    does: 'When the DevTools connection to Clear Glass drops, how long it waits before trying again.' },
  { key: 'bridge.maxReconnectAttempts', section: 'Connection to the browser', words: 'Reconnect tries', kind: 'int', min: 0, max: 100, when: 'connect',
    does: 'How many times it tries to reconnect before it gives up and says so.' },
  { key: 'bridge.commandTimeoutMs', section: 'Connection to the browser', words: 'Give up on one command after', kind: 'ms', min: 1000, max: 300000, when: 'connect',
    does: 'How long one command to the page (click, type, read) may take before it fails.' },
  { key: 'bridge.pingIntervalMs', section: 'Connection to the browser', words: 'Check the connection every', kind: 'ms', min: 1000, max: 60000, when: 'connect',
    does: 'How often it checks the connection is still alive.' },
  { key: 'registry.staleThresholdMs', section: 'What it remembers of the page', words: 'Forget an element after', kind: 'ms', min: 1000, max: 600000, when: 'connect',
    does: 'An element it has not seen for this long is treated as gone, and found again before it is used.' },
  { key: 'registry.maxNodes', section: 'What it remembers of the page', words: 'Remember at most', kind: 'int', min: 100, max: 1000000, when: 'connect',
    does: 'How many elements it keeps track of at once (more uses more memory).' },
  { key: 'selector.fallbackChain', section: 'Finding an element', words: 'Ways to find an element, in order', kind: 'list', allowed: STRATEGIES, when: 'connect',
    does: `When the first way fails it tries the next: ${STRATEGIES.map(s => `${s} = ${STRATEGY_WORDS[s]}`).join('; ')}.` },
  { key: 'selector.timeoutMs', section: 'Finding an element', words: 'Look for an element for at most', kind: 'ms', min: 100, max: 120000, when: 'connect',
    does: 'How long it keeps looking for an element before the step fails.' },
  { key: 'dispatcher.maxQueueSize', section: 'Its queue of actions', words: 'Queue at most', kind: 'int', min: 1, max: 100000, when: 'connect',
    does: 'How many actions can wait in line; past this a new one is refused.' },
  { key: 'dispatcher.defaultMaxRetries', section: 'Its queue of actions', words: 'Retry a failed action', kind: 'int', min: 0, max: 20, when: 'connect',
    does: 'How many times an action that failed is tried again.' },
  { key: 'dispatcher.retryDelayMs', section: 'Its queue of actions', words: 'Wait between retries', kind: 'ms', min: 0, max: 60000, when: 'connect',
    does: 'How long it waits before trying a failed action again.' },
  { key: 'telemetry.maxEvents', section: 'Its log', words: 'Keep at most', kind: 'int', min: 100, max: 1000000, when: 'connect',
    does: 'How many log events it holds in memory.' },
  { key: 'telemetry.flushIntervalMs', section: 'Its log', words: 'Write the log every', kind: 'ms', min: 200, max: 60000, when: 'connect',
    does: 'How often the log is written to its file.' },
  { key: 'telemetry.maxFileMB', section: 'Its log', words: 'Start a new log file past', kind: 'int', min: 1, max: 2000, when: 'connect',
    does: 'The log file is rotated when it grows past this many MB.' },
]);
// fixed in ErosmancerOS's code: server.ts builds these from DEFAULT_CONFIG and its connect does not take them. Listed, read from the source,
// never changed from here (changing them is an edit of his code — Edit ErosmancerOS, ES5)
const FIXED = Object.freeze({
  'behavior.defaultProfile': 'The pace a page starts with when nothing else sets one (the Pace option above sets it at once).',
  'behavior.sandboxByDefault': 'Whether a planned action is only simulated (not sent to the page) unless asked.',
  'behavior.maxSessionAgeMs': 'After this long a page\'s session starts fresh (its tiredness and error count reset).',
  'routing.defaultLevel': 'How actions are sent when it starts (the "Send each action" option above changes it at once).',
  'routing.mismatchThreshold': 'In redundant mode, how different (0–1) two answers must be before it says they differ.',
  'routing.shadowTabEnabled': 'Whether a hidden second copy of the page is used for parallel and redundant sending.',
  'observer.enabled': 'Whether it watches the page for changes.',
  'observer.debounceMs': 'How long it waits for a burst of page changes to settle before reacting.',
  'observer.watchSubtree': 'Whether it watches inside elements too, not only the top of the page.',
});
// set by Clear Glass itself, listed so nothing is hidden, never changed here
const MANAGED = Object.freeze({
  'bridge.target': 'Which browser it drives: Clear Glass\'s own DevTools port, set by Clear Glass.',
  'registry.persistPath': 'Where it keeps what it remembers: ErosmancerOS\'s data folder, set by Clear Glass.',
  'telemetry.persistPath': 'Where its log is written: ErosmancerOS\'s data folder, set by Clear Glass.',
});

function _source() { try { return fs.readFileSync(TYPES, 'utf8'); } catch (_) { return ''; } }

/** the leaves of every OSConfig interface (the types file declares it twice, the second extended): section.key */
function leavesFromSource(text = _source()) {
  const out = []; const re = /export interface OSConfig \{([\s\S]*?)\n\}/g; let m;
  while ((m = re.exec(text))) { let section = null;
  for (const line of m[1].split('\n')) {
    const open = /^\s{2}(\w+): \{/.exec(line); if (open) { section = open[1]; continue; }
    if (/^\s{2}\};?/.test(line)) { section = null; continue; }
    const leaf = /^\s{4}(\w+)\??:/.exec(line); if (leaf && section && !out.includes(`${section}.${leaf[1]}`)) out.push(`${section}.${leaf[1]}`);
  } }
  return out;
}

/** DEFAULT_CONFIG's numbers and the selector chain, read from the source (never copied by hand) */
function defaultsFromSource(text = _source()) {
  const m = /export const DEFAULT_CONFIG: OSConfig = \{([\s\S]*?)\n\};/.exec(text); if (!m) return {};
  const out = {}; let section = null;
  for (const line of m[1].split('\n')) {
    const open = /^\s{2}(\w+): \{/.exec(line); if (open) { section = open[1]; continue; }
    if (/^\s{2}\},?/.test(line)) { section = null; continue; }
    const num = /^\s{4}(\w+): ([\d_.]+(?:\s*\*\s*[\d_.]+)*),?/.exec(line); if (num && section) out[`${section}.${num[1]}`] = num[2].replace(/_/g, '').split('*').reduce((a, x) => a * Number(x), 1);
    const word = /^\s{4}(\w+): (true|false|"(\w+)")/.exec(line); if (word && section) out[`${section}.${word[1]}`] = word[3] !== undefined ? word[3] : word[2] === 'true';
  }
  const chain = /fallbackChain: \[([\s\S]*?)\]/.exec(m[1]); if (chain) out['selector.fallbackChain'] = (chain[1].match(/"(\w+)"/g) || []).map(s => s.replace(/"/g, ''));
  if (out['telemetry.maxFileMB'] === undefined) out['telemetry.maxFileMB'] = 25;   // the source's comment: "default 25"
  return out;
}

function _check(o, value) {
  if (o.kind === 'enum') { const v = String(value); if (!o.allowed.includes(v)) throw new Error(`${o.words}: one of ${o.allowed.join(', ')} (not "${value}")`); return v; }
  if (o.kind === 'list') {
    const v = Array.isArray(value) ? value.map(String) : String(value).split(/[\s,>]+/).filter(Boolean);
    const bad = v.filter(x => !o.allowed.includes(x)); if (bad.length) throw new Error(`${o.words}: ${bad.join(', ')} is not a way (the ways: ${o.allowed.join(', ')})`);
    if (!v.length) throw new Error(`${o.words}: give at least one way`);
    if (new Set(v).size !== v.length) throw new Error(`${o.words}: a way is named twice`);
    return v;
  }
  const s = String(value).trim().replace(/_/g, '');
  const n = o.kind === 'ms' && /^\d+(\.\d+)?\s*s$/.test(s) ? Math.round(parseFloat(s) * 1000) : Number(s);
  if (!Number.isFinite(n) || Math.round(n) !== n) throw new Error(`${o.words}: a whole number${o.kind === 'ms' ? ' of milliseconds (or seconds: 5s)' : ''} (not "${value}")`);
  if (n < o.min || n > o.max) throw new Error(`${o.words}: between ${o.min} and ${o.max}${o.kind === 'ms' ? ' ms' : ''} (not ${n})`);
  return n;
}

function createOptions({ file = path.join(ROOT, 'data', 'erosmancer', 'options.json'), record = null, defaults = defaultsFromSource() } = {}) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { return {}; } };
  const write = (o) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(o, null, 2) + '\n'); };
  const byKey = new Map(CATALOGUE.map(o => [o.key, o]));
  const def = (o) => (o.def !== undefined ? o.def : defaults[o.key]);
  const find = (key) => { const o = byKey.get(String(key)) || CATALOGUE.find(x => x.words.toLowerCase() === String(key).toLowerCase());
    if (!o) throw new Error(`no ErosmancerOS option "${key}" — the options: ${CATALOGUE.map(x => x.key).join(', ')}`); return o; };
  const api = {
    file,
    list() {
      const saved = read();
      return { options: CATALOGUE.map(o => { const d = def(o); const v = saved[o.key] !== undefined ? saved[o.key] : d;
        return { key: o.key, section: o.section, words: o.words, does: o.does, kind: o.kind, ...(o.allowed ? { allowed: o.allowed } : {}), ...(o.min !== undefined ? { min: o.min, max: o.max } : {}),
          value: v, default: d, changed: saved[o.key] !== undefined && JSON.stringify(saved[o.key]) !== JSON.stringify(d), when: o.when }; }),
        fixed: Object.entries(FIXED).map(([key, does]) => ({ key, does, value: defaults[key] })),
        managed: Object.entries(MANAGED).map(([key, does]) => ({ key, does })) };
    },
    get(key) { return api.list().options.find(x => x.key === find(key).key); },
    set(key, value, { by = 'person' } = {}) {
      const o = find(key); const v = _check(o, value);
      const saved = read(); const before = saved[o.key]; saved[o.key] = v; write(saved);
      if (typeof record === 'function') { try { record({ kind: 'erosmancer.option.set', system: 'clear-glass', message: `ErosmancerOS ${o.key}: ${JSON.stringify(before === undefined ? def(o) : before)} → ${JSON.stringify(v)} (by ${by})`, change: { file: path.basename(file), dir: path.dirname(file), text: JSON.stringify(saved, null, 2) } }); } catch (_) {} }
      return { ok: true, key: o.key, words: o.words, value: v, when: o.when, note: o.when === 'live' ? 'set now' : 'kept; used the next time Clear Glass connects ErosmancerOS (reconnect to use it now)' };
    },
    reset(key) { const o = find(key); const saved = read(); delete saved[o.key]; write(saved); return { ok: true, key: o.key, value: def(o), note: 'back to its default' }; },
    /** the config POST /api/connect takes: whole sections (its merge is one level deep), only when something was changed */
    connectConfig() {
      const saved = read(); const cfg = {};
      for (const o of CATALOGUE) {
        if (o.when !== 'connect' || saved[o.key] === undefined) continue;
        const [sec, leaf] = o.key.split('.');
        if (!cfg[sec]) { cfg[sec] = {}; for (const x of CATALOGUE) if (x.key.startsWith(`${sec}.`) && def(x) !== undefined) cfg[sec][x.key.split('.')[1]] = def(x); }
        cfg[sec][leaf] = saved[o.key];
      }
      return Object.keys(cfg).length ? cfg : null;
    },
    saved: read,
  };
  return api;
}

module.exports = { CATALOGUE, MANAGED, FIXED, STRATEGIES, PACES, ROUTES, leavesFromSource, defaultsFromSource, createOptions };
