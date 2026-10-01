'use strict';
/**
 * lib/spec-library.js — a zip of specs → unique documents, sorted and converted, ready to become ideas.
 * comp_id: nexus.lib.spec-library
 * Version: 1.0.0 (0.39.290)
 *
 * James, 2026-10-01, sending 171 files of specs from the last six months: "my goal is to build these, eventually.
 * im, the idea guy" · "lets fucking do it. need a way to import these and convert them."
 *
 * Pure: no idearium, no network. idearium/api turns the result into ideas + specs (master phasemap IL1).
 *
 *   scan({ buf })            -> { docs, skipped, stats }  — every file read once; duplicates (same bytes) folded into
 *                               one doc that keeps EVERY path; zips inside the zip opened too (depth 2); a program
 *                               (.exe, .dll, .bat, .ps1 …) is listed in `skipped`, never read as a document.
 *   convert(doc)             -> { specText, bannerRe, dialect } — the dialect the document is written in, so the
 *                               spec-engine chunker splits it into its own sections (Markdown ## headings, the
 *                               `# BLOCK N —` banners, or the whole document) instead of one giant block.
 *   summaryOf(text)          -> the first real sentence (the idea's line).
 */

const path = require('path');
const crypto = require('crypto');

const TEXT_EXT = new Set(['.md', '.spec', '.txt', '.markdown', '.yaml', '.yml']);
const SCHEMA_EXT = new Set(['.json']);
const DIAGRAM_EXT = new Set(['.svg']);
const PAGE_EXT = new Set(['.html', '.htm']);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.css', '.sh']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp']);
const PROGRAM_EXT = new Set(['.exe', '.dll', '.bat', '.cmd', '.ps1', '.msi', '.com', '.scr', '.vbs', '.so', '.dylib', '.bin']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__MACOSX']);

// names a person keeps to themselves — imported, tagged personal, never pushed anywhere
const PERSONAL_RE = /working context|living[-_ ]document|ip[-_ ]claim|compendium|ideas[-_ ]log|focal[-_ ]point|dot[-_ ]map|journal|diary/i;
// the NEXUS lineage — specs whose systems already live in this repo
const NEXUS_RE = /\bnexus\b|guardian|idearium|versionium|cortex|orchestrator|genesis|\bseam\b|seam[-_ ]|\bforge\b|forge[-_ ]|causal|\bsnr\b|\bcfr\b|coreglass|architect|eravos|brainos|brain ?os|mastevos|urck|spec[-_ ]parser|spec[-_ ]validator|spec[-_ ]wizard|compiler|ui[-_ ]schema|hook\.schema|manifest[-_ ]mutation|emerge|session[-_ ]capture|tab[-_ ]sovereign|bridge|cerl|gtci|gtis|living architecture|cognition[-_ ]layer|memory[-_ ]layer|signal[-_ ]layer|meta[-_ ]layer|guardian[-_ ]layer|master[-_ ]index|system[-_ ]spec/i;

// stand-alone product lines James named — a spec that merely mentions NEXUS is still the product it describes
const PRODUCT_RE = /rheon|mastermind|trust[-_ ]mesh|eidolon|market[-_ ]pulse|moduleforge|module[-_ ]forge|codex|embodiment|affective|spatial|agnostic[-_ ]stack|\bess\b|cesl|seam[-_ ]lang|meta[-_ ]editor|living file system|void/i;
// a folder holding one of these is a PROJECT (one unit), not a pile of loose specs
const PROJECT_MARKERS = new Set(['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle']);

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function kindOf(name) {
  const ext = path.extname(name).toLowerCase();
  if (PROGRAM_EXT.has(ext)) return 'program';
  if (ext === '.zip') return 'archive';
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (TEXT_EXT.has(ext)) return 'spec';
  if (SCHEMA_EXT.has(ext)) return 'schema';
  if (DIAGRAM_EXT.has(ext)) return 'diagram';
  if (PAGE_EXT.has(ext)) return 'page';
  if (CODE_EXT.has(ext)) return 'code';
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'other';
}

/** docxText(buf) — the paragraphs of a Word document (word/document.xml), or null when it cannot be read. */
function docxText(buf) {
  try {
    const Zip = require('./zip.js');
    const e = new Zip(buf).getEntries().find(x => x.entryName === 'word/document.xml');
    if (!e) return null;
    const xml = e.getData().toString('utf8');
    return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (_) { return null; }
}

/** pageText(html) — the visible text of an HTML explainer (scripts and styles dropped). */
function pageText(html) {
  return String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

function titleOf(text, name) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const h = lines.find(l => /^#{1,3}\s+\S/.test(l) && !/^#\s*[═=─-]{4,}/.test(l));
  const raw = (h ? h.replace(/^#+\s*/, '') : '') || lines.find(l => /[A-Za-z]{3}/.test(l) && !/^[{<\/@*`|-]/.test(l)) || '';
  const clean = raw.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length >= 3 && clean.length <= 120 ? clean : path.basename(name).replace(/\.[^.]+$/, '');
}

// a title the document actually goes by: a Word document's first lines (it has no # headings — a "# 1. Download …" in
// a code sample is not its title), a native .spec's own `name:` (its first heading is "BLOCK 1 — META"), a schema's
// or a code file's own file name
function bestTitle(doc, text) {
  const stem = doc.name.replace(/\.[^.]+$/, '');
  if (doc.kind === 'schema' || doc.kind === 'code') return stem;
  if (doc.kind === 'docx' && text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const t = lines[0] && lines[0].length < 40 && lines[1] && lines[1].length < 60 ? `${lines[0]} — ${lines[1]}` : (lines[0] || stem);
    return t.length <= 120 ? t : stem;
  }
  const t = titleOf(text, doc.name);
  if (/^(BLOCK\s+\d|version\b|system\s*=)/i.test(t)) {
    const m = String(text || '').slice(0, 4000).match(/^\s*name:\s*["']?([^"'\n#]{3,80})/m);
    return m ? m[1].trim() : stem;
  }
  return t;
}

function versionOf(text, name) {
  const m = String(text || '').match(/(?:^|\n)\s*(?:\*\*)?version(?:\*\*)?\s*[:=]\s*\**\s*v?(\d+\.\d+(?:\.\d+)?[\w.-]*)/i)
    || String(name).match(/v(\d+[._]\d+(?:[._]\d+)?)/i);
  return m ? m[1].replace(/_/g, '.') : null;
}

function summaryOf(text) {
  for (const l of String(text || '').split('\n').map(x => x.trim())) {
    if (l.length < 50 || /^[#|`<{\-*=═─/]/.test(l) || /^\w+\s*:\s*\S+$/.test(l)) continue;
    const s = l.replace(/^>\s*/, '').replace(/[*_`]/g, '');
    const cut = s.match(/^(.{40,240}?[.!?])(\s|$)/);
    return (cut ? cut[1] : s.slice(0, 240)).trim();
  }
  return null;
}

function familyOf(doc) {
  // the document's OWN name and title — never the zip it travelled in (a RHEON spec inside "nexus-gate-….zip" is RHEON)
  const hay = `${doc.paths.map(p => path.basename(p.split('!/').pop())).join(' ')} ${doc.title || ''}`;
  if (PERSONAL_RE.test(hay)) return 'personal';
  if (doc.kind === 'diagram' || doc.kind === 'image') return 'diagram';
  if (PRODUCT_RE.test(hay)) return 'product';
  if (doc.kind === 'project') return 'product';
  if (NEXUS_RE.test(hay)) return 'nexus';
  return 'product';
}

/**
 * scan({ buf, name }) — read a zip of specs. Never throws on one bad entry: it lands in `skipped` with the reason.
 */
function scan({ buf, name = 'specs.zip', maxDepth = 2 } = {}) {
  if (!buf || !buf.length) return { ok: false, error: 'empty zip' };
  const Zip = require('./zip.js');
  const bySha = new Map();
  const skipped = [];
  const stats = { files: 0, archives: 0, duplicates: 0, programs: 0 };

  const walk = (zbuf, prefix, depth) => {
    let entries;
    try { entries = new Zip(zbuf).getEntries().filter(e => !e.isDirectory); }
    catch (e) { skipped.push({ path: prefix || name, why: `unreadable zip: ${e.message}` }); return; }
    // project roots in this zip: the shallowest folders that hold a project marker
    const roots = [...new Set(entries.filter(e => PROJECT_MARKERS.has(path.posix.basename(e.entryName)) && !e.entryName.split('/').some(x => SKIP_DIRS.has(x)))
      .map(e => path.posix.dirname(e.entryName)))].sort((a, b) => a.length - b.length)
      .filter((d, i, all) => !all.slice(0, i).some(o => o === '.' || d.startsWith(o + '/')));
    const rootOf = (n) => roots.find(r => r === '.' || n.startsWith(r + '/')) || null;
    const projects = new Map();
    for (const e of entries) {
      const rel = (prefix ? `${prefix}!/` : '') + e.entryName;
      const root = rootOf(e.entryName);
      if (root !== null) {
        if (e.entryName.split('/').some(s => SKIP_DIRS.has(s))) continue;
        let pj = projects.get(root);
        if (!pj) projects.set(root, pj = { root, files: [], readme: null, bytes: 0, hash: crypto.createHash('sha256') });
        let data; try { data = e.getData(); } catch (err) { skipped.push({ path: rel, why: `unreadable: ${err.message}` }); continue; }
        if (kindOf(e.entryName) === 'program') { stats.programs++; skipped.push({ path: rel, why: 'a program, not a spec — never read or imported' }); continue; }
        stats.files++;
        pj.files.push(e.entryName.slice(root === '.' ? 0 : root.length + 1)); pj.bytes += data.length;
        pj.hash.update(e.entryName.slice(root === '.' ? 0 : root.length + 1)).update(data);
        if (!pj.readme && /^readme(\.md|\.txt)?$/i.test(path.posix.basename(e.entryName)) && path.posix.dirname(e.entryName) === root) pj.readme = data.toString('utf8');
        continue;
      }
      if (e.entryName.split('/').some(s => SKIP_DIRS.has(s))) { skipped.push({ path: rel, why: 'skipped folder' }); continue; }
      const kind = kindOf(e.entryName);
      if (kind === 'program') { stats.programs++; skipped.push({ path: rel, why: 'a program, not a spec — never read or imported' }); continue; }
      let data;
      try { data = e.getData(); } catch (err) { skipped.push({ path: rel, why: `unreadable: ${err.message}` }); continue; }
      stats.files++;
      if (kind === 'archive') {
        stats.archives++;
        if (depth < maxDepth) walk(data, rel, depth + 1);
        else skipped.push({ path: rel, why: `zip nested deeper than ${maxDepth}` });
        continue;
      }
      const h = sha(data);
      const prev = bySha.get(h);
      if (prev) { prev.paths.push(rel); stats.duplicates++; continue; }
      let text = null, textFrom = null;
      if (kind === 'spec' || kind === 'schema' || kind === 'code') { text = data.toString('utf8'); textFrom = 'utf8'; }
      else if (kind === 'docx') { text = docxText(data); textFrom = text ? 'docx' : null; }
      else if (kind === 'page') { text = pageText(data.toString('utf8')); textFrom = 'html'; }
      // pdf, diagram, image: kept as an attachment; text not extracted (no PDF reader here — said, not hidden)
      const doc = { sha: h, paths: [rel], name: path.basename(e.entryName), ext: path.extname(e.entryName).toLowerCase(), kind, bytes: data.length, text, textFrom, buffer: data };
      doc.title = bestTitle(doc, text);
      doc.version = versionOf(text, doc.name);
      doc.summary = summaryOf(text);
      bySha.set(h, doc);
    }
    for (const pj of projects.values()) {
      const h = pj.hash.digest('hex');
      const rel = (prefix ? `${prefix}!/` : '') + (pj.root === '.' ? '' : pj.root);
      const prev = bySha.get(h);
      if (prev) { prev.paths.push(rel || prefix || name); stats.duplicates++; continue; }
      const nm = path.posix.basename(pj.root === '.' ? (prefix || name).replace(/\.zip$/i, '') : pj.root);
      const text = pj.readme || null;
      const doc = { sha: h, paths: [rel || prefix || name], name: nm, ext: '', kind: 'project', bytes: pj.bytes, text, textFrom: text ? 'readme' : null, buffer: null, files: pj.files.sort() };
      doc.title = text ? titleOf(text, nm) : nm;
      if (/^getting started with create react app$/i.test(doc.title)) doc.title = nm;   // the CRA boilerplate README names nothing
      doc.version = versionOf(text, nm);
      doc.summary = summaryOf(text) || `a project: ${pj.files.length} files`;
      bySha.set(h, doc);
    }
  };
  walk(buf, '', 0);
  const docs = [...bySha.values()];
  for (const d of docs) d.family = familyOf(d);
  stats.unique = docs.length;
  stats.byFamily = docs.reduce((m, d) => { m[d.family] = (m[d.family] || 0) + 1; return m; }, {});
  stats.byKind = docs.reduce((m, d) => { m[d.kind] = (m[d.kind] || 0) + 1; return m; }, {});
  return { ok: true, docs, skipped, stats };
}

/**
 * convert(doc) — the document as spec text plus the banner the chunker should split on.
 *   blocks       — `# BLOCK N — NAME` banners (the .spec dialect the chunker already knows)
 *   markdown-h2  — two or more `## ` headings: each becomes a section
 *   markdown-h1  — three or more `# ` headings (no ## structure)
 *   document     — no structure: one section, sub-split by size
 * The text is never rewritten — the banner regex only says where sections start (byte fidelity holds).
 */
function convert(doc) {
  const text = String(doc && doc.text || '');
  if (!text.trim()) return { specText: null, bannerRe: null, dialect: 'none' };
  if (/#\s*BLOCK\s*\d+\s*[—-]\s*[A-Z]/.test(text)) return { specText: text, bannerRe: null, dialect: 'blocks' };
  const h2 = (text.match(/^##\s+\S.*$/gm) || []).length;
  if (h2 >= 2) return { specText: text, bannerRe: /^##\s+(\S.*)$/gm, dialect: 'markdown-h2' };
  const h1 = (text.match(/^#\s+(?![═=─-]{4,})\S.*$/gm) || []).length;
  if (h1 >= 3) return { specText: text, bannerRe: /^#\s+(?![═=─-]{4,})(\S.*)$/gm, dialect: 'markdown-h1' };
  return { specText: text, bannerRe: null, dialect: 'document' };
}

/** brief(doc) — the doc without its bytes or text (for listings). */
function brief(d) {
  const { buffer, text, ...rest } = d;
  return { ...rest, textChars: text ? text.length : 0 };
}

module.exports = { scan, convert, summaryOf, titleOf, bestTitle, familyOf, kindOf, docxText, pageText, brief, MODULE_ID: 'nexus.lib.spec-library', VERSION: '1.0.0' };
