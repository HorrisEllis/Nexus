'use strict';
/**
 * lib/adapters/documents.js — the documents adapter (AD4, sliced in 0.60.286 FA1): markdown and specs as components — a unit is a
 * section (a heading), a dependency is a file the document names (a link, a `path` in backticks, a bare path with an extension).
 * comp_id: nexus.lib.adapters.documents
 * UUID: nexus-lib-adapters-documents-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-ADAPTERS · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA1
 *
 * James, 2026-10-29: "convert mds, hardcoded phasemaps" — the converter (lib/project-convert.js) reads a document's sections and the
 * files it names through this adapter, so the same reading serves the spine (a document's references are its wires).
 */

const MODULE_ID = 'nexus.lib.adapters.documents';
const VERSION = '1.0.0';
const FILE_EXT = 'js|cjs|mjs|ts|tsx|jsx|json|md|spec|eg|html|css|py|sh|yml|yaml|toml|phase|graph';
const PATH_RE = new RegExp(`(?:^|[\\s(\`'"\\[])((?:\\.{1,2}\\/)?[\\w@.-]+(?:\\/[\\w@.-]+)*\\.(?:${FILE_EXT}))(?=$|[\\s)\`'",:;\\]#])`, 'g');

function _isSpec(p, text) { return /\.spec$/i.test(p || '') || /^\s*spec:\s*$/m.test(String(text || '').split('\n').slice(0, 3).join('\n')); }

function parse(text, p = '') {
  if (!_isSpec(p, text)) return { verdict: String(text || '').includes('\u0000') ? 'fail' : 'pass', ...(String(text || '').includes('\u0000') ? { error: 'binary content' } : {}) };
  try { require('js-yaml').load(String(text || '')); return { verdict: 'pass' }; }
  catch (e) { return { verdict: 'fail', error: String(e.message).split('\n')[0] }; }
}

/** units(text, path) → markdown sections (# … ######, fenced code skipped); a spec's top-level keys and its module ids */
function units(text, p = '') {
  const lines = String(text || '').split('\n');
  const out = [];
  if (_isSpec(p, text) && !/\.md$/i.test(p)) {
    for (let i = 0; i < lines.length; i++) {
      const m = /^(  ?)([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]); if (m && m[1].length === 2) out.push({ kind: 'key', name: m[2], names: [m[2]], start: i + 1, end: i + 1, section: null, exported: false });
      const mod = /^\s*-\s*id:\s*(MOD-[\w-]+)/.exec(lines[i]); if (mod) out.push({ kind: 'module', name: mod[1], names: [mod[1]], start: i + 1, end: i + 1, section: 'modules', exported: true });
    }
    for (let k = 0; k < out.length; k++) if (out[k].kind === 'key') { const nx = out.slice(k + 1).find(u => u.kind === 'key'); out[k].end = nx ? nx.start - 1 : lines.length; }
    return out;
  }
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = /^\s*(```|~~~)/.exec(l); if (f) { fence = fence === f[1] ? null : (fence || f[1]); continue; }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) out.push({ kind: 'section', level: h[1].length, name: h[2].trim(), names: [h[2].trim()], start: i + 1, end: lines.length, section: null, exported: true });
  }
  for (let k = 0; k < out.length; k++) { const nx = out.slice(k + 1).find(u => u.level <= out[k].level); out[k].end = nx ? nx.start - 1 : lines.length; }
  if (!out.length && lines.some(l => l.trim())) out.push({ kind: 'section', level: 0, name: '(untitled)', names: [], start: 1, end: lines.length, section: null, exported: false });
  return out;
}

/** symbols(text) → the section titles a document offers (what another document can link to) */
function symbols(text, p = '') { return units(text, p).map(u => u.name).filter(Boolean); }

/** dependencies(text) → every file the document names: markdown links, `paths`, bare paths with a known extension */
function dependencies(text) {
  const lines = String(text || '').split('\n');
  const out = []; const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; let m;
    const link = /\]\(([^)\s#]+)(?:#[^)]*)?\)/g;
    while ((m = link.exec(l))) { if (/^[a-z]+:/i.test(m[1])) continue; const k = `${m[1]}@${i}`; if (!seen.has(k)) { seen.add(k); out.push({ spec: m[1], kind: 'link', line: i + 1 }); } }
    PATH_RE.lastIndex = 0;
    while ((m = PATH_RE.exec(l))) { if (/^\d+(\.\d+)+$/.test(m[1]) || /^https?:/.test(m[1])) continue; const k = `${m[1]}@${i}`; if (!seen.has(k)) { seen.add(k); out.push({ spec: m[1], kind: 'reference', line: i + 1 }); } }
  }
  return out;
}

module.exports = {
  id: 'documents', language: 'markdown', MODULE_ID, VERSION,
  extensions: ['.md', '.markdown', '.spec'],
  sample: '# Title\n\nSee [the kernel](emerge-kernel.js) and `lib/x.js`.\n\n## Part\n\ntext\n',
  parse, units, symbols, dependencies,
};
