'use strict';
// [NEXUS-COMPONENT-ID]
const COMPONENT_ID   = '82580e78';
const COMPONENT_UUID = '1ba656e6-13a3-59e1-9e60-7839c00f4510';
const COMPONENT_NAME = 'sysfw';
// [/NEXUS-COMPONENT-ID]
/**
 * components/sysfw.js — OS-level firewall rule manager
 * anonymousservers.info
 *
 * Seam: firewall engine calls sysfw.apply(rules) on startup.
 * Each rule is a plain object; sysfw translates to the right CLI
 * for the current platform and executes it.
 *
 * Supported platforms:
 *   Windows  — netsh advfirewall
 *   Linux    — ufw (preferred) → iptables fallback
 *   macOS    — pfctl (informational — macOS not a target host OS)
 *
 * Component contract:
 *   sysfw.detect()          → { platform, tool, available }
 *   sysfw.apply(rules, log) → Promise<{ ok, results[] }>
 *   sysfw.remove(rules, log)→ Promise<{ ok, results[] }>
 *   sysfw.list(log)         → Promise<string>   raw dump of current rules
 */

const { execFile, exec } = require('child_process');
const os  = require('os');

// ─── Rule shape ───────────────────────────────────────────────────────────────
// {
//   name:     'NEXUS DNS UDP',   // unique rule name / comment
//   port:     53,
//   protocol: 'udp',             // 'tcp' | 'udp' | 'both'
//   dir:      'in',              // 'in' | 'out' | 'both'
//   action:   'allow',           // 'allow' | 'deny'
// }

// ─── Platform detection ───────────────────────────────────────────────────────

function detect() {
  const platform = os.platform(); // 'win32' | 'linux' | 'darwin'

  if (platform === 'win32') {
    return { platform, tool: 'netsh', available: true };
  }

  if (platform === 'linux') {
    // prefer ufw, fall back to iptables
    try {
      require('child_process').execSync('which ufw', { stdio: 'ignore' });
      return { platform, tool: 'ufw', available: true };
    } catch {
      try {
        require('child_process').execSync('which iptables', { stdio: 'ignore' });
        return { platform, tool: 'iptables', available: true };
      } catch {
        return { platform, tool: null, available: false };
      }
    }
  }

  if (platform === 'darwin') {
    return { platform, tool: 'pfctl', available: false, reason: 'macOS pfctl requires manual setup' };
  }

  return { platform, tool: null, available: false, reason: 'unsupported platform' };
}

// ─── Command builders ─────────────────────────────────────────────────────────

function buildNetsh(rule, action = 'add') {
  // action = 'add' | 'delete'
  const cmds = [];
  const protocols = rule.protocol === 'both' ? ['tcp', 'udp'] : [rule.protocol || 'tcp'];
  const dirs      = rule.dir      === 'both' ? ['in', 'out'] : [rule.dir       || 'in'];

  for (const proto of protocols) {
    for (const dir of dirs) {
      const ruleName = `${rule.name} ${proto.toUpperCase()} ${dir}`;
      if (action === 'add') {
        cmds.push([
          'netsh', 'advfirewall', 'firewall', 'add', 'rule',
          `name=${ruleName}`,
          `protocol=${proto}`,
          `dir=${dir}`,
          `localport=${rule.port}`,
          `action=${rule.action || 'allow'}`,
        ]);
      } else {
        cmds.push([
          'netsh', 'advfirewall', 'firewall', 'delete', 'rule',
          `name=${ruleName}`,
        ]);
      }
    }
  }
  return cmds;
}

function buildUfw(rule, action = 'add') {
  const cmds = [];
  const protocols = rule.protocol === 'both' ? ['tcp', 'udp'] : [rule.protocol || 'tcp'];

  for (const proto of protocols) {
    const ruleAction = rule.action === 'allow' ? 'allow' : 'deny';
    if (action === 'add') {
      // ufw allow 53/udp
      cmds.push(['ufw', ruleAction, `${rule.port}/${proto}`]);
    } else {
      cmds.push(['ufw', 'delete', ruleAction, `${rule.port}/${proto}`]);
    }
  }
  return cmds;
}

