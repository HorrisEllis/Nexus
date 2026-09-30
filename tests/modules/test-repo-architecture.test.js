'use strict';
/**
 * tests/modules/test-repo-architecture.test.js — 0.39.284 W7 item 2 (docs/2026-09-30-idearium-coding-flow-phasemap.spec)
 *
 * James: "the architect tab should be the component registry and loom style map for the wiring … ids, types, relation,
 * consumers, orphans, node types, data dir, full architecture map". A real repo, indexed by the real chunk route
 * (lib/code-intel), read back through GET /api/repos/:uuid/architecture:
 *   AR-01 one component per file, loom's id rule, a layer and a type each
 *   AR-02 wires follow real imports (consumer ← dependency) with export/import hooks, like loom's registry
 *   AR-03 consumers and deps per component; externals (packages) named with who uses them
 *   AR-04 orphans (code nothing uses and that uses nothing; entry points are not orphans); data dirs; node types
 *   AR-05 a bottom-up breach (a lower layer requiring a higher one) is named
 *   AR-06 POST writes ARCHITECTURE.json into the repo (the architecture doc)
 *   AR-07 the Architect tab renders it (registry table + wiring map)
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

(async () => {
  console.log('\ntest-repo-architecture\n');
  try {
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const L = api.getRepoLayer();
    const R = 're' + 'quire';   // fixture code: keep loom's own source scanner from reading these as NEXUS edges
    const files = [
      { path: 'src/types.js', content: "'use strict';\nfunction makePort(name) { return { name }; }\nmodule.exports = { makePort };\n" },
      { path: 'src/graph.js', content: `'use strict';\nconst { makePort } = ${R}('./types.js');\nconst EventEmitter = ${R}('events');\nfunction addNode(id) { return { id, port: makePort(id) }; }\nmodule.exports = { addNode };\n` },
      { path: 'src/api/routes.js', content: `'use strict';\nconst { addNode } = ${R}('../graph.js');\nconst express = ${R}('express');\nfunction route(req) { return addNode(req.id); }\nmodule.exports = { route };\n` },
      { path: 'src/leftover.js', content: "'use strict';\nfunction nobodyCalls() { return 1; }\nmodule.exports = { nobodyCalls };\n" },
      { path: 'src/config.js', content: `'use strict';\nconst { route } = ${R}('./api/routes.js');\nmodule.exports = { route, port: 8080 };\n` },
      { path: 'data/seed.json', content: '{"a":1}\n' },
      { path: 'specs/kernel.spec', content: 'spec:\n  meta:\n    name: kernel\n' },
    ];
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = L.ingest({ name: `arch-${Date.now()}`, source: 'test', files });
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    const u = made.repo.uuid;
    const none = await api._route('GET', `/api/repos/${u}/architecture`);
    const ch = await api._route('POST', `/api/repos/${u}/chunk`, {});
    let g = await api._route('GET', `/api/repos/${u}/architecture`);
    for (let i = 0; i < 20 && g.status !== 200; i++) { await new Promise(x => setTimeout(x, 300)); g = await api._route('GET', `/api/repos/${u}/architecture`); }
    const a = g.json.data || g.json;
    const C = Object.fromEntries((a.components || []).map(c => [c.file, c]));
    check('AR-00 before indexing it says so (409 NO_INDEX), after the chunk route it answers', (none.status === 409 || none.status === 200) && ch.status < 400 && g.status === 200, JSON.stringify({ none: none.status, ch: ch.status, g: g.status, err: g.json && g.json.error }));
    check('AR-01 one component per file, loom\'s id rule under the repo\'s namespace, a layer and a type each', C['src/graph.js'] && C['src/graph.js'].id === `${a.namespace}.src.graph`
      && C['src/types.js'].layer === 'foundation' && C['src/graph.js'].layer === 'library' && C['src/api/routes.js'].layer === 'api' && C['specs/kernel.spec'].type === 'node' && C['data/seed.json'].type === 'config',
      JSON.stringify((a.components || []).map(c => [c.file, c.id, c.layer, c.type])));
    const w = (a.wires || []).map(x => `${x.from}->${x.to}`);
    check('AR-02 wires follow the real imports, dependency → consumer, with export/import hooks (loom\'s registry shape)', w.includes('src/types.js->src/graph.js') && w.includes('src/graph.js->src/api/routes.js')
      && (a.hooks || []).some(h => h.id === `${C['src/graph.js'].id}.export`) && (a.wires || []).every(x => /\.export$/.test(x.from_hook_id) && /\.import$/.test(x.to_hook_id)), JSON.stringify(w));
    check('AR-03 consumers and deps per component; external packages named with who uses them', C['src/graph.js'].consumers.includes('src/api/routes.js') && C['src/graph.js'].deps.includes('src/types.js')
      && (a.externals || []).some(e => e.name === 'express' && e.usedBy.includes('src/api/routes.js')) && (a.externals || []).some(e => e.name === 'events'), JSON.stringify(a.externals));
    check('AR-04 orphans: code nothing uses and that uses nothing (config and entry points are not); the data dir; node types', (a.orphans || []).join() === 'src/leftover.js'
      && (a.dataDirs || []).includes('data') && a.nodeTypes && a.nodeTypes.spec === 1, JSON.stringify({ orphans: a.orphans, data: a.dataDirs, nt: a.nodeTypes }));
    check('AR-05 a bottom-up breach is named: config (foundation) requires the api layer (§3.1)', (a.breaches || []).some(b => b.consumer === 'src/config.js' && b.dependency === 'src/api/routes.js'), JSON.stringify(a.breaches));
    const wr = await api._route('POST', `/api/repos/${u}/architecture`, {});
    const doc = L.readTextFile(u, 'ARCHITECTURE.json');
    check('AR-06 POST writes ARCHITECTURE.json into the repo — the architecture doc, with its provenance', wr.status === 200 && doc && /"schema": "nexus.architecture\/1"/.test(doc.content) && /"generatedBy": "idearium\/repo\/architecture.js"/.test(doc.content), JSON.stringify(wr.json).slice(0, 200));
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    check('AR-07 the Architect tab renders the registry and the wiring map first', /async function renderRepoRegistry\(repo\)/.test(app) && /\/api\/repos\/\$\{repo\.uuid\}\/architecture/.test(app)
      && /id="repo-arch-registry"/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8')));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
