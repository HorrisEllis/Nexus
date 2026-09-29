#!/usr/bin/env node
'use strict';
/**
 * cos/testenv/provision.js — make the test VM's base image. One command, any host.
 * comp_id: nexus.cos.testenv.provision
 * Status: pre-release · §0.39.264
 *
 * James: "i need help setting the vm up. either a batch file or just in the
 * packages. or invent a js alternative."
 *
 * This is the JS way. The only thing it needs besides Node is QEMU itself
 * (setup-vm.bat installs that with winget on Windows). Everything else —
 * download, disk, cloud-init seed, first boot, verification, manifest — is here:
 *
 *   1. find QEMU (cos/testenv/host.js — PATH or the default install folders)
 *   2. download a Debian cloud image (genericcloud: cloud-init, virtio, ~350 MB)
 *   3. copy it to base.new.qcow2 and grow the disk
 *   4. serve a cloud-init NoCloud seed from a tiny HTTP server on 127.0.0.1 — the
 *      guest reaches it at 10.0.2.2 through QEMU's user-mode network, told where
 *      by the SMBIOS serial "ds=nocloud-net;s=http://10.0.2.2:<port>/". No ISO,
 *      no mkisofs, no FAT image: the seed is just HTTP.
 *   5. boot it once with network: apt installs qemu-guest-agent, python3, git,
 *      build tools (+ go/ruby/php/rust if asked); Node comes from nodejs.org.
 *      The guest reports each step and its runtime versions back to the server,
 *      disables cloud-init for later boots, and powers off.
 *   6. boot it AGAIN as an ephemeral overlay with no network, reach
 *      qemu-guest-agent and run `node -v` — the proof the image works for tests.
 *   7. base.new.qcow2 → base.qcow2 (the previous base is kept as base.prev.qcow2,
 *      §0.3), and base.json records what the image has.
 *
 * Usage:
 *   node cos/testenv/provision.js [--with go,ruby,php,rust] [--node 22|lts]
 *        [--image-url URL | --image-file PATH] [--disk 16G] [--accel tcg]
 *        [--install-qemu] [--json] [--home DIR]
 *   node cos/testenv/provision.js --status
 *
 * Library: provision(opts, onEvent) -> { ok, image, manifest, log }
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const H = require('./host.js');

const DEFAULT_IMAGE_URL = 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2';
const EXTRA_PACKAGES = {
  go: ['golang-go'],
  ruby: ['ruby-full', 'ruby-bundler'],
  php: ['php-cli', 'composer'],
  rust: ['cargo', 'rustc'],
  // §0.39.279 — James: "once its generated, you can open it like a desktop environment". A light desktop the VM boots
  // straight into (lightdm autologin as user nexus), shown by the desktop viewer over QEMU's VNC websocket.
  desktop: ['xfce4', 'xfce4-terminal', 'lightdm', 'xserver-xorg', 'dbus-x11', 'firefox-esr', 'mousepad'],
};

function _q() { return require('../compartment/qemu-runtime.js'); }
function _ga() { return require('../compartment/guest-agent.js'); }

// ── cloud-init ──────────────────────────────────────────────────────────────

/** the guest-side provisioning script: every step reports; the last report carries the versions */
function provisionScript({ node = 'lts', extras = [] } = {}) {
  return `#!/bin/sh
# cos-testenv provisioning — written by nexus cos/testenv/provision.js
SEED="$(cat /run/cos-seed-url 2>/dev/null)"
say() { echo "[cos-testenv] $*"; [ -n "$SEED" ] && curl -fsS -m 10 -X POST --data-binary "$*" "$SEED"progress >/dev/null 2>&1 || true; }
fail() { say "FAILED: $*"; curl -fsS -m 10 -X POST --data-binary "status=failed
step=$*" "$SEED"done >/dev/null 2>&1 || true; exit 1; }
export DEBIAN_FRONTEND=noninteractive PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
say "guest up; installing Node (${node})"
V=$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c 'import json,sys
want=sys.argv[1]; rs=json.load(sys.stdin)
print(next(r["version"] for r in rs if (want=="lts" and r["lts"]) or r["version"].startswith("v"+want+".")))' '${node}') || fail "resolve node version"
curl -fsSL "https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz" -o /tmp/node.tar.xz || fail "download node $V"
tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --exclude CHANGELOG.md --exclude README.md --exclude LICENSE || fail "unpack node"
rm -f /tmp/node.tar.xz
corepack enable >/dev/null 2>&1 || true
say "node $(node -v) installed"
systemctl enable qemu-guest-agent >/dev/null 2>&1 || true
${extras.includes('rust') ? 'say "rust: $(cargo --version 2>&1)"' : ''}
${extras.includes('desktop') ? `id nexus >/dev/null 2>&1 || useradd -m -s /bin/bash nexus
mkdir -p /etc/lightdm/lightdm.conf.d
printf '[Seat:*]\\nautologin-user=nexus\\nautologin-session=xfce\\n' > /etc/lightdm/lightdm.conf.d/50-nexus.conf
systemctl set-default graphical.target >/dev/null 2>&1 || true
say "desktop: xfce + lightdm, autologin as nexus"` : ''}
# later boots are test runs: no datasource search, no network wait
touch /etc/cloud/cloud-init.disabled
systemctl disable systemd-networkd-wait-online.service >/dev/null 2>&1 || true
apt-get clean
REPORT="status=ok
node=$(node -v 2>/dev/null)
npm=$(npm -v 2>/dev/null)
python3=$(python3 -c 'import platform;print(platform.python_version())' 2>/dev/null)
pip=$(python3 -m pip --version 2>/dev/null | cut -d' ' -f2)
git=$(git --version 2>/dev/null | cut -d' ' -f3)
make=$(make --version 2>/dev/null | head -1 | awk '{print $3}')
gcc=$(gcc -dumpversion 2>/dev/null)
go=$(go version 2>/dev/null | awk '{print $3}')
ruby=$(ruby -e 'print RUBY_VERSION' 2>/dev/null)
php=$(php -r 'echo PHP_VERSION;' 2>/dev/null)
cargo=$(cargo --version 2>/dev/null | cut -d' ' -f2)
qga=$(qemu-ga --version 2>/dev/null | awk '{print $NF}')
kernel=$(uname -r)
desktop=$(systemctl get-default 2>/dev/null)
os=$(. /etc/os-release; echo "$PRETTY_NAME")"
sync
curl -fsS -m 20 -X POST --data-binary "$REPORT" "$SEED"done >/dev/null 2>&1 || true
say "done — powering off"
`;
}

