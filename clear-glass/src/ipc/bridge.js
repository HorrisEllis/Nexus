'use strict';
/**
 * src/ipc/bridge.js — SISO-native IPC Bridge
 * UUID: cg-ipc-bridge-v1-0000-0000-000000000005
 *
 * NEXUS commands arrive as HTTP POST /cmd → become SISO Events → bus.emit()
 * Results come back as bus events via SSE.
 *
 * No direct module calls. Everything is Event → Gate → Stream.
 * The bus IS the API surface.
 */

const http    = require('http');
const express = require('../../../lib/micro-http.js');   // §0.39.261 — in-house express subset (lib/micro-http.js), was express
const { ipcMain, session, Notification } = require('electron');
// 0.39.272 — record every ipcMain.handle channel as it is registered, so /cli/invoke reaches the same handler (ipc/handler-registry.js)
require('./handler-registry').install(ipcMain);
const { emit, on, Event, getBus } = require('../core/bus');
const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.
const { detectFields: _autofillDetect, fillFields: _autofillFill } = require('../autofill/matcher.js');
const {
  detectOpenQuestions: _screenQaDetect, answerQuestion: _screenQaAnswer, injectAnswer: _screenQaInject,
  deriveQuestion: _screenQaDeriveQuestion,
} = require('../screen-qa/detector.js');

class IpcBridge {
  constructor({ port, sse, ctxMgr, vault, apiSettings, urlListener, mesh, diag, fp, options, minimizeFn, hideFn, openFn, maximizeFn, openSettingsFn, closeSettingsFn, openLibraryFn, closeLibraryFn, bookmarks, rewind, providerHost, userscripts, siteSettings, downloads, passwordVault, speech, macroTool, errorCapture, copilot, postEvent, pluginHost, history, autofillStore, dom, loginPortal, driver, webExtensions }) {
    this.port        = port;
    this.sse         = sse;
    this.errorCapture = errorCapture;
    this.copilot     = copilot;
    this.ctxMgr      = ctxMgr;
    this.vault       = vault;
    this.apiSettings = apiSettings;
    this.urlListener = urlListener;
    this.mesh        = mesh;
    this.diag        = diag;
    this.fp          = fp;
    this.options     = options;
    this.minimizeFn  = minimizeFn;
    this.hideFn      = hideFn;
    this.openFn      = openFn;
    this.maximizeFn  = maximizeFn;
    this.openSettingsFn = openSettingsFn;
    this.closeSettingsFn = closeSettingsFn;
    this.openLibraryFn = openLibraryFn;     // §LIBRARY 0.39.241
    this.closeLibraryFn = closeLibraryFn;
    this.bookmarks   = bookmarks;
    this.rewind      = rewind;
    this.providerHost = providerHost;
    this.userscripts   = userscripts;
    this.siteSettings  = siteSettings;
    this.history       = history;
    this.autofillStore = autofillStore;
    this.dom           = dom;
    this.driver        = driver || null;
    this.webExtensions = webExtensions || null; // §2026-09-26 — src/plugins/webextensions.js // §2026-09-26 — macro recorder (macros:recordStart/Stop)
    this.downloads     = downloads;
    // §BUGFIX 2026-08-24 — found while wiring speech, not by inspection:
    // main/index.js already passed passwordVault into this constructor
    // (two commits ago), but this constructor never destructured it —
    // this.passwordVault was never set, and there were zero passwords:*
    // IPC handlers below. The passwords plugin still worked (its
    // autofill/save flow composes gates directly via the bus, which
    // never needed IPC), but any future renderer-side management panel
    // would have silently failed. Fixed now.
    this.passwordVault = passwordVault;
    this.loginPortal   = loginPortal || null;
    this.speech        = speech;
    this.macroTool     = macroTool;
    this.pluginHost    = pluginHost;
    // §FIXED 2026-08-23 — real, pre-existing gap found while wiring the
    // new listener-routing work below: main/index.js's real IpcBridge
    // constructor call already passed postEvent (confirmed at the real
    // call site), but this class never captured it — silently dropped
    // by destructuring, not an error, just unused. Needed now for
    // ledger/compartment routing.
    this.postEvent   = postEvent || (() => {});
    this.app         = express();
    this.server      = null;
    this._bindRendererHandlers();
    this._bindDownloadListeners();
  }

  // §2026-08-28 — James: "a download listener for artifacts." Real bus
  // subscription — downloads/adapter.js emits 'downloads.completed' onto
  // the real core bus (confirmed directly, not the SSE-only broadcast),
  // so this class can react without the renderer being involved at all.
  // Every matching, enabled download listener routes through the exact
  // same _routeToLinkTarget dispatch a DOM listener already uses — same
  // real ledger/intelligence/compartment/sse-system/copilot-cli/
  // copilot-panel/ollama-stream targets, no second implementation.
  _bindDownloadListeners() {
    on('downloads.completed', (event) => {
      if (!this.options?.findDownloadListenersForDownload) return;
      const d = event.data || {};
      // §HONEST — only a genuinely completed download triggers a
      // listener. An interrupted or cancelled download still gets
      // real, honest state in DownloadsStore (adapter.js already
      // handles that), but nothing "completed" actually happened for a
      // listener to react to.
      if (d.state !== 'completed') return;
      const matches = this.options.findDownloadListenersForDownload(d.agentId, d.filename);
      for (const listener of matches) {
        this._routeToLinkTarget(listener.linkTarget, { downloadId: d.id, ...d }, 'downloadId');
      }
    });
  }

  async start() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      // §CORS 0.39.241 — found by the Library window probe: the preflight named no
      // methods, and a browser then allows only GET/HEAD/POST cross-origin. Every
      // DELETE/PUT/PATCH the Library sends (remove a download, delete a bookmark,
      // history entry, account, password or autofill profile, edit a profile) was
      // refused before reaching this server — in the old ui/library page on :9000
      // exactly as in the new window. The buttons did nothing and said nothing.
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // ── Primary command endpoint — all commands become bus events ─────────
    this.app.post('/cmd', (req, res) => {
      const { eventType, data, requestId = uuidv4() } = req.body;
      if (!eventType) return res.status(400).json({ error: 'eventType required' });

      // One-shot response listener
      const responseType = eventType.replace(/\.(exec|request|send|run|create|save|restore|route|spawn|enqueue|listen)$/, '') + '.result';
      const cleanup = [];
      const timeout = setTimeout(() => {
        cleanup.forEach(u => u());
        res.json({ ok: true, requestId, async: true, note: 'Result will arrive on SSE stream' });
      }, 500);

      // Emit onto the bus — gate will handle it
      try {
        emit(eventType, { ...data, requestId });
        // Return immediately — result flows through SSE
        clearTimeout(timeout);
        res.json({ ok: true, requestId, emitted: eventType });
      } catch (err) {
        clearTimeout(timeout);
        res.status(500).json({ error: err.message, requestId });
      }
    });

    // ── Status ────────────────────────────────────────────────────────────
    this.app.get('/status', (req, res) => {
      const bus = getBus();
      const sample = bus.sampleHere();
      res.json({
        ok:       true,
        module:   'clear-glass',
        bus:      sample,
        contexts: this.ctxMgr?.listIds() || [],
        agents:   this.mesh?.listAgents() || [],
        listeners: this.urlListener?.list() || [],
        // §DIAGNOSTIC-AWARE 2026-08-28 — real uptime, so service/nexus-
        // diagnostic.js's pollSystem() (which already reads .uptime off
        // whatever JSON a system's health/status endpoint returns, for
        // every other system) gets a real number for Clear Glass too,
        // not undefined. Nothing else in pollSystem() needed to change —
        // it's already fully generic over any system with a port + a
        // 200-returning endpoint.
        uptime:   process.uptime(),
        ts:       Date.now(),
      });
    });

    // ── Bus log ───────────────────────────────────────────────────────────
    this.app.get('/bus/log', (req, res) => {
      const { getLog } = require('../core/bus');
      const log = getLog();
      res.json(log ? log.sample() : { error: 'No log' });
    });

    // ── Direct query endpoints (read-only, no bus needed) ─────────────────
    this.app.get('/contexts', (req, res) => res.json({ contexts: this.ctxMgr?.list() || [] }));
    this.app.get('/agents',   (req, res) => res.json({ agents: this.mesh?.listAgents() || [] }));
    this.app.get('/url-listeners',(req, res) => res.json({ listeners: this.urlListener?.list() || [] }));

    // §BUILT 2026-09-16 — James: RAID→ClearGlass wiring. archaeology.js's
    // setActiveCompartment() (activates DOM-event ledgering for a
    // compartment) has been callable since 2026-09-13 but only from
    // inside this same Electron process — nothing outside it (RAID runs
    // in the orchestrator's own separate Node process) had a way in.
    // Real fix, minimal surface: one HTTP route, same require() pattern
    // main/index.js:1424 already uses for this exact function.
    this.app.post('/compartment/active', (req, res) => {
      const { compartmentUuid, queueId } = req.body || {};
      if (!compartmentUuid) return res.status(400).json({ ok: false, error: 'compartmentUuid required' });
      const { setActiveCompartment } = require('../dom/archaeology');
      setActiveCompartment(compartmentUuid, queueId || null);
      res.json({ ok: true });
    });

    // §SBP12 2026-08-28 — James: "finish it off." Real, requested
    // aggregation: TX16's listener registry, the 4 provider userscripts'
    // real state, hat-forge's real hats, and options.listAccounts() have
    // no single real view connecting them. Composes ONLY existing real
    // data — same pattern the diagnostic SYSTEMS registry already
    // proved (compose, don't rebuild). Each key degrades independently
    // to [] on its own real failure rather than one bad source blanking
    // the whole response.
    this.app.get('/agent-suite', async (req, res) => {
      let hats = [];
      try { hats = require('../../../lib/hat-forge.js').list(); } catch (_) {}
      // §FIX 2026-08-29 — James: "fix them." The real duplicate found
      // reviewing every agent phase: copilot/server.js's own real GET
      // /api/agent/suite (self-model.js's getCurrentAgent() + hat-
      // forge's list()) already existed before this endpoint was built
      // — confirmed by reading both directly, neither a strict superset
      // of the other. Two live processes, so the real fix isn't
      // deleting either one — it's this endpoint pulling the ONE piece
      // it was genuinely missing (which agent is actually active right
      // now) from copilot's own real, separate /api/agent/current via a
      // real network call, same composition pattern already proven this
      // session for .nex/COS (compose across a real process boundary,
      // don't force one side to own everything). hat-forge's list() stays
      // called locally here, not proxied — it's a real, cheap, in-process
      // call with no reason to add a network hop for data already free.
      const current = await this._getCopilotCurrentAgent();
      res.json({
        current,
        agents:    this.mesh?.listAgents() || [],
        hats,
        listeners: this.options?.listListeners() || [],
        accounts:  this.options?.listAccounts() || [],
        ts: Date.now(),
      });
    });

