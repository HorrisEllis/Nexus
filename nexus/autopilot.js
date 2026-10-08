'use strict';
// ── autopilot.js — NEXUS Process Supervisor ─────────────────────────────────
// UUID: nexus-autopilot-v1-0000-4000-0000-000000000001
//
// §AUTOPILOT-01: everything in cortex/boot.js's organs.init phase (RAID,
// healer, gap-loop, escalation) heals problems *inside* a running process.
// None of it helps if the process itself dies — and `npm run start:all` runs
// every kernel under `concurrently --kill-others-on-fail`, which means one
// crashed process takes the entire system down with it. That's the opposite
// of self-healing; it's a single point of failure wired to a tripwire.
//
// This replaces that. Each kernel is its own child_process. A crash is
// logged, the *other* kernels are left running, and the dead one is
// restarted with exponential backoff. A circuit breaker stops a process that
// won't stay up (config error, missing dependency) from crash-looping
// forever — it's marked DOWN, reported clearly, and left for a human or the
// forge pipeline, instead of spinning.
//
// §1.2 NOTHING_SILENT — every crash, restart, and circuit-trip is logged to
// both stdout and an append-only file, so this has its own ledger even if
// every other ledger in the system is the thing that's down.
//
// Usage:
//   node autopilot.js                 — boots the default kernel set
//   node autopilot.js --only=cortex,guardian
//   node autopilot.js --status-port=7799
//
// npm:
//   "autopilot": "node autopilot.js"

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('http');

// §FIXED 2026-09-11 — this file moved from repo root into nexus/ (N2,
// 2026-09-11 phasemap). __dirname now resolves to .../nexus, not the repo
// root — every real caller below (data/ tree walks, child-process cwd,
// other systems' relative paths) needs the actual root, one level up.
const ROOT     = path.join(__dirname, '..');

// §RESOURCE GOVERNANCE 2026-07-10 — see _spawnKernel for the crash this fixes.
// 1024MB per Node child: twelve of them is ~12GB worst case rather than the
// ~48GB twelve uncapped V8 heaps could theoretically claim. Override per kernel
// with `maxOldSpaceMB` for a system that genuinely needs more (cortex holds the
// memory tables; guardian holds job state).
const DEFAULT_MAX_OLD_SPACE_MB = Number(process.env.NEXUS_MAX_OLD_SPACE_MB || 1024);
const MEM_BACKOFF_MS = 15000;
// §PRIORITY — halt floor for kernel.critical kernels (default gate is 10%,
// see lib/resource-monitor's DEFAULT_THRESHOLDS.freeMemHaltPct). Lower, not
// zero: a critical kernel spawning into truly exhausted memory still fails
// with the same 'spawn UNKNOWN' this whole guard exists to prevent.
const CRITICAL_HALT_PCT = Number(process.env.NEXUS_CRITICAL_HALT_PCT || 0.05);
const { ResourceMonitor } = require('../lib/resource-monitor');
const _resourceMonitor = new ResourceMonitor({ name: 'autopilot', intervalMs: 15000 }).start();

// ── §P1 nexus-live-mind 2026-08-07 — wire the nervous system live ────────────
// The producer side is done: lib/component-ledger.write() emits every system's
// events into lib/ledger-fanin. Here, at the boot entry point, we subscribe the
// consumers — activity-log (→ cortex event_log + error_log), intelligence, and
// autopilot itself — so the stream "all points towards autopilot" for real.
// §1.2 — wrapped; a fan-in wiring failure must never stop the boot.
let _faninEvents = [];   // autopilot's live view of the whole-system stream
let _ledgerWire = null;  // §ledger-wire — remote systems' ledger streams (cross-process)
try {
  const { wireFanin } = require('../lib/ledger-fanin/boot');
  const _fw = wireFanin({
    onAutopilot: (row) => { _faninEvents.push(row); if (_faninEvents.length > 1000) _faninEvents.shift(); },
  });
  console.error(`[autopilot] §P1 fan-in wired: ${_fw.wired.join(', ')}${_fw.skipped.length ? ' (deferred: ' + _fw.skipped.map(s => s[0]).join(',') + ')' : ''}`);

  // §LEDGER-WIRE 2026-08-17 — the deferred consumers, actually connected.
  //
  // 'deferred: copilot' above was never going to resolve on its own. The
  // fan-in's subscriber list is module state, so it is per-PROCESS, and
  // copilot/cortex/diagnostic are all separate spawned processes. The note
  // "co-pilot subscribes at its own boot" was true and useless: it subscribed
  // to its own array, in its own process, which autopilot cannot see. Nothing
  // was broken — the wire simply did not exist.
  //
  // These subscriptions ARE that wire. Each emitter serves /ledger/stream
  // (lib/ledger-sse.mount) in canonical component-ledger schema; each row
  // arriving here is replayed into autopilot's LOCAL fan-in, so activity-log,
  // intelligence and the snapshot trigger all receive it exactly as if it had
  // been emitted in-process. §14.4 — relayed rows are tagged and never
  // re-broadcast, so two systems watching each other cannot loop.
  //
  // §1.2 — an emitter that is down is a REPORTED state ('never-reached'), not
  // a quiet zero. That distinction is the whole point: a silent stream and an
  // idle stream look identical until you insist they don't.
  try {
    const ledgerSSE = require('../lib/ledger-sse');
    // NOTE the key is `system:`, not `name:` — deliberately, and this comment
    // deliberately does not spell the colliding literal out either.
    //
    // test-boot-log-fixes BL-001 locates the diagnostic KERNEL by slicing this
    // file from the first occurrence of that kernel's name-key pair. Writing the
    // same pair here put a second occurrence ~120 lines above the kernel table
    // and silently hijacked the search, so a passing test began failing while
    // the code it checks was untouched. Spelling it out in a comment reproduced
    // the identical break — string-scanning tests do not distinguish code from
    // prose. The fix belongs here, not in loosening the assertion.
    _ledgerWire = ledgerSSE.attachAll([
      { system: 'copilot',    url: 'http://127.0.0.1:3750/ledger/stream' },
      { system: 'cortex',     url: 'http://127.0.0.1:3748/ledger/stream' },
      { system: 'diagnostic', url: 'http://127.0.0.1:7825/ledger/stream' },
      { system: 'guardian',   url: 'http://127.0.0.1:7820/ledger/stream' },
      { system: 'loom',       url: 'http://127.0.0.1:3752/ledger/stream' },
    ]);
    console.error(`[autopilot] §ledger-wire consuming: ${_ledgerWire.attached.join(', ')}`
      + (_ledgerWire.failed.length ? ` (failed: ${_ledgerWire.failed.map(f => f[0]).join(',')})` : ''));
  } catch (e) {
    console.error(`[autopilot] §ledger-wire unavailable: ${e.message} — remote system activity will NOT be visible here`);
  }

  // error.log — the plain file that outlives the systems it reports on. The
  // cortex error_log TABLE already exists and stays; but it is only readable
  // when cortex is up and the store loads, which is exactly not true during
  // the failures worth reading. §2.1 disk first.
  try {
    const elog = require('../lib/error-log');
    elog.attach(require('../lib/ledger-fanin'));
    console.error(`[autopilot] §error-log active — ${elog.LOG_PATH}`);
  } catch (e) {
    console.error(`[autopilot] §error-log unavailable: ${e.message}`);
  }

  // §2026-08-08 — wire + VERIFY the whole intelligence substrate at boot:
  // intelligence (learner) + RFR2 (relational-field) + CFR (field/regime) +
  // baseline behaviour + sigma→snapshot + emergence (pattern detection). One
  // coherent bundle, reported honestly (§1.1 declared≠real). §1.2 never dies here.
  // GATED to real boot only: starting intelligence emits its own stdout logs,
  // which corrupt the status JSON that a spawned status-probe autopilot prints.
  // So only wire it when this is the actual orchestrator entry, not a probe
  // (--status-port) and not a require() (require.main !== module). §0.1 fix.
  const _isProbe = process.argv.slice(2).some(a => a.startsWith('--status-port='));
  if (require.main === module && !_isProbe) {
    try {
      const { wireIntelligence } = require('../lib/autopilot-intelligence');
      const _iw = wireIntelligence({ snapshotAlreadyAttached: true });
      console.error(`[autopilot] ${_iw.report}`);
    } catch (e) { console.error(`[autopilot] intelligence substrate wiring skipped: ${e.message}`); }
  }
} catch (e) { console.error(`[autopilot] §P1 fan-in wiring skipped: ${e.message}`); }

const LOG_DIR  = path.join(ROOT, 'data', 'autopilot');
const LOG_FILE = path.join(LOG_DIR, 'autopilot.log');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch(_) {}

// ── Kernel set — mirrors package.json's start:all, single source of truth ────
// §FIXED 2026-07-16 — root cause of a live crash loop: "clear-glass ...
// The system cannot find the path specified." The npm workspaces change
// (added 2026-07-15 so `npm install` at root also installs clear-glass's
// deps) can hoist `electron` to the ROOT node_modules/.bin instead of
// clear-glass's own — npm's hoisting decision depends on whether anything
// else in the workspace conflicts with electron's version, which nothing
// currently does, so it hoisted. The clear-glass kernel below was hardcoded
// to the pre-workspaces layout (clear-glass/node_modules/.bin/electron.cmd)
// only, from the 2026-07-02 bugfix — that fix was correct for the layout
// that existed then, but never anticipated the binary moving. Checking both
// real locations on disk at boot, instead of assuming one, means this
// doesn't silently break again the next time `npm install`'s hoisting
// decision changes (e.g. once clear-glass gains a dependency that conflicts
// with something at root and stops being hoistable).
const _ELECTRON_BIN     = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const _ELECTRON_LOCAL   = path.join(ROOT, 'clear-glass', 'node_modules', '.bin', _ELECTRON_BIN);
const _ELECTRON_HOISTED = path.join(ROOT, 'node_modules', '.bin', _ELECTRON_BIN);
const _ELECTRON_CMD = fs.existsSync(_ELECTRON_LOCAL)
  ? path.join('node_modules', '.bin', _ELECTRON_BIN)  // relative — resolved against clear-glass's cwd below, matches the 2026-07-02 fix's join logic
  : _ELECTRON_HOISTED;                                 // absolute — root-hoisted install; resolvedCmd in _spawnKernel passes absolute paths through unchanged

