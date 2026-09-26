'use strict';
/**
 * lib/agent-tools/tools/clear-glass/macro.js — James: "lets do macros...
 * automating job applications, or emailing therapists on psychology
 * today... full state rewind engine, hook into automate/macro per url,
 * event driven snapshots, bookmarks to capture state."
 *
 * §MOVED 2026-08-23 — this lived at tools/automation/macro.js; moved into
 * tools/clear-glass/ to match the real grouping used elsewhere (see
 * dom-archaeology.js in this same folder) — every real thing this tool
 * drives (browser_action's clear-glass-bridge path, rewind_replay's
 * RewindEngine, the erosmancer wire proxy) is Clear-Glass-specific, not
 * generic "automation." Pure move: relative requires below are unchanged
 * since automation/ and clear-glass/ sit at the same depth under tools/.
 *
 * A macro is a named, real sequence of browser_action steps, keyed to a
 * URL pattern, storable and replayable. Built on top of, not parallel to,
 * two real systems already in this codebase:
 *   - browser_action (lib/agent-tools/tools/browser/browser-action.js) —
 *     every real step in a macro is literally one browser_action call.
 *   - rewind_replay (lib/agent-tools/tools/sandbox/rewind-replay.js) —
 *     clear-glass/src/rewind/engine.js's real RewindEngine. Every macro
 *     run takes a real, labeled snapshot before its first step — the
 *     real rollback point if something goes wrong mid-macro.
 *
 * §HONEST SCOPE — this is v1, not the full ask. "Record" here means
 * DEFINE explicitly (a real, composed list of steps), not capture a
 * live human interacting with a page — that's a real, separate, much
 * larger feature (a content-script-level action recorder) not built in
 * this pass. Every real primitive it would be built from (dom_pick to
 * name an element, this file's own step storage) is already here.
 *
 * §HONEST LIMIT — verified via direct, isolated tests of the real
 * logic (template substitution, URL-pattern matching, step sequencing,
 * failure handling) — NOT verified against a live, running Electron
 * ClearGlass instance, since this sandbox has no display/GPU
 * environment to run one. Same honest limit rewind_replay.js and the
 * screenshot addition both already state for the same real reason.
 */
const { randomUUID } = require('crypto');
const http = require('http');

// §EROS-INTEGRATION 2026-08-23 — James: "utilize erosmancerOS and behavior
// engine for the macros." Real investigation first, not assumed:
// erosmancer/erosmancer-os is a genuine, separate, substantial TypeScript
// CDP automation engine (its own README: "identity resolution under DOM
// entropy") with a real BehaviorEngine module. Its own real POST
// /api/execute (erosmancer-os/src/api/server.ts) is a COMPLETE, already-
// integrated pipeline — profile resolution, BehaviorIntent -> ExecutionPlan
// (Box-Muller timing variance, Bezier mouse paths), THEN the real CDP
// action, THEN adaptive learning and replay recording — all automatic on
// every call. This is not a planning layer to bolt onto browser_action; it
// is a real, different, more sophisticated execution path for the actions
// it natively supports (click/type/hover/scroll/evaluate/navigate/
// screenshot), reached through clear-glass/wire/nexus-wire.js's real,
// already-built proxy at :7704/eros/* (confirmed by reading that file
// directly — forwards to erosmancer's own :7432/api/*, not guessed).
//
// §HONEST LIMIT — erosmancer targets elements by a real NodeRegistry UUID
// (its own 7-strategy SelectorEngine's resolved identity), not a raw CSS
// selector. A macro step that wants erosmancer's real human-like execution
// therefore needs a real targetUuid, not a selector — that UUID has to
// already exist in erosmancer's own registry (via its DOM observer tracking
// the page, or an explicit prior registration this tool does not itself
// perform). Stated plainly rather than papered over: this integration is
// real and wired, but genuinely requires erosmancer to already be
// connected and tracking the target page — it is not a drop-in replacement
// for every browser_action step, only the ones with a real, resolvable
// erosmancer node identity.
const WIRE_PORT = parseInt(process.env.EROS_WIRE_PORT || '7704', 10);
const EROS_EXECUTE_ACTIONS = new Set(['click', 'type', 'hover', 'scroll', 'evaluate', 'navigate', 'screenshot']);

