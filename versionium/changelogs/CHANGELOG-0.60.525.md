# 0.60.525: where each system lives and what holds it there (CA7 slice a); the move pinned

James, 2026-11-13: "can you finish cos ui? should be a first time setup wizard, storage location of each system/nexus, etc" · asked which
reading of CA7: "second one, can be moved anbd changed in each systems individual settings." · "okay, just make it so nexus can be
anywhere." · "put a pin in the can be moved anywhere. need the pipeline building all of my requests."

## Built
- `cos/sovereign/location.eg` (Emerge): for each system, three things are read, never guessed:
  - what reaches out of its folder by path (Pillar's map of it);
  - what reaches into it from the others and from lib/;
  - whether its data is still in the root data/ (the sovereignty card).

  A system can move only when all three are zero; otherwise `why` names what holds it, by count and by name.
- `GET /api/cos/locations`; `GET /api/cos/systems/:name/location`, which adds its folder on this machine and its size on disk; and
  `location [system]` in COS's console.

## Measured (2026-11-13)
None of the 14 systems can move today. Emerge is the closest, with one path out. Cortex is reached into 139 times (75 of them from lib/).

## Pinned (his)
Moving Nexus or a system to another folder, and the first-time setup (CA8). Both are mapped in
docs/2026-11-02-cos-the-application-phasemap.spec.

## Proof
location.test.eg 3/3; live through COS's cockpit server and console; test-cos-console 11/11; test-cos-pipeline 21/21; the cos/pipeline
and cos/sovereign eg suites green.
