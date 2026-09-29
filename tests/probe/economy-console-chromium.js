'use strict';
/**
 * tests/probe/economy-console-chromium.js — 0.39.281 EC8. The settings console's Provider economy page in a real page
 * (Clear Glass's engine). The API answers are MADE by the real lib/economy modules (policy defaults, gate, learned
 * limits, router scores) over a ledger written for the probe — the shapes guardian's routes return.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const { start } = require('./_glass-probe.js');
const P = start();
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'econ-probe-'));
const PAGE = P.read('idearium/ui/settings.html');
const E = (m) => require(path.join(P.ROOT, 'lib/economy', m));
const Pol = E('policy.js'), L = E('ledger.js'), T = E('tokens.js'), R = E('router.js'), G = E('gate.js');
const providers = ['ollama', 'chatgpt', 'claude'];
const policy = Pol.defaults(providers);
const now = Date.now();
for (let i = 0; i < 12; i++) L.record({ provider: 'chatgpt', jobType: 'build', tokensIn: 2000 + i * 900, outcome: i === 11 ? 'truncated' : 'ok', ms: 30000, at: now - (12 - i) * 60000 });
L.record({ provider: 'claude', jobType: 'build', tokensIn: 5000, outcome: 'login', at: now - 30000 });
const rows = L.records({ since: now - 86400000 });
const usage = {}; for (const p of providers) usage[p] = { ...L.usage(p, now, rows), tier: policy.providers[p].tier, limits: policy.providers[p].limits, enabled: true, gate: G.decide({ provider: p, jobType: 'chat' }, { policy, usage: L.usage(p, now, rows), now }) };
const API = {
  '/api/settings/console': { ok: true, providers, toolScopes: [], blind: [], config: { keys: [] }, repos: [] },
  '/api/economy': { ok: true, policy, tiers: Pol.TIERS, jobTypes: Pol.JOB_TYPES, limits: Pol.LIMITS },
  '/api/economy/usage': { ok: true, usage },
  '/api/economy/limits': { ok: true, days: 30, method: T.METHOD, limits: T.learn(rows), series: T.series(rows) },
  '/api/economy/routing': { ok: true, scores: R.scores(rows, policy), example: R.choose('build', providers, { policy, records: rows }) },
};
(async () => {
  const b = await P.glass.chromium.launch(); const pg = await b.newPage(); const errors = [], posts = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.route('http://idearium.test/**', r => {
    const q = r.request(), u = new URL(q.url());
    if (u.pathname === '/settings.html') return r.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (u.pathname.startsWith('/js/')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(P.ROOT, 'idearium/ui', u.pathname)) });
    if (q.method() === 'POST') { posts.push({ path: u.pathname, body: JSON.parse(q.postData() || '{}') }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (API[u.pathname]) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API[u.pathname]) });
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false,"error":"no"}' });
  });
  await pg.goto('http://idearium.test/settings.html');
  await pg.waitForTimeout(500);
  await pg.evaluate(() => document.querySelector('[data-economy]').click());
  await pg.waitForTimeout(600);
  const v = await pg.evaluate(() => ({ title: document.getElementById('title').textContent, cards: [...document.querySelectorAll('.card h3 .grow')].map(x => x.textContent),
    tiers: [...document.querySelectorAll('[data-econ-tier]')].map(s => `${s.dataset.econTier}:${s.value}`), now: [...document.querySelectorAll('.block .kv')].map(k => k.textContent)[1] || '',
    graphs: document.querySelectorAll('svg.econ-graph').length, dots: document.querySelectorAll('svg.econ-graph circle').length, safe: [...document.querySelectorAll('svg.econ-graph text')].map(t => t.textContent).filter(t => /safe|failed at/.test(t)),
    router: [...document.querySelectorAll('.card .kv')].map(k => k.textContent).find(t => /success/.test(t)) || '' }));
  P.case('the nav opens the Provider economy page with its six cards', v.title === 'Provider economy' && v.cards.length === 6 && /Providers/.test(v.cards[0]) && /Token limits/.test(v.cards[4]), v);
  P.case('each provider shows its tier (ollama local, browser accounts subscription)', v.tiers.includes('ollama:local') && v.tiers.includes('chatgpt:subscription'), v);
  P.case('usage against the limits is shown live (this hour / today / tokens)', /\d+\/30 this hour · \d+\/200 today/.test(v.now), { now: v.now });
  P.case('learned token limits are graphed: one dot per job, the safe line and the failure line', v.graphs >= 1 && v.dots === 13 && v.safe.some(t => /^safe \d+/.test(t)) && v.safe.some(t => /^failed at \d+/.test(t)), v);
  P.case('the router shows what it learned (success, ok / not, median) and why it would pick now', /build\s+chatgpt\s+success 0\.\d+ · 11 ok \/ 1 not/.test(v.router) && /now, for a build:/.test(v.router), { router: v.router });
  await pg.evaluate(() => {
    const l = document.querySelector('[data-econ-lim="chatgpt:jobsPerHour"]'); l.value = '12'; l.dispatchEvent(new Event('input'));
    const g = document.querySelector('[data-econ-lim="chatgpt:minGapMs"]'); g.value = '45'; g.dispatchEvent(new Event('input'));
    const o = document.querySelector('[data-econ-onlimit="claude"]'); o.value = 'fallback:chatgpt'; o.dispatchEvent(new Event('change'));
    const a = document.querySelector('[data-econ-q="chatgpt:0"]'); a.value = '23'; a.dispatchEvent(new Event('input'));
    const z = document.querySelector('[data-econ-q="chatgpt:1"]'); z.value = '7'; z.dispatchEvent(new Event('input'));
    const st = document.querySelector('[data-econ-stage="free"]'); st.checked = true; st.dispatchEvent(new Event('change'));
    const jt = document.querySelector('[data-econ-jt="heal:subscription"]'); jt.checked = false; jt.dispatchEvent(new Event('change'));
  });
  const bar = await pg.evaluate(() => document.getElementById('savebar').classList.contains('on'));
  await pg.evaluate(() => document.getElementById('save').click());
  await pg.waitForTimeout(400);
  const saved = posts.find(p => p.path === '/api/economy');
  const pc = saved && saved.body.policy;
  P.case('edits wait in the save bar and go as ONE patch to POST /api/economy (seconds → ms, quiet hours, fallback, stage tiers, job-type tiers)',
    bar && pc && pc.providers.chatgpt.limits.jobsPerHour === 12 && pc.providers.chatgpt.limits.minGapMs === 45000 && JSON.stringify(pc.providers.chatgpt.quietHours) === '[23,7]'
    && pc.providers.claude.onLimit === 'fallback:chatgpt' && pc.stageTiers.includes('free') && pc.stageTiers.includes('local') && !pc.jobTypes.heal.tiers.includes('subscription') && saved.body.by === 'settings-console', { body: saved && saved.body });
  const normalized = Pol.normalize(pc, providers);
  P.case('what the page sends is a valid policy (normalize drops nothing)', normalized.dropped.length === 0, { dropped: normalized.dropped });
  P.case('it says what is not included, and why', await pg.evaluate(() => /Nothing here makes automated jobs look like you typing/.test(document.body.textContent)));
  P.case('no page errors', errors.length === 0, { errors });
  await b.close(); P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
