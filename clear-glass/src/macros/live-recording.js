'use strict';
/**
 * clear-glass/src/macros/live-recording.js — a recording that IS a .macro node file from the first second (MR1, 0.60.57)
 * comp_id: cg.macros.live-recording
 *
 * James, 2026-10-15: "this is wrong... needs to start recording a macro node file."
 * start() writes the node (0 steps) before any event exists, then every drain rewrites it from ALL events so far, so a closed dialog, a
 * reload or a crash leaves a real file with everything up to the last flush. Navigation is seen here, in main (the page cannot see it).
 * Everything impure is injected (webContents, evalJs, dir, clock, timers) so tests run with a fake.
 */
const fs = require('fs');
const { INSTALL, DRAIN } = require('./recorder-script');
const { recordingToSteps } = require('./recording');
const nodes = require('../../../lib/automation-nodes.js');

class LiveRecorder {
  constructor({ getWebContents, evalJs, dir, now = Date.now, setTimer = setInterval, clearTimer = clearInterval, pollMs = 400 } = {}) {
    this.getWebContents = getWebContents; this.evalJs = evalJs; this.dir = dir; this.now = now;
    this.setTimer = setTimer; this.clearTimer = clearTimer; this.pollMs = pollMs;
    this.sessions = new Map();
  }
  _macro(s) {
    const { steps, params } = recordingToSteps(s.events, { startUrl: s.startUrl });
    return { name: s.name, uuid: s.uuid, steps, params, description: s.description, createdAt: s.createdAt, urlPattern: null };
  }
  _write(s) {
    const m = this._macro(s);
    const n = nodes.macroNode(m);
    if (!n.ok) return n;
    fs.writeFileSync(s.file, n.text, 'utf8');
    s.stepCount = m.steps.length;
    return { ok: true, steps: m.steps, params: m.params };
  }
  async _install(s) { try { await this.evalJs(s.wc, INSTALL); } catch (e) { s.errors++; s.lastError = e.message; } }

  /** start({agentId, name}) -> { ok, file, name } — the file exists when this returns */
  async start({ agentId, name } = {}) {
    if (!agentId) return { ok: false, error: 'agentId required' };
    if (this.sessions.has(agentId)) return { ok: false, error: 'already recording this tab', file: this.sessions.get(agentId).file };
    const wc = this.getWebContents(agentId);
    if (!wc) return { ok: false, error: `No webcontents for agent: ${agentId}` };
    const t = this.now();
    const s = { agentId, wc, events: [], errors: 0, lastError: null, stepCount: 0, createdAt: t,
      uuid: `rec-${t.toString(36)}`, name: (name && String(name).trim()) || `Recording ${new Date(t).toISOString().slice(0, 16).replace('T', ' ')}`,
      description: 'Recorded live from a tab (Settings -> Macros -> Record).', startUrl: null, listeners: [] };
    try { s.startUrl = await this.evalJs(wc, INSTALL); } catch (e) { return { ok: false, error: e.message }; }
    const first = nodes.macroNode(this._macro(s));
    if (!first.ok) return first;
    s.file = nodes.saveNode(this.dir, { text: first.text, filename: first.filename });
    const nav = (ev, url) => { s.events.push({ type: 'navigate', url: typeof ev === 'string' ? ev : url, ts: this.now() }); };
    const reinstall = () => this._install(s);
    for (const [evn, fn] of [['did-navigate', nav], ['did-navigate-in-page', (e, u, main) => { if (main !== false) nav(e, u); }], ['dom-ready', reinstall]]) {
      if (wc.on) { wc.on(evn, fn); s.listeners.push([evn, fn]); }
    }
    s.timer = this.setTimer(() => { this.flush(agentId).catch(() => {}); }, this.pollMs);
    this.sessions.set(agentId, s);
    return { ok: true, file: s.file, name: s.name, startUrl: s.startUrl };
  }

  /** drain the page queue and rewrite the file. Safe to call at any time. */
  async flush(agentId) {
    const s = this.sessions.get(agentId); if (!s) return { ok: false, error: 'not recording' };
    if (s.busy) return { ok: true, skipped: true };
    s.busy = true;
    try {
      let got = [];
      try { got = (await this.evalJs(s.wc, DRAIN)) || []; } catch (e) { s.errors++; s.lastError = e.message; }
      if (got.length) s.events.push(...got.filter(e => e && e.type));
      s.events.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const w = this._write(s);
      return { ...w, events: s.events.length, errors: s.errors };
    } finally { s.busy = false; }
  }
  status(agentId) {
    const s = this.sessions.get(agentId); if (!s) return { ok: true, recording: false };
    return { ok: true, recording: true, file: s.file, name: s.name, events: s.events.length, steps: s.stepCount, errors: s.errors, lastError: s.lastError };
  }
  /** stop -> { ok, file, steps, params, events } ; keep=false deletes nothing: the node stays (§0.3) */
  async stop(agentId) {
    const s = this.sessions.get(agentId); if (!s) return { ok: false, error: 'not recording' };
    const w = await this.flush(agentId);
    this.clearTimer(s.timer);
    if (s.wc.removeListener) for (const [e, f] of s.listeners) s.wc.removeListener(e, f);
    this.sessions.delete(agentId);
    return { ok: true, file: s.file, name: s.name, events: s.events.length, steps: (w && w.steps) || [], params: (w && w.params) || [], errors: s.errors };
  }
}
module.exports = { LiveRecorder };
