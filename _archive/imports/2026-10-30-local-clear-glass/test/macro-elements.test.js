'use strict';
// ME-01..05 (2026-10-30): elements logged from the picker for macros (store), and a dropdown recorded as ONE choose step (recording).
const assert = require('assert');
const NexusOptions = require('../src/options/store');
const { recordingToSteps } = require('../src/macros/recording');

const o = new NexusOptions(); o._persist = () => {};
// ME-01 log, list per site
let r = o.addMacroElement('https://www.fiverr.com/manage_gigs/1/edit', { name: 'delivery dropdown', selector: '[data-testid="delivery"]', xpath: '//div[1]', text: 'Delivery time', tag: 'div' });
assert.ok(r.ok && r.origin === 'https://www.fiverr.com' && !r.replaced);
assert.strictEqual(o.getMacroElements()['https://www.fiverr.com'].length, 1);
// ME-02 the same name again REPLACES it (the fix)
r = o.addMacroElement('https://www.fiverr.com/x', { name: 'delivery dropdown', selector: '#delivery-new' });
assert.ok(r.ok && r.replaced);
const list = o.getMacroElements()['https://www.fiverr.com'];
assert.strictEqual(list.length, 1); assert.strictEqual(list[0].selector, '#delivery-new');
// ME-03 refusals say why
assert.ok(o.addMacroElement('https://a.com', { name: '', selector: '#x' }).error);
assert.ok(o.addMacroElement('https://a.com', { name: 'ok' }).error);
assert.ok(o.addMacroElement('not a url', { name: 'ok', selector: '#x' }).error);
// ME-04 remove
assert.ok(o.removeMacroElement('https://www.fiverr.com', 'delivery dropdown').ok);
assert.deepStrictEqual(o.getMacroElements(), {});
assert.ok(o.removeMacroElement('https://www.fiverr.com', 'nope').error);
// ME-05 trigger click + option click → one choose (even with a pause between); a native select change → choose; a lone option click stays a click
const s1 = recordingToSteps([
  { type: 'click', sel: '[data-testid="dd"]', trigger: true, ts: 1000 },
  { type: 'click', sel: 'li:nth-of-type(3)', option: '3 days', ts: 3500 },
  { type: 'change', sel: 'select[name=t]', tagName: 'SELECT', optionText: 'Gold', ts: 3600 },
  { type: 'input', sel: 'select[name=t]', tagName: 'SELECT', optionText: 'Gold', ts: 3601 },
  { type: 'click', sel: 'li:nth-of-type(2)', option: 'Other', ts: 3700 },
], { startUrl: 'https://x.com/a' }).steps;
assert.deepStrictEqual(s1.map(s => s.action), ['navigate', 'choose', 'choose', 'click']);
assert.deepStrictEqual(s1[1].data, { selector: '[data-testid="dd"]', option: '3 days' });
assert.deepStrictEqual(s1[2].data, { selector: 'select[name=t]', option: 'Gold' });
assert.ok(!s1.some(s => s._trigger));
console.log('macro-elements: ok');
