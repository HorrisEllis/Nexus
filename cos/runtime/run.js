'use strict';
/**
 * cos/runtime/run.js — COS's JS runtime: run node code from a branch or a
 * workspace with dependency resolution, isolation and port shifting, without
 * installing anything.
 * UUID: cos-runtime-run-v1-0000-2026-0926-001
 * Status: pre-release
 *
 * §0.39.261 — James: "i want the run button in cos to work fully, preferably in
 * js, invent anything needed."
 *
 * runNode()      one node process: NODE_PATH + ESM hook resolve bare packages
 *                from Nexus's root node_modules (COS_PACKAGES_ROOT); the
 *                preload shifts listen() ports and enforces network isolation;
 *                clean env; every data store pointed inside the run dir; a
 *                timeout and an output cap. TypeScript runs through Node's own
 *                type stripping when this Node has it.
 * syntaxCheck()  parse every JS file in one child, execute none.
 * resolveDeps()  what every require/import in a tree resolves to: the repo,
 *                Nexus's packages, a Node builtin — or nothing.
 * bootProbe()    start a server entry, wait for it to listen (on its shifted
 *                port), probe /health, stop it.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { builtinModules } = require('module');

const NEXUS_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGES_ROOT = process.env.COS_PACKAGES_ROOT || NEXUS_ROOT;
const PRELOAD = path.join(__dirname, 'preload.cjs');
const REGISTER = path.join(__dirname, 'register.mjs');
const CLEAN_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG', 'ComSpec', 'APPDATA', 'LOCALAPPDATA'];
// every store override lib/test-sandbox.js knows — a run never writes a real store
const STORE_KEYS = ['IDEARIUM_DATA_DIR', 'JAA_DATA_DIR', 'COS_DATA_ROOT', 'NEXUS_INJECT_DIR', 'NEXUS_DATA_ROOT', 'COPILOT_INJECTION_DIR', 'NEXUS_SELF_DIR'];

const JS_EXT = new Set(['.js', '.cjs', '.mjs']);
const TS_EXT = new Set(['.ts', '.mts', '.cts']);

let _tsFlag;
/** the flag that makes this Node run .ts, or null — probed once, never assumed */
function tsFlag() {
  if (_tsFlag !== undefined) return _tsFlag;
  _tsFlag = null;
  if (process.features && process.features.typescript) { _tsFlag = ''; return _tsFlag; }
  try { execFileSync(process.execPath, ['--experimental-strip-types', '-e', 'let x: number = 1'], { stdio: 'ignore', timeout: 10000 }); _tsFlag = '--experimental-strip-types'; } catch (_) {}
  return _tsFlag;
}

function capabilities() {
  const has = (bin) => { try { execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 5000 }); return true; } catch (_) { return false; } };
  const ts = tsFlag();
  return {
    node: { ok: true, version: process.version },
    esmResolveHook: { ok: typeof require('module').register === 'function', reason: typeof require('module').register === 'function' ? 'module.register available' : 'Node < 20.6 — ESM bare imports resolve only from the repo itself' },
    typescript: { ok: ts !== null, reason: ts === null ? 'this Node cannot strip types (needs 22.6+)' : (ts ? `via ${ts}` : 'native') },
    packagesRoot: PACKAGES_ROOT,
    packages: _rootPackages(),
    // §0.39.265 — found the way cos/testenv/installer.js finds them (python3 also as python / py -3; on Windows
    // also where a fresh install put them), so an install from the Run menu is seen without a restart
    external: (() => { const I = require('../testenv/installer.js'); const f = (t) => { try { return I.find(t).found; } catch (_) { return false; } }; return { python3: f('python3'), ruby: f('ruby'), php: f('php') }; })(),
  };
}

function _rootPackages() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGES_ROOT, 'package.json'), 'utf8'));
    return Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).sort();
  } catch (_) { return []; }
}

