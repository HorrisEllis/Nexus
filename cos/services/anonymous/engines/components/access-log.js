'use strict';
/**
 * engines/components/access-log.js
 *
 * Per-vhost access logs in Combined Log Format, written to
 * logs/webserver-<hostname>.log — the path the spec names, and the one the
 * panel's site detail page reads.
 *
 * Writes are buffered and flushed on a timer rather than synchronously per
 * request: an fs.appendFileSync in the response path would put a disk write
 * on every hit, which is the classic way a web server that benchmarks fine on
 * one request falls over under load.
 */

const fs   = require('fs');
const path = require('path');

const FLUSH_MS      = 2000;
const MAX_BUFFER    = 500;      // lines held before a forced flush
const ROTATE_BYTES  = 10 * 1024 * 1024;
const KEEP_ROTATED  = 3;

const buffers = new Map();      // hostname -> string[]
let   logDir  = null;
let   timer   = null;
let   onError = () => {};

function init(rootDir, errorReporter) {
  logDir = path.join(rootDir, 'logs');
  if (errorReporter) onError = errorReporter;
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* checked at flush */ }
  if (!timer) {
    timer = setInterval(flushAll, FLUSH_MS);
    if (timer.unref) timer.unref();   // never hold the process open
  }
}

function safeName(hostname) {
  return String(hostname || 'default').replace(/[^a-z0-9.-]/gi, '_');
}

function fileFor(hostname) {
  return path.join(logDir, `webserver-${safeName(hostname)}.log`);
}

/** Combined Log Format — the format every existing log analyser already reads. */
function formatLine(req, res, bytes, startedAt) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress
          || '-';
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const MON  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const off  = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const tz   = sign + pad(Math.floor(Math.abs(off) / 60)) + pad(Math.abs(off) % 60);
  const ts   = `${pad(now.getDate())}/${MON[now.getMonth()]}/${now.getFullYear()}:`
             + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${tz}`;

  const q = s => `"${String(s || '-').replace(/"/g, '\\"')}"`;
  const request = `${req.method} ${req.url} HTTP/${req.httpVersion || '1.1'}`;

  return `${ip} - - [${ts}] ${q(request)} ${res.statusCode} ${bytes || 0} `
       + `${q(req.headers.referer)} ${q(req.headers['user-agent'])} `
       + `${Date.now() - startedAt}ms`;
}

function record(hostname, line) {
  const key = safeName(hostname);
  let buf = buffers.get(key);
  if (!buf) { buf = []; buffers.set(key, buf); }
  buf.push(line);
  if (buf.length >= MAX_BUFFER) flushHost(key);
}

function rotateIfNeeded(file) {
  let st;
  try { st = fs.statSync(file); } catch { return; }
  if (st.size < ROTATE_BYTES) return;
  try {
    for (let i = KEEP_ROTATED - 1; i >= 1; i--) {
      const from = `${file}.${i}`, to = `${file}.${i + 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    fs.renameSync(file, `${file}.1`);
  } catch (e) {
    onError(`access log rotation failed for ${path.basename(file)}: ${e.message}`);
  }
}

function flushHost(key) {
  const buf = buffers.get(key);
  if (!buf || !buf.length) return;
  const lines = buf.splice(0, buf.length).join('\n') + '\n';
  const file  = path.join(logDir, `webserver-${key}.log`);
  try {
    rotateIfNeeded(file);
    fs.appendFileSync(file, lines);
  } catch (e) {
    // Surface it once rather than silently discarding hits.
    onError(`access log write failed for ${key}: ${e.message}`);
  }
}

function flushAll() {
  for (const key of buffers.keys()) flushHost(key);
}

/**
 * Attach to a request. Returns nothing; the line is written when the
 * response finishes, so the status code and byte count are both known.
 */
function attach(req, res, resolveHostname) {
  const startedAt = Date.now();
  let bytes = 0;

  const write = res.write.bind(res);
  const end   = res.end.bind(res);
  res.write = (chunk, ...rest) => {
    if (chunk) bytes += Buffer.byteLength(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
    return write(chunk, ...rest);
  };
  res.end = (chunk, ...rest) => {
    if (chunk && typeof chunk !== 'function') {
      bytes += Buffer.byteLength(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
    }
    return end(chunk, ...rest);
  };

  // Both events, guarded by a flag. 'finish' is the normal completion signal,
  // but a response written by piping a read stream does not reliably emit it
  // on every path through this server — under real traffic some requests were
  // silently going unlogged. 'close' always fires. Whichever arrives first
  // writes the line; the other is a no-op.
  let logged = false;
  const write_ = () => {
    if (logged) return;
    logged = true;
    try {
      record(resolveHostname(), formatLine(req, res, bytes, startedAt));
    } catch (e) {
      onError(`access log format failed: ${e.message}`);
    }
  };
  res.once('finish', write_);
  res.once('close',  write_);
}

/** Read the tail of a vhost's access log, newest last. */
function tail(hostname, lines = 200) {
  flushHost(safeName(hostname));
  try {
    const all = fs.readFileSync(fileFor(hostname), 'utf8').split('\n').filter(Boolean);
    return all.slice(-lines);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

module.exports = { init, attach, record, tail, flushAll, fileFor };
