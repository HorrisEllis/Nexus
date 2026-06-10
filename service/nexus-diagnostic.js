'use strict';
// service/nexus-diagnostic.js — System Auditing + Monitoring Service
// UUID: nexus-diagnostic-service-v1-0000-4000-0000-000000000001
//
// A running ICO kernel that:
//   - Reads all system ledgers every N seconds
//   - Computes sigma/friction/drift per system
//   - Detects gaps (baseline deviations, missing heartbeats, stuck queues)
//   - Surfaces gaps in real-time via SSE + REST
//   - Logs its own events to data/diagnostic/ledger/
//   - Failure mode ledger with solution + friction scoring
//
// HTTP :7825:
//   GET /status          — full system health snapshot
//   GET /gaps            — all open gaps across all systems
//   GET /friction        — per-system friction scores
//   GET /audit           — full audit: requires, syntax, endpoints, ledger health
//   GET /ledger/:system  — tail of a system's ledger
//   GET /baseline/:sys   — baseline stats for a system
//   GET /events          — SSE stream of all diagnostic events
//
// CLI:
//   node service/nexus-diagnostic.js           — start service
//   node service/nexus-diagnostic.js status    — check health
//   node service/nexus-diagnostic.js gaps      — print open gaps
//   node service/nexus-diagnostic.js audit     — full audit

const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const crypto = require('crypto');

const { createICO }      = require('../lib/ico');
const { createContractVerifier, loadContracts } = require('../lib/cfr/contract-verifier');
const { createCFRField, computeRegime }         = require('../lib/cfr/field');
const { createBaseline } = require('../lib/baseline');
const { sigma, mean }    = require('../lib/baseline');

const ROOT    = path.join(__dirname, '..');
const PORT    = 7825;
const PID_FILE = path.join(ROOT, 'data/diagnostic/diagnostic.pid');

function uid() { return crypto.randomUUID(); }

// ── System registry ───────────────────────────────────────────────────────────

const SYSTEMS = {
  guardian:    { port: 7820, ledgerDir: 'data/guardian/ledger',    healthPath: '/health' },
  cortex:      { port: 3748, ledgerDir: 'data/cortex/ledger',      healthPath: '/api/health' },
  idearium:    { port: 4800, ledgerDir: 'data/idearium/ledger',    healthPath: '/api/health' },
  orchestrator:{ port: 9000, ledgerDir: 'data/orchestrator/ledger',healthPath: '/health' },
  emerge:      { port: 4242, ledgerDir: 'data/emerge/ledger',      healthPath: '/health' },
};

// ── CLI dispatch ──────────────────────────────────────────────────────────────

const cmd = process.argv[2];
if      (cmd === 'status') { checkStatus(); }
else if (cmd === 'stop')   { stopService(); }
else if (cmd === 'gaps')   { printGaps(); }
else if (cmd === 'audit')  { runAudit().then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }); }
else                       { startService(); }

// ── Check / Stop ──────────────────────────────────────────────────────────────

function checkStatus() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(1); }
  const pid = parseInt(fs.readFileSync(PID_FILE,'utf8').trim());
  try {
    process.kill(pid, 0);
    const req = http.get(`http://127.0.0.1:${PORT}/status`, { timeout:2000 }, res => {
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>{
        try { const d=JSON.parse(b); console.log('RUNNING pid='+pid+'\n'+JSON.stringify(d.summary,null,2)); process.exit(0); }
        catch { console.log('RUNNING pid='+pid); process.exit(0); }
      });
    });
    req.on('error',()=>{ console.log('RUNNING pid='+pid+' (port not responding)'); process.exit(0); });
  } catch { fs.unlinkSync(PID_FILE); console.log('NOT RUNNING (stale pid)'); process.exit(1); }
}

function stopService() {
  if (!fs.existsSync(PID_FILE)) { console.log('NOT RUNNING'); process.exit(0); }
  const pid = parseInt(fs.readFileSync(PID_FILE,'utf8').trim());
  try { process.kill(pid,'SIGTERM'); console.log(`SIGTERM → pid=${pid}`); fs.unlinkSync(PID_FILE); }
  catch { console.log('Failed to stop'); }
  process.exit(0);
}

