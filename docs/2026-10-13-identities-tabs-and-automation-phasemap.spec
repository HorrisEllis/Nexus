spec:
  meta:
    name:     identities-tabs-and-automation
    version:  1.0.0
    date:     2026-10-13
    release:  "0.60.7 (base)"
    uuid:     nexus-identities-tabs-automation-phasemap-v1-0000-2026-1013-jamesbrooks-001
    owner:    "clear-glass (sessions, tabs, cookies, bookmarks, macros, the interaction field) · guardian (account routing by hat/repo/intent) · idearium (a hat's repo model) · cos (a tab as a compartment)"
    status:   "MAPPED 2026-10-13. Done in 0.60.7: ID0 (sign-in seen where he signs in), MC0 (the recorder records the tab), NV0 (the 1342 copies). Done in 0.60.8: CU0 (chat URL reload before escalating), IR0 (intent routing for reasoning). Everything else OPEN. The `found:` facts were read in source this session (file:line), not recalled."
    voice: >-
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost, §1.2 nothing silently fails, §5.2 routing through RAID
    companions: "docs/2026-10-12-browser-providers-and-work-phasemap.spec (TB0–7 background tabs, PV0–6 providers as nodes, MX macros) · docs/2026-10-13-projects-raid-and-gates-phasemap.spec · guardian/lib/account-routing.js (0.60.2) · clear-glass/src/cookies/vault.js"
    origin: >-
      James, 2026-10-13: "continue. need to fix the cookies in clearglass. idearium. in the settings. like its saying its not
      signed in to the account when it is. like can you impliment full cookies. full table based cookies, for all of the
      cookies in clearglass, profiles with identity for account routing, cli commands for it, ability to link to hats that
      way we can contain hats/repos with its own profile, with its own accounts. i want to isolate each tab at the process
      level so we can have each tab can be a different account. like right click the new tab button and have open a new
      identity, or hat. like each tab can be a cos compartment? isolated fed into the event bus? like the cookies aren't
      working. really need to consolidate that and get it flexible as possible, also the bookmarks need to hook into the
      current account/cookie for the current website. all the providers, accounts, etc need to be consolidated into a
      multiaccount setup, incognito tabs also. all cli based, api routes, and the the render.html front end needs to be
      rebuilt if im being honest. also keeps losing connection to chatgpt. gpt goes to get the context, runs tools, and gets
      the response, but this needs to save to the hat so the agent doesn't haave to keep getting context, like it needs to
      build a model of the repo. also the interaction field and nexus nerve doesn't do much. besides inject 1300 scripts.
      notjing beyond that, that i can tell. what about mapping it onto the text of the element so like i want say, open
      images, after a google search, and it would click images with the least amount of depth first. or click the images
      next to videos, or something and it will click it, that could be how automation or macros work even though the record
      button doesn't work. HOTKEYS FOR  MACROS, WHAT ABOUT USING EVENTS OR SNAPSHOTS as automation steps? can you fix the
      macros? i want to also be able to tell clearglass what to do." · then: "maybe only inject onto interactable elements.
      then the copilot can use nexus nerve to understand where its at in relation to the ui using the injected scrips"

  found:   # read in source 2026-10-13, so the phases build on what is there (§8.6)
    - "Every tab in a window is ONE <webview> (renderer/browser.html:203) that reloads per tab (renderer/browser.js:401-453, 'not a multi-webview system'). No BrowserView/WebContentsView anywhere. Tabs are not processes."
    - "That webview has no partition attribute: it browses in the app's DEFAULT session (src/main/index.js:2418-2420). Account windows restore cookies into persist:agent-acct-<id> (main/index.js:2027-2040) and mesh tabs into the host window's persist:mesh-… (mesh/agent-mesh.js:374-379) — sessions the webview never uses. So an 'account window' is not signed in as the account."
    - "Settings → Accounts read only persist:mesh-<provider>-<account> (accounts/login-portal.js:49,95,201) + a vault row written by the 'Save session' button. His sign-ins live in the default session (normal tabs) or persist:ncp-<provider> (provider tabs). Hence 'Not signed in' while signed in. FIXED in 0.60.7 (ID0)."
    - "Cookies: vault.js keeps ENCRYPTED LISTS per agent|account|domain (cookie_snapshots, account_cookies), not one row per cookie. The only cookies.on('changed') (contexts/manager.js:83) watches persist:agent-<id> — the browser.html chrome page, not the webview — so almost nothing is captured automatically."
    - "Identity today = NexusOptions accounts {id,label,agentKeys,sessions,providerAccounts} (options/store.js:295-540). Hats/repos → account exists only for Guardian provider jobs (guardian/lib/account-routing.js, rules on hat/intent/repo). No profile, no incognito, no per-tab identity."
    - "Bookmarks (bookmarks/store.js cg_bookmarks) carry accountId only via linkState(); an account bookmark opens acct-<id>, which (above) is not really that account."
    - "The + button (browser.html:35) has only a left click; no context menu on tabs."
    - "Macro recorder: 'default (window)' resolved by getFocusedWebContents() (driver/index.js:746) — the Settings window — so it recorded settings.html. FIXED in 0.60.7 (MC0)."
    - "1342 scripts: built-in plugins re-created their userscript every boot under a new uuid, saved without name/@match, reloaded as match-all (userscripts/manager.js). FIXED in 0.60.7 (NV0)."
    - "The interaction field (driver field/at/pointer, src/page/field.js) already numbers a page's targets with box, centre and z; it is driven by number or x/y, not by words."

  decisions:
    decision_tab_isolation:
      asked: '"i want to isolate each tab at the process level so we can have each tab can be a different account … like each tab can be a cos compartment?"'
      choices:
        - "[A] one WebContentsView per tab (Electron's own per-tab renderer process), each with the partition of its identity; the tab strip becomes a list of views  ← recommended: real process isolation, what Chrome does"
        - "[B] one <webview> per tab, each with its own partition (smaller change; still a separate guest process per webview)"
        - "[C] keep one webview, swap its partition per tab (no isolation; reloads on every switch — what is broken now)"
      chosen: open
      note: "Either A or B ends the default-session problem at its root: a tab's identity IS its partition. A COS compartment per tab is then a record (id, identity, partition, pid, events) the event bus carries — cheap — rather than a VM."
    decision_cookie_table:
      asked: '"full table based cookies, for all of the cookies in clearglass"'
      choices:
        - "[A] one JAA row per cookie per identity, live (cookies.on('changed') on every identity partition), values sealed with the vault key; the encrypted lists stay as snapshots  ← recommended"
        - "[B] rows of metadata only (name, domain, expiry, identity), values left in Chromium's own store"
      chosen: open
      pushback: "Cookie values are credentials. A table that holds every value is the most valuable file on the machine; [A] seals them and never puts a value in a log, an event, a node or a CLI answer (CK-060)."
    decision_render_rebuild:
      asked: '"the the render.html front end needs to be rebuilt if im being honest"'
      choices:
        - "[A] rebuild browser.html around the tab-as-view model (TB phases below), COS chrome kept (0.60.5 cos-theme.css)  ← recommended, because the tab model changes underneath it anyway"
        - "[B] keep the page; change only the tab strip"
      chosen: open

  phases:
    ID0_signed_in_where_he_signs_in:
      layer: library
      systems: [clear-glass]
      component: clear-glass.accounts.login-portal
      status: "DONE — 0.60.7"
      james: '"its saying its not signed in to the account when it is."'
      files: [clear-glass/src/accounts/login-portal.js, clear-glass/renderer/settings/sections/accounts.js, clear-glass/src/preload/index.js]
      does: >-
        status() also reads the two sessions he really signs in from (a normal tab: the default session; the provider tab:
        persist:ncp-<provider>), only that provider's site's cookies, and says where the sign-in is. The chip reads "Signed in
        in a normal tab — not saved to this account" with one button that takes the sign-in into the account: its vault row
        and its own session (capture from:'default'|'ncp').
      proof: "clear-glass/test/login-portal-elsewhere.test.js"
    ID1_identities:
      layer: library
      systems: [clear-glass, guardian]
      component: clear-glass.identity
      status: "OPEN"
      james: '"profiles with identity for account routing, cli commands for it, ability to link to hats that way we can contain hats/repos with its own profile, with its own accounts."'
      depends_on: [ID0_signed_in_where_he_signs_in]
      files: [clear-glass/src/identity/store.js, clear-glass/src/options/store.js, guardian/lib/account-routing.js]
      does: >-
        An identity = { id, label, partition persist:id-<id>, accounts per site/provider, hats[], repos[], incognito? }. The
        existing NexusOptions accounts become identities' accounts (migrated, nothing lost). account-routing's rules (hat,
        intent, repo → account) resolve to an identity, so a hat or a repo is contained in its own profile with its own
        accounts. Commands: identity list/new/show/link-hat/link-repo/use; routes under /cli/identities; Idearium command rows.
    ID2_every_cookie_a_row:
      layer: library
      systems: [clear-glass]
      component: clear-glass.cookies.table
      status: "OPEN"
      depends_on: [ID1_identities]
      files: [clear-glass/src/cookies/table.js, clear-glass/src/cookies/vault.js]
      does: "Per decision_cookie_table. cookies.on('changed') on every identity's partition writes the row; list/search/export/delete by identity, site, name; the account status reads this table (one source)."
    ID3_bookmarks_carry_the_identity:
      layer: library
      systems: [clear-glass]
      component: clear-glass.bookmarks
      status: "OPEN"
      james: '"the bookmarks need to hook into the current account/cookie for the current website."'
      depends_on: [TB1_tab_is_a_view]
      files: [clear-glass/src/bookmarks/store.js, clear-glass/renderer/browser.js]
      does: "A bookmark saved from a tab records that tab's identity (and the site's account in it); opening it opens a tab in that identity — signed in as it was."
    ID4_incognito:
      layer: library
      systems: [clear-glass]
      component: clear-glass.identity
      status: "OPEN"
      depends_on: [TB1_tab_is_a_view]
      does: "An incognito tab = a non-persist partition, no history, no bookmarks state, no cookie rows; gone when closed."

    TB1_tab_is_a_view:
      layer: library
      systems: [clear-glass, cos]
      component: clear-glass.tabs
      status: "OPEN"
      james: '"i want to isolate each tab at the process level so we can have each tab can be a different account. like right click the new tab button and have open a new identity, or hat. like each tab can be a cos compartment? isolated fed into the event bus?"'
      depends_on: [ID1_identities]
      files: [clear-glass/src/main/index.js, clear-glass/src/tabs/views.js, clear-glass/src/driver/page-resolver.js]
      does: >-
        Per decision_tab_isolation. Each tab: its own view and renderer process, in its identity's partition. A tab is a
        compartment record { tabId, identity, partition, pid, url } on the bus (tab.opened/closed/navigated/identity). The
        driver and page resolver address a tab by tabId — so an agent, a macro and a person each act on a named tab, never
        "whatever is focused".
    TB2_new_tab_menu:
      layer: ui
      systems: [clear-glass]
      component: clear-glass.renderer.browser
      status: "OPEN"
      depends_on: [TB1_tab_is_a_view]
      does: "Right-click + (and a tab): new tab in identity…, new tab as hat…, new incognito tab; the tab shows its identity's colour and name."
    TB3_browser_rebuilt:
      layer: ui
      systems: [clear-glass]
      component: clear-glass.renderer.browser
      status: "OPEN"
      depends_on: [TB1_tab_is_a_view, TB2_new_tab_menu]
      does: "Per decision_render_rebuild. browser.html around the view model; every control a command first (CLI + route), the page only calls them."

    HM0_the_hat_keeps_a_model_of_the_repo:
      layer: library
      systems: [idearium, guardian]
      component: lib.repo-agent
      status: "OPEN"
      james: '"gpt goes to get the context, runs tools, and gets the response, but this needs to save to the hat so the agent doesn''t haave to keep getting context, like it needs to build a model of the repo."'
      files: [lib/repo-agent.js, lib/repo-prompt-blocks.js, lib/context-atlas.js]
      does: >-
        What an agent learned about a repo in a turn (files read, what they do, decisions, its tool results) is written to the
        hat's model of that repo (a node per repo per hat, kept current against the repo's versions — stale entries named by
        the diff). The next turn starts from the model, not from zero; the conversation block (0.60.3) carries it across
        providers.
    HM1_chatgpt_connection_kept:
      layer: library
      systems: [clear-glass, guardian]
      component: clear-glass.providers.host
      status: "OPEN"
      james: '"also keeps losing connection to chatgpt."'
      does: "Find why first (the provider tab's session, its sign-in, the dispatcher's timeouts — logs from his machine needed). Then reconnect without losing the turn."
      gap: "needs a log from his machine: the Guardian dispatcher log and Clear Glass's provider-tab events around a drop"
      found_0_60_8: "One cause found in source: ChatGPT moves a new chat from /c/WEB:… to /c/<id> mid-answer; the page script that held the job went with the old page, and the job ended page_navigated — a person asked for an answer already in the chat. CU0 fixes that one; the log is still wanted for any other."
    CU0_chat_url_reload_before_escalating:
      layer: library
      systems: [clear-glass, guardian]
      component: guardian.dispatch-ladder
      status: "DONE — 0.60.8"
      james: '"can you have the chaturl logged an reused for agents, unless it is blocked. like i want it to reload using the chat url before it escalates."'
      files: [clear-glass/src/mesh/dom-transport.js, clear-glass/src/mesh/page/agent-page.js, clear-glass/src/mesh/agent-mesh.js, guardian/lib/dispatch-ladder.js]
      does: >-
        Each poll records the chat's URL. When the page navigates under a job whose send was pressed, Clear Glass reopens
        that URL once and READS the answer there (adopt: never types); a sign-in or captcha wall is reported as no_login /
        captcha. Guardian's ladder, before it asks a person about a sent job with no answer, asks for that reload once
        (/agent-mesh/read with reload) at the job's chat URL. A job that never reached the chat is never reloaded, so an
        older answer cannot be taken for this one.
      proof: "tests/modules/test-mesh-chat-reload.test.js CR-01–02, LR-01–03; test-mesh-dom-transport 16/16 and test-guardian-dispatch-ladder 18/18 unchanged"
    IR0_intent_routing_for_reasoning:
      layer: library
      systems: [idearium, copilot]
      component: lib.reasoning-route
      status: "DONE — 0.60.8"
      james: '"we need intent routing for the reasoning, for the complex tasks, i feel that is priority, do you?" · "only if its a good idea. i just want it to be able to use clearglass."'
      files: [lib/reasoning-route.js, lib/repo-agent.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/code-surface.js, idearium/ui/js/app.js]
      does: >-
        The join between what existed: intent-classifier (RAID's entry gate) and deterministic signals (reasoning words,
        length, several asks, code/stack traces, files) rate a chat request simple / moderate / complex. Complex goes to the
        model door as kind agent:reason with the reasoning agent preferred (routing.reasoner, else routing.planner, never
        Ollama), so the door learns per kind which provider reasons best; outcomes are reported under that kind. Builds
        unchanged (they already plan first). routing.reason_route: off turns it off. route assess <words> shows the call.
      next: "the reasoning agent works through Clear Glass tabs (NV1/NV2) — his: 'i just want it to be able to use clearglass'"
      proof: "tests/modules/test-reasoning-route.test.js RR-01–06, WR-01–03; model-door routes agent:reason (learning, claude first)"

    NV0_scripts_injected_once:
      layer: library
      systems: [clear-glass]
      component: clear-glass.userscripts
      status: "DONE — 0.60.7"
      james: '"the interaction field and nexus nerve doesn''t do much. besides inject 1300 scripts."'
      files: [clear-glass/src/userscripts/manager.js]
      does: "One script per name; name/@match kept in a .meta.json; only persistent scripts written; the copies on disk moved to _duplicates/ on the next start (kept, not deleted)."
      proof: "clear-glass/test/userscripts-dedupe.test.js"
    NV1_words_to_elements:
      layer: library
      systems: [clear-glass]
      component: clear-glass.page.field
      status: "OPEN"
      james: '"what about mapping it onto the text of the element so like i want say, open images, after a google search, and it would click images with the least amount of depth first. or click the images next to videos" · "maybe only inject onto interactable elements. then the copilot can use nexus nerve to understand where its at in relation to the ui using the injected scrips"'
      files: [clear-glass/src/page/field.js, clear-glass/src/driver/index.js]
      does: >-
        The field maps only interactable elements (links, buttons, inputs, [role], tabindex, clickable handlers), each with
        its visible text, its label, its depth, its box and its neighbours. "open images" = the target whose text/label
        matches, ranked by match then least depth then position; "the images next to videos" = the match nearest to the
        target named "videos". The copilot gets this compact map (not the DOM) to know where it is in the UI; one command
        `do "<words>"` acts on it, with the spotlight first.
    NV2_tell_clear_glass_what_to_do:
      layer: library
      systems: [clear-glass]
      component: clear-glass.copilot
      status: "OPEN"
      james: '"i want to also be able to tell clearglass what to do."'
      depends_on: [NV1_words_to_elements]
      does: "A sentence → steps over NV1's map (open, click, type, wait for), each shown before it runs; unclear → it asks."

    MC0_recorder_records_the_tab:
      layer: library
      systems: [clear-glass]
      component: clear-glass.driver
      status: "DONE — 0.60.7"
      james: '"can you fix the macros?"'
      files: [clear-glass/src/driver/index.js, clear-glass/renderer/settings/core.js]
      does: "A window's agentId resolves to the tab (the webview guest) in that window; a Clear Glass page of its own (settings, library, the chrome) is never an agent's page."
      proof: "to be seen on his machine: record in the default window → steps from the site, not settings.html (not run in Electron here)"
    MC1_steps_as_events_and_snapshots:
      layer: library
      systems: [clear-glass]
      component: clear-glass.macros
      status: "OPEN"
      james: '"WHAT ABOUT USING EVENTS OR SNAPSHOTS as automation steps?"'
      depends_on: [NV1_words_to_elements]
      does: "A step can be a bus event to wait for (nav.loaded, element visible), a rewind snapshot to start from, or a target by words (NV1) — so a recorded macro replays by meaning, not by brittle selectors."
    MC2_hotkeys_for_macros:
      layer: ui
      systems: [clear-glass]
      component: clear-glass.shortcuts
      status: "OPEN"
      james: '"HOTKEYS FOR  MACROS"'
      files: [clear-glass/src/shortcuts/registry.js, clear-glass/renderer/settings/sections/macros.js]
      does: "Each macro can take a key (the same Keyboard shortcuts page); the record toggle (his: Ctrl+Shift+Y) starts recording in the focused TAB."
