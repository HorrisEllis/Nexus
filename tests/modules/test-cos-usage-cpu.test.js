'use strict';
// tests/modules/test-cos-usage-cpu.test.js — CP6a expanded 2026-11-18 (docs/2026-11-01-the-compartment-phasemap.spec addendum).
// James, 2026-11-18: "the cpu utilization doesn't work, can you hook that in now that its a service". Reads this process with COS's own reader.
const path = require('path');
const U = require(path.join(__dirname, '..', '..', 'cos', 'manager', 'usage.js'));
let pass = 0, fail = 0;
const check = (n, ok, why) => { if (ok) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, why || ''); } };
(async () => {
  const me = [{ name: 'self', pid: process.pid }];
  const a = await U.readAsync(me);
  check('CPU-1 the first reading says null for the host (no interval yet), never 0', a.host.cpuPct === null, JSON.stringify(a.host));
  const until = Date.now() + 1500; let x = 0; while (Date.now() < until) x += Math.sqrt(x + 1);   // work, so the CPU seconds move
  const b = await U.readAsync(me);
  const s = b.systems.self;
  check('CPU-2 the host has a percent between 0 and 100', typeof b.host.cpuPct === 'number' && b.host.cpuPct >= 0 && b.host.cpuPct <= 100, JSON.stringify(b.host));
  if (s && typeof s.cpuSec === 'number') check('CPU-3 a system has a percent from its CPU seconds between readings', typeof s.cpuPct === 'number' && s.cpuPct > 0 && s.cpuPct <= 100, JSON.stringify(s));
  else console.log('  - CPU-3 skipped: this reader gives no CPU seconds here (' + JSON.stringify(s) + ')');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
