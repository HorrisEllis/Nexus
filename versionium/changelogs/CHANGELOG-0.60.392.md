# 0.60.392 — Cortex's door (DO3a)

James, 2026-11-05: "they all need the door build". Said after: "Like I can’t just move a folder and have nexus run still that’s why they need
to use the cli and api routes for the server.js. Then connect through the door". And 2026-11-03: "the server.js is the process for each
system. It’s what cos manages. The spine and component registry for each system routes through there. Cli and api."

## Built
- `cortex/server.js`, Cortex's door, is the process COS starts. It answers from Cortex's own component registry
  (`cortex/registry-components.js`):
  - `GET /registry`: every component, with its route and grammar;
  - `GET /handshake`: system, version, port, component count and the registry's hash;
  - `POST /cli { line }`: runs the component whose grammar the line starts with, through its own route. A line that matches nothing is
    refused, with the list of commands.
- Every other request goes to `boot.js`'s routes, unchanged. `boot.js`'s listen became `start()`. Run directly, it still starts itself, so
  old launchers keep working until DO4.
- The launchers now name `cortex/server.js`: `cortex/compartment.json`, `lib/cli/compartments.js`, `lib/system-check.js`.

## Proof
- `test-cortex-door` 4/4. DR-02 records the route table through `boot.js` alone and replays it through the door: 14 GET routes, the same
  status and keys.
- `test-cos-supervisor` 8/8 (SV-08 now expects the door).
- `cortex-sse-broadcast` 2/2.
- `test-failure-modes` 8/1, as before this change.

## Open
- DO3b: `boot.js`'s handlers move into `cortex/routes`, one registry entry at a time.
- DO4: `boot.js` retired.
- Doors for Idearium (DO1), Architect (DO2), Clear Glass (DO5), and Orchestrator and COS (no phase yet).
- `/contract` still serves `interaction-contract.json`. Serving it from the registry is DO6's.
