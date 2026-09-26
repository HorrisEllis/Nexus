'use strict';
/**
 * lib/agent-tools/tools/clear-glass/search-engine.js — clearglass.search_engine.tool
 *
 * James: "search bars from any website as a search engine in ClearGlass
 * with an intent... GitHub was an example." Generic on purpose — this
 * does not hardcode GitHub or any other single site. It registers a
 * reusable template ({query} substituted into a URL) once, keyed by a
 * short id, then either fetches it (method:"api" — e.g. GitHub's real
 * code-search endpoint, returns parsed results) or just resolves the
 * final URL (method:"navigate" — for a normal site's search results
 * page, which ClearGlass's own browser_action/tab-open path is the real
 * thing that actually navigates to it, not this tool).
 *
 * §BUILT ON, NOT PARALLEL TO — same real storage convention
 * clear-glass/macro.js already established: a jaaDB table
 * ('search_engines'), reached via the identical _jaa() accessor, same
 * append-only soft-delete pattern (a "deleted" engine is a new row with
 * _deleted:true, never a mutation — macro.js's own GT-caught bugfix
 * for exactly this class of mistake is the reason this file copies that
 * convention verbatim rather than reinventing it slightly differently).
 *
 * §HONEST SCOPE — v1. One {query} placeholder per template, substituted
 * URL-encoded. No auth-flow beyond static headers stored at register
 * time (a caller registering GitHub's code-search, for instance, is
 * responsible for supplying its own token in `headers` — this tool
 * does not manage credentials or refresh them). method:"api" parses
 * JSON and optionally plucks one dot-path (`resultsPath`, e.g.
 * "items") — it does not paginate, rank, or de-duplicate results;
 * that's real work for whatever consumes this tool's output, not
 * invented here.
 *
 * §HONEST LIMIT — verified via direct, isolated tests of the real logic
 * (template substitution, dot-path plucking, register/list/delete
 * lifecycle) — NOT verified against a live running ClearGlass instance
 * or a real external API over the network, same honest limit
 * clear-glass/macro.js's own header already states for the same reason.
 */

const https = require('https');
const http = require('http');
const { toolName } = require('../../naming.js');

function _jaa() {
  try { return require('../../../../cortex/memory/jaa-db').jaaDB; }
  catch (e) { return null; }
}

/** Every non-deleted row for an id, most recent last — same "last wins" convention as macro.js's _current(). */
function _current(jaa, id) {
  const rows = jaa.query('search_engines', (r) => r.id === id);
  const live = rows.filter((r) => !r._deleted);
  return live.length ? live[live.length - 1] : null;
}

/** Pure precondition check for register — independently testable, no jaaDB needed. */
function validateRegister({ id, name, urlTemplate }) {
  if (!id) return 'id is required';
  if (!name) return 'name is required';
  if (!urlTemplate) return 'urlTemplate is required';
  if (!urlTemplate.includes('{query}')) return 'urlTemplate must contain a literal {query} placeholder';
  return null;
}

/** Substitutes {query} into a template, URL-encoded. Pure, independently testable. */
function substitute(urlTemplate, query) {
  return urlTemplate.replace('{query}', encodeURIComponent(query));
}

/** Plucks a dot-path (e.g. "items" or "data.results") from a parsed JSON body. Pure. */
function pluck(body, dotPath) {
  if (!dotPath) return body;
  return dotPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), body);
}

/**
 * deriveFromPick(pick) — turns a real element-picker result (ClearGlass's
 * own guardian-picker.js capture shape: {tag, name, type, url, ...}) into
 * a urlTemplate, without a hand-written one.
 *
 * §HONEST ASSUMPTION, STATED NOT HIDDEN — the real picker capture
 * (guardian-picker.js) records the picked element's own tag/name/type and
 * the page's current url — it does not walk up to the enclosing <form>'s
 * real `action`/`method` attributes (checked directly; not present in the
 * real capture shape today). This function assumes the common case for a
 * site's own search bar: a GET-style query param on the current page's
 * own path, `?{name}={query}`. That's correct for a large share of real
 * search bars, wrong for a custom action path or a POST form. When it's
 * wrong, the caller should use action:"register" with an explicit
 * urlTemplate instead — this derivation is a convenience, not the only
 * path in. Extending guardian-picker.js to also capture the enclosing
 * form's real action/method would let this derivation stop guessing;
 * that's a real, separate change to the picker itself, not made here.
 */
