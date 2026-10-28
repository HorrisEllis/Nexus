# 0.60.60 - 2026-10-15

James: "im saying add support for snowflake, using cli, then you can add the commands to the agents, or make agent tools. what about an encrypted container, only accessable through clearglass?"

## What it does (CLI first, as he ordered)
- **Routes** (`clear-glass/src/net/policy.js`): a rule says who it is for (provider, url pattern, site, or caller) and how it goes: `direct`, `block`, `transport` (Snowflake/Tor), `socks5://host:port` or `http://host:port`, optionally per protocol (https, wss, ftp...). The most specific rule wins. Two equally specific rules that could both match and disagree are **refused when added**, and if one is already stored it compiles **closed**. Nothing is routed until a rule exists.
- **Fail closed:** the compiled proxy script never offers DIRECT as a second choice. A rule that points at the transport while it is down, and any `block`, compile to a port nothing listens on. `localhost` stays local.
- **The transport** (`transport-host.js`): tor with Snowflake as its bridge, as an isolated child: its own data folder, loopback-only ports, cookie authentication (no password anywhere), an empty environment, restart with backoff if it dies, never restarted after a deliberate stop, optional wipe.
- **Doors:** `/cli/net/*`, the `net` command (`idearium net status|routes|resolve|add|rm|default|start|stop|detect|bridge|paths|test`), and an agent tool `clear_glass_net`.
- **Agents can read, not change.** Status, routes, detect and resolve are open. Add, remove, default, bridge, paths, start and stop are refused for agents (the command marks them person-only). That is the coder's call: an agent that could remove a rule could send his traffic direct. He can open it later on purpose.

## What it does not do yet (status says so)
- **No leak test**, so nothing is ever shown as Verified.
- Only **agent windows** are routed. Provider-chat and login windows are not registered yet.
- No Browser or Settings screen yet (CLI first).
- tor and snowflake-client are **detected, not bundled**, and a **Snowflake bridge line is required** (`net bridge <line>`). It is not hardcoded: it changes, and Tor Browser ships the current one.
- Proxy credentials are refused until the encrypted container exists. Rules are stored in plain options.

## The encrypted container (mapped as NP19, not built)
Worth building. It unlocks proxy credentials and makes the kill switch instant: destroy the key and the container is unreadable even if deleting the files is slow. Built from the project's own `vault-key.js` and Node's AES-256-GCM, no new cipher. One thing must differ from the existing vaults: they fall back to a **hardcoded key** when the OS keystore is unavailable. The container must refuse to open instead. It protects data at rest; it does not stop malware running as him. Details and limits are in the map.

## Proof
`tests/modules/test-net-routes.test.js` NR-01..NR-24: precedence, collisions, the compiled script run in a VM (fail closed, hostile pattern), the transport with a fake tor (loopback only, empty env, backoff, wipe), the service touching only registered sessions, the agent tool and command refusing changes. **Unverified:** real tor, real Snowflake, Electron applying the script. Not mine, failing before this change: `AT-13` in test-agent-tools-and-graph and `EC-05` in test-event-contracts.
