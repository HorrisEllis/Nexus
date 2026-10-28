'use strict';
// [NEXUS-COMPONENT-ID]
const COMPONENT_ID   = 'wb3f9a21';
const COMPONENT_UUID = 'd4e8f2a1-b3c7-5e91-a082-3d4f6b8c1e20';
const COMPONENT_NAME = 'webserver';
// [/NEXUS-COMPONENT-ID]
/**
 * engines/webserver.js — NanoServe promoted to NEXUS engine
 * Multi-vhost web server: static files, PHP passthrough, Node proxy,
 * nexus:// magnet addressing, drag-and-drop upload, .htaccess rules.
 *
 * Based on server.js (NanoServe) — all original capabilities preserved
 * and extended for multi-vhost, IPC, and platform-aware PHP support.
 *
 * Windows-first, Linux-compatible.
 */

const http   = require('http');
const net    = require('net');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');
const { spawn, execSync, spawnSync } = require('child_process');
const zlib   = require('zlib');

const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');
const accessLog = require('./components/access-log');

// ─── defaults ────────────────────────────────────────────────────────────────
const DEFAULTS = {
  listenPort:     7700,
  cachePort:      7701,
  maxFileBytes:   1073741824,   // 1 GB
  maxCacheBytes:  134217728,    // 128 MB
  maxCacheKeys:   10000,
  phpCgi:         '',           // auto-detected at boot
  defaultVhost:   '',           // fallback vhost hostname
};

if (isInit()) { conf.init(DEFAULTS); log('webserver: wrote default conf'); process.exit(0); }
const cfg = conf.load(DEFAULTS);

const ROOT      = process.env.NEXUS_ROOT || path.join(__dirname, '..');
const VHOSTS_DIR = path.join(ROOT, 'conf', 'vhosts');
const SITES_DIR  = path.join(ROOT, 'sites');
const LOGS_DIR   = path.join(ROOT, 'logs');

for (const d of [VHOSTS_DIR, SITES_DIR, LOGS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ─── PHP detection ───────────────────────────────────────────────────────────
function detectPhpCgi() {
  if (cfg.phpCgi && fs.existsSync(cfg.phpCgi)) return cfg.phpCgi;
  const candidates = os.platform() === 'win32'
    ? ['php-cgi.exe', 'C:\\php\\php-cgi.exe', 'C:\\xampp\\php\\php-cgi.exe']
    : ['/usr/bin/php-cgi', '/usr/local/bin/php-cgi', 'php-cgi'];
  for (const c of candidates) {
    try { execSync(`"${c}" -v`, { stdio: 'pipe', timeout: 2000 }); return c; } catch {}
  }
  return null;
}
const PHP_CGI = detectPhpCgi();
if (PHP_CGI) log(`webserver: PHP found — ${PHP_CGI}`);
else log('webserver: PHP not found — static/proxy only (install php-cgi to enable PHP)', 'WARN');

// ─── MIME types ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.htm': 'text/html',
  '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.gz': 'application/gzip',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.md': 'text/plain',
  '.php': 'text/html',
  '.xml': 'application/xml', '.rss': 'application/rss+xml',
};
function guessMime(f) { return MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'; }


// ─── Vhost registry ──────────────────────────────────────────────────────────
// Each vhost: { hostname, root, stack, php, index, listing, auth, htaccess, proxy }
const vhosts = new Map();

function loadVhosts() {
  if (!fs.existsSync(VHOSTS_DIR)) return;
  for (const f of fs.readdirSync(VHOSTS_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(VHOSTS_DIR, f), 'utf8'));
      if (v.hostname) {
        vhosts.set(v.hostname, v);
        log(`webserver: vhost loaded — ${v.hostname} [${v.stack || 'static'}]`);
      }
    } catch (e) { log(`webserver: bad vhost config ${f}: ${e.message}`, 'WARN'); }
  }
  // Ensure default root site exists
  ensureDefaultVhost();
}

