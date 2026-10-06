'use strict';
/**
 * tests/modules/test-system-skeleton.test.js — 0.39.359 SB28 · SB30 · SB31 (docs/2026-10-05-build-from-the-spec-phasemap.spec)
 *
 * James: "compartments? no system in nexus looks like this" · "Like I want this to be a skeleton, only using the minimal
 * code. Then expands from there." · "This should be what each new repo builds and slots the idea into like a slot." ·
 * "then we can have it a cos template with reusable components."
 *   SK-01 SB28 genesis 1.4.0's catalog is the nexus-system archetype, file for file; wiring clean; 1.3.0 archived whole
 *   SK-02 SB30 the archetype is assembled from its folder, the reusable components and the template's schemas; a system
 *              laid out from it stands alone (no require outside its own tree but Node's) and passes its own test: it
 *              boots, serves its route nodes, runs its command nodes, and gains a capability by adding nodes alone
 *   SK-03 SB30 each component is offered on its own (cos-component:<id>) and brings what it requires
 *   SK-04 SB31 two unrelated ideas each get the skeleton with their own components slotted in — registry entries and
 *              nodes, no dispatch — and each laid-out system boots with the component shape intact
 *   SK-05 SB31 an idea that does not slot in is said: refused when required, otherwise the skeleton with slot.empty
 *   SK-06 SB31 the slot is lib/, tests/ and ui/ only — anything else the agent plans is refused with the reason
 *   SK-07       atomic-write retries the Windows EPERM rename, and gives up with the error after its tries
 *   SK-08 SB31 a system spec (genesis, the default) is the skeleton: its file tree is the nexus-system tree
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { builtinModules } = require('module');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const FTP = require(path.join(ROOT, 'lib/file-tree-plan.js'));
const NS = require(path.join(ROOT, 'cos/archetype/nexus-system.js'));
const COMP = require(path.join(ROOT, 'cos/archetype/components/index.js'));

function layOut(files, dir) {
  for (const f of files) { const p = path.join(dir, f.path); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.content || ''); }
  return dir;
}
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const runNode = (dir, args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 30000 });

(async () => {
  console.log('\ntest-system-skeleton\n');
  try {
    // SK-01
    const { parseCatalog } = await import(path.join(ROOT, 'idearium/spec-engine/manifest/parse-catalog.js'));
    const { dispatch } = await import(path.join(ROOT, 'idearium/spec-engine/manifest/commands.js'));
    const G = path.join(ROOT, 'idearium/spec-engine/templates/genesis.spec');
    const cat = parseCatalog(fs.readFileSync(G, 'utf8')).map(e => e.path).sort();
    const arch = NS.files().map(f => f.path.replace(/\{\{slug\}\}/g, '<system>')).sort();
    const mc = dispatch(['check', G], {});
    const archived = fs.readFileSync(path.join(ROOT, 'idearium/spec-engine/templates/_archive/genesis-1.3.0.spec'), 'utf8');
    const GC = require(path.join(ROOT, 'cos/archetype/genesis-catalog.js'));
    check('SK-01 genesis 1.4.0\'s catalog is the archetype, file for file, depends from the real require()s (regenerated = as written); wiring clean; 1.3.0 archived whole',
      JSON.stringify(cat) === JSON.stringify(arch) && GC.inSpec() === GC.catalogText() && !mc.code && /wiring is clean/.test(mc.out.join(' ')) && parseCatalog(archived).length === 42,
      JSON.stringify({ onlyCatalog: cat.filter(p => !arch.includes(p)), onlyArchetype: arch.filter(p => !cat.includes(p)), out: mc.out }));

    // SK-02
    const A = require(path.join(ROOT, 'cos/archetype/index.js')).getArchetype('nexus-system');
    const from = new Set(NS.files().map(f => f.from.split(':')[0]));
    const sys = FTP.fromCosTemplate(FTP.SKELETON_ID, { name: 'Probe System', description: 'a probe' });
    const d1 = layOut(sys.files, tmp('sk-sys-'));
    const outside = [];
    for (const f of sys.files.filter(f => f.path.endsWith('.js'))) {
      for (const m of f.content.matchAll(/require\(\s*'([^']+)'\s*\)/g)) {
        const r = m[1];
        if (r.startsWith('.')) { let p = path.posix.normalize(path.posix.join(path.posix.dirname(f.path), r)); if (!/\.(js|json)$/.test(p)) p += '.js'; if (!sys.files.some(x => x.path === p)) outside.push(`${f.path} → ${r}`); }
        else if (!builtinModules.includes(r.replace(/^node:/, ''))) outside.push(`${f.path} → ${r}`);
      }
    }
    const t1 = runNode(d1, ['tests/skeleton.test.js']);
    check('SK-02 the archetype is assembled from its folder, the components and the template schemas; a laid-out system stands alone and passes its own test',
      A && A.fsTemplate.length === NS.files().length && ['skeleton', 'component', 'template-schemas'].every(x => from.has(x)) && !outside.length
      && /gains a capability from nodes alone/.test(sys.files.find(f => f.path === 'tests/skeleton.test.js').content) && /skeleton: all checks passed/.test(t1.stdout)
      && sys.files.some(f => f.path === 'probe-system.config.json') && !sys.files.some(f => /\{\{/.test(f.path + f.content)) && t1.status === 0,
      JSON.stringify({ outside, status: t1.status, out: (t1.stdout + t1.stderr).slice(-600) }));

    // SK-03
    const listed = FTP.listCosTemplates().filter(t => t.source === 'cos-component').map(t => t.id);
    const lis = FTP.fromCosTemplate('cos-component:listener', { name: 'x' });
    const lp = lis.files.map(f => f.path).sort();
    check('SK-03 each component is offered on its own and brings what it requires', listed.length === COMP.COMPONENTS.length
      && JSON.stringify(lp) === JSON.stringify(['jaa-store.js', 'lib/atomic-write.js', 'lib/bus.js', 'lib/envelope.js', 'lib/ledger.js', 'lib/listener.js', 'lib/node-index.js'])
      && FTP.fromCosTemplate('cos-component:nope', { name: 'x' }).ok === false, JSON.stringify({ listed, lp }));

    // SK-04
    const ideas = {
      'Pulse DAW': [{ component: 'audio-engine', path: 'lib/audio-engine.js', purpose: 'renders audio', capability: 'render audio', commands: ['render', 'set-tempo'] },
        { component: 'mixer', path: 'lib/mixer.js', purpose: 'mixes tracks', capability: 'mix tracks', commands: ['mix'] }, { path: 'tests/mixer.test.js', purpose: 'the mixer' }],
      'Recipe Box': [{ component: 'recipes', path: 'lib/recipes.js', purpose: 'stores recipes', capability: 'keep recipes', commands: ['add', 'find'] }],
    };
    const planned = {};
    for (const [name, reply] of Object.entries(ideas)) {
      let asked = '';
      planned[name] = await FTP.plan({ name, description: name, templateIds: [FTP.SKELETON_ID], ask: async (p) => { asked = p; return JSON.stringify(reply); }, requireSlot: true });
      planned[name].asked = asked;
    }
    const daw = planned['Pulse DAW'], rec = planned['Recipe Box'];
    const reg = (r) => r.files.find(f => f.path === 'registry-components.js').content;
    const d2 = layOut(daw.files, tmp('sk-daw-')), d3 = layOut(rec.files, tmp('sk-rec-'));
    const st = (d) => { const r = runNode(d, ['cli.js', 'status']); try { return JSON.parse(r.stdout); } catch (_) { return { raw: r.stdout + r.stderr }; } };
    const s2 = st(d2), s3 = st(d3);
    const pendingDaw = daw.files.filter(f => f.content == null).map(f => f.path).sort();
    check('SK-04 two unrelated ideas each get the skeleton with their own components slotted in; each boots with the shape intact',
      daw.ok && rec.ok && daw.planSource === 'skeleton + agent'
      && JSON.stringify(daw.slot.components) === JSON.stringify(['pulse-daw.audio-engine', 'pulse-daw.mixer']) && JSON.stringify(rec.slot.components) === JSON.stringify(['recipe-box.recipes'])
      && /pulse-daw\.mixer/.test(reg(daw)) && !/recipe-box/.test(reg(daw)) && /recipe-box\.recipes/.test(reg(rec)) && !/pulse-daw/.test(reg(rec))
      && daw.files.some(f => f.path === 'data/nodes/command/pulse-daw.audio-engine.set-tempo.command' && JSON.parse(f.content).payload.handler === 'setTempo')
      && JSON.stringify(pendingDaw) === JSON.stringify(['lib/audio-engine.js', 'lib/mixer.js', 'tests/mixer.test.js'])
      && /skeleton is already laid out and fixed/.test(daw.asked) && /Pulse DAW/.test(daw.asked)
      && s2.counts && s2.counts.component === 3 && s2.counts.command === 5 && !s2.shape.length && !s2.problems.length
      && s3.counts && s3.counts.component === 2 && !s3.shape.length && !s3.problems.length,
      JSON.stringify({ s2: s2.counts || s2, s3: s3.counts || s3, pendingDaw, src: daw.planSource }).slice(0, 600));

    // SK-05
    const down = async () => { throw new Error('every agent is offline'); };
    const refused = await FTP.plan({ name: 'Offline', templateIds: [FTP.SKELETON_ID], ask: down, requireSlot: true });
    const said = await FTP.plan({ name: 'Offline', templateIds: [FTP.SKELETON_ID], ask: down });
    check('SK-05 an idea that does not slot in is said: refused when required, otherwise the skeleton with slot.empty and the reason',
      refused.ok === false && /not slotted into the skeleton: every agent is offline/.test(refused.errors[0])
      && said.ok && said.planSource === 'skeleton only' && said.slot.empty === true && /offline/.test(said.slot.reason), JSON.stringify({ refused: refused.errors, slot: said.slot }));

    // SK-06
    const p6 = FTP.parseSlot(JSON.stringify([{ component: 'a', path: 'lib/a.js', commands: ['go'] }, { path: 'server.js' }, { path: 'src/b.js' }, { path: '../x.js' }, { path: 'ui/panel.js', purpose: 'a panel' }]));
    check('SK-06 the slot is lib/, tests/ and ui/ only; the rest is refused with the reason',
      p6.components.length === 1 && p6.files.map(f => f.path).join() === 'ui/panel.js' && p6.rejected.length === 3
      && p6.rejected.filter(r => /outside the slot/.test(r.reason)).length === 2, JSON.stringify(p6.rejected));

    // SK-07
    const AW = path.join(ROOT, 'cos/archetype/components/atomic-write/lib/atomic-write.js');
    const { atomicWrite } = require(AW);
    const d7 = tmp('sk-aw-'), f7 = path.join(d7, 't.json');
    const real = fs.renameSync;
    let n = 0;
    fs.renameSync = (a, b) => { if (++n <= 2) throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' }); return real(a, b); };
    let first = null, second = null;
    try { atomicWrite(f7, '{"a":1}'); first = fs.readFileSync(f7, 'utf8'); n = -100; try { atomicWrite(f7, '{"a":2}', { tries: 3 }); } catch (e) { second = e.code; } }
    finally { fs.renameSync = real; }
    check('SK-07 atomic-write retries the Windows EPERM rename, and gives up with the error after its tries',
      first === '{"a":1}' && second === 'EPERM' && fs.readFileSync(f7, 'utf8') === '{"a":1}' && !fs.readdirSync(d7).some(x => x.endsWith('.tmp')), JSON.stringify({ first, second, files: fs.readdirSync(d7) }));

    // SK-08
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    let r = null;
    const warn = console.warn; console.warn = () => {};
    try { for (let i = 0; i < 20; i++) { r = await api._route('POST', '/api/spec-engine/specs', { name: `skeleton-${Date.now()}`, type: 'system', description: 'a recipe box' }); if (r.status !== 503) break; await new Promise(x => setTimeout(x, 250)); } }
    finally { console.warn = warn; }
    const body = r.json.data || r.json, man = body.manifest || body;
    const paths = ((man.fileTree && man.fileTree.files) || []).map(f => f.path);
    check('SK-08 a system spec (genesis, the default) is the skeleton: its file tree is the nexus-system tree, the slot is reported',
      r.status < 300 && (man.templateIds || []).includes('genesis') && ['server.js', 'cli.js', 'registry-components.js', 'jaa-store.js', 'lib/heartbeat.js'].every(p => paths.includes(p))
      && body.plan && body.plan.slot && (body.plan.slot.empty ? /not slotted in yet/.test(body.plan.warning) : body.plan.slot.components.length > 0),
      JSON.stringify({ status: r.status, plan: body.plan, n: paths.length }).slice(0, 500));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
