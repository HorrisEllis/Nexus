/**
 * cli/commands/list.js
 * COMPARTMENT OS — cos list
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Lists all compartments with: name, state, runtime, id.
 * Outputs a pretty table (default) or JSON (--json flag).
 *
 * Hook: hk-h-002
 * Event: host:compartments:listed
 */

'use strict';

const { HOST } = require('../../foundation/event-contracts.js');

// ─── State display helpers ────────────────────────────────────────────────────

const STATE_SYMBOL = {
  created:     '○',
  running:     '●',
  stopped:     '◌',
  error:       '✖',
  snapshotted: '◈',
};

const STATE_LABEL = {
  created:     'created',
  running:     'running',
  stopped:     'stopped',
  error:       'error',
  snapshotted: 'snapshotted',
};

// ─── Table rendering ─────────────────────────────────────────────────────────

/**
 * Pad string to width (right-pad with spaces).
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function pad(str, width) {
  const s = String(str ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

/**
 * Render compartments as a pretty CLI table.
 * @param {object[]} compartments
 * @returns {string}
 */
function renderTable(compartments) {
  if (compartments.length === 0) {
    return '  No compartments. Run: cos create <name>\n';
  }

  const lines = [];

  // Header
  lines.push('');
  lines.push(
    '  ' +
    pad('',         2)  + '  ' +
    pad('NAME',     24) + '  ' +
    pad('STATE',    12) + '  ' +
    pad('RUNTIME',  12) + '  ' +
    pad('ID',       38)
  );
  lines.push(
    '  ' +
    pad('',         2)  + '  ' +
    pad('─'.repeat(24), 24) + '  ' +
    pad('─'.repeat(12), 12) + '  ' +
    pad('─'.repeat(12), 12) + '  ' +
    pad('─'.repeat(36), 38)
  );

  for (const c of compartments) {
    const sym   = STATE_SYMBOL[c.state] || '?';
    const state = STATE_LABEL[c.state]  || c.state;
    lines.push(
      '  ' +
      pad(sym,          2)  + '  ' +
      pad(c.name,       24) + '  ' +
      pad(state,        12) + '  ' +
      pad(c.runtimeId || '—', 12) + '  ' +
      pad(c.id,         38)
    );
  }

  lines.push('');
  lines.push(`  ${compartments.length} compartment${compartments.length !== 1 ? 's' : ''}`);
  lines.push('');

  return lines.join('\n');
}

// ─── listCompartments ─────────────────────────────────────────────────────────

/**
 * Execute cos list.
 * @param {object} host       — { store, bus }
 * @param {{ json?: boolean }} flags
 * @param {object} out        — { log, error }
 * @returns {object[]} compartments
 */
function listCompartments(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => console.log(...a));

  const compartments = host.store.listCompartments();

  host.bus.emit(HOST.COMPARTMENTS_LISTED, {
    count: compartments.length,
  });

  if (flags.json) {
    log(JSON.stringify(compartments, null, 2));
  } else {
    log(renderTable(compartments));
  }

  return compartments;
}

module.exports = { listCompartments, renderTable };
