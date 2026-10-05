'use strict';
/**
 * lib/agent-tools/tools/idearium/code.js — the codebase tools: understand, change and check any repo idearium holds.
 * comp_id: nexus.lib.agent-tools.tools.idearium.code
 * UUID: nexus-agent-tools-idearium-code-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB5 (docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec). James: "I want idearium solid for building
 * codebases … Agent tools completely solid, all context is easy to search and understand for each chunk."
 *
 * Each tool has one job and answers in a compact shape a small model can read; every answer that leaves something
 * out says what and how to get it. All of them call idearium's /api/repos/:uuid/code/* (idearium/repo/code-api.js).
 *
 *   understand   code_map (overview / tree) · code_search (ranked, by meaning) · code_grep (exact text / regex)
 *                code_chunk (a chunk's card + its code) · code_read (lines of a file, or its outline) ·
 *                code_refs (where a name is defined and what uses it)
 *   change       code_edit (exact replace · line range · whole chunk) · code_write (create / replace / delete / move)
 *                code_batch (several operations across files, all or nothing)
 *   check        code_check (syntax of changed files, and the tests that use them) · code_changes (your proposals and
 *                applied changes; withdraw or revert)
 *
 * Writes are .injects (lib/repo-inject.js): in review mode they are proposed and a later edit to the same file stacks
 * onto the proposal; in auto mode they apply at once, all-or-nothing per call; on a Nexus repo James approves them.
 * An edit that would introduce a syntax error is refused unless force:true.
 *
 * repoUuid: taken from the run's context (a repo agent's own repo) unless given.
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const IDEARIUM_HOST = process.env.IDEARIUM_HOST || '127.0.0.1';
const IDEARIUM_PORT = parseInt(process.env.IDEARIUM_PORT || '4800', 10);

function _call(method, path, body = null, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: process.env.IDEARIUM_HOST || IDEARIUM_HOST, port: parseInt(process.env.IDEARIUM_PORT || String(IDEARIUM_PORT), 10), path, method, timeout: timeoutMs,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const b = Buffer.concat(parts).toString('utf8');
        let j = null; try { j = JSON.parse(b); } catch (_) {}
        if (!j) return resolve({ error: `idearium answered ${res.statusCode} with no JSON` });
        if (res.statusCode >= 200 && res.statusCode < 300) { delete j.ok; return resolve(j); }
        resolve({ error: j.error || `idearium answered ${res.statusCode}`, ...(j.detail && typeof j.detail === 'object' ? j.detail : {}) });
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
const NO_REPO = { error: 'no repo — these tools work inside a repo agent (or pass repoUuid)' };
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const REPO_PROP = { repoUuid: { type: 'string', description: 'optional — the repo agent\'s own repo is used by default' } };
const at = (h) => `${h.file}:${h.range ? `${h.range.start_line}-${h.range.end_line}` : h.lines || ''}`;

function _get(op, params) {
  return async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    return _call('GET', `/api/repos/${repo}/code/${op}?${qs(params(args))}`);
  };
}
function _post(op, body, timeoutMs) {
  return async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    return _call('POST', `/api/repos/${repo}/code/${op}`, { ...body(args), _tool: `code_${op}` }, timeoutMs);
  };
}
// the write result, compact: status, per file its diff and diagnostics, and what to do next
function _writeView(r) {
  if (r.error) return r;
  if (r.changed === false) return { changed: false, note: r.note };
  return { status: r.status || (r.dryRun ? 'dry run — nothing written' : null), mode: r.mode, ...(r.note ? { note: r.note } : {}), ...(r.warning ? { warning: r.warning } : {}),
    files: (r.files || []).map(f => ({ path: f.path, ...(f.created ? { created: true } : {}), ...(f.deleted ? { deleted: true } : {}), ...(f.hash ? { hash: f.hash.slice(0, 12) } : {}),
      ...(f.inject ? { inject: f.inject } : {}), ...(f.stacked ? { stacked: true } : {}), diff: f.diff, ...(f.diagnostics ? { diagnostics: f.diagnostics } : {}) })),
    ...(r.ops && r.ops.some(o => o.mayReference) ? { mayReference: r.ops.flatMap(o => o.mayReference || []) } : {}),
    ...(r.ops && r.ops.some(o => o.edits && o.edits.some(e => e.matchedBy)) ? { matchedLoosely: r.ops.flatMap(o => (o.edits || []).filter(e => e.matchedBy).map(e => `edit ${e.edit}: ${e.matchedBy}`)) } : {}),
    ...(r.next ? { next: r.next } : {}) };
}

const code_map = {
  name: toolName('idearium', 'code_map'),
  description: 'Start here. The repo in one answer: size, languages, top folders, the most-used files, entry points, tests, and how to navigate. With path (and depth) it lists that folder instead.',
  parameters: { type: 'object', properties: { path: { type: 'string', description: 'optional folder to list (e.g. "src/api")' }, depth: { type: 'number', description: 'folder depth for a listing (default 2)' }, ...REPO_PROP } },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    if (args.path != null && args.path !== '') return _call('GET', `/api/repos/${repo}/code/tree?${qs({ path: args.path, depth: args.depth })}`);
    return _call('GET', `/api/repos/${repo}/code/overview`);
  },
};

const code_search = {
  name: toolName('idearium', 'code_search'),
  description: 'Find the code that does something, by meaning or by name ("where uploads are retried", "parseConfig"). Ranked chunks with id, file:lines, a one-line summary and the lines that matched. Then code_chunk <id> to read one.',
  parameters: { type: 'object', properties: {
    query: { type: 'string', description: 'what the code does, or a name' },
    path: { type: 'string', description: 'optional: only under this folder or glob (e.g. "src/**/*.ts")' },
    kind: { type: 'string', description: 'optional: function | method | class | test | route | case | block …' },
    limit: { type: 'number', description: 'how many (default 8, max 50)' }, ...REPO_PROP }, required: ['query'] },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const r = await _call('GET', `/api/repos/${repo}/code/search?${qs({ q: args.query, path: args.path, kind: args.kind, limit: args.limit || 8 })}`);
    if (r.error) return r;
    return { query: r.query, results: (r.hits || []).map(h => ({ id: h.id, at: at(h), kind: h.kind, name: h.name, summary: h.summary, lines: (h.snippet || []).map(s => `${s.line}: ${s.text}`) })),
      ...(r.more ? { more: r.more } : {}), ...(r.tip ? { tip: r.tip } : {}), ...(r.warning ? { warning: r.warning } : {}) };
  },
};

