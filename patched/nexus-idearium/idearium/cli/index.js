#!/usr/bin/env node
'use strict';
// ── idearium/cli/index.js ─────────────────────────────────────────────────────
// UUID: idearium-cli-v1-0000-4000-0000-000000000003
// VERSION: 1.0.0 — §5.4
//
// LAW V: Every feature exists as a CLI command before it exists as UI.
// Every command: emits JAA event_log row → structured stdout → toast on fail.
// No silent success. No silent failure. §1.2 enforced at every exit point.
//
// Usage: node idearium [command] [args...] [--flags]
// Or:    idearium [command] [args...] [--flags]   (if installed globally)
//
// API is at http://127.0.0.1:4800 — CLI can talk to running server OR
// operate standalone against the same .idearium/ data directory.

const path = require('path');
const http = require('http');

const API_URL  = `http://127.0.0.1:${process.env.IDEARIUM_PORT || 4800}`;
const DATA_DIR = process.env.IDEARIUM_DATA || path.join(process.cwd(), '.idearium');

// ── ANSI colors ───────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',  bold:   '\x1b[1m',  dim:    '\x1b[2m',
  red:    '\x1b[31m', green:  '\x1b[32m', yellow: '\x1b[33m',
  blue:   '\x1b[34m', cyan:   '\x1b[36m', magenta:'\x1b[35m', white: '\x1b[37m', gray: '\x1b[90m',
};
const c  = (col, t) => `${C[col]||''}${t}${C.reset}`;
const ok = (m) => console.log(`${c('green','✓')} ${m}`);
const er = (m) => console.error(`${c('red','✗')} ${m}`);
const in_ = (m) => console.log(`${c('blue','i')} ${m}`);
const wa = (m) => console.log(`${c('yellow','⚠')} ${m}`);

function fmt(s) {
  const now = new Date();
  const ts  = `[${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}]`;
  return `${c('gray',ts)} ${s}`;
}

function tensionBar(score, width = 20) {
  const filled = Math.round((score||0) * width);
  const bar    = '█'.repeat(filled) + '░'.repeat(width - filled);
  const col    = score > 0.7 ? 'red' : score > 0.4 ? 'yellow' : 'green';
  return `${c(col, bar)} ${c('gray', Math.round((score||0)*100)+'%')}`;
}

function phaseColor(phase) {
  const map = { seed:'gray', expanding:'blue', tensioned:'yellow', specced:'cyan', building:'magenta', complete:'green', archived:'dim' };
  return c(map[phase]||'white', phase);
}

// ── HTTP client (talks to running API server) ─────────────────────────────────
async function api(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts    = {
      hostname: '127.0.0.1',
      port:     parseInt(process.env.IDEARIUM_PORT || '4800'),
      path:     endpoint,
      method,
      headers:  {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...(process.env.IDEARIUM_TOKEN ? { Authorization: `Bearer ${process.env.IDEARIUM_TOKEN}` } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ ok: false, error: raw }); }
      });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('API timeout — is idearium server running? (node idearium/api)')) });
    req.on('error', (e) => reject(new Error(`API unreachable: ${e.message} — start with: node idearium/api`)));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Standalone mode fallback (direct JAA access) ──────────────────────────────
function loadStandalone() {
  const { IdeaOS } = require('../core');
  const os = new IdeaOS({ dataDir: DATA_DIR });
  os.open();
  return os;
}

// ── COMMANDS ──────────────────────────────────────────────────────────────────

async function cmdIdeaAdd(args, flags) {
  const text = args.join(' ');
  if (!text) { er('§1.2 idea add: text required. Usage: idearium idea add "my idea"'); process.exit(1); }
  const tags = flags.tag ? (Array.isArray(flags.tag) ? flags.tag : [flags.tag]) : [];
  const data = await api('POST', '/api/ideas', { text, tags, causedBy: null });
  if (!data.ok) { er(`idea.create failed: ${data.error}`); process.exit(1); }
  console.log(fmt(`${c('green','IDEA CREATED')}  ${c('cyan', data.idea.uuid.slice(0,8))}  ${data.idea.text}`));
  if (tags.length) console.log(fmt(`tags: ${tags.map(t=>c('magenta',t)).join(', ')}`));
  ok(`nexus idea show ${data.idea.uuid} — to view detail`);
}

