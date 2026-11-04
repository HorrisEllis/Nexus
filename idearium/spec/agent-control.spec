spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # idearium/spec/agent-control.spec — a full control panel for each repo's agents (their intents and everything they touch), each phase's
  # own target folder, his choice of agent for the Spatial Void and the Spec Workshop, the Void built on his Innovation Toolkit, and skip
  # buttons that fill a step's defaults. Format: emerge's module spec (kg-builder, specDepth 1.0, no BLACK).
  # Phases: docs/2026-10-31-agent-control-phasemap.spec. Ideas+Notes as one and the Code tab are docs/2026-10-19-idearium-control-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        agent-control
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-31T00:00:00Z
    status:      specced
    uuid:        nexus-idearium-agent-control-spec-v1-0000-2026-1031-jamesbrooks-001
    origin: >-
      James, 2026-10-31: "can we have a full control panel for the agents intents, and everything they touch in idearium? in the repos specific
      setting." · "do it. also find the phases with the code tab. consolidating the ideas and notes tab, what if we put each phase is a
      pretermined folder/location of the target directory and also the idearium settings, so i can change the agemnts for the spacial void and
      spec workshop. like spacial void needs to be better, maybe use my framework. also its too back and fourth lke we are. I also want skip
      buttons which will autofill generic/default values in each step of the pipeline." The asks are his; the census, the cut and the reading
      of "my framework" as his Innovation Toolkit are the coder's (TO CONFIRM).
    purpose: >-
      Fewer round trips and more control. Per repo, one panel shows every agent's intents and everything each intent touched (files, routes,
      commands, systems, hand-offs, specs and phases), with controls (pause, stop, allow or deny a tool, path or system, approve before a
      write, roll an intent back). Each phase writes inside its own target folder. He picks the agent for the Spatial Void and the Spec
      Workshop. The Void's echoes follow his toolkit's methods. Every pipeline step has a skip button that fills its defaults.
    target_runtime: [node, browser]
    language_stack: [javascript, html]
    paradigm: [reuse-before-build, person-acts, nothing-silent, defaults-said]
    axioms: ["USER_AUTONOMY (his controls, his agents)", "§8.6 reuse before build", "§1.2 nothing fails silently", "REVERSIBILITY (an intent rolled back from its snapshot)", "§3.4 backend → route → command → UI", "§5.15 sovereignty"]
    deps: []

    census: >-
      Read 2026-10-31 on main 0.60.333. A repo's settings has an Agents group (Behaviour, Prompt, Hat & tools, Models; idearium/ui/js/repo-
      settings.js). Idearium already serves, per repo, the agent's tool events, history, feed, stream, gate, route, graph, debug, tool scope
      and late replies (repo.agent.* in idearium/api/index.js, over lib/repo-agent.js); lib/agent-confidence-gate.js gates every dispatch.
      Nothing groups them by intent or controls them. The Spatial Void (idearium/ui/void.html) and the Spec Workshop (workshop.html,
      idearium/lib/workshop.js) ask an agent through _agentAsk, which asks Copilot's router for kind page:void / page:workshop; no setting
      lets him pick the agent. The Workshop's pipeline is SAVE → PLAN → PHASES → BUILD (workshop.js STEPS); workshop.js templateSections gives
      a template's section defaults. His Innovation Toolkit is docs/innovation-toolkit.framework (methods, 2026-10-24) and
      docs/innovation-toolkit-main.md (2026-10-31). A phase names its files; nothing gives it a folder of its own.

    constraints:
      - id: AC-001
        description: "A control is a person's act (or a rule he set) and is recorded with who and why; an agent never changes its own controls."
        type: hard
        enforced_by: [GATE-AC-PERSON]
      - id: AC-002
        description: "A default filled by a skip is marked as a default everywhere it lands, so it is never mistaken for his choice."
        type: hard
        enforced_by: [GATE-AC-DEFAULT-SAID]
      - id: AC-003
        description: "A phase's write outside its target folder is refused and said, unless the phase names that file."
        type: hard
        enforced_by: [GATE-AC-TARGET]

  schemas:

    - id: AgentIntent
      name: AgentIntent
      description: "One thing an agent set out to do in a repo, with everything it touched."
      fields:
        id:          "string — the job or prompt id that started it"
        agent:       "string — provider and hat"
        asked:       "string — what it was asked"
        decided:     "string | null — its plan or first answer"
        confidence:  "number | null — the gate's"
        gate:        "{ proceed: bool, steps: [] } | null"
        touched:     "{ files: [{ path, read, wrote, diff? }], routes: [], commands: [], systems: [], handoffs: [], specs: [], phases: [] }"
        state:       "enum — running | paused | stopped | done | failed | rolled-back"
        snapshot:    "string | null — the version taken before its first write"
        startedAt:   "number"
      behavioral_contracts: ["built from the records that exist (tool events, history, gate), never a second log"]
      error_paths: ["an event with no intent id → grouped under 'unattributed', said"]

    - id: AgentControl
      name: AgentControl
      description: "A repo's controls over its agents."
      fields:
        paused:      "{ [agent|intentId]: { by, at } }"
        allow:       "{ tools: string[], paths: string[], systems: string[] }"
        deny:        "{ tools: string[], paths: string[], systems: string[] }"
        approveWrites: "bool — a write waits for his yes"
        by:          "string"
      behavioral_contracts: ["deny wins over allow", "every change recorded in Versionium (§17.12)"]
      error_paths: ["a malformed rule → refused, naming the field"]

    - id: StepDefaults
      name: StepDefaults
      description: "What a skip fills for one pipeline step."
      fields:
        step:        "string — void.sliders | workshop.sections | workshop.plan | workshop.phases | …"
        values:      "object — the step's fields"
        source:      "string — where each default comes from (the template, genesis, the repo's settings)"
        marked:      "bool — always true: the values carry default: true"
      behavioral_contracts: ["a default never overwrites what he typed"]
      error_paths: ["a step with no defaults → the skip button is absent, said in its tooltip"]

  interfaces:

    - id: IF-REPO-AGENT
      name: repo-agent
      path: lib/repo-agent.js
      description: "A repo's agent: its settings, prompt, routes, history, tool events, gate."
      exports: ["the repo.agent.* functions the API calls", "defaultProvider", "routeFor", "COPILOT_URL"]
      behavioral_contracts: ["one agent per repo, routed through Copilot"]
      error_paths: ["the provider down → said by the route"]

    - id: IF-CONFIDENCE-GATE
      name: confidence-gate
      path: lib/agent-confidence-gate.js
      description: "The gate on every dispatch: below 75% the agent gathers context first and asks last."
      exports: ["gate", "CONFIDENCE_THRESHOLD"]
      behavioral_contracts: ["every rung in steps[]"]
      error_paths: ["a rung that errors is recorded, not hidden"]

    - id: IF-WORKSHOP
      name: workshop
      path: idearium/lib/workshop.js
      description: "The Spec Workshop's model: sessions, sections, feeds, templates."
      exports: ["makeSession", "editSection", "templateSections", "feed", "setAsk"]
      behavioral_contracts: ["proposals, never section text, from the agent"]
      error_paths: ["the agent down → the feed says so"]

    - id: IF-IDEARIUM-API
      name: idearium-api
      path: idearium/api/index.js
      description: "Idearium's routes, including _agentAsk (Copilot's router per page kind) and repo.agent.*."
      exports: ["_agentAsk(prompt, { channel, kind })", "the repo.agent.* routes"]
      behavioral_contracts: ["the route learns from each hop's outcome"]
      error_paths: ["Copilot cannot route → the default provider, said"]

    - id: IF-TOOLKIT
      name: innovation-toolkit
      path: docs/innovation-toolkit.framework
      description: "His Innovation Toolkit: warmup, cross-domain synthesis, end-state first, constraint innovation, emergent synthesis, associative and domain-driven methods."
      exports: ["the methods, each with its steps"]
      behavioral_contracts: ["his words, read, never rewritten"]
      error_paths: ["a method that does not parse → listed by its heading only"]

    - id: IF-PHASE-FILES
      name: phase-files
      path: lib/phase-files.js
      description: "Reads a map's phases and their files."
      exports: ["phasesOf", "filesOfBody"]
      behavioral_contracts: ["read only"]
      error_paths: ["a phase with no files → []"]

  modules:

    - id: MOD-AC-INTENTS
      name: intents-and-what-they-touched
      uuid: nexus-idearium-agent-control-intents-v1-0000-2026-1031-001
      path: idearium/repo/agent-control.js
      phase: AC1_intents_and_what_they_touched
      description: "Groups a repo's agent records (tool events, history, gate verdicts, routes, late replies) by intent: what was asked and decided, the confidence, and everything touched, with the snapshot taken before the first write."
      deps: [{ name: repo-agent }, { name: confidence-gate }]
      schema_refs: [AgentIntent]
      exports: ["intents(repo, { since, agent }) → AgentIntent[]", "GET /api/repos/:uuid/agent/intents"]
      gate_pipeline: ["GATE-AC1-001: every event placed under an intent or 'unattributed'"]
      behavioral_contracts: ["read only over the existing records"]
      error_paths: ["a store unreadable → its part said, the rest shown"]
      acceptance: ["a fixture repo with two prompts and their tool events: two intents, each with its files read and written and its gate verdict"]

    - id: MOD-AC-CONTROLS
      name: agent-controls
      uuid: nexus-idearium-agent-control-controls-v1-0000-2026-1031-001
      path: idearium/repo/agent-controls.js
      phase: AC2_the_controls
      description: "Pause, resume or stop an agent or one intent; allow or deny a tool, a path or a system; approve writes before they land; roll an intent back to its snapshot. Enforced where the repo agent acts (its tool scope and dispatch), each change a person's act, recorded."
      deps: [{ name: intents-and-what-they-touched }, { name: repo-agent }]
      schema_refs: [AgentControl, AgentIntent]
      exports: ["get(repo) / set(repo, patch, { by }) → AgentControl", "act(repo, intentId, 'pause'|'resume'|'stop'|'rollback', { by })", "check(repo, { tool, path, system }) → { ok, why }", "POST /api/repos/:uuid/agent/control"]
      gate_pipeline: ["GATE-AC2-001: person or rule", "GATE-AC2-002: deny wins", "GATE-AC2-003: a rollback restores the snapshot and says what it undid"]
      behavioral_contracts: ["the agent reads its controls, never writes them"]
      error_paths: ["no snapshot for an intent → rollback refused, said"]
      acceptance: ["a denied path refuses the agent's write with why; a paused intent takes no step; a rollback restores the files the intent wrote"]

    - id: MOD-AC-PANEL
      name: control-panel
      uuid: nexus-idearium-agent-control-panel-v1-0000-2026-1031-001
      path: idearium/ui/js/agent-control.js
      phase: AC3_the_panel
      description: "Command rows (`repo agent intents`, `repo agent control`) and the repo's Settings › Agents › Control panel: intents live, each opening what it touched (diffs inline), the controls beside each."
      deps: [{ name: agent-controls }]
      schema_refs: [AgentIntent, AgentControl]
      exports: ["two command rows", "Settings › Agents › Control panel"]
      gate_pipeline: ["GATE-AC3-001: route before row before screen"]
      behavioral_contracts: ["agents get the same view through the command tool"]
      error_paths: ["the API down → the panel says so"]
      acceptance: ["in Clear Glass: the panel lists a fixture repo's intents; pausing one shows it paused; a deny rule appears in the list"]

    - id: MOD-AC-TARGET
      name: phase-target-folder
      uuid: nexus-idearium-agent-control-target-v1-0000-2026-1031-001
      path: lib/phase-target.js
      phase: AC4_each_phase_its_folder
      description: "His 'each phase is a predetermined folder of the target directory': a phase carries target: (or it is derived from its spec module's path); its files default under it; a build's write outside it is refused and said unless the phase names that file."
      deps: [{ name: phase-files }]
      schema_refs: [AgentIntent]
      exports: ["targetOf(phase) → string", "allowed(phase, path) → { ok, why }"]
      gate_pipeline: ["GATE-AC4-001: the target known before the build", "GATE-AC4-002: each write inside it or named"]
      behavioral_contracts: ["existing maps keep working: a phase with no target takes its files' common folder"]
      error_paths: ["files across folders with no target → the phase is flagged to be given one"]
      acceptance: ["a phase with target modules/auth: a write to modules/auth/x.js passes, to lib/y.js is refused with why"]

    - id: MOD-AC-PAGE-AGENTS
      name: agents-for-void-and-workshop
      uuid: nexus-idearium-agent-control-pages-v1-0000-2026-1031-001
      path: idearium/lib/page-agents.js
      phase: AC5_his_agents_for_the_void_and_the_workshop
      description: "Idearium's settings gain an agent per page (the Spatial Void, the Spec Workshop): provider and model, or 'learned' (Copilot's router, as today). _agentAsk puts his choice first in the route; if it is down, the router's next is used and said."
      deps: [{ name: idearium-api }, { name: workshop }]
      schema_refs: [AgentControl]
      exports: ["get() / set({ void, workshop }, { by })", "routeFirst(kind) → { provider, model } | null"]
      gate_pipeline: ["GATE-AC5-001: his choice tried first", "GATE-AC5-002: a fallback said on the reply"]
      behavioral_contracts: ["'learned' keeps today's behaviour"]
      error_paths: ["an unknown provider → refused with the list"]
      acceptance: ["with the Void set to Claude, a void echo is asked of Claude; with Claude down it falls back and the reply says so"]

    - id: MOD-AC-VOID-TOOLKIT
      name: void-on-his-toolkit
      uuid: nexus-idearium-agent-control-void-v1-0000-2026-1031-001
      path: idearium/lib/void-toolkit.js
      phase: AC6_the_void_on_his_toolkit
      description: "TO CONFIRM that 'my framework' is his Innovation Toolkit. The Void's echoes follow its methods, chosen by the sliders: further toward novel/outlier → associative and cross-domain synthesis; toward risky/unstable → constraint innovation; at the centre → end-state first and emergent synthesis. Each echo names the method it used and ends in a tangible artifact (his core axiom: every convergence collapses into one)."
      deps: [{ name: innovation-toolkit }, { name: agents-for-void-and-workshop }]
      schema_refs: [StepDefaults]
      exports: ["methodsFor({ novelty, risk }) → [{ id, name, steps }]", "promptFor(idea, methods) → string"]
      gate_pipeline: ["GATE-AC6-001: the method named on each echo"]
      behavioral_contracts: ["the ideas are his: the Void echoes, never replaces"]
      error_paths: ["the toolkit unreadable → today's echo, said"]
      acceptance: ["at outlier/unstable the echo uses an associative and a constraint method and names both"]

    - id: MOD-AC-SKIP
      name: skip-with-defaults
      uuid: nexus-idearium-agent-control-skip-v1-0000-2026-1031-001
      path: idearium/lib/step-defaults.js
      phase: AC7_skip_buttons
      description: "A skip button on every pipeline step (the Void's sliders, the Workshop's sections, its plan and phases): it fills the step's defaults (the template's sections via workshop templateSections, genesis's for a system, the repo's settings) and moves on; each filled value is marked default."
      deps: [{ name: workshop }]
      schema_refs: [StepDefaults]
      exports: ["defaultsFor(step, context) → StepDefaults", "the skip button on each step"]
      gate_pipeline: ["GATE-AC7-001: never over what he typed", "GATE-AC7-002: each default marked"]
      behavioral_contracts: ["a skipped step can be reopened and changed"]
      error_paths: ["no defaults for a step → no button, said"]
      acceptance: ["in the Workshop: skip on an empty plan fills the template's plan, each line marked default; his typed section is untouched"]

  events:
    agent_control:
      - "idearium.agent.control { repo, change, by }"
      - "idearium.agent.intent { repo, intent, state }"
      - "idearium.step.skipped { step, filled }"

  enforcement:
    gates:
      - { id: GATE-AC-PERSON, name: person-acts, severity: fatal, check: "a control change carries by", on_failure: "refused" }
      - { id: GATE-AC-DEFAULT-SAID, name: defaults-marked, severity: error, check: "every skipped value carries default: true", on_failure: "suite red" }
      - { id: GATE-AC-TARGET, name: inside-the-target, severity: error, check: "a phase's write is inside its target or named", on_failure: "refused and said" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines"
