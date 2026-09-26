/**
 * cli/commands/map.js
 * COMPARTMENT OS — cos map [--json] [--watch]
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Renders the live system map.
 * Default: pretty-printed tree to stdout.
 * --json:  full SystemMap JSON.
 * --watch: live-updating (re-renders on host:map:updated event).
 *
 * Hook: hk-h-007 / hk-h-008 / hk-h-009
 * Events: host:map:rendered / host:map:exported / host:map:watching
 */

'use strict';

const { HOST }        = require('../../foundation/event-contracts.js');
const { COS_VERSION } = require('../../foundation/constants.js');

// ─── Tree Rendering ───────────────────────────────────────────────────────────

const STATE_ICON = {
  created:     '○',
  running:     '●',
  stopped:     '◌',
  error:       '✖',
  snapshotted: '◈',
};

/**
 * Render system map as a CLI tree.
 * @param {object} map  — SystemMap
 * @returns {string}
 */
function renderTree(map) {
  const lines = [];
  const now   = new Date(map.generatedAt || Date.now()).toISOString();

  lines.push('');
  lines.push(`  COMPARTMENT OS  v${map.version || COS_VERSION}`);
  lines.push(`  Generated: ${now}`);
  lines.push('');

  // ── Compartments ─────────────────────────────────────────────────
  const comps = map.compartments || [];
  lines.push(`  ┌── Compartments (${comps.length})`);

  if (comps.length === 0) {
    lines.push('  │    (none — run: cos create <name>)');
  } else {
    for (let i = 0; i < comps.length; i++) {
      const c      = comps[i];
      const isLast = i === comps.length - 1;
      const branch = isLast ? '  └──' : '  ├──';
      const cont   = isLast ? '       ' : '  │    ';
      const icon   = STATE_ICON[c.state] || '?';

      lines.push(`  ${branch} ${icon} ${c.name}  [${c.state}]`);
      lines.push(`  ${cont}  id:      ${c.id}`);
      if (c.slug)      lines.push(`  ${cont}  slug:    ${c.slug}`);
      if (c.runtimeId) lines.push(`  ${cont}  runtime: ${c.runtimeId}`);
      if (c.purpose)   lines.push(`  ${cont}  purpose: ${c.purpose}`);
      lines.push(`  ${cont}  network: ${c.network?.isolated ? 'isolated' : 'open'}`);
      if (c.uiFile)    lines.push(`  ${cont}  ui:      ${c.uiFile}`);
    }
  }

  lines.push('  │');

  // ── Hooks ─────────────────────────────────────────────────────────
  const hooks = map.hooks || [];
  lines.push(`  ├── Hooks (${hooks.length})`);
  if (hooks.length === 0) {
    lines.push('  │    (none registered)');
  } else {
    hooks.slice(0, 8).forEach((h, i) => {
      const isLast = i === Math.min(7, hooks.length - 1);
      const branch = isLast ? '  │  └──' : '  │  ├──';
      lines.push(`  ${branch} ${h.name}  [${h.id}]`);
    });
    if (hooks.length > 8) lines.push(`  │  └── … and ${hooks.length - 8} more`);
  }

  lines.push('  │');

  // ── Pipes ─────────────────────────────────────────────────────────
  const pipes = map.pipes || [];
  lines.push(`  ├── Pipes (${pipes.length})`);
  if (pipes.length === 0) {
    lines.push('  │    (none)');
  } else {
    pipes.forEach((p, i) => {
      const isLast = i === pipes.length - 1;
      const branch = isLast ? '  │  └──' : '  │  ├──';
      const state  = p.state === 'active' ? '⇒' : p.state === 'paused' ? '⇢' : '✖';
      lines.push(`  ${branch} ${state} ${p.name}  [${p.state}]`);
    });
  }

  lines.push('  │');

  // ── Plugins ───────────────────────────────────────────────────────
  const plugins = map.plugins || [];
  lines.push(`  └── Plugins (${plugins.length})`);
  if (plugins.length === 0) {
    lines.push('       (none installed)');
  } else {
    plugins.forEach(p => lines.push(`       · ${p.name || p.id}`));
  }

  lines.push('');
  return lines.join('\n');
}

// ─── renderMap ────────────────────────────────────────────────────────────────

/**
 * Execute cos map.
 * @param {object} host          — { sysmap, bus }
 * @param {{ json?: boolean, watch?: boolean }} flags
 * @param {object} out           — { log, error }
 */
function renderMap(host, flags = {}, out = {}) {
  const log = out.log || ((...a) => process.stdout.write(a.join(' ') + '\n'));

  const map = host.sysmap.get();

  if (flags.json) {
    log(JSON.stringify(map, null, 2));
    host.bus.emit(HOST.MAP_EXPORTED, { generatedAt: map.generatedAt });
    return;
  }

  log(renderTree(map));
  host.bus.emit(HOST.MAP_RENDERED, { generatedAt: map.generatedAt });

  if (flags.watch) {
    host.bus.emit(HOST.MAP_WATCHING, {});
    log('  Watching for changes… (Ctrl+C to exit)\n');

    host.bus.on(HOST.MAP_UPDATED, () => {
      // Clear and re-render
      process.stdout.write('\x1Bc'); // clear terminal
      const fresh = host.sysmap.get();
      log(renderTree(fresh));
      log('  [live] watching… (Ctrl+C to exit)\n');
    });

    // Keep process alive
    process.stdin.resume();
    process.on('SIGINT', () => {
      log('\n  Stopped watching.\n');
      process.exit(0);
    });
  }
}

module.exports = { renderMap, renderTree };
