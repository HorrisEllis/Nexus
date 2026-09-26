'use strict';

/**
 * Agent Mesh
 * Free AI agent channels baked into Clear Glass.
 * Each agent runs in its own fingerprinted context.
 * ClearDriver automates their web UIs — no API keys needed.
 * RAID routes tasks to whichever agent is healthy.
 * 
 * Agents: Claude, ChatGPT, Gemini, Perplexity, Mistral, Grok, Meta AI
 */

// §BUGFIX 2026-08-23 — found while verifying Phase 3's real account model:
// require('uuid') is a genuine, unmet dependency — no node_modules/uuid,
// not in package.json, confirmed by checking both directly, not assumed
// from the error alone. This crashed the WHOLE module on load, not just
// a test — agent-mesh.js is required by main/index.js, so the real, live
// app would fail to boot on this exact line too. Real fix: Node's own
// built-in crypto.randomUUID() produces the same RFC4122 v4 UUID format
// uuidv4() did, with zero external dependency — matching the convention
// already used everywhere else in this codebase (NexusOptions'
// createAccount(), among many others), not a new pattern introduced here.
const { randomUUID: uuidv4 } = require('crypto');
const http = require('http');

// §HOOK 2026-08-29 — ErosmancerOS wire proxy, same real endpoint macro.js's
// engine:'erosmancer' steps already use (clear-glass/wire/nexus-wire.js's
// :7704/eros/* → erosmancer's own :7432/api/*). Duplicated here rather than
// imported from macro.js on purpose — macro.js lives under lib/agent-tools
// (a different, separately-loadable package) and agent-mesh.js has no real
// dependency on it; the actual logic is ~15 lines and matching macro.js's
// existing, already-audited implementation exactly is safer than adding a
// cross-package require for three functions.
const EROS_WIRE_PORT = parseInt(process.env.EROS_WIRE_PORT || '7704', 10);

function _erosRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      { hostname: '127.0.0.1', port: EROS_WIRE_PORT, path: urlPath, method,
        timeout: 20000, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (_) { resolve({ status: res.statusCode, body: { ok: false, error: 'erosmancer wire returned an unparseable body' } }); }
      }); }
    );
    req.on('error', (e) => resolve({ status: 503, body: { ok: false, error: `erosmancer wire unreachable on :${EROS_WIRE_PORT}: ${e.code || e.message}` } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 503, body: { ok: false, error: 'erosmancer wire timed out' } }); });
    if (data) req.write(data);
    req.end();
  });
}

const AGENT_REGISTRY = {
  claude: {
    id:       'claude',
    name:     'Claude',
    url:      'https://claude.ai',
    inputSel: 'div[contenteditable="true"]',
    sendSel:  'button[aria-label*="Send"]',
    respSel:  '.font-claude-message',
    color:    '#cc785c',
  },
  chatgpt: {
    id:       'chatgpt',
    name:     'ChatGPT',
    url:      'https://chatgpt.com',
    inputSel: '#prompt-textarea',
    sendSel:  'button[data-testid="send-button"]',
    respSel:  '.markdown.prose',
    color:    '#19c37d',
  },
  gemini: {
    id:       'gemini',
    name:     'Gemini',
    url:      'https://gemini.google.com',
    inputSel: 'rich-textarea .ql-editor',
    sendSel:  'button.send-button',
    respSel:  'message-content',
    color:    '#4285f4',
  },
  perplexity: {
    id:       'perplexity',
    name:     'Perplexity',
    url:      'https://perplexity.ai',
    inputSel: 'textarea[placeholder*="Ask"]',
    sendSel:  'button[aria-label*="Submit"]',
    respSel:  '.prose',
    color:    '#20b2aa',
  },
  mistral: {
    id:       'mistral',
    name:     'Mistral',
    url:      'https://chat.mistral.ai',
    inputSel: 'textarea',
    sendSel:  'button[type="submit"]',
    respSel:  '.message-content',
    color:    '#f97316',
  },
  // §BUILT — real chat.deepseek.com selectors, externally verified against
  // 2+ independent, currently-maintained live community userscripts (not
  // guessed): #chat-input (input), .ds-markdown (response). Send button has
  // no stable selector of its own (hashed class, rotates per build) — this
  // registry entry's sendSel is a best-effort proximity fallback; guardian's
  // own userscript-deepseek.js does the real proximity search and is
  // preferred whenever guardian covers this provider (route()'s own
  // guardian-first dispatch already handles that ordering).
  deepseek: {
    id:       'deepseek',
    name:     'DeepSeek',
    url:      'https://chat.deepseek.com',
    inputSel: '#chat-input',
    sendSel:  '.ds-button--primary',
    respSel:  '.ds-markdown',
    color:    '#4d6bfe',
  },
  grok: {
    id:       'grok',
    name:     'Grok',
    url:      'https://grok.com',
    inputSel: 'textarea',
    sendSel:  'button[aria-label*="Send"]',
    respSel:  '.message-bubble',
    color:    '#1da1f2',
  },
};

// ── Drain strategies (§BUILT — James: "the queue needs a drainer, loops it
// back into the queue with escalating retry and diagnostic strategies each
// loop") ─────────────────────────────────────────────────────────────────
// Deliberately mirrors lib/seam/queue.js's real, already-proven escalation
// vocabulary (STRATEGY_ORDER + per-strategy retry cap + final gap escalate,
// §LAW II) rather than inventing a second, competing retry taxonomy
// (§10.3 — competing truth layers are a system failure). The four tiers
// below are new judgment calls for THIS domain (agent-mesh dispatch, not
// SEAM's content-verification pipeline) — not an existing convention being
// copied verbatim, since a stale browser context and a failed text
// generation are different failure shapes needing different diagnostics:
//   RETRY      — assume transient (network blip, slow DOM); just try again.
//   RESPAWN    — assume stale tab/DOM state; force a clean spawn() before retrying.
//   FALLBACK   — assume this agent is genuinely bad right now; force a
//                different one via an explicit fallbackOrder.
//   DIAGNOSTIC — last resort: full mesh snapshot attached for the eventual
//                gap, fresh spawn AND forced fallback together.
const DRAIN_STRATEGY = Object.freeze({
  RETRY:      'retry',
  RESPAWN:    'respawn',
  FALLBACK:   'fallback',
  DIAGNOSTIC: 'diagnostic',
});
const DRAIN_STRATEGY_ORDER = [DRAIN_STRATEGY.RETRY, DRAIN_STRATEGY.RESPAWN, DRAIN_STRATEGY.FALLBACK, DRAIN_STRATEGY.DIAGNOSTIC];
const MAX_RETRIES_PER_DRAIN_STRATEGY = 2; // 4 strategies × 2 = 8 retries before escalation (9 total dispatches counting the first, un-retried attempt — same convention as lib/seam/queue.js's own retries counter)
// Escalating backoff per strategy tier, ms — never re-inject a failed task
// synchronously (that's exactly the tight-retry-loop risk flagged in this
// session's own DOM-sync design discussion). Index matches DRAIN_STRATEGY_ORDER.
const DRAIN_BACKOFF_MS = [1000, 3000, 8000, 15000];

