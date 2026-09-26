# mesh — BrainOS, rebuilt for nexus (RELOCATED 2026-09-03)

**§MOVED — this subsystem no longer lives here.** James, 2026-09-03:
"DNS/firewall/crypto/host-rotation/reverse-proxy maybe recycle to
clearglass." All 10 real modules that used to live in `mesh/lib/`
(dns-server, firewall, reverse-proxy, ddns, crypto-engine, key-manager,
host-rotation, port-registry, the SNR filter, and canvas-persistence)
moved together as one unit to `clear-glass/src/network/` — checked first
that none of them require() each other directly (every real cross-module
dependency, like key-manager's use of a crypto engine, is constructor
dependency-injection, not a file-level require), so there was no
correctness reason to split them across two processes. They're wired to
clear-glass's own bus now instead of guardian's, and served at
`/network/*` on clear-glass's own HTTP surface instead of guardian's
`/mesh/*`. Guardian's boot-sequence install() call and
`guardian/routes/mesh.js` were removed as part of the same commit.

This README is kept as the historical record of the original BrainOS
port below — the table of what came across and what didn't is still
accurate, only the *location* of what came across has changed.

---

# mesh — BrainOS, rebuilt for nexus

UUID: `nexus-mesh-subsystem-v1-0000-4700-0000-000000000000`

This subsystem is BrainOS (`nexus-10-bridge` v5.0.0, `BrainOS-main.zip`) —
originally a standalone control-canvas app with its own HTTP server, own
event bus, and own agent/routing layer — broken down and rebuilt as a real
nexus subsystem, wired into guardian instead of running as a second process.

## What was checked before porting anything

BrainOS's own filenames suggested it might already overlap with nexus
(`nexus-bridge-server-v2.js`, `bus.js` calling itself "SISO-native", a
`snr-filter.js`, a `router.js`, a `delta.js`). Each one was diffed against
its nexus namesake before deciding what to do with it:

| BrainOS file | nexus already has | Verdict |
|---|---|---|
| `bus.js` | `guardian/server.js`'s `SISOStream` (`bus`) — same Event→Gate→Stream pattern, same axioms, already the single real bus every guardian route uses | **Not ported.** Every mesh module connects to guardian's real `bus` instead (see `install.js`). |
| `snr-filter.js` | `cortex/core/raid/snr-filter.js` — but that one gates RAID *call resolution* (invariant/pattern/open-loop/unknown tiers against `jaaDB`), a completely different job from BrainOS's rule/blocklist gate (ublock, DNS-firewall, AV-list imports) | **Ported**, renamed `mesh-snr-filter.js` to keep the two apart — they solve different problems and both are real. |
| `router.js` | `bridge/router.js` — nexus's is a verified-request router with circuit breakers and a ledger; BrainOS's is a provider-account fallback router with adaptive cooldowns | Different systems under a shared generic name. BrainOS's version is part of the **not-ported** agent layer below (it depends on `account-manager.js`/`delta.js`). |
| `delta.js` | `intelligence/cfr/delta.js` — nexus's is a ledger transition-physics engine (tension/friction/slope); BrainOS's is an account-activity logger (JAA-safe string escaping, Notion/Discord webhooks) | Different systems. **Not ported** — see below. |
| `crypto-engine.js` / `key-manager.js` | `cos/vault/crypto.js` — a narrow 117-line AES-256-GCM vault-key module | BrainOS's version is a broader, general-purpose primitives toolkit (ECDH, HKDF, scrypt, HMAC, key wrapping) plus a full rotation-lifecycle manager on top — nothing narrower already covers this. **Ported.** |
| DNS server, firewall, reverse proxy, DDNS, host rotation, port registry, canvas persistence | nothing | Genuinely new capability. **Ported.** |

## What was ported (`mesh/lib/`)

