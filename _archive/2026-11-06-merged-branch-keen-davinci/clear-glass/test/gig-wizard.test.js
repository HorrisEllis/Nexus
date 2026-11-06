'use strict';
// FW1 (0.60.268): test/gig-wizard.electron.js in real Electron under xvfb. James, 2026-10-26: "needs to autofill then next page, wait
// for it to load, then autofill the next page."
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const bin = [path.join(root, '..', 'node_modules/electron/dist/electron'), path.join(root, 'node_modules/electron/dist/electron')].find(f => fs.existsSync(f));
const xvfb = process.platform === 'linux' ? ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run'].find(f => fs.existsSync(f)) : null;
assert.ok(/isGigEditor\(url\)/.test(fs.readFileSync(path.join(root, 'src/ipc/bridge.js'), 'utf8')), 'the gig fill walks the wizard on a Fiverr gig editor');
if (!bin || (process.platform === 'linux' && !xvfb)) { console.log('gig-wizard.test.js: Electron part SKIPPED (no Electron or xvfb)'); process.exit(0); }
const args = [bin, '--no-sandbox', path.join(__dirname, 'gig-wizard.electron.js')];
const r = xvfb ? spawnSync(xvfb, ['-a', ...args], { encoding: 'utf8', timeout: 120000 }) : spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 120000 });
const line = String(r.stdout || '').split('\n').find(l => l.startsWith('FWRESULT '));
assert.ok(line, `no result: ${String(r.stderr || '').slice(-600)}`);
const o = JSON.parse(line.slice(9));
assert.ok(!o.error, o.error);
assert.deepStrictEqual(o.pages, ['general:title+tags>pricing',
  'pricing:basic.name+basic.description+basic.deliveryDays+standard.deliveryDays+premium.deliveryDays+basic.revisions+standard.revisions+premium.revisions>description',
  'description:description+faq.0+faq.1>requirements', 'requirements:requirement.0+requirement.1>gallery'], 'fill, Save & Continue, wait, fill — page after page');
// §FW2 0.60.269 — what each page held when it moved on: the pricing dropdowns per package, the FAQs and buyer questions added
const snap = JSON.parse(o.snap);
assert.deepStrictEqual(snap.pricing.delivery, ['3 Days Delivery', '5 Days Delivery', '7 Days Delivery']);
assert.deepStrictEqual(snap.pricing.revisions, ['1', '2', 'Unlimited'], 'revisions per package; -1 is Unlimited');
assert.strictEqual(snap.description.faqs.length, 2); assert.ok(/^Which AI providers\?/.test(snap.description.faqs[0]));
assert.deepStrictEqual(snap.requirements.reqs, ['What should the workflow do?', 'Who will use it?']);
assert.ok(!o.left.some(k => /^faq\.|^requirement\./.test(k)), 'added FAQs and questions are not left to copy');
assert.strictEqual(o.stop, 'stopped at gallery: uploading and publishing are yours');
assert.strictEqual(o.url, 'gallery'); assert.strictEqual(o.published, 'gallery', 'Publish was never pressed');
assert.strictEqual(o.stay, 'stayed on general after "Save & Continue": Please enter a gig title', 'a page that will not move on: where, and the page\'s own message');
console.log('gig-wizard.test.js: ok — ' + o.pages.join(' → '));
