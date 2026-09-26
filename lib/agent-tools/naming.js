'use strict';
/**
 * lib/agent-tools/naming.js — the real naming convention James specified:
 *
 *   System.toolname.tool              — e.g. guardian.build.tool
 *   System.commandname.command        — e.g. copilot.restart.command
 *   Provider.Agentname.agent.tool     — e.g. chatgpt.default.agent.tool
 *
 * §WHY THIS EXISTS — checked before building: the existing 77 tools in
 * lib/agent-tools/tools/**\/*.js all use flat kebab/snake names
 * (read_file, loom-scan, nexus-heal — confirmed by grep across every
 * registerTool() call in index.js). None of them carry a system prefix
 * or a type suffix. This module is the real, single source of truth for
 * the new dotted convention going forward — build the name here, don't
 * hand-assemble the string at each call site, so the format can never
 * silently drift between tools.
 *
 * §SCOPE — this does NOT rename the existing 77 tools. That's a real,
 * separate migration (77 call sites, each needs its own system assigned
 * and its consumers — copilot's tool-call routing, cortex's tool-index,
 * any hardcoded tool-name string elsewhere — checked and updated). Doing
 * that silently, alongside new tools, would be the kind of undeclared
 * scope creep that makes a diff impossible to review. What's here: the
 * naming module itself, plus new tools built to it from this point on.
 */

const VALID_SYSTEMS = Object.freeze([
  'nexus', 'clearglass', 'cortex', 'guardian', 'loom', 'versionium',
  'diagnostic', 'intelligence', 'idearium', 'architect', 'eravos',
  'copilot', 'orchestrator', 'mesh', 'ollama',
]);

// §CHECKED — provider list matches guardian's own REAL_GUARDIAN_PROVIDERS
// (idearium/agent-suite/index.js) plus 'ollama', the one non-guardian NCP
// provider already dispatched to elsewhere in this codebase (copilot's
// lifeline). Not inventing a second, competing provider list.
const VALID_PROVIDERS = Object.freeze(['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek', 'ollama']);

const NAME_PART = /^[a-z][a-z0-9_]*$/; // one segment: lowercase, digits, underscore — no dots, no dashes

function _checkSystem(system) {
  if (!VALID_SYSTEMS.includes(system)) {
    throw new Error(`[agent-tools/naming] unknown system "${system}" — add it to VALID_SYSTEMS if this is real, don't just widen the regex`);
  }
}

function _checkPart(label, value) {
  if (typeof value !== 'string' || !NAME_PART.test(value)) {
    throw new Error(`[agent-tools/naming] ${label} "${value}" must match ${NAME_PART} (lowercase, digits, underscore — no dots or dashes)`);
  }
}

/** System.toolname.tool — e.g. toolName('guardian', 'build') -> 'guardian.build.tool' */
function toolName(system, name) {
  _checkSystem(system);
  _checkPart('tool name', name);
  return `${system}.${name}.tool`;
}

/** System.commandname.command — e.g. commandName('copilot', 'restart') -> 'copilot.restart.command' */
function commandName(system, name) {
  _checkSystem(system);
  _checkPart('command name', name);
  return `${system}.${name}.command`;
}

/** Provider.Agentname.agent.tool — e.g. agentToolName('chatgpt', 'default', 'ask') -> 'chatgpt.default.ask.agent.tool' */
function agentToolName(provider, agentName, name) {
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(`[agent-tools/naming] unknown provider "${provider}" — must be one of ${VALID_PROVIDERS.join(', ')}`);
  }
  _checkPart('agent name', agentName);
  _checkPart('tool name', name);
  return `${provider}.${agentName}.${name}.agent.tool`;
}

const TOOL_RE    = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\.tool$/;
const COMMAND_RE = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\.command$/;
const AGENT_TOOL_RE = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\.agent\.tool$/;

/** Parses any of the three shapes back apart. Returns null if it doesn't match — never throws, callers check the result. */
function parseName(str) {
  if (typeof str !== 'string') return null;
  let m = str.match(TOOL_RE);
  if (m) return { kind: 'tool', system: m[1], name: m[2] };
  m = str.match(COMMAND_RE);
  if (m) return { kind: 'command', system: m[1], name: m[2] };
  m = str.match(AGENT_TOOL_RE);
  if (m) return { kind: 'agent_tool', provider: m[1], agent: m[2], name: m[3] };
  return null;
}

module.exports = {
  VALID_SYSTEMS, VALID_PROVIDERS,
  toolName, commandName, agentToolName, parseName,
};
