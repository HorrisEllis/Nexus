#!/usr/bin/env node
/**
 * nexus-diag.js — Standalone diagnostic service
 * Completely isolated from NEXUS. Runs independently.
 * Diagnoses NEXUS, Guardian, Bridge — from the outside.
 *
 * Usage:
 *   node service/nexus-diag.js              — run full diagnostic, print results
 *   node service/nexus-diag.js --watch      — monitor continuously, show on crash
 *   node service/nexus-diag.js --guardian   — test Guardian execute flow
 *   node service/nexus-diag.js --json       — output JSON only
 */

'use strict';
const http  = require('http');
const https = require('https');
const os    = require('os');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

const args   = process.argv.slice(2);
const WATCH  = args.includes('--watch');
const JSON_OUT = args.includes('--json');
const GUARDIAN_TEST = args.includes('--guardian');
const BRIDGE = process.env.NEXUS_BRIDGE_URL || 'http://127.0.0.1:3747';
const ROOT   = path.join(__dirname, '..');

// ── Colours ───────────────────────────────────────────────────────────────────
const C = JSON_OUT ? {g:'',r:'',y:'',c:'',d:'',rst:''} : {
  g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', c:'\x1b[36m', d:'\x1b[2m', rst:'\x1b[0m'
};
const ok  = (s) => C.g + '  ✓ ' + s + C.rst;
const err = (s) => C.r + '  ✗ ' + s + C.rst;
const wrn = (s) => C.y + '  ⚠ ' + s + C.rst;
const hdr = (s) => C.c + '\n── ' + s + ' ──' + C.rst;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function probe(url, opts, ms) {
  ms = ms || 3000;
  return new Promise(function(resolve) {
    var mod  = url.startsWith('https') ? https : http;
    var data = opts && opts.body ? opts.body : null;
    var reqOpts = Object.assign({ method: data ? 'POST' : 'GET' }, opts || {});
    delete reqOpts.body;
    var req = mod.request(url, reqOpts, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        var json = null;
        try { json = JSON.parse(body); } catch(_) {}
        resolve({ ok: res.statusCode < 400, status: res.statusCode, json: json, body: body.slice(0,500) });
      });
    });
    req.setTimeout(ms, function() { req.destroy(); resolve({ ok:false, status:0, err:'timeout' }); });
    req.on('error', function(e) { resolve({ ok:false, status:0, err:e.message }); });
    if (data) req.write(data);
    req.end();
  });
}

// ── System metrics ────────────────────────────────────────────────────────────
function sysMetrics() {
  var totalRam = Math.round(os.totalmem()/1024/1024);
  var freeRam  = Math.round(os.freemem()/1024/1024);
  var usedPct  = Math.round((totalRam-freeRam)/totalRam*100);
  var cpus     = os.cpus();
  var load     = os.loadavg()[0];

  var diskInfo = null;
  try {
    if (process.platform === 'win32') {
      var drive = ROOT.split(':')[0] + ':';
      var out = execSync('wmic logicaldisk where caption="'+drive+'" get freespace,size /value',
        { encoding:'utf8', timeout:3000, stdio:'pipe' });
      var free  = parseInt((out.match(/FreeSpace=(\d+)/) || [])[1] || '0');
      var total = parseInt((out.match(/Size=(\d+)/)      || [])[1] || '0');
      if (total > 0) diskInfo = { freeGB: Math.round(free/1e9), totalGB: Math.round(total/1e9), pct: Math.round((total-free)/total*100) };
    } else {
      var df = execSync('df -k ' + ROOT, { encoding:'utf8', timeout:2000 }).split('\n')[1].trim().split(/\s+/);
      var used = parseInt(df[2])*1024, avail = parseInt(df[3])*1024, ttl = used+avail;
      diskInfo = { freeGB: Math.round(avail/1e9), totalGB: Math.round(ttl/1e9), pct: Math.round(used/ttl*100) };
    }
  } catch(_) {}

  return { ram: { usedMB: totalRam-freeRam, totalMB: totalRam, pct: usedPct },
           cpu: { cores: cpus.length, load1m: Math.round(load*10)/10, model: cpus[0]?.model || '?' },
           disk: diskInfo, platform: process.platform, arch: process.arch, node: process.version };
}

