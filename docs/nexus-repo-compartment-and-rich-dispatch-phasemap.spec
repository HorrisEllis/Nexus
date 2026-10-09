spec:
  meta:
    name:        nexus-repo-compartment-and-rich-dispatch
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:     0.1.0-phasemap
    status: >-
      PHASEMAP 2026-09-22. James: "it would be great to be able
      to manage, expand, do what i am doing right now, but using
      the agent cli to use clearglass to route a job to this
      chat and use you to expand from within nexus" / "we need
      to make compartments in idearium for nexus, and add
      support for nested compartments, like increments of zoom."
    uuid:        nexus-repo-compartment-rich-dispatch-v0-0000-2026-0922-001

  diagnosis_verified_2026_09_22:
    claude_as_provider_already_real:
      status: >-
        NOT a gap. guardian/userscript-claude.js (v10.1.0) is a real,
        already-working NCP provider — "route a job to Claude via a
        browser tab" is the existing RAID/NCP path, not new integration.
        Named here so this phasemap doesn't re-plan something that
        already exists.

    one_prompt_one_chunk_assumption:
      symptom: >-
        "using you to expand from within nexus" implies a conversation
        that produces multiple files, decisions, and sometimes a zip —
        not one chunk's content.
      root_cause: >-
        lib/repo-agent.js's dispatch() (traced directly this session)
        sends one prompt, gets one rawText back, and idearium's own
        completeChunk()/writeFile() materializes that text at exactly
        one chunk's realPath. There is no real path from "one rich
        multi-file response" to "several chunks, each at its own
        realPath, all updated from one exchange." Every existing NCP
        consumer (repo-agent, guardian's own chunk dispatch) assumes a
        1:1 prompt-to-artifact shape. This is a real, unaddressed gap,
        not solved by tab-per-repo (TR1, see the sibling phasemap) —
        TR1 fixes WHICH tab a repo's prompt reaches, not what happens to
        a response that names more than one file.
      distinct_from_tab_per_repo: >-
        TR1 (clear-glass-tab-per-repo-and-ui-expansion-phasemap.spec)
        is dispatch ROUTING. This is response SHAPE. A repo could have
        a perfectly isolated dedicated tab and still have no way to
        turn "here are three files and a decision" into three real
        chunk writes plus a real gaps/version_history entry.

    nested_compartments_zoom:
      symptom: >-
        "compartments in idearium for nexus... nested compartments,
        like increments of zoom."
      root_cause: >-
        idearium's real repo/project shape (idearium/repo/index.js,
        idearium/data/projects/<repo-id>/) is FLAT — one project, one
        chunk manifest, one atlas.json. No real nesting concept (a
        project containing sub-projects, a system containing its own
        modules as their own addressable compartments) was found this
        session. This directly parallels architecture-spec's own
        NodeBundle (reference-only grouping, checked this session) and
        the "database file as a node, zoom levels" discussion from
        earlier — the same real gap, in idearium's actual repo model
        instead of the abstract node model.
      bootstrapping_question: >-
        Making "NEXUS" itself a compartment idearium manages, when
        idearium itself lives inside NEXUS, is self-referential in a
        way worth naming rather than quietly working around. Not
        resolved this pass — flagged for NC1 below to decide explicitly
        rather than let the phase silently assume an answer.

  governing_principles:
    - "reuse before build — claude-as-NCP-provider, sessionIdFor, and lib/repo-agent's whole compartment model already exist; RD1/RD2 extend them, they do not replace the dispatch path."
    - "one implementation, not two — a rich-response materializer is a generalization of completeChunk()/writeFile(), not a parallel write path."
    - "phases are queryable data, not prose to re-read — every phase below gets a real phase node (architecture-spec's phases.js, built this session) so summarize()/oneLine() can answer 'what's the state of this' without re-reading this file."
    - "gaps are addressed, not assumed — NC1's bootstrapping question is named explicitly rather than resolved by silent assumption."

  phases:

    RD1_multi_file_response_parser:
      does: >-
        A real parser that takes one NCP response and extracts N
        (path, content) pairs from it — the shape a conversation like
        this session's own output already has informally (files
        presented with clear paths). Does not invent a new response
        format; defines how an existing rich-text response gets split
        into real, addressable pieces.
      reuse: "idearium's own chunk realPath convention — each extracted piece becomes a real chunk write, not a new artifact type."
      gate: "a real multi-file response (3+ files, one exchange) produces 3+ correct completeChunk() calls, each at the right realPath, verified against a real fixture — not just parsed, actually written."
      drift: "ambiguous or malformed file boundaries in a response are a real, expected failure mode — RD1 must fail loudly per file, never guess a path."

    RD2_response_to_multiple_artifact_types:
      does: >-
        Beyond files: a rich response can also contain a decision (goes
        to gaps or version_history), a test result, or a phase status
        update (goes to phases.js, built this session). RD2 routes each
        recognized artifact type to its real destination instead of
        flattening everything into chunk content.
      reuse: "phases.js's summarize()/checkPhase(), architecture-spec.spec's own gaps/version_history shape."
      gate: "a response containing both a file and a stated decision produces both a real chunk write AND a real gaps entry, not one or the other."
      drift: "what counts as a 'decision' worth its own gaps entry vs. just prose is a real judgment call RD2 will get wrong sometimes — needs a human review step, not full automation, at least initially."

    NC1_compartment_bootstrapping_decision:
      does: >-
        Decide, explicitly, whether NEXUS-as-a-compartment is idearium
        managing its own parent repo (real, self-referential, needs its
        own safety story) or a separate, mirrored index that idearium
        tracks without literally owning NEXUS's working directory. This
        phase produces a decision, not code — NC2 depends on it.
      reuse: "none — this is a real, undecided design question, not a place to reuse an existing pattern."
      gate: "a written answer exists to 'what does idearium do if a NEXUS-compartment operation would modify the very files idearium's own process is running from.'"
      drift: "deferring this indefinitely is itself a choice with real cost — every phase after this one is blocked without it."

    NC2_nested_compartment_support:
      does: >-
        Extend idearium's repo/project model to support a compartment
        containing sub-compartments — NEXUS containing loom, guardian,
        etc., each independently addressable, matching the "increments
        of zoom" framing already used for architecture-spec's own
        NodeBundle concept.
      reuse: "architecture-spec's NodeBundle (reference-only, never a merge — the same rule applies here: a parent compartment indexes its children, it does not absorb them)."
      gate: "a query for 'NEXUS' compartment lists its child compartments (loom, guardian, ...) without duplicating their own chunk manifests — one source of truth per system, referenced, not copied."
      drift: "how deep nesting is allowed to go (compartment of compartment of compartment) is not decided here — starting with one real level (NEXUS -> systems) before asking whether systems need their own sub-compartments."

    AG1_agent_nodes_sorted_by_provider:
      does: >-
        `.agent` is already a real, proven node kind (guardian/schemas/
        schema.agent, real writer lib/repo-agent-node.js's materialise(),
        already watched via guardian/lib/node-registry.js's existing
        `agent` type folder). This phase reorganizes data/nodes/agent/
        into per-provider subfolders (agent/claude/, agent/chatgpt/,
        etc.) so an agent is addressable by provider without a separate
        index — a refinement of something real, not new invention.
      reuse: "the .agent schema and its real writer, unchanged. guardian/lib/node-registry.js's existing watch mechanism, pointed at subfolders instead of one flat folder."
      gate: "an agent node's provider is derivable from its path alone (agent/<provider>/<id>.json), not just its content — makes a provider-scoped query a directory listing, not a filter."
      drift: "schema.agent's own note says binding to a repo's .intent node and .command nodes 'is not built' — this phase doesn't fix that, it only reorganizes storage."

    RS1_repo_settings_sections:
      does: >-
        The repo settings tab gains real sections: repo config,
        agents (list/assign, once AG1 exists), CI/CD, delete, export.
        Each section is its own file per UI1's own "one file per UI
        area" principle above, not new prose added to an existing
        monolith.
      reuse: "UI1's own extraction pattern (ui/library's real split), applied to idearium's settings tab instead of clear-glass's."
      gate: "each settings section is independently loadable/testable, matching UI1's own gate."
      drift: "which sections ship first (config vs agents vs CI/CD vs delete/export) is a real product-priority call, not decided here."

    GC1_global_component_reuse_store:
      does: >-
        A store of components already built from agent-generated
        artifacts, checked BEFORE generating a new one for a similar
        need — grounded directly in AXIOMS v3.1 §17.10 (a cheap
        reuse-candidate path may skip generation, but never skips
        verification; promotion requires demonstrated fitness
        repeatedly, not once — WARP's own real cache-promotion rule,
        not a new policy invented here). Concrete example already real:
        clear-glass's download-listener components (cg.downloads.*,
        addressed in clear-glass-atlas.md) are themselves a reusable
        "listener" pattern already routable to any system — this phase
        is about making that kind of reuse discoverable and checked
        against, system-wide, not rebuilding it as something new.
      reuse: "§17.10's own promotion rule directly, not a new cache policy. architecture-spec's own NodeBundle for how a reusable component gets referenced without being copied."
      gate: "generating a new component first checks the global store for a fuzzy-match candidate; a match is only promoted to reuse after passing real verification, never on the strength of the match alone (§17.10's own hard requirement)."
      drift: >-
        the repo id or hat id needs to travel with the job for this to
        route correctly (James's own framing) — this is additive to
        TR1's own agentId plumbing, not a separate mechanism: the same
        field this pass already threaded through 6 real files could
        carry a component-reuse lookup key too, once GC1 is scoped in
        full.

  ordering: >-
    RD1 before RD2 (parse before route). NC1 before NC2 (decide before
    build). AG1 has no hard dependency on the RD/NC tracks — it can
    proceed independently. RS1 depends on AG1 only for its "agents"
    section specifically; its other sections don't. GC1 depends on
    nothing above structurally, but is most useful once AG1 exists
    (an agent-attributed component is easier to verify provenance for,
    per §17.5 — every output has provenance).

  honest_risks:
    - "RD1/RD2 are the least-precedented phases in this whole thread — nothing in the real codebase does this today, unlike TR1 which is a real, located gap in existing machinery."
    - "NC1's answer could make NC2 much larger or much smaller than currently scoped — this phasemap does not guess which."

# ## ADDENDUM 2026-10-07 (0.39.372) — NC1 answered, NC2 built (docs/2026-10-07-compartment-control-and-activity-phasemap.spec)
# James: "Do you think we should have each repo a control panel for the system, and compartment for the nexus repos?"
# NC1 — the written answer its gate asks for: Idearium never modifies the files the running Nexus is made of except
# through the approval gate that already exists (lib/nexus-self/inject-gate.js): every agent's change to a Nexus repo —
# a reply's block or a coding agent's diff (0.39.367 land()) — is a proposal, applied to the live tree only on approval.
# A Nexus system's desktop (COS) runs a copy, where agents build and run freely.
# NC2 — the nesting already existed (idearium/repo/nexus-self.js: the Nexus compartment, one child per system, each
# system repo linked by compartmentId). Built on it: a system repo is a control panel (its processes through the
# supervisor, nexus/autopilot.js /control/:name/:op — never through the system itself), and its charter IS its
# compartment's intent (set through COS's SetIntentGate; read with Nexus's inherited conditions and axioms).
# Proof: tests/modules/test-system-control.test.js 7/7.
