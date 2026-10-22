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
const VERSION = '1.4.0';   // 1.4.0 (0.60.204): a window with its own sign-in popup open is the person's · 1.3.0 (0.60.71): picks use the Guardian picker (traverse one element at a time) · 1.2.0 (0.60.50, SP2): a pick records its semantic address and its role must fit the field · 1.1.0 (0.60.2): the COS window, Clear Glass's selector check, x/y/z anchors, accounts
const ST = require('../page/semantic-tree.js');
const SIGNIN_RE = /\/(login|log-in|signin|sign-in|sign_in|auth|authenticate|oauth|sso|u\/login)(\/|$|\?|#)/i;

const TITLES = { signin: 'needs you to sign in', map: 'cannot find its chat', 'no-connect': 'is not connecting' };
const STATE = { signin: ['sign in', 'warn'], map: ['map the chat', 'warn'], 'no-connect': ['not connecting', 'bad'] };

/**
 * panelScript(rec) — the panel, as a page script returning Promise<{ action, key?, account? }>.
 * §0.60.2 — James: "when popups happen, can you have it be the same ui as the cos ui? like the screenshot but for agent
 * providers?" The COMPARTMENT OS window: idearium/ui/js/window-chrome.js's title bar (glyph · "COMPARTMENT · AGENT" ·
 * title · — ▢ ✕) over idearium/ui/desktop.html's toolbar (state pills, then the buttons), same colours and type.
 * — collapses the window to its title bar, ▢ widens it, ✕ hides the tab; neither of the first two ends the panel.
 */
function panelScript(rec = {}) {
  const st = STATE[rec.reason] || ['needs you', 'warn'];
  const data = JSON.stringify({ provider: rec.providerName || rec.provider || 'the agent', reason: rec.reason || 'map', title: TITLES[rec.reason] || 'needs you',
    state: st[0], stateCls: st[1], note: rec.note || '', forWhat: rec.forWhat || rec.agentId || '', last: rec.lastResult || '',
    loginOptional: !!rec.loginOptional, account: rec.account || null, accounts: Array.isArray(rec.accounts) ? rec.accounts.slice(0, 20) : [] });
  return `(() => new Promise((resolve) => {
  const D = ${data};
  const old = document.getElementById('nexus-attention'); if (old) old.remove();
  const ui = window.__nexusAttnUi = window.__nexusAttnUi || { min: false, max: false };
  const box = document.createElement('div'); box.id = 'nexus-attention';
  const W = () => (ui.max ? Math.min(900, innerWidth - 48) : 460) + 'px';
  box.setAttribute('style', 'position:fixed;z-index:2147483647;right:24px;top:24px;width:' + W() + ';font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#e5e7ef;background:#0b0d12;border:1px solid #232838;border-radius:8px;box-shadow:0 18px 50px rgba(0,0,0,.6);overflow:hidden');
  const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = '#nexus-attention *{box-sizing:border-box}'
    + '#nexus-attention .cx{height:34px;display:flex;align-items:center;gap:10px;padding:0 0 0 12px;background:linear-gradient(180deg,#141827,#0f121c);border-bottom:1px solid #242838;color:#e6e8f0;font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif;cursor:move;user-select:none}'
    + '#nexus-attention .glyph{width:18px;height:18px;border-radius:5px;display:grid;place-items:center;background:rgba(124,156,255,.22);color:#7c9cff;border:1px solid rgba(124,156,255,.45);font-size:11px}'
    + '#nexus-attention .kind{font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#5b6178;white-space:nowrap}'
    + '#nexus-attention .ttl{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '#nexus-attention .grow{flex:1}'
    + '#nexus-attention .ctl{display:flex;height:100%}'
    + '#nexus-attention .ctl button{all:unset;width:44px;height:100%;display:grid;place-items:center;color:#8a90a6;font:13px system-ui,sans-serif;cursor:pointer}'
    + '#nexus-attention .ctl button:hover{background:#1c2133;color:#e6e8f0}#nexus-attention .ctl button.x:hover{background:#e5484d;color:#fff}'
    + '#nexus-attention header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 12px;background:#12151d;border-bottom:1px solid #232838}'
    + '#nexus-attention h1{all:unset;font-size:14px;font-weight:600}'
    + '#nexus-attention .pill{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;padding:2px 8px;border-radius:999px;border:1px solid #232838;color:#8b91a5;white-space:nowrap}'
    + '#nexus-attention .pill.ok{color:#34d399;border-color:#34d399}#nexus-attention .pill.warn{color:#fbbf24;border-color:#fbbf24}#nexus-attention .pill.bad{color:#f87171;border-color:#f87171}'
    + '#nexus-attention .spacer{flex:1}'
    + '#nexus-attention .tb{all:unset;cursor:pointer;background:#1b2030;border:1px solid #232838;border-radius:6px;padding:5px 10px;color:#e5e7ef;font:12px system-ui,sans-serif;white-space:nowrap}'
    + '#nexus-attention .tb:hover{border-color:#38bdf8}#nexus-attention .tb.pri{border-color:#38bdf8;background:rgba(56,189,248,.14)}'
    + '#nexus-attention .bd{padding:10px 12px;display:grid;gap:8px}#nexus-attention .dim{color:#8b91a5}'
    + '#nexus-attention .last{padding:6px 8px;border-radius:6px;background:#12151d;border:1px solid #232838;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}'
    + '#nexus-attention select{all:unset;background:#1b2030;border:1px solid #232838;border-radius:6px;padding:5px 8px;color:#e5e7ef;font:12px system-ui,sans-serif;min-width:140px}'
    + '#nexus-attention .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}';
  const tb = (act, key, label, pri) => '<button class="tb' + (pri ? ' pri' : '') + '" data-act="' + act + '"' + (key ? ' data-key="' + key + '"' : '') + '>' + label + '</button>';
  const acctLabel = D.account ? (D.accounts.find(a => a.id === D.account) || { label: D.account }).label : null;
  const signin = D.reason === 'signin';
  box.innerHTML = '<style>' + css + '</style>'
    + '<div class="cx" data-drag="1"><span class="glyph">▣</span><span class="ttl">' + esc(D.provider) + ' — ' + esc(D.title) + '</span><span class="grow"></span>'
    + '<div class="ctl"><button data-ui="min" title="minimize">—</button><button data-ui="max" title="maximize">' + (ui.max ? '❐' : '▢') + '</button><button class="x" data-act="hide" title="hide the tab">✕</button></div></div>'
    + '<div data-body="1"' + (ui.min ? ' style="display:none"' : '') + '>'
    + '<header><h1>' + esc(D.provider) + '</h1><span class="pill ' + D.stateCls + '">' + esc(D.state) + '</span>'
    + '<span class="pill' + (acctLabel ? ' ok' : '') + '">' + (acctLabel ? 'as ' + esc(acctLabel) : 'account: not set') + '</span>'
    + (D.forWhat ? '<span class="pill">for ' + esc(D.forWhat) + '</span>' : '') + '<span class="spacer"></span>'
    + (signin ? tb('signed-in', '', "I've signed in", true) + (D.loginOptional ? tb('skip-signin', '', 'Use without signing in', false) : '')
      : tb('pick', 'input', 'Pick input', true) + tb('pick', 'send', 'Pick send', false) + tb('pick', 'resp', 'Pick reply', false))
    + tb('reload', '', 'Reload', false) + '</header>'
    + '<div class="bd">'
    + (D.note ? '<div>' + esc(D.note) + '</div>' : '')
    + (signin ? '<div class="dim">Sign in on this page as you normally would; Nexus goes on by itself once the chat opens.' + (D.loginOptional ? ' ' + esc(D.provider) + ' also works signed out.' : '') + '</div>'
      : '<div class="dim">Show Nexus the chat: pick the box you type in, the send button and a reply. Click near it, then walk with ↑ ↓ ← → (or PARENT / CHILD / PREV / NEXT in the picker) to the exact element and press Enter. Each pick is checked on this page by the Clear Glass selector check, saved in Guardian with where it sits (x, y, z), and used by the userscript on the next job.</div>')
    + (D.accounts.length ? '<div class="row"><span class="dim">this sign-in is</span><select data-acct="1">' + D.accounts.map(a => '<option value="' + esc(a.id) + '"' + (a.id === D.account ? ' selected' : '') + '>' + esc(a.label || a.id) + '</option>').join('') + '</select>' + tb('capture', '', 'Save sign-in to vault', false) + '</div>' : '')
    + (D.last ? '<div class="last">' + esc(D.last) + '</div>' : '')
    + '</div></div>';
  document.documentElement.appendChild(box);
  const head = box.querySelector('[data-drag]');
  head.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const r = box.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (m) => { box.style.left = Math.max(0, Math.min(innerWidth - 80, m.clientX - dx)) + 'px'; box.style.top = Math.max(0, Math.min(innerHeight - 34, m.clientY - dy)) + 'px'; box.style.right = 'auto'; };
    const up = () => { removeEventListener('mousemove', mv, true); removeEventListener('mouseup', up, true); };
    addEventListener('mousemove', mv, true); addEventListener('mouseup', up, true);
  });
  head.addEventListener('dblclick', (e) => { if (e.target.closest('button')) return; ui.max = !ui.max; box.style.width = W(); });
  box.addEventListener('click', (e) => {
    const u = e.target.closest('button[data-ui]');
    if (u) { e.preventDefault(); e.stopPropagation();
      if (u.dataset.ui === 'min') { ui.min = !ui.min; box.querySelector('[data-body]').style.display = ui.min ? 'none' : ''; }
      else { ui.max = !ui.max; box.style.width = W(); u.textContent = ui.max ? '❐' : '▢'; }
      return; }
    const b = e.target.closest('button[data-act]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const sel = box.querySelector('select[data-acct]');
    box.remove();
    resolve({ action: b.dataset.act, key: b.dataset.key || null, account: sel ? sel.value : null });
  }, true);
}))()`;
}

/**
 * _pickHelpers(key) — the in-page helpers both picks share (cssEsc, unique, xpathOf, selectorOf, target, anchorOf), as
 * source: the old picker (pickerScript) and the Guardian picker's field pick (describeScript) name an element the same way.
 */
function _pickHelpers(key) {
  return `  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'));
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch (_) { return false; } };
  const xpathOf = (el) => {
    if (el.id && !/\\d{4,}/.test(el.id)) { try { if (document.querySelectorAll('#' + cssEsc(el.id)).length === 1) return '//*[@id="' + el.id.replace(/"/g, '') + '"]'; } catch (_) {} }
    const parts = []; let n = el;
    while (n && n.nodeType === 1) {
      const same = n.parentElement ? [...n.parentElement.children].filter(x => x.localName === n.localName) : [n];
      parts.unshift(n.localName + '[' + (same.indexOf(n) + 1) + ']');
      n = n.parentElement;
    }
    return '/' + parts.join('/');
  };
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
      parts.unshift(p);
      const s = parts.join(' > ');
      if (unique(s)) return s;
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const target = (el) => '${key}' === 'send' ? (el.closest('button,[role="button"]') || el) : '${key}' === 'input' ? (el.closest('[contenteditable="true"],textarea,input') || el) : el;
  const anchorOf = (el, skip = []) => {
    const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let stack = []; try { stack = document.elementsFromPoint(cx, cy).filter(x => !skip.includes(x) && !(x.id && String(x.id).startsWith('__g-'))); } catch (_) {}
    let z = stack.indexOf(el); if (z < 0) z = stack.findIndex(x => el.contains(x));
    let zIndex = 0, depth = 0;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { depth++; if (!zIndex) { const zi = getComputedStyle(n).zIndex; if (zi && zi !== 'auto') zIndex = parseInt(zi, 10) || 0; } }
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      rx: +(cx / innerWidth).toFixed(4), ry: +(cy / innerHeight).toFixed(4), z, layer: z, zIndex, depth: depth - 1,
      vw: innerWidth, vh: innerHeight, dpr: window.devicePixelRatio || 1, scrollY: Math.round(scrollY), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || null };
  };
`;
}

/**
 * pickerScript(key) — the element picker, as a page script returning
 *   Promise<{ xpath, selector, matched, url, tag, anchor } | { cancelled }>.
 * §0.60.2 — James: "have it use the actual element picker or guardian picker … mapped to the scripts injected for the
 * interaction field or the x y z coords for the elements." The pick gives the node (its xpath — what Clear Glass's
 * selector check, renderer/selector-check.js, takes) and where it sits: anchor { x, y, w, h, rx, ry (its centre as a
 * fraction of the viewport), z (its layer in the stack of elements at that point), zIndex, depth, tag, role }. The
 * selector here is only the fallback when the check finds no unique one; the anchor then tells the matches apart
 * (guardian/userscript-field-map.js).
 */
function pickerScript(key) {
  const label = { input: 'the box you type in', send: 'the send button', resp: 'a reply from the agent' }[key] || key;
  return `(() => new Promise((resolve) => {
  const hint = document.createElement('div');
  hint.setAttribute('style', 'position:fixed;z-index:2147483647;left:50%;top:12px;transform:translateX(-50%);padding:6px 12px;border-radius:8px;background:#0b0d12;color:#e5e7ef;border:1px solid #38bdf8;font:12px system-ui,sans-serif;pointer-events:none');
  hint.textContent = 'Pick — click ${label.replace(/'/g, "\\'")} · Esc cancels';
  const hl = document.createElement('div');
  hl.setAttribute('style', 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #38bdf8;background:rgba(56,189,248,.12);border-radius:4px;transition:all .05s');
  const tag = document.createElement('div');
  tag.setAttribute('style', 'position:fixed;z-index:2147483647;pointer-events:none;padding:1px 6px;border-radius:4px;background:#38bdf8;color:#0b0d12;font:600 10px ui-monospace,monospace');
  document.documentElement.append(hint, hl, tag);
  let cur = null;
${_pickHelpers(key)}
  const move = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); if (!el || el === hl || el === hint || el === tag) return; cur = target(el); const r = cur.getBoundingClientRect();
    Object.assign(hl.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    tag.textContent = cur.tagName.toLowerCase() + ' · x ' + Math.round(r.left) + ' y ' + Math.round(r.top); Object.assign(tag.style, { left: r.left + 'px', top: Math.max(0, r.top - 16) + 'px' }); };
  const done = (out) => { removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', keyd, true); hint.remove(); hl.remove(); tag.remove(); resolve(out); };
  const click = (e) => { e.preventDefault(); e.stopPropagation(); if (!cur) return; const selector = selectorOf(cur); let matched = 0; try { matched = document.querySelectorAll(selector).length; } catch (_) {}
    done({ xpath: xpathOf(cur), selector, matched, url: location.href, tag: cur.tagName.toLowerCase(), anchor: anchorOf(cur, [hl, hint, tag]) }); };
  const keyd = (e) => { if (e.key === 'Escape') { e.preventDefault(); done({ cancelled: true }); } };
  addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', keyd, true);
}))()`;
}

const FIELD_LABELS = { input: 'the box you type in', send: 'the send button', resp: 'a reply from the agent' };
/**
 * guardianPickScript(key, pickerSource) — §0.60.71 James (2026-10-16): "when its asking me to pick the inputs or response,
 * or what ever. its needs to use the guardian picker so i can traverse through the elements one at a time." The Guardian
 * picker (renderer/guardian-picker.js) in its field mode: click near the element, walk the page one element at a time
 * (↑ parent, ↓ child, ← → siblings, nearby chips; the arrow keys), USE or Enter. → Promise<{ xpath, tag, url } | { cancelled }>.
 */
function guardianPickScript(key, pickerSource) {
  return `(() => { window.__gPickerNoAutostart = true;\n${pickerSource}\n;return window.__gPickerActive && window.__gPickerActive.pickField
    ? window.__gPickerActive.pickField(${JSON.stringify(key)}, ${JSON.stringify(FIELD_LABELS[key] || key)})
    : { cancelled: true, error: 'the Guardian picker did not start' }; })()`;
}
/** describeScript(xpath, key) — the element at an xpath, named the way a pick is: { xpath, selector, matched, url, tag, anchor } | null */
function describeScript(xpath, key) {
  return `(() => {
  ${_pickHelpers(key)}
  let el = null; try { el = document.evaluate(${JSON.stringify(String(xpath))}, document, null, 9, null).singleNodeValue; } catch (_) {}
  if (!el || el.nodeType !== 1) return null;
  const selector = selectorOf(el); let matched = 0; try { matched = document.querySelectorAll(selector).length; } catch (_) {}
  return { xpath: xpathOf(el), selector, matched, url: location.href, tag: el.tagName.toLowerCase(), anchor: anchorOf(el), type: el.getAttribute('type') || null };
})()`;
}
function _guardianPicker() {
  try { return require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'renderer', 'guardian-picker.js'), 'utf8'); } catch (_) { return null; }
}

