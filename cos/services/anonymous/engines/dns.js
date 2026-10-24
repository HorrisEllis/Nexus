'use strict';
/**
 * engines/dns.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative DNS server. UDP/53 + TCP/53.
 * Zonefile lives at conf/dns.conf (JSON).
 * DDNS engine sends zone:update IPC to hot-swap A records without restart.
 *
 * conf/dns.conf:
 *   port      UDP+TCP port (default 53, use 5353 if you don't have root)
 *   origin    your domain, trailing dot e.g. 'anonymousservers.info.'
 *   ttl       default TTL in seconds (default 300)
 *   records   array of { name, type, value, ttl? }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const dgram = require('dgram');
const net   = require('net');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  port:   5353,   // use 53 in prod (requires root or cap_net_bind_service)
  origin: 'anonymousservers.info.',
  ttl:    300,
  ns1:    'ns1',  // nameserver label — becomes ns1.yourdomain
  ns2:    'ns2',
  records: [
    { name: '@',      type: 'A',     value: '127.0.0.1' },
    { name: 'www',    type: 'CNAME', value: '@' },
    { name: 'mail',   type: 'A',     value: '127.0.0.1' },
    { name: '@',      type: 'MX',    value: '10 mail.anonymousservers.info.' },
    { name: '@',      type: 'TXT',   value: 'v=spf1 mx a ~all' },
    { name: '_dmarc', type: 'TXT',   value: 'v=DMARC1; p=quarantine; rua=mailto:admin@anonymousservers.info' },
    { name: 'admin',  type: 'CNAME', value: '@' },
    { name: 'smtp',   type: 'CNAME', value: 'mail' },
    { name: 'vpn',    type: 'CNAME', value: '@' },
  ]
};

if (isInit()) {
  conf.init(DEFAULTS);
  process.stdout.write(JSON.stringify({ type: 'log', payload: { msg: 'dns: wrote default conf', level: 'INFO' } }) + '\n');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── synthetic authoritative records ──────────────────────────────────────────
// SOA and NS are always built from cfg — never need to be in the records array

function getSyntheticRecords(qname, qtype) {
  const dom = origin();
  if (qname.toLowerCase() !== dom) return [];
  const synth = [];
  const ns1fqdn = `${cfg.ns1 || 'ns1'}.${dom}`;
  const ns2fqdn = `${cfg.ns2 || 'ns2'}.${dom}`;

  if (qtype === DNS_TYPES.NS || qtype === 255) {
    synth.push({ name: '@', type: 'NS', value: ns1fqdn + '.', ttl: 3600 });
    synth.push({ name: '@', type: 'NS', value: ns2fqdn + '.', ttl: 3600 });
  }
  if (qtype === DNS_TYPES.SOA || qtype === 255) {
    // SOA: mname rname serial refresh retry expire minimum
    const serial = Math.floor(Date.now() / 1000);
    synth.push({
      name: '@', type: 'SOA', ttl: 3600,
      value: `${ns1fqdn}. hostmaster.${dom}. ${serial} 3600 900 604800 300`,
    });
  }
  return synth;
}

// ─── zone helpers ─────────────────────────────────────────────────────────────

function origin() { return cfg.origin.replace(/\.$/, '').toLowerCase(); }

function fqdn(name) {
  if (name === '@' || name === '') return origin();
  if (name.endsWith('.')) return name.slice(0, -1).toLowerCase();
  return `${name}.${origin()}`.toLowerCase();
}

function lookupRecords(qname, qtype) {
  const results = [];
  for (const r of cfg.records) {
    const rName = fqdn(r.name);
    if (rName !== qname.toLowerCase()) continue;
    if (qtype === 255 || r.type === DNS_TYPES_INV[qtype] || r.type === qtype) {
      results.push(r);
    }
    // follow CNAME for non-CNAME queries
    if (r.type === 'CNAME' && qtype !== 5) {
      const target = fqdn(r.value.replace(/\.$/, ''));
      results.push(...lookupRecords(target, qtype));
    }
  }
  // add synthetic SOA/NS for authoritative answers
  results.push(...getSyntheticRecords(qname, qtype));
  return results;
}

// ─── DNS wire format ──────────────────────────────────────────────────────────
//   Minimal RFC 1035 parser/encoder. Only types we need.

const DNS_TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28 };
const DNS_TYPES_INV = Object.fromEntries(Object.entries(DNS_TYPES).map(([k, v]) => [v, k]));

function encodeName(name) {
  const parts = name.split('.');
  const buf = [];
  for (const p of parts) {
    if (!p) continue;
    buf.push(p.length);
    for (const c of p) buf.push(c.charCodeAt(0));
  }
  buf.push(0);
  return Buffer.from(buf);
}

function decodeName(buf, offset) {
  const labels = [];
  let jumped = false, jumpOffset = 0;
  while (true) {
    if (offset >= buf.length) break;
    const len = buf[offset];
    if (len === 0) { if (!jumped) jumpOffset = offset + 1; break; }
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | buf[offset + 1];
      if (!jumped) jumpOffset = offset + 2;
      jumped = true;
      offset = ptr;
      continue;
    }
    offset++;
    labels.push(buf.slice(offset, offset + len).toString());
    offset += len;
  }
  return { name: labels.join('.').toLowerCase(), end: jumped ? jumpOffset : offset + 1 };
}

function parseQuery(buf) {
  const id = buf.readUInt16BE(0);
  const qdCount = buf.readUInt16BE(4);
  const questions = [];
  let offset = 12;
  for (let i = 0; i < qdCount; i++) {
    const { name, end } = decodeName(buf, offset);
    offset = end;
    const qtype  = buf.readUInt16BE(offset);
    const qclass = buf.readUInt16BE(offset + 2);
    offset += 4;
    questions.push({ name, qtype, qclass });
  }
  return { id, questions };
}

function encodeRdata(type, value) {
  switch (type) {
    case 'A': {
      return Buffer.from(value.split('.').map(Number));
    }
    case 'CNAME': case 'NS': {
      return encodeName(fqdn(value.replace(/\.$/, '')));
    }
    case 'MX': {
      const [pref, host] = value.split(' ');
      const prefBuf = Buffer.alloc(2);
      prefBuf.writeUInt16BE(Number(pref));
      return Buffer.concat([prefBuf, encodeName(host.replace(/\.$/, ''))]);
    }
    case 'TXT': {
      const text = Buffer.from(value);
      const len  = Buffer.from([text.length]);
      return Buffer.concat([len, text]);
    }
    case 'SOA': {
      // value format: "mname. rname. serial refresh retry expire minimum"
      const parts = value.trim().split(/\s+/);
      const mname   = parts[0] ? parts[0].replace(/\.$/, '') : `ns1.${origin()}`;
      const rname   = parts[1] ? parts[1].replace(/\.$/, '') : `hostmaster.${origin()}`;
      const serial  = parseInt(parts[2])  || (Date.now() / 1000 | 0);
      const refresh = parseInt(parts[3])  || 3600;
      const retry   = parseInt(parts[4])  || 900;
      const expire  = parseInt(parts[5])  || 604800;
      const minimum = parseInt(parts[6])  || 300;
      const fixed = Buffer.alloc(20);
      fixed.writeUInt32BE(serial,  0);
      fixed.writeUInt32BE(refresh, 4);
      fixed.writeUInt32BE(retry,   8);
      fixed.writeUInt32BE(expire,  12);
      fixed.writeUInt32BE(minimum, 16);
      return Buffer.concat([encodeName(mname), encodeName(rname), fixed]);
    }
    default:
      return Buffer.from(value);
  }
}

function buildResponse(query, answers) {
  const { id, questions } = query;

  const hdr = Buffer.alloc(12);
  hdr.writeUInt16BE(id, 0);
  // QR=1 AA=1 RD=1 (query response, authoritative, recursion desired)
  hdr.writeUInt16BE(0x8400 | (answers.length ? 0 : 0x0003), 2); // NXDOMAIN if no answers
  hdr.writeUInt16BE(questions.length, 4);
  hdr.writeUInt16BE(answers.length, 6);
  hdr.writeUInt16BE(0, 8);
  hdr.writeUInt16BE(0, 10);

  const qBufs = questions.map(q => {
    const nameBuf = encodeName(q.name);
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(q.qtype, 0);
    tail.writeUInt16BE(q.qclass, 2);
    return Buffer.concat([nameBuf, tail]);
  });

  const ansBufs = answers.map(r => {
    const nameBuf = encodeName(fqdn(r.name));
    const rdata   = encodeRdata(r.type, r.value);
    const meta    = Buffer.alloc(10);
    meta.writeUInt16BE(DNS_TYPES[r.type] || 1, 0);
    meta.writeUInt16BE(1, 2);                          // IN class
    meta.writeUInt32BE(r.ttl || cfg.ttl, 4);
    meta.writeUInt16BE(rdata.length, 8);
    return Buffer.concat([nameBuf, meta, rdata]);
  });

  return Buffer.concat([hdr, ...qBufs, ...ansBufs]);
}

function handleQuery(buf) {
  try {
    const query   = parseQuery(buf);
    const q       = query.questions[0];
    if (!q) return buildResponse(query, []);
    const answers = lookupRecords(q.name, q.qtype);
    ipc.db.insert('dns_log', { name: q.name, type: DNS_TYPES_INV[q.qtype], answers: answers.length }).catch(() => {});
    return buildResponse(query, answers);
  } catch (e) {
    log(`parse error: ${e.message}`, 'ERROR');
    return Buffer.alloc(0);
  }
}

// ─── servers ──────────────────────────────────────────────────────────────────

function startUDP(port) {
  port = port || cfg.port;
  const sock = dgram.createSocket('udp4');
  sock.on('message', (msg, rinfo) => {
    const resp = handleQuery(msg);
    if (resp.length) sock.send(resp, rinfo.port, rinfo.address);
  });
  sock.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      const fallback = port === 5353 ? 5354 : port + 1;
      log(`UDP port ${port} in use (mDNS/Bonjour?) — trying :${fallback}`, 'WARN');
      sock.close();
      startUDP(fallback);
    } else {
      log(`UDP error: ${err.message}`, 'ERROR');
    }
  });
  sock.bind(port, () => {
    log(`UDP/DNS listening on :${port}`);
    claimPort(port);
    // update cfg so TCP matches
    cfg._udpPort = port;
  });
}

function startTCP(port) {
  port = port || cfg.port;
  const server = net.createServer(socket => {
    socket.on('data', data => {
      if (data.length < 2) return;
      const msgLen = data.readUInt16BE(0);
      const msg    = data.slice(2, 2 + msgLen);
      const resp   = handleQuery(msg);
      if (resp.length) {
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUInt16BE(resp.length);
        socket.write(Buffer.concat([lenBuf, resp]));
      }
    });
    socket.on('error', () => {});
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      const next = port + 1;
      log(`TCP port ${port} in use — trying :${next}`, 'WARN');
      startTCP(next);
    } else {
      log(`TCP error: ${err.message}`, 'ERROR');
    }
  });
  server.listen(port, () => {
    cfg.port = port;
    log(`TCP/DNS listening on :${port}`);
    claimPort(port);
  });
}

// ─── IPC: hot zone updates from DDNS ─────────────────────────────────────────

ipc.on('zone:update', payload => {
  const { name, type, value, ttl } = payload || {};
  if (!name || !type || !value) return;
  cfg.records = cfg.records.filter(r => !(r.name === name && r.type === type));
  cfg.records.push({ name, type, value, ...(ttl ? { ttl } : {}) });
  conf.save(cfg);
  log(`zone hot-updated: ${name} ${type} -> ${value}`);
});

ipc.on('zone:delete', payload => {
  const { name, type } = payload || {};
  cfg.records = cfg.records.filter(r => !(r.name === name && r.type === type));
  conf.save(cfg);
  log(`zone record deleted: ${name} ${type}`);
});

ipc.on('zone:get', () => {
  ipc.send('zone:reply', { records: cfg.records, origin: cfg.origin, ttl: cfg.ttl });
});

// ─── start ────────────────────────────────────────────────────────────────────

log('dns engine starting');
startUDP();
startTCP();

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

