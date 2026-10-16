# docs/2026-10-16-nexus-git-sync-phasemap.spec
# Nexus synced with its git repository through Versionium and Idearium, so the code he runs, the code on GitHub and the repo Idearium manages are one thing.
# MAPPED before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec. Nothing below is built.

origin:
  date: 2026-10-16
  james: >-
    "i want to sync, nexus with the git repo, with versionium/idearium"
  context: >-
    Same day as the COS application (COSA1 built 0.60.66) and the Idearium/COS sync idea (COSA9). His running Nexus is an unzipped download with no .git (npm run update said so on 2026-10-15), 17 releases behind GitHub.
  reading: >-
    To confirm. Nexus itself is registered in Idearium as a repo; that repo has the GitHub remote (HorrisEllis/nexus); pulling a newer release brings it into his running copy through Versionium
    (a snapshot first, every change a commit); his own edits can go back to GitHub on a branch. Not read as: Idearium pushing every Versionium commit to GitHub (that would bury the history in noise).

grounded:
  already_built:
    - "lib/repo-git.js (0.39.265): status, remote, commit, push, pull (fast-forward only, returns which files changed), clone, SSH keygen; every git has GIT_TERMINAL_PROMPT=0 and a timeout."
    - "idearium/api: POST /api/repos/:uuid/git/remote|push|pull (registry-components.js lines 176-179). Idearium UI app.js uses them."
    - "Versionium VR1 (0.40.0): every file change a commit, releases with tags, `repo releases`, `repo versions`, `repo diff`, `repo restore-file`."
    - "scripts/update.js (npm run update): git pull --ff-only on a clone, npm install only when package files changed, data/** never in git. Refuses, with the reason, when the folder is not a clone."
    - ".github/workflows/release.yml + scripts/release-zip.js: nexus-<version>.zip per release (VERSION inside)."
  gaps_found:
    - "No command row for git. The routes exist; `repo git`/`repo push`/`repo pull` do not (grep of idearium/cli/route-commands.js), so no agent and no CLI user has them (CLI first, agents get what a person gets)."
    - "Nothing registers Nexus ITSELF as an Idearium repo with the GitHub remote. repo-expand treats a repo as 'a Nexus system' skeleton; Nexus as the whole is not one."
    - "His copy is not a git clone, so none of this can pull into it. Either he clones (npm run update says how), or COS imports the release zip (COSA1) which is not git at all."

failure_modes:
  two_writers: "He edits files on his PC; the sandbox (this coder) pushes to GitHub main. A fast-forward pull then refuses, correctly. Policy needed: GitHub main is the truth; his local edits go to a branch (local/<machine>) and are never force-pushed."
  commit_noise: "Versionium commits every change. Pushing all of them would put thousands of commits on GitHub. Push only releases (tagged heads) and explicit pushes."
  pull_while_running: "Pulling changes files under a running Nexus. A pull is a COS/COSA4 switch, not a hot edit: stop, snapshot, pull, start, health check, roll back on failure."
  secrets_and_state: "data/** is never committed (already the rule); a token or SSH key is never written into a repo or a node; push refuses a diff that contains one (repo.integrity already scans)."
  credentials: "A missing credential must fail with git's message, not hang (repo-git already does)."
  history_mismatch: "His zip has no history. Cloning gives the real history; importing the zip as versions (repo.history-import) keeps his local state. Two histories for one project is two contracts: surface it, do not merge silently."

decisions:
  GS0_authority:
    coder_recommends: "GitHub main is the truth for code. Idearium/Versionium is the local, finer-grained record. His local edits push to a branch, never to main."
    chosen: null
  GS0b_what_gets_pushed:
    coder_recommends: "Releases (tagged) and explicit pushes only, not every Versionium commit."
    chosen: null
  GS0c_his_copy:
    coder_recommends: "A real clone for the dev copy (npm run update works); COS (COSA1/COSA4) for the copy he just runs. Both stay in sync with GitHub, neither is hand-edited in place."
    chosen: null

phases:
  GS1_commands:
    status: OPEN
    does: "Command rows `repo git status|remote|push|pull|branch` (CLI first) over the existing routes; push/pull/remote are personOnly (credentials and the outside world), status is open to agents. Also a Nexus-level `sync status`: version here, version on GitHub, ahead/behind, dirty files."
    proof: "status on a clone shows ahead/behind; pull on a dirty tree refuses and lists the files; push without a credential fails with git's message, no hang."
  GS2_nexus_as_a_repo:
    status: OPEN
    depends_on: [GS1_commands]
    does: "Register Nexus itself as an Idearium repo (its charter = AXIOMS, Nexus's own), remote HorrisEllis/nexus, so repo versions/releases/notes/phasemap work on Nexus the way they do on any project."
  GS3_pull_is_a_switch:
    status: OPEN
    depends_on: [GS2_nexus_as_a_repo]
    does: "A pull into a running Nexus snapshots first (Versionium), pulls fast-forward only, runs npm install only if package files changed, restarts through autopilot, health-checks, and restores the snapshot on failure. Shares the switch/rollback with COSA4."
  GS4_push_policy:
    status: OPEN
    depends_on: [GS1_commands]
    does: "Local edits go to local/<machine> through a commit with provenance (who and why, Versionium already records it); main is never pushed from here; a diff with a secret is refused."
  GS5_release_alignment:
    status: OPEN
    does: "A release cut in Idearium (repo releases --cut) is the same version the tag, lib/version.js, package.json and the zip carry (lib/release-version.js agreement already checks three places; add the Idearium release as the fourth)."
  GS6_update_notice:
    status: OPEN
    does: "Clear Glass 'New Nexus release is out' job (0.60.65) is the notice; this adds a button/command that runs GS3 after he agrees. Offered, not forced."

questions_for_james:
  - "Is your running copy going to be a git clone, or the COS app importing zips (or both)? It decides whether GS3 pulls or imports."
  - "GS0: is GitHub main the truth, with your local edits on a branch? I recommend yes."
