'use strict';
/**
 * lib/zip-writer.js — minimal ZIP archive writer, zero dependencies
 * UUID: nexus-lib-zip-writer-v1-0000-2026-0718-jamesbrooks-001
 *
 * §EXPORT 2026-07-18 — "the export, needs to be the .spec file compressed
 * repo." The only existing archival pattern in this codebase
 * (spec-engine's archiveSpec()) shells out to the system `tar` binary —
 * works, but depends on `tar` actually being on PATH (true on modern
 * Windows, not guaranteed everywhere) and produces .tar.gz, which Windows
 * Explorer doesn't open natively without extra software. A real .zip does,
 * on every platform, no external process spawned at all.
 *
 * STORE mode (method 0) — files are packaged, not compressed. Simpler and
 * fully sufficient here: repo files are already-real text content, not
 * something worth spending CPU on a deflate pass for, and it keeps this
 * file entirely self-contained (no zlib deflate stream wrangling to get
 * exactly right). A real ZIP reader doesn't care whether entries used
 * STORE or DEFLATE — both are valid per the spec, this is just the
 * simpler one to get byte-correct.
 *
 * Verified against Node's own `unzip`-compatible readers by round-tripping
 * through this repo's own `unzip -l` usage elsewhere in the codebase (see
 * loom/ingest/index.js) — a STORE-mode zip built here needs to survive the
 * exact same tool your original upload was itself built with (confirmed:
 * `file` reported "compression method=store" on that upload).
 */

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// DOS date/time encoding — ZIP's local file header wants both packed into
// 16 bits each. "Now" is fine here; nothing downstream reads these back
// for correctness, only display.
function dosDateTime(date = new Date()) {
  const dosTime = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
  const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
  return { dosTime, dosDate };
}

/**
 * createZip(files) -> Buffer
 * files: [{ path: 'relative/path.txt', content: string | Buffer }]
 * path separators are normalized to '/' — ZIP is a cross-platform format,
 * a literal backslash in an entry name breaks extraction on non-Windows
 * readers (and confuses some Windows ones too).
 */
function createZip(files) {
  const { dosTime, dosDate } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const name = f.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);           // version needed to extract
    local.writeUInt16LE(0, 6);            // general purpose flag
    local.writeUInt16LE(0, 8);            // method: 0 = STORE
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size == uncompressed for STORE
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length

    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed to extract
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // extra field length
    central.writeUInt16LE(0, 32);         // file comment length
    central.writeUInt16LE(0, 34);         // disk number start
    central.writeUInt16LE(0, 36);         // internal file attributes
    central.writeUInt32LE(0, 38);         // external file attributes
    central.writeUInt32LE(offset, 42);    // relative offset of local header

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // end of central directory signature
  eocd.writeUInt16LE(0, 4);               // disk number
  eocd.writeUInt16LE(0, 6);               // disk with central directory
  eocd.writeUInt16LE(files.length, 8);    // entries on this disk
  eocd.writeUInt16LE(files.length, 10);   // total entries
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);              // comment length

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

module.exports = { createZip, crc32 };
