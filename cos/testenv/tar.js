'use strict';
/**
 * cos/testenv/tar.js — a directory as a tar archive, in plain JavaScript.
 * comp_id: nexus.cos.testenv.tar
 * Status: pre-release · §0.39.264
 *
 * Why: the VM test environment used to share the repo with the guest over 9p,
 * and QEMU has 9p (virtfs) only on a Linux host — so on Windows the VM option
 * could never be offered. A tar archive written to a file and attached to the
 * guest as a read-only raw disk works on every host QEMU runs on: the guest
 * reads it with `tar -xf /dev/vdb`. No 9p, no FAT, no host tools, no packages.
 *
 * Format: POSIX ustar, with a PAX extended header ('x') for any name longer
 * than ustar's 100/155 split or any size over 8 GiB, which GNU tar, bsdtar and
 * busybox tar all read. Regular files, directories and symlinks; the exec bit
 * is kept so shell scripts and bin/ files still run in the guest. Everything
 * is written with uid/gid 0 — the guest extracts as root.
 *
 * packDir(root, outFile, { skip, maxBytes }) -> { files, dirs, symlinks, bytes, skipped }
 */
const fs = require('fs');
const path = require('path');

const BLOCK = 512;
// What never goes to the guest: VCS state, installed packages (the guest
// installs its own — a host's node_modules can hold Windows-only binaries),
// virtualenvs, caches, and COS's own run state.
const DEFAULT_SKIP = new Set(['.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.tox',
  '.nex', '.cos-testenv', '.nexus-ci-runs', '.DS_Store', 'Thumbs.db', 'target', '.gradle', '.next', '.nuxt', '.turbo', '.cache']);

function _octal(n, width) {
  // width includes the terminating NUL
  const s = Math.floor(n).toString(8);
  if (s.length > width - 1) throw new Error(`tar: ${n} does not fit a ${width}-byte octal field`);
  return s.padStart(width - 1, '0') + '\0';
}

function _header({ name, prefix = '', mode, size, mtime, type, linkname = '' }) {
  const b = Buffer.alloc(BLOCK, 0);
  b.write(name, 0, 100, 'utf8');
  b.write(_octal(mode & 0o7777, 8), 100, 8, 'ascii');
  b.write(_octal(0, 8), 108, 8, 'ascii');          // uid
  b.write(_octal(0, 8), 116, 8, 'ascii');          // gid
  b.write(_octal(size, 12), 124, 12, 'ascii');
  b.write(_octal(mtime, 12), 136, 12, 'ascii');
  b.fill(0x20, 148, 156);                          // checksum placeholder: spaces
  b.write(type, 156, 1, 'ascii');
  b.write(linkname, 157, 100, 'utf8');
  b.write('ustar\0', 257, 6, 'ascii');
  b.write('00', 263, 2, 'ascii');
  b.write('root', 265, 32, 'ascii');
  b.write('root', 297, 32, 'ascii');
  b.write(prefix, 345, 155, 'utf8');
  let sum = 0; for (let i = 0; i < BLOCK; i++) sum += b[i];
  b.write(_octal(sum, 7) + ' ', 148, 8, 'ascii');  // 6 digits, NUL, space
  return b;
}

/** split a path into ustar's prefix (155) + name (100), or null if it cannot */
function _split(p) {
  if (Buffer.byteLength(p) <= 100) return { name: p, prefix: '' };
  for (let i = p.length - 1; i > 0; i--) {
    if (p[i] !== '/') continue;
    const prefix = p.slice(0, i), name = p.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100 && name.length) return { name, prefix };
  }
  return null;
}

function _paxRecord(key, value) {
  // "<len> <key>=<value>\n" where len counts itself
  const body = ` ${key}=${value}\n`;
  let len = Buffer.byteLength(body) + 1;
  while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body);
  return `${len}${body}`;
}

function _pad(n) { const r = n % BLOCK; return r ? BLOCK - r : 0; }