// ── NEXUS PID check ───────────────────────────────────────────────────────────
function checkNexusPid() {
  var pidFile = path.join(ROOT, 'bridge', 'data', 'nexus-app.pid');
  try {
    var data = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
    var pid  = data.pid;
    try { process.kill(pid, 0); return { running:true, pid, started:data.started, exe:data.exe }; }
    catch(e) { return { running:false, pid, reason: e.code === 'ESRCH' ? 'process dead' : e.message }; }
  } catch(e) { return { running:null, reason:'no PID file: ' + e.message }; }
}

// ── Crash log reader ──────────────────────────────────────────────────────────
function readCrashLog() {
  var candidates = [
    path.join(path.dirname(process.execPath), 'nexus-crash.log'),
    path.join(process.env.APPDATA||'', 'nexus', 'nexus-crash.log'),
    path.join(process.env.HOME||os.homedir(), 'nexus', 'nexus-crash.log'),
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) {
      try {
        var lines = fs.readFileSync(candidates[i], 'utf8').trim().split('\n').filter(Boolean);
        var entries = lines.slice(-20).map(function(l) { try { return JSON.parse(l); } catch(_) { return null; } }).filter(Boolean);
        var errors  = entries.filter(function(e) { return e.level === 'ERROR' || e.level === 'CRITICAL'; });
        return { file: candidates[i], total: lines.length, recent: entries, errors: errors };
      } catch(_) {}
    }
  }
  return { file: null, total: 0, recent: [], errors: [] };
}

