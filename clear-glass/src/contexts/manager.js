'use strict';

/**
 * Context Manager
 * One Chromium session partition per agent.
 * Each context is fingerprinted, cookie-isolated, and independently routable.
 * Contexts are SEAM entities — they register into the bus.
 */

const { session } = require('electron');
const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.
const { applyCspBypass, requestHook } = require('./session-headers');

class ContextManager {
  constructor({ fp, vault, sse }) {
    this.fp      = fp;    // FingerprintEngine
    this.vault   = vault; // CookieVault
    this.sse     = sse;
    this.contexts = new Map(); // agentId → Context
  }

  async init() {
    console.log('[ContextMgr] Ready');
  }

  // ── Context lifecycle ─────────────────────────────────────────────────
  async create({ agentId, profileOptions = {}, url, via } = {}) {
    const id = agentId || uuidv4();
    if (this.contexts.has(id)) return this.contexts.get(id);

    // Firefox fingerprint profile
    const profile = this.fp.getOrGenerate(id);

    // Isolated Chromium session partition
    // SF3 (0.60.178) — a window opened through a route (via) is a compartment: an in-memory partition its page shares (main passes it to the
    // <webview>), the engine's own clean UA instead of a persona, WebRTC kept on the proxy, HTTPS-only (src/net/compartment.js)
    const comp = via ? require('../net/compartment') : null;
    const partition = comp ? comp.partitionFor(id) : `persist:agent-${id}`;
    const ses = session.fromPartition(partition, { cache: true });
    applyCspBypass(ses);
    if (comp) {
      const net = require('../net/service').service();
      comp.harden(ses, { httpsOnly: () => net.policy().httpsOnly !== false });
      ses.__cgPartition = partition;   // CD5 — so a webContents on it knows its compartment (quarantine.watch)
      try { net.register(partition, ses, { provider: null, caller: 'person-tab', firefox: false, via }).catch(() => {}); } catch (_) { /* routing is optional */ }
      const ctx = { id, uuid: uuidv4(), profile, session: ses, partition, compartment: true, health: { score: 100, errors: 0, requests: 0, lastCheck: Date.now() }, createdAt: Date.now(), url: url || 'about:blank' };
      this.contexts.set(id, ctx);
      this.sse.emit('context.created', { agentId: id, uuid: ctx.uuid, ua: ses.getUserAgent(), compartment: true, ts: Date.now() });
      return ctx;   // no persona headers, no cookie-vault snapshots: nothing of this window is written to disk
    }
    // 0.60.60 NP3 — routes (src/net): a no-op unless a rule applies to this window; never lets a routing error stop the window opening
    // §0.60.109 TLS3 — a Firefox persona routes its direct https/wss through the TLS layer (cg-tls-helper), so its handshake is
    // Firefox's too; it trusts that layer's local CA, and only for certificates that CA issued (src/tls/helper.js verifyProc).
    // James: "fix it. i don't want the trouble again"
    const firefox = /\bFirefox\//.test(this.fp.getOrGenerate(id).ua || '');
    if (firefox) { try { ses.setCertificateVerifyProc(require('../tls/helper').verifyProc()); } catch (e) { console.warn(`[contexts] TLS layer trust not set on ${id}: ${e.message}`); } }
    try { require('../net/service').service().register(`persist:agent-${id}`, ses, { provider: null, caller: 'person-tab', firefox, ...(via ? { via } : {}) }).catch(() => {}); } catch (_) { /* routing is optional */ }

    // Apply user agent
    ses.setUserAgent(profile.ua);

    // Apply Accept-Language
    ses.setSpellCheckerLanguages([profile.language]);

    // Request header injection — Firefox header order and values
    // (through requestHook: a second onBeforeSendHeaders here used to replace applyCspBypass's localhost one — 2026-10-16)
    requestHook(ses, 'fingerprint-profile', (details, requestHeaders) => {
      // §HC2 0.60.260 — the LIVE profile: this hook closed over the first one, so a switch (switchFingerprint, the engine identity)
      // changed navigator.userAgent but every request still went out as the old persona
      const live = (this.contexts.get(id) || {}).profile || profile;
      if (live.engine) return { ...requestHeaders, 'User-Agent': live.ua };   // the engine's own identity: the request as Chromium sends it
      const headers = { ...requestHeaders };
      const accept = live.accept || profile.accept;
      const isNav  = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
      const set    = isNav ? accept.navigation : accept.fetch;

      // Apply Firefox headers, preserve existing values where appropriate
      for (const [k, v] of Object.entries(set)) {
        if (!headers[k]) headers[k] = v;
      }

      // Override User-Agent always
      headers['User-Agent'] = live.ua;
      // 2026-10-16 — a Firefox persona sends no client hints: Chromium's Sec-CH-UA beside a Firefox UA, on every site, was
      // a Chromium saying it is Firefox (Google's sign-in reads exactly that). James: "do everything you can to prevent that"
      if (/\bFirefox\//.test(live.ua)) for (const k of Object.keys(headers)) if (/^sec-ch-ua/i.test(k)) delete headers[k];

      return headers;
    });

    // Network error tracking for RAID health scoring
    ses.webRequest.onErrorOccurred((details) => {
      this.sse.emit('context.network.error', {
        agentId:    id,
        url:        details.url,
        error:      details.error,
        statusCode: details.statusCode,
        ts:         Date.now(),
      });
      this._updateHealth(id, 'error');
    });

    ses.webRequest.onCompleted((details) => {
      if (details.statusCode >= 400) {
        this._updateHealth(id, 'http-error', details.statusCode);
      } else {
        this._updateHealth(id, 'ok');
      }
    });

    // Cookie change events → SSE + vault
    ses.cookies.on('changed', (event, cookie, cause, removed) => {
      this.sse.emit('cookie.event', {
        agentId: id,
        cookie:  { name: cookie.name, domain: cookie.domain, path: cookie.path },
        cause,
        removed,
        ts:      Date.now(),
      });

      // Auto-snapshot on significant cookie changes
      if (cause === 'explicit' && !removed) {
        this.vault.snapshot(id, ses).catch(() => {});
      }
    });

    const ctx = {
      id,
      uuid:     uuidv4(),
      profile,
      session:  ses,
      partition,   // §HC2 0.60.260 — said, as a compartment's context already says it
      health:   { score: 100, errors: 0, requests: 0, lastCheck: Date.now() },
      createdAt: Date.now(),
      url:      url || 'about:blank',
    };

    this.contexts.set(id, ctx);

    this.sse.emit('context.created', {
      agentId:  id,
      uuid:     ctx.uuid,
      ua:       profile.ua,
      timezone: profile.timezone,
      ts:       Date.now(),
    });

    console.log(`[ContextMgr] Created context: ${id}`);
    return ctx;
  }

  async ensureContext(agentId) {
    return this.contexts.get(agentId) || await this.create({ agentId });
  }

  async switchTo({ agentId }) {
    const ctx = await this.ensureContext(agentId);
    this.sse.emit('context.switched', { agentId, ts: Date.now() });
    return { agentId, profile: ctx.profile };
  }

  async destroy(agentId) {
    const ctx = this.contexts.get(agentId);
    if (!ctx) return;

    if (ctx.compartment) {   // SF3 — nothing kept: unrouted, storage cleared, no vault snapshot
      try { require('../net/service').service().unregister(ctx.partition); } catch (_) {}
      await require('../net/compartment').dispose(ctx.session).catch(() => {});
      this.contexts.delete(agentId);
      this.sse.emit('context.destroyed', { agentId, compartment: true, ts: Date.now() });
      return;
    }
    // Final cookie snapshot before destruction
    await this.vault.snapshot(agentId, ctx.session).catch(() => {});

    this.contexts.delete(agentId);
    this.sse.emit('context.destroyed', { agentId, ts: Date.now() });
  }

  // ── Health scoring for RAID ───────────────────────────────────────────
  _updateHealth(agentId, event, statusCode) {
    const ctx = this.contexts.get(agentId);
    if (!ctx) return;

    ctx.health.requests++;

    if (event === 'error' || event === 'http-error') {
      ctx.health.errors++;

      // Rate limit detection
      if (statusCode === 429) {
        ctx.health.score = Math.max(0, ctx.health.score - 30);
        ctx.health.rateLimited = true;
        ctx.health.rateLimitedAt = Date.now();
        this.sse.emit('context.rate-limited', { agentId, ts: Date.now() });
      } else {
        ctx.health.score = Math.max(0, ctx.health.score - 5);
      }
    } else {
      // Recovery — slow score restoration
      ctx.health.score = Math.min(100, ctx.health.score + 0.5);
      ctx.health.rateLimited = false;
    }

    ctx.health.lastCheck = Date.now();
  }

  getHealth(agentId) {
    return this.contexts.get(agentId)?.health || null;
  }

  // ── Enumeration ───────────────────────────────────────────────────────
  list() {
    return [...this.contexts.entries()].map(([id, ctx]) => ({
      id,
      uuid:      ctx.uuid,
      ua:        ctx.profile.ua,
      health:    ctx.health,
      createdAt: ctx.createdAt,
    }));
  }

  listIds() {
    return [...this.contexts.keys()];
  }

  getSession(agentId) {
    return this.contexts.get(agentId)?.session || null;
  }

  // §HC2 0.60.260 — James, 2026-10-26: "i can't get passed this. can you help? do everything you can, find out why and help." A human
  // check (Fiverr's Press & Hold) reads a Firefox persona on a Chromium engine as a bot. On such a page the tab's session tells the truth:
  // the engine's own user agent and headers, client hints as Chromium sends them, and Chromium's own TLS (not the Firefox layer).
  // It never answers the check: the person does (contexts/human-check.js).
  async useEngineIdentity(agentId, { reason = 'human-check' } = {}) {
    const ctx = this.contexts.get(agentId);
    if (!ctx) return { ok: false, error: `no context ${agentId}` };
    if (ctx.profile && ctx.profile.engine) return { ok: true, agentId, already: true, ua: ctx.profile.ua };
    const ua = require('./human-check').engineUserAgent(session);
    if (!ua) return { ok: false, error: 'the engine user agent is unknown' };
    ctx.session.setUserAgent(ua);
    this._pagesUa(ctx.session, ua);   // a page already open keeps the UA it was made with (found under xvfb): each one is told too
    ctx.profile = { ...(ctx.profile || {}), ua, engine: true };
    ctx.fpMode = 'engine';
    try { ctx.session.setCertificateVerifyProc(null); } catch (_) {}   // Chromium's own certificate checks again (TLS3 trusted the Firefox layer's CA)
    if (!ctx.compartment) { try { require('../net/service').service().register(`persist:agent-${agentId}`, ctx.session, { provider: null, caller: 'person-tab', firefox: false }).catch(() => {}); } catch (_) {} }
    this.sse.emit('context.fp.switched', { agentId, mode: 'engine', ua, reason, ts: Date.now() });
    return { ok: true, agentId, mode: 'engine', ua };
  }

  /** every open page on a session takes the new user agent (Electron gives a webContents its UA when it is made) */
  _pagesUa(ses, ua) {
    try { for (const w of require('electron').webContents.getAllWebContents()) if (!w.isDestroyed() && w.session === ses) w.setUserAgent(ua); } catch (_) {}
  }

  /** the context whose session a webContents runs on (a tab's <webview> shares its window's partition) */
  contextForSession(ses) { for (const c of this.contexts.values()) if (c.session === ses) return c; return null; }

  // ── Fingerprint mode switching ─────────────────────────────────────────
  // Called via 'context.fp.switch' gate
  // modes: 'firefox' | 'chrome' | 'safari' | 'edge'
  async switchFingerprint({ agentId, mode = 'firefox', options = {} }) {
    if (mode === 'engine') return this.useEngineIdentity(agentId, { reason: options.reason || 'asked' });   // §HC2
    const ctx = await this.ensureContext(agentId);
    if (ctx.profile && ctx.profile.engine && options.reason && /^hostile:/.test(options.reason)) return { agentId, mode: 'engine', refused: 'this tab tells a human check the truth; a persona would fail it again' };
    // SF3 — a compartment keeps the engine's own identity; a persona on it would be a Chromium claiming to be something else, over Tor
    if (ctx.compartment) return { agentId, mode: 'chromium', ua: ctx.session.getUserAgent(), refused: 'a routed (Snowflake) window keeps its ordinary Chromium identity' };

    let profile;
    if (mode === 'firefox') {
      profile = this.fp.generate(agentId + '-ff-' + Date.now(), { ...options, mode: 'firefox' });
    } else if (mode === 'chrome') {
      profile = this.fp.generateChrome
        ? this.fp.generateChrome(agentId + '-ch-' + Date.now(), options)
        : this.fp.generate(agentId + '-ch-' + Date.now(), { ...options, mode: 'chrome' });
    } else {
      profile = this.fp.generate(agentId + '-' + mode + '-' + Date.now(), options);
    }

    ctx.session.setUserAgent(profile.ua);
    this._pagesUa(ctx.session, profile.ua);   // §HC2 0.60.260 — before, an open page kept its old UA after a switch
    ctx.profile = profile;
    ctx.fpMode  = mode;

    this.sse.emit('context.fp.switched', { agentId, mode, ua: profile.ua, ts: Date.now() });
    return { agentId, mode, ua: profile.ua };
  }
}

module.exports = ContextManager;
