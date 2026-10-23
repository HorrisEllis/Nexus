spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # site-profile.spec — every Clear Glass feature's per-site settings in one store, read through one resolver; global settings for ClearDriver,
  # Agent Mesh and Guardian; a Processes screen for background tabs and activity.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-23-site-profile-processes-phasemap.spec (`blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        site-profile
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-23T00:00:00Z
    status:      specced
    uuid:        nexus-cg-site-profile-spec-v1-0000-2026-1023-jamesbrooks-001
    origin: >-
      James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
      Cleardriver, agentmesh and guardian setting. Also need a processes screen for background tabs and activity." The features and the
      screen are his; the census, the one-store design (by his axioms) and the contracts are the coder's.
    purpose: >-
      A person (or an agent) sets, for one site, how each Clear Glass feature behaves there — which autofill profile, which macros run on load,
      whether workflows fire, whether passwords are offered and which account signs in, the network route (Snowflake), whether a revisit
      resumes scroll and forms, whether agents may drive it, which agent answers there, and whether Guardian listens. One store, one resolver:
      a site's value, else the global default. Plus the global settings ClearDriver, Agent Mesh and Guardian lacked, and a Processes screen
      that shows every tab, background tab and process with its memory and CPU, the recent activity, and lets him close or end one.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [one-store, one-resolver, reuse-before-build]
    axioms: ["§10.3 one truth layer", "§8.6 reuse before build", "§1.2 nothing fails silently", "§0.3 nothing lost", "USER_AUTONOMY",
      "REVERSIBILITY"]
    deps:
      - { name: electron, version: ">=30", required: true, purpose: "webContents, app.getAppMetrics" }

    census: >-
      Read in the tree 2026-10-23 (clear-glass/): src/site-settings/store.js keys one JAA row per origin (normalizeOrigin, :43); keys used:
      zoomFactor, contentFilter, permission:<name>; the Settings › Sites section (renderer/settings/sections/sites.js) and the toolbar's Site
      Settings popup edit them. Per site already: the password vault and its never list (by origin), netPolicy rules (src/net/policy.js:
      urlPattern / origin / provider / caller, most specific wins), Guardian listeners (urlPattern). Macros and workflows match URL globs only;
      autofill (src/autofill/store.js), rewind (src/rewind/engine.js, keyed by agentId), ClearDriver (src/driver/index.js, timeouts hard-coded
      30 s / 10 s) and the agent mesh (src/mesh/agent-mesh.js, constants) have no per-site state. No Processes screen: ProcessMetrics
      (src/diagnostic/process-metrics.js, app.getAppMetrics) is served only at GET /api/metrics; background tabs only as bgtab:list.

    constraints:
      - id: SP-001
        description: "One store: every per-site value is a key of the site-settings store (one row per origin); no feature keeps a second per-site copy."
        type: hard
        enforced_by: [GATE-SP-ONE-STORE]
      - id: SP-002
        description: "One resolver: a feature reads its per-site value only through siteProfile(url).<feature>, which falls back to the global default and says which applied."
        type: hard
        enforced_by: [GATE-SP-RESOLVER]
      - id: SP-003
        description: "The network route is a netPolicy origin rule (the policy already decides routes per origin); the site profile shows and edits that rule, never a copy."
        type: hard
        enforced_by: [GATE-SP-NET]
      - id: SP-004
        description: "Every key has a schema (type, allowed values, default, what it does); a write outside it is refused with why."
        type: hard
        enforced_by: [GATE-SP-SCHEMA]
      - id: SP-005
        description: "Ending a process or closing a background tab is a person's action, confirmed; an agent may list processes, not end them."
        type: hard
        enforced_by: [GATE-SP-PERSON]

  schemas:

    - id: SiteProfile
      name: SiteProfile
      description: "The resolved view of one site: each feature's settings, each value marked site or default."
      fields:
        origin:     "string — protocol//host (the store's key)"
        autofill:   "{ enabled: bool, profileId: string|null }"
        macros:     "{ enabled: bool, autoRun: string[] (macro ids run when a page of this site loads) }"
        workflows:  "{ enabled: bool } — page.visited workflows fire here or not"
        passwords:  "{ offer: 'ask'|'never', autofill: bool, accountId: string|null (the account that signs in here) }"
        network:    "{ via: 'default'|'direct'|'transport'|'block', rule: string|null (the netPolicy rule's id) }"
        resume:     "{ restore: 'off'|'scroll'|'scroll+forms' } — on a revisit"
        driver:     "{ allowed: bool, navTimeoutMs: number, waitTimeoutMs: number }"
        mesh:       "{ agent: string|null (who answers Co-pilot here), enabled: bool }"
        guardian:   "{ listen: bool, capture: bool }"
        from:       "{ <feature.key>: 'site'|'default' } — where each value came from"
      behavioral_contracts: ["a site with nothing set resolves to the global defaults, each marked default"]
      error_paths: ["a url with no origin (about:blank, data:) → the defaults, origin null"]

    - id: SiteKey
      name: SiteKey
      description: "One per-site key's schema: what it is, its type, allowed values and default, and the feature that reads it."
      fields:
        key:       "string — '<feature>.<name>' (autofill.profileId)"
        feature:   "string — autofill | macros | workflows | passwords | network | resume | driver | mesh | guardian"
        type:      "string — bool | enum | string | string[] | int"
        values:    "string[]|null — for enum"
        min:       "number|null"
        max:       "number|null"
        default:   "any — the global default (read from options where a global setting exists)"
        does:      "string — one line, shown in the Site Settings UI"
      behavioral_contracts: ["the same table drives validation, the UI's controls and the CLI's help"]
      error_paths: ["an unknown key → refused, naming the known keys"]

    - id: ProcessRow
      name: ProcessRow
      description: "One row of the Processes screen: a tab, background tab, provider tab or other process, with its usage."
      fields:
        pid:        "number — the OS process id"
        kind:       "string — tab | background-tab | provider | window | gpu | utility | browser"
        title:      "string|null — the page title (never for a background tab marked private)"
        url:        "string|null"
        origin:     "string|null"
        memoryMB:   "number — working set"
        cpu:        "number — percent, last sample"
        webContentsId: "number|null — what close/end acts on"
        startedAt:  "number|null"
      behavioral_contracts: ["the same pid is one row; its tabs are listed under it"]
      error_paths: ["metrics unavailable → rows without memory/cpu, said"]

    - id: ActivityEvent
      name: ActivityEvent
      description: "One recent thing that happened in Clear Glass, kept in a bounded ring for the Processes screen."
      fields:
        ts:       "number — epoch ms"
        kind:     "string — nav | bgtab.open | bgtab.close | driver | macro | workflow | download | error | process.end"
        origin:   "string|null"
        what:     "string — one line"
        by:       "string — person | agent:<name> | system"
        wcId:     "number|null"
        level:    "string — info | warn | error"
        ref:      "string|null — an id to open (a macro, a download, an error)"
      behavioral_contracts: ["the ring keeps the last 500; nothing is written to disk by it"]
      error_paths: ["an event with no kind → dropped, counted"]

  interfaces:

    - id: IF-SITE-STORE
      name: site-settings-store
      path: clear-glass/src/site-settings/store.js
      description: "The per-origin store (JAA KV cg_site_settings)."
      exports: ["normalizeOrigin(url)", "SiteSettingsStore: get(url, key), getAllForOrigin(url), set(url, key, value), deleteKey(url, key), listOrigins()"]
      behavioral_contracts: ["one row per origin"]
      error_paths: ["a bad url → undefined, never throws"]

    - id: IF-NET-POLICY
      name: net-policy
      path: clear-glass/src/net/policy.js
      description: "Route decision: rules by urlPattern / provider / origin / caller, the most specific wins."
      exports: ["decide(request, policy) → { via, rule }", "rule shape { id, origin?, urlPattern?, via }"]
      behavioral_contracts: ["two equally specific rules that disagree are an error"]
      error_paths: ["no rule → policy.default"]

    - id: IF-OPTIONS
      name: options-store
      path: clear-glass/src/options/store.js
      description: "Global options (JAA KV); set() merges one level; options:changed reaches every window."
      exports: ["get()", "set(partial)", "defaults"]
      behavioral_contracts: ["a key missing from a saved file takes its default"]
      error_paths: ["unknown keys are kept, not dropped"]

    - id: IF-PROCESS-METRICS
      name: process-metrics
      path: clear-glass/src/diagnostic/process-metrics.js
      description: "app.getAppMetrics sampled every 5 s, grouped by type and memory."
      exports: ["ProcessMetrics: sample(), latest()"]
      behavioral_contracts: ["one row per OS process Electron spawned"]
      error_paths: ["no app (a test) → empty"]

    - id: IF-FEATURES
      name: feature-modules
      path: clear-glass/src
      description: "The features that read their per-site value: autofill (src/autofill), macros (lib/agent-tools/tools/clear-glass/macro.js), workflows (src/mesh/automation-engine.js), passwords (src/passwords), accounts (src/accounts), rewind (src/rewind/engine.js), ClearDriver (src/driver/index.js), agent mesh (src/mesh/agent-mesh.js), Guardian listeners (src/options/store.js listeners)."
      exports: ["each feature's existing entry point; this spec adds one read of siteProfile(url) at its decision point"]
      behavioral_contracts: ["a feature with no per-site value behaves exactly as before"]
      error_paths: ["the resolver unavailable → the feature's old behaviour, said once"]

  modules:

    - id: MOD-SP-KEYS
      name: site-keys
      uuid: nexus-cg-site-keys-v1-0000-2026-1023-001
      path: clear-glass/src/site-settings/keys.js
      phase: SP1_one_resolver_for_every_feature
      description: "The table of per-site keys (SiteKey rows) for autofill, macros, workflows, passwords, resume, driver, mesh and guardian; validate(key, value)."
      deps: [{ name: options-store }]
      schema_refs: [SiteKey]
      exports: ["KEYS: SiteKey[]", "validate(key, value) → { ok, value, why }", "byFeature(feature) → SiteKey[]"]
      gate_pipeline: ["GATE-SP1K-001: key known", "GATE-SP1K-002: type/values/min/max", "GATE-SP1K-003: coerced value"]
      behavioral_contracts: ["one table drives validation, the UI and the CLI"]
      error_paths: ["unknown key → { ok:false, why naming the known keys }"]
      acceptance: ["validate('resume.restore', 'scroll') ok; validate('driver.navTimeoutMs', -1) refused with why"]

    - id: MOD-SP-RESOLVER
      name: site-profile
      uuid: nexus-cg-site-profile-v1-0000-2026-1023-001
      path: clear-glass/src/site-settings/profile.js
      phase: SP1_one_resolver_for_every_feature
      description: >-
        siteProfile(url) → SiteProfile: each key's site value from the store, else its global default (options where a global setting exists,
        else the key's default), each marked site or default. setSite(url, key, value) validates and writes the store; clearSite(url, key)
        deletes it. network reads and writes the netPolicy origin rule instead (SP-003). Exposed as IPC site-profile:get/set/clear and
        /cli/site-profile, and to agents through the CLI.
      deps: [{ name: site-settings-store }, { name: site-keys }, { name: options-store }, { name: net-policy }]
      schema_refs: [SiteProfile, SiteKey]
      exports: ["siteProfile(url) → SiteProfile", "setSite(url, key, value, { by }) → { ok, why }", "clearSite(url, key)", "netRoute(url) / setNetRoute(url, via)"]
      gate_pipeline: ["GATE-SP1-001: origin of url", "GATE-SP1-002: per key site value ?? default", "GATE-SP1-003: network from the origin rule", "GATE-SP1-004: from marks"]
      behavioral_contracts: ["no per-site value → the defaults, each marked default", "setNetRoute writes one origin rule, replacing the previous one for that origin"]
      error_paths: ["a write refused by validate → { ok:false, why }", "a conflicting rule in netPolicy → said, not overwritten"]
      acceptance: ["setSite then siteProfile shows the value marked site; clearSite returns it to default", "setNetRoute('https://x.com', 'transport') adds one origin rule; decide() on x.com routes through the transport"]

    - id: MOD-SP-READERS
      name: site-readers
      uuid: nexus-cg-site-readers-v1-0000-2026-1023-001
      path: clear-glass/src/site-settings/readers.js
      phase: SP2_each_feature_reads_its_site_value
      description: >-
        Each feature reads its value at its decision point: autofill uses the site's profile (or none when disabled); a page load runs the
        site's autoRun macros and skips macros when disabled; page.visited workflows are skipped where disabled; the password offer honours
        offer/autofill and the account that signs in; rewind restores scroll / forms on a revisit as set; ClearDriver refuses a site where
        driving is not allowed and uses its timeouts; Co-pilot's agent on this site is the site's mesh agent; Guardian's listeners and chat
        capture are skipped where off. Each read is one call to siteProfile.
      deps: [{ name: site-profile }, { name: feature-modules }]
      schema_refs: [SiteProfile]
      exports: ["the feature hooks: autofillFor(url), macrosOnLoad(url), workflowsAllowed(url), passwordPolicy(url), resumeMode(url), driverPolicy(url), meshAgent(url), guardianPolicy(url)"]
      gate_pipeline: ["GATE-SP2-001: siteProfile(url)", "GATE-SP2-002: the feature's decision"]
      behavioral_contracts: ["unset sites behave as before", "a refusal (driver not allowed) is said to the caller with the site and the setting"]
      error_paths: ["resolver throws → old behaviour, logged once per feature"]
      acceptance: ["driver.allowed false on a site → navigate there refused with why", "macros.autoRun runs the named macro on load", "resume.restore scroll restores the scroll on revisit"]

    - id: MOD-SP-UI
      name: site-settings-ui
      uuid: nexus-cg-site-settings-ui-v1-0000-2026-1023-001
      path: clear-glass/renderer/settings/sections/sites.js
      phase: SP3_the_site_settings_screen
      description: >-
        Settings › Sites and the toolbar's Site Settings popup show a site's profile grouped by feature (Autofill, Macros, Workflows,
        Passwords & account, Network, Resume, ClearDriver, Agent, Guardian), each control drawn from the key table, each value marked
        "this site" or "default" with a reset; the network group edits the origin rule.
      deps: [{ name: site-profile }, { name: site-keys }]
      schema_refs: [SiteProfile, SiteKey]
      exports: ["the Sites section and the popup's per-feature groups"]
      gate_pipeline: ["GATE-SP3-001: GET site-profile", "GATE-SP3-002: controls from KEYS", "GATE-SP3-003: set / clear through IPC"]
      behavioral_contracts: ["controls come from the key table, nothing hand-listed", "a refused write shows its why"]
      error_paths: ["IPC unavailable → read only, said"]
      acceptance: ["tested in Clear Glass: a site's driver set to not allowed shows 'this site', reset returns 'default'"]

    - id: MOD-SP-GLOBAL
      name: global-sections
      uuid: nexus-cg-global-sections-v1-0000-2026-1023-001
      path: clear-glass/renderer/settings/sections/guardian.js
      phase: SP4_cleardriver_mesh_guardian_settings
      description: >-
        Global settings for what had none: ClearDriver (default navigate and wait timeouts, whether agents may drive any site unasked),
        Agent Mesh (drain strategy and backoff, today constants in agent-mesh.js), Guardian (one section: listeners on/off and decay, chat
        capture, the provider host) — options keys driver.*, mesh.*, guardian.*, read by their modules; the per-site keys default to these.
      deps: [{ name: options-store }, { name: feature-modules }]
      schema_refs: [SiteKey]
      exports: ["Settings sections: ClearDriver, Guardian; the mesh part's new controls", "options keys driver.navTimeoutMs, driver.waitTimeoutMs, driver.agentsMayDrive, mesh.drain, mesh.backoffMs, guardian.listen, guardian.capture"]
      gate_pipeline: ["GATE-SP4-001: options defaults", "GATE-SP4-002: modules read them", "GATE-SP4-003: sections edit them"]
      behavioral_contracts: ["the defaults equal today's constants: nothing changes until he changes it"]
      error_paths: ["an out-of-range value → refused by the section, said"]
      acceptance: ["driver.navTimeoutMs 45000 → a navigate waits 45 s", "defaults unchanged behaviour (existing driver tests pass)"]

    - id: MOD-SP-PROCESSES
      name: processes
      uuid: nexus-cg-processes-v1-0000-2026-1023-001
      path: clear-glass/src/processes/index.js
      phase: SP5_processes_and_activity
      description: >-
        list() → ProcessRow[]: app.getAppMetrics joined to every webContents (its OS pid, url, title, the window or background tab or provider
        it belongs to) and the background tabs; activity: a ring of the last 500 ActivityEvents fed by navigation, background tab open/close,
        driver actions, macro and workflow runs, downloads and errors; end(wcId) closes a background tab or ends a tab's renderer (person only,
        confirmed). IPC processes:list/end, activity:recent; /cli/processes (list only for agents).
      deps: [{ name: process-metrics }, { name: feature-modules }]
      schema_refs: [ProcessRow, ActivityEvent]
      exports: ["list() → ProcessRow[]", "activity.push(event)", "activity.recent({ limit, kind, origin }) → ActivityEvent[]", "end(wcId, { by }) → { ok, why }"]
      gate_pipeline: ["GATE-SP5-001: metrics sample", "GATE-SP5-002: join by pid to webContents", "GATE-SP5-003: activity ring", "GATE-SP5-004: end: person only"]
      behavioral_contracts: ["an agent's end is refused (SP-005)", "ending a background tab is a close, said in the activity"]
      error_paths: ["a webContents gone between list and end → 404 with why"]
      acceptance: ["a background tab appears with its memory; closing it from the screen removes it and logs bgtab.close by person"]

    - id: MOD-SP-PROCESSES-UI
      name: processes-ui
      uuid: nexus-cg-processes-ui-v1-0000-2026-1023-001
      path: clear-glass/renderer/processes.html
      phase: SP6_the_processes_screen
      description: >-
        A Processes window (☰ → More tools → Processes, Shift+Esc as Firefox/Chrome): a table of processes and their tabs (kind, site, memory,
        CPU, refreshed every 2 s, sortable), Close / End on a row (confirmed), and the activity feed beside it, filterable by kind and site.
      deps: [{ name: processes }]
      schema_refs: [ProcessRow, ActivityEvent]
      exports: ["renderer/processes.html, the Shift+Esc shortcut, the ☰ menu row"]
      gate_pipeline: ["GATE-SP6-001: processes:list every 2 s", "GATE-SP6-002: activity:recent", "GATE-SP6-003: end confirmed"]
      behavioral_contracts: ["the table updates without losing the sort or the selection"]
      error_paths: ["IPC down → the screen says so"]
      acceptance: ["tested in Clear Glass: rows render with memory, a background tab closes from its row, the feed shows the close"]

  events:
    site:
      - "site-profile.changed { origin, key, value, by }"
      - "processes.ended { wcId, kind, by }"

  enforcement:
    gates:
      - { id: GATE-SP-ONE-STORE, name: one-store, severity: fatal, check: "no new per-site store; every per-site key is a site-settings key", on_failure: "suite red" }
      - { id: GATE-SP-RESOLVER, name: one-resolver, severity: fatal, check: "features read per-site values only through siteProfile", on_failure: "suite red" }
      - { id: GATE-SP-NET, name: net-is-policy, severity: fatal, check: "the network route is a netPolicy origin rule", on_failure: "suite red" }
      - { id: GATE-SP-SCHEMA, name: keys-have-schema, severity: fatal, check: "a write outside KEYS is refused", on_failure: "400" }
      - { id: GATE-SP-PERSON, name: person-ends, severity: fatal, check: "end() refuses an agent", on_failure: "403" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines, the UI ones in Clear Glass"

  # ── ADDENDUM 2026-10-23 (0.60.216, SP2 built) ──────────────────────────────────────────────────────────────────────
  # James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
  # Cleardriver, agentmesh and guardian setting."
  # Built: readers.js (the eight hooks; main installs the resolver once the bridge holds its stores). The decision points:
  #   driver/index.js _navigate and the page-changing actions; passwords/service.js capture / save / autofillLogin (passwords-wiring.js asks it);
  #   autofill/matcher.js detectFields / fillFields; main page.visited and the macros on load (bridge.runMacroAsPerson, page wc:<id>);
  #   copilot/bridge.js send; options/store.js findListenersForUrl; downloads/chat-ledger.js applyDelta.
  # Drift from MOD-SP-READERS, said:
  #   - "rewind restores scroll / forms on a revisit": rewind's snapshots are taken on the driver's navigations at load (scroll 0), so his own
  #     browsing has none. src/rewind/resume.js keeps the place in the page's own origin storage as he leaves it and puts it back on the revisit,
  #     with rewind's own FORM_FIELDS_CAPTURE_JS / RESTORE_JS (never a password field). Reading of "resume state" still to confirm.
  #   - "ClearDriver refuses a site where driving is not allowed": the key reads "agents may drive", so only an agent's call is refused — one
  #     marked by its door (POST /cli/driver, by: 'agent') or on an agent's page (mesh-, ncp-, auto-). His own macros, userscripts and rewind
  #     drive the driver too and are never refused by it.
  #   - mesh.enabled off: Co-pilot still answers, without the page (no DOM, picks or cookies) and says why in the reply's `site`.

  # ── ADDENDUM 2026-10-23 (0.60.217, SP3 built) ──────────────────────────────────────────────────────────────────────
  # James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
  # Cleardriver, agentmesh and guardian setting."
  # Built: renderer/site-profile-groups.js (+ .css), one builder for both screens, its controls from the key table (nothing hand-listed).
  #   - The toolbar's Site Settings popup is now this tab's site: nine groups, each change written at once, a refused value's why on its row,
  #     "All sites…" opens Settings › Sites. It used to list every site's raw stored values; that list is Settings › Sites, nothing lost.
  #   - Settings › Sites: the Edit dialog's Features section, written on Save through ClearGlass.siteProfile (a refusal keeps the dialog open
  #     with its why); feature keys are no longer repeated under "Other stored values".
  #   - Each row: "this site" with ↺, "Settings" (follows the global option) or "default".

  # ── ADDENDUM 2026-10-23 (0.60.218, SP4 built) ──────────────────────────────────────────────────────────────────────
  # James, 2026-10-23: "Cleardriver, agentmesh and guardian setting."
  # Built: options driver { navTimeoutMs 30000, waitTimeoutMs 10000, agentsMayDrive true }, mesh { retriesPerStrategy 2, backoffMs
  # [1000, 3000, 8000, 15000] }, guardian { listen true, capture true } — each default today's constant (SP_D2). Settings › ClearDriver and
  # Settings › Guardian are new; the mesh part of Providers & accounts has "When a task fails". agent-mesh.js reads its drain at each failure.
  # Drift from MOD-SP-GLOBAL, said:
  #   - "mesh.drain, mesh.backoffMs": the drain's strategy order (retry → respawn → fallback → diagnostic) stays fixed; what is set is how many
  #     tries each strategy gets (mesh.retriesPerStrategy) and the wait before each (mesh.backoffMs). A bad value is not used; the constant is.
  #   - Guardian's section also controls listener decay (listenerDecay existed since 0.39.265 with no control). "the provider host" is not in it:
  #     the provider host's controls are the agents hub and Providers & accounts, already.

  # ── ADDENDUM 2026-10-23 (0.60.219, SP5 built) ──────────────────────────────────────────────────────────────────────
  # James, 2026-10-23: "Also need a processes screen for background tabs and activity."
  # Built: src/processes/index.js — list() joins app.getAppMetrics to every webContents by OS pid (a window's own page is the window, the sites
  # in it its tabs, a background tab named with its agentId and memory, the GPU and browser processes with no page); end(wcId, { by }) — the
  # person only (SP_D3): a background tab closed (closeBackgroundTab now says by whom), a site's renderer ended, a Clear Glass window refused
  # (409), a page gone 404; the activity ring (500, memory only) fed by one bus.on('*') — driver actions (not its reads), background tabs,
  # downloads, workflow runs, captured errors — and by a site page's load and his macro runs. IPC processes:list/end, activity:recent;
  # GET /cli/processes, /cli/activity; POST /cli/processes/end answers 403; commands `glass processes`, `glass activity` and (SP1's missing row) `site`.
  # Found on the way and closed by his axioms (USER_AUTONOMY, §5.2 no side door): /cli/site-profile and /cli/invoke reached the keys that
  # limit agents (driver.allowed, mesh.enabled, guardian.listen/capture, network.via), so an agent could lift a limit he set on it. Those
  # keys are now the person's alone (profile.js PERSON_ONLY; site-profile:set/clear denied to /cli/invoke; the command row's personOnly).
