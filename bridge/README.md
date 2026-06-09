# Bridge OS — Sovereign Distributed Node Runtime

> **v1.3.0** · 29 modules · zero external runtime dependencies on Windows · BLE native on RTL8852BE

**Author:** James Brooks (Erosmancer) · [rheon.world](https://rheon.world)  
**License:** Proprietary — All rights reserved. See [LICENSE](LICENSE).  
**Repository:** [github.com/HorrisEllis/Bridge-v2](https://github.com/HorrisEllis/Bridge-v2)

---

## Repository Structure

| Repo | Description |
|------|-------------|
| **Bridge-v2** (this) | Full distribution — core + all official modules pre-installed. What you run. |
| [bridge-core](https://github.com/HorrisEllis/bridge-core) | Kernel only — identity, trust, causal, bus, gate. For developers building custom stacks. |
| [bridge-modules](https://github.com/HorrisEllis/bridge-modules) | Official module catalog — 35 modules, individually installable. |

Bridge OS is modular. `bridge-core` is the kernel. Everything else is a module. This repo ships all official modules pre-installed. Install only what you need with `nexus module install <name>`.

---

## What It Is

Bridge OS turns any machine into a cryptographically-identified, self-governing peer in a private mesh network. No cloud coordinator. No central server. No registration. Two machines running Bridge OS can find each other, authenticate each other, and communicate — without any third party knowing they exist.

Each node:
- Generates its own Ed25519 identity on first boot (UUID = SHA-256 of public key)
- Maintains behavioral memory of every peer it has ever seen
- Makes independent trust decisions using Bayesian estimation + a programmable gate
- Records everything in a 1-million-entry causal graph queryable by type, chain, and time
- Speaks HTTP, Bluetooth Low Energy, and TCP — automatically picking the best available transport
- Runs a real-time physics visualization of the entire mesh

---

## Quick Start

```bash
git clone https://github.com/HorrisEllis/Bridge-v2.git
cd Bridge-v2
npm install
node index.js
```

The node is live at **your machine's LAN IP on port 3747**. Check the boot output:

```
  ●  Online in 0.08s
  │  UUID     4a71196a-021f-a030-1844-9fb0af87e6d4
  │  ShortID  4a71196a
  │  LAN      http://192.168.1.42:3747
  │  CLI      node index.js --cli
  └  nexus://4a71196a
```

If port 3747 is already taken (e.g. another Bridge instance is running), the node automatically finds the next free port and tells you where it landed. No configuration needed.

---

## Networking

### Same machine, two nodes

The second node detects port 3747 is taken and moves to the next free port in the Bridge sovereign range (3748–3760), then the IANA ephemeral range (49152–65535) if all sovereign ports are taken too. Both nodes appear in each other's peer registry automatically.

### Two machines on the same LAN

Both start on port 3747 — no conflict because they're on different machines. The CLI scans the LAN subnet and finds all Bridge nodes:

```
nexus@3747 ❯ mesh scan
  ●  192.168.1.42:3747  lan   uuid=4a71196a  (this machine)
  ●  192.168.1.87:3747  lan   uuid=c297f838  (remote)
```

Connect to a remote node's CLI:

```bash
node index.js --cli --host 192.168.1.87 --port 3747
```

### Across networks

Nodes find each other via DDNS — the DDNS client registers `<uuid>.nexus.mesh` DNS records pointing to each node's current public IP. Once discovered, they authenticate via Ed25519 handshake and communicate over HTTP or the onion router.

### Via Bluetooth (no WiFi required)

On Windows, Bridge OS uses the internal Bluetooth chip natively — no driver swap, no dongle. Within ~30 metres, nodes discover each other via BLE and communicate directly. See the [Bluetooth](#bluetooth-windows--no-driver-swap-required) section and [Testing BLE](#testing-ble) below.

---

## Testing BLE

Bridge OS ships a standalone BLE smoke test. No npm packages needed — it uses only the files already in the repo.

```powershell
# from Bridge-v2/
node bridge-transport/tests/test-ble-rtl8852be.js
```

**What it tests:**

| Phase | What happens | Pass means |
|-------|-------------|------------|
| 1 — Adapter detection | WinRT checks the chip is visible | Chip is live, driver is OK |
| 2 — Peripheral role | Tries to start advertising `BRIDGE:test-rtl` | Firmware supports peripheral mode |
| 3 — Central scan | Scans for BLE devices for 8 seconds | Adapter can receive advertisements |
| 4 — Chunk loopback | Encodes + reassembles a 300-byte message in software | Chunking math is intact |
| 5 — MTU probe | Reports negotiated MTU | Informational |

**Flags:**

```powershell
--verbose           # show every WinRT event as it fires
--scan-ms=15000     # extend scan window beyond default 8s
--scan-only         # skip the advertising phase
--advertise-only    # skip the scanning phase
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | All phases passed — BLE is operational |
| 1 | Adapter not found / Windows Bluetooth is disabled |
| 2 | Peripheral role not supported (central-only is fine — still fully usable) |
| 3 | Zero devices found in scan window (normal if nothing BLE is nearby) |
| 4 | Chunk loopback failed (software bug) |

**If Phase 1 fails:**

```
1. Windows Settings → Bluetooth & devices → turn Bluetooth ON
2. Device Manager → Bluetooth → right-click Realtek → Enable device
3. Yellow ! on the device? Update driver: Gigabyte App Center → Realtek Bluetooth
   Or download directly from gigabyte.com/support → B450 AORUS PRO WIFI
```

**Check BLE from a running node:**

```bash
curl http://localhost:3747/transport/ble/status
curl http://localhost:3747/transport/ble/peers
```

---

## Testing the Port Behaviour

Verify the port auto-negotiation works:

```powershell
# Terminal 1 — takes 3747
node index.js

# Terminal 2 — should land on 3748 automatically, not loop
node index.js
```

The boot banner shows the actual port. If you ever see `[port-registry] EADDRINUSE` messages looping, pull the latest — that bug was fixed in v1.3.0.

---

## The 29 Modules

| Module | Role | Status |
|--------|------|--------|
| bridge-identity | Ed25519 keypair, UUID = SHA-256(pubKey), keystore | ✓ complete |
| bridge-core | SISO event bus, callto registry, node registry | ✓ complete |
| bridge-IME | Behavioral memory, trust scoring, probationary ramp | ✓ complete |
| bridge-sngate | Three-state gate (allow/deny/observe), rule introspection | ✓ complete |
| bridge-data | Universal intake pipeline | ✓ complete |
| bridge-heartbeat | BPM tracker, UDP pulse :7777, liveness | ✓ complete |
| bridge-contracts | Boot-time interface enforcement | ✓ complete |
| bridge-appid | AppID registry, nexus:// trust codes, session tokens | ✓ complete |
| bridge-plugin | WebSocket gateway for Guardian/Tampermonkey | ✓ complete |
| bridge-mesh | ECDH peer channels, Bayesian trust-mesh | ◐ partial |
| bridge-causal | 1M ring buffer, CQL, WAL, sigma classifier | ✓ complete |
| bridge-dht | Kademlia DHT, Ed25519-signed records | ✓ complete |
| bridge-ollama | Local LLM driver (Ollama), bus-driven streaming | ✓ integrated |
| bridge-gateway | HTTP API gateway :3748, rate limiting, CORS | ✓ complete |
| bridge-ddns | DDNS client (Cloudflare/No-IP) + custom DNS server | ✓ complete |
| bridge-proxy | HTTP/HTTPS reverse proxy with SNI routing | ✓ complete |
| bridge-ssh | SSH transport, session management | ✓ active |
| bridge-guardian | Browser extension endpoint, Guardian handshake | ✓ complete |
| bridge-health | Mesh health score, auto-heal, delta replay, divergence alerts | ✓ complete |
| bridge-onion | Multi-hop onion routing, ECDH P-256, AES-256-GCM | ✓ complete |
| bridge-steg | Steganographic channels (JSON + HTTP header) | ✓ complete |
| bridge-shaper | Traffic shaping, TLS-aligned padding, Gaussian jitter | ✓ complete |
| bridge-transport | Unified transport: HTTP + BLE (WinRT native) + cellular | ✓ complete |
| bridge-mobile | Power budget, checkpoint, watchdog, Pi installer | ✓ complete |
| bridge-ipfs | IPFS CIDv0 content-addressed storage, DHT providers | ✓ complete |
| bridge-bayesian | Beta belief engine, temporal decay | ✓ complete |
| bridge-magnet | nexus:// URI 7-level resolution cascade | ✓ complete |
| bridge-routing | TCP mesh router :3749 | ✓ complete |
| module-registry | Runtime hot-unload/reload, /module/* routes | ✓ complete |

---

## HTTP API — Port 3747

All endpoints return JSON. CORS enabled. Optional API key via `NEXUS_API_KEY` env var.

```
GET  /health                    Full diagnostics + real network addresses
GET  /identity                  UUID, public key, all reachable endpoints
GET  /network                   All network interfaces, scopes, LAN/VPN/public IPs
POST /pulse                     Register a client (any instanceId, any language)
GET  /nodes                     All registered nodes
GET  /calltos                   Callto registry
POST /callto                    Execute a browser action via Guardian
GET  /magnet/:shortId           Resolve 8-char short ID to full address
POST /magnet/resolve            Full nexus:// URI cascade resolution
GET  /trust/stats               Trust mesh statistics
GET  /trust/score/:uuid         Per-peer trust score + snapshot
GET  /ime/profile/:uuid         Behavioral profile for a UUID
GET  /sngate/trace              Last 100 gate decisions with matchPath
GET  /sngate/rules              Active gate rules
POST /sngate/rules              Add a rule
GET  /causal/stats              Ring stats, WAL status
GET  /causal/classify           Sigma regime: stable/degraded/collapsing/oscillatory
POST /causal/query              CQL query against 1M causal ring
POST /appid/create              Create AppID + one-time nexus:// trust code
POST /appid/redeem              Exchange trust code for session token
POST /data/push                 Push event through intake pipeline
POST /mesh/*                    Mesh peer operations
GET  /dht/peers                 DHT routing table
POST /dht/find                  Kademlia iterative lookup
GET  /dht/stats                 DHT statistics
GET  /cfr/*                     Physics field: nodes, field, deltas, stream
POST /cfr/emit                  Emit bus event from HTTP
POST /cfr/simulate              Inject simulation event
GET  /guardian/status           Connected Guardian sessions
POST /guardian/handshake        Guardian AppID introduction
GET  /module/list               All loaded modules + status + uptime
POST /module/:name/unload       Hot-unload a non-vital module
POST /module/:name/reload       Stop + re-read from disk + re-init
GET  /transport/stats           All transport adapter stats (http, ble, cellular)
GET  /transport/ble/status      BLE adapter diagnostics — state, backend, peers, stats
GET  /transport/ble/peers       Connected + discovered BLE peers
GET  /ble/status                BLE adapter, backend, peripheral, subscribers
POST /ble/scan                  Start Bluetooth scan
GET  /ble/discovered            Bridge nodes found in last scan
POST /ble/connect               Connect to discovered peer by short ID
POST /ble/send                  Send message to BLE peer
POST /ble/advertise             Start advertising (peripheral mode)
POST /ble/stop-advertise        Stop advertising
POST /ble/notify                Push to all subscribed centrals
GET  /ipfs/:cid                 Retrieve content by CID
POST /ipfs/put                  Store content, get CID, announce to DHT
GET  /health/mesh               Aggregate mesh health score
GET  /health/divergence         Nodes diverging beyond 2σ from peer group
GET  /onion/*                   Onion circuit status
POST /steg/*                    Steganographic channel operations
GET  /mobile/status             Power profile, battery, watchdog state
POST /cli/command               Execute any CLI command via HTTP
GET  /gateway/status            API gateway diagnostics (port 3748)
```

---

## Ports

| Port | Protocol | Role |
|------|----------|------|
| 3747 | HTTP + WebSocket | Primary sovereign node |
| 3748–3760 | HTTP | Fallback sovereign range (same-machine multi-node) |
| 3748 | HTTP | API gateway (rate limiting, CORS, proxy) |
| 3749 | TCP | Mesh router (binary pulse protocol) |
| 5353 | UDP | DNS server (fallback from :53) |
| 7777 | UDP | Heartbeat broadcast (LAN peer discovery) |
| 11434 | HTTP | Ollama local LLM |
| 49152–65535 | — | Dynamic fallback if all sovereign ports are taken |

---

## CLI

```bash
node index.js --cli                                    # start node + CLI
node index.js --cli --host 192.168.1.87 --port 3747   # connect to remote
```

| Command | Description |
|---------|-------------|
| `status` | Full health — UUID, port, LAN address, causal count |
| `identity` | Node public record + all reachable endpoints |
| `nodes` | All registered nodes with trust, lifecycle, address |
| `trust [uuid]` | Trust mesh summary or per-peer score |
| `ime <uuid>` | Behavioral profile |
| `sngate trace\|rules\|add` | Gate decisions, rules, add a rule |
| `causal stats\|classify\|query <cql>` | Causal kernel |
| `mesh scan` | Scan LAN for Bridge nodes |
| `module list` | All loaded modules + uptime |
| `module <name> unload\|reload` | Hot-unload/reload without restart |
| `ble status` | Adapter, backend, peripheral support |
| `ble scan [ms]` | Start BLE scan |
| `ble discovered` | All discovered Bridge BLE nodes with RSSI |
| `ble connect <shortId>` | Connect to discovered peer |
| `ble send <shortId> <msg>` | Send message over BLE |
| `ble advertise [name]` | Start advertising |
| `ble notify <msg>` | Push to all subscribed centrals |
| `ollama <prompt>` | Query local Ollama LLM |
| `test all` | Run all test suites |
| `watch [sig]` | Stream live bus events |

---

## Bluetooth (Windows)

Bridge OS ships a native BLE host executable (`bridge-transport/bridge-winrt-ble.exe`) compiled from included C# source (`bridge-winrt-ble.cs`). This replaces a PowerShell backend — Windows 11 24H2 prevents PowerShell from subscribing to WinRT Bluetooth events, a platform restriction with no scripting workaround.

**Validated hardware:** Realtek RTL8852BE (`USB\VID_0BDA&PID_0852`) on the Gigabyte Aorus B450 WiFi Pro. Central role (scan + connect) works. Peripheral role requires firmware ≥ 1036.6.0.1 — update via Gigabyte App Center.

### Security — scanning the exe

We recommend scanning `bridge-winrt-ble.exe` before first run:

```powershell
# Windows Defender scan
Start-MpScan -ScanType CustomScan -ScanPath "C:ridgeridge-transportridge-winrt-ble.exe"
```

Or upload to [virustotal.com](https://virustotal.com) for a 70-engine scan.

**Why an exe, not a script:**
- PowerShell 5.1 `Register-ObjectEvent` throws `INVALID_REGISTRATION` for WinRT types — this is a Windows platform restriction, not a Bridge OS limitation
- Source is in `bridge-winrt-ble.cs` — 319 lines, no obfuscation, fully auditable
- Compiled with `csc.exe` built into Windows — recompile anytime: `bridge-transportuild-ble-host.bat`
- Speaks the same JSON line protocol as the PS1 it replaces — Node.js treats it identically

**If you prefer not to run the exe:** delete `bridge-winrt-ble.exe`. Bridge falls back to the PS1 backend — adapter detection and chunking work, but BLE peer discovery is unavailable on Windows 11 24H2.

On Linux/macOS: uses `@abandonware/noble`. Linux requires `libbluetooth-dev` + `sudo setcap cap_net_raw+eip $(which node)`.

Full guide: [bridge-transport/BLE-GUIDE-WINDOWS.md](bridge-transport/BLE-GUIDE-WINDOWS.md)

---

## Roadmap

The system is feature-complete at the transport and security layer. The next phases make the security modules work together rather than independently, and add distributed LLM intelligence.

| Phase | Version | Module | What it does |
|-------|---------|--------|-------------|
| **Done** | v1.3.0 | BLE integrated | RTL8852BE validated, transport routes, test harness, port fix |
| **A** | v1.4.0 | `bridge-threat` | Threat delta measurement — score 0–100, regimes CALM→BLACKOUT. Everything below gates on this. |
| **B** | v1.5.0 | `bridge-conductor` | Orchestration — regime drives onion hops, shaper profile, steg channel, transport priority. BLACKOUT = BLE + steg only, no IP footprint. |
| **C** | v1.6.0 | `bridge-wcc` | Weighted Compute Credit — opt-in LLM contribution earns non-transferable credits. Interaction-based decay, cluster Sybil resistance. |
| **D** | v1.7.0 | `bridge-mind` | Distributed LLM across the mesh — model tier selection by WCC balance, qwen2:0.5b free through deepseek-r1:8b premium. |
| Future | — | `bridge-ledger` | Optional token layer if WCC ever needs external economic weight. Slots in without architecture changes. |

Full interactive phase map: [bridge-os-v5.3-phasemap.html](bridge-os-v5.3-phasemap.html) — open in any browser, no server needed.

---

## Connecting Clients

Any language, any platform. HTTP only.

```bash
# Register
curl -X POST http://192.168.1.42:3747/pulse \
  -H 'Content-Type: application/json' \
  -d '{"instanceId":"my-app","logicalId":"My App v1","capabilities":["data:push"]}'

# Push an event
curl -X POST http://192.168.1.42:3747/data/push \
  -H 'Content-Type: application/json' \
  -d '{"_localVerified":true,"type":"myapp:event","payload":{"value":42}}'

# Create a scoped session token
curl -X POST http://192.168.1.42:3747/appid/create \
  -d '{"appId":"my-client"}' -H 'Content-Type: application/json'
# → { "code": "nxt-7k3p-xm9q", "uri": "nexus://4a71196a?code=...&ttl=300" }

curl -X POST http://192.168.1.42:3747/appid/redeem \
  -d '{"code":"nxt-7k3p-xm9q","appId":"my-client"}' -H 'Content-Type: application/json'
# → { "token": "...", "permissions": ["data:read","bus:read"] }
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_PORT` | `3747` | HTTP port (auto-increments on conflict) |
| `NEXUS_BIND_HOST` | `0.0.0.0` | Bind address |
| `NEXUS_DATA_DIR` | `./data` | Data directory for identity, WAL, state |
| `NEXUS_API_KEY` | *(none)* | Optional API key for all endpoints |
| `NEXUS_GROUP` | *(none)* | Group hint for identity clustering |
| `NEXUS_LOG` | `INFO` | Log level: INFO or DEBUG |
| `NEXUS_ANNOUNCED_HOST` | *(auto)* | Override the advertised public hostname |
| `NEXUS_DHT_BOOTSTRAP` | *(none)* | Comma-separated bootstrap peer addresses |
| `NEXUS_GATEWAY_PORT` | `3748` | API gateway port |
| `NEXUS_MESH_PORT` | `3749` | TCP mesh router port |

---

## Security

**Strong:** Ed25519 identity · 30-second handshake replay window · HMAC single-use trust codes · Probationary trust ramp · Score-never-blocks invariant · Append-only causal log · Layer sovereignty (modules communicate via bus only, never direct calls).

**Pending:**
- `FLAG-004` — Remote data push signature verification (currently trust-score-gated)
- `FLAG-003` — STUN/TURN for cross-network NAT traversal
- `FLAG-005` — TPM/DPAPI hardware-bound key storage

**By design:** Each node maintains independent trust scores — no global consensus. Forced consensus creates a single point of manipulation.

---

## Backup

**Critical:** `data/identity.key` — your node's private key. Losing it means losing your UUID permanently. Back it up.

---

## License

Copyright © 2026 James Brooks (Erosmancer). All rights reserved.  
Proprietary software. See [LICENSE](LICENSE) for terms.
