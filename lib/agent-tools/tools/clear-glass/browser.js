'use strict';
/**
 * lib/agent-tools/tools/clear-glass/browser.js — clearglass.browser.tool: Clear Glass, whole, in one tool.
 * comp_id: nexus.agent-tools.clearglass.browser
 * UUID: nexus-agent-tools-clearglass-browser-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * James, 2026-09-27: "i want copilot completely aware of clearglass, hooked in completely. all of it, copilot can use it."
 *
 * WHY ONE MORE CLEAR GLASS TOOL, when eight already exist (browser_action, macro, dom_archaeology, userscripts,
 * tab_visibility, provider_deploy, command_index, stream_bridge):
 *   - browser_action goes copilot → guardian job → /cmd → bus → SSE → guardian poll → copilot: five hops, a 20s
 *     ceiling, and a dead end whenever guardian is down. This goes copilot → :7702 /cli/driver, and the driver's own
 *     result comes back in the response.
 *   - none of the eight answers "what is on this page" (read) or "what is Clear Glass doing" (state) in one call.
 *   - none can run several steps in one call (sequence). A browser agent pays a full chat round trip per tool call;
 *     filling a 12-field form one call at a time is 12 round trips. sequence is one.
 *   - form work had no select / check / setValue / upload (driver/index.js 0.39.272 adds them; this exposes them).
 * The eight stay: each owns a surface this one does not (macros, erosmancer nodes, provider tabs, userscripts).
 *
 * Every action is a real HTTP call to a real Clear Glass route; nothing is simulated. Clear Glass down → the error
 * names the port and says so; it never returns an empty result that looks like an empty page.
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const IPC_PORT = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10);
const HOST = process.env.CLEARGL_HOST || '127.0.0.1';

// The driver's own vocabulary (clear-glass/src/driver/index.js _dispatch) — the names `act` and `sequence` accept.
const DRIVER_ACTIONS = Object.freeze([
  'navigate', 'click', 'type', 'setValue', 'select', 'check', 'upload', 'pressKey', 'scroll', 'hover', 'wait', 'waitFor',
  'screenshot', 'toast', 'eval', 'zoom', 'findInPage', 'stopFindInPage', 'print', 'getUrl', 'getTitle', 'back', 'forward',
  'reload', 'cookies.get', 'cookies.set', 'cookies.clear', 'storage.get', 'storage.set', 'network.block',
  'network.intercept', 'picker.enable', 'picker.disable', 'inject', 'record.start', 'record.stop', 'readPage',
  'field', 'fieldOff', 'at', 'spotlight', 'pointer',   // 0.39.279 — the interaction field
]);

function _call(method, path, body, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: HOST, port: IPC_PORT, path, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      timeout: timeoutMs,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let j = null;
        try { j = raw ? JSON.parse(raw) : {}; } catch (_) { return resolve({ ok: false, status: res.statusCode, error: `non-JSON reply from Clear Glass ${path}: ${raw.slice(0, 200)}` }); }
        if (res.statusCode === 404 && !(j && Object.keys(j).length)) return resolve({ ok: false, status: 404, error: `Clear Glass has no ${method} ${path} — an older build? (0.39.272 added /cli/driver, /cli/page/read, /cli/state)` });
        resolve(res.statusCode >= 200 && res.statusCode < 300 ? (j && typeof j === 'object' ? j : { ok: true, result: j }) : { ok: false, status: res.statusCode, ...(j && typeof j === 'object' ? j : {}), error: (j && j.error) || `HTTP ${res.statusCode}` });
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: `Clear Glass unreachable on :${IPC_PORT} (${e.code || e.message}) — is it running? (npm start in clear-glass, or autopilot spawns it on demand)` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: `Clear Glass ${path} timed out after ${timeoutMs}ms` }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// Screenshots are base64 PNG; a model cannot read one and it would flood its context. Keep the size, drop the bytes
// unless asked (keepImage:true) — the image still went out on Clear Glass's own SSE (driver.screenshot) for the UI.
function _trimResult(action, r, keepImage) {
  // 0.39.279 — a field comes back as its text map (what a model reads) plus counts; the full target JSON only on
  // request (keepImage doubles as "keep everything"), so 150 targets never flood the chat
  if (action === 'field' && r && r.result && Array.isArray(r.result.targets) && !keepImage) {
    const f = r.result;
    return { ...r, result: { text: f.text, url: f.url, viewport: f.viewport, targets: f.targets.length, overlay: f.overlay, next: 'pointer {n, do} acts on a number; spotlight {n} shows James' } };
  }
  if (action === 'screenshot' && r && r.result && r.result.screenshot && !keepImage) {
    return { ...r, result: { format: r.result.format, bytes: Math.round(r.result.screenshot.length * 0.75), note: 'image omitted from the tool result (pass keepImage:true to include base64)' } };
  }
  return r;
}

// ── 0.39.272 — learning (lib/cg-learning.js): every action is an observation for its site; a selector that finds
// nothing is healed once from what is known about the site and what is on the page; a sequence that worked is kept. ──
const _urlOf = new Map();   // agentId → last known page url (from read / navigate / getUrl)
function L() { try { return require('../../../cg-learning.js'); } catch (_) { return null; } }
async function _urlFor(agentId) {
  if (_urlOf.has(agentId)) return _urlOf.get(agentId);
  const r = await _call('POST', '/cli/driver', { action: 'getUrl', agentId }, 5000);
  const u = r && r.result && r.result.url; if (u) _urlOf.set(agentId, u);
  return u || null;
}
async function _read(agentId, extra = {}) {
  const p = await _call('POST', '/cli/page/read', { agentId: agentId || 'default', ...extra });
  if (p && p.url) {
    _urlOf.set(agentId || 'default', p.url);
    const lib = L(); if (lib) { try { const h = lib.hintsFor(lib.hostOf(p.url)); if (h) p.learned = h; } catch (_) {} }
  }
  return p;
}

async function _raw(agentId, action, args) {
  return _call('POST', '/cli/driver', { action, agentId: agentId || 'default', ...args }, (args.timeoutMs || 30000) + 5000);
}

async function act(agentId, step, opts = {}) {
  const { action, label, ...args } = step || {};
  if (label && (action === 'spotlight' || action === 'pointer')) args.label = label;   // 0.39.279 — their label is shown, not a heal hint
  const aid = agentId || 'default';
  if (!DRIVER_ACTIONS.includes(action)) return { ok: false, error: `unknown driver action "${action}" — one of: ${DRIVER_ACTIONS.join(', ')}` };
  if (action === 'navigate' && args.url) _urlOf.set(aid, args.url);
  let r = await _raw(aid, action, args);
  const lib = opts.learn === false ? null : L();
  if (!lib || ['getUrl', 'getTitle', 'readPage', 'screenshot', 'wait', 'toast', 'field', 'fieldOff', 'at', 'spotlight'].includes(action)) return _trimResult(action, r, opts.keepImage);
  const url = await _urlFor(aid);
  // heal: a selector that found nothing is re-aimed ONCE, from what worked on this site before or what the page shows
  if (r && r.ok === false && args.selector && lib.HEALABLE.has(action) && lib.NOT_FOUND.test(r.error || '')) {
    lib.observe({ url, action, selector: args.selector, label, ok: false, error: r.error, agent: opts.agent });
    const page = await _read(aid);
    const fix = page && page.ok !== false ? lib.heal({ action, selector: args.selector, label, text: args.text }, page, { hints: page.learned || null }) : null;
    if (fix) {
      const r2 = await _raw(aid, action, { ...args, selector: fix.selector });
      lib.observe({ url, action, selector: fix.selector, label: label || null, ok: r2.ok !== false, error: r2.error, healedFrom: args.selector, via: fix.via, agent: opts.agent });
      return { ..._trimResult(action, r2, opts.keepImage), healed: { from: args.selector, to: fix.selector, via: fix.via, confidence: fix.confidence, ok: r2.ok !== false } };
    }
    return { ...r, healed: null, note: 'no confident match on the page for this selector — read the page and pick one from its fields/buttons' };
  }
  lib.observe({ url, action, selector: args.selector || null, label, ok: r.ok !== false, error: r.error, agent: opts.agent });
  if (action === 'navigate') _urlOf.delete(aid);   // the page may redirect; next action asks
  return _trimResult(action, r, opts.keepImage);
}

async function sequence(agentId, steps = [], { stopOnError = true, keepImage = false } = {}) {
  if (!Array.isArray(steps) || !steps.length) return { ok: false, error: 'steps must be a non-empty array of { action, ...args }' };
  if (steps.length > 40) return { ok: false, error: `${steps.length} steps — the limit is 40 per call; split it` };
  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const r = await act(agentId, steps[i], { keepImage });
    results.push({ step: i, action: steps[i] && steps[i].action, ok: r.ok !== false, ...(r.ok === false ? { error: r.error } : { result: r.result }), ...(r.healed ? { healed: r.healed } : {}) });
    if (r.ok === false && stopOnError) return { ok: false, stoppedAt: i, results, error: `step ${i} (${steps[i] && steps[i].action}) failed: ${r.error}` };
  }
  const ok = results.every(x => x.ok);
  if (ok && steps.length >= 3) {
    const lib = L();
    if (lib) { try { const f = lib.recordFlow({ url: await _urlFor(agentId || 'default'), steps: steps.map((st, i) => (results[i] && results[i].healed ? { ...st, selector: results[i].healed.to } : st)) }); if (f) return { ok, results, learnedFlow: { id: f.id, name: f.name, successes: f.successes } }; } catch (_) {} }
  }
  return { ok, results };
}

const ACTIONS = {
  state:          (a) => _call('GET', `/cli/state${a.agentId ? `?agentId=${encodeURIComponent(a.agentId)}` : ''}`),
  read:           (a) => _read(a.agentId || 'default', { maxText: a.maxText, maxLinks: a.maxLinks, maxFields: a.maxFields }),
  act:            (a) => act(a.agentId, { action: a.driverAction || (a.step && a.step.action), ...(a.args || {}), ...(a.step || {}) }, a),
  sequence:       (a) => sequence(a.agentId, a.steps, { stopOnError: a.stopOnError !== false, keepImage: !!a.keepImage }),
  open_tab:       (a) => _call('POST', '/cli/bgtab', { agentId: a.agentId, url: a.url || 'about:blank', partition: a.partition }),
  close_tab:      (a) => a.agentId ? _call('DELETE', `/cli/bgtab/${encodeURIComponent(a.agentId)}`) : { ok: false, error: 'agentId required' },
  tabs:           ()  => _call('GET', '/cli/agents'),
  autofill_profiles: () => _call('GET', '/cli/autofill/profiles'),
  autofill_profile: (a) => a.profileId ? _call('GET', `/cli/autofill/profiles/${encodeURIComponent(a.profileId)}`) : { ok: false, error: 'profileId required' },
  autofill_detect:(a) => _call('POST', '/cli/autofill/detect', { agentId: a.agentId || 'default', profileId: a.profileId }),
  autofill_fill:  (a) => _call('POST', '/cli/autofill/fill', { agentId: a.agentId || 'default', profileId: a.profileId, minConfidence: a.minConfidence || 'medium' }),
  questions:      (a) => _call('GET', `/cli/screen-qa/detect?agentId=${encodeURIComponent(a.agentId || 'default')}${a.profileId ? `&profileId=${encodeURIComponent(a.profileId)}` : ''}`),
  inject_answer:  (a) => _call('POST', '/cli/screen-qa/inject', { agentId: a.agentId || 'default', cgId: a.cgId, text: a.text }),
  history:        (a) => _call('GET', `/cli/history?limit=${+a.limit || 30}${a.query ? `&query=${encodeURIComponent(a.query)}` : ''}`),
  bookmarks:      (a) => _call('GET', `/cli/bookmarks${a.query ? `?query=${encodeURIComponent(a.query)}` : ''}`),
  accounts:       ()  => _call('GET', '/cli/accounts'),
  downloads:      ()  => _call('GET', '/cli/downloads'),
  // 0.39.272 — everything else the Clear Glass window can do: every IPC channel, by name, same handler (window
  // control, settings, login portal, plugins, WebExtensions, macros, recording, selectors, custom agents, errors…).
  // 0.39.279 — James: "a interaction field for xyz coords to help the agents see and navigate the ui in clearglass …
  // virtual input through erosmanceros … spotlight". field: the page as numbered targets (x,y centre, z = layers on top
  // of it) with a text map a small model can read; pointer: act on a number; spotlight: show James the target.
  field:          (a) => act(a.agentId, { action: 'field', overlay: a.overlay !== false, offscreen: !!a.offscreen, limit: a.limit }, a),
  pointer:        (a) => act(a.agentId, { action: 'pointer', n: a.n, x: a.x, y: a.y, selector: a.selector, do: a.do || 'click', text: a.text, via: a.via || 'native', deltaY: a.deltaY, label: a.label }, a),
  spotlight:      (a) => act(a.agentId, { action: 'spotlight', n: a.n, selector: a.selector, x: a.x, y: a.y, w: a.w, h: a.h, label: a.label, off: !!a.off }, a),
  channels:       (a) => _call('GET', `/cli/invoke${a.query ? `?q=${encodeURIComponent(a.query)}` : ''}`),
  invoke:         (a) => a.channel ? _call('POST', '/cli/invoke', { channel: a.channel, args: a.channelArgs, agentId: a.agentId || null }, 60000) : { ok: false, error: 'channel required — action "channels" lists them' },
};

module.exports = {
  name: toolName('clearglass', 'browser'),
  description:
    'Clear Glass (NEXUS\'s own browser), direct and synchronous — results come back in the call. ' +
    'state: every open tab with its url/title, providers, accounts, autofill profiles, macros, userscripts. ' +
    'read: what is on a page — text, headings, links, every form field with its label + a selector, every button. ' +
    'act: one driver action (driverAction + args), e.g. navigate{url}, click{selector}, setValue{selector,value}, ' +
    'select{selector,value|text}, check{selector,checked}, upload{selector,paths}, type{selector,text}, pressKey{key}, ' +
    'waitFor{selector}, screenshot, eval{code}. Pass the field\'s label with a step ({action,selector,label}) — if the ' +
    'selector finds nothing it is healed from what was learned on this site and what the page shows, and the result says so. ' +
    'read returns `learned`: what worked and failed on this site before. sequence: several steps [{action,...}] in ONE call (stops at the first ' +
    'failure). open_tab{agentId?,url,partition?} / close_tab / tabs. autofill_profiles / autofill_detect / autofill_fill ' +
    '{agentId,profileId}. questions (open-ended form questions on screen) / inject_answer{cgId,text}. history / ' +
    'bookmarks{query} / accounts / downloads. channels{query?} lists EVERY Clear Glass capability (window control, ' +
    'options, login portal, plugins, WebExtensions, macros, recording, selectors, custom agents, errors, downloads open…) ' +
    'and invoke{channel, channelArgs} runs one — the same handler the Clear Glass window uses. agentId names the tab. ' +
    'field (0.39.279): the page as numbered targets with centre (x,y) and z (0 = on top, >0 = covered) — the text map ' +
    'reads "#3 button \"Apply now\" (412,580) 120×32 z0"; the numbers are drawn on the page (overlay). pointer{n | x,y, ' +
    'do: click|double|right|move|scroll|type, text, via: native|eros} acts on one with real input (eros = ErosmancerOS, ' +
    'human-paced). spotlight{n|selector, label} shows James what you are about to do.',
  parameters: {
    type: 'object',
    properties: {
      action:       { type: 'string', enum: Object.keys(ACTIONS) },
      agentId:      { type: 'string', description: 'which tab — from state/tabs; open_tab creates one' },
      driverAction: { type: 'string', enum: DRIVER_ACTIONS, description: 'act only — the driver action' },
      args:         { type: 'object', description: 'act only — that action\'s arguments (url, selector, value, text, paths, key, code...)' },
      steps:        { type: 'array', items: { type: 'object' }, description: 'sequence only — [{ action, ...args }]' },
      stopOnError:  { type: 'boolean' },
      keepImage:    { type: 'boolean', description: 'screenshot: include the base64 image in the result' },
      url:          { type: 'string' }, partition: { type: 'string' },
      profileId:    { type: 'string' }, minConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      cgId:         { type: 'string' }, text: { type: 'string' },
      query:        { type: 'string' }, limit: { type: 'number' },
      maxText:      { type: 'number' }, maxLinks: { type: 'number' }, maxFields: { type: 'number' },
      channel:      { type: 'string', description: 'invoke — an IPC channel name from "channels", e.g. "window:maximize", "options:set", "macros:run"' },
      channelArgs:  { description: 'invoke — the channel\'s argument (an object) or an array of arguments' },
      n:            { type: 'number', description: 'pointer / spotlight — a target number from field' },
      x:            { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
      selector:     { type: 'string' }, label: { type: 'string' },
      do:           { type: 'string', enum: ['click', 'double', 'right', 'move', 'scroll', 'type'], description: 'pointer — what to do at the target (default click)' },
      via:          { type: 'string', enum: ['native', 'eros'], description: 'pointer — native input events, or ErosmancerOS (human-paced CDP input)' },
      overlay:      { type: 'boolean', description: 'field — draw the numbers on the page (default true)' },
      offscreen:    { type: 'boolean' }, off: { type: 'boolean' }, deltaY: { type: 'number' },
    },
    required: ['action'],
  },
  async execute(a = {}) {
    const fn = ACTIONS[a.action];
    if (!fn) return { ok: false, error: `unknown action "${a.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    return fn(a);
  },
  DRIVER_ACTIONS, act, sequence, _call, _read, _urlOf, IPC_PORT,
};
