/**
 * idearium/repo/spec-plan.js — a spec's whole build as phases: chunked, bottom-up, with the axioms. §0.39.280 BS5.
 * UUID: nexus-idearium-repo-spec-plan-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-build-surface-phasemap.spec (BS5).
 *
 * James: "i want each spec to have the entire build split into phases, chunked, bottom up, and with the axioms."
 * "make sure you follow, the axioms in the docs folder, 3.1."
 *
 * The phasemap is written by the repo's agent (it reads the spec with its tools; this names what to write and how it
 * is checked), as a FILE next to the spec — <spec dir>/<spec name>-phasemap.spec — so it is versioned with the repo
 * and loom's own parser reads it (the Phases tab shows it with every other map). Nothing is invented here: a map that
 * does not come back is simply not there, and the Spec tab says so.
 *
 *   LAYERS                   foundation · library · api · cli · automation · ui   (AXIOMS §3.4, lowest first)
 *   AXIOMS                   the laws every generated phase carries (§ numbers from docs/AXIOMS-v3.1.md)
 *   phasemapPathFor(spec)    where a spec's phasemap lives
 *   planPrompt({ repo, specPath, specText, mapPath, axiomsText })   what the agent is asked
 *   validatePlan(text, name) loom-parsed phases + each one's layer / proof; refused when not bottom-up (I1), when a
 *                            phase has no layer or no proof, or when it depends on a phase that is not in the map
 *   orderPhases(phases)      the build order: layer, then dependencies (Kahn), then map order
 *   nextReady(phases)        the first not-complete phase whose dependencies are all complete
 */
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const LAYERS = ['foundation', 'library', 'api', 'cli', 'automation', 'ui'];
export const AXIOMS = [
  ['§3.1', 'Bottom-up only. Foundation and architecture first.'],
  ['§3.3', 'Map before build. The map is a written artifact, not memory.'],
  ['§3.4', 'Raw execution before interfaces. Raw code → library → API → CLI → automation → UI.'],
  ['§1.1', 'Nothing exists until proven.'],
  ['§1.3', 'No fake, mock, stub, placeholder, or skeleton in production.'],
  ['§0.3', 'Information must never be lost.'],
  ['§8.6', 'Reuse before build. Check the codebase first.'],
  ['§12.1', 'Every runtime file has a brutal, recursive test suite.'],
  ['§17.5', 'Every output has provenance.'],
];

export function phasemapPathFor(specPath) {
  const dir = path.posix.dirname(String(specPath).replace(/\\/g, '/'));
  const base = path.posix.basename(String(specPath)).replace(/\.spec$/i, '');
  return `${dir === '.' ? '' : dir + '/'}${base}-phasemap.spec`;
}

const sha = (s) => crypto.createHash('sha256').update(String(s || '')).digest('hex');

