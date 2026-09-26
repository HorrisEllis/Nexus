# NEXUS — Living History (the bookshelf)

The git history is a living record of NEXUS's evolution, from the earliest
iterations to current work. This document catalogs the early volumes that were
reconstructed into git (they had no git history of their own).

## Early iterations (reconstructed 2026-08-08)

The first volumes, snapshotted as zips before git tracking began, committed in
evolution order (dated June 2026 to read chronologically):

| Volume | Files | Note |
|--------|-------|------|
| nexus-v1   | 88  | the earliest snapshot |
| nexus-v2   | 210 | major expansion |
| nexus-v2-1 | 215 | |
| nexus-v2-2 | 215 | identical to v2-1 (re-save, no commit) |
| nexus-v2-3 | 215 | |
| nexus-v2-4 | 219 | |
| nexus-v2-5 | 228 | bridge added |
| nexus-v2-7 | 228 | |
| nexus-v2-10| 228 | |
| nexus-v2-11| 228 | |
| nexus-v2-12| 226 | |
| nexus-v2-13| 226 | |
| nexus-v2-15| 226 | |
| nexus-v2-16| 233 | |
| nexus-v2-17| 233 | identical to v2-16 (re-save, no commit) |
| nexus-v2-18| 234 | |
| nexus-v2-19| 233 | last early volume before the tracked lineage |

### Missing volumes (gaps in the shelf)
v2-6, v2-8, v2-9, v2-14 were not among the uploads. If found, they slot in by
number. nexus-complete (4.1MB) is a later consolidated build, not an early volume.

### How it's grafted
These 15 commits (17 uploads, 2 identical) were grafted BEFORE the first commit of
the tracked development history, so `git log` reads the full evolution:
v1 → v2-19 → [153 commits of development] → current. The graft was baked permanently
(git filter-branch), and the pre-graft history was backed up to a bundle first. No
working files were altered — only history. More volumes can be added the same way.
