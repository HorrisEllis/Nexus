#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════
// nexus — Unified CLI  v2.0
// UUID: nexus-cli-v2-0-0
//
// One entry point. Every system reachable two ways:
//
//   nexus <command>          — unified commands (nexus status, nexus jobs, ...)
//   nexus /guardian <args>   — pass-through to guardian/cli.js directly
//   nexus /cockpit <args>    — pass-through to cockpit/cli.js (forge commands)
//   nexus /cortex <args>     — pass-through to cortex/cortex.js
//   nexus /idearium <args>   — pass-through to idearium/cli/index.js
//   nexus /ollama <args>     — ollama direct commands
//   nexus /bridge <args>     — bridge direct commands
//
// ════════════════════════════════════════════════════════════════════════════

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { spawnSync } = require('child_process');

const ROOT   = path.join(__dirname, '..');
const args   = process.argv.slice(2);
const JSON_  = args.includes('--json');

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',  bold:   '\x1b[1m',
  green:  '\x1b[32m', red:    '\x1b[31m', yellow: '\x1b[33m',
  cyan:   '\x1b[36m', muted:  '\x1b[90m', white:  '\x1b[37m',
  blue:   '\x1b[34m', purple: '\x1b[35m', teal:   '\x1b[36m',
};

const SYSTEMS = {
  bridge:   { port: 9999,  label: 'Bridge',    color: C.yellow },
  cortex:   { port: 3748,  label: 'Cortex',    color: C.cyan   },
  guardian: { port: 7820,  label: 'Guardian',  color: C.purple },
  idearium: { port: 4800,  label: 'Idearium',  color: C.blue   },
  emerge:   { port: 4242,  label: 'Emerge',    color: C.green  },
  ollama:   { port: 11434, label: 'Ollama',    color: C.green  },
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function req(sys, method, p, body, timeout = 5000) {
  return new Promise(resolve => {
    const s = SYSTEMS[sys];
    if (!s) return resolve({ ok: false, error: `unknown: ${sys}` });
    const pl = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: s.port, path: p, method,
      headers: { 'Content-Type': 'application/json', ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}) },
    };
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: res.statusCode < 400, raw: d }); } });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok: false, error: `${s.label} timeout` }); });
    r.on('error', e => resolve({ ok: false, error: `${s.label} offline: ${e.message}` }));
    if (pl) r.write(pl);
    r.end();
  });
}
const GET  = (s, p)    => req(s, 'GET',  p);
const POST = (s, p, b) => req(s, 'POST', p, b);

// ── Output ────────────────────────────────────────────────────────────────────
const out   = d  => JSON_ ? console.log(JSON.stringify(d, null, 2)) : (typeof d === 'string' ? console.log(d) : console.log(JSON.stringify(d, null, 2)));
const ok    = m  => console.log(`${C.green}✓${C.reset} ${m}`);
const fail  = m  => console.log(`${C.red}✗${C.reset} ${m}`);
const info  = m  => console.log(`${C.muted}·${C.reset} ${m}`);
const hdr   = m  => console.log(`\n${C.bold}${C.cyan}${m}${C.reset}`);
const row   = (k, v, col = C.white) => console.log(`  ${C.muted}${k.padEnd(18)}${C.reset}${col}${v}${C.reset}`);
const arg   = i  => args[i];
const flag  = f  => args.find(a => a.startsWith(`--${f}=`))?.slice(f.length + 3);
const rest  = () => args.filter(a => !a.startsWith('--')).slice(1).join(' ');

// ── /module pass-through ──────────────────────────────────────────────────────
// nexus /guardian status  →  node guardian/cli.js status
// nexus /cockpit pipeline list  →  node cockpit/cli.js pipeline list
// nexus /cortex gaps  →  node cortex/cortex.js gaps
// nexus /idearium idea list  →  node idearium/cli/index.js idea list

const MODULE_CLI = {
  '/guardian': path.join(ROOT, 'guardian/cli.js'),
  '/cockpit':  path.join(ROOT, 'cockpit/cli.js'),
  '/forge':    path.join(ROOT, 'cockpit/cli.js'),   // alias
  '/cortex':   path.join(ROOT, 'cortex/cortex.js'),
  '/idearium': path.join(ROOT, 'idearium/cli/index.js'),
};

