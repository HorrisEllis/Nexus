spec:
  meta:
    name:        brainos-agent-suite
    version:     0.1.0-phasemap
    status: >-
      PHASEMAP 2026-09-22. James: "brainos was supposed to have a
      full, huge agent suite for the entire agent system. copilot,
      ollama, guardian, hats, tools, all of it, .injection nodes
      for editing whats injected to each agent. module manager,
      reader... have been told its been build three times now."
    uuid:        nexus-brainos-agentsuite-v0-0000-2026-0922-001

  diagnosis_verified_2026_09_22:
    symptom: >-
      "have been told its been built three times." Checked directly, not
      from memory or any prior changelog's claim: ui/brainos/index.html (180
      lines) declares exactly five tabs — CANVAS, DEPLOY, BAYES, PIPELINE,
      AUTOMATION (grepped the real tab-nav markup, not inferred from a
      title). ui/brainos/brainos-app.js (589 lines) + brainos-canvas.js (543)
      + brainos-automation.js (774) back those five. NONE of the five is
      copilot config, ollama config, guardian config, hat management, a
      tool browser, an injection editor, a module manager, or a reader.
      Whatever was built three times, it was not this — three claims and
      zero real tabs for any of the named systems is the actual gap.
    what_already_exists_backend_side: >-
      Each piece James names already has a real, working backend — checked
      directly, not assumed from the names alone:
        - copilot: copilot/server.js, a real running service (:3750) with
          its own real routes (suggest, prompt, tools, etc.) — several
          wired to UI this session (Brainstorm's assist, screen-qa's answer
          call), most not.
        - ollama: ollama/server.js (:3749), a real bridge — no dedicated
          management UI found anywhere.
        - guardian: guardian/server.js (:7820) — the largest, most complex
          backend in the whole system; NCP dispatch, jobs, macros, autofill,
          screen-qa, response-sink all live here. No unified "guardian
          console" UI exists; what UI exists is scattered per-feature
          across ui/library and clear-glass's own chrome.
        - hats: lib/hat-forge.js — real CRUD (forge/get/byName/list/revoke/
          rename), a real JAA-backed forged_hats table, fixed for a real
          cross-process bug this session (0.39.212). No UI anywhere reads
          or writes it — checked, zero matches for hat-forge in any ui/**
          file.
        - tools: docs/clear-glass-toolkit.spec (an earlier real phasemap,
          2026-08-18) already found 71 declared tools with only 26 served —
          a real, already-diagnosed, separate gap this phasemap does not
          re-litigate, only cites.
        - .injection nodes: TWO real, distinct things already exist and
          were confirmed by reading them directly, not conflated: (1) a
          real `.injection` node type (118 files on disk, in KNOWN_TYPES) —
          a per-call AUDIT RECORD of whether priming/tool-guide injection
          fired for one NCP dispatch. (2) copilot/lib/inject-config.js
          (built 2026-09-19, for nearly this exact request) — real, EDITABLE
          configuration for copilot's five real context-injection sites, as
          `inject_rule` nodes, with DEFAULT_RULES preserving today's
          behavior exactly so a missing/broken config degrades to current,
          not to silence. Zero UI callers found anywhere in ui/** — checked
          directly.
        - module manager, reader: no real backend or concept found anywhere
          in the codebase under either name. Genuinely new, not a missing-
          UI case like the others above — named honestly as such, not
          padded to look like the rest of this list.

  governing_principles:
    - "reuse before build — every phase below wires a UI to a real, already-existing backend except MM1 (module manager) and RD1 (reader), which have no backend to reuse and are scoped as real, separate builds, not disguised UI work."
    - "one implementation, not two — inject-config's DEFAULT_RULES-as-safe-fallback pattern is not re-solved; the UI phase (IJ1) reads/writes the real node type, it does not cache or duplicate the rule set."
    - "gaps are addressed, not assumed — this diagnosis names, for each of James's eight items, whether the gap is 'real backend, no UI' or 'nothing exists yet', because the two need different work and conflating them is how a nonexistent build gets claimed as done."
    - "no repetition — clear-glass-toolkit.spec (2026-08-18) already phasemapped the tools gap; TL1 below cites it rather than re-deriving the same 71-vs-26 count."

  phases:

    AS1_agent_system_tab:
      does: >-
        A new BrainOS tab (sixth, alongside Canvas/Deploy/Bayes/Pipeline/
        Automation) — a real dashboard surfacing copilot/ollama/guardian's
        live health + config, reusing each service's own real /health and
        settings routes rather than inventing a new status protocol.
      reuse: "each service's own existing /health endpoint; clear-glass's settings.html pattern for a real, persisted config form."
      gate: "the tab shows each of the three services' real, live status (not a static placeholder) and can round-trip a real config change to at least one of them."
      drift: "how much per-service config surfaces here vs. staying in each service's own settings surface (guardian doesn't currently have one) is a real design question, not pre-decided."

    HT1_hat_manager:
      does: >-
        A real CRUD UI over lib/hat-forge.js — list every forged hat
        (name, seedKey, allowedAgents, responsibilities), forge a new one,
        revoke/rename an existing one. Directly wires to the real functions
        fixed for cross-process correctness this session (0.39.212) — the
        UI is a genuinely new caller of already-correct code, not a reason
        to touch hat-forge.js's own logic again.
      reuse: "lib/hat-forge.js's full existing API (forge/get/byName/list/revoke/rename) — zero new backend logic."
      gate: "a hat forged from this UI is immediately visible to a DIFFERENT already-running NEXUS process's own hatForge.get() call — the exact real cross-process check 0.39.212's own test (test-hat-forge-cross-process.test.js) already proves at the library level; this phase proves it end-to-end through a real UI action."
      drift: "none of substance — this is the most mechanical phase here, a straightforward CRUD surface over an already-correct, already-tested backend."

    IJ1_injection_editor:
      does: >-
        A real editor for copilot/lib/inject-config.js's five inject_rule
        nodes — see each site's current rule, edit it, save it as a real
        node (never touching DEFAULT_RULES, which stays the safe fallback
        exactly as inject-config.js's own design intends). Separately, a
        real READ-ONLY viewer for the .injection audit-record node type
        (118 real files already on disk) — a different real thing, shown
        as a different real panel, not merged into one list just because
        both start with "inject."
      reuse: "copilot/lib/inject-config.js's full existing API — zero new backend logic, same as HT1."
      gate: "editing a rule from this UI changes copilot's real next-dispatch injection behavior (verified against a real copilot/server.js call, not just that the node file changed on disk)."
      drift: "none of substance."

    TL1_tool_browser:
      does: >-
        Cites, does not re-derive: docs/clear-glass-toolkit.spec (2026-08-18)
        already phasemapped "71 declared vs 26 served" as CG-GAP-3, with its
        own real phases. This phase is the BrainOS-side UI surface for
        whatever that spec's own work produces (a real declared/served tool
        list, browsable) — sequenced to depend on that spec's phases, not
        to duplicate them.
      reuse: "docs/clear-glass-toolkit.spec's own phases — this adds a UI on top, once they land."
      gate: "inherits clear-glass-toolkit.spec's own gates; this phase's own gate is just that the resulting list is browsable here, not re-verifying tool dispatch itself."
      drift: "blocked on clear-glass-toolkit.spec's own completion state, which this phasemap did not re-audit."

    MM1_module_manager:
      does: >-
        UNSCOPED. No existing concept, backend, or prior spec found anywhere
        in the codebase for "module manager" — checked directly, not
        assumed absent from memory. Before phases can be written here,
        James's own definition is needed: manager OF what modules (NEXUS's
        own 17 systems? copilot's internal capability modules? something
        else)? enable/disable, reconfigure, or something else? This entry
        exists so the ask isn't silently dropped from the phasemap, not to
        pretend a design already exists.
      reuse: null
      gate: null
      drift: "the entire phase is drift until scoped."

    RD1_reader:
      does: >-
        UNSCOPED, same honest treatment as MM1. "Reader" is not a term used
        anywhere else in this codebase's real code or specs — checked
        directly. Could mean a document/spec reader, a chat-log reader, a
        node reader, or something not yet named. Needs James's own
        definition before phases can be written.
      reuse: null
      gate: null
      drift: "the entire phase is drift until scoped."

  ordering_rationale: >
    HT1 and IJ1 first — both are the highest-confidence phases in this
    whole phasemap (real, already-correct, already-tested backends;
    zero new backend logic; the UI is genuinely the only missing piece).
    AS1 next, since it benefits from HT1/IJ1 existing as real panels to
    link from a dashboard rather than being built as an empty shell first.
    TL1 is explicitly sequenced behind a DIFFERENT spec's own phases, not
    ready to start independently. MM1/RD1 are last because they cannot
    start at all without more from James — sequencing them earlier would
    only be motion, not progress.

  honest_risks:
    - "This phasemap's confident phases (HT1, IJ1) are confident specifically because their backends are real and tested; if 'module manager' or 'reader' turn out to also have partial backend work sitting somewhere unfound, this diagnosis is wrong about them being unscoped rather than just unlinked to UI — worth a second, more exhaustive search before committing effort, not just before writing the phase."
    - "AS1's dashboard scope (how much per-service config lives there vs. in each service's own settings) is a real open design question, not resolved by this phasemap."
    - "The clear-glass tab-per-repo/UI-expansion phasemap (docs/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion-phasemap.spec) and this one both touch ui/library's own established 'own file, no monolith' convention — worth keeping the two phasemaps' UI1/AS1 phases coordinated rather than run as fully independent efforts, since a shared UI-extraction pattern serves both."
