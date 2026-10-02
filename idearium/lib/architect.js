/**
 * idearium/lib/architect.js — the Architect: a spec laid out as components, bottom-up (0.39.298 AR2).
 * component_id: idearium.architect
 * UUID: nexus-idearium-architect-v1-0000-2026-1002-jamesbrooks-001
 * Map: docs/2026-10-02-workshop-codex-rewind-phasemap.spec (AR2)
 *
 * James, 2026-10-02: "need the spec workshop … with architect for archiecture using the component registry, components
 * store with dependancies … i figure we can start with, idea -> spec workshop -> architect -> destroy and rebuild
 * blueprint -> Idearium repo -> Cos?" · "all of it needs to be isolated, in its own pages" · "no lowercase. and make
 * sure its enterprise grade".
 *
 * An architecture is the spec's components in four layers, bottom-up — FOUNDATION, LIBRARY, SERVICE, INTERFACE — each
 * with its purpose and what it depends on. Reuse before build (§8.6): every component is matched against loom's
 * registry and the component store; REUSE marks a match as what the component is, NEW is the default. The agent
 * proposes components; a proposal is not the architecture until James accepts it. analyze() says the build order,
 * the gaps (a dependency on nothing), cycles and layer violations — said, never hidden.
 *
 * Pure — the API owns the store (idearium_architectures), the registry/store reads and the agent call.
 */

export const TABLE = 'idearium_architectures';
export const MODULE_ID = 'nexus-idearium-architect-v1-0000-2026-1002-jamesbrooks-001';
export const LAYERS = Object.freeze([
  { id: 'foundation', does: 'data, storage, the primitives everything else stands on' },
  { id: 'library',    does: 'the logic — rules, engines, the code that does the work' },
  { id: 'service',    does: 'what runs and coordinates — servers, jobs, the routes and the bus' },
  { id: 'interface',  does: 'what a person touches — pages, the CLI, the API surface' },
]);
export const LAYER_IDS = Object.freeze(LAYERS.map(l => l.id));
export const MAX_COMPONENTS = 200;
export const MAX_NAME = 80;
export const MAX_PURPOSE = 1000;

const _id = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const IMPORT_TAG_RE = /^<!--\s*imported[^>]*-->\s*\n?\n?/;

export function layerOf(v) {
  if (typeof v === 'number') return Math.min(3, Math.max(0, Math.round(v)));
  const t = String(v || '').toLowerCase().trim();
  const i = LAYER_IDS.indexOf(t);
  if (i >= 0) return i;
  if (/data|stor|primitive|kernel|model|schema|base|core/.test(t)) return 0;
  if (/ui|page|cli|view|screen|front|interface|api surface/.test(t)) return 3;
  if (/serv|server|job|worker|route|bus|daemon/.test(t)) return 2;
  return 1;
}

/** makeArchitecture({ title, source, sections, repoUuid, workshopUuid, specPath }) -> { arch } | { error } */
export function makeArchitecture({ title, source = { kind: 'blank' }, sections = [], repoUuid = null, workshopUuid = null, specPath = null } = {}) {
  const t = String(title || '').trim();
  if (!t) return { error: 'an architecture needs a title' };
  const now = Date.now();
  return { arch: {
    uuid: _id('ar'), title: t.slice(0, 160), source, repoUuid, workshopUuid, specPath,
    sections: sections.map(s => ({ id: s.id, title: s.title, body: String(s.body || '').replace(IMPORT_TAG_RE, '') })),
    components: [], removed: [], proposals: [], savedAt: null, createdAt: now, updatedAt: now,
    history: [{ at: now, what: `opened from ${source.kind}${source.title ? `: ${source.title}` : ''}` }],
  } };
}
function _touch(a, what) { a.updatedAt = Date.now(); if (what) a.history.push({ at: a.updatedAt, what }); if (a.history.length > 200) a.history.splice(0, a.history.length - 200); return a; }

