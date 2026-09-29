'use strict';
/**
 * src/providers/host.js — NCP Provider Auto-Host v2
 * UUID: cg-provider-host-v2-0000-2026-0628-001
 *
 * Spawns one hidden BrowserWindow per NCP provider on boot.
 * Each window:
 *   1. Gets its own persistent session partition (`persist:ncp-<id>`)
 *      so login cookies survive restarts.
 *   2. Navigates to the provider URL.
 *   3. Has the GM shim injected first (Tampermonkey compat layer).
 *   4. Has the matching Guardian userscript injected via executeJavaScript
 *      — the *exact unmodified* file from guardian/userscript-<id>.js.
 *   5. Re-injects the script after every navigation (SPA-safe).
 *   6. The userscript opens its NCP EventSource connection back to
 *      Guardian :7820/channel?provider=<id> — Guardian sees it as a
 *      normal NCP tab and dispatches jobs to it exactly as Tampermonkey would.
 *
 * Windows are HIDDEN (show: false) — they run in the background.
 * Co-pilot or the user can call .show(id) to surface any tab.
 * HEADLESS mode: if CG_HEADLESS=1, windows are created but never shown.
 *
 * Architecture note: this replaces Tampermonkey + manual tab management.
 * Guardian, Orchestrator, and Cortex are unmodified — they still talk
 * NCP over :7820. Clear Glass just owns the tabs.
 */

const path = require('path');
const fs   = require('fs');
const { BrowserWindow, session, app } = require('electron');
const { getProvider, listProviders } = require('./registry');
const { buildGmShim } = require('./gm-shim');

// §timestamping fix 2026-06-30 — file-scoped, not a global console mutation.
// Mutating console.log globally here would re-prefix every OTHER module's
// logs in the same Electron process too (main/index.js, registry.js,
// everything) — caught that before shipping it. Instead: a local _log()
// this file's 11 call sites are mechanically rewritten to use, via sed,
// not hand-edited one at a time (same risk as the cg.* fix history).
const _SRC = 'clear-glass/src/providers/host.js';
function _log(...args)   { console.log(`[${new Date().toISOString()}] [${_SRC}]`, ...args); }
function _logError(...args) { console.error(`[${new Date().toISOString()}] [${_SRC}]`, ...args); }
function _logWarn(...args)  { console.warn(`[${new Date().toISOString()}] [${_SRC}]`, ...args); }

// §fix 2026-06-30 — "strip it of the userscripts, not supposed to be baked
// in." This relative path (`../../../../guardian`) hardcoded an assumption
// that clear-glass and guardian are checked out as sibling folders inside
// the same parent repo, in this exact nesting — clear-glass reaching across
// into another system's internal source layout by relative path. That's
// real coupling, not a config default. Removed the silent fallback;
// guardianDir is now required, either explicitly passed in or via
// GUARDIAN_DIR env var. No assumed sibling-folder structure.
const SCRIPT_RELOAD_INTERVAL_MS = 60_000; // reload script from disk every 60s

class ProviderHost {
  constructor({ guardianDir, sse, postEvent, history } = {}) {
    this.history = history || null;
    this.guardianDir = guardianDir || process.env.GUARDIAN_DIR || null;
    if (!this.guardianDir) {
      _logWarn('[ProviderHost] no guardianDir configured (pass guardianDir or set GUARDIAN_DIR env var) — userscript loading will fail until configured. This is intentional: clear-glass no longer assumes guardian lives at a hardcoded relative path.');
    }

    this.sse       = sse       || { emit: () => {} };
    this.postEvent = postEvent || (() => {});

    this._scriptCache = new Map(); // providerId → { source, mtimeMs }
    this.windows      = new Map(); // providerId → BrowserWindow
    // §TR2 2026-09-22 — per-agent tabs live in their OWN registry, keyed
    // `${providerId}::${agentId}`, deliberately NOT in this.windows: every
    // existing consumer of that map (status, stop, _sweepIdle, getProvider
    // lookups) assumes the key IS a provider id, and a composite key there
    // would quietly break all of them. Policy: open on first dispatch and
    // STAY open — a provider page load is slow and the chat itself is the
    // conversation lane sessionId assumes, so open/dispatch/close would
    // throw the session away each call. Bounded, because "a tab per repo
    // forever" is the real cost TR1 named: LRU cap + idle close.
    this.agentTabs    = new Map(); // `${providerId}::${agentId}` → { win, agentId, providerId, lastUsed }
    this.AGENT_TAB_MAX     = parseInt(process.env.CG_AGENT_TAB_MAX || '6', 10);
    this.AGENT_IDLE_MS     = parseInt(process.env.CG_AGENT_TAB_IDLE_MS || String(15 * 60 * 1000), 10);
    this._status      = new Map(); // providerId → { status, url, injectedAt, health }

    // §BL24 2026-08-23 — James: "disable opening in the background on
    // startup" (userscripts specifically). Real, explicit signal that a
    // navigation is happening BECAUSE of autoBootAll's own real startup
    // pre-warm, not a person's real, later navigation — the nav.loaded
    // handler in src/main/index.js checks this before deciding whether
    // to skip auto-inject. False by default (no boot in progress).
    this.isStartupBoot = false;

    // §ADDED 2026-08-18 — James: real memory pressure on his machine
    // (boot log's own resource-monitor: heap 80%+, then free memory
    // dropping below the 10% halt threshold, cortex/self-heal entering
    // FAILURE_MODE, a crash severe enough to leave a stale flush lock on
    // next boot). Checked first, not assumed: backgroundThrottling is
    // NOT set on these BrowserWindows (confirmed by reading the real
    // webPreferences directly) — Electron's default only throttles JS
    // timers for hidden windows, which helps CPU, not the real cost
    // here, which is 4 full Chromium renderers' own DOM/JS-heap memory,
    // unaffected by throttling. The only real way to free that memory is
    // to actually destroy the window (stop(), already real) and recreate
    // it lazily on next genuine use (start(), already real) — this is a
    // real idle layer on top of both, not a third mechanism.
    this._lastUsed = new Map(); // providerId → timestamp of last real dispatch
    this._pending   = new Map(); // providerId → in-flight ensureStarted() promise, so concurrent callers share one real start() rather than racing two
    this.IDLE_TIMEOUT_MS = parseInt(process.env.CG_PROVIDER_IDLE_MS || '120000', 10); // 2 minutes, matching the person's own stated number
    const idleSweep = setInterval(() => this._sweepIdle(), 15_000);
    if (idleSweep.unref) idleSweep.unref();
  }

