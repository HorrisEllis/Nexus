/**
 * idearium/lib/architect.js — ARCHITECT, the pipeline's third station: a spec laid out as components (0.39.298 AR2).
 * component_id: idearium.architect
 * UUID: nexus-idearium-architect-v1-0000-2026-1002-jamesbrooks-001
 * Map: docs/2026-10-02-workshop-codex-rewind-phasemap.spec (AR2, design_2026_10_02)
 *
 * James, 2026-10-02: "build the spec workshop, with architect for archiecture using the component registry, components
 * store with dependancies, you know, like maybe its time to start codex. need a better entery point … idea -> spec
 * workshop -> architect -> destroy and rebuild blueprint -> Idearium repo -> Cos?"
 *
 * An architecture is one spec's components: each with a tier (CODEX's component | mod), a layer (data → engine →
 * service → interface, bottom-up), a purpose, its dependencies and its seams. Each is matched against what already
 * exists — loom's registry and the component store, one index — and what exists is reused; what does not is new.
 * A dependency on nothing is a GAP, said with both names; a cycle is a gap; a lower layer leaning on a higher one is a
 * gap (§3.1 bottom-up). Levels come out bottom-up: level 0 needs nothing of this architecture.
 *
 * Built before CX0 (CODEX): the store is lib/component-store.js as it is today. CX0 grows that store; this file takes
 * whatever index it is handed, so the station does not change when it does.
 *
 * The agent only PROPOSES components (the workshop's rule): a proposal is a separate record, and nothing enters the
 * architecture until James accepts it. Pure except ask(): the API owns loadTable/syncTable, loom and the repo write.
 */

export const TABLE = 'idearium_architectures';
export const MODULE_ID = 'nexus-idearium-architect-v1-0000-2026-1002-jamesbrooks-001';

export const TIERS = Object.freeze(['component', 'mod']);                         // CODEX (docs/component-registry.spec ADDENDUM 2026-07-30)
export const LAYERS = Object.freeze(['data', 'engine', 'service', 'interface']);  // bottom-up — the phasemaps' layers
export const DECISIONS = Object.freeze(['auto', 'reuse', 'new']);
export const REUSE_AT = 0.67;          // a component's own words found in an existing one, at least this share → reuse suggested
export const CANDIDATE_AT = 0.5;       // shown as a candidate from here
export const MAX_COMPONENTS = 200;
export const MAX_PURPOSE = 2000;
export const MAX_NAME = 120;

const _id = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const _slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

// words that name no part of a component — the folders and suffixes every id carries
const STOP = new Set(['nexus', 'js', 'mjs', 'cjs', 'ts', 'index', 'lib', 'src', 'the', 'and', 'for', 'of', 'a', 'an', 'to', 'in', 'on', 'with',
  'module', 'file', 'main']);

/** words(s) — a name's own words: camelCase and every separator split, lowercased, folder noise dropped */
export function words(s) {
  return String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length > 1 && !STOP.has(w));
}

// ── the index: loom's registry and the component store, one search ───────────────────────────────────────────────
/**
 * makeIndex({ registry, stored }) -> index
 *   registry  [{ id, name, namespace }]          loom/data/registry.json component table
 *   stored    [{ id, path, latest, purpose }]    lib/component-store.js list() (+ manifest purpose)
 * Tests are not components (nexus.tests.*, *.test) and neither are the spec documents loom tracks (namespace spec) —
 * both are left out.
 */
