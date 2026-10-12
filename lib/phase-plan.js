'use strict';
/**
 * lib/phase-plan.js — plan, then code: a reasoning agent maps a phase, a small local model writes it one file at a time.
 * comp_id: nexus.lib.phase-plan
 * UUID: nexus-lib-phase-plan-v1-0000-2026-1012-jamesbrooks-001
 *
 * James (2026-10-12): "need it to generate code. not sure why its not using ollama in chunks, but i want to have a
 * intent for the reasoning, to map and plan, then ollama codes in chunks. that way ollama can be as dumb as possible."
 * · "each phase has to map to the spec and architect/component registry." · "i want the conditions to be generated
 * from the intent."
 *
 * Before: a phase was chunked only when its ladder STARTED on Ollama, and each chunk's brief was the phasemap's prose cut
 * to 2400 chars (idearium/repo/phases.js chunkRequest) — the small model still had to work out what the file exports,
 * what it imports and how it fits. Ollama's only job in a normal build was the reword randomizer.
 *
 * Now, a phase build (idearium/api _phaseBuild) can run in two passes:
 *   1. PLAN — one reasoning agent (a Guardian tab, Claude Code) gets the phase, the intent (the person's note), the
 *      spec's slice and the repo's component registry, and answers with ONE JSON plan:
 *        { intent, spec[], files[{ path, component, new, layer, purpose, imports[], exports[{ name, signature, does }],
 *          steps[] }], order[], conditions[{ says, check }] }
 *      parsePlan() checks it: every file maps to a registry component (or says new, with its layer); every file the
 *      phase names is planned; the order covers the files; the conditions use the proof-run kinds. A plan with problems
 *      goes back once with them; still wrong → the build says so and chunks as before.
 *   2. CODE — each planned file is one request to the coder (Ollama first): chunkBrief() is the file, what it must
 *      export (exact names and signatures), what it may import (and what the earlier files really export), and numbered
 *      steps. Nothing to infer. checkChunk() reads what came back: a planned export that is missing is an incomplete
 *      chunk, so the ladder retries or climbs.
 *   The plan's conditions are the phase's proof when its map declares none — generated from the intent, said so.
 *
 * Pure functions over text; the API decides when to plan, who plans, and who codes.
 */

const MODULE_ID = 'nexus.lib.phase-plan';
const VERSION = '1.0.0';
const LAYERS = Object.freeze(['kernel', 'engine', 'runtime', 'test']);   // lib/registry-plan.js's layers
const CHECK_KINDS = Object.freeze(['file', 'command', 'tests', 'page']);   // idearium/repo/proof-run.js KINDS
const LIMITS = Object.freeze({ files: 40, exports: 30, steps: 12, conditions: 30, registryLines: 160, brief: 2400 });

function _safe(p) {
  const s = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!s || s.startsWith('/') || /^[a-z]:/i.test(s) || s.split('/').some(seg => seg === '..' || seg === '')) return null;
  return s;
}
const _cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s; };
const _arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

/** exportsOf(code) -> the names a JS file exports (module.exports = { … }, exports.x =, export function/const/class) */
function exportsOf(code) {
  const s = String(code || ''); const out = new Set();
  for (const m of s.matchAll(/module\.exports\s*=\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const k = part.split(':')[0].trim().replace(/^\.\.\..*/, ''); if (/^[A-Za-z_$][\w$]*$/.test(k)) out.add(k); }
  for (const m of s.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const k = part.split(/\s+as\s+/).pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(k)) out.add(k); }
  return [...out];
}

/**
 * registryOf({ architecture, specRegistry }) -> [{ id, file, layer, purpose, exports }]
 * The components a plan maps onto: the spec's registry block (lib/registry-plan.js parseRegistry) first — it is the
 * promise — then the repo's code-derived registry (idearium/repo/architecture.js), each file once.
 */
function registryOf({ architecture = null, specRegistry = null } = {}) {
  const out = [], seen = new Set();
  for (const c of _arr(specRegistry && specRegistry.components)) {
    const file = _safe(c.file); if (!file || seen.has(file)) continue;
    seen.add(file); out.push({ id: String(c.id || file), file, layer: c.layer || null, purpose: c.purpose || null, exports: _arr(c.exports).map(String).slice(0, 20), source: 'spec' });
  }
  for (const c of _arr(architecture && architecture.components)) {
    const file = _safe(c.file); if (!file || seen.has(file) || (c.type && !['module', 'test', 'node'].includes(c.type))) continue;
    seen.add(file); out.push({ id: String(c.id || file), file, layer: c.layer || null, purpose: null, exports: _arr(c.exports).map(String).slice(0, 20), source: 'code' });
  }
  return out;
}

