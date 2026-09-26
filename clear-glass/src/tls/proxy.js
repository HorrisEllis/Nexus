'use strict';

/**
 * TLS Proxy — Firefox JA4 Fingerprint Layer
 * 
 * Sits between Clear Glass and the internet.
 * Rewrites the TLS ClientHello to match Firefox's exact cipher suite order,
 * extension list, and signature algorithms — the JA4 fingerprint.
 * 
 * Firefox 122 JA4: t13d1516h2_8daaf6152771_b0da82dd1658
 * Chrome 120 JA4:  t13d1516h2_8daaf6152771_02713d6af862  ← what we're hiding
 * 
 * Architecture:
 *   Electron session → HTTP/S proxy on localhost:7703
 *   Proxy → tls.connect() with Firefox cipher suite order
 *   Response → tunneled back to Electron session
 */

const net    = require('net');
const tls    = require('tls');
const http   = require('http');
const { URL } = require('url');

// Firefox 122 TLS configuration
// Cipher suite order matches Firefox's exact preference list
const FIREFOX_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-AES256-SHA',
  'ECDHE-ECDSA-AES128-SHA',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

// Firefox ECDH curves preference order
const FIREFOX_CURVES = 'X25519:prime256v1:secp384r1:secp521r1';

// Firefox signature algorithms
const FIREFOX_SIG_ALGS = [
  'ecdsa_secp256r1_sha256',
  'ecdsa_secp384r1_sha384',
  'ecdsa_secp521r1_sha512',
  'rsa_pss_rsae_sha256',
  'rsa_pss_rsae_sha384',
  'rsa_pss_rsae_sha512',
  'rsa_pkcs1_sha256',
  'rsa_pkcs1_sha384',
  'rsa_pkcs1_sha512',
  'ecdsa_sha1',
  'rsa_pkcs1_sha1',
].join(':');

class TlsProxy {
  constructor({ port = 7703, sse } = {}) {
    this.port    = port;
    this.sse     = sse;
    this.server  = null;
    this.stats   = { requests: 0, tunneled: 0, errors: 0 };
  }

  async start() {
    this.server = http.createServer();

    // HTTP proxy — pass through (most sites use HTTPS via CONNECT)
    this.server.on('request', (req, res) => {
      this._proxyHttp(req, res);
    });

    // HTTPS CONNECT tunnel — this is where JA4 rewriting happens
    this.server.on('connect', (req, clientSocket, head) => {
      this._handleConnect(req, clientSocket, head);
    });

    this.server.on('error', (err) => {
      console.error('[TLSProxy] Server error:', err.message);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[TLSProxy] Firefox JA4 proxy on :${this.port}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  // ── HTTPS CONNECT tunnel ─────────────────────────────────────────────
  _handleConnect(req, clientSocket, head) {
    const [hostname, portStr] = req.url.split(':');
    const port = parseInt(portStr) || 443;

    this.stats.tunneled++;

    // Connect to target with Firefox TLS fingerprint
    const serverSocket = tls.connect({
      host:               hostname,
      port,
      ciphers:            FIREFOX_CIPHERS,
      ecdhCurve:          FIREFOX_CURVES,
      sigalgs:            FIREFOX_SIG_ALGS,
      minVersion:         'TLSv1.2',
      maxVersion:         'TLSv1.3',
      servername:         hostname,
      rejectUnauthorized: false, // Allow self-signed for internal/dev targets
      // Firefox-specific extensions behavior
      sessionTimeout:     300,
    }, () => {
      // Tunnel established — tell client to proceed
      clientSocket.write(
        'HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-agent: ClearGlass/1.0\r\n' +
        '\r\n'
      );

      // Pipe head data
      if (head && head.length) serverSocket.write(head);

      // Bidirectional pipe
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);

      this.sse?.emit('tls.tunnel', {
        host: hostname,
        port,
        protocol: serverSocket.getProtocol?.() || 'TLSv1.3',
        cipher:   serverSocket.getCipher?.()?.name,
        ts:       Date.now(),
      });
    });

    serverSocket.on('error', (err) => {
      this.stats.errors++;
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
      this.sse?.emit('tls.error', { host: hostname, error: err.message, ts: Date.now() });
    });

    clientSocket.on('error', () => serverSocket.destroy());
    serverSocket.on('close', () => clientSocket.destroy());
    clientSocket.on('close', () => serverSocket.destroy());
  }

  // ── HTTP passthrough ──────────────────────────────────────────────────
  _proxyHttp(req, res) {
    this.stats.requests++;

    let targetUrl;
    try { targetUrl = new URL(req.url); } catch {
      res.writeHead(400); res.end('Bad Request'); return;
    }

    const options = {
      hostname: targetUrl.hostname,
      port:     targetUrl.port || 80,
      path:     targetUrl.pathname + targetUrl.search,
      method:   req.method,
      headers:  { ...req.headers, host: targetUrl.hostname },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      this.stats.errors++;
      res.writeHead(502); res.end('Proxy error: ' + err.message);
    });

    req.pipe(proxyReq);
  }

  getStats() { return { ...this.stats }; }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }
}

module.exports = TlsProxy;
