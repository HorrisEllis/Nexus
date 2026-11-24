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
// ── BS1 expanded 2026-11-24 — everything from Firefox. James: "this needs to be built, importing all of it from firefox." · "can you have it
// import the autofill and password from firefox also? into the plugin and autofill, and chip." Each read from a COPY; no value logged or returned.

/** a minimal DER reader: { tag, val, kids } (constructed values have kids) */
function _der(buf, at = 0) {
  const tag = buf[at]; let len = buf[at + 1], off = at + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[off + i]; off += n; }
  const val = buf.subarray(off, off + len), node = { tag, val, end: off + len };
  if (tag & 0x20) { node.kids = []; for (let p = 0; p < val.length;) { const k = _der(val, p); node.kids.push(k); p = k.end; } }
  return node;
}
function _oid(b) { const out = [Math.floor(b[0] / 40), b[0] % 40]; let v = 0; for (let i = 1; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { out.push(v); v = 0; } } return out.join('.'); }
const _int = (b) => b.reduce((a, x) => a * 256 + x, 0);
const OID = { PBES2: '1.2.840.113549.1.5.13', PBKDF2: '1.2.840.113549.1.5.12', AES256: '2.16.840.1.101.3.4.1.42', PBE_SHA1_3DES: '1.2.840.113549.1.12.5.1.3', DES3: '1.2.840.113549.3.7' };

/** an NSS-encrypted item (key4.db's password check and private key) → its plain bytes */
function _pbeDecrypt(node, globalSalt, primary = '') {
  const algo = node.kids[0], ct = node.kids[1].val, oid = _oid(algo.kids[0].val);
  const hp = crypto.createHash('sha1').update(Buffer.concat([globalSalt, Buffer.from(primary, 'utf8')])).digest();
  if (oid === OID.PBES2) {
    const kdf = algo.kids[1].kids[0].kids[1].kids, enc = algo.kids[1].kids[1].kids;
    const key = crypto.pbkdf2Sync(hp, kdf[0].val, _int(kdf[1].val), _int(kdf[2].val), 'sha256');
    const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.concat([Buffer.from([0x04, 0x0e]), enc[1].val]));
    return Buffer.concat([d.update(ct), d.final()]);
  }
  if (oid === OID.PBE_SHA1_3DES) {
    const es = algo.kids[1].kids[0].val, pes = Buffer.concat([es, Buffer.alloc(Math.max(0, 20 - es.length))]);
    const chp = crypto.createHash('sha1').update(Buffer.concat([hp, es])).digest(), h = (k, m) => crypto.createHmac('sha1', k).update(m).digest();
    const k = Buffer.concat([h(chp, Buffer.concat([pes, es])), h(chp, Buffer.concat([h(chp, pes), es]))]);
    const d = crypto.createDecipheriv('des-ede3-cbc', k.subarray(0, 24), k.subarray(k.length - 8)); d.setAutoPadding(true);
    return Buffer.concat([d.update(ct), d.final()]);
  }
  throw new Error(`key4.db uses ${oid}, which this import does not read`);
}

