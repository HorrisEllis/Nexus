'use strict';
/**
 * lib/nexstore/log.js — the append-only log under every node-store type (0.39.300, N1).
 * component_id: nexus.lib.nexstore.log
 * Map: docs/2026-09-29-nex-node-store-phasemap.spec (N1_record_and_log) — I1 append-only, I2 one writer, I3 provenance.
 *
 *   const log = open(dir, { segmentBytes, by })
 *   log.append({ op, type, id, change, causedBy })   → the sealed record — on disk and fsynced before this returns
 *   log.read({ from, to }) · log.records({ from })    → records in seq order, read back from disk
 *   log.verify()                                      → { ok, records, error } — the whole chain re-read
 *   log.report                                        → what open found: records, segments, a torn tail, a stale lock
 *   log.close()
 *
 * On disk: dir/seg-000001.log, seg-000002.log … (frames from record.js; a new segment once one passes segmentBytes),
 * dir/LOCK (the writer's pid — I2), dir/torn/ (bytes cut from a torn tail, kept — §0.3 nothing lost).
 *
 * Open re-reads every segment and verifies every frame (crc), every link (prev = the hash before) and every hash.
 *   A torn last record — a frame the process died writing — can only sit at the end of the last segment: it is cut
 *   off, its bytes kept under torn/, and reported. A record cannot have been acknowledged without its fsync, so nothing
 *   acknowledged is ever cut.
 *   Anything else — a bad frame in an earlier segment, a broken link, a hash that does not hold — is corruption, and
 *   open refuses with the reason; it never repairs by dropping records.
 * Pure Node.
 */
const fs = require('fs');
const path = require('path');
const R = require('./record.js');

const SEG_RE = /^seg-(\d{6})\.log$/;
const segName = (n) => `seg-${String(n).padStart(6, '0')}.log`;
const DEFAULT_SEGMENT = 64 * 1024 * 1024;

