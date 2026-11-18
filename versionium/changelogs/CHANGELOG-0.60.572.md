# 0.60.572: Intelligence scans itself (IP13)

James, 2026-11-18: "using the intelligence system to scan itself?" · "it needs to be able to do" · "also emerge?" · "can you use nexus?"

Why: the same day Intelligence crash-looped (JavaScript heap out of memory at ~382 MB of a 384 MB cap, every ~20 s at start), and nothing in
Nexus could say what held the memory. Mapped first: docs/2026-11-05-intelligence-data-pipeline-phasemap.spec IP13_intelligence_scans_itself.

- `intelligence/self/door.js`: the numbers only Node can read (resident memory, heap used and total, each V8 heap space, the cap from
  --max-old-space-size) and what each registered holder says it holds (`register(name, fn)`); each scan kept as a line in its data/self.
- `intelligence/self/scan.eg` (Emerge): the judgment. Near the cap (80%) or over it is a gap with its numbers, never a restart; the heaviest
  spaces and holders; what grew since the last scan.
- `GET /api/intelligence/self`, `POST /api/intelligence/self/snapshot` (a V8 heap snapshot written to its data); in its registry; command rows
  `intelligence self` and `intelligence self snapshot`.

Proof: eg test intelligence/self/scan.eg 2/2; tests/modules/test-intelligence-self.test.js 5/5.
Not yet: Intelligence's own big structures registered as holders (the loom map, the patterns, the liminal items, the failure index); until then the
scan names heap spaces, not owners. Found on the way: nexus_grep missed http.createServer( in intelligence/server.js (a gap in that tool).
