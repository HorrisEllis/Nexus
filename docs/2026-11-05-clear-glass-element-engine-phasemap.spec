# docs/2026-11-05-clear-glass-element-engine-phasemap.spec — ErosmancerOS, the adblocker and the Guardian picker as one element engine.
# Owner: clear-glass. The ask is James's; the readings, the shape and the order are the coder's, decided by his axioms (cited). MAPPED,
# nothing built.

origin: >-
  James, 2026-11-05: "can you integrate erosmanceros, the adblocker, and guardian picker into one? should be a phase for it." · Asked first on
  2026-11-04: "why not have erosmanceros, adblocker and guardian picker migration integration" (no phase was written then; found 2026-11-05).

found_before_mapping: >-
  (§0.1, read 2026-11-05) All three work on a page's elements, each with its own way of naming one:
    - the Guardian picker (clear-glass/renderer/guardian-picker.js, 1,589 lines): a person points at an element and it is chosen. Already
      used by gates (UG5, built 0.60.292) and by autofill when a field is missed (AF5, built 0.60.268). GP0 (rebuild it) is open, waiting on
      what he says is wrong with it.
    - the adblocker (clear-glass/src/adblock/, AB1–AB5 built 0.60.183–184): filter lists, network blocking, and element hiding (## cosmetic
      rules). It has no way to hide an element a person points at.
    - ErosmancerOS (clear-glass/erosmancer/erosmancer-os, TypeScript, its own process started by clear-glass/src/eros/supervisor.js): a
      durable identity for an element (a UUID and seven ways to find it again: backendNodeId, its own data attribute, selectors …), so an
      action still finds it after the page re-renders; and behaviour pacing (ER2).
  What they lack together: the picker's choice is one selector that breaks when the page changes; the adblocker cannot take a pointed-at
  element; ErosmancerOS's identity is used by nothing the person touches.

