#!/usr/bin/env node
'use strict';
/**
 * cli/nexus-repl.js — NEXUS Interactive CLI REPL
 * UUID: nexus-repl-v2-0000-4000-0000-000000000001
 * Version: 2.0.0
 *
 * Opened automatically by orchestrator. Also: node cli/nexus-repl.js --repl
 *
 * Every system, every command, one terminal.
 * Commands are dynamic — routes discovered from live systems on start.
 *
 * §1.2  Every failure loud and traceable
 * §2.3  All state observable
 * §5.1  Every command gets a UUID
 * §5.2  Talks to all systems via HTTP
 */

const readline       = require('readline');
const http           = require('http');
const path           = require('path');
const { randomUUID } = require('crypto');

const PORTS = {
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT || '9000'),
  bridge: 9999, cortex: 3748, guardian: 7820,
  idearium: 4800, emerge: 4242, ollama: 11434,
};

const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[90m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  blue:'\x1b[34m', magenta:'\x1b[35m', cyan:'\x1b[36m', white:'\x1b[37m',
};
const $   = (col, s) => `${col}${s}${C.reset}`;
const ok  = s => `${C.green}✓${C.reset} ${s}`;
const err = s => `${C.red}✗${C.reset} ${s}`;
const inf = s => `${C.dim}· ${s}${C.reset}`;
const hdr = (s, col = C.bold+C.cyan) => `\n${col}${s}${C.reset}\n`;
const row = (k, v, w = 20) => `  ${$(C.dim, k.padEnd(w))}${v}`;

const SYS_COLOR = {
  bridge:C.yellow, cortex:C.cyan, guardian:C.magenta,
  idearium:C.blue, emerge:C.green, orchestrator:C.green, ollama:C.green,
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function req(port, method, p, body, timeout = 8000) {
  return new Promise(resolve => {
    const uuid = randomUUID();
    const pl   = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Call-UUID': uuid,
        'X-Nexus-Source': 'nexus-repl',
        ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(d), uuid }); }
        catch { resolve({ ok: res.statusCode < 400, data: d, uuid }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok:false, error:'timeout', uuid }); });
    r.on('error', e => resolve({ ok:false, error: e.message, uuid }));
    if (pl) r.write(pl);
    r.end();
  });
}
const GET  = (port, p)    => req(port, 'GET',  p);
const POST = (port, p, b) => req(port, 'POST', p, b);

function gate(name, fn) {
  const uuid = randomUUID();
  const t0   = Date.now();
  const p = fn();
  p.then(() => {
    POST(PORTS.orchestrator, '/api/ledger', {
      system:'repl', type:`repl.${name}`,
      payload:{ uuid, ms:Date.now()-t0, success:true },
    }).catch(()=>{});
  }).catch(() => {
    POST(PORTS.orchestrator, '/api/ledger', {
      system:'repl', type:`repl.${name}.failed`,
      payload:{ uuid, ms:Date.now()-t0, success:false },
    }).catch(()=>{});
  });
  return p;
}

