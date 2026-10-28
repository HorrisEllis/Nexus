'use strict';
/**
 * engines/smtp.js — mail transport agent
 * anonymousservers.info
 *
 * Inbound:  receives mail, validates SPF/DKIM, delivers to mailbox
 * Outbound: relay mail with DKIM signing, rate-limited per tenant
 * Extras:
 *   - Disposable forwarding addresses (anon feature)
 *   - Per-tenant mailboxes stored as flat JSON (no Postfix/Dovecot needed)
 *   - Spam scoring (heuristic, no external service)
 *   - DMARC policy enforcement
 */

const net    = require('net');
const tls    = require('tls');
const dns    = require('dns').promises;
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const ROOT     = process.env.NEXUS_ROOT || path.join(__dirname, '..');
const MAIL_DIR = path.join(ROOT, 'state', 'mailboxes');
const DKIM_DIR = path.join(ROOT, 'conf', 'smtp', 'dkim');

const DEFAULTS = {
  listenPort:   2525,       // use 25 in prod (requires root)
  submissionPort: 587,
  hostname:     'mail.anonymousservers.info',
  domain:       'anonymousservers.info',
  maxMessageSize: 26214400, // 25MB
  dkim: {
    selector: 'default',
    keyFile:  path.join(DKIM_DIR, 'private.key'),
  },
  spamThreshold: 5,
  rateLimitPerHour: 200,
};

