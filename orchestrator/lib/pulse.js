'use strict';
// orchestrator/lib/pulse.js — moved to lib/pulse.js (0.60.236; DB17: a file that serves every system lives with the kernel). James, 2026-10-24:
// "We need the systems sovereign." The pulse uses node built-ins only; cortex, idearium and clear-glass reached into orchestrator for it.
// This one line keeps every old require working until the ratchet shows no one uses this path.
module.exports = require('../../lib/pulse.js');
