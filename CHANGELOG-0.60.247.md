# 0.60.247 — BCR2: the pulse is core's (from brave-cori), and the census no longer counts a stray folder

James, 2026-10-24: "can you resolve this?" (claude/brave-cori-eczug1)

This ports brave-cori's 0.60.236. Its changelog opened with his words: "We need the systems sovereign."

## Ported (cherry-picked, then resolved against RF2)
- **The pulse moves to core.** `orchestrator/lib/pulse.js` → `lib/pulse.js`. It uses Node built-ins only, and the old path re-exports it.
  Nine systems took their heartbeat from the orchestrator's folder; now they take it from core. No crossing into the orchestrator's pulse
  is left. `lib/nexus/nexus-connect.js` takes it from `../pulse.js` (nexus is in core since RF2).
- **ollama** takes the pulse straight from core, its last way out.
- **COS's compartment manager** takes its store from whoever boots it, instead of opening cortex's.
- **Both maps' addenda are kept** in the drawbridge map, main's first and brave-cori's under a marker saying where they came from (§0.3).

Not taken, because RF2 already did that work its own way on main: brave-cori's folding census in `lib/system-boundary.js`, its
`CHANGELOG-0.60.236.md` (main has its own 0.60.236), and its registry drafts and their test. The drafts come with the DB16 port.

## Found by booting, fixed
`lib/contract-queue.js` made each system's `input/` folder from the system's **name**. Since RF2, emerge lives in `lib/emerge`, so booting
made a stray top-level `emerge/input`, and the same for `bridge`. The census then counted those empty folders as two sovereign systems.
- The queue and RAID's intake (`cortex/core/raid/contract-intake.js`) find a system's folder through `lib/nexus-self/systems.js` `dirOf`.
- The census counts a folder only if Idearium's list names it, or it has code (components is a store with no code, and is still counted).

## Proof
architect pulse migration 6/6 · cortex heartbeat 4/4 · diagnostic pulse-watch 6/6 · contract-queue hardening 17/17 · contract-intake 6/6
and 3/3 · SV 9/9 · SB 10/10 · CT 8/8 · the ratchet is green.

## Found, not this change's (said, §1.2)
test-emerge-direct-compile EM-005 expects `_archive/2026-09-06-emerge-consumer-retired/consumer.js`, which was never committed. It fails
the same on main.
