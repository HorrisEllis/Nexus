'use strict';
/**
 * tests/modules/test-genesis-and-architecture-spec.test.js — 0.39.286 GN1 + AR1
 * (docs/2026-10-01-routing-registry-genesis-phasemap.spec)
 *
 * James: "have genesis the default spec? … i want this saved to the architecture spec and genesis updated … also can
 * you remove anything from the architecture spec thats absent from nexus?"
 *   GA-01 every module path docs/architecture-spec/architecture-spec.spec names exists
 *   GA-02 every event it says it emits is emitted by real code; every route it names is served
 *   GA-03 what 0.8.0 moved out is kept whole in the archive (§0.3)
 *   GA-04 genesis 1.2.0: the registry (doorway), routing and nodes (JAA as the node index) domains, their files, wiring still clean
 *   GA-05 genesis is the default: a system spec with no template starts from it; the New spec form checks it
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('\ntest-genesis-and-architecture-spec\n');
  try {
    const spec = yaml.load(read('docs/architecture-spec/architecture-spec.spec')).spec;
    const paths = [];
    for (const m of spec.modules) {
      const b = String(m.path).match(/^(.*)\{([^}]+)\}(.*)$/);
      if (b) for (const x of b[2].split(',')) paths.push(`${b[1]}${x}${b[3]}`); else paths.push(m.path);
    }
    const missing = paths.filter(p => !fs.existsSync(path.join(ROOT, p)));
    check('GA-01 every module path the architecture spec names exists', /^0\.(8|9|10)\.\d+$/.test(spec.meta.version) /* 0.39.313 SB17: 0.9.0 agrees with genesis 1.3.0; 0.39.316: 0.10.0 points at James's template */ && paths.length >= 14 && !missing.length, JSON.stringify(missing));
    const idx = read('idearium/api/index.js');
    const orch = read('orchestrator/orchestrator.js');
    const emitted = (spec.events.emits || []).every(e => idx.includes(`'${e}'`));
    const served = (spec.routes || []).every(r => {
      if (r.path.startsWith('/api/repos/:uuid/architecture')) return /\['(GET|POST)',\s*\['api','repos',\s*':uuid','architecture'\]/.test(idx);
      if (r.path.startsWith('/api/nodes')) return /sub === 'nodes'/.test(orch);
      if (r.path.startsWith('/nodes') || r.path.startsWith('/config')) return /parts\[0\] === '(nodes|config)'/.test(read('architecture-spec/registry/api.js'));
      return false;
    });
    check('GA-02 every event it emits is emitted by real code; every route it names is served', emitted && served, JSON.stringify({ emitted, served, routes: spec.routes.map(r => r.path) }));
    const arch = read('docs/architecture-spec/_archive/architecture-spec-0.7.0.spec');
    // 0.39.316 — 0.10.0 points at James's template and its schemas, and states his axioms
    check('GA-06 0.10.0: the spec points at the template and its schemas (never copies them) and carries his words', spec.meta.template === 'idearium/spec-engine/templates/architecture-spec.template.yaml'
      && fs.existsSync(path.join(ROOT, spec.meta.template)) && fs.existsSync(path.join(ROOT, spec.meta.schemas)) && /each component only needs to connect to the registry/.test(spec.meta.james)
      && !/├── server\.js/.test(read('docs/architecture-spec/architecture-spec.spec')), 'template pointer, schemas, his words');
    check('GA-03 what 0.8.0 moved out is kept whole in the archive', /^# ARCHIVED 2026-10-01/.test(arch) && /architecture-spec\.sovereignty\.violation\.detected/.test(arch) && /id: AS4/.test(arch) && /compiler\/lattice\.js/.test(arch)
      && !/architecture-spec\.node\.declared/.test(read('docs/architecture-spec/architecture-spec.spec')));
    const g = read('idearium/spec-engine/templates/genesis.spec');
    const { dispatch } = await import(path.join(ROOT, 'idearium/spec-engine/manifest/commands.js'));
    const mc = dispatch(['check', path.join(ROOT, 'idearium/spec-engine/templates/genesis.spec')], {});
    // §0.39.311 SB16 — genesis 1.2.0 adds Domain 2d (nodes, JAA tables as the node index); 1.1.0's checks all still hold
    check('GA-04 genesis 1.3.0: shape (the template\'s architecture), registry (the doorway, nodes, capability nodes), routing and nodes (JAA as the node index) domains, his axioms, the wiring still clean', /^version 1\.3\.0$/m.test(g) && /^domain "shape"$/m.test(g) && /^capability_node /m.test(g) && /axiom COMPONENT_SHAPE/.test(g) && /axiom SYSTEM_OWNS_ITS_OWN/.test(g) && /^domain "registry"$/m.test(g) && /^domain "routing"$/m.test(g)
      && /^domain "nodes"$/m.test(g) && /file "registry\/node-index\.js"/.test(g) && /axiom NODE_INDEX_IS_JAA/.test(g) && /bind node\.change\s+-> Event/.test(g)
      && /file "registry\/node-registry\.js"/.test(g) && /file "spine\/route-policy\.js"/.test(g) && /axiom REGISTRY_IS_THE_DOORWAY/.test(g) && !mc.code && /wiring is clean/.test((mc.out || []).join(' ')), JSON.stringify(mc.out));
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    let r = null;
    for (let i = 0; i < 20; i++) { r = await api._route('POST', '/api/spec-engine/specs', { name: `gen-default-${Date.now()}`, type: 'system', description: 'a system' }); if (r.status !== 503) break; await new Promise(x => setTimeout(x, 250)); }
    const m = r.json.data || r.json;
    const man = m.manifest || m.spec || m;
    const tids = man.templateIds || (man.templateId ? [man.templateId] : []);
    const app = read('idearium/ui/js/app.js');
    check('GA-05 genesis is the default: a system spec with no template starts from it; the New spec form checks it', r.status < 300 && tids.includes('genesis')
      && /\$\{t\.id === 'genesis' \? 'checked' : ''\}/.test(app), JSON.stringify({ status: r.status, tids, keys: Object.keys(man).slice(0, 20) }));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
