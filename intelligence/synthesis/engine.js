'use strict';
/**
 * intelligence/synthesis/engine.js — the synthesis operators: raw gaps in, a ranked set of synthesized gaps out (0.39.300 SY1).
 * component_id: intelligence.synthesis.engine
 * Map: docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec (SY1)
 *
 * Pure: every operator takes data and returns data — no files, no network, no clock except what it is handed.
 *
 *   normalise    one shape: id, source, kind, title, detail, refs, systems, dependsOn, words
 *   chain        depends_on resolved across every map (same map by key or prefix, else a key unique in all maps); what
 *                each open gap unblocks, transitively; a dependency on nothing is itself a gap (kind 'dangling')
 *   cluster      the same gap written in several places becomes one (shared refs + similar words, or very similar words)
 *   corroborate  how many independent sources say it
 *   centrality   how wired-in the files it names are (loom's wires: how many lead out of each file)
 *   leverage     one score, explained: unblocks · corroboration · centrality · kind · how concrete it is
 *   theme        per system: how many, how much leverage, the top one
 *   plan         for the top gaps: what to do first (its open blockers), the files, the proof, whether it can be closed
 *                without a live service or a decision of James's
 */

const STOP = new Set('the a an and or of to in on for with is are be it its this that as by at from not no nothing every each into when then than one all'.split(' '));
const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); };

