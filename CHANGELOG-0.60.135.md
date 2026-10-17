# 0.60.135 — 2026-10-17

James: "use the axioms in the docs for each disicio nthat doesn't show my competence"

He said it after a day of questions handed to him that the axioms already answered. The rule is now in `docs/CLAUDE.md`:
- A technical decision is the coder's to make by `docs/AXIOMS-v3.1.md`. It is recorded with the axioms that decide it, as
  the coder's decision and never as his.
- What stays his (USER_AUTONOMY): what he meant by his words, the direction, and any call he has said is his.
- He can overturn any decision, by a dated addendum that quotes both (§0.3).

The test the coder uses: a decision is his when the answer depends on what he wants (intent, priority, taste, meaning). It
is the axioms' when they already say which way to go.

## Decided by the axioms (`docs/2026-10-17-decisions-by-the-axioms.spec`)

| # | Was | Decision | Axioms |
|---|---|---|---|
| D1 | DB0a / IM0d | `lib/` is the kernel, mounted read-only into every compartment. Anything in it that has its own state or lifecycle moves to its system | §5.9, §0.5, §16.7, §10.1, §5.14 |
| D2 | DB0b | Between systems, the routes and the CLI, in his words. Inside one system, in-process. One contract and one handshake either way | §5.10, §5.11, §5.14, §5.9 |
| D3 | DB0c | The ratchet | §0.4, §1.2, §3.1 |
| D4 | IM0a | State out of git. The generated projections go first, because they regenerate at boot. Any other data file goes only after a backup exists outside git, because untracking deletes the file on his next pull | §10.2, §10.3, §0.3, §2.2 |
| D5 | IM0b | The CHANGELOGs move to `docs/changelogs/`. The release reads both places | FILES_WITH_THEIR_SYSTEM, §0.3, §0.5 |
| D6 | IM0c | A system's tests go with it as it migrates. Tests of a contract between systems stay central | §5.9, SOVEREIGN_FOLDER, §4.1 |
| D7 | IM0e | A primitive has no state, no lifecycle and no data type of its own. The bus, the connector, siso, warp's core and the hook map are primitives. RAID, CFR, gap and baseline are capabilities. RFR2 is split module by module | §5.9, §10.1, §5.1, §8.3, §9.1 |
| D8 | PC0a | Pieces are built against declared interfaces. His answer was "[No preference]". This serves his "It's not linear. Like a torrent downloads." | §5.10, §5.14, §3.1 |
| D9 | PC0b | The first piece kinds are the ones Nexus already makes. His answer was "[No preference]" | §16.4, §0.5 |

## Still his

- PC0c, who writes the manifest. He said "thats on me".
- Every reading of his words marked "to confirm".
- What comes next.

## What it changes

The status in each owning map now reads "DECIDED … by the axioms (the coder)" and points at the record:
- the drawbridge map, DB0a-c;
- the migration map, IM0a-e;
- the pieces map, PC0a-b.

IM2 can now run, under D4, D5 and D6. IM4 can now run, under D1 and D7. PC1 still waits on PC0c, which is his.

No code changed.
