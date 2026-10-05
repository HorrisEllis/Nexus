'use strict';
/**
 * copilot/lib/workset.js — the working set of one tool-loop run: context found one read at a time, kept in a JSON
 * file, synthesized into only what the next round needs.
 * comp_id: nexus.copilot.lib.workset
 * UUID: nexus-copilot-workset-v1-0000-2026-1005-jamesbrooks-001
 *
 * §0.39.337 SB37 (docs/2026-10-05-build-from-the-spec-phasemap.spec). James: "Find the context one by one, put it in
 * an index, and then synthesize it into, into just what it needs. Signal to noise." · "Probably just a JSON file."
 *
 * Why: an Ollama tool loop re-sent the whole run every round — prompt, replies, every tool result in full — into a
 * 6,144-token window that Ollama truncates from the front. The more an agent found, the sooner it lost the question.
 *
 * The file (copilot owns it — copilot/data/worksets/<id>.json; COPILOT_WORKSET_DIR overrides, the test sandbox
 * redirects it): { id, question, terms, createdAt, reads: [{ n, tool, args, at, raw, signal, ids, files, score }],
 * answer, answeredAt }. Every raw result stays in the file; only its signal is ever sent.
 *
 * Signal is chosen without a model (a small model's summary drops things): the lines of a result that carry the
 * question's terms, plus what identifies it — chunk ids, file:lines, names, signatures, what it uses and what uses it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'copilot.lib.workset';
const VERSION = '1.0.0';
const DEFAULT_BUDGET = parseInt(process.env.COPILOT_WORKSET_BUDGET || '6000', 10);   // chars of synthesis per round
const LINES_PER_READ = 14;
const LINE_MAX = 220;
const SMALL_READ = parseInt(process.env.COPILOT_WORKSET_SMALL_READ || '1500', 10);   // chars: a read this small is sent whole

const STOP = new Set(('the a an and or of to in on for with by from at as is are was were be been it its this that these those ' +
  'what where when which who how why do does did can could should would will shall may might must not no yes me my we our you your ' +
  'tell about all any some there here into out up over than then them they their i us has have had just only also more most very ' +
  'get got make made use used using find show give know learn project code file files').split(' '));

function dir() {
  try { require('../../lib/test-sandbox.js').ensure(); } catch (_) { /* outside the tree — the default below */ }
  return process.env.COPILOT_WORKSET_DIR || path.join(__dirname, '..', 'data', 'worksets');
}

/** the words of a question that can identify relevant lines (lower case, no stop words, identifiers split too) */
function termsOf(text) {
  const out = new Set();
  for (const raw of String(text || '').match(/[A-Za-z_$][\w$.-]*/g) || []) {
    const w = raw.toLowerCase().replace(/^[.-]+|[.-]+$/g, '');
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
    for (const part of raw.split(/[._-]|(?=[A-Z][a-z])/)) { const p = part.toLowerCase(); if (p.length >= 3 && !STOP.has(p)) out.add(p); }
  }
  return [...out];
}

const _clip = (s, n = LINE_MAX) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const _score = (line, terms) => { const l = line.toLowerCase(); let k = 0; for (const t of terms) if (l.includes(t)) k++; return k; };

/** every scalar of a result as "path: value" lines (a generic tool's result) */
function _flatten(v, pre = '', out = []) {
  if (out.length > 400) return out;
  if (v == null) return out;
  if (Array.isArray(v)) { v.forEach((x, i) => _flatten(x, pre ? `${pre}[${i}]` : `[${i}]`, out)); return out; }
  if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) _flatten(x, pre ? `${pre}.${k}` : k, out); return out; }
  for (const line of String(v).split('\n')) if (line.trim()) out.push(`${pre}: ${line}`);
  return out;
}

/**
 * distill(tool, args, result, terms) → { signal: [lines], ids, files, score }
 * What identifies the result is always kept; the rest is kept only where it carries a term, best first.
 */
