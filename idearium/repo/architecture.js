/**
 * idearium/repo/architecture.js — a repo's own component registry and wiring map, in loom's shape.
 * §0.39.284 W7 · Map: docs/2026-09-30-idearium-coding-flow-phasemap.spec (W7_next_mapped_2026_09_30, item 2)
 * UUID: nexus-idearium-repo-architecture-v1-0000-2026-0930-jamesbrooks-001
 *
 * James: "the architect tab should be the component registry and loom style map for the wiring … identicle to what
 * nexus and loom has, a full map for wiring, ids, types, relation, consumers, orphans, node types, data dir, full
 * architecture map" · "anything from the lib folder we should use?"
 *
 * Reuse, not a second scanner (§8.6): the repo's code-intel index (lib/code-intel — built when the repo is chunked)
 * already holds every file, its language and lines, and every chunk's exports and resolved imports/uses with the file
 * they point at. This projects that into loom's registry vocabulary (loom/schema: component · hook · wire), with loom's
 * id rule (loom/scanners/source-map.js idFor: path → dotted id, index collapsed), so a repo's map reads like NEXUS's.
 *
 *   architecture(intel, { repoName, readFile }) -> { components, hooks, wires, externals, orphans, dataDirs, nodeTypes,
 *                                                     layers, routes, cli, events, stats }
 *   A projection — it stores nothing; POST …/architecture writes it into the repo as ARCHITECTURE.json (versioned).
 *
 * §0.39.286 RC2 (docs/2026-10-01-routing-registry-genesis-phasemap.spec) — James: "the registry … is its self the
 * doorway, and the rest is isolated modular, interacting through the interaction contract/registry … routes, cli,
 * nodes and dir, everything loom and the component registry have … the nodes based data structure exactly like guardian".
 *   readFile(path) → text lets it read each file's routes (express/fastify/koa calls, ['GET','/x'] route tables, Flask
 *   @route), CLI commands (.command('x'), add_parser('x'), a cli file's case 'x':) and events (emit('x') → on('x'),
 *   wired emitter → consumer).
 *   toNodes(arch, { repoName }) → [{ path, type, id, envelope }] — the registry as Guardian's nodes:
 *   nodes/<type>/<id>.<type> in lib/node-export.js's envelope (.component .hook .wire .event .command .contract .system).
 */
import path from 'path';

const NODE_EXT = /\.(spec|chunk|inject|agent|hat|tool|command|capability|system|event|intent|response|node|filetree|architecture|gap|rule|step_gate|phasemap)$/i;
const DATA_DIR = /(^|\/)(data|store|stores|db|database|fixtures|seed|seeds|migrations|assets)(\/|$)/i;
const ENTRY = /(^|\/)(index|main|app|server|cli|bin\/[^/]+|boot|start)\.(m?js|cjs|ts|tsx|jsx|py)$/i;
const TEST = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$/i;
const NODES_DIR = /^nodes\/|^ARCHITECTURE\.json$/;   // the registry's own output (its nodes, ARCHITECTURE.json) is not a component of the repo

