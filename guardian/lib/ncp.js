'use strict';
/**
 * lib/ncp.js — NEXUS Channel Protocol
 * UUID: nexus-ncp-v1-0000-4000-0000-000000000001
 *
 * Replaces WebSocket (ws package) entirely.
 * Zero external dependencies. Built on Node's http module only.
 *
 * Architecture:
 *   Server → Client  :  SSE (EventSource in browser, long-held GET)
 *   Client → Server  :  fetch() POST (already works from https:// pages to localhost)
 *
 * Why this works from https:// pages:
 *   Browsers allow fetch() to localhost from any origin under the
 *   Private Network Access spec. No TLS needed for localhost.
 *   EventSource follows the same rule.
 *   WebSocket was the only thing that required TLS because it upgraded
 *   from HTTPS to WSS — that upgrade required matching TLS.
 *   SSE is a plain HTTP GET that stays open. No upgrade. No TLS required.
 *
 * Channel lifecycle:
 *   1. Client opens GET /channel?provider=claude&tabId=XYZ
 *   2. Server registers client in NCP_CLIENTS map
 *   3. Server sends: data: {"type":"NCP_READY","provider":"claude"}\n\n
 *   4. Client posts results to POST /result
 *   5. Server closes SSE on client disconnect or explicit close
 *
 * Equivalent to the old WSS protocol:
 *   GUARDIAN_JOB        → NCP writes to SSE channel
 *   GUARDIAN_READY      → NCP_READY event on open
 *   GUARDIAN_CLAIM      → NCP_CLAIM event on SSE
 *   GUARDIAN_HEARTBEAT_ACK → response body of POST /heartbeat
 *   GUARDIAN_REGISTER   → GET /channel query params
 *   GUARDIAN_DELIVERED  → POST /result { type:'NCP_DELIVERED', ... }
 *   GUARDIAN_COMPLETE   → POST /result { type:'NCP_COMPLETE', ... }
 *   GUARDIAN_CHUNK      → POST /result { type:'NCP_CHUNK', ... }
 *   GUARDIAN_ARTIFACT   → POST /result { type:'NCP_ARTIFACT', ... }
 *   GUARDIAN_ERROR      → POST /result { type:'NCP_ERROR', ... }
 */

const { randomUUID } = require('crypto');

// ── Server-side NCP handler ───────────────────────────────────────────────────

