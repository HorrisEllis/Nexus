#!/usr/bin/env node
'use strict';
/**
 * cli/cfr-debug.js — CFR-Ω Replay + Audit CLI
 * UUID: nexus-cfr-debug-v1-0000-4000-0000-000000000001
 *
 * The debugger. Reads ledger JSONL files and reconstructs causal history
 * with sigma/delta/CFR overlays, answering:
 *
 *   "Why did job X fail?"
 *   "When did coherence start degrading?"
 *   "Which retry loops are structurally unstable?"
 *   "What patterns always precede CFR collapse?"
 *
 * Usage:
 *   node cli/cfr-debug.js replay <ledger.jsonl>
 *   node cli/cfr-debug.js replay <ledger.jsonl> --job=<jobId>
 *   node cli/cfr-debug.js replay <ledger.jsonl> --since=<ts> --min-sigma=0.5
 *   node cli/cfr-debug.js audit  <ledger.jsonl>
 *   node cli/cfr-debug.js watch  <ledger.jsonl>       # tail -f with CFR display
 *   node cli/cfr-debug.js live   <kernel-url>         # connect to /cfr/stream
 *   node cli/cfr-debug.js contracts                   # run contract audit
 *   node cli/cfr-debug.js root-cause <jobId> <ledger> # root cause for a job
 */

const fs        = require('fs');
const path      = require('path');
const http      = require('http');
const readline  = require('readline');
const { createCFRField }          = require('../intelligence/cfr/field');
const { computeSigma }            = require('../intelligence/cfr/sigma');
const { computeDelta }            = require('../intelligence/cfr/delta');
const { CausalGraph }             = require('../intelligence/cfr/graph');
const { createContractVerifier, loadContracts } = require('../intelligence/cfr/contract-verifier');

// ── ANSI colors ───────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  red:   '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue:  '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', gray: '\x1b[90m',
};

function col(c_, s) { return `${c_}${s}${C.reset}`; }

function sigmaColor(score) {
  if (score >= 0.8) return C.red;
  if (score >= 0.5) return C.yellow;
  if (score >= 0.3) return C.cyan;
  return C.gray;
}

function regimeColor(r) {
  return { stable:'\x1b[32m', resonant:'\x1b[35m', turbulent:'\x1b[33m', chaotic:'\x1b[31m' }[r] || C.gray;
}

function sigmaIcon(score) {
  if (score >= 0.8) return '🔴';
  if (score >= 0.5) return '🟠';
  if (score >= 0.3) return '🟡';
  return '🟢';
}

// ── JSONL streaming reader ────────────────────────────────────────────────────
async function readLedger(filePath, onEntry) {
  if (!fs.existsSync(filePath)) {
    console.error(col(C.red, `✗ ledger not found: ${filePath}`));
    process.exit(1);
  }
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      onEntry(JSON.parse(line));
    } catch(e) {
      onEntry({ type: 'ledger.corrupt', raw: line.slice(0, 80), error: e.message, ts: Date.now() });
    }
  }
}

