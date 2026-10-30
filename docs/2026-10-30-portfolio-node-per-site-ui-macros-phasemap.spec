# The .portfolio node, per-site support, and UI macros
# James, 2026-10-30: "make a .portfolio node, all nodes are physical files in the backend. import and export. and add per site
# support. same with the macros, and pipeline. i also want macros for the ui not just per sire [per site]."
#
# MAPPED 2026-10-30 before code (rule 1). REUSE, not new (rule 2): the node-file + import/export pattern exists three times
# already — .gig and .autofill (clear-glass/src/autofill/gig.js, transfer.js: clearglass.<x>/1 YAML, Clear Glass's own) and
# .macro/.workflow/.pipeline (lib/automation-nodes.js: node-export envelopes). Per-site support exists in
# clear-glass/src/site-settings/keys.js (autofill.profileId, macros.enabled/autoRun, pipelines.enabled). Macros exist
# (schema.macro, the macro tool). So this is four folds onto proven substrate, not new subsystems.
#
# Sovereignty (§5.9/§5.15, read before placement): a portfolio is his autofill/seller CONTENT, so the .portfolio node is Clear
# Glass autofill's (clear-glass/src/autofill/portfolio.js) — like .gig/.autofill, NOT an automation node (those are
# lib/automation-nodes.js). The schema is in the shared registry (lib/node-schemas/schema.portfolio), where schema.macro and
# schema.pipeline live. Per-site keys are Clear Glass's (site-settings). No system reaches into another's files.

origin:
  date: 2026-10-30
  james: >-
    "make a .portfolio node, all nodes are physical files in the backend. import and export. and add per site support. same
    with the macros, and pipeline. i also want macros for the ui not just per sire [per site]."
  context: >-
    After the dropdown fill (DD1, 0.60.298) and choosing "Fill the My Portfolio page" + "Build out my seller profile". He is
    building his Fiverr seller presence and job-hunt materials and wants the portfolio kept as a real, portable file like his
    other nodes, usable per site, and wants macros that also drive Clear Glass's own UI.
  reuse_2026_10_30: >-
    clear-glass/src/autofill/transfer.js (clearglass.autofill/1 YAML, export/parse/import with merge+undo — the closest
    precedent, same author pattern), clear-glass/src/autofill/gig.js (gigFile/gigTemplate: a Clear Glass .gig file), lib/node-
    export.js (wrap/toYaml/fromYaml/validate if the formal envelope is wanted), clear-glass/src/site-settings/keys.js +
    store.js (per-site keys), schema.macro + the macro tool (lib/agent-tools/tools/clear-glass/macro.js), lib/automation-
    nodes.js (macroNode/saveNode/listNodes — the node-file utilities, reused for the macro side).

