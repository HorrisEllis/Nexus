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
const ROOT = path.join(__dirname, '..');

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
];
const ENTRY = { cortex: 'cortex/boot.js', idearium: 'idearium/api/index.js', ollama: 'ollama/server.js',
  'clear-glass': 'clear-glass/src/main/index.js' };
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

function build() {
  const reg = require('../lib/system-registry.js');
  const list = reg.list(); const arr = Array.isArray(list) ? list : (list.systems || Object.values(list));
  const scanned = scan(); const out = {};
  for (const s of SYSTEMS) {
    const r = arr.find(x => x.name === s.reg) || {};
    const sc = scanned[s.id];
    const entry = ENTRY[s.id] || `${s.dir}/server.js`;
    const owned = [s.dir + '/'];
    if (r.dataDir && r.dataDir !== `${s.dir}/data`) owned.push(r.dataDir + '/');
    out[s.id] = {
      schema: 'nexus.compartment/1',
      id: `nexus.${s.id}`, name: s.id, label: s.label, dir: s.dir,
      repo: { kind: 'virtual', id: `repo.nexus.${s.id}`, scope: owned,
              versionLine: r.version || null, versionNote: r.version ? 'from lib/version.js modules' : 'no per-system version registered yet' },
      cos: { compartmentId: `cos.nexus.${s.id}`, axioms: [] },
      runtime: { entry, entryExists: fs.existsSync(path.join(ROOT, entry)), port: r.port ?? null, phase: r.phase ?? null,
                 critical: !!r.critical, optional: !!r.optional, healthUrl: r.healthUrl || null },
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