function printTable(label, rows, cols, limit = 30) {
  if (!rows?.length) { console.log(inf('no '+label)); return; }
  console.log(hdr('  '+label.toUpperCase()+' ('+rows.length+')'));
  for (const r of rows.slice(0, limit)) {
    const parts = cols.map(c => {
      const v = r[c];
      if (v == null) return '';
      if (c==='ts'||c==='_ts') return $(C.dim, new Date(v).toLocaleTimeString());
      if (c==='uuid'||c==='id'||c==='hash') return $(C.dim, String(v).slice(0,10));
      if (c==='status') {
        const sc = v==='complete'||v==='resolved'||v==='verified'?C.green:v==='failed'||v==='human_required'?C.red:C.yellow;
        return $(sc, String(v).padEnd(14));
      }
      if (c==='severity') {
        return $(v==='high'?C.red:v==='medium'?C.yellow:C.dim, String(v).padEnd(8));
      }
      return String(v).slice(0, 52);
    });
    console.log('  '+parts.filter(Boolean).join('  '));
  }
  console.log('');
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdStatus() {
  return gate('status', async () => {
    const d   = await GET(PORTS.orchestrator, '/api/status');
    if (!d.ok) { console.log(err('Orchestrator offline')); return; }
    const reg = await GET(PORTS.orchestrator, '/api/registry').catch(()=>null);
    const registry = reg?.data?.registry || {};
    console.log(hdr('⬡  NEXUS  system status'));
    for (const [name, info] of Object.entries(d.data.systems||{})) {
      const dot = info.online ? $(C.green,'●') : $(C.red,'○');
      const col = SYS_COLOR[name] || C.dim;
      const re  = registry[name] || {};
      const hb  = re.lastSeen ? $(C.dim,`hb:${Math.round((Date.now()-re.lastSeen)/1000)}s`) : '';
      const st  = info.online ? $(C.dim,'online') : $(C.red,'OFFLINE');
      console.log(`  ${dot}  ${$(C.bold+col, name.padEnd(14))}  :${String(info.port||'?').padEnd(6)} ${st}  ${info.ms?$(C.dim,info.ms+'ms'):''}  ${hb}`);
      if (info.online && info.data) {
        const d2 = info.data;
        if (name==='cortex' && d2.jaa?.counts) {
          const n = Object.values(d2.jaa.counts).reduce((a,b)=>a+b,0);
          console.log(`               ${$(C.dim, n+' records · '+Object.keys(d2.jaa.counts).length+' tables')}`);
        }
        if (name==='guardian' && d2.providers) {
          const conn = Object.entries(d2.providers).filter(([,v])=>v==='connected').map(([k])=>k);
          if (conn.length) console.log(`               ${$(C.dim,'providers: '+conn.join(', '))}`);
        }
        if (name==='idearium' && d2.snr!=null)
          console.log(`               ${$(C.dim,'SNR: '+(d2.snr*100).toFixed(0)+'%')}`);
        if (name==='bridge' && d2.sessions!=null)
          console.log(`               ${$(C.dim, d2.sessions+' sessions · '+d2.pendingRequests+' pending')}`);
        if (name==='ollama' && d2.models?.length)
          console.log(`               ${$(C.dim,'models: '+d2.models.slice(0,3).join(', '))}`);
      }
    }
    console.log('');
  });
}

async function cmdJobs(args) {
  return gate('jobs', async () => {
    const limit  = parseInt(args.find(a=>/^\d+$/.test(a))||'20');
    const status = args.find(a=>['pending','complete','failed','queued','processing'].includes(a))||'';
    const d = await GET(PORTS.orchestrator, `/api/guardian/jobs?limit=${limit}${status?'&status='+status:''}`);
    if (!d.ok) { console.log(err('Guardian offline')); return; }
    printTable('JOBS', d.data.jobs||[], ['id','provider','command','status','ts']);
  });
}

async function cmdDispatch(args) {
  const provider = args.length>1 ? args[0] : 'chatgpt';
  const prompt   = (args.length>1 ? args.slice(1) : args).join(' ');
  if (!prompt.trim()) { console.log(err('Usage: dispatch [provider] <prompt>')); return; }
  return gate('dispatch', async () => {
    const d = await POST(PORTS.orchestrator, '/api/guardian/dispatch', { provider, command:'code', prompt });
    if (!d.ok) { console.log(err(`Guardian offline: ${d.error||'unknown'}`)); return; }
    console.log(ok(`Job dispatched: ${$(C.dim,(d.data.jobId||'').slice(0,8))}  status: ${d.data.status}`));
    if (d.data.status==='queued')
      console.log(`  ${$(C.dim,'waiting for '+provider+' tab (Tampermonkey)')}`);
  });
}

async function cmdEvents(args) {
  return gate('events', async () => {
    const n    = parseInt(args[0]||'25');
    const type = args.find(a=>a.startsWith('--type='))?.slice(7)||'';
    const d    = await GET(PORTS.orchestrator, `/api/cortex/events?n=${n}`);
    if (!d.ok) { console.log(err('Cortex offline')); return; }
    let rows = d.data.rows||[];
    if (type) rows = rows.filter(e=>e.type?.includes(type));
    console.log(hdr(`EVENTS (${rows.length})`));
    for (const e of rows) {
      const ts  = new Date(e.ts||0).toTimeString().slice(0,8);
      const sys = (e.type||'').split('.')[0];
      const pl  = e.payload?(typeof e.payload==='string'?e.payload:JSON.stringify(e.payload)):'';
      console.log(`  ${$(C.dim,ts)}  ${$(SYS_COLOR[sys]||C.dim,(e.type||'—').padEnd(36))}  ${$(C.dim,pl.slice(0,55))}`);
    }
    console.log('');
  });
}

async function cmdGaps(args) {
  return gate('gaps', async () => {
    const sev = args.find(a=>['high','medium','low'].includes(a))||'';
    const [ig, cg] = await Promise.all([
      GET(PORTS.orchestrator, '/api/idearium/gaps'),
      GET(PORTS.orchestrator, '/api/cortex/gaps?status=open'),
    ]);
    const iList = ig.data?.gaps||[];
    let   cList = (cg.data?.rows||cg.data||[]).filter(g=>g.status!=='resolved');
    if (sev) cList = cList.filter(g=>g.severity===sev);
    console.log(hdr('GAPS'));
    if (iList.length) {
      console.log(`  ${$(C.dim,'idearium:')}`);
      for (const g of iList)
        console.log(`    ${$(C.yellow,'○')}  ${$(C.dim,(g.uuid||'').slice(0,8))}  ${(g.description||'—').slice(0,60)}`);
    }
    if (cList.length) {
      console.log(`  ${$(C.dim,'cortex:')}`);
      for (const g of cList) {
        const col = g.severity==='high'?C.red:g.severity==='medium'?C.yellow:C.dim;
        console.log(`    ${$(col,'○')}  ${$(C.dim,(g.uuid||'').slice(0,8))}  ${$(C.dim,(g.status||'?').padEnd(18))}  ${$(col,g.type||'?')}  ${(g.body||'—').slice(0,40)}`);
      }
    }
    if (!iList.length && !cList.length) console.log(`  ${$(C.dim,'no open gaps')}`);
    console.log('');
  });
}

async function cmdFailures(args) {
  return gate('failures', async () => {
    const n = parseInt(args[0]||'20');
    const d = await GET(PORTS.cortex, '/api/failures');
    if (!d.ok) { console.log(err('Cortex offline')); return; }
    printTable('FAILURES', (d.data.rows||d.data||[]).slice(0,n), ['uuid','source','error','ts']);
  });
}

async function cmdMemory(args) {
  return gate('memory', async () => {
    const table = args[0]||'event_log';
    const n     = parseInt(args[1]||'20');
    const d     = await GET(PORTS.orchestrator, `/api/cortex/memory?table=${table}&n=${n}`);
    if (!d.ok) { console.log(err(`Cortex offline or unknown table '${table}'`)); return; }
    const rows = d.data.rows||[];
    console.log(hdr(`MEMORY  ${table} (${rows.length})`));
    for (const r of rows.slice(0,n)) {
      const ts  = new Date(r.ts||r._ts||0).toTimeString().slice(0,8);
      const key = r.type||r.source||r.name||Object.keys(r).find(k=>k!=='ts'&&k!=='uuid'&&k!=='_ts')||'?';
      console.log(`  ${$(C.dim,ts)}  ${$(C.cyan,String(key).padEnd(30))}  ${$(C.dim,JSON.stringify(r).slice(0,60))}`);
    }
    console.log('');
  });
}

async function cmdIdeas(args) {
  return gate('ideas', async () => {
    const d = await GET(PORTS.orchestrator, '/api/idearium/ideas');
    if (!d.ok) { console.log(err('Idearium offline')); return; }
    const list = d.data.ideas||[];
    console.log(hdr(`IDEAS (${list.length})`));
    for (const i of [...list].reverse().slice(0,20)) {
      const col = i.phase==='complete'?C.green:i.phase==='building'?C.cyan:C.dim;
      console.log(`  ${$(C.dim,(i.uuid||'').slice(0,8))}  ${$(col,(i.phase||'seed').padEnd(12))}  ${(i.text||i.title||'—').slice(0,60)}`);
    }
    console.log('');
  });
}

async function cmdIdea(args) {
  const text = args.join(' ').trim();
  if (!text) { console.log(err('Usage: idea <text>')); return; }
  return gate('idea.create', async () => {
    const d = await POST(PORTS.orchestrator, '/api/idearium/ideas', { text });
    if (!d.ok) { console.log(err('Idearium offline')); return; }
    const uuid = d.data.idea?.uuid||d.data.uuid||'?';
    console.log(ok(`Idea created: ${$(C.dim,uuid.slice(0,8))}  "${text.slice(0,50)}"`));
    await POST(PORTS.bridge, '/bridge/broadcast', { type:'idearium.idea.created', text, uuid });
  });
}

async function cmdSnap(args) {
  return gate('snap', async () => {
    const sub = args[0]||'list';
    if (sub==='list'||sub==='ls') {
      const n = parseInt(args[1]||'10');
      const d = await GET(PORTS.cortex, `/api/snapshots?n=${n}`);
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      if (!d.data.snapshots?.length) { console.log(inf('no snapshots yet')); return; }
      console.log(hdr('SNAPSHOTS'));
      for (const s of d.data.snapshots) {
        const age = Math.round((Date.now()-s.ts)/1000);
        console.log(`  ${$(C.cyan,s.snapId)}  ${$(C.dim,(s.type||'?').padEnd(14))}  ${(s.message||'—').slice(0,38).padEnd(40)}  ${$(C.dim,s.totalRows+' rows  '+age+'s ago  rb='+s.rollback_count)}`);
      }
      console.log('');
      return;
    }
    if (sub==='create'||sub==='take') {
      const msg = args.slice(1).join(' ')||'manual snapshot';
      const d   = await POST(PORTS.cortex, '/api/snapshots/create', { message:msg });
      if (!d.ok) { console.log(err(d.data?.error||'snapshot failed')); return; }
      console.log(ok(`snapshot created: ${d.data.snapId} (${d.data.totalRows} rows)`));
      return;
    }
    if (sub==='diff') {
      const [a,b] = [args[1],args[2]];
      if (!a||!b) { console.log(err('Usage: snap diff <snapId-a> <snapId-b>')); return; }
      const d = await GET(PORTS.cortex, `/api/snapshots/diff?a=${a}&b=${b}`);
      if (!d.ok) { console.log(err(d.data?.error||'diff failed')); return; }
      console.log(hdr(`DIFF  ${a}  →  ${b}`));
      const tables = Object.entries(d.data.tables||{});
      if (!tables.length) { console.log(ok('no differences')); return; }
      for (const [t,v] of tables) {
        const sign = v.delta>0?`${C.green}+${v.delta}${C.reset}`:`${C.red}${v.delta}${C.reset}`;
        console.log(`  ${$(C.dim,t.padEnd(30))}  ${v.a} → ${v.b}  ${sign}`);
      }
      console.log('');
      return;
    }
    if (sub==='rollback') {
      const snapId = args[1];
      const apply  = args.includes('--apply');
      if (!snapId) { console.log(err('Usage: snap rollback <snapId> [--apply]')); return; }
      const d = await POST(PORTS.cortex, '/api/snapshots/rollback', { snapId, apply });
      if (!d.ok) { console.log(err(d.data?.error||'rollback failed')); return; }
      if (d.data.dry_run) {
        console.log(hdr(`DRY RUN — ${d.data.tables?.length||0} tables would change`));
        for (const [t,v] of Object.entries(d.data.changes||{}))
          console.log(`  ${$(C.dim,t.padEnd(30))}  current=${v.current}  snap=${v.snapshot}  Δ=${v.delta}`);
        console.log(inf('Pass --apply to execute'));
      } else {
        console.log(ok(`rolled back to ${snapId} — ${d.data.tablesRestored} tables restored`));
        console.log(inf(`safety snapshot: ${d.data.safetySnapId}`));
      }
      return;
    }
    console.log(err(`unknown snap command: ${sub}`));
    console.log(inf('Commands: list  create [msg]  diff <a> <b>  rollback <id> [--apply]'));
  });
}

async function cmdReplay(args) {
  return gate('replay', async () => {
    const sub = args[0]||'verify';
    if (sub==='verify') {
      console.log(inf('running replay verification…'));
      const d = await POST(PORTS.cortex, '/api/replay/verify', {});
      const divs = d.data?.divergences||[];
      if (!divs.length) {
        console.log(ok(`verified — ${d.data?.eventCount||0} events, no divergences`));
      } else {
        console.log(`${C.yellow}⚠  ${divs.length} divergence(s)${C.reset}`);
        for (const dv of divs) console.log(`  ${$(C.red,dv.field||'?')}  live=${dv.live}  replay=${dv.replay}`);
      }
      console.log('');
      return;
    }
    if (sub==='inspect') {
      const fromTs = parseInt(args.find(a=>a.startsWith('--from='))?.slice(7)||'0');
      const d = await POST(PORTS.cortex, '/api/replay/inspect', { fromTs });
      const s = d.data?.state||{};
      console.log(hdr('REPLAY INSPECT'));
      console.log(row('events',       d.data?.eventCount||0));
      console.log(row('gaps',         s.gaps?.length||0));
      console.log(row('patches',      s.patches?.length||0));
      console.log(row('dispatches',   s.dispatches?.length||0));
      if (s.lastHeartbeat) console.log(row('last heartbeat', Math.round((Date.now()-s.lastHeartbeat)/1000)+'s ago'));
      console.log('');
      return;
    }
    if (sub==='simulate') {
      const eventType = args[1];
      if (!eventType) { console.log(err('Usage: replay simulate <event-type>')); return; }
      const faults = [{ uuid:randomUUID(), type:eventType, payload:{}, source:'repl/simulate', ts:Date.now(), _inject:'after' }];
      const d = await POST(PORTS.cortex, '/api/replay/simulate', { events:faults });
      console.log(hdr('REPLAY SIMULATE'));
      console.log(row('injected',     eventType));
      console.log(row('total events', d.data?.eventCount||0));
      console.log(row('gaps in state', d.data?.state?.gaps?.length||0));
      console.log('');
      return;
    }
    console.log(err(`unknown replay command: ${sub}`));
    console.log(inf('Commands: verify  inspect [--from=ts]  simulate <event-type>'));
  });
}

async function cmdHeal(args) {
  return gate('heal', async () => {
    const sub = args[0]||'status';
    if (sub==='status') {
      const d = await GET(PORTS.cortex, '/api/self-heal/status');
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      console.log(hdr('SELF-HEAL STATUS'));
      console.log(row('needs_manual',      d.data.pending));
      console.log(row('forge_patch_ready', d.data.ready));
      console.log(row('forge_applied',     d.data.patched));
      console.log(row('human_required',    d.data.human_required));
      if (d.data.recentPatches?.length) {
        console.log(`\n  ${$(C.dim,'Recent patches:')}`);
        for (const p of d.data.recentPatches) {
          const ap = p.applied?$(C.green,'applied'):$(C.yellow,'audit-only');
          console.log(`  ${$(C.dim,(p.module||'?').slice(-42).padEnd(44))}  ${ap}  ${$(C.dim,p.provider||'—')}`);
        }
      }
      console.log('');
      return;
    }
    if (sub==='gaps') {
      const d = await GET(PORTS.cortex, '/api/gaps');
      const gaps = (d.data?.rows||d.data||[])
        .filter(g=>['needs_manual','forge_failed','human_required','forge_applied','forge_patch_ready'].includes(g.status));
      if (!gaps.length) { console.log(ok('no active self-heal gaps')); return; }
      console.log(hdr('SELF-HEAL GAPS'));
      for (const g of gaps) {
        const sc = g.status==='forge_applied'?C.green:g.status==='human_required'?C.red:C.yellow;
        console.log(`  ${$(sc,(g.status||'?').padEnd(22))}  ${$(C.cyan,(g.type||'?').padEnd(22))}  ${(g.body||'').slice(0,42)}`);
      }
      console.log('');
      return;
    }
    if (sub==='enable') {
      console.log(ok('To enable live patching:'));
      console.log(`  ${$(C.cyan,'NEXUS_FORGE_APPLY=true node cortex/boot.js')}`);
      console.log(inf('Default is audit mode — patches are proposed, not applied'));
      return;
    }
    console.log(err(`unknown heal command: ${sub}`));
    console.log(inf('Commands: status  gaps  enable'));
  });
}

async function cmdTools(args) {
  return gate('tools', async () => {
    const sub = args[0]||'list';
    if (sub==='list'||sub==='ls') {
      const d = await GET(PORTS.cortex, '/api/tools');
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      console.log(hdr('AGENT TOOLS'));
      for (const t of d.data.tools||[])
        console.log(`  ${$(C.cyan,t.name.padEnd(34))}  ${$(C.dim,t.description)}`);
      console.log('');
      return;
    }
    if (sub==='exec'||sub==='run') {
      const toolName = args[1];
      if (!toolName) { console.log(err('Usage: tools exec <name> [--input=json]')); return; }
      const inputFlag = args.find(a=>a.startsWith('--input='))?.slice(8)||'{}';
      let input;
      try { input = JSON.parse(inputFlag); } catch { console.log(err('invalid JSON input')); return; }
      console.log(inf(`running ${toolName}…`));
      const d = await POST(PORTS.cortex, '/api/tools/exec', { tool:toolName, input });
      console.log(JSON.stringify(d.data||d, null, 2));
      return;
    }
    console.log(err(`unknown tools command: ${sub}`));
    console.log(inf('Commands: list  exec <tool> [--input=json]'));
  });
}

async function cmdContract(args) {
  return gate('contract', async () => {
    const sub = args[0]||'agents';
    if (sub==='agents'||sub==='list') {
      const d = await GET(PORTS.cortex, '/api/contract/agents');
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      console.log(hdr('ORCHESTRATION CONTRACTS'));
      for (const a of d.data.agents||[]) {
        const tc = a.trust_level==='internal'?C.green:a.trust_level==='local'?C.cyan:C.yellow;
        const denied = a.denied?.length?` ${$(C.red,'deny:'+a.denied.join(','))}` : '';
        const proof  = a.proof_required?` ${$(C.yellow,'proof-required')}` : '';
        console.log(`  ${$(tc,(a.agent||'?').padEnd(22))}  ${$(C.dim,(a.trust_level||'?').padEnd(10))}  ${(a.allowed||[]).join(',')}${denied}${proof}`);
      }
      console.log('');
      return;
    }
    if (sub==='violations') {
      const n = parseInt(args[1]||'20');
      const d = await GET(PORTS.cortex, `/api/contract/violations?n=${n}`);
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      if (!d.data.violations?.length) { console.log(ok('no violations recorded')); return; }
      console.log(hdr('CONTRACT VIOLATIONS'));
      for (const v of d.data.violations) {
        const ts = new Date(v.ts||0).toTimeString().slice(0,8);
        console.log(`  ${$(C.dim,ts)}  ${$(C.yellow,(v.agent||'?').padEnd(22))}  ${(v.violation||'').slice(0,55)}`);
      }
      console.log('');
      return;
    }
    if (sub==='audit') {
      const n = parseInt(args[1]||'20');
      const d = await GET(PORTS.cortex, `/api/contract/audit?n=${n}`);
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      console.log(hdr('CONTRACT AUDIT'));
      for (const a of d.data.audit||[]) {
        const ts = new Date(a.ts||0).toTimeString().slice(0,8);
        const sc = a.result==='pass'?C.green:C.red;
        console.log(`  ${$(C.dim,ts)}  ${$(sc,(a.result||'?').padEnd(12))}  ${$(C.cyan,(a.agent||'?').padEnd(22))}  ${a.action||'?'}`);
      }
      console.log('');
      return;
    }
    if (sub==='check') {
      const agent  = args.find(a=>a.startsWith('--agent='))?.slice(8)  || args[1];
      const action = args.find(a=>a.startsWith('--action='))?.slice(9) || args[2];
      if (!agent||!action) { console.log(err('Usage: contract check --agent=<x> --action=<y>')); return; }
      const d = await POST(PORTS.cortex, '/api/contract/check', { uuid:randomUUID(), routedTo:agent, command:action, prompt:'test' });
      const r = d.data?.result||d.data||{};
      if (r.violations?.length) {
        console.log(`${C.red}✗ BLOCKED${C.reset}  ${agent}/${action}`);
        for (const v of r.violations) console.log(`  ${$(C.red,'→')} ${v}`);
      } else {
        console.log(ok(`${agent}/${action} — permitted (trust=${r.trust_level||r.contract?.trust_level||'?'})`));
      }
      return;
    }
    console.log(err(`unknown contract command: ${sub}`));
    console.log(inf('Commands: agents  violations [n]  audit [n]  check --agent=x --action=y'));
  });
}

async function cmdContext() {
  return gate('context', async () => {
    const d = await POST(PORTS.cortex, '/api/tools/exec', { tool:'nexus.context', input:{} });
    const r = d.data||{};
    console.log(hdr('NEXUS CONTEXT'));
    console.log(row('open gaps',       r.openGaps||0));
    console.log(row('recent failures', r.recentFailures||0));
    console.log(row('forge patches',   r.forgePatchCount||0));
    console.log(row('snapshots',       r.snapshotCount||0));
    console.log(row('latest snapshot', r.latestSnapshot||'none'));
    if (r.recentEvents?.length) {
      console.log(`\n  ${$(C.dim,'Recent events:')}`);
      for (const e of r.recentEvents.slice(-8))
        console.log(`  ${$(C.dim,new Date(e.ts||0).toTimeString().slice(0,8))}  ${$(C.cyan,(e.type||'?').padEnd(36))}  ${$(C.dim,e.source||'?')}`);
    }
    console.log('');
  });
}

async function cmdCortex(args) {
  return gate('cortex', async () => {
    const sub = args[0]||'status';
    if (sub==='status'||sub==='health') {
      const d = await GET(PORTS.cortex, '/health');
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      const h = d.data||{};
      console.log(hdr('CORTEX HEALTH'));
      console.log(row('version', h.version||'?'));
      console.log(row('uptime',  Math.round(h.uptime||0)+'s'));
      if (h.jaa?.counts) {
        const total = Object.values(h.jaa.counts).reduce((a,b)=>a+b,0);
        console.log(row('JAA records', total+' across '+Object.keys(h.jaa.counts).length+' tables'));
        for (const [t,n] of Object.entries(h.jaa.counts).sort(([,a],[,b])=>b-a).slice(0,6))
          if (n>0) console.log(`  ${$(C.dim,'  '+t.padEnd(28))}  ${n}`);
      }
      console.log('');
      return;
    }
    if (sub==='table'||sub==='tbl') {
      const table = args[1]; const n = parseInt(args[2]||'20');
      if (!table) { console.log(err('Usage: cortex table <name> [n]')); return; }
      const d = await POST(PORTS.cortex, '/api/tools/exec', { tool:'nexus.table', input:{ table, limit:n } });
      const r = d.data||{};
      if (!r.ok) { console.log(err(r.error||'failed')); return; }
      console.log(hdr(`TABLE: ${table} (${r.count} rows)`));
      for (const row_ of (r.rows||[]).slice(0,n))
        console.log(`  ${$(C.dim, JSON.stringify(row_).slice(0,100))}`);
      console.log('');
      return;
    }
    if (sub==='modules') {
      const d = await GET(PORTS.cortex, '/api/modules');
      if (!d.ok) { console.log(err('Cortex offline')); return; }
      console.log(hdr('CORTEX MODULES'));
      for (const m of d.data.modules||[])
        console.log(`  ${$(C.cyan,(m.id||'?').padEnd(24))}  ${$(C.dim,'poll: '+(m.pollMs||'?')+'ms')}`);
      console.log('');
      return;
    }
    if (sub==='search') {
      const q = args.slice(1).join(' ');
      if (!q) { console.log(err('Usage: cortex search <query>')); return; }
      const d = await POST(PORTS.cortex, '/api/memory/search', { q });
      if (!d.ok) { console.log(err('search failed')); return; }
      printTable('SEARCH RESULTS', d.data.rows||d.data||[], ['uuid','type','source','ts']);
      return;
    }
    console.log(err(`unknown cortex command: ${sub}`));
    console.log(inf('Commands: status  table <name> [n]  modules  search <q>'));
  });
}

async function cmdGuardian(args) {
  return gate('guardian', async () => {
    const sub = args[0]||'status';
    if (sub==='status'||sub==='health') {
      const d = await GET(PORTS.guardian, '/health');
      if (!d.ok) { console.log(err('Guardian offline')); return; }
      const h = d.data||{};
      console.log(hdr('GUARDIAN HEALTH'));
      console.log(row('uptime',  Math.round(h.uptime||0)+'s'));
      console.log(row('jobs',    h.jobs||0));
      for (const [p,s] of Object.entries(h.providers||{})) {
        const sc = s==='connected'?C.green:C.red;
        console.log(`  ${$(C.dim,'provider'.padEnd(18))}${$(sc,p+': '+s)}`);
      }
      console.log('');
      return;
    }
    if (sub==='providers') {
      const d = await GET(PORTS.guardian, '/providers');
      if (!d.ok) { console.log(err('Guardian offline')); return; }
      console.log(hdr('PROVIDERS'));
      for (const [p,s] of Object.entries(d.data.providers||d.data||{})) {
        const sc = s==='connected'?C.green:C.red;
        console.log(`  ${$(sc,'●')}  ${$(C.magenta,p.padEnd(16))}  ${s}`);
      }
      console.log('');
      return;
    }
    if (sub==='artifacts') {
      const n = parseInt(args[1]||'20');
      const d = await GET(PORTS.orchestrator, '/api/guardian/artifacts');
      if (!d.ok) { console.log(err('Guardian offline')); return; }
      printTable('ARTIFACTS', (d.data.artifacts||[]).slice(0,n), ['hash','name','lang','ts']);
      return;
    }
    if (sub==='memory') {
      const d = await GET(PORTS.orchestrator, '/api/guardian/memory/stats');
      if (!d.ok) { console.log(err('Guardian offline')); return; }
      console.log(hdr('GUARDIAN MEMORY'));
      for (const [k,v] of Object.entries(d.data||{}))
        console.log(row(k, JSON.stringify(v).slice(0,60)));
      console.log('');
      return;
    }
    console.log(err(`unknown guardian command: ${sub}`));
    console.log(inf('Commands: status  providers  artifacts [n]  memory'));
  });
}

async function cmdBridge(args) {
  return gate('bridge', async () => {
    const sub = args[0]||'status';
    if (sub==='status'||sub==='health') {
      const d = await GET(PORTS.bridge, '/bridge/health');
      if (!d.ok) { console.log(err('Bridge offline')); return; }
      console.log(hdr('BRIDGE HEALTH'));
      console.log(row('sessions', d.data.sessions||0));
      console.log(row('pending',  d.data.pendingRequests||0));
      console.log(row('uptime',   Math.round(d.data.uptime||0)+'s'));
      console.log('');
      return;
    }
    if (sub==='requests'||sub==='req') {
      const status = args[1]||'pending';
      const d = await GET(PORTS.orchestrator, `/api/bridge/requests?status=${status}`);
      if (!d.ok) { console.log(err('Bridge offline')); return; }
      printTable('REQUESTS', [...(d.data.requests||[])].reverse().slice(0,20), ['uuid','status','type','from','ts']);
      return;
    }
    if (sub==='broadcast'||sub==='emit') {
      const type = args[1];
      if (!type) { console.log(err('Usage: bridge broadcast <type> [json-payload]')); return; }
      let pl = {};
      try { pl = args[2] ? JSON.parse(args[2]) : {}; } catch { pl = { msg: args.slice(2).join(' ') }; }
      const d = await POST(PORTS.orchestrator, '/api/bridge/broadcast', { type, ...pl });
      console.log(d.ok ? ok(`broadcast: ${type}`) : err('broadcast failed'));
      return;
    }
    console.log(err(`unknown bridge command: ${sub}`));
    console.log(inf('Commands: status  requests [status]  broadcast <type> [payload]'));
  });
}

async function cmdIdearium(args) {
  return gate('idearium', async () => {
    const sub = args[0]||'snr';
    if (sub==='snr'||sub==='status') {
      const d = await GET(PORTS.orchestrator, '/api/idearium/snr');
      if (!d.ok) { console.log(err('Idearium offline')); return; }
      const snr = d.data.snr||0;
      const col = snr>0.8?C.green:snr>0.5?C.yellow:C.red;
      const bar = '█'.repeat(Math.round(snr*30))+'░'.repeat(30-Math.round(snr*30));
      console.log(`\n  ${$(col,bar)}  ${$(col,(snr*100).toFixed(1)+'% SNR')}\n`);
      return;
    }
    if (sub==='specs') {
      const d = await GET(PORTS.orchestrator, '/api/idearium/specs');
      if (!d.ok) { console.log(err('Idearium offline')); return; }
      printTable('SPECS', d.data.specs||[], ['uuid','title','status','ts']);
      return;
    }
    if (sub==='stats') {
      const d = await GET(PORTS.orchestrator, '/api/idearium/stats');
      if (!d.ok) { console.log(err('Idearium offline')); return; }
      console.log(hdr('IDEARIUM STATS'));
      for (const [k,v] of Object.entries(d.data||{})) console.log(row(k,String(v)));
      console.log('');
      return;
    }
    console.log(err(`unknown idearium command: ${sub}`));
    console.log(inf('Commands: snr  specs  stats'));
  });
}

async function cmdOllama(args) {
  return gate('ollama', async () => {
    const sub = args[0]||'models';
    if (sub==='models'||sub==='status') {
      const d = await GET(PORTS.ollama, '/api/tags');
      if (!d.ok) { console.log(err('Ollama offline')); return; }
      const models = (d.data.models||[]).map(m=>m.name||m.model||'?');
      console.log(hdr('OLLAMA MODELS'));
      for (const m of models) console.log(`  ${$(C.green,'●')}  ${m}`);
      if (!models.length) console.log(inf('no models loaded'));
      console.log('');
      return;
    }
    if (sub==='ask') {
      const prompt = args.slice(1).join(' ');
      if (!prompt) { console.log(err('Usage: ollama ask <prompt>')); return; }
      console.log(inf('sending to ollama…'));
      const d = await POST(PORTS.ollama, '/api/generate', {
        model: process.env.OLLAMA_MODEL||'mistral', prompt, stream:false,
      });
      if (!d.ok) { console.log(err('Ollama offline')); return; }
      console.log(`\n${$(C.dim,'ollama:')} ${d.data.response||'(no response)'}\n`);
      return;
    }
    console.log(err(`unknown ollama command: ${sub}`));
    console.log(inf('Commands: models  ask <prompt>'));
  });
}

async function cmdLedger(args) {
  return gate('ledger', async () => {
    const sys = args[0]&&!parseInt(args[0])?args[0]:'';
    const n   = parseInt(args.find(a=>/^\d+$/.test(a))||'30');
    const d   = await GET(PORTS.orchestrator, `/api/ledger${sys?'?system='+sys+'&n='+n:'?n='+n}`);
    if (!d.ok) { console.log(err('Orchestrator offline')); return; }
    console.log(hdr(`LEDGER (${(d.data.entries||[]).length})`));
    for (const e of d.data.entries||[]) {
      const sc = SYS_COLOR[e._system]||C.dim;
      const ts = new Date(e._ts||0).toTimeString().slice(0,8);
      console.log(`  ${$(C.dim,ts)}  ${$(sc,(e._system||'?').padEnd(14))}  ${$(C.reset,(e.type||'—').padEnd(32))}  ${$(C.dim,JSON.stringify(e.payload||{}).slice(0,50))}`);
    }
    console.log('');
  });
}

async function cmdBus(args) {
  return gate('bus', async () => {
    const sys = args[0]&&!parseInt(args[0])?args[0]:'';
    const n   = parseInt(args.find(a=>/^\d+$/.test(a))||'30');
    const d   = await GET(PORTS.orchestrator, `/api/bus${sys?'?system='+sys+'&n='+n:'?n='+n}`);
    if (!d.ok) { console.log(err('Orchestrator offline')); return; }
    const entries = d.data.entries||[], gates = d.data.gates||[];
    console.log(hdr(`SISO BUS (${entries.length} events · ${gates.length} gates)`));
    if (gates.length) console.log(`  ${$(C.dim,'Gates:')} ${$(C.cyan,gates.slice(0,8).join(', '))}`);
    console.log('');
    for (const e of entries.slice(0,30)) {
      const ts  = new Date(e.ts||0).toTimeString().slice(0,8);
      const col = SYS_COLOR[e.system||'orchestrator']||C.dim;
      const clm = e.claimed?$(C.green,'✓'):$(C.dim,'○');
      console.log(`  ${$(C.dim,ts)}  ${clm}  ${$(col,(e.system||'?').padEnd(12))}  ${$(C.reset,(e.type||'—').padEnd(40))}  ${$(C.dim,e.seq||'')}`);
    }
    console.log('');
  });
}

async function cmdWatch() {
  console.log(`${$(C.bold+C.cyan,'LIVE STREAM')}  ${$(C.dim,'bridge events — Ctrl+C to stop')}\n`);
  const r = http.request({
    hostname:'127.0.0.1', port:9999,
    path:'/bridge/subscribe?channel=*', method:'GET',
    headers:{ Accept:'text/event-stream' },
  }, res => {
    let buf = '';
    res.on('data', c => {
      buf += c.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith('data:')) continue;
        try {
          const d   = JSON.parse(l.slice(5).trim());
          const ts  = new Date(d.bridgeTs||Date.now()).toTimeString().slice(0,8);
          const sys = (d.type||'').split('.')[0];
          process.stdout.write(`  ${$(C.dim,ts)}  ${$(SYS_COLOR[sys]||C.dim,sys.padEnd(12))}  ${$(C.reset,(d.type||'event').padEnd(32))}  ${$(C.dim,JSON.stringify(d).slice(0,60))}\n`);
        } catch(_) {}
      }
    });
    res.on('end', () => { console.log('\nstream ended'); process.exit(0); });
  });
  r.on('error', e => { console.log(err('Bridge offline: '+e.message)); process.exit(1); });
  r.end();
  process.on('SIGINT', () => { r.destroy(); console.log('\n'); process.exit(0); });
}

