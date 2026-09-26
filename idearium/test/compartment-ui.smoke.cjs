// idearium/test/compartment-ui.smoke.cjs — renders the Compartment view,
// the recursive Compartment tab menu and the expanded tab tree from a
// mocked /api/workbench, and checks the recursion/interconnection reach the DOM.
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
window.fetch = async (url) => {
  const u = String(url);
  const body = u.endsWith('/api/workbench') ? INDEX : u.includes('/workbench') ? SHOW :
    u.includes('/api/repos') ? { repos: [{ uuid: 'r1', name: 'probe repo' }] } : u.includes('/api/ideas') ? { ideas: [] } :
    u.includes('/api/brainstorms') ? { brainstorms: [] } : {};
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
window.EventSource = function () { this.close = () => {}; this.addEventListener = () => {}; };
window.requestAnimationFrame = () => 0;
window.HTMLCanvasElement.prototype.getContext = () => null;
const src = fs.readFileSync(path.join(UI, 'js/app.js'), 'utf8') + '\n' + fs.readFileSync(path.join(UI, 'js/compartment.js'), 'utf8') + `
window.__drive = async function () {
  CONNECTED = true; API_BASE = 'http://127.0.0.1:4800';
  API_REPOS = [{ uuid: 'r1', name: 'probe repo' }];
  await loadCompartment();
  await openCompartmentIdea('i1');
  toggleTabTree(true);
};`;
window.eval(src);
(async () => {
  await window.__drive();
  const d = window.document;
  // left tree: three nested levels
  const nodes = [...d.querySelectorAll('#cmp-tree .cmp-node')];
  assert.equal(nodes.length, 3, 'idea tree renders every depth');
  assert.equal(nodes[2].style.getPropertyValue('--d'), '2');
  // lanes: all four columns, problem thread nested three deep
  assert.equal(d.querySelectorAll('#cmp-detail .cmp-lane').length, 4);
  const pe = [...d.querySelectorAll('.cmp-lane[data-lane=problem] .cmp-entry')];
  assert.deepEqual(pe.map(x => x.style.getPropertyValue('--d')), ['0', '1', '2']);
  // interconnection: outbound chip on the deepest entry, inbound marker on the root
  assert.match(pe[2].textContent, /linked elsewhere/);
  assert.match(pe[0].textContent, /⇠ 1/);
  // tab menu: flyouts recurse idea → child → grandchild
  const menu = d.getElementById('compartment-tab-menu');
  assert.equal(menu.querySelectorAll('.tab-nest .tab-nest .tab-nest').length, 1, 'three-deep flyout');
  // expanded tab tree carries compartment ideas and repo subtabs
  const tt = d.getElementById('tab-tree').textContent;
  assert.match(tt, /Compartment/); assert.match(tt, /root idea/); assert.match(tt, /probe repo/);
  assert.ok(d.body.classList.contains('tab-tree-open'));
  // links lane
  window.eval("setCompartmentLane('links')");
  assert.match(d.getElementById('cmp-detail').textContent, /child idea/);
  assert.match(d.getElementById('cmp-detail').textContent, /points at P root/);
  console.log('[PASS] compartment UI: recursive tree, nested lanes, links, recursive tab menu, expanded tab tree');
  process.exit(0);
})().catch(e => { console.error('[FAIL]', e); process.exit(1); });
