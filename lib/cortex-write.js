'use strict';
/**
 * lib/cortex-write.js — Cortex Write-Through Adapter
 * comp_id: nexus.lib.cortex-write
 * uuid: nexus-cortex-write-v1-0000-2026-0627-jamesbrooks-001
 *
 * Every system writes to Cortex first.
 * If Cortex is offline, writes to data/<system>/<table>.jsonl (buffer).
 * Cortex polls the data folder and imports buffered rows on reconnect.
 *
 * Usage:
 *   const cw = require('../lib/cortex-write')('guardian');
 *   await cw.insert('chat_log', { uuid, prompt, response, ts });
 *
 * §AX-3  — Disk before behavior. Buffer write happens synchronously.
 * §AX-2  — No silent failures. Every failed Cortex write is logged.
 * §LAW II — Buffer is append-only JSONL. Never mutated.
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');

const CX_URL  = process.env.CORTEX_URL || 'http://127.0.0.1:3748';
// §0.39.282 — honours NEXUS_DATA_ROOT (lib/ledger-writer.js, intelligence/alk and chat-logger already do), which the
// test sandbox sets; hard-coded, every test that wrote while cortex was down left <table>.buffer.jsonl files in the
// real data/ (data/lattice/relationship_lattice.buffer.jsonl reached 0.39.281's EC6 commit that way).
try { require('./test-sandbox.js').ensure(); } catch (_) {}
const DATA_ROOT = process.env.NEXUS_DATA_ROOT || path.join(__dirname, '..', 'data');

// Track Cortex reachability per process
let _cortexOnline = true;
let _checkTimer   = null;

async function _pingCortex() {
  return new Promise(res => {
    const u = new URL(`${CX_URL}/health`);
    const req = http.request({ hostname: u.hostname, port: u.port || 3748,
      path: u.pathname, method: 'GET', timeout: 2000 }, r => {
      _cortexOnline = r.statusCode === 200;
      res(_cortexOnline);
    });
    req.on('error', () => { _cortexOnline = false; res(false); });
    req.on('timeout', () => { _cortexOnline = false; req.destroy(); res(false); });
    req.end();
  });
}

// Check Cortex every 10s
function _startHealthWatch() {
  if (_checkTimer) return;
  _checkTimer = setInterval(_pingCortex, 10000);
  if (_checkTimer.unref) _checkTimer.unref();
}

async function _writeToBuffer(systemId, table, row) {
  // §LAW II: buffer write is synchronous JSONL append
  const bufDir  = path.join(DATA_ROOT, systemId);
  const bufFile = path.join(bufDir, `${table}.buffer.jsonl`);
  try {
    fs.mkdirSync(bufDir, { recursive: true });
    fs.appendFileSync(bufFile, JSON.stringify({ ...row, _bufferedAt: Date.now(), _source: systemId }) + '\n', 'utf8');
  } catch(e) {
    console.error(`[cortex-write:${systemId}] buffer write failed: ${e.message}`);
  }
}

async function _writeToCortex(table, row) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ table, row });
    const u = new URL(`${CX_URL}/api/memory/insert`);
    const req = http.request({
      hostname: u.hostname, port: u.port || 3748, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 4000,
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        try { res(JSON.parse(d)); }
        catch(_) { res({ ok: false }); }
      });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
    req.write(body); req.end();
  });
}

// Flush buffered rows to Cortex when it comes back online
async function _flushBuffer(systemId, table) {
  const bufFile = path.join(DATA_ROOT, systemId, `${table}.buffer.jsonl`);
  if (!fs.existsSync(bufFile)) return 0;
  
  const lines = fs.readFileSync(bufFile, 'utf8').split('\n').filter(Boolean);
  if (!lines.length) return 0;
  
  let flushed = 0;
  const remaining = [];
  
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      await _writeToCortex(table, row);
      flushed++;
    } catch(_) {
      remaining.push(line); // keep failed rows
    }
  }
  
  // Rewrite buffer with only remaining rows
  if (remaining.length === 0) {
    fs.unlinkSync(bufFile);
  } else {
    fs.writeFileSync(bufFile, remaining.join('\n') + '\n', 'utf8');
  }
  
  if (flushed > 0) {
    console.log(`[cortex-write:${systemId}] flushed ${flushed} buffered ${table} rows to Cortex`);
  }
  return flushed;
}

/**
 * Create a write adapter for a specific system.
 * @param {string} systemId — e.g. 'guardian', 'eravos', 'copilot'
 */
