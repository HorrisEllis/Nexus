'use strict';
/**
 * cos/manager/notices.js — COS's bell: kept notices, read and unread (SC1, 0.60.380).
 * Spec: cos/spec/cos-manager.spec MOD-MG-NOTICES · Map: docs/2026-11-02-cos-console-phasemap.spec SC1_the_bell.
 *
 * James, 2026-11-02: "Also have a notification bell for update, system status,  notications"
 *
 * Before this a notice was a toast that vanished: a crash at 3 a.m. was gone by morning. Now each one is kept (newest NOTICE_KEEP) until he
 * reads it. Three kinds, as he named them: update (GitHub has a newer Nexus, once per version; what an update did), system (a crash, an open
 * circuit, a refusal, a system over a limit, a phase with no health, RAID refusing a rule), notice (a proposal waiting for him, a system added,
 * COS's own word). A notice with a key is told once (the same update version never twice). The store is COS's own data, never committed.
 *
 *   createNotices({ file, keep, emit }) → { add(n), list({ unread, kind, limit }), read({ ids | all }), counts(), fromLedger(entry), fromUpdate(ev), fromNotice(n) }
 */
const fs = require('fs');
const path = require('path');

const KINDS = ['update', 'system', 'notice'];
const LEVELS = ['info', 'warn', 'error'];

// the ledger lines worth a bell (the rest — spawn, stop asked for, a wall's audit line — are the ledger's, not his attention's)
const FROM_LEDGER = {
  crash: { kind: 'system', level: 'error', title: (e) => `${e.system} crashed` },
  'circuit-open': { kind: 'system', level: 'error', title: (e) => `${e.system} stopped restarting (circuit open)` },
  refused: { kind: 'system', level: 'warn', title: (e) => `${e.system || 'COS'} was refused a start` },
  'over-limit': { kind: 'system', level: 'warn', title: (e) => `${e.system} is over its limit` },
  'no-restart': { kind: 'system', level: 'warn', title: (e) => `${e.system} crashed and was left down` },
  health: { kind: 'system', level: 'warn', title: (e) => `${e.system} did not answer its health check` },
  'raid-refused': { kind: 'system', level: 'warn', title: (e) => `RAID refused a rule on ${e.system || 'COS'}` },
  'restart-failed': { kind: 'system', level: 'error', title: (e) => `${e.system} could not be restarted` },
  'proposal-held': { kind: 'notice', level: 'info', title: (e) => `${String(e.by || 'an agent').replace(/^agent:/, '')} proposes an act on ${e.system}` },
  declared: { kind: 'notice', level: 'info', title: (e) => `${e.system} was added to COS` },
};

