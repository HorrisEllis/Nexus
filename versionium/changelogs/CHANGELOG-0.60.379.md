# 0.60.379 — CA3: network settings, everything gated

James, 2026-11-02: "both but extensive settings for all of this. Get this done as soon as possible to push." · "Gate behind settings to open. Make a full detailed settings for network."

## The Network page (COS cockpit → Network)
Every way Nexus reaches out, or is reached from outside. **Nothing is open until he switches it on.**

**Outbound** (nothing on the router is opened):
- **Tunnel:** provider (Cloudflare or ngrok), token, and which systems go through it.
- **Rendezvous** (device to device): its address, this device's name, and the devices allowed to connect.

**Inbound** (opens a port on the router):
- **Router port mapping:** UPnP, PCP or NAT-PMP; the ports (external:internal:system); the lease.
- **DDNS:** provider (DuckDNS or Cloudflare), domain, token, how often it checks.
- **SSH:** port and allowed public keys. Keys only, always.

**TLS:** required for anything inbound, always; certificate and key files.

Also as `cos network` and `cos network set <path> <value>`, and as GET/PATCH /api/cos/network.

## The gate
Each engine that reaches outside (tunnel, relay, upnp, ddns, ssh) refuses to start unless both its section's master switch and its own switch are on, and it says which switch is off.

The page shows each engine's gate: open or closed.

## Safety
- **Tokens are never read back,** only "set" or "not set". A save that leaves a token out keeps it.
- **SSH keys-only and TLS for anything inbound are fixed** (§4.3).
- **Only a person changes these settings.** An agent is refused.
- **Every change** goes on COS's ledger and to Versionium, with secrets redacted.

## Proof
tests/modules/test-cos-network.test.js: 5/5. NW-05 runs the page in Clear Glass through the real cockpit and manager: switching the tunnel on and saving opens only the tunnel's gate.

## Still to do (CA2)
Each engine reading its own settings when it starts (the tunnel its token, DDNS its domain, and so on), and the per-compartment switch and throttle (CP6e).
