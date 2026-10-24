# docs/2026-10-24-loom-into-cos-phasemap.spec
# Loom sealed and moved into its COS compartment: the first system to run inside one, proving the path end to end before the rest.
# MAPPED 2026-10-24, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec. Context: docs/2026-10-23-cos-spine-phasemap.spec
# (CS_D7 sovereign first), loom/templates/cos-compartment.js (DB11, 0.60.134: the seal), docs/2026-10-24-guardian-into-cos-phasemap.spec
# (Guardian, paused at GD1 for this).

origin:
  date: 2026-10-24
  james: '"Isn''t loom in a compartment already or clearglass?" · "Do it."'
  context: >-
    The coder had just finished Guardian's GD1. He asked whether Loom or Clear Glass already ran in a compartment. Neither does. Every system has
    a compartment (nexus-self-<system>, idearium/repo/nexus-self.js, 0.39.261), but each is a read-only mirror, and the template's seal
    reads "not ready" for all of them. The coder recommended finishing Loom first, because only 5 of its requires point into other systems:
    one system run inside its compartment proves the whole path (seal, move in, boot, reached through its routes). Then Guardian, with
    the path proven. He said "Do it." Read as that recommendation (a reading, to confirm).

census:
  out:
    - loom/server.js -> cortex/memory/jaa-db.js          (data: hooks, hook_bindings through lib/hook-registry.js)
    - loom/lib/changelog.js -> cortex/memory/jaa-db.js   (data: loom_changelog)
    - loom/scanners/phasemap-map.js -> cortex/memory/jaa-db.js  (data: phasemap_history)
    - loom/server.js -> nexus/nexus-connect.js           (the heartbeat: startHeartbeat)
    - loom/agent-suite/index.js -> ollama/lib/ollama-client.js  (generateWithOllama: callOllamaRaw in-process)
  readers_of_its_data_elsewhere:
    - architect/service.js reads hooks and hook_bindings from Cortex's store (its read view, "loom owns writes")
    - lib/agent-build-loop.js tails phasemap_history from Cortex's store
  in: "36 requires of loom's files from other systems. They do not block the seal (it counts ways out). In a compartment they keep working only while the tree holds a copy: routed after, in LM5."

