'use strict';
/**
 * lib/agent-tools/tools/browser-action.js — browser_action tool
 * UUID: nexus-agent-tools-browser-action-v1-0000-2026-0713-jamesbrooks-001
 *
 * §BUILT 2026-07-13 — "Guardian is supposed to use Clear Glass. It's
 * NEXUS' browser. Give the co-pilot more access." This is that access:
 * copilot's agent loop can now issue real browser actions (navigate,
 * read the DOM, click/type, restore a cookie jar) through Guardian's new
 * 'browser' provider dispatch (guardian/server.js's _doDispatch), which
 * calls Clear Glass's real command surface (guardian/clear-glass-bridge.js)
 * instead of a chat provider's NCP channel.
 *
 * §HONEST SCOPE — this creates a real Guardian job and returns once it
 * completes or errors; it does not poll indefinitely. A browser action
 * that hangs past its timeout comes back as a real, honest error, not a
 * silent hang in the tool-calling loop.
 */

const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

// §FIXED 2026-08-12 — traced the full chain while wiring P5 (url-listener) and
// found this map was wrong for 5 of its 6 entries: clear-glass/src/gates/
// index.js registers SISO gates with UNSUFFIXED signatures ('dom.query',
// 'dom.mutate', 'dom.pick', 'driver.exec', 'cookie.save', 'cookie.restore' —
// singular "cookie", not "cookies"), and clear-glass/src/core/bus.js's emit()
// passes eventType through to the real SISO Stream with no suffix-stripping
// (confirmed by reading it directly — SISO gate lookup is exact-match, no
// fuzzy fallback, per its own design law). This map instead sent
// 'dom.query.request', 'dom.mutate.request', 'dom.pick.request',
// 'driver.exec.request', 'cookies.save.request', 'cookies.restore.request' —
// none of which match any registered gate signature. An event with no
// matching gate lands in the Stream's pending[] as unclaimed residue; the
// caller never sees an error, just a response that never arrives. Only
// 'navigate' → 'driver.exec' was ever actually correct. This tool's own
// header claims "verified end-to-end against a real mock of the full chain"
// (2026-07-13) — the mock evidently didn't catch a wrong event-type string,
// only a wrong route. §HONEST LIMIT — this fix is a string correction,
// traced against real source (gates/index.js, core/bus.js, siso/index.js),
// not guessed; it has NOT been run against a live Electron instance (no
// Electron runtime in this environment) the way the tools built earlier this
// session were run against live cortex/loom. Confirm against the real app
// before trusting it further than "traced correct."
const REAL_ACTIONS = {
  navigate:        'driver.exec',      // { action: 'navigate', url } — was already correct
  navigate_provider: 'provider.navigate', // §BUILT 2026-08-14 — { providerId, url }: navigates a SPECIFIC agent's own ClearGlass window (distinct from 'navigate' above, which drives a generic browser context, not any one provider's real tab). See clear-glass/src/providers/host.js's navigateTo() and switch-agent's real use of this, self-model.js.
  dom_query:       'dom.query',        // was 'dom.query.request'
  dom_mutate:      'dom.mutate',       // was 'dom.mutate.request'
  dom_pick:        'dom.pick',         // was 'dom.pick.request'
  driver_exec:     'driver.exec',      // was 'driver.exec.request'
  cookies_save:    'cookie.save',      // was 'cookies.save.request' (wrong word + suffix)
  cookies_restore: 'cookie.restore',   // was 'cookies.restore.request' (wrong word + suffix)
  // §ADDED 2026-08-23 — James: "screenshot feature in clear-glass for a
  // tool for co-pilot." Checked before adding, not assumed: the real
  // capability already exists end to end on ClearGlass's own side —
  // driver/index.js's real _screenshot(agentId, {rect}) returns a real
  // base64 PNG, already registered in ClearGlass's own copilot/tools.js
  // catalog and copilot/bridge.js's 'screenshot': 'driver.exec' mapping.
  // The one real gap was this tool never exposing it — not a missing
  // feature, a missing wire.
  screenshot:      'driver.exec',      // { action: 'screenshot', rect? } — same driver.exec dispatch navigate already uses
  // §ADDED 2026-08-23 — same real, already-implemented driver.exec dispatch
  // pattern as screenshot above (driver/index.js's own real _getUrl/
  // _getTitle, confirmed present before adding). Needed for the new macro
  // tool's real URL-pattern matching — a macro can't safely check "am I on
  // the right page" without a real way to ask what page it's actually on.
  get_url:         'driver.exec',      // { action: 'getUrl' }
  get_title:       'driver.exec',      // { action: 'getTitle' }
  // §ADDED 2026-08-23 — James: "create toasts." Real, visible
  // notification, shown in the target agent's own ClearGlass window.
  // Same real driver.exec dispatch as screenshot — window.__cgToast is
  // now exposed in renderer/browser.js specifically for this.
  toast:           'driver.exec',      // { action: 'toast', msg, type?, durationMs? }
  // §ADDED 2026-09-19 — audit found 25 of driver/index.js's 30 real
  // _dispatch() actions (checked directly against that exact switch
  // statement, not guessed from method names) had no way in through this
  // tool at all — only navigate/screenshot/getUrl/getTitle/toast were
  // named. All real, all already fully implemented on ClearDriver's own
  // side; the only gap was this tool never naming them. Same real
  // driver.exec dispatch as every entry above.
  click:              'driver.exec', // { action:'click', selector?, x?, y?, button?, delay? }
  type:               'driver.exec', // { action:'type', selector?, text, clearFirst?, delay? }
  scroll:             'driver.exec', // { action:'scroll', x?, y?, deltaX?, deltaY? }
  hover:              'driver.exec', // { action:'hover', selector?, x?, y? }
  wait:               'driver.exec', // { action:'wait', ms? }
  wait_for:           'driver.exec', // { action:'waitFor', selector, timeout? }
  eval:               'driver.exec', // { action:'eval', code, worldId? } — real JS eval in the page, not a sandbox
  zoom:               'driver.exec', // { action:'zoom', mode?, factor? }
  find_in_page:       'driver.exec', // { action:'findInPage', text, forward?, findNext?, matchCase? }
  stop_find_in_page:  'driver.exec', // { action:'stopFindInPage', action? }
  print:              'driver.exec', // { action:'print', silent?, printBackground?, ...opts }
  back:               'driver.exec', // { action:'back' } — no args
  forward:            'driver.exec', // { action:'forward' } — no args
  reload:             'driver.exec', // { action:'reload' } — no args
  cookies_get:        'driver.exec', // { action:'cookies.get', url?, name? } — one cookie; distinct from cookies_save/restore above (whole jar)
  cookies_set:        'driver.exec', // { action:'cookies.set', url, name, value, domain?, path?, secure?, httpOnly?, expirationDate? }
  cookies_clear:      'driver.exec', // { action:'cookies.clear', url?, name? }
  storage_get:        'driver.exec', // { action:'storage.get', key, type? } — 'local' | other real storage type
  storage_set:        'driver.exec', // { action:'storage.set', key, value, type? }
  network_block:      'driver.exec', // { action:'network.block', patterns }
  network_intercept:  'driver.exec', // { action:'network.intercept', patterns, redirectUrl }
  picker_enable:      'driver.exec', // { action:'picker.enable' } — no args, real element-picker overlay
  picker_disable:     'driver.exec', // { action:'picker.disable' } — no args
  inject:             'driver.exec', // { action:'inject', code, worldId?, persistent? } — distinct from dom_mutate above
  record_start:       'driver.exec', // { action:'record.start', ...args } — real session recording, see rewind_replay for playback
  record_stop:        'driver.exec', // { action:'record.stop' } — no args
  // §ADDED 2026-08-12 (P5) — url.listen/url.listen.remove ARE real, registered
  // gates (gates/index.js:181-188), and urlListener IS passed into
  // registerAll's deps (main/index.js:786-794) — confirmed live-wired, not
  // orphaned as first assumed. Reuses this tool rather than a new one:
  // same guardian→clear-glass-bridge round trip, same REAL_ACTIONS shape.
  url_listen:      'url.listen',       // data: { pattern, hook, agentId?, intercept?, capture?, label? }
  url_unlisten:    'url.listen.remove',// data: { listenerId }
};

