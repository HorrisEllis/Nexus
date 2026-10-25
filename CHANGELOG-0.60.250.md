# 0.60.250 — SV1, the census half: who writes which table of the shared store

James, 2026-10-24: "i want to get each system soveriegn and inside a cos compartment" · "continue"

Every "data" blocker in the sovereignty census is the same file: the one shared store, `cortex/memory/jaa-db.js`. Before any table can
be given an owner, the census has to say who uses which table, from the code. That is all this release does: it decides nothing.

## What it reads, and how (§0.1)
`lib/system-boundary.js` `tables()`:
- A **store user** is a file whose require resolves to the store.
- Its **table calls** are `<anything>.<op>('<table>'`, read in its code with comments blanked. A table named by the file's own string
  constant (`const TABLE = 'loom_changelog'`) is read too.
- Writes are insert, upsert, update and delete. The rest are reads.
- **Said:** 21 of 106 store users name no table this can read (a table chosen at run time). They are counted, not hidden.

## What it found (Nexus, 2026-10-24)
127 tables:
- **43** have one writer system. That is the owner the evidence names.
- **3** are written by one system, and by core too.
- **31** are written only by core. They go home with core's files (SV2).
- **3** are contested, written by several systems: `event_log`, `failures`, `gaps`.
- **47** are only read.

## Where to see it
`GET /api/system/tables[?system=]`, the command `system tables [<system>]`, and the tables a system touches in Settings › its repo ›
System › Sovereignty.

## His call (SV1_D1 in docs/2026-10-24-sovereign-systems-phasemap.spec)
On brave-cori, his answer to this same proposal (a table → owner map) was: "Look at emerge. Deeply Custom". That line's coder read it as:
declare each system's tables in his Emergence language, and compile the owner map from those declarations. To confirm. So how a system
declares what it owns is his to choose:
- (a) Emergence: `<system>.eg`, compiled to its store module. No `.eg` program exists yet.
- (b) The table lists in `lib/system-store.js` `openStore`, which guardian and loom already use.

Either way, the three contested tables are his to assign.

## Proof
SV-10 (on a fixture: a constant is read, a comment is not, a two-writer table is contested with no owner guessed, and the route and
command work). SV 10/10, SB 10/10, route contracts 4/4, registration shape 8/8.