export function makeIndex({ registry = [], stored = [] } = {}) {
  const entries = [];
  const isTest = (id, name) => /(^|\.)tests?(\.|$)/.test(id) || /\.test(\.|$)|(^|\/)tests?\//.test(String(name || ''));
  for (const c of registry) {
    if (!c || !c.id || isTest(c.id, c.name) || c.namespace === 'spec' || /\.spec$/.test(String(c.name || ''))) continue;   // loom tracks spec documents too — they are not built code
    entries.push({ kind: 'registry', id: c.id, ref: `loom:${c.id}`, name: c.name || c.id, purpose: c.description || '', tail: String(c.id).split('.').pop().toLowerCase() });
  }
  for (const c of stored) {
    if (!c || !c.id || isTest(c.id, c.path)) continue;
    entries.push({ kind: 'store', id: c.id, ref: `store:${c.id}@${c.latest}`, name: c.path || c.id, purpose: c.purpose || '', version: c.latest, tail: String(c.id).split('.').pop().toLowerCase() });
  }
  const byWord = new Map(), byId = new Map(), byRef = new Map();
  for (const e of entries) {
    e.words = new Set([...words(e.id), ...words(e.name)]);
    for (const w of e.words) { if (!byWord.has(w)) byWord.set(w, []); byWord.get(w).push(e); }
    if (!byId.has(e.id) || e.kind === 'store') byId.set(e.id, e);   // the store's built bytes win over a loom entry of the same id
    byRef.set(e.ref, e);
  }
  return { entries, byWord, byId, byRef, counts: { registry: entries.filter(e => e.kind === 'registry').length, store: entries.filter(e => e.kind === 'store').length } };
}

/** lookup(index, ref) — a dependency or reuse target by loom:<id>, store:<id>@<v>, store:<id>, or a bare id */
export function lookup(index, ref) {
  const r = String(ref || '').trim();
  if (!r || !index) return null;
  if (index.byRef.has(r)) return index.byRef.get(r);
  const bare = r.replace(/^(loom|store):/, '').replace(/@.*$/, '');
  return index.byId.get(bare) || null;
}

const _pub = (e, score, why) => ({ kind: e.kind, id: e.id, ref: e.ref, name: e.name, score: Math.round(score * 100) / 100, why, ...(e.version ? { version: e.version } : {}) });

/**
 * candidates(comp, index, { limit }) -> [{ kind, id, ref, name, score, why }]
 * Exact first (the id, or the name as an id, or the last segment of an id equal to the component's slug); then the
 * share of the component's own words an existing one carries.
 */
export function candidates(comp, index, { limit = 3 } = {}) {
  if (!index) return [];
  const out = new Map();
  const exact = [comp.id, comp.name].filter(Boolean).map(String);
  for (const x of exact) { const e = lookup(index, x); if (e) out.set(e.ref, _pub(e, 1, 'the same id')); }
  const slug = _slug(comp.name || comp.id).replace(/-/g, '');
  const own = [...new Set([...words(comp.name), ...words(comp.id)])];
  if (own.length) {
    const seen = new Map();
    for (const w of own) for (const e of index.byWord.get(w) || []) seen.set(e, (seen.get(e) || 0) + 1);
    for (const [e, n] of seen) {
      if (out.has(e.ref)) continue;
      const tailHit = slug && e.tail.replace(/[^a-z0-9]/g, '') === slug;
      const share = n / own.length;
      const score = tailHit ? Math.max(0.9, share) : (own.length === 1 ? (n ? 0.55 : 0) : share);   // one word alone is a candidate, never a reuse
      if (score >= CANDIDATE_AT) out.set(e.ref, _pub(e, score, tailHit ? 'the same name' : `${n} of ${own.length} words`));
    }
  }
  // the best score first; the store (built bytes) before loom at a tie; then the shortest id — the most general name
  return [...out.values()].sort((a, b) => b.score - a.score || (a.kind === b.kind ? 0 : a.kind === 'store' ? -1 : 1) || a.id.length - b.id.length).slice(0, limit);
}

/** search(index, q, { limit }) — what exists, for picking a reuse by hand */
export function search(index, q, { limit = 12 } = {}) {
  const s = String(q || '').trim();
  if (!s || !index) return [];
  const hits = candidates({ id: s, name: s }, index, { limit: limit * 2 });
  const low = s.toLowerCase();
  if (hits.length < limit) for (const e of index.entries) {
    if (hits.length >= limit * 2) break;
    if ((e.id.toLowerCase().includes(low) || String(e.name).toLowerCase().includes(low)) && !hits.find(h => h.ref === e.ref)) hits.push(_pub(e, 0.5, 'contains it'));
  }
  return hits.slice(0, limit);
}

