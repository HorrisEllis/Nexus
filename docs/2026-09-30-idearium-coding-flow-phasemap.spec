spec:
  meta:
    name:     idearium-coding-flow
    version:  1.0.0
    date:     2026-09-30
    release:  0.39.283 (base) → 0.39.284
    uuid:     nexus-idearium-coding-flow-phasemap-v1-0000-2026-0930-jamesbrooks-001
    owner:    idearium.api · idearium.repo · idearium.ui · cos.workspace · lib.repo-inject · lib.code-edit
    status:   mapped; built one phase at a time, bottom-up, each proven before the next.
    axioms:   docs/AXIOMS-v3.1.md — §3.1 bottom-up only, §3.3 map before build, §3.4 raw execution before interfaces,
              §0.3 nothing lost, §1.1 nothing exists until proven, §1.3 no stub, §8.6 reuse before build,
              §12.1 every runtime file tested, §17.5 every output has provenance.
    origin: >
      James, 2026-09-30, with screenshots of the Plan panel (three plan runs "replied … no …-phasemap.spec came
      back", a review "timed out at gate 7/8"), an empty Phases tab, the greyed Create/Build entries at the end of the
      repo's tab row, and a Claude Code diff view ("first image"), and a full start:all log: "i want below the plan, in
      idearium, the worksurface from cos or the ide identicle to yours (first image.) can you rebuild the themes for
      the settings tab for idearium. the phases tab needs to populate with the plan. can you make all the css in
      idearium consistent with the main ui. remember its alwasy cli and api first. make sure its all connected, the
      tabs, the create and build tabs should be removed from the repos and moved back to the main navbar. make the
      navigation more dynamic. i like when its less static. most important. get it coding the projects. this is hard
      to understand how to actually build the code base. also the tools arent exposed still appearently. i want to see
      it working."

  # ── What the log and the code say (read, not recalled — §8.6) ─────────────
  found:
    - >-
      idearium goes OFFLINE for minutes while it works. 00:13:26 "spec created … · code" → 00:17:01 "cos-bridge created
      compartment": 3.5 minutes of 14 missed pulses, and the build trigger it sends to itself fails ECONNREFUSED
      :4800. Cause: speceng.codegen → lib/cos-bridge.js branchWorkspace → cos/workspace/index.js ownRepo +
      worktree add run `git init`, `git add -A`, `git commit`, `git worktree add` with execFileSync on the 91 MB
      original, inside the request handler. The event loop is held for the whole git run.
    - >-
      Plan never lands. build-surface.js specPlan asks the repo agent (Ollama, a 3B coder model, 4k context) to read
      the spec with tools and write <spec>-phasemap.spec as one addressed code block. Three runs replied and no file
      came back, so the Phases tab says "no *phasemap*.spec". Nothing looks in the reply text itself, and nothing
      else can make the map.
    - >-
      The agent's writes are .inject nodes (lib/repo-inject.js) that keep `before` and `content`, and lib/code-edit.js
      has unifiedDiff(). There is no view of "what changed" as files with their diffs; the Files tab shows states,
      not the change.
    - >-
      Tools: repo agents run in the 'harness' scope — the code tools are listed in the prompt, the rest are found
      with loom.find / nexus.tools. The UI shows neither what the agent can use nor what it did with them outside
      the Agent CLI's /tools and a collapsed trace.
    - >-
      Create and Build are the last two entries of the open repo's own tab row (#repo-subnav, 0.39.271 N1). The top
      bar is Welcome + Repos only.

  phases:
    W0_map:
      layer: foundation
      status: DONE
      depends_on: []
      files: [docs/2026-09-30-idearium-coding-flow-phasemap.spec, docs/SPEC-REGISTRY.spec]
      does: >-
        This map, registered.
      proof: "the file exists and is registered"

    W1_idearium_never_blocks_on_git:
      layer: foundation
      status: DONE
      depends_on: [W0_map]
      files: [cos/workspace/index.js, lib/cos-bridge.js, idearium/api/index.js]
      does: >-
        branchWorkspaceAsync / ownRepoAsync: the same steps with execFile (async), so the event loop keeps serving
        while git works on a large original. speceng.codegen awaits the async one. The sync functions stay for their
        other callers (§0.3).
      proof: >-
        a test holds a fake git that sleeps and shows a timer still fires during branchWorkspaceAsync (the sync one
        would starve it); a real git run gives the same result as the sync one.

    W2_plan_always_lands:
      layer: library
      status: DONE
      depends_on: [W1_idearium_never_blocks_on_git]
      files: [idearium/repo/spec-plan.js, idearium/api/build-surface.js, idearium/cli/index.js, idearium/ui/js/living-spec.js, idearium/ui/js/phases.js]
      does: >-
        After the agent replies: (1) the map is taken from the reply text if the agent wrote it there without the
        addressed block (a ```yaml or bare `spec:` … `phases:` block that validates); (2) otherwise the plan is
        DERIVED from the spec itself — one phase per spec section (or group of small sections), its layer read from
        the section's name and text (types/schema → foundation, engine/store → library, api/route → api, cli →
        cli, loop/scheduler → automation, ui/canvas/panel → ui), depends_on the phases below it, proof "a test for
        <section>" — and written with provenance in its meta (planned_by, reason). The run is 'replied' with the map
        written, and the Phases tab shows it. POST …/spec/plan with {derive:true} makes the derived one at once (no
        agent); a CLI does the same (API and CLI first).
      proof: >-
        tests: a reply carrying the map as text lands it; a reply with nothing lands a derived, VALID bottom-up map
        whose phases cover every section; derive:true through the real router; the CLI prints the phases.

    W3_work_surface:
      layer: api
      status: DONE
      depends_on: [W2_plan_always_lands]
      files: [idearium/repo/work-surface.js, idearium/api/index.js, idearium/api/build-surface.js, idearium/ui/js/work-surface.js, idearium/ui/css/work-surface.css, idearium/ui/js/plan-panel.js, loom/maps/one-idearium-map.js]
      does: >-
        GET /api/repos/:uuid/worksurface — every file the agent changed (its .inject nodes, newest state per path),
        with +added / −removed counts and the unified diff (before → content), the status (proposed / staged /
        applied / reverted / rejected), who wrote it and in which run; and the tools: the ones the agent is given and
        the calls it made in its recent runs. The UI is the Claude-Code-style diff list under the Plan panel: one
        collapsible card per file, green/red lines, +N −M, Apply / Reject / Revert on each, and a Tools strip.
      proof: >-
        library test over real .inject nodes (counts and hunks), the route through the real router, and a Chromium
        probe of the panel.

    W4_navigation:
      layer: ui
      status: DONE
      depends_on: [W3_work_surface]
      files: [idearium/ui/index.html, idearium/ui/js/app.js]
      does: >-
        Create and Build leave the repo's tab row and go back to the main bar, after Repos. Build opens with "Build
        this repo" first: the three steps (plan the spec → phases → build the next phase) on the open repo, with the
        Plan panel and work surface. The bars move: a sliding underline under the active tab, and the views fade in.
      proof: "a Chromium probe: the main bar has Create and Build, the repo row does not; the Build flow opens"
      built: >-
        2026-09-30, with W3. tests/probe/idearium-coding-flow-chromium.js 12/12 on a REAL idearium (own port, sandboxed
        stores): the main bar Welcome · Repos · Create · Build, the ink moves with the active tab, an empty Phases tab
        plans the spec in place (5 phases, bottom-up), Build ▾ opens animated with "Build this repo" first, which lands
        on Home's Start building with the Plan panel and the work surface (two diff cards, +/−, Apply/Reject/Revert, the
        tools strip), and Apply writes the file. test-work-surface 14/14; test-one-idearium-phases-nodes N1 inverted.

    W5_theme_and_css:
      layer: ui
      status: DONE
      depends_on: [W4_navigation]
      files: [idearium/ui/css/nexus-theme.css, idearium/ui/js/theme.js, idearium/lib/config-core.cjs, idearium/ui/index.html, idearium/ui/settings.html, idearium/ui/css/work-surface.css]
      does: >-
        idearium's tokens follow the main NEXUS UI's (nexus/ui) so both read as one system; the Settings tab's
        themes are rebuilt as named palettes (the main UI's first), previewed, applied live, and kept.
      proof: "a Chromium probe: switching a theme changes the tokens and survives a reload"
      built: >-
        2026-09-30. css/nexus-theme.css: the main UI's palette (ui/themes/nexus-dark.css, token for token — a test fails
        if they drift), 'midnight' (idearium's look before, kept) and 'graphite'; the main UI's cyan accent, cycling as
        it does there, or fixed (cyan/violet/emerald/amber); motion full/reduced. idearium's and the settings console's
        own tokens now read from it. config ui.theme/ui.accent/ui.motion (POST /api/config — API and CLI first); the
        console's new Appearance page (palette cards with previews, accent chips, motion) applies at once and saves.
        Light is not offered: idearium has hard-coded dark surfaces in many places; a light palette would look broken.
        test-idearium-theme 15/15; the coding-flow probe 15/15 (default ink #080814; Graphite applies, saves, and the
        idearium page follows it after a reload).

    W6_release:
      layer: ui
      status: OPEN
      depends_on: [W5_theme_and_css]
      files: [lib/version.js, package.json, CHANGELOG-0.39.284.md, docs/atlases/*, docs/2026-09-29-handoff.md]
      does: "versions, changelog, atlases, the handoff, loom wires, the full run"
      proof: "full run: 0 unregistered failures"
