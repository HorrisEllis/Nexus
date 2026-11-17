# 0.60.551: the node index stops growing with every sync (RC2 expanded)

James, 2026-11-17: "yes fix the boot stall too" (after "it needs to build in order, bottom up. i am drowning. help me get this working").

## Found (his log, after 0.60.550)
- 0.60.550 worked as far as it went. Idearium booted in 5 s, and its registry scan yielded for 3 minutes (heartbeats arrived from
  08:26:38 to 08:29:51).
- Then it went silent for 97 s (08:29:51 → 08:31:29) and reported "5395 indexed, 8927 unchanged, 5383 removed".
- The cause: the live index never shrank. A removed node stayed in it as a soft-deleted row, so every nexus-self sync (~5,400 chunk nodes
  replaced) left ~5,400 dead rows behind.
- Every scan and every flush (the whole table, re-read and rewritten) grew with them.
- Reproduced in a sandbox: 3,000 live nodes replaced 8 times. Rows 3,000 → 24,000, scan 0.5 → 7.2 s, longest block 8 → 73 ms, and still
  climbing.

## Fixed
- `lib/node-index.js` `removeNode`: a removed row moves to an append-only archive beside the store
  (`<store>/archive/<table>.deleted.jsonl`) and leaves the live table.
- `compactDeleted`: on the next scan, moves the dead rows older versions left behind into the same archive, once. The registry line says
  how many ("N dead row(s) moved to the archive").
- Nothing is lost (§0.3): the archive keeps every row, and the ledger keeps the history.
- A store with no folder of its own (the shared Cortex store) keeps the old soft-delete.

## Proof
- Same sandbox, after the fix: 3,000 rows every round, scan ~1.3 s, longest block 6 ms, flat across all 8 rounds.
- NR-14: a removal goes to the archive, 5 old dead rows are moved, 15 rows are in the archive with none lost, and the history still says
  "deleted".
- `test-node-registry-system` 14/14, `test-pipeline-root-causes` 19/19, `test-history-nodes` 5/5, `test-table-materializer` 6/6,
  `test-injection-node-type` 4/4, `test-manifest-phase1` 18/18, `test-registry-drives-build` 6/6.

## Not yet (said)
- On his machine, the first boot after this update moves all the old dead rows at once, so that one scan can still be slow. The boots
  after it should not be.
- The per-type ledger table still grows with every change and is rewritten whole on each flush (about 1.3 MB per 3,000-node round in the
  sandbox). That is the next growth source, kept as history, not lost.
- Versionium: recorded on his machine by the boot sync.
