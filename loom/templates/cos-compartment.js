'use strict';
/**
 * loom/templates/cos-compartment.js — the template for a Nexus system's COS compartment (0.60.134)
 * comp_id: nexus.loom.templates.cos-compartment
 * UUID: nexus-loom-templates-cos-compartment-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-10-17-system-drawbridge-phasemap.spec DB11 (each system in its compartment);
 *      docs/2026-10-17-infrastructure-migration-phasemap.spec IM5 (its gate: sovereign, then into its compartment)
 *
 * James, 2026-10-17: "and you know i mean cos compartment right? make a template for it now that loom holds" · earlier the
 * same day: "cos is the isolated compartment for each system using the regisry as a drawbridge" · "each system is soveriegn
 * and self contained. use the compartments to isolated each system". 2026-09-11 (0.39.261, idearium/repo/nexus-self.js):
 * "i want a nexus repo in idearium, that immutable with nested compartments per system so i can manage nexus from inside
 * nexus."
 *
 * The compartments already exist: nexus-self (parent) and nexus-self-<system> (one child per system), made by
 * idearium/repo/nexus-self.js ensureCompartments(), the live folders mounted READ-ONLY so Nexus is seen, never written.
 * This template does not make a second set. It says, per system, what its compartment holds once the system runs in it:
 *
 *   cos        the COS create config (lib/cos-bridge.js createCompartment): name, parent, purpose, runtime, network isolated,
 *              and its INTENT (cos/foundation/intent.js): the end state, the conditions it holds, the axioms it chooses by —
 *              every check runnable (file / command), so COS's VERIFYING phase checks something real.
 *   runtime    entry, port, health route — from lib/system-registry.js (the tunnel), never typed here.
 *   mounts     its own folder (read-write once it runs there; read-only while it is the nexus-self mirror), the kernel
 *              read-only (lib/, node_modules/ — DB0a's recommendation, his to confirm), nothing of any other system.
 *   drawbridge its registry and contract: the only door in; other systems reached through their routes (the tunnel).
 *   store      its node files, its node database, its own JAA store — this compartment's process the one writer.
 *   seal       ready only when the system is sovereign (lib/system-boundary.js sovereignty()): until then the blockers are
 *              listed, and the compartment stays a mirror. A system is moved in by the seal, never before.
 *
 *   compartmentFor(system, { root })  → the manifest (schema nexus.compartment/2), or { ok:false, error }
 *   compartments({ root })             → every system the runtime registry knows, plus those with a registry
 *   apply({ system, root, cos })        → each system's intent written onto its existing compartment (lib/cos-bridge.js
 *                                         setIntent). It creates none: idearium/repo/nexus-self.js ensureCompartments() stays
 *                                         the one creator; a missing compartment is said, with how to make it.
 *   state(system, { cos })              → what COS holds for it now: does the compartment exist, its effective intent
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.loom.templates.cos-compartment';
const VERSION = '1.0.0';
const SCHEMA = 'nexus.compartment/2';
const PARENT = 'nexus-self';   // idearium/repo/nexus-self.js PARENT_COMPARTMENT — the same compartments, not a second set
const ROOT = path.resolve(__dirname, '..', '..');
// the genesis 1.5.0 axioms a system's compartment chooses by (cos/foundation/intent.js allows five)
const AXIOMS = Object.freeze([
  'SOVEREIGN_FOLDER: require no file outside this system\'s folder; the kernel is mounted read-only',
  'REGISTRY_IS_THE_DRAWBRIDGE: reach another system only through its routes, its CLI or a handoff',
  'ONE_WRITER_PER_STORE: this process is the one writer of this system\'s node database and store',
  'FILES_WITH_THEIR_SYSTEM: a file that serves this system lives in this folder',
  'NODES_IN_RELATION: every node names this system; its relations are nodes',
]);

const _rel = (root, p) => path.relative(root, p).split(path.sep).join('/');
const _exists = (root, rel) => { try { return fs.existsSync(path.join(root, rel)); } catch (_) { return false; } };

function compartmentFor(system, { root = ROOT } = {}) {
  root = path.resolve(root);
  const SR = require('../../lib/system-registry.js');
  const SB = require('../../lib/system-boundary.js');
  const folder = SR.folderOf(system) || (_exists(root, system) ? system : null);
  if (!folder) return { ok: false, error: `no system named ${system}` };
  const rt = SR.get(system) || SR.list().find(s => SR.folderOf(s.name) === folder) || null;
  const sov = SB.sovereignty({ root, system: folder }).systems[0] || null;
  const abs = (rel) => path.join(root, rel);
  const reg = `${folder}/registry-components.js`, contract = `${folder}/interaction-contract.json`;
  const check = `node "${abs('lib/system-boundary.js')}" sovereign ${folder} --root "${root}"`;
  const intent = {
    endState: [
      { says: `${folder} is sovereign: nothing it requires is in another system's folder`, check: { kind: 'command', run: check, timeoutMs: 60000 } },
    ],
    conditions: [
      ...(_exists(root, reg) ? [{ says: `${folder}'s registry is its door`, check: { kind: 'file', path: abs(reg) } }] : []),
      ...(_exists(root, contract) ? [{ says: `${folder}'s interaction contract is published`, check: { kind: 'file', path: abs(contract) } }] : []),
    ],
    axioms: [...AXIOMS],
  };
  const blockers = sov ? sov.blockers : null;
  const sealed = !!(sov && sov.sovereign);
  return {
    ok: true,
    schema: SCHEMA,
    system: folder,
    id: `${PARENT}-${folder}`,
    cos: {
      name: `${PARENT}-${folder}`,
      parent: PARENT,
      purpose: `Nexus system: ${folder} — sovereign, self-contained, reached only through its registry`,
      runtimeId: 'node',
      networkIsolated: true,
      intent,
    },
    runtime: rt ? { name: rt.name, entry: null, port: rt.port || null, healthUrl: rt.healthUrl || null, phase: rt.phase ?? null }
                : { name: null, port: null, healthUrl: null, said: `${folder} is not in the runtime registry (autopilot, diagnostic, version.js): no process of its own yet` },
    mounts: [
      { path: `${folder}/`, mode: sealed ? 'rw' : 'ro', why: sealed ? 'its own folder: it runs here' : 'its own folder, mirrored read-only until it is sovereign' },
      { path: 'lib/', mode: 'ro', why: 'the kernel every system uses (DB0a: the coder\'s recommendation, his to confirm)' },
      { path: 'node_modules/', mode: 'ro', why: 'its dependencies' },
      // 0.60.242 LM4 — the kernel's folded parts and the language (lib/system-boundary.js FOLDED → lib, LANGUAGE_PATHS): what every system
      // may use without crossing, so the wall allows exactly what the census allows
      ...Object.entries(SB.FOLDED).filter(([, home]) => home === SB.KERNEL).map(([f]) => ({ path: `${f}/`, mode: 'ro', why: `folded into the kernel (${f})` })),
      ...SB.LANGUAGE_PATHS.map(p => ({ path: p, mode: 'ro', why: 'the language (emerge + warp): using it is not a crossing' })),
    ],
    drawbridge: {
      registry: _exists(root, reg) ? reg : null,
      contract: _exists(root, contract) ? contract : null,
      reaches: 'other systems through their routes, found through lib/system-registry.js (the tunnel); never their files',
      ...(_exists(root, reg) ? {} : { said: `${folder} has no registry yet (DB16): nothing can reach it through the drawbridge` }),
    },
    store: {
      nodes: `${folder}/data/nodes`,
      nodeIndex: `${folder}/data/node-index`,
      jaa: `${folder}/data/jaa`,
      writer: 'this compartment\'s process, alone (ONE_WRITER_PER_STORE)',
    },
    seal: {
      ready: sealed,
      why: sealed ? 'sovereign: it can run in its compartment' : `not yet sovereign: ${sov ? sov.out : '?'} crossing(s) to close first`,
      ...(blockers ? { blockers } : {}),
    },
  };
}

/**
 * boundaryFor(system) → { name, allow: [absolute], mode } — 0.60.242 LM4: the wall cos/compartment/boundary.js puts up, from the manifest's
 * mounts (its own folders, the kernel, the language, node_modules) and nothing else. Its own folders are every dir the system owns
 * (lib/nexus-self/systems.js dirs: emerge owns emerge/ and warp/).
 */
