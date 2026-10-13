'use strict';
/**
 * tests/modules/test-accounts-picker-cos.test.js — 0.60.2
 *
 * James (2026-10-12): "when popups happen, can you have it be the same ui as the cos ui? like the screenshot but for agent
 * providers?" · "the chatgpt popup said there was a problem with cookies when i tried to login with google. can we build
 * the actual cookie vault using jaa? that way we can have actual account routing, and hat specific accounts. intent
 * routing?" · "chatgpt doesn't need a login currently." · "the popup … have it use the actual element picker or guardian
 * picker. can you also have the picker mapped to the scripts injected for the interaction field or the x y z coords for
 * the elements?"
 *
 *   AR-0x  guardian/lib/account-routing.js: hat / intent / repo rules, most specific wins, the job's own account, the log
 *   CV-0x  clear-glass/src/cookies/vault.js: cookies set the way Chromium takes them, every site restored, capture per site
 *   AS-0x  clear-glass/src/providers/account-switch.js: refuses an unknown or unsaved account untouched; saves, swaps, reloads
 *   FM-0x  guardian/userscript-field-map.js: a verified pick used first; several matches told apart by x/y/z; the anchor
 *   SM-0x  guardian/lib/selector-map.js + agent-registry: the anchor travels with the map; a re-pick re-anchors
 *   AT-0x  clear-glass/src/providers/attention.js: the COS window, Clear Glass's selector check, the anchor; signed-out chat
 *   WR-0x  the wiring: dispatcher, routes, host.js (sign-in responses untouched, no Electron in the UA), the prelude
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** a fake Electron session: cookies.get / set / remove, clearStorageData */
function fakeSession(initial = []) {
  let jar = initial.map(c => ({ ...c }));
  return {
    get jar() { return jar; },
    cookies: {
      get: async (f = {}) => jar.filter(c => !f.domain || String(c.domain).replace(/^\./, '').endsWith(f.domain)).map(c => ({ ...c })),
      set: async (a) => {
        if (a.name.startsWith('__Host-') && a.domain) throw new Error('__Host- cookie with a domain');
        jar = jar.filter(c => !(c.name === a.name && c.domain === (a.domain || new URL(a.url).hostname)));
        jar.push({ name: a.name, value: a.value, domain: a.domain || new URL(a.url).hostname, path: a.path, secure: a.secure, httpOnly: a.httpOnly, sameSite: a.sameSite || 'unspecified', hostOnly: !a.domain });
      },
      remove: async (url, name) => { const h = new URL(url).hostname; jar = jar.filter(c => !(c.name === name && String(c.domain).replace(/^\./, '') === h)); },
    },
    clearStorageData: async () => { jar = []; },
  };
}

