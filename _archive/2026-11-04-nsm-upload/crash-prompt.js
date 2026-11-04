#!/usr/bin/env node
/**
 * crash-prompt.js — Spawned by the bridge watchdog when NEXUS.exe dies unexpectedly.
 * Shows a native dialog asking the user if they want to run diagnostics.
 * Completely standalone — no Electron, no npm deps beyond Node built-ins.
 *
 * Usage (called by nexus-svc.js watchdog):
 *   node service/crash-prompt.js [--exe path/to/NEXUS.exe] [--log path/to/nexus-crash.log]
 */

'use strict';

const { execSync, spawn } = require('child_process');
const path  = require('path');
const fs    = require('fs');

const args    = process.argv.slice(2);
function getArg(name) { const i = args.indexOf(name); return i >= 0 ? args[i+1] : null; }

const NEXUS_EXE = getArg('--exe')  || findNexusExe();
const LOG_FILE  = getArg('--log')  || findLogFile();
const PLATFORM  = process.platform;

// ── Find NEXUS.exe next to this script's parent dir ──────────────
function findNexusExe() {
  const candidates = [
    path.join(__dirname, '..', 'NEXUS.exe'),
    path.join(path.dirname(process.execPath), 'NEXUS.exe'),
    path.join(__dirname, '..', '..', 'NEXUS.exe'),
  ];
  return candidates.find(fs.existsSync) || null;
}

function findLogFile() {
  const candidates = [
    NEXUS_EXE ? path.join(path.dirname(NEXUS_EXE), 'nexus-crash.log') : null,
    path.join(__dirname, '..', 'bridge', 'data', 'nexus-crash.log'),
    path.join(process.env.APPDATA || '', 'nexus', 'nexus-crash.log'),
  ].filter(Boolean);
  return candidates.find(fs.existsSync) || candidates[0];
}

// ── Read last few log lines for context ──────────────────────────
function getLastErrors() {
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    return raw.trim().split('\n').slice(-5).map(line => {
      try {
        const e = JSON.parse(line);
        return `[${e.level}] ${e.source}: ${e.msg}`;
      } catch { return line; }
    }).join('\n');
  } catch { return '(log not available)'; }
}

// ── Show native dialog ────────────────────────────────────────────
async function showCrashPrompt() {
  const lastErrors = getLastErrors();
  const logPath    = LOG_FILE || 'not found';

  if (PLATFORM === 'win32') {
    await showWindowsDialog(lastErrors, logPath);
  } else if (PLATFORM === 'darwin') {
    await showMacDialog(lastErrors, logPath);
  } else {
    await showLinuxDialog(lastErrors, logPath);
  }
}

// Windows: PowerShell WinForms message box (no admin, no deps)
async function showWindowsDialog(lastErrors, logPath) {
  const msg = [
    'NEXUS stopped unexpectedly.',
    '',
    'Last log entries:',
    lastErrors,
    '',
    'Log file: ' + logPath,
    '',
    'Run full system diagnostic now?',
    '(Opens NEXUS and runs all checks automatically)',
  ].join('\n');

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'NEXUS — Unexpected Exit'
$form.Size = New-Object System.Drawing.Size(480, 320)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(15, 15, 30)

$label = New-Object System.Windows.Forms.Label
$label.Text = ${JSON.stringify(msg)}
$label.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 240)
$label.Font = New-Object System.Drawing.Font('Consolas', 9)
$label.AutoSize = $false
$label.Size = New-Object System.Drawing.Size(440, 180)
$label.Location = New-Object System.Drawing.Point(16, 12)
$form.Controls.Add($label)

$btnDiag = New-Object System.Windows.Forms.Button
$btnDiag.Text = 'Run Diagnostics'
$btnDiag.Size = New-Object System.Drawing.Size(140, 36)
$btnDiag.Location = New-Object System.Drawing.Point(16, 220)
$btnDiag.BackColor = [System.Drawing.Color]::FromArgb(0, 80, 40)
$btnDiag.ForeColor = [System.Drawing.Color]::FromArgb(0, 255, 136)
$btnDiag.FlatStyle = 'Flat'
$btnDiag.DialogResult = [System.Windows.Forms.DialogResult]::Yes
$form.Controls.Add($btnDiag)

$btnSkip = New-Object System.Windows.Forms.Button
$btnSkip.Text = 'Skip'
$btnSkip.Size = New-Object System.Drawing.Size(80, 36)
$btnSkip.Location = New-Object System.Drawing.Point(170, 220)
$btnSkip.ForeColor = [System.Drawing.Color]::FromArgb(120, 120, 160)
$btnSkip.FlatStyle = 'Flat'
$btnSkip.DialogResult = [System.Windows.Forms.DialogResult]::No
$form.Controls.Add($btnSkip)

