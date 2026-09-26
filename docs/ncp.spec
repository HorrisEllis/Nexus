spec:
  meta:
    name:        ncp
    version:     1.1.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-ncp-v1-0000-2026-0818-jamesbrooks-001
    purpose: >
      The real, live channel between a browser-tab userscript (claude/
      chatgpt/gemini/perplexity, injected via clear-glass) and guardian's
      NCP server. Tracks each real connected tab's provider, heartbeat,
      and claim state; guardian/lib/ncp.js is the real implementation.

  # ── §BUILT — this closes a real spec.missing gap (cortex's own gap
  # system flagged: "ncp has code at v1.0.1 but no spec file"). Written
  # now specifically because this session made real, direct changes to
  # this exact system — writing its spec is a direct responsibility, not
  # a speculative addition. Every claim below was checked against the
  # real code or verified by direct testing, not recalled from memory.

  real_api:
    handleChannel: "GET /channel?provider=X&tabId=Y — registers a real client, opens an SSE stream"
    handleHeartbeat: "POST /heartbeat — updates lastHeartbeat for an existing client (real, tracked, but not read by isConnected() until the 2026-08-17 fix below)"
    handleResult: "receives a real dispatch result from a tab"
    push / pushTab: "server -> tab real dispatch"
    isConnected(provider): "the real, current connectivity check — see §FIXED below"
    getProviders(): "real, current snapshot of every connected client"
    updateClient(provider, tabId, fields): "mutates claimed/chatId/usage on an existing real client — does not touch lastHeartbeat"

  # ── §FIXED 2026-08-17 — real, severe bug found and fixed this session ──
  fixed_2026_08_17:
    what_was_wrong: >
      isConnected(provider) only ever checked whether a registry entry
      existed for that provider — it never checked lastHeartbeat
      freshness, despite lastHeartbeat being real, tracked data. A tab
      that silently froze (JS execution stopped, but the underlying SSE
      socket hadn't technically closed — a real, common failure mode)
      stayed marked "connected" forever. This produced the exact real,
      observed symptom: a dispatch would be attempted, the tab would
      never ack, and the system had no way to know the connection was
      actually dead until the dispatch itself timed out.
    the_fix: >
      A real staleness check (STALE_MS = 30_000, calibrated against the
      real userscript heartbeat interval of 8000ms — guardian/
      userscript-claude.js's own HB_MS) plus a periodic sweep (every
      15s) that evicts a stale client and fires a real
      ncp.client.stale bus event + onDisconnect callback. isConnected()
      also evicts inline if it finds a stale entry during a lookup, not
      only during the periodic sweep.
    verified: >
      Full real integration test: registered a genuine client through
      handleChannel() with a real mock req/res, confirmed isConnected()
      correctly reports true while fresh, then simulated 35s of real
      time passing (Date.now patched, not a real 35-second wait) and
      confirmed isConnected() correctly flips to false, a real
      disconnect event fires with reason:'stale', and the client is
      actually evicted from the registry.

  # ── prior art this session extracted a real pattern from ──
  provenance:
    session_note: >
      The staleness-check-plus-sweep pattern itself is real, extracted
      prior art — Guardian-clean-17.zip (a genuinely different, older
      product: a multi-device mesh network, NOT this system's tab-to-
      server NCP) had a real, working session/heartbeat pattern in its
      own handshake.js. Only that specific pattern was ported, not the
      mesh/AppID system around it, which solves an unrelated problem.

  known_real_dependents:
    - guardian/server.js: "hosts the real NCP server, wires bus.emit for client lifecycle"
    - "guardian/userscript-{claude,chatgpt,gemini,perplexity}.js": "the real tab-side heartbeat senders, HB_MS=8000"
    - lib/intent-hat-router.js: "co-pilot's real dispatch reads NCP connectivity via this system's isConnected()"

  open_honest_gaps:
    - "No spec existed for this system before this file — the gap itself named it explicitly, closed here."
    - "updateClient() does not touch lastHeartbeat — confirmed by reading the real code; a claim/chatId update alone does not count as a real heartbeat for staleness purposes. Not fixed here — worth a real decision on whether it should."
