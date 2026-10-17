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
    .map(r => ({ version: r.tag_name.slice(5), page: r.html_url, assets: (r.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) }))
    .sort((a, b) => cmp(b.version, a.version));
  if (!cos.length) return { ok: false, error: `${repo} has no published COS release (cos-v<version>)` };
  const top = cos[0];
  return { ok: true, current, latest: top.version, newer: !!current && cmp(top.version, current) > 0, page: top.page, assets: top.assets };
}

module.exports = { checkApp, cmp };
