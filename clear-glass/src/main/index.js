'use strict';
/**
 * src/main/index.js — Clear Glass v3 SISO-native boot
 * UUID: cg-main-v3-0000-0000-000000000006
 * Version: 3.1.0 — NEXUS protocol fix
 *
 * Boot order (law — §3.1 bottom-up only):
 *   0. SISO bus created
 *   1. TLS proxy
 *   2. Fingerprint engine
 *   3. Cookie vault
 *   4. Context manager
 *   5. DOM archaeology
 *   6. ClearDriver
 *   7. URL listener
 *   8. API settings
 *   9. Co-pilot
 *  10. Agent mesh
 *  11. Diagnostic engine
 *  12. Gates registered on bus
 *  13. SSE server (subscribes to bus)
 *  14. NEXUS registration — POST /api/register to orchestrator :9000
 *  15. IPC bridge
 *  16. Active NEXUS probe — probes orchestrator + cortex + guardian
 *  17. Heartbeat — POST /api/heartbeat to orchestrator every 10s
 *  18. Tray
 *  19. Default window
 *  20. lifecycle.ready → bus
 *
 * NEXUS protocol (matches nexus-connect.js exactly):
 *   Register:  POST :9000/api/register   { systemId, port, meta, components[] }
 *   Heartbeat: POST :9000/api/heartbeat  { systemId, port, status }
 *   Event:     POST :9000/api/ledger     { system, type, payload }
 *              POST :3748/api/event      { type, payload, source, ts }
 *
 * Clear Glass sits alongside NEXUS systems as a peer — not nested inside.
 * It does not depend on nexus-wired or ErosmancerOS to boot.
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, session, shell } = require('electron');
const path   = require('path');
const http   = require('http');
const { randomUUID } = require('crypto');

// §EXPANSION 2026-07-07 — ErosmancerOS is a CDP client. Without this,
// Clear Glass's webContents were never a CDP target at all — the whole
// eros-registry-components.js / wire/nexus-wire.js bridge layer had
// nothing to attach to regardless of which routes it called. Must be
// set before app is ready; cannot be toggled at runtime.
// Port is intentionally distinct from ERAVOS/NEXUS/eros-os's own ports.
const CG_CDP_PORT = parseInt(process.env.CG_CDP_PORT || '9333', 10);
app.commandLine.appendSwitch('remote-debugging-port', String(CG_CDP_PORT));

// ── SISO bus — must be first ───────────────────────────────────────────────
const { createBus, emit, on, Event } = require('../core/bus');

const MODULE_ID   = 'clear-glass';
const MODULE_UUID = randomUUID();
// §BUILT 2026-09-22 — was '3.1.0' since 2026-09-01, drifted from
// package.json's own 3.8.0 (the field actually bumped per real release)
// — same drift lib/version.js's services['clear-glass'] and clear-
// glass.spec's meta.version independently exhibited. All three synced
// to 3.9.0 (3.8.0 baseline + this session's real additions) together;
// see clear-glass.spec's version_history for what's actually new.
const CG_VERSION  = '3.17.0';

// ── Headless / tray-only mode ─────────────────────────────────────────────
// CG_HEADLESS=1  OR  --headless in argv → no BrowserWindow, tray only.
// Co-pilot, NEXUS bridge, SSE server all boot normally.
// Useful for: background NCP provider, always-on orchestrator SSE listener.
// ── Strip our custom flags from argv BEFORE Electron passes them to Chromium ──
// '--headless' and '--tray-only' are ours, not Chromium's. If Chromium sees
// '--headless' it enables headless rendering mode — which sites can detect.
// We read them first, then remove them so they never reach Chromium.
const _CG_FLAGS = ['--headless', '--tray-only'];
const HEADLESS = (
  process.env.CG_HEADLESS === '1' ||
  _CG_FLAGS.some(f => process.argv.includes(f))
);
// Strip from argv immediately — before app is created
process.argv = process.argv.filter(a => !_CG_FLAGS.includes(a));
if (HEADLESS) console.log('[ClearGlass] tray-only mode (no window, no headless Chromium)');


// ── NEXUS port map — matches nexus-connect.js PORTS exactly ───────────────
const NEXUS_PORTS = {
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT  || '9000'),
  cortex:       parseInt(process.env.NEXUS_PORT         || '3748'),
  guardian:     parseInt(process.env.GUARDIAN_HTTP_PORT || '7820'),
  bridge:       parseInt(process.env.BRIDGE_PORT        || '9999'),
  // §BUILD 2026-08-23 — real, confirmed against ollama/config.js's own
  // real PORT default before adding, not guessed.
  ollama:       parseInt(process.env.OLLAMA_BRIDGE_PORT || '3749'),
};

const SSE_PORT = parseInt(process.env.CLEARGL_SSE_PORT || '7701');
const IPC_PORT = parseInt(process.env.CLEARGL_IPC_PORT || '7702');
const TLS_PORT = parseInt(process.env.CLEARGL_TLS_PORT || '7703');

// ── Module imports ─────────────────────────────────────────────────────────
const SseServer         = require('../sse/server');
const TlsProxy          = require('../tls/proxy');
const FingerprintEngine = require('../fingerprint/engine');
const CookieVault       = require('../cookies/vault');
const ContextMgr        = require('../contexts/manager');
const DomArchaeology    = require('../dom/archaeology');
const ClearDriver       = require('../driver/index');
const UrlListener       = require('../driver/url-listener');
const ApiSettings       = require('../api/settings');
const CoPilotBridge     = require('../copilot/bridge');
const AgentMesh         = require('../mesh/agent-mesh');
const DiagnosticEngine  = require('../diagnostic/engine');
const IpcBridge         = require('../ipc/bridge');
const NexusOptions      = require('../options/store');
const BookmarkStore     = require('../bookmarks/store');
const RewindEngine      = require('../rewind/engine');
const ProviderHost      = require('../providers/host');
const UserscriptManager = require('../userscripts/manager');
const { SiteSettingsStore } = require('../site-settings/store');
const { HistoryStore } = require('../history/store');
const { AutofillStore } = require('../autofill/store');
const { DownloadsStore } = require('../downloads/store');
const { PasswordVault } = require('../passwords/vault');
// §BUILD 2026-08-29 — James: "hook the macros in also, integrate
// macro.js with erosmanceros." Real investigation first: macro.js's
// own erosmancer integration already exists and is complete (§EROS-
// INTEGRATION 2026-08-23 — real profile application, real per-step
// execute routing, honestly documents the targetUuid requirement).
// What's genuinely missing, confirmed directly (zero references to
// "macro" anywhere in clear-glass/renderer/): macros have never had
// any real UI presence in Clear Glass at all — only reachable via an
// agent-tool call. This is Clear Glass's first ever bridge into
// lib/agent-tools/ — macro.js's own real, already-correct relative
// requires (e.g. ../../../../cortex/memory/jaa-db) resolve fine from
// here since each require() is relative to macro.js's own file
// location, not this file's — verified directly before wiring
// anything, not assumed.
const macroTool = require('../../../lib/agent-tools/tools/clear-glass/macro.js');
// §BUILD 2026-08-30 — ET3_clearglass_event_taxonomy. Real, boot-time
// self-check, giving lib/event-taxonomy-pattern.js's real validateTaxonomy()
// its first real consumer anywhere in this codebase (confirmed zero
// before this). Fail-open, matching this file's own established
// convention for non-critical checks elsewhere (e.g. copilot/lifeline.js's
// real fail-open/fail-closed distinction, cited directly in ET1's own
// module) — a taxonomy shape violation is a real bug worth a loud,
// visible warning, never a reason to refuse to boot the browser.
try {
  const taxonomy = require('../event-taxonomy');
  const { validateTaxonomy } = require('../../../lib/event-taxonomy-pattern.js');
  const result = validateTaxonomy(taxonomy, { systemName: 'clear-glass' });
  if (!result.ok) {
    console.warn(`[ClearGlass/EventTaxonomy] ${result.errors.length} real shape violation(s) in event-taxonomy.js:`);
    result.errors.forEach(e => console.warn(`  - ${e}`));
  }
} catch (err) {
  console.warn(`[ClearGlass/EventTaxonomy] validation itself failed (non-fatal): ${err.message}`);
}
const speech = require('../speech/engine');
const { PluginHost }    = require('../plugins/host');
const { registerAll }   = require('../gates/index');
const COMPONENTS        = require('../../seam/registry-components');
const CONTRACT          = require('../../registry-components');   // flat contract shape for orchestrator
const EROS_COMPONENTS   = require('../../wire/eros-registry-components');

// ── Wire config ───────────────────────────────────────────────────────────
const EROS_PORT = parseInt(process.env.EROS_PORT || '7432');
const WIRE_PORT = parseInt(process.env.WIRE_PORT || '7704');

// ── State ──────────────────────────────────────────────────────────────────
let loginPortal, jobIntake;
let webExtensions = null;
let tray, sse, ipcBridge, nexusOptions, bookmarks, rewind, providerHost, userscripts, siteSettings, downloads, passwordVault, pluginHost, errorCapture, processMetrics, history, mesh, autofillStore;
let fp          = null;   // FingerprintEngine  — set in bootstrap()
let ctxMgr      = null;   // ContextMgr         — set in bootstrap()
let driver      = null;   // ClearDriver        — set in bootstrap()
let urlListener = null;   // UrlListener        — set in bootstrap()
let apiSettings = null;   // ApiSettings        — set in bootstrap()
let _heartbeatInterval = null;
const windows        = new Map(); // agentId → BrowserWindow (visible)
const bgTabs         = new Map(); // agentId → BrowserWindow (hidden service tabs)
// §BUILD 2026-08-30 — James: "need a background tab manager." Real gap
// found: openBackgroundTab/closeBackgroundTab/listBackgroundTabs were
// already fully wired end to end (bgtab:open/close/list, confirmed
// directly — not a broken-wiring bug as first suspected from a case-
// sensitive grep miss), but listBackgroundTabs() only ever returned
// {agentId} — no url, nothing a real panel could show. The window's OWN
// top-level webContents can't answer this either: it loads browser.html
// itself, not the target url directly (the url is a query param
// browser.html's own <webview> navigates to internally). Separate,
// small map instead of restructuring bgTabs' existing agentId→win shape
// (several real call sites already depend on that exact shape).
const bgTabUrls       = new Map(); // agentId → the real url it was opened with

// ── Single instance ────────────────────────────────────────────────────────
app.setName('Clear Glass');
app.disableHardwareAcceleration();
// §BUG FIXED 2026-07-11, REVISED 2026-07-11 — the first version of this
// fix (app.commandLine.appendSwitch('disable-gpu') + disable-gpu-compositing
// + disable-software-rasterizer) stopped the fatal crash-loop but broke
// something worse: every window in this app is frame:false with
// webviewTag:true (see the win = new BrowserWindow({...}) calls below) —
// frameless windows AND <webview> tags both depend on the GPU process for
// compositing, and fully removing that process is a known, documented
// Electron/Chromium combination that renders a black window instead of
// content. Confirmed live: the browser chrome painted fine (plain HTML/
// CSS in the main renderer), the actual page content — loaded via
// <webview>, which runs its own guest renderer with its own compositing
// path — did not, on a real machine, via the process-monitor tool built
// specifically to catch exactly this kind of "did the fix actually work"
// question.
//
// error_code=18 on Windows is very commonly a SANDBOX initialization
// failure specifically, not a GPU-capability failure in general —
// --disable-gpu-sandbox targets that directly (removes the sandbox
// restriction the process was failing to initialize under) while leaving
// the GPU process itself, and therefore compositing for frameless windows
// and webviews, intact. This is the standard, narrower fix for this
// specific failure mode; the blanket --disable-gpu three-switch version
// is what you reach for when a process shouldn't exist at all, which
// wasn't true here — this app needs it to exist, just not to need the
// sandbox it couldn't initialize.
app.commandLine.appendSwitch('disable-gpu-sandbox');
// Defensive companion, not the primary fix: even with the sandbox issue
// addressed above, if the GPU process still crashes occasionally on this
// machine, Chromium has its OWN internal crash-count circuit breaker that
// permanently disables GPU usage after enough failures — which is a
// second, independent circuit breaker stacked on top of autopilot's own
// (the "crashes in window: 1/6" one). This doesn't prevent a crash; it
// prevents Chromium's response to a crash from becoming the fatal
// "GPU process isn't usable. Goodbye." app-kill, so a transient GPU
// hiccup degrades to a slower frame instead of taking the whole app down.
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
// §CRITICAL fix 2026-06-30 — this was the actual cause of the 6-crash
// circuit-breaker trip. requestSingleInstanceLock() failing produces a
// CLEAN exit (code 0, no signal, zero log output) — indistinguishable from
// a real crash in autopilot's log, except there's no error anywhere because
// there isn't one: Electron is doing exactly what this line told it to do.
// Root cause: autopilot's restart backoff (1s/2s/4s/8s/16s) was firing new
// launches faster than Windows fully releases the previous instance's lock
// file after process exit — a real OS-level race, not a logic bug. Every
// restart attempt was self-terminating against its own predecessor's
// not-yet-released lock, which is why faster backoff intervals failed
// faster and the circuit breaker tripped on schedule.
// Fix: (1) make this loud — autopilot's own log will show exactly why an
// instance exited next time, instead of a silent, info-free exit code 0.
// (2) brief delay + retry-once before giving up, in case it's genuinely a
// transient lock-release race rather than a real second instance running.
// §fix 2026-07-15 — the retry described in the comment above was never
// actually implemented; requestSingleInstanceLock() only tried once and
// quit immediately on failure, which is the exact behavior that tripped
// the circuit breaker (6 clean exit(1)s in under a minute, autopilot's
// 1s/2s/4s/8s/16s backoff outracing Windows' lock-file release). This
// does one delayed retry before giving up for real.
const LOCK_RETRY_DELAY_MS = 1500;
const _sleep = ms => new Promise(r => setTimeout(r, ms));

async function acquireSingleInstanceLockOrExit() {
  if (app.requestSingleInstanceLock()) return true;

  console.error(`[${new Date().toISOString()}] [clear-glass/src/main/index.js] [ClearGlass] requestSingleInstanceLock() failed on first attempt — another instance holds the lock (or its lock file hasn't released yet). Retrying once in ${LOCK_RETRY_DELAY_MS}ms in case this is a transient release race.`);
  await _sleep(LOCK_RETRY_DELAY_MS);

  if (app.requestSingleInstanceLock()) {
    console.error(`[${new Date().toISOString()}] [clear-glass/src/main/index.js] [ClearGlass] requestSingleInstanceLock() succeeded on retry — proceeding with boot.`);
    return true;
  }

  console.error(`[${new Date().toISOString()}] [clear-glass/src/main/index.js] [ClearGlass] requestSingleInstanceLock() failed again after retry — another instance is genuinely already running (Electron's requestSingleInstanceLock() only returns false when a live instance holds it right now — not an ambiguous "maybe a stale file" state). That instance's own 'second-instance' handler will show/focus its window. This launch has done its job just by acquiring-then-losing the lock race — exiting cleanly, not as an error. If you expected a NEW window instead, the running instance is what you're seeing (or should be — check its tray icon if tray-first hiding is on).`);
  // §BUGFIX 2026-08-28 — James: "i was running autopilot... also why
  // would it need autopilot?" Real, concrete scenario this connects
  // to directly: autopilot's :7799/spawn/clear-glass request succeeds
  // (spawnRequestOutcome:'ok' in orchestrator's own new event), yet the
  // NEW process launched by that spawn hits exactly this lock-collision
  // path — an orphaned or hidden prior instance is already holding the
  // lock — logs to console.error, and exits(0) CLEANLY, which looks
  // like a successful, intentional exit to whatever spawned it, not a
  // failure. Orchestrator then keeps polling :7704 against a process
  // that already gave up, eventually writing orchestrator.ui.open_failed
  // with spawnRequestOutcome:'ok' — technically correct, but with no way
  // to tell THIS specific reason (a hidden second instance) apart from
  // any other reason Clear Glass never became reachable. Fire-and-forget
  // POST to cortex's real, existing /api/event (confirmed directly —
  // the same endpoint orchestrator itself already posts through), same
  // pattern acquireSingleInstanceLockOrExit's own spawn-request sibling
  // uses elsewhere in this codebase. Best-effort only: cortex may not be
  // up yet this early in boot, and that's fine — console.error above is
  // the guaranteed record, this is the queryable one when it lands.
  try {
    const http = require('http');
    const payload = JSON.stringify({
      type: 'clear-glass.spawn.lock_collision', source: 'clear-glass',
      payload: { reason: 'requestSingleInstanceLock() failed twice — another instance is already running and holds the lock', pid: process.pid, retryDelayMs: LOCK_RETRY_DELAY_MS },
    });
    const req = http.request({ hostname: '127.0.0.1', port: 3748, path: '/api/event', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 1500 }, r => r.resume());
    req.on('error', () => {}); // best-effort — cortex may not be up yet, console.error above is the guaranteed record
    req.on('timeout', () => req.destroy());
    req.write(payload); req.end();
  } catch (_) { /* best-effort, see above */ }
  app.quit();
  // §FIX 2026-07-24 — was exit(1) with "FATAL" wording. That was correct for
  // the 2026-06-30 case this function was originally built for (a genuine
  // crash-loop, autopilot's own respawn outracing lock release — see the
  // comment block above), but wrong for the much more common, completely
  // benign case: a user (or a stray script) launches clear-glass while a
  // legitimate instance is already running, e.g. tray-resident from an
  // earlier session (see the idle-vs-open fix, same day — the whole POINT
  // of that fix is clear-glass staying alive while in genuine use, which
  // means a second launch attempt hitting this path is not just possible,
  // it's the EXPECTED outcome of that fix working). Exiting 1/"FATAL" here
  // misreports a working singleton handoff as a crash — to a human reading
  // the log, and to anything that checks this process's exit code.
  process.exit(0);
  return false;
}