/** hints(sections, index, { limit }) — existing components the spec's own words point at, for the agent to reuse */
export function hints(sections, index, { limit = 30 } = {}) {
  if (!index) return [];
  const freq = new Map();
  for (const s of sections || []) for (const w of words(`${s.title} ${s.body}`)) if (w.length > 3) freq.set(w, (freq.get(w) || 0) + 1);
  const score = new Map();
  for (const [w, n] of freq) {
    const list = index.byWord.get(w) || [];
    if (!list.length || list.length > 60) continue;   // a word every component has names none of them
    for (const e of list) score.set(e, (score.get(e) || 0) + n / list.length);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([e]) => ({ ref: e.ref, id: e.id, name: e.name }));
}

// ── components ────────────────────────────────────────────────────────────────────────────────────────────────────
const _list = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,\n]/)).map(x => String(x).trim()).filter(Boolean);

/** normComponent(raw, taken) -> { component } | { error } — one shape whoever wrote it (James, the agent, a saved file) */
export function normComponent(raw = {}, taken = []) {
  const name = String(raw.name || raw.id || '').trim();
  if (!name) return { error: 'a component needs a name' };
  if (name.length > MAX_NAME) return { error: `the name is ${name.length} characters — the limit is ${MAX_NAME}` };
  const purpose = String(raw.purpose || raw.does || '').trim();
  if (purpose.length > MAX_PURPOSE) return { error: `the purpose is ${purpose.length} characters — the limit is ${MAX_PURPOSE}` };
  const tier = TIERS.includes(String(raw.tier || '').toLowerCase()) ? String(raw.tier).toLowerCase() : 'component';
  const layer = LAYERS.includes(String(raw.layer || '').toLowerCase()) ? String(raw.layer).toLowerCase() : 'engine';
  let id = _slug(raw.id || name) || 'component';
  const ids = new Set(taken);
  if (ids.has(id)) { let i = 2; while (ids.has(`${id}-${i}`)) i++; id = `${id}-${i}`; }
  const decision = DECISIONS.includes(raw.decision) ? raw.decision : 'auto';
  const use = raw.use || (raw.reuse && typeof raw.reuse === 'string' ? raw.reuse : null);
  const at = Array.isArray(raw.at) ? { x: raw.at[0], y: raw.at[1] } : raw;
  const placed = at.x != null && at.y != null && Number.isFinite(+at.x) && Number.isFinite(+at.y) ? { x: Math.round(+at.x), y: Math.round(+at.y) } : {};
  return { component: { id, name, tier, layer, purpose, dependsOn: _list(raw.dependsOn || raw.depends_on || raw.depends), seams: _list(raw.seams),
    decision: use && decision === 'auto' ? 'reuse' : decision, use: use || null, by: raw.by || 'james', updatedAt: Date.now(), ...placed } };
}

/** makeSession({ title, sections, workshopUuid, repoUuid, specPath, components }) -> { session } | { error } */
export function makeSession({ title, sections = [], workshopUuid = null, repoUuid = null, specPath = null, components = [], source = null } = {}) {
  const t = String(title || '').trim();
  if (!t) return { error: 'an architecture needs a title' };
  const now = Date.now();
  const comps = [];
  for (const c of components) { const n = normComponent({ ...c, by: c.by || 'saved' }, comps.map(x => x.id)); if (!n.error) comps.push(n.component); }
  return { session: {
    uuid: _id('ar'), title: t, station: 'architect', workshopUuid, repoUuid, specPath, archPath: archPathFor(specPath, t),
    source: source || (workshopUuid ? { kind: 'workshop', id: workshopUuid } : repoUuid ? { kind: 'repo', id: repoUuid, path: specPath } : { kind: 'blank' }),
    sections: sections.map(s => ({ id: s.id, title: s.title, body: String(s.body || '') })),
    components: comps, removed: [], proposals: [], savedAt: null, createdAt: now, updatedAt: now,
    history: [{ at: now, what: `opened${comps.length ? ` with ${comps.length} saved component(s)` : ''}` }],
  } };
}

