# docs/2026-10-16-durable-work-timeline-phasemap.spec
# Work survives a restart because it is physical files in the backend, written as it happens: every chunk a file the moment
# it exists, one timeline per piece of work with its checkpoints and the gates you can rewind to, read back at boot.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Follows docs/2026-10-15-code-tab-run-state-phasemap.spec (CE1 run state built; CE6-CE9, CV1-CV6 open) and
# docs/2026-10-15-gate-held-work-phasemap.spec (GW2, GW3 built; GW11 snapshot per gate open). Ordered by
# docs/2026-10-15-pipeline-focus-phasemap.spec (step 3/4 gating, step 4 the Code tab).

origin:
  date: 2026-10-16
  james: >-
    "tell me recent phases. can we do the code tab now? also clearglass closed and nexus didnt recover. like need a
    timeline with the checkpoints, and gates rewind points. it wrote the whole spec 17 chunks but then lost it on the
    restart. that needs to change. write a phasemap file, or spec file, chunks nodes. it need has to be physcial files in
    the backedn for persistence"
  his_decisions:
    - "Persistence is physical files in the backend, not a chat, a tab or process memory. (his words: 'it need has to be physcial files in the backedn for persistence')"
    - "The record is a timeline: checkpoints, and the gates as rewind points."
    - "Chunks are nodes (files), written as they are produced."
  reading: >-
    The coder's reading, to confirm: 'it wrote the whole spec 17 chunks' = an agent produced a spec in 17 parts (replies or
    sections) and none of it was on disk when Clear Glass closed, so the restart had nothing to resume. Another reading:
    a spec-engine spec with 17 chunks whose built content was lost. The code says the second is file-backed already
    (below), so the first is the one this map is written for. Which screen and which agent it was is asked in TL0.

found:
  # §8.6, read 2026-10-16 from source, not memory. What is already a physical file, and what is not.
  file_backed_already:
    - "spec-engine specs: a manifest + one .md per chunk (idearium/spec-engine/index.js saveSpec; specs/<uuid>/NN-<sectionId>-<uuid8>.md), a .chunk node per chunk (idearium/lib/chunk-nodes.js), and boot recovery of a chunk left BUILDING (recoverOrphanedChunks, 2026-09-11: 'if nexus restarts it wont try to build the chunks again')."
    - "a run: lib/run-state.js, one .run node per run or per brick, written atomically after every tool call (CE1 0.60.50, GW2 0.60.77). It keeps tool calls, files read and changed, attempt, agents. It does NOT keep the reply text."
    - "a contract: p.state.checkpoints { gate, at, hashes, agent, commit } per passed gate (cortex/core/raid/contract-gates.js:672); the trace joins it with the ledger (cortex/core/raid/contract-trace.js, GW3 0.60.75)."
    - "a repo's pause point: lib/repo-run-state.js pause() records a Versionium snapshot and a desktop checkpoint (data/idearium/repo-run-state.json)."
    - "a repo's code: lib/repo-versions.js commits writes after SETTLE_MS 1.5 s (one commit per burst)."
    - "the agent's exchanges: lib/repo-agent.js history(repoUuid) per compartment; .response nodes (guardian/lib/response-sink.js)."
  not_file_backed:
    - "an agent-written spec until its final file write: SF3 (lib/spec-collect.js) collects a .spec only when the agent writes it through code.write -> .inject. A spec composed over many replies or sections exists, until then, only in the provider's chat (the Clear Glass tab) and in the reply stream. Closing Clear Glass closes that chat. Most likely loss path, to confirm in TL0."
    - "in-flight jobs in idearium/api/index.js process memory: _phaseMapJobs (681), _proofs (1584), _indexing (1777), _toolEvents (614). A restart forgets them; only phase mapping keeps a stateFile."
    - "no single timeline: checkpoints (contract), runs (.run), chunk states (manifest), commits (Versionium) and pause points (repo-run-state) are five records with no one view and no one rewind."
  clear_glass_close:
    - "nexus/autopilot.js:655: Clear Glass exiting with code 0 within 20 s of spawn is read as a hand-off to another instance and is NOT restarted ('external'). A quit after 20 s counts as a crash and is restarted with backoff (min 3 s); 6 in 5 min trips the breaker."
    - "Clear Glass hosts the browser providers (ChatGPT, Gemini, ...). A job a tab held when it closed is a lost job; CE10 (0.60.50) falls it back to the next provider, but the fallback starts from the run state, and the run state has no reply text: whatever the tab had written is gone."
    - "His machine ran 0.60.44 on 2026-10-15 (pipeline-focus findings). CE1/CE10 (0.60.50) and GW2 (0.60.77) are not on 0.60.44. If he still runs it, nothing here resumed by design. To confirm: his version (`system version`)."

