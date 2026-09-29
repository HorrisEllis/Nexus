'use strict';
/**
 * tests/probe/settings-console-chromium.js — 0.39.279. idearium/ui/settings.html (the settings console) in a real page,
 * Clear Glass's engine, against a recorded fake of its API: the nav lists global + every repo (branches apart); a global
 * key shows its source and a bounded number; edits wait in the save bar and Save posts each to the route that owns it;
 * a repo's Agent / Prompt / Compartment tabs; a branch's agent settings are read-only with a link to the original.
 * Usage: node tests/probe/settings-console-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const { start } = require('./_glass-probe.js');
const P = start();
const PAGE = P.read('idearium/ui/settings.html');

const CONSOLE = { ok: true, providers: ['copilot', 'ollama', 'claude'], toolScopes: ['harness', 'all', 'project'], blind: [],
  config: { configFile: 'idearium.config.json', configFileExists: false, keys: [
    { key: 'repos.code_repo_mode', value: 'branch', source: 'default', default: 'branch', type: 'string', enum: ['branch', 'copy'], min: null, max: null, copilot_writable: true },
    { key: 'desktop.ram_mb', value: 4096, source: 'runtime', default: 4096, type: 'number', enum: null, min: 512, max: 65536, copilot_writable: true },
  ] },
  repos: [{ uuid: 'r-orig', name: 'Lock Service', provider: 'claude' }, { uuid: 'r-code', name: 'Lock Service · code', branchOf: 'r-orig', branch: 'nexus/lock-service-code', settingsFrom: 'r-orig' }] };
const DETAIL = {
  'r-orig': { ok: true, blind: [], repo: CONSOLE.repos[0], agent: { provider: 'claude', providers: ['copilot', 'ollama', 'claude'], backend: 'guardian', ollamaModel: null, toolScope: 'harness', toolScopes: ['harness', 'all', 'project'], injectMode: 'review', modes: ['auto', 'review', 'off'] },
    blocks: { version: '1.2.0', placeholders: { memory: ['{memory}'] }, list: [{ id: 'memory', label: 'Memory', enabled: false, when: 'always', text: '{memory}', edited: false }, { id: 'wake', label: 'hey nexus', enabled: true, when: 'guardian', text: 'Need live NEXUS state?', edited: false }] },
    hat: { name: 'repo_x', baseAgent: 'copilot', toolScope: ['read_file'], persona: 'You are the agent of Lock Service.', personaChars: 34 },
    compartment: { id: 'c1', name: 'idearium-repo-1', state: 'created', parentId: null, root: '/cos/c1' }, desktop: { ok: true, state: 'none', ports: { vncPort: 5936, wsPort: 5736 } }, branches: [{ uuid: 'r-code', name: 'Lock Service · code', branch: 'nexus/lock-service-code' }] },
  'r-code': null,
};
DETAIL['r-code'] = { ...DETAIL['r-orig'], repo: CONSOLE.repos[1], branches: null };

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  const errors = [], posts = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.route('http://idearium.test/**', r => {
    const q = r.request(), u = new URL(q.url());
    if (u.pathname === '/settings.html') return r.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (q.method() === 'POST') { posts.push({ path: u.pathname, body: JSON.parse(q.postData() || '{}') }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.pathname === '/api/settings/console') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CONSOLE) });
    const m = u.pathname.match(/^\/api\/settings\/console\/(.+)$/);
    if (m) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DETAIL[decodeURIComponent(m[1])]) });
    if (u.pathname === '/api/ollama/models') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"models":[{"name":"qwen2.5:3b"}]}' });
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false,"error":"no"}' });
  });
  const wait = (ms) => pg.waitForTimeout(ms);
  await pg.goto('http://idearium.test/settings.html');
  await wait(600);
  const nav = await pg.evaluate(() => [...document.querySelectorAll('.navgroup')].map(g => g.textContent));
  P.case('the nav: global, the repos, and branches apart', nav[0] === 'Idearium' && /Repos · compartments \(1\)/.test(nav[1]) && /Branches \(1\)/.test(nav[2]), { nav });
  const g = await pg.evaluate(() => ({ title: document.getElementById('title').textContent, src: [...document.querySelectorAll('.row .tag')].map(t => t.textContent), num: document.querySelector('input[type=number]').max }));
  P.case('global: every key with where its value comes from; bounds on a number', /global configuration/.test(g.title) && g.src.includes('default') && g.src.includes('runtime') && g.num === '65536', { g });
  await pg.evaluate(() => { const s = document.querySelector('select[data-k="repos.code_repo_mode"]'); s.value = 'copy'; s.dispatchEvent(new Event('change')); });
  await pg.evaluate(() => { const n = document.querySelector('input[data-k="desktop.ram_mb"]'); n.value = '99'; n.dispatchEvent(new Event('input')); });
  const bad = await pg.evaluate(() => document.querySelector('input[data-k="desktop.ram_mb"]').classList.contains('bad'));
  const bar = await pg.evaluate(() => document.getElementById('savebar').classList.contains('on') && document.getElementById('savecount').textContent);
  P.case('an out-of-bounds number is refused on the spot; a valid change waits in the save bar', bad && bar === '1 unsaved change', { bad, bar });
  await pg.evaluate(() => document.getElementById('save').click());
  await wait(500);
  P.case('Save posts the change to /api/config', posts.some(p => p.path === '/api/config' && p.body.key === 'repos.code_repo_mode' && p.body.value === 'copy'), { posts });

  await pg.evaluate(() => document.querySelector('[data-repo="r-orig"]').click());
  await wait(600);
  const a = await pg.evaluate(() => ({ title: document.getElementById('title').textContent, tabs: [...document.querySelectorAll('.tab')].map(t => t.textContent), prov: document.getElementById('a-provider').value, model: [...document.getElementById('a-model').options].map(o => o.textContent) }));
  P.case('a repo: its tabs, its provider, the installed Ollama models', a.title === 'Lock Service' && a.tabs.join('|') === 'Agent|Prompt|Hat|Compartment & desktop' && a.prov === 'claude' && a.model.includes('qwen2.5:3b'), { a });
  posts.length = 0;
  await pg.evaluate(() => { const s = document.getElementById('a-scope'); s.value = 'project'; s.dispatchEvent(new Event('change')); });
  await pg.evaluate(() => document.getElementById('save').click());
  await wait(500);
  P.case('the agent change goes to that repo\'s agent/settings', posts.length === 1 && posts[0].path === '/api/repos/r-orig/agent/settings' && posts[0].body.toolScope === 'project', { posts });

  await pg.evaluate(() => [...document.querySelectorAll('.tab')].find(t => t.textContent === 'Prompt').click());
  await wait(200);
  posts.length = 0;
  await pg.evaluate(() => { const c = document.querySelector('[data-on="memory"]'); c.checked = true; c.dispatchEvent(new Event('change')); });
  await pg.evaluate(() => document.getElementById('save').click());
  await wait(500);
  P.case('a block switched on is saved with the whole block list', posts[0] && posts[0].path === '/api/repos/r-orig/agent/blocks' && posts[0].body.blocks.find(x => x.id === 'memory').enabled === true && posts[0].body.blocks.length === 2, { posts });

  await pg.evaluate(() => [...document.querySelectorAll('.tab')].find(t => t.textContent === 'Compartment & desktop').click());
  await wait(200);
  const env = await pg.evaluate(() => ({ open: !!document.getElementById('d-open'), text: document.getElementById('body').textContent }));
  P.case('compartment & desktop: the compartment, its branch, the desktop ports and Open desktop', env.open && /idearium-repo-1/.test(env.text) && /nexus\/lock-service-code/.test(env.text) && /websocket 5736/.test(env.text), { env: env.text.slice(0, 300) });

  await pg.evaluate(() => document.querySelector('[data-repo="r-code"]').click());
  await wait(600);
  await pg.evaluate(() => [...document.querySelectorAll('.tab')].find(t => t.textContent === 'Agent').click());   // the tab is kept across repos
  await wait(300);
  const br = await pg.evaluate(() => ({ disabled: document.getElementById('a-provider').disabled, sub: document.getElementById('sub').textContent }));
  P.case('a branch\'s agent settings are the original\'s: read-only, with a way there', br.disabled && /live in the original/.test(br.sub), { br });
  P.case('no page errors', errors.length === 0, { errors });
  await b.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