const ALL_KERNELS = [
  // §FIX 2026-06-20: orchestrator.js normally boots bridge/cortex/guardian/
  // idearium/architect/diagnostic itself via _bootSystems(). Autopilot is
  // ALSO spawning all of those as siblings below — without this env var,
  // both copies fight over the same ports (3748, 7820, 3747, 7825, 4800...)
  // and every one but the first to bind throws EADDRINUSE. NEXUS_SUPERVISED
  // tells orchestrator.js to skip its internal boot and just be the HTTP/UI
  // front end — autopilot owns spawning every sub-system instead.
  // §BOOT PHASES 2026-07-20 — derived from real boot-log evidence, not
  // guessed. Every symptom in the 17:55 and 18:04 live logs traced to all
  // 12 kernels spawning in the same instant:
  //   - orchestrator's gap-relay hit ECONNREFUSED on guardian:7820 and
  //     diagnostic:7825 (spawned same tick, not yet listening)
  //   - contract poller logged contract.unreachable for systems mid-boot
  //   - six processes parsed the ENTIRE shared JAA store simultaneously —
  //     the memory spike that OOM-killed the gemini renderer at 17:56
  // Phase N+1 does not begin until every phase-N kernel passes its real
  // /health gate (or its timeout expires LOUDLY — a slow system delays
  // boot, it must never deadlock it, §1.2). Same _pollHealth discipline
  // the on-demand path has used since 2026-07-15, applied to the whole
  // sequence. Phasing also serializes the JAA load spikes instead of
  // stacking all of them.
  //   §REORDERED 2026-07-24 (James: "cortex first, gated each step")
  //   Phase 1: cortex — the MEMORY CORE and, since James's 2026-07-24
  //            storage decision ("stored in cortex"), the data root every
  //            other system's writes land in. Bringing the store up before
  //            its writers is the correct dependency order; it was phase 2
  //            only because orchestrator held the registration authority.
  //            Safe to lead, verified not assumed: cortex/boot.js's
  //            _register() is fire-and-forget with a 5s retry on error
  //            (cortex/boot.js:1050) — it never blocks on orchestrator
  //            existing, so a later orchestrator is picked up automatically.
  //   Phase 2: orchestrator (registration authority + bus + gap-relay),
  //            guardian + diagnostic (gap-relay's dial targets), bridge
  //   Phase 3: the app layer — everything that registers and serves
  //   Phase 4: emerge — reports to copilot:3750, so copilot must be up
  //   clear-glass: onDemand, unchanged — no phase, dormant until requested
  { name: 'orchestrator', cmd: 'node', args: ['orchestrator/orchestrator.js'], env: { NEXUS_SUPERVISED: '1' },
    critical: true, phase: 2, healthUrl: 'http://127.0.0.1:9000/health' },
  // §RETIRED 2026-09-06 — bridge/index.js removed entirely (James: "it
  // has to go"). Was never a real functional dependency for guardian/
  // cortex (checked directly — no real code path required it), and
  // orchestrator's own REQUIRED_SYSTEMS list never included it either.
  // The one real thing it did — relaying tv-shell/Clear Glass requests
  // to copilot's /bridge/deliver — now goes there directly.
  { name: 'cortex',       cmd: 'node', args: ['cortex/boot.js'],
    critical: true, phase: 1, healthUrl: 'http://127.0.0.1:3748/health' },
  { name: 'guardian',     cmd: 'node', args: ['guardian/server.js'],
    critical: true, phase: 2, healthUrl: 'http://127.0.0.1:7820/health' },
  { name: 'idearium',     cmd: 'node', args: ['idearium/api/index.js'],
    phase: 3, healthUrl: 'http://127.0.0.1:4800/health' },
  { name: 'architect',    cmd: 'node', args: ['architect/service.js'],
    phase: 3, healthUrl: 'http://127.0.0.1:3747/health' },
  { name: 'diagnostic',   cmd: 'node', args: ['diagnostic/nexus-diagnostic.js'],
    critical: true, phase: 2, healthUrl: 'http://127.0.0.1:7825/health' },
  { name: 'eravos',       cmd: 'node', args: ['eravos/server.js'],
    phase: 3, healthUrl: 'http://127.0.0.1:3751/health' },
  // §NEW 2026-08-22 — intelligence/server.js. Built and live-tested this
  // session (4 real phases: cortex/intelligence + baseline/snapshot-
  // trigger + meta/cfr moved here, plus the new framework-builder). Needs
  // cortex's jaaDB up first (same real dependency idearium/architect/
  // eravos already have) — phase 3, not phase 1.
  { name: 'intelligence', cmd: 'node', args: ['intelligence/server.js'],
    phase: 3, healthUrl: 'http://127.0.0.1:3753/health' },
  // The consumer half — matches emerge/consumer.js's exact real pattern:
  // a pure file-watcher, no http.createServer, process-alive is the only
  // honest readiness signal. optional: true, same reasoning as emerge —
  // a queued framework request that can't be picked up yet shouldn't trip
  // the whole system's circuit breaker.
  { name: 'intelligence-consumer', cmd: 'node', args: ['intelligence/consumer.js'], optional: true, phase: 4 },
  { name: 'ollama-bridge',cmd: 'node', args: ['ollama/server.js'], optional: true,
    phase: 3, healthUrl: 'http://127.0.0.1:3749/health' },
  // §VS1 2026-09-02 (docs/2026-09-02-versionium-sovereign-and-cleanup-
  // phasemap.spec) — James: "versionium is its own folder. it's system
  // with a server.js." Previously embedded in cortex/boot.js's own
  // process; promoted to sovereign here. phase 3, same as ollama-bridge
  // and copilot — no real dependency on anything phase-2-or-earlier
  // other than orchestrator itself (for registration) being up, and its
  // own real live-field trigger already degrades honestly (logs
  // "unreachable, non-fatal") if cortex isn't up yet when it starts.
  // optional: true — a missing versionium shouldn't trip the whole
  // system's circuit breaker; agent-mesh dispatch and RAID contract
  // intake keep working, just without commit history for this boot.
  { name: 'versionium',   cmd: 'node', args: ['versionium/server.js'], optional: true,
    phase: 3, healthUrl: 'http://127.0.0.1:3754/health' },
  { name: 'copilot',      cmd: 'node', args: ['copilot/server.js'], optional: true,
    phase: 3, healthUrl: 'http://127.0.0.1:3750/health' },
  // §NEW 2026-07-11 — emerge/consumer.js. Emerge itself is a compiler
  // LIBRARY (no http.createServer anywhere under emerge/, confirmed by
  // grep) — this is the process that was missing entirely, not a service
  // that existed and wasn't supervised. Without it, every contract
  // copilot/module-builder.js dispatches to emerge/input/ sits there
  // forever; the 'module-build-dispatched-then-accepted' expectation
  // (copilot/lib/expectation-watcher.js) exists specifically to make that
  // failure loud instead of silent. optional: true — a build request
  // that can't be picked up yet shouldn't trip the whole system's circuit
  // breaker, same reasoning as copilot/loom above.
  // phase 4 — reports to copilot:3750, so copilot (phase 3) must be up.
  // No healthUrl: emerge is a file-watcher with no HTTP server (confirmed
  // above) — process-alive is the only honest readiness signal it has.
  // §RETIRED 2026-09-06 — PULSE_ALL_2026-09-06 / James (via a parallel
  // session, reconciled in): "its just a compiler thats it, the rest is
  // trash." emerge/consumer.js (the standalone poller this spawned) is
  // archived; copilot/module-builder.js now calls emerge/compiler/
  // pipeline.js's real compile() directly, synchronously, no file-drop
  // queue, no separate process. emerge/compiler/ itself is untouched and
  // still the real, load-bearing thing — only the poller wrapper is gone.
  { name: 'loom',         cmd: 'node', args: ['loom/server.js'],    optional: true,
    phase: 3, healthUrl: 'http://127.0.0.1:3752/health' },
  // Clear Glass sovereign browser — Electron + inline wire bridge.
  // Registers itself AND ErosmancerOS with the orchestrator on boot.
  // optional: true — missing Electron install won't trip the circuit breaker.
  // One-time: run `npm install` inside clear-glass/ before first boot.
  // Windows needs electron.cmd; Unix uses the symlink — detect at runtime.
  // §FIXED 2026-09-06 — James: "i want you to decouple the userscripts
  // from the ui. nothing is reliant on the ui." AND, the concrete bug
  // this same finding explains: "it routes to it. but doesnt do anything
  // beyond that" (chatgpt dispatch never acking). Traced directly: the
  // real dispatch/ack path (copilot/lib/self-model.js's _pollForAck)
  // posts straight to guardian and polls for a status change — it has
  // ZERO awareness of onDemand/idleTimeoutMs below, or of requestSpawn/
  // _ensureClearGlassUp (guardian/clear-glass-bridge.js, built earlier
  // this session for the /providers/:id/spawn route, which NOTHING in
  // the real ack-polling path ever calls). If clear-glass had despawned
  // from 10 minutes of idle (exactly the kind of gap a real conversation
  // has between messages), the very next dispatch attempt would create a
  // job, get a jobId back from guardian, and then poll forever for an
  // ack that can never arrive — there's no tab, and nothing in that path
  // knows to ask for one.
  //
  // The onDemand design wasn't wrong on its own terms — it was a real,
  // deliberate fix for a real, documented OOM crisis (see the
  // haltPctOverride comment below, kept unchanged: cortex OOM'd, unable
  // to restart at 6-7% free, while clear-glass held memory it wasn't
  // using). But "the heaviest process, so make it optional" and "the
  // provider tabs are vital, always needed" are in direct conflict once
  // NCP is core rather than a UI convenience — this session's own real
  // finding (guardian/lib/ncp.js's staleSweep fix, clear-glass/src/
  // providers/host.js's unexpected-close respawn fix) both assumed
  // clear-glass is simply up; onDemand quietly broke that assumption
  // after any 10-minute lull. Promoted to a real, always-running,
  // supervised kernel — not critical (a browser-automation outage
  // degrades NCP-routed dispatch, it doesn't halt the rest of NEXUS,
  // matching _dispatchViaGuardian's own honest-degrade contract) — and
  // launched with --headless (clear-glass/src/main/index.js's own
  // documented tray-only mode, built specifically "for: background NCP
  // provider" — this is that mode's real intended use, just never wired
  // into the supervision tree that would actually keep it alive). The
  // haltPctOverride memory safety valve below is kept exactly as-is:
  // clear-glass specifically still refuses to (re)start under tighter
  // memory pressure than everything else, so the original crisis this
  // whole design responded to still can't recur.
  // §CORRECTED 2026-09-06 — James: "it cant anounce it is headless. i want
  // to be able to use clearglass. it opens on boot. i use it. i want a
  // backend." Real course-correction from the previous fix in this same
  // file: promoting clear-glass off onDemand (below, unchanged — that part
  // was right) does not mean hiding its window. §5.12's actual text is
  // "removing the UI must not affect execution" — never "there must be no
  // UI". James wants both at once: a real, visible, usable window that
  // opens on boot, AND a backend (NCP/provider dispatch) that doesn't stop
  // working if that window is ever closed or crashes. --headless was the
  // wrong tool for that — it removes the window entirely, which directly
  // contradicts "I use it. It opens on boot." Reverted; the window opens
  // normally now. The actual backend-independence work is in what's
  // ALREADY real and unchanged here: onDemand/idleTimeoutMs removed
  // (clear-glass no longer despawns from under a live dispatch), phase:3
  // supervision (crash-restarted like every other real system), and
  // ProviderHost's own unexpected-close respawn fix from the commit
  // before this one — none of which required hiding anything.
  { name: 'clear-glass',
    cmd: _ELECTRON_CMD,
    args: ['.'], cwd: 'clear-glass', optional: true,
    // §FIXED 2026-09-06 (reconciled from a parallel session) — autopilot
    // was polling SSE_PORT (7701), but clear-glass's own real /health
    // route explicitly reports { module:'nexus-wire', port: WIRE_PORT }
    // — confirmed directly in clear-glass/src/main/index.js before
    // applying this. Health checks against the wrong port would have
    // been silently failing or matching the wrong server this whole time.
    phase: 3, healthUrl: 'http://127.0.0.1:7704/health',
    // §PRIORITY 2026-07-31 — the heaviest single process in the stack
    // (Electron + four provider webviews) gets a HIGHER halt floor than the
    // default 10%, so it's the first thing refused under pressure, not the
    // same as everything else.
    haltPctOverride: 0.15,
    env: { GUARDIAN_DIR: path.join(ROOT, 'guardian') },
    // §CRITICAL fix 2026-06-30 — root cause of a real 6-crash circuit-
    // breaker trip, traced from a live boot log: requestSingleInstanceLock()
    // was failing on every restart because Windows hadn't finished
    // releasing the previous Electron instance's lock file before
    // autopilot's 1s/2s/4s backoff fired the next attempt. Electron/OS-
    // level process teardown (especially on Windows) is measurably slower
    // than a plain `node` process exiting — the uniform BACKOFF_BASE_MS=1000
    // that works fine for every other kernel here was too aggressive
    // specifically for this one. minRestartDelay enforces a floor
    // independent of the exponential backoff curve.
    minRestartDelay: 3000 },
];

// ── Restart policy ────────────────────────────────────────────────────────────
const BACKOFF_BASE_MS   = 1000;
const BACKOFF_MAX_MS    = 30000;
const STABLE_MS         = 60000;   // alive this long → backoff resets to base
const CIRCUIT_MAX_CRASHES = 6;     // crashes within window → trip the breaker
const CIRCUIT_WINDOW_MS   = 5 * 60 * 1000;

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const onlyArg = argv.find(a => a.startsWith('--only='));
const statusArg = argv.find(a => a.startsWith('--status-port='));
const CLI_MODE = argv.includes('--cli');   // §2026-08-08 — launch the interactive CLI after boot
const ONLY_NAMES = onlyArg ? new Set(onlyArg.split('=')[1].split(',').map(s => s.trim())) : null;
const DEFAULT_STATUS_PORT = 7799;
let STATUS_PORT;
if (statusArg) {
  STATUS_PORT = parseInt(statusArg.split('=')[1]);
} else if (process.env.AUTOPILOT_STATUS_PORT !== undefined) {
  // Explicit env var wins even if it's "0" (opt-out) — `|| DEFAULT` would
  // silently override 0 since 0 is falsy, defeating the opt-out.
  STATUS_PORT = parseInt(process.env.AUTOPILOT_STATUS_PORT);
} else {
  STATUS_PORT = DEFAULT_STATUS_PORT;
}
// --status-port=0 or AUTOPILOT_STATUS_PORT=0 disables it (checked via !STATUS_PORT below).

// §BUILT 2026-07-24 — clear-glass needs to know the REAL status port to call
// POST /touch/clear-glass (see the idle-vs-open fix below), and it can't just
// assume DEFAULT_STATUS_PORT: --status-port= or AUTOPILOT_STATUS_PORT could
// have overridden it above. ALL_KERNELS is a plain array literal defined
// before STATUS_PORT is resolved, so this has to happen here, not inline in
// that literal. STATUS_PORT === 0 means the status server is disabled
// entirely — pass 0 through so clear-glass knows not to bother calling it,
// rather than silently retrying against a server that was never started.
{
  const cg = ALL_KERNELS.find(k => k.name === 'clear-glass');
  if (cg) cg.env = { ...(cg.env || {}), AUTOPILOT_STATUS_PORT: String(STATUS_PORT) };
}

const KERNELS = ALL_KERNELS.filter(k => !ONLY_NAMES || ONLY_NAMES.has(k.name));

const COLORS = ['\x1b[36m','\x1b[35m','\x1b[32m','\x1b[33m','\x1b[34m','\x1b[31m','\x1b[37m'];
const RESET  = '\x1b[0m';

// ── State ─────────────────────────────────────────────────────────────────────
// _state[name] = { proc, status, crashes:[ts,...], restarts, lastExit, downSince, backoffMs, stableTimer }
const _state = {};

function _log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  try { fs.appendFileSync(LOG_FILE, stamped + '\n'); } catch(_) {}
}

function _initState(name) {
  _state[name] = {
    proc: null, status: 'starting', crashes: [], restarts: 0,
    lastExit: null, downSince: null, backoffMs: BACKOFF_BASE_MS, stableTimer: null,
    lastActivity: null, // §BUILT 2026-07-15 — on-demand idle tracking
  };
}

function _prune(crashes) {
  const cutoff = Date.now() - CIRCUIT_WINDOW_MS;
  return crashes.filter(ts => ts > cutoff);
}