const code_grep = {
  name: toolName('idearium', 'code_grep'),
  description: 'Exact text (or a regex) across the repo, line by line, with the chunk each line is in. Use for a string, an error message, an import path — anything you know verbatim.',
  parameters: { type: 'object', properties: {
    pattern: { type: 'string', description: 'the text to find (literal unless regex:true)' },
    regex: { type: 'boolean', description: 'treat pattern as a JavaScript regular expression' },
    caseSensitive: { type: 'boolean' }, wholeWord: { type: 'boolean' },
    path: { type: 'string', description: 'optional folder or glob' },
    context: { type: 'number', description: 'lines of context around each match (0-10)' },
    limit: { type: 'number', description: 'max matches (default 40)' }, ...REPO_PROP }, required: ['pattern'] },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const r = await _call('GET', `/api/repos/${repo}/code/grep?${qs({ pattern: args.pattern, regex: args.regex ? 1 : null, case: args.caseSensitive ? 1 : null, word: args.wholeWord ? 1 : null, path: args.path, context: args.context, limit: args.limit || 40 })}`);
    if (r.error) return r;
    return { matches: (r.matches || []).map(m => ({ at: `${m.file}:${m.line}`, text: m.text, chunk: m.chunkId, ...(m.before ? { before: m.before, after: m.after } : {}) })),
      total: r.total, files: r.filesMatched, ...(r.more ? { more: r.more } : {}) };
  },
};

