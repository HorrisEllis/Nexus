# 0.60.177 — 2026-10-21 — the data layout specced, and a clear-up tool that moves state safely

James, 2026-10-21: "need all data in the data folder migrated to each relative system" · "we need to do some serious data structure
work. migrate relevant data to relavant systems. make one repo folder in idearium, no data folder in the root." · "make a file clearup
tool, for safely moving and mapping tools." · "remove snapshots folder from cortex" · "cortex v2 into server.js" · "each memory system
is in cortex."

The layout and every call are his. The coder's part: the census, the ownership readings (marked), and the tool.

## Specced (his rule: spec, then phases, then each phase specced again)
- `docs/data-layout.spec`: 8 modules at specDepth 1.0, compiled by emerge. Its `ownership:` table is where each root `data/` path
  goes, and why. The tool reads that table at run time, so the spec is the rule set, not a copy of it.
- `docs/2026-10-21-data-layout-phasemap.spec`, DL0–DL7, DAG-clean:
  - DL0 census, DL1 clear-up tool, DL2 one resolver, DL3 rewire the writers;
  - DL4 one repo folder (`idearium/data/repos/<Repo Name>/` with `.cos` `.node` `src/` `data/<memory>/`
    `data/event_ledgers/<date_time>.ledger` `data/nodes/<type>/`);
  - DL5 memory systems in cortex, DL6 `cortex/server.js`, DL7 the `cortex/snapshot` shim out.

  Each phase is specced again as `.phase` and `.graph` beside its owner system.

## Built: DL0 and DL1, `lib/data-clearup.js`
- `census`: every file placed by the table (the first rule that matches wins; a `<system>` match only counts when that folder exists,
  otherwise it's asked), with the code files that still name its old path.
- `plan`: a path that code still names waits until it's rewired. An asked file never moves. Test residue is archived.
- `apply`: the manifest is written first. Then each file is copied, its sha256 compared, and only then the source removed. If the
  destination already holds the same bytes, the source is archived as a duplicate. If it holds a different file, that's a conflict
  and both are left untouched.
- `rollback` and `verify`. The command line is dry by default.

## Measured
- **His live data, 755 files:** 751 placed, 4 asked (`run-state`). In a scratch tree it was applied (652 moved, 20 archived,
  0 failed), verified, then rolled back, with every file back byte for byte.
- **The repo's `data/`, 122 files, all tracked in git** (which "never commit data/**" forbids): 33 can move now, 87 wait on about 40
  code files to be rewired (listed in `docs/atlases/data-census.md`), and 2 are his call (`nexus-self`).
- **Settled by evidence:** `ledger/liminal` → intelligence, `forge` → cortex, `cg` → Clear Glass, `eros` → ErosmancerOS, and
  `bridge`, `test`, `testfaculty` and `bl7-*` are test residue to archive.

## Not done yet
Nothing has been moved in his tree or in the repo; DL2 (the resolver) and DL3 (rewiring) come first. DL4–DL7 are specced and open.
The readings to confirm are listed in the map: what "cortex v2 into server.js" means, the person model staying copilot's, and
reflection → cortex.

## Proof
`test-data-clearup` 5/5. `test-substrate-spec` 3/3, now also compiling `data-layout.spec` and `pipeline.spec`.
