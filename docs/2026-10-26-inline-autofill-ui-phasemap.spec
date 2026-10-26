# Inline autofill UI: a Firefox-style chip under a fillable input, filled from the active profile
# His ask: "need to have a autofill ui for relevant pages. like firefox has, like a autofill button where it shows under the
# input." Focus a fillable input on a real page → a small chip appears under it (the value it would fill) → click, it fills.
# It also fixes the live bug he hit (copilot autofill: "no autofill profile 'null'"): the chip and copilot both fill from the
# ACTIVE profile, so there is never a null profile again.
# MAPPED 2026-10-26 before code (rule 1). REUSE, not new (rule 2): clear-glass already has the matcher (src/autofill/matcher.js
# matchFields → a field's type), the profile store (src/autofill/store.js), the fill path (/cli/autofill/fill + the dom mesh
# src/dom/archaeology.js), and in-page overlay anchoring (renderer/guardian-picker.js positions UI over an element by its
# getBoundingClientRect). The chip composes these; the new part is the per-input chip and the active-profile resolution.

origin:
  date: 2026-10-26
  james: >-
    "need to have a autofill ui for relevant pages. like firefox has, like a autofill button where it shows under the input"
    · (the live bug this also fixes) copilot autofill: "Did not fill: no autofill profile 'null'"
  context: >-
    Found running Nexus live (dogfounding): copilot's "fill this in for me" failed with no profile (null) because it has no
    picker and there is no active-profile concept, and there is no on-page affordance to fill from — you must open Library →
    Autofill. Firefox shows an inline suggestion under the focused field; this brings that to Clear Glass, and makes the fill
    path resolve an active profile so copilot/agents stop passing null.
  reuse_2026_10_26: >-
    src/autofill/matcher.js (matchFields / fieldType), src/autofill/store.js (profiles), src/autofill/learn-pick.js (NOT_TEXT
    exclusions, selector resolution, the per-site learned map), /cli/autofill/fill + /cli/autofill/detect, src/dom/archaeology.js
    (__cgDomMesh field records), renderer/guardian-picker.js (in-page overlay anchored to an element's rect).

decisions:
  AF_D1_inline_chip_active_profile:
    status: DECIDED 2026-10-26 by James — "like firefox … a autofill button where it shows under the input"
    chosen: >-
      A per-input inline chip, anchored under a focused fillable input, shows the value the active profile would fill and fills
      on click (one field, or "fill all" for the page's matched fields). It fills from the ACTIVE profile — the one marked
      default, else the only profile, else the first; if none exists, the chip offers "create a profile" instead of erroring.
      The same active-profile resolution backs copilot/agent autofill, which ends the null-profile bug.

phases:
  AF1_active_profile_and_fill_one:
    status: OPEN
    layer: library
    depends_on: []
    files: [clear-glass/src/autofill/store.js, clear-glass/src/autofill/matcher.js]
    does: >-
      The backend the chip and copilot both need, and the null-profile fix: store.js gains activeProfile() — the profile marked
      default, else the sole one, else the first; setDefault(id); and a clear { ok:false, reason:'no-profile' } when none exists
      (never a null lookup). matcher.js gains matchOne({ selector | fieldKey }) → the fieldType + the value the active profile
      would fill for a single input (reusing matchFields' logic, not a second matcher). Pure where possible, dependency-injected
      (the store/dom passed in) so it is unit-tested without Electron.
    proof: "test-autofill-active.test.js: activeProfile picks default/sole/first and names no-profile cleanly (no null); matchOne returns the type+value for one input, or nothing for a non-fillable one — injected, no backend"

  AF2_route_and_command:
    status: OPEN
    layer: integration
    depends_on: [AF1_active_profile_and_fill_one]
    files: [clear-glass/src/automation/routes.js, lib/agent-tools/tools/clear-glass/autofill.js]
    does: >-
      Serve it: GET /cli/autofill/active (the active profile) + POST /cli/autofill/default {id}; /cli/autofill/fill already fills
      — it now defaults profileId to activeProfile() when none is passed (THE fix: copilot's fill with no profile fills from the
      active one instead of null), and accepts a single `selector` to fill one field. The co-pilot autofill tool passes no
      profile and gets the active one. So a person (the chip), copilot and an agent all fill the same way.
    proof: "a fill with no profileId fills from the active profile (not null); a fill with a selector fills one field; in the autofill route + co-pilot tool tests"

  AF3_the_inline_chip:
    status: OPEN
    layer: ui
    depends_on: [AF1_active_profile_and_fill_one]
    files: [clear-glass/renderer/autofill-inline.js]
    does: >-
      The Firefox-style chip, injected into real pages (the renderer content layer guardian-picker.js already runs in): on a
      fillable input gaining focus, matchOne gives its type + the active profile's value; a small chip is anchored UNDER the
      input by its getBoundingClientRect (the exact positioning guardian-picker uses), showing the value preview and a "fill"
      action (and "fill all" when the page has several matched fields). Click fills via the fill path; Esc/blur/scroll-away
      hides it; it re-anchors on scroll and resize. Only shows on a "relevant page" — one with at least one matched fillable
      field and an active profile (else nothing, or a one-time "set up autofill" hint). No chip on password-manager-owned
      fields (defers to passwords). Tested in Clear Glass (glass.js), never Playwright (AXIOMS §4.1, CG-001b).
    proof: "driven in Clear Glass on a real form: focusing a name/email field shows a chip under it with the value; clicking fills; Esc hides; it re-anchors on scroll; a page with no match or no profile shows no chip; no Playwright"

  AF4_settings_toggle:
    status: OPEN
    layer: ui
    depends_on: [AF2_route_and_command, AF3_the_inline_chip]
    files: [clear-glass/renderer/settings/sections/autofill.js]
    does: >-
      Settings › Autofill: a "Show autofill suggestions on pages" toggle (default on) and a "Default profile" picker (sets the
      active profile AF1 resolves). Per-site off is reused from the site-profile store (site-profile-groups.js already lists
      autofill.profileId per origin), so a site can be excluded.
    proof: "the toggle hides/shows the chip; the default-profile picker sets what activeProfile() returns; a per-site off suppresses the chip on that origin; in Clear Glass"

order: >-
  AF1 first — the active-profile resolution + matchOne; it is the null-profile FIX (copilot/agents stop passing null) and the
  data the chip needs, and it is unit-testable without Electron. AF2 wires the route + command (fill defaults to the active
  profile; one-field fill by selector) so every door fills the same way. AF3 is the Firefox-style inline chip (the UI he asked
  for), anchored under the input by the same rect positioning guardian-picker already uses. AF4 the settings toggle + default
  picker. All but AF1 are Clear Glass UI, verified live on his machine (this container has no Electron). Each phase specced
  again as .phase + .graph (his 2026-10-20); DG2 foresees any crossing.
