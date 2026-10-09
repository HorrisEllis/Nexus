spec:
  meta:
    name:     verified-primitives
    roadmap: 'later — adversarial checks — after the engine (declutter 2026-10-09, James: "okay")'
    version:  1.1.0
    date:     2026-10-05
    release:  0.39.309 (base) → 0.39.310
    uuid:     nexus-verified-primitives-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.api · idearium.ui · copilot.lifeline · copilot.person-model · intelligence.gap · lib.component-store · cos.testenv · clear-glass
    status:   "MAPPED 2026-10-05; VP0 (this map + the atlas section) and VP7 (the Settings tab in categories) built in 0.39.310; VP1–VP6 open"
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §0.1 evidence over memory, §17.5 every
              output has provenance, §17.10 verify before you promote, §5.9 every system is sovereign, §10.3 competing
              truth layers are a failure, §12.3 never shared (the user model), §5.12 the UI is disposable.
    origin: >
      James, 2026-10-05: "Clearglass can be used to verify, lifeline can ask other agents. Adversarial agents. Use the
      confidence score. Can reuse any component in nexus, from loom or the component registery. What do you think?
      Like each repo has a model of the user. Using the intelligence system to understand gaps in communication, ledger
      for past context. Then each passing test, verified component, gets fed into the primitive field. Make sure you
      add this to the idearium atlas. Like I want provinance. Integrating the debug and intelligence system with the
      desktop envirement. Which is supposed to use debian for each test envirement also the settings tab needs to be
      cleaned up. Like the desktop envirement settings are shown at all times. Those need to be hidden or show when you
      clikc the button. Also the iframes. Needs to be rebuilt cleaner and more organized. With catagories of options
      like github. Not in a long list. In tabs."
      The ideas, the direction and the calls are James's. This map lays them out bottom-up against what exists.

  # ── The loop as James describes it ──────────────────────────────────────────────────────────────────────────────
  #   a component is built  →  VERIFIED (its tests, its conditions, Clear Glass on its page)  →  CHALLENGED (other
  #   agents, adversarial, through lifeline)  →  one CONFIDENCE score, from that evidence  →  passed + confident →
  #   the PRIMITIVE FIELD (the component store, tiered, with provenance)  →  reused by the next build (any component
  #   in loom or the store)  →  the repo's MODEL OF THE USER says what he meant, the ledger says what was said before.
  found:
    confidence: >-
      copilot/lifeline.js _estimateConfidence scores a reply's WORDING (length, hedges, "the answer is"), not evidence
      — a confident wrong answer scores high. lib/build-verify.js grades code failed / parses / proven from real runs;
      idearium/repo/proof-run.js checks declared conditions (file, command, tests, page); lib/agent-build-learning.js
      keeps a Bayesian score per agent; lib/reflection.js scores a decision. Nothing combines them.
    adversarial: >-
      copilot/adversarial.js pings copilot's own faculties (intuition, analysis) with known inputs every 60 s.
      lib/agent-council.js asks several real agents the same question independently (none sees another's answer) and
      RAID governs the verdicts. lifeline routes one prompt (Ollama first, Guardian on low confidence). Nothing asks
      another agent to attack a BUILT component.
    clear_glass: >-
      clear-glass/src/screen-qa/detector.js and clear-glass/src/diagnostic/engine.js read a live page; proof-run's
      'page' check starts the app and stops it. The repo desktop opens the compartment's VM in a Clear Glass window.
    user_model: >-
      copilot/lib/user-model.js (hypotheses with confidence, decay, contradictions, pin/reject/correct) and
      copilot/lib/person-model/index.js (identity, typed lattice, a session ledger chained to the last) are ONE model
      of James, global. lib/repo-hat-memory.js keeps per-repo observations, `correction` outranking the rest.
      intelligence/gap/hunter.js has a COMMUNICATION domain (assumption, obligation) and intelligence/liminal/index.js
      reads avoidance and contradiction in text — neither is run on a repo's Agent-tab exchanges.
    primitive_field: >-
      Not a thing in the code under that name. What James describes is mapped already in
      docs/2026-10-02-emerge-field-memory-build-phasemap.spec: CX0 (the component store grown into CODEX), CL1 (the
      component lab: draft → proven → crystal) and MR8 (crystallization: N independent passes promote into the
      deterministic core). lib/component-store.js keeps every WARP-built file with pinned dependencies but has no tier
      and no proof attached; markFailed exists. loom/data/registry.json holds 2,789 components (0.39.309 regeneration).
    debian: >-
      cos/testenv/provision.js makes the base from the Debian 12 genericcloud image; cos/testenv chooses the VM only
      when qemu, qemu-img and the base image exist on a Linux host, else the process sandbox — and says which.
      lib/build-verify.js runs a repo's tests in a COS branch.
    settings_tab: >-
      The repo's Settings tab (idearium/ui/js/app.js renderRepoSettings) is one long column: compartment, environment,
      provenance, repository actions, the environment check with EVERY option always listed
      (idearium/ui/js/repo-environment.js), then an iframe of the WHOLE settings console (its own Agent · Prompt · Hat
      · Compartment & desktop tabs), then the agent section and the prompt blocks inline — the same blocks twice.

  phases:
    VP0_map_and_atlas:
      layer: foundation
      systems: [idearium]
      value: { score: 3, cost: S, for: [foundation], why: "the loop written down before any of it is built; provenance named" }
      status: DONE (0.39.310)
      depends_on: []
      files: [docs/2026-10-05-verified-primitives-phasemap.spec, docs/atlases/idearium-atlas.md, docs/SPEC-REGISTRY.spec]
      does: "This map, registered; the idearium atlas section that says what is built, what is mapped, and the provenance every primitive must carry."
      proof: "the map exists and the atlas names it with no dead reference"
      conditions:
        - { says: "the map exists", check: { kind: file, path: docs/2026-10-05-verified-primitives-phasemap.spec } }
        - { says: "the atlas has no dead reference", check: { kind: tests, run: "node tests/modules/test-nexus-atlas-refs.test.js" } }

    VP1_confidence_from_evidence:
      layer: library
      systems: [core, idearium, clear-glass]
      value: { score: 5, cost: M, for: [quality, safety, foundation], why: "every later step trusts this number; it must be evidence, not wording" }
      status: OPEN
      depends_on: [VP0_map_and_atlas]
      files: [lib/confidence.js]
      does: >-
        "Use the confidence score." One score per built component, computed only from evidence, each part named:
        build-verify's verdict (proven / parses / failed), the proof conditions met of declared, the Clear Glass page
        check when the component has a page, the adversarial findings that reproduced (VP2), the agent's track record
        (agent-build-learning). Wording-based confidence (lifeline's) is not evidence and is not an input. No evidence
        → no score, said ("unscored"), never a default. §0.1.
      proof: "a proven component with met conditions scores above one that only parses; a reproduced flaw lowers it; no evidence reads unscored"

    VP2_adversarial_review:
      layer: service
      systems: [copilot, core, cortex]
      value: { score: 4, cost: M, for: [quality, safety], why: "another agent breaks it before he relies on it; only reproduced findings count" }
      status: OPEN
      depends_on: [VP1_confidence_from_evidence]
      files: [lib/agent-council.js, copilot/lifeline.js, meta/adversary-suite.js]
      does: >-
        "lifeline can ask other agents. Adversarial agents." A built component is sent, through lifeline, to agents OTHER
        than the one that wrote it, each independently (agent-council's rule: none sees another's answer), asked to break
        it. A finding counts only when it reproduces — each claimed flaw becomes a check (a test or a condition) that is
        run; a claim that does not reproduce is recorded and does not move the score. RAID governs, as the council does.
      proof: "a fixture with a real bug: an adversary's finding becomes a failing check; a false claim is recorded and leaves the score unchanged"

    VP3_the_repo_model_of_the_user:
      layer: service
      systems: [copilot, intelligence, core, idearium]
      value: { score: 4, cost: L, for: [daily-use, quality], why: "agents stop guessing what he meant; one model, a lens per repo" }
      status: OPEN
      depends_on: [VP0_map_and_atlas]
      files: [copilot/lib/person-model/index.js, copilot/lib/user-model.js, lib/repo-hat-memory.js, intelligence/gap/hunter.js]
      does: >-
        "each repo has a model of the user. Using the intelligence system to understand gaps in communication, ledger for
        past context." ONE model of James (§10.3 — a second model per repo would be a competing truth), seen through a
        repo LENS: hypotheses carry the repo they were observed in; the repo's view is its own plus the global ones. The
        gap hunter's COMMUNICATION domain and liminal's detectors run on the repo's Agent-tab exchanges: an assumption
        the agent made, an obligation it skipped, a word James uses differently — each a hypothesis with confidence,
        never a fact (user-model §12.1); his corrections (repo-hat-memory) confirm or reject them. The person model's
        session ledger, chained, is the past context. Sovereign: it never leaves NEXUS (§12.3).
      proof: "an exchange where the agent assumed what James did not say yields a communication-gap hypothesis in that repo's lens; a correction rejects it"

    VP4_the_primitive_field:
      layer: library
      systems: [core, idearium, loom]
      value: { score: 5, cost: L, for: [compounding, foundation], why: "proven parts are reused; every build after it costs less" }
      status: OPEN
      depends_on: [VP1_confidence_from_evidence, VP2_adversarial_review]
      files: [lib/component-store.js]
      does: >-
        "each passing test, verified component, gets fed into the primitive field." The component store gains a tier and
        its proof: draft (built) → proven (build-verify proven + conditions met + confidence ≥ threshold, the threshold a
        setting) → crystal (proven again N times independently — MR8; N a setting, never hidden). Unproven never enters
        as proven (§17.10); a contradicting outcome re-opens a crystal. This is the entry gate of the already-mapped
        CX0 / CL1 / MR8 (emerge map), not a second store. "Can reuse any component in nexus, from loom or the component
        registery": loom's 2,789 components are offered to a build by their CARD (registry-harness — interface, never
        code across a system boundary, §5.9/§5.10); a component is copied into a repo only from the store, with its
        pinned closure (component-store closure()).
      proof: "a component that passes enters as proven with its proof; the Nth independent pass makes it crystal; a failing reuse re-opens it"

    VP5_provenance:
      layer: library
      systems: [core, idearium]
      value: { score: 4, cost: M, for: [ownership, safety], why: "every primitive can say where it came from and what proved it" }
      status: OPEN
      depends_on: [VP4_the_primitive_field]
      files: [lib/component-store.js, lib/node-export.js, docs/atlases/idearium-atlas.md]
      does: >-
        "I want provinance." §17.5 for every primitive: who built it (agent, model, hat), from what (spec, section,
        prompt digest, the build context it was sent — 0.39.309 records chars and blocks), when, against which version,
        what proved it (tests run, conditions, confidence parts, adversaries and their findings), and every reuse since.
        Written on the store's component.json and as a `.component` node; the atlas section lists where each is kept.
      proof: "a primitive answers who, from what, when, why, against which spec and version, and what proved it"

    VP6_debug_and_intelligence_in_the_desktop:
      layer: runtime
      systems: [core, idearium, intelligence]
      value: { score: 3, cost: L, for: [quality, daily-use], why: "a failure in the VM is a gap with its cause, beside the screen he is looking at" }
      status: OPEN
      depends_on: [VP1_confidence_from_evidence]
      files: [cos/testenv/index.js, lib/cos-debug-report.js, lib/gap-field.js, idearium/ui/desktop.html]
      does: >-
        "Integrating the debug and intelligence system with the desktop envirement. Which is supposed to use debian for
        each test envirement." Every test environment is the Debian VM when it can be (cos/testenv already chooses it and
        says why when it cannot — the UI shows which ran). A failure in the VM goes to the COS debug report and the gap
        field (intelligence's synthesis ranks it); the desktop window shows the run's failures and gaps beside the screen,
        and Clear Glass's screen-qa reads the app inside it.
      proof: "a failing test in the VM appears as a gap with its cause and in the desktop's panel; a run without the VM says it ran in the process sandbox"

    VP7_the_settings_tab_in_categories:
      layer: ui
      systems: [idearium]
      value: { score: 3, cost: S, for: [daily-use], why: "settings he can find; nothing shown twice; the desktop settings out of the way" }
      status: DONE (0.39.310; its test moved onto Clear Glass in 0.39.311)
      depends_on: [VP0_map_and_atlas]
      files: [idearium/ui/js/repo-settings.js, idearium/ui/js/app.js, idearium/ui/js/repo-environment.js, idearium/ui/settings.html, idearium/ui/index.html]
      does: >-
        "the settings tab needs to be cleaned up … the desktop envirement settings are shown at all times. Those need to
        be hidden or show when you clikc the button. Also the iframes … With catagories of options like github. Not in a
        long list. In tabs." The repo's Settings tab is a category list on the left and ONE pane at a time:
        General · Agent · Prompt · Hat · Environment · Desktop · Repository. Nothing is shown twice: the whole-console
        iframe is gone; a pane that needs the console shows only its one view (settings.html?tab=…&embed=1, no tab strip)
        and only when its button is clicked. The environment's option list and the desktop's settings are behind a
        button. The chosen category is remembered per browser. Nothing is removed: the settings console page keeps all
        of it.
      proof: "in Clear Glass (its driver, no Playwright): one pane at a time, no iframe until a button asks for it, the desktop settings hidden until clicked"
      conditions:
        - { says: "one pane at a time, no iframe until a button asks for it, desktop settings hidden until clicked", check: { kind: tests, run: "node tests/modules/test-repo-settings-ui.test.js" } }

  open_questions:
    - "VP1: the proven threshold (default proposed 0.8) and VP4's N (default proposed 3, WARP's own promote-after-3) — his call."
    - "VP3: may the repo lens's hypotheses be shown in the repo's Settings → Agent pane, or only in copilot's person model?"
    - "VP6: Debian for every test environment even when it means a 10–40 minute first setup, or the process sandbox until the VM is set up?"