// ── Replay ────────────────────────────────────────────────────────────────────
async function cmdReplay(filePath, opts = {}) {
  const entries = [];
  await readLedger(filePath, e => entries.push(e));

  // Filter
  let filtered = entries;
  if (opts.jobId) {
    filtered = entries.filter(e =>
      e.payload?.jobId === opts.jobId ||
      e.trace?.jobId === opts.jobId
    );
  }
  if (opts.since) filtered = filtered.filter(e => (e.ts || 0) >= opts.since);
  if (opts.minSigma) filtered = filtered.filter(e => (e.sigma?.score ?? e.sigma ?? 0) >= opts.minSigma);

  // Reconstruct CFR field over the replay
  const field = createCFRField();
  const graph = new CausalGraph();
  let prev    = null;
  const timeline = [];

  for (const entry of filtered) {
    const sigma = entry.sigma?.score ?? entry.sigma ?? 0;
    const delta = entry.delta ?? computeDelta(prev, entry);
    // If entry already has CFR snapshot (from CFR ledger), use it; else reconstruct
    const cfr   = entry.cfr ?? field.update(entry.type, sigma);
    graph.ingest(entry);
    timeline.push({ ...entry, sigma: typeof entry.sigma === 'object' ? entry.sigma : { score: sigma }, delta, cfr });
    prev = entry;
  }

  console.log(`\n${col(C.bold+C.cyan, '═══ CFR-Ω REPLAY')} ${col(C.dim, path.basename(filePath))} ${col(C.gray, `[${timeline.length} entries]`)}\n`);

  if (!timeline.length) {
    console.log(col(C.yellow, '  no entries match filter'));
    return;
  }

  // Summary header
  const highSigma  = timeline.filter(e => (e.sigma?.score ?? 0) >= 0.7).length;
  const avgSigma   = timeline.reduce((s, e) => s + (e.sigma?.score ?? 0), 0) / timeline.length;
  const finalCFR   = timeline[timeline.length - 1].cfr;
  const finalReg   = finalCFR?.regime ?? 'unknown';

  console.log(
    col(C.dim, '  Entries:   ') + col(C.white, timeline.length) +
    '  ' + col(C.dim, 'High-sigma: ') + col(sigmaColor(highSigma/timeline.length), highSigma) +
    '  ' + col(C.dim, 'Avg σ: ') + col(sigmaColor(avgSigma), avgSigma.toFixed(2)) +
    '  ' + col(C.dim, 'Regime: ') + col(regimeColor(finalReg), finalReg.toUpperCase())
  );
  console.log('');

  // Timeline — last 60 entries by default, or all if --all
  const display = opts.all ? timeline : timeline.slice(-60);

  for (const e of display) {
    const sigma   = e.sigma?.score ?? 0;
    const tension = e.delta?.tension ?? 0;
    const coh     = e.cfr?.coherence ?? 0;
    const ts      = new Date(e.ts || 0).toTimeString().slice(0, 8);
    const regime  = e.cfr?.regime ?? 'stable';

    const line = [
      sigmaIcon(sigma),
      col(C.gray, ts),
      col(sigmaColor(sigma), sigma.toFixed(2).padStart(4)),
      col(C.dim, 'σ'),
      col(tension > 0.5 ? C.yellow : C.gray, `ΔT:${tension.toFixed(2)}`),
      col(coh < 0.3 ? C.red : C.gray, `coh:${coh.toFixed(2)}`),
      col(regimeColor(regime), regime.slice(0, 3).toUpperCase()),
      col(C.white, (e.type || '').padEnd(42)),
    ].join(' ');

    console.log(line);

    // Show sigma reason for high-sigma events
    if (sigma >= 0.5 && e.sigma?.reason) {
      console.log(col(C.dim, `    ↳ ${e.sigma.reason}`));
    }
  }

  // Graph stats
  console.log('');
  const gs = graph.stats();
  console.log(
    col(C.dim, '  Graph  ') +
    col(C.white, `${gs.nodes} nodes`) +
    col(C.dim, '  ') +
    col(C.white, `${gs.edges} edges`) +
    col(C.dim, '  ') +
    col(C.white, `${gs.jobs} jobs`) +
    col(C.dim, '  ') +
    col(C.white, `${gs.sessions} sessions`)
  );

  // High-sigma chain
  const spikes = graph.highSigmaNodes(0.7);
  if (spikes.length) {
    console.log('');
    console.log(col(C.bold + C.red, '  ── High-sigma events ─────────────────────────────'));
    for (const e of spikes.slice(0, 10)) {
      const ancestors = graph.ancestors(e.uuid, 5);
      console.log(`  ${sigmaIcon(e.sigma?.score ?? 0)} ${col(C.red, (e.sigma?.score ?? 0).toFixed(2))} ${col(C.white, e.type)}`);
      if (e.sigma?.reason) console.log(col(C.dim, `     reason: ${e.sigma.reason}`));
      if (ancestors.length > 1) {
        const chain = ancestors.slice(0, -1).map(a => col(C.gray, a.type)).join(' → ');
        console.log(col(C.dim, `     cause chain: ${chain}`));
      }
    }
  }

  console.log('');
}

