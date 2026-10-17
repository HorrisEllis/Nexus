'use strict';
// guardian/jaa-store.js — moved to lib/jaa-store.js (0.60.130): the store cortex, idearium, clear-glass, intelligence, copilot,
// versionium and the CLI all use is the kernel's, not guardian's (docs/2026-10-17-system-drawbridge-phasemap.spec addendum d,
// DB17). This path stays so nothing that requires it breaks; it goes when the ratchet shows nothing does.
module.exports = require('../lib/jaa-store.js');
