'use strict';
/**
 * lib/agent-tools/tools/nexus/command.js — nexus.command.tool: every command a person has, for an agent. §0.39.376 CM2
 * comp_id: nexus.lib.agent-tools.tools.nexus.command
 *
 * James: "Yes. And copilot. Copilot is the entrance of nexus. Like I want it to be able to do anything, nexus can."
 *
 * ONE tool over ONE table: the rows of idearium/cli/route-commands.js (SPEC) — the same rows `idearium <command>` runs.
 * A new command there is a new capability here, with nothing added to this file. The agent names the command
 * ("repo tasks", "repo desktop", "activity", "perf" …), the repo (uuid or name; a repo agent's own repo by default), the
 * words after it (args) and its flags; the answer is the API's own, trimmed to a size a small model can read.
 * What stays the person's (a row's personOnly — approving a proposal, stopping or restarting a Nexus system) is refused
 * with the reason and how the person does it: an agent asks; it never acts in their place there.
 * Every call is attributed: the activity log rows these acts write name the caller (the agent's hat, or copilot).
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { toolName } = require('../../naming.js');

const MAX_CHARS = 12000;
let _spec = null;
async function _table() {
  if (!_spec) _spec = (await import(pathToFileURL(path.join(__dirname, '..', '..', '..', '..', 'idearium', 'cli', 'route-commands.js')).href)).SPEC;
  return _spec;
}
function _keyOf(command) { return String(command || '').trim().replace(/^idearium\s+/, '').split(/[\s.]+/).filter(Boolean).join('.'); }
/** _trim(x) — the answer, cut to MAX_CHARS: long arrays shortened (said), long strings ended with … */
function _trim(x) {
  const s = JSON.stringify(x);
  if (s.length <= MAX_CHARS) return x;
  const cut = (v, d = 0) => Array.isArray(v) ? (v.length > 25 ? [...v.slice(0, 25).map(e => cut(e, d + 1)), `… ${v.length - 25} more — narrow it (--limit, --kind, a filter)`] : v.map(e => cut(e, d + 1)))
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, e]) => [k, cut(e, d + 1)]))
    : typeof v === 'string' && v.length > 1200 ? `${v.slice(0, 1200)}…` : v;
  return cut(x);
}

async function _repo(ref, ctx) {
  const C = require('../idearium/code.js');
  const c = (ctx && ctx.context) || {};
  const fromAgent = c.agentId && /^repo-(.+)$/.exec(c.agentId);
  const own = c.repoUuid || (fromAgent && fromAgent[1]) || null;   // a repo agent's own repo, as the code tools read it
  const want = ref || own;
  if (!want) return { error: 'which repo? give repo (its uuid or name)' };
  const list = await C._call('GET', '/api/repos');
  const repos = (list && (list.repos || list.data || list)) || [];
  const all = Array.isArray(repos) ? repos : [];
  const r = all.find(x => x.uuid === want) || all.find(x => x.name === want) || all.find(x => x.uuid && x.uuid.endsWith(want)) || all.find(x => x.uuid && x.uuid.startsWith(want));
  return r ? { uuid: r.uuid, name: r.name } : (list && list.error ? { error: list.error } : { error: `no repo ${want}` });
}

function _clearGlass(method, path, body, timeoutMs) {
  const http = require('http'), port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10);
  const data = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path, method, timeout: timeoutMs, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (rs) => {
      let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { reject(new Error(`Clear Glass ${method} ${path} → ${rs.statusCode}, not JSON`)); } });
    });
    r.on('timeout', () => { r.destroy(); reject(new Error(`Clear Glass ${method} ${path} timed out`)); });
    r.on('error', (e) => reject(new Error(`Clear Glass unreachable at :${port} — ${e.message}`)));
    if (data) r.write(data); r.end();
  });
}

