spec:
  meta:
    name:     build-surface
    version:  1.0.0
    date:     2026-09-29
    release:  0.39.279 (base) → 0.39.280
    uuid:     nexus-build-surface-phasemap-v1-0000-2026-0929-jamesbrooks-001
    owner:    clear-glass.main.compartment-window · idearium.ui · idearium.repo · idearium.api · cos.testenv · cos.workspace ·
              ui.tv-shell · ui.home · versionium · loom.scanners.phasemap-map
    status:   mapped; BS0 and BS1 were built before the map was asked for and are recorded CLOSED with their proof;
              every other phase is open and is built in the order below, one at a time, each verified before the next.
    axioms:   docs/AXIOMS-v3.1.md — §3.1 bottom-up only, §3.3 map before build, §3.4 raw execution before interfaces
              (raw code → library → API → CLI → automation → UI), §0.3 information is never lost, §1.3 no stub or
              placeholder, §8.6 reuse before build, §10.2 projections are derived, §12.1 every runtime file tested,
              §17.5 every output has provenance, §5.4 versions persist.
    origin: >
      James, 2026-09-29 (three messages, one session). (1) "can you have the electron popup windows for the desktop
      envirement and settings, be in a borderless windowed and possible a manipulatable cos compartment so i can drag
      it around and resize it? keep the theme consistent. like i want each spec to have the entire build split into
      phases, chunked, bottom up, and with the axioms. also supposed to have per repo settings also like in the
      settings tab of the repos. it needs to run a check to make sure its downloaded and configured, it needs to make a
      envirement reletive to the codebase, like install all the needed dependancies, have a full list of additional
      options for the envirement. when importing a repo the system rewind menu pops up when clicking continue.
      baseline deviation needs to recaclute each version or major file change. need to have a better area for
      beginning the build, also want to be able to click on a spec in the spec tab and have it built. phases the same
      way. click a file in the files tab and have a button that says manage or something, with expand, iterate,
      rebuild/refactor, debug, anything else i need for having ai manage a single file, and possibly specific lines,
      using the search in the code tab, like agents need full context ability. the plan, can you have something like
      that, showing progress, and expandable tasks, to show the event ledger and activity. maybe use the gates as
      progress also?" (2) "make sure you follow, the axioms in the docs folder, 3.1. … also what about in the files
      page, we have a greyed out files, for pending files, that are uncommited. alos with the screenshot i want to
      have a build button [the Spec tab]. then when your done … update the atlas' for relevant files, and changes,
      versionium, bump versions, provanance is first class data. nothing lost, or wasted." (3) "map first,
      everything still pending into phases, into nexus' phasemap, then begin bottom up, then one by one."

  # ── What exists (read, not recalled — §8.6) ───────────────────────────────
  exists:
    - >-
      idearium/repo/phases.js + roadmap.js + GET/POST /api/repos/:uuid/phases[/status|/add|/build] — the Phases
      manager: every phasemap of a repo parsed by loom's own parsePhasemapText; Build = a Versionium snapshot, then the
      repo's agent with the phase (runs recorded, idearium.repo.phase.* events). Building one phase already works from
      its detail pane; nothing orders a whole spec's phases, and nothing turns a .spec into a phasemap.
    - >-
      idearium/repo/living-spec.js + ui/js/living-spec.js — the Spec tab: a repo's spec folder, one .spec parsed as a
      model (sections, version history, gaps, addenda, text). Read-only. No build control.
    - >-
      idearium/repo/snapshot.js — every snapshot records mustRecord.sourceHash (fresh / mismatched / missing: the
      indexes against the files on disk), versionCommit, atlas / chunk / graph versions. import-baseline.js takes ONE
      baseline snapshot per repo on its first index. Nothing recomputes how far the repo has moved from that baseline,
      or when.
    - >-
      lib/repo-inject.js — proposed / staged / applied / rejected injects per file (0.39.279 added staged). The Files
      tab (ui/js/app.js renderApiRepoPanel) draws repo.files only; a proposed new file is invisible there and a
      modified one looks committed.
    - >-
      cos/testenv/detect.js plan(repoDir) — stacks, install commands, suite, test files, runtimes, gaps, from the repo's
      own manifests. provision.js EXTRA_PACKAGES (desktop, …), setup-job.js. No per-repo "is it downloaded and
      configured" check, and the environment options are spread over config keys.
    - >-
      idearium/ui/settings.html (0.39.279) — the settings console, with a per-repo view (Agent / Prompt / Hat /
      Compartment & desktop) at ?repo=<uuid>. The repo's own Settings tab links to it but does not contain it.
    - >-
      idearium code search (Code tab, GET /api/repos/:uuid/code/search) and the repo agent (POST
      /api/repos/:uuid/agent/send, lib/repo-agent.js) with nexus.context.tool — the full-context path an agent already
      has. Nothing starts it scoped to one file or a line range.

  invariants:
    I1: >-
      Bottom-up (§3.1, §3.4): a phase depends only on phases in its own or a lower layer; a spec's generated phasemap
      is refused if it does not. Layers, lowest first: foundation · library · api · cli · automation · ui.
    I2: >-
      Nothing lost (§0.3): every build step is preceded by a Versionium snapshot (the existing phases/build rule);
      generated phasemaps are written as files in the repo (versioned with it), never held only in memory.
    I3: >-
      Provenance (§17.5): every generated phasemap, plan step, deviation record and environment check names what made
      it (spec path + its hash, commit ids, the agent, the time).
    I4: >-
      Projections are derived (§10.2): the plan panel and the file states are computed from phase runs, events,
      injects and snapshots on every read; they own no state of their own.
    I5: >-
      No stub (§1.3): a control that cannot do its job says why (no agent, no QEMU, no spec) instead of pretending.

  phases:
    BS0_compartment_windows:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — built before this map was asked for; proof below
      depends_on: []
      files: [clear-glass/src/main/compartment-window.js, clear-glass/src/preload/compartment-window.js, clear-glass/src/main/index.js,
              idearium/ui/js/window-chrome.js, idearium/ui/settings.html, idearium/ui/desktop.html, cos/workspace/index.js]
      does: >-
        idearium's /desktop.html and /settings.html popups from Clear Glass's webview open frameless, NEXUS-dark,
        resizable from every edge, draggable by a compartment-styled title bar (pin / minimize / maximize / close);
        every other popup unchanged. The settings console loses its light theme. The desktop viewer says WHY a screen is
        unreachable (QEMU's own stderr, exit code) and retries while the VM boots; a VM that dies at once on a hardware
        accelerator (James's screenshot: accel whpx, port 5724) is retried once in software and said (accelFallback).
      proof: >-
        tests/modules/test-compartment-window.test.js 5/5; tests/modules/test-cos-workspace.test.js 12/12 (WS-13 new);
        tests/probe/settings-console-chromium.js 10/10 unchanged. Not run: a real Electron window, a real WHPX host.

    BS1_rewind_hit_test:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — root cause found and proven; built before this map was asked for
      depends_on: []
      files: [ui/tv-shell/tv-shell.css, ui/home/areas/shell.css, tests/probe/menu-overlay-hit-chromium.js]
      does: >-
        "when importing a repo the system rewind menu pops up when clicking continue". A closed #menu-overlay is
        opacity 0 / pointer-events none, but #rewind-btn, #inspect-btn and #settings-btn set pointer-events:auto, which a
        child keeps — three invisible buttons at the bottom centre over every channel, the full Idearium iframe's import
        modal ("continue →") included. Closed now means nothing inside it is hit.
      proof: >-
        tests/probe/menu-overlay-hit-chromium.js with the real stylesheets and the browser's own hit test: before the
        fix 2/4 (elementFromPoint at REWIND = rewind-btn while closed), after 4/4.

    BS2_file_states:
      layer: library
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-build-surface.test.js BS2-01
      depends_on: []
      files: [idearium/repo/file-state.js, tests/modules/test-build-surface.test.js]
      does: >-
        fileStates({ files, injects, lastVersion }) → per path: committed · modified (differs from the last Versionium
        version's hash) · new (on disk, in no version) · pending (a proposed inject; a new file that exists only as a
        proposal) · staged (on repo-<uuid>@staging). Pure; the inputs are read by the caller.

    BS3_baseline_deviation:
      layer: library
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-build-surface.test.js BS3-01
      depends_on: [BS2]
      files: [idearium/repo/deviation.js, tests/modules/test-build-surface.test.js]
      does: >-
        deviation({ baseline, current, files }) — how far a repo has moved from its baseline snapshot: files added /
        removed / changed, bytes and lines moved, as fractions of the baseline; and from its last version. isMajor(change)
        decides a major file change (≥ files or ≥ fraction thresholds from config). A record per recalculation with
        provenance (baseline commit, version commit, reason: version | major-change | asked).

    BS4_environment_check:
      layer: library
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-build-surface.test.js BS4-01, BS4-02
      depends_on: []
      files: [cos/testenv/environment.js, tests/modules/test-build-surface.test.js]
      does: >-
        check(repoDir, { files }) — downloaded (every manifest file on disk, hashes match, none missing) and configured
        (per stack: manifest present, dependencies installed — node_modules against the lockfile, a venv, go.sum …),
        with the install commands still to run from detect.plan(). options() — the full catalogue of environment
        options with defaults and bounds: runtimes and versions, extra package sets (EXTRA_PACKAGES), services, network,
        RAM / CPUs / disk, env vars, ports, desktop, test timeouts.

    BS5_spec_to_phasemap:
      layer: library
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-build-surface.test.js BS5-01…BS5-03
      depends_on: []
      files: [idearium/repo/spec-plan.js, tests/modules/test-build-surface.test.js]
      does: >-
        planPrompt({ spec, specPath, axioms }) — what the repo agent is asked: split the whole build of THIS spec into
        phases, chunked, bottom-up by layer (I1), each with does / files / depends_on / proof, carrying the axioms that
        bind it, written as <spec>-phasemap.spec in loom's format. validatePlan(text) — parsed by loom's own
        parsePhasemapText; refused if not bottom-up (I1), if a phase has no layer, or if it names no proof.
        orderPhases(phases) — the build order (layer, then dependencies).

    BS6_build_plan:
      layer: library
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-build-surface.test.js BS6-01
      depends_on: [BS5]
      files: [idearium/repo/build-plan.js, tests/modules/test-build-surface.test.js]
      does: >-
        buildPlan({ phases, runs, events }) — the plan as a projection (I4): ordered steps, each with its gates as
        progress (mapped → snapshot → dispatched → replied → landed → verified → closed), its current gate, and its event
        ledger (the runs and idearium.repo.phase.* events for it, in logical time).

    BS7_api:
      layer: api
      status: DONE 2026-09-29 (0.39.280) — idearium/api/build-surface.js + 11 routes; proof: tests/modules/test-build-surface.test.js BS7-01…BS7-05 (real router, versionium down on purpose)
      depends_on: [BS2, BS3, BS4, BS5, BS6]
      files: [idearium/api/index.js, idearium/api/build-surface.js, idearium/repo/index.js (annotate: environment), idearium/lib/config-core.cjs (repos.deviation_major_files / _fraction), tests/modules/test-build-surface.api.js]
      does: >-
        GET /api/repos/:uuid/files/state · GET|POST /api/repos/:uuid/deviation (recalculate) + recalculation on every
        repo snapshot (a version) and on a major file change · GET /api/repos/:uuid/environment (check + plan + options)
        and POST …/environment/setup (the existing setup job) · POST /api/repos/:uuid/spec/plan (asks the agent for the
        phasemap, BS5) · POST /api/repos/:uuid/spec/build (the next ready phase of that spec's phasemap, through the
        existing phases/build) · GET /api/repos/:uuid/plan (BS6). Each with its CAPS entry.

    BS8_files_ui:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — proof: tests/probe/build-surface-ui-chromium.js 10/10 (real page, real modules and CSS, stub API in the shapes BS7 returns)
      depends_on: [BS7]
      files: [idearium/ui/js/app.js, idearium/ui/js/file-manage.js, idearium/ui/index.html]
      does: >-
        Files tab: pending files greyed (a proposal-only file is listed, greyed, italic), modified / new / staged marked.
        A "Manage" button on the open file: expand · iterate · refactor · rebuild · debug · test · document · explain ·
        review, on the whole file or a line range (picked in the editor or typed), with code-search results attached as
        context, sent to the repo agent as one job (full context by nexus.context.tool, never pasted).

    BS9_spec_and_phase_build_ui:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — proof: tests/probe/build-surface-ui-chromium.js 10/10 (real page, real modules and CSS, stub API in the shapes BS7 returns)
      depends_on: [BS7]
      files: [idearium/ui/js/living-spec.js, idearium/ui/js/phases.js]
      does: >-
        Spec tab: a Build bar on the open spec (James's screenshot) — "plan phases" when it has no phasemap, then its
        phases in build order with ▶ build next / ▶ a phase, and the deviation line. Phases tab: ▶ on every row, not
        only in the detail pane.

    BS10_settings_and_environment_ui:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — proof: tests/probe/build-surface-ui-chromium.js 10/10 (real page, real modules and CSS, stub API in the shapes BS7 returns)
      depends_on: [BS7]
      files: [idearium/ui/js/repo-environment.js, idearium/ui/js/app.js, idearium/ui/settings.html (?embed=1)]
      does: >-
        The repo's Settings tab contains its console view (settings.html?repo=<uuid>&embed=1: no nav, no chrome) and an
        Environment section: the check (downloaded / configured, each item with its reason), the install plan, the
        options catalogue, Set up environment.

    BS11_plan_panel:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — proof: tests/probe/build-surface-ui-chromium.js 10/10 (real page, real modules and CSS, stub API in the shapes BS7 returns)
      depends_on: [BS7, BS9]
      files: [idearium/ui/js/plan-panel.js, idearium/ui/index.html, idearium/ui/js/app.js (Home: #repo-build-start)]
      does: >-
        A plan panel (like Claude Code's): the open repo's build steps, ✓ done / ◌ current / ○ next, a gate bar per
        step, each expandable to its event ledger and activity; live on the repo's events. Also the build-start area:
        one place to begin (pick a spec → plan → build next), on the repo's Home tab.

    # ── added 2026-09-29, James's fourth message (mapped before any of it was built) ─────────────────────────────
    # "always map first, no redundancy, always update the atlas and bump versions when handing back." · "build the theme
    # for idearium sync and ci tab. i don't like when its inconsistent. why claude? set to chatgpt. it hasn't build one
    # line yet. chatgpt had a login prompt, hoping we can automate if that happens. if i delete a code repo, the
    # original needs to know, and i cant remove or click build a replacement. also need to update the copilot atlas
    # immensely to expand it, so i can use it as a user guide. … i told it to visit google.com and it ran the blue
    # command but nothing happened. its meant to be the ais browser …"
    BS13_provider_sovereignty:
      layer: library
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-build-surface-2.test.js BS13-01, BS13-02; test-warp-cascade-provider-fallback 7/7 (WCF-004/006 now pin the new contract)
      depends_on: []
      files: [lib/seam/adapters/warp-cascade.js, idearium/api/index.js (_buildIdentity)]
      does: >-
        Read, not assumed: the code spec's build had no provider (its repo was not found by specUuid, so
        _buildIdentity returned provider null) and warp-cascade then let RAID pick first and fell through
        ollama → chatgpt → claude. A chosen provider (the chunk's, the repo's, or its ORIGINAL's for a code repo) is
        the only browser provider tried — never a fall-through to one nobody chose; ollama stays the local fallback
        only when nothing was chosen. _buildIdentity finds a code spec's original through codeFor / promotedFromSpec and
        otherwise uses lib/repo-agent.js defaultProvider() (chatgpt when guardian has it).
      proof: tests/modules/test-build-surface-2.test.js BS13-*

    BS14_branch_git_honest:
      layer: library
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-cos-workspace.test.js WS-14 (13/13)
      depends_on: []
      files: [cos/workspace/index.js]
      does: >-
        "branch of nexus-id not made (git worktree failed: warning: in the working copy of 'atlas.json', LF will be
        replaced by CRLF …)". The failure text was git's CRLF warnings, cut before the real reason. Every git call the
        workspace makes runs with core.autocrlf=false and core.safecrlf=false (no conversion, no warning), and a failure
        reports git's last error line, not its first warning.
      proof: tests/modules/test-cos-workspace.test.js WS-14

    BS15_code_repo_delete:
      layer: api
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-build-surface-2.test.js BS15-01 (real router)
      depends_on: []
      files: [idearium/api/index.js (repo.archive), lib/repo-hat.js, lib/cos-bridge.js]
      does: >-
        Deleting a code repo tells its original: the document spec's codeSpecUuid is cleared (so Code builds a new one),
        the hat link is removed, a branch's worktree is removed (its git branch kept — nothing lost), and the event
        says which original it was. The response names all of it.
      proof: tests/modules/test-build-surface-2.test.js BS15-*

    BS16_provider_login_wall:
      layer: automation
      status: DONE 2026-09-29 (0.39.280) — proof: tests/probe/login-wall-chromium.js 7/7; chat-stream-chromium 7/7, test-guardian-wake 21/21, test-chat-ledger-stream 16/16 unchanged
      depends_on: []
      files: [guardian/userscript-chat-stream.js (1.1.0), guardian/lib/provider-login.js, guardian/server.js, guardian/lib/dispatcher.js, guardian/userscripts.yaml]
      does: >-
        "chatgpt had a login prompt, hoping we can automate if that happens." The shared chat-stream prelude detects a
        provider's logged-out state (login/sign-up buttons, auth modal, no composer) and its dismissible "stay logged
        out" modal. A dismissible modal is closed automatically; a real login wall is reported to guardian
        (provider.login_required) so the job waits and says why, instead of timing out as "empty response". No
        password is typed by NEXUS: signing in stays the person's (Clear Glass's own password manager can fill it).
      proof: tests/probe/login-wall-chromium.js; tests/modules/test-guardian-wake.js unchanged

    BS17_copilot_browser_verbs:
      layer: automation
      status: DONE 2026-09-29 (0.39.280) — proof: tests/modules/test-cg-copilot-verbs.test.js 6/6 (real CoPilotBridge, fake driver + copilot); clear-glass-agent-surface 16/16 unchanged
      depends_on: []
      files: [clear-glass/src/copilot/verbs.js, clear-glass/src/copilot/bridge.js, clear-glass/renderer/browser.js]
      does: >-
        "i told it to visit google.com and it ran the blue command but nothing happened". _parseCommands dropped a
        ```driver block that was not strict JSON (catch (_) {}), while the pane still said "[driver command sent]".
        Now: a block a small model writes loosely (bare keys, single quotes, a url without https://) is repaired and
        run; one that still cannot be read comes back as a FAILED result with the text, never silence. "visit / go to /
        open <site>" runs navigate itself (no model needed) and answers with what is on the page (title, url, the
        interaction field's first targets). The pane shows which command ran and whether it worked.
      proof: tests/modules/test-cg-copilot-verbs.test.js

    BS18_sync_ci_theme:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — proof: tests/probe/build-surface-ui-chromium.js BS18 (computed styles equal .field-input; 11/11)
      depends_on: []
      files: [idearium/ui/index.html (#repo-subtab-git rules)]
      does: >-
        The Sync & CI tab drawn with the same primitives as every other repo tab (.ds cards, mono labels, action rows,
        the dark tokens) instead of its own light/inline styles.
      proof: tests/probe/build-surface-ui-chromium.js (the tab's computed colours against the shared tokens)

    BS19_copilot_atlas_guide:
      layer: ui
      status: DONE 2026-09-29 (0.39.280) — docs/atlases/copilot-atlas.md "Quick Start — the user guide"; proof: tests/modules/test-nexus-atlas-refs.test.js 51/51 with copilot-atlas.md now held to the strict rule
      depends_on: [BS17]
      files: [docs/atlases/copilot-atlas.md, tests/modules/test-nexus-atlas-refs.test.js]
      does: >-
        The copilot atlas expanded into a user guide: what the co-pilot is (the AI's browser), every way to talk to it
        (panes, backends, /commands), what it can do in Clear Glass (navigate, the interaction field, pointer, spotlight,
        macros, workflows, downloads, ledgers), recipes (job listings: search, open, read, fill, track; freelance
        work through Idearium: a client spec → phases → build → deliver), and what to do when something fails. Every
        code span names a real file.
      proof: tests/modules/test-nexus-atlas-refs.test.js

    BS12_release:
      layer: automation
      status: OPEN
      depends_on: [BS8, BS9, BS10, BS11, BS13, BS14, BS15, BS16, BS17, BS18, BS19]
      files: [lib/version.js, CHANGELOG-0.39.280.md, docs/*-atlas.md, idearium/spec, tests/run-all.js]
      does: >-
        Versions bumped everywhere they persist (§5.4), the changelog, every touched atlas and spec addendum, tests
        registered, regression against 0.39.279, a Versionium record of the release, this map's phases closed with proof.
