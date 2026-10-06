# 0.39.359 — 2026-10-06

James: "the daw repo had none of the right files." · "show me the system spec file tree. something should be showing something similar to guardian" · "yes. build them. then we can have it a cos template with reusable components. what do you think?"

The DAW repo got the COS blueprint `ai-assistant` (chat UI, agent, memory, tools). The agent was supposed to plan the rest of the tree, but that step failed, and the planner quietly fell back to the template's files. Nothing in Nexus produced a system in Guardian's shape. Three phases of the build-from-the-spec map (1.20.0) were open for exactly this: SB28, SB30 and SB31.

## SB30: the skeleton, a COS template with reusable components
The skeleton is a new COS archetype, **`nexus-system`** (`cos/archetype/nexus-system.js`). It is assembled every time it is read, from three sources:

**1. Its own folder, `cos/archetype/nexus-system/`:**
- `server.js` serves the route nodes, plus `/health`, `/contract` and `/nodes/:type[/:id]`.
- `cli.js` runs the command nodes.
- `lib/system.js` boots the system and checks the component shape.
- Configuration: `config.js` and `<system>.config.json`.
- `compartment.json`.
- `registry-components.js`, which has a slot marker.
- `interaction-contract.json`. `GET /contract` adds every route node to it.
- `event-taxonomy.js`, generated from the event nodes.
- The core component (`lib/core.js`) and its seed nodes: component, capability, two commands, events, routes and a hook.
- `spec/<system>.spec`, in the architecture template's sections, and its node taxonomy.
- `tests/skeleton.test.js`.

**2. Ten reusable components, in `cos/archetype/components/`.** Each is a folder of files laid out where they go in a system. Each is also offered on its own as `cos-component:<id>`, and brings the components it requires.

| Component | What it does |
|---|---|
| atomic-write | Writes a file whole or not at all. It retries the Windows `EPERM`/`EBUSY` rename that your boot log showed jaa hitting. |
| envelope | Reads, writes, fingerprints and validates node files. |
| jaa-store | A JAA table per node type, with a ledger beside each. |
| ledger | Every event, per session, timestamped. |
| bus | Every event goes to the ledger first, then to its listeners. |
| node-index | Refuses a node that fails its schema. |
| listener | A node dropped into its folder goes live, and capability bundles stay current. |
| heartbeat | Uptime, node counts and refused nodes, on an interval. |
| handshake | Verifies another system's contract before calling it. |
| commands | The door: a command node runs through the registry. |

**3. The system template's node schemas**, written as JSON. JSON is also valid YAML, so Nexus's own node reader reads them unchanged.

What a system built from it can do:
- **It stands alone.** Nothing in it requires anything outside its own tree except Node built-ins.
- **It grows from nodes alone.** Dropping in capability, command, event and route nodes gives it a new capability without a restart and without touching code. The component nodes are laid over the registry.

## SB28: genesis 1.4.0 is that skeleton
- Genesis's `GENESIS_FILE_TREE` catalog is the `nexus-system` archetype, file for file: 45 files, 6 layers, wiring clean.
- `cos/archetype/genesis-catalog.js` generates the catalog. Each file's `depends` are its real `require()`s plus the files it reads at run time.
- A map at the top of the catalog shows where each of the 17 domains now lives.
- The kernel/spine/compartments/lattice/nerve/tv-shell catalog is kept whole in `templates/_archive/genesis-1.3.0.spec`.

## SB31: every new repo is the skeleton, and the idea slots in
**With the skeleton, the agent plans only the slot.** The slot is `lib/`, `tests/` and `ui/`: components, each with a capability and commands. Anything planned outside it is refused, with the reason.

**Slotting a component in needs no dispatch.** It writes:
- the component's registry entry;
- its component, capability, command, event, route and hook nodes.

Only the component's own code is left to build. Its purpose line names the functions it must export.

**Where the skeleton is used:**
- **Codegen** (`POST /api/spec-engine/specs/:uuid/codegen`):
  - If the spec has a registry, the code repo is the skeleton with that registry slotted in (`skeleton + registry`, no agent asked).
  - Otherwise, the agent's components are slotted in (`skeleton + agent`).
  - If nothing slots in, the request fails with a 422 and nothing is made.
- **Spec creation** (`POST /api/spec-engine/specs`):
  - Genesis is still the default for a system spec, and now means the skeleton. `templateIds` still records it.
  - If the slot is empty, the spec is still made, and the response says so (`plan.slot.empty`, `plan.warning`).
- **The old plans are still available:** pass `body.skeleton === false` to codegen, or `body.fileTree === false` to spec creation.

**Planner changes** (`lib/file-tree-plan.js` 0.2.0):
- The COS template variables `{{slug}}`, `{{SLUG}}`, `{{uuid8}}` and `{{description}}` are now filled, in paths as well as contents. `web-server`'s `{{slug}}` was never filled before.

## Proof
- **New: `test-system-skeleton`** passes **8/8**:
  - genesis matches the archetype, regenerated byte for byte;
  - a laid-out system passes its own test (boot, routes, CLI, a dropped node, a capability added from nodes alone);
  - the components resolve their requirements;
  - two unrelated ideas (a DAW and a recipe box) each get the skeleton with only their own components slotted in;
  - an empty slot is refused or reported;
  - the slot's bounds are enforced;
  - the `EPERM` retry works;
  - a system spec is the skeleton.
- **Updated, now passing:**
  - `test-genesis-and-architecture-spec` **7/7**.
  - `test-manifest-phase1` **18/18**. Its tooling tests now use the archived 1.3.0 as their fixture.
  - `test-registry-drives-build` **5/5**. RD-05 now expects the skeleton plus the registry; only the registry's 5 files are left to build.
- **Unchanged and passing:** `test-file-tree-plan` 63/63, `test-idearium-codegen` 6/6, `test-system-template` 5/5.

## Not done
- **The workshop's bare repo is unchanged.** It is a document, not code; its code repo comes from codegen.
- **The DAW repo isn't re-planned.** Run codegen on its spec again (`again: true`) to get the skeleton with the DAW slotted in.
- **`ui/` isn't generated.**
