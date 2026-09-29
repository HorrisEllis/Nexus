#!/usr/bin/env node
'use strict';
// ── core/cortex-v2.js ─────────────────────────────────────────────────────────
// CORTEX v2 — full NEXUS CLI
// Extends cortex.js (v5) with the complete spec-defined command surface.
//
// Architecture: all commands hit the admin server via HTTP (LAW V: CLI-first,
// UI is a reflection). Direct JAA reads would require boot.js in-process.
// Cortex v2 is a standalone process that talks to a running NEXUS stack.
//
// Usage:
//   node cortex-v2.js                        # interactive REPL
//   node cortex-v2.js <command> [args...]    # one-shot
//
// Commands (full surface):
//   ── System ──
//   status                                   system health + JAA table counts
//   tail [table] [n]                         tail any JAA table
//   watch <table>                            live tail (SSE stream)
//   diag                                     full system diagnostic
//
//   ── Queries ──
//   ask <prompt>                             submit prompt, wait for response
//   ask-full <prompt>                        ask: hits crystals + memory + cortex
//
//   ── Gaps ──
//   gaps [--severity high|medium|low]        open gaps with filter
//   gap show <uuid>                          full gap detail
//
//   ── Memory ──
//   memory search <query>                    search memory_index by term
//   memory cortex <query>                    search cortex_memory by term
//   memory forget <uuid>                     soft-delete (tier: forgotten)
//   memory tail [n]                          last N cortex_memory entries
//
//   ── Crystals ──
//   crystal list [--state stable|candidate|decaying]
//   crystal show <uuid>
//   crystal search <term>
//
//   ── Seams ──
//   seam list [--verified] [--n 20]
//   seam show <uuid>
//
//   ── Intents ──
//   intent list [--n 20] [--sort callCount|successRate|surpriseScore]
//   intent show <uuid>
//   intent search <term>
//   intent unresolved
//
//   ── BEP ──
//   bep list [--layer <layer>] [--n 20]
//   bep show <uuid>
//   bep contradictions [--n 10]
//
//   ── Lattice ──
//   lattice status
//   lattice search <term>
//   lattice patterns [--n 20]
//
//   ── Orion ──
//   orion list [--status verified|pending|rejected] [--n 20]
//   orion show <uuid>
//
//   ── Self ──
//   self                                     current self-model snapshot
//   self constraints
//   self questions
//
//   ── Callto ──
//   callto status [--n 20]
//   callto show <uuid>
//   callto dispatch <agent> <prompt> [--parallel]
//
//   ── Versionium ──
//   versionium status
//   versionium log [n]
//   versionium chain <uuid>
//
//   ── Guardian ──
//   guardian status
//   guardian nodes
//
//   ── Failures ──
//   failures [n]
//
//   ── Help ──
//   help [command]

const readline = require('readline');
const http     = require('http');
const crypto   = require('crypto');

const PORT = parseInt(process.env.NEXUS_PORT || '3748');
const BASE = `http://127.0.0.1:${PORT}`;
// versionium is its own sovereign system (:3754). The CLI used to read its tables through cortex's
// /api/memory, which returned {ok,table,rows} while the CLI expected a bare array, so `versionium
// status|log` always said "No commits". It now asks versionium directly.
const VERSIONIUM_BASE = `http://127.0.0.1:${parseInt(process.env.VERSIONIUM_PORT || '3754', 10)}`;

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  teal:   '\x1b[36m',
  purple: '\x1b[35m',
  grey:   '\x1b[90m',
  white:  '\x1b[97m',
};

