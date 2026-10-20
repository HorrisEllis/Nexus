'use strict';
/**
 * clear-glass/src/import/firefox.js — bring a Firefox profile into Clear Glass, for real (BS1, 0.60.179). Spec: clear-glass/spec/browser-shell.spec
 * MOD-BSH-FIREFOX. comp_id: cg.import.firefox
 *
 * James, 2026-10-21: "can you build a import for firefox profiles and cookies for clearglass.?" What existed was a stub: the Options panel
 * sent the co-pilot a chat message and nothing read a profile. This reads them:
 *   profiles()            profiles.ini wherever Firefox keeps it (Windows, macOS, Linux incl. ~/.config/mozilla, snap, flatpak)
 *   readCookies(dir)      moz_cookies from a COPY of cookies.sqlite (+ its -wal), so a running Firefox is not touched
 *   toElectron(row)       Electron's cookies.set shape, or a skip with why (expired, container, private, partitioned)
 *   importCookies()       set each into a session, counted; a cookie's value is never logged or returned
 *   readBookmarks / importBookmarks   places.sqlite bookmarks (not place: queries) with their folder as a tag
 *   readPersona(dir)      prefs.js: general.useragent.override, intl.accept_languages
 * node:sqlite (Node 22.13+, Electron 42) — no native module to build.
 */
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function _sqlite() {
  try { return require('node:sqlite'); }
  catch (e) { throw new Error(`reading Firefox's databases needs node:sqlite (Node 22.13+ / Electron 42+); this runtime has ${process.versions.node}: ${e.message}`); }
}

