// idearium/test/compartment-ui.smoke.cjs — the idea lanes (brainstorm · problem
// solving · expand · improve) from a mocked /api/workbench, and the expanded tab tree.
// §0.39.263 — James: "should not be a compartments tab, repos are compartments …
// the only repo i should be seeing is nexus, the rest are nested in the nexus repo."
// And: "ideas promoted to specs get a repo." There is no Compartment tab or view. The
// lanes render where the idea lives — a spec's repo (its Idea tab), or, before it is a
// spec, the idea's detail in Create › Ideas. Nothing creates a repo for an idea. The
// navigator nests the systems in nexus.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const assert = require('assert/strict');
const UI = path.join(__dirname, '../ui');
const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');

const counts = (p) => ({ total: p, open: p, lanes: { brainstorm: 1, problem: p - 1, expand: 0, improve: 0 } });
const INDEX = { lanes: null, tree: [
  { ideaUuid: 'i1', text: 'root idea', counts: counts(3), ts: 2, children: [
    { ideaUuid: 'i2', text: 'child idea', counts: counts(1), ts: 1, children: [
      { ideaUuid: 'i3', text: 'grandchild idea', counts: counts(1), ts: 0, children: [] }] }] }] };
const e = (uuid, lane, text, children = [], extra = {}) => ({ uuid, ideaUuid: 'i1', lane, text, status: 'open', links: [], children, ...extra });
const SHOW = {
  idea: { uuid: 'i1', text: 'root idea', phase: 'seed', tags: [] },
  path: [], childIdeas: [{ ideaUuid: 'i2', text: 'child idea' }], links: [],
  tree: { brainstorm: [e('e1', 'brainstorm', 'seed thought')],
          problem: [e('p1', 'problem', 'P root', [e('p2', 'problem', 'P sub', [e('p3', 'problem', 'P subsub', [], { links: ['x9'] })])])],
          expand: [], improve: [] },
  outbound: [{ ref: 'x9', kind: 'entry', ideaUuid: 'i2', lane: 'improve', text: 'linked elsewhere' }],
  inbound: [{ uuid: 'z1', ideaUuid: 'i2', lane: 'expand', text: 'points at P root', links: ['p1'] }],
};
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:4800/ui/index.html' });
const { window } = dom;
const REPOS = [{ uuid: 'r1', name: 'probe repo', ideaUuid: 'i1' },
  { uuid: 'nx', name: 'nexus', nexusSelf: { role: 'parent', children: {} } },
  { uuid: 'ng', name: 'nexus/guardian', nexusSelf: { role: 'system', system: 'guardian' } }];