function c(color, text) { return `${C[color] ?? ''}${text}${C.reset}`; }
function bold(t)  { return c('bold', t); }
function dim(t)   { return c('dim', t); }
function ok(t)    { return c('green', '✓') + '  ' + t; }
function err(t)   { return c('red', '✗') + '  ' + t; }
function warn(t)  { return c('yellow', '⚠') + '  ' + t; }
function info(t)  { return c('cyan', '→') + '  ' + t; }
function dot(sev) {
  if (sev === 'high' || sev === 'fatal') return c('red', '●');
  if (sev === 'medium') return c('yellow', '○');
  return c('grey', '·');
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function get(path, base = BASE) {
  return new Promise((resolve, reject) => {
    http.get(base + path, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try   { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    }).on('error', reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = http.request({
      host: '127.0.0.1', port: PORT, path, method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-nexus-key':    process.env.NEXUS_API_KEY || 'Nexus-James-2026-Erosmancer',
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try   { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Graceful unreachable
async function safeGet(path) {
  try { return await get(path); }
  catch (e) {
    console.error(err(`Cannot reach NEXUS on ${BASE} — is the stack running?`));
    console.error(dim(`  ${e.message}`));
    return null;
  }
}

// ── Tokenizer (spec §8.2 / lattice-index spec) ────────────────────────────────
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','shall',
  'i','you','he','she','it','we','they','what','which','who','whom','this','that',
  'these','those','am','to','of','in','for','on','with','at','by','from','up',
  'about','into','through','during','before','after','above','below','between',
  'each','all','both','few','more','most','other','some','such','no','not','only',
  'own','same','than','too','very','just','but','and','or','nor','so','yet',
  'either','neither','one','two','three','also','then','there','here','when',
  'where','why','how','its','our','their','my','your','his','her',
]);

function tokenize(text) {
  return (text || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(w => w.slice(0, 5));
}

// Term-overlap match for local filtering
function matchesQuery(row, query) {
  const stems  = tokenize(query);
  if (!stems.length) return true;
  const haystack = tokenize(
    [row.content, row.text, row.statement, row.intent, row.body, row.prompt]
      .filter(Boolean).join(' ')
  );
  return stems.some(s => haystack.includes(s));
}

// ── Format helpers ────────────────────────────────────────────────────────────
function ts(row) {
  const t = row?.ts || row?._ts || row?.createdAt || row?.promotedAt || 0;
  if (!t) return dim('--:--:--');
  return dim(new Date(t).toISOString().slice(11, 19));
}

function pad(s, n) { return String(s ?? '').padEnd(n).slice(0, n); }

function divider(label = '', width = 56) {
  const bar = '─'.repeat(width);
  return label
    ? `\n${c('grey', '── ' + label + ' ' + '─'.repeat(Math.max(0, width - label.length - 4)))}`
    : c('grey', '─'.repeat(width));
}

function confidence(n) {
  if (n == null) return dim('n/a');
  const pct = Math.round(n * 100);
  if (pct >= 80) return c('green', `${pct}%`);
  if (pct >= 50) return c('yellow', `${pct}%`);
  return c('red', `${pct}%`);
}

// ── ── ── ── ── ── COMMANDS ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

// ── status ────────────────────────────────────────────────────────────────────
async function cmdStatus() {
  const h = await safeGet('/health');
  if (!h) return;

  console.log(divider('NEXUS'));
  console.log(`  status   ${h.status === 'ok' ? c('green', h.status) : c('red', h.status)}`);
  console.log(`  uptime   ${Math.floor(h.uptime)}s`);

  if (h.jaa?.counts) {
    console.log(divider('JAA tables'));
    for (const [table, count] of Object.entries(h.jaa.counts)) {
      if (count > 0) console.log(`  ${pad(table, 28)} ${c('cyan', String(count))}`);
    }
  }

  if (h.cobalt) {
    console.log(divider('Cobalt'));
    const r = h.cobalt.registry;
    if (r) console.log(`  nodes: ${c('green', r.connected)} / ${r.total} connected`);
    const b = h.cobalt.bus;
    if (b) console.log(`  bus tick: ${b.tick}  subs: ${b.subs}`);
  }

  if (h.lastEvent) {
    console.log(divider('Last event'));
    console.log(`  ${h.lastEvent.type}  ${dim('source: ' + h.lastEvent.source)}`);
  }
  console.log('');
}

// ── tail ──────────────────────────────────────────────────────────────────────
async function cmdTail(table = 'event_log', n = 10) {
  // Use /api/memory for arbitrary tables, /api/events for event_log
  const path = table === 'event_log' ? `/api/events?n=${n}` : `/api/memory?table=${table}&n=${n}`;
  const rows = await safeGet(path);
  if (!rows) return;
  if (!Array.isArray(rows) || !rows.length) { console.log(warn(`${table} is empty\n`)); return; }
  console.log(divider(`${table} (last ${rows.length})`));
  for (const r of rows) {
    const type = r.type || r.status || r.tier || '';
    const body = r.content || r.statement || r.text || r.body || r.error || r.message || JSON.stringify(r).slice(0, 70);
    console.log(`  ${ts(r)}  ${pad(type, 22)} ${dim(String(body).slice(0, 60))}`);
  }
  console.log('');
}

// ── watch ─────────────────────────────────────────────────────────────────────
function cmdWatch(table = 'event_log') {
  console.log(info(`Watching ${table} via SSE — Ctrl+C to stop\n`));
  const req = http.get(`${BASE}/sse`, (res) => {
    res.on('data', chunk => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const row = JSON.parse(line.slice(5).trim());
          if (table !== 'event_log' && row.type && !row.type.includes(table)) continue;
          const body = row.content || row.statement || row.message || row.type || JSON.stringify(row).slice(0, 80);
          console.log(`  ${ts(row)}  ${pad(row.type || '', 24)} ${dim(String(body).slice(0, 60))}`);
        } catch {}
      }
    });
  });
  req.on('error', e => console.error(err(e.message)));
  // Never returns — user Ctrl+Cs
}

// ── diag ──────────────────────────────────────────────────────────────────────
async function cmdDiag() {
  console.log(divider('NEXUS DIAGNOSTIC'));
  const h = await safeGet('/health');
  if (!h) return;
  console.log(`  ${ok(`Admin server   ${BASE}`)}`);
  console.log(`  ${ok(`Node.js        ${process.version}`)}`);
  console.log(`  ${ok(`Uptime         ${Math.floor(h.uptime)}s`)}`);

  // Check memory tables
  const tables = ['cortex_memory', 'memory_index', 'crystals', 'gaps', 'failures',
                  'bep_patterns', 'intent_nodes', 'seam_records', 'lattice_nodes'];
  console.log(divider('JAA tables'));
  const counts = h.jaa?.counts || {};
  for (const t of tables) {
    const n = counts[t] ?? '?';
    const line = `  ${pad(t, 22)}  ${n > 0 ? c('green', String(n)) : c('grey', String(n))} rows`;
    console.log(line);
  }

  // Gaps
  const gaps = await safeGet('/api/gaps?status=pending');
  const openGaps = Array.isArray(gaps) ? gaps.filter(g => g.status === 'pending' || g.status === 'open') : [];
  console.log(divider('Gaps'));
  if (openGaps.length === 0) {
    console.log(`  ${ok('No open gaps')}`);
  } else {
    console.log(`  ${warn(`${openGaps.length} open gap(s)`)}`);
    for (const g of openGaps.slice(0, 5)) {
      console.log(`    ${dot(g.severity)} [${pad(g.severity, 6)}] ${g.type}  ${dim(g.path)}`);
    }
  }

  // Failures
  const fails = await safeGet('/api/failures');
  const recentFails = Array.isArray(fails) ? fails.slice(-5) : [];
  console.log(divider('Recent failures'));
  if (!recentFails.length) {
    console.log(`  ${ok('No recent failures')}`);
  } else {
    for (const f of recentFails) {
      console.log(`  ${ts(f)}  ${pad(f.source, 20)} ${c('red', String(f.error || '').slice(0, 60))}`);
    }
  }
  console.log('');
}

// ── ask ───────────────────────────────────────────────────────────────────────
async function cmdAsk(prompt) {
  if (!prompt) { console.error(err('usage: ask <prompt>')); return; }
  console.log(info(`Submitting: "${prompt}"`));
  const ev = await post('/api/event', {
    type:    'agent.call.requested',
    payload: { prompt, preferredAgent: 'ollama', source: 'cortex-v2' },
    source:  'cortex-v2',
  }).catch(e => { console.error(err(e.message)); return null; });
  if (!ev) return;
  console.log(dim(`  event: ${ev.uuid}`));
  console.log(dim('  polling for response (up to 35s)...\n'));

  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const events = await safeGet('/api/events?n=30');
    if (!Array.isArray(events)) continue;
    const resp = events.find(e =>
      e.type === 'agent.response.received' &&
      (e.ts || e._ts || 0) > (ev.ts || ev._ts || 0)
    );
    if (resp) {
      const mem = await safeGet('/api/memory?table=cortex_memory&n=1');
      if (Array.isArray(mem) && mem[0]) {
        console.log(divider('response'));
        console.log(`  ${mem[0].content}`);
        console.log('');
      }
      return;
    }
  }
  console.log(warn('Timed out — check Ollama is running\n'));
}

// ── ask-full ──────────────────────────────────────────────────────────────────
// Spec: hits crystals + memory_index + cortex_memory, prepends stable crystals
async function cmdAskFull(query) {
  if (!query) { console.error(err('usage: ask-full <query>')); return; }

  // 1. Pull crystals — stable first, prepend as context
  const crystalRows = await safeGet('/api/memory?table=crystals&n=50');
  const stableCrystals = (Array.isArray(crystalRows) ? crystalRows : [])
    .filter(r => r.state === 'stable' && matchesQuery(r, query))
    .slice(0, 5);

  // 2. memory_index search
  const memRows = await safeGet('/api/memory?table=memory_index&n=200');
  const memMatches = (Array.isArray(memRows) ? memRows : [])
    .filter(r => matchesQuery(r, query))
    .slice(0, 10);

  // 3. cortex_memory search
  const cortexRows = await safeGet('/api/memory?table=cortex_memory&n=200');
  const cortexMatches = (Array.isArray(cortexRows) ? cortexRows : [])
    .filter(r => matchesQuery(r, query))
    .slice(0, 10);

  // 4. Build context-enriched prompt
  let contextBlocks = [];
  if (stableCrystals.length) {
    contextBlocks.push('ESTABLISHED BELIEFS:\n' + stableCrystals.map(c => `- ${c.statement}`).join('\n'));
  }
  if (memMatches.length) {
    contextBlocks.push('RELEVANT MEMORY:\n' + memMatches.map(m => `- ${String(m.content || '').slice(0, 200)}`).join('\n'));
  }
  if (cortexMatches.length) {
    contextBlocks.push('RECENT CONTEXT:\n' + cortexMatches.map(m => `- ${String(m.content || '').slice(0, 200)}`).join('\n'));
  }

  const enrichedPrompt = contextBlocks.length
    ? contextBlocks.join('\n\n') + '\n\n---\n\n' + query
    : query;

  if (stableCrystals.length) {
    console.log(divider('crystals injected'));
    for (const cr of stableCrystals) {
      console.log(`  ${c('teal', '◆')} ${cr.statement?.slice(0, 80)}`);
    }
  }

  console.log(info(`Submitting with ${contextBlocks.length} context block(s)...\n`));

  const ev = await post('/api/event', {
    type:    'agent.call.requested',
    payload: { prompt: enrichedPrompt, preferredAgent: 'ollama', source: 'cortex-v2' },
    source:  'cortex-v2',
  }).catch(e => { console.error(err(e.message)); return null; });
  if (!ev) return;

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const events = await safeGet('/api/events?n=30');
    if (!Array.isArray(events)) continue;
    const resp = events.find(e =>
      e.type === 'agent.response.received' &&
      (e.ts || e._ts || 0) > (ev.ts || ev._ts || 0)
    );
    if (resp) {
      const mem = await safeGet('/api/memory?table=cortex_memory&n=1');
      if (Array.isArray(mem) && mem[0]) {
        console.log(divider('response'));
        console.log(`  ${mem[0].content}`);
        console.log('');
      }
      return;
    }
  }
  console.log(warn('Timed out\n'));
}

// ── gaps ──────────────────────────────────────────────────────────────────────
async function cmdGaps(flags = {}) {
  const gaps = await safeGet('/api/gaps?status=pending');
  if (!gaps) return;
  let rows = Array.isArray(gaps) ? gaps : [];
  if (flags.severity) rows = rows.filter(g => g.severity === flags.severity);
  if (!rows.length) { console.log(ok('No open gaps\n')); return; }
  console.log(divider(`Open gaps (${rows.length})`));
  for (const g of rows) {
    console.log(`  ${dot(g.severity)} ${pad(g.severity, 7)} ${pad(g.type, 22)} ${dim(g.path || '')}`);
    if (g.body) console.log(`    ${dim(String(g.body).slice(0, 90))}`);
    if (g.uuid) console.log(`    ${dim('uuid: ' + g.uuid)}`);
  }
  console.log('');
}

async function cmdGapShow(uuid) {
  if (!uuid) { console.error(err('usage: gap show <uuid>')); return; }
  const gaps = await safeGet('/api/gaps?status=pending');
  const all  = Array.isArray(gaps) ? gaps : [];
  const g = all.find(r => r.uuid === uuid || r.uuid?.startsWith(uuid));
  if (!g) { console.log(warn(`Gap not found: ${uuid}\n`)); return; }
  console.log(divider('Gap detail'));
  console.log(`  uuid:      ${g.uuid}`);
  console.log(`  type:      ${g.type}`);
  console.log(`  severity:  ${dot(g.severity)} ${g.severity}`);
  console.log(`  status:    ${g.status}`);
  console.log(`  path:      ${dim(g.path || '')}`);
  console.log(`  body:      ${g.body || ''}`);
  console.log(`  attempts:  ${g.attempts ?? 0}`);
  console.log(`  causedBy:  ${dim(g.causedBy || 'n/a')}`);
  console.log(`  created:   ${dim(new Date(g.createdAt || 0).toISOString())}`);
  console.log(`\n  ${dim('nexus gap ignore ' + g.uuid + ' --reason "..."')}`);
  console.log('');
}

// ── memory search ─────────────────────────────────────────────────────────────
async function cmdMemorySearch(query) {
  if (!query) { console.error(err('usage: memory search <query>')); return; }
  const rows = await safeGet('/api/memory?table=memory_index&n=500');
  if (!rows) return;
  const matches = (Array.isArray(rows) ? rows : [])
    .filter(r => matchesQuery(r, query))
    .slice(0, 20);
  if (!matches.length) { console.log(warn(`No matches for "${query}"\n`)); return; }
  console.log(divider(`memory_index: "${query}" (${matches.length} results)`));
  for (const r of matches) {
    const tier = r.tier ? c('cyan', pad(r.tier, 10)) : pad('', 10);
    console.log(`  ${ts(r)} ${tier} ${String(r.content || '').slice(0, 70)}`);
    if (r.tags?.length) console.log(`    ${dim(r.tags.join(', '))}`);
  }
  console.log('');
}

async function cmdMemoryCortex(query) {
  if (!query) { console.error(err('usage: memory cortex <query>')); return; }
  const rows = await safeGet('/api/memory?table=cortex_memory&n=500');
  if (!rows) return;
  const matches = (Array.isArray(rows) ? rows : [])
    .filter(r => matchesQuery(r, query))
    .slice(0, 20);
  if (!matches.length) { console.log(warn(`No matches for "${query}" in cortex_memory\n`)); return; }
  console.log(divider(`cortex_memory: "${query}" (${matches.length} results)`));
  for (const r of matches) {
    const agent = r.agent ? c('purple', pad(r.agent, 16)) : pad('', 16);
    console.log(`  ${ts(r)} ${agent} ${String(r.content || '').slice(0, 70)}`);
  }
  console.log('');
}

async function cmdMemoryForget(uuid) {
  if (!uuid) { console.error(err('usage: memory forget <uuid>')); return; }
  const res = await post('/api/memory/forget', { id: uuid })
    .catch(e => { console.error(err(e.message)); return null; });
  if (!res) return;
  if (res.ok) {
    console.log(ok(`Memory soft-deleted (tier: forgotten)  uuid: ${uuid}\n`));
  } else {
    console.log(err(`Forget failed — uuid not found: ${uuid}\n`));
  }
}

async function cmdMemoryTail(n = 10) {
  await cmdTail('cortex_memory', n);
}

// ── crystal ───────────────────────────────────────────────────────────────────
async function cmdCrystalList(flags = {}) {
  const rows = await safeGet('/api/memory?table=crystals&n=200');
  if (!rows) return;
  let crystals = Array.isArray(rows) ? rows : [];
  if (flags.state) crystals = crystals.filter(r => r.state === flags.state);
  if (!crystals.length) { console.log(warn('No crystals found\n')); return; }
  console.log(divider(`Crystals (${crystals.length})`));
  for (const cr of crystals) {
    const state = cr.state === 'stable' ? c('green', pad(cr.state, 10))
                : cr.state === 'decaying' ? c('yellow', pad(cr.state, 10))
                : pad(cr.state, 10);
    console.log(`  ${c('teal', '◆')} ${state} ${confidence(cr.confidence)} ${String(cr.statement || '').slice(0, 65)}`);
    console.log(`    ${dim('uuid: ' + cr.uuid)}`);
  }
  console.log('');
}

async function cmdCrystalShow(uuid) {
  if (!uuid) { console.error(err('usage: crystal show <uuid>')); return; }
  const rows = await safeGet('/api/memory?table=crystals&n=500');
  const cr = (Array.isArray(rows) ? rows : []).find(r => r.uuid === uuid || r.uuid?.startsWith(uuid));
  if (!cr) { console.log(warn(`Crystal not found: ${uuid}\n`)); return; }
  console.log(divider('Crystal'));
  console.log(`  uuid:              ${cr.uuid}`);
  console.log(`  statement:         ${cr.statement}`);
  console.log(`  state:             ${cr.state}`);
  console.log(`  confidence:        ${confidence(cr.confidence)}`);
  console.log(`  stability:         ${confidence(cr.stabilityScore)}`);
  console.log(`  fragility:         ${confidence(cr.fragility)}`);
  console.log(`  support count:     ${cr.supportCount ?? 0}`);
  console.log(`  cross-lane:        ${cr.crossLaneCount ?? 0} providers`);
  console.log(`  contradiction:     ${cr.contradictionScore ?? 0}`);
  console.log(`  access count:      ${cr.accessCount ?? 0}`);
  console.log(`  created:           ${dim(new Date(cr.createdAt || cr.ts || 0).toISOString())}`);
  if (cr.promotedAt) console.log(`  promoted:          ${dim(new Date(cr.promotedAt).toISOString())}`);
  if (cr.sourceUuids?.length) console.log(`  sources:           ${dim(cr.sourceUuids.join(', '))}`);
  console.log('');
}

async function cmdCrystalSearch(term) {
  if (!term) { console.error(err('usage: crystal search <term>')); return; }
  const rows = await safeGet('/api/memory?table=crystals&n=500');
  const matches = (Array.isArray(rows) ? rows : [])
    .filter(r => matchesQuery(r, term))
    .slice(0, 20);
  if (!matches.length) { console.log(warn(`No crystals match "${term}"\n`)); return; }
  console.log(divider(`Crystals matching "${term}" (${matches.length})`));
  for (const cr of matches) {
    console.log(`  ${c('teal', '◆')} [${pad(cr.state, 9)}] ${confidence(cr.confidence)} ${String(cr.statement || '').slice(0, 70)}`);
    console.log(`    ${dim('uuid: ' + cr.uuid)}`);
  }
  console.log('');
}

// ── seam ──────────────────────────────────────────────────────────────────────
async function cmdSeamList(flags = {}) {
  const n    = parseInt(flags.n || 20);
  const rows = await safeGet(`/api/memory?table=seam_records&n=${n}`);
  if (!rows) return;
  let seams = Array.isArray(rows) ? rows : [];
  if (flags.verified !== undefined) seams = seams.filter(r => r.verified === (flags.verified !== 'false'));
  if (!seams.length) { console.log(warn('No seam records found\n')); return; }
  console.log(divider(`Seam records (${seams.length})`));
  for (const s of seams) {
    const vf = s.verified ? c('green', '✓ verified') : c('grey', '  pending ');
    const cov = `${Math.round((s.agreementCoverage ?? 0) * 100)}%`;
    console.log(`  ${vf}  cov: ${pad(cov, 5)} ${s.providerA}×${s.providerB}  ${dim(s.uuid)}`);
  }
  console.log('');
}

async function cmdSeamShow(uuid) {
  if (!uuid) { console.error(err('usage: seam show <uuid>')); return; }
  const rows = await safeGet('/api/memory?table=seam_records&n=200');
  const s = (Array.isArray(rows) ? rows : []).find(r => r.uuid === uuid || r.uuid?.startsWith(uuid));
  if (!s) { console.log(warn(`Seam not found: ${uuid}\n`)); return; }
  console.log(divider('Seam'));
  console.log(`  uuid:          ${s.uuid}`);
  console.log(`  providers:     ${s.providerA} × ${s.providerB}`);
  console.log(`  coverage:      ${Math.round((s.agreementCoverage ?? 0) * 100)}%`);
  console.log(`  verified:      ${s.verified ? c('green', 'yes') : c('grey', 'no')}`);
  console.log(`  intent:        ${dim(s.intentUuid || 'n/a')}`);
  if (s.agreementZones?.length) {
    console.log(divider('Agreement zones'));
    for (const z of s.agreementZones.slice(0, 5)) {
      console.log(`  [${confidence(z.confidence)}] ${String(z.text || '').slice(0, 80)}`);
    }
  }
  if (s.disagreementZones?.length) {
    console.log(divider('Disagreement zones'));
    for (const z of s.disagreementZones.slice(0, 3)) {
      console.log(`  A: ${String(z.a || '').slice(0, 60)}`);
      console.log(`  B: ${String(z.b || '').slice(0, 60)}`);
      console.log(`  Δ: ${z.delta?.toFixed(2)}`);
    }
  }
  console.log('');
}

// ── intent ────────────────────────────────────────────────────────────────────
async function cmdIntentList(flags = {}) {
  const n    = parseInt(flags.n || 20);
  const sort = flags.sort || 'callCount';
  const rows = await safeGet(`/api/memory?table=intent_nodes&n=${n * 3}`);
  if (!rows) return;
  let nodes = Array.isArray(rows) ? rows : [];
  nodes.sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0));
  nodes = nodes.slice(0, n);
  if (!nodes.length) { console.log(warn('No intent nodes found\n')); return; }
  console.log(divider(`Intent nodes — sorted by ${sort} (${nodes.length})`));
  for (const nd of nodes) {
    const calls   = c('cyan', pad(nd.callCount, 4));
    const success = confidence(nd.successRate);
    const agent   = nd.preferredAgent ? dim(pad(nd.preferredAgent, 16)) : pad('', 16);
    console.log(`  ${calls} calls  ${success} success  ${agent}  ${String(nd.text || '').slice(0, 50)}`);
    console.log(`    ${dim('uuid: ' + nd.uuid)}`);
  }
  console.log('');
}

