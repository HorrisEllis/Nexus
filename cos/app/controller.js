'use strict';
/**
 * cos/app/controller.js — what the COS window calls: one object over the store, runtime and switch (COSA6, 0.60.68)
 * comp_id: cos.app.controller
 * UUID: cos-app-controller-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-15-cos-app-phasemap.spec (COSA6_the_exe)
 *
 * James, 2026-10-16: "cos app for windows"
 *
 * The window is a screen over the CLI's own functions, not a second implementation: every button is one method here, and every method is one call into
 * store.js / runtime.js / switch.js. Electron is not required to load this file, so it is tested without one. One operation per project at a time: a second
 * click on Switch while the first is running is refused with a reason, never queued behind it unseen.
 */
const Store = require('./store.js'); const Settings = require('./settings.js'); const RT = require('./runtime.js'); const SW = require('./switch.js');

class Controller {
  constructor({ root = Store.defaultRoot(), opts = {}, store = Store, rt = RT, sw = SW, onEvent = () => {}, idle = null } = {}) {
    this.root = root; this.opts = opts; this.store = store; this.rt = rt; this.sw = sw; this.emit = onEvent; this.busy = new Map(); this.idleProbe = idle; this.waiting = new Map();
  }
  async _exclusive(project, what, fn) {
    if (this.busy.has(project)) return { ok: false, reason: 'busy', error: `${project} is busy (${this.busy.get(project)}): wait for it to finish` };
    this.busy.set(project, what); this.emit({ type: 'op.start', project, what });
    try { const r = await fn(); this.emit({ type: 'op.done', project, what, ok: !!(r && r.ok) }); return r; }
    catch (e) { this.emit({ type: 'op.done', project, what, ok: false }); return { ok: false, error: `${what} failed: ${e.message}` }; }
    finally { this.busy.delete(project); }
  }
  settings() { return Settings.load(this.root); }
  setSetting(key, value) { const r = Settings.set(this.root, key, value); if (r.ok) this.emit({ type: 'settings', key, value }); return r; }
  /** idle(project) → { idle, why }. Nothing running is nothing to interrupt. A running project is idle only if the injected probe says so: COS has no idle signal from Nexus yet, so without one it is NOT idle (it waits and says why). */
  async idle(project) {
    const run = await this.rt.status(this.root, project); if (!run.running) return { idle: true, why: `${project} is not running` };
    if (typeof this.idleProbe !== 'function') return { idle: false, why: `${project} is running and COS has no idle signal from it yet` };
    try { const r = await this.idleProbe(project, run); return { idle: !!(r && r.idle), why: (r && r.why) || (r && r.idle ? 'idle' : 'busy') }; } catch (e) { return { idle: false, why: `the idle check failed: ${e.message}` }; }
  }
  /**
   * applyPolicy(arrival) — what a newly arrived release (drop, inbox, Clear Glass) does next, by update.policy. arrival is a store.importZip / scanInbox result.
   *   off  → { action:'none' }                                     (it was installed because a person put it there; nothing else happens)
   *   ask  → { action:'offer' }                                    (installed; the window asks)
   *   auto → switch only when ALL hold: checksum verified, newer than the current version, nothing busy, project idle; else { action:'offer'|'waiting', reason }
   * An auto switch is the normal switch: preflight, data snapshot, health check, automatic rollback.
   */
  async applyPolicy(arrival) {
    if (!arrival || !arrival.ok || arrival.already) return { action: 'none', reason: arrival && arrival.already ? 'already installed' : 'nothing new arrived' };
    const policy = this.settings().settings.update.policy; const { project, version } = arrival;
    if (policy === 'off') return { action: 'none', policy, reason: 'update.policy is off' };
    if (policy === 'ask') return { action: 'offer', policy };
    const cur = (this.store.list(this.root, project)[0] || {}).current;
    if (!arrival.verified) return { action: 'offer', policy, reason: 'no checksum was found beside the zip, so COS will not switch to it by itself' };
    if (cur && this.store.cmpVer(version, cur) <= 0) return { action: 'offer', policy, reason: `${version} is not newer than the current ${cur}` };
    if (this.busy.has(project)) return { action: 'waiting', policy, reason: `${project} is busy (${this.busy.get(project)})` };
    const id = await this.idle(project); if (!id.idle) { this.waiting.set(project, version); this.emit({ type: 'waiting', project, version, reason: id.why }); return { action: 'waiting', policy, reason: id.why }; }
    this.waiting.delete(project); const r = await this.switchTo(project, version);
    this.emit({ type: 'auto.switch', project, version, ok: !!r.ok }); return { action: 'switched', policy, ok: !!r.ok, result: r };
  }
  /** retryWaiting() — called on a timer: a release that was waiting for its project to go idle is applied once it is */
  async retryWaiting() { const out = []; for (const [project, version] of Array.from(this.waiting)) out.push(await this.applyPolicy({ ok: true, project, version, verified: true })); return out; }
  /** state() → what the window draws: every project with its versions and whether it is running and healthy right now */
  async state() {
    const s = this.store.status(this.root);
    const projects = []; for (const p of s.projects) { const run = await this.rt.status(this.root, p.project); projects.push({ ...p, run, busy: this.busy.get(p.project) || null }); }
    return { ok: true, root: s.root, platform: s.platform, inbox: s.inbox, projects, settings: this.settings().settings, waiting: Object.fromEntries(this.waiting) };
  }
  importZip(zipPath, o = {}) { const r = this.store.importZip(this.root, zipPath, o); if (r.ok && !r.already) this.emit({ type: 'imported', project: r.project, version: r.version }); return r; }
  scanInbox(o = {}) { const rs = this.store.scanInbox(this.root, o); for (const r of rs) if (r.ok && !r.already) this.emit({ type: 'imported', project: r.project, version: r.version }); return { ok: true, results: rs }; }
  switchTo(project, version) { return this._exclusive(project, `switching to ${version}`, () => this.sw.switchTo(this.root, project, version, this.opts)); }
  rollback(project, { restoreData = false } = {}) { return this._exclusive(project, 'rolling back', () => this.sw.rollback(this.root, project, { ...this.opts, restoreData })); }
  async start(project) { const st = this.store.list(this.root, project)[0]; if (!st || !st.current) return { ok: false, error: `${project} has no current version: switch to one first` }; return this._exclusive(project, `starting ${st.current}`, () => this.rt.start(this.root, project, st.current, this.opts)); }
  stop(project) { return this._exclusive(project, 'stopping', () => this.rt.stop(this.root, project, this.opts)); }
  remove(project, version) { return this._exclusive(project, `removing ${version}`, async () => this.store.remove(this.root, project, version)); }
  logs(project, lines = 80) { return { ok: true, ...this.rt.logs(this.root, project, { lines }) }; }
  /** stopAll() — on quit: the projects COS started are stopped with it (the window is the owner; a project left running with no window would be invisible) */
  async stopAll() { const out = []; for (const p of this.store.list(this.root)) out.push({ project: p.project, ...(await this.rt.stop(this.root, p.project, this.opts)) }); return out; }
}
module.exports = { Controller };