/**
 * §0.60.0 PC2 — James: "always read the code first, the atlas and the .spec. loom map and then map the phases. make sure
 * the right system is being mapped." The grounding a planner gets BEFORE it maps: each piece read from its own source.
 */

/** atlasSection(readme, system) -> the atlas's own words for a system (README.md "### <system>"), '' when it has none */
function atlasSection(readme, system, max = 1500) {
  const t = String(readme || ''); if (!t || !system) return '';
  const lines = t.split('\n');
  const want = String(system).toLowerCase().replace(/^nexus\//, '');
  const i = lines.findIndex(l => /^#{3,4}\s/.test(l) && l.replace(/^#+\s*/, '').replace(/[`*]/g, '').trim().toLowerCase().split(/[\s/—-]+/)[0] === want);
  if (i < 0) return '';
  const level = (lines[i].match(/^#+/) || ['###'])[0].length;
  const out = [lines[i]];
  for (let k = i + 1; k < lines.length; k++) { const m = lines[k].match(/^(#+)\s/); if (m && m[1].length <= level) break; out.push(lines[k]); }
  return _cut(out.join('\n').trim(), max);
}

/** loomSlice(map, system) -> the loom map's components for a system, as lines (lib/loom-map.js getMap shape) */
function loomSlice(map, system, max = 60) {
  if (!map || !map.available || !system) return { lines: [], total: 0 };
  const want = String(system).toLowerCase().replace(/^nexus\//, '').replace(/-/g, '');
  const sys = Object.keys(map.systems || {}).find(k => k.toLowerCase().replace(/-/g, '') === want);
  const ids = sys ? map.systems[sys].componentIds || [] : [];
  const lines = ids.slice(0, max).map(id => { const c = map.components[id] || {}; return `${id}${c.dir ? ` | ${c.dir}` : ''}${c.comp_status ? ` | ${c.comp_status}` : ''}${(c.comp_dependencies || []).length ? ` | needs ${c.comp_dependencies.slice(0, 4).join(', ')}` : ''}`; });
  if (ids.length > max) lines.push(`… ${ids.length - max} more in loom (loom_query)`);
  return { lines, total: ids.length, system: sys || null };
}

/**
 * targetSystem({ files, tags, ownerOf, tagSystem, declared }) -> { system, votes, why, conflict }
 * Which system a phase really builds: every file's owner and every loom tag on the phase votes; the most votes wins.
 * declared (the repo's own system) that loses the vote is a conflict, said — never silently built in the wrong place.
 */
function targetSystem({ files = [], tags = [], ownerOf = null, tagSystem = null, declared = null } = {}) {
  const votes = {};
  const vote = (s, w) => { if (s) votes[s] = (votes[s] || 0) + w; };
  for (const f of files) { try { vote(ownerOf && ownerOf(String(f).split(/[\s(]/)[0]), 2); } catch (_) {} }
  for (const t of tags) { try { vote(tagSystem && tagSystem(t), 1); } catch (_) {} }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { system: declared || null, votes, why: declared ? `no file or tag says otherwise — the repo's own system (${declared})` : 'nothing names a system', conflict: null };
  const [top, n] = ranked[0];
  const tie = ranked[1] && ranked[1][1] === n;
  const system = tie && declared && votes[declared] === n ? declared : top;
  const conflict = declared && system !== declared ? `the phase's files and tags point at ${system} (${ranked.map(([k, v]) => `${k} ${v}`).join(', ')}), not ${declared}` : null;
  return { system, votes, why: `${ranked.map(([k, v]) => `${k} ${v}`).join(', ')} (files count 2, loom tags 1)`, conflict };
}

/** reuseCandidates(registry, text) -> components whose id, file or exports share words with the phase: reuse before new */
function reuseCandidates(registry, text, max = 12) {
  const toks = new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3));
  if (!toks.size) return [];
  const split = (x) => String(x || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3);
  const scored = registry.map(c => {
    const words = new Set([...split(c.id), ...split(c.file), ...c.exports.flatMap(split), ...split(c.purpose)]);
    let n = 0; for (const w of words) if (toks.has(w)) n++;
    return { c, n };
  }).filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, max);
  return scored.map(({ c, n }) => ({ id: c.id, file: c.file, exports: c.exports.slice(0, 8), score: n }));
}

/** the registry as lines a planner reads — the phase's own files first, then the rest, capped */
function registryText(registry, { focus = [], max = LIMITS.registryLines } = {}) {
  const f = new Set(focus.map(_safe).filter(Boolean));
  const dir = (p) => p.split('/').slice(0, -1).join('/');
  const near = new Set([...f].map(dir));
  const rank = (c) => (f.has(c.file) ? 0 : near.has(dir(c.file)) ? 1 : 2);
  const rows = [...registry].sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file));
  const lines = rows.slice(0, max).map(c => `${c.id} | ${c.file} | ${c.layer || '?'}${c.exports.length ? ` | exports ${c.exports.slice(0, 8).join(', ')}` : ''}${c.purpose ? ` | ${_cut(c.purpose, 80)}` : ''}`);
  if (rows.length > max) lines.push(`… ${rows.length - max} more components (read them with idearium.code_map.tool)`);
  return lines.join('\n');
}

const PLAN_SHAPE = [
  '{',
  '  "system": "the system this phase builds",',
  '  "read": ["the files, atlas section, spec sections and loom components you read before mapping"],',
  '  "intent": "one sentence: what this phase makes true",',
  '  "spec": ["the spec sections / phase fields this plan rests on"],',
  '  "files": [{',
  '    "path": "relative/path.js",',
  '    "component": "<the registry id or file it is> — or null when new",',
  '    "new": false,',
  '    "layer": "kernel | engine | runtime | test",',
  '    "purpose": "what this file is for, one sentence",',
  '    "imports": ["./other.js: nameA, nameB", "fs"],',
  '    "exports": [{ "name": "doThing", "signature": "doThing(input: string, opts?: { x: number }) -> { ok: boolean, value?: string }", "does": "one sentence" }],',
  '    "steps": ["numbered, concrete steps a junior could follow to write this file"]',
  '  }],',
  '  "order": ["the paths, dependencies first"],',
  '  "conditions": [{ "says": "a promise in plain words", "check": { "kind": "file" | "command" | "tests" | "page", "...": "..." } }]',
  '}',
].join('\n');

/**
 * planPrompt({ phaseKey, title, body, intent, files, registry, spec, invariants, charter, repoName }) -> string
 * What the reasoning agent is asked: map and plan, never write code.
 */
function planPrompt({ phaseKey, title = '', body = '', intent = '', files = [], registry = [], spec = '', invariants = '', charter = '', repoName = 'the repo', feedback = '',
  system = null, atlas = '', loom = [], reuse = [], lessons = '' } = {}) {
  return [
    `PLAN phase ${phaseKey}${title ? ` (${title})` : ''} of ${repoName}${system ? ` — system: ${system}` : ''}. You are the PLANNER: you read and map, you do not write code. A small local model (the CODER) writes each file from your plan, one file per request, and it can only follow what you write down. The PROVER then checks your conditions.`,
    '\nREAD FIRST, IN THIS ORDER, before you map anything: (1) the code — every file the phase names that exists, and the components below you would reuse (idearium.code_read.tool / code_search / code_map); (2) the atlas section below; (3) the spec below; (4) the loom map below. Then map the phase. Say what you read in "read".',
    intent ? `\nTHE INTENT (from James): ${_cut(intent, 1200)}` : '',
    atlas ? `\nTHE ATLAS (README.md) ON ${system || 'this system'}:\n${_cut(atlas, 1500)}` : '',
    loom.length ? `\nTHE LOOM MAP — ${system || 'this system'}'s registered components:\n${loom.join('\n')}` : '',
    reuse.length ? `\nREUSE FIRST — existing components that share words with this phase:\n${reuse.map(r => `${r.id} | ${r.file}${r.exports.length ? ` | ${r.exports.join(', ')}` : ''}`).join('\n')}` : '',
    lessons ? `\nWHAT EARLIER PLANNED BUILDS TAUGHT NEXUS:\n${_cut(lessons, 1200)}` : '',
    `\nTHE PHASE, as its map writes it:\n${_cut(body || title || phaseKey, 3500)}`,
    files.length ? `\nTHE FILES THE PHASE NAMES (plan every one): ${files.join(', ')}` : '',
    spec ? `\nTHE SPEC (the slice this phase builds):\n${_cut(spec, 2500)}` : '',
    invariants ? `\nTHE MAP'S INVARIANTS — the plan must hold every one:\n${_cut(invariants, 1500)}` : '',
    charter ? `\nTHE COMPARTMENT'S CHARTER:\n${_cut(charter, 1200)}` : '',
    registry.length ? `\nTHE COMPONENT REGISTRY (id | file | layer | exports | purpose):\n${registryText(registry, { focus: files })}` : '\nTHE COMPONENT REGISTRY: empty — every file is new; give each its layer.',
    '\nRULES:',
    '- Map every file to the registry: "component" is an id or file from the list above. A file that is not there yet is "new": true with its layer and purpose. Reuse an existing component before adding one.',
    '- A lower layer never imports a higher one (kernel < engine < runtime < test).',
    '- Give every export its exact name and signature, and only imports that exist (a registry file, a file of this plan, or a package the repo has).',
    '- Steps are concrete: what to read, what to compute, what to return, which errors to handle. No "implement the logic".',
    '- "conditions" are the end state of this intent, checkable by a machine: file { path, contains? } · command { run, contains? } · tests { run? } · page { path, status?, contains? }. One per promise; nothing about taste.',
    system ? `- "system" is "${system}": every file belongs to it. A file another system owns is not this phase's to write — say so in "intent" instead of planning it.` : null,
    '- Answer with the plan as ONE ```json block (no path after json) and nothing else.',
    feedback ? `\nYOUR LAST PLAN WAS REFUSED — fix exactly this:\n${_cut(feedback, 1500)}` : '',
    `\nTHE SHAPE:\n${PLAN_SHAPE}`,
  ].filter(Boolean).join('\n');
}

/** the first JSON object in a reply (a ```json block first, else the outermost braces) */
function _jsonOf(text) {
  const t = String(text || '');
  const fences = [...t.matchAll(/```(?:json)?[ \t]*\n([\s\S]*?)```/gi)].map(m => m[1]);
  for (const f of fences) { try { const o = JSON.parse(f); if (o && typeof o === 'object' && !Array.isArray(o)) return { ok: true, value: o }; } catch (_) { /* next */ } }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return { ok: false, error: 'the reply held no JSON plan' };
  try { return { ok: true, value: JSON.parse(t.slice(a, b + 1)) }; } catch (e) { return { ok: false, error: `the plan is not valid JSON: ${e.message}` }; }
}

/** a condition, checked against the four proof kinds (proof-run normalises it again before it runs) */
function _condition(c, i) {
  const says = c && String(c.says || '').trim();
  const check = c && c.check && typeof c.check === 'object' ? c.check : null;
  if (!says) return { problem: `condition ${i + 1} says nothing` };
  if (!check || !CHECK_KINDS.includes(check.kind)) return { problem: `condition "${_cut(says, 60)}": its check kind must be one of ${CHECK_KINDS.join(', ')}` };
  if (check.kind === 'file' && !_safe(check.path)) return { problem: `condition "${_cut(says, 60)}": a file check needs a safe relative path` };
  if (check.kind === 'command' && !String(check.run || '').trim()) return { problem: `condition "${_cut(says, 60)}": a command check needs run` };
  if (check.kind === 'page' && !check.path && !check.url) return { problem: `condition "${_cut(says, 60)}": a page check needs a path` };
  return { condition: { says: _cut(says, 300), check: { ...check, ...(check.path && check.kind === 'file' ? { path: _safe(check.path) } : {}) } } };
}

/** imports that name a plan file: "./x.js: a, b" | "lib/x.js" → the plan path, resolved against the importing file */
function _importedPlanFiles(entry, paths) {
  const out = new Set();
  const dir = entry.path.split('/').slice(0, -1);
  for (const imp of entry.imports) {
    const spec = String(imp).split(':')[0].trim();
    if (!spec) continue;
    let cand = null;
    if (spec.startsWith('.')) {
      const parts = [...dir];
      for (const seg of spec.split('/')) { if (seg === '.' || seg === '') continue; if (seg === '..') parts.pop(); else parts.push(seg); }
      cand = parts.join('/');
    } else cand = _safe(spec);
    if (!cand) continue;
    for (const p of paths) if (p === cand || p === `${cand}.js` || p === `${cand}/index.js` || p.replace(/\.[cm]?[jt]s$/, '') === cand) out.add(p);
  }
  out.delete(entry.path);
  return [...out];
}

/** dependencies first; a cycle keeps the given order for what is left and is reported */
function _topo(files) {
  const paths = files.map(f => f.path);
  const deps = new Map(files.map(f => [f.path, _importedPlanFiles(f, paths)]));
  const done = [], seen = new Set(); let cycle = null;
  const visit = (p, stack) => {
    if (seen.has(p)) return;
    if (stack.includes(p)) { cycle = cycle || [...stack.slice(stack.indexOf(p)), p]; return; }
    for (const d of deps.get(p) || []) visit(d, [...stack, p]);
    if (!seen.has(p)) { seen.add(p); done.push(p); }
  };
  for (const p of paths) visit(p, []);
  return { order: done, deps, cycle };
}

/**
 * parsePlan(text, { phaseFiles, registry }) -> { ok, plan, problems[], warnings[] }
 * ok only when every file maps to the registry (or says new, with a real layer), every file the phase names is planned,
 * and every export has a name. The order is the plan's own when it covers the files and keeps each import before its
 * importer; otherwise the dependency order, said in warnings.
 */
function parsePlan(text, { phaseFiles = [], registry = [], system = null, ownerOf = null } = {}) {
  const j = _jsonOf(text);
  if (!j.ok) return { ok: false, plan: null, problems: [j.error], warnings: [] };
  const o = j.value;
  const problems = [], warnings = [];
  const byId = new Map(), byFile = new Map();
  for (const c of registry) { byId.set(String(c.id), c); byFile.set(c.file, c); }
  const rawFiles = _arr(o.files);
  if (!rawFiles.length) problems.push('the plan has no files');
  if (rawFiles.length > LIMITS.files) problems.push(`the plan has ${rawFiles.length} files — at most ${LIMITS.files} in one phase; split the phase`);
  const files = [];
  for (const [i, f] of rawFiles.slice(0, LIMITS.files).entries()) {
    const path = f && _safe(f.path);
    if (!path) { problems.push(`file ${i + 1}: no path, or an unsafe one`); continue; }
    if (files.some(x => x.path === path)) { problems.push(`${path}: planned twice`); continue; }
    const named = f.component == null ? null : String(f.component).trim() || null;
    const reg = (named && (byId.get(named) || byFile.get(_safe(named)))) || byFile.get(path) || null;
    const isNew = !reg && f.new === true;
    const layer = String(f.layer || (reg && reg.layer) || '').toLowerCase();
    if (!reg && !isNew) problems.push(`${path}: maps to no registry component${named ? ` ("${named}" is not in the registry)` : ''} — name one, or say "new": true with its layer`);
    if (isNew && !LAYERS.includes(layer)) problems.push(`${path}: a new file needs its layer (${LAYERS.join(', ')})`);
    if (reg && named && reg.file !== path && byFile.get(path) && byFile.get(path) !== reg) warnings.push(`${path}: planned as ${named}, but the registry already has ${path} as ${byFile.get(path).id}`);
    const exportsList = [];
    for (const e of _arr(f.exports).slice(0, LIMITS.exports)) {
      const name = typeof e === 'string' ? e.trim() : e && String(e.name || '').trim();
      if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) { problems.push(`${path}: an export with no usable name (${_cut(JSON.stringify(e), 60)})`); continue; }
      exportsList.push({ name, signature: typeof e === 'object' && e.signature ? _cut(e.signature, 200) : null, does: typeof e === 'object' && e.does ? _cut(e.does, 200) : null });
    }
    files.push({ path, component: reg ? reg.id : null, registryFile: reg ? reg.file : null, new: isNew, layer: LAYERS.includes(layer) ? layer : null,
      purpose: _cut(f.purpose || (reg && reg.purpose) || '', 300) || null, imports: _arr(f.imports).map(x => _cut(x, 160)).slice(0, 20),
      exports: exportsList, steps: _arr(f.steps).map(x => _cut(x, 300)).slice(0, LIMITS.steps) });
  }
  // §0.60.0 PC2 — the right system: the plan says which, and no planned file belongs to another
  if (system) {
    const said = o.system ? String(o.system).toLowerCase().replace(/^nexus\//, '') : null;
    if (said && said !== String(system).toLowerCase()) problems.push(`the plan is for "${o.system}", but this phase builds ${system}`);
    if (typeof ownerOf === 'function') for (const f of files) { let own = null; try { own = ownerOf(f.path); } catch (_) {} if (own && own !== system) problems.push(`${f.path} belongs to ${own}, not ${system} — plan it in ${own}'s repo, or leave it out`); }
  }
  if (!_arr(o.read).length) warnings.push('the plan does not say what was read before mapping');
  // the phase's files are the contract of the phase: each one planned
  const planned = new Set(files.map(f => f.path));
  const want = [...new Set(phaseFiles.map(_safe).filter(Boolean))];
  const left = want.filter(p => !planned.has(p));
  if (left.length) problems.push(`the plan leaves out ${left.join(', ')} — the phase names ${left.length === 1 ? 'it' : 'them'}`);
  const extra = files.filter(f => want.length && !want.includes(f.path)).map(f => f.path);
  if (extra.length) warnings.push(`planned beyond the phase's files: ${extra.join(', ')}`);
  // layers: a lower layer never imports a higher one
  const rank = (l) => LAYERS.indexOf(l);
  const t = _topo(files);
  for (const f of files) for (const d of t.deps.get(f.path) || []) {
    const df = files.find(x => x.path === d);
    if (f.layer && df && df.layer && rank(df.layer) > rank(f.layer) && f.layer !== 'test') problems.push(`${f.path} (${f.layer}) imports ${d} (${df.layer}) — a lower layer leaning on a higher one`);
  }
  if (t.cycle) problems.push(`the plan's imports form a cycle: ${t.cycle.join(' → ')}`);
  // the order: the plan's, when it is complete and keeps each import first
  let order = _arr(o.order).map(_safe).filter(p => p && planned.has(p));
  order = [...new Set(order)];
  const keeps = order.length === files.length && files.every(f => (t.deps.get(f.path) || []).every(d => order.indexOf(d) < order.indexOf(f.path)));
  if (!keeps) { if (order.length) warnings.push('the plan\'s order did not cover every file or put an import after its importer — the dependency order is used'); order = t.order; }
  // the conditions: generated from the intent
  const conditions = [];
  for (const [i, c] of _arr(o.conditions).slice(0, LIMITS.conditions).entries()) {
    const r = _condition(c, i);
    if (r.problem) warnings.push(r.problem); else conditions.push(r.condition);
  }
  if (!conditions.length) warnings.push('the plan gave no usable conditions — the phase is proven by its map\'s own, or its files');
  const plan = { system: system || (o.system ? String(o.system) : null), read: _arr(o.read).map(x => _cut(x, 160)).slice(0, 30), intent: _cut(o.intent || '', 400) || null, spec: _arr(o.spec).map(x => _cut(x, 200)).slice(0, 12), files, order, conditions,
    mapped: files.filter(f => f.component).length, added: files.filter(f => f.new).length };
  return { ok: problems.length === 0 && files.length > 0, plan, problems, warnings };
}

/** feedback for a refused plan: its problems, one per line */
function planFeedback(parsed) {
  return [...(parsed.problems || [])].map(p => `- ${p}`).join('\n');
}

/**
 * chunkBrief({ plan, path, done, repoName, phaseKey, maxChars }) -> { message, title, file }
 * One planned file as a request a small model can follow without thinking: what it is, what it exports exactly, what it
 * may import (with what the earlier files really export), the steps. done is [{ path, exports }] from this run.
 */
function chunkBrief({ plan, path, done = [], repoName = 'the repo', phaseKey = '', maxChars = LIMITS.brief } = {}) {
  const f = plan.files.find(x => x.path === path);
  if (!f) throw new Error(`${path} is not in the plan`);
  const i = plan.order.indexOf(path);
  const doneBy = new Map(done.map(d => [d.path, d]));
  const ext = (path.match(/\.([a-z0-9]+)$/i) || [, 'txt'])[1].toLowerCase();
  const lang = { js: 'js', cjs: 'js', mjs: 'js', ts: 'ts', py: 'python', json: 'json', md: 'markdown', css: 'css', html: 'html', sh: 'bash' }[ext] || ext;
  const importLine = (imp) => {
    const target = _importedPlanFiles({ path, imports: [imp] }, plan.files.map(x => x.path))[0];
    if (!target) return `- ${imp}`;
    const d = doneBy.get(target);
    return `- ${imp}${d ? `   (written — really exports: ${(d.exports || []).slice(0, 12).join(', ') || 'nothing found'})` : '   (not written yet — use exactly the names given)'}`;
  };
  const build = (b) => [
    `Write ONE file: ${path}${i >= 0 ? ` (file ${i + 1} of ${plan.order.length}` : ' ('}${phaseKey ? `, phase ${phaseKey}` : ''} in ${repoName}).`,
    f.purpose ? `IT IS FOR: ${_cut(f.purpose, b.purpose)}` : null,
    f.component ? `IT IS REGISTRY COMPONENT: ${f.component}${f.layer ? ` (${f.layer} layer)` : ''}` : f.layer ? `IT IS A NEW ${f.layer.toUpperCase()} FILE.` : null,
    f.exports.length ? `\nIT MUST EXPORT exactly these, with these signatures:\n${f.exports.map(e => `- ${e.name}${e.signature ? ` — ${_cut(e.signature, b.sig)}` : ''}${e.does ? ` — ${_cut(e.does, b.does)}` : ''}`).join('\n')}` : null,
    f.imports.length ? `\nIT MAY IMPORT only:\n${f.imports.map(importLine).join('\n')}` : '\nIT IMPORTS nothing from this project.',
    f.steps.length ? `\nSTEPS:\n${f.steps.map((s, k) => `${k + 1}. ${_cut(s, b.step)}`).join('\n')}` : null,
    plan.intent && b.intent ? `\nTHE WHOLE PHASE IS FOR: ${_cut(plan.intent, b.intent)}` : null,
    `\nAnswer with the whole file as ONE code block that starts with \`\`\`${lang} ${path} and nothing else. No other file, no explanation, no placeholders, no TODOs.`,
  ].filter(x => x != null).join('\n');
  let b = { purpose: 300, sig: 200, does: 160, step: 300, intent: 300 };
  let message = build(b);
  for (let k = 0; message.length > maxChars && k < 8; k++) {
    b = { purpose: Math.max(80, b.purpose - 60), sig: Math.max(80, b.sig - 30), does: Math.max(0, b.does - 50), step: Math.max(100, b.step - 50), intent: Math.max(0, b.intent - 150) };
    message = build(b);
  }
  return { message, title: `${phaseKey ? `${phaseKey} · ` : ''}${path}`, file: path };
}

/** checkChunk(code, plan, path) -> { ok, missing[], found[] } — did the file come back with every planned export */
function checkChunk(code, plan, path) {
  const f = plan && plan.files.find(x => x.path === path);
  if (!f || !f.exports.length || !/\.[cm]?[jt]s$/.test(path)) return { ok: true, missing: [], found: [] };
  const found = exportsOf(code);
  // a name defined at the top level and listed in the exports object counts; a plain declaration only when ESM/CJS export it
  const missing = f.exports.map(e => e.name).filter(n => !found.includes(n));
  return { ok: missing.length === 0, missing, found };
}

/** summary(plan) — the line a Plan row shows */
function summary(plan) {
  if (!plan) return '';
  return `${plan.files.length} file${plan.files.length === 1 ? '' : 's'} (${plan.mapped} mapped to the registry, ${plan.added} new) · ${plan.conditions.length} condition${plan.conditions.length === 1 ? '' : 's'}${plan.intent ? ` · ${_cut(plan.intent, 160)}` : ''}`;
}

module.exports = { MODULE_ID, VERSION, LAYERS, CHECK_KINDS, LIMITS, PLAN_SHAPE, exportsOf, registryOf, registryText, atlasSection, loomSlice, targetSystem, reuseCandidates, planPrompt, parsePlan, planFeedback, chunkBrief, checkChunk, summary };
