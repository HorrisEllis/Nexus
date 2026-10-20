'use strict';
/**
 * clear-glass/src/net/qbittorrent.js — the one torrent hand-off, verified first (CD3, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec
 * MOD-CDL-QBIT. comp_id: cg.net.qbittorrent
 *
 * His rule (MR12, accepted 2026-10-15): peer traffic needs a proxy or VPN and fails closed; Snowflake/Tor is for browsing and metadata.
 * Tor carries TCP only and the Tor Project asks that BitTorrent not go over it. So a magnet goes to qBittorrent only when qBittorrent's
 * own preferences, read in the same call, show its peer traffic leaving through a SOCKS5/HTTP proxy that is not Tor, or bound to a
 * network interface (a VPN). Nothing is assumed: a client whose settings cannot be read gets nothing.
 *   verify(prefs, { torPorts }) → { ok:true, path } | { ok:false, why }
 *   new QBit({ url, user, pass, fetch }) .add(magnet, { torPorts }) → { ok, hash, path } · .stop(hashes) → { ok }
 * qBittorrent Web API v2 (login, app/version, app/preferences, torrents/add, torrents/stop in v5 or torrents/pause in v4). Built against
 * the documented API and a fake of it; no live qBittorrent was run here.
 */
const PROXY_OK = { 1: 'HTTP', 2: 'SOCKS5', 3: 'HTTP', 4: 'SOCKS5', HTTP: 'HTTP', SOCKS5: 'SOCKS5' };
const TOR_DEFAULT = [9050, 9150];

function verify(prefs, { torPorts = [] } = {}) {
  if (!prefs || typeof prefs !== 'object') return { ok: false, why: 'qBittorrent\'s settings could not be read' };
  const iface = String(prefs.current_network_interface || '').trim();
  const kind = PROXY_OK[prefs.proxy_type];
  const port = Number(prefs.proxy_port); const tor = new Set([...TOR_DEFAULT, ...torPorts.map(Number)]);
  if (kind) {
    if (tor.has(port)) return { ok: false, why: `qBittorrent's proxy is on port ${port}, a Tor port. Tor carries TCP only and the Tor Project asks that BitTorrent not use it; set a SOCKS5 or VPN proxy instead` };
    if (prefs.proxy_peer_connections !== true) return { ok: false, why: 'qBittorrent has a proxy, but "Use proxy for peer connections" is off: peers would see your address' };
    return { ok: true, path: `${kind} proxy ${prefs.proxy_ip || '?'}:${port || '?'} for peer connections${iface ? `, bound to ${iface}` : ''}` };
  }
  if (iface) return { ok: true, path: `bound to network interface ${iface} (a VPN, as you set it)` };
  return { ok: false, why: 'qBittorrent sends peer traffic directly: set a SOCKS5/HTTP proxy with "Use proxy for peer connections", or bind it to your VPN interface (Advanced → Network interface)' };
}

class QBit {
  constructor({ url = 'http://127.0.0.1:8080', user = '', pass = '', fetch = globalThis.fetch, timeoutMs = 10000 } = {}) {
    this.url = String(url).replace(/\/+$/, ''); this.user = user; this.pass = pass; this.fetch = fetch; this.timeoutMs = timeoutMs; this.sid = null; this.major = null;
  }
  async _req(p, { method = 'GET', form } = {}) {
    const headers = { Referer: this.url, Origin: this.url };
    if (this.sid) headers.Cookie = `SID=${this.sid}`;
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const res = await this.fetch(this.url + p, { method, headers, body: form ? new URLSearchParams(form).toString() : undefined, signal: AbortSignal.timeout(this.timeoutMs) });
    return res;
  }
  async login() {
    const res = await this._req('/api/v2/auth/login', { method: 'POST', form: { username: this.user, password: this.pass } });
    const text = await res.text();
    const sc = (res.headers && (res.headers.get ? res.headers.get('set-cookie') : res.headers['set-cookie'])) || '';
    const m = /SID=([^;]+)/.exec(String(sc)); if (m) this.sid = m[1];
    if (!res.ok || !/^Ok/i.test(text.trim())) throw new Error(res.status === 403 ? 'qBittorrent refused the login (banned after failed tries?)' : 'qBittorrent refused the user name or password');
    try { const v = await (await this._req('/api/v2/app/version')).text(); this.major = Number((/v?(\d+)/.exec(v) || [])[1]) || null; } catch (_) { this.major = null; }
  }
  async preferences() { const r = await this._req('/api/v2/app/preferences'); if (!r.ok) throw new Error(`preferences: HTTP ${r.status}`); return r.json(); }

  /** check({ torPorts }) — login + read + verify; nothing added. */
  async check({ torPorts = [] } = {}) {
    try { await this.login(); return verify(await this.preferences(), { torPorts }); }
    catch (e) { return { ok: false, why: `qBittorrent at ${this.url} could not be checked: ${e.message}` }; }
  }
  async add(magnet, { torPorts = [] } = {}) {
    if (!magnet || !(magnet.infoHash || magnet.v2)) return { ok: false, error: 'not a magnet' };
    const v = await this.check({ torPorts });            // verified in the same call as the add (GATE-CDL-VERIFY)
    if (!v.ok) return { ok: false, error: v.why };
    try {
      const r = await this._req('/api/v2/torrents/add', { method: 'POST', form: { urls: magnet.raw } });
      const t = (await r.text()).trim();
      if (!r.ok || /fail/i.test(t)) return { ok: false, error: `qBittorrent did not add it (${t || r.status})` };
      return { ok: true, hash: magnet.infoHash || magnet.v2, path: v.path };
    } catch (e) { return { ok: false, error: `qBittorrent add failed: ${e.message}` }; }
  }
  async stop(hashes = []) {
    if (!hashes.length) return { ok: true, stopped: 0 };
    try {
      if (!this.sid) await this.login();
      const form = { hashes: hashes.join('|') };
      let r = await this._req(this.major && this.major < 5 ? '/api/v2/torrents/pause' : '/api/v2/torrents/stop', { method: 'POST', form });
      if (r.status === 404) r = await this._req('/api/v2/torrents/pause', { method: 'POST', form });   // v4 without a version answer
      return r.ok ? { ok: true, stopped: hashes.length } : { ok: false, error: `HTTP ${r.status}` };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

module.exports = { verify, QBit, TOR_DEFAULT };
