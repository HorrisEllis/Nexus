'use strict';
// tests/modules/brainos-float-cg.test.js — BrainOS Float with the Clear Glass
// tabs (ui/brainos-float/brainos-float-cg.js) registered before mount: the five
// built-ins survive, the five new tabs render from their real routes.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
let pass = 0;
const t = async (n, fn) => { await fn(); pass++; console.log(`  ✓ ${n}`); };
const UI = path.join(__dirname, '../../ui/brainos-float');

(async () => {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'http://127.0.0.1:9000/ui/brainos-float/' });
  const w = dom.window;
  const calls = [];
  w.fetch = async (url, opts = {}) => {
    const u = String(url); calls.push([opts.method || 'GET', u, opts.body ? JSON.parse(opts.body) : null]);
    const body = u.endsWith('/agent-mesh/view') ? { ok: true, nodes: [{ kind: 'agent', id: 'mesh-claude-a', label: 'claude', status: 'idle', health: 80, meta: { taskCount: 2 } }, { kind: 'node', id: 'n1', label: 'cortex', status: 'alive', health: 100 }] }
      : u.endsWith('/cli/bgtab') ? { tabs: [{ agentId: 'bg-1', url: 'https://x.io' }] }
      : u.endsWith('/agent-mesh/intake') ? { ok: true, jobs: [{ jobId: 'job-123456789', provider: 'claude', status: 'done', acceptedAt: Date.now() }] }
      : u.endsWith('/cli/macros') ? { ok: true, macros: [{ name: 'apply', steps: 3, params: [], runCount: 1 }] }
      : u.includes('/cli/macros/apply/run') ? { ok: true, results: [1, 2, 3] }
      : u.endsWith('/cli/autofill/profiles') ? { profiles: [{ id: 'p1', label: 'Jobs', fields: { email: 'a@b.c' } }] }
      : u.endsWith('/cli/autofill/detect') ? { matches: [{ fieldType: 'email', confidence: 'high', source: 'autocomplete' }], totalFields: 4 }
      : u.endsWith('/cli/site-settings/origins') ? { origins: ['https://x.io'] }
      : u.includes('/cli/site-settings?url=') ? { settings: { zoomFactor: 1.25, 'permission:media': 'deny' } }
      : { ok: true };
    return { ok: true, status: 200, json: async () => body };
  };
  w.prompt = () => 'x';
  for (const f of ['brainos-float.js', 'brainos-float-cg.js']) w.eval(fs.readFileSync(path.join(UI, f), 'utf8'));
  w.BrainOSFloat.mount({});
  const settle = () => new Promise(r => setTimeout(r, 30));
  const tabs = () => [...w.document.querySelectorAll('.bf-tab')].map(e => e.textContent);
  const open = async (label) => { [...w.document.querySelectorAll('.bf-tab')].find(e => e.textContent === label).click(); await settle(); };
  const text = () => w.document.querySelector('.bf-content').textContent;

  await t('built-ins survive tabs registered before mount; new tabs follow them', () => {
    assert.deepStrictEqual(tabs(), ['AGENTS', 'PIPELINE', 'JOBS', 'USERSCRIPTS', 'AUTOMATION', 'NODES', 'MESH JOBS', 'MACROS', 'AUTOFILL', 'SITES']);
  });
  await t('NODES renders agents and network nodes from /agent-mesh/view', async () => {
    await open('NODES'); assert.match(text(), /claude/); assert.match(text(), /cortex/);
    assert.ok(w.document.querySelector('.bf-health > span').getAttribute('style').includes('80%'));
  });
  await t('MESH JOBS lists intake jobs', async () => { await open('MESH JOBS'); assert.match(text(), /claude · job-123456/); });
  await t('MACROS runs in the chosen tab', async () => {
    await open('MACROS');
    const sel = w.document.querySelector('.bf-content select');
    assert.ok([...sel.options].some(o => o.value === 'bg-1'), 'background tabs are targets');
    sel.value = 'mesh-claude-a';
    [...w.document.querySelectorAll('.bf-content .bf-btn')].find(b => b.textContent === '▶').click(); await settle();
    const run = calls.find(c => c[1].includes('/cli/macros/apply/run'));
    assert.strictEqual(run[2].agentId, 'mesh-claude-a');
  });
  await t('AUTOFILL previews matches', async () => {
    await open('AUTOFILL');
    [...w.document.querySelectorAll('.bf-content .bf-btn')].find(b => b.textContent === 'PREVIEW').click(); await settle();
    assert.match(w.document.querySelector('.bf-out').textContent, /email\s+high/);
  });
  await t('SITES lists each site and its keys, deletes a key', async () => {
    await open('SITES'); await settle();
    assert.match(text(), /zoomFactor = 1.25/); assert.match(text(), /permission:media = deny/);
    [...w.document.querySelectorAll('.bf-content .bf-btn')].find(b => b.textContent === '✕').click(); await settle();
    assert.ok(calls.some(c => c[0] === 'DELETE' && c[1].includes('/cli/site-settings/key?url=https%3A%2F%2Fx.io&key=')));
  });
  console.log(`\n  ${pass} passed, 0 failed\n`);
  process.exit(0);
})().catch(e => { console.error('  ✗', e); process.exit(1); });
