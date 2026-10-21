# The pipeline's root causes, verify-first, and every system holding its own data (2026-10-19)

James, 2026-10-19 (in order):
- "need to be able to manage/upload/detect files in the file manager for retry logic, response from agent, contract, component
  store, i need more control and access to it." · "files names must remain consistent."
- "what do you think about agents to check previous chunks as is and only change if they don't match coniditions?"
- "that way we can check, test and generate in the same response. like a second opinion on each chunk."
- "each system needs to be like loom. ccompartmentalized, check the compartment template in loom. the architevture spec in
  idearium and gensiss. all the systems handling data like guardian does. each system has a jaa database for each system, for
  the node type tables, so they are dynamicm the server.js uses it to manage data?"
- "we need to fix the pipeline though. like i said."

The coder's reading, to confirm: "fix the pipeline" is first the root causes his 2026-10-19 log shows (RC1–RC4, built here),
then the loop that kept SP5_title (a one-line trim function) at attempt 14 (VF1–VF5 and the plan-conflict ask AQ1–AQ3, which
another session numbers 0.60.169). The sovereign stores (SS1–SS4) follow; the Toolbox, store explorer, Versionium-in-Code and
Ideas+Notes asks are mapped as UI phases after them.

## Ground truth (read in the code and his log, 2026-10-19)

- Every kernel opens cortex's central store: his log shows "[jaa] Store ready — data\cortex\memory" from orchestrator, guardian,
  idearium, versionium, copilot, intelligence, loom, architect, diagnostic and clear-glass. 56 non-test files in the twelve
  kernels still require cortex/memory/jaa-db.js (copilot 12, intelligence 8, loom 8, versionium 6, cortex 6, orchestrator 4,
  guardian 4, idearium 4, diagnostic 3, architect 1, ollama 0).
- Each system already has its own NODE store: lib/node-registry.js startForSystem (0.60.131) runs per system into
  <system>/data/node-index. lib/system-store.js (0.60.133 IM6) gives a system its own store with jaaDB's call shapes and a
  one-time migration of its tables from cortex — used today only by diagnostic/healer.
- loom/templates/cos-compartment.js holds each system's compartment manifest; its seal is ready only when the system is
  sovereign (lib/system-boundary.js). Today no kernel's seal is ready. Blockers (data / primitive / capability crossings):
  guardian 3/2/27 · idearium 2/2/33 · orchestrator 4/4/30 · copilot 12/2/13 · intelligence 6/7/3 · versionium 5/1/4 ·
  loom 3/4/1 · diagnostic 2/1/9 · cortex 0/4/16 · ollama 0/2/4 · architect 1/2/3 · clear-glass 0/0/10.

## Phases. Order of delivery per phase: backend → route → command → UI.

