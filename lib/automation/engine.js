'use strict';
// Moved to cos/automation/engine.js (0.60.534 SW5i slice a, docs/2026-11-13-sovereign-and-wired-phasemap.spec). James, 2026-11-14: "migrating brainos backed
// not the ui". This forwarder keeps the old address working until its callers reach COS by route (slice b), then it is retired (slice c).
module.exports = require('../../cos/automation/engine.js');
