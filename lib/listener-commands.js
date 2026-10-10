'use strict';
/**
 * lib/listener-commands.js — what a Guardian listener hears, run as Nexus commands (0.59.4).
 * comp_id: nexus.lib.listener-commands
 *
 * James, 2026-10-10: "No I mean just using the capture. Like open the chat url. In general. Use the listener to have you
 * use a command."
 *
 * Any page Clear Glass shows — a chat (ChatGPT, Claude, this Claude Code session), a doc, anything — gets a Guardian
 * listener (the picker's ⦿ LISTEN) on the element where replies appear, with the link target "Nexus command". When the
 * text it hears holds a command line, the command runs:
 *     nexus> census
 *     idearium dump a gig that builds booking sites
 *     ```nexus
 *     field point 3 click
 *     ```
 * through the one command tool every agent uses (lib/agent-tools/tools/nexus/command.js — the rows of
 * idearium/cli/route-commands.js), so the same rules hold: the person's rows (approving, passwords, stopping a system) are
 * refused with the reason. Each command runs once per listener: a streaming reply that is heard many times does not run
 * it many times, and the same line repeated later in the page does not either.
 */

const MODULE_ID = 'nexus.lib.listener-commands';
const VERSION = '1.0.0';
const EXPLICIT_RE = /^\s*(?:nexus>|nexus:)\s+(.+?)\s*$/gim;   // meant as a command: always run, an unknown one is said
const CLI_RE = /^\s*idearium\s+(.+?)\s*$/gm;                  // lowercase only, and run only when it names a real command (prose that starts with "Idearium …" is not)
const FENCE_RE = /```nexus\s*\n([\s\S]*?)```/gi;
const MAX_PER_EVENT = 5;
const SEEN_MAX = 500;

/** words(s) — split a command line into words, keeping "quoted phrases" whole */
function words(s) {
  const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m;
  while ((m = re.exec(String(s)))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** commandLines(text) → [{ line, explicit }] — the command lines in heard text, in order, de-duplicated */
function commandLines(text) {
  const t = String(text || '');
  const out = [], seen = new Set();
  const add = (line, explicit) => { const l = String(line || '').replace(/[`*_]+$/g, '').trim(); if (l && !seen.has(l)) { seen.add(l); out.push({ line: l, explicit }); } };
  for (const m of t.matchAll(FENCE_RE)) for (const l of m[1].split('\n')) if (l.trim() && !l.trim().startsWith('#')) add(l.trim().replace(/^(?:nexus>|nexus:|idearium)\s+/, ''), true);
  const outside = t.replace(FENCE_RE, ' ');
  for (const m of outside.matchAll(EXPLICIT_RE)) add(m[1], true);
  for (const m of outside.matchAll(CLI_RE)) add(m[1], false);
  return out.slice(0, MAX_PER_EVENT);
}

/**
 * parse(line, keys) → { command, args, flags } | { error } — keys: the command names ("field point", "census", …).
 * The longest command name the line starts with wins ("field point 3" → "field point", not "field").
 */
function parse(line, keys) {
  const w = words(line);
  const flags = {}, rest = [];
  for (let i = 0; i < w.length; i++) {
    const m = /^--([a-z][\w-]*)(?:=(.*))?$/i.exec(w[i]);
    if (!m) { rest.push(w[i]); continue; }
    if (m[2] !== undefined) flags[m[1]] = m[2];
    else if (i + 1 < w.length && !/^--/.test(w[i + 1])) flags[m[1]] = w[++i];
    else flags[m[1]] = true;
  }
  const lower = rest.map(x => String(x).toLowerCase());
  for (const n of [3, 2, 1]) {
    const cand = lower.slice(0, n).join(' ');
    if (keys.includes(cand)) return { command: cand, args: rest.slice(n), flags };
  }
  return { error: `no Nexus command "${rest.slice(0, 2).join(' ')}"` };
}

/**
 * createRunner({ tool, onResult, now }) → { hear(listenerId, text) → Promise<results[]> }
 *   tool: the nexus.command tool ({ execute }); onResult(r): told each result (shown to the person)
 */
function createRunner({ tool = null, onResult = () => {}, now = () => Date.now() } = {}) {
  const T = tool || require('./agent-tools/tools/nexus/command.js').command;
  const seen = new Set();
  let keys = null;
  async function _keys() {
    if (keys) return keys;
    const l = await T.execute({ action: 'list' });
    keys = (l.commands || []).map(c => String(c.command).toLowerCase());
    return keys;
  }
  async function hear(listenerId, text) {
    const lines = commandLines(text);
    if (!lines.length) return [];
    const ks = await _keys();
    const out = [];
    for (const { line, explicit } of lines) {
      const id = `${listenerId}\u0000${line}`;
      if (seen.has(id)) continue;
      const p = parse(line, ks);
      if (p.error && !explicit) continue;   // "idearium …" in prose that names no command: not a command, nothing said
      seen.add(id); if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
      let r;
      if (p.error) r = { line, error: p.error };
      else {
        try { r = { line, ...(await T.execute({ action: 'run', command: p.command, args: p.args, flags: p.flags }, { agent: 'listener' })) }; }
        catch (e) { r = { line, error: e.message }; }
      }
      r.listenerId = listenerId; r.at = now();
      out.push(r);
      try { onResult(r); } catch (_) {}
    }
    return out;
  }
  return { hear };
}

/** summary(r) → one short text for the person: what ran and what came back */
function summary(r) {
  if (r.refused) return `nexus> ${r.line}\n✗ ${r.reason}`;
  if (r.error) return `nexus> ${r.line}\n✗ ${r.error}`;
  const res = r.result;
  let body = res == null ? 'done' : typeof res === 'string' ? res : (res.text || res.note || JSON.stringify(res));
  return `nexus> ${r.line}\n${String(body).slice(0, 1200)}`;
}

module.exports = { MODULE_ID, VERSION, words, commandLines, parse, createRunner, summary };
