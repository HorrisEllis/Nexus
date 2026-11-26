'use strict';
// cos/build/update-electron.js — a COS pipeline step: Clear Glass's Electron brought to the latest stable, checked, and put back if it fails.
// James, 2026-11-26: "can you update electron? did you like i asked?" · "or add the pipeline so i can do it my self" · "look in the settings.html
// in the about" (its Updates pane said what was newer and how, as a command: he does not use commands). Map: CGE2
// (docs/2026-11-26-clear-glass-engine-phasemap.spec). The door in COS's scripts folder is one line (data/ is never committed).
// Input (NEXUS_STEP_INPUT): { version: 'latest' | 'x.y.z', waitForCloseMin: 15 }. The last line printed is the step's output, as JSON.
// Order: the version wanted and the one installed are read; nothing happens when they match. Clear Glass must be closed (Electron's files are
// in use while it runs): the step waits for it, saying so, up to waitForCloseMin. Then npm installs the version (no package.json edit: the
// coder commits that once it works), Electron is asked its version, and on any failure the old version is installed again, said.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
const inp = (() => { try { return JSON.parse(process.env.NEXUS_STEP_INPUT || '{}'); } catch (_) { return {}; } })();
const say = (o) => { console.log(JSON.stringify(o)); process.exit(o.ok ? 0 : 1); };
const NPM = (() => { const d = path.dirname(process.execPath), c = path.join(d, process.platform === 'win32' ? 'npm.cmd' : 'npm'); return fs.existsSync(c) ? c : 'npm'; })();
const npm = (args, ms = 600000) => spawnSync(NPM, args, { cwd: ROOT, encoding: 'utf8', timeout: ms, shell: process.platform === 'win32', windowsHide: true });
const installed = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version; } catch (_) { return null; } };
const exe = path.join(ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const clearGlassUp = () => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port: 7704, path: '/health', timeout: 3000 }, (r) => { r.resume(); res(r.statusCode === 200); }); q.on('error', () => res(false)); q.on('timeout', () => { q.destroy(); res(false); }); });

(async () => {
  const before = installed();
  let want = String(inp.version || 'latest');
  if (want === 'latest') { const v = npm(['view', 'electron', 'dist-tags.latest'], 60000); want = String(v.stdout || '').trim().split(/\s+/).pop(); }
  if (!/^\d+\.\d+\.\d+$/.test(want)) say({ ok: false, why: `the version to install could not be read (${want || 'npm gave nothing'})`, installed: before });
  if (before === want) say({ ok: true, installed: before, note: `Electron ${before} is already the latest; nothing to do` });
  const until = Date.now() + (Number(inp.waitForCloseMin) || 15) * 60000;
  let told = false;
  while (await clearGlassUp()) {
    if (!told) { console.log(`waiting: close Clear Glass so Electron ${before} can be replaced by ${want} (its files are in use while it runs)`); told = true; }
    if (Date.now() > until) say({ ok: false, why: 'Clear Glass stayed open; Electron was not changed. Close it and run this again.', installed: before, wanted: want });
    await new Promise((r) => setTimeout(r, 5000));
  }
  const r = npm(['install', `electron@${want}`, '--no-save', '--no-audit', '--no-fund']);
  const ver = spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  const got = String(ver.stdout || '').trim().replace(/^v/, '');
  if (r.status === 0 && got === want && installed() === want) say({ ok: true, installed: want, was: before, note: `Electron ${before} → ${want}. Open Clear Glass: Settings › About shows it.` });
  const back = before ? npm(['install', `electron@${before}`, '--no-save', '--no-audit', '--no-fund']) : null;
  say({ ok: false, why: `Electron ${want} did not install or start (npm: ${String(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' ').slice(0, 300) || 'exit ' + r.status}; it said: ${got || 'nothing'})`,
    restored: back ? (back.status === 0 && installed() === before ? before : `could not restore ${before}`) : null, wanted: want });
})();
