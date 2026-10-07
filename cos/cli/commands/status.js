/**
 * cli/commands/status.js
 * COMPARTMENT OS — cos status <name>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Prints full compartment status. Now includes live process info
 * from process-runner registry when the compartment is running.
 *
 * Hook: hk-h-006
 * Event: host:compartment:status
 */

'use strict';

const { HOST } = require('../../foundation/event-contracts.js');
const { getProcess } = require('../../compartment/process-runner.js');

const STATE_ICON = {
  created:     '○',
  running:     '●',
  stopped:     '◌',
  error:       '✖',
  snapshotted: '◈',
};

function showStatus(host, name, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!name) { error('  Usage: cos status <name>'); return null; }

  const comp = host.store.getCompartmentByName(name)
            || host.store.getCompartment(name);

  if (!comp) { error(`  Error: compartment "${name}" not found`); return null; }

  host.bus.emit(HOST.COMPARTMENT_STATUS, {
    compartmentId: comp.id,
    name:          comp.name,
    state:         comp.state,
  });

  if (flags.json) {
    const proc   = getProcess(comp.id);
    const output = Object.assign({}, comp, proc ? {
      _process: {
        pid:       proc.process.pid,
        startedAt: proc.startedAt,
        uptime:    Date.now() - proc.startedAt,
        crashes:   proc.crashCount,
      },
    } : {});
    log(JSON.stringify(output, null, 2));
    return comp;
  }

  const proc     = getProcess(comp.id);
  const icon     = STATE_ICON[comp.state] || '?';
  const created  = comp.createdAt   ? new Date(comp.createdAt).toISOString()   : '—';
  const updated  = comp.updatedAt   ? new Date(comp.updatedAt).toISOString()   : '—';
  const snapshot = comp.snapshotAt  ? new Date(comp.snapshotAt).toISOString()  : 'never';
  const started  = comp.lastStartAt ? new Date(comp.lastStartAt).toISOString() : 'never';
  const stopped  = comp.lastStopAt  ? new Date(comp.lastStopAt).toISOString()  : 'never';

  const lines = [
    '',
    `  ${icon}  ${comp.name}  [${comp.state}]`,
    '',
    `  ── Identity ────────────────────────────────`,
    `     id:          ${comp.id}`,
    `     slug:        ${comp.slug || '—'}`,
    `     purpose:     ${comp.purpose || '—'}`,
    `     cos version: ${comp.cosVersion || '—'}`,
    `     created by:  ${comp.createdBy || '—'}`,
    '',
    `  ── Intent ──────────────────────────────────`,
    ...require('./intent.js').intentLines(comp, host.store),
    '',
    `  ── Runtime ─────────────────────────────────`,
    `     runtime:     ${comp.runtimeId || '—'}`,
    `     entry:       ${comp.entryFile || '—'}`,
    `     ui file:     ${comp.uiFile    || '—'}`,
    '',
    `  ── Process ─────────────────────────────────`,
  ];

  if (proc) {
    const uptime = Math.floor((Date.now() - proc.startedAt) / 1000);
    lines.push(`     pid:         ${proc.process.pid}`);
    lines.push(`     uptime:      ${uptime}s`);
    lines.push(`     crashes:     ${proc.crashCount}`);
    lines.push(`     runtime:     ${proc.runtimeId}`);
  } else {
    lines.push(`     pid:         — (not running)`);
    lines.push(`     uptime:      —`);
  }

  lines.push(
    '',
    `  ── Network ─────────────────────────────────`,
    `     isolated:    ${comp.network?.isolated ?? true}`,
    `     proxy port:  ${comp.network?.proxyPort ?? '—'}`,
    '',
    `  ── Filesystem ──────────────────────────────`,
    `     root:        ${comp.fs?.root || '—'}`,
    '',
    `  ── Timestamps ──────────────────────────────`,
    `     created:     ${created}`,
    `     updated:     ${updated}`,
    `     last start:  ${started}`,
    `     last stop:   ${stopped}`,
    `     snapshot:    ${snapshot}`,
    '',
  );

  log(lines.join('\n'));
  return comp;
}

module.exports = { showStatus };
