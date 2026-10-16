'use strict';
/**
 * clear-glass/src/chats/service.js — starts, stops and reports the chat crawler per account (PI5b, 0.60.64)
 * comp_id: cg.chats.service
 * UUID: cg-chats-service-v1-0000-2026-1016-jamesbrooks-001
 *
 * James, 2026-10-16: "build it."  One crawler per account key ("chatgpt:a1"), run in the background, off until the account's switch is on in
 * Settings > Chat capture. Nothing here reads a page: that is ports.js; nothing here decides what to visit: that is the plan. This is only the lifecycle.
 */
const S = require('../../../lib/chat-crawl-settings.js');
const { Crawler } = require('./crawler.js');
const Ports = require('./ports.js');

class ChatCrawlService {
  /** deps: engine() → automation engine; settings() → { global, accounts }; dir; makePorts (tests); onEvent */
  constructor({ engine, settings, dir, makePorts = Ports.makePorts, onEvent = () => {} } = {}) {
    this.engine = engine; this.settings = settings; this.dir = dir; this.makePorts = makePorts; this.onEvent = onEvent; this.run = new Map();
  }
  _parse(accountKey) { const m = /^([a-z][a-z0-9_-]*):([A-Za-z0-9-]+)$/.exec(String(accountKey || '')); return m ? { provider: m[1], accountId: m[2] } : null; }
  cfgFor(accountKey) { const s = this.settings() || {}; return S.effective(s.global || {}, (s.accounts || {})[accountKey] || {}); }

  start(accountKey, { partition } = {}) {
    const k = this._parse(accountKey); if (!k) return { ok: false, error: `"${accountKey}" is not an account key (provider:accountId, like chatgpt:a1)` };
    if (this.run.get(accountKey)?.running) return { ok: false, error: 'already running', running: true };
    const cfg = this.cfgFor(accountKey);
    if (!cfg.enabled) return { ok: false, error: 'capture is off for this account: turn it on in Settings > Chat capture first (nothing is read from an account that is off)' };
    if (!Ports.PROVIDERS[k.provider]) return { ok: false, error: `no chat page is known for "${k.provider}" yet (known: ${Object.keys(Ports.PROVIDERS).join(', ')})` };
    const engine = this.engine(); if (!engine) return { ok: false, error: 'the automation engine is not running' };
    let crawler;
    try { crawler = new Crawler({ accountKey, cfg, onEvent: this.onEvent, ports: this.makePorts({ engine, accountKey, provider: k.provider, partition: partition || `persist:agent-${k.accountId}`, cfg, dir: this.dir }) }); }
    catch (e) { return { ok: false, error: e.message }; }
    const rec = { crawler, running: true, startedAt: Date.now(), last: null, error: null }; this.run.set(accountKey, rec);
    crawler.run().then(r => { rec.last = r; }).catch(e => { rec.error = e.message; }).finally(() => { rec.running = false; });
    return { ok: true, started: accountKey };
  }
  stop(accountKey) { const r = this.run.get(accountKey); if (!r) return { ok: false, error: 'not running' }; r.crawler.stop(); return { ok: true, stopping: accountKey }; }
  status(accountKey) {
    if (accountKey) { const r = this.run.get(accountKey); return r ? { ok: true, account: accountKey, running: r.running, startedAt: r.startedAt, last: r.last, error: r.error, ...r.crawler.status() } : { ok: false, error: 'not started in this session' }; }
    return { ok: true, accounts: [...this.run.keys()].map(k => ({ account: k, running: this.run.get(k).running, ...this.run.get(k).crawler.status() })) };
  }
}
module.exports = { ChatCrawlService };
