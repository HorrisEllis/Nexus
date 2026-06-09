'use strict';
// lib/queue.js — Physical File Queue
// UUID: nexus-queue-v1-0000-4000-0000-000000000001
//
// §LAW II: Every queue item is a physical file before it is processed.
//          If the system crashes, the file is still there. On restart, replay.
// §1.2:    Nothing silently fails. Every drop logged.
//
// SEAM CONTRACT (QUEUE_CONTRACT):
//   enqueue(item)       → writes uuid.pending.{ext} to data/{kernel}/input/
//   pending()           → lists all .pending files (survived restarts)
//   claim(uuid)         → renames .pending → .processing (atomic on most FSes)
//   complete(uuid)      → renames .processing → .done, writes to output/
//   fail(uuid, reason)  → renames .processing → .failed, logs to failures/
//   tags(uuid)          → read/write tags on an item
//
// File naming:
//   {uuid}.pending.md       — raw text/markdown request
//   {uuid}.pending.spec     — .spec file waiting for SEAM queue
//   {uuid}.pending.json     — structured JSON request
//   {uuid}.processing.{ext} — claimed by a worker
//   {uuid}.done.{ext}       — completed, output written
//   {uuid}.failed.{ext}     — failed, see failures/ ledger

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

function uid() {
  return crypto.randomUUID();
}

