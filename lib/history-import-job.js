'use strict';
/**
 * lib/history-import-job.js — importing NEXUS history from release zips, as a background job (0.39.283, N30 of
 * docs/2026-09-29-nex-node-store-phasemap.spec).
 *
 * James, 2026-09-29: "can you give copilot a command … like i want to import my archives of nexus. have it pull up a
 * drop box ui and run the command?" The drop box (idearium/ui/archive-import.html) calls idearium, idearium calls this:
 * cli/import-history.js runs as a CHILD process with --jsonl, so 700 zips never block idearium's event loop (the lesson
 * of N28), and every line it prints becomes progress the page polls. One job at a time; a second start while one runs
 * returns the running one. Mirrors cos/testenv/setup-job.js.
 *
 *   start({ paths, folder, dryRun, rebuild, into }) -> status()     paths go through a --list file (a Windows command
 *                                                                      line holds ~32K chars; 700 paths do not fit)
 *   status() -> { state: idle|running|done|failed, dryRun, total, done, current, rows, order, result, log, inbox }
 *   inboxDir() -> where a browser's uploaded zips land (data root, never committed)
 *   saveUpload(name, readable) -> Promise<{ ok, path, bytes }>       a dropped zip streamed to the inbox
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MODULE_ID = 'nexus.lib.history-import-job';
const VERSION = '1.0.0';
const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'cli', 'import-history.js');
const MAX_LOG = 300;

let job = { state: 'idle', startedAt: null, endedAt: null, dryRun: false, total: 0, done: 0, current: null, rows: [], order: null, result: null, log: [], pid: null };

function inboxDir() {
  const d = path.join(process.env.NEXUS_DATA_ROOT || path.join(ROOT, 'data'), 'history-import', 'inbox');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function status() {
  return { ...job, log: job.log.slice(-80), rows: job.rows.slice(-1000), inbox: inboxDir(), into: job.into || ROOT };
}

function _safeName(name) {
  const base = path.basename(String(name || '')).replace(/[^\w.\-() ]+/g, '_').slice(0, 180);
  return /\.zip$/i.test(base) ? base : null;
}

/** saveUpload(name, readable) — stream one dropped zip into the inbox (a name already there is replaced) */
function saveUpload(name, readable) {
  const safe = _safeName(name);
  if (!safe) return Promise.resolve({ ok: false, error: 'only .zip files' });
  const dest = path.join(inboxDir(), safe);
  return new Promise((resolve) => {
    const out = fs.createWriteStream(dest);
    let bytes = 0;
    readable.on('data', (c) => { bytes += c.length; });
    readable.on('error', (e) => { out.destroy(); resolve({ ok: false, error: e.message }); });
    out.on('error', (e) => resolve({ ok: false, error: e.message }));
    out.on('finish', () => resolve({ ok: true, path: dest, bytes, name: safe }));
    readable.pipe(out);
  });
}

/**
 * start({ paths, folder, dryRun, rebuild, into, _spawn }) — paths: zip files (a dropped file's real path in Electron,
 * or an uploaded one in the inbox); folder: a folder of zips on this machine. into: the git checkout (default: NEXUS).
 */
function start({ paths = [], folder = null, dryRun = false, rebuild = false, into = null, recursive = false, _spawn = spawn } = {}) {
  if (job.state === 'running') return status();
  const inputs = [...(Array.isArray(paths) ? paths : []), ...(folder ? [folder] : [])].map(String).filter(Boolean);
  const missing = inputs.filter(p => !fs.existsSync(p));
  if (!inputs.length || missing.length) {
    job = { ...job, state: 'failed', startedAt: Date.now(), endedAt: Date.now(), result: { ok: false, error: !inputs.length ? 'nothing to import — drop zips or give a folder' : `not found on this machine: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5})` : ''}` } };
    return status();
  }
  const listDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-history-list-'));
  const list = path.join(listDir, 'zips.txt');
  fs.writeFileSync(list, inputs.join('\n'));
  const target = into || ROOT;
  const args = [CLI, '--jsonl', '--into', target, '--list', list, ...(dryRun ? ['--dry-run'] : []), ...(rebuild ? ['--rebuild'] : []), ...(recursive ? ['--recursive'] : [])];
  job = { state: 'running', startedAt: Date.now(), endedAt: null, dryRun: !!dryRun, total: 0, done: 0, current: null, rows: [], order: null, result: null, log: [], pid: null, into: target, inputs: inputs.length };
  const me = job;
  const push = (msg, extra = {}) => { me.log.push({ at: Date.now(), msg, ...extra }); if (me.log.length > MAX_LOG) me.log.splice(0, me.log.length - MAX_LOG); };
  let child;
  try { child = _spawn(process.execPath, args, { cwd: target, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: process.env }); }
  catch (e) { me.state = 'failed'; me.endedAt = Date.now(); me.result = { ok: false, error: `could not start the import: ${e.message}` }; return status(); }
  me.pid = child.pid || null;
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch (_) { push(line); continue; }
      if (m.result) { me.result = m.result; continue; }
      const e = m.event || {};
      if (e.phase === 'scan') { me.total = e.total; push(`scanning ${e.total} zip(s)`); }
      else if (e.phase === 'scanned') { me.current = `scanning ${e.i}/${e.total} · ${e.zip}`; }
      else if (e.phase === 'order') { me.order = e.order; push(`order ready: ${e.order.length} zip(s)`); }
      else if (e.phase === 'zip') { me.done = e.i; me.total = e.total; me.current = e.zip; me.rows.push({ zip: e.zip, version: e.version, date: e.date, hasGit: e.hasGit, status: e.status, commit: e.commit || null, duplicateOf: e.duplicateOf || null, gitRefs: e.gitRefs || null, error: e.error || null, note: e.note || null }); }
    }
  });
  child.stderr.on('data', (d) => { for (const l of String(d).split('\n').map(x => x.trim()).filter(Boolean)) push(l, { stderr: true }); });
  child.on('error', (e) => { me.state = 'failed'; me.endedAt = Date.now(); me.result = me.result || { ok: false, error: e.message }; });
  child.on('exit', (code) => {
    me.endedAt = Date.now(); me.current = null;
    if (!me.result) me.result = { ok: code === 0, error: code === 0 ? null : `the import exited ${code}` };
    me.state = me.result.ok || (me.result.counts && !me.result.error && Object.keys(me.result.counts).some(k => k !== 'failed')) ? 'done' : 'failed';
    try { fs.rmSync(listDir, { recursive: true, force: true }); } catch (_) {}
  });
  return status();
}

module.exports = { MODULE_ID, VERSION, CLI, start, status, inboxDir, saveUpload, _safeName };
