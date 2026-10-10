spec:
  meta:
    name:     idearium-solid
    version:  1.0.0
    date:     2026-10-10
    release:  0.55.2 (base)
    uuid:     nexus-idearium-solid-phasemap-v1-0000-2026-1010-jamesbrooks-001
    owner:    idearium · guardian (agents, accounts) · copilot (the door)
    status:   "MAPPED 2026-10-10, before building; James 2026-10-10: \"yes\" to SD0 → SD2 → SD3 → SD1 → SD6; SD10 added from his answer to SD7; SD0–SD3 done (0.56.0)"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §1.1 nothing pretends, §1.2 nothing silently fails, §0.3 nothing lost, §3.3 map before build
    origin: >
      James, 2026-10-10, after 0.55.2: "overwhelmed. badly. feeling no progress and worrying about ideas getting lost.
      maybe we get idearium solid then start finally using nexus to build nexus, map new phases from the cli like you do."
      · "dont just agree with me. i need feedback, and always read maps and get context first." · "want to get this
      working fully. its been a long time." · "like when i come to you with an idea i want to be able to log it, ask
      about it, and expand it."
    read_first: >
      docs/the-path.md (53 phases, steps 0–3), docs/2026-10-09-hardening-pass-phasemap.spec (HP1–HP22 done),
      docs/2026-10-09-one-model-engine-phasemap.spec (ME0–ME15, open). Most of what he asked for on 2026-10-10 is
      already on the path: the void as a back-and-forth feeding the workshop (WK4), the repo's main chat (RC1), NEXUS
      changed from inside NEXUS (SB3, SB5), each block chunked (SB11). Those stay where they are; this map holds only
      what was new, and the one thing the path lacked — a definition of done.
  solid_means:
    pushback: >
      "Solid" with no finish line never ends — every fix finds the next thing, and that is the "no progress" feeling.
      Solid is this list, each item proven by tests/sim/fake-tab.js against the running stack (no browser needed) and
      once by James in Clear Glass. When every line holds, Idearium is solid and NEXUS builds NEXUS through it.
    checks:
      - "an idea typed into Idearium is kept, and can be asked about and expanded (SD6)"
      - "a repo agent answers through any one agent with a tab, and when that agent fails, the failure names the agent, the gate and the fix in under 2 minutes (0.55.2 — held)"
      - "a failed agent hands the job to the next one, pinned or not, without typing the prompt twice (ME5 + SD4)"
      - "a phase build writes files, versioned, or says exactly why it could not (SD0)"
      - "a version can be seen and rewound from the repo's own card (SD1)"
      - "a background build never makes the person's own message wait (0.55.2 HP20 — held; SD3 for priority)"
  phases:
    SD0_versionium_down_is_said_and_restarted:
      layer: backend
      systems: [core, versionium]
      status: "DONE (0.56.0) — found: versionium/lib/http-utils.js readRawBody destroyed the socket over its size limit, so the 413 never arrived and the sender read exactly \"read ECONNRESET\" (reproduced on 0.55.2; a clean 413 now). idearium/repo/snapshot.js _againWhileDown: limits/plan/stage tried again while versionium comes back (2·4·8·16·30 s), the refusal says how long it waited and what to start; commit and record are never repeated. Autopilot already restarts versionium with backoff. Whether his 12:46 reset was this or a crash is not known from here. test-idearium-solid SO-01..04."
      james: '"12:46:45 refused — no snapshot: the file layer was not available before commit — no snapshot was made: [nexus-client] versionium unreachable at 127.0.0.1:3754 — read ECONNRESET"'
      depends_on: []
      files: [nexus/autopilot.js, versionium/server.js, lib/repo-layer.js]
      does: >-
        Every repo write is refused when versionium (:3754) is down — correct (no unversioned write), but on his machine
        it reset mid-build and every write after it failed the same way. Check first: autopilot starts versionium as
        optional; whether it restarts it after a crash, and why it reset (its log at that minute). Then: a crashed
        versionium is restarted by its supervisor, the refusal says "versionium is down — restarting it (n of 3)", and
        the write is retried once it answers, not lost.
      proof: "kill versionium mid-build: the build pauses, versionium comes back, the write lands with its snapshot"
    SD1_rewind_and_versions_on_the_repo_card:
      layer: ui
      systems: [idearium]
      status: "DONE (0.56.0) — idearium/ui/js/repo-card-time.js: ⟲ versions on the repo's box in the Repos grid (and its row in the open repo's list) — the last three versions with ↶ (the real restore preview, inside the box), the desktop's pause/resume/checkpoint and its last checkpoints with ↶ rewind, all versions →; previewRepoRestore and rtRewind take a repo id. Clear Glass: tests/probe/idearium-one-surface-glass.js 21/21, real API and versionium."
      james: '"can you add the rewind engine controls and versioning to the repos box you click on to open it."'
      depends_on: []
      files: [idearium/ui/js/app.js, idearium/ui/js/repo-drawer-views.js, idearium/ui/js/repo-tasks.js]
      does: >-
        The backend exists: GET /api/repos/:uuid/snapshots (versions, VR1), /desktop/checkpoints and /desktop/rewind
        (CK1). Their screens are inside the Plan panel's activity section (versions · control). The repo's card in the
        Repos list gets them where he clicks: the last commits with ↶ restore, the checkpoints with ↶ rewind, and the
        desktop's pause/resume — the same functions repo-drawer-views.js and repo-tasks.js already call, not copies.
      pushback: >-
        The card is small: three lines (last version, last checkpoint, one ↶) with "all versions" opening the full
        view, or it becomes a second Plan panel.
      proof: "from the Repos list, one click rewinds a repo to its last checkpoint and shows the commit it came back to"
    SD2_copilot_never_answers_ok_with_nothing:
      layer: backend
      systems: [copilot, orchestrator]
      status: "DONE (0.56.0) — copilot/server.js _noAnswer: both /api/prompt lifeline handlers answer ok:false with lifeline's own reason when there is no text (live: 'Both Ollama and Guardian are unavailable. Check system health.'); the overview says it. SO-05."
      james: '"[unstructured response — keys: ok, requestId, sessionId, text, modelUsed, intent, channel, contextLayers, fromStream] via none" (his screenshot, the overview co-pilot)'
      depends_on: []
      files: [copilot/server.js, copilot/lifeline.js, ui/tv-shell/index.html]
      does: >-
        Copilot's /api/prompt returned ok:true with empty text and modelUsed 'none' — nothing answered and it called it
        success. 0.55.2 made the overview say so plainly; the fix is upstream: an answer with no text and no model is
        ok:false with the reason (which backends were tried, why each failed).
      proof: "with Ollama down and no tab, /api/prompt says ok:false and lists what it tried"
    SD3_the_person_goes_first:
      layer: guardian
      systems: [guardian]
      status: "DONE (0.56.0) — guardian/ask.js marks its job high (the autonomous loop passes normal); dispatcher: a background job steps back while the economy holds a high one for the same agent; the reconnect flush sends high first; the pool already sorted. SO-06, SO-07."
      james: '"i need to get this working and feel see the progress."'
      depends_on: []
      files: [guardian/ask.js, guardian/lib/jobs.js, guardian/lib/dispatch-pool.js]
      does: >-
        The stack run found background chunk builds and the person's own message sharing one tab and one gap clock.
        The pool already sorts by priority; nothing sets it. A job with a person waiting (askSync from a repo chat)
        is priority high; the build queue's are normal.
      proof: "with six chunk jobs queued for chatgpt, a repo chat message is sent next"
    SD4_agents_live_in_guardian:
      layer: guardian
      systems: [guardian, core]
      status: "OPEN"
      james: '"what about .hat files. and .agent files in guardian for each model?" · "like i want to make sure we arent using idearium for anything guardian should be doing."'
      depends_on: []
      files: [guardian/lib/agent-model-nodes.js, guardian/lib/selector-map.js, lib/account-registry.js, lib/economy/policy.js, lib/node-schemas/schema.agent]
      does: >-
        Found: a model's self is in four places — its provider node (guardian/data/nodes/provider), its selectors
        (selector-map.js), its behaviour (.agent_model hypotheses), its limits (economy policy) — and its accounts in a
        fifth (lib/account-registry.js). .agent nodes exist only per repo compartment (lib/repo-agent-node.js); hats
        are real (lib/hat-forge.js, a hat per repo, six seeded). One .agent per model in guardian joins them by
        reference (not copies): what it is, its accounts, its selectors, its limits, its health, what it has learned.
        Guardian is already called the source of truth for agents (dispatch-ladder.js); this makes it so on disk.
      proof: "guardian/data/nodes/agent/chatgpt.agent names its accounts, selector map, limits and health; GET /agents serves them"
    SD5_account_fallback:
      layer: guardian
      systems: [core, guardian]
      status: "OPEN"
      james: '"like need account fallback for fallback routing and token limits." · "the economy as meant to measure the constraints of each agent to optimize and learn."'
      depends_on: [SD4_agents_live_in_guardian]
      files: [lib/economy/ledger.js, lib/economy/gate.js, guardian/lib/economy-guard.js, lib/account-registry.js, guardian/lib/dispatch-ladder.js]
      does: >-
        The economy counts per provider; the accounts registry holds several accounts per provider; nothing joins them.
        Usage is recorded per account; at an account's cap the job moves to the provider's next account (said), and
        only when every account is held does it fall to the next agent (HP21 already says the hold). Limits per account
        are learned from where a provider actually stopped (lib/economy/tokens.js already learns per provider).
      pushback: >-
        Switching accounts needs a tab signed in to each one — Clear Glass sessions per account (CookieVault). Check
        what is real there before promising it.
      proof: "chatgpt account A at 30/30 → the job goes to account B's tab; both at cap → the next agent, said"
    SD6_an_idea_logged_asked_expanded:
      layer: backend
      systems: [idearium]
      status: "OPEN"
      james: '"like when i come to you with an idea i want to be able to log it, ask about it, and expand it." · "i need to be able to pump ideas into idearium."'
      depends_on: []
      files: [idearium/lib/void.js, idearium/cli/route-commands.js]
      does: >-
        Found 2026-10-09: the void's echoes are one-shot — each sees the idea text, never the echoes before it or his
        replies; it is not a conversation. One thread per idea: log (kept as he typed it), ask (an agent answers with
        the thread so far and the repo/library context), expand (the agent proposes; he keeps or drops each part). Every
        turn is kept. A command for each (idearium idea log|ask|expand), so it works from the CLI and the MCP tool as
        from the page. This is WK4's first half; WK4 stays for carrying the thread into the workshop.
      proof: "log an idea, ask twice, expand once: the second answer quotes the first, all four turns are on disk"
    SD7_blocks_that_generate_themselves:
      layer: backend
      systems: [core, idearium]
      status: "OPEN"
      after: SD12_a_spec_starts_from_its_primitives   # 2026-10-10 — generation follows the primitives' DAG
      james: '"the specs in the spec workshop maybe have like dynamic calltos or something like; [file tree] or something that uses the agents. like need to be able to generate file list. like i want to be able to use the agents to generate the rest of the spec from just the idea or void. but it needs a dag i feel like."'
      depends_on: [SD6_an_idea_logged_asked_expanded]
      files: [lib/spec-document.js, idearium/spec-engine/index.js]
      does: >-
        He is right that it needs a DAG, and most of it exists: spec blocks already carry depends_on and staleness
        spreads along it (HP1 staleVia). Missing: a block that says how it is made — a callto ({file_tree}, {agent:
        <prompt>}, {from: <block>}) — and a run that fills the empty blocks in dependency order from the idea or the
        void thread, each through the copilot route, each kept as a proposal he accepts. {file_tree} first: it is
        deterministic once the components block exists.
      pushback: >-
        Generating a whole spec from one line will produce confident filler; each generated block should cite which
        earlier block or thread turn it came from, and an empty input gives an empty block, not an invented one.
      answered: >-
        James, 2026-10-10: "for the confident, filler, maybe use confidence score and adversarial. like maybe the
        adversarial is a gate for each output." Taken: every generated block passes SD10's gate before it is offered —
        an adversary (a different agent from the one that wrote it) attacks it, a confidence score comes back with the
        attacks, and below the bar the block is not offered as done: it is offered with the attacks beside it, or
        regenerated once with them as the brief.
      depends_on_gate: SD10_the_adversarial_gate
      proof: "an idea with a components block → {file_tree} fills; the empty blocks after it fill in dependency order, each citing its source and carrying its gate verdict"
    SD8_an_agent_can_see_and_fix_a_tab:
      layer: backend
      systems: [clear-glass, core]
      status: "OPEN"
      james: '"especially with clearglass, like i want it to feel that way. especially for instance, with you, you could take a screenshot, then use the interaction field to fix the agents if they go down, or debug"'
      depends_on: []
      files: [clear-glass/src/driver/glass.js, lib/agent-tools/index.js]
      does: >-
        Clear Glass's driver (glass.js) can screenshot, read and click a page; the ◎ picker saves selectors. As agent
        tools (glass.screenshot, glass.inspect, glass.click, glass.pick) scoped to provider tabs, an agent — or Claude
        Code through the nexus MCP tool — can look at a stuck tab and repair it: re-pick the reply element, reload,
        sign back in. Check first which of these glass.js already exposes over its CLI.
      proof: "a tab whose reply selector drifted is re-picked by an agent from a screenshot, and the next job reads its reply"
    SD9_claude_code_inside_idearium:
      layer: backend
      systems: [core]
      status: "OPEN"
      james: '"we need to get you inside idearium then you could be coding and testing in the real system."'
      depends_on: []
      files: [lib/claude-code-backend.js, lib/repo-agent.js]
      does: >-
        Half real already: Claude Code is a backend (IN2a, headless in a copy of the repo, its changes through the repo
        layer) and the nexus MCP server gives it nexus.command. Missing: picking it as a repo's agent from the page
        with the same tools and the same Plan, and its runs on the same gate trail. Check first what the Settings →
        provider list offers for claude-code today.
      proof: "a repo set to claude-code builds a phase from the Plan; its changes land versioned; its run shows like any agent's"
    SD10_the_adversarial_gate:
      layer: library
      systems: [core, copilot]
      status: "OPEN"
      james: '"for the confident, filler, maybe use confidence score and adversarial. like maybe the adversarial is a gate for each output. yes. this needs to be coding like you do. nexus is supposed to be nonlinear and domain agnostic. like with guardian, we can make ai assistance."'
      depends_on: []
      files: [lib/draft-review.js, lib/compartment-engine.js, copilot/lifeline.js, lib/pipeline-routing.js]
      does: >-
        One gate any output can pass through — a spec block, a phase, a file, an answer — in any domain, because what it
        checks comes from the output's own stated purpose and sources, not from a code-only rule. An adversary (through
        the copilot route, preferring a different agent from the author, as draft-review already pairs a drafter with a
        reviewer) is asked to break it: unsupported claims, contradictions with its sources, filler, missing parts. It
        returns attacks and a confidence (0–1, with the reasons). The gate passes, flags (offered with the attacks
        beside it) or sends it back once with the attacks as the brief. Every verdict is kept with the output, and the
        verdicts teach the learned order (a 'dismissed'-style signal, HP4 weights) — so which agent writes which kind of
        output well is learned, not assumed.
      reuse: >-
        lib/draft-review.js (author ≠ reviewer, one plain hand-off), lib/compartment-engine.js's adversary-suite slot
        (named, never built — this fills it), copilot/lifeline.js _estimateConfidence (a text heuristic, kept only as a
        floor when no adversary answers), pipeline-routing verdicts (CT2). Not a fifth router: the adversary is reached
        through the same copilot route as any call.
      pushback: >-
        An adversary costs a second model call per output — on a 30-block spec that is 30 more calls through the
        economy. The gate needs a mode: always for generated spec blocks and phase builds, sampled or off for chat.
        And a confidence number from a model is a claim too; it is stored with its reasons, never shown bare.
      proof: "a block of filler (claims with no source) is flagged with its attacks and a low score; a grounded block passes; the verdicts appear in the learned order"
    SD11_the_desktop_inside_idearium:
      layer: ui
      systems: [idearium, cos]
      status: "OPEN"
      james: '"tell me about the cos desktop envirement ui. like can we have in like the ui?"'
      depends_on: []
      files: [idearium/ui/desktop.html, idearium/ui/js/repo-settings.js, idearium/ui/js/app.js, cos/workspace/index.js]
      does: >-
        Today: a repo's compartment is a QEMU VM (an xfce desktop) branched from its original (a qcow2 overlay and a git
        worktree); QEMU serves its screen as VNC over a websocket on 127.0.0.1:5700+N; idearium/ui/desktop.html draws it
        with noVNC, opened as a separate pop-up window from Settings → Desktop. noVNC's RFB attaches to any element, so
        the same screen is drawn inside Idearium as a pane (beside the Code tab, or full) — natively, no iframe (his
        "the idearium settings still have iframes") — with the box's pause / resume / checkpoint / rewind beside it.
        noVNC is vendored (it loads from jsDelivr today, which fails offline and in Clear Glass without network).
      pushback: >-
        One VM per repo is memory — the pane shows the desktop only while it is open, and says the VM's cost. Not
        verifiable in the cloud container (no VM image); proven on his machine in Clear Glass, and with a stubbed VNC
        stream in the probe.
      proof: "a repo's desktop opens in a pane in Idearium, keyboard and mouse work, rewind from beside it"
    SD12_a_spec_starts_from_its_primitives:
      layer: backend
      systems: [idearium, core]
      status: "OPEN"
      james: '"like i feel idearium, when speccing, needs top start with the idea, map the primitives or invariants or principles, then the dependancies are built from there, structure or of the data, schemas for the determinist primitives for each data or resuable aspect to keep consistency"'
      depends_on: [SD6_an_idea_logged_asked_expanded]
      files: [idearium/spec-engine/index.js, lib/spec-document.js]
      does: >-
        Found: the spec's blocks already run close to his order — meta → purpose → axioms → schema → api → events →
        integration → failure_modes → build_order → tests → registry — but as a list. Only one dependency is declared
        (registry ← build_order), so nothing below is built FROM what is above it. Two changes: a primitives block after
        purpose (the nouns and reusable pieces of the idea, each with its invariants — what is always true of it), with
        axioms as the principles over them; and every later block declares what it is built from (schema ← primitives +
        axioms; api, events ← schema; integration ← api + events; failure_modes ← axioms + integration; build_order ←
        everything; tests ← axioms + schema + api). Each primitive gets a schema (its fields and invariants, deterministic),
        and later blocks refer to the primitive by name rather than restating it — that is what keeps them consistent.
        The DAG then drives the rest: staleness already spreads along depends_on (HP1), generation (SD7) fills in its
        order, and the gate (SD10) checks each block against the blocks it says it came from.
      pushback: >-
        Domain-agnostic means "schema" cannot assume a database: for a song it is its sections and keys, for a game its
        entities and rules. The primitives block names the kind of each primitive (data, rule, process, interface) and the
        schema block's shape follows the kind — not a fixed table form.
      proof: "a spec from one idea: primitives named with invariants; schema built from them; changing a primitive marks schema, api and tests stale; nothing below restates a primitive"
      revised: >-
        James, 2026-10-10: "trying to make the spec blocks as dumb as possible. what are primitives in the sense of
        components? … maybe each primitive is listed then everything in relation to? like maybe blocks are primitives?"
        Proposed (his to decide): a spec is two lists — nodes {id, kind, name, invariants, body} and relations {from,
        verb, to} with a small fixed set of verbs (contains, uses, produces, constrains, exposes). Kinds: thing (data),
        rule (an invariant or principle), action (a process), boundary (an interface or surface), module (a group —
        "contains" is the nesting doll, DS6). The familiar sections become views computed from the graph — schema = the
        things and their fields, api/events = the boundaries and actions, tests = the rules turned into checks,
        build_order = the graph sorted — so a block is as dumb as possible: one shape, no section knows another. Purpose
        stays prose; the views are what a person reads.
      revised_2: >-
        James, 2026-10-10: "what about using primitives as a boundary, relation meaning using rfr2." Taken: a relation says
        how it is known, as RFR2 causality already does for events (intelligence/rfr2/causality: causal/explicit,
        causal/rule, causal/adapter, observational — declared when written, never inferred after). For a spec: stated (he or
        the agent wrote it), rule (derived deterministically, e.g. schema from a thing's fields), proposed (an agent's
        suggestion, not yet accepted) and observed (a similarity, shown, never built from). Only stated and rule relations
        drive generation, staleness and the build order; the causal ones form a DAG — a cycle is rejected with both ends
        named, as RFR2 rejects a diamond. A primitive is a boundary: nothing inside it is reached except through its
        relations.
      revised_pushback: >-
        More than five or six verbs and the relations become noise; a view a person cannot read as a document is a
        regression from today. And existing specs (block form) are read as-is and converted on request, never in place.
    SD13_the_machine_is_cos:
      layer: backend
      systems: [cos, idearium]
      status: "OPEN"
      james: '"also the vm, i have no control over, also the remote desktop, what about integrating it into cos?"'
      depends_on: []
      files: [cos/workspace/index.js, cos/workspace/vm-control.js, cos/testenv/provision.js, cos/cli/commands/vm.js, idearium/ui/desktop.html, idearium/api/index.js]
      does: >-
        Found: the machine is COS's code (qemu-runtime, workspace, vm-control, provision) but its controls are scattered —
        start/stop and checkpoints are Idearium routes, the viewer is an Idearium page, the base image is a separate
        script (node cos/testenv/provision.js --with desktop) nothing in the UI runs, so "Start VM" on a machine with no
        desktop image cannot work and says so only in the window. COS gets one machine surface — commands first
        (cos vm setup|start|stop|status|pause|resume|checkpoint|rewind|screen), each a COS route, each in the one command
        table — and one viewer that is COS's (moved from idearium/ui/desktop.html, archived there), which Idearium and
        Clear Glass embed (SD11). Setup is a step in that surface: does this machine have QEMU, does it have the desktop
        image, build it now (with progress), then start. Status says what is missing, in order, with the button that
        fixes it.
      pushback: >-
        COS has no process of its own (lib/nexus-self/systems.js: "no process — like components"); its routes are served
        by whoever hosts it (Idearium today, through lib/cos-bridge). Either COS gets a small server of its own (a port,
        autopilot supervision) or it stays hosted and only the ownership moves. Recommended: hosted for now — a process is
        one more thing to keep alive — and the commands make the host irrelevant to the person.
      proof: "on a machine with QEMU and no image: status says 'no desktop image' with Build it; building shows progress; Start VM boots it; the viewer and every control are COS's, opened from Idearium"
    SD14_chunks_cut_at_primitives:
      layer: library
      systems: [core, idearium]
      status: "OPEN"
      james: '"could also use it for the chunking."'
      depends_on: [SD12_a_spec_starts_from_its_primitives]
      files: [lib/chunker/index.js, idearium/spec-engine/index.js, idearium/spec-engine/chunk-dispatch.js]
      does: >-
        Found: lib/chunker cuts a document at its text structure (headings — "natural boundary"), and a build chunk is a
        spec section. With a spec as primitives and relations, a build chunk is a primitive (or a module of them) plus
        exactly the primitives its stated relations reach — its boundary is the primitive's, so a chunk carries what it
        needs and nothing else, sized to the model by how many relations it pulls in. "Chunked again" (SB11/SB13) is the
        same cut one level down: a module's primitives.
      pushback: >-
        A primitive with many relations pulls in a lot; the cut stops at the model's budget and names what it left out
        (as the context budget already does), never silently trims. Documents with no primitives (an old spec, a plain
        file) keep the text-structure cut.
      proof: "a spec with 12 primitives builds in chunks that each hold one primitive and only its related ones; a small model's chunk names what did not fit"
    SD15_no_website_can_drive_nexus:
      layer: backend
      systems: [guardian, idearium, copilot, cortex, versionium, core]
      status: "OPEN"
      james: '"find all useful tests, debugging, hostile attacking, red teaming, and qa, qc, and anything else for nexus"'
      depends_on: []
      files: [guardian/server.js, idearium/api/index.js, copilot/server.js, cortex/boot.js, versionium/server.js]
      does: >-
        Found 2026-10-10 and proven live: guardian answers Access-Control-Allow-Origin: * and parses a text/plain body as
        JSON, so a page on any website (a "simple" POST, no preflight) reached POST /api/copilot/prompt — with a tab
        connected it would send a prompt through his ChatGPT/Claude account and read the reply — and POST /cli/exec (200).
        Every localhost service: refuse a request whose Origin is not Nexus's own (its UIs, Clear Glass, the userscripts'
        provider hosts), writes require application/json (a preflight), no '*', /cli/exec behind a local token. One shared
        helper, not five copies. Idearium and the rest checked the same way (Idearium sends no CORS header, so a page
        cannot read it, but may still make it act).
      proof: "a POST from Origin https://evil.example to each service is refused with 403; the UIs, Clear Glass and the userscripts still work"
  not_here:
    - "a pinned agent's next rung — ME5 (one chooser), the one-model-engine map"
    - "the void feeding the workshop — WK4 (path step 2), after SD6"
    - "NEXUS changing NEXUS from inside — SB3/SB5 (path steps 2–3), after the checks above hold"
