'use strict';
// 2026-11-14 TB1/TB4 — the page's pricing values back into the gig; a delivery the dropdown lacks is said with the nearest offered
const assert = require('assert');
const { applyPricingRead } = require('../src/autofill/gig-takeback');
const { matchOption } = require('../src/page/option-match');

const gig = { title: 'I will spec and architect', packages: {
  basic: { name: 'One-Page Brief', description: 'Your idea as a one-page brief', deliveryDays: 2, revisions: 1, price: 50 },
  standard: { name: 'Spec and Build Plan', deliveryDays: 5, revisions: 2, price: 160 },
  premium: { name: 'Architecture Package', deliveryDays: 9, revisions: 3, price: 380 } } };
const read = {
  basic: { name: 'Architecture Brief', description: 'One-page architecture brief', delivery: '3 DAYS DELIVERY', revisions: '1', price: '60' },
  standard: { name: 'Spec and Build Plan', delivery: '7 DAYS DELIVERY', revisions: 'SELECT', price: '$180' },
  premium: { delivery: 'DELIVERY TIME', revisions: 'Unlimited', price: 'abc' } };
const r = applyPricingRead(gig, read);
assert.strictEqual(r.gig.packages.basic.price, 60);
assert.strictEqual(r.gig.packages.basic.deliveryDays, 3);
assert.strictEqual(r.gig.packages.basic.name, 'Architecture Brief');
assert.strictEqual(r.gig.packages.standard.price, 180);
assert.strictEqual(r.gig.packages.standard.revisions, 2, 'SELECT never overwrites');
assert.strictEqual(r.gig.packages.premium.deliveryDays, 9, 'DELIVERY TIME (unset) never overwrites');
assert.strictEqual(r.gig.packages.premium.revisions, 'Unlimited');
assert.ok(r.skipped.some(x => x.part === 'premium.price'), 'an unreadable price is said');
assert.strictEqual(gig.packages.basic.price, 50, 'the input gig is not changed');
assert.ok(!r.changes.some(c => c.part === 'standard.name'), 'same value is not a change');
assert.ok(applyPricingRead(gig, { error: 'x' }).skipped.length === 1);

const opts = ['DELIVERY TIME', '1 DAY DELIVERY', '7 DAYS DELIVERY', '10 DAYS DELIVERY', '14 DAYS DELIVERY'];
const m = matchOption(opts, '12 days');
assert.strictEqual(m.ok, false); assert.strictEqual(m.nearest, '14 DAYS DELIVERY'); assert.ok(/nearest offered/.test(m.why));
assert.strictEqual(matchOption(opts, '7 days').option, '7 DAYS DELIVERY');
console.log('gig-takeback: ok');
