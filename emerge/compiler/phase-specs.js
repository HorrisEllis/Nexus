'use strict';
/**
 * emerge/compiler/phase-specs.js — PS1: each phase specced again, with its DAG and its related files, beside the system that owns it.
 * comp_id: nexus.emerge.phase-specs
 * Lives in emerge (the spec compiler's system), not lib/: it compiles specs with emerge's kg-builder, and lib/ requiring emerge/ is
 * a new upward crossing (lib/system-boundary.js). From here its uses of lib/ are the allowed system-uses-kernel kind.
 * Spec: docs/substrate.spec MOD-PHASE-SPECS · Map: docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec PS1
 *
 * James, 2026-10-20: "not phasemaps. full specs to build them. everything needs  to be speccced before built,so it can be rebuilt
 * if lost. can you do that? what about specs, then phases then specced again with dag and related files for it, look at the
 * handoff"
 *
 * His order, as tooling: (1) a full spec (emerge module format, compiled by emerge/compiler/kg-builder.js), (2) its phases in a
 * phasemap, each naming the spec (`spec:`) and the modules it builds (`blocks:`), (3) THIS: every phase written again as nodes —
 *   <owner>/phases/<map-id>/<phase>.phase         authored: id, map, layer, status, files, depends_on, blocks, spec, graph hash
 *   <owner>/phases/<map-id>/graph/<…>.graph       derived: files with roles (changes, uses, used-by), edges, crossings, dag slice
 * (the handoff of 2026-10-19, PN1's layout: the .phase holds what is authored; the DAG slice is derived, in its own .graph keyed by
 * its hash). Owner = lib/phase-plan.js targetSystem over the phase's files; core's home is lib/.
 * Reuse (§8.6): phase-dag (the whole DAG, slice), phase-map-auto (files, requires, consumers), phase-graph (graphFor, crossings),
 * pipeline-nodes (phaseNode, graphNode, writeNode), emerge's kg-builder (what a spec declares). Nothing here asks a model.
 *
 *   write({ root, map, mapsDir, out }) → [{ phase, owner, phaseFile, graphFile, ready, blocks: { resolved, missing } }]
 *   check({ root, map, mapsDir, out }) → [{ phase, drift: [why] }]   — re-derives and compares with the files on disk
 *   cli: node emerge/compiler/phase-specs.js <map.spec> [--check]
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.emerge.phase-specs';
const VERSION = '1.1.0';   // 1.1.0 PS2 --all
const ROOT = path.resolve(__dirname, '../..');

const _field = (body, k) => { const m = String(body || '').match(new RegExp(`^\\s{4}${k}:\\s*(.+)$`, 'm')); return m ? m[1].trim() : null; };
const _list = (v) => (v ? v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean) : []);
const _mapId = (map) => path.basename(String(map)).replace(/-phasemap\.spec$/, '').replace(/\.spec$/, '');

/** the ids a spec declares (modules, schemas, interfaces, by id and by name), through emerge's own knowledge-graph builder */
function specIds(specPath) {
  const yaml = require('js-yaml');
  const raw = yaml.load(fs.readFileSync(specPath, 'utf8'));
  const { build } = require('./kg-builder.js');
  const r = build(raw && raw.spec ? raw.spec : raw);
  if (!r || !r.ok) throw new Error(`the spec did not build: ${(r && r.error) || 'kg-builder returned no graph'}`);
  const ids = new Set();
  const nodes = r.graph.nodes instanceof Map ? [...r.graph.nodes.values()] : (r.graph.nodes || []);
  for (const n of nodes) if (!n.isBlack) { ids.add(n.id); if (n.name) ids.add(n.name); }
  return ids;
}

function _ownerDir(owner, SYS) {
  if (!owner || owner === 'core') return 'lib';
  try { const s = SYS.get(owner); const r = s && (s.roots || s.dirs); if (r && r.length) return r[0]; } catch (_) {}
  return 'lib';
}