function _erosRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      { hostname: '127.0.0.1', port: WIRE_PORT, path: urlPath, method,
        timeout: 20000, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (_) { resolve({ status: res.statusCode, body: { ok: false, error: 'erosmancer wire returned an unparseable body' } }); }
      }); }
    );
    req.on('error', (e) => resolve({ status: 503, body: { ok: false, error: `erosmancer wire unreachable on :${WIRE_PORT}: ${e.code || e.message}` } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 503, body: { ok: false, error: 'erosmancer wire timed out' } }); });
    if (data) req.write(data);
    req.end();
  });
}

/** _erosSetProfile — real, once-per-run behavior profile for a tab. */
async function _erosSetProfile(tabId, profile) {
  const r = await _erosRequest('POST', '/eros/behavior/profile', { sessionId: tabId, profile });
  return r.body;
}

/** _erosExecute — one real step through erosmancer's real, unified pipeline. */
async function _erosExecute(tabId, action, targetUuid, payload, profile) {
  if (!EROS_EXECUTE_ACTIONS.has(action)) {
    return { error: `"${action}" is not one of erosmancer's real execute actions: ${[...EROS_EXECUTE_ACTIONS].join(', ')}` };
  }
  const r = await _erosRequest('POST', '/eros/execute', { action, uuid: targetUuid, tabId, payload, profile });
  if (r.status >= 400 || r.body?.ok === false) return { error: r.body?.error || `erosmancer execute failed (HTTP ${r.status})` };
  return { ok: true, result: r.body.result, planId: r.body.planId };
}

function _jaa() {
  try { return require('../../../../cortex/memory/jaa-db').jaaDB; }
  catch (e) { return null; }
}

/**
 * _current(jaa, name) — the real, current state of a macro by name.
 * §BUGFIX 2026-08-23, caught by actually running create→delete→get end
 * to end, not trusted from the individual functions in isolation: soft-
 * delete here works by inserting a NEW row with _deleted:true rather
 * than mutating the original (this table has no real update-in-place,
 * matching the same soft-delete pattern used elsewhere in this
 * codebase) — but jaaDB's own real query(table, pred, limit) returns
 * matches in INSERTION order and stops at `limit`, confirmed by reading
 * its real implementation directly. query(pred, 1) was therefore
 * returning the OLDEST matching row, not the current one — a "deleted"
 * macro's get() call returned the original, pre-delete row every time.
 * Real fix: never limit to 1 on a name lookup; take every match and use
 * the LAST (most recent) as the real, current state.
 */
function _current(jaa, name) {
  const rows = jaa.query('macros', r => r.name === name);
  return rows.length ? rows[rows.length - 1] : null;
}

/**
 * _substitute(value, params) — real, recursive {{name}} substitution.
 * Walks strings, arrays, and plain objects; leaves everything else
 * (numbers, booleans, null) untouched. A referenced param that was
 * never supplied is left as the literal "{{name}}" text rather than
 * silently becoming "undefined" — §1.2, a missing param should be
 * visibly wrong, not quietly wrong.
 */
function _substitute(value, params) {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
  }
  if (Array.isArray(value)) return value.map(v => _substitute(v, params));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = _substitute(value[k], params);
    return out;
  }
  return value;
}

/** _urlMatches(pattern, url) — real glob-ish match: '*' → '.*', rest literal. */
function _urlMatches(pattern, url) {
  if (!pattern) return true; // no pattern given — a macro with no real constraint runs anywhere, on purpose
  const re = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(url);
}

