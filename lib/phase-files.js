'use strict';
/**
 * lib/phase-files.js — 0.60.29 PM — every phase mapped to its files and dependencies (pure functions over map text).
 *
 * James (2026-10-13): "All the phases need to be mapped to files and dependencies. With nexus and all projects."
 *
 * Measured before building, on Nexus's own phasemaps: 777 open phases, 407 of them naming no files:, 195 with no
 * depends_on. The text alone cannot say which files a phase builds: on the phases that name their files, 27% of the
 * paths in their prose are their files (172 of 644) — the rest are what they read, mirror or were checked against. So
 * code gathers the facts, a model reads them (a few phases per request), code checks each answer, and the same model is
 * first scored on phases whose files are known (its answers count only when that score holds). Dependencies come from the
 * files, by code.
 *
 *   phasesOf(text, map)                 → [{ id, map, line, bodyEnd, status, body, files, hasFiles, hasDeps, inline }]
 *   candidates(body, { exists, dirExists }) → [{ path, exists, folder }]   the paths its text writes, each with its facts
 *   brief(batch, { repoName, folders }) → the request: phases (files: hidden), their candidates, ONE JSON answer
 *   parseAnswer(text, batch, { exists, dirExists }) → { [id]: { files:[{ path, new }], problems:[] } }
 *   score(pred, truth)                  → { tp, fp, fn }        evaluate(scores) → { precision, recall, n }
 *   hubsOf(phases)                      → Set of files too many phases change to say anything about order
 *   depsFor(phases, { hubs })           → { [id]: [{ on, file }] }   the nearest earlier phase changing the same file
 *   applyTo(text, phase, { files, deps, note }) → { text } | { error }   adds the missing keys, never replaces any
 */
const VERSION = '1.0.0';
const PATH_RE = /(?:^|[\s`'"(\[])((?:[\w.-]+\/)*[\w.-]+\.(?:c?js|mjs|ts|tsx|jsx|json|html|css|md|spec|py|sh|yml|yaml))(?=$|[\s`'"),:;\]])/gm;
const LIMITS = Object.freeze({ body: 1800, candidates: 20, files: 12 });

function _safe(p) {
  const s = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!s || s.startsWith('/') || /^[a-z]:/i.test(s) || s.split('/').some(seg => seg === '..' || seg === '')) return null;
  return s;
}
const _ind = (l) => (String(l).match(/^(\s*)/) || ['', ''])[1].length;

/** the files: list of a phase body (flow list on its line, or "- " items under it) */
function filesOfBody(body) {
  const lines = String(body || '').split('\n');
  const i = lines.findIndex(l => /^\s+files:/.test(l));
  if (i === -1) return [];
  let txt = lines[i].replace(/^\s+files:/, '');
  for (let k = i + 1; k < lines.length && /^\s+-\s/.test(lines[k]) && _ind(lines[k]) > _ind(lines[i]); k++) txt += ' ' + lines[k];
  return [...new Set([...txt.matchAll(PATH_RE)].map(m => _safe(m[1])).filter(Boolean))];
}

/** the body without its files: key (and its items) — what a model reads when its files are hidden for scoring */
function _withoutFiles(body) {
  const lines = String(body || '').split('\n'); const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s+files:/.test(lines[i])) { const ind = _ind(lines[i]); while (i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1]) && _ind(lines[i + 1]) > ind) i++; continue; }
    out.push(lines[i]);
  }
  return out.join('\n');
}

