'use strict';
/**
 * cli/commands/compare.js — cos compare <subcommand>
 * UUID: cos-cli-compare-v1-0000-4000-0000-000000000001
 *
 * cos compare run      <compartment> <branchA> <branchB> [--cmd <file>] [--label <name>]
 * cos compare branches <compartment> <br1> <br2> [<br3>…]
 * cos compare reports  <compartment>
 * cos compare show     <compartment> <reportId>
 */

'use strict';

const { CompareEngine } = require('../../playground/compare.js');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', white: '\x1b[37m',
  magenta: '\x1b[35m',
};
const c = (col, s) => `${col}${s}${C.reset}`;
const dim  = s => c(C.dim, s);
const ok   = s => c(C.green, s);
const err  = s => c(C.red, s);
const hi   = s => c(C.cyan, s);
const warn = s => c(C.yellow, s);

function _resolveComp(host, name) {
  const comp = host.store.getCompartmentByName(name) || host.store.getCompartment(name);
  if (!comp) throw new Error(`compartment not found: "${name}"`);
  return comp;
}

function _fmtDate(ts) {
  if (!ts) return dim('—');
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

function _verdictColor(v) {
  switch(v) {
    case 'fixed':      return ok;
    case 'improved':   return ok;
    case 'identical':  return dim;
    case 'changed':    return warn;
    case 'degraded':   return warn;
    case 'regression': return err;
    default:           return dim;
  }
}

// ── compare run ───────────────────────────────────────────────────────────────

async function cmdRun(host, compName, branchA, branchB, flags = {}) {
  const comp = _resolveComp(host, compName);

  console.log('');
  console.log(`  ${dim('⚡')} Comparing ${hi(branchA)} vs ${hi(branchB)}`);
  if (flags.cmd) console.log(`  ${dim('command:')} ${flags.cmd}`);
  console.log('');

  const report = await CompareEngine.runCompare(comp, branchA, branchB, {
    command:   flags.cmd   || flags.c    || null,
    label:     flags.label || flags.l    || null,
    timeoutMs: parseInt(flags.timeout || flags.t || '30000'),
    bus:       host.bus || null,
  });

  _renderReport(report);
  return report;
}

// ── compare branches (metrics only, no re-run) ────────────────────────────────

function cmdBranches(host, compName, branchIds) {
  const comp       = _resolveComp(host, compName);
  const comparison = CompareEngine.compareBranches(comp, branchIds);

  console.log('');
  console.log(`  ${c(C.bold, 'Branch comparison')} — ${branchIds.length} branches`);

  if (!comparison.rows.length) {
    console.log(`  ${dim('No data. Run branches first.')}`);
    console.log('');
    return;
  }

  // Header
  const idW   = 14;
  const lblW  = 18;
  const rcW   = 8;
  const pasW  = 8;
  const durW  = 10;

  console.log('');
  console.log(
    `  ${c(C.bold, 'BRANCH'.padEnd(idW))}` +
    `${c(C.bold, 'LABEL'.padEnd(lblW))}` +
    `${c(C.bold, 'RUNS'.padEnd(rcW))}` +
    `${c(C.bold, 'PASS'.padEnd(pasW))}` +
    `${c(C.bold, 'FAIL'.padEnd(pasW))}` +
    c(C.bold, 'LAST RUN')
  );
  console.log('  ' + '─'.repeat(80));

  for (const row of comparison.rows) {
    const passStr = row.passed !== null ? ok(String(row.passed)) : dim('—');
    const failStr = row.failed !== null ? (row.failed > 0 ? err(String(row.failed)) : ok('0')) : dim('—');

    console.log(
      `  ${hi(row.branchId.padEnd(idW))}` +
      `${(row.label || '').slice(0, lblW-1).padEnd(lblW)}` +
      `${String(row.runCount).padEnd(rcW)}` +
      `${(passStr + '        ').slice(0, pasW + 7)}` +
      `${(failStr + '        ').slice(0, pasW + 7)}` +
      `${_fmtDate(row.lastRunAt)}`
    );
  }

  // Metric columns if available
  if (comparison.metrics.length) {
    console.log('');
    console.log(`  ${c(C.bold, 'Metrics:')} ${comparison.metrics.join(', ')}`);
  }

  console.log('');
}

// ── compare reports ───────────────────────────────────────────────────────────

function cmdReports(host, compName) {
  const comp    = _resolveComp(host, compName);
  const reports = CompareEngine.listReports(comp);

  console.log('');
  if (!reports.length) {
    console.log(`  ${dim('No comparison reports. Use: cos compare run ' + compName + ' <brA> <brB>')}`);
    console.log('');
    return;
  }

  const idW  = 14;
  const lblW = 24;
  const vdW  = 12;

  console.log(
    `  ${c(C.bold, 'ID'.padEnd(idW))}` +
    `${c(C.bold, 'LABEL'.padEnd(lblW))}` +
    `${c(C.bold, 'VERDICT'.padEnd(vdW))}` +
    c(C.bold, 'FINISHED AT')
  );
  console.log('  ' + '─'.repeat(70));

  for (const r of reports) {
    const vFn = _verdictColor(r.verdict);
    console.log(
      `  ${hi(r.id.padEnd(idW))}` +
      `${(r.label||'').slice(0, lblW-1).padEnd(lblW)}` +
      `${(vFn(r.verdict||'—') + '          ').slice(0, vdW+9)}` +
      `${_fmtDate(r.finishedAt)}`
    );
  }
  console.log('');
}

// ── compare show ──────────────────────────────────────────────────────────────

function cmdShow(host, compName, reportId) {
  const comp   = _resolveComp(host, compName);
  const report = CompareEngine.loadReport(comp, reportId);

  if (!report) {
    console.log(err(`\n  Report not found: ${reportId}\n`));
    return;
  }

  _renderReport(report);
}

// ── render ────────────────────────────────────────────────────────────────────

function _renderReport(report) {
  const vFn    = _verdictColor(report.verdict?.summary);
  const runA   = report.runs?.[report.branchA] || {};
  const runB   = report.runs?.[report.branchB] || {};

  console.log(`  ${c(C.bold, 'Compare Report')} ${dim(report.id)}`);
  console.log(`  ${dim('label:')}   ${report.label || dim('—')}`);
  console.log(`  ${dim('verdict:')} ${vFn((report.verdict?.summary || '—').toUpperCase())}`);
  console.log('');

  // Run table
  console.log(`  ${c(C.bold, 'Runs:')}`);
  const colW = 12;
  console.log(
    `  ${dim('BRANCH'.padEnd(colW))}` +
    `${dim('OK'.padEnd(8))}` +
    `${dim('EXIT'.padEnd(8))}` +
    `${dim('DURATION'.padEnd(12))}` +
    dim('OUTPUT')
  );
  console.log('  ' + '─'.repeat(70));

  for (const [brId, run] of [[report.branchA, runA], [report.branchB, runB]]) {
    const okMark = run.ok ? ok('✓') : err('✗');
    const durStr = run.durationMs ? `${(run.durationMs/1000).toFixed(2)}s` : '—';
    const outLen = (run.stdout || '').length + (run.stderr || '').length;
    console.log(
      `  ${hi(brId.padEnd(colW))}` +
      `${(okMark + '      ').slice(0, 15)}` +
      `${String(run.exitCode ?? '—').padEnd(8)}` +
      `${durStr.padEnd(12)}` +
      `${dim(outLen + ' bytes')}`
    );
  }

  // Regressions
  const regs = report.regression?.regressions || [];
  const imps = report.regression?.improvements || [];
  if (regs.length || imps.length) {
    console.log('');
    if (regs.length) {
      console.log(`  ${err('Regressions:')}`);
      regs.forEach(r => console.log(`  ${err('✗')} ${r.type}: ${r.detail}`));
    }
    if (imps.length) {
      console.log(`  ${ok('Improvements:')}`);
      imps.forEach(r => console.log(`  ${ok('✓')} ${r.type}: ${r.detail}`));
    }
  }

  // File diff summary
  const fs_ = report.fileDiff?.summary;
  if (fs_) {
    console.log('');
    console.log(
      `  ${c(C.bold, 'Files:')} ` +
      `${ok('+' + (fs_.added || 0))} ` +
      `${err('-' + (fs_.removed || 0))} ` +
      `${warn('~' + (fs_.modified || 0))} ` +
      `${dim('=' + (fs_.unchanged || 0))}`
    );
  }

  // Output diff
  const od = report.outputDiff;
  if (od && !od.identical) {
    console.log('');
    console.log(`  ${c(C.bold, 'Output diff:')}`);
    if (od.testLinesA?.length || od.testLinesB?.length) {
      console.log(`  ${dim(report.branchA + ' test lines:')}`);
      od.testLinesA?.slice(0, 5).forEach(l => console.log(`  ${dim('  ' + l)}`));
      console.log(`  ${dim(report.branchB + ' test lines:')}`);
      od.testLinesB?.slice(0, 5).forEach(l => console.log(`  ${dim('  ' + l)}`));
    }
  }

  console.log('');
}

// ── dispatcher ────────────────────────────────────────────────────────────────

async function run(host, args) {
  const sub      = args[0];
  const compName = args[1];
  const rest     = args.slice(2);

  const flags = {};
  const pos   = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const [k, ...vParts] = rest[i].slice(2).split('=');
      flags[k] = vParts.length ? vParts.join('=') : (rest[i+1] && !rest[i+1].startsWith('--') ? rest[++i] : true);
    } else {
      pos.push(rest[i]);
    }
  }

  if (!sub || !compName) { _usage(); return; }

  switch (sub) {
    case 'run':      await cmdRun(host, compName, pos[0], pos[1], flags); break;
    case 'branches': cmdBranches(host, compName, pos); break;
    case 'reports':  cmdReports(host, compName); break;
    case 'show':     cmdShow(host, compName, pos[0] || flags.id); break;
    default:         _usage();
  }
}

function _usage() {
  console.log(`
  ${c(C.bold, 'cos compare')} — run and compare branch iterations

  ${c(C.bold, 'Commands:')}
    ${hi('run')}       <compartment> <branchA> <branchB>  run both and compare
                     [--cmd <file>] [--label <name>] [--timeout <ms>]
    ${hi('branches')} <compartment> <br1> <br2> [<br3>…]  compare metrics without re-running
    ${hi('reports')}  <compartment>                       list saved comparison reports
    ${hi('show')}     <compartment> <reportId>             show a saved report

  ${c(C.bold, 'Examples:')}
    cos compare run      my-project br-a1b2 br-c3d4 --cmd test.js
    cos compare branches my-project br-a1b2 br-c3d4 br-e5f6
    cos compare reports  my-project
    cos compare show     my-project cmp-12345678
`);
}

module.exports = { run };
