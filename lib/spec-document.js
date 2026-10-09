'use strict';
/**
 * lib/spec-document.js — a .spec or .eg file as blocks over its real text (RS3, 0.49.0).
 * UUID: nexus-lib-spec-document-v1-0000-2026-1005-jamesbrooks-001
 * Map: docs/2026-10-05-spec-workshop-rebuild-phasemap.spec (RS3_the_spec_document)
 *
 * James: "I'm thinking like document editor but for the emerge and .spec files. each block has a block id, which can be
 * completely custom, can be anything." · "okay now the phases with the spec workshop. needs to be rebuilt, enterprise
 * grade. interconnected"
 *
 * The file is the truth (§10.3): a document is its text cut into blocks that partition it exactly — every byte belongs
 * to one block, so joining the blocks gives the file back byte for byte, comments and order kept. A block is a range:
 *   emerge (genesis.spec, .eg)  a `domain "name"` line, or a `// ── Title ──` banner, with the comments directly above it
 *   yaml                        a top-level key (or, under a single root like `spec:`, its keys) with the comments above
 *   markdown                    a #, ## or ### heading
 *   sections (the workshop's)   each item of its `sections:` list ({ id, title, body }) — its id is its `id:` field
 *                               (0.49.0, merged with main's SP1, which reads this form by its sections)
 * Text before the first head is the preamble (id `_preamble`).
 *
 * A block's id is its natural name (the domain, the key, the heading's slug) until he gives it one: a marker line in the
 * block, `// @block <id>` (emerge), `# @block <id>` (yaml), `<!-- @block <id> -->` (markdown). An id can be anything
 * but a line break; ids are unique in the file — a duplicate is refused, never suffixed. Two blocks with the same
 * natural name (and no marker) get the second `name~2`, said in problems.
 *
 *   detect(text, path)                          → 'emerge' | 'yaml' | 'markdown'
 *   parse(text, { path })                       → { format, blocks:[{ id, natural, kind, label, line, endLine, text, hash, marked }], problems }
 *   serialize(doc)                              → the text (=== the file when nothing changed)
 *   replaceBlock(text, id, newText, { path })   → { ok, text, doc, check, idChanged } — every other block byte-identical
 *   setId(text, id, newId, { path })            → { ok, text, doc } — writes / changes the marker; refuses a taken id
 *   renameRefs(mapText, { spec, from, to })     → { text, count } — a phasemap's blocks: / sections: lists for that spec
 *   isBookkeeping(block)                        → meta, history, notes … (and the preamble): edited, never planned
 *   check(text, format)                         → { ok, problems:[{ line, message }] } — yaml: js-yaml over the whole
 *       file; emerge: structural (quotes and brackets balanced per block, domain and key = value lines well-formed) —
 *       the Emerge kernel's own parser reads another dialect (compartment · invariant · signal), not genesis's domains;
 *       markdown: nothing to check.
 */
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.spec-document';
const VERSION = '1.0.0';
const PREAMBLE = '_preamble';

