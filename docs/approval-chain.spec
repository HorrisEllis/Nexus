spec:

  # ════════════════════════════════════════════════════
  # docs/approval-chain.spec — an approved change, interconnected end to end: its run and who started it, the activity log, the
  # Versionium commit of its diff carrying its change-log entry, a route, a command and a screen to read the change log, and an
  # emission on the orchestrator's ledger (the pulse/event spine) at each step.
  # Format: emerge module spec (specDepth 1.0, no BLACK, invariants valid). Phases: docs/2026-10-21-approval-chain-phasemap.spec.
  # ════════════════════════════════════════════════════

  meta:
    name:        approval-chain
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      built
    uuid:        nexus-approval-chain-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log
      when approved. what about an api route or the pulse emission system". Earlier, his and kept: 2026-10-07 (VR1) "needs to snapshot
      every accept, every change, diff, write, only the changes" · 0.60.72 (RN2) "i want a changelog for each change or diff" · 0.39.173
      "make pulse emission an event". The direction is his. The coder's part: the grounding (what already held, what did not) and the
      design, decided by his axioms (APV0).
    purpose: >-
      Read one approved change from any end and reach the rest: the change-log line names the phase, the run, who started the run, who
      proposed and who approved, the files with their line counts, and the Versionium commit that holds the diff; the same entry is in the
      activity log and on the orchestrator's ledger, so the Flow graph and every SSE listener see it happen.
    target_runtime: [node, browser]
    language_stack: [javascript, html]
    paradigm: [one-record, projection-not-copy, resolver-hook, emit-through-the-existing-client]
    axioms: ["§8.6 reuse (repo-versions commit path, inject-gate lineDiff, summarizeRepoSnapshots, nexus-client, the activity log)",
      "§7.6 the codebase is a materialised view of the ledger: the change log is a projection of the commits, never a second store",
      "§0.3 nothing lost: a commit that fails keeps its entries pending; a gate entry not committed goes back", "§1.2 nothing silent: an emission that fails is counted, never thrown",
      "order of delivery: backend → route → command row → UI", "AXIOMS §4.1 UI tested in Clear Glass"]
    deps:
      - { name: versionium, version: "versionium :3754 via _versionium / _vcall", required: true, purpose: "the commit that holds the diff and its entry" }
      - { name: orchestrator-ledger, version: "orchestrator POST /api/ledger", required: false, purpose: "the event spine: per-system ledger, disk, SSE ledger.entry" }

    constraints:
      - id: APV-001
        description: "An approved change's change-log entry is written INTO the Versionium commit of its diff (provenance.changelog, and the message's first line); no separate change-log store."
        type: hard
        enforced_by: [GATE-APV-ONE-RECORD]
      - id: APV-002
        description: "An entry names its run, the run's starter, the proposer, the approver, and each file with its op and line counts; a field not known is null, never guessed."
        type: hard
        enforced_by: [GATE-APV-COMPLETE]
      - id: APV-003
        description: "Approved into Nexus's own live tree (the nexus gate), the entry rides on the system's sync commit; it is never dropped when that commit fails."
        type: hard
        enforced_by: [GATE-APV-GATE]
      - id: APV-004
        description: "Each step (run started, change approved, version committed) is emitted on the orchestrator's ledger through the existing nexus-client; an emission never blocks or fails the step."
        type: hard
        enforced_by: [GATE-APV-EMIT]

  schemas:

    - id: ChangeEntry
      name: ChangeEntry
      description: "One approved (or reverted) change, as its commit carries it."
      fields:
        title:      "string — one line: '<phase or path>: <why> (+a −r) — approved by <who>'"
        why:        "string|null — the proposal's reason: its goal, or the last history event"
        files:      "{ path, op: write|delete, added, removed }[]"
        approvedBy: "string|null — who approved (a person, 'auto' for the repo's auto mode)"
        proposedBy: "string — the hat or kind that proposed it"
        inject:     "string — the proposal's id"
        run:        "string|null — the run that produced it"
        phase:      "string|null — from the run (resolver)"
        map:        "string|null — from the run (resolver)"
        startedBy:  "{ who, whence }|null — from the run (RC7)"
        status:     "applied|reverted"
        at:         "number — ms"
      behavioral_contracts: ["pure: built from the inject and the resolver's answer only", "null for anything not known"]
      error_paths: ["no before text (a new file) → every line is added", "a delete → every line removed"]
      acceptance: ["an applied inject of a phase run gives the phase, the run, the starter and +/− counts"]

    - id: ChangeLogRow
      name: ChangeLogRow
      description: "One row of GET /api/repos/:uuid/changelog — a commit and the entries it carries."
      fields:
        commitId: "string"
        ts:       "number"
        message:  "string — the commit's message (its first entry's title when it carries one)"
        entries:  "ChangeEntry[] — empty for a commit with no approval (a plain save, a sync)"
        by:       "string[] — the commit's provenance.by"
      behavioral_contracts: ["newest first", "projection of Versionium history; nothing stored for it"]
      error_paths: ["Versionium unreachable → 502 with the reason"]
      acceptance: ["after an approval, the newest row carries that approval's entry"]

  interfaces:

    - id: IF-REPO-VERSIONS
      name: repo-versions
      path: lib/repo-versions.js
      description: "Every write to a repo is a Versionium commit (VR1); settle, attribute, label, commitNow."
      exports: ["touched", "attribute", "label", "commitNow", "settle", "flush", "setCommitter"]
      behavioral_contracts: ["a failed commit goes back to pending and is retried"]
      error_paths: ["no committer → kept pending"]

    - id: IF-REPO-INJECT
      name: repo-inject
      path: lib/repo-inject.js
      description: "Proposals: propose, apply (approve), reject, revert; _logActivity on every status change."
      exports: ["propose", "apply", "reject", "revert", "get", "list", "setEvidenceRoot"]
      behavioral_contracts: ["an applied inject is logged to the activity log and committed through repo-versions"]
      error_paths: ["the log or the commit never stops a proposal"]

    - id: IF-INJECT-GATE
      name: inject-gate
      path: lib/nexus-self/inject-gate.js
      description: "Approval into Nexus's live tree through the apply gate; lineDiff."
      exports: ["apply", "revert", "preview", "lineDiff"]
      behavioral_contracts: ["lineDiff lines start '+' or '-'"]
      error_paths: ["a moved live file → conflict"]

    - id: IF-SNAPSHOT
      name: repo-snapshot
      path: idearium/repo/snapshot.js
      description: "commitRepoSnapshot (provenance on the record); summarizeRepoSnapshots (a repo's commits, newest first)."
      exports: ["commitRepoSnapshot", "summarizeRepoSnapshots", "snapshotBranch", "SNAPSHOT_SYSTEM"]
      behavioral_contracts: ["provenance travels on the commit record"]
      error_paths: ["versionium down → retried, then said"]

    - id: IF-NEXUS-CLIENT
      name: nexus-client
      path: lib/nexus-client.js
      description: "The one client every system uses to call another by name (orchestrator, versionium, cortex …)."
      exports: ["call", "get", "post", "postDurable(system, path, body, opts) → { ok, buffered }", "drainBuffer() → { drained, remaining, failed, files }", "health", "resolve", "systems"]
      behavioral_contracts: ["postDurable buffers to disk when the target is unreachable; drainBuffer retries every buffered write"]
      error_paths: ["a real 4xx/5xx is an answer, never buffered"]

  modules:

    - id: MOD-APV-ENTRY
      name: change-entry
      uuid: nexus-apv-change-entry-v1-0000-2026-1021-001
      path: lib/change-entry.js
      phase: APV1_change_entry
      map: docs/2026-10-21-approval-chain-phasemap.spec
      description: >-
        Builds a ChangeEntry from an inject (its path, op, before and content, source, task, hat, approver, status) and what a resolver
        knows of its run (phase, map, title, startedBy). Line counts from inject-gate's lineDiff. title() is the one line a commit message,
        the activity log and the change log all show.
      deps: [{ name: inject-gate }]
      schema_refs: [ChangeEntry]
      exports: ["entry(inject, { run }) → ChangeEntry", "title(entry) → string", "counts(before, after) → { added, removed }", "runOf(inject) → string|null"]
      gate_pipeline: ["GATE-APV-COMPLETE"]
      behavioral_contracts: ["pure and deterministic", "a field not known is null"]
      error_paths: ["an inject with no content (a delete) → removed = its before's lines"]
      acceptance: ["entry() of a fixture inject with a run gives phase, startedBy, +2 −1"]

    - id: MOD-APV-COMMIT
      name: approval-commit
      uuid: nexus-apv-approval-commit-v1-0000-2026-1021-002
      path: lib/repo-versions.js
      phase: APV2_commit_carries_it
      map: docs/2026-10-21-approval-chain-phasemap.spec
      description: >-
        repo-versions gains note(repoUuid, entry): the entry rides on the pending change; settle() writes provenance.changelog and makes
        the first entry's title the commit message; a failed commit keeps its entries. setOnCommit(fn) is told each commit. repo-inject's
        _logActivity builds the entry (with setRunResolver's answer) and notes it before commitNow; a nexus-gate approval queues it by
        system (takeGateEntries) for the sync commit, which puts it back if that commit fails.
      deps: [{ name: change-entry }, { name: repo-versions }, { name: repo-inject }]
      schema_refs: [ChangeEntry]
      exports: ["note(repoUuid, entry)", "setOnCommit(fn)", "setRunResolver(fn)", "takeGateEntries(system)", "returnGateEntries(system, entries)"]
      gate_pipeline: ["GATE-APV-ONE-RECORD", "GATE-APV-GATE"]
      behavioral_contracts: ["the commit of an approval carries its entry", "the activity log's version.commit row titles it"]
      error_paths: ["versionium down → entries kept pending with the change, committed with the next"]
      acceptance: ["approving a proposal commits once, its message the entry's title, provenance.changelog holding it"]

    - id: MOD-APV-READ
      name: changelog-route
      uuid: nexus-apv-changelog-route-v1-0000-2026-1021-003
      path: idearium/api/index.js
      phase: APV3_changelog_read
      map: docs/2026-10-21-approval-chain-phasemap.spec
      description: >-
        GET /api/repos/:uuid/changelog?limit — ChangeLogRow[] projected from the repo's Versionium history (summarizeRepoSnapshots, which
        now passes provenance.changelog through). Command row `repo changelog <repo> [--limit n]`. The repo drawer's Versions view shows
        each commit's change-log lines.
      deps: [{ name: repo-snapshot }]
      schema_refs: [ChangeLogRow]
      exports: ["GET /api/repos/:uuid/changelog", "`repo changelog <repo>` command row", "drawer Versions: the change-log line"]
      gate_pipeline: ["GATE-APV-ONE-RECORD"]
      behavioral_contracts: ["reads only; newest first"]
      error_paths: ["versionium unreachable → 502, said"]
      acceptance: ["the route lists the approval's entry under its commit; the row prints it; the drawer shows it (Clear Glass)"]

    - id: MOD-APV-EMIT
      name: approval-emit
      uuid: nexus-apv-approval-emit-v1-0000-2026-1021-004
      path: idearium/api/index.js
      phase: APV4_emit_on_the_ledger
      map: docs/2026-10-21-approval-chain-phasemap.spec
      description: >-
        _emitLedger(type, payload): Idearium's one door onto the orchestrator's ledger (POST /api/ledger { system: 'idearium', type,
        payload }) through _nexusClient.postDurable — never awaited by the step; orchestrator down → buffered on disk, not lost (§0.3).
        Nothing drained that buffer before (lib/failure-post.js's failure modes too, §1.2): Idearium drains it every minute. Counted:
        GET /api/ledger/out shows sent, buffered, failed, drained and the last error. Emitted: idearium.phase.run.started (with startedBy), idearium.change.approved / .reverted (the entry), idearium.version.
        commit (commitId, message, entries), idearium.repo.released. The orchestrator's ledgerWrite records each to Idearium's ledger and
        broadcasts ledger.entry on SSE.
      deps: [{ name: nexus-client }]
      schema_refs: [ChangeEntry]
      exports: ["_emitLedger(type, payload)", "GET /api/ledger/out", "`ledger out` command row"]
      gate_pipeline: ["GATE-APV-EMIT"]
      behavioral_contracts: ["fire and forget; the step never waits", "counted: sent, failed, last error"]
      error_paths: ["orchestrator down → buffered += 1, drained on the next minute it answers; a real 4xx/5xx → failed += 1, last error kept"]
      acceptance: ["an approval emits change.approved then version.commit with the same inject id"]

    - id: MOD-APV-WIRES
      name: approval-wires
      uuid: nexus-apv-approval-wires-v1-0000-2026-1021-005
      path: loom/maps/run-state-map.js
      phase: APV5_wired_in_loom
      map: docs/2026-10-21-approval-chain-phasemap.spec
      description: "lib/change-entry.js in loom with its real require/consumer edges (repo-inject → change-entry → inject-gate; idearium/api → change-entry)."
      deps: [{ name: change-entry }]
      schema_refs: []
      exports: ["FILES and CONSUMERS rows"]
      gate_pipeline: ["GATE-APV-ONE-RECORD"]
      behavioral_contracts: ["every edge is a real require"]
      error_paths: ["a declared edge with no require → loom's scanner flags it"]
      acceptance: ["test-loom-map and test-run-state pass with the rows"]

  events:
    approval:
      - "idearium.phase.run.started"
      - "idearium.change.approved"
      - "idearium.change.reverted"
      - "idearium.version.commit"
      - "idearium.repo.released"

  enforcement:
    gates:
      - { id: GATE-APV-ONE-RECORD, name: one-record, severity: fatal, check: "no change-log table or file is written; the entry is read back from the commit", on_failure: "build failure" }
      - { id: GATE-APV-COMPLETE, name: complete-entry, severity: high, check: "entry() returns every ChangeEntry field, null where unknown", on_failure: "build failure" }
      - { id: GATE-APV-GATE, name: gate-entries-kept, severity: high, check: "a gate entry is on the sync commit or still queued", on_failure: "build failure" }
      - { id: GATE-APV-EMIT, name: emit-never-blocks, severity: high, check: "_emitLedger is not awaited by a step; failures counted", on_failure: "build failure" }

# ADDENDUM 2026-10-21 (0.60.190) — built as specced
# James, 2026-10-21: "make sure it's all interconnected, changes are logged and the diff snapshotted in versionium with a change log when approved."
# - All five modules built. test-approval-chain APC-01..06 covers them, against the real API and Versionium's own routes (APC-06 in Clear Glass).
# - Two doors apply through RI.apply directly: the repo's auto mode and the upload answer. They emit no change.approved, but their commits
#   still carry the entry and still emit version.commit.