async function cmdIdeaList(args, flags) {
  const phase = flags.phase;
  const tag   = flags.tag;
  const sort  = flags.sort || 'tension';
  const data  = await api('GET', `/api/ideas?sort=${sort}${phase?`&phase=${phase}`:''}${tag?`&tag=${tag}`:''}`);
  if (!data.ok) { er(data.error); process.exit(1); }
  const ideas = data.ideas;
  if (!ideas.length) { in_('No ideas found'); return; }
  console.log(fmt(`${c('bold',`${ideas.length} ideas`)} sorted by ${sort}`));
  console.log('');
  for (const idea of ideas) {
    const tension = flags.bare ? '' : `  ${tensionBar(idea.tension, 15)}`;
    const spec    = idea.linkedSpec ? c('cyan', ' [spec]') : '';
    const gaps    = idea.openGaps?.length ? c('red', ` [${idea.openGaps.length} gaps]`) : '';
    console.log(`  ${c('gray',idea.uuid.slice(0,8))}  ${phaseColor(idea.phase).padEnd(20)}  ${idea.text.slice(0,55).padEnd(56)}${tension}${spec}${gaps}`);
  }
}

async function cmdIdeaShow(args, flags) {
  const uuid = args[0];
  if (!uuid) { er('idea show: uuid required'); process.exit(1); }
  const data = await api('GET', `/api/ideas/${uuid}`);
  if (!data.ok) { er(data.error); process.exit(1); }
  const i = data.idea;
  console.log('');
  console.log(`  ${c('bold', i.text)}`);
  console.log(`  ${c('gray','uuid:')}      ${i.uuid}`);
  console.log(`  ${c('gray','phase:')}     ${phaseColor(i.phase)}`);
  console.log(`  ${c('gray','tension:')}   ${tensionBar(i.tension)}`);
  console.log(`  ${c('gray','tags:')}      ${(i.tags||[]).map(t=>c('magenta',t)).join(', ')||'—'}`);
  console.log(`  ${c('gray','spec:')}      ${i.linkedSpec ? c('cyan',i.linkedSpec.slice(0,8)) : '—'}`);
  console.log(`  ${c('gray','open gaps:')} ${i.openGaps?.length ? c('red',i.openGaps.length) : c('green','0')}`);
  console.log(`  ${c('gray','links:')}     resonance=${i.resonanceWith?.length||0} tension=${i.tensionWith?.length||0}`);
  console.log(`  ${c('gray','created:')}   ${new Date(i.createdAt).toISOString()}`);
  if (i.openGaps?.length) {
    console.log('');
    console.log(`  ${c('red','OPEN GAPS:')}`);
    const gapData = await api('GET', `/api/gaps?status=open`);
    if (gapData.ok) {
      for (const g of gapData.gaps.filter(g => i.openGaps.includes(g.uuid))) {
        console.log(`    ${c('red','•')} [${g.severity}] ${g.description}`);
      }
    }
  }
  console.log('');
}

async function cmdIdeaTension(args, flags) {
  const uuid = args[0];
  if (!uuid) { er('idea tension: uuid required'); process.exit(1); }
  const data = await api('POST', `/api/ideas/${uuid}/tension`);
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${c('yellow','TENSION SCORED')}  ${uuid.slice(0,8)}  ${tensionBar(data.tension)}`));
  const comp = data.components || {};
  for (const [k,v] of Object.entries(comp)) {
    console.log(`  ${c('gray',k.padEnd(20))} ${tensionBar(v, 12)}`);
  }
}

async function cmdIdeaLink(args, flags) {
  const [uuidA, uuidB] = args;
  if (!uuidA || !uuidB) { er('idea link: two uuids required'); process.exit(1); }
  const type = flags.type || 'resonance';
  const data = await api('POST', `/api/ideas/${uuidA}/link`, { targetUuid: uuidB, type });
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${c('cyan','LINKED')}  ${uuidA.slice(0,8)} —[${type}]→ ${uuidB.slice(0,8)}`));
}

