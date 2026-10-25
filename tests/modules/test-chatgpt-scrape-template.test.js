'use strict';
// CGS-01..04 (0.60.69): the ChatGPT chat reader template is wired so the engine can run it: the loop body is exactly the per-chat steps, fields use the DOM extractor's real syntax.
const assert = require('assert');
const { TEMPLATES } = require('../../orchestrator/automation/templates.js');
const DOM = require('../../orchestrator/automation/dom.js');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ' ' + e.message); } };
const tpl = TEMPLATES.find(x => x.id === 'chatgpt-scrape'); const loopAt = tpl.steps.findIndex(s => s.type === 'loop');
t('CGS-01 the template is listed with a loop over the chat list', () => { assert.ok(tpl && loopAt > 0); assert.strictEqual(tpl.steps[loopAt].config.onlyNew, '{{item.link}}'); });
t('CGS-02 the loop body ends at Save: the notify runs once, after the loop', () => {
  const body = tpl.steps.slice(loopAt + 1, loopAt + 1 + Number(tpl.steps[loopAt].config.body));
  assert.strictEqual(body[body.length - 1].label, 'Save'); assert.strictEqual(tpl.steps[loopAt + 1 + body.length].type, 'notify');
});
t('CGS-03 every {{vars.x}} the steps use is declared', () => {
  const used = [...JSON.stringify(tpl.steps).matchAll(/vars\.(\w+)/g)].map(m => m[1]);
  const missing = used.filter(k => !(k in tpl.vars)); assert.deepStrictEqual(missing, []);
});
t('CGS-04 the record fields build a real extract script (self text/href, attr)', () => {
  const ex = tpl.steps.filter(s => s.type === 'extract');
  for (const s of ex) { const fields = {}; String(s.config.fields).split('\n').forEach(l => { const [k, v] = l.split(' = '); fields[k.trim()] = v.trim(); });
    assert.ok(DOM.extract({ selector: 'x', fields, limit: 5 }).length > 20); }
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