function boundaryFor(system, { root = ROOT, mode = 'enforce' } = {}) {
  root = path.resolve(root);
  const m = compartmentFor(system, { root });
  if (!m.ok) return m;
  const S = require('../../lib/nexus-self/systems.js');
  const own = (S.SYSTEMS.find(s => (s.dirs || [])[0] === m.system) || {}).dirs || [m.system];
  const rels = [...new Set([...own.map(d => `${d}/`), ...m.mounts.map(x => x.path)])];
  return { ok: true, name: m.cos.name, mode, allow: rels.map(r => path.join(root, r)), entry: (S.SYSTEMS.find(s => (s.dirs || [])[0] === m.system) || {}).entry || null };
}

/**
 * moveIn({ system, root, cos, mode, env }) → { ok, compartment, boundary, pid } — 0.60.242 LM4: the seal moves a system in, never before.
 * Its compartment (made under nexus-self when missing, as ensureCompartments would) gets its entry as its runtime and the wall in its env;
 * then COS starts it, and COS's process runner spawns it behind the wall. Refused, with the blockers, while it is not sovereign.
 */
function moveIn({ system, root = ROOT, cos = null, mode = 'enforce', env = {} } = {}) {
  const cb = _cos(cos);
  if (!cb) return { ok: false, error: 'COS bridge unavailable' };
  const m = compartmentFor(system, { root });
  if (!m.ok) return m;
  if (!m.seal.ready) return { ok: false, error: `the seal is not ready: ${m.seal.why}`, blockers: m.seal.blockers || null };
  const b = boundaryFor(system, { root, mode });
  if (!b.entry) return { ok: false, error: `${m.system} has no entry in lib/nexus-self/systems.js: nothing to run` };
  let c = cb.getCompartment(m.cos.name);
  if (!c) {
    let parent = cb.getCompartment(PARENT);
    if (!parent) { const p = cb.createCompartment({ name: PARENT, purpose: 'Nexus itself — the immutable base; one child compartment per system', networkIsolated: true }); if (!p.ok) return { ok: false, error: `parent compartment: ${p.error}` }; parent = p.compartment; }
    const r = cb.createCompartment({ name: m.cos.name, purpose: m.cos.purpose, runtimeId: 'node', networkIsolated: true, parentId: parent.id });
    if (!r.ok) return { ok: false, error: `compartment: ${r.error}` };
    c = r.compartment;
  }
  const envVars = { ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)])), COS_BOUNDARY: JSON.stringify({ name: b.name, allow: b.allow, mode: b.mode }) };
  const rt = cb.setRuntime(c.id, { runtimeId: 'node', entryFile: path.join(path.resolve(root), b.entry), envVars });
  if (!rt.ok) return { ok: false, error: `runtime: ${rt.error}` };
  const st = cb.start(c.id);
  if (!st.ok) return { ok: false, error: `start: ${st.error}` };
  const pr = typeof cb.processOf === 'function' ? cb.processOf(c.id) : null;   // through the kernel's bridge into COS, not COS's files
  const pid = pr ? pr.pid : null;
  return { ok: true, system: m.system, compartment: { id: c.id, name: c.name }, boundary: { mode: b.mode, allow: b.allow.map(a => _rel(path.resolve(root), a) || '.') }, entry: b.entry, pid };
}

