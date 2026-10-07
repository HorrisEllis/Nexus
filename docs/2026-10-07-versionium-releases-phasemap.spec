spec:
  meta:
    name:     versionium-releases
    version:  1.0.0
    date:     2026-10-07
    release:  "after 0.39.376 — each phase its own version (VR0 decides the scheme)"
    uuid:     nexus-versionium-releases-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "versionium + idearium + cortex — continues docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec,
               versionium/spec/versionium.file-versioning.spec (MCO-B), docs/2026-09-29-nex-node-store-phasemap.spec (N1)
               and docs/2026-10-07-compartment-control-and-activity-phasemap.spec (land(), AL1)."
    status:   "VR1 BUILT (0.40.0). The rest MAPPED. Goes before UN1/SP1/DC1/DX1 (the UI phases then get release notes of their own)."
    origin: >
      James, 2026-10-07: "need a releast notes section for each projecy also which shows each version and whats been
      added with a clear versioning scheme, each minor improvement is 0.0.01. major changes 0.01 each iteration? what do
      you think? provanance is first class data. cortex is the book keeper. nodes are th data dtructure" · "and link the
      releases with versionium. needs to snapshot every accept, every change, diff, write, only the changes. like
      github., supposed to be an alternative to github to an extent. but i want to replace it for myself."

  # What exists (read before mapping — reuse, do not rebuild):
  grounded:
    versionium_commits: "versionium/lib/engine.js commit(), history(), createBranch() — a branch per repo (repo-<uuid>), parent chain, causedBy"
    versionium_files:   "versionium/lib/files.js plan / record / tree / content — per-file rows, text deltas stored only after re-applying and matching sha256; only changed contents are sent (plan says which)"
    repo_snapshot:      "idearium/repo/snapshot.js commitRepoSnapshot() — the nine-key snapshot record, committed through versionium"
    nodes:              "lib/nexstore/record.js — the node store: every record carries by, at, causedBy (required), prev hash → a chain"
    land:               "lib/repo-inject.js land()/_write() — the one door every agent's file passes; _logActivity records it (AL1)"
    gap: >-
      Versionium commits a repo only at baseline (import, save, restore — idearium/api/index.js takeSnapshot). An
      accepted proposal, an agent's auto write, a revert, a person's edit: none is a commit. So there is no history of
      changes to diff, nothing for a release to point at, and nothing Nexus could replace GitHub with. Versionium also has
      no tags (a named commit that never moves).

  lattice_grounded:
    exists: >-
      Three associative lattices, each correct and each partial: meta/crystal-lattice.js (lattice_edges between
      concepts/states/compartment types, weighted by outcome, decaying), intelligence/spatial/system-lattice.js (systems
      and components, from CFR's causal edges, deliberately a separate instance), and idearium's LatticeEngine (ideas,
      specs, gaps — in memory). cortex/cortex-v2.js already reads lattice_nodes / lattice_edges (`lattice status|search`).
    none_holds: "the provenance nodes — commits, releases, activity rows, proposals, faults, tasks, phases — nor the edges between them"

  decided:
    cortex_bookkeeper_is_the_lattice: >-
      James: "cortex is the book keeper. the associative lattice to interconnect all the nodes". Cortex keeps the books by
      linking, not by writing ledgers: every provenance node (nexstore record) becomes a lattice node, and its causedBy,
      by, touches and released-in become typed edges. A release note, a file's history, "why did this change", "what
      broke since 0.4.0" are each ONE walk of the lattice, not a log read. For agents that is the leverage: a walk
      returns the few nodes that matter, not thousands of rows (fewest tokens).
      Kept typed, not merged: provenance edges are their own type; they BRIDGE to the existing lattices by key (a
      file → its comp_id in the system lattice; a commit's outcome → crystal-lattice weights), so the separation
      system-lattice.js insists on holds and nothing is computed twice.
    numbering: >-
      VR0. Three whole numbers, each counting by 1, never decimals (0.0.99 + 0.0.01 has no answer): patch +1 = a minor
      improvement or fix; minor +1 = a major change (one phase of a phasemap); major +1 = a milestone, only when James
      says. The phasemap says which a change is — no one judges it by hand. Nexus's own 0.39.x history is kept as it is
      (nothing lost); the scheme applies from the first phase after this map. Every Idearium repo has its own version.
    github_replaced_by: >-
      repo → an Idearium repo · commit → a versionium commit (VR1) · diff / history / blame → VR2 · pull request → a
      proposal on the work surface (exists) · review / approve → the approval gate (exists) · release / tag → RN1 ·
      changelog → RN2 (written by cortex) · Actions / CI → the repo's tests + its desktop (DT1) · issues → gaps and faults
      (exist) · clone / push → GH1 (a git bridge, so nothing is trapped and GitHub can be left gradually).

  # James: "remember to use as little tokens for as much leverage and power as possible. invent around contraints if it
  # fits nexus better and i prefer novel if it's stable./" — so, where it fits Nexus better than copying GitHub:
  inventions:
    one_hook: >-
      VR1 hooks land()/_write() and nothing else: every change already passes that one door, so commits cannot be
      missed by a write path someone adds later. No per-site wiring.
    semantic_diff: >-
      Beside the line diff, a diff by unit (function / class / section) from idearium's structural chunker (exists):
      "changed parseCharter(), added rewind()". Agents and release notes read that, not hunks: a fraction of the tokens
      and closer to the meaning. Line diff stays for people and for proof.
    derived_version: >-
      The version is computed, never typed: patch +1 per landed commit batch, minor +1 when a phase closes (phasemap
      status → DONE), major only by James. The release node is the derivation's proof (the commits that made it).
    code_and_machine_together: >-
      Each commit records the repo desktop's VM checkpoint taken before the task (CK1, exists). Rewinding a commit can
      rewind the machine that ran it too — the code AND the running state, one step back. GitHub cannot do this.
    notes_cannot_lie: >-
      Release notes are a projection of commits + activity rows + test results, written by cortex. Nothing in them is
      authored by an agent, so nothing in them can claim what did not happen.

  phases:
    VR1_every_change_a_commit:
      systems: [idearium, versionium]
      status: "DONE (0.40.0) — lib/repo-versions.js (touched / attribute / settle / flush); the hook in idearium/repo/index.js writeFile + deleteFile; provenance on the snapshot record (record.provenance); repo-inject attributes; repo-activity current(). test-repo-versions 5/5."
      files: [lib/repo-inject.js, idearium/api/index.js, idearium/repo/snapshot.js, versionium/lib/files.js]
      does: >-
        Every change that reaches a repo's files is a versionium commit on its branch: an accepted proposal, an agent's
        auto write, a revert, a person's save. One commit per landing (a Claude Code run that writes six files is one
        commit, not six). Only the changed files are sent (files.plan already returns only what versionium lacks; files
        stores deltas). The commit carries provenance: by (the agent's hat or James), causedBy (the inject / the
        activity row / the task), the approval. A proposal is NOT a commit — it is a pending change, like a pull request;
        accepting it is the commit. A commit failing never loses the write: it is said, logged, and retried at the next.
      proof: "propose → accept → one commit with only that file's delta, by and causedBy set; a 6-file Claude Code run → one commit; a revert → a commit back; history lists all three in order"

    VR2_history_and_diff:
      systems: [idearium, versionium]
      status: MAPPED
      depends_on: [VR1_every_change_a_commit]
      files: [versionium/lib/files.js, versionium/lib/text-diff.js, idearium/ui/js/repo-tasks.js]
      does: >-
        A repo's history (commits, who, why) and any commit's diff against its parent — or any two commits — from
        files.tree + files.content + text-diff (all exist). A file's history (files/versions exists) and who last changed
        each line. The drawer gains a History view; commands `repo history`, `repo diff`, `repo blame` (rows in CM1's
        table, so copilot and every agent get them through CM2 with nothing more).
      proof: "the drawer's History lists VR1's three commits; opening one shows its diff (Clear Glass); `idearium repo diff <repo> <a> <b>` prints it"

    LT1_provenance_lattice:
      systems: [cortex, nexstore]
      status: MAPPED
      depends_on: [VR1_every_change_a_commit]
      files: [lib/nexstore/record.js, meta/crystal-lattice.js, intelligence/spatial/system-lattice.js, cortex/cortex-v2.js]
      does: >-
        Cortex subscribes to the node store's log (one tap, like VR1's one hook) and keeps a typed provenance lattice:
        nodes = commits, proposals, activity rows, tasks, faults, phases, releases, files; edges = caused_by, by, touches,
        fixes, released_in, supersedes. Edges to comp_ids bridge into the system lattice; a commit's tests passing or
        failing feeds crystal-lattice's weights (so Nexus learns which kinds of change hold). Query: walk(from, edge
        types, depth) → the few nodes, with a one-line projection each. `cortex lattice why <file|commit>` and a CM1
        row `provenance` (so every agent has it through CM2).
      proof: "after VR1's three commits: walk(file) → the commits that touched it → their proposals → who and why, in one call; the bridge reaches the file's component; a restart rebuilds the lattice from the log with nothing lost"

    RN1_release_is_a_node_and_a_tag:
      systems: [versionium, nexstore]
      status: MAPPED
      depends_on: [VR1_every_change_a_commit]
      does: >-
        Versionium gains tags (a named commit that never moves; createBranch's sibling). A release is one node
        (nexstore, type release): version (VR0), the repo, James's words, what was added, the proof, and causedBy — the
        tag's commit, the commits since the last release, the phase. The node points at versionium; versionium never
        copies the node. Restoring a release is restoring its tag's commit (restore exists).
      proof: "a release node for a repo names its tag; its commits are exactly those since the previous tag; restoring it gives that tree"

    RN2_cortex_is_the_bookkeeper:
      systems: [cortex]
      status: MAPPED
      depends_on: [RN1_release_is_a_node_and_a_tag, LT1_provenance_lattice]
      does: >-
        Agents never write release notes. When a phase lands (its version bumped), cortex walks the lattice from the
        new tag back to the last one — the commits, their activity rows, the phasemap entry, the tests — and writes the release node and
        the tag. The notes are a projection of the commits, so they cannot claim what did not happen. Backfill: Nexus's
        own CHANGELOG-*.md (167) and lib/version.js lines read into release nodes; the files stay.
      proof: "a phase landed → one release node written by cortex, its notes listing that phase's commits; the backfill reads every CHANGELOG into a node and loses none"

    RN3_releases_section:
      systems: [idearium, brainos]
      status: MAPPED
      depends_on: [RN2_cortex_is_the_bookkeeper, VR2_history_and_diff]
      does: >-
        Each repo's Releases view (the drawer, next to Tasks, Log, Control, History): every version, newest first, what
        was added, James's words, and a link into History for its diff. `idearium repo releases` (CM1 row → CM2 for
        agents). BrainOS: every project's releases in one feed.
      proof: "Clear Glass: the Releases view lists the backfilled Nexus versions and a new one; opening one shows its commits and diff"

    GH1_the_git_bridge:
      systems: [versionium, idearium]
      status: MAPPED
      depends_on: [VR2_history_and_diff]
      does: >-
        So GitHub can be left, not abandoned at once: import a git repo's history into versionium (every commit, author,
        message), and export a repo's branch as a git repository (a fast-import stream), so any git client — or GitHub,
        as a mirror during the move — still works. Nexus's own tree versioned in versionium. When James stops pushing to
        GitHub, nothing is lost and nothing depends on it.
      proof: "a git repo imported → the same commits in History; exported → `git log` shows them; round trip changes no hash of any file"

  ordering: "VR1 → LT1 → VR2 → RN1 → RN2 → RN3 → GH1. VR1 is the foundation: without a commit per change there is nothing to diff, release or replace GitHub with."
