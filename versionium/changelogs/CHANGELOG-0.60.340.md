# 0.60.340 — Emerge tested from Nexus, imported into Idearium, one .cos node; the miniworld recorded

James, 2026-11-01:
> "okay. i want to test emerge. also imported into idearium if it hasnt been already. with the proper file structrure and persistent data."
>
> "infrastructure first since it only needs to be done once. and make sure it uses the interactoin contract in the cos compartment. it
> needs full integration and isolation into a sandboxed cos compartment which should be the same compartment as the idearium repo"
>
> "no .json files." · "only nodes. use .cos. look for the miniworlds"
>
> "i want cos to use miniworlds for entire systems. one layer above the spec/repo. miniworld is the meta layer for compartments. its how i
> run counterfactuals, or mental simulations. each system in my head is a model. thats why each system is its own folder. i like it nic
> eand tidy."

## Tested

- **Emerge's own suites, run from Nexus:** `npm test` 266, `test:system` 13, `test:lang` 353, none failing.
- **Before the fix, 6 failed.** Emerge reads `../docs/learn` and `../bench`, which live at the Emerge repo's root. Nexus had only
  `emerge/emerge` in.

## Built

- **`emerge/` is the whole Emerge repo**, laid out as on GitHub (`BUILDING.md`, the CIE-EG spec, `bench/`, `docs/`, `emerge/`). The lock
  covers all 344 files.
- **One node instead of JSON: `emerge/emerge.cos`** (type `cos`). It holds what the compartment is, its repo and commit, every file's hash,
  and how COS runs it.
  - The 0.60.339 `compartment.json` and `EMERGE.lock.json` are archived in `_archive/2026-11-01-emerge-json/`.
  - COS's supervisor and `lib/cli/compartments.js` read a system's `<name>.cos` first.
- **Imported into Idearium:** repo `nexus/emerge`, in compartment `nexus-self-emerge`, nested under `nexus-self`. This is the same
  compartment COS runs it in.
  - 342 files, in the repo's own tree.
  - Its node definitions (`data/nodes`, `data/baseline`) and its own archives are kept.
  - Its run state (ledger, node index) stays with it.
- **Nexus's snapshot can keep folders a system's `data/` holds as definitions** (`lib/nexus-self/systems.js` `keep`). Node files, `.eg`,
  `.out` and `.say` now count as text.
- **COS reads Emerge's interaction contract through COS's own door.**
- **The miniworld recorded:** decision CP_D2 and phase CP10 in `docs/2026-11-01-the-compartment-phasemap.spec`.

## Proof

`tests/modules/test-emerge-in-nexus.test.js` **5/5**:
- the lock, read from the node;
- the declaration;
- COS runs Emerge walled and reads its contract, `hello.eg` runs, and the lock holds after;
- the command rows;
- EN-05: the Idearium import, as one repo with one compartment, its tree and definitions, kept across a reload.

## Said

- The empty `.gitkeep` markers and three binaries (Emerge's native builds) stay in the snapshot store; Idearium indexes text.
- A first, unsandboxed run of the import wrote into this container's own `data/idearium`. Its three tracked files are restored; nothing of
  it is committed.

## Versionium

This sandbox cannot reach his Versionium. On his machine, the boot sync records this release.