const command = {
  name: toolName('nexus', 'command'),
  description: 'Run any Nexus command — the same ones a person types as `idearium <command>`. command: e.g. "repo tasks", '
    + '"repo activity", "activity", "repo desktop", "repo system", "repo charter", "repo changes", "repo ask", "repo agent", '
    + '"repo phasemap", "repo phase" (args [phase] or [phase,"build"]), "repo versions", "store", "ollama tape", '
    + '"perf", "models" (action "list" shows them all with their usage). repo: uuid or name (default: your own repo). '
    + 'args: the words after the repo, e.g. ["checkpoint"] or ["rewind","cp-…"]. flags: e.g. {"kind":"fault","limit":20}. '
    + 'Approving proposals and stopping or restarting a system are the person\'s: ask them.',
  parameters: { type: 'object', properties: {
    action: { type: 'string', enum: ['run', 'list'], description: 'run (default) or list the commands' },
    command: { type: 'string', description: 'the command, e.g. "repo desktop" or "activity"' },
    repo: { type: 'string', description: 'the repo\'s uuid or name — your own by default' },
    args: { type: 'array', items: { type: 'string' }, description: 'the words after the repo' },
    flags: { type: 'object', description: 'its --flags, e.g. {"running":true} or {"kind":"inject"}' },
  } },
  execute: async (input = {}, ctx = {}) => {
    const SPEC = await _table();
    if (input.action === 'list' || !input.command) return { commands: SPEC.map(r => ({ command: r.key.replace('.', ' '), usage: `idearium ${r.usage}`, about: r.about, ...(r.personOnly ? { note: 'parts of it are the person\'s' } : {}) })) };
    const key = _keyOf(input.command);
    const row = SPEC.find(r => r.key === key);
    if (!row) return { error: `no command "${input.command}" — action "list" shows them`, near: SPEC.map(r => r.key.replace('.', ' ')).filter(k => k.split(' ').some(w => key.includes(w))).slice(0, 5) };
    const a = { repo: null, args: Array.isArray(input.args) ? input.args.map(String) : (input.args ? String(input.args).split(/\s+/) : []), flags: input.flags && typeof input.flags === 'object' ? input.flags : {} };
    const refused = row.personOnly ? row.personOnly(a) : null;   // read from the words alone: refused before any repo is looked up
    if (refused) return { refused: true, reason: refused };
    if (row.repo) { const r = await _repo(input.repo, ctx); if (r.error) return r; a.repo = r; }
    const missing = row.need ? row.need(a) : null;
    if (missing) return { error: `${missing} is needed — usage: idearium ${row.usage}` };
    const rq = row.req(a);
    if (rq.error) return { error: rq.error };
    let d;
    try {
      // §0.59.4 — a command aimed at another system now sends its body (it was dropped), and reaches Clear Glass (not in the
      // ports block — its IPC port, CLEARGL_IPC_PORT, the same the CLI rows use): field, picks, the attention record
      if (rq.system === 'clear-glass') d = await _clearGlass(rq.method, rq.path, rq.body, rq.timeoutMs || 30000);
      else if (rq.system) d = await require('../../../nexus-client.js').call(rq.system, rq.method, rq.path, rq.body, { timeout: rq.timeoutMs || 8000 });
      else {
        const by = (ctx && ctx.agent) || (ctx && ctx.context && ctx.context.agent) || 'agent';
        const body = rq.body && rq.body.approvedBy ? { ...rq.body, approvedBy: by } : rq.body;
        d = await require('../idearium/code.js')._call(rq.method, rq.path, body || null, rq.timeoutMs || 30000);
      }
    } catch (e) { return { error: e.message }; }
    if (d && (d.error || d.ok === false)) return { error: d.error || 'refused', command: `idearium ${row.usage}` };
    return _trim({ command: `${key.replace('.', ' ')}${a.repo ? ` ${a.repo.name}` : ''}${a.args.length ? ` ${a.args.join(' ')}` : ''}`, result: d });
  },
};

module.exports = { command, ALL: [command], _keyOf, _trim, MAX_CHARS };
