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
    status: BUILT 0.60.257 — store.activeProfile()/setDefault() + matcher.matchOne(); test-autofill-active.test.js 6/6 (no-profile named not null, default/sole/first, setDefault survives reopen, matchOne one-match-or-null). Headless, no Electron.
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
    status: "BUILT 0.60.258 — the fix lands at matcher._siteChoice (every fill/detect path defaults to store.activeProfile; zero profiles → clean noProfile error, never getProfile(null)). So copilot/agents/context-menu/gig/routes all fill from the active profile. test-autofill-fill-active.test.js 4/4; all 10 autofill suites green; backward compatible (minimal stores keep pass-through). NOTE: the actual named routes GET /cli/autofill/active + POST /cli/autofill/default are not yet added — the active-profile DEFAULTING (the real fix) is done; the explicit active/default endpoints can follow with AF4's settings picker."
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
    status: BUILT 0.60.267 — renderer/autofill-inline.js (+ .css), src/autofill/suggest.js, bridge autofill:suggest / fillOne; test-autofill-chips 5/5 in Clear Glass (drift in the 2026-10-28 addendum)
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

  AF5_node_anchors_and_picker_on_confusion:
    status: BUILT 0.60.268 — ⚓ chips + autofill:anchor (learned map / page-memory target), the gig panel's picker on a miss; test-autofill-chips AC-06..08
    layer: ui
    depends_on: [AF3_the_inline_chip]
    files: [clear-glass/src/autofill/suggest.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/renderer/autofill-inline.js, clear-glass/renderer/gig-panel.js]
    does: >-
      His 2026-10-28 "what a node anchor. also have the element picker come up to map the page if confused." Every fillable field the
      chips cannot place gets a ⚓ chip; he says what it is (a profile field type, or a gig part on a Fiverr editor page) and that meaning
      is anchored to the field's stable identity on the site (learn-pick chooseKey → saveLearned; gig parts → page-memory targets), so every
      later fill and chip uses it. When the gig fill cannot place parts, the element picker comes up by itself, one part after another.
    proof: "an unplaced field shows ⚓; anchoring it as email makes its chip offer the profile email and saves the learned key; a gig fill with a missing part starts the picker for it; in Clear Glass"

order: >-
  AF1 first — the active-profile resolution + matchOne; it is the null-profile FIX (copilot/agents stop passing null) and the
  data the chip needs, and it is unit-testable without Electron. AF2 wires the route + command (fill defaults to the active
  profile; one-field fill by selector) so every door fills the same way. AF3 is the Firefox-style inline chip (the UI he asked
  for), anchored under the input by the same rect positioning guardian-picker already uses. AF4 the settings toggle + default
  picker. All but AF1 are Clear Glass UI, verified live on his machine (this container has no Electron). Each phase specced
  again as .phase + .graph (his 2026-10-20); DG2 foresees any crossing.

# ── ADDENDUM 2026-10-28 (0.60.267) — AF3 built; what changed from the map, and the root cause found on the way
# James, 2026-10-28: "fill this in · Did not fill: matchGigFields: domFields must be the dom_query array · needs to autofill any field it can.
# also needs to have the autopill under each input fieled."
# - Root cause of the error: the full page reader (dom/archaeology.js DOM_OBSERVER_SCRIPT) was never injected (inject() had no caller), so
#   every fill depended on the DOM-tree panel having been opened. handleQuery/handleMutate now put it on the page first (_ensure).
# - Drift from AF3 as mapped, decided by his axioms (USER_AUTONOMY, his data stays his; §1.2): the chip is drawn in Clear Glass's own window
#   over the page, not "injected into real pages" — inside the page, a site's scripts could read the suggested profile values before he
#   chose. The page only reports where its fields are.
# - "under each input": every suggested field has a chip, not only the focused one (his 2026-10-28 words); the focused one is brighter.
# - Gig parts are offered too (the gig written in the panel), beside the active profile.
# - AF4 (Settings toggle + default-profile picker) stays OPEN.

