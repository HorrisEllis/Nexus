# NEXUS — Sovereign Self-Hosting Platform

NEXUS turns one machine you control into a complete hosting stack — your own DNS, web
server, mail server, firewall, certificate authority, and one-click app installer — with
no cloud provider, no recurring hosting bill, and no third party holding your data.

This document is the full reference. The same content, formatted for quick browsing, is
also built into the control panel itself under **Documentation** once NEXUS is running.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [DNS & Domains](#dns--domains)
4. [Networking — Making Your Server Reachable](#networking)
5. [Security](#security)
6. [Apps & Hosting](#apps--hosting)
7. [The Control Panel](#the-control-panel)
8. [CLI Reference](#cli-reference)
9. [API Reference](#api-reference)
10. [Engine Reference](#engine-reference)
11. [Troubleshooting](#troubleshooting)

---

## Quick Start

**Requirements**
- Node.js 18 or newer
- A machine that stays powered on — desktop, mini PC, Raspberry Pi 4+, or a cheap VPS
- A registered domain name (any registrar)
- A router with UPnP enabled (default on most consumer routers) — or willingness to
  forward ports manually

**Five steps to fully online:**

```bash
# 1. Install — answer the prompts, or press Enter to accept defaults
node install.js

# 2. Point your domain at your server (see DNS & Domains below)

# 3. Start the platform — all engines boot in a few seconds
node nexus.js up

# 4. Open the control panel and run the Setup Wizard
#    http://localhost:9000 -> Setup Wizard -> "Run Full Setup"
#    This automates port forwarding, firewall rules, and certificate issuance.

# 5. Bookmark the panel. You're live.
```

On Windows, no administrator rights are required — NEXUS defaults to ports 8080/8443
unless you choose 80/443 during install, and falls back gracefully either way.

---

## How It Works

NEXUS runs 23 independent engines as separate Node.js processes, supervised by a single
kernel (`nexus.js`). Each engine does one job and talks to the others over a local IPC
channel.

If an engine crashes, the kernel restarts it automatically. `node nexus.js status` shows
live health for all of them.

---

## DNS & Domains

You have two options for getting traffic to your server.

### Option A — Simple A Record (fastest)

Keep your registrar's default nameservers. Add a single DNS record pointing your
domain at your public IP. Works within minutes. Best for one domain, one server.

### Option B — Delegate Nameservers to NEXUS (full control)

Run your own authoritative DNS. Every record afterward is managed from the panel's DNS
Zone Editor with no further registrar trips.

**Setup (GoDaddy example — other registrars follow the same pattern):**

1. In your registrar, find **Hostnames** (sometimes "Glue Records"). Create two:
   `ns1` pointing at your public IP, and `ns2` pointing at your public IP.
2. Go to **Nameservers** -> "Change Nameservers" -> enter `ns1.yourdomain.com` and
   `ns2.yourdomain.com`.
3. Save. Propagation: a few minutes to 48 hours.
4. In the NEXUS panel: **Domains -> Nameserver Setup**, pick your registrar for exact
   instructions, then click **Apply to DNS Engine**.

### Keeping Your IP Record Current

Home IPs change. The **Auto DNS** panel page pushes an update automatically whenever
your IP changes — GoDaddy API, Cloudflare, or the free options DuckDNS and dynv6.

---

## Networking

### Why Port Forwarding Matters

Your router blocks all unsolicited incoming connections by default. For the internet
to reach NEXUS, your router needs an explicit rule sending inbound traffic on port 80
(and others) to this machine.

### Automatic Forwarding (UPnP)

The `firewall` engine automatically discovers UPnP-capable routers at startup and
requests port mappings for the ports NEXUS needs: 80 (HTTP/ACME), 443 (HTTPS), 53
(DNS, only if you delegated nameservers), 587 and 2525 (mail).

No router login required on networks where UPnP is enabled — the large majority of
home routers ship with it on. Trigger it manually anytime:

```bash
node nexus.js upnp:open      # forward all NEXUS ports
node nexus.js upnp:status    # check if a gateway is reachable
node nexus.js upnp:close     # remove the forwards
```

### Manual Forwarding (if UPnP isn't available)

Some networks disable UPnP. If `upnp:status` reports no gateway found, forward the
ports above manually in your router's admin panel (commonly `192.168.1.1`).

### OS-Level Firewall

The `firewall` engine also applies matching allow rules to your computer's own
firewall using `netsh` (Windows) or `ufw`/`iptables` (Linux):

```bash
node nexus.js firewall:apply    # apply OS firewall rules
node nexus.js firewall:detect   # show which tool is in use
node nexus.js firewall:list     # show current OS rules
```

### Tunnel Fallback (no public IP at all)

If you're behind carrier-grade NAT, the **Tunnel** panel page probes outbound-only
exposure strategies (Cloudflare, ngrok, serveo, localhost.run) — no inbound ports
required.

---

## Security

**Firewall & rate limiting** — in-process rate limiting and auto-bans, independent of
router/OS-level rules. Manage from the **Firewall** panel page.

**API keys** — generate scoped keys from **API Keys**. Shown once at creation.

**TLS certificates** — a free Let's Encrypt certificate is requested automatically and
renewed daily. Requires port 80 reachable from the internet for the HTTP-01 challenge.
Falls back to a self-signed cert locally until then.

---

## Apps & Hosting

**App Catalog** — one-click installs for WordPress, Ghost, Nextcloud, Gitea, n8n,
Vaultwarden, and more. Each install configures DNS, TLS, and proxy routing
automatically.

**File Manager** — browse and edit files under your NEXUS install from the panel.

**Multi-tenant hosting** — the **Users** page provisions accounts with their own
subdomain, plan tier, and optional database.

---

## The Control Panel

Open `http://localhost:9000` for the full NexusPanel interface — Setup Wizard,
Dashboard, Engines, Monitor, Log Viewer, Users, Domains, DNS Zone, SSL, App Catalog,
File Manager, Mail, Storage, Cron Jobs, Firewall, VPN, API Keys, Auto DNS, Tunnel,
Peer, Billing, and Settings.

---

## CLI Reference

```
node nexus.js up                start all engines
node nexus.js stop              graceful shutdown
node nexus.js status            engine health summary
node nexus.js restart <name>    hot-restart one engine
node nexus.js logs <name>       last 100 lines of an engine's log

node nexus.js upnp:open         auto-forward ports via UPnP
node nexus.js upnp:close        remove UPnP port forwards
node nexus.js upnp:status       check if a UPnP gateway is reachable

node nexus.js firewall:apply    apply OS firewall rules
node nexus.js firewall:remove   remove OS firewall rules
node nexus.js firewall:list     show current OS firewall rules
node nexus.js firewall:detect   show which OS firewall tool is active
```

---

## API Reference

Base URL: `http://localhost:9000`. Authenticate with `Authorization: Bearer YOUR_API_KEY`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/ui/status` | All engine health/uptime |
| GET/POST/DELETE | `/ui/dns` | DNS zone records |
| GET | `/ui/catalog` | List available apps |
| POST | `/ui/catalog/install` | Install an app |
| POST | `/provision/user` | Create a hosted user account |
| GET | `/ui/tunnel/status` | Active tunnel URL/strategy |
| GET | `/ui/peer/identity` | This node's P2P identity |
| POST | `/ui/sysfw/apply` | Apply OS firewall rules |
| POST | `/ui/upnp/open` | Forward router ports automatically |
| POST | `/ui/upnp/status` | Check UPnP gateway availability |

---

## Engine Reference

Every engine ships with a stable `COMPONENT_ID` and `COMPONENT_UUID` stamped on every
log line and IPC message. See `component-manifest.json` in the project root.

```
nexus-build/
├── nexus.js              kernel — supervises all engines, exposes the CLI
├── install.js             one-time interactive setup
├── engines/
│   ├── _engine.js          shared SDK every engine requires
│   ├── components/
│   │   ├── sysfw.js         OS-level firewall rule manager
│   │   └── upnp.js          automatic router port forwarding
│   ├── dns.js / ddns.js / tls.js / proxy.js / relay.js
│   ├── firewall.js / auth.js / signal.js / smtp.js
│   ├── cache.js / storage.js / queue.js / billing.js
│   ├── monitor.js / optimizer.js / catalog.js
│   ├── registrar.js / provisioner.js / glue.js
│   ├── peer.js / tunnel.js / autodns.js
│   └── ui.js                this control panel
├── conf/                  generated config, one file per engine
├── logs/                  one log file per engine
├── sites/                 your hosted content
└── state/                 embedded state database
```

---

## Troubleshooting

**"ACME failed: NXDOMAIN"** — Your domain has no DNS record pointing at your server, or
NEXUS is configured for a different domain than your registrar setup. Check
**Settings** and run the Setup Wizard's DNS check.

**"HTTP port 80 already in use"** — Another process is holding port 80. Stop it, or run
`node nexus.js stop` first if a prior instance didn't shut down cleanly.

**Monitor shows engines as DOWN that are actually running** — Usually a startup timing
issue, self-corrects within 30-60 seconds.

**UPnP: "no UPnP gateway responded"** — Your router has UPnP disabled. Enable it, or
forward ports manually.

**'wmic' is not recognized** — Harmless. NEXUS uses PowerShell's `Get-Process`
underneath regardless.

**Engines won't start / port conflicts** — Run `node nexus.js status` to see which
engine claimed which port.
