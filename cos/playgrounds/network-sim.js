/**
 * playgrounds/network-sim.js
 * COMPARTMENT OS — Simulated Network for Playgrounds (spec §67)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * SCOPE NOTE, flagged: spec describes 'simulated' mode as "fake DNS + HTTP
 * echo server" — real DNS interception for a child process would mean
 * rewriting /etc/hosts or running a custom resolver in front of the
 * process, both heavier and more fragile than what this phase needs.
 * What's built: a REAL local HTTP echo server (genuinely listens, really
 * echoes back method/path/headers/body as JSON) whose URL is injected
 * into the compartment's env as COS_SIM_NETWORK_URL. A compartment that
 * wants simulated network opts in by pointing its HTTP client at that
 * URL — there's no transparent interception of arbitrary outbound
 * requests. Honest middle ground: real server, opt-in routing.
 */

'use strict';

const http = require('http');

const _servers = new Map(); // playgroundId -> { server, port, requests: [] }

/**
 * Starts a local HTTP echo server for a playground's 'simulated' network
 * mode. Idempotent — calling twice for the same playgroundId returns the
 * existing server's info.
 * @param {string} playgroundId
 * @returns {Promise<{ url: string, port: number }>}
 */
function startEchoServer(playgroundId) {
  if (_servers.has(playgroundId)) {
    const existing = _servers.get(playgroundId);
    return Promise.resolve({ url: `http://127.0.0.1:${existing.port}`, port: existing.port });
  }

  return new Promise((resolve, reject) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const record = { method: req.method, path: req.url, headers: req.headers, body, ts: Date.now() };
        requests.push(record);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ echo: record }));
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      _servers.set(playgroundId, { server, port, requests });
      resolve({ url: `http://127.0.0.1:${port}`, port });
    });
  });
}

/**
 * @param {string} playgroundId
 * @returns {object[]} every request the echo server has recorded
 */
function getEchoServerLog(playgroundId) {
  const entry = _servers.get(playgroundId);
  return entry ? entry.requests : [];
}

/**
 * @param {string} playgroundId
 * @returns {Promise<void>}
 */
function stopEchoServer(playgroundId) {
  const entry = _servers.get(playgroundId);
  if (!entry) return Promise.resolve();
  _servers.delete(playgroundId);
  return new Promise((resolve) => entry.server.close(() => resolve()));
}

module.exports = {
  startEchoServer,
  getEchoServerLog,
  stopEchoServer,
};