const posted = [];
window.fetch = async (url, opts = {}) => {
  const u = String(url);
  if ((opts.method || 'GET') === 'POST') posted.push(u);
  const body = u.endsWith('/health') ? { ok: true, version: 'test' } :   // idearium's own health body (0.39.260)
    u.endsWith('/api/repos/r1/idea') ? { idea: { uuid: 'i1', text: 'root idea', phase: 'seed', links: 0 }, iterations: [], kinds: ['improve', 'iterate', 'expand'], statuses: ['open', 'done'] } :
    u.endsWith('/api/workbench') ? INDEX : u.includes('/workbench') ? SHOW :
    u.includes('/api/repos') ? { repos: REPOS } : u.includes('/api/ideas') ? { ideas: [] } :
    u.includes('/api/brainstorms') ? { brainstorms: [] } : {};
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
window.EventSource = function () { this.close = () => {}; this.addEventListener = () => {}; };
window.requestAnimationFrame = () => 0;
window.HTMLCanvasElement.prototype.getContext = () => null;
const src = fs.readFileSync(path.join(UI, 'js/app.js'), 'utf8') + '\n' + fs.readFileSync(path.join(UI, 'js/compartment.js'), 'utf8') + `
window.__drive = async function () {
  CONNECTED = true; API_BASE = 'http://127.0.0.1:4800';
  API_REPOS = ${JSON.stringify(REPOS)};
  await loadCompartment();
  IDEAS = [{ uuid: 'i1', text: 'root idea', phase: 'specced' }, { uuid: 'i4', text: 'an idea, not a spec', phase: 'seed', tension: 0.3 }];
  await openCompartmentIdea('i4');          // not a spec: its detail in Create › Ideas
  await new Promise(r => setTimeout(r, 50));
  window.__ideasView = { active: document.getElementById('view-ideas').classList.contains('active'), lanes: document.querySelectorAll('#view-ideas .cmp-host .cmp-lane').length };
  await openCompartmentIdea('i1');          // a spec (repo r1): its repo's Idea tab
  await new Promise(r => setTimeout(r, 50));
  toggleTabTree(true);
};
window.__state = () => ({ repo: CURRENT_API_REPO && CURRENT_API_REPO.uuid, sub: CURRENT_REPO_SUBTAB });`;
window.eval(src);
(async () => {
  await window.__drive();
  const d = window.document;
  // no Compartment tab, no Compartment view: repos are compartments
  assert.equal(d.getElementById('view-compartment'), null, 'no Compartment view');
  assert.equal(d.querySelector('[data-view="compartment"]'), null, 'no Compartment tab');
  assert.equal(d.getElementById('compartment-tab-menu'), null, 'no Compartment menu');
  // an idea that is not a spec is worked in Create › Ideas; nothing makes it a repo
  assert.deepEqual({ ...window.__ideasView }, { active: true, lanes: 4 }, JSON.stringify(window.__ideasView));
  assert.ok(!posted.some(u => /\/api\/repos$|\/repo$/.test(u)), 'no repo was created: ' + posted.join(', '));
  // an idea that is a spec opens in its repo's Idea tab
  assert.deepEqual({ ...window.__state() }, { repo: 'r1', sub: 'idea' }, JSON.stringify(window.__state()));
  // lanes: all four columns, inside the repo's Idea tab, problem thread nested three deep
  assert.equal(d.querySelectorAll('#repo-subtab-idea .cmp-host .cmp-lane').length, 4, 'a spec\'s lanes are its repo\'s Idea tab: ' + JSON.stringify({ host: !!d.querySelector('#repo-subtab-idea .cmp-host'), active: d.querySelector('.view.active')?.id, html: (d.querySelector('#repo-subtab-idea') || {}).innerHTML?.slice(0, 200) }));
  const pe = [...d.querySelectorAll('#repo-subtab-idea .cmp-lane[data-lane=problem] .cmp-entry')];
  assert.deepEqual(pe.map(x => x.style.getPropertyValue('--d')), ['0', '1', '2']);
  // interconnection: outbound chip on the deepest entry, inbound marker on the root
  assert.match(pe[2].textContent, /linked elsewhere/);
  assert.match(pe[0].textContent, /⇠ 1/);
  // the repo's own idea text is edited above the lanes, not repeated in them
  assert.equal(d.querySelectorAll('#repo-subtab-idea .cmp-idea-text').length, 0);
  // expanded tab tree: repos only; nexus holds its systems; no Compartment branch
  const tt = d.getElementById('tab-tree');
  assert.doesNotMatch(tt.textContent, /Compartment/);
  assert.match(tt.textContent, /probe repo/);
  const top = [...tt.querySelectorAll(':scope .tt-branch')].find(b => /Repos/.test(b.querySelector('.tt-head').textContent));
  window.eval("toggleTabTreeBranch('repo:nx')");
  const tt2 = d.getElementById('tab-tree').textContent;
  assert.match(tt2, /systems/); assert.match(tt2, /nexus\/guardian/);
  const repoHeads = [...d.querySelectorAll('#tab-tree .tt-branch .tt-kids > .tt-branch > .tt-head .tt-label')].map(x => x.textContent);
  assert.ok(!repoHeads.slice(0, 2).includes('nexus/guardian') && repoHeads.includes('nexus'), 'systems are not top-level repos: ' + repoHeads.join(', '));
  assert.ok(top, 'Repos branch'); assert.ok(d.body.classList.contains('tab-tree-open'));
  // the Repos badge counts what the library shows (nexus, not its systems)
  window.eval('renderRepoLibrary()');
  assert.equal(d.getElementById('repo-count-badge').textContent, '2');
  // links lane
  window.eval("setCompartmentLane('links')");
  assert.match(d.querySelector('#repo-subtab-idea .cmp-host').textContent, /child idea/);
  assert.match(d.querySelector('#repo-subtab-idea .cmp-host').textContent, /points at P root/);
  console.log('[PASS] compartment UI: lanes in Ideas before a spec, in the spec\'s repo after (nested, linked); no Compartment tab; no repo made; nexus nests its systems');
  process.exit(0);
})().catch(e => { console.error('[FAIL]', e); process.exit(1); });