acquireSingleInstanceLockOrExit().then(acquired => {
  if (!acquired) return; // already exited inside acquireSingleInstanceLockOrExit
  app.on('second-instance', (_event, commandLine) => {
    const w = windows.values().next().value;
    if (w) { w.show(); w.focus(); }
    // §NEXUS-URI 2026-09-16 — on Windows/Linux a second launch via a
    // registered nexus:// link arrives here as a plain argv entry, not
    // through 'open-url' (that event is macOS-only). Same dispatch as
    // the 'open-url' handler below — one real path, two OS entry points.
    const uri = commandLine.find(a => a.startsWith('nexus://'));
    if (uri) dispatchNexusUri(uri);
  });
  app.whenReady().then(bootstrap).then(() => {
    registerNexusUriActions();
    // §FPF BUILD NOTE — nexus-uri-clearglass-mesh-integration.spec's
    // fpf_build_registration_note: for the abuse-safety build channel,
    // a distinctively-named registered URI scheme is itself a forensic
    // artifact (evidence, to someone inspecting the device, that this
    // person sought this kind of help). This build has no real
    // "build channel" concept yet to gate on automatically — that is a
    // real decision for whoever configures an FPF-channel build, not
    // one this code can safely infer on its own — so the escape hatch
    // is an explicit env var rather than silent default-on registration.
    if (process.env.NEXUS_URI_SCHEME_DISABLED === '1') {
      console.log('[nexus-uri] scheme registration skipped — NEXUS_URI_SCHEME_DISABLED=1');
    } else if (!app.isDefaultProtocolClient('nexus')) {
      app.setAsDefaultProtocolClient('nexus');
    }
    // First launch via a nexus:// link on Windows/Linux — process.argv
    // carries it directly rather than through second-instance.
    const argvUri = process.argv.find(a => a.startsWith('nexus://'));
    if (argvUri) dispatchNexusUri(argvUri);
  });
  app.on('window-all-closed', e => e.preventDefault()); // tray-first — never quit on last window close
  app.on('before-quit', shutdown);
  // macOS delivers a registered-scheme launch here, at any point in the
  // app's life, not only at startup.
  app.on('open-url', (event, uri) => { event.preventDefault(); dispatchNexusUri(uri); });
});

// ── nexus:// URI dispatch — Clear Glass's half of lib/nexus-uri.js ────────
// §BUILT 2026-09-16, from nexus-uri-clearglass-mesh-integration.spec
// thread_2 (phase C). This is ONE of the three call sites the spec's
// implementation_note requires ("COS, idearium, and ClearGlass each wire
// their own action functions into the same allowlist/validation code") —
// registerAction() calls below are ClearGlass's; idearium's own actions
// run in idearium's own process (see idearium/ui/js/app.js's
// handleNexusDeepLink for that half), and COS's compartment action runs
// here because COS has no process or UI of its own to host it in.
const nexusUri = require('../../../lib/nexus-uri.js');

function dispatchNexusUri(uri) {
  nexusUri.resolve(uri).then(result => {
    if (!result.ok) console.warn(`[nexus-uri] rejected: ${result.error}`);
    else console.log(`[nexus-uri] resolved '${result.routeId}' ${JSON.stringify(result.params)}`);
  }).catch(e => console.error(`[nexus-uri] resolve threw (should never happen — resolve() itself catches action errors): ${e.message}`));
}

function registerNexusUriActions() {
  // 'repo' / 'repo-chunk' — idearium owns the UI; the real, minimal thing
  // ClearGlass's action does is get a window open on idearium's own real
  // deep-link URL (wired idearium-side in idearium/ui/js/app.js's
  // handleNexusDeepLink — this does not duplicate that logic, just
  // reaches it). Existence of the repoUuid is validated by idearium's own
  // page load (API_REPOS lookup), not re-validated here — one real check,
  // not two that could disagree.
  const openIdeariumUrl = (query) => {
    const url = `http://127.0.0.1:4800/?${query}`;
    const w = windows.get('default');
    if (w) { w.loadURL(url); w.show(); w.focus(); }
    else { const nw = new BrowserWindow({ width: 1280, height: 860 }); nw.loadURL(url); windows.set('idearium-deeplink', nw); }
  };
  nexusUri.registerAction('repo', ({ repoUuid }) => openIdeariumUrl(`repo=${repoUuid}`));
  nexusUri.registerAction('repo-chunk', ({ repoUuid, chunkUuid }) => openIdeariumUrl(`repo=${repoUuid}&chunk=${chunkUuid}`));

  // 'compartment' — COS has no window/UI of its own (checked: cos/ is a
  // Node host + CLI, nothing browser-facing). The one real, meaningful
  // "open" available is revealing the compartment's actual directory —
  // real files a person can inspect — rather than inventing a dashboard
  // that doesn't exist. Same process, so cos-bridge is required directly
  // rather than over a network hop idearium's actions need. cos-bridge
  // itself now creates a fresh host per call (§REVISED 2026-09-17, see
  // its own header) — same real pattern as project-container.js's own
  // COS integration, not a second philosophy.
  nexusUri.registerAction('compartment', ({ compartmentId }) => {
    const cos = require('../../../lib/cos-bridge.js');
    const comp = cos.getCompartment(compartmentId);
    if (!comp) throw new Error(`no COS compartment found for '${compartmentId}'`);
    if (comp.fs && comp.fs.root) shell.showItemInFolder(comp.fs.root);
    return { compartmentId: comp.id, name: comp.name, root: comp.fs && comp.fs.root };
  });

  // 'remote-desktop' — sessionId ONLY, per lib/nexus-uri.js's own header:
  // never a token. viewer.html's real query param is `session` (checked
  // directly against remote-desktop/viewer.html), and `token` is left for
  // the person to enter by hand from wherever the host actually shared it
  // — a nexus:// link is never sufficient by itself to join a session.
  nexusUri.registerAction('remote-desktop', ({ sessionId }) => {
    const path = require('path');
    const viewerPath = path.join(__dirname, '..', '..', '..', 'remote-desktop', 'viewer.html');
    const w = new BrowserWindow({ width: 1024, height: 768 });
    w.loadFile(viewerPath, { search: `session=${sessionId}` });
    windows.set(`remote-desktop-${sessionId}`, w);
    return { sessionId };
  });

  // 'clearglass-session' — deliberately NOT registered. No real
  // resumable capture-session module exists in this codebase today (the
  // only `sessionId` usage found is copilot/bridge.js's per-dispatch
  // correlation id, a different concept entirely — checked before
  // writing this comment). Registering a fabricated action here would be
  // exactly the silent-lie pattern this whole build has been fixing
  // elsewhere; resolve() already reports "matched but no action
  // registered" honestly for this route until a real one exists.
}

// ── NEXUS HTTP helper — matches nexus-connect._req exactly ────────────────
// Returns { ok, data, error, ms } — never throws
function _ncReq(port, method, urlPath, body, timeout = 4000) {
  return new Promise(resolve => {
    const t0      = Date.now();
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: {
        'Content-Type':      'application/json',
        'X-Nexus-Source':    MODULE_ID,
        'X-Nexus-Call-UUID': randomUUID(),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const ms = Date.now() - t0;
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(d), ms }); }
        catch { resolve({ ok: res.statusCode < 400, data: d, ms }); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ ok: false, error: 'timeout', ms: timeout }); });
    req.on('error', e => resolve({ ok: false, error: e.message, ms: Date.now() - t0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── NEXUS registration — POST /api/register with components[] ─────────────
// Matches bridge/index.js → nc.registerWithOrchestrator() call exactly
async function _registerWithNexus() {
  const r = await _ncReq(
    NEXUS_PORTS.orchestrator,
    'POST',
    '/api/register',
    {
      systemId:   MODULE_ID,
      port:       SSE_PORT,
      meta:       { role: 'browser', version: CG_VERSION, ipcPort: IPC_PORT, tlsPort: TLS_PORT },
      ts:         Date.now(),
      components: COMPONENTS,
    },
    5000,
  );

  if (r.ok) {
    console.log(`[ClearGlass §AXIOM] registered with orchestrator :${NEXUS_PORTS.orchestrator}`);
    // Also post to orchestrator ledger — matches nc.postLedger()
    _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/ledger', {
      system: MODULE_ID,
      type:   'clear-glass.registered',
      payload: { port: SSE_PORT, ipcPort: IPC_PORT, tlsPort: TLS_PORT, version: CG_VERSION },
    }, 2000).catch(() => {});
  } else {
    console.log(`[ClearGlass §AXIOM] orchestrator offline — running standalone`);
  }

  // §RAID-FIX 2026-09-16 — James: "raid also needs to stop failing, i
  // dont think its using the agent mesh, router..." Real, traced gap:
  // the registration above (and the whole COMPONENTS list it sends —
  // seam/registry-components.js, already real, already covers
  // mesh.spawn/send/route/enqueue/list AND driver.exec — this file
  // wasn't missing a capability description, it just never left this
  // process) only ever reaches ORCHESTRATOR's own component-registry
  // instance. cortex/core/raid/router.js resolves against CORTEX's
  // separate instance (cortex/boot.js's own capabilityRegistry.init) —
  // a different process, a different in-memory registry — so RAID has
  // never been able to route to agent-mesh or the driver, regardless of
  // orchestrator-side registration succeeding. Additive: orchestrator
  // registration above is untouched (still does its own real job —
  // system.registered broadcast, presence, trust). COMPONENTS is
  // already in the exact shape cortex's registry expects (id/namespace/
  // name/version/grammar/route/description — seam/registry-components.js's
  // own header says so), so this goes straight to the batch endpoint,
  // no lib/self-register-remote.js capability-list wrapping needed.
  _ncReq(NEXUS_PORTS.cortex, 'POST', '/api/components/register-batch',
    { components: COMPONENTS }, 5000).then((cr) => {
    if (cr.ok && cr.data && cr.data.ok) {
      console.log(`[ClearGlass §AXIOM] registered ${cr.data.registered} capabilit${cr.data.registered === 1 ? 'y' : 'ies'} with RAID (cortex :${NEXUS_PORTS.cortex})`);
    } else {
      console.log(`[ClearGlass §AXIOM] RAID self-registration incomplete: ${cr.error || (cr.data && cr.data.error) || 'unknown'}`);
    }
  }).catch(() => {});

  return r;
}

// ── NEXUS event emit — matches nc.postEvent() exactly ─────────────────────
// Fire-and-forget. Never blocks caller.
function _postEvent(type, payload) {
  _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/ledger',
    { system: MODULE_ID, type, payload }, 1200).catch(() => {});
  _ncReq(NEXUS_PORTS.cortex, 'POST', '/api/event',
    { type, payload, source: MODULE_ID, ts: Date.now() }, 1200).catch(() => {});
}

// ── Heartbeat — matches nc.startHeartbeat() exactly ───────────────────────
function _startHeartbeat() {
  const ping = () => _ncReq(
    NEXUS_PORTS.orchestrator, 'POST', '/api/heartbeat',
    { systemId: MODULE_ID, port: SSE_PORT, status: 'online' }, 2000,
  ).catch(() => {});
  ping();
  _heartbeatInterval = setInterval(ping, 10000);
  if (_heartbeatInterval.unref) _heartbeatInterval.unref();
}

