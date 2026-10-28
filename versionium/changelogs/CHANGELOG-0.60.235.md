# 0.60.235 — 2026-10-24 — every folder has a home: uses by path counted, his calls recorded

James, 2026-10-24: "need the systems soveriegn" · "maybe: erosmancer, jaa, remote-desktop, seams, security, sentinel, service, tablet
and ui go to lib in a retired volder ,or idearium or cortex as archived systems?" · "not all of them retired.,remote desktop, tablet was
meant to tbe the front end for cos i fele like"

## Checked before retiring anything (§0.1)
The refactor tool's first proposal counted only `require`s, which made 9 folders look unused. Three of them are in use by **path**:
- guardian serves `ui/home/` and `ui/guardian/`, and diagnostic serves `ui/forge-shell/`;
- clear-glass starts `erosmancer/erosmancer-os`;
- `cli/sentinel.js` reads `sentinel/interaction-contract.json`.

Retiring them would have broken all three.

## The tool learned (`lib/architecture-migrate.js` 1.1.0)
- **Path loads are uses** (`pathEdges`): `path.join`/`resolve` calls whose arguments are all `__dirname`, a `*ROOT*` constant or
  literals. Anything dynamic is skipped, never guessed. Paths to root files (`package.json`) are not folders, and `scripts/` and `data/`
  are not users.
- **R5:** a folder used only by folders that are moving goes with them. `sentinel` goes with `cli`.
- **His decisions win** over every rule. They live in `lib/architecture-migrate.decisions.json`, each with his words or the axiom
  behind it. "Retire" means `_archive/2026-10-24-retired-systems/`, kept and outside every census, never deleted.
- **Folders that need each other move together.** `nexus` and `cli` load each other, so the order stays a DAG.

## Where the 22 folders go (`docs/2026-10-24-fifteen-systems-migration-phasemap.spec`, none unplaced)
| home | folders |
|---|---|
| cos (**his**: the front end for COS) | `remote-desktop`, `tablet`, and `security` (the remote session's encrypted channel and kill switch; the coder's reading, to confirm) |
| clear-glass | `erosmancer` |
| idearium | `architecture-spec` |
| orchestrator | `auth` |
| guardian | `mesh` |
| core (`lib/`) | `cockpit`, `contracts`, `hooks`, `meta`, `sentinel`, `siso`, `ui`, `emerge`, `emergence`, `warp`, `nexus`, `cli` |
| retired (`_archive/`, by his axioms: nothing uses them; he can overturn) | `jaa`, `seams`, `service` |

**Nothing has moved yet.** RF2 applies it one phase at a time, each move followed by the census and the tests.

## Proof
`tests/modules/test-architecture-migrate.test.js` AM **5/5**:
- the rules;
- on Nexus, none of the 15 moves;
- the proposal is DAG-clean;
- path loads count, while comments and dynamic arguments do not;
- R5, his decisions winning, and retire meaning archived.