function _checkComponent(c) {
  const name = String(c.name || '').trim();
  if (!name) return 'a component needs a name';
  if (name.length > MAX_NAME) return `the name is ${name.length} characters — the limit is ${MAX_NAME}`;
  if (String(c.purpose || '').length > MAX_PURPOSE) return `the purpose is ${String(c.purpose).length} characters — the limit is ${MAX_PURPOSE}`;
  return null;
}
function _uniqueId(name, comps) { const base = slug(name) || 'component'; const taken = new Set(comps.map(c => c.id)); if (!taken.has(base)) return base; for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`; }

/** a dependency as written (a name or an id) → the component it means, if there is one */
function _resolve(dep, comps) {
  const d = slug(dep);
  return comps.find(c => c.id === d || slug(c.name) === d) || null;
}

/**
 * editComponent(arch, { add | id, name, layer, purpose, dependsOn, reuse, remove, restore })
 * His own edits. Removal is kept (§0.3). dependsOn are component ids or names (resolved when they exist; kept as
 * written when they do not — that is a gap, and analyze() says so).
 */
export function editComponent(a, e = {}) {
  if (e.restore) {
    const i = a.removed.findIndex(c => c.id === e.restore);
    if (i < 0) return { error: `no removed component ${e.restore}` };
    const [c] = a.removed.splice(i, 1); delete c.removedAt; c.id = _uniqueId(c.name, a.components); a.components.push(c);
    _touch(a, `restored ${c.name}`); return { arch: a, component: c };
  }
  if (e.add) {
    if (a.components.length >= MAX_COMPONENTS) return { error: `an architecture holds at most ${MAX_COMPONENTS} components` };
    const bad = _checkComponent(e); if (bad) return { error: bad };
    const c = { id: _uniqueId(e.name, a.components), name: String(e.name).trim(), layer: layerOf(e.layer), purpose: String(e.purpose || '').trim(),
      dependsOn: (e.dependsOn || []).map(d => String(d).trim()).filter(Boolean), reuse: null, matches: [], by: e.by || 'james', updatedAt: Date.now() };
    c.dependsOn = c.dependsOn.map(d => (_resolve(d, a.components) || {}).id || d).filter(d => d !== c.id);
    a.components.push(c); _touch(a, `added ${c.name}`); return { arch: a, component: c };
  }
  const c = a.components.find(x => x.id === e.id);
  if (!c) return { error: `no component ${e.id}` };
  if (e.remove) {
    a.components = a.components.filter(x => x !== c); a.removed.push({ ...c, removedAt: Date.now() });
    _touch(a, `removed ${c.name} (kept in removed)`); return { arch: a, removed: c };
  }
  const bad = _checkComponent({ name: e.name != null ? e.name : c.name, purpose: e.purpose != null ? e.purpose : c.purpose }); if (bad) return { error: bad };
  if (e.name != null) c.name = String(e.name).trim();
  if (e.layer != null) c.layer = layerOf(e.layer);
  if (e.purpose != null) c.purpose = String(e.purpose).trim();
  if (Array.isArray(e.dependsOn)) c.dependsOn = e.dependsOn.map(d => String(d).trim()).filter(Boolean).map(d => (_resolve(d, a.components) || {}).id || d).filter(d => d !== c.id);
  if (e.reuse !== undefined) {
    if (e.reuse === null) c.reuse = null;
    else { const m = (c.matches || []).find(x => x.id === e.reuse); if (!m) return { error: 'reuse one of its matches' }; c.reuse = { ...m, at: Date.now() }; }
  }
  c.by = 'james'; c.updatedAt = Date.now();
  _touch(a, e.reuse !== undefined ? (c.reuse ? `${c.name} reuses ${c.reuse.id}` : `${c.name} is new`) : null);
  return { arch: a, component: c };
}

/**
 * matchesFor(component, { registry, store }) -> [{ source, id, name, why, score }] — reuse before build.
 *   registry: [{ id, name, namespace }] (loom's components); store: (query) -> [{ id, file, why }] (lib/component-store find)
 * A score is the share of the component's words found in the candidate's id/name (≥ 0.5 to be offered), best first.
 */
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'to', 'in', 'on', 'with', 'by', 'its', 'it', 'is', 'that', 'this']);
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
export function matchesFor(c, { registry = [], store = null, limit = 4 } = {}) {
  const want = [...new Set(words(c.name))];
  if (!want.length) return [];
  const out = [];
  for (const r of registry) {
    const hay = new Set(words(`${r.id} ${r.name || ''}`));
    const hit = want.filter(w => hay.has(w)).length;
    if (!hit) continue;
    const score = Math.round(hit / want.length * 100) / 100;
    if (score >= 0.5) out.push({ source: 'registry', id: r.id, name: r.name || r.id, why: r.namespace ? `loom · ${r.namespace}` : 'loom', score });
  }
  if (typeof store === 'function') {
    try { for (const s of store(c.name) || []) out.push({ source: 'store', id: s.id, name: s.file || s.id, why: s.why || 'component store', score: 0.6 }); } catch (_) {}
  }
  out.sort((x, y) => y.score - x.score || x.id.length - y.id.length);
  const seen = new Set();
  return out.filter(m => !seen.has(m.id) && seen.add(m.id)).slice(0, limit);
}

/**
 * analyze(arch) -> { order, gaps, cycles, violations, counts }
 *   order — every component bottom-up: by layer, then so each comes after what it depends on
 *   gaps — a dependency that is neither a component here nor something reused
 *   cycles — dependency loops (named, never silently broken)
 *   violations — a lower layer depending on a higher one (FOUNDATION needing INTERFACE)
 */
export function analyze(a) {
  const comps = a.components;
  const byId = new Map(comps.map(c => [c.id, c]));
  const gaps = [], violations = [];
  for (const c of comps) for (const d of c.dependsOn) {
    const t = byId.get(d);
    if (!t) gaps.push({ component: c.id, needs: d });
    else if (t.layer > c.layer) violations.push({ component: c.id, layer: LAYER_IDS[c.layer], needs: t.id, needsLayer: LAYER_IDS[t.layer] });
  }
  // a topological order inside the layering; a cycle is reported and its members placed by layer
  const order = [], state = new Map(), cycles = [];
  const visit = (c, trail) => {
    if (state.get(c.id) === 2) return;
    if (state.get(c.id) === 1) { const at = trail.indexOf(c.id); cycles.push(trail.slice(at).concat(c.id)); return; }
    state.set(c.id, 1);
    for (const d of c.dependsOn) { const t = byId.get(d); if (t) visit(t, trail.concat(c.id)); }
    state.set(c.id, 2); order.push(c.id);
  };
  for (const c of comps.slice().sort((x, y) => x.layer - y.layer || x.name.localeCompare(y.name))) visit(c, []);
  const counts = { components: comps.length, reuse: comps.filter(c => c.reuse).length, new: comps.filter(c => !c.reuse).length,
    byLayer: LAYER_IDS.map((id, i) => ({ layer: id, n: comps.filter(c => c.layer === i).length })) };
  return { order, gaps, cycles, violations, counts };
}

// ── the agent proposes; James accepts ──────────────────────────────────────────────────────────────────────────────
export function proposePrompt(a) {
  const spec = a.sections.map(s => `## ${s.title}\n${String(s.body || '').trim() || '(empty)'}`).join('\n\n').slice(0, 9000);
  const have = a.components.length ? `\nComponents he already has in this architecture (do not repeat them):\n${a.components.map(c => `- ${c.name} (${LAYER_IDS[c.layer]})`).join('\n')}` : '';
  return [
    'You are helping James lay out the architecture of his spec. He decides; you propose.',
    'Lay the spec out as components in four layers, bottom-up:',
    ...LAYERS.map(l => `  ${l.id.toUpperCase()} — ${l.does}`),
    'One component per line, exactly in this form and nothing else:',
    'COMPONENT: <short name> | LAYER: <foundation|library|service|interface> | PURPOSE: <one sentence> | DEPENDS: <names of other components it needs, comma separated, or none>',
    'Prefer few, real components over many thin ones. No preamble, no numbering, no closing remarks.',
    `\nThe spec: ${a.title}\n\n${spec}${have}`,
  ].join('\n');
}