export function planPrompt({ repo, specPath, specText = '', mapPath = phasemapPathFor(specPath), prefix = null }) {
  const id = prefix || (path.posix.basename(specPath).replace(/\.spec$/i, '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'P');
  return {
    mapPath, prefix: id, specSha256: sha(specText),
    message: [
      `Plan the WHOLE build of the spec ${specPath} in ${repo.name} as a phasemap, and write it to ${mapPath}.`,
      '',
      'Read the spec with your tools first (every section), and what already exists in the repo (reuse before build).',
      'Split the build into phases, each small enough to build and prove in one go (chunked), ordered BOTTOM-UP by layer:',
      `  ${LAYERS.join(' → ')}   (a phase depends only on phases in its own or a lower layer)`,
      '',
      'Every phase carries the axioms that bind it. The axioms (docs/AXIOMS-v3.1.md):',
      ...AXIOMS.map(([n, t]) => `  ${n} ${t}`),
      '',
      // §RS9 0.49.0 — every phase names the spec blocks it builds (blocks:), so the spec, its phases, their runs and
      // files are one thread; the ids are the spec's own (lib/spec-document.js), a custom id as written
      `The spec's blocks, by id — every phase names the ones it builds in blocks: (each block in at least one phase): ${(() => { const b = _docBlocks(specText, specPath); return b.length ? b.map(x => JSON.stringify(x.key)).join(', ') : '(none found — name the sections you build)'; })()}`,
      '',
      'Write the file in exactly this shape (loom reads it; ids are ' + id + '<n>_<snake_name>, two-space indent under phases:):',
      'spec:',
      '  meta:',
      `    name: ${path.posix.basename(mapPath).replace(/\.spec$/, '')}`,
      `    spec: ${specPath}`,
      `    spec_sha256: ${sha(specText)}`,
      '    axioms: docs/AXIOMS-v3.1.md §3.1 §3.3 §3.4 …',
      '  phases:',
      `    ${id}0_<name>:`,
      '      layer: foundation',
      '      status: OPEN',
      '      depends_on: []',
      '      axioms: [§3.1, §1.3, …]',
      '      blocks: [<the ids of the spec blocks this phase builds, from the list below>]',
      '      files: [<paths it creates or changes>]',
      '      does: >-',
      '        <what it builds, the spec sections it covers>',
      '      proof: >-',
      '        <the test or check that proves it>',
      '',
      'Write the whole file as one addressed code block for ' + mapPath + ' so it is captured and applied. Do not build any phase yet.',
    ].join('\n'),
  };
}

function _field(lines, name) {
  const i = lines.findIndex(l => new RegExp(`^\\s+${name}:`).test(l));
  if (i === -1) return '';
  const v = lines[i].replace(new RegExp(`^\\s+${name}:\\s*`), '').trim();
  if (v && !/^[>|]-?$/.test(v)) return v;
  const ind = (lines[i].match(/^\s*/) || [''])[0].length;
  const out = [];
  for (let j = i + 1; j < lines.length && ((lines[j].match(/^\s*/) || [''])[0].length > ind || !lines[j].trim()); j++) out.push(lines[j].trim());
  return out.join(' ').trim();
}
const _ids = (s) => String(s || '').replace(/[[\]]/g, '').split(',').map(x => x.trim().split(/[\s#]/)[0]).filter(Boolean);
const _short = (id) => String(id).split('_')[0];

export function validatePlan(text, name = 'phasemap') {
  const loom = require('../../loom/scanners/phasemap-map.js');
  const lines = String(text || '').split('\n');
  const parsed = loom.parsePhasemapText(text, name);
  const problems = [];
  if (!parsed.length) problems.push('no phases (ids like P0_name: under phases:)');
  const phases = parsed.map((p, i) => {
    const body = lines.slice(p.line, p.bodyEnd);
    const layer = _field(body, 'layer').toLowerCase();
    const deps = _ids(_field(body, 'depends_on'));
    return { id: p.id, key: _short(p.id), order: i, status: p.status, layer, layerIndex: LAYERS.indexOf(layer), depends_on: deps,
      axioms: _ids(_field(body, 'axioms')), files: _ids(_field(body, 'files')), does: _field(body, 'does'), proof: _field(body, 'proof') };
  });
  const byKey = new Map(phases.map(p => [p.key, p]));
  for (const p of phases) {
    if (p.layerIndex === -1) problems.push(`${p.id}: layer "${p.layer || '(none)'}" is not one of ${LAYERS.join(', ')}`);
    if (!p.proof) problems.push(`${p.id}: no proof — how is it checked? (§1.1)`);
    for (const d of p.depends_on) {
      const q = byKey.get(_short(d));
      if (!q) { problems.push(`${p.id}: depends on ${d}, which is not in this map`); continue; }
      if (q.layerIndex > p.layerIndex && p.layerIndex !== -1) problems.push(`${p.id} (${p.layer}) depends on ${q.id} (${q.layer}) — a higher layer; bottom-up only (§3.1)`);
    }
  }
  const meta = { spec: (text.match(/^\s+spec:\s*(\S+)/m) || [])[1] || null, specSha256: (text.match(/^\s+spec_sha256:\s*([0-9a-f]{64})/m) || [])[1] || null };
  return { ok: problems.length === 0, problems, phases, meta };
}

export function orderPhases(phases) {
  const byKey = new Map(phases.map(p => [p.key, p]));
  const done = new Set(), out = [];
  const pending = [...phases].sort((a, b) => (a.layerIndex - b.layerIndex) || (a.order - b.order));
  while (pending.length) {
    const i = pending.findIndex(p => p.depends_on.every(d => !byKey.has(_short(d)) || done.has(_short(d))));
    const next = pending.splice(i === -1 ? 0 : i, 1)[0];   // a cycle is broken in layer/map order, never dropped
    done.add(next.key); out.push(next);
  }
  return out;
}

export function nextReady(phases, isComplete = (p) => p.status === 'done' || p.status === 'complete') {
  const byKey = new Map(phases.map(p => [p.key, p]));
  return orderPhases(phases).find(p => !isComplete(p) && p.depends_on.every(d => { const q = byKey.get(_short(d)); return !q || isComplete(q); })) || null;
}

// ── §0.39.284 W2 — a plan that always lands ─────────────────────────────────
// James's Plan panel: three plan runs "replied … no …-phasemap.spec came back". A small local model (a 3B coder,
// 4k context) answers but does not write the addressed block. Two ways the map still lands, both with provenance:
//   planFromReply(text)   the agent wrote the map in its reply without the addressed block → taken from the text
//   derivePlan(...)       the agent wrote no usable map → the plan is derived from the spec's own sections, one phase
//                         per section (small ones grouped), its layer read from the section's name and text. A
//                         mechanical reading of the spec, never presented as the agent's: meta.planned_by says so.

const _SKIP = require('../../lib/spec-document.js').BOOKKEEPING;   // §RS9 — one rule for what is bookkeeping (lib/spec-document.js)
// order matters: the first rule whose words appear in the section's name (then its text) sets its layer
const _LAYER_RULES = [
  ['ui', /\b(ui|ux|view|views|panel|panels|page|pages|screen|canvas|render|renderer|widget|display|theme|css|html|layout|visual|dashboard|window|frontend|gui|animation|graph_view)\b/i],
  ['cli', /\b(cli|command|commands|terminal|shell|repl|argv|flags?)\b/i],
  ['automation', /\b(automation|loop|loops|schedul\w*|cron|daemon|watch\w*|trigger\w*|job|jobs|worker|queue|pipeline|autopilot|heal\w*|agent|agents)\b/i],
  ['api', /\b(api|apis|route|routes|endpoint\w*|http|rest|server|rpc|websocket|protocol|contract|ports?|bridge|ipc|sse)\b/i],
  ['foundation', /\b(primitive\w*|types?|schema\w*|model|models|data|state|config\w*|constant\w*|values?|enums?|identity|ids?|storage|store|persistence|format|spec|axioms?|kernel|core|foundation|invariants?|structures?|records?)\b/i],
  ['library', /./],
];
const _AXIOMS_BY_LAYER = { foundation: ['§3.1', '§1.1', '§1.3', '§0.3'], library: ['§3.1', '§8.6', '§1.3', '§12.1'], api: ['§3.4', '§1.1', '§12.1', '§17.5'],
  cli: ['§3.4', '§1.1', '§12.1'], automation: ['§3.4', '§1.1', '§12.1', '§0.3'], ui: ['§3.4', '§1.3', '§12.1'] };

function _layerOf(key, text) {
  // the section's NAME decides when it names a layer; otherwise its text, by which layer's words it uses most
  const name = String(key).replace(/[_.-]+/g, ' ');
  for (const [layer, re] of _LAYER_RULES) if (layer !== 'library' && re.test(name)) return layer;
  if (/\b(engine|graph|lib|library|module|runtime|process\w*|compute|algorithm|logic|service|manager|registry)\b/i.test(name)) return 'library';
  const body = String(text || '').slice(0, 2000).replace(/[_.-]+/g, ' ');
  let best = 'library', hits = 1;
  for (const [layer, re] of _LAYER_RULES) {
    if (layer === 'library') continue;
    const n = (body.match(new RegExp(re.source, 'gi')) || []).length;
    if (n > hits) { best = layer; hits = n; }
  }
  return hits >= 3 ? best : 'library';
}
const _snake = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'part';
const _oneLine = (s, n = 220) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const _q = (s) => JSON.stringify(String(s));

/** sectionsOf(specText) -> [{ key, line, text }] — the spec's own top-level sections with their text (YAML or not). */
export function sectionsOf(specText) {
  const src = String(specText || '');
  const lines = src.split('\n');
  // §0.47.0 SP1 — the workshop / library form (spec: meta + sections: [{ id, title, body }]) is read as its sections, one
  // each, by title — splitting it on its top-level keys made two phases, 'spec' and 'sections', of raw YAML. A blank
  // section is kept, marked blank: there is nothing to build from it until it is completed (SP2).
  if (/^sections:\s*$/m.test(src)) {
    let list = null;
    try { const y = require('js-yaml').load(src); if (y && Array.isArray(y.sections)) list = y.sections.filter(x => x && typeof x === 'object'); } catch (_) { list = null; }
    if (list && list.length) return list.map(x => {
      const id = String(x.id || x.title || 'section'), body = String(x.body == null ? '' : x.body);
      const at = lines.findIndex(l => new RegExp(`^\\s*-?\\s*id:\\s*['"]?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*$`).test(l));
      return { key: id, title: String(x.title || id), line: at + 1 || 1, text: body, blank: !body.trim() };
    }).filter(s => !_SKIP.test(s.key) && !require('../../lib/spec-document.js').FRAMING.test(s.key));   // one rule (lib/spec-document.js)   // the idea's own framing: context for every phase, not one to build
  }
  // the body's keys: under a single root (spec:, x:) they sit at 2 spaces; a flat file has them at 0
  const tops = lines.map((l, i) => ({ l, i })).filter(x => /^[A-Za-z_][\w.-]*:/.test(x.l));
  const rootOnly = tops.length === 1;
  const re = rootOnly ? /^ {2}[A-Za-z_][\w.-]*:/ : /^[A-Za-z_][\w.-]*:/;
  const heads = lines.map((l, i) => ({ l, i })).filter(x => re.test(x.l) && !/^\s*#/.test(x.l));
  const out = [];
  for (let k = 0; k < heads.length; k++) {
    const key = heads[k].l.trim().split(':')[0];
    const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    out.push({ key, line: heads[k].i + 1, text: lines.slice(heads[k].i, end).join('\n') });
  }
  // markdown specs: ## headings
  if (!out.length) {
    const h = lines.map((l, i) => ({ l, i })).filter(x => /^#{1,3}\s+\S/.test(x.l));
    for (let k = 0; k < h.length; k++) {
      const end = k + 1 < h.length ? h[k + 1].i : lines.length;
      out.push({ key: h[k].l.replace(/^#+\s+/, '').trim(), line: h[k].i + 1, text: lines.slice(h[k].i, end).join('\n') });
    }
  }
  return out.filter(s => !_SKIP.test(s.key));
}

/**
 * derivePlan({ specPath, specText, mapPath, prefix, maxPhases, reason }) -> { ok, text, phases, sections, problems }
 * One phase per section, ordered bottom-up; consecutive small sections of one layer are grouped so the map stays
 * within maxPhases. Each phase depends on the one before it in its own layer and on the top of the layer below.
 */
/** _docBlocks(text, path) — the spec's blocks as sections ({ key: id, line, text, hash }); the preamble and the
 *  bookkeeping keys (_SKIP: meta, history, notes …) are not planned. Empty when the document reader is absent. */
function _docBlocks(specText, specPath) {
  try {
    const D = require('../../lib/spec-document.js');
    return D.parse(specText, { path: specPath }).blocks.filter(b => !D.isBookkeeping(b))
      .map(b => ({ key: b.id, line: b.line, text: b.text, hash: b.hash }));
  } catch (_) { return []; }
}
export function derivePlan({ specPath, specText = '', mapPath = phasemapPathFor(specPath), prefix = null, maxPhases = 24, reason = 'derived from the spec' } = {}) {
  const id = prefix || (path.posix.basename(specPath).replace(/\.spec$/i, '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'P');
  // §0.47.0 SP1 (main) — the workshop / library form is read as its sections (title, blank); a blank section is not a
  // phase until it is completed. §RS9 0.49.0 / 0.49.0 — every other spec is cut by its own blocks (lib/spec-document.js:
  // emerge domains, YAML keys, headings); either way each section carries its block's hash at plan time, so a phase names
  // exactly the blocks it serves and an edited block marks it stale.
  const docBlocks = _docBlocks(specText, specPath);
  const hashOf = new Map(docBlocks.map(b => [b.key, b.hash]));
  const listForm = /^sections:\s*$/m.test(String(specText || ''));
  const all = (listForm || !docBlocks.length ? sectionsOf(specText) : docBlocks).map(x => ({ ...x, hash: x.hash || hashOf.get(x.key) || null }));
  const blank = all.filter(s => s.blank).map(s => s.key);
  const secs = all.filter(s => !s.blank).map((s, i) => ({ ...s, order: i, layer: _layerOf(s.key, `${s.title || ''}\n${s.text}`) }));
  if (!secs.length) return { ok: false, problems: [blank.length ? `every section is blank (${blank.join(', ')}) — complete them first` : 'the spec has no sections to plan from'], sections: [], blank };
  // group: within a layer, merge neighbours until the phase count fits
  const byLayer = LAYERS.map(L => secs.filter(s => s.layer === L));
  let groups = byLayer.map(list => list.map(s => [s]));
  const count = () => groups.reduce((n, g) => n + g.length, 0);
  while (count() > maxPhases) {
    // merge the two smallest neighbours in the layer with the most groups
    const li = groups.reduce((best, g, i) => (g.length > groups[best].length ? i : best), 0);
    const g = groups[li]; if (g.length < 2) break;
    let bi = 0, bsz = Infinity;
    for (let k = 0; k + 1 < g.length; k++) { const sz = g[k].reduce((n, s) => n + s.text.length, 0) + g[k + 1].reduce((n, s) => n + s.text.length, 0); if (sz < bsz) { bsz = sz; bi = k; } }
    g.splice(bi, 2, [...g[bi], ...g[bi + 1]]);
  }
  const phases = []; let n = 0; let lastOfLower = null;
  LAYERS.forEach((L, li) => {
    let prevInLayer = null;
    for (const grp of groups[li]) {
      const keys = grp.map(s => s.key);
      const pid = `${id}${n++}_${_snake(keys.length > 1 ? `${keys[0]}_and_${keys.length - 1}_more` : keys[0])}`;
      const deps = [prevInLayer, prevInLayer ? null : lastOfLower].filter(Boolean);
      const lines = grp.map(s => `§${s.key} (line ${s.line})`).join(', ');
      // §0.47.0 SP1 — a titled section says what it is in its own words: "<title>: <its first sentence>"
      const titled = grp[0].title != null;
      const first = titled ? _oneLine(String(grp[0].text).replace(/^#+\s.*$/m, '').split(/(?<=[.!?])\s/)[0], 200) : _oneLine(grp[0].text.split('\n').slice(1).join(' '), 200);
      const does = titled ? `${grp.map(s => s.title).join(' · ')}${first ? ` — ${first}` : ''} (${lines})` : `Build what the spec states in ${lines}${first ? ` — ${first}` : ''}.`;
      phases.push({ id: pid, layer: L, depends_on: deps, sections: keys, title: titled ? grp.map(s => s.title).join(' · ') : null, does,
        proof: `A test that proves ${keys.join(', ')} as the spec states it, against the real code (no mock): §1.1, §12.1.` });
      prevInLayer = pid;
    }
    if (prevInLayer) lastOfLower = prevInLayer;
  });
  const now = new Date().toISOString();
  const text = [
    'spec:',
    '  meta:',
    `    name: ${path.posix.basename(mapPath).replace(/\.spec$/, '')}`,
    `    spec: ${specPath}`,
    `    spec_sha256: ${sha(specText)}`,
    // §RS9 — each block's hash when this map was planned: a block whose hash moves makes its phases stale
    ...(secs.some(x => x.hash) ? ['    block_hashes:', ...secs.filter(x => x.hash).map(x => `      ${JSON.stringify(x.key)}: ${x.hash.slice(0, 16)}`)] : []),
    '    axioms: docs/AXIOMS-v3.1.md §3.1 §3.3 §3.4 §1.1 §1.3 §0.3 §8.6 §12.1 §17.5',
    '    planned_by: idearium/repo/spec-plan.js derivePlan',
    `    planned_at: ${now}`,
    `    reason: ${_q(reason)}`,
    `    note: ${_q('One phase per section of the spec, its layer read from the section. Refine any phase, or ask the agent to plan again (replan) — this map is versioned.')}`,
    ...(blank.length ? [`    blank: [${blank.map(_snake).join(', ')}]   # sections with nothing in them yet — not phases until they are completed`] : []),
    '  phases:',
    ...phases.flatMap(p => [
      `    ${p.id}:`,
      ...(p.title ? [`      name: ${_q(p.title)}`] : []),
      `      layer: ${p.layer}`,
      '      status: OPEN',
      `      depends_on: [${p.depends_on.join(', ')}]`,
      `      axioms: [${_AXIOMS_BY_LAYER[p.layer].join(', ')}]`,
      '      blocks:',
      ...p.sections.map(s => `        - ${JSON.stringify(s)}`),
      '      files: []',
      '      does: >-',
      `        ${p.does}`,
      '      proof: >-',
      `        ${p.proof}`,
      '',
    ]),
  ].join('\n');
  const v = validatePlan(text, path.posix.basename(mapPath).replace(/\.spec$/, ''));
  return { ok: v.ok, problems: v.problems, text, phases: v.phases, sections: secs.length, blank };
}

/** planFromReply(reply, name) -> { ok, text } | null — a phasemap the agent wrote in its reply text (fenced or bare). */
export function planFromReply(reply, name = 'phasemap') {
  const src = String(reply || '');
  const cands = [];
  const fence = /```[^\n]*\n([\s\S]*?)```/g; let m;
  while ((m = fence.exec(src))) if (/^\s*phases:/m.test(m[1])) cands.push(m[1]);
  const bare = src.search(/^spec:\s*$/m);
  if (bare !== -1) cands.push(src.slice(bare).split(/\n```/)[0]);
  for (const c of cands) {
    const text = c.replace(/\s+$/, '') + '\n';
    const v = validatePlan(text, name);
    if (v.ok) return { ok: true, text, phases: v.phases };
  }
  return null;
}
