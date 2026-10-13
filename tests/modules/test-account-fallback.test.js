'use strict';
/**
 * tests/modules/test-account-fallback.test.js — 0.60.25 — account fallback chaining.
 * James: "i have like 9 or 12 accounts … use routing each time tokens run out. like account routing and fallback
 * chaining" · "check the accounts, account routing, fallback routing."
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
console.log('\ntest-account-fallback\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-acct-'));
try {
  const AR = require(path.join(ROOT, 'guardian/lib/account-routing.js'));
  const r = AR.createAccountRouting({ dir: tmp });
  r.setRule({ provider: 'claude', account: 'acct-1', priority: 3 });
  r.setRule({ provider: 'claude', account: 'acct-2', priority: 2 });
  r.setRule({ provider: 'claude', account: 'acct-3', priority: 1 });
  r.setRule({ provider: 'claude', account: 'acct-hat', hat: 'the_builder', priority: 9 });
  const job = { id: 'j1', provider: 'claude' };
  check('AF-01 the chain is the provider\'s every-job accounts, highest priority first (a hat rule is not in it)', JSON.stringify(r.chain('claude')) === '["acct-1","acct-2","acct-3"]', JSON.stringify(r.chain('claude')));
  const first = r.fallback(job, r.route(job));
  check('AF-02 nothing at its limit: the routed account stands', first && first.accountId === 'acct-1' && !first.fallback, JSON.stringify(first));
  r.noteSwitched('claude', 'acct-1');
  r.markExhausted('claude', 'acct-1', { why: 'usage limit — resets at 5pm' });
  const second = r.fallback(job, r.route(job));
  check('AF-03 its account hit the limit: the next account in the chain takes the job, and says why', second && second.accountId === 'acct-2' && second.fallback && /acct-1 is at its limit/.test(second.why), JSON.stringify(second));
  r.markExhausted('claude', 'acct-2'); r.markExhausted('claude', 'acct-3');
  const none = r.fallback(job, r.route(job));
  check('AF-04 every account spent: said as such, so the job fails as a rate limit and the ladder moves on', none && none.exhaustedAll === true && !none.accountId && /every claude account/.test(none.why), JSON.stringify(none));
  r.clearExhausted('claude');
  check('AF-05 a rested account comes back (cleared, or its time passed)', r.fallback(job, r.route(job)).accountId === 'acct-1');
  const d = fs.readFileSync(path.join(ROOT, 'guardian/lib/dispatcher.js'), 'utf8');
  const a = fs.readFileSync(path.join(ROOT, 'guardian/ask.js'), 'utf8');
  check('AF-06 wired: the dispatcher reads the tab\'s usage limit, falls back, fails a spent chain as rate-limit; a missing tab is opened in Clear Glass',
    /u\.limited === true/.test(d) && /accountRouting\.fallback\(job, routed\)/.test(d) && /errorClass: 'rate-limit'/.test(d) && /cgStartProvider\(p\)/.test(a));
  const srv = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
  check('AF-07 one place to set it: guardian serves the chain, Idearium passes it through, Settings orders it, every agent has the command',
    /'\/api\/accounts\/chain' && method === 'POST'/.test(srv) && /\['api','accounts','chain'\]/.test(api) && /id="acct-card"/.test(ui) && /acct-save/.test(ui)
    && fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8').includes("key: 'accounts.chain'"));
  r.flush();
} catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
