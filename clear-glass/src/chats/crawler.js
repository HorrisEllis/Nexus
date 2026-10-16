'use strict';
/**
 * clear-glass/src/chats/crawler.js — drives lib/chat-crawl-plan.js: reads the chat list, visits one chat at a time, reports, saves (PI5, 0.60.63)
 * comp_id: cg.chats.crawler
 * UUID: cg-chats-crawler-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-15-personal-chat-import-phasemap.spec (PI5_the_crawler)
 *
 * James, 2026-10-15: "log each chat, by url, one by one until it's done. then once thats done it logs one by one until it's caught up. only logging novel data,
 * but each one interconnected." · 2026-10-16: "chatgpt the thing we talked about earlier, that indexes novel one by one"
 *
 * The plan decides; this runs it. It owns no tab and no page: every touch of the outside goes through a PORT, so the whole loop is provable here and the
 * Clear Glass wiring is only the three ports:
 *   readList({ more })  → { ok, list:[{url,title,updated,nexus}], complete } | { ok:false, kind:'login'|'challenge'|'ratelimit'|'error', error }
 *   visit(url)          → { kind:'ok'|'login'|'challenge'|'ratelimit'|'error'|'empty', turns, hash, updated, error }   (the reading workflow; the chat ledger logs the turns)
 *   load() / save(state) the plan's state, kept by the caller so a restart continues from the same place
 * It never types, sends or clicks: that is the ports' contract, stated in the map's risks.
 */
const Plan = require('../../../lib/chat-crawl-plan.js');
const S = require('../../../lib/chat-crawl-settings.js');

class Crawler {
  constructor({ accountKey, cfg = S.defaults(), ports = {}, onEvent = () => {} } = {}) {
    if (!accountKey) throw new Error('crawler needs an accountKey');
    for (const k of ['readList', 'visit', 'load', 'save']) if (typeof ports[k] !== 'function') throw new Error(`crawler needs port ${k}`);
    this.accountKey = accountKey; this.cfg = cfg; this.p = ports; this.emit = onEvent;
    this.now = ports.now || Date.now; this.sleep = ports.sleep || ((ms) => new Promise(r => setTimeout(r, ms))); this.rng = ports.rng || Math.random;
    this.state = null; this._stop = false;
  }
  _state() { if (!this.state) { this.state = this.p.load() || Plan.create(this.accountKey); } return this.state; }
  _persist() { this.p.save(this.state); }
  stop() { this._stop = true; }
  status() { const st = this._state(); return { phase: st.phase, status: st.status, pausedReason: st.pausedReason, counts: st.counts, audit: Plan.audit(st) }; }

  _pauseFrom(st, r) {   // a list read that hit a wall: stop and wait for him, the same stop rules a visit has
    const ms = r.kind === 'ratelimit' ? this.cfg.coolDownMin * 60e3 * Math.pow(2, st.coolDowns++) : null;
    st.status = 'paused'; st.pausedUntil = ms ? this.now() + ms : null;
    st.pausedReason = r.kind === 'login' ? 'the account is signed out' : r.kind === 'challenge' ? 'a captcha or challenge page appeared' : r.kind === 'ratelimit' ? 'the provider said slow down' : `could not read the chat list: ${r.error || r.kind}`;
  }

  async _maybeReadList(st) {
    const t = this.now(); const everyMs = this.cfg.catchUpEveryMin * 60e3;
    const backfillNeed = st.phase === 'backfill' && (!st.lastListAt || !st.listComplete);
    const catchNeed = st.phase === 'caught-up' && this.cfg.catchUp && (t - st.lastListAt >= everyMs);
    if (!backfillNeed && !catchNeed) return null;
    if (st.phase === 'backfill' && !this.cfg.backfill && !st.lastListAt) { /* handled below once the list is seen */ }
    const r = await this.p.readList({ more: backfillNeed && !!st.lastListAt });
    if (!r || r.ok === false) { this._pauseFrom(st, r || { kind: 'error', error: 'no answer' }); this.emit({ type: 'crawl.list.failed', account: this.accountKey, reason: st.pausedReason }); return { read: false }; }
    if (st.phase === 'backfill' && !this.cfg.backfill && !st.lastListAt) {   // backfill off: what exists now is not read, said so per chat, then only new chats
      for (const e of r.list) st.items[e.url] = { url: e.url, title: e.title || null, state: 'skipped', keepSkipped: true, error: 'before capture began (Read every existing chat is off)', attempts: 0, turns: 0, hash: null, updated: e.updated || null };
      st.phase = 'caught-up'; st.listComplete = true; st.anchor = (r.list[0] || {}).url || null; st.order = r.list.map(e => e.url); st.lastListAt = t; st.lastSweepAt = t;
      this.emit({ type: 'crawl.backfill.skipped', account: this.accountKey, chats: r.list.length }); return { read: true, queued: 0 };
    }
    const o = Plan.observeList(st, r.list, { complete: !!r.complete, now: t }, this.cfg);
    this.emit({ type: 'crawl.list', account: this.accountKey, seen: r.list.length, queued: o.queued, needMore: o.needMore, anchor: o.anchor });
    return { read: true, ...o };
  }

  /** step() → one decision acted on: { action:'visited'|'wait'|'idle'|'stopped'|'off', ... } */
  async step() {
    if (!this.cfg.enabled) return { action: 'off', why: 'capture is off for this account' };
    const st = this._state();
    if (st.status !== 'paused') { await this._maybeReadList(st); if (st.status === 'paused') { this._persist(); return { action: 'stopped', reason: st.pausedReason }; } }
    const a = Plan.next(st, this.cfg, this.now(), this.rng);
    if (a.action !== 'visit') {
      this._persist();
      if (a.action === 'idle') {
        if (st.phase === 'backfill' && !st.listComplete) return { action: 'wait', ms: 5000, why: 'the list is not fully loaded yet' };
        return st.phase === 'caught-up' && this.cfg.catchUp ? { action: 'wait', ms: Math.max(1000, this.cfg.catchUpEveryMin * 60e3 - (this.now() - st.lastListAt)), why: 'caught up; next look at the list' } : { action: 'idle' };
      }
      return a;
    }
    this.emit({ type: 'crawl.visit', account: this.accountKey, url: a.url, why: a.why });
    let res; try { res = await this.p.visit(a.url); } catch (e) { res = { kind: 'error', error: e.message }; }
    const rep = Plan.report(st, a.url, res || { kind: 'error', error: 'no answer' }, this.cfg, this.now());
    this._persist();
    this.emit({ type: 'crawl.visited', account: this.accountKey, url: a.url, kind: (res && res.kind) || 'error', newData: !!rep.newData, paused: rep.paused || null });
    return { action: 'visited', url: a.url, newData: !!rep.newData, paused: rep.paused || null };
  }

  /** run({ maxSteps }) — step until stopped, idle, paused or told to stop; waits are slept (capped), so a hundred chats is a hundred paced visits. */
  async run({ maxSteps = Infinity } = {}) {
    let n = 0, last = null;
    while (!this._stop && n++ < maxSteps) {
      last = await this.step();
      if (last.action === 'off' || last.action === 'idle' || last.action === 'stopped') break;
      if (last.action === 'wait') await this.sleep(Math.min(last.ms, 60e3));
    }
    return last || { action: 'idle' };
  }
}

module.exports = { Crawler };