function ensureDefaultVhost() {
  const domain = cfg.defaultVhost || conf.load({}).domain || 'localhost';
  if (!vhosts.has(domain)) {
    const v = {
      hostname: domain,
      root: path.join(SITES_DIR, 'root', 'public'),
      stack: 'static',
      index: ['index.html', 'index.htm', 'index.php'],
      listing: false,
      php: !!PHP_CGI,
    };
    saveVhost(v);
    vhosts.set(domain, v);
    log(`webserver: default vhost created — ${domain}`);
  }
}

function saveVhost(v) {
  // Resolve the document root onto the record itself. The default used to be
  // computed here into a local and thrown away, so any vhost created without
  // an explicit root — which is every vhost the panel creates — was stored
  // with root undefined. path.join(undefined, ...) then threw on the first
  // request, and the site returned 500 with nothing useful in the log.
  if (!v.root) v.root = path.join(SITES_DIR, v.hostname, 'public');
  if (!Array.isArray(v.index) || !v.index.length) {
    v.index = ['index.html', 'index.htm', 'index.php'];
  }

  const p = path.join(VHOSTS_DIR, v.hostname.replace(/[^a-z0-9.-]/gi, '_') + '.json');
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
  // Ensure site directory exists
  const pub = v.root;
  if (!fs.existsSync(pub)) {
    fs.mkdirSync(pub, { recursive: true });
    // Write a placeholder index if empty
    const idx = path.join(pub, 'index.html');
    if (!fs.existsSync(idx)) {
      fs.writeFileSync(idx, `<!DOCTYPE html>
<html><head><title>${v.hostname}</title>
<style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{text-align:center;}.tag{color:#58a6ff;font-size:13px;letter-spacing:.1em;text-transform:uppercase;}</style>
</head><body><div class="box"><p class="tag">NexusPanel</p><h1>${v.hostname}</h1>
<p style="color:#7d8590">Your site is live. Upload files via SFTP or the panel File Manager.</p>
</div></body></html>`);
    }
  }
}

function getVhost(req) {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  return vhosts.get(host) || vhosts.get(cfg.defaultVhost) || [...vhosts.values()][0] || null;
}

// ─── .htaccess parser (per-vhost) ────────────────────────────────────────────
const htCache = new Map(); // hostname → { rules, mtime }

