# Archived 2026-10-24: folders that are not systems

James, 2026-10-24: "Aren't systems. They should have been dealt with already" · "15 systems. only the ones with a .spec in the directory. all
the systems in idearium" · "Archive."

Kept, not deleted (§0.3). Moved with `git mv`, so each file's history follows it. None of them is one of Idearium's systems
(lib/nexus-self/systems.js), and nothing in Nexus requires them (lib/system-boundary.js, checked 2026-10-24).

| folder | what it is | why it could go | went with it |
|---|---|---|---|
| remote-desktop/ | the remote-desktop bridge (Electron + OS core, its own spec) | named only in loom's generated registry | — |
| security/ | e2e-channel.js, signaling-envelope.js | named only in loom's generated registry | — |
| emergence/ | Emergence (WARP 1.5.0 caller), its components and suites | nothing in Nexus requires it; its own suites were its only user | its suites, from tests/modules/test-emergence-and-warp-suites.test.js (WARP's stay) |

Not archived, his to decide (CHANGELOG-0.60.232.md):
- erosmancer/ — Clear Glass starts ErosmancerOS from erosmancer/erosmancer-os (clear-glass/src/eros/supervisor.js; his words in it:
  "erosmanceros to start with clearglass"), and it is an npm workspace. Archiving it stops that.
- sentinel/ — cli/sentinel.js reads its contract, test-sentinel-cli and test-adversarial-sim spawn that CLI, and
  test-cos-compartment-template CT-03 uses sentinel as its sovereign example.

To restore one: `git mv _archive/2026-10-24-not-systems/<folder> <folder>`.
