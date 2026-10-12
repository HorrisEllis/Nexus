'use strict';
/**
 * clear-glass/src/providers/attention.js — an agent's tab needs the person: show it, with a Nexus panel on top.
 * comp_id: nexus.clear-glass.src.providers.attention
 * UUID: cg-provider-attention-v1-0000-2026-1012-jamesbrooks-001
 *
 * James (2026-10-12): "guardian should detect when a sign in is needed, also when it cant map to the chat, have a
 * compartment os style popup for the chat, to have me sign in or map the dom using the element picker. look at
 * clearglass with idearium account routing."
 *
 * Guardian decides (guardian/lib/provider-attention.js) and posts POST :7702/providers/:id/attention
 * { reason: signin | map | no-connect, note, url, jobId, agentId }. Here:
 *   1. the window — the repo's own agent tab when the job names an agentId (the tab its jobs are routed to, its own
 *      session for that repo), else the agent's main tab (started when it is not running) — is shown and focused;
 *   2. a panel in the COMPARTMENT OS style is laid over the page: a window you can drag by its title bar, saying why
 *      Nexus needs you, with: "I've signed in" · "pick the input" · "pick send" · "pick the reply" · "hide";
 *   3. a pick runs the element picker IN the page: hover outlines, a click chooses, Esc cancels. The selector is checked
 *      live (how many elements it matches, on which page) and goes to Guardian through selector-assign.js — the same
 *      evidence rule as the Clear Glass picker; Guardian's answer (recorded or refused) is shown on the panel;
 *   4. on a sign-in, a page that navigates away from the sign-in page closes the attention: the window hides again and
 *      the userscript (re-injected on load by host.js) connects, so the waiting job goes on.
 * The panel and the picker are plain page scripts run with executeJavaScript (the provider windows have no preload):
 * each returns a Promise that resolves with what the person did.
 */

