'use strict';
/**
 * clear-glass/src/releases/deliver.js — Clear Glass brings a Nexus release to COS's inbox (COSA7, 0.60.93)
 * comp_id: clear-glass.releases.deliver
 * Map: docs/2026-10-15-cos-app-phasemap.spec (COSA7_clear_glass_delivers)
 *
 * James, 2026-10-16: "auto updates from dropping in new zips, downloading it from clearglass."
 *
 * check(): ask GitHub which release is latest and which asset is the zip (nexus-<version>.zip) and its SHA256SUMS.
 * deliver(): if that version is not already installed or already in the inbox, download the zip into the inbox: to a .part file first, hashed as it streams, size-capped,
 * compared with the published checksum; only a zip that matches is renamed into place (the LAST step, so COS's inbox watcher never sees half a file), with
 * <zip>.sha256 beside it so COS shows it as verified. A checksum mismatch deletes the download and says so. No published checksum: the zip is still delivered, reported
 * verified:false, and COS (policy auto) will not switch to it by itself.
 *
 * Limits, said plainly: the checksum comes from the SAME release as the zip, so it proves the download is intact, not that the release is trustworthy.
 * The NP16 quarantine vault is not built yet, so a delivered zip is protected by the checksum and by COS's own inspection (size, entry count, path traversal, folder = VERSION), not by quarantine.
 * Never replaces Clear Glass or Nexus: it only puts a file in a folder; COS decides what happens next.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MAX_BYTES = 600 * 1024 * 1024;   // the same cap COS's store enforces (LIMITS.maxZipBytes)
const API = 'https://api.github.com';

const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const headers = (token) => ({ Accept: 'application/vnd.github+json', 'User-Agent': 'nexus-clear-glass', ...(token ? { Authorization: `Bearer ${token}` } : {}) });

/** check({ repo, fetch, apiBase, token }) → { ok, tag, version, zip:{name,url,size}, sums:{url}|null, page } | { ok:false, error } */
async function check({ repo = 'HorrisEllis/nexus', fetch = globalThis.fetch, apiBase = API, token = null } = {}) {
  if (typeof fetch !== 'function') return { ok: false, error: 'no fetch available' };
  let res; try { res = await fetch(`${apiBase}/repos/${repo}/releases/latest`, { headers: headers(token) }); } catch (e) { return { ok: false, error: `could not reach GitHub: ${e.message}` }; }
  if (res.status === 404) return { ok: false, error: `${repo} has no published release (or it is private: a token is needed)` };
  if (res.status === 403 || res.status === 429) return { ok: false, error: `GitHub refused (${res.status}): rate limited. Try later.` };
  if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
  let j; try { j = await res.json(); } catch (_) { return { ok: false, error: 'GitHub answered with something that is not JSON' }; }
  const version = String(j.tag_name || '').replace(/^v/, ''); if (!/^\d+\.\d+\.\d+$/.test(version)) return { ok: false, error: `the latest release tag "${j.tag_name}" is not a version` };
  const assets = Array.isArray(j.assets) ? j.assets : []; const z = assets.find(a => a.name === `nexus-${version}.zip`); const s = assets.find(a => a.name === 'SHA256SUMS');
  if (!z) return { ok: false, error: `release ${j.tag_name} has no nexus-${version}.zip asset`, version };
  return { ok: true, tag: j.tag_name, version, zip: { name: z.name, url: z.browser_download_url, size: z.size }, sums: s ? { url: s.browser_download_url } : null, page: j.html_url };
}

