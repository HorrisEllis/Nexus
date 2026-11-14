'use strict';
/**
 * cos/app/app-update.js — is there a newer COS? (COS 0.1.2, Nexus 0.60.137)
 *
 * James, 2026-10-17, with a screenshot of COS refusing a release zip ("expected one top folder (nexus-<version>/), found
 * 406"): "can you fix cos for me? the zip doesn't have nested folders anymore." The store has read a zip whose files sit at its
 * root since COS 0.1.1 (Nexus 0.60.111, cos-v0.1.1 released 2026-10-16); his COS was 0.1.0, and nothing told him a newer one
 * existed — COS updates the projects it runs, never itself. This is that check: GitHub's release list, the newest cos-v<x.y.z>,
 * compared with this COS. It downloads nothing and replaces nothing: the window says so and opens the release page; he installs.
 *
 *   checkApp({ current, repo, fetch, apiBase, token }) → { ok, current, latest, newer, page, assets } | { ok:false, error }
 * Reads the list, not /releases/latest: Nexus's releases (v0.60.x) and COS's (cos-v0.1.x) share the repo, so "latest" is
 * whichever was published last.
 */
const API = 'https://api.github.com';
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

async function checkApp({ current, repo = 'HorrisEllis/nexus', fetch = globalThis.fetch, apiBase = API, token = null } = {}) {
  if (typeof fetch !== 'function') return { ok: false, error: 'no fetch available' };
  let res;
  try { res = await fetch(`${apiBase}/repos/${repo}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nexus-cos', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); }
  catch (e) { return { ok: false, error: `could not reach GitHub: ${e.message}` }; }
  if (res.status === 403 || res.status === 429) return { ok: false, error: `GitHub refused (${res.status}): rate limited. Try later.` };
  if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
  let list; try { list = await res.json(); } catch (_) { return { ok: false, error: 'GitHub answered with something that is not JSON' }; }
  const cos = (Array.isArray(list) ? list : []).filter(r => !r.draft && !r.prerelease && /^cos-v\d+\.\d+\.\d+$/.test(r.tag_name || ''))
    .map(r => ({ version: r.tag_name.slice(5), page: r.html_url, assets: (r.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, api: a.url || null, size: a.size })) }))
    .sort((a, b) => cmp(b.version, a.version));
  if (!cos.length) return { ok: false, error: `${repo} has no published COS release (cos-v<version>)` };
  const top = cos[0];
  return { ok: true, current, latest: top.version, newer: !!current && cmp(top.version, current) > 0, page: top.page, assets: top.assets };
}

// ── CA10 (COS 0.10.0, Nexus 0.60.540) — COS updates itself ──────────────────────────────────────────────────────────────────────────────
// James, 2026-11-14: "so this cant use the update tool?" · offered COS updating itself from Settings › Update: "yes."
// installApp: the newest cos-v release's setup and its SHA256SUMS are downloaded into COS's own folder; the setup runs only when its SHA-256 is the one
// the release names; it runs silently (/S) and COS closes so the installer can replace it. The installer of the version before is kept (a roll back).
// A private repo: GitHub's API is asked for the asset with the sign-in git already keeps (git credential fill, never a prompt) — one sign-in for both.

const fs = require('fs'), path = require('path'), crypto = require('crypto');

/** githubToken({ run }) → the token git's credential helper holds for github.com, or null (never prompts) */
function githubToken({ run = require('child_process').spawnSync, env = process.env } = {}) {
  if (env.GH_TOKEN || env.GITHUB_TOKEN) return env.GH_TOKEN || env.GITHUB_TOKEN;
  try { const r = run('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', timeout: 15000, windowsHide: true,
    env: { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
    const m = /^password=(.+)$/m.exec(String(r && r.stdout || '')); return m ? m[1].trim() : null; } catch (_) { return null; }
}

async function _download(asset, { fetch, token, to }) {
  // public: the browser URL; private: the API asset URL with the token (application/octet-stream)
  const url = token && asset.api ? asset.api : asset.url;
  const res = await fetch(url, { headers: { 'User-Agent': 'nexus-cos', ...(token ? { Authorization: `Bearer ${token}`, ...(asset.api ? { Accept: 'application/octet-stream' } : {}) } : {}) }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${asset.name}: GitHub answered ${res.status}${res.status === 404 && !token ? ' — the release may be private: sign in to GitHub once (git fetch in the Nexus folder) and try again' : ''}`);
  const buf = Buffer.from(await res.arrayBuffer()); fs.writeFileSync(to, buf); return buf;
}

/** installApp({ check, dir, fetch, token, platform, spawn, current }) → { ok, version, setup, sha256, launched, kept } | { ok:false, error }
 *  check: checkApp's answer (its assets now carry api too). dir: COS's own folder for updates. Nothing runs unless the checksum matches. */
async function installApp({ check, dir, fetch = globalThis.fetch, token = null, platform = process.platform, spawn = require('child_process').spawn, current = null } = {}) {
  if (!check || !check.ok) return { ok: false, error: (check && check.error) || 'no release to install' };
  if (!check.newer) return { ok: false, error: `COS ${current || check.current} is already the newest (${check.latest})` };
  if (platform !== 'win32') return { ok: false, error: `COS updates itself on Windows only (its installer is a Windows setup); this is ${platform}` };
  const setup = (check.assets || []).find(a => /^COS-.*-setup\.exe$/i.test(a.name)), sums = (check.assets || []).find(a => a.name === 'SHA256SUMS');
  if (!setup) return { ok: false, error: `the release ${check.latest} has no COS-${check.latest}-setup.exe` };
  if (!sums) return { ok: false, error: `the release ${check.latest} has no SHA256SUMS: COS will not run an installer it cannot check` };
  const into = path.join(dir, String(check.latest)); fs.mkdirSync(into, { recursive: true });
  const exe = path.join(into, setup.name);
  try {
    const listText = (await _download(sums, { fetch, token, to: path.join(into, 'SHA256SUMS') })).toString('utf8');
    const want = (listText.split(/\r?\n/).map(l => l.trim().split(/\s+\*?/)).find(([, n]) => n === setup.name) || [])[0];
    if (!want) throw new Error(`SHA256SUMS does not name ${setup.name}`);
    const got = crypto.createHash('sha256').update(await _download(setup, { fetch, token, to: exe })).digest('hex');
    if (got.toLowerCase() !== String(want).toLowerCase()) { try { fs.rmSync(into, { recursive: true, force: true }); } catch (_) {} return { ok: false, error: `${setup.name}'s SHA-256 is ${got}, the release says ${want}: not run, removed` }; }
    // keep this installer and the one before it (a roll back); older ones go
    try { const vs = fs.readdirSync(dir).filter(v => /^\d+\.\d+\.\d+$/.test(v)).sort(cmp); for (const v of vs.slice(0, -2)) fs.rmSync(path.join(dir, v), { recursive: true, force: true }); } catch (_) {}
    const child = spawn(exe, ['/S', '--force-run'],   /* silent; --force-run: the installer starts COS again when done */ { detached: true, stdio: 'ignore', windowsHide: true }); if (child && child.unref) child.unref();
    return { ok: true, version: check.latest, setup: exe, sha256: got, launched: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { checkApp, cmp, installApp, githubToken };