# ── ADDENDUM 2026-10-28 — AF5 mapped: node anchors, and the picker when confused
# James, 2026-10-28, after the chips (0.60.267): "what a node anchor. also have the element picker come up to map the page if confused."
# Reading (the coder's; to confirm): "node anchor" = each field (node) on the page anchored to what it means — the chips already show what
# goes in a field they understand; a field they do not understand gets a ⚓ to anchor it once, by its stable identity (JA3's chooseKey), so
# the page is mapped and stays mapped. "if confused" = when a fill cannot place something, the element picker comes up without being asked.
# Built on: learn-pick.js (chooseKey, saveLearned — JA3's identity and save path), page-memory targets (0.60.262), the gig panel's Point at it.

# ── ADDENDUM 2026-10-30 (0.60.298) — DD1: the fill works for dropdowns and checkboxes, not just text
# James, 2026-10-30: "Hook it into the autofill chip. Make sure it works for all elements. Including drop downs. You can use the
# keyboard bindings if needed."
# Root cause: a <select> only changes when the value equals an OPTION's value; a profile holds "United States" but the option
# value is "US", so the bulk fill (fillFields -> handleMutate -> mutate) set nothing. AF6 (0.60.296) made the chip's driver-paced
# single fill choose a dropdown, but the bulk path (Autofill this page, Library Fill, copilot, no-driver chip) had no option match.
# Built (reuse, rule 2): clear-glass/src/dom/select-match.js bestOption()/boolOf() — one source, interpolated into the in-page DOM
# mesh (archaeology.js mutate: <select> selects the matching option, checkbox/radio sets checked, contenteditable sets text, all
# dispatch input+change, no silent wrong pick §1.2) AND required by the chip's fillOne (ipc/bridge.js) so the driver gets the exact
# option text. Keyboard bindings were not needed (native select + events suffices; custom dropdowns stay on AF6's dropdownScript).
# Placement (sovereignty §5.9/§5.15): select-match.js is the DOM mesh's (Clear Glass), beside archaeology.js; no cross-system edge.
# Proof: tests/modules/test-select-match.test.js 7/7; the reconstructed in-page script parses. Live (his machine): a real form's
# country/state/years dropdowns.

# ── ADDENDUM 2026-10-31 (0.60.336) — AC1: the autofill chip shows automatically (a page-level "Autofill this page")
# James, 2026-10-31: "yes, fiverr. autofill and have the chip show automatically, and any money making features clearglass has,"
# Reading (the coder's; §0.1): the per-field ⚡ chips already refresh automatically on dom-ready / in-page nav / stale (autofill-inline.js),
# and there is a right-click "Autofill this page" + the cg.autofill hotkey (browser.js) — but nothing APPEARS on its own to say the page can
# be filled. "have the chip show automatically" = a single page-level affordance (like 1Password/Firefox's key) that comes up by itself
# when the page has fillable fields, fills them all on click, and hides when there is nothing to fill.
# depends_on: [AF3_the_inline_chip]  (reuses its suggest()/draw() and the fill-all path cg.autofill.fill(null, agentId))
# Built (reuse, rule 2): a #af-page pill in Clear Glass's OWN window layer (NOT in the page — sovereignty §5.9/§5.15, same as the chips, so
# a site cannot read the profile), fixed bottom-right of the webview. draw() counts the fields that render a ⚡ chip (a field already
# holding its value has none) and shows "⚡ Autofill N field(s)"; 0 → hidden. Click → cg.autofill.fill(null, agentId) (the same path the
# context menu uses), then refresh(); a no-profile / error answer is said (§1.2), never a silent nothing.
# files: [clear-glass/renderer/autofill-inline.js, clear-glass/renderer/autofill-inline.css]
# Proof: tests/modules/test-autofill-page-chip-glass.test.js — driven in Clear Glass (glass.js, never Playwright CG-001b): with N
# fillable fields the pill shows "N"; filling clears them and hides the pill; all-already-filled shows no pill.