// ── Audit ─────────────────────────────────────────────────────────────────────
async function cmdAudit(filePath) {
  const entries = [];
  let corrupt = 0;
  await readLedger(filePath, e => {
    if (e.type === 'ledger.corrupt') corrupt++;
    else entries.push(e);
  });

  // Check for missing CFR annotation (entries written before upgrade)
  const withCFR    = entries.filter(e => e.cfr).length;
  const withSigma  = entries.filter(e => e.sigma).length;
  const withDelta  = entries.filter(e => e.delta).length;
  const withCausal = entries.filter(e => e.causedBy).length;

  console.log(`\n${col(C.bold+C.cyan, '═══ CFR-Ω AUDIT')} ${col(C.dim, path.basename(filePath))}\n`);
  console.log(col(C.dim, '  Total entries:   ') + col(C.white, entries.length));
  console.log(col(C.dim, '  Corrupt lines:   ') + col(corrupt > 0 ? C.red : C.green, corrupt));
  console.log(col(C.dim, '  With CFR:        ') + _pct(withCFR, entries.length));
  console.log(col(C.dim, '  With sigma:      ') + _pct(withSigma, entries.length));
  console.log(col(C.dim, '  With delta:      ') + _pct(withDelta, entries.length));
  console.log(col(C.dim, '  With causedBy:   ') + _pct(withCausal, entries.length));

  // Check parentId chain integrity
  const ids = new Set(entries.map(e => e.uuid));
  const brokenChains = entries.filter(e => e.causedBy && !ids.has(e.causedBy)).length;
  console.log(col(C.dim, '  Broken causal:   ') + col(brokenChains > 0 ? C.yellow : C.green, brokenChains));

  // Timestamp ordering
  let outOfOrder = 0;
  for (let i = 1; i < entries.length; i++) {
    if ((entries[i].ts || 0) < (entries[i-1].ts || 0)) outOfOrder++;
  }
  console.log(col(C.dim, '  Out-of-order ts: ') + col(outOfOrder > 0 ? C.yellow : C.green, outOfOrder));

  // Event type distribution
  const typeCounts = {};
  for (const e of entries) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  const topTypes = Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);
  console.log('');
  console.log(col(C.bold, '  Top event types:'));
  for (const [type, count] of topTypes) {
    const bar = '█'.repeat(Math.min(20, Math.round(count / entries.length * 100)));
    console.log(`    ${col(C.cyan, type.padEnd(40))} ${col(C.dim, count.toString().padStart(5))}  ${col(C.gray, bar)}`);
  }
  console.log('');
}

