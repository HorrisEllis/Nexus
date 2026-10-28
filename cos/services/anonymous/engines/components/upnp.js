'use strict';
// [NEXUS-COMPONENT-ID]
const COMPONENT_ID   = 'c93d386f';
const COMPONENT_UUID = '37f5da81-dd05-5af0-8ca9-48b6d949e1ec';
const COMPONENT_NAME = 'upnp';
// [/NEXUS-COMPONENT-ID]
/**
 * components/upnp.js — automatic router port forwarding via UPnP IGD
 * anonymousservers.info
 *
 * Discovers a UPnP Internet Gateway Device on the LAN (most home routers)
 * and asks it to forward inbound ports to this machine — no manual router
 * login required. This is what lets Nexus open itself to the internet
 * automatically on supported routers.
 *
 * Falls back gracefully (with a clear log message) if:
 *   - no UPnP gateway responds (corporate network, UPnP disabled, CGNAT)
 *   - the gateway rejects the mapping (some ISP routers lock this down)
 *
 * Component contract:
 *   upnp.discover(timeoutMs)              → Promise<{ ok, controlUrl, ip } | { ok:false, detail }>
 *   upnp.addPortMapping(port, proto, opts) → Promise<{ ok, detail }>
 *   upnp.removePortMapping(port, proto)    → Promise<{ ok, detail }>
 *   upnp.openPorts(ports, log)             → Promise<{ ok, results[] }>  (batch helper)
 */

const dgram = require('dgram');
const http  = require('http');
const os    = require('os');

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function soapRequest(controlUrl, action, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const u    = new URL(controlUrl);
    const data = Buffer.from(body);
    const req  = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname,
      method: 'POST', timeout: timeoutMs,
      headers: {
        'Content-Type':   'text/xml; charset=utf-8',
        'SOAPAction':     `"urn:schemas-upnp-org:service:WANIPConnection:1#${action}"`,
        'Content-Length': data.length,
      },
    }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => resolve({ status: r.statusCode, body: b })); });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── discover the IGD control URL ──────────────────────────────────────────────

function discover(timeoutMs = 5000) {
  return new Promise(resolve => {
    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n'
    );
    const sock = dgram.createSocket('udp4');
    let found = false;

    sock.on('message', async data => {
      if (found) return;
      const resp = data.toString();
      const locMatch = resp.match(/LOCATION:\s*(.+)/i);
      if (!locMatch) return;
      const loc = locMatch[1].trim();

      try {
        const desc = await httpGet(loc, 4000);
        const controlUrlMatch =
          desc.match(/<controlURL>([^<]+WANIPConn[^<]*)<\/controlURL>/i) ||
          desc.match(/<controlURL>([^<]+)<\/controlURL>/i);
        if (!controlUrlMatch) return;

        const baseUrl     = new URL(loc);
        const controlPath = controlUrlMatch[1].startsWith('/') ? controlUrlMatch[1] : '/' + controlUrlMatch[1];
        const controlUrl  = `${baseUrl.protocol}//${baseUrl.host}${controlPath}`;

        found = true;
        sock.close();
        resolve({ ok: true, controlUrl, gatewayLocation: loc });
      } catch (e) {
        // not a usable gateway — keep listening for others
      }
    });

    sock.bind(() => { sock.send(msg, SSDP_PORT, SSDP_ADDR); });

    setTimeout(() => {
      if (!found) { try { sock.close(); } catch {} resolve({ ok: false, detail: 'no UPnP gateway responded' }); }
    }, timeoutMs);

    sock.on('error', e => resolve({ ok: false, detail: `UPnP socket error: ${e.message}` }));
  });
}

// ─── add a single port mapping ─────────────────────────────────────────────────

