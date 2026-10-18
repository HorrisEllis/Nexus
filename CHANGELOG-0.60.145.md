# 0.60.145 — 2026-10-17

James: "failure mode report thats also a macro to import into a cos test env. nexus nerve, spotlight and interaction field
for debugging. like look deeply at those systems. so this is a good direction?"

James: "lets do it. map it all, be thorough. there is probably more lurking around nexus that is useful"

This release is mapped, not built. No source code changed.

## The map

`docs/2026-10-17-failure-mode-report-phasemap.spec` 1.0.0 maps phases FMR0 to FMR11.

Every failure becomes a `.failure_mode` (cortex's record, with one writer) with a report, plus an executable `.debug_macro`.
The macro bundles:

- the code snapshot and its environment;
- the events that led in, cut by RFR2's clip;
- the agents' parts: the Ollama tape for local models, a fake-tab profile for remote ones;
- the UI steps, addressed by semantic-tree address;
- the expected failure.

The macro replays in a sealed COS compartment, where RFR2's `validateClipStability` judges whether the failure was
reproduced. The same macro then proves the fix and stays as a regression test.

Nerve and the interaction field are the **view**: the timeline and the spotlight replay. By his own Nerve invariant, they
are never the evidence.

## The sweep: what was lurking

- **His own design from 2026-09-12 already exists:** `cortex/self-heal/failure-mode-forensics.js` writes `.failure_mode`
  nodes (causal chain, sigma delta, ripple/wave/tidal class) and `.debug_macro` nodes. The macro is marked
  `executable: false`, "no general executor exists yet". The 10-05 reproduction map never named it and planned a second
  macro file. Now joined (addendum there).
- **Agent failures can be replayed offline today:**
  - `ollama/lib/tape.js` replays local model calls with Ollama stopped;
  - `tests/sim/fake-tab.js` speaks Guardian's real protocol in slow, silent, error, partial and other modes;
  - `guardian/lib/chat-transcripts.js` holds every remote reply.
- **The pieces it builds on already exist:**
  - `lib/cos-debug-report.js` reads a failed test into frames and code;
  - `cos/playground/compare.js` compares branches;
  - the semantic tree gives addresses that survive class renames;
  - `clear-glass/src/automation/nodes.js` already bundles what a workflow needs to run elsewhere;
  - the Debug tab is where the report lands.

## Found

- **All 9 `.failure_mode` nodes in the tree are hollow:** `memory_pressure`, no root, no conditions, no compound class,
  no macro.
  - Only the self-heal ladder writes them. A failed test, a stuck phase or a failed gate never becomes one.
- **Only 72 of 1,467 tracked ledger rows (4.9%) carry `causedBy`,** so RFR2 has nothing to walk. This is a sample from git,
  not his live machine; FMR0 measures there.
- **Intelligence crystallises boot events as "failure precursors"** (his log: "component: registered … 161×"):
  co-occurrence without causal edges.
- **The forensics module says RFR2's kernel is absent.** It has existed since 07-24.
- **No system has an event replay route.**
- **The first proof case is IM1.** The caller waits 300,000 ms (`lib/repo-agent.js:724`), Guardian waits 900,000 ms,
  and Gemini thinks longer than the caller waits. It reproduces with the fake tab, offline.

## Decisions

- **Decided by his axioms:**
  - macros can leave the machine, always masked at cut time;
  - Guardian gets the first replay route, then versionium;
  - Nerve is the view, never the evidence (his invariant).
- **His:** FMR0a, whether every failure replays automatically or only on request. The coder recommends: on request, plus
  automatically on recurrence or STUCK.

## Proof

- The map and both addenda parse as YAML.
- All 62 paths the map cites exist in the tree.
- Every count was made in this session on the 0.60.144 tree.
