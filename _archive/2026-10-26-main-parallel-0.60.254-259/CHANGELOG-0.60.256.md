# 0.60.256 — AE1 revised: the engine is core, each system runs its own (sovereignty)

James, 2026-10-25: "clearglass still needs the automation for browser automation." · "sovereignty. like each system needs to be able to run on its own."

The 0.60.255 cutover put the one engine in the orchestrator and made Clear Glass a port client. His correction caught the flaw (dogfounding the *design*): browser automation is Clear Glass's own feature — a step would round-trip Clear Glass → orchestrator → back to Clear Glass's driver, and wouldn't run at all with the orchestrator down. That is not sovereign.

## The sovereign fix
By his placement axiom (used by ≥2 systems → the kernel), the engine **code is core**:
- `orchestrator/automation/{engine,cron,template,steps,dom,from-macro,templates,routes}.js` → `lib/automation/` (nodes.js already `lib/automation-nodes.js`).
- **Each system runs its own instance** from core: Clear Glass local for browser automation (its driver/mesh hooks — fast, standalone), the orchestrator its own for platform orchestration (RAID/agent hooks, serves `/automation/*` on :9000).
- Both `require` the kernel → **no system→system crossing** (boundary 10/10). Each runs on its own.
- The store is namespaced per process (`NEXUS_AUTOMATION_NS`) so the two never tick each other's workflows: Clear Glass keeps `brainos` (its existing browser workflows, untouched), the orchestrator uses `orchestrator-automation`.

This supersedes AE_D1's "the orchestrator" home (0.60.255, kept §0.3): the orchestrator still orchestrates (its instance); the engine is the kernel's because Clear Glass needs it too. The port client (`clear-glass/src/mesh/automation-client.js`) is removed.

## Proof (headless)
automation-engine 16/16, automation-v2 18/18, automation-nodes 8/8, automation-registry 11/11, test-system-boundary 10/10 (Clear Glass requires the engine from the kernel — no crossing). DG2 on AE1 = 0 created crossings.

## Remaining (his machine / later)
The live two-process run; AE4/AE5 (automation UI + agent-tools clients). Clear Glass's own browser automation now works standalone from core.