/** runEnv({ runDir, extra, isolate, shiftPorts, mapFile }) — the child's whole environment. */
function runEnv({ runDir, extra = {}, isolate = true, shiftPorts = false, mapFile = null } = {}) {
  const env = Object.fromEntries(CLEAN_KEYS.filter(k => process.env[k] != null).map(k => [k, process.env[k]]));
  const data = path.join(runDir, '.cos-run-data');
  for (const k of STORE_KEYS) env[k] = path.join(data, k.toLowerCase());
  env.NODE_PATH = path.join(PACKAGES_ROOT, 'node_modules');
  env.COS_PACKAGES_ROOT = PACKAGES_ROOT;
  env.NEXUS_SANDBOX = '1';
  env.NEXUS_TEST_SANDBOX = data;           // any Nexus code that checks for a sandbox sees one
  if (isolate) env.COS_NET_ISOLATED = '1';
  if (shiftPorts) env.COS_PORT_SHIFT = '1';
  if (mapFile) env.COS_PORT_MAP_FILE = mapFile;
  return { ...env, ...extra };
}

function nodeArgsFor(file) {
  const args = ['--require', PRELOAD];
  if (typeof require('module').register === 'function') args.push('--import', require('url').pathToFileURL(REGISTER).href);
  if (TS_EXT.has(path.extname(file))) {
    const f = tsFlag();
    if (f === null) return { error: `cannot run ${path.basename(file)}: this Node (${process.version}) has no TypeScript type stripping — Node 22.6+ runs .ts natively` };
    if (f) args.push(f);
  }
  return { args };
}

/**
 * runNode({ cwd, file, args, timeoutMs, maxOutputBytes, isolate, shiftPorts, env, onLine, keepAlive })
 * -> Promise<{ file, exitCode, signal, durationMs, stdout, stderr, killedByTimeout, killedByOutputLimit, passed, portMap, refused }>
 * keepAlive(child, api) — optional: called with the live child for probe-style runs; resolve by killing it.
 */
function runNode({ cwd, file, args = [], timeoutMs = 30000, maxOutputBytes = 1048576, isolate = true, shiftPorts = false, env = {}, onLine = null, onSpawn = null } = {}) {
  return new Promise((resolve) => {
    const abs = path.resolve(cwd, file);
    if (!fs.existsSync(abs)) return resolve({ file, passed: false, exitCode: null, error: `not found: ${file}`, stdout: '', stderr: '', durationMs: 0 });
    const na = nodeArgsFor(abs);
    if (na.error) return resolve({ file, passed: false, exitCode: null, error: na.error, stdout: '', stderr: '', durationMs: 0 });
    const mapFile = path.join(cwd, `.cos-portmap-${process.pid}-${Date.now()}.jsonl`);
    const childEnv = runEnv({ runDir: cwd, extra: env, isolate, shiftPorts, mapFile });
    const started = Date.now();
    let stdout = '', stderr = '', bytes = 0, killedByTimeout = false, killedByOutputLimit = false, done = false;
    const child = spawn(process.execPath, [...na.args, abs, ...args], { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { killedByTimeout = true; child.kill('SIGTERM'); setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 2000); }, timeoutMs);
    const take = (stream) => (chunk) => {
      const s = chunk.toString();
      bytes += chunk.length;
      if (stream === 'out') stdout += s; else stderr += s;
      if (onLine) for (const l of s.split('\n')) if (l) { try { onLine(l, stream); } catch (_) {} }
      if (bytes > maxOutputBytes && !killedByOutputLimit) { killedByOutputLimit = true; child.kill('SIGTERM'); }
    };
    child.stdout.on('data', take('out'));
    child.stderr.on('data', take('err'));
    const finish = (code, signal, error) => {
      if (done) return; done = true;
      clearTimeout(timer);
      const pm = readPortMap(mapFile);
      try { fs.rmSync(mapFile, { force: true }); } catch (_) {}
      resolve({
        file, exitCode: code, signal: signal || null, error: error || undefined,
        durationMs: Date.now() - started, stdout: stdout.slice(-20000), stderr: stderr.slice(-20000),
        killedByTimeout, killedByOutputLimit,
        passed: code === 0 && !killedByTimeout && !killedByOutputLimit,
        portMap: pm.ports, refused: pm.refused,
      });
    };
    child.on('error', (e) => finish(null, null, e.message));
    child.on('exit', (code, signal) => finish(code, signal));
    if (onSpawn) onSpawn(child, { mapFile });
  });
}

function readPortMap(mapFile) {
  const ports = [], refused = [];
  let lines = [];
  try { lines = fs.readFileSync(mapFile, 'utf8').trim().split('\n').filter(Boolean); } catch (_) {}
  for (const l of lines) {
    try { const o = JSON.parse(l); if (o.requested) ports.push({ requested: o.requested, actual: o.actual }); else if (o.refused) refused.push(o.refused); } catch (_) {}
  }
  return { ports, refused: [...new Set(refused)] };
}

