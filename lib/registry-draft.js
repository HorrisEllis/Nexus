'use strict';
/**
 * lib/registry-draft.js — DB16: a registry drafted for every system that has none, from its own source.
 * comp_id: nexus.lib.registry-draft
 * Map: docs/2026-10-17-system-drawbridge-phasemap.spec DB16_a_registry_for_each_system (and docs/2026-10-23-cos-spine-phasemap.spec
 * CS_D7_sovereign_first: a system is opened by COS only once it is sovereign, on its own registry).
 *
 * James, 2026-10-24: "then we need to resume the component registery for each system, get the mall sovereign, then cos phases to
 * migrate." · to the choice "1 registries per system (DB16), COS first": "1"
 *
 * Nothing is invented: every line of a draft comes from the tree (§0.1), and says where.
 *   components   the routes its interaction-contract.json declares (lib/route-contract-check.js already holds those to the code)
 *   events       its event-taxonomy.js when it has one (pointed at, the one truth for names, ET1), and the event names its .js files
 *                emit / handle as string literals (prefixed by the system's name)
 *   reached_into the files other systems require today (lib/system-boundary.js, DB1): capabilities that are not routes yet; each is
 *                where a drawbridge route has to go before that system is sovereign (DB6)
 *   sovereignty  its own way out: the files it requires from other systems, by blocker (data / primitive / capability)
 * A draft is a proposal: written as <system>/registry-components.draft.json (draft: true), a name nothing reads — lib/system-registry.js,
 * lib/system-nodes.js and others take any <system>/registry-components.js as declared, so a draft under that name would be in force
 * before he accepted it. Accepting it: rename it to registry-components.js and add the system to loom/scanners/capability-map.js SYSTEMS.
 *
 *   draft(system, { root })  → { systemId, draft: true, ..., components, events, reached_into, sovereignty, said }
 *   text(d)                  → the module's source
 *   missing({ root })        → the systems with no registry-components.js (DB16's list, from the census)
 *   cli: node lib/registry-draft.js <system…> | --missing  [--write → <system>/registry-components.draft.json]
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.registry-draft';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
// DB16's open question, read by the coder (docs/2026-10-17-system-drawbridge-phasemap.spec): parts of other systems, faces on routes, or DB0a
// one truth (lib/system-boundary.js): the kernel, the parts of other systems and the faces (PARTS), and the folders that are not systems,
// folded into their home or parked (FOLDED, his 2026-10-24 "Aren't systems") — none gets a registry of its own
const NOT_SYSTEMS = (() => { const SB = require('./system-boundary.js'); return new Set([SB.KERNEL, ...SB.PARTS, ...Object.keys(SB.FOLDED)]); })();

function _js(root, dir, out = [], depth = 0) {
  if (depth > 6) return out;
  let ents; try { ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (['node_modules', 'data', 'test', 'tests', '.git', 'phases', 'dist'].includes(e.name)) continue;
    const r = `${dir}/${e.name}`;
    if (e.isDirectory()) _js(root, r, out, depth + 1); else if (/\.(c|m)?js$/.test(e.name) && !/\.test\.|registry-components/.test(e.name)) out.push(r);
  }
  return out;
}

// 0.60.231 — the systems are Idearium's list (his "15 systems … all the systems in idearium"); the kernel has none of its own
function missing({ root = ROOT } = {}) {
  const SB = require('./system-boundary.js');
  return SB.realSystems().map(x => x.folder).filter(f => f !== SB.KERNEL && fs.existsSync(path.join(root, f)) && !fs.existsSync(path.join(root, f, 'registry-components.js')));
}

function draft(system, { root = ROOT } = {}) {
  const said = [];
  const dir = path.join(root, system);
  if (!fs.existsSync(dir)) throw new Error(`no such system folder: ${system}`);
  let contract = null; try { contract = JSON.parse(fs.readFileSync(path.join(dir, 'interaction-contract.json'), 'utf8')); } catch (_) { said.push('no interaction-contract.json: no routes declared yet'); }
  let pkg = null; try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch (_) {}
  const components = ((contract && contract.routes) || []).map((r) => {
    const id = `${String(r.method).toLowerCase()}${String(r.path).replace(/\/:([\w]+)/g, '.$1').replace(/[^\w.]+/g, '.').replace(/\.+/g, '.').replace(/\.$/, '')}`;
    return { id: `${system}.${id.replace(/^\./, '')}`, route: { method: r.method, path: r.path }, from: `interaction-contract.json${r.server ? ` (served by ${r.server})` : ''}` };
  });
  const emits = new Set(), handles = new Set();
  const esc = system.replace(/[-]/g, '\\-');
  const EMIT = new RegExp(`\\.emit\\(\\s*['"\`](${esc}\\.[\\w.:-]+)['"\`]`, 'g'), ON = /\.on\(\s*['"`]([a-z][\w-]*\.[\w.:-]+)['"`]/g;
  for (const f of _js(root, system)) {
    let t; try { t = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { continue; }
    for (const m of t.matchAll(EMIT)) emits.add(m[1]);
    for (const m of t.matchAll(ON)) handles.add(m[1]);
  }
  // the system's own event taxonomy is the one truth for its names (ET1, lib/event-taxonomy-pattern.js): pointed at, never copied
  let taxonomy = {};
  if (fs.existsSync(path.join(dir, 'event-taxonomy.js'))) { try { taxonomy = { taxonomy: `${system}/event-taxonomy.js`, declared: Object.keys(require(path.join(dir, 'event-taxonomy.js'))).length }; } catch (e) { said.push(`event-taxonomy.js did not load: ${e.message.split('\n')[0]}`); } }
  const SB = require('./system-boundary.js');
  const scan = SB.scan({ root });
  const inn = scan.crossings.filter(c => c.toSystem === system && c.kind !== 'kernel' && c.kind !== 'language');
  const reached = new Map();
  for (const c of inn) { if (!reached.has(c.to)) reached.set(c.to, new Set()); reached.get(c.to).add(c.fromSystem); }
  const sov = (SB.sovereignty({ root, system }).systems || [])[0] || null;
  if (!components.length && reached.size) said.push(`${reached.size} file(s) other systems require, and no route: each is a capability that needs a route (DB6) before ${system} is sovereign`);
  return {
    systemId: system, draft: true, version: '0.1.0-draft', drafted: { by: MODULE_ID, version: VERSION },
    port: contract && contract.ports ? Object.values(contract.ports)[0] || null : null,
    label: system.toUpperCase(), purpose: (contract && contract.role) || (pkg && pkg.description) || null,
    components, events: { ...taxonomy, emits: [...emits].sort(), handles: [...handles].sort() },
    reached_into: [...reached].map(([file, from]) => ({ file, by: [...from].sort() })).sort((a, b) => b.by.length - a.by.length || a.file.localeCompare(b.file)),
    sovereignty: sov ? { sovereign: sov.sovereign, out: sov.out, in: sov.in, blockers: sov.blockers, list: sov.list || null } : null,
    said,
  };
}

// a draft is data: JSON works in every package (siso is ESM; a CommonJS draft broke there). Accepting it writes the system's own
// registry-components.js in that system's module format.
function text(d) {
  return JSON.stringify({ $comment: `DRAFT (DB16) of ${d.systemId}'s registry, generated by lib/registry-draft.js ${VERSION} from the tree; his to accept. Map: docs/2026-10-17-system-drawbridge-phasemap.spec DB16. James, 2026-10-24: "then we need to resume the component registery for each system, get the mall sovereign, then cos phases to migrate." Accepted by turning it into ${d.systemId}/registry-components.js and adding '${d.systemId}' to loom/scanners/capability-map.js SYSTEMS; until then nothing reads it. Regenerate: node lib/registry-draft.js ${d.systemId} --write`, ...d }, null, 2) + '\n';
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const which = args.includes('--missing') ? missing() : args.filter(a => !a.startsWith('--'));
  for (const s of which) {
    const d = draft(s);
    if (args.includes('--write')) fs.writeFileSync(path.join(ROOT, s, 'registry-components.draft.json'), text(d));
    console.log(`${s.padEnd(15)} ${String(d.components.length).padStart(3)} routes · ${d.events.taxonomy ? `${String(d.events.declared).padStart(3)} in its taxonomy · ` : ''}${String(d.events.emits.length).padStart(3)} emits · ${String(d.events.handles.length).padStart(3)} handles · ${String(d.reached_into.length).padStart(3)} files reached into · out ${d.sovereignty ? d.sovereignty.out : '?'}${args.includes('--write') ? '  → written' : ''}`);
  }
}

module.exports = { MODULE_ID, VERSION, NOT_SYSTEMS, missing, draft, text };
