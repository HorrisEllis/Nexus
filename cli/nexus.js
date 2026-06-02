#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════
// nexus — Unified CLI
// UUID: nexus-cli-v1-0-0
// Routes all commands to the right system via HTTP.
// Every feature exists here before it exists in any UI.
// ════════════════════════════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');

const SYSTEMS = {
  bridge:   { port: 9999, host: '127.0.0.1', label: 'Bridge' },
  cortex:   { port: 3748, host: '127.0.0.1', label: 'Cortex' },
  guardian: { port: 7820, host: '127.0.0.1', label: 'Guardian' },
  idearium: { port: 4800, host: '127.0.0.1', label: 'Idearium' },
  emerge:   { port: 4242, host: '127.0.0.1', label: 'Emerge IDE' },
  ollama:   { port: 11434, host: '127.0.0.1', label: 'Ollama' },
};

const C = {
  reset:  '\x1b[0m',  bold:   '\x1b[1m',
  green:  '\x1b[32m', red:    '\x1b[31m', yellow: '\x1b[33m',
  cyan:   '\x1b[36m', muted:  '\x1b[90m', white:  '\x1b[37m',
  blue:   '\x1b[34m', purple: '\x1b[35m',
};

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const arg = (i) => args[i];

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function req(system, method, urlPath, body, timeout = 5000) {
  return new Promise((resolve) => {
    const sys = SYSTEMS[system];
    if (!sys) return resolve({ ok: false, error: `Unknown system: ${system}` });
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: sys.host, port: sys.port, path: urlPath, method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(_) { resolve({ ok: res.statusCode < 400, raw: data }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok: false, error: `${system} timeout` }); });
    r.on('error', e => resolve({ ok: false, error: `${sys.label} offline: ${e.message}` }));
    if (payload) r.write(payload);
    r.end();
  });
}

const get  = (sys, path)       => req(sys, 'GET',  path);
const post = (sys, path, body) => req(sys, 'POST', path, body);

// ── Output helpers ────────────────────────────────────────────────────────────
function out(data) {
  if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
  if (typeof data === 'string') { console.log(data); return; }
  console.log(JSON.stringify(data, null, 2));
}