decisions:

  LM_D0_loom_first:
    status: DECIDED 2026-10-24 (his, read as the coder's recommendation; to confirm)
    james: '"Do it."'
    chosen: "Loom before Guardian, to prove the compartment path end to end. Guardian resumes at GD2 afterwards."

  LM_D1_ollama_through_its_bridge:
    status: DECIDED 2026-10-24 by his axioms
    chosen: >-
      The ollama bridge serves POST /api/generate (synchronous: model, prompt, system, temperature, caller), and lib/ollama-port.js is the
      kernel's door to it: in-process inside the bridge, its route everywhere else. The code stays Ollama's (his 2026-10-07 rule: "make sure
      the ollama additions stay with ollama"), and every call is still recorded on its tape (OR1, the one door). The agent-suite's direct
      HTTP to the daemon stays as the explicit standalone path, used only when the bridge is unreachable, and it says so.
    axioms: "§5.2 one door, DB6 a capability is a route, §1.2"

  LM_D2_loom_owns_its_tables:
    status: DECIDED 2026-10-24 by his axioms (his 2026-10-10: "all data is the relative systems job to create, read, manage")
    chosen: >-
      hooks, hook_bindings, loom_changelog and phasemap_history live in Loom's own store (lib/system-store.js openStore('loom'): loom/data/jaa),
      brought home once from Cortex's, whose rows are kept (§0.3). Readers elsewhere read through Loom's routes: Architect's hook read view,
      and agent-build-loop's phase history.

phases:

  LM0_the_heartbeat:
    layer: foundation
    status: DONE 0.60.241 — the kernel's pulse
    depends_on: []
    files: [loom/server.js]
    does: "startHeartbeat from nexus-connect → the kernel's pulse (lib/pulse.js createPulse), as ollama took it in 0.60.236."
    proof: "loom loses its nexus/ edge"

  LM1_ollama_through_its_bridge:
    layer: backend
    status: DONE 0.60.241 — POST /api/generate + lib/ollama-port.js; test-loom-into-cos LI-01/02
    depends_on: [LM_D1_ollama_through_its_bridge]
    files: [ollama/routes/generate.js (new), ollama/server.js, lib/ollama-port.js (new), loom/agent-suite/index.js, tests/modules/test-ollama-port.test.js (new)]
    does: "POST /api/generate on the bridge; the port; the agent-suite through it."
    proof: "the port reaches the route (in-process when provided, its route otherwise, said when down); loom loses its ollama/ edge"

  LM2_loom_owns_its_tables:
    layer: backend
    status: DONE 0.60.241 — loom/lib/store.js; LI-03 (every row brought home, Cortex's kept)
    depends_on: [LM_D2_loom_owns_its_tables]
    files: [loom/server.js, loom/lib/changelog.js, loom/scanners/phasemap-map.js, loom/lib/store.js (new), tests/modules/test-loom-into-cos.test.js (new), tests/modules/test-hook-ownership.js]
    does: "one loom/lib/store.js opens Loom's own store with its four tables and their migration; the three files use it."
    proof: "loom loses its 3 cortex/ edges; its hooks count the same before and after (brought home, nothing lost)"

  LM3_readers_through_its_routes:
    layer: backend
    status: DONE 0.60.241 — Architect's read view and agent-build-loop through Loom's routes; a real boot read 4 hooks through them
    depends_on: [LM2_loom_owns_its_tables]
    files: [architect/service.js, lib/agent-build-loop.js, loom/server.js]
    does: "Architect's hook read view and agent-build-loop's phase history read through Loom's routes (GET /api/hooks…, GET /api/phasemap/history)."
    proof: "nothing outside Loom reads Loom's tables from Cortex's store"

  LM4_the_seal_and_into_its_compartment:
    layer: integration
    status: OPEN
    depends_on: [LM0_the_heartbeat, LM1_ollama_through_its_bridge, LM3_readers_through_its_routes]
    files: [loom/templates/cos-compartment.js, cos/compartment/process-runner.js, idearium/repo/nexus-self.js]
    does: "the seal reads ready for loom; Loom boots inside nexus-self-loom (its folder read-write, the kernel read-only, nothing of another system) and is reached through its routes."
    proof: "Loom's health answers from inside its compartment; a hook written through its route is read back"

  LM5_the_ways_in:
    layer: backend
    status: OPEN
    depends_on: [LM4_the_seal_and_into_its_compartment]
    files: []
    does: "the 36 requires of loom's files from other systems, each to Loom's route or (a pure helper) to the kernel."
    proof: "no way into loom/ but its launcher"

## ADDENDUM 2026-10-24 (0.60.241) — LM0 to LM3 built: Loom reaches into no other system
- LM0: the kernel's pulse (lib/pulse.js) instead of nexus-connect's startHeartbeat.
- LM1: the ollama bridge serves POST /api/generate (ollama/routes/generate.js), the one door (callOllamaRaw: continued when cut, on the
  tape), caller required. lib/ollama-port.js calls it: the bridge provides it in-process, every other system uses the route. Loom's
  agent-suite goes through it; the direct daemon call stays only for when the bridge is not answering, and says so.
- LM2: loom/lib/store.js opens Loom's own store (lib/system-store.js: loom/data/jaa) with hooks, hook_bindings, loom_changelog and
  phasemap_history, brought home once from Cortex's, whose rows are kept. The hook registry, the changelog and the phasemap history use it.
- LM3: Architect has no hook registry of its own any more. Its read view is Loom's routes (GET /api/hooks, /:id, /validate, /graph), with
  the summary cached for /health. Loom serves validate and graph. Architect's own handlers for those sat after an unconditional return and
  never ran, so GET /api/hooks/validate always answered 404; it works now. lib/agent-build-loop.js introspect() is async and reads the
  phase history from Loom's new GET /api/phasemap/history.
- Proof:
  - Census: loom 0 ways out, sovereign (was 5); architect 6 → 5; no new crossing.
  - Real boot (Loom, the bridge and Architect, sandboxed properly this time; see the correction in the Guardian map): Loom served 4 hooks
    from its own store; Architect read the same 4 through Loom's route; /api/hooks/validate answered; the bridge's /api/generate said
    "Ollama host unreachable" (no daemon in this container).
  - Tests: test-loom-into-cos 4/4 (new); test-hook-ownership 8/8 (T-007's pins superseded, kept in its note).
- Found: Architect's local store is fixed at architect/data (createJAA(__dirname/data)), so it writes there even in a sandboxed boot (one
  file, event_log.jsonl, restored). Logged for Architect's own decoupling.
- Next: LM4, the seal and the move into nexus-self-loom.