class AgentMesh {
  // §PHASE-3 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md item 6:
  // `accounts` is optional and backward-compatible on purpose — anything
  // that constructs AgentMesh without it (tests, a headless CLI path)
  // keeps the exact old behavior (the literal string 'default') rather
  // than throwing. Only main/index.js's real boot path wires the real
  // NexusOptions instance in, which is what turns that literal into a
  // real, stable, per-agentKey account uuid.
  // §HOOK 2026-08-29 — `rewind` is optional and backward-compatible, same
  // pattern as `accounts` above: anything constructing AgentMesh without
  // it (tests, the old headless path) behaves exactly as before. Only
  // main/index.js's real boot path wires the real RewindEngine in, which
  // turns send()'s labeled snapshot below from a no-op into a real
  // rollback point.
  constructor({ ctxMgr, driver, sse, seam, vault, accounts, rewind }) {
    this.ctxMgr   = ctxMgr;
    this.driver   = driver;
    this.sse      = sse;
    this.seam     = seam;
    this.vault    = vault;
    this.accounts = accounts || null;
    this.rewind   = rewind || null;
    this.domTransport = null;   // built lazily (needs electron): see _dom()
    this.agents  = new Map(); // agentKey → AgentState
    this.queue   = [];        // pending tasks
    this.processing = false;
    this._nodeStatusCache = new Map(); // instanceId -> last-seen status, for change detection
    this._nodePulseTimer  = null;
    // §BUILT — Phase 2 real route graph (see route-graph.js's own header).
    // Constructed lazily/defensively: enqueueFn binds `this.enqueue` so a
    // fired route re-enters this same mesh's own real drain/retry machinery,
    // not a second dispatch path.
    const { RouteGraph } = require('./route-graph.js');
    this._routeGraph = new RouteGraph({ enqueueFn: (task) => this.enqueue(task), busEmit: (t, d) => this.sse.emit(t, d) });
    // §BUILT — Phase 4/automation, the one genuine gap docs/2026-09-11-
    // brainos-external-concept-mapping.spec named: a real trigger/
    // schedule-driven workflow engine. Same enqueueFn/busEmit wiring as
    // route-graph above — one real dispatch path, not two.
    const { AutomationEngine } = require('./automation-engine.js');
    this._automation = new AutomationEngine({
      enqueueFn: (task) => this.enqueue(task),
      busEmit: (t, d) => this.sse.emit(t, d),
      meshViewFn: () => this.listMeshView(),
      // §0.39.265 — mesh.* values a condition step can compare
      statsFn: () => ({ queueDepth: this.queue.length, agentCount: this.agents.size }),
    });
    this._automation.start();
  }

  /**
   * _resolveAccountId(agentKey, explicit) — real resolution order: an
   * explicitly-passed accountId always wins (a caller who knows which
   * real account they want, e.g. a future Agent Suite window, is never
   * overridden); otherwise, if a real NexusOptions instance was wired in
   * at construction, resolveDefaultAccountForAgent gives back a real,
   * stable uuid (auto-creating the account on first use); otherwise
   * (no accounts store wired in at all) falls back to the exact literal
   * this file always used, so nothing that doesn't opt into accounts
   * breaks.
   */
  _resolveAccountId(agentKey, explicit) {
    if (explicit) return explicit;
    if (this.accounts) return this.accounts.resolveDefaultAccountForAgent(agentKey);
    return 'default';
  }

  async init() {
    console.log(`[AgentMesh] Registry: ${Object.keys(AGENT_REGISTRY).join(', ')}`);
    this._startNodePulse();
  }

  // ── Node pulse (rebuilt from BrainOS) ──────────────────────────────────
  // §CONVERT 2026-09-06 — James: "convert brainos into the agent mesh."
  // BrainOS's own real value was never its standalone canvas or its
  // duplicate agent/orchestration layer (neither got ported — see
  // network/install.js's header for the full record of what didn't come
  // across and why) — it was the one genuinely new idea: a live picture
  // of which *processes* (guardian, clear-glass itself, any other real
  // node) are actually reachable right now, via handshake+heartbeat, not
  // just which chat-agent DOM contexts this mesh has spawned. That
  // picture belongs here, in the real agent mesh, not in a second,
  // parallel "mesh" concept — reading network/pulse-registry.js's live
  // registry directly (same Electron main process, no HTTP round trip
  // needed) is what actually converts it.
  //
  // listAgents() above already answers "which chat-agent DOM contexts are
  // spawned and how healthy are they." listNodes()/listMeshView() below
  // answer the other real half BrainOS's canvas asked: "which processes
  // in this whole nexus deployment are alive right now."
  _network() {
    try { return require('../network/install.js'); }
    catch (_) { return null; }
  }

  listNodes() {
    const net = this._network();
    if (!net?.installed || !net.pulse) return [];
    return net.pulse.list();
  }

  // One unified view: real chat-agent contexts (this.agents, DOM-spawned,
  // health-scored) plus real external nodes (network's pulse registry,
  // handshake/heartbeat-tracked) — exactly the two things BrainOS's
  // canvas used to draw as one mesh, now actually one real call.
  listMeshView() {
    return [
      ...this.listAgents().map(a => ({ kind: 'agent', id: a.contextId, label: a.key, status: a.status, health: a.health, meta: a })),
      ...this.listNodes().map(n => ({ kind: 'node', id: n.instanceId, label: n.logicalId, status: n.status, health: n.status === 'alive' ? 100 : n.status === 'idle' ? 40 : 0, meta: n })),
    ];
  }

  // Polls the in-process pulse registry every 5s (matching BrainOS's own
  // pulse cadence) — not real network polling, just reading a Map, since
  // network/install.js lives in this same process. Emits a full snapshot
  // every tick for late-joining listeners (e.g. mesh-picker.js on first
  // connect) plus a targeted event for any node whose status actually
  // changed since the last tick, so a listener doesn't have to diff
  // snapshots itself to notice a node went idle/dead/came back.
  _startNodePulse() {
    if (this._nodePulseTimer) return;
    this._nodePulseTimer = setInterval(() => {
      const nodes = this.listNodes();
      for (const n of nodes) {
        const prev = this._nodeStatusCache.get(n.instanceId);
        if (prev !== n.status) {
          this._nodeStatusCache.set(n.instanceId, n.status);
          this.sse.emit('mesh.node.status_changed', { instanceId: n.instanceId, logicalId: n.logicalId, from: prev || null, to: n.status, ts: Date.now() });
        }
      }
      // Drop cache entries for nodes network/install.js has pruned (dead >5min)
      const liveIds = new Set(nodes.map(n => n.instanceId));
      for (const id of this._nodeStatusCache.keys()) if (!liveIds.has(id)) this._nodeStatusCache.delete(id);

      this.sse.emit('mesh.nodes.snapshot', { nodes, ts: Date.now() });
    }, 5000);
    this._nodePulseTimer.unref?.();
  }

