'use strict';
/**
 * copilot/routes/person-model.js
 * All /api/person-model/* routes — the co-pilot's model of the USER
 * (distinct from lib/self-model.js, the co-pilot's model of ITSELF).
 * Matches registry-components.js's person_model.* group: portrait,
 * review, accept, reject, state, connect, meaning, chain, export,
 * forget, purge, health.
 *
 * §IP-5 — accept() is USER-ONLY. This route hard-codes by:'user' rather
 * than trusting the request body, so an agent posting by:'user' cannot
 * launder itself into acceptance through this route.
 *
 * §CR-004 2026-08-19 — component ids are person_model.* (underscore), the
 * HTTP paths stay person-model/* (hyphen). See registry-components.js's
 * own comment for the full story of why that split exists — it is not a
 * typo and must not be "fixed" to match.
 *
 * §UNDOCUMENTED ROUTE FOUND DURING EXTRACTION — POST /api/person-model/correct
 * is live here but has no corresponding entry in registry-components.js.
 * Every other route in this file has a component id; this one doesn't,
 * so it's invisible to the grammar engine and to anyone reading the
 * registry as the source of truth for what this system can do. Left
 * functionally unchanged — flagging it rather than silently either
 * removing it or inventing a component id for it.
 */

async function handle(req, res, { method, url, pathname, json, readBody }) {
  if (!pathname.startsWith('/api/person-model')) return false;

  let pm;
  try { pm = require('../lib/person-model'); }
  catch (e) { json(res, 503, { ok: false, error: `person-model unavailable: ${e.message}` }); return true; }

  try {
    if (pathname === '/api/person-model/portrait' && method === 'GET') {
      const port = pm.portrait();
      const ex   = pm.exportAll();
      json(res, 200, { ...port, nodes: ex.nodes, edges: ex.edges, sessions: ex.sessions });
      return true;
    }
    if (pathname === '/api/person-model/review' && method === 'GET') { json(res, 200, pm.reviewQueue()); return true; }
    if (pathname === '/api/person-model/export' && method === 'GET') { json(res, 200, pm.exportAll()); return true; }
    if (pathname === '/api/person-model/health' && method === 'GET') { json(res, 200, pm.health()); return true; }
    if (pathname === '/api/person-model/chain'  && method === 'GET') { json(res, 200, pm.verifyChain()); return true; }
    if (pathname === '/api/person-model/meaning' && method === 'GET') {
      json(res, 200, pm.meaningOf(url.searchParams.get('of'), +(url.searchParams.get('depth') || 2)));
      return true;
    }

    if (method === 'POST') {
      const body = await readBody(req);

      if (pathname === '/api/person-model/accept') {
        json(res, 200, { ok: true, node: pm.accept(body.uuid, { type: body.type, label: body.label, by: 'user' }) });
        return true;
      }
      if (pathname === '/api/person-model/reject') {
        json(res, 200, pm.reject(body.uuid, body.reason)); return true;
      }
      if (pathname === '/api/person-model/state') {
        json(res, 200, { ok: true, node: pm.state(body) }); return true;
      }
      if (pathname === '/api/person-model/connect') {
        json(res, 200, { ok: true, edge: pm.connect(body.from, body.to, body.type, body.opts || {}) }); return true;
      }
      if (pathname === '/api/person-model/forget') {
        json(res, 200, { ok: true, node: pm.forget(body.id, body.reason) }); return true;
      }
      if (pathname === '/api/person-model/correct') {
        json(res, 200, { ok: true, node: pm.correct(body.id, body) }); return true;
      }
      // Deliberately awkward, and deliberately not reachable by accident:
      // the confirmation string is checked inside purge() itself.
      if (pathname === '/api/person-model/purge') { json(res, 200, pm.purge(body)); return true; }

      // NOTE: there is no HTTP route for infer(). Inference is an internal
      // operation; exposing it would give any caller a way to write
      // guesses into a person's model from outside.
    }
    json(res, 404, { ok: false, error: `no person-model route ${method} ${pathname}` });
    return true;
  } catch (e) {
    // A refusal (§stated-only, §IP-5, missing evidence) is a 400 with its
    // reason intact — the caller must be able to see WHICH rule refused it.
    json(res, 400, { ok: false, error: e.message });
    return true;
  }
}

module.exports = { handle };
