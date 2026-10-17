'use strict';
// diagnostic/server.js — diagnostic's entry (genesis 1.5.0's server.js). James, 2026-10-17: "the diagnostic needs to be a real
// system matching genasis."
//
// The service itself is nexus-diagnostic.js (its routes, its polling, the healer under /healer); this is the one door every
// genesis system has, so a launcher, a COS compartment and a person all start it the same way. Autopilot still starts
// nexus-diagnostic.js directly; both start the same service.
process.argv.splice(2);   // the service starts when nexus-diagnostic.js sees no CLI verb; the verbs are cli.js's
require('./nexus-diagnostic.js');