function alive(pid) {
  if (!pid || pid === process.pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function fsyncDir(dir) {
  let fd; try { fd = fs.openSync(dir, 'r'); fs.fsyncSync(fd); } catch (_) { /* not every platform syncs a directory */ } finally { if (fd != null) try { fs.closeSync(fd); } catch (_) {} }
}

/** takeLock(dir) → { staleFrom } — one writer per log (I2); a lock left by a dead process is taken over and said */
function takeLock(dir) {
  const p = path.join(dir, 'LOCK');
  for (let tries = 0; tries < 3; tries++) {
    try { const fd = fs.openSync(p, 'wx'); fs.writeSync(fd, String(process.pid)); fs.fsyncSync(fd); fs.closeSync(fd); return { staleFrom: null }; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = parseInt(fs.readFileSync(p, 'utf8'), 10) || 0;
      if (alive(pid)) throw new Error(`nexstore: ${dir} already has a writer (pid ${pid}) — one writer per log (I2)`);
      if (pid === process.pid) throw new Error(`nexstore: ${dir} is already open in this process — one writer per log (I2)`);
      try { fs.unlinkSync(p); } catch (_) { /* raced: try again */ }
      const r = (() => { try { const fd = fs.openSync(p, 'wx'); fs.writeSync(fd, String(process.pid)); fs.fsyncSync(fd); fs.closeSync(fd); return true; } catch (_) { return false; } })();
      if (r) return { staleFrom: pid || 'unknown' };
    }
  }
  throw new Error(`nexstore: could not take the lock on ${dir}`);
}

function segmentsOf(dir) {
  return fs.readdirSync(dir).map(f => { const m = SEG_RE.exec(f); return m ? { n: +m[1], file: path.join(dir, f) } : null; }).filter(Boolean).sort((a, b) => a.n - b.n);
}

/**
 * scan(dir, { repair }) → { last, segments: [{ n, file, firstSeq, count, size }], records, torn }
 *   repair false: read-only (verify); a torn tail is reported, not cut
 */
function scan(dir, { repair = false, onRecord = null } = {}) {
  const segs = segmentsOf(dir);
  let last = null, records = 0, torn = null;
  const out = [];
  segs.forEach((s, i) => {
    const buf = fs.readFileSync(s.file);
    const isLast = i === segs.length - 1;
    let off = 0, firstSeq = null, count = 0;
    while (off < buf.length) {
      const d = R.decode(buf, off);
      if (d.torn) {
        if (!isLast) throw new Error(`nexstore: ${path.basename(s.file)} is corrupt at byte ${off} (${d.torn}) and it is not the last segment — refused, nothing dropped`);
        torn = { segment: path.basename(s.file), offset: off, bytes: buf.length - off, reason: d.torn, afterSeq: last ? last.seq : 0, savedTo: null };
        break;
      }
      const why = R.verify(d.rec, last);
      if (why) throw new Error(`nexstore: ${path.basename(s.file)} at byte ${off}: ${why} — the chain is broken, refused`);
      if (onRecord) onRecord(d.rec);
      last = d.rec; records++; count++; if (firstSeq == null) firstSeq = d.rec.seq;
      off = d.next;
    }
    if (torn && repair) {
      const keep = path.join(dir, 'torn');
      fs.mkdirSync(keep, { recursive: true });
      const saved = path.join(keep, `${path.basename(s.file, '.log')}.at-${torn.offset}.${Date.now()}.torn`);
      fs.writeFileSync(saved, buf.subarray(torn.offset));
      const fd = fs.openSync(saved, 'r+'); fs.fsyncSync(fd); fs.closeSync(fd);
      const sf = fs.openSync(s.file, 'r+'); fs.ftruncateSync(sf, torn.offset); fs.fsyncSync(sf); fs.closeSync(sf);
      fsyncDir(keep); torn.savedTo = path.relative(dir, saved).split(path.sep).join('/');
    }
    out.push({ n: s.n, file: s.file, firstSeq, count, size: torn && isLast ? torn.offset : buf.length });
  });
  return { last, segments: out, records, torn };
}

function open(dir, opts = {}) {
  const segmentBytes = opts.segmentBytes || DEFAULT_SEGMENT;
  fs.mkdirSync(dir, { recursive: true });
  const lock = takeLock(dir);
  let st;
  try { st = scan(dir, { repair: true }); }
  catch (e) { try { fs.unlinkSync(path.join(dir, 'LOCK')); } catch (_) {} throw e; }

  const segs = st.segments.map(s => ({ n: s.n, file: s.file, firstSeq: s.firstSeq }));
  let last = st.last, cur = segs[segs.length - 1] || null, size = cur ? st.segments[st.segments.length - 1].size : 0, fd = null, closed = false;
  if (!cur) { cur = { n: 1, file: path.join(dir, segName(1)), firstSeq: null }; segs.push(cur); size = 0; }
  fd = fs.openSync(cur.file, 'a'); fsyncDir(dir);

  const report = { dir, records: st.records, segments: segs.length, lastSeq: last ? last.seq : 0, torn: st.torn, staleLock: lock.staleFrom };

  function roll() {
    fs.closeSync(fd);
    cur = { n: cur.n + 1, file: path.join(dir, segName(cur.n + 1)), firstSeq: null };
    segs.push(cur); size = 0;
    fd = fs.openSync(cur.file, 'a'); fsyncDir(dir);
  }

  function append(input) {
    if (closed) throw new Error('nexstore: the log is closed');
    const rec = R.seal({ by: opts.by, ...input }, { seq: last ? last.seq + 1 : 1, prev: last ? last.hash : null });
    const frame = R.encode(rec);
    if (size > 0 && size + frame.length > segmentBytes) roll();
    let w = 0; while (w < frame.length) w += fs.writeSync(fd, frame, w, frame.length - w);
    fs.fsyncSync(fd);                                   // acknowledged only once it is on disk
    size += frame.length; last = rec; if (cur.firstSeq == null) cur.firstSeq = rec.seq;
    return rec;
  }

  function* records({ from = 1, to = Infinity } = {}) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], next = segs[i + 1];
      if (next && next.firstSeq != null && next.firstSeq <= from) continue;   // the whole segment is before `from`
      if (s.firstSeq != null && s.firstSeq > to) return;
      let buf; try { buf = fs.readFileSync(s.file); } catch (_) { continue; }
      let off = 0;
      while (off < buf.length) {
        const d = R.decode(buf, off); if (d.torn) break;
        if (d.rec.seq > to) return;
        if (d.rec.seq >= from) yield d.rec;
        off = d.next;
      }
    }
  }

  return {
    dir, report,
    append,
    records,
    read: (o) => Array.from(records(o)),
    get lastSeq() { return last ? last.seq : 0; },
    get lastHash() { return last ? last.hash : null; },
    get segmentCount() { return segs.length; },
    verify() { try { const s = scan(dir, { repair: false }); return { ok: !s.torn, records: s.records, lastSeq: s.last ? s.last.seq : 0, torn: s.torn }; } catch (e) { return { ok: false, error: e.message }; } },
    close() { if (closed) return; closed = true; try { fs.closeSync(fd); } catch (_) {} try { fs.unlinkSync(path.join(dir, 'LOCK')); } catch (_) {} },
  };
}

/** verify(dir) → { ok, records, lastSeq, torn | error } — read-only, no lock taken */
function verify(dir) {
  try { const s = scan(dir, { repair: false }); return { ok: !s.torn, records: s.records, lastSeq: s.last ? s.last.seq : 0, torn: s.torn }; }
  catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { open, verify, scan, segName, DEFAULT_SEGMENT };