// ── Idle-vs-open: tell autopilot this instance is genuinely in use ────────
// §FIX 2026-07-24 (James) — "when the electron instance is open, it
// shouldn't be considered idle." autopilot.js's idle reaper despawns an
// on-demand kernel 10 minutes after its lastActivity timestamp — but
// lastActivity was only ever set once, at requestSpawn() time (see
// autopilot.js's requestSpawn/_startIdleReaper). Nothing in clear-glass
// ever called autopilot's POST /touch/:name to reset that clock, so a
// window left open and actively used for >10 minutes still got despawned
// as idle — the process would vanish out from under an active user.
//
// Fix: while at least one real window is visible, ping autopilot's touch
// endpoint periodically. Background tabs (bgTabs) deliberately do NOT
// count — those are hidden-by-design automation contexts, not "someone is
// looking at this," and counting them would defeat idle-despawn entirely
// for any session that ever opened one.
//
// AUTOPILOT_STATUS_PORT is set on this process's env by autopilot itself
// at spawn time (see autopilot.js's ALL_KERNELS clear-glass entry, added
// alongside this fix — it can't be assumed to be the 7799 default, since
// --status-port= or AUTOPILOT_STATUS_PORT could have overridden it in the
// parent). Unset or 0 means the status server is disabled — nothing to
// call, so this becomes a no-op rather than retrying against a server
// that was never started.
const AUTOPILOT_STATUS_PORT = parseInt(process.env.AUTOPILOT_STATUS_PORT || '0', 10);
let _autopilotTouchTimer = null;

function _anyWindowVisible() {
  for (const w of windows.values()) {
    try { if (!w.isDestroyed() && w.isVisible()) return true; } catch (_) {}
  }
  try { if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) return true; } catch (_) {}
  return false;
}

function _touchAutopilotIfOpen() {
  if (!AUTOPILOT_STATUS_PORT || !_anyWindowVisible()) return;
  // Fire-and-forget, same convention as _postEvent — autopilot being
  // unreachable isn't something a visibility ping should surface to the
  // user. Worst case this cycle's touch is missed and the next one
  // (60s later, well inside the 10-minute idle window) catches it.
  _ncReq(AUTOPILOT_STATUS_PORT, 'POST', `/touch/${MODULE_ID}`, null, 2000);
}

