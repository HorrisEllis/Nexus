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
      Open phases that are really done elsewhere (raid-routing-fidelity RR2 = BR5, found 2026-08-29), open phases that
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
      status: OPEN
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
    OR2_the_proposal:
      layer: docs
      status: "PARTIAL 2026-10-09 — first pass by WHOLE MAP (James: \"most amount of power, and highest leverage, least amount of tokens.\"): docs/roadmap-triage.md — 69 decisions instead of 721 open phases; if accepted the roadmap is 205 open phases on the path (engine 22 · the loop 145 · Idearium holds the systems 38), 485 to the shelf, 31 folded. Phase-by-phase only for path maps, after his answer."
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
      status: OPEN
      james: '"we also need to declutter the roadmap."'
      depends_on: [OR2]
      files: [docs/*-phasemap.spec]
      does: >-
        Map by map, as he decides: each phase's status set to his answer, with a dated line in the map saying it was the
        declutter and who decided. Maps left with nothing open are marked done; maps wholly on the shelf say so at the top.
      proof: "the census after OR3 shows a roadmap that is only the path, a shelf, and nothing silently dropped"
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