function _spawnKernel(kernel, color) {
  const s = _state[kernel.name];
  if (s.stableTimer) { clearTimeout(s.stableTimer); s.stableTimer = null; }

  _log(`${color}[${kernel.name}]${RESET} starting — ${kernel.cmd} ${kernel.args.join(' ')}`);
  _warpEmit('autopilot.kernel.spawn', { kernel: kernel.name });

  const path = require('path');
  const resolvedCwd = kernel.cwd ? path.join(ROOT, kernel.cwd) : ROOT;
  // §BUGFIX 2026-07-02: a relative kernel.cmd (e.g. clear-glass's
  // 'node_modules\.bin\electron.cmd') was being looked up against
  // autopilot.js's own process.cwd() (the repo root), not against the
  // `cwd` option below — that option only sets the CHILD's working
  // directory once it starts, it does not change where Node/Windows
  // looks for the executable itself. That's the exact cause of "The
  // system cannot find the path specified" — Windows was looking for
  // <repo root>/node_modules/.bin/electron.cmd, which doesn't exist;
  // the real one is at clear-glass/node_modules/.bin/electron.cmd.
  // Resolving to an absolute path here removes the ambiguity entirely.
  const resolvedCmd = (kernel.cwd && !path.isAbsolute(kernel.cmd))
    ? path.join(resolvedCwd, kernel.cmd)
    : kernel.cmd;

  // §CRASH ROOT CAUSE 2026-07-10 — from a live Windows console:
  //     [orchestrator] exited code=3221226505   (0xC0000409, STATUS_STACK_BUFFER_OVERRUN
  //                                              — Node's fatal fast-fail, usually OOM)
  //     Error: spawn UNKNOWN  errno: -4094      (UV_UNKNOWN, on the RESTART)
  // The same command spawned fine seconds earlier, so the path was never wrong:
  // the machine had no memory left to fork into.
  //
  // Measured: this supervisor spawns twelve Node processes and passed NO heap
  // limit to any of them. Each was free to grow to V8's default (~4GB on
  // 64-bit). Add Clear Glass (Electron + four provider webviews) and there is
  // no headroom. Nothing was watching, so the first symptom was a crash.
  //
  // Two changes, both real:
  //   1. Every Node child gets an explicit --max-old-space-size. A process that
  //      exceeds it dies with a clean JS heap OOM naming itself, instead of
  //      taking the machine down and fast-failing with a Windows status code.
  //      Per-kernel override via `kernel.maxOldSpaceMB`.
  //   2. A spawn is gated on real free memory. Restarting into an exhausted
  //      machine is how one crash becomes a crash storm: the spawn fails with
  //      UNKNOWN, the supervisor counts it as a crash, and immediately retries.
  const isNode = /(^|[\\/])node(\.exe)?$/i.test(kernel.cmd);
  const heapMB = kernel.maxOldSpaceMB || DEFAULT_MAX_OLD_SPACE_MB;
  let kernelArgs = isNode && !kernel.args.some(a => String(a).startsWith('--max-old-space-size'))
    ? [`--max-old-space-size=${heapMB}`, ...kernel.args]
    : kernel.args;

  // §FIX 2026-09-17 — from a real Windows console: cortex/self-heal/escalation
  // hits critical memory pressure repeatedly and every time logs "global.gc()
  // is not exposed (start this process with --expose-gc...)" then refuses to
  // heal because it's stuck in FAILURE_MODE with no forced-collection path
  // available. The escalation ladder's memory-pressure recovery step has
  // existed the whole time; it was just never given the V8 flag it needs to
  // run. Same injection pattern as --max-old-space-size above, so this
  // applies to every Node kernel autopilot spawns, not just cortex — any of
  // them can hit this same dead end.
  if (isNode && !kernelArgs.some(a => String(a) === '--expose-gc')) {
    kernelArgs = ['--expose-gc', ...kernelArgs];
  }

  // §PRIORITY 2026-07-31 — from a real Windows console: cortex (phase 1, the
  // memory core everything else writes through) OOM-crashed, then couldn't
  // restart because the machine was at 6-7% free — and Clear Glass (Electron
  // + four live provider webviews, the single heaviest process here) was
  // gated by the exact same threshold as cortex. There was no concept of
  // priority: every kernel got the same 10% halt floor regardless of how
  // essential it was or how much memory it itself was consuming. Two-sided
  // fix, both real: critical kernels (kernel.critical) get a LOWER halt
  // floor so they're refused only in genuine last-resort conditions; heavy
  // optional kernels (kernel.haltPctOverride) get a HIGHER one so they back
  // off first, preserving headroom for the ones everything depends on. This
  // does not make a critical spawn succeed when there is truly no memory —
  // it changes who gets refused first when there's a little left.
  const spawnGateOverrides = kernel.critical
    ? { freeMemHaltPct: CRITICAL_HALT_PCT }
    : (kernel.haltPctOverride != null ? { freeMemHaltPct: kernel.haltPctOverride } : undefined);

  if (!_resourceMonitor.spawnSafe(spawnGateOverrides)) {
    const s = _resourceMonitor.current();
    console.error(`[autopilot] REFUSING to spawn ${kernel.name}: only ${(s.system.freeMemPct * 100).toFixed(1)}% memory free. ` +
                  `Spawning now would fail with 'spawn UNKNOWN' and be miscounted as a crash. Retrying in ${MEM_BACKOFF_MS / 1000}s.`);
    // §1.2 — a refusal must re-arm. Neither caller of _spawnKernel inspects the
    // return value, so returning null without rescheduling would leave the
    // kernel permanently dead and silent. Back off long enough for the machine
    // to actually recover rather than hammering a full memory subsystem.
    const t = setTimeout(() => _spawnKernel(kernel, color), MEM_BACKOFF_MS);
    if (t.unref) t.unref();
    return null;
  }

  // §CRASH ROOT CAUSE 2026-07-14 — from a real Windows console: clear-glass
  // crash-looped with "'D:\Backups\Downloads\nexus-merged-0.9.13' is not
  // recognized as an internal or external command." The install directory
  // has a space in its name ("nexus-merged-0.9.13 (1)") — a completely
  // normal thing for a real download folder to have, not a misconfiguration.
  // shell:true is required for .cmd files on Windows (see comment below),
  // but spawn() does NOT auto-quote the command string for you when shell
  // is true — that's the caller's job, and nothing here was doing it. cmd.exe
  // received the unquoted absolute path and split it at the first space,
  // trying to run "D:\Backups\Downloads\nexus-merged-0.9.13" (truncated) as
  // the command. Every kernel using a relative .cmd path (currently just
  // clear-glass) resolves to an absolute path via resolvedCmd above and was
  // equally exposed — this isn't clear-glass-specific, it's anything under
  // shell:true with a space anywhere in the real install path.
  const _needsQuoting = (s) => /\s/.test(s) && !(s.startsWith('"') && s.endsWith('"'));
  const isShell = process.platform === 'win32' && kernel.cmd.endsWith('.cmd');
  const spawnCmd  = isShell && _needsQuoting(resolvedCmd) ? `"${resolvedCmd}"` : resolvedCmd;
  const spawnArgs = isShell ? kernelArgs.map(a => _needsQuoting(String(a)) ? `"${a}"` : a) : kernelArgs;

  let proc;
  try {
    proc = spawn(spawnCmd, spawnArgs, {
      cwd: resolvedCwd,
      env: { ...process.env, ...(kernel.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      // .cmd files on Windows must run through the shell
      shell: isShell,
    });
  } catch (spawnErr) {
    // §CRASH ROOT CAUSE 2026-08-13 — from a real Windows console: orchestrator
    // and copilot both crashed (STATUS_STACK_BUFFER_OVERRUN, likely a shared
    // corrupted resource right after a stale JAA flush-lock was broken), then
    // autopilot's own attempt to RESPAWN orchestrator threw synchronously —
    // "Error: spawn UNKNOWN", errno -4094 — from inside spawn() itself, before
    // `proc` was ever assigned. The 2026-07-10 memory gate above (spawnSafe())
    // already prevents the common OOM-driven case, but any other synchronous
    // spawn() throw was still completely unguarded: it propagated straight out
    // of this function, out of the setTimeout callback that called it, and
    // crashed the ENTIRE autopilot process — killing supervision of every
    // other kernel at once, not just this one. The pasted log ends exactly
    // there: a raw stack trace, then a bare shell prompt. Nothing was
    // supervising anything after that line.
    //
    // Fixed by treating a synchronous spawn failure exactly like the crash
    // this kernel's own proc.on('exit', ...) handler already knows how to
    // recover from below — same crash-accounting, same circuit breaker, same
    // backoff — so one bad spawn degrades to "this kernel is down, retrying"
    // instead of "the supervisor is dead, nothing is running."
    _warpEmit('autopilot.kernel.spawn_failed', { kernel: kernel.name, error: spawnErr.message, code: spawnErr.code });
    s.crashes.push(Date.now());
    s.crashes = _prune(s.crashes);
    s.status = 'down';
    s.downSince = Date.now();
    _log(`${color}[${kernel.name}]${RESET} \x1b[31mspawn() threw synchronously:\x1b[0m ${spawnErr.message} (code=${spawnErr.code || 'unknown'}) — crashes in window: ${s.crashes.length}/${CIRCUIT_MAX_CRASHES}`);

    if (s.crashes.length >= CIRCUIT_MAX_CRASHES) {
      s.status = 'circuit_open';
      _warpEmit('autopilot.circuit.open', { kernel: kernel.name, crashes: s.crashes.length });
      _log(`${color}[${kernel.name}]${RESET} \x1b[31m§CIRCUIT BREAKER TRIPPED\x1b[0m — ${s.crashes.length} spawn failures in ${Math.round(CIRCUIT_WINDOW_MS/60000)}min. ` +
           `Not auto-restarting. This needs a human or a forge patch, not another retry. Other kernels keep running.`);
      _writeCircuitGap(kernel.name, s);
      return null;
    }

    s.restarts++;
    const delay = kernel.minRestartDelay ? Math.max(kernel.minRestartDelay, s.backoffMs) : s.backoffMs;
    s.backoffMs = Math.min(s.backoffMs * 2, BACKOFF_MAX_MS);
    _log(`${color}[${kernel.name}]${RESET} retrying spawn in ${Math.round(delay/1000)}s (attempt ${s.restarts})`);
    const t = setTimeout(() => _spawnKernel(kernel, color), delay);
    if (t.unref) t.unref();
    return null;
  }

  s.proc = proc;
  s.status = 'online';
  s.downSince = null;
  s.sawAddrInUse = false;

  const pipe = (stream, isErr) => {
    stream.on('data', d => {
      const text = d.toString();
      if (isErr && text.includes('EADDRINUSE')) s.sawAddrInUse = true;
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        // §timestamping fix 2026-06-30 — every console line from a child
        // system now carries [ISO timestamp] [system:entrypoint-file]
        // before the line, not just [system]. Without the timestamp,
        // reconstructing event order across a multi-system log dump
        // (like the screenshot's console output) required guessing —
        // lines from different systems interleave with no way to tell
        // which happened first. Source file makes it traceable to the
        // exact entrypoint per Phase 116's component→file mapping intent.
        const ts = new Date().toISOString();
        const srcFile = kernel.args?.[0] || kernel.name;
        console.log(`[${ts}] ${color}[${kernel.name}:${srcFile}]${RESET} ${isErr ? '\x1b[31m' : ''}${line}${isErr ? RESET : ''}`);
      }
    });
  };
  pipe(proc.stdout, false);
  pipe(proc.stderr, true);

  // §AUTOPILOT-02: a process that's been up for STABLE_MS is treated as a
  // genuine recovery, not a lucky crash-loop gap — backoff resets to base so
  // a real transient failure later doesn't inherit a maxed-out delay.
  s.stableTimer = setTimeout(() => {
    s.backoffMs = BACKOFF_BASE_MS;
    _log(`${color}[${kernel.name}]${RESET} stable for ${Math.round(STABLE_MS/1000)}s — backoff reset`);
  }, STABLE_MS);
  if (s.stableTimer.unref) s.stableTimer.unref();

  const _spawnedAt = Date.now();
  proc.on('exit', (code, signal) => {
    s.proc = null;
    s.lastExit = { code, signal, ts: Date.now() };
    if (s.stableTimer) { clearTimeout(s.stableTimer); s.stableTimer = null; }

    // §FIX 2026-09-21 — James's boot log: after a Ctrl-C the previous run's Clear
    // Glass (Electron) survived and kept its single-instance lock + devtools port.
    // Every new launch lost that lock, printed "another instance is genuinely
    // already running ... exiting cleanly" and exited with code 0 — which this
    // handler counted as crash 1/6..6/6 and tripped the breaker in ~50s, leaving
    // the phase-3 gate "passing" against the ORPHAN (its /health still answered)
    // while the orchestrator saw 30+ missed pulses and CFR coherence at 0.00.
    // Exit 0 within seconds of spawn is a hand-off, not a crash: restarting into
    // the same lock can never succeed, and counting it hides the real fault. Say
    // what is actually wrong, once, and stop.
    if (kernel.name === 'clear-glass' && code === 0 && (Date.now() - _spawnedAt) < 20000) {
      s.status = 'external';
      _warpEmit('autopilot.kernel.handoff', { kernel: kernel.name, code });
      _log(`${color}[${kernel.name}]${RESET} \x1b[33mexited 0 within ${Math.round((Date.now() - _spawnedAt) / 1000)}s — an existing Clear Glass instance holds the single-instance lock.\x1b[0m ` +
           `Not counted as a crash, not restarting. If that window is missing or the orchestrator reports missed clear-glass pulses, it is a leftover from the previous run: ` +
           `quit it (tray icon > Quit) or end every "electron.exe" task in Task Manager (PowerShell: Get-Process electron | Stop-Process -Force), then restart autopilot.`);
      return;
    }

    // §FIX 2026-07-24 — an INTENTIONAL stop is not a crash. Two statuses mean
    // "autopilot did this on purpose": 'stopping' (global shutdown) and
    // 'dormant' (idle reaper despawning an on-demand kernel).
    // The idle reaper's deliberate SIGTERM was previously counted as crash 1/6,
    // which triggered an immediate restart that raced the dying Electron's
    // single-instance lock → exit(1) → crash 2/6 … → CIRCUIT BREAKER TRIPPED.
    // The whole clear-glass restart storm came from despawn being misread as
    // failure. (§1.2 — the log said "despawning (on-demand)" and then
    // "crashes in window: 1/6" one line later; the system was lying to itself.)
    // §0.39.372 NC2 — a stop or restart the person asked for (POST /control/:name/:op) is intentional too: 'held' stays
    // down until started; 'restarting' comes straight back. Neither is a crash, neither counts toward the breaker.
    if (s.status === 'held' || s.status === 'restarting') {
      const again = s.status === 'restarting';
      _warpEmit(again ? 'autopilot.kernel.restart' : 'autopilot.kernel.held', { kernel: kernel.name, code, signal });
      _log(`${color}[${kernel.name}]${RESET} ${again ? 'restarting (asked for)' : 'stopped (asked for) — held until started'}`);
      if (again) { s.backoffMs = BACKOFF_BASE_MS; _spawnKernel(kernel, color); }
      return;
    }
    if (s.status === 'stopping' || s.status === 'dormant') {
      const wasIdleDespawn = s.status === 'dormant';
      _warpEmit(wasIdleDespawn ? 'autopilot.kernel.despawn' : 'autopilot.kernel.stop', { kernel: kernel.name, code, signal });
      s.status = wasIdleDespawn ? 'dormant' : 'stopped';
      _log(`${color}[${kernel.name}]${RESET} ${wasIdleDespawn
        ? 'despawned cleanly (idle, on-demand — will respawn on request)'
        : 'stopped cleanly (autopilot shutdown)'}`);
      return;
    }

    _warpEmit('autopilot.kernel.crash', { kernel: kernel.name, code, signal, crashesInWindow: s.crashes.length + 1 });
    s.crashes.push(Date.now());
    s.crashes = _prune(s.crashes);
    s.status = 'down';
    s.downSince = Date.now();

    _log(`${color}[${kernel.name}]${RESET} \x1b[31mexited\x1b[0m code=${code} signal=${signal} — crashes in window: ${s.crashes.length}/${CIRCUIT_MAX_CRASHES}`);

    if (s.crashes.length >= CIRCUIT_MAX_CRASHES) {
      s.status = 'circuit_open';
      _warpEmit('autopilot.circuit.open', { kernel: kernel.name, crashes: s.crashes.length });
      _log(`${color}[${kernel.name}]${RESET} \x1b[31m§CIRCUIT BREAKER TRIPPED\x1b[0m — ${s.crashes.length} crashes in ${Math.round(CIRCUIT_WINDOW_MS/60000)}min. ` +
           `Not auto-restarting. This needs a human or a forge patch, not another retry. Other kernels keep running.`);
      _writeCircuitGap(kernel.name, s);
      return;
    }

    // §FIX 2026-06-20: a port collision (EADDRINUSE) is almost always caused
    // by an orphaned process from a previous run still holding the port —
    // exponential backoff just burns 5 minutes restarting into the same wall.
    // Trip the breaker on the first sighting with a diagnosis a human can
    // actually act on, instead of waiting for CIRCUIT_MAX_CRASHES retries.
    if (s.sawAddrInUse) {
      s.status = 'circuit_open';
      _log(`${color}[${kernel.name}]${RESET} \x1b[31m§CIRCUIT BREAKER TRIPPED\x1b[0m — port already in use, likely an orphaned process from a ` +
           `previous run still bound to it. Retrying won't free someone else's port. Find and stop it, then restart autopilot. ` +
           `Windows: "Get-Process node | Stop-Process -Force" (kills ALL node processes) or "netstat -ano | findstr :<port>" → "taskkill /PID <pid> /F" for a single one.`);
      _writeCircuitGap(kernel.name, s);
      return;
    }

    s.restarts++;
    // §CRITICAL fix 2026-06-30 — minRestartDelay enforces a floor for
    // kernels whose OS-level process teardown lags the generic exponential
    // backoff (Electron on Windows, specifically — see clear-glass's kernel
    // definition above for the full trace). Math.max with backoffMs so the
    // floor only ever raises the delay, never shortens the normal
    // exponential curve once it's already past the floor.
    const delay = kernel.minRestartDelay ? Math.max(kernel.minRestartDelay, s.backoffMs) : s.backoffMs;
    s.backoffMs = Math.min(s.backoffMs * 2, BACKOFF_MAX_MS);
    _log(`${color}[${kernel.name}]${RESET} restarting in ${Math.round(delay/1000)}s (attempt ${s.restarts})`);
    setTimeout(() => _spawnKernel(kernel, color), delay).unref?.();
  });

  proc.on('error', err => {
    _log(`${color}[${kernel.name}]${RESET} \x1b[31mfailed to spawn:\x1b[0m ${err.message}`);
  });
}

// §AUTOPILOT-03: when a kernel's circuit breaker trips, write a real gap into
// cortex's own gaps table if cortex is reachable — so the self-healing
// pipeline we already wired (RAID/healer/escalation) at least gets a chance
// to see it and dispatch an agent-consult for a forge patch, even though the
// crashing process is one layer below what that pipeline normally watches.
function _writeCircuitGap(name, s) {
  try {
    const { jaaDB, uid } = require('../cortex/memory/jaa-db');
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'kernel_circuit_open', path: name, severity: 'critical',
      body: `Kernel "${name}" crashed ${s.crashes.length} times in ${Math.round(CIRCUIT_WINDOW_MS/60000)}min — ` +
            `autopilot stopped auto-restarting it. lastExit: ${JSON.stringify(s.lastExit)}`,
      status: 'open', source: 'autopilot', causedBy: null, createdAt: Date.now(), attempts: s.restarts, ts: Date.now(),
    });
  } catch(_) {
    // cortex/JAA unreachable (maybe cortex itself is the one that's down) —
    // the appended log file above is still the record of truth.
  }
}