- `crypto-engine.js` — AES-256-GCM, ECDH P-256, HKDF, scrypt, HMAC, wrapping. Zero deps, typed results, no throws.
- `key-manager.js` — rotation-lifecycle on top of crypto-engine (session/e2e/gate/turn keys, scheduled + anomaly-triggered rotation).
- `host-rotation.js` — probes and rotates between a pool of upstream hosts.
- `port-registry.js` — tracks/remaps a registry of service ports.
- `mesh-snr-filter.js` — rule-based signal/noise gate; imports ublock/DNS-firewall/AV/blacklist lists.
- `canvas-persistence.js` — atomic (temp+rename) JSON/JSONL persistence for canvas state, nodes, deltas, SNR rules, keys.
- `dns-server.js`, `ddns.js`, `reverse-proxy.js`, `firewall.js` — real network-infra daemons (UDP DNS resolver, dynamic-DNS client, HTTP reverse proxy, rule-based firewall). Not started automatically — see `daemons.js`.

Every module kept its own original, self-contained implementation (they
were already zero-dependency, already took injectable `opts.dataDir` /
`opts.persist` / `connectBus()`). What changed for nexus:

- **Bus**: wired to guardian's real `SISOStream` via `install.js`, not BrainOS's own `bus.js` (which was dropped).
- **Persistence**: defaults to `data/mesh/`, matching every other nexus subsystem's `data/<name>/` convention, instead of BrainOS's own `./data/`.
- **Routing**: BrainOS's raw-http `(req, res, parts, method, u)` route table (`nexus-bridge-modules.js`) was rebuilt as `guardian/routes/mesh.js`, using guardian's proven `handle(req, res, ctx) -> boolean` contract (the same one `routes/settings.js` and `routes/autonomous-loop.js` use) instead of a second parallel dispatch mechanism.

Routes live under `/mesh/*` in guardian (`/mesh/snr`, `/mesh/keys`,
`/mesh/hosts`, `/mesh/ports`, `/mesh/canvas`, `/mesh/crypto`,
`/mesh/modules`) — namespaced so nothing collides with guardian's existing
routes. Wired once at boot in `guardian/server.js`'s `server.listen()`
callback via `require('../mesh/install.js').install(bus)`.

## What was deliberately NOT ported

BrainOS's own agent/orchestration layer — `agent-factory.js`,
`agent-registry.js`, `intent-parser.js`, `intent-router.js`,
`intent-scoring.js`, `routing-engine.js`, `workflow-engine.js`,
`account-manager.js`, `delta.js`, `router.js`, `adapters.js` — was left
out entirely. nexus already has a larger, more developed equivalent for
every piece of that: `lib/intent-classifier.js` (RAID's entry gate),
`guardian/lib/jobs.js` + `createJob`/`dispatchJob` (provider dispatch),
the full RAID pipeline (`cortex/core/raid/*`), and `orchestrator/`.
Porting BrainOS's version on top of that would mean two independent,
competing orchestration layers reading the same events — not additive,
just duplicated surface area with no clear owner. If a specific piece of
that layer turns out to do something nexus's own orchestration genuinely
can't, it's worth revisiting on its own — but it wasn't ported wholesale.

The two HTML canvases (`BrainOS.html` — 4,678 lines, `BrainOS-v2.html` —
5,553 lines) and `guardian-bridge-api.html` were also not ported in this
pass — the backend they point at (`/guardian/handshake`,
`/guardian/heartbeat`, the pulse/mesh visualization) doesn't have a home
in this rebuild yet, and porting ~10,000 lines of UI against endpoints
that don't exist would be dead weight. Worth a dedicated pass if the
canvas visualization itself is wanted.

## Starting the optional network daemons

DNS, DDNS, reverse-proxy, and firewall each bind a real port/socket.
None of them start automatically with guardian — see `mesh/daemons.js`:

```
node mesh/daemons.js dns          # UDP DNS resolver on config.DNS_PORT
node mesh/daemons.js proxy        # HTTP reverse proxy on config.PROXY_PORT
node mesh/daemons.js firewall     # loads FirewallEngine, reports rule count
node mesh/daemons.js ddns         # one public-IP check + DDNS update, then exits
```
