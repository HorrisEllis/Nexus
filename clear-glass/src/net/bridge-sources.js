'use strict';
/**
 * clear-glass/src/net/bridge-sources.js — where a real Snowflake bridge line comes from (SF2, 0.60.178). Spec: clear-glass/spec/snowflake.spec
 * MOD-SF-BRIDGE-SOURCES. comp_id: cg.net.bridge-sources
 *
 * James, 2026-10-21: "can you get snowflake working." With tor and a Snowflake client already on his machine, Start still refused: the only
 * source of a bridge line was the installer's own downloaded bundle. This reads the ones already on the machine, and asks the Tor Project
 * only when he presses for it. It never invents a line and carries none in code (SF-002): the line changes over time, and a wrong one is a
 * transport that never connects.
 *
 *   local({ fs, platform, home, env, bundleDir })  → { lines: [{ line, source, path }], torBrowser: { dir, tor, snowflake } | null }
 *       sources, in this order: tor-browser (pt_config.json of a Tor Browser install), bundle (the Expert Bundle the installer unpacked),
 *       system-example (the Debian snowflake-client package's example torrc)
 *   builtin({ fetch })  → { ok, lines } | { ok:false, error }   — the Tor Project's Moat "builtin bridges" list. Contacts bridges.torproject.org
 *       DIRECTLY, so a network watching for Tor sees the ask; that is why it is his button and never automatic (SF-007).
 * Read-only on the machine. Everything impure is passed in.
 */
const path = require('path');
const { bridgeLines, findFile } = require('./installer');

const MOAT_BUILTIN = 'https://bridges.torproject.org/moat/circumvention/builtin';
const SYSTEM_EXAMPLES = ['/usr/share/doc/snowflake-client/examples/torrc', '/usr/share/doc/snowflake/examples/torrc', '/usr/local/share/doc/snowflake-client/examples/torrc'];
const exe = (n, platform) => (platform === 'win32' ? `${n}.exe` : n);
const isLine = (s) => /^snowflake\s+\S+/i.test(s);

/** torBrowserDirs({ platform, home, env }) → the places a Tor Browser install usually is (each may not exist). */
function torBrowserDirs({ platform = process.platform, home = '', env = {} } = {}) {
  const j = (...p) => path.join(...p);
  if (platform === 'darwin') return ['/Applications/Tor Browser.app', home && j(home, 'Applications', 'Tor Browser.app')].filter(Boolean);
  if (platform === 'win32') {
    return [home && j(home, 'Desktop', 'Tor Browser'), home && j(home, 'Downloads', 'Tor Browser'), env.LOCALAPPDATA && j(env.LOCALAPPDATA, 'Tor Browser'),
      env.ProgramFiles && j(env.ProgramFiles, 'Tor Browser'), env['ProgramFiles(x86)'] && j(env['ProgramFiles(x86)'], 'Tor Browser')].filter(Boolean);
  }
  return [home && j(home, '.local', 'share', 'torbrowser', 'tbb'), home && j(home, 'tor-browser'), home && j(home, 'Downloads'), home && j(home, 'Desktop'),
    '/opt/tor-browser', '/usr/lib/torbrowser'].filter(Boolean);
}

/** linesFromTorrc(text) → the live (uncommented) Snowflake bridge lines of a torrc, 'Bridge ' removed. */
function linesFromTorrc(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = /^\s*Bridge\s+(snowflake\s+.+?)\s*$/i.exec(raw);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// a Tor Browser root: the folder itself, or (Linux: ~/Downloads, ~/Desktop, the launcher's tbb/) a child whose name starts with tor-browser / an arch folder
function _roots(fs, dir) {
  let st; try { st = fs.statSync(dir); } catch (_) { return []; }
  if (!st.isDirectory()) return [];
  const base = path.basename(dir).toLowerCase();
  if (/tor[ -]?browser/.test(base) && base !== 'torbrowser') return [dir];
  let kids = []; try { kids = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const k of kids) {
    if (!k.isDirectory()) continue;
    const p = path.join(dir, k.name);
    if (/^tor-browser/i.test(k.name)) out.push(p);
    else if (base === 'tbb') { try { for (const g of fs.readdirSync(p, { withFileTypes: true })) if (g.isDirectory() && /^tor-browser/i.test(g.name)) out.push(path.join(p, g.name)); } catch (_) { /* unreadable */ } }
  }
  return out;
}

function local({ fs = require('fs'), platform = process.platform, home = require('os').homedir(), env = process.env, bundleDir = null, examples = SYSTEM_EXAMPLES } = {}) {
  const seen = new Set(); const lines = []; let torBrowser = null;
  const add = (line, source, p) => { const l = String(line).trim().replace(/^Bridge\s+/i, ''); if (!isLine(l) || seen.has(l)) return; seen.add(l); lines.push({ line: l, source, path: p }); };

  for (const d of torBrowserDirs({ platform, home, env })) {
    for (const root of _roots(fs, d)) {
      const cfg = findFile(fs, root, 'pt_config.json');
      if (cfg) { try { bridgeLines(fs.readFileSync(cfg, 'utf8')).forEach(l => add(l, 'tor-browser', cfg)); } catch (_) { /* unreadable: skipped */ } }
      if (!torBrowser) {
        const tor = findFile(fs, root, exe('tor', platform));
        const snow = findFile(fs, root, exe('snowflake-client', platform)) || findFile(fs, root, exe('lyrebird', platform));
        if (tor || snow) torBrowser = { dir: root, tor: tor || null, snowflake: snow || null };
      }
    }
  }
  if (bundleDir) {
    const cfg = findFile(fs, bundleDir, 'pt_config.json');
    if (cfg) { try { bridgeLines(fs.readFileSync(cfg, 'utf8')).forEach(l => add(l, 'bundle', cfg)); } catch (_) { /* unreadable */ } }
  }
  for (const f of examples) { try { linesFromTorrc(fs.readFileSync(f, 'utf8')).forEach(l => add(l, 'system-example', f)); } catch (_) { /* absent */ } }
  return { lines, torBrowser };
}

/** builtin({ fetch }) — his button only. POST is Moat's documented form; a server that refuses it is asked once more with GET. */
async function builtin({ fetch = globalThis.fetch, url = MOAT_BUILTIN, timeoutMs = 20000 } = {}) {
  if (typeof fetch !== 'function') return { ok: false, error: 'no fetch available' };
  const ask = async (method) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/vnd.api+json' }, ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(timeoutMs) });
    return { status: res.status, ok: res.ok, text: await res.text() };
  };
  let r;
  try { r = await ask('POST'); if (!r.ok) r = await ask('GET'); }
  catch (e) { return { ok: false, error: `bridges.torproject.org did not answer (${e.name === 'TimeoutError' ? 'timed out' : e.message}). If Tor is blocked where you are, a line from Tor Browser is the way.` }; }
  if (!r.ok) return { ok: false, error: `bridges.torproject.org answered HTTP ${r.status}` };
  const lines = bridgeLines(r.text).map(line => ({ line, source: 'tor-project-builtin', path: url }));
  return lines.length ? { ok: true, lines } : { ok: false, error: 'the Tor Project answered, but with no Snowflake line in it' };
}

module.exports = { local, builtin, torBrowserDirs, linesFromTorrc, MOAT_BUILTIN, SYSTEM_EXAMPLES };