function _walk(root, rel = '', out = [], depth = 0) {
  if (depth > 12 || out.length > 20000) return out;
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data' || e.name.startsWith('.cos-') || e.name === '.nex') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) _walk(root, r, out, depth + 1); else if (e.isFile()) out.push(r);
  }
  return out;
}

/** syntaxCheck(dir, { files }) — parse every JS file (or the given ones), run none. */
function syntaxCheck(dir, { files = null, timeoutMs = 120000 } = {}) {
  const list = (files || _walk(dir).filter(f => JS_EXT.has(path.extname(f)))).map(f => path.join(dir, f));
  return new Promise((resolve) => {
    if (!list.length) return resolve({ checked: 0, failed: 0, results: [], note: 'no JavaScript files' });
    const child = spawn(process.execPath, ['--experimental-vm-modules', '--no-warnings', path.join(__dirname, 'syntax-check.cjs')], { stdio: ['pipe', 'pipe', 'pipe'], env: runEnv({ runDir: os.tmpdir() }) });
    let out = '', err = '';
    const t = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { err += c; });
    child.on('exit', () => {
      clearTimeout(t);
      try {
        const r = JSON.parse(out);
        for (const x of r.results) x.file = path.relative(dir, x.file).replace(/\\/g, '/');
        resolve(r);
      } catch (_) { resolve({ checked: 0, failed: list.length, error: `syntax checker failed: ${err.slice(0, 500)}`, results: [] }); }
    });
    child.stdin.end(JSON.stringify(list));
  });
}

