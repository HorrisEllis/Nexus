'use strict';
/**
 * src/copilot/bridge.js — Clear Glass Co-pilot Full Integration v3
 * UUID: cg-copilot-bridge-v3-0000-0000-000000000024
 *
 * Co-pilot is fully hooked in. It can:
 *   - Call every tool in src/copilot/tools.js via the SISO bus
 *   - Dispatch jobs to Guardian (provider dispatch, SEAM, gaps)
 *   - Query Cortex (memory, CFR, RAID, gaps, event log)
 *   - Control the browser (navigate, click, type, screenshot, DOM)
 *   - Manage agents (contexts, fingerprints, mesh, providers)
 *   - Manage session state (bookmarks, rewind, cookies)
 *   - Install/toggle userscripts
 *   - Set options, run diagnostics, add URL listeners
 *
 * Routes:
 *   1. NEXUS copilot :3750/api/prompt — primary, full consciousness stream (it answers through ollama or guardian)
 *   2. When copilot is down (or "Route through NEXUS co-pilot" is off): the same two backends, directly —
 *      Ollama (ollama/ollama-runtime.js) and Guardian :7820 (/command, then /jobs?id= until the reply lands).
 *      The route decides the order: guardian first when the route is guardian, else Ollama first.
 *   §0.39.274 — James: "nexus settings are depreciated. fix it. copilot, is either ollama or guardian. no api".
 *   The paid-API fallback (an Anthropic key in Clear Glass settings) is removed: no external API is ever called.
 *
 * Tool execution:
 *   Co-pilot responses are scanned for ```driver and ```tool blocks.
 *   Each block is dispatched via the SISO bus as events.
 *   Guardian-specific tools are dispatched directly to Guardian :7820.
 *   Cortex tools are dispatched directly to Cortex :3748.
 */

const http   = require('http');
// §BUGFIX 2026-08-23 — require('node-fetch') was genuinely unguarded and
// genuinely missing (no node_modules/node-fetch, not in package.json,
// checked directly) — this crashed the whole module on load. Node 22's
// own global fetch() (confirmed present: typeof fetch === 'function')
// is the real, built-in WHATWG-compatible replacement — no require
// needed at all.
const fetch  = globalThis.fetch;
const { randomUUID } = require('crypto');
const { buildToolsPrompt, buildCompactToolsPrompt } = require('./tools');
// §0.39.278 — the pane's conversation, kept in Clear Glass's own store (sovereign; see chat-store.js)
const chatStore = require('./chat-store');

class CoPilotBridge {
  constructor({ sse, apiSettings, postEvent }) {
    this.sse         = sse;
    this.settings    = apiSettings; // ApiSettings instance — has .copilotDirectUrl(), .guardianDirectUrl() etc.
    this.postEvent   = postEvent || (() => {});

    this._busEmit    = null;  // injected by main
    this._domGet     = null;  // injected by main
    this._streamConn = null;
    this._connected  = false;

    // These are injected after bootstrap for tool execution
    this._driver     = null;
    this._bookmarks  = null;
    this._rewind     = null;
    this._vault      = null;
    this._ctxMgr     = null;
    this._userscripts= null;
    this._providerHost = null;
  }

  // ── Wire everything in after bootstrap ──────────────────────────────────
  wire({ busEmit, domGet, driver, bookmarks, rewind, vault, ctxMgr, userscripts, providerHost }) {
    this._busEmit      = busEmit;
    this._domGet       = domGet;
    this._driver       = driver;
    this._bookmarks    = bookmarks;
    this._rewind       = rewind;
    this._vault        = vault;
    this._ctxMgr       = ctxMgr;
    this._userscripts  = userscripts;
    this._providerHost = providerHost;

    this._connectStream();
    this._bridgeBrowserEvents();
    // §FIXED 2026-09-06 — James, live, from his own real running system:
    // "thought you took care of bridge man..." Real, serious miss on my
    // part during the bridge removal — I read this file's own header
    // comment ("primary, full consciousness stream" -> copilot :3750
    // directly) and wrongly concluded the whole file bypasses bridge.
    // It doesn't: _bridgeHandshake() below (removed) retried forever
    // every 10s against bridge:9999, which is gone, and _bridgeDispatch()
    // (rewritten below) was the real, live mechanism behind copilot
    // prompts, guardian commands, and ollama generation — all of it
    // routed through bridge's now-dead token handshake, meaning every
    // one of those operations was silently broken, not just noisy.
    // Fixed at the real root: clear-glass/src/api/settings.js already
    // had real, working *DirectUrl() methods (copilotDirectUrl,
    // guardianDirectUrl, ollamaDirectUrl — real distinct ports, already
    // built, just unused by this file) sitting right next to the
    // bridge-routed ones. _bridgeDispatch below now calls those
    // directly instead of relaying through bridge.
  }

  // ── Primary: send message ────────────────────────────────────────────────
  // §BUILT 2026-09-26 — per-call route (backend/agent/hat) from the CLI or
  // settings; see src/copilot/hat.js for why the hat is composed per call
  // instead of switching copilot's global agent.
  _route({ backend, agent, hat } = {}) {
    const s = this.settings.get();
    const b = ['ollama', 'copilot', 'guardian'].includes(backend) ? backend : (s.copilotBackend || 'copilot');
    return { backend: b, agent: b === 'guardian' ? (agent || s.copilotAgent || 'claude') : undefined,
      hat: typeof hat === 'boolean' ? hat : s.copilotWearHat !== false };
  }

