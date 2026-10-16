'use strict';
/**
 * tests/modules/test-tls-layer.test.js — TL1–TL3 (docs/2026-10-16-tls-layer-phasemap.spec), 0.60.109.
 * James: "fix it. i don't want the trouble again" — the Node TLS proxy (TLS inside TLS, no site could load) replaced by
 * cg-tls-helper (Go + uTLS): a Firefox persona is Firefox in its TLS handshake too, and the layer is never why a site fails.
 *
 *   TL-01  the prebuilt binary is found for this machine; an unknown platform is null, not a guess
 *   TL-02  the REAL binary, end to end through Node: CONNECT → a site with its own certificate → the page comes back
 *          through the helper's CA; the helper's CA is kept across restarts
 *   TL-03  never an orphan: the helper exits when Clear Glass's end of its stdin closes; stop() stops it
 *   TL-04  never the reason a site fails: a missing binary is 'unavailable' with a reason (no throw); a crash restarts
 *   TL-05  trust: only certificates THIS CA issued are trusted (0); everything else goes to Chromium's own check (-3)
 *   TL-06  the PAC: a Firefox persona's direct https/wss go through the layer with DIRECT after; http, localhost, a
 *          person's own proxy and a non-persona session do not; the layer down → no layer
 *   TL-07  wired: personas register as firefox and trust the CA; Clear Glass boots the helper (not the Node proxy) and
 *          stops it at shutdown
 * The Go side has its own tests (clear-glass/tls-helper: go test — the site sees Firefox's ClientHello, h2, bad
 * certificates refused, the standard-TLS retry).
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const tls = require('tls');
const https = require('https');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '../..');
const H = require(path.join(ROOT, 'clear-glass/src/tls/helper.js'));
const P = require(path.join(ROOT, 'clear-glass/src/net/policy.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { const r = await fn(); if (r === 'skip') { skipped++; return; } console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** a GET through the helper: CONNECT, then TLS to the helper's leaf (trusting the helper's CA), then HTTP/1.1 */
function viaHelper(port, host, sitePort, caPem) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(`CONNECT ${host}:${sitePort} HTTP/1.1\r\nHost: ${host}:${sitePort}\r\n\r\n`));
    let head = '';
    sock.on('error', reject);
    const onData = (d) => {
      head += d.toString('latin1');
      if (!head.includes('\r\n\r\n')) return;
      sock.removeListener('data', onData);
      if (!/^HTTP\/1\.1 200/.test(head)) return reject(new Error(`CONNECT: ${head.split('\r\n')[0]}`));
      const t = tls.connect({ socket: sock, servername: host, ca: caPem, ALPNProtocols: ['http/1.1'] }, () => t.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
      let body = ''; t.on('data', (x) => { body += x; }); t.on('end', () => resolve({ body, alpn: t.alpnProtocol, issuer: t.getPeerCertificate().issuer })); t.on('error', reject);
    };
    sock.on('data', onData);
  });
}