function passthrough(cliPath, restArgs) {
  if (!fs.existsSync(cliPath)) {
    fail(`CLI not found: ${cliPath}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [cliPath, ...restArgs], {
    stdio: 'inherit',
    env: { ...process.env },
  });
  process.exit(result.status ?? 0);
}

// ── Commands ──────────────────────────────────────────────────────────────────
const CMDS = {

  // ── STATUS — all systems at a glance ───────────────────────────────────────
  async status() {
    hdr('NEXUS');
    const checks = await Promise.all(
      Object.entries(SYSTEMS).map(async ([name, sys]) => {
        const start = Date.now();
        const health = name === 'bridge'  ? '/bridge/health'
                     : name === 'ollama'  ? '/api/tags'
                     : '/health';
        const d = await GET(name, health);
        return { name, sys, d, ms: Date.now() - start, live: !d.error };
      })
    );
    for (const { name, sys, d, ms, live } of checks) {
      const dot    = live ? `${C.green}●${C.reset}` : `${C.red}○${C.reset}`;
      const label  = `${C.bold}${sys.label.padEnd(10)}${C.reset}`;
      const port   = `${C.muted}:${sys.port}${C.reset}`;
      const ping   = `${C.muted}${ms}ms${C.reset}`;
      console.log(`  ${dot}  ${label}  ${port}  ${ping}`);
      if (live) {
        if (name === 'cortex' && d.jaa?.counts) {
          const n = Object.values(d.jaa.counts).reduce((a,b) => a+b, 0);
          if (n) info(`         ${n} records, ${Object.values(d.jaa.counts).filter(v=>v>0).length} active tables`);
        }
        if (name === 'guardian') {
          const conn = Object.entries(d.providers||{}).filter(([,v]) => v==='connected').map(([k])=>k);
          if (conn.length) info(`         providers: ${conn.join(', ')}`);
          const total_queued = Object.values(d.queued||{}).reduce((a,b)=>a+b,0);
          if (total_queued) info(`         ${C.yellow}${total_queued} jobs queued (waiting for provider)${C.reset}`);
        }
        if (name === 'ollama') {
          const models = (d.models||[]).map(m => m.name);
          if (models.length) info(`         ${models.join(', ')}`);
          else info(`         no models — run: nexus /ollama pull qwen2.5-coder:1.5b`);
        }
        if (name === 'bridge' && d.pendingRequests > 0) {
          info(`         ${C.yellow}${d.pendingRequests} pending requests${C.reset}`);
        }
      } else {
        info(`         ${C.red}${d.error}${C.reset}`);
      }
    }
    console.log('');
    info(`nexus help  ·  nexus /guardian  ·  nexus /cockpit  ·  nexus /cortex  ·  nexus /idearium`);
  },

  // ── HELP ───────────────────────────────────────────────────────────────────
  help() {
    console.log(`
${C.bold}${C.cyan}NEXUS  v2.0${C.reset}  unified CLI

${C.bold}One command, two ways in:${C.reset}

  ${C.bold}nexus <command>${C.reset}          unified commands
  ${C.bold}nexus /<module> <args>${C.reset}   pass directly to a module's own CLI

${C.bold}Module pass-through (slash prefix):${C.reset}

  nexus ${C.yellow}/guardian${C.reset} [args]       guardian/cli.js — /code /chat /spec jobs watch
  nexus ${C.purple}/cockpit${C.reset}  [args]       cockpit/cli.js  — pipeline seam idea gap jaa bus
  nexus ${C.purple}/forge${C.reset}    [args]       alias for /cockpit
  nexus ${C.cyan}/cortex${C.reset}   [args]       cortex/cortex.js — ask status gaps tail
  nexus ${C.blue}/idearium${C.reset} [args]       idearium/cli    — idea spec gap push snr
  nexus ${C.green}/ollama${C.reset}   [args]       ollama direct   — status models pull run
  nexus ${C.yellow}/bridge${C.reset}   [args]       bridge direct   — health requests tags find

${C.bold}Unified commands:${C.reset}

  nexus status                  all systems health + connection info
  nexus jobs                    guardian job list
  nexus dispatch "prompt"       dispatch to chatgpt (default)
  nexus events [--n=20]         cortex event log tail
  nexus gaps                    all open gaps
  nexus stream                  cortex live SSE
  nexus watch <jobId>           stream guardian job tokens
  nexus watchdog                live dashboard (all systems, 5s refresh)

  nexus idea "text"             create idea
  nexus ideas                   list ideas
  nexus push "message"          snapshot + versionium commit
  nexus snr                     system SNR

  nexus tag <entityId> --tags=t1,t2
  nexus tags <entityId>
  nexus request <type> --from=x --to=x --payload=json
  nexus requests [--status=pending]
  nexus accept <uuid>
  nexus reject <uuid>

${C.bold}Examples:${C.reset}

  nexus /guardian /code chatgpt "refactor this function"
  nexus /guardian jobs
  nexus /cockpit pipeline list
  nexus /cockpit seam compile spec.md
  nexus /cortex ask "what gaps are open?"
  nexus /idearium idea add "build something new"
  nexus /ollama pull qwen2.5-coder:7b
  nexus /ollama run "explain this code"
  nexus /bridge requests --status=pending

Flags: ${C.muted}--json${C.reset} (raw JSON output on any command)
`);
  },

  // ── JOBS ───────────────────────────────────────────────────────────────────
  async jobs() {
    const status = flag('status') || '';
    const d = await GET('guardian', `/jobs${status ? '?status='+status : ''}`);
    if (d.error) return fail(d.error);
    const jobs = d.jobs || [];
    hdr(`JOBS (${jobs.length})`);
    for (const j of jobs.slice(0, 30)) {
      const sc = j.status==='complete'?C.green : j.status==='failed'?C.red : j.status==='queued'?C.yellow : C.muted;
      console.log(`  ${C.muted}${(j.id||'').slice(0,8)}${C.reset}  ${sc}${(j.status||'—').padEnd(12)}${C.reset}  ${C.purple}${(j.provider||'—').padEnd(10)}${C.reset}  ${C.muted}${(j.command||'—').padEnd(6)}${C.reset}  ${(j.prompt||'').slice(0,50)}`);
    }
    if (!jobs.length) info('no jobs — dispatch one: nexus dispatch "your prompt"');
  },

  // ── DISPATCH ───────────────────────────────────────────────────────────────
  async dispatch() {
    const provider = flag('provider') || flag('p') || 'chatgpt';
    const command  = flag('command')  || flag('c') || 'code';
    const prompt   = flag('prompt') || args.filter(a => !a.startsWith('--') && a !== 'dispatch').join(' ');
    if (!prompt.trim()) return fail('Usage: nexus dispatch "prompt" [--provider=chatgpt] [--command=code]');
    const d = await POST('guardian', '/command', { provider, command, prompt });
    if (d.error) return fail(d.error);
    ok(`Job created  #${(d.jobId||'').slice(0,8)}  status: ${d.status}`);
    if (d.status === 'queued') info(`Waiting for ${provider} userscript — install & open chatgpt.com`);
    else info(`Watch: nexus watch ${d.jobId}`);
  },

  // ── EVENTS ─────────────────────────────────────────────────────────────────
  async events() {
    const n = flag('n') || '20';
    const d = await GET('cortex', `/api/events?n=${n}`);
    if (d.error) return fail(d.error);
    const rows = Array.isArray(d) ? d : (d.rows || []);
    hdr(`CORTEX EVENTS (${rows.length})`);
    for (const e of rows) {
      const ts = new Date(e.ts||0).toTimeString().slice(0,8);
      console.log(`  ${C.muted}${ts}${C.reset}  ${C.cyan}${(e.type||'—').padEnd(36)}${C.reset}  ${C.muted}${JSON.stringify(e.payload||{}).slice(0,60)}${C.reset}`);
    }
  },

  // ── STREAM ─────────────────────────────────────────────────────────────────
  stream() {
    hdr('CORTEX LIVE STREAM  (ctrl+c to stop)');
    const r = http.request({ hostname:'127.0.0.1', port:3748, path:'/sse', method:'GET', headers:{Accept:'text/event-stream'} }, res => {
      let buf = '';
      res.on('data', c => {
        buf += c.toString();
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const d = JSON.parse(line.slice(5).trim());
            const ts = new Date(d.ts||Date.now()).toTimeString().slice(0,8);
            console.log(`  ${C.muted}${ts}${C.reset}  ${C.cyan}${(d.type||'event').padEnd(36)}${C.reset}  ${C.muted}${JSON.stringify(d.payload||{}).slice(0,60)}${C.reset}`);
          } catch(_) {}
        }
      });
    });
    r.on('error', e => { fail(`Cortex: ${e.message}`); process.exit(1); });
    r.end();
  },

  // ── WATCH ──────────────────────────────────────────────────────────────────
  watch() {
    const jobId = args.find(a => !a.startsWith('--') && a !== 'watch');
    if (!jobId) return fail('Usage: nexus watch <jobId>');
    hdr(`WATCHING JOB ${jobId.slice(0,8)}  (ctrl+c to stop)`);
    const r = http.request({ hostname:'127.0.0.1', port:7820, path:`/stream/${jobId}`, method:'GET', headers:{Accept:'text/event-stream'} }, res => {
      let buf = '';
      res.on('data', c => {
        buf += c.toString();
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const d = JSON.parse(line.slice(5).trim());
            if (d.text) process.stdout.write(d.text);
            if (d.complete || d.status === 'complete') { console.log('\n'); ok('complete'); process.exit(0); }
          } catch(_) {}
        }
      });
      res.on('end', () => { console.log(''); ok('stream ended'); process.exit(0); });
    });
    r.on('error', e => { fail(`Guardian: ${e.message}`); process.exit(1); });
    r.end();
  },

  // ── WATCHDOG ───────────────────────────────────────────────────────────────
  async watchdog() {
    process.stdout.write('\x1b[?25l'); // hide cursor
    process.on('exit', () => process.stdout.write('\x1b[?25h'));
    hdr('NEXUS WATCHDOG  (ctrl+c to stop)');
    async function tick() {
      const results = await Promise.all(
        Object.entries(SYSTEMS).map(async ([name, sys]) => {
          const start = Date.now();
          const p = name==='bridge' ? '/bridge/health' : name==='ollama' ? '/api/tags' : '/health';
          const d = await GET(name, p);
          return { name, sys, live: !d.error, ms: Date.now() - start };
        })
      );
      const line = results.map(({name, sys, live, ms}) =>
        `${live ? C.green+'●'+C.reset : C.red+'○'+C.reset} ${sys.color}${name}${C.reset}${C.muted}(${ms}ms)${C.reset}`
      ).join('  ');
      process.stdout.write(`\r  ${C.muted}${new Date().toTimeString().slice(0,8)}${C.reset}  ${line}          `);
    }
    await tick();
    setInterval(tick, 5000);
  },

  // ── GAPS ───────────────────────────────────────────────────────────────────
  async gaps() {
    const d = await GET('idearium', '/api/gaps');
    if (d.error) {
      // fallback to cortex
      const cd = await GET('cortex', '/api/gaps');
      if (cd.error) return fail('Both idearium and cortex offline');
      const rows = cd.rows || [];
      hdr(`GAPS (${rows.length})  [cortex]`);
      for (const g of rows) {
        const pc = (g.pressure||0) > 0.7 ? C.red : C.yellow;
        console.log(`  ${pc}${((g.pressure||0)*100).toFixed(0)}%${C.reset}  ${C.cyan}${(g.type||'—').padEnd(20)}${C.reset}  ${(g.body||g.message||'—').slice(0,60)}`);
      }
      return;
    }
    const gaps = d.gaps || d || [];
    hdr(`GAPS (${gaps.length})  [idearium]`);
    for (const g of gaps) {
      const sc = g.status==='resolved' ? C.green : C.yellow;
      console.log(`  ${C.muted}${(g.uuid||'').slice(0,8)}${C.reset}  ${sc}${(g.status||'open').padEnd(10)}${C.reset}  ${(g.description||g.text||'—').slice(0,60)}`);
    }
    if (!gaps.length) info('no gaps');
  },

  // ── IDEA / IDEAS ───────────────────────────────────────────────────────────
  async idea() {
    const text = args.filter(a => !a.startsWith('--') && a !== 'idea').join(' ');
    if (!text) return fail('Usage: nexus idea "text"');
    const d = await POST('idearium', '/api/ideas', { text });
    if (d.error) return fail(d.error);
    ok(`Idea: ${(d.idea?.uuid || d.uuid || '').slice(0,8)}  "${text.slice(0,40)}"`);
  },

  async ideas() {
    const d = await GET('idearium', '/api/ideas');
    if (d.error) return fail(d.error);
    const list = d.ideas || d || [];
    hdr(`IDEAS (${list.length})`);
    for (const i of [...list].reverse().slice(0, 30)) {
      const pc = i.phase==='complete'?C.green : i.phase==='building'?C.cyan : C.muted;
      console.log(`  ${C.muted}${(i.uuid||'').slice(0,8)}${C.reset}  ${pc}${(i.phase||'seed').padEnd(12)}${C.reset}  ${(i.text||i.title||'—').slice(0,60)}`);
    }
    if (!list.length) info('no ideas — nexus idea "start here"');
  },

  // ── PUSH ───────────────────────────────────────────────────────────────────
  async push() {
    const msg = args.filter(a => !a.startsWith('--') && a !== 'push').join(' ') || 'snapshot';
    const d = await POST('idearium', '/api/snapshots', { message: msg });
    if (d.error) return fail(d.error);
    ok(`Pushed: ${(d.snapshot?.uuid || d.uuid || '').slice(0,8)}  "${msg}"`);
  },

  // ── SNR ────────────────────────────────────────────────────────────────────
  async snr() {
    const d = await GET('idearium', '/api/snr');
    if (d.error) return fail(d.error);
    const v = d.snr || 0;
    const col = v > 0.8 ? C.green : v > 0.5 ? C.yellow : C.red;
    const bar = '█'.repeat(Math.round(v*20)) + '░'.repeat(20-Math.round(v*20));
    console.log(`\n  ${col}${bar}${C.reset}  ${col}${(v*100).toFixed(1)}% SNR${C.reset}\n`);
  },

  // ── BRIDGE ops ─────────────────────────────────────────────────────────────
  async tag() {
    const id   = args.find(a => !a.startsWith('--') && a !== 'tag');
    const tags = flag('tags')?.split(',').map(t=>t.trim()).filter(Boolean);
    if (!id || !tags?.length) return fail('Usage: nexus tag <entityId> --tags=tag1,tag2');
    await POST('bridge', '/bridge/tags', { entityId:id, entityType:'entity', system:'cli', tags, addedBy:'cli' });
    ok(`Tagged ${id}: ${tags.join(', ')}`);
  },

  async tags() {
    const id = args.find(a => !a.startsWith('--') && a !== 'tags');
    if (!id) return fail('Usage: nexus tags <entityId>');
    const d = await GET('bridge', `/bridge/tags/${encodeURIComponent(id)}`);
    if (d.error) return fail(d.error);
    hdr(`TAGS: ${id}`);
    (d.tags||[]).forEach(t => console.log(`  ${C.cyan}${t}${C.reset}`));
    if (!d.tags?.length) info('no tags');
  },

  async request() {
    const type = args.find(a => !a.startsWith('--') && a !== 'request');
    const from = flag('from') || 'cli';
    const to   = flag('to')   || 'guardian';
    let   pl   = {};
    try { pl = JSON.parse(flag('payload') || '{}'); } catch(_) {}
    if (!type) return fail('Usage: nexus request <type> --from=x --to=x [--payload=json]');
    const d = await POST('bridge', '/bridge/requests', { type, from, to, payload: pl });
    if (!d?.ok) return fail(d?.error || 'failed');
    ok(`Request ${d.request?.uuid?.slice(0,8)}  ${d.request?.status}`);
  },

  async requests() {
    const status = flag('status') || '';
    const d = await GET('bridge', `/bridge/requests${status?'?status='+status:''}`);
    if (d.error) return fail(d.error);
    const list = d.requests || [];
    hdr(`REQUESTS (${list.length})`);
    for (const r of [...list].reverse().slice(0,20)) {
      const sc = r.status==='pending'?C.yellow : r.status==='complete'?C.green : r.status==='failed'?C.red : C.muted;
      console.log(`  ${C.muted}${(r.uuid||'').slice(0,8)}${C.reset}  ${sc}${(r.status||'—').padEnd(10)}${C.reset}  ${C.cyan}${(r.type||'—').padEnd(22)}${C.reset}  ${C.muted}${r.from} → ${r.to}${C.reset}`);
    }
    if (!list.length) info('no requests');
  },

  async accept() {
    const id = args.find(a => !a.startsWith('--') && a !== 'accept');
    if (!id) return fail('Usage: nexus accept <uuid>');
    const d = await POST('bridge', `/bridge/requests/${id}/accept`, { by:'cli' });
    if (!d?.ok) return fail(d?.error || 'failed');
    ok(`Accepted ${id.slice(0,8)}  →  ${d.request?.status}`);
  },

  async reject() {
    const id     = args.find(a => !a.startsWith('--') && a !== 'reject');
    const reason = flag('reason') || '';
    if (!id) return fail('Usage: nexus reject <uuid> [--reason=text]');
    const d = await POST('bridge', `/bridge/requests/${id}/reject`, { by:'cli', reason });
    if (!d?.ok) return fail(d?.error || 'failed');
    ok(`Rejected ${id.slice(0,8)}`);
  },

  // ── /ollama direct commands ────────────────────────────────────────────────
  async ollama() {
    const sub = args[1]?.replace(/^\//, '') || 'status';

    if (sub === 'status' || sub === 'models') {
      const d = await GET('ollama', '/api/tags');
      if (d.error) { fail(`Ollama offline: ${d.error}`); info('Start it: ollama serve'); return; }
      hdr('OLLAMA');
      const models = d.models || [];
      if (!models.length) { info('no models  —  nexus /ollama pull qwen2.5-coder:1.5b'); return; }
      for (const m of models) {
        const gb = m.size ? `${(m.size/1e9).toFixed(1)}GB` : '—';
        console.log(`  ${C.green}●${C.reset}  ${C.bold}${(m.name||'').padEnd(36)}${C.reset}  ${C.muted}${gb}${C.reset}`);
      }
      return;
    }

    if (sub === 'pull') {
      const model = args.slice(2).find(a => !a.startsWith('--'));
      if (!model) return fail('Usage: nexus /ollama pull <model>');
      hdr(`PULLING: ${model}`);
      const r = http.request({ hostname:'127.0.0.1', port:11434, path:'/api/pull', method:'POST', headers:{'Content-Type':'application/json'} }, res => {
        let buf = '';
        res.on('data', c => {
          buf += c.toString();
          const lines = buf.split('\n'); buf = lines.pop();
          for (const line of lines) {
            try {
              const d = JSON.parse(line);
              const pct = d.completed && d.total ? ` ${Math.round(d.completed/d.total*100)}%` : '';
              if (d.status) process.stdout.write(`\r  ${C.cyan}${d.status}${C.reset}${pct}                    `);
              if (d.status === 'success') { console.log(''); ok(`${model} pulled`); process.exit(0); }
            } catch(_) {}
          }
        });
        res.on('end', () => { console.log(''); process.exit(0); });
      });
      r.on('error', e => { fail(`Ollama: ${e.message}`); process.exit(1); });
      r.write(JSON.stringify({ name: model, stream: true }));
      r.end();
      return;
    }

    if (sub === 'run') {
      const model  = flag('model') || 'qwen2.5-coder:1.5b';
      const prompt = args.slice(2).filter(a => !a.startsWith('--')).join(' ');
      if (!prompt) return fail('Usage: nexus /ollama run "prompt" [--model=qwen2.5-coder:1.5b]');
      hdr(`OLLAMA: ${model}`);
      process.stdout.write('  ');
      const r = http.request({ hostname:'127.0.0.1', port:11434, path:'/api/generate', method:'POST', headers:{'Content-Type':'application/json'} }, res => {
        let buf = '';
        res.on('data', c => {
          buf += c.toString();
          const lines = buf.split('\n'); buf = lines.pop();
          for (const line of lines) {
            try {
              const d = JSON.parse(line);
              if (d.response) process.stdout.write(d.response);
              if (d.done) { console.log('\n'); process.exit(0); }
            } catch(_) {}
          }
        });
      });
      r.on('error', e => { fail(`Ollama: ${e.message}`); process.exit(1); });
      r.write(JSON.stringify({ model, prompt, stream: true }));
      r.end();
      return;
    }

    fail(`Unknown ollama command: ${sub}`);
    info('Commands: status  pull <model>  run "prompt"');
  },

  // ── /bridge direct commands ────────────────────────────────────────────────
  async bridge() {
    const sub = args[1]?.replace(/^\//, '') || 'health';

    if (sub === 'health') {
      const d = await GET('bridge', '/bridge/health');
      if (d.error) return fail(d.error);
      if (JSON_) return console.log(JSON.stringify(d, null, 2));
      hdr('BRIDGE');
      row('status',   '● online', C.green);
      row('sessions', String(d.sessions));
      row('pending',  String(d.pendingRequests));
      row('ring',     String(d.recentEvents));
      return;
    }

    if (sub === 'requests') {
      const status = flag('status') || args[2] || '';
      const d = await GET('bridge', `/bridge/requests${status?'?status='+status:''}`);
      if (d.error) return fail(d.error);
      return CMDS.requests.call(this);
    }

    if (sub === 'find') {
      const tag = flag('tag') || args[2];
      if (!tag) return fail('Usage: nexus /bridge find --tag=x');
      const d = await GET('bridge', `/bridge/tags?tag=${encodeURIComponent(tag)}`);
      if (d.error) return fail(d.error);
      hdr(`WITH TAG: ${tag}`);
      (d.entities||[]).forEach(e => console.log(`  ${C.muted}${(e.entityId||'').slice(0,20)}${C.reset}  ${e.entityType}  ${e.system}`));
      if (!d.entities?.length) info('none');
      return;
    }

    if (sub === 'subscribe') {
      const channel = flag('channel') || args[2] || '*';
      hdr(`BRIDGE STREAM: ${channel}  (ctrl+c to stop)`);
      const r = http.request({ hostname:'127.0.0.1', port:9999, path:`/bridge/subscribe?channel=${encodeURIComponent(channel)}`, method:'GET', headers:{Accept:'text/event-stream'} }, res => {
        let buf = '';
        res.on('data', c => {
          buf += c.toString();
          const lines = buf.split('\n'); buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const d = JSON.parse(line.slice(5).trim());
              const ts = new Date(d.bridgeTs||Date.now()).toTimeString().slice(0,8);
              console.log(`  ${C.muted}${ts}${C.reset}  ${C.yellow}${(d.type||'event').padEnd(36)}${C.reset}  ${C.muted}${JSON.stringify(d).slice(0,60)}${C.reset}`);
            } catch(_) {}
          }
        });
      });
      r.on('error', e => { fail(e.message); process.exit(1); });
      r.end();
      return;
    }

    fail(`Unknown bridge command: ${sub}`);
    info('Commands: health  requests  find --tag=x  subscribe [--channel=x]');
  },
};

