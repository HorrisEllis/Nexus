'use strict';
/**
 * lib/system-nodes.js — every system's commands and capabilities as physical nodes (0.39.271 X1–X3).
 * UUID: nexus-lib-system-nodes-v1-0000-2026-0927-jamesbrooks-001
 * comp_id: nexus.lib.system-nodes
 * Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (X1, X2, X3)
 *
 * James: "i wanted a command index for each system and exactly like gaurdian where
 * all data, commands, etc are physical node types. guardian isnt finished, .hats,
 * .agents. all data are nodes … look at the architecture doc."
 *
 * What was there (read, not recalled): the capability/command/system node files in
 * ten systems came from ONE export run on 2026-09-12 that was never checked in —
 * no code in the tree could make them again, they had drifted from the registries
 * (guardian 36 declared / 33 files, versionium 13/6, intelligence 53/18), and
 * orchestrator, diagnostic, cortex and idearium had none. data/** is state and
 * never ships, so on a fresh tree there were none at all.
 *
 * This is the generator. For each system directory it reads, from the tree:
 *
 *   DECLARED  <sys>/registry-components.js components (else the routes of
 *             <sys>/interaction-contract.json) — what the system says it offers
 *   SERVED    the system's own dispatch, where a real extractor exists:
 *             guardian/lib/command-index-extract.js (guardian/server.js's ifs),
 *             ollama/lib/command-index.js (its routes/*.js), idearium's route
 *             table (idearium/api/index.js ROUTES) — what it actually answers
 *
 * and writes, through lib/node-export.js's one envelope:
 *
 *   <sys>/data/nodes/capability/<id>.capability   one per declared component
 *   <sys>/data/nodes/command/<id>.command         one per command, DECLARED ∪ SERVED,
 *                                                 each marked declared / served —
 *                                                 declared ≠ served made physical
 *   <sys>/data/nodes/system/<sys>.system          the system: port, entry, spec,
 *                                                 counts, which sources were read
 *
 * and Guardian, which hosts the agent types (NODE-TAXONOMY.md rows 1 and 5):
 *
 *   guardian/data/nodes/hat/<name>.hat            every forged hat (lib/hat-forge.js)
 *   guardian/data/nodes/agent/<name>.agent        the agent each hat is the persona of:
 *                                                 name, intent, commands (its toolScope
 *                                                 as command ids), personality
 *
 * §IDEMPOTENT. A node whose payload is unchanged is not rewritten (fingerprint =
 * sha256 of the payload). A changed one is rewritten keeping firstSeenAt. A node
 * whose source is gone is MOVED to <sys>/data/nodes/_archive/<type>/, never
 * deleted (§0.3). Files other writers own (response, injection, chunk, repository,
 * component from cortex's table-materializer, clear-glass seams) are never touched.
 *
 * sync() runs at orchestrator boot (after its port is up, off the request path) and
 * from `node cli/nodes.js sync`. read helpers back GET /api/nodes on the orchestrator.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'system-nodes';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const GENERATED_TYPES = ['capability', 'command', 'system'];
const GUARDIAN_TYPES = ['hat', 'agent'];
const SOURCE_TAG = 'nexus.lib.system-nodes';

const _nx = () => require('./node-export.js');
const _sha = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
const _safeId = (id) => String(id).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 180);

/** every system directory with a registry or an interaction contract */
function systems(root = ROOT) {
  const out = [];
  let ents = []; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch (_) {}
  for (const e of ents) {
    if (!e.isDirectory() || e.name.startsWith('.') || ['node_modules', 'data', 'docs', 'tests', 'lib'].includes(e.name)) continue;
    const reg = fs.existsSync(path.join(root, e.name, 'registry-components.js'));
    const con = fs.existsSync(path.join(root, e.name, 'interaction-contract.json'));
    if (reg || con) out.push({ dir: e.name, registry: reg, contract: con });
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

function _norm(method, p) { return `${String(method || 'GET').toUpperCase()} ${String(p || '').replace(/\/+$/, '') || '/'}`; }

/** declared(dir) -> { from, port, components:[{id, route, …}] } */
function declared(dir, root = ROOT) {
  const regPath = path.join(root, dir, 'registry-components.js');
  if (fs.existsSync(regPath)) {
    try {
      delete require.cache[require.resolve(regPath)];
      const r = require(regPath);
      // two shapes in the tree: { components:[…], port, … } and a bare array of components
      const comps = (Array.isArray(r) ? r : (r.components || r.COMPONENTS || (r.default && (r.default.components || r.default.COMPONENTS)) || [])).filter(c => c && c.id);   // three shapes: {components}, a bare array, {COMPONENTS} (idearium, ESM interop)
      return { from: `${dir}/registry-components.js`, port: (!Array.isArray(r) && r.port) || null, label: (!Array.isArray(r) && r.label) || null, purpose: (!Array.isArray(r) && r.purpose) || null, components: comps };
    } catch (e) { return { from: `${dir}/registry-components.js`, error: e.message, components: [] }; }
  }
  const conPath = path.join(root, dir, 'interaction-contract.json');
  try {
    const c = JSON.parse(fs.readFileSync(conPath, 'utf8'));
    const comps = (c.routes || []).map(r => ({
      id: r._componentId || `${c.namespace || dir}.${String(r.method || 'GET').toLowerCase()}${String(r.path || '').replace(/[^A-Za-z0-9]+/g, '.').replace(/\.+$/, '')}`,
      namespace: c.namespace || dir, name: r._componentId ? r._componentId.split('.').slice(1).join('.') : r.path,
      version: c.version || null, grammar: [], route: { method: r.method || 'GET', path: r.path }, intent: [],
      description: r.description || r.purpose || null, tags: [dir, 'interaction-contract'],
    }));
    return { from: `${dir}/interaction-contract.json`, port: (c.ports && (c.ports.http || c.ports.main)) || null, label: c.namespace || null, purpose: c.role || null, components: comps };
  } catch (e) { return { from: `${dir}/interaction-contract.json`, error: e.message, components: [] }; }
}

/** served(dir) -> { from, commands:[{method, path, …}] } | null when no extractor reads this system's dispatch */
function served(dir, root = ROOT) {
  try {
    if (dir === 'guardian') {
      const r = require(path.join(root, 'guardian', 'lib', 'command-index-extract.js')).extractCommandIndex();
      return { from: 'guardian/lib/command-index-extract.js (guardian/server.js)', commands: r.commands || [] };
    }
    if (dir === 'ollama') {
      const r = require(path.join(root, 'ollama', 'lib', 'command-index.js')).buildCommandIndex();
      return { from: 'ollama/lib/command-index.js (ollama/routes/*.js)', commands: r.commands || [] };
    }
    if (dir === 'idearium') {
      // idearium's ROUTES table: ['GET', ['api','repos',':uuid'], 'repo.get'] — the dispatcher matches exactly these
      const src = fs.readFileSync(path.join(root, 'idearium', 'api', 'index.js'), 'utf8');
      const re = /^\s*\[\s*'(GET|POST|PUT|DELETE|PATCH)'\s*,\s*\[([^\]]*)\]\s*,\s*'([^']+)'\s*\]/gm;
      const commands = []; let m;
      while ((m = re.exec(src))) {
        const segs = m[2].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
        commands.push({ method: m[1], path: '/' + segs.join('/'), name: m[3] });
      }
      return { from: 'idearium/api/index.js ROUTES', commands };
    }
  } catch (e) { return { from: dir, error: e.message, commands: [] }; }
  return null;
}