// ── Full diagnostic ───────────────────────────────────────────────────────────
async function runDiagnostic() {
  var results = [], pass = 0, fail = 0, warn = 0;
  var startTs = Date.now();

  function record(category, name, status, value) {
    results.push({ category, name, status, value });
    if (status === 'PASS') pass++;
    else if (status === 'FAIL') fail++;
    else warn++;
  }

  if (!JSON_OUT) {
    console.log(C.c + '\n╔══════════════════════════════════════╗');
    console.log('║  NEXUS Standalone Diagnostic         ║');
    console.log('╚══════════════════════════════════════╝' + C.rst);
    console.log(C.d + '  ' + new Date().toISOString() + '  node=' + process.version + C.rst);
  }

  // ── SYSTEM ──────────────────────────────────────────────────────────────────
  if (!JSON_OUT) console.log(hdr('SYSTEM'));
  var sys = sysMetrics();
  record('system', 'platform', 'PASS', sys.platform + ' ' + sys.arch);
  record('system', 'node',     'PASS', sys.node);
  record('system', 'ram',      sys.ram.pct > 90 ? 'WARN' : 'PASS',
         sys.ram.usedMB + '/' + sys.ram.totalMB + ' MB (' + sys.ram.pct + '%)');
  record('system', 'cpu',      'PASS', sys.cpu.cores + ' cores  load=' + sys.cpu.load1m);
  if (sys.disk) record('system', 'disk', sys.disk.pct > 95 ? 'WARN' : 'PASS',
    sys.disk.freeGB + 'GB free / ' + sys.disk.totalGB + 'GB (' + sys.disk.pct + '% used)');

  if (!JSON_OUT) results.filter(function(r){return r.category==='system';}).forEach(function(r) {
    console.log(r.status==='PASS' ? ok(r.name.padEnd(12)+r.value) : wrn(r.name.padEnd(12)+r.value));
  });

  // ── NEXUS PROCESS ───────────────────────────────────────────────────────────
  if (!JSON_OUT) console.log(hdr('NEXUS PROCESS'));
  var nxPid = checkNexusPid();
  if (nxPid.running === true) {
    record('nexus', 'pid',     'PASS', 'pid=' + nxPid.pid);
    record('nexus', 'uptime',  'PASS', Math.round((Date.now()-nxPid.started)/1000) + 's');
    if (!JSON_OUT) { console.log(ok('pid          ' + nxPid.pid)); console.log(ok('uptime       ' + Math.round((Date.now()-nxPid.started)/1000) + 's')); }
  } else if (nxPid.running === false) {
    record('nexus', 'pid',     'FAIL', 'pid=' + nxPid.pid + ' DEAD: ' + nxPid.reason);
    if (!JSON_OUT) console.log(err('pid          NEXUS not running (' + nxPid.reason + ')'));
  } else {
    record('nexus', 'pid',     'WARN', nxPid.reason);
    if (!JSON_OUT) console.log(wrn('pid          ' + nxPid.reason));
  }

  // ── BRIDGE ──────────────────────────────────────────────────────────────────
  if (!JSON_OUT) console.log(hdr('BRIDGE ' + BRIDGE));
  var endpoints = [
    ['/health',              'health'],
    ['/network/info',        'network-info'],
    ['/pulse',               'pulse'],
    ['/guardian/status',     'guardian-status'],
    ['/guardian/agent-hooks','agent-hooks'],
    ['/userscript/callto',   'calltos'],
    ['/metrics',             'metrics'],
  ];
  for (var ei = 0; ei < endpoints.length; ei++) {
    var ep = endpoints[ei];
    var r  = await probe(BRIDGE + ep[0], {}, 2000);
    record('bridge', ep[1], r.ok ? 'PASS' : 'FAIL',
           r.ok ? 'HTTP ' + r.status : (r.err || 'HTTP ' + r.status));
    if (!JSON_OUT) console.log(r.ok ? ok(ep[0].padEnd(28) + r.status) : err(ep[0].padEnd(28) + (r.err||r.status)));
  }

  // ── CRASH LOG ───────────────────────────────────────────────────────────────
  if (!JSON_OUT) console.log(hdr('CRASH LOG'));
  var log = readCrashLog();
  if (log.file) {
    record('crashlog', 'file',   'PASS',  log.file);
    record('crashlog', 'entries','PASS',  log.total + ' total');
    if (log.errors.length) {
      record('crashlog', 'errors', 'WARN', log.errors.length + ' error entries');
      if (!JSON_OUT) {
        console.log(wrn('file         ' + log.file));
        console.log(wrn('errors       ' + log.errors.length + ' recent'));
        log.errors.slice(-3).forEach(function(e) {
          console.log(C.r + '             [' + e.level + '] ' + e.source + ': ' + e.msg.slice(0,60) + C.rst);
        });
      }
    } else {
      record('crashlog', 'errors', 'PASS', 'no errors');
      if (!JSON_OUT) console.log(ok('file         ' + log.file)); console.log(ok('errors       none'));
    }
  } else {
    record('crashlog', 'file', 'WARN', 'not found');
    if (!JSON_OUT) console.log(wrn('file         not found in expected locations'));
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  var duration = Date.now() - startTs;
  var report = { ts: Date.now(), iso: new Date().toISOString(), duration, pass, fail, warn,
                 score: pass + '/' + (pass+fail+warn), results, system: sys, nexus: nxPid, log };

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    var scoreColor = fail > 0 ? C.r : warn > 0 ? C.y : C.g;
    console.log('\n' + scoreColor + '  Score: ' + report.score + '  (' + duration + 'ms)' + C.rst);
    if (fail > 0) console.log(C.r + '  ' + fail + ' failures' + C.rst);
    if (warn > 0) console.log(C.y + '  ' + warn + ' warnings' + C.rst);
    console.log('');
  }

  return report;
}