/** the profile's login key from key4.db; a wrong primary password is said (code 'primary') */
function loginKey(dir, { primary = '', fs } = {}) {
  return _withCopy(dir, 'key4.db', (db) => {
    const meta = db.prepare("SELECT item1, item2 FROM metaData WHERE id = 'password'").get();
    if (!meta) throw new Error('key4.db has no password check');
    const salt = Buffer.from(meta.item1);
    let check; try { check = _pbeDecrypt(_der(Buffer.from(meta.item2)), salt, primary).toString('latin1'); } catch (_) { check = ''; }
    if (!check.startsWith('password-check')) throw Object.assign(new Error(primary ? 'that is not this Firefox profile\'s primary password' : 'this Firefox profile has a primary password: enter it to import its logins'), { code: 'primary' });
    // a profile can hold several keys (an old 3DES one, newer AES ones): each login names its own by id (a102), so all are kept by id
    const keys = new Map();
    for (const row of db.prepare('SELECT a11, a102 FROM nssPrivate').all()) { if (!row.a11) continue; try { keys.set(Buffer.from(row.a102 || []).toString('hex'), _pbeDecrypt(_der(Buffer.from(row.a11)), salt, primary)); } catch (_) {} }
    if (!keys.size) throw new Error('key4.db has no login key');
    return keys;
  }, fs);
}
function _loginField(b64, keys) {
  const n = _der(Buffer.from(b64, 'base64')), alg = n.kids[1].kids, oid = _oid(alg[0].val), iv = alg[1].val, ct = n.kids[2].val;
  const key = keys instanceof Map ? (keys.get(n.kids[0].val.toString('hex')) || [...keys.values()].find((k) => k.length === (oid === OID.AES256 ? 32 : 24))) : keys;
  if (!key) throw new Error('no key for this login');
  const d = oid === OID.AES256 ? crypto.createDecipheriv('aes-256-cbc', key.subarray(0, 32), iv) : crypto.createDecipheriv('des-ede3-cbc', key.subarray(0, 24), iv);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
/** readLogins(dir) → [{ origin, username, password }], in memory only */
function readLogins(dir, { primary = '', fs = require('fs') } = {}) {
  const file = path.join(dir, 'logins.json'); if (!fs.existsSync(file)) return [];
  const logins = (JSON.parse(fs.readFileSync(file, 'utf8')).logins || []); if (!logins.length) return [];
  const key = loginKey(dir, { primary, fs }), out = [];
  for (const l of logins) { try { out.push({ origin: l.hostname || l.formSubmitURL, username: _loginField(l.encryptedUsername, key), password: _loginField(l.encryptedPassword, key) }); } catch (_) { out.push({ origin: l.hostname, failed: true }); } }
  return out;
}
/** importLogins → the Password Manager plugin's vault; a login it already has (same site, same username) is left as it is */
function importLogins({ dir, vault, primary = '', fs } = {}) {
  const rows = readLogins(dir, { primary, fs }); const have = new Set((vault.list() || []).map((e) => `${e.origin}|${e.username}`));
  const rep = { found: rows.length, imported: 0, already: 0, unreadable: 0, noUsername: 0 };
  for (const r of rows) {
    if (r.failed) { rep.unreadable++; continue; }
    if (!r.username) { rep.noUsername++; continue; }
    let origin = r.origin; try { origin = new URL(r.origin).origin; } catch (_) {}
    if (have.has(`${origin}|${r.username}`)) { rep.already++; continue; }
    try { vault.save(origin, r.username, r.password); have.add(`${origin}|${r.username}`); rep.imported++; } catch (_) { rep.unreadable++; }
  }
  return rep;
}

/** readHistory(dir) → visits newest first: { url, title, ts } (http and https only) */
function readHistory(dir, { limit = 5000, fs } = {}) {
  return _withCopy(dir, 'places.sqlite', (db) => db.prepare(`SELECT p.url AS url, p.title AS title, v.visit_date AS d FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
    WHERE p.url LIKE 'http%' ORDER BY v.visit_date DESC LIMIT ?`).all(limit).map((r) => ({ url: r.url, title: r.title || null, ts: Math.floor(Number(r.d) / 1000) })), fs);
}
function importHistory({ dir, history, agentId = 'default', limit, fs } = {}) {
  const rows = readHistory(dir, { limit, fs });
  if (typeof history.importEntries !== 'function') throw new Error('the history store cannot take imported visits');
  return { found: rows.length, ...history.importEntries(rows.map((r) => ({ ...r, agentId }))) };
}

/** readAddresses(dir) → { addresses: [{ label, fields }], cards } (cards are counted, never read: Firefox keeps them under the OS key) */
const ADDRESS_FIELDS = ['name', 'given-name', 'additional-name', 'family-name', 'organization', 'street-address', 'address-line1', 'address-line2', 'address-level2', 'address-level1', 'postal-code', 'country', 'country-name', 'tel', 'email'];
function readAddresses(dir, { fs = require('fs') } = {}) {
  const file = path.join(dir, 'autofill-profiles.json'); if (!fs.existsSync(file)) return { addresses: [], cards: 0 };
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const addresses = (j.addresses || []).filter((a) => !a.deleted).map((a, i) => {
    const fields = {}; for (const k of ADDRESS_FIELDS) if (a[k]) fields[k] = String(a[k]);
    if (!fields.name && (fields['given-name'] || fields['family-name'])) fields.name = [fields['given-name'], fields['family-name']].filter(Boolean).join(' ');
    return { label: fields.name ? `${fields.name} (Firefox)` : `Firefox address ${i + 1}`, fields };
  }).filter((a) => Object.keys(a.fields).length);
  return { addresses, cards: (j.creditCards || []).filter((c) => !c.deleted).length };
}
function importAddresses({ dir, autofill, fs } = {}) {
  const { addresses, cards } = readAddresses(dir, { fs }); const have = autofill.listProfiles() || [];
  const same = (a) => have.some((p) => p.label === a.label || (a.fields.email && p.fields && p.fields.email === a.fields.email && p.fields.name === a.fields.name));
  const rep = { found: addresses.length, imported: 0, already: 0, cardsLeftInFirefox: cards };
  for (const a of addresses) { if (same(a)) { rep.already++; continue; } const r = autofill.createProfile({ label: a.label, fields: a.fields }); if (r && !r.error) rep.imported++; }
  return rep;
}

async function run({ profile, cookies = true, bookmarks = false, persona = false, passwords = false, history = false, addresses = false, primary = '', session, store, fingerprint, vault, historyStore, autofill, agentId = 'default', into = 'default', fs, now = Date.now() } = {}) {
  const dir = profile && (profile.path || profile);
  const rep = { profile: profile && profile.name || dir, into, cookies: null, bookmarks: null, persona: null, passwords: null, history: null, addresses: null, errors: [] };
  if (!dir) { rep.errors.push('no profile'); return rep; }
  if (passwords) { try { if (!vault) throw new Error('the Password Manager is not available'); rep.passwords = importLogins({ dir, vault, primary, fs }); } catch (e) { rep.errors.push(`passwords: ${e.message}`); if (e.code === 'primary') rep.needsPrimary = true; } }
  if (history) { try { if (!historyStore) throw new Error('no history store'); rep.history = importHistory({ dir, history: historyStore, agentId, fs }); } catch (e) { rep.errors.push(`history: ${e.message}`); } }
  if (addresses) { try { if (!autofill) throw new Error('no autofill store'); rep.addresses = importAddresses({ dir, autofill, fs }); } catch (e) { rep.errors.push(`addresses: ${e.message}`); } }
  if (cookies) { try { if (!session) throw new Error('no session to import into'); rep.cookies = await importCookies({ dir, session, fs, now }); } catch (e) { rep.errors.push(`cookies: ${e.message}`); } }
  if (bookmarks) { try { if (!store) throw new Error('no bookmarks store'); rep.bookmarks = importBookmarks({ dir, store, agentId, fs }); } catch (e) { rep.errors.push(`bookmarks: ${e.message}`); } }
  if (persona) {
    try { const p = readPersona(dir, { fs }); rep.persona = p; if (p && fingerprint) fingerprint.importFirefox(agentId, { userAgent: p.userAgent || undefined, intlLocale: p.languages ? p.languages.split(',')[0].trim() : undefined }); }
    catch (e) { rep.errors.push(`persona: ${e.message}`); }
  }
  return rep;
}

const hashPath = (p) => crypto.createHash('sha1').update(String(p)).digest('hex').slice(0, 8);
module.exports = { roots, parseIni, profiles, readCookies, toElectron, importCookies, readBookmarks, importBookmarks, readPersona, run, hashPath, SAMESITE,
  loginKey, readLogins, importLogins, readHistory, importHistory, readAddresses, importAddresses, _der, _oid, _pbeDecrypt, OID };
