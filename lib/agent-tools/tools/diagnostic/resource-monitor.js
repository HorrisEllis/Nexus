'use strict';
/**
 * lib/agent-tools/tools/resource-monitor.js — real load signals for
 * load-aware decisions.
 * comp_id: nexus.lib.agent-tools.tools.resource-monitor
 * UUID: nexus-tool-resource-monitor-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P10 of docs/copilot-full-capability-phasemap.spec,
 * previously blocked awaiting scope). James: "give it to me" — deciding now
 * rather than asking again.
 *
 * §HONEST SCOPE, checked before building — there is no fleet to balance
 * across in this codebase. Grepped for 'load.?balanc' (zero matches, prior
 * session), and confirmed directly this session: ollama/server.js is ONE
 * server with a bounded internal queue (MAX_CONCURRENT, default 3), not
 * multiple interchangeable instances; RAID's _fitness() (cortex/core/raid/
 * index.js) picks WHICH AGENT (claude/chatgpt/ollama), not which instance
 * of one, and is explicitly pinned/tested (docs comment: "this codebase's
 * existing RAID-determinism suite pins plain prompt→provider selection...
 * must never become a silent second path those tests can't see") — not
 * touched here, on purpose, since resource load isn't an axis it operates
 * on and it's too consequential to edit blind without the pinned test suite
 * running live in this environment.
 *
 * So this tool is the real, honest deliverable: the resource-awareness
 * SIGNAL a load-aware decision needs, exposed and queryable. Whoever/
 * whatever makes the actual balancing call (a human, RAID if it later grows
 * a resource axis, or a future scheduler) reads real data from here rather
 * than guessing. No decision authority claimed or seized.
 */
const http = require('http');
const os   = require('os');

const OLLAMA_PORT = process.env.OLLAMA_PORT || 3749;

function _get(port, path) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', timeout: 5000 },
      res => { let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({ error: `unparseable body (${res.statusCode})` }); } }); });
    req.on('error', e => resolve({ error: `unreachable on :${port}: ${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timed out' }); });
    req.end();
  });
}

const ACTIONS = {
  system: () => {
    const cpus = os.cpus();
    return {
      ok: true,
      loadavg: os.loadavg(),               // [1m, 5m, 15m]
      cpuCount: cpus.length,
      freeMemMB: Math.round(os.freemem() / 1024 / 1024),
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100),
      uptimeSec: Math.round(os.uptime()),
    };
  },
  process: (a) => {
    const pid = a.pid || process.pid;
    const { readProcStats } = require('../../../../cos/watchdog/proc-stats.js');
    const stats = readProcStats(pid);
    if (!stats) return { ok: false, error: `no proc stats for pid ${pid} (unsupported platform or process gone)` };
    return { ok: true, pid, ...stats };
  },
  compartment: (a) => {
    if (!a.compartmentId) return { error: 'compartment needs compartmentId' };
    const { getMonitor } = require('../../../../cos/watchdog/monitor.js');
    const m = getMonitor(a.compartmentId);
    if (!m) return { ok: false, error: `no active watchdog monitor for compartment ${a.compartmentId} (not running, or watchdog disabled for it)` };
    return { ok: true, compartmentId: a.compartmentId, lastActivityAt: m.lastActivityAt, lastCpuSample: m.lastCpuSample };
  },
  ollama_queue: () => _get(OLLAMA_PORT, '/health'),
};

module.exports = {
  name: 'resource_monitor',
  description:
    'Real resource/load signals — system-wide (CPU load average, memory), a specific process by pid ' +
    '(default: this process), a running COS compartment\'s watchdog state, or ollama\'s real queue depth. ' +
    'This is signal only, not a dispatcher — it reports load, it does not route or balance anything ' +
    'itself. There is no fleet of interchangeable instances in this system to balance across; use this ' +
    'to check whether a heavy action is safe to run now, not to pick between equivalent workers.',
  parameters: {
    type: 'object',
    properties: {
      action:        { type: 'string', enum: Object.keys(ACTIONS) },
      pid:           { type: 'number', description: 'for "process" — defaults to this process\'s own pid' },
      compartmentId: { type: 'string', description: 'for "compartment" — required' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `resource_monitor ${args.action} failed: ${e.message}` }; }
  },
};
