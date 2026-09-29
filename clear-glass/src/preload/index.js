'use strict';

/**
 * Preload — contextIsolation bridge
 * Exposes a minimal, typed API to the renderer.
 * All calls go through ipcRenderer. No Node in renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ClearGlass', {
  // ── Navigation ────────────────────────────────────────────────────────
  navigate:   (agentId, url) => ipcRenderer.invoke('navigate', { agentId, url }),

  // ── DOM ───────────────────────────────────────────────────────────────
  dom: {
    query:   (payload) => ipcRenderer.invoke('dom:query', payload),
    mutate:  (payload) => ipcRenderer.invoke('dom:mutate', payload),
    pick:    (payload) => ipcRenderer.invoke('dom:pick', payload),
  },

  // ── Driver ────────────────────────────────────────────────────────────
  driver: {
    exec: (payload) => ipcRenderer.invoke('driver:exec', payload),
  },

  // ── Cookies ───────────────────────────────────────────────────────────
  cookies: {
    save:    (payload) => ipcRenderer.invoke('cookies:save', payload),
    restore: (payload) => ipcRenderer.invoke('cookies:restore', payload),
    count:   (payload) => ipcRenderer.invoke('cookies:count', payload),
  },

  // ── Co-pilot ─────────────────────────────────────────────────────────
  copilot: {
    send: (payload) => ipcRenderer.invoke('copilot:send', payload),
    hat:        () => ipcRenderer.invoke('copilot:hat'),
    hatEnsure:  () => ipcRenderer.invoke('copilot:hatEnsure'),
    hatUpdate:  (patch) => ipcRenderer.invoke('copilot:hatUpdate', patch),
    exec:       (cmd, agentId) => ipcRenderer.invoke('copilot:exec', { cmd, agentId }),
    // §0.39.278 — the pane's kept conversation
    history:    (agentId, limit) => ipcRenderer.invoke('copilot:history', { agentId, limit }),
    newConversation: (agentId) => ipcRenderer.invoke('copilot:newConversation', { agentId }),
    // handlers existed in ipc/bridge.js; the pane's /build and /diagnose had no preload path to them
    build:      (payload) => ipcRenderer.invoke('copilot:build', payload),
    diagnose:   (payload) => ipcRenderer.invoke('copilot:diagnose', payload),
  },

  // ── Context ───────────────────────────────────────────────────────────
  context: {
    // switchTo — switch which agent's context is active. Real, working,
    // always was.
    switch: (payload) => ipcRenderer.invoke('context:switch', payload),
    // §NEW 2026-07-11 — switchFingerprint (Chrome/Firefox/Safari/Edge
    // spoofed identity). This never had an IPC channel at all before now
    // — only reachable automatically (hostile-page detection) or via a
    // copilot tool. Separate channel on purpose; see ipc/bridge.js's
    // context:switch fix comment for why it's not sharing one with
    // switchTo above.
    switchFingerprint: (payload) => ipcRenderer.invoke('context:switchFingerprint', payload),
  },

  // ── Errors — was missing entirely, the actual gap behind "where are
  //    the errors" ──────────────────────────────────────────────────────
  errors: {
    report: (payload) => ipcRenderer.invoke('errors:report', payload),
    recent: (n)       => ipcRenderer.invoke('errors:recent', { n }),
  },

  // ── API Settings ──────────────────────────────────────────────────────
  api: {
    get: ()        => ipcRenderer.invoke('api:get'),
    set: (payload) => ipcRenderer.invoke('api:set', payload),
  },

  // ── Options ───────────────────────────────────────────────────────────
  options: {
    get: ()        => ipcRenderer.invoke('options:get'),
    set: (payload) => ipcRenderer.invoke('options:set', payload),
  },

  // ── Toolbar command registry — §STRUCTURAL 2026-08-24 ─────────────────
  // Backend-owned (src/toolbar/commands.js). The renderer asks for this
  // once at startup instead of hardcoding its own copy of the command
  // list.
  toolbar: {
    commands: () => ipcRenderer.invoke('toolbar:commands'),
  },

  // ── Plugins — §NEW 2026-08-24, src/plugins/host.js ─────────────────────
  // invoke() is fire-and-forget by design (see bridge.js's own handler
  // comment) — a plugin's real response comes back as a separate event
  // the renderer would subscribe to via SSE/onAny, same as every other
  // async gate result in this app, not a synchronous return from here.
  plugins: {
    invoke:  (signature, data) => ipcRenderer.invoke('plugins:invoke', { signature, data }),
    // §NEW 2026-09-25 — list()/disable() wired to the real, already-
    // existing pluginHost methods (see bridge.js's plugins:list handler).
    list:    ()   => ipcRenderer.invoke('plugins:list'),
    disable: (id) => ipcRenderer.invoke('plugins:disable', { id }),
  },

  // ── WebExtensions — §BUILT 2026-09-26 (src/plugins/webextensions.js) ──
  webext: {
    list:       ()                          => ipcRenderer.invoke('webext:list'),
    pick:       (kind)                      => ipcRenderer.invoke('webext:pick', { kind }),
    install:    (source, allowFileAccess)   => ipcRenderer.invoke('webext:install', { source, allowFileAccess }),
    setEnabled: (id, enabled)               => ipcRenderer.invoke('webext:setEnabled', { id, enabled }),
    remove:     (id)                        => ipcRenderer.invoke('webext:remove', { id }),
  },

  // ── Downloads — §NEW 2026-08-24 ─────────────────────────────────────────
  downloads: {
    list:           (filter)  => ipcRenderer.invoke('downloads:list', filter),
    clearItem:      (id)      => ipcRenderer.invoke('downloads:clearItem', { id }),
    clearCompleted: ()        => ipcRenderer.invoke('downloads:clearCompleted'),
    openFolder:     (id)      => ipcRenderer.invoke('downloads:openFolder', { id }),
    openFile:       (id)      => ipcRenderer.invoke('downloads:openFile',   { id }),   // §LIBRARY 0.39.241
    // §2026-08-28 — real download-listener registry.
    listListeners:    ()          => ipcRenderer.invoke('downloads:listListeners'),
    registerListener: (config)    => ipcRenderer.invoke('downloads:registerListener', config),
    updateListener:   (id, updates) => ipcRenderer.invoke('downloads:updateListener', { id, updates }),
    removeListener:   (id)        => ipcRenderer.invoke('downloads:removeListener', { id }),
  },

  // ── Callto Index — §2026-08-29 ───────────────────────────────────────────
  calltos: {
    list:   ()    => ipcRenderer.invoke('calltos:list'),
    forUrl: (url) => ipcRenderer.invoke('calltos:forUrl', { url }),
    remove: (id)  => ipcRenderer.invoke('calltos:remove', { id }),
  },

  // ── Speech-to-text — §NEW 2026-08-24 ────────────────────────────────────
  speech: {
    available:          ()              => ipcRenderer.invoke('speech:available'),
    transcribeBuffer:   (buffer, ext)    => ipcRenderer.invoke('speech:transcribeBuffer', { buffer, ext }),
  },

  // ── Macros — §NEW 2026-08-29 — first real UI reach into lib/agent-tools/ ──
  // §FIXED 2026-09-23 — this object literal declared `macros` TWICE (a
  // 2026-09-06 block with run(name, {agentId, params, skipSnapshot}) and
  // this one with positional run(name, agentId, params, skipSnapshot)). In
  // a literal the LAST key wins, so ui/brainos/brainos-app.js's
  // macros.run(name, {}) sent `{}` as the agentId. One definition now,
  // accepting both call shapes so neither real caller breaks.
  macros: {
    list:   ()     => ipcRenderer.invoke('macros:list'),
    get:    (name) => ipcRenderer.invoke('macros:get', { name }),
    recordStart: (agentId) => ipcRenderer.invoke('macros:recordStart', { agentId }),
    recordStop:  (agentId) => ipcRenderer.invoke('macros:recordStop', { agentId }),
    run:    (name, agentOrOpts, params, skipSnapshot) => {
      const o = (agentOrOpts && typeof agentOrOpts === 'object') ? agentOrOpts : { agentId: agentOrOpts, params, skipSnapshot };
      return ipcRenderer.invoke('macros:run', { name, agentId: o.agentId, params: o.params, skipSnapshot: o.skipSnapshot });
    },
    create: (payload) => ipcRenderer.invoke('macros:create', payload),
    delete: (name)    => ipcRenderer.invoke('macros:delete', { name }),
    schema: ()        => ipcRenderer.invoke('macros:schema'),
  },

  // ── Passwords — §NEW 2026-08-24 ─────────────────────────────────────────
  passwords: {
    list:   ()   => ipcRenderer.invoke('passwords:list'),
    delete: (id) => ipcRenderer.invoke('passwords:delete', { id }),
  },

  // ── Site settings — §NEW 2026-08-24 ─────────────────────────────────────
  // §BUGFIX — real IPC handlers existed in bridge.js since the site-
  // settings commit, but were never actually exposed here, same class of
  // gap as the passwordVault constructor bug from two commits ago.
  siteSettings: {
    get:          (url, key) => ipcRenderer.invoke('site-settings:get', { url, key }),
    getAll:       (url)      => ipcRenderer.invoke('site-settings:getAll', { url }),
    set:          (url, key, value) => ipcRenderer.invoke('site-settings:set', { url, key, value }),
    deleteKey:    (url, key) => ipcRenderer.invoke('site-settings:deleteKey', { url, key }),
    clear:        (url)      => ipcRenderer.invoke('site-settings:clear', { url }),
    clearAll:     ()         => ipcRenderer.invoke('site-settings:clearAll'),
    listOrigins:  ()         => ipcRenderer.invoke('site-settings:listOrigins'),
  },

  // ── Accounts (real, per-agentKey identity — §PHASE-3 2026-08-23) ──────
  accounts: {
    list:        ()                    => ipcRenderer.invoke('accounts:list'),
    get:         (id)                  => ipcRenderer.invoke('accounts:get', { id }),
    create:      (payload)             => ipcRenderer.invoke('accounts:create', payload),
    update:      (id, updates)         => ipcRenderer.invoke('accounts:update', { id, updates }),
    delete:      (id)                  => ipcRenderer.invoke('accounts:delete', { id }),
    linkAgent:   (id, agentKey)        => ipcRenderer.invoke('accounts:linkAgent',   { id, agentKey }),
    unlinkAgent: (id, agentKey)        => ipcRenderer.invoke('accounts:unlinkAgent', { id, agentKey }),
    // §BUILT 2026-09-19 — real per-provider identity, see ipc/bridge.js's own header for the full reasoning
    linkProvider:   (id, provider, { accountId, email, displayName } = {}) => ipcRenderer.invoke('accounts:linkProvider',   { id, provider, accountId, email, displayName }),
    unlinkProvider: (id, provider)                                        => ipcRenderer.invoke('accounts:unlinkProvider', { id, provider }),
    verifyProvider: (id, provider)                                        => ipcRenderer.invoke('accounts:verifyProvider', { id, provider }),
    getProvider:    (id, provider)                                        => ipcRenderer.invoke('accounts:getProvider',    { id, provider }),
    findByProvider: (provider, accountId)                                 => ipcRenderer.invoke('accounts:findByProvider', { provider, accountId }),
    // §BUILT 2026-09-23 — Clear Glass is the account authority (per-provider
    // default) + login portals wired to the cookie vault.
    setDefault: (agentKey, id) => ipcRenderer.invoke('accounts:setDefault', { agentKey, id }),
    defaults:   ()             => ipcRenderer.invoke('accounts:defaults'),
    resolve:    (agentKey, id) => ipcRenderer.invoke('accounts:resolve', { agentKey, id }),
    portal: {
      providers:   ()                                   => ipcRenderer.invoke('accounts:portal:providers'),
      open:        (id, provider)                       => ipcRenderer.invoke('accounts:portal:open',    { id, provider }),
      capture:     (id, provider, identity, close)      => ipcRenderer.invoke('accounts:portal:capture', { id, provider, identity, close }),
      status:      (id, provider)                       => ipcRenderer.invoke('accounts:portal:status',  { id, provider }),
      close:       (id, provider)                       => ipcRenderer.invoke('accounts:portal:close',   { id, provider }),
      signOut:     (id, provider, opts = {})            => ipcRenderer.invoke('accounts:portal:signOut', { id, provider, ...opts }),
      credentials: (id, provider, username, password)   => ipcRenderer.invoke('accounts:portal:credentials', { id, provider, username, password }),
      list:        ()                                   => ipcRenderer.invoke('accounts:portal:list'),
    },
  },

  // §BUILT 2026-09-23 — which key protects each vault (OS-sealed or legacy).
  vault: {
    status: () => ipcRenderer.invoke('vault:status'),
  },

  // §TX16 2026-08-28 — was wired in ipc/bridge.js (listeners:list/get/
  // register/update/remove/forUrl all already real, real CRUD in
  // options/store.js) but never exposed to the renderer here — same gap
  // class the accounts object above already had once (real backend, zero
  // UI consumers) until this exact settings panel closed it.
  listeners: {
    list:      ()             => ipcRenderer.invoke('listeners:list'),
    get:       (id)           => ipcRenderer.invoke('listeners:get', { id }),
    register:  (payload)      => ipcRenderer.invoke('listeners:register', payload),
    update:    (id, updates)  => ipcRenderer.invoke('listeners:update', { id, updates }),
    remove:    (id)           => ipcRenderer.invoke('listeners:remove', { id }),
    forUrl:    (url)          => ipcRenderer.invoke('listeners:forUrl', { url }),
    decay:     { get: () => ipcRenderer.invoke('listeners:decay:get'), set: (patch) => ipcRenderer.invoke('listeners:decay:set', patch), run: () => ipcRenderer.invoke('listeners:decay:run') },
  },

  // §0.39.265 — keyboard shortcuts. The main process catches the keys (in the
  // chrome and inside pages) and sends a window its browser actions here.
  shortcuts: {
    list:     ()               => ipcRenderer.invoke('shortcuts:list'),
    set:      (accel, action)  => ipcRenderer.invoke('shortcuts:set', { accel, action }),
    remove:   (accel)          => ipcRenderer.invoke('shortcuts:remove', { accel }),
    reset:    ()               => ipcRenderer.invoke('shortcuts:reset'),
    onAction: (cb) => { const f = (_e, d) => cb(d); ipcRenderer.on('shortcut:action', f); return () => ipcRenderer.removeListener('shortcut:action', f); },
  },

  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
  },

  // §FIXED 2026-09-02 — real, distinct from window.ClearGlass.agents
  // above (the real agent-mesh registry) — AM8's own custom, user-paired
  // input/output agents, renamed off the colliding 'agents:*' channels
  // (see ipc/bridge.js's own header for the full real bug this fixes).
  customAgents: {
    list:     ()       => ipcRenderer.invoke('custom-agents:list'),
    get:      (id)      => ipcRenderer.invoke('custom-agents:get', { id }),
    register: (payload) => ipcRenderer.invoke('custom-agents:register', payload),
  },

  // ── Diagnostics ──────────────────────────────────────────────────────────
  diag: {
    run:   (payload) => ipcRenderer.invoke('diag:run', payload),
    nexus: (payload) => ipcRenderer.invoke('diag:nexus', payload),
  },

  // ── Host window controls ────────────────────────────────────────────────
  window: {
    minimize:     (agentId) => ipcRenderer.invoke('window:minimize', { agentId }),
    hide:         (agentId) => ipcRenderer.invoke('window:hide',     { agentId }),
    maximize:     (agentId) => ipcRenderer.invoke('window:maximize', { agentId }),
    open:         (payload) => ipcRenderer.invoke('window:open',     payload),
    openSettings: ()        => ipcRenderer.invoke('window:openSettings'),
    closeSettings:()        => ipcRenderer.invoke('window:closeSettings'),
    openLibrary:  (area)    => ipcRenderer.invoke('window:openLibrary', { area }),   // §LIBRARY 0.39.241 — renderer/library.html
    closeLibrary: ()        => ipcRenderer.invoke('window:closeLibrary'),
    list:         ()        => ipcRenderer.invoke('window:list'),
    focus:        (agentId) => ipcRenderer.invoke('window:focus', { agentId }),
  },

  // ── SSE port ─────────────────────────────────────────────────────────
  getSsePort: () => ipcRenderer.invoke('sse:port'),

  // ── Bookmarks ─────────────────────────────────────────────────────────
  bookmarks: {
    add:    (payload) => ipcRenderer.invoke('bookmarks:add',    payload),
    remove: (payload) => ipcRenderer.invoke('bookmarks:remove', payload),
    list:   (filter)  => ipcRenderer.invoke('bookmarks:list',   filter || {}),
    check:  (payload) => ipcRenderer.invoke('bookmarks:check',  payload),
    visit:  (payload) => ipcRenderer.invoke('bookmarks:visit',  payload),
    // §0.39.265 — a bookmark carries page state (a rewind snapshot) and an account
    addWithState:  (payload) => ipcRenderer.invoke('bookmarks:addWithState',  payload),
    openWithState: (payload) => ipcRenderer.invoke('bookmarks:openWithState', payload),
    linkState:     (payload) => ipcRenderer.invoke('bookmarks:linkState',     payload),
  },

  // ── History — §fix 2026-09-02 ────────────────────────────────────────
  // James: "Error: cg.history not available — namespace missing from
  // window.ClearGlass entirely." Real backend (src/history/store.js) and
  // real IPC handlers (history:list/delete/clear, ipc/bridge.js:628-630)
  // both already existed and were both already wired to a live
  // HistoryStore in main/index.js — this was the one remaining real gap:
  // nothing in this file ever called contextBridge to expose them to the
  // renderer, so `cg.history` was undefined even though every layer
  // beneath it worked. Same call shape ipc/bridge.js's handlers expect:
  // list takes a filter object; delete/clear take a bare id/agentId,
  // wrapped into the {id}/{agentId} shape the handlers destructure.
  history: {
    list:   (filter) => ipcRenderer.invoke('history:list', filter || {}),
    record: (payload) => ipcRenderer.invoke('history:record', payload),
    delete: (id)      => ipcRenderer.invoke('history:delete', { id }),
    clear:  (agentId) => ipcRenderer.invoke('history:clear', { agentId }),
  },

  // §BUILT 2026-09-19 — real AutofillProfile CRUD + detect/fill orchestration
  autofill: {
    listProfiles:  ()             => ipcRenderer.invoke('autofill:profile:list'),
    getProfile:    (id)           => ipcRenderer.invoke('autofill:profile:get', { id }),
    createProfile: (payload)      => ipcRenderer.invoke('autofill:profile:create', payload),
    updateProfile: (id, updates)  => ipcRenderer.invoke('autofill:profile:update', { id, updates }),
    deleteProfile: (id)           => ipcRenderer.invoke('autofill:profile:delete', { id }),
    detect: (profileId, agentId)  => ipcRenderer.invoke('autofill:detect', { profileId, agentId }),
    fill:   (profileId, agentId, minConfidence, vars) => ipcRenderer.invoke('autofill:fill', { profileId, agentId, minConfidence, vars }),
    // §0.39.265 — cover letters / Upwork & Fiverr proposals (src/autofill/proposal.js)
    proposal: (payload)   => ipcRenderer.invoke('autofill:proposal', payload),
    readPage: (agentId)   => ipcRenderer.invoke('autofill:readPage', { agentId }),
  },

  // §BUILT 2026-09-21 — James: "clearglass needs to help me with job
  // applications, answering on screen questions... using hotkey.
  // right click, answer question context option."
  screenQa: {
    detect:     (profileId, agentId)          => ipcRenderer.invoke('screen-qa:detect', { profileId, agentId }),
    answer:     (question, context, agentId)  => ipcRenderer.invoke('screen-qa:answer', { question, context, agentId }),
    inject:     (cgId, text, agentId)         => ipcRenderer.invoke('screen-qa:inject', { cgId, text, agentId }),
    elementAt:  (x, y, agentId)               => ipcRenderer.invoke('screen-qa:element-at', { x, y, agentId }),
    deriveQuestion: (fieldMeta)               => ipcRenderer.invoke('screen-qa:derive-question', { fieldMeta }),
  },

  // ── Rewind ────────────────────────────────────────────────────────────
  rewind: {
    list:     (agentId, limit) => ipcRenderer.invoke('rewind:list',     { agentId, limit }),
    snapshot: (agentId, opts)  => ipcRenderer.invoke('rewind:snapshot', { agentId, ...opts }),
    restore:  (payload)        => ipcRenderer.invoke('rewind:restore',  payload),
    clear:    (agentId)        => ipcRenderer.invoke('rewind:clear',    { agentId }),
  },

  // ── Provider host ─────────────────────────────────────────────────────
  providers: {
    list:  ()                  => ipcRenderer.invoke('providers:list'),
    start: (providerId, opts)  => ipcRenderer.invoke('providers:start', { providerId, ...opts }),
    stop:  (providerId)        => ipcRenderer.invoke('providers:stop',  { providerId }),
    show:  (providerId)        => ipcRenderer.invoke('providers:show',  { providerId }),
    deploy:(providerId)        => ipcRenderer.invoke('providers:deploy',{ providerId }),
  },

  // §SELECTOR-ASSIGN 0.39.251 — element picker → guardian's selector map.
  selectors: {
    providerFor: (url)     => ipcRenderer.invoke('selectors:provider-for-url', { url }),
    assign:      (payload) => ipcRenderer.invoke('selectors:assign', payload),
  },

  // ── Userscripts ──────────────────────────────────────────────────────
  userscripts: {
    list:    (filter)           => ipcRenderer.invoke('userscripts:list',   filter || {}),
    inject:  (agentId, scriptId)=> ipcRenderer.invoke('userscripts:inject', { agentId, scriptId }),
    toggle:  (scriptId, enabled)=> ipcRenderer.invoke('userscripts:toggle', { scriptId, enabled }),
    create:  (payload)          => ipcRenderer.invoke('userscripts:create', payload),
    delete:  (scriptId)         => ipcRenderer.invoke('userscripts:delete', { scriptId }),
    source:  (scriptId)         => ipcRenderer.invoke('userscripts:source', { scriptId }),
    edit:    (scriptId, updates)=> ipcRenderer.invoke('userscripts:edit',   { scriptId, updates }),
  },

  // ── Agent mesh ────────────────────────────────────────────────────────
  mesh: {
    spawn:   (payload) => ipcRenderer.invoke('mesh:spawn',   payload),
    route:   (payload) => ipcRenderer.invoke('mesh:route',   payload),
    enqueue: (payload) => ipcRenderer.invoke('mesh:enqueue', payload),
    list:    ()        => ipcRenderer.invoke('mesh:list'),
  },

  // ── Background tabs ───────────────────────────────────────────────────
  bgTabs: {
    open:  (payload)  => ipcRenderer.invoke('bgtab:open',  payload),
    close: (agentId)  => ipcRenderer.invoke('bgtab:close', { agentId }),
    list:  ()         => ipcRenderer.invoke('bgtab:list'),
  },

  // ── Event listener ───────────────────────────────────────────────────
  on:  (channel, fn) => ipcRenderer.on(channel, (e, data) => fn(data)),
  off: (channel, fn) => ipcRenderer.removeListener(channel, fn),
  once:(channel, fn) => ipcRenderer.once(channel, (e, data) => fn(data)),

  // ── DOM event bridge (called from injected page scripts) ──────────────
  _sendDomEvent: (data) => ipcRenderer.send('dom:event', data),
  // §MCO10 2026-09-13 — real hook to associate the live DOM stream with a
  // RAID compartment/contract. Returns the real, current {compartmentUuid,
  // queueId} the main process now holds, not just an ack.
  setActiveCompartment: (compartmentUuid, queueId) =>
    ipcRenderer.invoke('compartment:set-active', { compartmentUuid, queueId }),
  _sendPickResult: (data) => ipcRenderer.send('dom:pick-result', data),
  // §ADDED 2026-09-02 — real cookie-vault round-trip. Same, established
  // fire-into-main-process pattern as the two lines above; the real
  // RESPONSE comes back a different way (see main/index.js's own
  // handler — delivered into the specific webview via
  // executeJavaScript, same pattern injectAnswer() already uses), not
  // through this call's own return value, since ipcRenderer.send() is
  // fire-and-forget by design.
  _sendCookieRequest: (data) => ipcRenderer.send('nexus:cookie-request', data),
});

// Inject IPC shim into the page world so injected scripts can emit events
// This runs in the isolated world but we bridge via window postMessage
window.addEventListener('message', (e) => {
  if (e.data?.__cgBridge === true) {
    ipcRenderer.send(e.data.channel, e.data.payload);
  }
});
