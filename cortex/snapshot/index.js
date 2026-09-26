'use strict';
/**
 * cortex/snapshot/index.js — DEPRECATION SHIM. The real implementation
 * now lives in versionium/lib/snapshot.js.
 * UUID: nexus-cortex-snapshot-v1-0000-2026-0812-001  (unchanged — this
 *       is the same module identity, relocated, not a new one)
 *
 * §D3 CLOSED 2026-09-19 — James: "continue to migrate versionium,
 * snapshots to the versionium system." The 2026-09-19 cortex->
 * intelligence handoff left D3 open pending a git-vs-versionium rewind-
 * engine decision; the decision is versionium. See versionium/lib/
 * snapshot.js's own header for the move, and in particular for the
 * §ROLE SPLIT that is the real substance of it: versionium now owns the
 * snapshot INDEX (backup_records, snapshot_prune_log) in its own
 * sovereign store, while the tables a snapshot actually captures and
 * restores are still cortex's, because those are the subject, not the
 * bookkeeping.
 *
 * §WHY A SHIM AND NOT A DELETION (§0.3 — nothing simply disappears).
 * Five real call sites require this path today:
 *
 *   orchestrator/lib/autonomous-loop.js   (_safeRequire, pre-run snapshot)
 *   orchestrator/lib/request-handler.js   (§2.1 pre-forge snapshot)
 *   lib/compartment-engine.js             (lazy require, pre_forge)
 *   cortex/boot.js                        (registerStateProvider('cos'))
 *   guardian/server.js                    (registerStateProvider('guardian'))
 *
 * The first three already guard their require() defensively, but
 * cortex/boot.js and guardian/server.js do not — and both were missed
 * by the handoff's own "3 in-repo consumers" count, found by grepping
 * registerStateProvider directly rather than trusting that number
 * (§0.1 — reality is authority over the doc's description of it).
 * Deleting this file in the same pass as the move would have taken
 * guardian's boot down, which is exactly the class of breakage the
 * shim exists to avoid.
 *
 * §THIS IS A RE-EXPORT, NOT A SECOND IMPLEMENTATION. There is one
 * engine. Both paths return the same module object, so state registered
 * through this path (guardian's and cos's providers) and state
 * registered directly through versionium are the same registry — a
 * second copy here would have silently split _stateProviders in two and
 * made every system-state restore fail for whichever half didn't
 * register through the path the restore ran on.
 *
 * Migrate call sites to require('versionium/lib/snapshot') at leisure;
 * this shim stays until the last one moves, then gets deleted
 * deliberately, not silently.
 */

module.exports = require('../../versionium/lib/snapshot.js');
