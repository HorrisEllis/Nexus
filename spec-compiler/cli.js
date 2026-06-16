#!/usr/bin/env node
'use strict';
/**
 * spec-compiler/cli.js — NEXUS Spec Compiler CLI
 * UUID: spec-cli-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * nexus-spec compile <file>       — compile .spec file
 * nexus-spec validate <file>      — validate without emitting
 * nexus-spec diff <file1> <file2> — diff two compiled specs
 * nexus-spec gaps <file>          — list all gaps
 * nexus-spec bench [--self]       — run token benchmark
 * nexus-spec dispatch <file>      — compile + dispatch T2/T3 to Guardian
 */

const path    = require('path');
const fs      = require('fs');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  c: '\x1b[36m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', t: '\x1b[90m',
};

function log(msg)  { process.stdout.write(msg + '\n'); }
function err(msg)  { process.stderr.write(`${C.r}error:${C.reset} ${msg}\n`); process.exit(1); }
function ok(msg)   { log(`${C.g}✓${C.reset} ${msg}`); }
function info(msg) { log(`${C.t}${msg}${C.reset}`); }

const args = process.argv.slice(2);
const cmd  = args[0];

if (!cmd || cmd === 'help' || cmd === '--help') {
  log(`
${C.bold}${C.c}NEXUS Spec Compiler${C.reset}

  ${C.bold}nexus-spec <command> [options]${C.reset}

Commands:
  ${C.c}compile${C.reset}  <file>            Compile .spec → T0/T1 scaffold
  ${C.c}validate${C.reset} <file>            Validate spec without emitting
  ${C.c}gaps${C.reset}     <file>            List all gaps in a spec
  ${C.c}bench${C.reset}    [--self]          Token reduction benchmark
  ${C.c}dispatch${C.reset} <file>            Compile + dispatch T2/T3 to Guardian
  ${C.c}diff${C.reset}     <file1> <file2>   Compare two compiled specs

Options:
  ${C.t}--output <dir>   Output directory (default: ./out)
  --provider <p>  LLM provider: claude|chatgpt|ollama (default: claude)
  --verbose       Verbose pipeline output${C.reset}
`);
  process.exit(0);
}

async function main() {
  switch(cmd) {

    case 'compile': {
      const file = args[1];
      if (!file) err('Usage: nexus-spec compile <file>');
      if (!fs.existsSync(file)) err(`File not found: ${file}`);
      const outDir = args.find((a,i) => args[i-1] === '--output') || path.join(path.dirname(file), 'out');
      const verbose= args.includes('--verbose');

      info(`Compiling: ${file}`);
      const { compile } = require('./compiler/pipeline');
      const t0 = Date.now();
      const result = await compile(file, outDir, { verbose });
      const ms = Date.now() - t0;

      if (!result?.ok) {
        err('Compile failed: ' + (result?.error || 'unknown error'));
      }

      ok(`Compiled in ${ms}ms → ${outDir}`);
      log(`  Modules:   ${result.buildOrder?.length || 0}`);
      log(`  Gaps:      ${result.totalGapWeight?.toFixed?.(2) || 0}`);
      log(`  Violations:${result.violations?.criticalCount || 0} critical`);
      if (result.recommendations?.length) {
        log(`\n  Next steps:`);
        for (const r of result.recommendations.slice(0, 5)) log(`    • ${r}`);
      }
      break;
    }

    case 'validate': {
      const file = args[1];
      if (!file) err('Usage: nexus-spec validate <file>');
      if (!fs.existsSync(file)) err(`File not found: ${file}`);

      info(`Validating: ${file}`);
      const { compile } = require('./compiler/pipeline');
      const result = await compile(file, null, { skipCortex: true, skipWriteback: true, dryRun: true });

      if (result?.violations?.criticalCount > 0) {
        log(`${C.r}✗ INVALID${C.reset} — ${result.violations.criticalCount} critical violation(s)`);
        for (const v of (result.violations.violations || []).slice(0, 5)) {
          log(`  ${C.r}•${C.reset} ${v.message || v.invariantId}`);
        }
        process.exit(1);
      } else {
        ok('VALID — no critical violations');
        if (result?.totalGapWeight > 0) info(`  ${result.gapField?.getAll?.()?.length || 0} gaps (non-critical)`);
      }
      break;
    }

    case 'gaps': {
      const file = args[1];
      if (!file) err('Usage: nexus-spec gaps <file>');
      if (!fs.existsSync(file)) err(`File not found: ${file}`);

      const { compile } = require('./compiler/pipeline');
      const result = await compile(file, null, { skipCortex: true, skipWriteback: true });
      const gaps   = result?.gapField?.getAll?.() || [];

      if (!gaps.length) { ok('No gaps found'); break; }
      log(`\n${gaps.length} gaps:\n`);
      for (const g of gaps) {
        const sev = g.severity === 'critical' ? C.r : g.severity === 'high' ? C.y : C.t;
        log(`  ${sev}${g.severity || 'medium'}${C.reset}  ${g.nodeId}  ${(g.description || g.type || '').slice(0, 80)}`);
      }
      break;
    }

    case 'bench': {
      const self = args.includes('--self');
      const file = self
        ? path.join(__dirname, 'SPEC_COMPILER.spec')
        : args.find(a => !a.startsWith('-') && a !== 'bench');
      if (!file) err('Usage: nexus-spec bench <file> OR nexus-spec bench --self');
      require('./verify');
      break;
    }

    case 'dispatch': {
      const file = args[1];
      if (!file) err('Usage: nexus-spec dispatch <file>');
      if (!fs.existsSync(file)) err(`File not found: ${file}`);
      const provider = args.find((a,i) => args[i-1] === '--provider') || 'claude';
      const outDir   = args.find((a,i) => args[i-1] === '--output') || path.join(path.dirname(file), 'out');

      info(`Compiling and dispatching: ${file}`);
      const { compile } = require('./compiler/pipeline');
      const { dispatchAll } = require('./dispatch');

      const result = await compile(file, outDir);
      if (!result?.ok) err('Compile failed: ' + (result?.error || 'unknown'));

      info(`Dispatching T2/T3 to Guardian (provider: ${provider})`);
      const dispatched = await dispatchAll(result, { provider });

      log(`\n  T2 jobs: ${dispatched.t2.length}`);
      for (const r of dispatched.t2) {
        if (r.ok) ok(`  ${r.name} → job ${r.jobId}`);
        else log(`  ${C.r}✗${C.reset} ${r.name}: ${r.error}`);
      }
      if (dispatched.t3) {
        if (dispatched.t3.ok) ok(`T3 synthesis → job ${dispatched.t3.jobId}`);
        else log(`${C.r}✗${C.reset} T3 failed: ${dispatched.t3.error}`);
      }
      break;
    }

    default:
      err(`Unknown command: ${cmd}\nRun nexus-spec help`);
  }
}

main().catch(e => err(e.message));