/**
 * checkPick(win, picked, key, checkerSource) — §0.60.2 the pick checked by Clear Glass's own selector check
 * (renderer/selector-check.js, the one the Clear Glass picker's assign flow runs): a stable selector, checked the way
 * the userscript will read it. -> { selector, matched, by, why? }. When the check finds no unique selector for an input
 * or send button, the picker's selector is kept with its anchor (by: 'anchor') if it matches at all — the userscript's
 * field map picks the match at the anchor's x/y/z; a reply has no such fallback (the userscript reads the LAST match).
 */
async function checkPick(win, picked, key, checkerSource) {
  // §0.60.46 — James's run: "picked send: p.placeholder (1, by anchor)" — twice, before the real send button. The text
  // inside the input box was saved as the send button. A send pick must be something you press.
  // §SP2 0.60.50 — the pick's role in the page's semantic tree (src/page/semantic-tree.js addressScript) must fit its
  // field: a send is a button, an input a text box. Checked first: the role is what the page says the element IS.
  const sem = picked.semantic;
  if (sem && sem.exact && !ST.roleFits(key, sem.role)) {
    return { selector: null, matched: 0, by: 'none', why: `that is ${sem.address} — a ${sem.role}, not ${key === 'send' ? 'a button' : 'a text box'}; pick the ${key === 'send' ? 'send button' : 'box you type in'} itself` };
  }
  if (key === 'send') {
    const tag = String(picked.tag || '').toLowerCase(), role = String((picked.anchor && picked.anchor.role) || '').toLowerCase();
    if (!(tag === 'button' || role === 'button' || (tag === 'input' && /submit|button/i.test(String(picked.type || 'submit'))))) {
      return { selector: null, matched: 0, by: 'none', why: `that is a <${tag || '?'}>, not a button — click the send button itself` };
    }
  }
  if (!checkerSource || !picked.xpath) return { selector: picked.selector, matched: picked.matched, by: 'picker' };
  let r = null;
  try {
    await win.webContents.executeJavaScript(checkerSource, true);
    r = await win.webContents.executeJavaScript(`window.__cgSelectorCheck.check(${JSON.stringify({ xpath: picked.xpath, key })})`, true);
  } catch (e) { r = { ok: false, why: `the check could not run on the page: ${e.message}` }; }
  if (r && r.ok) return { selector: r.selector, matched: r.matched, by: 'selector-check', single: !!r.single };
  if (key !== 'resp' && picked.matched >= 1 && picked.anchor) return { selector: picked.selector, matched: picked.matched, by: 'anchor', why: (r && r.why) || 'no stable unique selector' };
  return { selector: null, matched: 0, by: 'none', why: (r && r.why) || 'no selector passed the check' };
}

