'use strict';
/**
 * cos/testenv/host.js — where the test VM's pieces live on this machine.
 * comp_id: nexus.cos.testenv.host
 * Status: pre-release · §0.39.264
 *
 * Two things the VM backend needs from the host, found the same way by the
 * run menu, the setup script and the runner:
 *
 *   QEMU      qemu-system-x86_64 + qemu-img. Looked for in COS_QEMU_DIR, then
 *             PATH, then the default install folders (a fresh `winget install
 *             QEMU` lands in C:\Program Files\qemu but does NOT touch the PATH
 *             of an already-running Nexus, so PATH alone would miss it).
 *
 *   the base  a Linux guest image made by cos/testenv/provision.js, recorded in
 *             <home>/base.json with what it has (node, python3, …). The image
 *             is COS_TESTENV_BASE_IMAGE when that is set (an image you built
 *             yourself), else the manifest's.
 *
 *   home      COS_TESTENV_HOME, else %LOCALAPPDATA%\nexus\cos-testenv on
 *             Windows, ~/Library/Caches/nexus/cos-testenv on macOS, and
 *             $XDG_CACHE_HOME (or ~/.cache)/nexus/cos-testenv elsewhere.
 *             Outside the Nexus tree on purpose: a base image is 1–3 GB and is
 *             not part of any repo.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WIN = process.platform === 'win32';
const EXE = WIN ? '.exe' : '';

function home(env = process.env) {
  if (env.COS_TESTENV_HOME) return path.resolve(env.COS_TESTENV_HOME);
  if (WIN) return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'nexus', 'cos-testenv');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'nexus', 'cos-testenv');
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'nexus', 'cos-testenv');
}

function _candidates(env) {
  const dirs = [];
  if (env.COS_QEMU_DIR) dirs.push(env.COS_QEMU_DIR);
  dirs.push(null);                                    // PATH
  if (WIN) {
    for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], 'C:\\Program Files', env.ChocolateyInstall && path.join(env.ChocolateyInstall, 'bin'), env.USERPROFILE && path.join(env.USERPROFILE, 'scoop', 'apps', 'qemu', 'current')].filter(Boolean)) {
      dirs.push(/qemu|bin|current/i.test(base) ? base : path.join(base, 'qemu'));
    }
  } else if (process.platform === 'darwin') dirs.push('/opt/homebrew/bin', '/usr/local/bin');
  else dirs.push('/usr/bin', '/usr/local/bin');
  return [...new Set(dirs)];
}

function _works(bin) { try { execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 8000, windowsHide: true }); return true; } catch (_) { return false; } }

let _cache = null;
/** qemu({ env, refresh, _probe }) -> { system, img, dir, found } — absolute paths when found */
function qemu({ env = process.env, refresh = false, _probe = _works } = {}) {
  if (_cache && !refresh && _probe === _works) return _cache;
  const out = { system: null, img: null, dir: null, found: false };
  for (const d of _candidates(env)) {
    const sys = d ? path.join(d, `qemu-system-x86_64${EXE}`) : `qemu-system-x86_64${EXE}`;
    const img = d ? path.join(d, `qemu-img${EXE}`) : `qemu-img${EXE}`;
    if (d && !fs.existsSync(sys)) continue;
    if (_probe(sys) && _probe(img)) { Object.assign(out, { system: sys, img, dir: d, found: true }); break; }
  }
  if (_probe === _works) _cache = out;
  return out;
}

const MANIFEST = 'base.json';

/** base({ env }) -> { image, manifest, source } | { image:null, reason } */
function base({ env = process.env, baseImage = null } = {}) {
  if (baseImage) return { image: path.resolve(baseImage), manifest: null, source: 'argument' };
  if (env.COS_TESTENV_BASE_IMAGE) return { image: path.resolve(env.COS_TESTENV_BASE_IMAGE), manifest: readManifest(env), source: 'COS_TESTENV_BASE_IMAGE' };
  const m = readManifest(env);
  if (m && m.image) return { image: path.isAbsolute(m.image) ? m.image : path.join(home(env), m.image), manifest: m, source: path.join(home(env), MANIFEST) };
  return { image: null, manifest: null, source: null, reason: `no base image — run the setup (cos/testenv/setup-vm.bat on Windows, or node cos/testenv/provision.js), or set COS_TESTENV_BASE_IMAGE` };
}

function readManifest(env = process.env) {
  try { return JSON.parse(fs.readFileSync(path.join(home(env), MANIFEST), 'utf8')); } catch (_) { return null; }
}
function writeManifest(m, env = process.env) {
  fs.mkdirSync(home(env), { recursive: true });
  const p = path.join(home(env), MANIFEST);
  fs.writeFileSync(p + '.tmp', JSON.stringify(m, null, 2));
  fs.renameSync(p + '.tmp', p);
  return p;
}

/** the command that installs QEMU on this host, for messages and the setup script */
function installHint() {
  if (WIN) return 'winget install --id SoftwareFreedomConservancy.QEMU -e   (then enable "Windows Hypervisor Platform" for speed: optional)';
  if (process.platform === 'darwin') return 'brew install qemu';
  return 'sudo apt install qemu-system-x86 qemu-utils   (or: sudo dnf install qemu-system-x86 qemu-img)';
}

module.exports = { home, qemu, base, readManifest, writeManifest, installHint, MANIFEST };
