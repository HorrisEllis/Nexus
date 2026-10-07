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

// §0.39.370 DT1 — onEvent({ kind: 'step', msg, stderr } | { kind: 'end', result }): whoever started the setup hears each
// step and the end as they happen (Idearium makes it a task on the repo that asked) — this file stays Idearium-agnostic.
function start({ installQemu = false, extras = [], node = null, login = null, onEvent = null, _spawn = spawn, _script = PROVISION, _lingerMs = 20000 } = {}) {
  if (job.state === 'running') return status();
  const tell = (e) => { if (typeof onEvent === 'function') { try { onEvent(e); } catch (_) {} } };
  const args = [_script, '--json'];
  if (installQemu) args.push('--install-qemu');
  // §0.39.293 DK1 — 'desktop' was filtered out here, so an image built from idearium's setup never had xfce or the
  // desktop account: the repo desktop booted to a text console where nexus/nexus could not log in (no such user).
  const ex = (extras || []).filter(e => /^(go|ruby|php|rust|desktop)$/.test(e));
  if (ex.length) args.push('--with', ex.join(','));
  if (node && /^(lts|\d{2})$/.test(String(node))) args.push('--node', String(node));
  job = { state: 'running', startedAt: Date.now(), endedAt: null, log: [], result: null, pid: null, args: args.slice(1) };
  const me = job;
  const push = (e) => { me.log.push(e); if (me.log.length > MAX_LOG) me.log.splice(0, me.log.length - MAX_LOG); tell({ kind: 'step', msg: e.msg || e.step || JSON.stringify(e), stderr: !!e.stderr }); };
  let child;
  // §0.39.282 N20 — the desktop account (settings desktop.user/password) reaches provision.js through its env, never argv
  const env = { ...process.env, ...(login && login.user ? { COS_DESKTOP_USER: String(login.user) } : {}), ...(login && login.password ? { COS_DESKTOP_PASSWORD: String(login.password) } : {}) };
  try { child = _spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env }); }
  catch (e) { me.state = 'failed'; me.endedAt = Date.now(); me.result = { ok: false, error: `could not start the setup: ${e.message}` }; tell({ kind: 'end', result: me.result }); return status(); }
  me.pid = child.pid || null;
  // §0.39.344 — James: "okay its stuck." The setup said "ready" and wrote its result, but its process did not exit (on
  // his machine something kept it alive), and the job only settled on exit — so it read "running" forever. The result
  // line is the answer: the job settles on it. A process still alive 20 s after its result is stopped, and that is said.
  let settled = false;
  function _settle() {
    if (settled) return; settled = true;
    me.endedAt = Date.now();
    me.state = me.result && me.result.ok ? 'done' : 'failed';
    tell({ kind: 'end', result: me.result });
    const t = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode) return;
      push({ at: Date.now(), msg: 'the setup reported its result but its process did not exit — stopped it' });
      try { child.kill(); } catch (_) {}
    }, _lingerMs);
    if (t.unref) t.unref();
  }
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch (_) { push({ at: Date.now(), msg: line }); continue; }
      if (m.result) { me.result = m.result; _settle(); } else push(m);
    }
  });
  child.stderr.on('data', (d) => { for (const l of String(d).split('\n').map(x => x.trim()).filter(Boolean)) push({ at: Date.now(), msg: l, stderr: true }); });
  child.on('error', (e) => { if (settled) return; me.result = me.result || { ok: false, error: e.message }; _settle(); });
  child.on('exit', (code) => {
    if (settled) return;   // already settled on its result line
    if (!me.result) me.result = { ok: code === 0, error: code === 0 ? null : `setup exited ${code}` };
    _settle();
  });
  return status();
}

module.exports = { start, status, hostInfo, PROVISION };
