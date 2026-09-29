'use strict';
/**
 * lib/agent-tools/tools/loom/harness.js — the registry harness, as five tools a small model can hold in its head.
 * comp_id: nexus.lib.agent-tools.tools.loom.harness
 *
 * §0.39.266 — James: "it's meant to make small llms capable of building entire codebases regardless of the size
 * … thats way too much to inject when we have tools they can use to get context." A repo agent's first message
 * carries only the card of what the question names and these five tools; everything else it pulls:
 *
 *   loom.find.tool   where something is — a component (file), an event, a tool, words in the code, or a component
 *                    WARP already built (kind "stored", lib/component-store.js — 0.39.266 C4)
 *   loom.card.tool   one component's registry card: purpose, exports, requires/requiredBy, events in and out
 *                    (and who is on the other end), routes, covering tests — or one event's emitters/listeners
 *   loom.read.tool   a component's code, in line ranges
 *   loom.write.tool  a whole file → an .inject (on a nexus repo: James's approval prompt, then the apply gate)
 *   loom.test.tool   run the tests the registry says cover a component
 *
 * The registry (loom/data/registry.json + events.json for Nexus, the repo's graph for any other repo) is served by
 * idearium (/api/repos/:uuid/harness/*, lib/registry-harness.js). Tools are found here, in copilot's process,
 * where the tool registry lives — so "the browser" or "Clear Glass" is one find away instead of 49 descriptions
 * in every prompt.
 *
 * repoUuid: the run's context carries it (lib/repo-agent.js → copilot tool context); a model may also pass it.
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const IDEARIUM_HOST = process.env.IDEARIUM_HOST || '127.0.0.1';
const IDEARIUM_PORT = parseInt(process.env.IDEARIUM_PORT || '4800', 10);

function _call(method, path, body = null, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: IDEARIUM_HOST, port: IDEARIUM_PORT, path, method, timeout: timeoutMs,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const b = Buffer.concat(parts).toString('utf8');
        let j = null; try { j = JSON.parse(b); } catch (_) {}
        if (!j) return resolve({ error: `idearium answered ${res.statusCode} with no JSON` });
        resolve(res.statusCode >= 200 && res.statusCode < 300 ? j : { error: j.error || `idearium answered ${res.statusCode}` });
      });
    });
    req.on('error', (e) => resolve({ error: `idearium unreachable: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'idearium did not answer in time' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

function _repo(args, ctx) {
  const c = (ctx && ctx.context) || {};
  const fromAgent = c.agentId && /^repo-(.+)$/.exec(c.agentId);
  const id = args.repoUuid || c.repoUuid || (fromAgent && fromAgent[1]) || null;
  return id && /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}
const NO_REPO = { error: 'no repo — this tool works inside a repo agent (or pass repoUuid)' };
const strip = ({ ok, ...rest }) => rest;
const q = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function _localTools(query) {
  try {
    const AT = require('../../index.js');
    const C = require('../../tool-catalog.js');
    const text = String(query || '').toLowerCase();
    const words = text.split(/[\s._-]+/).filter(w => w.length > 1);
    const out = [];
    for (const t of AT.TOOLS.values()) {
      const g = C.groupOf ? C.groupOf(t.name) : null;
      const hay = `${t.name} ${t.description || ''} ${g ? `${g.id} ${g.title}` : ''}`.toLowerCase();
      if (!(hay.includes(text) || (words.length && words.every(w => hay.includes(w))))) continue;
      out.push({ kind: 'tool', id: t.name, why: `${g ? g.title + ' — ' : ''}${String(t.description || '').split(/(?<=\.)\s/)[0].slice(0, 140)}` });
    }
    return out;
  } catch (_) { return []; }
}

const find = {
  name: toolName('loom', 'find'),
  description: 'Find where something is: a file/component, an event, a tool (e.g. "browser", "clear glass", "versions"), words in the code, or a component already built for another project (kind "stored" — reuse it instead of writing it again). Returns ids to pass to loom.card.tool / loom.read.tool.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'what to look for — a file name, a path, an event name, a tool purpose, or words' },
      kind: { type: 'string', enum: ['any', 'component', 'event', 'tool', 'text', 'stored'], description: 'narrow it (default any); stored = the component store' },
      repoUuid: { type: 'string', description: 'optional — the repo agent\'s own repo is used by default' },
    },
    required: ['query'],
  },
  execute: async (args = {}, ctx) => {
    const kind = args.kind || 'any';
    const tools = (kind === 'any' || kind === 'tool') ? _localTools(args.query) : [];
    if (kind === 'tool') return { query: args.query, kind, results: tools.slice(0, 12) };
    const repo = _repo(args, ctx);
    if (!repo) return tools.length ? { query: args.query, kind, results: tools.slice(0, 15) } : NO_REPO;
    const r = await _call('GET', `/api/repos/${repo}/harness/find?${q({ q: args.query, kind: kind === 'any' ? 'any' : kind, limit: 8 })}`);   // 8: a small model reads every line of it
    if (r.error) return r;
    return { query: args.query, kind, results: [...(r.results || []), ...tools].slice(0, 8) };
  },
};

const card = {
  name: toolName('loom', 'card'),
  description: 'One component\'s card from the registry: purpose, exports, what it requires and what requires it, events it emits/hears and who is on the other end, routes, covering tests. Or pass event for who emits and hears one event.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'a component id or file path from loom.find.tool (or store:<id>@<version>)' },
      event: { type: 'string', description: 'instead of id: an event name' },
      repoUuid: { type: 'string', description: 'optional' },
    },
  },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    if (!args.id && !args.event) return { error: 'id or event is required' };
    const r = await _call('GET', `/api/repos/${repo}/harness/card?${q({ id: args.id, event: args.event })}`);
    return r.error ? r : strip(r);
  },
};

const read = {
  name: toolName('loom', 'read'),
  description: 'Read a component\'s code with line numbers, a range at a time (up to 200 lines). Says which lines are left.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'a component id or file path' },
      start: { type: 'number', description: 'first line (default 1)' },
      end: { type: 'number', description: 'last line (optional)' },
      repoUuid: { type: 'string', description: 'optional' },
    },
    required: ['id'],
  },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const r = await _call('GET', `/api/repos/${repo}/harness/read?${q({ id: args.id, start: args.start, end: args.end })}`);
    return r.error ? r : strip(r);
  },
};

const write = {
  name: toolName('loom', 'write'),
  description: 'Write a whole file (new or replacing). It is proposed as an .inject; on a Nexus repo James approves it before it reaches the live tree. Read the file first; send its FULL new content.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'the file path (repo-relative; for Nexus, relative to the Nexus root)' },
      content: { type: 'string', description: 'the complete file' },
      repoUuid: { type: 'string', description: 'optional' },
    },
    required: ['path', 'content'],
  },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const r = await _call('POST', `/api/repos/${repo}/harness/write`, { path: args.path, content: args.content });
    return r.error ? r : strip(r);
  },
};

const test = {
  name: toolName('loom', 'test'),
  description: 'Run the tests the registry says cover a component (up to 3). Returns pass/fail and the tail of each output.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'a component id or file path' },
      repoUuid: { type: 'string', description: 'optional' },
    },
    required: ['id'],
  },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const r = await _call('POST', `/api/repos/${repo}/harness/test`, { id: args.id }, 400000);
    return r.error ? r : strip(r);
  },
};

const HARNESS_TOOLS = Object.freeze([find.name, card.name, read.name, write.name, test.name]);

module.exports = { find, card, read, write, test, HARNESS_TOOLS };
