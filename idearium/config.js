/**
 * idearium/config.js — the API server's own config surface.
 *
 * §REWIRED 2026-09-15 — James: "make a full config file for idearium to
 * change those kinds of values." This file used to own PORT, BINDING,
 * CHUNK_EVENTS_LIMIT and CORS as its own env-var constants, which meant
 * idearium had two config files that knew nothing about each other:
 * this one, and idearium/lib/config.js (the live, persisted, copilot-
 * writable store). Two config files for one system is the same drift
 * problem in miniature. These four values are now schema keys under
 * `api.*` in idearium/lib/config-core.cjs, and this module reads them
 * from there — so they are visible in GET /api/config, changeable in
 * idearium.config.json, and bounded like everything else.
 *
 * §WHAT STAYED HERE — nothing but the read. IDEARIUM_DATA_DIR /
 * PROJECTS_DIR remain in index.js: structural paths derived from
 * import.meta.url, not tunables (same precedent as leaving ROOT/UI_DIR in
 * place elsewhere). CAPS and ROUTE_CAP are deliberately still not config
 * — they are a real authorization schema (which capability a route
 * requires), not a value anyone should be able to tune at runtime.
 *
 * §READ-ONCE, HONESTLY — PORT and BINDING are read at listen() time and
 * a running socket does not move when they change. Changing them records
 * the intent and takes effect on the next start; that is stated plainly
 * here rather than left for someone to discover. CHUNK_EVENTS_LIMIT and
 * CORS are read per request, so those are genuinely live.
 *
 * §ENV STILL WINS AT BOOT — IDEARIUM_PORT / IDEARIUM_BIND are still
 * honored above the config for the process-level knobs, because a
 * supervisor (orchestrator/autopilot) sets those per spawn and must not
 * be overridden by a persisted row it can't see.
 */

import { getConfig } from './lib/config.js';

const api = () => getConfig().api;

export default {
  get PORT() {
    return parseInt(process.env.IDEARIUM_PORT || String(api().port), 10);
  },
  get BINDING() {
    return process.env.IDEARIUM_BIND || api().binding;
  },

  // Most-recent-first cap — a 58-chunk spec with retries can generate
  // hundreds of rows; the UI needs a trail, not the full audit log on
  // every request (real reasoning preserved from the source).
  get CHUNK_EVENTS_LIMIT() {
    return parseInt(process.env.IDEARIUM_CHUNK_EVENTS_LIMIT || String(api().chunk_events_limit), 10);
  },

  get CORS() {
    return {
      'Access-Control-Allow-Origin':  api().cors_origin,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };
  },
};
