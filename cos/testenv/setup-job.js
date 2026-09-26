'use strict';
/**
 * cos/testenv/setup-job.js — the VM setup as a background job, for the run menu.
 * comp_id: nexus.cos.testenv.setup-job
 * Status: pre-release · §0.39.264
 *
 * "Set up the test VM" in Idearium's COS run menu starts provision.js as a child
 * process (so a 10–40 minute setup never blocks the API) and this keeps its
 * progress: every line provision.js prints with --json becomes an entry the menu
 * polls. One job at a time; a second start while one runs returns the running one.
 *
 * start({ installQemu, extras, node }) -> status()
 * status() -> { state: 'idle'|'running'|'done'|'failed', startedAt, endedAt, log:[…], result, vm, host }
 */
const path = require('path');
const { spawn } = require('child_process');

const PROVISION = path.join(__dirname, 'provision.js');
const MAX_LOG = 400;

let job = { state: 'idle', startedAt: null, endedAt: null, log: [], result: null, pid: null };

function status() {
  let vm = null;
  try { vm = require('./index.js').capabilities().vm; } catch (e) { vm = { ok: false, reason: e.message }; }
  return { ...job, log: job.log.slice(-120), vm, host: hostInfo() };
}

/** §0.39.265 — what the step-by-step setup in the run menu tells the person about this computer */
function hostInfo() {
  const out = { platform: process.platform, home: null, installHint: null, accel: null, qemuPlan: null };
  try { const H = require('./host.js'); out.home = H.home(); out.installHint = H.installHint(); } catch (_) {}
  try { out.accel = require('../compartment/qemu-runtime.js').pickAccelerator(); } catch (_) {}
  try { out.qemuPlan = require('./installer.js').plan('qemu'); } catch (_) {}
  return out;
}

function start({ installQemu = false, extras = [], node = null, _spawn = spawn, _script = PROVISION } = {}) {
  if (job.state === 'running') return status();
  const args = [_script, '--json'];
  if (installQemu) args.push('--install-qemu');
  const ex = (extras || []).filter(e => /^(go|ruby|php|rust)$/.test(e));
  if (ex.length) args.push('--with', ex.join(','));
  if (node && /^(lts|\d{2})$/.test(String(node))) args.push('--node', String(node));
  job = { state: 'running', startedAt: Date.now(), endedAt: null, log: [], result: null, pid: null, args: args.slice(1) };
  const me = job;
  const push = (e) => { me.log.push(e); if (me.log.length > MAX_LOG) me.log.splice(0, me.log.length - MAX_LOG); };
  let child;
  try { child = _spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
  catch (e) { me.state = 'failed'; me.endedAt = Date.now(); me.result = { ok: false, error: `could not start the setup: ${e.message}` }; return status(); }
  me.pid = child.pid || null;
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch (_) { push({ at: Date.now(), msg: line }); continue; }
      if (m.result) me.result = m.result; else push(m);
    }
  });
  child.stderr.on('data', (d) => { for (const l of String(d).split('\n').map(x => x.trim()).filter(Boolean)) push({ at: Date.now(), msg: l, stderr: true }); });
  child.on('error', (e) => { me.state = 'failed'; me.endedAt = Date.now(); me.result = me.result || { ok: false, error: e.message }; });
  child.on('exit', (code) => {
    me.endedAt = Date.now();
    if (!me.result) me.result = { ok: code === 0, error: code === 0 ? null : `setup exited ${code}` };
    me.state = me.result.ok ? 'done' : 'failed';
  });
  return status();
}

module.exports = { start, status, hostInfo, PROVISION };