// ── Status surface ────────────────────────────────────────────────────────────
// §BUILT 2026-08-18 — James, direct: "can you have the system log what
// system is causing memory pressure." Checked first: lib/resource-
// monitor.js's real classify() only ever sees system-WIDE free memory —
// confirmed by reading it, zero per-process attribution exists anywhere.
// Each system's own resource-monitor instance only monitors itself; only
// the supervisor (autopilot, here) has real visibility into every real
// child PID at once. This is the real fix: one batched OS query for
// every tracked PID, not N separate queries (which would mean N real
// process spawns every snapshot cycle — expensive and unnecessary).
// Cross-platform: Windows uses wmic (tasklist doesn't report RSS in a
// script-parseable way without extra flags), Unix uses ps.
function _getPerPidMemoryMB(pids) {
  if (!pids.length) return {};
  const { spawnSync } = require('child_process');
  const out = {};
  try {
    if (process.platform === 'win32') {
      const filter = pids.map(p => `ProcessId=${p}`).join(' or ');
      const r = spawnSync('wmic', ['process', 'where', `(${filter})`, 'get', 'ProcessId,WorkingSetSize', '/format:csv'], { encoding: 'utf8', timeout: 5000 });
      if (r.status === 0 && r.stdout) {
        for (const line of r.stdout.split('\n')) {
          const parts = line.trim().split(',');
          if (parts.length < 3) continue;
          const pid = parseInt(parts[1], 10);
          const ws = parseInt(parts[2], 10);
          if (pid && !isNaN(ws)) out[pid] = Math.round(ws / 1048576);
        }
      }
    } else {
      const r = spawnSync('ps', ['-o', 'pid=,rss=', '-p', pids.join(',')], { encoding: 'utf8', timeout: 5000 });
      if (r.status === 0 && r.stdout) {
        for (const line of r.stdout.trim().split('\n')) {
          const [pid, rss] = line.trim().split(/\s+/).map(Number);
          if (pid && !isNaN(rss)) out[pid] = Math.round(rss / 1024);
        }
      }
    }
  } catch (e) {
    console.warn(`[autopilot] per-pid memory query failed: ${e.message}`);
  }
  return out;
}

function _statusSnapshot() {
  const out = {};
  for (const [name, s] of Object.entries(_state)) {
    // §0.39.282 — each kernel's own address, read from its declared healthUrl, so a client (the tablet) resolves every
    // system through this ONE endpoint instead of carrying a port map of its own.
    const k = ALL_KERNELS.find(x => x.name === name);
    let port = null; try { if (k && k.healthUrl) port = Number(new URL(k.healthUrl).port) || null; } catch (_) {}
    out[name] = {
      status: s.status, restarts: s.restarts,
      crashesInWindow: s.crashes.length, lastExit: s.lastExit,
      downSince: s.downSince, pid: s.proc?.pid || null,
      healthUrl: (k && k.healthUrl) || null, port,
    };
  }
  return out;
}

// §BUILT 2026-08-17 — James: "point the pattern engine at the number of
// instances. performance wise." Checked first: cortex/intelligence's real
// pattern engine already reads ALL of event_log unconditionally (jaaDB.
// query('event_log', () => true, 500)) — no filter on event type. That
// means a new, real event type landing there gets included in the
// EXISTING co-occurrence/crystallization scan automatically. Zero changes
// needed to intelligence/index.js itself — reuse, not rebuild, same
// discipline as everything else this session.
//
// Real, honest scope: this logs real instance counts (per-system pid,
// restarts, crashes-in-window — already tracked by _statusSnapshot above,
// nothing new computed) plus real system-wide memory (os.freemem/
// totalmem, Node's own real numbers, not estimated). "Models, chat logs,
// ledgers, interaction contracts" are real, separate, larger asks, not
// attempted in this same pass.
const INSTANCE_SNAPSHOT_MS = 60_000; // matches intelligence's own PATTERN_SCAN_MS cadence, so fresh data exists by the time each scan runs

function _logInstanceSnapshot() {
  try {
    const { jaaDB, uid } = require('../cortex/memory/jaa-db');
    const os = require('os');
    const snapshot = _statusSnapshot();
    const running = Object.values(snapshot).filter(s => s.pid).length;
    const totalRestarts = Object.values(snapshot).reduce((sum, s) => sum + (s.restarts || 0), 0);

    // Real per-system memory attribution — the actual answer to "what
    // system is causing memory pressure," not just "memory is low."
    const pids = Object.values(snapshot).filter(s => s.pid).map(s => s.pid);
    const perPidMB = _getPerPidMemoryMB(pids);
    const perSystemMemMB = {};
    for (const [name, s] of Object.entries(snapshot)) {
      if (s.pid && perPidMB[s.pid] != null) perSystemMemMB[name] = perPidMB[s.pid];
    }
    const sortedByMem = Object.entries(perSystemMemMB).sort((a, b) => b[1] - a[1]);
    const topConsumer = sortedByMem[0] ? { system: sortedByMem[0][0], mb: sortedByMem[0][1] } : null;

    const freeMemPct = os.freemem() / os.totalmem();
    const row = jaaDB.insert('event_log', {
      uuid: uid(),
      type: 'autopilot.instance_snapshot',
      payload: {
        systemsRunning: running,
        systemsTotal: Object.keys(snapshot).length,
        totalRestarts,
        freeMemMB: Math.round(os.freemem() / 1048576),
        totalMemMB: Math.round(os.totalmem() / 1048576),
        freeMemPct: Math.round(freeMemPct * 100),
        perSystemMemMB,
        topConsumer,
        perSystem: snapshot,
      },
      source: 'autopilot', causedBy: null, ts: Date.now(),
    });

    // §1.2 — when pressure is real, say WHICH system, loud, not just that
    // memory is low. freeMemHaltPct/WarnPct match resource-monitor.js's
    // own real DEFAULT_THRESHOLDS (0.10 / 0.20) — same real bar, not a
    // separate, drifting one.
    if (freeMemPct < 0.20 && topConsumer) {
      console.warn(`[autopilot] memory pressure — free ${(freeMemPct * 100).toFixed(1)}% — top real consumer: ${topConsumer.system} (${topConsumer.mb}MB)`);
    }
    return row;
  } catch (e) {
    // §1.2 — a snapshot-logging failure never affects real supervision;
    // this is observability, not a load-bearing path.
    console.warn(`[autopilot] instance snapshot logging failed: ${e.message}`);
  }
}

