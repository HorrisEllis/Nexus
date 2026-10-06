'use strict';
/**
 * lib/repo-expand.js — a skeleton repo grows from its spec: expanded, then phased, then chunked, then coded.
 * UUID: nexus-lib-repo-expand-v1-0000-2026-1006-jamesbrooks-001
 * Map: docs/2026-10-05-build-from-the-spec-phasemap.spec (SB42 · SB43 · SB44)
 *
 * James: "were building capacity to build the daw, not the daw" · "expanding using the specs, then phased, then
 * chunked, then coded. look at the nexus repo."
 *
 * The nexus repo grows this way already: a phasemap .spec whose phases name their files, built by the phases manager.
 * A skeleton repo (SB31) slotted its components in once, when it was made. This is the same slot, any time after:
 *   expand  the agent sees the system's own components and plans only the new ones (file-tree-plan's slot rules);
 *           slotting them in rewrites the registry and the living spec and writes every node — before any code
 *   phase   a phasemap in the repo, in Nexus's shape: one phase per component, its files, the components it uses
 *           as depends_on, its commands as the functions to export, its proof — the Phases tab reads it as it is
 *   chunk   each code file is a pending chunk of the repo's spec from the moment it is planned (no content)
 *   code    the phase build (snapshot, ladder, shadow — idearium/api _phaseBuild) writes them; a written file codes
 *           its chunk
 * Pure: it is given what the repo holds and returns what to write. The route does the writing.
 */
const FTP = require('./file-tree-plan.js');

const SLOT_MARK = "// ── the idea's components slot in below ──";

/** skeletonOf(read) -> { system, registry, spec, specPath, ids } | null — null when the repo is not a skeleton */
function skeletonOf(read) {
  const registry = read('registry-components.js');
  if (typeof registry !== 'string' || !registry.includes(SLOT_MARK) || typeof read('lib/system.js') !== 'string') return null;
  const m = registry.match(/system:\s*'([^']+)'/);
  if (!m) return null;
  const system = m[1];
  const specPath = `spec/${system}.spec`;
  const ids = [...registry.matchAll(/id:\s*'([^']+)'/g)].map(x => x[1]);
  return { system, registry, spec: read(specPath), specPath, ids };
}

function expandPrompt({ system, ask, ids, files = [] }) {
  return [
    `This repo is a Nexus system, "${system}". Its skeleton is fixed and it already has these components:`,
    ids.map(i => `- ${i}`).join('\n') || '- (only its core)',
    ``,
    `Its files: ${files.slice(0, 120).join(', ')}`,
    ``,
    `Expand it: ${ask}`,
    ``,
    `Plan ONLY the new components this needs — not the ones above, not the skeleton. One object per component:`,
    `[{"component":"mixer","path":"lib/mixer.js","purpose":"one sentence","capability":"what it can do, a few words","commands":["mix","solo"],"uses":["tracks"]}]`,
    `- "commands" are verbs its CLI and routes run (each becomes an exported function <verb>(args, ctx)).`,
    `- "uses" names the components it needs, new or existing (by name) — it is built after them.`,
    `- Components never import each other; they reach the system through ctx (ctx.index, ctx.bus, ctx.registry).`,
    `- Paths only under lib/, tests/ or ui/.`,
    `Reply with ONLY the JSON array.`,
  ].join('\n');
}

function _initials(s) {
  const words = String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(w => /^[A-Z]/.test(w));
  return (words.slice(0, 2).map(w => w[0]).join('') || 'X').slice(0, 2);
}

/**
 * phasemap({ system, feature, ask, components, date, takenKeys }) -> { path, text, phases:[{key, component, files, depends}] }
 * One phase per component, numbered in build order (after the components it uses); depends_on names the phases of the components it
 * uses that this expansion adds (a component that exists already is built). Keys never reuse one the repo's maps hold.
 */