// ── Snapshot commands ─────────────────────────────────────────────────────────
CMDS['snap'] = CMDS['snapshot'] = async function() {
  const sub = args[1] || 'list';

  if (sub === 'list' || sub === 'ls') {
    const n   = parseInt(flag('n') || args[2] || '10');
    const d   = await GET('cortex', `/api/snapshots?n=${n}`);
    if (!d.ok) return fail(d.error || 'snapshots unavailable');
    if (!d.snapshots?.length) return info('no snapshots yet');
    hdr('SNAPSHOTS');
    d.snapshots.forEach(s => {
      const age = Math.round((Date.now() - s.ts) / 1000);
      console.log(`  ${C.cyan}${s.snapId}${C.reset}  ${C.muted}${s.type.padEnd(12)}${C.reset}  ${C.white}${(s.message || '—').slice(0, 40).padEnd(42)}${C.reset}  ${C.muted}${s.totalRows} rows  ${age}s ago  rb=${s.rollback_count}${C.reset}`);
    });
    return;
  }

  if (sub === 'create' || sub === 'take') {
    const msg = rest() || flag('message') || 'manual snapshot';
    const d   = await POST('cortex', '/api/snapshots/create', { message: msg });
    if (!d.ok) return fail(d.error || 'snapshot failed');
    ok(`snapshot created: ${d.snapId} (${d.totalRows} rows)`);
    return;
  }

  if (sub === 'diff') {
    const a = args[2], b = args[3];
    if (!a || !b) return fail('Usage: nexus snap diff <snapId-a> <snapId-b>');
    const d = await GET('cortex', `/api/snapshots/diff?a=${a}&b=${b}`);
    if (!d.ok) return fail(d.error || 'diff failed');
    hdr(`DIFF  ${a}  →  ${b}`);
    const tables = Object.entries(d.tables || {});
    if (!tables.length) { ok('no differences'); return; }
    tables.forEach(([t, v]) => {
      const sign = v.delta > 0 ? `${C.green}+${v.delta}` : `${C.red}${v.delta}`;
      console.log(`  ${C.muted}${t.padEnd(28)}${C.reset}  ${v.a} → ${v.b}  ${sign}${C.reset}`);
    });
    return;
  }

  if (sub === 'rollback') {
    const snapId = args[2];
    const apply  = args.includes('--apply');
    if (!snapId) return fail('Usage: nexus snap rollback <snapId> [--apply]');
    if (apply) {
      console.log(`${C.yellow}⚠  Rolling back to ${snapId} — this will modify JAA state${C.reset}`);
    }
    const d = await POST('cortex', '/api/snapshots/rollback', { snapId, apply });
    if (!d.ok) return fail(d.error);
    if (d.dry_run) {
      hdr(`DRY RUN — would change ${d.tables?.length || 0} tables`);
      Object.entries(d.changes || {}).forEach(([t, v]) =>
        console.log(`  ${C.muted}${t.padEnd(28)}${C.reset}  current=${v.current}  snap=${v.snapshot}  delta=${v.delta}`)
      );
      info('Pass --apply to execute');
    } else {
      ok(`rolled back to ${snapId} — ${d.tablesRestored} tables restored`);
      info(`safety snapshot: ${d.safetySnapId}`);
    }
    return;
  }

  fail(`Unknown snapshot command: ${sub}`);
  info('Commands: list  create [message]  diff <a> <b>  rollback <id> [--apply]');
};