async function cmdIntentShow(uuid) {
  if (!uuid) { console.error(err('usage: intent show <uuid>')); return; }
  const rows = await safeGet('/api/memory?table=intent_nodes&n=500');
  const nd = (Array.isArray(rows) ? rows : []).find(r => r.uuid === uuid || r.uuid?.startsWith(uuid));
  if (!nd) { console.log(warn(`Intent node not found: ${uuid}\n`)); return; }
  console.log(divider('Intent node'));
  console.log(`  uuid:              ${nd.uuid}`);
  console.log(`  text:              ${nd.text}`);
  console.log(`  callCount:         ${nd.callCount}`);
  console.log(`  successRate:       ${confidence(nd.successRate)}`);
  console.log(`  avgSurpriseScore:  ${nd.avgSurpriseScore?.toFixed(2) ?? dim('n/a')}`);
  console.log(`  preferredAgent:    ${nd.preferredAgent ?? dim('n/a')}`);
  console.log(`  retryCount:        ${nd.retryCount ?? 0}`);
  console.log(`  multiAgent:        ${nd.multiAgent ? c('cyan', 'yes') : 'no'}`);
  if (nd.associatedCrystals?.length) {
    console.log(`  crystals:          ${nd.associatedCrystals.join(', ')}`);
  } else {
    console.log(`  crystals:          ${c('yellow', 'none — unresolved question')}`);
  }
  if (nd.tags?.length) console.log(`  tags:              ${nd.tags.join(', ')}`);
  console.log(`  lastCalled:        ${dim(nd.lastCalledAt ? new Date(nd.lastCalledAt).toISOString() : 'never')}`);
  console.log('');
}

