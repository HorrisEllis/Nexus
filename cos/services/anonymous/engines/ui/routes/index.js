'use strict';
/**
 * engines/ui/routes/index.js — assembles the route table and matches requests.
 *
 * Each module exports a factory taking the engine context and returning a map
 * of "METHOD /path" -> handler. Paths may contain :params.
 *
 * The monolith matched routes with a 300-line if/else chain in which order was
 * load-bearing and several branches were unreachable — `/ui/webserver/vhost`
 * shadowed `/ui/webserver/vhost/update`, for instance. Static segments here
 * always win over parameterised ones regardless of declaration order.
 */

const MODULES = [
  require('./system'),
  require('./dns'),
  require('./sites'),
  require('./services'),
  require('./security'),
  require('./files'),
  require('./network'),
  require('./phase2'),
];

function compile(spec) {
  const [method, pattern] = spec.trim().split(/\s+/);
  const segments = pattern.split('/').filter(Boolean).map(s =>
    s.startsWith(':') ? { param: s.slice(1) } : { literal: s });
  return { method: method.toUpperCase(), pattern, segments };
}

/** @returns {{match:Function, routes:Array}} */
function buildRouter(ctx) {
  const routes = [];
  for (const factory of MODULES) {
    const table = factory(ctx);
    for (const [spec, handler] of Object.entries(table)) {
      const r = compile(spec);
      routes.push({ ...r, handler });
    }
  }

  // Static-first: a route with fewer params outranks one with more at the
  // same length, so /vhost/update beats /vhost/:hostname.
  routes.sort((a, b) => {
    const pa = a.segments.filter(s => s.param).length;
    const pb = b.segments.filter(s => s.param).length;
    return pa - pb;
  });

  function match(method, urlPath) {
    const parts = urlPath.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method) continue;
      if (r.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = r.segments[i];
        if (seg.literal !== undefined) {
          if (seg.literal !== parts[i]) { ok = false; break; }
        } else {
          params[seg.param] = parts[i];
        }
      }
      if (ok) return { handler: r.handler, params, pattern: r.pattern };
    }
    return null;
  }

  /** Distinct methods available at a path — used to answer 405 correctly. */
  function methodsFor(urlPath) {
    const parts = urlPath.split('/').filter(Boolean);
    const found = new Set();
    for (const r of routes) {
      if (r.segments.length !== parts.length) continue;
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = r.segments[i];
        if (seg.literal !== undefined && seg.literal !== parts[i]) { ok = false; break; }
      }
      if (ok) found.add(r.method);
    }
    return [...found];
  }

  return { match, methodsFor, routes };
}

module.exports = { buildRouter };
