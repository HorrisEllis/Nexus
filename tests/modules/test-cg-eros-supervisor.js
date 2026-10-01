'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cg-eros-supervisor.js — §0.39.264 ErosmancerOS starts with Clear Glass.
 *
 * James: "hook it in to run with clearglass" / "just need erosmanceros to start with clearglass".
 * Every boot logged "ErosmancerOS connect failed … ECONNREFUSED 127.0.0.1:7432": nothing started it.
 *
 * REAL: clear-glass/src/eros/supervisor.js driving fakes for the lifecycle rules
 * (reuse, restart backoff, give-up, stop), and — where this host has tsx with its
 * esbuild binary and a Chromium — the REAL ErosmancerOS server started through
 * tsx, connected to a real browser's DevTools port, and stopped again. That run
 * also proves the ErosmancerOS fix: /api/connect crashed on every call
 * ("reading 'defaultLevel'") because DEFAULT_CONFIG lacked routing/behavior/observer.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const cp = require('child_process');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0, skipped = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
function skip(n, why) { skipped++; console.log(`  - ${n} — SKIPPED: ${why}`); }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

async function main() {
  console.log('\ntest-cg-eros-supervisor\n');
  const { ErosSupervisor, SERVER_TS, _tsxCli, _health } = require(path.join(ROOT, 'clear-glass', 'src', 'eros', 'supervisor.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eros-sup-'));
  const quiet = () => {};

  // ── an ErosmancerOS already running is used, not doubled ──
  let spawned = 0; const posts = [];
  const ext = new ErosSupervisor({ port: 1, cdpPort: 9333, dataDir: tmp, log: quiet, _health: async () => ({ up: true, body: { ok: false } }), _spawn: () => { spawned++; }, _post: async (...a) => { posts.push(a); return { ok: true }; } });
  const s1 = await ext.start();
  check('something already on the port → used as is, nothing spawned, and connected to Clear Glass\'s DevTools port', s1.state === 'running' && s1.external && spawned === 0 && posts[0][1] === '/api/connect' && posts[0][2].target.port === 9333);

  // ── a crash is restarted with backoff; five in two minutes stop the loop ──
  const kids = [];
  const fakeSpawn = (bin, args, opts) => { const c = new EventEmitter(); c.pid = 1000 + kids.length; c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => setImmediate(() => c.emit('exit', null, 'SIGTERM')); c.args = args; c.opts = opts; kids.push(c); return c; };
  let up = false;
  const sup = new ErosSupervisor({ port: 2, cdpPort: 9333, dataDir: path.join(tmp, 'd'), log: quiet, readyTimeoutMs: 3000, _spawn: fakeSpawn, _health: async () => ({ up }), _post: async () => ({ ok: true }), _tsx: () => '/x/tsx/cli.mjs', _node: () => ({ bin: 'node', env: {} }) });
  setTimeout(() => { up = true; }, 300);
  const s2 = await sup.start();
  check('not running → started through tsx on ErosmancerOS\'s own server.ts, with its port, data dir and quiet logging', s2.state === 'running' && kids[0].args[1] === SERVER_TS && kids[0].opts.env.PORT === '2' && kids[0].opts.env.DATA_DIR === path.join(tmp, 'd') && kids[0].opts.env.EROS_LOG_LEVEL === 'info');
  check('once it answers, it is connected to Clear Glass\'s DevTools port', !!s2.connected && s2.connected.cdpPort === 9333);
  kids[0].stdout.emit('data', 'hello from eros\n');
  check('its output is kept for the Settings page', sup.status().log.some(l => /hello from eros/.test(l)));
  up = false; kids[0].emit('exit', 1, null);
  check('a crash → restarting, with the reason', sup.status().state === 'restarting' && sup.status().lastExit.code === 1 && sup.status().restarts === 1);
  sup.stop();
  check('stop() during a restart wait cancels it — no respawn after quit', await new Promise(r => setTimeout(() => r(kids.length === 1 && sup.status().state === 'stopped'), 1300)));
  const loop = new ErosSupervisor({ port: 3, dataDir: tmp, log: quiet, _spawn: fakeSpawn, _health: async () => ({ up: false }), _tsx: () => 't', _node: () => ({ bin: 'node', env: {} }), readyTimeoutMs: 10 });
  loop.child = { pid: 1 }; for (let i = 0; i < 5; i++) { loop.child = { pid: i }; loop._onExit(loop.child, 1, null); if (loop._timer) { clearTimeout(loop._timer); loop._timer = null; } }
  check('five crashes inside two minutes → gives up and says why (no restart loop)', loop.status().state === 'failed' && /5 times in 2 minutes/.test(loop.status().lastError));
  const noTsx = new ErosSupervisor({ port: 4, dataDir: tmp, log: quiet, _health: async () => ({ up: false }), _tsx: () => null });
  const s3 = await noTsx.start();
  check('no tsx installed → failed, naming the fix (npm install)', s3.state === 'failed' && /npm install/.test(s3.lastError));

  // ── Clear Glass wiring ──
  const MAIN = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'main', 'index.js'), 'utf8');
  check('Clear Glass boot starts the supervisor (EROS_AUTOSTART=0 opts out) before its wire', /new ErosSupervisor\(\{ port: EROS_PORT, cdpPort: CG_CDP_PORT \}\)/.test(MAIN) && MAIN.indexOf('erosSupervisor.start()') < MAIN.indexOf('_startWire().catch') && /EROS_AUTOSTART !== '0'/.test(MAIN));
  check('Clear Glass quit stops it', /erosSupervisor\.stop\(\)/.test(MAIN.slice(MAIN.indexOf('async function shutdown()'))));
  check('the wire serves the supervisor\'s status and a start/reconnect', /'\/eros-supervisor'/.test(MAIN) && /'\/eros-supervisor\/start'/.test(MAIN));
  const SET = fs.readFileSync(path.join(ROOT, 'clear-glass', 'renderer', 'settings', 'sections', 'eros.js'), 'utf8');
  check('Settings → ErosmancerOS shows who started it, offers Start, and defaults to Clear Glass\'s real DevTools port (not 9222)', /\/eros-supervisor/.test(SET) && /Start ErosmancerOS/.test(SET) && /sup\.cdpPort\) \|\| 9333/.test(SET) && !/value: 9222/.test(SET));
  const TYPES = fs.readFileSync(path.join(ROOT, 'erosmancer', 'erosmancer-os', 'src', 'types', 'index.ts'), 'utf8');
  const dc = TYPES.slice(TYPES.indexOf('export const DEFAULT_CONFIG'), TYPES.indexOf('export const BEHAVIOR_DEFAULTS'));
  check('ErosmancerOS DEFAULT_CONFIG carries routing, behavior and observer (connect crashed without them)', /routing: \{\s*defaultLevel/.test(dc) && /behavior: \{/.test(dc) && /observer: \{/.test(dc));

  // ── the real thing ──
  const chrome = (() => { try { const base = '/opt/pw-browsers'; for (const d of fs.readdirSync(base)) { const p = path.join(base, d, 'chrome-linux', 'chrome'); if (/^chromium-\d+$/.test(d) && fs.existsSync(p)) return p; } } catch (_) {} return process.env.CHROME_BIN || null; })();
  let esbuildOk = false; try { require(require.resolve('esbuild', { paths: [ROOT] })).transformSync('let a: number = 1', { loader: 'ts' }); esbuildOk = true; } catch (_) {}
  if (!_tsxCli()) skip('real ErosmancerOS start', 'tsx not installed (npm install)');
  else if (!esbuildOk) skip('real ErosmancerOS start', 'tsx\'s esbuild has no binary for this platform here');
  else if (!chrome) skip('real ErosmancerOS start', 'no Chromium on this host (set CHROME_BIN)');
  else {
    const cdp = await freePort(), port = await freePort();
    const br = cp.spawn(chrome, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${cdp}`, `--user-data-dir=${path.join(tmp, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 40; i++) { if ((await new Promise(r => { const q = require('http').get({ host: '127.0.0.1', port: cdp, path: '/json/version' }, (s) => { s.resume(); r(true); }); q.on('error', () => r(false)); }))) break; await new Promise(r => setTimeout(r, 250)); }
    const real = new ErosSupervisor({ port, cdpPort: cdp, dataDir: path.join(tmp, 'eros-data'), log: quiet, readyTimeoutMs: 60000 });
    const st = await real.start();
    const h = await _health(port);
    check('real: Clear Glass\'s supervisor starts ErosmancerOS through tsx and it answers', st.state === 'running' && !st.external && h.up, st.lastError || '');
    check('real: it is connected to the browser\'s DevTools port (the ECONNREFUSED / "Not connected" state is gone)', !!st.connected && h.body && h.body.state === 'connected', JSON.stringify(h.body && h.body.state) + ' ' + (st.lastError || ''));
    real.stop();
    await new Promise(r => setTimeout(r, 1500));
    check('real: stopping Clear Glass stops it — the port is free again', !(await _health(port)).up);
    try { br.kill('SIGKILL'); } catch (_) {}
    // Chromium's helper processes can still be writing the profile just after the kill: wait for the exit first
    await new Promise(r => { if (br.exitCode !== null || br.signalCode) return r(); br.once('exit', r); setTimeout(r, 3000); });
  }

  // a temp dir that will not delete is not a test failure (0.39.286: ENOTEMPTY on chrome/Default crashed a passing run)
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { console.log(`  (temp dir left: ${e.message})`); }
  console.log(`\n  ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped (reasons above)` : ''}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}
main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