async function _text(fetch, url, token) { const r = await fetch(url, { headers: { 'User-Agent': 'nexus-clear-glass', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, redirect: 'follow' }); if (!r.ok) throw new Error(`${url} answered ${r.status}`); return r.text(); }

/** deliver({ repo, inbox, installed, fetch, apiBase, token, maxBytes }) → { ok, action:'none'|'delivered', version, verified?, reason?, path? } | { ok:false, error } */
async function deliver({ repo = 'HorrisEllis/nexus', inbox, installed = [], fetch = globalThis.fetch, apiBase = API, token = null, maxBytes = MAX_BYTES } = {}) {
  if (!inbox) return { ok: false, error: 'deliver needs the COS inbox folder' };
  const c = await check({ repo, fetch, apiBase, token }); if (!c.ok) return c;
  if (installed.includes(c.version)) return { ok: true, action: 'none', version: c.version, reason: `${c.version} is already installed` };
  if (installed.length && installed.every(v => cmpVer(c.version, v) < 0)) return { ok: true, action: 'none', version: c.version, reason: `the latest release ${c.version} is older than what is installed (${installed.slice().sort(cmpVer).pop()})` };
  const name = c.zip.name; const dest = path.join(inbox, name);
  for (const where of [dest, path.join(inbox, 'done', name)]) if (fs.existsSync(where)) return { ok: true, action: 'none', version: c.version, reason: `${name} was already delivered` };
  if (c.zip.size && c.zip.size > maxBytes) return { ok: false, error: `${name} is ${(c.zip.size / 1048576).toFixed(0)} MB, over the ${(maxBytes / 1048576).toFixed(0)} MB limit: not downloaded`, version: c.version };
  let expected = null;
  if (c.sums) { try { const t = await _text(fetch, c.sums.url, token); for (const line of t.split(/\r?\n/)) { const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim()); if (m && path.basename(m[2]) === name) expected = m[1].toLowerCase(); } } catch (e) { return { ok: false, error: `could not read SHA256SUMS: ${e.message}. Nothing was downloaded, so an unverifiable zip is not delivered by accident.`, version: c.version }; } }
  fs.mkdirSync(inbox, { recursive: true }); const part = path.join(inbox, `.${name}.part`);
  let res; try { res = await fetch(c.zip.url, { headers: { 'User-Agent': 'nexus-clear-glass', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, redirect: 'follow' }); } catch (e) { return { ok: false, error: `download failed: ${e.message}`, version: c.version }; }
  if (!res.ok || !res.body) return { ok: false, error: `download answered ${res.status}`, version: c.version };
  const len = Number(res.headers && res.headers.get && res.headers.get('content-length')); if (len && len > maxBytes) return { ok: false, error: `${name} announces ${(len / 1048576).toFixed(0)} MB, over the limit: not downloaded`, version: c.version };
  const hash = crypto.createHash('sha256'); let bytes = 0; const out = fs.createWriteStream(part);
  try {
    for await (const chunk of res.body) { bytes += chunk.length; if (bytes > maxBytes) throw new Error(`more than ${(maxBytes / 1048576).toFixed(0)} MB arrived`); hash.update(chunk); if (!out.write(chunk)) await new Promise(r => out.once('drain', r)); }
    await new Promise((r, j) => { out.end(); out.once('finish', r); out.once('error', j); });
  } catch (e) { out.destroy(); try { fs.unlinkSync(part); } catch (_) {} return { ok: false, error: `download stopped: ${e.message}. The partial file was removed.`, version: c.version }; }
  const got = hash.digest('hex');
  if (expected && got !== expected) { try { fs.unlinkSync(part); } catch (_) {} return { ok: false, error: `checksum mismatch for ${name}: published ${expected}, downloaded ${got}. The download was deleted and nothing was delivered.`, version: c.version }; }
  if (expected) fs.writeFileSync(`${dest}.sha256`, `${got}  ${name}\n`);
  fs.renameSync(part, dest);   // last: the inbox watcher only ever sees a complete, checked file
  return { ok: true, action: 'delivered', version: c.version, verified: !!expected, bytes, path: dest, reason: expected ? 'the SHA256 matches the published SHA256SUMS' : 'the release publishes no SHA256SUMS, so this zip is NOT verified' };
}
module.exports = { check, deliver, cmpVer, MAX_BYTES };