/** the system's port, entry, and spec — from the kernel table and the tree */
function _systemFacts(dir, root = ROOT) {
  let def = null;
  try { def = require('./nexus-self/systems.js').SYSTEMS.find(s => (s.dirs || []).includes(dir)) || null; } catch (_) {}
  const spec = [`${dir}/spec/${dir}.spec`, `${dir}/${dir}.spec`].find(p => fs.existsSync(path.join(root, p))) || null;
  return { kernel: def ? def.name : null, entry: def ? def.entry : null, port: def ? def.port : null, spec };
}

/** the node set one system should hold now: [{ type, id, payload, meta }] */
function plan(dir, root = ROOT) {
  const d = declared(dir, root);
  const s = served(dir, root);
  const facts = _systemFacts(dir, root);
  const nodes = [];
  const byRoute = new Map();
  for (const c of d.components) {
    const cap = { intent: [], grammar: [], tags: [], ...c, version: c.version || null, description: c.description || null };
    nodes.push({ type: 'capability', id: _safeId(c.id), payload: cap, meta: { context: `${d.from} — declared capability`, source: `${d.from}:${c.id}`, tags: [dir, 'capability', ...(c.served === false ? ['not-served'] : [])] } });
    if (c.route && c.route.path) byRoute.set(_norm(c.route.method, c.route.path), c);
  }
  const servedSet = new Map();
  for (const cmd of (s && s.commands) || []) servedSet.set(_norm(cmd.method, cmd.path), cmd);
  const keys = new Set([...byRoute.keys(), ...servedSet.keys()]);
  for (const k of [...keys].sort()) {
    const c = byRoute.get(k); const sv = servedSet.get(k);
    const [method, p] = k.split(' ');
    const id = _safeId(c ? c.id : `${dir}.${sv.name || (method.toLowerCase() + p.replace(/[^A-Za-z0-9:]+/g, '.'))}`);
    const payload = {
      method, path: p,
      declared: !!c,
      served: s ? !!sv : (c && c.served === false ? false : null),   // null = no extractor reads this system's dispatch
      description: (c && c.description) || (sv && sv.description) || null,
      grammar: (c && c.grammar) || [],
      capability: c ? c.id : null,
      ...(sv && sv.name ? { handler: sv.name } : {}),
      ...(c && c.notServed ? { notServed: c.notServed } : {}),
    };
    const tags = [dir, 'command', ...(payload.declared ? ['declared'] : []), ...(payload.served === true ? ['served'] : payload.served === false ? ['not-served'] : [])];
    nodes.push({ type: 'command', id, payload, meta: { context: `${dir} command — ${payload.declared ? 'declared' : 'NOT declared'} · ${payload.served === true ? 'served' : payload.served === false ? 'NOT served' : 'served unknown (no dispatch extractor)'}`, source: [c ? d.from : null, sv ? s.from : null].filter(Boolean).join(' + '), tags } });
  }
  // one file per node: an id two entries share (idearium /health GET+HEAD, orchestrator's two
  // any-method routes) gets its route appended, so neither overwrites the other on every sync
  const used = new Set();
  for (const n of nodes) {
    let k = `${n.type}/${n.id}`;
    if (used.has(k)) {
      const r = n.payload.route || n.payload;
      n.id = _safeId(`${n.id}~${String(r.method || '').toLowerCase()}${String(r.path || '').replace(/[^A-Za-z0-9]+/g, '.')}`);
      for (let i = 2; used.has(`${n.type}/${n.id}`); i++) n.id = _safeId(`${n.id}~${i}`);
      k = `${n.type}/${n.id}`;
    }
    used.add(k);
  }
  const cmds = nodes.filter(n => n.type === 'command');
  nodes.push({ type: 'system', id: dir, payload: {
    id: dir, kernel: facts.kernel, port: d.port || facts.port || null, entry: facts.entry, spec: facts.spec,
    label: d.label || null, purpose: d.purpose || null,
    hasCapabilities: d.components.length > 0,
    capabilities: d.components.length, commands: cmds.length,
    declaredNotServed: cmds.filter(n => n.payload.declared && n.payload.served === false).map(n => `${n.payload.method} ${n.payload.path}`),
    servedNotDeclared: cmds.filter(n => !n.payload.declared && n.payload.served === true).length,
    sources: { declared: d.from, served: s ? s.from : null, errors: [d.error, s && s.error].filter(Boolean) },
  }, meta: { context: `${dir} — the system record, regenerated from ${d.from}${s ? ` and ${s.from}` : ''}`, source: SOURCE_TAG, tags: [dir, 'system'] } });
  return nodes;
}

