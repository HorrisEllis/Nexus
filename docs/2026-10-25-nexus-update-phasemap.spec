spec:
  meta:
    name:     nexus-update
    version:  1.0.0
    date:     2026-10-25
    release:  "0.60.252"
    uuid:     nexus-update-phasemap-v1-0000-2026-1025-jamesbrooks-001
    owner:    "core (lib/nexus-update.js, the agent tool) + idearium (routes, rows, the Updates page) + clear-glass (the co-pilot's names)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-25: "can we make a tool for the copilot (remmber copilot is meant to be a hat.) like a update tool using
      github?"
    axioms: "docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, REVERSIBILITY (every update can be undone), USER_AUTONOMY (applying and restarting are the person's), §1.2 nothing silent, §0.3 nothing lost; docs/CLAUDE.md: backend → route → command → UI; agents get every capability a person gets"
    reading_of_his_words: >-
      The coder's reading: (1) "a tool for the copilot … meant to be a hat" — a NEXUS agent tool (lib/agent-tools), so any agent
      wearing a co-pilot hat has it (hat-seed toolScope), not a Clear Glass-only action; his 2026-09-19 "copilot should be a hat"
      is why. (2) "update … using github" — check what is newer on GitHub than this install, show his own words for each release
      in between, and bring it in, reversibly.

  exists:
    releases_on_github: ".github/workflows/release.yml publishes v<version> with nexus-<version>.zip (+ SHA256SUMS) on every main release change."
    cos_chain: "COSA7 clear-glass/src/releases (check + download into COS's inbox), cos/app/store.js (install beside, shared data), cos/app/switch.js (snapshot data, switch, health, roll back), COSA13 update.policy. Built, Windows-unverified; needs Nexus run by the COS app."
    release_lines: "lib/nexus-releases.js lineOf/quoteOf — his words from a version line in lib/version.js."
    restart: "autopilot POST :7799/control/:name/restart, reached through Idearium's repo.system.control (ADMIN) — the person's control (NC2)."
    found:
      - "His install is an unzipped release folder (D:\\Backups\\Downloads\\nexus-0.60.250): no .git, not under COS. It cannot be updated in place by either chain today."
      - "2,050 tracked files live under */data/ and are rewritten by Nexus while it runs (nodes, ledgers): a plain pull or zip-over would overwrite his state, or refuse."

  decisions:
    UP_D1_how_an_update_lands:
      asked: "How should the co-pilot's update tool put a new version on your machine? Git clone (recommended: fetch, fast-forward only, rollback one step), through COS (COSA7 + store + switch, most robust, run from the COS app), or zip side by side."
      james: "first one but the second one needs to be the end state"
      chosen: >-
        DECIDED 2026-10-25 by James: git now, COS as the end state. So the tool is one interface over drivers — `git` built now;
        `cos` named, detected and said as not wired yet (the end state, UP5); a plain folder is told the one-time clone. The tool,
        its rows and its page do not change when the COS driver lands.
    UP_D2_who_applies:
      chosen: >-
        Decided by his axioms (USER_AUTONOMY, REVERSIBILITY): check and history are free to any agent; apply and rollback take
        confirm:true and the hat is told to ask the person first; restart is his (the page's Restart buttons, through the
        supervisor), never the tool's — an agent restarting the system it runs in would cut its own answer off.
    UP_D4_automatic:
      james: "should be automatic" (2026-10-26)
      chosen: >-
        DECIDED by his words: updates are automatic — no clone, no adopt step, no manual check. The coder's reading, to confirm: the
        install keeps itself current by default (policy auto), when idle; notify and off remain choices on the Updates page. By his axioms
        (USER_AUTONOMY, REVERSIBILITY): an automatic update is fast-forward only, data collisions archived, recorded, rolled back in one
        step; and it never restarts Clear Glass on its own, because idle cannot see a person browsing.
    UP_D3_runtime_data:
      chosen: >-
        Decided by his axioms (§0.3, REVERSIBILITY): a tracked file under a data/ folder that he changed locally AND the update also
        changes is copied to _archive/update/<ts>/ first, then given the update's version; one he changed that the update does not
        touch is left as it is (fast-forward keeps it). A local change to CODE the update also changes stops the apply, named.
        Local commits (diverged) stop it too: merging is his.

  phases:
    UP1_check_and_plan:
      status: DONE (0.60.252)
      depends_on: [UP_D1_how_an_update_lands]
      files: [lib/nexus-update.js]
      does: "detect (git | cos | folder); check: git fetch origin main, this version vs origin's, commits behind/ahead, each release in between with his quoted words (lineOf/quoteOf on origin's lib/version.js), the systems whose files change, whether the lockfile changes; plan: what would be archived, what blocks."
    UP2_apply_and_rollback:
      status: DONE (0.60.252)
      depends_on: [UP1_check_and_plan, UP_D2_who_applies, UP_D3_runtime_data]
      files: [lib/nexus-update.js, .gitignore]
      does: "apply({confirm}): archive the colliding data files, git merge --ff-only, npm install only when package-lock.json changed, a history row (data/update/history.jsonl: from, to, archived, npm, by). rollback({confirm}): git reset --keep to the last update's from-commit, npm install if the lockfile differs, recorded. Both name what to restart."
    UP2a_adopt_the_old_folder:
      status: DONE (0.60.252)
      depends_on: [UP2_apply_and_rollback]
      files: [lib/nexus-update.js]
      does: "node lib/nexus-update.js adopt <old folder> --yes, run in the new clone before it starts: every file the clone ignores (Cortex's memory stores, ledgers, .env) and his runtime copy of every tracked file under a data/ folder come across (the clone's copy archived first); code and node_modules never do; the old folder is only read. Not a route or a row: those would run in the old, running install."
    UP3_routes_and_rows:
      status: DONE (0.60.252)
      depends_on: [UP2_apply_and_rollback]
      files: [idearium/api/index.js, idearium/cli/route-commands.js]
      does: "GET /api/update, GET /api/update/history (READ), POST /api/update/apply, POST /api/update/rollback (ADMIN); rows `update`, `update apply --yes`, `update rollback --yes`, `update history`."
    UP4_the_tool_on_the_hats_and_the_page:
      status: DONE (0.60.252)
      depends_on: [UP3_routes_and_rows]
      files: [lib/agent-tools/tools/nexus/update.js, lib/hat-seed.js, clear-glass/src/copilot/tools.js, clear-glass/src/copilot/bridge.js, idearium/ui/update.html, idearium/ui/js/app.js, loom/maps/economy-map.js, tests/modules/test-nexus-update.test.js, tests/modules/run-all.js]
      does: "nexus.update.tool (check | history | apply | rollback) on the co-pilot hat (the_clearglass_operator, by SEED_ADDITIONS once per install); the Clear Glass co-pilot names update.check|apply|rollback|history; the Updates page (idearium/ui/update.html, /update in the CLI): what is newer, his words per release, Update, Roll back, Restart per changed system."
    UP5_the_cos_driver:
      status: OPEN
      depends_on: [UP4_the_tool_on_the_hats_and_the_page]
      files: [lib/nexus-update.js, lib/cos-bridge.js]
      does: "The end state (his UP_D1): when this install runs under COS (its folder is a COS store version), apply = COSA7 fetch into COS's inbox, COS installs it beside, switch with snapshot and rollback (COSA4/13); rollback = COS's. Waits on COS's Windows build being verified, and on him running Nexus from the COS app."

    UP6_attach_in_place:
      status: DONE (0.60.254)
      depends_on: [UP2a_adopt_the_old_folder, UP_D4_automatic]
      files: [lib/nexus-update.js]
      james: "should be automatic" (2026-10-26, with a screenshot of http://127.0.0.1:4800/update.html answering 404 on his 0.60.251)
      does: >-
        An unzipped release folder becomes updatable where it is, with no clone and no copy: git init, origin = GitHub, fetch the commit
        of its own VERSION (tag v<version>, blobs on demand) and main, git reset --mixed to that tag (no file is touched; his runtime data
        shows as his local changes, which UP_D3 already handles), core.autocrlf off (the zip's bytes are the repo's). Recorded; undone by
        deleting .git. No git on the machine, or no tag for the version, is said with the fix.
    UP7_autopilot_keeps_it_current:
      status: DONE (0.60.254)
      depends_on: [UP6_attach_in_place]
      files: [lib/nexus-update.js, lib/nexus/autopilot.js]
      does: >-
        After boot (2 min) and every 6 h, autopilot checks. policy auto (the default, his "should be automatic"): when idle (its /idle),
        apply; npm install in the background when the lockfile changed; then restart the systems whose files changed (all of them when
        lib/ or the lockfile changed), one by one through its own controlKernel. Never Clear Glass (idle cannot see him browsing): its
        changes are said and wait for him. notify: say it, apply nothing. off: nothing. Every tick is recorded (data/update/auto.json).
    UP8_policy_on_the_page:
      status: DONE (0.60.254)
      depends_on: [UP7_autopilot_keeps_it_current]
      files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/update.html, tests/modules/test-nexus-update.test.js]
      does: "GET|POST /api/update/policy and GET /api/update/auto; the row `update policy [auto|notify|off]`; the Updates page shows the policy, the last automatic check and what it did."
    UP9_a_popup_when_there_is_an_update:
      status: DONE (0.60.349)
      depends_on: [UP8_policy_on_the_page]
      files: [lib/nexus-update.js, orchestrator/orchestrator.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/serve.js, cos/ui/shell/index.html, lib/ui/update-popup/update-popup.js, lib/ui/tv-shell/index.html, tests/modules/test-update-popup.test.js]
      does: >-
        James, 2026-11-01: "can you have it have a popup when it has an update availanel" — said with his screen of COS's UI unreachable: his
        folder was 0.60.346, the COS UI came in 0.60.347, and the automatic check had thrown ("write ECONNABORTED") without leaving a record.
        notice() reads the last check for a person (available, waiting, blocked, refused, error, updated); a check that throws is now saved as
        an error; GET /api/update/notice (the orchestrator, for the TV) and GET /api/cos/update/notice (COS, in its contract); one popup script
        (lib/ui/update-popup) on the TV and in COS's UI: Open updates (Idearium's Updates page applies), Later (6 h, per version and kind).
    UP10_update_from_the_floating_menu:
      status: DONE (0.60.352)
      depends_on: [UP9_a_popup_when_there_is_an_update]
      files: [orchestrator/orchestrator.js, lib/ui/tv-shell/menu.js, tests/modules/test-update-menu.test.js]
      does: >-
        James, 2026-11-01: "can i update nexus from the floating menu button.?" — he could not: the floating menu (lib/ui/tv-shell/menu.js) had
        Diagnose, Rewind and Inspect, and the update applied only on Idearium's Updates page. An ⇪ UPDATE button in the menu: it checks (what is
        current, what is waiting, how many commits, what blocks), and Update now (after his yes) applies. The TV asks only :9000 (TV_D1): the
        orchestrator forwards GET /api/update/check and POST /api/update/apply to Idearium's /api/update and /api/update/apply, so the tree is
        still changed in one place (lib/nexus-update.js through Idearium). Restarting stays his (the reply names what to restart).
        No module spec exists for this map yet (its phases predate the rule); said, a gap.
    UP11_an_attached_folder_tracks_origin:
      status: DONE (0.60.353)
      depends_on: [UP6_attach_in_place]
      files: [lib/nexus-update.js, tests/modules/test-nexus-update.test.js]
      does: >-
        A fix, phased (his rule). James, 2026-11-01, pasting his `git pull` in D:\Backups\Downloads\nexus-0.60.346: "There is no tracking
        information for the current branch." attachInPlace (UP6) made his unzipped folder a git tree on main but never set main's upstream; the
        update tool names origin/main itself so it worked, his own git pull did not. attachInPlace now runs git branch --set-upstream-to=origin/main.

    UP12_open_a_pull_request_for_any_agent:
      status: DONE (0.60.357)
      depends_on: [UP6_attach_in_place]
      files: [lib/git-pr.js, idearium/cli/route-commands.js, tests/modules/test-git-pr.test.js, tests/modules/run-all.js]
      does: >-
        James, 2026-11-01, after the coder could not open a PR (no gh on his machine, the built-in browser not signed in to GitHub): "Open the
        PR" · "okay but for all agents, as a agent tool". One row, `pr open [dir] [--base main] [--title …] [--body …]`, in the one command
        table, so every agent and the person have it through nexus.command. It pushes the branch (git, with his own credential helper: Nexus
        never reads or holds a token), then opens the PR with gh when gh is installed and signed in; otherwise it answers with GitHub's
        compare URL, title and body prefilled, for him to open and click. Refused on the base branch itself and on a dirty tree (said, never
        stashed). The coder's reading, decided by the axioms (§5.15: GitHub auth stays git's and gh's; §1.2: the fallback is said).
    UP13_a_backup_before_every_update:
      status: "DONE (0.60.363) — test-nexus-update 12/12 (UP-13 new; UP-08 drives the toggle and the backup line in Clear Glass)"
      depends_on: [UP12_open_a_pull_request_for_any_agent, UP11_an_attached_folder_tracks_origin]
      spec: docs/nexus-update.spec
      blocks: [MOD-UP-BACKUP-ROUTE, MOD-UP-APPLY-BACKED, MOD-UP-POLICY-TOGGLE]
      files: [lib/nexus-update.js, idearium/api/index.js, idearium/ui/update.html, idearium/cli/route-commands.js, lib/agent-tools/tools/nexus/update.js, lib/nexus/core-duties.js, tests/modules/test-nexus-update.test.js]
      does: >-
        James, 2026-11-01, on the Updates page: "can you fix the drop down? make it look better? make sure it hooks into idearium versionium, to
        backup the system". Before any update: Idearium snapshots the whole tree into its Nexus repo store and records it in Versionium (POST
        /api/nexus-self/backup); the update names the snapshot; no backup, no update (REVERSIBILITY). The store is Idearium's, so the
        automatic update and the agent tool ask its route (§5.15). The native white dropdown becomes three buttons in the page's theme. A fetch
        dropped mid-way (his page: "read ECONNRESET") is tried once more.

  verification_here: "Proven against real git repos built in a temp folder (an origin with a newer release, a clone behind it): check, a refused code collision, an archived data collision, apply, rollback. Not run on his machine; GitHub itself is reached by git, not by this test."