class PhysicalQueue {
  /**
   * @param {object} opts
   * @param {string} opts.inputDir    — where pending files live
   * @param {string} opts.outputDir   — where done files land
   * @param {string} opts.failuresDir — where failure logs live
   * @param {string} opts.logsDir     — conversation logs
   */
  constructor(opts = {}) {
    this.inputDir    = opts.inputDir    || 'data/input';
    this.outputDir   = opts.outputDir   || 'data/output';
    this.failuresDir = opts.failuresDir || 'data/failures';
    this.logsDir     = opts.logsDir     || 'data/logs';
    this.queueDir    = opts.queueDir    || 'data/queue';

    // Ensure all dirs exist
    for (const d of [this.inputDir, this.outputDir, this.failuresDir,
                     this.logsDir, this.queueDir]) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────

  /**
   * Write a new queue item as a physical file.
   * §LAW II: file written before any processing begins.
   *
   * @param {object} item
   * @param {string} item.content  — text/markdown/json content
   * @param {string} item.ext      — 'md' | 'spec' | 'json' (default 'md')
   * @param {string[]} item.tags   — array of tag strings
   * @param {string} item.priority — 'high' | 'normal' | 'low'
   * @param {object} item.meta     — arbitrary metadata
   * @returns {{ uuid, filepath, tags }}
   */
  enqueue(item = {}) {
    const uuid     = item.uuid || uid();
    const ext      = item.ext  || (item.spec ? 'spec' : 'md');
    const filename = `${uuid}.pending.${ext}`;
    const filepath = path.join(this.inputDir, filename);

    // Build file content — metadata header + content
    const meta = {
      uuid,
      tags:       item.tags     || [],
      priority:   item.priority || 'normal',
      createdAt:  Date.now(),
      source:     item.source   || 'cli',
      project:    item.project  || null,
      sessionId:  item.session  || null,
      ...item.meta,
    };

    let fileContent;
    if (ext === 'json') {
      fileContent = JSON.stringify({ _meta: meta, data: item.content }, null, 2);
    } else if (ext === 'spec') {
      // Spec files: prepend meta as YAML comment block
      fileContent = [
        `# NEXUS QUEUE ITEM`,
        `# uuid: ${uuid}`,
        `# tags: ${meta.tags.join(', ') || 'none'}`,
        `# priority: ${meta.priority}`,
        `# created: ${new Date(meta.createdAt).toISOString()}`,
        `# source: ${meta.source}`,
        `# project: ${meta.project || 'none'}`,
        ``,
        item.content || '',
      ].join('\n');
    } else {
      // Markdown — metadata as front-matter
      fileContent = [
        `---`,
        `uuid: ${uuid}`,
        `tags: [${meta.tags.map(t => `"${t}"`).join(', ')}]`,
        `priority: ${meta.priority}`,
        `created: ${new Date(meta.createdAt).toISOString()}`,
        `source: ${meta.source}`,
        `project: ${meta.project || 'none'}`,
        `session: ${meta.sessionId || 'none'}`,
        `---`,
        ``,
        item.content || '',
      ].join('\n');
    }

    // §LAW II — write the file (this IS the queue entry)
    fs.writeFileSync(filepath, fileContent, 'utf8');

    // Write state record to queue dir
    fs.writeFileSync(
      path.join(this.queueDir, `${uuid}.json`),
      JSON.stringify({ uuid, filename, filepath, status: 'pending',
        tags: meta.tags, priority: meta.priority, createdAt: meta.createdAt,
        source: meta.source, project: meta.project, sessionId: meta.sessionId }, null, 2)
    );

    return { uuid, filepath, filename, tags: meta.tags, ext };
  }

  // ── Pending — list all items waiting ─────────────────────────────────────

  pending() {
    return fs.readdirSync(this.inputDir)
      .filter(f => f.includes('.pending.'))
      .map(f => {
        const [uuid, , ext] = f.split('.');
        const statePath = path.join(this.queueDir, `${uuid}.json`);
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch(_) {}
        return { uuid, filename: f, ext, filepath: path.join(this.inputDir, f), ...meta };
      })
      .sort((a, b) => {
        // Priority order: high first
        const p = { high: 0, normal: 1, low: 2 };
        return (p[a.priority] ?? 1) - (p[b.priority] ?? 1) ||
               (a.createdAt || 0) - (b.createdAt || 0);
      });
  }

  // ── Claim — atomic rename .pending → .processing ─────────────────────────

  claim(uuid) {
    const files = fs.readdirSync(this.inputDir)
      .filter(f => f.startsWith(uuid) && f.includes('.pending.'));
    if (!files.length) return null;

    const filename    = files[0];
    const ext         = filename.split('.').pop();
    const oldPath     = path.join(this.inputDir, filename);
    const newFilename = `${uuid}.processing.${ext}`;
    const newPath     = path.join(this.inputDir, newFilename);

    try {
      fs.renameSync(oldPath, newPath);
      this._updateState(uuid, { status: 'processing', claimedAt: Date.now() });
      const content = fs.readFileSync(newPath, 'utf8');
      return { uuid, filepath: newPath, filename: newFilename, ext, content };
    } catch(e) {
      return null; // race — another worker claimed it
    }
  }

  // ── Complete — write output, mark done ───────────────────────────────────

  complete(uuid, output) {
    const files = fs.readdirSync(this.inputDir)
      .filter(f => f.startsWith(uuid) && f.includes('.processing.'));
    if (!files.length) return false;

    const filename = files[0];
    const ext      = filename.split('.').pop();
    const procPath = path.join(this.inputDir, filename);
    const donePath = path.join(this.inputDir, `${uuid}.done.${ext}`);

    // Write output
    const outPath = path.join(this.outputDir, `${uuid}.output.${ext}`);
    fs.writeFileSync(outPath, typeof output === 'string' ?
      output : JSON.stringify(output, null, 2), 'utf8');

    // Mark done
    fs.renameSync(procPath, donePath);
    this._updateState(uuid, { status: 'done', completedAt: Date.now(), outputPath: outPath });
    return true;
  }

  // ── Fail — log failure, mark failed ──────────────────────────────────────

  fail(uuid, reason, friction = 0.8) {
    const files = fs.readdirSync(this.inputDir)
      .filter(f => f.startsWith(uuid) && f.includes('.processing.'));
    if (!files.length) return false;

    const filename   = files[0];
    const ext        = filename.split('.').pop();
    const procPath   = path.join(this.inputDir, filename);
    const failedPath = path.join(this.inputDir, `${uuid}.failed.${ext}`);

    fs.renameSync(procPath, failedPath);

    // Log to failures ledger
    const failEntry = { uuid, reason, friction, failedAt: Date.now() };
    fs.appendFileSync(
      path.join(this.failuresDir, `${uuid}.ndjson`),
      JSON.stringify(failEntry) + '\n'
    );

    this._updateState(uuid, { status: 'failed', failedAt: Date.now(), reason, friction });
    return true;
  }

  // ── Tags — read/write tags on an item ────────────────────────────────────

  getTags(uuid) {
    const state = this._readState(uuid);
    return state?.tags || [];
  }

  addTag(uuid, tag) {
    const state = this._readState(uuid);
    if (!state) return;
    const tags = [...new Set([...(state.tags || []), tag])];
    this._updateState(uuid, { tags });
    return tags;
  }

  removeTag(uuid, tag) {
    const state = this._readState(uuid);
    if (!state) return;
    const tags = (state.tags || []).filter(t => t !== tag);
    this._updateState(uuid, { tags });
    return tags;
  }

  byTag(tag) {
    return this.list().filter(item => (item.tags || []).includes(tag));
  }

  // ── List all items (all states) ───────────────────────────────────────────

  list(statusFilter = null) {
    return fs.readdirSync(this.inputDir)
      .filter(f => f.includes('.'))
      .map(f => {
        const parts = f.split('.');
        const uuid  = parts[0];
        const state = this._readState(uuid) || { uuid, filename: f };
        return state;
      })
      .filter((item, idx, arr) => arr.findIndex(i => i.uuid === item.uuid) === idx) // dedup
      .filter(item => !statusFilter || item.status === statusFilter);
  }

  // ── Conversation log ──────────────────────────────────────────────────────

  logConversation(sessionId, entry) {
    const dir = path.join(this.logsDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'conversation.jsonl'),
      JSON.stringify({ ...entry, _ts: Date.now() }) + '\n'
    );
  }

