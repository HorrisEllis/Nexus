'use strict';
/**
 * lib/agent-pull.js — the agent PULL toolbox (agnostic; §AP1 agent-intelligence)
 * UUID: nexus-agent-pull-v1-0000-2026-0807-001
 *
 * James: "inject what's needed into agents, and give them the tools to interact
 * with nexus to get anything MORE they need if it's needed." This is the PULL
 * half (push = buildInjectionPayload, P2). An agent, mid-task, reaches back into
 * NEXUS for a schema / contract / chunk-by-id / capability it discovers it needs
 * — rather than everything being pre-injected.
 *
 * "Lib is for agnostic tools for the systems" — so this lives in lib/, usable by
 * any agent path, not just Gemini. Each pull is SCOPED by the agent's P1 contract
 * (agentCan) — an agent pulls only what its toolbox allows (§1.1). And every pull
 * is recorded to the cortex tool index (lib/tool-index) which populates over time
 * with real file/consumer/intent/edge-case data.
 *
 * §8.6 composes schema-registry + chunk-service + loom capability-map + lib/seam.
 * §1.2 a pull that can't resolve returns a stated miss, never throws.
 */

const { agentCan } = require('./gemini-toolbox/agent-contracts');

function _record(agentId, tool, intent, result) {
  try { require('./tool-index').record({ agentId, tool, intent, ok: !result || result.ok !== false, ts: Date.now() }); } catch (_) {}
}

/**
 * pull(agentId, tool, args) — the single scoped entry. Routes to the right NEXUS
 * source, but ONLY if the agent's contract permits that tool. Records to the tool
 * index either way (a refused/failed pull is an edge case worth learning).
 */
async function pull(agentId, tool, args = {}) {
  // §1.1 scope gate — map pull tools to the contract tool names.
  const scopeMap = { get_schema: 'read_file', get_contract: 'read_file', get_chunk: 'read_file', get_seam: 'read_file', query_capability: 'read_file' };
  const needs = scopeMap[tool] || tool;
  if (!agentCan(agentId, needs) && !agentCan(agentId, tool)) {
    const miss = { ok: false, reason: `agent "${agentId}" is not scoped for "${tool}"`, scoped: false };
    _record(agentId, tool, args.intent || tool, miss);
    return miss;
  }

  let result;
  try {
    switch (tool) {
      case 'get_schema':      result = _getSchema(args.name); break;
      case 'get_chunk':       result = await _getChunk(args); break;
      case 'query_capability':result = _queryCapability(args.intent || args.query); break;
      case 'get_contract':    result = _getContract(args.seamId || args.agentId); break;
      case 'get_seam':        result = _getSeam(args.id); break;
      default: result = { ok: false, reason: `unknown pull tool "${tool}"` };
    }
  } catch (e) { result = { ok: false, reason: e.message }; }

  _record(agentId, tool, args.intent || tool, result);
  return result;
}

function _getSchema(name) {
  const sr = require('./schema-registry');
  const s = sr.getSchema ? sr.getSchema(name) : null;
  return s ? { ok: true, schema: s } : { ok: false, reason: `no schema for "${name}"`, available: (sr.listSchemas ? sr.listSchemas() : []).slice(0, 20) };
}

async function _getChunk(args) {
  const cs = require('./chunk-service');
  if (args.input != null) { const chunks = cs.chunk(args.input, args.opts || {}); return { ok: true, chunks, count: Array.isArray(chunks) ? chunks.length : 1 }; }
  if (args.id != null && Array.isArray(args.from)) { const chunks = cs.chunk(args.from.join('\n')); const one = chunks[args.id]; return one ? { ok: true, chunk: one, id: args.id } : { ok: false, reason: `no chunk id ${args.id}` }; }
  return { ok: false, reason: 'get_chunk needs input or (id + from)' };
}

function _queryCapability(intent) {
  try {
    const cap = require('../loom/scanners/capability-map');
    const decls = cap.loadAll();
    const hits = decls.filter(c => (c.id + ' ' + (c.name || '') + ' ' + (c.description || '')).toLowerCase().includes(String(intent || '').toLowerCase())).slice(0, 10);
    return { ok: true, matches: hits.map(c => ({ id: c.id, name: c.name, route: `${c.route.method} ${c.route.path}` })), total: hits.length };
  } catch (e) { return { ok: false, reason: e.message }; }
}

function _getContract(id) {
  // agent contract (from P1) or a seam contract.
  try { const ac = require('./gemini-toolbox/agent-contracts'); const c = ac.getContract(id); if (c && !c.error) return { ok: true, contract: c }; } catch (_) {}
  return _getSeam(id);
}

function _getSeam(id) {
  try {
    const fs = require('fs'), path = require('path');
    const seamDir = path.resolve(__dirname, 'seam');
    const files = fs.readdirSync(seamDir).filter(f => f.endsWith('.js'));
    return { ok: true, seamModules: files, note: `seam id "${id}" — seam contracts are built via lib/seam/build-contract; ${files.length} seam modules available` };
  } catch (e) { return { ok: false, reason: e.message }; }
}

function listPullTools() { return ['get_schema', 'get_chunk', 'query_capability', 'get_contract', 'get_seam']; }

module.exports = { pull, listPullTools, MODULE_ID: 'agent-pull', VERSION: '1.0.0' };