async function printGaps() {
  const req = http.get(`http://127.0.0.1:${PORT}/gaps`, { timeout:3000 }, res => {
    let b=''; res.on('data',d=>b+=d); res.on('end',()=>{
      try {
        const d = JSON.parse(b);
        const gaps = d.gaps || [];
        if (!gaps.length) { console.log('No open gaps'); process.exit(0); }
        for (const g of gaps) {
          console.log(`[${g.severity||'medium'}] ${g.system} — ${g.type}: ${g.body||g.description||''}`);
        }
      } catch { console.log(b); }
      process.exit(0);
    });
  });
  req.on('error', () => {
    console.log('Diagnostic service not running. Start with: node service/nexus-diagnostic.js');
    process.exit(1);
  });
}

// ── Start service ─────────────────────────────────────────────────────────────

function startService() {
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/ledger'),   { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/gaps'),     { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/friction'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data/diagnostic/invariant'),{ recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));

  // Diagnostic ICO kernel
  const ico = createICO({
    name: 'diagnostic',
    root: path.join(ROOT, 'data/diagnostic'),
  });

  // Per-system baseline monitors
  const monitors = {};
  for (const [name, cfg] of Object.entries(SYSTEMS)) {
    monitors[name] = createBaseline({
      name,
      ledgerDir:    path.join(ROOT, cfg.ledgerDir),
      failuresDir:  path.join(ROOT, `data/${name}/failures`),
      invariantDir: path.join(ROOT, `data/${name}/invariant`),
      baselineN:    10,
      sigmaThreshold: 0.25,
      onGap: (gap) => {
        gap.system = name;
        openGaps.set(gap.uuid, gap);
        broadcast({ type: 'gap.found', gap, ts: Date.now() });
        ico.ledger.append('gaps', { ...gap, ts: Date.now() });
        console.log(`[diag] GAP ${name}: ${gap.type} sigma=${gap.sigma}`);
      },
    });
  }

  // In-memory gap store (backed by ledger)
  const openGaps = new Map();

  // SSE clients
  const sseClients = new Set();
  function broadcast(msg) {
    const payload = 'data: ' + JSON.stringify(msg) + '\n\n';
    for (const res of sseClients) {
      try { res.write(payload); } catch { sseClients.delete(res); }
    }
  }

  // ── Contract verifier — validates runtime behavior vs interaction contracts ──
  const contracts = loadContracts(ROOT);
  const _verifier = createContractVerifier({
    contracts,
    onViolation: (v) => {
      // Write violation to diagnostic ledger
      if (v.severity > 0) {
        ico.ledger.append('gaps', {
          type:     v.type,
          body:     v.message,
          system:   v.system,
          severity: v.severity > 0.7 ? 'high' : v.severity > 0.4 ? 'medium' : 'low',
          status:   'open',
          source:   'contract-verifier',
          ts:       Date.now(),
        });
        // Broadcast to diagnostic SSE
        _broadcast({ type: v.type, ...v });
      }
    },
  });

  // Tick the contract verifier every 5s to catch expired behavioral rules
  setInterval(() => _verifier.tick(), 5000).unref();

  // ── Polling loop — read ledgers + probe health ────────────────────────────

  const systemState = {};

  async function pollSystem(name, cfg) {
    const state = systemState[name] || { online: false, uptime: 0, friction: 0, gaps: [] };

    // 1. Probe health endpoint
    let online = false, uptime = 0, jobs = 0;
    try {
      await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${cfg.port}${cfg.healthPath}`, { timeout: 2000 }, res => {
          let b = '';
          res.on('data', d => b += d);
          res.on('end', () => {
            try {
              const d = JSON.parse(b);
              online = res.statusCode === 200;
              uptime = d.uptime || 0;
              jobs   = d.jobs   || 0;
            } catch {}
            resolve();
          });
        });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
      });
    } catch {}

    // Feed to baseline
    monitors[name].observe({
      type:      online ? 'health.ok' : 'health.fail',
      latencyMs: 0,
      error:     !online,
      ts:        Date.now(),
    });

    // 2. Read recent ledger entries
    let recentEvents = [];
    try {
      const ledgerPath = path.join(ROOT, cfg.ledgerDir);
      if (fs.existsSync(ledgerPath)) {
        const streams = fs.readdirSync(ledgerPath)
          .filter(f => fs.statSync(path.join(ledgerPath, f)).isDirectory());
        for (const stream of streams.slice(-3)) {
          const evFile = path.join(ledgerPath, stream, 'events.ndjson');
          if (!fs.existsSync(evFile)) continue;
          const lines = fs.readFileSync(evFile, 'utf8').trim().split('\n').filter(Boolean);
          const recent = lines.slice(-10).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
          recentEvents.push(...recent);
        }
      }
    } catch {}

    // Feed recent events into baseline monitor
    for (const ev of recentEvents) {
      if (!ev._ts) continue;
      monitors[name].observe({ type: ev.type || 'event', latencyMs: 0, error: !!ev.error, ts: ev._ts });
    }

    // 3. Check physical queue for stuck items
    const queueDir = path.join(ROOT, `data/${name}/queue`);
    let stuckCount = 0;
    if (fs.existsSync(queueDir)) {
      const items = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      for (const item of items) {
        try {
          const state = JSON.parse(fs.readFileSync(path.join(queueDir, item), 'utf8'));
          if (state.status === 'processing' && state.claimedAt) {
            const age = Date.now() - state.claimedAt;
            if (age > 120000) { // 2 minutes stuck = gap
              stuckCount++;
              const gapId = uid();
              if (!openGaps.has(`stuck:${state.uuid}`)) {
                const gap = {
                  uuid:        gapId,
                  type:        'stuck_queue_item',
                  system:      name,
                  body:        `Queue item ${state.uuid} stuck in processing for ${Math.round(age/1000)}s`,
                  severity:    'high',
                  status:      'open',
                  ageMs:       age,
                  itemUuid:    state.uuid,
                  detectedAt:  Date.now(),
                };
                openGaps.set(`stuck:${state.uuid}`, gap);
                broadcast({ type: 'gap.found', gap });
                ico.ledger.append('gaps', gap);
              }
            }
          }
        } catch {}
      }
    }

    // Update state
    const friction = monitors[name].friction();
    systemState[name] = { online, uptime, jobs, friction, stuckCount,
      sigma: monitors[name].stats().sigma,
      openGaps: monitors[name].gaps().length,
      lastChecked: Date.now() };

    return systemState[name];
  }

  async function pollAll() {
    for (const [name, cfg] of Object.entries(SYSTEMS)) {
      await pollSystem(name, cfg);
    }
    broadcast({ type: 'poll.complete', systems: systemState, ts: Date.now() });
    ico.ledger.append('poll', { type: 'poll.complete', systems: Object.keys(systemState), ts: Date.now() });
  }

  // Poll every 15 seconds
  pollAll();
  const pollTimer = setInterval(pollAll, 15000);

  // Live ledger watching — detect new events within milliseconds
  for (const [name, cfg] of Object.entries(SYSTEMS)) {
    const ledgerDir = path.join(ROOT, cfg.ledgerDir);
    fs.mkdirSync(ledgerDir, { recursive: true });
    try {
      fs.watch(ledgerDir, { recursive: true }, (event, filename) => {
        if (!filename || !filename.endsWith('.ndjson')) return;
        // Debounce — only process once per 500ms per system
        clearTimeout(monitors[name]._watchDebounce);
        monitors[name]._watchDebounce = setTimeout(async () => {
          await pollSystem(name, cfg);
          const state = systemState[name] || {};
          broadcast({ type: 'ledger.updated', system: name,
            friction: state.friction, sigma: state.sigma, ts: Date.now() });
        }, 500);
      });
    } catch(_) {} // fs.watch may not support recursive on all platforms
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  async function runAuditInternal() {
    const issues = [];

    // 1. Syntax check all JS files
    const { spawnSync } = require('child_process');
    function walkJs(dir) {
      const results = [];
      if (!fs.existsSync(dir)) return results;
      for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (['node_modules','.git','data'].includes(f)) continue;
        const st = fs.statSync(fp);
        if (st.isDirectory()) results.push(...walkJs(fp));
        else if (f.endsWith('.js')) results.push(fp);
      }
      return results;
    }

    let syntaxFails = 0;
    for (const file of walkJs(ROOT)) {
      const r = spawnSync('node', ['--check', file], { encoding: 'utf8', timeout: 5000 });
      if (r.status !== 0) {
        syntaxFails++;
        const errLine = (r.stderr || '').split('\n').slice(0, 2).join(' ');
        issues.push({ type: 'syntax_error', file: file.replace(ROOT + '/', ''), error: errLine, severity: 'critical' });
      }
    }

    // 2. Check all system health endpoints
    for (const [name, cfg] of Object.entries(SYSTEMS)) {
      const state = systemState[name] || {};
      if (!state.online) {
        issues.push({ type: 'system_offline', system: name, port: cfg.port, severity: 'high',
          fix: `Start ${name}: node ${name}/boot.js or service/${name}-service.js` });
      }
      if (state.friction > 0.5) {
        issues.push({ type: 'high_friction', system: name, friction: state.friction, severity: 'medium',
          fix: `Check data/${name}/ledger/ for recent errors` });
      }
    }

    // 3. Check for orphaned pending files (stuck for > 5 minutes)
    for (const [name] of Object.entries(SYSTEMS)) {
      const inputDir = path.join(ROOT, `data/${name}/input`);
      if (!fs.existsSync(inputDir)) continue;
      for (const f of fs.readdirSync(inputDir)) {
        if (!f.includes('.pending.')) continue;
        const fp = path.join(inputDir, f);
        const age = Date.now() - fs.statSync(fp).mtimeMs;
        if (age > 300000) { // 5 min
          issues.push({ type: 'orphaned_pending', system: name, file: f,
            ageMs: age, severity: 'medium',
            fix: `Run: node cli/diagnose.js ${name} or restart ${name} service` });
        }
      }
    }

    // 4. Check for recent failure ledger entries
    for (const [name] of Object.entries(SYSTEMS)) {
      const failDir = path.join(ROOT, `data/${name}/failures`);
      if (!fs.existsSync(failDir)) continue;
      const failFiles = fs.readdirSync(failDir).filter(f => f.endsWith('.ndjson'));
      for (const ff of failFiles.slice(-5)) {
        const lines = fs.readFileSync(path.join(failDir, ff), 'utf8').trim().split('\n').filter(Boolean);
        const recent = lines.slice(-3).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        for (const entry of recent) {
          if (entry.friction > 0.7) {
            issues.push({ type: 'high_friction_failure', system: name,
              error: entry.error?.slice(0,100), friction: entry.friction, severity: 'medium',
              solution: entry.solution || null });
          }
        }
      }
    }

    // 5. Required files per system
    const REQUIRED_FILES = {
      guardian:  ['guardian/server.js','guardian/userscript-claude.js','guardian/userscript-chatgpt.js'],
      cortex:    ['cortex/boot.js','cortex/core/raid/index.js','cortex/memory/jaa-db.js'],
      idearium:  ['idearium/api/index.js'],
      lib:       ['lib/ess.js','lib/ico.js','lib/baseline.js','lib/queue.js','lib/ncp.js'],
    };
    for (const [group, files] of Object.entries(REQUIRED_FILES)) {
      for (const file of files) {
        if (!fs.existsSync(path.join(ROOT, file))) {
          issues.push({ type:'missing_required_file', group, file, severity:'critical',
            fix:`BUILD REQUIRED: ${file}` });
        }
      }
    }

    // 6. Baseline established per system
    for (const [name, mon] of Object.entries(monitors)) {
      if (!mon.baseline()) {
        issues.push({ type:'baseline_not_established', system:name, severity:'low',
          fix:`Start ${name} service — needs ${mon.baselineN} events to establish baseline` });
      }
    }

    // 7. Ledger health — is each system writing?
    for (const [name, cfg] of Object.entries(SYSTEMS)) {
      const ledgerDir = path.join(ROOT, cfg.ledgerDir);
      if (!fs.existsSync(ledgerDir)) {
        issues.push({ type:'ledger_missing', system:name, severity:'medium',
          fix:`Start ${name} service to create ledger` }); continue;
      }
      let lastWrite = 0;
      const streams = fs.readdirSync(ledgerDir)
        .filter(f => { try { return fs.statSync(path.join(ledgerDir,f)).isDirectory(); } catch { return false; } });
      for (const stream of streams) {
        const evFile = path.join(ledgerDir, stream, 'events.ndjson');
        if (fs.existsSync(evFile)) {
          const mt = fs.statSync(evFile).mtimeMs;
          if (mt > lastWrite) lastWrite = mt;
        }
      }
      if (lastWrite > 0 && Date.now() - lastWrite > 600000) {
        issues.push({ type:'ledger_stale', system:name, ageMinutes:Math.round((Date.now()-lastWrite)/60000),
          severity:'low', fix:`${name} ledger stale — check if service is running` });
      }
    }

    return {
      ts:          Date.now(),
      totalIssues: issues.length,
      critical:    issues.filter(i => i.severity === 'critical').length,
      high:        issues.filter(i => i.severity === 'high').length,
      medium:      issues.filter(i => i.severity === 'medium').length,
      low:         issues.filter(i => i.severity === 'low').length,
      syntaxFails,
      systems: Object.fromEntries(Object.entries(systemState).map(([k,v])=>[k,{online:v.online,friction:v.friction}])),
      issues,
    };
  }

  // ── HTTP server ───────────────────────────────────────────────────────────

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

    // SSE stream
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: ' + JSON.stringify({ type: 'connected', ts: Date.now() }) + '\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Status
    if (url.pathname === '/status') {
      const summary = {};
      for (const [name, state] of Object.entries(systemState)) {
        summary[name] = { online: state.online, friction: state.friction, sigma: state.sigma, openGaps: state.openGaps };
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, summary, openGaps: openGaps.size,
        uptime: process.uptime(), ts: Date.now() }));
      return;
    }

    // Contract audit
    if (url.pathname === '/audit/contracts') {
      const report = _verifier?.auditReport() || {};
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, report, ts: Date.now() }));
      return;
    }

    // Audit health
    if (url.pathname === '/audit/health') {
      const health = {};
      for (const [name, cfg] of Object.entries(SYSTEMS)) {
        const lp  = require('path').join(ROOT, cfg.ledgerDir, 'event_log.jsonl');
        const ex  = require('fs').existsSync(lp);
        const st  = ex ? require('fs').statSync(lp) : null;
        health[name] = { ledgerExists: ex, ledgerSizeKB: st ? Math.round(st.size/1024) : 0, port: cfg.port };
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, health, ts: Date.now() }));
      return;
    }

    // Gaps
    if (url.pathname === '/gaps') {
      const status = url.searchParams.get('status') || 'open';
      const system = url.searchParams.get('system');
      let gaps = [...openGaps.values()];
      if (status !== 'all') gaps = gaps.filter(g => g.status === status);
      if (system) gaps = gaps.filter(g => g.system === system);
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, count: gaps.length, gaps }));
      return;
    }

    // Close a gap
    if (url.pathname.startsWith('/gaps/') && req.method === 'DELETE') {
      const gapId = url.pathname.split('/')[2];
      const gap   = openGaps.get(gapId);
      if (gap) { gap.status = 'closed'; gap.closedAt = Date.now(); }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: !!gap }));
      return;
    }

    // Friction
    if (url.pathname === '/friction') {
      const friction = {};
      for (const [name, mon] of Object.entries(monitors)) {
        friction[name] = { friction: mon.friction(), sigma: mon.stats().sigma,
          errorRate: mon.stats().errorRate, slope: mon.stats().slope };
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, friction, ts: Date.now() }));
      return;
    }

    // Baseline for a system
    if (url.pathname.startsWith('/baseline/')) {
      const system = url.pathname.split('/')[2];
      const mon    = monitors[system];
      if (!mon) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok: false, error: 'unknown system' })); return; }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, system, stats: mon.stats(), baseline: mon.baseline(), gaps: mon.gaps() }));
      return;
    }

    // Ledger tail for a system
    if (url.pathname.startsWith('/ledger/')) {
      const system = url.pathname.split('/')[2];
      const stream = url.pathname.split('/')[3] || 'events';
      const n      = parseInt(url.searchParams.get('n') || '20');
      const cfg    = SYSTEMS[system];
      if (!cfg) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok: false, error: 'unknown system' })); return; }
      const ledgerFile = path.join(ROOT, cfg.ledgerDir, stream, 'events.ndjson');
      let events = [];
      if (fs.existsSync(ledgerFile)) {
        const lines = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').filter(Boolean);
        events = lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, system, stream, events }));
      return;
    }

    // Trace a specific UUID across all system ledgers
    if (url.pathname.startsWith('/trace/')) {
      const traceId = url.pathname.split('/')[2];
      if (!traceId) { res.writeHead(400, CORS); res.end(JSON.stringify({ ok:false, error:'uuid required' })); return; }
      const trace = [];
      for (const [name, cfg] of Object.entries(SYSTEMS)) {
        const ledgerDir = path.join(ROOT, cfg.ledgerDir);
        if (!fs.existsSync(ledgerDir)) continue;
        const streams = fs.readdirSync(ledgerDir).filter(f => {
          try { return fs.statSync(path.join(ledgerDir,f)).isDirectory(); } catch { return false; }
        });
        for (const stream of streams) {
          const evFile = path.join(ledgerDir, stream, 'events.ndjson');
          if (!fs.existsSync(evFile)) continue;
          const lines = fs.readFileSync(evFile,'utf8').trim().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const ev = JSON.parse(line);
              const evStr = JSON.stringify(ev);
              if (evStr.includes(traceId)) {
                trace.push({ system: name, stream, event: ev });
              }
            } catch {}
          }
        }
      }
      trace.sort((a,b) => (a.event._ts||0) - (b.event._ts||0));
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok:true, traceId, count:trace.length, trace }));
      return;
    }

    // Gap resolution — get fix command for a gap
    if (url.pathname.startsWith('/gaps/') && url.pathname.endsWith('/fix')) {
      const gapId = url.pathname.split('/')[2];
      const gap   = openGaps.get(gapId);
      if (!gap) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok:false, error:'gap not found' })); return; }
      const fixes = {
        'stuck_queue_item':    `node cli/diagnose.js ${gap.system} --fix`,
        'baseline_deviation':  `curl http://127.0.0.1:${PORT}/baseline/${gap.system}`,
        'system_offline':      `node service/${gap.system}-service.js`,
        'high_friction':       `node cli/diagnose.js ${gap.system}`,
        'orphaned_pending':    `node service/${gap.system}-service.js  # restart to replay queue`,
        'syntax_error':        `node --check ${gap.file || ''}`,
      };
      const fix = fixes[gap.type] || `node cli/diagnose.js ${gap.system || 'all'}`;
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok:true, gap, fix, ts: Date.now() }));
      return;
    }

    // System summary with trend data
    if (url.pathname.startsWith('/summary/')) {
      const system = url.pathname.split('/')[2];
      const cfg    = SYSTEMS[system];
      if (!cfg) { res.writeHead(404, CORS); res.end(JSON.stringify({ ok:false, error:'unknown system' })); return; }
      const state  = systemState[system] || {};
      const mon    = monitors[system];
      const stats  = mon.stats();
      const base   = mon.baseline();
      const gaps   = mon.gaps();
      const recentFailures = [];
      const failDir = path.join(ROOT, `data/${system}/failures`);
      if (fs.existsSync(failDir)) {
        for (const ff of fs.readdirSync(failDir).filter(f=>f.endsWith('.ndjson')).slice(-3)) {
          const lines = fs.readFileSync(path.join(failDir,ff),'utf8').trim().split('\n').filter(Boolean);
          lines.slice(-5).forEach(l => { try { recentFailures.push(JSON.parse(l)); } catch {} });
        }
      }
      res.writeHead(200, CORS);
      res.end(JSON.stringify({
        ok: true, system,
        state, stats, baseline: base,
        openGaps: gaps,
        recentFailures: recentFailures.sort((a,b)=>(b.loggedAt||0)-(a.loggedAt||0)).slice(0,10),
        pendingQueue: (() => {
          const qDir = path.join(ROOT, `data/${system}/input`);
          if (!fs.existsSync(qDir)) return 0;
          return fs.readdirSync(qDir).filter(f=>f.includes('.pending.')).length;
        })(),
      }));
      return;
    }

    // Audit
    if (url.pathname === '/audit') {
      const result = await runAuditInternal();
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, ...result }));
      return;
    }

    res.writeHead(404, CORS);
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[nexus-diagnostic] running :${PORT} pid=${process.pid}`);
    console.log(`[nexus-diagnostic] monitoring: ${Object.keys(SYSTEMS).join(', ')}`);
    ico.ledger.append('boot', { type: 'service.start', port: PORT, pid: process.pid, ts: Date.now() });
    broadcast({ type: 'service.start', port: PORT, ts: Date.now() });
  });

  // ── Shutdown ──────────────────────────────────────────────────────────────

  process.on('SIGTERM', () => {
    clearInterval(pollTimer);
    server.close();
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    ico.ledger.append('boot', { type: 'service.stop', reason: 'SIGTERM', ts: Date.now() });
    process.exit(0);
  });

  process.on('SIGINT', () => {
    clearInterval(pollTimer);
    server.close();
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  });
}

// Export for use by other modules
module.exports = { SYSTEMS };

// Make runAudit available as CLI
async function runAudit() {
  // Stub for CLI usage without running service
  const issues = [];
  const { spawnSync } = require('child_process');
  function walkJs(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (['node_modules','.git','data'].includes(f)) continue;
      if (fs.statSync(fp).isDirectory()) results.push(...walkJs(fp));
      else if (f.endsWith('.js')) results.push(fp);
    }
    return results;
  }
  let syntaxFails = 0;
  for (const file of walkJs(ROOT)) {
    const r = spawnSync('node', ['--check', file], { encoding:'utf8', timeout:5000 });
    if (r.status !== 0) { syntaxFails++; issues.push({ type:'syntax_error', file: file.replace(ROOT+'/',''), error:(r.stderr||'').split('\n')[0] }); }
  }
  return { ts: Date.now(), syntaxFails, totalIssues: issues.length, issues };
}
