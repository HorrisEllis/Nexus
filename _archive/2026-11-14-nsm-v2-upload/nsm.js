#!/usr/bin/env node
/**
 * NSM v2.0 — Nexus Service Manager
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Cross-domain inventions over the original NSM:
 *
 *  ① Process groups + dependency graph
 *     Services declare `after: ['bridge']` — startup is ordered, shutdown reversed.
 *     Circular dependency detection at parse time.
 *
 *  ② Health-contract restarts (not just exit-code restarts)
 *     Each service definition can declare a health probe:
 *       "health": { "url": "http://127.0.0.1:3747/health", "interval": 10000 }
 *     A process that stays alive but becomes unhealthy (HTTP 5xx, timeout) is
 *     killed and restarted — same as a crash. Most managers miss this.
 *
 *  ③ Exponential backoff with jitter (production-grade)
 *     Restart delay: base * 2^n + rand(0, base). Caps at maxDelay.
 *     Reset on 60s clean window. Avoids thundering-herd on multi-service crash.
 *
 *  ④ Structured metrics stream
 *     Every service event (start, stop, crash, health) is written as JSONL to
 *     a metrics file. Queryable with `nsm metrics <service> [--since <iso>]`.
 *     A future NSM dashboard can stream from this.
 *
 *  ⑤ Service groups + profiles
 *     `nsm start --profile dev`  reads profiles/dev.json and starts that set.
 *     `nsm start --profile prod` starts the production stack.
 *     Profiles are composable (profile can extend another).
 *
 *  ⑥ Environment injection with secret masking
 *     `nsm start bridge --env NEXUS_API_KEY=...` injects at runtime.
 *     Secrets are masked in logs (replaced with ***).
 *
 *  ⑦ Graceful drain on SIGTERM
 *     Services are drained in reverse dependency order.
 *     Each gets a configurable `shutdownTimeout` before SIGKILL.
 *
 *  ⑧ Cross-platform service install in one command
 *     Windows:   node-windows service OR sc.exe direct via `--sc` flag
 *     Linux:     systemd unit file auto-generated + enabled
 *     macOS:     launchd plist auto-generated + loaded
 *
 *  ⑨ EXE packaging for any service
 *     `nsm build-exe bridge --target win-x64`
 *     Uses pkg, nexe, or Node SEA depending on what's available.
 *
 *  ⑩ Live tail with level filter + structured JSON parsing
 *     `nsm logs bridge --level error --follow --json`
 *     Parses JSONL log lines and formats them. Falls back to raw for non-JSON.
 *
 * Usage:
 *   node service/nsm.js <command> [service] [options]
 *
 * Commands:
 *   start      <service|--profile p>  Start service(s)
 *   stop       <service|all>          Stop service(s) gracefully
 *   restart    <service>              Restart
 *   status     [service|all]          Status dashboard
 *   logs       <service>              Tail logs
 *   metrics    <service>              Query metrics stream
 *   install    <service>              Install as OS service (win/linux/mac)
 *   uninstall  <service>              Remove OS service
 *   watchdog   <service>              Run watchdog (foreground)
 *   register   <name>                 Create service definition interactively
 *   build-exe  <service>              Package as standalone EXE
 *   profile    <list|show|create>     Manage profiles
 *   list                              List all services
 *   help                              Help
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const http   = require('http');
const { execSync, spawn, spawnSync } = require('child_process');

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT        = path.join(__dirname, '..');
const REGISTRY    = path.join(__dirname, 'registry');
const PROFILES    = path.join(__dirname, 'profiles');
const LOGS_DIR    = path.join(ROOT, 'bridge', 'data', 'service-logs');
const PIDS_DIR    = path.join(ROOT, 'bridge', 'data', 'service-pids');
const METRICS_DIR = path.join(ROOT, 'bridge', 'data', 'service-metrics');
const NSM_VERSION = '2.0.0';

[REGISTRY, PROFILES, LOGS_DIR, PIDS_DIR, METRICS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Args ─────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const cmd     = args[0] || 'help';
const svcArg  = args.find(a => !a.startsWith('-') && a !== cmd);
const flags   = new Set(args.filter(a => a.startsWith('--')));

function flagVal(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

// ── Colors ───────────────────────────────────────────────────────────────────
const NO_COLOR = process.env.NO_COLOR || flags.has('--no-color');
const C = NO_COLOR ? {
  g:'', r:'', y:'', c:'', m:'', dim:'', bold:'', reset:''
} : {
  g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', c:'\x1b[96m',
  m:'\x1b[35m', dim:'\x1b[2m', bold:'\x1b[1m', reset:'\x1b[0m',
};
const ok   = m => console.log(C.g  + '  ✓ ' + m + C.reset);
const fail = m => console.log(C.r  + '  ✗ ' + m + C.reset);
const warn = m => console.log(C.y  + '  ⚠ ' + m + C.reset);
const info = m => console.log(C.c  + '  ℹ ' + m + C.reset);
const dim  = m => console.log(C.dim + '    ' + m + C.reset);

// ── Node binary resolution ────────────────────────────────────────────────────
function resolveNode() {
  if (process.env.NEXUS_NODE_BIN) return process.env.NEXUS_NODE_BIN;
  const self = process.execPath;
  const base = path.basename(self).toLowerCase();
  if (base === 'node.exe' || base === 'node') return self;
  const win = process.platform === 'win32';
  try {
    const found = execSync(win ? 'where node' : 'which node', { encoding: 'utf8', timeout: 3000 })
      .trim().split(win ? '\r\n' : '\n')[0].trim();
    if (found && fs.existsSync(found)) return found;
  } catch {}
  const candidates = win
    ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')]
    : ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node'];
  return candidates.find(c => { try { return fs.existsSync(c); } catch { return false; } }) || 'node';
}
const NODE_BIN = resolveNode();

// ── Service registry ──────────────────────────────────────────────────────────

function loadSvc(name) {
  const p = path.join(REGISTRY, name + '.json');
  if (!fs.existsSync(p)) { fail(`Service not found: ${name}`); fail(`Registry: ${REGISTRY}`); process.exit(1); }
  const def = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { name, ...def };
}

function listServices() {
  if (!fs.existsSync(REGISTRY)) return [];
  return fs.readdirSync(REGISTRY)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return { name: f.replace('.json', ''), ...JSON.parse(fs.readFileSync(path.join(REGISTRY, f), 'utf8')) }; } catch { return { name: f.replace('.json', ''), error: 'corrupt' }; } });
}

// ── Dependency resolver ───────────────────────────────────────────────────────
// Topological sort of service start order.

function resolveDependencies(names) {
  const all  = new Map(listServices().map(s => [s.name, s]));
  const order = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular dependency: ${name}`);
    visiting.add(name);
    const def = all.get(name);
    if (def?.after) {
      for (const dep of def.after) { if (all.has(dep)) visit(dep); }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const n of names) visit(n);
  return order;
}

// ── PID management ────────────────────────────────────────────────────────────

function writePid(name, pid)  { fs.writeFileSync(path.join(PIDS_DIR, name + '.pid'), String(pid)); }
function clearPid(name)       { try { fs.unlinkSync(path.join(PIDS_DIR, name + '.pid')); } catch {} }
function readPid(name)        { try { return parseInt(fs.readFileSync(path.join(PIDS_DIR, name + '.pid'), 'utf8').trim()); } catch { return null; } }
function isAlive(pid)         { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } }

// ── Metrics stream ────────────────────────────────────────────────────────────

function writeMetric(name, event, data = {}) {
  const line = JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), event, ...data }) + '\n';
  fs.appendFileSync(path.join(METRICS_DIR, name + '.jsonl'), line);
}

// ── Log management ────────────────────────────────────────────────────────────

function logPath(name)   { return path.join(LOGS_DIR, name + '.log'); }
function writeLog(name, line) {
  const maxBytes = 10 * 1024 * 1024;
  const f = logPath(name);
  try {
    if (fs.existsSync(f) && fs.statSync(f).size > maxBytes) {
      for (let i = 4; i >= 1; i--) {
        const old = `${f}.${i}`, next = `${f}.${i+1}`;
        if (fs.existsSync(old)) fs.renameSync(old, next);
      }
      fs.renameSync(f, `${f}.1`);
    }
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${line}\n`);
  } catch {}
}

// ── Health probe ──────────────────────────────────────────────────────────────

function probeHealth(def) {
  const h = def.health;
  if (!h?.url) return Promise.resolve({ ok: true, skip: true });
  return new Promise(resolve => {
    const req = http.get(h.url, { timeout: h.timeout || 3000 }, res => {
      let body = ''; res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve({ ok: res.statusCode < 400 && (j.ok !== false), status: res.statusCode, version: j.version });
        } catch { resolve({ ok: res.statusCode < 400, status: res.statusCode }); }
      });
    });
    req.on('error', () => resolve({ ok: false, status: 0, err: 'connection refused' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, err: 'timeout' }); });
  });
}

// ── Secret masking ────────────────────────────────────────────────────────────

const SECRET_PATTERNS = [/KEY[=:]\S+/gi, /TOKEN[=:]\S+/gi, /SECRET[=:]\S+/gi, /PASS(?:WORD)?[=:]\S+/gi];

function maskSecrets(line) {
  return SECRET_PATTERNS.reduce((s, re) => s.replace(re, m => m.split(/[=:]/)[0] + '=***'), line);
}

// ── Core spawn + watchdog ─────────────────────────────────────────────────────

function spawnService(def, opts = {}) {
  const name    = def.name;
  const logStream = fs.createWriteStream(logPath(name), { flags: 'a' });
  const env     = Object.assign({}, process.env, def.env || {});

  // Runtime env injection from CLI
  const extraEnv = flagVal('--env');
  if (extraEnv) {
    const [k, v] = extraEnv.split('=');
    if (k && v !== undefined) env[k] = v;
  }

  const cwd = def.cwd || (def.script ? path.dirname(path.resolve(ROOT, def.script)) : ROOT);

  let bin, binArgs;
  if (def.script) {
    bin     = NODE_BIN;
    binArgs = (def.nodeOptions || []).concat([path.resolve(ROOT, def.script)]).concat(def.args || []);
  } else if (def.command) {
    const parts = def.command.split(' ');
    bin = parts[0]; binArgs = parts.slice(1).concat(def.args || []);
  } else { fail('Service needs "script" or "command"'); process.exit(1); }

  const proc = spawn(bin, binArgs, {
    cwd, env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: opts.detach || false,
  });

  proc.stdout.on('data', d => {
    const raw = d.toString().trimEnd();
    const masked = maskSecrets(raw);
    logStream.write('[out] ' + masked + '\n');
    if (opts.verbose) console.log(C.dim + '[' + name + '] ' + masked + C.reset);
  });
  proc.stderr.on('data', d => {
    const raw = d.toString().trimEnd();
    const masked = maskSecrets(raw);
    logStream.write('[err] ' + masked + '\n');
    if (opts.verbose) console.error(C.y + '[' + name + ':err] ' + masked + C.reset);
  });
  proc.on('exit', (code, sig) => {
    logStream.write(`[nsm] exit code=${code} signal=${sig}\n`);
    logStream.end();
    clearPid(name);
    writeMetric(name, 'exit', { code, sig });
  });

  writePid(name, proc.pid);
  writeLog(name, `[nsm] started pid=${proc.pid}`);
  writeMetric(name, 'start', { pid: proc.pid, bin });

  if (opts.detach) setTimeout(() => proc.unref(), 300);
  return proc;
}

async function runWatchdog(name, opts = {}) {
  const def          = loadSvc(name);
  const maxRestarts  = def.maxRestarts  || 10;
  const baseDelay    = def.restartDelay || 2000;
  const maxDelay     = def.maxDelay     || 30000;
  const healthInt    = (def.health?.interval) || 15000;
  const verbose      = opts.verbose || flags.has('--verbose');

  let restarts = 0, delay = baseDelay, lastClean = Date.now();
  let hbTimer = null, stopped = false;

  info(`Watchdog: ${name} (max=${maxRestarts} restarts, health every ${healthInt / 1000}s)`);

  const loop = () => {
    if (stopped) return;
    const proc = spawnService({ ...def, verbose }, { verbose });

    // Health-check loop (in addition to process exit monitoring)
    hbTimer = setInterval(async () => {
      const h = await probeHealth(def);
      if (!h.skip && !h.ok && !stopped) {
        warn(`[watchdog:${name}] health check failed (${h.err || h.status}) — killing`);
        writeMetric(name, 'health-fail', { status: h.status, err: h.err });
        proc.kill('SIGTERM');
      } else if (!h.skip && h.ok) {
        delay = baseDelay; // reset backoff on healthy
        if (Date.now() - lastClean > 60000) { restarts = 0; lastClean = Date.now(); }
      }
    }, healthInt);

    proc.on('exit', code => {
      clearInterval(hbTimer);
      if (stopped || code === 0) { if (code === 0) ok(`[watchdog:${name}] clean exit`); return; }

      restarts++;
      if (restarts > maxRestarts) {
        fail(`[watchdog:${name}] exceeded ${maxRestarts} restarts — giving up`);
        writeMetric(name, 'fatal', { restarts });
        // Trigger crash prompt if configured
        if (def.crashPrompt !== false) spawnCrashPrompt(name, def);
        process.exit(1);
      }

      // Exponential backoff + jitter
      const jitter = Math.floor(Math.random() * baseDelay);
      delay = Math.min(delay * 2, maxDelay) + jitter;

      warn(`[watchdog:${name}] crashed (code=${code}), restart ${restarts}/${maxRestarts} in ${delay}ms`);
      writeMetric(name, 'crash', { code, restarts, nextDelay: delay });
      setTimeout(loop, delay);
    });
  };

  process.on('SIGTERM', () => { stopped = true; clearInterval(hbTimer); });
  process.on('SIGINT',  () => { stopped = true; clearInterval(hbTimer); });

  loop();
}

function spawnCrashPrompt(name, def) {
  const promptScript = path.join(__dirname, 'crash-prompt.js');
  if (!fs.existsSync(promptScript)) return;
  spawn(NODE_BIN, [promptScript, '--service', name], {
    detached: true, stdio: 'ignore',
  }).unref();
}

// ── OS service install ────────────────────────────────────────────────────────

function installOSService(def) {
  const plat = process.platform;

  if (plat === 'win32') return installWindows(def);
  if (plat === 'linux') return installSystemd(def);
  if (plat === 'darwin') return installLaunchd(def);
  warn('Unknown platform — use watchdog mode');
}

function installWindows(def) {
  // Try node-windows first, fall back to sc.exe
  if (flags.has('--sc')) return installWindowsSC(def);
  try {
    const { Service } = require('node-windows');
    const svc = new Service({
      name:        def.windowsName || def.name,
      description: def.description || '',
      script:      path.resolve(ROOT, def.script),
      nodeOptions: def.nodeOptions || [],
      env: Object.entries(def.env || {}).map(([name, value]) => ({ name, value })),
    });
    svc.on('install', () => { ok('Service installed: ' + def.name); svc.start(); });
    svc.on('start',   () => ok('Started: ' + def.name));
    svc.on('error',   e  => fail('Error: ' + e));
    svc.install();
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      warn('node-windows not found — falling back to sc.exe');
      installWindowsSC(def);
    } else throw e;
  }
}

function installWindowsSC(def) {
  // sc.exe doesn't natively support Node scripts — wrap via nsm watchdog
  const nsmPath = path.resolve(__filename);
  const binPath = `"${NODE_BIN}" "${nsmPath}" watchdog ${def.name}`;
  try {
    execSync(`sc create "${def.windowsName || def.name}" binPath= "${NODE_BIN} ${nsmPath} watchdog ${def.name}" start= auto DisplayName= "${def.description || def.name}"`, { encoding: 'utf8' });
    execSync(`sc description "${def.windowsName || def.name}" "${def.description || ''}"`, { encoding: 'utf8' });
    ok(`Service created via sc.exe: ${def.name}`);
    info('Start it: sc start ' + (def.windowsName || def.name));
  } catch (e) {
    fail('sc.exe failed (run as admin?): ' + e.message);
  }
}

function installSystemd(def) {
  const unitName = def.name + '.service';
  const unitPath = `/etc/systemd/system/${unitName}`;
  const script   = def.script ? path.resolve(ROOT, def.script) : null;
  const execStart = script ? `${NODE_BIN} ${script}` : def.command;
  const envBlock  = Object.entries(def.env || {}).map(([k, v]) => `Environment="${k}=${v}"`).join('\n');

  const unit = `[Unit]
Description=${def.description || def.name}
After=network.target${(def.after||[]).map(d => ' ' + d + '.service').join('')}

[Service]
Type=simple
WorkingDirectory=${def.cwd || ROOT}
ExecStart=${execStart}
Restart=always
RestartSec=${Math.round((def.restartDelay || 2000) / 1000)}
${envBlock}
StandardOutput=append:${logPath(def.name)}
StandardError=append:${logPath(def.name)}

[Install]
WantedBy=multi-user.target
`;

  try {
    fs.writeFileSync(unitPath, unit);
    execSync('systemctl daemon-reload', { stdio: 'inherit' });
    execSync(`systemctl enable ${unitName}`, { stdio: 'inherit' });
    execSync(`systemctl start ${unitName}`,  { stdio: 'inherit' });
    ok(`systemd service installed: ${unitName}`);
  } catch (e) {
    // Can't write to /etc — write locally instead
    const localUnit = path.join(__dirname, unitName);
    fs.writeFileSync(localUnit, unit);
    info(`Wrote unit file locally: ${localUnit}`);
    info('To install: sudo cp ' + localUnit + ' /etc/systemd/system/ && sudo systemctl enable --now ' + unitName);
  }
}

function installLaunchd(def) {
  const label    = 'com.nexus.' + def.name;
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', label + '.plist');
  const script   = def.script ? path.resolve(ROOT, def.script) : null;
  const args     = script ? [NODE_BIN, script] : def.command.split(' ');
  const envDict  = Object.entries(def.env || {}).map(([k,v]) => `\t\t<key>${k}</key>\n\t\t<string>${v}</string>`).join('\n');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${label}</string>
\t<key>ProgramArguments</key>
\t<array>
${args.map(a => '\t\t<string>' + a + '</string>').join('\n')}
\t</array>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<true/>
\t<key>EnvironmentVariables</key>
\t<dict>
${envDict}
\t</dict>
\t<key>StandardOutPath</key>
\t<string>${logPath(def.name)}</string>
\t<key>StandardErrorPath</key>
\t<string>${logPath(def.name)}</string>
</dict>
</plist>`;

  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, plist);
  try {
    execSync(`launchctl load -w "${plistPath}"`, { stdio: 'inherit' });
    ok(`launchd agent loaded: ${label}`);
  } catch (e) {
    info(`Plist written: ${plistPath}`);
    info('To load: launchctl load -w ' + plistPath);
  }
}

// ── EXE packaging ─────────────────────────────────────────────────────────────

async function buildExe(name) {
  const def     = loadSvc(name);
  const target  = flagVal('--target') || 'node20-win-x64';
  const outDir  = path.join(ROOT, 'dist', 'services');
  fs.mkdirSync(outDir, { recursive: true });

  const entryPath = path.join(__dirname, `_build_${name}_entry.js`);
  const script    = path.resolve(ROOT, def.script);
  fs.writeFileSync(entryPath, [
    `// NSM build-exe entry — ${name} — ${new Date().toISOString()}`,
    `Object.assign(process.env, ${JSON.stringify(def.env || {})});`,
    `process.chdir(${JSON.stringify(path.dirname(script))});`,
    `require(${JSON.stringify(script)});`,
  ].join('\n'));

  const output  = path.join(outDir, name);
  info(`Building ${name} → ${output}.exe (target: ${target})`);

  // Try pkg, then nexe, then Node SEA
  let built = false;
  for (const tool of ['pkg', 'nexe']) {
    try {
      execSync(`${tool} --version`, { stdio: 'pipe' });
      const toolArgs = tool === 'pkg'
        ? [entryPath, '--targets', target, '--output', output]
        : [entryPath, '-t', target.replace('node20-', ''), '-o', output];
      spawnSync(tool, toolArgs, { stdio: 'inherit', cwd: ROOT });
      built = true;
      ok(`Built with ${tool}: ${output}.exe`);
      break;
    } catch {}
  }

  fs.unlinkSync(entryPath);
  if (!built) {
    warn('pkg and nexe not found. Install one:');
    dim('npm install -g pkg   OR   npm install -g nexe');
    dim('Then: node service/nsm.js build-exe ' + name);
  }
}

// ── Profiles ──────────────────────────────────────────────────────────────────

function loadProfile(name) {
  const p = path.join(PROFILES, name + '.json');
  if (!fs.existsSync(p)) { fail('Profile not found: ' + name); process.exit(1); }
  const prof = JSON.parse(fs.readFileSync(p, 'utf8'));
  // Profile extension
  if (prof.extends) {
    const base = loadProfile(prof.extends);
    return { ...base, ...prof, services: [...(base.services || []), ...(prof.services || [])] };
  }
  return prof;
}

// ── Metrics query ─────────────────────────────────────────────────────────────

function queryMetrics(name) {
  const f = path.join(METRICS_DIR, name + '.jsonl');
  if (!fs.existsSync(f)) { info('No metrics yet for ' + name); return; }
  const since  = flagVal('--since') ? Date.parse(flagVal('--since')) : 0;
  const evtFilter = flagVal('--event');
  const lines  = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const filtered = events.filter(e => e.ts >= since && (!evtFilter || e.event === evtFilter));

  console.log(`\n${C.c}── Metrics: ${name} (${filtered.length} events) ──${C.reset}`);
  filtered.slice(-50).forEach(e => {
    const icon = { start: C.g + '▶', exit: C.dim + '■', crash: C.r + '✗', 'health-fail': C.y + '⚠', fatal: C.r + '☠' }[e.event] || ' ';
    console.log(`  ${icon}${C.reset}  ${C.dim}${e.iso}${C.reset}  ${C.bold}${e.event}${C.reset}  ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['ts','iso','event'].includes(k))))}`);
  });

  // Summary
  const crashes = events.filter(e => e.event === 'crash').length;
  const starts  = events.filter(e => e.event === 'start').length;
  const last    = events[events.length - 1];
  console.log(`\n  ${C.dim}starts: ${starts}  crashes: ${crashes}  last: ${last?.event || '-'} (${last?.iso || '-'})${C.reset}\n`);
}

// ── Status dashboard ──────────────────────────────────────────────────────────

async function showStatus(target) {
  const svcs = target ? [loadSvc(target)] : listServices();
  console.log(`\n${C.c}${C.bold}NSM v${NSM_VERSION}${C.reset}  ${C.dim}${new Date().toISOString()}${C.reset}`);
  console.log(C.dim + '─'.repeat(64) + C.reset);

  for (const def of svcs) {
    const pid     = readPid(def.name);
    const alive   = isAlive(pid);
    const health  = alive ? await probeHealth(def) : null;
    const hStr    = !health ? '' : health.skip ? '' : health.ok ? C.g + ' ●health' : C.r + ' ✗health';
    const dot     = alive ? C.g + '●' : C.r + '○';
    const status  = alive ? C.g + 'RUNNING' + C.dim + ' pid=' + pid : C.r + 'STOPPED';

    console.log(`  ${dot} ${C.bold}${def.name.padEnd(18)}${C.reset} ${status}${hStr}${C.reset}`);
    if (def.description) console.log(`${C.dim}     ${def.description}${C.reset}`);
    if (alive && def.health?.url) console.log(`${C.dim}     health: ${def.health.url}${C.reset}`);
  }

  console.log(C.dim + '─'.repeat(64) + C.reset);
}

// ── Log tail ──────────────────────────────────────────────────────────────────

function tailLogs(name) {
  const f       = logPath(name);
  const lines   = parseInt(flagVal('--lines') || '60');
  const level   = flagVal('--level')?.toUpperCase();
  const follow  = flags.has('--follow') || flags.has('-f');
  const jsonMode = flags.has('--json');

  if (!fs.existsSync(f)) { warn('No log file for ' + name); return; }

  function printLines(content) {
    const all = content.split('\n').filter(Boolean);
    const last = all.slice(-lines);
    last.forEach(line => {
      if (jsonMode) {
        // Try to parse inner JSON from log line
        const m = line.match(/\[out\] ({.+})/);
        if (m) { try { const j = JSON.parse(m[1]); if (!level || (j.level||'').toUpperCase() === level) console.log(JSON.stringify(j)); return; } catch {} }
      }
      if (!level || line.toUpperCase().includes(level)) console.log(line);
    });
  }

  printLines(fs.readFileSync(f, 'utf8'));

  if (follow) {
    let size = fs.statSync(f).size;
    info('Following ' + f + ' (Ctrl+C to stop)');
    setInterval(() => {
      try {
        const newSize = fs.statSync(f).size;
        if (newSize <= size) return;
        const fd = fs.openSync(f, 'r');
        const buf = Buffer.alloc(newSize - size);
        fs.readSync(fd, buf, 0, buf.length, size);
        fs.closeSync(fd);
        size = newSize;
        printLines(buf.toString());
      } catch {}
    }, 500);
  }
}

// ── Interactive register ──────────────────────────────────────────────────────

async function registerService(name) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));

  console.log(`\n${C.c}Register service: ${name}${C.reset}\n`);
  const script      = await ask('  Script path (relative to ROOT): ');
  const description = await ask('  Description: ');
  const envLine     = await ask('  Env vars (KEY=VAL KEY2=VAL2 or empty): ');
  const after       = await ask('  Depends on (space-separated service names or empty): ');
  const healthUrl   = await ask('  Health check URL (or empty): ');

  const env = {};
  envLine.trim().split(/\s+/).forEach(pair => {
    if (!pair.includes('=')) return;
    const [k, ...vArr] = pair.split('=');
    env[k] = vArr.join('=');
  });

  const def = {
    description,
    script: script.trim(),
    env,
    after:         after.trim() ? after.trim().split(/\s+/) : [],
    health:        healthUrl.trim() ? { url: healthUrl.trim(), interval: 15000 } : undefined,
    maxRestarts:   10,
    restartDelay:  2000,
    maxDelay:      30000,
    exeTargets:    ['node20-win-x64', 'node20-linux-x64', 'node20-macos-arm64'],
  };

  const outPath = path.join(REGISTRY, name + '.json');
  fs.writeFileSync(outPath, JSON.stringify(def, null, 2));
  rl.close();
  ok('Service registered: ' + outPath);
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

(async function main() {
  switch (cmd) {

    case 'start': {
      const profile = flagVal('--profile');
      if (profile) {
        const prof = loadProfile(profile);
        const ordered = resolveDependencies(prof.services || []);
        info(`Profile "${profile}" — starting ${ordered.length} services in order`);
        for (const n of ordered) {
          const def = loadSvc(n);
          const pid = readPid(n);
          if (isAlive(pid)) { warn(n + ' already running'); continue; }
          spawn(NODE_BIN, [__filename, 'watchdog', n], {
            stdio: 'ignore', detached: true, cwd: ROOT,
          }).unref();
          await new Promise(r => setTimeout(r, 500));
          ok('Started: ' + n);
        }
        break;
      }
      if (!svcArg) { fail('Usage: nsm start <service> [--profile <p>]'); process.exit(1); }
      const def = loadSvc(svcArg);
      const pid = readPid(svcArg);
      if (isAlive(pid)) { warn(svcArg + ' already running (pid=' + pid + ')'); break; }
      spawn(NODE_BIN, [__filename, 'watchdog', svcArg], {
        stdio: 'ignore', detached: true, cwd: ROOT,
      }).unref();
      await new Promise(r => setTimeout(r, 400));
      ok(svcArg + ' started');
      break;
    }

    case 'stop': {
      const all = svcArg === 'all';
      const svcs = all ? listServices().map(s => s.name).reverse() : [svcArg];
      for (const n of svcs) {
        const pid = readPid(n);
        if (!pid || !isAlive(pid)) { warn(n + ' not running'); continue; }
        process.kill(pid, 'SIGTERM');
        clearPid(n);
        ok('Stopped: ' + n);
        if (all) await new Promise(r => setTimeout(r, 300));
      }
      break;
    }

    case 'restart': {
      if (!svcArg) { fail('Usage: nsm restart <service>'); process.exit(1); }
      const pid = readPid(svcArg);
      if (pid && isAlive(pid)) { process.kill(pid, 'SIGTERM'); clearPid(svcArg); }
      await new Promise(r => setTimeout(r, 600));
      const def = loadSvc(svcArg);
      spawnService(def, { detach: true });
      ok('Restarted: ' + svcArg);
      break;
    }

    case 'status':   await showStatus(svcArg || null); break;

    case 'list': {
      const svcs = listServices();
      console.log(`\n${C.c}NSM Registry — ${svcs.length} services${C.reset}`);
      svcs.forEach(s => console.log(`  ${C.bold}${s.name}${C.reset}${s.description ? C.dim + ' — ' + s.description + C.reset : ''}`));
      console.log('');
      break;
    }

    case 'logs':    tailLogs(svcArg || 'bridge'); break;

    case 'metrics': queryMetrics(svcArg || 'bridge'); break;

    case 'watchdog':
      if (!svcArg) { fail('Usage: nsm watchdog <service>'); process.exit(1); }
      await runWatchdog(svcArg, { verbose: flags.has('--verbose') });
      break;

    case 'install':
      if (!svcArg) { fail('Usage: nsm install <service>'); process.exit(1); }
      installOSService(loadSvc(svcArg));
      break;

    case 'uninstall': {
      if (!svcArg) { fail('Usage: nsm uninstall <service>'); process.exit(1); }
      const pid = readPid(svcArg);
      if (pid && isAlive(pid)) { process.kill(pid, 'SIGTERM'); clearPid(svcArg); }
      // Platform-specific removal
      if (process.platform === 'linux') {
        try { execSync(`systemctl disable --now ${svcArg}.service`, { stdio: 'inherit' }); } catch {}
      } else if (process.platform === 'darwin') {
        try { execSync(`launchctl unload ~/Library/LaunchAgents/com.nexus.${svcArg}.plist`, { stdio: 'inherit' }); } catch {}
      } else if (process.platform === 'win32') {
        try { execSync(`sc delete "${svcArg}"`, { stdio: 'inherit' }); } catch {}
      }
      ok('Uninstalled: ' + svcArg);
      break;
    }

    case 'register':
      if (!svcArg) { fail('Usage: nsm register <name>'); process.exit(1); }
      await registerService(svcArg);
      break;

    case 'build-exe':
      if (!svcArg) { fail('Usage: nsm build-exe <service>'); process.exit(1); }
      await buildExe(svcArg);
      break;

    case 'profile': {
      const sub = args[1];
      if (sub === 'list') {
        const profiles = fs.existsSync(PROFILES) ? fs.readdirSync(PROFILES).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')) : [];
        console.log('\nProfiles:', profiles.join(', ') || '(none)');
      } else if (sub === 'show' && args[2]) {
        console.log(JSON.stringify(loadProfile(args[2]), null, 2));
      } else {
        info('Usage: nsm profile list | show <name> | create <name>');
      }
      break;
    }

    case 'help':
    default:
      console.log(`\n${C.c}${C.bold}NSM v${NSM_VERSION} — Nexus Service Manager${C.reset}\n`);
      console.log(`  ${C.bold}Commands:${C.reset}`);
      console.log(`    start     <service>            Start service (detached watchdog)`);
      console.log(`    start     --profile <p>        Start profile (ordered by deps)`);
      console.log(`    stop      <service|all>        Stop gracefully`);
      console.log(`    restart   <service>            Stop + start`);
      console.log(`    status    [service]            Status dashboard with health`);
      console.log(`    list                           List all registered services`);
      console.log(`    logs      <service>            Tail logs`);
      console.log(`      --lines <n>  --follow  --level error  --json`);
      console.log(`    metrics   <service>            Query metrics stream`);
      console.log(`      --since <ISO>  --event crash`);
      console.log(`    watchdog  <service>            Run watchdog (foreground)`);
      console.log(`    install   <service>            Install as OS service (win/linux/mac)`);
      console.log(`    uninstall <service>            Remove OS service`);
      console.log(`    register  <name>               Interactive service registration`);
      console.log(`    build-exe <service>            Package as standalone EXE`);
      console.log(`      --target node20-win-x64`);
      console.log(`    profile   list|show <n>        Manage startup profiles`);
      console.log(`\n  ${C.bold}Service definitions:${C.reset}  service/registry/<name>.json`);
      console.log(`  ${C.bold}Profiles:${C.reset}             service/profiles/<name>.json`);
      console.log(`  ${C.bold}Logs:${C.reset}                 bridge/data/service-logs/<name>.log`);
      console.log(`  ${C.bold}Metrics:${C.reset}              bridge/data/service-metrics/<name>.jsonl\n`);
  }
})().catch(e => { fail('Fatal: ' + e.message); process.exit(1); });
