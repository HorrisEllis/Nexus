# 0.60.251 — Clear Glass's Fiverr, job applications, autofill and macros, reachable by the agents and the co-pilot; the ChatGPT sign-in loop

James, 2026-10-25: "need clearglass' fiverr, job application automation, autofill and macros working fully, including with the agents and
copilot." · then, with his autopilot log: "not letting me sign in."

Map: `docs/2026-10-25-clear-glass-agent-doors-phasemap.spec` (AD1–AD5, SI1, SI2). The direction is his; the readings and the code are the
coder's. Where a reading could go another way, the map says "to confirm".

## What was broken, read in the code (§0.1)
- **The agents' autofill tool never worked.** `autofill_manage` posted a Guardian job with provider `autofill`. Guardian sends only provider
  `browser` to Clear Glass (`guardian/lib/dispatcher.js`). So the job waited for a chat lane called "autofill" that does not exist, and
  every call ended in the 30 s timeout. It never said why (§1.2).
- Even on the browser lane it would have failed:
  - `_responseTypeFor` waits on `autofill.profile.result`, but the gate emits `autofill.profile.created`;
  - errors go out as `autofill.error`;
  - the bus gates never pass the learned map.
- **Macros had no door outside the window.** Create, delete and recording were IPC-only. The co-pilot and agents could reach them only
  through the generic `/cli/invoke`, and nothing told them to.
- **The co-pilot had no general fill.** It had the gig tool (`autofill.gig`) and the learn loop, but no "fill this application". It had
  no macro tools, and no names for an opportunity's reply, submit or follow-ups.
- `POST /cli/autofill/fill` dropped `vars`, which the panel's IPC fill passes.

## What changed
- **AD1** `lib/agent-tools/tools/autofill/autofill-manage.js` calls Clear Glass's own `/cli/autofill/*` routes through
  `clearglass.browser.tool`'s `_call`. These are the routes the Settings panel and the co-pilot use.
  - The 7 actions keep their names.
  - New actions: `fieldTypes`, `gig`, `gigDraft`, `gigDetect`, `gigFill`, `pick`, `learn`, `learned`, `forget`.
  - When Clear Glass is down, the error names the port.
- **AD2** `clear-glass/src/ipc/bridge.js`:
  - New routes: `POST /cli/macros`, `DELETE /cli/macros/:name`, `POST /cli/macros/record/start|stop`, `GET /cli/macros/record/status`.
  - They and the IPC `macros:*` handlers call the same two methods, `_macroWrite` and `_macroRecord`, with one shared `LiveRecorder`. A
    recording the co-pilot starts can be stopped from the panel.
  - `/cli/autofill/fill` passes `vars`.
- **AD3** The co-pilot:
  - New tools: `autofill.profiles|detect|fill`, `macro.list|get|run|create|delete|record.start|record.status|record.stop`,
    `opportunity.show|draft|prepare_reply|submit|followups`.
  - **Before any model is asked** (his "Deterministic first", 2026-10-13):
    - "fill this in for me", "autofill" and "fill out the application" run the fill. On a Fiverr gig editor (`/manage_gigs`) that is the
      gig fill; anywhere else it is the application fill, which says which types no field took ("say 'pick github'").
    - "pick github" opens the picker.
    - "record a macro called …" and "stop recording" drive the recorder.
    - Setting `copilotJobVerbs: false` turns these off.
  - The hat names which tool each request means.
- **AD4** New rows in `idearium/cli/route-commands.js`: `autofill profiles|detect|fill`, `gig fill|detect`,
  `macro list|show|run|record|stop`. So `nexus.command` gives every agent all of them.
- **AD5** Loom edges (`economy-map`, `copilot-capability-map`). `clearglass.browser.tool` is now in the map, and `autofill_manage`'s one
  require is its edge.
- **SI1** — the sign-in.
  - **What his log showed:** the ChatGPT tab loaded `chatgpt.com/auth/login?next=%2F` at 21:45:19, :22, :25 and :29. Each load was
    followed by "injecting userscript", NCP connected, Guardian "needs a sign-in (Continue with Google · Continue with Apple)", NCP
    disconnected, and the page loaded again. A page that reloads every 3 s cannot be signed in to.
  - **The change:** every cycle began at the injection, so `ProviderHost._inject` does nothing on a sign-in path. The userscript goes in
    on the next page, once he is signed in. Guardian still sees the wall from the tab's URL (`provider-attention.js` `pageOf`).
  - **To confirm:** the coder did not find which listener reloaded the page after each wall report. Removing the injection removes the
    trigger of every chain that was read. If the page still reloads, the log will say "on its sign-in page … the userscript waits" with
    no NCP lines between loads, and then the cause is ChatGPT's own page.
- **SI2** — ErosmancerOS.
  - **What his log showed:** "Cannot find module 'express'", five restarts, then "not restarting".
  - **Why:** the lockfile's nested express entry, renamed by hand in RF2, was never installed by npm.
  - **The change:** npm regenerated the lockfile (`npm install express --workspace clear-glass/erosmancer/erosmancer-os`). express is now
    in `node_modules/express`. The stale `emerge` workspace entry, which RF2 moved into lib/, left the lock.

## Proof
- `tests/modules/test-cg-agent-doors.test.js`: 7/7.
  - A real HTTP server stands in for :7702.
  - Every new tool, row and agent action is checked against the routes `ipc/bridge.js` actually serves.
  - The job verbs are checked on a gig URL and on an application URL.
  - The sign-in page gets no injection, and the chat page does.
- ErosmancerOS boots here ("event":"boot","port":7432) and answers `/api/health`.
- Still green: test-cg-gig-autofill 4/4, JA1–JA5 (learned 4/4, learn-save 3/3, learn-pick 5/5, learn-ui 3/3, learn-macro 5/5),
  clear-glass-autofill 16/16, test-opportunity 28/28, test-macro 22/22, loom-map 19/19, system-boundary 10/10, route-contracts 4/4,
  nexus-command-tool 8/8, provider-host load 5/5, one-tab 7/7, respawn 4/4, attention-focus 7/7, and Clear Glass's own list except two.
- Said, not fixed (red on the base too): clear-glass `network-install.test.js` (10 ✗) and `window-frame.test.js`, and CL-07 in
  test-cli-route-commands (it needs a running Guardian).

## Not proven here
- A live sign-in, and a live fill on his Fiverr gig editor or an application page. Both need his machine and his logins.
- In a fresh checkout, four of these test files fail with `Cannot find module` until `npm install` runs.

## Open
1. His next ChatGPT sign-in is the test of SI1. If the tab still reloads, send the log lines between two loads.
2. The full emerge-format spec (his 2026-10-20 rule) was not written for this release. Each phase wires modules that already exist and
   adds none, so the phasemap and its .phase/.graph files are the record. Say if this needs the full spec anyway.
3. `/cli/autofill/proposal` (a cover letter or proposal for one post) is still IPC-only. Agents draft through `nexus.opportunity.tool` draft.
