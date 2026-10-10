'use strict';
/**
 * copilot/lib/nexus-ask.js — talk to Nexus in plain words (0.59.11 TN2).
 * comp_id: copilot.lib.nexus-ask
 * Map: docs/2026-10-10-copilot-talk-to-nexus-phasemap.spec
 *
 * James, 2026-10-10: "okay. now. make it useful like; hooked into copilot so you can talk to nexus".
 *
 * "what's unbuilt?", "which models are loaded?", "how's memory?", "idea: a gig that builds booking sites" — each is a
 * Nexus command he would otherwise have to know. The rows of idearium/cli/route-commands.js say which words mean them
 * (ASK, attached as row.ask); this matches a message against them, runs the row through the one command tool
 * (nexus.command — the same rules as every agent: the person's rows refused), and answers with the row's own printed
 * text and the exact command, so he learns it. No model: it answers with Ollama down, in milliseconds, without guessing.
 *
 *   match(message)                → { key, command, args, flags, line } | null
 *   answer(message, { tool, by }) → { text, command, ok } | null
 * Used by clear-glass/src/copilot/bridge.js (the pane) and copilot/server.js /api/prompt (every other channel).
 */

const path = require('path');
const { pathToFileURL } = require('url');

const MODULE_ID = 'copilot.lib.nexus-ask';
const VERSION = '1.0.0';
const MAX_QUESTION = 240;   // a question, not a pasted page — longer prose goes to the model (dump is exempt)

let _spec = null;
async function _table() {
  if (!_spec) _spec = (await import(pathToFileURL(path.join(__dirname, '..', '..', 'idearium', 'cli', 'route-commands.js')).href)).SPEC;
  return _spec;
}

function _line(key, args, flags) {
  const q = (w) => (/\s/.test(w) ? `"${w}"` : w);
  const f = Object.entries(flags || {}).map(([k, v]) => (v === true ? `--${k}` : `--${k} ${q(String(v))}`));
  return [key.replace('.', ' '), ...(args || []).map(q), ...f].join(' ');
}

async function match(message) {
  const t = String(message || '').trim();
  if (!t || /^\s*(?:nexus>|nexus:|\/)/i.test(t)) return null;   // nexus> and slash commands have their own paths
  for (const row of await _table()) {
    if (!row.ask) continue;
    if (row.key !== 'dump' && t.length > MAX_QUESTION) continue;
    const m = row.ask.re.exec(t);
    if (!m) continue;
    const args = row.ask.args ? row.ask.args(m, t) : [];
    const flags = row.ask.flags ? row.ask.flags(m, t) : {};
    return { key: row.key, command: row.key.replace('.', ' '), args, flags, line: _line(row.key, args, flags) };
  }
  return null;
}

async function answer(message, { tool = null, by = 'copilot' } = {}) {
  const hit = await match(message);
  if (!hit) return null;
  const T = tool || require('../../lib/agent-tools/tools/nexus/command.js').command;
  let r;
  try { r = await T.execute({ action: 'run', command: hit.command, args: hit.args, flags: hit.flags }, { agent: by }); }
  catch (e) { r = { error: e.message }; }
  const ok = !!r && !r.error && !r.refused;
  const body = !r ? 'no answer'
    : r.refused ? `✗ ${r.reason}`
    : r.error ? `✗ ${r.error}`
    : r.text || (r.result && (r.result.text || r.result.note)) || JSON.stringify(r.result).slice(0, 1200);
  return { text: `⌘ Nexus · ${hit.command}\n${body}\n— nexus> ${hit.line}`, command: hit.line, key: hit.key, ok, refused: !!(r && r.refused) };
}

module.exports = { MODULE_ID, VERSION, match, answer, MAX_QUESTION };