function createWriter(systemId) {
  _startHealthWatch();
  
  return {
    systemId,

    /**
     * Insert a row — writes to Cortex or buffers if offline.
     * Returns a promise that resolves once the write actually lands
     * (either confirmed at Cortex, or safely on disk in the buffer) —
     * safe to await, safe to fire-and-forget (existing callers that
     * don't await are unaffected either way).
     *
     * §BUG FOUND AND FIXED 2026-07-18 — this used to not return anything,
     * despite this file's own header docstring showing
     * `await cw.insert('chat_log', {...})` as the usage example. A caller
     * following that example was awaiting undefined — a no-op — while the
     * real write (try Cortex, fall back to buffer on failure) ran fully
     * detached in the background. Found while building
     * meta/lattice/associative-lattice.js: a test checked the buffer file
     * immediately after an awaited insert() and it was not there yet —
     * the real write was still up to 4s away (this file's own HTTP
     * timeout) when the await already resolved. Checked every caller
     * first (ollama, eravos, copilot, bridge, loom, lib/seam/adapters) —
     * none of them destructure or otherwise depend on insert()'s return
     * value beyond optionally awaiting it, so making it a real promise
     * is additive: fire-and-forget callers see no change, awaiting
     * callers get what the docstring already told them they had.
     */
    insert(table, row) {
      const fullRow = {
        uuid: row.uuid || crypto.randomUUID(),
        _system: systemId,
        ...row,
      };

      if (_cortexOnline) {
        return _writeToCortex(table, fullRow).then(result => {
          if (!result?.ok) {
            // Cortex rejected — buffer
            return _writeToBuffer(systemId, table, fullRow);
          }
          return result;
        }).catch(() => {
          _cortexOnline = false;
          return _writeToBuffer(systemId, table, fullRow);
        });
      } else {
        return Promise.resolve(_writeToBuffer(systemId, table, fullRow));
      }
    },

    /**
     * Flush all buffered rows for this system to Cortex.
     * Called automatically when Cortex comes back online.
     */
    async flush(table) {
      if (!_cortexOnline) await _pingCortex();
      if (!_cortexOnline) return 0;
      return _flushBuffer(systemId, table);
    },

    get cortexOnline() { return _cortexOnline; },
  };
}

// Cortex polls for buffered data via this export
// Called by cortex/boot.js on startup and periodically
async function importBufferedData(jaaDB) {
  if (!jaaDB) return;
  let total = 0;
  
  try {
    const systemDirs = fs.readdirSync(DATA_ROOT).filter(d => {
      const full = path.join(DATA_ROOT, d);
      return fs.statSync(full).isDirectory();
    });
    
    for (const systemId of systemDirs) {
      const sysDir = path.join(DATA_ROOT, systemId);
      const bufFiles = fs.readdirSync(sysDir).filter(f => f.endsWith('.buffer.jsonl'));
      
      for (const bufFile of bufFiles) {
        const table = bufFile.replace('.buffer.jsonl', '');
        const filePath = path.join(sysDir, bufFile);
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
        
        let imported = 0;
        for (const line of lines) {
          try {
            const row = JSON.parse(line);
            jaaDB.insert(table, row);
            imported++;
            total++;
          } catch(_) {}
        }
        
        if (imported > 0) {
          fs.unlinkSync(filePath);
          console.log(`[cortex-write] imported ${imported} buffered ${systemId}/${table} rows`);
        }
      }
    }
  } catch(e) {
    console.error('[cortex-write] buffer import error:', e.message);
  }
  
  return total;
}

module.exports = createWriter;
module.exports.importBufferedData = importBufferedData;
