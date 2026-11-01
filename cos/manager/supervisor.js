'use strict';
/**
 * cos/manager/supervisor.js — COS's one supervisor: autopilot's job, read from what each system declares.
 * Spec: cos/spec/cos-manager.spec MOD-MG-SUPERVISOR · Map: docs/2026-10-24-cos-manager-phasemap.spec MG15_the_supervisor_in_cos
 *
 * James, 2026-10-30: "This will be the new orchastrator/autopilot." · 2026-10-31: "lets do the orchastration. that needs to be done
 * completely." · "do it 72% be effecient".
 *
 * Every rule here is autopilot's (lib/nexus/autopilot.js), kept so the move changes nothing (MG-004): a crash restarts after a backoff that
 * doubles from 1 s to 30 s and resets after 60 s up; 6 crashes in 5 min open the circuit (and EADDRINUSE opens it at once: a retry cannot
 * free another process's port); a spawn is refused below 10% free memory (5% for a critical system, its own haltPctOverride if it has
 * one) and tried again 15 s later; every Node child gets --max-old-space-size (1024 MB unless it says) and --expose-gc; boot goes phase by
 * phase, each phase waiting for its systems' health (30 s, then said, never a deadlock); an on-demand system starts on touch and stops when
 * idle; Clear Glass exiting 0 within 20 s is another instance holding it, not a crash. What is new: the plan is read from each system's
 * compartment.json (MG-002), every act is a ledger line written before it happens (§9.2), and bootSet 'core' is CS4a (MG_D13).
 *
 *   createSupervisor({ root, declarations?, policy?, ledgerFile?, spawnFn?, freeMemPct?, checkHealth?, log? })
 *     → { boot, list, get, start, stop, restart, touch, resetCircuit, ledger, policy, setPolicy, shutdown, DEFAULTS }
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const DEFAULTS = Object.freeze({   // autopilot's constants (the test reads both)
  bootSet: 'all', restart: { on: 'crash', backoffMs: [1000, 30000], factor: 2 }, stableMs: 60000,
  circuit: { maxRestarts: 6, windowMs: 5 * 60 * 1000 }, memoryHaltPct: 0.10, criticalHaltPct: 0.05, memBackoffMs: 15000,
  maxOldSpaceMB: 1024, phaseGateMs: 30000, healthEveryMs: 0, idleMs: 10 * 60 * 1000, idleCheckMs: 60000, stopGraceMs: 5000,
});

/** every process the systems declare (runtime.process / runtime.processes, lib/cli/compartments.js MG15a), {{root}} filled */
function readDeclarations(root) {
  const fill = (v) => (typeof v === 'string' ? v.replace(/\{\{root\}\}/g, root) : Array.isArray(v) ? v.map(fill)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
  const out = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || /^(\.|node_modules$|data$|_archive$)/.test(d.name)) continue;
    let c; try { c = JSON.parse(fs.readFileSync(path.join(root, d.name, 'compartment.json'), 'utf8')); } catch (_) { continue; }
    const rt = c.runtime || {};
    for (const p of [rt.process, ...(rt.processes || [])].filter(Boolean)) out.push({ system: c.name || d.name, ...fill(p) });
  }
  return out;
}

function httpOk(url, timeoutMs = 1500) {
  return new Promise((res) => {
    const req = http.get(url, { timeout: timeoutMs }, (r) => { r.resume(); res(r.statusCode >= 200 && r.statusCode < 500); });
    req.on('error', () => res(false)); req.on('timeout', () => { req.destroy(); res(false); });
  });
}

