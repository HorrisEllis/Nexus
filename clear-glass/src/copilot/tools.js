'use strict';
/**
 * src/copilot/tools.js — Co-pilot Tool Registry
 * UUID: cg-copilot-tools-v1-0000-0000-000000000022
 *
 * Every Clear Glass capability the co-pilot can invoke, declared as tools.
 * The co-pilot system prompt includes this registry so it knows what it can do.
 * Tool calls arrive as ```driver blocks or ```tool blocks in the response.
 * The bridge parses them and dispatches via the SISO bus.
 *
 * Tools are grouped by category:
 *   browser   — navigation, screenshots, DOM
 *   guardian  — dispatch jobs, check providers, SEAM sessions
 *   cortex    — memory, gaps, CFR, RAID
 *   agent     — context switching, fingerprints, mesh
 *   session   — bookmarks, rewind, cookies
 *   system    — diagnostics, URL listeners, options
 */

const TOOLS = [
  // ── Browser ────────────────────────────────────────────────────────────
  { name: 'navigate',         cat: 'browser',  desc: 'Navigate to URL', params: { url: 'string', agentId: 'string?' } },
  { name: 'click',            cat: 'browser',  desc: 'Click element by selector or coords', params: { selector: 'string?', x: 'number?', y: 'number?' } },
  { name: 'type',             cat: 'browser',  desc: 'Type text into element', params: { selector: 'string', text: 'string', clearFirst: 'boolean?' } },
  { name: 'scroll',           cat: 'browser',  desc: 'Scroll page', params: { deltaY: 'number?' } },
  { name: 'screenshot',       cat: 'browser',  desc: 'Take screenshot of current page', params: {} },
  { name: 'eval',             cat: 'browser',  desc: 'Execute JS in page context', params: { code: 'string' } },
  { name: 'waitFor',          cat: 'browser',  desc: 'Wait for selector to appear', params: { selector: 'string', timeout: 'number?' } },
  { name: 'back',             cat: 'browser',  desc: 'Navigate back', params: {} },
  { name: 'forward',          cat: 'browser',  desc: 'Navigate forward', params: {} },
  { name: 'reload',           cat: 'browser',  desc: 'Reload current page', params: {} },
  { name: 'getUrl',           cat: 'browser',  desc: 'Get current page URL', params: {} },
  { name: 'getTitle',         cat: 'browser',  desc: 'Get current page title', params: {} },
  { name: 'inject',           cat: 'browser',  desc: 'Inject JS script persistently into page', params: { code: 'string', persistent: 'boolean?' } },
  { name: 'picker.enable',    cat: 'browser',  desc: 'Enable visual element picker overlay', params: {} },
  { name: 'picker.disable',   cat: 'browser',  desc: 'Disable element picker', params: {} },
  { name: 'record.start',     cat: 'browser',  desc: 'Start recording user actions for replay', params: {} },
  { name: 'record.stop',      cat: 'browser',  desc: 'Stop recording, return action sequence', params: {} },

  // ── DOM ────────────────────────────────────────────────────────────────
  { name: 'dom.query',        cat: 'dom',      desc: 'Query live DOM tree by selector or get full tree', params: { selector: 'string?', tree: 'boolean?' } },
  { name: 'dom.mutate',       cat: 'dom',      desc: 'Mutate DOM node — text, html, style, attrs, remove', params: { selector: 'string', mutation: 'object' } },
  { name: 'dom.pick',         cat: 'dom',      desc: 'Register picked element as named hook', params: { selector: 'string', name: 'string?' } },
  { name: 'dom.tokens',       cat: 'dom',      desc: 'Scan page for LLM API patterns and token usage', params: {} },
  { name: 'dom.highlight',    cat: 'dom',      desc: 'Highlight elements matching selector', params: { selector: 'string', color: 'string?' } },

  // ── Guardian ───────────────────────────────────────────────────────────
  { name: 'guardian.dispatch', cat: 'guardian', desc: 'Dispatch a job to Guardian for a specific provider', params: { provider: 'string', prompt: 'string', sessionId: 'string?' } },
  { name: 'guardian.providers',cat: 'guardian', desc: 'Get status of all NCP provider connections', params: {} },
  { name: 'guardian.jobs',     cat: 'guardian', desc: 'List recent Guardian jobs', params: { status: 'string?' } },
  { name: 'guardian.seam',     cat: 'guardian', desc: 'Get SEAM session status and queue', params: {} },
  { name: 'guardian.gaps',     cat: 'guardian', desc: 'Get open gaps detected by Guardian', params: {} },
  { name: 'guardian.health',   cat: 'guardian', desc: 'Guardian health and provider status', params: {} },
  { name: 'provider.start',   cat: 'guardian', desc: 'Start NCP provider tab (Claude, ChatGPT, Gemini, Perplexity)', params: { providerId: 'string', show: 'boolean?' } },
  { name: 'provider.stop',    cat: 'guardian', desc: 'Stop NCP provider tab', params: { providerId: 'string' } },
  { name: 'provider.list',    cat: 'guardian', desc: 'List all providers and their hosted status', params: {} },

  // ── Cortex ─────────────────────────────────────────────────────────────
  { name: 'cortex.memory',    cat: 'cortex',   desc: 'Search or browse Cortex memory', params: { query: 'string?', table: 'string?' } },
  { name: 'cortex.gaps',      cat: 'cortex',   desc: 'List open gaps in Cortex', params: { severity: 'string?' } },
  { name: 'cortex.cfr',       cat: 'cortex',   desc: 'Get CFR field health and causal graph', params: {} },
  { name: 'cortex.raid',      cat: 'cortex',   desc: 'Get RAID routing health and agent weights', params: {} },
  { name: 'cortex.event',     cat: 'cortex',   desc: 'Write event to Cortex event log', params: { type: 'string', payload: 'object' } },

  // ── Agent contexts ─────────────────────────────────────────────────────
  { name: 'context.create',   cat: 'agent',    desc: 'Create new isolated agent context with fingerprint', params: { agentId: 'string?', url: 'string?' } },
  { name: 'context.switch',   cat: 'agent',    desc: 'Switch to a different agent context', params: { agentId: 'string' } },
  { name: 'context.list',     cat: 'agent',    desc: 'List all agent contexts and their health', params: {} },
  { name: 'context.fp.switch',cat: 'agent',    desc: 'Switch fingerprint mode for agent (firefox|chrome|safari)', params: { agentId: 'string', mode: 'string' } },
  { name: 'mesh.spawn',       cat: 'agent',    desc: 'Spawn free AI agent (claude|chatgpt|gemini|perplexity|mistral)', params: { agentKey: 'string' } },
  { name: 'mesh.route',       cat: 'agent',    desc: 'Route prompt to healthiest available agent (uses agent-router\'s real intent map for ordering)', params: { prompt: 'string', preferAgent: 'string?', intent: 'string?' } },
  { name: 'mesh.send',        cat: 'agent',    desc: 'Send prompt to specific mesh agent', params: { agentKey: 'string', prompt: 'string', contextId: 'string?', useEros: 'boolean?' } },
  // §GAP-FIXED 2026-08-29 — mesh.enqueue has had a real, working gate
  // (src/gates/index.js's meshEnqueueGate) and a real IPC channel
  // (mesh:enqueue) since before this tools registry existed — checked
  // both directly. It was simply never added here, so the co-pilot
  // itself never knew "queue this for later, don't block on it" was an
  // option distinct from route/send; it could only see two of the three
  // real ways to hand work to the mesh.
  { name: 'mesh.enqueue',     cat: 'agent',    desc: 'Queue a task for the mesh to process serially (does not block — task runs via route() when its turn comes)', params: { prompt: 'string', preferAgent: 'string?', fallbackOrder: 'string[]?' } },

  // ── Session ────────────────────────────────────────────────────────────
  { name: 'bookmarks.add',    cat: 'session',  desc: 'Bookmark the current page or a URL', params: { url: 'string?', title: 'string?', tags: 'string[]?' } },
  { name: 'bookmarks.remove', cat: 'session',  desc: 'Remove bookmark by URL or ID', params: { url: 'string?', id: 'string?' } },
  { name: 'bookmarks.list',   cat: 'session',  desc: 'List bookmarks, optionally filtered', params: { tag: 'string?', query: 'string?' } },
  { name: 'bookmarks.open',   cat: 'session',  desc: 'Navigate to a bookmarked URL by title or URL', params: { query: 'string' } },
  { name: 'rewind.snapshot',  cat: 'session',  desc: 'Take a rewind snapshot of current state', params: { label: 'string?' } },
  { name: 'rewind.list',      cat: 'session',  desc: 'List rewind snapshots for current agent', params: { limit: 'number?' } },
  { name: 'rewind.restore',   cat: 'session',  desc: 'Restore to a previous snapshot', params: { steps: 'number?', snapshotId: 'string?' } },
  { name: 'cookies.save',     cat: 'session',  desc: 'Save current cookies to vault', params: { accountId: 'string', domain: 'string?' } },
  { name: 'cookies.restore',  cat: 'session',  desc: 'Restore cookies from vault', params: { accountId: 'string' } },
  { name: 'cookies.health',   cat: 'session',  desc: 'Check token validity of current session cookies', params: {} },

  // ── URL listeners ──────────────────────────────────────────────────────
  { name: 'url.listen',       cat: 'system',   desc: 'Add URL pattern listener that fires a NEXUS hook', params: { pattern: 'string', hook: 'string', capture: 'string[]?' } },
  { name: 'url.listen.remove',cat: 'system',   desc: 'Remove URL listener by ID', params: { listenerId: 'string' } },
  { name: 'url.listen.list',  cat: 'system',   desc: 'List active URL listeners', params: {} },

  // ── Network ────────────────────────────────────────────────────────────
  { name: 'network.block',    cat: 'system',   desc: 'Block URL patterns from loading', params: { patterns: 'string[]' } },
  { name: 'network.intercept',cat: 'system',   desc: 'Intercept and log requests matching patterns', params: { patterns: 'string[]' } },
  { name: 'storage.get',      cat: 'browser',  desc: 'Get localStorage/sessionStorage value', params: { key: 'string?', type: 'string?' } },
  { name: 'storage.set',      cat: 'browser',  desc: 'Set localStorage value', params: { key: 'string', value: 'string' } },

  // ── Diagnostics ────────────────────────────────────────────────────────
  { name: 'diag.nexus',       cat: 'system',   desc: 'Run NEXUS home UI audit (navigate, assert, screenshot)', params: { nexusUrl: 'string?' } },
  { name: 'diag.page',        cat: 'system',   desc: 'Run page audit (broken images, JS errors, performance)', params: { url: 'string?' } },
  { name: 'diag.run',         cat: 'system',   desc: 'Run custom diagnostic steps', params: { steps: 'object[]', label: 'string?' } },

  // ── Window / UI ────────────────────────────────────────────────────────
  { name: 'window.open',      cat: 'system',   desc: 'Open agent window', params: { agentId: 'string?', url: 'string?' } },
  { name: 'window.close',     cat: 'system',   desc: 'Close agent window (hides to tray)', params: { agentId: 'string?' } },
  { name: 'window.hide',      cat: 'system',   desc: 'Hide window to tray', params: { agentId: 'string?' } },
  { name: 'options.set',      cat: 'system',   desc: 'Set a Clear Glass option', params: { key: 'string', value: 'any' } },
  { name: 'options.get',      cat: 'system',   desc: 'Get current Clear Glass options', params: {} },

  // ── Userscripts ────────────────────────────────────────────────────────
  { name: 'userscript.list',  cat: 'system',   desc: 'List all installed userscripts', params: { agentId: 'string?' } },
  { name: 'userscript.inject',cat: 'system',   desc: 'Inject a userscript into an agent tab', params: { agentId: 'string', scriptId: 'string' } },
  { name: 'userscript.toggle',cat: 'system',   desc: 'Enable or disable a userscript', params: { scriptId: 'string', enabled: 'boolean' } },
];

// Build tool registry by name for fast lookup
const BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

// Build system prompt section
function buildToolsPrompt() {
  const bycat = {};
  for (const t of TOOLS) {
    if (!bycat[t.cat]) bycat[t.cat] = [];
    bycat[t.cat].push(t);
  }

  let out = '## Available Tools\n';
  out += 'Issue tool calls as ```driver JSON blocks. Multiple calls allowed per response.\n\n';
  out += '```driver\n{ "action": "navigate", "url": "https://example.com" }\n```\n\n';
  out += '```driver\n{ "action": "guardian.dispatch", "provider": "claude", "prompt": "Write a test" }\n```\n\n';

  for (const [cat, tools] of Object.entries(bycat)) {
    out += `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
    for (const t of tools) {
      const params = Object.entries(t.params).map(([k, v]) => `${k}: ${v}`).join(', ');
      out += `- **${t.name}** — ${t.desc}${params ? ` (${params})` : ''}\n`;
    }
    out += '\n';
  }
  return out;
}

module.exports = { TOOLS, BY_NAME, buildToolsPrompt };
