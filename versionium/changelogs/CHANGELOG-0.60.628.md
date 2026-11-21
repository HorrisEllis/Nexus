# 0.60.628 — the snapshot before a build is a gate's setting

James, 2026-11-20: "Make snapshots optional for gates, and maybe disable them for developer or debug gates."

## What changed
Run 13 was refused before it started: Versionium runs out of heap after loading its store (10 crashes; COS holds it waiting for memory), and every build required its snapshot.
- `required` (the default, unchanged): no snapshot, no build.
- `optional`: Versionium unreachable, the build goes on and says so on the run (`snapshot-deferred`); a snapshot Versionium refuses for a reason still stops it.
- `off`: developer or debug gates.
Set per build (`snapshot` in the request) or as `routing.build_snapshot`, which only he can set (not agent-writable). What a build makes lands as proposals he applies or rejects.
Also: Versionium set to priority `high` in his caps (the dynamic heap). Next: Versionium loads its store in chunks.

test-emerge-rung 12/12.

## Files
- idearium/api/index.js, lib/pipeline-routing.js, idearium/lib/config-core.cjs