async function cmdSpecNew(args, flags) {
  const ideaUuid = args[0];
  if (!ideaUuid) { er('spec new: idea uuid required'); process.exit(1); }
  const data = await api('POST', `/api/ideas/${ideaUuid}/spec`);
  if (!data.ok) { er(data.error); process.exit(1); }
  const s = data.spec;
  console.log(fmt(`${c('cyan','SPEC CREATED')}  ${c('cyan',s.uuid.slice(0,8))}  ${s.name}`));
  console.log(fmt(`  ${s.sections.length} sections · ${s.sections.filter(s=>s.required).length} required`));
  ok(`nexus spec show ${s.uuid} — to view spec`);
  ok(`nexus spec check ${s.uuid} — to run checklist`);
}

async function cmdSpecShow(args, flags) {
  const uuid = args[0];
  if (!uuid) { er('spec show: uuid required'); process.exit(1); }
  const data = await api('GET', `/api/specs/${uuid}`);
  if (!data.ok) { er(data.error); process.exit(1); }
  const s = data.spec;
  console.log('');
  console.log(`  ${c('bold',s.name)}  ${c('gray',`v${s.version}`)}  ${phaseColor(s.phase)}`);
  console.log(`  ${c('gray','uuid:')} ${s.uuid}`);
  console.log('');
  for (const sec of s.sections) {
    const done = sec.checklist.filter(c=>c.done).length;
    const total = sec.checklist.length;
    const bar = `[${done}/${total}]`;
    const complete = done === total;
    console.log(`  ${complete ? c('green','✓') : c('yellow','○')} ${sec.title.padEnd(30)} ${c('gray',bar)}`);
    if (!complete && flags.verbose) {
      for (const item of sec.checklist.filter(c => !c.done)) {
        console.log(`      ${c('red','•')} ${item.label}`);
      }
    }
  }
  const wired = s.wired || {};
  console.log('');
  console.log(`  ${c('gray','WIRING:')} cli:${wired.cli?c('green','✓'):c('red','✗')} jaa:${wired.jaa?c('green','✓'):c('red','✗')} toast:${wired.toast?c('green','✓'):c('red','✗')} schema:${wired.schemaValidated?c('green','✓'):c('red','✗')}`);
  console.log('');
}

async function cmdSpecCheck(args, flags) {
  const uuid = args[0];
  if (!uuid) { er('spec check: uuid required'); process.exit(1); }
  const data = await api('POST', `/api/specs/${uuid}/check`);
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${data.complete ? c('green','SPEC COMPLETE') : c('yellow','SPEC INCOMPLETE')}  ${uuid.slice(0,8)}  ${Math.round(data.score*100)}%`));
  if (data.missing?.length) {
    console.log(`  ${c('red','Missing:')}`);
    for (const m of data.missing) {
      console.log(`    ${c('red','•')} [${m.section}] ${m.label}`);
    }
  } else {
    ok('All required checklist items complete');
  }
}

async function cmdSpecBuild(args, flags) {
  const uuid = args[0];
  if (!uuid) { er('spec build: uuid required'); process.exit(1); }
  const data = await api('POST', `/api/specs/${uuid}/build`);
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${data.ci?.ok ? c('green','CI PASS') : c('red','CI FAIL')}  ${uuid.slice(0,8)}  ${data.ci?.passed}/${data.ci?.total}`));
  if (!data.ci?.ok) {
    for (const check of (data.ci?.checks||[]).filter(c => !c.pass)) {
      console.log(`  ${c('red','FAIL')} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
    }
  }
}

async function cmdGapList(args, flags) {
  const status   = flags.status || 'open';
  const severity = flags.severity;
  const data = await api('GET', `/api/gaps?status=${status}${severity?`&severity=${severity}`:''}`);
  if (!data.ok) { er(data.error); process.exit(1); }
  const gaps = data.gaps;
  if (!gaps.length) { ok(`No ${status} gaps`); return; }
  console.log(fmt(`${c('bold',`${gaps.length} ${status} gaps`)}`));
  for (const g of gaps) {
    const col = g.severity === 'high' || g.severity === 'fatal' ? 'red' : g.severity === 'medium' ? 'yellow' : 'gray';
    console.log(`  ${c(col,`[${g.severity}]`).padEnd(20)} ${g.description.slice(0,70)}`);
  }
}

async function cmdGapCreate(args, flags) {
  const description = args.join(' ');
  if (!description) { er('gap create: description required'); process.exit(1); }
  const data = await api('POST', '/api/gaps', { description, severity: flags.severity || 'medium', ideaUuid: flags.idea });
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${c('red','GAP CREATED')}  ${data.gap.uuid.slice(0,8)}  ${description.slice(0,60)}`));
}

