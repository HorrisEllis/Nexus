'use strict';
/**
 * intelligence/synthesis/sources.js — where Nexus's own gaps are written down, read as one set (0.39.300 SY1).
 * component_id: intelligence.synthesis.sources
 * Map: docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec (SY1)
 *
 * James, 2026-10-02: "synthesize as much gaps as possible, and fill the highest amount of leverage first. and then we
 * need to add that to the intelligence system. like synthesis needs to be expanded, immensly".
 *
 * Each collector is read-only and returns raw gaps: { id, source, kind, title, detail, refs[], dependsOn[], meta }.
 *   phasemaps   every docs/*phasemap*.spec: its open phases (status OPEN / PLANNED / PARTIAL / BLOCKED / PROPOSED …),
 *               with depends_on — read as YAML, or, when the file is not valid YAML (29 of 72 were not, 2026-10-02), by
 *               its structure; an unreadable map is itself a gap (nothing machine-reads it)
 *   knownGaps   tests/known-gaps.yaml — every test file that fails for a stated reason
 *   markers     §KNOWN GAP / FIXME markers in the code
 *   registry    loom/data/registry.json — components nothing wires to, summed per system
 *   gapTable    the open rows of the shared `gaps` table (idearium's gaps), when a reader is handed in
 *   ingested    gaps another system pushed (POST /api/intelligence/synthesis/ingest — the Architect's, a test run's)
 */
const fs = require('fs');
const path = require('path');

const OPEN_RE = /^(open|planned|partial|blocked|proposed|todo|not built|mapped|draft|in progress|pending|deferred)\b/i;
const DONE_RE = /^(done|built|closed|complete|completed|✓|superseded|retired|resolved|already|shipped|fixed|substantially)/i;

const _read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return null; } };
const _first = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const _list = (v) => Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? v.replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean) : [];

