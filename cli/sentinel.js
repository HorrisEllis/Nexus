#!/usr/bin/env node
'use strict';
/**
 * cli/sentinel.js — NEXUS Sentinel CLI
 * UUID: nexus-sentinel-cli-v1-0000-2026-0727-001
 * spec: docs/nexus-sentinel.spec — phase S1
 * contract: sentinel/interaction-contract.json
 *
 * S1's GATE, verbatim from the spec: "`sentinel contract` emits a real
 * machine-readable contract, and `sentinel status` + `sentinel faults list`
 * return REAL data read from cortex — with the sentinel service DOWN, proving
 * the CLI's local path."
 *
 * WHY CLI FIRST (James: "Cli first. API."): it is the surface that proves the
 * system works without a UI, and the one a human reaches for when everything
 * else is down. A diagnostic tool that requires the thing it diagnoses to be
 * healthy is useless precisely when it is needed — which is not hypothetical
 * here: cli/diagnose.js was found 100% dead earlier this session because
 * nothing ever exercised it.
 *
 * READS THE STORE DIRECTLY, BY DESIGN. This is the one place SEN-9's
 * "never require another system's internals" is deliberately not applied to
 * the data path: the CLI's whole value is answering when the service is down,
 * and routing through HTTP would make it as dead as everything else. It reads
 * cortex's store — the data root — and never calls into another system's
 * LOGIC. Every mutation still goes through the governed path.
 *
 * The contract is the single declaration; this CLI derives from it and
 * VERIFIES that at startup, so a command drifting from the contract is caught
 * here rather than discovered by a user.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODULE_ID = 'cli/sentinel';
const CONTRACT_PATH = path.join(ROOT, 'sentinel/interaction-contract.json');

const C = { dim: '\x1b[90m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m', bold: '\x1b[1m', off: '\x1b[0m' };
const JSON_OUT = process.argv.includes('--json');

// §MACHINE-READABLE MUST BE CLEAN 2026-07-24 — caught by the test suite, not
// by reading the code. cortex's store logs "[jaa] Loaded N rows" to stdout on
// require, which lands INSIDE the JSON payload and makes --json unparseable
// for any caller. A machine-readable flag that emits unparseable output is
// worse than none: every consumer would have to guess where the JSON starts.
// Store chatter is redirected to stderr for the duration, so stdout carries
// the payload and nothing else — and the chatter is still visible to a human
// watching the terminal rather than being swallowed (§1.2).
if (JSON_OUT) {
  const _realLog = console.log;
  console.log = (...a) => {
    const first = String(a[0] ?? '');
    if (first.startsWith('[jaa]') || first.startsWith('[component-registry]')) { console.error(...a); return; }
    _realLog(...a);
  };
}
const say = (...a) => { if (!JSON_OUT) console.log(...a); };
const out = (obj) => { if (JSON_OUT) console.log(JSON.stringify(obj, null, 2)); };

function contract() {
  try { return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')); }
  catch (e) {
    console.error(`${C.red}[${MODULE_ID}] §1.1 contract unreadable at ${CONTRACT_PATH}: ${e.message}${C.off}`);
    console.error('The contract IS the surface. Without it this CLI has no defined commands, so it refuses rather than guessing.');
    process.exit(2);
  }
}

// Store access is lazy and CONTAINED: a wedged store must degrade this CLI to
// "cannot read" with a reason, never crash it. The tool has to survive the
// failures it exists to report.
let _jaa;
function store() {
  if (_jaa !== undefined) return _jaa;
  try { ({ jaaDB: _jaa } = require(path.join(ROOT, 'cortex/memory/jaa-db'))); }
  catch (e) { _jaa = null; _storeErr = e.message; }
  return _jaa;
}
let _storeErr = null;

// ── faults ───────────────────────────────────────────────────────────────────
// A "fault" today is a real row in the gaps table plus any ledger row whose
// status marks trouble. The sentinel does not yet own a sentinel_faults table
// (that is S5) — so rather than invent one and report zero, it reads what
// genuinely exists and SAYS which source each fault came from.
function readFaults({ limit = 20, system = null, all = false } = {}) {
  const jaa = store();
  if (!jaa) return { observed: false, reason: `store unreadable: ${_storeErr}`, faults: [] };
  const faults = [];
  try {
    for (const g of (jaa.query('gaps', () => true, 500) || [])) {
      if (!all && g.status && g.status !== 'open') continue;
      if (system && g.system !== system) continue;
      faults.push({
        uuid: g.uuid || g.id, source: 'gaps', system: g.system || g.module || '(unknown)',
        type: g.type || 'gap', severity: g.severity || null, status: g.status || 'open',
        detail: g.detail || g.description || g.body || null, ts: g.ts || g.createdAt || null,
      });
    }
  } catch (e) { return { observed: false, reason: `gaps read failed: ${e.message}`, faults: [] }; }
  try {
    for (const r of (jaa.tail('component_ledger', 800) || [])) {
      if (!['anomalous', 'error', 'fail', 'failed'].includes(String(r.status))) continue;
      if (system && r.system !== system) continue;
      faults.push({
        uuid: r.uuid, source: 'ledger', system: r.system, type: r.action,
        severity: null, status: r.status, hook: r.hook || null, wire: r.wire || null,
        detail: r.detail || null, ts: r.ts,
      });
    }
  } catch (_) { /* the gaps half still stands */ }
  faults.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { observed: true, total: faults.length, faults: faults.slice(0, limit) };
}

