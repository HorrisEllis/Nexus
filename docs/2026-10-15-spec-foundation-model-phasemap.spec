# docs/2026-10-15-spec-foundation-model-phasemap.spec
# Every module is a spec; every feature is a spec built on one; every change is an addendum; nothing is built until it is mapped, phased and chunked, and a
# listener keeps specs, phases, chunks, agent tasks, intents and hat injections in step. MAPPED before building (docs/CLAUDE.md rule 1). Nothing below is built.

origin:
  date: 2026-10-15
  james: >-
    "like we need the specs, phases, the mapping and listener working for all idearium specs, phases, chunks, etc, all agent tasks and intents, .inject nodes per
    .intent for each .hat? what if each module is a spec, then each new feature or capability is a spec built from it as a foundation, fixed, changes or added as
    addendums. that way they can be build one by one? like when expanding, speccing a new idea, contracts, like they have to always be mapped, then phased, then chunked."
  context: >-
    He sent the autopilot boot log of his own run (npm run start:all, nexus@0.60.44, 17:39 to 20:49) and a screenshot of Idearium showing 15/32 phases, one phase running 3h 4m,
    brick-failed/brick-rewound repeated at one timestamp, and the red line that the ChatGPT tab was handed a job and did nothing with it.
  reading: >-
    The coder's reading (his to correct; to confirm). (1) The model: module spec = the stable foundation; feature spec = a child that names its foundation; change = a dated
    addendum on whichever spec owns it. (2) The gate: map, then phases, then chunks, in that order, enforced rather than remembered. (3) The listener: one thing that watches
    every spec, phase, chunk, agent task, intent and hat injection and keeps them connected. (4) ".inject nodes per .intent for each .hat" is read as a matrix: for each hat and each
    intent, a node saying which spec text (foundation section, addendum, phase, chunk) is injected into that agent's prompt. The repo's existing .inject is a different thing: one
    agent-proposed file write (lib/node-export.js). If he means the existing one, this reading is wrong.

coder_opinion:
  verdict: >-
    Yes, with three conditions. It is mostly how the project already works (267 spec files, docs/SPEC-REGISTRY.spec, phasemaps with statuses, Idearium's spec engine and chunk dispatch,
    cortex listeners on chunk.complete and build.completed, docs/CLAUDE.md rules 1 and 4). What is missing is not the idea but the enforcement and the sync. Today the rule lives in a document
    and in the coder's discipline; the 250 phase statuses found earlier that no evidence supports show the sync does not hold on its own.
  conditions:
    1_enforced_by_a_gate: "A spec has a state (MAPPED, PHASED, CHUNKED, BUILDING, PROVEN). Chunk dispatch refuses a chunk from a spec that is not PHASED, and a phase with no chunks is not BUILDING. A rule that depends on remembering will be skipped; a gate cannot be."
    2_status_from_evidence_not_hand_set: "A phase is PROVEN only when its proof is checked (a test passes, a file exists: the check catalogue's exists: field already names such code). Statuses a person or an agent types are claims; the listener computes the truth and flags the difference."
    3_addenda_stay_readable: "Addenda are append-only (his rule: nothing lost), so a spec that is amended for a year becomes unreadable. A generated 'current view' (the foundation plus every addendum applied in order) is a projection, never a replacement. The sources stay."
  failure_modes:
    - "Spec sprawl: one spec per feature on top of 267 files. The registry must draw the graph (foundation -> features) so a reader starts at the module, not the pile."
    - "A change that touches a foundation's contract: it must be an addendum on the FOUNDATION, and every dependent feature spec is flagged for review. Otherwise features drift from the module they stand on."
    - "A foundation too big to be a foundation: if every feature needs an addendum on the same module, the module was cut wrong. The listener counts addenda per foundation and says so."
    - "Chunking by hand: chunks must come from the phase text (the spec engine already chunks), not be retyped, or they will disagree with the phase."
    - "Two listeners: do not add a second one. The existing cortex listeners (chunk.complete, build.completed) and the run-state events (run.finished) are extended, not paralleled."

what_the_boot_log_shows_that_bears_on_this:
  - "He is running nexus@0.60.44. The repository is at 0.60.61. The 0.60.50 run-state and the 'tab did nothing, move to the next provider' fallback are therefore NOT in the run he showed. The old folder is a download (D:\\Backups\\Downloads\\Nexus v0.39.300\\Nexus-main) and the repository has moved to github.com/HorrisEllis/Nexus."
  - "RAID officiator: 63 failed synthesis tries and 45 drops parked after four tries, every one 'no real agent response (forAgent=ollama)'. The retry gap is 40 minutes and a parked drop needs data/officiator-attempts.json edited by hand. The model is qwen2.5-coder:7b; one small adversarial probe (1254 characters, context 4096) took 71.9 s; Ollama missed its heartbeat for 16 to 20 s twice at boot; free memory sat at 14 to 19 percent, under the 20 percent warning. The likely cause is a slow, memory-starved local model timing out. Unconfirmed: the bridge ledger would say."
  - "nomic-embed-text is not pulled, so vector memory runs on the TF-IDF fallback (ollama pull nomic-embed-text)."
  - "Idearium answered three contracts with 'unreachable (timeout)' 47 s into boot, while it was still registering 129 components. Boot noise, not a standing fault."
  - "The log shows no ChatGPT 'did nothing' line: it is a boot log, and ChatGPT's tab connected at 17:40:06. The failure in his screenshot happened later and is not in this file."

phases:
  SF1_foundation_field:
    status: OPEN
    does: "A spec names its foundation (extends: <spec id>) and its kind (module | feature). The registry builds the graph and shows it. Existing specs are not rewritten (nothing lost); the field is added by addendum as each is touched, and the registry says which have none."
  SF2_state_and_gate:
    status: OPEN
    depends_on: [SF1_foundation_field]
    does: "Spec states MAPPED, PHASED, CHUNKED, BUILDING, PROVEN. The Idearium chunk dispatch and the build request refuse out-of-order work and say which step is missing. CLI first: `idearium spec status <id>`, then the screens."
  SF3_evidence_not_claims:
    status: OPEN
    depends_on: [SF2_state_and_gate]
    does: "Phase status is computed from its proof (test result, file exists, check catalogue). A typed status that disagrees is flagged, not overwritten. This is the 250-phases audit made permanent."
  SF4_the_listener:
    status: OPEN
    depends_on: [SF2_state_and_gate]
    does: "Extend the existing cortex listeners and the run-state events into one append-only spec ledger per spec (the same shape as chat-ledger and gig-ledger): spec created, addendum added, phase status changed, chunk complete, agent task started and finished, intent classified, artifact built. Edges run foundation -> feature -> phase -> chunk -> task -> artifact."
  SF5_hat_intent_injection:
    status: OPEN
    depends_on: [SF4_the_listener]
    does: "For each hat and each intent, a node naming what is injected: the foundation section, the relevant addendum, the phase and the chunk, and nothing else (his rule: fewest tokens for the most leverage). To confirm: the coder's reading of '.inject nodes per .intent for each .hat'."
  SF6_addenda_view:
    status: OPEN
    depends_on: [SF1_foundation_field]
    does: "A generated current view of a spec: the foundation plus its addenda applied in order, with each addendum's author and date. A projection; sources untouched."
  SF7_get_his_run_current:
    status: OPEN
    does: "Not a feature: the run he is on is 17 releases behind. Update from github.com/HorrisEllis/Nexus, pull nomic-embed-text, and give Ollama room (a smaller or quantised model, or fewer services during a build). The officiator's parked drops are cleared once it can answer."
