'use strict';
// event-taxonomy.js — the system's events, generated from its event nodes (data/nodes/event/), never hand-written.
// The system events below are the ones the skeleton's own parts emit whether or not a node names them.
const SYSTEM = ['{{slug}}.heartbeat', '{{slug}}.node.changed', '{{slug}}.command.ran', '{{slug}}.listener.failed'];

function taxonomy(index) {
  const out = Object.fromEntries(SYSTEM.map(e => [e, { from: 'skeleton' }]));
  for (const e of index.list('event')) out[e.id] = { from: 'node', command: e.command, payload: e.payload };
  return out;
}

function declared(index) { return (event) => SYSTEM.includes(event) || !!index.get('event', event); }

module.exports = { SYSTEM, taxonomy, declared };
