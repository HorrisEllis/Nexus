'use strict';
/**
 * orchestrator/lib/mcp-tools-tokensave.js
 *
 * Token-reduction MCP tools for NEXUS. These are all local filesystem reads —
 * no HTTP calls to running services — so they work even if Guardian/Cortex/etc.
 * aren't booted. Purpose: give Claude targeted, pre-filtered answers instead of
 * making it read whole files or walk the tree itself.
 *
 * Merge into orchestrator/lib/mcp-server.js:
 *
 *   const { TOOLS: TOKENSAVE_TOOLS } = require('./mcp-tools-tokensave');
 *   ...
 *   const TOOLS = [ ...existing tools..., ...TOKENSAVE_TOOLS ];
 *
 * (mcp-server.js currently builds TOOLS as a single array literal — just spread
 * TOKENSAVE_TOOLS in at the end of it, or module.exports.TOOLS.push(...) after
 * requiring both if you'd rather not touch the literal.)
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Directories never worth walking into or reading from for exploration purposes.
const SKIP_DIRS = new Set(['.git', 'node_modules', '_archive', '.next', 'dist', 'build']);

function _safePath(rel) {
  const abs = path.resolve(REPO_ROOT, rel || '.');
  if (!abs.startsWith(REPO_ROOT)) throw new Error('Path escapes repo root — refused.');
  return abs;
}

function _walk(dir, maxDepth, depth = 0, out = []) {
  if (depth > maxDepth) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(REPO_ROOT, full);
    if (e.isDirectory()) {
      out.push({ type: 'dir', path: rel });
      _walk(full, maxDepth, depth + 1, out);
    } else {
      out.push({ type: 'file', path: rel });
    }
  }
  return out;
}

function _grepFile(full, rel, re, maxResults, results) {
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch (_) { return; }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && results.length < maxResults; i++) {
    if (re.test(lines[i])) {
      results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
    }
    re.lastIndex = 0; // reset for global regex reuse
  }
}

function _grepDir(dir, re, maxResults, results) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    if (results.length >= maxResults) return;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      _grepDir(full, re, maxResults, results);
    } else if (/\.(js|json|md|spec|yaml|yml|ts|jsx|tsx)$/i.test(e.name)) {
      _grepFile(full, path.relative(REPO_ROOT, full), re, maxResults, results);
    }
  }
}

const TOOLS = [

  // ── Grep ──────────────────────────────────────────────────────────────────
  {
    name: 'nexus_grep',
    description: 'Search the codebase for a pattern (regex) and return matching file:line: text results only — never full file contents. Use this before reading a whole file to find where something actually lives.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern (JS syntax)' },
        scope: { type: 'string', default: '.', description: 'Subdirectory to search, relative to repo root' },
        maxResults: { type: 'number', default: 50 },
        caseSensitive: { type: 'boolean', default: false },
      },
      required: ['pattern'],
    },
    handler: async ({ pattern, scope = '.', maxResults = 50, caseSensitive = false }) => {
      const dir = _safePath(scope);
      let re;
      try { re = new RegExp(pattern, caseSensitive ? 'g' : 'gi'); }
      catch (e) { return `Bad regex: ${e.message}`; }
      const results = [];
      _grepDir(dir, re, maxResults, results);
      if (!results.length) return `No matches for /${pattern}/ under ${scope}`;
      return `${results.length} match(es):\n` + results.join('\n');
    },
  },

  // ── Targeted file read ───────────────────────────────────────────────────
  {
    name: 'nexus_read_range',
    description: 'Read only a specific line range of a file, not the whole thing. Use after nexus_grep locates the relevant lines, or when you already know roughly where to look.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path relative to repo root' },
        startLine: { type: 'number', default: 1 },
        endLine: { type: 'number', default: 100 },
      },
      required: ['file'],
    },
    handler: async ({ file, startLine = 1, endLine = 100 }) => {
      const full = _safePath(file);
      let text;
      try { text = fs.readFileSync(full, 'utf8'); }
      catch (e) { return `Cannot read ${file}: ${e.message}`; }
      const lines = text.split('\n');
      const s = Math.max(1, startLine);
      const e = Math.min(lines.length, endLine);
      const slice = lines.slice(s - 1, e).map((l, i) => `${s + i}: ${l}`);
      return `${file} (lines ${s}-${e} of ${lines.length}):\n` + slice.join('\n');
    },
  },

  // ── File stat before reading ─────────────────────────────────────────────
  {
    name: 'nexus_file_stat',
    description: 'Get size and line count of a file WITHOUT reading its content. Call this before reading anything that might be large (version.js, blueprint-index.json, etc.) to decide whether to read the whole thing or use nexus_read_range / nexus_grep instead.',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string' } },
      required: ['file'],
    },
    handler: async ({ file }) => {
      const full = _safePath(file);
      let stat, lines = null;
      try { stat = fs.statSync(full); } catch (e) { return `Cannot stat ${file}: ${e.message}`; }
      if (stat.size < 2_000_000) {
        try { lines = fs.readFileSync(full, 'utf8').split('\n').length; } catch (_) {}
      }
      const kb = (stat.size / 1024).toFixed(1);
      return `${file}: ${kb} KB${lines ? `, ${lines} lines` : ' (too large to line-count cheaply)'}`
        + (stat.size > 50_000 ? '  ⚠ large — prefer nexus_grep / nexus_read_range over a full read' : '');
    },
  },

  // ── Bounded directory tree ───────────────────────────────────────────────
  {
    name: 'nexus_tree',
    description: 'List files/dirs under a path, bounded depth, skipping .git/node_modules/_archive automatically. Cheaper than reading a directory recursively yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', default: '.' },
        maxDepth: { type: 'number', default: 2 },
      },
    },
    handler: async ({ scope = '.', maxDepth = 2 }) => {
      const dir = _safePath(scope);
      const entries = _walk(dir, maxDepth);
      if (!entries.length) return `Nothing found under ${scope} (or it doesn't exist).`;
      return `${entries.length} entries under ${scope} (depth ${maxDepth}):\n`
        + entries.map(e => `${e.type === 'dir' ? '📁' : ''} ${e.path}`).join('\n');
    },
  },

  // ── Changelog tail (fixes the version.js mega-comment problem) ──────────
  {
    name: 'nexus_changelog_tail',
    description: 'Return only the last N version-log entries from lib/version.js instead of its full multi-thousand-line embedded comment history. Use this instead of reading lib/version.js directly for "what changed recently" questions.',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'number', default: 5 } },
    },
    handler: async ({ count = 5 }) => {
      const full = _safePath('lib/version.js');
      let text;
      try { text = fs.readFileSync(full, 'utf8'); }
      catch (e) { return `Cannot read lib/version.js: ${e.message}`; }
      // Entries are bracketed: // [0.39.112: ... ]
      const re = /\/\/\s*\[(\d+\.\d+\.\d+):([^]*?)\]\s*(?=\/\/\s*\[\d+\.\d+\.\d+:|$)/g;
      const entries = [];
      let m;
      while ((m = re.exec(text))) {
        entries.push({ version: m[1], text: m[2].trim() });
      }
      if (!entries.length) return 'No parseable changelog entries found.';
      const tail = entries.slice(-count).reverse();
      return tail.map(e => `v${e.version}:\n${e.text.slice(0, 500)}${e.text.length > 500 ? '…' : ''}`).join('\n\n---\n\n');
    },
  },

  // ── Loom registry query ──────────────────────────────────────────────────
  {
    name: 'nexus_loom_query',
    description: 'Query loom\'s component registry (loom/data/registry.json — currently ~1840 components) by namespace or name substring, instead of loading the whole registry file. Returns matching components only. For one component\'s wiring and the impact of changing it, use nexus_loom_impact.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Exact namespace, e.g. "guardian", "cortex", "loom"' },
        search: { type: 'string', description: 'Substring match against component id/name' },
        maxResults: { type: 'number', default: 30 },
      },
    },
    handler: async ({ namespace, search, maxResults = 30 }) => {
      const full = _safePath('loom/data/registry.json');
      let reg;
      try { reg = JSON.parse(fs.readFileSync(full, 'utf8')); }
      catch (e) { return `Cannot read loom registry: ${e.message}`; }
      const comps = reg.component || {};
      const rows = Object.values(comps).filter(c => {
        if (namespace && c.namespace !== namespace) return false;
        if (search && !`${c.id} ${c.name}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });
      if (!rows.length) return `No components matched (namespace=${namespace || '*'}, search=${search || '*'}).`;
      const shown = rows.slice(0, maxResults);
      const summary = `${rows.length} match(es)${rows.length > shown.length ? `, showing ${shown.length}` : ''}:\n`;
      return summary + shown.map(c => `${c.id}  (${c.namespace}, v${c.version || '?'})`).join('\n');
    },
  },

];

module.exports = { TOOLS };