// §RS9 — bookkeeping blocks (meta, history, notes …) are part of the document and edited like any block, but they are
// not things to build: the planner leaves them out and the thread does not count them. (Moved here from spec-plan _SKIP.)
const BOOKKEEPING = /^(meta|version_?history|history|changelog|gaps|open_gaps|known_gaps|addend(a|um)|notes?|references?|glossary|provenance|origin|uuid|name|version|status|date|owner|license)$/i;
// the idea's own framing in a workshop spec (main's SP1): context for every phase, not one to build
const FRAMING = /^(idea|purpose|meta[-_ ]?identity|ambition|end[-_ ]?state)$/i;
function isBookkeeping(b) { return !!b && (b.kind === 'preamble' || BOOKKEEPING.test(b.natural || '') || BOOKKEEPING.test(b.id || '') || (b.kind === 'section' && FRAMING.test(b.id || ''))); }
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const slug = (s) => String(s || '').toLowerCase().replace(/[`*_~]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'block';

/** lines with their line breaks kept — joining them gives the text back exactly */
function _lines(text) { return String(text).match(/[^\n]*\n|[^\n]+$/g) || []; }

function detect(text, filePath = '') {
  const t = String(text || '').replace(/^\ufeff/, '');   // §HP5 — a byte-order mark is not part of the first line's text
  if (/^sections:\s*$/m.test(t) && /^\s*-\s+id:/m.test(t)) return 'sections';
  if (/\.eg$/i.test(filePath)) return 'emerge';
  if (/^domain\s+"[^"]+"/m.test(t) || /^\/\/\s*──/m.test(t)) return 'emerge';
  if (/\.(md|markdown)$/i.test(filePath)) return 'markdown';
  const yamlKeys = (t.match(/^[A-Za-z_][\w.-]*:/gm) || []).length;
  if (!yamlKeys && /^#{1,3}\s+\S/m.test(t)) return 'markdown';
  return 'yaml';
}

const MARKER = {
  sections: { re: /^\s*#\s*@block\s+(.+?)\s*$/, make: (id) => `# @block ${id}\n` },   // never written: its id is its id: field
  emerge: { re: /^\s*\/\/\s*@block\s+(.+?)\s*$/, make: (id) => `// @block ${id}\n` },
  yaml: { re: /^\s*#\s*@block\s+(.+?)\s*$/, make: (id) => `# @block ${id}\n` },
  markdown: { re: /^\s*<!--\s*@block\s+(.+?)\s*-->\s*$/, make: (id) => `<!-- @block ${id} -->\n` },
};
const COMMENT = { sections: /^\s*#/, emerge: /^\s*\/\//, yaml: /^\s*#/, markdown: /^\s*<!--.*-->\s*$/ };

/** the head lines of a format: [{ i, natural, kind, label }] */
function _heads(L, format) {
  const out = [];
  if (format === 'emerge') {
    L.forEach((l, i) => {
      const d = l.match(/^domain\s+"([^"]+)"/); if (d) { out.push({ i, natural: d[1], kind: 'domain', label: `domain "${d[1]}"` }); return; }
      const b = l.match(/^\/\/\s*──+\s*(.*?)\s*─*\s*$/); if (b && b[1]) out.push({ i, natural: slug(b[1].replace(/[—–].*$/, '')), kind: 'section', label: b[1].replace(/\s*─+$/, '') });
    });
  } else if (format === 'sections') {
    // the workshop form: each item of the top-level sections: list; a top-level key after the list is its own block
    const at = L.findIndex(l => /^sections:\s*$/.test(l));
    const first = L.findIndex((l, i) => i > at && /^\s*-\s/.test(l));
    const ind = first === -1 ? 0 : L[first].match(/^\s*/)[0].length;
    for (let i = at + 1; i < L.length; i++) {
      const l = L[i];
      if (/^[A-Za-z_][\w.-]*:/.test(l)) { const k = l.split(':')[0]; out.push({ i, natural: k, kind: 'key', label: k }); continue; }
      if (l.match(/^\s*/)[0].length === ind && /^\s*-\s/.test(l)) {
        let id = null, title = null;
        for (let k = i; k < L.length && (k === i || !(L[k].match(/^\s*/)[0].length <= ind && L[k].trim())); k++) {
          const m = L[k].replace(/^\s*-\s/, '  ').match(/^\s*(id|title):\s*(.*)$/); if (!m) continue;
          const v = m[2].trim().replace(/^['"]|['"]$/g, ''); if (m[1] === 'id' && id == null) id = v; if (m[1] === 'title' && title == null) title = v;
        }
        out.push({ i, natural: id || slug(title || `section-${out.length + 1}`), kind: 'section', label: title || id || 'section' });
      }
    }
  } else if (format === 'yaml') {
    const tops = L.map((l, i) => ({ l, i })).filter(x => /^[A-Za-z_][\w.-]*:/.test(x.l));
    const re = tops.length === 1 ? /^ {2}[A-Za-z_][\w.-]*:/ : /^[A-Za-z_][\w.-]*:/;
    L.forEach((l, i) => { if (re.test(l) && !/^\s*#/.test(l)) { const k = l.trim().split(':')[0]; out.push({ i, natural: k, kind: 'key', label: k }); } });
  } else {
    L.forEach((l, i) => { const h = l.match(/^(#{1,3})\s+(\S.*?)\s*$/); if (h) out.push({ i, natural: slug(h[2]), kind: `h${h[1].length}`, label: h[2] }); });
  }
  return out;
}

function parse(text, { path: filePath = '' } = {}) {
  const src = String(text || '');
  const format = detect(src, filePath);
  const L = _lines(src);
  // §HP5 0.52.0 — the heads are read without line breaks and without a leading byte-order mark (a BOM before `spec:` hid
  // every block: the file round-tripped but read as one preamble); the bytes themselves are never touched
  const heads = _heads(L.map((l, i) => (i === 0 ? l.replace(/^\ufeff/, '') : l).replace(/\r?\n$/, '')), format);
  const isComment = (i) => COMMENT[format].test(L[i].replace(/\n$/, '')) || MARKER[format].re.test(L[i].replace(/\n$/, ''));
  // a head takes the comment lines directly above it (no blank line between), stopping at the head before it
  const starts = heads.map((h, k) => { let s = h.i; const floor = k ? heads[k - 1].i + 1 : 0; while (s - 1 >= floor && isComment(s - 1) && !(format === 'emerge' && /^\/\/\s*──/.test(L[s - 1]))) s--; return s; });
  const ranges = [];
  if (!heads.length || starts[0] > 0) ranges.push({ start: 0, end: heads.length ? starts[0] : L.length, head: null });
  heads.forEach((h, k) => ranges.push({ start: starts[k], end: k + 1 < heads.length ? starts[k + 1] : L.length, head: h }));
  const problems = [];
  const seen = new Map();
  const blocks = ranges.filter(r => r.end > r.start || !r.head).map((r) => {
    const t = L.slice(r.start, r.end).join('');
    let marked = null;
    for (let i = r.start; i < r.end; i++) { const m = L[i].replace(/\n$/, '').match(MARKER[format].re); if (m) { marked = m[1]; break; } }
    const natural = r.head ? r.head.natural : PREAMBLE;
    let id = marked || natural;
    if (seen.has(id)) {
      if (marked) problems.push({ line: r.start + 1, message: `duplicate block id "${id}" (also at line ${seen.get(id)})` });
      else { let n = 2; while (seen.has(`${natural}~${n}`)) n++; problems.push({ line: r.start + 1, message: `two blocks are named "${natural}" — the second is "${natural}~${n}" until it is given an id` }); id = `${natural}~${n}`; }
    }
    seen.set(id, r.start + 1);
    return { id, natural, kind: r.head ? r.head.kind : 'preamble', label: r.head ? r.head.label : 'before the first block', line: r.start + 1, endLine: r.end, text: t, hash: sha(t), marked: !!marked };
  });
  return { format, blocks, problems };
}

function serialize(doc) { return doc.blocks.map(b => b.text).join(''); }

function _validId(id) { const s = String(id == null ? '' : id).trim(); return s && !/[\r\n]/.test(s) && s.length <= 120 ? s : null; }

function replaceBlock(text, id, newText, { path: filePath = '' } = {}) {
  const doc = parse(text, { path: filePath });
  const i = doc.blocks.findIndex(b => b.id === id);
  if (i < 0) return { ok: false, error: `no block "${id}"` };
  let t = String(newText == null ? '' : newText);
  // a block that ended the line keeps ending it, so the next block's head stays at the start of a line
  if (doc.blocks[i].text.endsWith('\n') && t && !t.endsWith('\n') && i + 1 < doc.blocks.length) t += '\n';
  const blocks = doc.blocks.map((b, k) => (k === i ? { ...b, text: t } : b));
  const out = blocks.map(b => b.text).join('');
  const after = parse(out, { path: filePath });
  const ids = new Set(after.blocks.map(b => b.id));
  const dup = after.problems.find(p => /^duplicate block id/.test(p.message));
  if (dup) return { ok: false, error: dup.message };
  return { ok: true, text: out, doc: after, check: check(out, after.format), idChanged: ids.has(id) ? null : { from: id, to: (after.blocks[i] || {}).id || null } };
}

function setId(text, id, newId, { path: filePath = '' } = {}) {
  const nid = _validId(newId);
  if (!nid) return { ok: false, error: 'an id can be anything but empty or a line break (120 characters at most)' };
  const doc = parse(text, { path: filePath });
  const b = doc.blocks.find(x => x.id === id);
  if (!b) return { ok: false, error: `no block "${id}"` };
  if (b.id === nid) return { ok: true, text: String(text), doc };
  if (doc.blocks.some(x => x.id === nid)) return { ok: false, error: `the id "${nid}" is taken (line ${doc.blocks.find(x => x.id === nid).line}) — ids are unique in the file` };
  if (b.kind === 'preamble') return { ok: false, error: 'the preamble has no id of its own' };
  const M = MARKER[doc.format];
  let t;
  if (doc.format === 'sections' && b.kind === 'section') {
    // the workshop's own id field is the id — changed in place, quoted when it needs to be
    const q = /^[\w.-]+$/.test(nid) ? nid : JSON.stringify(nid);
    let done = false;
    t = b.text.split('\n').map(l => { if (done) return l; const m = l.match(/^(\s*-?\s*id:\s*)(.*)$/); if (m) { done = true; return `${m[1]}${q}`; } return l; }).join('\n');
    if (!done) return { ok: false, error: 'this section has no id: field to change' };
  } else if (b.marked) t = b.text.split('\n').map(l => (M.re.test(l) ? l.replace(M.re.exec(l)[1], nid) : l)).join('\n');
  else t = M.make(nid) + b.text;   // the marker is the block's first line, above its comments
  const blocks = doc.blocks.map(x => (x === b ? { ...x, text: t } : x));
  const out = blocks.map(x => x.text).join('');
  return { ok: true, text: out, doc: parse(out, { path: filePath }) };
}

/** renameRefs — in a phasemap planned from `spec`, the blocks: and sections: lists naming `from` now name `to` */
function renameRefs(mapText, { spec, from, to } = {}) {
  const src = String(mapText || '');
  if (spec && !new RegExp(`^\\s*spec:\\s*['"]?${String(spec).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*$`, 'm').test(src)) return { text: src, count: 0 };
  let count = 0;
  const lines = src.split('\n');
  let inList = false;
  const out = lines.map((l) => {
    const inline = l.match(/^(\s*(?:blocks|sections):\s*)\[(.*)\]\s*$/);
    if (inline) { inList = false; const items = inline[2].split(',').map(x => x.trim()); const n = items.map(x => (x.replace(/^['"]|['"]$/g, '') === from ? (count++, to) : x)); return `${inline[1]}[${n.join(', ')}]`; }
    if (/^\s*(blocks|sections):\s*$/.test(l)) { inList = true; return l; }
    if (inList) {
      const it = l.match(/^(\s*-\s*)(['"]?)(.*?)\2\s*$/);
      if (it) { if (it[3] === from) { count++; return `${it[1]}${it[2]}${to}${it[2]}`; } return l; }
      if (l.trim()) inList = false;
    }
    return l;
  });
  return { text: out.join('\n'), count };
}

function check(text, format) {
  const problems = [];
  if (format === 'yaml' || format === 'sections') {
    try { require('js-yaml').load(String(text)); } catch (e) { problems.push({ line: e.mark ? e.mark.line + 1 : null, message: e.reason || e.message }); }
  } else if (format === 'emerge') {
    const L = String(text).split('\n');
    const pairs = { '[': ']', '{': '}', '(': ')' };
    const stack = [];
    L.forEach((raw, i) => {
      const l = raw.replace(/\/\/.*$/, '');   // a comment says anything
      if (/^domain\b/.test(l) && !/^domain\s+"[^"]+"/.test(l)) problems.push({ line: i + 1, message: 'a domain line names its domain in quotes: domain "name"' });
      if (((l.match(/"/g) || []).length) % 2) problems.push({ line: i + 1, message: 'a quote is opened and not closed on this line' });
      const eq = l.match(/^\s*([^=\s][^=]*?)?\s*=\s*(.*)$/);
      if (eq && !eq[1]) problems.push({ line: i + 1, message: 'a "= value" line with no key' });
      let inStr = false;
      for (const ch of l) {
        if (ch === '"') inStr = !inStr;
        if (inStr) continue;
        if (pairs[ch]) stack.push({ ch, line: i + 1 });
        else if (Object.values(pairs).includes(ch)) { const top = stack.pop(); if (!top || pairs[top.ch] !== ch) problems.push({ line: i + 1, message: `"${ch}" closes nothing that is open` }); }
      }
    });
    for (const s of stack) problems.push({ line: s.line, message: `"${s.ch}" is opened and never closed` });
  }
  return { ok: !problems.length, problems };
}

module.exports = { MODULE_ID, VERSION, PREAMBLE, BOOKKEEPING, FRAMING, isBookkeeping, detect, parse, serialize, replaceBlock, setId, renameRefs, check, sha };
