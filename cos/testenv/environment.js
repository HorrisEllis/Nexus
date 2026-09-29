'use strict';
/**
 * cos/testenv/environment.js — a repo's environment: is it downloaded, is it configured, what it still needs, and every
 * option it can be given. §0.39.280 BS4.
 * comp_id: nexus.cos.testenv.environment
 * UUID: nexus-cos-testenv-environment-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-build-surface-phasemap.spec (BS4).
 *
 * James: "it needs to run a check to make sure its downloaded and configured, it needs to make a envirement reletive
 * to the codebase, like install all the needed dependancies, have a full list of additional options for the
 * envirement."
 *
 * check(repoDir, { files, base })
 *   downloaded   every file the repo record lists is on disk (and, when a sha256 is given, byte-identical) — missing
 *                and different files are named
 *   configured   per stack detect.plan() found: its manifest, and whether its dependencies are installed HERE (node:
 *                every declared dependency has node_modules/<name>/package.json; python: a virtualenv; go: go.sum;
 *                rust: Cargo.lock). What cannot be known on this machine is said as unknown, never guessed as ok.
 *   plan         detect.plan(): stacks, install commands, test suite, runtimes, gaps
 *   vm           the base image's runtimes against what the plan needs; the extra package sets it would need
 *   ready        downloaded && configured && nothing missing from the VM
 * options()      the full catalogue: every environment option with its type, default, bounds and what it does.
 * normalize(o)   options as given → options as stored (unknown keys dropped and named, values bounded).
 * Reads files only; runs nothing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const detect = require('./detect.js');

const STACK_PACKAGES = { go: 'go', ruby: 'ruby', php: 'php', rust: 'rust' };   // stack → provision.js EXTRA_PACKAGES key

const OPTIONS = [
  { key: 'node',        type: 'enum',   default: 'lts', values: ['lts', '22', '20', '18', 'current'], group: 'runtimes', does: 'the Node.js the VM installs (nodesource)' },
  { key: 'python',      type: 'enum',   default: 'system', values: ['system', '3.12', '3.11', '3.10'], group: 'runtimes', does: 'the Python the repo runs on (system = the image\'s python3)' },
  { key: 'extras',      type: 'set',    default: [], values: ['go', 'ruby', 'php', 'rust', 'desktop'], group: 'packages', does: 'extra package sets baked into the VM image (cos/testenv/provision.js EXTRA_PACKAGES)' },
  { key: 'apt',         type: 'list',   default: [], group: 'packages', does: 'further Debian packages to install in the repo\'s VM (names only)' },
  { key: 'services',    type: 'set',    default: [], values: ['postgres', 'redis', 'mysql', 'mongodb', 'docker'], group: 'services', does: 'services started in the VM before the repo\'s commands' },
  { key: 'install',     type: 'enum',   default: 'auto', values: ['auto', 'skip', 'custom'], group: 'dependencies', does: 'auto = the install commands detect.plan() found; custom = installCommand' },
  { key: 'installCommand', type: 'string', default: '', group: 'dependencies', does: 'the install command when install is custom' },
  { key: 'installScripts', type: 'bool', default: false, group: 'dependencies', does: 'let package install scripts run (off: npm --ignore-scripts, no postinstall downloads)' },
  { key: 'network',     type: 'enum',   default: 'install-only', values: ['install-only', 'nat', 'none'], group: 'network', does: 'install-only: online while dependencies install, cable pulled for the tests' },
  { key: 'ramMB',       type: 'int',    default: 4096, min: 512, max: 65536, group: 'resources', does: 'VM memory' },
  { key: 'cpus',        type: 'int',    default: 2, min: 1, max: 32, group: 'resources', does: 'VM CPUs' },
  { key: 'diskGB',      type: 'int',    default: 20, min: 4, max: 512, group: 'resources', does: 'the repo\'s overlay disk ceiling' },
  { key: 'accelerator', type: 'enum',   default: 'auto', values: ['auto', 'kvm', 'whpx', 'hvf', 'tcg'], group: 'resources', does: 'auto picks per host; tcg = software (slow, always works)' },
  { key: 'env',         type: 'map',    default: {}, group: 'runtime', does: 'environment variables for every command in the VM (never secrets: they persist in the repo record)' },
  { key: 'ports',       type: 'list',   default: [], group: 'runtime', does: 'guest ports forwarded to 127.0.0.1 on the host (numbers)' },
  { key: 'testCommand', type: 'string', default: '', group: 'tests', does: 'overrides the suite detect.plan() found' },
  { key: 'testTimeoutS', type: 'int',   default: 600, min: 30, max: 7200, group: 'tests', does: 'the whole suite\'s time limit' },
  { key: 'desktop',     type: 'bool',   default: false, group: 'desktop', does: 'boot the VM into a desktop (xfce) the desktop viewer shows' },
];

function options() { return OPTIONS.map(o => ({ ...o })); }

function normalize(given = {}) {
  const out = {}, dropped = [];
  for (const [k, v] of Object.entries(given || {})) {
    const o = OPTIONS.find(x => x.key === k);
    if (!o) { dropped.push(k); continue; }
    if (o.type === 'int') { const n = Math.round(Number(v)); if (!Number.isFinite(n)) { dropped.push(k); continue; } out[k] = Math.min(o.max, Math.max(o.min, n)); }
    else if (o.type === 'bool') out[k] = v === true || v === 'true';
    else if (o.type === 'enum') { if (!o.values.includes(String(v))) { dropped.push(k); continue; } out[k] = String(v); }
    else if (o.type === 'set') out[k] = [...new Set((Array.isArray(v) ? v : [v]).map(String))].filter(x => o.values.includes(x));
    else if (o.type === 'list') out[k] = (Array.isArray(v) ? v : String(v).split(/[\s,]+/)).map(String).filter(Boolean).filter(x => k !== 'ports' || /^\d{1,5}$/.test(x)).slice(0, 100);
    else if (o.type === 'map') { if (!v || typeof v !== 'object' || Array.isArray(v)) { dropped.push(k); continue; } out[k] = Object.fromEntries(Object.entries(v).filter(([a]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(a)).map(([a, b]) => [a, String(b)])); }
    else out[k] = String(v).slice(0, 2000);
  }
  return { options: out, dropped };
}

const sha256 = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (_) { return null; } };
const exists = (p) => { try { return fs.existsSync(p); } catch (_) { return false; } };
const json = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };

function _downloaded(repoDir, files) {
  if (!Array.isArray(files)) return { ok: null, reason: 'no file list to check against' };
  const missing = [], different = [];
  for (const f of files) {
    const rel = typeof f === 'string' ? f : f && f.path;
    if (!rel) continue;
    const abs = path.join(repoDir, rel);
    if (!exists(abs)) { missing.push(rel); continue; }
    if (f && f.sha256 && sha256(abs) !== f.sha256) different.push(rel);
  }
  return { ok: missing.length === 0 && different.length === 0, files: files.length, missing: missing.slice(0, 50), missingCount: missing.length,
    different: different.slice(0, 50), differentCount: different.length };
}

function _configured(repoDir, pl) {
  const stacks = [];
  for (const s of pl.stacks) {
    const r = { stack: s.stack, evidence: s.evidence, installed: null, detail: '' };
    if (s.stack === 'node') {
      const pkg = json(path.join(repoDir, 'package.json')) || {};
      const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
      const missing = deps.filter(d => !exists(path.join(repoDir, 'node_modules', d, 'package.json')));
      r.installed = deps.length === 0 ? true : missing.length === 0;
      r.detail = deps.length === 0 ? 'no dependencies' : missing.length ? `${missing.length} of ${deps.length} dependencies not installed here: ${missing.slice(0, 8).join(', ')}` : `all ${deps.length} dependencies installed`;
      r.missing = missing.slice(0, 50);
    } else if (s.stack === 'python') {
      const venv = ['.venv', 'venv', 'env'].find(d => exists(path.join(repoDir, d, 'pyvenv.cfg')));
      r.installed = venv ? true : null;
      r.detail = venv ? `virtualenv ${venv}` : 'no virtualenv here — installed in the VM by the install step (unknown on this machine)';
    } else if (s.stack === 'go') {
      r.installed = exists(path.join(repoDir, 'go.sum')) ? null : false;
      r.detail = r.installed === false ? 'go.mod without go.sum — dependencies were never resolved' : 'go.sum present; modules download in the VM';
    } else if (s.stack === 'rust') {
      r.installed = exists(path.join(repoDir, 'Cargo.lock')) ? null : false;
      r.detail = r.installed === false ? 'no Cargo.lock — dependencies were never resolved' : 'Cargo.lock present; crates build in the VM';
    } else r.detail = 'installed in the VM by the install step (unknown on this machine)';
    stacks.push(r);
  }
  const bad = stacks.filter(s => s.installed === false);
  return { ok: stacks.length === 0 ? null : bad.length === 0, stacks, reason: stacks.length === 0 ? 'no stack detected (no package.json, pyproject, go.mod, Cargo.toml, Gemfile, composer.json, Makefile)' : null };
}

function _vm(pl, base) {
  const have = base && Array.isArray(base.runtimes) ? base.runtimes : null;
  const need = pl.runtimes || [];
  const missing = have ? need.filter(r => !have.includes(r) && !(r === 'python3' && have.includes('python'))) : [];
  const extras = [...new Set(pl.stacks.map(s => STACK_PACKAGES[s.stack]).filter(Boolean))];
  return { baseImage: base ? base.baseImage || null : null, available: base ? !!base.ok : null, reason: base ? base.reason || null : 'not asked',
    runtimes: have, needs: need, missing, extras };
}

/** check(repoDir, { files, base }) — base: cos/testenv capabilities().vm (optional; the caller asks) */
function check(repoDir, { files = null, base = null, options: given = {} } = {}) {
  if (!repoDir || !exists(repoDir)) return { ok: false, ready: false, error: `repo directory not on disk: ${repoDir || '(none)'}`, downloaded: { ok: false, reason: 'not downloaded' } };
  const pl = detect.plan(repoDir);
  const downloaded = _downloaded(repoDir, files);
  const configured = _configured(repoDir, pl);
  const vm = _vm(pl, base);
  const opts = normalize(given).options;
  const todo = [];
  if (downloaded.ok === false) todo.push(`${downloaded.missingCount + downloaded.differentCount} file(s) missing or different on disk`);
  for (const s of configured.stacks) if (s.installed === false) todo.push(`${s.stack}: ${s.detail}`);
  if (vm.available === false) todo.push(`VM: ${vm.reason}`);
  if (vm.missing.length) todo.push(`VM image lacks ${vm.missing.join(', ')} — set up with extras: ${vm.extras.join(', ') || '(none)'}`);
  const install = opts.install === 'skip' ? [] : opts.install === 'custom' && opts.installCommand ? [{ stack: 'custom', command: opts.installCommand, why: 'installCommand option' }] : pl.install;
  return {
    ok: true, ready: downloaded.ok !== false && configured.ok !== false && vm.available !== false && vm.missing.length === 0,
    checkedAt: Date.now(), repoDir, downloaded, configured, vm, todo,
    plan: { stacks: pl.stacks, install, suite: opts.testCommand ? [{ stack: 'custom', command: opts.testCommand, why: 'testCommand option' }] : pl.suite,
      testFiles: pl.files.length, runtimes: pl.runtimes, gaps: pl.gaps, describe: detect.describe(pl) },
  };
}

module.exports = { check, options, normalize, OPTIONS, STACK_PACKAGES };
