#!/usr/bin/env node
'use strict';
/**
 * cli/compartments.js — every Nexus system as a repo compartment (virtual repos).
 *
 *   node cli/compartments.js list
 *   node cli/compartments.js sync [--write]   regenerate <dir>/compartment.json (dry-run unless --write)
 *   node cli/compartments.js check            manifests present + current; reports boundary findings
 *
 * A compartment manifest is DERIVED, never hand-authored facts:
 *   - runtime facts (port/phase/version/dataDir) come from lib/system-registry.js (autopilot + diagnostic + version.js)
 *   - dependsOn / boundary findings come from scanning static require()/import edges between system dirs
 * Limits (stated, not hidden): only static relative require/import edges are seen. path.join(ROOT,'<sys>',..)
 * style reach-across and HTTP calls are NOT counted. Systems list is SYSTEMS below - add a row to add a system.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

// dir = folder in repo, reg = name in lib/system-registry.js, entry = autopilot's real entry file
const SYSTEMS = [
  { id: 'intelligence', dir: 'intelligence', reg: 'intelligence',  label: 'Intelligence' },
  { id: 'versionium',   dir: 'versionium',   reg: 'versionium',    label: 'Versionium' },
  { id: 'loom',         dir: 'loom',         reg: 'loom',          label: 'Loom' },
  { id: 'guardian',     dir: 'guardian',     reg: 'guardian',      label: 'Guardian' },
  { id: 'ollama',       dir: 'ollama',       reg: 'ollama-bridge', label: 'Ollama' },
  { id: 'cortex',       dir: 'cortex',       reg: 'cortex',        label: 'Cortex' },
  { id: 'clear-glass',  dir: 'clear-glass',  reg: 'clear-glass',   label: 'ClearGlass' },
  { id: 'copilot',      dir: 'copilot',      reg: 'copilot',       label: 'Copilot' },
  { id: 'idearium',     dir: 'idearium',     reg: 'idearium',      label: 'Idearium' },
  // 0.60.326 MG15a — the three autopilot boots that had no compartment.json (MG-002: every system declares itself)
  { id: 'orchestrator', dir: 'orchestrator', reg: 'orchestrator',  label: 'Orchestrator' },
  { id: 'architect',    dir: 'architect',    reg: 'architect',     label: 'Architect' },
  { id: 'diagnostic',   dir: 'diagnostic',   reg: 'diagnostic',    label: 'Diagnostic' },
];
const ENTRY = { cortex: 'cortex/boot.js', idearium: 'idearium/api/index.js', ollama: 'ollama/server.js',
  'clear-glass': 'clear-glass/src/main/index.js', orchestrator: 'orchestrator/orchestrator.js', architect: 'architect/service.js',
  diagnostic: 'diagnostic/nexus-diagnostic.js' };

// 0.60.326 MG15a — a process as COS's supervisor will start it, from autopilot's kernel, with nothing of this machine in it: a path under the
// repository is written {{root}}/<rel>; Electron is written as autopilot finds it (Clear Glass's own node_modules, then the hoisted one).
const PROCESS_FIELDS = ['cmd', 'args', 'cwd', 'env', 'phase', 'critical', 'optional', 'onDemand', 'healthUrl', 'maxOldSpaceMB', 'minRestartDelay', 'haltPctOverride', 'idleTimeoutMs'];
function _portable(v) {
  if (typeof v === 'string') { const rel = path.relative(ROOT, v); return path.isAbsolute(v) && !rel.startsWith('..') ? `{{root}}/${rel.split(path.sep).join('/')}` : v; }
  if (Array.isArray(v)) return v.map(_portable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, _portable(x)]));
  return v;
}
function processOf(k) {
  const out = { name: k.name };
  for (const f of PROCESS_FIELDS) if (k[f] !== undefined && k[f] !== null && !(f === 'env' && !Object.keys(k[f]).length)) out[f] = _portable(k[f]);
  if (/(^|[\\/])electron(\.cmd)?$/i.test(String(k.cmd))) {
    out.cmd = 'electron';
    out.cmdCandidates = ['{{root}}/clear-glass/node_modules/.bin/electron', '{{root}}/node_modules/.bin/electron'];   // .cmd added on Windows
  }
  return out;
}
/** the system a kernel belongs to: the one whose folder holds its entry (its first arg, or its cwd) */
function systemOfKernel(k) {
  const first = String((k.cwd || (k.args || [])[0] || '')).replace(/\\/g, '/').split('/')[0];
  return SYSTEMS.find(s => s.dir === first) ? first : null;
}
const SKIP = new Set(['node_modules', '.git', 'data', '_archive', 'dist', 'build']);
const EXT = /\.(js|mjs|cjs)$/;

