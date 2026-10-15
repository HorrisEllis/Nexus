# docs/2026-10-15-clear-glass-surfaces-phasemap.spec
# Clear Glass surfaces James asked for on 2026-10-15: a Fiverr portfolio section, one look for every popup, and fewer
# settings sections. MAPPED before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Follows 0.60.52 (toolbar pins live, ChatGPT login click). Nothing below is built.

origin:
  date: 2026-10-15
  james: >-
    "can you hook the competency log to a portfolio section for fiverr? like make a full section for the portfolio. what do you think?"
    · "also can you make all pop ups from clear glass look like this. unless there is a point can you consolidate the provider
    and accounts settings sections in the settings for the settings.html, like id love any aspects of nexus that uses
    clearglass can use a plugin instead. its not vital."
  reading: >-
    The coder's reading (his to correct). Three separate asks. (1) The proof log (docs/PROOF-OF-COMPETENCY.md) becomes a Portfolio
    section in Clear Glass, next to the Fiverr gig panel. (2) Every Clear Glass window that is not the main browser uses the dark
    frame of the Settings window. (3) Settings gets fewer sections; "a plugin instead" is read as: parts of Nexus that only use
    Clear Glass as a screen should plug into it through the plugin host, not live in its core. "its not vital" is taken literally: last.

axioms_consulted:
  - "§0.1/§1.1 evidence over memory: a portfolio item with no pointer to evidence is not shown. -> PF1, PF2"
  - "§0.3 nothing lost: sections that merge keep their old routes until the new one is proven. -> CS3"
  - "§5.9/§5.10 interaction through declared contracts: the portfolio reads the log through one route, not by opening the file from the renderer. -> PF1"
  - "USER_AUTONOMY (docs/CLAUDE.md): nothing is published to Fiverr by Nexus; Publish stays his click. -> PF3"

decisions:
  PF0_internal_vs_client_facing:
    question: The proof log is written for a stranger checking the repo, in the coder's voice, with his quotes. Fiverr buyers want outcomes in plain words.
    coder_recommends: Keep the log as the source and never edit it from the portfolio. A portfolio item is a second record that POINTS at a log entry, holds the client-facing wording, and is dropped if the entry has no evidence.
    chosen: null   # his call
    to_confirm: Whether the AI-coder disclosure line stays on every item. The log says it (the code was written with an AI coder; the ideas and calls are his). Leaving it out of a client-facing page is a claim the log does not make.

phases:
  PF1_read_the_log:
    status: OPEN
    systems: [clear-glass, core]
    files: [docs/PROOF-OF-COMPETENCY.md, clear-glass/src/ipc/bridge.js, idearium/cli/route-commands.js]
    depends_on: []
    does: >-
      A parser turns the log into entries (heading, his quote, context, evidence pointers, the numbers table) and one route,
      /cli/portfolio/entries, serves them. A command row gives every agent the same read. An entry with no evidence line is returned flagged, not hidden.
    proof: "the 4 sections of the current log parse to entries; one with its evidence removed comes back flagged; the numbers table values match the log."

  PF2_the_items:
    status: OPEN
    systems: [clear-glass]
    files: [clear-glass/src/portfolio/store.js, clear-glass/src/ipc/bridge.js]
    depends_on: [PF1_read_the_log, PF0_internal_vs_client_facing]
    does: >-
      A portfolio item: title, one-line outcome, what was built, what he decided (his words, quoted), the skill it shows,
      evidence links, status (draft / ready). Stored in the Clear Glass JAA store (not JSON). Created from a log entry
      (pre-filled, never auto-ready). Export to markdown and to the plain text a Fiverr portfolio field takes.
    proof: "create from an entry, edit, export; an item whose entry loses its evidence is marked stale."

  PF3_the_section:
    status: OPEN
    systems: [clear-glass]
    files: [clear-glass/renderer/library/sections/portfolio.js, clear-glass/renderer/library/sections/portfolio.css, clear-glass/renderer/gig-panel.js]
    depends_on: [PF2_the_items]
    does: >-
      Library -> Portfolio: the numbers strip, the items as cards, an editor, and an "attach to gig" action that hands an item to
      the gig panel (src/autofill/gig.js) so a gig draft can cite real work. Nothing is posted to Fiverr; the open Fiverr
      editor is filled the way the gig panel already does it, and Publish stays his click.
    proof: "a screen test through clear-glass/src/driver/glass.js (never Playwright, AXIOMS 4.1) opens the section, makes an item, exports it."

  CS1_one_popup_frame:
    status: OPEN
    systems: [clear-glass]
    files: [clear-glass/src/main/compartment-window.js, clear-glass/src/providers/host.js, clear-glass/src/accounts/login-portal.js, clear-glass/renderer/settings/settings.css]
    depends_on: []
    does: >-
      One window-options helper (dark background, the Settings title bar, no menu bar) used by every Clear Glass window that is
      not the main browser. Listed first from the code: which windows exist and which already use the Settings frame.
      Windows that load a third-party page (the Google and ChatGPT sign-in) get the frame around the page, not styled
      content, because the page is not Clear Glass's to restyle.
    proof: "a source test lists every `new BrowserWindow` and fails on one that skips the helper without a stated reason. How it looks needs Electron running and is checked there."

  CS2_settings_providers_and_accounts:
    status: OPEN
    systems: [clear-glass]
    files: [clear-glass/renderer/settings/sections/providers.js, clear-glass/renderer/settings/sections/accounts.js, clear-glass/renderer/settings/settings.html]
    depends_on: [CS1_one_popup_frame]
    does: >-
      Read both sections first and say what each holds that the other does not (the 2026-10-15 screenshot shows Accounts &
      sign-in and Library -> Accounts overlapping). Merge only where a setting appears twice. Keep the old section ids as
      redirects for one release (§0.3).
    proof: "every control in the two old sections is found in the merged one or listed as removed with a reason."

  CS3_clear_glass_users_as_plugins:
    status: OPEN
    systems: [clear-glass, core]
    files: [clear-glass/src/plugins/host.js]
    depends_on: [CS2_settings_providers_and_accounts]
    does: >-
      Not vital, per James. Inventory which Nexus features use Clear Glass only as a screen, and which of those could
      register through the plugin host (it already takes toolbar commands). Report; build nothing until he picks.
    proof: "a list of candidates with the host call each would use."

build_order: [PF1_read_the_log, PF2_the_items, PF3_the_section, CS1_one_popup_frame, CS2_settings_providers_and_accounts, CS3_clear_glass_users_as_plugins]
build_order_reason: Portfolio first because he said money is needed badly and Fiverr is his stated chance (2026-10-10). Popups and consolidation are polish; he said the last is not vital.