function distill(tool, args, result, terms) {
  const ids = new Set(), files = new Set();
  const keep = [], rank = [];
  const idOf = (o) => { if (o && o.id) ids.add(String(o.id)); const at = o && (o.at || o.file); if (at) files.add(String(at).split(':')[0]); };
  if (result && result.error) return { signal: [`✗ ${_clip(result.error)}`], ids: [], files: [], score: 0 };
  let r = result;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (_) { /* text result */ } }

  if (r && Array.isArray(r.results)) {                                   // code_search: ranked chunks
    for (const h of r.results) {
      idOf(h);
      keep.push(_clip(`${h.id} ${h.at || ''} ${h.kind || ''} ${h.name || ''}${h.summary ? ` — ${h.summary}` : ''}`));
      for (const l of (h.lines || []).slice(0, 2)) rank.push(`  ${l}`);
    }
  } else if (r && typeof r === 'object' && r.id && (r.signature || r.at)) {   // code_chunk: one chunk and its card
    idOf(r);
    keep.push(_clip(`${r.id} ${r.at || ''} ${r.kind || ''} ${r.name || ''}`));
    if (r.signature) keep.push(_clip(`  ${r.signature}`));
    if (r.summary || r.doc) keep.push(_clip(`  ${r.summary || r.doc}`));
    if ((r.uses || []).length) keep.push(_clip(`  uses: ${r.uses.slice(0, 4).join('; ')}`));
    if ((r.usedBy || []).length) keep.push(_clip(`  used by: ${r.usedBy.slice(0, 4).join('; ')}`));
    const code = r.code || r.text || r.content || '';
    for (const l of String(code).split('\n')) if (l.trim()) rank.push(`  ${l}`);
  } else if (r && Array.isArray(r.matches)) {                            // code_grep: exact lines
    for (const m of r.matches) { if (m.chunk) ids.add(String(m.chunk)); if (m.at) files.add(String(m.at).split(':')[0]); rank.push(`${m.at} ${m.text}`); }
  } else {
    for (const l of typeof r === 'string' ? r.split('\n') : _flatten(r)) rank.push(l);
  }

  const scored = rank.map((l, i) => ({ l: _clip(l), s: _score(l, terms), i }));
  // a small read is all signal — kept whole (an agent editing a 20-line function needs its every line); only a big
  // read is cut down to what carries the question
  if (rank.join('\n').length <= SMALL_READ) {
    const score = scored.reduce((t, x) => t + x.s, 0) + keep.reduce((t, l) => t + _score(l, terms), 0);
    return { signal: [...keep, ...rank.map(l => String(l).replace(/\s+$/, ''))], ids: [...ids], files: [...files], score };
  }
  const room = Math.max(0, LINES_PER_READ - keep.length);
  const picked = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, room).sort((a, b) => a.i - b.i);
  // nothing matched the question: the first lines still say what the read returned
  const lines = [...keep, ...(picked.length ? picked : scored.slice(0, Math.min(room, 4))).map(x => x.l)];
  const score = scored.reduce((t, x) => t + x.s, 0) + keep.reduce((t, l) => t + _score(l, terms), 0);
  return { signal: lines, ids: [...ids], files: [...files], score };
}

/** create({ question, id? }) → a working set, written to its JSON file */
function create({ question = '', id = null, meta = null } = {}) {
  const ws = { id: id || `ws-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, version: VERSION, question: String(question || '').slice(0, 4000),
    terms: termsOf(question), meta: meta || null, createdAt: Date.now(), reads: [], answer: null, answeredAt: null };
  _save(ws);
  return ws;
}

function file(ws) { return path.join(dir(), `${ws.id}.json`); }
function _save(ws) {
  try { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(file(ws), JSON.stringify(ws, null, 1)); }
  catch (e) { ws.saveError = e.message; console.warn(`[${MODULE_ID}] §1.2 working set ${ws.id} not written: ${e.message}`); }
}

/** add(ws, tool, args, result) — one read, raw kept in the file, its signal distilled */
function add(ws, tool, args, result) {
  const d = distill(tool, args, result, ws.terms);
  let raw = result;
  try { raw = typeof result === 'string' ? result : JSON.parse(JSON.stringify(result)); } catch (_) { raw = String(result); }
  const read = { n: ws.reads.length + 1, tool, args: args || {}, at: Date.now(), raw, ...d };
  ws.reads.push(read);
  _save(ws);
  return read;
}

/**
 * synthesize(ws, { budget }) → text: the reads' signal, the most relevant first, a line already given by an earlier
 * read not repeated, cut at the budget (what was cut is counted, never silently).
 */
function synthesize(ws, { budget = DEFAULT_BUDGET } = {}) {
  if (!ws.reads.length) return '';
  const seen = new Set();
  const order = ws.reads.slice().sort((a, b) => b.score - a.score || b.n - a.n);
  const parts = []; let used = 0, cut = 0;
  for (const r of order) {
    const args = Object.entries(r.args || {}).filter(([k]) => k !== 'repoUuid').map(([k, v]) => `${k}=${_clip(typeof v === 'string' ? v : JSON.stringify(v), 60)}`).join(' ');
    const lines = r.signal.filter(l => { const k = l.trim(); if (seen.has(k)) return false; seen.add(k); return true; });
    if (!lines.length) continue;
    const block = `[${r.n}] ${r.tool}${args ? ` ${args}` : ''}\n${lines.join('\n')}`;
    if (used + block.length > budget) { cut++; continue; }
    parts.push({ n: r.n, block }); used += block.length + 2;
  }
  parts.sort((a, b) => a.n - b.n);
  const out = parts.map(p => p.block).join('\n\n');
  return cut ? `${out}\n\n(${cut} more read(s) kept in the working set, not shown — re-open by id)` : out;
}

/** answer(ws, text) — the run's answer, in the same file as everything it was drawn from */
function answer(ws, text) { ws.answer = String(text || ''); ws.answeredAt = Date.now(); _save(ws); return ws; }

/** summary(ws) — what a caller reports: where the file is and what it holds */
function summary(ws) {
  return { id: ws.id, file: file(ws), reads: ws.reads.length, ids: [...new Set(ws.reads.flatMap(r => r.ids))].slice(0, 50),
    files: [...new Set(ws.reads.flatMap(r => r.files))].slice(0, 50), ...(ws.saveError ? { saveError: ws.saveError } : {}) };
}

module.exports = { MODULE_ID, VERSION, DEFAULT_BUDGET, create, add, synthesize, answer, summary, distill, termsOf, file, dir };