function parseHtaccess(vhostRoot) {
  const htPath = path.join(vhostRoot, '.htaccess');
  const rules = { deny:[], allow:[], block:[], rate_limit:0, cors_origin:'*', noindex:false, auth_exempt:[], redirects:[] };
  if (!fs.existsSync(htPath)) return rules;
  try {
    for (let raw of fs.readFileSync(htPath, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const [cmd, ...rest] = line.split(/\s+/);
      const arg = rest.join(' ').trim();
      switch (cmd.toLowerCase()) {
        case 'deny':        rules.deny.push(arg); break;
        case 'allow':       rules.allow.push(arg); break;
        case 'block':       rules.block.push(arg); break;
        case 'auth_exempt': rules.auth_exempt.push(arg); break;
        case 'rate_limit':  rules.rate_limit = parseInt(arg,10)||0; break;
        case 'cors_origin': rules.cors_origin = arg; break;
        case 'noindex':     rules.noindex = true; break;
        case 'redirect':    { const [from,to] = rest; if(from&&to) rules.redirects.push({from,to}); break; }
      }
    }
  } catch {}
  return rules;
}

function getHtRules(v) {
  const root = v.root;
  const htPath = path.join(root, '.htaccess');
  const cached = htCache.get(v.hostname);
  try {
    const mtime = fs.statSync(htPath).mtimeMs;
    if (cached && cached.mtime === mtime) return cached.rules;
    const rules = parseHtaccess(root);
    htCache.set(v.hostname, { rules, mtime });
    return rules;
  } catch { return parseHtaccess(root); }
}

// ─── CIDR match ───────────────────────────────────────────────────────────────
function cidrMatch(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr;
  const [base, bits] = cidr.split('/');
  const mask = ~((1 << (32 - parseInt(bits,10))) - 1) >>> 0;
  const ipN  = ip.split('.').reduce((a,b) => (a<<8)|parseInt(b,10), 0) >>> 0;
  const bN   = base.split('.').reduce((a,b) => (a<<8)|parseInt(b,10), 0) >>> 0;
  return (ipN & mask) === (bN & mask);
}

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const rateMap = new Map();
setInterval(() => { const now=Date.now(); for(const[k,v] of rateMap) if(now>v.r) rateMap.delete(k); }, 120_000).unref();

// ─── Nexus:// magnet addressing ───────────────────────────────────────────────
function shortId(fileId) { return fileId.slice(0,8); }

function buildNexusMagnet(meta, baseUrl) {
  const sid = shortId(meta.fileId);
  const xs  = `${baseUrl}/files/${meta.fileId}`;
  return `nexus://${sid}?dn=${encodeURIComponent(meta.name)}&xl=${meta.size}&xs=${encodeURIComponent(xs)}`;
}

// ─── In-memory cache ─────────────────────────────────────────────────────────
const cacheStore = new Map();
let cacheBytesUsed = 0;
const cacheObj = {
  set(k,v,ttlMs=0){ const s=String(v); const b=Buffer.byteLength(s,'utf8'); const e=ttlMs>0?Date.now()+ttlMs:null; const ex=cacheStore.get(k); if(ex) cacheBytesUsed-=ex.b; while((cacheBytesUsed+b>cfg.maxCacheBytes||cacheStore.size>=cfg.maxCacheKeys)&&cacheStore.size>0){const ok=cacheStore.keys().next().value;cacheBytesUsed-=cacheStore.get(ok).b;cacheStore.delete(ok);} cacheStore.set(k,{v:s,e,b}); cacheBytesUsed+=b; },
  get(k){ const en=cacheStore.get(k); if(!en) return null; if(en.e&&Date.now()>en.e){cacheBytesUsed-=en.b;cacheStore.delete(k);return null;} return en.v; },
  del(k){ const e=cacheStore.get(k); if(!e) return 0; cacheBytesUsed-=e.b; cacheStore.delete(k); return 1; },
  size(){ return cacheStore.size; }, bytes(){ return cacheBytesUsed; },
  flush(){ cacheStore.clear(); cacheBytesUsed=0; },
};
setInterval(()=>{const now=Date.now();for(const[k,v] of cacheStore) if(v.e&&now>v.e){cacheBytesUsed-=v.b;cacheStore.delete(k);}},30_000).unref();

// ─── Per-vhost file metadata ──────────────────────────────────────────────────
function metaDir(v) { return path.join(ROOT, 'state', 'webserver', v.hostname); }
function ensureMetaDir(v) { const d=metaDir(v); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); return d; }
function metaPath(v,fileId) { return path.join(metaDir(v), fileId+'.json'); }
function writeMeta(v,fileId,obj) { ensureMetaDir(v); fs.writeFileSync(metaPath(v,fileId), JSON.stringify(obj,null,2)); }
function readMeta(v,fileId) { try { return JSON.parse(fs.readFileSync(metaPath(v,fileId),'utf8')); } catch { return null; } }
function listMeta(v) {
  const d=metaDir(v); if(!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f=>f.endsWith('.json')).map(f=>{try{return JSON.parse(fs.readFileSync(path.join(d,f),'utf8'));}catch{return null;}}).filter(Boolean).sort((a,b)=>b.uploaded-a.uploaded);
}

