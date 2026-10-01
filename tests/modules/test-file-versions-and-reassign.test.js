'use strict';
/**
 * tests/modules/test-file-versions-and-reassign.test.js — 0.39.285, merged from the nexus-14 fork
 * (docs/2026-10-01-work-visibility-job-reuse-phasemap.spec D0, D2)
 *   FV-01 GET …/file/versions and …/file/version are routed: an unknown repo is a 404, a missing path a 400
 *   FV-02 with Versionium unreachable the route says so (502), never a silent empty list
 *   FV-03 the Files tab loads file-versions.js, on the shared theme tokens
 *   RA-01 a FAILED chunk can be reassigned: back to PENDING, attempts 0, the failure kept as priorFailure
 *   RA-02 a COMPLETE chunk still cannot be (provenance)
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

(async () => {
  console.log('\ntest-file-versions-and-reassign\n');
  try {
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = L.ingest({ name: `fv-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'module.exports = 1;\n' }] });
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    const u = made.repo.uuid;
    const nf = await api._route('GET', '/api/repos/nexus-id-repo-nope/file/versions?path=a.js');
    const np = await api._route('GET', `/api/repos/${u}/file/versions`);
    check('FV-01 routed: unknown repo 404, no path 400', nf.status === 404 && np.status === 400, JSON.stringify([nf.status, np.status]));
    const down = await api._route('GET', `/api/repos/${u}/file/versions?path=src%2Fa.js`);
    check('FV-02 Versionium unreachable → 502 with the reason', down.status === 502, JSON.stringify(down.json).slice(0, 160));
    const js = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/file-versions.js'), 'utf8');
    check('FV-03 the page loads file-versions.js; the modal uses the theme tokens, no hard-coded panel colour',
      /<script src="js\/file-versions\.js"><\/script>/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8')) && /var\(--nx-panel\)/.test(js) && !/#0d1220/.test(js));

    const SE = await import(path.join(ROOT, 'idearium/spec-engine/index.js'));
    const m = SE.createSpec({ name: `ra-${Date.now()}`, description: '## one\nx\n## two\ny\n' });
    const man = SE.loadSpec(m.uuid || m.specUuid || (m.manifest && m.manifest.uuid));
    const [c1, c2] = man.chunks;
    c1.status = 'failed'; c1.attempts = 2; c1.failureMode = 'exceeded outer wall-clock attempt cap';
    if (c2) c2.status = 'complete';
    SE.saveSpec(man);
    const r = SE.setChunkAgent(man.uuid, c1.uuid, 'ollama');
    check('RA-01 a FAILED chunk is reassigned: PENDING, attempts 0, the failure kept as priorFailure', r.status === 'pending' && r.attempts === 0 && /wall-clock/.test(r.priorFailure || '') && !r.failureMode, JSON.stringify(r).slice(0, 200));
    let refused = false;
    if (c2) { try { SE.setChunkAgent(man.uuid, c2.uuid, 'ollama'); } catch (e) { refused = /only PENDING or FAILED/.test(e.message); } }
    check('RA-02 a COMPLETE chunk still refuses (it would rewrite who built it)', !!c2 && refused, `chunks: ${man.chunks.length}`);
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
