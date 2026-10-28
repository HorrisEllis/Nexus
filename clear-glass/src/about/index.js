'use strict';
/**
 * clear-glass/src/about/index.js — what is running, and whether a newer Electron or Clear Glass exists (0.60.269).
 * component_id: cg.about
 *
 * James, 2026-10-28: "also need a about page in the settings, where it says the version, can check for updates to electron and clearglass."
 *
 *   info({ versions, nexus, clearGlass, platform, arch }) → { nexus, clearGlass, electron, chrome, node, v8, platform } — what this copy is
 *   check({ fetchText, current, sources }) → { electron, clearGlass, nexus, checkedAt } — each { current, latest, newer, source, error? }
 *   newer(a, b) → true when version b is newer than a (numeric parts, a pre-release lower than its release)
 *
 * Read-only: it says what is newer and where to get it; it installs nothing. Electron's newest is the npm registry's `latest`; Clear
 * Glass's and Nexus's are read from the repository's main branch (clear-glass/package.json, VERSION). A source it cannot reach (offline,
 * or a private repository) is said as such, never guessed. Sources are options (about.*) so they can point elsewhere.
 */
const SOURCES = Object.freeze({
  electron: 'https://registry.npmjs.org/electron/latest',
  clearGlass: 'https://raw.githubusercontent.com/HorrisEllis/Nexus/main/clear-glass/package.json',
  nexus: 'https://raw.githubusercontent.com/HorrisEllis/Nexus/main/VERSION',
});

function _parts(v) {
  const m = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/.exec(String(v || '').trim());
  return m ? { nums: m[1].split('.').map(Number), pre: m[2] || null } : null;
}
function newer(a, b) {
  const x = _parts(a), y = _parts(b); if (!x || !y) return false;
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) { const d = (y.nums[i] || 0) - (x.nums[i] || 0); if (d) return d > 0; }
  if (x.pre && !y.pre) return true;   // 1.0.0-beta → 1.0.0 is newer
  return false;
}

function info({ versions = process.versions, nexus = null, clearGlass = null, platform = process.platform, arch = process.arch } = {}) {
  return { nexus, clearGlass, electron: versions.electron || null, chrome: versions.chrome || null, node: versions.node || null, v8: versions.v8 || null, platform: `${platform} ${arch}` };
}

async function check({ fetchText, current = {}, sources = {} } = {}) {
  const src = { ...SOURCES, ...(sources || {}) };
  const one = async (key, read) => {
    const out = { current: current[key] || null, latest: null, newer: false, source: src[key] };
    if (!fetchText) return { ...out, error: 'no network here' };
    try { out.latest = read(await fetchText(src[key])); } catch (e) { return { ...out, error: /404|403|401/.test(String(e.message)) ? `${e.message} — the repository may be private, or the file moved` : e.message }; }
    if (!out.latest) return { ...out, error: 'the source answered without a version' };
    out.newer = !!out.current && newer(out.current, out.latest);
    return out;
  };
  const [electron, clearGlass, nexus] = await Promise.all([
    one('electron', (t) => JSON.parse(t).version),
    one('clearGlass', (t) => JSON.parse(t).version),
    one('nexus', (t) => String(t).trim().split(/\s+/)[0]),
  ]);
  return { electron, clearGlass, nexus, checkedAt: Date.now() };
}

/** fetchText(url) over the runtime's fetch, 10 s; a non-2xx answer is an error with its status */
async function fetchText(url, { timeoutMs = 10000 } = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'ClearGlass-About' } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText || ''}`.trim());
    return await r.text();
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); }
  finally { clearTimeout(t); }
}

module.exports = { SOURCES, info, check, newer, fetchText };
