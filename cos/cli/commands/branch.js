'use strict';
/**
 * cli/commands/branch.js — cos branch <subcommand>
 * UUID: cos-cli-branch-v1-0000-4000-0000-000000000001
 *
 * cos branch fork   <compartment> [--label <name>] [--from <branchId>]
 * cos branch list   <compartment>
 * cos branch diff   <compartment> <branchA> <branchB>
 * cos branch run    <compartment> <branchId> [--cmd <file>] [--timeout <ms>]
 * cos branch show   <compartment> <branchId>
 * cos branch rm     <compartment> <branchId>
 * cos branch checkout <compartment> <branchId>
 */

'use strict';

const { BranchEngine }  = require('../../playground/branch.js');
const { SandboxRunner } = require('../../playground/sandbox.js');

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

function _fmtDuration(ms) {
  if (!ms) return dim('—');
  if (ms < 1000) return `${ms}ms`;
  return `${(ms/1000).toFixed(1)}s`;
}

function _fmtDate(ts) {
  if (!ts) return dim('—');
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

// ── fork ─────────────────────────────────────────────────────────────────────

function cmdFork(host, compName, flags = {}) {
  const comp   = _resolveComp(host, compName);
  const result = BranchEngine.fork(comp, {
    label:        flags.label || flags.l || null,
    fromBranchId: flags.from  || flags.f || null,
  });

  console.log('');
  console.log(`  ${ok('✓')} Branch forked`);
  console.log(`  ${dim('id:')}     ${hi(result.id)}`);
  console.log(`  ${dim('label:')}  ${result.label}`);
  console.log(`  ${dim('from:')}   ${result.manifest.forkedFrom}`);
  console.log(`  ${dim('hash:')}   ${dim(result.manifest.snapshotHash)}`);
  console.log(`  ${dim('root:')}   ${dim(result.root)}`);
  console.log('');
  return result;
}

// ── list ──────────────────────────────────────────────────────────────────────

function cmdList(host, compName) {
  const comp     = _resolveComp(host, compName);
  const branches = BranchEngine.list(comp);

  console.log('');
  if (!branches.length) {
    console.log(`  ${dim('No branches. Use:')} cos branch fork ${compName}`);
    console.log('');
    return;
  }

  const COL = [12, 20, 18, 16, 10];
  console.log(
    `  ${c(C.bold, 'ID'.padEnd(COL[0]))}` +
    `${c(C.bold, 'LABEL'.padEnd(COL[1]))}` +
    `${c(C.bold, 'FORKED FROM'.padEnd(COL[2]))}` +
    `${c(C.bold, 'FORKED AT'.padEnd(COL[3]))}` +
    `${c(C.bold, 'RUNS'.padEnd(COL[4]))}` +
    c(C.bold, 'STATUS')
  );
  console.log('  ' + '─'.repeat(90));

  for (const br of branches) {
    const dirtyMark = br.dirty ? warn(' ∙') : '';
    const runMark   = br.runs?.length
      ? (br.runs[br.runs.length-1]?.ok ? ok(` ${br.runs.length}`) : err(` ${br.runs.length}`))
      : dim(' 0');

    console.log(
      `  ${hi(br.id.padEnd(COL[0]))}` +
      `${(br.label || '').padEnd(COL[1])}` +
      `${(br.forkedFrom || '').slice(0, 17).padEnd(COL[2])}` +
      `${_fmtDate(br.forkedAt).padEnd(COL[3])}` +
      `${runMark.padEnd(COL[4])}` +
      dirtyMark
    );
  }
  console.log('');
}

// ── show ──────────────────────────────────────────────────────────────────────

function cmdShow(host, compName, branchId) {
  const comp = _resolveComp(host, compName);
  const br   = BranchEngine.get(comp, branchId);
  if (!br) { console.log(err(`  Branch not found: ${branchId}`)); return; }

  console.log('');
  console.log(`  ${c(C.bold, 'Branch')} ${hi(br.id)}`);
  console.log(`  ${dim('label:')}    ${br.label}`);
  console.log(`  ${dim('forked:')}   ${_fmtDate(br.forkedAt)} from ${br.forkedFrom}`);
  console.log(`  ${dim('hash:')}     ${dim(br.snapshotHash)}`);

  if (br.checkouts?.length) {
    console.log(`  ${dim('checkouts:')} ${br.checkouts.length} (last: ${_fmtDate(br.checkouts[br.checkouts.length-1]?.at)})`);
  }

  if (br.runs?.length) {
    console.log('');
    console.log(`  ${c(C.bold, 'Run history')} (${br.runs.length})`);
    for (const run of br.runs.slice(-5)) {
      const mark = run.ok ? ok('✓') : err('✗');
      console.log(
        `  ${mark} ${_fmtDate(run.recordedAt)} ` +
        `exit:${run.exitCode} ` +
        `${_fmtDuration(run.durationMs)} ` +
        (run.killedByTimeout ? warn('[timeout]') : '') +
        (run.error ? err(`[${run.error.slice(0,40)}]`) : '')
      );
    }
  }
  console.log('');
}

// ── diff ──────────────────────────────────────────────────────────────────────

function cmdDiff(host, compName, branchA, branchB, flags = {}) {
  const comp   = _resolveComp(host, compName);
  const report = BranchEngine.diff(comp, branchA, branchB);

  if (report.error) {
    console.log(err(`  Diff error: ${report.error}`));
    return;
  }

  const { summary, added, removed, modified, fileDiffs } = report;

  console.log('');
  console.log(`  ${c(C.bold, 'File diff')} ${hi(branchA)} ${dim('→')} ${hi(branchB)}`);
  console.log(
    `  ${ok('+' + summary.added)}  ` +
    `${err('-' + summary.removed)}  ` +
    `${warn('~' + summary.modified)}  ` +
    `${dim('=' + summary.unchanged)}`
  );

  if (added.length)    { console.log(''); added.forEach(f    => console.log(`  ${ok('+' + f)}`)); }
  if (removed.length)  { console.log(''); removed.forEach(f  => console.log(`  ${err('-' + f)}`)); }
  if (modified.length) { console.log(''); modified.forEach(f => console.log(`  ${warn('~' + f)}`)); }

  // Inline diff hunks
  if (flags.full || flags.content) {
    for (const [file, diff] of Object.entries(fileDiffs || {})) {
      if (!diff.hunks?.length) continue;
      console.log('');
      console.log(`  ${dim('─── ' + file + ' ───')}`);
      for (const hunk of diff.hunks) {
        for (const line of hunk.lines || []) {
          if      (line.type === 'added')   console.log(`  ${ok('+ ' + line.text)}`);
          else if (line.type === 'removed') console.log(`  ${err('- ' + line.text)}`);
          else                              console.log(`  ${dim('  ' + line.text)}`);
        }
      }
    }
  }

  console.log('');
}

// ── run ───────────────────────────────────────────────────────────────────────

async function cmdRun(host, compName, branchId, flags = {}) {
  const comp = _resolveComp(host, compName);

  if (SandboxRunner.isRunning(comp, branchId)) {
    console.log(warn(`  Already running: ${branchId}`));
    return;
  }

  console.log('');
  console.log(`  ${dim('▶')} Running ${hi(branchId)}${flags.cmd ? dim(' → ' + flags.cmd) : ''}…`);
  console.log('  ' + '─'.repeat(60));

  const result = await SandboxRunner.run(comp, branchId, {
    command:    flags.cmd || flags.c || null,
    args:       flags.args ? flags.args.split(',') : [],
    runtimeId:  flags.runtime || null,
    timeoutMs:  parseInt(flags.timeout || flags.t || '30000'),
    bus:        host.bus || null,
    onLine: (line, stream) => {
      const prefix = stream === 'stderr' ? err('  ⚠ ') : dim('  │ ');
      console.log(prefix + line);
    },
  });

  console.log('  ' + '─'.repeat(60));
  const mark = result.ok ? ok('✓') : err('✗');
  console.log(
    `  ${mark} exit:${result.exitCode} ` +
    _fmtDuration(result.durationMs) +
    (result.killedByTimeout ? warn(' [TIMEOUT]') : '') +
    (result.killedByOutputLimit ? warn(' [OUTPUT LIMIT]') : '')
  );
  console.log('');
  return result;
}

// ── checkout ──────────────────────────────────────────────────────────────────

function cmdCheckout(host, compName, branchId) {
  const comp = _resolveComp(host, compName);
  console.log('');
  console.log(warn(`  ⚠  This will overwrite the working tree of ${compName}.`));

  try {
    BranchEngine.checkout(comp, branchId);
    console.log(`  ${ok('✓')} Checked out ${hi(branchId)} → working tree`);
  } catch (e) {
    console.log(`  ${err('✗')} ${e.message}`);
  }
  console.log('');
}

// ── rm ────────────────────────────────────────────────────────────────────────

function cmdRm(host, compName, branchId) {
  const comp   = _resolveComp(host, compName);
  const result = BranchEngine.destroy(comp, branchId);
  if (result.ok) {
    console.log(`\n  ${ok('✓')} Destroyed branch ${hi(branchId)}\n`);
  } else {
    console.log(`\n  ${err('✗')} ${result.reason}\n`);
  }
}

// ── kill ──────────────────────────────────────────────────────────────────────

function cmdKill(host, compName, branchId) {
  const comp   = _resolveComp(host, compName);
  const result = SandboxRunner.kill(comp, branchId);
  if (result.ok) {
    console.log(`\n  ${ok('✓')} Killed sandbox ${hi(branchId)}\n`);
  } else {
    console.log(`\n  ${warn('─')} ${result.reason}\n`);
  }
}

// ── dispatcher ───────────────────────────────────────────────────────────────

async function run(host, args) {
  const sub      = args[0];
  const compName = args[1];
  const rest     = args.slice(2);

  // Parse --flags
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

  if (!sub || !compName) {
    _usage();
    return;
  }

  switch (sub) {
    case 'fork':     cmdFork(host, compName, flags); break;
    case 'list':     cmdList(host, compName); break;
    case 'show':     cmdShow(host, compName, pos[0] || flags.id); break;
    case 'diff':     cmdDiff(host, compName, pos[0], pos[1] || flags.b, flags); break;
    case 'run':      await cmdRun(host, compName, pos[0] || flags.id, flags); break;
    case 'checkout': cmdCheckout(host, compName, pos[0] || flags.id); break;
    case 'rm':       cmdRm(host, compName, pos[0] || flags.id); break;
    case 'kill':     cmdKill(host, compName, pos[0] || flags.id); break;
    default:         _usage();
  }
}

function _usage() {
  console.log(`
  ${c(C.bold, 'cos branch')} — isolated playground for compartment repos

  ${c(C.bold, 'Commands:')}
    ${hi('fork')}      <compartment> [--label <name>] [--from <branchId>]
    ${hi('list')}      <compartment>
    ${hi('show')}      <compartment> <branchId>
    ${hi('diff')}      <compartment> <branchA> <branchB> [--full]
    ${hi('run')}       <compartment> <branchId> [--cmd <file>] [--timeout <ms>]
    ${hi('checkout')}  <compartment> <branchId>      destructive — overwrites working tree
    ${hi('rm')}        <compartment> <branchId>
    ${hi('kill')}      <compartment> <branchId>      kill running sandbox

  ${c(C.bold, 'Examples:')}
    cos branch fork my-project --label "before-refactor"
    cos branch fork my-project --from br-a1b2c3d4 --label "variant-2"
    cos branch diff my-project br-a1b2c3d4 br-e5f6g7h8 --full
    cos branch run  my-project br-a1b2c3d4 --cmd test.js --timeout 60000
    cos branch list my-project
`);
}

module.exports = { run };