/** archPathFor('spec/x.spec') -> 'spec/x.architecture.yaml' — beside the spec it lays out */
export function archPathFor(specPath, title = 'architecture') {
  if (specPath) return String(specPath).replace(/\.spec$/i, '').replace(/\.(ya?ml|md)$/i, '') + '.architecture.yaml';
  return `spec/${_slug(title) || 'architecture'}.architecture.yaml`;
}

function _touch(session, what) { session.updatedAt = Date.now(); if (what) session.history.push({ at: session.updatedAt, what }); if (session.history.length > 200) session.history.splice(0, session.history.length - 200); return session; }

/** setSections(session, sections) — the spec it lays out, refreshed from its source (the workshop or the repo) */
export function setSections(session, sections) {
  const next = (sections || []).map(s => ({ id: s.id, title: s.title, body: String(s.body || '') }));
  if (JSON.stringify(next) !== JSON.stringify(session.sections)) { session.sections = next; _touch(session, 'the spec changed — read again'); }
  return session;
}

/**
 * editComponent(session, { id, add, remove, ...fields }) — James's hand. Removal keeps it (§0.3); a rename of the id is
 * not offered (dependencies name it) — the name changes freely.
 */
export function editComponent(session, e = {}) {
  if (e.add) {
    if (session.components.length >= MAX_COMPONENTS) return { error: `an architecture holds at most ${MAX_COMPONENTS} components` };
    const n = normComponent({ ...e, by: e.by || 'james' }, session.components.map(c => c.id));
    if (n.error) return n;
    session.components.push(n.component);
    _touch(session, `added ${n.component.name}`);
    return { session, component: n.component };
  }
  const i = session.components.findIndex(c => c.id === e.id);
  if (i < 0) return { error: `no component ${e.id}` };
  if (e.remove) {
    const [gone] = session.components.splice(i, 1);
    session.removed.push({ ...gone, removedAt: Date.now() });
    _touch(session, `removed ${gone.name} (kept in removed)`);
    return { session, removed: gone };
  }
  const c = session.components[i];
  // §0.39.299 AR4 — placed on the canvas: a move is only a move (who wrote it does not change); null x/y unpins
  const keys = Object.keys(e).filter(k => e[k] !== undefined && k !== 'id');
  if (keys.length && keys.every(k => k === 'x' || k === 'y')) {
    if (e.x == null || e.y == null) { delete c.x; delete c.y; }
    else if (Number.isFinite(+e.x) && Number.isFinite(+e.y)) { c.x = Math.round(+e.x); c.y = Math.round(+e.y); }
    else return { error: 'a position is two numbers' };
    session.updatedAt = Date.now();
    return { session, component: c, moved: true };
  }
  const input = { ...c, ...Object.fromEntries(Object.entries(e).filter(([k, v]) => v !== undefined && k !== 'id')), id: c.id };
  if (e.decision === 'auto' || e.decision === 'new') { input.use = null; input.reuse = null; }
  const merged = normComponent(input, []);
  if (merged.error) return merged;
  if (e.decision === 'reuse' && !merged.component.use) return { error: 'name what it reuses (use: loom:<id> or store:<id>)' };
  Object.assign(c, merged.component, { id: c.id, by: 'james', updatedAt: Date.now() });
  _touch(session, null);
  return { session, component: c };
}

/** restoreComponent(session, id) */
export function restoreComponent(session, id) {
  const i = session.removed.findIndex(c => c.id === id);
  if (i < 0) return { error: `no removed component ${id}` };
  const [c] = session.removed.splice(i, 1);
  delete c.removedAt;
  if (session.components.find(x => x.id === c.id)) { const n = normComponent(c, session.components.map(x => x.id)); c.id = n.component.id; }
  session.components.push(c);
  _touch(session, `restored ${c.name}`);
  return { session, component: c };
}

// ── analysis ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * analyse(session, index) -> { components, levels, gaps, stats }
 *   components  each with status reuse | new, match (what it reuses), candidates, level (null in a cycle), external deps
 *   levels      [[ids]] bottom-up — level 0 needs nothing of this architecture
 *   gaps        [{ kind: missing | self | cycle | layer | reuse-missing, component, ..., say }]
 */
