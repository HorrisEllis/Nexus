spec:
  meta:
    name:     one-roadmap
    version:  1.0.0
    date:     2026-10-09
    release:  0.52.0 (base)
    uuid:     nexus-one-roadmap-phasemap-v1-0000-2026-1009-jamesbrooks-001
    owner:    docs (the phasemaps) · loom/scanners/phasemap-map.js (the census) · idearium (where he sees it)
    status:   "MAPPED 2026-10-09, before building; nothing moved yet"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §0.3 nothing lost (archive, never delete), §3.3 map before build, §16.1 close the nearest gap first, §10.3 one plan, not competing ones
    origin: >
      James, 2026-10-09, after the one-model-engine map and "is this a good idea so far. im alone in this. been me and you
      and my structured intuition": "i have a mentor. he codes. can you get us there. idearium is also meant to hold the
      systems for me. we also need to declutter the roadmap." Before that: "this is getting ovoerwhelming." · "i want
      idearium to be able to do what you do." · "as simple as possible, that anyone can use. but also powerful and
      advanced enough for entire codebases."

  census:   # loom/scanners/phasemap-map.js summary + per-map counts, 2026-10-09, read from the code not estimated
    total:       "1,136 phases in 94 phasemaps across 15 systems: 422 done, 31 in progress, 683 not started"
    maps:        "19 maps fully done; 68 maps with unfinished phases; a handful parse with no phases (older formats)"
    largest_open: >-
      nexus-vision-master 58 open · emerge-field-memory-build 42 · idearium-agent-ready-master 40 · build-from-the-spec 29 ·
      graph-build-context-settings-memory 29 · sovereign-node-architecture 29 · observability-sovereignty-and-agent-mesh 30 ·
      living-model-and-autonomous-pipeline 26 · nex-node-store 26 · cortex-to-intelligence-consolidation 20 · one-model-engine 16
    seen_already: >-
      Fixed by OR1 (0.53.0): 31 phases already marked BUILT / CLOSED / MET in their own maps now count done — the
      roadmap went from 683 open to 653 with no map touched. Still to find: open phases that are really done elsewhere (raid-routing-fidelity RR2 = BR5, found 2026-08-29), open phases that
      repeat each other across maps, and maps whose statuses were never moved — the census counts them all as open.

  the_path:   # the one thing everything else waits for — his words, put in order
    - "1. One engine under every model call (docs/2026-10-09-one-model-engine-phasemap.spec): RAID decides, copilot is the door, one ladder, one learner. ME15 (the docs tell the truth) first."
    - "2. The loop, in Idearium (the next map, named in the one-model-engine map): he throws an idea and they go back and forth in the void → it becomes the spec → the spec is expanded → cut into phases (chunked again if needed) → built. As simple as anyone can use; strong enough for a whole codebase."
    - "3. Idearium holds the systems: NEXUS's sixteen systems are already repos inside Idearium (nexus-self); each one's spec, atlas, phases and roadmap live there, read from one place."

  pushback:
    - >-
      Decluttering is a decision, not a cleanup script. The coder proposes, phase by phase, with the reason; he decides,
      with his mentor if he wants a second pair of eyes. Nothing moves to the shelf or out of the roadmap on the coder's
      say-so alone.
    - >-
      Nothing is deleted (§0.3). A phase that leaves the roadmap goes to the shelf with why, and can come back.
    - >-
      A map is not finished by being decluttered. The census will still show work; the difference is that the path is
      visible and short, and the rest is named as later.

  phases:
    OR0_the_census:
      layer: docs
      status: done
      james: '"we also need to declutter the roadmap."'
      depends_on: []
      files: [docs/2026-10-09-one-roadmap-phasemap.spec]
      does: "Count every phase, open and done, per map, from the roadmap scanner itself."
      proof: "the census above, reproducible with phasemap-map summary() and loadAll()"
    OR1_five_answers_for_an_open_phase:
      layer: library
      status: "DONE (0.53.0) — loom/scanners/phasemap-map.js _answerOf reads the status value's first word in both readers: BUILT · CLOSED · MET · SHIPPED … read done (31 finished phases had been counted open — HG6); SUPERSEDED · RETRACTED · RETIRED · FOLDED · DONE-ELSEWHERE close a phase (closedAs); LATER shelves it (shelf); NOT STARTED still wins; summary() gives roadmap, shelf and closed. test-loom-phasemap-status PS-013. Refusing FOLDED / DONE-ELSEWHERE without a pointer comes with OR3, when they are first written."
      james: '"we also need to declutter the roadmap."'
      depends_on: [OR0]
      files: [loom/scanners/phasemap-map.js]
      does: >-
        Every open phase gets one of five answers, written as its status: PATH (on the path, kept, ordered), LATER
        (the shelf — kept, visible, not counted as roadmap), DONE-ELSEWHERE (built under another phase; names which —
        verified, not assumed), FOLDED (the same work as another open phase; names which), RETIRED (no longer wanted or
        no longer true; says why). The scanner reads them: only PATH counts as the roadmap, LATER as the shelf; the
        others count as closed with their pointer.
      proof: "the census splits into roadmap, shelf and closed; a phase marked FOLDED or DONE-ELSEWHERE without a pointer is refused"
    OR2_how_done_is_checked:   # 2.0 note — what the census taught about checking "done"
      layer: docs
      status: "DONE (0.53.0) — a finding, not code"
      james: '"can you map all of them. see what is done already, or do it as you go?"'
      depends_on: [OR0]
      files: [docs/2026-10-09-one-roadmap-phasemap.spec]
      does: >-
        Tried: matching every open phase's key against the changelogs and version history. It over-reports — changelogs
        name phases when they are MAPPED ("SB10 …" in the 0.39.306 map announcement) as often as when they ship, and
        lib/version.js's one-line history matches nearly any key. So done is checked by reading the phase against the
        code: now for the path maps' phases, one map at a time as each is triaged; for shelf maps, when one comes back
        (§8.6 reuse-before-build already asks it). The one reliable mechanical check — a map's own BUILT / CLOSED words
        — became OR1.
      proof: "the attempt and its false positives (RS1, BR5, SB10) recorded here; OR1's 31"
    OR2_the_proposal:
      layer: docs
      status: "DONE (0.54.1) — map by map (69 decisions, accepted), then phase by phase for every path map, each checked against the code and the version history: 22 path phases kept, the rest shelved; found already built and never marked: idearium-one-surface's 12 (0.47.0–0.48.0; two of them superseded), HG6 (0.53.0), AT2 (edit-atlas.js); duplicates folded across maps. The path, ordered by step: docs/the-path.md — 51 phases (engine 16, the loop 21, Idearium holds the systems 9, this clean-up 5). The roadmap: 49 open, 585 on the shelf, 48 closed. Each answered phase keeps its old status as status_before."
      james: '"can you get us there."'
      depends_on: [OR1]
      files: [docs/roadmap-triage.md]
      does: >-
        The coder reads every open phase (all 683) against the path and the code, and writes one table per map: the
        phase, the proposed answer, one line why, and for DONE-ELSEWHERE / FOLDED the pointer and the evidence. Largest
        maps first. A short, plain page he (and his mentor) can go through map by map.
      proof: "every open phase has a proposed answer with a reason; every DONE-ELSEWHERE names the code or phase that proves it"
    OR3_his_decisions_applied:
      layer: docs
      status: "DONE (0.54.0) — James: \"okay\" (accepting docs/roadmap-triage.md). One line per map, the phases untouched: roadmap: 'later — why' on 48 maps, roadmap: 'folded into <map> — why' on 5; the scanner reads them (PS-014). The roadmap: 188 open phases on the path, 463 on the shelf, 36 closed by the declutter. Reversible: delete the line. Phase-by-phase triage of the path maps, checked against the code, comes next."
      james: '"we also need to declutter the roadmap."'
      depends_on: [OR2]
      files: [docs/*-phasemap.spec]
      does: >-
        Map by map, as he decides: each phase's status set to his answer, with a dated line in the map saying it was the
        declutter and who decided. Maps left with nothing open are marked done; maps wholly on the shelf say so at the top.
      proof: "the census after OR3 shows a roadmap that is only the path, a shelf, and nothing silently dropped"
    OR6_old_code_out:
      layer: library
      status: "PARTIAL (0.54.0) — the first sweep done; the larger part rides each engine and loop phase"
      james: '"okay. and make sure to clean up old code that isnt needed anymore"'
      depends_on: [OR0]
      files: [_archive/2026-10-09-declutter/]
      does: >-
        Old code goes to _archive/ (every scanner skips it; §0.3 — kept, with an ARCHIVED header saying why), never
        deleted. Found by a scan of every code file for any mention of it anywhere (code, HTML, JSON, YAML, scripts):
        55 candidates; a strict re-check (whole file names, a folder's index loaded by its folder name, HTML src=)
        left 34 actually used, 7 tools run by hand, 14 mentioned only by docs or tests. Of those 14, archived now: three
        superseded files — ui/ui-pulse.js (an older copy of ui/pulse.js), ui/pipeline-tutorial.js (the old shell's
        tutorial), scripts/_register-session-hooks.js (a one-shot that has run). NOT old, kept and named for him: his
        built-but-never-wired work — security/e2e-channel.js ("a mistake could cost lives … we need this airtight"),
        guardian/lib/command-registry.js (".command nodes as the source of truth"), ui/consent/consent-gate.js; and
        tested-only modules (genesis-catalog, canvas-intelligence, clear-glass seam watchdog-gates). The finding that
        matters more: NEXUS's clutter is not unused files — it is superseded parallel paths still wired in (eight model
        choosers, three drainers, nested ladders, two copies of specs, two Eravos canvases, two run-all lists). Those
        are retired by the phases that replace them: the rule from here is that a phase that replaces something
        archives the old in the same change, and says so.
      proof: "the three files in _archive with their reasons; atlas reference test 53/53; loom unchanged; the rule written into ME10, ME12 and the loop map"
    OR4_one_roadmap_in_idearium:
      layer: ui
      status: OPEN
      james: '"idearium is also meant to hold the systems for me."'
      depends_on: [OR1]
      files: [idearium/repo/roadmap.js, idearium/ui/js/phases.js]
      does: >-
        Idearium's Phases tab opens on the path: the PATH phases in order across every map, what is next, what is
        building; the shelf one click away; each system's own roadmap under its repo in the nexus repo. Backend, route,
        command, then the screen.
      proof: "driven in Clear Glass: the nexus repo's Phases opens on the path with its next phase; the shelf shows the LATER phases with their reasons"
    OR5_it_stays_decluttered:
      layer: library
      status: OPEN
      james: '"this is getting ovoerwhelming."'
      depends_on: [OR1, OR4]
      files: [loom/scanners/phasemap-map.js, loom/bootstrap.js]
      does: >-
        A new phase must say which step of the path it serves, or it lands on the shelf. Loom's bootstrap prints the
        census (roadmap, shelf, closed) beside its unresolved count, so growth is seen the day it happens.
      proof: "a new map with an unplaced phase shows it on the shelf, said at bootstrap"
