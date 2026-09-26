#!/usr/bin/env node
'use strict';
/**
 * cli/session.js — SESSION.md Renderer
 * UUID: nexus-session-renderer-v1-0000-4000-0000-000000000001
 *
 * Renders SESSION.md as a deterministic projection of current system state.
 * NOT a manually edited file. Run this to regenerate.
 *
 * Usage:
 *   node cli/session.js              → writes docs/SESSION.md
 *   node cli/session.js --print      → stdout only
 *   node cli/session.js --watch      → regenerate every 60s
 *
 * Sources (in priority order):
 *   1. Bridge ledger tail (data/bridge/ledger/requests.jsonl)
 *   2. Orchestrator ledger (data/ledger/orchestrator.jsonl)
 *   3. Cortex gaps (GET :3748/api/gaps)
 *   4. MANIFEST.json open_gaps
 *   5. Git-style file mtimes for "last touched"
 *
 * §6.1 Documentation is generated from proof, not written as aspiration.
 * §7.6 Codebase is a materialised view of the Upgrade Ledger.
 * §2.3 All state must be observable.
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT        = path.join(__dirname, '..');
const OUT_FILE    = path.join(ROOT, 'docs', 'SESSION.md');
const BRIDGE_LEDGER = path.join(ROOT, 'data', 'bridge', 'ledger', 'requests.jsonl');
const ORCH_LEDGER   = path.join(ROOT, 'data', 'ledger', 'orchestrator.jsonl');
const MANIFEST      = path.join(ROOT, 'MANIFEST.json');

const PRINT_ONLY = process.argv.includes('--print');
const WATCH      = process.argv.includes('--watch');

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(port, path_, timeout = 2000) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: path_, timeout }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(d) }); }
        catch { resolve({ ok: false }); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ ok: false }); });
    req.on('error', () => resolve({ ok: false }));
  });
}

// ── Ledger tail reader ────────────────────────────────────────────────────────
function readLedgerTail(file, n = 20) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ── System health probe ───────────────────────────────────────────────────────
async function probeAll() {
  const systems = [
    { id: 'bridge',      port: 9999, path: '/health' },
    { id: 'cortex',      port: 3748, path: '/health' },
    { id: 'guardian',    port: 7820, path: '/health' },
    { id: 'idearium',    port: 4800, path: '/health' },
    { id: 'emerge',      port: 4242, path: '/status' },
    { id: 'orchestrator',port: 9000, path: '/health' },
  ];
  const results = await Promise.all(systems.map(async s => {
    const r = await httpGet(s.port, s.path);
    return { ...s, online: r.ok };
  }));
  return results;
}

// ── Main render ───────────────────────────────────────────────────────────────
async function render() {
  const now = new Date().toISOString();

  // 1. System health
  const systems = await probeAll();
  const online  = systems.filter(s => s.online).map(s => s.id);
  const offline = systems.filter(s => !s.online).map(s => s.id);

  // 2. Bridge ledger tail
  const bridgeTail = readLedgerTail(BRIDGE_LEDGER, 10);
  const orchTail   = readLedgerTail(ORCH_LEDGER, 15);

  // 3. Cortex gaps (live if online)
  let openGaps = [];
  if (online.includes('cortex')) {
    const r = await httpGet(3748, '/api/gaps?status=open');
    if (r.ok) openGaps = (r.data.gaps || []).slice(0, 10);
  }

  // 4. MANIFEST open_gaps as fallback
  let manifestGaps = [];
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    manifestGaps = m.open_gaps || [];
  } catch {}

  // 5. Bridge request summary
  const heldCount      = bridgeTail.filter(r => r.status === 'held').length;
  const pendingCount   = bridgeTail.filter(r => r.status === 'pending').length;
  const fulfilledCount = bridgeTail.filter(r => r.status === 'fulfilled').length;

  // 6. Recent orchestrator events
  const recentEvents = orchTail
    .filter(e => e.type && !e._patch)
    .slice(-8)
    .map(e => `  ${new Date(e.ts || 0).toISOString().slice(11,19)}  ${e.type}  ${e.system || ''}`)
    .join('\n');

  // ── Render ────────────────────────────────────────────────────────────────
  const doc = `# SESSION.md
**Generated:** ${now}
**Source:** Deterministic projection of Bridge ledger + Orchestrator ledger + live system probes.
**DO NOT EDIT** — regenerate with \`node cli/session.js\`

---

## System Status

| System | Port | Status |
|--------|------|--------|
${systems.map(s => `| ${s.id.padEnd(12)} | :${s.port} | ${s.online ? '🟢 ONLINE' : '🔴 OFFLINE'} |`).join('\n')}

**Online:** ${online.join(', ') || 'none'}
**Offline:** ${offline.join(', ') || 'none'}

---

## Bridge Ledger (last 10 requests)

| UUID | Type | Source → Target | Status |
|------|------|-----------------|--------|
${bridgeTail.length
  ? bridgeTail.map(r => `| \`${(r.uuid||'').slice(0,8)}\` | ${r.type||'?'} | ${r.source||'?'} → ${r.target||'?'} | ${r.status||'?'} |`).join('\n')
  : '| — | no requests in ledger | — | — |'}

**Held:** ${heldCount} | **Pending:** ${pendingCount} | **Fulfilled:** ${fulfilledCount}

---

## Recent Orchestrator Events

\`\`\`
${recentEvents || '  (no events — orchestrator offline or ledger empty)'}
\`\`\`

---

## Open Gaps

${openGaps.length
  ? openGaps.map(g => `- **[${g.severity||'?'}]** ${g.body||g.description||g.type||'unknown gap'} *(${g.source||'unknown'})*`).join('\n')
  : manifestGaps.length
    ? manifestGaps.map(g => `- ${g}`).join('\n')
    : '- No open gaps'}

---

## Current Build Phase

> Read \`docs/CLAUDE.md\` for full system context.
> Read \`docs/nexus.spec\` for the current per-system spec.
> Read \`docs/AXIOMS-v3.1.md\` for governing laws.
> Read \`MANIFEST.json\` session_log for build history.

### What was last built (from orchestrator ledger)
${orchTail.filter(e => e.type?.includes('booted') || e.type?.includes('started') || e.type?.includes('complete')).slice(-3).map(e => `- \`${e.type}\` — ${new Date(e.ts||0).toISOString().slice(0,16)}`).join('\n') || '- (no boot records in ledger)'}

### Next intended actions
*(Update this section by running \`node orchestrator.js session-note "your note"\` — writes to orchestrator ledger)*

---

## Hash Chain Status

**Current storage locations:**
- Bridge requests: \`data/bridge/ledger/requests.jsonl\`
- Orchestrator ledger: \`data/ledger/orchestrator.jsonl\`
- Cortex JAA tables: \`cortex/data/\` (28 tables, JSONL per table)
- Cortex FileStore: \`cortex/store/\` (SHA-256 content-addressed)
- Guardian queue: \`data/guardian/input|output|queue|failures\`
- Idearium: \`data/idearium/\`

**Hash identity:** SHA-256 via Cortex FileStore. Userscript simpleHash() is a known gap — not content-addressed. Replacement pending in userscript kernel rebuild.

---

*§6.1 Documentation is generated from proof, not written as aspiration.*
*§7.6 The codebase is a materialised view of the Upgrade Ledger.*
`;

  if (PRINT_ONLY) {
    process.stdout.write(doc);
  } else {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, doc, 'utf8');
    console.log(`[session] SESSION.md written → ${OUT_FILE}`);
    console.log(`[session] Online: ${online.join(', ') || 'none'} | Offline: ${offline.join(', ') || 'none'}`);
    if (openGaps.length) console.log(`[session] ${openGaps.length} open gaps from Cortex`);
    else if (manifestGaps.length) console.log(`[session] ${manifestGaps.length} open gaps from MANIFEST`);
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────
render().catch(e => { console.error('[session §1.2]', e.message); process.exit(1); });

if (WATCH) {
  console.log('[session] watching — regenerating every 60s');
  setInterval(() => render().catch(e => console.error('[session]', e.message)), 60_000);
}
