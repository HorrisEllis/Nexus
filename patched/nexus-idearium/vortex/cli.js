#!/usr/bin/env node
'use strict';
// ── vortex/cli.js ─────────────────────────────────────────────────────────────
// UUID: vortex-cli-v1-0000-4000-0000-000000000002
// VERSION: 1.0.0
//
// VORTEX CLI — Version control for ideas, specs, artifacts, and gaps.
//
// vortex push "message"           — commit full cognitive workspace
// vortex pull                     — list snapshots or sync from remote
// vortex log                      — commit history
// vortex diff <a> <b>             — compare two commits
// vortex status                   — current workspace state
// vortex ci [spec-uuid]           — run spec compliance gate
// vortex branch <name>            — fork idea space
//
// LAW V: this IS the feature. The UI renders this.

const { vortex } = require('./index');

const C = { reset:'\x1b[0m',bold:'\x1b[1m',red:'\x1b[31m',green:'\x1b[32m',yellow:'\x1b[33m',blue:'\x1b[34m',cyan:'\x1b[36m',magenta:'\x1b[35m',gray:'\x1b[90m',teal:'\x1b[36m' };
const c = (col, t) => `${C[col]||''}${t}${C.reset}`;
const fmt = (s) => { const d=new Date(); return `${c('gray',`[${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}]`)} ${s}`; };