function phasesOf(text, map, parse = require('../loom/scanners/phasemap-map.js').parsePhasemapText) {
  const lines = String(text || '').split('\n');
  return parse(text, map).map(p => {
    const body = lines.slice(p.line, p.bodyEnd).join('\n');
    const header = lines[p.line] || '';
    return { id: p.id, map, line: p.line, bodyEnd: p.bodyEnd, status: p.status, body, files: filesOfBody(body),
      hasFiles: /^\s+files:/m.test(body), hasDeps: /^\s+depends_on:/m.test(body) || !!(p.dependsOn && p.dependsOn.length),
      dependsOn: p.dependsOn || [], inline: /:\s*\S/.test(header.replace(/#.*$/, '').replace(/^\s*[\w.-]+/, '')) };
  });
}

function candidates(body, { exists = () => false, dirExists = () => false } = {}) {
  const out = [];
  for (const m of String(body || '').matchAll(PATH_RE)) {
    const p = _safe(m[1]); if (!p || !p.includes('/') || out.some(c => c.path === p)) continue;
    const dir = p.split('/').slice(0, -1).join('/');
    out.push({ path: p, exists: !!exists(p), folder: !!(dir && dirExists(dir)) });
    if (out.length >= LIMITS.candidates) break;
  }
  return out;
}

function brief(batch, { repoName = 'the repo', folders = [], deps = null } = {}) {
  // §0.60.228 SL8 — deps: the phases it may depend on (id + what it does); given, the answer also names depends_on from that list only
  const parts = [
    `You map phases of ${repoName} to the files each phase will CREATE or CHANGE.`,
    'A file the phase only reads, mirrors, cites, reuses, builds on or was checked against is NOT one of its files.',
    deps ? 'Answer with ONE JSON object and nothing else: {"phases":[{"id":"<phase id>","files":[{"path":"<path from the repo root>","new":true|false}],"depends_on":["<phase id from the list below>"]}]}'
      : 'Answer with ONE JSON object and nothing else: {"phases":[{"id":"<phase id>","files":[{"path":"<path from the repo root>","new":true|false}]}]}',
    deps ? 'depends_on: only phases from the list below that must be finished before this one can be built (it uses what they make); [] when none.' : '',
    'Use "files": [] when you cannot name a file the phase changes. A new file must sit in a folder that exists. At most 12 files a phase.',
    folders.length ? `Top-level folders: ${folders.slice(0, 40).join(', ')}` : '',
  ].filter(Boolean);
  for (const b of batch) {
    const c = b.candidates || [];
    parts.push(`\n### ${b.id}\n${_withoutFiles(b.body).slice(0, LIMITS.body)}`);
    if (c.length) parts.push(`Paths it mentions: ${c.map(x => `${x.path} (${x.exists ? 'exists' : x.folder ? 'new — its folder exists' : 'its folder does not exist'})`).join(' · ')}`);
  }
  if (deps && deps.length) parts.push(`\nPhases it may depend on:\n${deps.slice(0, 60).map(d => `- ${d.id}${d.does ? `: ${String(d.does).replace(/\s+/g, ' ').slice(0, 120)}` : ''}`).join('\n')}`);
  return parts.join('\n');
}

function _json(text) {
  const s = String(text || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  for (const cand of [fence && fence[1], s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)]) {
    if (!cand) continue;
    try { return JSON.parse(cand); } catch (_) {}
  }
  return null;
}

function parseAnswer(text, batch, { exists = () => false, dirExists = () => false } = {}) {
  const j = _json(text);
  const out = {};
  for (const b of batch) out[b.id] = { files: [], dependsOn: [], problems: [], answered: false };
  if (!j || !Array.isArray(j.phases)) { for (const b of batch) out[b.id].problems.push('the answer was not the JSON asked for'); return out; }
  for (const ph of j.phases) {
    const id = ph && String(ph.id || '').trim();
    if (!id || !out[id]) continue;
    out[id].answered = true;
    for (const d of (Array.isArray(ph.depends_on) ? ph.depends_on : []).slice(0, 12)) { const k = String(d || '').trim(); if (k && !out[id].dependsOn.includes(k)) out[id].dependsOn.push(k); }   // §0.60.228 SL8 — checked by the caller
    for (const f of (Array.isArray(ph.files) ? ph.files : []).slice(0, LIMITS.files)) {
      const p = _safe(typeof f === 'string' ? f : f && f.path);
      if (!p) { out[id].problems.push(`an unsafe or empty path (${JSON.stringify(f).slice(0, 60)})`); continue; }
      if (out[id].files.some(x => x.path === p)) continue;
      const dir = p.split('/').slice(0, -1).join('/');
      if (exists(p)) out[id].files.push({ path: p, new: false });
      else if (!dir || dirExists(dir)) out[id].files.push({ path: p, new: true });
      else out[id].problems.push(`${p}: neither it nor its folder exists`);
    }
  }
  for (const b of batch) if (!out[b.id].answered) out[b.id].problems.push('not in the answer');
  return out;
}

function score(pred = [], truth = []) {
  const P = new Set(pred), T = new Set(truth);
  let tp = 0; for (const p of P) if (T.has(p)) tp++;
  return { tp, fp: P.size - tp, fn: T.size - tp };
}
function evaluate(scores = []) {
  const s = scores.reduce((a, x) => ({ tp: a.tp + x.tp, fp: a.fp + x.fp, fn: a.fn + x.fn }), { tp: 0, fp: 0, fn: 0 });
  return { ...s, n: scores.length, precision: s.tp + s.fp ? s.tp / (s.tp + s.fp) : 0, recall: s.tp + s.fn ? s.tp / (s.tp + s.fn) : 0 };
}

/**
 * hubsOf(phases) — files so many phases change that sharing one says nothing about order (Nexus: idearium/api/index.js
 * is named by 118 phases, idearium/ui/js/app.js by 57). A hub is named by at least max(8, 2% of the phases naming files).
 */
function hubsOf(phases = [], { min = 8, share = 0.02 } = {}) {
  const c = new Map(); let n = 0;
  for (const p of phases) { if ((p.files || []).length) n++; for (const f of new Set(p.files || [])) c.set(f, (c.get(f) || 0) + 1); }
  const at = Math.max(min, Math.ceil(n * share));
  return new Set([...c].filter(([, k]) => k >= at).map(([f]) => f));
}

/** depsFor(phases, { hubs }) — within one map, in its order: each phase depends on the nearest earlier phase changing a
 *  file it changes. A hub file is not evidence (a false depends_on blocks a phase until another is done). */
function depsFor(phases = [], { hubs = new Set() } = {}) {
  const out = {};
  const lastBy = new Map();   // file → the latest phase so far that changes it
  for (const p of phases) {
    const deps = [];
    for (const f of (p.files || []).filter(x => !hubs.has(x))) {
      const prev = lastBy.get(f);
      if (prev && prev !== p.id && !deps.some(d => d.on === prev) && !(p.dependsOn || []).includes(prev)) deps.push({ on: prev, file: f });
    }
    if (deps.length) out[p.id] = deps;
    for (const f of p.files || []) lastBy.set(f, p.id);
  }
  return out;
}

const _q = (s) => (/[:#\[\]{},&*!|>'"%@`]|^\s|\s$/.test(s) ? JSON.stringify(s) : s);

/** applyTo(text, phase, { files, deps, note }) — the phase block gains the keys it lacks, nothing it has is changed */
function applyTo(text, phase, { files = null, deps = null, note = '' } = {}) {
  const lines = String(text).split('\n');
  const header = lines[phase.line];
  if (header == null || !new RegExp(`^\\s*${phase.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(header)) return { error: `${phase.id}: its header moved — map it again` };
  if (phase.inline) return { error: `${phase.id}: written on one line ({ … }) — its keys are not added in place` };
  const body = lines.slice(phase.line + 1, phase.bodyEnd);
  const child = body.find(l => l.trim() && !/^\s*#/.test(l));
  const ind = ' '.repeat(child ? _ind(child) : _ind(header) + 2);
  const add = [];
  if (files && files.length && !/^\s+files:/m.test(body.join('\n'))) add.push(`${ind}files: [${files.map(_q).join(', ')}]${note ? `   # ${note}` : ''}`);
  if (deps && deps.length && !/^\s+depends_on:/m.test(body.join('\n'))) add.push(`${ind}depends_on: [${deps.map(d => _q(d.on)).join(', ')}]   # mapped from the files they share: ${deps.map(d => `${d.on} (${d.file})`).join(', ').slice(0, 200)}`);
  if (!add.length) return { text: String(text), added: 0 };
  lines.splice(phase.line + 1, 0, ...add);
  return { text: lines.join('\n'), added: add.length };
}

module.exports = { VERSION, LIMITS, PATH_RE, filesOfBody, phasesOf, candidates, brief, parseAnswer, score, evaluate, hubsOf, depsFor, applyTo, _withoutFiles };
