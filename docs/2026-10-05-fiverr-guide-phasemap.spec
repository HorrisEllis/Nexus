spec:
  meta:
    name:     fiverr-guide
    roadmap: 'later — separate project (declutter 2026-10-09, James: "okay")'
    version:  1.0.0
    date:     2026-10-05
    release:  0.39.314 (base) → 0.39.315
    uuid:     nexus-fiverr-guide-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    clear-glass (src/autofill, renderer/settings/sections/autofill)
    status:   "MAPPED 2026-10-05; FR1 and FR2 open — paused: James redirected to Fiverr ORDERS (emerge map FV1_client_jobs) before any guide code was written"
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §4.1 UI tested in Clear Glass,
              §1.2 nothing silently fails, §5.12 the UI is disposable.
    origin: >
      James, 2026-10-05: "Can you have like a small enterprise grade tutorial built for fiverr. Like have a beautiful
      popup with a guide, walk me through it." · earlier: "I just want it to write gigs for me. Not automate talking or
      posting. Just write the gigs for me." · "clearglass is meant to help me with jobs".
      The idea and the direction are James's.

  found:
    - >-
      Clear Glass already writes a gig from his profile and one line (src/autofill/gig.js, 0.39.301), holds it to
      Fiverr's limits (LIMITS), previews which field on the open page takes which part and fills them (detectGig /
      fillGig) — never saving, posting or publishing. Settings › Autofill & answers › Fiverr gigs is its panel. What is
      missing is the walk-through: what Fiverr asks for, in what order, why, and which Clear Glass button does each part.
    - >-
      The spotlight (src/page/field.js, driver action spotlight) rings an element by selector, number or box. A field a
      gig preview matches is known only by an in-memory id (el.__cgId, src/dom/archaeology.js) — no attribute — so the
      spotlight cannot ring it yet. Building that touches Clear Glass's driver; mapped as FR2, not done with FR1.
    - >-
      Settings' sections folder is fixed (tests/modules/test-cg-settings-ui-files.test.js: 18 areas, one .js + one .css
      each, every rule scoped to its area). The guide is part of the Autofill area, so its UI lives in that area's files.

  phases:
    FR1_the_guide:
      layer: ui
      systems: [clear-glass]
      value: { score: 4, cost: S, for: [income, daily-use], why: "the gig writer is built; the guide makes it usable end to end by someone who has never sold on Fiverr" }
      status: OPEN
      depends_on: []
      files: [clear-glass/src/autofill/fiverr-guide.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js,
              clear-glass/renderer/settings/sections/autofill.js, clear-glass/renderer/settings/sections/autofill.css]
      does: >-
        A popup guide in Settings › Autofill › Fiverr gigs ("Guide me"), steps on the left with progress, one step at a
        time on the right, Back / Next, the step remembered. The steps and their words live in ONE place
        (src/autofill/fiverr-guide.js, pure — Fiverr's limits read from gig.js LIMITS, never restated), handed to the page
        by a read-only call (autofill:gig:guide). Each step says what Fiverr asks for and why, and offers only the Clear
        Glass actions that already exist: open Fiverr in a tab, write the gig, preview what THIS step's page takes (the
        preview filtered to the step's parts), fill this step. Every step repeats the rule: Clear Glass never saves,
        posts, publishes or messages anyone — that is his click.
      proof: "the guide's steps cover Fiverr's whole path in order, limits come from gig.js, each editor step's parts match gigParts' keys; in Clear Glass the popup walks forward and back, remembers the step, and its actions call the existing autofill calls"
      conditions:
        - { says: "the guide module and the popup", check: { kind: tests, run: "node tests/modules/test-cg-fiverr-guide.test.js" } }

    FR2_show_me_on_the_page:
      layer: library
      systems: [clear-glass]
      value: { score: 3, cost: S, for: [daily-use], why: "the guide could ring the exact box on Fiverr's page it is talking about" }
      status: OPEN — touches Clear Glass's driver; on his word
      depends_on: [FR1_the_guide]
      files: [clear-glass/src/dom/archaeology.js, clear-glass/src/driver/index.js, clear-glass/src/page/field.js]
      does: >-
        "Show me" on a step: the fields the preview matched for this step are ringed with the spotlight on Fiverr's page,
        each labelled with the part it takes. Needs the spotlight to accept a cgId (resolve el.__cgId in the page) — an
        additive driver action, nothing existing changed.
      proof: "on a page with the step's fields, Show me rings each matched field with its label; nothing else changes"
