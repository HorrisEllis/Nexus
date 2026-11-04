'use strict';
/**
 * cos/manager/updates.js — Nexus's update, as COS's: what GitHub has, per system, and the update tool behind it. CE2, 0.60.376.
 * Spec map: docs/2026-11-02-cos-enterprise-phasemap.spec CE2 (CE_D0: one update, announced and restarted per system; CE_D1 keep mine).
 * James, 2026-11-02: "i want toasts in cos ui for gibhub updates with a update tool. so i can update nexus automatically. per system"
 *
 *   createUpdates(sup, { root, emit })
 *     check({ fetch })        → the kernel's check, plus per system: which supervised systems it changes, what restarts, what waits for him
 *     apply({ mode, by })     → mode 'update' (apply) or 'keep-local' (CE3); then each changed system restarted by itself through the
 *                               supervisor; Clear Glass never restarted under him (waitForHim); a change to COS itself said, not restarted
 *     busy()                  → the update running now, or null (one at a time: a second is refused)
 * The git work runs in update-run.js's own process; this file never blocks the supervisor. Every step is an event (emit 'cos.update').
 */
const path = require('path');
const { execFile } = require('child_process');

function createUpdates(sup, { root = path.resolve(__dirname, '..', '..'), emit = () => {}, timeoutMs = 25 * 60000 } = {}) {
  let running = null;
  const U = () => require('../../lib/nexus-update.js');
  const names = () => sup.list().map(s => s.name);
  function run(op, opts = {}) {
    return new Promise((resolve) => {
      execFile(process.execPath, [path.join(__dirname, 'update-run.js'), op, root, JSON.stringify(opts)], { cwd: root, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          const line = String(stdout || '').trim().split('\n').filter(Boolean).pop();
          try { return resolve(JSON.parse(line)); } catch (_) {}
          resolve({ ok: false, error: err ? `the update did not finish: ${err.killed ? `stopped after ${Math.round(timeoutMs / 60000)} min` : err.message}` : `no answer from the update (${String(stderr || '').trim().split('\n').pop() || 'empty'})` });
        });
    });
  }
  // the systems a set of changed folders touches, in COS's terms: restarted now, waiting for him, or COS itself
  function perSystem(folders = [], lockChanged = false) {
    const plan = U().restartPlan(folders, lockChanged, names());
    return { changed: folders, restart: plan.restart, waitForHim: plan.waitForHim, kernelChanged: plan.supervisorChanged, cosChanged: folders.includes('cos') };
  }
  async function check({ fetch = false } = {}) {
    const c = await run('check', { fetch });
    if (!c || !c.ok) return c || { ok: false, error: 'no answer' };
    return { ...c, perSystem: perSystem(c.systems || [], !!c.lockChanged), busy: running };
  }
  async function apply({ mode = 'update', by = 'person' } = {}) {
    if (running) return { ok: false, busy: running, error: `an update is already running (${running.mode}, since ${new Date(running.at).toLocaleTimeString()})` };
    if (!['update', 'keep-local'].includes(mode)) return { ok: false, error: `mode must be update or keep-local, not "${mode}"` };
    running = { mode, by, at: Date.now() }; emit('cos.update', { phase: 'started', mode, by });
    try {
      const r = await run(mode === 'keep-local' ? 'keep-local' : 'apply', { confirm: true, by });
      if (!r || !r.ok || r.action === 'none') { emit('cos.update', { phase: r && r.ok ? 'none' : 'refused', mode, error: r && r.error, why: r && r.why }); return r; }
      const lockChanged = !!(r.npm && (r.npm.ran || /changed,/.test(r.npm.why || '')));
      const ps = perSystem(r.systems || [], lockChanged);
      const restarted = [];
      for (const name of ps.restart) {
        try { const v = sup.restart(name, { by: `update:${by}` }); restarted.push({ name, ok: true, state: v && v.state }); emit('cos.update', { phase: 'restarted', name }); }
        catch (e) { restarted.push({ name, ok: false, error: e.message }); emit('cos.update', { phase: 'restart-failed', name, error: e.message }); }
      }
      const out = { ...r, perSystem: ps, restarted, said: [
        ...(ps.waitForHim.length ? [`${ps.waitForHim.join(', ')} changed too: restart it when you are not using it (never restarted under you)`] : []),
        ...(ps.cosChanged || ps.kernelChanged ? ['COS or the kernel changed: the next start of COS loads it'] : []),
      ] };
      emit('cos.update', { phase: 'updated', mode, from: r.from && r.from.version, to: r.to && r.to.version, restarted: restarted.map(x => x.name), waitForHim: ps.waitForHim, keptOn: r.keptOn || null });
      return out;
    } finally { running = null; }
  }
  // SC7 0.60.380 — James, 2026-11-02: "A gear, with update settings and Build that update section in cos." The kernel's update settings (read and
  // written in-process: two small files), the history, and roll back (in its own process, then each changed system restarted, as apply)
  function settings() { const p = U().getPolicy({ root }); let a = null; try { a = U().autoState({ root }); } catch (_) {} return { ok: true, settings: p, last: a, options: { policy: ['auto', 'notify', 'off'], everyHours: [1, 168], keepLocal: ['auto', 'ask'] } }; }
  function setSettings(patch = {}, { by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who acts: { "by": "person" }' };
    if (/^agent:/.test(String(by))) return { ok: false, code: 403, error: 'an agent proposes; the update settings are a person\'s' };
    const allowed = ['policy', 'everyHours', 'keepLocal'], bad = Object.keys(patch).filter(k => !allowed.includes(k));
    if (bad.length) return { ok: false, code: 400, error: `no update setting ${bad.join(', ')} (${allowed.join(', ')})` };
    const before = U().getPolicy({ root }); const r = U().setPolicy({ root, ...patch });
    if (!r.ok) return { ...r, code: 400 };
    if (sup.note) sup.note('update-settings', Object.keys(patch).map(k => `${k} ${before[k]} → ${r[k]}`).join(', '), { by });
    try { require('../../lib/versionium-record.js').record({ kind: 'cos.update-settings', by, message: `COS: update settings — ${Object.keys(patch).join(', ')}`, change: { before, after: r } }).catch(() => {}); } catch (_) {}
    return settings();
  }
  const history = ({ limit = 50 } = {}) => ({ ok: true, history: U().history({ root }).slice(0, Math.max(1, Math.min(Number(limit) || 50, 500))) });
  async function rollback({ by = 'person' } = {}) {
    if (running) return { ok: false, busy: running, error: `an update is running (${running.mode})` };
    running = { mode: 'rollback', by, at: Date.now() }; emit('cos.update', { phase: 'started', mode: 'rollback', by });
    try {
      const r = await run('rollback', { confirm: true, by });
      if (!r || !r.ok) { emit('cos.update', { phase: 'refused', mode: 'rollback', error: r && r.error }); return r || { ok: false, error: 'no answer' }; }
      const ps = perSystem(r.systems || [], !!(r.npm && r.npm.ran)); const restarted = [];
      for (const name of ps.restart) { try { sup.restart(name, { by: `rollback:${by}` }); restarted.push({ name, ok: true }); emit('cos.update', { phase: 'restarted', name }); } catch (e) { restarted.push({ name, ok: false, error: e.message }); emit('cos.update', { phase: 'restart-failed', name, error: e.message }); } }
      emit('cos.update', { phase: 'updated', mode: 'rollback', from: r.from && r.from.version, to: r.to && r.to.version, restarted: restarted.map(x => x.name), waitForHim: ps.waitForHim });
      return { ...r, perSystem: ps, restarted };
    } finally { running = null; }
  }
  return { check, apply, rollback, settings, setSettings, history, busy: () => running, perSystem };
}

module.exports = { createUpdates };