(async () => {
  console.log('\ntest-accounts-picker-cos\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-acct-'));
  try {
    // ── AR: account routing ───────────────────────────────────────────────────
    const AR = require(path.join(ROOT, 'guardian/lib/account-routing.js'));
    const R = AR.createAccountRouting({ dir: path.join(tmp, 'routing') });
    check('AR-01 a rule needs a provider and an account', !R.setRule({ provider: 'chatgpt' }).ok && !R.setRule({ account: 'a' }).ok);
    R.setRule({ provider: 'chatgpt', account: 'acct-personal', label: 'every chatgpt job' });
    R.setRule({ provider: 'chatgpt', account: 'acct-work', hat: 'architect' });
    R.setRule({ provider: 'chatgpt', account: 'acct-client', hat: 'architect', repo: 'client-site' });
    R.setRule({ provider: 'chatgpt', account: 'acct-review', intent: ['review', 'audit'] });
    const r1 = R.route({ id: 'j1', provider: 'chatgpt', command: 'ask' });
    const r2 = R.route({ id: 'j2', provider: 'chatgpt', hat: 'Architect', command: 'ask' });
    const r3 = R.route({ id: 'j3', provider: 'chatgpt', hat: 'architect', agentId: 'client-site' });
    const r4 = R.route({ id: 'j4', provider: 'chatgpt', command: 'audit' });
    check('AR-02 the most specific rule wins: provider-wide < hat < hat+repo; an intent list matches any of its values',
      r1.accountId === 'acct-personal' && r2.accountId === 'acct-work' && r3.accountId === 'acct-client' && r4.accountId === 'acct-review', JSON.stringify([r1, r2, r3, r4]));
    const r5 = R.route({ id: 'j5', provider: 'chatgpt', hat: 'architect', accountId: 'acct-explicit' });
    check('AR-03 a job that names its account keeps it (and says which the rule would have chosen)', r5.accountId === 'acct-explicit' && /would have chosen acct-work/.test(r5.why), JSON.stringify(r5));
    check('AR-04 no rule and no account on the job → null: the tab runs as it is', R.route({ provider: 'claude', hat: 'architect' }) === null);
    const lg = R.log({ provider: 'chatgpt' });
    check('AR-05 every choice is logged with why (no cookie, no secret — only which account)', lg.length === 5 && lg.every(x => x.account && x.why && !('cookies' in x)), JSON.stringify(lg[0]));
    check('AR-06 a dry run (log:false) is not logged', (R.route({ provider: 'chatgpt' }, { log: false }), R.log({ provider: 'chatgpt' }).length === 5));
    const rr = R.rules({ provider: 'chatgpt' });
    R.removeRule(rr.find(x => x.account === 'acct-client').id);
    check('AR-07 a rule removed is gone', R.route({ provider: 'chatgpt', hat: 'architect', agentId: 'client-site' }).accountId === 'acct-work');

    // ── CV: cookie vault ───────────────────────────────────────────────────────
    const CookieVault = require(path.join(ROOT, 'clear-glass/src/cookies/vault.js'));
    const a1 = CookieVault.cookieSetArgs({ name: '__Host-session', value: 'v', domain: 'chatgpt.com', hostOnly: true, path: '/', secure: true, httpOnly: true, sameSite: 'lax', session: true });
    const a2 = CookieVault.cookieSetArgs({ name: 'SID', value: 'v', domain: '.google.com', path: '/', secure: true, sameSite: 'no_restriction', expirationDate: 2e9 });
    check('CV-01 a host-only / __Host- cookie is set without a domain, sameSite kept, a session cookie stays one; a domain cookie keeps its domain',
      a1.url === 'https://chatgpt.com/' && !('domain' in a1) && a1.sameSite === 'lax' && !('expirationDate' in a1) && a2.domain === '.google.com' && a2.expirationDate === 2e9 && a2.sameSite === 'no_restriction', JSON.stringify([a1, a2]));
    check('CV-02 siteOf groups subdomains under their site', CookieVault.siteOf('.accounts.google.com') === 'google.com' && CookieVault.siteOf('chatgpt.com') === 'chatgpt.com' && CookieVault.siteOf('a.b.co.uk') === 'b.co.uk');
    const vault = new CookieVault({ dir: path.join(tmp, 'vault') });
    await vault.init();
    const ses = fakeSession([
      { name: '__Host-next-auth.csrf-token', value: 'c1', domain: 'chatgpt.com', hostOnly: true, path: '/', secure: true, sameSite: 'lax' },
      { name: '__Secure-next-auth.session-token', value: 's1', domain: '.chatgpt.com', path: '/', secure: true, sameSite: 'lax' },
      { name: 'SID', value: 'g1', domain: '.google.com', path: '/', secure: true },
      { name: 'OSID', value: 'g2', domain: 'accounts.google.com', hostOnly: true, path: '/', secure: true },
    ]);
    const cap = await vault.capture({ agentId: 'chatgpt', accountId: 'acct-work', ses });
    check('CV-03 capture saves the session per site (encrypted rows), and lists the account without values', cap.count === 4 && cap.sites.sort().join() === 'chatgpt.com,google.com'
      && vault.accounts('chatgpt')[0].count === 4 && !JSON.stringify(vault.accounts('chatgpt')).includes('s1'), JSON.stringify(cap));
    const onDisk = fs.readdirSync(path.join(tmp, 'vault', 'jaa')).map(f => fs.readFileSync(path.join(tmp, 'vault', 'jaa', f), 'utf8')).join('');
    check('CV-04 nothing on disk is plaintext', !/s1|g1|next-auth\.session/.test(onDisk.replace(/"id":"[^"]*"/g, '')), onDisk.slice(0, 200));
    const ses2 = fakeSession([{ name: 'stale', value: 'x', domain: 'chatgpt.com', path: '/', secure: true }]);
    const rs = await vault.restore({ agentId: 'chatgpt', accountId: 'acct-work', ses: ses2, replace: true });
    check('CV-05 restore brings back every site (was: the newest row only), replace clears what was there, __Host- cookies set',
      rs.restored === 4 && rs.total === 4 && !ses2.jar.some(c => c.name === 'stale') && ses2.jar.some(c => c.name === '__Host-next-auth.csrf-token') && ses2.jar.some(c => c.name === 'SID'), JSON.stringify(rs));
    const ses3 = fakeSession([{ name: 'SID', value: 'old', domain: '.google.com', path: '/', secure: true }, { name: 'keep', value: 'k', domain: 'example.org', path: '/', secure: true }]);
    await vault.restore({ agentId: 'chatgpt', accountId: 'acct-work', ses: ses3 });
    check('CV-06 restore without replace swaps the restored sites\' cookies by name and keeps other sites', ses3.jar.filter(c => c.name === 'SID').length === 1 && ses3.jar.find(c => c.name === 'SID').value === 'g1' && ses3.jar.some(c => c.name === 'keep'));

    // ── AS: account switch ────────────────────────────────────────────────────
    const AS = require(path.join(ROOT, 'clear-glass/src/providers/account-switch.js'));
    const accounts = { 'acct-work': ['chatgpt'], 'acct-home': ['chatgpt'], 'acct-other': ['claude'] };
    const options = {
      resolveAccountForDispatch: (p, id) => (accounts[id] && accounts[id].includes(p) ? { accountId: id, source: 'explicit' } : { error: `unknown_account: ${id} for ${p}`, code: 'unknown_account' }),
      listAccounts: () => Object.entries(accounts).map(([id, keys]) => ({ id, label: id, agentKeys: keys })),
      recordSession: () => {},
    };
    const tabSes = fakeSession([{ name: 'home', value: 'h', domain: 'chatgpt.com', path: '/', secure: true }]);
    const loaded = [];
    const win = { isDestroyed: () => false, loadURL: async (u) => { loaded.push(u); setTimeout(() => win._fin && win._fin(), 5); }, webContents: { once: (ev, fn) => { win._fin = fn; } } };
    const sw = AS.createAccountSwitch({ providerHost: { windows: new Map([['chatgpt', win]]), agentTabs: new Map() }, vault, options,
      getProvider: () => ({ url: 'https://chatgpt.com' }), sessionFor: () => tabSes, reloadWaitMs: 500 });
    const u1 = await sw.use('chatgpt', 'acct-other');
    const u2 = await sw.use('chatgpt', 'acct-home');
    check('AS-01 an account not linked to the provider, or with no saved sign-in, is refused — the tab untouched',
      !u1.ok && /unknown_account/.test(u1.error) && !u2.ok && /no saved sign-in/.test(u2.error) && tabSes.jar.length === 1 && loaded.length === 0, JSON.stringify([u1, u2]));
    const u3 = await sw.use('chatgpt', 'acct-work');
    check('AS-02 a switch keeps the tab\'s sign-in (a vault snapshot: its account was not known), restores the routed account\'s cookies, reloads the tab',
      u3.ok && u3.switched && u3.restored === 4 && tabSes.jar.some(c => c.name === '__Secure-next-auth.session-token') && !tabSes.jar.some(c => c.name === 'home')
      && vault.listSnapshots('chatgpt').length === 1 && loaded.length === 1 && sw.current('chatgpt') === 'acct-work', JSON.stringify(u3));
    const u4 = await sw.use('chatgpt', 'acct-work');
    check('AS-03 the tab already that account: nothing changes', u4.ok && u4.switched === false && loaded.length === 1);
    const c1 = await sw.capture('chatgpt', 'acct-home');
    check('AS-04 capture saves the tab\'s sign-in for the account named and marks the tab as it', c1.ok && sw.current('chatgpt') === 'acct-home' && vault.accounts('chatgpt').some(a => a.accountId === 'acct-home'));
    const st = sw.state('chatgpt');
    check('AS-05 state: the tab\'s account, the saved sign-ins (no values), the accounts Clear Glass links to the provider', st.current === 'acct-home' && st.saved.length === 2 && st.known.map(k => k.id).sort().join() === 'acct-home,acct-work');

    // ── FM: the field map prelude ────────────────────────────────────────────
    const mk = (tag, r, extra = {}) => ({ tagName: tag.toUpperCase(), disabled: false, clicked: 0, getAttribute: (a) => extra[a] || null, getBoundingClientRect: () => ({ left: r[0], top: r[1], width: r[2], height: r[3] }),
      click() { this.clicked++; }, focus() {}, closest() { return this; }, isContentEditable: !!extra.ce, dispatchEvent() {}, ...extra });
    const sends = [mk('button', [10, 10, 30, 30]), mk('button', [900, 700, 40, 40]), mk('button', [500, 20, 30, 30])];
    const doc = { querySelectorAll: (sel) => (sel === 'button.send' ? sends : []), elementsFromPoint: () => [], execCommand: () => true };
    const sandbox = { innerWidth: 1000, innerHeight: 800, document: doc, Event: function () {}, HTMLTextAreaElement: function () {}, HTMLInputElement: function () {} };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.runInNewContext(src('guardian/userscript-field-map.js'), sandbox);
    const NF = sandbox.NexusFields;
    NF.set('claude', { selectors: { send: 'button.send' }, verified: { send: false }, anchors: {} });
    check('FM-01 an unverified (seed) value is never used — the script\'s own lookup decides', NF.find('send') === null && NF.press() === null);
    NF.set('claude', { selectors: { send: 'button.send' }, verified: { send: true }, anchors: { send: { x: 900, y: 700, w: 40, h: 40, rx: 0.92, ry: 0.8875, z: 0, tag: 'button' } } });
    check('FM-02 a selector matching several (the claude send matched 27) — the one at the pick\'s x/y wins', NF.find('send') === sends[1]);
    const pr = NF.press();
    check('FM-03 press() clicks it and says how', pr && pr.how === 'mapped-button' && sends[1].clicked === 1);
    sends[1].disabled = true;
    check('FM-04 a disabled mapped button is left to the script (it reports why)', NF.press() === null);
    const atPoint = mk('button', [400, 400, 20, 20]);
    doc.querySelectorAll = () => []; doc.elementsFromPoint = () => [atPoint];
    NF.set('claude', { selectors: { send: 'button.gone' }, verified: { send: true }, anchors: { send: { rx: 0.41, ry: 0.51, z: 0, tag: 'button' } } });
    check('FM-05 the selector matches nothing: the button at the anchor\'s point is used (x/y/z, never a non-button)', NF.find('send') === atPoint);
    doc.elementsFromPoint = () => [mk('div', [0, 0, 1, 1])];
    check('FM-06 …and nothing when what sits there is not that kind of element', NF.find('send') === null);
    const US = ['claude', 'chatgpt', 'gemini', 'deepseek', 'perplexity'].map(p => src(`guardian/userscript-${p}.js`));
    check('FM-07 every provider script hands the map to the field map and tries type() / press() first',
      US.every(s => /window\.NexusFields\.set\(PROVIDER, msg\)/.test(s) && /window\.NexusFields\.type\(text\)\) return true/.test(s) && /window\.NexusFields\.press\(\)/.test(s)));

    // ── SM: the anchor in the selector map ───────────────────────────────────
    process.env.GUARDIAN_AGENTS_DIR = path.join(tmp, 'agents');
    const reg = require(path.join(ROOT, 'guardian/lib/agent-registry.js')).createAgentRegistry({ dir: path.join(tmp, 'agents') });
    const SM = require(path.join(ROOT, 'guardian/lib/selector-map.js'));
    const ncp = { push: () => 1 };
    const anchor = { x: 900, y: 700, w: 40, h: 40, rx: 0.92, ry: 0.88, z: 0, zIndex: 10, depth: 14, tag: 'button' };
    const s1 = SM.assign(reg, ncp, 'claude', { send: 'button.send' }, { source: 'picker', evidence: { matched: 27, url: 'https://claude.ai/new', anchor, uniqueBy: 'anchor' } });
    check('SM-01 the pick\'s anchor travels with the map (GUARDIAN_SELECTORS carries anchors)', s1.ok && s1.map.anchors.send && s1.map.anchors.send.x === 900 && SM.message(reg, 'claude').anchors.send.z === 0, JSON.stringify(s1.map));
    const s2 = SM.assign(reg, ncp, 'claude', { send: 'button.send' }, { source: 'picker', evidence: { matched: 27, url: 'https://claude.ai/new', anchor: { ...anchor, x: 120 } } });
    check('SM-02 the same selector picked again at another place re-anchors it (was: "unchanged", the new place lost)', s2.ok && s2.changed && s2.map.anchors.send.x === 120);
    const s3 = SM.assign(reg, ncp, 'claude', { send: 'button.send' }, { source: 'picker', evidence: { matched: 27, url: 'https://claude.ai/new' } });
    check('SM-03 the same selector with no anchor is still unchanged', s3.ok && !s3.changed);

    // ── AT: the COS window + the real check ──────────────────────────────────
    const CA = require(path.join(ROOT, 'clear-glass/src/providers/attention.js'));
    const panel = CA.panelScript({ provider: 'chatgpt', providerName: 'ChatGPT', reason: 'signin', loginOptional: true, accounts: [{ id: 'acct-work', label: 'Work' }], account: 'acct-work' });
    new Function(`return ${panel}`);
    check('AT-01 the panel is the COMPARTMENT OS window: the title bar (glyph · title · — ▢ ✕, no "compartment" label — 0.60.11), the toolbar\'s pills and buttons, the same colours',
      !/compartment ·/i.test(panel) && /linear-gradient\(180deg,#141827,#0f121c\)/.test(panel) && /data-ui="min"/.test(panel) && /data-ui="max"/.test(panel) && /class="x" data-act="hide"/.test(panel)
      && /\.pill\.warn/.test(panel) && /background:#1b2030/.test(panel) && /Use without signing in/.test(panel) && /Save sign-in to vault/.test(panel));
    for (const k of ['input', 'send', 'resp']) new Function(`return ${CA.pickerScript(k)}`);
    check('AT-02 the picker records the node (xpath) and where it sits: x, y, w, h, rx, ry, z (its layer), zIndex, depth', /anchor: anchorOf\(cur\)/.test(CA.pickerScript('send')) && /rx: \+\(cx \/ innerWidth\)/.test(CA.pickerScript('send')) && /xpath: xpathOf\(cur\)/.test(CA.pickerScript('send')));
    // a fake window: panel → pick send → picker → Clear Glass's check (inject + check) → assign → panel → hide
    const runs = (answers) => {
      const calls = [];
      const w = { id: 9, shown: 0, hidden: 0, isDestroyed: () => false, show() { this.shown++; }, hide() { this.hidden++; }, focus() {}, setSkipTaskbar() {}, setTitle() {},
        webContents: { executeJavaScript: async (code) => { calls.push(code); return answers.shift(); }, getURL: () => 'https://claude.ai/new' } };
      return { w, calls };
    };
    const picked = { xpath: '/html[1]/body[1]/div[1]/button[3]', selector: 'button.send', matched: 27, url: 'https://claude.ai/new', tag: 'button', anchor };
    {
      const { w, calls } = runs([{ action: 'pick', key: 'send' }, picked, undefined, { ok: true, selector: 'button[data-testid="send-button"]', matched: 1 }, { action: 'hide' }]);
      const got = [];
      const H = CA.createAttentionHandler({ providerHost: { windows: new Map([['claude', w]]), agentTabs: new Map() }, assign: async (x) => { got.push(x); return { ok: true }; }, checkerSource: 'window.__cgSelectorCheck={}' });
      await H.attend('claude', { reason: 'map' });
      await new Promise(r => setTimeout(r, 50));
      check('AT-03 a pick is checked by Clear Glass\'s selector check on the page; its selector goes to Guardian with the anchor',
        calls.length === 5 && calls[2] === 'window.__cgSelectorCheck={}' && /__cgSelectorCheck\.check\(.*"key":"send"/.test(calls[3]) && got[0].selector === 'button[data-testid="send-button"]'
        && got[0].evidence.uniqueBy === 'selector-check' && got[0].evidence.anchor.x === 900 && got[0].evidence.xpath === picked.xpath, JSON.stringify(got));
    }
    {
      const { w } = runs([{ action: 'pick', key: 'send' }, picked, undefined, { ok: false, why: 'matches 27, not exactly one' }, { action: 'hide' }]);
      const got = [];
      const H = CA.createAttentionHandler({ providerHost: { windows: new Map([['claude', w]]), agentTabs: new Map() }, assign: async (x) => { got.push(x); return { ok: true }; }, checkerSource: 'x' });
      await H.attend('claude', { reason: 'map' });
      await new Promise(r => setTimeout(r, 50));
      check('AT-04 no unique selector: the picker\'s is kept, told apart by its anchor (uniqueBy anchor, the check\'s why kept)', got.length === 1 && got[0].selector === 'button.send' && got[0].evidence.uniqueBy === 'anchor' && /27/.test(got[0].evidence.checkWhy));
    }
    {
      const { w } = runs([{ action: 'pick', key: 'resp' }, { ...picked, matched: 3 }, undefined, { ok: false, why: 'the last match is not the pick' }, { action: 'hide' }]);
      const got = [];
      const H = CA.createAttentionHandler({ providerHost: { windows: new Map([['claude', w]]), agentTabs: new Map() }, assign: async (x) => { got.push(x); return { ok: true }; }, checkerSource: 'x' });
      await H.attend('claude', { reason: 'map' });
      await new Promise(r => setTimeout(r, 50));
      check('AT-05 a reply the check refuses is not saved (the userscript reads the LAST match — no position can fix that)', got.length === 0);
    }
    {
      let url = 'https://auth.openai.com/log-in';
      const w = { id: 11, shown: 0, isDestroyed: () => false, show() { this.shown++; }, hide() {}, focus() {}, setSkipTaskbar() {}, setTitle() {},
        loadURL: async (u) => { url = u; }, webContents: { executeJavaScript: async () => ({ action: 'hide' }), getURL: () => url } };
      const H = CA.createAttentionHandler({ providerHost: { windows: new Map([['chatgpt', w]]), agentTabs: new Map() }, assign: async () => ({ ok: true }), checkerSource: null, signedOutWaitMs: 5,
        getProvider: () => ({ id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', loginOptional: true }) });
      const r = await H.attend('chatgpt', { reason: 'signin' });
      check('AT-06 ChatGPT works signed out: a tab on its sign-in page goes back to the chat, nobody is asked', r.ok && r.resolved === 'signed-out' && url === 'https://chatgpt.com' && w.shown === 0, JSON.stringify(r));
    }
    {
      const capd = [];
      const w = { id: 12, shown: 0, isDestroyed: () => false, show() { this.shown++; }, hide() {}, focus() {}, setSkipTaskbar() {}, setTitle() {},
        webContents: { executeJavaScript: (() => { const a = [{ action: 'capture', account: 'acct-work' }, { action: 'hide' }]; const seen = []; return async (code) => { seen.push(code); w.seen = seen; return a.shift(); }; })(), getURL: () => 'https://claude.ai/new' } };
      const H = CA.createAttentionHandler({ providerHost: { windows: new Map([['claude', w]]), agentTabs: new Map() }, assign: async () => ({ ok: true }), checkerSource: null,
        accounts: () => ({ state: () => ({ current: null, known: [{ id: 'acct-work', label: 'Work' }] }), capture: async (p, a) => { capd.push([p, a]); return { ok: true, accountId: a, cookies: 7, sites: ['claude.ai'] }; } }) });
      await H.attend('claude', { reason: 'signin' });
      await new Promise(r => setTimeout(r, 50));
      check('AT-07 "Save sign-in to vault" stores the tab\'s sign-in for the account chosen, and the panel says so', capd.length === 1 && capd[0][1] === 'acct-work' && /saved to the vault as acct-work: 7 cookie/.test(w.seen[1]));
    }

    // ── WR: wiring ────────────────────────────────────────────────────────────
    const D = src('guardian/lib/dispatcher.js'), S = src('guardian/server.js'), HO = src('clear-glass/src/providers/host.js'), M = src('clear-glass/src/main/index.js');
    check('WR-01 the dispatcher routes the account and switches the tab before the job is typed; a failed switch fails the job',
      /accountRouting\.route\(job\)/.test(D) && /await useAccount\(job\.provider, routed\.accountId, job\)/.test(D) && /gate: 'account'/.test(D) && D.indexOf('accountRouting.route(job)') < D.indexOf("type: 'GUARDIAN_JOB', jobId: job.id"));
    check('WR-02 guardian wires it and serves the rules (an account Clear Glass does not know is refused)',
      /accountRouting: require\('\.\/lib\/account-routing\.js'\)\.routing\(\)/.test(S) && /\/api\/accounts\/rules/.test(S) && /unknown_account/.test(S));
    check('WR-03 the provider session leaves sign-in responses as the site sent them (Google\'s CookieMismatch) and does not say Electron',
      /if \(!_ownHost\(details\.url\)\) return callback\(\{\}\)/.test(HO) && /ses\.setUserAgent\(clean\)/.test(HO));
    check('WR-04 the field map is a shared prelude; Clear Glass serves the account switch', /'userscript-field-map\.js'\]/.test(HO) && /\/providers\/:id\/account\/capture/.test(M) && /createAccountSwitch/.test(M));
    check('WR-05 loginOptional is a provider fact (schema, hash, chatgpt\'s node)', /loginOptional/.test(src('lib/agent-facts-hash.js')) && /loginOptional/.test(src('lib/node-schemas/schema.provider')) && /loginOptional: true/.test(src('guardian/data/nodes/provider/chatgpt.provider')));
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