async function cmdWatchdog() {
  console.log(`${$(C.bold+C.cyan,'WATCHDOG')}  ${$(C.dim,'live monitor — Ctrl+C to stop')}\n`);
  const r = http.request({
    hostname:'127.0.0.1', port:PORTS.orchestrator,
    path:'/sse', method:'GET', headers:{ Accept:'text/event-stream' },
  }, res => {
    let buf = '';
    res.on('data', c => {
      buf += c.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith('data:')) continue;
        try {
          const d = JSON.parse(l.slice(5).trim());
          if (d.type==='orchestrator.watchdog.tick' && d.systems) {
            process.stdout.write('\x1b[2J\x1b[H');
            console.log(`${$(C.bold+C.cyan,'⬡  NEXUS WATCHDOG')}  ${$(C.dim,new Date().toTimeString().slice(0,8))}\n`);
            for (const [name,info] of Object.entries(d.systems)) {
              const col = SYS_COLOR[name]||C.dim;
              console.log(`  ${info.online?$(C.green,'●'):$(C.red,'○')}  ${$(C.bold+col,name.padEnd(14))}  ${info.online?$(C.dim,'online'):$(C.red,'OFFLINE')}  ${info.ms?$(C.dim,info.ms+'ms'):''}`);
            }
            const offline = Object.values(d.systems).filter(s=>!s?.online).length;
            console.log('');
            console.log(offline>0?$(C.red,`  ⚠ ${offline} system(s) offline`):$(C.green,'  ✓ all systems online'));
            console.log($(C.dim,'\n  Ctrl+C to exit'));
          }
        } catch(_) {}
      }
    });
    res.on('end', () => process.exit(0));
  });
  r.on('error', e => { console.log(err('Orchestrator offline: '+e.message)); process.exit(1); });
  r.end();
  process.on('SIGINT', () => { r.destroy(); console.log('\n'); process.exit(0); });
}

