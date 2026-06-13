/**
 * cli/commands/events.js
 * COMPARTMENT OS — cos events stream | tail [--n <count>]
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Subcommands:
 *   cos events stream    — live SSE-style stream of all kernel events
 *   cos events tail      — last N events from the ring buffer (default: 20)
 *
 * Hook: hk-h-018
 * Event: host:events:streaming
 */

'use strict';

const { HOST } = require('../../foundation/event-contracts.js');

// ─── Format a single event ────────────────────────────────────────────────────

function formatEvent(ev, opts = {}) {
  const ts  = new Date(ev.ts || Date.now()).toISOString();
  const seq = String(ev.seq ?? '?').padStart(6, ' ');
  const typeStr = String(ev.type || '—');

  if (opts.json) return JSON.stringify(ev);

  const payloadStr = ev.payload
    ? '  ' + JSON.stringify(ev.payload).slice(0, 120)
    : '';

  return `  [${seq}] ${ts}  ${typeStr}${payloadStr}`;
}

// ─── tail ─────────────────────────────────────────────────────────────────────

/**
 * Print the last N events from the ring buffer.
 * @param {object} host
 * @param {number} n
 * @param {{ json?: boolean }} flags
 * @param {object} out
 */
function tailEvents(host, n = 20, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  const events = host.bus.tail(n);

  if (flags.json) {
    log(JSON.stringify(events, null, 2));
    return;
  }

  if (events.length === 0) {
    log('\n  No events in ring buffer.\n');
    return;
  }

  log('');
  for (const ev of events) {
    log(formatEvent(ev, flags));
  }
  log(`\n  ${events.length} event${events.length !== 1 ? 's' : ''} (last ${n})\n`);
}

// ─── stream ───────────────────────────────────────────────────────────────────

/**
 * Stream all events live from the event bus until SIGINT.
 * @param {object} host
 * @param {{ json?: boolean }} flags
 * @param {object} out
 */
function streamEvents(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  host.bus.emit(HOST.EVENTS_STREAMING, { startedAt: Date.now() });

  if (!flags.json) {
    log('\n  Streaming events… (Ctrl+C to exit)\n');
  }

  // Subscribe to every event via onAny
  host.bus.onAny(ev => {
    log(formatEvent(ev, flags));
  });

  process.stdin.resume();
  process.on('SIGINT', () => {
    if (!flags.json) log('\n  Stopped streaming.\n');
    process.exit(0);
  });
}

// ─── Route subcommands ────────────────────────────────────────────────────────

/**
 * Route events subcommands.
 * @param {object} host
 * @param {string} sub    — 'stream' | 'tail'
 * @param {string[]} args
 * @param {object} flags  — { json?, n? }
 * @param {object} out
 */
function runEventsCommand(host, sub, args, flags = {}, out = {}) {
  const error = out.error || ((...a) => console.error(...a));
  const n     = parseInt(flags.n) || 20;

  switch (sub || 'tail') {
    case 'stream':
      return streamEvents(host, flags, out);
    case 'tail':
      return tailEvents(host, n, flags, out);
    default:
      error('  Usage: cos events <stream|tail> [--n <count>] [--json]');
  }
}

module.exports = { runEventsCommand, tailEvents, streamEvents, formatEvent };