/** derive(...) → per phase: the nodes to write, without writing them */
function derive({ root = ROOT, map, mapsDir = path.join(root, 'docs') } = {}) {
  const PD = require('../../lib/phase-dag.js'), PF = require('../../lib/phase-files.js'), PMA = require('../../lib/phase-map-auto.js');
  const PG = require('../../lib/phase-graph.js'), PN = require('../../lib/pipeline-nodes.js'), PP = require('../../lib/phase-plan.js');
  const SYS = require('../../lib/nexus-self/systems.js');
  const mapRel = path.relative(root, path.resolve(root, map)).split(path.sep).join('/');
  const mapText = fs.readFileSync(path.join(root, mapRel), 'utf8');
  const maps = fs.readdirSync(mapsDir).filter(f => f.endsWith('-phasemap.spec'))
    .map(f => { const p = path.relative(root, path.join(mapsDir, f)).split(path.sep).join('/'); return { path: p, text: fs.readFileSync(path.join(root, p), 'utf8') }; });
  if (!maps.some(m => m.path === mapRel)) maps.push({ path: mapRel, text: mapText });
  const dag = PD.build(maps, {});
  const env = PMA.envFromTree(root);
  const systemOf = PG.boundarySystemOf(root);
  let baseline = null; try { baseline = PG.baselineEdges(root); } catch (_) { baseline = null; }
  const specCache = new Map();
  const out = [];
  const seenIds = new Set();
  for (const ph of PF.phasesOf(mapText, mapRel)) {
    if (seenIds.has(ph.id)) continue; seenIds.add(ph.id);   // 0.60.227 the first definition is the phase; a later same id is a note about it
    const key = `${mapRel}::${ph.id}`;
    const node = dag.nodes[key];
    const spec = _field(ph.body, 'spec');
    const blocks = _list(_field(ph.body, 'blocks'));
    let ids = null, specError = null;
    if (spec) {
      if (!specCache.has(spec)) { try { specCache.set(spec, { ids: specIds(path.join(root, spec)) }); } catch (e) { specCache.set(spec, { error: e.message }); } }
      const c = specCache.get(spec); ids = c.ids || null; specError = c.error || null;
    }
    const resolved = ids ? blocks.filter(b => ids.has(b)) : [];
    const missing = ids ? blocks.filter(b => !ids.has(b)) : blocks.slice();
    const mapped = PMA.mapPhase(ph, env);
    const graph = PG.graphFor({ phase: ph.id, map: mapRel, mapped, mapText, depsGate: null, systemOf, baselineEdges: baseline });
    const slice = node ? PD.slice(dag, key) : null;
    if (slice) graph.dag = { dagHash: slice.dagHash, layer: slice.layer, deps: slice.deps, dependents: slice.dependents, upstream: slice.upstream, downstream: slice.downstream,
      blockedBy: slice.blockedBy, unlocks: slice.unlocks, conflicts: slice.conflicts, dangling: slice.dangling, lines: PD.lines(slice) };
    const files = node ? node.files : [];
    const owner = PP.targetSystem({ files, tags: [], ownerOf: SYS.ownerOf, tagSystem: SYS.systemForLoomTag }).system || 'core';
    const dir = path.join(_ownerDir(owner, SYS), 'phases', _mapId(mapRel));
    const graphEnv = PN.graphNode({ ...graph, for: ph.id }, { kind: 'phase' });
    const phaseEnv = PN.phaseNode({ id: ph.id, map: mapRel, layer: _field(ph.body, 'layer'), status: _field(ph.body, 'status') || 'OPEN',
      files, depends_on: node ? node.deps.map(d => d.split('::').pop()) : _list(_field(ph.body, 'depends_on')), blocks, spec, graph: graph.hash });
    out.push({ phase: ph.id, owner, dir, ready: graph.ready, graphHash: graph.hash, graphEnv, phaseEnv,
      blocks: { resolved, missing, ...(specError ? { specError } : {}) } });
  }
  return out;
}

function write(opts = {}) {
  const root = opts.root || ROOT, out = opts.out || root;   // out: where the nodes go (default the tree itself)
  return derive(opts).map(d => {
    const abs = path.join(out, d.dir);
    // file names as the handoff lays them out (PN1): <phase>.phase, and graph/<phase>-<hash>.graph (immutable per hash)
    const NE = require('../../lib/node-export.js');
    const put = (env, file) => { NE.validate(env); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, NE.toYaml(env), 'utf8'); return file; };
    const graphFile = put(d.graphEnv, path.join(abs, 'graph', `${d.phase}-${d.graphHash}.graph`));
    const phaseFile = put(d.phaseEnv, path.join(abs, `${d.phase}.phase`));
    return { phase: d.phase, owner: d.owner, ready: d.ready, graphHash: d.graphHash, blocks: d.blocks,
      phaseFile: path.relative(out, phaseFile).split(path.sep).join('/'), graphFile: path.relative(out, graphFile).split(path.sep).join('/') };
  });
}