// ── Replay commands ─────────────────────────────────────────────────────────────
CMDS['replay'] = async function() {
  const sub = args[1] || 'verify';

  if (sub === 'verify') {
    info('Running replay verification...');
    const d = await POST('cortex', '/api/replay/verify', {});
    if (!d.ok && d.error) return fail(d.error);
    const divs = d.divergences || [];
    if (!divs.length) {
      ok(`replay verified — ${d.eventCount} events, no divergences`);
    } else {
      console.log(`${C.yellow}⚠  ${divs.length} divergence(s) found${C.reset}`);
      divs.forEach(dv => console.log(`  ${C.red}${dv.field}${C.reset}  live=${dv.live}  replay=${dv.replay}`));
    }
    return;
  }

  if (sub === 'inspect') {
    const fromTs = parseInt(flag('from') || '0');
    const d = await POST('cortex', '/api/replay/inspect', { fromTs });
    if (!d.ok && d.error) return fail(d.error);
    hdr('REPLAY INSPECT');
    const s = d.state || {};
    row('events',    d.eventCount);
    row('gaps found',  s.gaps?.length || 0);
    row('patches',   s.patches?.length || 0);
    row('dispatches', s.dispatches?.length || 0);
    row('snapshots', s.snapshots?.length || 0);
    row('boots',     s.boots?.length || 0);
    if (s.lastHeartbeat) row('last heartbeat', Math.round((Date.now() - s.lastHeartbeat) / 1000) + 's ago');
    return;
  }

  if (sub === 'simulate') {
    const eventType = args[2];
    if (!eventType) return fail('Usage: nexus replay simulate <event-type> [--inject=before|after]');
    const inject = flag('inject') || 'after';
    const faults = [{ uuid: require('crypto').randomUUID(), type: eventType, payload: {}, source: 'cli/simulate', ts: Date.now(), _inject: inject }];
    const d = await POST('cortex', '/api/replay/simulate', { events: faults });
    hdr('REPLAY SIMULATE');
    info(`injected: ${eventType} (${inject})`);
    row('total events', d.eventCount);
    const s = d.state || {};
    row('gaps', s.gaps?.length || 0);
    return;
  }

  fail(`Unknown replay command: ${sub}`);
  info('Commands: verify  inspect [--from=ts]  simulate <event-type>');
};

