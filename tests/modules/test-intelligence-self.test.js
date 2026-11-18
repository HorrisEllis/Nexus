'use strict';
// tests/modules/test-intelligence-self.test.js — IP13 (docs/2026-11-05-intelligence-data-pipeline-phasemap.spec).
// James, 2026-11-18: "using the intelligence system to scan itself?" · "it needs to be able to do". Runs the door on this process.
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = require(path.join(ROOT, 'intelligence', 'self', 'door.js'));
let pass = 0, fail = 0;
const check = (n, ok, why) => { if (ok) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, why || ''); } };
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-'));
  D.register('test holder', () => ({ items: 42 }));
  const n = D.numbers();
  check('IP13-1 the door reads the heap, its spaces and the registered holders', n.heapUsedMB > 0 && n.spaces.length > 0 && n.holders.some((h) => h.name === 'test holder' && h.items === 42), JSON.stringify(n).slice(0, 200));
  check('IP13-1b the peak resident memory since start is read (his "Yes, add peak")', typeof n.peakRssMB === 'number' && n.peakRssMB >= n.rssMB * 0.5 && n.startedAt <= n.at, JSON.stringify({ peak: n.peakRssMB, rss: n.rssMB }));
  const a = await D.scan({ dataDir });
  check('IP13-2 Emerge judges the scan (verdict, why, heaviest spaces)', a.ok && ['ok', 'near-cap', 'over'].includes(a.verdict) && typeof a.why === 'string' && a.heaviestSpaces.length > 0, JSON.stringify(a).slice(0, 300));
  D.register('test holder', () => ({ items: 50 }));
  const b = await D.scan({ dataDir });
  check('IP13-3 the second scan says what grew since the first (kept on disk)', b.ok && b.grew.some((g) => g.name === 'holder test holder' && g.delta === 8), JSON.stringify(b.grew));
  check('IP13-4 each scan is kept as a line', fs.readFileSync(path.join(dataDir, 'self', 'scans.jsonl'), 'utf8').trim().split('\n').length === 2);
  const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  check('IP13-5 the routes, the registry and the command rows', /'\/api\/intelligence\/self'/.test(src('intelligence/server.js')) && /'\/api\/intelligence\/self\/snapshot'/.test(src('intelligence/server.js')) && /self-scan/.test(src('intelligence/registry-components.js')) && /key: 'intelligence\.self'/.test(src('idearium/cli/route-commands.js')));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