decisions:
  PF_D1_portfolio_is_clear_glass_autofills:
    status: DECIDED 2026-10-30 by his axioms (§5.15 sovereignty; NC0 schema rule) — to confirm
    chosen: >-
      The .portfolio node is Clear Glass autofill's (clear-glass/src/autofill/portfolio.js), a clearglass.portfolio/1 file like
      .gig/.autofill (YAML a person can read and edit; JSON also loads), carrying a list of portfolio items (projects) and the
      seller-profile fields (headline, bio, skills). schema.portfolio registers the type in lib/node-schemas. It is NOT put in
      lib/automation-nodes (that is automation's — macros/workflows/pipelines); a portfolio is content, not automation. The
      store is a JAA table (cg_portfolio), mirroring AutofillStore.
  PF_D2_ui_macros_reading:
    status: DECIDED 2026-10-30 by the coder's reading of his words — to confirm
    chosen: >-
      "macros for the ui not just per site" reads as: a macro can record and replay actions on CLEAR GLASS'S OWN interface
      (open Library, click a tab, fill a Settings field), not only on a web page in a tab. The coder's reading (to confirm): a
      UI macro targets the renderer's own DOM (the chrome), recorded/replayed through the same macro engine but against the
      Clear Glass window, scoped `ui` instead of a site origin. If he means instead global (not-per-site) page macros, that is
      a smaller change (a macro with no site runs anywhere) — marked to confirm before UM1 is built.

phases:
  PF1_portfolio_node:
    status: OPEN
    layer: library
    depends_on: []
    files: [lib/node-schemas/schema.portfolio, clear-glass/src/autofill/portfolio.js]
    does: >-
      schema.portfolio (the node type: id, name, items[{title, role, description, skills, link, date}], headline, bio, skills,
      site?). clear-glass/src/autofill/portfolio.js — PortfolioStore (JAA cg_portfolio: list/get/create/update/delete the
      items and the seller fields) + exportNode()/parse()/importNode() as a clearglass.portfolio/1 file (YAML; JSON loads),
      import upserting by id with newer-wins and keeping what it replaced (mirroring transfer.js). Pure where possible, store
      injected, so it is unit-tested without Electron.
    proof: "test-portfolio-node.test.js (headless): create items; export → a clearglass.portfolio/1 file; parse back; import round-trips; a bad file is refused with a reason; an edited re-import updates, no duplicate"

  PF2_per_site:
    status: OPEN
    layer: integration
    depends_on: [PF1_portfolio_node]
    files: [clear-glass/src/site-settings/keys.js, clear-glass/src/site-settings/readers.js]
    does: >-
      Per-site support (his "add per site support. same with the macros, and pipeline"): a site-settings key portfolio.id (the
      portfolio used on this site) + portfolio.enabled, with a reader portfolioFor(url) (mirroring autofillFor). Confirm/round
      out macros (macros.enabled, macros.autoRun exist) and pipelines (pipelines.enabled exists) so each has the same shape
      (enabled + the node it uses per site). Nothing new invented where a key already exists; the gap is portfolio's keys.
    proof: "portfolioFor(url) returns { enabled, id } per site; the macro/pipeline per-site keys are present and read the same way; in the site-settings tests"

  PF3_fill_my_portfolio_and_seller_profile:
    status: OPEN
    layer: integration
    depends_on: [PF1_portfolio_node, PF2_per_site]
    files: [clear-glass/src/autofill/gig-pages.js, clear-glass/src/autofill/matcher.js]
    does: >-
      His "Fill the My Portfolio page" + "Build out my seller profile": gig-pages.js learns the Fiverr My Portfolio page
      (SIGNS + PARTS: project title, description, skills, link) and reads values from the portfolio node (valueOf extended, or
      a sibling); the seller profile page's bio/skills/headline fill from the profile via the matcher (its patterns already
      cover headline/summary/skills — add any Fiverr-specific labels found). Page detection is the coder's reading of Fiverr's
      pages, confirmed on his machine with a screenshot (as the gig pages were).
    proof: "gig-pages detects the My Portfolio page and names its parts; the fill reads them from the portfolio node; the seller-profile bio/skills/headline match the profile — matcher/gig-pages tests; live confirm on his machine"

  UM1_ui_macros:
    status: OPEN
    layer: integration
    depends_on: []
    files: [clear-glass/src/driver/index.js, lib/agent-tools/tools/clear-glass/macro.js]
    does: >-
      His "macros for the ui not just per site": a macro scoped `ui` records/replays actions on Clear Glass's own interface
      (the renderer chrome), not only a web page. Reuses the macro engine; the target is the Clear Glass window rather than a
      tab's webContents. NEEDS GROUNDING FIRST (how macros record today, whether the driver can address the chrome) — a
      separate investigation before code; mapped here so it is not lost, PF_D2 reading to confirm.
    proof: "a recorded UI macro replays a Clear Glass UI action (open Library, switch a tab); scoped ui, listed apart from site macros; test TBD after grounding"

  PF_routes_commands_ui:
    status: OPEN
    layer: ui
    depends_on: [PF1_portfolio_node, PF2_per_site]
    files: [clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/renderer/settings/sections/autofill.js]
    does: >-
      His order of delivery (backend → route → command → UI): IPC + /cli routes for the portfolio (list/get/save items,
      export, import, set per site) and a Library/Settings screen (a Portfolio pane beside Autofill: items, Import/Export like
      the .autofill one, the per-site picker). Agents get it through the one command table.
    proof: "the portfolio exports/imports through the route and the command; the Portfolio pane lists items, imports a .portfolio file, sets a per-site portfolio; in Clear Glass (glass.js), never Playwright (CG-001b)"

order: >-
  PF1 first — the .portfolio node (schema + store + import/export), the foundational, headless-testable brick everything else
  reads. PF2 the per-site keys (portfolio's, and rounding out macros/pipeline). PF3 the two fills (My Portfolio from the node,
  seller profile from the profile) — page detection confirmed live. UM1 the UI macros (grounded first, PF_D2 to confirm). Then
  the routes + command + UI (backend-only until that phase — said plainly). Each phase specced again as .phase + .graph (his
  2026-10-20); DG2/DG3 check the DAG. REUSE throughout: transfer.js/gig.js for the node file, site-settings for per-site, the
  macro engine for UI macros, the matcher for the seller profile.