const ACTIONS = {
  create(a) {
    if (!a.name || typeof a.name !== 'string') return { error: 'create needs a real, unique name (string)' };
    if (!Array.isArray(a.steps) || !a.steps.length) return { error: 'create needs a non-empty steps array — [{action, data}] or [{engine:"erosmancer", action, targetUuid, data}]' };
    const browserAction = require('../browser/browser-action.js');
    const validActions = new Set(browserAction.parameters.properties.action.enum);
    for (let i = 0; i < a.steps.length; i++) {
      const s = a.steps[i];
      if (!s) return { error: `steps[${i}] is missing` };
      // §EROS-INTEGRATION 2026-08-23 — a step opts into erosmancer's real
      // behavior-modeled execution with engine: 'erosmancer'; every other
      // step (the default, unmarked case) still goes through browser_action
      // exactly as before — this is additive, not a replacement.
      if (s.engine === 'erosmancer') {
        if (!EROS_EXECUTE_ACTIONS.has(s.action)) {
          return { error: `steps[${i}].action "${s.action}" is not one of erosmancer's real execute actions: ${[...EROS_EXECUTE_ACTIONS].join(', ')}` };
        }
        if (s.action !== 'navigate' && s.action !== 'screenshot' && s.action !== 'evaluate' && !s.targetUuid) {
          return { error: `steps[${i}] (erosmancer, action "${s.action}") needs a real targetUuid — a resolved node identity from erosmancer's own registry, not a CSS selector` };
        }
        continue;
      }
      if (!validActions.has(s.action)) {
        return { error: `steps[${i}].action "${s.action}" is not a real browser_action — one of: ${[...validActions].join(', ')}` };
      }
    }
    const jaa = _jaa();
    if (!jaa) return { error: 'cortex unavailable — cannot persist a macro that would vanish on restart' };
    const existing = _current(jaa, a.name);
    if (existing && !existing._deleted) return { error: `a macro named "${a.name}" already exists (uuid ${existing.uuid}) — delete it first or choose a different name` };
    // §EROS-INTEGRATION 2026-08-23 — James: "utilize erosmancerOS and
    // behavior engine for the macros." A real, per-macro behavior profile
    // — erosmancer's own real names (checked against its live
    // GET /api/behavior/profiles, not invented): precise, cautious,
    // exploratory, turbo. Applied once, for the whole run, before the
    // first step — matches erosmancer's own real API shape
    // (POST /api/behavior/profile takes one profile per session, not
    // one per action). Defaults to null (erosmancer picks its own real,
    // adaptive recommendation via its StrategyOptimizer) rather than a
    // guessed default — a macro author who cares picks one explicitly.
    const EROS_PROFILES = new Set(['precise', 'cautious', 'exploratory', 'turbo']);
    if (a.profile !== undefined && !EROS_PROFILES.has(a.profile)) {
      return { error: `profile "${a.profile}" is not real — one of: ${[...EROS_PROFILES].join(', ')}` };
    }
    const row = {
      uuid: randomUUID(), name: a.name, urlPattern: a.urlPattern || null,
      steps: a.steps, params: Array.isArray(a.params) ? a.params : [],
      profile: a.profile || null,
      description: a.description || null, createdAt: Date.now(), runCount: 0, lastRunAt: null,
    };
    jaa.insert('macros', row);
    return { ok: true, macro: row };
  },

  list() {
    const jaa = _jaa();
    if (!jaa) return { error: 'cortex unavailable' };
    // §BUGFIX 2026-08-23 — same real issue _current() exists to fix, at
    // list scale: every run() and delete() inserts a NEW row rather than
    // mutating in place, so a naive query(() => true) returns every
    // historical row for a macro that's ever been run or deleted, not
    // just its current state. Group by name, keep only the latest row
    // per name, then drop the ones whose current state is deleted.
    const all = jaa.query('macros', () => true, 500);
    const latest = new Map();
    for (const r of all) latest.set(r.name, r); // later rows overwrite earlier ones in iteration order
    const rows = [...latest.values()].filter(r => !r._deleted);
    return { ok: true, macros: rows.map(r => ({ name: r.name, urlPattern: r.urlPattern, steps: r.steps.length, params: r.params, runCount: r.runCount, lastRunAt: r.lastRunAt })) };
  },

  get(a) {
    if (!a.name) return { error: 'get needs name' };
    const jaa = _jaa();
    if (!jaa) return { error: 'cortex unavailable' };
    const row = _current(jaa, a.name);
    if (!row || row._deleted) return { error: `no macro named "${a.name}"` };
    return { ok: true, macro: row };
  },

  delete(a) {
    if (!a.name) return { error: 'delete needs name' };
    const jaa = _jaa();
    if (!jaa) return { error: 'cortex unavailable' };
    const row = _current(jaa, a.name);
    if (!row || row._deleted) return { error: `no macro named "${a.name}"` };
    // §1.2 — jaaDB has no real delete-by-uuid on this table pattern used
    // elsewhere in this codebase; mark-and-filter, same discipline as
    // other soft-delete tables (a real, auditable trail beats silently
    // vanishing a row).
    jaa.insert('macros', { ...row, _deleted: true, deletedAt: Date.now() });
    return { ok: true, deleted: a.name };
  },

  /**
   * bookmark(a) — James: "bookmarks to capture state." A real, NAMED
   * rewind snapshot — same underlying mechanism the auto-snapshot-on-
   * nav.loaded system already uses, just explicit and nameable so it's
   * findable later by something other than a timestamp.
   */
  async bookmark(a) {
    if (!a.agentId) return { error: 'bookmark needs agentId' };
    if (!a.label) return { error: 'bookmark needs a real label — this is what makes it findable later' };
    const rewind = require('../sandbox/rewind-replay.js');
    return rewind.execute({ action: 'snapshot', agentId: a.agentId, label: `bookmark:${a.label}` });
  },

  /**
   * openBookmark(a) — James: "we could map bookmarks/clear-glass
   * snapshots to a command/tool. like open any url in the last state it
   * was in using the bookmarks system." The real, natural pair to
   * bookmark() above — closes the loop from a label back to a live page.
   *
   * §HONEST — this is mostly plumbing, not new capability: checked
   * clear-glass/src/rewind/engine.js directly before building anything,
   * and restore() already navigates to the snapshot's real, captured
   * URL FIRST, then restores cookies/storage/scroll on top — the whole
   * "open a URL in the state it was in" behavior already exists end to
   * end. The one real gap: every rewind_replay action takes an opaque
   * snapshotId, not a human label. This finds the real, most recent
   * snapshot matching a bookmark label and restores THAT.
   */
  async openBookmark(a) {
    if (!a.agentId) return { error: 'openBookmark needs agentId' };
    if (!a.label) return { error: 'openBookmark needs a real label' };
    const rewind = require('../sandbox/rewind-replay.js');
    const listed = await rewind.execute({ action: 'list', agentId: a.agentId, limit: 200 });
    if (listed.error) return { error: listed.error };
    const wanted = `bookmark:${a.label}`;
    const snaps = (listed.snapshots || listed.result?.snapshots || []).filter(s => s.label === wanted);
    if (!snaps.length) return { error: `no bookmark named "${a.label}" for agent "${a.agentId}"` };
    // Real, most-recent-first pick — a label can be reused (bookmarking
    // the same page again later), and "open the bookmark" should mean
    // the current state, not the oldest one ever saved under that name.
    const target = snaps.slice().sort((x, y) => (y.ts || 0) - (x.ts || 0))[0];
    const r = await rewind.execute({ action: 'restore', agentId: a.agentId, snapshotId: target.id || target.snapshotId });
    if (r.error) return { error: r.error };
    return { ok: true, label: a.label, url: target.url || null, snapshotId: target.id || target.snapshotId, result: r.result };
  },

  /**
   * run(a) — the real execution. Checks the real, current URL against the
   * macro's own urlPattern (skips the check entirely if the macro was
   * created with no pattern), takes one real, labeled rewind snapshot
   * before the first step (the rollback point), then runs every step
   * sequentially through the real browser_action tool — stopping at the
   * first real failure rather than pressing on into an unknown page
   * state, and reporting exactly which step failed and why.
   */
  async run(a) {
    if (!a.name) return { error: 'run needs name' };
    if (!a.agentId) return { error: 'run needs agentId — which real browser session to run against' };
    const jaa = _jaa();
    if (!jaa) return { error: 'cortex unavailable' };
    const macro = _current(jaa, a.name);
    if (!macro || macro._deleted) return { error: `no macro named "${a.name}"` };

    const params = a.params || {};
    const missingParams = (macro.params || []).filter(p => !(p in params));
    if (missingParams.length) return { error: `run needs params: ${missingParams.join(', ')}` };

    const browserAction = require('../browser/browser-action.js');

    if (macro.urlPattern) {
      const urlResult = await browserAction.execute({ action: 'get_url', data: {} });
      const currentUrl = urlResult?.result?.url || urlResult?.result;
      if (currentUrl && !_urlMatches(macro.urlPattern, currentUrl)) {
        return { error: `macro "${a.name}" requires a URL matching "${macro.urlPattern}" — current page is "${currentUrl}"` };
      }
    }

    let snapshotId = null;
    if (!a.skipSnapshot) {
      const rewind = require('../sandbox/rewind-replay.js');
      const snap = await rewind.execute({ action: 'snapshot', agentId: a.agentId, label: `macro:${a.name}:${Date.now()}` });
      snapshotId = snap?.result?.snapshotId || snap?.snapshotId || null;
    }

    // §EROS-INTEGRATION 2026-08-23 — real, once-per-run profile
    // application, only if this macro has any erosmancer-engine steps AND
    // a real profile was set at creation. §1.2 — a failure to reach
    // erosmancer here is reported, not swallowed, but does not itself
    // block the run: a macro with zero erosmancer steps has no real
    // reason to need it reachable at all.
    const hasErosSteps = macro.steps.some(s => s.engine === 'erosmancer');
    let profileWarning = null;
    if (hasErosSteps && macro.profile) {
      const pr = await _erosSetProfile(a.agentId, macro.profile);
      if (pr?.ok === false || pr?.error) profileWarning = `couldn't set erosmancer profile "${macro.profile}": ${pr.error} — steps will run with erosmancer's own default/adaptive profile instead`;
    }

    const results = [];
    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i];
      const data = _substitute(step.data || {}, params);
      const r = step.engine === 'erosmancer'
        ? await _erosExecute(a.agentId, step.action, step.targetUuid, data, macro.profile)
        : await browserAction.execute({ action: step.action, data });
      results.push({ step: i, action: step.action, engine: step.engine || 'browser_action', ok: !r.error, error: r.error || null });
      if (r.error) {
        return {
          ok: false, macro: a.name, failedAtStep: i, error: r.error,
          stepsCompleted: i, stepsTotal: macro.steps.length, snapshotId, profileWarning, results,
        };
      }
    }

    jaa.insert('macros', { ...macro, runCount: (macro.runCount || 0) + 1, lastRunAt: Date.now() });
    return { ok: true, macro: a.name, stepsCompleted: macro.steps.length, snapshotId, profileWarning, results };
  },
};

