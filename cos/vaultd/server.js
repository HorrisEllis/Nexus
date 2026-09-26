/**
 * vaultd/server.js
 * COMPARTMENT OS — vaultd HTTP Server (spec §66)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Runs as its OWN process (spawned by vaultd/daemon.js), not inside the
 * normal `cos` CLI process. Exposes a real local HTTP API over the SAME
 * vault data the embedded vault uses — points at the real
 * COS_VAULT_STORE_FILE / COS_VAULT_KEY_FILE / COS_STATE_FILE /
 * COS_MAP_FILE unless overridden — so secrets set through vaultd and
 * secrets set through `cos vault set` are the same secrets, satisfying
 * spec's "vaultd state is visible whether running or not" framing: it's
 * not a second vault, it's the same one with a second access path.
 *
 * Routes (all JSON, localhost-only):
 *   POST   /secrets                              { compartmentName, key, value, scope? }
 *   GET    /secrets/:compartmentName/:key         ?reveal=true
 *   GET    /secrets/:compartmentName
 *   DELETE /secrets/:compartmentName/:key
 *   POST   /grant                                 { fromCompartmentName, toCompartmentName, key }
 *   POST   /revoke                                { fromCompartmentName, toCompartmentName, key }
 *   GET    /status                                 — health + counts
 *
 * This process does not spawn or manage COS compartments — it only
 * reads/writes the shared store+sysmap+vault files, same as the
 * embedded vault gates do. No compartment lifecycle logic lives here.
 */

'use strict';

const http = require('http');
const { URL } = require('url');

const { StateStore } = require('../host/state-store.js');
const { SystemMap } = require('../host/system-map.js');
const {
  setSecret, getSecret, listSecrets, deleteSecret, grantAccess, revokeAccess,
} = require('../vault/index.js');

/**
 * @param {{ port: number, stateFile?: string, mapFile?: string, vaultOpts?: object }} opts
 * @returns {http.Server}
 */
function createVaultdServer(opts) {
  const store = new StateStore(opts.stateFile);
  const sysmap = new SystemMap({ mapFile: opts.mapFile });

  // vaultd has no event bus of its own to drive compartment lifecycle —
  // it only needs store+sysmap+vaultOpts, which is everything
  // vault/index.js's functions actually read.
  const pseudoHost = { store, sysmap, vaultOpts: opts.vaultOpts || {} };

  /**
   * Reloads store+sysmap from disk before handling a request. Found by
   * testing: without this, vaultd loaded its in-memory state ONCE at
   * process startup and never saw changes made by ANY other writer
   * (the normal `cos` CLI process, or a second vaultd client) — breaking
   * the core promise that vaultd shares the same live vault data as the
   * embedded vault. JSON file reads are cheap; correctness here matters
   * more than the minor per-request IO cost.
   */
  function reloadState() {
    store.load();
    sysmap.load();
  }

  const startedAt = Date.now();
  let requestCount = 0;

  function sendJson(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        if (!data) return resolve({});
        try { resolve(JSON.parse(data)); }
        catch (err) { reject(err); }
      });
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    requestCount++;
    reloadState();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // GET /status
      if (req.method === 'GET' && parts[0] === 'status') {
        const map = sysmap.get();
        return sendJson(res, 200, {
          running: true,
          pid: process.pid,
          uptime: Date.now() - startedAt,
          secretCount: map.vaultKeys.length,
          grantCount: map.vaultKeys.reduce((sum, k) => sum + k.grants.length, 0),
          tpmBound: false, // TPM binding deferred — see vault/crypto.js
          lastAccess: requestCount > 1 ? Date.now() : null,
        });
      }

      // POST /secrets
      if (req.method === 'POST' && parts[0] === 'secrets' && parts.length === 1) {
        const body = await readBody(req);
        const record = setSecret(pseudoHost, body);
        return sendJson(res, 200, { record });
      }

      // GET /secrets/:compartmentName/:key
      if (req.method === 'GET' && parts[0] === 'secrets' && parts.length === 3) {
        const [, compartmentName, key] = parts;
        const reveal = url.searchParams.get('reveal') === 'true';
        const result = getSecret(pseudoHost, { compartmentName, key, reveal });
        if (!result.record) return sendJson(res, 404, { error: `key "${key}" not found` });
        if (result.denied) return sendJson(res, 403, { error: 'access denied' });
        return sendJson(res, 200, result);
      }

      // GET /secrets/:compartmentName
      if (req.method === 'GET' && parts[0] === 'secrets' && parts.length === 2) {
        const records = listSecrets(pseudoHost, parts[1]);
        return sendJson(res, 200, { records });
      }

      // DELETE /secrets/:compartmentName/:key
      if (req.method === 'DELETE' && parts[0] === 'secrets' && parts.length === 3) {
        const [, compartmentName, key] = parts;
        const record = deleteSecret(pseudoHost, { compartmentName, key });
        return sendJson(res, 200, { record });
      }

      // POST /grant
      if (req.method === 'POST' && parts[0] === 'grant') {
        const body = await readBody(req);
        const record = grantAccess(pseudoHost, body);
        return sendJson(res, 200, { record });
      }

      // POST /revoke
      if (req.method === 'POST' && parts[0] === 'revoke') {
        const body = await readBody(req);
        const record = revokeAccess(pseudoHost, body);
        return sendJson(res, 200, { record });
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  return server;
}

// Allow running directly: `node vaultd/server.js <port> <stateFile> <mapFile>`
// — exactly how vaultd/daemon.js spawns it as a detached child.
if (require.main === module) {
  // §BUGFIX 2026-07-04: was defaulting to 3750 — the same port sovereign
  // copilot runs on (copilot/server.js, confirmed this session). Two real
  // services claiming the same default port. Moved to 3760, matching what
  // other generated systems (e.g. clearglass-accounts, built via
  // loom/templates/system-scaffold.js) already assume vaultd's port to be.
  const requestedPort = parseInt(process.argv[2], 10) || 3760;
  const stateFile = process.argv[3] || undefined;
  const mapFile = process.argv[4] || undefined;
  const server = createVaultdServer({ port: requestedPort, stateFile, mapFile });
  server.listen(requestedPort, '127.0.0.1', () => {
    // Report the ACTUAL bound port, not the requested one — if 0 was
    // requested (ephemeral/OS-assigned), echoing back 0 would be
    // useless to the parent process waiting on this line.
    const actualPort = server.address().port;
    console.log(`VAULTD_READY ${actualPort}`);
  });
}

module.exports = { createVaultdServer };
