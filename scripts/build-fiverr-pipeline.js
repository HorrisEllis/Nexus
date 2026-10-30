'use strict';
// scripts/build-fiverr-pipeline.js — builds clear-glass/automation/nodes/fiverr-gig.pipeline from the Fiverr node files Clear Glass bundles, through
// the real exporter (lib/automation-nodes.js pipelineNode), so the file carries the macros and workflows it runs. Run after editing those nodes:
//   node scripts/build-fiverr-pipeline.js
// 2026-10-30 PN4 — James: "should we rebuild the fiverr plugin?" · "can you export the .macro and .automation nodes to the .pipeline node".
// The engine works in a temporary data folder of its own: nothing is written into data/.
const fs = require('fs'), path = require('path'), os = require('os');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fiverr-pipeline-'));
const ROOT = path.resolve(__dirname, '..'), ND = path.join(ROOT, 'clear-glass/automation/nodes');
const N = require(path.join(ROOT, 'lib/automation-nodes.js'));
const { AutomationEngine } = require(path.join(ROOT, 'lib/automation/engine.js'));
(async () => {
  const e = new AutomationEngine({});
  // straight from the source files, unchanged: the workflows as written, the macros from the standalone .macro files (the current, gated ones)
  const macros = new Map();
  for (const f of fs.readdirSync(ND).filter(x => x.endsWith('.macro'))) { const d = N.parse(fs.readFileSync(path.join(ND, f), 'utf8')); macros.set(d.payload.name, d.payload); }
  const getMacro = async (n) => (macros.has(n) ? { ok: true, macro: macros.get(n) } : { ok: false });
  for (const f of ['fiverr-gig-overview-steps.workflow', 'fiverr-gig-scope-pricing-steps.workflow']) {
    const w = N.parse(fs.readFileSync(path.join(ND, f), 'utf8')).payload;
    const r = e.create({ name: w.name, description: w.description || '', status: 'paused', vars: w.vars, settings: w.settings, steps: w.steps });
    if (!r.ok) throw new Error(`${f}: ${r.error}`);
  }
  const pricingVars = Object.keys(e.find('Fiverr gig - Scope & Pricing (steps)').vars || {});
  const P = e.pipelines || (e.pipelines = new (require(path.join(ROOT, 'lib/automation/pipeline.js')).Pipelines)(e));
  const c = P.create({
    name: 'Fiverr gig',
    description: 'A new Fiverr gig, page by page: Overview (category, subcategory, with your choose-category macro), then — after you press Save & Continue — Scope & Pricing (each package). Each page waits at a gate. Publish, Save and Continue stay yours.',
    site: 'https://www.fiverr.com',
    vars: { category: '', subcategory: '', ...Object.fromEntries(pricingVars.map(k => [k, ''])) },
    tasks: [
      // a new gig shows SELECT A CATEGORY / SELECT A SUBCATEGORY (his screenshot, 2026-10-30): his gated macro picks both; the page must then show the subcategory
      { id: 'overview', label: 'Overview: category and subcategory', retries: 1, step: { type: 'macro', config: { name: 'Fiverr gig - choose category', agentId: 'default', params: { category: '{{vars.category}}', subcategory: '{{vars.subcategory}}' } } },
        gate: { element: { text: '{{vars.subcategory}}', timeoutMs: 8000 } } },
      { id: 'on-pricing', label: 'You press Save & Continue (your click)', depends_on: ['overview'],
        step: { type: 'gate', config: { condition: 'page_text', value: 'Scope & Pricing', timeoutMs: 600000 } } },
      { id: 'pricing', label: 'Scope & Pricing: each package', depends_on: ['on-pricing'],
        step: { type: 'workflow', config: { workflow: 'Fiverr gig - Scope & Pricing (steps)', vars: Object.fromEntries(pricingVars.map(k => [k, `{{vars.${k}}}`])) } } },
    ],
  });
  if (!c.ok) throw new Error(c.error);
  const n = await N.pipelineNode(e, c.pipeline.id, { getMacro, tags: ['fiverr', 'bundled'] });
  if (!n.ok) throw new Error(n.error);
  const text = '# The Fiverr gig as a pipeline — bundled with Clear Glass (2026-10-30 PN4). James: "should we rebuild the fiverr plugin?"\n' + n.text;
  fs.writeFileSync(path.join(ND, 'fiverr-gig.pipeline'), text);
  console.log('written', n.filename, 'missing', n.missing, 'requires', JSON.stringify(N.parse(n.text).payload.requires, (k, v) => (k === 'steps' ? `${v.length} steps` : v)).slice(0, 400));
})().catch(e => { console.error(e); process.exit(1); });
