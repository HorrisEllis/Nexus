'use strict';
// mesh/daemons.js — optional standalone network daemons ported from BrainOS.
// UUID: nexus-mesh-daemons-v1-0000-4700-0000-000000000004
//
// dns-server.js, ddns.js, reverse-proxy.js, and firewall.js each bind a
// real port or socket (DNS on UDP, the proxy on its own TCP listener).
// BrainOS started these as part of its own bridge server's boot. That was
// NOT carried into guardian/server.js's boot — guardian already binds
// HTTP_PORT for its own listener, and silently having guardian's process
// also open a UDP DNS socket or a second TCP proxy listener on every boot
// is an infra/deployment decision nexus's operator should make explicitly,
// not something a merge should decide for them.
//
// Each daemon is still a real, working, ported module (mesh/lib/dns-server.js
// etc.) — this file is just an explicit, opt-in way to start any of them,
// run separately from guardian:
//
//   node mesh/daemons.js dns          # starts BrainOSDNS on config.DNS_PORT
//   node mesh/daemons.js proxy        # starts ReverseProxy on config.PROXY_PORT
//   node mesh/daemons.js firewall     # loads FirewallEngine, prints rule count
//   node mesh/daemons.js ddns         # runs one DDNS update check and exits
//
// None of these are wired to guardian's bus by default when run this way
// (they're separate processes) — pass --bus-log to also print bus events
// to stdout for local debugging.

const path = require('path');
const config = require('./config');

const which = process.argv[2];
const dataDir = config.DATA_DIR;

function log(...args) { console.log('[mesh/daemons]', ...args); }

async function main() {
  if (which === 'dns') {
    const { BrainOSDNS } = require('./lib/dns-server.js');
    const dns = new BrainOSDNS({ port: config.DNS_PORT, dataDir });
    await dns.start();
    log(`DNS server listening on :${config.DNS_PORT} (data: ${dataDir})`);
    return;
  }
  if (which === 'proxy') {
    const { ReverseProxy } = require('./lib/reverse-proxy.js');
    const proxy = new ReverseProxy({ port: config.PROXY_PORT, dataDir });
    await proxy.start();
    log(`Reverse proxy listening on :${config.PROXY_PORT} (data: ${dataDir})`);
    return;
  }
  if (which === 'firewall') {
    const { FirewallEngine } = require('./lib/firewall.js');
    const fw = new FirewallEngine({ dataDir });
    log(`Firewall loaded — ${fw._rules?.length ?? 0} rules (data: ${dataDir})`);
    return;
  }
  if (which === 'ddns') {
    const { DDNSClient, getPublicIP } = require('./lib/ddns.js');
    const ddns = new DDNSClient({ dataDir });
    const ip = await getPublicIP();
    log('Public IP:', ip);
    const result = await ddns.check();
    log('DDNS check result:', result);
    return;
  }
  console.error('Usage: node mesh/daemons.js <dns|proxy|firewall|ddns>');
  process.exit(1);
}

if (require.main === module) main().catch(e => { console.error('[mesh/daemons] fatal:', e.message); process.exit(1); });

module.exports = { main };
