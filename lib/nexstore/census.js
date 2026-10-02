'use strict';
/**
 * lib/nexstore/census.js — every data shape in the tree, found and classified before anything is built (0.39.300, N0).
 * component_id: nexus.lib.nexstore.census
 * Map: docs/2026-09-29-nex-node-store-phasemap.spec (N0_census) — ranked FIRST by intelligence's gap synthesis
 * (docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec, LV1): it unblocks twelve phases, N2 → N13 of the node store.
 *
 * James, 2026-09-29: "can we invent our own? specifically made for the nex, yaml files, all the node node types? any data
 * that needs tables" · "look at the node taxonomy for nexus and guardian, is the closest to complete".
 *
 * Read-only. census({ root }) → { types, gaps, stats }:
 *   declared   lib/node-export.js KNOWN_TYPES (the node envelope types) · lib/node-schemas/schema.* (the payload schemas)
 *   tables     every JaaStore-shaped table: a .json file of rows (an array, or { rows | data | items }) under a data/ dir
 *   logs       every .jsonl — append-only by construction
 *   nodes      every nodes/<type>/ directory (the Guardian layout: nodes/<type>/<id>.<type>) and node-index/
 *   snapshots  every .nex
 *   blobs      content-addressed files (64-hex names, or under blobs/ file-blobs/)
 *   code       rings and lattices declared in code (ringCap, createKernel, lattice tables), and the tables the code writes
 *              (syncTable / appendRow, via writers.js) when no data in the tree shows them
 * Each found shape gets a type name, a kind (record · ledger · ring · edge · lattice · blob · snapshot — the map's seven),
 * its owning system, its fields, the fields worth indexing, and its references (fields that name another node).
 * A shape that fits no kind is a gap, listed, never forced.
 */
const fs = require('fs');
const path = require('path');

const KINDS = Object.freeze(['record', 'ledger', 'ring', 'edge', 'lattice', 'blob', 'snapshot']);
const SKIP = /(^|\/)(node_modules|\.git|_archive|archive|unintegrated|dist|fixtures|output|projects)(\/|$)/;
const INDEXABLE = ['id', 'uuid', 'ts', 'type', 'kind', 'system', 'status', 'tags', 'causedBy', 'caused_by', 'repoUuid', 'specUuid', 'ideaUuid', 'branch', 'source'];
const _read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return null; } };
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');

/** the system that owns a path: <system>/data/… → system; data/<system>/… → system; <system>/nodes → system */
function ownerOf(r) {
  const p = r.split('/');
  if (p[0] === 'data') return p[1] && !/\./.test(p[1]) ? p[1] : 'nexus';
  if (p[0] === 'lib') return 'lib';
  return p[0];
}

/** rowsOf(json) — a table's rows, if the file is one */
function rowsOf(j) {
  if (Array.isArray(j)) return j.every(x => x && typeof x === 'object' && !Array.isArray(x)) ? j : null;
  if (j && typeof j === 'object') for (const k of ['rows', 'data', 'items', 'records', 'entries']) if (Array.isArray(j[k])) return rowsOf(j[k]);
  return null;
}

/** fieldsOf(rows) — the union of the first 200 rows' keys, the indexable ones, and the references */
function fieldsOf(rows) {
  const seen = new Map();
  for (const r of rows.slice(0, 200)) for (const k of Object.keys(r)) seen.set(k, (seen.get(k) || 0) + 1);
  const fields = [...seen.keys()];
  const refs = fields.filter(k => /(Uuid|Id|_id|_uuid)$/.test(k) && !/^(id|uuid)$/.test(k) || /^(from|to|parent|causedBy|caused_by|fromUuid|toUuid|source_id|target_id)$/.test(k));
  return { fields: fields.slice(0, 60), indexed: fields.filter(k => INDEXABLE.includes(k)), references: refs };
}

/**
 * kindOf({ name, rows, fields, file }) → kind | null — the map's seven kinds, by what the data is:
 *   edge (rows have from/to), lattice (held state between two ends, or a lattice/cfr state table), ledger (a log, a
 *   history, a failure list — rows stamped and appended), snapshot (backups, snapshots), ring (a bounded buffer),
 *   record (rows with an identity). Anything else: null — a gap.
 */
