'use strict';
/**
 * lib/automation/scripts.js — his own scripts as steps: a .js, .mjs, .cjs or .ts file in the engine's scripts folder, run in its own process
 * (PA1, 0.60.408). comp_id: nexus.lib.automation.scripts
 * Spec: docs/automation-pipelines.spec MOD-AUTOMATE-SCRIPT · Map: docs/2026-10-29-pipelines-phasemap.spec PA1
 *
 * James, 2026-11-05: "i want it like automate. like i want the pipeline editor that uses the steps, with gates in between, maybe add conditions
 * for detection of elements, scripts and type scripts".
 *
 *   dir(ns)                         → the folder his scripts live in (the engine's own data, beside its workflows; §5.9)
 *   list(dir)                       → [{ name, file, kind: 'js'|'ts', bytes, description }]   description = the file's first comment line
 *   resolve(dir, name)              → the file, or throws when the name leaves the folder or is not there
 *   run(dir, name, { input, timeoutMs }) → { output, stdout, stderr, code, ms }
 *
 * The contract a script keeps: it reads its input as JSON from the NEXUS_STEP_INPUT environment variable (and on stdin), prints its answer
 * on stdout; the last line that parses as JSON is the output, else the whole stdout as text. A non-zero exit is a failed step, with its code
 * and the end of its stderr (§1.2). TypeScript runs through tsx (the same runner ErosmancerOS uses).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const KINDS = { '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.ts': 'ts', '.mts': 'ts' };
const ROOT = path.join(__dirname, '..', '..');

function dir(dataRoot, ns) { return path.join(dataRoot, ns, 'automation-scripts'); }

function _describe(file) {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 2000).split('\n');
    for (const l of head) { const m = /^\s*(?:\/\/|\*|\/\*\*?)\s*(.+?)\s*(?:\*\/)?$/.exec(l); if (m && m[1] && !/^['"]use strict/.test(m[1]) && m[1] !== '*') return m[1].slice(0, 200); if (l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l)) break; }
  } catch (_) {}
  return '';
}

function list(d) {
  let names = []; try { names = fs.readdirSync(d); } catch (_) { return []; }
  return names.filter(n => KINDS[path.extname(n).toLowerCase()]).sort().map(n => {
    const f = path.join(d, n); let bytes = 0; try { bytes = fs.statSync(f).size; } catch (_) {}
    return { name: n, file: f, kind: KINDS[path.extname(n).toLowerCase()], bytes, description: _describe(f) };
  });
}

function resolve(d, name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('the script step names no script');
  const f = path.resolve(d, n);
  if (!f.startsWith(path.resolve(d) + path.sep)) throw new Error(`"${n}" is outside your scripts folder (${d})`);
  if (!KINDS[path.extname(f).toLowerCase()]) throw new Error(`"${n}" is not a script (.js, .mjs, .cjs, .ts)`);
  if (!fs.existsSync(f)) throw new Error(`no script "${n}" in ${d}`);
  return f;
}

function _tsx() {
  const bin = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return fs.existsSync(bin) ? bin : null;
}

function _parseOut(stdout) {
  const lines = String(stdout).trim().split('\n').map(s => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch (_) {} }
  return String(stdout).trim();
}

function run(d, name, { input = {}, timeoutMs = 60000 } = {}) {
  const file = resolve(d, name);
  const kind = KINDS[path.extname(file).toLowerCase()];
  let args;
  if (kind === 'ts') { const t = _tsx(); if (!t) return Promise.reject(new Error('TypeScript scripts need tsx (npm install in the Nexus folder)')); args = [t, file]; }
  else args = [file];
  const json = JSON.stringify(input == null ? {} : input);
  const ms = Math.min(Math.max(parseInt(timeoutMs, 10) || 60000, 1000), 3600000);
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, args, { cwd: d, env: { ...process.env, NEXUS_STEP_INPUT: json, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', done = false;
    const to = setTimeout(() => { if (done) return; done = true; try { child.kill(); } catch (_) {} rej(new Error(`${path.basename(file)} took longer than ${Math.round(ms / 1000)} s and was stopped`)); }, ms);
    child.stdout.on('data', c => { if (stdout.length < 4e6) stdout += c; });
    child.stderr.on('data', c => { if (stderr.length < 2e5) stderr += c; });
    child.on('error', e => { if (done) return; done = true; clearTimeout(to); rej(e); });
    child.on('close', (code) => {
      if (done) return; done = true; clearTimeout(to);
      if (code !== 0) return rej(new Error(`${path.basename(file)} exited with ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 400) || 'no error text'}`));
      res({ output: _parseOut(stdout), stdout, stderr, code, ms: Date.now() - t0 });
    });
    try { child.stdin.end(json); } catch (_) {}
  });
}

module.exports = { dir, list, resolve, run, KINDS };
