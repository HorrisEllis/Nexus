spec:
  meta:
    name:        idearium.repo-snapshot
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    owner:       idearium
    uuid:        nexus-idearium-repo-snapshot-v1-0000-2026-0920-001
    author:      james-brooks
    compiled_by: claude
    created:     2026-09-20
    status:      Specified
    implements:  'nexus-repository-system.spec §33 snapshots.must_record'
    closes:      'docs/nexus-repository-system-build-phasemap.spec MCO3_snapshot_compliance'
    purpose: >
      A repo snapshot records everything §33 says a snapshot must record:
      source hash, Git commit, atlas version, chunk index version, graph
      version, dependency state, environment, test state, verification
      state. It is committed to versionium through the existing commit
      pipeline. No new commit mechanism, no second store.

  build_order:
    law: '§8.5 — spec before build; §3.4 — raw code before interfaces.'
    written_before_code: true
    sequence:
      - 'this spec'
      - 'idearium/repo/snapshot.js — builder + injectable-transport committer, callable from raw node'
      - 'tests/modules/test-mco3-repo-snapshot.js — real pipeline, real git repo, real versionium engine round trip'
      - 'idearium/api/index.js — repo.snapshot.* routes, only after the library is proven'
      - 'idearium/index.js restoreSnapshot — refuse repo-snapshot state (see hazard below)'

  finding_before_build:
    law: '§16.1 — the next bottleneck determines the next task.'
    what_the_phasemap_assumed: >
      MCO3 was written as "additive fields on the existing real
      versionium_commit". The existing idearium commit (IdeaOS
      commitSnapshot) snapshots ideas/specs/gaps, not a repository. There
      is no repo-scoped commit for fields to be added to, and MCO-B
      (per-file snapshot/delta) is NOT STARTED. So this phase adds the
      repo-scoped commit path itself, on top of versionium's unchanged
      engine.commit(). MCO-B stays out of scope: this records the
      derived state of a repo at a moment. It does not store file
      content and cannot restore files.
    hazard_found:
      - >
        IdeaOS.snapshots()/snapshot()/restoreSnapshot() read
        versionium history?system=idearium. A repo snapshot committed
        under system 'idearium' would appear in the idea snapshot list,
        and restoring it would set ideas/specs/gaps/links to [] (the
        restore does state.ideas || []). Repo snapshots therefore commit
        under their own system, 'idearium.repo', and restoreSnapshot
        refuses any state marked kind:'repo-snapshot' before it mutates
        or stashes anything.
      - >
        IdeaOS.commitSnapshot() posted to system 'cortex'. Cortex answers
        every /api/versionium/* with 410 (versionium is sovereign at
        :3754). Idea snapshot push has therefore been failing. Repo
        snapshots post to 'versionium' directly, and commitSnapshot gets
        the same one-word correction, since it shares this path.

  record:
    shape: >
      state = { kind: 'repo-snapshot', schema: SCHEMA_VERSION, repository,
      repoName, takenAt, mustRecord: { <9 keys below> } }.
      Committed with system 'idearium.repo' on branch 'repo-<uuid>'.
    rule_unknown_is_not_zero: >
      Every one of the nine keys is ALWAYS present. A value that cannot
      be determined carries available:false and a stated reason. It is
      never omitted, never 0, never an empty string. A reader can tell
      "there is no git repo here" from "nobody looked".
    fields:
      sourceHash: >
        sha256 over sorted "path<TAB>contentHash" lines of the files the
        index recorded (indexes/files.json). Also re-derived from the
        files as they are on disk right now, so fresh:true/false says
        whether the atlas/chunks/graph below still describe this source.
        A snapshot of stale indexes is recorded as stale, not hidden.
      versionCommit: >
        0.39.263 (was gitCommit) — James: "loom depends on the .git i want
        versionium to hold the history for each repo." The repo's history
        is its versionium snapshots on branch repo-<uuid>; nothing reads a
        .git. { available:true, source:'versionium', branch, parent,
        parentKnown }: parent is the snapshot before this one, known once
        the file layer planned it (plan().baseCommitId); without a file
        layer parentKnown:false says it was not asked. Records written
        before 0.39.263 carry gitCommit (HEAD of a .git IN the repo
        directory) instead; readers accept either.
      atlasVersion: >
        atlas.json declares no version. Identity is its sha256 and its
        own generatedAt. Stated as such (declaredVersion: null).
      chunkIndexVersion: >
        chunks/index.json declares no version. Identity is its sha256 and
        chunk count.
      graphVersion: >
        graph.json declares version (GRAPH_VERSION) and generatedAt;
        recorded with its sha256 and node/edge/unresolved counts.
      dependencyState: >
        Manifests and lockfiles found among indexed files with their
        content hashes, declared dependency counts for a root
        package.json, lockfile present, node_modules present.
      environment: >
        compartmentId from the repo record, plus the node/platform/arch of
        the process taking the snapshot. The repo's own runtime is owned
        by its Compartment (§32) and is not resolved here: runtime is
        null with that reason.
      testState: >
        From verification.lazy.json L6: found/run/skipped counts, failed
        test files, and the lazy pass status. 'pending' or missing lazy
        verification is reported as such, not as passed.
      verificationState: >
        verification.json L0-L5 plus verification.lazy.json L6-L8, one
        entry per tier (passed / not_applicable / pending), overall
        status, failure counts.

  gate:
    MCO3: >
      MET when a real commit's metadata round-trips all nine must_record
      keys, verified against one real commit read back through
      versionium's own getState(), not asserted.

  not_done:
    - 'MCO-B per-file snapshot/delta: no file content is stored, so a repo snapshot cannot restore files'
    - 'restoring files: MCO-B (versionium/spec/versionium.file-versioning.spec) adds the file layer and the restore. MCO3 alone records derived state only'
    - 'comparing two arbitrary snapshots (the UI compares a snapshot with the one before it only)'
    - 'snapshotting the repo runtime (owned by the Compartment)'

  ui:
    where: 'idearium/ui — repo subtab "Versionium" (js/app.js §VERSIONIUM, index.html #repo-subtab-versionium)'
    shows: >
      Snapshot list (newest first), a take-snapshot control, and per-snapshot
      detail of all nine fields, each unavailable field with its stated
      reason. A strip compares a snapshot with the one before it: identity
      comparisons only (source-on-disk hash, git commit, atlas/chunk/graph
      hashes, test and verification status). No score.
    source_compare: >
      The strip compares sourceHash.diskHash (the source as it was on disk
      at snapshot time), NOT sourceHash.value, which is the hash the
      indexes were built from and does not move when a file is edited
      without a reindex.
    says_plainly: 'as of MCO-B the tab also shows the file layer and restore; see versionium.file-versioning.spec'
    test: 'tests/modules/test-mco3-versionium-tab.js — jsdom, fed by the real snapshot library'
