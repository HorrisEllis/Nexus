'use strict';
// ── cli/run-supervised.js ───────────────────────────────────────────────────
// UUID: nexus-run-supervised-v1-0000-4000-0000-000000000001
//
// Thin wrapper so `npm run start:all` (concurrently) can set NEXUS_SUPERVISED
// on the orchestrator command ONLY, without needing an extra cross-platform
// env-setting dependency (cross-env etc.) just for one variable. concurrently
// runs each command in its own shell, and Windows cmd.exe / POSIX shells set
// inline env vars differently — this sidesteps that entirely: it's plain
// Node, runs identically everywhere, and does exactly one thing before
// handing off to the real entrypoint.
//
// Usage (see package.json "start:all"):
//   node cli/run-supervised.js   — instead of: node orchestrator.js
//
// This must run BEFORE orchestrator.js is required, since orchestrator.js
// reads process.env.NEXUS_SUPERVISED synchronously during its own boot
// sequence (see the §FIX comment near _bootSystems in orchestrator.js).
process.env.NEXUS_SUPERVISED = '1';
require('../orchestrator/orchestrator.js');   // §0.39.355 PB5 — orchestrator.js lives in orchestrator/ (was ../orchestrator.js, which does not exist)
