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

  verification_here: "Proven against real git repos built in a temp folder (an origin with a newer release, a clone behind it): check, a refused code collision, an archived data collision, apply, rollback. Not run on his machine; GitHub itself is reached by git, not by this test."
