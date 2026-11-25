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
  memSigmaK: 2, memBaselineMin: 20, memBaselineKeep: 240, memoryAbsolutePct: 0.03,   // CP6a 0.60.501: the floors judged against the baseline
  maxOldSpaceMB: 1024, phaseGateMs: 30000, healthEveryMs: 0, idleMs: 10 * 60 * 1000, idleCheckMs: 60000, stopGraceMs: 5000,
});

/** every process the systems declare (runtime.process / runtime.processes, lib/cli/compartments.js MG15a), {{root}} filled */
// CA4 — the Windows service (cos/app/service.js) runs this supervisor in session 0, which has no desktop
const serviceMode = () => process.env.COS_SERVICE === '1';
// SC16 (expanded 2026-11-08) — James: "also can we have cos.exe run the command prompts in the background?" Electron reached through its
// node_modules/.bin launcher is a .cmd on Windows that runs `node …\electron\cli.js` in a console of its own (the empty
// "C:\Program Files\nodejs\node" window he saw). Electron's own program sits beside it (electron/dist/electron.exe), a windowed app with no
// console: use it when it is there; otherwise the launcher, as before.
function realElectron(cmd, platform = process.platform, exists = fs.existsSync) {
  const m = /^(.*)[\\/]\.bin[\\/]electron(\.cmd)?$/i.exec(String(cmd || '')); if (!m) return cmd;
  const exe = path.join(m[1], 'electron', 'dist', platform === 'win32' ? 'electron.exe' : platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron');
  return exists(exe) ? exe : cmd;
}
const isWindowed = (d, c) => /electron/i.test(path.basename(String((c && c.cmd) || (d.process && d.process.cmd) || d.cmd || ''))) || d.window === true;

function readDeclarations(root) {
  const fill = (v) => (typeof v === 'string' ? v.replace(/\{\{root\}\}/g, root) : Array.isArray(v) ? v.map(fill)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v);
  const out = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || /^(\.|node_modules$|data$|_archive$)/.test(d.name)) continue;
    // 0.60.340 — his "no .json files. only nodes. use .cos": a system's <name>.cos node is its declaration; compartment.json where none is yet
    let c = null; try { const n = require('js-yaml').load(fs.readFileSync(path.join(root, d.name, `${d.name}.cos`), 'utf8')); if (n && n.type === 'cos') c = n.payload; } catch (_) {}
    if (!c) { try { c = JSON.parse(fs.readFileSync(path.join(root, d.name, 'compartment.json'), 'utf8')); } catch (_) { continue; } }
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
  freeMemPct = () => os.freemem() / os.totalmem(), checkHealth = httpOk, log = (s) => console.log(`[cos] ${s}`), hooks = {} } = {}) {
  // hooks (CP6a): heapMB(decl) → his heap cap for a spawn; spawned(name, pid) after each spawn (the priority is applied there). Settable later
  // with setHooks, because resources.js is made from the supervisor it serves.
  const P = { ...DEFAULTS, ...policy, restart: { ...DEFAULTS.restart, ...(policy.restart || {}) }, circuit: { ...DEFAULTS.circuit, ...(policy.circuit || {}) } };
  const decls = declarations || readDeclarations(root);
  const LEDGER = ledgerFile || path.join(process.env.COS_MANAGER_DATA || path.join(root, 'cos', 'data', 'manager'), 'ledger.jsonl');
  // CP6a 0.60.501 — James, 2026-11-13: "also the resource manager, should use the baseline deviation when its applicable." This machine's
  // free memory, learned from the samples resources.js takes (and each start check): its mean and sigma over the last memBaselineKeep. A
  // floor bites only when free memory is also more than memSigmaK sigmas under that mean; with too few samples the fixed floor decides as
  // before; under memoryAbsolutePct a start is always refused.
  const MEMB = path.join(path.dirname(LEDGER), 'memory-baseline.json');
  let memSamples = []; try { const j = JSON.parse(fs.readFileSync(MEMB, 'utf8')); if (Array.isArray(j.samples)) memSamples = j.samples.filter(x => typeof x === 'number' && x >= 0 && x <= 1).slice(-P.memBaselineKeep); } catch (_) {}
  let memUnsaved = 0;
  function memoryObserve(free) {
    if (typeof free !== 'number' || !(free >= 0 && free <= 1)) return;
    memSamples.push(+free.toFixed(4)); if (memSamples.length > P.memBaselineKeep) memSamples.shift();
    if (++memUnsaved >= 10) { memUnsaved = 0; try { fs.mkdirSync(path.dirname(MEMB), { recursive: true }); fs.writeFileSync(MEMB + '.tmp', JSON.stringify({ at: Date.now(), samples: memSamples })); fs.renameSync(MEMB + '.tmp', MEMB); } catch (_) {} }
  }
  function memoryBaseline() {
    const n = memSamples.length; if (!n) return { n: 0, established: false, mean: null, sigma: null };
    const mean = memSamples.reduce((a, b) => a + b, 0) / n, sigma = Math.sqrt(memSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    return { n, established: n >= P.memBaselineMin, mean: +mean.toFixed(4), sigma: +sigma.toFixed(4) };
  }
  // memoryJudge(free, floor) → { low, why }: low = refuse / act. why names the floor and, when there is one, the baseline.
  function memoryJudge(free, floor) {
    const pc = (x) => `${(x * 100).toFixed(1)}%`, b = memoryBaseline();
    if (free < P.memoryAbsolutePct) return { low: true, why: `${pc(free)} memory free is under the absolute minimum ${pc(P.memoryAbsolutePct)}`, baseline: b };
    if (free >= floor) return { low: false, why: `${pc(free)} memory free, over the floor ${pc(floor)}`, baseline: b };
    if (!b.established) return { low: true, why: `${pc(free)} memory free is under the floor ${pc(floor)} (no baseline yet: ${b.n} of ${P.memBaselineMin} samples)`, baseline: b };
    const z = (b.mean - free) / Math.max(b.sigma, 0.005);
    const base = `this machine's baseline ${pc(b.mean)} ± ${pc(b.sigma)} over ${b.n} samples`;
    return z >= P.memSigmaK
      ? { low: true, why: `${pc(free)} memory free is under the floor ${pc(floor)} and ${z.toFixed(1)}σ under ${base}`, baseline: b, z }
      : { low: false, why: `${pc(free)} memory free is under the floor ${pc(floor)} but usual here: ${z.toFixed(1)}σ from ${base} (bites at ${P.memSigmaK}σ)`, baseline: b, z };
  }
  // PR6 slice a (2026-11-13) — James: "get the heartbeat done and polling disabled" · "the heartbeat optimizes nexus since when systems arent
  // needed they dont need to be polled." A system whose declaration names its `heartbeat` (the id lib/pulse.js beats as) is up at its first
  // beat, with no /health request; each beat expects the next within its interval × 1.5 + 5 s; a beat that does not come is said once
  // (pulse-missed), a later beat clears it. A system COS stopped (idle, or asked) is asleep: its silence is not a miss.
  const beatName = (id) => { for (const s of S.values()) { const h = eff(s.decl).heartbeat; if (h && (Array.isArray(h) ? h.includes(id) : h === id)) return s.decl.name; } return null; };
  function beat(b = {}) {
    const id = String(b.systemId || ''); const name = id && beatName(id);
    if (!name) return { known: false, name: null };
    const s = S.get(name), now = Date.now(), every = Math.max(1000, Number(b.intervalMs) || 10000);
    s.lastBeat = { at: now, seq: b.seq || null, every, memMB: b.meta && b.meta.memMB || null };
    if (s.proc && (s.state === 'starting' || s.state === 'degraded')) { s.state = 'up'; write('pulse', name, `up at its first beat (${id}, every ${every / 1000} s); no /health asked`); }
    if (s.missedSince) { write('pulse-recovered', name, `beat again after ${Math.round((now - s.missedSince) / 1000)} s of silence`); s.missedSince = null; }
    if (s.beatTimer) clearTimeout(s.beatTimer);
    s.beatTimer = setTimeout(() => { s.beatTimer = null; if (!s.proc || s.missedSince) return;   // stopped: asleep, not missed
      s.missedSince = Date.now(); write('pulse-missed', name, `no beat for ${Math.round((every * 1.5 + 5000) / 1000)} s (last at ${new Date(now).toISOString()}); the process is still there (pid ${s.pid})`); }, every * 1.5 + 5000);
    if (s.beatTimer.unref) s.beatTimer.unref();
    for (const w of (s.beatWaiters || []).splice(0)) w(true);
    return { known: true, name };
  }
  // up by its beat, within ms; false when none came (said by the caller)
  function waitBeat(s, proc, ms) {
    return new Promise((res) => { if (s.proc === proc && s.state === 'up') return res(true);
      let done = false; const w = (v) => { if (done) return; done = true; res(v); }; (s.beatWaiters = s.beatWaiters || []).push(w);
      const t = setTimeout(() => { s.beatWaiters = (s.beatWaiters || []).filter(x => x !== w); w(false); }, ms); if (t.unref) t.unref(); });
  }
  const S = new Map();   // name → { decl, state, proc, pid, crashes[], restarts, backoffMs, timers, lastActivity, startedAt, by, circuit, lastExit }
  const add = (d) => S.set(d.name, { decl: d, state: 'declared', proc: null, pid: null, crashes: [], restarts: 0, backoffMs: P.restart.backoffMs[0],
    timers: new Set(), lastActivity: null, startedAt: null, by: null, circuit: { open: false, openedAt: null, why: null }, lastExit: null, health: null,
    out: [] });   // MG18: its recent output, newest last (LOG_KEEP lines), for the cockpit's Logs
  for (const d of decls) add(d);
  // SC2 (docs/2026-11-02-cos-console-phasemap.spec) — his configuration over the declaration: hooks.adjust(decl) → the declaration as it runs
  // (port, env, health URL, wall mode, autostart, phase, restart). Read at each spawn, boot and crash; a hook that throws leaves the declaration.
  const eff = (d) => { if (typeof hooks.adjust !== 'function') return d; try { return hooks.adjust(d) || d; } catch (e) { log(`[${d.name}] the configuration hook threw: ${e.message} — its declaration is used`); return d; } };
  const LOG_KEEP = 400;
  // ── MG15 outlive (2026-11-18) — James: "coupled. thats going to kill nexus." · "yes the node instances should be hooked into the service, until
  // emerge.exe is doned" · "system states saved as a node file, crash reverts them back to the most recent one." A system writes to its own log
  // file (not a pipe into this manager), so it outlives the manager; the running systems are kept as a node file at every spawn and exit; at boot
  // a system whose process is alive and answers is adopted, not started again; COS's own restart hands over instead of stopping them. Off for a
  // test's fake spawn (policy.outlive), on for real processes.
  const OUT = P.outlive != null ? !!P.outlive : spawnFn === spawn;
  const LOGS = path.join(path.dirname(LEDGER), 'logs'), STATE = path.join(path.dirname(LEDGER), 'state'), LOG_MAX = 10 * 1024 * 1024;
  const _alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  function lineIn(s, name, text, stream) {
    if (/EADDRINUSE/.test(text)) s.sawAddrInUse = true;
    for (const l of text.split('\n')) if (l.trim()) { log(`[${name}] ${l}`); if (/^\[cos-boundary\] /.test(l)) write('wall', name, l.replace(/^\[cos-boundary\] /, '')); s.out.push({ ts: Date.now(), stream, line: l.slice(0, 2000) }); bus.emit('line', { system: name, ...s.out[s.out.length - 1] }); if (s.out.length > LOG_KEEP) s.out.shift(); }
  }
  function _openLogs(name) {
    fs.mkdirSync(LOGS, { recursive: true });
    const one = (kind) => { const f = path.join(LOGS, `${name}.${kind}.log`); try { if (fs.statSync(f).size > LOG_MAX) fs.renameSync(f, f + '.1'); } catch (_) {}
      const fd = fs.openSync(f, 'a'); let start = 0; try { start = fs.fstatSync(fd).size; } catch (_) {} return { f, fd, start }; };
    return { out: one('out'), err: one('err') };
  }
  // a log file read as it grows (fs.watch; the reaper's minute reads it too, in case an event was missed): whole lines only, the rest carried
  function _tail(s, name, stream, file, from) {
    let pos = from, busy = false, again = false, carry = '';
    const read = () => {
      if (busy) { again = true; return; } busy = true;
      fs.stat(file, (e, st) => {
        if (e) { busy = false; return; }
        if (st.size < pos) pos = 0;   // rotated
        if (st.size === pos) { busy = false; if (again) { again = false; read(); } return; }
        const len = Math.min(st.size - pos, 1 << 20), buf = Buffer.alloc(len);
        fs.open(file, 'r', (e2, fd) => { if (e2) { busy = false; return; }
          fs.read(fd, buf, 0, len, pos, (e3, n) => { fs.close(fd, () => {}); pos += n || 0;
            const txt = carry + buf.slice(0, n || 0).toString('utf8'); const cut = txt.lastIndexOf('\n');
            if (cut >= 0) { carry = txt.slice(cut + 1); lineIn(s, name, txt.slice(0, cut), stream); } else carry = txt;
            busy = false; if (again || pos < st.size) { again = false; read(); } }); });
      });
    };
    let w = null; try { w = fs.watch(file, read); } catch (_) {}
    // found running it: Windows does not reliably tell fs.watch when another process appends to a file, so the file's size is also read every
    // 500 ms while the system runs — a local stat of one file, not a request to the system (its liveness stays its heartbeat's)
    const tick = setInterval(read, 500); if (tick.unref) tick.unref();
    (s.tails = s.tails || []).push({ w, read, tick }); read();
  }
  function _stopTails(s) { for (const x of (s.tails || [])) { try { x.w && x.w.close(); } catch (_) {} try { clearInterval(x.tick); } catch (_) {} } s.tails = []; }
  function _saveState() {
    if (!OUT) return;
    try {
      const systems = {}; for (const [n, s] of S) if (s.pid) systems[n] = { pid: s.pid, startedAt: s.startedAt, state: s.state };
      const node = { envelope: 1, type: 'cos-running', id: 'running', at: Date.now(), context: 'the systems COS runs, kept at every spawn and exit (MG15): a crash of the manager comes back to this', payload: { manager: process.pid, systems } };
      fs.mkdirSync(STATE, { recursive: true });
      const cur = path.join(STATE, 'running.node'); fs.writeFileSync(cur + '.tmp', JSON.stringify(node)); fs.renameSync(cur + '.tmp', cur);
      fs.writeFileSync(path.join(STATE, `running-${node.at}.node`), JSON.stringify(node));
      const old = fs.readdirSync(STATE).filter(f => /^running-\d+\.node$/.test(f)).sort(); for (const f of old.slice(0, Math.max(0, old.length - 5))) { try { fs.unlinkSync(path.join(STATE, f)); } catch (_) {} }
    } catch (e) { log(`the running state could not be kept: ${e.message}`); }
  }
  // MG15c: an adopted system's health, waited for: up when it answers; after 30 s without an answer it is said degraded (busy), never stopped
  // for it. It stays degraded until it answers; its end is seen by the reaper as for any adopted pid; stopping it is a person's act.
  function _waitUp(s, pr, d) {
    if (!d.healthUrl) { s.state = 'up'; return; }
    (async () => { const t0 = Date.now(); let said = false;
      while (s.proc === pr) { if (await checkHealth(d.healthUrl)) { if (s.state === 'starting' || s.state === 'degraded') s.state = 'up'; if (said) write('adopted-up', d.name, `pid ${pr.pid} answers after ${Math.round((Date.now() - t0) / 1000)} s`, { pid: pr.pid }); return; }
        if (!said && Date.now() - t0 > (P.busyAfterMs || 30000)) { said = true; if (s.state === 'starting') s.state = 'degraded'; write('adopted-busy', d.name, `pid ${pr.pid} does not answer at ${d.healthUrl} after 30 s: kept as degraded (busy is not dead), not stopped`, { pid: pr.pid }); }
        await new Promise(r => setTimeout(r, said ? 5000 : 500)); } })();
  }
  // MG15b: the pid listening on a local port (Windows: netstat; elsewhere not read, so nothing is adopted by port)
  function _holderOf(port) {
    if (process.platform !== 'win32') return null;
    try { const r = require('child_process').spawnSync('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
      for (const l of String(r.stdout || '').split(/\r?\n/)) { const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(l); if (m && Number(m[1]) === port) return Number(m[2]); } } catch (_) {}
    return null;
  }
  // an adopted process: started by an earlier manager, still alive; stopped by its pid; its end seen by the kill or the reaper's minute
  // 0.60.584: the pid may be filled in later (an escaped spawn, MG21); its end is watched every 2 s by a signal-0 check (no process started);
  // taskkill runs async so a slow Windows never blocks COS (MG20).
  function _adopted(name, pid) {
    const pr = { pid, adopted: true, on() {}, kill(sig) {
      const done = () => { const t = setTimeout(() => { if (!_alive(pr.pid)) onExit(name, pr, null, sig || 'SIGTERM'); }, 1500); if (t.unref) t.unref(); };
      if (!pr.pid) { done(); return true; }
      if (process.platform === 'win32') require('child_process').execFile('taskkill', ['/PID', String(pr.pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }, done);
      else { try { process.kill(pr.pid, sig || 'SIGTERM'); } catch (_) {} done(); }
      return true; } };
    const watch = setInterval(() => { const s = S.get(name); if (!s || s.proc !== pr) return clearInterval(watch); if (pr.pid && !_alive(pr.pid)) { clearInterval(watch); onExit(name, pr, null, null); } }, 2000);
    if (watch.unref) watch.unref();
    return pr;
  }
  // MG21 (0.60.584) — James, 2026-11-18: "Both" (stop the freezes, and the systems COS starts survive a kill of its manager). Found: the Windows
  // service kills the manager's process tree when its health does not answer; every system this manager had started died with it (Idearium's
  // NM1 builds at 14:38 and 14:59), while systems adopted from an earlier manager lived on (their parent was gone). On Windows a system is
  // therefore started through a launcher that starts it detached and exits at once: the system's parent is gone, it is outside the tree, and
  // COS holds it as it holds an adopted one (its pid, its log files, its end seen in 2 s). Elsewhere, and in tests with their own spawn, as before.
  const ESCAPE_JS = "const o=JSON.parse(process.env.COS_ESCAPE);const fs=require('fs');const out=fs.openSync(o.out,'a'),err=fs.openSync(o.err,'a');" +
    "const c=require('child_process').spawn(o.cmd,o.args,{cwd:o.cwd,env:process.env,stdio:['ignore',out,err],detached:true,shell:o.shell,windowsHide:true});" +
    "c.on('error',(e)=>{process.stderr.write(String(e.message));process.exit(1);});if(c.pid){process.stdout.write(String(c.pid));c.unref();process.exit(0);}";
  function _escape(name, c, env, fds) {
    // the launcher runs to its end here (about 0.1-0.3 s, only when a system starts), so the system's pid is known at once, as with a direct spawn
    const L = require('child_process').spawnSync(process.execPath, ['-e', ESCAPE_JS], { env: { ...env, COS_ESCAPE: JSON.stringify({ cmd: c.cmd, args: c.args, cwd: c.cwd, shell: c.shell || false, out: fds.out.f, err: fds.err.f }) }, encoding: 'utf8', timeout: 20000, windowsHide: true });
    const pid = parseInt(L.stdout, 10);
    if (!pid) throw new Error(`the launcher did not start it: ${(L.error && L.error.message) || String(L.stderr || '').trim() || 'exit ' + L.status}`);
    const pr = _adopted(name, pid); pr.escaped = true; return pr;
  }
  async function _adopt(by) {
    if (!OUT) return [];
    let node = null; try { node = JSON.parse(fs.readFileSync(path.join(STATE, 'running.node'), 'utf8')); } catch (_) { return []; }
    const got = [];
    for (const [n, r] of Object.entries((node.payload && node.payload.systems) || {})) {
      const s = S.get(n); if (!s || s.proc || !r || !_alive(r.pid)) continue;
      const d = eff(s.decl); let ok = true; if (d.healthUrl) { try { ok = !!(await checkHealth(d.healthUrl)); } catch (_) { ok = false; } }
      // MG15c (2026-11-18): busy is not dead. A live pid that does not answer is still the system (a second copy could never take its port);
      // it is adopted as degraded and its health is waited for. Found running it: Idearium was refused here mid-build, a copy started, the build lost.
      if (!ok) write('adopted-busy', n, `pid ${r.pid} is alive but its health does not answer at ${d.healthUrl}: adopted as degraded (busy is not dead), its health waited for`, { by, pid: r.pid });
      s.proc = _adopted(n, r.pid); s.pid = r.pid; s.state = ok ? 'up' : 'degraded'; if (!ok) _waitUp(s, s.proc, d); s.startedAt = r.startedAt || Date.now(); s.by = by;
      for (const kind of ['out', 'err']) { const f = path.join(LOGS, `${n}.${kind}.log`); let end = 0; try { end = fs.statSync(f).size; } catch (_) {} _tail(s, n, kind, f, end); }
      write('adopted', n, `adopted pid ${r.pid}, left running by manager ${node.payload.manager} (${new Date(node.at).toISOString()}): not started again`, { by, pid: r.pid }); got.push(n);
    }
    _saveState(); return got;
  }
  // COS's own restart: the systems are left running and handed to the next manager (the Windows service's stop still stops them all: shutdown)
  function handOver({ by = 'person' } = {}) {
    clearInterval(reaper); clearInterval(desktopWatch);
    for (const s of S.values()) { _stopTails(s); clearTimers(s); if (s.beatTimer) { clearTimeout(s.beatTimer); s.beatTimer = null; } }
    _saveState();
    const n = [...S.values()].filter(s => s.proc).length;
    write('handover', null, OUT ? `COS restarts: ${n} system(s) left running for the next manager (state/running.node)` : 'COS restarts: systems are piped to this manager (outlive off): stopping them', { by });
    if (!OUT) for (const [nm, s] of S) if (running(s)) stop(nm, { by });
  }
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
      // 0.60.588: a candidate's electron.exe is used even when its .bin launcher is missing (it was: "spawn electron ENOENT")
      const viaExe = d.cmdCandidates.map(c => realElectron(c + ext)).find((x, i) => x !== d.cmdCandidates[i] + ext);
      if (hit) cmd = hit; else if (viaExe) cmd = viaExe; else if (ext) cmd += ext;
      cmd = realElectron(cmd);
    } else if (d.cwd && !path.isAbsolute(cmd) && /[\\/]/.test(cmd)) cmd = path.join(cwd, cmd);
    let args = [...(d.args || [])]; let env = null, via = null;
    const BOUNDARY = path.join(__dirname, '..', 'compartment', 'boundary.js');
    const walled = d.boundary && Array.isArray(d.boundary.allow);
    // CP1a — an allowed mount reached through a junction or symlink (a worktree's node_modules) is the same mount: its real path is allowed too
    const wall = () => { const allow = [...d.boundary.allow]; for (const a of d.boundary.allow) { try { const r = fs.realpathSync(a); if (path.resolve(r) !== path.resolve(a)) allow.push(r + path.sep); } catch (_) {} }
      return JSON.stringify({ name: d.compartment || d.name, allow, mode: d.boundary.mode === 'audit' ? 'audit' : 'enforce' }); };
    if (/(^|[\\/])node(\.exe)?$/i.test(cmd)) {
      const heap = typeof hooks.heapMB === 'function' ? hooks.heapMB(d) : null;   // CP6a: his cap, else the declaration's, else the policy's
      if (!args.some(a => String(a).startsWith('--max-old-space-size'))) args = [`--max-old-space-size=${heap || d.maxOldSpaceMB || P.maxOldSpaceMB}`, ...args];
      if (!args.includes('--expose-gc')) args = ['--expose-gc', ...args];
      // LM6 (his 2026-11-01: "loom is already in a compartment. it needs to be managed by cos") — a process that declares its compartment's
      // wall is started behind it: cos/compartment/boundary.js preloaded, COS_BOUNDARY from its own declaration (LM4's wall)
      if (walled) { args = ['--require', BOUNDARY, ...args]; env = { COS_BOUNDARY: wall() }; via = '--require'; }
    } else if (walled && /electron/i.test(path.basename(cmd))) {
      // CP1a (his 2026-11-01: "continue moving the rest of the systems into cos.") — Electron takes no --require on its command line; its main
      // process reads NODE_OPTIONS (unpackaged), so the wall goes in there, its path with forward slashes (NODE_OPTIONS reads a backslash inside
      // quotes as an escape: found by running it, the preload failed with the path's separators gone). Its children inherit it, said.
      env = { COS_BOUNDARY: wall(), NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + ' ' : ''}--require "${BOUNDARY.split(path.sep).join('/')}"` }; via = 'NODE_OPTIONS';
    }
    return { cmd, args, cwd, env, via, shell: process.platform === 'win32' && cmd.endsWith('.cmd') };
  }

  function spawnNow(name, by) {
    const s = S.get(name), d = eff(s.decl);
    if (s.circuit.open) { write('refused', name, `circuit open since ${new Date(s.circuit.openedAt).toISOString()}: ${s.circuit.why} — reset it to start`, { by }); return false; }
    const floor = d.critical ? P.criticalHaltPct : (d.haltPctOverride != null ? d.haltPctOverride : P.memoryHaltPct);
    const free = freeMemPct(); memoryObserve(free);
    const mj = memoryJudge(free, floor);   // CP6a 0.60.501: the floor judged against this machine's baseline
    if (mj.low) {
      if (!write('refused', name, `only ${mj.why}; tried again in ${P.memBackoffMs / 1000}s`, { by })) return false;
      s.state = 'waiting-memory'; later(s, P.memBackoffMs, () => { if (s.state === 'waiting-memory') spawnNow(name, by); }); return false;
    }
    const c = commandOf(d);
    // 2026-11-04 CA4 (CA_D1b) — James: "run in service with admin privilages". Under the Windows service (COS_SERVICE=1, session 0) a process with a
    // window (an Electron app: Clear Glass) cannot be seen: it is left to his session, where the COS window starts it, and said (§0.0, §1.2)
    if (serviceMode() && isWindowed(d, c)) {
      if (s.state !== 'desktop') write('refused', name, 'has a window: under the Windows service it starts in your session (the COS window starts it), not here', { by });
      s.state = 'desktop'; return false;
    }
    // MG15b (2026-11-18) — found running it: a system left alive by an earlier manager but missing from running.node held its port, so every new
    // start died on "port already in use" until the circuit opened (Idearium 4800, Guardian 7820, Orchestrator 9000). The holder is adopted
    // instead of a doomed second copy; its health decides up, and a holder whose health does not answer is stopped so a fresh one can start.
    const port = d.healthUrl ? Number((/:(\d+)/.exec(d.healthUrl) || [])[1]) || null : null;
    const holder = OUT && port ? _holderOf(port) : null;
    if (holder && holder !== process.pid && _alive(holder)) {
      const pr = _adopted(name, holder); s.proc = pr; s.pid = holder; s.state = 'starting'; s.startedAt = Date.now(); s.by = by;
      write('adopted', name, `port ${port} already held by pid ${holder}: adopted, not started again (its health decides up)`, { by, pid: holder });
      for (const kind of ['out', 'err']) { const f = path.join(LOGS, `${name}.${kind}.log`); let end = 0; try { end = fs.statSync(f).size; } catch (_) {} _tail(s, name, kind, f, end); }
      _saveState();
      _waitUp(s, pr, d);   // MG15c: never stopped for a slow answer; busy is not dead
      return true;
    }
    if (!write('spawn', name, `${c.via ? `in compartment ${d.compartment || d.name}, behind its wall (${(d.boundary.mode || 'enforce')}${c.via === 'NODE_OPTIONS' ? ', through NODE_OPTIONS' : ''}): ` : ''}${c.cmd} ${c.args.join(' ')}`, { by })) return false;
    let proc; let fds = null;
    if (OUT && !isWindowed(d, c)) { try { fds = _openLogs(name); } catch (e) { log(`[${name}] its log files could not be opened (${e.message}): piped to this manager`); fds = null; } }   // MG15
    const escape = fds && process.platform === 'win32' && spawnFn === spawn && P.escape !== false;   // MG21
    try { proc = escape ? _escape(name, c, { ...process.env, ...(d.env || {}), ...(c.env || {}) }, fds) : spawnFn(c.cmd, c.args, { cwd: c.cwd, env: { ...process.env, ...(d.env || {}), ...(c.env || {}) }, stdio: fds ? ['ignore', fds.out.fd, fds.err.fd] : ['ignore', 'pipe', 'pipe'], detached: !!fds, shell: c.shell, windowsHide: !isWindowed(d, c) }); }   /* SC16 (0.60.400): no console window per system; a windowed one (Clear Glass) shows its own */
    catch (err) { if (fds) { try { fs.closeSync(fds.out.fd); fs.closeSync(fds.err.fd); } catch (_) {} } onExit(name, proc, null, null, `spawn threw: ${err.message}`); return false; }
    if (fds) { try { fs.closeSync(fds.out.fd); fs.closeSync(fds.err.fd); } catch (_) {} }   // the child holds its own
    s.proc = proc; s.pid = proc.pid || null; s.state = 'starting'; s.startedAt = Date.now(); s.by = by; s.sawAddrInUse = false;
    if (typeof hooks.spawned === 'function' && s.pid) { try { hooks.spawned(name, s.pid); } catch (e) { log(`[${name}] the spawn hook threw: ${e.message}`); } }
    _stopTails(s);
    if (fds) { _tail(s, name, 'out', fds.out.f, fds.out.start); _tail(s, name, 'err', fds.err.f, fds.err.start); }
    _saveState();
    const pipe = (st, stream) => st && st.on('data', (b) => { const t = b.toString(); if (/EADDRINUSE/.test(t)) s.sawAddrInUse = true;
      for (const l of t.split('\n')) if (l.trim()) { log(`[${name}] ${l}`); if (/^\[cos-boundary\] /.test(l)) write('wall', name, l.replace(/^\[cos-boundary\] /, '')); s.out.push({ ts: Date.now(), stream, line: l.slice(0, 2000) }); bus.emit('line', { system: name, ...s.out[s.out.length - 1] });   /* SC11 (0.60.398): every line, for the Console tab */ if (s.out.length > LOG_KEEP) s.out.shift(); } });
    pipe(proc.stdout, 'out'); pipe(proc.stderr, 'err');
    later(s, P.stableMs, () => { if (s.proc === proc) s.backoffMs = P.restart.backoffMs[0]; });
    proc.on('exit', (code, signal) => onExit(name, proc, code, signal));
    proc.on('error', (err) => log(`[${name}] failed to spawn: ${err.message}`));
    if (d.heartbeat) {   // PR6 slice a: up at its first beat, within the phase gate; no /health request
      (async () => { const ok = await waitBeat(s, proc, P.phaseGateMs);
        if (!ok && s.proc === proc && s.state === 'starting') { s.state = 'degraded'; write('health', name, `no beat within ${P.phaseGateMs / 1000}s of spawn`); } })();
    } else if (d.healthUrl) {   // up when its health answers, within the phase gate; else said (a spawn outside boot is watched the same way)
      (async () => { const until = Date.now() + P.phaseGateMs;
        while (s.proc === proc && Date.now() < until) { if (await checkHealth(d.healthUrl)) { if (s.proc === proc && s.state === 'starting') s.state = 'up'; return; } await new Promise(r => setTimeout(r, 250)); }
        if (s.proc === proc && s.state === 'starting') { s.state = 'degraded'; write('health', name, `no health within ${P.phaseGateMs / 1000}s of spawn`); } })();
    } else s.state = 'up';
    return true;
  }

  function onExit(name, proc, code, signal, threw = null) {
    const s = S.get(name);
    if (proc && s.proc !== proc) return;   // an old child's exit
    s.proc = null; s.pid = null; s.pause = null; s.lastExit = { code, signal, ts: Date.now() }; _stopTails(s); _saveState();   // MG15
    if (s.beatTimer) { clearTimeout(s.beatTimer); s.beatTimer = null; } s.missedSince = null;   // PR6: a stopped system is asleep, not missed
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
    if (eff(s.decl).restart === 'never') { write('no-restart', name, 'its configuration says never restart on a crash (his): left down', { by: 'rule:config' }); return; }
    const delay = Math.max(s.decl.minRestartDelay || 0, s.backoffMs);
    s.backoffMs = Math.min(s.backoffMs * P.restart.factor, P.restart.backoffMs[1]); s.restarts++;
    later(s, delay, () => { if (s.state === 'down') spawnNow(name, 'rule:restart'); });
  }

  const must = (name) => { const s = S.get(name); if (!s) throw new Error(`no system "${name}" is declared (its compartment.json has no runtime.process)`); return s; };
  const running = (s) => !!s.proc;

  function start(name, { by = 'person' } = {}) { const s = must(name); if (running(s)) return { ...view(s), said: 'already running: nothing done' }; clearTimers(s); spawnNow(name, by); return view(s); }
  function stop(name, { by = 'person' } = {}) {
    const s = must(name); clearTimers(s); if (!running(s)) { if (s.state !== 'circuit-open') s.state = 'stopped'; return { ...view(s), said: 'not running' }; }
    _unpauseForExit(s); s.state = 'stopping'; s.by = by; const p = s.proc; try { p.kill('SIGTERM'); } catch (_) {}
    later(s, P.stopGraceMs, () => { if (s.proc === p) try { p.kill('SIGKILL'); } catch (_) {} }); return view(s);
  }
  function restart(name, { by = 'person' } = {}) { const s = must(name); if (!running(s)) return start(name, { by }); _unpauseForExit(s); s.state = 'restarting'; s.by = by; try { s.proc.kill('SIGTERM'); } catch (_) {} return view(s); }
  // 2026-11-25 (his: "you need to fix it so cos can shut it down" · "this is meant to be autonomous"): a declared process already answering on its
  // port, with no process held (started by an earlier manager, or before it was declared), is adopted, never started a second time, so COS can
  // stop it, idle it out and count its memory. The model server's engines were found so: running, unknown to COS, unstoppable but by hand.
  const _portOf = (d) => { try { return d.healthUrl ? Number(new URL(d.healthUrl).port) || null : null; } catch (_) { return null; } };
  function _claim(name, by, holders = null) {
    const s = S.get(name); if (!s || running(s)) return false;
    const port = _portOf(s.decl); if (!port) return false;
    const pid = holders ? holders.get(port) : _holderOf(port); if (!pid || !_alive(pid)) return false;
    s.proc = _adopted(name, pid); s.pid = pid; s.state = 'up'; s.startedAt = s.startedAt || Date.now(); s.by = by; s.lastActivity = Date.now();
    write('adopted', name, `pid ${pid} already answered on :${port} and no process was held: adopted, not started again`, { by, pid }); _saveState();
    return true;
  }
  function touch(name) { const s = must(name); s.lastActivity = Date.now(); if (!running(s) && s.decl.onDemand && !s.circuit.open && !(OUT && _claim(name, 'rule:on-demand'))) spawnNow(name, 'rule:on-demand'); return view(s); }
  // a program a declaration runs (not node, not Electron), running with no declaration holding it, is a stray of an earlier manager: ended, said.
  // Only programs named by a declaration are looked at; Windows only (its process list); async, so COS never waits on it.
  let _sweeping = false;
  function _sweep(by = 'rule:orphans') {
    if (_sweeping || process.platform !== 'win32') return; _sweeping = true;
    // every listening port and its process, read once (async): the declared ones answering with no process held are adopted
    require('child_process').execFile('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true, timeout: 10000 }, (e0, ns) => {
      const holders = new Map(); for (const l of String(ns || '').split(/\r?\n/)) { const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(l); if (m) holders.set(Number(m[1]), Number(m[2])); }
      for (const n of S.keys()) _claim(n, by, holders);
      _sweepStrays(by);
    });
  }
  function _sweepStrays(by) {
    const exes = [...new Set([...S.values()].map((s) => String(s.decl.cmd || '')).filter((c) => /\.exe$/i.test(c) && !/node|electron/i.test(path.basename(c))))];
    if (!exes.length) { _sweeping = false; return; }
    const held = new Set([...S.values()].map((s) => s.proc && s.proc.pid).filter(Boolean));
    const names = [...new Set(exes.map((c) => path.basename(c)))].map((b) => `Name='${b.replace(/'/g, '')}'`).join(' or ');
    require('child_process').execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "${names}" | ForEach-Object { \"$($_.ProcessId)|$($_.ExecutablePath)\" }`], { windowsHide: true, timeout: 20000 }, (err, out) => {
      _sweeping = false; if (err) return;
      const want = new Set(exes.map((c) => path.resolve(c).toLowerCase()));
      for (const l of String(out).split(/\r?\n/)) { const [p, exe] = l.trim().split('|'); const pid = Number(p);
        if (!pid || held.has(pid) || !exe || !want.has(path.resolve(exe).toLowerCase())) continue;
        write('stray-ended', null, `pid ${pid} ran ${path.basename(exe)}, which a declaration runs, but no declaration held it: ended`, { by, pid });
        require('child_process').execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }, () => {}); }
    });
  }
  // ── pause / resume (CP5b, 0.60.362; cos/spec/compartment.spec MOD-CP-PAUSE) ─────────────────────────────────────────────────────────
  // James, 2026-11-01: "the entire sandbox is rewindable/pausable/…". The ledger line first (§9.2), then the OS act (suspend.js), then the OS's
  // read-back decides the state (§0.1): 'paused' only when the OS reads the tree suspended. A paused system is not idled or restarted by rule.
  // Who may pause is the manager route's gate (a person, or a rule RAID approved; an agent proposes).
  function _unpauseForExit(s) {   // a stopped (SIGSTOP) process cannot act on SIGTERM until it is continued; Windows terminates a suspended one
    if (s.state !== 'paused' || !s.pid) return;
    if (process.platform !== 'win32') for (const p of (s.pause && s.pause.pids) || [s.pid]) { try { process.kill(p, 'SIGCONT'); } catch (_) {} }
    write('resume', s.decl.name, 'resumed so it can stop', { by: 'rule:pause' }); s.pause = null;
  }
  async function pause(name, { by = 'person' } = {}) {
    const s = must(name);
    if (!running(s)) return { ...view(s), said: 'not running: nothing to pause' };
    if (s.state === 'paused') return { ...view(s), said: 'already paused' };
    const susp = require('./suspend.js');
    if (!write('pause', name, `pausing its process tree (${susp.VIA})`, { by })) return { ...view(s), said: 'the ledger could not be written: not paused (§9.2)' };
    const r = await susp.suspend(s.pid);
    if (!r.ok) { write('pause-failed', name, `not paused: ${r.error || r.os} (the OS reads ${r.os})`, { by }); return { ...view(s), said: r.error || `the OS reads ${r.os}` }; }
    s.pause = { pids: r.pids, via: r.via, os: r.os, by, since: Date.now(), was: s.state }; s.state = 'paused';
    write('paused', name, `paused: ${r.pids.length} process(es), the OS reads ${r.os}`, { by });
    return view(s);
  }
  async function resume(name, { by = 'person' } = {}) {
    const s = must(name);
    if (s.state !== 'paused') return { ...view(s), said: 'not paused' };
    const susp = require('./suspend.js');
    if (!write('resume', name, `resuming its process tree (${susp.VIA})`, { by })) return { ...view(s), said: 'the ledger could not be written: not resumed (§9.2)' };
    const r = await susp.resume(s.pid);
    if (!r.ok) { write('resume-failed', name, `still paused: ${r.error || r.os} (the OS reads ${r.os})`, { by }); return { ...view(s), said: r.error || `the OS reads ${r.os}` }; }
    s.state = (s.pause && s.pause.was) || 'up'; s.pause = null; s.lastActivity = Date.now();
    write('resumed', name, `resumed: the OS reads ${r.os}`, { by });
    return view(s);
  }

  function resetCircuit(name, { by = 'person' } = {}) { const s = must(name); s.crashes = []; s.circuit = { open: false, openedAt: null, why: null }; s.state = 'stopped'; write('circuit-close', name, 'reset by a person', { by }); return view(s); }

  async function boot({ set = P.bootSet, by = 'boot' } = {}) {
    const E = new Map([...S.values()].map(s => [s, eff(s.decl)]));   // SC2: his autostart, on demand and phase over the declaration
    const want = (s) => (Array.isArray(set) ? set.includes(s.decl.name) : E.get(s).autostart === false ? false : set === 'core' ? !!s.decl.critical : !E.get(s).onDemand);
    const chosen = [...S.values()].filter(want), skipped = [...S.values()].filter(s => !want(s)).map(s => ({ name: s.decl.name, why: E.get(s).autostart === false && !Array.isArray(set) ? 'autostart off (his configuration)' : E.get(s).onDemand ? 'on demand' : `not in bootSet ${JSON.stringify(set)}` }));
    const adopted = await _adopt(by);   // MG15: systems left running by the last manager are adopted, not started again
    write('boot', null, `boot set ${JSON.stringify(set)}: ${chosen.length} to start${adopted.length ? ` (${adopted.length} adopted: ${adopted.join(', ')})` : ''}`, { by });
    const phases = [...new Set(chosen.map(s => E.get(s).phase ?? 99))].sort((a, b) => a - b), started = [];
    for (const ph of phases) {
      const group = chosen.filter(s => (E.get(s).phase ?? 99) === ph);
      for (const s of group) { if (!running(s)) spawnNow(s.decl.name, by); started.push(s.decl.name); }
      await Promise.all(group.filter(s => E.get(s).healthUrl || E.get(s).heartbeat).map(async (s) => {   // the phase waits for its health, never forever (§1.2)
        if (E.get(s).heartbeat) { if (!(await waitBeat(s, s.proc, P.phaseGateMs))) write('health', s.decl.name, `phase ${ph}: no beat within ${P.phaseGateMs / 1000}s — boot goes on, said`); return; }   // PR6 slice a
        const until = Date.now() + P.phaseGateMs;
        while (Date.now() < until) { if (await checkHealth(E.get(s).healthUrl)) { if (s.proc) s.state = 'up'; return; } await new Promise(r => setTimeout(r, 250)); }
        write('health', s.decl.name, `phase ${ph}: no health within ${P.phaseGateMs / 1000}s — boot goes on, said`);
      }));
    }
    api.lastBoot = { started, skipped, at: Date.now() };
    return { started, skipped };
  }

  const reaper = setInterval(() => {   // on-demand systems idle past idleMs stop
    for (const [n, s] of S) { if (s.proc && s.proc.adopted && !_alive(s.proc.pid)) onExit(n, s.proc, null, null); for (const x of (s.tails || [])) x.read(); }   // MG15
    for (const s of S.values()) if (s.decl.onDemand && running(s) && s.state !== 'paused' && s.lastActivity && Date.now() - s.lastActivity > P.idleMs) { s.state = 'idling'; try { s.proc.kill('SIGTERM'); } catch (_) {} }
    if (OUT) _sweep();   // 2026-11-25: orphans adopted, strays ended (not in tests' own spawn)
  }, P.idleCheckMs); if (reaper.unref) reaper.unref();

  // 2026-11-14 DW1 — James: "says clear glass isn't working" while Clear Glass was open on his screen. Under the Windows service a windowed system
  // is left to his session (state 'desktop', no pid of COS's), and nothing ever asked its health again, so COS showed it down forever. Every 10 s a
  // desktop system's health is asked; answering, it is shown up (in his session, not COS's child: COS still never stops or restarts it).
  async function watchDesktop() {
    for (const s of S.values()) {
      if (s.state !== 'desktop' || s.proc) continue;
      const url = eff(s.decl).healthUrl; if (!url) continue;
      let ok = false; try { ok = !!(await checkHealth(url)); } catch (_) {}
      if (ok && !s.desktopUp) write('desktop-up', s.decl.name, `running in your session: its health answers at ${url}`);
      if (!ok && s.desktopUp) write('desktop-down', s.decl.name, `no longer answers at ${url} (closed in your session?)`);
      s.desktopUp = ok;
    }
  }
  const desktopWatch = setInterval(watchDesktop, 10000); if (desktopWatch.unref) desktopWatch.unref();

  function view(s) {
    const d = eff(s.decl);
    return { name: d.name, system: d.system, state: s.state === 'desktop' && s.desktopUp ? 'up' : s.state, inYourSession: s.state === 'desktop' ? !!s.desktopUp : undefined, pause: s.pause ? { ...s.pause, pids: [...s.pause.pids] } : null, pid: s.pid, port: d.healthUrl ? Number((/:(\d+)/.exec(d.healthUrl) || [])[1]) || null : null,
      healthUrl: d.healthUrl || null, ui: d.ui || null, critical: !!d.critical, compartment: d.compartment || null, walled: !!(d.boundary && d.boundary.allow), wallMode: d.boundary ? (d.boundary.mode || 'enforce') : null, wallVia: d.boundary && d.boundary.allow ? (/electron/i.test(String(d.cmd)) ? 'NODE_OPTIONS' : '--require') : null, bootPhase: d.onDemand ? null : (d.phase ?? null), onDemand: !!d.onDemand,
      restarts: { count: s.restarts, last: s.lastExit ? s.lastExit.ts : null, backoffMs: s.backoffMs }, circuit: { ...s.circuit }, startedAt: s.startedAt, by: s.by,
      // MG16: what autopilot's /status carried, so the door answers in its shape
      crashesInWindow: (prune(s), s.crashes.length), lastExit: s.lastExit, downSince: s.state === 'down' || s.state === 'circuit-open' ? (s.lastExit && s.lastExit.ts) : null, lastActivity: s.lastActivity };
  }
  function ledger({ limit = 100, system = null } = {}) {
    let lines = []; try { lines = fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (_) {}
    return (system ? lines.filter(e => e.system === system) : lines).slice(-limit);
  }
  function shutdown({ by = 'person' } = {}) { clearInterval(reaper); clearInterval(desktopWatch);
    // MG21: an adopted or escaped system is outside this process's tree, so a shutdown (the service's Stop) ends it here and waits for it:
    // the manager may exit right after, and an async kill would leave it running
    for (const s of S.values()) if (running(s) && s.proc && s.proc.adopted && s.proc.pid && process.platform === 'win32') { try { require('child_process').spawnSync('taskkill', ['/PID', String(s.proc.pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }); } catch (_) {} }
    for (const [n, s] of S) if (running(s)) stop(n, { by }); write('stop', null, 'supervisor shutdown', { by }); }

  // MG17: a line the supervisor did not act on but must keep (the handover, naming the version that made it)
  function note(kind, why, { by = 'person', system = null } = {}) { if (!/^[a-z][a-z-]{1,30}$/.test(String(kind))) throw new Error(`a note's kind is a word: ${kind}`); return write(kind, system, why, { by }); }

  function logs(name, { limit = 200 } = {}) { const s = must(name); return s.out.slice(-Math.max(1, Math.min(LOG_KEEP, limit))); }

  const api = { watchDesktop, boot, note, logs, pause, resume, on: (ev, fn) => bus.on(ev, fn), off: (ev, fn) => bus.off(ev, fn), declarations: () => decls.map(d => ({ ...d })), list: () => [...S.values()].map(view), get: (n) => view(must(n)), start, stop, restart, touch, resetCircuit, ledger,
    policy: () => JSON.parse(JSON.stringify(P)), setPolicy: (patch, { by = 'person' } = {}) => { Object.assign(P, patch || {}); write('policy', null, `policy changed: ${JSON.stringify(patch)}`, { by }); return JSON.parse(JSON.stringify(P)); },
    shutdown, handOver, record: (kind, system, why, extra) => write(kind, system, why, extra),   // MG20: the manager says what blocks it
    outlive: OUT, DEFAULTS, ledgerFile: LEDGER, beat, memoryObserve, memoryBaseline, memoryJudge, lastBoot: null, setHooks: (h) => { Object.assign(hooks, h || {}); },
    // SC4 — a system added while COS runs (its declaration just written by add-system.js): declared live, never started by this
    declare: (d) => { if (!d || !d.name) throw Object.assign(new Error('a declaration needs a name'), { code: 400 }); if (S.has(d.name)) throw Object.assign(new Error(`"${d.name}" is already declared`), { code: 409 });
      decls.push(d); add(d); write('declared', d.name, `added while COS runs: ${d.cmd || 'node'} ${(d.args || []).join(' ')}`, { by: d.addedBy || 'person' }); return view(S.get(d.name)); },
    // PC20 (2026-11-24, his: "can you hook that into cos superviser?") — a system that declares processes of its own while COS runs (the model
    // server: one engine per model, written from its settings) is read again: a new name is declared live; a known one that is not running takes
    // its new declaration; a running one is never touched. Nothing starts here.
    rescan: ({ by = 'person' } = {}) => {
      if (declarations) return { added: [], updated: [], said: 'this supervisor was given its declarations: nothing to read' };
      const added = [], updated = [];
      for (const d of readDeclarations(root)) {
        const s = S.get(d.name);
        if (!s) { decls.push(d); add(d); write('declared', d.name, `declared by ${d.system || '?'} while COS runs: ${d.cmd || 'node'}`, { by }); added.push(d.name); continue; }
        if (!running(s) && JSON.stringify(s.decl) !== JSON.stringify(d)) { const i = decls.indexOf(s.decl); if (i >= 0) decls[i] = d; s.decl = d; updated.push(d.name); }
      }
      return { added, updated };
    },
    effective: (n) => eff(must(n).decl), commandOf: (n) => commandOf(must(n).decl), root };
  return api;
}

module.exports = { createSupervisor, readDeclarations, DEFAULTS, httpOk, isWindowed, realElectron };
