spec:

  # ════════════════════════════════════════════════════════════════════════
  # clear-glass/spec/site-data.spec — reset a site, manage its cookies and logins, a full history page, the accessibility widget kept off,
  # and the DOM map injected for the Fiverr fill. Format: emerge's module spec, compiled by lib/emerge/compiler/kg-builder.js at specDepth
  # 1.0, no BLACK node (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-30-site-data-and-fiverr-dom-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════

  meta:
    name:        clear-glass-site-data
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-30T00:00:00Z
    status:      specced
    uuid:        nexus-cg-site-data-spec-v1-0000-2026-1030-jamesbrooks-001
    origin: >-
      James, 2026-10-30, with fiverr.com's seller dashboard still yellow-on-black (Clear Glass's panel: "The page runs UserWay, an accessibility
      widget that keeps its own settings", and six "site's own settings" buttons that were the page's ordinary links) and Chrome's "Clear browsing
      data and cookies" dialog: "the accessability man... need a reset site, and a history manger rebuilt into a full page, and then a cookie
      manager for the logins and a way to clear cookies per site and reset it. continue. fiverr still not working. we need to inject the dom
      mapping tool i feel like." The asks are his; the census, the causes found and the module cut are the coder's.
    purpose: >-
      One place per site to see and reset what Clear Glass and the site keep: cookies (with the ones that hold a login marked), storage, cache,
      service workers, site settings and permissions; reset is a snapshot first, then a clear, so it can be undone. A full page for history. An
      accessibility widget that restyles a site (UserWay on Fiverr) kept off by a per-site switch, and its controls found by what they are, not
      by class names it stamps on everything. For the Fiverr fill, the page's DOM map (the mesh Clear Glass already injects) is read first, so
      each dropdown is known with its options before any step runs.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [reuse-before-build, snapshot-then-change, per-site, evidence-per-step]
    axioms: ["§0.3 nothing lost", "REVERSIBILITY", "§4.3 privacy", "§1.2 nothing fails silently", "§8.6 reuse before build", "§10.3 one truth", "USER_AUTONOMY"]
    deps: []

    census: >-
      Read 2026-10-30 against main 0.60.316. Clear Glass has per-site settings with their keys (src/site-settings/keys.js, gates.timeoutMs and
      gates.settleMs among them), an adblocker with 108,142 rules, a Firefox cookie import, a passwords plugin, history in the ☰ menu, a rewind
      engine, and the DOM mesh (src/dom/archaeology.js DOM_OBSERVER_SCRIPT, with DD1's select-match inside it). A11Y2 (0.60.297) traces a look to
      its cause; on Fiverr it found UserWay and then offered six of the page's own links as "the site's accessibility settings": its matcher
      reads class names (src/page/keyboard-mode.js, the label joins e.className), and UserWay stamps its classes on every element it restyles.
      His machine runs 0.60.297 with another session's unpushed macro-elements work (kept: _archive/imports/2026-10-30-local-clear-glass), so
      DD1 and the 0.60.298-0.60.316 fixes were not on it when he tested Fiverr.

    constraints:
      - id: SD-001
        description: "A reset takes a snapshot of what it clears first; undo restores it. Nothing a reset removes is gone without that record."
        type: hard
        enforced_by: [GATE-SD-SNAPSHOT]
      - id: SD-002
        description: "Cookie and login values never leave the machine and are never shown in full; a login cookie is marked, its value masked."
        type: hard
        enforced_by: [GATE-SD-PRIVACY]
      - id: SD-003
        description: "Every reset, clear and switch is per site and a person's act; nothing is cleared for all sites without saying so first."
        type: hard
        enforced_by: [GATE-SD-PERSON]

  schemas:

    - id: SiteData
      name: SiteData
      description: "What one site keeps in Clear Glass, read for the site page."
      fields:
        origin:       "string — https://www.fiverr.com"
        cookies:      "[{ name, domain, path, expires, httpOnly, secure, sameSite, login: bool, bytes }] — values masked"
        storage:      "{ local: bytes, session: bytes, indexedDB: [name], cacheStorage: [name], serviceWorkers: [scope] }"
        settings:     "object — the site's keys (src/site-settings/keys.js) that differ from their defaults"
        permissions:  "[{ name, state }]"
        thirdParty:   "[{ origin, kind: 'widget'|'tracker'|'cdn', blocked: bool }] — e.g. cdn.userway.org as 'widget'"
        history:      "{ visits: number, first: number, last: number }"
        readAt:       "number"
      behavioral_contracts: ["read only; nothing changes by reading"]
      error_paths: ["a store the session cannot read → that part said as unread, never zero"]

    - id: SiteSnapshot
      name: SiteSnapshot
      description: "What a reset cleared, kept so it can be undone."
      fields:
        id:        "string"
        origin:    "string"
        parts:     "string[] — cookies, storage, cache, serviceWorkers, settings, permissions"
        cookies:   "encrypted blob ref (cos vault) — values never in plain text"
        storage:   "blob ref"
        settings:  "object"
        at:        "number"
        by:        "string"
      behavioral_contracts: ["kept in the vault; deleted only by his act; recorded in Versionium without values (§17.12, secrets redacted)"]
      error_paths: ["the vault locked → the reset waits and says why"]

  interfaces:

    - id: IF-SITE-KEYS
      name: site-keys
      path: clear-glass/src/site-settings/keys.js
      description: "Clear Glass's per-site settings and their key table (gates.timeoutMs, gates.settleMs, accessibility.keepOff …)."
      exports: ["the key table: { key, feature, type, min, max, default, does }"]
      behavioral_contracts: ["a value is validated against its key"]
      error_paths: ["an unknown key → refused, naming it"]

    - id: IF-A11Y-TRACE
      name: a11y-trace
      path: clear-glass/src/page/keyboard-mode.js
      description: "A11Y2's trace: the look, the rules that paint it, their triggers, the widget found, the site's controls."
      exports: ["traceScript", "keepOffScript"]
      behavioral_contracts: ["read only"]
      error_paths: ["stylesheets from other origins unreadable → counted and said"]

    - id: IF-DOM-MESH
      name: dom-mesh
      path: clear-glass/src/dom/archaeology.js
      description: "The DOM mesh injected into the page (DOM_OBSERVER_SCRIPT), with DD1's select-match inside it."
      exports: ["DOM_OBSERVER_SCRIPT", "the mesh's map of elements"]
      behavioral_contracts: ["one matcher for page and tests (select-match's source interpolated)"]
      error_paths: ["the page blocks the script → said, the fill falls back to reading the page"]

  modules:

    - id: MOD-SD-RECONCILE
      name: macro-elements-onto-main
      uuid: nexus-cg-site-data-reconcile-v1-0000-2026-1030-001
      path: clear-glass/spec/macro-elements.spec
      phase: SD0_his_machine_work_onto_main
      description: "His machine-only macro-elements work (log an element from the picker, offer it in the macro editor) reconciled onto main beside DD1, then his machine updated to main."
      deps: []
      schema_refs: [SiteData]
      exports: ["macro-elements on main with its test", "his machine on the current release"]
      gate_pipeline: ["GATE-SD0-001: each changed file merged against main's version, not overwritten", "GATE-SD0-002: its test and DD1's pass together"]
      behavioral_contracts: ["nothing of either side lost (§0.3)"]
      error_paths: ["a conflict the axioms do not settle → shown to him, both sides kept"]
      acceptance: ["macro-elements.test.js and main's suite pass on one tree; his Clear Glass reports the same version as main"]

    - id: MOD-SD-A11Y3
      name: widget-kept-off
      uuid: nexus-cg-site-data-a11y3-v1-0000-2026-1030-001
      path: clear-glass/src/page/keyboard-mode.js
      phase: SD1_the_accessibility_widget_kept_off
      description: >-
        The cause on Fiverr is UserWay. A per-site switch (accessibility.blockWidget) adds a site rule to the adblocker for the widget's origin
        (cdn.userway.org and its kin for the five widgets A11Y2 names), so the widget never loads on that site and its look never applies;
        undo removes the rule. The control matcher stops reading class names: a control is the widget's own button (its known id) or an element
        whose aria-label, title or text names accessibility.
      deps: [{ name: a11y-trace }, { name: site-keys }]
      schema_refs: [SiteData]
      exports: ["site key accessibility.blockWidget", "traceScript: controls without class-name matches"]
      gate_pipeline: ["GATE-SD1-001: switch on → rule added", "GATE-SD1-002: reload → the widget's script absent, the link colours the site's own"]
      behavioral_contracts: ["per site, reversible, his act"]
      error_paths: ["the widget served from the site's own origin → said; keepOff (A11Y2) still applies"]
      acceptance: ["on a fixture page carrying UserWay's classes on ordinary links, no link is offered as a control; with the switch on the widget script is blocked"]

    - id: MOD-SD-RESET
      name: site-reset
      uuid: nexus-cg-site-data-reset-v1-0000-2026-1030-001
      path: clear-glass/src/site-data/reset.js
      phase: SD2_reset_a_site
      description: "Reset a site: choose the parts (cookies, storage, cache, service workers, settings, permissions), a SiteSnapshot is kept, the parts are cleared through Electron's session APIs, the tab reloads; Undo restores the snapshot."
      deps: [{ name: site-keys }]
      schema_refs: [SiteData, SiteSnapshot]
      exports: ["read(origin) → SiteData", "reset(origin, parts, { by }) → SiteSnapshot", "undo(snapshotId, { by })", "IPC + GET/POST /cli/site/:origin(/reset|/undo)", "row `cg site reset <origin>`"]
      gate_pipeline: ["GATE-SD2-001: snapshot first", "GATE-SD2-002: person act", "GATE-SD2-003: read back empty"]
      behavioral_contracts: ["only the chosen origin is touched"]
      error_paths: ["a part that will not clear → said with what remains"]
      acceptance: ["a fixture site's cookies and storage cleared, read back empty, then restored by Undo"]

    - id: MOD-SD-COOKIES
      name: cookie-and-login-manager
      uuid: nexus-cg-site-data-cookies-v1-0000-2026-1030-001
      path: clear-glass/renderer/site-data
      phase: SD3_cookies_and_logins
      description: "A page: every site with its cookies, the ones holding a login marked (and the saved password from the passwords plugin beside it, masked), delete one cookie, clear a site's cookies, sign out of a site, reset it (SD2); imports from Firefox through the existing import."
      deps: [{ name: site-reset }]
      schema_refs: [SiteData]
      exports: ["renderer/site-data/index.html, page.css, page.js", "sections: sites, cookies, logins, reset"]
      gate_pipeline: ["GATE-SD3-001: values masked", "GATE-SD3-002: deletes confirmed"]
      behavioral_contracts: ["no cookie value is ever displayed whole"]
      error_paths: ["the session refuses a delete → shown on that cookie"]
      acceptance: ["in Clear Glass: fiverr.com's login cookies marked; one deleted; the site reset and undone"]

    - id: MOD-SD-HISTORY
      name: history-page
      uuid: nexus-cg-site-data-history-v1-0000-2026-1030-001
      path: clear-glass/renderer/history
      phase: SD4_history_as_a_full_page
      description: "History rebuilt as a full page (today a ☰ menu row): search, filter by site and date, group by day, reopen, delete one, a site's or a range; each site row opens its SD3 page."
      deps: [{ name: cookie-and-login-manager }]
      schema_refs: [SiteData]
      exports: ["renderer/history/index.html, page.css, page.js", "row `cg history [--site] [--since]`"]
      gate_pipeline: ["GATE-SD4-001: deletes confirmed and recorded"]
      behavioral_contracts: ["deleting history never deletes cookies unless he ticks it"]
      error_paths: ["the history store unreadable → said"]
      acceptance: ["in Clear Glass: search finds a Fiverr visit; deleting the site's history leaves its cookies"]

    - id: MOD-SD-DOMMAP
      name: fiverr-dom-map
      uuid: nexus-cg-site-data-dommap-v1-0000-2026-1030-001
      path: clear-glass/src/autofill/gig-pages.js
      phase: SD5_the_dom_map_before_the_fill
      description: >-
        His "inject the dom mapping tool": before a gig fill runs, the DOM mesh is read for the page and every dropdown is located with its
        trigger, its shown text, and (once opened) its options; the fill and its gates target those mapped nodes instead of searching by
        words, and the map is shown in a panel beside the fill so a miss names the node it meant.
      deps: [{ name: dom-mesh }, { name: macro-elements-onto-main }]
      schema_refs: [SiteData]
      exports: ["mapPage(agentId) → { dropdowns: [{ trigger, shown, options? }], fields }", "fill uses map ids"]
      gate_pipeline: ["GATE-SD5-001: map read before the first step", "GATE-SD5-002: each step names its mapped node"]
      behavioral_contracts: ["a part whose node is not in the map is said as not found, with the map's nearest"]
      error_paths: ["the mesh not injected → injected, then read; refused only if the page blocks it, said"]
      acceptance: ["on his Fiverr gig editor (0.60.316+): the category and subcategory dropdowns appear in the map; the fill chooses both, gated"]

  events:
    site_data:
      - "cg.site.reset { origin, parts, snapshot, by } / cg.site.restored { snapshot, by }"
      - "cg.site.widget.blocked { origin, widget, by }"
      - "cg.page.mapped { agentId, dropdowns, fields }"

  enforcement:
    gates:
      - { id: GATE-SD-SNAPSHOT, name: snapshot-first, severity: fatal, check: "no reset without a snapshot", on_failure: "refused" }
      - { id: GATE-SD-PRIVACY, name: values-masked, severity: fatal, check: "no cookie or password value in a page, a log or a record", on_failure: "suite red" }
      - { id: GATE-SD-PERSON, name: person-acts, severity: fatal, check: "resets, clears and switches are his acts, per site", on_failure: "refused" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines; UI in Clear Glass (glass.js), never Playwright"
