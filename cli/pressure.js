#!/usr/bin/env node
'use strict';
/**
 * cli/pressure.js — ask the system what led to a pressure spike.
 * UUID: nexus-cli-pressure-v1-0000-2026-0818-001
 * spec: docs/pressure-causality.spec § P4
 *
 * §3.4 — this is the CLI layer, and it exists only because lib/pressure-window.js
 * already passes its own tests. It adds no logic: every answer here comes from
 * the library, so a bug found at this layer is a bug in the layer below.
 *
 *   node cli/pressure.js                    the most recent spike, explained
 *   node cli/pressure.js list               every moment worth explaining
 *   node cli/pressure.js explain <eventId>  one specific moment
 *   node cli/pressure.js --window 300       look further back (seconds)
 *   node cli/pressure.js --json             the structure instead of the story
 */

const path = require('path');
const PW   = require(path.join(__dirname, '..', 'lib', 'pressure-window.js'));

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const asJson   = argv.includes('--json');
const windowMs = Number(flag('window', 120)) * 1000;
const cmd      = argv.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || 'explain';

function out(v) { console.log(asJson ? JSON.stringify(v, null, 2) : v); }

if (cmd === 'list') {
  const a = PW.anchors({ limit: Number(flag('limit', 20)) });
  if (asJson) { out(a); process.exit(0); }
  if (!a.length) {
    // §1.2 — an empty list is a real answer, and it is a good one.
    console.log('No pressure or exit events recorded. Nothing has gone wrong that the causal record knows about.');
    process.exit(0);
  }
  console.log('');
  for (const e of a) console.log(`  ${e.at ? '' : ''}${new Date(e.ts).toISOString().slice(11, 19)}  ${String(e.type).padEnd(28)} ${e.level || ''}  ${e.summary}\n         ${e.id}`);
  console.log('');
  process.exit(0);
}

const eventId = argv.find(a => a !== 'explain' && !a.startsWith('--') && a.length > 12) || undefined;
const result  = PW.explain({ eventId, windowMs });

if (asJson) { out(result); process.exit(result.ok ? 0 : 1); }
console.log('');
console.log(PW.render(result));
console.log('');
// §1.2 — a run that could not explain anything exits non-zero, so a script
// calling this cannot mistake "nothing to explain" for "explained fine".
process.exit(result.ok ? 0 : 1);