// ── §WARP SPINE 2026-07-24 — James: "make sure you're always using warp."
// His own standing intent (lib/warp-bus.js header, 2026-07-09): "warp is
// the spine for each system, supposed to be." Autopilot had zero WARP —
// every spawn, despawn, crash, circuit-break, and now every tablet ledger
// read was invisible movement, the exact property behind every bug the
// tablet spec catalogs ("the system could not see itself doing it").
//
// This uses warp/core DIRECTLY (Stream + StreamLog + Axiom) rather than
// lib/warp-bus.js's WarpSpine adapter, deliberately: WarpSpine attaches to
// an existing nexus-bus, and autopilot has none — requiring the nexus-bus
// singleton here would pull its wired relay listeners into the supervisor
// (side effects a supervisor must not inherit, §5.12). warp/core is the
// actual primitive layer and imports nothing outside warp/ (its own
// decoupling rule). Axioms mirror defaultAxioms() from lib/warp-bus.js —
// same checks, same severities — so autopilot events are held to the same
// contract as bus events everywhere else. Advisory (hard axioms reject the
// event from the stream with a loud log, per warp's own semantics), never
// process-fatal: a supervisor that dies of its own telemetry is a worse
// failure than the one it was recording.
const { Stream }    = require('../warp/core/Stream.js');
const { StreamLog } = require('../warp/core/StreamLog.js');
const { Axiom }     = require('../warp/core/Axiom.js');

const _warpLog = new StreamLog('DATA');
const _warp = new Stream({
  log: _warpLog,
  axioms: [
    new Axiom('type-is-string', { check: e => typeof e.type === 'string' && e.type.length > 0, severity: 'hard' }),
    new Axiom('has-id',         { check: e => !!(e.uuid || e.id), severity: 'hard' }),
    new Axiom('has-ts',         { check: e => Number.isFinite(e.ts), severity: 'hard' }),
  ],
});
function _warpEmit(type, data) {
  // Event's constructor enforces its own contract loudly (throws on a bad
  // type) — that's correct at build time, but a telemetry emit must never
  // kill the supervisor at runtime, so contain here and report (§1.2).
  try { _warp.emit(new (require('../warp/core/Event.js').Event)(type, data)); }
  catch (e) { console.error(`[warp:autopilot] emit failed for '${type}': ${e.message}`); }
}

