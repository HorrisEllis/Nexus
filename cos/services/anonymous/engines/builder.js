'use strict';
// [NEXUS-COMPONENT-ID]
const COMPONENT_ID   = 'b8e2f47a';
const COMPONENT_UUID = 'b8e2f47a-3c91-5d06-a4f2-7e1b93c0d582';
const COMPONENT_NAME = 'builder';
// [/NEXUS-COMPONENT-ID]
/**
 * engines/builder.js — drag-and-drop project deploy
 * anonymousservers.info
 *
 * Takes an uploaded archive, works out what the project is, and runs it
 * through install → build → deploy, streaming every line of output to the
 * panel as it happens.
 *
 * Two things this deliberately does not do:
 *
 *   It never runs a build automatically. Extracting an archive is safe;
 *   running `npm install` from it executes arbitrary postinstall scripts as
 *   whatever account the platform runs under. Detection and confirmation are
 *   separate steps, and the confirm step is the human deciding to trust the
 *   code. An auto-build on upload would be a remote code execution path with
 *   a drag-and-drop interface on it.
 *
 *   It never shells out through a shell string. Commands are tokenised and
 *   spawned with an argv array, so a project directory named `; rm -rf` is
 *   just an awkward directory name rather than an injection.
 *
 * conf/builder.conf:
 *   uploadDir       where archives land            (default 'state/builder/uploads')
 *   workDir         where projects are extracted   (default 'state/builder/work')
 *   maxUploadBytes  refuse archives above this     (default 268435456 = 256 MB)
 *   buildTimeoutMs  kill a build that overruns     (default 600000 = 10 min)
 *   portMin/portMax auto-assigned app port range   (default 3001-3100)
 */

const fs   = require('fs');
const path = require('path');
const net  = require('net');
const cp   = require('child_process');
const crypto = require('crypto');

const { ipc, conf, log, isInit, NAME } = require('./_engine');
const { detect, findProjectRoot } = require('./components/detect-stack');
const unzip = require('./components/unzip');

const ROOT = process.env.NEXUS_ROOT || path.join(__dirname, '..');

const DEFAULTS = {
  uploadDir:      'state/builder/uploads',
  workDir:        'state/builder/work',
  sitesDir:       'sites',
  maxUploadBytes: 268435456,
  buildTimeoutMs: 600000,
  portMin:        3001,
  portMax:        3100,
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('builder: wrote default conf');
  process.exit(0);
}

const cfg = conf.load(DEFAULTS);
const IS_WIN = process.platform === 'win32';

const abs = p => path.isAbsolute(p) ? p : path.join(ROOT, p);
for (const d of [cfg.uploadDir, cfg.workDir]) {
  try { fs.mkdirSync(abs(d), { recursive: true }); } catch (e) {
    log(`builder: cannot create ${d} — ${e.message}`, 'ERROR');
  }
}

// ─── build registry ───────────────────────────────────────────────────────────
// Every build keeps its own log buffer so the panel can attach at any point,
// including after a page reload mid-build.

const builds = new Map();   // buildId -> record

function newBuild(fields) {
  const id = 'b' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const rec = {
    id, state: 'pending', createdAt: Date.now(),
    lines: [], exitCode: null, error: null, proc: null,
    ...fields,
  };
  builds.set(id, rec);
  return rec;
}

function emit(rec, line, stream = 'out') {
  const entry = { ts: Date.now(), stream, text: String(line).replace(/\r?\n$/, '') };
  rec.lines.push(entry);
  if (rec.lines.length > 5000) rec.lines.splice(0, rec.lines.length - 5000);
  // Unaddressed: the kernel fans this out, so any attached panel sees it.
  ipc.send('builder:output', { buildId: rec.id, ...entry });
}

function setState(rec, state, extra = {}) {
  rec.state = state;
  Object.assign(rec, extra);
  ipc.send('builder:state', {
    buildId: rec.id, state, stack: rec.stack, domain: rec.domain,
    exitCode: rec.exitCode, error: rec.error,
  });
}