export function analyse(session, index) {
  const comps = session.components;
  const local = new Map(comps.map(c => [c.id, c]));
  const gaps = [];
  const out = comps.map(c => {
    const cands = candidates(c, index);
    let status = 'new', match = null;
    if (c.decision === 'reuse' && c.use) {
      const e = lookup(index, c.use);
      if (e) { status = 'reuse'; match = _pub(e, 1, 'chosen'); }
      else gaps.push({ kind: 'reuse-missing', component: c.id, use: c.use, say: `${c.name} reuses "${c.use}", which is not in the registry or the store` });
    } else if (c.decision === 'auto' && cands[0] && cands[0].score >= REUSE_AT) { status = 'reuse'; match = cands[0]; }
    const deps = [], external = [];
    for (const d of c.dependsOn || []) {
      const key = _slug(d);
      if (d === c.id || key === c.id) { gaps.push({ kind: 'self', component: c.id, say: `${c.name} depends on itself` }); continue; }
      if (local.has(d) || local.has(key)) { deps.push(local.has(d) ? d : key); continue; }
      const e = lookup(index, d);
      if (e) { external.push({ dep: d, ref: e.ref, kind: e.kind }); continue; }
      gaps.push({ kind: 'missing', component: c.id, dep: d, say: `${c.name} depends on "${d}", which is neither in this architecture nor in the registry or the store` });
    }
    return { ...c, status, match, candidates: cands, deps, external };
  });

  // levels: the longest chain of local dependencies under each component; a cycle is a gap and its members unplaced
  const byId = new Map(out.map(c => [c.id, c]));
  const level = new Map(), state = new Map(), inCycle = new Set();
  const visit = (id, stack) => {
    if (level.has(id)) return level.get(id);
    if (state.get(id) === 'open') {
      const path = stack.slice(stack.indexOf(id)).concat(id);
      path.forEach(x => inCycle.add(x));
      const key = [...new Set(path)].sort().join();
      if (!gaps.find(g => g.kind === 'cycle' && [...new Set(g.path)].sort().join() === key))
        gaps.push({ kind: 'cycle', component: id, path, say: `a cycle: ${path.map(x => (byId.get(x) || {}).name || x).join(' → ')} — one of them has to give` });
      return null;
    }
    state.set(id, 'open');
    let lv = 0, broken = false;
    for (const d of byId.get(id).deps) { const l = visit(d, stack.concat(id)); if (l == null) broken = true; else lv = Math.max(lv, l + 1); }
    state.set(id, 'done');
    const v = broken || inCycle.has(id) ? null : lv;
    level.set(id, v);
    return v;
  };
  for (const c of out) visit(c.id, []);
  for (const c of out) c.level = inCycle.has(c.id) ? null : level.get(c.id);
  const levels = [];
  for (const c of out) if (c.level != null) (levels[c.level] = levels[c.level] || []).push(c.id);

  // bottom-up by declared layer: data < engine < service < interface (§3.1)
  for (const c of out) for (const d of c.deps) {
    const dc = byId.get(d);
    if (LAYERS.indexOf(dc.layer) > LAYERS.indexOf(c.layer))
      gaps.push({ kind: 'layer', component: c.id, dep: d, say: `${c.name} (${c.layer}) depends on ${dc.name} (${dc.layer}) — a lower layer cannot lean on a higher one` });
  }
  for (const c of out) c.gaps = gaps.filter(g => g.component === c.id || (g.path && g.path.includes(c.id))).length;
  const stats = { components: out.length, reuse: out.filter(c => c.status === 'reuse').length, new: out.filter(c => c.status === 'new').length,
    gaps: gaps.length, levels: levels.length, external: out.reduce((s, c) => s + c.external.length, 0),
    index: index ? index.counts : { registry: 0, store: 0 } };
  return { components: out, levels: levels.map(l => l || []), gaps, stats };
}