the_shape: >-
  (the coder's, by the axioms: §8.6 reuse before build, §10.3 one truth) One element engine with three steps, each from the piece that
  already does it: PICK (the picker: a person points) → IDENTIFY (ErosmancerOS: a durable identity instead of one selector) → USE (hide it:
  an adblock ## rule for the site; gate on it; fill it; name it for a macro). One record per chosen element, one panel to pick from.

readings_to_confirm:
  - "\"into one\": (a) one engine and one panel, the three pieces kept as its parts (the coder's reading); (b) one plugin package that
     replaces all three; (c) both, (a) first."

decisions:
  EE_D0_what_one_means:
    status: "DECIDED 2026-11-05 (his) — one plugin, with its parts inside it"
    chosen: >-
      James, 2026-11-05, after the TypeScript edit tool (ES5) was built: "okay this needs to live inside the new plugin also. lets do the
      merge." Read as (c): one plugin now (EE0), the engine's deeper steps (EE1–EE4) inside it after. The coder's reading of "the new plugin"
      as this map's merged plugin, to confirm.
  EE_D1_erosmancer_in_process_or_its_own:
    status: "LEANED (a) 2026-11-05 — his, to confirm: \"maybe its own process?\""
    leaning: >-
      James, 2026-11-05, asked (a) keep ErosmancerOS its own process and add a register / find-again route to it, or (b) port its finder into
      Clear Glass: "maybe its own process?" — the coder's recommendation (a). Built on (a); his "maybe" is kept, so a later (b) is a dated
      addendum, not a reversal of his word.
    unblocked: "the same day ErosmancerOS's own tests run in the coder's sandbox (esbuild's linux binary installed without saving: HostileDetection 15/15), so a change to it is tested here, not only on his PC"
    question: >-
      ErosmancerOS runs as its own TypeScript process today (started with tsx). (a) keep it its own process and reach it by its API (the
      sovereign way: it can be swapped, as his 2026-11-03 rule says); (b) port its selector engine into Clear Glass as JavaScript, in
      process (faster, one less process, but two copies until the TS one is archived). The coder's recommendation: (a).

phases:
  EE0_the_merged_plugin:
    status: "BUILT 0.60.397 — test-cg-element-engine-plugin"
    depends_on: [EE_D0_what_one_means]
    files: [clear-glass/plugins/adblocker/manifest.json, clear-glass/plugins/adblocker/index.js, clear-glass/renderer/shell/extensions.js, clear-glass/src/eros/edit.js, tests/modules/test-cg-element-engine-plugin.test.js, tests/modules/run-all.js]
    does: >-
      The Ad Blocker plugin becomes the Element Engine plugin (3.0.0) — the same id, folder and handlers, so his lists, allowed sites and
      filters stay where they are (nothing lost). Its panel has four parts: Ad blocking (unchanged), Elements (Pick an element: the Guardian
      picker, then the bars it already has — Gate this element, Bind a key), ErosmancerOS (its state, through Clear Glass's own
      /eros-supervisor route), and Edit ErosmancerOS (ES5 in the panel: export, show changes, import with its checks). ErosmancerOS stays its
      own process (EE_D1 not decided; nothing about it moved).
    proof: "the panel's view has the four parts; the adblock part is the same view as before; export, show changes and import answer through the panel; a pick asks the renderer to start the picker"
  EE1_one_identity_for_a_chosen_element:
    status: OPEN
    cut_2026_11_05: >-
      On (a), in two halves: EE1a — ErosmancerOS gains POST /api/nodes/register (a pick's tag, selector, xpath, text and attributes into its
      NodeRegistry: a UUID and a fingerprint) and Clear Glass keeps that UUID with the pick, its gates and its anchors; EE1b — POST
      /api/nodes/:uuid/find (its seven-strategy SelectorEngine over CDP, answering a fresh xpath and selector), and a gate or anchor whose
      xpath no longer matches asks it before failing. EE1b's proof needs a real browser under ErosmancerOS (CDP), run here with the
      pre-installed Chromium.
    depends_on: [EE0_the_merged_plugin, EE_D1_erosmancer_in_process_or_its_own]
    files: [clear-glass/renderer/guardian-picker.js, clear-glass/src/eros/supervisor.js, clear-glass/src/page/element-gate.js, clear-glass/src/schemas/element.schema.json, tests/modules/test-cg-element-engine.test.js]
    does: >-
      An element the picker chooses gets ErosmancerOS's identity (its UUID and its seven ways to find it), stored as one element record
      { uuid, site, label, finders[], made } with a schema. Gates (UG5) and autofill's misses (AF5) keep working, now resolving through the
      identity, so a page that re-renders still finds the element.
    proof: "a picked element is found again after the page replaces its node; a gate made before still passes"
  EE2_hide_what_you_point_at:
    status: "BUILT 0.60.402 — test-cg-element-engine-plugin EP-05"
    recut: >-
      (2026-11-05, the coder's, said) EE2 no longer waits on EE1: the picker already gives each pick a CSS selector, which is what an element
      hiding rule needs, and EE1 waits on his EE_D1 (ErosmancerOS's own process or ported) and on running ErosmancerOS, which cannot run in the
      coder's sandbox (esbuild's binary missing). When EE1 lands, Hide uses the identity's most stable plain-CSS finder.
    depends_on: [EE0_the_merged_plugin]
    files: [clear-glass/plugins/adblocker/index.js, clear-glass/renderer/site-hide/hide-bar.js, clear-glass/renderer/site-hide/hide-bar.css, clear-glass/renderer/browser.js, clear-glass/renderer/browser.html, tests/modules/test-cg-element-engine-plugin.test.js]
    does: >-
      The picker gains Hide: the element becomes a ## cosmetic rule for that site in the adblocker's own user list (the parser it already
      has), shown in the adblock panel with Undo. The rule is the most stable finder that is a plain CSS selector; one that is not is said,
      never guessed.
    proof: "Hide on a page element writes one site##selector rule; the element is hidden on reload; Undo removes the rule"
  EE3_one_panel:
    status: OPEN
    depends_on: [EE2_hide_what_you_point_at]
    files: [clear-glass/renderer/guardian-picker.js, clear-glass/renderer/element-panel.js, clear-glass/renderer/element-panel.css]
    does: >-
      One panel for a chosen element: Hide, Gate on it, Fill it, Name it (for a macro), with the element's identity and where it is used.
      The adblock settings and the picked elements of this site are one click away. Tested in Clear Glass (AXIOMS §4.1).
    proof: "Clear Glass driver: pick an element, Hide it, see it in the site's list, Undo"
  EE4_the_old_ways_archived:
    status: OPEN
    depends_on: [EE3_one_panel]
    files: [clear-glass/renderer/guardian-picker.js, _archive]
    does: "Code paths the engine replaced (the picker's own selector building, duplicate element-naming) moved to _archive with a note (§0.3); nothing removed that is still used."
    proof: "the archived paths have no caller; the whole Clear Glass suite unchanged"

relations: >-
  GP0_guardian_picker_rebuild (2026-10-29 gigs map) stays open: its scope comes from what he says is wrong with the picker, and EE1 is where
  that rebuild lands if his answer is about finding elements again. UG5 and AF5 are built and are kept working by EE1. The adblock map's AB
  phases are built; EE2 adds to the adblocker, it does not replace it.

order: "EE1 → EE2 → EE3 → EE4, after his EE_D0 and EE_D1."