const RX_REQ = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const RX_IMP = /(?:^|[\s;])(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
const RX_DYN = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** _stripComments(src) — block comments, and line comments (whole-line or
 *  trailing) outside string literals, so a word like "import" in a comment is
 *  never read as an import. Template literals are blanked for the same reason. */
function _stripComments(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``');
  return src.split('\n').map((line) => {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

/**
 * _stripTextStrings(src) — §0.39.355 PB4. A quoted string is kept only when it is require()'s, import()'s or an
 * import/export … from's own argument; every other string is emptied. A test's fixture project written as text
 * ("const k = require('./kernel')") is not an import of the test — 67 of the Nexus tree's 71 "broken imports" were.
 * Run after _stripComments (template literals are already emptied there).
 */
function _stripTextStrings(src) {
  return src.split('\n').map((line) => {
    let out = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c !== '"' && c !== "'") { out += c; continue; }
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      const before = out.replace(/\s+$/, '');
      const isArg = /(?:\brequire|\bimport)\s*\($/.test(before) || /(?:^|[\s;}])(?:from|import)$/.test(before);
      out += isArg ? line.slice(i, j + 1) : c + c;
      i = j;
    }
    return out;
  }).join('\n');
}

/** pkgName('@scope/x/sub') -> '@scope/x'; 'lodash/fp' -> 'lodash' */
function pkgName(spec) { const p = spec.split('/'); return spec.startsWith('@') ? p.slice(0, 2).join('/') : p[0]; }

/**
 * resolveDeps(dir) — every bare specifier the tree imports, and where it
 * resolves: builtin | repo (its own node_modules) | nexus (root packages) |
 * missing. Relative imports are checked too (a missing sibling file is as
 * fatal at run time as a missing package).
 */
function resolveDeps(dir, { files: only = null } = {}) {
  // §0.39.355 PB5 — an archived file is kept for history and never loaded: its imports are not checked
  const files = (only || _walk(dir)).filter(f => (JS_EXT.has(path.extname(f)) || TS_EXT.has(path.extname(f))) && !/(^|\/)_archive\//.test(f));
  const bare = new Map();         // name -> { name, via, files:Set }
  const brokenRelative = [];
  const builtins = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);
  for (const f of files) {
    let src; try { src = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_) { continue; }
    src = _stripTextStrings(_stripComments(src));   // §0.39.355 PB4
    const specs = new Set();
    for (const rx of [RX_REQ, RX_IMP, RX_DYN]) { rx.lastIndex = 0; let m; while ((m = rx.exec(src))) specs.add(m[1]); }
    for (const s of specs) {
      // a specifier built at run time (`./${name}.js`) or text that only looks
      // like one is not an import this reader can check — skipped, not reported
      if (!s || /[\s$`{}]/.test(s)) continue;
      if (s.startsWith('.') || s.startsWith('/')) {
        const base = path.resolve(dir, path.dirname(f), s);
        const hit = ['', '.js', '.cjs', '.mjs', '.json', '.ts', '/index.js', '/index.cjs', '/index.mjs'].some(x => fs.existsSync(base + x) && fs.statSync(base + x).isFile());
        if (!hit) brokenRelative.push({ file: f, specifier: s });
        continue;
      }
      if (/^[a-z]+:/i.test(s) && !s.startsWith('node:')) continue;          // data:, http:
      const name = s.startsWith('node:') ? s : pkgName(s);
      if (!bare.has(name)) bare.set(name, { name, files: new Set() });
      bare.get(name).files.add(f);
    }
  }
  const out = [];
  for (const b of bare.values()) {
    let via = 'missing';
    if (builtins.has(b.name)) via = 'builtin';
    else if (fs.existsSync(path.join(dir, 'node_modules', b.name, 'package.json'))) via = 'repo';
    else if (fs.existsSync(path.join(PACKAGES_ROOT, 'node_modules', b.name, 'package.json'))) via = 'nexus';
    out.push({ name: b.name, via, files: [...b.files].slice(0, 20), usedBy: b.files.size });
  }
  out.sort((a, b) => (a.via === b.via ? a.name.localeCompare(b.name) : a.via === 'missing' ? -1 : 1));
  const count = (v) => out.filter(x => x.via === v).length;
  return {
    files: files.length, packages: out,
    summary: { builtin: count('builtin'), repo: count('repo'), nexus: count('nexus'), missing: count('missing'), brokenRelative: brokenRelative.length },
    brokenRelative: brokenRelative.slice(0, 200),
    runnable: count('missing') === 0 && brokenRelative.length === 0,
  };
}

/**
 * bootProbe({ cwd, file, expectPort, healthPath, bootTimeoutMs, settleMs })
 * Start a server, wait for it to listen (port-shifted), GET its health path,
 * stop it. passed = health answered 2xx. A process that exits first fails
 * with its output.
 */
function bootProbe({ cwd, file, expectPort = null, healthPath = '/health', bootTimeoutMs = 45000, isolate = true, env = {} } = {}) {
  let probe = null;
  const started = Date.now();
  return runNode({
    cwd, file, timeoutMs: bootTimeoutMs + 5000, isolate, shiftPorts: true, env,
    onSpawn: (child, { mapFile }) => {
      probe = (async () => {
        while (Date.now() - started < bootTimeoutMs && child.exitCode === null) {
          await new Promise(r => setTimeout(r, 400));
          const { ports } = readPortMap(mapFile);
          const target = (expectPort && ports.find(p => p.requested === expectPort)) || (!expectPort && ports[0]) || null;
          if (!target) continue;
          try {
            const ctl = new AbortController();
            const tt = setTimeout(() => ctl.abort(), 5000);
            const r = await fetch(`http://127.0.0.1:${target.actual}${healthPath}`, { signal: ctl.signal });
            clearTimeout(tt);
            const text = await r.text();
            let body = null; try { body = JSON.parse(text); } catch (_) { body = text.slice(0, 500); }
            return { ok: r.ok, status: r.status, port: target, body, afterMs: Date.now() - started };
          } catch (e) { /* not answering yet */ }
        }
        return { ok: false, error: child.exitCode !== null ? `exited (code ${child.exitCode}) before answering ${healthPath}` : `no answer on ${healthPath} within ${bootTimeoutMs}ms${expectPort ? ` (expected a listen on :${expectPort})` : ''}` };
      })();
      probe.then(() => { try { child.kill('SIGTERM'); } catch (_) {} setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 3000); });
    },
  }).then(async (r) => {
    const health = probe ? await probe : { ok: false, error: 'never spawned' };
    return { ...r, health, passed: !!health.ok, killedByTimeout: r.killedByTimeout && !health.ok };
  });
}

// nodeArgsFor exported 0.39.271 (lib/cos-run.js test.suite: `node --test` gets the same preload)
module.exports = { capabilities, runNode, runEnv, nodeArgsFor, syntaxCheck, resolveDeps, bootProbe, readPortMap, tsFlag, PACKAGES_ROOT, NEXUS_ROOT, JS_EXT, TS_EXT };
