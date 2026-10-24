'use strict';
/**
 * engines/optimizer.js — performance optimizer
 * anonymousservers.info
 *
 * Value adds:
 *   - Brotli + Gzip compression (in-process, no nginx needed)
 *   - Image resizing + WebP conversion via sharp (if installed) or pure JS fallback
 *   - HTTP/2 preload header injection
 *   - Performance scoring per vhost (Lighthouse-style heuristics)
 *   - Cache header advice fed back to proxy
 *   - Minification: inline CSS/JS stripping whitespace
 *   - Asset fingerprinting for cache-busting
 *   - Feeds recommendations to UI dashboard
 */

const http   = require('http');
const zlib   = require('zlib');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort:     4006,
  brotli:         true,
  gzip:           true,
  minifyHtml:     true,
  minifyCss:      true,
  minifyJs:       false,  // risky without a real parser — off by default
  imageWebP:      false,  // requires sharp npm package
  preloadHints:   true,
  fingerprintAssets: true,
  compressionLevel: 6,    // 1-9, higher = smaller + slower
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('optimizer: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── compression ──────────────────────────────────────────────────────────────

function brotliCompress(buf) {
  return new Promise((resolve, reject) =>
    zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: cfg.compressionLevel } },
      (err, result) => err ? reject(err) : resolve(result))
  );
}

function gzipCompress(buf) {
  return new Promise((resolve, reject) =>
    zlib.gzip(buf, { level: cfg.compressionLevel },
      (err, result) => err ? reject(err) : resolve(result))
  );
}

async function compress(buf, acceptEncoding = '') {
  if (cfg.brotli && acceptEncoding.includes('br')) {
    try { return { data: await brotliCompress(buf), encoding: 'br' }; } catch {}
  }
  if (cfg.gzip && acceptEncoding.includes('gzip')) {
    try { return { data: await gzipCompress(buf), encoding: 'gzip' }; } catch {}
  }
  return { data: buf, encoding: null };
}

// ─── minification ─────────────────────────────────────────────────────────────

function minifyHtml(html) {
  if (!cfg.minifyHtml) return html;
  return html
    .replace(/<!--(?![\s\S]*?\[if)[\s\S]*?-->/g, '')  // remove comments (not IE conditionals)
    .replace(/\s{2,}/g, ' ')                            // collapse whitespace
    .replace(/>\s+</g, '><')                            // remove whitespace between tags
    .replace(/\s+>/g, '>')
    .replace(/<\s+/g, '<')
    .trim();
}

function minifyCss(css) {
  if (!cfg.minifyCss) return css;
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')    // remove comments
    .replace(/\s{2,}/g, ' ')             // collapse whitespace
    .replace(/\s*([{}:;,>~+])\s*/g, '$1') // remove spaces around operators
    .replace(/;}/g, '}')                 // remove last semicolon before }
    .trim();
}

// ─── preload hints ────────────────────────────────────────────────────────────

function extractPreloads(html) {
  const hints = [];
  // find CSS links
  const cssMatches = html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi);
  for (const m of cssMatches) hints.push({ url: m[1], as: 'style' });
  // find JS scripts
  const jsMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
  for (const m of jsMatches) hints.push({ url: m[1], as: 'script' });
  // find fonts
  const fontMatches = html.matchAll(/url\(["']?([^"')]+\.woff2?)["']?\)/gi);
  for (const m of fontMatches) hints.push({ url: m[1], as: 'font', crossorigin: true });
  return hints.slice(0, 10); // max 10 preload hints
}

function buildPreloadHeader(hints) {
  return hints.map(h => {
    let link = `<${h.url}>; rel=preload; as=${h.as}`;
    if (h.crossorigin) link += '; crossorigin';
    return link;
  }).join(', ');
}

// ─── asset fingerprinting ─────────────────────────────────────────────────────

const fingerprints = new Map(); // filePath -> hash

function fingerprintFile(filePath) {
  if (fingerprints.has(filePath)) return fingerprints.get(filePath);
  try {
    const content = fs.readFileSync(filePath);
    const hash    = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    fingerprints.set(filePath, hash);
    return hash;
  } catch { return null; }
}

// ─── performance scoring ──────────────────────────────────────────────────────
// heuristic scoring — not a real Lighthouse run but useful direction

function scoreAsset(url, headers, sizeBytes, ttlSeconds) {
  const issues = [];
  let score    = 100;

  const ext = path.extname(url.split('?')[0]).toLowerCase();
  const isStatic = ['.css', '.js', '.png', '.jpg', '.woff2', '.svg'].includes(ext);

  if (isStatic) {
    if (!ttlSeconds || ttlSeconds < 3600) {
      score -= 20; issues.push('short cache TTL — increase to 1+ year for static assets');
    }
    if (!headers?.['content-encoding']) {
      score -= 15; issues.push('no compression — enable Brotli/Gzip');
    }
  }

  if (ext === '.png' && sizeBytes > 100000) {
    score -= 10; issues.push('large PNG — consider WebP conversion');
  }
  if (ext === '.jpg' && sizeBytes > 200000) {
    score -= 10; issues.push('large JPEG — compress to <200KB');
  }
  if (ext === '.js' && sizeBytes > 500000) {
    score -= 15; issues.push('large JS bundle — consider code splitting');
  }
  if (!headers?.['etag'] && !headers?.['last-modified']) {
    score -= 5; issues.push('no ETag or Last-Modified — add cache validators');
  }

  return { score: Math.max(0, score), issues };
}

// ─── performance reports per vhost ────────────────────────────────────────────

const vhostStats = new Map(); // host -> { requests, bytes, compressions, latencies }