function userData({ node = 'lts', extras = [], seedUrl }) {
  const pkgs = ['qemu-guest-agent', 'python3', 'python3-venv', 'python3-pip', 'git', 'build-essential', 'make', 'ca-certificates', 'curl', 'xz-utils', 'tar', 'unzip',
    ...extras.flatMap(e => EXTRA_PACKAGES[e] || [])];
  const script = provisionScript({ node, extras });
  const indent = (s, n) => s.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');
  return `#cloud-config
hostname: cos-testenv
ssh_pwauth: false
package_update: true
package_upgrade: false
packages:
${pkgs.map(p => `  - ${p}`).join('\n')}
write_files:
  - path: /run/cos-seed-url
    permissions: '0644'
    content: "${seedUrl}"
  - path: /usr/local/sbin/cos-provision
    permissions: '0755'
    content: |
${indent(script, 6)}
runcmd:
  - [ sh, -c, "/usr/local/sbin/cos-provision 2>&1 | tee /dev/console" ]
power_state:
  mode: poweroff
  delay: now
  message: cos-testenv provisioned
  timeout: 120
  condition: true
`;
}

/** serve meta-data / user-data / vendor-data, and collect progress + the final report */
function seedServer({ userDataText, getUserData = null, instanceId, onProgress, onDone, host = '127.0.0.1' }) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const body = [];
    req.on('data', c => { if (body.length < 256) body.push(c); });
    req.on('end', () => {
      const text = Buffer.concat(body).toString('utf8');
      const send = (code, t, type = 'text/plain') => { res.writeHead(code, { 'content-type': type }); res.end(t); };
      if (req.method === 'GET' && u.pathname === '/meta-data') return send(200, `instance-id: ${instanceId}\nlocal-hostname: cos-testenv\n`);
      if (req.method === 'GET' && u.pathname === '/user-data') return send(200, getUserData ? getUserData() : userDataText, 'text/cloud-config');
      if (req.method === 'GET' && (u.pathname === '/vendor-data' || u.pathname === '/network-config')) return send(u.pathname === '/vendor-data' ? 200 : 404, '');
      if (req.method === 'POST' && u.pathname === '/progress') { onProgress(text.trim()); return send(200, 'ok'); }
      if (req.method === 'POST' && u.pathname === '/done') {
        const kv = {}; for (const l of text.split('\n')) { const i = l.indexOf('='); if (i > 0) kv[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
        onDone(kv); return send(200, 'ok');
      }
      send(404, 'not found');
    });
  });
  return new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(0, host, () => resolve(srv)); });
}

