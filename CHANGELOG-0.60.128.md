# 0.60.128 — 2026-10-17

James: "okay each system needs one right?"

James: "each system is soveriegn and self contained. use the compartments to isolated each system, integrate the
system-registry.js as the tunnel or drawbridge? then through that access the command line interface, and routes in the api
and toasts, the heartbeat system for status of the system using routes?"

## His decisions, recorded

His decisions are in `docs/2026-10-17-system-drawbridge-phasemap.spec`, addendum (b):
- Each system needs a registry.
- Each system is sovereign and self-contained, isolated in its own COS compartment.
- `lib/system-registry.js` is the tunnel. It is his 2026-09-06 "need a system registry." module: the 14 running systems
  with their port, health URL, phase, data folder and version. The CLI, the routes, the toasts and the heartbeat are
  reached through it.

The coder's reading, to confirm: one registry with two faces.
- `lib/system-registry.js` is the runtime face: where a system is and how to reach it.
- `lib/drawbridge-registry.js` (0.60.127) is the source face: what the system declares, checked against its code.

## Built

**DB13: the tunnel**, added to his module. `build`, `get` and `list` are unchanged, and `test-system-registry.js` still
passes 9/9. `tunnel(name)` gives one system's:
- runtime: port, health route, version, data folder;
- routes, as its own `registry-components.js` declares them. That file is the only part of a system the tunnel reads,
  because the registry is its door;
- commands: the CLI rows that reach those routes, matched by building each row's request;
- toasts, read from the registry when it declares them;
- COS compartment;
- what is missing, said in words.

**DB14: heartbeat over routes (partly built).** `heartbeat(name)` asks the system over its own health route. The answer is
one of:
- **up**;
- **degraded**: it answered with an error, or slower than 1 s;
- **down**: no answer;
- **unknown**: no health route.

Each answer comes with why.

Routes: `GET /api/system/tunnel`, `GET /api/system/tunnel/:name` (with the heartbeat), `GET /api/system/heartbeat`.
Commands: `system tunnel [<system>]`, `system heartbeat`.

## What it shows, measured

- **15 of 109 command rows** reach a route that some system's registry declares. **81** reach routes no registry declares.
  This is the CLI's own negative space: the commands work, but go through doors nobody wrote down.
- **No system declares its toasts.** The UI decides them in its own code (`idearium/ui/js/app.js`), which is why the UI is
  not yet disposable (DB15).
- **No system runs in a COS compartment yet** (DB11).
- **Three systems in the runtime registry have no registry of their own:** diagnostic, orchestrator and forge-shell
  (DB16).

## Still to do (in the map)

- **DB14 continued:** `lib/heartbeat.js` beating every system from the registry, with its degraded and dead events on the
  bus, kept across restarts.
- **DB15:** toasts declared in each registry.
- **DB16:** a drafted registry for every system that has none, cos first.
- **DB11:** each system in its compartment.
- **DB3:** calls through the tunnel.
- **DB7/DB12:** the UI on top, with its handshake.

## Proof

`tests/modules/test-system-tunnel.test.js`: ST-01..07 pass. ST-06 covers each heartbeat state with a fake fetch. ST-07
calls the real routes.
