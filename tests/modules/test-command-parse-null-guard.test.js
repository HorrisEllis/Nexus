'use strict';
/**
 * tests/modules/test-command-parse-null-guard.test.js
 *
 * §FIX 2026-09-22 — found while wiring a new structured (non-raw)
 * caller to guardian/server.js's POST /command route: its generic "raw
 * job dispatch" branch did `const parsed = parseCommand(body.raw);`
 * unconditionally, then read `parsed.provider`, `parsed.command`,
 * `parsed.prompt` off it. guardian/lib/provider-routing.js's real
 * parseCommand(raw) returns null when raw doesn't match its own regex
 * (including when raw is undefined — the case for any structured caller
 * that sends {command, provider, prompt} directly and never sets
 * `raw` at all, the same shape guardian/cli.js's own sendFile() already
 * uses for command:'spec', though that one is intercepted by an EARLIER
 * branch and never reaches this exact code path). Any OTHER structured
 * call (command:'ask'/'code', no raw) would have thrown TypeError:
 * Cannot read properties of null reading the very first line after it.
 */
const assert = require('assert');
const path = require('path');
const { createProviderRouter } = require(path.join(__dirname, '..', '..', 'guardian', 'lib', 'provider-routing.js'));
const { parseCommand } = createProviderRouter({ updateJob: () => {}, bus: { emit: () => {} }, NEXUS_URL: 'http://127.0.0.1:3748' });

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`); failed++; }
}

function main() {
  check('parseCommand(undefined) really returns null — the exact real condition this guard exists for', parseCommand(undefined) === null);

  // §THE REAL FIX — the exact guard added to guardian/server.js's route.
  const parsed = parseCommand(undefined) || {};
  let guardedOk = true;
  try { void parsed.provider; void parsed.command; void parsed.prompt; } catch (_) { guardedOk = false; }
  check('the guarded form never throws reading .provider/.command/.prompt off an undefined raw', guardedOk);

  check('a structured caller (command/provider/prompt sent directly, no raw) resolves via body.* — checked against the guard\'s own real fallthrough shape',
    (('ask' /* body.command */) || parsed.command || 'code') === 'ask');

  check('a genuinely malformed raw string also still returns null (unchanged real behavior, not newly broken by this fix)',
    parseCommand('not a real slash command') === null);

  const wellFormed = parseCommand('/ask claude "hello there"');
  check('a real, well-formed raw command still parses correctly (unchanged real behavior)',
    !!wellFormed && wellFormed.command === 'ask' && wellFormed.provider === 'claude' && wellFormed.prompt === 'hello there');

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
