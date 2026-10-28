'use strict';
/**
 * engines/firewall.js — firewall + rate limiter
 * anonymousservers.info
 *
 * Value adds:
 *   - In-process firewall: no iptables required, works anywhere Node runs
 *   - Rate limiting per IP per route (sliding window)
 *   - Auto-ban: too many 4xx/5xx → temp block
 *   - Port knocking: knock a secret sequence to open a port
 *   - Whitelist / blacklist with CIDR support
 *   - Feeds ban list to proxy engine in real time via IPC
 *   - All decisions written to db for audit trail (customer-visible)
 */

const net  = require('net');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');
const upnp  = require('./components/upnp');
const sysfw = require('./components/sysfw');

const DEFAULTS = {
  // rate limits: requests per window per IP
  rateLimits: [
    { route: '*',     windowMs: 60000,  max: 300  },  // global
    { route: '/api',  windowMs: 60000,  max: 100  },  // API
    { route: '/login',windowMs: 60000,  max: 10   },  // auth
    { route: '/smtp', windowMs: 60000,  max: 20   },  // smtp
  ],
  // auto-ban thresholds
  autoBan: {
    enabled:       true,
    errorThreshold: 20,       // errors in window before ban
    windowMs:      60000,
    banDurationMs: 900000,    // 15 min default ban
    escalation:    [900000, 3600000, 86400000], // 15m, 1h, 1d on repeat offenders
  },
  // port knocking: knock these ports in sequence to open sshPort
  portKnocking: {
    enabled:   false,
    sequence:  [7000, 8000, 9000],
    openPort:  22,
    windowMs:  10000,
  },
  // CIDR whitelist — these IPs bypass all rules
  whitelist: ['127.0.0.1', '::1'],
  // CIDR blacklist — always blocked
  blacklist: [],
  // known bad actor ranges (auto-populated by signal engine)
  autoBlacklist: [],
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('firewall: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── CIDR matching ────────────────────────────────────────────────────────────

function ipToLong(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

function cidrMatch(ip, cidr) {
  if (!ip || ip.includes(':')) return false; // skip IPv6 for now
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bits] = cidr.split('/');
  const mask = ~(0xFFFFFFFF >>> parseInt(bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

function inList(ip, list) {
  return list.some(cidr => cidrMatch(ip, cidr));
}

// ─── sliding window rate limiter ──────────────────────────────────────────────

// ip:route -> [timestamps]
const rateWindows = new Map();

function checkRateLimit(ip, route) {
  if (inList(ip, cfg.whitelist)) return { allowed: true };

  const now = Date.now();
  const rules = cfg.rateLimits || [];

  for (const rule of rules) {
    const matchRoute = rule.route === '*' || route.startsWith(rule.route);
    if (!matchRoute) continue;

    const key = `${ip}:${rule.route}`;
    let timestamps = rateWindows.get(key) || [];
    timestamps = timestamps.filter(t => now - t < rule.windowMs);
    timestamps.push(now);
    rateWindows.set(key, timestamps);

    if (timestamps.length > rule.max) {
      return {
        allowed: false,
        reason:  'rate_limit',
        rule,
        retryAfter: Math.ceil(rule.windowMs / 1000),
      };
    }
  }
  return { allowed: true };
}

// ─── auto-ban ────────────────────────────────────────────────────────────────

// ip -> { errors: [timestamps], banCount: N, bannedUntil: timestamp|null }
const banState = new Map();

function getBanState(ip) {
  if (!banState.has(ip)) banState.set(ip, { errors: [], banCount: 0, bannedUntil: null });
  return banState.get(ip);
}

function isBanned(ip) {
  if (inList(ip, cfg.whitelist)) return false;
  if (inList(ip, cfg.blacklist) || inList(ip, cfg.autoBlacklist)) return true;
  const state = getBanState(ip);
  if (state.bannedUntil && Date.now() < state.bannedUntil) return true;
  if (state.bannedUntil && Date.now() >= state.bannedUntil) {
    state.bannedUntil = null; // unban
  }
  return false;
}

function recordError(ip) {
  const ab = cfg.autoBan;
  if (!ab?.enabled || inList(ip, cfg.whitelist)) return;
  const state = getBanState(ip);
  const now = Date.now();
  state.errors = state.errors.filter(t => now - t < ab.windowMs);
  state.errors.push(now);
  if (state.errors.length >= ab.errorThreshold) {
    const escalation = ab.escalation || [ab.banDurationMs];
    const dur = escalation[Math.min(state.banCount, escalation.length - 1)];
    state.bannedUntil = now + dur;
    state.banCount++;
    state.errors = [];
    log(`auto-banned ${ip} for ${dur / 1000}s (offense #${state.banCount})`);
    // notify proxy
    ipc.send('route', { type: 'firewall:banned', ip, until: state.bannedUntil }, 'proxy');
    // record in db
    ipc.db.insert('ban_log', { ip, dur, banCount: state.banCount, ts: now }).catch(() => {});
  }
}

// ─── port knocking ────────────────────────────────────────────────────────────

// ip -> [port timestamps with port]
const knockState = new Map();

function handleKnock(ip, port) {
  const pk = cfg.portKnocking;
  if (!pk?.enabled) return;
  const now = Date.now();
  let knocks = knockState.get(ip) || [];
  knocks = knocks.filter(k => now - k.ts < pk.windowMs);
  knocks.push({ port, ts: now });
  knockState.set(ip, knocks);

  const seq = pk.sequence || [];
  if (knocks.length >= seq.length) {
    const recent = knocks.slice(-seq.length).map(k => k.port);
    const match  = seq.every((p, i) => p === recent[i]);
    if (match) {
      log(`port knock success from ${ip} — opening port ${pk.openPort} for 30s`);
      // temporarily whitelist this IP
      cfg.whitelist.push(ip);
      setTimeout(() => {
        cfg.whitelist = cfg.whitelist.filter(w => w !== ip);
        log(`port knock window closed for ${ip}`);
      }, 30000);
      knockState.delete(ip);
    }
  }
}

// ─── inspect: called by proxy for every request ───────────────────────────────

function inspect(ip, route, statusCode) {
  // update ban state on errors
  if (statusCode && (statusCode >= 400)) recordError(ip);

  if (isBanned(ip)) {
    return { allowed: false, reason: 'banned', ip };
  }

  const rl = checkRateLimit(ip, route);
  if (!rl.allowed) {
    recordError(ip);
    return rl;
  }

  return { allowed: true };
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// proxy calls this for every incoming request
ipc.on('firewall:check', payload => {
  const { ip, route, requestId } = payload || {};
  const result = inspect(ip, route || '/', null);
  ipc.send('firewall:result', { requestId, ...result });
});

// proxy reports status codes after response
ipc.on('firewall:report', payload => {
  const { ip, route, status } = payload || {};
  if (ip) inspect(ip, route, status);
});

// signal engine pushes bad IP ranges
ipc.on('signal:badactors', payload => {
  const { ranges } = payload || {};
  if (Array.isArray(ranges)) {
    cfg.autoBlacklist = [...new Set([...cfg.autoBlacklist, ...ranges])];
    log(`auto-blacklist updated: ${cfg.autoBlacklist.length} ranges`);
  }
});

ipc.on('firewall:ban', payload => {
  const { ip, durationMs } = payload || {};
  if (!ip) return;
  const state = getBanState(ip);
  state.bannedUntil = Date.now() + (durationMs || 900000);
  log(`manual ban: ${ip} for ${(durationMs || 900000) / 1000}s`);
});

ipc.on('firewall:unban', payload => {
  const { ip } = payload || {};
  if (ip) { banState.delete(ip); log(`unbanned: ${ip}`); }
});

ipc.on('firewall:whitelist:add', payload => {
  const { cidr } = payload || {};
  if (cidr && !cfg.whitelist.includes(cidr)) {
    cfg.whitelist.push(cidr);
    conf.save(cfg);
    log(`whitelisted: ${cidr}`);
  }
});

ipc.on('firewall:status', () => {
  const bans = [];
  for (const [ip, state] of banState) {
    if (state.bannedUntil && Date.now() < state.bannedUntil) {
      bans.push({ ip, until: state.bannedUntil, banCount: state.banCount });
    }
  }
  ipc.send('firewall:status:reply', {
    activeBans: bans.length,
    bans,
    blacklist: cfg.blacklist.length + cfg.autoBlacklist.length,
    whitelist: cfg.whitelist.length,
  });
});

// knock tracking (proxy forwards raw TCP knock events)
ipc.on('firewall:knock', payload => {
  const { ip, port } = payload || {};
  if (ip && port) handleKnock(ip, port);
});

// ─── cleanup loop ─────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  // clean rate windows older than max window
  const maxWindow = Math.max(...(cfg.rateLimits || [{ windowMs: 60000 }]).map(r => r.windowMs));
  for (const [key, timestamps] of rateWindows) {
    const fresh = timestamps.filter(t => now - t < maxWindow);
    if (fresh.length === 0) rateWindows.delete(key);
    else rateWindows.set(key, fresh);
  }
  // clean knock state
  for (const [ip, knocks] of knockState) {
    if (knocks.every(k => now - k.ts > 60000)) knockState.delete(ip);
  }
}, 60000);

log('firewall engine ready');

// ─── NEXUS OS-level firewall rules (sysfw) ───────────────────────────────────
const NEXUS_FW_RULES = [
  { name: 'NEXUS DNS',   port: 53,   protocol: 'both', dir: 'in', action: 'allow' },
  { name: 'NEXUS HTTP',  port: 80,   protocol: 'tcp',  dir: 'in', action: 'allow' },
  { name: 'NEXUS HTTPS', port: 443,  protocol: 'tcp',  dir: 'in', action: 'allow' },
  { name: 'NEXUS SMTP',  port: 587,  protocol: 'tcp',  dir: 'in', action: 'allow' },
  { name: 'NEXUS SMTP2', port: 2525, protocol: 'tcp',  dir: 'in', action: 'allow' },
  { name: 'NEXUS UI',    port: 9000, protocol: 'tcp',  dir: 'in', action: 'allow' },
];

sysfw.apply(NEXUS_FW_RULES, (msg, level) => log(msg, level)).then(result => {
  if (result.skipped) return;
  log(result.ok ? 'sysfw: OS firewall rules applied' : 'sysfw: some OS firewall rules failed — check logs above', result.ok ? 'INFO' : 'WARN');
}).catch(e => log(`sysfw: error applying OS firewall rules: ${e.message}`, 'WARN'));

ipc.on('sysfw:detect', () => { ipc.send('sysfw:detect:reply', sysfw.detect()); });
ipc.on('sysfw:apply', async payload => {
  const result = await sysfw.apply(payload?.rules || NEXUS_FW_RULES, (msg, level) => log(msg, level));
  ipc.send('sysfw:apply:reply', result);
});
ipc.on('sysfw:remove', async payload => {
  const result = await sysfw.remove(payload?.rules || NEXUS_FW_RULES, (msg, level) => log(msg, level));
  ipc.send('sysfw:remove:reply', result);
});
ipc.on('sysfw:list', async () => {
  const output = await sysfw.list((msg, level) => log(msg, level));
  ipc.send('sysfw:list:reply', { output });
});

// ─── NEXUS auto port forwarding (UPnP) ───────────────────────────────────────
// Tries to open the ports Nexus needs directly on the router — no manual
// login required. Falls back silently (with a log line) if UPnP isn't
// available, e.g. corporate networks, UPnP disabled, or CGNAT.
const NEXUS_PORTS = [
  { port: 80,  protocol: 'TCP'  },  // HTTP / ACME challenge
  { port: 443, protocol: 'TCP'  },  // HTTPS
  { port: 53,  protocol: 'both' },  // DNS
  { port: 587, protocol: 'TCP'  },  // SMTP submission
  { port: 2525,protocol: 'TCP'  },  // SMTP inbound
];

upnp.openPorts(NEXUS_PORTS, (msg, level) => log(msg, level), 'nexus-' + (conf.load({}).domain || 'host'))
  .then(result => {
    if (result.skipped) {
      log(`upnp: automatic forwarding unavailable (${result.reason}) — forward ports manually on your router if needed`, 'WARN');
    } else if (result.ok) {
      log('upnp: all ports forwarded automatically — no router login needed');
    } else {
      log('upnp: some ports could not be forwarded — check results above, manual setup may be required', 'WARN');
    }
  })
  .catch(e => log(`upnp: error during auto port forward: ${e.message}`, 'WARN'));

// ─── upnp IPC handlers (for UI / CLI control) ────────────────────────────────
ipc.on('upnp:open', async payload => {
  const ports = payload?.ports || NEXUS_PORTS;
  const result = await upnp.openPorts(ports, (msg, level) => log(msg, level));
  ipc.send('upnp:open:reply', { requestId: payload?.requestId, ...result });
});

ipc.on('upnp:close', async payload => {
  const ports = payload?.ports || NEXUS_PORTS;
  const result = await upnp.closePorts(ports, (msg, level) => log(msg, level));
  ipc.send('upnp:close:reply', { requestId: payload?.requestId, ...result });
});

ipc.on('upnp:status', async payload => {
  const gw = await upnp.discover(4000);
  ipc.send('upnp:status:reply', { requestId: payload?.requestId, ...gw });
});

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