phases:

  RC1_watchers_never_kill_a_kernel:
    layer: foundation
    status: BUILT 2026-10-19 (0.60.170)
    depends_on: []
    axioms: [§1.2, §0.1]
    files: [lib/safe-watch.js, orchestrator/orchestrator.js, guardian/lib/node-registry.js, lib/node-registry.js,
            lib/node-index-watcher.js, lib/queue.js, lib/ico.js, auth/index.js, architecture-spec/registry/watcher.js,
            cos/foundation/file-browser.js, diagnostic/nexus-diagnostic.js, emerge/emerge-kernel.js, idearium/repo/watcher.js]
    does: >-
      His log: orchestrator and Guardian died on "EPERM: operation not permitted, watch … Unhandled 'error' event". No fs.watch
      had an 'error' listener; Windows fires it asynchronously after the try/catch returned. safe-watch takes fs.watch's
      arguments, says an error once per target, re-arms with a 2 s → 60 s backoff while the target exists, and throws a
      synchronous failure exactly as fs.watch does. lib/ico.js:585 (a one-off trigger call) is left as it was.
    proof: tests/modules/test-pipeline-root-causes.test.js RC-01, RC-02

  RC2_linear_node_scan:
    layer: foundation
    status: BUILT 2026-10-19 (0.60.170)
    depends_on: []
    axioms: [§1.1, §0.1]
    files: [lib/node-registry.js]
    does: >-
      processFile read every indexed row of its type once per file (twice for a removal): O(n²) on the event loop. One map per
      type per scan, kept current. Measured here: 12,000 nodes rescan 10.2 s → 0.95 s; 4,000: 1.3 s → 0.3 s. Not measured on
      his machine. Whether this is all of idearium's ~100 s silence at boot (watchdog OFFLINE, phase 3 halted) is TO CONFIRM
      on his next boot log: the registry line should now follow idearium's boot within seconds.
    proof: RC-03 (3,000 schema-valid nodes all indexed; rescan all unchanged, under 3 s)

  RC3_windows_safe_node_names:
    layer: foundation
    status: BUILT 2026-10-19 (0.60.170)
    depends_on: []
    axioms: [§1.2, §0.3]
    files: [lib/node-export.js, lib/pipeline-nodes.js, lib/node-registry.js, idearium/api/index.js]
    does: >-
      His log: "ENOENT … idearium\data\nodes\phase:SP5_title:6ceaa59e8eee182c.graph". node-export fileIdOf(id) maps < > : " / \
      | ? * and control characters to '~' (an id without them keeps its own name: nothing written before moves); exportToFile and
      pipeline-nodes writeNode use it; the registry matches a removed file by it. The build writes .graph and .phase nodes into
      nodes/graph/ and nodes/phase/, where the node listener reads (at nodes/ they were never indexed).
    proof: RC-04

  RC4_agent_file_names_guarded:
    layer: foundation
    status: BUILT 2026-10-19 (0.60.170)
    depends_on: []
    axioms: [§1.2, §5.2]
    files: [lib/path-guard.js, lib/repo-inject.js]
    does: >-
      His Versionium tab: "Gemini said tests/sp5-title.test.js", "tests/sp5-title.", "tests/sp5-title-test." written beside the
      real file. At propose() — every agent write's one door — a chat speaker label is removed, a name cut at a dot or dash is
      resolved to the ONE existing file it names (none or several: refused, not guessed), a folder or file named like reply prose
      is refused. A change is recorded on the inject as pathNote. Where the label first enters the path (the reply→path step)
      is NOT found yet: this guards the door, it does not fix the source. Open as RC5.
    proof: RC-05, RC-06; test-repo-inject 100/100 (a regression in the first version — an absolute path rewritten — was caught by it and fixed)

  RC5_find_where_the_label_enters:
    layer: foundation
    status: DONE 0.60.187 (see the addendum at the end)
    depends_on: [RC4_agent_file_names_guarded]
    files: [guardian/lib/chat-transcripts.js, guardian/lib/code-artifact.js, cortex/core/raid/officiator.js]
    does: >-
      The jobs that produced the labelled paths completed "from the transcript" (guardian/chat-transcripts), and the officiator
      synthesizes contracts from staged drops. Read the transcript text the path came from (the pathNote rows RC4 now records
      say which inject), then strip the provider's speaker label where the transcript is read, so the label never reaches a name.
    proof: a Gemini transcript fixture carrying "Gemini said" yields no label in any path, drop or chunk name

  VF1_verify_first:
    layer: library
    status: BUILT 2026-10-19 (0.60.171)
    depends_on: [RC4_agent_file_names_guarded]
    axioms: [§1.1, §8.6, "agents for what they are best at, as little as possible"]
    files: [lib/verify-first.js, idearium/api/index.js, lib/test-first.js, lib/expectation-tests.js]
    does: >-
      His idea: "agents to check previous chunks as is and only change if they don't match coniditions". Before any agent is
      asked about a chunk that already has content, run its conditions with no model: parse, expectation test, the frozen test,
      the contract's conditions, in COS's process sandbox (cos/testenv/run-target.js, 0.60.166). All pass → the chunk is left as
      it is ("pass means hands off": an agent may not rewrite a passing chunk). A failure → only that chunk goes to an agent, and
      the brief is the failing condition, not "write the file". A chunk whose only conditions are shallow (loads, exports exist)
      is marked "passes, barely checked", never "done". Generalises 0.60.167's phase-level, existence-based accept-already.
    proof: SP5_title as a fixture — lib/title.js exists and passes → zero agent calls; a broken title.js → one call whose brief names line 5

  VF2_one_response_bundle:
    layer: library
    status: OPEN
    depends_on: [VF1_verify_first]
    files: [lib/verify-first.js, lib/repo-hat.js]
    does: >-
      His: "check, test and generate in the same response. like a second opinion on each chunk." One request returns code, a test,
      and claims, in machine-readable blocks; a malformed reply is refused. The writer's own test is a bonus, never proof: proof is
      the frozen test, the expectation test and the conditions. Replaces SP5's four jobs per attempt (intro, test steps 2-4,
      "you just wrote…" confirmation), each behind Guardian's 15 s gap.
    proof: requests per accepted chunk, before/after, on the same chunks; defects caught must not fall

  VF3_mutation_check:
    layer: library
    status: OPEN
    depends_on: [VF1_verify_first]
    files: [lib/mutation-check.js]
    does: >-
      Deterministic, no model (the review he was handed, 2026-10-19): flip a comparison, swap a return, drop a throw, remove a
      .trim(); a mutation no test catches means the tests do not check that behaviour. Small chunks only, and only when memory allows.
    proof: title.js with .trim() removed must fail the frozen test; a test that only checks the export exists is reported shallow

  VF4_second_opinion_on_need:
    layer: library
    status: OPEN
    depends_on: [VF2_one_response_bundle, VF3_mutation_check]
    files: [lib/verify-first.js, lib/agent-record.js]
    does: >-
      A different, local reviewer only when the checks are shallow, the writer's test disagrees with the frozen one, or a mutation
      survives. It sees the requirement, the code and the evidence, and returns objections tied to lines — never a bare verdict; an
      objection goes to a deterministic check or to him. A plan that contradicts its test goes to him (AQ1–AQ3).
    proof: reviewer calls only on those triggers; disagreement rate recorded per agent

  VF5_verdict_cache:
    layer: library
    status: OPEN
    depends_on: [VF1_verify_first]
    files: [lib/verify-first.js]
    does: >-
      A verdict is keyed by the chunk's content, its conditions, the hashes of what it depends on (the phase graph), the test files,
      the Node version, the runner and its config, and the lockfile. Any change → checked again. Memory: before loading a reviewer,
      free memory minus the model's known size must leave a margin (lib/resource-monitor fitsModel), else defer or use a smaller one.
    proof: a dependency change re-checks every chunk that uses it; an unchanged chunk costs no run

  SS1_system_store_adoption:
    layer: library
    status: OPEN
    depends_on: [RC1_watchers_never_kill_a_kernel]
    axioms: [§5.9, §5.10, "ONE_WRITER_PER_STORE"]
    files: [lib/system-store.js, guardian/server.js]
    does: >-
      His: "each system has a jaa database … the server.js uses it to manage data". lib/system-store.js already exists (0.60.133)
      and is used by one module. Move one system home end to end first — Guardian, since he named it as the model and it already
      keeps its own JAA (data/guardian/memory): its 4 cortex jaa-db requires switch to its own store, tables migrated once and
      recorded; then census its data blockers to 0.
    proof: guardian's data blockers 3 → 0 in lib/system-boundary.js sovereignty(); its tables read the same rows after the move

  SS2_every_system_home:
    layer: library
    status: OPEN
    depends_on: [SS1_system_store_adoption]
    files: [copilot/, intelligence/, loom/, versionium/, orchestrator/, idearium/, diagnostic/, architect/, cortex/]
    does: >-
      The same move, one system per phase, ordered by data blockers (copilot 12, intelligence 6, versionium 5, orchestrator 4 …),
      each with its own graph (DG2). Cortex keeps only what is cortex's.
    proof: per system, data blockers to 0; the 56 cortex jaa-db requires counted down

  SS3_nodes_are_the_data:
    layer: library
    status: OPEN
    depends_on: [SS2_every_system_home]
    files: [lib/node-registry.js, lib/node-schemas.js]
    does: >-
      His: "for the node type tables, so they are dynamic". A system's persistent records are node types with schemas
      (lib/node-schemas/schema.*), indexed by its own registry into its own store, as Guardian's are; a new node type is a schema
      file and a folder, not code. The server reads and writes through its registry.
    proof: a new node type added by dropping a schema and a folder is listed, indexed and queryable with no code change

  SS4_seal_into_compartments:
    layer: integration
    status: OPEN
    depends_on: [SS3_nodes_are_the_data]
    files: [loom/templates/cos-compartment.js, lib/system-boundary.js]
    does: >-
      His: "each system needs to be like loom. ccompartmentalized". A system moves into its COS compartment when its seal is ready
      (sovereign: data, primitive and capability crossings closed), never before — the template already says so.
    proof: first seal ready (expected: ollama, 0 data blockers, fewest crossings)

  UI1_toolbox_and_store_explorer:
    layer: interface
    status: OPEN
    depends_on: [SS1_system_store_adoption]
    files: [lib/store-explorer.js, idearium/ui/js/repo-toolbox.js]
    does: >-
      His: Debug and Intelligence as one toolbox; the RAID compartment, flight recorder, agent responses, contracts, retry
      attempts and component store browsable, uploadable and detected from the files side. Mapped in the 2026-10-19 conversation;
      the flight recorder (lib/change-record.js) and both renderers already exist.

  UI2_version_in_code:
    layer: interface
    status: OPEN
    depends_on: []
    files: [idearium/api/index.js, idearium/ui/js/repo-versions.js, idearium/ui/js/code-surface.js]
    does: >-
      Open any version's file in the Code surface, read-only, with put back and compare with now (repo-history restoreFile's
      read path as a route). Whether backups store only diffs is to check in lib/repo-versions.js before claiming it.

  UI3_ideas_and_notes_as_one:
    layer: interface
    status: OPEN
    depends_on: [VF1_verify_first]
    files: [lib/repo-notes.js, lib/work-funnel.js, idearium/ui/js/repo-notes.js]
    does: >-
      His: "nothing exists without dependancies." One Ideas tab: each note and idea runs through lib/work-funnel.js (dependencies,
      spec, phase, chunks); an unmapped one is flagged; a mapped one can be promoted to a phase.