// ── Guardian execute test ─────────────────────────────────────────────────────
async function testGuardianExecute() {
  if (!JSON_OUT) {
    console.log(C.c + '\n╔══════════════════════════════════════╗');
    console.log('║  Guardian Execute Flow Test          ║');
    console.log('╚══════════════════════════════════════╝' + C.rst);
  }

  // 1. Check Guardian connected
  var status = await probe(BRIDGE + '/guardian/status');
  if (!status.ok || !status.json?.connected) {
    console.log(err('Guardian not connected. Open Firefox with Guardian extension.'));
    return { ok:false, reason:'guardian not connected' };
  }
  console.log(ok('Guardian connected'));

  // 2. List calltos
  var calltos = await probe(BRIDGE + '/userscript/callto');
  var list = calltos.json?.calltos || [];
  console.log(ok('Calltos registered: ' + list.length));
  if (!list.length) {
    console.log(wrn('No calltos — pick an element with Guardian first'));
    return { ok:false, reason:'no calltos' };
  }

  // Show available calltos
  list.forEach(function(ct, i) {
    console.log(C.d + '  [' + i + '] ' + ct.id + ' · ' + (ct.label||ct.selector||'?').slice(0,40) + ' · ' + (ct.url||'').slice(0,30) + C.rst);
  });

  // 3. Pick first callto
  var ct = list[0];
  console.log(C.c + '\n  Testing callto: ' + ct.id + C.rst);

  // 4. Execute the callto
  var execRes = await probe(BRIDGE + '/userscript/callto/' + ct.id + '/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: { type:'exec', text:'NEXUS diagnostic test ' + Date.now(), source:'diag' } })
  }, 5000);

  if (execRes.ok) {
    console.log(ok('Exec dispatched — waiting for response via SSE…'));
  } else {
    console.log(err('Exec failed: ' + (execRes.err || execRes.status)));
    return { ok:false, reason:'exec failed' };
  }

  // 5. Subscribe to SSE and wait for response (10s timeout)
  console.log(C.d + '  Listening for guardian.link.event…' + C.rst);
  var response = await new Promise(function(resolve) {
    var buf = '';
    var req = http.request(BRIDGE + '/events', { timeout: 10000 }, function(res) {
      res.on('data', function(chunk) {
        buf += chunk.toString();
        var lines = buf.split('\n');
        for (var i = 0; i < lines.length - 1; i++) {
          var line = lines[i].trim();
          if (line.startsWith('data:')) {
            try {
              var d = JSON.parse(line.slice(5).trim());
              if (d.type === 'guardian.link.event' || d.type === 'guardian:ai:response') {
                req.destroy();
                resolve({ ok:true, text: d.text || d.payload?.text || '(no text)' });
              }
            } catch(_) {}
          }
        }
        buf = lines[lines.length - 1];
      });
    });
    req.on('error', function(e) { resolve({ ok:false, err:e.message }); });
    req.setTimeout(10000, function() { req.destroy(); resolve({ ok:false, err:'timeout - no response in 10s' }); });
    req.end();
  });

  if (response.ok) {
    console.log(ok('Response captured: ' + response.text.slice(0,80)));
    return { ok:true, calltoId: ct.id, response: response.text };
  } else {
    console.log(wrn('No response captured: ' + response.err));
    console.log(C.d + '  (Guardian may have executed but listener not set up)' + C.rst);
    return { ok:'partial', calltoId: ct.id, reason: response.err };
  }
}

// ── Watch mode ────────────────────────────────────────────────────────────────
async function watchMode() {
  console.log(C.c + 'NEXUS Diagnostic Watchdog — ' + new Date().toISOString() + C.rst);
  console.log(C.d + 'Monitoring every 30s. Ctrl+C to stop.\n' + C.rst);

  async function tick() {
    var r = await runDiagnostic();
    if (r.fail > 0 && !JSON_OUT) {
      console.log(C.r + '\n  !! FAILURES DETECTED — see above !!\n' + C.rst);
    }
  }

  await tick();
  setInterval(tick, 30000);
}

// ── Entry ─────────────────────────────────────────────────────────────────────
(async function main() {
  try {
    if (GUARDIAN_TEST) {
      await testGuardianExecute();
    } else if (WATCH) {
      await watchMode();
    } else {
      var report = await runDiagnostic();
      if (!WATCH && !JSON_OUT) process.exit(report.fail > 0 ? 1 : 0);
    }
  } catch(e) {
    console.error(C.r + 'Diagnostic error: ' + e.message + C.rst);
    process.exit(2);
  }
})();
