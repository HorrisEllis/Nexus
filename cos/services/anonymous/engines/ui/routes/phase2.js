'use strict';
/**
 * engines/ui/routes/phase2.js — builder, SSH/SFTP, FTP, access logs.
 *
 * The builder upload endpoint takes a raw binary body rather than multipart:
 * the panel sends the file with fetch(file), which is one line on the client
 * and removes the need for a multipart parser here. Multipart exists to send
 * several fields at once; we are sending one file and passing its metadata
 * in the query string.
 */

const fs   = require('fs');
const path = require('path');
const { jsonR } = require('../lib/http');

const ROOT = process.env.NEXUS_ROOT || path.join(__dirname, '..', '..', '..');
const UPLOAD_DIR = path.join(ROOT, 'state', 'builder', 'uploads');
const MAX_UPLOAD = 268435456; // 256 MB — matches the builder engine's own cap

function readBinary(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('upload exceeds 256 MB')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = ({ ipcRequest, ipc }) => ({

  // ── builder ───────────────────────────────────────────────────────────────

  'POST /ui/builder/upload': async (req, res, { query }) => {
    const rawName = query.get('filename') || 'upload.zip';
    // Never trust an uploaded filename as a path component.
    const safe = path.basename(rawName).replace(/[^a-z0-9._-]/gi, '_');
    if (!/\.zip$/i.test(safe)) {
      return jsonR(res, 400, { error: 'only .zip archives are accepted' });
    }

    let body;
    try { body = await readBinary(req, MAX_UPLOAD); }
    catch (e) { return jsonR(res, 413, { error: e.message }); }

    if (!body.length) return jsonR(res, 400, { error: 'empty upload' });
    // A zip always starts with PK\x03\x04 (or PK\x05\x06 for an empty one).
    if (!(body[0] === 0x50 && body[1] === 0x4b)) {
      return jsonR(res, 400, { error: 'that file is not a zip archive' });
    }

    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const stored = `${Date.now().toString(36)}-${safe}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), body);

      const r = await ipcRequest('builder', 'builder:analyse',
        { archivePath: stored, filename: safe }, 120000);
      if (r.error) return jsonR(res, 400, r);
      return jsonR(res, 201, r);
    } catch (e) {
      return jsonR(res, 502, { error: `builder did not answer: ${e.message}` });
    }
  },

  'POST /ui/builder/build': async (req, res, { body }) => {
    if (!body.buildId) return jsonR(res, 400, { error: 'buildId is required' });
    if (!body.domain)  return jsonR(res, 400, { error: 'domain is required' });
    try {
      const r = await ipcRequest('builder', 'builder:build', body, 15000);
      if (r.error) return jsonR(res, 400, r);
      return jsonR(res, 202, r);
    } catch (e) {
      return jsonR(res, 502, { error: `builder did not answer: ${e.message}` });
    }
  },

  'GET /ui/builder/status/:buildId': async (req, res, { params, query }) => {
    try {
      const r = await ipcRequest('builder', 'builder:status', {
        buildId: params.buildId, since: parseInt(query.get('since'), 10) || 0,
      }, 8000);
      return jsonR(res, r.error ? 404 : 200, r);
    } catch (e) {
      return jsonR(res, 502, { error: e.message });
    }
  },

  'GET /ui/builder/list': async (req, res) => {
    try { return jsonR(res, 200, await ipcRequest('builder', 'builder:list', {})); }
    catch (e) { return jsonR(res, 200, { builds: [], error: e.message }); }
  },

  'POST /ui/builder/cancel': async (req, res, { body }) => {
    try { return jsonR(res, 200, await ipcRequest('builder', 'builder:cancel', body)); }
    catch (e) { return jsonR(res, 502, { error: e.message }); }
  },

  // ── ssh ───────────────────────────────────────────────────────────────────

  'GET /ui/ssh/status': async (req, res) => {
    try { return jsonR(res, 200, await ipcRequest('ssh', 'ssh:status', {}, 15000)); }
    catch (e) { return jsonR(res, 200, { installed: false, error: e.message }); }
  },

  'POST /ui/ssh/install': async (req, res) => {
    try { return jsonR(res, 200, await ipcRequest('ssh', 'ssh:install', {}, 180000)); }
    catch (e) { return jsonR(res, 502, { error: `ssh install did not complete: ${e.message}` }); }
  },

  'POST /ui/ssh/start': async (req, res) => {
    try { return jsonR(res, 200, await ipcRequest('ssh', 'ssh:start', {}, 30000)); }
    catch (e) { return jsonR(res, 502, { error: e.message }); }
  },

  'POST /ui/ssh/stop': async (req, res) => {
    try { return jsonR(res, 200, await ipcRequest('ssh', 'ssh:stop', {}, 30000)); }
    catch (e) { return jsonR(res, 502, { error: e.message }); }
  },

  'POST /ui/ssh/key': async (req, res, { body }) => {
    const pubkey = String(body.pubkey || '').trim();
    if (!pubkey) return jsonR(res, 400, { error: 'pubkey is required' });
    if (!/^(ssh-rsa|ssh-ed25519|ecdsa-sha2-)/.test(pubkey)) {
      return jsonR(res, 400, {
        error: 'that does not look like an OpenSSH public key — it should begin '
             + 'with ssh-ed25519, ssh-rsa or ecdsa-sha2-',
      });
    }
    try { return jsonR(res, 201, await ipcRequest('ssh', 'ssh:addkey', { pubkey }, 15000)); }
    catch (e) { return jsonR(res, 502, { error: e.message }); }
  },

  // ── ftp ───────────────────────────────────────────────────────────────────

  'GET /ui/ftp/info': async (req, res) => {
    try { return jsonR(res, 200, await ipcRequest('ftp', 'ftp:info', {}, 8000)); }
    catch (e) { return jsonR(res, 200, { error: e.message }); }
  },

  'GET /ui/ftp/users': async (req, res) => {
    try { return jsonR(res, 200, await ipcRequest('ftp', 'ftp:users:list', {}, 8000)); }
    catch (e) { return jsonR(res, 200, { users: [], error: e.message }); }
  },

  'POST /ui/ftp/users': async (req, res, { body }) => {
    if (!body.username) return jsonR(res, 400, { error: 'username is required' });
    try { return jsonR(res, 201, await ipcRequest('ftp', 'ftp:users:create', body, 10000)); }
    catch (e) { return jsonR(res, 502, { error: e.message }); }
  },

  'DELETE /ui/ftp/users': async (req, res, { body }) => {
    if (!body.username) return jsonR(res, 400, { error: 'username is required' });
    try { return jsonR(res, 200, await ipcRequest('ftp', 'ftp:users:delete', body, 10000)); }
    catch (e) { return jsonR(res, 502, { error: e.message }); }
  },

  // ── per-vhost access log ──────────────────────────────────────────────────

  'GET /ui/webserver/accesslog/:hostname': async (req, res, { params, query }) => {
    try {
      const r = await ipcRequest('webserver', 'webserver:accesslog', {
        hostname: decodeURIComponent(params.hostname),
        lines: parseInt(query.get('lines'), 10) || 200,
      }, 10000);
      return jsonR(res, 200, r);
    } catch (e) {
      return jsonR(res, 200, { lines: [], error: e.message });
    }
  },
});