  async send({ message, agentId = 'default', domContext, systemExtra, requestId, backend, agent, hat, noDom }) {
    const msgId = requestId || randomUUID();
    const route = this._route({ backend, agent, hat });
    this.sse.emit('copilot.thinking', { msgId, agentId, route, ts: Date.now() });

    // Live DOM context unless the caller (or the setting) turned it off
    if (!domContext && !noDom && this.settings.get().copilotDomContext !== false && this._domGet) {
      try { domContext = await this._domGet(agentId); } catch (_) {}
    }
    const persona = require('./hat').personaFor(route.hat);
    if (persona) systemExtra = persona + (systemExtra ? '\n\n' + systemExtra : '');

    // §0.39.278 — the conversation so far goes with the call, whichever backend answers (copilot, Ollama, Guardian).
    // Read BEFORE this message is stored, so the message is never repeated inside its own history.
    const remember = this.settings.get().copilotRemember !== false;
    if (remember) {
      const s0 = this.settings.get();
      let history = '';
      try { history = chatStore.historyBlock({ agentId, turns: Number(s0.copilotHistoryTurns) || 10, chars: Number(s0.copilotHistoryChars) || 4000 }); }
      catch (e) { console.warn('[CoPilot] history unavailable:', e.message); }
      if (history) systemExtra = (systemExtra ? systemExtra + '\n\n' : '') + history;
      this._remember(agentId, 'user', message);
    }

    // §0.39.280 BS17 — James: "i told it to visit google.com … nothing happened". Going to a site needs no model: the
    // browser goes there and says what is on the page. Anything asked after it ("… and what do you see") is answered
    // by the model WITH that page in hand.
    const V = require('./verbs.js');
    const intent = this._driver ? (V.archiveImportIntent(message) || V.browseIntent(message)) : null;   // §0.39.283 N30 — the archive drop box first
    if (intent) {
      const went = await this._browse(intent.url, agentId);
      if (intent.kind === 'archive-import' && went.ok) went.text = 'Opened the NEXUS archive import. Drop your release zips (or a folder) — "Check the order" first, then Import; each zip becomes a dated commit on history/snapshots.';
      if (!intent.rest || !went.ok) {
        if (remember) this._remember(agentId, 'assistant', went.text, { via: 'browser' });
        this.sse.emit('copilot.response', { msgId, agentId, text: went.text, commands: [went.command], modelUsed: 'browser', ts: Date.now() });
        return { text: went.text, commands: [went.command], results: [went.result], executed: true, msgId, route: { ...route, modelUsed: 'browser' } };
      }
      message = `${intent.rest}\n\n[you are on ${went.url} — "${went.title}". The page:\n${went.map}]`;
      domContext = null;
    }

    const result = await this._ask({ message, agentId, domContext, systemExtra, msgId, route });

    let text       = result.text || '';
    let commands   = this._parseCommands(text);
    const allCommands = [];
    const results = [];

    // Execute all tool calls — here, and only here (§FIX 2026-09-26: the
    // renderer used to run res.commands a second time via cg.driver.exec,
    // so every copilot click/type happened twice). With auto-run off the
    // commands come back unexecuted and the pane offers Run per command
    // (copilot:exec → execCommand below).
    //
    // 0.39.272 — with auto-run on, each round's RESULTS go back to copilot as the next message, until a reply
    // carries no command or settings.copilotToolRounds (default 3; 0 = one round, the old behaviour) is reached.
    // Before this the results were dropped: copilot could click but never read what the click did.
    const autoRun = this.settings.get().copilotAutoRunCommands !== false;
    const maxRounds = Number.isInteger(this.settings.get().copilotToolRounds) ? this.settings.get().copilotToolRounds : 3;
    for (let round = 0; autoRun; round++) {
      const roundResults = [];
      for (const cmd of commands) {
        if (cmd && cmd.__unreadable) {   // §0.39.280 BS17 — said, never swallowed
          roundResults.push({ tool: 'driver', ok: false, error: `${cmd.error}: ${cmd.__unreadable}` });
          this.sse.emit('copilot.tool.error', { action: 'driver', error: cmd.error, agentId });
          continue;
        }
        const label = cmd.action || cmd.name || '?';
        try {
          const r = await this._executeCommand(cmd, agentId);
          const ok = !(r && (r.ok === false || r.error));
          roundResults.push({ tool: label, ok, result: r });
          this.sse.emit('copilot.tool.result', { action: label, agentId, ok, round, ts: Date.now() });
        } catch (err) {
          console.warn(`[${new Date().toISOString()}] [clear-glass/src/copilot/bridge.js] [CoPilot] Command failed [${label}]:`, err.message);
          this.sse.emit('copilot.tool.error', { action: label, error: err.message, agentId });
          roundResults.push({ tool: label, ok: false, error: err.message });
        }
      }
      allCommands.push(...commands);
      results.push(...roundResults);
      if (!roundResults.length || round >= maxRounds) break;
      this.sse.emit('copilot.thinking', { msgId, agentId, route, round: round + 1, ts: Date.now() });
      let next;
      try {
        next = await this._ask({ message: this._formatToolResults(roundResults), agentId, domContext: null, systemExtra, msgId, route, followUp: true, direct: result.direct });
      } catch (err) { this.sse.emit('copilot.tool.error', { action: 'follow-up', error: err.message, agentId }); break; }
      text = next.text || text;
      commands = this._parseCommands(next.text || '');
      if (!commands.length) break;
    }
    if (!autoRun) allCommands.push(...commands);

    // "Nothing answered" is the bridge talking, not the assistant — it is not stored as the assistant's turn.
    if (remember && result.via !== 'none') this._remember(agentId, 'assistant', text, { via: result.via || null, model: result.modelUsed || null });

    this.sse.emit('copilot.response', {
      msgId, agentId, text, commands: allCommands,
      modelUsed:  result.modelUsed || 'unknown',
      contextLayers: result.contextLayers || 0,
      ts: Date.now(),
    });

    this._ingestToNexus({ type: 'clear-glass.copilot.exchange',
      agentId, msgId, prompt: message.slice(0, 100), ts: Date.now() });

    return { text, commands: allCommands, results, executed: autoRun, msgId, route: { ...route, modelUsed: result.modelUsed || null } };
  }