async function cmdIntentSearch(term) {
  if (!term) { console.error(err('usage: intent search <term>')); return; }
  const rows = await safeGet('/api/memory?table=intent_nodes&n=500');
  const matches = (Array.isArray(rows) ? rows : [])
    .filter(r => matchesQuery(r, term))
    .slice(0, 20);
  if (!matches.length) { console.log(warn(`No intent nodes match "${term}"\n`)); return; }
  console.log(divider(`Intent search: "${term}" (${matches.length})`));
  for (const nd of matches) {
    console.log(`  ${c('cyan', pad(nd.callCount, 4))} calls  ${confidence(nd.successRate)}  ${String(nd.text || '').slice(0, 65)}`);
    console.log(`    ${dim('uuid: ' + nd.uuid)}`);
  }
  console.log('');
}

async function cmdIntentUnresolved() {
  const rows = await safeGet('/api/memory?table=intent_nodes&n=500');
  const unresolved = (Array.isArray(rows) ? rows : [])
    .filter(r => !r.associatedCrystals?.length);
  if (!unresolved.length) { console.log(ok('All intents have associated crystals\n')); return; }
  console.log(divider(`Unresolved intents (${unresolved.length}) — no crystallized belief`));
  for (const nd of unresolved.slice(0, 30)) {
    const calls = c('cyan', pad(nd.callCount, 4));
    console.log(`  ${calls} calls  ${String(nd.text || '').slice(0, 70)}`);
    console.log(`    ${dim('uuid: ' + nd.uuid)}`);
  }
  console.log('');
}

