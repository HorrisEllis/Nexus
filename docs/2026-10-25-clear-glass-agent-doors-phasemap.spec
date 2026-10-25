spec:
  meta:
    name:     clear-glass-agent-doors
    version:  1.0.0
    date:     2026-10-25
    release:  "0.60.251"
    uuid:     nexus-clear-glass-agent-doors-phasemap-v1-0000-2026-1025-jamesbrooks-001
    owner:    "clear-glass (ipc/bridge.js routes, copilot tools) + lib/agent-tools (autofill_manage) + idearium/cli/route-commands.js (rows)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-25: "need clearglass' fiverr, job application automation, autofill and macros working fully, including with
      the agents and copilot."
    axioms: "docs/AXIOMS-v3.1.md — §0.1 evidence over memory, §1.2 nothing fails silently, §8.6 reuse before build, §0.3 nothing lost, §5.2/§9.1 RAID is the write authority; docs/CLAUDE.md: backend → route → command → UI; agents get every capability a person gets"
    reading_of_his_words: >-
      The coder's reading, to confirm: "working fully, including with the agents and copilot" = every one of the four
      (the Fiverr gig fill, the job-application pipeline, the autofill with its learn loop, macros with recording) can be
      reached and run by (1) a person in Clear Glass, (2) the co-pilot in Clear Glass, (3) any NEXUS agent through its tools and
      through nexus.command — through the SAME implementation, and a broken door is fixed, not routed around. A live run on his
      Fiverr / application pages is his machine's (no display, no login here).

  exists:
    person: "Settings › Autofill (profiles, Fill/Preview, Pick, learned fields), the Gig panel, the macro builder and recorder — IPC autofill:* / macros:* in clear-glass/src/ipc/bridge.js. Unit tests green (JA1–JA5, GG, OP 28/28, macro 22/22) once node_modules is installed."
    copilot: "clear-glass/src/copilot/tools.js — autofill.gig/learn/pick/learned/forget, opportunity.status/cycle/list/capture/prepare. No general autofill.detect/fill, no macro tool, no opportunity reply/submit/show by name."
    agents: "lib/agent-tools — clearglass.browser.tool (autofill_detect/fill over :7702), nexus.opportunity.tool (the pipeline), macro (Cortex store, runs through browser_action → Guardian → RAID, the 0.60.69 decision), autofill_manage."
    commands: "idearium/cli/route-commands.js — autofill pick/learn/learned/forget, site. No autofill fill/detect/profiles, no gig, no macro rows."
    found:
      - "autofill_manage (the agents' named autofill tool) has never completed a call: it posts a Guardian job with provider 'autofill', but guardian/lib/dispatcher.js routes only provider 'browser' to Clear Glass, so the job waits on a chat lane named 'autofill' that does not exist and the tool times out after 30s. Even on the browser lane, guardian/clear-glass-bridge.js _responseTypeFor maps autofill.profile.create → 'autofill.profile.result' while the gate emits 'autofill.profile.created', and errors go out as 'autofill.error' — both would time out. And the bus gates never pass the learned map, so a taught field would not fill. (§0.1: read from the code; §1.2: it failed as a timeout, not a reason.)"
      - "Macro recording and macro create/delete have IPC handlers only; a co-pilot or agent outside the renderer reaches them only through the generic /cli/invoke by channel name, which neither the co-pilot's tool list nor any command row names."
      - "POST /cli/autofill/fill drops `vars` (the IPC autofill:fill passes them): an agent fill could not give the {{var}} values a person's fill can."
      - "Four test files fail with `Cannot find module` (electron, jsdom, js-yaml) in a fresh checkout until `npm install` runs; with it they pass. Environment, not code — said, not fixed here."

  decisions:
    AD_D1_one_autofill_implementation:
      status: >-
        DECIDED by his axioms (§8.6 reuse, §1.2): autofill_manage calls Clear Glass's own /cli/autofill/* routes (through
        clearglass.browser.tool's _call — the direct door 0.39.272 built for exactly this), not the bus gates. One implementation:
        the routes are the ones the Settings panel and the co-pilot use, with the learned map, needsPick, the gig and the picker.
        The bus gates stay for bus callers (§0.3 nothing removed). The gate: every agent tool call passes lib/agent-tools
        executeTool's tool-config check (allow / confirm per tool, his settings) — the same gate clearglass.browser.tool's direct
        :7702 calls already take; it is not a RAID approval (read in the code, §0.1). Macro RUNS by agents keep Guardian + RAID
        (0.60.69, unchanged); fills set values only and never submit (opportunity.submit stays policy-gated in lib/opportunity).
    AD_D2_macro_doors_share_the_recorder:
      status: "DECIDED by his axioms (§8.6): the HTTP record start/status/stop routes and the IPC handlers share one LiveRecorder (a bridge method), so a recording started by the co-pilot can be stopped from the panel and the reverse."

  phases:
    AD1_the_agents_autofill_door_works:
      status: DONE (0.60.251)
      depends_on: [AD_D1_one_autofill_implementation]
      files: [lib/agent-tools/tools/autofill/autofill-manage.js]
      does: "autofill_manage over /cli/autofill/*: the 7 actions it had (profile CRUD, detect, fill) plus fieldTypes, gig (the co-pilot's one door), gigDetect, gigFill, gigDraft, pick, learn, learned, forget. Clear Glass down → the error names the port."
    AD2_macro_http_doors:
      status: DONE (0.60.251)
      depends_on: [AD_D2_macro_doors_share_the_recorder]
      files: [clear-glass/src/ipc/bridge.js]
      does: "POST /cli/macros (create, through macro.js's own validation), DELETE /cli/macros/:name, POST /cli/macros/record/start|stop, GET /cli/macros/record/status — the same functions the IPC macros:* handlers call. /cli/autofill/fill passes vars."
    AD3_copilot_has_them_by_name:
      status: DONE (0.60.251)
      depends_on: [AD2_macro_http_doors]
      files: [clear-glass/src/copilot/tools.js, clear-glass/src/copilot/bridge.js, clear-glass/src/copilot/hat.js]
      does: "Co-pilot tools autofill.profiles/detect/fill, macro.list/get/run/create/delete/record.start/record.status/record.stop, opportunity.show/draft/prepare_reply/submit/followups; each dispatched to its route; the hat says which one a request means (an application → autofill.fill then autofill.pick on needsPick; a gig editor → autofill.gig; a repeat → macro.*)."
    AD4_command_rows:
      status: DONE (0.60.251)
      depends_on: [AD2_macro_http_doors]
      files: [idearium/cli/route-commands.js]
      does: "Rows autofill profiles|detect|fill, gig fill|detect, macro list|show|run|record|stop — so nexus.command (every agent) has them."
    AD5_wired_and_proven:
      status: DONE (0.60.251)
      depends_on: [AD1_the_agents_autofill_door_works, AD3_copilot_has_them_by_name, AD4_command_rows]
      files: [loom/maps/copilot-capability-map.js, tests/modules/test-cg-agent-doors.test.js, tests/modules/run-all.js]
      does: "Loom edges (autofill_manage → browser.js _call → the routes; copilot tools → routes; rows → routes). One test proves each door against the real bridge routes with a fake dom/driver: every co-pilot tool has a dispatch, every row's path is served, autofill_manage reaches the route and passes the learned map."

    SI1_no_userscript_on_a_signin_page:
      status: DONE (0.60.251)
      depends_on: []
      files: [clear-glass/src/providers/host.js]
      james: "not letting me sign in." (2026-10-25, with his autopilot log)
      does: >-
        His log: the ChatGPT tab loaded chatgpt.com/auth/login?next=%2F at 21:45:19, :22, :25 and :29 — each load followed by
        "injecting userscript", NCP connected, Guardian "needs a sign-in … (Continue with Google · Continue with Apple)", NCP
        disconnected, and the page loaded again. Every cycle began at the injection. ProviderHost._inject now does nothing on a
        sign-in path (isSigninPage: /login, /auth, /signin, /oauth, /sso …); the userscript goes in on the next page once he is
        signed in (did-finish-load). Guardian still sees the wall from the tab's URL (provider-attention.js pageOf, ask.js).
      reading: "The coder's reading of the log, to confirm on his next sign-in: which listener reloaded the page after each wall report was not found in the code (attention.js throttles its send-back to once a minute; account-switch reloads only on a switch or a sign-out). Removing the injection removes the trigger of every chain read; if the page still reloads, the cause is ChatGPT's own page and the log will show 'on its sign-in page … waits' with no NCP lines between loads."
    SI2_erosmancer_has_express:
      status: DONE (0.60.251)
      depends_on: []
      files: [package-lock.json, clear-glass/erosmancer/erosmancer-os/package.json]
      does: >-
        His log: "[eros] Error: Cannot find module 'express'", five restarts, then "not restarting". The lockfile's nested
        express entry under clear-glass/erosmancer/erosmancer-os/node_modules (hand-renamed in RF2) was never installed by npm, so
        `npm install` left ErosmancerOS without express. Regenerated by npm itself (`npm install express --workspace
        clear-glass/erosmancer/erosmancer-os`): express is now hoisted to node_modules/express; the stale `emerge` workspace entry
        (moved into lib/ in RF2) left the lock. Proof here: ErosmancerOS boots ("event":"boot","port":7432) and answers /api/health.

  verification_here: "No Electron display and no logins in this container: the routes are proven by mounting the real ipc/bridge.js route installer on an express app with fake dom/driver/stores; a live fill on his Fiverr/application pages is his machine's (said, not faked)."