// §BUGFIX 2026-08-23 — found while wiring in screenshot, not part of the
// original ask: clear-glass/src/gates/index.js's real driverExecGate does
// `const { action, agentId, requestId, ...args } = event.data;` — it reads
// the REAL sub-action (navigate/screenshot/click/etc.) from event.data.action
// directly. This function's own execute() below was passing the caller's
// `data` straight through, unmodified — for 'driver.exec'-routed actions
// (navigate, now screenshot), the outer tool `action` name was never being
// threaded into `data.action` anywhere in this chain. Checked guardian/
// server.js directly: it does no special handling for driver.exec jobs
// either, just forwards command+content generically. This means an LLM
// calling navigate via this tool with the documented shape ({url}, no
// nested action field) would reach driverExecGate with action===undefined
// — a real, pre-existing gap this fix closes for every 'driver.exec'-routed
// action at once, not just the new one.
//
// §HONEST LIMIT — this fix is verified against the real code on both ends
// (this file, and gates/index.js's real destructuring) but NOT verified
// against a live, running Electron ClearGlass instance — this sandbox has
// no display/GPU environment to run one. Worth a real, live check before
// fully trusting it in production.
const DRIVER_EXEC_ACTIONS = new Set(Object.keys(REAL_ACTIONS).filter(k => REAL_ACTIONS[k] === 'driver.exec'));
// §BUGFIX 2026-08-23 — caught before shipping, while adding get_url/get_title:
// this tool's own action names (snake_case, e.g. get_url) don't always match
// the real driver's own sub-action names (camelCase, e.g. getUrl) — navigate
// and screenshot happened to match by coincidence, get_url/getUrl do not.
// Injecting the tool's own action name blind (action: 'get_url') would have
// silently mismatched driver/index.js's real _dispatch() switch, which only
// matches 'getUrl' exactly, and failed with "unknown driver action" — the
// exact bug class this file's own earlier fix (navigate's missing action
// field) was written to close, reintroduced by not checking a rename.
const DRIVER_SUB_ACTION = {
  get_url: 'getUrl', get_title: 'getTitle', // only where the names actually differ
  // §ADDED 2026-09-19 — same rule, extended for the 25 new actions above.
  // click/type/scroll/hover/wait/eval/zoom/print/back/forward/reload/inject
  // are NOT listed here because their tool-facing name already matches
  // driver/index.js's real dispatch string exactly — adding an identity
  // mapping for them would be dead code, not safety.
  wait_for: 'waitFor', find_in_page: 'findInPage', stop_find_in_page: 'stopFindInPage',
  cookies_get: 'cookies.get', cookies_set: 'cookies.set', cookies_clear: 'cookies.clear',
  storage_get: 'storage.get', storage_set: 'storage.set',
  network_block: 'network.block', network_intercept: 'network.intercept',
  picker_enable: 'picker.enable', picker_disable: 'picker.disable',
  record_start: 'record.start', record_stop: 'record.stop',
};