decisions:
  TL0a_unit_of_the_timeline:
    asked: "one timeline per what?"
    options:
      a: "per piece of work (a spec being written, a phase build, a contract): its chunks, checkpoints and gates."
      b: "per repo: every piece of work in the repo on one line."
    coder_recommends: "a, stored per piece of work; b is a view over every a in the repo (no second record). To confirm."
    status: OPEN
  TL0b_rewind_scope:
    asked: "what does rewinding to a gate put back?"
    coder_recommends: >-
      the files (to the commit the checkpoint holds) and the work's state (chunks after the point go back to pending; the
      gate is open again). Later entries are kept and marked superseded, never deleted (§0.3). The rewind is itself an
      entry. To confirm.
    status: OPEN

phases:
  # bottom-up. backend -> API -> command -> UI (docs/CLAUDE.md order of delivery). Tested in Clear Glass, never Playwright.

  TL0_find_the_loss:
    status: OPEN (needs his log or the screen it was on)
    systems: [idearium, guardian, clear-glass]
    files: [idearium/spec-engine/index.js, lib/spec-collect.js, lib/run-state.js, guardian/lib/response-sink.js]
    depends_on: []
    does: >-
      Name the path that lost the 17 chunks from his evidence, not a guess: the screen (Agent tab chat, Specs, a phase
      build), the agent and provider, his version, and what is on disk for it now (.response nodes of that session, any
      .run, any spec manifest). If .response nodes hold the 17 parts, TL1's importer recovers them. Write the finding here
      as an addendum before TL1 is built.
    proof: "the lost spec's parts found on disk or proven absent, with the file paths or the gap named."

  TL1_chunks_land_as_they_arrive:
    status: OPEN
    systems: [core, idearium, guardian]
    files: [lib/work-journal.js (new), lib/node-export.js, idearium/spec-engine/index.js, idearium/lib/chunk-nodes.js, lib/spec-collect.js, guardian/lib/response-sink.js]
    depends_on: [TL0_find_the_loss]
    does: >-
      A piece of work is a folder of physical files, written as it happens, never only at the end:
      data/work/<repo>/<workId>/work.node (what it is, goal, status, the plan of chunks: id, title, status, hash),
      NN-<chunkId>.chunk (each chunk's content the moment it is produced, a node-export envelope, written atomically:
      tmp + rename, as lib/run-state.js does), and timeline.jsonl (append-only, one line per event). For an agent writing
      a spec (intent spec): the work opens when the request goes out; every reply part or section that arrives is a
      .chunk at once; the final .spec is collected (SF3) from the chunks on disk, not from the chat. For a spec-engine
      spec the manifest and its .md chunks ARE this record: work-journal points at them, it does not copy them (§8.6).
      For a phase build or brick the .run is the record; the journal adds its reply text per step.
    proof: "write 17 chunks, kill the process after chunk 9, start again: chunks 1-9 are on disk, byte-identical, and the work says 'resume at 10'."

  TL2_resume_at_boot:
    status: OPEN
    systems: [core, idearium, guardian]
    files: [lib/work-journal.js, idearium/spec-engine/index.js, idearium/api/index.js, lib/run-state.js]
    depends_on: [TL1_chunks_land_as_they_arrive]
    does: >-
      At boot every unfinished work is listed and resumed from its last checkpoint, the way recoverOrphanedChunks does for
      spec-engine chunks (generalised, not rebuilt): a chunk left 'writing' goes back to pending; the next request carries
      the chunks already written (their titles and the tail of the last one, as lib/reply-continuation.js continuePrompt
      does), so the agent continues at chunk 10 and never rewrites 1-9. The in-memory jobs (phase mapping, proofs,
      indexing) write a work.node too, so a restart says what was running and what it did ('lost at restart, resumable'
      or 'restarted'), never silence (§1.2). A Clear Glass close is one more restart: the job falls back (CE10) with the
      journal, so the next provider gets the chunks, not a blank chat.
    proof: "close Clear Glass mid-spec (Clear Glass driver, clear-glass/src/driver/glass.js); on restart the spec continues at the next chunk on another provider or the same one, and the timeline shows the close and the resume."

  TL3_the_timeline:
    status: OPEN
    systems: [core, cortex, idearium, versionium]
    files: [lib/work-timeline.js (new), cortex/core/raid/contract-trace.js, lib/run-state.js, lib/repo-run-state.js, lib/repo-versions.js, idearium/api/index.js, idearium/cli/route-commands.js]
    depends_on: [TL1_chunks_land_as_they_arrive]
    does: >-
      One ordered timeline per work (and a repo view over all of them), a projection of what is already written, never a
      second record (contract-trace's rule §7.6): chunk writes (journal), gate passes and blocks with their input hashes
      and commit (contract checkpoints), tool steps (.run), pause points (repo-run-state), commits (Versionium), restarts
      and resumes (TL2). Each entry is marked: checkpoint (a state you can stand on), rewind point (a gate pass with a
      commit), or event. Holes are named: a gate pass with no commit is a checkpoint you cannot rewind to.
      GET /api/repos/:uuid/timeline[?work=], `repo timeline <repo> [work]` (one row in route-commands, so every agent has it).

  TL4_rewind_to_a_gate:
    status: OPEN (scope to confirm, TL0b)
    systems: [core, cortex, versionium, idearium]
    files: [lib/work-timeline.js, cortex/core/raid/contract-gates.js, lib/repo-run-state.js, versionium/lib/files.js, idearium/api/index.js, idearium/cli/route-commands.js]
    depends_on: [TL3_the_timeline]
    does: >-
      Pick a rewind point: a snapshot first (REVERSIBILITY), then the files go back to that point's commit, the chunks and
      gates after it go back to pending (kept, marked superseded), and the work resumes from there. The rewind is an entry
      on the timeline. POST /api/repos/:uuid/timeline/rewind, `repo rewind <repo> <work> <point>`. This is CV3's 'undo this
      run' and GW7's rewind, built once here and pointed at from both (pipeline-focus: build each once).

  TL5_the_code_tab_timeline:
    status: OPEN
    systems: [idearium]
    files: [idearium/ui/js/code-surface.js, idearium/ui/js/work-timeline.js (new), idearium/ui/css]
    depends_on: [TL3_the_timeline, TL4_rewind_to_a_gate]
    does: >-
      The timeline as the Code tab's first panel (CE9's panels start here): the work on one line, newest first; chunks,
      checkpoints and rewind points drawn differently; click a chunk to open it, a checkpoint to see its files and hashes,
      a rewind point to rewind (with the snapshot said). Live via the events the journal emits. With CE6 (one tab) the
      Code tab is where his work is seen, resumed and rewound.

  TL6_proof_and_wiring:
    status: OPEN
    systems: [core, loom]
    files: [tests/modules/test-work-journal.test.js (new), tests/modules/run-all.js, loom/maps/observability-map.js, idearium/event-taxonomy.cjs, docs/atlases/idearium-atlas.md, lib/version.js, docs/PROOF-OF-COMPETENCY.md]
    depends_on: [TL1_chunks_land_as_they_arrive]
    does: >-
      Tests registered in run-all; loom wires for every new require/consumer edge (rule 3); events declared in the taxonomy
      (idearium.work.opened | chunk.written | checkpoint | resumed | rewound | lost); a dated ADDENDUM to code-tab-run-state
      (CV3 points here) and gate-held-work (GW7, GW11 point here); a version line per slice opening with his words.