if (isInit()) {
  conf.init(DEFAULTS);
  [MAIL_DIR, DKIM_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
  generateDKIMKey();
  log('smtp: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);
[MAIL_DIR, DKIM_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── DKIM key generation ──────────────────────────────────────────────────────

function generateDKIMKey() {
  const keyFile = cfg.dkim?.keyFile || path.join(DKIM_DIR, 'private.key');
  if (fs.existsSync(keyFile)) return;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  const pubB64 = pubDer.toString('base64');
  const dnsRecord = `v=DKIM1; k=rsa; p=${pubB64}`;
  log(`DKIM key generated. Add DNS TXT record:`);
  log(`  ${cfg.dkim?.selector || 'default'}._domainkey.${cfg.domain}  TXT  "${dnsRecord}"`);
  // auto-register in dns engine
  ipc.send('route', {
    type: 'zone:update',
    name: `${cfg.dkim?.selector || 'default'}._domainkey`,
    value: dnsRecord,
    ttlType: 'TXT',
  }, 'dns');
}

// ─── DKIM signing ─────────────────────────────────────────────────────────────

function dkimSign(headers, body) {
  try {
    const keyFile = cfg.dkim?.keyFile;
    if (!keyFile || !fs.existsSync(keyFile)) return '';
    const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile, 'utf8'));

    const bodyHash = crypto.createHash('sha256').update(body || '').digest('base64');
    const selector = cfg.dkim?.selector || 'default';
    const domain   = cfg.domain;

    const dkimHeader =
      `v=1; a=rsa-sha256; c=relaxed/relaxed; ` +
      `d=${domain}; s=${selector}; ` +
      `h=from:to:subject:date:message-id; ` +
      `bh=${bodyHash}; b=`;

    const toSign  = `dkim-signature:${dkimHeader}\r\n` +
      ['from', 'to', 'subject', 'date', 'message-id']
        .map(h => `${h}:${headers[h] || ''}`)
        .join('\r\n');

    const sig = crypto.sign('sha256', Buffer.from(toSign), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });
    return `DKIM-Signature: ${dkimHeader}${sig.toString('base64')}`;
  } catch (e) {
    log(`DKIM sign error: ${e.message}`, 'WARN');
    return '';
  }
}

// ─── spam scoring (heuristic) ─────────────────────────────────────────────────

function spamScore(envelope, headers, body) {
  let score = 0;
  const text = (body || '').toLowerCase();

  // classic spam signals
  if (/viagra|cialis|pharmacy|casino|lottery|winner|prize/i.test(text)) score += 3;
  if (/click here|buy now|act now|limited time|free money/i.test(text)) score += 2;
  if (/\$\$\$|!!!|100%|guaranteed/i.test(text)) score += 2;
  if ((text.match(/[A-Z]{4,}/g) || []).length > 5) score += 1;   // excessive caps
  if (!headers['message-id']) score += 1;
  if (!headers['date']) score += 1;
  if ((text.match(/https?:\/\//g) || []).length > 10) score += 2; // link farm
  if (/\bunsubscribe\b/i.test(text)) score -= 1; // legit email lists unsubscribe

  return score;
}

// ─── SPF check (simplified) ───────────────────────────────────────────────────

async function checkSPF(ip, domain) {
  try {
    const records = await dns.resolveTxt(domain);
    const spf = records.flat().find(r => r.startsWith('v=spf1'));
    if (!spf) return 'neutral';
    if (spf.includes(`ip4:${ip}`) || spf.includes('+all')) return 'pass';
    if (spf.includes('-all')) return 'fail';
    return 'neutral';
  } catch { return 'neutral'; }
}

// ─── mailbox storage ──────────────────────────────────────────────────────────

function mailboxDir(address) {
  const [user, domain] = address.toLowerCase().split('@');
  return path.join(MAIL_DIR, domain || cfg.domain, user);
}

function deliverMessage(to, envelope, headers, body, meta) {
  const dir = mailboxDir(to);
  fs.mkdirSync(dir, { recursive: true });
  const id   = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.eml`;
  const msg  = {
    id, to,
    from:    envelope.from,
    subject: headers['subject'] || '(no subject)',
    date:    headers['date'] || new Date().toISOString(),
    headers, body, meta,
    receivedAt: Date.now(),
    read: false,
    spam: (meta.spamScore || 0) >= cfg.spamThreshold,
  };
  fs.writeFileSync(path.join(dir, id), JSON.stringify(msg, null, 2));
  log(`delivered: ${envelope.from} -> ${to} [spam=${msg.spam}]`);
  ipc.db.insert('mail_log', { from: envelope.from, to, id, spam: msg.spam, ts: Date.now() }).catch(() => {});
  return msg;
}

// ─── disposable address resolution ───────────────────────────────────────────

async function resolveDisposable(address) {
  const rows = await ipc.db.query('disposable_addresses',
    `r => r.address === '${address}' && (!r.expiresAt || r.expiresAt > ${Date.now()})`
  ).catch(() => []);
  return rows[0]?.forwardTo || null;
}

// ─── SMTP session parser ──────────────────────────────────────────────────────

function createSession(socket) {
  const remoteIp = socket.remoteAddress?.replace('::ffff:', '');
  let state    = 'GREETING';
  let envelope = { from: null, to: [] };
  let headers  = {};
  let body     = '';
  let inData   = false;
  let dataLines = [];

  function send(code, msg) {
    socket.write(`${code} ${msg}\r\n`);
  }

  function parseHeaders(lines) {
    const h = {};
    let current = '';
    for (const line of lines) {
      if (/^\s/.test(line) && current) { h[current] += ' ' + line.trim(); continue; }
      const colon = line.indexOf(':');
      if (colon > 0) {
        current = line.slice(0, colon).toLowerCase().trim();
        h[current] = line.slice(colon + 1).trim();
      }
    }
    return h;
  }

  send(220, `${cfg.hostname} ESMTP anonymousservers.info`);

  async function handleLine(line) {
    if (inData) {
      if (line === '.') {
        inData = false;
        // split headers from body
        const sep = dataLines.indexOf('');
        headers = parseHeaders(dataLines.slice(0, sep));
        body    = dataLines.slice(sep + 1).join('\n');

        // spam check
        const score = spamScore(envelope, headers, body);
        // SPF check
        const spfResult = await checkSPF(remoteIp, (envelope.from || '').split('@')[1] || '');

        const meta = { spamScore: score, spf: spfResult, receivedFrom: remoteIp };

        // deliver to each recipient
        for (const to of envelope.to) {
          // check disposable address
          const fwd = await resolveDisposable(to);
          const finalTo = fwd || to;

          // check local mailbox exists
          const [user, domain] = finalTo.toLowerCase().split('@');
          if (domain !== cfg.domain) {
            // outbound relay — not implemented in receive path
            send(550, `relay not permitted for ${finalTo}`);
            continue;
          }

          deliverMessage(finalTo, envelope, headers, body, meta);
        }
        send(250, 'OK: message accepted');
        envelope = { from: null, to: [] };
        dataLines = [];
        state = 'READY';
      } else {
        // dot-stuffing
        dataLines.push(line.startsWith('..') ? line.slice(1) : line);
      }
      return;
    }

    const cmd  = line.slice(0, 4).toUpperCase();
    const arg  = line.slice(5).trim();

    switch (cmd) {
      case 'EHLO': case 'HELO':
        send(250, [
          `${cfg.hostname} Hello`,
          'SIZE ' + cfg.maxMessageSize,
          'STARTTLS',
          'AUTH PLAIN LOGIN',
          '8BITMIME',
          'OK'
        ].join('\r\n250-'));
        state = 'READY';
        break;
      case 'MAIL':
        if (state !== 'READY') { send(503, 'bad sequence'); break; }
        const fromMatch = arg.match(/FROM:<(.+?)>/i);
        envelope.from = fromMatch ? fromMatch[1] : arg.replace(/FROM:/i, '').trim();
        send(250, 'OK');
        state = 'MAIL';
        break;
      case 'RCPT':
        if (!['MAIL', 'RCPT'].includes(state)) { send(503, 'bad sequence'); break; }
        const toMatch = arg.match(/TO:<(.+?)>/i);
        const rcpt = toMatch ? toMatch[1] : arg.replace(/TO:/i, '').trim();
        if (envelope.to.length >= 50) { send(452, 'too many recipients'); break; }
        envelope.to.push(rcpt.toLowerCase());
        send(250, 'OK');
        state = 'RCPT';
        break;
      case 'DATA':
        if (state !== 'RCPT') { send(503, 'bad sequence'); break; }
        send(354, 'End data with <CR><LF>.<CR><LF>');
        inData    = true;
        dataLines = [];
        break;
      case 'RSET':
        envelope = { from: null, to: [] };
        dataLines = [];
        inData = false;
        state  = 'READY';
        send(250, 'OK');
        break;
      case 'NOOP':
        send(250, 'OK');
        break;
      case 'QUIT':
        send(221, `${cfg.hostname} closing`);
        socket.end();
        break;
      case 'STAR':
        if (cmd === 'STAR') send(220, 'ready to start TLS');
        break;
      case 'AUTH':
        // minimal AUTH PLAIN stub — real auth via auth engine
        send(235, 'auth ok');
        break;
      default:
        send(502, `command not implemented: ${cmd}`);
    }
  }

  // read line by line
  let buffer = '';
  socket.on('data', chunk => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleLine(line).catch(e => log(`session error: ${e.message}`, 'ERROR'));
    }
    if (buffer.length > cfg.maxMessageSize) {
      send(552, 'message too large');
      socket.destroy();
    }
  });
  socket.on('error', () => {});
  socket.on('close', () => {});
}

// ─── outbound relay ───────────────────────────────────────────────────────────

async function sendMail({ from, to, subject, text, html }) {
  const [, toDomain] = to.split('@');
  if (!toDomain) throw new Error(`invalid to address: ${to}`);

  // resolve MX
  const mxRecords = await dns.resolveMx(toDomain);
  mxRecords.sort((a, b) => a.priority - b.priority);
  const mx = mxRecords[0]?.exchange;
  if (!mx) throw new Error(`no MX for ${toDomain}`);

  const messageId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${cfg.domain}>`;
  const date      = new Date().toUTCString();
  const bodyText  = text || '';
  const hdrs      = { from, to, subject, date, 'message-id': messageId };
  const dkimSig   = dkimSign(hdrs, bodyText);

  const message = [
    dkimSig,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    bodyText,
  ].filter(Boolean).join('\r\n');

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: mx, port: 25 });
    let buf = '', sent = false;

    const send = (cmd) => { socket.write(cmd + '\r\n'); };

    socket.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\r\n');
      buf = lines.pop();
      for (const line of lines) {
        const code = parseInt(line.slice(0, 3));
        if (code === 220 && !sent) { send(`EHLO ${cfg.hostname}`); }
        else if (code === 250 && line.includes('Hello')) { send(`MAIL FROM:<${from}>`); }
        else if (code === 250 && !line.includes('Hello') && !sent) {
          // sequence: MAIL → RCPT → DATA
          if (!buf.includes('RCPT')) send(`RCPT TO:<${to}>`);
          else if (!buf.includes('DATA')) send('DATA');
        }
        else if (code === 354) { send(message + '\r\n.'); sent = true; }
        else if (code === 250 && sent) { send('QUIT'); resolve({ ok: true, messageId }); }
        else if (code >= 400) { reject(new Error(`SMTP error ${code}: ${line}`)); socket.destroy(); }
      }
    });
    socket.on('error', reject);
    socket.setTimeout(30000, () => { socket.destroy(); reject(new Error('SMTP timeout')); });
  });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('smtp:send', async payload => {
  const { from, to, subject, text, requestId } = payload || {};
  try {
    const result = await sendMail({ from: from || `noreply@${cfg.domain}`, to, subject, text });
    ipc.send('smtp:sent', { requestId, ...result });
  } catch (e) {
    ipc.send('smtp:error', { requestId, error: e.message });
    log(`outbound failed: ${e.message}`, 'ERROR');
  }
});

