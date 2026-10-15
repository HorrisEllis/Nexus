# docs/2026-10-15-fiverr-ledger-phasemap.spec
# A ledger of what can be said to a Fiverr buyer, each claim kept with the check that proves it. MAPPED 2026-10-15; PF0 built 0.60.53.
# Registered in docs/SPEC-REGISTRY.spec. Feeds the portfolio section in docs/2026-10-15-clear-glass-surfaces-phasemap.spec (PF1-PF3).

origin:
  date: 2026-10-15
  james: >-
    "can you create a ledger for anything you can log thats useful for fiverr, that you can verify for a fact? like i want to
    keep a record overtime. like anything that slots to a gig template. to automate. you can have the agents also have a
    listener for that? like my agent chats, logging skills, patterns, everything valuable for fiverr?"
  reading: >-
    The coder's reading (his to correct). Not a diary of what agents said: a ledger of claims, each tied to evidence a
    program can check (a commit, a file, a test that passes, a count). A claim is only ever shown to a gig draft while its
    check passes. Each claim is filed under the gig part it fills (skills, portfolio, numbers, process, about) so a draft
    can pull them without anyone retyping. "My agent chats": a chat's words are not evidence, so the listener files what
    the agent's run provably did, and never what it claimed.

found:
  - "lib/run-state.js emits run.finished and holds filesChanged per run (0.60.50)"
  - "clear-glass/src/autofill/gig.js buildGigPrompt({ profile, offer, extra }) already takes extra facts and is told never to invent (0.39.301)"
  - "docs/PROOF-OF-COMPETENCY.md is the hand-written record; this ledger is its machine-checkable companion, it does not replace it"
  - "lib/ledger-writer.js and lib/node-ledger.js are the system's event ledgers; this one is separate on purpose: it holds claims about the person's work, not system events"

axioms_consulted:
  - "§0.1/§1.1 evidence over memory: no evidence, no fact. -> PF0"
  - "§0.3 nothing lost: append-only; a correction is a note, not an edit. -> PF0"
  - "§1.2 nothing fails silently: an unknown evidence type or a path outside the repo is a failed check with a reason. -> PF0"
  - "§7.6 the record is the source: facts() reads the ledger, it keeps no second copy. -> PF0"

phases:
  PF0_the_ledger:
    status: BUILT 0.60.53
    files: [lib/gig-ledger.js, lib/gig-ledger-listener.js, tests/modules/test-gig-ledger.test.js, lib/test-sandbox.js, loom/maps/run-state-map.js, lib/repo-agent.js]
    does: >-
      record(), verify() (commit, file, test, count), note(), list(), facts(), factsText(), verifyAll(). A finished agent run files a
      deliverable claim whose evidence is the files it changed. Proof: tests/modules/test-gig-ledger.test.js GL-01..GL-10.
    not_built: no route, no command row, no screen yet (docs/CLAUDE.md order of delivery: say so). Until PF1, nothing calls record() for skills, patterns or metrics except by hand.

  PF1_the_sources:
    status: OPEN
    depends_on: [PF0_the_ledger]
    does: >-
      The sources that can prove a skill, pattern or number without a model: a release (version line + changelog + the tests it names, becomes a
      deliverable with a commit and a test as evidence), a phasemap with all its proofs passing (a pattern: map before build, with the spec as evidence),
      the numbers table in the proof log (a count claim per row, re-checked). A route /cli/gig-ledger, a route-commands row so every agent has record and facts, and a nightly verifyAll
      so a claim that has gone stale turns off.

  PF2_the_slots_into_a_gig:
    status: OPEN
    depends_on: [PF1_the_sources]
    does: >-
      factsText({ slot }) is passed as `extra` to gig.js buildGigPrompt, so a drafted gig cites only verified work. The gig panel shows which facts it used and their checks.

  PF3_the_screen:
    status: OPEN
    depends_on: [PF2_the_slots_into_a_gig]
    does: Library -> Portfolio shows the ledger (verified, stale, withdrawn), the same section the surfaces map names as PF3.

decisions:
  PF0a_what_a_chat_may_claim:
    chosen: null
    coder_recommends: A chat's own words are never evidence. A person can add a skill claim by hand, but it only becomes a fact once it has evidence that checks. Confirm or correct.