// ── Agent-tools commands ────────────────────────────────────────────────────────
CMDS['tools'] = CMDS['tool'] = async function() {
  const sub = args[1] || 'list';

  if (sub === 'list' || sub === 'ls') {
    const d = await GET('cortex', '/api/tools');
    if (!d.ok) return fail(d.error || 'tools unavailable');
    hdr('AGENT TOOLS');
    d.tools.forEach(t => console.log(`  ${C.cyan}${t.name.padEnd(32)}${C.reset}  ${C.muted}${t.description}${C.reset}`));
    return;
  }

  if (sub === 'exec' || sub === 'run') {
    const toolName = args[2];
    if (!toolName) return fail('Usage: nexus tools exec <tool-name> [--input=<json>]');
    const inputStr = flag('input') || '{}';
    let input;
    try { input = JSON.parse(inputStr); } catch { return fail(`invalid JSON: ${inputStr}`); }
    info(`running ${toolName}...`);
    const d = await POST('cortex', '/api/tools/exec', { tool: toolName, input });
    if (JSON_) return out(d);
    if (!d.ok) return fail(d.error || 'tool failed');
    out(d);
    return;
  }

  fail(`Unknown tools command: ${sub}`);
  info('Commands: list  exec <tool> [--input=json]');
};

// ── Self-heal commands ─────────────────────────────────────────────────────────
CMDS['heal'] = CMDS['self-heal'] = async function() {
  const sub = args[1] || 'status';

  if (sub === 'status') {
    const d = await GET('cortex', '/api/self-heal/status');
    if (!d.ok) return fail(d.error || 'self-heal unavailable');
    hdr('SELF-HEAL STATUS');
    row('pending (needs_manual)',  d.pending);
    row('forge_patch_ready',       d.ready);
    row('forge_applied',           d.patched);
    row('human_required',          d.human_required);
    if (d.recentPatches?.length) {
      console.log(`
  ${C.muted}Recent patches:${C.reset}`);
      d.recentPatches.forEach(p => {
        const applied = p.applied ? `${C.green}applied${C.reset}` : `${C.yellow}audit${C.reset}`;
        console.log(`  ${C.muted}${(p.module||'?').slice(-40).padEnd(42)}${C.reset}  ${applied}  ${C.muted}${p.provider || '—'}${C.reset}`);
      });
    }
    return;
  }

  if (sub === 'enable') {
    ok('Set NEXUS_FORGE_APPLY=true before starting cortex to enable live patching');
    info('Example: NEXUS_FORGE_APPLY=true node cortex/boot.js');
    return;
  }

  if (sub === 'gaps') {
    const d = await GET('cortex', '/api/gaps');
    if (!d.ok && !Array.isArray(d.gaps)) return fail('gaps unavailable');
    const gaps = (d.gaps || d || []).filter(g => ['needs_manual','forge_failed','human_required','forge_applied','forge_patch_ready'].includes(g.status));
    if (!gaps.length) return ok('no active self-heal gaps');
    hdr('SELF-HEAL GAPS');
    gaps.forEach(g => {
      const sc = g.status === 'forge_applied' ? C.green : g.status === 'human_required' ? C.red : C.yellow;
      console.log(`  ${sc}${(g.status||'?').padEnd(22)}${C.reset}  ${C.cyan}${(g.type||'?').padEnd(20)}${C.reset}  ${(g.body||'').slice(0, 50)}`);
    });
    return;
  }

  fail(`Unknown self-heal command: ${sub}`);
  info('Commands: status  enable  gaps');
};

