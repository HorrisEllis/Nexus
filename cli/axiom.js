#!/usr/bin/env node
'use strict';
/**
 * cli/axiom.js
 * comp_id: nexus.cli.axiom
 * uuid: nexus-cli-axiom-v1-0000-2026-0627-jamesbrooks-001
 *
 * CLI: nexus axiom <command> [args]
 *
 * Commands:
 *   axiom list [--tier IMMUTABLE|RUNTIME|PATTERN]
 *   axiom add §X.Y "text" [--reason "why"]
 *   axiom remove §X.Y [--force]
 *   axiom freeze §X.Y
 *   axiom check "text to check against axioms"
 *   axiom summary
 */

const am = require('../copilot/axiom-manager');

const [,, cmd, ...args] = process.argv;

function color(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`;
}
const cyan  = t => color('36', t);
const green = t => color('32', t);
const red   = t => color('31', t);
const dim   = t => color('2',  t);
const bold  = t => color('1',  t);

const TIER_COLOR = {
  IMMUTABLE: t => color('33', t),  // amber
  RUNTIME:   t => color('36', t),  // cyan
  PATTERN:   t => color('35', t),  // magenta
};

function printAxiom(a) {
  const tierFn  = TIER_COLOR[a.tier] || (t => t);
  const frozen  = a.frozen ? ' 🔒' : '';
  console.log(`  ${tierFn(a.id.padEnd(10))} ${bold(a.text.slice(0, 80))}${frozen}`);
  if (a.reason) console.log(`  ${dim(''.padEnd(10))} ${dim('↳ ' + a.reason)}`);
}

switch (cmd) {
  case 'list': {
    const tierArg = args.find(a => !a.startsWith('--')) || null;
    const tier    = tierArg?.replace('--tier=','').toUpperCase() || null;
    const axioms  = am.list({ tier });

    console.log(bold('\nNEXUS Axioms'));
    const tiers = ['IMMUTABLE', 'RUNTIME', 'PATTERN'];
    for (const t of tiers) {
      const group = axioms.filter(a => a.tier === t);
      if (!group.length) continue;
      console.log(`\n${TIER_COLOR[t](t)} (${group.length})`);
      group.forEach(printAxiom);
    }
    const s = am.summary();
    console.log(dim(`\n  Total: ${s.total} (${s.immutable} immutable · ${s.runtime} runtime · ${s.pattern} pattern)`));
    break;
  }

  case 'add': {
    const id      = args[0];
    const text    = args[1];
    const reason  = args.indexOf('--reason') >= 0 ? args[args.indexOf('--reason') + 1] : null;
    if (!id || !text) {
      console.error(red('Usage: axiom add §X.Y "text" [--reason "why"]'));
      process.exit(1);
    }
    try {
      const axiom = am.add(id, text, { reason });
      console.log(green(`✓ Added ${axiom.tier} axiom ${axiom.id}`));
      printAxiom(axiom);
    } catch(e) { console.error(red(`✗ ${e.message}`)); process.exit(1); }
    break;
  }

  case 'remove': {
    const id    = args[0];
    const force = args.includes('--force');
    if (!id) { console.error(red('Usage: axiom remove §X.Y [--force]')); process.exit(1); }
    try {
      const result = am.remove(id, { confirm: force });
      console.log(green(`✓ Removed axiom ${result.id}: "${result.text?.slice(0, 60)}"`));
    } catch(e) { console.error(red(`✗ ${e.message}`)); process.exit(1); }
    break;
  }

  case 'freeze': {
    const id = args[0];
    if (!id) { console.error(red('Usage: axiom freeze §X.Y')); process.exit(1); }
    try {
      const result = am.freeze(id);
      console.log(green(`✓ Frozen axiom ${result.id}: "${result.text?.slice(0, 60)}" 🔒`));
    } catch(e) { console.error(red(`✗ ${e.message}`)); process.exit(1); }
    break;
  }

  case 'check': {
    const text = args.join(' ');
    if (!text) { console.error(red('Usage: axiom check "text to check"')); process.exit(1); }
    const result = am.check(text);
    if (result.passed) {
      console.log(green(`✓ PASS — no axiom violations detected (${result.axiomCount} axioms checked)`));
    } else {
      console.log(red(`✗ VIOLATIONS (${result.violations.length})`));
      result.violations.forEach(v => {
        console.log(`  ${red(v.axiom)} ${v.text.slice(0, 70)}`);
        console.log(`  ${dim('↳ ' + v.reason)}`);
      });
    }
    break;
  }

  case 'summary': {
    const s = am.summary();
    console.log(bold('\nAxiom summary'));
    console.log(`  Total:     ${s.total}`);
    console.log(`  Immutable: ${color('33', s.immutable)}`);
    console.log(`  Runtime:   ${cyan(s.runtime)}`);
    console.log(`  Pattern:   ${color('35', s.pattern)}`);
    console.log(`  Frozen:    ${s.frozen}`);
    break;
  }

  default:
    console.log(bold('\nUsage: nexus axiom <command>'));
    console.log('  list [IMMUTABLE|RUNTIME|PATTERN]');
    console.log('  add §X.Y "text" [--reason "why"]');
    console.log('  remove §X.Y [--force]');
    console.log('  freeze §X.Y');
    console.log('  check "text"');
    console.log('  summary');
}