/**
 * createAttentionHandler({ providerHost, assign, getProvider, accounts, checkerSource, log }) -> { attend(providerId, rec), state() }
 * attend returns at once ({ ok, window }); the panel loop runs on its own until the person is done.
 * accounts() -> the account switch (src/providers/account-switch.js) or null: the panel says which account the tab is,
 * and "Save sign-in to vault" stores the tab's cookies for the account chosen (JAA cookie vault, encrypted).
 */
function _defaultChecker() {
  try { return require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'renderer', 'selector-check.js'), 'utf8'); } catch (_) { return null; }
}

// every live window (electron's), for the popup check; a test passes its own
function _allWindows() { try { return require('electron').BrowserWindow.getAllWindows(); } catch (_) { return []; } }

function createAttentionHandler({ providerHost, assign, getProvider = null, accounts = () => null, checkerSource, pickerSource, signedOutWaitMs = 2500, log = () => {}, allWindows = _allWindows } = {}) {
  const guardianPicker = () => (pickerSource === undefined ? _guardianPicker() : pickerSource);
  const _active = new Map();   // window id -> { providerId, rec }
  const checker = checkerSource === undefined ? _defaultChecker() : checkerSource;

  function _windowFor(providerId, agentId) {
    if (agentId && providerHost.agentTabs) {
      const e = providerHost.agentTabs.get(`${providerId}::${agentId}`);
      if (e && e.win && !e.win.isDestroyed()) return { win: e.win, which: `${providerId} tab for ${agentId}` };
    }
    const w = providerHost.windows && providerHost.windows.get(providerId);
    return w && !w.isDestroyed() ? { win: w, which: `${providerId} tab` } : null;
  }
  const _lastBack = new Map();   // providerId -> ts of the last send-back-to-chat reload
  // §0.60.45 — James: "i click login and it closes the login. like i cant click anywhere without closing any popup".
  // Every attention request called show() + focus() on the tab, and a provider that flaps (connects, drops, connects)
  // asks again each time — focus was pulled off whatever the person was clicking (a sign-in popup, a dropdown), which
  // closed it. The person's own input on a window is stamped here; while they are using it (PERSON_MS), Nexus neither
  // re-focuses it nor sends it back to its chat.
  const PERSON_MS = 120000;
  const _input = new WeakMap();   // win -> ts of the person's last input there
  const _watch = (win) => {
    if (!win || win.__nexusInputWatch) return;
    try { const wc = win.webContents; if (wc && typeof wc.on === 'function') { wc.on('input-event', () => _input.set(win, Date.now())); win.__nexusInputWatch = true; } } catch (_) {}
  };
  // §0.60.52 — James: "i cant click the login on the popup for chatgpt. just chat gpt." ChatGPT is the one provider whose chat works
  // signed out (loginOptional), so a window on a sign-in page is sent back to the chat — unless the person is using it. But input was
  // only stamped from the first attention request on: a window he opened and clicked "Log in" in BEFORE that had no stamp, so the
  // sign-in page he had just reached was bounced back to the chat 2.5 s later. A window that is visible and has focus is his:
  // that needs no stamp (the hidden NCP tab is neither).
  // 0.60.204 — James, 2026-10-22: "also fix chatgpt. i can't login. i click login and it pops up for a second and dissapears".
  // "Continue with Google / Microsoft / Apple" opens a popup that takes focus, so the ChatGPT window behind it is visible but not
  // focused, which AF-02b read as the NCP tab: it was sent back to the chat, and the popup, its opener gone, closed. A window with
  // a sign-in popup of its own open is the person's too, and so is a window he can see that is on a sign-in page.
  const _openedPopup = (win) => {
    try {
      const mine = win.webContents && win.webContents.mainFrame;
      if (!mine) return false;
      return (allWindows() || []).some(o => {
        if (!o || o === win || (o.isDestroyed && o.isDestroyed())) return false;
        const op = o.webContents && o.webContents.opener;
        return !!(op && (op === mine || (op.processId === mine.processId && op.routingId === mine.routingId)));
      });
    } catch (_) { return false; }
  };
  const _personUsing = (win) => {
    const t = _input.get(win);
    if (t && Date.now() - t < PERSON_MS) return true;
    if (_openedPopup(win)) return true;
    try { return !!(win && typeof win.isVisible === 'function' && win.isVisible() && typeof win.isFocused === 'function' && win.isFocused()); } catch (_) { return false; }
  };
  const _onSignin = (url) => SIGNIN_RE.test(String(url || '')) || /accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|auth\.openai\.com|auth0\.openai\.com|appleid\.apple\.com|challenges\.cloudflare\.com/.test(String(url || ''));
  const _def = (id) => { try { return getProvider ? getProvider(id) : null; } catch (_) { return null; } };
  function _accountInfo(providerId) {
    const sw = accounts && accounts();
    if (!sw) return {};
    try { const st = sw.state(providerId); return { account: st.current || null, accounts: st.known || [] }; } catch (_) { return {}; }
  }

  async function _loop(win, providerId, rec) {
    const id = win.id;
    try {
      for (let round = 0; round < 40 && !win.isDestroyed(); round++) {
        rec = { ...rec, ..._accountInfo(providerId) };
        let act;
        try { act = await win.webContents.executeJavaScript(panelScript(rec), true); }
        catch (_) {   // the page navigated under the panel (a sign-in moving on): look where it is now
          await new Promise(r => setTimeout(r, 2500));
          if (win.isDestroyed()) break;
          // 0.60.204 — not while a sign-in popup it opened is still up: the page between steps is not the end of the sign-in
          if (rec.reason === 'signin' && !_onSignin(win.webContents.getURL()) && !_openedPopup(win)) { log(`[attention] ${providerId} — left the sign-in page (${win.webContents.getURL()}); hiding the tab, the userscript connects`); win.hide(); break; }
          continue;
        }
        if (!act || act.action === 'hide') { win.hide(); break; }
        const def = _def(providerId);
        if (act.action === 'reload') { try { await (def && def.url && _onSignin(win.webContents.getURL()) ? win.loadURL(def.url) : win.webContents.reload()); } catch (_) {} await new Promise(r => setTimeout(r, 1500)); continue; }
        if (act.action === 'signed-in' || act.action === 'skip-signin') {
          try { if (def && def.url && _onSignin(win.webContents.getURL())) await win.loadURL(def.url); } catch (_) {}
          log(`[attention] ${providerId} — ${act.action === 'skip-signin' ? 'used signed out' : 'the person says they signed in'}; the tab reloads its chat and hides`);
          setTimeout(() => { try { if (!win.isDestroyed()) win.hide(); } catch (_) {} }, 1500);
          break;
        }
        if (act.action === 'capture') {
          const sw = accounts && accounts();
          let r;
          try { r = sw ? await sw.capture(providerId, act.account) : { ok: false, error: 'the account vault is not running' }; } catch (e) { r = { ok: false, error: e.message }; }
          rec = { ...rec, lastResult: r.ok ? `sign-in saved to the vault as ${r.accountId}: ${r.cookies} cookie(s) on ${r.sites.length} site(s)${r.logins ? `, and the login you typed (password vault, same account)` : ''}` : `not saved: ${r.error}` };   // PW3 (0.60.186)
          continue;
        }
        if (act.action === 'pick' && act.key) {
          // §0.60.71 — the Guardian picker (traverse one element at a time); the old one-click picker only when it cannot run
          let picked = null;
          const gp = guardianPicker();
          if (gp) {
            try {
              const g = await win.webContents.executeJavaScript(guardianPickScript(act.key, gp), true);
              if (g && g.xpath) picked = await win.webContents.executeJavaScript(describeScript(g.xpath, act.key), true) || { cancelled: true, error: 'the element was gone when it was checked' };
              else if (g && g.cancelled && !g.error) picked = { cancelled: true };
              else log(`[attention] ${providerId} — the Guardian picker could not run (${(g && g.error) || 'no answer'}); the one-click picker is used`);
            } catch (e) { log(`[attention] ${providerId} — the Guardian picker could not run (${e.message}); the one-click picker is used`); }
          } else log(`[attention] ${providerId} — renderer/guardian-picker.js not found; the one-click picker is used`);
          if (!picked) {
            try { picked = await win.webContents.executeJavaScript(pickerScript(act.key), true); } catch (e) { picked = { cancelled: true, error: e.message }; }
          }
          if (!picked || picked.cancelled) { rec = { ...rec, lastResult: `${act.key}: not picked${picked && picked.error ? ` (${picked.error})` : ''}` }; continue; }
          // §SP2 — the semantic address beside the selector: what the field map falls back to when a class change breaks it
          if (picked.xpath) { try { picked.semantic = await win.webContents.executeJavaScript(ST.addressScript(picked.xpath), true); } catch (e) { log(`[attention] ${providerId} — ${act.key}: no semantic address (${e.message}); the selector alone is kept`); } }
          const c = await checkPick(win, picked, act.key, checker);
          if (!c.selector) { rec = { ...rec, lastResult: `${act.key}: ${c.why} — pick it again` }; log(`[attention] ${providerId} — ${act.key} pick refused by the check: ${c.why}`); continue; }
          const evidence = { matched: c.matched, url: picked.url, tag: picked.tag, xpath: picked.xpath || null, anchor: picked.anchor || null, semantic: picked.semantic || null,
            uniqueBy: c.by, checkWhy: c.why || null, checkedAt: Date.now(), via: 'attention-panel' };
          const r = await assign({ provider: providerId, key: act.key, selector: c.selector, evidence });
          const at = picked.anchor ? ` at x ${picked.anchor.x} y ${picked.anchor.y} z ${picked.anchor.z}` : '';
          rec = { ...rec, lastResult: r && r.ok ? `${act.key} saved in Guardian: ${c.selector} (matches ${c.matched}${c.by === 'anchor' ? `, told apart by position${at}` : ''}${at && c.by !== 'anchor' ? `;${at}` : ''})` : `${act.key} refused: ${(r && r.error) || 'Guardian did not answer'} — ${c.selector}` };
          log(`[attention] ${providerId} — picked ${act.key}: ${c.selector} (${c.matched}, by ${c.by})${at}${picked.semantic ? ` · ${picked.semantic.address}` : ''} → ${r && r.ok ? 'saved' : `refused: ${r && r.error}`}`);
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
    _watch(win);
    const def = _def(providerId);
    const full0 = { ...rec, providerName: (def && def.name) || providerId, loginOptional: !!(def && def.loginOptional) };
    // the panel is already up on this tab: it shows the newest reason next round — never shown or focused again
    if (_active.has(win.id)) { _active.get(win.id).rec = full0; return { ok: true, window: which, already: true }; }
    // §0.60.2 — James: "chatgpt doesn't need a login currently." A provider whose chat works signed out
    // (registry loginOptional) is first sent back to its chat; the person is asked only if it lands on a sign-in page again.
    if (rec.reason === 'signin' && def && def.loginOptional && def.url && !rec.askAnyway && !_personUsing(win)) {
      // §0.60.7 — FLAP FIX. A signed-out ChatGPT chat is a normal page: the userscript reports "signed-out" on every load,
      // and reloading it here dropped the NCP connection, which reloaded the page, which reported again — a reload every ~3 s.
      // If the tab is already off any sign-in page there is nothing to go back to: leave it alone. And never reload the same
      // provider tab more than once per minute.
      const nowUrl = (() => { try { return win.webContents.getURL(); } catch (_) { return ''; } })();
      if (nowUrl && !_onSignin(nowUrl)) {
        return { ok: true, window: which, resolved: 'signed-out', reloaded: false };
      }
      const last = _lastBack.get(providerId) || 0;
      if (Date.now() - last < 60000) return { ok: true, window: which, resolved: 'signed-out', reloaded: false, throttled: true };
      _lastBack.set(providerId, Date.now());
      try { await win.loadURL(def.url); } catch (_) {}
      await new Promise(r => setTimeout(r, signedOutWaitMs));
      if (!win.isDestroyed() && !_onSignin(win.webContents.getURL())) {
        log(`[attention] ${providerId} — on a sign-in page, but ${def.name || providerId} works signed out: back to ${def.url}, no sign-in asked`);
        return { ok: true, window: which, resolved: 'signed-out' };
      }
    }
    try { win.setSkipTaskbar(false); } catch (_) {}
    try { win.setTitle(`${(def && def.name) || providerId} ${TITLES[rec.reason] || 'needs you'}`); } catch (_) {}
    // shown, but focus is taken only when the person is not already working in it (a sign-in popup keeps its focus)
    const using = _personUsing(win);
    try { if (!win.isVisible || !win.isVisible()) win.show(); else if (!using) win.show(); } catch (_) { win.show(); }
    if (!using) win.focus();
    const full = full0;
    _active.set(win.id, { providerId, rec: full });
    _loop(win, providerId, full).catch(e => log(`[attention] ${providerId} panel failed: ${e.message}`));
    log(`[attention] ${providerId} — ${rec.reason}: ${rec.note || ''} (shown: ${which})`);
    return { ok: true, window: which };
  }
  function state() { return [..._active.values()].map(a => ({ providerId: a.providerId, reason: a.rec.reason, note: a.rec.note || null })); }
  return { attend, state, MODULE_ID };
}

module.exports = { MODULE_ID, VERSION, panelScript, pickerScript, guardianPickScript, describeScript, checkPick, createAttentionHandler, TITLES };
