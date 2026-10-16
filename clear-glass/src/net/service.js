'use strict';
/**
 * clear-glass/src/net/service.js — the one door for routes and the transport (NP1+NP2+NP3 slice, 0.60.60).
 * comp_id: cg.net.service
 *
 * CLI first (James's order): src/ipc/bridge.js exposes this as /cli/net/*, idearium/cli/route-commands.js as `net`, lib/agent-tools as clear_glass_net.
 * HONEST STATE: routes are applied to a session only when it has been REGISTERED here (contexts/manager.js registers agent windows). Provider-chat and
 * login windows are not registered yet. The leak test (NP5) is not built, so nothing is ever reported as Verified. Both are in status().
 * Default posture: no rules => nothing routed and no session touched.
 */
const Policy = require('./policy');
const { TransportHost } = require('./transport-host');

const EMPTY = () => ({ default: 'direct', rules: [], bridgeLine: null, torPath: null, snowflakePath: null });

class NetService {
  constructor({ store, host, log = console.warn } = {}) {
    this.store = store || { get: () => null, set: () => {} };
    this.log = log;
    this.sessions = new Map();   // partition -> { ses, ctx:{provider, caller} }
    this._host = host || null;
  }
  bindStore(store) { this.store = store; }
  host(deps) {
    if (!this._host) {
      this._host = new TransportHost({ ...deps, config: this._config() });
      this._host.on('state', () => { this.reapplyAll().catch(e => this.log(`[net] reapply failed: ${e.message}`)); });
    }
    return this._host;
  }
  policy() { const p = this.store.get() || EMPTY(); return { ...EMPTY(), ...p }; }
  _save(p) { this.store.set(p); if (this._host) this._host.d.config = this._config(); }
  _config() { const p = this.policy(); return { torPath: p.torPath, snowflakePath: p.snowflakePath, bridgeLine: p.bridgeLine }; }

  routes() { return { ok: true, default: this.policy().default, rules: this.policy().rules }; }
  addRoute(rule) { const r = Policy.addRule(this.policy(), rule); if (!r.ok) return r; this._save(r.policy); this.reapplyAll().catch(() => {}); return { ok: true, rule: r.rule, note: this.statusNote() }; }
  removeRoute(id) { const r = Policy.removeRule(this.policy(), id); if (!r.ok) return r; this._save(r.policy); this.reapplyAll().catch(() => {}); return { ok: true, removed: id }; }
  setDefault(via) {
    if (!Policy.parseVia(via)) return { ok: false, error: 'default must be direct, block, transport, socks5://host:port or http://host:port' };
    this._save({ ...this.policy(), default: via }); this.reapplyAll().catch(() => {}); return { ok: true, default: via };
  }
  setBridge(line) {
    if (!/^(Bridge\s+)?snowflake\s+\S+/i.test(String(line || ''))) return { ok: false, error: 'that is not a Snowflake bridge line (it starts with "snowflake ")' };
    this._save({ ...this.policy(), bridgeLine: String(line).trim() }); return { ok: true, set: true };
  }
  setPaths({ torPath, snowflakePath }) { this._save({ ...this.policy(), ...(torPath !== undefined ? { torPath } : {}), ...(snowflakePath !== undefined ? { snowflakePath } : {}) }); return { ok: true }; }
  resolve(req) { return Policy.resolve(this.policy(), req); }
  /** §0.60.109 TL3 — setTlsLayer(port | null): the TLS layer is up on port (Firefox-persona sessions route through it), or down (they go direct). */
  setTlsLayer(port) { const v = port || null; if (v === (this.tlsLayer || null)) return Promise.resolve([]); this.tlsLayer = v; return this.reapplyAll(); }
  statusNote() { return 'Applied to registered agent windows only; provider and login windows are not routed yet. Leak test not built: nothing is shown as Verified.'; }

  status() {
    const p = this.policy(); const t = this._host ? this._host.status() : { state: 'stopped', progress: 0, socksPort: null };
    return { ok: true, default: p.default, rules: p.rules.length, transport: t, sessions: [...this.sessions.keys()], collisions: Policy.conflicts(p.rules), verified: false, verifiedWhy: 'the leak test (NP5) is not built yet', note: this.statusNote() };
  }

  /** register(partition, ses, ctx) — remember a session and apply to it now. */
  async register(partition, ses, ctx = {}) { this.sessions.set(partition, { ses, ctx }); return this.applyTo(partition); }
  unregister(partition) { this.sessions.delete(partition); }
  async applyTo(partition) {
    const e = this.sessions.get(partition); if (!e) return { ok: false, error: 'not registered' };
    const t = this._host ? this._host.status() : { socksPort: null };
    const pac = Policy.pacFor(this.policy(), e.ctx, { socksPort: t.socksPort }, { tlsPort: this.tlsLayer || null });
    if (pac === null) { if (e.touched) { await e.ses.setProxy({ mode: 'system' }); e.touched = false; return { ok: true, applied: 'cleared' }; } return { ok: true, applied: false, reason: 'no rule applies; session left alone' }; }
    await e.ses.setProxy({ mode: 'pac_script', pacScript: 'data:application/x-ns-proxy-autoconfig;base64,' + Buffer.from(pac, 'utf8').toString('base64') });
    e.touched = true;
    return { ok: true, applied: true };
  }
  async reapplyAll() { const out = []; for (const k of this.sessions.keys()) { try { out.push([k, await this.applyTo(k)]); } catch (e) { out.push([k, { ok: false, error: e.message }]); this.log(`[net] ${k}: ${e.message}`); } } return out; }
}

let _svc = null;
function service() { return _svc || (_svc = new NetService()); }
module.exports = { NetService, service, EMPTY };