// ─── Multipart upload parser (zero-dep streaming) ────────────────────────────
function parseMultipart(req, boundary, destDir, maxBytes) {
  return new Promise((resolve,reject) => {
    const SEP=Buffer.from('\r\n--'+boundary), CRLF2=Buffer.from('\r\n\r\n');
    let buf=Buffer.from('\r\n'), received=0, files=[], cur=null, curSize=0, curStream=null;
    function close(){ if(!curStream) return; curStream.end(); if(cur&&curSize>0) files.push({...cur,size:curSize}); else if(cur){try{fs.unlinkSync(path.join(destDir,cur.fileId));}catch{}} cur=null;curSize=0;curStream=null; }
    function open(hdr){ const nm=hdr.match(/name="([^"]+)"/i); const fm=hdr.match(/filename="([^"]+)"/i); if(!nm||!fm) return false; const n=path.basename(fm[1].trim())||'upload'; const ct=hdr.match(/Content-Type:\s*([^\r\n]+)/i); const mime=ct?ct[1].trim():guessMime(n); const fileId=crypto.randomBytes(16).toString('hex'); cur={fileId,origName:n,mime}; curSize=0; curStream=fs.createWriteStream(path.join(destDir,fileId)); curStream.on('error',e=>reject(e)); return true; }
    function proc(){ while(true){ const si=buf.indexOf(SEP); if(si===-1){if(curStream&&buf.length>SEP.length){const safe=buf.slice(0,buf.length-(SEP.length-1));curStream.write(safe);curSize+=safe.length;buf=buf.slice(safe.length);}break;} if(curStream&&si>0){curStream.write(buf.slice(0,si));curSize+=si;} close(); buf=buf.slice(si+SEP.length); if(buf.length>=2&&buf[0]===0x2D&&buf[1]===0x2D) break; if(buf.length>=2&&buf[0]===0x0D&&buf[1]===0x0A) buf=buf.slice(2); const h2=buf.indexOf(CRLF2); if(h2===-1) break; open(buf.slice(0,h2).toString('utf8')); buf=buf.slice(h2+4); }}
    req.on('data',chunk=>{received+=chunk.length;if(received>maxBytes){close();req.destroy();return reject(new Error('Upload too large'));} buf=Buffer.concat([buf,chunk]);proc();});
    req.on('end',()=>{proc();close();resolve(files);});
    req.on('error',e=>{close();reject(e);});
  });
}


// ─── PHP CGI passthrough ──────────────────────────────────────────────────────
function runPhp(phpBin, scriptPath, req, res) {
  return new Promise((resolve) => {
    const url = new URL(req.url, 'http://x');
    const env = {
      ...process.env,
      SERVER_SOFTWARE:  'NexusWebServer/1.0',
      SERVER_NAME:      req.headers.host || 'localhost',
      GATEWAY_INTERFACE:'CGI/1.1',
      SERVER_PROTOCOL:  'HTTP/1.1',
      REQUEST_METHOD:   req.method,
      QUERY_STRING:     url.search.slice(1),
      REQUEST_URI:      req.url,
      SCRIPT_FILENAME:  scriptPath,
      SCRIPT_NAME:      url.pathname,
      PATH_INFO:        '',
      DOCUMENT_ROOT:    path.dirname(scriptPath),
      REDIRECT_STATUS:  '200',
      HTTP_HOST:        req.headers.host || 'localhost',
      HTTP_USER_AGENT:  req.headers['user-agent'] || '',
      HTTP_ACCEPT:      req.headers['accept'] || '',
      HTTP_COOKIE:      req.headers['cookie'] || '',
      CONTENT_TYPE:     req.headers['content-type'] || '',
      CONTENT_LENGTH:   req.headers['content-length'] || '0',
      SERVER_PORT:      String(cfg.listenPort),
      REMOTE_ADDR:      (req.socket.remoteAddress || '').replace(/^::ffff:/, ''),
    };
    const child = spawn(phpBin, [], { env, stdio: ['pipe','pipe','pipe'] });
    req.pipe(child.stdin);
    let headers = '', headersDone = false, buf = [];
    child.stdout.on('data', chunk => {
      if (headersDone) { res.write(chunk); return; }
      buf.push(chunk);
      const combined = Buffer.concat(buf).toString('utf8');
      const sep = combined.indexOf('\r\n\r\n') !== -1 ? '\r\n\r\n' : '\n\n';
      const idx = combined.indexOf(sep);
      if (idx !== -1) {
        headers = combined.slice(0, idx);
        const body = combined.slice(idx + sep.length);
        const hlines = headers.split(/\r?\n/);
        let status = 200;
        const resHeaders = {};
        for (const hl of hlines) {
          const m = hl.match(/^([^:]+):\s*(.+)$/);
          if (!m) continue;
          if (m[1].toLowerCase() === 'status') { status = parseInt(m[2]) || 200; }
          else resHeaders[m[1]] = m[2];
        }
        res.writeHead(status, resHeaders);
        if (body) res.write(body);
        headersDone = true;
        buf = [];
      }
    });
    child.stdout.on('end', () => { if (!headersDone) res.writeHead(200, {'Content-Type':'text/html'}); res.end(); resolve(); });
    child.stderr.on('data', d => log(`webserver: PHP stderr — ${d.toString().trim()}`, 'WARN'));
    child.on('error', e => { res.writeHead(500); res.end('PHP error: ' + e.message); resolve(); });
  });
}