// ── bep ───────────────────────────────────────────────────────────────────────
async function cmdBepList(flags = {}) {
  const n    = parseInt(flags.n || 20);
  const rows = await safeGet(`/api/memory?table=bep_patterns&n=${n * 2}`);
  if (!rows) return;
  let pats = Array.isArray(rows) ? rows : [];
  if (flags.layer) pats = pats.filter(r => r.layer === flags.layer);
  pats.sort((a, b) => (b.metrics?.useCount ?? 0) - (a.metrics?.useCount ?? 0));
  pats = pats.slice(0, n);
  if (!pats.length) { console.log(warn('No BEP patterns found\n')); return; }
  console.log(divider(`BEP patterns (${pats.length})`));
  for (const p of pats) {
    const uses = c('cyan', pad(p.metrics?.useCount ?? 0, 4));
    const sr   = confidence(p.metrics?.successRate);
    const layer = dim(pad(p.layer || '', 12));
    console.log(`  ${uses} uses  ${sr}  ${layer}  ${String(p.intent || '').slice(0, 55)}`);
    console.log(`    ${dim('uuid: ' + p.uuid)}`);
  }
  console.log('');
}

async function cmdBepShow(uuid) {
  if (!uuid) { console.error(err('usage: bep show <uuid>')); return; }
  const rows = await safeGet('/api/memory?table=bep_patterns&n=500');
  const p = (Array.isArray(rows) ? rows : []).find(r => r.uuid === uuid || r.uuid?.startsWith(uuid));
  if (!p) { console.log(warn(`BEP pattern not found: ${uuid}\n`)); return; }
  console.log(divider('BEP pattern'));
  console.log(`  uuid:          ${p.uuid}`);
  console.log(`  intent:        ${p.intent}`);
  console.log(`  layer:         ${p.layer}`);
  console.log(`  successRate:   ${confidence(p.metrics?.successRate)}`);
  console.log(`  useCount:      ${p.metrics?.useCount ?? 0}`);
  console.log(`  lastUsed:      ${dim(p.metrics?.lastUsed ? new Date(p.metrics.lastUsed).toISOString() : 'never')}`);
  if (p.behaviorGraph?.steps?.length) {
    console.log(divider('Behavior graph'));
    for (const step of p.behaviorGraph.steps) {
      console.log(`  → ${step.action}  ${dim(step.result || '')}`);
    }
  }
  if (p.behaviorGraph?.invariants?.length) {
    console.log(divider('Invariants'));
    for (const inv of p.behaviorGraph.invariants) {
      console.log(`  • ${inv}`);
    }
  }
  if (p.tags?.length) console.log(`  tags:    ${p.tags.join(', ')}`);
  console.log('');
}

async function cmdBepContradictions(flags = {}) {
  const n    = parseInt(flags.n || 10);
  const rows = await safeGet(`/api/events?n=200`);
  const contradictions = (Array.isArray(rows) ? rows : [])
    .filter(r => r.type === 'bep.contradiction.detected')
    .slice(-n);
  if (!contradictions.length) { console.log(ok('No BEP contradictions detected\n')); return; }
  console.log(divider(`BEP contradictions (last ${contradictions.length})`));
  for (const ev of contradictions) {
    const p = ev.payload || {};
    console.log(`  ${ts(ev)} ${c('red', 'CONTRADICTION')}  crystal: ${dim(p.crystalUuid?.slice(0, 12) || 'n/a')}`);
    if (p.overlap?.length) console.log(`    overlap: ${p.overlap.join(', ')}`);
    if (p.noveltyVsSupport != null) console.log(`    novelty vs support: ${p.noveltyVsSupport?.toFixed(3)}`);
    console.log(`    ${dim('nexus crystal show ' + (p.crystalUuid || ''))}`);
  }
  console.log('');
}

// ── lattice ───────────────────────────────────────────────────────────────────
async function cmdLatticeStatus() {
  const [nodes, edges] = await Promise.all([
    safeGet('/api/memory?table=lattice_nodes&n=500'),
    safeGet('/api/memory?table=lattice_edges&n=500'),
  ]);
  const nodeArr = Array.isArray(nodes) ? nodes : [];
  const edgeArr = Array.isArray(edges) ? edges : [];
  console.log(divider('Lattice status'));
  console.log(`  nodes:  ${c('cyan', nodeArr.length)}`);
  console.log(`  edges:  ${c('cyan', edgeArr.length)}`);

  const topNodes = [...nodeArr].sort((a, b) => (b.termCount ?? 0) - (a.termCount ?? 0)).slice(0, 10);
  if (topNodes.length) {
    console.log(divider('Top terms by frequency'));
    for (const nd of topNodes) {
      console.log(`  ${c('cyan', pad(nd.termCount ?? 0, 5))}  ${nd.term || nd.text}`);
    }
  }

  const topEdges = [...edgeArr].sort((a, b) => (b.weight ?? b.coCount ?? 0) - (a.weight ?? a.coCount ?? 0)).slice(0, 10);
  if (topEdges.length) {
    console.log(divider('Strongest co-occurrences'));
    for (const e of topEdges) {
      const w = (e.weight ?? e.coCount ?? 0).toFixed ? (e.weight ?? e.coCount ?? 0).toFixed(3) : e.weight;
      console.log(`  ${pad(w, 7)}  ${e.termA ?? e.term_a} ↔ ${e.termB ?? e.term_b}`);
    }
  }
  console.log('');
}

async function cmdLatticeSearch(term, flags = {}) {
  if (!term) { console.error(err('usage: lattice search <term>')); return; }
  const stem = term.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const edges = await safeGet('/api/memory?table=lattice_edges&n=1000');
  const edgeArr = Array.isArray(edges) ? edges : [];
  const matches = edgeArr
    .filter(e => (e.termA ?? e.term_a ?? '').startsWith(stem) || (e.termB ?? e.term_b ?? '').startsWith(stem))
    .sort((a, b) => (b.weight ?? b.coCount ?? 0) - (a.weight ?? a.coCount ?? 0))
    .slice(0, parseInt(flags.depth || 15));
  if (!matches.length) { console.log(warn(`Term "${term}" not found in lattice\n`)); return; }
  console.log(divider(`Lattice: "${term}" (stem: "${stem}")`));
  for (const e of matches) {
    const w = ((e.weight ?? e.coCount ?? 0).toFixed ? (e.weight ?? e.coCount ?? 0).toFixed(3) : e.weight);
    const other = (e.termA ?? e.term_a ?? '').startsWith(stem) ? (e.termB ?? e.term_b) : (e.termA ?? e.term_a);
    console.log(`  ${pad(w, 7)}  ↔ ${other}`);
  }
  console.log('');
}

async function cmdLatticePatterns(flags = {}) {
  const n     = parseInt(flags.n || 20);
  const edges = await safeGet(`/api/memory?table=lattice_edges&n=${n * 3}`);
  const sorted = (Array.isArray(edges) ? edges : [])
    .sort((a, b) => (b.weight ?? b.coCount ?? 0) - (a.weight ?? a.coCount ?? 0))
    .slice(0, n);
  if (!sorted.length) { console.log(warn('No lattice edges found\n')); return; }
  console.log(divider(`Top ${n} lattice patterns (strongest term associations)`));
  for (const e of sorted) {
    const w = ((e.weight ?? e.coCount ?? 0).toFixed ? (e.weight ?? e.coCount ?? 0).toFixed(3) : e.weight);
    console.log(`  ${pad(w, 7)}  ${e.termA ?? e.term_a ?? ''} ↔ ${e.termB ?? e.term_b ?? ''}`);
  }
  console.log('');
}

