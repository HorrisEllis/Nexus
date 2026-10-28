'use strict';
/**
 * engines/components/unzip.js
 *
 * ZIP extraction using only Node's built-in zlib. No third-party dependency,
 * consistent with the rest of the platform.
 *
 * Reads the central directory rather than scanning local file headers, which
 * is the only correct way to do it: local headers may carry zeroed sizes with
 * the real values in a trailing data descriptor, and streaming parsers that
 * trust the local header silently truncate those entries.
 *
 * Security properties, both of which matter because the input is an arbitrary
 * uploaded file:
 *
 *   Zip slip — every entry path is resolved against the destination and
 *   rejected if it lands outside. An archive containing `../../../etc/passwd`
 *   or an absolute path is refused, not written.
 *
 *   Zip bomb — total inflated bytes are capped. A 4 MB archive that inflates
 *   to 40 GB is aborted partway rather than filling the disk.
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const EOCD_SIG   = 0x06054b50;
const EOCD64_SIG = 0x06064b50;
const CD_SIG     = 0x02014b50;
const LFH_SIG    = 0x04034b50;

function findEOCD(buf) {
  // The comment field means the EOCD is not necessarily at the very end.
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

function readCentralDirectory(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');

  let count  = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOff  = buf.readUInt32LE(eocd + 16);

  // ZIP64: the 32-bit fields are saturated and the real values live in the
  // ZIP64 EOCD record. Without this, archives over 4 GB or 65535 entries
  // extract as empty.
  if (cdOff === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) === EOCD64_SIG) {
        count  = Number(buf.readBigUInt64LE(i + 32));
        cdSize = Number(buf.readBigUInt64LE(i + 40));
        cdOff  = Number(buf.readBigUInt64LE(i + 48));
        break;
      }
    }
  }

  const entries = [];
  let p = cdOff;
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== CD_SIG) break;

    const method    = buf.readUInt16LE(p + 10);
    const crc32     = buf.readUInt32LE(p + 16);
    let   compSize  = buf.readUInt32LE(p + 20);
    let   uncompSize= buf.readUInt32LE(p + 24);
    const nameLen   = buf.readUInt16LE(p + 28);
    const extraLen  = buf.readUInt16LE(p + 30);
    const commentLen= buf.readUInt16LE(p + 32);
    let   localOff  = buf.readUInt32LE(p + 42);
    const name      = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // ZIP64 extended information extra field (header id 0x0001)
    if (uncompSize === 0xffffffff || compSize === 0xffffffff || localOff === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id  = buf.readUInt16LE(e);
        const len = buf.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompSize === 0xffffffff) { uncompSize = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (compSize   === 0xffffffff) { compSize   = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (localOff   === 0xffffffff) { localOff   = Number(buf.readBigUInt64LE(q)); q += 8; }
          break;
        }
        e += 4 + len;
      }
    }

    entries.push({ name, method, crc32, compSize, uncompSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Resolve an entry name inside dest, or null if it escapes. */
function safeJoin(dest, name) {
  if (path.isAbsolute(name) || /^[a-zA-Z]:[\\/]/.test(name)) return null;
  const cleaned = name.replace(/\\/g, '/');
  const target  = path.resolve(dest, cleaned);
  if (target !== dest && !target.startsWith(dest + path.sep)) return null;
  return target;
}

/**
 * @param {string} zipPath
 * @param {string} destDir
 * @param {{maxBytes?:number}} opts
 * @returns {Promise<{files:number, bytes:number, skipped:string[]}>}
 */
async function extract(zipPath, destDir, opts = {}) {
  const maxBytes = opts.maxBytes || 512 * 1024 * 1024;

  let buf;
  try { buf = fs.readFileSync(zipPath); }
  catch (e) { throw new Error(`cannot read archive: ${e.message}`); }

  const entries = readCentralDirectory(buf);
  if (!entries.length) throw new Error('archive contains no entries');

  const dest = path.resolve(destDir);
  fs.mkdirSync(dest, { recursive: true });

  let files = 0, bytes = 0;
  const skipped = [];

  for (const e of entries) {
    if (e.name.endsWith('/')) continue;                     // directory entry
    if (e.name.startsWith('__MACOSX/') || e.name.endsWith('.DS_Store')) continue;

    const target = safeJoin(dest, e.name);
    if (!target) { skipped.push(e.name); continue; }        // zip slip — refused

    if (bytes + e.uncompSize > maxBytes) {
      throw new Error(
        `archive expands beyond the ${(maxBytes / 1048576).toFixed(0)} MB limit `
        + `(stopped at ${e.name}) — refusing to continue`);
    }

    // Local header carries its own name/extra lengths; the data starts after.
    if (buf.readUInt32LE(e.localOff) !== LFH_SIG) {
      skipped.push(e.name);
      continue;
    }
    const lNameLen  = buf.readUInt16LE(e.localOff + 26);
    const lExtraLen = buf.readUInt16LE(e.localOff + 28);
    const start     = e.localOff + 30 + lNameLen + lExtraLen;
    const raw       = buf.subarray(start, start + e.compSize);

    let data;
    if (e.method === 0) {
      data = raw;
    } else if (e.method === 8) {
      try { data = zlib.inflateRawSync(raw); }
      catch (err) { throw new Error(`corrupt entry '${e.name}': ${err.message}`); }
    } else {
      // Method 12/14 (bzip2/lzma) are legal but vanishingly rare in practice.
      skipped.push(`${e.name} (compression method ${e.method} unsupported)`);
      continue;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    files++;
    bytes += data.length;
  }

  if (!files) throw new Error('archive extracted no usable files');
  return { files, bytes, skipped };
}

module.exports = { extract, readCentralDirectory };
