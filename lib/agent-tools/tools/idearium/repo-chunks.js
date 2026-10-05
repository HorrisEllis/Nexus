'use strict';
/**
 * lib/agent-tools/tools/idearium/repo-chunks.js -- idearium.repo_chunks.tool
 *
 * The compartment agent's way to read a repo's CHUNK NODES for context, when it
 * needs them, instead of being handed the whole repo or guessing from the persona.
 * James (2026-09-21): "the agent needs to be able to query the chunk nodes to use
 * for context when needed."
 *
 * Wraps three real idearium routes (idearium/api/index.js), unchanged:
 *   action:"search"  GET /api/repos/:uuid/search?q=      symbols/files matching a query
 *   action:"list"    GET /api/repos/:uuid/chunks?file=    chunk ADDRESSES (id/file/range/symbols)
 *   action:"get"     GET /api/repos/:uuid/chunks/:chunkId the real TEXT of one chunk
 *   action:"proof"   GET /api/repos/:uuid/proof?chunk=|file=|state=  did a PASSING test actually run it (stale flag included)
 * The order matters: search or list to find the address, get to read only that
 * chunk (the "minimum sufficient context", not the file, not the repo).
 *
 * HONEST LIMIT: repoUuid is a parameter. The persona names the agent's own repo
 * uuid, but nothing here can tell which agent is calling, so a model that passes a
 * different uuid will read a different repo. Same class of limit as toolScope not
 * being enforced on the dispatch path (lib/repo-agent.js status().toolScopeEnforced).
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const IDEARIUM_HOST = process.env.IDEARIUM_HOST || '127.0.0.1';
const IDEARIUM_PORT = parseInt(process.env.IDEARIUM_PORT || '4800', 10);
const MAX_CHUNK_CHARS = parseInt(process.env.IDEARIUM_TOOL_MAX_CHUNK_CHARS || '12000', 10);

function _get(path) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: IDEARIUM_HOST, port: IDEARIUM_PORT, path, method: 'GET', timeout: 8000 }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const b = Buffer.concat(parts).toString('utf8'); // whole body, then decode: a multi-byte char can span reads
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(b) }); }
        catch (e) { resolve({ ok: false, status: res.statusCode, error: `bad JSON from idearium: ${e.message}` }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'idearium request timed out' }); });
    req.end();
  });
}

const enc = encodeURIComponent;

// §SB33 0.39.325 — James: "also running the pipeline the agent should be able to do." POST, with the pipeline's own
// time: a whole repo is read, chunked and verified, so the 8 s read timeout above would cut it off.
function _post(path, timeoutMs = 600000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: IDEARIUM_HOST, port: IDEARIUM_PORT, path, method: 'POST', timeout: timeoutMs, headers: { 'content-type': 'application/json' } }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const b = Buffer.concat(parts).toString('utf8');
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(b) }); }
        catch (e) { resolve({ ok: false, status: res.statusCode, error: `bad JSON from idearium: ${e.message}` }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'the import pipeline did not answer in time' }); });
    req.end('{}');
  });
}

module.exports = {
  name: toolName('idearium', 'repo_chunks'),
  description:
    'Read a repository\'s chunk nodes for context. action:"search" (query) finds matching symbols/files; ' +
    'action:"list" (optional file) lists chunk addresses; action:"get" (chunkId) returns the text of ONE chunk; ' +
    'action:"proof" (chunkId, file or state) says whether a passing test actually ran that code. ' +
    'action:"reindex" runs this project\'s import pipeline (read, chunk, verify) — do it yourself when the index is missing or stale. ' +
    'Search or list first, then get only the chunk you need. repoUuid is the project this agent belongs to. ' +
    '(0.39.273: idearium.code_search.tool searches the code itself by meaning, and idearium.code_chunk.tool gives a chunk\'s card.)',
  parameters: {
    type: 'object',
    properties: {
      repoUuid: { type: 'string', description: 'the repository uuid (named in your persona)' },
      action: { type: 'string', enum: ['search', 'list', 'get', 'proof', 'reindex'], description: 'search | list | get | proof | reindex' },
      query: { type: 'string', description: 'required for action:"search"' },
      file: { type: 'string', description: 'optional path filter for action:"list" or "proof"' },
      state: { type: 'string', description: 'optional for action:"proof": passed | failed | none | no_tests | unsupported | test' },
      chunkId: { type: 'string', description: 'required for action:"get"' },
    },
    required: ['repoUuid', 'action'],
  },
  execute: async ({ repoUuid, action, query, file, chunkId, state } = {}) => {
    if (!repoUuid || !/^[A-Za-z0-9._-]+$/.test(repoUuid)) return { error: 'repoUuid is required (letters, digits, dot, dash, underscore)' };
    let path;
    if (action === 'search') {
      if (!query) return { error: 'query is required for action:"search"' };
      path = `/api/repos/${repoUuid}/search?q=${enc(query)}`;
    } else if (action === 'list') {
      path = `/api/repos/${repoUuid}/chunks${file ? `?file=${enc(file)}` : ''}`;
    } else if (action === 'get') {
      if (!chunkId || !/^[A-Za-z0-9._:-]+$/.test(chunkId)) return { error: 'chunkId is required for action:"get"' };
      path = `/api/repos/${repoUuid}/chunks/${enc(chunkId)}`;
    } else if (action === 'proof') {
      const qs = [chunkId ? `chunk=${enc(chunkId)}` : '', file ? `file=${enc(file)}` : '', state ? `state=${enc(state)}` : ''].filter(Boolean).join('&');
      path = `/api/repos/${repoUuid}/proof${qs ? `?${qs}` : ''}`;
    } else if (action === 'reindex') {
      const r = await _post(`/api/repos/${repoUuid}/reindex`);
      if (!r.ok) return { error: (r.body && r.body.error) || r.error || `idearium returned status ${r.status}` };
      const p = (r.body && r.body.pipeline) || {};
      return { ok: true, state: p.state || null, files: p.files ? (p.files.count ?? p.files) : null, chunks: p.chunks ? (p.chunks.count ?? p.chunks) : null, error: p.error || null };
    } else {
      return { error: `unknown action "${action}" -- must be "search", "list", "get", "proof" or "reindex"` };
    }
    const r = await _get(path);
    if (!r.ok) return { error: (r.body && r.body.error) || r.error || `idearium returned status ${r.status}` };
    const body = r.body;
    // a chunk's text is capped, and says so, rather than flooding the model's context
    if (action === 'get') {
      const txt = body.content ?? body.text ?? (body.chunk && (body.chunk.content ?? body.chunk.text));
      if (typeof txt === 'string' && txt.length > MAX_CHUNK_CHARS) {
        const cut = { ...body };
        for (const k of ['content', 'text']) if (typeof cut[k] === 'string') cut[k] = cut[k].slice(0, MAX_CHUNK_CHARS);
        if (cut.chunk) for (const k of ['content', 'text']) if (typeof cut.chunk[k] === 'string') cut.chunk = { ...cut.chunk, [k]: cut.chunk[k].slice(0, MAX_CHUNK_CHARS) };
        cut.truncated = { at: MAX_CHUNK_CHARS, originalChars: txt.length };
        return cut;
      }
    }
    return body;
  },
};