function cmdFaultsList(args) {
  const limit  = +(args.limit || 20);
  const r = readFaults({ limit, system: args.system || null, all: !!args.all });
  out(r);
  if (!r.observed) {
    say(`${C.red}✗ ${r.reason}${C.off}`);
    say(`${C.dim}  Unreadable is not the same as "no faults" — reporting zero here would be a lie.${C.off}`);
    return 1;
  }
  if (!r.faults.length) {
    say(`${C.grn}no open faults${C.off} ${C.dim}(searched gaps + ledger; ${r.total} total matched)${C.off}`);
    return 0;
  }
  say(`${C.bold}${r.faults.length} of ${r.total} fault(s)${C.off}`);
  for (const f of r.faults) {
    const when = f.ts ? new Date(f.ts).toISOString().replace('T', ' ').slice(0, 19) : '—';
    say(`  ${C.dim}${when}${C.off}  ${C.yel}${String(f.system).padEnd(14)}${C.off} ${f.type}`
      + `  ${C.dim}${f.source}${f.hook ? ` · ${f.hook}` : ''}${C.off}`);
    say(`    ${C.dim}${String(f.uuid).slice(0, 36)}${C.off}`);
  }
  return 0;
}

function cmdFaultsShow(args) {
  const uuid = args._[0];
  if (!uuid) { say(`${C.red}usage: sentinel faults show <uuid>${C.off}`); return 2; }
  const r = readFaults({ limit: 9999, all: true });
  if (!r.observed) { out(r); say(`${C.red}✗ ${r.reason}${C.off}`); return 1; }
  const f = r.faults.find(x => String(x.uuid) === uuid || String(x.uuid).startsWith(uuid));
  if (!f) { out({ ok: false, error: 'not found', uuid }); say(`${C.red}no fault ${uuid}${C.off}`); return 1; }

  // Causal ancestry — the real graph, the same one intelligence now uses.
  // "Why" answered by causedBy edges rather than by a clock.
  let ancestry = [];
  try {
    const { CausalGraph } = require(path.join(ROOT, 'intelligence/cfr/graph'));
    const jaa = store();
    const g = new CausalGraph();
    for (const e of (jaa.tail('event_log', 2000) || [])) g.ingest(e);
    ancestry = (g.ancestors(f.uuid, 8) || []).map(a => ({ uuid: a.uuid || a.id, type: a.type, ts: a.ts }));
  } catch (_) { ancestry = []; }

  out({ ...f, ancestry });
  say(`${C.bold}${f.type}${C.off}  ${C.dim}${f.uuid}${C.off}`);
  say(`  system   ${f.system}`);
  say(`  status   ${f.status}${f.severity ? ` · ${f.severity}` : ''}`);
  say(`  source   ${f.source}${f.hook ? `  hook ${f.hook}` : ''}${f.wire ? `  wire ${f.wire}` : ''}`);
  if (f.ts) say(`  when     ${new Date(f.ts).toISOString()}`);
  if (f.detail) say(`  detail   ${String(typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail)).slice(0, 300)}`);
  if (ancestry.length > 1) {
    say(`  ${C.cyn}causal ancestry${C.off} ${C.dim}(real causedBy walk, not adjacency)${C.off}`);
    for (const a of ancestry) say(`    ← ${a.type || '?'} ${C.dim}${String(a.uuid).slice(0, 12)}${C.off}`);
  } else {
    say(`  ${C.dim}no causal ancestry recorded — this fault carries no causedBy chain${C.off}`);
  }
  return 0;
}