// §0.39.286 RC2 — what a file declares at its edges, read from its text
const ROUTE_RES = [
  /\b(?:app|router|server|api|fastify|r|route|routes)\.(get|post|put|patch|delete|all)\(\s*['"`](\/[^'"`]*)['"`]/gi,
  /\[\s*['"](GET|POST|PUT|PATCH|DELETE)['"]\s*,\s*['"](\/[^'"]*)['"]/g,
  /@(?:app|bp|router|blueprint)\.(get|post|put|patch|delete|route)\(\s*['"](\/[^'"]*)['"]/gi,
];
const CLI_RES = [/\.command\(\s*['"`]([\w:-]+)/g, /add_parser\(\s*['"]([\w:-]+)['"]/g];
const EMIT_RE = /\b(?:emit|publish|dispatchEvent|send)\(\s*['"`]([\w.:/-]{2,})['"`]/g;
const ON_RE = /\.(?:on|once|addListener|subscribe|addEventListener|handle)\(\s*['"`]([\w.:/-]{2,})['"`]/g;
const DOM_EVENTS = new Set(['click', 'change', 'input', 'submit', 'load', 'error', 'close', 'open', 'message', 'data', 'end', 'exit', 'keydown', 'keyup', 'resize', 'scroll', 'focus', 'blur', 'mouseover', 'mouseout', 'connection', 'request', 'listening', 'finish', 'drain', 'readable', 'uncaughtException', 'unhandledRejection', 'SIGINT', 'SIGTERM']);
function _all(re, text) { const out = []; re.lastIndex = 0; let m; while ((m = re.exec(text))) out.push(m); return out; }
export function edgesOf(rel, text) {
  const t = String(text || '');
  const routes = [];
  for (const re of ROUTE_RES) for (const m of _all(re, t)) routes.push({ method: m[1].toUpperCase() === 'ROUTE' ? 'ANY' : m[1].toUpperCase(), path: m[2] });
  const cli = [];
  for (const re of CLI_RES) for (const m of _all(re, t)) cli.push(m[1]);
  if (layerOf(rel) === 'cli') for (const m of _all(/\bcase\s+['"]([a-z][\w:-]*)['"]\s*:/g, t)) cli.push(m[1]);
  const emits = _all(EMIT_RE, t).map(m => m[1]).filter(e => !DOM_EVENTS.has(e));
  const handles = _all(ON_RE, t).map(m => m[1]).filter(e => !DOM_EVENTS.has(e));
  const u = (a) => [...new Set(a)];
  return { routes: [...new Map(routes.map(r => [`${r.method} ${r.path}`, r])).values()], cli: u(cli), emits: u(emits), handles: u(handles) };
}

/** idFor — loom's rule (loom/scanners/source-map.js), under the repo's own namespace */
export function idFor(rel, ns = 'repo') {
  let p = String(rel).replace(/\\/g, '/').replace(/\.(m?js|cjs|ts|tsx|jsx|py|go|rs|java|rb)$/i, '').replace(/\/index$/, '');
  return `${ns}.${p.split('/').filter(Boolean).map(x => x.replace(/[^\w-]/g, '_')).join('.')}`;
}

/** layerOf — the same bottom-up layers the plan uses (idearium/repo/spec-plan.js LAYERS) */
export function layerOf(rel) {
  const p = String(rel).toLowerCase();
  if (TEST.test(p)) return 'test';
  if (/(^|\/)(ui|views?|pages?|components|public|web|frontend|client|styles?)\/|\.(css|html|vue|svelte|tsx|jsx)$/.test(p)) return 'ui';
  if (/(^|\/)(cli|bin|commands?)\/|(^|\/)cli\.[a-z]+$/.test(p)) return 'cli';
  if (/(^|\/)(api|routes?|server|handlers?|controllers?|http|rpc)\/|(^|\/)(server|routes?)\.[a-z]+$/.test(p)) return 'api';
  if (/(^|\/)(jobs?|workers?|schedul\w*|cron|loops?|daemons?|automation|pipelines?)\//.test(p)) return 'automation';
  if (/(^|\/)(types?|schemas?|models?|config|constants?|kernel|core|primitives?)\/|(^|\/)(types?|schema|config|constants?)\.[a-z]+$/.test(p)) return 'foundation';
  return 'library';
}
const LAYER_ORDER = ['foundation', 'library', 'api', 'cli', 'automation', 'ui', 'test'];

export function architecture(intel, { repoName = 'repo', readFile = null } = {}) {
  if (!intel || intel.error) return { error: (intel && intel.error) || 'no code index' };
  const ns = String(repoName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'repo';
  const files = (intel.files || []).filter(f => !NODES_DIR.test(f.path));
  const cards = Object.values(intel.cards || {});
  const byFile = new Map();
  for (const f of files) byFile.set(f.path, { file: f.path, id: idFor(f.path, ns), language: f.language || null, lines: f.lineCount || 0,
    layer: layerOf(f.path), type: NODE_EXT.test(f.path) ? 'node' : TEST.test(f.path) ? 'test' : /\.(json|ya?ml|toml|ini|env)$/i.test(f.path) ? 'config' : /\.(md|txt|rst)$/i.test(f.path) ? 'doc' : 'module',
    exports: [], imports: [], consumers: new Set(), deps: new Set(), entry: ENTRY.test(f.path) });
  const externals = new Map();
  for (const c of cards) {
    const me = byFile.get(c.file); if (!me) continue;
    if (c.exported && c.name) me.exports.push(c.name);
    for (const s of c.imports || []) {
      const spec = String(s);
      if (!/^[./]/.test(spec)) { const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]; if (!externals.has(pkg)) externals.set(pkg, new Set()); externals.get(pkg).add(c.file); }
    }
    for (const u of c.uses || []) {
      if (!u.file || u.file === c.file || u.basis !== 'import') continue;
      const dep = byFile.get(u.file); if (!dep) continue;
      me.deps.add(u.file); dep.consumers.add(c.file);
    }
  }
  const comps = [...byFile.values()].map(x => ({ ...x, exports: [...new Set(x.exports)].slice(0, 40), consumers: [...x.consumers].sort(), deps: [...x.deps].sort(), imports: undefined }));
  const hooks = [], wires = [];
  for (const c of comps) {
    if (c.consumers.length) hooks.push({ id: `${c.id}.export`, component_id: c.id, name: 'export', direction: 'out', type: 'direct' });
    if (c.deps.length) hooks.push({ id: `${c.id}.import`, component_id: c.id, name: 'import', direction: 'in', type: 'direct' });
  }
  let n = 0;
  for (const c of comps) for (const d of c.deps) { const dep = byFile.get(d); wires.push({ id: `${ns}.wire.${++n}.${dep.id}--${c.id}`, from_hook_id: `${dep.id}.export`, to_hook_id: `${c.id}.import`, from: dep.file, to: c.file, relation: 'requires' }); }
  // §0.39.286 RC2 — routes, CLI commands, events: read from each module's text when a reader is given
  const routes = [], cli = [], events = new Map();
  if (typeof readFile === 'function') {
    for (const c of comps) {
      if (c.type !== 'module') continue;
      let text = null; try { text = readFile(c.file); } catch (_) { text = null; }
      if (!text) continue;
      const e = edgesOf(c.file, text);
      c.routes = e.routes; c.cli = e.cli; c.emits = e.emits; c.handles = e.handles;
      for (const r of e.routes) routes.push({ ...r, file: c.file, component: c.id });
      for (const v of e.cli) cli.push({ verb: v, file: c.file, component: c.id });
      for (const ev of e.emits) { const x = events.get(ev) || { name: ev, emittedBy: [], consumedBy: [] }; x.emittedBy.push(c.file); events.set(ev, x); }
      for (const ev of e.handles) { const x = events.get(ev) || { name: ev, emittedBy: [], consumedBy: [] }; x.consumedBy.push(c.file); events.set(ev, x); }
      if (e.routes.length) hooks.push({ id: `${c.id}.route`, component_id: c.id, name: 'route', direction: 'in', type: 'api' });
      if (e.cli.length) hooks.push({ id: `${c.id}.cli`, component_id: c.id, name: 'cli', direction: 'in', type: 'cli' });
      if (e.emits.length) hooks.push({ id: `${c.id}.emit`, component_id: c.id, name: 'emit', direction: 'out', type: 'event_bus' });
      if (e.handles.length) hooks.push({ id: `${c.id}.on`, component_id: c.id, name: 'on', direction: 'in', type: 'event_bus' });
    }
    for (const ev of events.values()) for (const from of ev.emittedBy) for (const to of ev.consumedBy) {
      if (from === to) continue;
      const a = byFile.get(from), b = byFile.get(to);
      wires.push({ id: `${ns}.wire.${++n}.${a.id}--${b.id}`, from_hook_id: `${a.id}.emit`, to_hook_id: `${b.id}.on`, from, to, relation: 'event', event: ev.name });
    }
  }
  // orphans: code nothing uses and that uses nothing — entry points, tests, docs and config are not orphans by nature
  const orphans = comps.filter(c => c.type === 'module' && !c.entry && !c.consumers.length && !c.deps.length && !(c.routes && c.routes.length) && !(c.cli && c.cli.length) && !(c.emits && c.emits.length) && !(c.handles && c.handles.length)).map(c => c.file);
  const dataDirs = [...new Set(files.map(f => f.path).filter(p => DATA_DIR.test(p)).map(p => { const m = p.match(DATA_DIR); return p.slice(0, m.index + m[0].replace(/\/$/, '').length); }))].sort();
  const nodeTypes = {}; for (const f of files) { const m = f.path.match(NODE_EXT); if (m) nodeTypes[m[1].toLowerCase()] = (nodeTypes[m[1].toLowerCase()] || 0) + 1; }
  const layers = {}; for (const c of comps) (layers[c.layer] = layers[c.layer] || []).push(c.file);
  // bottom-up breaches: a lower layer requiring a higher one (§3.1)
  const rank = (l) => LAYER_ORDER.indexOf(l);
  const breaches = wires.filter(w => w.relation === 'requires').filter(w => { const a = byFile.get(w.to), b = byFile.get(w.from); return rank(a.layer) < rank(b.layer) && a.layer !== 'test' && b.layer !== 'test'; }).map(w => ({ consumer: w.to, dependency: w.from }));
  return {
    namespace: ns, components: comps.sort((a, b) => rank(a.layer) - rank(b.layer) || a.file.localeCompare(b.file)), hooks, wires,
    externals: [...externals.entries()].map(([name, used]) => ({ name, usedBy: [...used].sort() })).sort((a, b) => b.usedBy.length - a.usedBy.length),
    orphans, dataDirs, nodeTypes, layers, breaches,
    routes, cli, events: [...events.values()].map(e => ({ ...e, emittedBy: [...new Set(e.emittedBy)].sort(), consumedBy: [...new Set(e.consumedBy)].sort() })).sort((a, b) => a.name.localeCompare(b.name)),
    stats: { components: comps.length, hooks: hooks.length, wires: wires.length, externals: externals.size, orphans: orphans.length, breaches: breaches.length, routes: routes.length, cli: cli.length, events: events.size, lines: comps.reduce((s, c) => s + c.lines, 0) },
    layerOrder: LAYER_ORDER,
  };
}

/**
 * toNodes(arch, { repoName, now }) — the registry as Guardian's nodes (§0.39.286 RC2).
 * Each: { path: 'nodes/<type>/<id>.<type>', type, id, envelope } — the envelope is lib/node-export.js wrap()'s shape,
 * with fingerprint = sha256 of the payload, so a writer can leave an unchanged node alone (as lib/system-nodes.js does).
 * Types: component · hook · wire · event · command (routes and CLI) · contract (the interaction contract) · system.
 */
export function toNodes(a, { repoName = 'repo', wrap, hash, now = Date.now() } = {}) {
  if (!a || a.error) return [];
  const ns = a.namespace || 'repo';
  const out = [];
  const safe = (x) => String(x).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'x';
  const add = (type, id, payload, meta) => {
    const env = wrap(type, id, payload, { system: ns, source: 'idearium/repo/architecture.js', fingerprint: hash(JSON.stringify(payload)), ...meta });
    env.exported_at = now; env.firstSeenAt = now; env.lastSeenAt = now;
    out.push({ path: `nodes/${type}/${safe(id)}.${type}`, type, id, envelope: env });
  };
  for (const c of a.components) add('component', c.id, { id: c.id, namespace: ns, name: c.file.split('/').pop(), version: '0.0.0', dir: c.file, file: c.file, type: c.type, layer: c.layer, language: c.language, lines: c.lines, entry: !!c.entry,
    exports: c.exports, consumers: c.consumers, deps: c.deps, routes: c.routes || [], cli: c.cli || [], emits: c.emits || [], handles: c.handles || [] },
    { context: `${repoName} component registry`, intent: `${c.layer} ${c.type}`, summary: `${c.file} — ${c.consumers.length} consumer(s), ${c.deps.length} dep(s)`, tags: [c.layer, c.type] });
  for (const h of a.hooks) add('hook', h.id, h, { context: `${repoName} hooks`, summary: `${h.component_id} ${h.direction} ${h.type}`, tags: [h.type, h.direction] });
  for (const w of a.wires) add('wire', w.id, w, { context: `${repoName} wiring`, intent: w.relation, summary: `${w.from} → ${w.to}${w.event ? ` (${w.event})` : ''}`, tags: [w.relation] });
  for (const e of a.events || []) add('event', `${ns}.event.${e.name}`, e, { context: `${repoName} events`, summary: `${e.emittedBy.length} emitter(s), ${e.consumedBy.length} consumer(s)`, tags: [e.consumedBy.length ? 'handled' : 'unhandled'] });
  for (const r of a.routes || []) add('command', `${ns}.route.${r.method}.${r.path}`, { kind: 'route', ...r }, { context: `${repoName} routes`, summary: `${r.method} ${r.path} — ${r.file}`, tags: ['route', r.method] });
  for (const c of a.cli || []) add('command', `${ns}.cli.${c.verb}`, { kind: 'cli', ...c }, { context: `${repoName} CLI`, summary: `${c.verb} — ${c.file}`, tags: ['cli'] });
  const entries = a.components.filter(c => c.entry).map(c => c.file);
  add('contract', `${ns}.interaction-contract`, {
    doorway: 'this registry: nodes/ — every component, hook, wire, event and command, read before anything is called',
    rules: [
      'a module reaches another only through a declared hook: an import listed as a wire, an event, a route or a CLI command',
      'lower layers never require higher ones (bottom-up: ' + (a.layerOrder || []).join(' → ') + ')',
      'the UI reads the registry and calls routes and events; it imports no module directly',
      'an orphan or an unhandled event is a gap, not an accident',
    ],
    layers: a.layerOrder, entries,
    crossings: { requires: a.wires.filter(w => w.relation === 'requires').length, events: a.wires.filter(w => w.relation === 'event').length, routes: (a.routes || []).length, cli: (a.cli || []).length },
    breaches: a.breaches, orphans: a.orphans, unhandledEvents: (a.events || []).filter(e => !e.consumedBy.length).map(e => e.name),
  }, { context: `${repoName} interaction contract`, intent: 'the doorway', summary: `${a.breaches.length} breach(es), ${a.orphans.length} orphan(s)`, tags: ['contract'] });
  add('system', ns, { name: repoName, namespace: ns, entries, dataDirs: a.dataDirs, nodeTypes: a.nodeTypes, externals: (a.externals || []).map(e => e.name), stats: a.stats },
    { context: `${repoName}`, summary: `${a.stats.components} components · ${a.stats.wires} wires · ${a.stats.routes || 0} routes · ${a.stats.events || 0} events`, tags: ['system'] });
  return out;
}