const code_chunk = {
  name: toolName('idearium', 'code_chunk'),
  description: 'One chunk, understood: its card (kind, name, signature, doc, summary, what it uses and what uses it — each with how that was found — its tests, the chunks around it) and its code with line numbers. Accepts a chunk id, path:line, path#Name or a name.',
  parameters: { type: 'object', properties: {
    id: { type: 'string', description: 'chunk id from code_search, or "src/x.js:120", or "src/x.js#parseConfig", or "RepoLayer.writeFile"' },
    code: { type: 'boolean', description: 'include the code (default true)' }, ...REPO_PROP }, required: ['id'] },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const r = await _call('GET', `/api/repos/${repo}/code/chunk?${qs({ id: args.id, code: args.code === false ? 0 : 1 })}`);
    if (r.error) return r;
    const c = r.card || {};
    const brief = (x) => (x ? `${x.id} ${x.file}:${x.lines} ${x.name || x.kind}` : null);
    return { id: c.id, at: `${c.file}:${c.lines}`, kind: c.kind, name: c.qualifiedName || c.name, signature: c.signature, doc: c.doc, summary: c.summary,
      exported: c.exported || undefined,
      uses: (c.uses || []).map(u => `${u.name} → ${u.chunkId} (${u.file}, ${u.basis})`), ...(c.usesTotal > (c.uses || []).length ? { usesMore: c.usesTotal - c.uses.length } : {}),
      usedBy: (c.usedBy || []).map(u => `${u.name || '?'} ${u.chunkId} (${u.file}, ${u.basis})`), ...(c.usedByTotal > (c.usedBy || []).length ? { usedByMore: c.usedByTotal - c.usedBy.length } : {}),
      tests: c.tests && c.tests.length ? c.tests : undefined, proof: r.proof || undefined,
      parent: brief(r.around && r.around.parent) || undefined, prev: brief(r.around && r.around.prev) || undefined, next: brief(r.around && r.around.next) || undefined,
      ...(r.stale ? { stale: r.stale } : {}), ...(r.pending ? { pending: r.pending } : {}),
      ...(r.text != null ? { code: r.text, ...(r.more ? { more: r.more } : {}) } : {}) };
  },
};

const code_read = {
  name: toolName('idearium', 'code_read'),
  description: 'Read a file with line numbers (up to 250 lines per call; says what is left), or outline:true for its chunks — each with id, lines, kind, name and summary. Shows your pending version of a file you proposed changes to. Returns hash for code_edit expectHash.',
  parameters: { type: 'object', properties: {
    path: { type: 'string', description: 'repo-relative file path' },
    start: { type: 'number' }, end: { type: 'number' },
    outline: { type: 'boolean', description: 'list the file\'s chunks instead of its text' }, ...REPO_PROP }, required: ['path'] },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    if (args.outline) {
      const r = await _call('GET', `/api/repos/${repo}/code/outline?${qs({ path: args.path })}`);
      if (r.error) return r;
      return { file: r.file, language: r.language, lines: r.lineCount, chunks: (r.chunks || []).map(c => `${'  '.repeat(c.depth || 0)}${c.id}  ${c.lines}  ${c.summary}`) };
    }
    const r = await _call('GET', `/api/repos/${repo}/code/read?${qs({ path: args.path, start: args.start, end: args.end })}`);
    if (r.error) return r;
    return { file: r.file, lines: `${r.start}-${r.end} of ${r.totalLines}`, hash: r.hash ? r.hash.slice(0, 12) : undefined, text: r.text,
      ...(r.more ? { more: r.more } : {}), ...(r.pending ? { pending: r.pending.note } : {}), ...(r.source ? { source: r.source } : {}) };
  },
};

const code_refs = {
  name: toolName('idearium', 'code_refs'),
  description: 'Where a name is defined, and every chunk that uses it (with how each use was found: import, same-file or by name). Use before renaming or changing a signature.',
  parameters: { type: 'object', properties: { name: { type: 'string', description: 'a function, class, method (Class.method) or variable name' }, ...REPO_PROP }, required: ['name'] },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const r = await _call('GET', `/api/repos/${repo}/code/definition?${qs({ name: args.name })}`);
    if (r.error) return r;
    return { name: r.name, definedIn: (r.definitions || []).map(d => `${d.id} ${d.file}:${d.lines} ${d.kind} ${d.name || ''}`.trim()),
      usedBy: (r.usedBy || []).map(u => `${u.name || '?'} ${u.chunkId} (${u.file}, ${u.basis})`), usedByTotal: r.usedByTotal, ...(r.note ? { note: r.note } : {}) };
  },
};

