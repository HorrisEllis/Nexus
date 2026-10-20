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


  # ── ADDENDUM 2026-10-17 (b) — the debugging product: ids, the gap door, the case ──────────────────────────────
  # James, 2026-10-17: "should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in
  # relation to the job." Asked as a question; the axioms answer it. Mapped in docs/2026-10-17-debugging-product-phasemap.spec.
  decided_b:
    D10_ids_are_kept_and_referenced:
      was: "DP0c (docs/2026-10-17-debugging-product-phasemap.spec ids_and_the_job)"
      chosen: >-
        No shared uuid across chunks, contracts, phases, runs and changes. Each keeps its own id, minted once and never
        changed, and links are typed references <kind>:<id> written where the link is made. The job (a run) carries the
        phase, contract and case it serves; a change carries its run and attempt. A chunk keeps its id across a move (IDS1).
      axioms:
        - "§5.1 — a UUID that never changes: today a chunk's id changes when its file moves (the path is in the key)."
        - "§10.3 — competing truth layers: lib/change-record.js matching a run 'by path and time' is a second, guessed truth beside the real link."
        - "§17.5 — every output answers from what, against which spec and version: only a reference chain answers it."
    D11_one_gap_door:
      was: "DP0d"
      chosen: "Every gap is written through lib/gap-field.js report(). The 34 direct jaa.insert('gaps') calls in 26 files move onto it one file at a time, behind a ratchet that fails on a new one."
      axioms:
        - "§10.1 — one write authority per data type."
        - "§17.7 — never fix the symptom twice needs an honest occurrence count; a direct insert skips the dedup that counts."
        - "§1.2 — the move changes no reader silently: each file's readers are checked before it moves."
    D12_a_case_is_a_contract:
      was: "DP0e"
      chosen: "A debugging case is a .contract v2 (cortex/core/raid/contract-gates.js) whose gates are the stages; no case store, no new format. Its status is computed from its gates, never set."
      axioms:
        - "§8.6 / §16.5 — contract-gates already evaluates gated work with evidence and invalidation; a second engine would be redundancy."
        - "§0.5 — complexity must earn its existence."
  stays_his_b:
    - "DP0a — one product or two (debugging beside Flight Recorder, or Flight Recorder's next phases): direction."
    - "DP0b — its name."
  # ── ADDENDUM 2026-10-18 (b) — D13 and D14 (written as D10/D11), from the debugging product map of 2026-10-18 ─────────
  # James, 2026-10-17: "should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in relation
  # to the job. also what about using the dependencies to map gaps in codebases or repose, files or code"
  # Both are technical, and his axioms settle them. Full text, ids as found in code, and the phases that build them:
  # docs/2026-10-18-debugging-product-phasemap.spec (DBG0a, DBG0b; DBG1, DBG4).
  # D13_synchronized_by_a_key (= DBG0a; written as D10 before the merge): synchronized by a shared derived KEY, not one shared uuid. What a thing IS (phase,
  #   chunk, contract, dependency edge) is keyed by its place in the map, <repo>/<map>::<phase>[::<chunk>]. What HAPPENS (job,
  #   attempt, change, commit, event) keeps its own random id and carries that key plus its attempt. A chunk is named for what it
  #   is, never its position (b<n> becomes an alias). Axioms: §10.1, §5.14, §1.1, §7.6; identity (the check catalogue's
  #   primitive); PC2.
  # D14_dependencies_are_gap_evidence (= DBG0b; written as D11 before the merge): yes. Every dependency edge whose far end is missing, or does not provide what
  #   is used, is a gap, found deterministically; orphans are said, never deleted. All go through lib/gap-field.js report(). Axioms:
  #   deterministic first, §8.6, §1.2, the one gap door, §0.5.
  # Stays his: DBG0c, which product the debugger is (direction).
  # MERGE NOTE 2026-10-18 — two lines answered the same question. His line (another session, 2026-10-17, uploaded as nexus.zip)
  # decided D10 'ids are kept and referenced' (typed <kind>:<id> references; a chunk keeps its id across a move), D11 'one gap
  # door' and D12 'a case is a contract'. This session (2026-10-18) decided D13 'synchronized by a derived key' (a chunk named
  # for what it is, <repo>/<map>::<phase>::<chunk>) and D14 'dependency edges are gap evidence'. Both say: no one shared uuid.
  # They differ on how a chunk is named and kept. Two contracts, kept, not collapsed (docs/CLAUDE.md rule 4); which one stands
  # is his to say. D11 and D14 do not conflict: D14's gaps go through D11's one door.

  # ── ADDENDUM 2026-10-18 (c) — D15–D23, from the gating census (docs/2026-10-18-gating-census-phasemap.spec) ─────────────
  # James, 2026-10-18: "okay lets finish the gating, or next steps. look at all of the phases that mention gates." · "need to get
  # them done bottom up. really need it all working." The census found nine questions that were left open with a recommendation
  # waiting on a yes, each technical, each settled by his axioms. Under his rule of 2026-10-17 ("come to me for problems, else use
  # the axioms"), they are decided by his axioms. Each owning map's status now reads DECIDED and points here. He can overturn
  # any one by an addendum that quotes both (§0.3).
  #   D15 = GW0b_fresh_chat_policy: a, a per-gate-kind setting (continue | new chat | any provider), default new chat for build and
  #         verify bricks and continue for a brick's own retries. USER_AUTONOMY (the setting is his, editable); §2.2 the state follows
  #         the brick, not the chat (his GW0 "The bricks"); leverage, a retry re-pays no persona prompt.
  #   D16 = GW0c_replay_mode: a, both modes from one recording, by flag. recorded is the exact replay and the regression test (§12.2);
  #         live re-sends the same packets to compare agents. One record (§10.3).
  #   D17 = GW0e_sandbox_egress: a, default deny with an allowlist per compartment; open egress is a per-run switch he sets. §5.9
  #         secrets never leave; REVERSIBILITY (a leak cannot be undone, a deny is one switch).
  #   D18 = GW0f_mutation_testing: a, per file: its tests, its exports exercised, hostile inputs (§12.1); mutation as an opt-in tier,
  #         on by default only for files a gate just changed (§12.2, cost bounded).
  #   D19 = GW0g_parallel_limit: a cap read from the resource monitor at dispatch (free memory, cores), his Settings value the
  #         ceiling, never a fixed number. lib/prevention.js's memory rule (MP); USER_AUTONOMY for the ceiling.
  #   D20 = GW0h_minimal_default: base + the one runtime plan() finds, display none, no extras; the repo desktop one tick away.
  #         Deterministic first, the least that works (his "as little as possible").
  #   D21 = GW0i_find_order: own component store and code index first, then registries and code hosts by API, then image/UI sites,
  #         then the open web; stop at the first adequate hit. §8.6 reuse before build, his "everything reused from the inside out"
  #         — as COST, not a fixed walk, the same law as GM5 addendum (b): the free sources are asked together, the costly ones
  #         only for the residue.
  #   D22 = TL0a_unit_of_the_timeline: a, one timeline per piece of work; the repo's line is a view over them, no second record
  #         (§10.3 one truth).
  #   D23 = TL0b_rewind_scope: the files back to the checkpoint's commit and the work's state (later chunks pending, the gate open
  #         again); later entries kept and marked superseded; the rewind is itself an entry. REVERSIBILITY, §0.3.
  # Still his, not decided here: GM0a (what "the precommit compartment" means: his words), GW0d (needs his failing log), and
  # D10 vs D13 (above).