function cmdHelp(args) {
  const topic = args?.[0];
  const topics = {
    snap:     'snap list | create [msg] | diff <a> <b> | rollback <id> [--apply]',
    replay:   'replay verify | inspect [--from=ts] | simulate <event-type>',
    heal:     'heal status | gaps | enable',
    tools:    'tools list | exec <name> [--input=json]',
    contract: 'contract agents | violations [n] | audit [n] | check --agent=x --action=y',
    cortex:   'cortex status | table <name> [n] | modules | search <q>',
    guardian: 'guardian status | providers | artifacts [n] | memory',
    bridge:   'bridge status | requests [status] | broadcast <type> [payload]',
    idearium: 'idearium snr | specs | stats',
    ollama:   'ollama models | ask <prompt>',
  };
  if (topic && topics[topic]) {
    console.log(`\n${$(C.bold+C.cyan,topic.toUpperCase())}  ${$(C.dim,topics[topic])}\n`);
    return;
  }
  console.log(`
${$(C.bold+C.green,'⬡  NEXUS REPL')}  v2.0  — ${$(C.cyan,'help <command>')} for detail

${$(C.bold,'Core')}
  ${$(C.cyan,'status')}                    all systems health
  ${$(C.cyan,'context')}                   full system self-awareness
  ${$(C.cyan,'events [n] [--type=x]')}    cortex event log
  ${$(C.cyan,'gaps [high|medium|low]')}    open gaps
  ${$(C.cyan,'failures [n]')}              recent failures
  ${$(C.cyan,'memory [table] [n]')}        JAA table viewer
  ${$(C.cyan,'ledger [system] [n]')}       orchestrator event ledger
  ${$(C.cyan,'snr')}                       idearium signal/noise

${$(C.bold,'Dispatch')}
  ${$(C.cyan,'dispatch [provider] <p>')}   dispatch job (default: chatgpt)
  ${$(C.cyan,'jobs [status] [n]')}         guardian job list
  ${$(C.cyan,'ideas')}                     idearium idea list
  ${$(C.cyan,'idea <text>')}               create idea
  ${$(C.cyan,'push [msg]')}               idearium snapshot

${$(C.bold,'Self-healing')}
  ${$(C.cyan,'snap list|create|diff|rollback')}   .nex snapshots
  ${$(C.cyan,'replay verify|inspect|simulate')}   deterministic replay
  ${$(C.cyan,'heal status|gaps|enable')}           self-heal pipeline
  ${$(C.cyan,'resilience status|run|chain')}       fallback strategy engine
  ${$(C.cyan,'tools list|exec <name>')}            agent tools
  ${$(C.cyan,'contract agents|violations|check')}  orchestration contracts

${$(C.bold,'Systems')}
  ${$(C.cyan,'cortex')}   status | table <name> | modules | search
  ${$(C.cyan,'guardian')} status | providers | artifacts | memory
  ${$(C.cyan,'bridge')}   status | requests | broadcast
  ${$(C.cyan,'idearium')} snr | specs | stats
  ${$(C.cyan,'ollama')}   models | ask <prompt>

${$(C.bold,'Live')}
  ${$(C.cyan,'watch')}         live bridge event stream
  ${$(C.cyan,'watchdog / wd')} live system monitor
  ${$(C.cyan,'diagnose [sys]')} full diagnostic

${$(C.bold,'Other')}
  ${$(C.cyan,'bus [sys] [n]')}  SISO bus log
  ${$(C.cyan,'requests')}       bridge request queue
  ${$(C.cyan,'ui')}             open orchestrator UI
  ${$(C.cyan,'exit / q')}       quit

${$(C.dim,'Ports:')} ${$(C.yellow,'bridge:9999')}  ${$(C.cyan,'cortex:3748')}  ${$(C.magenta,'guardian:7820')}  ${$(C.blue,'idearium:4800')}  ${$(C.green,'emerge:4242')}  ${$(C.green,'orch:9000')}
`);
}

