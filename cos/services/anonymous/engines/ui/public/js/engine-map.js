/* ============================================================================
   NexusPanel — engine-map.js

   Ports, descriptions and component IDs for every engine.

   In the monolith this table existed three times — once server-side in ui.js
   and twice inside the client template literal — and the copies had already
   drifted (the server copy listed `ui` at 9000, one client copy omitted
   `webserver` entirely). One table, one source of truth.
   ========================================================================= */

const ENGINE_PORTS = {
  dns: 5353, ddns: 0, tls: 80, proxy: 8080, relay: 0, firewall: 0,
  auth: 4001, signal: 0, smtp: 2525, cache: 4002, storage: 9100,
  queue: 0, billing: 4003, monitor: 4004, optimizer: 4006, catalog: 4005,
  registrar: 4007, provisioner: 4008, glue: 4009, peer: 7800, tunnel: 7801,
  autodns: 7802, webserver: 7700, ui: 9000,
};

const ENGINE_DESC = {
  dns: 'Authoritative DNS + zone',
  ddns: 'Dynamic DNS push',
  tls: 'ACME certificates',
  proxy: 'Reverse proxy',
  relay: 'Phantom tunnel',
  firewall: 'Rate limit + ban',
  auth: 'JWT + API keys',
  signal: 'Bot classifier',
  smtp: 'Mail transfer + DKIM',
  cache: 'LRU cache',
  storage: 'S3-compatible storage',
  queue: 'Job queue',
  billing: 'Tenants + plans',
  monitor: 'Uptime + latency',
  optimizer: 'Compression + perf',
  catalog: 'One-click app installer',
  registrar: 'Domain tools',
  provisioner: 'User onboarding',
  glue: 'Nameserver glue setup',
  peer: 'P2P identity',
  tunnel: 'Automatic tunnel',
  autodns: 'DNS record push',
  webserver: 'Multi-vhost web server',
  ui: 'Control panel',
};

const ENGINE_CID = {
  dns: '7a3f1b2c', ddns: '4d8e9c12', tls: 'b3f7a921', proxy: 'c1d4e839',
  relay: 'f2a7b341', firewall: '91a8c384', auth: 'e4b8f123', signal: 'a3c7d291',
  smtp: 'b9f3e142', cache: 'c8d2a761', storage: 'd3e9b482', queue: 'e7a1c293',
  billing: 'f4b2d817', monitor: 'a8c3e142', optimizer: 'b7d4f293',
  catalog: 'c2a8e731', registrar: 'd9b3f142', provisioner: 'e1c7a283',
  glue: 'f8d2b419', peer: 'a3e8c271', tunnel: 'b2f9d183', autodns: 'c7a1e392',
  webserver: 'wb3f9a21', ui: '636117b2',
};

export { ENGINE_PORTS, ENGINE_DESC, ENGINE_CID };
