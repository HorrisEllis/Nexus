'use strict';
// mesh/config.js — config for the mesh subsystem
// UUID: nexus-mesh-config-v1-0000-4700-0000-000000000001
//
// Ported from BrainOS (nexus-10-bridge v5.0.0) into nexus's own subsystem
// convention. BrainOS shipped as a standalone bridge server with its own
// port, own data dir, own bus (bus.js) and own agent/intent/routing layer.
// Only the genuinely new capability came across — see mesh/README.md for
// what was left behind and why.

const path = require('path');

module.exports = {
  DATA_DIR: path.join(__dirname, '..', 'data', 'mesh'),

  // Key rotation intervals — carried over from BrainOS's bridge defaults.
  KEY_INTERVALS: {
    session: 60 * 60 * 1000,       // 1 hour
    e2e:     15 * 60 * 1000,       // 15 min
    gate:    24 * 60 * 60 * 1000,  // 24 hours
    turn:    24 * 60 * 60 * 1000,  // 24 hours
  },

  // Optional standalone network daemons (dns-server, reverse-proxy,
  // firewall, ddns). None of these are started by guardian's boot —
  // they bind real ports/sockets, which is a deployment decision, not
  // something to silently start inside guardian's HTTP handler. See
  // mesh/daemons.js to start any of them explicitly.
  DNS_PORT:   53535,   // non-privileged default; BrainOS used the same pattern
  PROXY_PORT: 8088,
};
