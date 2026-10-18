# 0.60.152 — 2026-10-18

> Built as **0.60.148** on his line (another session, from 0.60.142; uploaded as nexus.zip on 2026-10-18). Renumbered **0.60.152** at the merge into main, which had already released 0.60.143–0.60.146. Version tags in this release's code comments (§0.60.148) are kept as they were written.

James: "what about using verctor memory or associative memory or the pattern engine. intuition to find context if needed. like
the tools the agents use, need persistence, maybe build each gate, hooked into the context panel. gates hold context for each
gate, maintain persistence, maybe with ids, in a table in the precommit compartment. that way the context isn't lost, its all
tangible and the system tracks progress, that way restarts don't affect it, context isn't lost, all timestamped, then we can
reuse contracts and responses, need a full index for approved and fullfilled contracts, cystalization memory. associative
lattice, every data node, is a node in the associative lattice, interconnected by the timestamp and cuasal graph. everything
reused from the inside out, then build only when necessary."

This release is mapped, not built. No source code changed.

## The map

`docs/2026-10-18-gate-memory-phasemap.spec` 1.0.0 maps phases GM1 to GM8. The sweep found the pieces already there:

- each gate's verdict and evidence, persisted in its `.contract`;
- exact reuse by contract digest (`lib/component-store.js`);
- vector memory, with a TF-IDF fallback;
- intuition over crystals, and the crystal lattice with its negative crystals;
- the associative lattice, which today holds system-to-system edges only;
- every system's node registry, with timestamped history;
- `lib/context-atlas.js`, one search across the stores;
- the Plan panel's Context card.

What is missing is the join, gate by gate:

- **GM1 — the gate record.** What a gate was given (each piece with its source), what came back, and how it ended, with
  every transition timestamped, as a `.gate` node.
- **GM2 — restarts resume from records.**
- **GM3 — the index of approved, fulfilled contracts**, for reuse, with STALE refs said.
- **GM4 — the lattice over every data node.** Causal, reference and temporal edges, each typed, read through each system's
  route.
- **GM5 — the context ladder, from the inside out:** fulfilled → lattice → intuition and crystals → vector memory → the
  agent's tools → a build.
- **GM6 — crystals only from what was approved**, and only on a causal path.
- **GM7 — the context panel, per gate.**
- **GM8 — agents have it.**

## His rule, applied

Every phase names its files, so every phase has a dependency graph. All eight graphs were run, and none shows a new crossing.

Three planned changes would cross a boundary if built the obvious way. Each is designed out before any code:

- **GM3:** the component store must not require cortex.
- **GM6:** the crystal lattice reads the contract index through cortex's route.
- **GM2:** run-state is told by route.

## Decisions

- **His (GM0a):** what "the precommit compartment" is. The words name nothing in Nexus. The coder recommends the repo's own
  compartment, beside its staged work.
- **Decided by his axioms:**
  - records are node files, and the table is their index;
  - a record holds references and hashes, never copies;
  - the ladder runs deterministic-first.

## Proof

- The map parses (8 phases).
- Every path it cites exists, or is marked new.
- Each phase's graph hash is recorded in addendum (a).
