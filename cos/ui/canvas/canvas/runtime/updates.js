/* ERAVOS runtime — updates.js (3.99, rebuilt 3.111) → window.Updates. Domain-free.
 * Asked: "an update service to check GitHub for updates with a toast asking to update it" · then "It needs to run in the background?
 * … It closes the canvas and then doesn't apply the update". One card (top right) follows the update through, and nothing closes
 * until you say so:
 *   available    ERAVOS X is out          Update · What's new · Later (not asked again for X)
 *   downloading  a bar, while you keep working          unpacking   getting it ready
 *   ready        ERAVOS X is ready        Restart now · When I close ERAVOS
 *   failed       what went wrong          Open the log      (applied: a toast "Updated to X")
 * The app (desktop/updater.js) does the work; in a browser, Update opens the release page. ⚙ Settings → About & updates → Check for updates.
 *   Updates.show(info) · on(message) · check() · close() · REPO */
(function (global) {
  'use strict';
  const doc = global.document; if (!doc) return;
  const REPO = 'HorrisEllis/Eravos-Canvas', D = () => global.eravosDesktop, SKIP = 'eravos.update.skip';
  let card = null, info = {};
  const say = (m, k, ms) => { if (global.Shell && global.Shell.toast) global.Shell.toast(m, k || '', ms || 4000); };
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const mb = (n) => (n / 1048576).toFixed(n > 104857600 ? 0 : 1) + ' MB';
  function close() { if (card) { card.remove(); card = null; } }
  function btn(text, cls, fn) { const b = el('button', 'tb-btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.onclick = fn; return b; }
  // the one card, drawn for a state
  function draw(state, u) {
    info = Object.assign({}, info, u || {});
    if (!card) { card = el('div', 'toast upd-toast'); card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-label', 'ERAVOS update'); doc.body.appendChild(card); }
    card.innerHTML = ''; card.dataset.state = state;
    const head = el('div', 'upd-head'), row = el('div', 'upd-row'); card.append(head);
    const v = info.version || '';
    if (state === 'available') {
      head.append(el('b', '', 'ERAVOS ' + v + ' is out'), el('span', 'upd-cur', info.current ? 'you have ' + info.current : ''));
      if (info.notes) card.append(el('div', 'upd-notes', String(info.notes).split('\n').map(s => s.replace(/^[#*\-\s]+/, '')).filter(Boolean).slice(0, 4).join(' · ')));
      row.append(btn('Update', 'pri', () => {
        if (D() && D().downloadUpdate) { draw('downloading', {}); D().downloadUpdate(); }
        else if (D() && D().installUpdate) D().installUpdate();
        else if (info.page) global.open(info.page, '_blank');
      }), btn('What’s new', '', () => { if (info.page) global.open(info.page, '_blank'); }),
      btn('Later', '', () => { try { global.localStorage.setItem(SKIP, v); } catch (e) {} close(); }));
      card.append(el('div', 'upd-sub', D() && D().downloadUpdate ? 'It downloads in the background — keep working.' : ''));
    } else if (state === 'downloading' || state === 'unpacking') {
      const pct = info.total ? Math.round(100 * info.got / info.total) : 0;
      head.append(el('b', '', state === 'unpacking' ? 'Getting ERAVOS ' + v + ' ready…' : 'Downloading ERAVOS ' + v + '…'),
        el('span', 'upd-cur', state === 'downloading' && info.total ? mb(info.got) + ' of ' + mb(info.total) : ''));
      const bar = el('div', 'upd-bar'), fill = el('i'); fill.style.width = (state === 'unpacking' ? 100 : pct) + '%'; bar.appendChild(fill); card.append(bar, el('div', 'upd-sub', 'Keep working — ERAVOS stays open.'));
      row.append(btn('Hide', '', close));
    } else if (state === 'ready') {
      head.append(el('b', '', 'ERAVOS ' + v + ' is ready'));
      card.append(el('div', 'upd-sub', 'Restart now, or it goes in by itself when you next close ERAVOS. Your projects, exports and settings stay.'));
      row.append(btn('Restart now', 'pri', () => { draw('starting', {}); D() && D().applyUpdate && D().applyUpdate(); }),
        btn('When I close ERAVOS', '', () => { D() && D().updateLater && D().updateLater(); close(); say('ERAVOS ' + v + ' goes in when you close ERAVOS.', 'good'); }));
    } else if (state === 'starting') {   // 3.123 waiting for ERAVOS Update to say it runs (and for Windows' permission prompt)
      // 3.141 "it never closes, or does anything else to update": the wait shows its seconds, and never traps you — Cancel, or open the
      // installer yourself (Windows' own prompt, the way a double-click opens it)
      const secs = el('span', 'upd-cur', '0 s'); head.append(el('b', '', 'Starting ERAVOS Update…'), secs);
      card.append(el('div', 'upd-sub', info.admin ? 'Windows asks for permission to update ERAVOS — say Yes in its prompt (it may be behind this window). ERAVOS closes once the update has started.' : 'ERAVOS closes once the update has started.'));
      const t0 = Date.now(), tick = setInterval(() => { if (!card || card.dataset.state !== 'starting') return clearInterval(tick); const n = Math.round((Date.now() - t0) / 1000); secs.textContent = n + ' s';
        if (n >= 8 && !card.querySelector('.upd-row')) { const r2 = el('div', 'upd-row');
          if (info.manual && D() && D().installUpdateManually) r2.append(btn('Run the installer myself', 'pri', () => { draw('restarting', {}); D().installUpdateManually(); }));
          r2.append(btn('Cancel', '', () => { D() && D().cancelUpdate && D().cancelUpdate(); }));
          card.append(r2); } }, 1000);
    } else if (state === 'restarting') {
      head.append(el('b', '', info.manual ? 'Opening the ERAVOS ' + v + ' installer…' : 'Restarting into ERAVOS ' + v + '…'));
      card.append(el('div', 'upd-sub', info.manual ? 'Say Yes in Windows\' prompt; ERAVOS closes and the installer puts ' + v + ' in place (Run ERAVOS at its end).' : 'ERAVOS Update puts it in place and starts ERAVOS again.'));
    } else if (state === 'failed') {
      head.append(el('b', '', 'The update to ' + v + ' did not go in')); card.append(el('div', 'upd-notes', info.message || ''));
      row.append(btn('Open the log', '', () => { D() && D().openUpdateLog && D().openUpdateLog(); }), btn('Try again', 'pri', () => { draw('downloading', {}); D() && D().downloadUpdate && D().downloadUpdate(); }), btn('Close', '', close));
    }
    if (row.children.length) card.append(row);
    return card;
  }
  function show(u) { if (!u || !u.version) return null; return draw('available', u); }
  function on(m) {
    if (!m) return;
    if (m.state === 'available') { let skip = null; try { skip = global.localStorage.getItem(SKIP); } catch (e) {} if (skip !== m.version || m.manual) draw('available', m); }
    else if (m.state === 'downloading' || m.state === 'unpacking') { if (card) draw(m.state, m); }
    else if (m.state === 'ready' || m.state === 'starting' || m.state === 'restarting' || m.state === 'failed') draw(m.state, m);
    else if (m.state === 'applied') { close(); say('Updated to ERAVOS ' + m.version + '.', 'good', 6000); }
    else if (m.state === 'on-close') say('ERAVOS ' + m.version + ' goes in when you close ERAVOS.', 'good');
    else if (m.state === 'current') say('ERAVOS ' + m.version + ' is the newest.', 'good');
    else if (m.state === 'error') { if (card && card.dataset.state !== 'available') close(); say('Update: ' + m.message, 'bad', 7000); }
  }
  // a browser: ask GitHub directly
  async function webCheck(manual) {
    try {
      const r = await global.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } }); if (!r.ok) throw new Error(r.status === 404 ? 'no release is published yet' : 'GitHub said ' + r.status);
      const rel = await r.json(), v = String(rel.tag_name || '').replace(/^v/i, ''); let seen = null; try { seen = global.localStorage.getItem('eravos.update.seen'); } catch (e) {}
      if (!seen) { try { global.localStorage.setItem('eravos.update.seen', v); } catch (e) {} if (manual) on({ state: 'current', version: v }); return; }
      if (seen !== v) on({ state: 'available', version: v, current: seen, notes: rel.body, page: rel.html_url, manual });
      else if (manual) on({ state: 'current', version: v });
    } catch (e) { if (manual) on({ state: 'error', message: e.message }); }
  }
  async function check() {
    if (D() && D().checkUpdate) { const u = await D().checkUpdate(); return u; }
    return webCheck(true);
  }
  // 3.110 About & updates: a section of ⚙ Settings (Check for updates was an entry in the ⋯ Options dropdown)
  function entry() {
    if (!global.AppSettings || !global.UIKit) return false; if (entry.done) return true; entry.done = true;
    global.AppSettings.addSection({ id: 'about', label: 'About & updates', order: 90, make: () => {
      const UI = global.UIKit, h = UI.h, ver = h('b', { text: '…' }), st = h('span', { class: 'as-say', text: '' });
      const vOf = async () => { try { if (D() && D().info) { const i = await D().info(); if (i && i.version) return i.version; } } catch (e) {} let seen = null; try { seen = global.localStorage.getItem('eravos.update.seen'); } catch (e) {} return seen || 'in the browser'; };
      vOf().then(v => { ver.textContent = v; });
      const go = UI.Button({ label: 'Check for updates', kind: 'primary', hint: 'ask GitHub for a newer ERAVOS', onClick: async () => { st.textContent = 'asking GitHub…'; try { const r = await check(); st.textContent = r === null ? '' : ''; } catch (e) { st.textContent = e.message; } } });
      // 3.148 which updates: Stable (releases) or Beta (every merge to main, built and tested the same way) — the app only
      let chan = null;
      if (D() && D().updateChannel) {
        const say = h('span', { class: 'as-say', text: '' }), tellC = (c) => { say.textContent = c === 'beta' ? 'every merge to main, as soon as it is built and tested (a few minutes) — newest first, may have rough edges' : 'releases only'; };
        const seg = UI.Segmented({ label: '', options: ['stable', 'beta'], value: 'stable', hint: 'Stable: releases. Beta: every merge to main.', onChange: async (c) => { tellC(c); try { await D().updateChannel(c); st.textContent = 'asking GitHub…'; await check(); st.textContent = ''; } catch (e) { st.textContent = e.message; } } });
        D().updateChannel().then(c => { if (seg.set) seg.set(c); tellC(c); }).catch(() => {});
        chan = h('div', { class: 'as-row' }, [h('span', { class: 'as-k', text: 'Updates' }), seg.el, say]);
      }
      return h('div', { class: 'as-card' }, [
        h('div', { class: 'as-row' }, [h('span', { class: 'as-k', text: 'ERAVOS' }), ver]),
        chan,
        h('div', { class: 'as-row' }, [go.el, st]),
        h('p', { class: 'as-say', text: 'When a newer release is out, ERAVOS asks you once; it downloads in the background, then Restart now or When I close ERAVOS. Your work in Documents\\ERAVOS is never touched by an update.' }),
        h('div', { class: 'as-row' }, [h('a', { class: 'as-link', href: 'https://github.com/' + REPO + '/releases', target: '_blank', rel: 'noopener', text: 'All releases →' })]),
      ]);
    } });
    return true;
  }
  function boot() {
    if (!entry()) { setTimeout(boot, 300); return; }
    if (D() && D().onUpdate) D().onUpdate(on);
    else if (/^https?:$/.test(global.location.protocol) && !global.ERAVOS_NO_UPDATE_CHECK) setTimeout(() => webCheck(false), 20000);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
  global.Updates = { show, on, check, close, REPO };
})(typeof window !== 'undefined' ? window : globalThis);