  // §0.39.280 BS17 — navigate, then read what is there (title, url, the interaction field's targets as text)
  async _browse(url, agentId) {
    const command = { action: 'navigate', url };
    let result;
    try { result = await this._driver.exec({ ...command, agentId }); }
    catch (e) { return { ok: false, command, result: { ok: false, error: e.message }, text: `Could not open ${url}: ${e.message}` }; }
    if (result && (result.ok === false || result.error)) return { ok: false, command, result, text: `Could not open ${url}: ${result.error || 'the browser refused'}` };
    let title = '', here = url, map = '';
    try { const t = await this._driver.exec({ action: 'getTitle', agentId }); title = (t && (t.title || t.result)) || ''; } catch (_) {}
    try { const u = await this._driver.exec({ action: 'getUrl', agentId }); here = (u && (u.url || u.result)) || url; } catch (_) {}
    try { const f = await this._driver.exec({ action: 'field', agentId, overlay: false }); map = f && (f.text || (f.targets ? require('../page/field.js').describe(f, { limit: 25 }) : '')) || ''; } catch (_) {}
    const text = `Opened ${title ? `"${title}" — ` : ''}${here}.${map ? `\nOn the page (numbered — say "click #3", "type into #2 …"):\n${map.split('\n').slice(0, 25).join('\n')}` : ''}`;
    return { ok: true, command, result, title, url: here, map, text };
  }

  // 0.39.272 — one compact message per round: each result as JSON, capped so a page read cannot flood the chat.
  _formatToolResults(results) {
    const cap = (v) => { const t = JSON.stringify(v); return t && t.length > 6000 ? t.slice(0, 6000) + ' …[cut ' + (t.length - 6000) + ' chars]' : t; };
    return '[tool results]\n' + results.map(r => `- ${r.tool}: ${r.ok ? 'ok' : 'FAILED'} ${cap(r.error ? { error: r.error } : r.result)}`).join('\n') +
      '\nContinue: use these results. Call another tool if needed, otherwise answer.';
  }

  /** Run one command the person confirmed from the pane (auto-run off). */
  async execCommand(cmd, agentId) {
    if (!cmd || !(cmd.action || cmd.name)) return { ok: false, error: 'command has no action (or tool name)' };
    try { return { ok: true, result: await this._executeCommand(cmd, agentId) ?? null }; }
    catch (err) { this.sse.emit('copilot.tool.error', { action: cmd.action, error: err.message, agentId }); return { ok: false, error: err.message }; }
  }