function _startAutopilotActivityHeartbeat() {
  if (_autopilotTouchTimer) return;
  _touchAutopilotIfOpen(); // immediate — don't wait a full interval after the window that just opened
  _autopilotTouchTimer = setInterval(_touchAutopilotIfOpen, 60000);
  if (_autopilotTouchTimer.unref) _autopilotTouchTimer.unref();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
// ── Wire — inline nexus-wire.js ───────────────────────────────────────────
// Registers clear-glass AND ErosmancerOS with the orchestrator. Opens a thin
// HTTP server on WIRE_PORT (:7704) that:
//   GET  /contract        — contract-handshake endpoint for the orchestrator
//   GET  /health          — liveness probe
//   GET  /wire/health     — alias
//   POST /eros/*          — proxy to ErosmancerOS REST API
//   POST /bridge/driver   — ClearDriver → ErosmancerOS action mapping
//   POST /hook/hostile    — hostile detection → SISO bus fp.switch
//   POST /hook/behavior   — behavior plan → Cortex intelligence event
//
// Non-fatal: errors here are logged and swallowed — CG boot continues.

let _wireServer = null;

async function _startWire() {
  // ── ErosmancerOS proxy helper — defined first, needed for /api/connect ──
  function _proxyEros(method, urlPath, body, timeout = 15000) {
    return new Promise(resolve => {
      const payload = (body && method !== 'GET') ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1', port: EROS_PORT, path: urlPath, method,
        headers: { 'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, ok: res.statusCode < 400, body: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode, ok: res.statusCode < 400, body: d }); }
        });
      });
      req.setTimeout(timeout, () => { req.destroy(); resolve({ status: 504, ok: false, error: 'upstream timeout', body: { error: 'upstream timeout' } }); });
      req.on('error', e => resolve({ status: 502, ok: false, error: e.message, body: { error: e.message } }));
      if (payload) req.write(payload);
      req.end();
    });
  }

  // ── Register ErosmancerOS with orchestrator ──────────────────────────────
  const erosReg = await _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/register', {
    systemId:   'erosmancer-os',
    port:       EROS_PORT,
    meta:       { role: 'cdp-engine', version: '2.0.0', wirePort: WIRE_PORT },
    ts:         Date.now(),
    components: EROS_COMPONENTS,
  }, 5000);
  console.log(erosReg.ok
    ? `[ClearGlass/Wire §AXIOM] ErosmancerOS registered with orchestrator :${NEXUS_PORTS.orchestrator}`
    : '[ClearGlass/Wire §AXIOM] orchestrator offline — ErosmancerOS standalone');

  // §EXPANSION 2026-07-07 — nothing anywhere in the codebase ever called
  // POST /api/connect on ErosmancerOS. It could register with the
  // orchestrator and accept /api/execute calls, but had no CDP session at
  // all — every downstream call would 503 "Not connected." Point it at
  // Clear Glass's own remote-debugging-port (opened above via
  // app.commandLine.appendSwitch) so its Target.setDiscoverTargets call
  // actually sees Clear Glass's webContents.
  const erosConnect = await _proxyEros('POST', '/api/connect', {
    target: { type: 'local', port: CG_CDP_PORT, host: 'localhost' },
  }, 8000);
  console.log(erosConnect.ok
    ? `[ClearGlass/Wire] ErosmancerOS connected to CDP :${CG_CDP_PORT}`
    : `[ClearGlass/Wire] ErosmancerOS connect failed (will retry on first driver call): ${erosConnect.error || erosConnect.status}`);

  // ── Register nexus-wire itself ───────────────────────────────────────────
  await _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/register', {
    systemId:   'nexus-wire',
    port:       WIRE_PORT,
    meta:       { role: 'integration-bridge', version: '1.1.0', hostedBy: 'clear-glass' },
    ts:         Date.now(),
    components: [],
  }, 5000);

  // ── Dual heartbeat ───────────────────────────────────────────────────────
  const wirePing = () => {
    _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/heartbeat',
      { systemId: 'nexus-wire',    port: WIRE_PORT, status: 'online' }, 2000).catch(() => {});
    _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/heartbeat',
      { systemId: 'erosmancer-os', port: EROS_PORT, status: 'online' }, 2000).catch(() => {});
  };
  wirePing();
  const _wireHb = setInterval(wirePing, 10000);
  if (_wireHb.unref) _wireHb.unref();

  // §FIX 2026-07-07 — see wire/nexus-wire.js for the full explanation: the
  // old ACTION_MAP pointed at /api/os/* routes that never existed in
  // erosmancer-os/src/api/server.ts. Real contract is /api/execute with a
  // registered node uuid, gated behind an attached CDP session. This inline
  // copy now does the same tab-resolution + node-registration flow.
  const _agentTabCache = new Map(); // agentId → { tabId, attached }

  async function _resolveErosTab(agentId, currentUrl) {
    const cached = _agentTabCache.get(agentId);
    if (cached) return cached;

    const tabsResp = await _proxyEros('GET', '/api/tabs', null, 5000);
    const tabs = (tabsResp.body && tabsResp.body.tabs) || [];
    let match = currentUrl ? tabs.find(t => t.url === currentUrl) : null;
    if (!match && tabs.length) match = tabs[0];
    if (!match) return null;

    const attachResp = await _proxyEros('POST', `/api/tabs/${match.targetId}/attach`, { role: 'primary' }, 8000);
    if (attachResp.status >= 400) return null;

    const entry = { tabId: match.targetId, attached: true };
    _agentTabCache.set(agentId, entry);
    return entry;
  }

  // ── HTTP server ──────────────────────────────────────────────────────────
  _wireServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    // §FOUND & FIXED 2026-09-12 — James's own devtools console (screenshot):
    // every "unreachable"/CORS failure this whole session, on every route
    // (automation/workflows, automation/log, agent-mesh/routes, etc.) was
    // this: 'Access-Control-Allow-Origin: *' was set, but nothing ever
    // answered an OPTIONS preflight request. A browser sends OPTIONS before
    // any POST (and any GET carrying a Content-Type header, which every
    // fetch() call in brainos-automation.js's api() helper does) to ask
    // permission first. Every route check below is `req.method === 'GET'`
    // or `'POST'` -- OPTIONS matched none of them, fell through to
    // whatever this server's real default response is, which is not
    // HTTP 200/204 -- so the browser's preflight check failed and it
    // never even attempted the real request. clear-glass was reachable
    // this entire time; this was the actual block.
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      return res.end();
    }

    let body = '';
    // 2026-09-19: setEncoding, or multi-byte characters split across chunk boundaries become U+FFFD: a multi-MB
    // prompt containing non-ASCII source would be silently corrupted.
    req.setEncoding('utf8');
    req.on('data', c => body += c);
    req.on('end', async () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch {}

      const u = req.url;

      // §RELOCATED 2026-09-03 — network subsystem routes (formerly
      // guardian's /mesh/*, see src/network/routes.js's header). `parsed`
      // is the same already-parsed JSON body every other route here uses.
      if (require('../network/routes.js').handle(req, res, { method: req.method, url: new URL(u, `http://127.0.0.1`), body: parsed })) return;

      // Contract endpoint — what the orchestrator verifies on boot
      if (u === '/contract' && req.method === 'GET') {
        return res.end(JSON.stringify(CONTRACT));
      }

      if ((u === '/health' || u === '/wire/health') && req.method === 'GET') {
        return res.end(JSON.stringify({ ok: true, module: 'nexus-wire', port: WIRE_PORT, ts: Date.now() }));
      }

      // §WIRED 2026-08-23 — James: "dom archeology tool for the clear-
      // glass toolkit." Real HTTP surface for ProviderHost.queryDom(),
      // so an agent tool (running in a different, Node-only process —
      // copilot — that has no direct access to a real Electron
      // webContents) can reach it, same real reasoning /bridge/driver
      // below already established for driver actions.
      if (u === '/dom/query' && req.method === 'POST') {
        const { providerId, query } = parsed;
        if (!providerId) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'providerId required' })); }
        const result = await providerHost.queryDom(providerId, query);
        res.writeHead(result.ok === false ? 502 : 200);
        return res.end(JSON.stringify(result));
      }

      // §NEW 2026-09-06 — James: "hook in the agent mesh in clearglass,
      // and guardian... how can i test it? my normal entry point is
      // worthless. the tv ui, cli." Real problem, confirmed before
      // building this: the TV UI's ask-box calls copilot directly
      // (_copilotDispatch), which never touches agent-mesh at all —
      // grepped this whole file for mesh.route( and found zero real
      // call sites outside wake-relay.js's own buried error-fallback
      // path. There was no way to exercise DA1's real Guardian-first
      // dispatch gate (the live GET /providers check in agent-mesh.js's
      // route()) without deliberately breaking copilot first. This
      // route is that direct entry point — calls mesh.route() exactly
      // the same way wake-relay.js's fallback does, just reachable on
      // demand instead of only after a copilot failure.
      if (u === '/agent-mesh/route' && req.method === 'POST') {
        const { prompt, preferAgent, fallbackOrder } = parsed;
        if (!prompt) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'prompt required' })); }
        try {
          const result = await mesh.route({ prompt, preferAgent, fallbackOrder });
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, ...result }));
        } catch (e) {
          res.writeHead(502);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // §NEW 2026-09-06 — James: "brainos is important. do that next."
      // Real gap for the full dynamic canvas: brainos-canvas.js can
      // pulse a fixed 'agent-mesh' node on real mesh.* SSE events (built
      // last turn), but has no way to get the INITIAL real state on
      // mount — a fresh page load shows nothing until the first real
      // 5s mesh.nodes.snapshot tick. This is that initial fetch: the
      // same real listMeshView() the snapshot event's own data comes
      // from, read once on mount, not a new mechanism.
      // §BUILT — James: "deploying nodes on the canvas spawn agents."
      // Real, minimal gap: /agent-mesh/route dispatches a prompt (spawns
      // as a side effect if needed) but there was no direct "spawn this
      // agent" entry point of its own — BrainOS's context menu (below)
      // needs exactly that without requiring a prompt to go with it.
      // ── guardian mesh-first dispatch (2026-09-19). send is async + idempotent by jobId; poll /agent-mesh/job. ──
      if (u === '/agent-mesh/send' && req.method === 'POST') {
        // v0.39.227: through the intake — guardian's claim on the .job is checked before anything is queued.
        if (!jobIntake) { res.writeHead(503); return res.end(JSON.stringify({ ok: false, accepted: false, sent: false, stage: 'mesh_unreachable', error: 'Clear Glass is still starting — job intake not ready' })); }
        try { const r = await jobIntake.intake(parsed); res.writeHead(r.accepted === false ? 200 : 202); return res.end(JSON.stringify({ ok: r.accepted !== false, ...r })); }
        catch (e) { res.writeHead(500); return res.end(JSON.stringify({ ok: false, accepted: false, sent: false, stage: 'inject_failed', error: e.message })); }
      }
      if (u === '/agent-mesh/job' && req.method === 'GET') {
        const id = new URL(req.url, 'http://127.0.0.1').searchParams.get('jobId');
        if (!jobIntake) { res.writeHead(503); return res.end(JSON.stringify({ ok: false, error: 'job intake not ready' })); }
        res.writeHead(200); return res.end(JSON.stringify({ ok: true, ...jobIntake.status(id) }));
      }
      if (u === '/agent-mesh/intake' && req.method === 'GET') {
        if (!jobIntake) { res.writeHead(503); return res.end(JSON.stringify({ ok: false, error: 'job intake not ready' })); }
        res.writeHead(200); return res.end(JSON.stringify({ ok: true, dir: jobIntake.dir, jobs: jobIntake.list() }));
      }
      if (u === '/agent-mesh/diagnose' && req.method === 'POST') {
        try { res.writeHead(200); return res.end(JSON.stringify(await mesh.diagnoseDom(parsed))); }
        catch (e) { res.writeHead(500); return res.end(JSON.stringify({ ok: false, repaired: false, error: e.message })); }
      }
      if (u === '/agent-mesh/read' && req.method === 'POST') {
        try { res.writeHead(200); return res.end(JSON.stringify(await mesh.readDomJob(parsed))); }
        catch (e) { res.writeHead(500); return res.end(JSON.stringify({ ok: false, error: e.message })); }
      }

      if (u === '/agent-mesh/spawn' && req.method === 'POST') {
        const { agentKey } = parsed;
        if (!agentKey) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'agentKey required' })); }
        try {
          const state = await mesh.spawn(agentKey);
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, agentKey, contextId: state.contextId }));
        } catch (e) {
          res.writeHead(502);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      if (u === '/agent-mesh/view' && req.method === 'GET') {
        try {
          const view = mesh.listMeshView ? mesh.listMeshView() : [];
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, nodes: view }));
        } catch (e) {
          res.writeHead(502);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // §BUILT — Phase 2, James: "route data, create pipelines... maybe a
      // feedback loop." Real, persisted node-to-node edges — see
      // clear-glass/src/mesh/route-graph.js for the actual trigger logic.
      if (u === '/agent-mesh/routes' && req.method === 'GET') {
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, routes: mesh.listRoutes() }));
      }
      if (u === '/agent-mesh/routes' && req.method === 'POST') {
        const { from, to, kind, systemPrompt, transform } = parsed;
        const result = mesh.addRoute({ from, to, kind, systemPrompt, transform });
        res.writeHead(result.ok ? 200 : 400);
        return res.end(JSON.stringify(result));
      }
      if (u.startsWith('/agent-mesh/routes/') && req.method === 'DELETE') {
        const id = u.slice('/agent-mesh/routes/'.length);
        const result = mesh.removeRoute(id);
        res.writeHead(result.ok ? 200 : 404);
        return res.end(JSON.stringify(result));
      }

      // §BUILT — Automation engine real HTTP surface, same thin-pass-
      // through convention as the routes above.
      if (u === '/automation/workflows' && req.method === 'GET') {
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, workflows: mesh.listWorkflows() }));
      }
      if (u === '/automation/workflows' && req.method === 'POST') {
        const result = mesh.createWorkflow(parsed);
        res.writeHead(result.ok ? 200 : 400);
        return res.end(JSON.stringify(result));
      }
      if (u.match(/^\/automation\/workflows\/[^/]+$/) && req.method === 'PATCH') {
        const id = u.split('/').pop();
        const result = mesh.updateWorkflow(id, parsed);
        res.writeHead(result.ok ? 200 : 404);
        return res.end(JSON.stringify(result));
      }
      if (u.match(/^\/automation\/workflows\/[^/]+$/) && req.method === 'DELETE') {
        const id = u.split('/').pop();
        const result = mesh.removeWorkflow(id);
        res.writeHead(result.ok ? 200 : 404);
        return res.end(JSON.stringify(result));
      }
      if (u.match(/^\/automation\/workflows\/[^/]+\/run$/) && req.method === 'POST') {
        const id = u.split('/')[3];
        try {
          const result = await mesh.runWorkflow(id, 'manual');
          res.writeHead(result.ok ? 200 : 500);
          return res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }
      if (u === '/automation/log' && req.method === 'GET') {
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, log: mesh.getAutomationLog() }));
      }
      // §BUILT — per-step CRUD, the real Tasker-style step editor's
      // backend (James: "like tasker and automate").
      if (u.match(/^\/automation\/workflows\/[^/]+\/steps$/) && req.method === 'POST') {
        const id = u.split('/')[3];
        const result = mesh.addWorkflowStep(id, parsed);
        res.writeHead(result.ok ? 200 : 400);
        return res.end(JSON.stringify(result));
      }
      if (u.match(/^\/automation\/workflows\/[^/]+\/steps\/[^/]+$/) && req.method === 'PATCH') {
        const parts = u.split('/'); const id = parts[3], stepId = parts[5];
        const result = mesh.updateWorkflowStep(id, stepId, parsed);
        res.writeHead(result.ok ? 200 : 404);
        return res.end(JSON.stringify(result));
      }
      if (u.match(/^\/automation\/workflows\/[^/]+\/steps\/[^/]+$/) && req.method === 'DELETE') {
        const parts = u.split('/'); const id = parts[3], stepId = parts[5];
        const result = mesh.removeWorkflowStep(id, stepId);
        res.writeHead(result.ok ? 200 : 404);
        return res.end(JSON.stringify(result));
      }
      if (u.match(/^\/automation\/workflows\/[^/]+\/steps\/[^/]+\/move$/) && req.method === 'POST') {
        const parts = u.split('/'); const id = parts[3], stepId = parts[5];
        const result = mesh.moveWorkflowStep(id, stepId, parsed?.dir);
        res.writeHead(result.ok ? 200 : 404);
        return res.end(JSON.stringify(result));
      }

      // §BL24 2026-08-23 — James: "a command/tool to disable and re-
      // enable them." Real, previously-missing HTTP surface for
      // UserscriptManager's already-real list()/toggle() — same real
      // gap class as /dom/query above (this codebase's own agent tools
      // run in copilot's separate Node process, not this one, and the
      // real IPC handlers above only reach clear-glass's own renderer).
      // §BUILT 2026-09-12 — James: "right click context needs to be
      // able to... open the agent suite to edit and modify the agent."
      // Real, previously-missing HTTP surface for the already-real
      // openSettingsWindow() (only reachable before via an Electron
      // app-menu click or the IPC bridge, both same-process-only —
      // this page runs in a separate browser tab hitting :7704 over
      // plain HTTP, neither reaches it). §HONEST NAME — this opens the
      // real API/account settings window (renderer/settings.html), not
      // a per-agent prompt/behavior editor; no such per-agent editor
      // exists in this codebase today, so the context menu below calls
      // this "Open agent settings," not "agent suite," to not overclaim
      // what it actually opens.
      // §BUILT 2026-09-12 — James: "all systems and commands." Checked
      // docs/command-index-per-system.spec directly first: only
      // clear-glass's command index is real and built today
      // (`[IPC] real command index written — 68 real commands`,
      // confirmed in this session's own boot log) — guardian/ollama/
      // idearium/bridge equivalents are `status: specced`, explicitly
      // NOT built per that spec's own phase markers. Wiring dropdowns
      // for those would be fabricating a data source that doesn't
      // exist. This route exposes the one real index that does,
      // written to disk by ipc/bridge.js's _writeCommandIndex() but
      // previously only reachable via IPC (same-process-only), never
      // over plain HTTP from a separate page.
      if (u === '/commands' && req.method === 'GET') {
        try {
          const fs = require('fs'), path = require('path');
          const indexPath = path.join(__dirname, '..', '..', '..', 'data', 'clear-glass', 'command-index.json');
          const raw = fs.readFileSync(indexPath, 'utf8');
          res.writeHead(200);
          return res.end(raw);
        } catch (e) {
          res.writeHead(404);
          return res.end(JSON.stringify({ ok: false, error: `command index not yet written: ${e.message}` }));
        }
      }

      if (u === '/window/settings' && req.method === 'POST') {
        openSettingsWindow();
        return res.end(JSON.stringify({ ok: true }));
      }

      if (u === '/userscripts/list' && req.method === 'GET') {
        if (!userscripts) { res.writeHead(503); return res.end(JSON.stringify({ ok: false, error: 'userscripts manager not initialized' })); }
        return res.end(JSON.stringify({ ok: true, scripts: userscripts.list(parsed || {}) }));
      }
      if (u === '/userscripts/toggle' && req.method === 'POST') {
        if (!userscripts) { res.writeHead(503); return res.end(JSON.stringify({ ok: false, error: 'userscripts manager not initialized' })); }
        const { scriptId, enabled } = parsed;
        if (!scriptId || typeof enabled !== 'boolean') { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'scriptId and a real boolean enabled required' })); }
        try {
          const result = userscripts.toggle(scriptId, enabled);
          return res.end(JSON.stringify({ ok: true, ...result }));
        } catch (e) {
          res.writeHead(404);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // §BL28/BL29 2026-08-23 — James: "background tabs feature... in
      // the settings... right click on a tab... move it to the
      // background." Real backend exposure for ProviderHost's already-
      // real show(providerId)/hide(providerId) — confirmed directly by
      // reading them before wiring this, not invented. This is the
      // real primitive BL29's future right-click menu will call; also
      // genuinely useful on its own, right now, as a real agent tool
      // action (co-pilot can already say "move claude to the
      // background" once this is wired to a real tool).
      if (u === '/provider/move-to-background' && req.method === 'POST') {
        const { providerId } = parsed;
        if (!providerId) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'providerId required' })); }
        const ok = providerHost.hide(providerId);
        return res.end(JSON.stringify({ ok, providerId }));
      }
      if (u === '/provider/bring-to-foreground' && req.method === 'POST') {
        const { providerId } = parsed;
        if (!providerId) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'providerId required' })); }
        const ok = providerHost.show(providerId);
        return res.end(JSON.stringify({ ok, providerId }));
      }

      // §PHASE-2 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md
      // item 3: on-demand userscript hot-reload into an already-running
      // provider tab. Reuses the exact same real _inject() path the
      // existing 60s reload timer already calls — this route is the
      // on-demand trigger for it, same real mechanism, not a new one.
      if (u === '/provider/deploy' && req.method === 'POST') {
        const { providerId } = parsed;
        if (!providerId) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'providerId required' })); }
        const result = await providerHost.deploy(providerId);
        if (!result.ok) res.writeHead(502);
        return res.end(JSON.stringify(result));
      }

      // ErosmancerOS proxy
      if (u.startsWith('/eros/')) {
        const erosPath = '/api' + u.replace(/^\/eros/, '');
        const up = await _proxyEros(req.method, erosPath, parsed);
        res.writeHead(up.status);
        return res.end(JSON.stringify(up.body));
      }

      // ClearDriver → ErosmancerOS action bridge (see _resolveErosTab above)
      if (u === '/bridge/driver' && req.method === 'POST') {
        const { action, agentId, selector, tag = 'div', text, url, code, currentUrl, ...args } = parsed;

        if (action === 'navigate') {
          const tab = await _resolveErosTab(agentId, currentUrl);
          if (!tab?.tabId) { res.writeHead(502); return res.end(JSON.stringify({ ok: false, error: 'No matching Eros CDP target — is remote-debugging-port open and is Eros connected to it?' })); }
          const up = await _proxyEros('POST', '/api/execute', { action: 'navigate', tabId: tab.tabId, payload: url }, 30000);
          res.writeHead(up.status);
          return res.end(JSON.stringify(up.body));
        }

        const tab = await _resolveErosTab(agentId, currentUrl);
        if (!tab) { res.writeHead(502); return res.end(JSON.stringify({ ok: false, error: 'No matching Eros CDP target for this agent' })); }

        if (action === 'register') {
          const reg = await _proxyEros('POST', '/api/nodes', { tag, tabId: tab.tabId, selector }, 8000);
          res.writeHead(reg.status);
          return res.end(JSON.stringify(reg.body));
        }

        let uuid = args.uuid || args.nodeUuid;
        if (!uuid && selector) {
          const reg = await _proxyEros('POST', '/api/nodes', { tag, tabId: tab.tabId, selector }, 8000);
          if (reg.status >= 400) { res.writeHead(reg.status); return res.end(JSON.stringify(reg.body)); }
          uuid = reg.body?.node?.uuid;
        }
        if (!uuid) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'uuid or selector required' })); }

        const payload = action === 'type' ? text : (action === 'evaluate' ? code : undefined);
        const up = await _proxyEros('POST', '/api/execute', { action, uuid, tabId: tab.tabId, payload }, 30000);
        res.writeHead(up.status);
        return res.end(JSON.stringify(up.body));
      }

      // Hostile detection → SISO bus (direct emit, no HTTP round-trip)
      if (u === '/hook/hostile' && req.method === 'POST') {
        const { level, type, tabId, recommendation } = parsed;
        console.log(`[ClearGlass/Wire] Hostile: ${type} (${level}) tab=${tabId}`);
        if (level === 'high' || level === 'critical') {
          emit('context.fp.switch', { agentId: tabId, mode: 'firefox', reason: `hostile:${type}` });
        }
        _postEvent('eros.hostile.detected', { level, type, tabId, recommendation });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Behavior plan → Cortex intelligence
      if (u === '/hook/behavior' && req.method === 'POST') {
        const { planId, profile, variant, meta } = parsed;
        _postEvent('eros.behavior.plan', { planId, profile, variant, meta });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Open URL in Clear Glass — orchestrator calls this instead of default browser
      // POST /open { url: 'http://...', agentId: optional }
      //
      // §BUGFIX 2026-07-04: this used to default agentId to a fresh
      // `nexus-${Date.now()}` every time, with no check for whether a
      // window already showed the same URL — so the default boot window
      // (agentId:'default', opened at startup) and the orchestrator's
      // wire-triggered "open NEXUS UI" call (hitting this same /open
      // endpoint moments later) each got their own window, both showing
      // the same NEXUS UI. openAgentWindow()'s dedup-by-agentId couldn't
      // help since the two calls never shared an agentId — and reusing
      // 'default' blindly isn't safe either: its existing-window branch
      // only calls .show(), it never navigates, so a reused-but-blank
      // window would just stay blank instead of loading the requested URL.
      // Real fix: check whether *any* open window already shows this
      // origin before creating a new one, and focus that one instead.
      if (u === '/open' && req.method === 'POST') {
        const { url: openUrl, agentId: openAgent } = parsed;
        if (!openUrl) { res.writeHead(400); return res.end(JSON.stringify({ error: 'url required' })); }
        try {
          // §BUGFIX 2026-07-04 (round 2): the previous fix here only ran
          // when NO agentId was passed — but orchestrator's real boot call
          // always sends agentId:'nexus-home' explicitly (checked the
          // actual caller this time, not assumed). That guard meant this
          // entire origin-check/reuse block was dead code for the one
          // call that actually mattered — the boot-time open always fell
          // straight through to openAgentWindow() with a brand-new
          // agentId, creating a second real window every single time.
          // Removed the guard: check for an existing window on this
          // origin FIRST, always, regardless of what agentId (if any)
          // the caller asked for.
          let targetOrigin = null;
          try { targetOrigin = new URL(openUrl).origin; } catch (_) {}
          if (targetOrigin) {
            for (const [wid, win] of windows) {
              if (win.isDestroyed()) continue;
              let currentOrigin = null;
              try { currentOrigin = new URL(win.webContents.getURL()).origin; } catch (_) {}
              if (currentOrigin === targetOrigin) {
                win.show(); win.focus();
                return res.end(JSON.stringify({ ok: true, agentId: wid, url: openUrl, reused: true }));
              }
            }
          }
          // Boot race: the default window opens at about:blank (or
          // whatever defaultStartUrl is) before this wire call ever
          // arrives, so the origin check above can't match it yet.
          // Navigate it in place instead of opening a second window —
          // regardless of what agentId this specific /open call asked
          // for, 'default' is the one real window that already exists.
          const defaultWin = windows.get('default');
          if (defaultWin && !defaultWin.isDestroyed()) {
            defaultWin.webContents.send('cg:navigate', openUrl);
            defaultWin.show(); defaultWin.focus();
            return res.end(JSON.stringify({ ok: true, agentId: 'default', url: openUrl, navigated: true }));
          }
          const aid = openAgent || `nexus-${Date.now()}`;
          openAgentWindow({ agentId: aid, url: openUrl }).catch(() => {});
          return res.end(JSON.stringify({ ok: true, agentId: aid, url: openUrl }));
        } catch(e) {
          res.writeHead(500);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  await new Promise((resolve, reject) => {
    _wireServer.listen(WIRE_PORT, '127.0.0.1', resolve);
    _wireServer.on('error', reject);
  });

  console.log(`[ClearGlass/Wire] :${WIRE_PORT} ready — Eros:${EROS_PORT} ↔ NEXUS:${NEXUS_PORTS.orchestrator}`);
}

async function bootstrap() {
  console.log(`[ClearGlass v${CG_VERSION}] Boot — ${MODULE_UUID}`);

  // 0. SISO bus
  const bus = createBus('EVENTS');
  console.log('[ClearGlass] SISO bus →E→E→');

  // 0.1 Network subsystem — §RETIRED 2026-09-06, James: "DNS/firewall/
  // crypto/host-rotation is redundant and should be deleted." Only
  // pulse-registry remains (src/mesh/agent-mesh.js's real node-pulse
  // dependency) — everything else archived, see src/network/install.js's
  // header for the full record.
  try { require('../network/install.js').install(bus); }
  catch (err) { console.error('[ClearGlass] network/install.js failed:', err.message); }

  // 1. TLS proxy — Firefox JA4 rewrite
  const tlsProxy = new TlsProxy({ port: TLS_PORT });
  await tlsProxy.start();
  console.log(`[ClearGlass] TLS proxy :${TLS_PORT}`);

  // 2. Fingerprint engine
  fp = new FingerprintEngine();
  await fp.load();

  // 3. Cookie vault
  const vault = new CookieVault();
  await vault.init();

  // 3.5. Global session CSP — allow NCP userscripts to connect to localhost
  // Guardian NCP uses http://127.0.0.1 from https:// pages (Private Network Access)
  // We need to allow this in the Electron session
  const { session: electronSession } = require('electron');
  const { applyCspBypass } = require('../contexts/session-headers');
  applyCspBypass(electronSession.defaultSession);

  // Scrub Electron/Node identifiers from the default session UA
  // This is a safety net — agent windows should use their own partitions,
  // but the default session must never advertise 'Electron' to any site.
  (() => {
    const rawUA = electronSession.defaultSession.getUserAgent();
    // Strip ' Electron/X.Y.Z' and ' Node.js/X.Y.Z' tokens
    const cleanUA = rawUA
      .replace(/\s+Electron\/[\d.]+/gi, '')
      .replace(/\s+Node\.js\/[\d.]+/gi, '')
      .replace(/\s+node\.js\/[\d.]+/gi, '')
      .replace(/\s+node\/[\d.]+/gi, '')
      .trim();
    electronSession.defaultSession.setUserAgent(cleanUA);
    // Also override via app.userAgentFallback (belt + suspenders)
    app.userAgentFallback = cleanUA;
  })();

  // 4. Context manager — one Chromium partition per agent
  ctxMgr = new ContextMgr({ fp, vault, sse: { emit: (t, d) => emit(t, d) }, tlsProxyPort: TLS_PORT });
  await ctxMgr.init();

  // 5. DOM archaeology — live DOM mesh via MutationObserver IPC
  const dom = new DomArchaeology({ sse: { emit: (t, d) => emit(t, d) } });

  // 6. ClearDriver — sovereign automation, no Playwright
  driver = new ClearDriver({ ctxMgr, dom, vault, sse: { emit: (t, d) => emit(t, d) } });

  // 7. URL listener — glob/regex per-agent request hooks
  urlListener = new UrlListener({ sse: { emit: (t, d) => emit(t, d) }, ctxMgr });

  // 8. API settings — sovereign config store
  apiSettings = new ApiSettings();
  await apiSettings.load();

  // 8.5. Nexus options — window behavior + defaults, bus + UI controllable
  nexusOptions = new NexusOptions();
  await nexusOptions.load();

  // 8.6. Bookmark store
  bookmarks = new BookmarkStore();
  await bookmarks.load();

  // 8.7. Rewind engine — wired to bus nav events
  rewind = new RewindEngine({
    vault,
    driver,
    ctxMgr,
    sse: { emit: (t, d) => emit(t, d) },
    busOn: (type, fn) => on(type, fn),
  });
  await rewind.init();

  // 8.8. Provider host — NCP auto-host (Guardian userscripts in CG webviews)
  // §fix 2026-06-30 — "strip it of the userscripts, not supposed to be
  // baked in." Was: `process.env.GUARDIAN_DIR || path.join(__dirname,
  // '../../../guardian')` — a second, independent copy of the same
  // hardcoded sibling-folder assumption removed from providers/host.js
  // above. No fallback now; GUARDIAN_DIR must be set explicitly.
  providerHost = new ProviderHost({
    guardianDir: process.env.GUARDIAN_DIR || null,
    sse:         { emit: (t, d) => emit(t, d) },
    postEvent:   (type, data) => _postEvent(type, data),
    history:     history,
  });
  // §WIRED 2026-08-22 — James: "listens for the co-pilot response and
  // injects it into the corresponding agent chat using clearglass."
  // Real close of the loop — see src/copilot/wake-relay.js for the full
  // real chain this completes.
  require('../copilot/wake-relay.js').startWakeRelay(providerHost, {
    mesh, log: (m) => console.log(m),
    // §WIRED 2026-09-11 — reuse the same real NEXUS_PORTS.guardian this
    // file already uses everywhere else, instead of letting wake-relay
    // fall back to its own hardcoded default and silently drift from it.
    guardianHost: '127.0.0.1', guardianPort: NEXUS_PORTS.guardian,
  });
  // §P-CG-01 — NCP provider tabs (claude, chatgpt, gemini, perplexity),
  // each its own persistent session partition + Guardian userscript
  // injected via executeJavaScript, replacing Tampermonkey + manual tab
  // management. Boot is lazy by default now — see the fix note below.
  // §BUG FIXED 2026-07-11 — this was unconditional: every boot spawned 4
  // hidden full Chromium renderer windows (claude/chatgpt/gemini/
  // perplexity), whether or not any of them were about to be used.
  // src/gates/index.js already supports booting a provider on-demand the
  // moment something actually needs it (`ph.start(providerId, ...)`) —
  // auto-boot-all was pure eager duplication of a lazy path that already
  // works. Default is now lazy-only (no pre-warm at all); set
  // CG_AUTOBOOT_PROVIDERS to a comma-list ('claude,chatgpt') to pre-warm
  // specific ones, or 'all' for the old behavior back.
  // §fix 2026-07-15 — lazy-only was the wrong default for this setup:
  // Guardian's whole point is these four userscripts actually running and
  // holding an NCP connection, which can't happen if nothing ever boots
  // them until some other code path happens to call ph.start(). Default
  // now pre-warms the four Guardian-supported providers hidden in the
  // background on every boot. Still fully overridable — set
  // CG_AUTOBOOT_PROVIDERS=none to go back to lazy-only, or a specific
  // comma-list / 'all' to change which ones boot.
  // §CHANGED 2026-09-12 — the 07-15 concern above is now actually solved
  // properly, not worked around: guardian/lib/dispatcher.js's own
  // not-connected branch (guardian.tab.needed) now really calls
  // POST /providers/:id/start on this exact process the moment a job
  // needs a provider that isn't up (verified idempotent — start() on an
  // already-running provider is a real, cheap no-op, not a double-spawn).
  // James: "only have chatgpt open. the other 3 event driven." Default
  // narrowed to chatgpt alone; claude/gemini/perplexity now genuinely
  // boot on first real dispatch instead of unconditionally at every
  // startup — the real RAM cost this was built to cut (3 fewer resident
  // Chromium renderer processes at boot, in the common case where they
  // don't all get used every session).
  const autoBootSetting = (process.env.CG_AUTOBOOT_PROVIDERS || 'chatgpt').trim();
  if (autoBootSetting === 'none' || autoBootSetting === '') {
    console.log('[ClearGlass] NCP auto-boot: skipped (lazy-only — providers start on first real use). Set CG_AUTOBOOT_PROVIDERS to pre-warm specific providers.');
  } else {
    const only = autoBootSetting === 'all' ? null : autoBootSetting.split(',').map(s => s.trim()).filter(Boolean);
    providerHost.autoBootAll({ show: false, only }).then(results => {
      const ok  = results.filter(r => r.ok).length;
      const bad = results.filter(r => !r.ok).map(r => r.providerId);
      console.log(`[ClearGlass] NCP auto-boot: ${ok}/${results.length} providers started${bad.length ? ` (failed: ${bad.join(', ')})` : ''}`);
      _postEvent('clear-glass.providers.booted', { ok, total: results.length, failed: bad });
    }).catch(e => {
      console.warn('[ClearGlass] NCP auto-boot failed:', e.message);
    });
  }

  // 8.9. Userscript manager
  // §fix 2026-06-30 — third real instance of the same hardcoded path,
  // independent from ProviderHost's. No fallback now.
  userscripts = new UserscriptManager({
    guardianDir: process.env.GUARDIAN_DIR || null,
    driver,
    sse: { emit: (t, d) => emit(t, d) },
  });
  await userscripts.init();

  // 8.95. Site settings — §NEW 2026-08-24, real gap named in
  // CLEAR-GLASS-FULL-CHROME-MAP-2026-08-23.md's §4.
  siteSettings = new SiteSettingsStore();
  siteSettings.load();

  // 8.955. History — §GAP CLOSED 2026-08-30, real IPC-only registry
  // entry that had zero implementing code anywhere in this lineage.
  history = new HistoryStore();
  history.load();

  // 8.957. Autofill — §BUILT 2026-09-19, James: "autofill." Real,
  // separate store from Accounts/passwords — see that file's own
  // header for why an AutofillProfile is a distinct real entity, not
  // a field bolted onto Account.
  autofillStore = new AutofillStore();
  autofillStore.load();

  // 8.96. Downloads — §NEW 2026-08-24, real gap named in the same map's §3.
  downloads = new DownloadsStore();
  downloads.load();

  // 8.96.1 — §NEW 2026-09-03: bridge regular-window downloads into
  // guardian's real intake/artifacts pipeline. Installed once, process-
  // wide (the bus event already carries agentId per-download — this is
  // not per-session wiring like adapter.js/download-capture.js, which
  // attach to one specific session each). See intake-bridge.js's header
  // for why this didn't already happen: download-capture.js only ever
  // covers persist:ncp-<id> provider sessions, never a plain agent
  // window's persist:agent-<id> session.
  try { require('../downloads/intake-bridge').install({}); }
  catch (err) { console.warn('[ClearGlass/Downloads] intake-bridge install failed:', err.message); }

  // 8.97. Passwords — §NEW 2026-08-24, real gap named in the same map's §7.
  passwordVault = new PasswordVault();
  passwordVault.load();

  // 9. Co-pilot — Cortex-wired, CFR-logged, DOM-aware
  const copilot = new CoPilotBridge({
    sse:         { emit: (t, d) => emit(t, d) },
    apiSettings,
    postEvent:   _postEvent,
  });

  // 10. Agent mesh — Claude, ChatGPT, Gemini, Perplexity, Mistral, Grok
  // §PHASE-3 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md item 6:
  // `accounts: nexusOptions` is what turns every hardcoded accountId:
  // 'default' inside agent-mesh.js into a real, stable, per-agentKey
  // account uuid (auto-created on first use, persisted in
  // nexus-options.json). nexusOptions is already loaded by 8.5, well
  // before this line — real ordering, not assumed.
  // §FIX 2026-09-06 — "hook in the agent mesh in clearglass, and
  // guardian." Real gap found before touching anything: this was a
  // local `const mesh`, inaccessible outside bootstrap()'s own scope —
  // invisible to _startWire()'s HTTP server, same reason /dom/query
  // etc. can reach providerHost (a shared module-level singleton, line
  // 163) but nothing could reach mesh.route() directly. Assigned to
  // the shared singleton instead of declared locally so a real,
  // direct HTTP entry point (added below, POST /agent-mesh/route and
  // GET /agent-mesh/view) can actually call it.
  mesh = new AgentMesh({ ctxMgr, driver, vault, accounts: nexusOptions, sse: { emit: (t, d) => emit(t, d) } });
  await mesh.init();

  // §BUILT 2026-09-23 — login portals: per-account provider sign-in in the
  // SAME partition + vault key agent-mesh spawn() reads (src/accounts/login-portal.js).
  // §BUILT 2026-09-23 (v0.39.227) — Clear Glass's intake for guardian jobs: only
  // jobs guardian CLAIMED for Clear Glass on their .job are taken in (read back
  // through guardian's own /jobs?id=), each with a durable <jobId>.intake record
  // in Clear Glass's own data dir. See src/jobs/intake.js for why push-with-claim,
  // not a watch on guardian's folder.
  {
    const { createJobIntake, guardianJobFetcher } = require('../jobs/intake');
    const guardianPort = (apiSettings && apiSettings.get && apiSettings.get().guardianPort) || NEXUS_PORTS.guardian;
    jobIntake = createJobIntake({
      dir: path.join(process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'job-intake'),   // same root as the vaults
      fetchGuardianJob: guardianJobFetcher({ port: guardianPort }),
      sendViaDom: (a) => mesh.sendViaDom(a),
      getDomJob: (id) => mesh.getDomJob(id),
      log: (m) => console.log(m),
    });
    jobIntake.recover();
  }

  const { LoginPortal } = require('../accounts/login-portal');
  loginPortal = new LoginPortal({
    options: nexusOptions, vault, passwordVault, registry: () => mesh.getRegistry(),
    BrowserWindow, session, emit: (t, d) => emit(t, d),
  });

  // §BUILT — James: "deepseek as a ncp provider and open in the background
  // in clearglass." Every other real provider only ever opens on-demand,
  // inside spawn()'s own on-demand path (mesh.route()'s "spawn fresh if
  // none healthy" branch) — no provider has ever been proactively opened at
  // boot before. Real, minimal boot-time background spawn, deepseek only
  // (not applied to the other 5 registry agents — not asked for, and
  // opening every registered agent's tab on every boot would be a real,
  // unwanted resource/behavior change to existing installs). Best-effort:
  // never blocks or fails boot (§1.2) — a dead deepseek tab just falls back
  // to on-demand spawn() the same as before this existed.
  mesh.spawn('deepseek').catch((e) => emit('mesh.boot_spawn.error', { agentKey: 'deepseek', error: e.message }));

  // 11. Diagnostic engine — Playwright-equivalent on ClearDriver
  const diag = new DiagnosticEngine({ driver, dom, sse: { emit: (t, d) => emit(t, d) } });
  await diag.init();

  // 12. Register all gates on bus
  registerAll(bus, {
    driver,
    dom,
    ctxMgr,
    vault,
    copilot,
    mesh,
    diag,
    urlListener,
    openFn:      openAgentWindow,
    closeFn:     closeAgentWindow,
    minimizeFn:  minimizeAgentWindow,
    hideFn:      hideAgentWindow,
    maximizeFn:  maximizeAgentWindow,
    getStatusFn: getStatus,
    postEvent:   _postEvent,
    options:     nexusOptions,
    bookmarks,
    history,
    autofillStore,
    rewind,
    providerHost,
    userscripts,
    siteSettings,
    passwordVault,
    speech,
  });

  // 12.5. Plugin system — §NEW 2026-08-24. Real gap James caught directly
  // ("as plugins right?"): every plugin built this session (adblocker,
  // captcha-pause, guardian-listeners) was real and tested in isolation
  // (throwaway `node -e` scripts constructing their own PluginHost), but
  // nothing here ever actually instantiated PluginHost or installed them
  // — the real, running app had zero knowledge any of this existed.
  // Instantiated after registerAll() specifically because PluginHost.
  // install() for a 'userscript' contribution emits userscript.create and
  // needs that gate to already be registered — checked the ordering
  // directly rather than assuming it would just work.
  pluginHost = new PluginHost();
  // §BUILT 2026-09-26 — Chrome WebExtensions (src/plugins/webextensions.js):
  // registry from JAA, loaded into the default session now and into every
  // persistent session (each tab's persist:agent-* partition) as it's made.
  try {
    const { WebExtensionHost } = require('../plugins/webextensions');
    webExtensions = new WebExtensionHost({ session, app });
    webExtensions.load();
    webExtensions.attach();
    const n = webExtensions.records.filter(r => r.enabled).length;
    if (n) console.log(`[ClearGlass/WebExtensions] ${n} enabled extension(s) loading`);
  } catch (err) {
    console.error('[ClearGlass/WebExtensions] host failed to start:', err.message);
  }
  const BUILTIN_PLUGINS = ['adblocker', 'captcha-pause', 'guardian-listeners', 'zoom', 'permissions', 'passwords'];
  for (const dir of BUILTIN_PLUGINS) {
    try {
      const manifest = require(`../../plugins/${dir}/manifest.json`);
      const mod      = require(`../../plugins/${dir}/index.js`);
      pluginHost.install(manifest, mod);
      console.log(`[ClearGlass/Plugins] installed: ${dir}`);
    } catch (err) {
      // §COS-1 — loud, not silent: a plugin that fails to install is a
      // real, visible problem, not a swallowed error — but one bad
      // built-in plugin still shouldn't crash the whole app's boot.
      console.error(`[ClearGlass/Plugins] FAILED to install '${dir}': ${err.message}`);
    }
  }

  // Wire copilot to bus + dom after gates are registered
  if (copilot?.wire) {
    copilot.wire({
      busEmit:     (type, data) => emit(type, data),
      domGet:      async (agentId) => { try { return await dom.handleQuery({ agentId, tree: true }); } catch (_) { return null; } },
      driver,
      bookmarks,
      rewind,
      vault,
      ctxMgr,
      userscripts,
      providerHost,
    });
  }

  // Auto-inject matching userscripts on navigation
  on('nav.loaded', async (event) => {
    const { agentId, url } = event.data;
    if (agentId && url && userscripts) {
      // §BL24 2026-08-23 — James: "disable opening in the background on
      // startup." Real, explicit skip, only when both are true: this
      // navigation is genuinely happening because of autoBootAll's own
      // startup pre-warm (providerHost.isStartupBoot), AND the person
      // has explicitly opted into this narrower behavior (default
      // false — unconditional auto-inject stays the real, exact
      // original behavior unless someone turns this on).
      if (providerHost?.isStartupBoot && nexusOptions?.data?.disableUserscriptAutoInjectOnStartup) {
        return;
      }
      const count = await userscripts.autoInject(agentId, url).catch(() => 0);
      if (count > 0) emit('userscript.auto-injected', { agentId, url, count });
    }
  });

  // 13. SSE server — subscribes to bus, broadcasts all events
  sse = new SseServer({ port: SSE_PORT, moduleId: MODULE_ID, moduleUuid: MODULE_UUID });
  await sse.start();

  // 13.5. Error capture — was MISSING entirely. diagnostic/engine.js is a
  // test runner, not an error monitor; lib/error-log.js (referenced in an
  // earlier session's notes) doesn't exist anywhere in this tree. Every
  // error this session — bridge handshake failures, the crash loop — only
  // ever existed as scattered console.error calls nobody could see live.
  const { ErrorCapture } = require('../diagnostic/error-capture');
  errorCapture = new ErrorCapture({ sse });
  errorCapture.init();
  errorCapture.installMainProcessHandlers();

  // The orchestrator's contract-handshake polls /contract on the *registered*
  // port (SSE_PORT — see _registerWithNexus below), not the IPC port. /contract
  // only existed on the IPC server until now, so every verification attempt
  // hit Express's default 404 HTML page and failed to parse as JSON
  // (observed: "contract.unreachable — clear-glass (invalid JSON: ...
  // <!DOCTYPE...")).
  sse.app.get('/contract', (req, res) => res.json(CONTRACT));
  console.log(`[ClearGlass] SSE server :${SSE_PORT}`);

  // 13.6. Process metrics — real answer to "what is actually running,"
  // not an assertion about it. See process-metrics.js's header for why
  // this exists now specifically.
  const { ProcessMetrics } = require('../diagnostic/process-metrics');
  processMetrics = new ProcessMetrics({ app, sse, providerHost });
  sse.app.get('/api/metrics', (req, res) => res.json(processMetrics.snapshot()));
  processMetrics.startPolling(5000);
  console.log('[ClearGlass] Process metrics live — GET /api/metrics or watch process.metrics on the SSE stream');

  // 14. NEXUS registration
  await _registerWithNexus();
  _startHeartbeat();
  _startAutopilotActivityHeartbeat();

  // 14.5. Wire — ErosmancerOS registration + :7704 HTTP server (non-fatal)
  _startWire().catch(err => console.warn(`[ClearGlass/Wire] start failed (non-fatal): ${err.message}`));

  // 15. IPC bridge — HTTP command endpoint :IPC_PORT + ipcMain handlers
  ipcBridge = new IpcBridge({
    port:        IPC_PORT,
    sse,
    errorCapture,
    ctxMgr,
    vault,
    apiSettings,
    urlListener,
    mesh,
    diag,
    fp,
    postEvent:   _postEvent,
    options:     nexusOptions,
    minimizeFn:  minimizeAgentWindow,
    hideFn:      hideAgentWindow,
    openFn:      openAgentWindow,
    maximizeFn:  maximizeAgentWindow,
    openSettingsFn: openSettingsWindow,
    closeSettingsFn: closeSettingsWindow,
    openLibraryFn: openLibraryWindow,
    closeLibraryFn: closeLibraryWindow,
    bookmarks,
    rewind,
    providerHost,
    userscripts,
    siteSettings,
    downloads,
    history,
    autofillStore,
    dom,
    passwordVault,
    speech,
    macroTool,
    pluginHost,
    driver,
    webExtensions,
    copilot,
    loginPortal,
  });
  await ipcBridge.start();
  // §5.2 Contract IS the bridge — serve /contract so orchestrator can verify us
  if (ipcBridge.app) {
    ipcBridge.app.get('/contract', (req, res) => res.json(CONTRACT));
    ipcBridge.app.get('/health', (req, res) => res.json({
      ok: true, system: MODULE_ID, version: CG_VERSION,
      ssePort: SSE_PORT, ipcPort: IPC_PORT, tlsPort: TLS_PORT, ts: Date.now(),
    }));
    // §MCO19 2026-09-13 — James: "get it done" on ClearGlass as a real RAID
    // PROCESSING destination. This is the real, external (HTTP, not IPC)
    // entry point RAID needs to tag the live DOM stream (MCO10) with a
    // real compartment uuid before dispatching real browser work via
    // POST /cmd — same direct-function-call convention already used by
    // /cli/bgtab above (require('../main/index').listBackgroundTabs?.()),
    // not a new pattern. Calls the same real, shared module-level state
    // archaeology.js's own ipcMain.handle('compartment:set-active', ...)
    // already uses — one real state, two real entry points.
    // §BUILT 2026-09-23 — James: "yes clearglass". Clear Glass is the one
    // account authority; guardian's dispatch ladder asks here instead of
    // keeping a second account list (guardian/lib/cg-account-authority.js).
    // Read-only, never auto-creates (resolveAccountForDispatch's contract).
    ipcBridge.app.get('/accounts/resolve', (req, res) => {
      const provider = String(req.query.provider || '');
      if (!provider) return res.status(400).json({ ok: false, error: 'provider required' });
      const r = nexusOptions.resolveAccountForDispatch(provider, req.query.account ? String(req.query.account) : null);
      if (r.error) return res.status(404).json({ ok: false, error: r.error, code: r.code });
      res.json({ ok: true, provider, ...r });
    });
    ipcBridge.app.get('/accounts', (req, res) => res.json({ ok: true, accounts: nexusOptions.listAccounts().map(a => ({ id: a.id, label: a.label, agentKeys: a.agentKeys, providers: Object.keys(a.providerAccounts || {}) })), defaults: nexusOptions.get().accountDefaults || {} }));
    ipcBridge.app.post('/compartment/set-active', (req, res) => {
      try {
        const { setActiveCompartment } = require('../dom/archaeology');
        res.json(setActiveCompartment(req.body?.compartmentUuid, req.body?.queueId));
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });
    ipcBridge.app.get('/options', (req, res) => res.json(nexusOptions?.get() || {}));
    ipcBridge.app.get('/status', (req, res) => res.json(getStatus ? getStatus() : { ok: true }));
    // §BUILT 2026-09-08 — James: "all of the clearglass features;
    // plugins, all of it." Real, confirmed gap: pluginHost (real
    // list()/disable(), already used internally at boot) had zero real
    // HTTP route reaching it — checked directly before building.
    // command-index.js's own tool (lib/agent-tools/tools/clear-glass/
    // command-index.js) discovers routes LIVE from this real Express
    // app's own route table, so these 2 real routes are all that's
    // needed — no new tool file, matching that file's own stated design
    // ("full compatibility... never needing to update THIS file when a
    // new command ships").
    ipcBridge.app.get('/plugins', (req, res) => res.json({ ok: true, plugins: pluginHost ? pluginHost.list() : [] }));
    ipcBridge.app.post('/plugins/:id/disable', (req, res) => {
      if (!pluginHost) { res.status(503).json({ ok: false, error: 'plugin host not initialized' }); return; }
      try {
        pluginHost.disable(req.params.id);
        res.json({ ok: true, id: req.params.id, state: 'disabled' });
      } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
      }
    });
    // §ADDED 2026-09-12 — James: "only have chatgpt open. the other 3
    // event driven." Real, confirmed gap this closes: guardian/lib/
    // dispatcher.js's own not-connected branch already emits
    // guardian.tab.needed (and queues the job correctly to flush once
    // connected) exactly when a job needs a provider that isn't booted —
    // but nothing was ever listening for it. providerHost.start() itself
    // already does everything needed (persistent session partition, GM
    // shim, userscript injection) — this is the missing HTTP door, not a
    // new spawn mechanism. Idempotent: start() on an already-running
    // provider is a real, cheap no-op (checked — ProviderHost tracks
    // live windows in this.windows, a second start() for the same id
    // returns the existing one rather than double-spawning).
    ipcBridge.app.post('/providers/:id/start', async (req, res) => {
      if (!providerHost) { res.status(503).json({ ok: false, error: 'provider host not initialized' }); return; }
      try {
        const result = await providerHost.start(req.params.id, { show: false });
        res.json(result);
      } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
      }
    });
  }
  console.log(`[ClearGlass] IPC bridge :${IPC_PORT}`);

  // 16. Active NEXUS probe — drives status dots in renderer via SSE
  _startNexusProbe();

  // ── Subscribe to orchestrator SSE — pick up clear-glass.open + system events ─
  _startOrchestratorSSE(copilot, emit);


  // 17. Tray
  buildTray(mesh);

  // 18. Default window (skipped in headless/tray-only mode)
  if (!HEADLESS) {
    await openAgentWindow({ agentId: 'default', url: nexusOptions.get().defaultStartUrl });
  } else {
    console.log('[ClearGlass] tray-only — no window opened. Use tray menu or co-pilot to open windows.');
  }

  // 19. Ready
  emit('lifecycle.ready', {
    uuid:       MODULE_UUID,
    version:    CG_VERSION,
    ssePort:    SSE_PORT,
    ipcPort:    IPC_PORT,
    tlsPort:    TLS_PORT,
    components: COMPONENTS.length,
  });
  _postEvent('clear-glass.boot.complete', { uuid: MODULE_UUID, version: CG_VERSION, ssePort: SSE_PORT });
  console.log(`[ClearGlass v${CG_VERSION}] ✓ Ready — SSE:${SSE_PORT} IPC:${IPC_PORT} TLS:${TLS_PORT} | ${COMPONENTS.length} components registered`);

  // ── Helpers closed over deps ──────────────────────────────────────────
  function getStatus() {
    return {
      uuid:      MODULE_UUID,
      version:   CG_VERSION,
      siso:      bus.sampleHere ? bus.sampleHere() : {},
      contexts:  ctxMgr.listIds ? ctxMgr.listIds() : [],
      agents:    mesh.listAgents ? mesh.listAgents() : [],
      listeners: urlListener.list ? urlListener.list() : [],
      tls:       tlsProxy.getStats ? tlsProxy.getStats() : {},
      nexusPorts: NEXUS_PORTS,
      ts:        Date.now(),
    };
  }
}

// ── Orchestrator SSE subscriber ──────────────────────────────────────────────
// Listens to orchestrator :9000/sse for:
//   clear-glass.open  → open a new agent window at the given URL
//   system.registered → rebuild blueprint-index awareness
//   copilot.*         → forward to co-pilot bridge (surfaces in tray)
//
// This is the mechanism by which openClearGlass() in the home UI
// actually opens a window — the UI calls POST /api/clear-glass/open on
// orchestrator, orchestrator broadcasts via SSE, Clear Glass picks it up here.
function _startOrchestratorSSE(copilot, busEmit) {
  const ORCH_PORT = NEXUS_PORTS.orchestrator;
  const connect = () => {
    try {
      const req = http.request({
        hostname: '127.0.0.1', port: ORCH_PORT,
        path: '/sse', headers: { Accept: 'text/event-stream' },
      }, res => {
        console.log('[ClearGlass] orchestrator SSE connected');
        let buf = '';
        res.on('data', chunk => {
          buf += chunk.toString();
          const parts = buf.split('\n\n'); buf = parts.pop() || '';
          for (const part of parts) {
            const line = part.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            try {
              const ev = JSON.parse(line.slice(5));
              _handleOrchestratorEvent(ev, copilot, busEmit);
            } catch(_) {}
          }
        });
        res.on('end', () => {
          console.log('[ClearGlass] orchestrator SSE disconnected — reconnecting in 3s');
          setTimeout(connect, 3000);
        });
      });
      req.on('error', () => setTimeout(connect, 5000));
      req.end();
    } catch(_) { setTimeout(connect, 5000); }
  };
  // Delay start to allow orchestrator to be up
  setTimeout(connect, 2500);
}

function _handleOrchestratorEvent(ev, copilot, busEmit) {
  const type = ev.type || '';

  // clear-glass.open — UI asked to open a URL in Clear Glass
  //
  // §BUGFIX 2026-07-04: same bug class as the /open HTTP handler fixed
  // earlier — this always minted a fresh randomUUID() agentId, so it never
  // matched an existing window and always spawned a new one, even for a
  // URL already open somewhere. Repeated clicks (or any UI path that fires
  // this more than once) pile up windows/navigations competing for the
  // same origin — the real cause behind ERR_ABORTED (-3) bursts on
  // http://127.0.0.1:9000/ showing up well after boot, not a boot-time race.
  if (type === 'clear-glass.open' && ev.url) {
    console.log(`[ClearGlass] open request from orchestrator SSE: ${ev.url}`);
    let targetOrigin = null;
    try { targetOrigin = new URL(ev.url).origin; } catch (_) {}
    if (targetOrigin) {
      for (const [wid, win] of windows) {
        if (win.isDestroyed()) continue;
        let currentOrigin = null;
        try { currentOrigin = new URL(win.webContents.getURL()).origin; } catch (_) {}
        if (currentOrigin === targetOrigin) { win.show(); win.focus(); return; }
      }
    }
    // §BUGFIX 2026-07-04 (round 2): this was missing the same
    // default-window-navigate tier the /open HTTP handler needed — the
    // origin check above can't match the default window while it's still
    // showing about:blank, so this always fell through to creating a
    // genuinely new window. Same fix as /open, applied here too.
    const defaultWin = windows.get('default');
    if (defaultWin && !defaultWin.isDestroyed()) {
      defaultWin.webContents.send('cg:navigate', ev.url);
      defaultWin.show(); defaultWin.focus();
      return;
    }
    openAgentWindow({ agentId: randomUUID(), url: ev.url })
      .catch(e => console.warn('[ClearGlass] open failed:', e.message));
    return;
  }

  // blueprint-index rebuilt — ingest into co-pilot stream
  if (type === 'nexus.blueprint.index.built') {
    if (busEmit) busEmit('nexus.blueprint.rebuilt', ev);
    return;
  }

  // system online/offline — update tray status (future: dynamic tray menu)
  if (type.startsWith('orchestrator.system.')) {
    if (busEmit) busEmit('nexus.system.status', ev);
    return;
  }

  // All other events → forward into co-pilot consciousness stream
  if (copilot?._ingestToNexus && type && !type.startsWith('heartbeat')) {
    copilot._ingestToNexus({ ...ev, source: 'orchestrator-sse' });
  }
}

// ── Active NEXUS probe — SSE-driven status, no hardcoded dots ─────────────
function _startNexusProbe() {
  const probe = async () => {
    const checks = await Promise.allSettled([
      _ncReq(NEXUS_PORTS.orchestrator, 'GET', '/health', null, 2500),
      _ncReq(NEXUS_PORTS.cortex,       'GET', '/health', null, 2500),
      _ncReq(NEXUS_PORTS.guardian,     'GET', '/health', null, 2500),
      _ncReq(NEXUS_PORTS.bridge,       'GET', '/health', null, 2500),
    ]);

    const [orch, cortex, guardian, bridge] = checks.map(c =>
      c.status === 'fulfilled' && c.value.ok
    );

    emit('nexus.status', {
      orchestrator: orch,
      cortex,
      guardian,
      bridge,
      all: orch && cortex,
      ts: Date.now(),
    });
  };
  probe();
  setInterval(probe, 10000);
}

// ── Tray ───────────────────────────────────────────────────────────────────
function buildTray(mesh) {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip(`Clear Glass v${CG_VERSION} — NEXUS Browser →E→E→`);
  _rebuildTrayMenu(mesh);
  tray.on('double-click', () => {
    const w = windows.values().next().value;
    if (w) { w.show(); w.focus(); }
  });
}

function _rebuildTrayMenu(mesh) {
  const agentItems = [...windows.entries()].map(([id, win]) => ({
    label: `⬡ ${id}`,
    click: () => { win.show(); win.focus(); },
  }));

  // Dynamic NEXUS status for tray label
  const modeLabel = HEADLESS ? ' [HEADLESS]' : '';
  const menuTemplate = [
    { label: `Clear Glass v${CG_VERSION}${modeLabel}`, enabled: false },
    { label: `NEXUS :9000 · Guardian :7820 · Copilot :3750`, enabled: false },
    { type: 'separator' },
    ...agentItems,
    ...(agentItems.length ? [{ type: 'separator' }] : []),
    { label: '⬡ New Agent Window',   click: () => openAgentWindow({ agentId: randomUUID() }) },
    { label: '⬡ Open claude.ai',     click: () => openAgentWindow({ agentId: randomUUID(), url: 'https://claude.ai/new' }) },
    { label: '⬡ Open Mistral Chat',  click: () => openAgentWindow({ agentId: randomUUID(), url: 'https://chat.mistral.ai' }) },
    { label: '⬡ Open ChatGPT',       click: () => openAgentWindow({ agentId: randomUUID(), url: 'https://chatgpt.com' }) },
    { label: '⬡ NEXUS Home UI',      click: () => openAgentWindow({ agentId: 'nexus-home', url: 'http://127.0.0.1:9000/ui/home/index.html' }) },
    // §NEW 2026-09-06 — James: "where is brainos ui. if the answer is
    // anything less than the way to access it. you're not done."
    // Same real pattern as NEXUS Home UI above — ui/brainos/index.html
    // (built this session; the module files existed but had no HTML
    // entry point and were sitting in a misplaced nexus/ wrapper
    // directory orchestrator's real UI_ROOT never reached) is now a
    // real, servable page at this exact URL.
    { label: '⬡ BrainOS',            click: () => openAgentWindow({ agentId: 'brainos', url: 'http://127.0.0.1:9000/ui/brainos/' }) },
    // §BUILT — James: "I want that exact ui... floating above, not
    // hardcoded or inline." Same real openAgentWindow() mechanism, a
    // separate real host page (ui/brainos-float/), not a mode flag on
    // the full-page BrainOS app above.
    { label: '⬢ BrainOS Float',      click: () => openAgentWindow({ agentId: 'brainos-float', url: 'http://127.0.0.1:9000/ui/brainos-float/' }) },
    // §BUILT 2026-09-21 — James: "the clearglass macros, autofill,
    // keyboard shortcuts... build them, then expand the ui, like it
    // should have been. index.html." ui/library/index.html (its shell,
    // six tabs including Macros) has existed since 2026-09-19 with a
    // header comment naming its own real precedent ("Same real
    // pattern... as ui/brainos/'s exact real precedent... Reached by
    // plain fetch()") and naming what was still missing: "library-app.js
    // itself and the openAgentWindow menu entry are NOT yet built." This
    // is that menu entry — library-app.js now exists (a 7th tab,
    // Autofill, added alongside it), same real openAgentWindow()
    // mechanism as every entry above, zero orchestrator changes needed
    // (UI_ROOT already serves ui/library/ generically, confirmed
    // directly against orchestrator.js before relying on it).
    // §LIBRARY 0.39.241 — the Library is its own Clear Glass window now (renderer/library.html,
    // the Settings runtime), no longer ui/library/ on :9000 inside an agent window.
    { label: '⬡ Library',            accelerator: 'CmdOrCtrl+J', click: () => openLibraryWindow('downloads') },
    { type: 'separator' },
    { label: 'NEXUS UI Audit',        click: () => emit('diag.nexus', { agentId: 'default' }) },
    { label: 'API Settings',          click: openSettingsWindow },
    { type: 'separator' },
    {
      label: 'Bus Log',
      click: () => {
        const { getLog } = require('../core/bus');
        console.log('[ClearGlass Bus]', JSON.stringify(getLog()?.sample(), null, 2));
      },
    },
    { label: 'Quit Clear Glass', click: () => app.quit() },
  ].filter(Boolean);

  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

// ── Window management ──────────────────────────────────────────────────────
async function openAgentWindow({ agentId = randomUUID(), url = 'about:blank' } = {}) {
  if (windows.has(agentId)) {
    windows.get(agentId).show();
    return windows.get(agentId);
  }

  // ── Fingerprinted partition ───────────────────────────────────────────
  // Every agent window gets its own isolated Chromium session with a
  // realistic Firefox UA — never 'Electron', never the default session.
  // ctxMgr.create() sets the UA + accept headers on the partition session.
  let partition = `persist:agent-${agentId}`;
  let spoofScript = '';
  if (ctxMgr) {
    try {
      await ctxMgr.create({ agentId, url });
      spoofScript = fp?.generateSpoofScript?.(agentId) || '';
    } catch(e) {
      console.warn(`[ClearGlass] context create failed for ${agentId}:`, e.message);
    }
  }

  // §NEW 2026-08-24 — the other half of the same gap James caught
  // ("as plugins right?"): the adblocker plugin was genuinely installed
  // (pluginHost.install() at boot registers its Gate on the bus) but
  // nothing ever called webrequest-adapter.js's attachContentFilters()
  // on a REAL session — an installed content-filter plugin that never
  // actually touches a request isn't a working adblocker, whatever its
  // own isolated tests showed. Wired here, at the exact point this
  // agent's real session is established, using the SAME
  // session.fromPartition(partition) pattern already proven in
  // providers/host.js's onHeadersReceived (checked directly before
  // reusing it). Generic, not adblocker-specific: getSignaturesForType
  // picks up ANY active plugin's content-filter contributions, so a
  // second content-filter plugin installed later needs zero changes
  // here.
  if (pluginHost) {
    try {
      const contentFilterSigs = pluginHost.getSignaturesForType('content-filter');
      if (contentFilterSigs.length > 0) {
        const { attachContentFilters } = require('../plugins/webrequest-adapter');
        attachContentFilters(session.fromPartition(partition), pluginHost.bus, {
          signatures: contentFilterSigs,
          // Settings → Site settings → "Content blocking: off for this site"
          exempt: (pageUrl) => siteSettings?.get(pageUrl, 'contentFilter') === 'off',
        });
      }
    } catch (err) {
      console.warn(`[ClearGlass/Plugins] content-filter wiring failed for ${agentId}:`, err.message);
    }
    try {
      // §NEW 2026-08-24 — same class of gap, same fix, for the
      // permissions plugin: real gap named in CLEAR-GLASS-FULL-CHROME-
      // MAP-2026-08-23.md's §9 (session.setPermissionRequestHandler
      // "doesn't exist in this tree at all"). Same generic pattern as
      // content-filter above — getSignaturesForType, not
      // permissions-plugin-specific, so any future permission-filter
      // plugin is picked up with zero changes here.
      const permissionSigs = pluginHost.getSignaturesForType('permission-filter');
      if (permissionSigs.length > 0) {
        const { attachPermissionFilters } = require('../plugins/permission-adapter');
        attachPermissionFilters(session.fromPartition(partition), pluginHost.bus, { signatures: permissionSigs, agentId });
      }
    } catch (err) {
      console.warn(`[ClearGlass/Plugins] permission-filter wiring failed for ${agentId}:`, err.message);
    }
  }

  // §NEW 2026-08-24 — real downloads capture for agent browsing sessions,
  // not just provider chat tabs (download-capture.js's attach() is only
  // ever called for persist:ncp-<id> partitions — checked directly,
  // confirmed a real, separate gap for regular browsing downloads).
  if (downloads) {
    try {
      const { attach: attachDownloads } = require('../downloads/adapter');
      attachDownloads({
        session: session.fromPartition(partition),
        agentId,
        store: downloads,
        getDownloadDirectory: () => nexusOptions?.get()?.downloadDirectory || null,
      });
    } catch (err) {
      console.warn(`[ClearGlass/Downloads] wiring failed for ${agentId}:`, err.message);
    }
  }

  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 800, minHeight: 600,
    frame: false, backgroundColor: '#08080d',
    webPreferences: {
      preload:          path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webviewTag:       true,
      partition,          // ← fingerprinted session; UA set by ctxMgr.create()
    },
    title: `Clear Glass — ${agentId}`,
    show:  false,
  });

  // Inject spoof script on every page load (canvas noise, WebGL, navigator)
  // Must run BEFORE page JS — use did-finish-load as a safety net too
  if (spoofScript) {
    win.webContents.on('did-finish-load', () => {
      win.webContents.executeJavaScript(spoofScript).catch(() => {});
    });
    // Also on navigation (SPA route changes don't fire did-finish-load)
    win.webContents.on('did-navigate-in-page', () => {
      win.webContents.executeJavaScript(spoofScript).catch(() => {});
    });
  }

  win.loadFile(path.join(__dirname, '../../renderer/browser.html'), {
    query: {
      agentId, ssePort: SSE_PORT, ipcPort: IPC_PORT, url: url || '',
      wvPreload: 'file://' + path.join(__dirname, '../preload/webview-bridge.js'),
    },
  });

  win.on('maximize',   () => emit('window.maximized', { agentId, maximized: true }));
  win.on('unmaximize', () => emit('window.maximized', { agentId, maximized: false }));

  win.once('ready-to-show', () => {
    win.show();
    // DevTools: F12 / Ctrl+Shift+I only — never auto-open
  });
  win.on('show', () => _touchAutopilotIfOpen());

  // F12 / Ctrl+Shift+I toggles renderer DevTools
  win.webContents.on('before-input-event', (event, input) => {
    const devToolsKey =
      input.key === 'F12' ||
      (input.control && input.shift && ['i','j'].includes(input.key.toLowerCase()));
    if (devToolsKey) {
      win.webContents.isDevToolsOpened()
        ? win.webContents.closeDevTools()
        : win.webContents.openDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });
  win.on('close', e => {
    // §axiom: tray-first — but now genuinely controllable via Nexus options
    // instead of hardcoded. If the option is off, this is a real close.
    if (nexusOptions?.get().hideToTrayOnClose ?? true) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => windows.delete(agentId));

  windows.set(agentId, win);
  emit('window.opened', { agentId });
  _postEvent('clear-glass.window.opened', { agentId });
  return win;
}

function closeAgentWindow({ agentId }) {
  windows.get(agentId)?.destroy();
  windows.delete(agentId);
}

// §BUILT 2026-08-18 — James: "huge idea, what about freezing the state of
// the tab using the state VM like system/rewind system?" Checked first:
// rewind/engine.js already captures real, substantial state per tab —
// cookies (via the vault), full localStorage/sessionStorage, scroll
// position, URL/title — for undo/rewind. This is the same real state a
// genuine freeze needs; the only new piece is USING it to justify
// actually destroying the real window, not just recording a checkpoint
// while the window (and its real memory) stays alive regardless.
//
// Real leverage, not speculative: this session's own earlier real
// investigation (Task Manager evidence) found Electron's real per-window
// process cost is genuine and non-trivial. A tab that's idle — a
// background provider nobody's looked at in a while — can have its real
// BrowserWindow destroyed, freeing that real memory, while this exact
// mechanism preserves enough to recreate it indistinguishably later.
//
// §0.1 — frozen is a real, honest state, not a euphemism for "gone."
// _frozenState tracks exactly what's needed to thaw correctly; nothing
// about freezing pretends the tab is still "open."
const _frozenState = new Map(); // agentId -> { snapshotId, url, frozenAt }

async function freezeAgentWindow({ agentId }) {
  const win = windows.get(agentId) || bgTabs.get(agentId);
  if (!win) return { ok: false, error: `no real, open window for agent "${agentId}" to freeze` };
  if (_frozenState.has(agentId)) return { ok: false, error: `agent "${agentId}" is already frozen` };

  let snapshot = null;
  try {
    if (rewind) snapshot = await rewind.snapshot(agentId, { label: 'auto-freeze' });
  } catch (e) {
    // §1.2 — a snapshot failure means freezing is genuinely unsafe (the
    // whole point is being able to thaw correctly), not something to
    // proceed past silently.
    return { ok: false, error: `real snapshot failed, refusing to freeze without one: ${e.message}` };
  }
  if (!snapshot) return { ok: false, error: 'rewind engine returned no real snapshot — refusing to freeze without a genuine restore point' };

  _frozenState.set(agentId, { snapshotId: snapshot.id, url: snapshot.url, frozenAt: Date.now() });
  closeAgentWindow({ agentId }); // the actual real memory reclamation — same, already-verified-safe destroy path
  return { ok: true, agentId, snapshotId: snapshot.id, url: snapshot.url };
}

async function thawAgentWindow({ agentId }) {
  const frozen = _frozenState.get(agentId);
  if (!frozen) return { ok: false, error: `agent "${agentId}" is not frozen` };

  // §FIXED, found by reading rewind.restore()'s real implementation before
  // shipping, not after: restore() calls driver.exec({action:'navigate'}),
  // which requires the window to ALREADY exist — it cannot work on a
  // genuinely frozen (destroyed) tab. The real, correct order is open
  // first, then restore layers cookies/storage/scroll on top of it.
  await openAgentWindow({ agentId, url: frozen.url });

  let restoreResult = null;
  try {
    if (rewind) restoreResult = await rewind.restore({ agentId, snapshotId: frozen.snapshotId });
  } catch (e) {
    // §1.2 — the window is real and open even if the deeper state
    // restore fails; report the partial result honestly rather than
    // pretend the whole thaw failed when the tab is genuinely usable.
    _frozenState.delete(agentId);
    return { ok: true, agentId, url: frozen.url, warning: `window reopened but state restore failed: ${e.message}` };
  }
  _frozenState.delete(agentId);
  return { ok: true, agentId, url: frozen.url, stateRestored: !!restoreResult };
}

function minimizeAgentWindow({ agentId }) {
  // Minimize to tray — hide from taskbar completely, not just minimize
  // This is what "minimize to tray" means — app still runs, no taskbar button
  const win = windows.get(agentId);
  if (win) win.hide(); // hide() removes from taskbar; minimize() keeps it there
}

function hideAgentWindow({ agentId }) {
  windows.get(agentId)?.hide();
}

function maximizeAgentWindow({ agentId }) {
  const win = windows.get(agentId);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
}

function focusAgentWindow({ agentId }) {
  const win = windows.get(agentId) || bgTabs.get(agentId);
  if (!win) return { focused: false };
  win.show();
  win.focus();
  return { focused: true };
}

function listOpenAgents() {
  return {
    windows: [...windows.keys()],
    bgTabs:  [...bgTabs.keys()],
  };
}

// Hide the entire app to tray (called when all windows hidden)
function hideAppToTray() {
  for (const win of windows.values()) { try { win.hide(); } catch(_) {} }
  // app itself stays running — tray icon remains
}

// ── Background tabs — same chrome as an agent window, never shown ─────────
// "Move to background tab" carries a URL into a hidden window under a new
// agentId, freeing the visible window to navigate elsewhere while the
// background context keeps running (mesh/automation use).
async function openBackgroundTab({ agentId, url = 'about:blank', partition } = {}) {
  agentId = agentId || randomUUID();
  if (bgTabs.has(agentId)) { bgTabs.get(agentId).focus?.(); return { agentId, url, reused: true }; }

  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 800, minHeight: 600,
    frame: false, backgroundColor: '#08080d',
    webPreferences: {
      preload:          path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webviewTag:       true,
      // §BUGFIX 2026-08-30 — real, confirmed gap found while wiring
      // agent-mesh.js to use this function (James: "the agent mesh
      // needs to be the hub... it doesn't need to use a window... runs
      // tabs in the background"): this had NO session/partition
      // isolation at all — every real background tab shared Electron's
      // default session, meaning two accounts for the same agent would
      // have silently shared cookies. agent-mesh.js's own, now-replaced
      // ctxMgr-based approach WAS providing real multi-account
      // isolation; this real partition option preserves that property
      // instead of trading it away for the real userscript/NCP benefit
      // background tabs otherwise provide. undefined (the default) when
      // no partition is given — every existing real caller (bookmarks'
      // with-state open, etc.) is completely unaffected.
      partition:        partition || undefined,
    },
    title: `Clear Glass — ${agentId} (background)`,
    show: false,
  });

  win.loadFile(path.join(__dirname, '../../renderer/browser.html'), {
    query: {
      agentId, ssePort: SSE_PORT, ipcPort: IPC_PORT, url: url || '',
      wvPreload: 'file://' + path.join(__dirname, '../preload/webview-bridge.js'),
    },
  });

  win.on('closed', () => { bgTabs.delete(agentId); bgTabUrls.delete(agentId); });
  bgTabs.set(agentId, win);
  bgTabUrls.set(agentId, url);
  emit('bgtab.opened', { agentId, url });
  _postEvent('clear-glass.bgtab.opened', { agentId, url });
  // §FIX 2026-08-30 — real session reference added to the return value,
  // alongside the partition fix above: agent-mesh.js's real cookie
  // restoration (clear-glass/src/cookies/vault.js's restore()) requires
  // a real, live session object to actually apply cookies — without
  // one it correctly, honestly degrades to {restored:false}, silently
  // losing real functionality rather than crashing. Every existing real
  // caller ignores this new field (adding a field to a return object
  // never breaks a caller that only reads the fields it already used).
  return { agentId, url, session: win.webContents.session };
}

function closeBackgroundTab(agentId) {
  const win = bgTabs.get(agentId);
  if (win) { win.destroy(); bgTabs.delete(agentId); bgTabUrls.delete(agentId); }
  emit('bgtab.closed', { agentId });
  return { agentId, closed: !!win };
}

function listBackgroundTabs() {
  // §HONEST — no title field: win.getTitle() on the top-level window
  // would just echo the static "Clear Glass — <agentId> (background)"
  // set at creation (browser.html loads INSIDE it, and the real target
  // page loads inside THAT webview) — reaching the real inner page
  // title needs IPC into that specific renderer, a real, separate
  // piece not built this pass. Shipping a fake-looking-real title field
  // would be worse than no field at all.
  return [...bgTabs.keys()].map(agentId => ({
    agentId,
    url: bgTabUrls.get(agentId) || null,
  }));
}

// ── Settings window — single instance, reused/focused rather than
//    re-created, with a real close path the renderer can call ────────────
let settingsWin = null;

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    // §2026-09-23 — rebuilt Settings (rail + sections) needs room; still usable narrow (responsive CSS).
    width: 1180, height: 820, minWidth: 640, minHeight: 480, backgroundColor: '#08080d',
    frame: false,
    webPreferences: {
      preload:          path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    title: 'Clear Glass — Settings',
  });
  settingsWin.loadFile(path.join(__dirname, '../../renderer/settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
  settingsWin.on('show', () => _touchAutopilotIfOpen());
}

function closeSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
}