// ── orion ─────────────────────────────────────────────────────────────────────
async function cmdOrionList(flags = {}) {
  const n    = parseInt(flags.n || 20);
  const rows = await safeGet(`/api/memory?table=orion_sessions&n=${n}`);
  if (!rows) return;
  let sessions = Array.isArray(rows) ? rows : [];
  if (flags.status) sessions = sessions.filter(r => r.status === flags.status);
  if (!sessions.length) { console.log(warn('No ORION sessions found\n')); return; }
  console.log(divider(`ORION sessions (${sessions.length})`));
  for (const s of sessions) {
    const vf = s.verified ? c('green', '✓') : s.status === 'rejected' ? c('red', '✗') : c('grey', '·');
    const cov = s.features?.agreementCoverage != null
      ? Math.round(s.features.agreementCoverage * 100) + '%' : '  ?';
    console.log(`  ${vf} ${pad(s.status, 16)} cov: ${pad(cov, 5)} ${dim(s.uuid)}`);
  }
  console.log('');
}

async function cmdOrionShow(uuid) {
  if (!uuid) { console.error(err('usage: orion show <uuid>')); return; }
  const rows = await safeGet('/api/memory?table=orion_sessions&n=200');
  const s = (Array.isArray(rows) ? rows : []).find(r => r.uuid === uuid || r.uuid?.startsWith(uuid));
  if (!s) { console.log(warn(`ORION session not found: ${uuid}\n`)); return; }
  console.log(divider('ORION session'));
  console.log(`  uuid:      ${s.uuid}`);
  console.log(`  status:    ${s.status}`);
  console.log(`  verified:  ${s.verified ? c('green', 'yes') : 'no'}`);
  console.log(`  regime:    ${s.regime || dim('n/a')}`);
  if (s.features) {
    console.log(divider('Features'));
    for (const [k, v] of Object.entries(s.features)) {
      console.log(`  ${pad(k, 24)} ${v}`);
    }
  }
  console.log(`  causedBy:  ${dim(s.causedBy || 'n/a')}`);
  console.log(`  ts:        ${dim(new Date(s.ts || 0).toISOString())}`);
  console.log('');
}

// ── self-model ────────────────────────────────────────────────────────────────
async function cmdSelf(sub) {
  const rows = await safeGet('/api/memory?table=self_model&n=1');
  const m    = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!m) { console.log(warn('No self-model found — self-model module may not have run yet\n')); return; }

  if (sub === 'constraints') {
    console.log(divider('Constraint patterns'));
    (m.constraintPatterns || []).forEach(cp => {
      console.log(`  ${confidence(cp.successRate)} success  ${c('red', cp.retryCount ?? 0)} retries  ${String(cp.text || '').slice(0, 60)}`);
    });
    console.log('');
    return;
  }

  if (sub === 'questions') {
    console.log(divider('Open questions — asked but never crystallized'));
    (m.openQuestions || []).forEach(q => {
      console.log(`  × ${c('yellow', q.callCount ?? 0)} calls  ${String(q.text || '').slice(0, 70)}`);
    });
    console.log('');
    return;
  }

  // Full self snapshot
  console.log(divider('NEXUS Self-model'));
  console.log(`  generated:         ${dim(new Date(m.generatedAt || 0).toISOString())}`);
  console.log(`  creativityIndex:   ${confidence(m.creativityIndex)}`);
  console.log(`  divergenceTrend:   ${m.divergenceTrend?.toFixed(3) ?? dim('n/a')}`);

  const h = m.systemHealth || {};
  console.log(divider('System health'));
  console.log(`  regime:     ${h.dominantRegime || dim('unknown')}`);
  console.log(`  gaps:       ${h.gapDensity ?? dim('?')}`);
  console.log(`  crystals:   ${c('teal', h.crystalCount ?? '?')}`);
  console.log(`  Ollama:     ${h.ollamaAvailable ? c('green', 'online') : c('red', 'offline')}`);
  console.log(`  Guardian:   ${h.guardianConnected ? c('green', 'connected') : c('grey', 'disconnected')}`);

  if (h.latentState) {
    const ls = h.latentState;
    console.log(divider('Latent state (5D)'));
    console.log(`  valence:     ${ls.valence?.toFixed(2) ?? '?'}  ${ls.valence > 0 ? c('green', 'positive') : c('red', 'negative')}`);
    console.log(`  arousal:     ${ls.arousal?.toFixed(2) ?? '?'}`);
    console.log(`  suppression: ${ls.suppression?.toFixed(2) ?? '?'}`);
    console.log(`  coherence:   ${ls.coherence?.toFixed(2) ?? '?'}`);
    console.log(`  engagement:  ${ls.engagement?.toFixed(2) ?? '?'}`);
  }

  if (m.dominantIntentClusters?.length) {
    console.log(divider('Dominant intent clusters'));
    for (const ic of m.dominantIntentClusters.slice(0, 5)) {
      console.log(`  ${c('cyan', pad(ic.callCount, 4))} calls  ${confidence(ic.successRate)}  ${String(ic.text || '').slice(0, 55)}`);
    }
  }

  if (m.trustLandscape?.top5?.length) {
    console.log(divider('Trust landscape — top agents'));
    for (const t of m.trustLandscape.top5) {
      console.log(`  ${confidence(t.score)}  ${t.label || t.uuid}`);
    }
  }
  console.log('');
}

// ── callto ────────────────────────────────────────────────────────────────────
async function cmdCalltoStatus(flags = {}) {
  const n    = parseInt(flags.n || 20);
  const rows = await safeGet(`/api/memory?table=agent_calls&n=${n}`);
  if (!rows) return;
  const calls = (Array.isArray(rows) ? rows : [])
    .filter(r => r.routedTo?.startsWith('guardian-'));
  if (!calls.length) { console.log(warn('No guardian callto calls found\n')); return; }
  console.log(divider(`Guardian callto calls (${calls.length})`));
  for (const call of calls) {
    const status = call.status === 'complete' ? c('green', pad(call.status, 12))
                 : call.status === 'failed'   ? c('red', pad(call.status, 12))
                 : call.status === 'timeout'  ? c('red', pad(call.status, 12))
                 : c('yellow', pad(call.status || '', 12));
    const dur = call.duration_ms ? `${call.duration_ms}ms` : '';
    console.log(`  ${ts(call)} ${status} ${pad(call.routedTo, 20)} ${pad(dur, 8)} ${dim(call.uuid)}`);
  }
  console.log('');
}

async function cmdCalltoShow(uuid) {
  if (!uuid) { console.error(err('usage: callto show <uuid>')); return; }
  const rows = await safeGet('/api/memory?table=agent_calls&n=500');
  const call = (Array.isArray(rows) ? rows : []).find(r => r.uuid === uuid || r.uuid?.startsWith(uuid));
  if (!call) { console.log(warn(`Callto call not found: ${uuid}\n`)); return; }
  console.log(divider('Callto call detail'));
  console.log(`  uuid:      ${call.uuid}`);
  console.log(`  routedTo:  ${call.routedTo}`);
  console.log(`  status:    ${call.status}`);
  console.log(`  duration:  ${call.duration_ms ? call.duration_ms + 'ms' : dim('n/a')}`);
  console.log(`  model:     ${call.model || dim('n/a')}`);
  if (call.prompt) {
    console.log(divider('Prompt (truncated)'));
    console.log(`  ${String(call.prompt).slice(0, 300)}`);
  }
  if (call.response) {
    console.log(divider('Response (truncated)'));
    console.log(`  ${String(call.response).slice(0, 300)}`);
  }
  console.log('');
}

