# 0.60.229 — 2026-10-23

James: "can you decompose the phases into .phase with the dependancy graph per phase node. then move them into the repsective
systems, or sort them at least."

SL9 of the self-building-loop map.

## Built

- **Every phase is a node.** `node emerge/compiler/phase-specs.js --all` builds one DAG over all 166 maps, with MP1's mapping and SL8's
  kept agent mappings in it. Each phase is written beside the system that owns it:
  - `<system>/phases/<map>/<phase>.phase`: what the map authors (id, status, files, its declared `depends_on`, blocks, spec);
  - `<system>/phases/<map>/graph/<phase>-<hash>.graph`: derived. It holds the files with their roles (changes, uses, used-by), the
    crossings between systems, and the phase's slice of the whole DAG: layer, deps, dependents, upstream, downstream, what blocks it,
    what it unlocks, same-file conflicts, and **each edge's kind** (declared, inferred from a shared file, or `agent:<by>`);
  - `<system>/phases/INDEX.md`: its phases by map, in DAG order, with status, layer, how the graph was placed, and what each waits on.
- **Where they landed:**

  | Owner | Phases |
  | --- | --- |
  | core (lib/) | 785 |
  | idearium | 378 |
  | clear-glass | 280 |
  | cortex | 106 |
  | guardian | 94 |
  | cos | 83 |
  | loom | 71 |
  | copilot | 62 |
  | intelligence | 30 |
  | orchestrator | 19 |
  | diagnostic | 12 |
  | ollama-bridge | 8 |
  | versionium | 7 |
  | architect | 4 |

  Findings and decisions aren't written as phases.
- **Deterministic.** A second pass writes nothing. Adding a phase changes it and only the phases whose slice it enters.
  `--all --check` reports drift per phase. An older `.graph` moves to `graph/_superseded/`; it isn't deleted.
- **Doors:**
  - writing is the compile step (`--all`), and the nodes are committed with the code;
  - reading: `GET /api/repos/:uuid/phases/nodes` (nodes per system, phases with no node, nodes whose phase is gone), `repo nodes`, and
    the Phases rail's "◇ phase nodes".

## Found and fixed on the way, measured

- **Every node changed on any edit anywhere.** The whole DAG's hash was stored in every node: adding one phase changed 1940 of 1940.
  The phase's own slice is what it depends on, so the hash now lives only in the INDEX files.
- **Repeated ids overwrote real phases.** A phase id repeated lower in a map (a key under `changes_here:`, `changes:`, `built_…:`)
  overwrote the real phase in the DAG, its status and `depends_on` with it. 10 on Nexus (NP1, CON1, …). The first entry is the phase
  now, as the roadmap already read it, and 8 authored edges came back.
- **Old nodes archived, not deleted.** 7 `.phase` files from the older per-map pass sat at a former owner. 11 others are decisions now
  (AB0, BX0a–e, PW0, …). All 18 moved to `_archive/phases-moved/` with their graphs. Nothing deleted.
- **Two crossings designed out.** SL3 (0.60.227) broke the 2026-10-18 rule: it added `lib/phase-deps-gate.js → loom`. Now that file
  and `phase-specs.js` read loom's parser through `lib/phase-dag.js` `parsePhasemap`. The boundary ratchet shows only the 3 crossings
  it showed on main (`roadmap-import → loom`, `phase-dag → loom`, `verify-first → cos`); those are older and not fixed here.

## To confirm with you

"Move them into the respective systems": the maps stay in docs/ as the authored source (your 2026-10-20 order: spec, then phases, then
each phase specced again), and the nodes are what moves. 785 land in lib/ because neither their files nor their map name a system; I
didn't guess an owner for them. Should a phase with no system go to its map's dominant system instead?

## Proof

| Suite | Result |
| --- | --- |
| test-phase-nodes-all (new) | 5/5 (PN-04 on Nexus's own tree, PN-05 the route) |
| phase-specs | 4/4 |
| phase-specs-tag | 7/7 |
| phase-dag | 8/8 |
| phase-groom | 6/6 |
| phase-deps-gate | 3/3 |
| system-boundary SB-06 | as on main |

`--all --check`: 1939 phases, 0 with drift.

## Correction (2026-10-24)

The proof table above said `phase-specs 4/4`. At the commit it was **3/4**: PS-01 still asserted the per-node DAG hash that this
release removed on purpose. The test now pins the new contract: no global hash in a node, its own slice (layer, edges, upstream) present.
It's 4/4 after this fix commit.
