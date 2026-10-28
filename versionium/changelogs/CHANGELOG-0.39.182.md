# v0.39.182 — idearium's spec builds become real cos compartments

Corrected course twice on this one before landing on the real shape —
recorded honestly rather than smoothed over:

1. First wrong turn: assumed cos had zero running infrastructure ("just
   two library files, never booted") — only checked `find cos -maxdepth 1`.
   Wrong. `cos/` is a large, mature system (CLI, host layer, 16 archetypes,
   11 blueprints, vault daemon, its own spec) that was simply never fully
   mapped before proposing a fix.
2. Second wrong turn: proposed building `cos/server.js` with its own port
   and HTTP API. Also wrong — `cos/spec/cos.spec` already states, in its
   own words, `port: null` — "CLI/library system, no HTTP surface of its
   own" — a deliberate design, not a gap. Building a networked cos service
   would have created a second, competing architecture next to the real
   one.
3. Real shape, confirmed by a real, already-working example
   (`lib/agent-tools/tools/sandbox/cos-compartment.js`, the same tool
   copilot already uses, dated 2026-08-12): any process calls
   `createHost()` (`cos/host/index.js`) directly, in-process. Multiple
   processes share compartment state via the same on-disk file — "COS-2:
   CLI first. COS-13: Host service is the authority." No server needed,
   none built.

## What "idearium uses cos" actually means (confirmed with James directly)

Not: idearium itself becomes a cos compartment (would mean short-
circuiting the real SISO gate pipeline for an always-on, already-trusted
system — the gate gauntlet is built for new, untrusted, spawned work).

Is: idearium's own sub-work — spec builds, spawned compilers/workers —
becomes real cos compartments, going through the gate pipeline normally.

**Built**: `idearium/spec-engine/compiler-t0.js`'s `emitStructure()` now
creates a real cos compartment (`idearium-spec-<specUuid>`) for every spec
build that doesn't already have one passed in, via the same
`cos-compartment.js` tool copilot uses — which dispatches through
`cos/cli/commands/create.js`'s real SISO gate pipeline (confirmed: "gate
runs before emit() returns", not skipped). Non-fatal if COS is
unavailable — a build this engine already knew how to run without a
compartment must not start failing because COS is down, same honest-
default posture the existing `_seedFromCompartment()` already uses.
`compartmentName` now returned in the build result.

`idearium/compartment.json`'s `cos.axioms` set to
`["cos is the source of all compartments. nothing less."]` (James,
verbatim) — noted honestly as the axiom for a system-identity-level
compartment binding that was NOT what this pass built, kept for if/when
that's actually wanted later.

`docs/nexus.spec` gets a real `cos:` system entry — the 5th system added
this way (after intelligence/loom/versionium/clear-glass last pass),
sourced from `cos/spec/cos.spec` directly, including its own `port: null`
design note so this file doesn't misrepresent it as HTTP-reachable.

## Test cleanup

Deleted `tests/modules/test-mco6-repo-compartment.js` — confirmed stale on
two independent grounds, not a guess: (1) it tests `compartmentId`
attachment via `bindRepo()`/`verifyBinding()`, imported from
`./compartment-binding.js`, a file confirmed not to exist anywhere in this
codebase or in the MCO7c-n182 handoff that referenced it; (2) it spawns a
real idearium server against the real, non-isolated data directory and
creates real specs named `mco6-auto-<timestamp>` with zero cleanup — the
direct cause of 30 orphaned chunk files found and deleted in
`idearium/data/nodes/chunk/` (gitignored, not tracked, cleaned via
filesystem delete).

Four other compartment-related test files
(`compartment-engine.test.js`, `idearium-phase-compartment-integration.test.js`,
`idearium-phase-compartment.test.mjs`, `mco10-compartment-dom-ledger.test.js`)
were checked and NOT deleted — they test a different mechanism
(`classify()`/`freeze()`/`spawn()`), and lacking the same data-isolation
as MCO7c's newer tests isn't itself evidence of being stale.
