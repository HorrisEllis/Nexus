'use strict';
/**
 * lib/agent-providers.js — who can wear a hat: one list, one resolver.
 * comp_id: nexus.lib.agent-providers
 * UUID: nexus-lib-agent-providers-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.267 — James: "the agent hat is meant to be agnostic, ollama/guardian/copilot."
 *
 * Before this, four places each kept their own list of who could build, and they disagreed:
 *   idearium/agent-suite REAL_GUARDIAN_PROVIDERS  claude chatgpt gemini perplexity deepseek (+ ollama, mistral)
 *   idearium/ui AGENT_OPTIONS                     ollama mistral claude chatgpt gemini perplexity deepseek
 *   lib/seam/adapters/warp-cascade KNOWN_PROVIDERS ollama chatgpt claude gemini deepseek        (no perplexity)
 *   lib/repo-agent providers()                    auto ollama + guardian/userscript-*.js on disk
 * and none of the build-path lists had copilot. Now:
 *
 *   copilot  — copilot's own routing decides (GET :3750/api/prompt/resolve → ollama or a guardian agent)
 *   ollama   — the local model through the bridge ('mistral' is an alias, kept for old manifests)
 *   <name>   — a guardian browser agent, offered iff guardian/userscript-<name>.js exists
 *
 * 'auto' is an alias of 'copilot' (repo-agent's name for the same switch position).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const COPILOT_URL = process.env.COPILOT_URL || 'http://127.0.0.1:3750';
// 0.39.278/279 — chat-stream is a shared prelude (the live chat ledger), not an agent: it was listed as one in 0.39.278
const NON_PROVIDER_SCRIPTS = new Set(['memory', 'nexus-wake', 'chat-stream']);
const ALIASES = { mistral: 'ollama', auto: 'copilot', 'co-pilot': 'copilot' };

/** guardianProviders() — browser agents guardian can drive, read from its userscripts on disk. */
function guardianProviders() {
  try {
    return fs.readdirSync(path.join(ROOT, 'guardian'))
      .map(f => (f.match(/^userscript-([a-z0-9-]+)\.js$/) || [])[1])
      .filter(n => n && !NON_PROVIDER_SCRIPTS.has(n)).sort();
  } catch (_) { return []; }
}

/**
 * headless() — §IN2a 2026-10-02: providers that run as a process on this machine, not through copilot or a guardian tab
 * (lib/claude-code-backend.js). Kept OUT of all(): the spec engine, warp-cascade and the agent suite treat every name in
 * all() that is not copilot/ollama as a guardian browser agent and would route claude-code to a tab. repo-agent and the
 * economy read this list beside all().
 */
const HEADLESS = Object.freeze(['claude-code']);
function headless() { return [...HEADLESS]; }

/** all() — every name a hat can be worn by, in switch order: copilot, ollama, then guardian's agents. */
function all() { return ['copilot', 'ollama', ...guardianProviders()]; }

/** normalize(name) — lower-cased, aliases folded ('mistral'→'ollama', 'auto'→'copilot'); null for empty. */
function normalize(name) {
  if (!name || typeof name !== 'string') return null;
  const n = name.trim().toLowerCase();
  return ALIASES[n] || n;
}

function isKnown(name) { const n = normalize(name); return !!n && all().includes(n); }
function isGuardian(name) { const n = normalize(name); return !!n && n !== 'copilot' && n !== 'ollama' && guardianProviders().includes(n); }

/** backendOf(name) — the three-way switch position: 'copilot' | 'ollama' | 'guardian' (null if unknown). */
function backendOf(name) {
  const n = normalize(name);
  if (n === 'copilot' || n === 'ollama') return n;
  if (HEADLESS.includes(n)) return n;   // §IN2a — its own backend
  return isGuardian(n) ? 'guardian' : null;
}

function _get(url, timeoutMs = 5000) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: timeoutMs }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * resolveCopilot() — which real provider the copilot position means right now.
 * -> { ok, provider: 'ollama' | '<guardian agent>', backend, note } or { ok:false, error }.
 * Nothing is dispatched when this fails: "copilot" never silently becomes some default.
 */
async function resolveCopilot() {
  const r = await _get(`${COPILOT_URL}/api/prompt/resolve`);
  if (!r || !r.ok || !r.backend) return { ok: false, error: `copilot :3750 couldn't say where its default goes${r && r.error ? ` (${r.error})` : ''}` };
  if (r.backend === 'ollama') return { ok: true, provider: 'ollama', backend: 'ollama', note: r.note || null };
  if (r.backend === 'guardian' && r.agent) return { ok: true, provider: normalize(r.agent), backend: 'guardian', note: r.note || null };
  return { ok: false, error: `copilot resolved to backend "${r.backend}" with no agent — nothing to send to` };
}

/** resolve(name) — any name -> a concrete provider ('ollama' or a guardian agent). copilot is asked; the rest pass through. */
async function resolve(name) {
  const n = normalize(name);
  if (!n) return { ok: false, error: 'no agent named' };
  if (n === 'copilot') { const r = await resolveCopilot(); return r.ok ? { ...r, via: 'copilot' } : r; }
  if (n === 'ollama') return { ok: true, provider: 'ollama', backend: 'ollama' };
  if (isGuardian(n)) return { ok: true, provider: n, backend: 'guardian' };
  return { ok: false, error: `unknown agent "${name}" — one of: ${all().join(', ')}` };
}

module.exports = { headless, HEADLESS, all, guardianProviders, normalize, isKnown, isGuardian, backendOf, resolve, resolveCopilot, ALIASES, MODULE_ID: 'nexus.lib.agent-providers', VERSION: '1.0.0' };
