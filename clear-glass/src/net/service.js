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

const EMPTY = () => ({ default: 'direct', rules: [], bridgeLine: null, torPath: null, snowflakePath: null, httpsOnly: true });   // httpsOnly: SF4 (0.60.178), on unless he turns it off

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
  /**
   * §0.60.168 — one-button setup of the Tor·Snowflake programs. setupStart({ installer }) begins the download in the background and returns at once
   * (the bundle is tens of MB; a request would time out), setupStatus() is what the UI polls. When the install finishes: the two paths are saved, the
   * bundle's own Snowflake bridge line is used if none is set yet, and the transport is restarted (stopped if it was running, then started when it has
   * everything it needs). Nothing is routed by this: the default posture and the rules are untouched.
   */
  setupStatus() { return { ok: true, ...(this._setup || { phase: 'idle', pct: 0, message: '', running: false }) }; }
  setupStart({ installer, force = false, allowUnverified = false } = {}) {
    if (this._setup && this._setup.running) return { ok: true, already: true, ...this.setupStatus() };
    if (!installer) return { ok: false, error: 'no installer available' };
    const job = this._setup = { running: true, phase: 'resolving', pct: 0, message: 'Starting…', result: null, error: null, startedAt: Date.now() };
    const upd = (p) => { if (this._setup === job) { job.phase = p.phase; job.pct = p.pct; job.message = p.message; } };
    (async () => {
      const r = await installer.install({ force, allowUnverified, onProgress: upd });
      if (!r.ok) { job.error = r.error; job.phase = 'failed'; job.message = r.error; return; }
      upd({ phase: 'configuring', pct: 94, message: 'Pointing the transport at the new programs…' });
      this.setPaths({ torPath: r.torPath, snowflakePath: r.snowflakePath });
      const had = !!this.policy().bridgeLine; let bridge = had ? 'kept' : 'none';
      if (!had && r.bridgeLines && r.bridgeLines.length) { this.setBridge(r.bridgeLines[0]); bridge = 'from-bundle'; }
      let restarted = false;
      if (this._host) {
        upd({ phase: 'restarting', pct: 97, message: 'Restarting the transport…' });
        const st = this._host.status().state;
        if (['starting', 'bootstrapping', 'ready'].includes(st)) await this._host.stop({});
        if (this.policy().bridgeLine) { const sr = await this._host.start(); restarted = !!sr.ok; if (!sr.ok) job.note = sr.error; }
      }
      job.result = { action: r.action, version: r.version, verified: r.verified, torPath: r.torPath, snowflakePath: r.snowflakePath, bridge, bridgeLines: (r.bridgeLines || []).length, restarted, note: r.note || job.note || null };
      job.phase = 'done'; job.pct = 100;
      job.message = !this.policy().bridgeLine ? 'Installed. No bridge line came with the bundle — paste one below, then press Start.' : restarted ? 'Installed, and the transport was restarted.' : 'Installed.';
    })().catch(e => { job.error = e.message; job.phase = 'failed'; job.message = e.message; }).finally(() => { job.running = false; });
    return { ok: true, started: true, ...this.setupStatus() };
  }
  /**
   * SF2/SF4/SF5 (0.60.178, clear-glass/spec/snowflake.spec). findBridges({ local }) lists real lines found on this machine (src/net/bridge-sources.js);
   * the found list is kept here so `use <n>` picks from what he was shown, and no line is ever typed in by code. builtinBridges({ builtin }) is his
   * button: it asks the Tor Project directly. httpsOnly is his switch for routed windows. checkCircuit asks check.torproject.org through the transport.
   */
  findBridges({ local } = {}) {
    if (typeof local !== 'function') return { ok: false, error: 'no bridge source available' };
    const r = local(); this._found = r.lines || [];
    return { ok: true, lines: this._found.map((c, i) => ({ n: i + 1, ...c })), torBrowser: r.torBrowser || null };
  }
  async builtinBridges({ builtin } = {}) {
    if (typeof builtin !== 'function') return { ok: false, error: 'no builtin source available' };
    const r = await builtin(); if (!r.ok) return r;
    const have = new Set((this._found || []).map(c => c.line));
    this._found = [...(this._found || []), ...r.lines.filter(c => !have.has(c.line))];
    return { ok: true, lines: this._found.map((c, i) => ({ n: i + 1, ...c })) };
  }
  useBridge(n) {
    const c = (this._found || [])[Number(n) - 1];
    if (!c) return { ok: false, error: `no found line ${n}: run "net bridges" (or Find bridge line) first` };
    const r = this.setBridge(c.line); return r.ok ? { ok: true, source: c.source, path: c.path } : r;
  }
  setHttpsOnly(on) { this._save({ ...this.policy(), httpsOnly: !!on }); return { ok: true, httpsOnly: !!on }; }
  async checkCircuit({ fetchVia } = {}) {
    const t = this._host ? this._host.status() : { state: 'stopped' };
    if (t.state !== 'ready' || !t.socksPort) return { ok: false, error: 'start the transport first (it is ' + t.state + ')' };
    if (typeof fetchVia !== 'function') return { ok: false, error: 'no way to fetch through the transport here' };
    const at = Date.now();
    try {
      const text = await fetchVia('https://check.torproject.org/api/ip', t.socksPort);
      let j; try { j = JSON.parse(text); } catch (_) { throw new Error('check.torproject.org did not answer with JSON'); }
      this._lastCheck = { ok: true, isTor: j.IsTor === true, ip: j.IP || null, at, error: null };
    } catch (e) { this._lastCheck = { ok: false, isTor: null, ip: null, at, error: e.message }; }
    return this._lastCheck;
  }
  resolve(req) { return Policy.resolve(this.policy(), req); }
  /** §0.60.109 TLS3 — setTlsLayer(port | null): the TLS layer is up on port (Firefox-persona sessions route through it), or down (they go direct). */
  setTlsLayer(port) { const v = port || null; if (v === (this.tlsLayer || null)) return Promise.resolve([]); this.tlsLayer = v; return this.reapplyAll(); }
  statusNote() { return 'Applied to registered agent windows only; provider and login windows are not routed yet. Leak test not built: nothing is shown as Verified.'; }

  status() {
    const p = this.policy(); const t = this._host ? this._host.status() : { state: 'stopped', progress: 0, socksPort: null };
    return { ok: true, default: p.default, rules: p.rules.length, transport: t, bridgeLine: p.bridgeLine ? 'set' : null, httpsOnly: p.httpsOnly !== false, lastCheck: this._lastCheck || null, sessions: [...this.sessions.keys()], collisions: Policy.conflicts(p.rules), verified: false, verifiedWhy: 'the leak test (NP5) is not built yet', note: this.statusNote() };
  }

  /** register(partition, ses, ctx) — remember a session and apply to it now. */
  async register(partition, ses, ctx = {}) { this.sessions.set(partition, { ses, ctx }); return this.applyTo(partition); }
  unregister(partition) { this.sessions.delete(partition); }
  async applyTo(partition) {
    const e = this.sessions.get(partition); if (!e) return { ok: false, error: 'not registered' };
    const t = this._host ? this._host.status() : { socksPort: null };
    // §0.60.169 — a window opened with ctx.via ("Open link with Snowflake") goes through that route and nothing else: its own policy of one default, no rules.
    // Down transport => the PAC is the blackhole (fail closed), never a direct fallback. Google's sign-in stays on the transport too: the person chose it for this window.
    const pol = e.ctx.via ? { default: e.ctx.via, rules: [], signinOverTransport: true } : this.policy();
    const pac = Policy.pacFor(pol, e.ctx, { socksPort: t.socksPort }, { tlsPort: this.tlsLayer || null });
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
