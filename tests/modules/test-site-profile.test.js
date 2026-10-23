'use strict';
/**
 * tests/modules/test-site-profile.test.js — one site's settings for every Clear Glass feature (SP1 …)
 * Map: docs/2026-10-23-site-profile-processes-phasemap.spec · Spec: clear-glass/spec/site-profile.spec
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
 * Cleardriver, agentmesh and guardian setting."
 *
 *   SP-01  keys: one table, every feature's keys, today's behaviour as default; a write outside a key's rule is refused with why
 *   SP-02  the resolver on the real store: a site's value marked site, a global option marked global, else default; clear returns it
 *   SP-03  the network route is one netPolicy origin rule (site.<host>) the real policy decides by; default removes it; a collision is said
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const K = require(CG('src/site-settings/keys.js'));
const { createSiteProfile } = require(CG('src/site-settings/profile.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
// the real per-origin store, held in memory (its JAA persistence is the store's own, tested elsewhere)
function realStore() { const { SiteSettingsStore } = require(CG('src/site-settings/store.js')); const s = new SiteSettingsStore(); s._persist = () => {}; return s; }
function realNet() { const { NetService } = require(CG('src/net/service.js')); let p = null; const n = new NetService({ store: { get: () => p, set: (v) => { p = v; } }, log: () => {} }); n.reapplyAll = async () => {}; return n; }

console.log('\n⬡  site profile — every feature\'s settings for one site\n');

test('SP-01', 'one key table for every feature; defaults are today\'s behaviour; a bad value is refused with why', () => {
  for (const f of ['autofill', 'macros', 'workflows', 'passwords', 'resume', 'driver', 'mesh', 'guardian']) assert.ok(K.byFeature(f).length, `${f} has keys`);
  assert.strictEqual(K.get('driver.navTimeoutMs').default, 30000, 'the driver\'s 30 s today');
  assert.strictEqual(K.get('driver.waitTimeoutMs').default, 10000, 'and its 10 s');
  assert.strictEqual(K.get('workflows.enabled').default, true);
  assert.deepStrictEqual(K.validate('resume.restore', 'scroll'), { ok: true, value: 'scroll' });
  assert.match(K.validate('resume.restore', 'everything').why, /one of off, scroll, scroll\+forms/);
  assert.match(K.validate('driver.navTimeoutMs', -1).why, /between 1000 and 300000/);
  assert.deepStrictEqual(K.validate('macros.autoRun', 'a, b').value, ['a', 'b']);
  assert.match(K.validate('nope.key', 1).why, /unknown site key "nope.key" — known: autofill.enabled/);
});

test('SP-02', 'the resolver: a site value marked site, a global option marked global, else default; clear returns it', () => {
  const store = realStore(); let opts = { driver: { navTimeoutMs: 45000 } };
  const P = createSiteProfile({ store, options: { get: () => opts }, net: realNet() });
  const url = 'https://www.fiverr.com/users/x';
  let p = P.siteProfile(url);
  assert.strictEqual(p.origin, 'https://www.fiverr.com');
  assert.strictEqual(p.driver.navTimeoutMs, 45000); assert.strictEqual(p.from['driver.navTimeoutMs'], 'global');
  assert.strictEqual(p.driver.waitTimeoutMs, 10000); assert.strictEqual(p.from['driver.waitTimeoutMs'], 'default');
  assert.strictEqual(P.setSite(url, 'driver.allowed', false).ok, true);
  assert.strictEqual(P.setSite(url, 'autofill.profileId', 'gig-profile').ok, true);
  assert.match(P.setSite(url, 'resume.restore', 'all').why, /one of off/);
  p = P.siteProfile('https://www.fiverr.com/other/page');
  assert.strictEqual(p.driver.allowed, false); assert.strictEqual(p.from['driver.allowed'], 'site', 'the same origin, any path');
  assert.strictEqual(p.autofill.profileId, 'gig-profile');
  assert.strictEqual(P.siteProfile('https://example.com/').driver.allowed, true, 'another site keeps the default');
  assert.strictEqual(P.clearSite(url, 'driver.allowed').ok, true);
  assert.strictEqual(P.siteProfile(url).from['driver.allowed'], 'default');
  assert.strictEqual(P.siteProfile('about:blank').origin, null, 'no site: the defaults');
  assert.match(P.setSite('about:blank', 'driver.allowed', false).why, /not an http\(s\) page/);
});

test('SP-03', 'the network route: one origin rule the real policy decides by; default removes it; a collision is said', () => {
  const net = realNet(); const P = createSiteProfile({ store: realStore(), net });
  const Policy = require(CG('src/net/policy.js'));
  const url = 'https://chat.example.org/c/1';
  assert.deepStrictEqual(P.netRoute(url), { via: 'default', rule: null });
  const r = P.setNetRoute(url, 'transport');
  assert.ok(r.ok && r.rule === 'site.chat.example.org', JSON.stringify(r));
  assert.strictEqual(net.policy().rules.length, 1);
  const d = Policy.resolve(net.policy(), { url: 'https://chat.example.org/x' });
  assert.strictEqual((d.rule && d.rule.id) || d.ruleId || d.id, 'site.chat.example.org', JSON.stringify(d));
  assert.strictEqual(P.siteProfile(url).network.via, 'transport');
  assert.strictEqual(P.setNetRoute(url, 'block').ok, true);
  assert.strictEqual(net.policy().rules.length, 1, 'replaced, not added twice');
  assert.strictEqual(P.setSite(url, 'network.via', 'default').ok, true);
  assert.strictEqual(net.policy().rules.length, 0, 'default removes the rule');
  assert.match(P.setNetRoute(url, 'tor').why, /one of default, direct, transport, block/);
  assert.strictEqual(P.setNetRoute(url, 'transport').ok, true);
  net.addRoute({ id: 'hand.rule', match: { origin: 'other.example.org' }, via: 'direct' });
  const hand = net.policy().rules.find(x => x.id === 'hand.rule'); hand.match.origin = 'chat.example.org';   // a hand-written rule for the same host
  const c = P.setNetRoute(url, 'block');
  assert.ok(!c.ok && c.why, `a rule as specific that disagrees is refused and said: ${JSON.stringify(c)}`);
  assert.strictEqual(c.kept, 'transport', 'the site keeps the route it had');
  assert.strictEqual(net.policy().rules.find(x => x.id === 'site.chat.example.org').via, 'transport', 'put back, not lost');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