async function cmdCalltoDispatch(agent, prompt, flags = {}) {
  if (!agent || !prompt) {
    console.error(err('usage: callto dispatch <agent> <prompt> [--parallel]'));
    return;
  }
  const target = agent.startsWith('guardian-') ? agent : `guardian-${agent}`;
  const calls  = [{ routedTo: target, prompt }];
  if (flags.parallel) {
    // Dispatch to both providers
    const other = target.includes('claude') ? 'guardian-chatgpt' : 'guardian-claude';
    calls.push({ routedTo: other, prompt });
  }

  for (const call of calls) {
    const ev = await post('/api/event', {
      type:    'agent.call.requested',
      payload: { ...call, source: 'cortex-v2', intent: prompt.slice(0, 100) },
      source:  'cortex-v2',
    }).catch(e => { console.error(err(e.message)); return null; });
    if (ev) console.log(ok(`Dispatched to ${call.routedTo}  event: ${ev.uuid}`));
  }
  if (flags.parallel) console.log(info('Parallel dispatch — Seam will merge responses when both complete'));
  console.log('');
}

// ── versionium ────────────────────────────────────────────────────────────────
async function _versioniumCommits(n) {
  try {
    // §0.39.271 V1 — n= → versionium answers with the newest n (without it, the first 200 stored).
    const r = await get(`/api/versionium/history?n=${Math.max(1, Math.min(1000, n || 50))}`, VERSIONIUM_BASE);
    // versionium stamps commits with `wall` (its causal clock), not `ts`; normalise so the printers work.
    const rows = (Array.isArray(r && r.commits) ? r.commits : []).map(c => ({ ...c, ts: c.wall ?? c.ts }));
    return rows.sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, n);   // newest first
  } catch (e) {
    console.error(err(`Cannot reach versionium on ${VERSIONIUM_BASE}  is it running?`));
    console.error(dim(`  ${e.message}`));
    return null;
  }
}

async function cmdVersioniumStatus() {
  const arr  = await _versioniumCommits(1);
  if (arr === null) return;
  const head = arr[0];
  console.log(divider('Versionium'));
  if (!head) { console.log(warn('No commits yet\n')); return; }
  console.log(`  HEAD:     ${head.commitId}`);
  console.log(`  branch:   ${head.branch || 'main'}`);
  console.log(`  files:    ${head.fileCount ?? 0}`);
  console.log(`  message:  ${head.message || dim('(no message)')}`);
  console.log(`  ts:       ${dim(new Date(head.ts || 0).toISOString())}`);
  console.log('');
}

async function cmdVersioniumLog(n = 10) {
  const arr = await _versioniumCommits(n);
  if (arr === null) return;
  if (!arr.length) { console.log(warn('No commits found\n')); return; }
  console.log(divider(`Versionium log (${arr.length})`));
  for (const c of arr) {
    console.log(`  ${ts(c)}  ${dim(String(c.commitId).slice(0, 14))}  ${c.message || dim('(no message)')}`);
  }
  console.log('');
}

async function cmdVersioniumChain(uuid) {
  if (!uuid) { console.error(err('usage: versionium chain <uuid>')); return; }
  // Walk event_log causedBy chain
  const rows = await safeGet('/api/events?n=500');
  if (!rows) return;
  const index  = {};
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (r.uuid) index[r.uuid] = r;
  }
  const chain  = [];
  let cur      = index[uuid];
  let hops     = 0;
  while (cur && hops < 50) {
    chain.push(cur);
    cur = cur.causedBy ? index[cur.causedBy] : null;
    hops++;
  }
  if (!chain.length) { console.log(warn(`No event found: ${uuid}\n`)); return; }
  console.log(divider(`Causal chain from ${uuid.slice(0, 12)}…`));
  for (const ev of chain) {
    const indent = '  '.repeat(chain.indexOf(ev));
    console.log(`  ${indent}${ts(ev)} ${pad(ev.type, 32)} ${dim(ev.source || '')}`);
  }
  console.log('');
}

// ── guardian ──────────────────────────────────────────────────────────────────
async function cmdGuardianStatus() {
  const health = await safeGet('/api/memory?table=guardian_health&n=1');
  const h      = Array.isArray(health) && health[0] ? health[0] : null;
  console.log(divider('Guardian'));
  if (!h) { console.log(warn('No guardian_health data — Watchman may not be running\n')); return; }
  console.log(`  connected:     ${h.connected ? c('green', 'yes') : c('red', 'no')}`);
  console.log(`  healthScore:   ${confidence(h.healthScore)}`);
  console.log(`  listenerCount: ${h.listenerCount ?? dim('?')}`);
  console.log(`  sessionCount:  ${h.sessionCount ?? dim('?')}`);
  if (h.staleNodes?.length) console.log(`  staleNodes:    ${c('yellow', h.staleNodes.join(', '))}`);
  console.log('');
}

async function cmdGuardianNodes() {
  const rows = await safeGet('/api/memory?table=guardian_nodes&n=20');
  const nodes = Array.isArray(rows) ? rows : [];
  if (!nodes.length) { console.log(warn('No guardian nodes\n')); return; }
  console.log(divider(`Guardian nodes (${nodes.length})`));
  for (const nd of nodes) {
    const age   = nd.lastSeen ? Math.round((Date.now() - nd.lastSeen) / 1000) + 's ago' : 'unknown';
    const fresh = nd.lastSeen && Date.now() - nd.lastSeen < 12000;
    const dot2  = fresh ? c('green', '●') : c('grey', '○');
    console.log(`  ${dot2}  ${pad(nd.instanceId || '', 36)} ${dim(age)}  score: ${confidence(nd.healthScore)}`);
  }
  console.log('');
}

// ── failures ──────────────────────────────────────────────────────────────────
async function cmdFailures(n = 10) {
  const rows = await safeGet('/api/failures');
  const fails = (Array.isArray(rows) ? rows : []).slice(-n);
  if (!fails.length) { console.log(ok('No recent failures\n')); return; }
  console.log(divider(`Recent failures (${fails.length})`));
  for (const f of fails) {
    console.log(`  ${ts(f)}  ${c('red', pad(f.source || '', 22))} ${String(f.error || '').slice(0, 60)}`);
  }
  console.log('');
}