// ── Root cause ────────────────────────────────────────────────────────────────
async function cmdRootCause(jobId, filePath) {
  const entries = [];
  await readLedger(filePath, e => entries.push(e));

  const graph = new CausalGraph();
  entries.forEach(e => graph.ingest(e));

  const chain = graph.jobChain(jobId);
  if (!chain.length) {
    console.log(col(C.red, `  ✗ No entries found for job ${jobId}`));
    return;
  }

  // Find the failure point
  const failure = chain.find(e =>
    e.type.includes('error') || e.type.includes('failed') || e.type.includes('failure')
  );

  console.log(`\n${col(C.bold+C.cyan, '═══ ROOT CAUSE')} ${col(C.dim, jobId)}\n`);
  console.log(col(C.dim, `  Job chain: ${chain.length} events`));

  if (!failure) {
    console.log(col(C.green, '  ✓ No failure events found in job chain'));
  } else {
    console.log(col(C.red, `\n  ✗ Failure: ${failure.type}`));
    if (failure.sigma?.reason) {
      console.log(col(C.dim, `    Sigma reason: ${failure.sigma.reason}`));
    }

    // Walk ancestors
    const ancestors = graph.ancestors(failure.uuid, 10);
    if (ancestors.length > 1) {
      console.log(col(C.bold, '\n  Causal chain (root → failure):'));
      for (const e of ancestors) {
        const sigma = e.sigma?.score ?? 0;
        const mark  = e.uuid === failure.uuid ? col(C.red, '→ FAILURE') : col(C.gray, '  ');
        console.log(`    ${mark} ${sigmaIcon(sigma)} ${col(sigmaColor(sigma), sigma.toFixed(2))} ${col(C.white, e.type)}`);
      }
    }

    // CFR state at failure
    if (failure.cfr) {
      console.log(col(C.bold, '\n  CFR field at failure:'));
      for (const [k, v] of Object.entries(failure.cfr)) {
        if (k === 'regime') continue;
        const bar = '█'.repeat(Math.round((v || 0) * 20));
        console.log(`    ${col(C.dim, k.padEnd(12))} ${col(C.cyan, bar.padEnd(20))} ${col(C.white, (v||0).toFixed(2))}`);
      }
      console.log(`    ${col(C.dim, 'regime'.padEnd(12))} ${col(regimeColor(failure.cfr.regime), (failure.cfr.regime || '').toUpperCase())}`);
    }
  }

  console.log('');
}

// ── Live stream ───────────────────────────────────────────────────────────────
function cmdLive(kernelUrl) {
  const url = kernelUrl.replace(/\/+$/, '') + '/cfr/stream';
  console.log(`\n${col(C.bold+C.cyan, '═══ CFR-Ω LIVE')} ${col(C.dim, url)}\n`);

  const r = http.get(url, { headers: { Accept: 'text/event-stream' } }, res => {
    let buf = '';
    res.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const e = JSON.parse(line.slice(5).trim());
          const sigma   = e.sigma?.score ?? 0;
          const regime  = e.cfr?.regime ?? 'stable';
          const ts      = new Date(e.ts || 0).toTimeString().slice(0, 8);
          console.log(
            sigmaIcon(sigma),
            col(C.gray, ts),
            col(sigmaColor(sigma), sigma.toFixed(2)),
            col(regimeColor(regime), regime.slice(0, 3).toUpperCase()),
            col(C.white, (e.type || '').padEnd(40)),
            col(C.dim, e.sigma?.reason ? `[${e.sigma.reason}]` : '')
          );
        } catch(_) {}
      }
    });
    res.on('end', () => { console.log('\nstream ended'); process.exit(0); });
  });
  r.on('error', e => {
    console.error(col(C.red, `✗ Cannot connect to ${url}: ${e.message}`));
    process.exit(1);
  });
}

// ── Contract audit ────────────────────────────────────────────────────────────
function cmdContracts() {
  const ROOT = path.join(__dirname, '..');
  const contracts = loadContracts(ROOT);
  console.log(`\n${col(C.bold+C.cyan, '═══ CONTRACT AUDIT')}\n`);

  if (!Object.keys(contracts).length) {
    console.log(col(C.yellow, '  No interaction-contract.json files found'));
    return;
  }

  for (const [sys, contract] of Object.entries(contracts)) {
    const emits    = contract?.siso?.emits?.length ?? 0;
    const consumes = contract?.siso?.consumes?.length ?? 0;
    const routes   = contract?.routes?.length ?? 0;
    console.log(
      `  ${col(C.bold+C.cyan, sys.padEnd(16))}` +
      col(C.dim, `v${contract.version || '?'} `) +
      col(C.white, `${emits} emits`) + col(C.dim, '  ') +
      col(C.white, `${consumes} consumes`) + col(C.dim, '  ') +
      col(C.white, `${routes} routes`)
    );
  }
  console.log('');
}