// ─── port assignment ──────────────────────────────────────────────────────────

function portFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function assignPort() {
  const taken = new Set([...builds.values()].map(b => b.port).filter(Boolean));
  for (let p = cfg.portMin; p <= cfg.portMax; p++) {
    if (taken.has(p)) continue;
    if (await portFree(p)) return p;
  }
  throw new Error(`no free port in ${cfg.portMin}-${cfg.portMax}`);
}

// ─── command execution ────────────────────────────────────────────────────────

/**
 * Split a command string into argv. Handles quoted segments; deliberately
 * does NOT understand shell metacharacters, because we never invoke a shell.
 */
function tokenise(command) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/**
 * Run one command in cwd, streaming output into the build record.
 * @returns {Promise<number>} exit code
 */
function runStep(rec, command, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const argv = tokenise(command);
    if (!argv.length) return resolve(0);

    let bin = argv[0];
    // On Windows npm/yarn/pnpm/composer are .cmd shims, which CreateProcess
    // will not execute directly. Resolve to the shim explicitly rather than
    // reaching for shell:true, which would reintroduce the injection surface.
    if (IS_WIN && /^(npm|npx|yarn|pnpm|composer)$/.test(bin)) bin = bin + '.cmd';

    emit(rec, `$ ${command}`, 'cmd');

    let child;
    try {
      child = cp.spawn(bin, argv.slice(1), {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      return reject(new Error(`cannot start '${bin}': ${e.message}`));
    }

    rec.proc = child;

    const timer = setTimeout(() => {
      emit(rec, `build step exceeded ${cfg.buildTimeoutMs}ms — terminating`, 'err');
      try { child.kill('SIGKILL'); } catch {}
    }, cfg.buildTimeoutMs);

    const feed = (buf, stream) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (line.trim()) emit(rec, line, stream);
      }
    };
    child.stdout.on('data', b => feed(b, 'out'));
    child.stderr.on('data', b => feed(b, 'err'));

    child.on('error', e => {
      clearTimeout(timer);
      rec.proc = null;
      // ENOENT here means the toolchain isn't installed. Say which one.
      if (e.code === 'ENOENT') {
        reject(new Error(`'${argv[0]}' is not installed or not on PATH`));
      } else {
        reject(e);
      }
    });

    child.on('close', code => {
      clearTimeout(timer);
      rec.proc = null;
      resolve(code == null ? 1 : code);
    });
  });
}

// ─── stage 1: analyse ─────────────────────────────────────────────────────────

async function analyse(payload) {
  const { archivePath, filename } = payload;
  const src = path.isAbsolute(archivePath) ? archivePath : path.join(abs(cfg.uploadDir), archivePath);

  const rec = newBuild({ filename: filename || path.basename(src), archivePath: src });
  setState(rec, 'extracting');

  const dest = path.join(abs(cfg.workDir), rec.id);
  fs.mkdirSync(dest, { recursive: true });

  emit(rec, `extracting ${path.basename(src)}`);
  const result = await unzip.extract(src, dest, { maxBytes: cfg.maxUploadBytes });
  emit(rec, `extracted ${result.files} file(s), ${(result.bytes / 1048576).toFixed(1)} MB`);

  const projectRoot = findProjectRoot(dest);
  if (projectRoot !== dest) {
    emit(rec, `project root is ${path.relative(dest, projectRoot)}/ inside the archive`);
  }
  rec.projectRoot = projectRoot;

  const d = detect(projectRoot);
  rec.stack = d.stack;
  rec.detection = d;

  emit(rec, `detected: ${d.label} (${d.confidence} confidence)`);
  for (const s of d.signals) emit(rec, `  signal: ${s}`);
  for (const n of d.notes || []) emit(rec, `  note: ${n}`);

  if (d.needsPort) {
    try {
      rec.port = await assignPort();
      emit(rec, `assigned port ${rec.port}`);
    } catch (e) {
      emit(rec, e.message, 'err');
    }
  }

  setState(rec, 'awaiting-confirmation');
  return {
    buildId: rec.id,
    detection: d,
    port: rec.port || null,
    projectRoot: path.relative(ROOT, projectRoot),
  };
}

