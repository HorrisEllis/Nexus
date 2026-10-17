spec:
  meta:
    name:     decisions-by-the-axioms
    version:  1.0.0
    date:     2026-10-17
    release:  "0.60.135"
    uuid:     nexus-decisions-by-the-axioms-v1-0000-2026-1017-jamesbrooks-001
    status:   "DECIDED 2026-10-17 by his axioms (the coder applied them; each names its sections) — attribution corrected by addendum (a)"
    origin: >-
      James, 2026-10-17: "use the axioms in the docs for each disicio nthat doesn't show my competence"
    rule: >-
      Asked to stop handing him decisions that are technical, the coder decides them by docs/AXIOMS-v3.1.md and records which
      axioms decide each one. What stays his (USER_AUTONOMY, lib/constitutional-ai.js): what he meant by his own words, the
      direction of the work (what Nexus is for and what comes first), and any call he has already said is his ("thats on
      me"). A decision made here is the coder's, made by the axioms — never written as his. He can overturn any of them; the
      overturn is a dated addendum that quotes both (§0.3).
    the_test: >-
      A decision is his when the answer depends on what he wants (intent, priority, taste, meaning). It is the axioms' when
      the axioms already say which way: two options, one of them breaks an axiom or costs complexity no axiom pays for.

  decided:
    D1_lib_is_the_kernel:
      was: "DB0a (docs/2026-10-17-system-drawbridge-phasemap.spec) = IM0d (docs/2026-10-17-infrastructure-migration-phasemap.spec)"
      chosen: >-
        lib/ is the kernel: shared primitives, mounted read-only into every system's compartment. It owns no data type and no
        lifecycle of its own. lib/ requiring up into a system is a defect (IM4 closes the 255).
      axioms:
        - "§5.9 — a sovereign system owns its state, lifecycle, persistence and execution; a primitive with none of these is not a system, and mounting it is 'embedding, not annexation'."
        - "§0.5 / §16.7 — putting 1,547 primitive calls behind routes adds a layer that removes no complexity."
        - "§10.1 — one write authority per data type: lib/ is no data type's authority."
        - "§5.14 — the kernel stays replaceable behind its exports (its contract)."
      condition: "anything in lib/ that holds its own state or lifecycle is not kernel: it moves to the system it belongs to (IM4)."
    D2_routes_between_compartments_one_contract:
      was: "DB0b"
      chosen: >-
        Between systems: the routes and the CLI, always (his words: "using the api routes and the cli interface"). With each
        system in its own compartment, that is the only door that physically exists. Inside one system, its own code calls
        in-process. One contract and one handshake either way; the transport is the replaceable part.
      axioms:
        - "§5.10 — interaction through contracts only; the contract is the interface."
        - "§5.11 — every boundary performs a handshake before communication."
        - "§5.14 — replacing the transport must not change anything outside the declared interface."
        - "§5.9 — no system reaches inside another's internals."
      cost_said: "calls that were in-process become HTTP calls; DB3 measures the hot paths before the large pairs move."
    D3_the_ratchet:
      was: "DB0c"
      chosen: "the ratchet (contracts/drawbridge-baseline.json): today's crossings held, a new one fails a test, each closed one lowers the baseline."
      axioms:
        - "§0.4 — every change must increase optionality: the ratchet breaks nothing that runs today."
        - "§1.2 — nothing fails silently: observe-only would let new crossings in unseen."
        - "§3.1 — bottom-up: refuse-now would break Nexus before the foundation is moved."
    D4_state_in_git:
      was: "IM0a"
      chosen: >-
        His rule already decides the direction ("NEVER commit data/**", docs/CLAUDE.md). How it is done is the axioms':
        (1) derived projections — the generated nodes (capability, command, system, wire) and every data/node-index — are
        untracked in IM2: they regenerate at boot from the registries; (2) every other tracked data file is untracked only
        after a backup copy of it exists outside git, because untracking deletes the file from his working tree on his next
        pull; (3) .gitignore covers data/** once both are done.
      axioms:
        - "§10.2 — projections are derived, not written: a generated node is a projection of the registry; versioning it twice is a competing truth layer (§10.3)."
        - "§0.3 — information must never be lost: a pull that deletes his state is loss, so backup first (REVERSIBILITY)."
        - "§2.2 — the storage device is the source of truth: the data stays on disk, owned by its system."
    D5_changelogs_in_docs:
      was: "IM0b"
      chosen: "the 336 CHANGELOG-*.md move to docs/changelogs/ in IM2 (git mv, history kept); scripts/release-zip.js and the release workflow read docs/changelogs/ first, the root second, so an old release still builds."
      axioms:
        - "FILES_WITH_THEIR_SYSTEM (genesis 1.5.0) — documentation lives with the docs."
        - "§0.3 — a move keeps every file and its history."
        - "§0.5 — the root holding 336 files of one kind is complexity nothing pays for: the root is where a reader starts."
    D6_tests_with_their_system:
      was: "IM0c"
      chosen: "each system's own tests move into <system>/tests/ when that system migrates (IM5); tests of a contract BETWEEN systems stay in tests/; tests/modules/run-all.js finds both."
      axioms:
        - "§5.9 — a sovereign system owns its diagnostics."
        - "SOVEREIGN_FOLDER (genesis 1.5.0) — a compartment sees only its folder; tests outside it cannot run inside it."
        - "§4.1 — a system that cannot be tested cannot be trusted: its tests go where it goes."
    D7_what_is_a_primitive:
      was: "IM0e"
      chosen: >-
        The test, from the axioms: a module with no state of its own, no lifecycle and no data type it owns is a primitive
        (kernel, D1); one that holds state or a lifecycle is its system's capability, reached through that system's route.
        Applied: nexus/nexus-bus.js, nexus/nexus-connect.js, siso/*, warp/core/*, warp/index.js and hooks/index.js are
        primitives (the bus, the connector, the event primitives, the spine, the hook map — §5.1, §8.3). RAID (owns requests,
        §10.1/§9.1), the CFR field, the gap engine and the baseline are capabilities. RFR2 is split by the same test, module by
        module: its pure functions (identity, time, compress, context) are primitives, its live kernel is intelligence's.
      axioms:
        - "§5.9, §10.1 — state and lifecycle are what make a thing a system's."
        - "§5.1 — every component has an event bus registration: the bus is infrastructure every system needs."
        - "§8.3 — WARP and Jaa are load-order prerequisites: the spine comes before the systems."
        - "§9.1 — RAID is the only write authority for requests: it is reached, never copied."
      applies_in: "IM4 (each primitive to lib/, a re-export left behind) and IM3 (each capability through its route)."
    D8_pieces_against_interfaces:
      was: "PC0a (docs/2026-10-17-pieces-not-order-phasemap.spec). His answer: \"[No preference]\"."
      chosen: "yes: a piece may be built before the pieces it uses exist, against their declared interface (names and signatures in the manifest), never their code. It waits only for a real value another piece produces, and that edge is named."
      axioms:
        - "§5.10 / §5.14 — the contract, not the implementation, is the dependency."
        - "§3.1 — foundation first: the interfaces are the foundation the pieces are built on."
      his_direction_it_serves: "\"The point is first. That's the point. It's not linear. Like a torrent downloads.\""
    D9_first_piece_kinds:
      was: "PC0b. His answer: \"[No preference]\"."
      chosen: "the kinds Nexus already makes: spec_section, function, test, wire (registry/loom), doc. A new kind is added when a real phase needs it twice."
      axioms:
        - "§16.4 — simple things stay simple: generalize only after real repetition."
        - "§0.5 — complexity must earn its existence."

  stays_his:
    - "PC0c — who writes the point (the manifest): he said \"thats on me\"."
    - "What he meant, wherever the coder wrote a reading of his words 'to confirm': UE7 (UI elements from image sites), 'in relation to the system they are for', 'now that loom holds', 'first principles nexus'. Readings are acted on, said as readings, and never recorded as his decisions."
    - "Direction: what comes next, and what Nexus is for."

  # ── ADDENDUM 2026-10-17 (a) — whose decisions these are ───────────────────────
  # James, 2026-10-17: "no, this is my system. come to me for problems, else use the axioms. continue with each system."
  # The rule above said each decision is "the coder's, made by the axioms — never written as his". He corrected it, and the
  # earlier wording is kept here (§0.3). The axioms (docs/AXIOMS-v3.1.md) are his, so D1-D9 are his system deciding by its
  # own law; the coder applied them and names the sections. What goes to him: problems. That means something the axioms do
  # not settle, two axioms in conflict, a failure, or a cost he would want to know about first.
  attribution: "decided by his axioms (docs/AXIOMS-v3.1.md), applied by the coder, 2026-10-17"