// ── download ────────────────────────────────────────────────────────────────

function download(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error(`too many redirects: ${url}`));
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers: { 'user-agent': 'nexus-cos-testenv' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`download failed: HTTP ${res.statusCode} from ${url}`)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(dest + '.part');
      let got = 0, lastPct = -1;
      res.on('data', (c) => { got += c.length; hash.update(c); const pct = total ? Math.floor(got * 100 / total) : -1; if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; onProgress({ got, total, pct }); } });
      res.pipe(out);
      out.on('finish', () => { fs.renameSync(dest + '.part', dest); resolve({ bytes: got, sha256: hash.digest('hex') }); });
      out.on('error', reject); res.on('error', reject);
    });
    req.on('error', (e) => reject(new Error(`download failed: ${e.message} (${url}) — behind a proxy? download it yourself and pass --image-file`)));
  });
}

// ── QEMU install (Windows: winget) ──────────────────────────────────────────

function installQemu(say) {
  if (process.platform !== 'win32') return { ok: false, error: `install QEMU yourself: ${H.installHint()}` };
  say('installing QEMU with winget (SoftwareFreedomConservancy.QEMU)…');
  const r = spawnSync('winget', ['install', '--id', 'SoftwareFreedomConservancy.QEMU', '-e', '--accept-package-agreements', '--accept-source-agreements', '--silent'], { encoding: 'utf8', windowsHide: true, timeout: 20 * 60000 });
  if (r.error) return { ok: false, error: `winget not available (${r.error.message}) — install QEMU from https://qemu.weilnetz.de/w64/ and re-run` };
  const q = H.qemu({ refresh: true });
  return q.found ? { ok: true, qemu: q } : { ok: false, error: `winget finished (exit ${r.status}) but QEMU was not found: ${(r.stdout || '').trim().split('\n').slice(-3).join(' ')}` };
}

// ── the provisioning run ────────────────────────────────────────────────────

/**
 * provision(opts, onEvent) — opts:
 *   home, imageUrl, imageFile, extras ['go','ruby','php','rust'], node ('lts'|'22'), disk ('16G'),
 *   accel (null = best available), ramMB, installQemu (bool), bootTimeoutMs, provisionTimeoutMs,
 *   _qemu (qemu-runtime), _spawn, _ga, _seedHost (tests), _guestSeedHost ('10.0.2.2')
 */