class TarWriter {
  constructor(fd) { this.fd = fd; this.bytes = 0; }
  _write(buf) { fs.writeSync(this.fd, buf); this.bytes += buf.length; }
  entry({ path: p, mode, size = 0, mtime, type, linkname = '' }) {
    let split = _split(p);
    const pax = [];
    if (!split) { pax.push(_paxRecord('path', p)); split = { name: p.slice(0, 99), prefix: '' }; }
    if (linkname && Buffer.byteLength(linkname) > 100) { pax.push(_paxRecord('linkpath', linkname)); linkname = linkname.slice(0, 99); }
    if (size >= 8 ** 11) { pax.push(_paxRecord('size', String(size))); }
    if (pax.length) {
      const data = Buffer.from(pax.join(''), 'utf8');
      this._write(_header({ name: 'PaxHeader/' + path.posix.basename(p).slice(0, 80), mode: 0o644, size: data.length, mtime, type: 'x' }));
      this._write(data); this._write(Buffer.alloc(_pad(data.length)));
    }
    this._write(_header({ name: split.name, prefix: split.prefix, mode, size: size >= 8 ** 11 ? 0 : size, mtime, type, linkname }));
  }
  file(p, abs, st) {
    this.entry({ path: p, mode: st.mode, size: st.size, mtime: st.mtimeMs / 1000, type: '0' });
    const fd = fs.openSync(abs, 'r');
    try {
      const chunk = Buffer.allocUnsafe(1 << 20);
      let left = st.size, pos = 0;
      while (left > 0) {
        const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, left), pos);
        if (n <= 0) break;
        this._write(n === chunk.length ? chunk : chunk.subarray(0, n));
        left -= n; pos += n;
      }
      if (left > 0) this._write(Buffer.alloc(left));   // file shrank while packing: keep the header's size honest
    } finally { fs.closeSync(fd); }
    this._write(Buffer.alloc(_pad(st.size)));
  }
  end() { this._write(Buffer.alloc(BLOCK * 2)); }
}

/**
 * packDir(root, outFile, opts) — every file under root, paths relative to it.
 *   skip      Set of directory/file base names never packed (default DEFAULT_SKIP)
 *   maxBytes  refuse to write an archive larger than this (default 4 GiB)
 */
function packDir(root, outFile, { skip = DEFAULT_SKIP, maxBytes = 4 * 1024 ** 3 } = {}) {
  const absRoot = path.resolve(root);
  if (!fs.statSync(absRoot).isDirectory()) throw new Error(`tar: not a directory: ${root}`);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const fd = fs.openSync(outFile, 'w');
  const w = new TarWriter(fd);
  const stats = { files: 0, dirs: 0, symlinks: 0, bytes: 0, skipped: [] };
  const walk = (rel) => {
    const abs = rel ? path.join(absRoot, rel) : absRoot;
    let ents; try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { stats.skipped.push(`${rel || '.'}: ${e.code || e.message}`); return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      if (skip.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const a = path.join(absRoot, r);
      let st; try { st = fs.lstatSync(a); } catch (_) { stats.skipped.push(r); continue; }
      if (st.isSymbolicLink()) {
        let target; try { target = fs.readlinkSync(a).replace(/\\/g, '/'); } catch (_) { stats.skipped.push(r); continue; }
        w.entry({ path: r, mode: 0o777, mtime: st.mtimeMs / 1000, type: '2', linkname: target }); stats.symlinks++;
      } else if (st.isDirectory()) {
        w.entry({ path: r + '/', mode: 0o755, mtime: st.mtimeMs / 1000, type: '5' }); stats.dirs++;
        walk(r);
      } else if (st.isFile()) {
        // Windows has no exec bit: a file under bin/ or with a shebang-y extension keeps it
        let mode = st.mode & 0o777;
        if (process.platform === 'win32') mode = (/\.(sh|bash|py|pl|rb)$/i.test(e.name) || /(^|\/)bin\//.test(r) || e.name === 'gradlew' || e.name === 'mvnw') ? 0o755 : 0o644;
        w.file(r, a, { ...st, mode, size: st.size, mtimeMs: st.mtimeMs }); stats.files++;
      } else stats.skipped.push(r);
      if (w.bytes > maxBytes) { fs.closeSync(fd); fs.rmSync(outFile, { force: true }); throw new Error(`tar: ${root} is larger than ${Math.round(maxBytes / 1024 ** 2)} MiB — too big to hand to a test VM`); }
    }
  };
  try { walk(''); w.end(); } catch (e) { try { fs.closeSync(fd); } catch (_) {} throw e; }
  fs.closeSync(fd);
  stats.bytes = w.bytes;
  return stats;
}

module.exports = { packDir, DEFAULT_SKIP, TarWriter, _split, _paxRecord };
