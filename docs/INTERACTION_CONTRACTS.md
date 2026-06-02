# NEXUS Interaction Contracts v1.0
# UUID: nexus-contracts-v1-0000-4000-0000-000000000001
#
# Each system declares its own contract:
#   - ports it listens on
#   - routes it exposes
#   - SISO channels it emits
#   - SISO channels it consumes
#   - health check path + expected shape
#   - ledger table name

---

## BRIDGE — :9999
```
health:  GET /bridge/health → { ok, bridge, sessions, pendingRequests, recentEvents, systems[] }
ledger:  bridge_ledger (in bridge JAA)
emits:   bridge.request.created | bridge.request.accepted | bridge.request.complete
         bridge.request.expired | bridge.request.rejected | bridge.handshake | bridge.tag.added
routes:
  POST /bridge/handshake        { systemId, appId, secret }
  GET  /bridge/health
  GET  /bridge/stats
  GET  /bridge/tags/:id
  POST /bridge/tags             { entityId, entityType, system, tags[], addedBy }
  GET  /bridge/requests
  POST /bridge/requests         { type, from, to, payload }
  POST /bridge/requests/:uuid/accept
  POST /bridge/requests/:uuid/reject
  POST /bridge/requests/:uuid/complete
  GET  /bridge/subscribe?channel=x   SSE
  GET  /bridge/pull?channel=x&since=ts
  POST /bridge/broadcast        { type, ...data }
  POST /bridge/purge
```

## CORTEX — :3748
```
health:  GET /health → { status:'ok', jaa:{ counts:{...28 tables} }, uptime }
ledger:  cortex_ledger (event_log table, type='ledger.*')
emits:   cortex.gap.found | cortex.gap.resolved | cortex.memory.updated
consumes: guardian.job.complete | guardian.artifact | guardian.gaps
routes:
  GET  /health
  GET  /sse                     event stream
  GET  /api/events?n=N
  POST /api/event               { type, payload, causedBy? }
  GET  /api/gaps
  GET  /api/failures
  GET  /api/memory?table=x&n=N
  POST /api/memory/search       { q }
  POST /api/memory/forget       { uuid }
  GET  /api/files
  GET  /api/tags?entityId=x
  POST /api/tags
```

## GUARDIAN — :7820 (WSS :7821)
```
health:  GET /health → { ok, uptime, jobs, providers:{claude,chatgpt,gemini,ollama}, queued:{} }
ledger:  guardian_ledger (JAA ledger table)
emits:   guardian.job.complete | guardian.artifact | guardian.gaps | guardian.ledger
         guardian.job.queued | guardian.job.dispatched | guardian.session.named
consumes: (userscript) GUARDIAN_COMPLETE | GUARDIAN_ARTIFACT | GUARDIAN_GAPS | GUARDIAN_LEDGER_EVENT
routes:
  POST /command                 { provider, command, prompt, content? }
  GET  /status/:jobId
  GET  /response/:jobId
  GET  /stream/:jobId           SSE token stream
  GET  /jobs?status=&limit=
  GET  /providers
  GET  /health
  GET  /events                  SSE
  GET  /cockpit                 Forge IDE HTML
  GET  /ledger?category=
  POST /ledger
  GET  /artifacts
  POST /artifacts
  GET  /memory/ledger
  GET  /memory/artifacts
  GET  /memory/stats
```

## IDEARIUM — :4800
```
health:  GET / → { ok, version, snr, uptime }  (root path, NOT /health)
ledger:  idearium_ledger (snapshots table, type='ledger.*')
emits:   idearium.idea.created | idearium.snapshot.pushed | idearium.gap.opened
consumes: guardian.job.complete (to update idea phase)
routes:
  GET  /                        health (root)
  GET  /api/contract
  GET  /api/stats
  GET  /api/snr
  GET  /api/ideas
  POST /api/ideas               { text, tags?, compartment? }
  GET  /api/ideas/:uuid
  PATCH /api/ideas/:uuid
  POST /api/ideas/:uuid/tension
  POST /api/ideas/:uuid/phase   { phase }
  POST /api/ideas/:uuid/link    { toUuid, linkType? }
  POST /api/ideas/:uuid/spec
  GET  /api/specs
  GET  /api/specs/:uuid
  POST /api/specs/:uuid/build
  GET  /api/gaps
  POST /api/gaps                { description }
  GET  /api/snapshots
  POST /api/snapshots           { message }
  GET  /sse                     event stream
  GET  /api/events
```

## EMERGE IDE — :4242
```
health:  GET /status → { streams, schema:{keywords,axioms}, ollama:{online,models[]} }
routes:
  GET  /             IDE HTML
  GET  /status
  GET  /events       SSE
  POST /compile      { source, filename }
  POST /check        { source, filename }
  POST /spec         { source, filename }
  POST /chat         { prompt, context, model }
  POST /snapshot     {}
  GET  /ollama-status
```

## ORCHESTRATOR — :9000
```
health:  GET /health → { ok, online, total, systems:{} }
ledger:  orchestrator_ledger (in-memory ring, broadcast via SSE)
emits:   orchestrator.ui.hotswap | orchestrator.connected | orchestrator.cmd.executed
routes:
  GET  /                        Orchestrator UI
  GET  /ports.js                Canonical port map
  GET  /health
  GET  /sse                     Unified SSE (all bridge events + orchestrator events)
  GET  /ui/:system              System UI (hotswapped)
  GET  /api/status
  GET  /api/channels
  GET  /api/cli
  GET  /api/ui
  GET  /api/api-map
  GET  /api/ledger              All system ledger entries
  POST /api/exec                { cmd, args[], system? } — execute CLI command
  *    /api/bridge/*            19 proxied routes
  *    /api/cortex/*            14 proxied routes
  *    /api/guardian/*          22 proxied routes
  *    /api/idearium/*          22 proxied routes
```
