'use strict';
/**
 * lib/nexus-uri.js — the one real resolver for the nexus:// URI scheme.
 *
 * §BUILT 2026-09-16, from nexus-uri-clearglass-mesh-integration.spec's
 * thread_2 (phase C — "one shared route-resolver module, not three
 * separate parsers"). James: "giving cos and idearium build uri" plus
 * confirmation to add remote-desktop as a fifth route.
 *
 * §THREAT MODEL — this file's whole shape is dictated by that spec's
 * security_requirements, not by convenience:
 *   - closed_allowlist_only: ROUTES below is the entire universe of what
 *     this scheme can do. An unrecognized pattern is rejected outright —
 *     never forwarded to a generic handler, shell, or exec path. This is
 *     the exact shape of the classic URI-scheme CVE (argument injection
 *     into whatever the scheme launches), so there is no "fallback"
 *     branch anywhere in this file, deliberately.
 *   - param_validation_before_use: every {param} is checked against a
 *     real format (uuid regex) BEFORE resolve() ever calls an action.
 *     A malformed param is a rejection, not a best-effort pass-through.
 *   - treat_every_uri_as_untrusted: resolve()'s input is always assumed
 *     to be attacker-constructed — any webpage can build and open a
 *     nexus:// link. Nothing here trusts a URI more because it arrived
 *     via the OS shell instead of, say, a paste.
 *
 * §ACTIONS ARE INJECTED, NOT IMPORTED — this module has zero require()s
 * on cos/idearium/clear-glass/remote-desktop. Each subsystem calls
 * registerAction(routeId, fn) from its OWN process (COS's host process,
 * idearium's API process, Clear Glass's Electron main process) and hands
 * this module a function closed over whatever real state it needs. That
 * is what keeps this a resolver and not a fourth copy of routing logic
 * for systems that already have their own — same reasoning as
 * idearium/lib/config-core.cjs's "one implementation, multiple entry
 * points" split earlier in this build.
 *
 * §THE REMOTE-DESKTOP ROUTE, SPECIFICALLY — session-token.js's own
 * design (checked directly: issueToken/verifyToken) makes a bare
 * sessionId inert — nothing joins a session without a separate,
 * short-lived (5min TTL), out-of-band token. That is what makes this
 * route SAFE to put in a closed-world URI scheme any webpage can invoke.
 * But viewer.html's own query string ALSO accepts a `token` param (pre-
 * fills the join form from it) — which is the one thing this resolver
 * must never do: sessionParam below is validated and passed through,
 * and NOTHING in this file, nor the doc comment on registerAction for
 * 'remote-desktop', permits a token to travel in a nexus:// URI. A URI
 * carrying a live capability token would turn a shareable, webpage-
 * constructible link into a bearer credential — exactly the elevated
 * blast radius the spec's threat model (state-level DPI adversary,
 * abuse-victim device-access adversary) singles this build out for.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ROUTES — the closed allowlist. Every entry is exactly what thread_2's
 * proposed_route_allowlist names, plus the confirmed remote-desktop
 * addition. Nothing else exists. `pattern` uses {name} placeholders
 * matched 1:1 against `params`, each validated with `test()` before the
 * match is accepted as real — not merely captured by the regex.
 */
const ROUTES = Object.freeze([
  {
    id: 'repo',
    pattern: 'repo/{repoUuid}',
    params: { repoUuid: (v) => UUID_RE.test(v) },
    describe: 'open a repo in idearium',
  },
  {
    id: 'repo-chunk',
    pattern: 'repo/{repoUuid}/chunk/{chunkUuid}',
    params: { repoUuid: (v) => UUID_RE.test(v), chunkUuid: (v) => UUID_RE.test(v) },
    describe: 'open one chunk of a repo in idearium',
  },
  {
    id: 'compartment',
    pattern: 'compartment/{compartmentId}',
    // §NOT A BARE UUID REGEX — checked against the real construction
    // site: cos/host/gates/compartment.js's CreateCompartmentGate
    // generates ids via crypto.randomUUID(), so today every real
    // compartmentId IS a uuid. But COS also resolves by NAME
    // (getCompartmentByName, used throughout lib/cos-bridge.js), and a
    // name is real, user-chosen, and not uuid-shaped. Rejecting
    // non-uuid compartment ids here would reject every name-based
    // reference COS itself considers valid — so this checks "safe as a
    // single path/lookup-key segment" (bounded length, no path
    // separators, no control characters) rather than "is a uuid",
    // which is the real, narrower thing this route actually needs
    // enforced before the value reaches cos-bridge.getCompartment().
    params: { compartmentId: (v) => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\/\\\x00-\x1f]/.test(v) },
    describe: 'focus or open a COS compartment',
  },
  {
    id: 'clearglass-session',
    pattern: 'clearglass/session/{sessionId}',
    params: { sessionId: (v) => UUID_RE.test(v) },
    describe: 'resume a ClearGlass capture session',
  },
  {
    id: 'remote-desktop',
    pattern: 'remote-desktop/{sessionId}',
    params: { sessionId: (v) => UUID_RE.test(v) },
    describe: 'open the remote-desktop viewer for a session (sessionId only — NEVER a token; see file header)',
  },
]);