function _createGuardianJob(command, content) {
  return new Promise((resolve) => {
    // §FIXED 2026-07-13 — checked the real route before shipping, not
    // assumed: guardian's raw job dispatch is POST /command (guardian/
    // server.js), not /api/jobs — that path belongs to a different
    // service entirely (ollama-bridge, port 3749, referenced in a
    // comment elsewhere in guardian/server.js that this tool's first
    // draft copied the wrong assumption from).
    const body = Buffer.from(JSON.stringify({ command, provider: 'browser', content: JSON.stringify(content || {}) }));
    const req = http.request({
      hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/command', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 20000,
    }, (res) => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve({ ok: false, error: `bad response from guardian: ${e.message}` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `could not reach guardian (:${GUARDIAN_PORT}): ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'guardian job submission timed out' }); });
    req.write(body);
    req.end();
  });
}

function _pollJob(jobId, deadlineMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      // §FIXED 2026-07-13 — checked before shipping: there is no GET
      // /jobs/:id (or /api/jobs/:id) route anywhere in guardian/server.js
      // — only a bulk GET /jobs?limit=N&status=X listing. Polling a
      // single job means fetching the recent list and finding it by id;
      // a large limit keeps a slightly-older job from scrolling out
      // before it completes.
      const req = http.request({ hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/jobs?limit=200', method: 'GET', timeout: 5000 }, (res) => {
        let raw = ''; res.on('data', c => raw += c);
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
          const job = parsed?.jobs?.find(j => j.id === jobId);
          if (job?.status === 'complete') { resolve({ ok: true, response: job.response }); return; }
          if (job?.status === 'error')    { resolve({ ok: false, error: job.error || 'browser action failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ ok: false, error: `browser action did not complete within ${deadlineMs}ms` }); return; }
          setTimeout(tick, 500);
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: `lost contact with guardian while polling: ${e.message}` }));
      req.end();
    };
    tick();
  });
}

module.exports = {
  name: 'browser_action',
  description:
    'Control NEXUS\' real browser (Clear Glass) — navigate to a URL, take a screenshot, show a real toast ' +
    'notification, read/mutate the DOM, manage cookies, or register a backend URL listener that fires a hook on ' +
    'matching traffic. This is a real browser, not a simulation; actions take real time and can fail for real ' +
    'reasons (page not loaded, element not found). ' +
    `Params: action (required — one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — action-specific: ` +
    'navigate needs {url}, screenshot needs {} (optional {rect} to capture a specific region), get_url/get_title ' +
    'need {}, toast needs {msg, type?("info"|"error"|"success"|"warn"), durationMs?}, dom_query needs {selector}, ' +
    'dom_mutate needs {selector, value}, cookies_save/restore need {agentId}, url_listen needs {pattern, hook, ' +
    'agentId?, intercept?, capture?, label?}, url_unlisten needs {listenerId}).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which browser action to perform' },
      data:   { type: 'object', description: 'Action-specific parameters' },
    },
    required: ['action'],
  },
  execute: async ({ action, data = {} } = {}) => {
    const eventType = REAL_ACTIONS[action];
    if (!eventType) return { error: `unknown action "${action}" — expected one of: ${Object.keys(REAL_ACTIONS).join(', ')}` };

    // §BUGFIX 2026-08-23 — see REAL_ACTIONS' own comment above
    // DRIVER_EXEC_ACTIONS for the full real reason: driverExecGate reads
    // the sub-action from data.action directly, and nothing upstream of
    // this file was ever setting it for a 'driver.exec'-routed action.
    // Only touches the two real actions that go through driver.exec
    // (navigate, screenshot) — every other action's real gate reads its
    // own real event type directly and has no such field to inject.
    const payload = DRIVER_EXEC_ACTIONS.has(action) ? { action: DRIVER_SUB_ACTION[action] || action, ...data } : data;

    const created = await _createGuardianJob(eventType, payload);
    if (!created.ok) return { error: created.error || 'guardian rejected the job' };

    const result = await _pollJob(created.jobId, 20000);
    if (!result.ok) return { error: result.error };
    return { ok: true, action, result: result.response };
  },
};
