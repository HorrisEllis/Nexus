# 0.60.230 — 2026-10-24

James, of auth, erosmancer, jaa, mesh, remote-desktop, security, sentinel and siso: "Aren't systems. They should have been dealt with already"

## His decision, and what it cost

His axiom §5.9 already said it: "a primitive with none of these [state, lifecycle, persistence, execution] is not a system"
(docs/2026-10-17-decisions-by-the-axioms.spec). The boundary census never applied it. So 0.60.229 counted these eight as the systems closest
to sovereign, and drafted a registry for each.

## Fixed

- **`lib/system-boundary.js` `FOLDED`** gives each folder a home, read from who uses it:

  | folder | home | why |
  |---|---|---|
  | auth | orchestrator | its only user is `orchestrator/orchestrator.js` |
  | mesh | guardian | its only user is `guardian/routes/mesh.js` |
  | jaa | guardian | its schema is "Guardian v8 — Schema" |
  | siso | the kernel | a primitive that cos, emerge and idearium use; the census's PRIMITIVES already said so |
  | erosmancer, remote-desktop, security, sentinel | **parked** | nothing requires them |

  - A folded folder's files count as its home's, and it is never listed as a system.
  - Any use of a parked folder is reported as `parkedUses`, never hidden.
- **`PARTS`** fixes the same mistake one level down, decided by the axioms (DB16's open question, the coder's reading, to confirm):
  - The parts of other systems (contracts, hooks, service, components, architecture-spec, seams) and the faces (ui, tablet) had been
    listed as "sovereign".
  - They stay in the scan, because crossings into `hooks/` are real edges, but they leave the sovereignty list.
  - `lib/registry-draft.js` reads the same lists, so there is one truth.
- **The eight drafts are withdrawn.** They were generated output and the generator can remake them, so nothing is lost. Drafts now exist
  for the 8 real systems with no registry: cli, cockpit, cos, emergence, meta, nexus, orchestrator, warp.
- **A bug from 0.60.229, also fixed:** its route case fell through, so `GET /api/system/registry` answered with the drafts instead of the
  dependency graph. The case is moved, and a test now guards it.

## Measured now

There are 20 systems, and none is sovereign. Those with the fewest ways out:
- cockpit: 1, a data blocker;
- warp: 1;
- emerge: 4;
- cos: 4 (1 data, 3 primitive into warp/core).

## Not done: to confirm with him

The table only counts the eight correctly. Dealing with them means:
- moving each into its home (DB17): `auth/` into `orchestrator/`, `mesh/` and `jaa/` into `guardian/`, and `siso/` beside the kernel;
- archiving the parked four, since §0.3 says archive, not delete.

erosmancer (231 files, with its own OS spec) may be his own project rather than parked code.

## Proof

- `tests/modules/test-registry-draft.test.js` 5/5:
  - RD-05: the eight are folded or parked and never listed; orchestrator → auth is internal; a use of siso is a use of the kernel;
    nothing uses a parked folder; the sovereignty list holds only systems; no draft exists for any of them;
  - RD-04 now also guards that `/api/system/registry` is still the graph.
- Also green: test-drawbridge-registry 8/8, test-system-registry 9/9, mco15-component-boundary-check 5/5, test-phase-graph 5/5,
  test-phase-specs 7/7.
- test-system-boundary SB-06/SB-08 fail the same way as before this change (three crossings since 0.60.199, reported in 0.60.229).