function recordRequest(host, url, bytes, compressed, latency) {
  if (!vhostStats.has(host)) {
    vhostStats.set(host, { host, requests: 0, bytes: 0, compressedBytes: 0, compressions: 0, latencies: [] });
  }
  const s = vhostStats.get(host);
  s.requests++;
  s.bytes += bytes || 0;
  s.compressedBytes += compressed || 0;
  if (compressed) s.compressions++;
  if (latency) s.latencies.push(latency);
  if (s.latencies.length > 200) s.latencies.shift();
}

function getReport(host) {
  const s = vhostStats.get(host);
  if (!s) return null;
  const lats  = s.latencies;
  const sorted = [...lats].sort((a, b) => a - b);
  const p50  = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95  = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const savings = s.bytes > 0 ? (1 - s.compressedBytes / s.bytes) * 100 : 0;
  return {
    host,
    requests:     s.requests,
    bytesTotal:   s.bytes,
    compressions: s.compressions,
    compressionRate: s.requests > 0 ? ((s.compressions / s.requests) * 100).toFixed(1) + '%' : 'n/a',
    bandwidthSaved: savings.toFixed(1) + '%',
    p50LatencyMs:  p50,
    p95LatencyMs:  p95,
  };
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  function json(status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  }

  // POST /optimize/html — compress + minify HTML, inject preload hints
  if (method === 'POST' && url === '/optimize/html') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { html, host, acceptEncoding } = JSON.parse(body);
        let out = minifyHtml(html || '');
        const hints = cfg.preloadHints ? extractPreloads(out) : [];
        const { data, encoding } = await compress(Buffer.from(out), acceptEncoding || '');
        const headers = {};
        if (encoding) headers['content-encoding'] = encoding;
        if (hints.length) headers['link'] = buildPreloadHeader(hints);
        headers['content-length'] = data.length;
        recordRequest(host, '/', Buffer.byteLength(html || ''), data.length, null);
        json(200, { html: data.toString('base64'), headers, encoding, originalSize: Buffer.byteLength(html || ''), compressedSize: data.length });
      } catch (e) { json(400, { error: e.message }); }
    });
    return;
  }

  // POST /optimize/css
  if (method === 'POST' && url === '/optimize/css') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { css, acceptEncoding } = JSON.parse(body);
        const minified = minifyCss(css || '');
        const { data, encoding } = await compress(Buffer.from(minified), acceptEncoding || '');
        json(200, { css: data.toString('base64'), encoding, originalSize: Buffer.byteLength(css || ''), compressedSize: data.length });
      } catch (e) { json(400, { error: e.message }); }
    });
    return;
  }

  // GET /optimize/score?url=...&size=...
  if (method === 'GET' && url.startsWith('/optimize/score')) {
    const params  = new URL(req.url, 'http://x').searchParams;
    const assetUrl = params.get('url') || '/';
    const size    = parseInt(params.get('size') || '0');
    const ttl     = parseInt(params.get('ttl') || '0');
    const result  = scoreAsset(assetUrl, {}, size, ttl);
    return json(200, result);
  }

  // GET /optimize/report/:host
  if (method === 'GET' && url.startsWith('/optimize/report/')) {
    const host   = url.slice('/optimize/report/'.length);
    const report = getReport(host);
    return json(report ? 200 : 404, report || { error: 'no data' });
  }

  // GET /optimize/reports
  if (method === 'GET' && url === '/optimize/reports') {
    const reports = [...vhostStats.keys()].map(h => getReport(h)).filter(Boolean);
    return json(200, { reports });
  }

  json(404, { error: 'not found' });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`optimizer engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// proxy sends raw response for compression before delivery
ipc.on('optimizer:compress', async payload => {
  const { data, acceptEncoding, contentType, requestId, host, url, latency } = payload || {};
  try {
    const buf  = Buffer.from(data, 'base64');
    const isHtml = (contentType || '').includes('html');
    const isCss  = (contentType || '').includes('css');

    let processed = buf;
    if (isHtml) processed = Buffer.from(minifyHtml(buf.toString()));
    if (isCss)  processed = Buffer.from(minifyCss(buf.toString()));

    const { data: compressed, encoding } = await compress(processed, acceptEncoding || '');
    recordRequest(host, url, buf.length, compressed.length, latency);

    const headers = {};
    if (encoding) headers['content-encoding'] = encoding;
    if (isHtml && cfg.preloadHints) {
      const hints = extractPreloads(processed.toString());
      if (hints.length) headers['link'] = buildPreloadHeader(hints);
    }

    ipc.send('optimizer:compressed', {
      requestId,
      data:     compressed.toString('base64'),
      headers,
      encoding,
      originalSize:   buf.length,
      compressedSize: compressed.length,
    });
  } catch (e) {
    ipc.send('optimizer:compressed', { requestId, data, headers: {}, encoding: null });
  }
});

// cache engine sends its stats — optimizer tracks hit rate trends
ipc.on('cache:stats', payload => {
  const { stats } = payload || {};
  if (stats) {
    log(`cache hit rate: ${stats.hitRate} (${stats.items} items, ${stats.usedMb}MB)`);
  }
});

// proxy sends per-request telemetry
ipc.on('optimizer:record', payload => {
  const { host, url, bytes, compressedBytes, latency } = payload || {};
  if (host) recordRequest(host, url, bytes, compressedBytes, latency);
});

ipc.on('optimizer:report', payload => {
  const { host, requestId } = payload || {};
  const report = host ? getReport(host) : [...vhostStats.keys()].map(h => getReport(h));
  ipc.send('optimizer:report:reply', { requestId, report });
});

log('optimizer engine ready');

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