/** the system a path belongs to: its top folder (docs/ and tests/ name none) */
function systemOf(ref) {
  const p = String(ref || '').replace(/^\.?\//, '');
  if (!p.includes('/')) return null;
  const top = p.split('/')[0];
  return ['docs', 'tests', 'test', 'node_modules'].includes(top) ? null : top;
}

/** normalise(raw) — one shape for every source */
function normalise(raw) {
  const refs = [...new Set((raw.refs || []).map(String).filter(Boolean))];
  const systems = [...new Set([...refs.map(systemOf).filter(Boolean), raw.meta && raw.meta.owner ? String(raw.meta.owner).split('.')[0] : null].filter(Boolean))];
  return { id: raw.id, source: raw.source, kind: raw.kind, title: String(raw.title || raw.id).slice(0, 200), detail: String(raw.detail || '').slice(0, 800),
    refs, systems, dependsOn: (raw.dependsOn || []).map(String), meta: raw.meta || {}, words: words(`${raw.title} ${raw.detail}`) };
}

/**
 * chain(gaps, maps) → { unblocks: Map(id → Set(ids)), blockers: Map(id → [ids]), dangling: [raw gaps] }
 * A phase's dependency resolves in its own map (by key, or a key that starts with the token, e.g. "SW1" → "SW1_spec_
 * workshop"), else to a key unique across all maps. Done phases resolve and block nothing. Unresolvable → dangling.
 */
function chain(gaps, maps) {
  const byKeyGlobal = new Map();   // key → [{ map, status }]
  for (const m of maps || []) for (const k of m.keys || []) { if (!byKeyGlobal.has(k.key)) byKeyGlobal.set(k.key, []); byKeyGlobal.get(k.key).push({ map: m.file, status: k.status }); }
  const openIds = new Map(gaps.filter(g => g.kind === 'phase').map(g => [`${g.meta.map}#${g.meta.key}`, g.id]));
  const resolve = (dep, map) => {
    const tok = String(dep).trim().replace(/^["']|["']$/g, ''); if (!tok) return { ok: true, id: null };
    const mine = (maps || []).find(m => m.file === map);
    const local = mine && (mine.keys.find(k => k.key === tok) || mine.keys.find(k => k.key.startsWith(`${tok}_`)) || mine.keys.find(k => k.key.split('_')[0] === tok.split('_')[0] && /^[A-Z]+\d/.test(tok)));
    if (local) return { ok: true, id: local.status === 'open' ? openIds.get(`${map}#${local.key}`) || null : null };
    const hits = byKeyGlobal.has(tok) ? byKeyGlobal.get(tok).map(x => ({ ...x, key: tok }))
      : [...byKeyGlobal.entries()].filter(([k]) => k.startsWith(`${tok}_`)).flatMap(([k, v]) => v.map(x => ({ ...x, key: k })));
    if (hits.length === 1) { const h = hits[0]; return { ok: true, id: h.status === 'open' ? openIds.get(`${h.map}#${h.key}`) || null : null }; }
    if (hits.length > 1) return { ok: true, id: null, ambiguous: true };
    // prose ("the 0.39.292 pipeline", "P16 of another map") is not a key: only an id-shaped token can dangle
    return /^[A-Za-z]+\d+[\w-]*$/.test(tok) ? { ok: false } : { ok: true, id: null };
  };
  const blockers = new Map(), dependents = new Map(), dangling = [];
  for (const g of gaps) {
    if (g.kind !== 'phase') continue;
    const bs = [];
    for (const d of g.dependsOn) {
      const r = resolve(d, g.meta.map);
      if (!r.ok) dangling.push({ id: `dangling:${g.id}>${d}`, source: 'phasemap', kind: 'dangling', title: `${g.meta.key} depends on "${d}", which no map defines`,
        detail: `${g.meta.map}: the dependency "${d}" resolves to no phase in that map or any other — renamed, never mapped, or a typo`, refs: [g.meta.map], dependsOn: [], meta: { map: g.meta.map, from: g.id, dep: d } });
      else if (r.id && r.id !== g.id) { bs.push(r.id); if (!dependents.has(r.id)) dependents.set(r.id, new Set()); dependents.get(r.id).add(g.id); }
    }
    blockers.set(g.id, bs);
  }
  const unblocks = new Map();
  for (const g of gaps) {
    const seen = new Set(), stack = [...(dependents.get(g.id) || [])];
    while (stack.length) { const x = stack.pop(); if (seen.has(x) || x === g.id) continue; seen.add(x); for (const y of dependents.get(x) || []) stack.push(y); }
    unblocks.set(g.id, seen);
  }
  return { unblocks, blockers, dangling };
}

/**
 * cluster(gaps) → [{ id, members: [gap], ... }] — union-find over: a shared ref (not a phasemap itself) and words
 * at least 0.3 alike, or words at least 0.62 alike. A cluster's face is its most informative member.
 */
function cluster(gaps, { near = 0.3, same = 0.62 } = {}) {
  const parent = gaps.map((_, i) => i);
  const find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const byRef = new Map();
  gaps.forEach((g, i) => g.refs.filter(r => !/phase-?map\.spec$/.test(r) && !/^docs\//.test(r)).forEach(r => { if (!byRef.has(r)) byRef.set(r, []); byRef.get(r).push(i); }));
  const tryJoin = (i, j, thresh) => { if (find(i) !== find(j) && gaps[i].kind !== 'unreadable-map' && gaps[j].kind !== 'unreadable-map' && jaccard(gaps[i].words, gaps[j].words) >= thresh) parent[find(i)] = find(j); };
  for (const idx of byRef.values()) if (idx.length < 40) for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) tryJoin(idx[a], idx[b], near);
  if (gaps.length <= 1500) for (let i = 0; i < gaps.length; i++) for (let j = i + 1; j < gaps.length; j++) if (gaps[i].source !== gaps[j].source) tryJoin(i, j, same);
  const groups = new Map();
  gaps.forEach((g, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(g); });
  return [...groups.values()];
}

/** centrality(refs, usedBy) → 0..1 — the most wired-in file it names, log-scaled against the most wired-in file there is */
function centrality(refs, usedBy, maxUsed) {
  if (!usedBy || !maxUsed) return 0;
  let best = 0;
  for (const r of refs) { const n = usedBy[r] || 0; if (n > best) best = n; }
  return best ? Math.log2(1 + best) / Math.log2(1 + maxUsed) : 0;
}

const KIND_WEIGHT = {
  'unreadable-map': 1.6, dangling: 1.1, 'known-regression': 2.2, 'known-unbuilt': 0.9, 'known-spec-drift': 0.9, 'known-stale-ui': 0.6,
  'known-missing-module': 0.4, 'known-missing-archive': 0.2, 'known-needs-live-data': -0.4, 'known-needs-live-service': -0.8, 'known-decision': -0.4,
  marker: 0.3, unwired: 0.5, phase: 0.6, stated: 0.4,
};
/** effort — a rough size, so the fill order is leverage per unit of work, not leverage alone */
const EFFORT = { 'unreadable-map': 1, dangling: 1, marker: 1.5, stated: 3, 'known-stale-ui': 2, 'known-spec-drift': 3, 'known-regression': 3, 'known-unbuilt': 5,
  'known-missing-module': 6, 'known-missing-archive': 2, unwired: 5, phase: 8 };
const LAYER_EFFORT = { practice: 0.6, interface: 0.8, service: 1, engine: 1.2, library: 1.2, foundation: 1.4, data: 1.4, later: 2 };
const LAYER_WEIGHT = { foundation: 1, data: 1, engine: 0.7, library: 0.7, service: 0.5, interface: 0.3, ui: 0.3, practice: 0.4, later: -0.6 };
const NOT_HERE = /needs-live-service|needs-live-data|decision/;

/** leverage(face, ctx) → { score, parts } — every part named, so the rank can be read and argued with */
function leverage(face, { unblocks = 0, sources = 1, central = 0, members = 1 } = {}) {
  const kind = face.members.reduce((m, g) => Math.max(m, KIND_WEIGHT[g.kind] ?? 0.3), -9);
  const layer = face.members.reduce((m, g) => Math.max(m, LAYER_WEIGHT[String((g.meta && g.meta.layer) || '').toLowerCase()] ?? 0), -9);
  const concrete = face.members.some(g => g.refs.some(r => !/^docs\//.test(r))) ? 0.5 : 0;
  // an unreadable map hides its open phases and stated gaps from every reader: what it hides is what fixing it unhides
  const hides = face.members.reduce((m, g) => Math.max(m, (g.meta && g.meta.hides) || 0), 0);
  const parts = {
    hides: +(1.4 * Math.log2(1 + hides)).toFixed(2), unblocks: +(3 * Math.log2(1 + unblocks)).toFixed(2), corroboration: +(1.5 * (sources - 1) + 0.25 * Math.min(4, members - 1)).toFixed(2),
    centrality: +(2.5 * central).toFixed(2), kind: +kind.toFixed(2), layer: +(Math.max(0, layer) * 0.8 + Math.min(0, layer)).toFixed(2), concrete };
  const score = +Object.values(parts).reduce((a, b) => a + b, 0).toFixed(2);
  return { score, parts };
}

/**
 * synthesize({ raw, maps, usedBy, now, top }) → { gaps, themes, plan, stats }
 * The whole run: normalise → chain (+ dangling) → cluster → corroborate → centrality → leverage → theme → plan.
 */
function synthesize({ raw = [], maps = [], usedBy = {}, now = Date.now(), top = 25 } = {}) {
  let gaps = raw.map(normalise);
  const ch = chain(gaps, maps);
  gaps = gaps.concat(ch.dangling.map(normalise));
  const maxUsed = Math.max(0, ...Object.values(usedBy || {}));
  const clusters = cluster(gaps);
  const out = clusters.map(members => {
    // the face: a phase if there is one (it has the plan), else the longest-said member
    const face = members.find(g => g.kind === 'phase') || members.slice().sort((a, b) => b.detail.length - a.detail.length)[0];
    const unblockSet = new Set(); for (const g of members) for (const x of ch.unblocks.get(g.id) || []) if (!members.find(m => m.id === x)) unblockSet.add(x);
    const blockers = [...new Set(members.flatMap(g => ch.blockers.get(g.id) || []))].filter(x => !members.find(m => m.id === x));
    const sources = new Set(members.map(g => g.source)).size;
    const refs = [...new Set(members.flatMap(g => g.refs))];
    const central = centrality(refs, usedBy, maxUsed);
    const lev = leverage({ members }, { unblocks: unblockSet.size, sources, central, members: members.length });
    const closable = !members.some(g => NOT_HERE.test(g.kind)) && !/^later/i.test(String(face.meta.layer || ''));
    const effort = +(Math.min(...members.map(g => EFFORT[g.kind] ?? 4)) * (LAYER_EFFORT[String(face.meta.layer || '').toLowerCase()] || 1)).toFixed(2);
    return {
      id: face.id, title: face.title, detail: face.detail, kind: face.kind, source: face.source, sources: [...new Set(members.map(g => g.source))],
      members: members.map(g => ({ id: g.id, source: g.source, kind: g.kind, title: g.title })), refs: refs.slice(0, 30),
      systems: [...new Set(members.flatMap(g => g.systems))], unblocks: [...unblockSet], blockers, centrality: +central.toFixed(3),
      score: lev.score, parts: lev.parts, closable, effort, density: +(lev.score / effort).toFixed(2), meta: face.meta,
    };
  }).sort((a, b) => b.score - a.score || b.unblocks.length - a.unblocks.length || a.id.localeCompare(b.id));
  out.forEach((g, i) => { g.rank = i + 1; });
  // themes: per system
  const themes = new Map();
  for (const g of out) for (const s of (g.systems.length ? g.systems : ['(no system)'])) {
    const t = themes.get(s) || { system: s, gaps: 0, leverage: 0, top: null, closable: 0 };
    t.gaps++; t.leverage = +(t.leverage + g.score).toFixed(2); if (g.closable) t.closable++; if (!t.top) t.top = { id: g.id, title: g.title, rank: g.rank };
    themes.set(s, t);
  }
  // the plan: the top gaps, each with what to do first
  const byId = new Map(out.map(g => [g.id, g]));
  const plan = out.slice(0, top).map(g => ({
    rank: g.rank, id: g.id, title: g.title, score: g.score, closable: g.closable,
    why: Object.entries(g.parts).filter(([, v]) => v).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' · '),
    first: g.blockers.map(b => byId.get(b)).filter(Boolean).map(b => ({ id: b.id, title: b.title, rank: b.rank })),
    unblocks: g.unblocks.length, files: g.refs.filter(r => !/^docs\//.test(r)).slice(0, 10), proof: g.meta.proof || null, map: g.meta.map || null,
  }));
  // the fill order: what can be closed here, by leverage per unit of work — the highest leverage you can buy first
  const fill = out.filter(g => g.closable && g.score > 0).sort((a, b) => b.density - a.density || b.score - a.score).slice(0, top)
    .map((g, i) => ({ order: i + 1, rank: g.rank, id: g.id, title: g.title, score: g.score, effort: g.effort, density: g.density, kind: g.kind, files: g.refs.filter(r => !/^docs\//.test(r)).slice(0, 8), map: g.meta.map || null }));
  const stats = { raw: raw.length, normalised: gaps.length, synthesized: out.length, clustered: gaps.length - out.length, dangling: ch.dangling.length,
    closable: out.filter(g => g.closable).length, bySource: Object.fromEntries([...gaps.reduce((m, g) => m.set(g.source, (m.get(g.source) || 0) + 1), new Map())]),
    byKind: Object.fromEntries([...gaps.reduce((m, g) => m.set(g.kind, (m.get(g.kind) || 0) + 1), new Map())]), at: now };
  return { gaps: out, themes: [...themes.values()].sort((a, b) => b.leverage - a.leverage), plan, fill, stats };
}

module.exports = { words, jaccard, systemOf, normalise, chain, cluster, centrality, leverage, synthesize, KIND_WEIGHT, LAYER_WEIGHT, EFFORT };
