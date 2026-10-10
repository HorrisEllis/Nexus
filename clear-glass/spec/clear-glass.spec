spec:
  meta:
    name:        clear-glass
    version:     3.24.0   # 0.39.357 MINOR — the driver's page.dblclick(sel). Previous 3.23.0: 0.39.301 MINOR — the Fiverr gig writer (src/autofill/gig.js); was 3.22.0, 0.39.281 MINOR — browser steps with ErosmancerOS input; the ErosmancerOS workbench. Previous: 3.21.0 0.39.280 MINOR — compartment windows, co-pilot verbs. 3.18.0–3.20.0 were in lib/version.js and the addenda only — synced here (§5.4). Previous 3.17.0:
    foundation:  nexus-system-foundation@1.1.0
    port:        7702
    uuid:        nexus-clear-glass-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      Sovereign NEXUS browser — Electron + Chromium + Firefox fingerprint +
      TLS JA4 + ErosmancerOS wire (SISO-native). Real, running system with
      no prior .spec despite being one of the most actively developed
      subsystems in this codebase (67 real components as of this session,
      confirmed in clear-glass/registry-components.js). This spec is
      written FROM that live registry-components.js contract, not from
      scratch — §8.6 reuse-before-build, applied to spec authorship itself.
    written_from: >
      clear-glass/registry-components.js (the real, served-at-GET-/contract
      module, verified by orchestrator's contract-handshake on boot) — same
      shape copilot and eravos already use. This spec restates that real
      contract in the standard system-spec shape; it does not invent new
      surface.

  core:
    ports:
      ipc:  7702   # IPC server — orchestrator polls /contract here
      sse:  7701   # SSE fan-out (also referenced by lib/version.js's
                   # own 'clear-glass' entry as the sovereign browser shell)
      tls:  7703
      wire: 7704

    axioms:
      - AX-001  validate all inputs at boundary
      - AX-002  no silent failures — bus event on error
      - AX-004  self-describing — registry-components.js served at /contract
      - AX-010  sovereign transport — no cross-system require() into this tree

  events:
    emits:
      - 'clear-glass.boot.complete'
      - 'clear-glass.window.opened'
      - 'clear-glass.registered'
      - 'clear-glass.shutdown'
      - 'eros.hostile.detected'
      - 'eros.behavior.plan'
      - 'lifecycle.ready'
      - 'nexus.status'
      - 'selectors.assigned'        # 0.39.251 — SSE: a picked selector guardian recorded
      - 'selectors.assign.failed'   # 0.39.251 — SSE: refused here or by guardian, reason included
    handles:
      - 'orchestrator.shutdown'
      - 'cortex.raid.decide'
      - 'guardian.job.dispatch.receive'

  routes:
    - method: GET
      path: /contract
      returns: "Full clear-glass component registry — 79 real components as of 2026-09-22 (was 67 at 2026-09-01)"

  handshake:
    components_count: 109   # 0.39.301 — +5 (autofill.proposal, autofill.readPage — shipped 0.39.265, never registered — and autofill.gig, .gigDetect, .gigFill). 0.39.251 — +2 (selectors.providerFor, selectors.assign). §2026-09-22 — was 67 (stale since 2026-09-01); autofill's 7 real
                            # IPC methods (shipped 2026-09-19, never registered) and screen-qa's
                            # 5 (this session) both landed in registry-components.js with zero
                            # entries here — checked directly against the live registry export,
                            # not assumed. See clear-glass.spec's history: entry below.
    component_families:
      - callto-index
      - download-listeners
      - site-settings
      - history
      - extensions
      - bookmarks-with-state
      - rewind
      - passwords
      - speech-to-text
      - macros
      - background-tabs
      - autofill    # §2026-09-22 — real since 2026-09-19, only registered this session
      - screen-qa   # §2026-09-22 — new this session
      - selectors   # 0.39.251 — element picker assigns provider selectors
    note: >
      Every component is transport IPC, not HTTP — clear-glass is an
      Electron shell, and its real "routes" are ipcMain.handle() channels
      (method: 'IPC', path: <channel name>), not URL paths. This matches
      registry-components.js's own real shape exactly; a spec claiming
      HTTP method/path pairs for these would misrepresent the transport.

  modules:
    - id: glass-driver
      path: clear-glass/src/driver/glass.js · clear-glass/src/driver/glass-host/main.js
      description: >
        NEW 0.39.263 (clear-glass 3.17.0) — James: "playright? no what is that for? litterally have clearglas".
        Drive a real page in Clear Glass's own engine from Node. glass.js spawns Electron on
        glass-host/main.js; the host opens a BrowserWindow per page and speaks the DevTools
        protocol in-process (webContents.debugger), relaying replies and events over stdio
        lines prefixed "§G ". Without a display it runs --ozone-platform=headless with
        offscreen windows. Machines without the Electron binary fall back to any Chromium
        (GLASS_CHROMIUM) over its DevTools websocket. API: chromium.launch() → newPage({viewport})
        → goto/evaluate/click/fill/selectOption/keyboard.press/locator/$/$$/$eval/$$eval/
        waitForSelector/waitForFunction/route/exposeFunction/addInitScript/cdp/screenshot;
        selectors CSS + text= + :has-text() + a >> b. Proven: tests/modules/test-nexus-atlas-and-glass
        CG-002 (a wrapped inline element is clicked on its first line box) and every tests/probe/*.js.
    - id: chat-transcripts-index
      path: clear-glass/src/downloads/artifact-chat-index.js · src/ipc/bridge.js /cli/downloads/responses · renderer/library/sections/responses.{js,css}
      description: >
        NEW 0.39.254 — James: "getting the download manager logging agent chats" …
        "i want nexus to help remember. persistent memory for ai agents." Every
        provider chat is ONE versioned record in the downloads index: kind
        'transcript', keyed chat_key = provider:chatId, fields version,
        transcript_hash (sha256 of the normalized messages only), message_count.
        recordChat() writes a new .response only when the messages changed; it
        refuses, by name, no-provider / no-chat-id ('home') / empty / unchanged /
        contained-in-latest (every message already in the newest version, in
        order — a partial or lazily-loaded read never replaces a fuller one).
        Every version is kept; the newest is the highest version (not the newest
        captured_at: two versions can share a millisecond). A chat keeps the agent
        it was first filed under. listChats() (one row per chat, q = recall by the
        chat's own text), chatVersions(), collapseVersions(). The writer is
        guardian (lib/chat-transcripts.js); Clear Glass reads. The Library's
        Responses view lists a chat once at its newest version, shows it as a
        conversation, and opens any earlier version. /cli/downloads/responses
        collapses transcripts (?versions=all lists every version, ?chatKey= one chat).

    - id: selector-assign
      path: clear-glass/src/providers/selector-assign.js · renderer/selector-check.js · renderer/selector-assign/
      description: >
        NEW 0.39.251 (handoff 2026-09-25 step 1) — the element picker assigns a
        provider's input / send / reply selector. guardian-picker.js reports each
        pick (dom:event guardian.picker.picked, one added line, look untouched);
        on a provider page (src/providers/registry.js hosts) the selector-assign
        area offers "This is <provider>'s reply · input · send". renderer/
        selector-check.js, injected into the page, generates a stable selector
        (data-* > hand-written id > role/aria/name/placeholder > classes; uuids,
        digit runs, React ids, hashed classes, per-turn counters never used; no
        #id for resp) and checks it the way the userscript reads it — resp: the
        LAST querySelectorAll match is the pick, matches don't nest, it holds
        text, and a selector matching every reply beats a one-off; an older answer
        is refused; one reply on the page returns single + every passing
        candidate for the person to choose. input/send: exactly one match,
        editable / a button. Shown and outlined before anything is recorded.
        src/providers/selector-assign.js refuses anything without evidence or
        with evidence taken on another provider's page, then POSTs guardian
        /api/agents/:id/selectors (source picker) and returns guardian's answer
        verbatim. IPC selectors:provider-for-url, selectors:assign.

    - id: registry-components
      path: clear-glass/registry-components.js
      description: >
        The real, live self-description contract. Served at GET /contract.
        Verified by orchestrator's contract-handshake on boot. Source of
        truth for this spec's handshake section — grew from 31 to 67
        components this session (§BL30, see docs/SPEC-REGISTRY.md and
        lib/version.js 0.39.30 for the real diff), and from 67 to 79 in
        the 2026-09-22 pass below (autofill's pre-existing gap + screen-qa).

    - id: screen-qa
      path: clear-glass/src/screen-qa/detector.js
      description: >
        NEW 2026-09-22. Detects open-ended, job-application-style
        questions on the page (label/aria-label/placeholder/name-derived,
        excluding whatever autofill/matcher.js would already confidently
        fill), answers them through the real copilot bridge with an
        injected send function (never fabricates an answer on failure or
        an empty reply), and injects the chosen answer via the same
        React/Vue-safe mutate() every other real DOM writer here already
        uses. UI: a hotkey (Ctrl/Cmd+Shift+A, whole-page), a right-click
        menu entry (one field, via a new elementAt() on the DOM mesh),
        a Settings section, and an isolated main-process Notification.
        5 IPC + 3 REST routes (screen-qa:* / /cli/screen-qa/*).

    - id: autofill
      path: clear-glass/src/autofill/{store,matcher}.js
      description: >
        Real since 2026-09-19 (AutofillProfile CRUD + an evidence-graded
        WHATWG-autocomplete-token matcher) but had no UI anywhere and zero
        registry entries until this session. Now reachable from
        ui/library's own Autofill tab (list/create/edit/delete profiles,
        detect/fill against a live agent tab) and registered as its own
        component family, above.

  history:
    - date: 2026-09-01
      summary: >
        First .spec written for clear-glass, closing one of the 11 real
        gaps orchestrator/lib/spec-drift.js's live check reported (§LM1,
        docs/2026-09-01-living-model-and-autonomous-pipeline-phasemap.spec).
        Grounded in the already-real registry-components.js contract, not
        written blind.
    - date: 2026-09-22
      summary: >
        Version/spec/registry maintenance pass (James: "bump versions,
        update specs, loom component registry"). meta.version corrected
        from stale 3.1.0 to 3.9.0 across five real sync points (package.json,
        this file, lib/version.js's services map, main/index.js's
        CG_VERSION, registry-components.js's own local V constant — see
        version_history above). Registry grew 67 -> 79: autofill's real
        IPC surface (shipped 2026-09-19, never registered — a pre-existing
        gap) plus screen-qa's new one, both added above. handshake.
        components_count corrected to match. interaction-contract.json
        regenerated from the live registry export (it states its own
        routes are derived, never hand-authored) — 67 -> 79 routes.
        FOUND, NOT FIXED: a new cross-check (every declared IPC component
        against a real ipcMain handler) surfaced 4 registered-but-
        unimplemented components — see gaps: entry EXT1 below.

    - date: 2026-09-23
      summary: >
        Accounts authority + login portals + settings rebuild (James:
        "login portals ... hook into the cookie vault, and create a
        accountid per account" / "yes clearglass"). Clear Glass is now
        the ONE account authority: options store gained accountDefaults
        (per-provider default), resolveAccountForDispatch (never auto-
        creates) and per-account session records; GET /accounts/resolve on
        :7702 is what guardian's dispatch ladder asks (guardian/lib/
        cg-account-authority.js) instead of its own list. New
        src/accounts/login-portal.js opens a provider's sign-in page in
        the exact partition agent-mesh spawn() uses (persist:mesh-
        <provider>-<accountId>) and captures the session into the
        CookieVault under the key spawn() restores from. Both vaults' keys
        moved off a hardcoded string onto Electron safeStorage
        (src/security/vault-key.js) with a legacy-key read fallback so no
        existing record becomes unreadable. Two real bugs fixed on the
        way: CookieVault's file-store branch (the real one — better-
        sqlite3 is not a dependency) never read named-account cookies
        back, so every restore() returned []; preload declared `macros`
        twice. Registry 79 -> 94. renderer/settings.html rebuilt as a
        shell over renderer/settings/*.js, one file per area (UI1's
        principle), inline script gone so script-src drops
        'unsafe-inline'.

    - date: 2026-09-25
      summary: >
        PATCH — real bug fix, no new API surface. James: "the ui, its not
        changed at all... just fix it." src/options/store.js's
        DEFAULTS.defaultStartUrl (the URL the app's one real startup
        window opens, src/main/index.js §18) was the literal 'about:blank'
        since before this store existed — every UI build shipped this
        engagement, real and reachable, was simply never what the app
        opened by default. Fixed to orchestrator's own root '/', which
        already, by a prior explicit decision (see orchestrator.js's own
        comments), serves ui/tv-shell/index.html as the homepage. Added a
        real, versioned one-time migration (_schemaVersion) so an existing
        install's already-persisted 'about:blank' is upgraded once, not
        silently re-overridden forever by load()'s {...DEFAULTS, ...raw}
        merge — and never touched again if a person deliberately chooses
        'about:blank' after the migration has run. 5 new tests in
        tests/modules/nexus-options-autoboot.test.js (15/15 total).

    - date: 2026-09-25
      summary: >
        Settings UI gap pass against James's Firefox-reference screenshot
        ("i want it nearly identicle to this... Yes build all the ui").
        Mapped every named Firefox category to real backend capability
        BEFORE building (non-negotiable: map first, no theater). Two
        categories had real, working capability sitting unexposed: (1)
        "Downloads" — cg.downloads.list/clearItem/openFolder have been
        real IPC handlers since 2026-08-24, but no section ever called
        list or openFolder, only privacy.js's bulk clearCompleted; new
        sections/downloads.js is the missing per-item view, plus the same
        real downloadDirectory field General already has. (2) "Extensions
        and themes" — src/plugins/host.js's list()/disable() existed since
        2026-08-24 with zero IPC exposure; added plugins:list/plugins:
        disable to ipc/bridge.js (thin wrappers, no new plugin-host
        behavior) + preload, and list() now also surfaces
        displayName/description (already on every manifest, just never
        returned). New sections/plugins.js — named "Plugins," not
        "Extensions and themes," since themes have no backend anywhere in
        this codebase (grepped directly, zero real matches). Also added a
        small real "Page zoom" control to General, wired to the zoom
        plugin's already-real toolbar-command signatures via
        plugins:invoke (fire-and-forget by that handler's own design, so
        the toast confirms the command was sent, not a zoom factor it
        can't see synchronously). FOUND, NOT BUILT — no real backend
        exists for: search-engine selection, appearance/theme (dark/light
        mode), accessibility settings, or a dedicated language-preference
        page (the only real "language" surface is the fingerprint
        spoofing profile, already covered by sections/fingerprint.js).
        backgroundTabDefaults.openInBackground (already toggled in
        General, pre-existing) still has zero real consumer anywhere —
        confirmed again directly, not touched this pass. Verified live:
        real Electron app under Xvfb, CDP-connected, all three
        pages rendered with real data (6 real installed plugins with real
        manifest text; live options.get()), and a real Disable click on
        the zoom plugin's row round-tripped through the new IPC handlers
        and flipped its state to "disabled" on screen.
        Registry unchanged (no new registry-components.js entries — these
        are new IPC routes on the existing plugins:* namespace, not new
        registry-tracked components; interaction-contract.json is derived
        from registry-components.js alone, so it is untouched).

  gaps:
    as_of: 2026-09-01
    entries:
      - id: SM1
        type: coverage
        summary: >
          loom/scanners/spec-map.js's SPEC_DIRS allowlist does not include
          clear-glass/spec — this new spec will not be picked up by loom's
          §6.3 coverage scanner until that allowlist is extended (a
          separate, pre-existing gap, recorded in this session's foundation
          addendum, not fixed here).
        opened: 2026-09-01

      - id: EXT1
        type: coverage
        summary: >
          Four registered components — cg.extensions.list/load/unload/
          pickDirectory (extensions:list/load/unload/pickDirectory) —
          have no ipcMain handler anywhere in the codebase, confirmed by
          direct search across every clear-glass/src/**/*.js file, not
          assumed from the registry alone. Real and pre-existing, not
          introduced by the 2026-09-22 pass that found it; genuinely
          unimplemented, not a naming mismatch. Out of scope to fix
          here — an extensions feature needs its own real design, not a
          guess made while doing a version/registry maintenance pass.
          tests/modules/version-sync-and-registry.test.js allowlists
          these four explicitly so the same check still catches any
          NEW declared-but-unimplemented component going forward.
        opened: 2026-09-22

      - id: FGAP1
        type: coverage
        summary: >
          Four Firefox settings categories James's reference screenshot
          named have no real NEXUS backend anywhere in this codebase,
          confirmed by direct grep across clear-glass/src and
          clear-glass/renderer, not assumed: search-engine selection
          (zero searchEngine/defaultSearch references anywhere),
          appearance/theme — dark/light mode (zero real theme config;
          only incidental comment-string matches on "theme"),
          accessibility (zero screenReader/a11y/reducedMotion/fontSize
          references anywhere), and a dedicated language-preference page
          (the only real "language" surface anywhere is the fingerprint
          spoofing profile's language/languages fields, already covered
          by sections/fingerprint.js — not a general browser-language
          setting). None of these were built as settings sections this
          pass, per the non-negotiable that a stub with nothing real
          behind it is worse than the gap itself. Firefox Labs / About
          Firefox / More from Mozilla / Firefox support have no NEXUS
          analog at all and were not treated as gaps to close.
        opened: 2026-09-25

  version_history:
    - version: 3.17.0
      date: 2026-09-26
      summary: >-
        MINOR (v0.39.263) — James: "playright? no what is that for? litterally have clearglas". Playwright was a
        root devDependency for three probe scripts, and python playwright stood behind four more (never installed,
        so TX-20, GS-20, SA-09 and SA-10 always reported SKIPPED). Clear Glass is already a Chromium: module
        glass-driver (src/driver/glass.js + src/driver/glass-host/) runs Clear Glass's own Electron as a page host
        and drives each page through its webContents.debugger — no remote-debugging port, no Playwright, the
        subset of Playwright's page API the probes used under the same names. Headless on Linux via the ozone
        headless platform with offscreen windows (a shown window there segfaults Electron 42). All nine real-page
        probes now run on it; the four skipped suite cases pass (transcript-push 10/10, live-stream 8/8,
        selector-check 10/10, selector-assign-ui 9/9), agent-blocks 13/13, library window 29/29, menu-library 4/4.
      versioniumCommitId: null
    - version: 3.16.0
      date: 2026-09-26
      summary: >-
        MINOR (v0.39.262) — James: "fix [renderer] unhandledrejection GUEST_VIEW_MANAGER_CALL ERR_CONNECTION_REFUSED
        127.0.0.1:900 … make the macros way more user friendly … expand the copilot settings … add new button to the
        plugins section with webextension support … expand per site settings … make a clearglass hat for the copilot
        cli … make it jaa. no json … expand the autofill section, agent mesh and brainos." (1) renderer/browser.js: every
        <webview>.loadURL() Promise was dropped; navigation now goes through navigate(), failures render one in-view page
        with a NEXUS port-typo hint (:900 → :9000), ERR_ABORTED (-3) is not an error. (2) cg.storage.jaa
        (src/storage/jaa.js): options, API settings, site settings, history, downloads, bookmarks, autofill,
        fingerprints and passwords move to JAA tables (JaaKV / JaaRows); legacy JSON imported once, left on disk.
        (3) cg.copilot.hat (src/copilot/hat.js) — the clear_glass hat in lib/hat-forge, composed per call; cg.renderer.
        copilot-cli — route bar + slash commands; fix: driver commands from a reply executed twice; /build /diagnose had
        no preload path. (4) Macros: recorder → cg.macros.recording, templates, sentence steps, edit/duplicate.
        (5) cg.plugins.webextensions — Chrome extensions from folder/.zip/.crx into every persistent session.
        (6) Site settings area; contentFilter='off' enforced in webrequest-adapter. (7) Autofill, Agent mesh expanded;
        BrainOS Float gains NODES / MESH JOBS / MACROS / AUTOFILL / SITES via registerTab. Tests: storage-jaa 5,
        copilot-cli 10, webextensions 7, content-filter-exempt 1, brainos-float-cg 6; settings suite 38/38.
      components_added: [cg.storage.jaa, cg.copilot.hat, cg.renderer.copilot-cli, cg.macros.recording, cg.plugins.webextensions]
      versioniumCommitId: null
    - version: 3.15.0
      date: 2026-09-26
      summary: >-
        MINOR (v0.39.254) — James: "we were working on getting the download manager logging agent chats"; asked, he
        chose a full-transcript sync, one record per chat (versioned), every provider chat including the userscripts in
        his own browser: "i want nexus to help remember. persistent memory for ai agents." The downloads index gains
        kind 'transcript' (module chat-transcripts-index above); recordResponse and recordChat share one write path
        (_write: .response fsync'd first, index row after, index failure reported not fatal). /cli/downloads/responses
        collapses a chat to its newest version; the Library shows chats as conversations with their versions. Proven:
        test-chat-transcripts 20/20 (TX-01..10 the index, each guard mutation-checked); tests/probe/
        clearglass-library-window.js 29/29 in real Chromium (4 new chat checks).
      versioniumCommitId: vtm-99a6abef
    - version: 3.14.1
      date: 2026-09-25
      summary: >-
        PATCH (v0.39.252) — James: "is supposed to be injected into the chat like a job. it is for the agents to talk to nexus. not me." / "its not voice assistance. its for the agents to talk to nexus through clearglass" src/copilot/wake-relay.js no
        longer answers an AGENT wake (role 'assistant'): it heard cortex's /api/meta/observe, posted when the
        agent's reply first appears — still streaming — so it answered the first fragment ("hey nexus, w", copilot
        asked "w") as a /wake-reply job that queued behind the unfinished reply and was never typed. Guardian's
        wake-loop now answers agent wakes once, from the completed reply, as a job sent into the same tab (guardian
        3.11.1). The relay logs where the wake went; it still answers a non-agent wake as before. Test WK-018 runs
        the real relay against a fake cortex stream: no copilot call, no guardian job, no overlay.
      versioniumCommitId: vtm-7a5e6093
    - version: 3.14.0
      date: 2026-09-25
      summary: >-
        MINOR (v0.39.251) — handoff 2026-09-25 step 1: the element picker assigns
        selectors (see modules: selector-assign). NEW renderer/selector-check.js,
        renderer/selector-assign/{selector-assign.js,.css} (one JS + one CSS,
        every rule under #cg-selector-assign), src/providers/selector-assign.js,
        IPC selectors:provider-for-url + selectors:assign, SSE selectors.assigned /
        selectors.assign.failed; browser.html loads the area; browser.js mounts it
        and offers on guardian.picker.picked and on the fallback picker's
        dom:pick-result (which now carries xpath + url in getXPath's format).
        guardian-picker.js: one line added (the pick report), nothing else changed.
        FIXED on the way: (1) guardian-picker's xpath through an svg (the send
        icon — the usual way a send button is clicked) never resolves through
        document.evaluate in an HTML document; selector-check walks the positional
        form by localName. (2) src/dom/archaeology.js handlePick named every
        unnamed pick 'pick-1' (Object.keys on a Map). PROVEN in real Chromium 141:
        tests/probe/selector-check-chromium.py 10/10 on tests/fixtures/chatgpt-like.html
        (guardian-picker's own getXPath, the userscript's own _lastMatch — a new
        reply is read by the assigned selector); tests/probe/selector-assign-ui-chromium.py
        9/9 (the area's whole flow against guardian's real selector map);
        tests/modules/test-cg-selector-assign 10/10. NOT YET PROVEN: live on James's
        machine (a ChatGPT job's reply detected → .response → Library → Responses).
      versioniumCommitId: vtm-f0839dcd
    - version: 3.13.2
      date: 2026-09-25
      summary: >-
        PATCH (v0.39.243) — James: "yes jaa" (move the cookie vault too). src/cookies/vault.js stores in a
        JaaStore at <vault>/jaa/ — cookie_snapshots and account_cookies, the same encrypted blobs (vault-key.js).
        Before, better-sqlite3 was tried and, absent on every real install, loose files ran instead
        (account-<agent>-<account>.json, <agent>-<n>.json). Snapshot files are imported when the vault opens; an
        account file is imported on its first read by its exact name (the name can't be split back into agent
        and account when either has a dash). Files are left in place; deleting an account also removes its old
        file so it can't come back. Numbering continues after imported snapshots. better-sqlite3 has no users
        left and is dropped from the root optionalDependencies (lockfile regenerated by npm: it and
        node-addon-api removed). tests/modules/test-cookie-vault-jaa 7/7.
      versioniumCommitId: null
    - version: 3.13.1
      date: 2026-09-25
      summary: >-
        PATCH (v0.39.242) — James: "use jaa for the database". downloads/artifact-chat-index.js's index is a
        JaaStore table (guardian/jaa-store.js) at <compartment>/index-jaa/items.json, replacing index.db on
        better-sqlite3 (an optional native dependency absent on James's machine, so the index had never existed
        there). recordResponse flushes at once (readers are other processes); queryItems reloads from disk and,
        when the index does not hold exactly what responses/ holds, rebuilds it — which also indexes every reply
        written while there was no index. JAA failing still falls back to reading responses/ directly; that
        fallback no longer returns unreadable files to filtered queries. tests/modules/test-artifact-index-jaa
        9/9, including a second process writing through guardian's real writer.
      versioniumCommitId: null
    - version: 3.13.0
      date: 2026-09-25
      summary: >-
        MINOR (v0.39.241) — James: "the download manager in clearglass" and "need control j to popout a window
        like the screenshot. thats what it was supposed to look like, the settings ui but with the library. at
        least make the library style consistent with the rest of clearglass." The Library is its own Clear Glass
        window: renderer/library.html loads Settings' own settings.css and settings/core.js (boot() now takes
        groups/defaultId/cssBase/close/search; Settings' defaults unchanged), with one JS + one CSS per area under
        renderer/library/sections/ — Downloads (Firefox-style rows: type tile, name, "size — site — time", folder
        button, click to open; plus the Download Listeners form), Responses, Bookmarks, History (by day),
        Accounts, Passwords, Autofill, Macros. openLibraryWindow(area) in src/main/index.js: frameless, single
        instance, preload, library.html#<area>. Ctrl+J opens it at Downloads from ANY web contents (chrome and
        page) via app 'web-contents-created' before-input-event; Ctrl+Shift+J stays DevTools. The ☰ menu's
        Downloads and Library rows and the tray entry open it. New IPC: window:openLibrary, window:closeLibrary,
        downloads:openFile (completed downloads only) — registry 99 -> 102, contract regenerated. Retired:
        ui/library/ (the :9000 page in an agent window) and browser.js's Downloads dropdown. FIXED: the bridge's
        CORS preflight named no methods, so every DELETE/PUT/PATCH from the Library (remove download, delete
        bookmark/history/account/password/profile, edit profile) was refused by the browser — in the old page too.
        FIXED: downloads/artifact-chat-index.js tried better-sqlite3 on every read and printed two stack traces
        each time it was missing; now tried once, said once, responses/ read directly. Proven: tests/probe/
        clearglass-library-window.js (real page, real bridge, 25/25), clearglass-menu-library.py, clear-glass-
        library-ui 45/45.
      versioniumCommitId: null
    - version: 3.12.1
      date: 2026-09-25
      summary: >-
        PATCH (v0.39.240) — James: "also needs to be clearglass library... added to the 3 lines menu". The Library
        window (ui/library/: bookmarks, history, downloads, agent responses, accounts, macros, autofill, passwords)
        was reachable only from the tray. renderer/browser.js's ☰ menu (#bookmark-mgr-btn) gains a fixed
        "📚 Library" row after History; it opens the SAME window the tray opens (agentId nexus-library, the
        /ui/library/ URL) through cg.window.open -> window:open -> openAgentWindow, and a failure is toasted. No
        new route. Proven by clicking it in headless Chromium on the real browser.html (tests/probe/
        clearglass-menu-library.py); tests/modules/clear-glass-library-ui.test.js 24 -> 28 pins the row and that
        its agentId/URL equal the tray's. All sync points moved together.
      versioniumCommitId: null
    - version: 3.12.0
      date: 2026-09-25
      summary: >-
        MINOR (v0.39.239) — the downloads manager routes each response to its agent and can be read. James: "the download
        manager should be routing the response to the agent or compartment id" / "needs a ui so i can actually see this".
        src/downloads/artifact-chat-index.js: agent_id and job_id are first-class fields (older .response files read from
        raw.agentId/raw.jobId), queryItems filters them, readItem(root,id) returns one record (ids that could leave
        responses/ are refused), defaultRoot() is the ONE root resolver — guardian's writer (code-artifact.js), guardian's
        recovery (response-sink.js), the new routes and download-capture all use it (four callers resolved it themselves
        before). src/ipc/bridge.js: GET /cli/downloads/responses and /cli/downloads/responses/:id (read-only; registry
        97 -> 99, contract routes regenerated from the registry); its command index honours NEXUS_DATA_ROOT so a test
        starting the bridge no longer rewrites the real data/clear-glass/command-index.json. src/providers/download-capture.js
        1.1.0: attach() is idempotent per session (every provider window shares one session; each window added a listener,
        so every download was announced once per open window), each download carries the agentId of the tab it came from
        (ProviderHost resolves it), the ledger no longer records the provider name as the agent, and each download is
        recorded in the index under its agent (copied up to 10 MB, else by path). ui/library: a Responses tab
        (areas/responses.js + .css) lists replies by agent with the reply text and code blocks. Tests:
        tests/modules/test-downloads-responses.test.js 15/15 on the real writer and the real bridge over HTTP, each fix
        mutation-checked; the tab driven in headless Chromium. All sync points moved together.
      versioniumCommitId: null
    - version: 3.11.3
      date: 2026-09-25
      summary: >-
        PATCH (v0.39.237) — no stray provider windows. src/providers/host.js: an agent tab that crashes or
        closes unexpectedly restarts as the same agent tab (start(providerId, {show:false, agentId})); it
        used to call start(providerId) with no agentId, which started the SHARED provider window.
        closeAgentTab — the idle sweep and the LRU cap both use it — now sets _nexusIntentionalStop before
        destroy, as stop() does: without it every intentional agent-tab close was treated as unexpected and
        started the shared window 5 s later. The userscripts guardian injects no longer replay IndexedDB
        records on connect (guardian 3.9.0). No API surface change; interaction-contract routes unchanged.
        Tests: tests/modules/test-provider-host-one-tab.test.js 7/7 against the real ProviderHost class
        (only 'electron' faked), each fix mutation-checked. All seven sync points moved together.
      versioniumCommitId: null
    - version: 3.11.2
      date: 2026-09-25
      summary: >-
        PATCH — two new settings sections (Downloads, Plugins) surfacing real, already-existing backend
        capability that had no UI before (cg.downloads.list/openFolder/clearItem; src/plugins/host.js's
        list()/disable(), newly exposed via plugins:list/plugins:disable in ipc/bridge.js + preload).
        Small real "Page zoom" control added to General. No new registry-components.js entries (plugins:*
        route additions, not registry-tracked components) so interaction-contract.json is unchanged. All
        six sync points moved together.
      versioniumCommitId: null
    - version: 3.11.1
      date: 2026-09-25
      summary: >-
        PATCH — defaultStartUrl's real default fixed ('about:blank' -> orchestrator root '/', which
        already serves ui/tv-shell as the homepage) plus a versioned one-time migration so an existing
        install's persisted 'about:blank' is upgraded once, not silently overridden forever. No new API
        surface. All five sync points moved together.
      versioniumCommitId: null
    - version: 3.11.0
      date: 2026-09-23
      summary: >-
        MINOR — Clear Glass job intake (src/jobs/intake.js): /agent-mesh/send and /agent-mesh/job now go
        through it; it takes in only jobs guardian CLAIMED for it on their .job (read back via guardian
        GET /jobs?id=), keeps its own <jobId>.intake records, survives a restart as clear_glass_restarted
        (sent:null). Registered mesh.jobSend + mesh.jobStatus (real since 2026-09-19, never registered) and new
        mesh.jobIntake GET /agent-mesh/intake: 94 -> 97. Settings UI: one JS + one CSS file per area (14 + 14),
        area CSS scoped to body[data-area], shared settings.css holds tokens/frame/shared components only.
      versioniumCommitId: null
    - version: 3.10.0
      date: 2026-09-23
      summary: >-
        MINOR — new capability, backward compatible: 15 new IPC components (per-provider default
        account + dispatch resolution, 8 login-portal channels, vault key status, macro create/delete/
        schema). All five sync points moved together (package.json, this file, lib/version.js,
        main/index.js CG_VERSION, registry-components.js V); interaction-contract.json regenerated
        79 -> 94 routes, existing route objects kept verbatim.
      versioniumCommitId: null
    - version: 3.1.0
      date: 2026-09-01
      summary: "First real .spec authored, matching live code@3.1.0 exactly (no version bump required)."
      versioniumCommitId: null
    - version: 3.1.0
      date: 2026-09-19
      summary: >-
        clear-glass/src/gates/index.js gained 13 new real gates (mesh.workflow.list/get/create/update/
        remove/run/step.add/step.update/step.remove/step.move, mesh.list.nodes/meshView/agents), same
        convention as the 4 pre-existing mesh gates. Closes a real gap: AgentMesh's own 10-method
        automation engine (this._automation, already backing BrainOS's UI via /automation/workflows) and
        its 3 list methods had zero gate coverage — completely unreachable from the agent-tool loop despite
        being the same real object spawn/send/route/enqueue already dispatched to. No version bump — same
        real object, same real methods, just now also reachable as gates; not a behavior change to anything
        that already worked.
      versioniumCommitId: null
    - version: 3.9.0
      date: 2026-09-22
      summary: >-
        Two real gaps closed at once. (1) DRIFT CORRECTED, not invented: this meta.version had stayed
        at 3.1.0 since 2026-09-01 while clear-glass/package.json (the field actually bumped per real
        release) reached 3.8.0 — the same drift pattern lib/version.js's own services['clear-glass']
        entry and main/index.js's CG_VERSION constant independently exhibited (all three checked
        directly, all three read 3.1.0). What real work landed in package.json's 3.2.0–3.8.0 is not
        reconstructed here — this entry does not claim to document it, only to stop three sources of
        truth disagreeing about the number. (2) This session's real additions, on top of that corrected
        baseline: macros + autofill get a real UI for the first time (ui/library/library-app.js, a
        7-tab page that was previously a shell with no script behind it), and a full screen-qa feature
        — detect open-ended on-screen questions, answer them through the real copilot bridge, inject
        the chosen answer back into the page — with a hotkey (Ctrl/Cmd+Shift+A), a right-click menu
        entry, element-picker integration (elementAt on the DOM mesh), a Settings section, and an
        isolated main-process Notification that fires independent of the renderer's own health. Plus a
        real bug fix: the right-click context menu's position, which used webview-relative coordinates
        against a window-relative #ctx-menu. New real routes/handlers: /cli/agents, /cli/autofill/*
        (7), /cli/downloads/clear-completed, /cli/screen-qa/* (3 REST + 5 IPC). Full detail in
        lib/version.js's own 0.39.204–0.39.210 changelog entries.
      versioniumCommitId: null

  # ## ADDENDUM 2026-09-26 (0.39.264) — ErosmancerOS runs with Clear Glass
  # src/eros/supervisor.js (new): bootstrap step 14.4 starts ErosmancerOS (unless EROS_AUTOSTART=0)
  # before the wire, connects it to CG_CDP_PORT when it answers, restarts it with backoff, and
  # shutdown() stops it. Wire routes: GET /eros-supervisor (state, pid, port, cdpPort, restarts,
  # last error, recent output) and POST /eros-supervisor/start (start, or reconnect if running).
  # Settings → ErosmancerOS shows who started it, offers Start/Reconnect, and its DevTools port
  # field defaults to Clear Glass's real port (was a hard-coded 9222; Clear Glass opens 9333).

  # ## ADDENDUM 2026-09-27 (0.39.269) — the download manager is agent memory
  # docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (M1–M5). No Clear Glass code changed.
  # James: "everything is supposed to persist with agents. using the download manager." The downloads list
  # (src/downloads/store.js) and the chat/artifact index (src/downloads/artifact-chat-index.js) now receive every
  # backend's exchanges, not only Guardian's: lib/agent-memory.js record() writes Ollama and copilot exchanges through
  # guardian/lib/response-sink.js (downloads entry, pending queue when Clear Glass is closed) and recordResponse() (same
  # raw shape as guardian/lib/code-artifact.js). recall() reads the index back (queryItems by agentId, readItem) as the
  # agent's memory. The Library's Responses tab therefore shows Ollama replies too, filed by agent.

  # ## ADDENDUM 2026-09-27 (0.39.274) — the co-pilot pane has no API fallback
  # James: "nexus settings are depreciated. fix it. copilot, is either ollama or guardian. no api".
  # src/copilot/bridge.js _ask(): copilot :3750 first (unless "Route through NEXUS co-pilot" is off); when it is
  # unreachable the pane answers through Ollama (ollama/ollama-runtime.js, model = copilotOllamaModel or
  # ollama/config.js DEFAULT_MODEL) or a Guardian agent (:7820 /command, then /jobs?id= until complete) — guardian first
  # when the route is guardian, Ollama first otherwise; a follow-up tool-results round stays on the backend that
  # answered. When nothing answers, the reply names what was tried and why. The Anthropic-key fallback
  # (_callFallback, fallbackApiKey/fallbackModel/fallbackEndpoint, the "Offline fallback" settings pane) is removed; a
  # saved key is dropped on load and refused on set. ollamaGenerate() no longer posts to :3749/api/generate (a route
  # the NEXUS ollama service does not serve). The pane's greeting no longer claims "online" before anything answered.
  # Proven by tests/modules/test-cg-copilot-no-api.test.js (NA-001..NA-006).

  # ## ADDENDUM 2026-09-29 (0.39.278) — the chat ledger; the co-pilot pane remembers
  # James: "maybe use the download manager in clearglass for the chat ledgers … live streams the dom mutation live to
  # the download manager, that way we don't lose progress. including you expanding elements for your thoughts."
  # 1. src/downloads/chat-ledger.js: one append-only ledger per chat (ledgers/<chatKey>.jsonl under the downloads
  #    index root). A head line, then one delta line per change: per turn whole text or appended text (add at), thinking
  #    the same way. Never rewritten; a torn last line is skipped on replay; an append at an offset the ledger does not
  #    hold is refused with the lengths it holds (resync) and nothing is written. Routes: POST /cli/downloads/ledger,
  #    GET /cli/downloads/ledgers, GET /cli/downloads/ledgers/:chatKey. Each chat is one downloads entry, kind
  #    chat-ledger, in_progress while generating. Written only by this process (sovereign); pages post to it directly.
  # 2. src/providers/host.js injects guardian/userscript-chat-stream.js as a second shared prelude (each loads alone).
  # 3. src/copilot/chat-store.js: the pane's conversation in this app's JAA store (cg_copilot_chat, cg_copilot_conv),
  #    ≤ 400 turns per conversation; recent turns go with every call to any backend (copilotHistoryTurns,
  #    copilotHistoryChars, oldest dropped first and said); "Nothing answered" is not stored; copilotRemember off keeps
  #    nothing; mirrored into the ledger as provider copilot. IPC copilot:history (restore on open) and
  #    copilot:newConversation (/new; the old one is kept).
  # 4. copilotToolSurface 'layered' (default): Clear Glass's actions by name + nexus.tools.tool / nexus.tools_expand.tool;
  #    the orchestrator's capability prompt is not fetched per turn ('full' restores it).
  # 5. The pane escapes every reply before innerHTML (formatReply), live and restored — a kept reply cannot inject.
  # Proven by tests/modules/test-chat-ledger-stream.test.js and tests/modules/test-tool-layers-and-pane-memory.test.js.

  # ## ADDENDUM 2026-09-29 (0.39.279) — the interaction field (src/page/field.js)
  # James: "a interaction field for xyz coords to help the agents see and navigate the ui in clearglass … virtual input
  # through erosmanceros … spotlight injected css". Driver actions: field {overlay, offscreen} (every interactive element
  # numbered with box, centre x/y and z = layers covering its centre; overlay + grid in a pointer-events:none layer;
  # a text map), fieldOff, at {x,y}, spotlight {n|selector|x,y,w,h, label, ttl, off}, pointer {n|x,y|selector, do:
  # click|double|right|move|scroll|type, text, via: native|eros}. native = sendInputEvent on a curved path; eros =
  # ErosmancerOS POST /api/input through main/index.js's tab resolver (driver.erosInput). A covered target is reported,
  # an off-screen one refused. field.map / field.spotlight are bus events forwarded to NEXUS. clearglass.browser.tool
  # exposes field / pointer / spotlight. Proven by tests/modules/test-cg-field.test.js and tests/probe/field-chromium.js.

  # ## ADDENDUM 2026-09-29 (0.39.280) — compartment windows and co-pilot verbs (build-surface phasemap BS0, BS17)
  # main/compartment-window.js: every <webview>'s popups go through setWindowOpenHandler; idearium's /desktop.html and
  # /settings.html (loopback only) open frameless, #0a0b10 before paint, resizable, min 480×320, no menu, with
  # preload/compartment-window.js (window.nexusWindow minimize / maximize / close / pin → ipc compartment-window:control
  # on the SENDER's window). Every other popup keeps Electron's default. copilot/verbs.js: loose ```driver blocks
  # repaired (bare keys, single quotes, trailing commas, a bare url, https:// added), an unreadable one returned as a
  # FAILED result (was dropped silently); "visit / go to / open <site>" navigates with no model and answers with the
  # page's title, url and field targets; the pane labels a block by the command it carries. Proven by
  # tests/modules/test-compartment-window.test.js and tests/modules/test-cg-copilot-verbs.test.js.

  # ## ADDENDUM 2026-09-29 (0.39.281) — ErosmancerOS input and the workbench (provider-economy phasemap EC9, EC10)
  # src/automation/steps.js: browser steps click / hover / type gain Input (page | erosmancer). mesh/automation-engine.js
  # sends 'erosmancer' to the driver's pointer action with via 'eros' (driver → main's erosInput → ErosmancerOS
  # /api/input) at the element's centre; type needs a selector. A refusal fails the step — it is never sent in the page
  # instead — and the output carries inputPath: 'erosmancer'. renderer/settings/sections/eros.js: a Workbench pane (the
  # other panes unchanged) over the /eros/* proxy — Tabs (open, attach with a role, close), Nodes (search, inspect, use in
  # console), Console (one /api/execute or its plan only; no behaviour profile of its own), Replay (frames, replay one
  # with a delay). erosmancer-os 0.3.0: ScriptReplayQueue.list(); GET /api/replay/frames adds frames beside the snapshot.
  # Version points synced: CG_VERSION (was 3.18.0), registry-components V and interaction-contract version (were
  # 3.17.0). Proven by tests/modules/test-economy.test.js EC9-01 and tests/modules/test-eros-workbench.test.js.

  # ## ADDENDUM 2026-10-02 (0.39.301) — the Fiverr gig writer (src/autofill/gig.js)
  # James: "I just want it to write gigs for me. Not automate talking or posting. Just write the gigs for me." · "No. I
  # want ClearGlass to use autofill." Autofill gains a gig writer: from a profile and one line of what the gig offers,
  # the co-pilot writes the gig as JSON (title, category, tags, description, three packages, FAQ, buyer questions);
  # parseGig holds it to Fiverr's limits (title 80, description 1200, 5 tags of 20, package name 35 / description 100,
  # price at least 5) and reports every cut. Each part is editable and copyable in Settings › Autofill › Fiverr gigs;
  # only when asked is it typed into Fiverr's gig editor in a tab (preview first; value mutations only; placeholder-only
  # matches left for him; dropdowns and rich-text boxes left to copy). It never saves, posts or publishes. Doors:
  # autofill:gig, :gig:detect, :gig:fill (IPC) and POST /cli/autofill/gig, /gig/detect, /gig/fill. Events
  # autofill.gig.drafted / .filled in the ET1 taxonomy. Also registered at last: autofill:proposal and autofill:readPage
  # (shipped 0.39.265, never in the registry). Nodes regenerated — they were stale at 3.17.0. 3.23.0.
  # Proven by tests/modules/clear-glass-gig.test.js (7/7). Not proven here: Fiverr's live editor — it is checked by the
  # preview against the real page on James's machine; anything it cannot match stays one click away to copy.

# ── ADDENDUM 2026-10-05 (0.39.357) — 3.24.0 ──
# src/driver/glass.js: page.dblclick(sel) — click(sel), then a second mousePressed/mouseReleased pair with clickCount 2 at the
# element's centre, through Input.dispatchMouseEvent like click (real input, so dblclick listeners fire as for a person).
# Needed by the workshop's template picker (a double-click on a template creates from it; tests/modules/test-template-picker).

# ── ADDENDUM 2026-10-10 (0.59.0) — FN1/FN2: the interaction field as commands; each window's attention ──
# James: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?"
# `idearium field` / `field off` / `field at <x> <y>` / `field show <n|selector> [label]` / `field point <n> [do]` /
# `field windows` — idearium/cli/route-commands.js rows over POST :7702/cli/driver (agentId from --on, default 'default'),
# so a person at the CLI and every agent through nexus.command have the field. The driver now emits field.pointer for
# every pointer act (as field.map and field.spotlight were). src/page/attention.js keeps, per window, page changes and the
# field's last map, spotlight and pointer (fed from the bus by main/index.js, bus.on('*')); GET /cli/attention serves it.
