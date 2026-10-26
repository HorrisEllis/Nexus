# 0.60.227 — 2026-10-24

James: "spec per component/capability/etc its in the specs. deocmpose all of the phases into .phase nodes including dag per phase."

## Done: every phase is a node, with its DAG

`node emerge/compiler/phase-specs.js --all` wrote every phase of the 166 maps in docs/ in about a minute: **2,046 `.phase` nodes and their
`.graph`**, each beside the system that owns it. Before this, 175 phases had nodes.

- The `.phase` holds what is authored: id, map, layer, status, files, depends_on, blocks, spec, and the graph hash.
- The `.graph` holds what is derived:
  - its files, with their roles (changes, uses, used by);
  - the edges and system crossings;
  - **its slice of the whole DAG**: deps, upstream, downstream, what it blocks and unblocks, conflicts and dangling names.
- `--all --dry` derives without writing, and `phase-specs.js <map> --check` reports drift for one map, as before.

## Spec per component: what it measured

His rule (docs/CLAUDE.md, 2026-10-20) is a full spec per capability, then phases, then each phase specced again.
`docs/2026-10-24-phase-nodes-spec-coverage.md` has the full table:

- 133 of 2,046 phases name the spec they build from. 1,107 open phases have none:

  | system | open phases with no spec |
  |---|---:|
  | core | 819 |
  | idearium | 122 |
  | clear-glass | 53 |
  | cos | 30 |
  | cortex | 29 |
  | others | 54 |

- 15 maps are fully specced, and 112 maps have open phases with no spec.

**The coder's reading (to confirm):** the specs per component come next, system by system, from that table. He asked for the decomposition
now, not 1,107 specs in one pass.

## Found writing them, and fixed

- **The problem:** a later key with an id the map already defined is a **note** about that phase, not a second phase. Examples are notes
  under `changes:`, `honest_remaining:` and `decisions_applied_by_default…:`. The DAG read these last-wins, so the note replaced the real
  phase: 11 phases in 3 maps (clear-glass-network-posture, cos-console, cortex-to-intelligence). NP0_binaries, one of his decisions, was
  being read as a pending phase with no files.
- **The fix:** `lib/phase-dag.js` and `phase-specs.js` derive() now take the **first** definition, as `idearium/repo/roadmap.js` already did
  (with its `duplicate_phase_id` warning).
- **Why not in the parser:** a first try put the fix in loom's parser, and test-moce-roadmap's duplicate-warning case failed. So loom still
  returns both copies, and its consumers decide.
- **The queue (SL0)** now holds 172 that can be built now (was 171).

## Kept

Two `.phase` files sit in an older owner's folder (SL1, BX10), because their phase's files moved system. They are kept as superseded
copies (§0.3).

## Proof

- **`tests/modules/test-phase-specs.test.js` 6/6:**
  - PS-05: a note with a phase's id never replaces the phase. His NP4_webrtc resolves to line 83, not the note at 336.
  - PS-06: every phase of every map has its `.phase`, and its `.graph` (by hash) carries its DAG slice.
- **Also green:** test-phase-dag 8/8, test-build-queue 6/6, test-loom-phasemap 8/8, test-loom-phasemap-status 14/14.
- **test-moce-roadmap** is back to its 3 failures that were there before this change, the same ones.
