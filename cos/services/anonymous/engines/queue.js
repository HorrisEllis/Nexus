'use strict';
/**
 * engines/queue.js — job queue + cron scheduler
 * anonymousservers.info
 *
 * Value adds:
 *   - Persistent jobs (backed by JAA db — survive restarts)
 *   - Retry with exponential backoff + dead letter queue
 *   - Cron scheduler (no crontab needed)
 *   - Priority queues (high/normal/low)
 *   - Job types registered by other engines
 *   - Fan-out: one job → multiple workers
 *   - Webhook delivery with retry (used by forms service)
 */

const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  workers:          4,
  pollIntervalMs:   1000,
  maxRetries:       5,
  baseRetryMs:      5000,
  maxRetryMs:       300000,   // 5 min cap
  jobTimeoutMs:     30000,
  deadLetterAfter:  5,
  crons: [
    // { name, schedule, type, payload }
    // e.g. { name: 'daily-backup', schedule: '0 3 * * *', type: 'backup:run', payload: {} }
  ],
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('queue: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── job handlers registry ────────────────────────────────────────────────────
// other engines register handlers via IPC

const handlers = new Map(); // type -> async fn(payload) -> result

// built-in: webhook delivery
handlers.set('webhook:deliver', async payload => {
  const { url, body, headers = {}, method = 'POST' } = payload;
  const mod  = url.startsWith('https') ? require('https') : require('http');
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port,
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'nexus-webhook/1.0',
        ...headers,
      }
    }, res => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, body: out });
        else reject(new Error(`webhook returned ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('webhook timeout')); });
    req.write(data);
    req.end();
  });
});

// built-in: SMTP send (delegates to smtp engine via IPC)
handlers.set('smtp:send', async payload => {
  return new Promise((resolve, reject) => {
    const requestId = `q-${Date.now()}`;
    ipc.send('route', { type: 'smtp:send', ...payload, requestId }, 'smtp');
    const timeout = setTimeout(() => reject(new Error('smtp:send timeout')), 30000);
    ipc.on('smtp:sent', r => {
      if (r.requestId === requestId) { clearTimeout(timeout); resolve(r); }
    });
    ipc.on('smtp:error', r => {
      if (r.requestId === requestId) { clearTimeout(timeout); reject(new Error(r.error)); }
    });
  });
});

// built-in: catalog install (delegates to catalog engine)
handlers.set('catalog:install', async payload => {
  return new Promise((resolve, reject) => {
    const requestId = `q-${Date.now()}`;
    ipc.send('route', { type: 'catalog:install', ...payload, requestId }, 'catalog');
    const timeout = setTimeout(() => reject(new Error('install timeout')), 300000); // 5 min
    ipc.on('catalog:installed', r => {
      if (r.requestId === requestId) { clearTimeout(timeout); resolve(r); }
    });
    ipc.on('catalog:error', r => {
      if (r.requestId === requestId) { clearTimeout(timeout); reject(new Error(r.error)); }
    });
  });
});

// ─── priority queue ────────────────────────────────────────────────────────────

const PRIORITY = { high: 0, normal: 1, low: 2 };

async function enqueue(type, payload, opts = {}) {
  const job = await ipc.db.insert('jobs', {
    type,
    payload,
    priority: PRIORITY[opts.priority || 'normal'],
    status:   'pending',
    attempts: 0,
    maxRetries: opts.maxRetries ?? cfg.maxRetries,
    nextRunAt: opts.delay ? Date.now() + opts.delay : Date.now(),
    createdAt: Date.now(),
    tenantId:  opts.tenantId || null,
    label:     opts.label || type,
  });
  log(`enqueued: ${type} [${job._id}]`);
  return job;
}

async function fetchPending() {
  const now = Date.now();
  const all = await ipc.db.query('jobs',
    `r => r.status === 'pending' && r.nextRunAt <= ${now}`
  ).catch(() => []);
  return all.sort((a, b) => (a.priority - b.priority) || (a.createdAt - b.createdAt));
}

async function runJob(job) {
  const handler = handlers.get(job.type);
  if (!handler) {
    await ipc.db.update('jobs', `r => r._id === ${job._id}`, {
      status: 'dead', error: `no handler for type: ${job.type}`
    });
    return;
  }

  await ipc.db.update('jobs', `r => r._id === ${job._id}`, {
    status: 'running', startedAt: Date.now(), attempts: job.attempts + 1
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('job timeout')), cfg.jobTimeoutMs)
  );

  try {
    const result = await Promise.race([handler(job.payload), timeout]);
    await ipc.db.update('jobs', `r => r._id === ${job._id}`, {
      status: 'done', result: JSON.stringify(result), finishedAt: Date.now()
    });
    log(`job done: ${job.type} [${job._id}] in ${Date.now() - job.startedAt}ms`);
  } catch (e) {
    const attempts = job.attempts + 1;
    if (attempts >= job.maxRetries) {
      await ipc.db.update('jobs', `r => r._id === ${job._id}`, {
        status: 'dead', error: e.message, finishedAt: Date.now()
      });
      log(`job dead: ${job.type} [${job._id}] after ${attempts} attempts: ${e.message}`, 'ERROR');
      // notify via IPC
      ipc.send('queue:dead', { jobId: job._id, type: job.type, error: e.message, tenantId: job.tenantId });
    } else {
      const backoff = Math.min(cfg.baseRetryMs * Math.pow(2, attempts - 1), cfg.maxRetryMs);
      await ipc.db.update('jobs', `r => r._id === ${job._id}`, {
        status: 'pending', error: e.message, nextRunAt: Date.now() + backoff
      });
      log(`job retry: ${job.type} [${job._id}] attempt ${attempts} in ${backoff}ms`);
    }
  }
}

// ─── worker pool ──────────────────────────────────────────────────────────────

let running = 0;

async function tick() {
  if (running >= cfg.workers) return;
  const jobs = await fetchPending();
  const available = Math.min(cfg.workers - running, jobs.length);
  for (let i = 0; i < available; i++) {
    running++;
    runJob(jobs[i]).finally(() => running--);
  }
}

setInterval(() => tick().catch(e => log(e.message, 'ERROR')), cfg.pollIntervalMs);

// ─── cron parser + scheduler ──────────────────────────────────────────────────
// Supports standard 5-field cron: min hour dom month dow

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`invalid cron: ${expr}`);
  return parts.map((p, i) => {
    if (p === '*') return null;
    if (p.startsWith('*/')) return { every: parseInt(p.slice(2)) };
    return p.split(',').map(Number);
  });
}

function cronMatches(fields, d) {
  const vals = [d.getMinutes(), d.getHours(), d.getDate(), d.getMonth() + 1, d.getDay()];
  return fields.every((f, i) => {
    if (f === null) return true;
    if (f.every) return vals[i] % f.every === 0;
    return f.includes(vals[i]);
  });
}

function scheduleCrons() {
  const crons = cfg.crons || [];
  if (!crons.length) return;

  setInterval(() => {
    const now = new Date();
    for (const cron of crons) {
      try {
        const fields = parseCron(cron.schedule);
        if (cronMatches(fields, now)) {
          enqueue(cron.type, cron.payload || {}, { label: cron.name }).catch(() => {});
        }
      } catch (e) {
        log(`cron parse error [${cron.name}]: ${e.message}`, 'WARN');
      }
    }
  }, 60000); // check every minute

  log(`cron scheduler: ${crons.length} jobs registered`);
}

scheduleCrons();

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('queue:push', async payload => {
  const { type, data, priority, delay, maxRetries, tenantId, label, requestId } = payload || {};
  if (!type) return;
  const job = await enqueue(type, data || {}, { priority, delay, maxRetries, tenantId, label });
  ipc.send('queue:pushed', { requestId, jobId: job._id });
});

ipc.on('queue:register', payload => {
  const { type } = payload || {};
  if (!type) return;
  // engine registers a handler — we just acknowledge; handler runs in the registering engine
  // actual execution is delegated back via IPC route
  handlers.set(type, async jobPayload => {
    return new Promise((resolve, reject) => {
      const requestId = `run-${Date.now()}-${Math.random()}`;
      ipc.send('route', { type: `queue:run:${type}`, payload: jobPayload, requestId }, payload.engine);
      const t = setTimeout(() => reject(new Error('remote handler timeout')), cfg.jobTimeoutMs);
      ipc.on(`queue:result:${type}`, r => {
        if (r.requestId === requestId) { clearTimeout(t); resolve(r.result); }
      });
      ipc.on(`queue:error:${type}`, r => {
        if (r.requestId === requestId) { clearTimeout(t); reject(new Error(r.error)); }
      });
    });
  });
  log(`handler registered: ${type} (remote → ${payload.engine})`);
});

ipc.on('queue:status', async payload => {
  const { requestId } = payload || {};
  const pending = await ipc.db.query('jobs', `r => r.status === 'pending'`).catch(() => []);
  const running_jobs = await ipc.db.query('jobs', `r => r.status === 'running'`).catch(() => []);
  const dead    = await ipc.db.query('jobs', `r => r.status === 'dead'`).catch(() => []);
  ipc.send('queue:status:reply', { requestId, pending: pending.length, running: running_jobs.length, dead: dead.length, workers: cfg.workers });
});

// purge old completed jobs daily
setInterval(async () => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
  const n = await ipc.db.delete('jobs', `r => r.status === 'done' && r.finishedAt < ${cutoff}`).catch(() => 0);
  if (n) log(`purged ${n} old completed jobs`);
}, 24 * 60 * 60 * 1000);

log(`queue engine ready — ${cfg.workers} workers`);

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

