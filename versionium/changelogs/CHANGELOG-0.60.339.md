# 0.60.339 — Emerge, from its own repo, a system COS runs (EAS3)

James, 2026-11-01:
> "lets make it a compartment. i want compartments in cos to automatically become nested compartments in idearium. like cos needs to be
> connected with ideariums repos"
>
> "the github repo not the one in lib already. i want that done now. then i want to start being able to use it."

## Built

- **`emerge/` at Nexus's root, from github.com/HorrisEllis/emerge** at `f023240` (the repo, not `lib/emerge`). All 269 files have their
  sha256 in `emerge/EMERGE.lock.json`.
  - `node scripts/emerge-lock.js` checks the lock; `--write` takes a new commit.
  - The lock lists one Nexus overlay: `compartment.json`'s runtime, so COS can run it.
- **COS runs it** in its compartment `nexus-self-emerge`, behind its wall (its folder and `node_modules` only), from its own door on
  :4900.
- **Registered:**
  - `lib/nexus-self/systems.js` names it, so Idearium's nexus-self nests it as a repo.
  - The ports table and the orchestrator's `/api/emerge/*` proxy point at its door. They used to point at the old IDE's :4242, which
    nothing served (one of the TV UI's noise sources).
- **Usable:**
  - Idearium routes `/api/emerge-system/*`.
  - Command rows for you and the agents: `emerge status`, `emerge modules`, `emerge module <name>`, `emerge check|run|build|test|synth
    <file.eg>`, and `emerge say "<your words>"`.

## Proof

`tests/modules/test-emerge-in-nexus.test.js` **4/4**:
- the lock holds, and a one-byte edit fails naming the file;
- Emerge is declared and registered;
- COS starts it walled, and `hello.eg` is checked and run through its door (it prints "hello from Emerge, 6 letters" and the fizzbuzz
  line). The wall refused nothing, and the lock still holds after the run;
- the rows build the right calls.

Also passing: `test-cos-supervisor` 8/8 and `test-compartment-declarations` 5/5, each now counting a system added after the handover.

## Not yet

- **The compartment → Idearium repo link for any compartment (CP9):** Emerge is nested through nexus-self for now.
- **`lib/emerge`'s callers moved to the door (EAS4).**
- **A screen for writing and running Emerge programs:** COS's cockpit shows Emerge, its logs and its contract.

## Versionium

This sandbox cannot reach his Versionium. On his machine, the boot sync records this release.
