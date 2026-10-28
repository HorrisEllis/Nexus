# 0.60.255 — brave-cori merged into main's line, main's tree kept

James, 2026-10-26: "Claude/brave cori eczug1. merge that repo please. make sure we dont regenerate the files we moved, and archived."

On 2026-10-24 he had decided "Port it phase-by-phase" (BC_D3). By 0.60.254 three of those ports were done: cos/services, the kernel
ports, and the maps. His new call supersedes BC_D3. Both are kept in `docs/2026-10-24-brave-cori-reconciliation.spec`, which has the
2026-10-26 addendum.

The coder's reading, to confirm:
- "merge" means a real git merge. Brave-cori's 24 commits are now in main's history, and #161 has nothing left unmerged.
- "dont regenerate the files we moved, and archived" means main's tree wins for every path main moved or archived, and no generated
  node is rewritten.

## How it was merged
The merge was `git merge` of `origin/claude/brave-cori-eczug1` (base `d7ef2d0b`). Before resolution it showed 4,000+ paths in conflict.
- **2,946 paths resolved to main's side, or left out where main has no such path.** These are in moved folders, archived folders or
  generated ones:
  - `*/phases/**`
  - the atlases
  - `data/`
  - `_archive/`
  - `emerge/` → `lib/emerge`
  - `idearium/spec-compiler`
  - `clear-glass/erosmancer-os` → `clear-glass/erosmancer`
  - `emergence`, `remote-desktop`, `security`, `sentinel`, `cli`, `nexus`

  No `.phase` or `.graph` file was regenerated, and neither was the README.
- **About 60 shared files were resolved by hand.** Where a hunk only renamed a path to brave-cori's layout, main's side was kept. Where a
  hunk was real work, it came in.

## Brought in
- **SL4, the self-building loop.**
  - `idearium/lib/autobuild.js` builds what can be built now, one phase at a time. It lands each proven change by his rule, closes it,
    and moves to the next.
  - It stops at the budget (5 phases or 4 hours), or after three misses in a row. His decisions are never built.
  - Routes: `GET/POST /api/repos/:uuid/loop(/start|/stop|/step)`, stepped by the watchdog's minute.
  - Row: `repo loop`.
  - The Phases rail shows the loop with a start button (which asks first) and a stop button.
- **SL5, his trust rule B** (from his "yes do it.", 2026-10-24, read as B).
  - `lib/trust-rule.js` holds the rule, served at `GET/POST /api/trust-rule`; setting it needs his words.
  - Row: `trust`.
  - A proven run's proposals land when the rule allows it, before the close check.
- **A proof that ran nothing does not close (0.60.226).** It came from his looking-glass run: SP5 was "READY" when no test had run.
  - `idearium/repo/proof-run.js` says what a proof ran.
  - A files-only proof reads **READY ON FILES ONLY**, and `lib/phase-close.js` will not close it.
  - The stall default goes from 10 to 20 minutes.
  - His error report is in `docs/2026-10-22-looking-glass-v0_4-error-report.md`.
- **DB16, the registry drafts.**
  - `lib/registry-draft.js`, `system drafts`, `GET /api/system/registry-drafts` and `/api/system/registry/:system/draft`.
  - The drafts for orchestrator, components and cos were regenerated from main's tree. Each is a `.draft.json`, which nothing reads, so no
    draft is in force until he accepts it.
- **Cortex provides RAID to its port at boot.** Main's `lib/raid-port.js` documents that Cortex calls `provide()`, but Cortex never did.
- **Guardian's `/forge/health`** answers that `cockpit/forge` is not in the tree, instead of throwing.
- **Records:**
  - the G0 status;
  - his CB3 job-ledger words in `docs/contract-queue.spec`;
  - the SL addendum in `docs/self-building-loop.spec`;
  - the cos-spine and self-building-loop addenda;
  - the PROOF-OF-COMPETENCY entries for 0.60.237–0.60.239, under a note that they come from brave-cori.
- **Brave-cori's 18 CHANGELOGs and version lines** are in `_archive/2026-10-26-brave-cori-records/`. Its release numbers 0.60.225–0.60.242
  collide with main's own releases of the same numbers.

## Not ported, and why
- **The spec-compiler port (EW2/EW3).** On main the compiler is the kernel's (`lib/emerge/compiler`), so requiring it is no crossing. The
  port and its test are kept in `_archive/2026-10-26-brave-cori-records/not-ported/`.
- **PS3/PS4, one file per phase.** It would rewrite every `.phase` and drop every `.graph`, which is the regeneration he said not to do.
  This is open, and it is his call.
- **EW1, emerge as a 16th system, and the "language" crossing kind.** Main's RF2 put the language in `lib/`, so main's census stands.
- **Sentinel's archive.** His 2026-10-24 "Yeah archive it." stands. Main still keeps `lib/sentinel`, because the merge kept main's moves.
  It is mapped as BCR5, open, and `docs/nexus-sentinel.spec` says so.
- **The README's phase-node folding.** It changes the generated README, so it is left for the next README generation.

## Proof
These suites ran on the merged tree:

| Suite | Result | Note |
|---|---|---|
| test-registry-draft | 6/6 | RD-01 adjusted: cos has 0 ways out and is sovereign only both ways. RD-05 and RD-06 rewritten for main's tree; brave-cori's versions kept in not-ported/. |
| test-self-building-loop | 5/5 | |
| test-phase-close | 7/7 | |
| test-proof-run | 7/7 | |
| test-phase-proof | 7/7 | |
| test-raid-port | 4/4 | |
| test-loom-into-cos | 8/8 | |
| test-sovereign-systems | 10/10 | |
| test-cos-compartment-template | 8/8 | |
| test-substrate-spec | 1/3 | Fails the same way on 0.60.254 (SS-01, SS-02). Not caused by this merge. |