const code_edit = {
  name: toolName('idearium', 'code_edit'),
  description: 'Change part of a file. edits: [{ old, new }] replaces exact text (must be unique — add surrounding lines, or occurrence / replaceAll); [{ startLine, endLine, new }] replaces lines; [{ insertAfter, new }] inserts. Or chunk + content replaces a whole chunk. All edits in one call refer to the file as you last read it. Returns the diff and a syntax check; an edit that breaks syntax is refused unless force.',
  parameters: { type: 'object', properties: {
    path: { type: 'string', description: 'the file to edit' },
    edits: { type: 'array', description: 'one or more edits', items: { type: 'object', properties: {
      old: { type: 'string' }, new: { type: 'string' }, replaceAll: { type: 'boolean' }, occurrence: { type: 'number' },
      startLine: { type: 'number' }, endLine: { type: 'number' }, insertAfter: { type: 'number' }, insertBefore: { type: 'number' } } } },
    chunk: { type: 'string', description: 'instead of path+edits: a chunk id whose whole text becomes content' },
    content: { type: 'string', description: 'with chunk: the chunk\'s full new text' },
    expectHash: { type: 'string', description: 'optional: the hash code_read gave you — refused if the file changed since' },
    dryRun: { type: 'boolean', description: 'show the diff and check, write nothing' },
    force: { type: 'boolean', description: 'write even if it introduces a syntax error' }, ...REPO_PROP } },
  execute: async (args = {}, ctx) => {
    if (!args.chunk && !args.path) return { error: 'path (with edits) or chunk (with content) is required' };
    if (args.path && !args.chunk && (!Array.isArray(args.edits) || !args.edits.length)) {
      if (args.old != null || args.startLine != null || args.insertAfter != null) args = { ...args, edits: [{ old: args.old, new: args.new, startLine: args.startLine, endLine: args.endLine, insertAfter: args.insertAfter }] };
      // §CT6 — say what was sent wrong, not only what is wanted (his BL30 run sent changes:[[716,761],[…]] eleven times)
      else return { error: `edits is required: [{ "old": "exact text", "new": "replacement" }] or [{ "startLine": 716, "endLine": 761, "new": "replacement lines" }]${Object.keys(args).filter(k => !['path', 'repoUuid', 'dryRun', 'force', 'expectHash'].includes(k)).length ? ` — you sent ${Object.keys(args).filter(k => !['path', 'repoUuid', 'dryRun', 'force', 'expectHash'].includes(k)).map(k => `"${k}"`).join(', ')}, which code_edit does not read` : ''}` };
    }
    return _writeView(await _post('edit', (a) => ({ path: a.path, edits: a.edits, chunk: a.chunk, content: a.content, expectHash: a.expectHash, dryRun: !!a.dryRun, force: !!a.force }))(args, ctx));
  },
};

const code_write = {
  name: toolName('idearium', 'code_write'),
  description: 'Create a file (action "write", the default), replace one whole (overwrite:true), delete one (action "delete"), or move/rename one (action "move" with to). For a change to part of a file use code_edit.',
  parameters: { type: 'object', properties: {
    action: { type: 'string', enum: ['write', 'delete', 'move'] },
    path: { type: 'string', description: 'the file (for move: the current path)' },
    content: { type: 'string', description: 'write: the complete file' },
    to: { type: 'string', description: 'move: the new path' },
    overwrite: { type: 'boolean', description: 'write: replace an existing file whole' },
    dryRun: { type: 'boolean' }, force: { type: 'boolean' }, ...REPO_PROP }, required: ['path'] },
  execute: async (args = {}, ctx) => {
    const action = args.action || 'write';
    if (action === 'delete') return _writeView(await _post('delete', (a) => ({ path: a.path, dryRun: !!a.dryRun }))(args, ctx));
    if (action === 'move') {
      if (!args.to) return { error: 'to (the new path) is required for move' };
      return _writeView(await _post('move', (a) => ({ from: a.path, to: a.to, overwrite: !!a.overwrite, dryRun: !!a.dryRun }))(args, ctx));
    }
    if (typeof args.content !== 'string') return { error: 'content (the complete file) is required' };
    return _writeView(await _post('write', (a) => ({ path: a.path, content: a.content, overwrite: !!a.overwrite, dryRun: !!a.dryRun, force: !!a.force }))(args, ctx));
  },
};