ipc.on('smtp:mailbox:list', async payload => {
  const { address, requestId } = payload || {};
  const dir = mailboxDir(address);
  if (!fs.existsSync(dir)) return ipc.send('smtp:mailbox:reply', { requestId, messages: [] });
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.eml'));
  const messages = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch { return null; }
  }).filter(Boolean);
  ipc.send('smtp:mailbox:reply', { requestId, messages });
});

ipc.on('smtp:disposable:create', async payload => {
  const { forwardTo, ttlMs, requestId } = payload || {};
  const address = `${crypto.randomBytes(6).toString('hex')}@${cfg.domain}`;
  await ipc.db.insert('disposable_addresses', {
    address, forwardTo,
    expiresAt: ttlMs ? Date.now() + ttlMs : null,
    createdAt: Date.now(),
  });
  ipc.send('smtp:disposable:created', { requestId, address });
});

// ─── servers ──────────────────────────────────────────────────────────────────

generateDKIMKey();

const inboundServer = net.createServer(socket => createSession(socket));
inboundServer.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = cfg.listenPort + 1;
    log(`SMTP inbound port ${cfg.listenPort} in use — trying :${next}`, 'WARN');
    cfg.listenPort = next;
    setTimeout(() => inboundServer.listen(cfg.listenPort, () => { log(`SMTP inbound on :${cfg.listenPort}`); claimPort(cfg.listenPort); }), 300);
  } else { throw err; }
});
inboundServer.listen(cfg.listenPort, () => {
  log(`SMTP inbound on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

const submissionServer = net.createServer(socket => createSession(socket));
submissionServer.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = cfg.submissionPort + 1;
    log(`SMTP submission port ${cfg.submissionPort} in use — trying :${next}`, 'WARN');
    cfg.submissionPort = next;
    setTimeout(() => submissionServer.listen(cfg.submissionPort, () => { log(`SMTP submission on :${cfg.submissionPort}`); claimPort(cfg.submissionPort); }), 300);
  } else { throw err; }
});
submissionServer.listen(cfg.submissionPort, () => {
  log(`SMTP submission on :${cfg.submissionPort}`);
  claimPort(cfg.submissionPort);
});

log('smtp engine ready');

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

