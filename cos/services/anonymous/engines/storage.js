'use strict';
/**
 * engines/storage.js — object storage
 * anonymousservers.info
 *
 * S3-compatible API (subset). No AWS SDK needed — works with any S3 client
 * pointed at this server. Buckets are just directories. Objects are files.
 *
 * Endpoints:
 *   PUT    /bucket                    create bucket
 *   DELETE /bucket                    delete bucket
 *   GET    /bucket                    list objects
 *   PUT    /bucket/key                upload object
 *   GET    /bucket/key                download object
 *   DELETE /bucket/key                delete object
 *   POST   /bucket/key?sign           generate presigned GET URL
 *   GET    /__signed/:token           serve presigned URL
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const ROOT        = process.env.NEXUS_ROOT || path.join(__dirname, '..');
const BUCKET_DIR  = path.join(ROOT, 'state', 'buckets');

const DEFAULTS = {
  listenPort:     9100,
  maxFileSizeMb:  500,
  publicBuckets:  [],
  signedUrlTtlMs: 3600000, // 1 hour
};

if (isInit()) {
  conf.init(DEFAULTS);
  fs.mkdirSync(BUCKET_DIR, { recursive: true });
  log('storage: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);
fs.mkdirSync(BUCKET_DIR, { recursive: true });

// ─── signed URL store (in-memory, short-lived) ────────────────────────────────

const signedTokens = new Map(); // token -> { bucket, key, expiresAt }

function createSignedUrl(bucket, key, ttlMs) {
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (ttlMs || cfg.signedUrlTtlMs);
  signedTokens.set(token, { bucket, key, expiresAt });
  return token;
}

// clean expired tokens every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [t, v] of signedTokens) {
    if (v.expiresAt < now) signedTokens.delete(t);
  }
}, 600000);

// ─── tenant scoping ───────────────────────────────────────────────────────────

function bucketPath(tenantId, bucket) {
  const safe = bucket.replace(/[^a-z0-9-]/g, '-').toLowerCase();
  return path.join(BUCKET_DIR, tenantId || 'default', safe);
}

function objectPath(tenantId, bucket, key) {
  // prevent traversal
  const safeBucket = bucket.replace(/[^a-z0-9-]/g, '-').toLowerCase();
  const safeKey    = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
  return path.join(BUCKET_DIR, tenantId || 'default', safeBucket, safeKey);
}

function getTenantId(req) {
  return req.headers['x-tenant-id'] || 'default';
}

function isPublic(tenantId, bucket) {
  return cfg.publicBuckets.includes(`${tenantId}/${bucket}`) ||
         cfg.publicBuckets.includes(bucket);
}

// ─── multipart body reader ────────────────────────────────────────────────────

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const maxBytes = (cfg.maxFileSizeMb || 500) * 1048576;
    req.on('data', d => {
      size += d.length;
      if (size > maxBytes) { req.destroy(); reject(new Error('file too large')); return; }
      chunks.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function xml(res, status, str) {
  res.writeHead(status, { 'Content-Type': 'application/xml' });
  res.end(str);
}

const server = http.createServer(async (req, res) => {
  const method   = req.method;
  const tenantId = getTenantId(req);
  const parts    = req.url.split('?');
  const urlPath  = parts[0].replace(/^\//, '');
  const query    = parts[1] || '';
  const segments = urlPath.split('/').filter(Boolean);

  try {
    // ── presigned URL serve ──────────────────────────────────────────────────
    if (method === 'GET' && segments[0] === '__signed') {
      const token = segments[1];
      const entry = signedTokens.get(token);
      if (!entry || Date.now() > entry.expiresAt) return json(res, 403, { error: 'expired or invalid token' });
      const fp = objectPath(entry.bucket.split('/')[0], entry.bucket.split('/')[1] || entry.bucket, entry.key);
      if (!fs.existsSync(fp)) return json(res, 404, { error: 'not found' });
      const stat = fs.statSync(fp);
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Disposition': `inline; filename="${path.basename(entry.key)}"` });
      fs.createReadStream(fp).pipe(res);
      return;
    }

    const bucket = segments[0];
    const key    = segments.slice(1).join('/');

    if (!bucket) return json(res, 400, { error: 'bucket required' });

    // ── create bucket ────────────────────────────────────────────────────────
    if (method === 'PUT' && !key) {
      const bp = bucketPath(tenantId, bucket);
      fs.mkdirSync(bp, { recursive: true });
      fs.writeFileSync(path.join(bp, '.meta'), JSON.stringify({ tenantId, bucket, createdAt: Date.now() }));
      await ipc.db.insert('buckets', { tenantId, bucket, createdAt: Date.now() }).catch(() => {});
      log(`bucket created: ${tenantId}/${bucket}`);
      return xml(res, 200, `<?xml version="1.0"?><CreateBucketConfiguration/>`);
    }

    // ── delete bucket ────────────────────────────────────────────────────────
    if (method === 'DELETE' && !key) {
      const bp = bucketPath(tenantId, bucket);
      if (!fs.existsSync(bp)) return json(res, 404, { error: 'bucket not found' });
      fs.rmSync(bp, { recursive: true, force: true });
      await ipc.db.delete('buckets', `r => r.tenantId === '${tenantId}' && r.bucket === '${bucket}'`).catch(() => {});
      log(`bucket deleted: ${tenantId}/${bucket}`);
      return xml(res, 204, '');
    }

    // ── list objects ─────────────────────────────────────────────────────────
    if (method === 'GET' && !key) {
      const bp = bucketPath(tenantId, bucket);
      if (!fs.existsSync(bp)) return json(res, 404, { error: 'bucket not found' });
      const files = [];
      function walk(dir, prefix = '') {
        for (const f of fs.readdirSync(dir)) {
          if (f === '.meta') continue;
          const full = path.join(dir, f);
          if (fs.statSync(full).isDirectory()) walk(full, prefix + f + '/');
          else {
            const stat = fs.statSync(full);
            files.push({ key: prefix + f, size: stat.size, lastModified: stat.mtime.toISOString() });
          }
        }
      }
      walk(bp);
      const items = files.map(f => `<Contents><Key>${f.key}</Key><Size>${f.size}</Size><LastModified>${f.lastModified}</LastModified></Contents>`).join('');
      return xml(res, 200, `<?xml version="1.0"?><ListBucketResult><Name>${bucket}</Name>${items}</ListBucketResult>`);
    }

    // ── upload object ─────────────────────────────────────────────────────────
    if (method === 'PUT' && key) {
      const op = objectPath(tenantId, bucket, key);
      fs.mkdirSync(path.dirname(op), { recursive: true });
      const data = await readRawBody(req);
      fs.writeFileSync(op, data);
      const etag = crypto.createHash('md5').update(data).digest('hex');
      await ipc.db.insert('objects', { tenantId, bucket, key, size: data.length, etag, ts: Date.now() }).catch(() => {});
      res.writeHead(200, { 'ETag': `"${etag}"` });
      res.end();
      log(`upload: ${tenantId}/${bucket}/${key} (${data.length} bytes)`);
      return;
    }

    // ── download object ───────────────────────────────────────────────────────
    if (method === 'GET' && key) {
      const op = objectPath(tenantId, bucket, key);
      if (!fs.existsSync(op)) return json(res, 404, { error: 'not found' });
      // check access
      if (!isPublic(tenantId, bucket)) {
        const auth = req.headers.authorization;
        if (!auth) return json(res, 403, { error: 'forbidden' });
        // full auth check via auth engine IPC — simplified here
      }
      const stat = fs.statSync(op);
      const ext  = path.extname(key).toLowerCase();
      const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf', '.txt': 'text/plain', '.json': 'application/json', '.mp4': 'video/mp4' };
      res.writeHead(200, {
        'Content-Length':       stat.size,
        'Content-Type':         MIME[ext] || 'application/octet-stream',
        'Cache-Control':        'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(op).pipe(res);
      return;
    }

    // ── delete object ─────────────────────────────────────────────────────────
    if (method === 'DELETE' && key) {
      const op = objectPath(tenantId, bucket, key);
      if (!fs.existsSync(op)) return json(res, 404, { error: 'not found' });
      fs.unlinkSync(op);
      await ipc.db.delete('objects', `r => r.tenantId === '${tenantId}' && r.bucket === '${bucket}' && r.key === '${key}'`).catch(() => {});
      res.writeHead(204); res.end();
      return;
    }

    // ── presign ───────────────────────────────────────────────────────────────
    if (method === 'POST' && query.includes('sign')) {
      const ttlMs = parseInt(new URL(`http://x?${query}`).searchParams.get('ttl')) || cfg.signedUrlTtlMs;
      const token = createSignedUrl(`${tenantId}/${bucket}`, key, ttlMs);
      return json(res, 200, { url: `/__signed/${token}`, expiresIn: Math.floor(ttlMs / 1000) });
    }

    json(res, 405, { error: 'method not allowed' });

  } catch (e) {
    log(`storage error: ${e.message}`, 'ERROR');
    json(res, 500, { error: e.message });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`storage engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('storage:sign', payload => {
  const { tenantId, bucket, key, ttlMs, requestId } = payload || {};
  const token = createSignedUrl(`${tenantId}/${bucket}`, key, ttlMs);
  ipc.send('storage:signed', { requestId, token, url: `/__signed/${token}` });
});

ipc.on('storage:usage', async payload => {
  const { tenantId, requestId } = payload || {};
  const rows = await ipc.db.query('objects', `r => r.tenantId === '${tenantId}'`).catch(() => []);
  const total = rows.reduce((acc, r) => acc + (r.size || 0), 0);
  ipc.send('storage:usage:reply', { requestId, tenantId, bytes: total, objects: rows.length });
});

log('storage engine ready');

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