// ─── Static file server with compression + ranges ────────────────────────────
async function serveStatic(req, res, filePath, mime) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat) { res.writeHead(404); res.end('Not Found'); return; }

  // Range request support (video/audio)
  const range = req.headers['range'];
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? parseInt(endStr, 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  // ETag / conditional GET
  const etag = `"${stat.size}-${stat.mtimeMs}"`;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }

  // Gzip for compressible types
  const accept = req.headers['accept-encoding'] || '';
  const compressible = /text|javascript|json|xml|svg/.test(mime);

  res.setHeader('ETag', etag);
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', mime.startsWith('text/html') ? 'no-cache' : 'public, max-age=86400');
  res.setHeader('Accept-Ranges', 'bytes');

  if (compressible && accept.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.writeHead(200);
    fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    res.writeHead(200);
    fs.createReadStream(filePath).pipe(res);
  }
}

// ─── Directory listing ────────────────────────────────────────────────────────
function serveDirectory(res, dirPath, urlPath, hostname) {
  const entries = fs.readdirSync(dirPath).map(name => {
    const full = path.join(dirPath, name);
    const stat = fs.statSync(full, { throwIfNoEntry: false });
    return stat ? { name, isDir: stat.isDirectory(), size: stat.size, mtime: stat.mtime } : null;
  }).filter(Boolean).sort((a,b) => b.isDir - a.isDir || a.name.localeCompare(b.name));

  const rows = entries.map(e =>
    `<tr><td><a href="${urlPath}${urlPath.endsWith('/')?'':'/'}${e.name}">${e.isDir?'<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/></svg> ':'<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6\"/></svg> '}${e.name}</a></td>` +
    `<td style="color:#7d8590">${e.isDir?'—':(e.size/1024).toFixed(1)+' KB'}</td>` +
    `<td style="color:#7d8590">${e.mtime.toLocaleDateString()}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html><html><head><title>Index of ${urlPath}</title>
<style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;padding:24px;max-width:900px;margin:0 auto;}
a{color:#58a6ff;text-decoration:none;}table{width:100%;border-collapse:collapse;}
td{padding:8px 12px;border-bottom:1px solid #21262d;}h1{font-size:18px;margin-bottom:16px;}</style>
</head><body><h1>Index of ${urlPath}</h1>
<table><thead><tr><th style="text-align:left">Name</th><th>Size</th><th>Modified</th></tr></thead>
<tbody>${urlPath!=='/'?'<tr><td><a href="../">↩ Parent</a></td><td></td><td></td></tr>':''}${rows}</tbody>
</table></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
}

// ─── Node/Python proxy passthrough ───────────────────────────────────────────
function proxyToBackend(req, res, targetPort) {
  const options = {
    hostname: '127.0.0.1', port: targetPort,
    path: req.url, method: req.method,
    headers: { ...req.headers, 'X-Forwarded-For': req.socket.remoteAddress, 'X-Forwarded-Proto': 'http' },
  };
  const proxy = http.request(options, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  proxy.on('error', e => {
    res.writeHead(502);
    res.end(`<h1>502 Bad Gateway</h1><p>Backend on port ${targetPort} unavailable: ${e.message}</p>`);
  });
  req.pipe(proxy);
}


// ─── Main request handler ─────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const urlObj   = new URL(req.url, 'http://x');
  const pathname = urlObj.pathname;
  const method   = req.method.toUpperCase();
  const v        = getVhost(req);

  // Attached before any early return: a 403 from an htaccess deny rule or a
  // 503 for an unknown Host is precisely the request you want logged.
  accessLog.attach(req, res, () => v?.hostname || 'unmatched');

  if (!v) { res.writeHead(503); res.end('No vhost configured'); return; }

  const ht  = getHtRules(v);
  const ip  = (req.socket.remoteAddress||'').replace(/^::ffff:/,'');

  // htaccess: deny/allow
  for (const rule of ht.deny) if (cidrMatch(ip,rule)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (ht.allow.length > 0 && !ht.allow.some(r => cidrMatch(ip,r))) { res.writeHead(403); res.end('Forbidden'); return; }
  for (const prefix of ht.block) if (pathname.startsWith(prefix)) { res.writeHead(403); res.end('Forbidden'); return; }

  // htaccess: rate limit
  if (ht.rate_limit > 0) {
    const now = Date.now();
    let e = rateMap.get(ip);
    if (!e || now > e.r) { e = { c:0, r: now+60000 }; rateMap.set(ip,e); }
    e.c++;
    if (e.c > ht.rate_limit) { res.writeHead(429); res.end('Too Many Requests'); return; }
  }

  // htaccess: redirects
  for (const r of ht.redirects) if (pathname === r.from) { res.writeHead(301, { Location: r.to }); res.end(); return; }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', ht.cors_origin);
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (ht.noindex) res.setHeader('X-Robots-Tag', 'noindex,nofollow');

  // ── Internal API routes (prefixed to avoid collisions with site content) ──
  const API = '/__nexus__';

  // File list API
  if (pathname === `${API}/files` && method === 'GET') {
    const base = `http://${req.headers.host}`;
    const files = listMeta(v).map(m => ({ ...m, nexus: buildNexusMagnet(m, base) }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files, vhost: v.hostname, stack: v.stack }));
    return;
  }

  // Upload API
  if (pathname === `${API}/upload` && method === 'POST') {
    const ct = req.headers['content-type'] || '';
    const boundary = ct.match(/boundary=(["']?)([^"';\s]+)\1/i)?.[2];
    if (!boundary) { res.writeHead(400); res.end(JSON.stringify({ error: 'Expected multipart' })); return; }
    const uploadDir = v.root;
    try {
      const uploaded = await parseMultipart(req, boundary, uploadDir, cfg.maxFileBytes);
      const base = `http://${req.headers.host}`;
      const saved = [];
      for (const f of uploaded) {
        const meta = { fileId: f.fileId, name: f.origName, mime: f.mime||guessMime(f.origName), size: f.size, uploaded: Date.now() };
        meta.nexus = buildNexusMagnet(meta, base);
        writeMeta(v, f.fileId, meta);
        saved.push(meta);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ uploaded: saved }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // Nexus resolve
  const nexusM = pathname.match(new RegExp(`^${API}/nexus/([a-f0-9]{8})$`));
  if (nexusM && method === 'GET') {
    const sid = nexusM[1];
    const all = listMeta(v);
    const match = all.find(m => m.fileId.startsWith(sid));
    if (!match) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(302, { Location: `/${match.fileId}` }); res.end();
    return;
  }

  // Delete uploaded file
  const delM = pathname.match(new RegExp(`^${API}/files/([a-f0-9]{32})$`));
  if (delM && method === 'DELETE') {
    const fileId = delM[1];
    const meta = readMeta(v, fileId);
    if (meta) {
      const fp = path.join(v.root, fileId);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      fs.unlinkSync(metaPath(v, fileId));
    }
    res.writeHead(meta ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: !!meta }));
    return;
  }

  // ── Stack routing ──────────────────────────────────────────────────────────

  // Raw port proxy (Node.js, Python, etc.)
  if (v.stack === 'proxy' && v.proxyPort) {
    proxyToBackend(req, res, v.proxyPort);
    return;
  }

  // Resolve file path
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath   = path.join(v.root, safePath);

  // Directory: try index files
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (stat?.isDirectory()) {
    const indexFiles = v.index || ['index.html', 'index.htm', 'index.php'];
    let found = null;
    for (const idx of indexFiles) {
      const candidate = path.join(filePath, idx);
      if (fs.existsSync(candidate)) { found = candidate; break; }
    }
    if (!found) {
      if (v.listing) { serveDirectory(res, filePath, pathname, v.hostname); return; }
      res.writeHead(403); res.end('Forbidden'); return;
    }
    filePath = found;
  }

  // 404 if file doesn't exist
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return; }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = guessMime(filePath);

  // PHP passthrough
  if (ext === '.php') {
    if (!PHP_CGI) {
      res.writeHead(500);
      res.end('PHP not installed. Install php-cgi and restart the webserver engine.');
      return;
    }
    await runPhp(PHP_CGI, filePath, req, res);
    return;
  }

  // Static file
  await serveStatic(req, res, filePath, mime);
}

// ─── TCP cache server (Redis-style protocol) ─────────────────────────────────
function startCacheServer(startPort) {
  let port = startPort;
  const srv = net.createServer(socket => {
    socket.setEncoding('utf8');
    let buf = '';
    socket.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i+1);
        if (!line.trim()) continue;
        const parts = line.trimEnd().split(' ');
        const cmd = (parts[0]||'').toUpperCase();
        let reply = '-ERR unknown command';
        if (cmd==='PING') reply='+PONG';
        else if (cmd==='FLUSH'){cacheObj.flush();reply='+OK';}
        else if (cmd==='SET'){cacheObj.set(parts[1],parts.slice(3).join(' '),parseInt(parts[2],10)||0);reply='+OK';}
        else if (cmd==='GET'){const v=cacheObj.get(parts[1]);reply=v===null?'-nil':'$'+v;}
        else if (cmd==='DEL') reply=':'+cacheObj.del(parts[1]);
        else if (cmd==='KEYS'){const ks=Array.from(cacheStore.keys());reply=ks.map(k=>'*'+k).join('\n')+'\n*done';}
        try { socket.write(reply+'\n'); } catch {}
      }
    });
    socket.on('error', ()=>{});
  });
  srv.listen(port, '127.0.0.1', () => {
    log(`webserver: cache server on :${port}`);
    claimPort(port);
  });
  // Fall forward to the next free port rather than logging a warning and
  // leaving the cache dead. A stale process holding 7701, or a second
  // webserver instance, otherwise silently disables caching for the session.
  srv.on('error', e => {
    if (e.code !== 'EADDRINUSE') {
      log(`webserver: cache server error — ${e.message}`, 'WARN');
      return;
    }
    if (port - cfg.cachePort >= 10) {
      log(`webserver: no free cache port in ${cfg.cachePort}-${port} — cache disabled`, 'WARN');
      return;
    }
    log(`webserver: cache port ${port} in use — trying :${port + 1}`, 'WARN');
    setTimeout(() => srv.listen(port + 1, '127.0.0.1'), 100);
    port += 1;
  });
  return srv;
}