  stopNodePulse() {
    if (this._nodePulseTimer) { clearInterval(this._nodePulseTimer); this._nodePulseTimer = null; }
  }

  // ── Spawn agent context ───────────────────────────────────────────────
  // §EXPANSION 2026-07-09 — CookieVault's own header comment says it exists
  // to "support save, restore, snapshot, and diff for RAID fallback
  // routing," but nothing here ever called vault.restore(). Every spawn()
  // — including every fallback spawn inside route() — got a brand-new
  // session.fromPartition() with zero cookies. Any agent behind a login
  // (claude.ai, chatgpt.com, gemini.google.com...) would silently land on
  // a logged-out page after a fallback, and route() would report success
  // for a task that never actually ran.
  //
  // Fix: restore keyed on the *stable* agentKey ('claude', 'chatgpt', ...)
  // rather than the ephemeral per-spawn contextId — the vault's named
  // "account cookies" path (accountId), not its versioned per-instance
  // snapshot path, which ContextManager already auto-populates per
  // ephemeral contextId and is unrelated to this.
  async spawn(agentKey, options = {}) {
    const def = AGENT_REGISTRY[agentKey];
    if (!def) throw new Error(`Unknown agent: ${agentKey}`);

    // §CONNECT-GAP-A 2026-09-11 — real, confirmed duplication: when
    // route()'s guardian-first dispatch (_dispatchViaGuardian) fails or
    // is skipped, this spawn() used to always open a SECOND, unrelated
    // session for agents ProviderHost already owns — partition
    // `persist:mesh-<agentKey>-<accountId>` vs ProviderHost's own
    // `persist:ncp-<agentKey>` (clear-glass/src/providers/host.js).
    // Same site, two separate cookie jars, two separate logins.
    // Fix is session-identity only, not a UI/window-handle reach-across:
    // reuse _guardianProviders() (the same live, already-audited
    // GET /providers call route() itself uses) to ask whether guardian
    // considers this exact agentKey connected, and if so, adopt
    // ProviderHost's own partition + a stable agentId so
    // openBackgroundTab's existing bgTabs.has(agentId) dedup (already
    // real, see that function) naturally reuses one tab instead of
    // minting a new one per spawn. No headless-mode branch, no new
    // window-visibility logic — this only changes which partition/id
    // string gets used. Agents guardian doesn't cover (mistral/grok/
    // meta) are completely unaffected — they keep their existing
    // per-account mesh-* scheme, there being no ProviderHost session to
    // share.
    let guardianOwned = false;
    // 2026-09-19: an explicit options.contextId (guardian's deterministic agentId, mesh-<provider>-<account>) means
    // the mesh owns this tab. It must NOT join the userscript's ncp-<agent> tab: two actuators on one page.
    if (!options.contextId) try {
      const guardianProviders = await this._guardianProviders();
      guardianOwned = guardianProviders?.providers?.[agentKey] === 'connected';
    } catch (_) { /* fail-soft, matches _guardianProviders' own contract */ }

    const contextId = options.contextId || (guardianOwned
      ? `ncp-${agentKey}`
      : `mesh-${agentKey}-${uuidv4().slice(0, 8)}`);
    const accountId = this._resolveAccountId(agentKey, options.accountId);

    // §FIX 2026-08-30 — James, directly: "The agent mesh needs to be
    // the hub for all the agents. It doesn't need to use a window...
    // ClearGlass is cli first. Runs tabs in the background." Real,
    // confirmed finding this same session: this used to call
    // this.ctxMgr.create() (an isolated context with NO real window)
    // then later, in send(), navigate it via driver._navigate() — a
    // genuinely generic primitive confirmed to do zero userscript
    // injection. Compared directly against ProviderHost's own real,
    // working spawn path (this session's own boot-log evidence:
    // real userscript injection -> real guardian NCP connection) —
    // agent-mesh's old path had no route to either.
    //
    // Real fix: openBackgroundTab (clear-glass/src/main/index.js,
    // already real, already proven this session's own CLI-command
    // work) loads the SAME real browser.html renderer normal windows
    // use — confirmed directly: browser.js listens for real
    // 'userscript.auto-injected' SSE events, the same real pipeline
    // ProviderHost's own tabs get. A real partition (extended onto
    // openBackgroundTab in the same commit as this fix) preserves the
    // real multi-account cookie isolation the old ctxMgr-based
    // approach provided — not traded away for this real fix.
    let windowId = null, cookiesRestored = 0, realSession = null;
    try {
      const partition = guardianOwned
        ? `persist:ncp-${agentKey}`
        : `persist:mesh-${agentKey}-${accountId || 'default'}`;
      const opened = await require('../main/index.js').openBackgroundTab({ agentId: contextId, url: def.url, partition });
      windowId = opened.agentId;
      realSession = opened.session || null;
    } catch (err) {
      this.sse.emit('mesh.spawn.window_error', { agentKey, contextId, error: err.message, ts: Date.now() });
    }

    if (this.vault) {
      try {
        const r = await this.vault.restore({ agentId: agentKey, accountId, ses: realSession });
        cookiesRestored = r?.restored || 0;
      } catch (err) {
        this.sse.emit('mesh.vault.restore.error', { agentKey, contextId, error: err.message, ts: Date.now() });
      }
    }

    this.sse.emit('mesh.vault.restore', { agentKey, contextId, cookiesRestored, ts: Date.now() });

    // §SBP8 2026-08-28 — James's own real gap, confirmed by reading
    // spawn() directly before touching it: real account-vault awareness
    // already existed here (this.vault.restore, _resolveAccountId above)
    // but zero AGENT_CONSTRAINTS awareness — a spawned agent's real token
    // ceiling was invisible to anything holding its mesh state, forcing a
    // separate lookup every time it mattered. lib/agent-router.js's real,
    // already-built AGENT_CONSTRAINTS (chatgpt:900/chunk, gemini:1000000,
    // claude:200000, etc — the same real map BR5's chunking already
    // reads) is attached here once, at spawn time, not re-derived per
    // caller.
    let constraints = null;
    try { constraints = require('../../../lib/agent-router.js').AGENT_CONSTRAINTS[agentKey] || null; }
    catch (err) { this.sse.emit('mesh.constraints.unavailable', { agentKey, contextId, error: err.message, ts: Date.now() }); }

    const state = {

      key:       agentKey,
      contextId,
      accountId,
      def,
      constraints,
      status:    'spawned',
      health:    100,
      taskCount: 0,
      lastUsed:  Date.now(),
      windowId,
      session:   realSession,
    };

    this.agents.set(contextId, state);

    this.sse.emit('mesh.agent.spawned', {
      agentKey, contextId, url: def.url, ts: Date.now(),
    });

    return state;
  }