// ── help ──────────────────────────────────────────────────────────────────────
function cmdHelp(cmd) {
  const usage = {
    status:             'system health + JAA table counts',
    tail:               'tail [table] [n] — tail any JAA table (default: event_log)',
    watch:              'watch <table> — live SSE stream of a table',
    diag:               'full system diagnostic',
    ask:                'ask <prompt> — submit prompt, wait for Ollama response',
    'ask-full':         'ask-full <prompt> — ask with crystal + memory context injected',
    gaps:               'gaps [--severity high|medium|low] — open gaps',
    'gap show':         'gap show <uuid> — full gap detail',
    'memory search':    'memory search <query> — search memory_index',
    'memory cortex':    'memory cortex <query> — search cortex_memory',
    'memory forget':    'memory forget <uuid> — soft-delete (§M1 compliant)',
    'memory tail':      'memory tail [n] — last N cortex_memory rows',
    'crystal list':     'crystal list [--state stable|candidate|decaying]',
    'crystal show':     'crystal show <uuid>',
    'crystal search':   'crystal search <term>',
    'seam list':        'seam list [--verified] [--n 20]',
    'seam show':        'seam show <uuid>',
    'intent list':      'intent list [--n 20] [--sort callCount|successRate|surpriseScore]',
    'intent show':      'intent show <uuid>',
    'intent search':    'intent search <term>',
    'intent unresolved':'intent unresolved — intents never crystallized',
    'bep list':         'bep list [--layer <l>] [--n 20]',
    'bep show':         'bep show <uuid>',
    'bep contradictions':'bep contradictions [--n 10]',
    'lattice status':   'lattice status — node count, edge count, top terms',
    'lattice search':   'lattice search <term> [--depth n]',
    'lattice patterns': 'lattice patterns [--n 20]',
    'orion list':       'orion list [--status verified|pending|rejected] [--n 20]',
    'orion show':       'orion show <uuid>',
    self:               'self — current self-model snapshot',
    'self constraints': 'self constraints — constraint patterns only',
    'self questions':   'self questions — open unresolved questions',
    'callto status':    'callto status [--n 20]',
    'callto show':      'callto show <uuid>',
    'callto dispatch':  'callto dispatch <agent> <prompt> [--parallel]',
    'versionium status':'versionium status — HEAD commit',
    'versionium log':   'versionium log [n] — recent commits',
    'versionium chain': 'versionium chain <uuid> — causal chain',
    'guardian status':  'guardian status',
    'guardian nodes':   'guardian nodes',
    failures:           'failures [n] — recent failures',
  };

  if (cmd && usage[cmd]) {
    console.log(`\n  ${bold(cmd)}\n  ${usage[cmd]}\n`);
    return;
  }

  console.log(`\n  ${bold('CORTEX v2')} — NEXUS CLI\n`);
  const groups = {
    System:    ['status', 'tail', 'watch', 'diag'],
    Query:     ['ask', 'ask-full'],
    Gaps:      ['gaps', 'gap show'],
    Memory:    ['memory search', 'memory cortex', 'memory forget', 'memory tail'],
    Crystals:  ['crystal list', 'crystal show', 'crystal search'],
    Seams:     ['seam list', 'seam show'],
    Intents:   ['intent list', 'intent show', 'intent search', 'intent unresolved'],
    BEP:       ['bep list', 'bep show', 'bep contradictions'],
    Lattice:   ['lattice status', 'lattice search', 'lattice patterns'],
    Orion:     ['orion list', 'orion show'],
    Self:      ['self', 'self constraints', 'self questions'],
    Callto:    ['callto status', 'callto show', 'callto dispatch'],
    Versionium:['versionium status', 'versionium log', 'versionium chain'],
    Guardian:  ['guardian status', 'guardian nodes'],
    Failures:  ['failures'],
  };
  for (const [group, cmds] of Object.entries(groups)) {
    console.log(`  ${c('cyan', group)}`);
    for (const k of cmds) {
      console.log(`    ${pad(k, 22)} ${dim(usage[k] || '')}`);
    }
  }
  console.log(`\n  ${dim('NEXUS_PORT=' + PORT)}  |  help <command> for detail\n`);
}

// ── Flags parser ──────────────────────────────────────────────────────────────
function parseFlags(parts) {
  const flags  = {};
  const posit  = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('--')) {
      const key = parts[i].slice(2);
      if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
        flags[key] = parts[++i];
      } else {
        flags[key] = true;
      }
    } else {
      posit.push(parts[i]);
    }
  }
  return { flags, posit };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
async function dispatch(parts) {
  if (!parts.length) return;
  const { flags, posit } = parseFlags(parts);
  const cmd = posit[0]?.toLowerCase();
  const sub = posit[1]?.toLowerCase();
  const arg = posit.slice(2).join(' ') || posit[1];

  switch (cmd) {
    case 'status':    return cmdStatus();
    case 'tail':      return cmdTail(posit[1] || 'event_log', parseInt(posit[2] || flags.n || 10));
    case 'watch':     return cmdWatch(posit[1] || 'event_log');
    case 'diag':      return cmdDiag();

    case 'ask':       return cmdAsk(posit.slice(1).join(' '));
    case 'ask-full':  return cmdAskFull(posit.slice(1).join(' '));

    case 'gaps':
      if (sub === 'show') return cmdGapShow(posit[2]);
      return cmdGaps(flags);

    case 'gap':
      if (sub === 'show') return cmdGapShow(posit[2]);
      return cmdGaps(flags);

    case 'memory':
      if (sub === 'search')  return cmdMemorySearch(posit.slice(2).join(' '));
      if (sub === 'cortex')  return cmdMemoryCortex(posit.slice(2).join(' '));
      if (sub === 'forget')  return cmdMemoryForget(posit[2]);
      if (sub === 'tail')    return cmdMemoryTail(parseInt(posit[2] || flags.n || 10));
      return cmdHelp('memory search');

    case 'crystal':
      if (sub === 'list')    return cmdCrystalList(flags);
      if (sub === 'show')    return cmdCrystalShow(posit[2]);
      if (sub === 'search')  return cmdCrystalSearch(posit.slice(2).join(' '));
      return cmdCrystalList(flags);

    case 'seam':
      if (sub === 'list')    return cmdSeamList(flags);
      if (sub === 'show')    return cmdSeamShow(posit[2]);
      return cmdSeamList(flags);

    case 'intent':
      if (sub === 'list')       return cmdIntentList(flags);
      if (sub === 'show')       return cmdIntentShow(posit[2]);
      if (sub === 'search')     return cmdIntentSearch(posit.slice(2).join(' '));
      if (sub === 'unresolved') return cmdIntentUnresolved();
      return cmdIntentList(flags);

    case 'bep':
      if (sub === 'list')           return cmdBepList(flags);
      if (sub === 'show')           return cmdBepShow(posit[2]);
      if (sub === 'contradictions') return cmdBepContradictions(flags);
      return cmdBepList(flags);

    case 'lattice':
      if (sub === 'status')   return cmdLatticeStatus();
      if (sub === 'search')   return cmdLatticeSearch(posit.slice(2).join(' '), flags);
      if (sub === 'patterns') return cmdLatticePatterns(flags);
      return cmdLatticeStatus();

    case 'orion':
      if (sub === 'list')  return cmdOrionList(flags);
      if (sub === 'show')  return cmdOrionShow(posit[2]);
      return cmdOrionList(flags);

    case 'self':
      if (sub === 'constraints') return cmdSelf('constraints');
      if (sub === 'questions')   return cmdSelf('questions');
      return cmdSelf();

    case 'callto':
      if (sub === 'status')   return cmdCalltoStatus(flags);
      if (sub === 'show')     return cmdCalltoShow(posit[2]);
      if (sub === 'dispatch') return cmdCalltoDispatch(posit[2], posit.slice(3).join(' '), flags);
      return cmdCalltoStatus(flags);

    case 'versionium':
    case 'ver':
      if (sub === 'status') return cmdVersioniumStatus();
      if (sub === 'log')    return cmdVersioniumLog(parseInt(posit[2] || flags.n || 10));
      if (sub === 'chain')  return cmdVersioniumChain(posit[2]);
      return cmdVersioniumStatus();

    case 'guardian':
      if (sub === 'status') return cmdGuardianStatus();
      if (sub === 'nodes')  return cmdGuardianNodes();
      return cmdGuardianStatus();

    case 'fail':
    case 'failures': return cmdFailures(parseInt(posit[1] || flags.n || 10));

    case 'help':     return cmdHelp(posit.slice(1).join(' '));

    default:
      console.log(`  ${warn(`unknown command: '${cmd}'`)} — type 'help'\n`);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── REPL ──────────────────────────────────────────────────────────────────────
async function repl() {
  console.log(`\n  ${bold(c('cyan', 'CORTEX v2'))} — NEXUS CLI  ${dim('(type \'help\' for commands)')}\n`);
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: `  ${c('cyan', 'cortex')}${c('grey', '>')} `,
  });
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    const parts = trimmed.split(/\s+/);
    if (parts[0] === 'exit' || parts[0] === 'quit') {
      console.log(''); rl.close(); process.exit(0);
    }
    try {
      await dispatch(parts);
    } catch (e) {
      console.error(err(e.message));
    }
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

// ── Entry point ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (!args.length) {
  repl();
} else {
  (async () => {
    try {
      await dispatch(args);
    } catch (e) {
      console.error(err(e.message));
      process.exit(1);
    }
    process.exit(0);
  })();
}
