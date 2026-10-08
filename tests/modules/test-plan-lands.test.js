'use strict';
/**
 * tests/modules/test-plan-lands.test.js — 0.39.284 W2 (docs/2026-09-30-idearium-coding-flow-phasemap.spec)
 *
 * James's Plan panel: three plan runs "replied … no …-phasemap.spec came back"; the Phases tab stayed empty. The map
 * now lands: the agent's file, else its reply text, else DERIVED from the spec's own sections (provenance in meta).
 *   PL-0x  derivePlan / sectionsOf / planFromReply (the library)
 *   PL-1x  specPlan's fallbacks with the agent answering badly (deps faked at the agent only — real spec-plan)
 *   PL-2x  idearium's real router: {derive:true} writes the map, GET shows it valid and ordered, again = PLAN_EXISTS
 *   PL-3x  the CLI: idearium repo plan --dry prints the phases, writes nothing
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

// a spec shaped like James's ERAVOS kernel amendment: many sections, and NOT valid YAML (a bad indent at the end)
const SPEC = [
  'spec:',
  '  meta:',
  '    name: kernel',
  '    version: 3.1.0',
  '  primitives:',
  '    Port: a typed input or output',
  '    Value: a number, a string, or a buffer',
  '  hook_wire_type:',
  '    - hooks carry values between ports',
  '  audio_graph:',
  '    engine: a graph of nodes that process audio in blocks',
  '  api:',
  '    routes: POST /graph, GET /graph/:id',
  '  cli:',
  '    commands: kernel run <file>',
  '  scheduler:',
  '    loop: the block loop runs every 128 samples',
  '  ui_canvas:',
  '    panel: nodes are drawn on a canvas',
  '  version_history:',
  '    - 3.0.0 first',
  '  fan_out:',
  '   broken: indent',   // not YAML — the spec tab shows "not valid YAML"; the plan must still come
].join('\n') + '\n';

(async () => {
  console.log('\ntest-plan-lands\n');
  try {
    const SP = await import(path.join(ROOT, 'idearium/repo/spec-plan.js'));

    // ── PL-0x ──
    const secs = SP.sectionsOf(SPEC);
    check('PL-01 sectionsOf: the spec\'s own sections (meta and version history left out), even when it is not valid YAML',
      secs.map(s => s.key).join() === 'primitives,hook_wire_type,audio_graph,api,cli,scheduler,ui_canvas,fan_out', secs.map(s => s.key).join());
    const d = SP.derivePlan({ specPath: 'source/specs/kernel.spec', specText: SPEC, reason: 'test' });
    const byKey = Object.fromEntries(d.phases.map(p => [p.id.replace(/^\w+?\d+_/, ''), p.layer]));
    check('PL-02 derivePlan: a VALID bottom-up map, one phase per section, each layer read from the section', d.ok && d.phases.length === 8
      && byKey.primitives === 'foundation' && byKey.api === 'api' && byKey.cli === 'cli' && byKey.scheduler === 'automation' && byKey.ui_canvas === 'ui', JSON.stringify({ problems: d.problems, byKey }));
    const ordered = SP.orderPhases(d.phases);
    check('PL-03 its build order is the layers\' order, and the first ready phase is the lowest', ordered.every((p, i) => i === 0 || p.layerIndex >= ordered[i - 1].layerIndex)
      && SP.nextReady(d.phases).layer === 'foundation');
    check('PL-04 provenance: the map says it was derived, when, why, and from which spec (its sha)', /planned_by: idearium\/repo\/spec-plan\.js derivePlan/.test(d.text)
      && /reason: "test"/.test(d.text) && /spec: source\/specs\/kernel\.spec/.test(d.text) && /spec_sha256: [0-9a-f]{64}/.test(d.text) && /planned_at: \d{4}-/.test(d.text));
    const many = 'spec:\n' + Array.from({ length: 60 }, (_, i) => `  part_${i}:\n    x: ${'y'.repeat(i)}\n`).join('');
    const dm = SP.derivePlan({ specPath: 'big.spec', specText: many, maxPhases: 12 });
    check('PL-05 a spec of 60 sections becomes at most 12 phases — grouped, none dropped', dm.ok && dm.phases.length <= 12 && dm.sections === 60
      && (dm.text.match(/^      blocks:$/gm) || []).length === dm.phases.length   /* §RS9 0.49.0 — each phase names its blocks */ && dm.text.split('part_').length - 1 >= 60);
    const md = SP.derivePlan({ specPath: 'readme.md.spec', specText: '# Tool\n\n## Storage\nfiles\n\n## HTTP API\nroutes\n\n## Web UI\npanel\n' });
    check('PL-06 a markdown spec plans by its headings', md.ok && md.phases.map(p => p.layer).join() === 'foundation,library,api,ui', JSON.stringify(md.phases.map(p => [p.id, p.layer])));
    // §0.47.0 SP1 — the browser-engine repo's spec (workshop form): phases from its sections, by title — never 'spec' / 'sections'
    const WSPEC = "spec:\n  meta:\n    name: browser engine\nsections:\n  - id: idea\n    title: The idea\n    body: i want to build a browser engine\n  - id: purpose\n    title: Purpose\n    body: ''\n"
      + "  - id: data-schema\n    title: Data Schema\n    body: |\n      Every record declares its fields. Pages and their DOM are stored.\n  - id: api\n    title: API\n    body: The HTTP API serves rendered pages over a route.\n"
      + "  - id: ui\n    title: User interface\n    body: A window that shows the page. The UI calls the API.\n  - id: tests\n    title: Tests\n    body: ''\n";
    const wd = SP.derivePlan({ specPath: 'spec/browser-engine.spec', specText: WSPEC });
    check('PL-SP1 a workshop spec plans by its sections: one phase each, named by its title, bottom-up; framing and blank sections are not phases',
      wd.ok && wd.phases.length === 3 && !/§spec \(line|§sections \(line/.test(wd.text) && /name: "Data Schema"/.test(wd.text) && /Data Schema — Every record declares its fields\./.test(wd.text)
      && /blank: \[tests\]/.test(wd.text) && !/name: "The idea"/.test(wd.text) && wd.text.indexOf('"Data Schema"') < wd.text.indexOf('"API"') && wd.text.indexOf('"API"') < wd.text.indexOf('"User interface"'), wd.text.slice(0, 700));
    check('PL-07 a spec with nothing to plan says so', SP.derivePlan({ specPath: 'e.spec', specText: 'spec:\n  meta:\n    name: e\n' }).ok === false);
    const good = 'Here is the plan:\n```yaml\nspec:\n  meta:\n    name: k\n  phases:\n    K0_store:\n      layer: foundation\n      status: OPEN\n      depends_on: []\n      proof: a test\n```\nDone.';
    check('PL-08 planFromReply: a map written in the reply (fenced) is taken; prose, or an invalid map, is not', SP.planFromReply(good, 'k') && SP.planFromReply(good, 'k').phases.length === 1
      && SP.planFromReply('I will plan it now.') === null && SP.planFromReply('```yaml\nspec:\n  phases:\n    K1_x:\n      layer: nowhere\n      proof: t\n```') === null);

    // ── PL-1x — specPlan with the agent answering badly ──
    const BS = await import(path.join(ROOT, 'idearium/api/build-surface.js'));
    const files = new Map([['source/specs/kernel.spec', SPEC]]);
    const rows = [], events = [];
    let reply = { ok: true, text: 'I read the spec. It is about a kernel.' };
    const layer = { get: () => ({ uuid: 'r1', name: 'kernel' }), readTextFile: (u, p) => files.has(p) ? { content: files.get(p) } : { error: 'nope' }, writeTextFile: (u, p, t) => { files.set(p, t); return { ok: true }; } };
    const deps = { getRepoLayer: () => layer, repoDir: () => '/tmp/nowhere', appendRow: (t, r) => rows.push(r), emit: (e, x) => events.push([e, x]),
      snapshot: async () => ({ ok: true, data: { commitId: 'c1' } }),
      require: (p) => /repo-agent/.test(p) ? { dispatch: async () => reply } : /shadow/.test(p) ? { declare: () => ({}), settle: () => {}, drop: () => {} } : require(path.join(ROOT, 'idearium/api', p)) };
    const wait = async (state) => { for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 20)); const x = rows.find(r => r.phase === 'PLAN' && r.state === state && r !== rows[0]); if (x) return x; } return null; };
    let r = await BS.specPlan(deps, 'r1', { path: 'source/specs/kernel.spec' });
    const last1 = await wait('replied');
    check('PL-11 the agent replies without a map → the plan is DERIVED and written; the run is replied with the reason and no error', r.status === 200 && last1 && last1.plannedBy === 'derived'
      && /replied without a map/.test(last1.note) && last1.error === null && last1.phases === 8 && /planned_by: .*derivePlan/.test(files.get('source/specs/kernel-phasemap.spec') || ''), JSON.stringify(last1));
    rows.length = 0; files.delete('source/specs/kernel-phasemap.spec');
    reply = { ok: true, text: good.replace('name: k', 'name: kernel-phasemap') };
    r = await BS.specPlan(deps, 'r1', { path: 'source/specs/kernel.spec' });
    const last2 = await wait('replied');
    check('PL-12 the agent wrote the map in its reply, not as the file → taken from the reply', last2 && last2.plannedBy === 'agent-reply' && /K0_store/.test(files.get('source/specs/kernel-phasemap.spec') || ''), JSON.stringify(last2));
    rows.length = 0; files.set('source/specs/kernel-phasemap.spec', 'spec:\n  phases:\n    K1_x:\n      layer: nowhere\n');
    reply = { ok: false, error: 'timed out after 90000ms' };
    r = await BS.specPlan(deps, 'r1', { path: 'source/specs/kernel.spec', replan: true });
    const last3 = await wait('replied');
    check('PL-13 the agent failed and an invalid map was there → the invalid one is KEPT as .agent-draft.txt, the plan is derived, the failure named',
      last3 && last3.plannedBy === 'derived' && /timed out/.test(last3.note) && /layer: nowhere/.test(files.get('source/specs/kernel-phasemap.agent-draft.txt') || '')
      && /derivePlan/.test(files.get('source/specs/kernel-phasemap.spec')), JSON.stringify(last3));

    // ── PL-2x — the real router ──
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = L.ingest({ name: `plan-lands-${Date.now()}`, source: 'test', files: [{ path: 'source/specs/kernel.spec', content: SPEC }] });
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    const u = made.repo.uuid;
    const R = (m, p, b) => api._route(m, `/api/repos/${u}${p}`, b);
    const p1 = await R('POST', '/spec/plan', { path: 'source/specs/kernel.spec', derive: true });
    check('PL-21 POST …/spec/plan {derive:true}: written at once, no agent, no snapshot needed for a first map', p1.status === 200 && p1.json.plannedBy === 'derived' && p1.json.phases === 8, JSON.stringify(p1.json).slice(0, 300));
    const g = await R('GET', '/spec/plan?path=source%2Fspecs%2Fkernel.spec');
    check('PL-22 GET shows it valid, ordered, with the next ready phase — what the Phases tab and the Plan panel read', g.json.exists && g.json.valid && g.json.phases.length === 8 && /primitives/.test(g.json.next), JSON.stringify(g.json).slice(0, 300));
    const ph = await R('GET', '/phases');
    check('PL-23 the Phases tab\'s own route lists the new map\'s phases', ph.status === 200 && JSON.stringify(ph.json).includes('kernel-phasemap'), JSON.stringify(ph.json).slice(0, 200));
    const again = await R('POST', '/spec/plan', { path: 'source/specs/kernel.spec', derive: true });
    check('PL-24 a second derive without replan is refused (PLAN_EXISTS) — never overwritten unasked', again.json.detail && again.json.detail.code === 'PLAN_EXISTS', JSON.stringify(again.json).slice(0, 200));

    // ── PL-3x — the CLI ──
    // the CLI is its own process (the repo store is shared lazily), so it plans the spec FILE: --dry --file
    const specFile = path.join(process.env.NEXUS_TEST_SANDBOX || require('os').tmpdir(), `kernel-${Date.now()}.spec`);
    fs.writeFileSync(specFile, SPEC);
    let out = '';
    try { out = execFileSync(process.execPath, [path.join(ROOT, 'idearium/cli/index.js'), 'repo', 'plan', '--dry', '--file', specFile], { encoding: 'utf8', env: process.env, timeout: 60000 }); }
    catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    out = out.replace(/\x1b\[[0-9;]*m/g, '');
    const beside = fs.readdirSync(path.dirname(specFile)).filter(f => /kernel-\d+-phasemap/.test(f));
    check('PL-31 idearium repo plan --dry --file <spec> prints the derived phases in build order, writes nothing', beside.length === 0 && /derived from 8 section\(s\), not written/.test(out) && /foundation\s+\S*primitives/.test(out) && /ui\s+\S*ui_canvas/.test(out), out.slice(0, 400));
    const help = execFileSync(process.execPath, [path.join(ROOT, 'idearium/cli/index.js'), 'help'], { encoding: 'utf8', env: process.env, timeout: 60000 });
    check('PL-32 idearium help names plan, phases and build', /plan <repo> <spec>/.test(help) && /phases <repo> <spec>/.test(help) && /build <repo> <spec>/.test(help));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