/** parseComponents(text) -> [{ name, layer, purpose, dependsOn }] — the fixed line form; anything else is ignored */
export function parseComponents(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    const m = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?COMPONENT\s*:\s*(.+)$/i.exec(line);
    if (!m) continue;
    const parts = m[1].split('|').map(x => x.trim());
    const name = parts[0];
    const field = (k) => { const p = parts.find(x => new RegExp(`^${k}\\s*:`, 'i').test(x)); return p ? p.replace(new RegExp(`^${k}\\s*:\\s*`, 'i'), '').trim() : ''; };
    const deps = field('DEPENDS');
    if (!name || name.length > MAX_NAME) continue;
    out.push({ name, layer: layerOf(field('LAYER')), purpose: field('PURPOSE').slice(0, MAX_PURPOSE), dependsOn: /^(none|-|n\/a)?$/i.test(deps) ? [] : deps.split(/\s*,\s*/).filter(Boolean) });
  }
  return out.slice(0, 60);
}

export function addProposals(a, comps, { by = null } = {}) {
  const now = Date.now();
  const have = new Set(a.components.map(c => slug(c.name)));
  const added = comps.filter(c => !have.has(slug(c.name))).map(c => ({ uuid: _id('ap'), ...c, status: 'open', at: now, ...(by ? { by } : {}) }));
  a.proposals.push(...added);
  _touch(a, `the agent proposed ${added.length} component(s)`);
  return { arch: a, added };
}

