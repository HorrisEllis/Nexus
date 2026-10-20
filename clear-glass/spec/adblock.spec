spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # clear-glass/spec/adblock.spec — a full content blocker for Clear Glass: real filter lists (EasyList, EasyPrivacy, Peter Lowe's,
  # and more) parsed in the Adblock Plus / uBlock syntax, network blocking with exceptions, third-party and resource-type options,
  # element hiding on the page, per-site allow, a blocked count per tab, and its settings one click away in the 🧩 panel.
  # Format: emerge's module spec (specDepth 1.0, no BLACK, invariants valid). Phases: docs/2026-10-21-adblock-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        adblock
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      specced
    uuid:        nexus-cg-adblock-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21: "can you make a full adblocker and make it so i can click on them t ochange their settings." The ask is his.
      The coder's part: the reading of "full" (below, to confirm), the engine and the code.
    readings: >-
      To confirm. "a full adblocker" — what uBlock Origin and Adblock Plus do for a person, not 16 hard-coded domains (the 0.60.x
      plugin): subscribe to the standard filter lists, update them, block requests by those rules with their exceptions and options,
      hide the leftover ad boxes on the page (element hiding), allow a site with one click, show how much was blocked on this page,
      and let him add his own rules. What is NOT in it, said: uBlock's scriptlet injection (##+js), $redirect to neutered resources,
      $csp / $removeparam / $replace and procedural cosmetics (:has-text, :xpath). Rules using them are skipped and counted, never
      half-applied. "click on them to change their settings" — every plugin row in the 🧩 panel opens that plugin's own page
      (spec browser-shell MOD-BSH-PLUGIN-SETTINGS); the adblocker's is the first with real fields.
    purpose: >-
      Pages without ads and trackers, on every window Clear Glass opens, with the lists he chooses and the sites he allows.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [deterministic-first, pure-core-impure-edges, fail-open-for-pages]
    axioms: ["§8.6 reuse (the plugin host's content-filter type, webrequest-adapter.js, site settings' contentFilter=off, the 0.60.x blocklist kept as the offline list)",
      "§1.2 nothing silent (every skipped rule counted by why; a list that fails to download keeps its last copy and says so)",
      "§0.3 nothing lost (the old blocklist is the built-in list; the old pure isBlocked() keeps its contract)",
      "USER_AUTONOMY (which lists, which sites, his own rules)"]
    deps:
      - { name: electron, version: "42.x", required: true, purpose: "session.webRequest.onBeforeRequest, webContents.insertCSS, net.fetch for the lists" }

    constraints:
      - id: ABK-001
        description: "A rule the engine cannot apply exactly (scriptlets, redirects, csp, procedural cosmetics, malformed) is skipped and counted by reason; never applied in part."
        type: hard
        enforced_by: [GATE-ABK-SKIP]
      - id: ABK-002
        description: "An exception (@@) beats a block unless the block is $important; a page on an allowed site is never filtered."
        type: hard
        enforced_by: [GATE-ABK-EXCEPT]
      - id: ABK-003
        description: "The engine is pure: parse and match take strings and return verdicts; files, network and Electron are the edges (lists.js, wiring)."
        type: hard
        enforced_by: [GATE-ABK-PURE]
      - id: ABK-004
        description: "A list that fails to download keeps its last good copy and records the error; the built-in list always loads offline."
        type: hard
        enforced_by: [GATE-ABK-OFFLINE]
      - id: ABK-005
        description: "A main-frame request is only blocked by a rule that names $document; ordinary rules never blank the page he asked for."
        type: hard
        enforced_by: [GATE-ABK-DOC]

  schemas:

    - id: NetworkRule
      name: NetworkRule
      description: "One parsed network filter."
      fields:
        raw:        "string — the line as written"
        exception:  "boolean — @@"
        important:  "boolean — $important"
        host:       "string|null — for ||host^ rules, the host (indexed by host suffix)"
        regex:      "RegExp — the compiled pattern (* wildcards, ^ separator, | anchors, or a /regex/)"
        token:      "string|null — the longest literal token, for the token index"
        types:      "Set<string>|null — Electron resource types it applies to (null = all but mainFrame)"
        notTypes:   "Set<string>|null"
        party:      "'first'|'third'|null"
        domains:    "{ include: string[], exclude: string[] } | null — $domain="
        matchCase:  "boolean"
      behavioral_contracts: ["types are Electron's names: mainFrame subFrame stylesheet script image font object xhr ping media webSocket other"]
      error_paths: ["an unsupported option → not a NetworkRule; the line is counted under skipped[option]"]

    - id: CosmeticRule
      name: CosmeticRule
      description: "One element-hiding rule."
      fields:
        selector:   "string — a CSS selector"
        domains:    "{ include: string[], exclude: string[] } — empty include = generic"
        exception:  "boolean — #@#"
      behavioral_contracts: ["selectors are injected inside :is(), whose forgiving list drops one invalid selector, not the group"]
      error_paths: ["procedural (:has-text, :xpath, :-abp-…, #?#, ##+js, #$#) → skipped and counted"]

    - id: ListState
      name: ListState
      description: "One subscribed list."
      fields:
        id:        "string — easylist | easyprivacy | peter-lowe | ublock | annoyances | cookies | builtin"
        title:     "string"
        url:       "string|null — null for the built-in list"
        on:        "boolean"
        updatedAt: "number|null — ms"
        rules:     "number — network + cosmetic rules applied"
        skipped:   "number"
        error:     "string|null — the last update error, kept with the old copy"
      behavioral_contracts: ["persisted in <userData>/adblock/state.json; the list text in <userData>/adblock/lists/<id>.txt"]
      error_paths: ["unreadable state.json → defaults (EasyList, EasyPrivacy, Peter Lowe's, built-in on), said in the log"]

  interfaces:

    - id: IF-PLUGIN-HOST
      name: plugin-host
      path: clear-glass/src/plugins/host.js
      description: "Registers a plugin's content-filter and settings contributions as Gates on the bus; list() describes each plugin."
      exports: ["PluginHost.install(manifest, module)", "getSignaturesForType(type)", "list()"]
      behavioral_contracts: ["a handler's only channel is its returned event"]
      error_paths: ["a handler that is not exported → PluginHostError at install"]

    - id: IF-WEBREQUEST-ADAPTER
      name: webrequest-adapter
      path: clear-glass/src/plugins/webrequest-adapter.js
      description: "One onBeforeRequest per session: runs __cgPreRequest, the site exemption, then each content-filter signature; first block wins; fails open on timeout."
      exports: ["attachContentFilters(session, bus, { signatures, timeoutMs, exempt })", "_pageUrlOf(details)"]
      behavioral_contracts: ["sends { url, requestId } to each filter (AB3 adds resourceType, pageUrl, tabId)"]
      error_paths: ["no webRequest → throws"]

    - id: IF-SITE-SETTINGS
      name: site-settings
      path: clear-glass/src/site-settings/store.js
      description: "Per-origin settings; contentFilter = 'off' exempts a site from every content filter."
      exports: ["get(url, key)", "set(url, key, value)", "deleteKey(url, key)", "listOrigins()"]
      behavioral_contracts: ["keys are origins"]
      error_paths: ["bad url → undefined / false"]

  modules:

    - id: MOD-ABK-ENGINE
      name: adblock-engine
      uuid: nexus-cg-adblock-engine-v1-0000-2026-1021-001
      path: clear-glass/src/adblock/engine.js
      phase: AB1_engine
      map: docs/2026-10-21-adblock-phasemap.spec
      description: >-
        parseList(text) reads Adblock Plus / uBlock syntax and hosts files: comments and headers dropped; ||host^, |anchors|, * and ^,
        /regex/; @@ exceptions; options $third-party/~third-party (1p, 3p), resource types and their negations (script image
        stylesheet css xmlhttprequest xhr subdocument frame object media font websocket ping other document doc popup), $domain=a|~b,
        $important, $match-case, $all; exception-only $elemhide/$generichide; ##, #@# with domains. Anything else is skipped by name.
        Engine(lists) indexes network rules by host suffix and by their longest literal token, so a request looks at a few dozen rules,
        not 60,000. match({ url, type, pageUrl }) → { block, rule, exception }. cosmetics(pageUrl) → CSS for that page (generic +
        specific − exceptions; none under $elemhide; no generic under $generichide). Third-party is decided on the registrable domain
        (last two labels, three under a known second-level suffix such as co.uk — an approximation, said, not the full PSL).
      deps: []
      schema_refs: [NetworkRule, CosmeticRule]
      exports: ["parseList(text, { source }) → { network: NetworkRule[], cosmetic: CosmeticRule[], skipped: { [why]: n } }", "new Engine() .load(listId, parsed) .unload(listId)", "match({ url, type, pageUrl }) → { block, rule, exception }", "cosmetics(pageUrl) → string css", "siteOf(host) → string"]
      gate_pipeline: ["GATE-ABK-PARSE: line → rule | skip(why)", "GATE-ABK-INDEX: host suffix / token / generic", "GATE-ABK-EXCEPT: important > exception > block", "GATE-ABK-DOC: mainFrame only by $document", "GATE-ABK-COSMETIC: generic + specific − exceptions"]
      behavioral_contracts: ["pure: no fs, no network, no Electron", "deterministic: same lists + request → same verdict", "the 0.60.x isBlocked(url) contract holds over the built-in list"]
      error_paths: ["a malformed URL → { block: false }", "a regex that does not compile → skipped as 'bad-regex'"]
      acceptance: ["||doubleclick.net^ blocks ad.doubleclick.net/x and not notdoubleclick.net", "@@ beats a block; $important beats @@", "$third-party only off-site", "$script only scripts; $~image not images", "$domain=a.com|~b.a.com", "a mainFrame request is not blocked without $document", "##.ad generic, a.com##.x only on a.com, #@# removes it, $elemhide drops all", "##+js and :has-text counted as skipped"]

    - id: MOD-ABK-LISTS
      name: adblock-lists
      uuid: nexus-cg-adblock-lists-v1-0000-2026-1021-001
      path: clear-glass/src/adblock/lists.js
      phase: AB2_lists
      map: docs/2026-10-21-adblock-phasemap.spec
      description: >-
        The catalogue (EasyList, EasyPrivacy, Peter Lowe's, uBlock filters, Fanboy's Annoyances, EasyList Cookie, and the built-in list
        that is the 0.60.x blocklist plus the common trackers), the state (ListState[], his custom rules, on/off), and the store under
        <userData>/adblock. update(id, { fetch }) downloads with the injected fetch, keeps the last copy on failure, records when and what;
        due() lists those older than four days. createService({ dir, fetch, sites }) owns one Engine: load at start, toggles, custom rules,
        allow(url, on) through site settings' contentFilter (one source of truth for allowed sites), stats per tab (count and the last
        rules, reset on a main-frame request).
      deps: [{ name: adblock-engine }, { name: site-settings }]
      schema_refs: [ListState]
      exports: ["CATALOGUE", "createService({ dir, fetch, sites, now }) → service", "service.start() → { lists }", "service.match(req) → verdict (counts per tab)", "service.cosmetics(pageUrl)", "service.state()", "service.setEnabled(on)", "service.setList(id, on)", "service.update(id|'all')", "service.setCustom(text)", "service.allow(url, on)", "service.allowed()", "service.stats(tabId)", "service(): the process's one service"]
      gate_pipeline: ["GATE-ABK-OFFLINE: built-in always; cached copy before network", "GATE-ABK-UPDATE: fetch → parse → swap only on success", "GATE-ABK-ALLOW: site settings contentFilter"]
      behavioral_contracts: ["a failed update leaves the engine as it was", "custom rules are a list of their own ('custom')", "the service is off → match says allow, cosmetics empty"]
      error_paths: ["no fetch (tests, offline) → update reports 'no network', cached lists still load", "state.json unreadable → defaults, logged"]
      acceptance: ["start() with no cache loads the built-in list; update() with a fake fetch loads EasyList text; a failing fetch keeps the old copy and sets error", "allow(url) writes contentFilter=off and match then allows that page"]

    - id: MOD-ABK-WIRING
      name: adblock-wiring
      uuid: nexus-cg-adblock-wiring-v1-0000-2026-1021-001
      path: clear-glass/plugins/adblocker/index.js
      phase: AB3_wiring
      map: docs/2026-10-21-adblock-phasemap.spec
      description: >-
        The plugin keeps its content-filter contribution; its handler asks the service (deterministic, synchronous) instead of the 16-entry
        list. webrequest-adapter.js passes resourceType, pageUrl and tabId (webContentsId) with each request, so third-party, type and
        per-tab counts work. Element hiding: main/index.js inserts service.cosmetics(url) into each page on dom-ready (insertCSS), skipped
        when the site is allowed or the blocker is off. The plugin's new settings contribution (MOD-BSH-PLUGIN-SETTINGS's protocol) returns
        its page: the switch, blocked on this page, allow this site, the lists with their counts and last update, Update now, his rules.
      deps: [{ name: adblock-lists }, { name: plugin-host }, { name: webrequest-adapter }]
      exports: ["filterRequest({ url, requestId, resourceType, pageUrl, tabId }) → webrequest:decision", "settings({ op, key, value, page, requestId }) → plugin:settings", "isBlocked(url) (0.60.x contract)"]
      gate_pipeline: ["GATE-ABK-PURE: plugin → service only", "GATE-ABK-SETTINGS: get | set | action"]
      behavioral_contracts: ["the plugin turned off in the 🧩 panel deregisters the filter (host.disable), as before", "an allowed site gets neither blocking nor hiding"]
      error_paths: ["the service throws → allow (fail open for pages) and the error is counted in the state"]
      acceptance: ["filterRequest blocks a third-party script from an EasyList rule and allows the first-party one", "settings get → fields with lists; set list off → the rule no longer blocks"]

    - id: MOD-ABK-SURFACE
      name: adblock-surface
      uuid: nexus-cg-adblock-surface-v1-0000-2026-1021-001
      path: idearium/cli/route-commands.js
      phase: AB4_surface
      map: docs/2026-10-21-adblock-phasemap.spec
      description: >-
        Order of delivery: the service (backend) → :7702 /cli/adblock/status | lists | update | allow | rules → the `adblock` command row
        (agents have it through nexus.command) and the clear_glass_adblock agent tool → the UI (the 🧩 panel's adblocker page and its
        count badge on the pinned shield).
      deps: [{ name: adblock-lists }]
      exports: ["adblock <status|lists|update [id|all]|on|off|list <id> on|off|allow <site>|disallow <site>>", "clear_glass_adblock({ action, id, site, on })"]
      gate_pipeline: ["GATE-ABK-ROUTE: /cli/adblock/*"]
      behavioral_contracts: ["an agent may read and update lists and allow a site; custom rules are his (person-only)"]
      error_paths: ["Clear Glass not running → ok:false said"]
      acceptance: ["the row builds the right request for each verb", "the tool answers ok:false when :7702 is down"]

    - id: MOD-ABK-IMPORT
      name: adblock-import
      uuid: nexus-cg-adblock-import-v1-0000-2026-1021-002
      path: clear-glass/src/adblock/import.js
      phase: AB5_import
      map: docs/2026-10-21-adblock-phasemap.spec
      description: >-
        James, 2026-10-21, after 0.60.183: "Needs filters. you'll be able to import folders and host lists. Same with the Snowflake plugin."
        Reading, to confirm: his own lists come in beside the catalogue — a filter file, a whole folder of them, a host list (hosts-file
        lines or one domain per line), or a list's URL kept updated. detectFormat(text) tells Adblock Plus syntax, a hosts file and a plain
        domain list apart (a domain list's bare lines become ||host^; in ABP syntax a bare word stays the substring rule it is). sources(paths)
        reads files and folders (folders to two levels, list-like files only: .txt .list .hosts .conf .rules .abp or no extension; at most 200
        files and 20 MB each; anything else is named and skipped). The service keeps each import as its own list (a copy under
        <userData>/adblock/lists, so moving the original loses nothing), with its switch, count, update (re-read the file, or fetch the URL)
        and remove.
      deps: [{ name: adblock-engine }, { name: adblock-lists }]
      exports: ["detectFormat(text) → 'abp'|'hosts'|'domains'", "sources(paths, { fs }) → { files: { path, name, text }[], skipped: { path, why }[] }", "service.importPaths(paths)", "service.addUrl(url, title)", "service.removeList(id)", "/cli/adblock/import { paths | url }", "adblock import <file|folder|url>"]
      gate_pipeline: ["GATE-ABK-IMP-READ: list-like files only, sizes capped", "GATE-ABK-IMP-FORMAT: abp | hosts | domains", "GATE-ABK-IMP-KEEP: a copy kept, its own list"]
      behavioral_contracts: ["an import is a list of its own: on, off, update, remove", "a file that parses to no rule is refused, said"]
      error_paths: ["missing path → skipped with why", "a URL that is not a list → refused like a catalogue list"]
      acceptance: ["a folder with an ABP list, a hosts file, a domain list and a .png → three lists, the image named as skipped", "a domain list blocks sub.example.com", "remove drops its rules", "addUrl downloads and updates like the catalogue"]

  events:
    adblock:
      - "adblock.updated { id, rules, skipped, error }"
      - "adblock.allowed { origin, on }"

  enforcement:
    gates:
      - { id: GATE-ABK-SKIP, name: skips-counted, severity: high, check: "parse returns skipped by reason; no partial rule", on_failure: "build failure" }
      - { id: GATE-ABK-EXCEPT, name: exception-order, severity: fatal, check: "important > exception > block; allowed sites unfiltered", on_failure: "build failure" }
      - { id: GATE-ABK-PURE, name: pure-engine, severity: high, check: "engine.js requires nothing from fs, net or electron", on_failure: "build failure" }
      - { id: GATE-ABK-OFFLINE, name: offline-list, severity: high, check: "built-in list loads with no network; failed update keeps the copy", on_failure: "build failure" }
      - { id: GATE-ABK-DOC, name: page-not-blanked, severity: fatal, check: "mainFrame blocked only by $document", on_failure: "build failure" }