function compartments({ root = ROOT } = {}) {
  const SR = require('../../lib/system-registry.js');
  const names = new Set();
  for (const s of SR.list()) { const f = SR.folderOf(s.name); if (f) names.add(f); }
  for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && _exists(root, `${e.name}/registry-components.js`) && e.name !== 'cos') names.add(e.name);
  return [...names].sort().map(n => compartmentFor(n, { root })).filter(m => m.ok);
}

function _cos(cos) { if (cos) return cos; try { return require('../../lib/cos-bridge.js'); } catch (_) { return null; } }

function apply({ system = null, root = ROOT, cos = null } = {}) {
  const cb = _cos(cos);
  if (!cb) return { ok: false, error: 'COS bridge unavailable' };
  const list = system ? [compartmentFor(system, { root })] : compartments({ root });
  const out = [];
  for (const m of list) {
    if (!m.ok) { out.push({ system, ok: false, error: m.error }); continue; }
    const c = cb.getCompartment(m.cos.name);
    if (!c) { out.push({ system: m.system, compartment: m.cos.name, ok: false, said: `no compartment ${m.cos.name} yet: idearium's Nexus repo sync makes it (idearium/repo/nexus-self.js ensureCompartments)` }); continue; }
    const r = cb.setIntent(c.id, m.cos.intent);
    out.push({ system: m.system, compartment: m.cos.name, ok: !!r.ok, ...(r.ok ? { dropped: r.dropped || [] } : { error: r.error }), seal: m.seal.ready });
  }
  return { ok: out.every(x => x.ok || x.said), applied: out.filter(x => x.ok).length, results: out };
}

function state(system, { root = ROOT, cos = null } = {}) {
  const m = compartmentFor(system, { root });
  if (!m.ok) return m;
  const cb = _cos(cos);
  const c = cb ? cb.getCompartment(m.cos.name) : null;
  return { ...m, live: c ? { exists: true, id: c.id, parentId: c.parentId || null, intent: cb.intentOf(c.id) } : { exists: false, said: cb ? 'not created yet (ensureCompartments)' : 'COS bridge unavailable' } };
}

module.exports = { MODULE_ID, VERSION, SCHEMA, PARENT, AXIOMS, compartmentFor, compartments, apply, state, boundaryFor, moveIn };