    // §CLI-COMMANDS 2026-08-30 — James: "everything in clear glass has to
    // have a command for the cli. That way co-pilot can fix it." Real
    // finding: 36 of 67 real registered components (registry-components.js)
    // are IPC-only — reachable only from inside the Electron renderer,
    // with zero external, CLI/co-pilot-callable path. Starting with the
    // safest, most immediately useful subset: real, already-working
    // read-only "list" operations — exactly what co-pilot needs to SEE
    // real current state before attempting to fix anything. Each route
    // calls the exact same real handler the IPC channel already calls —
    // one implementation, two entry points, same pattern already proven
    // for /agent-suite and /listeners earlier this session.
    //
    // §HONEST LIMIT — found while doing this, not silently worked around:
    // registry-components.js also lists history.list/extensions.list as
    // real components, but grep confirms zero implementing files exist
    // anywhere in this lineage (HistoryStore/ExtensionManager came from a
    // different branch's zip, never actually merged here) — the registry
    // promises a capability this checkout genuinely does not have. Not
    // fixed here; named directly rather than faked with an empty stub.
    this.app.get('/cli/calltos',            (req, res) => res.json({ calltos: this.options?.listCalltos() || [] }));
    this.app.get('/cli/downloads/listeners',(req, res) => res.json({ listeners: this.options?.listDownloadListeners() || [] }));
    // §BUILT 2026-09-15 — James: "...clearglass download manager..." as a
    // guardian response sink. downloads:* was IPC-only (ipcMain.handle,
    // renderer-side); nothing outside Electron could reach the real
    // DownloadsStore. This is that missing HTTP entry, mirroring the
    // shape downloads:list/downloads.js's add() already accepts.
    this.app.post('/cli/downloads', (req, res) => {
      if (!this.downloads) return res.status(503).json({ error: 'downloads store not available' });
      try { res.json({ ok: true, record: this.downloads.add(req.body || {}) }); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
    // §BUILT 2026-09-19 — the one real gap: POST above adds a download
    // record (used internally when one starts), but nothing listed the
    // real ones already recorded — checked directly, DownloadStore's
    // own list({agentId, state}) had no route at all.
    this.app.get('/cli/downloads', (req, res) => res.json({ downloads: this.downloads?.list(req.query) || [] }));
    this.app.delete('/cli/downloads/:id', (req, res) => res.json(this.downloads?.clearItem(req.params.id) || { error: 'downloads unavailable' }));
    // §RESPONSES 0.39.239 — James: "the download manager should be routing the
    // response to the agent or compartment id" and "needs a ui so i can actually
    // see this". Every agent reply guardian completes is already written to
    // clear-glass/src/downloads/artifact-chat-index.js (guardian/lib/code-artifact.js
    // recordAgentResponse, since 2026-09-20) — in the COS compartment
    // 'clearglass-downloads-index' — and nothing could read it back. These two
    // routes are that read side, for the Library window's Responses tab. The root
    // comes from the index's own defaultRoot(), the same call guardian's writer
    // makes, so both sides address the same compartment. Read-only.
    // §0.39.278 — the live chat ledger (src/downloads/chat-ledger.js). James: "live streams the dom mutation live to
    // the download manager, that way we don't lose progress." Each provider tab's MutationObserver
    // (guardian/userscript-chat-stream.js) POSTs what changed; it is appended to that chat's ledger at once. The chat
    // is also ONE entry in the downloads list (kind 'chat-ledger'): in progress while the page is generating,
    // completed when it settles — so Ctrl+J shows every chat being written, next to every file.
    const _ledgerDownloads = new Map();   // chatKey -> downloads record id
    const _ledgerEntry = (r, d) => {
      if (!this.downloads || !r || !r.ok) return;
      const state = r.generating ? 'in_progress' : 'completed';
      let id = _ledgerDownloads.get(r.chatKey);
      if (!id) {
        const had = this.downloads.list({}).find(x => x.kind === 'chat-ledger' && x.savePath === r.file);
        id = had ? had.id : this.downloads.add({ kind: 'chat-ledger', filename: `${d.provider} chat ${d.chatId}`.slice(0, 120), url: d.url || null,
          savePath: r.file, mimeType: 'application/x-ndjson', agentId: d.agentId || null, provider: d.provider, source: 'chat-stream', state }).id;
        _ledgerDownloads.set(r.chatKey, id);
      }
      let bytes = 0; try { bytes = require('fs').statSync(r.file).size; } catch (_) {}
      this.downloads.updateState(id, state, { bytes });
    };
    this.app.post('/cli/downloads/ledger', (req, res) => {
      try {
        const d = req.body || {};
        const r = require('../downloads/chat-ledger.js').applyDelta(d);
        // any appended line — text, or only generating → false — updates the entry (in progress → completed)
        if (r.ok && r.appended) { try { _ledgerEntry(r, d); } catch (_) { /* the list entry is a view; the ledger line is written */ } }
        const { file, ...out } = r;
        res.status(r.ok || r.resync ? 200 : 400).json(out);
      } catch (e) { res.status(503).json({ ok: false, error: `chat ledger unavailable: ${e.message}` }); }
    });
    this.app.get('/cli/downloads/ledgers', (req, res) => {
      try {
        const q = req.query || {};
        res.json({ ok: true, ledgers: require('../downloads/chat-ledger.js').listLedgers({ agentId: q.agentId, provider: q.provider || undefined, limit: q.limit }).map(({ file, ...x }) => x) });
      } catch (e) { res.status(503).json({ ok: false, error: `chat ledger unavailable: ${e.message}` }); }
    });
    this.app.get('/cli/downloads/ledgers/:chatKey', (req, res) => {
      try {
        const c = require('../downloads/chat-ledger.js').readChat({ chatKey: req.params.chatKey });
        if (!c) return res.status(404).json({ ok: false, error: `no ledger for ${req.params.chatKey}` });
        res.json({ ok: true, chat: c });
      } catch (e) { res.status(503).json({ ok: false, error: `chat ledger unavailable: ${e.message}` }); }
    });
    const _responsesRoot = () => require('../downloads/artifact-chat-index.js').defaultRoot();
    this.app.get('/cli/downloads/responses', (req, res) => {
      try {
        const index = require('../downloads/artifact-chat-index.js');
        const q = req.query || {};
        const limit = Math.min(Math.max(parseInt(q.limit, 10) || 200, 1), 1000);
        // 0.39.254 — a chat transcript is one row per chat (its newest version, with
        // `versions`), not one row per version. ?versions=all lists every version.
        const all = q.versions === 'all';
        const rows = index.queryItems(_responsesRoot(), { kind: q.kind || undefined, provider: q.provider || undefined, agentId: q.agentId || undefined, jobId: q.jobId || undefined, chatKey: q.chatKey || undefined, limit: all ? limit : 100000 });
        const items = all ? rows : index.collapseVersions(rows).slice(0, limit);
        // Every agent that has at least one item, so a view can filter without a second call.
        const agents = {};
        for (const it of index.collapseVersions(index.queryItems(_responsesRoot(), { limit: 100000 }))) { const a = it.agent_id || '(no agent)'; agents[a] = (agents[a] || 0) + 1; }
        res.json({ ok: true, items, agents });
      } catch (e) { res.status(503).json({ ok: false, error: `downloads index unavailable: ${e.message}` }); }
    });
    this.app.get('/cli/downloads/responses/:id', (req, res) => {
      try {
        const r = require('../downloads/artifact-chat-index.js').readItem(_responsesRoot(), req.params.id);
        if (!r) return res.status(404).json({ ok: false, error: `no response ${req.params.id}` });
        if (r.error && !r.status) return res.status(400).json({ ok: false, error: r.error });
        res.json({ ok: true, item: r });
      } catch (e) { res.status(503).json({ ok: false, error: `downloads index unavailable: ${e.message}` }); }
    });
    // §BUILT 2026-09-21 — found while wiring library-app.js's downloads
    // tab: downloads:clearCompleted has been a real IPC handler since
    // 2026-09-19 (this.downloads.clearCompleted(), same store as the two
    // routes above) but had no /cli/* door, the same gap macros/autofill
    // had — library-app.js has no IPC access at all, only fetch().
    this.app.post('/cli/downloads/clear-completed', (req, res) => res.json({ removed: this.downloads?.clearCompleted() ?? 0 }));
    this.app.get('/cli/site-settings',      (req, res) => res.json({ settings: this.siteSettings?.getAllForOrigin(req.query.url) || null }));
    this.app.get('/cli/rewind',             (req, res) => res.json({ snapshots: this.rewind?.list(req.query.agentId, req.query.limit ? +req.query.limit : undefined) || [] }));
    this.app.get('/cli/passwords',          (req, res) => res.json({ passwords: this.passwordVault?.list() || [] }));
    this.app.get('/cli/macros', async (req, res) => {
      if (!this.macroTool) return res.status(503).json({ error: 'macro tool not available' });
      try { res.json(await this.macroTool.execute({ action: 'list' })); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.get('/cli/bgtab', (req, res) => res.json({ tabs: require('../main/index').listBackgroundTabs?.() || [] }));

    // §BUILT 2026-09-21 — James: "the clearglass macros, autofill, keyboard
    // shortcuts... build them, then expand the ui, like it should have
    // been." Macros and autofill each had a complete, real IPC surface
    // (macros:*, autofill:*, both already wired above/below) and ZERO
    // reach from anywhere a person could actually click — ui/library's own
    // header comment says "Reached by plain fetch() to clear-glass's own
    // :7702 /cli/* REST surface, NOT the IPC bridge (that's only
    // privileged inside ClearGlass's main renderer)", but library-app.js
    // itself was never written (referenced by index.html's <script src>,
    // the file did not exist) and neither macros nor autofill had a /cli/*
    // route at all — only IPC. These close that gap for both.
    //
    // /cli/agents — new. Needed by BOTH panels: running a macro or an
    // autofill fill/detect targets a specific live browser SESSION
    // (agentId), and library-app.js runs in its own standalone window,
    // not inside any one agent's chrome — it has no "current tab" to
    // assume. listOpenAgents() already existed (wired only to IPC's
    // window:list), reused as-is, not reimplemented.
    this.app.get('/cli/agents', (req, res) => res.json(require('../main/index').listOpenAgents?.() || { windows: [], bgTabs: [] }));

    // /cli/autofill/* — new. Same real functions the autofill:* IPC
    // handlers below already call (_autofillDetect/_autofillFill,
    // this.autofillStore's CRUD) — one implementation, a second door.
    this.app.get('/cli/autofill/field-types', (req, res) => {
      const { FIELD_TYPES, DOCUMENT_FIELDS } = require('../autofill/store.js');
      res.json({ fieldTypes: FIELD_TYPES, documentFields: DOCUMENT_FIELDS });
    });
    this.app.get('/cli/autofill/profiles', (req, res) => res.json({ profiles: this.autofillStore?.listProfiles() || [] }));
    this.app.get('/cli/autofill/profiles/:id', (req, res) => {
      const p = this.autofillStore?.getProfile(req.params.id);
      return p ? res.json({ profile: p }) : res.status(404).json({ error: `no autofill profile "${req.params.id}"` });
    });
    this.app.post('/cli/autofill/profiles', (req, res) => {
      if (!this.autofillStore) return res.status(503).json({ error: 'autofill unavailable' });
      const r = this.autofillStore.createProfile(req.body || {});
      return r.error ? res.status(400).json(r) : res.json({ profile: r });
    });
    this.app.put('/cli/autofill/profiles/:id', (req, res) => {
      if (!this.autofillStore) return res.status(503).json({ error: 'autofill unavailable' });
      const r = this.autofillStore.updateProfile(req.params.id, req.body || {});
      return r.error ? res.status(r.error.startsWith('no autofill profile') ? 404 : 400).json(r) : res.json({ profile: r });
    });
    this.app.delete('/cli/autofill/profiles/:id', (req, res) => {
      if (!this.autofillStore) return res.status(503).json({ error: 'autofill unavailable' });
      const r = this.autofillStore.deleteProfile(req.params.id);
      return r.error ? res.status(404).json(r) : res.json(r);
    });
    // Same real risk/scope note as macros:run above — detect/fill drive a
    // live agent tab; exposed deliberately so library-app.js (which has
    // no IPC access) can reach the same real functions the in-browser
    // path would use, not a second implementation of either.
    this.app.post('/cli/autofill/detect', async (req, res) => {
      if (!this.dom || !this.autofillStore) return res.status(503).json({ error: 'autofill unavailable' });
      try { res.json(await _autofillDetect(this.dom, this.autofillStore, { agentId: req.body?.agentId || 'default', profileId: req.body?.profileId })); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.post('/cli/autofill/fill', async (req, res) => {
      if (!this.dom || !this.autofillStore) return res.status(503).json({ error: 'autofill unavailable' });
      try {
        res.json(await _autofillFill(this.dom, this.autofillStore, {
          agentId: req.body?.agentId || 'default', profileId: req.body?.profileId, minConfidence: req.body?.minConfidence || 'medium',
        }));
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // §BUILT 2026-09-21 — James: "answering on screen questions." Backend
    // kernel only this pass (see clear-glass/src/screen-qa/detector.js's
    // own header for the honest list of what's still unbuilt on top of
    // it: hotkey, right-click menu, element-picker mode, settings UI,
    // dual preview). Preview-first, never auto-fills: detect -> answer
    // (text only, nothing written to the page) -> a SEPARATE explicit
    // inject call, matching James: "show it first... you approve or
    // edit, then it fills."
    this.app.get('/cli/screen-qa/detect', async (req, res) => {
      if (!this.dom) return res.status(503).json({ error: 'dom bridge unavailable' });
      try { res.json(await _screenQaDetect(this.dom, this.autofillStore, { agentId: req.query?.agentId || 'default', profileId: req.query?.profileId || null })); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.post('/cli/screen-qa/answer', async (req, res) => {
      if (!this.copilot) return res.status(503).json({ error: 'copilot bridge not initialized' });
      const { question, context, agentId } = req.body || {};
      const send = async (message) => {
        const r = await this.copilot.send({ message, agentId: agentId || 'default' });
        return (r && (r.text || r.reply || r.message)) || '';
      };
      // §BUILT 2026-09-21 — no native notification on this REST path,
      // deliberately: it's ui/library's door (and this suite's own
      // tests), not the interactive hotkey/right-click/picker flow the
      // "isolated toast" was asked for — that flow goes through the
      // IPC handler above, which fires one. Firing an OS notification
      // for every programmatic call to this endpoint would be surprising
      // noise, not the reliability guarantee James asked for.
      res.json(await _screenQaAnswer({ question, context }, send));
    });
    this.app.post('/cli/screen-qa/inject', async (req, res) => {
      if (!this.dom) return res.status(503).json({ error: 'dom bridge unavailable' });
      const { agentId, cgId, text } = req.body || {};
      try { res.json(await _screenQaInject(this.dom, { agentId: agentId || 'default', cgId, text })); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });

    // §COMMAND-INDEX 2026-08-30 — the real, live index itself, servable
    // directly (not just the on-disk copy) so a caller always gets the
    // truly-current set without needing filesystem access.
    this.app.get('/cli/commands', (req, res) => res.json(this._buildCommandIndex()));

    // 0.39.272 — the synchronous agent surface: POST /cli/driver (the driver's result in the response, not on SSE),
    // POST /cli/page/read, GET /cli/state, and GET/POST /cli/invoke (every IPC channel by name, same handler).
    // See ipc/agent-routes.js and ipc/handler-registry.js for why each exists.
    require('./agent-routes').install(this.app, {
      driver: this.driver, providerHost: this.providerHost, options: this.options, autofillStore: this.autofillStore,
      macroTool: this.macroTool, userscripts: this.userscripts, downloads: this.downloads, ctxMgr: this.ctxMgr, mesh: this.mesh,
      webExtensions: this.webExtensions || null, handlers: require('./handler-registry'),
      listAgents: () => require('../main/index').listOpenAgents?.() || { windows: [], bgTabs: [] },
      listBgTabs: () => require('../main/index').listBackgroundTabs?.() || [],
    });

    // §CLI-COMMANDS 2026-08-30, continued — James: "cli commands." Real,
    // genuinely uncovered write/action operations, each reviewed for
    // real side-effect safety before exposing externally (not a blind
    // batch conversion of every remaining IPC-only entry). bookmarks.
    // addWithState already had a real route (POST /bookmarks/with-state,
    // confirmed directly) — not duplicated here.
    this.app.get('/cli/calltos/for-url', (req, res) => res.json({ calltos: this.options?.findCalltosForUrl(req.query.url) || [] }));
    this.app.delete('/cli/calltos/:id', (req, res) => res.json(this.options?.removeCallto(req.params.id) || { error: 'options unavailable' }));

    this.app.post('/cli/bgtab', async (req, res) => {
      try { res.json(await require('../main/index').openBackgroundTab(req.body)); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.delete('/cli/bgtab/:agentId', async (req, res) => {
      try { res.json(await require('../main/index').closeBackgroundTab(req.params.agentId)); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.get('/cli/macros/:name', async (req, res) => {
      if (!this.macroTool) return res.status(503).json({ error: 'macro tool not available' });
      try { res.json(await this.macroTool.execute({ action: 'get', name: req.params.name })); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });

    // §REAL RISK NOTE — macros:run genuinely drives a live browser tab
    // (real clicks/typing per macro.js's own erosmancer integration).
    // Exposed deliberately, matching this whole request's real point
    // ("so co-pilot can fix it") — co-pilot running a real, existing,
    // already-reviewed macro is the actual use case, not a new risk this
    // route introduces; the macro's own real content is what acts, this
    // route is just a second, equally-real door to trigger it.
    this.app.post('/cli/macros/:name/run', async (req, res) => {
      if (!this.macroTool) return res.status(503).json({ error: 'macro tool not available' });
      try {
        res.json(await this.macroTool.execute({
          action: 'run', name: req.params.name,
          agentId: req.body?.agentId, params: req.body?.params, skipSnapshot: req.body?.skipSnapshot,
        }));
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.post('/cli/downloads/listeners', (req, res) => res.json(this.options?.registerDownloadListener(req.body) || { error: 'options unavailable' }));
    this.app.patch('/cli/downloads/listeners/:id', (req, res) => res.json(this.options?.updateDownloadListener(req.params.id, req.body) || { error: 'options unavailable' }));
    this.app.delete('/cli/downloads/listeners/:id', (req, res) => res.json(this.options?.removeDownloadListener(req.params.id) || { error: 'options unavailable' }));

    // §CLI-COMMANDS 2026-08-30, final slice — James: "yes. everything.
    // make clear glass extremely high leverage." Every remaining real
    // IPC-only operation, each still checked against its own real
    // handler signature before building the route (not a blind loop
    // over the registry), same discipline as every prior slice.

    // ── site-settings — real per-origin key/value store ─────────────
    this.app.get('/cli/site-settings/key', (req, res) => res.json({ value: this.siteSettings?.get(req.query.url, req.query.key) ?? null }));
    this.app.put('/cli/site-settings/key', (req, res) => res.json(this.siteSettings?.set(req.body?.url, req.body?.key, req.body?.value) || { error: 'siteSettings unavailable' }));
    this.app.delete('/cli/site-settings/key', (req, res) => res.json(this.siteSettings?.deleteKey(req.query.url, req.query.key) || { error: 'siteSettings unavailable' }));
    this.app.delete('/cli/site-settings', (req, res) => res.json(this.siteSettings?.clear(req.query.url) || { error: 'siteSettings unavailable' }));
    this.app.get('/cli/site-settings/origins', (req, res) => res.json({ origins: this.siteSettings?.listOrigins() || [] }));

    // ── history — the real, freshly-built store, first-ever CLI reach ──
    this.app.get('/cli/history', (req, res) => res.json({ entries: this.history?.list(req.query) || [] }));
    this.app.delete('/cli/history/:id', (req, res) => res.json(this.history?.delete(req.params.id) || { error: 'history unavailable' }));
    this.app.delete('/cli/history', (req, res) => res.json(this.history?.clear(req.query.agentId) || { error: 'history unavailable' }));

    // §BUILT 2026-09-19 — James: "library ui... its own file. no
    // monoliths." A standalone UI page (matching ui/brainos/'s own
    // real precedent — a static page opened via openAgentWindow,
    // reached by plain fetch(), NOT the IPC bridge, which is only
    // privileged inside ClearGlass's own main renderer) needs a real
    // REST surface for exactly the data bookmarks/accounts already
    // have gates and IPC handlers for, but no CLI route at all yet —
    // checked directly, zero /cli/bookmarks or /cli/accounts matches
    // anywhere in this file before this.
    this.app.get('/cli/bookmarks', (req, res) => res.json({ bookmarks: this.bookmarks?.list(req.query) || [] }));
    this.app.post('/cli/bookmarks', (req, res) => res.json(this.bookmarks?.add(req.body) || { error: 'bookmarks unavailable' }));
    this.app.delete('/cli/bookmarks/:id', (req, res) => res.json(this.bookmarks?.remove({ id: req.params.id }) || { error: 'bookmarks unavailable' }));

    this.app.get('/cli/accounts', (req, res) => res.json({ accounts: this.options?.listAccounts() || [] }));
    this.app.get('/cli/accounts/:id', (req, res) => res.json({ account: this.options?.getAccount(req.params.id) || null }));
    this.app.post('/cli/accounts', (req, res) => res.json(this.options?.createAccount(req.body) || { error: 'accounts unavailable' }));
    this.app.put('/cli/accounts/:id', (req, res) => res.json(this.options?.updateAccount(req.params.id, req.body?.updates) || { error: 'accounts unavailable' }));
    this.app.delete('/cli/accounts/:id', (req, res) => res.json(this.options?.deleteAccount(req.params.id) || { error: 'accounts unavailable' }));
    this.app.post('/cli/accounts/:id/provider', (req, res) => res.json(this.options?.linkProviderAccount(req.params.id, req.body?.provider, req.body) || { error: 'accounts unavailable' }));
    this.app.delete('/cli/accounts/:id/provider/:provider', (req, res) => res.json(this.options?.unlinkProviderAccount(req.params.id, req.params.provider) || { error: 'accounts unavailable' }));

    // ── rewind — real per-agent snapshot/restore/clear ───────────────
    // §REAL RISK NOTE — restore() is genuinely destructive (replaces an
    // agent's real, current state with a prior snapshot). Exposed
    // deliberately: "so co-pilot can fix it" explicitly implies real
    // undo/rollback capability, which is exactly what this is — the
    // real safety net, not a risk added on top of one.
    this.app.post('/cli/rewind/:agentId/snapshot', async (req, res) => {
      try { res.json(await this.rewind?.snapshot(req.params.agentId, req.body) ?? { error: 'rewind unavailable' }); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.post('/cli/rewind/restore', async (req, res) => {
      try { res.json(await this.rewind?.restore(req.body) ?? { error: 'rewind unavailable' }); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.delete('/cli/rewind/:agentId', async (req, res) => {
      try { res.json(await this.rewind?.clear(req.params.agentId) ?? { error: 'rewind unavailable' }); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── passwords — delete only; list already real from the earlier slice ──
    this.app.delete('/cli/passwords/:id', (req, res) => res.json(this.passwordVault?.delete(req.params.id) || { error: 'passwordVault unavailable' }));

    // ── speech — availability check real and cheap; transcription needs
    // real binary audio data, base64-encoded over JSON since this is a
    // plain HTTP/JSON route, not a multipart upload endpoint ──
    this.app.get('/cli/speech/available', async (req, res) => res.json({ available: await this.speech?.isAvailable() ?? false }));
    this.app.post('/cli/speech/transcribe', async (req, res) => {
      if (!this.speech) return res.status(503).json({ error: 'speech unavailable' });
      try {
        const buffer = Buffer.from(req.body?.audioBase64 || '', 'base64');
        res.json(await this.speech.transcribeBuffer?.(buffer, req.body?.ext || 'webm') ?? { error: 'transcribeBuffer unavailable' });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── userscripts — the full real cluster, none of it was CLI-reachable ──
    this.app.get('/cli/userscripts', (req, res) => res.json({ scripts: this.userscripts?.list(req.query) || [] }));
    this.app.get('/cli/userscripts/:id/source', (req, res) => res.json({ source: this.userscripts?.getSource(req.params.id) ?? null }));
    this.app.post('/cli/userscripts', (req, res) => res.json(this.userscripts?.create(req.body) || { error: 'userscripts unavailable' }));
    this.app.patch('/cli/userscripts/:id', (req, res) => res.json(this.userscripts?.edit(req.params.id, req.body) || { error: 'userscripts unavailable' }));
    this.app.delete('/cli/userscripts/:id', (req, res) => res.json(this.userscripts?.delete(req.params.id) || { error: 'userscripts unavailable' }));
    this.app.post('/cli/userscripts/:id/toggle', (req, res) => res.json(this.userscripts?.toggle(req.params.id, req.body?.enabled) || { error: 'userscripts unavailable' }));
    this.app.post('/cli/userscripts/:id/inject', async (req, res) => {
      try { res.json(await this.userscripts?.inject(req.body?.agentId, req.params.id) ?? { error: 'userscripts unavailable' }); }
      catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.get('/diag/reports', (req, res) => res.json({ reports: this.diag?.listReports() || [] }));
    this.app.get('/api-settings', (req, res) => res.json(this.apiSettings?.getPublic() || {}));

    this.app.post('/api-settings', async (req, res) => {
      try { await this.apiSettings.set(req.body); res.json({ ok: true }); }
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Fingerprint profiles ──────────────────────────────────────────────
    this.app.get('/fingerprint/:agentId', (req, res) => {
      const profile = this.fp?.getOrGenerate(req.params.agentId);
      const safe = { ...profile };
      res.json(safe || { error: 'not found' });
    });

    // Mount new route groups
    this._addBookmarkRoutes();
    this._addListenerRoutes();
    this._addRewindRoutes();
    this._addProviderRoutes();

    // §COMMAND-INDEX 2026-08-30 — James: "have the living command index
    // in the systems data folder, backed up into cortex, and hooked into
    // co-pilot so it can use clearglass at full compatibility." Built
    // AFTER every real route above has mounted (this exact point in
    // start(), right before listen()) — introspects Express's own real,
    // live route table (this.app._router.stack), not registry-
    // components.js, which this same session already found has stale/
    // aspirational entries (history/extensions were listed there with
    // zero real implementation). A route this code can't see literally
    // doesn't exist — the index can never drift from reality the way a
    // hand-maintained or separately-generated one could.
    this._writeCommandIndex();

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, '127.0.0.1', () => {
        console.log(`[IPC] :${this.port}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  /**
   * _buildCommandIndex() — the real, live introspection. Express's
   * app._router.stack contains both real routes (layer.route exists)
   * and middleware (layer.route is undefined, e.g. the json()/CORS
   * middleware registered above) — filtered to routes only. A route
   * mounted via router.use() (like _addBookmarkRoutes' internal routes)
   * shows up as a nested layer.handle.stack, walked recursively so
   * nothing real is missed just because of how it was grouped.
   */
  _buildCommandIndex() {
    const commands = [];
    const walk = (stack, prefix = '') => {
      for (const layer of stack || []) {
        if (layer.route) {
          const path = prefix + layer.route.path;
          for (const method of Object.keys(layer.route.methods)) {
            if (layer.route.methods[method]) commands.push({ method: method.toUpperCase(), path });
          }
        } else if (layer.name === 'router' && layer.handle?.stack) {
          walk(layer.handle.stack, prefix);
        }
      }
    };
    walk(this.app._router?.stack);
    return {
      systemId: 'clear-glass', port: this.port,
      generatedAt: Date.now(),
      commandCount: commands.length,
      commands: commands.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    };
  }

  /**
   * _writeCommandIndex() — real, persisted to the real systems data
   * folder (data/clear-glass/, matching every other real system's own
   * data/<systemId>/ convention this codebase already uses), and
   * fire-and-forget POSTed to cortex's real, existing /api/event as the
   * real backup record — same pattern already proven this session for
   * cross-process notifications (the lock-collision reporting). A
   * failure to reach cortex never blocks the real, local file write;
   * the local file IS the living index co-pilot's tool (built alongside
   * this) reads directly, not a live network call every time.
   */
  _writeCommandIndex() {
    const index = this._buildCommandIndex();
    try {
      const fs = require('fs'), path = require('path');
      // 0.39.239 — was hard-wired to the real data/ folder, so a test that starts
      // this bridge rewrote the live command index. Same fix as 0.39.236's stores:
      // the sandbox is asked first, and NEXUS_DATA_ROOT (set by it in a test
      // process) wins. In production nothing changes: the default is the same path.
      try { require('../../../lib/test-sandbox.js').ensure(); } catch (_) {}
      const dir = path.join(process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', '..', '..', 'data'), 'clear-glass');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'command-index.json'), JSON.stringify(index, null, 2));
      console.log(`[IPC] real command index written — ${index.commandCount} real commands`);
    } catch (e) {
      console.warn(`[IPC] could not write real command index to disk: ${e.message}`);
    }
    try {
      const http = require('http');
      const payload = JSON.stringify({ type: 'clear-glass.command-index.updated', source: 'clear-glass', payload: index });
      const req = http.request({ hostname: '127.0.0.1', port: 3748, path: '/api/event', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 2000 }, r => r.resume());
      req.on('error', () => {}); // best-effort — cortex may not be up yet, the real local file above is the guaranteed record
      req.on('timeout', () => req.destroy());
      req.write(payload); req.end();
    } catch (_) { /* best-effort, see above */ }
    return index;
  }

  // ── Renderer → Main IPC (via preload contextBridge) ───────────────────
  _bindRendererHandlers() {
    // All renderer calls become bus events
    const rendererEmit = (eventType, data) => {
      try { emit(eventType, data); return { ok: true }; }
      catch (err) { return { error: err.message }; }
    };

    ipcMain.handle('navigate',       async (e, d) => rendererEmit('driver.exec', { action: 'navigate', ...d }));
    ipcMain.handle('dom:query',      async (e, d) => rendererEmit('dom.query', d));
    ipcMain.handle('dom:mutate',     async (e, d) => rendererEmit('dom.mutate', d));
    ipcMain.handle('dom:pick',       async (e, d) => rendererEmit('dom.pick', d));
    ipcMain.handle('driver:exec',    async (e, d) => rendererEmit('driver.exec', d));
    ipcMain.handle('cookies:save',   async (e, d) => rendererEmit('cookie.save', d));
    ipcMain.handle('cookies:restore',async (e, d) => rendererEmit('cookie.restore', d));
    // §fix 2026-06-30 — found while auditing the screenshot's dead "Cookies: 0"
    // indicator: updateCookieCount() in browser.html called cg.cookies.save()
    // (wrong method — save persists, doesn't count) then discarded the result
    // entirely and wrote the page URL hostname into the cookie-count label.
    // No cookies:count handler existed anywhere — this capability was a stub.
    // Real implementation: session.cookies.get({url}) for the agent's actual
    // partition, per Electron's documented cookie API.
    // §EXTRACTED 2026-09-02 — pulled the real body into a named function so
    // the new webview-reachable relay below (nexus:cookie-request) can call
    // the exact same real logic instead of a second, duplicated copy.
    const _countCookies = async ({ url, agentId } = {}) => {
      try {
        if (!url) return { ok: false, error: 'url required', count: 0 };
        const partition = `persist:ncp-${agentId || 'default'}`;
        const ses = session.fromPartition(partition);
        const cookies = await ses.cookies.get({ url });
        return { ok: true, count: cookies.length };
      } catch (err) {
        return { ok: false, error: err.message, count: 0 };
      }
    };
    ipcMain.handle('cookies:count', async (e, args) => _countCookies(args));
    // §fix 2026-07-04 — copilot:send was fire-and-forget (rendererEmit only).
    // Now calls the real CoPilotBridge.send() and returns its response,
    // so the renderer gets an actual {text, commands, msgId} back.
    // §BUILT 2026-09-26 — the Clear Glass hat + the pane's CLI (src/copilot/hat.js).
    ipcMain.handle('copilot:hat', async () => require('../copilot/hat').status());
    ipcMain.handle('copilot:hatEnsure', async () => require('../copilot/hat').ensure());
    ipcMain.handle('copilot:hatUpdate', async (e, patch) => require('../copilot/hat').update(patch || {}));
    ipcMain.handle('copilot:exec', async (e, { cmd, agentId } = {}) => (this.copilot ? this.copilot.execCommand(cmd, agentId) : { ok: false, error: 'co-pilot bridge not wired' }));
    // §0.39.278 — the pane's kept conversation (src/copilot/chat-store.js): restore on open, /new starts another.
    ipcMain.handle('copilot:history', async (e, { agentId, limit } = {}) => {
      try { return { ok: true, ...require('../copilot/chat-store').list({ agentId: agentId || 'default', limit: limit || 100 }) }; }
      catch (err) { return { ok: false, error: err.message, turns: [] }; }
    });
    ipcMain.handle('copilot:newConversation', async (e, { agentId } = {}) => {
      try { return { ok: true, conversationId: require('../copilot/chat-store').startNew(agentId || 'default') }; }
      catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('copilot:send', async (e, d) => {
      if (this.copilot) {
        try {
          return await this.copilot.send(d);
        } catch (err) {
          return { text: `Co-pilot error: ${err.message}`, commands: [], msgId: d.requestId };
        }
      }
      // Fallback: bus-only (legacy behaviour if bridge not wired)
      rendererEmit('copilot.message', d);
      return { text: '', commands: [], msgId: d.requestId };
    });
    // §fix 2026-06-30 — the actual ask: "where are the errors, useless."
    // Renderer-process errors (window.onerror, unhandledrejection in
    // browser.html) now report here, captured the same way as main-process
    // errors, logged to the same file, pushed through the same SSE event.
    ipcMain.handle('errors:report', async (e, d) => {
      if (this.errorCapture) return this.errorCapture.captureFromRenderer(d);
      return { ok: false, error: 'errorCapture not initialized' };
    });
    ipcMain.handle('errors:recent', async (e, { n } = {}) => {
      if (!this.errorCapture) return { ok: false, error: 'errorCapture not initialized', errors: [] };
      return { ok: true, errors: this.errorCapture.getRecent(n || 50) };
    });
    // §BUG FIXED 2026-07-11 — this emitted 'context.switch' (fire-and-forget,
    // no return value) but the only thing that ever actually switches a
    // fingerprint is ContextManager.switchFingerprint(), reached via a gate
    // registered under 'context.fp.switch' — a DIFFERENT event name. Nothing
    // in this app ever subscribed to plain 'context.switch', so every call
    // through this channel silently did nothing. The real gate already
    // works — it's how hostile-page detection auto-rotates fingerprints
    // (main/index.js) and how copilot's context.fp.switch tool works.
    // This was the one path a human clicking a UI control would have used,
    // and it was the one path that didn't reach the real method. Calling
    // it directly (not via the bus) also means the renderer gets back the
    // actual new profile/UA instead of nothing, which a manual "switch my
    // identity" action should show the user.
    // §BUG FIXED 2026-07-11, CORRECTED 2026-07-11 — my first pass here
    // was itself a mistake, caught on re-audit rather than left wrong:
    // 'context:switch' already had a REAL, correctly-matched gate —
    // `contextSwitchGate` in src/gates/index.js calls `ctxMgr.switchTo()`
    // (switch which agent's context is active), and the original
    // fire-and-forget `rendererEmit('context.switch', d)` genuinely
    // reached it correctly, since gates and rendererEmit share the same
    // bus. That path was never broken. What's actually true: no IPC
    // channel or preload method for FINGERPRINT switching
    // (`switchFingerprint`) ever existed at all — not a name mismatch,
    // a channel that was simply never added, which is why only the
    // automatic (hostile-detection) and copilot-tool paths could ever
    // reach it. My first fix repurposed this channel for fingerprint
    // switching instead of adding a new one — no existing caller broke
    // (nothing in the renderer called context:switch before I added the
    // identity badge), but it was the wrong channel for the job and left
    // switchTo() itself unreachable by IPC. Restored to its real purpose;
    // fingerprint switching gets its own channel below.
    ipcMain.handle('context:switch', async (e, d) => {
      if (!this.ctxMgr) return { ok: false, error: 'context manager not initialized' };
      try {
        const result = await this.ctxMgr.switchTo(d || {});
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    // The channel the identity badge actually needs — genuinely new, not
    // a repurposing of something else. Calls switchFingerprint() directly
    // for the same reason context:switch now does: a manual user action
    // should get back the real result (new mode + UA), not silence.
    ipcMain.handle('context:switchFingerprint', async (e, d) => {
      if (!this.ctxMgr) return { ok: false, error: 'context manager not initialized' };
      try {
        const result = await this.ctxMgr.switchFingerprint(d || {});
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    ipcMain.handle('api:get',        async ()    => this.apiSettings?.getPublic());
    ipcMain.handle('api:set',        async (e, d) => this.apiSettings?.set(d));
    ipcMain.handle('sse:port',       async ()    => this.sse?.port);

    // Bookmarks
    ipcMain.handle('bookmarks:add',    async (e, d) => this.bookmarks?.add(d));
    ipcMain.handle('bookmarks:remove', async (e, d) => this.bookmarks?.remove(d));
    ipcMain.handle('bookmarks:list',   async (e, d) => this.bookmarks?.list(d));
    ipcMain.handle('bookmarks:check',  async (e, d) => this.bookmarks?.isBookmarked(d));
    ipcMain.handle('bookmarks:visit',  async (e, d) => this.bookmarks?.recordVisit(d));

    // §STATE-LINK 2026-08-27 — the "save state" pair. Real, additive
    // compositions of three already-real pieces (bookmarks, rewind,
    // options-store accounts), not a new bookmark type — see
    // src/bookmarks/store.js's own §STATE-LINK header for the full
    // reasoning. Kept as two explicit handlers rather than an
    // always-capture flag on bookmarks:add, so the existing quick-toggle
    // click path (bookmarks:add) is untouched and still synchronous.
    // §CLI-FIRST 2026-08-27 — logic itself lives in _bookmarkAddWithState/
    // _bookmarkOpenWithState below, not inline here, so the real HTTP
    // routes in _addBookmarkRoutes() (which is what the CLI and co-pilot's
    // agent tool actually reach, over CLEARGL_IPC_PORT — the renderer
    // can't call those directly) run the exact same code, not a
    // reimplementation that could drift from this one.
    ipcMain.handle('bookmarks:addWithState',  async (e, d) => this._bookmarkAddWithState(d));
    ipcMain.handle('bookmarks:openWithState', async (e, d) => this._bookmarkOpenWithState(d));
    // §0.39.265 — attach / detach an account (the ★ dialog's check mark) or a snapshot
    ipcMain.handle('bookmarks:linkState',     async (e, d) => this.bookmarks?.linkState(d || {}));

    // Rewind
    ipcMain.handle('rewind:list',     async (e, d) => this.rewind?.list(d.agentId, d.limit));
    ipcMain.handle('rewind:snapshot', async (e, d) => this.rewind?.snapshot(d.agentId, d));
    ipcMain.handle('rewind:restore',  async (e, d) => this.rewind?.restore(d));
    ipcMain.handle('rewind:clear',    async (e, d) => this.rewind?.clear(d.agentId));

    // Providers
    ipcMain.handle('providers:list',  async ()    => this.providerHost?.list());

    // §SELECTOR-ASSIGN 0.39.251 — the element picker assigns a provider's
    // input/send/reply selector (handoff 2026-09-25 step 1). The renderer has
    // already checked the selector on the live page; src/providers/selector-assign.js
    // validates that evidence and records it through guardian's own route.
    // Both outcomes go on the bus, so a refusal is as visible as a success.
    ipcMain.handle('selectors:provider-for-url', async (e, d) => require('../providers/selector-assign').providerForUrl(d && d.url));
    ipcMain.handle('selectors:assign', async (e, d) => {
      const r = await require('../providers/selector-assign').assign(d || {});
      this.sse?.emit(r.ok ? 'selectors.assigned' : 'selectors.assign.failed', {
        provider: d && d.provider, key: d && d.key, selector: d && d.selector,
        url: d && d.evidence && d.evidence.url, error: r.error || null,
        changed: r.guardian ? r.guardian.changed : null, pushedToTabs: r.guardian ? r.guardian.pushedToTabs : null, ts: Date.now(),
      });
      return r;
    });

    // Userscripts
    ipcMain.handle('userscripts:list',   async (e, d) => this.userscripts?.list(d));
    ipcMain.handle('userscripts:inject', async (e, d) => this.userscripts?.inject(d.agentId, d.scriptId));
    ipcMain.handle('userscripts:toggle', async (e, d) => this.userscripts?.toggle(d.scriptId, d.enabled));
    ipcMain.handle('userscripts:create', async (e, d) => this.userscripts?.create(d));
    ipcMain.handle('userscripts:delete', async (e, d) => this.userscripts?.delete(d.scriptId));
    ipcMain.handle('userscripts:source', async (e, d) => this.userscripts?.getSource(d.scriptId));
    ipcMain.handle('userscripts:edit',   async (e, d) => this.userscripts?.edit(d.scriptId, d.updates));

    // §NEW 2026-08-24 — real per-site settings IPC surface. No panel UI
    // consumes this yet (this pass built the store + wired it into the
    // permissions plugin, which is the actual real consumer) — exposed
    // now so a future settings panel doesn't need new plumbing, just a
    // renderer.
    ipcMain.handle('site-settings:get',    async (e, d) => this.siteSettings?.get(d.url, d.key));
    ipcMain.handle('site-settings:getAll', async (e, d) => this.siteSettings?.getAllForOrigin(d.url));
    ipcMain.handle('site-settings:set',    async (e, d) => this.siteSettings?.set(d.url, d.key, d.value));
    ipcMain.handle('site-settings:deleteKey', async (e, d) => this.siteSettings?.deleteKey(d.url, d.key));
    ipcMain.handle('site-settings:clear',  async (e, d) => this.siteSettings?.clear(d.url));
    ipcMain.handle('site-settings:listOrigins', async () => this.siteSettings?.listOrigins());
    ipcMain.handle('site-settings:clearAll', async () => this.siteSettings?.clearAll());

    // §GAP CLOSED 2026-08-30 — real IPC handlers for the freshly-built
    // HistoryStore, the same real gap this session found (registry
    // promised a feature, zero implementing code existed anywhere).
    ipcMain.handle('history:list',   async (e, d) => this.history?.list(d || {}) || []);
    // §fix 2026-09-02 — James: "history works. though it doesn't seem to
    // work." Root cause: no channel existed for a page actually being
    // visited to WRITE a history entry in the first place. The only real
    // call to HistoryStore.record() anywhere (providers/host.js:315) is
    // scoped to the hidden NCP provider windows (claude/chatgpt/gemini/
    // perplexity) — the person's own main browsing tab never recorded a
    // single visit. list/delete/clear all worked correctly the whole
    // time; the store was just always empty for real browsing. Added
    // the missing write path; renderer's did-navigate handler (below,
    // browser.js) calls it.
    ipcMain.handle('history:record', async (e, d) => this.history?.record(d || {}) || { error: 'history unavailable' });
    ipcMain.handle('history:delete', async (e, d) => this.history?.delete(d.id) || { error: 'history unavailable' });
    ipcMain.handle('history:clear',  async (e, d) => this.history?.clear(d?.agentId) || { error: 'history unavailable' });

    // §NEW 2026-08-24 — real passwords management IPC surface for a
    // future panel (same real-but-not-yet-consumed pattern as site-
    // settings' IPC exposure). Deliberately list/delete only — save()
    // and get() (which decrypts) stay reachable via the bus only
    // (passwords.save/passwords.get gates), the same channel the
    // passwords plugin's own autofill/save-prompt flow already uses;
    // not adding a renderer-callable decrypt path beyond what's needed.
    ipcMain.handle('passwords:list',   async () => this.passwordVault?.list());
    ipcMain.handle('passwords:delete', async (e, d) => this.passwordVault?.delete(d.id));

    // §NEW 2026-08-24 — real downloads manager IPC surface.
    ipcMain.handle('downloads:list',           async (e, d) => this.downloads?.list(d || {}));
    ipcMain.handle('downloads:clearItem',      async (e, d) => this.downloads?.clearItem(d.id));
    ipcMain.handle('downloads:clearCompleted', async ()      => this.downloads?.clearCompleted());
    // §LIBRARY 0.39.241 — Library → Downloads opens a file by clicking its name, as
    // Firefox's Library does. Only a file the store recorded, and only once done.
    ipcMain.handle('downloads:openFile', async (e, d) => {
      const record = this.downloads?.list().find(i => i.id === d?.id);
      if (!record?.savePath) return { ok: false, error: 'no savePath for this item' };
      if (record.state !== 'completed') return { ok: false, error: `the download is ${record.state}, not completed` };
      const err = await require('electron').shell.openPath(record.savePath);
      return err ? { ok: false, error: err } : { ok: true };
    });
    ipcMain.handle('downloads:openFolder', async (e, d) => {
      const record = this.downloads?.list().find(i => i.id === d.id);
      if (!record?.savePath) return { ok: false, error: 'no savePath for this item' };
      require('electron').shell.showItemInFolder(record.savePath);
      return { ok: true };
    });

    // §2026-08-28 — real download-listener IPC surface.
    ipcMain.handle('downloads:listListeners',   async ()      => this.options?.listDownloadListeners() || []);
    ipcMain.handle('downloads:registerListener', async (e, d) => this.options?.registerDownloadListener(d));
    ipcMain.handle('downloads:updateListener',  async (e, d)  => this.options?.updateDownloadListener(d.id, d.updates));
    ipcMain.handle('downloads:removeListener',  async (e, d)  => this.options?.removeDownloadListener(d.id));

    // §2026-08-29 — real Callto Index IPC surface.
    ipcMain.handle('calltos:list',   async ()      => this.options?.listCalltos() || []);
    ipcMain.handle('calltos:forUrl', async (e, d)   => this.options?.findCalltosForUrl(d.url) || []);
    ipcMain.handle('calltos:remove', async (e, d)   => this.options?.removeCallto(d.id));

    // §NEW 2026-08-24 — real speech-to-text IPC surface.
    ipcMain.handle('speech:available', async () => this.speech?.isAvailable());
    ipcMain.handle('speech:transcribeBuffer', async (e, { buffer, ext = 'webm' } = {}) => {
      if (!this.speech) return { error: 'speech engine not available' };
      const path = require('path'); const fs = require('fs'); const os = require('os');
      const tmpPath = path.join(os.tmpdir(), `cg-mic-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
      try {
        fs.writeFileSync(tmpPath, Buffer.from(buffer));
        return await this.speech.transcribe(tmpPath);
      } catch (err) {
        return { error: err.message };
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    });

    // §BUILD 2026-08-29 — real macro IPC surface, giving Clear Glass's
    // UI its first real reach into lib/agent-tools/. Deliberately only
    // list/get/run exposed here — create/delete stay on the agent-tool
    // path for now (a real step-builder UI is a separate, larger piece,
    // named honestly rather than half-built as a bare JSON textarea).
    ipcMain.handle('macros:list', async () => {
      if (!this.macroTool) return { error: 'macro tool not available' };
      return this.macroTool.execute({ action: 'list' });
    });
    ipcMain.handle('macros:get', async (e, d) => {
      if (!this.macroTool) return { error: 'macro tool not available' };
      return this.macroTool.execute({ action: 'get', name: d.name });
    });
    ipcMain.handle('macros:run', async (e, d) => {
      if (!this.macroTool) return { error: 'macro tool not available' };
      return this.macroTool.execute({ action: 'run', name: d.name, agentId: d.agentId, params: d.params, skipSnapshot: d.skipSnapshot });
    });
    // §BUILT 2026-09-23 — the step builder the 2026-08-29 note above named as
    // "a separate, larger piece" rather than a bare JSON textarea. create/
    // delete go through macro.js's OWN validation (real browser_action enum,
    // erosmancer targetUuid rule, profile set) — the UI never re-implements it.
    ipcMain.handle('macros:create', async (e, d = {}) => {
      if (!this.macroTool) return { error: 'macro tool not available' };
      return this.macroTool.execute({ action: 'create', name: d.name, urlPattern: d.urlPattern, steps: d.steps, params: d.params, profile: d.profile || undefined, description: d.description });
    });
    ipcMain.handle('macros:delete', async (e, d = {}) => {
      if (!this.macroTool) return { error: 'macro tool not available' };
      return this.macroTool.execute({ action: 'delete', name: d.name });
    });
    // §BUILT 2026-09-26 — record a macro from a real tab: the driver's
    // recorder captures, src/macros/recording.js turns it into steps the
    // builder opens pre-filled (passwords become a {{password}} parameter).
    const _recStart = new Map(); // agentId → start url
    ipcMain.handle('macros:recordStart', async (e, { agentId } = {}) => {
      if (!this.driver) return { ok: false, error: 'driver not wired — recording unavailable' };
      if (!agentId) return { ok: false, error: 'agentId required' };
      try { const r = await this.driver.exec({ action: 'record.start', agentId }); _recStart.set(agentId, r.startUrl || null); return { ok: true, agentId, startUrl: r.startUrl || null }; }
      catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('macros:recordStop', async (e, { agentId } = {}) => {
      if (!this.driver) return { ok: false, error: 'driver not wired — recording unavailable' };
      try {
        const r = await this.driver.exec({ action: 'record.stop', agentId });
        const { recordingToSteps } = require('../macros/recording');
        const out = recordingToSteps(r.recording || [], { startUrl: _recStart.get(agentId) });
        _recStart.delete(agentId);
        return { ok: true, events: (r.recording || []).length, ...out };
      } catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('macros:schema', async () => {
      try {
        const ba = require('../../../lib/agent-tools/tools/browser/browser-action.js');
        return { ok: true, actions: ba.parameters.properties.action.enum, erosActions: ['click', 'type', 'hover', 'scroll', 'evaluate', 'navigate', 'screenshot'], profiles: ['precise', 'cautious', 'exploratory', 'turbo'] };
      } catch (err) { return { ok: false, error: err.message }; }
    });
    // Background tabs
    ipcMain.handle('bgtab:open',  async (e, d) => require('../main/index').openBackgroundTab(d));
    ipcMain.handle('bgtab:close', async (e, d) => require('../main/index').closeBackgroundTab(d.agentId));
    ipcMain.handle('bgtab:list',  async ()    => require('../main/index').listBackgroundTabs());
    ipcMain.handle('providers:start', async (e, d) => this.providerHost?.start(d.providerId, d));
    ipcMain.handle('providers:stop',  async (e, d) => this.providerHost?.stop(d.providerId));
    ipcMain.handle('providers:show',  async (e, d) => this.providerHost?.show(d.providerId));
    // §PHASE-2 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md item 3:
    // real, on-demand hot-push into an already-running provider tab, not
    // just the 60s auto-reload timer or a full start().
    ipcMain.handle('providers:deploy', async (e, d) => this.providerHost?.deploy(d.providerId));

    // Copilot extended
    // §BUG FIXED 2026-07-11 — same disease as context:switch above (see
    // that handler's fix comment for the full pattern): these fired
    // 'copilot.build'/'copilot.diagnose' on the LOCAL event bus, fire-and-
    // forget, no return value — but the real, working implementations are
    // this.copilot's own build()/diagnose() methods, which correctly
    // dispatch through Bridge (:9999) to the real copilot service. No gate
    // anywhere ever subscribed to the local event names these emitted, so
    // both actions silently did nothing for any caller that used the IPC
    // channel instead of calling this.copilot directly.
    ipcMain.handle('copilot:build',    async (e, d) => {
      if (!this.copilot) return { ok: false, error: 'copilot bridge not initialized' };
      try { return await this.copilot.build(d || {}); }
      catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('copilot:diagnose', async (e, d) => {
      if (!this.copilot) return { ok: false, error: 'copilot bridge not initialized' };
      try { return await this.copilot.diagnose(d || {}); }
      catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('url:listen',     async (e, d) => rendererEmit('url.listen', d));
    ipcMain.handle('mesh:spawn',     async (e, d) => rendererEmit('mesh.spawn', d));
    ipcMain.handle('mesh:route',     async (e, d) => rendererEmit('mesh.route', d));
    ipcMain.handle('mesh:enqueue',   async (e, d) => this.mesh?.enqueue(d));
    ipcMain.handle('mesh:list',      async ()    => ({
      agents:     this.mesh?.listAgents()   || [],
      registry:   this.mesh?.getRegistry()  || [],
      queueDepth: this.mesh?.getQueueDepth?.() || 0,
    }));
    ipcMain.handle('diag:run',       async (e, d) => rendererEmit('diag.run', d));
    ipcMain.handle('diag:nexus',     async (e, d) => rendererEmit('diag.nexus', d));
    ipcMain.handle('status',         async ()    => { rendererEmit('status.request', {}); return { ok: true }; });

    // Window controls — direct, not bus-routed, so they're instant (no
    // round-trip through SSE needed for the local renderer's own chrome).
    // Still mirrored onto the bus via emit() so Cortex/copilot see them too.
    ipcMain.handle('window:minimize', async (e, d) => { this.minimizeFn?.(d); emit('window.minimize', d); return { ok: true }; });
    ipcMain.handle('window:hide',     async (e, d) => { this.hideFn?.(d);     emit('window.hide', d);     return { ok: true }; });
    ipcMain.handle('window:open',     async (e, d) => { await this.openFn?.(d); emit('window.open', d); return { agentId: d?.agentId, opened: true }; });
    ipcMain.handle('window:maximize', async (e, d) => { this.maximizeFn?.(d); return { ok: true }; });
    ipcMain.handle('window:openSettings',  async () => { this.openSettingsFn?.();  return { ok: true }; });
    ipcMain.handle('window:closeSettings', async () => { this.closeSettingsFn?.(); return { ok: true }; });
    // §LIBRARY 0.39.241 — the Library window (renderer/library.html); area picks its section.
    ipcMain.handle('window:openLibrary',  async (e, d) => this.openLibraryFn ? this.openLibraryFn(d && d.area) : { ok: false, error: 'library window not wired' });
    ipcMain.handle('window:closeLibrary', async () => { this.closeLibraryFn?.(); return { ok: true }; });
    ipcMain.handle('window:list',  async ()    => require('../main/index').listOpenAgents());
    ipcMain.handle('window:focus', async (e, d) => require('../main/index').focusAgentWindow(d));

    // Nexus options
    ipcMain.handle('options:get',    async ()    => this.options?.get());
    ipcMain.handle('options:set',    async (e, d) => this.options?.set(d));

    // Toolbar command registry — §STRUCTURAL 2026-08-24. Backend-owned
    // (src/toolbar/commands.js); the renderer has no command list of its
    // own, it asks for this one. Read-only: the renderer can PIN/unpin via
    // options:set (pinnedToolbarButtons), it can't redefine what commands
    // exist.
    ipcMain.handle('toolbar:commands', async () => {
      const { TOOLBAR_COMMANDS } = require('../toolbar/commands');
      return TOOLBAR_COMMANDS;
    });

    // §NEW 2026-08-24 — plugins/host.js. A plugin's toolbar-command
    // contribution has no real DOM button (see browser.js's
    // activateSpotlightCommand fix, same date) — clicking it in the
    // command palette reaches here instead, which emits the plugin's own
    // registered signature onto the real bus. Fire-and-forget, matching
    // every other gate dispatch in this codebase (driver.exec, dom.query,
    // etc. all respond via a LATER event, not a synchronous IPC return) —
    // this handler's job is only to get the event onto the bus, not to
    // wait for or shape the plugin's own response.
    ipcMain.handle('plugins:invoke', async (e, { signature, data } = {}) => {
      if (typeof signature !== 'string') return { ok: false, error: 'signature is required' };
      try {
        const { getBus, Event } = require('../core/bus.js');
        getBus().emit(new Event(signature, data || {}));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    // §NEW 2026-09-25 — plugins:list / plugins:disable. James: "build all
    // the ui" (Firefox-reference gap pass, "Extensions and themes"). Real
    // gap found: src/plugins/host.js's list()/disable() have existed since
    // 2026-08-24 (checked directly — both real, working methods on the
    // already-installed pluginHost) but NOTHING ever exposed them past
    // plugins:invoke, which only fires a toolbar-command signature and
    // can't enumerate or disable anything. This wires the two read/write
    // methods that already exist — no new plugin-host behavior invented,
    // just the missing IPC surface for what was already real. Themes have
    // no backend anywhere in this codebase (grepped clear-glass/src and
    // clear-glass/renderer directly — zero matches beyond incidental
    // strings) so the settings section built on this is named "Plugins",
    // not "Extensions and themes" — never claims theme support that
    // doesn't exist.
    ipcMain.handle('plugins:list', async () => {
      try { return this.pluginHost?.list() || []; }
      catch (err) { return { ok: false, error: err.message }; }
    });
    // §BUILT 2026-09-26 — WebExtensions (Settings → Plugins → Add WebExtension).
    const _wx = () => { if (!this.webExtensions) throw new Error('WebExtension host not running'); return this.webExtensions; };
    const _wxWrap = (fn) => async (e, d = {}) => { try { return await fn(d, e); } catch (err) { return { ok: false, error: err.message }; } };
    ipcMain.handle('webext:list', _wxWrap(() => ({ ok: true, extensions: _wx().list(), folder: require('path').join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'extensions') })));
    ipcMain.handle('webext:install', _wxWrap((d) => _wx().install({ source: d.source, allowFileAccess: !!d.allowFileAccess })));
    ipcMain.handle('webext:setEnabled', _wxWrap((d) => _wx().setEnabled(d.id, !!d.enabled)));
    ipcMain.handle('webext:remove', _wxWrap((d) => _wx().remove(d.id)));
    ipcMain.handle('webext:pick', _wxWrap(async (d, e) => {
      const { dialog, BrowserWindow } = require('electron');
      const win = BrowserWindow.fromWebContents(e.sender);
      const folder = d.kind === 'folder';
      const r = await dialog.showOpenDialog(win, folder
        ? { title: 'Choose an unpacked extension folder (the one with manifest.json)', properties: ['openDirectory'] }
        : { title: 'Choose a packed extension', properties: ['openFile'], filters: [{ name: 'Chrome extension', extensions: ['crx', 'zip'] }] });
      return r.canceled || !r.filePaths.length ? { ok: true, canceled: true } : { ok: true, path: r.filePaths[0] };
    }));
    ipcMain.handle('plugins:disable', async (e, { id } = {}) => {
      if (typeof id !== 'string') return { ok: false, error: 'id is required' };
      try { this.pluginHost?.disable(id); return { ok: true }; }
      catch (err) { return { ok: false, error: err.message }; }
    });

    // Accounts — §PHASE-3 2026-08-23, real CRUD surface, backend only
    // (per James's own "all backend first, ui after backend is done" —
    // no renderer panel wired to these yet, that's item 6's UI half).
    ipcMain.handle('accounts:list',       async ()    => this.options?.listAccounts());
    ipcMain.handle('accounts:get',        async (e, d) => this.options?.getAccount(d.id));
    ipcMain.handle('accounts:create',     async (e, d) => this.options?.createAccount(d));
    ipcMain.handle('accounts:update',     async (e, d) => this.options?.updateAccount(d.id, d.updates));
    ipcMain.handle('accounts:delete',     async (e, d) => this.options?.deleteAccount(d.id));
    ipcMain.handle('accounts:linkAgent',  async (e, d) => this.options?.linkAgent(d.id, d.agentKey));
    ipcMain.handle('accounts:unlinkAgent',async (e, d) => this.options?.unlinkAgent(d.id, d.agentKey));
    // §BUILT 2026-09-19 — James: "account manager with account ids for
    // providers," then "library ui." Real backend (options/store.js)
    // and Guardian-facing gates existed; this real IPC surface — what
    // the actual renderer UI calls through, checked directly against
    // this file's own established accounts: pattern above — did not.
    // Found while preparing to build the Library UI: building it
    // against a channel with no handlers would have been building on
    // a void.
    ipcMain.handle('accounts:linkProvider',   async (e, d) => this.options?.linkProviderAccount(d.id, d.provider, { accountId: d.accountId, email: d.email, displayName: d.displayName }));
    ipcMain.handle('accounts:unlinkProvider', async (e, d) => this.options?.unlinkProviderAccount(d.id, d.provider));
    ipcMain.handle('accounts:verifyProvider', async (e, d) => this.options?.verifyProviderAccount(d.id, d.provider));
    ipcMain.handle('accounts:getProvider',    async (e, d) => this.options?.getProviderAccount(d.id, d.provider));
    ipcMain.handle('accounts:findByProvider', async (e, d) => this.options?.findAccountByProviderAccountId(d.provider, d.accountId));

    // §BUILT 2026-09-23 — James: "yes clearglass" + "login portals ... hook
    // into the cookie vault, and create a accountid per account." Clear
    // Glass is the one account authority: per-provider default here, the
    // sign-in portal in src/accounts/login-portal.js. Every portal handler
    // returns {ok:false,error} rather than throwing across IPC (§1.2 — the
    // Settings page shows the real reason).
    const portal = (fn) => async (e, d = {}) => {
      if (!this.loginPortal) return { ok: false, error: 'login portal not initialized' };
      try { return await fn(d); } catch (err) { return { ok: false, error: err.message, code: err.code || null }; }
    };
    ipcMain.handle('accounts:setDefault',  async (e, d) => this.options?.setDefaultAccount(d.agentKey, d.id ?? null));
    ipcMain.handle('accounts:defaults',    async ()     => ({ ...(this.options?.get().accountDefaults || {}) }));
    ipcMain.handle('accounts:resolve',     async (e, d) => this.options?.resolveAccountForDispatch(d.agentKey, d.id || null));
    ipcMain.handle('accounts:portal:providers',   portal(async ()  => this.loginPortal.providers()));
    ipcMain.handle('accounts:portal:open',        portal(async (d) => this.loginPortal.open(d)));
    ipcMain.handle('accounts:portal:capture',     portal(async (d) => this.loginPortal.capture(d)));
    ipcMain.handle('accounts:portal:status',      portal(async (d) => this.loginPortal.status(d)));
    ipcMain.handle('accounts:portal:close',       portal(async (d) => this.loginPortal.close(d)));
    ipcMain.handle('accounts:portal:signOut',     portal(async (d) => this.loginPortal.signOut(d)));
    ipcMain.handle('accounts:portal:credentials', portal(async (d) => this.loginPortal.saveCredentials(d)));
    ipcMain.handle('accounts:portal:list',        portal(async ()  => this.loginPortal.list()));
    ipcMain.handle('vault:status', async () => ({
      cookies:   this.vault?.keyStatus ? this.vault.keyStatus() : { source: 'unknown' },
      passwords: this.passwordVault?.keyStatus ? this.passwordVault.keyStatus() : { source: 'unknown' },
    }));

    // Autofill — §BUILT 2026-09-19, real IPC surface for the UI. Same
    // real logic as gates/index.js's autofillDetectGate/autofillFillGate
    // (matchFields + dom.handleQuery/handleMutate) — this is a genuinely
    // separate real channel from the Guardian/SSE gate path (checked
    // directly: this file's own accounts:/site-settings: handlers prove
    // the UI has never gone through gates/index.js at all), not a
    // duplicate route to the same one.
    ipcMain.handle('autofill:profile:list',   async ()     => this.autofillStore?.listProfiles());
    ipcMain.handle('autofill:profile:get',    async (e, d) => this.autofillStore?.getProfile(d.id));
    ipcMain.handle('autofill:profile:create', async (e, d) => this.autofillStore?.createProfile(d));
    ipcMain.handle('autofill:profile:update', async (e, d) => this.autofillStore?.updateProfile(d.id, d.updates));
    ipcMain.handle('autofill:profile:delete', async (e, d) => this.autofillStore?.deleteProfile(d.id));
    ipcMain.handle('autofill:detect', async (e, { agentId = 'default', profileId } = {}) => {
      if (!this.dom || !this.autofillStore) return { error: 'autofill unavailable' };
      return _autofillDetect(this.dom, this.autofillStore, { agentId, profileId });
    });
    ipcMain.handle('autofill:fill', async (e, { agentId = 'default', profileId, minConfidence = 'medium', vars } = {}) => {
      if (!this.dom || !this.autofillStore) return { error: 'autofill unavailable' };
      return _autofillFill(this.dom, this.autofillStore, { agentId, profileId, minConfidence, vars });
    });

    // §0.39.265 — James: "expand the job application autofill … maybe add fiverr
    // and upwork support?" Draft a proposal / cover letter for one job post from
    // a profile (src/autofill/proposal.js), through the same co-pilot the
    // on-screen answers use. A draft only — shown to the person, never sent.
    ipcMain.handle('autofill:proposal', async (e, { profileId, jobPost, platform, length, tone, extra, agentId = 'default' } = {}) => {
      if (!this.autofillStore) return { ok: false, error: 'autofill unavailable' };
      if (!this.copilot) return { ok: false, error: 'co-pilot is not connected' };
      const profile = this.autofillStore.getProfile(profileId);
      if (!profile) return { ok: false, error: `no autofill profile "${profileId}"` };
      const { buildProposalPrompt } = require('../autofill/proposal.js');
      const b = buildProposalPrompt({ profile, jobPost, platform, length, tone, extra });
      if (b.error) return { ok: false, error: b.error };
      try {
        const r = await this.copilot.send({ message: b.prompt, agentId });
        const text = String((r && (r.text || r.reply || r.message)) || '').trim();
        return text ? { ok: true, text } : { ok: false, error: 'co-pilot returned no text' };
      } catch (err) { return { ok: false, error: err.message }; }
    });
    // The text of a tab's page (the job post), for the proposal drafter.
    ipcMain.handle('autofill:readPage', async (e, { agentId = 'default' } = {}) => {
      if (!this.driver) return { ok: false, error: 'driver unavailable' };
      try {
        const [t, u] = await Promise.all([
          this.driver.exec({ action: 'eval', agentId, code: '(document.querySelector("main,[role=main],article") || document.body).innerText.slice(0, 12000)' }),
          this.driver.exec({ action: 'getUrl', agentId }).catch(() => ({})),
        ]);
        return { ok: true, text: String((t && t.result) || ''), url: (u && u.url) || null };
      } catch (err) { return { ok: false, error: err.message }; }
    });

    // §BUILT 2026-09-21 — screen-qa's UI layer (hotkey, right-click menu,
    // element picker) all runs inside the main renderer, which HAS real
    // IPC access — unlike ui/library's standalone page, which is why
    // this reaches the same real detector.js functions via IPC here
    // rather than the /cli/screen-qa/* REST doors those still exist for.
    // One implementation (clear-glass/src/screen-qa/detector.js), two
    // real doors, same as autofill's own IPC + REST split above.
    ipcMain.handle('screen-qa:detect', async (e, { agentId = 'default', profileId = null } = {}) => {
      if (!this.dom) return { error: 'dom bridge unavailable' };
      return _screenQaDetect(this.dom, this.autofillStore, { agentId, profileId });
    });
    // Right-click's own real target: which field is at this window-
    // relative point (the coordinates the §FIX in renderer/browser.js's
    // context-menu handler already converts to window-relative). Direct
    // and awaited, not the fire-and-forget dom:query/rendererEmit(SSE)
    // path elsewhere in this file — same shape as every other real
    // screen-qa/autofill handler here, deliberately, not an accident.
    ipcMain.handle('screen-qa:element-at', async (e, { agentId = 'default', x, y } = {}) => {
      if (!this.dom) return { error: 'dom bridge unavailable' };
      return this.dom.handleQuery({ agentId, x, y });
    });
    // The right-click path's own question derivation — the SAME real
    // deriveQuestion() detectOpenQuestions uses for a whole-page scan,
    // called here for exactly one already-picked field (from
    // screen-qa:element-at above) rather than reimplemented for a
    // single-field case.
    ipcMain.handle('screen-qa:derive-question', async (e, { fieldMeta } = {}) => {
      if (!fieldMeta) return null;
      return _screenQaDeriveQuestion(fieldMeta);
    });
    ipcMain.handle('screen-qa:answer', async (e, { question, context, agentId = 'default' } = {}) => {
      if (!this.copilot) return { ok: false, error: 'copilot bridge not initialized' };
      const send = async (message) => {
        const r = await this.copilot.send({ message, agentId });
        return (r && (r.text || r.reply || r.message)) || '';
      };
      const result = await _screenQaAnswer({ question, context }, send);
      // §BUILT 2026-09-21 — James: "a toast isolated from clearglass
      // process." Fired from the MAIN process (Electron's own Notification,
      // a real OS notification, not an in-page toast()) rather than as a
      // step the renderer has to reach — the slow part (this.copilot.send
      // above) already ran here in main, so this fires regardless of
      // whether the renderer or webview is still responsive by the time
      // it would otherwise show a result. Never claims success dishonestly:
      // an error also notifies, with the real reason, not silence.
      if (Notification.isSupported()) {
        try {
          new Notification({
            title: result.ok ? 'Clear Glass — answer ready' : 'Clear Glass — answer failed',
            body: result.ok ? String(result.answer).slice(0, 200) : String(result.error).slice(0, 200),
          }).show();
        } catch (_) { /* notification failing is never allowed to fail the real answer */ }
      }
      return result;
    });
    ipcMain.handle('screen-qa:inject', async (e, { agentId = 'default', cgId, text } = {}) => {
      if (!this.dom) return { error: 'dom bridge unavailable' };
      return _screenQaInject(this.dom, { agentId, cgId, text });
    });

    // §TX16 2026-08-28 — real, persistent listener config. Same pattern as
    // accounts above (this.options owns the real CRUD; bridge.js exposes
    // it). The renderer's guardian-picker.js is the real caller once its
    // listener-modal save path is wired to this instead of only setting
    // activeListeners.set(...) in memory — that wiring is TX16's own next
    // slice, named honestly as not done in this pass.
    // §0.39.265 — each listener comes back with its decay state (strength, fadesAt, removeAt).
    ipcMain.handle('listeners:list',       async ()    => {
      if (!this.options) return [];
      this.options.decayListeners();
      return this.options.listListeners().map(l => ({ ...l, decay: this.options.listenerStrength(l) }));
    });
    ipcMain.handle('listeners:decay:get',  async ()    => this.options?.getListenerDecay());
    ipcMain.handle('listeners:decay:set',  async (e, d) => this.options?.setListenerDecay(d || {}));
    ipcMain.handle('listeners:decay:run',  async ()    => this.options?.decayListeners());

    // §0.39.265 — keyboard shortcuts (src/shortcuts/registry.js; caught in main, see main/index.js)
    ipcMain.handle('shortcuts:list',   async () => ({ ...(this.options?.getShortcuts() || { bindings: {}, overrides: {} }), actions: require('../shortcuts/registry').ACTIONS, defaults: require('../shortcuts/registry').DEFAULT_BINDINGS }));
    ipcMain.handle('shortcuts:set',    async (e, d) => this.options?.setShortcut(d.accel, d.action));
    ipcMain.handle('shortcuts:remove', async (e, d) => this.options?.removeShortcut(d.accel));
    ipcMain.handle('shortcuts:reset',  async () => this.options?.resetShortcuts());
    ipcMain.handle('listeners:get',        async (e, d) => this.options?.getListener(d.id));
    ipcMain.handle('listeners:register',   async (e, d) => this.options?.registerListener(d));
    ipcMain.handle('listeners:update',     async (e, d) => this.options?.updateListener(d.id, d.updates));
    ipcMain.handle('listeners:remove',     async (e, d) => this.options?.removeListener(d.id));
    ipcMain.handle('listeners:forUrl',     async (e, d) => this.options?.findListenersForUrl(d.url));

    // §FIXED 2026-09-02 — James, live, from a real boot log: "Attempted
    // to register a second handler for 'agents:list'" (an unhandled
    // rejection at boot) and "agent mesh doesn't do anything either when
    // i click on it." Real root cause, found together, not two separate
    // bugs: AM8's own new agents:list handler (added this session)
    // collided with THIS pre-existing one below — this.mesh?.getRegistry(),
    // the real, live agent-mesh registry (claude/chatgpt/gemini/
    // perplexity/mistral/grok, confirmed in James's own boot log:
    // "[AgentMesh] Registry: ..."). Electron's ipcMain.handle() throws
    // on a duplicate channel registration — whichever handler registered
    // second either silently failed or the whole main-process init took
    // an unhandled rejection, either of which would leave the real,
    // pre-existing Agent Mesh UI inert. Renamed AM8's own, genuinely
    // different concept (custom, user-paired input/output agents) to
    // custom-agents:* so it no longer shadows the real mesh registry.
    ipcMain.handle('custom-agents:list',     async ()    => this.options?.listAgents() || []);
    ipcMain.handle('custom-agents:get',      async (e, d) => this.options?.getAgent(d.id));
    ipcMain.handle('custom-agents:register', async (e, d) => this.options?.registerAgent(d));

    // §ACCOUNTS-UI 2026-08-28 — the accounts panel needs a real list of
    // which agents can actually be linked. agent-mesh.js already has this
    // exact list (getRegistry(), AGENT_REGISTRY — real DOM selectors,
    // real colors, the actual agents this process can spawn a tab for),
    // confirmed directly rather than hardcoding a second list here that
    // could silently drift from the real one.
    ipcMain.handle('agents:list', async () => this.mesh?.getRegistry() || []);

    // DOM events from page scripts
    // §BUILD 2026-08-23 — the real, faithful Guardian picker port
    // (clear-glass/renderer/guardian-picker.js) sends real, typed
    // events through this same, already-real dom:event channel rather
    // than needing its own new IPC surface. Real, dedicated SSE names
    // so they're distinguishable from generic DOM mutations, not
    // collapsed into one label. §HONEST LIMIT — this is real, live
    // event routing only; on-disk persistence for calltos (matching
    // UserscriptManager's own real on-disk convention) is a genuinely
    // separate, not-yet-built piece, not silently assumed done here.
    // §BUILD 2026-08-23 — real, small in-memory registry: only the
    // 'guardian.listener.start' message carries the full config
    // (including linkTarget) — every later 'guardian.listener.event'
    // for the same listenerId only carries the observed data, so this
    // is genuinely needed to know where to route each one, not
    // optional bookkeeping.
    this._guardianListenerTargets = this._guardianListenerTargets || new Map();

    ipcMain.on('dom:event', (e, d) => {
      if (d && typeof d.type === 'string' && d.type.startsWith('plugin:')) {
        // §NEW 2026-08-24 — generic forwarding for ANY plugin's in-page
        // script, not a passwords-specific special case. A plugin's
        // signatures are already namespaced plugin:<id>:... (schema.js
        // enforces this), so forwarding by that exact prefix onto the
        // real bus reaches whatever Gate is registered for it — the
        // SAME dispatch mechanism plugins:invoke already uses for
        // renderer-initiated calls, now also reachable from inside a
        // page. Built for the passwords form-detector, but any future
        // plugin's userscript gets this for free.
        emit(d.type, d);
        return;
      }
      if (d && typeof d.type === 'string' && d.type.startsWith('guardian.')) {
        emit(d.type, d);
        if (d.type === 'guardian.listener.start' && d.listenerId && d.config?.linkTarget) {
          this._guardianListenerTargets.set(d.listenerId, d.config.linkTarget);
          // §BUGFIX 2026-08-28 — James, live: "it needs to actually be
          // linked into guardian." This Map above is real but in-memory
          // only — exactly the §HONEST LIMIT this file already named
          // above ("on-disk persistence... is a genuinely separate,
          // not-yet-built piece"). The real, persistent registry already
          // exists (options/store.js's registerListener, built earlier
          // this session) — this was the one real call missing to close
          // that gap. e.sender.getURL() is the REAL current page URL at
          // the moment this listener was created, not a guess or a
          // placeholder — converted to an origin-wide pattern since a
          // listener on one page of a site should survive navigating to
          // another page of the same site, matching the same real glob
          // semantics findListenersForUrl already uses.
          try {
            const pageUrl = e.sender?.getURL?.();
            const urlPattern = pageUrl ? new URL(pageUrl).origin + '/*' : null;
            if (urlPattern && this.options) {
              this.options.registerListener({
                urlPattern,
                pageListenerId: d.listenerId,
                fingerprint: { selector: d.config.selector, xpath: d.config.xpath },
                eventType: d.config.mode,
                label: d.config.label,
                matchCriteria: d.config.matchCriteria,
                linkTarget: d.config.linkTarget,
              });
            }
          } catch (err) {
            console.warn(`[ipc/bridge] guardian.listener.start persist failed (live routing above is unaffected): ${err.message}`);
          }
        } else if (d.type === 'guardian.listener.event' && d.listenerId) {
          this._routeGuardianListenerEvent(d.listenerId, d.eventData);
          // §0.39.265 — firing keeps a listener alive (listener decay)
          try { this.options?.touchListener(d.listenerId, 'fired'); } catch (_) {}
        } else if (d.type === 'guardian.callto.added' && d.callto?.id) {
          // §2026-08-29 — James: "a tool that links guardian directly to
          // dom elements." Real gap closed: guardian-picker.js's "ADD TO
          // INDEX" button already sent this exact message with a
          // complete, real callto shape — the only real path that ever
          // worked was URCK.ingest()/registerCallto(), and URCK is never
          // loaded into this webview (confirmed directly, zero
          // references under clear-glass/). The real emit(d.type, d)
          // above already broadcasts this for any live listener, but
          // nothing wrote it anywhere — this is that missing write.
          try {
            const result = this.options?.registerCallto(d.callto);
            if (result?.error) console.warn(`[ipc/bridge] registerCallto rejected: ${result.error}`);
          } catch (err) {
            console.warn(`[ipc/bridge] guardian.callto.added persist failed (live broadcast above is unaffected): ${err.message}`);
          }
        } else if (d.type === 'guardian.cookies.capture' && d.cookies !== undefined) {
          // §FOUND & FIXED 2026-09-08 — James: "make sure the guardian
          // plugin / element picker is wired in fully and works end to
          // end." Real, confirmed gap: guardian-picker.js's
          // captureCookies() showed a real, successful "🍪 cookies
          // captured" toast, but this event had zero real handler
          // anywhere — silently, completely lost, while the UI claimed
          // success. §1.2 — that's the worse failure mode this
          // principle names directly.
          //
          // §HONEST LIMIT — cookies are genuinely sensitive session
          // data. This does NOT add real, secure, encrypted storage
          // (that's real, separate, careful work this session's
          // remaining budget shouldn't rush into) — it only makes the
          // real event traceable (a real, specific log line) instead of
          // utterly silent. A real secure-storage pass, matching the
          // established this.options.registerXxx() pattern the sibling
          // callto.added/listener.start branches above use, is still a
          // genuinely open, separate task — no matching real method
          // exists on this.options yet to call.
          console.log(`[ipc/bridge] guardian.cookies.capture received (url=${d.url || 'unknown'}, ${(d.cookies || '').split(';').filter(Boolean).length} cookies) — logged, not yet persisted (real secure storage not built)`);
        } else if (d.type === 'guardian.agent.create' && d.agentName && d.input && d.output) {
          // §BUILT 2026-09-02 — AM8, James: "the guardian plugin maps to
          // adding a new agent to the mesh." guardian-picker.js's own
          // real two-step pairing (commitListener()'s new-agent branch)
          // sends this exact shape once both the input and output
          // elements have been picked and paired. Real emit(d.type, d)
          // above already broadcasts it live; this is the real write —
          // same pattern as guardian.callto.added right above.
          try {
            const result = this.options?.registerAgent({ agentName: d.agentName, origin: d.origin, url: d.url, input: d.input, output: d.output });
            if (result?.error) console.warn(`[ipc/bridge] registerAgent rejected: ${result.error}`);
            else console.log(`[ipc/bridge] agent "${d.agentName}" registered — input+output pair persisted (id ${result.id})`);
          } catch (err) {
            console.warn(`[ipc/bridge] guardian.agent.create persist failed (live broadcast above is unaffected): ${err.message}`);
          }
        } else if (d.type === 'guardian.killswitch') {
          // §CORRECTED 2026-08-24 — James caught this directly ("as
          // plugins right?"): the first version of this handler
          // name-matched userscripts starting with 'Guardian — ' right
          // here in core bridge.js — hardcoding one specific plugin's
          // naming convention into core code, not a genuine
          // plugin-system capability. Fixed: delegates to the plugin
          // host's own tracked records (src/plugins/host.js's
          // disableAllUserscripts()) instead. bridge.js no longer knows
          // or cares what any plugin is named.
          this.pluginHost?.disableAllUserscripts(d.reason || 'killswitch');
        }
        return;
      }
      emit('dom.mutations', d);
    });
    // §ADDED 2026-09-02 — James: "check clear-glass for an ipc" (for
    // cookie-vault reachability from inside a page-level userscript,
    // which has no Node access at all — checked directly, this is why
    // webview-bridge.js's own contextBridge relay exists in the first
    // place). Real, complete round-trip: a request comes in here (via
    // browser.js's own relay of webview-bridge.js's allowlisted
    // 'nexus:cookie-request' channel), gets answered using the SAME
    // real _countCookies() logic the existing cookies:count IPC handler
    // already uses (not a second implementation), and the response is
    // delivered back into the SAME webview that asked — e.sender is
    // that webview's own real WebContents, no providerId lookup needed
    // (unlike injectAnswer(), which has to look one up by id since it's
    // called from elsewhere, not from an event this specific webview
    // just sent). Same real host-side delivery mechanism injectAnswer()
    // already uses (executeJavaScript calling a real, page-exposed
    // function) — one real pattern, two real real callers, not two
    // patterns that could drift.
    ipcMain.on('nexus:cookie-request', async (e, d) => {
      const requestId = d?.requestId || null;
      let result;
      if (d?.op === 'count') {
        result = await _countCookies({ url: d.url, agentId: d.agentId });
      } else {
        result = { ok: false, error: `unknown cookie op "${d?.op}" — only "count" is real today; save/restore need the same real round-trip built for them separately` };
      }
      try {
        await e.sender.executeJavaScript(
          `(typeof window.__nexusCookieResponse === 'function') ? window.__nexusCookieResponse(${JSON.stringify(requestId)}, ${JSON.stringify(result)}) : undefined`
        );
      } catch (err) {
        console.warn(`[ipc/bridge] nexus:cookie-request response delivery failed (non-fatal): ${err.message}`);
      }
    });

    ipcMain.on('dom:pick-result', (e, d) => {
      // Always reaches SSE via the bus, regardless of routeTo — the
      // in-process event stream isn't a "channel" the picker opts into,
      // it's the substrate everything else in Clear Glass already relies
      // on. routeTo:'api' is additive, not exclusive.
      emit('dom.pick.registered', d);

      if (d?.routeTo === 'api' && d?.apiUrl) {
        this._postToApiChannel(d.apiUrl, d).catch(err => {
          emit('dom.pick.route.error', { apiUrl: d.apiUrl, error: err.message, ts: Date.now() });
        });
      }
    });
  }

  // §BUILD 2026-07-09 — "route to API channel": POST the picked element
  // (or a DOM stream batch, same shape) to a caller-configured URL. Runs
  // from main process, not the renderer — keeps the target URL out of
  // the untrusted webview guest's reach and avoids CSP complications.
  // §FOUND & FIXED 2026-09-08 — James: "loading questions into the sse
  // into where ever picked. then i have copilot read and answer them."
  // Real, confirmed gap: the copilot-cli link target already sent the
  // real question to copilot's real /api/prompt successfully — but this
  // shared helper's own real, original design ("res.resume() — we
  // don't need the response body") discarded every real answer for
  // every caller, by design. Added a real, opt-in captureBody param
  // rather than changing the default for existing callers that
  // correctly never needed the body.
  async _postToApiChannel(url, payload, captureBody = false) {
    const parsed = new (require('url').URL)(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Refusing non-http(s) API channel: ${parsed.protocol}`);
    }
    const lib = parsed.protocol === 'https:' ? require('https') : require('http');
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = lib.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, res => {
        if (!captureBody) {
          res.resume(); // drain, this caller doesn't need the response body
          if (res.statusCode >= 400) reject(new Error(`API channel returned ${res.statusCode}`));
          else resolve({ status: res.statusCode });
          return;
        }
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          if (res.statusCode >= 400) { reject(new Error(`API channel returned ${res.statusCode}: ${raw.slice(0, 300)}`)); return; }
          let parsedBody = null;
          try { parsedBody = JSON.parse(raw); } catch (_) { /* real, non-JSON response — resolved with the raw text below instead */ }
          resolve({ status: res.statusCode, body: parsedBody, raw });
        });
      });
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('API channel timeout')); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // §FIX 2026-08-29 — real, dedicated GET, not a reuse of
  // _postToApiChannel above (POST-only, drains and discards the response
  // body by design — the exact opposite of what's needed here, which is
  // the response body itself). Fails soft, matching every other cross-
  // process call this session added: copilot being unreachable degrades
  // this endpoint's real "current" field to null, never throws and
  // blocks the rest of /agent-suite's real, already-working local data.
  _getCopilotCurrentAgent() {
    return new Promise((resolve) => {
      const req = require('http').get(
        `http://127.0.0.1:${process.env.COPILOT_PORT || 3750}/api/agent/current`,
        { timeout: 2000 },
        (res) => {
          let body = '';
          res.on('data', (d) => { body += d; });
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  // §BUILD 2026-08-23 — James: "listener uuid, logs to cortex listeners
  // index... we can use elements as callable ids... high leverage...
  // tool for setting up a new agent to the agent mesh." Real, first
  // step toward that: each configured listener's chosen destination
  // actually gets used, not just captured in the UI. Reuses real,
  // already-proven mechanisms — this.postEvent (fixed above) for
  // ledger/compartment, the existing _postToApiChannel() for ollama —
  // not new ones invented per destination.
  _routeGuardianListenerEvent(listenerId, eventData) {
    const target = this._guardianListenerTargets.get(listenerId);
    if (!target) return; // no start message seen yet, or default routing already covered by the real SSE emit above
    this._routeToLinkTarget(target, { listenerId, ...eventData }, 'listenerId');
  }

  // §2026-08-28 — James: "a download listener for artifacts." Shared,
  // single real dispatch table for every linkTarget type — extracted
  // from _routeGuardianListenerEvent (which now just resolves its own
  // target and calls this) rather than duplicated, so a download
  // listener and a DOM listener route through the exact same real
  // ledger/intelligence/compartment/sse-system/copilot-cli/copilot-panel/
  // ollama-stream logic instead of two copies that could silently drift.
  _routeToLinkTarget(target, eventData, idField) {
    const id = eventData[idField];
    if (target.type === 'ledger') {
      this.postEvent('guardian.listener.match', eventData);
    } else if (target.type === 'intelligence') {
      // §2026-08-28 — same real transport as 'ledger' (cortex's real
      // /api/event, confirmed directly), distinct event type so
      // intelligence's pattern-scan (which reads this exact table) can
      // tell a deliberately-tagged observation from an ordinary write.
      this.postEvent('guardian.listener.intelligence-observation', eventData);
    } else if (target.type === 'compartment') {
      this.postEvent('guardian.listener.match', { ...eventData, compartment: target.system, intent: target.intent || null });
    } else if (target.type === 'sse-system') {
      this.sse.emit(`system.${target.system}.guardian-event`, eventData);
    } else if (target.type === 'copilot-cli') {
      // Real path, confirmed directly: copilot/server.js's POST /api/prompt
      // (port 3750) — its own _lifeline.route() call already accepts an
      // 'intent' field, but the endpoint itself hardcoded intent:'ask'
      // regardless of caller input until this pass (see copilot/server.js
      // §2026-08-28 for the matching backend change).
      this._postToApiChannel(`http://127.0.0.1:${process.env.COPILOT_PORT || 3750}/api/prompt`,
        { prompt: eventData?.text || eventData?.value || eventData?.filename || '', intent: target.intent || 'ask', [idField]: id },
        true // §FOUND & FIXED 2026-09-08 — the real answer was being fetched then discarded (see _postToApiChannel's own real fix comment). Now captured and routed back.
      ).then(res => {
        const answer = res.body?.text || res.body?.response || res.raw || '';
        this.sse.emit('guardian.listener.copilot-answer', { [idField]: id, answer, ts: Date.now() });
      }).catch(err => this.sse.emit('guardian.listener.route.error', { [idField]: id, target: 'copilot-cli', error: err.message }));
    } else if (target.type === 'copilot-panel') {
      // Fully local — no HTTP call, no external system. browser.js's own
      // co-pilot panel already listens on the real SSE stream this file
      // emits through; this just gives it a distinct, real event name to
      // render as a chat message instead of routing anywhere external.
      this.sse.emit('guardian.listener.copilot-panel', eventData);
    } else if (target.type === 'ollama-stream') {
      this._postToApiChannel(`http://127.0.0.1:${process.env.OLLAMA_BRIDGE_PORT || 3749}/api/generate`,
        { prompt: eventData?.text || eventData?.value || eventData?.filename || '', [idField]: id, stream: false },
        true // §FOUND & FIXED 2026-09-08 — same real fix as copilot-cli above
      ).then(res => {
        const answer = res.body?.response || res.body?.text || res.raw || '';
        this.sse.emit('guardian.listener.ollama-answer', { [idField]: id, answer, ts: Date.now() });
      }).catch(err => this.sse.emit('guardian.listener.route.error', { [idField]: id, target: 'ollama-stream', error: err.message }));
    } else if (target.type === 'direct-file-write') {
      // §2026-08-28 — James: "clearglass listens for the codeblocks...
      // reads the location in the file and moves it to the directory to
      // replace it like you do. Maybe a hat that doesn't use
      // compartments." Real, deliberately lightweight lane: no
      // compartment, no contract, no RAID round trip — a direct write,
      // same shape as this session's own create_file/str_replace tool
      // calls. Uses the SAME real convention every file built this
      // session already follows (a real path comment on line 1/2) —
      // not an invented protocol.
      const result = this._writeCodeBlockToFile(eventData?.text || eventData?.value || '');
      this.sse.emit('guardian.listener.direct-file-write', { [idField]: id, ...result });
    }
    // §HONEST LIMIT — no linkTarget selected (null) falls through to
    // whatever real IR-Layer-default routing already applies elsewhere
    // (the unconditional emit(d.type, d) above); nothing silently dropped
    // and nothing here fabricates a destination for the unset case.
  }

  // §2026-08-28 — real, deliberately lightweight code-block-to-file write.
  // James: "reads the location in the file and moves it to the directory
  // to replace it like you do." Same convention every real file built
  // this session already follows: a path comment on line 1 or 2, either
  // '// path/to/file.js' or the first content line inside a '/** ... */'
  // block. Not an invented protocol — formalizing what was already true.
  //
  // §SAFETY — this writes to real disk based on text parsed out of a
  // chat page. A resolved path that escapes the real NEXUS root (via
  // '../' traversal, an absolute path, or a symlink pointing outside it)
  // is refused outright, not sanitized-and-allowed. A feature this
  // direct fails closed on anything ambiguous, not open.
  _writeCodeBlockToFile(rawText) {
    const path = require('path'); const fs = require('fs');
    if (!rawText || typeof rawText !== 'string') return { ok: false, error: 'no text to extract a code block from' };

    // Real markdown-fenced code block, any language tag.
    const fenceMatch = rawText.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
    const body = fenceMatch ? fenceMatch[1] : rawText;
    const lines = body.split('\n');

    // Path comment on line 1 ('// path' or '# path'), OR the first real
    // content line inside a '/** ... */' block (line 1 is the opener).
    let pathLine = lines[0] || '';
    if (/^\s*\/\*\*?\s*$/.test(pathLine) && lines[1]) pathLine = lines[1];
    const pathMatch = pathLine.match(/(?:\/\/|#|\*)\s*([a-zA-Z0-9_.\-\/]+\.[a-zA-Z0-9]+)\b/);
    if (!pathMatch) return { ok: false, error: 'no real file path comment found on the first line(s) of the code block' };

    const relPath = pathMatch[1];
    const root = path.resolve(__dirname, '..', '..', '..'); // clear-glass/src/ipc -> repo root
    const resolved = path.resolve(root, relPath);
    // §SAFETY — the real, hard guard: resolved path must stay under root.
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      return { ok: false, error: `refused: resolved path "${resolved}" escapes the real NEXUS root — no write attempted` };
    }

    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, body, 'utf8');
      return { ok: true, path: relPath, bytes: Buffer.byteLength(body, 'utf8') };
    } catch (err) {
      return { ok: false, error: `write failed: ${err.message}` };
    }
  }

  // §STATE-LINK 2026-08-27 — shared by the ipcMain handlers above (renderer
  // callers) and the express routes below (CLI + agent-tool callers, over
  // CLEARGL_IPC_PORT) — one real implementation, two real entry points.
  async _bookmarkAddWithState(d) {
    if (!this.bookmarks || !this.rewind) return { error: 'bookmarks or rewind unavailable' };
    const { bookmark, added } = this.bookmarks.add(d);
    // §HONEST — a snapshot label must be unique per agent to be found
    // again unambiguously; the bookmark's own uuid guarantees that
    // (macro.js's bookmark() uses a human label instead, which is right
    // for macros — a person names them on purpose — but wrong here,
    // where the bookmark's title/url is already the human label).
    let snap;
    try {
      snap = await this.rewind.snapshot(bookmark.agentId, {
        url: bookmark.url, title: bookmark.title, label: `cg-bookmark:${bookmark.id}`,
      });
    } catch (err) {
      return { bookmark, added, stateError: err.message };
    }
    // §HONEST — snapshot() returns null (not a throw) for a page it won't
    // capture (about:blank, no live driver context) — real, documented
    // behavior in rewind/engine.js, not an edge case to paper over. The
    // bookmark itself still saved; only the state link is missing, and
    // the caller is told that plainly rather than getting back a
    // bookmark that silently claims state it doesn't have.
    if (!snap) return { bookmark, added, stateError: 'rewind returned no snapshot for this page' };
    // §0.39.265 — the ★ dialog names the account explicitly (null = none);
    // only a caller that says nothing gets the agent's default account.
    const accountId = d.accountId !== undefined ? (d.accountId || null)
      : this.options?.resolveDefaultAccountForAgent ? this.options.resolveDefaultAccountForAgent(bookmark.agentId) : null;
    const linked = this.bookmarks.linkState({ id: bookmark.id, snapshotId: snap.id, accountId });
    return { bookmark: linked.bookmark || bookmark, added };
  }

  async _bookmarkOpenWithState(d) {
    const bk = this.bookmarks?.list({ agentId: d.agentId }).find(b => b.id === d.id);
    if (!bk) return { error: `no bookmark "${d.id}"` };
    this.bookmarks?.recordVisit({ id: bk.id });
    if (!bk.snapshotId || !this.rewind) return { bookmark: bk, restored: false };
    try {
      const r = await this.rewind.restore({ agentId: bk.agentId, snapshotId: bk.snapshotId });
      return { bookmark: bk, restored: true, result: r };
    } catch (err) {
      // §1.2 — a failed restore must not silently fall back to a plain
      // navigate; the caller needs to know state restoration didn't
      // happen, not just end up on the right URL with the wrong cookies.
      return { bookmark: bk, restored: false, restoreError: err.message };
    }
  }

  _addBookmarkRoutes() {
    const bk = this.bookmarks;
    if (!bk) return;

    this.app.get('/bookmarks', (req, res) => {
      res.json({ bookmarks: bk.list(req.query) });
    });

    this.app.post('/bookmarks', (req, res) => {
      try { res.json(bk.add(req.body)); }
      catch (err) { res.status(400).json({ error: err.message }); }
    });

    this.app.delete('/bookmarks/:id', (req, res) => {
      try { res.json(bk.remove({ id: req.params.id })); }
      catch (err) { res.status(400).json({ error: err.message }); }
    });

    this.app.get('/bookmarks/check', (req, res) => {
      res.json({ isBookmarked: bk.isBookmarked(req.query) });
    });

    // §STATE-LINK / §CLI-FIRST 2026-08-27 — real HTTP entry points for the
    // CLI (cli/nexus.js's /bookmarks command) and the
    // clear_glass_bookmark_state agent tool. Same real methods the
    // renderer's ipcMain handlers call above, not a second copy.
    this.app.post('/bookmarks/with-state', async (req, res) => {
      try { res.json(await this._bookmarkAddWithState(req.body)); }
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    this.app.post('/bookmarks/:id/open-with-state', async (req, res) => {
      try { res.json(await this._bookmarkOpenWithState({ id: req.params.id, agentId: req.body.agentId })); }
      catch (err) { res.status(500).json({ error: err.message }); }
    });
  }

  // §TX16 2026-08-28 — real HTTP entry points for the CLI and any agent
  // tool built against BR8_clearglass_full_agent_tool_parity, same
  // CLI-first reasoning _addBookmarkRoutes uses above: the renderer's IPC
  // handlers (listeners:* above) and these routes both call this.options's
  // real CRUD directly — one implementation, two entry points.
  _addListenerRoutes() {
    const opts = this.options;
    if (!opts) return;

    this.app.get('/listeners', (req, res) => {
      res.json({ listeners: opts.listListeners() });
    });

    this.app.get('/listeners/for-url', (req, res) => {
      res.json({ listeners: opts.findListenersForUrl(req.query.url) });
    });

    this.app.post('/listeners', (req, res) => {
      const r = opts.registerListener(req.body);
      res.status(r.error ? 400 : 200).json(r);
    });

    this.app.patch('/listeners/:id', (req, res) => {
      const r = opts.updateListener(req.params.id, req.body);
      res.status(r.error ? 404 : 200).json(r);
    });

    this.app.delete('/listeners/:id', (req, res) => {
      const r = opts.removeListener(req.params.id);
      res.status(r.error ? 404 : 200).json(r);
    });
  }

  // ── Rewind ────────────────────────────────────────────────────────────────
  _addRewindRoutes() {
    const rw = this.rewind;
    if (!rw) return;

    this.app.get('/rewind/:agentId', (req, res) => {
      res.json({ snapshots: rw.list(req.params.agentId, parseInt(req.query.limit) || 20) });
    });

    this.app.post('/rewind/:agentId/snapshot', async (req, res) => {
      try { res.json(await rw.snapshot(req.params.agentId, req.body)); }
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    this.app.post('/rewind/:agentId/restore', async (req, res) => {
      try { res.json(await rw.restore({ agentId: req.params.agentId, ...req.body })); }
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    this.app.delete('/rewind/:agentId', (req, res) => {
      res.json(rw.clear(req.params.agentId));
    });
  }

  // ── Provider host ─────────────────────────────────────────────────────────
  _addProviderRoutes() {
    const ph = this.providerHost;
    if (!ph) return;

    this.app.get('/providers', (req, res) => {
      res.json({ providers: ph.list() });
    });

    this.app.post('/providers/:id/start', async (req, res) => {
      try { res.json(await ph.start(req.params.id, req.body)); }
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    this.app.post('/providers/:id/stop', (req, res) => {
      res.json(ph.stop(req.params.id));
    });

    this.app.post('/providers/:id/show', (req, res) => {
      ph.show(req.params.id);
      res.json({ ok: true });
    });
  }

  async stop() {
    return new Promise(r => { if (this.server) this.server.close(r); else r(); });
  }
}

module.exports = IpcBridge;
