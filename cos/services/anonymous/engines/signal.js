'use strict';
/**
 * engines/signal.js — signal to noise
 * anonymousservers.info
 *
 * Separates real human traffic from:
 *   - bots / crawlers (good and bad)
 *   - port scanners
 *   - vulnerability probes
 *   - credential stuffers
 *   - scrapers
 *   - DDoS amplification
 *
 * Value adds:
 *   - Zero external deps — all heuristics run in-process
 *   - Scores every request 0-100 (100 = definitely human)
 *   - Feeds score to analytics whitelist (only count real humans)
 *   - Feeds bad actors to firewall auto-blacklist
 *   - Honeypot path injection (invisible to humans, visible to bots)
 *   - Fingerprint persistence across requests (session signal)
 *   - Known bot UA list (searchable, extensible)
 *   - Probe pattern detection (path signatures of scanners)
 */

const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  honeypotPaths: [
    '/wp-login.php', '/admin/login', '/.env',
    '/phpinfo.php', '/config.php', '/.git/config',
    '/etc/passwd', '/actuator/health', '/telescope/requests',
  ],
  probePatterns: [
    /\/\.env/i, /\/wp-admin/i, /\/phpmyadmin/i,
    /\/shell\./i, /\/eval-stdin/i, /\/xmlrpc\.php/i,
    /\/cgi-bin/i, /\/vendor\//i, /select.+from/i,
    /<script/i, /union.+select/i, /\/etc\/passwd/i,
    /cmd=|exec=|system\(/i, /\.\.\//,
  ],
  knownBotUAs: [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
    'yandexbot', 'sogou', 'exabot', 'facebot', 'ia_archiver',
    'python-requests', 'go-http-client', 'java/', 'curl/', 'wget/',
    'libwww-perl', 'scrapy', 'httpclient', 'okhttp', 'axios',
    'masscan', 'nmap', 'nuclei', 'nikto', 'sqlmap', 'zgrab',
    'censys', 'shodan', 'semrushbot', 'ahrefsbot', 'mj12bot',
  ],
  goodBots: ['googlebot', 'bingbot', 'duckduckbot', 'ia_archiver'],
  scoreThresholds: {
    human:     70,  // score >= 70 → count as human in analytics
    suspicious: 40, // score < 40 → alert firewall
    malicious:  15, // score < 15 → auto-ban
  },
  banMalicious: true,
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('signal: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── request fingerprinting ───────────────────────────────────────────────────
// ip -> { score, requests: [], lastSeen, flags: Set }

const fingerprints = new Map();

function getFingerprint(ip) {
  if (!fingerprints.has(ip)) {
    fingerprints.set(ip, {
      ip,
      score:    50,       // start neutral
      requests: [],
      lastSeen: Date.now(),
      flags:    new Set(),
      banCount: 0,
    });
  }
  return fingerprints.get(ip);
}

// ─── scoring ──────────────────────────────────────────────────────────────────
// Each check adjusts score. Final score is clamped 0-100.

function scoreRequest({ ip, method, path, ua, headers, statusCode, responseTime }) {
  const fp = getFingerprint(ip);
  const now = Date.now();
  fp.lastSeen = now;
  fp.requests.push({ ts: now, path, method, status: statusCode });

  // sliding window: last 5 minutes
  fp.requests = fp.requests.filter(r => now - r.ts < 300000);

  let delta = 0;
  const flags = [];

  // ── user-agent signals ────────────────────────────────────────────────────
  if (!ua || ua.length < 10) {
    delta -= 30; flags.push('no_ua');
  } else {
    const uaLower = ua.toLowerCase();
    const isKnownBot = cfg.knownBotUAs.some(b => uaLower.includes(b));
    const isGoodBot  = cfg.goodBots.some(b => uaLower.includes(b));
    if (isGoodBot)    { delta -= 10; flags.push('good_bot'); }
    else if (isKnownBot) { delta -= 40; flags.push('bot_ua'); }
    // human signals in UA
    if (/mozilla/i.test(ua)) delta += 10;
    if (/webkit|gecko|trident/i.test(ua)) delta += 5;
    if (/mobile|android|iphone/i.test(ua)) delta += 5;
  }

  // ── probe pattern detection ───────────────────────────────────────────────
  if (cfg.probePatterns.some(p => p.test(path))) {
    delta -= 50; flags.push('probe_pattern');
    fp.flags.add('prober');
  }

  // ── honeypot hit ──────────────────────────────────────────────────────────
  if (cfg.honeypotPaths.some(h => path === h || path.startsWith(h))) {
    delta -= 80; flags.push('honeypot');
    fp.flags.add('honeypot_hit');
  }

  // ── header signals ────────────────────────────────────────────────────────
  if (headers) {
    if (headers['accept-language']) delta += 8;
    if (headers['accept-encoding']) delta += 5;
    if (headers['accept']?.includes('text/html')) delta += 8;
    if (headers['sec-fetch-site'])  delta += 10; // browser fetch API
    if (headers['sec-ch-ua'])       delta += 10; // chrome client hints
    if (headers['dnt'])             delta += 3;
    if (!headers['accept'])         { delta -= 15; flags.push('no_accept'); }
    if (headers['x-forwarded-for']?.includes(',')) { delta -= 5; flags.push('proxy_chain'); }
  }

  // ── request velocity ──────────────────────────────────────────────────────
  const recentCount = fp.requests.filter(r => now - r.ts < 10000).length;
  if (recentCount > 30)  { delta -= 40; flags.push('high_velocity'); fp.flags.add('scanner'); }
  else if (recentCount > 10) { delta -= 15; flags.push('elevated_velocity'); }

  // ── error rate ────────────────────────────────────────────────────────────
  if (statusCode) {
    const recent = fp.requests.slice(-20);
    const errors = recent.filter(r => r.status >= 400).length;
    const errorRate = errors / Math.max(recent.length, 1);
    if (errorRate > 0.7) { delta -= 30; flags.push('high_error_rate'); }
    if (statusCode === 429) delta -= 20;
  }

  // ── path diversity (scanners hit many paths fast) ─────────────────────────
  const recentPaths = new Set(fp.requests.slice(-50).map(r => r.path));
  if (recentPaths.size > 30) { delta -= 25; flags.push('path_diversity'); fp.flags.add('scanner'); }

  // ── method signals ────────────────────────────────────────────────────────
  if (method === 'HEAD' && fp.requests.filter(r => r.method === 'HEAD').length > 5) {
    delta -= 20; flags.push('head_scan');
  }

  // ── response time correlation (very fast = automated) ─────────────────────
  // can't measure this from our end reliably — skip

  // ── persistent bad flags ──────────────────────────────────────────────────
  if (fp.flags.has('honeypot_hit')) delta -= 20;
  if (fp.flags.has('prober'))       delta -= 15;
  if (fp.flags.has('scanner'))      delta -= 15;

  // update score (exponential moving average — new signal weighted at 30%)
  fp.score = Math.max(0, Math.min(100, fp.score * 0.7 + (fp.score + delta) * 0.3));

  return { ip, score: Math.round(fp.score), flags, fp };
}

// ─── decision engine ─────────────────────────────────────────────────────────

function classify(score, flags) {
  const t = cfg.scoreThresholds;
  if (score >= t.human)      return 'human';
  if (score >= t.suspicious) return 'suspicious';
  if (score >= t.malicious)  return 'bot';
  return 'malicious';
}

function handleDecision(result) {
  const { ip, score, flags, fp } = result;
  const classification = classify(score, flags);

  // feed analytics: is this request worth counting?
  const isHuman = classification === 'human';

  // feed firewall: escalate bad actors
  if ((classification === 'malicious' || fp.flags.has('honeypot_hit')) && cfg.banMalicious) {
    ipc.send('route', {
      type: 'firewall:ban',
      ip,
      durationMs: 900000,
    }, 'firewall');

    // accumulate bad actor ranges for firewall auto-blacklist
    ipc.send('route', {
      type: 'signal:badactors',
      ranges: [ip],
    }, 'firewall');

    log(`malicious actor blocked: ${ip} (score=${score} flags=${flags.join(',')})`);
    ipc.db.insert('signal_log', { ip, score, classification, flags, ts: Date.now() }).catch(() => {});
  }

  // feed analytics whitelist
  ipc.send('route', {
    type: 'analytics:signal',
    ip,
    isHuman,
    score,
    classification,
  }, 'analytics');

  return { score, classification, isHuman, flags };
}

// ─── honeypot path list for proxy injection ───────────────────────────────────
// Proxy engine injects a hidden <link> to honeypot CSS — bots follow it, humans don't

function getHoneypotMeta() {
  return {
    paths:      cfg.honeypotPaths,
    // a CSS file that bots will request (humans never load via browser render)
    trapAsset: '/__trap/beacon.css',
  };
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// proxy sends every request for scoring
ipc.on('signal:score', payload => {
  if (!payload) return;
  const result = scoreRequest(payload);
  const decision = handleDecision(result);
  ipc.send('signal:scored', { requestId: payload.requestId, ...decision });
});

// proxy asks: is this IP human enough to serve?
ipc.on('signal:check', payload => {
  const { ip, requestId } = payload || {};
  const fp = fingerprints.get(ip);
  const score = fp?.score ?? 50;
  const classification = classify(score, []);
  ipc.send('signal:check:reply', { requestId, score, classification, isHuman: score >= cfg.scoreThresholds.human });
});

// get honeypot config for proxy to inject
ipc.on('signal:honeypot', () => {
  ipc.send('signal:honeypot:reply', getHoneypotMeta());
});

// analytics requests human-only filter for a set of IPs
ipc.on('signal:filter', payload => {
  const { ips, requestId } = payload || {};
  if (!Array.isArray(ips)) return;
  const humanIps = ips.filter(ip => {
    const fp = fingerprints.get(ip);
    return !fp || fp.score >= cfg.scoreThresholds.human;
  });
  ipc.send('signal:filter:reply', { requestId, humanIps });
});

ipc.on('signal:status', () => {
  const total  = fingerprints.size;
  const humans = [...fingerprints.values()].filter(f => f.score >= cfg.scoreThresholds.human).length;
  const bots   = [...fingerprints.values()].filter(f => f.score < cfg.scoreThresholds.suspicious).length;
  ipc.send('signal:status:reply', { total, humans, bots, suspicious: total - humans - bots });
});

// ─── cleanup: evict old fingerprints ─────────────────────────────────────────

setInterval(() => {
  const cutoff = Date.now() - 3600000; // 1 hour
  let evicted = 0;
  for (const [ip, fp] of fingerprints) {
    if (fp.lastSeen < cutoff) { fingerprints.delete(ip); evicted++; }
  }
  if (evicted) log(`evicted ${evicted} stale fingerprints`);
}, 300000); // every 5 min

log('signal engine ready — watching for noise');

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