// ── Context command (agent self-awareness) ─────────────────────────────────────
CMDS['context'] = CMDS['ctx'] = async function() {
  const d = await POST('cortex', '/api/tools/exec', { tool: 'nexus.context', input: {} });
  if (!d.ok) return fail(d.error || 'context unavailable');
  hdr('NEXUS CONTEXT');
  row('open gaps',      d.openGaps);
  row('recent failures', d.recentFailures);
  row('forge patches',  d.forgePatchCount);
  row('snapshots',      d.snapshotCount);
  row('latest snapshot', d.latestSnapshot || 'none');
  if (d.recentEvents?.length) {
    console.log(`
  ${C.muted}Recent events:${C.reset}`);
    d.recentEvents.slice(-8).forEach(e =>
      console.log(`  ${C.muted}${new Date(e.ts).toTimeString().slice(0,8)}${C.reset}  ${C.cyan}${(e.type||'?').padEnd(36)}${C.reset}  ${C.muted}${e.source}${C.reset}`)
    );
  }
};

// ── Contract commands ─────────────────────────────────────────────────────────
CMDS['contract'] = async function() {
  const sub = args[1] || 'agents';

  if (sub === 'agents' || sub === 'list') {
    const d = await GET('cortex', '/api/contract/agents');
    if (!d.ok) return fail(d.error || 'contract unavailable');
    hdr('ORCHESTRATION CONTRACTS');
    d.agents.forEach(a => {
      const trust = a.trust_level === 'internal' ? C.green : a.trust_level === 'local' ? C.cyan : C.yellow;
      const denied = a.denied?.length ? ` ${C.red}deny:${a.denied.join(',')}${C.reset}` : '';
      const proof  = a.proof_required ? ` ${C.yellow}proof-required${C.reset}` : '';
      console.log(`  ${trust}${(a.agent).padEnd(20)}${C.reset}  ${C.muted}${(a.trust_level).padEnd(10)}${C.reset}  ${(a.allowed || []).join(',')}${denied}${proof}`);
    });
    return;
  }

  if (sub === 'violations') {
    const n = parseInt(flag('n') || args[2] || '20');
    const d = await GET('cortex', `/api/contract/violations?n=${n}`);
    if (!d.ok) return fail(d.error);
    if (!d.violations?.length) return ok('no contract violations recorded');
    hdr('CONTRACT VIOLATIONS');
    d.violations.forEach(v => {
      const ts = new Date(v.ts).toTimeString().slice(0,8);
      console.log(`  ${C.red}${ts}${C.reset}  ${C.yellow}${(v.agent||'?').padEnd(20)}${C.reset}  ${(v.violation||'').slice(0,60)}`);
    });
    return;
  }

  if (sub === 'audit') {
    const n = parseInt(flag('n') || args[2] || '20');
    const d = await GET('cortex', `/api/contract/audit?n=${n}`);
    if (!d.ok) return fail(d.error);
    hdr('CONTRACT AUDIT');
    d.audit.forEach(a => {
      const ts   = new Date(a.ts).toTimeString().slice(0,8);
      const sc   = a.result === 'pass' ? C.green : C.red;
      console.log(`  ${C.muted}${ts}${C.reset}  ${sc}${(a.result).padEnd(12)}${C.reset}  ${C.cyan}${(a.agent||'?').padEnd(20)}${C.reset}  ${a.action||'?'}`);
    });
    return;
  }

  if (sub === 'check') {
    // nexus contract check --agent=ollama --action=forge
    const agent  = flag('agent')  || args[2];
    const action = flag('action') || args[3];
    if (!agent || !action) return fail('Usage: nexus contract check --agent=<agent> --action=<action>');
    const d = await POST('cortex', '/api/contract/check', { uuid: require('crypto').randomUUID(), routedTo: agent, command: action, prompt: 'test' });
    if (!d.ok && d.error) return fail(d.error);
    const r = d.result || d;
    if (r.violations?.length) {
      console.log(`${C.red}✗ BLOCKED${C.reset}  ${agent}/${action}`);
      r.violations.forEach(v => console.log(`  ${C.red}→${C.reset} ${v}`));
    } else {
      ok(`${agent}/${action} — permitted (trust=${r.trust_level || r.contract?.trust_level})`);
    }
    return;
  }

  fail(`Unknown contract command: ${sub}`);
  info('Commands: agents  violations [n]  audit [n]  check --agent=<x> --action=<y>');
};