// ─── IPC handlers ────────────────────────────────────────────────────────────

ipc.on('webserver:vhost:list', payload => {
  const list = [...vhosts.values()];
  ipc.send('webserver:vhost:list:reply', { requestId: payload?.requestId, vhosts: list });
});

ipc.on('webserver:vhost:add', payload => {
  const v = payload?.vhost;
  if (!v?.hostname) {
    ipc.send('webserver:vhost:add:reply', { requestId: payload?.requestId, ok: false, error: 'hostname required' });
    return;
  }
  saveVhost(v);
  vhosts.set(v.hostname, v);
  log(`webserver: vhost added — ${v.hostname} [${v.stack||'static'}]`);
  ipc.send('webserver:vhost:add:reply', { requestId: payload?.requestId, ok: true, vhost: v });
  // Tell proxy engine to map this hostname
  ipc.send('route', { type: 'proxy:vhost:add', hostname: v.hostname, target: `http://127.0.0.1:${cfg.listenPort}` }, 'proxy');
});

ipc.on('webserver:vhost:remove', payload => {
  const hostname = payload?.hostname;
  if (!hostname) return;
  vhosts.delete(hostname);
  const p = path.join(VHOSTS_DIR, hostname.replace(/[^a-z0-9.-]/gi,'_')+'.json');
  if (fs.existsSync(p)) fs.unlinkSync(p);
  log(`webserver: vhost removed — ${hostname}`);
  ipc.send('webserver:vhost:remove:reply', { requestId: payload?.requestId, ok: true });
});