module.exports = {
  name: 'macro',
  description:
    'Define, store, and replay a named, real sequence of steps against a URL pattern — for repeatable ' +
    'multi-step web flows (filling and submitting a form, a recurring multi-page task). Each step normally ' +
    'runs through browser_action, but a step can instead set engine:"erosmancer" to run through ErosmancerOS\'s ' +
    'real behavior-modeled execution pipeline (human-like timing/variance, adaptive learning) for its natively ' +
    'supported actions (click/type/hover/scroll/evaluate/navigate/screenshot) — those steps need a real ' +
    'targetUuid (a resolved node identity from erosmancer\'s own registry), not a CSS selector. IMPORTANT: for ' +
    'erosmancer\'s navigate/type/evaluate specifically, data is the RAW payload value directly (a URL string, ' +
    'text string, or JS expression string) — NOT an object like browser_action\'s {url:...}/{selector:...} ' +
    'shape; erosmancer coerces the whole data field with String(data). Actions: ' +
    '"create" (name, steps:[{action,data} or {engine:"erosmancer",action,targetUuid,data}], urlPattern?, ' +
    'params?:[string], profile?:"precise"|"cautious"|"exploratory"|"turbo", description?), "list", "get" (name), ' +
    '"delete" (name), "run" (name, agentId, params?:{}, skipSnapshot?) — checks the real current URL against the ' +
    'macro\'s pattern, applies the macro\'s real erosmancer profile if it has any erosmancer steps, takes a real ' +
    'rewind snapshot first (rollback point) unless skipSnapshot, then runs every step, stopping at the first ' +
    'real failure. "bookmark" (agentId, label) — a real, named state snapshot via the rewind engine. ' +
    '"openBookmark" (agentId, label) — navigates back to a bookmark\'s real, captured URL and restores its ' +
    'cookies/storage/scroll state on top; picks the most recent snapshot if the label was bookmarked more than ' +
    'once. Step data ' +
    'can use {{paramName}} placeholders, substituted from run\'s own params at execution time.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      name: { type: 'string', description: 'macro name — required for create/get/delete/run' },
      agentId: { type: 'string', description: 'which real browser session — required for run/bookmark' },
      label: { type: 'string', description: 'required for bookmark' },
      profile: { type: 'string', enum: ['precise', 'cautious', 'exploratory', 'turbo'], description: 'for create — erosmancer\'s real behavior profile, applied once per run to any erosmancer-engine steps' },
      urlPattern: { type: 'string', description: 'for create — a glob pattern ("*" wildcard) the macro requires the current page to match before running' },
      steps: { type: 'array', description: 'for create — [{action, data}], each action a real, valid browser_action name' },
      params: { description: 'for create: string[] of required param names. for run: {name: value} to substitute into step data.' },
      description: { type: 'string', description: 'optional, for create' },
      skipSnapshot: { type: 'boolean', description: 'for run — skip the pre-run rewind snapshot (faster, no rollback point)' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `macro ${args.action} failed: ${e.message}` }; }
  },
};