// ── Update help to include new commands ───────────────────────────────────────
const _origHelp = CMDS.help;
CMDS.help = function() {
  _origHelp();
  console.log(`
  ${C.bold}Self-healing & observability:${C.reset}
    ${C.cyan}nexus snap list${C.reset}                  list snapshots
    ${C.cyan}nexus snap create [message]${C.reset}      take a snapshot
    ${C.cyan}nexus snap diff <a> <b>${C.reset}          diff two snapshots
    ${C.cyan}nexus snap rollback <id>${C.reset}         preview rollback
    ${C.cyan}nexus snap rollback <id> --apply${C.reset} execute rollback

    ${C.cyan}nexus replay verify${C.reset}              verify state consistency
    ${C.cyan}nexus replay inspect${C.reset}             inspect rebuilt state
    ${C.cyan}nexus replay simulate <event>${C.reset}    fault injection test

    ${C.cyan}nexus heal status${C.reset}                self-heal pipeline status
    ${C.cyan}nexus heal gaps${C.reset}                  show self-heal gaps
    ${C.cyan}nexus heal enable${C.reset}                how to enable live patching

    ${C.cyan}nexus tools list${C.reset}                 list agent tools
    ${C.cyan}nexus tools exec <tool>${C.reset}          run an agent tool
    ${C.cyan}nexus context${C.reset}                    full system self-awareness

  ${C.bold}Orchestration contract:${C.reset}
    ${C.cyan}nexus contract agents${C.reset}            list agent contracts + permissions
    ${C.cyan}nexus contract violations${C.reset}        recent contract violations
    ${C.cyan}nexus contract audit${C.reset}             full dispatch audit trail
    ${C.cyan}nexus contract check --agent=x --action=y${C.reset}  check if action is permitted
  `);
};

