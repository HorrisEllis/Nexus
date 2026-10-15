'use strict';
/**
 * tests/modules/test-semantic-page-tree.test.js — SP1 (docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec):
 * the page as a semantic tree for Clear Glass's browser agent. clear-glass/src/page/semantic-tree.js (run in jsdom, the
 * page/reader.js rule) · fromAX on a CDP-shaped fixture · the driver's readTree / resolve.
 * James (2026-10-15): "what about a semantic tree for our own browser agent?" — and his run: Claude's reply not found,
 * ChatGPT's placeholder saved as the send button.
 *
 *   ST-01  a chat page reads as roles and names: the input and the send button have addresses, the placeholder <p> is no button
 *   ST-02  the addresses do not change when the site renames its classes (the churn that broke the selectors)
 *   ST-03  hidden things are not in the tree; headings keep their level; a nameless section is not a region
 *   ST-04  addresses are unique: the 2nd article is article #2 and its children say so; an ambiguous address is refused,
 *          said, never guessed
 *   ST-05  the browser's own tree (CDP AX nodes) gives the same addresses
 *   ST-06  a long page is cut at maxNodes and says so; the outline is indented lines for a small model
 *   ST-07  wired: the driver's readTree / resolve, the agent tool and copilot action lists, the tool cards
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '../..');
const S = require(path.join(ROOT, 'clear-glass/src/page/semantic-tree.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const chat = (cls = 'Zq3') => `<html><head><title>ChatGPT</title></head><body>
  <header><nav aria-label="Chat history"><a href="/c/1" class="${cls}a">Old chat</a></nav></header>
  <main class="${cls}m">
    <article data-testid="conversation-turn-1"><h5 class="sr-only">You said:</h5><div class="${cls}t">hello</div></article>
    <article data-testid="conversation-turn-2"><div class="${cls}r">reply text</div><button aria-label="Copy" class="${cls}c">c</button></article>
    <form class="${cls}f"><div contenteditable="true" id="prompt-textarea" class="${cls}i" data-placeholder="Ask anything"><p class="placeholder"></p></div>
      <button data-testid="send-button" aria-label="Send prompt" class="${cls}s"><svg></svg></button><input type="hidden" name="t"></form>
  </main>
  <div style="display:none"><button>hidden one</button></div><button aria-hidden="true">aria hidden</button>
  <section><h2 id="h2">Settings</h2></section><section aria-labelledby="h3"><h3 id="h3">Account</h3><input id="em" type="email"><label for="em">Email</label></section>
</body></html>`;
const run = (html, opts) => { const dom = new JSDOM(html, { url: 'https://chatgpt.com/', runScripts: 'outside-only' }); return { dom, t: S.normalize(JSON.parse(JSON.stringify(dom.window.eval(S.pageScript(opts)))), opts) }; };
const addr = (t) => t.nodes.map(n => n.address);

console.log('\ntest-semantic-page-tree — the page as a semantic tree (SP1)');
test('ST-01', 'a chat page as roles and names; the placeholder is no button', () => {
  const { t } = run(chat());
  assert.ok(addr(t).includes('main › form › textbox "Ask anything"'), addr(t).join('\n'));
  const send = t.nodes.find(n => n.address === 'main › form › button "Send prompt"');
  assert.ok(send && send.selector === '[data-testid="send-button"]');
  assert.ok(!t.nodes.some(n => n.role === 'button' && /placeholder/i.test(n.name + (n.selector || ''))), 'the placeholder <p> is not a button');
});
test('ST-02', 'renaming every class changes no address', () => {
  assert.deepStrictEqual(addr(run(chat('Zq3')).t), addr(run(chat('k9X_')).t));
});
test('ST-03', 'hidden things are out; headings keep their level; a nameless section is no region', () => {
  const { t } = run(chat());
  assert.ok(!t.nodes.some(n => /hidden/.test(n.name)), 'display:none and aria-hidden are not in the tree');
  assert.strictEqual(t.nodes.find(n => n.name === 'You said:').level, 5);
  assert.ok(addr(t).includes('heading "Settings"'), 'a nameless section adds no path segment');
  assert.ok(addr(t).includes('region "Account" › textbox "Email"'), addr(t).join('\n'));
});
test('ST-04', 'addresses are unique; an ambiguous one is refused, never guessed', () => {
  const { dom, t } = run(chat());
  assert.ok(addr(t).includes('main › article #2') && addr(t).includes('main › article #2 › button "Copy"'));
  assert.strictEqual(new Set(addr(t)).size, t.nodes.length);
  const exact = dom.window.eval(S.resolveScript('main › form › button "Send prompt"'));
  assert.ok(exact.ok && exact.how === 'address' && exact.selector === '[data-testid="send-button"]');
  const loose = dom.window.eval(S.resolveScript('textbox "Ask anything"'));
  assert.ok(loose.ok && loose.how === 'role+name' && loose.selector === '#prompt-textarea', JSON.stringify(loose));
  const page = new JSDOM(chat().replace('<button aria-hidden="true">aria hidden</button>', '<main><article><button aria-label="Copy">c</button></article></main>'), { url: 'https://x/', runScripts: 'outside-only' });
  const amb = page.window.eval(S.resolveScript('button "Copy"'));
  assert.ok(!amb.ok && /2 nodes are button "Copy"/.test(amb.why), JSON.stringify(amb));
  assert.ok(!dom.window.eval(S.resolveScript('button "Nope"')).ok);
});
test('ST-05', "the browser's own tree gives the same addresses", () => {
  const ax = [
    { nodeId: '1', role: { value: 'RootWebArea' }, name: { value: 'ChatGPT' }, childIds: ['2'] },
    { nodeId: '2', parentId: '1', role: { value: 'main' }, name: { value: '' }, childIds: ['3', '6'] },
    { nodeId: '3', parentId: '2', role: { value: 'article' }, childIds: ['4'] },
    { nodeId: '4', parentId: '3', role: { value: 'button' }, name: { value: 'Copy' }, backendDOMNodeId: 40 },
    { nodeId: '6', parentId: '2', role: { value: 'form' }, childIds: ['7', '8', '9'] },
    { nodeId: '7', parentId: '6', role: { value: 'textbox' }, name: { value: 'Ask anything' }, properties: [{ name: 'focused', value: { value: true } }] },
    { nodeId: '8', parentId: '6', role: { value: 'button' }, name: { value: 'Send prompt' }, backendDOMNodeId: 80 },
    { nodeId: '9', parentId: '6', role: { value: 'generic' }, ignored: true },
  ];
  const t = S.normalize(S.fromAX(ax));
  assert.deepStrictEqual(addr(t), ['main', 'main › article', 'main › article › button "Copy"', 'main › form', 'main › form › textbox "Ask anything"', 'main › form › button "Send prompt"']);
  assert.ok(t.nodes.find(n => n.name === 'Send prompt').backendId === 80 && t.nodes.find(n => n.role === 'textbox').states[0] === 'focused');
  assert.strictEqual(t.source, 'ax');
});
test('ST-06', 'a long page is cut and says so; the outline is indented lines', () => {
  const many = '<html><body><main>' + Array.from({ length: 50 }, (_, i) => `<button>b${i}</button>`).join('') + '</main></body></html>';
  const { t } = run(many, { maxNodes: 10 });
  assert.ok(t.nodes.length === 10 && t.cut && t.cut.more === 41, JSON.stringify(t.cut));
  const o = S.outline(run(chat()).t);
  assert.match(o, /^main\n  article\n    heading "You said:" \(h5\)/m);
});
test('ST-07', 'wired: driver, action lists, tool cards', () => {
  const drv = fs.readFileSync(path.join(ROOT, 'clear-glass/src/driver/index.js'), 'utf8');
  assert.ok(/case 'readTree':\s+return this\._readTree/.test(drv) && /case 'resolve':\s+return this\._resolve/.test(drv));
  for (const f of ['lib/agent-tools/tools/clear-glass/browser.js', 'clear-glass/src/copilot/bridge.js']) assert.ok(fs.readFileSync(path.join(ROOT, f), 'utf8').includes("'readPage', 'readTree', 'resolve',"), f);
  const tools = require(path.join(ROOT, 'clear-glass/src/copilot/tools.js'));
  const list = JSON.stringify(tools);
  assert.ok(/readTree/.test(list) || fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/tools.js'), 'utf8').includes("name: 'readTree'"));
});
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
