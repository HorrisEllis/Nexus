'use strict';
/**
 * cos/manager/cloudflared.js — find cloudflared, or fetch it (cos/spec/network.spec MOD-NET-CFD-BIN, 2026-11-03).
 *
 * James, 2026-11-03: "can you get cloudflared working in cos. the settings in the network settings." · "cos ui"
 * The tunnel needs Cloudflare's own program, which COS does not ship. find() says where it is, or that it is not and where it looked.
 * install() downloads the release asset for this machine from github.com/cloudflare/cloudflared, checks its SHA-256 against the one
 * Cloudflare publishes in that release's notes (NO checksum, or a different one → refused, nothing kept), puts it in COS's own folder
 * (<COS_MANAGER_DATA>/bin) and runs `--version` on it to prove it starts. Same discipline as clear-glass/src/net/installer.js; the
 * limit is the same too, said plainly: the checksum comes from the same host as the file, so it proves the download is whole, not that
 * GitHub or Cloudflare is trustworthy. Everything impure is injected (fetch, fs, spawn, env, platform, arch) so the tests run it dry.
 *
 *   find({ env, platform, fs, dataDir }) → { found, path?, from?, searched[] }
 *   assetFor(platform, arch) → 'cloudflared-windows-amd64.exe' | … | null (macOS ships a .tgz: not unpacked here, said)
 *   parseChecksums(text) → { '<asset name>': '<sha256>' }
 *   createInstaller(deps).install({ force, onProgress }) → { ok:true, action, path, version, verified } | { ok:false, error }
 */
const fs0 = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const LIMIT = 120 * 1024 * 1024;
const API_LATEST = 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest';
const PAGE_LATEST = 'https://github.com/cloudflare/cloudflared/releases/latest';
const DL = (tag, asset) => `https://github.com/cloudflare/cloudflared/releases/download/${tag}/${asset}`;
const UA = { 'User-Agent': 'nexus-cos', Accept: 'application/vnd.github+json' };