function walk(dir, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (EXT.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}
const REQ = /(?:require\(\s*|from\s+|import\(\s*)['"](\.{1,2}\/[^'"]*)['"]/g;

function scan() {
  const byDir = new Map(SYSTEMS.map(s => [s.dir, s]));
  const res = {};
  for (const s of SYSTEMS) {
    const files = walk(path.join(ROOT, s.dir), []);
    let lines = 0; const deps = {}; let sharedLib = 0; const findings = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8'); lines += src.split('\n').length;
      let m; REQ.lastIndex = 0;
      while ((m = REQ.exec(src))) {
        const abs = path.resolve(path.dirname(f), m[1]);
        const rel = path.relative(ROOT, abs).split(path.sep);
        if (rel[0].startsWith('..')) continue;
        if (rel[0] === 'lib') { sharedLib++; continue; }
        if (rel[0] !== s.dir && byDir.has(rel[0])) {
          deps[rel[0]] = (deps[rel[0]] || 0) + 1;
          if (findings.length < 200) findings.push(`${path.relative(ROOT, f)} -> ${rel.slice(0, 3).join('/')}`);
        }
      }
    }
    res[s.id] = { files: files.length, lines, deps, sharedLib, findings };
  }
  return res;
}

let KERNELS = [];
function build() {
  const reg = require('../system-registry.js');
  KERNELS = reg.kernels();
  const list = reg.list(); const arr = Array.isArray(list) ? list : (list.systems || Object.values(list));
  const scanned = scan(); const out = {};
  for (const s of SYSTEMS) {
    const r = arr.find(x => x.name === s.reg) || {};
    const sc = scanned[s.id];
    const entry = ENTRY[s.id] || `${s.dir}/server.js`;
    const owned = [s.dir + '/'];
    if (r.dataDir && r.dataDir !== `${s.dir}/data`) owned.push(r.dataDir + '/');
    let own = {}; try { own = JSON.parse(fs.readFileSync(path.join(ROOT, s.dir, 'compartment.json'), 'utf8')); } catch (_) {}
    const declared = own.runtime && own.runtime.process ? own.runtime : null;   // 0.60.331 MG17b — read before a generated file is regenerated
    if (own.schema === 'nexus.compartment/1') own = {};   // a generated file is regenerated whole; another shape keeps its fields (§0.3)
    out[s.id] = {
      ...own,
      schema: 'nexus.compartment/1',
      id: `nexus.${s.id}`, name: s.id, label: s.label, dir: s.dir,
      repo: { kind: 'virtual', id: `repo.nexus.${s.id}`, scope: owned,
              versionLine: r.version || null, versionNote: r.version ? 'from lib/version.js modules' : 'no per-system version registered yet' },
      cos: { compartmentId: `cos.nexus.${s.id}`, axioms: [] },
      runtime: { entry, entryExists: fs.existsSync(path.join(ROOT, entry)), port: r.port ?? null, phase: r.phase ?? null,
                 critical: !!r.critical, optional: !!r.optional, healthUrl: r.healthUrl || null,
                 // 0.60.326 MG15a — the whole process (and any second one this system runs), as COS's supervisor will start it
                 // 0.60.331 MG17b — since the handover the file is its system's own: a declared process is kept as written; only a
                 // system with none gets one generated from the kernel list (which now reads these same files)
                 ...(declared ? { process: declared.process, ...(declared.processes ? { processes: declared.processes } : {}) } : (() => { const mine = KERNELS.filter(k => systemOfKernel(k) === s.dir);
                   const main = mine.find(k => k.name === s.reg) || mine[0];
                   const rest = mine.filter(k => k !== main);
                   return { ...(main ? { process: processOf(main) } : {}), ...(rest.length ? { processes: rest.map(processOf) } : {}) }; })()) },
      data: { dataDir: r.dataDir || null, ledgerDir: `${s.dir}/data/ledger`, nodeIndexDir: `${s.dir}/data/node-index` },
      spec: fs.existsSync(path.join(ROOT, s.dir, 'spec')) ? `${s.dir}/spec/` : null,
      dependsOn: sc.deps, sharedLibRequires: sc.sharedLib,
      stats: { jsFiles: sc.files, jsLines: sc.lines },
      boundaryFindings: { count: Object.values(sc.deps).reduce((a, b) => a + b, 0), sample: sc.findings.slice(0, 10) },
    };
  }
  return out;
}
const canon = o => JSON.stringify(o, null, 2) + '\n';

/** declarations(root) — 0.60.326 MG15a: every process the systems declare in their own compartment.json, {{root}} filled in */
function declarations(root = ROOT) {
  const fill = (v) => (typeof v === 'string' ? v.replace(/\{\{root\}\}/g, root) : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
  const out = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || SKIP.has(d.name)) continue;
    let c; try { c = JSON.parse(fs.readFileSync(path.join(root, d.name, 'compartment.json'), 'utf8')); } catch (_) { continue; }
    const rt = c.runtime || {};
    for (const p of [rt.process, ...(rt.processes || [])].filter(Boolean)) out.push({ system: c.name || d.name, ...fill(p) });
  }
  return out;
}

module.exports = { SYSTEMS, build, processOf, systemOfKernel, declarations, canon };
if (require.main !== module) return;
const cmd = process.argv[2] || 'list';
const M = build();
if (cmd === 'list') {
  for (const s of SYSTEMS) { const m = M[s.id];
    console.log(`${s.id.padEnd(12)} v${String(m.repo.versionLine).padEnd(6)} port ${String(m.runtime.port).padEnd(5)} ${String(m.stats.jsFiles).padStart(4)} files ${String(m.stats.jsLines).padStart(7)} lines  cross-system edges: ${m.boundaryFindings.count}  -> ${Object.keys(m.dependsOn).join(',') || '-'}`); }
} else if (cmd === 'sync') {
  const write = process.argv.includes('--write');
  for (const s of SYSTEMS) { const p = path.join(ROOT, s.dir, 'compartment.json');
    if (write) { fs.writeFileSync(p, canon(M[s.id])); console.log('wrote', path.relative(ROOT, p)); }
    else console.log((fs.existsSync(p) ? 'would update ' : 'would create '), path.relative(ROOT, p)); }
} else if (cmd === 'check') {
  let bad = 0;
  for (const s of SYSTEMS) { const p = path.join(ROOT, s.dir, 'compartment.json');
    if (!fs.existsSync(p)) { console.log('MISSING', s.id); bad++; continue; }
    if (fs.readFileSync(p, 'utf8') !== canon(M[s.id])) { console.log('STALE  ', s.id, '(run sync --write)'); bad++; }
    if (!M[s.id].runtime.entryExists) { console.log('NO ENTRY', s.id, M[s.id].runtime.entry); bad++; } }
  const total = SYSTEMS.reduce((a, s) => a + M[s.id].boundaryFindings.count, 0);
  console.log(`boundary findings (cross-system static requires, informational): ${total}`);
  console.log(bad ? `FAIL ${bad}` : 'OK'); process.exit(bad ? 1 : 0);
} else { console.log('usage: compartments.js list|sync [--write]|check'); process.exit(2); }