  // ── Execute a tool command via bus or direct call ──────────────────────
  async _executeCommand(cmd, agentId) {
    // 0.39.272 — a ```tool block in copilot's own format ({"name","arguments"}, copilot/tool-runtime.js) is a NEXUS
    // agent tool: run through copilot's /api/tools/run, the same gate every tool call takes. So the co-pilot in this
    // browser has every tool the co-pilot everywhere else has (the atlas, the opportunity pipeline, cortex…).
    if (cmd && !cmd.action && cmd.name) return this._runAgentTool(cmd.name, cmd.arguments || {}, agentId);
    const action = cmd.action;
    const aid    = cmd.agentId || agentId;

    this.sse.emit('copilot.tool.start', { action, agentId: aid, ts: Date.now() });

    // 0.39.272 — browser actions run on the driver and return its result (was: emitted on the bus, result unseen).
    if (this._driver && CoPilotBridge.DRIVER_ACTIONS.has(action)) {
      const { action: _a, agentId: _id, ...args } = cmd;
      return this._driver.exec({ action, agentId: aid, ...args });
    }
    if (action === 'state' || action === 'clearglass.state') return this._ipcGet(`/cli/state?agentId=${encodeURIComponent(aid)}`);
    if (action === 'readPage' || action === 'page.read') return this._ipcPost('/cli/page/read', { agentId: aid, maxText: cmd.maxText });
    if (action === 'invoke' || action === 'ipc') return this._ipcPost('/cli/invoke', { channel: cmd.channel, args: cmd.args, agentId: aid });
    if (action === 'channels') return this._ipcGet(`/cli/invoke${cmd.query ? `?q=${encodeURIComponent(cmd.query)}` : ''}`);
    if (/^(opportunity|context|learned)\./.test(action) || /\.tool$/.test(action)) {
      const map = { opportunity: 'nexus.opportunity.tool', context: 'nexus.context.tool', learned: 'clearglass.learned.tool' };
      const [ns, sub] = action.split('.');
      const { action: _a, agentId: _id, ...args } = cmd;
      return this._runAgentTool(map[ns] || action, map[ns] ? { action: sub, ...args } : args, aid);
    }

    // ── Guardian tools — direct to Guardian :7820 ──────────────────────
    if (action === 'guardian.dispatch') {
      return this._guardianDispatch(cmd);
    }
    if (action === 'guardian.providers') {
      return this._guardianFetch('/providers');
    }
    if (action === 'guardian.jobs') {
      return this._guardianFetch('/jobs');
    }
    if (action === 'guardian.seam') {
      return this._guardianFetch('/seam/queues');
    }
    if (action === 'guardian.gaps') {
      return this._guardianFetch('/gaps');
    }
    if (action === 'guardian.health') {
      return this._guardianFetch('/health');
    }

    // ── Cortex tools — direct to Cortex :3748 ─────────────────────────
    if (action === 'cortex.memory') {
      return this._cortexFetch('/api/memory', cmd);
    }
    if (action === 'cortex.gaps') {
      return this._cortexFetch('/api/gaps', cmd);
    }
    if (action === 'cortex.cfr') {
      return this._cortexFetch('/cfr/health', cmd);
    }
    if (action === 'cortex.raid') {
      return this._cortexFetch('/api/raid/health', cmd);
    }
    if (action === 'cortex.event') {
      return this._cortexPost('/api/event', cmd);
    }

    // ── Userscript tools ───────────────────────────────────────────────
    if (action === 'userscript.list') {
      return this._userscripts?.list({ agentId: aid });
    }
    if (action === 'userscript.inject' && cmd.scriptId) {
      return this._userscripts?.inject(aid, cmd.scriptId);
    }
    if (action === 'userscript.toggle' && cmd.scriptId) {
      return this._userscripts?.toggle(cmd.scriptId, cmd.enabled);
    }

    // ── Bookmark tools ─────────────────────────────────────────────────
    if (action === 'bookmarks.add') {
      const url = cmd.url || (await this._driver?.exec({ action: 'getUrl', agentId: aid }))?.url;
      return this._bookmarks?.add({ ...cmd, url, agentId: aid });
    }
    if (action === 'bookmarks.remove') {
      return this._bookmarks?.remove(cmd);
    }
    if (action === 'bookmarks.list') {
      return { bookmarks: this._bookmarks?.list({ agentId: aid, ...cmd }) };
    }
    if (action === 'bookmarks.open') {
      const bks = this._bookmarks?.list({ agentId: aid, query: cmd.query }) || [];
      if (bks.length) this._busEmit?.('driver.exec', { action: 'navigate', agentId: aid, url: bks[0].url });
      return { opened: bks[0]?.url };
    }

    // ── Rewind tools ───────────────────────────────────────────────────
    if (action === 'rewind.snapshot') {
      return this._rewind?.snapshot(aid, cmd);
    }
    if (action === 'rewind.list') {
      return { snapshots: this._rewind?.list(aid, cmd.limit || 10) };
    }
    if (action === 'rewind.restore') {
      return this._rewind?.restore({ agentId: aid, ...cmd });
    }

    // ── Cookie tools ───────────────────────────────────────────────────
    if (action === 'cookies.save') {
      const ses = this._ctxMgr?.getSession(aid);
      return this._vault?.save({ agentId: aid, accountId: cmd.accountId, domain: cmd.domain, cookies: [] });
    }
    if (action === 'cookies.restore') {
      return this._vault?.restore({ agentId: aid, accountId: cmd.accountId });
    }
    if (action === 'cookies.health') {
      const ses = this._ctxMgr?.getSession(aid);
      return this._vault?.checkTokenHealth(aid, ses);
    }

    // ── Provider tools ─────────────────────────────────────────────────
    if (action === 'provider.start' && cmd.providerId) {
      return this._providerHost?.start(cmd.providerId, { show: cmd.show ?? false });
    }
    if (action === 'provider.stop' && cmd.providerId) {
      return this._providerHost?.stop(cmd.providerId);
    }
    if (action === 'provider.list') {
      return { providers: this._providerHost?.list() };
    }

    // ── All other tools — route through SISO bus ───────────────────────
    // driver.exec actions, dom.*, context.*, mesh.*, url.listen, diag.*, options.*, window.*
    if (this._busEmit) {
      // Map action name to bus event type
      const busType = this._actionToBusEvent(action);
      this._busEmit(busType, { ...cmd, agentId: aid });
      return { dispatched: busType };
    }

    // ── Blueprint / component query ────────────────────────────────────────
    if (action === 'blueprint.query' || action === 'components.list') {
      try {
        const bi  = require('../../../lib/blueprint-index');
        const idx = bi.load();
        if (!idx) return { error: 'blueprint-index not built' };
        const q = (cmd.query || '').toLowerCase();
        if (cmd.systemId) {
          const sys = idx.systems.find(s => s.systemId === cmd.systemId);
          return sys ? { ok:true, system: sys } : { error: `system ${cmd.systemId} not found` };
        }
        const result = q
          ? idx.allCLI.filter(c => c.command.includes(q) || c.description.toLowerCase().includes(q))
          : { totalComponents: idx.totalComponents, systems: idx.systems.map(s => ({ id:s.systemId, label:s.label, port:s.port, count:s.componentCount })) };
        return { ok: true, result };
      } catch(e) { return { error: e.message }; }
    }
    if (action === 'blueprint.rebuild') {
      try {
        const bi = require('../../../lib/blueprint-index');
        const r  = bi.build();
        return { ok: r.ok, totalComponents: r.index?.totalComponents };
      } catch(e) { return { error: e.message }; }
    }

    return { skipped: action, reason: 'no handler' };
  }

