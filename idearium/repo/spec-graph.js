/**
 * idearium/repo/spec-graph.js — the SPECIFICATION graph for an imported repo.
 * UUID: nexus-idearium-repo-spec-graph-v1-0000-2026-0925-jamesbrooks-001
 *
 * James: "can you make sure the 3 graphs are hooked in?" — the three graphs
 * from the 2026-09-19 graph-field design, kept separate, sharing file ids:
 *   code        what the source says       repo/graph.js         (GRAPHING)
 *   execution   what actually ran          repo/runtime-proof.js (lazy pass)
 *   spec        what is declared           THIS FILE             (SPEC-GRAPHING)
 * "The disagreement is the diagnostic." This file builds the spec graph
 * from every catalog .spec in the repo (spec-engine/manifest — the same
 * builder `idearium manifest` uses, not a second parser) and records where
 * it disagrees with the code graph, as findings in the design's own shape:
 *   { entity, graphs, claims, kind: 'ledger_divergence', divergence }
 *
 * §HONEST SCOPE. A declared dependency with no matching import is not
 * automatically a bug: a component that gets its neighbours injected
 * through the registry never imports them. That is why each finding names
 * both claims and the divergence kind, rather than calling one graph wrong.
 */
import fs from 'fs';
import path from 'path';
import { generate } from '../spec-engine/manifest/index.js';

export const MODULE_ID = 'nexus-idearium-repo-spec-graph-v1-0000-2026-0925-jamesbrooks-001';
export const SPEC_GRAPH_VERSION = 1;
export const SPEC_GRAPH_FILE = 'spec-graph.json';           // beside graph.json (code) and proof.json (execution)
const CATALOG = /\bfile\s+"[^"]+"\s*\{/;

/** Map a catalog path (relative to its system) onto a repo file path. Exact, then unique suffix. */
function _resolver(repoPaths) {
  const set = new Set(repoPaths);
  return (p, specDir) => {
    if (!p || p.includes('<')) return null;                       // template paths (compartments/<n>/…) are not files
    for (const cand of [p, specDir && path.posix.join(specDir, p)]) if (cand && set.has(cand)) return cand;
    const hits = repoPaths.filter(r => r.endsWith('/' + p));
    return hits.length === 1 ? hits[0] : null;
  };
}

function _codeImports(codeGraph) {
  const out = new Map();                                          // file path → Set(imported file paths)
  for (const e of (codeGraph && codeGraph.edges) || []) {
    if (e.relation !== 'imports' || !e.to || e.resolution !== 'resolved') continue;
    const from = String(e.from).replace(/^file:/, ''), to = String(e.to).replace(/^file:/, '');
    if (!out.has(from)) out.set(from, new Set());
    out.get(from).add(to);
  }
  return out;
}

/**
 * buildSpecGraph({ repoDir, files, codeGraph }) — files: [{ path }] (indexes/files.json).
 * → { specGraphVersion, status, sources[], disagreements[], summary }
 * status: 'built' | 'not_applicable' (no catalog .spec in the repo)
 */
export function buildSpecGraph({ repoDir, files = [], codeGraph = null } = {}) {
  const repoPaths = files.map(f => f.path);
  const specFiles = repoPaths.filter(p => p.endsWith('.spec')).filter(p => {
    try { return CATALOG.test(fs.readFileSync(path.join(repoDir, p), 'utf8')); } catch (_) { return false; }
  });
  if (!specFiles.length) {
    return { specGraphVersion: SPEC_GRAPH_VERSION, status: 'not_applicable',
      reason: 'no .spec in this repo declares a file catalog (file "path" { … } blocks)', sources: [], disagreements: [],
      summary: { specs: 0, entries: 0, errors: 0, disagreements: 0 } };
  }
  const resolve = _resolver(repoPaths);
  const imports = _codeImports(codeGraph);
  const sources = [], disagreements = [];

  for (const specPath of specFiles) {
    const r = generate(fs.readFileSync(path.join(repoDir, specPath), 'utf8'), { source: specPath });
    const specDir = path.posix.dirname(specPath) === '.' ? '' : path.posix.dirname(specPath);
    const entries = (r.manifest && r.manifest.entries) || [];
    const fileOf = new Map(entries.map(e => [e.id, resolve(e.file, specDir)]));
    const inSpec = new Set([...fileOf.values()].filter(Boolean));
    let resolved = 0;

    for (const e of entries) {
      const from = fileOf.get(e.id);
      if (!from) continue;
      resolved++;
      const declared = new Set(e.depends.map(d => fileOf.get(d)).filter(Boolean));
      const actual = imports.get(from) || new Set();
      for (const to of declared) if (!actual.has(to)) disagreements.push({
        entity: `${from} → ${to}`, graphs: ['spec', 'code'], kind: 'ledger_divergence', divergence: 'declared_not_imported',
        claims: [{ graph: 'spec', says: 'depends', source: specPath }, { graph: 'code', says: 'no import' }] });
      for (const to of actual) if (inSpec.has(to) && !declared.has(to)) disagreements.push({
        entity: `${from} → ${to}`, graphs: ['spec', 'code'], kind: 'ledger_divergence', divergence: 'imported_not_declared',
        claims: [{ graph: 'code', says: 'imports' }, { graph: 'spec', says: 'no depends', source: specPath }] });
    }
    sources.push({ file: specPath, format: r.format, ok: r.ok,
      entries: entries.length, resolvedToRepoFiles: resolved, notInRepo: entries.length - resolved,
      violations: r.violations, buildOrder: r.manifest ? r.manifest.buildOrder : [], layers: r.manifest ? r.manifest.layers : [],
      entriesDetail: entries.map(e => ({ id: e.id, file: e.file, repoFile: fileOf.get(e.id) || null, intent: e.intent, depends: e.depends, layer: e.layer })) });
  }
  const errors = sources.reduce((n, s) => n + s.violations.filter(v => v.severity === 'error').length, 0);
  return { specGraphVersion: SPEC_GRAPH_VERSION, status: 'built', sources, disagreements,
    summary: { specs: sources.length, entries: sources.reduce((n, s) => n + s.entries, 0), errors, disagreements: disagreements.length } };
}

export function writeSpecGraph(repoDir, sg) {
  const p = path.join(repoDir, SPEC_GRAPH_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(sg, null, 2), 'utf8');
  return p;
}

export function readSpecGraph(repoDir) {
  try { return JSON.parse(fs.readFileSync(path.join(repoDir, SPEC_GRAPH_FILE), 'utf8')); } catch (_) { return null; }
}