  /**
   * touch(providerId) — real last-use marker. Every real dispatch path
   * (agent-chat's ask(), self-model's navigateAgentToUrl/dispatchPromptAndWait,
   * the wake-word listener) should call this on genuine use, not the
   * heartbeat sweep — a provider tab idly holding its NCP connection open
   * with nobody actually asking it anything is exactly the case this
   * exists to catch, and heartbeats alone would never look idle.
   */
  touch(providerId) {
    this._lastUsed.set(providerId, Date.now());
  }

  /**
   * ensureStarted(providerId, opts) — the real queue, sized to what's
   * actually needed. Not a persistent, crash-surviving queue (that's
   * contract-queue.js's real job, for real cross-process work) — this is
   * in-memory, for the real, common case: a dispatch arrives for a
   * provider that idled out, and the caller should wait a few real
   * seconds for a fresh start() rather than fail. Concurrent callers for
   * the same provider share one real start() (via _pending), not one
   * each — the actual "retry logic" the person described is this: a
   * failed start() is still recorded, not silently swallowed, and the
   * NEXT ensureStarted() call tries again for real rather than caching
   * the old failure forever.
   */
  async ensureStarted(providerId, opts = {}) {
    this.touch(providerId);
    if (this.windows.has(providerId) && !this.windows.get(providerId).isDestroyed()) {
      return { ok: true, providerId, alreadyRunning: true };
    }
    if (this._pending.has(providerId)) return this._pending.get(providerId);
    const p = this.start(providerId, { show: false, ...opts })
      .then((r) => { this._pending.delete(providerId); return r; })
      .catch((e) => { this._pending.delete(providerId); throw e; });
    this._pending.set(providerId, p);
    return p;
  }

  /**
   * _sweepIdle() — real, periodic. A provider with no real dispatch for
   * IDLE_TIMEOUT_MS gets a genuine stop() — the actual memory-freeing
   * step, not a connection-only pause (checked and confirmed: pausing
   * just the NCP heartbeat would not free the dominant real cost, the
   * tab's own DOM/JS heap).
   */
  _sweepIdle() {
    const now = Date.now();
    this._sweepIdleAgentTabs(now);
    for (const [providerId, win] of this.windows) {
      if (win.isDestroyed()) { this.windows.delete(providerId); continue; }
      const last = this._lastUsed.get(providerId);
      if (last == null) continue; // never touched — a fresh pre-warm, not idle by this definition
      if (now - last < this.IDLE_TIMEOUT_MS) continue;
      _log(`[ProviderHost] ${providerId} idle for ${Math.round((now - last) / 1000)}s — stopping to free real memory (will restart on next genuine use)`);
      this.stop(providerId).catch((e) => _logWarn(`[ProviderHost] idle-stop failed for ${providerId}:`, e.message));
    }
  }

  // ── Script loading ──────────────────────────────────────────────────────
  _scriptPath(providerId) {
    if (!this.guardianDir) return null; // §fix — null guardianDir produces null path, not a crash
    const def = getProvider(providerId);
    return path.join(this.guardianDir, def.userscriptFile);
  }

  loadUserscript(providerId) {
    const filePath = this._scriptPath(providerId);
    if (!filePath) return null; // no guardianDir configured — silent, already warned at boot
    let stat;
    try { stat = fs.statSync(filePath); }
    catch (e) {
      _logWarn(`[ProviderHost] userscript not found for ${providerId}: ${filePath}`);
      return null;
    }
    const cached = this._scriptCache.get(providerId);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.source;
    const source = fs.readFileSync(filePath, 'utf8');
    this._scriptCache.set(providerId, { source, mtimeMs: stat.mtimeMs });
    _log(`[ProviderHost] loaded userscript for ${providerId} (${Math.round(source.length / 1024)}KB)`);
    return source;
  }

  // §NEXUS-WAKE 2026-08-18 — guardian/userscript-nexus-wake.js attaches
  // window.NexusWake and does nothing until a provider script calls
  // .install(). It has to run BEFORE the provider script (which calls
  // install() near its own boot line), so it's loaded the same way gmShim
  // is: a shared prelude, not baked into any one provider file. This keeps
  // the "exact unmodified provider file" invariant above true — the wake
  // module is its own file on disk, just like the GM shim is its own file.
  // Missing/unreadable is non-fatal: providers boot without "hey nexus"
  // rather than not booting at all.
  // §0.39.278 — a second shared prelude, the same way: guardian/userscript-chat-stream.js (window.NexusChatStream) —
  // each provider chat streamed live, mutation by mutation, into this app's download manager (chat ledger). Each file
  // loads on its own: one missing never stops the other.
  _loadSharedPrelude() {
    if (!this.guardianDir) return '';
    const out = [];
    for (const f of ['userscript-nexus-wake.js', 'userscript-chat-stream.js']) {
      try { out.push(fs.readFileSync(path.join(this.guardianDir, f), 'utf8')); }
      catch (e) { _logWarn(`[ProviderHost] ${f} prelude not loaded: ${e.message}`); }
    }
    return out.join('\n;\n');
  }

