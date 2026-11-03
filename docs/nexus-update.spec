spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # docs/nexus-update.spec — the update tool, specced (UP13 of docs/2026-10-25-nexus-update-phasemap.spec). Its phases UP0–UP12 predate the
  # spec rule (said in UP10, a gap); this spec starts with what UP13 adds and grows a module as each later phase lands. Format: emerge's
  # module spec, compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node (tests/modules/test-substrate-spec.test.js
  # SS-01, compile only until every UP phase names it).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        nexus-update
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-01T00:00:00Z
    status:      specced
    uuid:        nexus-update-spec-v1-0000-2026-1101-jamesbrooks-001
    origin: >-
      James, 2026-11-01, on Idearium's Updates page (0.60.361, 3 commits behind): "can you fix the drop down? make it look better? make sure it
      hooks into idearium versionium, to backup the system". Before it, 2026-10-25: "can we make a tool for the copilot ... like a update tool
      using github?" The direction and the calls are his; the placement (the backup is Idearium's, asked by route) is decided by his axioms.
    purpose: >-
      Nexus updates itself from GitHub, and never without a backup: before any update applies, Idearium snapshots the whole Nexus tree into its
      Nexus repo's store (content-addressed) and records the snapshot in Versionium; the update's own record names that snapshot. No backup,
      no update.
    target_runtime: [node]
    language_stack: [javascript, html, css]
    paradigm: [backup-before-change, owner-serves-by-route, fail-closed]
    axioms: ["REVERSIBILITY and §0.3: a backup before every update; no backup, no update",
      "§5.15: the snapshot store is Idearium's (it lives in Idearium's data); every other process asks Idearium's route",
      "§17.12: the backup and the update are recorded in Versionium", "§8.6: lib/nexus-self/store.js snapshot() and lib/versionium-record.js reused"]
    deps:
      - { name: git, version: ">=2.20", required: true, purpose: "fetch, fast-forward, the version at a ref" }

    constraints:
      - id: UPS-001
        description: "An update applies only with a backup taken for it (its snapshot hash on the update's record); without one it is refused, said."
        type: hard
        enforced_by: [GATE-UPS-BACKUP-FIRST]
      - id: UPS-002
        description: "The Nexus-self store is written only in Idearium's process; another process asks POST /api/nexus-self/backup."
        type: hard
        enforced_by: [GATE-UPS-OWNER]

  schemas:

    - id: UpdateBackup
      name: UpdateBackup
      description: "The backup taken before an update: a snapshot of the whole Nexus tree in Idearium's Nexus repo store."
      fields:
        ok:        "boolean — taken"
        snapshot:  "string — the snapshot's hash (content-addressed; the same tree gives the same hash)"
        created:   "boolean — false when the tree had not moved since the last snapshot (the existing one is the backup)"
        files:     "number — the files in it"
        version:   "string — the running version it backs up"
        by:        "string — person | auto | agent"
        why:       "string — the reason, e.g. 'before update 0.60.361 → 0.60.362'"
        error:     "string — when not ok, why"
      behavioral_contracts: ["snapshot names a tree that exists in the store", "recorded in Versionium (kind nexus.backup)"]
      error_paths: ["the store cannot be written → ok false with the error"]

  interfaces:

    - id: IF-NEXUS-SELF-STORE
      name: nexus-self-store
      path: lib/nexus-self/store.js
      description: "The Nexus repo's content-addressed store: snapshot() hashes the live tree, keeps every new blob, writes the tree once."
      exports: ["snapshot({ liveRoot, root }) → { hash, created, systems, stats }", "storeRoot() → Idearium's data dir/nexus-self"]
      behavioral_contracts: ["an unchanged tree returns the existing snapshot (created false)"]
      error_paths: ["a file unreadable → skipped"]

    - id: IF-VERSIONIUM-RECORD
      name: versionium-record
      path: lib/versionium-record.js
      description: "The one way to record in Versionium; buffered when Versionium is down, never blocking."
      exports: ["record({ kind, message, change, causedBy, by, version }) → Promise"]
      behavioral_contracts: ["a record made while Versionium is down waits in the buffer"]
      error_paths: ["never throws to the caller"]

    - id: IF-NEXUS-CLIENT
      name: nexus-client
      path: lib/nexus-client.js
      description: "Reaching another system by its route."
      exports: ["call(system, method, path, body, { timeout }) → Promise<object>"]
      behavioral_contracts: ["the system's port from its declaration"]
      error_paths: ["no answer → throws with the reason"]

  modules:

    - id: MOD-UP-BACKUP-ROUTE
      name: backup-route
      uuid: nexus-update-backup-route-v1-0000-2026-1101-001
      path: idearium/api/index.js
      phase: UP13_a_backup_before_every_update
      description: >-
        Idearium's POST /api/nexus-self/backup { by, why }: in Idearium's own process, IF-NEXUS-SELF-STORE snapshot() of the running tree, then
        IF-VERSIONIUM-RECORD (kind nexus.backup, the hash, the version, why). Answers UpdateBackup. Also a command row `update backup`.
      deps: [{ name: nexus-self-store }, { name: versionium-record }]
      schema_refs: [UpdateBackup]
      exports: ["POST /api/nexus-self/backup → UpdateBackup", "row `update backup`"]
      gate_pipeline: ["GATE-UP13-001: who and why named", "GATE-UP13-002: snapshot taken in Idearium's process", "GATE-UP13-003: recorded in Versionium"]
      behavioral_contracts: ["the snapshot is of the live tree at the moment of the call"]
      error_paths: ["the snapshot throws → 500, UpdateBackup ok false with the error"]
      acceptance: ["a call gives a hash that exists in the store and a Versionium record carrying it"]

    - id: MOD-UP-APPLY-BACKED
      name: apply-backed
      uuid: nexus-update-apply-backed-v1-0000-2026-1101-001
      path: lib/nexus-update.js
      phase: UP13_a_backup_before_every_update
      description: >-
        apply({ …, backup }) refuses unless backup is an UpdateBackup with ok true (UPS-001); the update's history row and its Versionium record
        carry backup.snapshot. applyBacked(opts) obtains the backup first: in-process when given backupFn (Idearium's own route), else by asking
        Idearium's route through IF-NEXUS-CLIENT (UPS-002), then applies. The automatic update and the agent tool use applyBacked. A fetch that
        fails on a dropped connection (ECONNRESET, ETIMEDOUT, ECONNABORTED) is tried once more after 3 s.
      deps: [{ name: nexus-client }, { name: backup-route }]
      schema_refs: [UpdateBackup]
      exports: ["apply({ root, confirm, by, backup, … }) → { ok, …, backup } | { ok:false, error }", "applyBacked(opts) → Promise<same>"]
      gate_pipeline: ["GATE-UP13-010: confirm", "GATE-UP13-011: a backup, ok, before anything is touched", "GATE-UP13-012: the row and the record carry the snapshot"]
      behavioral_contracts: ["no update without a backup", "the backup is taken before any file is set aside or merged"]
      error_paths: ["Idearium unreachable → no backup → refused: 'no backup of Nexus could be taken: …'"]
      acceptance: ["without a backup, refused and nothing changed; with one, updated and the history row names the snapshot"]

    - id: MOD-UP-POLICY-TOGGLE
      name: policy-toggle
      uuid: nexus-update-policy-toggle-v1-0000-2026-1101-001
      path: idearium/ui/update.html
      phase: UP13_a_backup_before_every_update
      description: >-
        The automatic-updates choice as three buttons (auto — when idle · notify — tell me only · off), a radiogroup in the page's own dark
        theme instead of the browser's white native list; the chosen one lit, each with what it does under it. The history line names each
        update's backup.
      deps: [{ name: apply-backed }]
      schema_refs: [UpdateBackup]
      exports: ["#pol radiogroup: buttons [data-pol]", "history: '· backup <hash8>'"]
      gate_pipeline: ["GATE-UP13-020: one chosen, aria-checked", "GATE-UP13-021: POST /api/update/policy on choose"]
      behavioral_contracts: ["the page's theme only; no native popup"]
      error_paths: ["the policy POST fails → said in the page's bad line"]
      acceptance: ["in Clear Glass: three buttons, the current one checked; choosing another posts it and re-reads it"]

  events:
    update:
      - "versionium nexus.backup { snapshot, version, by, why }"
      - "versionium nexus.update.update { from, to, files, backup }"

  enforcement:
    gates:
      - { id: GATE-UPS-BACKUP-FIRST, name: backup-first, severity: fatal, check: "apply refuses without an ok UpdateBackup", on_failure: "suite red" }
      - { id: GATE-UPS-OWNER, name: owner-writes, severity: error, check: "only idearium/api writes the nexus-self store for a backup; others ask its route", on_failure: "the boundary ratchet" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "tests/modules/test-nexus-update.test.js — UP-13a..c: refused without a backup; the backup on the row; the route's snapshot and record"


# ── ADDENDUM 2026-11-02 (0.60.376) — keep mine and update (CE3) ──
# James, 2026-11-02: "i want toasts in cos ui for gibhub updates with a update tool. so i can update nexus automatically. per system" · "Yes. I need the cos ui to be a full enterprise grade, windows service, option to close or minimize to tray, manage systems,"
# His three boots of 0.60.338 each found 0.60.343 on GitHub and stopped at "diverged: 1 local commit(s) not on GitHub — merging is yours". The
# automatic update could never move past one local commit. Added (docs/2026-11-02-cos-enterprise-phasemap.spec CE_D1, by his axioms §0.3,
# REVERSIBILITY, §1.2):
# - check() returns local: { count, onGitHub, commits } (git cherry: how many local commits GitHub already has by content), and can names
#   keep-local.
# - keepLocal / keepLocalBacked:
#   - a backup first (UP13);
#   - each local commit kept on a branch local/<date>;
#   - colliding data set aside (_setAside, now shared with apply);
#   - git reset --keep to origin, which refuses rather than overwrite an uncommitted edit;
#   - recorded in history (kind keep-local), and so in Versionium.
# - autoTick: under auto, when every local commit is already on GitHub by content, it keeps them on a branch and moves on by itself. Any commit
#   GitHub lacks stays his call, offered on COS's card.
# - The route is POST /api/update/keep-local (Idearium); the command row is `update keep-local --yes` (the person's).

# ── ADDENDUM 2026-11-02 (0.60.381, SC7) — keepLocal, a policy setting ──
# James, 2026-11-02: "A gear, with update settings and Build that update section in cos. With a gear". getPolicy/setPolicy carry keepLocal: auto
# (CE3's behaviour: under auto, local commits GitHub already has by content are kept on local/<date> and the update goes on) or ask (the tick
# stops at "blocked" and waits for his Keep mine and update). setPolicy refuses everyHours outside 1–168 and keepLocal outside auto|ask.
# Set from COS's gear (PATCH /api/cos/update/settings), Idearium's POST /api/update/policy, or `update policy --keep-local ask`.
