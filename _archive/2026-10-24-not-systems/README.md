# Archived 2026-10-24: folders that are not systems

James, 2026-10-24: "Aren't systems. They should have been dealt with already" · "15 systems. only the ones with a .spec in the directory. all
the systems in idearium" · "Archive."

Kept, not deleted (§0.3). Moved with `git mv`, so each file's history follows it. None of them is one of Idearium's systems
(lib/nexus-self/systems.js), and nothing in Nexus requires them (lib/system-boundary.js, checked 2026-10-24).

| folder | what it is | why it could go | went with it |
|---|---|---|---|
| remote-desktop/ | the remote-desktop bridge (Electron + OS core, its own spec) | named only in loom's generated registry | — |
| security/ | e2e-channel.js, signaling-envelope.js | named only in loom's generated registry | — |
| sentinel/ (0.60.234) | his 2026-07-24 plan for one diagnostic-and-repair authority (docs/nexus-sentinel.spec); only S1 was built: its contract (routes declared, never served) and cli/sentinel.js; the job became the diagnostic system's | James: "Yeah archive it." | cli/sentinel.js → sentinel/cli/, test-sentinel-cli.js and three test-adversarial-sim cases → sentinel/tests/ |
| emergence/ | Emergence (WARP 1.5.0 caller), its components and suites | nothing in Nexus requires it; its own suites were its only user | its suites, from tests/modules/test-emergence-and-warp-suites.test.js (WARP's stay) |

Not archived, his to decide (CHANGELOG-0.60.232.md):
- erosmancer/ — moved into clear-glass/erosmancer-os in 0.60.233 ("move erosmancer to either clearglass or guardian"). Clear Glass starts ErosmancerOS from erosmancer/erosmancer-os (clear-glass/src/eros/supervisor.js; his words in it:
  "erosmanceros to start with clearglass"), and it is an npm workspace. Archiving it stops that.
- sentinel/ — archived the same day (0.60.234), with its CLI and tests, when he said "Yeah archive it."

To restore one: `git mv _archive/2026-10-24-not-systems/<folder> <folder>`.
