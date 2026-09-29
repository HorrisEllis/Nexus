'use strict';
/**
 * tests/probe/login-wall-chromium.js — 0.39.280 BS16. The REAL guardian/userscript-chat-stream.js in real pages shaped
 * like the two cases: ChatGPT's dismissible "Stay logged out" nag over a working page (closed automatically, reported
 * 'modal'), and a login page with no composer (reported 'wall', nothing clicked). Plus guardian/lib/provider-login.js.
 */
const path = require('path');
const { start } = require('./_glass-probe.js');
const P = start();
const prelude = P.read('guardian/userscript-chat-stream.js');
const NAG = `<!doctype html><html><body><main><div id="thread"></div><textarea id="prompt-textarea"></textarea><button>Log in</button></main>
<div role="dialog" style="position:fixed;inset:20px;background:#fff"><h2>Thanks for trying ChatGPT</h2><p>Log in or sign up to get smarter responses.</p>
<button id="login">Log in</button><a href="#" id="stay" onclick="window.__stayed=1;this.closest('[role=dialog]').remove();return false">Stay logged out</a></div></body></html>`;
const WALL = `<!doctype html><html><body><main><h1>Welcome back</h1><button>Continue with Google</button><input type="email" autocomplete="username"><button>Continue with email</button></main></body></html>`;
const OK = `<!doctype html><html><body><main><div contenteditable="true" class="ProseMirror"></div></main></body></html>`;
(async () => {
  const b = await P.glass.chromium.launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const at = async (html) => { await pg.route('https://provider.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html })); await pg.goto('https://provider.test/'); await pg.unroute('https://provider.test/**');
    await pg.evaluate(prelude); await pg.evaluate(() => { window.__reports = []; }); };
  await at(NAG);
  const nag = await pg.evaluate(async () => { const st = NexusChatStream.watchLogin({ provider: 'chatgpt', report: async (b) => { window.__reports.push(b); } }); await new Promise(r => setTimeout(r, 50)); return { st: st.state, stayed: window.__stayed === 1, dialog: !!document.querySelector('[role=dialog]'), rep: window.__reports }; });
  P.case('ChatGPT\'s "Stay logged out" nag is closed automatically and reported as a dismissed modal', nag.st === 'modal' && nag.stayed && !nag.dialog && nag.rep[0].state === 'modal' && nag.rep[0].dismissed === true, nag);
  const after = await pg.evaluate(() => NexusChatStream.loginState().state);
  P.case('after it, the page reads signed-out (it works without an account), not a wall', after === 'signed-out', { after });
  await at(WALL);
  const wall = await pg.evaluate(async () => { const st = NexusChatStream.watchLogin({ provider: 'claude', report: async (b) => { window.__reports.push(b); } }); return { st: st.state, text: st.text, rep: window.__reports }; });
  P.case('a login page with no composer is a wall: reported, nothing typed or clicked', wall.st === 'wall' && /Continue with Google/.test(wall.text) && wall.rep[0].state === 'wall' && wall.rep[0].dismissed === false, wall);
  await at(OK);
  P.case('a signed-in page with its composer is ok', (await pg.evaluate(() => NexusChatStream.loginState().state)) === 'ok');
  const PL = require(path.join(P.ROOT, 'guardian/lib/provider-login.js'));
  PL.set({ provider: 'claude', state: 'wall', text: 'Continue with Google' });
  P.case('guardian: a job for a provider behind a wall says why', /claude needs you to sign in/.test(PL.blockedReason('claude')) && PL.blockedReason('chatgpt') === null);
  P.case('the shared prelude starts watching by itself (start → watchLogin)', /opts\.login !== false\) \{ try \{ watchLogin/.test(prelude));
  P.case('no page errors', errs.length === 0, { errs });
  await b.close(); P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