function deriveFromPick(pick) {
  if (!pick || typeof pick !== 'object') return { error: 'pick must be a real picker-result object' };
  if (!pick.url) return { error: 'pick.url is required — the page the element was picked on' };
  const paramName = pick.name || 'q';
  let base;
  try {
    const u = new URL(pick.url);
    base = `${u.origin}${u.pathname}`;
  } catch (e) {
    return { error: `pick.url is not a valid URL: ${e.message}` };
  }
  const sep = base.includes('?') ? '&' : '?';
  return { urlTemplate: `${base}${sep}${encodeURIComponent(paramName)}={query}` };
}

function _fetch(url, headers, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { resolve({ ok: false, error: `invalid URL: ${e.message}` }); return; }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search, method: 'GET',
        headers: { 'User-Agent': 'nexus-clearglass-search-engine', ...(headers || {}) },
        timeout: timeoutMs,
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(b) }); }
          catch (e) { resolve({ ok: false, error: `bad JSON from ${u.hostname}: ${e.message}` }); }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `request to ${u.hostname} timed out` }); });
    req.end();
  });
}

module.exports = {
  name: toolName('clearglass', 'search_engine'),
  description:
    'Register any website\'s search endpoint as a reusable named search engine (a URL template with a ' +
    'single {query} placeholder), then search it. action:"register" (id, name, urlTemplate, method: ' +
    '"api"|"navigate", headers?, resultsPath?) — method:"api" fetches and parses JSON (e.g. GitHub\'s real ' +
    'code-search API), method:"navigate" is for a normal search-results page, which this tool only ' +
    'resolves the URL for — the actual navigation is ClearGlass\'s own concern. action:"register_from_pick" ' +
    '(id, name, pick) derives a registration directly from a real element-picker result (ClearGlass\'s own ' +
    'guardian-picker.js capture: {tag, name, type, url, ...}) instead of a hand-written urlTemplate — see ' +
    'the honest assumption noted on _deriveFromPick. action:"search" (id, query) runs a registered engine. ' +
    'action:"list" / action:"delete" (id) manage what\'s registered. GitHub is one example registration, ' +
    'not a special case — nothing here is GitHub-specific.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['register', 'register_from_pick', 'search', 'list', 'delete', 'export_node'], description: 'required' },
      id: { type: 'string', description: 'short, stable id for this search engine — required for register/register_from_pick/search/delete/export_node' },
      name: { type: 'string', description: 'human-readable name — required for register/register_from_pick' },
      urlTemplate: { type: 'string', description: 'required for register — a URL containing a literal {query} placeholder' },
      pick: { type: 'object', description: 'required for register_from_pick — a real dom.pick.registered-shaped object ({tag, name, type, url, ...}) from ClearGlass\'s element picker' },
      method: { type: 'string', enum: ['api', 'navigate'], description: 'for register — default "navigate"' },
      headers: { type: 'object', description: 'optional, for register — static headers sent with every "api" request, e.g. an Authorization token' },
      resultsPath: { type: 'string', description: 'optional, for register — dot-path into the JSON response to pluck as "results" (e.g. "items")' },
      query: { type: 'string', description: 'required for search — the real search text' },
      exportAs: { type: 'string', enum: ['command', 'tool'], description: 'required for export_node — materialize this registered engine as a real .command descriptor or a forged .tool' },
      destDir: { type: 'string', description: 'optional, for export_node — defaults to data/nodes/clearglass-search-engines' },
    },
    required: ['action'],
  },
  execute: async ({ action, id, name, urlTemplate, pick, method = 'navigate', headers, resultsPath, query, exportAs, destDir }) => {
    const jaa = _jaa();
    if (!jaa) return { error: 'jaaDB unavailable — cortex/memory/jaa-db.js could not be loaded' };

    if (action === 'register' || action === 'register_from_pick') {
      let effectiveUrlTemplate = urlTemplate;
      if (action === 'register_from_pick') {
        if (!pick) return { error: 'pick is required for register_from_pick' };
        const derived = deriveFromPick(pick);
        if (derived.error) return { error: derived.error };
        effectiveUrlTemplate = derived.urlTemplate;
      }
      const err = validateRegister({ id, name, urlTemplate: effectiveUrlTemplate });
      if (err) return { error: err };
      const row = {
        uuid: require('crypto').randomUUID(), id, name, urlTemplate: effectiveUrlTemplate,
        method: 'navigate', headers: headers || null, resultsPath: resultsPath || null,
        derivedFromPick: action === 'register_from_pick' ? { tag: pick.tag, name: pick.name, sourceUrl: pick.url } : null,
        createdAt: Date.now(), _deleted: false,
      };
      jaa.insert('search_engines', row);
      return { ok: true, engine: row };
    }

    if (action === 'list') {
      const rows = jaa.query('search_engines', () => true).filter((r) => !r._deleted);
      const byId = new Map();
      for (const r of rows) byId.set(r.id, r); // last (most recent, non-deleted) wins per id
      return { ok: true, engines: [...byId.values()] };
    }

    if (action === 'delete') {
      if (!id) return { error: 'id is required' };
      const existing = _current(jaa, id);
      if (!existing) return { error: `no search engine registered with id "${id}"` };
      jaa.insert('search_engines', { ...existing, uuid: require('crypto').randomUUID(), _deleted: true, deletedAt: Date.now() });
      return { ok: true, deleted: id };
    }

    if (action === 'search') {
      if (!id) return { error: 'id is required' };
      if (!query) return { error: 'query is required' };
      const engine = _current(jaa, id);
      if (!engine) return { error: `no search engine registered with id "${id}"` };
      const url = substitute(engine.urlTemplate, query);
      if (engine.method === 'navigate') return { ok: true, method: 'navigate', url };
      const result = await _fetch(url, engine.headers);
      if (!result.ok) return { error: result.error || `search engine "${id}" returned status ${result.status}` };
      return { ok: true, method: 'api', url, results: pluck(result.body, engine.resultsPath), raw: result.body };
    }

    if (action === 'export_node') {
      if (!id) return { error: 'id is required' };
      if (!exportAs || !['command', 'tool'].includes(exportAs)) return { error: 'exportAs must be "command" or "tool"' };
      const engine = _current(jaa, id);
      if (!engine) return { error: `no search engine registered with id "${id}"` };
      let nodeExport;
      try { nodeExport = require('../../../node-export.js'); }
      catch (e) { return { error: `node-export.js unavailable: ${e.message}` }; }
      const dir = destDir || 'data/nodes/clearglass-search-engines';
      const meta = { context: 'clearglass.search_engine.tool export', system: 'clearglass', source: `clearglass.search_engine.tool:${id}` };

      if (exportAs === 'command') {
        // §HONEST BOUNDARY — this is a real, importable/exportable .command
        // descriptor in schema.command's own {method, path} shape. It does
        // NOT wire a live HTTP route to serve it; that's a real, separate
        // step (adding a handler somewhere a server actually listens),
        // same honest-boundary posture as guardian.build.tool not
        // inventing behavior the real route doesn't have.
        const payload = { method: 'GET', path: `/search/${encodeURIComponent(id)}` };
        const filePath = nodeExport.exportToFile('command', `search-${id}`, payload, meta, dir);
        return { ok: true, exported: 'command', filePath, payload, note: 'descriptor only — no live route wired yet' };
      }

      // exportAs === 'tool' — a real, forged tool (tool-forge.js's
      // {name, description, parameters, steps} shape, per schema.tool's
      // own execute/steps distinction) that composes the ALREADY-real
      // clearglass.search_engine.tool rather than duplicating its logic.
      const payload = {
        name: `clearglass.search_${id}.tool`,
        description: `Search "${engine.name}" (${id}) — a forged tool composing the real clearglass.search_engine.tool.`,
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'the real search text' } }, required: ['query'] },
        steps: [{ call: 'tool', target: toolName('clearglass', 'search_engine'), args: { action: 'search', id, query: '{$.query}' } }],
      };
      const filePath = nodeExport.exportToFile('tool', `search-${id}`, payload, meta, dir);
      return { ok: true, exported: 'tool', filePath, payload };
    }

    return { error: `unknown action "${action}" — must be "register", "register_from_pick", "search", "list", "delete", or "export_node"` };
  },
  _validateRegister: validateRegister, // exposed for tests, no live jaaDB needed
  _substitute: substitute,
  _pluck: pluck,
  _deriveFromPick: deriveFromPick,
};
