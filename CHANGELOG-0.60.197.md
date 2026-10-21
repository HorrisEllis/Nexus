# 0.60.197 — the snapshot names the component registry

James, 2026-10-21: "shouldn't that be the component registry. architecture tab"

## Context
SP5 had been refused because the snapshot before a build needs the atlas. He asked what it needs an atlas for (0.60.196), then whether
it should be the component registry: the Architect tab, which is what the planner reads.

## What was found
The registry is built from the same index as the atlas (lib/code-intel's cards, through idearium/repo/architecture.js), but the snapshot
record never named it. A snapshot said which atlas, chunks and graph a build stood on, and not which registry.

## What changed
- `idearium/repo/snapshot.js`: `registryVersion` joins the record's must-record keys. It holds the sha256 of the registry's components and
  wires, plus counts of components, wires, orphans and breaches. An unindexed repo gets `available: false` with the reason.
- The Versionium list shows "registry N · W wires · <hash>" on each snapshot.
- The NOT_INDEXED message names what is missing (atlas, chunk index, component registry), and says a build indexes the repo itself.
- The atlas is still recorded (nothing dropped).

## To confirm with him
Read as: record the registry as well. Whether the registry should replace the atlas as what a build requires is his call; both come
from the same indexing today, so nothing a build does changes either way.

## Proof
test-mco3-repo-snapshot 39/39, test-mcob-snapshot-restore 30/30, test-pipeline-root-causes 17/17 (RC-16 asserts the registry on a
freshly indexed repo), test-approval-chain 6/6, test-contract-phase-build 14/14.
