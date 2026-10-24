# 0.60.234 — 2026-10-24 — the refactor tool reads and proposes: 22 folders into the 15 systems

James, 2026-10-24: "need to make the refactor tool from the phgases. so we can make each system sovereignfor the cos migratoin" ·
"15 systems. the rest of the folders need to migrate."

His rule from 2026-10-05: "There is only 15 systems. Not 27. Any system that's in idearium is a system, nothing more."

## What it is
The refactor tool the phases map (RF0 read, RF1 propose), built as his decision A of 2026-10-16: **a proposal engine**. It reads,
proposes, and moves nothing. RF2 applies it later, one phase at a time.

`lib/architecture-migrate.js` stands on two things that already exist (§8.6):
- `lib/nexus-self/systems.js`, which lists the 15 systems and their folders;
- `lib/system-boundary.js`, which scans every `require` that crosses from one top-level folder to another. It is the same scan the
  boundary ratchet counts.

## The rules (his axioms: code belongs to the system it serves; shared code is kernel)
| rule | when | home |
|---|---|---|
| R1 | exactly one of the 15 uses it | that system |
| R2 | `lib/` uses it, or two or more systems do | core (`lib/<folder>/`) |
| R3 | nothing uses it, and it uses exactly one place (not `lib/`, since everything uses the kernel) | where that place goes |
| R4 | no evidence | **unplaced, to confirm**. Never guessed. |

## The proposal for Nexus (`docs/2026-10-24-fifteen-systems-migration-phasemap.spec`)
22 folders. Each gets one move phase, ordered bottom-up (a folder moves after what it uses), and the map is DAG-clean.
- **→ a system (R1):** `architecture-spec` → idearium · `auth`, `contracts` → orchestrator · `mesh` → guardian.
- **→ core (R2, R3):** `cockpit`, `hooks`, `meta`, `siso`, `cli`, `emerge`, `emergence` (goes with warp), `nexus`, `warp`.
- **To confirm (R4, no edge evidence):** `erosmancer`, `jaa`, `remote-desktop`, `seams`, `security`, `sentinel`, `service`,
  `tablet`, `ui`.

## Doors
- `node lib/architecture-migrate.js [--write <file>] [--json]`.
- The row `system migrate [--write <file>]`, so every agent reaches it through `nexus.command`.
- Loom: `run-state-map.js` wires it to system-boundary and nexus-self/systems.

## Also mapped (`docs/2026-10-24-github-context-and-agent-settings-phasemap.spec`)
- **GH5, a GitHub agent tool** (his "maybe have a github  agent tool?"). It works through the same doors a person uses, and the
  token is never passed in or returned.
- **GH6, send a requested file** (his "and a tool to upload a rewquested file"). The file goes as a GitHub link, an attachment or
  pasted text, whichever the provider takes. Only files inside the compartment.

## Proof
`tests/modules/test-architecture-migrate.test.js` AM **3/3**:
- the four rules and the bottom-up order;
- on Nexus itself, none of the 15 is proposed to move;
- the proposal is a DAG-clean phasemap.

## Next
- Confirm the 9 homes.
- RF2: apply one phase at a time, staged, with the census and the tests after each move, and undoable.