  // ── Inject GM shim + userscript into a window ───────────────────────────
  // §TR1 2026-09-22 — stamp the agent this tab belongs to BEFORE the
  // userscript runs, so the script registers with guardian under
  // tabId=agentId and guardian's dispatcher (pushTab(provider, job.agentId))
  // reaches exactly this tab. Optional: a window opened without an agentId
  // is a normal shared provider tab and nothing changes for it.
  async _stampAgent(win, agentId) {
    if (!agentId) return false;
    const js = `(function(){ try { window.__NEXUS_AGENT_ID = ${JSON.stringify(String(agentId))};
      sessionStorage.setItem('gd_agent_id', window.__NEXUS_AGENT_ID); return true; } catch (e) { return false; } })();`;
    try { return !!(await win.webContents.executeJavaScript(js)); }
    catch (e) { _logWarn(`[ProviderHost] could not stamp agentId=${agentId}: ${e.message}`); return false; }
  }

  async _inject(providerId, win, agentId = null) {
    await this._stampAgent(win, agentId);
    const gmShim  = buildGmShim();
    const wake    = this._loadSharedPrelude();
    const script  = this.loadUserscript(providerId);
    if (!script) return false;

    // Wrap in IIFE — prevents global leakage, mirrors Tampermonkey sandbox
    const code = `
(function() {
  'use strict';
  try {
    ${gmShim}
    // Shared prelude — window.NexusWake, inert until a provider script
    // calls .install(). Loaded once here rather than four times.
    ${wake}
    // Userscript begins
    ${script}
    // Userscript ends
    console.log('[ClearGlass] NCP userscript injected');
  } catch(e) {
    console.error('[ClearGlass] userscript injection error:', e.message);
  }
})();
`;
    try {
      await win.webContents.executeJavaScript(code);
      const st = this._status.get(providerId) || {};
      this._status.set(providerId, { ...st, status: 'injected', injectedAt: Date.now() });
      this.sse.emit('provider.host.injected', { providerId, ts: Date.now() });
      return true;
    } catch (e) {
      _logWarn(`[ProviderHost] injection failed for ${providerId}:`, e.message);
      return false;
    }
  }

  // ── Per-agent tabs (TR2) ─────────────────────────────────────────────────
  /**
   * ensureAgentTab(providerId, agentId) — the tab a repo's jobs land in.
   * Idempotent: the same agentId always returns the same live tab, which is
   * what makes guardian's pushTab(provider, job.agentId) hit. Hidden by
   * default; showAgentTab() brings it forward on demand.
   */
  async ensureAgentTab(providerId, agentId, opts = {}) {
    if (!providerId || !agentId) return { ok: false, error: 'providerId and agentId are both required' };
    return this.start(providerId, { show: false, ...opts, agentId });
  }

  showAgentTab(providerId, agentId) {
    const e = this.agentTabs.get(`${providerId}::${agentId}`);
    if (!e || e.win.isDestroyed()) return { ok: false, error: `no live tab for ${agentId} on ${providerId}` };
    e.lastUsed = Date.now(); e.win.show(); e.win.focus();
    return { ok: true, providerId, agentId };
  }

  closeAgentTab(providerId, agentId) {
    const key = `${providerId}::${agentId}`;
    const e = this.agentTabs.get(key);
    if (!e) return { ok: false, error: `no tab for ${agentId} on ${providerId}` };
    // §ONE-TAB 0.39.237 — marked intentional, exactly as stop() marks shared
    // windows. Without the flag the 'closed' handler treated every idle-sweep
    // and LRU close as unexpected and, 5 s later, started the SHARED provider
    // window: each idle repo tab that closed left a second ChatGPT behind.
    try { if (!e.win.isDestroyed()) { e.win._nexusIntentionalStop = true; e.win.destroy(); } } catch (_) {}
    this.agentTabs.delete(key);
    return { ok: true, providerId, agentId };
  }

  listAgentTabs() {
    const now = Date.now();
    return [...this.agentTabs.entries()]
      .filter(([, e]) => e.win && !e.win.isDestroyed())
      .map(([key, e]) => ({ key, providerId: e.providerId, agentId: e.agentId, idleMs: now - e.lastUsed, visible: (() => { try { return e.win.isVisible(); } catch (_) { return false; } })() }));
  }

  /** Least-recently-used close, so tabs cannot grow without bound. */
  _enforceAgentTabCap() {
    const live = [...this.agentTabs.entries()].filter(([, e]) => e.win && !e.win.isDestroyed());
    if (live.length <= this.AGENT_TAB_MAX) return 0;
    const byOldest = live.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    let closed = 0;
    for (const [, e] of byOldest.slice(0, live.length - this.AGENT_TAB_MAX)) {
      _log(`[ProviderHost] agent-tab cap ${this.AGENT_TAB_MAX} reached — closing least-recently-used ${e.agentId} (${e.providerId}); it reopens on its next dispatch`);
      this.closeAgentTab(e.providerId, e.agentId); closed++;
    }
    return closed;
  }