  // ── 0.39.272 helpers — copilot's tool gate, and this process's own :7702 routes ─────────────────────
  async _runAgentTool(name, args, agentId) {
    this.sse.emit('copilot.tool.start', { action: name, agentId, ts: Date.now() });
    const res = await this._httpPostBridge(this.settings.copilotDirectUrl('/api/tools/run'), { name, args, agent: 'clear-glass-copilot', context: { agentId } }, 60000);
    let body = null; try { body = JSON.parse(res.body); } catch (_) {}
    if (!res.ok) return { ok: false, error: (body && body.error) || `copilot /api/tools/run HTTP ${res.status}` };
    return body && body.result !== undefined ? body.result : body;
  }
  _ipcPort() { return this.settings.get().ipcPort || parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10); }
  async _ipcGet(p) {
    const r = await this._httpGetBridge(`http://127.0.0.1:${this._ipcPort()}${p}`, 15000);
    try { return JSON.parse(r.body); } catch (_) { return { ok: false, error: `bad reply from ${p}` }; }
  }
  async _ipcPost(p, body) {
    const r = await this._httpPostBridge(`http://127.0.0.1:${this._ipcPort()}${p}`, body, 60000);
    try { return JSON.parse(r.body); } catch (_) { return { ok: false, error: `bad reply from ${p}` }; }
  }

  // ── Map action name to SISO bus event ────────────────────────────────
  _actionToBusEvent(action) {
    const map = {
      'navigate':          'driver.exec',
      'click':             'driver.exec',
      'type':              'driver.exec',
      'scroll':            'driver.exec',
      'screenshot':        'driver.exec',
      'eval':              'driver.exec',
      'waitFor':           'driver.exec',
      'back':              'driver.exec',
      'forward':           'driver.exec',
      'reload':            'driver.exec',
      'getUrl':            'driver.exec',
      'getTitle':          'driver.exec',
      'inject':            'driver.exec',
      'picker.enable':     'driver.exec',
      'picker.disable':    'driver.exec',
      'record.start':      'driver.exec',
      'record.stop':       'driver.exec',
      'network.block':     'driver.exec',
      'network.intercept': 'driver.exec',
      'storage.get':       'driver.exec',
      'storage.set':       'driver.exec',
      'dom.query':         'dom.query',
      'dom.mutate':        'dom.mutate',
      'dom.pick':          'dom.pick',
      'dom.tokens':        'dom.tokens',
      'context.create':    'context.create',
      'context.switch':    'context.switch',
      'context.list':      'status.request',
      'context.fp.switch': 'context.fp.switch',
      'mesh.spawn':        'mesh.spawn',
      'mesh.route':        'mesh.route',
      'mesh.send':         'mesh.send',
      // §BUGFIX 2026-08-29 — mesh.enqueue had no entry here, so any
      // co-pilot tool call for it fell through to this map's default
      // ('driver.exec') — a co-pilot-issued ```driver{"action":"mesh.
      // enqueue",...}``` block was being dispatched as a browser
      // automation command, not a mesh task. Silent misroute: driver.
      // exec's real gate would have just ignored the unrecognized
      // action shape rather than throwing, so this never surfaced as an
      // error, just as enqueue quietly never working via co-pilot. Now
      // added to tools.js in the same pass — see that file's own gap note.
      'mesh.enqueue':      'mesh.enqueue',
      'url.listen':        'url.listen',
      'url.listen.remove': 'url.listen.remove',
      'url.listen.list':   'status.request',
      'diag.nexus':        'diag.nexus',
      'diag.page':         'diag.page',
      'diag.run':          'diag.run',
      'window.open':       'window.open',
      'window.close':      'window.close',
      'window.hide':       'window.hide',
      'options.get':       'options.get',
      'options.set':       'options.set',
    };
    return map[action] || 'driver.exec';
  }

  // ── Build system prompt for NEXUS copilot ────────────────────────────
  // §Phase B 2026-07-20 — tool surface is now EMERGENT: fetched live from
  // orchestrator's capability-registry (a projection of component-registry),
  // so anything NEXUS builds at runtime is immediately a usable tool. Falls
  // back to the static tools.js list only if orchestrator is unreachable —
  // never leaves Co-pilot with no tools. Cached ~5s to avoid a fetch per turn.
  async _liveToolsPrompt() {
    const now = Date.now();
    if (this._toolsCache && (now - this._toolsCache.ts) < 5000) return this._toolsCache.text;
    try {
      const r = await fetch('http://127.0.0.1:9000/api/capabilities/prompt', { timeout: 2000 });
      if (r.ok) {
        const text = await r.text();
        this._toolsCache = { text, ts: now };
        return text;
      }
    } catch (_) { /* fall through to static */ }
    return buildToolsPrompt(); // static fallback — Co-pilot always has tools
  }

  async _buildCgContext(agentId, domContext) {
    const domMax = Number(this.settings.get().copilotDomMaxChars) || 3000;
    const domSection = domContext
      ? `\n\n## Live Browser DOM (Agent: ${agentId})\n\`\`\`json\n${JSON.stringify(domContext, null, 2).slice(0, domMax)}\n\`\`\``
      : '';
    // §0.39.278 — 'layered' (default): Clear Glass's own actions by name + the two layer tools; the orchestrator is not
    // asked. Its whole capability prompt on every turn was more than the local 3B model could use. 'full' keeps it.
    const toolsPrompt = this.settings.get().copilotToolSurface === 'full' ? await this._liveToolsPrompt() : buildCompactToolsPrompt();

    // 0.39.272 — said on every turn, whichever catalog answered (the orchestrator's live capability prompt predates these).
    const always = [
      'Results of every call come back to you in the next message. Read before you act: {"action":"readPage"}, then',
      'setValue/select/check/upload by the selectors it returns. {"action":"state"} shows every open tab.',
      'Anything the Clear Glass window can do: {"action":"channels","query":"window"} lists it, {"action":"invoke","channel":"…","args":{…}} runs it.',
      'Any NEXUS agent tool: ```tool {"name":"<tool>","arguments":{...}}``` — e.g. nexus.opportunity.tool (jobs, gigs, Fiverr/Upwork),',
      'nexus.context.tool (search every memory), clearglass.learned.tool (what you have learned about sites).',
    ].join('\n');
    return `## Clear Glass Browser Context
Agent ID: ${agentId}
Browser: Clear Glass — NEXUS sovereign browser (Electron/Chromium)
You are fully in control. Issue tool calls as \`\`\`driver JSON blocks.
${always}

${toolsPrompt}${domSection}`;
  }

  // ── Call NEXUS copilot — routed through Bridge :9999 ─────────────────
  async _callNexusCopilot({ message, agentId, domContext, systemExtra, msgId, route = this._route(), followUp = false }) {
    // 0.39.272 — a follow-up round (tool results going back) does not re-send the tool catalog and DOM: same session.
    const cgContext = followUp ? '## Clear Glass — tool results round (same session; tools as listed before)' : await this._buildCgContext(agentId, domContext);
    const s = this.settings.get();
    const result = await this._bridgeDispatch('copilot', 'copilot.prompt', {
      prompt:      message,
      channel:     s.copilotChannel || 'clear-glass',
      sessionId:   agentId,
      requestId:   msgId,
      source:      'clear-glass',
      systemExtra: cgContext + (systemExtra ? '\n\n' + systemExtra : ''),
      // Same per-call fields ui/tv-shell/menu.js sends to /api/prompt.
      backend:     route.backend,
      provider:    route.backend === 'guardian' ? route.agent : route.backend,
      agent:       route.agent,
    }, Number(s.copilotTimeoutMs) || 60000);
    const data = result?.response || result || {};
    return {
      text:          data.text || data.response || '',
      modelUsed:     data.modelUsed || data.provider_used || 'nexus',
      contextLayers: data.contextLayers || 0,
      fromStream:    data.fromStream || false,
    };
  }

  // ── One call: copilot, else Ollama / Guardian directly ────────────────
  // §0.39.274 — replaces the Anthropic-key fallback. Never throws: when nothing answers, the reply says which of the
  // three was tried and why each failed, so the pane shows what to start instead of a settings page that is gone.
  async _ask({ message, agentId, domContext, systemExtra, msgId, route, followUp = false, direct = null }) {
    const s = this.settings.get();
    const tried = [];
    if (!direct && s.useCortex !== false) {
      try {
        const r = await this._callNexusCopilot({ message, agentId, domContext, systemExtra, msgId, route, followUp });
        return { ...r, via: 'copilot' };
      } catch (err) {
        tried.push(`copilot :${s.copilotPort || 3750} — ${err.message}`);
        console.warn(`[${new Date().toISOString()}] [clear-glass/src/copilot/bridge.js] [CoPilot] copilot unreachable, going direct:`, err.message);
      }
    }
    // a follow-up round (tool results) stays on the backend that answered the first round
    const order = direct ? [direct] : (route.backend === 'guardian' ? ['guardian', 'ollama'] : ['ollama', 'guardian']);
    const system = (await this._buildCgContext(agentId, followUp ? null : domContext)) + (systemExtra ? '\n\n' + systemExtra : '');
    for (const b of order) {
      try {
        const r = b === 'ollama'
          ? await this._callOllamaDirect({ system, message, timeoutMs: Number(s.copilotTimeoutMs) || 60000 })
          : await this._callGuardianDirect({ system, message, agent: route.agent || s.copilotAgent || 'claude', sessionId: agentId, timeoutMs: Number(s.copilotTimeoutMs) || 60000 });
        return { ...r, via: b, direct: b };
      } catch (err) { tried.push(`${b === 'ollama' ? 'ollama' : `guardian :${s.guardianPort || 7820} (${route.agent || s.copilotAgent || 'claude'})`} — ${err.message}`); }
    }
    return {
      text: `Nothing answered. Tried:\n${tried.map(t => `• ${t}`).join('\n')}\n\nStart the copilot service (:${s.copilotPort || 3750}), or Ollama, or connect a Guardian agent — then send again.`,
      modelUsed: 'none', via: 'none',
    };
  }

  // Ollama directly — the shared runtime every NEXUS system uses (ollama/ollama-runtime.js), model from the
  // Clear Glass setting copilotOllamaModel or ollama/config.js's DEFAULT_MODEL.
  _callOllamaDirect({ system, message, timeoutMs = 60000 }) {
    const rt = require('../../../ollama/ollama-runtime.js');
    const model = this.settings.get().copilotOllamaModel || rt.DEFAULT_MODEL;
    return new Promise((resolve, reject) => {
      let text = '', done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error(`no reply in ${Math.round(timeoutMs / 1000)}s`)); } }, timeoutMs);
      rt.streamGenerate({ model, prompt: message, system, caller: 'clear-glass.copilot', max_tokens: 2048 },
        (tok) => { text += tok; },
        () => { if (done) return; done = true; clearTimeout(timer); resolve({ text, modelUsed: `ollama:${model}` }); },
        (err) => { if (done) return; done = true; clearTimeout(timer); reject(err); });
    });
  }

  // Guardian directly — POST /command (the agent in a browser tab), then GET /jobs?id= until the job finishes.
  async _callGuardianDirect({ system, message, agent, sessionId, timeoutMs = 60000 }) {
    const started = await this._bridgeDispatch('guardian', 'guardian.command', {
      provider: agent, prompt: `${system}\n\n───\n\n${message}`, sessionId: sessionId || randomUUID(), source: 'clear-glass-copilot',
    }, 15000);
    const jobId = started && (started.jobId || (started.job && started.job.id));
    if (!jobId) throw new Error(started && started.error ? started.error : 'guardian accepted nothing (no jobId)');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1000));
      let j;
      try { j = await this._guardianFetch(`/jobs?id=${encodeURIComponent(jobId)}`); } catch (_) { continue; }
      const job = j && j.job;
      if (!job) continue;
      if (job.status === 'complete') return { text: String(job.result || job.response || ''), modelUsed: `guardian:${job.provider || agent}` };
      if (job.status === 'failed' || job.status === 'error') throw new Error(job.error || job.failReason || `job ${job.status}`);
    }
    throw new Error(`job ${jobId} still running after ${Math.round(timeoutMs / 1000)}s (${agent} may have no tab open)`);
  }

  // ── Guardian — direct, not routed through Bridge (retired) ───────────
  async _guardianDispatch({ provider, prompt, sessionId }) {
    return this._bridgeDispatch('guardian', 'guardian.command', {
      provider, prompt,
      sessionId: sessionId || randomUUID(),
      source: 'clear-glass-copilot',
    }, 30000);
  }

  async _guardianFetch(path) {
    try {
      return await this._bridgeDispatch('guardian', 'guardian.fetch', { path }, 5000);
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Cortex direct calls ───────────────────────────────────────────────
  async _cortexFetch(path, params = {}) {
    try {
      const qs  = Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString() : '';
      const res = await fetch(this.settings.cortexUrl(path) + qs, { timeout: 5000 });
      return res.ok ? res.json() : { error: `Cortex ${path} failed: ${res.status}` };
    } catch (err) {
      return { error: err.message };
    }
  }

  async _cortexPost(path, body) {
    try {
      const res = await fetch(this.settings.cortexUrl(path), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), timeout: 5000,
      });
      return res.ok ? res.json() : { error: `Cortex ${path} failed: ${res.status}` };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ── Other endpoints ───────────────────────────────────────────────────
  async build({ description, sessionId, requestId }) {
    return this._bridgeDispatch('copilot', 'copilot.build', {
      description, sessionId, requestId: requestId || randomUUID(),
    }, 120000);
  }

  async diagnose({ topic, requestId }) {
    return this._bridgeDispatch('copilot', 'copilot.diagnose', {
      topic: topic || 'system health', requestId: requestId || randomUUID(),
    }, 60000);
  }

  async health() {
    try {
      return await this._bridgeDispatch('copilot', 'copilot.health', {}, 3000);
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async guardianHealth() {
    return this._guardianFetch('/health');
  }

  // ── Ollama — direct, not routed through Bridge (retired) ─────────────
  // §0.39.274 — was a POST to :3749/api/generate, a route the NEXUS ollama service does not serve (it 404'd).
  async ollamaGenerate({ model, prompt, system }) {
    const rt = require('../../../ollama/ollama-runtime.js');
    const m = model || this.settings.get().copilotOllamaModel || rt.DEFAULT_MODEL;
    return new Promise((resolve, reject) => {
      let text = '';
      rt.streamGenerate({ model: m, prompt, system: system || 'You are a helpful assistant.', caller: 'clear-glass.ollamaGenerate' },
        (t) => { text += t; }, () => resolve({ response: text, model: m }), reject);
    });
  }

  // ── Parse tool calls from response ────────────────────────────────────
  _parseCommands(text) {
    // §0.39.280 BS17 — src/copilot/verbs.js: a loose block is repaired, an unreadable one comes back as { __unreadable }
    // and is REPORTED by the round loop (was: catch (_) {} — the pane said "sent" and nothing ran)
    return require('./verbs.js').parseCommands(text);
  }

  // §BUG FIXED 2026-07-11 — three debugging rounds (2026-06-30 x3) each
  // disproved the previous theory with real evidence, ending in a
  // diagnostic fallback that finally proved it conclusively: fetch()
  // fails against bridge:9999 specifically (ERR_STREAM_PREMATURE_CLOSE,
  // undici's strict HTTP/1.1 parser reacting to how this particular
  // server closes connections), while http.request() against the exact
  // same URL/payload succeeds every time — confirmed live in the
  // 2026-07-11 boot log ("http.request FALLBACK succeeded where fetch()
  // failed — status 200"). That log's own conclusion: "Real fix: switch
  // this function to http.request permanently." This is that fix,
  // extracted once so both bridge call sites use it instead of trying
  // fetch() first and eating the failure's latency/log noise every time.
  _httpPostBridge(url, payload, timeoutMs = 5000, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const body = JSON.stringify(payload);
      const u = new URL(url);
      const req = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...extraHeaders },
        timeout: timeoutMs,
      }, r => {
        let buf = ''; r.on('data', c => buf += c);
        r.on('end', () => resolve({ status: r.statusCode, ok: r.statusCode >= 200 && r.statusCode < 300, body: buf }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('http.request timeout')); });
      req.write(body); req.end();
    });
  }

  // §FIXED 2026-09-06 — _bridgeHandshake and _httpPostBridgeAuthed both
  // removed entirely (see wire()'s own comment above for the full
  // finding). _httpPostBridgeAuthed only ever existed to attach the
  // bridge-issued token to a request; with bridge gone and dispatch
  // below calling each real target directly, nothing needs that token
  // anymore.
  // This GET helper is new — every real dispatch before this fix was
  // POST-only
  // (routed through bridge's own single /bridge/request shape), but a
  // direct call to copilot's real /health needs a real GET.
  _httpGetBridge(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const u = new URL(url);
      const req = http.request({
        hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET',
        timeout: timeoutMs,
      }, r => {
        let buf = ''; r.on('data', c => buf += c);
        r.on('end', () => resolve({ status: r.statusCode, ok: r.statusCode >= 200 && r.statusCode < 300, body: buf }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('http.request timeout')); });
      req.end();
    });
  }

  // §FIXED 2026-09-06 — _bridgeHandshake removed entirely (see wire()'s
  // own comment above for the full finding). It only ever existed to
  // obtain a token _bridgeDispatch needed to talk to bridge — with
  // bridge gone and dispatch now calling each real target directly,
  // there is nothing left for a token to authorize.

  // ── Direct dispatch — calls each real target directly, no bridge ─────
  // Real endpoint map, checked directly against each system's own real
  // routes rather than guessed: copilot's /api/prompt, /api/build,
  // /api/diagnose, /health (all confirmed live in copilot/server.js);
  // guardian's /command (confirmed live in guardian/server.js);
  // ollama's /api/generate (Ollama's own real, standard REST API,
  // independent of anything NEXUS-specific).
  _directTargetFor(target, type) {
    const map = {
      'copilot:copilot.prompt':    { url: this.settings.copilotDirectUrl('/api/prompt'),   method: 'POST' },
      'copilot:copilot.build':     { url: this.settings.copilotDirectUrl('/api/build'),    method: 'POST' },
      'copilot:copilot.diagnose':  { url: this.settings.copilotDirectUrl('/api/diagnose'), method: 'POST' },
      'copilot:copilot.health':    { url: this.settings.copilotDirectUrl('/health'),        method: 'GET'  },
      'guardian:guardian.command': { url: this.settings.guardianDirectUrl('/command'),      method: 'POST' },
      'ollama:ollama.generate':    { url: this.settings.ollamaDirectUrl('/api/generate'),   method: 'POST' },
    };
    return map[`${target}:${type}`] || null;
  }

  async _bridgeDispatch(target, type, payload, timeout = 30000) {
    if (target === 'guardian' && type === 'guardian.fetch') {
      // guardian.fetch's own real path comes from payload.path, not a
      // fixed map entry — same real guardianDirectUrl(), just a
      // caller-supplied path instead of one baked into the map above.
      const res = await this._httpGetBridge(this.settings.guardianDirectUrl(payload.path), timeout);
      if (!res.ok) throw new Error(`[Guardian] ${payload.path} HTTP ${res.status}`);
      return JSON.parse(res.body);
    }
    const dest = this._directTargetFor(target, type);
    if (!dest) throw new Error(`[CoPilot] no known direct route for ${target}:${type}`);

    const res = dest.method === 'GET'
      ? await this._httpGetBridge(dest.url, timeout)
      : await this._httpPostBridge(dest.url, payload, timeout);
    if (!res.ok) {
      let detail = '';
      try { const errBody = JSON.parse(res.body); detail = errBody?.errors?.join('; ') || errBody?.error || ''; } catch (_) {}
      throw new Error(`[${target}] ${type} HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
    }
    const data = JSON.parse(res.body);
    return data.result?.response ?? data.result ?? data;
  }

  // ── NEXUS copilot stream connection ───────────────────────────────────
  _connectStream() {
    const copilotPort = this.settings.get().copilotPort || 3750;
    const connect = () => {
      try {
        const req = http.request({
          hostname: '127.0.0.1', port: copilotPort,
          path: '/events', headers: { Accept: 'text/event-stream' },
        }, res => {
          this._connected = true;
          this.sse.emit('copilot.stream.connected', { port: copilotPort, ts: Date.now() });
          let buf = '';
          res.on('data', chunk => {
            buf += chunk.toString();
            const parts = buf.split('\n\n');
            buf = parts.pop() || '';
            for (const part of parts) {
              const line = part.split('\n').find(l => l.startsWith('data:'));
              if (!line) continue;
              try {
                const ev = JSON.parse(line.slice(5));
                this.sse.emit(`nexus.copilot.${ev.type || 'event'}`, ev.payload || ev);
              } catch (_) {}
            }
          });
          res.on('end', () => { this._connected = false; setTimeout(connect, 3000); });
        });
        req.on('error', () => { this._connected = false; setTimeout(connect, 5000); });
        req.end();
        this._streamConn = req;
      } catch (_) { setTimeout(connect, 5000); }
    };
    setTimeout(connect, 2000);
  }

  // ── Bridge browser events into copilot consciousness ──────────────────
  _bridgeBrowserEvents() {
    try {
      const { on: busOn } = require('../core/bus');
      const forward = (type) => {
        busOn(type, (event) => {
          this._ingestToNexus({ type: `clear-glass.${type}`, ...event.data, ts: Date.now() });
        });
      };
      ['nav.loading', 'nav.loaded', 'driver.result', 'driver.error',
       'dom.tokens.result', 'url.match', 'mesh.task.complete', 'mesh.error',
       'diag.complete', 'context.created', 'provider.host.started',
       'bookmarks.added', 'rewind.snapshotted', 'cookie.health.result',
       // 0.39.279 — the interaction field: NEXUS's nerve sees what an agent mapped and pointed at, as it happens
       'field.map', 'field.spotlight'].forEach(forward);
    } catch (_) {}
  }

  _ingestToNexus(event) {
    const copilotPort = this.settings.get().copilotPort || 3750;
    try {
      const body = JSON.stringify(event);
      const req  = http.request({
        hostname: '127.0.0.1', port: copilotPort,
        path: '/api/stream/ingest', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 2000,
      });
      req.on('error', () => {});
      req.write(body); req.end();
    } catch (_) {}
  }

  clearHistory(agentId) {
    this._ingestToNexus({ type: 'clear-glass.copilot.history.cleared', agentId, ts: Date.now() });
  }

  // ── The pane's kept conversation (§0.39.278) ────────────────────────────
  // Stored in Clear Glass's own JAA store (chat-store.js) and mirrored into the download manager's chat ledger
  // (src/downloads/chat-ledger.js), so the pane's conversation is listed and recoverable next to every provider chat.
  _remember(agentId, role, text, extra = {}) {
    let row = null;
    try { row = chatStore.append({ agentId, role, text, ...extra }); }
    catch (e) { console.warn('[CoPilot] could not keep the turn:', e.message); return null; }
    if (row) {
      try {
        require('../downloads/chat-ledger').appendTurn({ provider: 'copilot', chatId: row.conversationId, agentId,
          role, text: row.text, via: extra.via || null, final: true, source: 'copilot-pane' });
      } catch (_) { /* the ledger is a second copy — the pane's own store already has the turn */ }
    }
    return row;
  }

  /** conversation(agentId) -> { conversationId, turns } — what the pane renders when it opens. */
  conversation(agentId = 'default', limit = 100) { return chatStore.list({ agentId, limit }); }

  /** newConversation(agentId) -> the new conversation id; the previous one stays stored (/new). */
  newConversation(agentId = 'default') {
    const id = chatStore.startNew(agentId);
    this.clearHistory(agentId);
    return { conversationId: id };
  }
}

// 0.39.272 — the driver's own vocabulary (driver/index.js _dispatch). An action in this set runs on the driver and
// its result comes back.
CoPilotBridge.DRIVER_ACTIONS = new Set([
  'navigate', 'click', 'type', 'setValue', 'select', 'check', 'upload', 'pressKey', 'scroll', 'hover', 'wait', 'waitFor',
  'screenshot', 'toast', 'eval', 'zoom', 'findInPage', 'stopFindInPage', 'print', 'getUrl', 'getTitle', 'back', 'forward',
  'reload', 'cookies.get', 'cookies.set', 'cookies.clear', 'storage.get', 'storage.set', 'network.block',
  'network.intercept', 'picker.enable', 'picker.disable', 'inject', 'record.start', 'record.stop', 'readPage',
  'field', 'fieldOff', 'at', 'spotlight', 'pointer',   // 0.39.279 — the interaction field (src/page/field.js)
]);

module.exports = CoPilotBridge;
