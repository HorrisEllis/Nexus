# 0.60.298 — COS manages the system: the spec for the new orchestrator/autopilot and its UI

James, 2026-10-30:
> "look at all of the phases for each cos and soveriegn phases. then lets spec the ui for the cos to manage the system. This will be the new orchastrator/autopilot."

## Read first: 13 COS and sovereignty maps

| Map | State |
|---|---|
| cos-app | COSA0c–COSA7 built (0.60.87–0.60.93); COSA5, COSA8 open |
| cos-console | CON1–CON8 open |
| cos-spine | CS1–CS11 open, nothing built |
| cos-manager | MG0b–MG14 open, nothing built (before this release) |
| cos-services | SV0 done (0.60.235); SV1–SV4 open |
| guardian-into-cos | GD0–GD1 done (0.60.240); GD2–GD8 open |
| loom-into-cos | LM0–LM4 done (0.60.241–242); LM5 open |
| sovereign-systems | SV0 done (0.60.244), SV1 partly, SV1_D1 his to choose; SV2–SV8, CS12–CS21 open |
| track-b, versionium-sovereign, observability, node-architecture, testenv | closed or retracted |

**Found:** autopilot (`lib/nexus/autopilot.js`, 2,022 lines) is a second supervisor beside COS. `cos/app/runtime.js` says so in
its header ("COS does not become a second supervisor: it starts the project's OWN supervisor"). COS's own `process-runner`,
`watchdog` and `proc-stats` go unused for it. autopilot's `:7799` is called by the orchestrator, Clear Glass, the tablet and Idearium.

## Specced (MG0b)

`cos/spec/cos-manager.spec`: 8 schemas, 8 interfaces and 26 modules.
- **The one supervisor in COS** (`cos/manager/supervisor.js`, `server.js`). It does everything autopilot does: boot, backoff, circuit, memory floors, on-demand start and idle stop, the ledger. The boot plan is read from each system's own `compartment.json`, not from a list in COS. The defaults equal autopilot's constants, so moving it changes no behaviour.
- **autopilot's door kept** on `:7799`, so no caller changes. `/files` and `/tables` are marked as the legacy crossings they are.
- **autopilot hands over.** It becomes a launcher, and its old body is archived.
- **The backend** MG1–MG10, as already mapped.
- **The UI**, every page its own component (`cos/ui/<page>/index.html, page.css, page.js`), declared in the contract, shaking hands before any call:
  - core, the shell (top bar, tree, router), Overview, Ledger and Proposals;
  - the compartment's tabs: Overview, Rewind, Versions, Diagnostics, Data, Resources, Settings, Macros, Tools and Logs;
  - Catalog, Automation and Categories;
  - cos.exe as the window, its CLI, live thumbnails.

## Map

`docs/2026-10-24-cos-manager-phasemap.spec`:
- MG0b SPECCED.
- Every MG phase names `spec:` and `blocks:`.
- Decision **MG_D4_cos_is_the_autopilot**, TO CONFIRM.
- New phases: MG15 (the supervisor in COS), MG16 (the door), MG17 (the handover), MG18 (the first screen).
- Build order: MG0b → MG15 → MG16 → MG18 → MG17, then the rest.
- Per-phase `.phase` and `.graph` files regenerated. The old graphs were moved to `_superseded/`.

## Proof

- `node tests/modules/test-substrate-spec.test.js`: SS-01..03 3/3, with cos-manager added to the list.
- The spec's graph: 26 modules, 8 schemas, 8 interfaces, none below depth 1.0, no BLACK nodes.
- The phase DAG over all 201 maps: MG15–MG18 and MG_D4 resolve, with no dangling references and no cycles.

## Open

- **MG_D4 is the coder's reading.** Two things to confirm:
  - Is "the new orchastrator/autopilot" the supervisor plus the management screen, with the `:9000` router staying?
  - Is CS13 (moving autopilot to `orchestrator/`) superseded?
- Spec only: no code in this release.
- Not recorded in Versionium from this sandbox. The boot sync records it on his machine (§17.12).
