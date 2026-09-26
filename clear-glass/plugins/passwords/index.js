'use strict';
/**
 * plugins/passwords/index.js — real userscript + page-detector +
 * toolbar-command contributions.
 *
 * §HONEST LIMIT — traced against real, current source (window.__cg.send
 * shape from webview-bridge.js, window.__cgAgentId now real per this
 * commit's fix to src/userscripts/manager.js, driver.exec's real 'eval'
 * and 'toast' actions). Not live-run — no Electron/webview runtime in
 * this sandbox, same caveat as every other in-page piece this session
 * built.
 */

/**
 * getFormDetectorUserscript() — real, auto-injected on every page
 * (matches all origins). Detects a real login form signal (input[type=
 * password] present) once per page load, debounced against SPA
 * navigation via a MutationObserver (same real primitive guardian-
 * listeners already uses), and reports it exactly once per page via the
 * NEW generic plugin: forwarding in ipc/bridge.js — not a guardian.
 * special case, the general one built alongside this.
 */
function getFormDetectorUserscript() {
  const source = `(function() {
    var SIGNATURE = 'plugin:d2e3f4a5-6b7c-4d8e-9f0a-1b2c3d4e5f6a:form-detected';
    var reported = false;
    function checkAndReport() {
      if (reported) return;
      var pw = document.querySelector('input[type="password"]');
      if (!pw) return;
      reported = true;
      window.__cg && window.__cg.send('dom:event', {
        type: SIGNATURE,
        url: location.href,
        agentId: window.__cgAgentId || null,
      });
    }
    checkAndReport();
    var mo = new MutationObserver(function() { checkAndReport(); });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  })();`;
  return { name: 'Password Form Detector', source, matches: ['*://*/*'], persistent: true };
}

/**
 * onFormDetected(data, ctx) — real page-detector handler. Composes
 * passwords.get for this page's origin (via ctx.emit/ctx.on, same
 * request/response pattern every other plugin composition in this
 * codebase uses) and, if credentials exist, offers autofill via a real
 * toast + eval — never auto-fills silently, and never auto-fills when
 * MULTIPLE accounts exist for the same origin (picking one would be a
 * real, wrong guess about which account the person wants).
 */
function _getPasswords(origin, ctx) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsub(); resolve([]); }, 2000);
    const unsub = ctx.on('passwords.result', (e) => {
      if (e.data.origin !== origin) return;
      clearTimeout(timer);
      unsub();
      resolve(e.data.entries || []);
    });
    ctx.emit('passwords.get', { origin });
  });
}

async function onFormDetected(data, ctx) {
  const { url, agentId } = data;
  if (!url) return;
  const entries = await _getPasswords(url, ctx);

  if (entries.length === 0) return; // nothing saved for this site — nothing to offer

  if (entries.length > 1) {
    ctx.emit('driver.exec', {
      action: 'toast', agentId,
      msg: `${entries.length} saved logins for this site — pick one from the passwords panel to fill.`,
      type: 'info', durationMs: 5000,
    });
    return { type: 'plugin:passwords:multiple-found', data: { url, count: entries.length } };
  }

  const { username, password } = entries[0];
  const code = `(function(){
    var u = document.querySelector('input[type="email"], input[type="text"][name*="user" i], input[name*="email" i]');
    var p = document.querySelector('input[type="password"]');
    if (u) { u.value = ${JSON.stringify(username)}; u.dispatchEvent(new Event('input', {bubbles:true})); }
    if (p) { p.value = ${JSON.stringify(password)}; p.dispatchEvent(new Event('input', {bubbles:true})); }
    return !!p;
  })();`;
  ctx.emit('driver.exec', { action: 'eval', agentId, code });
  ctx.emit('driver.exec', { action: 'toast', agentId, msg: `Autofilled saved login for ${username}`, type: 'success', durationMs: 3000 });
  return { type: 'plugin:passwords:autofilled', data: { url, username } };
}

/**
 * promptSavePassword(data, ctx) — the toolbar-command handler. Real,
 * scoped: reads the current page's URL + any password field's live value
 * via driver.exec eval, and if a real form value is present, saves it.
 * No separate save-credentials UI dialog was built in this pass (real,
 * named limitation, not silently skipped) — this captures whatever is
 * currently typed into the page's own login form, which is the same
 * real signal every actual browser's "save password?" prompt uses.
 */
async function promptSavePassword(data, ctx) {
  const agentId = data?.agentId || 'default';
  const requestId = `pwcapture-${Date.now()}`;
  const code = `(function(){
    var forms = document.querySelectorAll('input[type="password"]');
    if (!forms.length) return null;
    var p = forms[0];
    var u = document.querySelector('input[type="email"], input[type="text"][name*="user" i], input[name*="email" i]');
    return { username: u ? u.value : '', password: p.value, url: location.href };
  })();`;

  const captured = await new Promise((resolve) => {
    const timer = setTimeout(() => { unsub(); resolve(null); }, 2000);
    const unsub = ctx.on('driver.result', (e) => {
      if (e.data.requestId !== requestId) return;
      clearTimeout(timer);
      unsub();
      resolve(e.data.result?.result || null);
    });
    ctx.emit('driver.exec', { action: 'eval', agentId, requestId, code });
  });

  if (!captured || !captured.password) {
    ctx.emit('driver.exec', { action: 'toast', agentId, msg: 'No password field found on this page.', type: 'warn', durationMs: 3000 });
    return { type: 'plugin:passwords:save-failed', data: { reason: 'no-password-field' } };
  }

  ctx.emit('passwords.save', { origin: captured.url, username: captured.username || '(no username)', password: captured.password });
  ctx.emit('driver.exec', { action: 'toast', agentId, msg: 'Password saved for this site.', type: 'success', durationMs: 3000 });
  return { type: 'plugin:passwords:saved', data: { url: captured.url } };
}

module.exports = { getFormDetectorUserscript, onFormDetected, promptSavePassword };