  // ── Send prompt to agent ──────────────────────────────────────────────
  // §HOOK 2026-08-29 — `useEros` opts a send() into ErosmancerOS's real
  // behavior-modeled execution (Box-Muller timing variance, Bezier mouse
  // paths) for the type+click, instead of raw driver.exec. §HONEST LIMIT,
  // same one macro.js's own erosmancer integration states: erosmancer's
  // click/type actions need a real targetUuid from its own NodeRegistry,
  // which this function has no way to resolve for an arbitrary agent's
  // input box. Rather than fake a targetUuid or silently skip the flag,
  // this uses erosmancer's 'evaluate' action instead — a raw JS string,
  // which erosmancer's real API accepts with no targetUuid requirement
  // (confirmed directly against macro.js's own EROS_EXECUTE_ACTIONS
  // handling) — so the prompt still gets typed and sent through
  // erosmancer's real pipeline (adaptive timing/replay-learning still
  // apply to the evaluate call itself), just not via its node-identity
  // click path. `profile` picks one of erosmancer's real, named behavior
  // profiles (precise|cautious|exploratory|turbo); omitted means
  // erosmancer's own adaptive default.
  async send({ agentKey, prompt, contextId, waitForResponse = true, timeout = 60000, useEros = false, profile }) {
    // Find or spawn context
    let state = contextId
      ? this.agents.get(contextId)
      : this._getBestAgent(agentKey);

    if (!state) {
      state = await this.spawn(agentKey);
    }

    const def = state.def;
    const taskId = uuidv4();

    this.sse.emit('mesh.task.start', {
      taskId, agentKey: state.key, contextId: state.contextId,
      promptSnippet: prompt.slice(0, 100), ts: Date.now(),
    });

    // §HOOK 2026-08-29 — rewind's rewind.snapshot(agentId, {label}) keys
    // its store on `agentId`, matching this.driver's own contextId-as-
    // agentId convention throughout this file — so a mesh task gets a
    // real, named rollback point distinct from rewind's generic 30s auto-
    // snapshots, mirroring the same pattern lib/agent-tools/.../macro.js's
    // run() already uses before its own first step. Best-effort: a
    // missing/failed snapshot never blocks the actual task.
    let preTaskSnapshotId = null;
    if (this.rewind) {
      try {
        const snap = await this.rewind.snapshot(state.contextId, { label: `mesh:${state.key}:${taskId}` });
        preTaskSnapshotId = snap?.snapshotId || snap?.id || null;
      } catch (_) {}
    }

    try {
      // §FIX 2026-08-30 — James: "Now try the fix" (continued from
      // spawn()). Real, confirmed architectural finding before writing
      // this: ClearDriver (clear-glass/src/driver/index.js) has ZERO
      // webview awareness — _getWebContents only ever returns the TOP-
      // LEVEL window's webContents, matched by title. openBackgroundTab
      // (spawn()'s new real path) loads browser.html — the full
      // ClearGlass shell, with the actual agent page inside a nested
      // <webview> tag, a genuinely separate webContents ClearDriver has
      // no way to reach. Every driver.exec call below (navigate, click,
      // type, eval for response-polling) was targeting the WRONG DOM
      // layer for these real, new windows — this was never going to
      // work, confirmed by reading ClearDriver directly, not assumed.
      //
      // Real fix: for the standard (non-eros) path, the userscript
      // already running inside the real, spawned tab (per spawn()'s own
      // real fix — confirmed browser.js listens for real 'userscript.
      // auto-injected' events) handles its OWN real NCP connection to
      // guardian automatically. dispatchToNcpAgent (copilot/lifeline.js,
      // proven and already used elsewhere this session) sends the
      // prompt through guardian's real job system and returns the real,
      // complete response in one call — no navigate/click/type/poll
      // sequence needed at all, since guardian's own real NCP round
      // trip already does all of that inside the tab's own real DOM.
      let response = null, erosUsed = false;

      if (useEros) {
        // §FIX 2026-08-30, at 83% budget — confirmed directly, not
        // assumed: eravos/*.js (erosmancer's own real backend) has ZERO
        // webview awareness, the identical blind spot ClearDriver had.
        // useEros's own real DOM-manipulation JS (below) targets
        // document.querySelector directly against whatever tabId it's
        // given — for openBackgroundTab's real, webview-based windows,
        // that resolves to the ClearGlass SHELL's own document, not the
        // nested <webview>'s real, separate document where the actual
        // agent input box lives. It would not find a real input element
        // and would silently do nothing, which is worse than a clear
        // error — failing loud here instead of pretending to try.
        throw new Error('useEros is not currently compatible with agent-mesh spawn()\'s real, webview-based windows (eravos has no webview awareness, confirmed directly) — use the standard path (useEros: false/omitted) until this is fixed for real.');
      }

      if (!erosUsed) {
        const { dispatchToNcpAgent } = require('../../../copilot/lifeline.js');
        const result = await dispatchToNcpAgent(prompt, { provider: state.key });
        if (!result || !result.ok) {
          throw new Error(`no real agent response (provider=${state.key}) — guardian unreachable, no connected provider, or an empty response`);
        }
        response = result.text;
      }

      state.taskCount++;
      state.lastUsed = Date.now();
      state.status   = 'working';

      if (!waitForResponse) {
        return { taskId, contextId: state.contextId, status: 'sent' };
      }

      state.status = 'idle';
      state.health = Math.min(100, state.health + 5);

      // §FIX 2026-08-30 — same real gap as spawn()'s own cookie-restore
      // fix: this used this.ctxMgr.getSession(state.contextId), which
      // ctxMgr (no longer populated by spawn(), see above) would never
      // resolve. Uses the real session spawn() now stores on state
      // instead — additive, no new mechanism.
      if (this.vault && state.session) {
        state.session.cookies.get({}).then(cookies =>
          this.vault.save({ agentId: state.key, accountId: state.accountId, domain: new URL(def.url).hostname, cookies })
        ).catch(err => this.sse.emit('mesh.vault.save.error', { agentKey: state.key, error: err.message, ts: Date.now() }));
      }

      this.sse.emit('mesh.task.complete', {
        taskId, agentKey: state.key, contextId: state.contextId,
        responseSnippet: response?.slice(0, 200), erosUsed, ts: Date.now(),
      });

      // §BUILT — Phase 2, real pipeline/feedback-loop trigger. Best-effort:
      // a routing failure must never turn this already-successful task
      // into a reported error (§1.2) — routeGraph.onAgentComplete never
      // throws on its own (see that file), this is belt-and-suspenders.
      try { this._routeGraph?.onAgentComplete(state.key, response); } catch (_) {}

      // Fire NEXUS hook if registered
      await this.seam?.dispatch('mesh.response', {
        taskId, agentKey: state.key, contextId: state.contextId, response,
      }).catch(() => {});

      return { taskId, contextId: state.contextId, response, agentKey: state.key, erosUsed, preTaskSnapshotId };

    } catch (err) {
      state.status  = 'error';
      state.health  = Math.max(0, state.health - 20);

      this.sse.emit('mesh.task.error', {
        taskId, agentKey: state.key, contextId: state.contextId,
        error: err.message, preTaskSnapshotId, ts: Date.now(),
      });

      // §HOOK 2026-08-29 — the whole reason for taking preTaskSnapshotId
      // above: a failed mesh task (agent hung, wrong page, garbled DOM
      // state from a bad selector match) is exactly when a caller wants
      // to roll the tab back rather than leave it in a broken state for
      // the *next* task on this same contextId. Surfaced on the thrown
      // error itself so callers (route()'s fallback loop, copilot's tool
      // executor) can act on it without a second lookup.
      err.preTaskSnapshotId = preTaskSnapshotId;
      throw err;
    }
  }