# ═══ ADDENDUM 2026-10-21 (0.60.178) — Snowflake (docs/2026-10-21-snowflake-compartment-phasemap.spec), decided by his axioms ═══
  #   D24 = SF3 routed window storage: in memory (cg-snow-<id>), cleared on close, no vault snapshot. REVERSIBILITY is not at stake
  #         (nothing of his is lost: it was never his data), §1.2 fail closed and his 2026-10-15 "run it in a compartment isolated".
  #   D25 = SF3 identity: the engine's own Chromium UA, no persona, in routed windows. TRUTH_OVER_COHERENCE (a window that says what
  #         it is), and his "make it look as nromal as it can": one consistent identity is what looks ordinary on the wire.
  #   D26 = SF4 HTTPS-only default: on, his switch. USER_AUTONOMY (his to turn off) and §1.2 (no cleartext past the exit by default).
  #         The reading of "optional encryption" behind it is marked to confirm in the map.
  #   D27 = SF2 the Tor Project's builtin list: his button only, never automatic. USER_AUTONOMY: the ask is visible to his network.
  # His call, not decided here: whether ordinary agent windows move their page into their own session (it moves sign-ins).

# ═══ ADDENDUM 2026-10-21 (0.60.179) — compartment downloads and the browser shell, decided by his axioms ═══
  #   D28 = CD0_magnet_client: qBittorrent through its Web API, verified per hand-off. §0.1 (the client's proxy is read, not assumed),
  #         MR12 (fail closed). No torrent engine inside Clear Glass.
  #   D29 = CD2 quarantine index in its own folder, never the persistent downloads store. The routed window's purpose (nothing of it on
  #         disk beyond what he chose to download) and §1.2.
  #   D30 = BS0_cookie_target: everyday session by default, a provider tab by choice, never a Snowflake window. USER_AUTONOMY; the
  #         compartment's purpose.
  #   D31 = BS2 palette: Settings' as rendered (settings.css + cos-theme.css, his 0.60.5 look), not settings.css's raw colours.
  #         TRUTH_OVER_COHERENCE: "the same theme as the setting" is what Settings shows.
  # His call, not decided here: the kill rung default reading (kill_tabs) is a reading, to confirm.

