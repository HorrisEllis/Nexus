# Guided browser — made in the spec workshop (idearium)
# Written 2026-10-10 from docs/2026-10-10-shape-of-nexus-phasemap.spec CG1 CG2 CG3 TU1 SH2 (FN1–FN3 built in 0.59.0). To be
# opened in the workshop (nexus/clear-glass → clear-glass/spec) and built through Idearium. Decisions as choices
# [A] [B] [C] [custom], recommendation marked; "chosen:" open until James picks. Nothing here is built yet.
spec:
  name: Guided browser
  ambition: 3 — outside the box
  source: "map: shape-of-nexus CG1 CG2 CG3 TU1 SH2 · built before it: FN1–FN3 (0.59.0, the field as commands, the nerve)"
  owner: clear-glass (the browser, the field, spotlight, the tutorials) · copilot (the voice of the tutorial, explain-this)
  status: specced 2026-10-10, not built
  james: >-
    "eventually, i want a entire nexus tutorial using copilot, spotlight, in clearglass, with the interaction field. also
    need that fixed at somepoint, like google.com injects over 1000 scripts. i dont know how to use it, or it doesnt work.
    the fiverr tutorial needs to be in the browser.hmtl, all of the browser.js needs to show in the html or consolidate and
    pick a source of truth." · "removes the need to understand code so i dont have to change it"
sections:
  - id: purpose
    title: Purpose
    body: |
      Clear Glass teaches Nexus by showing it: a tutorial engine that highlights the real element (the field's numbered
      targets, spotlight), says what it is and waits for him; the same engine runs the Fiverr flow; anything on a page can
      be pointed at and explained, with the option that governs it offered instead of code.

      Evidence: the field and spotlight exist and are commands now (0.59.0); the field's script is injected per
      web-contents (every frame), the reported "over 1000" on google.com; browser.js is 3,420 lines building most of the
      page as markup strings, browser.html 530 lines; the Fiverr flow lives in autofill/gig.js, not in the browser's page.

  - id: primitives
    title: Primitives
    body: |
      step        (thing)    {target (field selector or name), words, doneWhen, skip} — data, edited like a setting
      tutorial    (thing)    an ordered list of steps, a node in Clear Glass's store
      injection   (thing)    per navigation: top document only, once, guarded (a second is a no-op), counted
      explain     (action)   a target → its node, its system, its options (OP2), what it last did

  - id: build_order
    title: Build order
    body: |
      1 CG1 measure injections per load on google.com, then top-document-only and once per navigation; field on demand
      2 TU1 the tutorial engine (steps as data, spotlight + copilot's words + doneWhen)
      3 SH2 explain this anywhere (point → node, system, options, last act)
      4 CG3 the Fiverr tutorial in the browser, run by TU1's engine
      5 CG2 one source of truth for the browser's UI, one panel at a time, each proven in Clear Glass

      choices — the first tutorial:
        [A] idea → built phase in Idearium (the loop he needs to use)  ← recommended
        [B] Clear Glass itself (tabs, field, accounts)
        [C] the Fiverr gig flow (closest to earning)
        [custom] ____
      chosen: open

      choices — CG2's direction:
        [A] the HTML holds the structure, browser.js only behaviour (the map's choice)  ← recommended
        [B] components rendered from a registry (DS8) — one step further, waits on the design surface
        [C] leave browser.js building markup; a probe only checks every id it reads exists
        [custom] ____
      chosen: open

  - id: tests
    title: Tests
    body: |
      T1 google.com: injections per load reported before and after; after, one per navigation; the field still numbers the page
      T2 a tutorial walks from an idea to a built phase, each highlight on the real element, each step skippable
      T3 pointing at the Plan's "retrying" badge explains it and offers guardian's retry option
      T4 the Fiverr tutorial walks the gig form on the live page
      T5 every element id browser.js reads is in browser.html