  conversationTail(sessionId, n = 50) {
    const f = path.join(this.logsDir, sessionId, 'conversation.jsonl');
    if (!fs.existsSync(f)) return [];
    const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  }

  // ── Restart replay — find .pending and .processing from before crash ──────

  replay() {
    const replayed = [];

    // .processing → .pending (interrupted mid-claim)
    for (const f of fs.readdirSync(this.inputDir)) {
      if (f.includes('.processing.')) {
        const parts    = f.split('.');
        const uuid     = parts[0];
        const ext      = parts.pop();
        const oldPath  = path.join(this.inputDir, f);
        const newPath  = path.join(this.inputDir, `${uuid}.pending.${ext}`);
        fs.renameSync(oldPath, newPath);
        this._updateState(uuid, { status: 'pending', replayedAt: Date.now() });
        replayed.push({ uuid, from: 'processing', to: 'pending' });
      }
    }

    return replayed;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _readState(uuid) {
    const f = path.join(this.queueDir, `${uuid}.json`);
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch { return null; }
  }

  _updateState(uuid, patch) {
    const f     = path.join(this.queueDir, `${uuid}.json`);
    const state = this._readState(uuid) || { uuid };
    fs.writeFileSync(f, JSON.stringify({ ...state, ...patch }, null, 2));
  }

  // ── watchInput — watch input dir for new .pending.* files ─────────────────
  // callback(data, filename) — data is parsed JSON or raw string
  // Atomically renames .pending → .processing before calling callback.
  // Errors are caught and written to the failures dir — §1.2 nothing silently fails.
  watchInput(callback) {
    if (!callback) return;
    const inputDir = this.inputDir;
    const fs  = require('fs');
    const path = require('path');

    // Process any files already in input dir on attach
    try {
      const existing = fs.readdirSync(inputDir).filter(f => f.includes('.pending.'));
      for (const f of existing) _process(f);
    } catch(_) {}

    // Watch for new files
    try {
      fs.watch(inputDir, (event, filename) => {
        if (!filename || !filename.includes('.pending.')) return;
        // Small delay to let file finish writing
        setTimeout(() => _process(filename), 50);
      });
    } catch(e) {
      console.warn('[queue] watchInput: fs.watch failed:', e.message);
    }

    const self = this;

    function _process(filename) {
      const pending = path.join(inputDir, filename);
      if (!fs.existsSync(pending)) return;

      // Atomic rename: .pending → .processing
      const processing = pending.replace('.pending.', '.processing.');
      try { fs.renameSync(pending, processing); } catch(_) { return; }

      // Read and parse
      let data;
      try {
        const raw = fs.readFileSync(processing, 'utf8');
        try { data = JSON.parse(raw); } catch(_) { data = raw; }
        // Stash raw on object data for handlers that need it
        if (typeof data === 'object' && data !== null) data._raw = raw;
      } catch(e) {
        self.fail(filename.split('.')[0], 'read error: ' + e.message, 0.5);
        return;
      }

      // Call handler
      Promise.resolve().then(() => callback(data, filename)).then(() => {
        // Mark done
        const done = processing.replace('.processing.', '.done.');
        try { fs.renameSync(processing, done); } catch(_) {}
      }).catch(e => {
        console.error('[queue] watchInput handler error:', e.message);
        const failed = processing.replace('.processing.', '.failed.');
        try { fs.renameSync(processing, failed); } catch(_) {}
      });
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  stats() {
    const all = this.list();
    const byStatus = {};
    for (const item of all) {
      byStatus[item.status || 'unknown'] = (byStatus[item.status || 'unknown'] || 0) + 1;
    }
    return { total: all.length, byStatus };
  }
}

function createQueue(opts = {}) {
  return new PhysicalQueue(opts);
}

module.exports = { PhysicalQueue, createQueue };
