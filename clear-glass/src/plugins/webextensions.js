'use strict';
/**
 * src/plugins/webextensions.js — Chrome WebExtensions in Clear Glass
 * component_id: cg.plugins.webextensions
 *
 * §BUILT 2026-09-26 — James: "add new button to the plugins section with
 * webextension support."
 *
 * Electron (42) loads unpacked Chrome extensions per session:
 * ses.extensions.loadExtension(dir). It does not remember them between
 * runs, does not load .crx, and refuses in-memory sessions. So Clear Glass
 * keeps its own registry and does the rest:
 *   - install from a folder (unpacked), a .zip, or a .crx (CRX2/CRX3 header
 *     stripped, then unzipped) — packed ones are unpacked into
 *     ~/.clear-glass/extensions/<id>/
 *   - the registry is a JAA table (src/storage/jaa.js), not a JSON file
 *   - every enabled extension is loaded into the default session and into
 *     every persistent session as it is created (app 'session-created'),
 *     which covers each tab's persist:agent-* partition
 *   - disable unloads it everywhere; remove also deletes the unpacked copy
 *     Clear Glass made (never a folder you pointed it at)
 *
 * Honest limit: Electron supports a subset of the chrome.* APIs (see
 * Electron's "Supported Extensions APIs"). An extension that needs an
 * unsupported API loads with warnings and may not work; the load result
 * and warnings are kept on the record and shown in Settings → Plugins.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JaaRows, CG_DIR } = require('../storage/jaa');

const TABLE = 'cg_webextensions';
const extDir = () => path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'extensions');

/** Strip a CRX2/CRX3 header, returning the zip bytes. Pure. */
function crxToZip(buf) {
  if (buf.slice(0, 4).toString('binary') !== 'Cr24') return buf; // already a zip
  const version = buf.readUInt32LE(4);
  if (version === 2) {
    const pub = buf.readUInt32LE(8), sig = buf.readUInt32LE(12);
    return buf.slice(16 + pub + sig);
  }
  if (version === 3) {
    const header = buf.readUInt32LE(8);
    return buf.slice(12 + header);
  }
  throw new Error(`unsupported CRX version ${version}`);
}

/** Read and minimally validate manifest.json in a directory. */
function readManifest(dir) {
  const f = path.join(dir, 'manifest.json');
  if (!fs.existsSync(f)) throw new Error(`no manifest.json in ${dir}`);
  let m;
  try { m = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); }
  catch (e) { throw new Error(`manifest.json is not valid: ${e.message}`); }
  if (!m.name || !m.version) throw new Error('manifest.json needs name and version');
  if (![2, 3].includes(m.manifest_version)) throw new Error(`manifest_version ${m.manifest_version} is not a WebExtension manifest (2 or 3)`);
  return m;
}

/** "__MSG_name__" names resolve through _locales/<default>/messages.json. */
function displayName(dir, m) {
  const key = /^__MSG_(.+)__$/.exec(m.name || '');
  if (!key) return m.name;
  try {
    const loc = m.default_locale || 'en';
    const msgs = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8'));
    const hit = Object.entries(msgs).find(([k]) => k.toLowerCase() === key[1].toLowerCase());
    return hit ? hit[1].message : m.name;
  } catch (_) { return m.name; }
}

// §0.39.284 — James's log: the same "ExtensionLoadWarning … Manifest version 2 is deprecated · Permission 'cookies' is
// unknown" block printed dozens of times. Every Clear Glass session (each provider tab and context has its own) loads the
// enabled extensions, and Electron warns on every load. The warning is about the extension itself (an MV2 manifest —
// updating the extension to MV3 is the only real cure), so it is said ONCE per extension folder, with how many sessions
// repeat it counted, never dropped silently.
const _warnedExt = new Map();
function _onceExtensionWarnings() {
  if (process.__cgExtWarnOnce) return;
  process.__cgExtWarnOnce = true;
  const orig = process.emitWarning.bind(process);
  process.emitWarning = function (warning, ...rest) {
    const type = typeof rest[0] === 'string' ? rest[0] : (rest[0] && rest[0].type) || (warning && warning.name);
    const text = String(warning && warning.message ? warning.message : warning);
    if (type === 'ExtensionLoadWarning') {
      const dir = (text.match(/extension at (.+?):/) || [])[1] || text.slice(0, 120);
      const n = (_warnedExt.get(dir) || 0) + 1;
      _warnedExt.set(dir, n);
      if (n > 1) return;   // said once; later sessions repeat the same words
      return orig(`${text}\n  (said once — every Clear Glass session loads this extension; updating it to Manifest V3 is what removes the warning)`, ...rest);
    }
    return orig(warning, ...rest);
  };
}

class WebExtensionHost {
  constructor({ session = null, app = null } = {}) {
    this.session = session;   // electron.session
    this.app = app;           // electron.app
    this.rows = new JaaRows(TABLE);
    this.records = [];
    this.loaded = new Map();  // record id → Map<sessionKey, electronExtensionId>
    this._sessions = new Set();
  }

  load() { this.records = this.rows.load(); return this.records; }
  _save() { this.rows.replaceAll(this.records); }
  list() {
    return this.records.map(r => ({ ...r, loadedIn: this.loaded.has(r.id) ? this.loaded.get(r.id).size : 0 }));
  }

