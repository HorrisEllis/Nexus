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
//   nexus /copilot <args>    — pass-through to copilot/cli.js (or /cp alias)
//   nexus /ollama <args>     — ollama direct commands
// //
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
  cortex:   { port: 3748,  label: 'Cortex',    color: C.cyan   },
  guardian: { port: 7820,  label: 'Guardian',  color: C.purple },
  idearium: { port: 4800,  label: 'Idearium',  color: C.blue   },
  emerge:   { port: 4242,  label: 'Emerge',    color: C.green  },
  ollama:   { port: 11434, label: 'Ollama',    color: C.green  },
  // §OLLAMA-CLI 2026-08-23 — the real bridge (ollama/server.js), distinct
  // from raw Ollama above. Commands that should benefit from the bridge's
  // real queueing/config/PUT-override go here; commands that need
  // Ollama's own native model-management API (pull, raw tags) go through
  // 'ollama' above instead.
  ollamaBridge: { port: 3749, label: 'Ollama Bridge', color: C.green },
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
// nexus /copilot "what gaps are open?"  →  node copilot/cli.js "what gaps are open?"

const MODULE_CLI = {
  '/guardian': path.join(ROOT, 'guardian/cli.js'),
  '/cockpit':  path.join(ROOT, 'cockpit/cli.js'),
  '/forge':    path.join(ROOT, 'cockpit/cli.js'),   // alias
  '/cortex':   path.join(ROOT, 'cortex/cortex.js'),
  '/idearium': path.join(ROOT, 'idearium/cli/index.js'),
  '/copilot':  path.join(ROOT, 'copilot/cli.js'),   // moved from cli/co-pilot.js — consolidation pass
  '/cp':       path.join(ROOT, 'copilot/cli.js'),   // alias
  // §CONSOLIDATION 2026-08-23 — James: "the cli folder, can we
  // consolidate? why is there so many?" Real finding, not assumed:
  // cos/cli/index.js (Compartment OS — create/list/map/start/stop/
  // destroy, 19 real command files) and nexus-healer/cli/index.js
  // (generated from loom/templates/system-scaffold.js) both real,
  // both substantial, neither reachable through this file — the one
  // place a person would look first. Wired in, not merged: each
  // subsystem still owns its own real command surface, matching the
  // established pattern already used for guardian/cockpit/copilot
  // above — this table is what makes that pattern actually
  // discoverable instead of requiring a person to already know the
  // file tree.
  '/cos':      path.join(ROOT, 'cos/cli/index.js'),
  '/healer':   path.join(ROOT, 'nexus-healer/cli/index.js'),
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
        const health = name === 'ollama'  ? '/api/tags'
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
        if (d.pendingRequests) {
          info(`         ${C.yellow}${d.pendingRequests} pending requests${C.reset}`);
        }
      } else {
        info(`         ${C.red}${d.error}${C.reset}`);
      }
    }
    console.log('');
    info(`nexus help  ·  nexus /guardian  ·  nexus /cockpit  ·  nexus /cortex  ·  nexus /idearium  ·  nexus /copilot`);
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
  nexus ${C.green}/macro${C.reset}    [args]       macro           — list get create delete run bookmark
  nexus ${C.purple}/cos${C.reset}     [args]       cos/cli/index.js — Compartment OS: create list map start stop destroy
  nexus ${C.yellow}/healer${C.reset}  [args]       nexus-healer/cli — self-heal operations
  nexus ${C.cyan}/copilot${C.reset} [args]       copilot/cli.js  — talk to NEXUS directly
  nexus ${C.cyan}/cp${C.reset}      [args]       alias for /copilot

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
  nexus contracts check [--system=<s>] [--all]   every emitted event declared (EV0)
  nexus mcp list | call <tool> [--args=<json>]    the tools Claude Code sees (.mcp.json)

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
  nexus /copilot "what gaps are open?"
  nexus /ollama pull qwen2.5-coder:1.5b
  nexus /ollama run "explain this code"

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
  // ── CONTRACTS — EV0 (3): every emitted event declared in its system's own taxonomy ──
  // `nexus contracts check [--system=<s>] [--all]` — the systems in contracts/event-contract-baseline.json, read from
  // their source. Fails (exit 1) on new drift, on a baseline entry declared since, or on a collision; --all lists
  // every undeclared event, not only the new ones.
  // ── MCP — §IN1: the tools Claude Code sees (orchestrator/lib/mcp-server.js, registered in .mcp.json) ──
  // `nexus mcp list` · `nexus mcp call <tool> [--args='{"query":"lib/x.js"}']` — the same handlers, in-process
  async mcp() {
    const sub = args[1] || 'list';
    const { TOOLS } = require('../orchestrator/lib/mcp-server.js');
    if (sub === 'list') {
      if (JSON_) return out(TOOLS.map(t => ({ name: t.name, description: t.description })));
      hdr(`Nexus MCP — ${TOOLS.length} tools (Claude Code loads them from .mcp.json)`);
      for (const t of TOOLS) console.log(`  ${C.bold}${t.name.padEnd(26)}${C.reset} ${C.muted}${String(t.description).slice(0, 96)}${C.reset}`);
      return;
    }
    if (sub !== 'call' || !args[2]) return fail('Usage: nexus mcp list | nexus mcp call <tool> [--args=<json>]');
    const tool = TOOLS.find(t => t.name === args[2]);
    if (!tool) return fail(`no tool ${args[2]} — nexus mcp list`);
    let a = {}; const raw = flag('args');
    if (raw) { try { a = JSON.parse(raw); } catch (e) { return fail(`--args is not JSON: ${e.message}`); } }
    try { console.log(String(await tool.handler(a))); }
    catch (e) { fail(`${args[2]}: ${e.message}`); process.exitCode = 1; }
  },

  async contracts() {
    const sub = args[1] || 'check';
    if (sub !== 'check') return fail('Usage: nexus contracts check [--system=<s>] [--all]');
    const EC = require('../lib/event-contract-check.js');
    const base = EC.loadBaseline(ROOT);
    const only = flag('system');
    const systems = only ? [only] : Object.keys(base.systems);
    if (only && !base.systems[only]) return fail(`${only} is not held to the contract — the systems are: ${Object.keys(base.systems).join(', ')}`);
    const rows = []; let bad = 0;
    for (const s of systems) {
      const r = EC.checkSystem(ROOT, s), b = EC.againstBaseline(r, base.systems[s]);
      rows.push({ system: s, taxonomy: r.taxonomyFile, emitted: r.emitted.length, undeclared: r.undeclared.length, unresolved: r.unresolved.length, missing: r.missing, unread: r.unread, unused: r.unused, added: b.added, cleared: b.cleared, collisions: r.collisions, ok: b.ok });
      if (!b.ok) bad++;
      if (JSON_) continue;
      const mark = b.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      const left = r.undeclared.length + r.unresolved.length + (r.missing || []).length;
      console.log(`  ${mark} ${C.bold}${s.padEnd(13)}${C.reset} ${String(r.emitted.length).padStart(3)} emitted · ${left ? `${C.yellow}${left} not yet declared${C.reset}` : `${C.green}all declared${C.reset}`}${r.taxonomyFile ? '' : ` · ${C.muted}no taxonomy yet${C.reset}`}${r.unused.length ? ` · ${C.muted}${r.unused.length} declared, not seen emitted${C.reset}` : ''}`);
      for (const e of b.added) console.log(`      ${C.red}new, undeclared:${C.reset} ${e}  ${C.muted}${((r.undeclared.find(x => x.event === e) || {}).sites || []).join(', ')}${C.reset}`);
      for (const e of b.cleared) console.log(`      ${C.yellow}declared now — drop from ${EC.BASELINE_FILE}:${C.reset} ${e}`);
      for (const c of r.collisions) console.log(`      ${C.red}collision:${C.reset} ${c.events.join(' and ')} are both ${c.key}`);
      for (const c of r.missing || []) console.log(`      ${C.red}emits undefined:${C.reset} ${c.constant} — that table has no such key  ${C.muted}${c.site}${C.reset}`);
      if (args.includes('--all')) { for (const u of r.undeclared) console.log(`      ${C.muted}${u.event}  ${u.sites.join(', ')}${C.reset}`); }
    }
    if (JSON_) out({ ok: !bad, systems: rows });
    else console.log(bad ? `\n  ${C.red}${bad} system(s) drifted${C.reset}\n` : `\n  ${C.green}no new drift${C.reset}\n`);
    if (bad) process.exitCode = 1;
  },

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

    const d = await POST('cortex', '/api/tags', { entityId: id, tags });
    if (d.error) return fail(d.error);
    info(`Tagged ${id}: ${tags.join(', ')}`);
  },
};