// ─── stage 2: build + deploy ──────────────────────────────────────────────────

async function build(payload) {
  const rec = builds.get(payload.buildId);
  if (!rec) throw new Error(`unknown build '${payload.buildId}'`);
  if (rec.state === 'building') throw new Error('this build is already running');

  // The panel may override any detected field; the human's choice wins.
  const plan = {
    install:  payload.install  !== undefined ? payload.install  : rec.detection.install,
    build:    payload.build    !== undefined ? payload.build    : rec.detection.build,
    start:    payload.start    !== undefined ? payload.start    : rec.detection.start,
    serveDir: payload.serveDir !== undefined ? payload.serveDir : rec.detection.serveDir,
    domain:   String(payload.domain || '').trim(),
    port:     payload.port || rec.port || null,
    env:      payload.env || {},
  };
  if (!plan.domain) throw new Error('a domain is required to deploy');

  rec.domain = plan.domain;
  rec.plan   = plan;
  setState(rec, 'building');

  try {
    if (plan.install) {
      emit(rec, '--- installing dependencies ---');
      const code = await runStep(rec, plan.install, rec.projectRoot, plan.env);
      if (code !== 0) throw new Error(`install failed with exit code ${code}`);
    }

    if (plan.build) {
      emit(rec, '--- building ---');
      const env = { ...plan.env };
      if (plan.port) env.PORT = String(plan.port);
      const code = await runStep(rec, plan.build, rec.projectRoot, env);
      if (code !== 0) throw new Error(`build failed with exit code ${code}`);
    }

    setState(rec, 'deploying');
    await deploy(rec, plan);

    setState(rec, 'live', { exitCode: 0 });
    emit(rec, `--- ${plan.domain} is live ---`);
    return { buildId: rec.id, state: 'live', domain: plan.domain, port: plan.port };

  } catch (e) {
    setState(rec, 'failed', { error: e.message });
    emit(rec, e.message, 'err');
    throw e;
  }
}

/** Copy build output into the site tree and provision the vhost. */
async function deploy(rec, plan) {
  const siteDir = path.join(abs(cfg.sitesDir), plan.domain, 'public');
  const from    = plan.serveDir && plan.serveDir !== '.'
    ? path.join(rec.projectRoot, plan.serveDir)
    : rec.projectRoot;

  const d = rec.detection;

  if (d.runtime === 'static' || d.runtime === 'static-build' || d.php) {
    if (!fs.existsSync(from)) {
      throw new Error(`build output directory '${plan.serveDir}' does not exist — `
                    + `check the build command actually produced it`);
    }
    emit(rec, `copying ${path.relative(rec.projectRoot, from) || '.'} to sites/${plan.domain}/public`);
    fs.mkdirSync(siteDir, { recursive: true });
    const copied = copyTree(from, siteDir);
    emit(rec, `copied ${copied} file(s)`);
  } else {
    // A long-running app is served from where it was built; the web server
    // proxies to it rather than serving files.
    emit(rec, `${d.label} runs as a process — the web server will proxy to :${plan.port}`);
  }

  const vhost = {
    hostname:  plan.domain,
    stack:     d.stack,
    php:       Boolean(d.php),
    root:      (d.runtime === 'node' || d.runtime === 'python') ? rec.projectRoot : siteDir,
    proxyPort: plan.port || null,
    index:     d.php ? ['index.php', 'index.html'] : ['index.html', 'index.htm'],
    listing:   false,
    builtBy:   rec.id,
    startCommand: plan.start || null,
  };

  emit(rec, 'registering vhost');
  ipc.send('route', { type: 'webserver:vhost:add', vhost }, 'webserver');

  emit(rec, 'adding DNS record');
  ipc.send('route', { type: 'zone:update', name: labelFor(plan.domain), type_: 'A', value: '@', ttl: 300 }, 'dns');

  emit(rec, 'requesting TLS certificate');
  ipc.send('route', { type: 'tls:issue', domain: plan.domain }, 'tls');

  if (plan.port) {
    emit(rec, `adding proxy route for :${plan.port}`);
    ipc.send('route', {
      type: 'proxy:vhost:add', hostname: plan.domain, target: `http://127.0.0.1:${plan.port}`,
    }, 'proxy');
  }

  await ipc.db.insert('builder_deploys', {
    buildId: rec.id, domain: plan.domain, stack: d.stack,
    port: plan.port || null, ts: Date.now(),
  }).catch(() => {});
}

