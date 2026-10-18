spec:
  meta:
    name:     gate-memory
    version:  1.0.0
    date:     2026-10-18
    release:  "0.60.148 (mapped)"
    uuid:     nexus-gate-memory-phasemap-v1-0000-2026-1018-jamesbrooks-001
    owner:    "cortex (contract gates, the gate record, the fulfilled index) · intelligence (lattice, intuition, crystals) · idearium (the context panel, the build's context) · lib (the context ladder, vector memory, the component store, context-atlas)"
    status:   "MAPPED 2026-10-18, before building. Every phase names its files, so each has a dependency graph (DG2); the graphs were run on this map before it was called done (addendum a)."
    voice: >-
      The ideas, the direction and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to
      correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    origin: >-
      James, 2026-10-18: "what about using verctor memory or associative memory or the pattern engine. intuition to find context
      if needed. like the tools the agents use, need persistence, maybe build each gate, hooked into the context panel. gates hold
      context for each gate, maintain persistence, maybe with ids, in a table in the precommit compartment. that way the context
      isn't lost, its all tangible and the system tracks progress, that way restarts don't affect it, context isn't lost, all
      timestamped, then we can reuse contracts and responses, need a full index for approved and fullfilled contracts, cystalization
      memory. associative lattice, every data node, is a node in the associative lattice, interconnected by the timestamp and cuasal
      graph. everything reused from the inside out, then build only when necessary."
    axioms: "docs/AXIOMS-v3.1.md — §8.6 reuse before build, §3.3 map before build, §0.3 nothing lost, §2.1 persistence is the golden rule, §17.5 provenance, §10.1 one writer, §10.3 one truth; docs/CLAUDE.md: deterministic first, a model last; a dependency graph before every phase"
    reading_of_his_words: >-
      The coder's reading, to confirm: every gate becomes a durable, timestamped record of what it was given (its context, each
      piece with where it came from), what it got back (the response), and how it ended (verdict, evidence) — kept on disk so a
      restart loses nothing, shown in the context panel. Before an agent is asked, context is found from the inside out: an
      approved, fulfilled contract that already answers it; then what is joined to it in the lattice (time and cause); then what
      it resembles (intuition, crystals); then what reads like it (vector memory); and only then the agent's own tools, and only
      then a build.

  # ── What exists, read 2026-10-18 at 0.60.147 ─────────────────────────────────
  exists:
    gate_state: "cortex/core/raid/contract-gates.js — each gate's state in its .contract file: status (BLOCKED, READY, RUNNING, PASSED, FAILED, STALE, SKIPPED), evidence, the hashes of the refs it required, at, attempts, reasons; checkpoints per passed gate; STALE when a ref's content changes. packet(p, gate): the smallest context one gate needs (its refs resolved, upstream evidence, its gaps). Persisted as a file: it survives a restart."
    gate_context_not_kept: "What a gate was GIVEN (the prompt, the retrieved context) and what it GOT (the reply) are not on the gate. The build's context is sized at send time (_contextOf → the 'started' row's context: sizes per part, not the text); replies live in guardian's .response nodes (guardian/lib/response-sink.js) and chat transcripts, joined to nothing by id (docs/2026-10-17-debugging-product-phasemap.spec ids_and_the_job)."
    exact_reuse: "lib/component-store.js — every component WARP builds, found again by its contract's digest (byContract) or its prompt's digest (byPrompt). It does not know whether what it holds was approved."
    semantic: "lib/vector-memory.js + lib/local-vector-index.js — embeddings (Ollama nomic-embed-text) in a file-backed index, SNR-gated; a TF-IDF fallback when Ollama is down (his log 2026-10-17: 'TF-IDF fallback')."
    resemblance: "intelligence/intuition.js — 'fast, associative, pattern-first. No model. Source: what's crystallised.' meta/crystal-lattice.js — a (domain, verb, outcome) seen often enough becomes a crystal (PASS) or a negative crystal (FAIL/DELETE). lib/pattern-leverage.js ranks patterns by impact over frequency."
    association: "intelligence/lattice/associative-lattice.js — relationship_lattice: edges between SYSTEMS (and users, sessions) holding the four CFR numbers. Not every data node. intelligence/rfr2 (typed causal edges), lib/node-registry.js (every system's nodes, an index per type, a ledger of every change with its time), .wire nodes (lib/system-nodes.js)."
    one_door: "lib/context-atlas.js — one search across the stores, graphs, vector memory, the agent memory and the specs (2026-09-27: 'idearium agents should be able to find the context easily')."
    the_panel: "the Plan panel's Context card (0.60.107 PS1): what a build gives the agent, part by part, sized as sent."
    approval: "PC8 (docs/2026-10-17-pieces-not-order-phasemap.spec addendum e): his 'nothing is fullfilled until its approved' — a chunk is a contract, green only when approved."
    persistence_decisions: "docs/2026-10-16-durable-work-timeline-phasemap.spec: his 'it need has to be physcial files in the backedn for persistence' · 'a timeline with the checkpoints, and gates rewind points'."

  found:
    - "The pieces are there and joined to nothing per gate. A gate's verdict persists; its context and its answer do not, so after a restart an agent re-finds context it already had, and an approved answer cannot be found again by what it answered."
    - "Reuse is exact or nothing: the component store matches a digest. A contract that differs by a word misses, and nothing records whether a stored component was approved."
    - "The associative lattice holds system-to-system edges, not data nodes. Every node already has a time (its ledger) and some have a cause (causedBy); the lattice of nodes he describes is a join of what the node registries hold, not a new store."
    - "Crystals form from co-occurrence (the failure-mode map's found: crystals_from_noise, from his log of 2026-10-17). Crystallizing from approved contracts needs the causal gate FMR10 maps, or it will crystallize noise."
    - "The causal graph is thin: 4.9% of ledger rows name a cause (diagnostic `system causality`, 0.60.146). Time adjacency works today; causal edges grow as writers pass causedBy (FMR0, IDS3)."
    - "'The precommit compartment' names nothing in Nexus's code or specs. The nearest real things: the repo's staging (a change staged, tested and promoted — lib/code-edit.js, its versionium 'staging' commit) and scripts/precommit-check.js (the rules' git hook). Asked in GM0a."

  decisions:
    GM0a_the_precommit_compartment:
      question: "Where do the gate records live — what is 'the precommit compartment'?"
      options:
        - "the repo's own compartment, beside its staged work: <repo data>/gates/, one file per gate, with an index table (coder's recommendation: the records belong to the work they describe, and a repo carved or moved takes its gates with it)"
        - "a compartment of their own (a COS compartment for pre-commit work), with the table there"
        - "his meaning, in his words"
      status: "HIS — what his words mean."
    GM0b_files_and_a_table:
      status: "DECIDED 2026-10-18 by his axioms — each gate record is a node file (lib/node-export.js envelope, type .gate) and the table is its index (lib/node-registry.js: nodes_gate + its ledger). His 'physcial files in the backedn for persistence' (2026-10-16), I0 everything that persists is a node, §2.1 persistence first, §10.3 the file is the truth and the table is rebuilt from it."
    GM0c_what_a_record_holds:
      status: "DECIDED by his axioms (§10.3 one truth, §17.5 provenance) — references and hashes, never copies: the packet's hash and the ids of each retrieved piece with its source and score; the response's node id; the verdict and evidence are already in the contract. A copy would be a second truth that drifts."
    GM0d_the_ladder_order:
      superseded_by: "addendum (b) 2026-10-18 — his \"it needs to be non linear and agnostic\" · \"look at siso\". No fixed order: inside-out survives as cost, not sequence (the costly sources answer only the residue)."
      status: "DECIDED by his rule (docs/CLAUDE.md: deterministic first, a model last; his 'everything reused from the inside out, then build only when necessary') — exact fulfilled contract → lattice neighbours → crystals/intuition → vector memory → the agent's own tools → a build. Each rung says what it found and stops the ladder when it is enough."

  phases:
    GM1_the_gate_record:
      status: OPEN
      depends_on: [GM0a_the_precommit_compartment]
      files: [cortex/core/raid/gate-record.js, cortex/core/raid/contract-gates.js, lib/node-schemas/schema.gate]
      does: >-
        cortex/core/raid/gate-record.js: at every gate transition (READY → RUNNING → PASSED | FAILED | STALE) a .gate node is
        written or updated — the contract and gate ids, the run and attempt, the packet's hash, the context it was given (each
        piece: kind, id, source, score), the response node id, the verdict, timestamps for each transition. The one writer of
        .gate nodes (§10.1); contract-gates calls it. Where the files live: GM0a.
      proof: "a fixture contract run through three gates leaves three .gate nodes with every transition timestamped; a process restart reads them back unchanged"
    GM2_restarts_resume_from_records:
      status: OPEN
      depends_on: [GM1_the_gate_record]
      owned_with: "docs/2026-10-16-durable-work-timeline-phasemap.spec (TL phases: the timeline, the gates as rewind points)"
      files: [cortex/core/raid/gate-record.js, lib/run-state.js, idearium/repo/run-reconcile.js]
      does: "On boot, a gate left RUNNING is read from its record, not re-planned: the context it was given is re-assembled from the record's references (and said where a piece is gone), and the run continues from the last passed gate."
    GM3_the_fulfilled_contract_index:
      status: OPEN
      depends_on: [GM1_the_gate_record]
      files: [cortex/core/raid/contract-index.js, cortex/core/raid/contract-gates.js, lib/component-store.js]
      james: '"need a full index for approved and fullfilled contracts"'
      does: >-
        cortex/core/raid/contract-index.js: every contract that is complete (every mandatory gate PASSED) AND approved (PC8) is
        indexed by its digest, its outcome's words, its refs and their hashes, and the components and responses that fulfilled
        it. find(contract) → exact hits (same digest) and near hits (same outcome words, overlapping refs), each with whether its
        refs still hash the same (a changed ref makes the hit STALE, contract-gates' own rule). The component store gains
        'approved' on what it holds, from this index.
    GM4_the_node_lattice:
      status: OPEN
      depends_on: []
      files: [intelligence/lattice/node-lattice.js, intelligence/routes.js, intelligence/registry-components.js]
      james: '"associative lattice, every data node, is a node in the associative lattice, interconnected by the timestamp and cuasal graph"'
      does: >-
        intelligence/lattice/node-lattice.js: a projection over every system's node registry, read through each system's route
        (GET /api/system/nodes/:system — never their files), with edges from what the nodes already say: causedBy (causal),
        .wire (system dependency), the same id referred to (reference), and time adjacency within a window (temporal — labelled
        weaker than causal, never presented as a cause). neighbours(node, { kinds, window, limit }) → the nodes joined to it, each
        edge typed and timestamped. POST /api/intelligence/lattice/neighbours. Nothing is copied: the registries stay the truth.
      pushback: "Time adjacency joins everything that happened near each other. It is useful as context and useless as cause; the edge kind travels with every answer so a report never reads a temporal edge as causal."
    GM5_the_context_ladder:
      status: OPEN
      superseded_by: "addendum (b) 2026-10-18 — a stream, not a ladder: every source asked at once, any source can join. The id is kept (§0.3); the text below is the first design, kept."
      depends_on: []
      depends_on_first_design: [GM3_the_fulfilled_contract_index, GM4_the_node_lattice]
      files: [lib/context-stream.js, lib/context-sources.js, lib/context-atlas.js, lib/vector-memory.js]
      files_first_design: [lib/context-ladder.js, lib/vector-memory.js, lib/context-atlas.js]
      james: '"intuition to find context if needed" · "everything reused from the inside out, then build only when necessary"'
      does: >-
        lib/context-ladder.js (a kernel primitive: it reaches cortex and intelligence by their routes, lib/nexus-client.js):
        find(request, gate) climbs, stopping when it has enough —
          1 exact: the fulfilled index (GM3) — an approved answer to the same contract is reused, not rebuilt;
          2 joined: lattice neighbours (GM4) of the gate's refs, causal before temporal;
          3 resembles: intuition over crystals (intelligence/intuition.js);
          4 reads like: vector memory (lib/vector-memory.js, TF-IDF when Ollama is down — said);
          5 the agent's own tools; 6 a build.
        Each piece comes back with its rung, its source id and its score, and goes into the gate record (GM1). A rung that is
        unavailable is said and skipped, never faked.
    GM6_crystallized_from_what_was_approved:
      status: OPEN
      depends_on: [GM3_the_fulfilled_contract_index, "FMR10_it_compounds (failure-mode-report: crystals only on a causal path)"]
      files: [meta/crystal-lattice.js, cortex/core/raid/contract-index.js]
      james: '"cystalization memory"'
      does: "An approved, fulfilled contract crystallizes its pattern (a crystal); a rejected one, its failure (a negative crystal, meta/crystal-lattice.js already has them). Only when a causal path joins the pattern to the outcome — never co-occurrence alone. Intuition (rung 3) then reads crystals that were earned."
    GM7_the_context_panel_per_gate:
      status: OPEN
      depends_on: [GM1_the_gate_record, GM5_the_context_ladder]
      files: [idearium/ui/js/gate-context.js, idearium/ui/css/gate-context.css, idearium/ui/js/plan-panel.js, idearium/api/index.js]
      james: '"hooked into the context panel"'
      does: >-
        The Plan panel's Context card, per gate: what it was given (each piece with its rung and source, sized), what came back,
        how it ended, every transition timestamped — read from the gate records, so it is the same after a restart. A piece links
        to where it came from. GET /api/repos/:uuid/gates(/:id) through cortex by route. Tested in Clear Glass.
    GM8_agents_have_it:
      status: OPEN
      depends_on: [GM5_the_context_ladder, GM7_the_context_panel_per_gate]
      files: [idearium/cli/route-commands.js, lib/agent-tools/tool-catalog.js]
      does: "`gate show <id>`, `contracts find <text>`, `context find <request>` as command rows; the repo agent's context tool climbs the ladder before searching on its own, so 'the tools the agents use' come back with what Nexus already knew."

  build_order: "none — addendum (b): pieces in any order, held back only by a real depends_on. Free now: GM4, GM5. Then GM1 (after GM0a, his), GM3, GM7, GM2, GM6, GM8 as each one's depends_on is met."
  build_order_first_design: [GM0a (his), GM4, GM1, GM3, GM5, GM7, GM2, GM6, GM8]
  build_order_reason_first_design: >-
    GM4 needs no decision and every later rung reads it. GM1 waits only on where the records live (GM0a). GM3 and GM5 are the
    reuse he asked for; GM7 shows it; GM2 makes restarts free once records exist; GM6 comes after the index and the causal gate,
    so crystals are earned. Commands with each phase (order of delivery); GM8 collects the rest.

  not_verified:
    - "that every system serves GET /api/system/nodes/:system (P33a built the route; which systems answer it on his machine is to be read before GM4)."
    - "that lib/vector-memory.js is initialised in the process that would run the ladder (context-atlas notes it is 'only when initialised in the calling process')."
    - "that PC8's approval is recorded where GM3 can read it (to be read before GM3)."

  # ── ADDENDUM 2026-10-18 (a) — every phase's dependency graph, run before the map was called done (DG2) ──────────
  # lib/phase-graph.js on this map at 0.60.147:
  #   GM1 cdd5f7aa (cortex) · GM2 e478d09e (cortex, lib, idearium) · GM3 ea806169 (cortex, lib) · GM4 37cb3a7e (intelligence)
  #   GM5 f17d99df (lib) · GM6 6f4f97b6 (meta, cortex) · GM7 bd807544 (idearium) · GM8 947e0e3f (idearium, lib)
  # Every phase has a graph, and no graph shows a NEW crossing. But a graph cannot see what a file that does not exist yet will
  # require, so the coder read each new or changed file's plan for it. Three would cross if built the obvious way. Each is
  # designed out here, before any code:
  #   - GM3: lib/component-store.js learning 'approved' from cortex's contract index would be lib requiring cortex (upward).
  #     Instead, cortex pushes the flag through the store's own API.
  #   - GM6: meta/crystal-lattice.js reading cortex/core/raid/contract-index.js would be a system crossing (meta → cortex).
  #     Instead, it reads the index through cortex's route.
  #   - GM2: lib/run-state.js reading gate records would be lib requiring cortex (upward). Instead, cortex's boot resumes its
  #     own gates and run-state is told by route.
  # GM5's lib/context-ladder.js reaches cortex and intelligence by route only, through lib/nexus-client.js, as its phase says.

# ## ADDENDUM 2026-10-18 (merge) — what main already built toward this map (0.60.143–0.60.146, this map's line did not have them)
# Built on main from his words of the same day ("We need persistent data" · "persistent per gate" · "the gates need context …
# reuse contracts, jobs and responses" · "only one record … a contract ledger for each contract"):
#   lib/work-journal.js — the contract ledger: one append-only ledger per contract, each gate's attempts, jobs, frames, handled marks;
#     a browser reply's text read from Clear Glass's chat ledger (its route), never copied (0.60.143–0.60.146)
#   lib/gate-context.js — a gate's context in its next attempt, and its finished or in-flight reply reused once (0.60.145)
# GM1 (the .gate record) and GM2 (restarts from records) build on these, not beside them (§8.6): the .gate record's timeline is
# the contract ledger's lines for that gate; "restarts from records" is gate-context reuse plus the contract's checkpoints.

# ## ADDENDUM 2026-10-18 (b) — not a ladder: a stream. Non-linear, and agnostic to where context comes from
# James, 2026-10-18, after the map above (and the merge) were shown to him: "it needs to be non linear and agnostic" · then
# "look at siso".
# What he was looking at: GM5 as mapped is a ladder — six rungs climbed in a fixed order (exact → lattice → crystals → vectors →
# tools → build), each rung named in code, stopping when "enough". GM0d fixed that order, and the build order was one line.
# The coder's reading, to confirm: "non linear" — no fixed order of sources, and no fixed order of building; "agnostic" — the
# finder does not know which stores exist, which system a piece comes from, or what type a node is; "look at siso" — the shape
# is already his foundation: Event → Gate → Stream (siso/Stream.js, siso/Gate.js, siso/Event.js; siso/ is a primitive anyone may
# require, lib/system-boundary.js PRIMITIVES). His precedent for the same words: docs/2026-10-17-pieces-not-order-phasemap.spec,
# "The point is first. That's the point. It's not linear. Like a torrent downloads."
#
# GM5, redesigned on SISO (supersedes GM5's ladder and GM0d's order; both kept above):
#   - The request is an Event: context.request { gate, refs, text, need: [what the gate must know] }. The need is the point,
#     named first (the torrent file); the pieces fill it in any order.
#   - A source is a Gate keyed by its own signature, registered in lib/context-sources.js — a table, not code in the finder.
#     Each row: { signature, system, route, cost: 'free' | 'model' | 'build', kinds }. The fulfilled index (GM3), the node lattice
#     (GM4), intuition/crystals, vector memory, context-atlas, the contract ledger (lib/work-journal.js), the component store —
#     and any later store — join by adding a row. The finder names none of them. That is the agnostic part.
#   - Fan-out without breaking SISO's law (one signature, one gate; collision a hard error): the request gate emits one
#     context.ask.<signature> per registered source. A source that is named but not registered here stays in pending[] —
#     residue, said in the answer ("asked, nobody home"), never faked (§1.2).
#   - Every source answers with context.piece { from, system, kind, id, score, covers: [need items], at } — provenance on every
#     piece (§17.5), references not copies (GM0c). kind is the lattice's edge kind (causal | wire | reference | temporal |
#     resembles | exact) and travels with the piece, so a temporal piece is never read as a cause (GM4's pushback).
#   - No order, but not careless: inside-out (his "everything reused from the inside out, then build only when necessary")
#     survives as COST, not sequence. All free sources are asked at once. The need items no piece covers are the residue; only
#     the residue is asked of a 'model' source (the agent's own tools), and only what is still uncovered becomes a build. "Build
#     only when necessary" is then a fact the stream can show: the build is asked exactly the residue.
#   - Sources are async (routes, through lib/nexus-client.js); SISO's core loop is synchronous. A source gate starts its call and
#     emits its pieces into the stream when they arrive (the Runner pattern, the JAA StateGate shape); the stream's sampleHere()
#     is the cross-section the gate record (GM1) and the panel (GM7) read — the flow is ongoing, the answer is a look at it.
#   - The StreamLog observes every ask and every piece; it is the record GM1 points at (refs and hashes, not the text).
#   files: lib/context-stream.js (the request gate, the fan-out, the residue — on siso/index.js), lib/context-sources.js (the
#   table). lib/context-atlas.js and lib/vector-memory.js become sources by row, not by a rung in code.
#   proof: a fixture stream with three fake sources answering out of order (and one registered source absent) gives the same
#   covered set every time, lists the absent one as residue, and asks the 'model' source only the uncovered need items; a fourth
#   source added by one table row is asked without a line of the finder changed.
#
# The build order, non-linear (supersedes the one-line build_order; the first one kept): pieces in any order, held back only by a
# real depends_on. GM5 no longer waits on GM3 or GM4 — they are sources that plug in when they exist, so GM5's depends_on is []
# (kept as depends_on_first_design). Free now: GM4, GM5. GM1 waits on GM0a (his); GM3 on GM1; GM7 on GM1 and GM5; GM2 on GM1;
# GM6 on GM3 and FMR10; GM8 on GM5 and GM7.
# Decided by his axioms, not asked: siso/ (not Clear Glass's copy) is the stream, because siso/ is the shared primitive and
# clear-glass/siso is Clear Glass's own (lib requiring it would be a crossing, test-system-boundary SB-06); siso/ is ESM, so
# lib/context-stream.js loads it with import() — reuse over a third copy (§8.6, §0.3).
# To confirm with him: that "non linear" means the source order and the build order, and "agnostic" means sources by table.
# If he meant something else (agnostic to the model, or to the repo), this addendum is the coder's reading, and is kept.
# Graphs run after this addendum (lib/phase-graph.js, files as named, 0.60.154): GM1 f401e7c1 · GM2 f34e9e78 · GM3 8ba6f400 ·
# GM4 1482ea96 · GM5 52e0d272 (lib only) · GM6 62ad7956 · GM7 e00e370b · GM8 af6848ec — every phase ready, no new crossing.
# GM5's sources stay agnostic by route: a row names a route, never a require of another system's file.