// ── /ollama — real, built-in commands (not a passthrough) ──────────────────
// §OLLAMA-CLI 2026-08-23 — status/models talk to the real bridge
// (ollamaBridge, :3749) so they reflect the real, in-memory active model
// and the bridge's own queue state. pull talks to raw Ollama (:11434)
// directly — the bridge doesn't wrap model management, and shouldn't;
// that's Ollama's own real job. catalog is fully local — no network call,
// just ollama/abliterated-catalog.js's real, curated data.
async function _handleOllamaCommand(subArgs) {
  const sub = subArgs[0];

  if (!sub || sub === 'help') {
    console.log(`
  ${C.bold}nexus /ollama <command>${C.reset}

  status                     bridge + raw Ollama health, real active model
  models                     real, installed models (via the bridge)
  catalog [category]         browse the real, hardware-fitted abliterated
                             catalog — categories: ${require('../ollama/abliterated-catalog.js').CATEGORIES.join(', ')}
  pull <model>               real ollama pull, streamed progress
  use <model>                switch the bridge's real active model —
                             validated against what's actually installed
                             first, in-memory for this process only
`);
    return;
  }

  if (sub === 'status') {
    const [bridge, raw] = await Promise.all([GET('ollamaBridge', '/health'), GET('ollama', '/api/tags')]);
    hdr('Ollama Bridge (:3749)');
    if (bridge.error) { fail(bridge.error); } else {
      row('active model', bridge.model);
      row('queue depth', bridge.queue_depth);
      row('running', bridge.running);
      row('completed today', bridge.completed_today);
    }
    hdr('Raw Ollama (:11434)');
    if (raw.error) { fail(raw.error); } else {
      row('installed models', (raw.models || []).length);
    }
    return;
  }

  if (sub === 'models') {
    const d = await GET('ollamaBridge', '/api/models');
    if (d.error) return fail(d.error);
    hdr(`Installed models (active: ${d.active})`);
    for (const m of d.models || []) {
      console.log(`  ${m === d.active ? C.green + '●' : C.muted + '○'}${C.reset} ${m}`);
    }
    if (!d.models?.length) info('none installed — try: nexus /ollama pull <model>');
    return;
  }

  if (sub === 'catalog') {
    const cat = require('../ollama/abliterated-catalog.js');
    const category = subArgs[1];
    const list = category ? cat.byCategory(category) : cat.CATALOG.slice().sort((a, b) => a.tier - b.tier);
    if (category && !list.length) { fail(`unknown category "${category}" — known: ${cat.CATEGORIES.join(', ')}`); return; }
    const TIER_LABEL = { 1: `${C.green}fast${C.reset}`, 2: `${C.yellow}workable${C.reset}`, 3: `${C.red}slow${C.reset}` };
    hdr(category ? `Abliterated catalog — ${category}` : 'Abliterated catalog — all categories');
    for (const m of list) {
      console.log(`  [${TIER_LABEL[m.tier]}] ${C.bold}${m.id}${C.reset}  ${C.muted}${m.sizeGB}GB, ${m.params}${C.reset}`);
      console.log(`         ${C.muted}${m.desc}${C.reset}`);
    }
    info(`fast = fits your real 4GB dedicated VRAM · workable = spills into shared/CPU, usable · slow = real CPU offload`);
    return;
  }

  if (sub === 'pull') {
    const model = subArgs[1];
    if (!model) return fail('Usage: nexus /ollama pull <model>');
    info(`pulling ${model} — this can take a while for anything past a few GB...`);
    const { spawnSync } = require('child_process');
    const r = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
    if (r.status !== 0) { fail(`ollama pull exited ${r.status}`); process.exit(1); }
    ok(`pulled ${model}`);
    return;
  }

  if (sub === 'use') {
    const model = subArgs[1];
    if (!model) return fail('Usage: nexus /ollama use <model>');
    const d = await req('ollamaBridge', 'PUT', '/api/model', { model });
    if (!d.ok) { fail(d.error || 'unknown error'); if (d.installed) info(`installed: ${d.installed.join(', ')}`); return; }
    ok(`active model → ${d.active} (was ${d.previous})`);
    info(d.note);
    return;
  }

  fail(`Unknown /ollama command: ${sub} — try: nexus /ollama help`);
}