// ── the file beside the spec ──────────────────────────────────────────────────────────────────────────────────────
/** archText(session, analysis, yaml) — spec/<name>.architecture.yaml */
export function archText(session, a, yaml) {
  const doc = {
    architecture: { name: session.title, spec: session.specPath || null, station: 'architect', session: session.uuid,
      updated: new Date(session.updatedAt || Date.now()).toISOString(), stats: { components: a.stats.components, reuse: a.stats.reuse, new: a.stats.new, gaps: a.stats.gaps } },
    levels: a.levels.map((ids, i) => ({ level: i, components: ids })),
    components: a.components.map(c => ({ id: c.id, name: c.name, tier: c.tier, layer: c.layer, purpose: c.purpose || '',
      depends_on: c.dependsOn || [], seams: c.seams || [], status: c.status, decision: c.decision,
      ...(c.match ? { reuse: c.match.ref } : {}), ...(c.decision === 'reuse' && c.use ? { use: c.use } : {}),
      ...(Number.isFinite(c.x) && Number.isFinite(c.y) ? { at: [c.x, c.y] } : {}) })),
    gaps: a.gaps.map(g => g.say),
  };
  return `# ${session.title} — architecture, laid out by the Architect (idearium)\n` + yaml.dump(doc, { lineWidth: -1, noRefs: true });
}

/** fromArchText(text, yaml) -> [component raw] — a saved architecture read back (the decisions James made survive) */
export function fromArchText(text, yaml) {
  let doc; try { doc = yaml.load(String(text || '')); } catch (_) { return []; }
  const list = doc && Array.isArray(doc.components) ? doc.components : [];
  return list.filter(c => c && (c.name || c.id)).map(c => ({ id: c.id, name: c.name || c.id, tier: c.tier, layer: c.layer, purpose: c.purpose,
    dependsOn: c.depends_on || [], seams: c.seams || [], decision: c.decision || 'auto', use: c.use || null, ...(Array.isArray(c.at) ? { at: c.at } : {}) }));
}

// ── the agent proposes ────────────────────────────────────────────────────────────────────────────────────────────
function _specDigest(session, limit = 7000) {
  const t = [`Spec: ${session.title}`, ...session.sections.map(s => `\n## ${s.title}\n${String(s.body || '').trim() || '(empty)'}`)].join('\n');
  return t.length > limit ? `${t.slice(0, limit)}\n… (${t.length - limit} more characters not shown)` : t;
}

/** draftPrompt(session, { hints }) -> prompt — the agent lays the spec out as components, as YAML */
export function draftPrompt(session, { hints: hs = [] } = {}) {
  const have = session.components.length ? `\nAlready in the architecture (do not repeat them; depend on them by id):\n${session.components.map(c => `- ${c.id}: ${c.name} (${c.layer})`).join('\n')}\n` : '';
  const exist = hs.length ? `\nComponents that already exist in James's system and may fit (reuse one by putting its ref in "reuse"):\n${hs.map(h => `- ${h.ref}  ${h.name}`).join('\n')}\n` : '';
  return [
    `You are the Architect in James's pipeline (idea → spec → architect → blueprint → repo → COS). Lay this spec out as components. James accepts or dismisses each one; you only propose.`,
    `Build bottom-up: data first, then engine, service, interface. A component depends only on components at its own layer or below.`,
    `Reuse before build: where an existing component fits, name it in "reuse" instead of inventing a new one.`,
    `Answer with YAML only — a list, no prose, no code fence. Each item:`,
    `- id: short-kebab-id\n  name: Human name\n  tier: component | mod\n  layer: data | engine | service | interface\n  purpose: one sentence — what it does\n  depends_on: [ids from this list, or existing refs]\n  seams: [the events / routes / calls it offers or takes]\n  reuse: loom:<id> or store:<id> (only when an existing one fits)`,
    have + exist,
    _specDigest(session),
  ].join('\n');
}