async function provision(opts = {}, onEvent = () => {}) {
  const log = [];
  const say = (msg, extra = {}) => { const e = { at: Date.now(), msg, ...extra }; log.push(e); try { onEvent(e); } catch (_) {} };
  const env = opts.home ? { ...process.env, COS_TESTENV_HOME: opts.home } : process.env;
  const home = H.home(env);
  fs.mkdirSync(home, { recursive: true });
  const extras = (opts.extras || []).filter(e => EXTRA_PACKAGES[e]);
  const q = opts._qemu || _q();
  const GA = opts._ga || _ga();
  const _spawn = opts._spawn || spawn;

  // 1. QEMU
  let qm = opts._qemuBins || H.qemu({ env, refresh: true });
  if (!qm.found && opts.installQemu) { const r = installQemu(say); if (!r.ok) return { ok: false, error: r.error, log }; qm = r.qemu; }
  if (!qm.found) return { ok: false, error: `QEMU not found — ${H.installHint()} (or run setup-vm.bat, which does it)`, log };
  say(`QEMU: ${qm.system}`);

  // 2. image
  const cacheDir = path.join(home, 'download');
  fs.mkdirSync(cacheDir, { recursive: true });
  let src = opts.imageFile ? path.resolve(opts.imageFile) : null, srcInfo = { source: src };
  if (!src) {
    const url = opts.imageUrl || DEFAULT_IMAGE_URL;
    src = path.join(cacheDir, path.basename(new URL(url).pathname));
    if (fs.existsSync(src) && !opts.redownload) say(`using the downloaded image ${src}`);
    else {
      say(`downloading ${url}`);
      const d = await download(url, src, (p) => say(p.total ? `download ${p.pct}% (${Math.round(p.got / 1048576)} of ${Math.round(p.total / 1048576)} MB)` : `download ${Math.round(p.got / 1048576)} MB`, { phase: 'download', pct: p.pct }));
      srcInfo = { source: url, sha256: d.sha256, bytes: d.bytes };
    }
    srcInfo.source = srcInfo.source || url;
  }
  if (!fs.existsSync(src)) return { ok: false, error: `image not found: ${src}`, log };

  // 3. disk
  const fresh = path.join(home, 'base.new.qcow2');
  fs.rmSync(fresh, { force: true });
  const img = (args) => { const r = (opts._spawnSync || spawnSync)(qm.img, args, { encoding: 'utf8', windowsHide: true }); if (r.status !== 0) throw new Error(`qemu-img ${args[0]} failed: ${(r.stderr || r.error && r.error.message || '').trim()}`); return r.stdout; };
  say('preparing the disk');
  img(['convert', '-O', 'qcow2', src, fresh]);
  img(['resize', fresh, opts.disk || '16G']);

  // 4. seed
  let done = null, failedStep = null, ud = null;
  const instanceId = `cos-testenv-${Date.now().toString(36)}`;
  const guestHost = opts._guestSeedHost || '10.0.2.2';
  // the seed URL names the port, and the user-data names the seed URL: listen first, then write it
  const srv = await seedServer({
    getUserData: () => ud, instanceId, host: opts._seedHost || '127.0.0.1',
    onProgress: (t) => say(`guest: ${t}`, { phase: 'guest' }),
    onDone: (kv) => { done = kv; if (kv.status !== 'ok') failedStep = kv.step || 'unknown'; },
  });
  const seedUrl = `http://${guestHost}:${srv.address().port}/`;
  ud = userData({ node: opts.node || 'lts', extras, seedUrl });

  // 5. first boot — online, cloud-init does the work
  const stateDir = path.join(home, 'provision');
  fs.mkdirSync(stateDir, { recursive: true });
  const serialLog = path.join(stateDir, 'console.log');
  fs.rmSync(serialLog, { force: true });
  const bootArgs = (accel) => q.buildQemuArgs({ disk: fresh, iso: null, ramMB: opts.ramMB || 2048, cpus: opts.cpus || 2, cpu: 'max', network: 'nat', headless: true,
    accelerator: accel, machineType: 'q35', vmStateDir: stateDir, guestAgent: false, serialLog, smbiosSerial: `ds=nocloud-net;s=${seedUrl}` }, instanceId, 'provision');
  let built = bootArgs(opts.accel || null);
  const launch = (b) => {
    const p = _spawn(qm.system, b.args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    const box = { p, stderr: '', exit: null };
    if (p.stderr && p.stderr.on) p.stderr.on('data', d => { if (box.stderr.length < 20000) box.stderr += d; });
    box.exited = new Promise(r => p.on('exit', (code) => { box.exit = code; r(code); }));
    return box;
  };
  say(`first boot (accelerator ${built.accel}: ${built.accelReason}) — installing packages; this takes 3–15 minutes${built.accel === 'tcg' ? ', longer without hardware virtualisation' : ''}`);
  let box = launch(built);
  await Promise.race([box.exited, new Promise(r => setTimeout(r, opts._fastExitMs ?? 3000))]);
  if (box.exit !== null && built.accel !== 'tcg') {
    say(`the ${built.accel} accelerator did not start (${box.stderr.trim().split('\n').pop() || `exit ${box.exit}`}) — using TCG software emulation`);
    built = bootArgs('tcg'); box = launch(built);
  }
  // console tail while it works
  let seen = 0;
  const tail = setInterval(() => {
    try {
      const t = fs.readFileSync(serialLog, 'utf8');
      if (t.length > seen) {
        for (const l of t.slice(seen).split('\n').map(x => x.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()).filter(Boolean)) {
          if (/cloud-init|cos-testenv|Reached target|Setting up|Unpacking|Get:|error|fail/i.test(l)) say(`console: ${l.slice(0, 200)}`, { phase: 'console' });
        }
        seen = t.length;
      }
    } catch (_) {}
  }, 2000);
  const limit = opts.provisionTimeoutMs || 45 * 60000;
  const timedOut = await Promise.race([box.exited.then(() => false), new Promise(r => setTimeout(() => r(true), limit))]);
  clearInterval(tail);
  if (timedOut) { try { box.p.kill('SIGKILL'); } catch (_) {} }
  srv.close();
  const consoleTail = (() => { try { return fs.readFileSync(serialLog, 'utf8').split('\n').slice(-40).join('\n'); } catch (_) { return ''; } })();
  if (timedOut) return { ok: false, error: `provisioning did not finish within ${Math.round(limit / 60000)} minutes`, consoleTail, log };
  if (!done) return { ok: false, error: `the guest powered off without reporting (qemu exit ${box.exit}${box.stderr ? `: ${box.stderr.trim().slice(-300)}` : ''}) — see ${serialLog}`, consoleTail, log };
  if (failedStep) return { ok: false, error: `provisioning failed in the guest at: ${failedStep}`, consoleTail, log };
  say(`guest reported: node ${done.node}, python ${done.python3}, ${done.os}`);

  // 6. verification boot — exactly how a test run boots: overlay, no network, guest agent
  say('verifying: booting the image the way a test run does (no network, guest agent)');
  const vdir = path.join(home, 'verify');
  const overlay = path.join(vdir, 'overlay.qcow2');
  q.ensureEphemeralOverlay(fresh, overlay);
  const vb = q.buildQemuArgs({ disk: overlay, ramMB: 1024, cpus: 2, cpu: 'max', network: 'none', headless: true, accelerator: built.accel, machineType: 'q35', vmStateDir: vdir, guestAgent: true }, `${instanceId}-verify`, 'verify');
  const vbox = launch(vb);
  let verified = null, verifyError = null;
  try {
    const agent = await GA.connectWhenReady(vb.qga, { timeoutMs: opts.bootTimeoutMs || 300000 });
    const r = await agent.run('/bin/sh', ['-c', 'export PATH=/usr/local/bin:/usr/bin:/bin; node -e "console.log(process.version)" && python3 -c "print(1+1)"'], { timeoutMs: 60000 });
    verified = r.exitCode === 0 ? r.stdout.trim().split('\n') : null;
    if (!verified) verifyError = `node/python3 did not run in the guest: ${r.stderr.trim() || `exit ${r.exitCode}`}`;
    try { await agent.execute('guest-shutdown', undefined, { timeoutMs: 2000 }); } catch (_) {}
    agent.close();
  } catch (e) { verifyError = e.message; }
  try { vbox.p.kill('SIGKILL'); } catch (_) {}
  await Promise.race([vbox.exited, new Promise(r => setTimeout(r, 3000))]);
  try { q.discardOverlay(overlay); } catch (_) {}
  if (verifyError) return { ok: false, error: `the image was built but did not pass verification: ${verifyError}`, image: fresh, log };
  say(`verified: ${verified.join(' · ')}`);

  // 7. promote (keep the previous base — §0.3)
  const base = path.join(home, 'base.qcow2');
  if (fs.existsSync(base)) { fs.rmSync(path.join(home, 'base.prev.qcow2'), { force: true }); fs.renameSync(base, path.join(home, 'base.prev.qcow2')); }
  fs.renameSync(fresh, base);
  const runtimes = {};
  for (const k of ['node', 'npm', 'python3', 'pip', 'git', 'make', 'gcc', 'go', 'ruby', 'php', 'cargo']) if (done[k]) runtimes[k] = done[k];
  if (runtimes.gcc) runtimes.sh = 'dash';
  const manifest = { image: 'base.qcow2', createdAt: new Date().toISOString(), by: 'nexus cos/testenv/provision.js', source: srcInfo, os: done.os, kernel: done.kernel,
                     guestAgent: done.qga || true, runtimes, extras, accel: built.accel, share: 'disk', userDataSha256: crypto.createHash('sha256').update(ud).digest('hex') };
  const mp = H.writeManifest(manifest, env);
  say(`ready: ${base}`);
  return { ok: true, image: base, manifestPath: mp, manifest, log };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function _args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    const key = m[1].replace(/-(\w)/g, (_x, c) => c.toUpperCase());
    const val = m[2] !== undefined ? m[2] : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    o[key] = val;
  }
  return o;
}

