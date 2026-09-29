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