async function addPortMapping(controlUrl, port, protocol = 'TCP', internalHost = null, description = 'nexus', leaseSeconds = 0) {
  const host = internalHost || getLocalIp();
  const soap = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">
      <NewRemoteHost></NewRemoteHost>
      <NewExternalPort>${port}</NewExternalPort>
      <NewProtocol>${protocol.toUpperCase()}</NewProtocol>
      <NewInternalPort>${port}</NewInternalPort>
      <NewInternalClient>${host}</NewInternalClient>
      <NewEnabled>1</NewEnabled>
      <NewPortMappingDescription>${description}</NewPortMappingDescription>
      <NewLeaseDuration>${leaseSeconds}</NewLeaseDuration>
    </u:AddPortMapping>
  </s:Body>
</s:Envelope>`;

  try {
    const res = await soapRequest(controlUrl, 'AddPortMapping', soap);
    const ok  = res.status === 200 || res.body?.includes('AddPortMappingResponse');
    if (ok) return { ok: true, detail: `mapped ${protocol}/${port} → ${host}:${port}` };

    // extract UPnP error code/description if present
    const errCode = res.body?.match(/<errorCode>(\d+)<\/errorCode>/i)?.[1];
    const errDesc = res.body?.match(/<errorDescription>([^<]+)<\/errorDescription>/i)?.[1];
    return { ok: false, detail: errDesc ? `${errCode}: ${errDesc}` : `gateway rejected mapping (status ${res.status})` };
  } catch (e) {
    return { ok: false, detail: `SOAP request failed: ${e.message}` };
  }
}

async function removePortMapping(controlUrl, port, protocol = 'TCP') {
  const soap = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:DeletePortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">
      <NewRemoteHost></NewRemoteHost>
      <NewExternalPort>${port}</NewExternalPort>
      <NewProtocol>${protocol.toUpperCase()}</NewProtocol>
    </u:DeletePortMapping>
  </s:Body>
</s:Envelope>`;

  try {
    const res = await soapRequest(controlUrl, 'DeletePortMapping', soap);
    return { ok: res.status === 200 || res.body?.includes('DeletePortMappingResponse'), detail: `unmapped ${protocol}/${port}` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

// ─── batch helper: open a list of ports in one call ───────────────────────────
// ports: [{ port: 80, protocol: 'TCP' }, { port: 53, protocol: 'both' }, ...]

async function openPorts(ports, log = () => {}, description = 'nexus') {
  log(`upnp: discovering router gateway…`);
  const gw = await discover(5000);

  if (!gw.ok) {
    log(`upnp: ${gw.detail} — automatic port forwarding unavailable, manual router setup required`, 'WARN');
    return { ok: false, skipped: true, reason: gw.detail, results: [] };
  }

  log(`upnp: gateway found — requesting port mappings`);
  const results = [];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const p of ports) {
    const protocols = p.protocol === 'both' ? ['TCP', 'UDP'] : [p.protocol || 'TCP'];
    for (const proto of protocols) {
      let res = await addPortMapping(gw.controlUrl, p.port, proto, p.internalHost, description, p.leaseSeconds || 0);

      // Many consumer routers drop the connection ("socket hang up") when
      // SOAP requests arrive back-to-back faster than their UPnP daemon can
      // process them. One retry after a short pause resolves this in the
      // vast majority of cases.
      if (!res.ok && /socket hang up|ECONNRESET|timeout/i.test(res.detail || '')) {
        await sleep(400);
        res = await addPortMapping(gw.controlUrl, p.port, proto, p.internalHost, description, p.leaseSeconds || 0);
      }

      results.push({ port: p.port, protocol: proto, ...res });
      log(res.ok ? `upnp: OK ${proto}/${p.port} forwarded` : `upnp: FAIL ${proto}/${p.port} — ${res.detail}`, res.ok ? 'INFO' : 'WARN');

      // Pace requests so the router's UPnP daemon isn't hammered.
      await sleep(250);
    }
  }

  const allOk = results.every(r => r.ok);
  return { ok: allOk, results, controlUrl: gw.controlUrl };
}

async function closePorts(ports, log = () => {}) {
  const gw = await discover(5000);
  if (!gw.ok) { log(`upnp: ${gw.detail}`, 'WARN'); return { ok: false, skipped: true, results: [] }; }

  const results = [];
  for (const p of ports) {
    const protocols = p.protocol === 'both' ? ['TCP', 'UDP'] : [p.protocol || 'TCP'];
    for (const proto of protocols) {
      const res = await removePortMapping(gw.controlUrl, p.port, proto);
      results.push({ port: p.port, protocol: proto, ...res });
      log(res.ok ? `upnp: removed ${proto}/${p.port}` : `upnp: failed to remove ${proto}/${p.port}`, res.ok ? 'INFO' : 'WARN');
    }
  }
  return { ok: results.every(r => r.ok), results };
}

module.exports = { discover, addPortMapping, removePortMapping, openPorts, closePorts, getLocalIp };