  /** Idle close — same reasoning as _sweepIdle for shared provider windows. */
  _sweepIdleAgentTabs(now = Date.now()) {
    let closed = 0;
    for (const [key, e] of [...this.agentTabs]) {
      if (!e.win || e.win.isDestroyed()) { this.agentTabs.delete(key); continue; }
      if (now - e.lastUsed < this.AGENT_IDLE_MS) continue;
      _log(`[ProviderHost] agent tab ${e.agentId} (${e.providerId}) idle ${Math.round((now - e.lastUsed) / 1000)}s — closing; reopens on next dispatch`);
      this.closeAgentTab(e.providerId, e.agentId); closed++;
    }
    return closed;
  }

  // ── Spawn one provider window ────────────────────────────────────────────
  async start(providerId, opts = {}) {
    const agentId  = opts.agentId || null;
    const agentKey = agentId ? `${providerId}::${agentId}` : null;
    if (agentKey && this.agentTabs.has(agentKey)) {
      const e = this.agentTabs.get(agentKey);
      if (e.win && !e.win.isDestroyed()) {
        e.lastUsed = Date.now();
        if (opts.show) e.win.show();
        return { ok: true, providerId, agentId, status: 'already-running' };
      }
      this.agentTabs.delete(agentKey);
    }
    if (!agentKey && this.windows.has(providerId)) {
      const existing = this.windows.get(providerId);
      if (!existing.isDestroyed()) {
        if (opts.show) existing.show();
        return { ok: true, providerId, status: 'already-running' };
      }
    }

    const def = getProvider(providerId);
    const partition = `persist:ncp-${providerId}`;

    // Intercept WebSocket upgrades — allow NCP SSE but strip CSP on provider pages
    const ses = session.fromPartition(partition);

    // §WIRED 2026-08-19 — found built but never called: will-download was
    // hooked nowhere in the tree. James: "guardian to listen for the
    // downloads from your chat and move them to the compartment with the
    // contract or repo/spec." This announces; it applies nothing itself —
    // see lib/intake.js for why arrival must not equal acceptance.
    try {
      const downloadCapture = require('./download-capture.js');
      // 0.39.239 — the capture learns which agent tab a download came from; attach() is idempotent per session.
      downloadCapture.attach({ session: ses, providerId, log: _log, agentIdFor: (wc) => {
        for (const e of this.agentTabs.values()) { if (e.win && !e.win.isDestroyed() && e.win.webContents === wc) return e.agentId; }
        return null;
      } });
    } catch (e) { _logWarn(`[ProviderHost] download-capture not attached for ${providerId}: ${e.message}`); }

    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      // Remove CSP that would block our script injection
      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];
      callback({ responseHeaders: headers });
    });

    const win = new BrowserWindow({
      width:  1280,
      height: 800,
      show:   opts.show === true && process.env.CG_HEADLESS !== '1',
      // §FIXED 2026-09-03 — James: "remove headless flag and taskbar from
      // the main." skipTaskbar was never set on these automation windows.
      // show:false already keeps a window off the taskbar WHILE hidden,
      // but that's incidental to `show`, not a real guarantee — anything
      // that later calls .show() on one of these (a debug path, a stray
      // code change) would put a "NEXUS NCP — <provider>" window straight
      // into the taskbar with no real intent behind it. Setting this
      // explicitly means taskbar absence is guaranteed by config, not by
      // accident of current visibility state.
      skipTaskbar: true,
      webPreferences: {
        partition,
        nodeIntegration:             false,
        contextIsolation:            true,
        webSecurity:                 true,
        allowRunningInsecureContent: false,
        // §FIXED 2026-09-22 — traced from guardian's own real NCP connect/
        // disconnect cycle (provider=chatgpt, same tabId each time — not a
        // new tab, the same hidden one reconnecting). Client's real
        // heartbeat is HB_MS=8000 (userscript-chatgpt.js), server's real
        // stale threshold is STALE_MS=30_000 (guardian/lib/ncp.js) — a
        // healthy 4x margin on paper. This window is hidden by default
        // (`show` above) and backgroundThrottling was never set here,
        // so Electron's default (throttling ON for hidden renderers)
        // applies — silently stretching the 8s setInterval past the 30s
        // stale window with no error on either side, then the client's
        // own correct reconnect logic fires, restarting the cycle.
        // A prior investigation (§ADDED 2026-08-18, above this block)
        // already checked backgroundThrottling and ruled it out — for a
        // DIFFERENT problem (renderer memory pressure, which throttling
        // doesn't affect since it's DOM/JS-heap, not CPU). That finding
        // doesn't apply here: this is a timer-starvation problem, exactly
        // what backgroundThrottling controls. Not yet confirmed fixed —
        // the next real boot log's NCP connect/disconnect cadence is the
        // actual test, not this comment.
        backgroundThrottling: false,
        // preload is NOT used here — we inject via executeJavaScript after load
      },
      title: `NEXUS NCP — ${def.name}`,
    });

    if (agentKey) {
      this.agentTabs.set(agentKey, { win, agentId, providerId, lastUsed: Date.now() });
      this._enforceAgentTabCap();
    } else this.windows.set(providerId, win);
    if (!agentKey) this._status.set(providerId, {
      status: 'loading', url: def.url,
      providerId, name: def.name, color: def.color,
      startedAt: Date.now(), injectedAt: null, health: 100,
    });

    // Inject on every navigation (SPA route changes included)
    win.webContents.on('did-finish-load', async () => {
      const url = win.webContents.getURL();
      const st  = this._status.get(providerId) || {};

      // Only inject on the provider's own pages
      const isProviderPage = def.hosts.some(h => url.includes(h));
      if (!isProviderPage) {
        _log(`[ProviderHost] ${providerId} — skipping injection on ${url}`);
        return;
      }

      this._status.set(providerId, { ...st, status: 'loaded', url, loadedAt: Date.now() });
      _log(`[ProviderHost] ${providerId} — loaded ${url}, injecting userscript…`);

      // Small delay — let SPA frameworks settle
      await new Promise(r => setTimeout(r, 800));
      await this._inject(providerId, win, agentId);
    });

    // Track navigation for health monitoring
    win.webContents.on('did-navigate', (e, navUrl) => {
      const st = this._status.get(providerId) || {};
      this._status.set(providerId, { ...st, url: navUrl });
      this.sse.emit('provider.host.navigate', { providerId, url: navUrl, ts: Date.now() });
      // §GAP CLOSED 2026-08-30 — history.js's own real, passive subscriber
      // to this already-proven real event, not a new detection mechanism.
      try { this.history?.record({ url: navUrl, title: win.webContents.getTitle(), agentId: providerId }); } catch (_) {}
    });

    // §BUILD 2026-08-30 — James: "each agent gets a little tool intro
    // like use 'hey nexus' to chat... inject an explanation each time a
    // new chat url opens." Real investigation first: these AI chat
    // sites are SPAs — a "New Chat" click changes the URL without a
    // full page load, so the 'did-navigate' listener just above (full
    // navigations only) never fires for it. Electron's real, native
    // 'did-navigate-in-page' event is exactly built for this and was
    // completely unused anywhere in this codebase — confirmed directly
    // before reaching for a heavier fix (a custom history.pushState
    // hook inside every userscript, which an earlier pass considered
    // and correctly declined to rush). No new injection mechanism
    // needed either: injectAnswer() below already exists, already
    // works (it's the same real path that delivers co-pilot's answers
    // into these same pages), and renders as a real, closeable overlay
    // via the page's own NexusWake.showAnswer() — it does NOT type into
    // the real chat input, so there's no risk of interfering with
    // anything the person is actually typing.
    //
    // Scoped to claude + chatgpt only initially, per James's own
    // confirmation — these are the two providers whose real "new chat"
    // URL shape was directly verifiable (claude.ai/new or claude.ai/ →
    // claude.ai/chat/<uuid>; chatgpt.com/ → chatgpt.com/c/<uuid>).
    //
    // §BUILD 2026-08-30 — extended to gemini + perplexity, James: "yes
    // do it." Real investigation before writing anything, not a guess:
    // both guardian/userscript-gemini.js and guardian/userscript-
    // perplexity.js already have a real, page-side chatId() function
    // used for session tracking, each carrying its own explicit
    // §HONEST-NOTE that the URL pattern "isn't a verified-stable
    // contract — verify against what you actually see." Reused those
    // exact same regexes verbatim here (not re-derived, so host-side
    // and page-side logic can't quietly diverge) rather than inventing
    // a third, independent guess. Both return their own 'home' sentinel
    // when no chat id matches — that's the real, already-relied-upon
    // "new chat" signal, carried forward with the same honesty caveat
    // the source files themselves state, not presented as more certain
    // than it actually is. Worth it here specifically because the
    // failure mode is genuinely low-stakes: an intro overlay firing on
    // the wrong page occasionally, not anything touching real
    // functionality — a different risk profile than the Claude/ChatGPT
    // choice was weighed against.
    const NEW_CHAT_CHECK = {
      claude:     (path) => path === '/new' || path === '/',
      chatgpt:    (path) => path === '/',
      gemini:     (path) => !/\/(?:app|chat)\/([a-zA-Z0-9_-]+)/.test(path),
      perplexity: (path) => !/\/search\/(.+)/.test(path),
    };
    if (NEW_CHAT_CHECK[providerId]) {
      const _greetedChats = new Set(); // per-window — a fresh window starts with a clean slate, matching how "have I said this before, in THIS conversation" should actually behave
      win.webContents.on('did-navigate-in-page', (e, navUrl) => {
        try {
          const u = new URL(navUrl);
          if (!NEW_CHAT_CHECK[providerId](u.pathname)) return;
          // Real per-chat guard: the SAME new-chat URL can fire this
          // event more than once (query-param-only changes, focus
          // events some SPAs trigger) — key on the real pathname so a
          // genuine repeat visit to the same "blank" state doesn't
          // re-greet every time, but a real, distinct new chat later
          // still does (a fresh Date.now()-bucketed key would over-
          // suppress; the pathname alone is what "new chat" actually
          // means for these providers).
          const key = `${providerId}:${u.pathname}`;
          if (_greetedChats.has(key)) return;
          _greetedChats.add(key);
          // §BUILD 2026-08-30 — James: "need wake word to be an event. i
          // can't tell if it worked or not." Real gap, found directly:
          // this call already resolves a real, honest {ok, reason}
          // (injectAnswer's own real fallback when the page hasn't
          // loaded __nexusInjectAnswer yet, or NexusWake genuinely isn't
          // installed) — the previous version threw that real result
          // away with a bare .catch(() => {}), which only ever silenced
          // a THROWN error, not a resolved failure. Now both a real SSE
          // event (immediate, for anything watching live) and a real
          // postEvent (reaches event_log — the same table intelligence's
          // pattern-scan reads, same real path this session already
          // traced end to end) report the true outcome either way, not
          // just on success.
          this.injectAnswer(providerId,
            "You can say \"hey nexus\" anytime you need real-time input or hit something you can't resolve alone — co-pilot is listening."
          ).then(result => {
            const ok = !!result?.ok;
            this.sse.emit('provider.host.wake-intro', { providerId, ok, reason: result?.reason || null, ts: Date.now() });
            this.postEvent('provider.host.wake-intro', { providerId, ok, reason: result?.reason || null });
          }).catch(err => {
            this.sse.emit('provider.host.wake-intro', { providerId, ok: false, reason: err.message, ts: Date.now() });
            this.postEvent('provider.host.wake-intro', { providerId, ok: false, reason: err.message });
          });
        } catch (_) { /* malformed navUrl — real, defensive, matches this file's own convention elsewhere */ }
      });
    }

    // Detect crash / unresponsive
    win.webContents.on('render-process-gone', (e, { reason }) => {
      _logWarn(`[ProviderHost] ${providerId} renderer gone: ${reason}`);
      const st = this._status.get(providerId) || {};
      const crashCount = (st.crashCount || 0) + 1;
      this._status.set(providerId, { ...st, status: 'crashed', health: 0, crashCount, lastCrashAt: Date.now() });
      this.sse.emit('provider.host.crashed', { providerId, reason, ts: Date.now() });
      // Auto-restart after 5s — §ONE-TAB 0.39.237: an agent tab restarts AS
      // that agent's tab. It used to call start(providerId) with no agentId,
      // which started the SHARED window: one crashed repo tab became a second
      // instance of the provider.
      setTimeout(() => this.start(providerId, agentId ? { show: false, agentId } : {}), 5000);
    });

    win.on('closed', () => {
      if (agentKey && this.agentTabs.get(agentKey)?.win === win) this.agentTabs.delete(agentKey);
      if (this.windows.get(providerId) === win) {
        this.windows.delete(providerId);
        this._status.delete(providerId);
      }
      // §FIXED 2026-09-06 — see stop()'s own comment for the full finding.
      // Same 5s auto-restart render-process-gone already uses below —
      // deliberately not instant, matching that handler's own real reason
      // (a respawn racing the same resource pressure that likely caused
      // the disappearance would just die again immediately).
      if (!win._nexusIntentionalStop) {
        this.sse.emit('provider.host.closed_unexpectedly', { providerId, agentId, ts: Date.now() });
        // §ONE-TAB 0.39.237 — same as the crash path: restart what closed.
        setTimeout(() => this.start(providerId, agentId ? { show: false, agentId } : {}), 5000);
      }
    });

    // Periodic script re-injection (catches disk changes + SPA unmounts)
    const reloadTimer = setInterval(async () => {
      if (win.isDestroyed()) { clearInterval(reloadTimer); return; }
      const url = win.webContents.getURL();
      const isProviderPage = def.hosts.some(h => url.includes(h));
      if (isProviderPage) {
        // Only re-inject if script on disk has changed
        const filePath = this._scriptPath(providerId);
        try {
          const mtime = fs.statSync(filePath).mtimeMs;
          const cached = this._scriptCache.get(providerId);
          if (!cached || cached.mtimeMs !== mtime) {
            _log(`[ProviderHost] ${providerId} — script changed on disk, re-injecting…`);
            await this._inject(providerId, win);
          }
        } catch (_) {}
      }
    }, SCRIPT_RELOAD_INTERVAL_MS);

    this.postEvent('provider.host.starting', { providerId, url: def.url });

    // Navigate to provider
    await win.loadURL(def.url).catch(e => {
      _logWarn(`[ProviderHost] ${providerId} loadURL failed:`, e.message);
    });

    _log(`[ProviderHost] ${providerId} window spawned → ${def.url}`);
    this.sse.emit('provider.host.started', { providerId, url: def.url, ts: Date.now() });

    return { ok: true, providerId, url: def.url, status: 'started' };
  }

  // ── Auto-boot providers (called from main/index.js after app ready,
  //    only when CG_AUTOBOOT_PROVIDERS opts in — lazy-only by default) ──
  async autoBootAll(opts = {}) {
    const { only = null, ...startOpts } = opts;
    let providers = listProviders();
    if (Array.isArray(only)) {
      providers = providers.filter(p => only.includes(p.id));
    }
    _log(`[ProviderHost] pre-warming ${providers.length} provider tab(s) (hidden)…`);
    this.isStartupBoot = true;
    const results = [];
    try {
      for (const def of providers) {
        try {
          const r = await this.start(def.id, { show: false, ...startOpts });
          results.push(r);
        } catch (e) {
          _logWarn(`[ProviderHost] failed to boot ${def.id}:`, e.message);
          results.push({ ok: false, providerId: def.id, error: e.message });
        }
        // Stagger boot to avoid auth/fingerprint collision
        await new Promise(r => setTimeout(r, 1500));
      }
    } finally {
      // §1.2 — cleared even if a provider genuinely throws mid-loop, not
      // just on the real, happy-path completion — a stuck-true flag
      // would silently suppress auto-inject for every later, real,
      // person-initiated navigation too.
      this.isStartupBoot = false;
    }
    this.sse.emit('provider.host.all-booted', { count: results.length, ts: Date.now() });
    return results;
  }

  /**
   * injectAnswer(providerId, text) — James: "listens for the co-pilot
   * response and injects it into the corresponding agent chat using
   * clearglass." Real close of the loop: calls a page-side function the
   * userscript itself already exposes (window.__nexusInjectAnswer),
   * which wraps that provider's OWN real injectText()/submit() — this
   * method never assumes DOM structure itself, that lives exactly once,
   * in the userscript, matching §16.5 (one composer driver, not two that
   * can drift).
   */
  async injectAnswer(providerId, text) {
    const win = this.windows.get(providerId);
    if (!win || win.isDestroyed()) return { ok: false, reason: `no live window for ${providerId}` };
    try {
      const result = await win.webContents.executeJavaScript(
        `(typeof window.__nexusInjectAnswer === 'function') ? window.__nexusInjectAnswer(${JSON.stringify(text)}) : { ok: false, reason: 'page has not loaded __nexusInjectAnswer yet' }`
      );
      return result || { ok: false, reason: 'page returned nothing' };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  /**
   * queryDom(providerId, query) — James: "dom archeology tool for the
   * clear-glass toolkit." Same real, proven pattern as injectAnswer():
   * reaches the already-real window.__cgDomMesh object the DOM
   * Archaeology panel itself already calls (confirmed directly in
   * clear-glass/renderer/browser.js before building this — getTree()/
   * query() are real, existing page-side methods, not invented here).
   * A blank query returns the real tree; a real query string searches it.
   */
  async queryDom(providerId, query) {
    const win = this.windows.get(providerId);
    if (!win || win.isDestroyed()) return { ok: false, reason: `no live window for ${providerId}` };
    try {
      const script = query
        ? `window.__cgDomMesh?.query(${JSON.stringify(query)}) ?? { ok: false, reason: 'DOM Archaeology mesh not loaded on this page' }`
        : `window.__cgDomMesh?.getTree(3) ?? { ok: false, reason: 'DOM Archaeology mesh not loaded on this page' }`;
      const result = await win.webContents.executeJavaScript(script);
      return result || { ok: false, reason: 'page returned nothing' };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // ── Control ──────────────────────────────────────────────────────────────
  show(providerId) {
    const win = this.windows.get(providerId);
    if (win && !win.isDestroyed()) { win.show(); win.focus(); return true; }
    return false;
  }

  hide(providerId) {
    const win = this.windows.get(providerId);
    if (win && !win.isDestroyed()) { win.hide(); return true; }
    return false;
  }

  /**
   * deploy(providerId) — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md, item 3:
   * "there's no way to push/hot-reload a userscript into an already-running
   * provider tab on demand — host.js only reloads a script from disk on
   * its own 60s timer or full start()." Real, narrow fix: this is the exact
   * same real _inject(providerId, win) the 60s timer above already calls
   * (line ~346) — same code path, on demand instead of on a timer, not a
   * second injection mechanism.
   *
   * §1.2 — honestly fails when there's no live window to deploy into,
   * rather than silently reporting success. Does NOT check mtime first
   * (unlike the timer's own "only re-inject if changed" guard) — an
   * explicit, on-demand deploy call is a real signal the caller wants it
   * pushed now, not a background poll that should skip unchanged files.
   */
  async deploy(providerId) {
    const win = this.windows.get(providerId);
    if (!win || win.isDestroyed()) return { ok: false, error: `no live window for provider "${providerId}"` };
    const ok = await this._inject(providerId, win);
    if (!ok) return { ok: false, error: `injection failed for "${providerId}" — see server log for the real reason` };
    return { ok: true, providerId, injectedAt: Date.now() };
  }

  /**
   * stopAll() — found genuinely missing, not assumed: main/index.js's real
   * shutdown path calls `providerHost?.stopAll()`, but this method never
   * existed on the class. Optional chaining protects against providerHost
   * itself being null; it does nothing for a method that's undefined ON a
   * real object, which is exactly what "stopAll is not a function" means.
   * Confirmed live in a real run — this fired on every shutdown under
   * memory pressure, the exact moment a clean, fast teardown matters most.
   *
   * Real, not a stub: stops every real, currently-tracked provider window,
   * reusing stop()'s own exact real per-provider logic rather than a
   * second copy. Runs concurrently (Promise.allSettled) and isolates a
   * single provider's failure — one broken teardown must never block the
   * rest from actually closing under real memory pressure.
   */
  async stopAll() {
    const ids = [...this.windows.keys()];
    const results = await Promise.allSettled(ids.map(id => this.stop(id)));
    const failures = results
      .map((r, i) => ({ r, id: ids[i] }))
      .filter(({ r }) => r.status === 'rejected');
    for (const { r, id } of failures) _logWarn(`[ProviderHost] stopAll: ${id} failed to stop cleanly: ${r.reason?.message || r.reason}`);
    return { ok: failures.length === 0, stopped: ids.length - failures.length, failed: failures.map(f => f.id) };
  }

  async stop(providerId) {
    const win = this.windows.get(providerId);
    // §FIXED 2026-09-06 — James: "nothing is supposed to rely on a ui."
    // Real, confirmed gap: win.on('closed', ...) below had zero respawn
    // logic — only render-process-gone (an actual Chromium crash) ever
    // triggered the real 5s auto-restart already built for that case.
    // A window that closes for any OTHER reason (Electron/OS reclaiming
    // it under memory pressure, anything else calling win.destroy()
    // directly instead of through this method) just vanished forever —
    // guardian would keep routing jobs to a tab that no longer existed,
    // getting a jobId back but never an ack (exactly James's live report:
    // "it routes to it. but doesn't do anything beyond that"). Marking
    // the window here, right before the one real intentional-destroy
    // path in this class, so 'closed' below can tell "someone asked for
    // this" apart from "this just disappeared" — the same distinction
    // render-process-gone's handler already makes for crashes, applied
    // to the other real way a window goes away.
    if (win) win._nexusIntentionalStop = true;
    if (win && !win.isDestroyed()) { win.destroy(); }
    this.windows.delete(providerId);
    this._status.delete(providerId);
    this.sse.emit('provider.host.stopped', { providerId, ts: Date.now() });
    return { ok: true, providerId };
  }

  async reload(providerId) {
    const win = this.windows.get(providerId);
    if (!win || win.isDestroyed()) return this.start(providerId);
    win.webContents.reload();
    return { ok: true, providerId, status: 'reloading' };
  }

  /**
   * navigateTo(providerId, url) — real, new. Requested directly ("switch
   * co-pilot to claude with this URL... use a URL given as the surface").
   * Checked start()/reload() first: neither does this — start() only ever
   * loads a provider's fixed default URL (getProvider(providerId).url) and,
   * critically, if the window is ALREADY running (true for every provider
   * after autoBootAll — every provider pre-warms), start()'s early return
   * just SHOWS the existing window without navigating it anywhere. reload()
   * only re-loads whatever's already loaded. Neither can point an existing,
   * running provider window at an arbitrary URL — this is genuinely new.
   *
   * Two real things a fresh loadURL() breaks that this method accounts for:
   * (a) the userscript injected via _inject() is a one-time executeJavaScript
   *     call, not persistent — navigating away and the NCP bridge goes dark
   *     until re-injected. Re-injects after the new page settles.
   * (b) a URL that requires auth may redirect (e.g. to a /login path) —
   *     detected here by comparing the REQUESTED url against the ACTUAL
   *     url after navigation settles, not guessed from the requested url
   *     alone (the requested url could look fine and still redirect).
   */
  async navigateTo(providerId, url) {
    if (!url || typeof url !== 'string') return { ok: false, error: 'navigateTo needs a real url string' };
    let win = this.windows.get(providerId);
    if (!win || win.isDestroyed()) {
      // No running window for this provider yet — start one fresh, THEN
      // navigate it, rather than fail outright (a person switching to an
      // agent they haven't used yet should still work).
      const started = await this.start(providerId, { show: false });
      if (!started.ok) return { ok: false, error: `could not start ${providerId} to navigate it: ${started.error || 'unknown'}` };
      win = this.windows.get(providerId);
      if (!win || win.isDestroyed()) return { ok: false, error: `${providerId} window unavailable after start` };
    }

    const loadResult = await new Promise((resolve) => {
      const onFinish = () => { cleanup(); resolve({ ok: true }); };
      const onFail = (_e, code, desc) => { cleanup(); resolve({ ok: false, error: `${desc} (${code})` }); };
      const cleanup = () => {
        win.webContents.removeListener('did-finish-load', onFinish);
        win.webContents.removeListener('did-fail-load', onFail);
      };
      win.webContents.once('did-finish-load', onFinish);
      win.webContents.once('did-fail-load', onFail);
      win.loadURL(url).catch(e => { cleanup(); resolve({ ok: false, error: e.message }); });
    });
    if (!loadResult.ok) {
      this.sse.emit('provider.host.navigate-failed', { providerId, url, error: loadResult.error, ts: Date.now() });
      return { ok: false, providerId, url, error: loadResult.error };
    }

    // Real re-injection — the userscript is gone after a fresh page load.
    await this._inject(providerId, win);

    const actualUrl = win.webContents.getURL();
    // Honest login detection: compare what we asked for against where we
    // actually ended up, not a keyword guess against the requested url —
    // the requested url can look completely unrelated to login and still
    // redirect there for real (session expiry, IP change, etc).
    const loginPatterns = /\/(login|signin|sign-in|auth|authenticate)(\/|$|\?)/i;
    const needsSignIn = loginPatterns.test(actualUrl) && !loginPatterns.test(url);

    this.sse.emit('provider.host.navigated', { providerId, requestedUrl: url, actualUrl, needsSignIn, ts: Date.now() });
    return { ok: true, providerId, requestedUrl: url, actualUrl, needsSignIn };
  }

  list() {
    return listProviders().map(def => ({
      ...def,
      running: this.windows.has(def.id) && !this.windows.get(def.id).isDestroyed(),
      ...(this._status.get(def.id) || {}),
    }));
  }

  getStatus(providerId) {
    return this._status.get(providerId) || { status: 'not-started', providerId };
  }

  // Update health score (called from diagnostic engine or heartbeat)
  setHealth(providerId, score) {
    const st = this._status.get(providerId) || {};
    this._status.set(providerId, { ...st, health: score });
  }

  // §pressure-system 2026-06-29 — same field shape as spotlight.js's
  // updateTensionField(): a crashed tab is high pressure regardless of
  // recorded health (same as an offline system in the tile tension model),
  // repeated crashes escalate it further (crashCount, 5min decay window —
  // same "3 in 10s" escalation idea as spotlight's confusion detector,
  // different timescale because tab crashes are rarer than clicks), a
  // loaded tab's pressure tracks the inverse of its health score.
  getPressure(providerId) {
    const st = this._status.get(providerId);
    if (!st) return { pressure: 0, status: 'not-started' };
    const recentCrash = st.lastCrashAt && (Date.now() - st.lastCrashAt) < 300_000;
    const crashEscalation = recentCrash ? Math.min(0.3, (st.crashCount || 0) * 0.1) : 0;
    let pressure;
    if (st.status === 'crashed') pressure = Math.min(1, 0.7 + crashEscalation);
    else if (st.status === 'loaded') pressure = Math.min(1, (1 - (st.health ?? 1)) * 0.6 + crashEscalation);
    else pressure = 0.1 + crashEscalation; // injected/not-started — mild ambient pressure
    return { pressure: Number(pressure.toFixed(3)), status: st.status, crashCount: st.crashCount || 0 };
  }

  getAllPressure() {
    const out = {};
    for (const def of listProviders()) out[def.id] = this.getPressure(def.id);
    return out;
  }
}

module.exports = ProviderHost;