function cmdStatus() {
  const jaa = store();
  const st = { ok: true, module: MODULE_ID, contract: null, store: null, schema: null, intake: null, faults: null };
  const c = contract();
  st.contract = { id: c.id, version: c.version, uuid: c.uuid, commands: c.commands.length, routesDeclared: c.routes.length };
  st.store = jaa ? { reachable: true } : { reachable: false, reason: _storeErr };

  try {
    const cl = require(path.join(ROOT, 'lib/component-ledger'));
    st.schema = cl.schemaCoverage ? cl.schemaCoverage(1500) : null;
    st.intake = cl.intakeCoverage ? cl.intakeCoverage() : null;
  } catch (e) { st.schema = { error: e.message }; }

  const f = readFaults({ limit: 1 });
  st.faults = f.observed ? { open: f.total } : { observed: false, reason: f.reason };
  out(st);

  say(`${C.bold}sentinel${C.off} ${C.dim}${c.id} v${c.version}${C.off}`);
  say(`  contract   ${c.commands.length} commands, ${c.routes.length} routes declared`);
  say(`  store      ${jaa ? `${C.grn}reachable${C.off}` : `${C.red}UNREACHABLE — ${_storeErr}${C.off}`}`);
  if (st.schema && st.schema.rows !== undefined) {
    say(`  schema     hook ${st.schema.hookPct}%  wire ${st.schema.wirePct}%  source ${st.schema.sourcePct}%  ${C.dim}(${st.schema.rows} rows)${C.off}`);
  }
  if (st.intake && st.intake.observed) {
    const bad = st.intake.starving;
    say(`  intake     ${bad ? C.red : C.grn}${st.intake.coveragePct}%${C.off} ${C.dim}${st.intake.breadcrumbs}/${st.intake.canonicalWrites} breadcrumbs${C.off}`
      + (bad ? `  ${C.red}STARVING — the pattern engine is not being fed${C.off}` : ''));
  }
  say(`  faults     ${st.faults.open !== undefined ? st.faults.open : `${C.red}${st.faults.reason}${C.off}`}`);
  return 0;
}