// ── Main dispatcher ───────────────────────────────────────────────────────────
async function dispatch(line) {
  const parts = line.trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const args  = parts.slice(1);

  switch (cmd) {
    case '':           return;
    case 'exit': case 'quit': case 'q':
      console.log($(C.dim,'goodbye')); process.exit(0);

    case 'watch':                  return cmdWatch();
    case 'watchdog': case 'wd':    return cmdWatchdog();

    case 'status':                 return cmdStatus();
    case 'context': case 'ctx':    return cmdContext();
    case 'events':  case 'ev':     return cmdEvents(args);
    case 'gaps':                   return cmdGaps(args);
    case 'failures': case 'fail':  return cmdFailures(args);
    case 'memory':  case 'mem':    return cmdMemory(args);
    case 'ledger':  case 'log':    return cmdLedger(args);
    case 'snr':                    return cmdSNR();
    case 'bus':                    return cmdBus(args);

    case 'dispatch': case 'dis':   return cmdDispatch(args);
    case 'send':                   return cmdDispatch(args);
    case 'jobs':                   return cmdJobs(args);

    case 'ideas':                  return cmdIdeas(args);
    case 'idea':                   return cmdIdea(args);
    case 'push':                   return cmdPush(args);

    case 'snap': case 'snapshot':  return cmdSnap(args);
    case 'replay':                 return cmdReplay(args);
    case 'heal': case 'self-heal': return cmdHeal(args);
    case 'resilience': case 'res': return cmdResilience(args);
    case 'tools': case 'tool':     return cmdTools(args);
    case 'contract':               return cmdContract(args);

    case 'cortex':                 return cmdCortex(args);
    case 'guardian':               return cmdGuardian(args);
    case 'bridge':                 return cmdBridge(args);
    case 'idearium':               return cmdIdearium(args);
    case 'ollama':                 return cmdOllama(args);

    case 'requests': case 'req':   return cmdBridge(['requests',...args]);
    case 'diagnose': case 'diag':  return cmdDiagnose(args);
    case 'ui':                     return cmdUI();
    case 'help': case '?':         return cmdHelp(args);

    default: {
      // Try guardian /cli/exec fallback
      try {
        const r = await POST(PORTS.guardian, '/cli/exec', { command:line.trim(), source:'repl' });
        if (r?.data?.result) {
          const result = r.data.result;
          if (Array.isArray(result.jobs))        printTable('jobs',      result.jobs,        ['id','provider','command','status','ts']);
          else if (Array.isArray(result.artifacts)) printTable('artifacts',result.artifacts, ['hash','name','lang','ts']);
          else if (Array.isArray(result.gaps))   printTable('gaps',      result.gaps,        ['type','domain','description','score']);
          else if (Array.isArray(result.sessions)) printTable('sessions',result.sessions,    ['name','provider','ts']);
          else if (Array.isArray(result.ledger)) printTable('ledger',    result.ledger,      ['category','msg','ts']);
          else console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (r?.data?.error) { console.log(err(r.data.error)); return; }
      } catch(_) {}
      console.log(`${$(C.red,'?')} unknown: ${cmd} — type ${$(C.cyan,'help')}`);
    }
  }
}

// ── Resilience command ────────────────────────────────────────────────────────
async function cmdResilience(args) {
  const sub = args[0] || 'status';

  if (sub === 'status') {
    const d = await GET(PORTS.cortex, '/api/resilience/status');
    if (!d.ok) { console.log(err('Cortex offline')); return; }
    const r = d.data || {};
    console.log(hdr('RESILIENCE ENGINE'));
    const summary = r.summary || {};
    console.log(row('success',   summary.success || 0));
    console.log(row('failed',    summary.failed  || 0));
    console.log(row('skipped',   summary.skipped || 0));
    console.log(row('pending',   summary.pending || 0));
    console.log(row('AI in-flight', r.aiInFlight || 0));
    if (r.log?.length) {
      console.log(`
  ${$(C.dim,'Recent strategy attempts:')}`);
      for (const l of r.log.slice(0, 10)) {
        const ts = new Date(l.ts||0).toTimeString().slice(0,8);
        const sc = l.result==='success'?C.green:l.result==='failed'?C.red:C.dim;
        console.log(`  ${$(C.dim,ts)}  ${$(sc,(l.result||'?').padEnd(10))}  ${$(C.cyan,(l.strategy||'?').padEnd(22))}  ${(l.detail||'').slice(0,45)}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'run') {
    const gapUuid = args[1];
    const strategy = args[2]; // optional: auto_fix|diagnose|ollama|claude|chatgpt|escalate
    if (!gapUuid) { console.log(err('Usage: resilience run <gapUuid> [strategy]')); return; }
    console.log(inf(`running resilience${strategy?' strategy '+strategy:' chain'} on ${gapUuid.slice(0,8)}…`));
    const d = await POST(PORTS.cortex, '/api/resilience/run', { gapUuid, strategy });
    if (!d.ok) { console.log(err(d.data?.error||'failed')); return; }
    if (d.data?.result) {
      const r = d.data.result;
      console.log(r.ok ? ok(`strategy ${d.data.strategy}: ${r.detail||r.reason||'success'}`) : err(`strategy ${d.data.strategy} failed: ${r.reason||r.error||'unknown'}`));
    } else {
      console.log(inf(d.data?.message||'queued'));
    }
    return;
  }

  if (sub === 'chain') {
    console.log(hdr('RESILIENCE STRATEGY CHAIN'));
    const chain = [
      ['1', 'auto_fix',        'Deterministic: restart stuck calls, resolve false positives'],
      ['2', 'diagnose',        'Run cli/diagnose.js --fix targeted at the failing system'],
      ['3', 'ollama_forge',    'Local AI: Ollama patches the failing module source (LAW_I)'],
      ['4', 'guardian_claude', 'Guardian AI: outsource to Claude via running userscript tab'],
      ['5', 'guardian_chatgpt','Guardian AI: outsource to ChatGPT via running userscript tab'],
      ['6', 'escalate',        'Human required: full context written to gap, all strategies logged'],
    ];
    for (const [n, name, desc] of chain)
      console.log(`  ${$(C.dim,n+'.')}  ${$(C.cyan,name.padEnd(22))}  ${$(C.dim,desc)}`);
    console.log('');
    return;
  }

  console.log(err(`unknown resilience command: ${sub}`));
  console.log(inf('Commands: status  run <gapUuid> [strategy]  chain'));
}

// Missing function stubs referenced in dispatch
async function cmdSNR() {
  return gate('snr', async () => {
    const d = await GET(PORTS.orchestrator, '/api/idearium/snr');
    if (!d.ok) { console.log(err('Idearium offline')); return; }
    const snr = d.data.snr||0;
    const col = snr>0.8?C.green:snr>0.5?C.yellow:C.red;
    const bar = '█'.repeat(Math.round(snr*30))+'░'.repeat(30-Math.round(snr*30));
    console.log(`\n  ${$(col,bar)}  ${$(col,(snr*100).toFixed(1)+'% SNR')}\n`);
  });
}
async function cmdPush(args) {
  const msg = args.join(' ')||'manual push';
  return gate('push', async () => {
    const d = await POST(PORTS.orchestrator, '/api/idearium/snapshots', { message:msg });
    if (!d.ok) { console.log(err('Idearium offline')); return; }
    console.log(ok(`Snapshot pushed: ${msg.slice(0,50)}`));
  });
}
async function cmdDiagnose(args) {
  const sys = args[0]||'';
  const { spawnSync } = require('child_process');
  spawnSync('node', ['cli/diagnose.js',...(sys?[sys]:[])],
    { cwd:path.join(__dirname,'..'), stdio:'inherit', encoding:'utf8' });
}
async function cmdUI() {
  const { exec } = require('child_process');
  const url = `http://localhost:${PORTS.orchestrator}`;
  for (const cmd of [`start ${url}`,`open ${url}`,`xdg-open ${url}`]) {
    try { exec(cmd); console.log(ok(`Opening ${url}`)); return; } catch(_) {}
  }
  console.log(`${$(C.dim,'Open manually:')} ${url}`);
}

// ── Background guardian SSE stream ────────────────────────────────────────────
function startGuardianStream() {
  const r = http.get({
    hostname:'127.0.0.1', port:7820,
    path:'/events', headers:{ Accept:'text/event-stream' },
  }, res => {
    if (res.statusCode!==200) return;
    let buf = '';
    res.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const msg = JSON.parse(line.slice(5).trim());
          if (msg.type==='CLI_RESULT' && msg.source!=='repl') {
            process.stdout.write('\r'+$(C.dim,'[ui] ')+$(C.cyan,msg.command)+'\n');
          } else if (msg.type?.startsWith('guardian.job.')) {
            const label = msg.type.replace('guardian.job.','');
            process.stdout.write('\r'+$(C.dim,'[job] ')+$(C.yellow,label)+' '+$(C.dim,(msg.jobId||'').slice(0,8)+' '+(msg.provider||''))+'\n');
          }
        } catch(_) {}
      }
    });
    res.on('error',()=>{});
  });
  r.on('error',()=>{});
  r.setTimeout(0);
}

// ── REPL ──────────────────────────────────────────────────────────────────────
const HISTORY = [];

function startRepl() {
  const rl = readline.createInterface({
    input:process.stdin, output:process.stdout,
    prompt:`${C.green}nexus${C.reset}${C.dim}>${C.reset} `,
    history:HISTORY, historySize:500, terminal:true,
  });

  console.clear();
  console.log(`${$(C.bold+C.green,'⬡  NEXUS CLI REPL')}  v2.0  ${$(C.dim,'type help for commands')}\n`);
  console.log(`${$(C.dim,'orchestrator: http://localhost:'+PORTS.orchestrator)}\n`);

  cmdStatus().then(()=>rl.prompt()).catch(()=>rl.prompt());

  rl.on('line', async line => {
    if (line.trim()) HISTORY.unshift(line.trim());
    try { await dispatch(line.trim()); }
    catch (e) { console.log(err(e.message)); }
    rl.prompt();
  });

  rl.on('close',  ()=>process.exit(0));
  rl.on('SIGINT', ()=>{ console.log(''); rl.prompt(); });
}

// ── Entry ─────────────────────────────────────────────────────────────────────
if (process.argv.includes('--repl') || process.stdin.isTTY) {
  startGuardianStream();
  startRepl();
} else {
  const cmd = process.argv.slice(2).filter(a=>!a.startsWith('--')).join(' ');
  if (cmd) {
    dispatch(cmd).then(()=>process.exit(0)).catch(e=>{ console.error(e.message); process.exit(1); });
  } else {
    startRepl();
  }
}