(async () => {
  const bin = H.binaryPath();
  await test('TL-01', 'the prebuilt binary for this machine is found; an unknown platform is null', async () => {
    assert.ok(bin && fs.existsSync(bin), `no binary for ${process.platform}-${process.arch}`);
    assert.ok(fs.existsSync(path.join(H.BIN_ROOT, 'windows-amd64', 'cg-tls-helper.exe')), 'the Windows binary James runs is committed');
    assert.strictEqual(H.binaryPath('aix', 'ppc64'), null);
    const sums = fs.readFileSync(path.join(H.BIN_ROOT, 'SHA256SUMS'), 'utf8');
    const crypto = require('crypto');
    for (const l of sums.trim().split('\n')) { const [sha, rel] = l.split('  '); assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(H.BIN_ROOT, rel))).digest('hex'), sha, `${rel} matches SHA256SUMS`); }
  });

  // a site with its own certificate (openssl), trusted by the helper through -upstream-ca
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tls-layer-'));
  let site = null, sitePort = 0, siteCert = null;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem')], { stdio: 'ignore' });
    siteCert = path.join(tmp, 'c.pem');
    site = https.createServer({ key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(siteCert) }, (q, s) => s.end(`hello from the site (${q.socket.alpnProtocol || 'no alpn'})`));
    await new Promise(r => site.listen(0, '127.0.0.1', r)); sitePort = site.address().port;
  } catch (e) { console.log(`  - TL-02 SKIPPED: openssl could not make the site's certificate (${e.message.split('\n')[0]})`); }

  const dir = path.join(tmp, 'ca');
  await test('TL-02', 'the real binary end to end: CONNECT → the site → the page, through the helper\'s CA; the CA kept across restarts', async () => {
    if (!site) { skipped++; return 'skip'; }
    const port = await freePort();
    const h = new H.TlsHelper({ port, dir, upstreamCa: siteCert, log: () => {} });
    const st = await h.start();
    assert.strictEqual(st.state, 'running', JSON.stringify(st));
    assert.ok(/BEGIN CERTIFICATE/.test(h.caPem) && /^[0-9a-f]{64}$/.test(h.caFingerprint));
    // the site resolves as "localhost" for the helper (it dials localhost:sitePort and verifies the site's certificate for it)
    const r = await viaHelper(port, 'localhost', sitePort, h.caPem);
    assert.ok(/hello from the site \(http\/1\.1\)/.test(r.body), r.body);
    assert.strictEqual(r.issuer.CN, 'Clear Glass local TLS layer', 'the browser side saw the helper\'s certificate');
    const fp = h.caFingerprint;
    h.stop(); await wait(300);
    const h2 = new H.TlsHelper({ port, dir, upstreamCa: siteCert, log: () => {} });
    await h2.start();
    assert.strictEqual(h2.caFingerprint, fp, 'the same CA after a restart (the sessions\' trust does not change under them)');
    // a site whose certificate the helper cannot verify is refused, not passed
    const h3port = await freePort();
    const h3 = new H.TlsHelper({ port: h3port, dir: path.join(tmp, 'ca3'), log: () => {} });
    await h3.start();
    await assert.rejects(viaHelper(h3port, 'localhost', sitePort, h3.caPem), 'an unverifiable site is refused');
    h2.stop(); h3.stop(); await wait(200);
  });

  await test('TL-03', 'never an orphan: the helper exits when its stdin closes; stop() stops it', async () => {
    const port = await freePort();
    const p = spawn(bin, ['-listen', `127.0.0.1:${port}`, '-ca-dir', path.join(tmp, 'ca4'), '-exit-with-parent'], { stdio: ['pipe', 'pipe', 'pipe'] });
    await new Promise(r => p.stdout.once('data', r));
    const exited = new Promise(r => p.on('exit', (code) => r(code)));
    p.stdin.end();
    const code = await Promise.race([exited, wait(4000).then(() => 'still running')]);
    assert.strictEqual(code, 0, `the helper outlived its parent's pipe: ${code}`);
    const h = new H.TlsHelper({ port: await freePort(), dir: path.join(tmp, 'ca5'), log: () => {} });
    await h.start(); assert.strictEqual(h.state, 'running');
    h.stop(); await wait(300);
    assert.strictEqual(h.state, 'stopped');
  });

  await test('TL-04', 'never the reason a site fails: no binary → unavailable with a reason; a crash restarts it', async () => {
    const none = new H.TlsHelper({ bin: null, log: () => {} });
    const st = await none.start();
    assert.ok(st.state === 'unavailable' && /no cg-tls-helper binary/.test(st.why) && /not routed/.test(st.why), JSON.stringify(st));
    const logs = [];
    const h = new H.TlsHelper({ port: await freePort(), dir: path.join(tmp, 'ca6'), log: (m) => logs.push(m) });
    await h.start();
    const states = []; h.on('state', (s) => states.push(s.state));
    h.proc.kill('SIGKILL');
    for (let i = 0; i < 40 && !states.includes('stopped'); i++) await wait(50);    // the crash is seen first
    for (let i = 0; i < 60 && h.state !== 'running'; i++) await wait(100);
    assert.ok(states.includes('stopped') && h.state === 'running' && logs.some(l => /restarting \(1\/5/.test(l)), `${states} ${h.state} ${logs}`);
    h.stop(); await wait(200);
  });

  await test('TL-05', 'trust: only this CA\'s certificates are trusted; everything else goes to Chromium\'s own check', async () => {
    const ca = '-----BEGIN CERTIFICATE-----\nAAAA\nBBBB\n-----END CERTIFICATE-----\n';
    assert.ok(H.issuedByUs({ issuerCert: { data: ca.replace(/\n/g, '\r\n') } }, ca), 'the same CA, line endings aside');
    assert.ok(!H.issuedByUs({ issuerCert: { data: '-----BEGIN CERTIFICATE-----\nCCCC\n-----END CERTIFICATE-----' } }, ca));
    assert.ok(!H.issuedByUs({}, ca) && !H.issuedByUs({ issuerCert: { data: ca } }, null));
    const got = []; const cb = (v) => got.push(v);
    H.verifyProc(() => ({ state: 'running', caPem: ca }))({ certificate: { issuerCert: { data: ca } } }, cb);
    H.verifyProc(() => ({ state: 'running', caPem: ca }))({ certificate: { issuerCert: { data: 'other' } } }, cb);
    H.verifyProc(() => ({ state: 'failed', caPem: ca }))({ certificate: { issuerCert: { data: ca } } }, cb);
    H.verifyProc(() => null)({ certificate: {} }, cb);
    assert.deepStrictEqual(got, [0, -3, -3, -3], 'ours → 0; anything else, or the layer down → Chromium decides (-3)');
  });

  await test('TL-06', 'the PAC: a persona\'s direct https/wss through the layer, DIRECT after; nothing else changes', async () => {
    const run = (pac, u) => new Function(`${pac}; return FindProxyForURL;`)()(u, new URL(u).hostname);
    const pac = P.pacFor({ default: 'direct', rules: [{ id: 'mine', match: { origin: 'proxied.example' }, via: 'http://10.0.0.1:8080' }] }, { firefox: true }, {}, { tlsPort: 7703 });
    assert.strictEqual(run(pac, 'https://www.fiverr.com/'), 'PROXY 127.0.0.1:7703; DIRECT');
    assert.strictEqual(run(pac, 'wss://chat.example/ws'), 'PROXY 127.0.0.1:7703; DIRECT');
    assert.strictEqual(run(pac, 'https://accounts.google.com/'), 'PROXY 127.0.0.1:7703; DIRECT', 'Google sign-in in a persona: Firefox all the way down');
    assert.strictEqual(run(pac, 'http://plain.example/'), 'DIRECT');
    assert.strictEqual(run(pac, 'http://127.0.0.1:7799/'), 'DIRECT');
    assert.strictEqual(run(pac, 'https://proxied.example/'), 'PROXY 10.0.0.1:8080', 'a person\'s own proxy keeps its route');
    assert.strictEqual(P.pacFor({ default: 'direct', rules: [] }, { firefox: false }, {}, { tlsPort: 7703 }), null, 'a Chromium-UA session is not touched');
    assert.strictEqual(P.pacFor({ default: 'direct', rules: [] }, { firefox: true }, {}, { tlsPort: null }), null, 'the layer down: nothing routed');
    const tor = P.pacFor({ default: 'transport', rules: [] }, { firefox: true }, { socksPort: 9050 }, { tlsPort: 7703 });
    assert.strictEqual(run(tor, 'https://x.example/'), 'SOCKS5 127.0.0.1:9050', 'the transport keeps its route');
    const { NetService } = require(path.join(ROOT, 'clear-glass/src/net/service.js'));
    const svc = new NetService({ store: { get: () => null, set: () => {} }, log: () => {} });
    const set = []; const ses = { setProxy: async (c) => { set.push(c.mode); } };
    await svc.register('persist:agent-a', ses, { firefox: true });
    assert.deepStrictEqual(set, [], 'registered with the layer down: untouched');
    await svc.setTlsLayer(7703);
    assert.deepStrictEqual(set, ['pac_script'], 'the layer up: the persona is routed');
    await svc.setTlsLayer(null);
    assert.deepStrictEqual(set, ['pac_script', 'system'], 'the layer down again: routing cleared');
  });

  await test('TL-07', 'wired: personas register as firefox and trust the CA; Clear Glass boots the helper and stops it', async () => {
    const mgr = fs.readFileSync(path.join(ROOT, 'clear-glass/src/contexts/manager.js'), 'utf8');
    assert.ok(/ses\.setCertificateVerifyProc\(require\('\.\.\/tls\/helper'\)\.verifyProc\(\)\)/.test(mgr) && /caller: 'person-tab', firefox \}/.test(mgr));
    const main = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
    assert.ok(/new TlsHelper\(\{ port: TLS_PORT \}\)/.test(main) && !/new TlsProxy\(/.test(main), 'the helper, not the Node proxy');
    assert.ok(/setTlsLayer\(st\.state === 'running' \? st\.port : null\)/.test(main) && /require\('\.\.\/tls\/helper'\)\.current\(\); if \(t\) t\.stop\(\)/.test(main));
    assert.ok(/SUPERSEDED 2026-10-16/.test(fs.readFileSync(path.join(ROOT, 'clear-glass/src/tls/proxy.js'), 'utf8')), 'the Node proxy is kept, marked superseded');
  });

  if (site) site.close();
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
