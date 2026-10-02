'use strict';
/**
 * intelligence/synthesis/index.js — GAP SYNTHESIS: Nexus's own gaps, read as one set and ranked by leverage (0.39.300 SY1).
 * component_id: intelligence.synthesis
 * UUID: nexus-intelligence-synthesis-v1-0000-2026-1002-jamesbrooks-001
 * Map: docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec (SY1, SY2, LV1)
 *
 * James, 2026-10-02: "synthesize as much gaps as possible, and fill the highest amount of leverage first. and then we
 * need to add that to the intelligence system. like synthesis needs to be expanded, immensly".
 *
 * The composition root: sources.js reads (phasemaps, the known-gap register, code markers, loom's registry, the shared
 * gap table, gaps other systems pushed), engine.js synthesizes (normalise → chain → cluster → corroborate →
 * centrality → leverage → theme → plan). Every run is kept: data/intelligence/synthesis/run-<ts>.json, and latest.json.
 * Nothing here writes to the tree it reads.
 */
const fs = require('fs');
const path = require('path');
const sources = require('./sources.js');
const engine = require('./engine.js');

const MODULE_ID = 'intelligence.synthesis';
const ROOT = path.resolve(__dirname, '..', '..');
const KEEP_RUNS = 50;

function dataDir(dir) {
  const d = dir || process.env.INTELLIGENCE_SYNTHESIS_DIR || path.join(process.env.INTELLIGENCE_DATA_DIR || path.join(ROOT, 'data', 'intelligence'), 'synthesis');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const _writeAtomic = (f, text) => { const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); };

/** ingested gaps — another system's, kept until it pushes again (a push replaces that system's set) */
function ingested({ dir } = {}) { try { return JSON.parse(fs.readFileSync(path.join(dataDir(dir), 'ingested.json'), 'utf8')); } catch (_) { return {}; } }
function ingest(system, gaps, { dir } = {}) {
  const sys = String(system || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 60);
  if (!sys) return { error: 'name the system the gaps come from' };
  if (!Array.isArray(gaps)) return { error: 'gaps must be a list' };
  if (gaps.length > 2000) return { error: `${gaps.length} gaps in one push — the limit is 2000` };
  const clean = gaps.filter(g => g && (g.title || g.detail)).map((g, i) => ({
    id: `ingest:${sys}:${String(g.id || i).slice(0, 120)}`, source: `ingest:${sys}`, kind: String(g.kind || 'reported').slice(0, 40),
    title: String(g.title || g.detail).slice(0, 200), detail: String(g.detail || '').slice(0, 800), refs: (Array.isArray(g.refs) ? g.refs : []).map(String).slice(0, 30),
    dependsOn: (Array.isArray(g.dependsOn) ? g.dependsOn : []).map(String).slice(0, 20), meta: { system: sys, layer: g.layer || null },
  }));
  const all = ingested({ dir }); all[sys] = { at: Date.now(), gaps: clean };
  _writeAtomic(path.join(dataDir(dir), 'ingested.json'), JSON.stringify(all, null, 1));
  return { system: sys, accepted: clean.length, refused: gaps.length - clean.length };
}

/**
 * run({ root, dir, yaml, gapRows, top, persist }) → the synthesis (and where it was kept)
 * gapRows: the open rows of the shared gaps table, when the caller has a reader (intelligence/routes.js does).
 */
function run({ root = ROOT, dir = null, yaml = require('js-yaml'), gapRows = null, top = 25, persist = true, now = Date.now() } = {}) {
  const t0 = Date.now();
  const pm = sources.phasemaps({ root, yaml });
  const reg = sources.registry({ root });
  const raw = [
    ...pm.gaps,
    ...sources.knownGaps({ root, yaml }),
    ...sources.markers({ root }),
    ...reg.gaps,
    ...(gapRows ? sources.gapTable(gapRows) : []),
    ...Object.values(ingested({ dir })).flatMap(x => x.gaps || []),
  ];
  const out = engine.synthesize({ raw, maps: pm.maps, usedBy: reg.usedBy, now, top });
  out.maps = pm.maps.map(m => ({ file: m.file, name: m.name, how: m.how, parseError: m.parseError, phases: m.phases, open: m.open }));
  out.stats.ms = Date.now() - t0;
  out.stats.maps = { total: pm.maps.length, unreadable: pm.maps.filter(m => m.parseError).length, phases: pm.maps.reduce((s, m) => s + m.phases, 0), open: pm.maps.reduce((s, m) => s + m.open, 0) };
  out.module = MODULE_ID;
  if (persist) {
    const d = dataDir(dir), name = `run-${now}.json`;
    _writeAtomic(path.join(d, name), JSON.stringify(out));
    _writeAtomic(path.join(d, 'latest.json'), JSON.stringify(out));
    const runs = fs.readdirSync(d).filter(f => /^run-\d+\.json$/.test(f)).sort();
    // §0.3 nothing lost: runs past the keep count move to archive/, never deleted
    if (runs.length > KEEP_RUNS) { fs.mkdirSync(path.join(d, 'archive'), { recursive: true }); for (const f of runs.slice(0, runs.length - KEEP_RUNS)) fs.renameSync(path.join(d, f), path.join(d, 'archive', f)); }
    out.kept = path.join(d, name);
  }
  return out;
}

/** latest({ dir }) — the last run, or null */
function latest({ dir } = {}) { try { return JSON.parse(fs.readFileSync(path.join(dataDir(dir), 'latest.json'), 'utf8')); } catch (_) { return null; } }

/** history({ dir }) — every kept run: when, how many, the top three */
function history({ dir } = {}) {
  const d = dataDir(dir);
  return fs.readdirSync(d).filter(f => /^run-\d+\.json$/.test(f)).sort().reverse().slice(0, KEEP_RUNS).map(f => {
    try { const r = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); return { file: f, at: r.stats.at, synthesized: r.stats.synthesized, raw: r.stats.raw, top: r.plan.slice(0, 3).map(p => ({ rank: p.rank, title: p.title, score: p.score })) }; }
    catch (_) { return { file: f, unreadable: true }; }
  });
}

module.exports = { MODULE_ID, run, latest, history, ingest, ingested, dataDir, sources, engine };