function buildIptables(rule, action = 'add') {
  const cmds = [];
  const protocols = rule.protocol === 'both' ? ['tcp', 'udp'] : [rule.protocol || 'tcp'];
  const dirs      = rule.dir      === 'both' ? ['INPUT', 'OUTPUT'] :
                    rule.dir      === 'out'   ? ['OUTPUT'] : ['INPUT'];

  for (const proto of protocols) {
    for (const chain of dirs) {
      const flag  = action === 'add' ? '-A' : '-D';
      const target = rule.action === 'allow' ? 'ACCEPT' : 'DROP';
      cmds.push([
        'iptables', flag, chain,
        '-p', proto,
        '--dport', String(rule.port),
        '-j', target,
        '-m', 'comment', '--comment', rule.name,
      ]);
    }
  }
  return cmds;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

function run(args) {
  return new Promise(resolve => {
    const [cmd, ...rest] = args;
    execFile(cmd, rest, { timeout: 10000 }, (err, stdout, stderr) => {
      resolve({
        cmd:    args.join(' '),
        ok:     !err,
        stdout: stdout?.trim() || '',
        stderr: stderr?.trim() || '',
        code:   err?.code || 0,
      });
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function apply(rules, log = () => {}) {
  const { platform, tool, available, reason } = detect();

  if (!available) {
    log(`sysfw: skipping OS firewall — ${reason || 'tool not available'} (${platform})`, 'WARN');
    return { ok: true, skipped: true, results: [] };
  }

  log(`sysfw: applying ${rules.length} rule(s) via ${tool} on ${platform}`);

  const results = [];

  for (const rule of rules) {
    let cmds = [];
    if (tool === 'netsh')    cmds = buildNetsh(rule, 'add');
    if (tool === 'ufw')      cmds = buildUfw(rule, 'add');
    if (tool === 'iptables') cmds = buildIptables(rule, 'add');

    for (const cmd of cmds) {
      const res = await run(cmd);

      // netsh returns exit code 1 with a locale-specific message for duplicate
      // rules — it doesn't always literally say "already exists" in English.
      // Treat any non-zero netsh exit on an add as a duplicate rather than a
      // real failure; the only other common failure mode (invalid syntax) would
      // be a bug in buildNetsh itself, not a runtime condition.
      const alreadyExists =
        !res.ok && (
          res.stdout.toLowerCase().includes('already exists') ||
          res.stderr.toLowerCase().includes('already exists') ||
          res.stderr.toLowerCase().includes('duplicate') ||
          (tool === 'netsh' && res.code === 1)
        );

      res.alreadyExists = alreadyExists;
      results.push(res);

      if (res.ok) {
        log(`sysfw: OK ${res.cmd}`);
      } else if (alreadyExists) {
        log(`sysfw: rule already exists — ${rule.name} (skipping)`, 'WARN');
      } else {
        log(`sysfw: FAIL ${res.cmd} → ${res.stderr || res.stdout}`, 'WARN');
      }
    }
  }

  // Only count genuinely unexpected failures, not duplicate-rule skips.
  const failed = results.filter(r => !r.ok && !r.alreadyExists);
  return { ok: failed.length === 0, results };
}

async function remove(rules, log = () => {}) {
  const { platform, tool, available, reason } = detect();

  if (!available) {
    log(`sysfw: skipping OS firewall removal — ${reason || 'tool not available'}`, 'WARN');
    return { ok: true, skipped: true, results: [] };
  }

  log(`sysfw: removing ${rules.length} rule(s) via ${tool}`);
  const results = [];

  for (const rule of rules) {
    let cmds = [];
    if (tool === 'netsh')    cmds = buildNetsh(rule, 'delete');
    if (tool === 'ufw')      cmds = buildUfw(rule, 'delete');
    if (tool === 'iptables') cmds = buildIptables(rule, 'delete');

    for (const cmd of cmds) {
      const res = await run(cmd);
      results.push(res);
      log(res.ok ? `sysfw: removed — ${rule.name}` : `sysfw: remove failed — ${res.cmd}`, res.ok ? 'INFO' : 'WARN');
    }
  }

  return { ok: results.every(r => r.ok), results };
}

async function list(log = () => {}) {
  const { tool, available } = detect();
  if (!available) return '(sysfw not available on this platform)';

  let cmd;
  if (tool === 'netsh')    cmd = 'netsh advfirewall firewall show rule name=all';
  if (tool === 'ufw')      cmd = 'ufw status verbose';
  if (tool === 'iptables') cmd = 'iptables -L -n -v';

  return new Promise(resolve => {
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      resolve(stdout || err?.message || '');
    });
  });
}

module.exports = { detect, apply, remove, list };