async function cmdGapResolve(args, flags) {
  const uuid = args[0];
  if (!uuid) { er('gap resolve: uuid required'); process.exit(1); }
  const resolution = flags.resolution || args.slice(1).join(' ') || '';
  const data = await api('POST', `/api/gaps/${uuid}/resolve`, { resolution });
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${c('green','GAP RESOLVED')}  ${uuid.slice(0,8)}`));
}

async function cmdPush(args, flags) {
  const message = args.join(' ') || flags.m || '';
  const data = await api('POST', '/api/snapshots', { message });
  if (!data.ok) { er(data.error); process.exit(1); }
  const s = data.snapshot;
  console.log(fmt(`${c('cyan','PUSH')}  ${c('bold',s.hash.slice(0,8))}  "${s.message||'no message'}"`));
  console.log(`  ${c('gray','ideas:')} ${s.ideaCount}  ${c('gray','specs:')} ${s.specCount}  ${c('gray','gaps:')} ${s.gapCount}  ${c('gray','snr:')} ${(s.snr||0).toFixed(2)}`);
  ok(`${s.hash.slice(0,8)} — snapshot committed`);
}

async function cmdPull(args, flags) {
  // List snapshots and optionally restore
  const data = await api('GET', '/api/snapshots');
  if (!data.ok) { er(data.error); process.exit(1); }
  const snaps = data.snapshots;
  if (!snaps.length) { in_('No snapshots yet — use: idearium push "message"'); return; }
  console.log(fmt(`${c('bold',`${snaps.length} snapshots`)}`));
  for (const s of snaps.slice(-10).reverse()) {
    const d = new Date(s.ts).toISOString().slice(0,19).replace('T',' ');
    console.log(`  ${c('cyan',s.hash.slice(0,8))}  ${c('gray',d)}  ideas:${s.ideaCount} gaps:${s.gapCount}  "${(s.message||'').slice(0,40)}"`);
  }
}

async function cmdDiff(args, flags) {
  const [a, b] = args;
  if (!a || !b) { er('diff: two snapshot uuids required'); process.exit(1); }
  const data = await api('GET', `/api/snapshots/${a}/diff/${b}`);
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${c('bold','DIFF')}  ${a.slice(0,8)} → ${b.slice(0,8)}`));
  console.log(`  ${c('green','ideas added:')}   ${data.ideas.added}`);
  console.log(`  ${c('red','ideas removed:')} ${data.ideas.removed}`);
  console.log(`  ${c('yellow','ideas changed:')} ${data.ideas.changed}`);
  console.log(`  ${c('gray','gap delta:')}     ${data.gaps.delta > 0 ? c('red','+'+data.gaps.delta) : c('green',data.gaps.delta)}`);
  console.log(`  ${c('gray','snr delta:')}     ${(data.snr.delta||0) > 0 ? c('green','+'+data.snr.delta.toFixed(3)) : c('red',data.snr.delta?.toFixed(3))}`);
}