function cmdScan(args) {
  // The REAL diagnostic, never a second implementation (§16.4, SEN-1). This
  // command exists so there is ONE way to ask, not so there is a new one.
  const target = args._[0] || 'all';
  const { spawnSync } = require('child_process');
  say(`${C.dim}→ cli/diagnose.js ${target}${C.off}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'cli/diagnose.js'), target],
    { cwd: ROOT, stdio: JSON_OUT ? 'pipe' : 'inherit', encoding: 'utf8', timeout: 120000 });
  if (JSON_OUT) out({ ok: r.status === 0, exitCode: r.status, tail: String(r.stdout || '').split('\n').slice(-30).join('\n') });
  return r.status === 0 ? 0 : 1;
}

function cmdAck(args) {
  const uuid = args._[0];
  if (!uuid) { say(`${C.red}usage: sentinel faults ack <uuid> [--note "..."]${C.off}`); return 2; }
  // §SEN-4/§LAW II — an acknowledgement is a GOVERNED WRITE, not a local
  // opinion. It goes through the canonical writer so it survives every
  // surface, is attributable, and is visible to the pattern engine. This is
  // the one S1 command that does not work with the store down, and that is
  // correct: an ack nothing recorded did not happen.
  // §FIX 2026-07-27 — found by adversarial simulation (UC7.1): ack reported
  // ok:true for a uuid that matched NO fault. It wrote a real ledger row
  // acknowledging something that never existed, which is worse than failing:
  // it manufactures evidence. An operator could "clear" a typo and believe a
  // real fault was handled, and the ledger would agree with them forever.
  //
  // §SEN-7's shape exactly — reporting success for work that did not happen.
  const known = readFaults({ limit: 9999, all: true });
  if (!known.observed) {
    out({ ok: false, error: `cannot verify the fault exists: ${known.reason}` });
    say(`${C.red}✗ ack refused — the store is unreadable, so this fault cannot be verified${C.off}`);
    say(`${C.dim}  Acknowledging an unverifiable fault would record a fact nobody established.${C.off}`);
    return 1;
  }
  const target = known.faults.find(x => String(x.uuid) === uuid || String(x.uuid).startsWith(uuid));
  if (!target) {
    out({ ok: false, error: 'no such fault', uuid });
    say(`${C.red}✗ no fault matches ${uuid}${C.off}`);
    say(`${C.dim}  Nothing acknowledged. Recording an ack for a fault that does not exist would manufacture evidence.${C.off}`);
    return 1;
  }

  try {
    const { write } = require(path.join(ROOT, 'lib/component-ledger'));
    const row = write({
      system: 'sentinel', component: 'sentinel.faults', action: 'fault.acknowledged',
      status: 'ok', tags: ['sentinel', 'ack'],
      hook: 'sentinel.cli.faults.ack', wire: 'sentinel.cli',
      intent: `operator acknowledged ${uuid}`,
      faultId: uuid, causedBy: uuid,
      detail: { uuid: target.uuid, note: args.note || null, by: process.env.USER || 'cli',
                // the fault as it stood when acknowledged — so the row can be
                // audited without trusting that the fault still looks the same
                faultType: target.type, faultSystem: target.system, faultSource: target.source },
    });
    if (!row) throw new Error('canonical write refused');
    out({ ok: true, acknowledged: target.uuid, faultType: target.type, ledgerUuid: row.uuid });
    say(`${C.grn}✓ acknowledged${C.off} ${target.type} ${C.dim}${target.uuid}${C.off}`);
    say(`  ${C.dim}ledger ${row.uuid}${C.off}`);
    return 0;
  } catch (e) {
    out({ ok: false, error: e.message });
    say(`${C.red}✗ ack NOT recorded: ${e.message}${C.off}`);
    say(`${C.dim}  Reporting success here would be exactly the failure SEN-7 forbids.${C.off}`);
    return 1;
  }
}

function cmdContract() {
  const c = contract();
  if (JSON_OUT) { console.log(JSON.stringify(c, null, 2)); return 0; }
  console.log(JSON.stringify(c, null, 2));
  return 0;
}

// ── dispatch, derived FROM the contract ──────────────────────────────────────
const HANDLERS = {
  'sentinel contract':    cmdContract,
  'sentinel status':      cmdStatus,
  'sentinel faults list': cmdFaultsList,
  'sentinel faults show': cmdFaultsShow,
  'sentinel faults ack':  cmdAck,
  'sentinel scan':        cmdScan,
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

function usage(c) {
  console.log(`${C.bold}sentinel${C.off} ${C.dim}— ${c.role}${C.off}\n`);
  for (const cmd of c.commands) {
    const a = (cmd.args || []).map(x => `<${x.name}>`).join(' ');
    console.log(`  ${C.cyn}${cmd.cmd}${C.off} ${a}`);
    console.log(`      ${C.dim}${cmd.description}${C.off}`);
    if (cmd.gated) console.log(`      ${C.yel}gated — writes to the ledger${C.off}`);
    if (cmd.worksOffline === false) console.log(`      ${C.dim}requires the store${C.off}`);
  }
  console.log(`\n  ${C.dim}--json for machine-readable output${C.off}`);
}

function main() {
  const c = contract();
  const argv = process.argv.slice(2).filter(a => a !== '--json');

  // §CONTRACT IS THE SURFACE — verify this CLI matches its own declaration at
  // startup. A command that drifts from the contract is caught HERE rather
  // than discovered by a user, which is the whole reason the contract exists.
  const declared = c.commands.map(x => x.cmd).sort();
  const implemented = Object.keys(HANDLERS).sort();
  const missing = declared.filter(x => !implemented.includes(x));
  const extra = implemented.filter(x => !declared.includes(x));
  if (missing.length || extra.length) {
    console.error(`${C.red}[${MODULE_ID}] §contract drift — CLI and contract disagree${C.off}`);
    if (missing.length) console.error(`  declared but NOT implemented: ${missing.join(', ')}`);
    if (extra.length)   console.error(`  implemented but NOT declared: ${extra.join(', ')}  ${C.dim}(a command not in the contract does not exist)${C.off}`);
    process.exit(3);
  }

  if (!argv.length || argv[0] === 'help' || argv[0] === '--help') { usage(c); return 0; }

  // Longest-match dispatch so 'faults list' wins over a bare 'faults'.
  const tried = `sentinel ${argv.join(' ')}`;
  for (const key of Object.keys(HANDLERS).sort((a, b) => b.length - a.length)) {
    if (tried === key || tried.startsWith(key + ' ')) {
      return HANDLERS[key](parseArgs(argv.slice(key.split(' ').length - 1)));
    }
  }
  console.error(`${C.red}unknown command: ${argv.join(' ')}${C.off}`);
  usage(c);
  return 2;
}

if (require.main === module) process.exit(main());
module.exports = { readFaults, contract, HANDLERS, CONTRACT_PATH };
