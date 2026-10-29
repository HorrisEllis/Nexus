'use strict';
/**
 * lib/project-convert.js — a project's markdown into specs, and the plans hard-coded inside its specs into phasemaps.
 * comp_id: nexus.lib.project-convert
 * UUID: nexus-lib-project-convert-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-CONVERT · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA5
 *
 * James, 2026-10-29: "convert mds, hardcoded phasemaps". Read in the repo he uploaded (Emerge): its plan lives inside
 * spec/cie-eg.spec as modules[].build { state, file, blocked_by, existing, next } and decisions D1–D9, where Nexus never looks
 * (it reads plans from *-phasemap.spec only); its docs are markdown (BUILDING.md, lang/README.md, CIE-EG_Specification_v0_3_1.md).
 *
 * Reuse (§8.6): lib/spec-from-markdown.js reads an md's title, version and intent; the documents adapter reads its sections and the
 * files it names; the JS/Emerge adapters read those files' exports; lib/phasemap-parse.js and lib/phase-dag.js read the converted
 * map back (it must parse, and every depends_on must resolve). Sources stay where they are (§0.3): the outputs are written beside.
 *
 *   mdToSpec(path, text, { files, project })  → { target, text, modules, sections, open }
 *   specPlan(text, { specPath, name })         → { target, text, phases, decisions, next, said } | null when the spec has no plan
 *   plan(files)                                → { mds:[{ path, target, exists }], specPlans:[{ path, target, modules, exists }] }
 */

const path = require('path');
const yaml = require('js-yaml');
const A = require('./adapters/contract.js');
const S = require('./project-spine.js');

const MODULE_ID = 'nexus.lib.project-convert';
const VERSION = '1.0.0';
const SKIP = /(^|\/)(node_modules|\.git|_archive)\//;

const slug = (s, n = 48) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, n).replace(/_+$/, '') || 'x';
const firstSentence = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); const m = /^(.{20,280}?[.!?])(\s|$)/.exec(t); return m ? m[1] : t.slice(0, 280); };

function _mdTarget(p, paths) {
  const base = p.replace(/\.(md|markdown)$/i, '');
  const a = `${base}.spec`;
  return paths.has(a) ? `${base}.md.spec` : a;
}