/** Guardian's hat + agent nodes, one pair per forged hat */
function agentPlan() {
  let hats = [];
  try { hats = require('./hat-forge.js').list(); } catch (e) { return { error: `hat-forge unavailable: ${e.message}`, nodes: [] }; }
  let commandIds = (scope) => (scope || []).map(String);
  try { commandIds = require('./repo-agent-node.js').commandIds; } catch (_) {}
  const nodes = [];
  for (const h of hats) {
    if (!h || !h.name) continue;
    const id = _safeId(h.name);
    const { _ord, ...hat } = h;
    nodes.push({ type: 'hat', id, payload: hat, meta: { context: 'lib/hat-forge.js forged_hats', summary: `Hat "${h.name}" — baseAgent ${h.baseAgent}${h.model ? `, model ${h.model}` : ''}`, system: 'guardian', source: 'nexus.lib.hat-forge', tags: ['guardian', 'hat', h.baseAgent || 'unknown'].filter(Boolean) } });
    const repoHat = /^repo_/.test(h.name);   // repo hats: repo_<16 hex> (lib/repo-hat.js) and older repo_<uuid slug>
    nodes.push({ type: 'agent', id, payload: {
      name: h.name,
      intent: (h.responsibilities || []).length ? h.responsibilities.join('; ') : repoHat ? 'the project agent of one repo compartment' : `wears the "${h.name}" hat on ${h.baseAgent}`,
      commands: commandIds(h.toolScope || []),
      personality: h.personaPrompt || '',
      hat: h.name, baseAgent: h.baseAgent || null, allowedAgents: h.allowedAgents || null, model: h.model || null,
      allowedIntents: h.allowedIntents || null, scope: repoHat ? 'repo' : 'nexus',
      schema: 'nexus.agent/1',
      note: repoHat ? 'the full bundle (what it learned, its exchanges) is POST /api/repos/:uuid/agent/export (lib/repo-agent-node.js)' : null,
    }, meta: { context: `the agent whose persona is hat "${h.name}"`, summary: `Agent "${h.name}" on ${h.baseAgent}`, system: 'guardian', source: SOURCE_TAG, tags: ['guardian', 'agent', repoHat ? 'repo-agent' : 'nexus-agent'] } });
  }
  return { nodes };
}