function phasemap({ system, feature, ask = '', components, date = new Date().toISOString().slice(0, 10), takenKeys = [] }) {
  const pre = _initials(feature);
  const taken = new Set(takenKeys);
  let n = 1;
  const phases = [];
  // build order: a component after the ones it uses (a cycle keeps the order it was given)
  const names = new Set(components.map(c => c.name)), done = new Set(), order = [];
  const visit = (c, stack = []) => {
    if (done.has(c.name) || stack.includes(c.name)) return;
    for (const u of c.uses || []) if (names.has(u)) visit(components.find(x => x.name === u), [...stack, c.name]);
    done.add(c.name); order.push(c);
  };
  for (const c of components) visit(c);
  for (const c of order) {
    while (taken.has(`${pre}${n}`)) n++;
    const key = `${pre}${n}`; taken.add(key); n++;
    phases.push({ key, id: `${key}_${c.name.replace(/-/g, '_')}`, component: c });
  }
  const byName = new Map(phases.map(p => [p.component.name, p]));
  const slugF = String(feature || 'expansion').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'expansion';
  const q = (x) => JSON.stringify(String(x));
  const lines = [
    `# ${system} — ${feature}. Written by the expansion (POST /api/repos/:uuid/expand), in Nexus's phasemap shape: one phase`,
    `# per component, built by the Phases tab (a snapshot first, the escalation ladder, every file it names expected back).`,
    `spec:`,
    `  meta:`,
    `    name: ${q(`${system} — ${feature}`)}`,
    `    version: 1.0.0`,
    `    date: ${date}`,
    `    status: ${q(`MAPPED ${date} — expanded from the spec; ${phases.length} phase(s), none coded`)}`,
    `    james: ${q(ask || feature)}`,
    `  invariants:`,
    `    - "every component connects only to the registry — reach the system through ctx, never import another component"`,
    `    - "each command is an exported function <verb>(args, ctx) of its component's file; its events are emitted by the door (lib/commands.js)"`,
    `    - "the registry entry and the nodes were written by the expansion — change them only if the phase needs to"`,
    `  phases:`,
  ];
  const out = [];
  for (const p of phases) {
    const c = p.component;
    const id = `${system}.${c.name}`;
    const test = `tests/${c.name}.test.js`;
    const deps = (c.uses || []).map(u => byName.get(u)).filter(Boolean).map(d => d.id);
    const handlers = c.commands.map(v => v.replace(/-([a-z0-9])/g, (_, x) => x.toUpperCase()));
    lines.push(
      `    ${p.id}:`,
      `      layer: engine`,
      `      status: OPEN`,
      `      depends_on: [${deps.join(', ')}]`,
      `      files: [${c.file}, ${test}]`,
      `      does: >-`,
      `        Component ${id} (${c.file}): ${String(c.purpose || c.capability).replace(/\s+/g, ' ')} Capability: ${String(c.capability).replace(/\s+/g, ' ')}.`,
      `        It exports ${handlers.map(h => `${h}(args, ctx)`).join(', ')} — the functions its command nodes run (${c.commands.map(v => `${c.name}:${v}`).join(', ')}).`,
      ...((c.uses || []).length ? [`        It uses ${c.uses.join(', ')} through ctx, never by importing them.`] : []),
      `        ${test} proves each command by running it through lib/commands.js on a booted system (lib/system.js boot).`,
      `      proof: ${q(`${c.file} exports ${handlers.join(', ')}; node ${test} passes`)}`,
      `      conditions:`,
      `        - { says: ${q(`${c.name}'s commands run`)}, check: { kind: tests, run: ${q(`node ${test}`)} } }`,
      ``,
    );
    out.push({ key: p.key, id: p.id, component: id, files: [c.file, test], depends: deps });
  }
  return { path: `docs/${date}-${slugF}-phasemap.spec`, text: lines.join('\n'), phases: out };
}

/**
 * expansion({ read, components, feature, ask, takenKeys, date }) ->
 *   { ok, system, writes:[{path, content}], code:[{path, layer, purpose}], phasemap:{path, text, phases}, ids, rejected }
 * components come from the agent (FTP.parseSlot) or the caller. One already in the system is refused, with the reason.
 */
function expansion({ read, components = [], feature = 'expansion', ask = '', takenKeys = [], date } = {}) {
  const sk = skeletonOf(read);
  if (!sk) return { ok: false, error: 'not a skeleton repo — its registry-components.js has no slot (repos made from the nexus-system template have one)' };
  const have = new Set(sk.ids);
  const rejected = [], fresh = [];
  for (const c of components) {
    if (have.has(`${sk.system}.${c.name}`)) rejected.push({ component: c.name, reason: `${sk.system}.${c.name} is already in the system` });
    else if (typeof read(c.file) === 'string' && read(c.file).trim()) rejected.push({ component: c.name, reason: `${c.file} already exists` });
    else fresh.push(c);
  }
  if (!fresh.length) return { ok: false, error: 'nothing new to slot in', rejected };
  const before = [{ path: 'registry-components.js', content: sk.registry }, ...(typeof sk.spec === 'string' ? [{ path: sk.specPath, content: sk.spec }] : [])];
  const slotted = FTP.slotIn(before, fresh, { name: sk.system });
  const writes = slotted.files.filter(f => typeof f.content === 'string' && (f.path.startsWith('data/nodes/') || before.some(b => b.path === f.path && b.content !== f.content)))
    .map(f => ({ path: f.path, content: f.content }));
  const code = [];
  for (const f of slotted.files.filter(f => f.content == null)) code.push({ path: f.path, layer: f.layer || 'engine', purpose: f.purpose || null });
  for (const c of fresh) { const t = `tests/${c.name}.test.js`; if (!code.some(x => x.path === t)) code.push({ path: t, layer: 'test', purpose: `proves ${sk.system}.${c.name}'s commands run through lib/commands.js on a booted system` }); }
  const pm = phasemap({ system: sk.system, feature, ask, components: fresh, takenKeys, date });
  return { ok: true, system: sk.system, writes: [...writes, { path: pm.path, content: pm.text }], code, phasemap: pm, ids: slotted.ids, rejected };
}

module.exports = { SLOT_MARK, skeletonOf, expandPrompt, phasemap, expansion, MODULE_ID: 'nexus.lib.repo-expand', VERSION: '1.0.0' };