/** mdToSpec — an emerge-format spec from a markdown file: its sections kept whole, a module for every repo file it names */
function mdToSpec(p, text, { files = [], project = 'project' } = {}) {
  const docs = A.forFile('x.md');
  const paths = new Set(files.map(f => String(f.path).replace(/\\/g, '/')));
  let meta = { name: slug(path.posix.basename(p, path.posix.extname(p)), 60).replace(/_/g, '-'), version: '0.0.0', intent: '' };
  try { const m = require('./spec-from-markdown.js').parseMarkdownToSpec(String(text || ''), { filenameFallback: meta.name }).meta; meta = { ...meta, ...m }; }
  catch (_) { /* an empty md: the file name names it */ }
  const units = docs.units(text, p);
  const lines = String(text || '').split('\n');
  const sections = {};
  for (const u of units) {
    let k = slug(u.name, 40); let n = 2; while (sections[k]) k = `${slug(u.name, 36)}_${n++}`;
    sections[k] = { title: u.name, level: u.level, lines: [u.start, u.end], text: lines.slice(u.start, Math.min(u.end, (units.find(x => x.start > u.start) || { start: u.end + 1 }).start - 1)).join('\n').trim() };
  }
  const byPath = new Map(files.map(f => [String(f.path).replace(/\\/g, '/'), f]));
  const modules = []; const seen = new Set();
  for (const d of docs.dependencies(text, p)) {
    let to = S.resolve(p, d.spec, paths) || (paths.has(d.spec.replace(/^\.\//, '')) ? d.spec.replace(/^\.\//, '') : null);
    if (!to) { const tail = [...paths].filter(x => x.endsWith(`/${d.spec}`)); if (tail.length === 1) to = tail[0]; }
    if (!to || seen.has(to) || to === p) continue;
    const ad = A.forFile(to); const f = byPath.get(to);
    if (!ad || ad.id === 'documents' || !f || typeof f.content !== 'string') continue;
    seen.add(to);
    const sec = units.filter(u => u.start <= d.line && u.end >= d.line).pop();
    const around = lines[d.line - 1] || '';
    let exports = []; try { exports = ad.symbols(f.content, to) || []; } catch (_) { /* unknown: said in open */ }
    modules.push({ id: `MOD-${slug(to.replace(/\.[^.]+$/, ''), 40).toUpperCase().replace(/_/g, '-')}`, name: path.posix.basename(to).replace(/\.[^.]+$/, ''), path: to,
      description: firstSentence(around.replace(/^[-*#>\s]+/, '')) || `named in ${p}${sec ? ` (${sec.name})` : ''}`,
      named_in: `${p}:${d.line}${sec ? ` (${sec.name})` : ''}`, language: ad.language, exports: exports.length ? exports : ['unknown — the adapter could not read its exports'] });
  }
  const open = ['gate_pipeline, behavioral_contracts, error_paths and acceptance for each module (the md does not say them; a reader adds them for specDepth 1.0)',
    ...(modules.length ? [] : ['no module: the document names no file in the repo'])];
  const doc = { spec: {
    meta: { name: meta.name, version: meta.version || '0.0.0', status: 'converted', uuid: `${slug(project, 30)}-${slug(meta.name, 40)}-spec-from-md`,
      origin: `converted from ${p} by Nexus (lib/project-convert.js ${VERSION}, 0.60.286) — James, 2026-10-29: "convert mds". The md is kept beside it and stays the project's own words.`,
      purpose: meta.intent || firstSentence(Object.values(sections)[0] ? Object.values(sections)[0].text : '') || null,
      ...(meta.author ? { author: meta.author } : {}), source_document: p },
    sections, modules, open } };
  const out = `# ${p} as a spec — converted by Nexus; edit the md or this, the md stays\n${yaml.dump(doc, { lineWidth: 140, noRefs: true })}`;
  return { target: _mdTarget(p, paths), text: out, modules: modules.length, sections: Object.keys(sections).length, open };
}

function _prefix(name) {
  const parts = String(name || 'P').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let pfx = parts.map(w => w.replace(/[^A-Z]/g, '')[0] || '').join('').slice(0, 3);
  if (pfx.length < 2) pfx = (parts[0] || 'PX').replace(/[^A-Z]/g, '').slice(0, 2) || 'PX';
  return pfx;
}
function _ys(s) { return JSON.stringify(String(s == null ? '' : s).replace(/\s+/g, ' ').trim()); }

/** every decisions: list anywhere in the spec (Emerge keeps them under sections.s12_open_decisions.decisions) */
function _decisions(o, out = []) {
  if (!o || typeof o !== 'object') return out;
  for (const [k, v] of Object.entries(o)) {
    if (/decisions/.test(k) && Array.isArray(v)) { for (const d of v) if (d && d.id) out.push(d); }
    else if (v && typeof v === 'object') _decisions(v, out);
  }
  return out;
}

/** specPlan — a spec's hard-coded build plan (modules[].build) → a Nexus phasemap; null when the spec carries no plan */
function specPlan(text, { specPath = 'project.spec', name = null } = {}) {
  let d; try { d = yaml.load(String(text || '')); } catch (e) { return { error: `the spec does not parse: ${String(e.message).split('\n')[0]}` }; }
  const spec = d && (d.spec || d);
  const mods = (spec && Array.isArray(spec.modules) ? spec.modules : []).filter(m => m && m.build && typeof m.build === 'object');
  if (!mods.length) return null;
  const meta = spec.meta || {};
  const pfx = _prefix(meta.name || name || specPath);
  const said = [];
  const decs = _decisions(spec);
  const decKey = new Map(); const decTaken = new Set();
  for (const x of decs) { let k = `${pfx}${String(x.id).replace(/[^A-Za-z0-9]/g, '')}_${slug(x.question || x.title || x.id, 40)}`; if (!/^[A-Z]{1,5}\d/.test(k)) k = `${pfx}D${decKey.size + 1}_${slug(x.question || x.id, 40)}`; while (decTaken.has(k)) k += '_'; decTaken.add(k); decKey.set(String(x.id), k); }
  const phaseKey = new Map();
  mods.forEach((m, i) => phaseKey.set(String(m.id), `${pfx}${i + 1}_${slug(m.name || m.id, 40)}`));
  const status = (s) => (/^built$/i.test(s) ? 'DONE' : 'OPEN');
  const phases = mods.map((m, i) => {
    const b = m.build;
    const deps = []; const notes = [];
    for (const x of b.blocked_by || []) { const k = decKey.get(String(x)) || phaseKey.get(String(x)); if (k) deps.push(k); else notes.push(`blocked_by ${x}: not a decision or module of this spec — kept as a note, not an edge`); }
    const files = [...new Set([b.file, ...(b.existing || []).map(e => String(e).split(/[:\s(]/)[0])].filter(f => f && /\.[a-z0-9]+$|\/$/i.test(f)))];
    return { id: phaseKey.get(String(m.id)), module: m.id, name: m.name || m.id, status: status(b.state), state: b.state, deps, files, next: b.next || null, existing: b.existing || [], notes, description: m.description };
  });
  for (const p of phases) for (const n of p.notes) said.push(`${p.id}: ${n}`);
  const target = name ? name : `${specPath.replace(/\.spec$/, '')}-phasemap.spec`;
  const L = [
    `# ${meta.title || meta.name || specPath} — the build plan its spec carries, as a phasemap`,
    '',
    `origin: ${_ys(`converted from ${specPath} (modules[].build and its decisions) by Nexus (lib/project-convert.js ${VERSION}, 0.60.286). James, 2026-10-29: "convert mds, hardcoded phasemaps". The spec's own rule: ${meta.build_plan || 'each module carries build: {state, file, blocked_by, next}'}`)}`,
    '',
    `spec: ${specPath}`,
    `status: ${_ys(`${phases.filter(p => p.status === 'DONE').length} of ${phases.length} built; the spec's build blocks stay the source — convert again after changing them`)}`,
    '',
    'decisions:',
    ...decs.map(x => [`  ${decKey.get(String(x.id))}:`,
      `    status: ${_ys(`${/decided|done|answered/i.test(x.status) ? 'DECIDED' : 'OPEN'} — ${x.id}${x.priority != null ? ` (priority ${x.priority})` : ''}${x.ref ? `, section ${x.ref}` : ''}`)}`,
      `    question: ${_ys(x.question || x.title || '')}`,
      ...(x.resolution ? [`    chosen: ${_ys(x.resolution)}`] : []),
      ...(x.note ? [`    note: ${_ys(x.note)}`] : [])].join('\n')),
    '',
    'phases:',
    ...phases.map(p => [`  ${p.id}:`,
      `    status: ${p.status === 'DONE' ? 'DONE' : _ys(`OPEN — ${p.state}`)}`,
      `    depends_on: [${p.deps.join(', ')}]`,
      `    files: [${p.files.join(', ')}]`,
      `    spec: ${specPath}`,
      `    blocks: [${p.module}]`,
      `    does: ${_ys(p.next || firstSentence(p.description) || p.name)}`,
      ...(p.existing.length ? [`    existing: [${p.existing.map(_ys).join(', ')}]`] : []),
      ...(p.notes.length ? [`    notes: [${p.notes.map(_ys).join(', ')}]`] : [])].join('\n')),
    '',
  ];
  const out = L.join('\n');
  // read back: every phase parses, and the DAG finds no dangling edge
  const back = require('./phasemap-parse.js').parsePhasemapText(out, path.posix.basename(target)).filter(x => x.kind !== 'decision');
  if (back.length !== phases.length) return { error: `the converted map does not read back: ${phases.length} written, ${back.length} parsed`, text: out };
  const DAG = require('./phase-dag.js'); const dag = DAG.build([{ path: target, text: out }]);
  const problems = phases.flatMap(p => DAG.problems(dag, p.id).map(x => `${p.id}: ${x}`));
  const done = new Set(phases.filter(p => p.status === 'DONE').map(p => p.id));
  const openDec = new Set(decs.filter(x => !/decided|done|answered/i.test(x.status)).map(x => decKey.get(String(x.id))));
  const next = phases.filter(p => p.status !== 'DONE' && p.deps.every(x => done.has(x) || (!openDec.has(x) && decTaken.has(x)))).map(p => p.id);
  return { target, text: out, phases: phases.map(({ description: _d, ...p }) => p), decisions: decs.map(x => ({ id: x.id, key: decKey.get(String(x.id)), status: x.status, question: x.question })), next, said, problems };
}

/** plan(files) — what a conversion would write: an md with no spec beside it; a spec with a build plan and no phasemap beside it */
function plan(files) {
  const list = files.filter(f => f && f.path && !SKIP.test(String(f.path).replace(/\\/g, '/')));
  const paths = new Set(list.map(f => String(f.path).replace(/\\/g, '/')));
  const mds = []; const specPlans = [];
  for (const f of list) {
    const p = String(f.path).replace(/\\/g, '/');
    if (/\.(md|markdown)$/i.test(p)) { const base = p.replace(/\.(md|markdown)$/i, ''); const exists = paths.has(`${base}.spec`) || paths.has(`${base}.md.spec`); mds.push({ path: p, target: exists ? (paths.has(`${base}.md.spec`) ? `${base}.md.spec` : `${base}.spec`) : _mdTarget(p, paths), exists }); }
    else if (/\.spec$/i.test(p) && !/-phasemap\.spec$/i.test(p) && typeof f.content === 'string' && /\n\s+build:\s*(\n|\{)/.test(f.content)) {
      const target = `${p.replace(/\.spec$/, '')}-phasemap.spec`;
      let modules = 0; try { const d = yaml.load(f.content); modules = ((d && (d.spec || d).modules) || []).filter(m => m && m.build).length; } catch (_) { /* counted as 0: said by specPlan */ }
      if (modules) specPlans.push({ path: p, target, modules, exists: paths.has(target) });
    }
  }
  return { mds, specPlans };
}

module.exports = { MODULE_ID, VERSION, mdToSpec, specPlan, plan };