const MODULE_ID = 'clear-glass.provider-attention';
const VERSION = '1.0.0';
const SIGNIN_RE = /\/(login|log-in|signin|sign-in|sign_in|auth|authenticate|oauth|sso|u\/login)(\/|$|\?|#)/i;

const TITLES = { signin: 'needs you to sign in', map: 'cannot find its chat', 'no-connect': 'is not connecting' };

/** panelScript(rec) — the panel, as a page script returning Promise<{ action, key? }> */
function panelScript(rec = {}) {
  const data = JSON.stringify({ provider: rec.providerName || rec.provider || 'the agent', reason: rec.reason || 'map', title: TITLES[rec.reason] || 'needs you',
    note: rec.note || '', forWhat: rec.forWhat || rec.agentId || '', last: rec.lastResult || '' });
  return `(() => new Promise((resolve) => {
  const D = ${data};
  const old = document.getElementById('nexus-attention'); if (old) old.remove();
  const box = document.createElement('div'); box.id = 'nexus-attention';
  box.setAttribute('style', 'position:fixed;z-index:2147483647;right:24px;top:24px;width:340px;font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#e6edf6;background:rgba(10,14,24,.94);border:1px solid rgba(56,189,248,.45);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);backdrop-filter:blur(10px);overflow:hidden');
  const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const btn = (act, key, label, primary) => '<button data-act="' + act + '"' + (key ? ' data-key="' + key + '"' : '') + ' style="all:unset;cursor:pointer;padding:6px 10px;border-radius:7px;border:1px solid ' + (primary ? 'rgba(56,189,248,.8);background:rgba(56,189,248,.18)' : 'rgba(255,255,255,.16)') + ';font:600 11px system-ui,sans-serif;color:#e6edf6">' + label + '</button>';
  box.innerHTML = '<div data-drag="1" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:linear-gradient(90deg,rgba(56,189,248,.22),rgba(167,139,250,.18));cursor:move;user-select:none">'
    + '<span style="width:8px;height:8px;border-radius:50%;background:' + (D.reason === 'signin' ? '#fbbf24' : '#38bdf8') + '"></span>'
    + '<b style="flex:1">NEXUS · ' + esc(D.provider) + ' ' + esc(D.title) + '</b>'
    + '<button data-act="hide" title="hide this window" style="all:unset;cursor:pointer;opacity:.7">✕</button></div>'
    + '<div style="padding:10px 12px">'
    + (D.note ? '<div style="margin-bottom:6px">' + esc(D.note) + '</div>' : '')
    + (D.forWhat ? '<div style="opacity:.65;font-size:11px;margin-bottom:6px">for ' + esc(D.forWhat) + '</div>' : '')
    + (D.reason === 'signin' ? '<div style="opacity:.8;margin-bottom:8px">Sign in on this page as you normally would. Nexus goes on by itself once the chat opens.</div>'
      : '<div style="opacity:.8;margin-bottom:8px">Show Nexus the chat: pick the box you type in, the send button, and a reply. Each pick is checked on this page, then saved in Guardian for this agent.</div>')
    + (D.last ? '<div style="margin:6px 0;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.06);font-size:11px">' + esc(D.last) + '</div>' : '')
    + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
    + (D.reason === 'signin' ? btn('signed-in', '', "I've signed in", true) : '')
    + btn('pick', 'input', 'pick the input', D.reason !== 'signin') + btn('pick', 'send', 'pick send', false) + btn('pick', 'resp', 'pick the reply', false)
    + btn('hide', '', 'hide', false) + '</div></div>';
  document.documentElement.appendChild(box);
  const head = box.querySelector('[data-drag]');
  head.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const r = box.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (m) => { box.style.left = Math.max(0, Math.min(innerWidth - 80, m.clientX - dx)) + 'px'; box.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - dy)) + 'px'; box.style.right = 'auto'; };
    const up = () => { removeEventListener('mousemove', mv, true); removeEventListener('mouseup', up, true); };
    addEventListener('mousemove', mv, true); addEventListener('mouseup', up, true);
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    box.remove();
    resolve({ action: b.dataset.act, key: b.dataset.key || null });
  }, true);
}))()`;
}

/** pickerScript(key) — the element picker, as a page script returning Promise<{ selector, matched, url, tag } | { cancelled }> */
function pickerScript(key) {
  const label = { input: 'the box you type in', send: 'the send button', resp: 'a reply from the agent' }[key] || key;
  return `(() => new Promise((resolve) => {
  const hint = document.createElement('div');
  hint.setAttribute('style', 'position:fixed;z-index:2147483647;left:50%;top:12px;transform:translateX(-50%);padding:6px 12px;border-radius:8px;background:rgba(10,14,24,.94);color:#e6edf6;border:1px solid rgba(56,189,248,.6);font:12px system-ui,sans-serif;pointer-events:none');
  hint.textContent = 'NEXUS — click ${label.replace(/'/g, "\\'")} · Esc cancels';
  const hl = document.createElement('div');
  hl.setAttribute('style', 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #38bdf8;background:rgba(56,189,248,.12);border-radius:4px;transition:all .05s');
  document.documentElement.append(hint, hl);
  let cur = null;
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'));
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch (_) { return false; } };
  const selectorOf = (el) => {
    if (el.id && !/\\d{4,}/.test(el.id) && unique('#' + cssEsc(el.id))) return '#' + cssEsc(el.id);
    for (const a of ['data-testid', 'data-test-id', 'aria-label', 'name', 'placeholder', 'data-message-author-role']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && v.length < 80) { const s = el.tagName.toLowerCase() + '[' + a + '="' + v.replace(/"/g, '\\\\"') + '"]'; if (unique(s) || '${key}' === 'resp') return s; }
    }
    const parts = []; let n = el;
    while (n && n.nodeType === 1 && parts.length < 5 && n !== document.body) {
      let p = n.tagName.toLowerCase();
      const cls = [...(n.classList || [])].filter(c => !/^(css-|sc-|_|\\d)|[0-9]{3,}|:/.test(c)).slice(0, 2);
      if (cls.length) p += '.' + cls.map(cssEsc).join('.');
      const sib = n.parentElement ? [...n.parentElement.children].filter(x => x.tagName === n.tagName) : [];
      if (sib.length > 1 && '${key}' !== 'resp') p += ':nth-of-type(' + (sib.indexOf(n) + 1) + ')';
      parts.unshift(p);
      const s = parts.join(' > ');
      if (unique(s)) return s;
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const move = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); if (!el || el === hl || el === hint) return; cur = el; const r = el.getBoundingClientRect(); Object.assign(hl.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); };
  const done = (out) => { removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', key, true); hint.remove(); hl.remove(); resolve(out); };
  const click = (e) => { e.preventDefault(); e.stopPropagation(); if (!cur) return; const selector = selectorOf(cur); let matched = 0; try { matched = document.querySelectorAll(selector).length; } catch (_) {} done({ selector, matched, url: location.href, tag: cur.tagName.toLowerCase() }); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done({ cancelled: true }); } };
  addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', key, true);
}))()`;
}

/**
 * createAttentionHandler({ providerHost, assign, log }) -> { attend(providerId, rec), state() }
 * attend returns at once ({ ok, window }); the panel loop runs on its own until the person is done.
 */
function createAttentionHandler({ providerHost, assign, getProvider = null, log = () => {} } = {}) {
  const _active = new Map();   // window id -> { providerId, rec }

  function _windowFor(providerId, agentId) {
    if (agentId && providerHost.agentTabs) {
      const e = providerHost.agentTabs.get(`${providerId}::${agentId}`);
      if (e && e.win && !e.win.isDestroyed()) return { win: e.win, which: `${providerId} tab for ${agentId}` };
    }
    const w = providerHost.windows && providerHost.windows.get(providerId);
    return w && !w.isDestroyed() ? { win: w, which: `${providerId} tab` } : null;
  }
  const _onSignin = (url) => SIGNIN_RE.test(String(url || '')) || /accounts\.google\.com|login\.microsoftonline\.com|auth\.openai\.com|appleid\.apple\.com/.test(String(url || ''));

  async function _loop(win, providerId, rec) {
    const id = win.id;
    try {
      for (let round = 0; round < 40 && !win.isDestroyed(); round++) {
        let act;
        try { act = await win.webContents.executeJavaScript(panelScript(rec), true); }
        catch (_) {   // the page navigated under the panel (a sign-in moving on): look where it is now
          await new Promise(r => setTimeout(r, 2500));
          if (win.isDestroyed()) break;
          if (rec.reason === 'signin' && !_onSignin(win.webContents.getURL())) { log(`[attention] ${providerId} — left the sign-in page (${win.webContents.getURL()}); hiding the tab, the userscript connects`); win.hide(); break; }
          continue;
        }
        if (!act || act.action === 'hide') { win.hide(); break; }
        if (act.action === 'signed-in') {
          try { const def = getProvider ? getProvider(providerId) : null; if (def && def.url && _onSignin(win.webContents.getURL())) await win.loadURL(def.url); } catch (_) {}
          log(`[attention] ${providerId} — the person says they signed in; the tab reloads its chat and hides`);
          setTimeout(() => { try { if (!win.isDestroyed()) win.hide(); } catch (_) {} }, 1500);
          break;
        }
        if (act.action === 'pick' && act.key) {
          let picked;
          try { picked = await win.webContents.executeJavaScript(pickerScript(act.key), true); } catch (e) { picked = { cancelled: true, error: e.message }; }
          if (!picked || picked.cancelled) { rec = { ...rec, lastResult: `${act.key}: not picked${picked && picked.error ? ` (${picked.error})` : ''}` }; continue; }
          const r = await assign({ provider: providerId, key: act.key, selector: picked.selector, evidence: { matched: picked.matched, url: picked.url, tag: picked.tag, checkedAt: Date.now(), via: 'attention-panel' } });
          rec = { ...rec, lastResult: r && r.ok ? `${act.key} saved in Guardian: ${picked.selector} (matches ${picked.matched})` : `${act.key} refused: ${(r && r.error) || 'Guardian did not answer'} — ${picked.selector}` };
          log(`[attention] ${providerId} — picked ${act.key}: ${picked.selector} (${picked.matched}) → ${r && r.ok ? 'saved' : `refused: ${r && r.error}`}`);
        }
      }
    } finally { _active.delete(id); }
  }

  async function attend(providerId, rec = {}) {
    let w = _windowFor(providerId, rec.agentId);
    if (!w) {
      try { await providerHost.start(providerId, { show: true }); } catch (e) { return { ok: false, error: `could not open ${providerId}: ${e.message}` }; }
      w = _windowFor(providerId, null);
      if (!w) return { ok: false, error: `${providerId} has no window to show` };
    }
    const { win, which } = w;
    try { win.setSkipTaskbar(false); } catch (_) {}
    try { win.setTitle(`NEXUS — ${providerId} ${TITLES[rec.reason] || 'needs you'}`); } catch (_) {}
    win.show(); win.focus();
    const def = getProvider ? (() => { try { return getProvider(providerId); } catch (_) { return null; } })() : null;
    const full = { ...rec, providerName: (def && def.name) || providerId };
    if (_active.has(win.id)) { _active.get(win.id).rec = full; return { ok: true, window: which, already: true }; }   // the panel up already: it shows the newest reason next round
    _active.set(win.id, { providerId, rec: full });
    _loop(win, providerId, full).catch(e => log(`[attention] ${providerId} panel failed: ${e.message}`));
    log(`[attention] ${providerId} — ${rec.reason}: ${rec.note || ''} (shown: ${which})`);
    return { ok: true, window: which };
  }
  function state() { return [..._active.values()].map(a => ({ providerId: a.providerId, reason: a.rec.reason, note: a.rec.note || null })); }
  return { attend, state, MODULE_ID };
}

module.exports = { MODULE_ID, VERSION, panelScript, pickerScript, createAttentionHandler, TITLES };
