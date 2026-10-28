# 0.60.248 — BCR2 LM0–LM3: Loom reaches into no other system (from brave-cori), and no more stray folders at boot

James, 2026-10-24: "can you resolve this?" (claude/brave-cori-eczug1)

This ports brave-cori's 0.60.241, which carried his words: "Isn't loom in a compartment already or clearglass?" · "Do it."

## Ported (cherry-picked, resolved against RF2)
- **Heartbeat:** the pulse from core (`lib/pulse.js`), not through nexus-connect.
- **Model calls:** `lib/ollama-port.js`, core's door to the Ollama bridge. It calls in-process when the bridge has provided itself,
  otherwise the bridge's new `POST /api/generate` (`ollama/routes/generate.js`). Loom's agent suite uses it, not ollama-client in its own
  process.
- **Loom's own store** (`loom/lib/store.js`, over `lib/system-store.js`): hooks, hook_bindings, loom_changelog and phasemap_history.
  Said plainly, since it touches stored data: on first run the four tables are **copied** home from cortex's store once. The rows in
  cortex's store are kept, so nothing is lost and it can be undone. His decision, "Do it.", is on the brave-cori line.
- **Readers through Loom's routes:** Architect's hook view and agent-build-loop's phase history.
- Loom: **0 ways out** (it was 5).

How it was brought over: brave-cori's 2,000 regenerated phase nodes were not merged; main's nodes were regenerated. Its lines for the
spec-compiler port and raid-port in loom's run-state map were left out: raid-port is already mapped on main, and the spec-compiler port
comes with EW2. Brave-cori's proof-of-competency entries are kept, under a marker saying where they came from.

## Found by booting, fixed at the cause
After 0.60.247's fix, a stray `bridge/input` still appeared on every boot. A traced boot named the code:
`orchestrator/lib/contract-poller.js` scans each system's inbox for stuck contracts. Its own list of systems still had `bridge` (retired)
and was missing most of the 15. And `lib/contract-queue.js` made the folder even just to read it.
- Readers (`pending`, `findStuck`) now pass `create: false`. A missing inbox is an empty one.
- The poller reads Idearium's list (`lib/nexus-self/systems.js`), the one truth.

## Proof
test-loom-into-cos 4/4. On main, LI-04 asserts `outClean`, because sovereignty counts both ways since 0.60.244. Loom's inbound side is
SV6. Also: hook-ownership 8/8, contract-queue 17/17, contract-intake 6/6 and 3/3, SV 9/9, SB 10/10, CT 8/8. The ratchet is green.

Booted: Loom answered `/api/hooks`, the hook sync created 342 (0 failed), and Architect was up. A traced boot made no stray folder.
