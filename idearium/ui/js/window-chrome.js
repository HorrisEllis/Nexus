// idearium/ui/js/window-chrome.js — §0.39.280. The title bar of idearium's pop-out windows (desktop.html,
// settings.html), styled as a COS compartment: the window is frameless in Clear Glass (clear-glass/src/main/
// compartment-window.js), so this bar is what you drag, and its buttons are the window's (window.nexusWindow, from
// that window's preload). In a plain browser the bar still shows the compartment's name; the buttons are hidden.
// Usage: <script src="js/window-chrome.js" data-kind="desktop|settings" data-title="…"></script> as the first thing
// in <body>. It sets --chrome-h on :root so the page lays itself out below the bar.
(function () {
  const me = document.currentScript;
  const kind = (me && me.dataset.kind) || 'window';
  const W = window.nexusWindow || null;
  const H = 34;
  const css = `
    :root { --chrome-h:${H}px; }
    html { background:#0a0b10; }
    #nx-chrome { position:fixed; top:0; left:0; right:0; height:${H}px; z-index:2147483000; display:flex; align-items:center; gap:10px;
      padding:0 0 0 12px; background:linear-gradient(180deg,#141827,#0f121c); border-bottom:1px solid #242838;
      color:#e6e8f0; font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif; -webkit-app-region:drag; user-select:none; }
    #nx-chrome .glyph { width:18px; height:18px; border-radius:5px; display:grid; place-items:center; font-size:11px;
      background:color-mix(in srgb,#7c9cff 22%,transparent); color:#7c9cff; border:1px solid color-mix(in srgb,#7c9cff 45%,transparent); }
    #nx-chrome .kind { font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.08em; text-transform:uppercase; color:#5b6178; }
    #nx-chrome .ttl { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
    #nx-chrome .grow { flex:1; }
    #nx-chrome .ctl { display:flex; height:100%; -webkit-app-region:no-drag; }
    #nx-chrome .ctl button { width:44px; height:100%; border:0; background:none; color:#8a90a6; font:13px/1 system-ui; cursor:pointer; padding:0; border-radius:0; }
    #nx-chrome .ctl button:hover { background:#1c2133; color:#e6e8f0; }
    #nx-chrome .ctl button.x:hover { background:#e5484d; color:#fff; }
    #nx-chrome .ctl button.on { color:#7c9cff; }
    body.nx-framed-off { box-shadow: inset 0 0 0 1px #242838; }`;
  const st = document.createElement('style'); st.id = 'nx-chrome-style'; st.textContent = css;
  document.head.appendChild(st);
  const bar = document.createElement('div'); bar.id = 'nx-chrome';
  const glyph = kind === 'desktop' ? '▣' : kind === 'settings' ? '⚙' : '◇';
  bar.innerHTML = `<span class="glyph">${glyph}</span><span class="kind">compartment · ${kind}</span><span class="ttl"></span><span class="grow"></span>`;
  const setTitle = (t) => { bar.querySelector('.ttl').textContent = t || document.title || ''; };
  setTitle(me && me.dataset.title);
  if (W) {
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    ctl.innerHTML = `<button data-a="pin" title="Keep on top">⊤</button><button data-a="minimize" title="Minimize">—</button><button data-a="maximize" title="Maximize / restore">▢</button><button data-a="close" class="x" title="Close">✕</button>`;
    ctl.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const r = await W[b.dataset.a]().catch(() => null);
      if (r && b.dataset.a === 'pin') b.classList.toggle('on', !!r.pinned);
      if (r && b.dataset.a === 'maximize') b.textContent = r.maximized ? '❐' : '▢';
    });
    bar.appendChild(ctl);
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.ctl')) W.maximize(); });
    document.body.classList.add('nx-framed-off');
  }
  document.body.prepend(bar);
  // follow the page's own title (desktop.html names itself after the repo)
  new MutationObserver(() => setTitle()).observe(document.querySelector('title') || document.head, { childList: true, characterData: true, subtree: true });
  window.nexusChrome = { setTitle, height: H, framed: !!W };
})();