function _startStatusServer() {
  if (!STATUS_PORT) return;
  const server = http.createServer((req, res) => {
    if (req.url === '/status') {
      // §1.2 — a halted boot must be visible to any observer (the tablet
      // reads this), not only to whoever was watching the terminal.
      // §ledger-wire — the observability James asked for: co-pilot activity,
      // visible here. `blind` names every emitter never reached, so a quiet
      // system and an unobserved one are never confused for each other.
      let ledger = null;
      try {
        const lsse = require('../lib/ledger-sse');
        ledger = { ...lsse.health(), errorLog: require('../lib/error-log').health(),
                   recentEvents: _faninEvents.slice(-25) };
      } catch (e) { ledger = { ok: false, error: e.message }; }
      const body = JSON.stringify({ ok: true, kernels: _statusSnapshot(), boot: _bootResult, ledger, ts: Date.now() }, null, 2);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    // §BUILT 2026-07-15 — the real on-demand trigger surface. A caller
    // that needs an on-demand kernel (e.g. guardian's browser dispatch
    // needing clear-glass) hits this instead of assuming the process is
    // already up.
    const spawnMatch = req.url.match(/^\/spawn\/([a-zA-Z0-9-]+)$/);
    if (spawnMatch && req.method === 'POST') {
      requestSpawn(spawnMatch[1]).then(result => {
        res.writeHead(result.ok ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }
    // §0.39.372 NC2 — POST /control/:name/:op — restart | stop | start, asked for by a person (Idearium's system panel)
    const controlMatch = req.url.match(/^\/control\/([a-zA-Z0-9-]+)\/(restart|stop|start)$/);
    if (controlMatch && req.method === 'POST') {
      const r = controlKernel(controlMatch[1], controlMatch[2]);
      _warpEmit('autopilot.kernel.control', { kernel: controlMatch[1], op: controlMatch[2], ok: r.ok });
      res.writeHead(r.ok ? 200 : (r.code || 400), { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
      return;
    }
    const touchMatch = req.url.match(/^\/touch\/([a-zA-Z0-9-]+)$/);
    if (touchMatch && req.method === 'POST') {
      touchActivity(touchMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    // §TABLET T1 2026-07-24 — ledger explorer read surface
    // (docs/nexus-tablet.spec, phase T1: "browse system → hook → day →
    // events from the live tree with ZERO writes to NEXUS").
    //
    // Lives on autopilot deliberately, per the spec's connection law: "the
    // tablet talks to ONE endpoint. Autopilot resolves the rest" — and its
    // observation law: DISK-BACKED, not live-API-backed, so the explorer
    // still answers when the system whose ledger you're reading is wedged.
    // These routes do exactly three things and write NOTHING:
    //   GET /ledger                        → systems (top-level dirs)
    //   GET /ledger/:system                → hooks (subdirs) + loose .jsonl files
    //   GET /ledger/:system/:hook          → day files
    //   GET /ledger/:system/:hook/:day     → parsed events from that day
    // Every path segment is validated against a strict allowlist pattern —
    // no dots-as-traversal, no separators — so the surface cannot be walked
    // outside data/ledger/ (§4.3; lens 6: what does this assume I won't try).
    if (req.method === 'GET' && req.url.startsWith('/ledger')) {
      _warpEmit('autopilot.ledger.read', { path: req.url.split('?')[0] });
      _handleLedgerRead(req, res);
      return;
    }
    // §TABLET T2 2026-07-24 — container shell routes (docs/nexus-tablet.spec
    // phase T2: "one container per system: API map, DB tables, file tree,
    // live events, real test invocation. Read-only."). Same laws as T1:
    // one endpoint, disk-backed where possible, zero writes to NEXUS state.
    if (req.method === 'GET' && req.url.startsWith('/graph')) {
      _warpEmit('autopilot.graph.read', { path: req.url.split('?')[0] });
      _handleGraphRead(req, res);
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/contract-map/')) {
      _warpEmit('autopilot.container.contract', { path: req.url });
      _handleContractProxy(req, res);
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/tables')) {
      _warpEmit('autopilot.container.tables', { path: req.url.split('?')[0] });
      _handleTablesRead(req, res);
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/files/')) {
      _warpEmit('autopilot.container.files', { path: req.url });
      _handleFilesRead(req, res);
      return;
    }
    // Test invocation is the one POST in the container surface — it runs
    // THE REAL tests/modules/run-all.js with --filter, never a parallel
    // copy (the spec's own failure-mode list: separate per-container tests
    // are guaranteed two-truths drift). Executing tests reads and proves;
    // it does not mutate system state.
    if (req.method === 'POST' && req.url.startsWith('/run-tests/')) {
      _warpEmit('autopilot.container.tests', { path: req.url });
      _handleRunTests(req, res);
      return;
    }
    // §WARP SPINE — the map, generated from what actually ran (tail of the
    // StreamLog + live counters), readable by the tablet from the same
    // single endpoint as everything else.
    if (req.method === 'GET' && req.url.startsWith('/warp')) {
      const body = JSON.stringify({
        ok: true,
        events: _warp.eventCount,
        seq: _warp.seq,
        tail: _warp.tail(100),
        ts: Date.now(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(body);
      return;
    }
    res.writeHead(404); res.end('not found — try /status, POST /spawn/:name, POST /touch/:name, GET /ledger, GET /warp');
  });
  // §FIXED 2026-09-06 — James, from a real boot log: a second `npm run
  // start:all` (after the first was Ctrl+C'd but hadn't fully released
  // the port yet — common on Windows) hit EADDRINUSE here with zero
  // 'error' handler on the server, which is Node's own real behavior
  // for an unhandled EventEmitter error — crashes the entire process,
  // taking guardian/cortex/every real system down with it over a status
  // dashboard convenience endpoint. Real fix: this server is optional
  // infrastructure (the status page, the spawn/touch triggers) — a real
  // system boot (guardian, cortex, etc.) mattering far more than this
  // one endpoint being reachable. Degrades instead of crashing: logs a
  // clear, actionable warning and continues booting without it.
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      _log(`⚠ autopilot status server could not bind :${STATUS_PORT} — already in use (another autopilot instance may still be running, or didn't fully release the port yet on a fast restart). Continuing boot WITHOUT the status server — guardian/cortex/etc. are unaffected, but /status, /spawn/:name, and /touch/:name won't be reachable until this is resolved (check for a zombie node process holding the port).`);
      return;
    }
    _log(`⚠ autopilot status server error: ${e.message} — continuing boot without it`);
  });
  server.listen(STATUS_PORT, () => _log(`autopilot status: http://127.0.0.1:${STATUS_PORT}/status`));
}

// ── §TABLET T4 — connectome graph handler ──────────────────────────────────
// GET /graph → the real system connectome, entirely from DISK.
//
// What is REAL here, and where each part comes from:
//   nodes    systems that have published bus subscriptions (§B1,
//            lib/bus-subscriptions.js) plus every distinct event_log source —
//            union, so a system that emits but subscribes to nothing still
//            appears rather than silently vanishing from the map.
//   edges    CROSS-PROCESS consumer edges (§B1). Before B1 closed, these did
//            not exist: consumer counts came from one process's local
//            EventEmitter, so a brain view drawn then would have been, in the
//            spec's own words, "authoritative-looking and mostly wrong."
//   flow     recent real events from event_log, so movement shown is movement
//            that happened.
//   cfr      the live CFR field snapshot for colouring.
//
// What is deliberately ABSENT, per §1.2 rather than faked: per-request RAID
// envelope TRAILS. cortex/core/raid/router.js's own header states the design —
// "the envelope's trail + the event log together are the ledger" — i.e. the
// trail lives on the in-flight envelope object and only the routing EVENTS are
// persisted. There is no per-request trail store to read, so this endpoint
// reports routing activity from event_log and does NOT synthesise trails.
// Animating invented trails is exactly the confident-and-wrong failure the
// tablet spec warns about.
function _handleGraphRead(req, res) {
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const busSubs   = require('../lib/bus-subscriptions');

    const subs  = busSubs.all(jaaDB);
    const edgeR = busSubs.edges(jaaDB);

    // Producers from the real event log. Bounded — this is a live UI read,
    // not an analytics job.
    const limitRaw = new URL(req.url, 'http://x').searchParams.get('events');
    const evLimit  = Math.min(Math.max(parseInt(limitRaw || '300', 10) || 300, 1), 2000);
    let events = [];
    try { events = jaaDB.tail('event_log', evLimit) || []; } catch (_) { events = []; }

    const producerTypes = new Map(); // "source→type" edge weights
    const sources = new Set();
    for (const e of events) {
      const src = e.source || e.system;
      const type = e.type || e.action;
      if (!src || !type) continue;
      sources.add(src);
      const k = `${src}\u0000${type}`;
      producerTypes.set(k, (producerTypes.get(k) || 0) + 1);
    }

    // Nodes = union of subscription publishers and event_log sources.
    const nodeMap = new Map();
    for (const s of (subs.systems || [])) {
      nodeMap.set(s.systemId, {
        id: s.systemId, publishes: true, stale: s.stale,
        subscriptionTypes: s.types, listeners: s.totalListeners, emitted: 0,
      });
    }
    for (const src of sources) {
      if (!nodeMap.has(src)) {
        nodeMap.set(src, { id: src, publishes: false, stale: null, subscriptionTypes: 0, listeners: 0, emitted: 0 });
      }
    }
    for (const [k, n] of producerTypes) {
      const src = k.split('\u0000')[0];
      const node = nodeMap.get(src);
      if (node) node.emitted += n;
    }

    // Producer edges: source → event type, with the consuming systems attached
    // from B1's cross-process map. THIS is the join that makes an edge real —
    // a producer and a consumer of the same type, observed independently.
    const consumersByType = new Map((edgeR.edges || []).map(e => [e.type, e]));
    // A readable-but-empty subscription table is NOT the same fact as
    // "no system consumes anything." Distinguish them explicitly.
    const anyPublisher = !!(subs.observed && (subs.systems || []).length > 0);
    const flowEdges = [];
    for (const [k, weight] of producerTypes) {
      const [source, type] = k.split('\u0000');
      const c = consumersByType.get(type);
      flowEdges.push({
        source, type, weight,
        consumers: c ? c.systems.filter(s => !s.stale).map(s => s.systemId) : [],
        liveConsumerCount: anyPublisher ? (c ? c.live : 0) : null,
        // "Emitted into the void" is only a claim we can make when at least
        // one process has actually published its subscriptions. With no
        // publishers reporting, EVERY edge would otherwise read
        // unconsumed:true — which is not "nothing consumes this", it is "we
        // cannot see yet", and conflating those two is precisely the
        // confident-and-wrong failure B1 and this whole spec exist to
        // prevent. null means unknown; it is never coerced to a number.
        unconsumed: anyPublisher ? (!c || c.live === 0) : null,
      });
    }
    flowEdges.sort((a, b) => b.weight - a.weight);

    // §T4 REAL TRAILS 2026-07-24 — now persisted by cortex/core/raid/router.js
    // (they were in-memory only until this session, which is why the first cut
    // of this endpoint honestly refused to animate them). Read from the same
    // shared store, so they survive the process that produced them.
    let trails = [], trailsObserved = false;
    try {
      const t = jaaDB.tail('raid_trails', 60) || [];
      trails = t.map(r => ({
        envelopeId: r.envelopeId, intent: r.intent, from: r.from, target: r.target,
        status: r.status, terminal: r.terminal, hops: r.hops,
        elapsedMs: r.elapsedMs, lastTs: r.lastTs,
        // the hop sequence is what an animation walks
        path: (r.trail || []).map(h => ({ system: h.system, status: h.status, ts: h.ts })),
      }));
      trailsObserved = true;
    } catch (_) { trails = []; trailsObserved = false; }

    // §MOVEMENT 2026-07-24 (James: "No mock. Only real data, the
    // artifact/contract moving through the system, events, chunks").
    // Every array below is REAL rows from the live store — nothing
    // synthesised, nothing placeholder. Where a store is empty that is
    // reported as empty, never padded: an empty movement list means "none
    // observed", and the renderer must show stillness rather than invent
    // motion. Bounded because this is a live UI read.
    const movement = { artifacts: [], chunks: [], contracts: [], trailCount: 0 };
    try {
      movement.artifacts = (jaaDB.tail('guardian_artifacts', 40) || []).map(a => ({
        id: a.uuid || a.id, system: 'guardian', kind: a.type || a.kind || 'artifact',
        label: String(a.name || a.title || a.path || a.uuid || '').slice(0, 60),
        ts: a.ts || a.createdAt || null,
      }));
    } catch (_) {}
    try {
      movement.chunks = (jaaDB.tail('idearium_spec_chunks', 40) || []).map(c => ({
        id: c.uuid || c.id, system: 'idearium', kind: 'spec-chunk',
        label: String(c.specName || c.name || c.chunkId || c.uuid || '').slice(0, 60),
        ts: c.ts || c.createdAt || null,
      }));
    } catch (_) {}
    // Contracts genuinely in flight, read from the real input/output folders
    // rather than a table — that IS where a contract lives. Their addenda are
    // the journey the artifact accumulated (lib/contract-queue.js).
    try {
      const seen = new Set();
      for (const sysDir of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (!sysDir.isDirectory() || sysDir.name.startsWith('.') || sysDir.name === 'node_modules') continue;
        for (const box of ['input', 'output']) {
          const d = path.join(ROOT, sysDir.name, box);
          if (!fs.existsSync(d)) continue;
          for (const f of fs.readdirSync(d)) {
            if (!f.endsWith('.json') || movement.contracts.length >= 40) continue;
            try {
              const c = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
              if (!c || !c.uuid || seen.has(c.uuid)) continue;
              seen.add(c.uuid);
              movement.contracts.push({
                id: c.uuid, kind: 'contract', label: String(c.intent || '').slice(0, 60),
                from: c.fromSystem, to: c.toSystem, status: c.status,
                hops: Array.isArray(c.addenda) ? c.addenda.length : 0,
                // the real path this artifact travelled, system by system
                path: (c.addenda || []).map(a => ({ system: a.system, action: a.action, ts: a.ts })),
                ts: c.updatedAt || c.createdAt || null,
              });
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
    movement.trailCount = trails.length;

    // CFR for colouring — read from disk so it survives a wedged cortex.
    let cfr = null;
    try {
      const p = path.join(process.env.NEXUS_DATA_ROOT || path.join(ROOT, 'data'), 'guardian', 'ledger', 'cfr', 'cfr_state.json');
      if (fs.existsSync(p)) {
        cfr = JSON.parse(fs.readFileSync(p, 'utf8'));
        // cfr_state.json persists the four axes only — `regime` is DERIVED,
        // not stored (verified by reading the real file, after the first draft
        // assumed a regime field and got undefined). Derive it with the same
        // function the rest of NEXUS uses rather than reimplementing the
        // thresholds here, which would be a second truth (§10.3).
        if (cfr && cfr.regime === undefined) {
          try { cfr.regime = require('../intelligence/cfr/field').computeRegime(cfr); }
          catch (_) { cfr.regime = null; }
        }
      }
    } catch (_) { cfr = null; }

    return _ledgerJson(res, 200, {
      ok: true,
      nodes: [...nodeMap.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
      edges: flowEdges.slice(0, 400),
      consumerEdges: (edgeR.edges || []).slice(0, 200),
      trails,
      trailsObserved,
      movement,
      cfr,
      subscriptionsObserved: !!subs.observed,
      staleAfterMs: busSubs.STALE_MS,
      eventsSampled: events.length,
      // §1.2 — the map states its own limits inline, so a reader of the raw
      // API (not just the UI) cannot mistake absence for emptiness.
      notes: {
        raidTrails: trailsObserved
          ? (trails.length
              ? 'real persisted RAID envelope trails from raid_trails — every hop with real timestamps; nothing synthesised'
              : 'trail store readable but EMPTY — no route has been persisted yet (router.js writes on every stamp). Empty is not "routing does not happen"; it is "none observed yet".')
          : 'trail store UNREADABLE — trails absent, not zero',
        consumers: !subs.observed
          ? `UNREADABLE — ${subs.reason || 'store unavailable'}; consumer counts are absent, not zero`
          : anyPublisher
            ? 'cross-process, from lib/bus-subscriptions (§B1)'
            : 'store readable but NO system has published subscriptions yet (cortex/orchestrator publish on boot) — consumer counts are UNKNOWN (null), not zero',
      },
    });
  } catch (e) {
    return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
  }
}

// ── §TABLET T2 — container shell handlers ──────────────────────────────────

// Contract proxy: GET /contract-map/:system → that system's own GET /contract.
// The port comes from the kernel's OWN healthUrl — no second topology map to
// drift (§5.14: depend on the contract, not a hardcoded address).
function _handleContractProxy(req, res) {
  const name = req.url.split('?')[0].split('/')[2] || '';
  const kernel = (ALL_KERNELS || KERNELS).find(k => k.name === name && k.healthUrl);
  if (!kernel) return _ledgerJson(res, 404, { ok: false, error: `no kernel '${name}' with a health surface` });
  const u = new URL(kernel.healthUrl);
  const pr = http.get({ hostname: u.hostname, port: u.port, path: '/contract', timeout: 3000 }, (up) => {
    let d = '';
    up.on('data', c => d += c);
    up.on('end', () => {
      try { _ledgerJson(res, up.statusCode || 200, JSON.parse(d)); }
      catch { _ledgerJson(res, 502, { ok: false, error: `'${name}' /contract returned non-JSON`, raw: d.slice(0, 200) }); }
    });
  });
  pr.on('error', e => _ledgerJson(res, 503, { ok: false, error: `'${name}' unreachable: ${e.message}` }));
  pr.setTimeout(3000, () => { pr.destroy(); _ledgerJson(res, 504, { ok: false, error: `'${name}' /contract timeout` }); });
}

// JAA tables: GET /tables → every table + row count; GET /tables/:name →
// rows (?limit=N, default 100, max 1000). DISK-BACKED (observation law):
// reads the store's real .json files directly — answers even when every
// system holding the store in memory is wedged. Read-only by construction.
const JAA_STORE_DIR = path.join(ROOT, 'data', 'cortex', 'memory');
function _handleTablesRead(req, res) {
  const parts = req.url.split('?')[0].split('/').filter(Boolean).slice(1);
  if (parts.length > 1) return _ledgerJson(res, 400, { ok: false, error: 'at most /tables/:name' });
  if (parts.length === 1 && !_segSafe(parts[0])) return _ledgerJson(res, 400, { ok: false, error: 'invalid table name' });
  try {
    if (parts.length === 0) {
      const tables = fs.readdirSync(JAA_STORE_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const st = fs.statSync(path.join(JAA_STORE_DIR, f));
          let rows = null;
          try { const parsed = JSON.parse(fs.readFileSync(path.join(JAA_STORE_DIR, f), 'utf8')); rows = Array.isArray(parsed) ? parsed.length : null; }
          catch (_) { rows = -1; } // corrupt reported, not hidden (§1.2)
          return { name: f.replace(/\.json$/, ''), bytes: st.size, rows };
        })
        .sort((a, b) => a.name < b.name ? -1 : 1);
      return _ledgerJson(res, 200, { ok: true, dir: 'data/cortex/memory', tables });
    }
    const file = path.join(JAA_STORE_DIR, parts[0] + '.json');
    if (!path.resolve(file).startsWith(path.resolve(JAA_STORE_DIR))) return _ledgerJson(res, 400, { ok: false, error: 'path escapes store' });
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return _ledgerJson(res, 200, { ok: true, table: parts[0], rows: 1, shape: 'single-object', data: parsed });
    const limitRaw = new URL(req.url, 'http://x').searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitRaw || '100', 10) || 100, 1), 1000);
    return _ledgerJson(res, 200, { ok: true, table: parts[0], total: parsed.length, returned: Math.min(limit, parsed.length), rows: parsed.slice(-limit) });
  } catch (e) {
    if (e.code === 'ENOENT') return _ledgerJson(res, 404, { ok: false, error: `no such table: ${parts[0] || '(root)'}` });
    return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
  }
}

// File tree: GET /files/:system[/*] → data/<system> subtree listing (dirs +
// file names/sizes/mtimes, no contents — the ledger routes read contents
// where reading is the point). Same segment allowlist + containment as T1.
function _handleFilesRead(req, res) {
  const parts = req.url.split('?')[0].split('/').filter(Boolean).slice(1);
  if (!parts.length || parts.length > 6) return _ledgerJson(res, 400, { ok: false, error: '/files/:system[/subpath], max depth 6' });
  if (!parts.every(_segSafe)) return _ledgerJson(res, 400, { ok: false, error: 'invalid path segment' });
  const base = path.join(ROOT, 'data');
  const fsPath = path.join(base, ...parts);
  if (!path.resolve(fsPath).startsWith(path.resolve(base))) return _ledgerJson(res, 400, { ok: false, error: 'path escapes data root' });
  try {
    const entries = fs.readdirSync(fsPath, { withFileTypes: true });
    const dirs  = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const files = entries.filter(e => e.isFile()).map(e => {
      const st = fs.statSync(path.join(fsPath, e.name));
      return { name: e.name, bytes: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => a.name < b.name ? -1 : 1);
    return _ledgerJson(res, 200, { ok: true, path: parts.join('/'), dirs, files });
  } catch (e) {
    if (e.code === 'ENOENT') return _ledgerJson(res, 404, { ok: false, error: `not found: ${parts.join('/')}` });
    if (e.code === 'ENOTDIR') return _ledgerJson(res, 400, { ok: false, error: 'not a directory — this route lists, the ledger routes read' });
    return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
  }
}

// Real test invocation: POST /run-tests/:system spawns THE REAL runner with
// --filter=<system>. Returns the tail of output + pass/fail on completion.
// One run at a time (overlapping runs corrupt each other's timing-sensitive
// suites on one machine).
let _testRunActive = false;
// §BUILT 2026-09-06 — James: "i feel system should have tests each boot
// to make sure the vitals parts function." Real, existing infrastructure
// reused, not duplicated: _handleRunTests below already spawns a real
// test process on demand (HTTP-triggered, tests/modules/run-all.js).
// This is that same real spawn-and-parse discipline, applied
// automatically once boot genuinely completes (wired into the one real
// place that already knows: _bootPhases()'s own .then(), only when boot
// did NOT halt) — never blocks or fails the boot itself if a vital
// regresses; it surfaces it loudly instead, which is the actual point
// (a silent regression is what caused every "keeps getting broken"
// complaint this session traced back to a merge). Runs
// tests/verify-ncp-agents.js specifically — the already-curated,
// already-fast set of 8 real NCP/agent fixes (not the full test suite,
// which would meaningfully delay every single boot for tests unrelated
// to whether the system can actually dispatch to an agent).
const VITALS_TIMEOUT_MS = 180000;
function _runVitalsCheck() {
  const { spawn } = require('child_process');
  const vitalsFile = path.join(ROOT, 'tests', 'verify-ncp-agents.js');
  if (!fs.existsSync(vitalsFile)) {
    _log('⚠ vitals check skipped — tests/verify-ncp-agents.js not found (moved or renamed?)');
    return;
  }
  _log('running post-boot vitals check (tests/verify-ncp-agents.js — 8 real NCP/agent fixes)...');
  // §SANDBOX 2026-09-25 — this runs on every boot, from the LIVE tree, while
  // the live system is up. Its suites get a throwaway data root so a check
  // can never leave anything in idearium, cortex memory or COMPARTMENT OS.
  const sb = require('../lib/test-sandbox.js').childEnv();
  const proc = spawn(process.execPath, [vitalsFile], { cwd: ROOT, env: sb.env });
  proc.on('close', sb.cleanup);
  let out = '';
  const cap = (c) => { out += c.toString(); };
  proc.stdout.on('data', cap); proc.stderr.on('data', cap);
  // §FIX 2026-09-25 — was 30000ms for the WHOLE check, while the check runs
  // 9 suites with up to 30s each. On James's machine (boot log 2026-09-25)
  // it was killed mid-run every boot: "✗ VITALS CHECK FAILED — (no summary
  // line captured)" — a failure report about the timer, not about any fix.
  const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, VITALS_TIMEOUT_MS);
  proc.on('exit', (code) => {
    clearTimeout(timer);
    const summaryLine = out.split('\n').find(l => l.includes('REAL FIXES VERIFIED') || l.includes('have REGRESSED')) || '(no summary line captured)';
    if (code === 0) {
      _log(`✓ vitals check passed — ${summaryLine}`);
    } else {
      // §1.2 — a silent regression is exactly the failure mode this
      // whole check exists to catch. Loud on purpose: not just a log
      // line, a real warp event too, so it shows up in /status, not
      // only in whoever's terminal happens to be watching right now.
      _log(`✗ VITALS CHECK FAILED — ${summaryLine}\n${out.split('\n').filter(l => l.includes('->')).join('\n')}`);
    }
    _warpEmit('autopilot.vitals.checked', { ok: code === 0, code, summary: summaryLine });
  });
  proc.on('error', (e) => {
    clearTimeout(timer);
    _log(`⚠ vitals check could not run: ${e.message}`);
  });
}

function _handleRunTests(req, res) {
  const name = req.url.split('?')[0].split('/')[2] || '';
  if (!_segSafe(name)) return _ledgerJson(res, 400, { ok: false, error: 'invalid system name' });
  // §RECURSION GUARD 2026-07-24 — refuse to spawn a test runner from
  // inside a test runner. Found the hard way: a suite that POSTs here
  // with a filter matching ITSELF makes the spawned runner re-run that
  // suite, which spawns another runner, forever. _testRunActive can't
  // catch it (each nested run is a fresh process with its own state), so
  // the guard has to ride in the environment. Depth is bounded at 1: the
  // tablet's own invocation is depth 0, anything it spawns is depth 1 and
  // may not spawn further.
  if (process.env.NEXUS_TEST_RUN_DEPTH) {
    return _ledgerJson(res, 409, { ok: false, error: 'refusing to spawn a test run from inside a test run (recursion guard)' });
  }
  if (_testRunActive) return _ledgerJson(res, 409, { ok: false, error: 'a test run is already active — one at a time' });
  _testRunActive = true;
  const { spawn } = require('child_process');
  // §SANDBOX 2026-09-25 — run-all gives each suite its own root; this marks
  // the runner itself as a test process too.
  const sb = require('../lib/test-sandbox.js').childEnv({ ...process.env, NEXUS_TEST_RUN_DEPTH: '1' });
  const proc = spawn(process.execPath, [path.join(ROOT, 'tests', 'modules', 'run-all.js'), `--filter=${name}`], {
    cwd: ROOT,
    env: sb.env,
  });
  proc.on('close', sb.cleanup);
  let out = '';
  const cap = (c) => { out += c.toString(); if (out.length > 60000) out = out.slice(-60000); };
  proc.stdout.on('data', cap); proc.stderr.on('data', cap);
  const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 180000);
  proc.on('exit', (code) => {
    clearTimeout(timer);
    _testRunActive = false;
    const totalMatch = out.match(/TOTAL:\s+(\d+) passed\s+(\d+) failed/);
    _warpEmit('autopilot.container.tests.done', { system: name, code, passed: totalMatch ? +totalMatch[1] : null, failed: totalMatch ? +totalMatch[2] : null });
    _ledgerJson(res, 200, {
      ok: code === 0, exitCode: code,
      passed: totalMatch ? +totalMatch[1] : null,
      failed: totalMatch ? +totalMatch[2] : null,
      tail: out.split('\n').slice(-40).join('\n'),
    });
  });
}

// ── §TABLET T1 — ledger explorer read handlers ─────────────────────────────
const LEDGER_ROOT = path.join(ROOT, 'data', 'ledger');
// One segment: letters, digits, dot, dash, underscore. A single leading dot
// or any '..' is rejected outright — '.' only ever appears INSIDE hook names
// (cortex.gaps.list) and day names (2026-07-24.jsonl), never leading.
const SEG_OK = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/;
const _segSafe = (s) => typeof s === 'string' && s.length <= 128 && SEG_OK.test(s) && !s.includes('..');

function _ledgerJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function _handleLedgerRead(req, res) {
  const parts = req.url.split('?')[0].split('/').filter(Boolean).slice(1); // drop 'ledger'
  if (parts.length > 3) return _ledgerJson(res, 400, { ok: false, error: 'at most /ledger/:system/:hook/:day' });
  if (!parts.every(_segSafe)) return _ledgerJson(res, 400, { ok: false, error: 'invalid path segment' });

  const fsPath = path.join(LEDGER_ROOT, ...parts);
  // Belt-and-braces on top of segment validation: the resolved path must
  // still be inside the ledger root. Never trust one check alone (§4.3).
  if (!path.resolve(fsPath).startsWith(path.resolve(LEDGER_ROOT))) {
    return _ledgerJson(res, 400, { ok: false, error: 'path escapes ledger root' });
  }

  try {
    if (parts.length === 3 || (parts.length >= 1 && fsPath.endsWith('.jsonl'))) {
      // Leaf: a day file (or a loose top-level .jsonl like orchestrator.jsonl).
      // Parse per-line; corrupt lines are REPORTED, not silently dropped (§1.2).
      const raw = fs.readFileSync(fsPath.endsWith('.jsonl') ? fsPath : fsPath + '.jsonl', 'utf8');
      const events = []; let corrupt = 0;
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try { events.push(JSON.parse(line)); } catch (_) { corrupt++; }
      }
      // Bounded response: ?limit=N (default 500, max 5000), newest last.
      const limitRaw = new URL(req.url, 'http://x').searchParams.get('limit');
      const limit = Math.min(Math.max(parseInt(limitRaw || '500', 10) || 500, 1), 5000);
      const slice = events.length > limit ? events.slice(-limit) : events;
      return _ledgerJson(res, 200, {
        ok: true, path: parts.join('/'), total: events.length,
        returned: slice.length, corruptLines: corrupt, events: slice,
      });
    }

    // Directory listing: systems, hooks, or day files.
    const entries = fs.readdirSync(fsPath, { withFileTypes: true });
    const dirs  = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.jsonl'))
      .map(e => { const st = fs.statSync(path.join(fsPath, e.name)); return { name: e.name, bytes: st.size, mtime: st.mtimeMs }; })
      .sort((a, b) => a.name < b.name ? -1 : 1);
    return _ledgerJson(res, 200, { ok: true, path: parts.join('/') || '(root)', dirs, files });
  } catch (e) {
    if (e.code === 'ENOENT') return _ledgerJson(res, 404, { ok: false, error: `not found: ${parts.join('/')}` });
    return _ledgerJson(res, 500, { ok: false, error: `${e.code || ''} ${e.message}` });
  }
}

// ── On-demand: spawn-request, health-gate, idle-despawn ────────────────────
// §BUILT 2026-07-15 — "cos as a kind of PID service, only running what's
// needed." Reuses _spawnKernel exactly as-is (same memory-safety checks,
// same Windows path quoting, same heap limits — no second, divergent
// spawn implementation) and adds the one real thing that was missing:
// gating readiness on an actual health check instead of a fixed timer,
// and tearing a process down again once nothing needs it.

let _jaaDB = null;
function _getJaaDB() {
  if (_jaaDB) return _jaaDB;
  try { ({ jaaDB: _jaaDB } = require('../cortex/memory/jaa-db.js')); }
  catch (e) { console.warn(`[autopilot] jaaDB unavailable — on-demand events will log to console only: ${e.message}`); _jaaDB = false; }
  return _jaaDB;
}

// §THE EVENT-TRACKING PIECE — "all the events are supposed to be tracked,
// using the meta system." Every real spawn/gate/despawn transition below
// writes a real event_log row with a causedBy chain (request -> spawn ->
// gate result), the same shape intelligence/cfr/graph.js's CausalGraph already
// ingests everywhere else in this codebase — not a new, parallel logging
// path, the same one.
function _logOnDemandEvent(type, payload, causedBy) {
  const db = _getJaaDB();
  const uuid = require('crypto').randomUUID();
  if (db) {
    try { db.insert('event_log', { uuid, type, ts: Date.now(), causedBy: causedBy || undefined, ...payload }); }
    catch (e) { console.warn(`[autopilot] could not log ${type}: ${e.message}`); }
  }
  return uuid;
}

function _pollHealth(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.request(url, { timeout: 3000 }, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) { resolve(true); return; }
          // Non-2xx while booting means "not ready yet", not "failed" —
          // retry until the timeout, same as a connection error. The old
          // behavior resolved false on the FIRST 503 and never retried.
          if (Date.now() - started > timeoutMs) { resolve(false); return; }
          setTimeout(tick, 500);
        });
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) { resolve(false); return; }
        setTimeout(tick, 500);
      });
      req.on('timeout', () => { req.destroy(); if (Date.now() - started > timeoutMs) resolve(false); else setTimeout(tick, 500); });
      req.end();
    };
    tick();
  });
}