async function cmdCI(args, flags) {
  const uuid = args[0];
  if (!uuid) { er('ci: spec uuid required'); process.exit(1); }
  const data = await api('POST', '/api/ci/run', { specUuid: uuid });
  if (!data.ok) { er(data.error); process.exit(1); }
  const r = data;
  console.log(fmt(`${r.ok ? c('green','CI PASS ✓') : c('red','CI FAIL ✗')}  ${uuid.slice(0,8)}  ${r.passed}/${r.total} checks`));
  for (const check of r.checks || []) {
    const icon = check.pass ? c('green','✓') : c('red','✗');
    console.log(`  ${icon} ${check.label.padEnd(40)} ${c('gray', check.detail||'')}`);
  }
  if (!r.ok) process.exit(1);
}

async function cmdStatus(args, flags) {
  const data = await api('GET', '/api/stats');
  if (!data.ok) { er(`API unreachable — start with: node idearium/api`); process.exit(1); }
  console.log(fmt(`${c('bold','IDEARIUM')} v${data.version}`));
  console.log(`  ${c('gray','ideas:')}     ${data.ideas}  (${Object.entries(data.byPhase||{}).map(([k,v]) => v>0?`${k}:${v}`:'').filter(Boolean).join(' ')})`);
  console.log(`  ${c('gray','specs:')}     ${data.specs}`);
  console.log(`  ${c('gray','open gaps:')} ${data.openGaps ? c('red', data.openGaps) : c('green','0')}`);
  console.log(`  ${c('gray','snapshots:')} ${data.snapshots}`);
  if (data.snr) {
    console.log(`  ${c('gray','SNR:')}       ${tensionBar(data.snr.ratio||0, 12)}  (signal:${data.snr.signal} noise:${data.snr.noise})`);
  }
}

async function cmdSNR(args, flags) {
  const data = await api('GET', '/api/snr');
  if (!data.ok) { er(data.error); process.exit(1); }
  const snr = data.snr;
  console.log(fmt(`${c('bold','SNR')}  ratio: ${tensionBar(snr.ratio||0)} signal:${snr.signal} noise:${snr.noise} events:${snr.events}`));
}

async function cmdAgents(args, flags) {
  const data = await api('GET', '/api/agents');
  if (!data.ok) { er(data.error); process.exit(1); }
  if (!data.guardianConnected) { wa('Guardian not connected — start Guardian v8'); return; }
  console.log(fmt(`${c('bold','AGENTS')}  ${data.agents.length} connected`));
  for (const a of data.agents) {
    console.log(`  ${c('green','●')} ${a.name.padEnd(30)} ${c('gray',a.id)}`);
  }
}

async function cmdDispatch(args, flags) {
  const [agentId, ...rest] = args;
  const prompt = rest.join(' ') || flags.prompt;
  if (!agentId || !prompt) { er('dispatch: agentId and prompt required'); process.exit(1); }
  console.log(fmt(`${c('yellow','→')} dispatching to ${agentId}...`));
  const data = await api('POST', `/api/agents/${agentId}/dispatch`, { service: agentId.replace('guardian-',''), prompt });
  if (!data.ok) { er(data.error); process.exit(1); }
  console.log(fmt(`${c('green','←')} ${(data.result?.content||'').slice(0,200)}`));
}