async function main() {
  const a = _args(process.argv.slice(2));
  const json = !!a.json;
  const out = (e) => { if (json) process.stdout.write(JSON.stringify(e) + '\n'); else console.log(`[cos-testenv] ${e.msg}`); };
  if (a.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 36).join('\n').replace(/^ \* ?/gm, '')); return; }
  if (a.status) {
    const caps = require('./index.js').capabilities();
    const m = H.readManifest(a.home ? { ...process.env, COS_TESTENV_HOME: a.home } : process.env);
    console.log(JSON.stringify({ home: H.home(), vm: caps.vm, manifest: m }, null, 2));
    process.exitCode = caps.vm.ok ? 0 : 1; return;
  }
  const r = await provision({
    home: a.home || null, imageUrl: a.imageUrl || null, imageFile: a.imageFile || null,
    extras: a.with ? String(a.with).split(',').map(s => s.trim()) : [], node: a.node ? String(a.node) : 'lts',
    disk: a.disk || '16G', accel: a.accel || null, installQemu: !!a.installQemu, redownload: !!a.redownload,
  }, out);
  if (json) process.stdout.write(JSON.stringify({ result: { ok: r.ok, error: r.error || null, image: r.image || null, manifest: r.manifest || null, consoleTail: r.consoleTail || null } }) + '\n');
  else if (r.ok) console.log(`\nThe test VM is ready. Idearium's COS run menu now offers "Run all tests in a VM".\n  image:    ${r.image}\n  manifest: ${r.manifestPath}`);
  else { console.error(`\nSetup failed: ${r.error}`); if (r.consoleTail) console.error(`\nlast console lines:\n${r.consoleTail}`); }
  process.exitCode = r.ok ? 0 : 1;
}

if (require.main === module) main().catch(e => { console.error(`[cos-testenv] crashed: ${e.stack || e.message}`); process.exit(1); });

module.exports = { provision, userData, provisionScript, seedServer, download, installQemu, DEFAULT_IMAGE_URL, EXTRA_PACKAGES };