build_order: [TL0, TL1, TL2, TL6, TL3, TL4, TL5]
first_slice: "TL1 + TL2: chunks are files the moment they exist and a restart resumes them. That is the loss he named; the timeline and rewind read what they write."

code_tab_now:
  # his question: "can we do the code tab now?" The Code tab's open phases, in the pipeline-focus order, with this map folded in.
  order:
    - "CE6 one tab (unblocked: 'yes one tab.')"
    - "TL5 the timeline panel"
    - "CE8 the CLI reads the surface"
    - "CE9 the other panels"
    - "CE7 AI editing by line"
    - "CV1-CV6 versions"
  coder_recommends: "TL1 + TL2 before any Code tab UI: a panel over work that is lost at a restart shows nothing he can trust. His call."

not_verified:
  - "which path lost the 17 chunks (TL0); the map is written for the agent-written-spec path."
  - "his running version; if it is 0.60.44, run state, lost-job fallback and the brick run are not on his machine."
  - "where a contract (p) is persisted between restarts was not read; TL3 reads checkpoints through contract-trace, which takes p as given."

# ## ADDENDUM 2026-10-16 (a) — TL1a built (0.60.79): a restart no longer re-chunks a phase
# James: "can we not have it chunk everytime it restarts. it needs to persist. all data  is meant to persist. hardcoded has
# to earn its place..."
# Found (not in the map above): every build start re-planned the phase; a new plan has a new plan_hash, and openCheckpoint
# archived the saved contract with every passed brick. Built: the plan and a phase_hash live on the .contract; savedPlan
# reuses it (or, for a contract saved before 0.60.79, the run log's plan whose hash matches); replan on the route,
# `--replan` on the command, a box in the phase detail. Proof: test-contract-phase-build CP-03b.
# His principle, recorded as his decision: all data persists; anything hardcoded has to earn its place. The coder applies it
# to the open maps: TL1/TL2 (the rest of this map) and IH1 (docs/2026-10-16-intent-hat-agent-chain-phasemap.spec, where the
# hardcoded VERB_TO_HAT becomes .intent nodes) are the next places it bites.

# ## ADDENDUM 2026-10-16 (b) — TL1 is the same work as GW27 and FN3: build it once (no phase dropped, §0.3)
# James: "marge with main, if additive. then whats next?"
# Found on main after the merge: three open phases write the same thing, a node file per piece of work the moment it exists:
#   TL1 here (each chunk a .chunk as it arrives), GW27 in docs/2026-10-15-gate-held-work-phasemap.spec (.input before dispatch,
#   .response after on every backend, .output when it lands, .deps per plan), FN3 in docs/2026-10-16-agent-work-funnel-phasemap.spec
#   (the funnel's answers as nodes). The coder's recommendation, his call: GW27 is the owner (it has the widest taxonomy, his
#   decision (k) on chunk kinds, and the trace already reads it); TL1 and FN3 are marked "see GW27" when it lands, and TL2 (resume
#   at boot) reads those files. The 17-chunk loss is the .response half: an answer saved only when its final file lands.
