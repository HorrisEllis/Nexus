# 0.60.592 — RAID is the resolver (in Emerge)

James, 2026-11-19: "should'nt that be in the routing system since raid handles inbound requests. shouldn't it be the resolver" · "okay why not now?" · "keep it emerge. follow the architecture"

## What changed
RAID is the resolver: cortex/core/raid/resolve.eg (Emerge) resolves nexus://<system>[.<surface>][/path] from a table of each system's own declared addresses; compiled by `eg build` to cortex/core/raid/eg-build/resolve.js and run inside RAID, the first compiled Emerge Nexus loads in-process (no process per call). Routes: POST /api/raid/addresses (COS, which owns the declarations, hands RAID the table; kept as a node, cortex/data/raid/addresses.node; raid.addresses emitted), GET /api/raid/addresses, GET /api/raid/resolve?name=. COS's addressOf asks RAID, keeps RAID's answers (cos/data/manager/raid-addresses.json) so names resolve while RAID restarts, and only for a name RAID never answered uses the declaration, said once; RAID's own address is the one bootstrap entry. Proven live: RAID restarted, the table posted, nexus://clear-glass.cmd/cmd → http://127.0.0.1:7702/cmd. resolve.test.eg 2/2; test-cos-service 11/11. COS takes its half at its next restart.

## Files
- cortex/core/raid/resolve.eg, cortex/core/raid/test/resolve.test.eg (Emerge); cortex/core/raid/eg-build/resolve.js (eg build output)
- cortex/boot.js: the three routes
- cos/manager/server.js: addressTable, pushAddresses, addressOf asks RAID