/** statusOf(raw) → 'open' | 'done' | 'unknown' — the first words of a phase's status (or gate) */
function statusOf(raw) {
  const s = _first(raw).replace(/^["'`]+/, '');
  if (!s) return 'unknown';
  if (DONE_RE.test(s)) return 'done';
  if (OPEN_RE.test(s)) return 'open';
  return 'unknown';
}

/** phasesFromYaml(doc) → [{ key, status, deps, does, files, proof, layer }] — phases as a map or a list */
function phasesFromYaml(doc) {
  const root = doc && (doc.spec || doc);
  const ph = root && (root.phases || (root.spec && root.spec.phases));
  if (!ph || typeof ph !== 'object') return null;
  const list = Array.isArray(ph) ? ph.map(p => ({ key: String(p.id || p.key || p.name || ''), ...p })) : Object.entries(ph).map(([k, v]) => ({ key: k, ...(v && typeof v === 'object' ? v : { status: v }) }));
  return list.filter(p => p.key).map(p => ({
    key: p.key, status: _first(p.status != null ? p.status : ''), gate: _first(p.gate), deps: _list(p.depends_on || p.dependsOn || p.depends),
    does: _first(p.does || p.goal || p.what || p.summary).slice(0, 600), files: _list(p.files), proof: _first(p.proof || p.gate).slice(0, 300), layer: p.layer ? String(p.layer) : null,
  }));
}

/**
 * phasesFromText(text) → phases read by structure, for a map that is not valid YAML: the keys one indent under
 * `phases:` (or `- id:` items), and each block's status / gate, depends_on, does / goal, files, proof, layer lines.
 */
function phasesFromText(text) {
  const lines = String(text || '').split('\n');
  const at = lines.findIndex(l => /^\s*phases:\s*$/.test(l));
  if (at < 0) return [];
  const base = lines[at].match(/^\s*/)[0].length;
  const out = []; let cur = null, keyIndent = null;
  const field = (l, name) => { const m = l.match(new RegExp(`^\\s*${name}:\\s*(.*)$`)); return m ? m[1].trim() : null; };
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim() || /^\s*#/.test(l)) continue;
    const ind = l.match(/^\s*/)[0].length;
    if (ind <= base && /\S/.test(l)) break;   // the next top-level key: the phases are over
    // a phase key — bare, or with a trailing comment that, in older maps, IS its status ("P1_x:   # ← DONE 2026-07-30")
    const key = l.match(/^\s*([A-Za-z0-9][\w.-]*)\s*:\s*(?:#\s*(.*))?$/) || l.match(/^\s*-\s+id:\s*["']?([\w.-]+)["']?\s*(?:#\s*(.*))?$/);
    if (key && (keyIndent == null ? ind > base : ind === keyIndent)) {
      keyIndent = ind;
      cur = { key: key[1], status: key[2] ? key[2].replace(/^[←<\-\s]+/, '') : '', deps: [], does: '', files: [], proof: '', layer: null };
      out.push(cur); continue;
    }
    if (!cur) continue;
    let v;
    if ((v = field(l, 'status')) != null && !cur.status) cur.status = v.replace(/^["']|["']$/g, '');
    else if ((v = field(l, 'gate')) != null && !cur.status) cur.status = v.replace(/^["']|["']$/g, '');
    else if ((v = field(l, 'depends_on')) != null) cur.deps = _list(v);
    else if ((v = field(l, '(?:does|goal)')) != null && !cur.does) cur.does = v.replace(/^[>|-]+\s*/, '').replace(/^["']|["']$/g, '').slice(0, 600);
    else if ((v = field(l, 'files')) != null) cur.files = _list(v);
    else if ((v = field(l, 'proof')) != null) cur.proof = v.replace(/^["']|["']$/g, '').slice(0, 300);
    else if ((v = field(l, 'layer')) != null) cur.layer = v;
  }
  return out;
}

const GAP_KEYS = /^(missing|honest_gaps|open_gaps|gaps|known_gaps|open_questions|open_loops|unknowns|risks|still_open|not_built|todo)$/i;
/** statedFromYaml(doc) → [{ key, text }] — every list a map keeps its gaps in (missing:, honest_gaps:, open_questions: …) */
function statedFromYaml(doc) {
  const out = [];
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    for (const [k, x] of Object.entries(v)) {
      if (GAP_KEYS.test(k) && Array.isArray(x)) for (const it of x) { const t = typeof it === 'string' ? it : it && typeof it === 'object' ? (it.what || it.gap || it.text || it.description || it.title || JSON.stringify(it)) : ''; if (String(t).trim()) out.push({ key: k, text: _first(t).slice(0, 500) }); }
      else if (x && typeof x === 'object' && !Array.isArray(x)) walk(x, depth + 1);
    }
  };
  walk(doc, 0);
  return out;
}
/** statedFromText(text) — the same, by structure, for a map that is not valid YAML */
function statedFromText(text) {
  const lines = String(text || '').split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)([A-Za-z_]+):\s*$/); if (!m || !GAP_KEYS.test(m[2])) continue;
    const base = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]; if (!l.trim()) continue;
      const ind = l.match(/^\s*/)[0].length; if (ind <= base) break;
      const it = l.match(/^\s*-\s+(.*)$/);
      if (it) { let t = it[1]; for (let k = j + 1; k < lines.length && lines[k].trim() && lines[k].match(/^\s*/)[0].length > ind && !/^\s*-\s/.test(lines[k]); k++) t += ' ' + lines[k].trim(); out.push({ key: m[2], text: _first(t.replace(/^["'>|]+/, '')).slice(0, 500) }); }
    }
  }
  return out;
}
const SYSTEM_WORDS = ['idearium', 'guardian', 'cos', 'loom', 'versionium', 'intelligence', 'copilot', 'clear-glass', 'clearglass', 'cortex', 'orchestrator', 'architect', 'eravos', 'warp', 'ollama', 'diagnostic', 'nexus', 'mesh', 'siso', 'jaa', 'sentinel', 'tablet', 'cockpit', 'raid', 'spec-engine'];
/** ownerOf(meta, file) — the map's owner, or the first system its name names (clearglass → clear-glass, raid → cortex) */
function ownerOf(meta, file) {
  const o = String((meta && meta.owner) || '').split(/[·,]/)[0].trim().toLowerCase();
  if (o) return o.split('.')[0];
  const n = String(file).toLowerCase();
  const w = SYSTEM_WORDS.find(x => n.includes(x));
  return w === 'clearglass' ? 'clear-glass' : w === 'raid' ? 'cortex' : w === 'spec-engine' ? 'idearium' : w || null;
}

/** phasemaps({ root, yaml }) → { gaps, maps } — every map's open phases, the map's own record (parsed how, phases, open) */
function phasemaps({ root, yaml }) {
  const dir = path.join(root, 'docs');
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.spec') && /phase-?map/i.test(f)).sort(); } catch (_) { return { gaps: [], maps: [] }; }
  const gaps = [], maps = [];
  for (const f of files) {
    const rel = `docs/${f}`, text = _read(path.join(dir, f)); if (text == null) continue;
    let doc = null, how = 'yaml', parseError = null;
    try { doc = yaml.load(text); } catch (e) { how = 'structure'; parseError = String(e.message).split('\n')[0]; }
    let phases = doc ? phasesFromYaml(doc) : null;
    if (!phases) phases = phasesFromText(text), how = doc ? 'structure' : how;
    else {
      // YAML drops comments, and in older maps the comment IS the status ("P1_x:   # ← DONE 2026-07-30"): a phase with no
      // status field takes its comment's, and only then its gate's
      const byText = new Map(phasesFromText(text).map(p => [p.key, p.status]));
      for (const p of phases) if (!p.status) p.status = byText.get(p.key) || p.gate || '';
    }
    const meta = doc && (doc.spec || doc).meta || {};
    const owner = ownerOf(meta, f);
    const open = phases.filter(p => statusOf(p.status) === 'open');
    maps.push({ file: rel, name: meta.name || f.replace(/\.spec$/, ''), how, parseError, phases: phases.length, open: open.length, owner, keys: phases.map(p => ({ key: p.key, status: statusOf(p.status) })) });
    for (const p of open) gaps.push({
      id: `phase:${f.replace(/\.spec$/, '')}#${p.key}`, source: 'phasemap', kind: 'phase', title: p.key.replace(/_/g, ' '),
      detail: p.does || p.status, refs: [rel, ...p.files.filter(x => /[./]/.test(x))], dependsOn: p.deps,
      meta: { map: rel, key: p.key, status: p.status.slice(0, 200), proof: p.proof, layer: p.layer, owner },
    });
    // the gaps a map states outright (missing:, honest_gaps:, open_questions: …) — gaps too, whatever the map's shape
    const stated = doc ? statedFromYaml(doc) : statedFromText(text);
    stated.forEach((g, i) => gaps.push({ id: `stated:${f.replace(/\.spec$/, '')}#${g.key}-${i + 1}`, source: 'phasemap', kind: 'stated', title: g.text.split(/[.—;:]/)[0].slice(0, 140) || g.key,
      detail: g.text, refs: [rel, ...(g.text.match(/\b[\w-]+\/[\w./-]+\.(?:c|m)?js\b/g) || [])], dependsOn: [], meta: { map: rel, list: g.key, owner } }));
    maps[maps.length - 1].stated = stated.length;
    if (parseError) gaps.push({
      id: `unreadable:${rel}`, source: 'phasemap', kind: 'unreadable-map', title: `${f} is not valid YAML`,
      detail: `${parseError} — every machine reader skips it (${phases.length} phase(s) recovered by structure, ${open.length} open)`, refs: [rel], dependsOn: [],
      meta: { map: rel, owner, recovered: phases.length, hides: open.length + stated.length },
    });
  }
  return { gaps, maps };
}

/** knownGaps({ root, yaml }) — tests/known-gaps.yaml */
function knownGaps({ root, yaml }) {
  const text = _read(path.join(root, 'tests/known-gaps.yaml')); if (!text) return [];
  let doc; try { doc = yaml.load(text); } catch (_) { return []; }
  return (doc && Array.isArray(doc.gaps) ? doc.gaps : []).filter(g => g && g.file).map(g => ({
    id: `known:${g.file}`, source: 'known-gaps', kind: `known-${g.kind || 'unknown'}`, title: `${path.basename(g.file)} — ${g.kind || 'known gap'}`,
    detail: _first(g.reason).slice(0, 600), refs: [g.file], dependsOn: g.phase ? _list(g.phase) : [], meta: { failing: g.failing || 0, kind: g.kind || null },
  }));
}

/** markers({ root }) — §KNOWN GAP and FIXME markers in the code (tests, archives and dependencies left out) */
function markers({ root, max = 400 }) {
  const out = [], skip = /(^|\/)(node_modules|\.git|_archive|archive|data|dist|output|unintegrated|fixtures)(\/|$)/;
  const walk = (rel) => {
    if (out.length >= max) return;
    let ents = []; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skip.test(r)) continue;
      if (e.isDirectory()) { if (!/^tests?$/.test(e.name)) walk(r); continue; }
      if (!/\.(c|m)?js$/.test(e.name)) continue;
      const text = _read(path.join(root, r)); if (!text || !/§KNOWN GAP|FIXME/.test(text)) continue;
      text.split('\n').forEach((l, i) => {
        if (out.length >= max) return;
        const m = l.match(/(§KNOWN GAP|FIXME)[\s:—-]*(.*)$/); if (!m) return;
        out.push({ id: `marker:${r}:${i + 1}`, source: 'code', kind: 'marker', title: `${r}:${i + 1}`, detail: _first(m[2]).slice(0, 300) || m[1], refs: [r], dependsOn: [], meta: { line: i + 1, tag: m[1] } });
      });
    }
  };
  walk('');
  return out;
}

/**
 * registry({ root }) → { gaps, usedBy } — loom's registry: per system, the components no wire touches (one gap per
 * system, not thousands); and usedBy (file → how many wires lead out of it), the centrality the engine weighs with.
 */
function registry({ root }) {
  const text = _read(path.join(root, 'loom/data/registry.json')); if (!text) return { gaps: [], usedBy: {} };
  let reg; try { reg = JSON.parse(text); } catch (_) { return { gaps: [], usedBy: {} }; }
  const comps = Object.values(reg.component || {}), hooks = Object.values(reg.hook || {}), wires = Object.values(reg.wire || {});
  const hookComp = new Map(hooks.map(h => [h.id, h.component_id]));
  const touched = new Set(), out = new Map();
  for (const w of wires) {
    const a = hookComp.get(w.from_hook_id), b = hookComp.get(w.to_hook_id);
    if (a) touched.add(a); if (b) touched.add(b);
    if (a && a !== b) out.set(a, (out.get(a) || 0) + 1);
  }
  const usedBy = {};
  for (const c of comps) if (out.get(c.id) && /\.(c|m)?js$/.test(String(c.name || ''))) usedBy[c.name] = out.get(c.id);
  const bySys = new Map();
  for (const c of comps) {
    if (touched.has(c.id) || c.namespace === 'spec' || /(^|\.)tests?(\.|$)/.test(c.id)) continue;
    const sys = String(c.name || c.id).includes('/') ? String(c.name).split('/')[0] : String(c.id).split('.').slice(0, 2).join('.');
    if (!bySys.has(sys)) bySys.set(sys, []); bySys.get(sys).push(c.name || c.id);
  }
  const gaps = [...bySys.entries()].filter(([, l]) => l.length >= 3).map(([sys, l]) => ({
    id: `registry:unwired:${sys}`, source: 'loom', kind: 'unwired', title: `${l.length} ${sys} components nothing wires to`,
    detail: `loom's registry has ${l.length} component(s) under ${sys} with no wire in or out — dead code, or wiring loom has not been told about: ${l.slice(0, 6).join(', ')}${l.length > 6 ? ' …' : ''}`,
    refs: l.filter(x => /\//.test(x)).slice(0, 12), dependsOn: [], meta: { system: sys, count: l.length },
  }));
  return { gaps, usedBy };
}

/** gapTable(rows) — the open rows of the shared `gaps` table, as raw gaps */
function gapTable(rows) {
  return (rows || []).filter(g => g && (g.status || 'open') === 'open').slice(0, 300).map(g => ({
    id: `table:${g.uuid || g.id}`, source: 'gap-table', kind: `table-${g.type || 'gap'}`, title: _first(g.title || g.text || g.description || g.type || 'gap').slice(0, 140),
    detail: _first(g.description || g.text || g.root_cause || '').slice(0, 500), refs: _list(g.refs || g.files || []), dependsOn: [], meta: { severity: g.severity || null, ts: g.ts || g.createdAt || null },
  }));
}

module.exports = { statusOf, phasesFromYaml, phasesFromText, statedFromYaml, statedFromText, ownerOf, phasemaps, knownGaps, markers, registry, gapTable, OPEN_RE, DONE_RE };