// ── Watch (tail -f) ───────────────────────────────────────────────────────────
async function cmdWatch(filePath) {
  // First replay existing
  await cmdReplay(filePath, { minSigma: 0.3 });

  console.log(col(C.dim, `\n  Watching ${filePath}…\n`));

  const field = createCFRField();
  let prev    = null;
  let size    = fs.statSync(filePath).size;

  setInterval(() => {
    const newSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    if (newSize <= size) return;

    // Read new bytes
    const fd  = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(newSize - size);
    fs.readSync(fd, buf, 0, buf.length, size);
    fs.closeSync(fd);
    size = newSize;

    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const e     = JSON.parse(line);
        const sigma = e.sigma?.score ?? 0;
        const cfr   = e.cfr ?? field.update(e.type, sigma);
        const regime = cfr?.regime ?? 'stable';
        const ts    = new Date(e.ts || 0).toTimeString().slice(0, 8);
        process.stdout.write(
          `${sigmaIcon(sigma)} ${col(C.gray, ts)} ` +
          `${col(sigmaColor(sigma), sigma.toFixed(2))} ` +
          `${col(regimeColor(regime), regime.slice(0,3).toUpperCase())} ` +
          `${col(C.white, (e.type || '').padEnd(40))} ` +
          `${col(C.dim, e.sigma?.reason ? `[${e.sigma.reason}]` : '')}\n`
        );
        prev = e;
      } catch(_) {}
    }
  }, 500);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _pct(n, total) {
  const pct = total > 0 ? Math.round(n / total * 100) : 0;
  const color = pct >= 80 ? C.green : pct >= 50 ? C.yellow : C.red;
  return col(color, `${n} (${pct}%)`);
}

function usage() {
  console.log(`
${col(C.bold+C.cyan, 'cfr-debug')} — CFR-Ω Ledger Debugger

${col(C.bold, 'Commands:')}
  ${col(C.cyan, 'replay')}   <ledger.jsonl>               Replay with sigma/delta/CFR overlay
             --job=<id>                       Filter by job ID
             --since=<timestamp>              Filter by timestamp
             --min-sigma=<0.0-1.0>            Show only high-sigma events
             --all                            Show all (not just last 60)

  ${col(C.cyan, 'audit')}    <ledger.jsonl>               Structural health audit
  ${col(C.cyan, 'watch')}    <ledger.jsonl>               Tail ledger with live CFR
  ${col(C.cyan, 'live')}     <kernel-url>                 Connect to /cfr/stream SSE
  ${col(C.cyan, 'contracts')}                             Audit interaction contracts
  ${col(C.cyan, 'root-cause')} <jobId> <ledger.jsonl>     Root cause for a job ID

${col(C.bold, 'Examples:')}
  node cli/cfr-debug.js replay data/guardian/ledger/cfr/event_log.jsonl
  node cli/cfr-debug.js replay data/cortex/event_log.jsonl --min-sigma=0.5
  node cli/cfr-debug.js watch  data/guardian/ledger/cfr/event_log.jsonl
  node cli/cfr-debug.js live   http://127.0.0.1:7820
  node cli/cfr-debug.js root-cause abc123 data/guardian/ledger/cfr/event_log.jsonl
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd  = argv[0];

const opts = {};
for (const arg of argv.slice(2)) {
  if (arg.startsWith('--job='))       opts.jobId     = arg.slice(6);
  if (arg.startsWith('--since='))     opts.since     = parseInt(arg.slice(8));
  if (arg.startsWith('--min-sigma=')) opts.minSigma  = parseFloat(arg.slice(12));
  if (arg === '--all')                opts.all       = true;
}

switch (cmd) {
  case 'replay':     cmdReplay(argv[1], opts).catch(console.error); break;
  case 'audit':      cmdAudit(argv[1]).catch(console.error); break;
  case 'watch':      cmdWatch(argv[1]).catch(console.error); break;
  case 'live':       cmdLive(argv[1] || 'http://127.0.0.1:7820'); break;
  case 'contracts':  cmdContracts(); break;
  case 'root-cause': cmdRootCause(argv[1], argv[2]).catch(console.error); break;
  default:           usage();
}
