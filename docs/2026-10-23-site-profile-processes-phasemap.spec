# Clear Glass: per-site settings for every feature, ClearDriver / Agent Mesh / Guardian settings, a Processes screen (2026-10-23)

origin: >-
  James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
  Cleardriver, agentmesh and guardian setting. Also need a processes screen for background tabs and activity." · "Then I want to start working
  on a plugin for something huge." The features are his; the census, the one-store design and the phase cut are the coder's.

status: MAPPED 2026-10-23 — spec clear-glass/spec/site-profile.spec (compiles at full depth).

## Ground truth (census 2026-10-23, in the spec's `census:`)
- One per-origin store exists (src/site-settings/store.js); per site today: zoom, content filtering, permissions, the password never-list,
  netPolicy routes, Guardian listeners. Autofill, rewind, ClearDriver and the mesh have none; macros and workflows match URL globs.
- No Processes screen; the data is at GET /api/metrics and bgtab:list only.

## Readings (the coder's; to confirm where marked)
- "resume state" — a revisit restores where he was on that site (scroll, and forms if he says), from rewind's snapshot. To confirm: whether he
  also means restoring all tabs at start-up (no session restore exists today; SP2 could add it).
- "Cleardriver, agentmesh and guardian setting" — global settings sections for each (none exist for the driver and Guardian), and the
  per-site keys default to them.
- "snowflake" per site — the site's network route (direct / through Snowflake / blocked), which netPolicy already decides per origin.

decisions:
  SP_D1_one_store_one_resolver:
    chosen: "every per-site value is a key of the site-settings store, read through siteProfile(url); the network route stays a netPolicy origin rule"
    by_the_axioms: "§10.3 one truth layer; §8.6 reuse (the store and the policy exist and are per origin)"
  SP_D2_defaults_are_todays_behaviour:
    chosen: "every new key's default is today's behaviour (the driver's 30 s / 10 s, workflows on, offer ask …)"
    by_the_axioms: "REVERSIBILITY; USER_AUTONOMY (nothing changes until he changes it)"
  SP_D3_person_ends_processes:
    chosen: "ending a process or closing a background tab from the Processes screen is a person's action; agents list only"
    by_the_axioms: "USER_AUTONOMY; REVERSIBILITY (an ended renderer loses its page state)"

phases:

  SP1_one_resolver_for_every_feature:
    layer: foundation
    status: BUILT 0.60.215 — keys.js, profile.js, bridge site-profile:* and /cli/site-profile, cg.siteProfile; test-site-profile 3/3
    depends_on: [SP_D1_one_store_one_resolver, SP_D2_defaults_are_todays_behaviour]
    files: [clear-glass/src/site-settings/keys.js, clear-glass/src/site-settings/profile.js, clear-glass/src/site-settings/store.js, clear-glass/src/net/policy.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js]
    spec: clear-glass/spec/site-profile.spec
    blocks: [MOD-SP-KEYS, MOD-SP-RESOLVER]
    does: >-
      The key table and the resolver: siteProfile(url), setSite, clearSite, the network route as a netPolicy origin rule; IPC site-profile:*,
      /cli/site-profile, the preload names.
    proof: set / resolve / clear round trip; a network route written as one origin rule and decided by the policy

  SP2_each_feature_reads_its_site_value:
    layer: integration
    status: OPEN
    depends_on: [SP1_one_resolver_for_every_feature]
    files: [clear-glass/src/site-settings/readers.js, clear-glass/src/autofill/store.js, lib/agent-tools/tools/clear-glass/macro.js, clear-glass/src/mesh/automation-engine.js, clear-glass/src/passwords/service.js, clear-glass/src/rewind/engine.js, clear-glass/src/driver/index.js, clear-glass/src/mesh/agent-mesh.js, clear-glass/src/main/index.js]
    spec: clear-glass/spec/site-profile.spec
    blocks: [MOD-SP-READERS]
    does: >-
      Autofill, macros on load, workflows, password offer and account, resume on revisit, ClearDriver's permission and timeouts, the site's
      Co-pilot agent and Guardian's listening each read their site value at their decision point; unset sites behave as before.
    proof: each feature's acceptance line; the existing suites for those features unchanged

  SP3_the_site_settings_screen:
    layer: ui
    status: OPEN
    depends_on: [SP2_each_feature_reads_its_site_value]
    files: [clear-glass/renderer/settings/sections/sites.js, clear-glass/renderer/browser.js]
    spec: clear-glass/spec/site-profile.spec
    blocks: [MOD-SP-UI]
    does: >-
      Settings › Sites and the toolbar's Site Settings popup show a site's profile by feature, controls from the key table, each value "this
      site" or "default" with a reset.
    proof: in Clear Glass, a site's value set and reset

  SP4_cleardriver_mesh_guardian_settings:
    layer: backend
    status: OPEN
    depends_on: [SP1_one_resolver_for_every_feature]
    files: [clear-glass/src/options/store.js, clear-glass/src/driver/index.js, clear-glass/src/mesh/agent-mesh.js, clear-glass/renderer/settings/sections/guardian.js, clear-glass/renderer/settings/sections/driver.js, clear-glass/renderer/settings.html]
    spec: clear-glass/spec/site-profile.spec
    blocks: [MOD-SP-GLOBAL]
    does: >-
      Options driver.*, mesh.*, guardian.* with today's constants as defaults, read by their modules; Settings sections for ClearDriver and
      Guardian, the mesh part's new controls.
    proof: a changed timeout is used; with defaults, the driver and mesh suites unchanged

  SP5_processes_and_activity:
    layer: backend
    status: OPEN
    depends_on: [SP_D3_person_ends_processes]
    files: [clear-glass/src/processes/index.js, clear-glass/src/diagnostic/process-metrics.js, clear-glass/src/main/index.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js]
    spec: clear-glass/spec/site-profile.spec
    blocks: [MOD-SP-PROCESSES]
    does: >-
      list() joins app.getAppMetrics to every webContents and background tab; an activity ring fed by navigation, background tabs, the driver,
      macros, workflows, downloads and errors; end() for a person; IPC processes:list/end, activity:recent; /cli/processes.
    proof: a background tab listed with its memory; an agent's end refused; a person's close logged

  SP6_the_processes_screen:
    layer: ui
    status: OPEN
    depends_on: [SP5_processes_and_activity]
    files: [clear-glass/renderer/processes.html, clear-glass/renderer/shell/menus.js, clear-glass/src/main/index.js]
    spec: clear-glass/spec/site-profile.spec
    blocks: [MOD-SP-PROCESSES-UI]
    does: >-
      The Processes window (☰ and Shift+Esc): processes and their tabs with memory and CPU every 2 s, Close / End confirmed, the activity feed.
    proof: in Clear Glass, rows render, a background tab closes from its row, the feed shows it