const code_batch = {
  name: toolName('idearium', 'code_batch'),
  description: 'Several changes across files as ONE change: all are checked first and nothing is written if any fails. ops: [{ op:"edit", path, edits }, { op:"write", path, content, overwrite? }, { op:"delete", path }, { op:"move", from, to }]. Later ops see earlier ones.',
  parameters: { type: 'object', properties: {
    ops: { type: 'array', items: { type: 'object' }, description: 'the operations, in order (max 50)' },
    dryRun: { type: 'boolean' }, force: { type: 'boolean' }, ...REPO_PROP }, required: ['ops'] },
  execute: async (args = {}, ctx) => _writeView(await _post('batch', (a) => ({ ops: a.ops, dryRun: !!a.dryRun, force: !!a.force }), 120000)(args, ctx)),
};

const code_check = {
  name: toolName('idearium', 'code_check'),
  description: 'Check your work: the syntax of the given files (default: the files you changed last), and the tests that use them (tests:false to skip). passed:true only when every file parses and every test that ran passed; each failure comes with the tail of its output.',
  parameters: { type: 'object', properties: {
    paths: { type: 'array', items: { type: 'string' }, description: 'files to check (optional)' },
    tests: { type: 'boolean', description: 'also run the related tests (default true)' }, ...REPO_PROP } },
  // §CT6 0.39.352 — a model that names one file as `path` meant paths: [path] (the route already reads it so; this wrapper
  // dropped it, and his BL30 run failed code_check three times on it)
  execute: async (args = {}, ctx) => _post('check', (a) => ({ paths: Array.isArray(a.paths) ? a.paths : (typeof a.path === 'string' && a.path ? [a.path] : undefined), tests: a.tests !== false }), 400000)(args, ctx),
};

const code_changes = {
  name: toolName('idearium', 'code_changes'),
  description: 'Your changes to this repo: action "list" (default) shows proposals and applied changes; "revert" undoes an applied change; "withdraw" rejects your own pending proposal. Approving proposals is the person\'s job, not yours.',
  parameters: { type: 'object', properties: {
    action: { type: 'string', enum: ['list', 'revert', 'withdraw'] },
    inject: { type: 'string', description: 'revert / withdraw: the inject id' },
    status: { type: 'string', description: 'list: proposed | applied | reverted | rejected' }, ...REPO_PROP } },
  execute: async (args = {}, ctx) => {
    const repo = _repo(args, ctx); if (!repo) return NO_REPO;
    const action = args.action || 'list';
    if (action === 'list') return _call('GET', `/api/repos/${repo}/code/changes?${qs({ status: args.status })}`);
    if (!args.inject || !/^[\w-]+$/.test(args.inject)) return { error: 'inject (the id from list) is required' };
    if (action === 'revert') return _call('POST', `/api/repos/${repo}/injects/${args.inject}/revert`, {});
    if (action === 'withdraw') return _call('POST', `/api/repos/${repo}/injects/${args.inject}/reject`, { reason: 'withdrawn by the agent' });
    return { error: `unknown action "${action}" — list | revert | withdraw` };
  },
};

const ALL = [code_map, code_search, code_grep, code_chunk, code_read, code_refs, code_edit, code_write, code_batch, code_check, code_changes];
const CODE_TOOLS = Object.freeze(ALL.map(t => t.name));
const READ_ONLY = Object.freeze([code_map, code_search, code_grep, code_chunk, code_read, code_refs].map(t => t.name));
// the ones a repo agent's first message lists (harness scope) — enough to find, understand, change and check
const LISTED = Object.freeze([code_map, code_search, code_chunk, code_read, code_edit, code_write, code_check].map(t => t.name));

module.exports = { ALL, CODE_TOOLS, READ_ONLY, LISTED, code_map, code_search, code_grep, code_chunk, code_read, code_refs, code_edit, code_write, code_batch, code_check, code_changes, _call };