  /** Attach to Electron: load into the default session and every session created from now on. */
  attach() {
    if (!this.session) return;
    _onceExtensionWarnings();
    this._track(this.session.defaultSession, 'default');
    if (this.app && this.app.on) this.app.on('session-created', (ses) => this._track(ses));
  }
  _track(ses, key) {
    if (!ses || this._sessions.has(ses)) return;
    this._sessions.add(ses);
    ses.__cgKey = key || ses.storagePath || `ses-${this._sessions.size}`;
    for (const r of this.records) if (r.enabled) this._loadInto(ses, r).catch(() => {});
  }
  _api(ses) { return ses.extensions && ses.extensions.loadExtension ? ses.extensions : ses; }
  async _loadInto(ses, r) {
    if (!ses.isPersistent || ses.isPersistent()) {
      try {
        const ext = await this._api(ses).loadExtension(r.dir, { allowFileAccess: !!r.allowFileAccess });
        if (!this.loaded.has(r.id)) this.loaded.set(r.id, new Map());
        this.loaded.get(r.id).set(ses.__cgKey, ext.id);
        if (r.lastError || r.electronId !== ext.id) { r.lastError = null; r.electronId = ext.id; this._save(); }
        return ext;
      } catch (e) {
        r.lastError = e.message; this._save();
        throw e;
      }
    }
    return null;
  }
  _unloadEverywhere(r) {
    const m = this.loaded.get(r.id);
    if (!m) return;
    for (const ses of this._sessions) {
      const eid = m.get(ses.__cgKey);
      if (eid) { try { this._api(ses).removeExtension(eid); } catch (_) {} }
    }
    this.loaded.delete(r.id);
  }

  /**
   * install({ source }) — source is a folder, a .zip or a .crx.
   * Returns the record, with loadError when Electron refused it.
   */
  async install({ source, allowFileAccess = false } = {}) {
    if (!source || !fs.existsSync(source)) throw new Error(`not found: ${source}`);
    const stat = fs.statSync(source);
    let dir, owned = false, ownedRoot = null;
    if (stat.isDirectory()) {
      dir = path.resolve(source);
    } else {
      const ext = path.extname(source).toLowerCase();
      if (!['.zip', '.crx'].includes(ext)) throw new Error('choose an extension folder, a .zip or a .crx');
      const Zip = require('../../../lib/zip.js'); // in-house since 0.39.261 (was adm-zip)
      // Named by the zip payload (after any CRX header), so the same
      // extension as .crx or .zip unpacks to — and updates — one record.
      const payload = crxToZip(fs.readFileSync(source));
      const zip = new Zip(payload);
      const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
      dir = path.join(extDir(), hash);
      fs.mkdirSync(dir, { recursive: true });
      zip.extractAllTo(dir, true);
      ownedRoot = dir;
      // some zips wrap everything in one top folder
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
        const kids = fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isDirectory());
        if (kids.length === 1 && fs.existsSync(path.join(dir, kids[0], 'manifest.json'))) dir = path.join(dir, kids[0]);
      }
      owned = true;
    }
    const m = readManifest(dir);
    const id = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 12);
    const existing = this.records.find(r => r.id === id);
    if (existing) this._unloadEverywhere(existing);
    const rec = {
      id, dir, owned, ownedRoot, source: path.resolve(source), name: displayName(dir, m), version: m.version,
      manifestVersion: m.manifest_version, description: (m.description && !/^__MSG_/.test(m.description)) ? m.description : null,
      permissions: [...(m.permissions || []), ...(m.host_permissions || [])].map(String).slice(0, 40),
      hasOptions: !!(m.options_page || (m.options_ui && m.options_ui.page)),
      enabled: true, allowFileAccess: !!allowFileAccess, installedAt: existing ? existing.installedAt : Date.now(), updatedAt: Date.now(),
      electronId: null, lastError: null,
    };
    this.records = [...this.records.filter(r => r.id !== id), rec];
    this._save();
    let loadError = null, loadedIn = 0;
    for (const ses of this._sessions) {
      try { if (await this._loadInto(ses, rec)) loadedIn++; } catch (e) { loadError = e.message; }
    }
    return { ok: true, extension: { ...rec, loadedIn }, loadError, reinstalled: !!existing };
  }

  async setEnabled(id, enabled) {
    const r = this.records.find(x => x.id === id);
    if (!r) return { ok: false, error: `no extension ${id}` };
    r.enabled = !!enabled; r.updatedAt = Date.now();
    this._save();
    if (!enabled) this._unloadEverywhere(r);
    else for (const ses of this._sessions) await this._loadInto(ses, r).catch(() => {});
    return { ok: true, extension: this.list().find(x => x.id === id) };
  }

  remove(id) {
    const r = this.records.find(x => x.id === id);
    if (!r) return { ok: false, error: `no extension ${id}` };
    this._unloadEverywhere(r);
    this.records = this.records.filter(x => x.id !== id);
    this._save();
    const root = r.ownedRoot || r.dir;
    if (r.owned && path.resolve(root).startsWith(path.resolve(extDir()) + path.sep)) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }
    return { ok: true, removed: id };
  }
}

module.exports = { WebExtensionHost, crxToZip, readManifest, displayName, TABLE, CG_DIR };