  /**
   * _raidDecide(intent) — the real, direct HTTP call to cortex's real
   * RAID engine (GET /api/raid/decide?intent=..., confirmed directly
   * against cortex/boot.js — real query-param shape, not a guess).
   * 1200ms timeout, resolves null on any failure rather than throwing —
   * route() above already treats a null/unusable result as "fall back
   * to local logic," so a genuinely unreachable cortex degrades this
   * mesh to exactly its prior real behavior, nothing worse.
   */
  _raidDecide(intent) {
    return new Promise((resolve) => {
      const http = require('http');
      const req = http.request({
        hostname: '127.0.0.1', port: parseInt(process.env.NEXUS_PORT || '3748', 10),
        path: `/api/raid/decide?intent=${encodeURIComponent(intent)}`,
        method: 'GET', timeout: 1200,
      }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
  }

  /**
   * _dispatchViaGuardian(prompt, provider) — §CONNECT 2026-09-03, James:
   * "Connect them." Real finding before writing this: this file's own
   * send() (below) and Guardian's real /api/copilot/prompt (guardian/
   * server.js, wired through ask.js's askSync -> the same real NCP
   * channel + userscripts that already have sigma-gate/event-taxonomy/
   * SSE/health-tracking built around them) are TWO SEPARATE, independent
   * automation systems both driving claude.ai and chatgpt.com — this
   * file's AGENT_REGISTRY has its own inputSel/sendSel/respSel DOM
   * scraping for claude/chatgpt, genuinely distinct from Guardian's
   * NCP+userscript path, not two names for the same mechanism. Confirmed
   * by reading both real dispatch paths directly, not assumed.
   *
   * This does not remove either system (gemini/perplexity/mistral have
   * no Guardian userscripts yet, and this mesh's own DOM automation is
   * the only real coverage for them) — it makes Guardian the preferred
   * path for the two agents where a working, more-instrumented mechanism
   * already exists, instead of silently duplicating it. Reuses the exact
   * real HTTP pattern _raidDecide() above already established (same
   * NEXUS_PORT env convention would be a Guardian port, not cortex's —
   * see the real, distinct GUARDIAN_PORT default below).
   *
   * Resolves null on ANY failure (unreachable, non-ok, empty text) —
   * never throws — so route() below can fall through to this mesh's own
   * real DOM automation exactly as if this function didn't exist. §1.2 —
   * a Guardian outage must never be the reason a real dispatch can't be
   * attempted at all.
   */
  _dispatchViaGuardian(prompt, provider) {
    return new Promise((resolve) => {
      const http = require('http');
      const body = JSON.stringify({ prompt, provider, timeoutMs: 45000 });
      const req = http.request({
        hostname: '127.0.0.1', port: parseInt(process.env.GUARDIAN_PORT || '7820', 10),
        path: '/api/copilot/prompt', method: 'POST', timeout: 45000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let respBody = '';
        res.on('data', (c) => respBody += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(respBody);
            resolve(parsed?.ok && parsed?.text ? parsed : null);
          } catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }

  /**
   * _guardianProviders() — James: "newest version." (DA1 fix). Real,
   * confirmed gap: route()'s Guardian-first gate below used to be a
   * hardcoded `order[0] === 'claude' || order[0] === 'chatgpt'` check —
   * stale against guardian's own real coverage. docs/guardian.spec and
   * guardian/userscripts.yaml both independently confirm gemini and
   * perplexity are real, first-class, non-deprecated providers too, with
   * real userscripts and real NCP coverage — the hardcoded 2-name list
   * was never updated when that coverage grew.
   *
   * Live GET /providers (guardian/server.js:1817-1822's real handler) is
   * the actual source of truth for "which providers guardian can reach
   * right now" — reused here instead of a second, static, driftable
   * list. Same honest-degrade contract as _dispatchViaGuardian above:
   * resolves null on unreachable/timeout/malformed, never throws, so
   * route() falls through to this mesh's own DOM automation exactly as
   * if guardian didn't exist.
   */
  _guardianProviders() {
    return new Promise((resolve) => {
      const http = require('http');
      const req = http.request({
        hostname: '127.0.0.1', port: parseInt(process.env.GUARDIAN_PORT || '7820', 10),
        path: '/providers', method: 'GET', timeout: 800,
      }, (res) => {
        let body = ''; res.on('data', (c) => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
  }

  // ── RAID-style routing — best healthy agent ───────────────────────────
  async route({ prompt, preferAgent, fallbackOrder }) {
    // §BUILD 2026-08-30 — James: "raid engine and agent mesh" (a real gap
    // confirmed by reading this function directly, not assumed): despite
    // the header comment above and this method's own name, nothing here
    // ever actually called the real RAID engine (cortex's /api/raid/decide
    // — confirmed real, already used by Guardian's own dispatch via
    // _raidDecide in userscript-claude.js) — this was a separate, local
    // "RAID-style" reimplementation, not a real connection. Consults the
    // real engine first now, honestly: RAID's own real agent vocabulary
    // (ollama/guardian/claude/chatgpt, per cortex/boot.js's _raidDecide)
    // only partially overlaps this mesh's real AGENT_REGISTRY (claude/
    // chatgpt/gemini/perplexity/mistral/grok) — a decision naming an
    // agent this registry doesn't have (ollama, guardian) is a real,
    // meaningful signal in its own right, not an error, just not one
    // this specific mesh can act on directly; falls through to the
    // existing local logic in that case, not a fabricated substitution.
    let raidPreferred = null;
    if (!preferAgent) {
      try {
        const { _inferIntent } = require('../../../lib/agent-router.js');
        const intent = _inferIntent(prompt || '');
        const decision = await this._raidDecide(intent);
        if (decision?.agent && AGENT_REGISTRY[decision.agent]) {
          raidPreferred = decision.agent;
          this.sse.emit('mesh.raid.decision', { intent, agent: decision.agent, reason: decision.reason, used: true, ts: Date.now() });
        } else if (decision?.agent) {
          this.sse.emit('mesh.raid.decision', { intent, agent: decision.agent, reason: decision.reason, used: false, ts: Date.now() });
        } else {
          // §BUGFIX 2026-08-30 — real bug, caught by testing, not assumed
          // fine: _raidDecide() deliberately never throws (it resolves
          // null on any real failure, by design — route() needs a
          // non-throwing signal to fall back on). That means a genuinely
          // unreachable cortex landed here with decision === null, which
          // this if/else-if chain — both branches gated on
          // decision?.agent — silently matched neither, and the catch
          // below never runs either since nothing threw. The real
          // failure was invisible. Fixed: a real, distinct event for
          // exactly this case.
          this.sse.emit('mesh.raid.unavailable', { intent, reason: 'no decision (cortex unreachable or returned nothing usable)', ts: Date.now() });
        }
      } catch (err) {
        this.sse.emit('mesh.raid.unavailable', { error: err.message, ts: Date.now() });
      }
    }

    // §CORRECTED — an explicit preferAgent is a direct, deliberate
    // caller signal; it should win over RAID's own inferred suggestion,
    // not be silently overridden by it. RAID only matters when nothing
    // more direct was already given.
    const order = fallbackOrder || (preferAgent
      ? [preferAgent, ...Object.keys(AGENT_REGISTRY).filter(k => k !== preferAgent)]
      : raidPreferred
        ? [raidPreferred, ...Object.keys(AGENT_REGISTRY).filter(k => k !== raidPreferred)]
        : Object.keys(AGENT_REGISTRY));

    // §CONNECT 2026-09-03 — try Guardian's real, more-instrumented path
    // FIRST for the two agents it actually covers, before this mesh's
    // own duplicate DOM automation. Deliberately scoped to exactly
    // claude/chatgpt (Guardian's real, confirmed userscript coverage —
    // gemini/perplexity/mistral have none, per this same investigation),
    // and skipped entirely when fallbackOrder was explicitly given (a
    // caller naming a specific order gets exactly that order, not a
    // silently-inserted extra hop).
    if (!fallbackOrder) {
      // §FIXED — DA1: was a hardcoded `order[0] === 'claude' ||
      // order[0] === 'chatgpt'` check, stale against guardian's own real
      // provider coverage (gemini/perplexity are real too — see
      // _guardianProviders()'s own header). Now a live read of guardian's
      // actual /providers response, so newly-added real coverage is
      // picked up automatically instead of needing a second hardcoded
      // list kept in sync by hand.
      const guardianProviders = await this._guardianProviders();
      const guardianKey = guardianProviders?.providers?.[order[0]] === 'connected' ? order[0] : null;
      if (guardianKey) {
        const viaGuardian = await this._dispatchViaGuardian(prompt, guardianKey);
        if (viaGuardian) {
          this.sse.emit('mesh.guardian.dispatch', { agentKey: guardianKey, jobId: viaGuardian.jobId || null, used: true, ts: Date.now() });
          return { agentKey: guardianKey, text: viaGuardian.text, via: 'guardian', jobId: viaGuardian.jobId || null };
        }
        this.sse.emit('mesh.guardian.dispatch', { agentKey: guardianKey, used: false, reason: 'guardian unreachable, non-ok, or empty response', ts: Date.now() });
        // falls through to this mesh's own real DOM automation below —
        // never a dead end, matching _raidDecide's own honest-degrade contract.
      }
    }

    for (const agentKey of order) {
      const state = this._getBestAgent(agentKey);
      if (state && state.health >= 50 && state.status !== 'error') {
        try {
          return await this.send({ agentKey, prompt, contextId: state.contextId });
        } catch {
          continue; // Try next agent
        }
      }

      // §FOUND & FIXED 2026-09-06 — adversarial audit, James: "find
      // every problem you can... hostile attacked and verified."
      // Confirmed by direct, hostile test, not just reading: a real,
      // existing agent state with health < 50 (and status !== 'error',
      // so _getBestAgent's own filter didn't remove it) matched NEITHER
      // branch here — not the "healthy, use it" branch above, and not
      // this "spawn fresh" branch, which only ever checked `!state`.
      // send()/spawn() were both confirmed never called; route() threw
      // "All agents unavailable" even with a real, just-unhealthy agent
      // sitting right there. The comment right here ("spawn fresh if
      // none healthy") already stated the real intent — the condition
      // just never actually implemented it. Fixed: a state that exists
      // but is unhealthy or errored is treated the same as no state at
      // all for this decision, not silently skipped.
      if (!state || state.health < 50 || state.status === 'error') {
        try {
          const newState = await this.spawn(agentKey);
          return await this.send({ agentKey, prompt, contextId: newState.contextId });
        } catch {
          continue;
        }
      }
    }

    throw new Error('All agents unavailable');
  }

  // ── Queue management ──────────────────────────────────────────────────
  enqueue(task) {
    const queuedTask = {
      ...task, queuedAt: Date.now(), taskId: uuidv4(),
      // §BUILT — drain state, real from creation, not bolted on at first
      // failure — so a task's retry history is always complete, not
      // missing its own origin.
      retries: 0, strategyIdx: 0, strategyRetries: 0,
      failureLog: [], triedAgents: [],
    };
    this.queue.push(queuedTask);
    this.sse.emit('mesh.queue.add', { taskId: queuedTask.taskId, depth: this.queue.length, ts: Date.now() });
    this._drainQueue();
    return { taskId: queuedTask.taskId, position: this.queue.length };
  }

  /**
   * _drainQueue() — the real drain loop. James: "the queue needs a
   * drainer, loops it back into the queue with escalating retry and
   * diagnostic strategies each loop." A failed task is never just
   * dropped (the real, confirmed gap this replaces: the old
   * _processQueue caught route()'s error, emitted mesh.queue.error, and
   * moved on — the task's own work was gone for good on the very first
   * failure). Renamed from _processQueue for the same reason loom
   * registration insists on real names matching real behavior — this
   * loop now does meaningfully more than "process," it drains with
   * retry built in.
   */
  async _drainQueue() {
    if (this.processing || !this.queue.length) return;
    this.processing = true;

    while (this.queue.length) {
      const task = this.queue.shift();
      this.sse.emit('mesh.queue.processing', {
        taskId: task.taskId, remaining: this.queue.length,
        attempt: task.retries + 1, strategy: DRAIN_STRATEGY_ORDER[task.strategyIdx],
        ts: Date.now(),
      });

      try {
        const result = await this.route(task);
        this.sse.emit('mesh.queue.complete', { taskId: task.taskId, attempts: task.retries + 1, ts: Date.now() });
        void result; // route()'s own real result already went to whoever called route() directly; enqueue() is fire-and-forget by design (no per-task result channel exists yet — a real gap, not silently pretended away)
      } catch (err) {
        // §1.2 — a failed task is never silently dropped; _handleTaskFailure
        // owns the real decision (retry / escalate) and its own real
        // requeue path, so this loop stays a plain drain, not the policy.
        this._handleTaskFailure(task, err);
      }
    }

    this.processing = false;
  }

  /**
   * _handleTaskFailure(task, err) — real escalating-retry decision point.
   * §LAW II-equivalent for this process (clear-glass has no in-process
   * jaa — it's a separate Electron process from cortex/guardian, same
   * real boundary _raidDecide already crosses over HTTP — so escalation
   * writes the gap via cortex's real POST /api/gaps instead of a direct
   * jaa.insert; everything else about the decision is in-process and
   * synchronous).
   */
  _handleTaskFailure(task, err) {
    task.failureLog.push({ attempt: task.retries + 1, strategy: DRAIN_STRATEGY_ORDER[task.strategyIdx], error: err.message, ts: Date.now() });
    task.retries++;
    task.strategyRetries++;

    this.sse.emit('mesh.queue.error', {
      taskId: task.taskId, error: err.message, attempt: task.retries,
      strategy: DRAIN_STRATEGY_ORDER[task.strategyIdx], ts: Date.now(),
    });

    if (task.strategyRetries >= MAX_RETRIES_PER_DRAIN_STRATEGY) {
      task.strategyIdx++;
      task.strategyRetries = 0;
    }

    if (task.strategyIdx >= DRAIN_STRATEGY_ORDER.length) {
      this._escalateTask(task, err);
      return;
    }

    const strategy = DRAIN_STRATEGY_ORDER[task.strategyIdx];
    const backoffMs = DRAIN_BACKOFF_MS[task.strategyIdx] ?? DRAIN_BACKOFF_MS[DRAIN_BACKOFF_MS.length - 1];

    // Diagnostic side effect happens now, BEFORE the delayed requeue —
    // e.g. RESPAWN needs the stale agent state gone before the next
    // route() call can possibly find it again.
    this._applyDiagnostic(strategy, task);

    this.sse.emit('mesh.queue.retry', {
      taskId: task.taskId, strategy, attempt: task.retries,
      backoffMs, ts: Date.now(),
    });

    // §BUILT — never re-inject synchronously. An immediate retry on a
    // still-broken agent just re-fails in the same synchronous while()
    // pass and burns through strategy tiers with zero real diagnostic
    // value in between — the same "no delay between retransmits" trap
    // this session already flagged for DOM Sync. setTimeout also means
    // this task genuinely leaves the current drain pass; _drainQueue's
    // own `processing` guard makes calling it again always safe, whether
    // the loop is still running (queue not yet empty) or already exited.
    setTimeout(() => {
      this.queue.push(task);
      this.sse.emit('mesh.queue.requeued', { taskId: task.taskId, depth: this.queue.length, strategy, ts: Date.now() });
      this._drainQueue();
    }, backoffMs);
  }

  /**
   * _applyDiagnostic(strategy, task) — the real per-tier action, applied
   * once per escalation, not per attempt within a tier (so two RESPAWN
   * attempts in a row don't each wipe state the first one already fixed).
   * Mutates task in place (fallbackOrder, preferAgent) so the next
   * route() call picks it up naturally — no separate side-channel needed.
   */
  _applyDiagnostic(strategy, task) {
    if (task.triedAgents.length === 0 && (task.preferAgent || task.agentKey)) {
      task.triedAgents.push(task.preferAgent || task.agentKey);
    }

    if (strategy === DRAIN_STRATEGY.RETRY) {
      return; // no side effect — a plain re-attempt is the diagnostic
    }

    if (strategy === DRAIN_STRATEGY.RESPAWN || strategy === DRAIN_STRATEGY.DIAGNOSTIC) {
      // Force every real, tracked context for this task's agent(s) out of
      // this.agents so route()'s own real "spawn fresh if none healthy"
      // branch (agent-mesh.js's route()) has nothing stale left to find —
      // reuses that existing branch rather than duplicating spawn logic here.
      const targets = task.triedAgents.length ? task.triedAgents : Object.keys(AGENT_REGISTRY);
      for (const [key, state] of this.agents) {
        if (targets.includes(state.key)) this.agents.delete(key);
      }
      this.sse.emit('mesh.queue.diagnostic.respawn', { taskId: task.taskId, targets, ts: Date.now() });
    }

    if (strategy === DRAIN_STRATEGY.FALLBACK || strategy === DRAIN_STRATEGY.DIAGNOSTIC) {
      // Force a real, different agent order, excluding whatever has
      // already failed this task so far — route()'s own explicit-order
      // param wins over its preferAgent/RAID inference (see route()'s
      // own comment on that precedence), so this genuinely changes which
      // agent gets tried next rather than re-deriving the same one.
      const remaining = Object.keys(AGENT_REGISTRY).filter(k => !task.triedAgents.includes(k));
      task.fallbackOrder = remaining.length ? remaining : Object.keys(AGENT_REGISTRY);
      this.sse.emit('mesh.queue.diagnostic.fallback', { taskId: task.taskId, order: task.fallbackOrder, ts: Date.now() });
    }

    if (strategy === DRAIN_STRATEGY.DIAGNOSTIC) {
      // Last-resort forensic snapshot — attached to the task now so it
      // rides along into the gap report if this final tier still fails,
      // instead of being re-derived (possibly differently) at escalation time.
      task.diagnosticSnapshot = {
        agents: this.listAgents(), queueDepthAtFailure: this.queue.length,
        triedAgents: [...task.triedAgents], ts: Date.now(),
      };
      this.sse.emit('mesh.queue.diagnostic.snapshot', { taskId: task.taskId, ts: Date.now() });
    }
  }

  /**
   * _escalateTask(task, err) — every drain strategy exhausted (8 real
   * attempts across 4 tiers). §0.3 / §1.2 — this is never a silent drop:
   * a real gap row lands in cortex, same real table (POST /api/gaps →
   * jaaDB.insert('gaps', ...), cortex/boot.js) every other subsystem's
   * escalation uses, field names matching the canonical schema
   * (lib/node-schemas/gap.schema: body/source/domain/severity) rather
   * than lib/seam/queue.js's own slightly-drifted description/score
   * shape — new code should match the schema of record, not propagate
   * an existing drift.
   */
  _escalateTask(task, err) {
    this.sse.emit('mesh.queue.escalated', {
      taskId: task.taskId, attempts: task.retries,
      triedAgents: task.triedAgents, error: err.message, ts: Date.now(),
    });

    this._reportGap({
      type:     'mesh_task_escalated',
      domain:   'agent-mesh',
      source:   'agent-mesh-drainer',
      severity: 'high',
      body:     `Mesh task ${task.taskId} escalated after ${task.retries} attempts across all drain strategies (tried: ${task.triedAgents.join(', ') || 'none'}): ${err.message}`,
      dedup_key: `agent-mesh::mesh_task_escalated::${task.agentKey || task.preferAgent || 'unrouted'}`,
      resourceState: { taskId: task.taskId, prompt: (task.prompt || '').slice(0, 500), failureLog: task.failureLog, diagnosticSnapshot: task.diagnosticSnapshot || null },
    }).catch((reportErr) => {
      // §1.2 — a failed gap report must never be the silent end of the
      // trail; if cortex itself is unreachable, at minimum this is real,
      // visible on the SSE bus even though nothing persisted.
      this.sse.emit('mesh.queue.escalation_report_failed', { taskId: task.taskId, error: reportErr.message, ts: Date.now() });
    });
  }

  /**
   * _reportGap(fields) — real POST to cortex's /api/gaps, same host/port
   * convention as _raidDecide above (127.0.0.1:NEXUS_PORT, same 1200ms-
   * class timeout discipline) since clear-glass has no in-process jaa to
   * write to directly — this IS the real cross-process boundary, not a
   * new one invented for this feature.
   */
  _reportGap(fields) {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const data = Buffer.from(JSON.stringify(fields));
      const req = http.request({
        hostname: '127.0.0.1', port: parseInt(process.env.NEXUS_PORT || '3748', 10),
        path: '/api/gaps', method: 'POST', timeout: 2000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
      }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`cortex /api/gaps returned an unparseable body: ${e.message}`)); }
        });
      });
      req.on('error', (e) => reject(new Error(`cortex unreachable on :${process.env.NEXUS_PORT || '3748'}: ${e.code || e.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new Error('cortex /api/gaps timed out')); });
      req.write(data);
      req.end();
    });
  }

  // §REMOVED 2026-08-30 — _waitForResponse (navigate/click/type/poll,
  // driver.exec-based) is genuinely orphaned now: its one real call
  // site was replaced by dispatchToNcpAgent in send() above, which
  // returns the complete real response directly (guardian's own real
  // NCP round trip already waits for it) — no separate polling loop
  // needed. Kept, not removed silently: this comment is the real
  // record of why it's gone, for anyone who goes looking for it later.

  // ── Internals ──────────────────────────────────────────────────────────
  _getBestAgent(agentKey) {
    let best = null;
    for (const state of this.agents.values()) {
      if (state.key !== agentKey) continue;
      if (state.status === 'error') continue;
      if (!best || state.health > best.health) best = state;
    }
    return best;
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  listAgents() {
    // §BUILD 2026-08-30 — James: "update guardian plugin in clear-glass
    // with all the agent mesh and suite features." Real gap found: spawn()
    // has stored real Agent Suite constraint data (SBP8's lib/agent-
    // router.js AGENT_CONSTRAINTS — per-agent token/chunk ceilings) on
    // each agent's state since that commit, but this function never
    // included it in what callers actually see — the mesh queue panel
    // UI had no way to show it even if it wanted to. Added, not
    // reworked — health/accountId were already here and already unused
    // by the UI too, all three now real, visible data the panel can draw on.
    return [...this.agents.values()].map(s => ({
      key:         s.key,
      contextId:   s.contextId,
      accountId:   s.accountId,
      status:      s.status,
      health:      s.health,
      taskCount:   s.taskCount,
      lastUsed:    s.lastUsed,
      constraints: s.constraints,
    }));
  }

  getRegistry() { return Object.values(AGENT_REGISTRY); }
  getQueueDepth() { return this.queue.length; }
  // §BUILT — Phase 2 real route-graph accessors, thin pass-through so HTTP
  // callers (clear-glass/src/main/index.js) never reach into this._routeGraph directly.
  listRoutes() { return this._routeGraph.list(); }
  addRoute(edge) { return this._routeGraph.add(edge); }
  removeRoute(id) { return this._routeGraph.remove(id); }
  // §BUILT — automation accessors, same thin pass-through convention.
  // §0.39.265 — without the engine's memory (seen-item lists can be thousands long) or runtime-only fields
  listWorkflows() { return this._automation.list().map(({ memory, _nextRuns, ...w }) => ({ ...w, nextRunAt: this._automation.nextRunAt({ ...w, _nextRuns }) })); }
  getWorkflow(id) { return this._automation.get(id); }
  createWorkflow(fields) { return this._automation.create(fields); }
  updateWorkflow(id, patch) { return this._automation.update(id, patch); }
  removeWorkflow(id) { return this._automation.remove(id); }
  runWorkflow(id, reason, opts) { return this._automation.run(id, reason, opts); }
  get automation() { return this._automation; }
  getAutomationLog(limit, workflowId) { return this._automation.getLog(limit, workflowId); }
  addWorkflowStep(id, step) { return this._automation.addStep(id, step); }
  updateWorkflowStep(id, stepId, patch) { return this._automation.updateStep(id, stepId, patch); }
  removeWorkflowStep(id, stepId) { return this._automation.removeStep(id, stepId); }
  moveWorkflowStep(id, stepId, dir) { return this._automation.moveStep(id, stepId, dir); }

  // ── §BUILT 2026-09-19 — DOM transport for guardian's mesh-first ladder ─────────────────────────────
  // (docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec). Guardian sends jobs here; the mesh spawns/reuses
  // a deterministic tab per (provider, account), injects into the agent's chat input, watches the DOM for the
  // response, and repairs drifted selectors with DOM mapping. Built for whole code bases: async idempotent jobs,
  // bulk content attached as a file, markdown with fences preserved. See clear-glass/src/mesh/dom-transport.js.
  _dom() {
    if (this.domTransport) return this.domTransport;
    const { createDomTransport } = require('./dom-transport');
    const { createPageResolver } = require('../driver/page-resolver');
    const resolver = createPageResolver({ electron: require('electron') });
    this.domTransport = createDomTransport({
      resolvePage: async (agentId, o) => resolver.resolve(agentId, o),
      execJs: (wc, code) => wc.executeJavaScript(code, true),
      onProgress: (e) => this.sse.emit('mesh.job.progress', { ...e, ts: Date.now() }),
    });
    return this.domTransport;
  }

  // Ensure the agent's own tab exists (deterministic contextId, separate persist:mesh-* partition, vault-restored
  // cookies for that account), then queue the job. Returns at once: poll getDomJob().
  async sendViaDom({ provider, prompt, content, agentId, accountId, jobId, selectors, timeoutMs, opts }) {
    const def = AGENT_REGISTRY[provider];
    if (!def) return { accepted: false, sent: false, stage: 'no_window', error: `unknown agent: ${provider}` };
    if (!jobId) return { accepted: false, sent: false, stage: 'inject_failed', error: 'jobId required (idempotency key)' };
    const dom = this._dom();
    if (dom.getJob(jobId).known) return dom.send({ jobId, agentId });                    // repeat ask (guardian restart): never respawn/resend
    const contextId = agentId || `mesh-${provider}-${accountId || 'default'}`;
    if (!this.agents.has(contextId)) {
      try { await this.spawn(provider, { contextId, accountId }); }
      catch (e) { return { accepted: false, sent: false, stage: 'no_window', error: `could not open a tab: ${e.message}` }; }
    }
    return dom.send({ jobId, agentId: contextId, provider, prompt, content, selectors: selectors || { input: def.inputSel, send: def.sendSel, resp: def.respSel }, url: def.url, timeoutMs, opts });
  }
  getDomJob(jobId) { return this._dom().getJob(jobId); }
  async readDomJob({ jobId, selectors }) { return this._dom().read({ jobId, selectors }); }
  async diagnoseDom({ provider, agentId, accountId, stage, selectors }) {
    const def = AGENT_REGISTRY[provider];
    const contextId = agentId || `mesh-${provider}-${accountId || 'default'}`;
    return this._dom().diagnose({ agentId: contextId, url: def && def.url, selectors: selectors || {}, stage });
  }

}

module.exports = AgentMesh;