function kindOf({ name, fields = [], file = '' }) {
  const n = String(name).toLowerCase(), f = new Set(fields);
  const has = (...k) => k.some(x => f.has(x));
  if (/lattice|cfr_state|tension_history|field_state/.test(n)) return 'lattice';
  if ((has('from', 'fromUuid', 'source_id', 'from_hook_id') && has('to', 'toUuid', 'target_id', 'to_hook_id')) || /(^|_)(links|edges|wires|relations)$/.test(n)) return 'edge';
  if (/snapshot|backup_records|checkpoint/.test(n)) return 'snapshot';
  if (/ring|buffer/.test(n)) return 'ring';
  if (/(log|history|events?|failures|ledger|audit|trail|activity|metrics|stats|queue|records|observations|outcomes|calls|runs|jobs)s?$/.test(n) || /\.jsonl$/.test(file)) return 'ledger';
  if (has('id', 'uuid', 'key', 'name', 'commitId', 'sha')) return 'record';
  return null;
}

function walk(root, start, visit, depth = 0) {
  if (depth > 9) return;
  let ents = []; try { ents = fs.readdirSync(start, { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) {
    const p = path.join(start, e.name), r = rel(root, p);
    if (SKIP.test(r)) continue;
    if (e.isDirectory()) { if (visit(p, r, true) !== false) walk(root, p, visit, depth + 1); }
    else visit(p, r, false);
  }
}

/** census({ root }) — the whole catalogue */
function census({ root = path.resolve(__dirname, '..', '..') } = {}) {
  const types = [], gaps = [], dataDirs = [];
  const add = (t) => { types.push(t); if (!t.kind) gaps.push({ type: t.name, source: t.source, why: t.why || 'fits no kind' }); };
  // ── declared: the node envelope types and the payload schemas ──
  const ne = _read(path.join(root, 'lib/node-export.js'));
  const kt = ne && ne.match(/const KNOWN_TYPES = Object\.freeze\(\[([\s\S]*?)\]\)/);
  const known = kt ? [...kt[1].matchAll(/'([\w.-]+)'/g)].map(m => m[1]) : [];
  let schemas = []; try { schemas = fs.readdirSync(path.join(root, 'lib/node-schemas')).filter(f => /^schema\./.test(f)); } catch (_) { /* none */ }
  // ── the tree: data dirs (tables, logs, snapshots, blobs) and nodes dirs ──
  const nodeTypes = new Map();   // node type → { dirs: [], files }
  walk(root, root, (p, r, isDir) => {
    const base = path.basename(p);
    if (isDir) {
      if (base === 'data') dataDirs.push(r);
      if (base === 'nodes' || /\/nodes\//.test(`${r}/`)) {
        if (base === 'nodes' || base === '_archive') return true;
        if (/(^|\/)nodes$/.test(path.dirname(r))) {   // nodes/<type>/
          let files = 0; try { files = fs.readdirSync(p).length; } catch (_) { /* unreadable */ }
          const t = nodeTypes.get(base) || { dirs: [], files: 0 }; t.dirs.push(r); t.files += files; nodeTypes.set(base, t);
          return false;
        }
      }
      if (base === 'node-index') { add({ name: `${ownerOf(r)}.node-index`, kind: 'record', system: ownerOf(r), source: r, store: 'node-index', note: 'the index over a system\'s nodes — its tables are catalogued one by one below' }); return true; }
      return true;
    }
    const inData = /(^|\/)data\//.test(r);
    if (/\.nex$/.test(base)) { if (!types.find(t => t.name === `${ownerOf(r)}.nex-snapshot`)) add({ name: `${ownerOf(r)}.nex-snapshot`, kind: 'snapshot', system: ownerOf(r), source: path.dirname(r), store: '.nex', files: 0 }); types.find(t => t.name === `${ownerOf(r)}.nex-snapshot`).files++; return; }
    if (inData && (/^[0-9a-f]{64}(\.\w+)?$/.test(base) || /\/(blobs|file-blobs)\//.test(r))) {
      const name = `${ownerOf(r)}.blob`; let t = types.find(x => x.name === name);
      if (!t) { t = { name, kind: 'blob', system: ownerOf(r), source: path.dirname(r), store: 'content-addressed', files: 0 }; add(t); }
      t.files++; return;
    }
    if (!inData) return;
    if (/\.jsonl$/.test(base)) {
      const text = _read(p) || '', first = text.split('\n').find(l => l.trim());
      let fields = []; try { fields = Object.keys(JSON.parse(first || '{}')); } catch (_) { /* not JSON lines */ }
      const name = `${ownerOf(r)}.${base.replace(/\.jsonl$/, '')}`;
      add({ name, kind: kindOf({ name: base, fields, file: base }) || 'ledger', system: ownerOf(r), source: r, store: 'jsonl', fields, indexed: fields.filter(k => INDEXABLE.includes(k)),
        references: fields.filter(k => /(Uuid|Id|_id)$/.test(k)), rows: text ? text.split('\n').filter(Boolean).length : 0, bytes: text.length });
      return;
    }
    if (/\.json$/.test(base)) {
      const text = _read(p); if (text == null || text.length > 64 * 1024 * 1024) return;
      let j; try { j = JSON.parse(text); } catch (_) { add({ name: `${ownerOf(r)}.${base}`, kind: null, system: ownerOf(r), source: r, store: 'json', why: 'not valid JSON' }); return; }
      const rows = rowsOf(j);
      if (!rows) return;   // a config or a document, not a table: not a data shape the store holds as rows
      const tbl = (/\/node-index\//.test(r) ? 'node-index.' : '') + base.replace(/\.json$/, '');
      const fl = fieldsOf(rows);
      add({ name: `${ownerOf(r)}.${tbl}`, kind: rows.length ? kindOf({ name: tbl, fields: fl.fields, file: base }) : kindOf({ name: tbl, fields: [], file: base }) || 'record',
        system: ownerOf(r), source: r, store: 'jaa-table', ...fl, rows: rows.length, bytes: text.length, why: 'rows with no identity, no ends, no stamp — fits no kind' });
    }
  });
  for (const [t, v] of [...nodeTypes.entries()].sort()) {
    add({ name: `node.${t}`, kind: /ledger|event|log|response|run|job/.test(t) ? 'ledger' : /wire|edge|link|relation/.test(t) ? 'edge' : /snapshot/.test(t) ? 'snapshot' : 'record',
      system: [...new Set(v.dirs.map(ownerOf))].join(' · '), source: v.dirs.slice(0, 8).join(', ') + (v.dirs.length > 8 ? ` … (${v.dirs.length} dirs)` : ''), dirs: v.dirs, store: 'nodes/<type>/<id>.<type>', files: v.files, declared: known.includes(t) });
  }
  // ── code: rings and lattices declared in code (bounded buffers the store must hold as rings) ──
  walk(root, root, (p, r, isDir) => {
    if (isDir) return !/^(tests?|docs|data)$/.test(path.basename(p));
    if (!/\.(c|m)?js$/.test(p) || /(^|\/)tests?\//.test(r)) return;
    const text = _read(p); if (!text || !/ringCap|RING_CAP|createKernel\(/.test(text)) return;
    add({ name: `code.${r.replace(/\.(c|m)?js$/, '').replace(/\//g, '.')}.ring`, kind: 'ring', system: ownerOf(r), source: r, store: 'in-memory', note: 'a bounded buffer declared in code (ringCap / createKernel)' });
  });
  // ── code tables: tables the code writes (syncTable / appendRow) that no data in the tree shows — runtime data is not
  //    checked in, so a table idearium writes at run time would otherwise be missing. Fields come from the row literals.
  const tableNames = new Set(types.map(t => String(t.name).split('.').pop()));
  const codeTables = new Map();
  for (const w of require('./writers.js').scan(root)) {
    if (w.call !== 'syncTable' && w.call !== 'appendRow') continue;
    for (const n of w.names) {
      if (!/^[A-Za-z][\w-]*$/.test(n) || tableNames.has(n)) continue;
      const h = codeTables.get(n) || { files: new Set(), fields: new Set() };
      h.files.add(w.file); for (const f of w.fields || []) h.fields.add(f); codeTables.set(n, h);
    }
  }
  for (const [n, h] of [...codeTables.entries()].sort()) {
    const files = [...h.files].sort(), fields = [...h.fields];
    const k = kindOf({ name: n, fields }) || kindOf({ name: n, fields: ['uuid'] });   // a table written through the store engine is keyed by uuid (idearium/lib/db.js syncTable's idField)
    add({ name: `${ownerOf(files[0])}.${n}`, kind: k, system: ownerOf(files[0]), source: files.join(', '), store: 'jaa-table (written in code; no data checked in)', fields, indexed: fields.filter(f => INDEXABLE.includes(f)), references: fields.filter(f => /Uuid$|Id$/.test(f) && f !== 'uuid'), why: 'fits no kind' });
  }
  // declared types with no data anywhere in the tree: listed, so the store's catalogue is complete
  for (const k of known) if (!types.find(t => t.name === `node.${k}`)) types.push({ name: `node.${k}`, kind: /ledger|event|log|response|run|job/.test(k) ? 'ledger' : /wire|edge/.test(k) ? 'edge' : 'record', system: '(declared)', source: 'lib/node-export.js KNOWN_TYPES', store: 'nodes/<type>/<id>.<type>', files: 0, declared: true });
  // one name per shape: two files that would share a name are told apart by where they live
  const seen = new Map(); for (const t of types) seen.set(t.name, (seen.get(t.name) || 0) + 1);
  for (const t of types) if (seen.get(t.name) > 1) t.name = `${t.name}@${String(t.source).split(',')[0].replace(/\/[^/]*$/, '')}`;
  // node types on disk that lib/node-export.js does not declare: classified, and named — the envelope should know them
  const undeclared = [...nodeTypes.entries()].filter(([t]) => !known.includes(t)).map(([t, v]) => ({ type: t, files: v.files, dirs: v.dirs }));
  const byKind = Object.fromEntries(KINDS.map(k => [k, types.filter(t => t.kind === k).length]));
  types.forEach(t => { if (t.kind) delete t.why; });
  return { types: types.sort((a, b) => String(a.name).localeCompare(String(b.name))), gaps, undeclared,
    stats: { types: types.length, gaps: gaps.length, byKind, knownTypes: known.length, schemas: schemas.length, dataDirs: dataDirs.length,
      tables: types.filter(t => t.store === 'jaa-table').length, logs: types.filter(t => t.store === 'jsonl').length, nodeTypes: nodeTypes.size, undeclared: undeclared.length },
    reference: 'guardian — per-job .response nodes, .hat/.agent nodes and node-index (James, 2026-09-29: "is the closest to complete")' };
}

/** catalogueYaml(c, yaml) — docs/nexstore-type-catalogue.yaml: generated, then reviewed */
function catalogueYaml(c, yaml) {
  const doc = { catalogue: { name: 'nexstore type catalogue', generatedBy: 'lib/nexstore/census.js (N0)', map: 'docs/2026-09-29-nex-node-store-phasemap.spec', status: 'generated — review before N2 builds types from it', stats: c.stats, reference: c.reference },
    types: c.types.map(t => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)))), gaps: c.gaps, undeclared: c.undeclared };
  return `# docs/nexstore-type-catalogue.yaml — every data shape in the tree, classified (N0 of the nex node store). Generated by\n# lib/nexstore/census.js; regenerate: node lib/nexstore/census.js --write. Review before N2 turns it into the type registry.\n` + yaml.dump(doc, { lineWidth: 140, noRefs: true });
}

if (require.main === module) {
  const yaml = require('js-yaml');
  const c = census();
  if (process.argv.includes('--write')) { fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'nexstore-type-catalogue.yaml'), catalogueYaml(c, yaml)); console.log(`wrote docs/nexstore-type-catalogue.yaml — ${c.stats.types} types, ${c.stats.gaps} gap(s)`); }
  else console.log(JSON.stringify(c.stats, null, 1), c.gaps);
}

module.exports = { census, catalogueYaml, kindOf, rowsOf, fieldsOf, ownerOf, KINDS };
