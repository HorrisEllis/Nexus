'use strict';
/**
 * lib/agent-tools/tools/query/search-files.js — search_files tool
 * UUID: nexus-agent-tools-search-files-v1-0000-2026-0818-jamesbrooks-001
 *
 * §BUILT 2026-08-18 — James: "query for a file or keyword." Checked
 * first, not assumed missing: file_tree.js lists directory structure by
 * NAME, agent-chat-search.js searches conversation history, neither
 * searches real file CONTENT for a keyword. Grepped all of lib/agent-
 * tools/tools/query/ directly — genuinely missing.
 *
 * Same real safety pattern as file-tree.js/read-file.js, reused
 * verbatim, not re-derived: real path resolution + root-containment
 * check, not a regex strip.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MAX_FILES_SCANNED = 3000;
const MAX_MATCHES = 200;
const MAX_FILE_BYTES = 2_000_000; // skip anything absurdly large rather than read it whole into memory
const EXCLUDES = new Set(['.nex', '.cos-wal', 'node_modules', '.git', '__pycache__', '.venv', 'venv', 'data']);

function _safeResolve(requestedPath) {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath || '.');
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) return null;
  return resolved;
}

function _walkFiles(absDir, relDir, out, scannedCount) {
  if (out.length >= MAX_MATCHES || scannedCount.n >= MAX_FILES_SCANNED) return;
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); }
  catch (_) { return; }
  for (const ent of entries) {
    if (EXCLUDES.has(ent.name)) continue;
    if (out.length >= MAX_MATCHES || scannedCount.n >= MAX_FILES_SCANNED) return;
    const relPath = relDir ? `${relDir}/${ent.name}` : ent.name;
    const absPath = path.join(absDir, ent.name);
    if (ent.isDirectory()) { _walkFiles(absPath, relPath, out, scannedCount); continue; }
    out.push({ absPath, relPath });
    scannedCount.n++;
  }
}

module.exports = {
  name: 'search_files',
  description:
    'Search real file content for a keyword, or real file names by pattern. Returns matching files with the ' +
    'matching line(s) for a content search, or just paths for a filename search. Bounded (max 3000 files ' +
    'scanned, max 200 matches) and root-contained — cannot read outside the project.',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: 'a real string to search file CONTENT for (case-insensitive)' },
      filenamePattern: { type: 'string', description: 'a real substring to match against file NAMES instead of content' },
      dir: { type: 'string', description: 'optional, real subdirectory to scope the search to; defaults to the whole project' },
      where: require('../../tool-root.js').WHERE_PARAM,
    },
  },
  // 0.39.257 — a project agent's run searches its repo by default (lib/agent-tools/tool-root.js).
  async execute({ keyword, filenamePattern, dir, where } = {}, opts = {}) {
    if (!keyword && !filenamePattern) return { error: 'search_files needs either keyword or filenamePattern' };
    const TR = require('../../tool-root.js');
    const r = TR.rootFor({ where }, opts);
    if (r.error) return { error: r.error };
    const base = r.root === PROJECT_ROOT ? PROJECT_ROOT : r.root;
    const root = base === PROJECT_ROOT ? _safeResolve(dir) : TR.safeResolve(base, dir);
    if (!root) return { error: `dir resolves outside the ${r.where} root — refused` };
    if (!fs.existsSync(root)) return { error: `real path not found: ${dir || '.'}` };

    const files = [];
    _walkFiles(root, path.relative(base, root), files, { n: 0 });

    const matches = [];
    for (const f of files) {
      if (matches.length >= MAX_MATCHES) break;
      if (filenamePattern && !f.relPath.toLowerCase().includes(filenamePattern.toLowerCase())) continue;
      if (keyword) {
        let stat;
        try { stat = fs.statSync(f.absPath); } catch (_) { continue; }
        if (stat.size > MAX_FILE_BYTES) continue;
        let content;
        try { content = fs.readFileSync(f.absPath, 'utf8'); } catch (_) { continue; } // real binary/unreadable file — skip, not an error
        const lower = content.toLowerCase();
        const kwLower = keyword.toLowerCase();
        if (!lower.includes(kwLower)) continue;
        const lines = content.split('\n');
        const hitLines = lines
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => line.toLowerCase().includes(kwLower))
          .slice(0, 5)
          .map(({ line, i }) => ({ lineNumber: i + 1, text: line.trim().slice(0, 200) }));
        matches.push({ path: f.relPath, matchingLines: hitLines });
      } else {
        matches.push({ path: f.relPath });
      }
    }
    return { ok: true, where: r.where, filesScanned: files.length, truncated: files.length >= MAX_FILES_SCANNED, matchCount: matches.length, matches };
  },
};