/** the folders a profiles.ini may live in */
function roots({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const j = (...p) => path.join(...p);
  if (platform === 'win32') return [env.APPDATA && j(env.APPDATA, 'Mozilla', 'Firefox'), home && j(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox')].filter(Boolean);
  if (platform === 'darwin') return [j(home, 'Library', 'Application Support', 'Firefox')];
  return [j(home, '.mozilla', 'firefox'), j(env.XDG_CONFIG_HOME || j(home, '.config'), 'mozilla', 'firefox'), j(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), j(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')];
}

function parseIni(text) {
  const out = {}; let sec = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith(';') || l.startsWith('#')) continue;
    const s = /^\[(.+)\]$/.exec(l); if (s) { sec = out[s[1]] = out[s[1]] || {}; continue; }
    const kv = /^([^=]+)=(.*)$/.exec(l); if (kv && sec) sec[kv[1].trim()] = kv[2].trim();
  }
  return out;
}

function profiles({ fs = require('fs'), platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const looked = []; const found = []; const seen = new Set();
  for (const root of [...new Set(roots({ platform, home, env }))]) {
    const ini = path.join(root, 'profiles.ini'); looked.push(ini);
    let text; try { text = fs.readFileSync(ini, 'utf8'); } catch (_) { continue; }
    const p = parseIni(text);
    const installDefaults = new Set(Object.entries(p).filter(([k]) => /^Install/i.test(k)).map(([, v]) => v.Default).filter(Boolean));
    for (const [k, v] of Object.entries(p)) {
      if (!/^Profile\d+$/i.test(k) || !v.Path) continue;
      const dir = v.IsRelative === '0' ? v.Path : path.join(root, v.Path.replace(/\//g, path.sep));
      if (seen.has(dir)) continue; seen.add(dir);
      const has = { cookies: fs.existsSync(path.join(dir, 'cookies.sqlite')), places: fs.existsSync(path.join(dir, 'places.sqlite')), prefs: fs.existsSync(path.join(dir, 'prefs.js')) };
      found.push({ name: v.Name || path.basename(dir), path: dir, isDefault: installDefaults.size ? installDefaults.has(v.Path) : v.Default === '1', root, has });
    }
  }
  found.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  return { profiles: found, looked };
}

/** _withCopy(dir, file, fn) — copy the database and its -wal/-shm to a temp folder, open read-only, run fn(db), remove the copy. */
function _withCopy(dir, file, fn, fs = require('fs')) {
  const src = path.join(dir, file);
  if (!fs.existsSync(src)) throw new Error(`${file} not found in ${dir}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ffimport-'));
  try {
    for (const ext of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + ext, path.join(tmp, file + ext)); } catch (e) { if (!ext) throw e; } }
    const { DatabaseSync } = _sqlite();
    const db = new DatabaseSync(path.join(tmp, file));
    try { return fn(db); } finally { db.close(); }
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
}

function readCookies(dir, { fs } = {}) {
  return _withCopy(dir, 'cookies.sqlite', (db) => {
    const cols = new Set(db.prepare('PRAGMA table_info(moz_cookies)').all().map(c => c.name));
    const sel = ['name', 'value', 'host', 'path', 'expiry', 'isSecure', 'isHttpOnly', 'originAttributes', ...(cols.has('sameSite') ? ['sameSite'] : [])];
    return db.prepare(`SELECT ${sel.join(', ')} FROM moz_cookies`).all();
  }, fs);
}

const SAMESITE = { 0: 'no_restriction', 1: 'lax', 2: 'strict' };
/** toElectron(row, now) → { cookie } | { skip: reason } — reason: expired | container | private | partitioned | bad */
function toElectron(row, now = Date.now()) {
  const oa = String(row.originAttributes || '');
  if (/privateBrowsingId=[1-9]/.test(oa)) return { skip: 'private' };
  if (/partitionKey=/.test(oa)) return { skip: 'partitioned' };
  if (/userContextId=[1-9]/.test(oa) || /firstPartyDomain=/.test(oa)) return { skip: 'container' };
  if (!row.host || !row.name && row.name !== '') return { skip: 'bad' };
  let exp = Number(row.expiry) || 0;
  if (exp > 1e11) exp = Math.floor(exp / 1000);   // newer Firefox stores milliseconds
  if (exp && exp * 1000 <= now) return { skip: 'expired' };
  const host = String(row.host); const domainCookie = host.startsWith('.');
  const secure = !!Number(row.isSecure);
  const cookie = {
    url: `${secure ? 'https' : 'http'}://${host.replace(/^\./, '')}${row.path || '/'}`,
    name: String(row.name), value: String(row.value ?? ''), path: row.path || '/', secure, httpOnly: !!Number(row.isHttpOnly),
    ...(domainCookie ? { domain: host } : {}),
    ...(exp ? { expirationDate: exp } : {}),
    ...(row.sameSite !== undefined && SAMESITE[row.sameSite] ? { sameSite: SAMESITE[row.sameSite] } : {}),
  };
  if (cookie.sameSite === 'no_restriction' && !secure) delete cookie.sameSite;   // Chromium refuses SameSite=None without Secure
  return { cookie };
}

async function importCookies({ dir, session, now = Date.now(), fs } = {}) {
  const rows = readCookies(dir, { fs });
  const r = { read: rows.length, imported: 0, skipped: { expired: 0, container: 0, private: 0, partitioned: 0, bad: 0, refused: 0 }, refusedHosts: [] };
  for (const row of rows) {
    const m = toElectron(row, now);
    if (m.skip) { r.skipped[m.skip]++; continue; }
    try { await session.cookies.set(m.cookie); r.imported++; }
    catch (_) { r.skipped.refused++; if (r.refusedHosts.length < 20 && !r.refusedHosts.includes(row.host)) r.refusedHosts.push(row.host); }   // the host, never the value
  }
  return r;
}

function readBookmarks(dir, { fs } = {}) {
  return _withCopy(dir, 'places.sqlite', (db) => db.prepare(
    `SELECT b.title AS title, p.url AS url, f.title AS folder FROM moz_bookmarks b JOIN moz_places p ON b.fk = p.id LEFT JOIN moz_bookmarks f ON b.parent = f.id
     WHERE b.type = 1 AND p.url NOT LIKE 'place:%'`).all().map(x => ({ url: x.url, title: x.title || x.url, folder: x.folder || null })), fs);
}

function importBookmarks({ dir, store, agentId = 'default', fs } = {}) {
  const list = readBookmarks(dir, { fs }); const r = { read: list.length, added: 0, existing: 0 };
  for (const b of list) {
    if (!/^(https?|file|ftp):/i.test(b.url)) { r.existing++; continue; }
    if (store.isBookmarked({ url: b.url, agentId })) { r.existing++; continue; }
    store.add({ url: b.url, title: b.title, agentId, tags: ['firefox', ...(b.folder && !/^(menu|toolbar|unfiled|mobile)$/i.test(b.folder) ? [b.folder] : [])] }); r.added++;
  }
  return r;
}

function readPersona(dir, { fs = require('fs') } = {}) {
  let text; try { text = fs.readFileSync(path.join(dir, 'prefs.js'), 'utf8'); } catch (_) { return null; }
  const pref = (k) => { const m = new RegExp(`user_pref\\("${k.replace(/\./g, '\\.')}",\\s*"((?:[^"\\\\]|\\\\.)*)"\\)`).exec(text); return m ? m[1].replace(/\\"/g, '"') : null; };
  const userAgent = pref('general.useragent.override'); const languages = pref('intl.accept_languages');
  return userAgent || languages ? { userAgent, languages } : null;
}

/**
 * run({ profile, cookies, bookmarks, persona, session, store, fingerprint, agentId, into }) → ImportReport
 * Each part runs on its own: one failing does not stop the others, and says why.
 */
async function run({ profile, cookies = true, bookmarks = false, persona = false, session, store, fingerprint, agentId = 'default', into = 'default', fs, now = Date.now() } = {}) {
  const dir = profile && (profile.path || profile);
  const rep = { profile: profile && profile.name || dir, into, cookies: null, bookmarks: null, persona: null, errors: [] };
  if (!dir) { rep.errors.push('no profile'); return rep; }
  if (cookies) { try { if (!session) throw new Error('no session to import into'); rep.cookies = await importCookies({ dir, session, fs, now }); } catch (e) { rep.errors.push(`cookies: ${e.message}`); } }
  if (bookmarks) { try { if (!store) throw new Error('no bookmarks store'); rep.bookmarks = importBookmarks({ dir, store, agentId, fs }); } catch (e) { rep.errors.push(`bookmarks: ${e.message}`); } }
  if (persona) {
    try { const p = readPersona(dir, { fs }); rep.persona = p; if (p && fingerprint) fingerprint.importFirefox(agentId, { userAgent: p.userAgent || undefined, intlLocale: p.languages ? p.languages.split(',')[0].trim() : undefined }); }
    catch (e) { rep.errors.push(`persona: ${e.message}`); }
  }
  return rep;
}

const hashPath = (p) => crypto.createHash('sha1').update(String(p)).digest('hex').slice(0, 8);
module.exports = { roots, parseIni, profiles, readCookies, toElectron, importCookies, readBookmarks, importBookmarks, readPersona, run, hashPath, SAMESITE };