// ── Library window — §LIBRARY 0.39.241 ─────────────────────────────────────
// James: "need control j to popout a window like the screenshot. thats what it
// was supposed to look like, the settings ui but with the library."
// Same shape as the Settings window above — frameless, single instance, the
// preload — because the page is the Settings runtime (renderer/library.html).
// `area` picks the section (#downloads for Ctrl+J); an open Library is focused
// and switched to it rather than opened twice.
let libraryWin = null;
const LIBRARY_AREA_RE = /^[a-z]{1,24}$/;

function openLibraryWindow(area) {
  const hash = LIBRARY_AREA_RE.test(area || '') ? area : undefined;
  if (libraryWin && !libraryWin.isDestroyed()) {
    if (libraryWin.isMinimized()) libraryWin.restore();
    libraryWin.show(); libraryWin.focus();
    if (hash) libraryWin.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + hash)}`).catch(() => {});
    return { ok: true, reused: true, area: hash || null };
  }
  libraryWin = new BrowserWindow({
    width: 1080, height: 760, minWidth: 560, minHeight: 420, backgroundColor: '#08080d',
    frame: false,
    webPreferences: {
      preload:          path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    title: 'Clear Glass — Library',
  });
  libraryWin.loadFile(path.join(__dirname, '../../renderer/library.html'), hash ? { hash } : undefined);
  libraryWin.on('closed', () => { libraryWin = null; });
  libraryWin.on('show', () => _touchAutopilotIfOpen());
  emit('library.opened', { area: hash || null });
  return { ok: true, reused: false, area: hash || null };
}

function closeLibraryWindow() {
  if (libraryWin && !libraryWin.isDestroyed()) libraryWin.close();
}

// Ctrl+J opens the Library at Downloads from anywhere in Clear Glass — the
// browser chrome AND the page inside it. A page's keystrokes never reach
// browser.js (the webview is its own renderer), so the key is taken in the main
// process for every web contents Clear Glass creates. Ctrl+Shift+J stays DevTools.
function _isLibraryKey(input) {
  return input && input.type === 'keyDown' && (input.control || input.meta) && !input.shift && !input.alt &&
         String(input.key).toLowerCase() === 'j';
}
app.on('web-contents-created', (_e, contents) => {
  contents.on('before-input-event', (event, input) => {
    if (!_isLibraryKey(input)) return;
    event.preventDefault();
    openLibraryWindow('downloads');
  });
});

// ── Shutdown ───────────────────────────────────────────────────────────────
async function shutdown() {
  emit('lifecycle.shutdown', { uuid: MODULE_UUID });
  _postEvent('clear-glass.shutdown', { uuid: MODULE_UUID });

  if (_heartbeatInterval) clearInterval(_heartbeatInterval);

  // §NEW 2026-08-24 — closes the gap named at the end of the previous
  // commit, but scoped correctly rather than mechanically as originally
  // stated there. Reconsidered before implementing: disableAllUserscripts()
  // is GLOBAL (every plugin's userscript contribution installs with
  // agentId: '*' — checked directly, none of adblocker/captcha-pause/
  // guardian-listeners pass a specific agentId to userscript.create).
  // Wiring it into closeAgentWindow (a SINGLE window closing) would mean
  // closing one agent tab silently kills Instagram/Threads monitoring in
  // every OTHER still-open window too — a real bug, not the fix that was
  // flagged. Only real app-wide shutdown has the correct scope for a
  // global kill. Synchronous (disableAllUserscripts doesn't return a
  // Promise — checked directly), so it runs as a plain statement, not
  // inside the allSettled below.
  pluginHost?.disableAllUserscripts('app-shutdown');

  await Promise.allSettled([
    providerHost?.stopAll(),
    ipcBridge?.stop(),
    sse?.stop(),
    _wireServer ? new Promise(r => _wireServer.close(r)) : Promise.resolve(),
  ]);
}

module.exports = {
  openAgentWindow, closeAgentWindow, minimizeAgentWindow, hideAgentWindow, maximizeAgentWindow,
  focusAgentWindow, listOpenAgents,
  openBackgroundTab, closeBackgroundTab, listBackgroundTabs,
  closeSettingsWindow, openLibraryWindow, closeLibraryWindow, windows, bgTabs,
  freezeAgentWindow, thawAgentWindow,
};
