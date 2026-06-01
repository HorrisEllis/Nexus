#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════
// EMERGE CLI v1.0.0
// Commands:
//   emerge run <file.emerge|.eg>   compile + boot kernel
//   emerge check <file>            validate only, report gaps
//   emerge compile <file>          compile → .out.json in same dir
//   emerge spec <file.spec>        load/update schema from spec file
//   emerge status                  show kernel status
//   emerge replay <file.out.json>  reconstruct from record
//   emerge watch                   watch ./io (same as running kernel directly)
// ════════════════════════════════════════════════════════════════════════════

const fs     = require('fs');
const path   = require('path');
const kernel = require('./emerge-kernel');

const [,, cmd, ...args] = process.argv;
const file = args[0];

const CMDS = {

  run(file) {
    need(file);
    kernel.loadSpec(specFor(file));
    const src    = read(file);
    const result = kernel.compile(src, path.basename(file));
    result.kernel.boot();
    console.log('\n── status ──────────────────────────────────');
    console.log(JSON.stringify(result.kernel.status(), null, 2));
    // Stay alive if it's a loop-based kernel
    if (result.ir.loops.length > 0) {
      console.log('[cli] kernel running — ctrl+c to stop');
      process.on('SIGINT', () => { console.log('\n[cli] stopped'); process.exit(0); });
    }
  },

  check(file) {
    need(file);
    kernel.loadSpec(specFor(file));
    const src    = read(file);
    const tokens = kernel.tokenize(src);
    const { passed, noise, snr } = kernel.snrGate(tokens, path.basename(file));
    const ir     = kernel.parse(passed);
    const report = kernel.validate(ir, path.basename(file));

    console.log(`\nSNR: ${(snr * 100).toFixed(1)}% — ${passed.length} signal / ${noise.length} noise`);
    if (report.valid) {
      console.log('✓ valid — no axiom violations');
    } else {
      console.log(`✗ ${report.gaps.length} gap(s):`)
      for (const g of report.gaps) {
        const bar = '█'.repeat(Math.round(g.pressure * 10));
        console.log(`  [${g.type}] pressure ${bar} ${g.message}`);
      }
    }
  },

  compile(file) {
    need(file);
    kernel.loadSpec(specFor(file));
    const src    = read(file);
    const result = kernel.compile(src, path.basename(file));
    const outPath = file.replace(/\.[^.]+$/, '.out.json');
    const out = {
      source:     path.basename(file),
      snr:        result.snr,
      valid:      result.valid,
      gaps:       result.gaps,
      noise:      result.noise.length,
      ir_summary: {
        compartments: result.ir.compartments.length,
        invariants:   result.ir.invariants.length,
        gaps:         result.ir.gaps.length,
        loops:        result.ir.loops.length,
        laws:         result.ir.laws.length,
      },
    };
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`[cli] → ${outPath}`);
  },

  spec(file) {
    need(file);
    kernel.loadSpec(file);
    // copy as canonical spec beside the kernel
    const dest = path.join(path.dirname(require.resolve('./emerge-kernel')), 'emerge.spec');
    fs.copyFileSync(file, dest);
    console.log(`[cli] spec updated → ${dest}`);
    console.log(`      keywords: ${kernel.SCHEMA.keywords.size}`);
    console.log(`      axioms:   ${kernel.SCHEMA.axioms.size}`);
    console.log(`      gaps:     ${kernel.SCHEMA.gap_types.size}`);
  },

  status() {
    // Compile a trivial signal to get a live status
    const result = kernel.compile('system kernel\n  axiom NO_SILENT_DROP', 'status-check');
    result.kernel.boot();
    console.log(JSON.stringify(result.kernel.status(), null, 2));
  },

  replay(file) {
    need(file);
    const record = JSON.parse(read(file));
    console.log('\n── replay ──────────────────────────────────');
    console.log(`source:  ${record.source}`);
    console.log(`snr:     ${(record.snr * 100).toFixed(1)}%`);
    console.log(`valid:   ${record.valid}`);
    console.log(`regime:  ${record.status?.regime ?? 'unknown'}`);
    if (record.gaps?.length) {
      console.log(`gaps (${record.gaps.length}):`);
      for (const g of record.gaps) console.log(`  [${g.type}] ${g.message}`);
    }
    console.log('ir:', JSON.stringify(record.ir_summary, null, 2));
  },

  watch() {
    kernel.loadSpec(path.join(__dirname, 'emerge.spec'));
    kernel.watchIO();
    console.log('[cli] watching ./io — ctrl+c to stop');
    process.on('SIGINT', () => { console.log('\n[cli] stopped'); process.exit(0); });
  },

  help() {
    console.log(`
emerge <command> [file]

  run <file.emerge|.eg>    compile + boot kernel
  check <file>             validate, report gaps
  compile <file>           compile → .out.json (same dir)
  spec <file.spec>         update schema from spec file
  status                   show kernel status
  replay <file.out.json>   reconstruct from record
  watch                    watch ./io for dropped files
    `);
  },
};

// ── helpers ───────────────────────────────────────────────────────────────────
function need(f)     { if (!f) { console.error('[cli] file required'); process.exit(1); } }
function read(f)     { if (!fs.existsSync(f)) { console.error(`[cli] not found: ${f}`); process.exit(1); } return fs.readFileSync(f, 'utf8'); }
function specFor(f)  {
  // Look for .spec in same dir as file, then beside kernel
  const local = path.join(path.dirname(f), 'emerge.spec');
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, 'emerge.spec');
}

// ── dispatch ──────────────────────────────────────────────────────────────────
const fn = CMDS[cmd];
if (!fn) { console.error(`[cli] unknown command: ${cmd}`); CMDS.help(); process.exit(1); }
fn(file);