// ── /macro — real, built-in commands, CLI-first per James's own explicit
// ordering ────────────────────────────────────────────────────────────────
// §MACRO-CLI 2026-08-23 — calls lib/agent-tools/tools/clear-glass/macro.js
// directly, in-process. No HTTP round trip: the tool module IS the real
// implementation, same pattern this file already uses for nothing else
// (every other /module goes through a passthrough or HTTP to a live
// server) because macro.js has no server of its own to reach — it's a
// pure library function that itself reaches browser_action/rewind_replay.
function _flagObj(prefix) {
  // Real, generic --prefix.key=value parser, for macro run's params
  // (--param.therapistName="Dr. Smith") — reuses this file's own flag()
  // convention rather than inventing a second parsing style.
  const out = {};
  for (const a of args) {
    if (!a.startsWith(`--${prefix}.`)) continue;
    const eq = a.indexOf('=');
    if (eq === -1) continue;
    out[a.slice(prefix.length + 3, eq)] = a.slice(eq + 1);
  }
  return out;
}

async function _handleMacroCommand(subArgs) {
  const sub = subArgs[0];
  const macro = require('../lib/agent-tools/tools/clear-glass/macro.js');

  if (!sub || sub === 'help') {
    console.log(`
  ${C.bold}nexus /macro <command>${C.reset}

  list                            real, stored macros — name, url pattern, step count
  get <name>                      full real macro definition, including every step
  create <name> --file=<path.json> [--url=<pattern>]
                                   define from a real JSON file: {"steps":[...], "params":[...], "description":...}
                                   ({{paramName}} placeholders in step data are substituted at run time)
  delete <name>
  run <name> --agent=<agentId> [--param.name=value ...] [--skip-snapshot]
                                   checks the real current URL against the macro's pattern (if any), takes a
                                   real rewind snapshot first (rollback point) unless --skip-snapshot, then runs
                                   every step through the real browser_action tool — stops at the first failure
  bookmark --agent=<agentId> --label=<label>
                                   a real, named rewind-engine snapshot — capture this page's state to return to
`);
    return;
  }

  if (sub === 'list') {
    const r = await macro.execute({ action: 'list' });
    if (r.error) return fail(r.error);
    hdr('Macros');
    if (!r.macros.length) { info('none yet — nexus /macro create <name> --file=<path.json>'); return; }
    for (const m of r.macros) {
      console.log(`  ${C.bold}${m.name}${C.reset}  ${C.muted}${m.steps} step(s)${m.urlPattern ? ` · ${m.urlPattern}` : ''}${m.runCount ? ` · run ${m.runCount}x` : ''}${C.reset}`);
    }
    return;
  }

  if (sub === 'get') {
    const name = subArgs[1];
    if (!name) return fail('Usage: nexus /macro get <name>');
    const r = await macro.execute({ action: 'get', name });
    if (r.error) return fail(r.error);
    out(r.macro);
    return;
  }

  if (sub === 'create') {
    const name = subArgs[1];
    if (!name) return fail('Usage: nexus /macro create <name> --file=<path.json>');
    const file = flag('file');
    if (!file) return fail('create needs --file=<path.json> — a real {"steps":[...]} definition');
    let def;
    try { def = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { return fail(`couldn't read/parse ${file}: ${e.message}`); }
    const r = await macro.execute({ action: 'create', name, urlPattern: flag('url') || def.urlPattern, steps: def.steps, params: def.params, description: def.description });
    if (r.error) return fail(r.error);
    ok(`macro "${name}" created — ${r.macro.steps.length} step(s)`);
    return;
  }

  if (sub === 'delete') {
    const name = subArgs[1];
    if (!name) return fail('Usage: nexus /macro delete <name>');
    const r = await macro.execute({ action: 'delete', name });
    if (r.error) return fail(r.error);
    ok(`deleted "${name}"`);
    return;
  }

  if (sub === 'run') {
    const name = subArgs[1];
    if (!name) return fail('Usage: nexus /macro run <name> --agent=<agentId>');
    const agentId = flag('agent');
    if (!agentId) return fail('run needs --agent=<agentId> — which real browser session to run against');
    const params = _flagObj('param');
    const r = await macro.execute({ action: 'run', name, agentId, params, skipSnapshot: args.includes('--skip-snapshot') });
    if (!r.ok) {
      fail(`macro "${name}" failed at step ${r.failedAtStep} (${r.stepsCompleted}/${r.stepsTotal} completed): ${r.error}`);
      if (r.snapshotId) info(`rollback point saved: ${r.snapshotId} (via the rewind engine — restore it through co-pilot or the rewind_replay tool directly)`);
      process.exit(1);
    }
    ok(`macro "${name}" completed — ${r.stepsCompleted} step(s)${r.snapshotId ? ` · snapshot ${r.snapshotId}` : ''}`);
    return;
  }

  if (sub === 'bookmark') {
    const agentId = flag('agent');
    const label = flag('label');
    if (!agentId || !label) return fail('Usage: nexus /macro bookmark --agent=<agentId> --label=<label>');
    const r = await macro.execute({ action: 'bookmark', agentId, label });
    if (r.error) return fail(r.error);
    ok(`bookmarked "${label}"`);
    return;
  }

  fail(`Unknown /macro command: ${sub} — try: nexus /macro help`);
}

const cmd = args[0];
if (!cmd || cmd === 'help') {
  CMDS.help();
} else if (cmd === '/window' || cmd === '/w') {
  // §2026-07-30 — open the co-pilot CLI in a NEW terminal window, connected to
  // every system through co-pilot (grammar-driven console, registry-live).
  const { openCopilotWindow } = require('./copilot-window');
  const r = openCopilotWindow(args.slice(1));
  if (r.mode === 'window') {
    console.log(`  co-pilot CLI opened in a new window — connected to NEXUS through co-pilot.`);
    process.exit(0);
  }
} else if (cmd === '/ollama') {
  // §OLLAMA-CLI 2026-08-23 — James: "integrate all of the ollama commands
  // ... catagorized." Real, built-in sub-commands, not a passthrough
  // (there is no separate ollama CLI file to pass through to — this file's
  // own header has promised "/ollama <args> — ollama direct commands"
  // since it was written; never actually implemented until now).
  _handleOllamaCommand(args.slice(1)).catch(e => { fail(e.message); process.exit(1); });
} else if (cmd === '/macro') {
  // §MACRO-CLI 2026-08-23 — James: "lets do macros." CLI-first, per his
  // own explicit ordering ("all cli first, then ui last") — this calls
  // the real, already-tested lib/agent-tools/tools/clear-glass/macro.js
  // directly (in-process require, not an HTTP round trip — there's no
  // separate macro server, the tool IS the implementation).
  _handleMacroCommand(args.slice(1)).catch(e => { fail(e.message); process.exit(1); });
} else if (cmd.startsWith('/')) {
  // §BUGFIX 2026-08-23 — James: "why is there so many CLIs, can we
  // consolidate?" Found while wiring in /cos and /healer: this call
  // was broken for EVERY module, not just the two being added —
  // CMDS.passthrough was never a real function (passthrough is defined
  // as its own top-level function, not a CMDS property), and even
  // fixed to call the right function, it was passing cmd.slice(1) (a
  // bare module name like "guardian") where passthrough's own real
  // signature expects a resolved file path. The real, missing step was
  // the MODULE_CLI lookup itself — confirmed by testing /guardian,
  // already wired in before this session touched the file, which
  // failed identically. Every module pass-through in this file has
  // been unreachable, not just the newly-added ones.
  const cliPath = MODULE_CLI[cmd];
  if (!cliPath) { fail(`Unknown module: ${cmd} (known: ${Object.keys(MODULE_CLI).join(', ')})`); process.exit(1); }
  passthrough(cliPath, args.slice(1));
} else if (typeof CMDS[cmd] === 'function') {
  CMDS[cmd]().catch(e => {
    console.error(`\n  ${C.red}✗${C.reset} ${e.message}\n`);
    process.exit(1);
  });
} else {
  fail(`Unknown command: ${cmd}\nRun: nexus help`);
}