ipc.on('webserver:vhost:update', payload => {
  const v = payload?.vhost;
  if (!v?.hostname) return;
  saveVhost(v);
  vhosts.set(v.hostname, v);
  log(`webserver: vhost updated — ${v.hostname}`);
  ipc.send('webserver:vhost:update:reply', { requestId: payload?.requestId, ok: true });
});

ipc.on('webserver:accesslog', payload => {
  const hostname = payload?.hostname;
  if (!hostname) {
    ipc.send('webserver:accesslog:reply', {
      requestId: payload?.requestId, lines: [], error: 'hostname is required',
    });
    return;
  }
  try {
    ipc.send('webserver:accesslog:reply', {
      requestId: payload?.requestId,
      hostname,
      file:  accessLog.fileFor(hostname),
      lines: accessLog.tail(hostname, Math.min(payload?.lines || 200, 2000)),
    });
  } catch (e) {
    ipc.send('webserver:accesslog:reply', {
      requestId: payload?.requestId, lines: [], error: e.message,
    });
  }
});

ipc.on('webserver:status', payload => {
  ipc.send('webserver:status:reply', {
    requestId: payload?.requestId,
    port:      cfg.listenPort,
    cachePort: cfg.cachePort,
    vhosts:    [...vhosts.keys()],
    php:       PHP_CGI || null,
    cache:     { keys: cacheObj.size(), bytes: cacheObj.bytes() },
    uptime:    process.uptime(),
  });
});