async function cmdHelp() {
  console.log(`
${c('bold','IDEARIUM v1.0.0')} — The Idea OS
${c('gray','CLI-first. Everything that exists in UI exists here first. (LAW V)')}

${c('cyan','IDEA COMMANDS')}
  idea add <text> [--tag <tag>]     Create new idea
  idea list [--phase] [--sort]      List ideas by tension/phase/date
  idea show <uuid>                  Full idea detail + gaps + links
  idea tension <uuid>               Recompute tension score
  idea link <uuidA> <uuidB> [--type resonance|tension|causal|semantic]
  idea archive <uuid> [--reason]    Archive idea (§M1 — not deleted)

${c('cyan','SPEC COMMANDS')}
  spec new <idea-uuid>              Create spec from idea
  spec show <uuid> [--verbose]      Show spec with checklist
  spec check <uuid>                 Run spec compliance checklist
  spec build <uuid>                 Run CI gate on spec

${c('cyan','GAP COMMANDS')}
  gap list [--status open] [--severity high]
  gap create <description> [--severity medium] [--idea <uuid>]
  gap resolve <uuid> [--resolution <text>]

${c('cyan','VORTEX (PUSH/PULL)')}
  push [message]                    Snapshot current state (commit)
  pull                              List snapshots
  diff <snapA> <snapB>              Diff two snapshots
  ci <spec-uuid>                    Run CI spec gate

${c('cyan','SYSTEM')}
  status                            System health + stats
  snr                               Signal-to-noise ratio
  agents                            List connected Guardian agents
  dispatch <agent-id> <prompt>      Dispatch to Guardian agent

${c('gray','Environment:')}
  IDEARIUM_PORT   API port (default 4800)
  IDEARIUM_DATA   Data directory (default .idearium/)
  IDEARIUM_TOKEN  Auth token (optional)
  GUARDIAN_IPC_TOKEN  Guardian IPC token (optional)
`);
}

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args  = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
      if (flags[key] !== undefined) {
        flags[key] = Array.isArray(flags[key]) ? [...flags[key], val] : [flags[key], val];
      } else {
        flags[key] = val;
      }
    } else {
      args.push(argv[i]);
    }
  }
  return { args, flags };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv    = process.argv.slice(2);
  const { args, flags } = parseArgs(argv);
  const [cmd, sub, ...rest] = args;

  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return cmdHelp();
    if (cmd === 'status')                  return cmdStatus(rest, flags);
    if (cmd === 'snr')                     return cmdSNR(rest, flags);
    if (cmd === 'agents')                  return cmdAgents(rest, flags);
    if (cmd === 'dispatch')                return cmdDispatch([sub, ...rest], flags);
    if (cmd === 'push')                    return cmdPush([sub, ...rest], flags);
    if (cmd === 'pull')                    return cmdPull(rest, flags);
    if (cmd === 'diff')                    return cmdDiff([sub, ...rest], flags);
    if (cmd === 'ci')                      return cmdCI([sub, ...rest], flags);

    if (cmd === 'idea') {
      if (sub === 'add')                   return cmdIdeaAdd(rest, flags);
      if (sub === 'list')                  return cmdIdeaList(rest, flags);
      if (sub === 'show')                  return cmdIdeaShow(rest, flags);
      if (sub === 'tension')               return cmdIdeaTension(rest, flags);
      if (sub === 'link')                  return cmdIdeaLink(rest, flags);
      if (sub === 'archive')               return api('DELETE', `/api/ideas/${rest[0]}`, flags).then(d => d.ok ? ok('archived') : er(d.error));
    }

    if (cmd === 'spec') {
      if (sub === 'new')                   return cmdSpecNew(rest, flags);
      if (sub === 'show')                  return cmdSpecShow(rest, flags);
      if (sub === 'check')                 return cmdSpecCheck(rest, flags);
      if (sub === 'build')                 return cmdSpecBuild(rest, flags);
    }

    if (cmd === 'gap') {
      if (sub === 'list')                  return cmdGapList(rest, flags);
      if (sub === 'create')                return cmdGapCreate(rest, flags);
      if (sub === 'resolve')               return cmdGapResolve(rest, flags);
    }

    er(`Unknown command: ${cmd} ${sub||''}. Run: idearium help`);
    process.exit(1);

  } catch (err) {
    er(`§1.2 command failed: ${err.message}`);
    if (flags.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
