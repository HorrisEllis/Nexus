'use strict';
/**
 * guardian/lib/gap-hunter.js — FORWARDING SHIM
 * UUID: guardian-gap-hunter-v1-0000-4000-0000-000000000001
 *
 * §CONSOLIDATED 2026-07-06 — this used to be a byte-identical copy of
 * meta/gap/hunter.js (confirmed via diff — same UUID, same "GapHunter v3"
 * header, only the relative import paths for liminal/confidence differed).
 * Two copies of the same logic, each with its own consumers
 * (guardian/server.js + 3 test files here; guardian/lib/ncp.js,
 * guardian/server.js, service/nexus-diagnostic.js, lib/reflection.js,
 * lib/open-loop-taxonomy.js, lib/nexus-expansion-boot.js on the meta/
 * side) — any future fix would need to land in both or silently drift.
 * meta/gap/hunter.js is canonical now — matches meta/'s own stated role
 * as the domain-agnostic home for this class of detector, and already
 * had more consumers. This shim exists for backward compatibility only —
 * same pattern lib/meta/index.js already uses for the broader meta
 * layer. Update any require('./lib/gap-hunter') to require('../../meta/gap/hunter')
 * directly when touching a file that uses this.
 */
module.exports = require('../../intelligence/gap/hunter.js');
