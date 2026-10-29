# Versionium everywhere: every change and every version, in full, recorded in Versionium (2026-10-29)

origin: >-
  James, 2026-10-29: "can you add that to claude. full changes, and versions have to be pushed to versionium? enforce it everywhere that
  you'd find it. maybe the axioms". Said right after 0.60.277, where Versionium came to own the changelogs and release logic (his (a)).
  Reading, the coder's (to confirm): every change and every version, in full, is recorded in Versionium wherever it is made: law (axioms),
  working agreement (CLAUDE.md), and code at each place a change or version is made.

status: MAPPED 2026-10-29

## Audit (the census, read from the code 2026-10-29)
Already recorded in Versionium:
- the Nexus tree, in full: Idearium's nexus-self sync (idearium/api/index.js _nexusSelfSync, at boot then every NEXUS_SELF_SYNC_MS,
  default 10 min) commits each changed system as a repo snapshot with its files (full copy or proven delta, versionium/routes/files.js);
- every Idearium repo's versions and releases (lib/repo-versions.js, lib/repo-releases.js); agent commits (lib/repo-agent.js,
  lib/agent-tools versionium-commit); the orchestrator's sigma auto-commit; the intelligence ALK writer;
- Nexus's releases (versionium/lib/nexus-releases.js sync), at Idearium's boot.
Not recorded (the gaps):
- G1 a nexus-self apply, failed apply or rollback (lib/nexus-self/apply.js: change packs, self-builds): its record (who, why, each path
  before → after, applyId) stays in lib's own store and ledger. The content reaches Versionium in the next sync snapshot, but not what
  the change was or why.
- G2 an update applied by lib/nexus-update.js (from → to version, how): data/update/history.jsonl only.
- G3 release sync records the commits of only the last ~30 releases ('recent'); the full changes of older ones are not in Versionium.
- G4 the tree snapshot does not say which Nexus version it is, so a version cannot be found among the snapshots.

decisions:
  VE_D1_one_recorder_durable:
    chosen: >-
      lib/versionium-record.js: record({ kind, system, message, change, causedBy, by }) posts a Versionium commit through
      lib/nexus-client.js postDurable. When Versionium is down the record waits in nexus-client's disk buffer and drainBuffer
      (Idearium every minute) delivers it. Nothing new invented: the transport and the buffer exist.
    by_the_axioms: "§8.6 reuse; §5.15 rules 1 and 3 (Versionium owns versions; its outage loses nothing and stops nothing); §0.3 nothing lost; §1.2 the result says buffered"
  VE_D2_full_means_content:
    chosen: >-
      "full changes": each changed path carries before and after text when both are text up to 256 KB. Otherwise it carries their
      sha256s and where the bytes are (the nexus-self blob store, or the next tree snapshot in Versionium), said in the record.
    by_the_axioms: "§0.1 evidence; §1.2 a cap is said, not silent"

phases:
  VE0_law_and_agreement:
    layer: foundation
    depends_on: [VE_D1_one_recorder_durable]
    files: [docs/AXIOMS-v3.1.md, CLAUDE.md, docs/CLAUDE.md, docs/SPEC-REGISTRY.spec]
    does: §17.12 in the axioms (with a dated addendum and a quick-reference line); CLAUDE.md and docs/CLAUDE.md say it
  VE1_recorder:
    layer: foundation
    depends_on: [VE_D1_one_recorder_durable, VE_D2_full_means_content]
    files: [lib/versionium-record.js, lib/nexus-client.js]
    does: record(), fullChange(items, readBlob), pending() (what waits in the buffer for Versionium)
  VE2_nexus_self_applies:
    depends_on: [VE1_recorder]
    files: [lib/nexus-self/apply.js]
    does: apply, failed apply and rollback each recorded in full (G1)
  VE3_updates:
    depends_on: [VE1_recorder]
    files: [lib/nexus-update.js]
    does: every update row recorded (G2)
  VE4_releases_and_tree_versions:
    depends_on: [VE1_recorder]
    files: [idearium/api/index.js, versionium/routes/nexus-releases.js]
    does: release sync records every release's commits (G3); each tree snapshot names the running Nexus version in its message and provenance (G4)
  VE5_seen:
    depends_on: [VE1_recorder, VE2_nexus_self_applies, VE3_updates]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/repo-releases.js, tests/modules/test-versionium-everywhere.test.js]
    does: GET /api/versionium/pending, the command `versionium pending`, and a line in the Versionium tab's Releases ("N records waiting for Versionium")

# STATUS 2026-10-29 (0.60.278): VE0–VE5 BUILT.
# Also found and closed while enforcing: idearium's committer skipped a repo change when the setting versions.every_change was off (the
# coder's switch, 0.40.0; his words there: "needs to snapshot every accept, every change"). The setting is kept, and the change is now
# recorded and said in `note` (idearium/spec/idearium.repo-snapshot.spec addendum).
# Proof: test-versionium-everywhere 4/4. Unchanged: nexus-self-and-cos-run 30/30, nexus-inject-approval 9/9, change-pack 6/6, nexus-update
# 11/11, repo-versions 6/6, mco3-versionium-tab 32/32, system-boundary 10/10, route-contracts 4/4, release-notes 6/6 (RN2-06 finds the
# releases request among the view's calls now that it also asks what is pending), test-releases with its base RL-03.
# Open, said: Clear Glass's own records (macros, node files, settings) are its data, not versions of code. Recording edits to them is not in
# this map, to confirm with him.