$btnLog = New-Object System.Windows.Forms.Button
$btnLog.Text = 'Open Log'
$btnLog.Size = New-Object System.Drawing.Size(80, 36)
$btnLog.Location = New-Object System.Drawing.Point(264, 220)
$btnLog.ForeColor = [System.Drawing.Color]::FromArgb(0, 180, 255)
$btnLog.FlatStyle = 'Flat'
$btnLog.Add_Click({ Start-Process notepad.exe -ArgumentList ${JSON.stringify(logPath)} })
$form.Controls.Add($btnLog)

$form.AcceptButton = $btnDiag
$result = $form.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
exit 1
`;

  const tmpScript = path.join(require('os').tmpdir(), 'nexus-crash-prompt.ps1');
  fs.writeFileSync(tmpScript, psScript, 'utf8');

  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', tmpScript,
    ], { stdio: 'ignore', detached: false });

    ps.on('exit', (code) => {
      try { fs.unlinkSync(tmpScript); } catch(_) {}
      if (code === 0) {
        launchNexusDiag();
      }
      resolve(code);
    });
  });
}

// macOS: osascript dialog
async function showMacDialog(lastErrors, logPath) {
  return new Promise((resolve) => {
    const script = `display dialog "NEXUS stopped unexpectedly.\\n\\n${lastErrors.replace(/"/g,"'")}\\n\\nRun full diagnostics?" with title "NEXUS Crash" buttons {"Skip", "Open Log", "Run Diagnostics"} default button "Run Diagnostics"`;
    const proc = spawn('osascript', ['-e', script], { stdio: 'pipe' });
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('exit', () => {
      if (out.includes('Run Diagnostics')) launchNexusDiag();
      if (out.includes('Open Log')) spawn('open', ['-t', logPath]);
      resolve();
    });
  });
}

// Linux: zenity or xmessage
async function showLinuxDialog(lastErrors, logPath) {
  return new Promise((resolve) => {
    try {
      const proc = spawn('zenity', [
        '--question', '--title=NEXUS Crash',
        '--text=NEXUS stopped unexpectedly.\n\n' + lastErrors + '\n\nRun full diagnostics?',
        '--ok-label=Run Diagnostics', '--cancel-label=Skip', '--width=400',
      ], { stdio: 'ignore' });
      proc.on('exit', code => { if (code === 0) launchNexusDiag(); resolve(); });
    } catch(_) {
      // fallback: just relaunch with --run-diag
      launchNexusDiag();
      resolve();
    }
  });
}

// ── Relaunch NEXUS with --run-diag flag ──────────────────────────
function launchNexusDiag() {
  if (!NEXUS_EXE || !fs.existsSync(NEXUS_EXE)) {
    console.error('[crash-prompt] NEXUS.exe not found — cannot relaunch:', NEXUS_EXE);
    // Try to find it relative to bridge service dir
    return;
  }
  console.log('[crash-prompt] Launching NEXUS with --run-diag:', NEXUS_EXE);
  spawn(NEXUS_EXE, ['--run-diag'], {
    detached:  true,
    stdio:     'ignore',
    cwd:       path.dirname(NEXUS_EXE),
  }).unref();
}

// ── Standalone diagnostic — run when NEXUS.exe unavailable ───────
async function runStandaloneDiag() {
  const http = require('http');
  const results = [];
  
  function probe(url) {
    return new Promise(res => {
      const req = http.get(url, { timeout: 2000 }, r => {
        let body = '';
        r.on('data', d => body += d);
        r.on('end', () => res({ ok: r.statusCode < 400, status: r.statusCode, body }));
      });
      req.on('error', () => res({ ok: false, status: 0 }));
      req.on('timeout', () => { req.destroy(); res({ ok: false, status: 0 }); });
    });
  }

  const checks = [
    ['Bridge /health', 'http://127.0.0.1:3747/health'],
    ['Bridge /network/info', 'http://127.0.0.1:3747/network/info'],
    ['Bridge /guardian/status', 'http://127.0.0.1:3747/guardian/status'],
    ['Ollama service', 'http://127.0.0.1:3748/status'],
  ];
  
  for (const [name, url] of checks) {
    const r = await probe(url);
    results.push(r.ok ? '  ✓ ' + name : '  ✗ ' + name + ' (' + r.status + ')');
  }
  
  // Write diag to log file
  const diagOut = [
    '=== NEXUS Standalone Diagnostic ===',
    'Time: ' + new Date().toISOString(),
    'Crash log: ' + (LOG_FILE || 'not found'),
    '',
    'Last errors:',
    getLastErrors(),
    '',
    'Bridge status:',
    ...results,
    '',
    'Node: ' + process.version,
    'Platform: ' + process.platform + ' ' + process.arch,
    '===',
  ].join('\n');
  
  const diagFile = LOG_FILE ? LOG_FILE.replace('nexus-crash.log', 'nexus-diag.txt') 
                             : require('path').join(require('os').tmpdir(), 'nexus-diag.txt');
  try { require('fs').writeFileSync(diagFile, diagOut + '\n'); } catch(_) {}
  return diagOut;
}

// ── Run ──────────────────────────────────────────────────────────
showCrashPrompt().catch(e => {
  console.error('[crash-prompt] Error:', e.message);
  process.exit(1);
});
