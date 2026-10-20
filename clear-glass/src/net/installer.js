'use strict';
/**
 * clear-glass/src/net/installer.js — one-button setup for the Tor·Snowflake transport (0.60.168). Everything impure is injected.
 * comp_id: cg.net.installer
 *
 * James, 2026-10-19: "can you make a setup for the files needed for snowflake to set it up automatically with a setup button.
 * fully automatic download and install then restart". The transport (transport-host.js, NP1) needs two programs it does not ship —
 * `tor` and a Snowflake client — and a bridge line. The Tor Project publishes both programs together as the "Tor Expert Bundle"
 * (tor + pluggable_transports/snowflake-client, per platform). This downloads that bundle, checks it, unpacks it into its own folder and
 * reports where the two programs are (the Snowflake one is snowflake-client in older bundles, lyrebird in current ones) and which Snowflake bridge line(s) the bundle itself carries. service.js (setup) then points the
 * transport at them and restarts it.
 *
 * Steps (each one reported through onProgress({ phase, pct, message })):
 *   resolving   the newest STABLE Tor Browser version (aus1 downloads.json; the dist directory listing if that fails)
 *   downloading tor-expert-bundle-<platform>-<version>.tar.gz from dist.torproject.org (archive.torproject.org as the second mirror),
 *               streamed to a .part file, size-capped, hashed as it arrives
 *   verifying   the SHA-256 against the sha256sums file the Tor Project publishes beside it. NO checksum → refused (allowUnverified overrides)
 *   extracting  a small tar reader of our own (no system `tar`, none on older Windows): path-traversal and size/entry-count guards,
 *               symlinks created last and only if they stay inside the folder
 *   locating    tor(.exe) and snowflake-client(.exe) inside what was unpacked; pt_config.json's Snowflake bridge line(s)
 * The folder is built under a temp name and renamed into place LAST, so a half-finished install is never seen as an install.
 *
 * Limits, said plainly (the same honesty as releases/deliver.js): the checksum comes from the same host as the file, so it proves the
 * download is intact, not that the Tor Project's server is trustworthy. The Tor Project also signs its checksums with GPG; this does not
 * check that signature (no gpg is assumed on a person's machine). Nothing here is verified against the live network by the test suite —
 * the tests drive a fake fetch and a real tar.gz built in memory.
 */
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { cmpVer } = require('../releases/deliver.js');

const gunzip = promisify(zlib.gunzip);

const LIMITS = { maxDownload: 250 * 1024 * 1024, maxUnpacked: 700 * 1024 * 1024, maxEntries: 8000, maxDepth: 8 };
const DIST = ['https://dist.torproject.org/torbrowser', 'https://archive.torproject.org/tor-package-archive/torbrowser'];
const VERSION_JSON = 'https://aus1.torproject.org/torbrowser/update_3/release/downloads.json';
const SUMS_NAMES = ['sha256sums-signed-build.txt', 'sha256sums-unsigned-build.txt'];
const STABLE = /^\d+\.\d+(?:\.\d+)?$/;
const UA = { 'User-Agent': 'nexus-clear-glass' };

/** platformToken(platform, arch) → the Tor Project's name for it ('linux-x86_64', 'macos-aarch64', 'windows-x86_64' …) or null. */
function platformToken(platform = process.platform, arch = process.arch) {
  const os = { win32: 'windows', darwin: 'macos', linux: 'linux' }[platform]; if (!os) return null;
  const cpu = { x64: 'x86_64', ia32: 'i686', arm64: os === 'windows' ? 'x86_64' : 'aarch64' }[arch];   // Windows on ARM runs the x86_64 build under emulation
  return cpu ? `${os}-${cpu}` : null;
}
const exeName = (n, platform) => (platform === 'win32' ? `${n}.exe` : n);

