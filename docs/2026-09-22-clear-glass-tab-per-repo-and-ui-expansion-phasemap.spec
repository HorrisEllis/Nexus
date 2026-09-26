spec:
  meta:
    name:        clear-glass-tab-per-repo-and-ui-expansion
    version:     0.1.0-phasemap
    status:      PHASEMAP 2026-09-22. James: "What if each container gets a
                 dedicated tab, for each repo. Make sure it's all wired in
                 correctly end to end." / "clearglasses ui needs to be built
                 more, almost none of it is here in the index.html file. have
                 been told its been build three times now."
    uuid:        nexus-cg-tabperrepo-ui-v0-0000-2026-0922-001

  diagnosis_verified_2026_09_22:
    tab_per_repo:
      symptom: >-
        Reported alongside "the agent isn't working — creates the job,
        dispatches, gets ack, no completion" (fixed 0.39.212/0.39.213 —
        unrelated root causes, a JAA cross-process staleness bug and a
        silently-swallowed exception). Tab-per-repo is a SEPARATE, real
        proposal, not a symptom of that bug — checked directly, not assumed.
      root_cause: >-
        clear-glass/src/main/index.js's own windows Map IS already keyed by
        agentId (windows.set(agentId, win) — line 2046) — the mechanism
        tab-per-repo needs already exists and is exercised elsewhere (screen-
        qa, autofill both take an explicit agentId). What's missing is
        upstream: lib/repo-agent.js — the module idearium's whole repo-
        compartment agent dispatch goes through — has ZERO references to
        agentId anywhere in the file (grepped directly). Its routeFor()
        resolves to {backend:'guardian', agent: provider}, and guardian's own
        NCP dispatch then picks whichever pre-warmed provider tab happens to
        be live — one shared chatgpt tab, one shared claude tab, system-wide.
        Every repo compartment's "conversation" is a real, separate
        sessionId (sessionIdFor(repoUuid) — already correct, server-side
        history genuinely is per-repo) layered on top of a SHARED browser
        tab per provider. Concurrent dispatches from two repos to the same
        provider interleave through the one tab; nothing is currently
        wrong about this until James works two repos' agents at once, at
        which point they contend for and can visibly interrupt each other
        in the one live tab.
      distinct_from_ui_expansion: >-
        This diagnosis is about DISPATCH ROUTING (which browser tab a
        repo's prompt goes to), not about how many browser WINDOWS exist —
        a "dedicated tab" does not have to mean a permanently open, visible
        window per repo; it can mean a per-repo background tab (clear-glass
        already has this concept — bgTabs, "same chrome as an agent window,
        never shown", clear-glass/src/main/index.js's own background-tabs
        section) that guardian's dispatch targets by a real, repo-derived
        agentId instead of falling through to whatever's live.

    ui_expansion:
      symptom: >-
        "almost none of it is here in the index.html file... told it's been
        built three times." Checked directly, not from memory or changelog
        claims: clear-glass has NO index.html of its own at all — its real
        UI files are renderer/browser.html (514 lines, the main chrome) and
        renderer/settings.html (483 lines). The closest thing to an "index"
        is ui/library/index.html (137 lines + library-app.js 394 lines),
        built THIS session (0.39.207) specifically because it had existed as
        an empty shell with a <script src> pointing at a file that did not
        exist — the exact shape of "claimed built, not actually there" this
        symptom describes. Total real UI code across clear-glass + its two
        satellite pages (library, settings): ~25.4k lines of .js across
        renderer/src, but concentrated almost entirely in ONE file —
        renderer/browser.js is the vast majority of it, a monolith the
        library page was deliberately built OUTSIDE of ("James: 'library
        ui... its own file. no monoliths.'" — already a stated, existing
        principle this phasemap extends, not invents).
      root_cause: >-
        Every clear-glass capability built across this whole session
        (macros, autofill, screen-qa's hotkey/right-click/picker/settings)
        landed as MORE code added to the SAME renderer/browser.js monolith
        (now over the size where "almost none of it is here" reads as true
        for any one capability someone goes looking for — it is there, but
        buried in one enormous file alongside everything else, not in its
        own discoverable place). The one deliberate exception is ui/library,
        already following the "own file, no monoliths" principle. No other
        UI surface (autofill profile management partially lives in
        library's Autofill tab already; screen-qa's settings section lives
        in settings.html; macros' management lives in library) currently
        gets that treatment consistently — this phasemap is about applying
        it as policy, not inventing a new pattern.

    downloads_manager_redundant_record:
      status: >-
        SUBSTANTIALLY ALREADY BUILT, not a gap — checked before phasemapping
        it as one. guardian/lib/response-sink.js's DOWNLOADS sink (wired to
        ncp-handler's completion path this session, 0.39.213) already posts
        every real NCP-dispatched provider response into Clear Glass's
        downloads manager as a durable, independent record — exactly "the
        downloads manager for the provider chats, as a redundant record."
        ui/library's Downloads tab already lists it. What's NOT yet true:
        the standalone library UI doesn't yet surface these as
        provider-CHAT records specifically (it shows them mixed with real
        file downloads) — a real, smaller, separate polish item, not a new
        system. Named here so it isn't silently re-built from scratch.

  governing_principles:
    - "reuse before build — windows Map's agentId keying and lib/repo-agent's sessionIdFor already exist; TR1 wires them together, it does not invent per-repo isolation from nothing."
    - "one implementation, not two — a monolith growing forever is itself a form of duplication (the same concerns re-solved inline each time); UI1 stops that, it doesn't introduce a second UI framework."
    - "nothing silently fails — TR1's dispatch must fail loudly (a named error) if a repo's dedicated tab can't be reached, never silently fall back to the shared one without saying so."
    - "gaps are addressed, not assumed — the downloads-manager item's real, already-built status was verified by reading response-sink.js and its own test file directly before this phasemap claimed anything about it, either way."

  phases:

    AN1_anchor_node_capture:
      does: >-
        The five guardian userscripts stop deciding a job is finished by
        "the last assistant message stopped changing" and instead ANCHOR:
        at inject time record the message container that exists right then;
        the response is the node created AFTER it; stream and settle from
        that node only. 0.39.215 shipped the cheap version of this — a
        baseline element/text comparison that REFUSES the previous answer
        — which closes the reported bug ("it used the first response from
        the first job for the second attempt") but is a guard over a weak
        anchor, not a real anchor. This phase replaces the guard with the
        anchor, which makes the stale class impossible by construction,
        makes the delta stream exact (one known node, not a re-read of the
        whole pane), and is the precondition for two jobs safely sharing
        one tab.
      reuse: >-
        The userscripts' existing MutationObserver + GUARDIAN_CHUNK delta
        stream (already sends delta, full text and chatUrl), and guardian's
        existing ncp.stream.chunk -> per-job _streamBuffer -> STREAM_TOKEN
        accumulator. Nothing new is invented for streaming; this phase gives
        it an exact source node.
      gate: >-
        With the previous answer on screen and a new job injected, the
        completion text is the new node's text and never the previous one —
        proven by the existing test-guardian-job-correlation harness
        (real startWatch per provider) extended with an anchored case; and
        a job that never answers still reports a loud no-reply.
      drift: >-
        Each provider's DOM names its message container differently, so the
        anchor selector is five real, separately-verified selectors, not one
        shared guess. Provider DOM churn is the standing maintenance cost.

    CLI1_headless_dispatch_via_mesh:
      does: >-
        A real CLI path that dispatches a job with no UI at all — James:
        "supposed to work without the ui, all cli based first." 0.39.215
        removed the UI DEPENDENCE (backgroundThrottling was throttling the
        userscript watch loop in hidden windows) but that is a symptom fix:
        dispatch still goes through pre-warmed provider windows. This phase
        routes a CLI dispatch through the mesh's job API instead.
      reuse: >-
        clear-glass/src/mesh/dom-transport.js — already job-based (send ->
        jobId, getJob polls), already IDEMPOTENT by jobId (a guardian
        restart re-asks and gets the running job rather than re-sending an
        expensive prompt), already ONE LANE PER agentId. guardian/lib/
        mesh-client.js already constructs a client to it; guardian/cli.js
        already exists as the entry point.
      gate: >-
        A job dispatched from the CLI completes with every clear-glass
        window closed, and its result and chat url are recorded the same way
        a UI-dispatched job's are.
      drift: >-
        The mesh path and the NCP userscript path currently record results
        through different code; this phase must not create a second result
        shape — see TX1.

    TX1_converge_the_three_transports:
      does: >-
        There are now THREE ways to talk to a provider tab: the NCP guardian
        userscripts, the mesh's dom-transport with its own injected
        page/agent-page.js, and clear-glass/src/driver. Three transports mean
        three places for the same class of bug — the stale-reply bug was
        found in one of them only. Pick ONE and make the others call it.
        Recommended: dom-transport, because it already has jobs, idempotency
        by jobId and per-agentId lanes; the userscripts become its page
        layer rather than a parallel protocol.
      reuse: "dom-transport's job API and lane model; the userscripts' real, provider-specific DOM knowledge, which is the part worth keeping."
      gate: "exactly one code path sends a prompt to a tab and one shape records its result; the other entry points are thin adapters, proven by deleting no behaviour (a real before/after functional diff per provider)."
      drift: >-
        This is the largest and most invasive of these phases and touches the
        live dispatch path that 0.39.212/213/215 all fixed. It is sequenced
        last deliberately and is the one most likely to be split further once
        AN1 and CLI1 expose what the real shared surface is.

  ordering_rationale: >
    §UPDATE 2026-09-22 (post TR1/TR2 closure) — TR1 and TR2 shipped out of
    the order drafted below (before AN1/CLI1), by James's own real work.
    Original rationale kept for the record: AN1 first, it is the
    correctness fix underneath the bug James hit twice ("injected, didn't
    recieve back" and the first job's answer reused for the second).
    0.39.215's guard stops the wrong answer being returned; AN1 removes
    the possibility. Everything else — exact streaming, two jobs in one
    tab — rests on having a real anchor. CLI1 second: "all cli based
    first" is the stated default, and the substrate (dom-transport jobs,
    mesh-client, guardian/cli.js) already exists, so this is wiring, not
    invention. TX1 last: convergence is only safe once AN1 and CLI1 have
    shown what the genuinely shared surface is, and it touches the same
    live dispatch path three recent fixes did. AN1 and CLI1 remain open,
    in that order, as the active queue.

  honest_risks:
    - "AN1 replaces a guard that is currently WORKING (0.39.215, 34/34 tests, mutation-checked). The anchor must be proven per provider before the guard is removed, or a real fix is traded for a cleaner one that regresses."
    - "CLI1 and TX1 both assume dom-transport is the right convergence target. That is a judgement from reading it, not from running it headless end to end — CLI1 is also the phase that tests the assumption."
    - "UI1's file-count is a judgment call, not a formula — over-splitting (one file per tiny widget) recreates the coordination cost monoliths avoid; this phasemap does not pre-decide the granularity."
    - "TR2's real remaining gap (nothing calls ensureAgentTab yet) means the whole tab-per-repo thread is still capability without a trigger until something wires it — see closed_2026_09_22 above, not re-litigated here as if unknown."

  closed_2026_09_22:
    note: >-
      §UPDATE 2026-09-22 (later same day, after this phasemap's own
      2628bb7 edit) — TR1 and TR2, drafted above as future work, were
      built and closed by James's own real commits on his machine before
      this file was updated to say so. Moved here rather than left
      describing undone work that is actually done — the phasemap itself
      would otherwise be the stale artifact this whole exercise exists to
      prevent.
    TR1_repo_derived_agentId_in_dispatch:
      status: "CLOSED — commit 838d3c8 (v0.39.217 c270920 closed it end to end)."
      what_shipped: >-
        Traced the WHOLE chain, not just the one link originally diagnosed
        here: lib/repo-agent.js sets payload.agentId = repo-<uuid> on
        guardian dispatches; copilot/server.js forwards it for backend
        'guardian'; copilot/lifeline.js's _tryGuardian posts it to guardian
        /api/copilot/prompt; guardian/ask.js passes it into createJob;
        guardian/lib/dispatcher.js aims the job with
        ncp.pushTab(job.provider, job.agentId), falling back to
        pushActive when no such tab exists. The REAL break, found only by
        tracing every link: the userscripts invented MY_TAB as a random
        sessionStorage id, so no tab ever registered under tabId=agentId
        and pushTab always missed. Fixed at both ends: clear-glass
        ProviderHost gained agentId-aware _stampAgent() (sets
        window.__NEXUS_AGENT_ID + sessionStorage gd_agent_id before
        injection); all five userscripts prefer that stamp as MY_TAB,
        falling back to their own random id when unstamped — an ordinary
        shared provider tab is unaffected. A tempting second routing
        mechanism (ncp.js push(provider, data, {agentId})) was written
        and then reverted: pushTab already did this correctly.
      real_gap_named_at_close: >-
        Nothing yet CALLED _inject with an agentId when 838d3c8 landed —
        the chain was complete but unexercised. TR2 (below) is what
        started calling it.
      tests: "test-guardian-job-correlation.js grew 34 -> 50, asserting the chain link by link; mutation-checked."

    TR2_tab_lifecycle_and_visibility:
      status: "CAPABILITY CLOSED, TRIGGER OPEN — commit 48d5edf (v0.39.218)."
      the_lifecycle_decision_this_phase_deferred: >-
        Answered by James, not guessed: a repo's tab OPENS ON FIRST
        DISPATCH AND STAYS OPEN, hidden by default, viewable on demand,
        bounded by an LRU cap (CG_AGENT_TAB_MAX, default 6) and an idle
        close (CG_AGENT_TAB_IDLE_MS, default 15min) — reasoning given, not
        just preference: a provider page load is slow and the chat IS the
        conversation lane repo-agent's sessionId already assumes, so
        open/dispatch/close would throw that session away every call; and
        "kept open indefinitely" was this phasemap's own named drift risk
        for TR1, so bounded rather than unbounded closes it honestly.
      what_shipped: >-
        clear-glass ProviderHost gained its own agentTabs registry, keyed
        separately from this.windows (checked first: every existing
        consumer of that map assumes the key IS a provider id; a composite
        key there would have quietly broken them all). New
        ensureAgentTab/showAgentTab/closeAgentTab/listAgentTabs;
        _enforceAgentTabCap and _sweepIdleAgentTabs hooked into the
        EXISTING idle sweep, not a second timer.
      real_gap_named_at_close: >-
        Nothing calls ensureAgentTab yet. Guardian's dispatcher is the
        natural trigger, but clear-glass's POST /cmd emits bus events
        rather than invoking the ipcMain handlers directly, so the
        reachable path from guardian was not confirmed and no caller was
        wired on a guess. Until something calls it, TR2 is capability
        without a trigger — behaviour is byte-for-byte what it was before
        this phase. This is the one real remaining piece of the whole
        tab-per-repo thread.
      tests: "test-guardian-job-correlation.js grew 50 -> 60; mutation-checked (cap disabled -> 3 fail; idle close disabled -> 1 fail)."

  archive_superseded_2026_09_22:
    note: >-
      §0.3 — retained verbatim, NOT cancelled. These two phases are the UI-
      expansion half of this phasemap and are unrelated to the dispatch/
      correctness thread (AN1, CLI1, TR1, TR2, TX1) that James prioritised
      after the 0.39.215 job-correlation work. They move here so the active
      phase list is the work actually queued; re-promote them into `phases`
      when the dispatch thread is done. Nothing about them is retracted.
      UI1_progress_2026_09_23: >-
        Applied to Settings (v0.39.223): renderer/settings.html is a shell over
        renderer/settings/core.js + sections/*.js, one file per area, no
        inline script. browser.js's monolith is untouched — UI1 for the main
        chrome is still open.
        v0.39.227: Settings now fully meets it — 14 area JS files + 14 area CSS
        files (James: "including css file per ui file"), area CSS scoped to
        body[data-area], enforced by tests/modules/test-cg-settings-ui-files.test.js.
      UI1_one_file_per_ui_area:
        does: >-
          Extract each real, distinct clear-glass UI capability currently
          living inside renderer/browser.js's monolith into its own file,
          following ui/library's already-established pattern (own HTML/CSS/
          JS, served the same real way, no framework change). Candidates,
          by what's genuinely separable: the Co-pilot panel, the macros run-
          modal + agent-picker, the screen-qa preview/settings UI currently
          split between browser.js and settings.html, the context-menu/
          picker system. Each extraction is verified against real, existing
          behavior (a before/after functional diff), not a rewrite.
        reuse: "ui/library/index.html + library-app.js's own real, working split as the template — not a new pattern invented for this phase."
        gate: "renderer/browser.js's own line count goes DOWN by a real, measured amount per extraction; each extracted UI is independently loadable/testable the way library-app.js already is (jsdom-smoke-testable, proven this session)."
        drift: "how many pieces this splits into, and where the line falls between 'core chrome' (stays in browser.js) and 'a real separable feature' (gets its own file), is the actual design work here — not a fixed number decided in advance."

      UI2_downloads_manager_chat_view:
        does: >-
          ui/library's Downloads tab distinguishes provider-chat records
          (guardian's response-sink DOWNLOADS sink) from real file downloads
          — a real, small filter/label, not a new capture system (already
          built and wired, per diagnosis above).
        reuse: "response-sink.js's existing kind:'chat' field on every record it already writes."
        gate: "a person can filter the Downloads tab to 'provider chats only' and see exactly what response-sink has been recording since 0.39.213."
        drift: "none named — this is the smallest, most mechanical phase here."
