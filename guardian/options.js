'use strict';
/**
 * guardian/options.js — guardian's options (OP1, docs/2026-10-10-shape-of-nexus-phasemap.spec). The first system on
 * lib/options.js. Every default is the value the code used before this file; every env var it names still works and wins.
 * James: "i prefer options over hard coded, and i prefer it over code honestly."
 * Seen and changed in the settings console (nexus/guardian → System) and with `idearium options guardian …`.
 */
const { createOptions } = require('../lib/options.js');

const SCHEMA = {
  jobs: {
    pickup_ms:            { type: 'number', default: 90000,   min: 1,     max: 3600000,  unit: 'ms', env: 'GUARDIAN_PICKUP_MS',
      description: 'How long a tab may hold a job without saying anything about it (accepted, typed, a chunk, an error) before the job ends at "tab takes the job". Nothing was typed, so nothing is sent twice.' },
    no_tab_ms:            { type: 'number', default: 45000,   min: 1,     max: 3600000,  unit: 'ms', env: 'GUARDIAN_NO_TAB_MS',
      description: 'With no tab open for the agent, how long a waiting caller waits for one (time for Clear Glass to open it) before it is told and the job is cancelled.' },
    economy_wait_ms:      { type: 'number', default: 30000,   min: 0,     max: 3600000,  unit: 'ms', env: 'GUARDIAN_ECONOMY_WAIT_MS',
      description: 'The longest economy hold a waiting caller sits through; a longer one is said at once with the limit, and the job is cancelled so the route can move on.' },
    completion_idle_ms:   { type: 'number', default: 900000,  min: 1,    max: 86400000, unit: 'ms', env: 'GUARDIAN_COMPLETION_TIMEOUT_MS',
      description: 'With a job in a tab, how long with no activity at all (no chunk, no progress) before guardian acts: a typed prompt waits for the chat transcript, an untyped one is sent again.' },
    empty_reply_grace_ms: { type: 'number', default: 120000,  min: 1,     max: 3600000,  unit: 'ms', env: 'GUARDIAN_EMPTY_REPLY_GRACE_MS',
      description: 'How long guardian waits for the chat transcript to carry a reply when a tab reported an empty one, or a typed job went quiet.' },
    resume_grace_ms:      { type: 'number', default: 60000,   min: 1,     max: 600000,   unit: 'ms', env: 'GUARDIAN_RESUME_GRACE_MS',
      description: 'How long a tab that is reloading into a job\'s own chat may be disconnected without the job being treated as lost.' },
    max_response_chars:   { type: 'number', default: 5000000, min: 10000, max: 100000000, unit: 'chars', env: 'GUARDIAN_MAX_RESPONSE_CHARS',
      description: 'The longest reply kept on a job; a longer one is cut and flagged as cut.' },
  },
  retry: {
    max_attempts:         { type: 'number', default: 4,       min: 1,     max: 10,
      description: 'How many times a job a tab could not take (busy, no input box, send failed, no reply) is tried, counting the first.' },
    first_wait_ms:        { type: 'number', default: 4000,    min: 0,     max: 600000,   unit: 'ms',
      description: 'Wait before the first retry; the next waits are 3× and 7.5× this.' },
    busy_first_wait_ms:   { type: 'number', default: 15000,   min: 0,     max: 600000,   unit: 'ms',
      description: 'Wait before the first retry when the tab was still answering another job; the next waits are 2× and 4× this.' },
  },
  ask: {
    default_timeout_ms:   { type: 'number', default: 90000,   min: 1,     max: 3600000,  unit: 'ms',
      description: 'How long a caller of guardian\'s ask waits when it does not say (Idearium passes its own, 300 s for a browser agent).' },
  },
  routing: {
    transport:            { type: 'enum', values: ['ncp-only', 'mesh-first'], default: 'ncp-only', env: 'GUARDIAN_TRANSPORT',
      description: 'ncp-only: jobs go to the agent tab through its userscript. mesh-first: Clear Glass\'s agent mesh first, the userscript after.' },
    wake_max_depth:       { type: 'number', default: 3,       min: 0,     max: 10,       env: 'GUARDIAN_WAKE_MAX_DEPTH',
      description: 'How many times an agent\'s reply may wake another agent in a row.' },
  },
};

let _opts = null;
function options() { return _opts || (_opts = createOptions({ system: 'guardian', schema: SCHEMA })); }

module.exports = { SCHEMA, options, get: (id) => options().get(id) };