function _readEnvelope(file) { try { return _nx().importFromFile(file); } catch (_) { return null; } }

/** write one system's plan; archive what the plan no longer holds (only files this module or the 2026-09-12 export wrote) */
function _apply(baseDir, nodes, types, { dryRun = false, ownedSources = null } = {}) {
  const res = { written: 0, unchanged: 0, archived: 0, byType: {} };
  const want = new Map(nodes.map(n => [`${n.type}/${n.id}`, n]));
  for (const n of nodes) {
    const dir = path.join(baseDir, n.type);
    const file = path.join(dir, `${n.id}.${n.type}`);
    const fp = _sha(n.payload);
    const old = fs.existsSync(file) ? _readEnvelope(file) : null;
    res.byType[n.type] = (res.byType[n.type] || 0) + 1;
    if (old && old.fingerprint === fp) { res.unchanged++; continue; }
    if (!dryRun) _nx().exportToFile(n.type, n.id, n.payload, { ...n.meta, fingerprint: fp, firstSeenAt: old ? (old.firstSeenAt || old.exported_at) : undefined }, dir);
    res.written++;
  }
  for (const type of types) {
    const dir = path.join(baseDir, type);
    let files = []; try { files = fs.readdirSync(dir); } catch (_) { continue; }
    for (const f of files) {
      if (!f.endsWith(`.${type}`)) continue;
      const id = f.slice(0, -(type.length + 1));
      if (want.has(`${type}/${id}`)) continue;
      const doc = _readEnvelope(path.join(dir, f));
      // only what a generator of this kind made: this module, or the uncommitted
      // 2026-09-12 registry export it replaces. Anything else is someone's data.
      const src = String((doc && doc.source) || '');
      const mine = src === SOURCE_TAG || /registry-components|interaction-contract|nexus\.autopilot\.KERNELS/.test(src) || (ownedSources && ownedSources.some(r => r.test(src)));
      if (!mine) continue;
      if (!dryRun) {
        const arch = path.join(baseDir, '_archive', type);
        fs.mkdirSync(arch, { recursive: true });
        fs.renameSync(path.join(dir, f), path.join(arch, `${id}.${Date.now()}.${type}`));
      }
      res.archived++;
    }
  }
  return res;
}

/**
 * sync({ root, only, dryRun, agents }) -> { ok, systems:{dir:{written,unchanged,archived,byType,declared,served}}, guardian:{…}, ms }
 */