/** decide(arch, pid, { action: accept|dismiss|reopen }) — accept makes the proposal a component (his yes) */
export function decide(a, pid, { action } = {}) {
  const p = a.proposals.find(x => x.uuid === pid);
  if (!p) return { error: `no proposal ${pid}` };
  if (action === 'dismiss' || action === 'reopen') { p.status = action === 'dismiss' ? 'dismissed' : 'open'; _touch(a, null); return { arch: a, proposal: p }; }
  if (action !== 'accept') return { error: 'action must be accept, dismiss or reopen' };
  if (p.status === 'accepted') return { error: 'already accepted' };
  const r = editComponent(a, { add: true, name: p.name, layer: p.layer, purpose: p.purpose, dependsOn: p.dependsOn, by: 'agent, accepted by james' });
  if (r.error) return r;
  p.status = 'accepted'; p.into = r.component.id;
  // dependencies written before their component existed resolve now
  for (const c of a.components) c.dependsOn = c.dependsOn.map(d => (_resolve(d, a.components) || {}).id || d).filter(d => d !== c.id);
  return { arch: a, proposal: p, component: r.component };
}

/** archText(arch, yaml) — the architecture as the file it saves beside the spec */
export function archText(a, yaml) {
  const an = analyze(a);
  const byId = new Map(a.components.map(c => [c.id, c]));
  const doc = {
    architecture: { name: a.title, spec: a.specPath || null, updated: new Date(a.updatedAt).toISOString(), layers: LAYER_IDS },
    components: an.order.map(id => byId.get(id)).map(c => ({ id: c.id, name: c.name, layer: LAYER_IDS[c.layer], purpose: c.purpose || null,
      depends_on: c.dependsOn, reuse: c.reuse ? { source: c.reuse.source, id: c.reuse.id } : null })),
    build_order: an.order,
    gaps: an.gaps, cycles: an.cycles, layer_violations: an.violations,
  };
  return `# ${a.title} — the architecture (idearium architect)\n` + yaml.dump(doc, { lineWidth: -1, noRefs: true });
}

export function summary(a) {
  const an = analyze(a);
  return { uuid: a.uuid, title: a.title, source: a.source, repoUuid: a.repoUuid, specPath: a.specPath, components: a.components.length,
    reuse: an.counts.reuse, gaps: an.gaps.length, open: a.proposals.filter(p => p.status === 'open').length, savedAt: a.savedAt, updatedAt: a.updatedAt };
}

export default { TABLE, LAYERS, LAYER_IDS, MAX_COMPONENTS, makeArchitecture, editComponent, matchesFor, analyze, proposePrompt, parseComponents,
  addProposals, decide, archText, summary, layerOf, slug };
