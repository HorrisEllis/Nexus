'use strict';
/**
 * renderer/shell/shell.js — the shell's own small parts (BS2/BS6, 0.60.179). Spec: clear-glass/spec/browser-shell.spec.
 * comp_id: cg.renderer.shell
 *
 *   CGShellUI   one popover at a time under its button (aria-expanded kept), Esc / outside click closes; a toast
 *   home        ⌂ goes to the default start URL (Settings → General), else a new blank page
 *   identity    the address bar's left button: 🔒 https, ⚠ http, ❄ when this window is a Snowflake compartment
 *   shortcuts   Ctrl+Shift+A plugins · Ctrl+Shift+Y downloads · Ctrl+Shift+Space floating CLI · Ctrl+, Settings
 *   float CLI   ›_ asks main to show or hide this window's floating CLI (its own window, invisible to screen capture: src/main/float-cli.js);
 *               the CLI's /go /back /forward /reload arrive here as floatcli:nav and run on this window's webview; this window tells
 *               main its URL so the CLI's /status can say it.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const cg = () => window.ClearGlass;
  const params = new URLSearchParams(location.search);
  const routed = /^cg-snow-/.test(params.get('wvPartition') || '') || params.get('via') === 'transport';

  // ── popovers and toast ─────────────────────────────────────────────────────
  let cur = null, curBtn = null, toastEl = null, toastT = null;
  const UI = {
    current: () => (cur && cur.style.display !== 'none' ? cur : null),
    show(pop, anchor) {
      if (cur && cur !== pop) UI.close();
      document.querySelectorAll('.sh-pop').forEach(p => { if (p !== pop && p.style.display !== 'none') p.style.display = 'none'; });   // one popover at a time, the ☰ menu included
      if (anchor) { const r = anchor.getBoundingClientRect(); pop.style.top = `${Math.round(r.bottom + 6)}px`; pop.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`; }
      pop.style.display = 'block'; cur = pop; curBtn = anchor || null; if (curBtn) curBtn.setAttribute('aria-expanded', 'true');
    },
    close() { if (cur) cur.style.display = 'none'; if (curBtn) curBtn.setAttribute('aria-expanded', 'false'); cur = null; curBtn = null; },
    toast(msg) {
      if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'sh-toast'; toastEl.setAttribute('role', 'status');
        Object.assign(toastEl.style, { position: 'fixed', left: '50%', bottom: '22px', transform: 'translateX(-50%)', zIndex: 2000, padding: '9px 14px', borderRadius: '10px',
          background: 'var(--raised)', border: '1px solid var(--edge-hi)', color: 'var(--ink-hi)', font: '12.5px var(--sans)', boxShadow: 'var(--shadow)', maxWidth: '70vw' });
        document.body.append(toastEl); }
      toastEl.textContent = String(msg); toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 4200);
    },
  };
  window.CGShellUI = UI;
  document.addEventListener('click', (e) => { if (cur && !cur.contains(e.target) && (!curBtn || !curBtn.contains(e.target))) UI.close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) UI.close(); });

  // ── home and identity ──────────────────────────────────────────────────────
  $('btn-home') && $('btn-home').addEventListener('click', async () => {
    let url = ''; try { url = ((await cg().options.get()) || {}).defaultUrl || ''; } catch (_) {}
    const S = window.CGShell; if (url && S) S.navigate(S.normalizeUrl(url)); else if (S) S.newTab();
  });
  function paintIdentity(url) {
    const b = $('sh-identity'); if (!b) return;
    let u = null; try { u = new URL(url); } catch (_) {}
    const secure = u && (u.protocol === 'https:' || u.protocol === 'file:' || u.protocol === 'about:');
    b.classList.toggle('routed', routed); b.classList.toggle('insecure', !!u && !secure);
    const ic = routed ? 'snow' : secure || !u ? 'lock' : 'warn'; const holder = b.querySelector('.sh-lock');
    if (window.CGIcons) holder.innerHTML = window.CGIcons.svg(ic, { size: 15 }); else holder.textContent = routed ? '❄' : secure || !u ? '🔒' : '⚠';
    b.title = routed ? 'Snowflake window: this page goes through Tor over Snowflake, in a session that is wiped when the window closes'
      : !u ? 'Site information' : secure ? `Secure connection to ${u.hostname || u.protocol}` : `Not secure: ${u.hostname} is sent without encryption`;
  }
  $('sh-identity') && $('sh-identity').addEventListener('click', () => { const S = window.CGShell; routed ? cg().window.openSettings('network') : S && S.siteSettings(); });
  const wv = $('wv');
  if (wv) for (const ev of ['did-navigate', 'did-navigate-in-page']) wv.addEventListener(ev, (e) => { paintIdentity(e.url); try { cg().floatCli && cg().floatCli.url(e.url); } catch (_) {} });
  paintIdentity('');

  // ── shortcuts ──────────────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    const c = e.ctrlKey || e.metaKey;
    if (c && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); window.CGExtensions && window.CGExtensions.open(); }
    else if (c && e.shiftKey && (e.key === 'Y' || e.key === 'y')) { e.preventDefault(); window.CGDownloads && window.CGDownloads.open(); }
    else if (c && e.shiftKey && e.code === 'Space') { e.preventDefault(); $('btn-float-cli') && $('btn-float-cli').click(); }
    else if (c && e.key === ',') { e.preventDefault(); cg().window.openSettings(); }
  });

  // ── the floating CLI's button and its navigation ───────────────────────────
  const fbtn = $('btn-float-cli');
  if (fbtn) fbtn.addEventListener('click', async () => {
    try { const r = await cg().floatCli.toggle(); fbtn.classList.toggle('on', !!(r && r.open)); if (r && r.ok === false) UI.toast(`Floating CLI: ${r.error}`); }
    catch (e) { UI.toast(`Floating CLI: ${e.message}`); }
  });
  try {
    cg().floatCli && cg().floatCli.onNav(({ op, url }) => {
      const S = window.CGShell; if (!S) return;
      if (op === 'go' && url) S.navigate(S.normalizeUrl(url));
      else if (op === 'back' && S.wv.canGoBack()) S.wv.goBack();
      else if (op === 'forward' && S.wv.canGoForward()) S.wv.goForward();
      else if (op === 'reload') S.wv.reload();
    });
    cg().floatCli && cg().floatCli.onState(({ open }) => fbtn && fbtn.classList.toggle('on', !!open));
  } catch (_) { /* no floating CLI in this window (Settings, Library) */ }
})();