// ── Router ────────────────────────────────────────────────────────────────────
async function main() {
  if (!args.length) { CMDS.help(); return; }

  const first = args[0];

  // Slash prefix — pass directly to module CLI
  if (first.startsWith('/')) {
    const modKey  = first.toLowerCase();
    const cliPath = MODULE_CLI[modKey];

    // /ollama and /bridge handled inline
    if (modKey === '/ollama')  return CMDS.ollama();
    if (modKey === '/bridge')  return CMDS.bridge();

    if (cliPath) {
      passthrough(cliPath, args.slice(1));
      return;
    }
    fail(`Unknown module: ${first}`);
    info('Available: /guardian  /cockpit  /forge  /cortex  /idearium  /ollama  /bridge');
    process.exit(1);
    return;
  }

  // Unified commands — try progressively shorter keys
  for (let len = Math.min(args.length, 3); len >= 1; len--) {
    const key = args.slice(0, len).join(':');
    if (CMDS[key]) { await CMDS[key](); return; }
  }
  // Single-word commands
  if (CMDS[first]) { await CMDS[first](); return; }

  fail(`Unknown command: ${args.join(' ')}`);
  info('Run nexus help');
  process.exit(1);
}

main().catch(e => { console.error(`${C.red}Fatal:${C.reset}`, e.message); process.exit(1); });
