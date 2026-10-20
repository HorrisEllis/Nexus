'use strict';
/**
 * clear-glass/src/net/quarantine.js — the compartment's download manager (CD2, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec
 * MOD-CDL-QUARANTINE. comp_id: cg.net.quarantine
 *
 * James, 2026-10-21: "download manage for the compartment." NP16 (mapped 2026-10-15) for routed windows: what a Snowflake window downloads
 * lands in <userData>/net/quarantine/<id>/<name> (0600), never the Downloads folder, until he releases it. Release copies it out, checks the
 * copy's sha256, and only then removes the quarantined file. Discard moves it to _discarded/ (§0.3). Magnets met in the window are listed
 * here too (net/magnet.js); nothing is fetched for them.
 * The index lives inside the quarantine folder (index.json, 0600) and NOT in the main downloads store: that store persists every URL, and
 * the Library's history must not hold what a routed window fetched. kill_compartment wipes the folder, index and all.
 */
const path = require('path');
const crypto = require('crypto');
const Magnet = require('./magnet');

const clean = (n) => String(n || 'download').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_').replace(/\.{2,}/g, '_').slice(0, 180) || 'download';

class Quarantine {
  constructor({ dir, fs = require('fs'), now = Date.now, emit = () => {}, log = console.warn } = {}) {
    if (!dir) throw new Error('quarantine needs a dir');
    this.dir = dir; this.fs = fs; this.now = now; this.emit = emit; this.log = log;
    this.items = new Map(); this.live = new Map();   // id → DownloadItem while in progress
    this._load();
  }
  _index() { return path.join(this.dir, 'index.json'); }
  _load() {
    try { for (const it of JSON.parse(this.fs.readFileSync(this._index(), 'utf8'))) this.items.set(it.id, it); } catch (_) { /* none yet */ }
    for (const it of this.items.values()) if (it.state === 'in_progress') it.state = 'interrupted';   // a restart ended it
  }
  _save() {
    try { this.fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 }); this.fs.writeFileSync(this._index(), JSON.stringify([...this.items.values()], null, 1), { mode: 0o600 }); }
    catch (e) { this.log(`[quarantine] index not saved: ${e.message}`); }
  }
  _id() { return `q-${this.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`; }
  list() { return [...this.items.values()].sort((a, b) => b.at - a.at); }
  get(id) { return this.items.get(id) || null; }
  _hash(p) { return crypto.createHash('sha256').update(this.fs.readFileSync(p)).digest('hex'); }

  /** attach(session, partition) — every download of this compartment session is saved here. */
  attach(session, partition) {
    const handler = (_e, item) => {
      const id = this._id(); const filename = clean(item.getFilename());
      const folder = path.join(this.dir, id); const p = path.join(folder, filename);
      try { this.fs.mkdirSync(folder, { recursive: true, mode: 0o700 }); item.setSavePath(p); }
      catch (e) { this.log(`[quarantine] cannot save in quarantine, cancelled: ${e.message}`); try { item.cancel(); } catch (_) {} return; }   // never falls back to Downloads
      const rec = { id, partition, kind: 'file', url: item.getURL(), filename, path: p, state: 'in_progress', sha256: null, bytes: item.getTotalBytes() || 0, mime: item.getMimeType ? item.getMimeType() : null, at: this.now(), magnet: null, handedTo: null };
      this.items.set(id, rec); this.live.set(id, item); this._save();
      item.once('done', (_e2, state) => {
        this.live.delete(id);
        rec.bytes = item.getReceivedBytes ? item.getReceivedBytes() : rec.bytes;
        if (state === 'completed') {
          try { this.fs.chmodSync(p, 0o600); } catch (_) {}
          try { rec.sha256 = this._hash(p); rec.state = 'quarantined'; } catch (e) { rec.state = 'quarantined'; rec.error = `not hashed: ${e.message}`; }
        } else rec.state = state === 'cancelled' ? 'cancelled' : 'interrupted';
        this._save(); this.emit('net.quarantine.added', { id, kind: 'file', partition, state: rec.state });
      });
    };
    session.on('will-download', handler);
    // a magnet that gets past will-navigate (window.open, a frame, a redirect) still ends here: listed, answered 204 so nothing navigates
    try { if (session.protocol && typeof session.protocol.handle === 'function') session.protocol.handle('magnet', (req) => { this.catchMagnet(req.url, partition); return new Response(null, { status: 204 }); }); }
    catch (e) { this.log(`[quarantine] magnet backstop not set on ${partition}: ${e.message}`); }
    return { detach: () => { try { session.removeListener('will-download', handler); } catch (_) {} } };
  }

  /** watch(contents, partition) — a magnet navigation in a compartment window is stopped and listed (CDL-003). */
  watch(contents, partition) {
    const stop = (e, url) => { const u = typeof url === 'string' ? url : (e && e.url) || ''; if (!Magnet.isMagnet(u)) return; try { e.preventDefault(); } catch (_) {} this.catchMagnet(u, partition); };
    contents.on('will-navigate', stop);
    contents.on('will-frame-navigate', (e) => stop(e, e && e.url));
    contents.on('will-redirect', stop);
  }

  /** catchMagnet(url, partition) — a magnet the window met: listed, never opened. Returns the record (or null if it is not a magnet). */
  catchMagnet(url, partition) {
    const m = Magnet.parse(url); if (!m) return null;
    const dup = this.list().find(x => x.kind === 'magnet' && x.magnet && m.infoHash && x.magnet.infoHash === m.infoHash);
    if (dup) return dup;
    const rec = { id: this._id(), partition, kind: 'magnet', url: m.raw, filename: m.name || m.infoHash || m.v2, path: null, state: 'quarantined', sha256: null, bytes: m.size || 0, at: this.now(), magnet: m, handedTo: null };
    this.items.set(rec.id, rec); this._save(); this.emit('net.quarantine.added', { id: rec.id, kind: 'magnet', partition });
    return rec;
  }

  /** release(id, downloadsDir) — copy out, hash-check the copy, then remove the quarantined file. */
  release(id, downloadsDir) {
    const r = this.items.get(id);
    if (!r) return { ok: false, error: `no quarantined item ${id}` };
    if (r.kind !== 'file' || r.state !== 'quarantined') return { ok: false, error: `${id} is ${r.kind === 'magnet' ? 'a magnet (hand it off or copy it)' : r.state}, not a finished file` };
    if (!downloadsDir) return { ok: false, error: 'no Downloads folder known' };
    const ext = path.extname(r.filename); const base = path.basename(r.filename, ext);
    let dest = path.join(downloadsDir, r.filename);
    for (let n = 2; this.fs.existsSync(dest); n++) dest = path.join(downloadsDir, `${base} (${n})${ext}`);
    try {
      this.fs.mkdirSync(downloadsDir, { recursive: true });
      this.fs.copyFileSync(r.path, dest);
      const h = this._hash(dest);
      if (r.sha256 && h !== r.sha256) { try { this.fs.unlinkSync(dest); } catch (_) {} return { ok: false, error: 'the copy did not match the quarantined file; nothing released' }; }
      this.fs.rmSync(path.dirname(r.path), { recursive: true, force: true });
      Object.assign(r, { state: 'released', path: dest, releasedAt: this.now() }); this._save();
      this.emit('net.quarantine.released', { id, path: dest });
      return { ok: true, path: dest };
    } catch (e) { return { ok: false, error: `release failed: ${e.message}` }; }
  }

  /** discard(id) — moved to _discarded/ (kept, §0.3), not deleted; kill_compartment's wipe is the only erase. */
  discard(id) {
    const r = this.items.get(id);
    if (!r) return { ok: false, error: `no quarantined item ${id}` };
    if (r.kind === 'file' && r.path && r.state !== 'released') {
      const live = this.live.get(id); if (live) { try { live.cancel(); } catch (_) {} }
      try { const to = path.join(this.dir, '_discarded', id); this.fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 }); if (this.fs.existsSync(path.dirname(r.path))) this.fs.renameSync(path.dirname(r.path), to); r.path = path.join(to, r.filename); }
      catch (e) { return { ok: false, error: `discard failed: ${e.message}` }; }
    }
    r.state = 'discarded'; this._save();
    return { ok: true };
  }

  /** cancelAll(partition?) — cancel every in-progress download (of one compartment, or all). Returns how many. */
  cancelAll(partition) {
    let n = 0;
    for (const [id, item] of this.live) { const r = this.items.get(id); if (partition && r && r.partition !== partition) continue; try { item.cancel(); n++; } catch (_) {} }
    return n;
  }
  mark(id, extra) { const r = this.items.get(id); if (r) { Object.assign(r, extra); this._save(); } return r; }

  /** wipe() — kill_compartment only: the whole folder, index included. */
  wipe() {
    this.cancelAll();
    try { this.fs.rmSync(this.dir, { recursive: true, force: true }); this.items.clear(); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
}

module.exports = { Quarantine, clean };