function ok(msg)   { console.log(`${C.green}✓${C.reset} ${msg}`); }
function err(msg)  { console.log(`${C.red}✗${C.reset} ${msg}`); }
function info(msg) { console.log(`${C.muted}·${C.reset} ${msg}`); }
function hdr(msg)  { console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`); }
function row(k, v, color = C.white) { console.log(`  ${C.muted}${k.padEnd(18)}${C.reset}${color}${v}${C.reset}`); }

// ── Commands ──────────────────────────────────────────────────────────────────

const COMMANDS = {

  // ── STATUS ─────────────────────────────────────────────────────────────────
  async status() {
    hdr('NEXUS STATUS');
    const checks = [
      ['bridge',   get('bridge',   '/bridge/health')],
      ['cortex',   get('cortex',   '/health')],
      ['guardian', get('guardian', '/health')],
      ['idearium', get('idearium', '/')],
      ['emerge',   get('emerge',   '/status')],
      ['ollama',   get('ollama',   '/api/tags')],
    ];
    const results = await Promise.all(checks.map(async ([name, p]) => ({ name, d: await p })));
    for (const { name, d } of results) {
      const sys = SYSTEMS[name];
      const live = d && !d.error;
      const status = live ? `${C.green}● ONLINE${C.reset}` : `${C.red}○ OFFLINE${C.reset}`;
      console.log(`  ${status}  ${C.bold}${sys.label.padEnd(12)}${C.reset} ${C.muted}localhost:${sys.port}${C.reset}`);
      if (live && name === 'cortex' && d.jaa) {
        const total = Object.values(d.jaa.counts || {}).reduce((a,b) => a+b, 0);
        info(`         ${total} records across 28 tables`);
      }
      if (live && name === 'guardian' && d.providers) {
        const connected = Object.entries(d.providers).filter(([,v]) => v === 'connected').map(([k]) => k);
        if (connected.length) info(`         providers: ${connected.join(', ')}`);
      }
      if (live && name === 'ollama' && d.models) {
        info(`         models: ${d.models?.map(m => m.name).join(', ') || '—'}`);
      }
      if (!live) info(`         ${d.error || 'not responding'}`);
    }
  },

  // ── BRIDGE ─────────────────────────────────────────────────────────────────
  async 'bridge:health'() {
    const d = await get('bridge', '/bridge/health');
    if (d.error) return err(d.error);
    hdr('BRIDGE HEALTH');
    row('status',   '● online', C.green);
    row('sessions', String(d.sessions));
    row('pending',  String(d.pendingRequests));
    row('events',   String(d.recentEvents));
    row('systems',  (d.systems || []).join(', '));
  },

  async 'bridge:request'() {
    const type    = args.find(a => a.startsWith('--type='))?.slice(7) || arg(2);
    const from    = args.find(a => a.startsWith('--from='))?.slice(7) || 'cli';
    const to      = args.find(a => a.startsWith('--to='))?.slice(5) || 'guardian';
    const payRaw  = args.find(a => a.startsWith('--payload='))?.slice(10) || '{}';
    if (!type) return err('Usage: nexus bridge request <type> --from=<s> --to=<s> --payload=<json>');
    let payload;
    try { payload = JSON.parse(payRaw); } catch(_) { return err('Invalid JSON in --payload'); }
    const d = await post('bridge', '/bridge/requests', { type, from, to, payload });
    if (d.error) return err(d.error);
    ok(`Request created: ${d.request?.uuid?.slice(0,8)} status: ${d.request?.status}`);
    out(d.request);
  },

  async 'bridge:requests'() {
    const status = args.find(a => a.startsWith('--status='))?.slice(9) || '';
    const d = await get('bridge', `/bridge/requests${status ? '?status='+status : ''}`);
    if (d.error) return err(d.error);
    const reqs = d.requests || [];
    hdr(`BRIDGE REQUESTS (${reqs.length})`);
    for (const r of reqs.slice(-20).reverse()) {
      const statusColor = r.status === 'pending' ? C.yellow : r.status === 'complete' ? C.green : r.status === 'failed' ? C.red : C.muted;
      console.log(`  ${C.muted}${r.uuid?.slice(0,8)}${C.reset}  ${statusColor}${r.status.padEnd(10)}${C.reset}  ${r.type.padEnd(20)}  ${C.muted}${r.from} → ${r.to}${C.reset}`);
    }
  },

  async 'bridge:accept'() {
    const uuid = arg(2);
    if (!uuid) return err('Usage: nexus bridge accept <uuid>');
    const d = await post('bridge', `/bridge/requests/${uuid}/accept`, { by: 'cli' });
    if (d.error || !d.ok) return err(d.error || 'failed');
    ok(`Accepted: ${uuid.slice(0,8)} → ${d.request?.status}`);
  },

  async 'bridge:reject'() {
    const uuid   = arg(2);
    const reason = args.find(a => a.startsWith('--reason='))?.slice(9) || '';
    if (!uuid) return err('Usage: nexus bridge reject <uuid> [--reason=text]');
    const d = await post('bridge', `/bridge/requests/${uuid}/reject`, { by: 'cli', reason });
    if (d.error || !d.ok) return err(d.error || 'failed');
    ok(`Rejected: ${uuid.slice(0,8)}`);
  },

  async 'bridge:tag'() {
    const entityId = arg(2);
    const tagsRaw  = args.find(a => a.startsWith('--tags='))?.slice(7) || '';
    if (!entityId || !tagsRaw) return err('Usage: nexus bridge tag <entityId> --tags=tag1,tag2');
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const d = await post('bridge', '/bridge/tags', { entityId, entityType: 'entity', system: 'cli', tags, addedBy: 'cli' });
    if (!d.ok) return err(d.error || 'failed');
    ok(`Tagged ${entityId}: ${tags.join(', ')}`);
  },

  async 'bridge:tags'() {
    const entityId = arg(2);
    if (!entityId) return err('Usage: nexus bridge tags <entityId>');
    const d = await get('bridge', `/bridge/tags/${encodeURIComponent(entityId)}`);
    if (d.error) return err(d.error);
    hdr(`TAGS: ${entityId}`);
    (d.tags || []).forEach(t => console.log(`  ${C.cyan}${t}${C.reset}`));
    if (!d.tags?.length) info('no tags');
  },

  async 'bridge:find'() {
    const tag = args.find(a => a.startsWith('--tag='))?.slice(6) || arg(2);
    if (!tag) return err('Usage: nexus bridge find --tag=<tag>');
    const d = await get('bridge', `/bridge/tags?tag=${encodeURIComponent(tag)}`);
    if (d.error) return err(d.error);
    hdr(`ENTITIES WITH TAG: ${tag}`);
    (d.entities || []).forEach(e => console.log(`  ${C.muted}${e.entityId?.slice(0,20)}${C.reset}  ${e.entityType}  ${e.system}`));
    if (!d.entities?.length) info('none found');
  },

  // ── CORTEX ─────────────────────────────────────────────────────────────────
  async 'cortex:status'() {
    const d = await get('cortex', '/health');
    if (d.error) return err(d.error);
    hdr('CORTEX STATUS');
    row('status',  d.status);
    row('uptime',  Math.round(d.uptime || 0) + 's');
    row('jaa',     d.jaa?.ready ? 'ready' : 'loading');
    const total = Object.values(d.jaa?.counts || {}).reduce((a,b) => a+b, 0);
    row('records', String(total) + ' across 28 tables');
    if (d.cobalt) {
      row('bus tick', String(d.cobalt.bus?.tick || 0));
      row('registry', d.cobalt.registry?.total + ' nodes');
    }
  },

  async 'cortex:events'() {
    const n = args.find(a => a.startsWith('--n='))?.slice(4) || '20';
    const d = await get('cortex', `/api/events?n=${n}`);
    if (d.error) return err(d.error);
    const rows = d.rows || d;
    if (!Array.isArray(rows)) return err('Unexpected response');
    hdr(`CORTEX EVENTS (${rows.length})`);
    for (const e of rows) {
      const ts = new Date(e.ts).toTimeString().slice(0,8);
      console.log(`  ${C.muted}${ts}${C.reset}  ${C.cyan}${e.type?.padEnd(35) || '—'}${C.reset}  ${C.muted}${JSON.stringify(e.payload||{}).slice(0,60)}${C.reset}`);
    }
  },

  async 'cortex:post'() {
    const type    = args.find(a => a.startsWith('--type='))?.slice(7);
    const payRaw  = args.find(a => a.startsWith('--payload='))?.slice(10) || '{}';
    if (!type) return err('Usage: nexus cortex post --type=x [--payload=json]');
    let payload;
    try { payload = JSON.parse(payRaw); } catch(_) { return err('Invalid JSON'); }
    const d = await post('cortex', '/api/event', { type, payload });
    if (d.error) return err(d.error);
    ok(`Event stored: ${d.uuid?.slice(0,8)} type: ${d.type}`);
  },

  async 'cortex:gaps'() {
    const status = args.find(a => a.startsWith('--status='))?.slice(9) || '';
    const d = await get('cortex', `/api/gaps${status ? '?status='+status : ''}`);
    if (d.error) return err(d.error);
    const rows = d.rows || d;
    hdr(`CORTEX GAPS (${rows.length})`);
    for (const g of rows) {
      const pressureColor = (g.pressure || 0) > 0.7 ? C.red : (g.pressure || 0) > 0.4 ? C.yellow : C.muted;
      console.log(`  ${pressureColor}${String((g.pressure||0)*100).slice(0,3)}%${C.reset}  ${C.cyan}${(g.type||'—').padEnd(15)}${C.reset}  ${g.body?.slice(0,60) || g.message?.slice(0,60) || '—'}`);
    }
    if (!rows.length) info('no gaps');
  },

  async 'cortex:memory'() {
    const query = args.slice(2).filter(a => !a.startsWith('--')).join(' ');
    if (!query) return err('Usage: nexus cortex memory <query>');
    const d = await post('cortex', '/api/memory/search', { q: query });
    if (d.error) return err(d.error);
    hdr(`MEMORY SEARCH: "${query}"`);
    (d.results || []).forEach(r => {
      console.log(`  ${C.white}${r.content?.slice(0,80) || '—'}${C.reset}`);
      console.log(`  ${C.muted}${r.source} · ${new Date(r.ts||0).toTimeString().slice(0,8)}${C.reset}`);
    });
    if (!d.results?.length) info('no results');
  },

  async 'cortex:tail'() {
    const table = arg(2) || 'event_log';
    const n     = arg(3) || '20';
    const d     = await get('cortex', `/api/memory?table=${table}&n=${n}`);
    if (d.error) return err(d.error);
    const rows = d.rows || d;
    hdr(`CORTEX TABLE: ${table} (${rows.length})`);
    out(rows);
  },

  // ── GUARDIAN ───────────────────────────────────────────────────────────────
  async 'guardian:dispatch'() {
    const provider = args.find(a => a.startsWith('--provider='))?.slice(11) || 'chatgpt';
    const command  = args.find(a => a.startsWith('--command='))?.slice(10) || 'code';
    const prompt   = args.find(a => a.startsWith('--prompt='))?.slice(9) ||
                     args.filter(a => !a.startsWith('--') && !['dispatch','guardian'].includes(a)).join(' ');
    if (!prompt) return err('Usage: nexus guardian dispatch --prompt="..." [--provider=chatgpt] [--command=code]');
    const d = await post('guardian', '/command', { provider, command, prompt });
    if (d.error) return err(d.error);
    if (!d.ok && d.error) return err(d.error);
    ok(`Job created: ${d.jobId?.slice(0,8)} status: ${d.status || d.ok}`);
    info(`Watch: nexus guardian watch ${d.jobId}`);
  },

  async 'guardian:jobs'() {
    const status = args.find(a => a.startsWith('--status='))?.slice(9) || '';
    const d = await get('guardian', `/jobs${status ? '?status='+status : ''}`);
    if (d.error) return err(d.error);
    const jobs = d.jobs || [];
    hdr(`GUARDIAN JOBS (${jobs.length})`);
    for (const j of jobs.slice(0,20)) {
      const sc = j.status === 'complete' ? C.green : j.status === 'failed' ? C.red : C.yellow;
      console.log(`  ${C.muted}${j.id?.slice(0,8)}${C.reset}  ${sc}${j.status?.padEnd(12)}${C.reset}  ${C.cyan}${j.provider?.padEnd(10)}${C.reset}  ${j.command?.padEnd(6)}  ${C.muted}${(j.prompt||'').slice(0,50)}${C.reset}`);
    }
    if (!jobs.length) info('no jobs');
  },

  async 'guardian:status'() {
    const jobId = arg(2);
    if (!jobId) return err('Usage: nexus guardian status <jobId>');
    const d = await get('guardian', `/status/${jobId}`);
    if (d.error) return err(d.error);
    hdr('JOB STATUS');
    row('id',       d.job?.id?.slice(0,8) || jobId.slice(0,8));
    row('status',   d.job?.status || '—');
    row('provider', d.job?.provider || '—');
    row('command',  d.job?.command || '—');
  },

  async 'guardian:response'() {
    const jobId = arg(2);
    if (!jobId) return err('Usage: nexus guardian response <jobId>');
    const d = await get('guardian', `/response/${jobId}`);
    if (d.error) return err(d.error);
    hdr('JOB RESPONSE');
    row('status',   d.status || '—');
    row('complete', String(d.complete));
    if (d.response) console.log('\n' + d.response + '\n');
    else info('no response yet');
  },

  async 'guardian:watch'() {
    const jobId = arg(2);
    if (!jobId) return err('Usage: nexus guardian watch <jobId>');
    const sys = SYSTEMS.guardian;
    hdr(`WATCHING JOB ${jobId.slice(0,8)}`);
    info('streaming response... (ctrl+c to stop)');
    console.log('');

    const options = {
      hostname: sys.host, port: sys.port,
      path: `/stream/${jobId}`, method: 'GET',
      headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
    };
    const req = http.request(options, (res) => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const d = JSON.parse(line.slice(5).trim());
            if (d.text) process.stdout.write(d.text);
            if (d.complete) { console.log('\n'); ok('Job complete'); process.exit(0); }
            if (d.status === 'complete') { console.log('\n'); ok('Done'); process.exit(0); }
          } catch(_) {}
        }
      });
      res.on('end', () => { console.log(''); ok('Stream ended'); process.exit(0); });
    });
    req.on('error', e => err(e.message));
    req.end();
  },

  async 'cortex:stream'() {
    const sys = SYSTEMS.cortex;
    hdr('CORTEX LIVE STREAM');
    info('streaming events... (ctrl+c to stop)');
    const options = {
      hostname: sys.host, port: sys.port,
      path: '/sse', method: 'GET',
      headers: { Accept: 'text/event-stream' },
    };
    const req = http.request(options, (res) => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const d = JSON.parse(line.slice(5).trim());
            const ts  = new Date(d.ts||Date.now()).toTimeString().slice(0,8);
            const type = (d.type||'event').padEnd(35);
            console.log(`  ${C.muted}${ts}${C.reset}  ${C.cyan}${type}${C.reset}  ${C.muted}${JSON.stringify(d.payload||{}).slice(0,60)}${C.reset}`);
          } catch(_) {}
        }
      });
    });
    req.on('error', e => { err(e.message); process.exit(1); });
    req.end();
  },

  async 'bridge:stream'() {
    const sys = SYSTEMS.bridge;
    const channel = args.find(a => a.startsWith('--channel='))?.slice(10) || '*';
    hdr(`BRIDGE STREAM: ${channel}`);
    info('subscribing... (ctrl+c to stop)');
    const options = {
      hostname: sys.host, port: sys.port,
      path: `/bridge/subscribe?channel=${encodeURIComponent(channel)}`,
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    };
    const req = http.request(options, (res) => {
      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const d = JSON.parse(line.slice(5).trim());
            const ts = new Date(d.bridgeTs||Date.now()).toTimeString().slice(0,8);
            console.log(`  ${C.muted}${ts}${C.reset}  ${C.purple}${(d.type||'event').padEnd(35)}${C.reset}  ${C.muted}${JSON.stringify(d).slice(0,60)}${C.reset}`);
          } catch(_) {}
        }
      });
    });
    req.on('error', e => { err(e.message); process.exit(1); });
    req.end();
  },

  async 'guardian:providers'() {
    const d = await get('guardian', '/providers');
    if (d.error) return err(d.error);
    hdr('GUARDIAN PROVIDERS');
    for (const [name, status] of Object.entries(d.providers || {})) {
      const c = status === 'connected' ? C.green : C.muted;
      console.log(`  ${c}${status === 'connected' ? '●' : '○'}${C.reset}  ${name}`);
    }
  },

  // ── IDEARIUM ───────────────────────────────────────────────────────────────
  async 'idea:add'() {
    const text = args.slice(2).filter(a => !a.startsWith('--')).join(' ');
    if (!text) return err('Usage: nexus idea add <text>');
    const d = await post('idearium', '/api/ideas', { text });
    if (d.error) return err(d.error);
    ok(`Idea created: ${(d.idea?.uuid || d.uuid)?.slice(0,8)} "${text.slice(0,40)}"`);
  },

  async 'idea:list'() {
    const d = await get('idearium', '/api/ideas');
    if (d.error) return err(d.error);
    const ideas = d.ideas || d || [];
    hdr(`IDEAS (${ideas.length})`);
    for (const idea of ideas.slice(-20).reverse()) {
      const phaseColor = idea.phase === 'complete' ? C.green : idea.phase === 'building' ? C.cyan : C.muted;
      console.log(`  ${C.muted}${idea.uuid?.slice(0,8)}${C.reset}  ${phaseColor}${(idea.phase||'seed').padEnd(12)}${C.reset}  ${idea.text?.slice(0,60) || '—'}`);
    }
    if (!ideas.length) info('no ideas yet');
  },

  async 'gap:open'() {
    const description = args.slice(2).filter(a => !a.startsWith('--')).join(' ');
    if (!description) return err('Usage: nexus gap open <description>');
    const d = await post('idearium', '/api/gaps', { description });
    if (d.error) return err(d.error);
    ok(`Gap opened: ${(d.gap?.uuid || d.uuid)?.slice(0,8)}`);
  },

  async 'gap:list'() {
    const d = await get('idearium', '/api/gaps');
    if (d.error) return err(d.error);
    const gaps = d.gaps || d || [];
    hdr(`GAPS (${gaps.length})`);
    for (const g of gaps) {
      const sc = g.status === 'resolved' ? C.green : g.status === 'open' ? C.yellow : C.muted;
      console.log(`  ${C.muted}${g.uuid?.slice(0,8)}${C.reset}  ${sc}${(g.status||'open').padEnd(10)}${C.reset}  ${g.description?.slice(0,60) || '—'}`);
    }
    if (!gaps.length) info('no gaps');
  },

  async 'push'() {
    const message = args.slice(1).filter(a => !a.startsWith('--')).join(' ') || 'snapshot';
    const d = await post('idearium', '/api/snapshots', { message });
    if (d.error) return err(d.error);
    ok(`Pushed: ${(d.snapshot?.uuid || d.uuid)?.slice(0,8)} "${message}"`);
  },

  async 'snr'() {
    const d = await get('idearium', '/api/snr');
    if (d.error) return err(d.error);
    const snr = d.snr || 0;
    const color = snr > 0.8 ? C.green : snr > 0.5 ? C.yellow : C.red;
    const bar = '█'.repeat(Math.round(snr * 20)) + '░'.repeat(20 - Math.round(snr * 20));
    console.log(`\n  ${color}${bar}${C.reset}  ${color}${(snr * 100).toFixed(1)}% SNR${C.reset}\n`);
  },

  // ── HELP ───────────────────────────────────────────────────────────────────
  async watchdog() {
    hdr('NEXUS WATCHDOG');
    info('checking all systems every 5s — ctrl+c to stop');
    let iteration = 0;
    async function check() {
      iteration++;
      process.stdout.write(`\r[${new Date().toTimeString().slice(0,8)}] `);
      const checks = await Promise.all(Object.entries(SYSTEMS).map(async ([name, sys]) => {
        const start = Date.now();
        const d = await get(name, name === 'bridge' ? '/bridge/health' : '/health');
        const ms = Date.now() - start;
        return { name, sys, online: !d.error, ms, d };
      }));
      const line = checks.map(({name, sys, online, ms}) =>
        `${online ? C.green+'●'+C.reset : C.red+'○'+C.reset} ${name}(${ms}ms)`
      ).join('  ');
      process.stdout.write(line + '          ');
      const offline = checks.filter(c => !c.online);
      if (offline.length) {
        process.stdout.write('\n');
        offline.forEach(({name, d}) => info(`  ${name}: ${d.error}`));
      }
    }
    await check();
    setInterval(check, 5000);
  },

  help() {
    console.log(`
${C.bold}${C.cyan}NEXUS — Unified CLI${C.reset}

${C.bold}System status${C.reset}
  nexus status                         all systems health check

${C.bold}Quick commands${C.reset}
  nexus dispatch "prompt"              dispatch to chatgpt (default)
  nexus jobs                           list recent jobs
  nexus events                         tail cortex event log
  nexus gaps                           all open gaps
  nexus idea "text"                    create idea in idearium
  nexus push "message"                 snapshot + versionium commit
  nexus snr                            system SNR score

${C.bold}Bridge (port 9999)${C.reset}
  nexus bridge health
  nexus bridge requests [--status=pending]
  nexus bridge request <type> --from=x --to=x --payload=json
  nexus bridge accept <uuid>
  nexus bridge reject <uuid> [--reason=text]
  nexus bridge tag <entityId> --tags=tag1,tag2
  nexus bridge tags <entityId>
  nexus bridge find --tag=status:pending

${C.bold}Cortex (port 3748)${C.reset}
  nexus cortex status
  nexus cortex events [--n=20]
  nexus cortex post --type=x [--payload=json]
  nexus cortex gaps [--status=open]
  nexus cortex memory <query>
  nexus cortex tail <table> [n]

${C.bold}Guardian (port 7820)${C.reset}
  nexus guardian dispatch --prompt="..." [--provider=chatgpt] [--command=code]
  nexus guardian jobs [--status=pending]
  nexus guardian status <jobId>
  nexus guardian response <jobId>
  nexus guardian providers

${C.bold}Idearium (port 4800)${C.reset}
  nexus idea add "text"
  nexus idea list
  nexus gap open "description"
  nexus gap list
  nexus push "message"
  nexus snr

${C.bold}Streaming${C.reset}
  nexus stream                         live cortex event stream
  nexus watch <jobId>                  stream a guardian job response
  nexus bridge:stream [--channel=x]    subscribe to bridge channel
  nexus watchdog                       watch all systems every 5s

Flags: --json (output raw JSON)
`);
  },
};

// ── Shorthands ────────────────────────────────────────────────────────────────
const SHORTHANDS = {
  status:   'status',
  dispatch: 'guardian:dispatch',
  jobs:     'guardian:jobs',
  events:   'cortex:events',
  stream:   'cortex:stream',
  watch:    'guardian:watch',
  watchdog: 'watchdog',
  gaps:     'gap:list',
  push:     'push',
  snr:      'snr',
  idea:     'idea:add',
  help:     'help',
  '--help': 'help',
  '-h':     'help',
};

// ── Route ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!args.length) return COMMANDS.help();

  const rawCmd = args.slice(0, 3).join(':').replace(/^nexus:/, '');

  // Try progressively shorter command keys
  const keys = [
    args.slice(0,3).join(':'),
    args.slice(0,2).join(':'),
    args[0],
  ];

  for (const key of keys) {
    if (COMMANDS[key]) return COMMANDS[key]();
    if (SHORTHANDS[key]) return COMMANDS[SHORTHANDS[key]]?.();
  }

  // Alias: `nexus idea list` → COMMANDS['idea:list']
  // Already handled by keys above

  err(`Unknown command: nexus ${args.join(' ')}`);
  info('Run nexus help to see all commands');
  process.exit(1);
}

main().catch(e => {
  console.error(`${C.red}Fatal:${C.reset}`, e.message);
  process.exit(1);
});
