#!/usr/bin/env node
'use strict';
/**
 * cli/copilot-window.js — open the co-pilot CLI in a NEW terminal window
 * UUID: nexus-cli-copilot-window-v1-0000-2026-0730-001
 * Version: 1.0.0
 *
 * James: "make the cli open in a new window that connects to each system with
 * co-pilot." This launches copilot/cli.js — the CONSOLIDATED, grammar-driven
 * co-pilot console (already the /copilot + /cp entry in cli/nexus.js's
 * dispatcher) — in a fresh terminal window. copilot/cli.js reaches every system
 * through co-pilot: its grammar comes live from the component registry and any
 * input that isn't a known command falls through to co-pilot (guardian/agents),
 * so one window talks to all of NEXUS.
 *
 * §8.6 — builds OUTWARD from cli/boot-systems.js's cross-platform new-window
 * spawn (Windows powershell / macOS osascript / Linux x-terminal-emulator), the
 * pattern already used to open diagnose.js in a new window. No new spawn logic
 * invented. §1.2 — a platform without a known terminal falls back to running
 * in-place, loudly, never silently failing.
 */

const path  = require('path');
const { spawn } = require('child_process');

const ROOT       = path.join(__dirname, '..');
const COPILOT_CLI = path.join(ROOT, 'copilot', 'cli.js');

/**
 * openCopilotWindow(args) — spawn copilot/cli.js in a new terminal window.
 * Returns { spawned, mode } — mode is 'window' when a terminal opened, or
 * 'inline' if it fell back to the current process (§1.2 loud fallback).
 */
function openCopilotWindow(args = []) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const node  = process.execPath;
  const argStr = args.map(a => JSON.stringify(a)).join(' ');

  try {
    if (isWin) {
      // powershell opens a new window running the co-pilot CLI — avoids cmd /c
      // start title-quoting bugs (same choice cli/boot-systems.js made).
      const cmd = `Start-Process -FilePath '${node}' -ArgumentList '"${COPILOT_CLI}" ${argStr}' -WorkingDirectory '${ROOT}'`;
      spawn('powershell', ['-NoProfile', '-Command', cmd], { detached: true, stdio: 'ignore' }).unref();
      return { spawned: true, mode: 'window', platform: 'win32' };
    }
    if (isMac) {
      // osascript tells Terminal to open a new window and run the CLI.
      const script = `tell application "Terminal" to do script "cd '${ROOT}' && '${node}' '${COPILOT_CLI}' ${argStr}"`;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
      return { spawned: true, mode: 'window', platform: 'darwin' };
    }
    // Linux — try known terminals in order (same list as boot-systems.js).
    const terms = ['x-terminal-emulator', 'gnome-terminal', 'xfce4-terminal', 'konsole', 'xterm'];
    for (const term of terms) {
      try {
        const inner = `cd '${ROOT}' && '${node}' '${COPILOT_CLI}' ${argStr}; exec bash`;
        const p = spawn(term, ['-e', `bash -lc "${inner}"`], { detached: true, stdio: 'ignore' });
        p.unref();
        return { spawned: true, mode: 'window', platform: 'linux', terminal: term };
      } catch (_) { /* try the next terminal */ }
    }
    // §1.2 — no terminal found: fall back to running in-place, loudly.
    console.warn('[copilot-window] no terminal emulator found — running the co-pilot CLI in this window instead.');
    return _runInline(node, args);
  } catch (e) {
    console.warn(`[copilot-window] could not open a new window (${e.message}) — running inline.`);
    return _runInline(node, args);
  }
}

function _runInline(node, args) {
  const p = spawn(node, [COPILOT_CLI, ...args], { stdio: 'inherit' });
  return { spawned: true, mode: 'inline', proc: p };
}

module.exports = { openCopilotWindow };

// CLI entry: `node cli/copilot-window.js [args...]`
if (require.main === module) {
  const result = openCopilotWindow(process.argv.slice(2));
  if (result.mode === 'window') {
    console.log(`[copilot-window] co-pilot CLI opened in a new window (${result.platform}${result.terminal ? '/' + result.terminal : ''}) — connected to NEXUS through co-pilot.`);
    process.exit(0);
  }
  // inline mode keeps the process alive via the child's stdio inheritance
}
