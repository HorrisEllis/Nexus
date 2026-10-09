spec:
  meta:
    name:     idea-to-spec-workshop
    version:  1.1.0
    date:     2026-10-05
    release:  0.39.345 (base)
    uuid:     nexus-idea-to-spec-workshop-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium (ideas, the void, the spec workshop, the spec engine's templates)
    status:   "MAPPED 2026-10-05; WK0 built (0.39.345)"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost, §4.1 UI tested in
              Clear Glass.
    origin: >
      James, 2026-10-05 (with screenshots of an idea's lanes and the spec workshop): "should we have the lanes, be hooked
      into gaps, phases? like i want to be able to brainstorm. also the reach. like its meant to use genesis spec. also
      can you make the windows borderless like comportmant desktop for cos. also what about having ai generate the spec
      from the idea, like it feeds all the text input fields for each part of the spec. the spec workshop was supposed
      to use blocks. like enterprise grade, it looks bad. also the spacial void is supposed to feed into the spec
      workshop pipeline, then the spec workshop needs the templates from the quick spec menu. with the ability to edit,
      save, and remove spec templates."
    extends: >-
      Already mapped and open, not repeated here: WS5 the whole workshop (every template block; fractal-graph map), WS6
      parts and modes — REACH leaves the workshop, STRETCHED mode drafts every block (emerge map), UI0 the stations
      agree — REACH out (emerge map). The phases below build on them and say which they close.

  found:
    - >-
      The workshop (idearium/lib/workshop.js, ui/workshop.html) starts a spec with two sections — "the idea" and
      "purpose" — not the template's blocks. The quick spec (createSpecForIdea → the spec engine) does use the blocks and
      specs.default_templates (axioms, architecture, schemas, checklists). Two ways to make a spec, two shapes.
    - >-
      REACH (the 1–5 dial) is still on the workshop. He asked for it gone on 2026-10-02 ("spec workshop, reach sectoin
      needs to be removed"); WS6 and UI0 hold that, open.
    - >-
      The lanes (brainstorm · problem solving · expand · improve · links) are kept per idea; nothing connects them to the
      gap field or to a spec's phases.
    - >-
      The void's → SPEC grounds an idea (POST /api/void/idea/:uuid/spec) and hands it on; whether it lands in the
      workshop with the void's dials and echoes as context is to be checked, not assumed.
    - >-
      Templates: GET /api/spec-engine/templates lists them (idearium/spec-engine/templates/); none can be edited, saved
      or removed from the UI.

  pushback:
    - >-
      "ai generate the spec … feeds all the text input fields": the coder's proposal is that the agent DRAFTS every block
      as a proposal and he accepts — block by block, or all at once with one click. Writing straight into the fields
      would make the spec the agent's, and his rule since the workshop began is that nothing enters without his yes
      (WS6). One click keeps it fast and keeps it his.
    - >-
      "also the reach": read as — the reach dial is the leftover he asked removed; the workshop's blocks come from the
      genesis spec and the templates instead. If he wants the dial kept for the agent's drafts, say so.
    - >-
      Removing a template archives it (templates/_archive, §0.3), never deletes it; a template a spec was made from stays
      readable.
    - >-
      Lane → gap / phase: on his click only ("→ gap", "→ phase"), never automatic — the lanes are his brainstorming.

  phases:
    WK0_pop_out_windows_borderless:
      layer: ui
      status: "DONE (0.39.345) — clear-glass/src/main/compartment-window.js: the workshop, the void, the architect and the spec library open frameless like the COS desktop (each already draws its own title bar); test-compartment-window CW-11."
      james: '"also can you make the windows borderless like comportmant desktop for cos."'
      depends_on: []
      files: [clear-glass/src/main/compartment-window.js]
      does: Every idearium page that pops out and draws its own title bar opens frameless, dark, resizable.
      proof: "the workshop opens with no OS frame or menu and its own minimize / maximize / close"

    WK1_the_workshop_is_blocks_from_the_templates:
      layer: api
      status: "SUPERSEDED (1.1.0) — folded into docs/2026-10-05-spec-workshop-rebuild-phasemap.spec (RS3, RS5, RS6); kept here as the record"
      james: '"the spec workshop was supposed to use blocks." · "like its meant to use genesis spec." · "the spec workshop needs the templates from the quick spec menu."'
      depends_on: []
      closes: [UI0 (REACH out), part of WS5]
      files: [idearium/lib/workshop.js, idearium/ui/workshop.html, idearium/spec-engine/index.js]
      does: >-
        A workshop opens with the blocks of the template(s) he picks — the same list the quick spec uses, the genesis
        spec's blocks by default — his idea in the first block. One shape for a spec, whichever way it was started. The
        reach dial leaves the page.
      proof: "a workshop opened from an idea has every block of the chosen template, the idea's text in its first; the page has no REACH; its saved spec equals the quick spec's shape"

    WK2_templates_edited_saved_removed:
      layer: api
      status: "SUPERSEDED (1.1.0) — folded into docs/2026-10-05-spec-workshop-rebuild-phasemap.spec (RS3, RS5, RS6); kept here as the record"
      james: '"with the ability to edit, save, and remove spec templates."'
      depends_on: [WK1_the_workshop_is_blocks_from_the_templates]
      files: [idearium/spec-engine/templates/, idearium/api/index.js, idearium/ui/workshop.html]
      does: >-
        From the workshop: open a template, edit its blocks, save it (a new version, the old kept), save the workshop's
        current blocks as a new template, remove a template (archived, still readable).
      proof: "a template edited and saved is offered to the next workshop; a removed one is gone from the list and present in _archive"

    WK3_the_agent_drafts_every_block:
      layer: api
      status: "SUPERSEDED (1.1.0) — folded into docs/2026-10-05-spec-workshop-rebuild-phasemap.spec (RS3, RS5, RS6); kept here as the record"
      james: '"what about having ai generate the spec from the idea, like it feeds all the text input fields for each part of the spec."'
      depends_on: [WK1_the_workshop_is_blocks_from_the_templates]
      closes: [WS6 STRETCHED]
      files: [idearium/lib/workshop.js, idearium/ui/workshop.html]
      does: >-
        One button: the agent drafts every block from the idea (with the repo's context when there is one), each draft a
        proposal in its block. Accept a block, edit it, dismiss it — or accept all.
      proof: "from an idea's text alone every block gets a proposal; nothing is in the spec until accepted; accept all fills every block"

    WK4_the_void_feeds_the_workshop:
      layer: api
      status: OPEN
      path: 'step 2 — the void → the workshop, carrying what the back-and-forth found (declutter 2026-10-09)'
      james: '"also the spacial void is supposed to feed into the spec workshop pipeline"'
      depends_on: [WK1_the_workshop_is_blocks_from_the_templates]
      files: [idearium/ui/void.html, idearium/api/index.js, idearium/lib/workshop.js]
      does: >-
        → SPEC in the void opens the workshop on that idea, carrying what the void knows: the idea in his words, the parts
        he kept, the dials it was born at, the echoes — as context for WK3's drafts, never as spec text.
      proof: "→ SPEC opens the workshop with the idea in its first block and the kept parts listed as context"

    WK5_lanes_feed_gaps_and_phases:
      layer: api
      status: OPEN
      path: 'step 2 — the idea''s lanes feed gaps and phases (declutter 2026-10-09)'
      james: '"should we have the lanes, be hooked into gaps, phases? like i want to be able to brainstorm."'
      depends_on: [WK1_the_workshop_is_blocks_from_the_templates]
      files: [idearium/ui/js/app.js, idearium/api/index.js]
      does: >-
        A lane entry can be sent on, on his click: a problem → a gap (in the gap field, the idea as its cause); an
        expansion or an improvement → a phase proposal in the idea's spec (once it has one); a brainstorm line → a new
        idea or a block proposal in the workshop. Each sent entry links back to where it went.
      proof: "a problem-solving entry sent → a gap naming the idea; an expand entry sent → a phase proposal in the spec; nothing is sent without his click"

    WK6_enterprise_grade:
      layer: ui
      status: OPEN
      path: 'step 2 — check first: WS7 (0.39.354) built the full workshop (declutter 2026-10-09)'
      james: '"like enterprise grade, it looks bad."'
      depends_on: [WK3_the_agent_drafts_every_block]
      files: [idearium/ui/workshop.html, idearium/ui/css/void-theme.css]
      does: >-
        The workshop as a working surface: the blocks down the left with each one's state (empty · drafted · accepted),
        how much of the spec is done, the block being written in the middle, its proposal and context on the right;
        capitals, the void theme, no overlaps — driven in Clear Glass, wide and narrow.
      proof: "driven in Clear Glass: every block's state shown, no overlapping text, no console errors"