function labelFor(domain) {
  const base = cfg.domain || 'anonymousservers.info';
  return domain.endsWith('.' + base) ? domain.slice(0, -(base.length + 1)) : '@';
}

/** Recursive copy. Skips the dependency directories nobody wants shipped. */
const SKIP = new Set(['node_modules', '.git', '.github', 'vendor', '__pycache__', '.venv', 'venv']);
function copyTree(from, to, count = { n: 0 }) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(from, e.name);
    const t = path.join(to, e.name);
    if (e.isDirectory()) copyTree(s, t, count);
    else if (e.isFile()) { fs.copyFileSync(s, t); count.n++; }
  }
  return count.n;
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipc.on('builder:analyse', async payload => {
  try {
    ipc.send('builder:analyse:reply', { requestId: payload?.requestId, ...(await analyse(payload)) });
  } catch (e) {
    ipc.send('builder:analyse:reply', { requestId: payload?.requestId, error: e.message });
  }
});

ipc.on('builder:build', async payload => {
  const requestId = payload?.requestId;
  // Reply immediately — a build takes minutes, far longer than any request
  // timeout. The panel follows progress via builder:output / builder:state.
  try {
    const rec = builds.get(payload.buildId);
    if (!rec) throw new Error(`unknown build '${payload.buildId}'`);
    ipc.send('builder:build:reply', { requestId, buildId: rec.id, started: true });
    build(payload).catch(() => { /* state already recorded on the record */ });
  } catch (e) {
    ipc.send('builder:build:reply', { requestId, error: e.message });
  }
});

ipc.on('builder:status', payload => {
  const rec = builds.get(payload?.buildId);
  if (!rec) {
    ipc.send('builder:status:reply', { requestId: payload?.requestId, error: 'unknown build' });
    return;
  }
  const since = Number(payload?.since || 0);
  ipc.send('builder:status:reply', {
    requestId: payload?.requestId,
    buildId: rec.id, state: rec.state, stack: rec.stack, domain: rec.domain,
    port: rec.port || null, error: rec.error, detection: rec.detection,
    lines: rec.lines.slice(since),
    total: rec.lines.length,
  });
});

ipc.on('builder:list', async payload => {
  ipc.send('builder:list:reply', {
    requestId: payload?.requestId,
    builds: [...builds.values()].map(b => ({
      id: b.id, state: b.state, stack: b.stack, domain: b.domain,
      filename: b.filename, createdAt: b.createdAt, error: b.error,
    })).sort((a, b) => b.createdAt - a.createdAt),
  });
});

ipc.on('builder:cancel', payload => {
  const rec = builds.get(payload?.buildId);
  if (rec?.proc) {
    try { rec.proc.kill('SIGKILL'); } catch {}
    setState(rec, 'cancelled');
    emit(rec, 'build cancelled', 'err');
  }
  ipc.send('builder:cancel:reply', { requestId: payload?.requestId, ok: Boolean(rec) });
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', {
    requestId: payload?.requestId, engine: NAME, alive: true,
    builds: builds.size, ts: Date.now(),
  });
});

log(`builder engine ready — ports ${cfg.portMin}-${cfg.portMax}`);
