'use strict';
/**
 * cos/workspace/vm-control.js — a compartment desktop's VM, controlled like VMware: pause, resume, live checkpoints,
 * rewind. §0.39.371 VM1 · docs/2026-10-05-cos-machines-phasemap.spec (VM1_control_like_vmware) and
 * docs/2026-10-07-compartment-control-and-activity-phasemap.spec (VM1_checkpoints_on_the_log).
 *
 * James: "I want to use snapshots, pause, rewind, etc. like full VMware style. Not actual VMware."
 *
 * Every desktop VM already opens a QMP channel (qemu-runtime.js buildQemuArgs); it was used only to cut the network.
 * Over it:
 *   pause / resume   QMP stop / cont — the VM freezes where it is, memory and all
 *   checkpoint       HMP savevm <tag> — a LIVE snapshot: disk, memory and devices, so a restore lands mid-session with
 *                    the processes that were running. Kept in the desktop disk itself (qcow2 internal snapshots).
 *   rewind           HMP loadvm <tag> — back to that moment
 *   checkpoints      the compartment's checkpoint index (label, what made it, when), checked against `info snapshots`
 * A Linux host shares the repo into the VM over 9p (vvfat where 9p is missing), and QEMU refuses to migrate — so to
 * live-snapshot — a VM with either export: said, never attempted (stop the desktop for a disk-only snapshot: qemu-img, cos vm snapshot).
 * The index lives beside the disk (<state>/.cos-desktop/checkpoints.json) — written atomically, kept (§0.3).
 */
const fs = require('fs');
const path = require('path');

const INDEX = 'checkpoints.json';
const TAG_RE = /^cp-[a-z0-9-]{4,60}$/;

function _ws() { return require('./index.js'); }
function _q() { return require('../compartment/qemu-runtime.js'); }

function _session(compartmentId) {
  const s = _ws()._sessions.get(compartmentId);
  if (!s) return { error: 'the desktop is not running — start it first' };
  if (s.exited !== null) return { error: `the desktop has stopped (exit ${s.exited})` };
  if (!s.built || !s.built.qmp) return { error: 'this desktop has no QMP channel' };
  return { s };
}

/** _with(compartmentId, fn, { _client }) — connect to the VM's QMP, run fn(client), always disconnect */
async function _with(compartmentId, fn, { _client = null, timeoutMs = 8000 } = {}) {
  const { s, error } = _session(compartmentId);
  if (error) return { ok: false, error };
  const c = _client || new (_q().QMPClient)(s.built.qmp);
  try { await c.connect(timeoutMs); return await fn(c, s); }
  catch (e) { return { ok: false, error: e.message }; }
  finally { try { c.disconnect(); } catch (_) {} }
}

/** HMP replies with '' on success and the error's text otherwise */
function _hmpOk(out) { const t = String(out || '').trim(); return !t || !/error|fail|not |cannot|can't|unable|refus/i.test(t) ? { ok: true, said: t || null } : { ok: false, error: t }; }

function _indexPath(s) { return path.join(path.dirname(s.disk), INDEX); }
function _readIndex(s) { try { return JSON.parse(fs.readFileSync(_indexPath(s), 'utf8')); } catch (_) { return []; } }
function _writeIndex(s, list) {
  const p = _indexPath(s);
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = `${p}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(list, null, 2)); fs.renameSync(tmp, p); } catch (_) {}
}

async function status(compartmentId, opts = {}) {
  return _with(compartmentId, async (c) => { const r = await c.command('query-status'); return { ok: true, running: !!r.running, status: r.status }; }, opts);
}
async function pause(compartmentId, opts = {}) {
  return _with(compartmentId, async (c) => { await c.command('stop'); const r = await c.command('query-status'); return { ok: true, status: r.status }; }, opts);
}
async function resume(compartmentId, opts = {}) {
  return _with(compartmentId, async (c) => { await c.command('cont'); const r = await c.command('query-status'); return { ok: true, status: r.status }; }, opts);
}

/**
 * checkpoint(compartmentId, { label, causedBy }) -> { ok, checkpoint: { tag, label, causedBy, ts } } — a live snapshot.
 * causedBy: what it was taken before (a task id), so the activity log can offer "back to before this".
 */
async function checkpoint(compartmentId, { label = null, causedBy = null, ...opts } = {}) {
  const { s, error } = _session(compartmentId);
  if (error) return { ok: false, error };
  const sk = s.built.share && s.built.share.kind;
  if (sk === '9p' || sk === 'vvfat') return { ok: false, code: 'NO_LIVE_SNAPSHOT_SHARE', error: `a live checkpoint is refused while the repo is shared in over ${sk} — QEMU cannot snapshot a VM with that export; stop the desktop for a disk-only snapshot` };
  const tag = `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return _with(compartmentId, async (c) => {
    const r = _hmpOk(await c.humanMonitorCommand(`savevm ${tag}`));
    if (!r.ok) return { ok: false, error: `savevm refused: ${r.error}` };
    const cp = { tag, label: label ? String(label).slice(0, 200) : null, causedBy: causedBy || null, ts: Date.now() };
    _writeIndex(s, [..._readIndex(s), cp]);
    return { ok: true, checkpoint: cp };
  }, opts);
}

/** checkpoints(compartmentId) -> { ok, checkpoints: [{ tag, label, causedBy, ts, present }] } — newest first */
async function checkpoints(compartmentId, opts = {}) {
  const { s, error } = _session(compartmentId);
  if (error) return { ok: false, error };
  const list = _readIndex(s);
  const r = await _with(compartmentId, async (c) => ({ ok: true, info: String(await c.humanMonitorCommand('info snapshots') || '') }), opts);
  const have = r.ok ? new Set((r.info.match(/cp-[a-z0-9-]+/g) || [])) : null;
  return { ok: true, checkpoints: list.map(x => ({ ...x, present: have ? have.has(x.tag) : null })).sort((a, b) => b.ts - a.ts), ...(r.ok ? {} : { warning: `could not read the VM's snapshot list: ${r.error}` }) };
}

/** rewind(compartmentId, tag) — the VM goes back to that checkpoint: disk, memory, processes */
async function rewind(compartmentId, tag, opts = {}) {
  if (!TAG_RE.test(String(tag || ''))) return { ok: false, error: `not a checkpoint tag: ${tag}` };
  const { s, error } = _session(compartmentId);
  if (error) return { ok: false, error };
  const cp = _readIndex(s).find(x => x.tag === tag);
  if (!cp) return { ok: false, error: `no checkpoint ${tag} in this desktop` };
  return _with(compartmentId, async (c) => {
    const r = _hmpOk(await c.humanMonitorCommand(`loadvm ${tag}`));
    if (!r.ok) return { ok: false, error: `loadvm refused: ${r.error}` };
    _writeIndex(s, _readIndex(s).map(x => x.tag === tag ? { ...x, restoredAt: [...(x.restoredAt || []), Date.now()] } : x));
    return { ok: true, checkpoint: cp };
  }, opts);
}

module.exports = { MODULE_ID: 'cos.workspace.vm-control', VERSION: '1.0.0', status, pause, resume, checkpoint, checkpoints, rewind, TAG_RE };