## ADDENDUM 2026-10-19 (0.60.171) — built and newly mapped

James (same day): "need verify first … prioritize gemini … specify the axioms, from the docs axioms 3.1" · "what if we have agents improving the understanding of themselves for nexus … interrogate them?" · "is a copy for book keeping? each type of memory system. like maybe cortex is long term storage. nothing that gives history or context, is lost. like each system holds its own data. cortex book keeps." · "all systems contain everything they need to run on their own." · "fiverr isn't working for autofill, copilot definitly isnt. what if we have a tool to extract the dom, parse, chunk, build index, and synthesize?" · "need idearium all wired and interconnected also."

Status changes: VF1 BUILT 0.60.171 (both build paths) · VF5 BUILT in part (in-process verdict cache; reviewer memory check still open) · RC4b BUILT (repairTree) · new CB1 BUILT, CB2 BUILT, SM1 BUILT.

phases:

  CB1_coder_brief:
    status: BUILT 2026-10-19 (0.60.171)
    depends_on: [VF1_verify_first]
    files: [lib/coder-brief.js]
    does: Gemini's five-part brief with AXIOMS v3.1 as coder rules, for every file and brick sent to a coder.

  CB2_gemini_first:
    status: BUILT 2026-10-19 (0.60.171)
    depends_on: []
    files: [lib/pipeline-routing.js]
    does: gemini first among browser coders after the learned order (routing.prefer_coder, prefer_over).

  SM1_agent_self_model:
    status: BUILT 2026-10-19 (0.60.171)
    depends_on: []
    files: [lib/agent-self-model.js]
    does: each agent's intent, needs, constraints, learned counts; interrogation prompt; answers kept as proposals.

  DG3_the_whole_dag:
    status: BUILT 2026-10-19 (0.60.172)
    depends_on: []
    files: [lib/phase-dag.js, idearium/api/index.js, idearium/cli/route-commands.js]
    does: >-
      James: "every phasemap phase needs extensive dag, that needs to start being standard." The DAG of every phase of every map
      of a repo (decisions included): declared and inferred edges, cycles, dangling depends_on, phases with no depends_on line,
      layers, ready set, critical path of open phases, same-file conflicts with no order. A phase in a cycle or with a dangling
      depends_on is not built (409 DAG_INVALID; anyway overrides, said); each phase's slice goes on its graph (file + node), on
      the graph route, and to the agent. GET /api/repos/:uuid/phases/dag · `repo dag <repo> [phase]`.
    proof: tests/modules/test-phase-dag.test.js 8/8; Nexus's own 149 maps in ~0.5 s

  DG4_nexus_maps_meet_the_standard:
    status: OPEN
    depends_on: [DG3_the_whole_dag]
    does: >-
      Nexus's own maps, as DG3 reads them (2026-10-19): 3 cycles (PV0⇄PV1, PL6⇄RF0, GA6⇄GA9), dangling depends_on (several are
      prose that a malformed depends_on line swallowed — "each", "staging", "on"), and phases with no depends_on line in 85 maps.
      Fix the cycles and the dangling by hand (his call on each cycle's order); write `depends_on: []` where a phase depends on
      nothing — a mechanical pass, proposed for review, never silent. The Phases panel shows the DAG slice (UI).

  DG5_dag_in_the_brief_and_the_ui:
    status: OPEN
    depends_on: [DG3_the_whole_dag]
    does: >-
      The agent brief carries the slice (what it unlocks, what must not break downstream, conflicts); the Phases panel draws the
      map's DAG (layers, critical path highlighted, cycles and dangling in red) from the dag route.


    layer: interface
    status: OPEN
    depends_on: [SM1_agent_self_model]
    does: >-
      A route + command (`agents interrogate <provider> <run>`) that builds the prompt from a failed run's rows, sends it through
      Guardian like any job, parses the answer and keeps it as a proposal; the Toolbox lists proposals for accept/reject. Outcomes
      of every hop also feed observe(). Nothing an agent proposes changes Nexus until James accepts it (§7.2, §8.2).

  RC6_unowned_ollama_load:
    layer: foundation
    status: DONE 0.60.187 (see the addendum at the end)
    depends_on: []
    does: >-
      His log, 20:32–21:52: an Ollama "ask" of 293 chars (num_ctx 5120) every ~90 s, each running 85–147 s on qwen2.5-coder:7b,
      with no repo or caller named — the model stays loaded and free memory sits near the halt line. Find the caller (not found
      in this session), and make the bridge refuse a job that names no owner (§1.2: traceable to a cause).

  RC7_every_run_names_its_starter:
    layer: foundation
    status: DONE 0.60.189 (see the addendum at the end)
    depends_on: [RC6_unowned_ollama_load]
    files: [idearium/api/index.js, idearium/api/build-surface.js, lib/agent-tools/tools/nexus/command.js, idearium/cli/route-commands.js, idearium/ui/js/plan-panel.js, idearium/ui/js/repo-tasks.js, idearium/ui/js/living-spec.js, idearium/ui/js/workshop.js]
    does: >-
      James, 2026-10-21: "It built 5 phases in a row." The code has no path that builds a different phase unasked: every UI build is a
      click, the watchdog only rebuilds the same phase, and the spec's "Build next" is one phase per press. But an agent can call
      `repo phase build` / `spec build` (neither is the person's alone), and a run row records repo, map, phase and graph, never
      who started it, so what he saw cannot be traced (§1.2, EXPLAINABILITY). Every run row carries startedBy {who, whence}:
      whence 'access' (the keyed caller the gate passed), 'declared' (the caller says: person:ui, person:cli, agent:<name>),
      'system' (watchdog:<kind>), or 'unknown' — never guessed (NC0's evidence rule). Shown on the run in the Plan panel and in
      `repo runs`.
    proof: test-pipeline-root-causes RC-11 (every door sets it; an agent's call is agent:<name> whatever the row sent; unknown stays unknown)

  MEM1_cortex_keeps_the_books:
    layer: foundation
    status: DECISION (his words, to confirm)
    depends_on: [SS1_system_store_adoption]
    does: >-
      His model: each system holds and runs on its own data; cortex is long-term storage and the bookkeeper, so nothing that gives
      history or context is lost. Today it is the reverse: every system's LIVE tables are in cortex's one store, so 10+ processes
      load and rewrite the same files (his log: "BREAKING STALE FLUSH LOCK (event_log) — held >10000ms"). The shape: a system's
      live rows in its own store (SS1–SS2, lib/system-store.js); cortex receives an append-only copy of each system's history
      (ledger fan-in already exists: lib/ledger-fanin/) and owns retention, compaction and recall. Loom today: its own node index,
      but its hook/component tables still in cortex's store (8 requires) — not yet the model either.

  PR1_page_reader:
    layer: library
    status: OPEN
    depends_on: []
    files: [clear-glass/src/page/semantic-tree.js, lib/page-reader.js]
    does: >-
      His tool: extract the DOM → parse → chunk → index → synthesize, so an agent can read any page. Reuse SP1's semantic page tree
      (clear-glass/src/page/semantic-tree.js, built 0.60.49) as the extract+parse; chunk by landmark/region; index with the
      existing vector memory (TF-IDF fallback today); synthesize with a local model only when asked a question. Closes the open SP3
      ("the browser agent reads the tree"), which is why Fiverr autofill and the co-pilot guess at fields today.
    proof: a saved Fiverr gig-editor page reads back as named fields with their semantic addresses; a question about it is answered from the index

  PR2_autofill_and_copilot_read_first:
    layer: integration
    status: OPEN
    depends_on: [PR1_page_reader]
    does: >-
      GA autofill and the co-pilot read the page through PR1 before acting (field map from the tree, the learned selector map second).
      Each failure is said with the field it could not find (the logs today don't say why autofill misses).

  ID1_ideas_wired_through:
    layer: interface
    status: OPEN
    depends_on: [VF1_verify_first]
    does: >-
      UI3 made concrete: Idea → Notes → Spec → Phases → Code in one thread. A note/idea runs through lib/work-funnel.js; it shows the
      phases and files it became (and they link back); promoting an idea writes the phasemap phase with its dependency graph (DG2).

## ADDENDUM 2026-10-19 — PR1/PR2 superseded-and-kept by the page map
James, 2026-10-19: "parse the dom, index each element as blocks, then download into a index to chunk, then synthesize a fucking map
in relation to the weboage to use as a map or reference point for inputs from the cli or the intent. learns over time."
PR1_page_reader and PR2_autofill_and_copilot_read_first stay here as the earlier, shorter reading (§0.3). The work is mapped as
PM1–PM8 of docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (blocks, index + chunks, a per-site map that learns, intent →
targets, tools, Nerve feel, live injected map, panel). PR2's "autofill reads the page first" rides PM4's find() once it lands.


## Addendum 2026-10-21 (0.60.187): RC5 and RC6 found and fixed at the cause

James, 2026-10-21, asked the order (fixes first, or the BrainOS move): "Fixes, then graph (Recommended)".

RC5 — where "Gemini said" entered a path. lib/repo-inject.js fromReply, the "agent names the path" branch: a code block with no path the
code could read was resolved by asking the agent "Reply with ONE line only: the path", and the FIRST LINE of the answer was taken as the
path. The answer was Gemini's page text read with innerText, which starts with the page's screen-reader line "Gemini said" — so
"Gemini said tests/sp5-title.test.js" (or, split across lines, "Gemini said") became the target. _safeRelative only refused absolute and
"..". The cut names ("tests/sp5-title.") were answers read mid-stream: replyFor took the newest transcript version with no settled check.
No regex cut them. Fixed: lib/path-guard.js stripSpeaker (a leading speaker line only) and pathAnswer (one complete path: no spaces, no
prose, a full extension, not ending in a dot or dash, else null); fromReply uses pathAnswer; chat-transcripts.matchJobs strips the label
from every reply it hands on; replyFor skips a transcript still settling or generating (the rule _completeFromTranscript already kept);
the Gemini userscript strips its own label at the page. RC4's guard at propose() stays as the second door.

RC6 — the unowned Ollama load. diagnostic/nexus-diagnostic.js _escalateHighSeverityGaps: a 30 s sweep sent open high-severity gaps to the
bridge (POST :3749/api/jobs) with no intent, model, maxTokens or owner, so the bridge logged "bridge job … (ask)" and gave it the 4096-token
answer budget (293 chars + 4096 + 256 → num_ctx 5120: his log's numbers exactly). It marked a gap 'investigating' through its own
in-process JaaStore copy (and with a bare uuid where the store wants a filter), which cortex never saw, so the gap came back open; its
5-minute cooldown lived in memory and was lost on restart. The bridge runs one job at a time, so the backlog ran back to back (his
"every ~90 s" is the 85–147 s run time), and the model never idled long enough to unload. Fixed: the bridge refuses a job naming no owner
(componentId, agentId, repoUuid, sessionId or meta.source — every other caller in the tree already names one) and puts the owner in its
log line; 'diagnose' is a background intent (gives way to foreground work); the escalation names itself (componentId
diagnostic.escalation, intent diagnose, maxTokens 1024, record false), sends at most one Ollama escalation per sweep, keeps a six-hour
cooldown on disk (data/diagnostic/escalated.json), and sets a gap's status through cortex's new POST /api/gaps/status (cortex owns the
table — MEM1's direction). Reading, to confirm on his machine: that the ~90 s ask stops (his activity log should show
"for diagnostic.escalation" at most once per sweep, deferred while a build runs).

Proof: test-pipeline-root-causes RC-07..RC-10 (RC-09 drives the bridge's real handler).


## ADDENDUM 2026-10-21 (0.60.188) — two silent gaps in the DAG's reader, found by the census

James, 2026-10-21: "go ahead with the census"

The CNS1 census (docs/2026-10-21-brainos-into-idearium-phasemap.spec) read every phase in every map and found the shared phasemap parser
silently skipping phases (§1.2). That parser is loom/scanners/phasemap-map.js, which DG1, DG2 and DG3 all read through.
- PHASE_RE allowed one to three capitals and only digits before `_`. COSA1_…, MR3b_…, TB7a_… and the BX0a-style decisions were not
  phases, and a depends_on naming them was "dangling".
- Fixed:
  - up to five capitals, and one lowercase letter after the number;
  - an indent-2 lowercase key (`  decisions:` under `spec:`) is a section;
  - lib/phase-dag.js keeps a decision a decision when the parser also returns it.
- Whole DAG: phases 1900 → 1925, decisions as read by phase-dag 77 → 98, dangling 25 → 17. test-phase-dag 8/8, test-loom-phasemap 8/8,
  test-loom-phasemap-status 14/14.
- A build that DG3 refused as dangling on one of these ids now reaches DG1. If the id is an open decision there, the refusal is "open
  dependency", which is the true reason.


## ADDENDUM 2026-10-21 (0.60.189, RC7) — every run names who started it

James, 2026-10-21: "It built 5 phases in a row. I think I see what you mean but there are way more idearium phases than that."
- **Traced in the code.** No path builds a different phase unasked:
  - every UI ▶ build is one click (the Plan, the Phases tab, the spec's "Build next", the workshop, the retry button);
  - the run watchdog rebuilds only the same phase.

  A **listener**, though (lib/listener-commands.js, his 0.59.4 design: "Use the listener to have you use a command"), runs up to 5
  command lines per reply it hears (MAX_PER_EVENT = 5), through the agent command tool. `repo phase <p> build` is not the person's
  alone, so one AI reply holding five build lines builds five phases in a row. RC-11 drives that exact path. An agent calling the
  command tool does the same.
- **Why it could not be traced.** A run row named repo, map, phase and graph, never who started it.
- **Built.** Every run row carries `startedBy { who, whence }`:
  - `access`: the keyed caller the gate passed;
  - `declared`: person:ui, person:ui:retry, person:ui:workshop, person:cli, or agent:<name>. The agent command tool overrides
    whatever the row sent, so a listener is `agent:listener`;
  - `system`: watchdog:<kind>;
  - `unknown`: never guessed.

  It shows on each run in the Plan panel ("by …", "by ?" for a run from before this release) and in `repo phase <repo> <phase>`.
- **Proof:**
  - test-pipeline-root-causes RC-11 (11/11);
  - test-plan-pieces PP-02 in Clear Glass (the label);
  - test-cm3-commands CM3-01 and test-phases-tab PT-04, updated for the body that now carries the door.
- **Open, his to judge (USER_AUTONOMY).** Whether a build may start from text a listener hears in a chat. Today it may, by his
  0.59.4 design. The record now says when it did; it does not change the rule.
- This map's phases are now each specced (emerge/compiler/phase-specs.js): 58 files beside their owners, written for the first time.

## ADDENDUM 2026-10-21 (0.60.194) — SP5 "title.js": why it kept failing, all of a sudden

James, 2026-10-21, with three screenshots of SP5 (LOOKING-GLASS-BUNDLE-V0_4) and his boot log: "its having so much issue with the title.js.
nothing has fixed it. sp_5." · "why all of a sudden? with the clearglass?"

Four causes, traced from his log and screenshots:
1. **ChatGPT moved its chats to /uc/<id>** (his log: chatgpt.com/uc/6ad8ebba-…). Every reader keyed on /c/:
   - the userscript's chatId() read 'home', so the chat stream (the download manager's chat ledger) dropped the chat;
   - the transcript reader's resumable URL and Clear Glass's chat ports did not match it either.

   ChatGPT's reply was then found nowhere: "no-reply-element", then "needs-you". This is the "all of a sudden".
   **Fixed:** /c/ or /uc/ in all three places; userscript 10.12.5 (RC-13).
2. **A junk test from before RC5 blocked the Apply.** `looking-glass-bundle-v0_4/Gemini said tests/sp5-title.test.js` stayed in the tree.
   RC4b's repairTree ran only inside the test-first branch, and a build that resumes its saved plan never enters it.
   **Fixed:** every phase build repairs the tree after its snapshot. The names are archived, never deleted (RC-12).
3. **The proposal is genuinely wrong, and the gate was right to refuse it.**
   - ChatGPT's title.js lowercases, splits on whitespace and capitalises, but never trims.
   - ' looking glass ' becomes ' Looking Glass ', and both tests expect 'Looking Glass'.
   - The regression gate refused it ("2 linked tests that pass on the current file fail on this proposal"). That is the system working.
4. **Claude's tab was signed out by claude.ai itself** (logout?involuntary=1). No account-switch line appears in his log, and that module
   logs every switch and sign-out, so Clear Glass did not clear it. The fix is signing in once in the Claude tab.

Also in his log, said and not changed: free memory at 16–18%, so the Ollama rungs were left off ("won't fit memory") and the ladder used
browser agents only.

## ADDENDUM 2026-10-21 (0.60.195) — Looking Glass is the pipeline's real test case; two more causes in SP5

James, 2026-10-21: "okay bvut did it not capture response from chatgtp." · "looking glaass is a test spec. rral spec test caser"
- **His framing, recorded as his.** looking-glass-bundle-v0_4 is the real test case for the pipeline. When it fails, the pipeline is what is
  being tested; the spec is not at fault.
- **No, ChatGPT's reply was not captured.** The Code tab's job bar showed `chatgpt job b833e855 … 0ch · no-reply-element`, and Guardian ended
  the job at needs-you. The /uc/ fix (0.60.194) lets the chat stream and the transcript record ChatGPT chats again. A needs-you job stays
  a transcript candidate (chat-transcripts _candidates takes any job not complete), so its transcript now completes it.
- **The proposal "by chatgpt" was Gemini's.** It is stamped 9:43:34, before the ChatGPT job existed (16:43:34.976 UTC). The work surface
  took a run's provider from its last row, and the 'escalating' row names the next rung. Fixed: each path is credited to the agent whose
  reply brought it (RC-15).
- **Why nothing fixed SP5.** His log: "[shadow] phase.build: 1 expected thing(s) absent — lib/title.js". Gemini's reply landed
  looking-glass-bundle-v0_4/lib/title.js; an imported bundle keeps its files under its own folder, and the map names them from there. The
  shadow's exact match called the delivered file absent, so every attempt that worked climbed the ladder and was discarded.
  Fixed: `_underMapRoot` counts the delivered path as the expected one in two cases:
  - it is under the map's root folder;
  - it is under exactly one top-level folder, and the expected path has a folder of its own.

  A bare file name never matches (RC-14).

## ADDENDUM 2026-10-21 (0.60.196) — the upload that outran its wait; a build no longer refuses a repo for having no index

James, 2026-10-21, with screenshots of the upload dialog left on "looking-glass-bundle-v0_4.zip — ready" and SP5's build refused:
"now its not working, i clicked the phases to build it and got: ... the import project ui needs to close when it's complete. "10:57
AMrefused no snapshot: repo has not been through the import pipeline (no atlas.json) — run POST /api/repos/:uuid/chunk first" what does
it need an atlas for?"
- **What the atlas is for.** The Versionium snapshot taken before every build (never write without one) records which atlas, chunk index
  and graph the build reads its context from (idearium/repo/snapshot.js buildSnapshotRecord, mustRecord). A repo with files and no index
  has nothing to pin, so the snapshot refused, and the build with it.
- **Why the repo had no index.** "— ready" without a size is the text the dialog resets to when finalize throws. Its wait was 30 s; the
  server finished the import after the browser stopped waiting (the repo is in his list, 55 files). The indexing the dialog starts after a
  finished import (POST /api/repos/:uuid/chunk) never ran.
- **Fixed, both ends.**
  - The build: on NOT_INDEXED it runs the same import pipeline POST /chunk runs, in the repo's own directory, writes an `indexed` row on
    the run (§1.2, said, with the pipeline's state), and takes the snapshot again. Any other snapshot failure still refuses.
  - The dialog: waits 120 s. If that runs out, it looks for the repo carrying the compartment the upload opened (every 3 s, one minute);
    found, it closes, opens the repo and indexes it. A real failure shows its reason in the drop zone, never "ready".
- Proof: test-pipeline-root-causes RC-16 (an unindexed repo is refused, the pipeline runs, the snapshot record builds) and RC-17 (a source
  check of the dialog; not driven in Clear Glass, said).