/**
 * requestSpawn(name) — the real on-demand entry point. Idempotent: a
 * kernel that's already running (or already spawning) resolves
 * immediately once healthy, rather than double-spawning.
 * Returns { ok, alreadyRunning?, error? }.
 */
/**
 * controlKernel(name, op) — §0.39.372 NC2: the person's controls over one system, through its supervisor (never the
 * system itself). op: 'restart' (stop, then straight back), 'stop' (held down until started), 'start' (from held,
 * stopped, dormant, down — or a tripped breaker, which a person resetting is exactly what it waits for).
 */
function controlKernel(name, op) {
  const kernel = KERNELS.find(k => k.name === name);
  const s = _state[name];
  if (!kernel || !s) return { ok: false, code: 404, error: `no such system: ${name}` };
  const color = COLORS[KERNELS.indexOf(kernel) % COLORS.length];
  const alive = !!(s.proc && s.proc.exitCode === null && !s.proc.killed);
  if (op === 'stop' || op === 'restart') {
    if (!alive) {
      if (op === 'stop') { s.status = 'held'; return { ok: true, status: s.status, note: 'it was not running — held' }; }
      s.crashes = []; s.backoffMs = BACKOFF_BASE_MS; _spawnKernel(kernel, color); s.status = 'starting';
      return { ok: true, status: s.status, note: 'it was not running — started' };
    }
    s.status = op === 'stop' ? 'held' : 'restarting';
    try { s.proc.kill('SIGTERM'); } catch (e) { return { ok: false, code: 500, error: e.message }; }
    return { ok: true, status: s.status };
  }
  if (op === 'start') {
    if (alive) return { ok: true, status: s.status, alreadyRunning: true };
    if (!_resourceMonitor.spawnSafe()) return { ok: false, code: 503, error: 'not started — memory is critical; starting it now would schedule the crash' };
    s.crashes = []; s.backoffMs = BACKOFF_BASE_MS; _spawnKernel(kernel, color); s.status = 'starting';
    return { ok: true, status: s.status };
  }
  return { ok: false, code: 400, error: 'op must be restart, stop or start' };
}

async function requestSpawn(name) {
  const kernel = KERNELS.find(k => k.name === name);
  if (!kernel) return { ok: false, error: `no such kernel: ${name}` };
  if (!kernel.onDemand) return { ok: false, error: `${name} is not an on-demand kernel — it's already always-on` };

  const s = _state[name];
  s.lastActivity = Date.now();
  // §FIX 2026-07-20 — guard was `running`/`stable` only. A clear-glass caught
  // mid-lifecycle is `starting` (spawn in flight) or `online` (alive but not
  // yet marked stable). A second requestSpawn in either state launched a
  // SECOND Electron, and the two raced requestSingleInstanceLock() — the exact
  // two-genuine-instances crash in the 2026-07-20 log (distinct from the
  // lock-RELEASE race minRestartDelay already handles). Any state where a
  // process exists or is being launched must short-circuit, not re-spawn.
  const ALIVE_OR_SPAWNING = new Set(['starting', 'online', 'running', 'stable']);
  if (ALIVE_OR_SPAWNING.has(s.status)) {
    return { ok: true, alreadyRunning: true, state: s.status };
  }

  const requestEvt = _logOnDemandEvent('autopilot.spawn.requested', { kernel: name });
  const idx = KERNELS.indexOf(kernel);
  _spawnKernel(kernel, COLORS[idx % COLORS.length]);
  s.status = 'starting';

  if (!kernel.healthUrl) {
    // No real health check configured — honest: can't gate on something
    // that doesn't exist. Treat as spawned, not verified.
    _logOnDemandEvent('autopilot.spawn.unverified', { kernel: name, reason: 'no healthUrl configured' }, requestEvt);
    return { ok: true, verified: false };
  }

  const healthy = await _pollHealth(kernel.healthUrl, kernel.spawnTimeoutMs || 30000);
  if (!healthy) {
    _logOnDemandEvent('autopilot.spawn.gate_failed', { kernel: name, healthUrl: kernel.healthUrl }, requestEvt);
    return { ok: false, error: `${name} spawned but never became healthy at ${kernel.healthUrl}` };
  }
  s.status = 'stable';
  _logOnDemandEvent('autopilot.spawn.gate_passed', { kernel: name }, requestEvt);
  return { ok: true, verified: true };
}

function _startIdleReaper() {
  const onDemandKernels = KERNELS.filter(k => k.onDemand);
  if (onDemandKernels.length === 0) return;
  const timer = setInterval(() => {
    for (const kernel of onDemandKernels) {
      const s = _state[kernel.name];
      if (!s || s.status !== 'stable' || !s.proc) continue;
      const idleMs = Date.now() - (s.lastActivity || 0);
      if (idleMs > (kernel.idleTimeoutMs || Infinity)) {
        _log(`[${kernel.name}] idle for ${Math.round(idleMs / 1000)}s — despawning (on-demand)`);
        _logOnDemandEvent('autopilot.despawn.idle', { kernel: kernel.name, idleMs });
        // §FIX 2026-07-24 — set status BEFORE kill(). The exit handler reads
        // s.status to decide crash-vs-intentional; if kill() fires the exit
        // callback before this assignment lands, the despawn is misread as a
        // crash and the restart storm begins.
        s.status = 'dormant';
        try { s.proc.kill('SIGTERM'); } catch (_) {}
      }
    }
  }, 30000);
  timer.unref();
}

