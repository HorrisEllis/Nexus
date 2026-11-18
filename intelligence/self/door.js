'use strict';
/**
 * intelligence/self/door.js — Intelligence scans itself (IP13, docs/2026-11-05-intelligence-data-pipeline-phasemap.spec).
 * James, 2026-11-18: "using the intelligence system to scan itself?" · "it needs to be able to do" · "also emerge?"
 * Only Node can read its own heap, so this door takes the numbers; the judgment is Emerge's (intelligence/self/scan.eg).
 *   register(name, fn)  a module says what it holds: fn() → { items, approxMB? }
 *   numbers()           → { at, rssMB, heapUsedMB, heapTotalMB, externalMB, spaces, holders }
 *   capMB()             → the heap cap this process was started with (--max-old-space-size), or null
 *   scan({ dataDir })   → Emerge's verdict on now against the last scan; the scan kept as a line (persistence)
 *   snapshot({ dataDir }) → a V8 heap snapshot written to its data, its path returned (a person or a gate opens it)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const v8 = require('v8');
const { execFile } = require('child_process');

const MB = (n) => Math.round((Number(n) || 0) / 1048576 * 10) / 10;
const holders = new Map();
const EG = path.join(__dirname, '..', '..', 'emerge', 'emerge', 'lang', 'eg.js');
const SCAN = path.join(__dirname, 'scan.eg');

function register(name, fn) { if (name && typeof fn === 'function') holders.set(String(name), fn); }

function numbers() {
  const m = process.memoryUsage();
  const spaces = v8.getHeapSpaceStatistics().map((s) => ({ name: s.space_name, usedMB: MB(s.space_used_size) })).filter((s) => s.usedMB > 0);
  const held = [];
  for (const [name, fn] of holders) {
    try { const r = fn() || {}; held.push({ name, items: Number(r.items) || 0, ...(r.approxMB != null ? { approxMB: r.approxMB } : {}) }); }
    catch (e) { held.push({ name, items: 0, error: e.message }); }
  }
  return { at: Date.now(), rssMB: MB(m.rss), heapUsedMB: MB(m.heapUsed), heapTotalMB: MB(m.heapTotal), externalMB: MB(m.external), spaces, holders: held };
}

function capMB() {
  const flag = process.execArgv.concat(String(process.env.NODE_OPTIONS || '').split(/\s+/)).find((a) => /^--max-old-space-size=\d+$/.test(a));
  return flag ? Number(flag.split('=')[1]) : null;
}

function _lastOf(file) {
  try { const lines = fs.readFileSync(file, 'utf8').trim().split('\n'); return JSON.parse(lines[lines.length - 1]).now || null; } catch (_) { return null; }
}

function scan({ dataDir } = {}) {
  const dir = path.join(dataDir || path.join(__dirname, '..', 'data'), 'self');
  const file = path.join(dir, 'scans.jsonl');
  const now = numbers(), cap = capMB(), prev = _lastOf(file);
  const q = path.join(os.tmpdir(), `intelligence-self-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(q, JSON.stringify({ now, prev, capMB: cap }));
  return new Promise((resolve) => {
    execFile(process.execPath, [EG, 'run', SCAN, 'judge', q], { timeout: 60000, windowsHide: true, maxBuffer: 4 << 20 }, (err, out, errOut) => {
      try { fs.unlinkSync(q); } catch (_) {}
      let verdict = null;
      try { verdict = JSON.parse(String(out).trim().split('\n').pop()); } catch (_) {}
      if (!verdict) return resolve({ ok: false, error: `Emerge did not judge the scan: ${String(errOut || (err && err.message) || out).trim().split('\n').pop()}`, now, capMB: cap });
      try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(file, JSON.stringify({ now, capMB: cap, verdict: verdict.verdict }) + '\n'); } catch (_) {}
      resolve({ ok: true, ...verdict, now });
    });
  });
}

function snapshot({ dataDir } = {}) {
  const dir = path.join(dataDir || path.join(__dirname, '..', 'data'), 'self');
  fs.mkdirSync(dir, { recursive: true });
  const file = v8.writeHeapSnapshot(path.join(dir, `heap-${new Date().toISOString().replace(/[:.]/g, '-')}.heapsnapshot`));
  let sizeMB = null; try { sizeMB = MB(fs.statSync(file).size); } catch (_) {}
  return { ok: true, file, sizeMB, open: 'Chrome DevTools → Memory → Load (the file is the process\'s heap at this moment)' };
}

module.exports = { register, numbers, capMB, scan, snapshot };