function parseArgs(argv) {
  const args = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
      flags[key] = val;
    } else args.push(argv[i]);
  }
  return { args, flags };
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = args;

  try {
    if (!cmd || cmd === 'help') return printHelp();

    if (cmd === 'push') {
      const message = rest.join(' ') || flags.m;
      const commit = await vortex.push(message, { tag: flags.tag, remote: flags.remote });
      console.log(fmt(`${c('green','PUSH')}  ${c('bold', commit.hash.slice(0,8))}  "${commit.message}"`));
      console.log(`  ${c('gray','ideas:')} ${commit.ideaCount}  ${c('gray','specs:')} ${commit.specCount}  ${c('gray','gaps:')} ${commit.gapCount}  ${c('gray','snr:')} ${(commit.snr||0).toFixed(2)}`);
      if (commit.remoteSync !== undefined) {
        console.log(`  ${c('gray','remote:')} ${commit.remoteSync ? c('green','synced') : c('yellow','local only — ' + commit.remoteSyncError)}`);
      }
      return;
    }

    if (cmd === 'pull') {
      const data = await vortex.pull({ uuid: flags.restore, remote: flags.remote });
      if (data.snapshot) {
        console.log(fmt(`${c('yellow','RESTORE')}  ${data.snapshot.hash?.slice(0,8)}  "${data.snapshot.message}"`));
        if (data.warning) console.log(`  ${c('yellow','⚠')} ${data.warning}`);
        return;
      }
      const snaps = data.snapshots || [];
      console.log(fmt(`${c('bold','PULL')}  ${snaps.length} snapshots  (source: ${data.source})`));
      for (const s of snaps.slice(-15).reverse()) {
        const d = new Date(s.ts).toISOString().slice(0,16).replace('T',' ');
        console.log(`  ${c('cyan', s.hash?.slice(0,8))}  ${c('gray',d)}  ideas:${s.ideaCount} gaps:${s.gapCount}  "${(s.message||'').slice(0,40)}"`);
      }
      return;
    }

    if (cmd === 'log') {
      const n = parseInt(flags.n || rest[0] || '20');
      const snaps = await vortex.log(n);
      console.log(fmt(`${c('bold','LOG')}  last ${snaps.length} commits`));
      for (const s of snaps) {
        const d = new Date(s.ts).toISOString().slice(0,16).replace('T',' ');
        const gapColor = s.gapCount > 0 ? 'coral' : 'green';
        console.log(`  ${c('cyan', s.hash?.slice(0,8))}  ${c('gray',d)}  ${c(gapColor,`gaps:${s.gapCount}`)}  "${(s.message||'').slice(0,50)}"`);
      }
      return;
    }

    if (cmd === 'diff') {
      const [a, b] = rest;
      if (!a || !b) { console.error('diff: two hashes required'); process.exit(1); }
      const result = await vortex.diff(a, b);
      console.log(fmt(`${c('bold','DIFF')}  ${a.slice(0,8)} → ${b.slice(0,8)}`));
      if (result.ok === false) { console.error(result.error); process.exit(1); }
      console.log(`  ${c('green','+ ideas added:')}   ${result.ideas?.added || 0}`);
      console.log(`  ${c('red','- ideas removed:')} ${result.ideas?.removed || 0}`);
      console.log(`  ${c('yellow','~ ideas changed:')} ${result.ideas?.changed || 0}`);
      const gapDelta = result.gaps?.delta || 0;
      console.log(`  ${c('gray','gap delta:')}     ${gapDelta > 0 ? c('red',`+${gapDelta}`) : c('green', String(gapDelta))}`);
      const snrDelta = result.snr?.delta || 0;
      console.log(`  ${c('gray','snr delta:')}     ${snrDelta > 0 ? c('green',`+${snrDelta.toFixed(3)}`) : c('red', snrDelta.toFixed(3))}`);
      return;
    }

    if (cmd === 'status') {
      const s = await vortex.status();
      console.log(fmt(`${c('bold','VORTEX')} v${s.version}`));
      console.log(`  ${c('gray','ideas:')}     ${s.ideas}  (${Object.entries(s.byPhase||{}).map(([k,v])=>v>0?`${k}:${v}`:'').filter(Boolean).join(' ')})`);
      console.log(`  ${c('gray','specs:')}     ${s.specs}`);
      console.log(`  ${c('gray','open gaps:')} ${s.openGaps > 0 ? c('red', s.openGaps) : c('green','0')}`);
      console.log(`  ${c('gray','snapshots:')} ${s.snapshots}`);
      if (s.head) console.log(`  ${c('gray','HEAD:')}      ${c('cyan', s.head.hash)}  "${s.head.message}"`);
      if (s.snr)  console.log(`  ${c('gray','SNR:')}       ${(s.snr.ratio||0).toFixed(3)}  (signal:${s.snr.signal||0} noise:${s.snr.noise||0})`);
      return;
    }

    if (cmd === 'ci') {
      const specUuid = rest[0] || flags.spec;
      const result = await vortex.ci(specUuid, { strict: flags.strict });
      if (result.runs) {
        // Multiple specs
        console.log(fmt(`${result.ok ? c('green','CI PASS ✓') : c('red','CI FAIL ✗')}  ${result.passed}/${result.total} specs`));
        for (const run of result.runs) {
          const icon = run.ok ? c('green','✓') : c('red','✗');
          console.log(`  ${icon} ${(run.spec?.name||run.specUuid||'?').slice(0,50).padEnd(52)} ${run.passed}/${run.total}`);
        }
      } else {
        console.log(fmt(`${result.ok ? c('green','CI PASS ✓') : c('red','CI FAIL ✗')}  ${specUuid?.slice(0,8)}  ${result.passed}/${result.total}`));
        for (const check of result.checks || []) {
          const icon = check.pass ? c('green','✓') : c('red','✗');
          console.log(`  ${icon} ${check.label.padEnd(42)} ${c('gray',check.detail||'')}`);
        }
      }
      if (!result.ok) process.exit(1);
      return;
    }

    if (cmd === 'branch') {
      const name = rest[0];
      if (!name) { console.error('branch: name required'); process.exit(1); }
      const b = await vortex.branch(name, { fromHash: flags.from });
      console.log(fmt(`${c('magenta','BRANCH')}  ${name}  root:${b.root.slice(0,8)}`));
      return;
    }

    console.error(`Unknown command: ${cmd}. Run: vortex help`);
    process.exit(1);

  } catch (err) {
    console.error(`${c('red','✗')} vortex ${cmd} failed: ${err.message}`);
    if (flags.verbose) console.error(err.stack);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
${c('bold','VORTEX v1.0.0')} — Version control for ideas, specs, and artifacts
${c('gray','Not just files. The entire cognitive workspace.')}

${c('cyan','CORE COMMANDS')}
  push [message] [--tag <tag>] [--remote <url>]
                          Commit full workspace (ideas + specs + gaps)
  pull [--restore <hash>] [--remote <url>]
                          List commits or sync from remote
  log [n] [--n 20]        Commit history with gap counts
  diff <hashA> <hashB>    Compare two commits (ideas, specs, gaps, SNR)
  status                  Current workspace state
  branch <name>           Fork idea space (tagged snapshot root)
  ci [spec-uuid]          Run spec compliance gate on all or one spec

${c('cyan','WHAT MAKES THIS DIFFERENT FROM GIT')}
  ${c('gray','1.')} Ideas are first-class version objects — not just code
  ${c('gray','2.')} Tension score shows which ideas are generating friction
  ${c('gray','3.')} Causal chains link every commit to the idea that caused it
  ${c('gray','4.')} CI = spec compliance, not just test coverage
  ${c('gray','5.')} Branches are living idea spaces that accumulate tension
  ${c('gray','6.')} SNR delta shows if each commit increased signal or noise
  ${c('gray','7.')} Gap count in every commit — you can see if you're resolving or creating gaps

${c('gray','Requires idearium API running at :4800 — start with: node idearium/api')}
`);
}

main();
