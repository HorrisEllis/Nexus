'use strict';
/**
 * clear-glass/registry-components.js — Clear Glass System Contract
 * UUID: cg-registry-v1-0000-0000-000000000001
 * Version: 3.16.0
 *
 * Served at GET /contract from the IPC server (:7702).
 * Verified by orchestrator contract-handshake on boot.
 * Mirrors seam/registry-components.js but in the flat shape
 * the contract-handshake verifier expects (same as copilot/eravos).
 *
 * Contract shape: { systemId, version, port, label, purpose, components[], events{} }
 */

const NS = 'cg';
// §BUILT 2026-09-22 — was '3.1.0', a FOURTH real sync point for the same
// drift lib/version.js's services['clear-glass'], main/index.js's
// CG_VERSION, and clear-glass.spec's meta.version all had — found while
// updating those three, checked here too rather than assumed synced.
const V  = '3.16.0';

function _c(id, method, path, desc, opts = {}) {
  return {
    id:          `${NS}.${id}`,
    namespace:   NS,
    name:        id,
    version:     V,
    grammar:     opts.grammar || [id.replace(/\./g, ' ')],
    route:       { method, path },
    description: desc,
    params:      opts.params      || [],
    tags:        [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'],
    hooks:       opts.hooks       || {},
    tier:        opts.tier        || 'T2',
    typecode:    opts.typecode    || null,
  };
}

const components = [
  // ── Health / status ──────────────────────────────────────────────────────
  _c('health',  'GET', '/health',  'Clear Glass health, context count, bus stats'),
  _c('status',  'GET', '/status',  'Full system status — bus sample, agents, listeners, TLS'),
  _c('contract','GET', '/contract','Clear Glass interaction contract'),
  _c('events',  'GET', '/events',  'SSE — all SISO bus events', { tags: ['stream'] }),

  // ── Driver ───────────────────────────────────────────────────────────────
  _c('driver.exec', 'POST', '/cmd', 'Execute ClearDriver browser action', {
    tags: ['driver', 'automation'], typecode: 'CG-DRV-001',
  }),

  // ── DOM ──────────────────────────────────────────────────────────────────
  _c('dom.query',  'POST', '/cmd', 'Query live DOM tree',             { tags: ['dom'], typecode: 'CG-DOM-001' }),
  _c('dom.mutate', 'POST', '/cmd', 'Mutate DOM node',                 { tags: ['dom'], typecode: 'CG-DOM-002' }),
  _c('dom.pick',   'POST', '/cmd', 'Register element picker result',  { tags: ['dom', 'seam'], typecode: 'CG-DOM-003' }),
  _c('dom.tokens', 'POST', '/cmd', 'Token archaeology — detect LLM API patterns', { tags: ['dom', 'archaeology'] }),

  // ── Contexts ─────────────────────────────────────────────────────────────
  _c('context.create',    'POST', '/cmd',      'Create isolated Chromium partition', { tags: ['context'], typecode: 'CG-CTX-001' }),
  _c('context.switch',    'POST', '/cmd',      'Switch active agent context',        { tags: ['context'], typecode: 'CG-CTX-001' }),
  _c('context.list',      'GET',  '/contexts', 'List agent contexts',                { tags: ['context'] }),
  _c('context.fp.switch', 'POST', '/cmd',      'Switch fingerprint mode',            { tags: ['context', 'fingerprint'], typecode: 'CG-CTX-002' }),

  // ── Cookie vault ─────────────────────────────────────────────────────────
  _c('cookie.save',    'POST', '/cmd', 'Save per-account cookies',    { tags: ['cookie'], typecode: 'CG-CKI-001' }),
  _c('cookie.restore', 'POST', '/cmd', 'Restore cookies from vault',  { tags: ['cookie'], typecode: 'CG-CKI-002' }),

  // ── Co-pilot ─────────────────────────────────────────────────────────────
  _c('copilot.message', 'POST', '/cmd', 'Route to Clear Glass co-pilot', {
    tags: ['copilot'], typecode: 'CG-CPL-001',
  }),

  // ── Agent mesh ───────────────────────────────────────────────────────────
  _c('mesh.spawn',   'POST', '/cmd',    'Spawn free AI agent',           { tags: ['mesh'], typecode: 'CG-MSH-001' }),
  _c('mesh.send',    'POST', '/cmd',    'Send prompt to mesh agent',     { tags: ['mesh'], typecode: 'CG-MSH-002' }),
  _c('mesh.route',   'POST', '/cmd',    'RAID-route to healthiest agent',{ tags: ['mesh', 'raid'], typecode: 'CG-MSH-003' }),
  _c('mesh.list',    'GET',  '/agents', 'List mesh agents',              { tags: ['mesh'] }),

  // ── URL listeners ────────────────────────────────────────────────────────
  _c('url.listen',      'POST', '/cmd',       'Add URL pattern listener', { tags: ['listener'], typecode: 'CG-URL-001' }),
  _c('url.listen.list', 'GET',  '/listeners', 'List active listeners',    { tags: ['listener'] }),

  // ── Diagnostics ──────────────────────────────────────────────────────────
  _c('diag.run',  'POST', '/cmd', 'Run diagnostic suite', { tags: ['diagnostic'], typecode: 'CG-DGN-001' }),
  _c('diag.nexus','POST', '/cmd', 'NEXUS home UI audit',  { tags: ['diagnostic'], typecode: 'CG-DGN-002' }),

  // ── Windows ──────────────────────────────────────────────────────────────
  _c('window.open',  'POST', '/cmd', 'Open agent browser window', { tags: ['window'], typecode: 'CG-WIN-001' }),
  _c('window.close', 'POST', '/cmd', 'Close agent window to tray',{ tags: ['window'], typecode: 'CG-WIN-002' }),

  // ── Wire / ErosmancerOS bridge ───────────────────────────────────────────
  _c('wire.health',       'GET',  '/wire/health',   'Wire bridge health',                 { tags: ['wire'] }),
  _c('wire.eros.proxy',   'POST', '/eros/*',        'Proxy command to ErosmancerOS',      { tags: ['wire', 'eros'] }),
  _c('wire.driver.bridge','POST', '/bridge/driver', 'ClearDriver → ErosmancerOS actions', { tags: ['wire', 'driver'] }),
  _c('wire.hostile',      'POST', '/hook/hostile',  'Hostile detection → fp switch',      { tags: ['wire', 'security'] }),
  _c('wire.behavior',     'POST', '/hook/behavior', 'Behavior plan → Cortex intelligence',{ tags: ['wire', 'intelligence'] }),

  // §BUILD 2026-08-30 — BL30_registry_components_drift_audit. Real,
  // confirmed gap closed: this file had 32 components and zero mention
  // of an entire session's worth of real, committed, tested capability
  // — invisible to co-pilot's own real "list your tools" feature, which
  // reads directly from this same file. Every real IPC channel below is
  // copied verbatim from clear-glass/src/ipc/bridge.js's actual
  // ipcMain.handle() calls, not guessed at or re-derived.

  // ── Callto Index — real, persistent DOM-element-to-action registry ────────
  _c('calltos.list',   'IPC', 'calltos:list',   'List every registered callto',                 { tags: ['guardian', 'callto'] }),
  _c('calltos.forUrl', 'IPC', 'calltos:forUrl', 'Find calltos registered for a given origin',   { tags: ['guardian', 'callto'] }),
  _c('calltos.remove', 'IPC', 'calltos:remove', 'Remove a registered callto',                   { tags: ['guardian', 'callto'] }),

  // ── Download listeners — real, event-gated per-download automation ────────
  _c('downloads.listListeners',   'IPC', 'downloads:listListeners',   'List configured download listeners',        { tags: ['downloads', 'listener'] }),
  _c('downloads.registerListener','IPC', 'downloads:registerListener','Register a real download listener',         { tags: ['downloads', 'listener'] }),
  _c('downloads.updateListener',  'IPC', 'downloads:updateListener', 'Update a download listener',                { tags: ['downloads', 'listener'] }),
  _c('downloads.removeListener',  'IPC', 'downloads:removeListener', 'Remove a download listener',                { tags: ['downloads', 'listener'] }),

  // ── Site settings — real per-origin permission storage ────────────────────
  _c('siteSettings.get',          'IPC', 'site-settings:get',          'Get one real per-origin setting',       { tags: ['site-settings'] }),
  _c('siteSettings.getAll',       'IPC', 'site-settings:getAll',       'Get all real settings for an origin',   { tags: ['site-settings'] }),
  _c('siteSettings.set',          'IPC', 'site-settings:set',          'Set a real per-origin setting',         { tags: ['site-settings'] }),
  _c('siteSettings.deleteKey',    'IPC', 'site-settings:deleteKey',    'Delete one real setting key',           { tags: ['site-settings'] }),
  _c('siteSettings.clear',        'IPC', 'site-settings:clear',        'Clear all real settings for an origin', { tags: ['site-settings'] }),
  _c('siteSettings.listOrigins',  'IPC', 'site-settings:listOrigins',  'List every real origin with settings',  { tags: ['site-settings'] }),

  // ── Real browsing history ──────────────────────────────────────────────────
  _c('history.list',   'IPC', 'history:list',   'Real browsing history search/list',     { tags: ['history'] }),
  _c('history.delete', 'IPC', 'history:delete',  'Delete a real history entry',           { tags: ['history'] }),
  _c('history.clear',  'IPC', 'history:clear',   'Clear real history',                    { tags: ['history'] }),

  // ── Chrome extension loading — real session.extensions.loadExtension ──────
  _c('extensions.list',          'IPC', 'extensions:list',          'List real loaded Chrome extensions',      { tags: ['extensions'] }),
  _c('extensions.load',          'IPC', 'extensions:load',         'Load a real unpacked extension',          { tags: ['extensions'] }),
  _c('extensions.unload',        'IPC', 'extensions:unload',       'Unload a real extension',                 { tags: ['extensions'] }),
  _c('extensions.pickDirectory', 'IPC', 'extensions:pickDirectory','Real OS directory picker for extensions', { tags: ['extensions'] }),

  // ── Bookmarks-with-state — real full-page state save/restore ──────────────
  _c('bookmarks.addWithState',  'IPC', 'bookmarks:addWithState',  'Bookmark + save real full page state', { tags: ['bookmarks', 'rewind'] }),
  _c('bookmarks.openWithState', 'IPC', 'bookmarks:openWithState', 'Open a bookmark and restore its real saved state', { tags: ['bookmarks', 'rewind'] }),

  // ── Rewind — real state snapshot/restore, event-driven from bookmarks ─────
  _c('rewind.list',     'IPC', 'rewind:list',     'List real rewind snapshots',   { tags: ['rewind'] }),
  _c('rewind.snapshot', 'IPC', 'rewind:snapshot', 'Take a real rewind snapshot',  { tags: ['rewind'] }),
  _c('rewind.restore',  'IPC', 'rewind:restore',  'Restore a real rewind snapshot',{ tags: ['rewind'] }),
  _c('rewind.clear',    'IPC', 'rewind:clear',    'Clear real rewind snapshots',  { tags: ['rewind'] }),

  // ── Passwords — real AES-256-GCM vault ─────────────────────────────────────
  _c('passwords.list',   'IPC', 'passwords:list',   'List real saved passwords (metadata only)', { tags: ['passwords', 'security'] }),
  _c('passwords.delete', 'IPC', 'passwords:delete', 'Delete a real saved password',              { tags: ['passwords', 'security'] }),

  // ── Speech-to-text — real offline transcription via PocketSphinx ──────────
  _c('speech.available',        'IPC', 'speech:available',        'Real offline speech engine availability', { tags: ['speech'] }),
  _c('speech.transcribeBuffer', 'IPC', 'speech:transcribeBuffer', 'Real offline audio-buffer transcription',  { tags: ['speech'] }),

  // ── Macros — real, first UI reach into lib/agent-tools/, erosmancer-aware ─
  _c('macros.list', 'IPC', 'macros:list', 'List real stored macros (real erosmancer integration where used)', { tags: ['macros'] }),
  _c('macros.get',  'IPC', 'macros:get',  'Get one real macro',                                                { tags: ['macros'] }),
  _c('macros.run',  'IPC', 'macros:run',  'Run a real macro against a real agent',                             { tags: ['macros'] }),

  // ── Background tabs — real, service-tab management ─────────────────────────
  _c('bgtab.open',  'IPC', 'bgtab:open',  'Open a real background service tab',  { tags: ['bgtab'] }),
  _c('bgtab.close', 'IPC', 'bgtab:close', 'Close a real background tab',         { tags: ['bgtab'] }),
  _c('bgtab.list',  'IPC', 'bgtab:list',  'List real open background tabs',      { tags: ['bgtab'] }),

  // §BUILT 2026-09-22 — James: "loom component registry." Real, already-
  // shipped IPC surface (autofill: 2026-09-19; screen-qa: this session)
  // with zero entries here — the same "backend real, registry never
  // touched" gap this file's own downloads/macros/bgtab entries above
  // exist to close, just never closed for these two. Not this file's
  // REST surface (/cli/autofill/*, /cli/screen-qa/*) — checked directly:
  // this registry only ever tracked IPC method:'IPC' components in
  // clear-glass, consistent with every entry above; REST isn't a second
  // registry this file tracks.
  _c('autofill.listProfiles', 'IPC', 'autofill:profile:list',   'List real AutofillProfile records',                              { tags: ['autofill'] }),
  _c('autofill.getProfile',   'IPC', 'autofill:profile:get',    'Get one real autofill profile',                                  { tags: ['autofill'] }),
  _c('autofill.createProfile','IPC', 'autofill:profile:create', 'Create a real autofill profile',                                 { tags: ['autofill'] }),
  _c('autofill.updateProfile','IPC', 'autofill:profile:update', 'Update a real autofill profile',                                 { tags: ['autofill'] }),
  _c('autofill.deleteProfile','IPC', 'autofill:profile:delete', 'Delete a real autofill profile',                                 { tags: ['autofill'] }),
  _c('autofill.detect',       'IPC', 'autofill:detect',         'Detect real form fields an autofill profile would confidently fill', { tags: ['autofill'] }),
  _c('autofill.fill',         'IPC', 'autofill:fill',           'Fill real form fields from an autofill profile',                 { tags: ['autofill'] }),

  // ── Screen Q&A — real, detect an open-ended on-screen question, answer
  //    it through the real copilot bridge, inject the chosen answer ────────
  _c('screenQa.detect',         'IPC', 'screen-qa:detect',         'Detect real open-ended questions on the page, excluding whatever autofill would already confidently fill', { tags: ['screen-qa'] }),
  _c('screenQa.answer',         'IPC', 'screen-qa:answer',         'Answer a real question through the real copilot bridge (text only — never writes to the page)',           { tags: ['screen-qa'] }),
  _c('screenQa.inject',         'IPC', 'screen-qa:inject',         'Write a chosen answer into one real field',                                                                { tags: ['screen-qa'] }),
  _c('screenQa.elementAt',      'IPC', 'screen-qa:element-at',     'The real field at a window-relative point — the right-click path\'s own target',                          { tags: ['screen-qa'] }),
  _c('screenQa.deriveQuestion', 'IPC', 'screen-qa:derive-question','Derive a question from one real field\'s metadata (label/aria-label/placeholder/name)',                    { tags: ['screen-qa'] }),

  // §BUILT 2026-09-23 — James: "login portals like apppassword login to each
  // provider, with a plus to add multiple, which hook into the cookie vault"
  // / "yes clearglass" (Clear Glass is the account authority). Each entry
  // copied verbatim from src/ipc/bridge.js's ipcMain.handle() calls.
  _c('accounts.setDefault',        'IPC', 'accounts:setDefault',        'Set/clear the per-provider default account (Clear Glass is the account authority guardian resolves against)', { tags: ['accounts'] }),
  _c('accounts.defaults',          'IPC', 'accounts:defaults',          'Per-provider default account map',                                    { tags: ['accounts'] }),
  _c('accounts.resolve',           'IPC', 'accounts:resolve',           'Resolve the account a dispatch to this provider would use (never auto-creates)', { tags: ['accounts'] }),
  _c('accounts.portal.providers',  'IPC', 'accounts:portal:providers',  'Providers a login portal can open, with their sign-in urls',           { tags: ['accounts', 'portal'] }),
  _c('accounts.portal.open',       'IPC', 'accounts:portal:open',       'Open a provider sign-in window in the account\'s own mesh partition',  { tags: ['accounts', 'portal'] }),
  _c('accounts.portal.capture',    'IPC', 'accounts:portal:capture',    'Capture the signed-in session into the cookie vault + link the provider identity', { tags: ['accounts', 'portal', 'vault'] }),
  _c('accounts.portal.status',     'IPC', 'accounts:portal:status',     'Live cookies, vault copy, identity and portal state for one account/provider', { tags: ['accounts', 'portal', 'vault'] }),
  _c('accounts.portal.close',      'IPC', 'accounts:portal:close',      'Close an open sign-in window',                                         { tags: ['accounts', 'portal'] }),
  _c('accounts.portal.signOut',    'IPC', 'accounts:portal:signOut',    'Clear the account\'s partition and delete its vault copy',            { tags: ['accounts', 'portal', 'vault'] }),
  _c('accounts.portal.credentials','IPC', 'accounts:portal:credentials','Seal optional sign-in credentials in the password vault for pre-fill', { tags: ['accounts', 'portal', 'passwords', 'security'] }),
  _c('accounts.portal.list',       'IPC', 'accounts:portal:list',       'List open sign-in windows',                                            { tags: ['accounts', 'portal'] }),
  _c('vault.status',               'IPC', 'vault:status',               'Which key protects each vault — OS-sealed (safeStorage) or legacy',    { tags: ['vault', 'security'] }),
  _c('macros.create',              'IPC', 'macros:create',              'Create a macro through macro.js\'s own validation (step builder)',     { tags: ['macros'] }),
  _c('macros.delete',              'IPC', 'macros:delete',              'Delete a macro (soft-delete, audit trail kept)',                       { tags: ['macros'] }),
  _c('macros.schema',              'IPC', 'macros:schema',              'Real browser_action enum + erosmancer actions + behavior profiles for the step builder', { tags: ['macros', 'eros'] }),
  // §BUILT 2026-09-23 (v0.39.227) — Clear Glass's job intake (src/jobs/intake.js).
  // /agent-mesh/send and /agent-mesh/job existed since 2026-09-19 (guardian's mesh-first ladder calls them) but were never
  // registered; they are the intake's front door now, so they are recorded here with it.
  _c('mesh.jobSend', 'POST', '/agent-mesh/send', 'Guardian hands Clear Glass a job it CLAIMED on its .job; the intake verifies the claim via guardian /jobs?id= before queueing (idempotent by jobId)', { tags: ['mesh', 'jobs', 'intake'] }),
  _c('mesh.jobStatus', 'GET', '/agent-mesh/job?jobId={jobId}', 'Status of a mesh job; survives a Clear Glass restart as clear_glass_restarted (sent:null, never resend)', { tags: ['mesh', 'jobs', 'intake'] }),
  _c('mesh.jobIntake', 'GET', '/agent-mesh/intake', 'Jobs Clear Glass has taken in from guardian (only jobs guardian claimed for it on their .job), with each <jobId>.intake record', { tags: ['mesh', 'jobs', 'intake'] }),
  // v0.39.239 — the downloads index's read side (the Library's Responses tab)
  _c('downloads.responses',    'GET', '/cli/downloads/responses',     'Agent chats (one row per chat at its newest version; ?versions=all lists every version, ?chatKey=provider:chatId one chat), agent replies and provider-tab downloads in the downloads index, each filed under its agent; filters agentId, jobId, provider, kind', { tags: ['downloads', 'responses', 'agent'] }),
  _c('downloads.responseItem', 'GET', '/cli/downloads/responses/:id', 'One downloads-index item in full: a chat transcript version, the reply text and code blocks, or the downloaded file record', { tags: ['downloads', 'responses', 'agent'] }),  // v0.39.241 — the Library window (renderer/library.html, the Settings runtime): Ctrl+J, ☰ and the tray open it
  _c('window.openLibrary',  'IPC', 'window:openLibrary',  'Open (or focus) the Library window at an area — downloads, responses, bookmarks, history, accounts, passwords, autofill, macros', { tags: ['window', 'library'] }),
  _c('window.closeLibrary', 'IPC', 'window:closeLibrary', 'Close the Library window', { tags: ['window', 'library'] }),
  _c('downloads.openFile',  'IPC', 'downloads:openFile',  'Open a completed download with the OS default app (Library → Downloads, click the name)', { tags: ['downloads', 'library'] }),
  // v0.39.251 — the element picker assigns provider selectors (src/providers/selector-assign.js; handoff 2026-09-25 step 1)
  _c('selectors.providerFor', 'IPC', 'selectors:provider-for-url', 'Which NCP provider a page belongs to (src/providers/registry.js hosts) — decides whether a pick is offered as a provider selector', { tags: ['selectors', 'picker', 'providers'] }),
  _c('selectors.assign',      'IPC', 'selectors:assign',           'Record a picked, live-checked input/send/reply selector in guardian\'s selector map (POST :7820/api/agents/:id/selectors, source picker); refused without evidence or with evidence from another provider\'s page', { tags: ['selectors', 'picker', 'guardian'] }),
];

module.exports = {
  systemId:   'clear-glass',
  namespace:  NS,
  version:    V,
  port:       7702,   // IPC server — where orchestrator polls /contract
  ssePort:    7701,
  tlsPort:    7703,
  wirePort:   7704,
  label:      'CLEAR-GLASS',
  purpose:    'Sovereign NEXUS browser. SISO-native →E→E→. Electron + Chromium + Firefox fingerprint + TLS JA4 + ErosmancerOS wire.',
  components,
  events: {
    emits: [
      'clear-glass.boot.complete',
      'clear-glass.window.opened',
      'clear-glass.registered',
      'clear-glass.shutdown',
      'eros.hostile.detected',
      'eros.behavior.plan',
      'lifecycle.ready',
      'nexus.status',
      'selectors.assigned',        // v0.39.251 — SSE, a picked selector recorded by guardian
      'selectors.assign.failed',   // v0.39.251 — SSE, refused here or by guardian (the reason travels with it)
    ],
    handles: [
      'orchestrator.shutdown',
      'cortex.raid.decide',
      'guardian.job.dispatch.receive',
    ],
  },
};