/** check(...) — re-derive; a .phase or .graph that differs from what the tree derives now is drift, said per phase */
function check(opts = {}) {
  const root = opts.out || opts.root || ROOT;
  const NE = require('../../lib/node-export.js');
  return derive(opts).map(d => {
    const drift = [];
    const pf = path.join(root, d.dir, `${d.phase}.phase`);
    const gf = path.join(root, d.dir, 'graph', `${d.phase}-${d.graphHash}.graph`);
    if (!fs.existsSync(pf)) drift.push('no .phase written');
    else { const on = NE.fromYaml(fs.readFileSync(pf, 'utf8')); if (JSON.stringify(on.payload) !== JSON.stringify(d.phaseEnv.payload)) drift.push('the .phase differs from what the map and tree give now'); }
    if (!fs.existsSync(gf)) drift.push(`no .graph for hash ${d.graphHash} (the graph changed, or was never written)`);
    if (d.blocks.missing.length) drift.push(`blocks not in the spec: ${d.blocks.missing.join(', ')}`);
    if (d.blocks.specError) drift.push(`spec unreadable: ${d.blocks.specError}`);
    return { phase: d.phase, drift };
  });
}

/**
 * PS2 0.60.227 — James, 2026-10-24: "spec per component/capability/etc its in the specs. deocmpose all of the phases into .phase nodes
 * including dag per phase." writeAll writes every phase of every docs/*-phasemap.spec as its .phase and .graph (its slice of the whole
 * DAG), and says, per owning system, how many phases name the spec they build from — the specs still to write, per component.
 *   writeAll({ root, check }) → { maps, phases, written, withSpec, blocksMissing, ready, byOwner: { owner: { phases, withSpec } }, failed: [{ map, error }] }
 */
function writeAll({ root = ROOT, check: dry = false } = {}) {
  const mapsDir = path.join(root, 'docs');
  const maps = fs.readdirSync(mapsDir).filter(f => f.endsWith('-phasemap.spec')).sort();
  const sum = { maps: maps.length, phases: 0, written: 0, withSpec: 0, blocksMissing: 0, ready: 0, drift: 0, byOwner: {}, noSpec: [], failed: [] };
  for (const f of maps) {
    const map = `docs/${f}`;
    let rows;
    try { rows = dry ? derive({ root, map }).map(d => ({ ...d, phaseFile: null })) : write({ root, map }); }
    catch (e) { sum.failed.push({ map, error: e.message.split('\n')[0] }); continue; }
    for (const r of rows) {
      const spec = (r.phaseEnv ? r.phaseEnv.payload.spec : null) || (() => { try { return require('../../lib/node-export.js').fromYaml(fs.readFileSync(path.join(root, r.phaseFile), 'utf8')).payload.spec; } catch (_) { return null; } })();
      sum.phases++; if (!dry) sum.written++; if (r.ready) sum.ready++; if (r.blocks.missing.length) sum.blocksMissing++;
      const o = (sum.byOwner[r.owner] = sum.byOwner[r.owner] || { phases: 0, withSpec: 0 }); o.phases++;
      if (spec) { sum.withSpec++; o.withSpec++; } else sum.noSpec.push({ map, phase: r.phase, owner: r.owner });
    }
  }
  return sum;
}

if (require.main === module && process.argv.includes('--all')) {
  const quiet = console.log; console.log = () => {};
  let r; try { r = writeAll({ check: process.argv.includes('--dry') }); } finally { console.log = quiet; }
  console.log(`${r.maps} maps · ${r.phases} phases · ${r.written} .phase + .graph written · ${r.withSpec} name their spec · ${r.ready} ready · ${r.blocksMissing} name blocks their spec lacks`);
  for (const [o, x] of Object.entries(r.byOwner).sort((a, b) => b[1].phases - a[1].phases)) console.log(`  ${o.padEnd(16)} ${String(x.phases).padStart(5)} phases · ${String(x.withSpec).padStart(4)} with a spec`);
  for (const f of r.failed) console.log(`  ✗ ${f.map}: ${f.error}`);
  if (process.argv.includes('--json')) require('fs').writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(r, null, 1));
  process.exit(r.failed.length ? 1 : 0);
}

if (require.main === module && !process.argv.includes('--all')) {
  const args = process.argv.slice(2); const map = args.find(a => !a.startsWith('--'));
  if (!map) { console.error('usage: node emerge/compiler/phase-specs.js <map.spec> [--check]'); process.exit(2); }
  const quiet = console.log; console.log = () => {};
  let rows; try { rows = args.includes('--check') ? check({ map }) : write({ map }); } finally { console.log = quiet; }
  for (const r of rows) console.log(r.drift ? `${r.drift.length ? '✗' : '✓'} ${r.phase}${r.drift.length ? `  ${r.drift.join(' · ')}` : ''}`
    : `${r.ready ? '✓' : '·'} ${r.phase} → ${r.phaseFile}  (${r.owner}; graph ${r.graphHash}${r.blocks.missing.length ? `; MISSING blocks ${r.blocks.missing.join(', ')}` : ''})`);
  process.exit(rows.some(r => (r.drift && r.drift.length) || (r.blocks && r.blocks.missing.length)) ? 1 : 0);
}

module.exports = { writeAll, MODULE_ID, VERSION, specIds, derive, write, check };