/** parseDraft(text, yaml) -> { components: [raw] } | { error } */
export function parseDraft(text, yaml) {
  const t = String(text || '').replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  if (!t) return { error: 'the agent answered with nothing' };
  let doc; try { doc = yaml.load(t); } catch (e) { return { error: `the agent's answer is not YAML: ${String(e.message).split('\n')[0]}` }; }
  const list = Array.isArray(doc) ? doc : doc && Array.isArray(doc.components) ? doc.components : null;
  if (!list) return { error: 'the agent did not answer with a list of components' };
  const comps = list.filter(x => x && typeof x === 'object' && (x.name || x.id)).slice(0, 60)
    .map(x => ({ ...x, use: typeof x.reuse === 'string' && /^(loom|store):/.test(x.reuse) ? x.reuse : null }));
  return comps.length ? { components: comps } : { error: 'the agent\'s list had no components in it' };
}

/** addProposals(session, raws, meta) — kept apart from the components until accepted */
export function addProposals(session, raws, meta = {}) {
  const now = Date.now();
  const added = [];
  for (const r of raws) {
    const n = normComponent({ ...r, by: 'agent' }, []);
    if (n.error) continue;
    added.push({ uuid: _id('ap'), component: n.component, status: 'open', at: now, ...(meta.by ? { by: meta.by } : {}) });
  }
  session.proposals.push(...added);
  _touch(session, `the agent proposed ${added.length} component(s)`);
  return { session, added };
}

/** decide(session, pid, { action: accept | dismiss | reopen }) — the only way a proposal becomes a component */
export function decide(session, pid, { action } = {}) {
  const p = session.proposals.find(x => x.uuid === pid);
  if (!p) return { error: `no proposal ${pid}` };
  if (action === 'dismiss' || action === 'reopen') { p.status = action === 'dismiss' ? 'dismissed' : 'open'; p.decidedAt = Date.now(); _touch(session, null); return { session, proposal: p }; }
  if (action !== 'accept') return { error: 'action must be accept, dismiss or reopen' };
  if (p.status === 'accepted') return { error: 'already accepted' };
  const r = editComponent(session, { ...p.component, add: true, by: 'agent, accepted by james' });
  if (r.error) return r;
  p.status = 'accepted'; p.decidedAt = Date.now(); p.into = r.component.id;
  return { session, proposal: p, component: r.component };
}

/** decideAll(session, action) — every open proposal at once. Dependencies between proposals keep their ids. */
export function decideAll(session, action) {
  const open = session.proposals.filter(p => p.status === 'open');
  const done = [];
  for (const p of open) { const r = decide(session, p.uuid, { action }); if (!r.error) done.push(p.uuid); }
  return { session, decided: done.length };
}

export function summary(s) {
  return { uuid: s.uuid, title: s.title, source: s.source, workshopUuid: s.workshopUuid, repoUuid: s.repoUuid, specPath: s.specPath, archPath: s.archPath,
    components: s.components.length, open: s.proposals.filter(p => p.status === 'open').length, savedAt: s.savedAt, updatedAt: s.updatedAt };
}

// ── the agent ─────────────────────────────────────────────────────────────────────────────────────────────────────
let _ask = null;
export function setAsk(fn) { _ask = typeof fn === 'function' ? fn : null; }
export async function ask(prompt, opts = {}) {
  if (!_ask) return { ok: false, error: 'no agent connected to the architect' };
  try { return await _ask(prompt, opts); } catch (e) { return { ok: false, error: e.message }; }
}

/** draft(session, { index, yaml }) — prompt → the agent → proposals. A failed call is said, never filled in. */
export async function draft(session, { index = null, yaml } = {}) {
  const prompt = draftPrompt(session, { hints: hints(session.sections, index) });
  const r = await ask(prompt, { sessionUuid: session.uuid });
  if (!r || !r.ok) return { error: `the agent did not answer: ${(r && r.error) || 'no reply'}` };
  const p = parseDraft(r.text, yaml);
  if (p.error) return { error: p.error, raw: String(r.text || '').slice(0, 400) };
  return addProposals(session, p.components, { by: r.by || null });
}

export default { TABLE, TIERS, LAYERS, DECISIONS, REUSE_AT, words, makeIndex, lookup, candidates, search, hints, normComponent, makeSession,
  archPathFor, setSections, editComponent, restoreComponent, analyse, archText, fromArchText, draftPrompt, parseDraft, addProposals, decide,
  decideAll, summary, setAsk, ask, draft };