function createNCPServer({ onMessage, onConnect, onDisconnect, busEmit } = {}) {
  // provider → { res, tabId, provider, connectedAt, lastHeartbeat }
  const _clients = new Map();
  // §FIXED 2026-09-15, REVISED — James: "it doubles every time." Real
  // cause, traced not guessed: dispatch (guardian/lib/dispatcher.js)
  // called ncp.push(provider, ...), which BROADCASTS to every client
  // registered for that provider — that's the actual doubling, not the
  // connection registry. First version of this fix force-closed
  // whichever client wasn't newest on connect, which regressed hard:
  // when two clients for one provider are BOTH genuinely alive (clear-
  // glass's pre-warm can legitimately overlap the real tab briefly,
  // especially mid-autopilot-restart under memory pressure), closing
  // one's socket just makes it reconnect and close the other in turn —
  // confirmed live, both tabIds flapping "3 disconnects within 60s"
  // simultaneously. Correct, narrower fix: track which client is
  // CURRENT for dispatch purposes only. Never touch the older socket —
  // let clear-glass's own lifecycle decide when it actually dies.
  // provider → key of the most recently connected client.
  const _activeByProvider = new Map();

  // §FIXED 2026-08-17 — James, direct: "the ncp tabs aren't connected...
  // this is vital." Traced a real, separate contributing bug beyond the
  // GM_setValue fix: isConnected() (below) only ever checked whether a
  // registry ENTRY existed for a provider, never whether that entry's
  // real lastHeartbeat was recent. A tab that silently freezes (JS stops
  // running, but the underlying SSE socket hasn't technically closed —
  // real, common failure mode, not theoretical) stays marked "connected"
  // forever. That's the exact shape of the real error already seen:
  // "chatgpt's tab didn't ack within the timeout... but that agent may
  // not actually be reachable right now" — isConnected() said true, the
  // real tab was dead.
  //
  // The fix pattern is real prior art, not invented fresh: the OLD
  // Guardian extension (Guardian-clean-17.zip, a genuinely different
  // product — a multi-device mesh network, not this system's tab-to-
  // server NCP) had a real, working session/heartbeat/staleness pattern
  // in its own handshake.js (SESSION_TTL_MS, a periodic prune, a
  // healthy: (now - lastSeen) < 30_000 check). That specific number and
  // shape is reused here — not the mesh/AppID system around it, which
  // solves a different, unrelated problem — because a real heartbeat
  // every 8000ms (guardian/userscript-claude.js's own HB_MS) means 30s
  // is a real, sane multiple that tolerates network jitter without
  // false-evicting a genuinely healthy connection.
  const STALE_MS = 30_000;
  function _isStale(client) { return (Date.now() - client.lastHeartbeat) > STALE_MS; }

  // §1.2 — SSE write helper. try/catch: never crash on broken pipe.
  // §FIXED 2026-09-06 — James, live: "when switching agents to chatgpt,
  // it doesnt even connect to the ncp anymore. it routes to it. but
  // doesnt do anything beyond that." Traced this to its real root cause
  // from an actual boot log: guardian created and dispatched a real
  // /ping job to chatgpt (job 8d24a3ab), logged "dispatched ... via
  // NCP", and that job never completes anywhere in the log — no ack, no
  // error, nothing. Ever. Traced why: this function swallowed ANY
  // res.write() failure silently (correct intent — a broken pipe must
  // never crash guardian — but with zero way for a caller to tell "the
  // write actually reached a live client" apart from "the client's
  // socket was already dead and the write silently no-op'd"). push()
  // below counted every attempt as a success regardless of whether this
  // returned true. Returns the real outcome now so callers can finally
  // tell the difference.
  // §FOUND & FIXED 2026-09-06 — adversarial audit, James: "find every
  // problem you can... hostile attacked and verified." Hostile test: a
  // circular-reference payload passed to push() reported sent:0 —
  // byte-identical to a genuinely dead client. JSON.stringify(data) was
  // inside the SAME try/catch as res.write() itself, so a stringify
  // failure (a real programming bug — bad payload shape somewhere
  // upstream) was indistinguishable from a real broken pipe. Given
  // dispatcher.js's own real fix treats sent:0 as "provider
  // unreachable, requeue" (0.39.51), a bad payload would be silently
  // misdiagnosed as "the provider is offline" and requeued forever —
  // never surfacing the actual bug to anyone. Fixed by stringifying
  // OUTSIDE the broken-pipe try/catch: a stringify failure now throws
  // for real (a genuine caller bug should be loud), while res.write()
  // itself still degrades honestly on a real dead socket.
  function _write(res, data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`; // throws for real on bad data — never silently mistaken for a dead client
    try { res.write(payload); return true; } catch(_) { return false; }
  }

  /**
   * Handle GET /channel — opens SSE channel for this provider tab.
   * Call from your HTTP request handler when url.pathname === '/channel'.
   */
  function handleChannel(req, res, url) {
    const provider = url.searchParams.get('provider') || 'unknown';
    const tabId    = url.searchParams.get('tabId')    || randomUUID();
    const key      = `${provider}:${tabId}`;

    // SSE headers — no TLS, no ws package, just HTTP
    if (res.headersSent) return { provider, tabId, key };
    res.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering':           'no',
    });
    res.flushHeaders();

    // Close stale connection if same key reconnects
    const stale = _clients.get(key);
    if (stale && stale.res !== res) {
      try { stale.res.end(); } catch(_) {}
      _clients.delete(key);
    }
    // §FIXED 2026-09-15, REVISED — for a DIFFERENT tabId under the SAME
    // provider (the pre-warm/spawn overlap). Only marks which client is
    // CURRENT for dispatch; does NOT close whatever held the slot
    // before. See this file's own header comment on why — closing a
    // possibly-still-live socket here is what caused the flapping
    // regression. If the prior connection really is dead, its own
    // req.on('close') (below) or the staleness sweep will retire it on
    // its own real timeline, not forced by a new arrival.
    _activeByProvider.set(provider, key);
    const client = { res, tabId, provider, connectedAt: Date.now(), lastHeartbeat: Date.now() };
    _clients.set(key, client);

    // Send ready event
    res.write(`data: ${JSON.stringify({ type: 'NCP_READY', provider, tabId, ts: Date.now() })}\n\n`);

    busEmit?.('ncp.client.connected', { provider, tabId, key }, 'INFO');
    onConnect?.({ provider, tabId, key });

    // §23.12 — RACE FIX: this used to be req.on('close', () => { _clients.
    // delete(key); ... }) unconditionally. Sequence that breaks it: tab
    // reconnects (new req/res, same key) → handleChannel runs, sets
    // _clients[key] = newClient → OLD request's close event fires shortly
    // after (network teardown is async, doesn't happen the instant a new
    // request starts) → unconditional delete(key) removes the NEW client,
    // not the old one, because delete-by-key doesn't check which value is
    // there. Server now thinks a connection that's actually live and
    // healthy just disconnected. Client sees the resulting state mismatch,
    // reconnects again, and the same race can repeat — this is what
    // "flickering" actually was. Fix: only delete if the entry currently
    // stored under this key is still THIS connection's own client object.
    req.on('close', () => {
      const current = _clients.get(key);
      if (current && current.res === res) {
        _clients.delete(key);
        if (_activeByProvider.get(provider) === key) _activeByProvider.delete(provider);
        busEmit?.('ncp.client.disconnected', { provider, tabId, key }, 'INFO');
        onDisconnect?.({ provider, tabId, key });
      }
      // else: stale connection's own teardown firing after it was already
      // superseded and explicitly closed above (line 77) — not this
      // connection's job to touch the registration anymore.
      _trackFlap(key);
    });

    return { provider, tabId, key };
  }

  // §23.12 — flapping detector. Not trying to auto-fix every future cause
  // of instability with an LLM guess — that's the diagnose-without-repair
  // anti-pattern from earlier this build. This detects the SYMPTOM (rapid
  // connect/disconnect cycling on one key) and raises a loud, specific gap
  // with the actual recent history attached, so whatever caused it — this
  // race (now fixed), a flaky network, browser tab throttling, whatever
  // shows up next — gets surfaced with real evidence instead of silence.
  const FLAP_WINDOW_MS  = 60_000;
  const FLAP_THRESHOLD  = 3; // 3+ disconnects for the same key within the window
  const _flapHistory = new Map(); // key -> [timestamps]
  function _trackFlap(key) {
    const now = Date.now();
    const hist = (_flapHistory.get(key) || []).filter(t => now - t < FLAP_WINDOW_MS);
    hist.push(now);
    _flapHistory.set(key, hist);

    // Every individual disconnect gets logged — this is what the predicate
    // in lib/gap-predicate.js's ncp_connection_flapping entry actually
    // checks (recent rows here, scoped by queue_uuid===key), not just a
    // counter in memory that resets on restart.
    try {
      const { jaaDB, uid } = require('../../cortex/memory/jaa-db');
      jaaDB.insert('event_log', { uuid: uid(), type: 'ncp.flap', queue_uuid: key, source: 'lib/ncp.js', ts: now });
    } catch (_) {}

    if (hist.length >= FLAP_THRESHOLD) {
      _flapHistory.set(key, []); // reset so this doesn't re-fire every single disconnect once over threshold
      try {
        const gp = require('../../intelligence/gap/predicate');
        const { jaaDB, uid } = require('../../cortex/memory/jaa-db');
        const { enriched_gap, existing_uuid } = gp.enrichGap({
          type: 'ncp_connection_flapping', path: key, severity: 'high',
          body: `${hist.length} disconnects for ${key} within ${FLAP_WINDOW_MS/1000}s`,
          source: 'lib/ncp.js', createdAt: now,
        });
        if (!existing_uuid && enriched_gap) {
          jaaDB.insert('gaps', { uuid: uid(), ...enriched_gap, status: 'open', detectedAt: now });
        }
        // existing_uuid case: enrichGap() already incremented recurrence_count
        // and appended evidence on the existing open gap internally — nothing
        // further to do here, that IS the dedup behavior working correctly.
      } catch (_) {}
      try {
        require('../../lib/component-ledger').write({
          system: 'guardian', component: 'guardian.ncp', action: 'connection_flapping',
          status: 'high', tags: [key], detail: `${hist.length} disconnects within ${FLAP_WINDOW_MS/1000}s`,
          causedBy: null,
        });
      } catch (_) {}
      console.warn(`[ncp] §FLAPPING ${key} — ${hist.length} disconnects within ${FLAP_WINDOW_MS/1000}s`);
    }
  }

  /**
   * Handle POST /result — receives messages from the browser.
   * Call from your HTTP request handler when url.pathname === '/result'.
   */
  function handleResult(req, res, readBody) {
    // §1.2 — guard against double-response (ERR_HTTP_HEADERS_SENT)
    if (res.headersSent) return true;
    readBody(req).then(body => {
      if (res.headersSent) return;  // race: already answered
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ ok: true }));
      if (body.type) {
        busEmit?.('ncp.message.received', { type: body.type, provider: body.provider }, 'DEBUG');
        // §FIX 2026-09-22 — James: "creates the job, dispatches the job,
        // gets the acknowledgment but no completion." onMessage() runs
        // AFTER res.end() above — the response is already sent, so the
        // .catch() below's `if (res.headersSent) return;` guard was
        // ALWAYS true by the time an exception from onMessage (guardian/
        // lib/ncp-handler.js's _handleNCPMessage) reached it: silently
        // swallowed, no log, nothing. The real completion pipeline is now
        // internally guarded (see ncp-handler.js's own 2026-09-22 fix) so
        // this should no longer fire in practice — kept as the real,
        // logged last resort rather than trusting that alone.
        try { onMessage?.(body); }
        catch (e) { console.error(`[guardian NCP] onMessage threw for a real ${body.type} message (jobId=${body.jobId || 'unknown'}) — was previously silent: ${e.message}`); }
      }
    }).catch(e => {
      if (res.headersSent) return;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    });
    return true;
  }

  /**
   * Handle POST /stream/:jobId — continuous token stream from ollama-ncp.
   * Each call is one token. Emits ncp.stream.chunk on the bus.
   */
  function handleStream(req, res, readBody, jobId) {
    if (res.headersSent) return true;
    readBody(req).then(body => {
      if (res.headersSent) return;
      res.writeHead(200, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
      res.end(JSON.stringify({ ok:true, seq: body.seq }));
      busEmit?.('ncp.stream.chunk', {
        jobId, token: body.token||'', done: body.done||false,
        seq: body.seq||0, provider: body.provider||'ollama-ncp',
        tabId: body.tabId, ts: body.ts||Date.now(),
      }, 'STREAM');
      if (body.done) {
        onMessage?.({ type:'NCP_COMPLETE', jobId, provider:body.provider||'ollama-ncp',
          result:null, streaming:true, seq:body.seq });
      }
    }).catch(e => {
      if (res.headersSent) return;
      res.writeHead(400, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ ok:false, error:e.message }));
    });
    return true;
  }

  /**
   * Handle POST /heartbeat — provider heartbeat.
   * Returns ACK with server timestamp. Replaces GUARDIAN_HEARTBEAT over WSS.
   */
  function handleHeartbeat(req, res, readBody) {
    if (res.headersSent) return true;
    readBody(req).then(body => {
      if (res.headersSent) return;
      const { provider, tabId, ts, usage, chatId, claimed } = body;
      const key = `${provider}:${tabId}`;
      const client = _clients.get(key);
      if (client) {
        client.lastHeartbeat = Date.now();
        if (usage) client.usage = usage; // §US-GAP-01 — last-known usage/quota-limit state from the userscript
        if (chatId !== undefined) client.chatId = chatId;
        if (claimed !== undefined) client.claimed = claimed;
        // §FIXED 2026-09-15 — graceful failover for the active-per-
        // provider pointer (see the §FIXED note by _activeByProvider's
        // declaration for why nothing here force-closes a socket): if
        // whichever client was CURRENT for this provider has gone away
        // (disconnected, or its entry no longer exists) and THIS client
        // is still alive and heartbeating, it becomes current. Keeps
        // dispatch always aimed at a real, live client without ever
        // needing to kill another one to get there.
        const activeKey = _activeByProvider.get(provider);
        if (activeKey !== key && !_clients.has(activeKey)) _activeByProvider.set(provider, key);
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({
        type: 'NCP_HEARTBEAT_ACK',
        ts: Date.now(),
        serverTs: Date.now(),
        latency: ts ? Date.now() - ts : null,
      }));
    }).catch(() => {
      res.writeHead(200); res.end('{}');
    });
    return true;
  }

  // ── Push to clients ─────────────────────────────────────────────────────────

  /**
   * Push a message to a specific provider.
   * Equivalent to send(ws, { type, ...data }) in the old WSS system.
   */
  function push(provider, data) {
    let sent = 0;
    for (const [key, client] of _clients) {
      if (client.provider === provider) {
        // §FOUND & FIXED 2026-09-06 — _write() now throws for real on a
        // genuinely bad payload (see its own comment above) rather than
        // silently reporting it as a dead client — but that means THIS
        // caller must not let a real caller bug crash the whole process
        // either. Caught here, reported loudly and distinctly (a real,
        // separate event from a normal disconnect), never silently
        // swallowed and never fatal.
        try {
          if (_write(client.res, data)) sent++;
        } catch (e) {
          busEmit?.('ncp.push.bad_payload', { provider, tabId: client.tabId, error: e.message }, 'ERROR');
          console.error(`[ncp] push('${provider}', ...) — bad payload, not a dead client: ${e.message}`);
        }
      }
    }
    return sent;
  }

  /**
   * §NEW 2026-09-15 — the real fix for "it doubles every time." push()
   * above broadcasts to EVERY client for a provider — correct for
   * things that genuinely should reach every tab (ledger writes, DOM-
   * map requests), wrong for dispatching a single job, which used
   * push() too and so fanned out to both a real tab and a pre-warmed
   * or overlapping one, producing doubled dispatch/acks/completion.
   * pushActive sends to exactly the one client currently tracked as
   * CURRENT for this provider (_activeByProvider, kept correct by
   * handleChannel on connect and handleHeartbeat's failover — see
   * their own §FIXED notes) — never more than one, and never by force-
   * closing anything else to get there. Returns 0/1, not a count, so a
   * caller checking `sent === 0` (the existing "stale socket" queued-
   * retry path) keeps working unchanged.
   */
  function pushActive(provider, data) {
    const key = _activeByProvider.get(provider);
    if (!key) return 0;
    const client = _clients.get(key);
    if (!client) return 0;
    try {
      return _write(client.res, data) ? 1 : 0;
    } catch (e) {
      busEmit?.('ncp.push.bad_payload', { provider, tabId: client.tabId, error: e.message }, 'ERROR');
      console.error(`[ncp] pushActive('${provider}', ...) — bad payload, not a dead client: ${e.message}`);
      return 0;
    }
  }

  /**
   * Push to a specific tab.
   */
  function pushTab(provider, tabId, data) {
    const key = `${provider}:${tabId}`;
    const client = _clients.get(key);
    if (!client) return false;
    // §FOUND & FIXED 2026-09-06 — same real fix as push() above: a bad
    // payload must be reported loudly, never crash the caller.
    try {
      return _write(client.res, data);
    } catch (e) {
      busEmit?.('ncp.push.bad_payload', { provider, tabId, error: e.message }, 'ERROR');
      console.error(`[ncp] pushTab('${provider}', '${tabId}', ...) — bad payload, not a dead client: ${e.message}`);
      return false;
    }
  }

  /**
   * Broadcast to all connected clients.
   * Equivalent to broadcast() in the old WSS system.
   */
  function broadcast(data) {
    for (const client of _clients.values()) {
      // §FOUND & FIXED 2026-09-06 — same real fix: one bad payload must
      // never abort a broadcast partway through the client list, and
      // must never crash the process.
      try { _write(client.res, data); }
      catch (e) {
        busEmit?.('ncp.push.bad_payload', { provider: client.provider, tabId: client.tabId, error: e.message }, 'ERROR');
        console.error(`[ncp] broadcast(...) — bad payload, not a dead client: ${e.message}`);
      }
    }
    return _clients.size;
  }

  /**
   * Check if a provider is connected.
   * Equivalent to PROVIDERS[provider] !== null in the old WSS system.
   */
  function isConnected(provider) {
    for (const [key, client] of _clients) {
      if (client.provider !== provider) continue;
      if (_isStale(client)) {
        // Found while checking, not just skipped — evict it here too, not
        // only in the periodic sweep, so a check that happens to run
        // between sweeps still gets the real, current answer immediately.
        _clients.delete(key);
        busEmit?.('ncp.client.stale', { provider, tabId: client.tabId, key, lastHeartbeat: client.lastHeartbeat }, 'WARN');
        onDisconnect?.({ provider, tabId: client.tabId, key, reason: 'stale' });
        continue;
      }
      return true;
    }
    return false;
  }

  // §FIXED 2026-08-17 — periodic sweep, same real reasoning as the old
  // Guardian's own session prune (handshake.js's setInterval, 120_000ms
  // there for a 5-minute session TTL; here 15_000ms for a 30s staleness
  // threshold, roughly the same "check at ~1/4 to 1/8 the TTL" ratio).
  // Without this, a provider nobody ever calls isConnected() for again
  // stays in _clients forever even after going stale — the inline check
  // above only fires on an actual lookup.
  const _staleSweep = setInterval(() => {
    for (const [key, client] of _clients) {
      if (!_isStale(client)) continue;
      // §FIX 2026-09-03 — James: "build what gets the pipeline working."
      // Traced this several turns back and never patched it: this loop
      // forgot the client server-side (_clients.delete) but never closed
      // the real socket. The browser-side EventSource never saw an error,
      // so its own real, already-correct reconnect logic (userscript-
      // chatgpt.js's _es.onerror -> exponential backoff) never fired.
      // Guardian said "disconnected" forever; the tab never knew and
      // never recovered. Same close-before-forget pattern handleChannel
      // already uses two cases above for "same key reconnects" (stale.res.end()) —
      // this is that exact bug's sibling, not a new mechanism.
      try { client.res.end(); } catch(_) {}
      _clients.delete(key);
      if (_activeByProvider.get(client.provider) === key) _activeByProvider.delete(client.provider);
      busEmit?.('ncp.client.stale', { provider: client.provider, tabId: client.tabId, key, lastHeartbeat: client.lastHeartbeat }, 'WARN');
      onDisconnect?.({ provider: client.provider, tabId: client.tabId, key, reason: 'stale' });
    }
  }, 15_000);
  if (_staleSweep.unref) _staleSweep.unref(); // never keeps the process alive on its own

  /**
   * Get all connected providers.
   */
  function getProviders() {
    const providers = {};
    for (const client of _clients.values()) {
      const key = `${client.provider}:${client.tabId}`;
      providers[client.provider] = {
        tabId:        client.tabId,
        connectedAt:  client.connectedAt,
        lastHeartbeat:client.lastHeartbeat,
        age:          Date.now() - client.connectedAt,
        usage:        client.usage || { limited: false, message: null, resetHint: null, detectedAt: null },
        chatId:       client.chatId || null,
        claimed:      client.claimed || false,
        // §23.12 — recent disconnect count for this key, within the same
        // window _trackFlap uses. 0 most of the time; non-zero is a real,
        // immediately visible signal that something reconnected recently,
        // without needing to go dig through gaps or the ledger to see it.
        recentDisconnects: (_flapHistory.get(key) || []).filter(t => Date.now() - t < FLAP_WINDOW_MS).length,
      };
    }
    return providers;
  }

  function clientCount() { return _clients.size; }

  /**
   * updateClient(provider, tabId, fields) — merge fields into a live client entry.
   * Used by server.js to propagate GUARDIAN_REGISTER payload (claimed, chatId, etc.)
   * into the NCP client map without waiting for the first heartbeat (8 s delay).
   * No-op if the client key is not found.
   */
  function updateClient(provider, tabId, fields) {
    const key = `${provider}:${tabId}`;
    const client = _clients.get(key);
    if (!client) return false;
    if (fields.claimed  !== undefined) client.claimed  = fields.claimed;
    if (fields.chatId   !== undefined) client.chatId   = fields.chatId;
    if (fields.usage    !== undefined) client.usage    = fields.usage;
    return true;
  }

  return {
    // Route handlers — call these from your HTTP server
    handleChannel,
    handleResult,
    handleHeartbeat,
    handleStream,
    // Push API
    push,
    pushActive,
    pushTab,
    broadcast,
    // State
    isConnected,
    getProviders,
    clientCount,
    updateClient,
  };
}

module.exports = { createNCPServer };