// route.id -> compiled { regex, order: [paramNames] }
const _compiled = new Map();
for (const route of ROUTES) {
  const order = [];
  const escaped = route.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withParams = escaped.replace(/\\\{([a-zA-Z0-9_]+)\\\}/g, (_, name) => {
    order.push(name);
    return '([^/]+)';
  });
  _compiled.set(route.id, { regex: new RegExp(`^${withParams}$`), order });
}

// route.id -> action(params) registered by the owning subsystem
const _actions = new Map();

/**
 * registerAction(routeId, fn) — a subsystem's real handler for one
 * route. fn receives the validated params object and does whatever
 * "open"/"focus"/"resume" means for that subsystem — this module never
 * looks inside fn or constrains what it does; the SAFETY boundary is
 * entirely in getting here at all (route matched, every param passed
 * its validator) not in what happens after.
 *
 * Re-registering the same routeId replaces the previous action —
 * intentional, not guarded: a subsystem restarting (idearium's API
 * process reloading, COS's host re-initializing) must be able to
 * re-register its own handler without this module accumulating stale
 * closures over a dead process's state.
 */
function registerAction(routeId, fn) {
  if (!_compiled.has(routeId)) {
    throw new Error(`lib/nexus-uri: '${routeId}' is not in the closed allowlist — cannot register an action for a route that doesn't exist. Real routes: ${ROUTES.map(r => r.id).join(', ')}`);
  }
  if (typeof fn !== 'function') throw new Error(`lib/nexus-uri: action for '${routeId}' must be a function`);
  _actions.set(routeId, fn);
}

/**
 * parse(uri) -> { ok, routeId, params } | { ok:false, error }.
 * Real parsing only — does not call any action. Exposed separately from
 * resolve() so a caller (a confirmation dialog, a log line) can inspect
 * what a URI WOULD do before anything runs — useful given
 * treat_every_uri_as_untrusted: showing the user "this will open
 * compartment X" before dispatching it is real defense-in-depth for a
 * scheme any webpage can construct.
 */
function parse(uri) {
  if (typeof uri !== 'string') return { ok: false, error: 'uri must be a string' };
  const m = /^nexus:\/\/(.+)$/i.exec(uri.trim());
  if (!m) return { ok: false, error: 'not a nexus:// uri' };
  // §CLOSED ALLOWLIST — path only, deliberately. No query string, no
  // fragment is ever parsed or exposed to an action: viewer.html's own
  // `?token=` convention is exactly the shape this refuses to carry
  // (see file header). Stripped here, once, rather than trusted to be
  // absent by every future caller.
  const path = m[1].split(/[?#]/)[0].replace(/^\/+/, '');

  for (const route of ROUTES) {
    const compiled = _compiled.get(route.id);
    const match = compiled.regex.exec(path);
    if (!match) continue;

    const params = {};
    for (let i = 0; i < compiled.order.length; i++) {
      const name = compiled.order[i];
      const raw = decodeURIComponent(match[i + 1]);
      if (!route.params[name](raw)) {
        return { ok: false, error: `param '${name}' failed validation for route '${route.id}'` };
      }
      params[name] = raw;
    }
    return { ok: true, routeId: route.id, params, describe: route.describe };
  }
  return { ok: false, error: `no route matches '${path}' — closed allowlist, unrecognized paths are rejected outright` };
}

/**
 * resolve(uri) -> Promise<{ ok, routeId, result }> | { ok:false, error }.
 * parse(), then dispatch to the registered action. A route that matched
 * but has no registered action (the subsystem never called
 * registerAction — e.g. clear-glass/session today, honestly: no real
 * capture-session module exists yet to resolve to) is a real, distinct
 * failure from "route doesn't exist", surfaced as such rather than
 * silently doing nothing.
 */
async function resolve(uri) {
  const parsed = parse(uri);
  if (!parsed.ok) return parsed;

  const action = _actions.get(parsed.routeId);
  if (!action) {
    return { ok: false, error: `route '${parsed.routeId}' matched but has no registered action — that subsystem hasn't wired nexus-uri.registerAction() yet`, routeId: parsed.routeId, params: parsed.params };
  }

  try {
    const result = await action(parsed.params);
    return { ok: true, routeId: parsed.routeId, params: parsed.params, result };
  } catch (e) {
    return { ok: false, error: `action for '${parsed.routeId}' threw: ${e.message}`, routeId: parsed.routeId };
  }
}

module.exports = { parse, resolve, registerAction, ROUTES, UUID_RE };