ipc.on('webserver:php:check', payload => {
  ipc.send('webserver:php:check:reply', {
    requestId: payload?.requestId,
    available: !!PHP_CGI,
    path:      PHP_CGI || null,
    platform:  os.platform(),
  });
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(e => {
    log(`webserver: unhandled error — ${e.message}`, 'ERROR');
    try { if (!res.headersSent) { res.writeHead(500); res.end('Internal Server Error'); } } catch {}
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = cfg.listenPort + 1;
    log(`webserver: port ${cfg.listenPort} in use — trying :${next}`, 'WARN');
    server.listen(next, () => {
      log(`webserver: listening on :${next}`);
      claimPort(next);
    });
  } else {
    log(`webserver: server error — ${err.message}`, 'ERROR');
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadVhosts();
startCacheServer(cfg.cachePort);

server.listen(cfg.listenPort, () => {
  accessLog.init(ROOT, msg => log(`webserver: ${msg}`, 'ERROR'));
  log(`webserver: engine ready`);
  log(`webserver: listening on :${cfg.listenPort}`);
  log(`webserver: ${vhosts.size} vhost(s) active — ${[...vhosts.keys()].join(', ')}`);
  if (PHP_CGI) log(`webserver: PHP passthrough enabled — ${PHP_CGI}`);
  claimPort(cfg.listenPort);
});