// ── tar ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const oct = (b, s, e) => { const t = b.toString('latin1', s, e).replace(/\0.*$/s, '').trim(); return t ? parseInt(t, 8) : 0; };
const str = (b, s, e) => b.toString('utf8', s, e).replace(/\0.*$/s, '');
function paxRecords(buf) {
  const out = {}; let i = 0;
  while (i < buf.length) {
    const sp = buf.indexOf(0x20, i); if (sp < 0) break; const len = parseInt(buf.toString('latin1', i, sp), 10); if (!(len > 0)) break;
    const rec = buf.toString('utf8', sp + 1, i + len).replace(/\n$/, ''); const eq = rec.indexOf('='); if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/** inside(root, rel) → the absolute path rel names under root, or null if it would land outside (.., absolute, drive letter). */
function inside(root, rel) {
  if (!rel || /^([a-zA-Z]:|[\\/])/.test(rel) || rel.includes('\0')) return null;
  const abs = path.resolve(root, rel.split('\\').join('/')); const r = path.resolve(root);
  return abs === r || abs.startsWith(r + path.sep) ? abs : null;
}

/**
 * untar(buf, root, { fs, limits, platform }) → { files, dirs, links, bytes, skipped:[] }  (buf is the already-gunzipped tar). Throws on a hostile archive.
 * Handles ustar, GNU long names (L) and pax path/linkpath/size (x). Symlinks are made last; where one cannot be (Windows without the privilege) the
 * file it points at is copied instead, so the folder works either way.
 */
function untar(buf, root, { fs, limits = LIMITS, platform = process.platform } = {}) {
  const res = { files: 0, dirs: 0, links: 0, bytes: 0, skipped: [] }; const links = []; const hard = [];
  let off = 0, longName = null, longLink = null, pax = {};
  fs.mkdirSync(root, { recursive: true });
  while (off + 512 <= buf.length) {
    const hdr = buf.subarray(off, off + 512); if (hdr.every(x => x === 0)) break;
    const sum = oct(hdr, 148, 156); let calc = 0; for (let i = 0; i < 512; i++) calc += (i >= 148 && i < 156) ? 32 : hdr[i];
    if (calc !== sum) throw new Error('the archive is damaged (a tar header checksum does not match)');
    const type = String.fromCharCode(hdr[156] || 0x30);
    let size = oct(hdr, 124, 136); if (hdr[124] & 0x80) throw new Error('the archive uses a size encoding this reader does not support');
    if (pax.size) size = parseInt(pax.size, 10);
    const dataStart = off + 512; const dataEnd = dataStart + size; if (dataEnd > buf.length) throw new Error('the archive is cut short');
    const data = buf.subarray(dataStart, dataEnd); off = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = str(data, 0, data.length); continue; }
    if (type === 'K') { longLink = str(data, 0, data.length); continue; }
    if (type === 'x') { pax = { ...pax, ...paxRecords(data) }; continue; }
    if (type === 'g') continue;
    const pre = str(hdr, 345, 500); let name = pax.path || longName || (pre ? `${pre}/${str(hdr, 0, 100)}` : str(hdr, 0, 100));
    const link = pax.linkpath || longLink || str(hdr, 157, 257); const mode = oct(hdr, 100, 108);
    longName = longLink = null; pax = {};
    if (++res.files + res.dirs + res.links > limits.maxEntries) throw new Error(`the archive has more than ${limits.maxEntries} entries`);
    name = name.replace(/^\.\//, '').replace(/\/$/, ''); if (!name || name === '.') { res.files--; continue; }
    if (name.split('/').length > limits.maxDepth + 4) throw new Error(`"${name.slice(0, 80)}" is nested too deep`);
    const dest = inside(root, name); if (!dest) throw new Error(`the archive tries to write outside its folder ("${name.slice(0, 80)}")`);
    if (type === '5') { res.files--; res.dirs++; fs.mkdirSync(dest, { recursive: true }); continue; }
    if (type === '0' || type === '\0' || type === '7') {
      res.bytes += size; if (res.bytes > limits.maxUnpacked) throw new Error(`the archive unpacks to more than ${(limits.maxUnpacked / 1048576).toFixed(0)} MB`);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data);
      try { fs.chmodSync(dest, mode & 0o111 ? 0o755 : 0o644); } catch (_) { /* a filesystem without modes */ }
      continue;
    }
    res.files--;
    if (type === '2') { const t = inside(path.dirname(dest), link); if (!t || !inside(root, path.relative(root, t))) throw new Error(`a link in the archive points outside its folder ("${name.slice(0, 60)}")`); links.push({ dest, target: t }); continue; }
    if (type === '1') { const t = inside(root, link.replace(/^\.\//, '')); if (!t) throw new Error(`a hard link in the archive points outside its folder ("${name.slice(0, 60)}")`); hard.push({ dest, target: t }); continue; }
    res.skipped.push(`${name} (type ${JSON.stringify(type)})`);
  }
  const place = ({ dest, target }) => {
    try { if (fs.existsSync(dest)) return; fs.mkdirSync(path.dirname(dest), { recursive: true }); }
    catch (_) { return; }
    try { if (platform === 'win32') throw new Error('copy'); fs.symlinkSync(path.relative(path.dirname(dest), target), dest); res.links++; return; } catch (_) { /* fall through to a copy */ }
    try { fs.copyFileSync(target, dest); try { fs.chmodSync(dest, fs.statSync(target).mode & 0o777); } catch (_) {} res.links++; } catch (e) { res.skipped.push(`${path.relative(root, dest)} (link: ${e.message})`); }
  };
  hard.forEach(place); links.forEach(place);
  return res;
}

// ── finding things in what was unpacked ──────────────────────────────────────────────────────────────────────────────────────────
function walk(fs, root, visit, depth = 0, maxDepth = LIMITS.maxDepth) {
  let ents; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) { const p = path.join(root, e.name); if (e.isDirectory()) { if (depth < maxDepth) walk(fs, p, visit, depth + 1, maxDepth); } else visit(p, e.name); }
}
/** findFile(fs, root, name) → the shortest path to a file called `name` under root, or null. */
function findFile(fs, root, name) {
  let best = null; walk(fs, root, (p, n) => { if (n === name && (!best || p.length < best.length)) best = p; });
  return best;
}
/** bridgeLines(text) → every Snowflake bridge line in a pt_config.json (found wherever the JSON keeps them — the shape has changed between releases). */
function bridgeLines(text) {
  let j; try { j = JSON.parse(text); } catch (_) { return []; }
  const out = []; const seen = new Set();
  const go = (v, d = 0) => {
    if (d > 8 || v === null || v === undefined) return;
    if (typeof v === 'string') { const s = v.trim(); if (/^(Bridge\s+)?snowflake\s+\S+/i.test(s) && !/\bClientTransportPlugin\b/i.test(s) && !seen.has(s)) { seen.add(s); out.push(s.replace(/^Bridge\s+/i, '')); } return; }
    if (Array.isArray(v)) v.forEach(x => go(x, d + 1)); else if (typeof v === 'object') Object.values(v).forEach(x => go(x, d + 1));
  };
  go(j); return out;
}

// ── the installer ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
class TorInstaller {
  /**
   * @param {object} d  fetch(url, opts)->Response, fs, dir (the folder installs go in), platform, arch, now, mirrors, versionUrl, limits, tmpName()
   */
  constructor(d = {}) {
    this.d = { fetch: globalThis.fetch, platform: process.platform, arch: process.arch, now: Date.now, mirrors: DIST, versionUrl: VERSION_JSON, limits: LIMITS, ...d };
  }
  get _fs() { return this.d.fs; }
  _installedFile() { return path.join(this.d.dir, 'installed.json'); }

  /** current() → what is installed and still intact, or null. */
  current() {
    const fs = this._fs; let rec; try { rec = JSON.parse(fs.readFileSync(this._installedFile(), 'utf8')); } catch (_) { return null; }
    if (!rec || !rec.torPath || !rec.snowflakePath) return null;
    for (const p of [rec.torPath, rec.snowflakePath]) { try { if (!fs.statSync(p).isFile()) return null; } catch (_) { return null; } }
    return rec;
  }

  async _get(url, as = 'text') {
    const r = await this.d.fetch(url, { headers: UA, redirect: 'follow' });
    if (!r.ok) throw new Error(`${url} answered ${r.status}`);
    return as === 'json' ? r.json() : r.text();
  }
  async _first(urls, as) {
    const errs = []; for (const u of urls) { try { return { url: u, body: await this._get(u, as) }; } catch (e) { errs.push(e.message); } }
    throw new Error(errs.join('; '));
  }

  /** latestVersion() → '14.0.4' — the newest stable Tor Browser version. */
  async latestVersion() {
    const errs = [];
    try { const j = await this._get(this.d.versionUrl, 'json'); const v = String((j && (j.version || j.latest)) || ''); if (STABLE.test(v)) return v; errs.push(`${this.d.versionUrl} named no stable version`); }
    catch (e) { errs.push(e.message); }
    try {
      const { body } = await this._first(this.d.mirrors.map(m => `${m}/`), 'text');
      const vs = [...body.matchAll(/href="(\d+\.\d+(?:\.\d+)?)\/"/g)].map(m => m[1]).filter(v => STABLE.test(v)).sort(cmpVer);
      if (vs.length) return vs[vs.length - 1];
      errs.push('the dist listing named no stable version');
    } catch (e) { errs.push(e.message); }
    throw new Error(`could not find out the current Tor version (${errs.join('; ')})`);
  }

  async _expectedSum(version, name) {
    const urls = []; for (const m of this.d.mirrors) for (const s of SUMS_NAMES) urls.push(`${m}/${version}/${s}`);
    let body; try { ({ body } = await this._first(urls, 'text')); } catch (e) { return { sum: null, why: `no checksum file could be read (${e.message})` }; }
    for (const line of body.split(/\r?\n/)) { const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim()); if (m && path.basename(m[2]) === name) return { sum: m[1].toLowerCase() }; }
    return { sum: null, why: `the checksum file does not list ${name}` };
  }

  async _download(version, name, part, onProgress) {
    const { fs, limits } = this.d; let lastErr = 'no mirror answered';
    for (const m of this.d.mirrors) {
      const url = `${m}/${version}/${name}`; let res;
      try { res = await this.d.fetch(url, { headers: UA, redirect: 'follow' }); } catch (e) { lastErr = `${url}: ${e.message}`; continue; }
      if (!res.ok || !res.body) { lastErr = `${url} answered ${res.status}`; continue; }
      const total = Number(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
      if (total > limits.maxDownload) throw new Error(`${name} announces ${(total / 1048576).toFixed(0)} MB, over the ${(limits.maxDownload / 1048576).toFixed(0)} MB limit: not downloaded`);
      const hash = crypto.createHash('sha256'); let bytes = 0; const out = fs.createWriteStream(part);
      try {
        for await (const chunk of res.body) {
          bytes += chunk.length; if (bytes > limits.maxDownload) throw new Error(`more than ${(limits.maxDownload / 1048576).toFixed(0)} MB arrived`);
          hash.update(chunk); if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
          if (onProgress) onProgress(bytes, total);
        }
        await new Promise((ok, no) => { out.once('finish', ok); out.once('error', no); out.end(); });
      } catch (e) { out.destroy(); try { fs.unlinkSync(part); } catch (_) {} throw new Error(`download stopped: ${e.message}. The partial file was removed.`); }
      return { sha256: hash.digest('hex'), bytes, url };
    }
    throw new Error(`could not download ${name} (${lastErr})`);
  }

  /**
   * install({ force, allowUnverified, onProgress }) →
   *   { ok:true, action:'installed'|'kept', version, platform, torPath, snowflakePath, bridgeLines:[], verified, source }  |  { ok:false, error }
   * Never throws; a failed install leaves nothing half-made (the .part file and the temp folder are removed) and an existing install untouched.
   */
  async install({ force = false, allowUnverified = false, onProgress = () => {} } = {}) {
    const { fs, dir, platform, arch } = this.d; const say = (phase, pct, message) => { try { onProgress({ phase, pct, message }); } catch (_) {} };
    const plat = platformToken(platform, arch);
    if (!plat) return { ok: false, error: `no Tor Expert Bundle is published for ${platform}/${arch}` };
    if (typeof this.d.fetch !== 'function') return { ok: false, error: 'no fetch available' };
    let part = null, tmp = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      say('resolving', 2, 'Finding the current Tor release…');
      let version; try { version = await this.latestVersion(); } catch (e) {
        const have = !force && this.current(); if (have) return { ok: true, action: 'kept', ...this._summary(have), note: `could not check for a newer Tor (${e.message}); using the one already installed` };
        throw e;
      }
      const have = this.current();
      if (have && have.version === version && have.platform === plat && !force) { say('locating', 90, `Tor ${version} is already installed`); return { ok: true, action: 'kept', ...this._summary(have) }; }

      const name = `tor-expert-bundle-${plat}-${version}.tar.gz`;
      part = path.join(dir, `.${name}.part`);
      say('downloading', 5, `Downloading ${name}…`);
      const dl = await this._download(version, name, part, (b, t) => say('downloading', 5 + Math.round(65 * (t ? Math.min(1, b / t) : Math.min(0.9, b / (40 * 1048576)))), `Downloading ${name} — ${(b / 1048576).toFixed(1)}${t ? ` of ${(t / 1048576).toFixed(1)}` : ''} MB`));

      say('verifying', 72, 'Checking the download against the Tor Project’s published checksum…');
      const exp = await this._expectedSum(version, name); let verified = false;
      if (exp.sum) {
        if (exp.sum !== dl.sha256) throw new Error(`checksum mismatch for ${name}: published ${exp.sum}, downloaded ${dl.sha256}. The download was deleted and nothing was installed.`);
        verified = true;
      } else if (!allowUnverified) throw new Error(`${exp.why}, so the download is not trusted and was deleted. Nothing was installed. (CLI: \`net setup --unverified\` installs without a checksum.)`);

      say('extracting', 78, 'Unpacking…');
      const tar = await gunzip(fs.readFileSync(part), { maxOutputLength: this.d.limits.maxUnpacked + 4 * 1048576 }).catch(e => { throw new Error(`the download is not a valid .tar.gz (${e.message})`); });
      tmp = path.join(dir, `.extract-${this.d.now()}`); fs.rmSync(tmp, { recursive: true, force: true });
      const u = untar(tar, tmp, { fs, limits: this.d.limits, platform });

      say('locating', 90, 'Looking for tor and the Snowflake client…');
      // Newer bundles ship ONE pluggable-transport program, lyrebird, that speaks obfs4, Snowflake and WebTunnel (it replaced the separate snowflake-client);
      // older ones carry snowflake-client. Either is launched the same way (`ClientTransportPlugin snowflake exec <path>`), so take whichever is there.
      const torPathTmp = findFile(fs, tmp, exeName('tor', platform));
      const snowTmp = findFile(fs, tmp, exeName('snowflake-client', platform)) || findFile(fs, tmp, exeName('lyrebird', platform));
      const miss = [!torPathTmp && exeName('tor', platform), !snowTmp && `${exeName('snowflake-client', platform)} or ${exeName('lyrebird', platform)}`].filter(Boolean);
      if (miss.length) { const seen = []; walk(fs, tmp, (p) => seen.push(path.relative(tmp, p))); throw new Error(`the bundle was unpacked (${u.files} files) but ${miss.join(' and ')} is not in it — Tor may have changed the bundle layout. Files: ${seen.slice(0, 20).join(', ')}`); }
      let lines = []; const cfg = findFile(fs, tmp, 'pt_config.json'); if (cfg) { try { lines = bridgeLines(fs.readFileSync(cfg, 'utf8')); } catch (_) { /* no lines */ } }

      const relTor = path.relative(tmp, torPathTmp), relSnow = path.relative(tmp, snowTmp);   // taken BEFORE the rename: where inside the folder each one is
      const final = path.join(dir, `tor-expert-bundle-${version}-${plat}`);
      fs.rmSync(final, { recursive: true, force: true }); fs.renameSync(tmp, final); tmp = null;   // LAST: only a finished folder is ever an install
      const rec = { version, platform: plat, folder: final, torPath: path.join(final, relTor), snowflakePath: path.join(final, relSnow), sha256: dl.sha256, verified, source: dl.url, installedAt: new Date(this.d.now()).toISOString(), bridgeLines: lines };
      fs.writeFileSync(this._installedFile(), JSON.stringify(rec, null, 2));
      this._prune(final);
      try { fs.unlinkSync(part); } catch (_) {} part = null;
      return { ok: true, action: 'installed', ...this._summary(rec), skipped: u.skipped };
    } catch (e) {
      if (part) try { fs.unlinkSync(part); } catch (_) {}
      if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
      return { ok: false, error: e.message };
    }
  }

  _summary(r) { return { version: r.version, platform: r.platform, torPath: r.torPath, snowflakePath: r.snowflakePath, bridgeLines: r.bridgeLines || [], verified: !!r.verified, source: r.source }; }

  /** _prune(keep) — older bundle folders are removed once a newer one is in place (never the one just made). */
  _prune(keep) {
    const { fs, dir } = this.d;
    try { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (/^tor-expert-bundle-/.test(n) && p !== keep) fs.rmSync(p, { recursive: true, force: true }); } } catch (_) { /* leaving an old folder is harmless */ }
  }
}

module.exports = { TorInstaller, platformToken, untar, inside, findFile, bridgeLines, LIMITS, DIST, VERSION_JSON };
