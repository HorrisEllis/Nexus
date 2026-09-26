'use strict';
/**
 * clear-glass/src/eros/supervisor.js — ErosmancerOS runs with Clear Glass.
 * comp_id: nexus.clear-glass.eros.supervisor
 * §0.39.264 — James: "hook it in to run with clearglass" / "just need
 * erosmanceros to start with clearglass".
 *
 * Before this, Clear Glass registered ErosmancerOS with the orchestrator and
 * called its /api/connect, but nothing ever STARTED it — every boot logged
 * "connect ECONNREFUSED 127.0.0.1:7432" and the Settings page stayed
 * "disconnected". Now Clear Glass owns its lifetime:
 *
 *   start()   if something already answers on EROS_PORT, it is used as is
 *             (a hand-started ErosmancerOS keeps working). Otherwise
 *             erosmancer/erosmancer-os/src/api/server.ts is started with tsx
 *             (a root devDependency through the erosmancer-os workspace — no
 *             build step), and start() resolves once /api/health answers.
 *   crash     restarted with backoff (1s, 2s, 4s … 30s); five crashes inside
 *             two minutes stop the restarts and say why (§1.2), instead of a
 *             restart loop.
 *   stop()    on Clear Glass quit: the child is killed, so no orphan keeps
 *             the port.
 *
 * Node: NEXUS_NODE, else `node` on PATH, else Electron itself with
 * ELECTRON_RUN_AS_NODE=1 (Electron can run plain Node scripts). Its data goes
 * to <Nexus>/data/erosmancer (DATA_DIR). Output lines are prefixed [eros].
 *
 * status() -> { state, pid, port, cdpPort, connected, restarts, lastExit, lastError, external, log }
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const NEXUS_ROOT = path.resolve(__dirname, '..', '..', '..');
const EROS_DIR = path.join(NEXUS_ROOT, 'erosmancer', 'erosmancer-os');
const SERVER_TS = path.join(EROS_DIR, 'src', 'api', 'server.ts');

function _health(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', c => { d += c; }); res.on('end', () => { let body = null; try { body = JSON.parse(d); } catch (_) {} resolve({ up: true, status: res.statusCode, body }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ up: false }); });
    req.on('error', () => resolve({ up: false }));
  });
}

function _postJson(port, p, body, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'POST', timeout: timeoutMs, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let d = ''; res.on('data', c => { d += c; }); res.on('end', () => { let b = null; try { b = JSON.parse(d); } catch (_) {} resolve({ ok: res.statusCode < 400 && !(b && b.ok === false), status: res.statusCode, body: b }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end(data);
  });
}

function _tsxCli(root = NEXUS_ROOT) {
  for (const base of [root, EROS_DIR]) {
    try { return require.resolve('tsx/cli', { paths: [base] }); } catch (_) {}
    const p = path.join(base, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function _nodeBin(env = process.env) {
  if (env.NEXUS_NODE) return { bin: env.NEXUS_NODE, env: {} };
  const probe = spawnSync(process.platform === 'win32' ? 'node.exe' : 'node', ['--version'], { stdio: 'ignore', windowsHide: true, timeout: 5000 });
  if (probe.status === 0) return { bin: process.platform === 'win32' ? 'node.exe' : 'node', env: {} };
  // Electron's own binary runs as plain Node with this set
  return { bin: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } };
}

class ErosSupervisor {
  constructor({ port = 7432, cdpPort = 9333, dataDir = path.join(NEXUS_ROOT, 'data', 'erosmancer'), log = console.log,
                autoConnect = true, _spawn = spawn, _health: healthFn = _health, _post = _postJson, _tsx = _tsxCli, _node = _nodeBin, readyTimeoutMs = 45000 } = {}) {
    Object.assign(this, { port, cdpPort, dataDir, autoConnect, _log: log, _spawn, _healthFn: healthFn, _post, _tsx, _node, readyTimeoutMs });
    this.connected = null;
    this.child = null; this.state = 'stopped'; this.restarts = 0; this.crashes = []; this.lastExit = null; this.lastError = null;
    this.external = false; this.stopping = false; this.lines = []; this._timer = null;
  }

  _say(msg) { this.lines.push(`${new Date().toISOString()} ${msg}`); if (this.lines.length > 200) this.lines.shift(); this._log(`[ClearGlass/Eros] ${msg}`); }

  status() {
    return { state: this.state, pid: this.child ? this.child.pid : null, port: this.port, cdpPort: this.cdpPort, connected: this.connected, restarts: this.restarts,
             lastExit: this.lastExit, lastError: this.lastError, external: this.external, server: path.relative(NEXUS_ROOT, SERVER_TS).split(path.sep).join('/'), log: this.lines.slice(-40) };
  }

  async start() {
    this.stopping = false;
    const pre = await this._healthFn(this.port);
    if (pre.up) {
      this.external = true; this.state = 'running'; this._say(`already answering on :${this.port} — using it (not started by Clear Glass)`);
      if (this.autoConnect && !(pre.body && pre.body.ok)) await this.connect();
      return this.status();
    }
    this.external = false;
    return this._spawnOnce();
  }

  async _spawnOnce() {
    if (!fs.existsSync(SERVER_TS)) { this.state = 'failed'; this.lastError = `ErosmancerOS is not in this tree: ${SERVER_TS}`; this._say(this.lastError); return this.status(); }
    const tsx = this._tsx();
    if (!tsx) { this.state = 'failed'; this.lastError = 'tsx is not installed — run `npm install` in the Nexus folder (erosmancer-os is a workspace; tsx comes with it)'; this._say(this.lastError); return this.status(); }
    const node = this._node();
    try { fs.mkdirSync(this.dataDir, { recursive: true }); } catch (_) {}
    this.state = 'starting';
    const child = this._spawn(node.bin, [tsx, SERVER_TS], {
      cwd: EROS_DIR, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { EROS_LOG_LEVEL: 'info', ...process.env, ...node.env, PORT: String(this.port), DATA_DIR: this.dataDir, EROS_CDP_PORT: String(this.cdpPort) },
    });
    this.child = child;
    this._say(`started ErosmancerOS (pid ${child.pid || '?'}) on :${this.port} — ${path.basename(node.bin)} + tsx`);
    const pipe = (stream, isErr) => { if (!stream || !stream.on) return; let buf = ''; stream.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trimEnd(); buf = buf.slice(i + 1); if (l) { this.lines.push(l); if (this.lines.length > 200) this.lines.shift(); this._log(`[eros]${isErr ? ' !' : ''} ${l}`); } } }); };
    pipe(child.stdout, false); pipe(child.stderr, true);
    child.on('error', (e) => { this.lastError = e.message; this._say(`could not start: ${e.message}`); });
    child.on('exit', (code, signal) => this._onExit(child, code, signal));

    const deadline = Date.now() + this.readyTimeoutMs;
    while (Date.now() < deadline && this.child === child && this.state === 'starting') {
      if ((await this._healthFn(this.port, 1000)).up) { this.state = 'running'; this._say(`ready on :${this.port}`); if (this.autoConnect) await this.connect(); break; }
      await new Promise(r => setTimeout(r, 500));
    }
    if (this.state === 'starting') { this.lastError = `did not answer /api/health within ${Math.round(this.readyTimeoutMs / 1000)}s`; this._say(this.lastError); }
    return this.status();
  }

  /** point ErosmancerOS at Clear Glass's own DevTools port (retried: CDP may open a moment after boot) */
  async connect({ tries = 5 } = {}) {
    for (let i = 0; i < tries; i++) {
      const r = await this._post(this.port, '/api/connect', { target: { type: 'local', port: this.cdpPort, host: '127.0.0.1' } });
      if (r.ok) { this.connected = { at: Date.now(), cdpPort: this.cdpPort }; this._say(`connected to Clear Glass's DevTools port :${this.cdpPort}`); return true; }
      this.lastError = `connect to DevTools :${this.cdpPort} failed: ${(r.body && r.body.error) || r.error || r.status}`;
      await new Promise(res => setTimeout(res, 1000 * (i + 1)));
    }
    this.connected = null; this._say(this.lastError);
    return false;
  }

  _onExit(child, code, signal) {
    if (this.child !== child) return;
    this.child = null; this.lastExit = { code, signal, at: Date.now() };
    if (this.stopping) { this.state = 'stopped'; return; }
    const now = Date.now();
    this.crashes = this.crashes.filter(t => now - t < 120000).concat(now);
    if (this.crashes.length >= 5) { this.state = 'failed'; this.lastError = `ErosmancerOS exited 5 times in 2 minutes (last: ${signal || `code ${code}`}) — not restarting; see the [eros] lines above`; this._say(this.lastError); return; }
    const delay = Math.min(30000, 1000 * 2 ** (this.crashes.length - 1));
    this.state = 'restarting'; this.restarts++;
    this._say(`exited (${signal || `code ${code}`}) — restarting in ${delay / 1000}s`);
    this._timer = setTimeout(() => { this._timer = null; if (!this.stopping) this._spawnOnce(); }, delay);
    if (this._timer.unref) this._timer.unref();
  }

  stop() {
    this.stopping = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.child) {
      const pid = this.child.pid;
      // tsx runs the server in a child of its own: on Windows kill the whole tree, or the port stays taken
      if (process.platform === 'win32' && pid) { try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (_) {} }
      try { this.child.kill(); } catch (_) {}
      this._say('stopped with Clear Glass');
    }
    this.state = 'stopped';
    return this.status();
  }
}

module.exports = { ErosSupervisor, SERVER_TS, NEXUS_ROOT, _tsxCli, _health, _postJson };
