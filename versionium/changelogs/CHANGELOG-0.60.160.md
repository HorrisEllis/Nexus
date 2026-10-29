# 0.60.160 — 2026-10-18

James: "can you add snowflake to the ui. it doesn't show up as a plugin."

The Tor-with-Snowflake transport (`src/net/transport-host.js`, NP1, 0.60.60) had a full backend, routes and CLI (`/cli/net/*`,
the `net` command) but **no UI**. The last step of the order of delivery — backend → route → command → **UI** — was never done, so
nothing in the app surfaced it. That's why it didn't show up.

## Why it isn't a plugin

Clear Glass's Plugins section lists webextensions (loaded from a manifest). Snowflake/Tor is a built-in **network transport**, not
a webextension, so it doesn't belong in that list. Its home is a settings section with the other network things.

## New section: Settings → Network

Chosen by James: "New Network section" (System group, beside Connections). `renderer/settings/sections/network.js` (+ `.css`):

- **Tor · Snowflake** — the live transport state (off / connecting / connected on its SOCKS port / failed), and a Start/Stop
  control. What it is, in a line: a bridge that reaches Tor where Tor is blocked by looking like an ordinary WebRTC call; it adds
  no cryptography of its own; it is isolated (own data dir wiped on stop, ports on 127.0.0.1, no Nexus secrets in its environment).
- **What it needs** — whether `tor` and a Snowflake client are found (Detect), fields to point at them, and the Snowflake bridge
  line. The line is set, never shown back in full; a line that isn't a Snowflake line is refused by the real service, and said.
- **Routing** — the default posture (direct / block / transport) and the route rules, each addable and removable.

It reads only `src/net/service.js`, through the same bridge the Library uses (`/cli/net/*`). No route is decided in the UI; it
floats on top (DB7).

## Proof

- `tests/modules/test-cg-network-ui.test.js` 4/4, driven in Clear Glass (no Playwright, CG-001b) against the **real** net service:
  the section renders with no errors; a Snowflake bridge line is set through the form and a non-Snowflake one refused; Start is
  refused until both programs are found and a bridge is set, then starts, then Stop stops; the default and a route rule go through
  the real service and show in the UI.
- Registered in `run-all`; wired in `loom/maps/run-state-map.js`.

## Note (for a later pass, his security question)

The route rules here are a blocklist, not a scope allowlist. The self-hardening idea we discussed — a target must be declared
in-scope before an agent crawls or ingests it, and the `transport` path gated the same way — is not in this release; this only
surfaces the transport that already existed.
