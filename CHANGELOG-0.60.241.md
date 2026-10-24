# 0.60.241 — 2026-10-24

James: "Isn't loom in a compartment already or clearglass?" · "Do it."

**Neither one runs in a compartment yet.** Every system has a COS compartment (`nexus-self-<system>`, since 0.39.261), but each is only a
read-only mirror, and the seal on Loom's compartment template reads "not ready" for all of them. The coder recommended Loom first, because
only 5 of its requires point into other systems: one system running inside its compartment proves the whole path before the rest. He said
"Do it.", read as that (to confirm). Guardian resumes at GD2 afterwards. The map is `docs/2026-10-24-loom-into-cos-phasemap.spec`.

## LM0–LM3: Loom reaches into no other system

- **The heartbeat:** the kernel's pulse, as ollama took it in 0.60.236.
- **Ollama through its bridge:**
  - the bridge serves `POST /api/generate`, the one door: continued when cut, recorded on the tape, the caller named;
  - `lib/ollama-port.js` reaches it from any other system;
  - the code stays Ollama's, as you asked.
- **Loom owns its tables:** hooks, bindings, changelog and phase history are in Loom's own store, brought home from Cortex's with every
  row, and Cortex's copy is kept.
- **The readers go through Loom's routes:**
  - Architect has no hook registry of its own any more; it reads Loom's;
  - `agent-build-loop` reads the phase history from Loom's new route.

## Proof

- **Census:** Loom has 0 ways out and is sovereign (it had 5). Architect is down from 6 to 5. No new crossing.
- **Real boot** of Loom, the bridge and Architect, properly sandboxed:
  - Loom served its 4 hooks from its own store, and Architect read the same 4 through Loom's route;
  - Architect's `/api/hooks/validate` answered. It had never run: its handler sat after a `return`;
  - the bridge said "Ollama host unreachable", correctly, since there is no daemon in this container.
- **Tests:** test-loom-into-cos 4/4 (new). test-hook-ownership 8/8; its old pins are superseded and kept in the test's note.

## A correction

The 0.60.240 finding that "data-home ignores the sandbox" was wrong. The coder's proof script passed the sandbox helper's whole result
instead of its `.env`, so the system booted unsandboxed. The code was right. The 0.60.239 proof had the same mistake. Both records keep
what they said, with the correction added beside them.

## Found (logged)

Architect's local store is fixed at `architect/data`, so it writes there even in a sandboxed boot.

## Next

LM4: the seal reads ready for Loom, and Loom boots inside its compartment.