function createSupervisor({ root, declarations = null, policy = {}, ledgerFile = null, spawnFn = spawn,
  freeMemPct = () => os.freemem() / os.totalmem(), checkHealth = httpOk, log = (s) => console.log(`[cos] ${s}`) } = {}) {
  const P = { ...DEFAULTS, ...policy, restart: { ...DEFAULTS.restart, ...(policy.restart || {}) }, circuit: { ...DEFAULTS.circuit, ...(policy.circuit || {}) } };
  const decls = declarations || readDeclarations(root);
  const LEDGER = ledgerFile || path.join(process.env.COS_MANAGER_DATA || path.join(root, 'cos', 'data', 'manager'), 'ledger.jsonl');
  const S = new Map();   // name → { decl, state, proc, pid, crashes[], restarts, backoffMs, timers, lastActivity, startedAt, by, circuit, lastExit }
  for (const d of decls) S.set(d.name, { decl: d, state: 'declared', proc: null, pid: null, crashes: [], restarts: 0, backoffMs: P.restart.backoffMs[0],
    timers: new Set(), lastActivity: null, startedAt: null, by: null, circuit: { open: false, openedAt: null, why: null }, lastExit: null, health: null,
    out: [] });   // MG18: its recent output, newest last (LOG_KEEP lines), for the cockpit's Logs
  const LOG_KEEP = 400;
  const bus = new EventEmitter(); bus.setMaxListeners(100);   // MG18: every ledger line is announced, so the UI hears it instead of polling

  let seq = 0;
  function write(kind, system, why, extra = {}) {   // the ledger, before the act; if it cannot be written the act does not happen
    const e = { id: `${Date.now().toString(36)}${(seq++).toString(36)}`, ts: Date.now(), kind, system, pid: extra.pid ?? null, code: extra.code ?? null, why, by: extra.by || 'rule:supervisor' };
    try { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.appendFileSync(LEDGER, JSON.stringify(e) + '\n'); }
    catch (err) { console.log(`[cos] the ledger cannot be written (${err.message}): ${kind} ${system || ''} refused`); return null; }
    bus.emit('ledger', e);
    return e;
  }
  const later = (s, ms, fn) => { const t = setTimeout(() => { s.timers.delete(t); fn(); }, ms); if (t.unref) t.unref(); s.timers.add(t); };
  const clearTimers = (s) => { for (const t of s.timers) clearTimeout(t); s.timers.clear(); };
  const prune = (s) => { const cut = Date.now() - P.circuit.windowMs; s.crashes = s.crashes.filter(t => t > cut); };

  function commandOf(d) {
    const cwd = d.cwd ? path.resolve(root, d.cwd) : root;
    let cmd = d.cmd || 'node';
    if (Array.isArray(d.cmdCandidates)) {
      const ext = process.platform === 'win32' ? '.cmd' : '';
      const hit = d.cmdCandidates.map(c => c + ext).find(c => fs.existsSync(c));
      if (hit) cmd = hit; else if (ext) cmd += ext;
    } else if (d.cwd && !path.isAbsolute(cmd) && /[\\/]/.test(cmd)) cmd = path.join(cwd, cmd);
    let args = [...(d.args || [])];
    if (/(^|[\\/])node(\.exe)?$/i.test(cmd)) {
      if (!args.some(a => String(a).startsWith('--max-old-space-size'))) args = [`--max-old-space-size=${d.maxOldSpaceMB || P.maxOldSpaceMB}`, ...args];
      if (!args.includes('--expose-gc')) args = ['--expose-gc', ...args];
    }
    return { cmd, args, cwd, shell: process.platform === 'win32' && cmd.endsWith('.cmd') };
  }

  function spawnNow(name, by) {
    const s = S.get(name), d = s.decl;
    if (s.circuit.open) { write('refused', name, `circuit open since ${new Date(s.circuit.openedAt).toISOString()}: ${s.circuit.why} — reset it to start`, { by }); return false; }
    const floor = d.critical ? P.criticalHaltPct : (d.haltPctOverride != null ? d.haltPctOverride : P.memoryHaltPct);
    const free = freeMemPct();
    if (free < floor) {
      if (!write('refused', name, `only ${(free * 100).toFixed(1)}% memory free (floor ${(floor * 100).toFixed(0)}%); tried again in ${P.memBackoffMs / 1000}s`, { by })) return false;
      s.state = 'waiting-memory'; later(s, P.memBackoffMs, () => { if (s.state === 'waiting-memory') spawnNow(name, by); }); return false;
    }
    const c = commandOf(d);
    if (!write('spawn', name, `${c.cmd} ${c.args.join(' ')}`, { by })) return false;
    let proc;
    try { proc = spawnFn(c.cmd, c.args, { cwd: c.cwd, env: { ...process.env, ...(d.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'], shell: c.shell }); }
    catch (err) { onExit(name, proc, null, null, `spawn threw: ${err.message}`); return false; }
    s.proc = proc; s.pid = proc.pid || null; s.state = 'starting'; s.startedAt = Date.now(); s.by = by; s.sawAddrInUse = false;
    const pipe = (st, stream) => st && st.on('data', (b) => { const t = b.toString(); if (/EADDRINUSE/.test(t)) s.sawAddrInUse = true;
      for (const l of t.split('\n')) if (l.trim()) { log(`[${name}] ${l}`); s.out.push({ ts: Date.now(), stream, line: l.slice(0, 2000) }); if (s.out.length > LOG_KEEP) s.out.shift(); } });
    pipe(proc.stdout, 'out'); pipe(proc.stderr, 'err');
    later(s, P.stableMs, () => { if (s.proc === proc) s.backoffMs = P.restart.backoffMs[0]; });
    proc.on('exit', (code, signal) => onExit(name, proc, code, signal));
    proc.on('error', (err) => log(`[${name}] failed to spawn: ${err.message}`));
    if (d.healthUrl) {   // up when its health answers, within the phase gate; else said (a spawn outside boot is watched the same way)
      (async () => { const until = Date.now() + P.phaseGateMs;
        while (s.proc === proc && Date.now() < until) { if (await checkHealth(d.healthUrl)) { if (s.proc === proc && s.state === 'starting') s.state = 'up'; return; } await new Promise(r => setTimeout(r, 250)); }
        if (s.proc === proc && s.state === 'starting') { s.state = 'degraded'; write('health', name, `no health within ${P.phaseGateMs / 1000}s of spawn`); } })();
    } else s.state = 'up';
    return true;
  }

  function onExit(name, proc, code, signal, threw = null) {
    const s = S.get(name);
    if (proc && s.proc !== proc) return;   // an old child's exit
    s.proc = null; s.pid = null; s.lastExit = { code, signal, ts: Date.now() };
    if (s.state === 'stopping') { s.state = 'stopped'; write('stop', name, 'stopped as asked', { code, by: s.by }); return; }
    if (s.state === 'idling') { s.state = 'idle'; write('idle-stop', name, `idle ${Math.round(P.idleMs / 1000)}s; starts again when asked`, { code }); return; }
    if (s.state === 'restarting') { s.backoffMs = P.restart.backoffMs[0]; write('restart', name, 'restarting as asked', { code, by: s.by }); spawnNow(name, s.by); return; }
    if (name === 'clear-glass' && code === 0 && s.startedAt && Date.now() - s.startedAt < 20000) {
      s.state = 'external'; write('exit', name, 'exited 0 within 20s: another Clear Glass holds the single instance — not a crash, not restarted', { code }); return;
    }
    s.crashes.push(Date.now()); prune(s); s.state = 'down';
    write('crash', name, threw || `exited code=${code} signal=${signal} — ${s.crashes.length}/${P.circuit.maxRestarts} in the window`, { code });
    if (s.crashes.length >= P.circuit.maxRestarts || s.sawAddrInUse) {
      s.state = 'circuit-open'; s.circuit = { open: true, openedAt: Date.now(), why: s.sawAddrInUse ? 'its port is held by another process (EADDRINUSE): a retry cannot free it' : `${s.crashes.length} crashes in ${P.circuit.windowMs / 60000} min` };
      write('circuit-open', name, `${s.circuit.why}. Not restarting; the others keep running.`); return;
    }
    if (P.restart.on !== 'crash') return;
    const delay = Math.max(s.decl.minRestartDelay || 0, s.backoffMs);
    s.backoffMs = Math.min(s.backoffMs * P.restart.factor, P.restart.backoffMs[1]); s.restarts++;
    later(s, delay, () => { if (s.state === 'down') spawnNow(name, 'rule:restart'); });
  }

  const must = (name) => { const s = S.get(name); if (!s) throw new Error(`no system "${name}" is declared (its compartment.json has no runtime.process)`); return s; };
  const running = (s) => !!s.proc;

  function start(name, { by = 'person' } = {}) { const s = must(name); if (running(s)) return { ...view(s), said: 'already running: nothing done' }; clearTimers(s); spawnNow(name, by); return view(s); }
  function stop(name, { by = 'person' } = {}) {
    const s = must(name); clearTimers(s); if (!running(s)) { if (s.state !== 'circuit-open') s.state = 'stopped'; return { ...view(s), said: 'not running' }; }
    s.state = 'stopping'; s.by = by; const p = s.proc; try { p.kill('SIGTERM'); } catch (_) {}
    later(s, P.stopGraceMs, () => { if (s.proc === p) try { p.kill('SIGKILL'); } catch (_) {} }); return view(s);
  }
  function restart(name, { by = 'person' } = {}) { const s = must(name); if (!running(s)) return start(name, { by }); s.state = 'restarting'; s.by = by; try { s.proc.kill('SIGTERM'); } catch (_) {} return view(s); }
  function touch(name) { const s = must(name); s.lastActivity = Date.now(); if (!running(s) && s.decl.onDemand && !s.circuit.open) spawnNow(name, 'rule:on-demand'); return view(s); }
  function resetCircuit(name, { by = 'person' } = {}) { const s = must(name); s.crashes = []; s.circuit = { open: false, openedAt: null, why: null }; s.state = 'stopped'; write('circuit-close', name, 'reset by a person', { by }); return view(s); }

  async function boot({ set = P.bootSet, by = 'boot' } = {}) {
    const want = (s) => (Array.isArray(set) ? set.includes(s.decl.name) : set === 'core' ? !!s.decl.critical : !s.decl.onDemand);
    const chosen = [...S.values()].filter(want), skipped = [...S.values()].filter(s => !want(s)).map(s => ({ name: s.decl.name, why: s.decl.onDemand ? 'on demand' : `not in bootSet ${JSON.stringify(set)}` }));
    write('boot', null, `boot set ${JSON.stringify(set)}: ${chosen.length} to start`, { by });
    const phases = [...new Set(chosen.map(s => s.decl.phase ?? 99))].sort((a, b) => a - b), started = [];
    for (const ph of phases) {
      const group = chosen.filter(s => (s.decl.phase ?? 99) === ph);
      for (const s of group) { if (!running(s)) spawnNow(s.decl.name, by); started.push(s.decl.name); }
      await Promise.all(group.filter(s => s.decl.healthUrl).map(async (s) => {   // the phase waits for its health, never forever (§1.2)
        const until = Date.now() + P.phaseGateMs;
        while (Date.now() < until) { if (await checkHealth(s.decl.healthUrl)) { if (s.proc) s.state = 'up'; return; } await new Promise(r => setTimeout(r, 250)); }
        write('health', s.decl.name, `phase ${ph}: no health within ${P.phaseGateMs / 1000}s — boot goes on, said`);
      }));
    }
    api.lastBoot = { started, skipped, at: Date.now() };
    return { started, skipped };
  }

  const reaper = setInterval(() => {   // on-demand systems idle past idleMs stop
    for (const s of S.values()) if (s.decl.onDemand && running(s) && s.lastActivity && Date.now() - s.lastActivity > P.idleMs) { s.state = 'idling'; try { s.proc.kill('SIGTERM'); } catch (_) {} }
  }, P.idleCheckMs); if (reaper.unref) reaper.unref();

  function view(s) {
    const d = s.decl;
    return { name: d.name, system: d.system, state: s.state, pid: s.pid, port: d.healthUrl ? Number((/:(\d+)/.exec(d.healthUrl) || [])[1]) || null : null,
      healthUrl: d.healthUrl || null, critical: !!d.critical, bootPhase: d.onDemand ? null : (d.phase ?? null), onDemand: !!d.onDemand,
      restarts: { count: s.restarts, last: s.lastExit ? s.lastExit.ts : null, backoffMs: s.backoffMs }, circuit: { ...s.circuit }, startedAt: s.startedAt, by: s.by,
      // MG16: what autopilot's /status carried, so the door answers in its shape
      crashesInWindow: (prune(s), s.crashes.length), lastExit: s.lastExit, downSince: s.state === 'down' || s.state === 'circuit-open' ? (s.lastExit && s.lastExit.ts) : null, lastActivity: s.lastActivity };
  }
  function ledger({ limit = 100, system = null } = {}) {
    let lines = []; try { lines = fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (_) {}
    return (system ? lines.filter(e => e.system === system) : lines).slice(-limit);
  }
  function shutdown({ by = 'person' } = {}) { clearInterval(reaper); for (const [n, s] of S) if (running(s)) stop(n, { by }); write('stop', null, 'supervisor shutdown', { by }); }

  // MG17: a line the supervisor did not act on but must keep (the handover, naming the version that made it)
  function note(kind, why, { by = 'person', system = null } = {}) { if (!/^[a-z][a-z-]{1,30}$/.test(String(kind))) throw new Error(`a note's kind is a word: ${kind}`); return write(kind, system, why, { by }); }

  function logs(name, { limit = 200 } = {}) { const s = must(name); return s.out.slice(-Math.max(1, Math.min(LOG_KEEP, limit))); }

  const api = { boot, note, logs, on: (ev, fn) => bus.on(ev, fn), off: (ev, fn) => bus.off(ev, fn), declarations: () => decls.map(d => ({ ...d })), list: () => [...S.values()].map(view), get: (n) => view(must(n)), start, stop, restart, touch, resetCircuit, ledger,
    policy: () => JSON.parse(JSON.stringify(P)), setPolicy: (patch, { by = 'person' } = {}) => { Object.assign(P, patch || {}); write('policy', null, `policy changed: ${JSON.stringify(patch)}`, { by }); return JSON.parse(JSON.stringify(P)); },
    shutdown, DEFAULTS, ledgerFile: LEDGER, lastBoot: null };
  return api;
}

module.exports = { createSupervisor, readDeclarations, DEFAULTS, httpOk };
