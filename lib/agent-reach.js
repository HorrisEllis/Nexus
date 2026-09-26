'use strict';
/**
 * lib/agent-reach.js — is this agent ACTUALLY reachable right now?
 * comp_id: nexus.lib.agent-reach
 * UUID: nexus-agent-reach-v1-0000-2026-0819-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-19): "the change agents tool needs to connect to the
 * actual chats with the ncp, userscripts, clearglass."
 *
 * §1.1 — switching to an agent was a CLAIM about identity, never a connection.
 * `switch_agent` wrote a row to `copilot_identity` through self-model and
 * stopped there; it never asked guardian whether a tab for that provider was
 * open. Your own UI already said so in as many words:
 *
 *   "Routing to 'chatgpt'. Heads up: chatgpt's tab didn't ack within the
 *    timeout — RAID denied dispatch... the switch is set, but that agent may
 *    not actually be reachable right now."
 *
 * The system knew. The tool that set the switch did not ask.
 *
 * §16.5 — one implementation. agent-chat, the autonomy router and switch_agent
 * all need this same answer, and three copies of it would drift into three
 * different definitions of "connected" (§10.3).
 *
 * §NOT EVERY AGENT IS A TAB. This is the distinction that makes a naive check
 * wrong: claude/chatgpt/gemini/perplexity live in Clear Glass provider windows
 * and are reachable only through guardian's NCP. `ollama` and `mistral` are a
 * local server on :3749 and have no tab at all. `auto` is a routing decision,
 * not a destination. A check that treated them alike would refuse a perfectly
 * working ollama switch — the fix would be worse than the bug.
 */

const http = require('http');

const VERSION   = '1.0.0';
const MODULE_ID = 'nexus.lib.agent-reach';

const GUARDIAN = process.env.GUARDIAN_URL || 'http://127.0.0.1:7820';
const OLLAMA   = process.env.OLLAMA_BRIDGE_URL || 'http://127.0.0.1:3749';

/** How each agent is actually reached. Derived from the tree, not assumed. */
const KIND = Object.freeze({
  claude:     'ncp',     // Clear Glass provider window + userscript + guardian NCP
  chatgpt:    'ncp',
  gemini:     'ncp',
  perplexity: 'ncp',
  grok:       'ncp',
  ollama:     'local',   // ollama/server.js on :3749
  mistral:    'local',
  auto:       'router',  // a routing decision — RAID picks at dispatch time
});

/** Three states, never two. §PC-INV-1: unavailable is not the same as absent. */
const STATE = Object.freeze({
  REACHABLE:   'reachable',
  UNREACHABLE: 'unreachable',
  UNKNOWN:     'unknown',   // we could not ask — say so, never guess either way
});

function _get(url, timeoutMs = 2500) {
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch (e) { return resolve({ ok: false, error: e.message }); }
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', timeout: timeoutMs }, res => {
      let out = '';
      res.on('data', d => { out += d; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(out); } catch (_) {}
        resolve({ ok: true, status: res.statusCode, json, text: out });
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `no response from ${u.host} in ${timeoutMs}ms` }); });
    req.end();
  });
}

/**
 * providers() — the live NCP picture from guardian, or an honest "cannot ask".
 * @returns {{ok:boolean, providers?:object, channels?:*, reason?:string}}
 */
async function providers(opts = {}) {
  const r = await _get(`${opts.guardian || GUARDIAN}/providers`, opts.timeoutMs);
  if (!r.ok) return { ok: false, reason: `guardian unreachable at ${opts.guardian || GUARDIAN} — ${r.error}` };
  if (r.status !== 200 || !r.json) return { ok: false, reason: `guardian /providers answered ${r.status} with no usable body` };
  return { ok: true, providers: r.json.providers || {}, channels: r.json.channels };
}

/**
 * reach(agent) — can this agent actually be talked to right now?
 *
 * Never throws, never guesses. An agent whose reachability could not be
 * determined comes back UNKNOWN with the reason, because "I could not ask" and
 * "the tab is closed" call for different responses from the caller — and
 * collapsing them is how a switch silently lands on a dead tab.
 */
async function reach(agentName, opts = {}) {
  const agent = String(agentName || '').trim().toLowerCase();
  if (!agent) return { agent, state: STATE.UNKNOWN, kind: null, reason: 'no agent named' };

  const kind = KIND[agent] || null;

  // A forged hat is not an agent — it resolves to one. The caller (self-model)
  // owns that resolution; here an unknown name is reported as unknown rather
  // than being guessed into a provider.
  if (!kind) return { agent, state: STATE.UNKNOWN, kind: null, reason: `"${agent}" is not a base agent — if it is a forged hat, resolve it to its baseAgent first` };

  if (kind === 'router') {
    return { agent, state: STATE.REACHABLE, kind, reason: 'auto is a routing decision — RAID picks a real agent at dispatch time' };
  }

  if (kind === 'local') {
    const r = await _get(`${opts.ollama || OLLAMA}/health`, opts.timeoutMs);
    if (!r.ok) return { agent, state: STATE.UNREACHABLE, kind, reason: `ollama-bridge not answering on ${opts.ollama || OLLAMA} — ${r.error}` };
    if (r.status !== 200) return { agent, state: STATE.UNREACHABLE, kind, reason: `ollama-bridge answered ${r.status}` };
    return { agent, state: STATE.REACHABLE, kind, reason: 'ollama-bridge healthy' };
  }

  // kind === 'ncp'
  const p = await providers(opts);
  if (!p.ok) return { agent, state: STATE.UNKNOWN, kind, reason: p.reason };
  const status = p.providers[agent];
  if (status === 'connected') {
    return { agent, state: STATE.REACHABLE, kind, reason: 'NCP tab connected', connected: _connectedList(p.providers) };
  }
  return {
    agent, state: STATE.UNREACHABLE, kind,
    reason: status === undefined
      ? `guardian does not know the provider "${agent}"`
      : `no NCP tab is connected for "${agent}" — the Clear Glass window is closed, the userscript did not load, or the tab has not registered yet`,
    connected: _connectedList(p.providers),
  };
}

function _connectedList(map) {
  return Object.entries(map || {}).filter(([, s]) => s === 'connected').map(([n]) => n);
}

/** all() — every agent's state in one pass, for a status surface. */
async function all(opts = {}) {
  const names = Object.keys(KIND);
  const out = {};
  const p = await providers(opts);          // asked once, not once per provider
  for (const agent of names) {
    const kind = KIND[agent];
    if (kind === 'router') { out[agent] = { state: STATE.REACHABLE, kind, reason: 'routing decision' }; continue; }
    if (kind === 'ncp') {
      if (!p.ok) { out[agent] = { state: STATE.UNKNOWN, kind, reason: p.reason }; continue; }
      out[agent] = p.providers[agent] === 'connected'
        ? { state: STATE.REACHABLE, kind, reason: 'NCP tab connected' }
        : { state: STATE.UNREACHABLE, kind, reason: 'no NCP tab connected' };
      continue;
    }
    out[agent] = await reach(agent, opts);   // local — one health call
  }
  return { ok: true, agents: out, guardianReachable: p.ok, ts: Date.now() };
}

module.exports = { reach, all, providers, KIND, STATE, MODULE_ID, VERSION };