function sync({ root = ROOT, only = null, dryRun = false, agents = true } = {}) {
  const started = Date.now();
  const out = { ok: true, systems: {}, guardian: null, errors: [] };
  // §0.39.282 N19 — a test process never rewrites the REAL tree's nodes. Guardian's and the orchestrator's boot sync
  // ran inside every suite that spawns them and rewrote guardian/, copilot/ and clear-glass/data/nodes (exported_at
  // churn on ~250 files, archives made by a test). Tests that exercise sync pass their own root and are unaffected.
  if (path.resolve(root) === path.resolve(ROOT)) {
    try { if (require('./test-sandbox.js').isTestProcess()) { dryRun = true; out.sandboxed = true; } } catch (_) {}
  }
  for (const s of systems(root)) {
    if (only && !only.includes(s.dir)) continue;
    try {
      const nodes = plan(s.dir, root);
      const r = _apply(path.join(root, s.dir, 'data', 'nodes'), nodes, GENERATED_TYPES, { dryRun });
      const sys = nodes.find(n => n.type === 'system').payload;
      out.systems[s.dir] = { ...r, capabilities: sys.capabilities, commands: sys.commands, declaredNotServed: sys.declaredNotServed.length, servedNotDeclared: sys.servedNotDeclared, sources: sys.sources };
    } catch (e) { out.errors.push(`${s.dir}: ${e.message}`); }
  }
  if (agents && (!only || only.includes('guardian'))) {
    const ap = agentPlan();
    if (ap.error) out.errors.push(ap.error);
    else out.guardian = _apply(path.join(root, 'guardian', 'data', 'nodes'), ap.nodes, GUARDIAN_TYPES, { dryRun, ownedSources: [/^nexus\.lib\.hat-forge$/] });
  }
  out.ok = out.errors.length === 0;
  out.ms = Date.now() - started;
  return out;
}

// ── reading (GET /api/nodes on the orchestrator) ────────────────────────────

/** index({ root }) -> { types:{type:count}, systems:{dir:{type:count}} } over every <sys>/data/nodes */
function index({ root = ROOT } = {}) {
  const types = {}, bySystem = {};
  for (const s of systems(root)) {
    const base = path.join(root, s.dir, 'data', 'nodes');
    let ents = []; try { ents = fs.readdirSync(base, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith('_')) continue;
      let n = 0; try { n = fs.readdirSync(path.join(base, e.name)).filter(f => f.endsWith(`.${e.name}`)).length; } catch (_) {}
      if (!n) continue;
      types[e.name] = (types[e.name] || 0) + n;
      (bySystem[s.dir] = bySystem[s.dir] || {})[e.name] = n;
    }
  }
  return { types, systems: bySystem };
}

/** list({ type, system, q, limit }) -> [{ system, id, type, summary|context, tags, payload? }] */
function list({ type, system = null, q = null, limit = 500, full = false, root = ROOT } = {}) {
  const out = [];
  const needle = q ? String(q).toLowerCase() : null;
  for (const s of systems(root)) {
    if (system && s.dir !== system) continue;
    const dir = path.join(root, s.dir, 'data', 'nodes', type);
    let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith(`.${type}`)).sort(); } catch (_) { continue; }
    for (const f of files) {
      const doc = _readEnvelope(path.join(dir, f));
      if (!doc) continue;
      if (needle && !JSON.stringify(doc).toLowerCase().includes(needle)) continue;
      out.push(full ? { system: s.dir, ...doc } : { system: s.dir, type: doc.type, id: doc.id, context: doc.context, summary: doc.summary, tags: doc.tags, source: doc.source,
        ...(type === 'command' ? { method: doc.payload.method, path: doc.payload.path, declared: doc.payload.declared, served: doc.payload.served } : {}) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** get(type, id, { system }) -> the envelope, or null */
function get(type, id, { system = null, root = ROOT } = {}) {
  for (const s of systems(root)) {
    if (system && s.dir !== system) continue;
    const f = path.join(root, s.dir, 'data', 'nodes', type, `${_safeId(id)}.${type}`);
    if (fs.existsSync(f)) { const d = _readEnvelope(f); if (d) return { system: s.dir, ...d }; }
  }
  return null;
}

module.exports = { MODULE_ID, VERSION, GENERATED_TYPES, GUARDIAN_TYPES, systems, declared, served, plan, agentPlan, sync, index, list, get };