/** touchActivity(name) — any real caller can mark a kernel as "still in
 * use" without going through requestSpawn again, resetting the idle
 * clock. */
function touchActivity(name) {
  if (_state[name]) _state[name].lastActivity = Date.now();
}

// ── Phased boot ───────────────────────────────────────────────────────────────

/**
 * _phasePlan(kernels) — pure (§14.2): groups always-on kernels by phase,
 * ascending. Kernels with no phase declared land in a final catch-all phase
 * rather than being silently skipped (§1.2). onDemand kernels are excluded —
 * they have their own gated entry point (requestSpawn).
 */
function _phasePlan(kernels) {
  const active = kernels.filter(k => !k.onDemand);
  const declared = active.filter(k => Number.isFinite(k.phase));
  const undeclared = active.filter(k => !Number.isFinite(k.phase));
  const byPhase = new Map();
  for (const k of declared) {
    if (!byPhase.has(k.phase)) byPhase.set(k.phase, []);
    byPhase.get(k.phase).push(k);
  }
  const plan = [...byPhase.entries()].sort(([a], [b]) => a - b).map(([phase, list]) => ({ phase, kernels: list }));
  if (undeclared.length) {
    const last = (plan.length ? plan[plan.length - 1].phase : 0) + 1;
    plan.push({ phase: last, kernels: undeclared, undeclared: true });
  }
  return plan;
}

const PHASE_GATE_TIMEOUT_MS = 30000;

async function _bootPhases() {
  const plan = _phasePlan(KERNELS);
  for (const { phase, kernels, undeclared } of plan) {
    _log(`── boot phase ${phase} — ${kernels.map(k => k.name).join(', ')}${undeclared ? ' (no phase declared — booted last, loudly)' : ''}`);
    for (const kernel of kernels) {
      const idx = KERNELS.indexOf(kernel);
      _spawnKernel(kernel, COLORS[idx % COLORS.length]);
    }
    // Gate: every kernel in this phase must pass its real /health check
    // before the next phase begins. A kernel with no healthUrl (emerge —
    // no HTTP server exists to ask) is spawned-not-verified, stated as such.
    // A gate timeout is LOUD and boot continues — the old behavior was
    // full parallelism, so proceeding past a slow system is never worse
    // than what every previous boot already did (§1.2: no silent deadlock,
    // no silent skip).
    const results = await Promise.all(kernels.map(async (kernel) => {
      if (!kernel.healthUrl) {
        _log(`[${kernel.name}] phase ${phase} — no healthUrl (no HTTP surface) — spawned, not verified`);
        return { kernel, gated: false, healthy: null };
      }
      const healthy = await _pollHealth(kernel.healthUrl, kernel.spawnTimeoutMs || PHASE_GATE_TIMEOUT_MS);
      if (healthy) {
        _log(`[${kernel.name}] phase ${phase} gate passed — ${kernel.healthUrl}`);
        _warpEmit('autopilot.phase.gate_passed', { kernel: kernel.name, phase });
      } else {
        const secs = (kernel.spawnTimeoutMs || PHASE_GATE_TIMEOUT_MS) / 1000;
        _log(`[${kernel.name}] ⚠ phase ${phase} gate STALLED after ${secs}s — ${kernel.healthUrl} never answered ok`);
        _warpEmit('autopilot.phase.gate_stalled', { kernel: kernel.name, phase, optional: !!kernel.optional });
      }
      return { kernel, gated: true, healthy };
    }));

    // §BOOT DISCIPLINE 2026-07-24 (James: "stopping on faults, running the
    // diagnostic tool each time it stalls").
    //
    // Previous behavior: a stalled gate logged a warning and boot marched on.
    // That was defensible when this replaced full parallelism — proceeding was
    // never worse than what came before — but it means a broken foundation
    // silently carries every later phase on top of it, which is the exact
    // "authoritative-looking and mostly wrong" shape the rest of this session
    // has been removing.
    //
    // Now: a stall runs the real diagnostic tool (cli/diagnose.js — the same
    // one a human would run, never a parallel reimplementation, §16.4), and a
    // stalled REQUIRED kernel HALTS the boot sequence.
    //
    // optional:true kernels (ollama-bridge, copilot, emerge, loom) explicitly
    // do NOT halt: they are declared optional precisely because NEXUS is
    // useful without them, and halting on one would make the boot stricter
    // than the architecture actually is.
    //
    // Already-spawned kernels are deliberately LEFT RUNNING on a halt. They
    // are healthy, they are under supervision, and killing working systems to
    // punish a broken sibling would turn one fault into an outage. What stops
    // is the sequence — no NEW phase is started on a broken foundation.
    const stalled = results.filter(r => r.gated && r.healthy === false);
    if (stalled.length) {
      for (const { kernel } of stalled) await _runDiagnosticOnStall(kernel, phase);
      const blocking = stalled.filter(r => !r.kernel.optional).map(r => r.kernel.name);
      if (blocking.length) {
        _log(`── ✖ BOOT HALTED at phase ${phase} — required kernel(s) never became healthy: ${blocking.join(', ')}`);
        _log(`   Phases after ${phase} were NOT started (${plan.length - phase} remaining). Already-healthy kernels keep running under supervision; supervisor backoff/restart still applies to the failed one.`);
        _log(`   Diagnostic output for each stalled kernel is above. Fix the cause, then restart autopilot.`);
        _warpEmit('autopilot.boot.halted', { phase, blocking, phasesSkipped: plan.length - phase });
        return { halted: true, phase, blocking };
      }
      _log(`   (stalled kernel(s) ${stalled.map(r => r.kernel.name).join(', ')} are optional:true — boot continues, as declared)`);
    }
  }
  _log(`── boot sequence complete — ${plan.length} phase(s)`);
  _warpEmit('autopilot.boot.complete', { phases: plan.length });
  return { halted: false, phases: plan.length };
}

// Run the REAL diagnostic tool on a stall. Never a reimplementation: this is
// cli/diagnose.js, the same command a human runs, so its output means the same
// thing here as it does in a terminal (§16.4, and §10.3 — a second diagnostic
// would be a second truth about system health).
//
// Bounded and contained: 25s cap, output tailed, and any failure to run the
// diagnostic is itself reported rather than masking the original stall. A
// diagnostic that hangs must not become the reason boot never finishes.
let _bootResult = null;   // surfaced on /status so a halt is visible, not just logged
const DIAGNOSTIC_TIMEOUT_MS = 25000;
function _runDiagnosticOnStall(kernel, phase) {
  return new Promise((resolve) => {
    _log(`   ↳ running diagnostic for stalled '${kernel.name}' (phase ${phase}) — cli/diagnose.js ${kernel.name}`);
    _warpEmit('autopilot.diagnostic.run', { kernel: kernel.name, phase });
    let proc;
    try {
      const { spawn } = require('child_process');
      proc = spawn(process.execPath, [path.join(ROOT, 'cli', 'diagnose.js'), kernel.name], { cwd: ROOT });
    } catch (e) {
      _log(`   ↳ diagnostic could not start: ${e.message} — original stall of '${kernel.name}' stands unexplained`);
      return resolve();
    }
    let out = '';
    const cap = (c) => { out += c.toString(); if (out.length > 40000) out = out.slice(-40000); };
    proc.stdout.on('data', cap);
    proc.stderr.on('data', cap);
    const timer = setTimeout(() => {
      _log(`   ↳ diagnostic for '${kernel.name}' exceeded ${DIAGNOSTIC_TIMEOUT_MS / 1000}s — killed. Partial output below.`);
      try { proc.kill('SIGKILL'); } catch (_) {}
    }, DIAGNOSTIC_TIMEOUT_MS);
    proc.on('error', (e) => {
      clearTimeout(timer);
      _log(`   ↳ diagnostic failed to run for '${kernel.name}': ${e.message}`);
      resolve();
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      const tail = out.split('\n').filter(Boolean).slice(-25);
      if (tail.length) {
        _log(`   ↳ diagnostic for '${kernel.name}' (exit ${code}) —`);
        for (const line of tail) _log(`      ${line}`);
      } else {
        _log(`   ↳ diagnostic for '${kernel.name}' produced no output (exit ${code})`);
      }
      _warpEmit('autopilot.diagnostic.done', { kernel: kernel.name, phase, exitCode: code, lines: tail.length });
      resolve();
    });
  });
}

// §WIRED 2026-08-22 — James: "a lot of the intelligence system is
// missing from the autopilot... also wired in." Real root cause, found
// by reading loom/bootstrap.js directly: it's the one real process that
// reads all the hand-authored loom/maps/*.js files (including every
// component registered across this whole session) and writes them into
// loom/data/registry.json — the actual, disk-backed store intelligence's
// own _syncLoomMap() reads via lib/loom-map.js. Nothing in the real,
// automatic boot sequence ever ran it; confirmed directly by grepping
// loom/server.js for any reference to bootstrap.js and finding none.
// Running it live confirmed the real fix: 1538 components, 1305 hooks,
// 1264 wires, 63 of them intelligence-specific — all real, all
// previously invisible to a live boot.
//
// §CORRECTED before shipping, based on real measurement, not a guess:
// first draft ran this synchronously (spawnSync) before boot even
// started. Directly timed the real process: 221s (3.7 min). Making
// EVERY boot wait 4 minutes for this is a real regression, not an
// acceptable fix — so this runs in the BACKGROUND instead (spawn, not
// spawnSync), non-blocking. Boot proceeds immediately; the registry
// catches up on its own within a sync cycle or two, since
// intelligence's own _syncLoomMap already re-reads it every ~2 minutes
// (confirmed in James's real boot logs) — the same real mechanism that
// currently reports "0 systems" will correctly report the real counts
// once this background run finishes, with zero added boot latency.
function _refreshLoomRegistry() {
  const { spawn } = require('child_process');
  _log('refreshing loom/data/registry.json in the background (real runtime ~4 min; boot does not wait for this) ...');
  try {
    const child = spawn('node', ['loom/bootstrap.js'], { cwd: ROOT, stdio: 'ignore', detached: true });
    child.unref();
    child.on('error', (e) => _log(`  ⚠ loom registry background refresh failed to start: ${e.message} — run "node loom/bootstrap.js" manually if intelligence's loom-map sync keeps reporting 0`));
  } catch (e) {
    _log(`  ⚠ loom registry background refresh failed to start: ${e.message}`);
  }
}

function start() {
  _refreshLoomRegistry();
  _log(`autopilot starting — supervising: ${KERNELS.map(k => k.name).join(', ')}`);
  KERNELS.forEach((kernel, i) => {
    _initState(kernel.name);
    // §BUILT 2026-07-15 — on-demand kernels stay dormant at boot. Real,
    // not a stub: _requestSpawn (below) is the only path that starts
    // them, gated on a real health check, same discipline as everything
    // else this session has been about — no shortcut around the gate.
    if (kernel.onDemand) {
      _log(`${COLORS[i % COLORS.length]}[${kernel.name}]${RESET} on-demand — staying dormant until requested`);
      _state[kernel.name].status = 'dormant';
    }
  });
  _bootPhases()
    .then(r => {
      _bootResult = r;
      if (!r.halted) _runVitalsCheck();
    })
    .catch(e => {
      _bootResult = { halted: true, error: e.message };
      _log(`⚠ phased boot error: ${e.message} — kernels already spawned keep running under supervision`);
    });
  _startStatusServer();
  _logInstanceSnapshot(); // real, first snapshot immediately, not just 60s from now
  const _instanceSnapshotTimer = setInterval(_logInstanceSnapshot, INSTANCE_SNAPSHOT_MS);
  if (_instanceSnapshotTimer.unref) _instanceSnapshotTimer.unref(); // never keeps the process alive on its own
  _startIdleReaper();
}

// ── Graceful shutdown — kill children once, don't let exit handlers restart them ─
function _shutdown(signal) {
  _log(`autopilot received ${signal} — stopping all kernels`);
  for (const s of Object.values(_state)) {
    s.status = 'stopping';
    if (s.proc) { try { s.proc.kill('SIGTERM'); } catch(_) {} }
  }
  setTimeout(() => process.exit(0), 2000);
}
process.on('SIGINT',  () => _shutdown('SIGINT'));
process.on('SIGTERM', () => _shutdown('SIGTERM'));

if (require.main === module) start();

// §2026-08-08 — --cli: after boot, launch the interactive CLI interface with a
// help menu, routing to the co-pilot additions (capabilities, awareness, self-
// model, grammar). Gated to real boot (require.main), never during a probe.
if (require.main === module && CLI_MODE && !statusArg) {
  // give the boot a moment to bring systems up, then open the CLI.
  setTimeout(() => {
    try { require('../lib/nexus-cli-interface').start({ onClose: () => {} }); }
    catch (e) { console.error(`[autopilot] --cli interface failed to start: ${e.message}`); }
  }, 3000);
}

module.exports = { start, _statusSnapshot, KERNELS, requestSpawn, controlKernel, touchActivity, _state, _spawnKernel, _phasePlan, _pollHealth, ALL_KERNELS, _startStatusServer, _handleLedgerRead, _handleContractProxy, _handleTablesRead, _handleFilesRead, _handleRunTests, _handleGraphRead, _bootPhases, _runDiagnosticOnStall, _runVitalsCheck, _getBootResult: () => _bootResult, _logInstanceSnapshot };
