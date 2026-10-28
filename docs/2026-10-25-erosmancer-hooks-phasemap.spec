spec:
  meta:
    name:     erosmancer-hooks
    version:  1.0.0
    date:     2026-10-25
    release:  "0.60.253"
    uuid:     nexus-erosmancer-hooks-phasemap-v1-0000-2026-1025-jamesbrooks-001
    owner:    "clear-glass (main/index.js the wire, src/eros, src/dom/archaeology.js, src/options/store.js, ipc/bridge.js) + erosmancer-os (/api/input)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-25: "can you hook erosmanceros into snowflake, accounts manager, and the dom mutator."
    axioms: "docs/AXIOMS-v3.1.md — §8.6 reuse before build (every door named below exists), §1.2 nothing silent (a wrong tab is worse than no tab), §0.1 evidence over memory; docs/CLAUDE.md: backend → route → command → UI"
    reading_of_his_words: >-
      The coder's reading, to confirm: ErosmancerOS (the CDP engine on :7432 that drives Clear Glass's tabs with human-paced input)
      should (1) be able to drive a page that goes through Snowflake, (2) drive a page as one of his accounts, signed in, with that
      account's own behaviour, and (3) be what the DOM mutator types with when asked, so a value is typed like a person, not set.

  exists:
    eros_door: "main/index.js _startWire: _proxyEros (:7432), _resolveErosTab, _erosInputFn → driver.erosInput (the pointer's via 'eros')."
    snowflake: "ipc/bridge.js _netOpenVia(url): starts the transport if needed, opens an agent window (snow-<uuid>) whose session is forced through it."
    accounts: "main/index.js openAgentWindow({ agentId: 'acct-<id>' }) opens a window in the account's own session (persist:agent-acct-<id>) with its cookies restored; options/store.js accounts."
    dom_mutator: "src/dom/archaeology.js handleMutate → window.__cgDomMesh.mutate (native value setter + input/change events). Reached by the dom.mutate bus gate (agents' dom_mutate, co-pilot dom.mutate) and autofill."
    eros_api: "erosmancer-os /api/tabs (targetId, url, title), /api/tabs/:id/attach, /api/input (curved pointer path, click, per-character insertText), /api/evaluate, /api/behavior/profile."
    found:
      - "_resolveErosTab chose the tab by exact URL, else THE FIRST TAB, and cached that per agent forever: after any navigation, or with two tabs, Eros could click and type in the wrong page."
      - "Eros's own POST /api/tabs opens a target in Clear Glass's default browser context: never signed in as an account, never on Snowflake's forced session."
      - "The DOM mutator never reached Eros: a value was always set, never typed."
      - "Eros's /api/input typing has one fixed pace; the behaviour profiles (precise · cautious · exploratory · turbo) reach only /api/execute and human-type."

  decisions:
    ER_D1_eros_gets_its_tabs_from_clear_glass:
      chosen: "Decided by his axioms (§8.6): Eros does not open its own tabs for this. Clear Glass opens the page through the door that owns the session (Snowflake: _netOpenVia; an account: openAgentWindow acct-<id>; neither: a plain agent window), then Eros attaches to exactly that page."
    ER_D2_the_right_tab_or_none:
      chosen: "Decided by his axioms (§1.2): a tab is matched by the page's own url AND title from Clear Glass; a tie is broken by a one-time marker Clear Glass stamps into that page and Eros reads back; no match is an error naming the agent, never the first tab."

  phases:
    ER1_the_right_tab:
      status: DONE (0.60.253)
      depends_on: [ER_D2_the_right_tab_or_none]
      files: [clear-glass/src/eros/tab-match.js, clear-glass/src/main/index.js]
      does: "tab-match.js pickTarget(targets, { url, title }) → one | ambiguous | none (pure). The wire resolves an agent's tab from its webContents' url+title; a tie stamps window.__cgErosNonce and evaluates it on each candidate; the cache is re-checked against the page's url on every call."
    ER2_snowflake_and_accounts:
      status: DONE (0.60.253)
      depends_on: [ER1_the_right_tab, ER_D1_eros_gets_its_tabs_from_clear_glass]
      files: [clear-glass/src/main/index.js, clear-glass/src/ipc/bridge.js, clear-glass/src/options/store.js, clear-glass/erosmancer/erosmancer-os/src/api/server.ts]
      does: "POST /cli/eros/open { url, via: snowflake | account | plain, accountId? } → the page opened through its door, Eros attached, the account's erosProfile (options/store.js, one of the four) set for that session and used by every Eros input on it; /api/input takes profile (the pace of the pointer and the keys). GET /cli/eros/tabs: which agent each Eros tab is."
    ER3_the_dom_mutator_types_through_eros:
      status: DONE (0.60.253)
      depends_on: [ER1_the_right_tab]
      files: [clear-glass/src/dom/archaeology.js, clear-glass/src/main/index.js]
      does: "handleMutate({ …, via: 'eros' }): a value is typed — the mesh scrolls the field into view, focuses and clears it, gives its centre; Eros clicks there and types it at the account's pace. Every other mutation (text, html, style, attrs, remove) stays native. Eros down → the error says so; nothing is set silently instead."
    ER4_commands_tools_screen:
      status: DONE (0.60.253)
      depends_on: [ER2_snowflake_and_accounts, ER3_the_dom_mutator_types_through_eros]
      files: [idearium/cli/route-commands.js, clear-glass/src/copilot/tools.js, clear-glass/src/copilot/bridge.js, clear-glass/renderer/settings/sections/accounts.js, loom/maps/economy-map.js, tests/modules/test-eros-hooks.test.js, tests/modules/run-all.js]
      does: "Rows `eros open <url> [--snowflake | --account <id>]`, `eros tabs`; co-pilot tools eros.open / eros.tabs and dom.mutate's via; Settings › Accounts: each account's ErosmancerOS pace; loom edges; the test."

    LG1_the_copilot_reaches_guardian:
      status: DONE (0.60.253)
      depends_on: []
      files: [copilot/lifeline.js, tests/modules/lifeline-fluid-routing.test.js]
      james: "its not hooked into guardian. look at idearium" (2026-10-25, with his co-pilot pane: "try again" → "Both Ollama and Guardian are unavailable. Check system health." while Guardian was up, 12/12)
      does: >-
        Clear Glass starts provider tabs on first real use (NCP auto-boot is lazy), so at the first ask no tab is connected; the
        lifeline's pre-check read that as "nothing can answer" and refused without dispatching, then replaced the reason with "Both …
        unavailable". Idearium's repo agents never hit it: their agentId makes the dispatcher open the tab. Now the lifeline uses CL1's
        door (openTab: the dispatcher asks for the tab, the job waits up to two minutes, it flushes when the tab connects); noOpenTab keeps
        the 2026-07-09 refusal for a caller that wants it; and a final failure names each side's reason.
      decided_by: "§8.6 reuse (CL1's openTab, 0.60.231, his own call for a person's pick), §1.2 (each reason said). The 2026-07-09 fail-closed rule is kept behind noOpenTab, its test kept (T-006), superseded for the default by T-006b (§0.3)."

  verification_here: "Pure tab matching and the mesh's prepare script in a real page (Clear Glass glass.js); the wire's resolver, the open door and the mutate path against fakes for Eros and Electron; the TypeScript change compiled. Not run against a live Eros + Clear Glass (no display here)."