function createNotices({ file, keep = 300, emit = () => {} } = {}) {
  if (!file) throw new Error('notices need a file (COS\'s data)');
  let all = []; try { all = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(all)) all = []; } catch (_) {}
  let seq = 0, dirty = null;
  const save = () => { clearTimeout(dirty); dirty = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = `${file}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(all)); fs.renameSync(t, file); } catch (_) {} }, 200); if (dirty.unref) dirty.unref(); };
  const flush = () => { clearTimeout(dirty); try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(all)); } catch (_) {} };

  function add({ kind = 'notice', level = 'info', title, body = '', system = null, key = null, action = null, at = Date.now() } = {}) {
    if (!title) throw Object.assign(new Error('a notice needs a title'), { code: 400 });
    if (!KINDS.includes(kind)) throw Object.assign(new Error(`kind is ${KINDS.join(', ')}`), { code: 400 });
    if (!LEVELS.includes(level)) level = 'info';
    if (key && all.some(n => n.key === key)) return null;   // told once
    const n = { id: `n-${Date.now().toString(36)}${(seq++).toString(36)}`, at, kind, level, title: String(title).slice(0, 200), body: String(body || '').slice(0, 1000), system, key, action, read: false };
    all.unshift(n); if (all.length > keep) all.length = keep;
    save(); emit('cos.notice', { notice: n, counts: counts() });
    return n;
  }
  function list({ unread = false, kind = null, limit = 100 } = {}) {
    return all.filter(n => (!unread || !n.read) && (!kind || n.kind === kind)).slice(0, Math.max(1, Math.min(Number(limit) || 100, keep)));
  }
  function read({ ids = null, all: every = false } = {}) {
    let changed = 0;
    for (const n of all) if (!n.read && (every || (ids || []).includes(n.id))) { n.read = true; changed++; }
    if (changed) { save(); emit('cos.notice', { read: changed, counts: counts() }); }
    return { read: changed, counts: counts() };
  }
  function counts() {
    const c = { unread: 0, update: 0, system: 0, notice: 0, error: 0 };
    for (const n of all) if (!n.read) { c.unread++; c[n.kind]++; if (n.level === 'error') c.error++; }
    return c;
  }
  const fromLedger = (e) => { const m = e && FROM_LEDGER[e.kind]; if (!m) return null; if (e.kind === 'proposal-held' && !/^(agent|rule):/.test(String(e.by || ''))) return null; /* his own add is not news to him */ return add({ kind: m.kind, level: m.level, title: m.title(e), body: e.why || '', system: e.system || null, at: e.ts || Date.now(), action: m.kind === 'notice' && e.kind === 'proposal-held' ? { page: 'proposals' } : e.system ? { system: e.system } : null }); };
  // the update tool's own steps (CE2): what an update did, and what failed
  function fromUpdate(ev) {
    if (!ev) return null;
    if (ev.phase === 'updated') return add({ kind: 'update', level: (ev.waitForHim || []).length ? 'warn' : 'info', title: `Nexus updated${ev.to ? ` to ${ev.to}` : ''}`, body: `${(ev.restarted || []).length ? `restarted: ${ev.restarted.join(', ')}` : 'nothing needed a restart'}${(ev.waitForHim || []).length ? `; waits for you: ${ev.waitForHim.join(', ')}` : ''}${ev.keptOn ? `; your commits kept on ${ev.keptOn}` : ''}` });
    // CE2b (0.60.417) — what waits for his yes after an update: COS itself (and what closes with it), Clear Glass; the Updates page answers it
    if (ev.phase === 'ask-restart') return add({ kind: 'update', level: 'warn', key: `ask-restart:${ev.to || ''}:${ev.cos ? 'cos' : ''}:${(ev.systems || []).join(',')}`, title: `Restart ${[...(ev.cos ? ['COS'] : []), ...(ev.systems || [])].join(' and ')} to load the update`, body: `${ev.cos && (ev.closes || []).length ? `Restarting COS closes ${ev.closes.join(', ')}. ` : ''}${ev.notSettled ? `${ev.notSettled}. ` : ''}Nothing restarts under you: the Updates page asks.` });
    if (ev.phase === 'refused') return add({ kind: 'update', level: 'warn', title: 'The update was refused', body: String(ev.error || ev.why || '') });
    if (ev.phase === 'restart-failed') return add({ kind: 'update', level: 'error', title: `${ev.name} did not restart after the update`, body: String(ev.error || ''), system: ev.name });
    return null;
  }
  // the update check's notice (lib/nexus-update.js notice()): GitHub has a newer Nexus — once per version and kind
  function fromNotice(n) {
    if (!n || !n.show || !n.title) return null;
    if (n.kind === 'updated') return null;   // fromUpdate tells it when COS did it; a by-hand update shows in the update card
    return add({ kind: 'update', level: n.kind === 'error' ? 'warn' : n.kind === 'blocked' ? 'warn' : 'info', title: n.title, body: n.text || '', key: `update:${n.kind}:${n.latest || n.at}`, action: { tool: 'update' } });
  }
  return { add, list, read, counts, fromLedger, fromUpdate, fromNotice, flush, file, KINDS };
}

module.exports = { createNotices, FROM_LEDGER, KINDS, MODULE_ID: 'cos.manager.notices', VERSION: '1.0.0' };
