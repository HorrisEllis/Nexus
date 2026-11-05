'use strict';
/**
 * clear-glass/src/eros/edit.js — edit ErosmancerOS's TypeScript yourself: export a copy, change it, import it back (ES5).
 * Map: docs/2026-11-05-cleardriver-mutators-and-erosmancer-surface-phasemap.spec ES5_edit_the_typescript_yourself.
 *
 * James, 2026-11-05: "can you make a way to import type scripts so i can edit it myself, and import the changes."
 *
 *   npm run eros:edit -- export [folder]          copy erosmancer-os/src/**.ts to folder (default <home>/erosmancer-edit) + a manifest
 *   npm run eros:edit -- diff   [folder]          what changed: changed / added / missing, lines + and −; changes nothing
 *   npm run eros:edit -- import [folder] [--yes] [--force] [--no-tests]
 *                                                  dry run without --yes; with it: old files archived, new written, the module's own
 *                                                  test run, restored if it fails; recorded in Versionium
 *
 *   exportTo(dir) · diff(dir) · importFrom(dir, { apply, force, runTests, by }) — each → a plain result, also printed by the CLI
 * Nothing is lost: the files replaced go to _archive/erosmancer-edits/<stamp>/ first, and a file deleted in the folder is never deleted here.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const NEXUS = path.join(__dirname, '..', '..', '..');
const EROS = path.join(NEXUS, 'clear-glass', 'erosmancer', 'erosmancer-os');
const MANIFEST = '.erosmancer-edit.json';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rel = (p) => p.split(path.sep).join('/');

function _walk(dir, base = dir, out = []) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) _walk(p, base, out); else if (e.name.endsWith('.ts')) out.push(rel(path.relative(base, p)));
  }
  return out.sort();
}
const defaultDir = () => path.join(os.homedir(), 'erosmancer-edit');

function exportTo(dir = defaultDir(), { eros = EROS } = {}) {
  const src = path.join(eros, 'src');
  const files = _walk(src);
  const manifest = { from: rel(path.relative(NEXUS, src)) || 'src', at: new Date().toISOString(), files: {} };
  for (const f of files) {
    const b = fs.readFileSync(path.join(src, f));
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), b);
    manifest.files[f] = sha(b);
  }
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return { ok: true, dir, files: files.length };
}

function _lines(a, b) {   // lines added and removed, counted as a multiset difference (enough to say how much changed)
  const count = (t) => { const m = new Map(); for (const l of String(t).split('\n')) m.set(l, (m.get(l) || 0) + 1); return m; };
  const A = count(a), B = count(b); let added = 0, removed = 0;
  for (const [l, n] of B) added += Math.max(0, n - (A.get(l) || 0));
  for (const [l, n] of A) removed += Math.max(0, n - (B.get(l) || 0));
  return { added, removed };
}

function diff(dir = defaultDir(), { eros = EROS } = {}) {
  const src = path.join(eros, 'src');
  let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')); } catch (_) {}
  if (!manifest) return { ok: false, error: `no export in ${dir} (run export first: it writes ${MANIFEST})` };
  const mine = _walk(dir), live = new Set(_walk(src));
  const changed = [], added = [], missing = [], conflicts = [];
  for (const f of mine) {
    const b = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!live.has(f)) { added.push({ file: f, ..._lines('', b) }); continue; }
    const cur = fs.readFileSync(path.join(src, f), 'utf8');
    if (sha(Buffer.from(b)) === sha(Buffer.from(cur))) continue;
    if (manifest.files[f] && manifest.files[f] !== sha(Buffer.from(cur))) conflicts.push(f);   // Nexus's copy moved since the export
    changed.push({ file: f, ..._lines(cur, b) });
  }
  for (const f of Object.keys(manifest.files)) if (!fs.existsSync(path.join(dir, f))) missing.push(f);
  return { ok: true, dir, changed, added, missing, conflicts };
}

// TypeScript's own parser: a file whose syntax does not parse is refused (types are not checked here; the module's own test is the proof)
function syntaxErrors(file, text) {
  let ts = null; try { ts = require('typescript'); } catch (_) { return null; }
  const out = ts.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  return (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).map(d => {
    const at = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    return `${file}${at ? `:${at.line + 1}:${at.character + 1}` : ''} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });
}

function _defaultTestRunner(eros) {
  return (module) => {
    const t = path.join(eros, 'tests', `${module}.test.ts`);
    if (!fs.existsSync(t)) return { ran: false, why: `no tests/${module}.test.ts` };
    const tsx = path.join(NEXUS, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    if (!fs.existsSync(tsx)) return { ran: false, why: 'tsx is not installed (npm install in the Nexus folder)' };
    const r = require('child_process').spawnSync(tsx, [t], { cwd: eros, encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32' });
    const outText = `${r.stdout || ''}${r.stderr || ''}`;
    if (/could not be found, and is needed by esbuild/.test(outText)) return { ran: false, why: 'tsx could not start on this machine (esbuild\'s binary is missing)' };
    return { ran: true, ok: r.status === 0, tail: outText.trim().split('\n').slice(-6).join('\n') };
  };
}

async function importFrom(dir = defaultDir(), { apply = false, force = false, runTests = true, by = 'james', eros = EROS, testRunner = null, recorder = null, now = new Date(), archiveRoot = path.join(NEXUS, '_archive') } = {}) {
  const src = path.join(eros, 'src');
  const d = diff(dir, { eros });
  if (!d.ok) return d;
  const todo = [...d.changed, ...d.added].map(x => x.file);
  const refused = [];
  for (const f of todo) {
    if (!f.endsWith('.ts') || f.split('/').includes('..')) refused.push({ file: f, why: 'only .ts files under src/ are imported' });
    const errs = syntaxErrors(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    if (errs === null) refused.push({ file: f, why: 'TypeScript is not installed here, so its syntax cannot be checked (npm install)' });
    else if (errs.length) refused.push({ file: f, why: 'its syntax does not parse', errors: errs.slice(0, 5) });
  }
  if (d.conflicts.length && !force) for (const f of d.conflicts) refused.push({ file: f, why: 'changed in Nexus since your export: export again and redo the edit, or import with --force' });
  const plan = { changed: d.changed, added: d.added, missing: d.missing, kept: d.missing.length ? 'a file you deleted is never deleted here: it stays in Nexus' : undefined };
  if (refused.length) return { ok: false, applied: false, refused, ...plan };
  if (!todo.length) return { ok: true, applied: false, nothing: 'nothing changed', ...plan };
  if (!apply) return { ok: true, applied: false, dryRun: 'run again with --yes to import', ...plan };

  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const archive = path.join(archiveRoot, 'erosmancer-edits', stamp);
  const before = {}, after = {};
  for (const f of todo) {
    const live = path.join(src, f);
    if (fs.existsSync(live)) { const b = fs.readFileSync(live); before[f] = b; fs.mkdirSync(path.dirname(path.join(archive, f)), { recursive: true }); fs.writeFileSync(path.join(archive, f), b); }
  }
  for (const f of todo) { const b = fs.readFileSync(path.join(dir, f)); after[f] = b; fs.mkdirSync(path.dirname(path.join(src, f)), { recursive: true }); fs.writeFileSync(path.join(src, f), b); }
  fs.writeFileSync(path.join(archive, 'README.md'), `# ErosmancerOS edit imported ${now.toISOString()} by ${by}\nThe files here are the versions replaced. To undo, copy them back into clear-glass/erosmancer/erosmancer-os/src/.\nChanged: ${todo.join(', ')}\n`);

  const tests = [];
  if (runTests) {
    const run = testRunner || _defaultTestRunner(eros);
    for (const m of [...new Set(todo.map(f => f.split('/')[0]))]) tests.push({ module: m, ...run(m) });
    if (tests.some(t => t.ran && !t.ok)) {
      for (const f of todo) { if (before[f]) fs.writeFileSync(path.join(src, f), before[f]); else { try { fs.unlinkSync(path.join(src, f)); } catch (_) {} } }
      return { ok: false, applied: false, restored: true, why: 'a module\'s own test failed after the import, so the old files are back', tests, archive: rel(archive), ...plan };
    }
  }

  const blobs = new Map(); for (const [f, b] of Object.entries(before)) blobs.set(sha(b), b); for (const [f, b] of Object.entries(after)) blobs.set(sha(b), b);
  const items = todo.map(f => ({ path: `clear-glass/erosmancer/erosmancer-os/src/${f}`, before: before[f] ? sha(before[f]) : null, after: sha(after[f]) }));
  let recorded = null;
  try {
    const V = recorder || require('../../../lib/versionium-record.js');
    recorded = await V.record({ kind: 'clear-glass.erosmancer.edit', system: 'clear-glass', message: `ErosmancerOS edited by ${by}: ${todo.join(', ')}`, by, change: V.fullChange ? V.fullChange(items, { readBlob: (h) => blobs.get(h), where: 'this record' }) : items });
  } catch (e) { recorded = { ok: false, why: e.message }; }
  return { ok: true, applied: true, files: todo, archive: rel(archive), tests, recorded, restart: 'restart ErosmancerOS (or Clear Glass) to load the change', ...plan };
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const dir = rest.find(a => !a.startsWith('--')) || defaultDir();
  const flags = new Set(rest.filter(a => a.startsWith('--')));
  (async () => {
    let r;
    if (cmd === 'export') r = exportTo(dir);
    else if (cmd === 'diff') r = diff(dir);
    else if (cmd === 'import') r = await importFrom(dir, { apply: flags.has('--yes'), force: flags.has('--force'), runTests: !flags.has('--no-tests') });
    else { console.log('usage: npm run eros:edit -- <export|diff|import> [folder] [--yes] [--force] [--no-tests]\n  folder defaults to ' + defaultDir()); process.exit(2); }
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.ok ? 0 : 1;
  })();
}

module.exports = { exportTo, diff, importFrom, syntaxErrors, defaultDir, MANIFEST, MODULE_ID: 'clear-glass.eros.edit', VERSION: '1.0.0' };
