#!/usr/bin/env node
'use strict';
// ── nexus.js — unified NEXUS Systems CLI ──────────────────────────────────────
// Run from the NEXUS-Systems-v1 root:
//
//   node nexus.js <command> [args]
//
// Delegates to the right subsystem. Checks API health first.
// On failure: prints what to do, not a cryptic error.

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT     = __dirname;
const API_PORT = parseInt(process.env.IDEARIUM_PORT || '4800');

const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  blue:'\x1b[34m', cyan:'\x1b[36m', magenta:'\x1b[35m', gray:'\x1b[90m',
};
const c  = (col, t) => `${C[col]||''}${t}${C.reset}`;
const er = (m) => { console.error(`${c('red','✗')} ${m}`); process.exit(1); };

const VORTEX_CMDS  = new Set(['push','pull','log','diff','status','branch','ci']);
const IDEARIUM_CMDS= new Set(['idea','spec','gap','push','pull','diff','agents','dispatch','snr']);
const LOCAL_CMDS   = new Set(['help','version','start','--help','-h']);

// ── health check ──────────────────────────────────────────────────────────────
function checkAPI() {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${API_PORT}/health`, { timeout: 2000 }, res => {
      let raw=''; res.on('data', d=>raw+=d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ok:true}); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── delegate to sub-CLI ───────────────────────────────────────────────────────
function runCLI(file, extraArgs = []) {
  const child = spawn('node', [file, ...extraArgs], { stdio: 'inherit' });
  child.on('error', e => er(`Cannot run ${file}: ${e.message}`));
  child.on('exit', code => process.exit(code ?? 0));
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const cmd  = argv[0];

  // --- Help / version (no API needed) ---
  if (!cmd || LOCAL_CMDS.has(cmd)) {
    printHelp();
    process.exit(0);
  }

  // --- vortex sub-commands ---
  if (cmd === 'vortex') {
    const vortexArgs = argv.slice(1);
    const h = await checkAPI();
    if (!h) needsAPI();
    runCLI(path.join(ROOT, 'vortex', 'cli.js'), vortexArgs);
    return;
  }

  // --- vortex commands used directly (push/pull/log/diff/branch) ---
  if (VORTEX_CMDS.has(cmd)) {
    const h = await checkAPI();
    if (!h) needsAPI();
    runCLI(path.join(ROOT, 'vortex', 'cli.js'), argv);
    return;
  }

  // --- Idearium commands (idea/spec/gap/agents/dispatch/snr) ---
  if (IDEARIUM_CMDS.has(cmd)) {
    const h = await checkAPI();
    if (!h) needsAPI();
    runCLI(path.join(ROOT, 'idearium', 'cli', 'index.js'), argv);
    return;
  }

  // --- Guardian sub-commands (if guardian cli present) ---
  if (cmd === 'guardian') {
    const guardianCLI = path.join(ROOT, 'guardian', 'guardian-cli.js');
    const fs = require('fs');
    if (!fs.existsSync(guardianCLI)) {
      console.error(c('red','✗') + ' guardian-cli.js not found at ' + guardianCLI);
      console.error('  Place guardian/ folder alongside this file.');
      process.exit(1);
    }
    runCLI(guardianCLI, argv.slice(1));
    return;
  }

  // --- Unknown ---
  console.error(`${c('red','✗')} Unknown command: ${cmd}`);
  console.error(`  Run: ${c('yellow','node nexus.js help')}`);
  process.exit(1);
}

function needsAPI() {
  console.error('');
  console.error(c('red','  Idearium API is not running.'));
  console.error('');
  console.error(`  Start it first (keep this terminal open):`);
  console.error(`  ${c('yellow','  node start.js')}`);
  console.error('');
  console.error(`  Then in a new terminal, run your command again.`);
  console.error('');
  process.exit(1);
}

function printHelp() {
  console.log(`
${c('bold','  NEXUS Systems v1.0')} — Unified CLI
${c('gray','  node nexus.js <command> [args]')}

${c('cyan','  BOOT')}
  ${c('yellow','node start.js')}                Start Idearium API at :4800 ${c('gray','← do this first')}
  ${c('yellow','node start.js --open')}         Start + open systems-ui.html in browser
  ${c('yellow','node start.js --status')}       Check what services are running

${c('cyan','  IDEAS')}
  ${c('yellow','node nexus.js idea add "text"')}       Create an idea
  ${c('yellow','node nexus.js idea list')}             List all ideas by tension
  ${c('yellow','node nexus.js idea show <uuid>')}      Full detail
  ${c('yellow','node nexus.js idea tension <uuid>')}   Recompute tension score

${c('cyan','  SPECS')}
  ${c('yellow','node nexus.js spec new <idea-uuid>')}  Create spec from idea
  ${c('yellow','node nexus.js spec show <uuid>')}      Show spec + checklist
  ${c('yellow','node nexus.js spec check <uuid>')}     Run checklist compliance
  ${c('yellow','node nexus.js spec build <uuid>')}     Run CI gate

${c('cyan','  GAPS')}
  ${c('yellow','node nexus.js gap list')}              All open gaps
  ${c('yellow','node nexus.js gap create "desc"')}     Create gap
  ${c('yellow','node nexus.js gap resolve <uuid>')}    Mark resolved

${c('cyan','  VORTEX (version control)')}
  ${c('yellow','node nexus.js push "message"')}        Commit full workspace snapshot
  ${c('yellow','node nexus.js pull')}                  List snapshots
  ${c('yellow','node nexus.js log')}                   Commit history with gap counts
  ${c('yellow','node nexus.js diff <a> <b>')}          Compare two snapshots
  ${c('yellow','node nexus.js vortex status')}         Current workspace state
  ${c('yellow','node nexus.js vortex ci <spec>')}      Spec compliance gate

${c('cyan','  AGENTS')}
  ${c('yellow','node nexus.js agents')}                List connected Guardian agents
  ${c('yellow','node nexus.js dispatch <agent> "p"')}  Dispatch to Guardian agent

${c('cyan','  SYSTEM')}
  ${c('yellow','node nexus.js snr')}                   Signal-to-noise ratio
  ${c('yellow','node nexus.js vortex status')}         Full system state

${c('gray','  Requires Idearium API running (node start.js) for all commands except help.')}
`);
}

main().catch(e => { console.error(c('red','✗') + ' ' + e.message); process.exit(1); });
