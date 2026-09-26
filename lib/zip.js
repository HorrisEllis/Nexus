'use strict';
/**
 * lib/zip.js — zip archives with Node's own zlib. Replaces adm-zip.
 * UUID: nexus-lib-zip-v1-0000-2026-0926-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.261 — James: "remove as much external dependancies as possible …
 * invent anything needed … it needs to earn its place." adm-zip was used for
 * five calls (constructor, getEntries, entry.getData, readAsText, extractAllTo)
 * — a zip file is a list of entries plus DEFLATE, and DEFLATE is zlib, which
 * Node ships. This keeps adm-zip's call shape for those five, so callers
 * change one require line:
 *
 *   const zip = new Zip(bufferOrPath);
 *   zip.getEntries() -> [{ entryName, isDirectory, header:{ size, compressedSize, method, crc }, getData() }]
 *   zip.readAsText(entryOrName, encoding='utf8')
 *   zip.extractAllTo(dir, overwrite=false)       — refuses any entry that would land outside dir
 *   Zip.create([{ path, data }]) -> Buffer       — a writer too (stored or deflated, whichever is smaller)
 *
 * Supported: methods 0 (stored) and 8 (deflate), ZIP64 sizes/offsets, the
 * UTF-8 name flag. Every getData() checks the entry's CRC-32 — a corrupt
 * entry throws, it is never returned as if it were the file. Encrypted
 * entries and other methods throw with the reason.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIG_EOCD = 0x06054b50, SIG_EOCD64 = 0x06064b50, SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function _u64(buf, off) { return Number(buf.readBigUInt64LE(off)); }

class ZipError extends Error {}

class Zip {
  constructor(input) {
    // new Zip() with no input is an archive being BUILT (adm-zip's writer
    // shape: addFile / toBuffer / writeZip), used by tests to make fixtures
    if (input === undefined || input === null) { this.buf = null; this._pending = []; this._entries = null; return; }
    this.buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    this._entries = null;
  }

  addFile(name, data) {
    if (!this._pending) throw new ZipError('addFile is for an archive being built (new Zip() with no input)');
    this._pending.push({ path: name, data: Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8') });
    return this;
  }
  toBuffer() { return this._pending ? Zip.create(this._pending) : Buffer.from(this.buf); }
  writeZip(file) { fs.writeFileSync(file, this.toBuffer()); return file; }

  _eocd() {
    const b = this.buf;
    const min = Math.max(0, b.length - 22 - 0xFFFF);
    for (let i = b.length - 22; i >= min; i--) {
      if (b.readUInt32LE(i) === SIG_EOCD) return i;
    }
    throw new ZipError('not a zip archive (no end-of-central-directory record)');
  }

  getEntries() {
    if (this._entries) return this._entries;
    if (this._pending) { this.buf = Zip.create(this._pending); }
    const b = this.buf;
    const e = this._eocd();
    let count = b.readUInt16LE(e + 10);
    let cdSize = b.readUInt32LE(e + 12);
    let cdOff = b.readUInt32LE(e + 16);
    if ((count === 0xFFFF || cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF) && e >= 20 && b.readUInt32LE(e - 20) === SIG_EOCD64_LOC) {
      const z64 = _u64(b, e - 20 + 8);
      if (b.readUInt32LE(z64) !== SIG_EOCD64) throw new ZipError('ZIP64 locator points at no ZIP64 record');
      count = _u64(b, z64 + 32); cdSize = _u64(b, z64 + 40); cdOff = _u64(b, z64 + 48);
    }
    const out = [];
    let p = cdOff;
    for (let i = 0; i < count; i++) {
      if (b.readUInt32LE(p) !== SIG_CEN) throw new ZipError(`central directory entry ${i} is corrupt`);
      const flags = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16);
      let compressedSize = b.readUInt32LE(p + 20), size = b.readUInt32LE(p + 24);
      const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
      let localOff = b.readUInt32LE(p + 42);
      const name = b.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
      // ZIP64 extended information extra field (id 0x0001): only the fields that overflowed are present, in order
      let x = p + 46 + nameLen;
      const xEnd = x + extraLen;
      while (x + 4 <= xEnd) {
        const id = b.readUInt16LE(x), len = b.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (size === 0xFFFFFFFF) { size = _u64(b, q); q += 8; }
          if (compressedSize === 0xFFFFFFFF) { compressedSize = _u64(b, q); q += 8; }
          if (localOff === 0xFFFFFFFF) { localOff = _u64(b, q); q += 8; }
        }
        x += 4 + len;
      }
      const zip = this;
      out.push({
        entryName: name,
        name: path.posix.basename(name.replace(/\/$/, '')),
        isDirectory: name.endsWith('/'),
        header: { size, compressedSize, method, crc, flags, offset: localOff },
        getData() { return zip._data(this); },
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    this._entries = out;
    return out;
  }

  getEntry(name) { return this.getEntries().find(e => e.entryName === name) || null; }

  _data(entry) {
    const b = this.buf, h = entry.header;
    if (entry.isDirectory) return Buffer.alloc(0);
    if (h.flags & 0x1) throw new ZipError(`${entry.entryName} is encrypted — not supported`);
    const lo = h.offset;
    if (b.readUInt32LE(lo) !== SIG_LOC) throw new ZipError(`${entry.entryName}: local header missing`);
    const start = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28);
    const raw = b.subarray(start, start + h.compressedSize);
    let data;
    if (h.method === 0) data = Buffer.from(raw);
    else if (h.method === 8) data = zlib.inflateRawSync(raw);
    else throw new ZipError(`${entry.entryName}: compression method ${h.method} not supported (stored and deflate are)`);
    if (data.length !== h.size) throw new ZipError(`${entry.entryName}: size ${data.length} ≠ declared ${h.size}`);
    if (crc32(data) !== h.crc) throw new ZipError(`${entry.entryName}: CRC mismatch — the entry is corrupt`);
    return data;
  }

  readAsText(entryOrName, encoding = 'utf8') {
    const e = typeof entryOrName === 'string' ? this.getEntry(entryOrName) : entryOrName;
    if (!e) throw new ZipError(`no entry ${entryOrName}`);
    return e.getData().toString(encoding);
  }

  /** extractAllTo(dir, overwrite) — every entry under dir; zip-slip paths refused, not written. */
  extractAllTo(dir, overwrite = false) {
    const root = path.resolve(dir);
    fs.mkdirSync(root, { recursive: true });
    const written = [];
    for (const e of this.getEntries()) {
      const dest = path.resolve(root, e.entryName);
      if (dest !== root && !dest.startsWith(root + path.sep)) throw new ZipError(`refused ${e.entryName}: it would extract outside ${root}`);
      if (e.isDirectory) { fs.mkdirSync(dest, { recursive: true }); continue; }
      if (!overwrite && fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.getData());
      written.push(e.entryName);
    }
    return written;
  }

  /** Zip.create([{ path, data }]) -> Buffer. Each entry stored or deflated, whichever is smaller. */
  static create(files) {
    const locals = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = Buffer.from(String(f.path).replace(/\\/g, '/'), 'utf8');
      const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data == null ? '' : f.data), 'utf8');
      const crc = crc32(data);
      const def = zlib.deflateRawSync(data);
      const method = def.length < data.length ? 8 : 0;
      const body = method ? def : data;
      if (body.length > 0xFFFFFFFE || data.length > 0xFFFFFFFE || offset > 0xFFFFFFFE) throw new ZipError('entries over 4 GB are not written by this module');
      const loc = Buffer.alloc(30);
      loc.writeUInt32LE(SIG_LOC, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x800, 6); loc.writeUInt16LE(method, 8);
      loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(body.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(name.length, 26);
      const cen = Buffer.alloc(46);
      cen.writeUInt32LE(SIG_CEN, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x800, 8); cen.writeUInt16LE(method, 10);
      cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
      locals.push(loc, name, body);
      central.push(cen, name);
      offset += 30 + name.length + body.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_EOCD, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, end]);
  }
}

module.exports = Zip;
module.exports.Zip = Zip;
module.exports.ZipError = ZipError;
module.exports.crc32 = crc32;