const dataDir = (env = process.env) => env.COS_MANAGER_DATA || path.join(__dirname, '..', 'data', 'manager');
const exe = (platform) => (platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

function assetFor(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return { x64: 'cloudflared-windows-amd64.exe', arm64: 'cloudflared-windows-amd64.exe', ia32: 'cloudflared-windows-386.exe' }[arch] || null;   // Windows on ARM runs the x64 build under emulation
  if (platform === 'linux') return { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64', ia32: 'cloudflared-linux-386', arm: 'cloudflared-linux-arm' }[arch] || null;
  return null;
}

/** parseChecksums(text) — the release notes list `cloudflared-linux-amd64: <64 hex>` per asset; the page version has tags between, stripped first. */
function parseChecksums(text) {
  const out = {}; const t = String(text || '').replace(/<[^>]*>/g, ' ').replace(/&#?\w+;/g, ' ');
  for (const m of t.matchAll(/(cloudflared[A-Za-z0-9._-]*)\s*[:=]?\s*`?([0-9a-fA-F]{64})\b/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function candidates({ env = process.env, platform = process.platform, dir = dataDir(env) } = {}) {
  const out = [];
  if (env.COS_CLOUDFLARED) out.push({ path: env.COS_CLOUDFLARED, from: 'COS_CLOUDFLARED' });
  out.push({ path: path.join(dir, 'bin', exe(platform)), from: 'COS’s own folder' });
  const sep = platform === 'win32' ? ';' : ':'; const pj = platform === 'win32' ? path.win32.join : path.join;
  for (const d of String(env.PATH || env.Path || '').split(sep).filter(Boolean)) out.push({ path: pj(d, exe(platform)), from: 'PATH' });
  if (platform === 'win32') for (const base of [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean)) out.push({ path: path.win32.join(base, 'cloudflared', 'cloudflared.exe'), from: 'the Windows installer’s folder' });
  if (platform === 'darwin') for (const d of ['/opt/homebrew/bin', '/usr/local/bin']) out.push({ path: path.join(d, 'cloudflared'), from: 'Homebrew' });
  return out;
}

function find(deps = {}) {
  const fs = deps.fs || fs0; const searched = [];
  for (const c of candidates(deps)) {
    searched.push(c.path);
    try { if (fs.statSync(c.path).isFile()) return { found: true, path: c.path, from: c.from, searched }; } catch (_) { /* not there */ }
  }
  return { found: false, searched };
}

/** runnable(bin) → [command, leading args]: a script stand-in (a .js file, or a file whose first line is a node #!) is run by Node, so it
 * starts on Windows too (2026-11-24: the tests' fake could not be spawned there, EFTYPE); the real cloudflared runs as itself. */
function runnable(bin) {
  if (/.(c|m)?js$/i.test(bin)) return [process.execPath, [bin]];
  if (process.platform === 'win32' && !/.(exe|com|bat|cmd)$/i.test(bin)) { try { const head = require('fs').readFileSync(bin, { encoding: 'utf8', flag: 'r' }).slice(0, 80); if (/^#!.*node/.test(head)) return [process.execPath, [bin]]; } catch (_) { /* not readable: run it as it is */ } }
  return [bin, []];
}

/** version(path) → 'cloudflared version 2026.10.7 …' or throws: the program is run once, to prove it starts. */
function version(binPath, { spawnSync = cp.spawnSync } = {}) {
  const [cmd, pre] = runnable(binPath); const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (r.error) throw new Error(`${binPath} would not start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${binPath} --version exited ${r.status}: ${String(r.stderr || r.stdout || '').trim().slice(0, 200)}`);
  const out = String(r.stdout || '').trim(); const m = /(\d{4}\.\d+\.\d+)/.exec(out);
  return { text: out.split(/\r?\n/)[0], version: m ? m[1] : null };
}

function createInstaller(d = {}) {
  const deps = { fetch: globalThis.fetch, fs: fs0, spawnSync: cp.spawnSync, env: process.env, platform: process.platform, arch: process.arch, now: Date.now, ...d };
  let job = { running: false, phase: 'idle', pct: 0, message: '' };
  const say = (phase, pct, message, running = true) => { job = { running, phase, pct, message }; try { if (deps.onProgress) deps.onProgress(job); } catch (_) { /* a listener's fault */ } };

  async function releaseInfo() {
    const errs = [];
    try {   // the API gives the tag, the notes and the assets as JSON
      const r = await deps.fetch(API_LATEST, { headers: UA }); if (!r.ok) throw new Error(`${API_LATEST} answered ${r.status}`);
      const j = await r.json(); const tag = j && j.tag_name; if (!tag) throw new Error('the release named no tag');
      return { tag, sums: parseChecksums(j.body) };
    } catch (e) { errs.push(e.message); }
    try {   // the API is rate-limited for anonymous callers; the release page carries the same notes
      const r = await deps.fetch(PAGE_LATEST, { headers: { 'User-Agent': UA['User-Agent'] }, redirect: 'follow' }); if (!r.ok) throw new Error(`${PAGE_LATEST} answered ${r.status}`);
      const tag = (/\/releases\/tag\/([^/?#]+)/.exec(r.url || '') || [])[1]; if (!tag) throw new Error('the release page did not say which release it is');
      return { tag, sums: parseChecksums(await r.text()) };
    } catch (e) { errs.push(e.message); }
    throw new Error(`could not read the latest cloudflared release (${errs.join('; ')})`);
  }

  async function download(url, part) {
    const res = await deps.fetch(url, { headers: { 'User-Agent': UA['User-Agent'] }, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`${url} answered ${res.status}`);
    const total = Number(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
    if (total > LIMIT) throw new Error(`the file announces ${(total / 1048576).toFixed(0)} MB, over the ${(LIMIT / 1048576).toFixed(0)} MB limit: not downloaded`);
    const hash = crypto.createHash('sha256'); let bytes = 0; const out = deps.fs.createWriteStream(part);
    try {
      for await (const chunk of res.body) {
        bytes += chunk.length; if (bytes > LIMIT) throw new Error(`more than ${(LIMIT / 1048576).toFixed(0)} MB arrived`);
        hash.update(chunk); if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
        say('downloading', 10 + Math.round(70 * (total ? Math.min(1, bytes / total) : Math.min(0.9, bytes / (40 * 1048576)))), `Downloading — ${(bytes / 1048576).toFixed(1)}${total ? ` of ${(total / 1048576).toFixed(1)}` : ''} MB`);
      }
      await new Promise((ok, no) => { out.once('close', ok); out.once('error', no); out.end(); });   // 'close', not 'finish': the handle must be shut before the file is renamed and run (ETXTBSY on Linux, EBUSY/EPERM on Windows)
    } catch (e) { out.destroy(); try { deps.fs.unlinkSync(part); } catch (_) { /* nothing written */ } throw new Error(`download stopped: ${e.message}. The partial file was removed.`); }
    return { sha256: hash.digest('hex'), bytes };
  }

  /** install({ force }) → never throws; a failed install leaves nothing half-made and an existing install untouched. */
  async function install({ force = false } = {}) {
    if (job.running) return { ok: false, error: 'an install is already running' };
    const { fs, platform, arch } = deps; const asset = assetFor(platform, arch); let part = null;
    const fail = (error) => { say('failed', 0, error, false); return { ok: false, error }; };
    if (!asset) return fail(platform === 'darwin' ? 'cloudflared is a .tgz on macOS, which COS does not unpack: run `brew install cloudflared`, then Detect' : `no cloudflared download is published for ${platform}/${arch}`);
    if (typeof deps.fetch !== 'function') return fail('no fetch available');
    const dir = path.join(dataDir(deps.env), 'bin'); const dest = path.join(dir, exe(platform));
    try {
      const have = find({ env: deps.env, platform, fs, dir: path.dirname(dir) });
      if (have.found && have.from === 'COS’s own folder' && !force) { say('done', 100, `cloudflared is already in COS's folder (${have.path})`, false); return { ok: true, action: 'kept', path: have.path, ...safeVersion(have.path) }; }
      fs.mkdirSync(dir, { recursive: true });
      say('resolving', 3, 'Finding the current cloudflared release…');
      const rel = await releaseInfo(); const want = rel.sums[asset];
      if (!want) throw new Error(`the ${rel.tag} release notes do not list a SHA-256 for ${asset}, so the download would not be trusted. Nothing was installed.`);
      part = `${dest}.${deps.now()}.part`;
      say('downloading', 10, `Downloading ${asset} ${rel.tag}…`);
      const dl = await download(DL(rel.tag, asset), part);
      say('verifying', 85, 'Checking the download against the published checksum…');
      if (dl.sha256 !== want) throw new Error(`checksum mismatch for ${asset} ${rel.tag}: published ${want}, downloaded ${dl.sha256}. The download was deleted and nothing was installed.`);
      if (platform !== 'win32') fs.chmodSync(part, 0o755);
      say('installing', 92, 'Putting it in place and starting it once…');
      try { fs.renameSync(part, dest); } catch (e) { throw new Error(`could not put cloudflared at ${dest} (${e.code || e.message}); if a tunnel is running, stop it first`); }
      part = null;
      const v = version(dest, { spawnSync: deps.spawnSync });
      say('done', 100, `Installed ${v.text}`, false);
      return { ok: true, action: 'installed', path: dest, tag: rel.tag, verified: true, sha256: dl.sha256, version: v.version, text: v.text };
    } catch (e) {
      if (part) try { fs.unlinkSync(part); } catch (_) { /* never written */ }
      return fail(e.message);
    }
  }
  function safeVersion(p) { try { const v = version(p, { spawnSync: deps.spawnSync }); return { version: v.version, text: v.text }; } catch (e) { return { version: null, text: e.message }; } }

  return { install, status: () => ({ ...job }) };
}

module.exports = { find, candidates, runnable, assetFor, parseChecksums, version, createInstaller, dataDir, MODULE_ID: 'cos.manager.cloudflared', VERSION: '1.0.0' };
