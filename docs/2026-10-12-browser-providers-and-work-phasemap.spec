spec:
  meta:
    name:     browser-providers-and-work
    version:  1.1.0
    date:     2026-10-12
    release:  "0.60.3 (base)"
    uuid:     nexus-browser-providers-and-work-phasemap-v1-0000-2026-1012-jamesbrooks-001
    owner:    "clear-glass (tabs, accounts, site and account nodes, element endpoints, gigs, autofill) · guardian (providers and hats as nodes, Claude Code as a provider, .input nodes) · copilot (the copilot hat's agent and account, gig writing) · loom + idearium (component tags, mapping before building) · cos (tab compartments)"
    status:   "MAPPED 2026-10-12, before building. ADDENDUM 1.1.0 (2026-10-13): RN0 the COS window, CS0–CS1 decompose into components (built, 0.60.5), CS2 manage uploaded projects (mapped onto what exists), JB7 decision chosen (a prompt to schedule). Done: JB0, PV5, PV6, RN0, CS0, CS1; MX2 partial; everything else OPEN."
    voice: >-
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §6.2 read before building, §8.6 reuse before build, §1.2 nothing silently fails, §2.1 persistence, §5.1 everything has a UUID, hook and bus registration, §10.1 one write authority per data type, §17.3 every decision recorded
    companion: >-
      docs/2026-10-12-request-spine-phasemap.spec (RQ0–RQ27, James's, same day) maps the request pipeline itself: intent
      map, context obligations, the gap as a question, chunked .contract files, anchors, spec and registry reconciled,
      the phase DAG, the work surface and provenance, parallel cells, observe by request, test and attack intents, what
      Nexus can take over, the budget meter, the gate transaction (snapshot before, revert on failure), comparison and
      drift. This map does not repeat any of it: every request-pipeline ask in the messages below is folded into an RQ
      phase in `folds`. This map holds what the spine does not: the browser, the providers and hats, the inputs, the
      getting-work tools, and how a phase is tagged to a component.
    origin: >-
      James, 2026-10-12, across several messages: "what if background tabs run in a sandboxed compartment that you can
      open and close? each tab in clearglass is isolated at the process level? that way we can use different accounts per
      tab. bookmarks in the ui when clicking the button is suppsed to have a check list for linking to account using the
      cookie vault and a check list for saving the state of the browser." · "lets integrate claude code as a guardian
      provider, seperate from the provider. can we have providers be node files? hats also? what about in clearglass using
      nodes for websites all together, site specific settings, macros, automatation, etc. even account specific nodes for
      website specific settings. zoom settings, adblocker settings, automation, selecting element as a api for a listener
      or system of inputs and outputs(responses) can we like .response nodes have .input nodes, for not only the payloads
      for the jobs in guardian, but for the any input into the cli? then use it as history for chats, diagnostics,
      contracts, etc." · "like everything needs to be mapped to a physical file, either propose addendum or edit to the
      phasemap, or spec for the relevant spec. then phase it in pieces, what about phasemap per module or component? or at
      least tag it as such?" · "each change has to snapshot, before each change, only the differences or deviation not the
      while file unless needed." · "stop. before you continue. I dont want anything to go unmapped." · "Can you make a
      template with a download button in the settings for the fiverr, next to download gig file. maybe you could use a
      yaml file with a real .gig extension. do it. then i want the agent or copilot to be able to generate them for me.
      also can you have the copilot in clearglass have account settings for each provider. like setting the agent for the
      copilot hat, and setting the account?" · "use the interaction field, nexus nerve, and guardian picker if needed to
      map the autofill elements if it doesn't work. maybe the browser asks me if it" · "also importing a resume to
      autofill. like i need to reduce as much overwhelm and repitition as possible, i have adhd and its miserable. also use
      the semantic randomizer and behavior engine to change up the wording. then what if after each application, we
      schedule an automated email as a follow up to the company email automatically."

  # ── What exists (read in source 2026-10-12, not run) ──────────────────────
  exists:
    tabs_and_sessions:
      - "In-window tabs are not tabs of their own: renderer/browser.js:401-479 (_tabs) says 'Lightweight multi-tab using the single webview… Not a multi-webview system'; switching a tab navigates the one <webview id=\"wv\"> (renderer/browser.html:201). No per-tab process, partition or state."
      - "The webview's partition comes only from the wvPartition query param (renderer/browser.js:107-109); openBackgroundTab passes it (src/main/index.js:2420), openAgentWindow does not. openAgentWindow sets persist:agent-<id> on the BrowserWindow (index.js:2082, 2166) and attaches content filters, permission filters and downloads to that session (2108-2156) — while the <webview> that shows the page has no partition, so it browses in the app's default session. Likely: the adblock, the permissions and an account window's restored cookies land on a session the page never uses. Read, not run."
      - "Background tabs: openBackgroundTab / closeBackgroundTab / listBackgroundTabs (index.js:2383-2447), bgTabs + bgTabUrls, IPC bgtab:open|close|list, HTTP /cli/bgtab, a panel (renderer/browser.js:2202-2230). Automation pages run in background tabs on persist:automation. Nothing ties a tab to a COS compartment."
      - "contexts/manager.js create({agentId}) → persist:agent-<id> with a Firefox-pool UA and headers (FF_UA_POOL on Chromium: UA vs Sec-CH-UA mismatch; fingerprint/engine.js spoof script). It patches the chrome page, not the guest page, today."
      - "0.60.3: human-browsed pages pass through untouched (CSP/X-Frame-Options removed only for frames, provider pages and localhost), no app token in the UA, CG_GPU=on to re-enable hardware acceleration."
    accounts_and_vault:
      - "src/cookies/vault.js — encrypted JAA (cookie_snapshots, account_cookies); 0.60.2: capture per site, restore every site with __Host-/sameSite fixed, accounts()."
      - "src/options/store.js — the account authority: accounts {id,label,agentKeys[],providerAccounts,sessions}, accountDefaults per agentKey, resolveAccountForDispatch."
      - "src/accounts/login-portal.js (persist:mesh-<provider>-<account>), src/providers/account-switch.js (0.60.2: swap one persist:ncp-<provider> tab between accounts), guardian/lib/account-routing.js (0.60.2: hat / intent / repo rules → account)."
      - "Account windows: ACCOUNT_WINDOW_PREFIX 'acct-' and _restoreAccountWindow (index.js:2016-2040) restore into persist:agent-acct-<id>."
    bookmarks_and_sites:
      - "Bookmark dialog (renderer/browser.js:1505-1575) has an account choice ('No account' + each account) and a 'remember page state' checkbox; openBookmark routes an account bookmark to its acct- window and restores state. Store: src/bookmarks/store.js JAA cg_bookmarks with snapshotId and accountId. One account per bookmark; state is one checkbox."
      - "src/site-settings/store.js — JAA cg_site_settings per origin: permission:<name>, zoomFactor, contentFilter. Not per account; no macro or automation keys; no site node."
      - "src/automation/nodes.js writes .workflow and .macro nodes (node-export) to brainos/automation-nodes; triggers manual / every / daily / cron / event (page.visited, download.done) / webhook (steps.js:220-237). src/macros/recording.js records macros. src/userscripts/manager.js: {agentId|'*', matches[], persistent}, no account scope."
    element_as_api:
      - "src/dom/archaeology.js __cgDomMesh (getTree, query, getById, elementAt, MutationObserver stream); the picker's results stay in renderer memory (renderer/browser.js:727-747) and can be routed to SSE or an API URL (bridge.js:1616-1627); src/page/attention.js (25 picks), src/page/field.js (the numbered interaction field); 0.60.2 picks carry an anchor (x, y, w, h, rx, ry, z, zIndex, depth) and guardian/userscript-field-map.js uses them. No persisted element endpoint."
    providers_hats_inputs:
      - "Guardian does not know Claude Code: no claude-code.provider, not in agent-registry.seed.json, not in provider-routing KNOWN_PROVIDERS, no dispatcher path. lib/claude-code-backend.js (run in a repo copy and diff, ask read-only), lib/repo-agent.js _dispatchClaudeCode with the economy gate, copilot backend 'claude-code' (clear-glass/src/copilot/bridge.js:647), lib/agent-providers.js HEADLESS=['claude-code'] kept out of all() on purpose."
      - "Provider nodes exist for the five browser providers (guardian/data/nodes/provider/*.provider, schema.provider: id, name, url, hosts, userscriptFile required — browser-shaped). Ten places still keep their own provider list (provider-routing.js:56, server.js:121 and :2319, api-dispatch.js:41, warp-cascade.js, agent-router.js:45, pipeline-routing.js:42, agent-providers.js from userscript filenames, repo-agent.js:100, clear-glass providers/registry.js)."
      - "Hats live in JAA forged_hats (lib/hat-forge.js); schema.hat exists; exportHat/importHat exist and only a test calls them; guardian/lib/node-registry.js GUARDIAN_NODE_TYPES already lists 'hat' but guardian/data/nodes/hat/ does not exist."
      - "schema.input exists and 'input' is a KNOWN_TYPE (lib/node-export.js:178); nothing writes one. .response nodes: guardian/lib/response-sink.js writes guardian/data/nodes/response/<jobId>.response with the prompt cut to 4000 chars. Job envelopes: guardian/lib/jobs.js _persistJob to data/guardian/jobs."
    getting_work:
      - "clear-glass/src/autofill/gig.js — buildGigPrompt (the agent writes a gig from his profile, only his facts), parseGig (held to Fiverr's limits), gigParts, gigText, detectGig, fillGig; END_STATE_QUESTIONS (the buyer's answers become a spec, briefToSpec). 2026-10-12 (his uncommitted work, committed): load a .gig.json, save one. 2026-10-12: .gig is YAML (gigFile, gigTemplate, Download template)."
      - "src/autofill/store.js — profiles under an account, documents.resume is a {path, filename} on disk with an honest limit (a page's file input cannot be set by script); matcher.js matches fields by autocomplete/name/label; test-cg-autofill-jobs covers the job forms."
      - "Wording: lib/semantic-variant.js (protect/restore exact tokens, validate similarity, jsVariant), copilot/lib/reword.js (Ollama first, novel against what was sent before). Typing: guardian/lib/eros-typist.js → ErosmancerOS human timing over CDP."
      - "Scheduling: src/automation/cron.js and workflow triggers. Email: nothing in the tree sends mail (no SMTP, no mail client, no compose automation)."
      - "The copilot hat in Clear Glass: clear-glass/src/copilot/hat.js; the account authority has accountDefaults per agentKey; no screen sets the copilot's agent and account per provider."

  # ── Folded into the request spine (no phase here) ─────────────────────────
  folds:
    - "'map the dependancies, write the planned changes to the spec and registry and phase it out, using context, then use the dependancies as a checklist or conditions for the end state' → RQ7 (obligations), RQ9 (the chunked contract), RQ11 (spec and registry reconciled), RQ12 (phase DAG), RQ23 (acceptance conditions)."
    - "'each change has to snapshot, before each change, only the differences or deviation not the while file unless needed' → RQ24 (the gate transaction: checkpoint before, revert on failure). Versionium already stores deltas between snapshots (versionium/lib/files.js plan uploads only changed contents); RQ24 makes the checkpoint per change. Pushback below: a per-change snapshot is a delta by construction — the full file is kept only when a file is new or the delta store cannot rebuild it."
    - "'Need intents for speccing, debugging, test and attacking, contracting? Observing?' → RQ6 (one intent map), RQ18 (test and attack intents), RQ17 (observe by request)."
    - "'an agent to check a systems recents events, inject the orchastratory in chunks … the chunking and indexing context to synthesize to be a agnostic tool' → RQ17 + RQ27 (the reasoning half's home); cortex/core/raid/context-synthesis.js exists and is unwired — RQ7 wires it. MX4 below names the one system-digest tool the spine reads."
    - "'Talk to the agent, give it a request, like I do with you … Begin a .contract file using each block as chunks for each file that needs to be changed' → RQ9 + RQ21 (the .contract file is its record)."
    - "'Create a compartment for the uncomited changes, maybe in raid' → RQ13 (work surface and provenance) + RQ24."
    - "'like a tool to check the history of the repos log and tasks and the status' → RQ17; the pieces exist (activity_log, repo tasks, build ledger, phase runs, run state); MX4 is the one read."
    - "'learning per component, module, etc? so it can learn more about each project with recursion' → RQ2 (failure index per kind of chunk) + lib/plan-learning.js (0.60.0, lessons per file and system); MX0 adds the component tag both read."
    - "'would routing through raid be better? more stable?' → decision_raid_home in the request spine; 0.60.3 fixed the reason it was unstable (RAID decided on health it never read outside cortex)."

  pushback:
    - >-
      Per-tab process isolation is Chromium's, not ours to build: a <webview> per tab with its own persist: partition is
      already a separate renderer process and a separate cookie jar. The work is to stop sharing one webview (TB1), not
      to invent a sandbox. A COS compartment around a tab (TB3) is a record and a lifecycle (open, close, ledger), not a VM.
    - >-
      Two places hold accounts today (options store accounts, guardian agent-registry accounts) and §10.3 says competing
      truths are a failure. Clear Glass stays the one account authority (guardian/spec/agents-and-accounts.spec AX2);
      every phase here reads it, none adds a list.
    - >-
      Hats and providers as node files raise §10.1: JAA and the file cannot both be written as the truth. The coder's
      recommendation: the node file is the record, JAA is the index rebuilt from the files (the way node-registry already
      indexes guardian's nodes). The other way round (JAA truth, files exported) is cheaper and is what exportHat does.
      decision_node_truth below.
    - >-
      .input nodes for every CLI input will hold secrets sometimes (a pasted key, a password typed at a prompt). An input
      node is redacted by the same rules as the activity log before it is written, and a command can mark its input
      private. Nothing about a password-vault or cookie-vault call is ever written.
    - >-
      Sending email on his behalf is outward and irreversible (request spine, trigger f). A follow-up is drafted and
      scheduled, and nothing is sent until he approves it — once per email, or a standing rule he writes ("send my
      follow-ups 5 days after, at most one per application"). The default is drafts.
    - >-
      Varying the wording of a cover letter is fine; varying facts is not. The semantic variant protects names, numbers,
      dates and links (lib/semantic-variant.js protect/restore), and every varied answer is checked against his profile
      before it is typed. Human-timed typing (ErosmancerOS) is for his own applications in his own browser; the phases
      do not automate a site's bot challenge or submit anything without him.
    - >-
      A phasemap per module would be dozens of small files that drift apart. The coder's recommendation is MX0: one map per
      piece of work (as now), every phase tagged with the component(s) it touches, and loom answering "every phase of
      component X" as a query — a per-module view, not a per-module file.

  decisions:
    decision_node_truth:
      choices:
        - "[A] the .provider / .hat node file is the record; JAA is an index rebuilt from the files  ← recommended (§2.2 the storage device is the truth; providers already work this way)"
        - "[B] JAA stays the truth; every change exports the node file (exportHat), the file is a copy"
    decision_followup_send:
      choices:
        - "[A] drafted and scheduled; each one sent only when he approves it  ← recommended (default)"
        - "[B] a standing rule he writes (delay, at most one per application, which accounts) sends without asking"
        - "[C] drafts only; he sends them himself"
      chosen: >-
        2026-10-13, James: "okay yeah, how about a prompt to schedule the email." — after an application with a contact
        email, Clear Glass asks him: schedule a follow-up? [in 5 working days] [pick a date] [not this one]. The draft is
        shown in that prompt; what he picks is scheduled; at its time it is sent (his scheduling it is the approval) unless
        a reply or a status change cancelled it.
    decision_mail_channel:
      choices:
        - "[A] his own webmail in a Clear Glass tab (compose URL + the field map), the account's sign-in from the vault  ← recommended (no new credential kind)"
        - "[B] SMTP with an app password kept in the password vault (src/passwords/vault.js)"

  phases:
    # ── Clear Glass: tabs, accounts, sites, elements ────────────────────────────
    TB0_the_webview_session_proved:
      layer: library
      systems: [clear-glass]
      component: clear-glass.main.agent-window
      status: "OPEN"
      james: '"each tab in clearglass is isolated at the process level? that way we can use different accounts per tab"'
      files: [clear-glass/src/main/index.js, clear-glass/renderer/browser.js, clear-glass/renderer/browser.html]
      does: >-
        Run it first: open an agent window and an account window, read webContents.session.partition (or getStoragePath)
        of the <webview> and of its BrowserWindow, and the cookies each holds. If the webview is on the default session
        (as read), give the webview the window's partition (wvPartition from openAgentWindow), so the adblock, the
        permissions, the downloads and an account window's restored cookies are on the session the page uses.
      proof: "an account window's restored sign-in is present in the page (cookie read inside the webview); a blocked ad request is blocked in the page"
    TB1_a_tab_is_its_own_webview:
      layer: ui
      systems: [clear-glass]
      component: clear-glass.renderer.tabs
      status: "OPEN"
      james: '"each tab in clearglass is isolated at the process level?"'
      depends_on: [TB0_the_webview_session_proved]
      files: [clear-glass/renderer/browser.js, clear-glass/renderer/browser.html]
      does: >-
        _tabs keeps one <webview> per tab (hidden when not active, a cap on live tabs with the oldest suspended to its URL
        and state), each with its own partition attribute set at creation (a webview's partition cannot change after it
        navigates). Switching shows a webview; it no longer navigates the shared one, so a tab keeps its page, scroll and
        form state. Every place that reads the one #wv (the picker, the DOM mesh, the field, the driver) reads the active
        tab's webview.
      proof: "two tabs on two sites keep their scroll and a half-typed form across switches; each webview reports its own partition and pid"
    TB2_a_tab_runs_as_an_account:
      layer: ui
      systems: [clear-glass]
      component: clear-glass.accounts.tab-account
      status: "OPEN"
      james: '"that way we can use different accounts per tab"'
      depends_on: [TB1_a_tab_is_its_own_webview]
      files: [clear-glass/renderer/browser.js, clear-glass/src/cookies/vault.js, clear-glass/src/options/store.js]
      does: >-
        A new tab can be opened "as" an account (the tab strip's + menu and a tab's context menu): its webview gets
        persist:acct-<id>, and before the first navigation the vault restores that account's cookies into it
        (cookieVault.restore with the 0.60.2 fixes). The tab shows which account it is. "Save sign-in" captures the tab's
        cookies to that account (vault.capture). One account authority: the options store's accounts.
      proof: "two tabs on the same site signed in as two accounts at once; closing and reopening one restores its sign-in from the vault"
    TB3_tabs_are_compartments:
      layer: library
      systems: [clear-glass, cos]
      component: clear-glass.tabs.compartment
      status: "OPEN"
      james: '"what if background tabs run in a sandboxed compartment that you can open and close?"'
      depends_on: [TB1_a_tab_is_its_own_webview]
      files: [clear-glass/src/main/index.js, cos/host/gates/compartment.js, lib/activity-log/compartment.js]
      does: >-
        A background tab (openBackgroundTab) and, on request, a foreground tab is a compartment record: id, partition,
        account, purpose, the URL, state (open / suspended / closed), its downloads, its activity rows. Open, close,
        suspend and reopen are commands (nexus.command rows) and events in clear-glass's taxonomy; the background panel
        lists them. A closed compartment keeps its record and its last state snapshot (rewind) until he deletes it.
      proof: "a background tab opened as a compartment, closed, reopened with its sign-in and page; its activity rows read back"
    TB4_bookmark_checklists:
      depends_on: [TB2_a_tab_runs_as_an_account]   # mapped from the files they share: TB2_a_tab_runs_as_an_account (clear-glass/renderer/browser.js)
      layer: ui
      systems: [clear-glass]
      component: clear-glass.bookmarks
      status: "OPEN"
      james: '"bookmarks in the ui when clicking the button is suppsed to have a check list for linking to account using the cookie vault and a check list for saving the state of the browser"'
      files: [clear-glass/renderer/browser.js, clear-glass/src/bookmarks/store.js, clear-glass/src/rewind/engine.js]
      does: >-
        The ★ dialog's account choice becomes a checklist (a bookmark can open as any of several accounts; opening asks
        which, or uses the first), and "remember page state" becomes a checklist of what is saved: cookies (the vault),
        local/session storage, scroll and form state, the other tabs of the window. The store keeps accountIds[] and
        state parts; an old single accountId reads as a list of one.
      proof: "a bookmark linked to two accounts opens as either; state saved without cookies restores scroll and storage only"
    TB5_site_and_account_nodes:
      layer: library
      systems: [clear-glass]
      component: clear-glass.sites.nodes
      status: "OPEN"
      james: '"what about in clearglass using nodes for websites all together, site specific settings, macros, automatation, etc. even account specific nodes for website specific settings. zoom settings, adblocker settings, automation"'
      depends_on: [TB2_a_tab_runs_as_an_account]
      files: [clear-glass/src/site-settings/store.js, clear-glass/src/automation/nodes.js, clear-glass/src/userscripts/manager.js, lib/node-schemas/schema.site]
      does: >-
        A .site node per origin (and an optional .site per origin+account that overrides it) holds that site's settings
        (zoom, content filter, permissions, fingerprint), its macros and workflows (references to their .macro/.workflow
        nodes, never copies), its userscripts, its element endpoints (TB6) and its autofill field map (JB3). The settings
        page reads and writes the node; cg_site_settings becomes the index (decision_node_truth). A new schema.site.
      proof: "zoom and adblock-off set for one site as one account and not the other; the .site file shows both; deleting the index and restarting rebuilds it from the files"
    TB6_element_endpoints:
      layer: library
      systems: [clear-glass, guardian]
      component: clear-glass.dom.endpoint
      status: "OPEN"
      james: '"selecting element as a api for a listener or system of inputs and outputs(responses)"'
      depends_on: [TB5_site_and_account_nodes]
      files: [clear-glass/src/dom/archaeology.js, clear-glass/src/page/field.js, guardian/userscript-field-map.js]
      does: >-
        Folds TX16 (persistent listener registry, callable elements). A picked element becomes an endpoint on its site
        node: selector + anchor (0.60.2), a mode — listen (its text or presence changes → an event with the value), input
        (POST a value → typed into it, human-timed through ErosmancerOS when asked), output (read it on demand) — and a
        name. Each endpoint is a route and a command; its events are declared in the taxonomy; workflows can trigger on
        them. The same field map the provider userscripts use (userscript-field-map.js) finds the element.
      proof: "an endpoint on a page's status text fires an event when it changes; an input endpoint fills a field from a POST"
    TB7_human_tabs_never_spoofed:
      layer: library
      systems: [clear-glass]
      component: clear-glass.fingerprint
      status: "PARTIAL — 0.60.3 headers and UA"
      james: '"can you fix the second image?" (fiverr: It needs a human touch)'
      files: [clear-glass/src/contexts/manager.js, clear-glass/src/fingerprint/engine.js, clear-glass/src/contexts/session-headers.js]
      does: >-
        0.60.3 did the headers and the UA token. Left: the Firefox fingerprint profile and spoof script never touch a page
        a person browses (they are for agent sessions that ask for it), the 'chrome' fingerprint mode exists for real
        (generateChrome), and a per-site 'fingerprint' key on the site node (TB5) can turn spoofing off.
      proof: "a human tab's navigator.userAgent, userAgentData and Sec-CH-UA agree; the spoof script is absent from it"

    # ── Guardian: providers, hats, inputs ───────────────────────────────────────
    PV0_claude_code_is_a_guardian_provider:
      layer: library
      systems: [guardian, core]
      component: guardian.providers.claude-code
      status: "OPEN"
      james: '"lets integrate claude code as a guardian provider, seperate from the provider."'
      depends_on: [PV1_providers_read_from_nodes]
      files: [guardian/data/nodes/provider/claude-code.provider, lib/node-schemas/schema.provider, guardian/lib/dispatcher.js, lib/claude-code-backend.js, lib/agent-providers.js]
      does: >-
        A claude-code.provider node with kind: headless (schema.provider gains kind browser|headless, binary, backend;
        url/hosts/userscriptFile required only for browser). Guardian's dispatcher sends a headless provider's job to
        lib/claude-code-backend.js (ask for questions, run for repo work in a copy, the diff returned as injects), through
        the economy gate, with a .response node like any other job. It stays out of the browser-tab lists (HEADLESS);
        RAID and the door can choose it by name.
      proof: "a guardian /command job with provider claude-code answers through the CLI and lands a .response node; no tab is opened"
    PV1_providers_read_from_nodes:
      depends_on: [PV0_claude_code_is_a_guardian_provider]   # mapped from the files they share: PV0_claude_code_is_a_guardian_provider (lib/agent-providers.js)
      layer: library
      systems: [guardian, core, clear-glass]
      component: guardian.agent-facts
      status: "OPEN"
      james: '"can we have providers be node files?"'
      files: [guardian/lib/agent-facts.js, guardian/lib/provider-routing.js, guardian/server.js, lib/agent-providers.js, lib/pipeline-routing.js, lib/agent-router.js, lib/repo-agent.js]
      does: >-
        The provider nodes already exist (GA1). The ten places that keep their own provider list read agent-facts
        instead (or lib/agent-providers.js, which then reads the nodes, not userscript filenames). A provider is added by
        dropping a node; nothing else changes.
      proof: "a test provider node dropped in appears in guardian /providers, the repo agent's provider list and the routing chain; removed, it disappears from all"
    PV2_hats_are_nodes:
      layer: library
      systems: [core, guardian]
      component: lib.hat-forge
      status: "OPEN"
      james: '"hats also?"'
      files: [lib/hat-forge.js, guardian/lib/node-registry.js, lib/node-schemas/schema.hat]
      does: >-
        Per decision_node_truth: every forge, update, rename and revoke writes guardian/data/nodes/hat/<id>.hat
        (exportHat exists) and the JAA forged_hats table is rebuilt from the files at boot ([A]), or stays the truth with the
        file as its copy ([B]). Either way a hat can be read, diffed, versioned and dropped in as a file.
      proof: "a hat edited in the file is the hat the next dispatch wears; a revoked hat's file says so"
    PV3_input_nodes:
      depends_on: [PV2_hats_are_nodes]   # mapped from the files they share: PV2_hats_are_nodes (guardian/lib/node-registry.js)
      layer: library
      systems: [guardian, copilot, idearium, core]
      component: lib.input-nodes
      status: "OPEN"
      james: '"can we like .response nodes have .input nodes, for not only the payloads for the jobs in guardian, but for the any input into the cli?"'
      files: [guardian/lib/jobs.js, guardian/lib/node-registry.js, lib/node-schemas/schema.input, guardian/cli.js, copilot/cli.js, idearium/cli/index.js, lib/agent-tools/tools/nexus/command.js]
      does: >-
        One writer (lib/input-node.js) for one node type: every guardian createJob writes <jobId>.input beside its
        .response (the full prompt, which .response cuts to 4000), and every CLI entry (guardian cli, copilot cli,
        idearium cli, nexus.command) writes one .input per command: who, what, from where, the session, redacted by the
        activity log's rules; a command marked private writes a stub. 'input' joins GUARDIAN_NODE_TYPES so it is indexed.
      proof: "a job's .input and .response pair by jobId; a CLI command's .input reads back with its session; a pasted key is redacted"
    PV4_inputs_are_history:
      layer: library
      systems: [guardian, copilot, cortex]
      component: lib.input-nodes
      status: "OPEN"
      james: '"then use it as history for chats, diagnostics, contracts, etc."'
      depends_on: [PV3_input_nodes]
      files: [lib/repo-agent.js, lib/agent-memory.js, lib/context-atlas.js]
      does: >-
        The input/response pairs are a source: the 'conversation' block (0.60.3) and agent-memory read them; the context
        atlas searches them; a contract's provenance (RQ13) points at the .input that asked for it; a diagnosis reads the
        inputs before a failure.
      proof: "a contract names the .input it came from; the atlas finds a past request by its words"
    PV5_conversation_carries_across_providers:
      layer: library
      systems: [idearium, core]
      status: "DONE — 0.60.3"
      james: '"i was talking to chatgpt in the code tab and it switched to gemini … i want persistence across chats, and providers"'
      files: [lib/repo-agent.js, lib/repo-prompt-blocks.js]
      does: >-
        The agent taking over a repo conversation gets its last turns (the editable 'conversation' block). Left for PV4: the
        same provider opening a new chat (its chat URL changed) also gets them.
      proof: "repo_agent_log records who answered; a different provider's prompt carries the last turns"
    PV6_raid_reads_health_everywhere:
      layer: library
      systems: [cortex, guardian, idearium]
      status: "DONE — 0.60.3"
      james: '"would routing through raid be better? more stable?"'
      files: [cortex/core/raid/index.js, cortex/core/raid/officiator.js, guardian/server.js, idearium/spec-engine/chunk-dispatch.js]
      does: "RAID's ready() reads agent health in whichever process asks before it decides; the officiator, /command auto and chunk-dispatch call it."
      proof: "decideForContract outside cortex names a connected agent, not claude by default"

    # ── Getting work ────────────────────────────────────────────────────────────
    JB0_gig_files:
      layer: ui
      systems: [clear-glass]
      component: clear-glass.autofill.gig
      status: "DONE — 2026-10-12 (his gig import, committed; .gig YAML and the template)"
      james: '"Can you make a template with a download button in the settings for the fiverr, next to download gig file. maybe you could use a yaml file with a real .gig extension."'
      files: [clear-glass/src/autofill/gig.js, clear-glass/renderer/settings/sections/autofill.js, clear-glass/renderer/gig-panel.js, clear-glass/docs/gigs/gig-template.gig]
      does: "Load a .gig (YAML) or .gig.json, save the gig as <title>.gig, Download template gives an empty gig-template.gig with Fiverr's limits beside each field; all held to the same limits on load."
      proof: "clear-glass/test/gig-file.test.js — template and saved gig load back unchanged"
    JB1_the_agent_writes_the_gig_file:
      layer: library
      systems: [clear-glass, copilot]
      component: clear-glass.autofill.gig
      status: "OPEN"
      james: '"then i want the agent or copilot to be able to generate them for me."'
      depends_on: [JB0_gig_files, JB2_the_copilot_hat_agent_and_account]
      files: [clear-glass/src/autofill/gig.js, lib/agent-tools/tools/clear-glass, clear-glass/src/copilot/verbs.js]
      does: >-
        An agent tool (clear-glass.gig: write / file / list) and a copilot verb ("write me a gig for …") run buildGigPrompt
        with his profile through the copilot hat's agent, parseGig the answer, and save it as a .gig in his downloads (and
        the gig panel), with the warnings. Nothing is published; the file is his to edit and load.
      proof: "asking the copilot for a gig leaves a .gig that loads without warnings beyond the ones it reported"
    JB2_the_copilot_hat_agent_and_account:
      depends_on: [TB2_a_tab_runs_as_an_account]   # mapped from the files they share: TB2_a_tab_runs_as_an_account (clear-glass/src/options/store.js)
      layer: ui
      systems: [clear-glass, copilot, guardian]
      component: clear-glass.copilot.hat
      status: "OPEN"
      james: '"can you have the copilot in clearglass have account settings for each provider. like setting the agent for the copilot hat, and setting the account?"'
      files: [clear-glass/src/copilot/hat.js, clear-glass/src/options/store.js, guardian/lib/account-routing.js]
      does: >-
        Settings → Copilot: which agent wears the copilot hat (any provider, ollama, claude-code), and for each provider
        which account it runs as. The account choice is a guardian account-routing rule with hat: the copilot's hat (0.60.2),
        so the switch happens in one place; the agent choice is the hat's base agent.
      proof: "the copilot set to chatgpt as account B: its next job switches the chatgpt tab to B (the route log says why)"
    JB3_autofill_fields_mapped_by_pick:
      layer: ui
      systems: [clear-glass, guardian]
      component: clear-glass.autofill.field-map
      status: "OPEN"
      james: '"use the interaction field, nexus nerve, and guardian picker if needed to map the autofill elements if it doesn''t work. maybe the browser asks me if it"'
      depends_on: [TB5_site_and_account_nodes]
      files: [clear-glass/src/autofill/matcher.js, clear-glass/src/page/field.js, clear-glass/src/page/attention.js, clear-glass/renderer/selector-check.js, guardian/userscript-field-map.js]
      does: >-
        When a fill leaves fields unmatched (or matched below confidence), the browser asks — through Nexus Nerve's
        attention layer (src/page/attention.js, docs/nexus-nerve.spec: it knows which window he is looking at), one
        short question per field in the interaction field ("which box is your phone number?"), he clicks it, the pick is checked by selector-check
        and saved with its anchor on the site node. Next time that site fills without asking. Unanswered fields are left
        empty, never guessed.
      proof: "a form the matcher misses two fields on: two clicks, then a refill of the same form fills all of them"
    JB4_resume_import:
      depends_on: [JB0_gig_files]   # mapped from the files they share: JB0_gig_files (clear-glass/renderer/settings/sections/autofill.js)
      layer: library
      systems: [clear-glass]
      component: clear-glass.autofill.resume
      status: "OPEN"
      james: '"also importing a resume to autofill."'
      files: [clear-glass/src/autofill/store.js, clear-glass/renderer/settings/sections/autofill.js]
      does: >-
        Import a resume (PDF, DOCX or text): its text is read, the profile fields it states (name, email, phone, links,
        work history, education, skills) are proposed for his review — never written without it — and the file becomes
        documents.resume. A page's file input is attached by the browser on his click (the honest limit stays: a script
        cannot set a file input), or through ErosmancerOS's CDP file chooser where he allows it.
      proof: "a resume imported fills a job form's text fields after he accepts the proposed fields; the file input gets the file"
    JB5_varied_wording_true_facts:
      layer: library
      systems: [clear-glass, copilot, core]
      component: clear-glass.autofill.wording
      status: "OPEN"
      james: '"also use the semantic randomizer and behavior engine to change up the wording."'
      files: [lib/semantic-variant.js, copilot/lib/reword.js, guardian/lib/eros-typist.js]
      does: >-
        Free-text answers (cover letter, why this role) are drafted from his profile and the posting, then varied per
        application by the semantic variant (exact names, numbers, dates and links protected) and checked against his
        profile; typed with human timing when he asks. Each sent text is kept on the application (JB6) so the next one is
        novel against it.
      proof: "two applications to similar roles get different wording with identical facts; a changed fact is refused"
    JB6_the_application_ledger:
      depends_on: [JB4_resume_import]   # mapped from the files they share: JB4_resume_import (clear-glass/src/autofill/store.js)
      layer: library
      systems: [clear-glass]
      component: clear-glass.applications
      status: "OPEN"
      james: '"i need to reduce as much overwhelm and repitition as possible, i have adhd and its miserable."'
      files: [clear-glass/src/autofill/store.js, lib/node-schemas/schema.application]
      does: >-
        Every application is an .application node: company, role, URL, date, account, the resume and texts sent, the
        contact email when the page shows one, status (sent, heard back, interview, no). One list screen with what needs
        him next and nothing else — the overwhelm is the number of places, so it is one place.
      proof: "an application filled through Clear Glass appears in the list with its texts and the follow-up date"
    JB7_the_follow_up:
      layer: library
      systems: [clear-glass]
      component: clear-glass.applications.follow-up
      status: "OPEN"
      james: '"then what if after each application, we schedule an automated email as a follow up to the company email automatically."'
      depends_on: [JB6_the_application_ledger, JB5_varied_wording_true_facts]
      files: [clear-glass/src/automation/cron.js, clear-glass/src/automation/steps.js]
      does: >-
        After an application with a contact email, a follow-up is drafted (varied, true) and scheduled (default 5 working
        days) as a workflow on the cron. Sending follows decision_followup_send (default: he approves each one) over
        decision_mail_channel (default: his webmail in a Clear Glass tab as that account). A reply or a status change
        cancels it. At most one follow-up per application unless he says otherwise.
      proof: "an application with a contact email shows a scheduled draft; approving it sends one email and records it on the application"

    # ── How work is mapped ──────────────────────────────────────────────────────
    MX0_phases_tagged_to_components:
      layer: library
      systems: [loom, idearium]
      component: loom.scanners.phasemap-map
      status: "OPEN"
      james: '"what about phasemap per module or component? or at least tag it as such?"'
      files: [loom/scanners/phasemap-map.js, idearium/repo/roadmap.js]
      does: >-
        A phase's `component:` line (as written on every phase of this map) is read by loom's parser and returned, and
        roadmap.addPhase takes systems and component so a phase added by Idearium is tagged. Loom answers "every phase of
        component X, across every map" — the per-module phasemap as a view.
      proof: "loom lists this map's TB phases under clear-glass.renderer.tabs and its PV phases under their components"
    MX1_nothing_built_unmapped:
      layer: library
      systems: [idearium, cortex]
      component: idearium.repo.roadmap
      status: "OPEN"
      james: '"like everything needs to be mapped to a physical file, either propose addendum or edit to the phasemap, or spec for the relevant spec. then phase it in pieces" · "I dont want anything to go unmapped."'
      depends_on: [MX0_phases_tagged_to_components]
      files: [idearium/repo/roadmap.js, idearium/repo/living-spec.js, idearium/lib/workshop.js]
      does: >-
        The rule in code: a request Idearium is asked to build is first written as a phase (addPhase, tagged) in the right
        phasemap or as a proposed addendum to the right spec (the workshop's proposal, accepted by him), and only a mapped
        phase can be built. This is the front door of the request spine (RQ11, RQ13); this phase is the rule, the spine
        is the machinery.
      proof: "a code-tab request with no phase is answered with the proposed phase, not code; accepted, it builds"
    MX2_the_0_60_components_wired_in_loom:
      layer: library
      systems: [loom]
      component: loom.maps.accounts-authority-map
      status: "PARTIAL — 0.60.5: loom/maps/component-intake-map.js wires lib/project-decompose.js and idearium/api's requires of phase-plan, plan-learning and repo-run-state; the clear-glass and guardian 0.60.x files are scanned (the source scanner declares them and their requires); left: confirm each has a wire after a from-scratch bootstrap"
      james: '"I dont want anything to go unmapped."'
      files: [loom/maps/component-intake-map.js, loom/maps/accounts-authority-map.js, loom/maps/observability-map.js]
      does: >-
        Debt owned by the coder (docs/CLAUDE.md rule 3: every new component is mapped into loom WITH its require/consumer
        wires): 0.60.0–0.60.3 added lib/phase-plan.js, lib/plan-learning.js, lib/repo-run-state.js,
        guardian/lib/provider-attention.js, clear-glass/src/providers/attention.js, guardian/lib/account-routing.js,
        clear-glass/src/providers/account-switch.js, guardian/userscript-field-map.js and the RAID ready() path without
        loom wires. Each is declared with its real edges (who requires it, what it emits) in the map that owns its area.
      proof: "loom's context graph shows each of them with at least one real wire; loom's declared-vs-served scanner finds no orphan among them"
    MX4_one_system_digest:
      depends_on: [TB3_tabs_are_compartments, PV3_input_nodes]   # mapped from the files they share: TB3_tabs_are_compartments (lib/activity-log/compartment.js), PV3_input_nodes (lib/agent-tools/tools/nexus/command.js)
      layer: library
      systems: [core, cortex]
      component: lib.system-digest
      status: "OPEN"
      james: '"can we make an agent to check a systems recents events, inject the orchastratory in chunks. like i want the chunking and indexing context to synthesize to be a agnostic tool."'
      files: [lib/ledger-writer.js, lib/error-log.js, lib/activity-log/compartment.js, lib/agent-tools/tools/nexus/command.js]
      does: >-
        One read for "what has system X (or repo Y) done lately": the ledger's events, the error log, the activity log
        and the repo's tasks and phase runs, merged by time, grouped by kind, faults first, cut into chunks a small model
        can take one at a time. A nexus.command row and an agent tool; RQ17 reads it per request, an observer agent reads
        it per system.
      proof: "the digest of guardian over the last hour names its faults first and fits the chunk size it was asked for"

    # ── ADDENDUM 1.1.0 (2026-10-13) ─────────────────────────────────────────────
    RN0_the_renderer_as_a_cos_window:
      layer: ui
      systems: [clear-glass]
      component: clear-glass.renderer.theme
      status: "DONE — 0.60.5"
      james: '"can you build the renderer.html as a compartment os ui, like the ones the desktop envirement use. i like those. theyre beautiful."'
      files: [clear-glass/renderer/cos-theme.css, clear-glass/renderer/browser.html, clear-glass/renderer/settings.html, clear-glass/renderer/library.html]
      does: >-
        Clear Glass's browser window, settings and library wear the COMPARTMENT OS window: the title bar from
        idearium/ui/js/window-chrome.js (gradient bar, ▣ glyph, COMPARTMENT · BROWSER, 44px window buttons, red close) and
        the toolbar from idearium/ui/desktop.html (panel, lines, buttons, pills). One stylesheet loaded after the old one —
        remove its <link> and the old look returns; no behaviour changed.
      proof: "tests/modules/test-project-decompose.test.js WR-04; the UI-reading suites unchanged. Not yet looked at in the running app."
    CS0_projects_decomposed_into_components:
      layer: library
      systems: [core, idearium]
      component: lib.project-decompose
      status: "DONE — 0.60.5"
      james: '"i want to be able to copy projects and decompose them into components for the component store with the dependancies zipped together in a organized structured way. like make a tool for it"'
      files: [lib/project-decompose.js, lib/component-store.js, idearium/api/index.js, idearium/cli/route-commands.js, loom/maps/component-intake-map.js]
      does: >-
        A project (a zip or a folder) → every code file a component in the component store (requires resolved whatever
        order the files come in, npm packages named, builtins not, a require that points nowhere reported); a component +
        everything it requires → one zip at the project's own paths with component.json (versions pinned), package.json
        (the project's npm versions) and a README. Routes components.decompose / components.bundle; commands components,
        components decompose, components bundle (every agent has them); mapped in loom with its wires.
      proof: "tests/modules/test-project-decompose.test.js PD-01–PD-10"
    CS1_drop_zips_to_decompose:
      layer: ui
      systems: [idearium]
      component: idearium.ui.components-panel
      status: "DONE — 0.60.5"
      james: '"as well as a way to drag and drop zips to do it automatically."'
      depends_on: [CS0_projects_decomposed_into_components]
      files: [idearium/ui/js/components-panel.js, idearium/ui/index.html]
      does: "Bring in → Decompose into components: drop one or more project zips and each is decomposed at once; search the store; ⬇ bundle downloads a component with its dependencies."
      proof: "WR-03; not yet clicked through in the running app"
    CS2_uploaded_projects_managed:
      layer: library
      systems: [idearium, cortex, cos]
      component: idearium.repo
      status: "OPEN — mapped onto what exists"
      james: '"can I upload some projects and see if you can give nexus the ability to manage, expand, debug, and test them?"'
      depends_on: [CS0_projects_decomposed_into_components]
      files: [idearium/api/index.js, lib/project-container.js, cos/testenv/index.js]
      does: >-
        Upload already exists: Bring in → Import project turns a zip into a repo (repo.import-archive, a COS compartment,
        indexed, chunked). Managing it is the repo's tabs (Files, Code, Phases, Versionium, Settings → environment). The new
        part is what the request spine adds, applied to an imported repo: expand = a request mapped, contracted and phased
        (RQ7–RQ13, MX1); debug = RQ17 (observe by request) and RQ16; test = cos/testenv runs its own tests in a guest
        (exists) and RQ18 (test and attack intents). The proof is his: he uploads real projects and each of the four is
        done on one of them, end to end, with what failed written down.
      proof: "one of his uploaded projects: imported, its tests run in COS, one request expanded it through a contract, one failure observed and fixed"

    # ── ADDENDUM 1.2.0 (2026-10-13) ─────────────────────────────────────────────
    AS1_provider_tab_runs_as_the_default_account:
      layer: backend
      systems: [clear-glass, guardian]
      component: clear-glass.src.providers.account-switch
      status: "DONE — 0.60.12 (tests 9/9; not yet run live in Clear Glass)"
      james: '"the logins for the agent providers needs to be all the same. the accounts and sign in, isn\'t wired into the provider tabs in clearglass. fix that please."'
      context: >-
        Accounts & sign-in (login-portal) saved to persist:mesh-<provider>-<id> and the vault; provider tabs ran in
        persist:ncp-<provider>; only guardian's per-job routing (account-switch.use) crossed between them. Read from his
        screenshots: ChatGPT's tab showed Log in while its account said Signed in. The coder's reading: "the same" means one
        identity per provider, so the tab follows the default account. To confirm: whether he wants the tab to follow guardian's
        per-job routing for the whole job (it still does) or return to the default after it (the next sync does).
      files: [clear-glass/src/providers/account-switch.js, clear-glass/src/providers/host.js, clear-glass/src/main/index.js, clear-glass/src/ipc/bridge.js, clear-glass/renderer/settings/sections/accounts.js, clear-glass/renderer/settings/sections/providers.js, idearium/cli/route-commands.js]
      does: >-
        sync(provider) restores the default account's saved sign-in into the tab before its first load; a sign-in the tab
        holds that the account lacks is saved to the account, never overwritten. Saving a session, starring and signing out
        follow through to the tab and say what they did. signedOut() signs the tab out when it runs as that account.
      proof: "clear-glass/test/provider-account-sync.test.js 9/9; then live: sign in once, restart Clear Glass, the ChatGPT tab opens signed in"
