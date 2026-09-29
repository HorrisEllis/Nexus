(function() {
  'use strict';

  const _rawCg = window.ClearGlass;
  const toastQueue = []; // toast() not defined yet — queued, flushed once it exists below

  // §fix 2026-06-29, take 2 — the Proxy-wrapping approach below broke
  // everything: contextBridge.exposeInMainWorld freezes/locks property
  // descriptors on window.ClearGlass for security (non-configurable,
  // non-writable). A Proxy is NOT allowed to return a different value for
  // a non-configurable property than the target itself has — JS throws
  // "proxy did not return its actual value" the instant anything reads
  // cg.options. That's exactly the Security-tab error from the screenshot.
  // Fix: build a plain NEW object instead of proxying the original. This
  // never touches ClearGlass's own (locked) property descriptors at all —
  // it just copies function references into a fresh object we own, then
  // proxies THAT (normal, unfrozen, no invariant violation possible).
  function _wrapNamespace(nsName, nsObj) {
    const wrapped = {};
    if (nsObj) {
      for (const method of Object.keys(nsObj)) {
        const real = nsObj[method];
        if (typeof real !== 'function') continue;
        wrapped[method] = (...args) => Promise.resolve().then(() => real.apply(nsObj, args)).catch(err => {
          const msg = `cg.${nsName}.${method} failed: ${err?.message || err}`;
          console.error('[ClearGlass]', msg, err);
          toastQueue.push([msg, 'error', 6000]);
          throw err;
        });
      }
    }
    // Proxy the wrapped object too — so a method that exists on neither
    // the real namespace NOR our wrapped copy (e.g. cg.bookmarks.list when
    // bookmarks exists but list doesn't) also rejects cleanly instead of
    // being undefined and throwing "X is not a function" at the call site.
    return new Proxy(wrapped, {
      get(target, method) {
        if (method in target) return target[method];
        return (...args) => {
          const msg = `cg.${nsName}.${method} not available`;
          console.error('[ClearGlass]', msg);
          toastQueue.push([msg, 'error']);
          return Promise.reject(new Error(msg));
        };
      },
    });
  }

  const _ownedCg = {};
  if (_rawCg) {
    for (const ns of Object.keys(_rawCg)) {
      _ownedCg[ns] = _wrapNamespace(ns, _rawCg[ns]);
    }
  }

  // Any namespace a call site references that ClearGlass never exposed at
  // all (not even an empty one) needs a graceful fallback too. This Proxy
  // wraps `_ownedCg` — a plain object WE created above, with normal
  // configurable/writable properties — never the original frozen
  // ClearGlass object. That's the actual fix: proxy something we own.
  const cg = new Proxy(_ownedCg, {
    get(target, ns) {
      if (ns in target) return target[ns];
      return new Proxy({}, {
        get: () => (...args) => {
          const msg = `cg.${ns} not available — namespace missing from window.ClearGlass entirely`;
          console.error('[ClearGlass]', msg);
          toastQueue.push([msg, 'error']);
          return Promise.reject(new Error(msg));
        },
      });
    },
  });

  const params = new URLSearchParams(window.location.search);
  const agentId = params.get('agentId') || 'default';
  const ssePort = params.get('ssePort') || 7701;
  const initialUrl = params.get('url') || '';
  const wvPreload = params.get('wvPreload') || '';

  // ── State ──────────────────────────────────────────────────────────
  let pickerActive = false;
  let picks = [];
  let domPanelVisible = false;
  let copilotVisible  = true;
  let ctxDom     = true;
  let ctxPicks   = false;
  let ctxCookies = false;
  let es; // EventSource — assigned in connectSSE(), referenced throughout

  // ── Elements ───────────────────────────────────────────────────────
  const wv             = document.getElementById('wv');
  const pickerRoute    = document.getElementById('picker-route');
  const pickerApiUrl   = document.getElementById('picker-api-url');
  const domStreamBtn   = document.getElementById('dom-stream-btn');
  let   domStreaming   = false;

  pickerRoute?.addEventListener('change', () => {
    pickerApiUrl.style.display = pickerRoute.value === 'api' ? '' : 'none';
  });

  // §BUILD 2026-07-09 — must be set before the webview's first navigation.
  // Without this the guest page has no route back to the host at all
  // (see src/preload/webview-bridge.js for why the old require('electron')
  // trick inside injected page scripts didn't work).
  if (wvPreload) wv.setAttribute('preload', wvPreload);
  // §0.39.265 — automation pages run in their own session (persist:automation)
  const wvPartition = params.get('wvPartition') || '';
  if (wvPartition && /^persist:[\w-]{1,60}$/.test(wvPartition)) wv.setAttribute('partition', wvPartition);

  // §NEW 2026-07-04: main process navigates this window in place when the
  // orchestrator's wire /open call targets the already-open default window
  // (see clear-glass/src/main/index.js's /open handler) — avoids opening a
  // second window just to show the same NEXUS UI the default window will
  // load anyway once this fires.
  if (window.ClearGlass?.on) {
    window.ClearGlass.on('cg:navigate', (targetUrl) => {
      if (targetUrl && typeof wv.loadURL === 'function') navigate(targetUrl);
    });
  }
  const urlBar         = document.getElementById('url-bar');
  const agentBadge     = document.getElementById('agent-badge');
  const loadBar        = document.getElementById('load-bar');
  const pickerBtn      = document.getElementById('picker-btn');
  const copilotToggle  = document.getElementById('copilot-toggle');
  const copilotPane    = document.getElementById('copilot-pane');
  const copilotMsgs    = document.getElementById('copilot-messages');
  const copilotInput   = document.getElementById('copilot-textarea');
  const copilotMicBtn  = document.getElementById('copilot-mic-btn');
  const copilotSend    = document.getElementById('copilot-send');
  const domPanel       = document.getElementById('dom-panel');
  const domTree        = document.getElementById('dom-tree');
  const domSearch      = document.getElementById('dom-search');
  const picksPanel     = document.getElementById('picks-panel');
  const picksList      = document.getElementById('picks-list');
  const statusUrl      = document.getElementById('status-url');
  const statusHealth   = document.getElementById('status-health');
  const statusCookies  = document.getElementById('status-cookies');
  const statusAgent    = document.getElementById('status-agent');

  // Update agent display
  agentBadge.textContent = agentId;
  statusAgent.textContent = `Agent: ${agentId}`;

  // ── Toast system ──────────────────────────────────────────────────────────
  // Injects a lightweight toast container. Call toast(msg, type) from anywhere.
  // type: 'info' | 'error' | 'success' | 'warn'
  const _toastContainer = (() => {
    const el = document.createElement('div');
    el.id = 'cg-toast-container';
    el.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(el);
    return el;
  })();

  function toast(msg, type = 'info', durationMs = 3500) {
    const colors = { info:'#00f5ff', error:'#ff4466', success:'#00ff9d', warn:'#ffb454' };
    const el = document.createElement('div');
    el.style.cssText = `background:#0e0e18;border:1px solid ${colors[type]||colors.info};color:${colors[type]||colors.info};padding:8px 14px;border-radius:8px;font-size:11px;font-family:ui-monospace,monospace;max-width:320px;word-break:break-all;opacity:0;transition:opacity .15s;pointer-events:auto;cursor:pointer;`;
    el.textContent = msg;
    el.onclick = () => el.remove();
    _toastContainer.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, durationMs);
    return el;
  }

  // §EXTERNAL-TRIGGER 2026-08-23 — James: "create toasts" as a real
  // co-pilot capability. toast() itself was already real and working,
  // but purely internal — no external caller (main process, driver, an
  // automation workflow) had any way to reach it; this script's own
  // error handlers were the only real callers. Exposed narrowly, not as
  // a generic eval backdoor: one specific, named global, matching the
  // same pattern clear-glass/src/driver/index.js's real _getWebContents()
  // + executeJavaScript already uses to reach this exact window (matched
  // by its own real title, "Clear Glass — ${agentId}", set at window
  // creation — confirmed by reading src/main/index.js directly before
  // wiring this, not assumed).
  window.__cgToast = toast;

  // Flush any cg.* errors that happened before toast() existed (the Proxy
  // wrapper is set up earlier in this script than toast() is defined).
  while (toastQueue.length) toast(...toastQueue.shift());

  // §fix 2026-06-30 — "the whole point of the diagnostic UI was to find
  // the errors, where are they." Real answer: nothing was ever wired to
  // catch them. window.onerror and unhandledrejection now both report to
  // the new errors:report IPC route (clear-glass/src/diagnostic/
  // error-capture.js), which logs to disk, keeps a 200-entry buffer, and
  // broadcasts over SSE — AND shows a visible error toast immediately,
  // so a renderer-side crash is never silent again.
  window.addEventListener('error', (e) => {
    const payload = { type: 'window.onerror', message: e.message, stack: e.error?.stack, url: location.href, agentId };
    _cgCall('errors', 'report', payload).catch(() => {});
    toast(`Error: ${e.message}`, 'error', 8000);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    const payload = { type: 'unhandledrejection', message: reason.message, stack: reason.stack, url: location.href, agentId };
    _cgCall('errors', 'report', payload).catch(() => {});
    toast(`Unhandled rejection: ${reason.message}`, 'error', 8000);
  });

  // _cgCall stays available for any new code — same interface, now backed
  // by the Proxy above so both styles produce the same visible-error behavior.
  const _debug = new URLSearchParams(location.search).get('debug') === '1';
  function _cgCall(namespace, method, ...args) {
    if (_debug) console.log(`[cg.${namespace}.${method}]`, args);
    return cg[namespace][method](...args);
  }

  if (!_rawCg) {
    console.error('[ClearGlass] window.ClearGlass is undefined — preload bridge did not attach. This page must be loaded inside the Clear Glass Electron shell, not a plain browser tab.');
    toast('ClearGlass bridge missing — preload did not attach. Every button will show an error toast until this is fixed.', 'error', 10000);
  }



  // Apply Nexus options that affect initial render (autoOpenCopilotPane)
  _cgCall('options','get').then(opts => {
    if (opts && opts.autoOpenCopilotPane === false) {
      copilotVisible = false;
      copilotPane.classList.add('hidden');
      copilotToggle.classList.remove('active');
    }
  }).catch(() => {});

  // ── Webview events ─────────────────────────────────────────────────
  wv.addEventListener('did-start-loading', () => {
    loadBar.style.width = '40%';
    loadBar.classList.add('loading');
  });

  wv.addEventListener('did-stop-loading', () => {
    loadBar.style.width = '100%';
    setTimeout(() => { loadBar.classList.remove('loading'); loadBar.style.width = '0'; }, 300);
    updateUrl();
    updateCookieCount();
  });

  wv.addEventListener('did-navigate', updateUrl);
  wv.addEventListener('did-navigate-in-page', updateUrl);
  // page-title-updated handled by tab system below — removed duplicate here

  // §fix 2026-09-26 — "[renderer] unhandledrejection Error invoking remote
  // method 'GUEST_VIEW_MANAGER_CALL': ERR_CONNECTION_REFUSED (-102) loading
  // 'http://127.0.0.1:900/'". <webview>.loadURL() returns a Promise that
  // rejects on any failed navigation; every call site here dropped it, so
  // each failure hit the global unhandledrejection handler (error toast +
  // errors:report) on top of did-fail-load. ERR_ABORTED (-3) is a
  // navigation superseded by a newer one (the :9000 start page cut off by
  // a typed URL) — not an error at all. All navigation now goes through
  // navigate(): the rejection is consumed here, and did-fail-load (below)
  // is the single place a real failure is surfaced, as an in-view page.
  function navigate(url) {
    let p;
    try { p = wv.loadURL(url); } catch (err) { _navFailed(url, -1, String(err?.message || err)); return Promise.resolve(false); }
    return Promise.resolve(p).then(() => true, (err) => {
      const m = /\((-\d+)\)/.exec(String(err?.message || ''));
      const code = m ? Number(m[1]) : -1;
      if (code !== -3 && code !== -1) _navFailed(url, code, String(err?.message || err));
      return false;
    });
  }

  // NEXUS service ports (nexus/autopilot.js). A refused connection to a
  // local port one keystroke away from one of these is almost always a
  // typo (":900" for ":9000") — the error page offers the real target.
  const NEXUS_PORTS = [9000, 4800, 7820, 7821, 3747, 7799];
  function _suggestPort(u) {
    try {
      const x = new URL(u);
      if (!/^(127\.0\.0\.1|localhost)$/.test(x.hostname)) return null;
      const p = Number(x.port || 80);
      const hit = NEXUS_PORTS.find(n => n !== p && (String(n).startsWith(String(p)) || String(p).startsWith(String(n))));
      if (!hit) return null;
      x.port = String(hit);
      return x.toString();
    } catch { return null; }
  }

  let _lastNavFail = { url: '', at: 0 };
  function _navFailed(url, code, desc) {
    if (!url || url.startsWith('data:')) return;
    const now = Date.now();
    if (_lastNavFail.url === url && now - _lastNavFail.at < 1500) return; // promise + did-fail-load both report one failure
    _lastNavFail = { url, at: now };
    const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const alt = _suggestPort(url);
    const refused = code === -102;
    const html = `<!doctype html><meta charset="utf-8"><title>Can't reach ${esc(url)}</title>
<body style="margin:0;background:#0b0b12;color:#d8dae4;font:14px system-ui,sans-serif;display:grid;place-items:center;height:100vh">
<div style="max-width:560px;padding:24px">
<div style="font-size:12px;letter-spacing:.2em;color:#ff5c7a">NAVIGATION FAILED · ${esc(code)}</div>
<h2 style="margin:8px 0 4px;font-weight:600">${refused ? 'Nothing is listening at this address' : "This page couldn't load"}</h2>
<code style="display:block;color:#00f5ff;margin:8px 0 12px;word-break:break-all">${esc(url)}</code>
<div style="color:#8a8da2">${esc(desc)}</div>
${alt ? `<p>Did you mean <a style="color:#00f5ff" href="${esc(alt)}">${esc(alt)}</a>?</p>` : ''}
<p><a style="color:#00f5ff" href="${esc(url)}">Retry</a></p></div></body>`;
    // Keep the address bar on the URL that failed, not the data: URL.
    _tabs.setUrl(_tabs.activeId, url);
    const shown = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    Promise.resolve(wv.loadURL(shown)).catch(() => {}).finally(() => { urlBar.value = url; });
  }

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // Aborted — superseded navigation, normal
    if (e.isMainFrame === false) return; // subresource/iframe failures are the page's business
    addMsg('assistant', `Navigation failed: ${e.errorDescription}`);
    _navFailed(e.validatedURL, e.errorCode, e.errorDescription);
  });

  wv.addEventListener('console-message', (e) => {
    const msg = e.message || '';
    const isCsp  = /content security policy|refused to (connect|load|frame|execute)/i.test(msg);
    const isCors = /cors policy|cross-origin request blocked|access-control-allow-origin/i.test(msg);
    if (!isCsp && !isCors) return;
    addMsg('assistant', `⚠ ${isCsp ? 'CSP' : 'CORS'} block on ${wv.getURL()}: ${msg.slice(0, 220)}`);
  });

  wv.addEventListener('dom-ready', () => {
    if (domPanelVisible) refreshDomTree();
  });

  // The navigation-failure page is a data: URL; everywhere the person sees
  // or records "the current URL" it stands in for the URL that failed.
  function _visibleUrl() {
    const u = wv.getURL();
    return (u && u.startsWith('data:text/html') && _lastNavFail.url) ? _lastNavFail.url : u;
  }

  function updateUrl() {
    const url = _visibleUrl();
    if (url !== wv.getURL()) { urlBar.value = url; statusUrl.textContent = url; return; }
    urlBar.value = url;
    statusUrl.textContent = url;
    _restoreZoomForOrigin();
    _recordHistoryVisit(url);
  }

  // §fix 2026-09-02 — the missing write half of "history works though it
  // doesn't seem to work" (see history:record, ipc/bridge.js and
  // preload/index.js). Fires on every real navigation of the tab the
  // person is actually looking at — same event (updateUrl, driven by
  // did-navigate/did-navigate-in-page/did-stop-loading) already used for
  // the URL bar and cookie count, not a new listener. Skips about:blank
  // and skips repeat calls for the same URL in a row (did-navigate and
  // did-stop-loading can both fire updateUrl for one real navigation;
  // real distinct revisits — a different navigation back to the same
  // URL later — still record, matching HistoryStore's own "real browser"
  // convention of not collapsing repeat visits).
  let _lastRecordedUrl = null;
  function _recordHistoryVisit(url) {
    if (!url || url === 'about:blank' || url === _lastRecordedUrl) return;
    _lastRecordedUrl = url;
    cg.history.record({ url, title: wv.getTitle() || url, agentId }).catch(() => {});
  }

  async function updateCookieCount() {
    try {
      // §fix 2026-06-30 — was: called cg.cookies.save() (wrong method),
      // discarded the result, then wrote the URL hostname instead of a
      // count. Real fix needed a real cookies:count IPC handler, which
      // didn't exist — added in ipc/bridge.js + preload/index.js.
      const url = wv.getURL();
      const result = await cg.cookies.count({ url, agentId });
      statusCookies.textContent = result?.ok ? `Cookies: ${result.count}` : 'Cookies: —';
    } catch {
      statusCookies.textContent = 'Cookies: —';
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────
  function normalizeUrl(input) {
    let url = input.trim();
    if (!url) return '';
    if (!url.includes('://') && !url.startsWith('about:')) {
      // §fix 2026-07-04 — local addresses must always be http://, never https://.
      // NEXUS and all sovereign services run plain HTTP. Adding https:// causes
      // ERR_SSL_PROTOCOL_ERROR (-107) in the webview.
      const isLocal = /^(127\.|localhost|0\.0\.0\.0|::1)/.test(url);
      if (isLocal) {
        url = 'http://' + url;
      } else if (url.includes('.')) {
        url = 'https://' + url;
      } else {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }
    return url;
  }

  urlBar.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const url = normalizeUrl(urlBar.value);
    if (!url) return;
    _tabs.setUrl(_tabs.activeId, url);
    navigate(url);
  });

  // ── Tab system ───────────────────────────────────────────────────────────
  // Lightweight multi-tab using the single webview — tabs track their own
  // url/title/loading state, switching loads the stored URL into the webview.
  // Not a multi-webview system (that requires BrowserView/WebContentsView
  // per tab, a main-process change) — this is the renderer-only version
  // that makes the UI work without architectural changes.
  const _tabs = (() => {
    let tabs = [{ id: 1, url: initialUrl || 'about:blank', title: 'New tab', loading: false }];
    let activeId = 1;
    let nextId = 2;
    // §BUILD 2026-08-30 — James: "all the hot keys chrome and firefox
    // have." Ctrl+Shift+T (reopen closed tab) was a real gap — no
    // closed-tab memory existed anywhere in this tab system. Real,
    // bounded (last 10, matching Chrome's own multi-reopen depth) stack
    // of {url,title}, pushed in closeTab below, popped by reopenClosed.
    const closedStack = [];
    const list = document.getElementById('tab-list');

    function render() {
      list.innerHTML = tabs.map(t => `
        <div class="tab-item${t.id === activeId ? ' active' : ''}" data-tid="${t.id}" style="
          display:flex;align-items:center;gap:5px;padding:0 10px 0 12px;height:28px;
          border-radius:6px 6px 0 0;font-size:11px;cursor:pointer;white-space:nowrap;
          background:${t.id===activeId?'#14141f':'transparent'};
          color:${t.id===activeId?'#d8dae4':'#6a6d82'};
          border:${t.id===activeId?'1px solid rgba(255,255,255,.08)':'1px solid transparent'};
          border-bottom:${t.id===activeId?'1px solid #14141f':'none'};
          min-width:80px;max-width:180px;
        ">
          ${t.loading ? '<span style="width:8px;height:8px;border-radius:50%;border:1.5px solid #00f5ff;border-top-color:transparent;animation:spin .6s linear infinite;flex-shrink:0"></span>' : ''}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${t.title}</span>
          <span class="tab-close" data-tid="${t.id}" style="opacity:.4;font-size:13px;padding:0 2px;flex-shrink:0" title="Close tab">✕</span>
        </div>`).join('');

      list.querySelectorAll('.tab-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('tab-close')) return;
          switchTo(parseInt(el.dataset.tid));
        });
      });
      list.querySelectorAll('.tab-close').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); closeTab(parseInt(el.dataset.tid)); });
      });
    }

    function switchTo(id) {
      const t = tabs.find(x => x.id === id);
      if (!t) return;
      activeId = id;
      navigate(t.url || 'about:blank');
      urlBar.value = t.url || '';
      render();
    }

    function newTab(url) {
      const id = nextId++;
      tabs.push({ id, url: url || 'about:blank', title: 'New tab', loading: false });
      switchTo(id);
    }

    function closeTab(id) {
      const closed = tabs.find(t => t.id === id);
      if (closed && closed.url && closed.url !== 'about:blank') {
        closedStack.push({ url: closed.url, title: closed.title });
        if (closedStack.length > 10) closedStack.shift();
      }
      if (tabs.length === 1) { tabs[0].url = 'about:blank'; navigate('about:blank'); urlBar.value=''; render(); return; }
      const idx = tabs.findIndex(t => t.id === id);
      tabs = tabs.filter(t => t.id !== id);
      if (activeId === id) switchTo(tabs[Math.max(0, idx - 1)].id);
      else render();
    }

    function reopenClosed() {
      const last = closedStack.pop();
      if (!last) return false;
      newTab(last.url);
      return true;
    }

    function setUrl(id, url) {
      const t = tabs.find(x => x.id === id);
      if (t) { t.url = url; render(); }
    }

    function setTitle(id, title) {
      const t = tabs.find(x => x.id === id);
      if (t) { t.title = title || 'New tab'; render(); }
    }

    function setLoading(id, loading) {
      const t = tabs.find(x => x.id === id);
      if (t) { t.loading = loading; render(); }
    }

    render();
    return { tabs, get activeId(){ return activeId; }, newTab, closeTab, reopenClosed, setUrl, setTitle, setLoading, render, switchTo };
  })();

  document.getElementById('btn-new-tab').addEventListener('click', () => _tabs.newTab());

  // Wire webview events into tab state
  wv.addEventListener('page-title-updated', (e) => {
    _tabs.setTitle(_tabs.activeId, e.title);
    document.title = e.title + ' — Clear Glass';
  });

  wv.addEventListener('did-start-loading', () => _tabs.setLoading(_tabs.activeId, true));
  wv.addEventListener('did-stop-loading',  () => {
    _tabs.setLoading(_tabs.activeId, false);
    const url = _visibleUrl();
    _tabs.setUrl(_tabs.activeId, url);
    urlBar.value = url;
  });



  // Carried-over URL from openAgentWindow/openBackgroundTab (new-agent,
  // bg-tab, or defaultStartUrl) — webview queues loadURL fine pre-ready.
  if (initialUrl) {
    const norm = normalizeUrl(initialUrl);
    if (norm) {
      // §fix 2026-07-02 — wv.loadURL is not a function until Electron's
      // dom-ready fires on the webview element. getElementById finds the
      // node but the Electron API methods aren't attached until after that
      // event. Guard: call immediately if already ready, otherwise wait.
      if (typeof wv.loadURL === 'function') {
        navigate(norm);
      } else {
        wv.addEventListener('dom-ready', () => navigate(norm), { once: true });
      }
    }
  } else {
    // §fix 2026-06-30, round 2 — found via screenshot: a fresh tab opened
    // with NO initialUrl (the default "New tab" case) sits at about:blank
    // forever and never fires did-stop-loading/did-navigate, which were
    // the ONLY two call sites for updateCookieCount(). Result: the cookie
    // indicator stayed stuck at its initial state permanently for any tab
    // that's never explicitly navigated — exactly the screenshot's tab.
    updateCookieCount();
  }

  document.getElementById('btn-back').addEventListener('click', () => wv.canGoBack() && wv.goBack());
  document.getElementById('btn-forward').addEventListener('click', () => wv.canGoForward() && wv.goForward());
  document.getElementById('btn-reload').addEventListener('click', () => wv.reload());

  // ── Window controls ─────────────────────────────────────────────────
  document.getElementById('btn-minimize').addEventListener('click', () => _cgCall('window','minimize',agentId));
  document.getElementById('btn-maximize').addEventListener('click', () => _cgCall('window','maximize',agentId));
  document.getElementById('btn-close-tray').addEventListener('click', () => _cgCall('window','hide',agentId));

  // ── Options panel ────────────────────────────────────────────────────
  const optionsPanel      = document.getElementById('options-panel');
  const optToggleHideTray = document.getElementById('opt-hide-tray');
  const optToggleCopilot  = document.getElementById('opt-copilot-auto');
  const optDefaultUrl     = document.getElementById('opt-default-url');

  async function openOptionsPanel() {
    optionsPanel.classList.add('visible');
    // Populate provider list in options
    try {
      const providers = await cg.providers.list() || [];
      const optProvList = document.getElementById('opt-providers-list');
      if (optProvList) {
        optProvList.innerHTML = providers.map(p => `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            <span style="width:8px;height:8px;border-radius:50%;background:${p.hosted ? 'var(--green)' : 'var(--text-dim)'};flex-shrink:0;"></span>
            <span style="flex:1;font-size:11px;">${p.name}</span>
            <button class="opt-link-btn prov-opt-btn" data-id="${p.id}" data-hosted="${p.hosted}">
              ${p.hosted ? 'Active ✓' : 'Start'}
            </button>
          </div>`).join('');
        optProvList.querySelectorAll('.prov-opt-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const hosted = btn.dataset.hosted === 'true';
            if (hosted) { await cg.providers.show(id); }
            else {
              btn.textContent = 'Starting…';
              try { await cg.providers.start(id, { show: true }); } catch (err) { addMsg('assistant', `Provider error: ${err.message}`); }
            }
            openOptionsPanel(); // refresh
          });
        });
      }
    } catch (_) {}
    // Bookmark count
    try {
      const bks = await cg.bookmarks.list({ agentId }) || [];
      const el = document.getElementById('opt-bookmarks-count');
      if (el) el.textContent = `${bks.length} bookmark${bks.length !== 1 ? 's' : ''} for this agent`;
    } catch (_) {}
    // Rewind count
    try {
      const snaps = await cg.rewind.list(agentId, 50) || [];
      const el = document.getElementById('opt-rewind-count');
      if (el) el.textContent = `${snaps.length} snapshot${snaps.length !== 1 ? 's' : ''} recorded`;
    } catch (_) {}
    try {
      const opts = await cg.options.get();
      optToggleHideTray.classList.toggle('on', !!opts.hideToTrayOnClose);
      optToggleCopilot.classList.toggle('on', !!opts.autoOpenCopilotPane);
      optDefaultUrl.value = opts.defaultStartUrl || 'about:blank';
    } catch (err) {
      addMsg('assistant', `Failed to load options: ${err.message}`);
    }
  }

  document.getElementById('btn-options')?.addEventListener('click', openOptionsPanel);
  document.getElementById('options-panel-close').addEventListener('click', () => optionsPanel.classList.remove('visible'));

  optDefaultUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') optDefaultUrl.blur(); });

  function bindToggle(el) {
    el.addEventListener('click', async () => {
      const next = !el.classList.contains('on');
      el.classList.toggle('on', next);
      try { await cg.options.set({ [el.dataset.key]: next }); }
      catch (err) { el.classList.toggle('on', !next); addMsg('assistant', `Failed to save option: ${err.message}`); }
    });
  }
  bindToggle(optToggleHideTray);
  bindToggle(optToggleCopilot);

  optDefaultUrl.addEventListener('change', async () => {
    try { await cg.options.set({ defaultStartUrl: optDefaultUrl.value.trim() || 'about:blank' }); }
    catch (err) { addMsg('assistant', `Failed to save default URL: ${err.message}`); }
  });

  document.getElementById('opt-link-api-settings').addEventListener('click', () => _cgCall('window','openSettings'));
  document.getElementById('opt-link-nexus-audit').addEventListener('click', () => {
    cg.diag.nexus({ agentId });
    addMsg('assistant', 'NEXUS UI Audit dispatched — results will land on the bus.');
  });

  // Clear bookmarks for this agent
  document.getElementById('opt-clear-bookmarks')?.addEventListener('click', async () => {
    const bks = await cg.bookmarks.list({ agentId }) || [];
    for (const bk of bks) await cg.bookmarks.remove({ id: bk.id }).catch(() => {});
    loadBookmarks();
    addMsg('assistant', `Cleared ${bks.length} bookmark(s).`);
    openOptionsPanel();
  });

  // Clear rewind history
  document.getElementById('opt-clear-rewind')?.addEventListener('click', async () => {
    await cg.rewind.clear(agentId).catch(() => {});
    addMsg('assistant', `Rewind history cleared.`);
    openOptionsPanel();
  });

  // Firefox profile import
  document.getElementById('opt-ff-import-btn')?.addEventListener('click', async () => {
    const profilePath = document.getElementById('opt-ff-profile-path')?.value?.trim();
    if (!profilePath) { addMsg('assistant', 'Enter a Firefox profile path first.'); return; }
    // Notify via copilot message — fingerprint engine handles the import
    await cg.copilot.send({
      message: `Import Firefox profile from path: ${profilePath} for agent ${agentId}`,
      agentId,
      systemExtra: `Execute: context.fp.switch({ agentId: "${agentId}", mode: "firefox", profilePath: "${profilePath}" })`,
    }).catch(() => {});
    addMsg('assistant', `Firefox profile import requested for ${agentId}.`);
  });

  // ── Element picker ─────────────────────────────────────────────────
  // §SELECTOR-ASSIGN 0.39.251 — a pick on a provider page is offered as that
  // provider's reply / input / send selector (renderer/selector-assign/).
  window.CGSelectorAssign?.mount({ cg, wv, notify: (m) => addMsg('assistant', m) });

  pickerBtn.addEventListener('click', async () => {
    pickerActive = !pickerActive;
    pickerBtn.classList.toggle('active', pickerActive);

    if (pickerActive) {
      try {
        if (!window.__guardianPickerSrc) {
          window.__guardianPickerSrc = await fetch('./guardian-picker.js').then(r => r.text());
        }
        await wv.executeJavaScript(window.__guardianPickerSrc);
      } catch (err) {
        console.error('[pickerBtn] guardian-picker.js load failed, falling back:', err);
        await wv.executeJavaScript(PICKER_SCRIPT);
      }
    } else {
      await wv.executeJavaScript(`if (window.__gPickerActive) window.__gPickerActive.destroy(); else if (window.__cgPicker) window.__cgPicker.destroy();`).catch(() => {});
    }
  });

  // ── Agent mesh picker (rebuilt from BrainOS) ─────────────────────────
  // §CONVERT 2026-09-06 — same real injection convention as pickerBtn
  // above (fetch the content-script's source once, cache it, executeJavaScript
  // into the live webview), for mesh-picker.js instead of guardian-picker.js.
  // Shows AgentMesh's real listMeshView() (chat-agent contexts + pulse-
  // tracked nodes) as a live HUD and can hand a selection off to the
  // element picker as its target.
  let meshPickerActive = false;
  const meshPickerBtn = document.getElementById('mesh-picker-btn');
  meshPickerBtn?.addEventListener('click', async () => {
    meshPickerActive = !meshPickerActive;
    meshPickerBtn.classList.toggle('active', meshPickerActive);

    if (meshPickerActive) {
      try {
        if (!window.__meshPickerSrc) {
          window.__meshPickerSrc = await fetch('./mesh-picker.js').then(r => r.text());
        }
        await wv.executeJavaScript(window.__meshPickerSrc);
      } catch (err) {
        console.error('[meshPickerBtn] mesh-picker.js load failed:', err);
      }
    } else {
      await wv.executeJavaScript(`if (window.__meshPickerActive) window.__meshPickerActive.destroy();`).catch(() => {});
    }
  });

  // A node/agent picked in the mesh HUD hands off to the element picker,
  // pre-targeted — same real ipc-message channel convention as
  // dom:pick-result below, distinct channel so this handler doesn't have
  // to share dom:pick-result's payload shape.
  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'mesh:node-selected') {
      addMsg('assistant', `Mesh target set: <code>${e.args[0]?.label || e.args[0]?.id || 'unknown'}</code> (${e.args[0]?.kind || 'node'})`);
    }
  });

  // Listen for pick results from webview
  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'dom:pick-result') {
      const pick = { ...e.args[0], pickId: 'pick-' + Date.now(), name: `pick-${picks.length + 1}` };
      picks.push(pick);
      renderPicks();
      picksPanel.classList.add('visible');
      pickerActive = false;
      pickerBtn.classList.remove('active');
      addMsg('assistant', `Picked: <code>${pick.tag}${pick.id_attr ? '#' + pick.id_attr : ''}${pick.classes ? '.' + pick.classes.split(' ')[0] : ''}</code> — registered as "${pick.name}"`);

      // §BUILD 2026-07-09 — this used to stop at the local panel above.
      // Forward to main → bus → SSE (always), and additionally to a
      // caller-configured API channel when that routing mode is selected.
      // The routing choice never leaves the page it was captured on, so
      // it goes over with the payload rather than being main-process state.
      window.ClearGlass?._sendPickResult?.({
        ...pick, agentId,
        routeTo: pickerRoute?.value || 'sse',
        apiUrl:  pickerRoute?.value === 'api' ? (pickerApiUrl?.value || '') : undefined,
      });
      window.CGSelectorAssign?.offer({ xpath: pick.xpath, url: pick.url || wv.getURL() });
    } else if (e.channel === 'dom:event') {
      // Live MutationObserver stream — forward straight through, no local
      // UI cost (this can fire many times a second on a busy page).
      window.ClearGlass?._sendDomEvent?.({ ...e.args[0], agentId });
      // §SELECTOR-ASSIGN 0.39.251 — guardian-picker.js reports each pick.
      if (e.args[0]?.type === 'guardian.picker.picked') window.CGSelectorAssign?.offer({ xpath: e.args[0].xpath, url: e.args[0].url || wv.getURL() });
    } else if (e.channel === 'nexus:cookie-request') {
      // §ADDED 2026-09-02 — James: "check clear-glass for an ipc" (for
      // cookie-vault reachability from a page-level userscript). The
      // real bridge mechanism already existed (webview-bridge.js, this
      // relay pattern); this channel + the real round-trip is new. A
      // request carries a real requestId so the response (delivered
      // back into the page separately, see main/index.js's own real
      // relay) can be matched to the right caller — this channel can
      // legitimately fire more than once concurrently.
      window.ClearGlass?._sendCookieRequest?.({ ...e.args[0], agentId });
    } else if (e.channel === 'nexus:open-settings') {
      // §ADDED 2026-09-25 — the guest page's own menu (tv-shell/home's
      // #sys-bar "⚙ Settings" button) has no way to reach the real
      // Settings window on its own (contextIsolation, no Node, no
      // access to window.ClearGlass — that global only exists on THIS
      // outer document). Same real cg.window.openSettings() the tray
      // menu item and btn-settings's own click handler already call.
      cg.window.openSettings();
    }
  });

  // ── DOM → SSE streaming ───────────────────────────────────────────────
  // §BUILD 2026-07-09 — DOM_MESH_SCRIPT below used to be query/highlight
  // helpers only, never injected, no observer. This is the actual
  // "stream the entire DOM to SSE" feature: inject a MutationObserver
  // that batches changes and pushes them out through the same bridge the
  // picker uses, on toggle.
  domStreamBtn?.addEventListener('click', async () => {
    domStreaming = !domStreaming;
    domStreamBtn.classList.toggle('active', domStreaming);
    domStreamBtn.textContent = domStreaming ? '■' : '▶';
    domStreamBtn.title = domStreaming ? 'Stop streaming DOM to SSE' : 'Stream live DOM mutations to SSE';
    try {
      if (domStreaming) {
        await wv.executeJavaScript(DOM_STREAM_SCRIPT);
      } else {
        await wv.executeJavaScript(`if (window.__cgDomStream) window.__cgDomStream.stop();`);
      }
    } catch (err) {
      addMsg('assistant', `⚠ DOM stream ${domStreaming ? 'start' : 'stop'} failed: ${err.message}`);
      domStreaming = !domStreaming;
      domStreamBtn.classList.toggle('active', domStreaming);
    }
  });

  // Re-arm streaming on navigation — a fresh page has no observer.
  wv.addEventListener('did-navigate', () => {
    if (domStreaming) wv.executeJavaScript(DOM_STREAM_SCRIPT).catch(() => {});
  });

  const PICKER_SCRIPT = `
(function() {
  if (window.__cgPicker) window.__cgPicker.destroy();
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;';
  document.body.appendChild(overlay);
  const hl = document.createElement('div');
  hl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #00f5ff;background:rgba(0,245,255,0.06);box-shadow:0 0 12px #00f5ff44;transition:all .06s;';
  document.body.appendChild(hl);
  let last = null;
  overlay.onmousemove = (e) => {
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = 'all';
    if (!el || el === last) return; last = el;
    const r = el.getBoundingClientRect();
    hl.style.cssText += ';top:'+r.top+'px;left:'+r.left+'px;width:'+r.width+'px;height:'+r.height+'px;';
  };
  overlay.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = 'all';
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 0.39.251 — xpath in guardian-picker.js getXPath()'s format, so the
    // selector-assign check resolves a fallback pick the same way.
    const xp = (n) => { if (n.id) return '//*[@id="' + n.id + '"]'; const parts = []; while (n && n.nodeType === 1) { let i = 1, s = n.previousSibling; while (s) { if (s.nodeType === 1 && s.tagName === n.tagName) i++; s = s.previousSibling; } parts.unshift(n.tagName.toLowerCase() + (i > 1 ? '[' + i + ']' : '')); n = n.parentNode; } return '/' + parts.join('/'); };
    const data = {
      xpath: xp(el), url: location.href,
      tag: el.tagName.toLowerCase(),
      id_attr: el.id,
      classes: el.className,
      text: el.innerText?.slice(0,100),
      href: el.href,
      value: el.value,
      rect: {top:r.top,left:r.left,width:r.width,height:r.height},
    };
    // §FIX 2026-07-09 — both of the old bridge attempts were dead:
    // require('electron') has no Node access in this isolated guest page,
    // and postMessage doesn't cross the webview guest/host boundary the
    // way sendToHost does. window.__cg is the real one — see
    // src/preload/webview-bridge.js, loaded via the webview's 'preload'
    // attribute (set from wvPreload in the outer page, main process
    // origin).
    try { window.__cg?.send('dom:pick-result', data); } catch {}
    window.__cgPicker.destroy();
  };
  window.__cgPicker = {
    destroy() { overlay.remove(); hl.remove(); window.__cgPicker = null; }
  };
})();
  `;

  function renderPicks() {
    if (!picks.length) {
      picksList.innerHTML = '<span style="color:var(--text-dim);font-size:10px;padding:8px;">No picks yet.</span>';
      return;
    }
    picksList.innerHTML = picks.map(p => `
      <div class="pick-item" data-name="${p.name}">
        <span class="pick-tag">&lt;${p.tag}&gt;</span>${p.id_attr ? ' #' + p.id_attr : ''}
        <div class="pick-name">${p.name} · ${p.text?.slice(0,30) || ''}</div>
      </div>
    `).join('');
  }

  // ── Co-pilot ───────────────────────────────────────────────────────
  copilotToggle.addEventListener('click', () => {
    copilotVisible = !copilotVisible;
    copilotPane.classList.toggle('hidden', !copilotVisible);
    copilotToggle.classList.toggle('active', copilotVisible);
  });

  document.getElementById('copilot-clear').addEventListener('click', () => {
    copilotMsgs.innerHTML = '';
    addMsg('assistant', 'History cleared. Ready.');
  });

  // Context toggles
  document.getElementById('ctx-dom').addEventListener('click', (e) => {
    ctxDom = !ctxDom; e.target.classList.toggle('active', ctxDom);
  });
  document.getElementById('ctx-picks').addEventListener('click', (e) => {
    ctxPicks = !ctxPicks; e.target.classList.toggle('active', ctxPicks);
  });
  document.getElementById('ctx-cookies').addEventListener('click', (e) => {
    ctxCookies = !ctxCookies; e.target.classList.toggle('active', ctxCookies);
  });

  // §BUILT 2026-09-26 — the pane's CLI wearing the Clear Glass hat
  // (renderer/copilot-cli.js): route bar, slash commands, ↑/↓ history.
  const _ctxChip = { dom: 'ctx-dom', picks: 'ctx-picks', cookies: 'ctx-cookies' };
  const cli = window.CGCopilotCLI ? window.CGCopilotCLI.create({
    cg, agentId, wv, normalizeUrl, navigate,
    print: (role, text) => addMsg(role, text),
    getCtx: () => ({ dom: ctxDom, picks: ctxPicks, cookies: ctxCookies }),
    setCtx: (what, on) => {
      if (what === 'dom') ctxDom = on; else if (what === 'picks') ctxPicks = on; else if (what === 'cookies') ctxCookies = on;
      document.getElementById(_ctxChip[what])?.classList.toggle('active', on);
    },
    clearMessages: () => { copilotMsgs.replaceChildren(); },
  }) : null;

  // §0.39.278 — a reply is ESCAPED before it becomes markup. Before this, res.text went into innerHTML raw: a page the
  // co-pilot read could put <img onerror=…> into its reply. Now that replies are kept and replayed on open
  // (restoreConversation), that would be a stored injection — so every reply, live or replayed, goes through here.
  function formatReply(text) {
    return String(text || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/```driver[\s\S]*?```/g, () => `<span style="color:var(--accent);font-family:var(--mono);font-size:10px;">[driver command sent]</span>`)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  // §0.39.278 — the pane's conversation is kept (src/copilot/chat-store.js); opening the pane shows it again.
  async function restoreConversation() {
    if (!cg.copilot || typeof cg.copilot.history !== 'function') return;
    try {
      const r = await cg.copilot.history(agentId, 100);
      if (!r || r.ok === false || !Array.isArray(r.turns) || !r.turns.length) return;
      copilotMsgs.replaceChildren();
      for (const t of r.turns) {
        if (t.role === 'user') addMsg('user', t.text);
        else addMsg('assistant', formatReply(t.text), true);
      }
      addMsg('route', `restored ${r.turns.length} message${r.turns.length === 1 ? '' : 's'} · /new starts a fresh conversation`);
    } catch (_) { /* nothing kept yet, or the store is unreachable — the pane starts empty as before */ }
  }
  restoreConversation();

  copilotInput.addEventListener('keydown', (e) => {
    if (cli && cli.onKey(e, copilotInput)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCopilot();
    }
  });
  copilotSend.addEventListener('click', sendCopilot);

  async function sendCopilot() {
    let text = copilotInput.value.trim();
    if (!text) return;

    copilotInput.value = '';
    if (cli) {
      const handled = await cli.handle(text);
      if (handled === true) return;
      if (handled && handled.passthrough) text = handled.passthrough;
    }
    addMsg('user', text);

    // §NEW 2026-07-11 — /build and /diagnose slash commands. Both call
    // real, working methods (this.copilot.build()/diagnose() in
    // src/copilot/bridge.js, which dispatch through Bridge to the actual
    // copilot service) that had no caller anywhere until now — see
    // ipc/bridge.js's copilot:build/copilot:diagnose fix comment for why.
    // Plain-language routing (no NLP): a message starting with "/build "
    // or "/diagnose " takes this path; everything else is the normal
    // conversational send below, unchanged.
    const buildMatch = text.match(/^\/build\s+(.+)/is);
    const diagMatch  = text.match(/^\/diagnose\s*(.*)/is);
    if (buildMatch) {
      addMsg('thinking', '⋯ building — this can take a couple minutes');
      try {
        const res = await cg.copilot.build({ description: buildMatch[1].trim(), sessionId: agentId });
        removeThinking();
        if (res?.ok === false) { addMsg('assistant', `Build failed: ${res.error || 'unknown error'}`); }
        else { addMsg('assistant', res?.text || res?.summary || JSON.stringify(res, null, 2).slice(0, 2000), false); }
      } catch (err) {
        removeThinking();
        addMsg('assistant', `Build error: ${err.message}`);
      }
      return;
    }
    if (diagMatch) {
      addMsg('thinking', '⋯ diagnosing');
      try {
        const res = await cg.copilot.diagnose({ topic: diagMatch[1].trim() || undefined });
        removeThinking();
        if (res?.ok === false) { addMsg('assistant', `Diagnose failed: ${res.error || 'unknown error'}`); }
        else { addMsg('assistant', res?.text || res?.summary || JSON.stringify(res, null, 2).slice(0, 2000), false); }
      } catch (err) {
        removeThinking();
        addMsg('assistant', `Diagnose error: ${err.message}`);
      }
      return;
    }

    addMsg('thinking', '⋯');

    // Build context
    let domContext = null;
    if (ctxDom) {
      try {
        domContext = await wv.executeJavaScript('window.__cgDomMesh?.getTree(3)', true);
      } catch {}
    }

    let systemExtra = '';
    if (ctxPicks && picks.length) {
      systemExtra += `\n## Picked Elements\n${JSON.stringify(picks, null, 2).slice(0, 1000)}`;
    }

    try {
      const res = await cg.copilot.send({ message: text, agentId, domContext, systemExtra, noDom: !ctxDom, ...(cli ? cli.route() : {}) });
      removeThinking();

      addMsg('assistant', formatReply(res.text), true);
      if (res.route && cli && cli.state.showRoute !== false) {
        const r = res.route;
        addMsg('route', `${r.backend}${r.agent ? ' · ' + r.agent : ''}${r.hat ? ' · 🎩' : ''}${r.modelUsed ? ' · ' + r.modelUsed : ''}${(res.commands || []).length ? ` · ${res.commands.length} command${res.commands.length === 1 ? '' : 's'}${res.executed === false ? ' proposed' : ' run'}` : ''}`);
      }
      // §FIX 2026-09-26 — commands run once, in the main process
      // (CoPilotBridge.send). This loop used to re-run every one through
      // cg.driver.exec, so each copilot click/type happened twice. With
      // auto-run off they come back unexecuted and the CLI proposes them.
      if (res.executed === false && cli) cli.propose(res.commands || []);
    } catch (err) {
      removeThinking();
      addMsg('assistant', `Error: ${err.message}`);
    }
  }

  function addMsg(role, content, html = false) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (html) div.innerHTML = content;
    else div.textContent = content;
    copilotMsgs.appendChild(div);
    copilotMsgs.scrollTop = copilotMsgs.scrollHeight;
  }

  function removeThinking() {
    copilotMsgs.querySelectorAll('.thinking').forEach(el => el.remove());
  }

  // §NEW 2026-08-24 — real, generic, requestId-correlated driver call.
  // cg.driver.exec() alone is fire-and-forget (confirmed directly:
  // bridge.js's rendererEmit() returns {ok:true} immediately, the real
  // result arrives later as a separate driver.result/driver.error SSE
  // event) — no existing helper in this file correlated a call with its
  // own real result before this. Needed for real, not hypothetically:
  // find-in-page's match count can't be a fire-and-forget UI update, it
  // has to be the actual count that came back.
  function _execAndAwait(action, args = {}, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const requestId = `${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const cleanup = () => { es.removeEventListener('driver.result', onResult); es.removeEventListener('driver.error', onError); };
      const onResult = (e) => {
        const d = JSON.parse(e.data);
        if (d.requestId !== requestId || settled) return;
        settled = true; cleanup(); resolve(d.result);
      };
      const onError = (e) => {
        const d = JSON.parse(e.data);
        if (d.requestId !== requestId || settled) return;
        settled = true; cleanup(); reject(new Error(d.error));
      };
      es.addEventListener('driver.result', onResult);
      es.addEventListener('driver.error', onError);
      cg.driver.exec({ action, agentId, requestId, ...args });
      setTimeout(() => {
        if (settled) return;
        settled = true; cleanup(); reject(new Error(`timeout waiting for ${action} result`));
      }, timeoutMs);
    });
  }

  // ── Voice input — §NEW 2026-08-24 ─────────────────────────────────────
  // Real MediaRecorder-based capture, composed with the real speech
  // engine (src/speech/engine.js) via speech.transcribeBuffer. This
  // engine is CMU PocketSphinx, not OpenAI Whisper — named honestly in
  // the mic button's own title attribute (browser.html) and here, not
  // presented as something it isn't. Traced against MediaRecorder's real,
  // standard API (no non-standard calls) — not live-run in a real
  // browser from this sandbox, same caveat as every other renderer piece
  // this session built.
  let _micRecorder = null;
  let _micChunks = [];
  let _micRecording = false;

  copilotMicBtn?.addEventListener('click', async () => {
    if (_micRecording) {
      _micRecorder.stop();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      addMsg('assistant', `Microphone access failed: ${err.message}`);
      return;
    }
    _micChunks = [];
    _micRecorder = new MediaRecorder(stream);
    _micRecorder.ondataavailable = (e) => { if (e.data.size > 0) _micChunks.push(e.data); };
    _micRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      _micRecording = false;
      copilotMicBtn.textContent = '🎤';
      copilotMicBtn.title = 'Voice input (real, local, offline speech-to-text)';

      const blob = new Blob(_micChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      copilotMicBtn.textContent = '⏳';
      try {
        const result = await cg.speech.transcribeBuffer(new Uint8Array(arrayBuffer), 'webm');
        if (result?.error) {
          addMsg('assistant', `Voice input failed: ${result.error}`);
        } else if (result?.text) {
          copilotInput.value = (copilotInput.value ? copilotInput.value + ' ' : '') + result.text;
        } else {
          addMsg('assistant', 'Voice input: no speech detected.');
        }
      } catch (err) {
        addMsg('assistant', `Voice input error: ${err.message}`);
      }
      copilotMicBtn.textContent = '🎤';
    };
    _micRecorder.start();
    _micRecording = true;
    copilotMicBtn.textContent = '⏹';
    copilotMicBtn.title = 'Click to stop recording';
  });

  // ── DOM Archaeology ────────────────────────────────────────────────
  document.getElementById('btn-dom').addEventListener('click', () => {
    domPanelVisible = !domPanelVisible;
    domPanel.classList.toggle('visible', domPanelVisible);
    if (domPanelVisible) refreshDomTree();
  });

  document.getElementById('dom-panel-close').addEventListener('click', () => {
    domPanelVisible = false;
    domPanel.classList.remove('visible');
  });

  document.getElementById('dom-refresh').addEventListener('click', refreshDomTree);

  domSearch.addEventListener('input', debounce(async () => {
    const q = domSearch.value.trim();
    if (!q) { refreshDomTree(); return; }
    try {
      const res = await wv.executeJavaScript(`window.__cgDomMesh?.query(${JSON.stringify(q)})`, true);
      renderDomResult(res);
    } catch {}
  }, 300));

  async function refreshDomTree() {
    domTree.textContent = 'Loading...';
    try {
      const tree = await wv.executeJavaScript('window.__cgDomMesh?.getTree(4)', true);
      if (!tree) {
        // Inject mesh first
        await wv.executeJavaScript(DOM_MESH_SCRIPT, true);
        const tree2 = await wv.executeJavaScript('window.__cgDomMesh?.getTree(4)', true);
        renderDomNode(tree2, domTree, 0);
      } else {
        renderDomNode(tree, domTree, 0);
      }
    } catch (err) {
      domTree.textContent = 'Error: ' + err.message;
    }
  }

  function renderDomNode(node, container, depth) {
    if (!node || depth > 5) return;
    container.innerHTML = '';
    renderNodeRecursive(node, container, depth);
  }

  function renderNodeRecursive(node, container, depth) {
    if (!node) return;
    const indent = '  '.repeat(depth);
    const div = document.createElement('div');
    div.className = 'dom-node';

    const id  = node.id_attr  ? `<span class="dom-id"> #${node.id_attr}</span>` : '';
    const cls = node.classes?.length ? `<span class="dom-cls"> .${node.classes.slice(0,2).join('.')}</span>` : '';
    const txt = node.text    ? `<span class="dom-text"> "${node.text.slice(0,40)}"</span>` : '';

    div.innerHTML = `${indent}<span class="dom-tag">&lt;${node.tag}&gt;</span>${id}${cls}${txt}`;
    div.addEventListener('click', () => {
      if (node.id_attr) wv.executeJavaScript(`window.__cgDomMesh?.highlight('#${node.id_attr}')`, true).catch(() => {});
    });
    container.appendChild(div);

    if (Array.isArray(node.children)) {
      for (const child of node.children) renderNodeRecursive(child, container, depth + 1);
    }
  }

  function renderDomResult(nodes) {
    domTree.innerHTML = '';
    if (!nodes?.length) { domTree.textContent = 'No matches'; return; }
    for (const node of nodes) renderNodeRecursive(node, domTree, 0);
  }

  // ── SSE subscription ───────────────────────────────────────────────
  function connectSSE() {
    es = new EventSource(`http://127.0.0.1:${ssePort}/events?replay=5`);

    // §fix 2026-06-30, round 2 — found via a real boot log: orchestrator
    // offline (standalone Clear Glass) means nexus.status NEVER fires, so
    // statusHealth/statusCookies stayed at whatever was hardcoded in the
    // raw HTML forever — "Health: 100" looking confidently wrong instead
    // of honestly unknown. Initial markup now says "—" (fixed above); this
    // timeout makes the "—" SAY something after a few seconds of silence,
    // instead of being indistinguishable from "still loading."
    const _healthTimeout = setTimeout(() => {
      statusHealth.textContent = 'Health: offline';
      statusHealth.style.color = 'var(--red, #ff4466)';
      statusHealth.title = 'No nexus.status event received — orchestrator unreachable or NEXUS not running';
      const dot = document.getElementById('dot-nexus');
      if (dot) {
        dot.className = 'status-dot error';
        dot.parentElement.title = 'orchestrator unreachable — no nexus.status event in 8s';
      }
    }, 8000);

    // ── Live status dots driven by SSE — never hardcoded ──────────────
    es.addEventListener('nexus.status', (e) => {
      clearTimeout(_healthTimeout);
      const d = JSON.parse(e.data);
      const dot = document.getElementById('dot-nexus');
      dot.className = 'status-dot ' + (d.all ? 'ok' : 'error');
      dot.parentElement.title =
        `orchestrator:${d.orchestrator ? 'up' : 'down'} `
        + `cortex:${d.cortex ? 'up' : 'down'} `
        + `guardian:${d.guardian ? 'up' : 'down'} `
        + `bridge:${d.bridge ? 'up' : 'down'}`;

      // §fix 2026-06-30 — statusHealth was declared (line ~1271) and never
      // written to anywhere in this file. Permanently showed the hardcoded
      // "Health: 100" from the HTML regardless of real system state —
      // exactly the screenshot's complaint. Computed from the same booleans
      // already driving the dot above, not a new data source.
      const checks = ['orchestrator', 'cortex', 'guardian', 'bridge'];
      const upCount = checks.filter(k => d[k]).length;
      const pct = Math.round((upCount / checks.length) * 100);
      statusHealth.textContent = `Health: ${pct}`;
      statusHealth.style.color = pct === 100 ? '' : pct >= 50 ? 'var(--amber, #ffb454)' : 'var(--red, #ff4466)';
    });

    es.addEventListener('tls.tunnel', (e) => {
      document.getElementById('dot-tls').className = 'status-dot ok';
    });

    es.addEventListener('window.maximized', (e) => {
      const d = JSON.parse(e.data);
      if (d.agentId !== agentId) return;
      document.getElementById('btn-maximize').textContent = d.maximized ? '❐' : '⛶';
      document.getElementById('btn-maximize').title = d.maximized ? 'Restore' : 'Maximize';
    });

    es.addEventListener('tls.error', (e) => {
      document.getElementById('dot-tls').className = 'status-dot warn';
    });

    // ── Context events ────────────────────────────────────────────────
    es.addEventListener('context.rate-limited', (e) => {
      const d = JSON.parse(e.data);
      if (d.agentId === agentId) {
        addMsg('assistant', `⚠ Rate limit on ${agentId} — RAID rerouting.`);
      }
    });

    es.addEventListener('context.fp.switched', (e) => {
      const d = JSON.parse(e.data);
      if (d.agentId === agentId) {
        addMsg('assistant', `Fingerprint switched → ${d.mode} (${d.ua.slice(0, 60)}...)`);
      }
    });

    // ── DOM picks ─────────────────────────────────────────────────────
    es.addEventListener('dom.picked', (e) => {
      const d = JSON.parse(e.data);
      picks.push(d);
      renderPicks();
    });

    // ── Driver events ─────────────────────────────────────────────────
    es.addEventListener('driver.error', (e) => {
      const d = JSON.parse(e.data);
      addMsg('assistant', `Driver error [${d.action}]: ${d.error}`);
    });

    // ── Guardian listener → Co-pilot panel — §2026-08-28, James: "co-pilot
    //    panel inside of clearglass ui." Real, local-only link target
    //    (guardian-picker.js's 'copilot-panel' option) — ipc/bridge.js
    //    emits this exact event name, no HTTP call, no external system.
    //    Renders the matched text directly as a chat message so a person
    //    watching the co-pilot panel sees it the moment it fires.
    es.addEventListener('guardian.listener.copilot-panel', (e) => {
      const d = JSON.parse(e.data);
      const text = d.text || d.value || '(no text captured)';
      addMsg('assistant', `⦿ Listener match: ${text.slice(0, 500)}`);
    });

    // ── URL listener hits ─────────────────────────────────────────────
    es.addEventListener('url.match', (e) => {
      const d = JSON.parse(e.data);
      if (d.agentId === agentId || d.agentId === '*') {
        addMsg('assistant', `🎯 URL match [${d.label}]: ${d.url.slice(0, 80)}`);
      }
    });

    // ── Agent mesh events ──────────────────────────────────────────────
    es.addEventListener('mesh.task.complete', (e) => {
      const d = JSON.parse(e.data);
      addMsg('assistant', `✦ Mesh [${d.agentKey}] complete: ${d.responseSnippet?.slice(0, 100) || '(done)'}`);
    });

    es.addEventListener('mesh.task.error', (e) => {
      const d = JSON.parse(e.data);
      addMsg('assistant', `✦ Mesh [${d.agentKey}] error: ${d.error}`);
    });

    // ── Diagnostic events ──────────────────────────────────────────────
    es.addEventListener('diag.run.complete', (e) => {
      const d = JSON.parse(e.data);
      const icon = d.success ? '✓' : '✗';
      addMsg('assistant', `${icon} Diagnostic [${d.label}]: ${d.passed}/${d.total} passed`);
    });

    es.addEventListener('diag.step.fail', (e) => {
      const d = JSON.parse(e.data);
      addMsg('assistant', `⚠ Step failed: ${d.label} — ${d.error}`);
    });

    es.addEventListener('diag.screenshot.saved', (e) => {
      const d = JSON.parse(e.data);
      addMsg('assistant', `📸 Screenshot saved: ${d.file.split('/').pop()}`);
    });

    es.onerror = () => {
      document.getElementById('dot-sse').className = 'status-dot error';
      setTimeout(connectSSE, 3000);
    };

    es.onopen = () => {
      document.getElementById('dot-sse').className = 'status-dot ok';
    };
  }

  // ── Mesh button ────────────────────────────────────────────────────
  document.getElementById('btn-mesh')?.addEventListener('click', async (e) => {
    const panel = document.getElementById('agent-mesh-panel');
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    const rect = e.target.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">loading…</div>';
    panel.style.display = 'block';
    try {
      const res = await fetch('http://127.0.0.1:3750/api/agent/current');
      const cur = await res.json();
      const agents = ['auto', 'claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek'];
      panel.innerHTML = `
        <div style="padding:6px 4px;font-size:11px;color:var(--text-dim,#999);border-bottom:1px solid var(--border,#333);margin-bottom:6px">
          Current: <b style="color:var(--text,#ccc)">${(cur.agent || 'auto').replace(/</g,'&lt;')}</b>${cur.hatName ? ` (${cur.hatName.replace(/</g,'&lt;')})` : ''}
        </div>
        ${agents.map(a => `<div data-agent="${a}" style="padding:6px 8px;cursor:pointer;font-size:11px;border-radius:4px;${a === cur.agent ? 'background:var(--accent,#00f5ff);color:#000' : 'color:var(--text,#ccc)'}">${a}</div>`).join('')}`;
      panel.querySelectorAll('[data-agent]').forEach(el => el.addEventListener('click', async () => {
        const target = el.dataset.agent;
        panel.innerHTML = `<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">switching to ${target}…</div>`;
        try {
          const r = await fetch('http://127.0.0.1:3750/api/agent/switch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent: target === 'auto' ? '' : target }),
          });
          const d = await r.json();
          addMsg('assistant', d.ok ? `✓ Switched to ${target}.` : `Switch failed: ${d.reason || d.error || 'unknown'}`);
        } catch (err) {
          addMsg('assistant', `Switch failed: ${err.message}`);
        }
        panel.style.display = 'none';
      }));
    } catch (err) {
      panel.innerHTML = `<div style="padding:8px;color:#ff6b6b;font-size:11px">Co-pilot unreachable: ${err.message}</div>`;
    }
  });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('agent-mesh-panel');
    if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && e.target.id !== 'btn-mesh') panel.style.display = 'none';
  });

  // ── Diag button ────────────────────────────────────────────────────
  document.getElementById('btn-diag')?.addEventListener('click', async () => {
    addMsg('assistant', `Running NEXUS UI audit...`);
    try {
      const res = await cg.copilot.send({
        message: 'Run the NEXUS UI audit diagnostic now.',
        agentId,
        systemExtra: 'Execute: driver.exec({ action: "diag.nexus", agentId })',
      });
    } catch (err) {
      addMsg('assistant', `Diag error: ${err.message}`);
    }
  });

  // ── Settings button ───────────────────────────────────────────────────
  // §ADDED 2026-09-25 — real backing button for src/toolbar/commands.js's
  // btn-settings (see that file's header comment for the full root-cause).
  // Same cg.window.openSettings() every other Settings entry point in this
  // file already calls (tray menu, opt-link-api-settings, the webview
  // bridge's nexus:open-settings relay) — one real function, not a new one.
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    cg.window.openSettings();
  });

  connectSSE();

  // ── Bookmarks ──────────────────────────────────────────────────────────
  // §0.39.265 — James: "the bookmark system is supposed to be hooked in to the
  // system state/rewind engine and account. Like a bookmark with a check mark
  // to attach to the account … different accounts in each tab." A bookmark
  // can carry page state (a rewind snapshot of this window: URL, cookies,
  // storage, scroll) and an account. An account's pages open in that
  // account's own window (acct-<accountId>, its own session, signed in with
  // the account's saved provider sessions — src/main/index.js), because the
  // tabs of one window share its webview and so its session.
  const ACCT_PREFIX = 'acct-';
  const myAccountId = agentId.startsWith(ACCT_PREFIX) ? agentId.slice(ACCT_PREFIX.length) : null;
  let _accountsCache = null;
  async function _accounts(refresh) {
    if (!_accountsCache || refresh) _accountsCache = await cg.accounts.list().catch(() => []) || [];
    return _accountsCache;
  }
  const _accountLabel = (id) => ((_accountsCache || []).find(a => a.id === id) || {}).label || (id ? id.slice(0, 8) + '…' : '');

  // This window's bookmarks, plus every bookmark attached to an account (those
  // open in their account's window from anywhere).
  async function _visibleBookmarks() {
    const all = await cg.bookmarks.list({}) || [];
    return all.filter(b => b.agentId === agentId || b.accountId);
  }

  async function openBookmark(bk) {
    if (bk.accountId && bk.accountId !== myAccountId) {
      const target = ACCT_PREFIX + bk.accountId;
      await cg.window.open({ agentId: target, url: bk.url });
      if (bk.snapshotId && bk.agentId === target) await cg.bookmarks.openWithState({ id: bk.id, agentId: target }).catch(() => {});
      else cg.bookmarks.visit({ id: bk.id });
      addMsg('assistant', `Opened in ${_accountLabel(bk.accountId) || 'the account'}\u2019s window.`);
      return;
    }
    if (bk.snapshotId && bk.agentId === agentId) {
      const r = await cg.bookmarks.openWithState({ id: bk.id, agentId }).catch(e => ({ restored: false, restoreError: e.message }));
      if (r && r.restored) return;
      navigate(bk.url);
      if (r && r.restoreError) addMsg('assistant', `Saved page state could not be restored (${r.restoreError}) \u2014 opened the page without it.`);
      return;
    }
    navigate(bk.url);
    cg.bookmarks.visit({ id: bk.id });
  }

  // An account window says whose it is, next to its tabs.
  if (myAccountId) _accounts().then(() => {
    const b = document.createElement('span');
    b.id = 'window-account'; b.textContent = `\u25C8 ${_accountLabel(myAccountId)}`;
    b.title = 'This window is signed in as this account (its own session)';
    document.getElementById('btn-new-tab')?.after(b);
  });

  async function loadBookmarks() {
    try {
      const bks = await _visibleBookmarks();
      if (bks.some(b => b.accountId)) await _accounts();
      const list = document.getElementById('bookmarks-list');
      list.innerHTML = '';
      bks.slice(0, 20).forEach(bk => {
        const btn = document.createElement('button');
        btn.className = 'bk-btn';
        btn.title = [bk.url, bk.accountId ? `account: ${_accountLabel(bk.accountId)}` : null, bk.snapshotId ? 'restores saved page state' : null].filter(Boolean).join('\n');
        if (bk.accountId) { const a = document.createElement('span'); a.className = 'bk-acct'; a.textContent = '\u25C8'; btn.appendChild(a); }
        if (bk.snapshotId) { const st = document.createElement('span'); st.className = 'bk-state'; st.textContent = '\u23EE'; btn.appendChild(st); }
        btn.appendChild(document.createTextNode(bk.title || bk.url));
        btn.addEventListener('click', () => openBookmark(bk));
        list.appendChild(btn);
      });
    } catch (_) {}
  }

  // The ★ dialog — title, the account check list, "remember page state".
  async function openBookmarkDialog() {
    const url = wv.getURL(), title = wv.getTitle();
    if (!url || url === 'about:blank') return;
    document.getElementById('bk-dialog')?.remove();
    const [accounts, all] = await Promise.all([_accounts(true), cg.bookmarks.list({ agentId }).catch(() => [])]);
    const existing = (all || []).find(b => b.url === url);
    let chosen = existing ? (existing.accountId || null) : myAccountId;

    const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); kids.flat().forEach(k => k != null && n.append(k)); return n; };
    const box = el('div', { id: 'bk-dialog', className: 'bk-dialog' });
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Bookmark this page');
    const titleIn = el('input', { type: 'text', value: (existing && existing.title) || title || url, className: 'bk-title' });
    const acctList = el('div', { className: 'bk-accts', role: 'listbox' });
    const paint = () => acctList.querySelectorAll('.bk-acct-opt').forEach(o => {
      const on = (o.dataset.id || null) === chosen;
      o.setAttribute('aria-selected', String(on)); o.querySelector('.tick').textContent = on ? '\u2713' : '';
    });
    const opt = (id, label, sub) => {
      const o = el('button', { type: 'button', className: 'bk-acct-opt' }, el('span', { className: 'tick' }), el('span', { className: 'lbl', textContent: label }), sub ? el('span', { className: 'sub', textContent: sub }) : null);
      o.dataset.id = id || '';
      o.addEventListener('click', () => { chosen = id || null; paint(); stateNote(); });
      return o;
    };
    acctList.append(opt(null, 'No account', 'opens in whichever window you click it'));
    accounts.forEach(a => acctList.append(opt(a.id, a.label, (a.agentKeys || []).join(', ') + (a.id === myAccountId ? ' \u00B7 this window' : ''))));
    const stateIn = el('input', { type: 'checkbox', checked: !!(existing && existing.snapshotId) });
    const note = el('div', { className: 'bk-note' });
    const stateNote = () => { note.textContent = chosen && chosen !== myAccountId
      ? `Opens in ${_accountLabel(chosen)}\u2019s own window, signed in as that account. Page state is saved from this window, so it restores only here.`
      : 'Page state is a rewind snapshot: the URL, sign-in cookies, page storage and scroll position.'; };
    const save = el('button', { type: 'button', className: 'bk-primary', textContent: existing ? 'Save' : 'Add bookmark' });
    const remove = existing ? el('button', { type: 'button', className: 'bk-danger', textContent: 'Remove' }) : null;
    const cancel = el('button', { type: 'button', textContent: 'Cancel' });
    box.append(el('div', { className: 'bk-head', textContent: existing ? 'Edit bookmark' : 'Bookmark this page' }), titleIn,
      el('div', { className: 'bk-label', textContent: 'Account' }), acctList,
      el('label', { className: 'bk-check' }, stateIn, el('span', { textContent: 'Remember page state (rewind)' })), note,
      el('div', { className: 'bk-actions' }, remove, el('span', { className: 'grow' }), cancel, save));
    document.body.appendChild(box);
    const r = document.getElementById('btn-bookmark').getBoundingClientRect();
    box.style.top = `${Math.round(r.bottom + 6)}px`;
    box.style.left = `${Math.round(Math.max(8, Math.min(r.right - box.offsetWidth, window.innerWidth - box.offsetWidth - 8)))}px`;
    paint(); stateNote(); titleIn.focus(); titleIn.select();

    const close = () => { box.remove(); document.removeEventListener('mousedown', outside, true); };
    const outside = (e) => { if (!box.contains(e.target) && e.target.id !== 'btn-bookmark') close(); };
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target === titleIn) save.click(); });
    cancel.addEventListener('click', close);
    remove?.addEventListener('click', async () => {
      await cg.bookmarks.remove({ id: existing.id });
      document.getElementById('btn-bookmark').style.color = '';
      close(); loadBookmarks();
    });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const t = titleIn.value.trim() || title || url;
        let bk, stateError = null;
        if (stateIn.checked && !(existing && existing.snapshotId)) {
          const res = await cg.bookmarks.addWithState({ url, title: t, agentId, accountId: chosen });
          bk = res.bookmark; stateError = res.stateError || null;
        } else {
          bk = (await cg.bookmarks.add({ url, title: t, agentId })).bookmark;
        }
        await cg.bookmarks.linkState({ id: bk.id, accountId: chosen, ...(stateIn.checked ? {} : { snapshotId: null }) });
        document.getElementById('btn-bookmark').style.color = '#f5c842';
        addMsg('assistant', `\u2605 ${existing ? 'Updated' : 'Bookmarked'}: ${t}${chosen ? ` \u00B7 account ${_accountLabel(chosen)}` : ''}${stateIn.checked && !stateError ? ' \u00B7 page state saved' : ''}${stateError ? ` \u00B7 page state not saved: ${stateError}` : ''}`);
        close(); loadBookmarks();
      } catch (e) { save.disabled = false; addMsg('assistant', `Bookmark failed: ${e.message}`); }
    });
  }

  // §BUILD 2026-09-02 — wiring for the new inline #btn-zoom / #zoom-popover
  // (see applyZoom above). Same show/hide-on-outside-click pattern the
  // other url-bar-adjacent panels (bookmark-mgr-panel etc.) already use.
  (function _wireZoomPopover() {
    const btn = document.getElementById('btn-zoom');
    const popover = document.getElementById('zoom-popover');
    if (!btn || !popover) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.style.display = (popover.style.display === 'none') ? 'block' : 'none';
    });
    popover.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.zoom === 'in') applyZoom(_zoomFactor + 0.1);
      else if (b.dataset.zoom === 'out') applyZoom(_zoomFactor - 0.1);
      else applyZoom(1.0);
    }));
    document.addEventListener('click', (e) => {
      if (popover.style.display !== 'none' && !popover.contains(e.target) && e.target !== btn) {
        popover.style.display = 'none';
      }
    });
  })();

  // §0.39.265 — ★ opens the bookmark dialog (add, or edit/remove when already bookmarked)
  document.getElementById('btn-bookmark').addEventListener('click', () => { openBookmarkDialog().catch(e => addMsg('assistant', `Bookmark failed: ${e.message}`)); });

  // §BUILD 2026-08-28 — James: "the three dots, I want to be the menu...
  // the agent window manager moved to the menu with the 3 dots, same
  // with the fingerprint engine." Repurposed the real, existing
  // bookmarks-only dropdown into a real general menu — Zoom (real,
  // wv.setZoomFactor — the same built-in webview API driver/index.js
  // already uses elsewhere, just never exposed to a person before this),
  // the real agent-badge/identity-badge elements moved in via
  // appendChild (same nodes, same ids, same click handlers already
  // wired below and at openIdentityDropdown — nothing recreated, so
  // nothing about their real logic changes), then Bookmarks (unchanged
  // real logic), then Downloads/Settings (call the real, already-named
  // handlers directly rather than duplicating them).
  //
  // §HONEST LIMIT — New Window, History, Passwords, Extensions, Print,
  // Save Page As, Translate Page, and Report Broken Site are NOT in this
  // menu. Checked each directly before deciding: Print (webContents.
  // print()) and New Window (main/index.js's real windows Map) have real
  // backing and could be added later; History, a real Passwords UI
  // (only the vault backend exists, no panel), Extensions-as-a-concept,
  // Translate, and Report Broken Site have no real implementation
  // anywhere in this codebase today — adding menu entries for them would
  // be exactly the "pretends to work" this codebase's own axioms forbid.
  // §BUILD 2026-09-02 — James: "per site zoom, i want it like the 3rd
  // image, inline with the search bar like the bookmarks icon... also
  // remove zoom [from the ⋯ menu]." applyZoom now does two more real
  // things it didn't before: (1) drives the new #btn-zoom readout
  // docked in the url bar instead of (only) the removed ⋯-menu row,
  // hidden at 100% same as Chrome's own native control, and (2) persists
  // per *origin*, not globally, via the real existing site-settings
  // store (site-settings:set 'zoomFactor') — same store the Site
  // Settings panel itself already reads/writes, not a new mechanism.
  // `persist` defaults true; passed false from _restoreZoomForOrigin
  // below so loading a site's saved zoom on navigate doesn't immediately
  // re-write the same value back.
  let _zoomFactor = 1.0;
  let _zoomOrigin = null; // origin the current _zoomFactor was loaded/saved for
  function _updateZoomUi() {
    const pct = Math.round(_zoomFactor * 100) + '%';
    const btn = document.getElementById('btn-zoom');
    const btnPct = document.getElementById('btn-zoom-pct');
    const popoverPct = document.getElementById('zoom-popover-pct');
    if (btnPct) btnPct.textContent = pct;
    if (popoverPct) popoverPct.textContent = pct;
    if (btn) btn.style.display = (_zoomFactor === 1.0) ? 'none' : 'flex';
  }
  function applyZoom(factor, persist = true) {
    _zoomFactor = Math.round(Math.min(3, Math.max(0.25, factor)) * 100) / 100;
    try { wv.setZoomFactor(_zoomFactor); } catch (_) {}
    _updateZoomUi();
    if (persist) {
      try {
        const url = wv.getURL();
        if (url) {
          _zoomOrigin = new URL(url).origin;
          cg.siteSettings.set(url, 'zoomFactor', _zoomFactor).catch(() => {});
        }
      } catch (_) {}
    }
  }
  // Loads (and applies) the saved zoom for whatever origin the webview
  // is currently on. Guarded by _zoomOrigin so an in-page navigation
  // within the same origin (SPA route change, hash change) doesn't fire
  // a redundant IPC round-trip every time updateUrl() runs.
  async function _restoreZoomForOrigin() {
    let url, origin;
    try { url = wv.getURL(); origin = url ? new URL(url).origin : null; } catch (_) { return; }
    if (!origin || origin === _zoomOrigin) return;
    _zoomOrigin = origin;
    let saved = 1.0;
    try { saved = (await cg.siteSettings.get(url, 'zoomFactor')) ?? 1.0; } catch (_) {}
    applyZoom(saved, false);
  }

  // §MERGED 2026-08-30 — James: "remove the command pallet and move
  // everything to the customize toolbar menu." This used to be TWO
  // disconnected pin systems fighting over the same buttons: a
  // localStorage-only one feeding this drag-and-drop editor + the ⋯
  // menu's tool rows, and a separate cg.options-backed one
  // (TOOLBAR_COMMANDS/currentPinned/applyToolbarPins, defined further
  // down where the ex-Spotlight code lives) feeding the Ctrl+K palette's
  // pin toggles. They knew about different sets of buttons (the
  // localStorage one never saw copilot-toggle/btn-bookmark/btn-options;
  // the backend one didn't know how to move the 7 overflow-slot tools
  // out of their permanently-hidden container) and could drift out of
  // sync with each other. One real store now: cg.options's
  // pinnedToolbarButtons, read via currentPinned / TOOLBAR_COMMANDS
  // below. _renderToolMenuRows/_wireToolMenuRows and the toolbar editor
  // both read that same state instead of re-deriving their own.

  // Real icon+label rows for the ⋯ menu, one per currently-unpinned
  // *pinnable* command (matching the existing Downloads/History/Settings
  // row style — .menu-item — instead of the bare glyph buttons this
  // replaces). Palette-only actions (no real toolbar button to unpin)
  // live in the toolbar editor's "Actions" list instead, not here.
  // Clicking a row forwards to the real underlying button's real click
  // handler via activateToolbarCommand rather than reimplementing what
  // any of these tools do.
  function _renderToolMenuRows() {
    const unpinned = TOOLBAR_COMMANDS.filter(c => c.id && c.pinnable && !currentPinned.includes(c.id));
    if (!unpinned.length) return '';
    const rows = unpinned.map(c => `
      <div class="menu-item tool-row" data-tool-menu-id="${c.id}">
        <span class="tool-row-icon">${c.icon}</span><span>${c.label}</span>
      </div>`).join('');
    return `<div class="menu-sep"></div><div class="menu-section"><div class="menu-section-label">Tools</div>${rows}</div>`;
  }
  function _wireToolMenuRows(panel) {
    panel.querySelectorAll('[data-tool-menu-id]').forEach(row => {
      row.addEventListener('click', () => {
        const cmd = TOOLBAR_COMMANDS.find(c => c.id === row.dataset.toolMenuId);
        if (cmd) activateToolbarCommand(cmd);
        panel.style.display = 'none';
      });
    });
  }

  // ── Toolbar editor ("need a toolbar editor", now also the ex-palette's
  //    home — "move everything to the customize toolbar menu") ─────────
  function _renderToolbarEditorActions() {
    // Palette-only commands: no `id` (pure `action`) or a plugin command
    // with no backing DOM element at all — these never had a toolbar
    // button to drag, so they're a click-to-run list, not a drop zone.
    const actions = TOOLBAR_COMMANDS.filter(c => !c.id || (c.pluginId && !document.getElementById(c.id)));
    const list = document.getElementById('te-actions-list');
    if (!actions.length) { list.innerHTML = '<div class="te-zone-drop:empty"></div>'; return; }
    list.innerHTML = actions.map((c, i) => `
      <div class="te-action-row" data-action-index="${i}">
        <span class="te-chip-icon">${c.icon}</span>
        <span class="te-action-label">${c.label}</span>
        <span class="te-action-group">${c.group}</span>
      </div>`).join('');
    list.querySelectorAll('[data-action-index]').forEach(row => {
      row.addEventListener('click', () => activateToolbarCommand(actions[+row.dataset.actionIndex]));
    });
  }
  function _openToolbarEditor() {
    const overlay = document.getElementById('toolbar-editor-overlay');
    const dropToolbar = document.getElementById('te-drop-toolbar');
    const dropMenu = document.getElementById('te-drop-menu');
    dropToolbar.innerHTML = '';
    dropMenu.innerHTML = '';
    TOOLBAR_COMMANDS.filter(c => c.id && c.pinnable).forEach(cmd => {
      const chip = document.createElement('div');
      chip.className = 'te-chip';
      chip.draggable = true;
      chip.dataset.toolId = cmd.id;
      chip.innerHTML = `<span class="te-chip-icon">${cmd.icon}</span><span>${cmd.label}</span>`;
      (currentPinned.includes(cmd.id) ? dropToolbar : dropMenu).appendChild(chip);
    });
    _renderToolbarEditorActions();
    overlay.classList.add('visible');
  }
  function _closeToolbarEditor() {
    document.getElementById('toolbar-editor-overlay').classList.remove('visible');
    // Whatever the toolbar drop zone currently contains when the editor
    // closes IS the new pin set — read straight back off the real DOM
    // rather than tracking a parallel state object that could drift.
    const pinned = Array.from(document.getElementById('te-drop-toolbar').children).map(c => c.dataset.toolId);
    cg.options.set({ pinnedToolbarButtons: pinned })
      .then(() => applyToolbarPins(pinned))
      .catch(err => addMsg('assistant', `Failed to save toolbar layout: ${err.message}`));
  }
  (function _wireToolbarEditorDragDrop() {
    const zones = [document.getElementById('te-drop-toolbar'), document.getElementById('te-drop-menu')];
    document.addEventListener('dragstart', (e) => {
      if (!e.target.classList?.contains('te-chip')) return;
      e.dataTransfer.setData('text/plain', e.target.dataset.toolId);
      e.target.classList.add('dragging');
    });
    document.addEventListener('dragend', (e) => {
      if (e.target.classList?.contains('te-chip')) e.target.classList.remove('dragging');
    });
    zones.forEach(zone => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const chip = document.querySelector(`.te-chip[data-tool-id="${id}"]`);
        if (chip) zone.appendChild(chip);
      });
    });
  })();
  document.getElementById('toolbar-editor-close').addEventListener('click', _closeToolbarEditor);
  document.getElementById('toolbar-editor-done').addEventListener('click', _closeToolbarEditor);
  document.getElementById('toolbar-editor-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'toolbar-editor-overlay') _closeToolbarEditor();
  });
  document.getElementById('toolbar-editor-restore').addEventListener('click', () => {
    // Restore to the backend registry's own defaultPinned set (the same
    // set 'reset-toolbar' below produces) — not an empty pin list, which
    // would silently disagree with what a fresh install actually ships
    // pinned (copilot-toggle, btn-bookmark).
    const defaults = TOOLBAR_COMMANDS.filter(c => c.pinnable && c.defaultPinned).map(c => c.id);
    cg.options.set({ pinnedToolbarButtons: defaults })
      .then(() => { applyToolbarPins(defaults); _openToolbarEditor(); })
      .catch(err => addMsg('assistant', `Failed to reset toolbar: ${err.message}`));
  });

  // The Library window (renderer/library.html) — opened in the main process by
  // openLibraryWindow(), the same function the tray and Ctrl+J use.
  async function _openLibrary(area) {
    try {
      const r = await cg.window.openLibrary(area);
      if (r && r.ok === false) throw new Error(r.error || 'not opened');
    } catch (err) { console.error(`[menu] could not open the Library: ${err.message}`); toast(`Could not open the Library: ${err.message}`, 'error', 6000); }
  }
  document.getElementById('bookmark-mgr-btn').addEventListener('click', async (e) => {
    const panel = document.getElementById('bookmark-mgr-panel');
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    const rect = e.target.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.innerHTML = `
      <div id="menu-agent-identity-target"></div>
      <div class="menu-sep"></div>
      <div class="menu-section">
        <div class="menu-section-label">Bookmarks</div>
        <div id="menu-bookmarks-list"><div style="padding:6px 4px;color:var(--text-dim,#999);font-size:11px">loading…</div></div>
      </div>
      <div class="menu-sep"></div>
      <div class="menu-item" data-action="downloads">⬇ Downloads <span class="menu-kbd">Ctrl+J</span></div>
      <div class="menu-item" data-action="site-settings">🛡 Site Settings</div>
      <div class="menu-item" data-action="history">🕐 History</div>
      <div class="menu-item" data-action="library">📚 Library</div>
      <div class="menu-item" data-action="bgtabs">⬡ Background Tabs</div>
      <!-- §REMOVED 2026-09-25 — this used to be a hardcoded "☰ Settings"
           row that actually opened the Nexus Options panel (openOptionsPanel,
           same destination as the btn-options toolbar button), not the real
           Settings window. It duplicated btn-options's own row below
           (_renderToolMenuRows renders "☰ Nexus Options" once that button
           is unpinned) under a DIFFERENT, colliding label — the real cause
           of James finding two different things both called "Settings"
           doing two different things. Deleted rather than relabeled: the
           real Nexus Options access already exists via the toolbar button
           and its Tools row here; a real, single, unambiguous "Settings"
           entry (→ cg.window.openSettings(), the actual Settings window)
           now lives at btn-settings, in this same Tools row list. -->
      ${_renderToolMenuRows()}
      <div class="menu-sep"></div>
      <div class="menu-item" data-action="customize-toolbar">🧰 Customize Toolbar…</div>
    `;
    panel.style.display = 'block';
    _wireToolMenuRows(panel);
    panel.querySelector('[data-action="customize-toolbar"]').addEventListener('click', () => {
      panel.style.display = 'none';
      _openToolbarEditor();
    });

    // Move the real, unchanged agent/identity elements into the now-open
    // menu. Same nodes — appendChild relocates, it doesn't clone, so
    // every existing addEventListener on them (below, and at
    // openIdentityDropdown) keeps working exactly as before.
    const slot = document.getElementById('menu-agent-identity-slot');
    const target = document.getElementById('menu-agent-identity-target');
    if (slot && target) { target.appendChild(slot); slot.style.display = ''; }

    panel.querySelector('[data-action="downloads"]').addEventListener('click', () => {
      panel.style.display = 'none';
      _openLibrary('downloads');
    });
    panel.querySelector('[data-action="site-settings"]').addEventListener('click', () => {
      panel.style.display = 'none';
      _openPanelFromMenu('site-settings-panel', _renderSiteSettingsPanel);
    });
    panel.querySelector('[data-action="history"]').addEventListener('click', () => {
      panel.style.display = 'none';
      _openPanelFromMenu('history-panel', () => _renderHistoryPanel(''));
    });
    // §LIBRARY 0.39.240 → 0.39.241 — James: "also needs to be clearglass library... added to
    // the 3 lines menu", then "the settings ui but with the library". Same window as
    // the tray entry and Ctrl+J: openLibraryWindow() in src/main/index.js.
    panel.querySelector('[data-action="library"]').addEventListener('click', () => {
      panel.style.display = 'none';
      _openLibrary();
    });
    panel.querySelector('[data-action="bgtabs"]').addEventListener('click', () => {
      panel.style.display = 'none';
      _openPanelFromMenu('bgtabs-panel', _renderBgTabsPanel);
    });
    const listEl = document.getElementById('menu-bookmarks-list');
    try {
      const list = await _visibleBookmarks();
      if (!list || !list.length) {
        listEl.innerHTML = '<div style="padding:6px 4px;color:var(--text-dim,#999);font-size:11px">No bookmarks yet — click the ★ in the search bar to add one.</div>';
        return;
      }
      listEl.innerHTML = list.map(b => `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 4px;border-bottom:1px solid var(--border,#333)">
          <span data-visit="${b.id}" style="flex:1;cursor:pointer;font-size:11px;color:var(--text,#ccc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.url.replace(/"/g,'&quot;')}">${(b.title || b.url).replace(/</g,'&lt;')}</span>
          <span data-remove="${b.id}" style="cursor:pointer;opacity:.5;font-size:12px" title="Remove">✕</span>
        </div>`).join('');
      listEl.querySelectorAll('[data-visit]').forEach(el => el.addEventListener('click', async () => {
        const bk = list.find(b => b.id === el.dataset.visit);
        if (bk) { panel.style.display = 'none'; await openBookmark(bk); }
      }));
      listEl.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await cg.bookmarks.remove({ id: el.dataset.remove, agentId });
        el.closest('div').remove();
        loadBookmarks?.();
      }));
    } catch (err) {
      listEl.innerHTML = `<div style="padding:6px 4px;color:#ff6b6b;font-size:11px">Error: ${err.message}</div>`;
    }
  });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('bookmark-mgr-panel');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target.id !== 'bookmark-mgr-btn') {
      // Put the real agent/identity elements back into their hidden home
      // before closing, so they're not silently lost from the DOM if the
      // menu is never reopened before the next reference to them.
      const slot = document.getElementById('menu-agent-identity-slot');
      if (slot && slot.parentElement?.id === 'menu-agent-identity-target') {
        slot.style.display = 'none';
        document.querySelector('#chrome').insertBefore(slot, document.querySelector('#chrome .chrome-divider'));
      }
      panel.style.display = 'none';
    }
  });

  // §BUILD 2026-08-28 — James: "hot keys for clearglass, like control
  // plus and minus to zoom." Real accelerator, not a suggestion — Ctrl/
  // Cmd +, -, and 0 (reset), matching the exact convention every major
  // browser already uses, wired to the same real applyZoom()/
  // setZoomFactor() the menu's own +/− buttons use — one implementation.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(_zoomFactor + 0.1); }
    else if (e.key === '-') { e.preventDefault(); applyZoom(_zoomFactor - 0.1); }
    else if (e.key === '0') { e.preventDefault(); applyZoom(1.0); }
  });

  // §BUILD 2026-08-29 — James: "control and scroll wheel. all the
  // hot keys chrome and firefox have." Real accelerators, matching
  // each real browser's own convention exactly, wired to the same real
  // functions their toolbar/menu equivalents already use — one
  // implementation per action, not a second copy for the shortcut.
  //
  // §HONEST LIMIT — NOT built: Ctrl+Shift+Delete clear-browsing-data
  // (no single real "clear everything" flow exists to hook into —
  // history/downloads/cookies each clear separately today; wiring one
  // hotkey to all of them would be inventing a feature, not exposing
  // one that's already real).
  // §RESOLVED 2026-08-30 — F11 fullscreen used to be listed here as a
  // second honest limit (no real setFullScreen IPC existed). That IPC
  // is now real (main/index.js's toggleFullscreenAgentWindow, bridged
  // via window:fullscreen, exposed as cg.window.fullscreen) — wired
  // below like every other real hotkey in this block, not left here.
  wv.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    applyZoom(_zoomFactor + (e.deltaY < 0 ? 0.1 : -0.1));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === 'F5') { e.preventDefault(); wv.reload(); }
      // §BUILD 2026-08-30 — real F11 fullscreen, no modifier key, same
      // convention every real browser uses. cg.window.fullscreen toggles
      // the real BrowserWindow via the new window:fullscreen IPC.
      if (e.key === 'F11') { e.preventDefault(); cg.window.fullscreen(agentId); }
      return;
    }
    switch (e.key) {
      case 't': case 'T':
        // §BUILD 2026-08-30 — Ctrl+Shift+T (reopen closed tab), a real
        // Chrome/Firefox binding that was missing — separate branch from
        // plain Ctrl+T, matching how both real browsers treat these as
        // two distinct bindings rather than one with a modifier flag.
        e.preventDefault();
        if (e.shiftKey) _tabs.reopenClosed(); else _tabs.newTab();
        break;
      case 'w': case 'W':
        e.preventDefault(); _tabs.closeTab(_tabs.activeId); break;
      case 'Tab': {
        e.preventDefault();
        const ids = _tabs.tabs.map(t => t.id);
        const i = ids.indexOf(_tabs.activeId);
        const next = e.shiftKey ? (i - 1 + ids.length) % ids.length : (i + 1) % ids.length;
        _tabs.switchTo(ids[next]);
        break;
      }
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (_tabs.tabs[idx]) _tabs.switchTo(_tabs.tabs[idx].id);
        break;
      }
      case '9': {
        // Real Chrome/Firefox convention: Ctrl+9 always jumps to the
        // LAST tab, not literally "tab 9".
        e.preventDefault();
        const last = _tabs.tabs[_tabs.tabs.length - 1];
        if (last) _tabs.switchTo(last.id);
        break;
      }
      case 'l': case 'L':
        e.preventDefault(); urlBar.focus(); urlBar.select(); break;
      case 'r': case 'R':
        e.preventDefault(); wv.reload(); break;
      case 'd': case 'D':
        e.preventDefault(); document.getElementById('btn-bookmark').click(); break;
      case 'h': case 'H':
        e.preventDefault(); _openPanelFromMenu('history-panel', () => _renderHistoryPanel('')); break;
      // Ctrl+J (Library → Downloads) is taken in the main process for every web
      // contents — this window and the page inside it — so it never reaches here.
      case 'p': case 'P':
        e.preventDefault(); cg.driver.exec({ action: 'print', agentId }); break;
    }
  });

  // Alt+Left / Alt+Right — real browser back/forward convention,
  // separate from Ctrl+ since Alt is the real cross-browser standard
  // for history navigation (Ctrl+Left/Right is reserved for word-
  // jumping inside text fields in both Chrome and Firefox).
  window.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (wv.canGoBack()) wv.goBack(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (wv.canGoForward()) wv.goForward(); }
  });

  // ── Keyboard shortcuts — §0.39.265 ─────────────────────────────────────
  // The main process catches every shortcut (in this chrome AND inside the
  // page — src/main/index.js, bindings from src/shortcuts/registry.js plus
  // Settings › Keyboard shortcuts) and sends this window the browser actions.
  // Each action calls the same function its button or menu item uses.
  let _recordingMacro = false;
  async function _shortcutAutofill() {
    const [settings, profiles] = await Promise.all([cg.api.get().catch(() => ({})), cg.autofill.listProfiles().catch(() => [])]);
    const pid = settings.screenQaProfileId || (profiles && profiles[0] && profiles[0].id);
    if (!pid) { addMsg('assistant', 'Autofill: add a profile in Settings \u203A Autofill & answers first.'); return; }
    const r = await cg.autofill.fill(pid, agentId).catch(e => ({ error: e.message }));
    addMsg('assistant', r && r.error ? `Autofill: ${r.error}` : `Autofill: ${(r && (r.filled ?? (r.results || []).length)) || 0} field(s) filled.`);
  }
  const SHORTCUT_ACTIONS = {
    'tab.new':        () => _tabs.newTab(),
    'tab.close':      () => _tabs.closeTab(_tabs.activeId),
    'tab.reopen':     () => _tabs.reopenClosed(),
    'tab.next':       () => { const ids = _tabs.tabs.map(t => t.id); _tabs.switchTo(ids[(ids.indexOf(_tabs.activeId) + 1) % ids.length]); },
    'tab.prev':       () => { const ids = _tabs.tabs.map(t => t.id); _tabs.switchTo(ids[(ids.indexOf(_tabs.activeId) - 1 + ids.length) % ids.length]); },
    'tab.last':       () => { const last = _tabs.tabs[_tabs.tabs.length - 1]; if (last) _tabs.switchTo(last.id); },
    'page.reload':    () => wv.reload(),
    'page.back':      () => { if (wv.canGoBack()) wv.goBack(); },
    'page.forward':   () => { if (wv.canGoForward()) wv.goForward(); },
    'page.find':      () => openFindBar(),
    'page.print':     () => cg.driver.exec({ action: 'print', agentId }),
    'page.zoomIn':    () => applyZoom(_zoomFactor + 0.1),
    'page.zoomOut':   () => applyZoom(_zoomFactor - 0.1),
    'page.zoomReset': () => applyZoom(1.0),
    'page.address':   () => { urlBar.focus(); urlBar.select(); },
    'page.fullscreen':() => cg.window.fullscreen(agentId),
    'cg.bookmark':    () => document.getElementById('btn-bookmark').click(),
    'cg.history':     () => _openPanelFromMenu('history-panel', () => _renderHistoryPanel('')),
    'cg.copilot':     () => copilotToggle && copilotToggle.click(),
    'cg.rewind':      () => document.getElementById('btn-rewind')?.click(),
    'cg.picker':      () => pickerBtn.click(),
    'cg.autofill':    () => _shortcutAutofill(),
    'cg.macroRecord': async () => {
      if (!_recordingMacro) {
        const r = await cg.macros.recordStart(agentId).catch(e => ({ error: e.message }));
        if (r && r.error) return addMsg('assistant', `Recording: ${r.error}`);
        _recordingMacro = true; addMsg('assistant', '\u25CF Recording a macro \u2014 press the shortcut again to stop.');
      } else {
        _recordingMacro = false;
        const r = await cg.macros.recordStop(agentId).catch(e => ({ error: e.message }));
        addMsg('assistant', r && r.error ? `Recording: ${r.error}` : `Recording stopped${r && r.steps ? ` \u2014 ${r.steps.length} step(s)` : ''}. Save it in Settings \u203A Macros.`);
      }
    },
  };
  cg.shortcuts?.onAction(({ action, result }) => {
    if (result) { addMsg('assistant', result.ok === false ? `Shortcut: ${result.error}` : result.text || 'Done.'); return; }
    const fn = SHORTCUT_ACTIONS[action];
    if (!fn) return;
    Promise.resolve().then(fn).catch(e => addMsg('assistant', `Shortcut failed: ${e.message}`));
  });

  // §LIBRARY 0.39.241 — the Downloads dropdown that lived here (2026-08-24, with
  // its Download Listeners form from 2026-08-28) is replaced by the Library
  // window's Downloads area (renderer/library/sections/downloads.js), which has
  // the file list and the listeners. Ctrl+J and ☰ → Downloads open it.

  // §NEW 2026-08-24 — real per-site settings panel. Lists every origin
  // with at least one stored setting (currently written by the
  // permissions plugin as 'permission:<type>': 'allow'|'deny') and lets
  // a person clear one setting or every setting for an origin — real
  // read/write against the real store, no separate UI-only state.
  function _humanizeSettingKey(key) {
    if (key.startsWith('permission:')) return `Permission: ${key.slice('permission:'.length)}`;
    return key;
  }
  async function _renderSiteSettingsPanel() {
    const panel = document.getElementById('site-settings-panel');
    panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">loading…</div>';
    try {
      const origins = await cg.siteSettings.listOrigins();
      if (!origins || !origins.length) {
        panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">No site settings saved yet.</div>';
        return;
      }
      const perOrigin = await Promise.all(origins.map(async (origin) => ({ origin, settings: await cg.siteSettings.getAll(origin) })));
      panel.innerHTML = perOrigin.map(({ origin, settings }) => `
        <div style="padding:6px 4px;border-bottom:1px solid var(--border,#333)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11px;color:var(--text,#ccc);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${origin.replace(/</g, '&lt;')}</span>
            <span data-clear-origin="${origin}" style="cursor:pointer;font-size:10px;color:var(--text-dim,#999)">clear all</span>
          </div>
          ${Object.entries(settings).map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:10px;color:var(--text-dim,#999)">
              <span>${_humanizeSettingKey(k)}: <b style="color:${v === 'allow' ? '#6bcf6b' : '#ff6b6b'}">${v}</b></span>
              <span data-clear-key="${origin}|||${k}" style="cursor:pointer;opacity:.6">✕</span>
            </div>`).join('')}
        </div>`).join('');
      panel.querySelectorAll('[data-clear-origin]').forEach(el => el.addEventListener('click', async () => {
        await cg.siteSettings.clear(el.dataset.clearOrigin);
        _renderSiteSettingsPanel();
      }));
      panel.querySelectorAll('[data-clear-key]').forEach(el => el.addEventListener('click', async () => {
        const [origin, key] = el.dataset.clearKey.split('|||');
        await cg.siteSettings.deleteKey(origin, key);
        _renderSiteSettingsPanel();
      }));
    } catch (err) {
      panel.innerHTML = `<div style="padding:8px;color:#ff6b6b;font-size:11px">Error: ${err.message}</div>`;
    }
  }
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('site-settings-panel');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && !e.target.closest('#bookmark-mgr-panel')) panel.style.display = 'none';
  });

  // §PORTED 2026-08-29 — real history panel (from the now-diverged
  // branch this was originally built and tested on). Opened from the
  // general menu now, not a standalone toolbar button.
  async function _renderHistoryPanel(query) {
    const panel = document.getElementById('history-panel');
    try {
      const items = await cg.history.list({ agentId, query: query || undefined, limit: 100 });
      const listHtml = !items.length
        ? '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">No history yet.</div>'
        : items.map(i => `
          <div style="display:flex;align-items:center;gap:6px;padding:5px 4px;border-bottom:1px solid var(--border,#333)">
            <span data-open="${i.id}" data-url="${i.url.replace(/"/g, '&quot;')}" style="flex:1;cursor:pointer;overflow:hidden">
              <div style="font-size:11px;color:var(--text,#ccc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.title.replace(/</g, '&lt;')}</div>
              <div style="font-size:10px;color:var(--text-dim,#999);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.url.replace(/</g, '&lt;')}${i.visitCount > 1 ? ` · ${i.visitCount} visits` : ''}</div>
            </span>
            <span data-remove="${i.id}" style="cursor:pointer;opacity:.5;font-size:11px" title="Remove">✕</span>
          </div>`).join('');
      panel.innerHTML = `
        <div style="display:flex;gap:4px;padding:2px 2px 6px">
          <input id="history-search" type="text" placeholder="Search history..." value="${(query || '').replace(/"/g, '&quot;')}" style="flex:1;background:var(--bg1,#0a0a0a);border:1px solid var(--border,#333);color:var(--text,#ccc);border-radius:4px;padding:3px 6px;font-size:11px" />
          <span id="history-clear-all" style="cursor:pointer;font-size:10px;color:var(--text-dim,#999);align-self:center;white-space:nowrap">clear all</span>
        </div>
        ${listHtml}`;
      const search = document.getElementById('history-search');
      search.addEventListener('input', () => _renderHistoryPanel(search.value));
      search.focus();
      search.selectionStart = search.selectionEnd = search.value.length;
      panel.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => {
        navigate(el.dataset.url);
        panel.style.display = 'none';
      }));
      panel.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await cg.history.delete(el.dataset.remove);
        _renderHistoryPanel(document.getElementById('history-search')?.value);
      }));
      document.getElementById('history-clear-all').addEventListener('click', async () => {
        await cg.history.clear();
        _renderHistoryPanel('');
      });
    } catch (err) {
      panel.innerHTML = `<div style="padding:8px;color:#ff6b6b;font-size:11px">Error: ${err.message}</div>`;
    }
  }
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('history-panel');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && !e.target.closest('#bookmark-mgr-panel')) panel.style.display = 'none';
  });

  // §removed 2026-09-02 — James: "Remove the Extensions menu item/panel
  // until it's built, per this codebase's own stated discipline of not
  // shipping menu entries with nothing behind them." Confirmed before
  // removing: no store, no IPC handler, nothing anywhere in src/ backed
  // this — cg.extensions was never real at any layer (unlike history,
  // which had a real backend just missing from preload). Menu item,
  // click wiring, and this panel's render function all removed together
  // rather than leaving a partially-dead panel with nothing that opens
  // it. #extensions-panel's now-orphaned container div in browser.html
  // and .js:2008's leftover outside-click-to-close listener for it were
  // removed with it — same reasoning as this comment, not separate.
  // If real extension loading (Electron's session.loadExtension() for
  // unpacked Chrome extensions, the same real API Chrome DevTools-style
  // "Load unpacked" uses) gets built later, this is a clean re-add: same
  // menu-item pattern as Downloads/History/Site Settings above.
  // §BUILD 2026-08-30 — real background-tab manager, James: "need a
  // background tab manager." Real gap found: cg.bgTabs.open()/close()/
  // list() were already fully wired end to end on the backend (checked
  // directly — bgtab:open/close/list, not a broken-wiring bug), but
  // listBackgroundTabs() only ever returned {agentId}, and nothing
  // rendered even that. Fixed the backend to also track each tab's real
  // url (a separate small map, not restructuring bgTabs' existing
  // shape other real code depends on) and built this panel around it.
  async function _renderBgTabsPanel() {
    const panel = document.getElementById('bgtabs-panel');
    panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">loading…</div>';
    try {
      const tabs = await cg.bgTabs.list();
      const listHtml = !tabs.length
        ? '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">No background tabs open.</div>'
        : tabs.map(t => `
          <div style="display:flex;align-items:center;gap:6px;padding:6px 4px;border-bottom:1px solid var(--border,#333)">
            <span style="flex:1;overflow:hidden">
              <div style="font-size:11px;color:var(--text,#ccc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(t.url || '(no url)').replace(/</g, '&lt;')}</div>
              <div style="font-size:9px;color:var(--text-dim,#999)">${t.agentId}</div>
            </span>
            <span data-bgtab-close="${t.agentId}" style="cursor:pointer;opacity:.6;font-size:11px" title="Close">✕</span>
          </div>`).join('');
      panel.innerHTML = `
        <div style="display:flex;gap:4px;padding:2px 2px 6px">
          <input id="bgtabs-new-url" type="text" placeholder="https://... (open in background)" style="flex:1;background:var(--bg1,#0a0a0a);border:1px solid var(--border,#333);color:var(--text,#ccc);border-radius:4px;padding:3px 6px;font-size:11px" />
          <button id="bgtabs-open-btn" style="font-size:11px;padding:0 8px;background:var(--bg1,#0a0a0a);border:1px solid var(--border,#333);color:var(--text,#ccc);border-radius:4px;cursor:pointer">+</button>
        </div>
        ${listHtml}`;
      document.getElementById('bgtabs-open-btn').addEventListener('click', async () => {
        const url = document.getElementById('bgtabs-new-url').value.trim();
        if (!url) return;
        await cg.bgTabs.open({ url });
        _renderBgTabsPanel();
      });
      panel.querySelectorAll('[data-bgtab-close]').forEach(el => el.addEventListener('click', async () => {
        await cg.bgTabs.close(el.dataset.bgtabClose);
        _renderBgTabsPanel();
      }));
    } catch (err) {
      panel.innerHTML = `<div style="padding:8px;color:#ff6b6b;font-size:11px">Error: ${err.message}</div>`;
    }
  }
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('bgtabs-panel');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && !e.target.closest('#bookmark-mgr-panel')) panel.style.display = 'none';
  });

  // §PORTED 2026-08-29 — shared open-from-menu helper: positions a panel
  // relative to the general menu button (since History/Extensions/Site
  // Settings no longer have their own standalone toolbar buttons to
  // position relative to) and calls the matching real render function.
  function _openPanelFromMenu(panelId, renderFn) {
    const panel = document.getElementById(panelId);
    const btn = document.getElementById('bookmark-mgr-btn');
    const rect = btn.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.style.display = 'block';
    renderFn();
  }


  // §NEW 2026-08-24 — real find-in-page bar, using the new real driver
  // actions (findInPage/stopFindInPage — Electron's actual webContents
  // API) via the new _execAndAwait helper, since a fire-and-forget call
  // can't report a real match count back.
  function openFindBar() {
    const bar = document.getElementById('find-bar');
    bar.style.display = 'flex';
    const input = document.getElementById('find-input');
    input.focus();
    input.select();
  }
  function closeFindBar() {
    document.getElementById('find-bar').style.display = 'none';
    document.getElementById('find-count').textContent = '0/0';
    _execAndAwait('stopFindInPage', { action: 'clearSelection' }).catch(() => {});
  }
  async function _doFind(findNext) {
    const text = document.getElementById('find-input').value;
    const countEl = document.getElementById('find-count');
    if (!text) { countEl.textContent = '0/0'; return; }
    try {
      const r = await _execAndAwait('findInPage', { text, findNext, forward: true });
      countEl.textContent = `${r.activeMatchOrdinal || 0}/${r.matches || 0}`;
    } catch (err) {
      countEl.textContent = 'err';
    }
  }
  document.getElementById('find-input').addEventListener('input', () => _doFind(false));
  document.getElementById('find-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _doFind(true);
    if (e.key === 'Escape') closeFindBar();
  });
  document.getElementById('find-next').addEventListener('click', () => _doFind(true));
  document.getElementById('find-prev').addEventListener('click', async () => {
    const text = document.getElementById('find-input').value;
    if (!text) return;
    try {
      const r = await _execAndAwait('findInPage', { text, findNext: true, forward: false });
      document.getElementById('find-count').textContent = `${r.activeMatchOrdinal || 0}/${r.matches || 0}`;
    } catch (_) {}
  });
  document.getElementById('find-close').addEventListener('click', closeFindBar);

  // Real Ctrl+F / Cmd+F shortcut, matching every real browser's convention
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && document.getElementById('find-bar').style.display === 'none') {
      e.preventDefault();
      openFindBar();
    }
  });


  // Update bookmark star on navigation
  wv.addEventListener('did-stop-loading', async () => {
    const url = wv.getURL();
    if (url && url !== 'about:blank') {
      try {
        const isMarked = await cg.bookmarks.check({ url, agentId });
        document.getElementById('btn-bookmark').style.color = isMarked ? '#f5c842' : '';
      } catch (_) {}
    }
  });

  // Load bookmarks on boot
  loadBookmarks();

  // ── Rewind ─────────────────────────────────────────────────────────────
  let rewindVisible = false;

  async function loadRewindList() {
    try {
      const snaps = await cg.rewind.list(agentId, 20) || [];
      const list  = document.getElementById('rewind-list');
      if (!snaps.length) {
        list.innerHTML = '<span style="color:var(--text-dim);font-size:10px;padding:8px;">No snapshots yet. Browse a page to start recording.</span>';
        return;
      }
      list.innerHTML = '';
      snaps.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'rewind-item';
        const ago = Math.round((Date.now() - s.ts) / 60000);
        // §NEW 2026-08-24 — reconciles the browser UI with macro.js's
        // real, already-tested bookmark(a)/openBookmark(a) agent tool
        // (lib/agent-tools/tools/clear-glass/macro.js), which has always
        // saved named state-bookmarks as rewind snapshots labeled
        // 'bookmark:<name>' — real and working, but only ever reachable
        // via an agent tool call, never visible here. Same label
        // convention, read directly from macro.js before writing this,
        // not guessed — a snapshot saved via the agent tool now shows up
        // here correctly, and one saved here is findable by the agent
        // tool too, since both read/write the exact same rewind engine.
        // §FOUND & FIXED 2026-09-06 — adversarial audit continued into
        // clear-glass (5th of 7), James: "be efficient with tokens" —
        // fixing the highest-value real site only (real, external
        // webpage title/url from browsing history — a page's own
        // <title> could inject here), same real pattern already proven
        // in BrainOS this session.
        const _eh = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const isBookmark = typeof s.label === 'string' && s.label.startsWith('bookmark:');
        const label = isBookmark
          ? `🔖 ${_eh(s.label.slice('bookmark:'.length))}`
          : (s.label === 'auto' ? '' : (s.label === 'manual' ? '' : ' • ' + _eh(s.label)));
        div.innerHTML = `<div class="ri-title">${_eh(s.title || s.url)}</div>
          <div class="ri-url">${_eh(s.url)}</div>
          <div class="ri-ts">${ago < 1 ? 'just now' : ago + 'm ago'}${label ? ' • ' + label : ''}</div>`;
        div.addEventListener('click', async () => {
          document.getElementById('rewind-panel').classList.remove('visible');
          rewindVisible = false;
          await cg.rewind.restore({ agentId, snapshotId: s.id });
        });
        list.appendChild(div);
      });
    } catch (_) {}
  }

  document.getElementById('btn-rewind').addEventListener('click', async () => {
    rewindVisible = !rewindVisible;
    document.getElementById('rewind-panel').classList.toggle('visible', rewindVisible);
    if (rewindVisible) await loadRewindList();
  });

  document.getElementById('rewind-close').addEventListener('click', () => {
    rewindVisible = false;
    document.getElementById('rewind-panel').classList.remove('visible');
  });

  document.getElementById('rewind-snap-btn').addEventListener('click', async () => {
    await cg.rewind.snapshot(agentId, { label: 'manual' });
    await loadRewindList();
    addMsg('assistant', '📍 Snapshot saved.');
  });

  // §NEW 2026-08-24 — real, named state bookmark, using the exact same
  // 'bookmark:<name>' label convention as macro.js's bookmark(a) agent
  // tool (checked directly before writing this). window.prompt is a
  // real, working, if unpolished, way to collect the name — this
  // codebase has no existing custom modal-input helper to reuse instead,
  // and building one is a real, separate, scoped UI task, not silently
  // done as a side effect of wiring the label convention through.
  document.getElementById('rewind-bookmark-btn').addEventListener('click', async () => {
    const name = window.prompt('Name this state bookmark (captures cookies, storage, and scroll position):');
    if (!name) return; // real cancel — no snapshot taken, matches every other cancel-prompt convention in this file
    await cg.rewind.snapshot(agentId, { label: `bookmark:${name}` });
    await loadRewindList();
    addMsg('assistant', `🔖 State bookmark "${name}" saved — click it in ⏮ Session Rewind any time to jump back, cookies/storage/scroll and all.`);
  });

  // ── Provider panel ─────────────────────────────────────────────────────
  let providerVisible = false;

  async function loadProviders() {
    try {
      const providers = await cg.providers.list() || [];
      const list      = document.getElementById('provider-list');
      list.innerHTML  = '';
      providers.forEach(p => {
        const item = document.createElement('div');
        item.className = 'prov-item';
        item.innerHTML = `
          <div class="prov-dot ${p.hosted ? 'active' : ''}"></div>
          <span class="prov-name">${p.name}</span>
          <button class="prov-btn ${p.hosted ? 'active' : ''}" data-id="${p.id}">
            ${p.hosted ? 'Show' : 'Start'}
          </button>`;
        item.querySelector('button').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (p.hosted) {
            await cg.providers.show(p.id);
          } else {
            addMsg('assistant', `Starting ${p.name} provider...`);
            try {
              await cg.providers.start(p.id, { show: true });
              addMsg('assistant', `✓ ${p.name} NCP provider active.`);
            } catch (err) {
              addMsg('assistant', `Failed to start ${p.name}: ${err.message}`);
            }
          }
          await loadProviders();
        });
        list.appendChild(item);
      });
    } catch (_) {}
  }

  document.getElementById('btn-providers').addEventListener('click', async () => {
    providerVisible = !providerVisible;
    document.getElementById('provider-panel').classList.toggle('visible', providerVisible);
    if (providerVisible) await loadProviders();
  });

  // SSE events for provider state changes
  es.addEventListener('provider.host.started', () => { if (providerVisible) loadProviders(); });
  es.addEventListener('provider.host.stopped', () => { if (providerVisible) loadProviders(); });

  // SSE events for bookmark changes
  es.addEventListener('bookmarks.added',   () => loadBookmarks());
  es.addEventListener('bookmarks.removed', () => loadBookmarks());

  // SSE events for rewind
  es.addEventListener('rewind.snapshotted', () => { if (rewindVisible) loadRewindList(); });

  // SSE events for userscripts
  es.addEventListener('userscript.injected', (e) => {
    const d = JSON.parse(e.data);
    if (d.agentId === agentId) addMsg('assistant', `⚙ Script injected: ${d.name}`);
  });
  es.addEventListener('userscript.auto-injected', (e) => {
    const d = JSON.parse(e.data);
    if (d.agentId === agentId && d.count > 0)
      addMsg('assistant', `⚙ ${d.count} userscript(s) auto-injected on ${d.url}`);
  });

  // ── Userscript manager ─────────────────────────────────────────────────
  let usVisible = false;

  async function loadUserscripts() {
    try {
      const scripts = await cg.userscripts.list({ agentId }) || [];
      const list    = document.getElementById('us-list');
      if (!scripts.length) {
        list.innerHTML = '<div style="padding:12px;font-size:10px;color:var(--text-dim);">No userscripts. Guardian scripts load automatically when GUARDIAN_DIR is set.</div>';
        return;
      }
      list.innerHTML = '';
      scripts.forEach(s => {
        const div = document.createElement('div');
        div.className = 'us-item';
        div.innerHTML = `
          <span class="us-type">${s.type === 'guardian' ? '⟳' : '⚙'}</span>
          <span class="us-name" title="${s.matches?.join(', ')}">${s.name}</span>
          <button class="us-edit-btn" data-id="${s.id}">${s.readOnly ? 'View' : 'Edit'}</button>
          <button class="us-inject-btn" data-id="${s.id}" ${s.readOnly ? '' : ''}>Inject</button>
          <button class="us-toggle ${s.enabled ? 'on' : ''}" data-id="${s.id}" title="${s.enabled ? 'Disable' : 'Enable'}"></button>`;
        div.querySelector('.us-inject-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await cg.userscripts.inject(agentId, s.id);
          } catch (err) { addMsg('assistant', `Script inject error: ${err.message}`); }
        });
        div.querySelector('.us-toggle').addEventListener('click', async (e) => {
          e.stopPropagation();
          await cg.userscripts.toggle(s.id, !s.enabled);
          loadUserscripts();
        });
        div.querySelector('.us-edit-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          openUserscriptEditor(s);
        });
        list.appendChild(div);
      });
    } catch (_) {}
  }

  // ── Userscript editor modal — real edit()/create()/delete(), built
  // 2026-09-11. openUserscriptEditor(script) for editing/viewing an
  // existing script (script.readOnly disables every field and hides
  // Save/Delete — matches UserscriptManager's own server-side enforcement,
  // this just avoids offering a control that would throw); called with
  // no argument for the "+ New script" flow instead.
  let _usEditingId = null;
  let _usEditingReadOnly = false;

  function openUserscriptEditor(script) {
    _usEditingId = script ? script.id : null;
    _usEditingReadOnly = !!(script && script.readOnly);

    document.getElementById('us-editor-title').textContent = script ? (script.readOnly ? 'View Userscript' : 'Edit Userscript') : 'New Userscript';
    document.getElementById('us-editor-readonly-badge').style.display = _usEditingReadOnly ? '' : 'none';
    document.getElementById('us-editor-name').value = script ? script.name : '';
    document.getElementById('us-editor-name').disabled = !!script; // name isn't editable post-creation — UserscriptManager.edit() only touches source/matches/enabled
    document.getElementById('us-editor-matches').value = script ? (script.matches || []).join(', ') : '*';
    document.getElementById('us-editor-matches').disabled = _usEditingReadOnly;
    document.getElementById('us-editor-source').disabled = _usEditingReadOnly;
    document.getElementById('us-editor-save').style.display = _usEditingReadOnly ? 'none' : '';
    document.getElementById('us-editor-delete').style.display = (script && !script.readOnly) ? '' : 'none';

    const srcEl = document.getElementById('us-editor-source');
    srcEl.value = script ? '⟳ loading…' : '';
    document.getElementById('us-editor-modal').classList.add('visible');

    if (script) {
      cg.userscripts.source(script.id).then(src => { srcEl.value = src || ''; })
        .catch(err => { srcEl.value = `// failed to load source: ${err.message}`; });
    }
  }

  function closeUserscriptEditor() {
    document.getElementById('us-editor-modal').classList.remove('visible');
    _usEditingId = null;
  }

  document.getElementById('us-editor-close').addEventListener('click', closeUserscriptEditor);
  document.getElementById('us-editor-cancel').addEventListener('click', closeUserscriptEditor);
  document.getElementById('us-editor-modal').addEventListener('click', (e) => {
    if (e.target.id === 'us-editor-modal') closeUserscriptEditor(); // click-outside-to-close, matches other modals in this file
  });

  document.getElementById('us-editor-save').addEventListener('click', async () => {
    const name    = document.getElementById('us-editor-name').value.trim();
    const matches = document.getElementById('us-editor-matches').value.split(',').map(m => m.trim()).filter(Boolean);
    const source  = document.getElementById('us-editor-source').value;
    try {
      if (_usEditingId) {
        await cg.userscripts.edit(_usEditingId, { source, matches });
      } else {
        if (!name) { addMsg('assistant', 'Script name is required.'); return; }
        if (!source.trim()) { addMsg('assistant', 'Script source is required.'); return; }
        await cg.userscripts.create({ name, source, matches: matches.length ? matches : ['*'], agentId });
      }
      closeUserscriptEditor();
      loadUserscripts();
    } catch (err) {
      addMsg('assistant', `Save failed: ${err.message}`);
    }
  });

  document.getElementById('us-editor-delete').addEventListener('click', async () => {
    if (!_usEditingId) return;
    try {
      await cg.userscripts.delete(_usEditingId);
      closeUserscriptEditor();
      loadUserscripts();
    } catch (err) {
      addMsg('assistant', `Delete failed: ${err.message}`);
    }
  });

  document.getElementById('btn-userscripts')?.addEventListener('click', async () => {
    usVisible = !usVisible;
    document.getElementById('userscript-panel').classList.toggle('visible', usVisible);
    if (usVisible) loadUserscripts();
  });
  document.getElementById('us-close').addEventListener('click', () => {
    usVisible = false;
    document.getElementById('userscript-panel').classList.remove('visible');
  });
  document.getElementById('us-new-btn').addEventListener('click', () => {
    // §CHANGED 2026-09-11 — this used to just tell the user to ask
    // co-pilot in chat; cg.userscripts.create() was real and already
    // worked, it just had no direct UI caller. Opens the same real
    // editor modal, empty, instead.
    openUserscriptEditor(null);
  });

  // ── Toolbar command registry ─────────────────────────────────────────
  // Feeds the toolbar bar itself, the ⋯ menu's overflow rows, and the
  // toolbar editor (drag zones + Actions list). Default pin set lives in
  // NexusOptions (pinnedToolbarButtons) — anything not pinned shows in
  // the ⋯ menu or the editor's Actions list instead of the bar.
  //
  // §STRUCTURAL 2026-08-24 — the command list itself used to be hardcoded
  // right here (SPOTLIGHT_COMMANDS), which meant this one renderer file
  // was the ONLY place that knew what toolbar commands exist. Nothing in
  // the CLI or backend could see or use that list, and options/store.js's
  // default pin array was a second, separately-maintained copy of "which
  // ids start pinned" with no link back to this one. Fetched from the
  // backend now (src/toolbar/commands.js, via cg.toolbar.commands()) —
  // this file renders whatever it's given, it doesn't define it.
  //
  // §MERGED 2026-08-30 — this used to feed a separate Ctrl+K Spotlight
  // overlay ("command palette"), removed per James: everything it did
  // (search/pin/run) is now reachable through the ⋯ menu + the
  // "Customize Toolbar…" editor above instead of a second floating UI.
  let TOOLBAR_COMMANDS = [];
  let currentPinned = [];

  async function loadToolbarCommands() {
    try { TOOLBAR_COMMANDS = await cg.toolbar.commands(); }
    catch (err) { console.error('[toolbar] failed to load command registry:', err); TOOLBAR_COMMANDS = []; }
  }

  function applyToolbarPins(pinned) {
    currentPinned = pinned || [];
    const pinnedSet = new Set(currentPinned);
    // §BUGFIX 2026-08-30 — this used to just toggle each button's own
    // style.display in place, which silently did nothing for the 7
    // tools that live inside #toolbar-overflow-slot (btn-rewind,
    // btn-providers, btn-userscripts, btn-dom, tool-picker-group,
    // btn-mesh, btn-diag): that container itself is permanently
    // display:none in browser.html, so clearing a child's own display
    // left it invisible regardless of pin state — a real, live bug this
    // merge surfaced. Real fix: for those 7, relocate the actual node
    // between #toolbar-overflow-slot and #toolbar-pinned-tools (the
    // same appendChild-relocates pattern the old localStorage-only
    // toolbar editor used) instead of toggling display. For everything
    // else (copilot-toggle, btn-bookmark, btn-options — already
    // permanently positioned in the main chrome bar), display-toggling
    // in place is correct and unchanged.
    const toolbarSlot = document.getElementById('toolbar-pinned-tools');
    const overflowSlot = document.getElementById('toolbar-overflow-slot');
    TOOLBAR_COMMANDS.forEach(cmd => {
      if (!cmd.pinnable || !cmd.id) return;
      const isPinned = pinnedSet.has(cmd.id);
      // Element Picker's real movable unit is the whole group (button +
      // route selector + API-url input) — moving #tool-picker-group as
      // one node carries picker-route/picker-api-url along with it, so
      // they no longer need separate pairsWith visibility handling.
      const node = cmd.id === 'picker-btn' ? document.getElementById('tool-picker-group') : document.getElementById(cmd.id);
      if (!node) return;
      if (node.parentElement === toolbarSlot || node.parentElement === overflowSlot) {
        (isPinned ? toolbarSlot : overflowSlot).appendChild(node);
        if (cmd.id === 'picker-btn' && isPinned) {
          // Re-run picker-route's own change handler so picker-api-url
          // ends up in its actually-correct state (shown only if
          // route === 'api'), not just "visible because it was moved."
          pickerRoute?.dispatchEvent(new Event('change'));
        }
      } else {
        node.style.display = isPinned ? '' : 'none';
      }
    });
    const hasPins = toolbarSlot.children.length > 0;
    toolbarSlot.style.display = hasPins ? 'flex' : 'none';
    document.getElementById('tools-divider-l').style.display = hasPins ? '' : 'none';
    document.getElementById('tools-divider-r').style.display = hasPins ? '' : 'none';
  }

  function activateToolbarCommand(cmd) {
    // §BUGFIX 2026-08-24 — a plugin's toolbar-command contribution has an
    // `id` (for display/pin purposes, same as every static command) but
    // NO corresponding DOM element in browser.html — document.getElementById
    // would return null and `?.click()` below would silently do nothing.
    // Checked before shipping: that's exactly the "silently failing code"
    // COS-1 forbids, not an acceptable gap. cmd.pluginId (set only by
    // src/plugins/host.js's registerPluginCommand, never by a static
    // TOOLBAR_COMMANDS entry) is the real signal — dispatch through the
    // bus via IPC instead of trying to click something that isn't there.
    if (cmd.id && cmd.pluginId) {
      // §NEW 2026-08-24 — agentId wasn't passed before (always {}). A
      // plugin command that needs to act on the CURRENT page (e.g. a
      // driver.exec eval into the live webview, same mechanism
      // UserscriptManager.inject() itself uses) has no way to know which
      // agent it's running in without this — module-scope `agentId` was
      // already real and available here, just never forwarded.
      cg.plugins.invoke(cmd.id, { agentId })
        .catch(err => addMsg('assistant', `Plugin command failed: ${err.message}`));
      return;
    }
    if (cmd.id) { document.getElementById(cmd.id)?.click(); return; }
    switch (cmd.action) {
      case 'new-agent': cg.window.open({ agentId: undefined, url: wv.getURL() }); break;
      case 'bg-tab': {
        const url = wv.getURL();
        cg.bgTabs.open({ agentId: agentId + '-bg', url });
        addMsg('assistant', `Moved to background tab: ${url}`);
        break;
      }
      case 'maximize': cg.window.maximize(agentId); break;
      case 'queue': openQueuePanel(); break;
      // §REMOVED 2026-09-25 — 'settings' used to be a palette-only action
      // here (cg.window.openSettings()). Now a real pinnable command
      // (btn-settings, src/toolbar/commands.js) with its own backing
      // button and click handler, so `cmd.id` above already returns
      // before this switch is ever reached for it — this case was dead.
      case 'capture-opportunity': {
        // 0.39.272 — lib/opportunity capture() via copilot; the tab is read by its own agentId, nothing is typed.
        fetch('http://127.0.0.1:3750/api/opportunity/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId }) })
          .then(r => r.json())
          .then(r => {
            const msg = r.ok ? `${r.created ? 'Captured' : 'Already tracked'}: "${r.title}" — ${r.stage}${r.score !== undefined ? `, score ${r.score}` : ''} (${String(r.id).slice(0, 8)})` : `Capture failed: ${r.error}`;
            toast(msg, r.ok ? 'success' : 'error', 5000); addMsg('assistant', msg);
          })
          .catch(err => { toast(`Capture failed — copilot :3750 unreachable (${err.message})`, 'error', 5000); });
        break;
      }
      // §NEW 2026-08-24 — the permanent fix for "toolbar accumulated too
      // many pins over time": restore pinnedToolbarButtons to exactly the
      // backend registry's defaultPinned set, in one action, instead of
      // unpinning each stray item by hand.
      case 'reset-toolbar': {
        const defaults = TOOLBAR_COMMANDS.filter(c => c.pinnable && c.defaultPinned).map(c => c.id);
        cg.options.set({ pinnedToolbarButtons: defaults })
          .then(() => { applyToolbarPins(defaults); addMsg('assistant', 'Toolbar reset to defaults.'); })
          .catch(err => addMsg('assistant', `Failed to reset toolbar: ${err.message}`));
        break;
      }
    }
  }

  loadToolbarCommands()
    .then(() => cg.options.get())
    .then(opts => applyToolbarPins(opts.pinnedToolbarButtons))
    .catch(() => {});

  // §BUILD 2026-08-30 — James: "maybe adjustable search bar like you
  // can grab the edge?" Real drag-to-resize for #url-bar-wrap, which
  // normally auto-grows (flex:1 1 auto) to fill all free space in
  // #chrome. Dragging switches it to an explicit pixel width
  // (flex: 0 0 <px>), clamped to a real, computed max — the row's
  // current width minus every OTHER real sibling's actual measured
  // width, not a guessed constant, so this stays correct if icons are
  // ever added/removed/pinned to the row later. Double-click resets
  // back to auto-grow and clears the persisted preference.
  (function setupUrlBarResize() {
    const wrap   = document.getElementById('url-bar-wrap');
    const handle = document.getElementById('url-bar-resize-handle');
    const chrome = document.getElementById('chrome');
    if (!wrap || !handle || !chrome) return; // real, defensive — matches this file's own convention elsewhere of never assuming an element exists

    const MIN_WIDTH = 200;

    function _maxWidth() {
      const chromeRect = chrome.getBoundingClientRect();
      let othersWidth = 0;
      for (const child of chrome.children) {
        if (child !== wrap) othersWidth += child.getBoundingClientRect().width;
      }
      const chromeStyle = getComputedStyle(chrome);
      const gapPx = parseFloat(chromeStyle.gap || chromeStyle.columnGap || '0') || 0;
      const gapsTotal = gapPx * Math.max(0, chrome.children.length - 1);
      const paddingTotal = parseFloat(chromeStyle.paddingLeft || '0') + parseFloat(chromeStyle.paddingRight || '0');
      return Math.max(MIN_WIDTH, chromeRect.width - othersWidth - gapsTotal - paddingTotal - 4);
    }

    let dragging = false, startX = 0, startWidth = 0;

    // §BUGFIX 2026-08-30 — James: "adjusting the search bar gets stuck."
    // Real cause, not guessed: #chrome carries -webkit-app-region:drag
    // (needed for dragging this frameless window by its empty chrome
    // area) and the handle is only 10px wide — if the real mouse
    // pointer drifts even slightly off that strip mid-drag (trivially
    // easy at normal drag speed), Chromium's native window-drag
    // recognition can steal the pointer stream before pointerup ever
    // reaches the handle, even with setPointerCapture — a known class
    // of interference specific to -webkit-app-region:drag regions, not
    // something the Pointer Events spec itself accounts for. dragging
    // stays true forever with nothing left to ever set it back to
    // false — exactly "gets stuck." Real fix: once a drag starts,
    // listen on document (not just the 10px handle) for move/up so the
    // drag keeps tracking regardless of exact pointer position, AND
    // explicitly neutralize the drag-region for the duration of the
    // drag so Chromium's native handling can't compete for the pointer
    // at all.
    function _onMove(e) {
      if (!dragging) return;
      const delta = e.clientX - startX;
      const next  = Math.min(_maxWidth(), Math.max(MIN_WIDTH, startWidth + delta));
      wrap.style.flex = `0 0 ${next}px`;
    }

    function _endDrag() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      chrome.style.webkitAppRegion = '';
      document.removeEventListener('pointermove', _onMove);
      document.removeEventListener('pointerup', _endDrag);
      document.removeEventListener('pointercancel', _endDrag);
      const finalWidth = Math.round(wrap.getBoundingClientRect().width);
      cg.options.set({ urlBarWidthPx: finalWidth }).catch(() => {});
    }

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      startWidth = wrap.getBoundingClientRect().width;
      handle.classList.add('dragging');
      // Real neutralization — the whole #chrome row (not just the
      // handle) stops being a drag-the-window region while an actual
      // resize drag is in progress, so Chromium has nothing left to
      // compete with the pointer events over.
      chrome.style.webkitAppRegion = 'no-drag';
      document.addEventListener('pointermove', _onMove);
      document.addEventListener('pointerup', _endDrag);
      document.addEventListener('pointercancel', _endDrag);
      e.preventDefault();
    });

    handle.addEventListener('dblclick', () => {
      wrap.style.flex = '1 1 auto';
      cg.options.set({ urlBarWidthPx: null }).catch(() => {});
    });

    // Real restore-on-load, matching the pinnedToolbarButtons pattern
    // right above this IIFE — same cg.options.get() call already made
    // there could theoretically be reused, but this runs in its own
    // microtask so a failure here can't block toolbar-pin restoration
    // or vice versa (§1.2 — one feature's failure doesn't break another's).
    cg.options.get().then(opts => {
      if (typeof opts.urlBarWidthPx === 'number' && opts.urlBarWidthPx > 0) {
        wrap.style.flex = `0 0 ${Math.max(MIN_WIDTH, opts.urlBarWidthPx)}px`;
      }
    }).catch(() => {});
  })();

  // ── Mesh queue panel ─────────────────────────────────────────────────
  const queuePanel = document.getElementById('queue-panel');
  let queueVisible = false;

  async function renderQueuePanel() {
    try {
      const { agents, queueDepth } = await cg.mesh.list();
      document.getElementById('queue-depth-label').textContent = queueDepth ? `${queueDepth} queued` : '';
      const list = document.getElementById('queue-list');
      if (!agents.length) {
        list.innerHTML = '<div class="queue-empty">No mesh agents spawned yet. Co-pilot spawns one when you route a task to Claude, ChatGPT, etc.</div>';
        return;
      }
      // §BUILD 2026-08-30 — James: "update guardian plugin in clear-glass
      // with all the agent mesh and suite features." health and
      // accountId were already real, already in cg.mesh.list()'s
      // output, and never rendered; constraints (SBP8's real per-agent
      // token/chunk ceiling) is newly exposed by agent-mesh.js's own
      // listAgents() fix this same pass. All three shown now, not
      // reworking the row's existing status/key/taskCount.
      list.innerHTML = agents.map(a => {
        const maxTok = a.constraints?.maxTokens;
        const constraintLabel = maxTok ? `${maxTok >= 1000 ? Math.round(maxTok/1000)+'k' : maxTok} tok${a.constraints?.chunk ? ' · chunked' : ''}` : '';
        return `
        <div class="queue-item">
          <span class="q-status ${a.status === 'working' ? 'working' : a.status === 'error' ? 'error' : 'idle'}">${a.status}</span>
          <span style="flex:1;">
            <div>${a.key}${a.accountId ? ` <span style="color:var(--text-dim);font-size:10px;">(${a.accountId})</span>` : ''}</div>
            ${constraintLabel ? `<div style="font-size:9px;color:var(--text-dim);">${constraintLabel}</div>` : ''}
          </span>
          <span style="color:var(--text-dim);" title="health">${typeof a.health === 'number' ? a.health + '%' : ''}</span>
          <span style="color:var(--text-dim);">${a.taskCount} task${a.taskCount === 1 ? '' : 's'}</span>
        </div>`;
      }).join('');
    } catch (err) {
      document.getElementById('queue-list').innerHTML = `<div class="queue-empty">Failed to load: ${err.message}</div>`;
    }
  }

  function openQueuePanel() {
    queueVisible = true;
    queuePanel.classList.add('visible');
    renderQueuePanel();
  }
  document.addEventListener('click', (e) => {
    if (queueVisible && !queuePanel.contains(e.target) && e.target.id !== 'queue-trigger') {
      queueVisible = false;
      queuePanel.classList.remove('visible');
    }
  });
  ['mesh.queue.add', 'mesh.queue.processing', 'mesh.task.complete', 'mesh.task.error', 'mesh.agent.spawned']
    .forEach(evt => es.addEventListener(evt, () => { if (queueVisible) renderQueuePanel(); }));

  // ── Agent window switcher dropdown ──────────────────────────────────
  const agentDropdown = document.getElementById('agent-dropdown');
  let agentDdVisible = false;

  async function openAgentDropdown() {
    let lists = { windows: [agentId], bgTabs: [] };
    try { lists = await cg.window.list(); } catch (_) {}

    const rows = [];
    rows.push(`<div class="agent-dd-section-label">Open Windows</div>`);
    for (const id of lists.windows) {
      rows.push(`<div class="agent-dd-item${id === agentId ? ' current' : ''}" data-focus="${id}">
        <span class="dd-dot"></span><span>${id}</span>
      </div>`);
    }
    if (lists.bgTabs.length) {
      rows.push(`<div class="agent-dd-section-label">Background Tabs</div>`);
      for (const id of lists.bgTabs) {
        rows.push(`<div class="agent-dd-item" data-focus="${id}"><span class="dd-dot" style="background:var(--text-dim);"></span><span>${id}</span></div>`);
      }
    }
    rows.push(`<div class="agent-dd-sep"></div>`);
    rows.push(`<div class="agent-dd-item" data-action="new-agent"><span>⊞</span><span>New Agent Window</span></div>`);

    agentDropdown.innerHTML = rows.join('');
    agentDropdown.querySelectorAll('[data-focus]').forEach(el => {
      el.addEventListener('click', () => { cg.window.focus(el.dataset.focus); closeAgentDropdown(); });
    });
    agentDropdown.querySelector('[data-action="new-agent"]')?.addEventListener('click', () => {
      cg.window.open({ agentId: undefined, url: wv.getURL() });
      closeAgentDropdown();
    });

    const rect = agentBadge.getBoundingClientRect();
    agentDropdown.style.left = rect.left + 'px';
    agentDropdown.style.top  = (rect.bottom + 6) + 'px';
    agentDropdown.classList.add('visible');
    agentDdVisible = true;
  }
  function closeAgentDropdown() { agentDdVisible = false; agentDropdown.classList.remove('visible'); }

  agentBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    agentDdVisible ? closeAgentDropdown() : openAgentDropdown();
  });
  document.addEventListener('click', (e) => {
    if (agentDdVisible && !agentDropdown.contains(e.target) && e.target !== agentBadge) closeAgentDropdown();
  });

  // ── Identity / fingerprint switcher dropdown ────────────────────────────
  // §NEW 2026-07-11 — ContextManager.switchFingerprint() (Firefox/Chrome/
  // Safari/Edge spoofed profiles) already worked for automatic hostile-page
  // rotation and copilot's own context.fp.switch tool; this is the first
  // manual control for it. No IPC channel for it existed at all before —
  // added context:switchFingerprint (ipc/bridge.js + preload) rather than
  // reusing context:switch, which already had a real, different purpose
  // (switchTo — active agent context, not fingerprint identity).
  const identityBadge = document.getElementById('identity-badge');
  const identityDropdown = document.getElementById('identity-dropdown');
  const identityModeLabel = document.getElementById('identity-mode-label');
  let identityDdVisible = false;
  let currentIdentityMode = 'chrome'; // default profile Clear Glass boots with

  const IDENTITY_MODES = [
    { mode: 'chrome',  label: 'Chrome' },
    { mode: 'firefox', label: 'Firefox' },
    { mode: 'safari',  label: 'Safari' },
    { mode: 'edge',    label: 'Edge' },
  ];

  function openIdentityDropdown() {
    const rows = [];
    rows.push(`<div class="agent-dd-section-label">Browser Identity</div>`);
    for (const m of IDENTITY_MODES) {
      rows.push(`<div class="identity-dd-item${m.mode === currentIdentityMode ? ' current' : ''}" data-mode="${m.mode}">
        <span class="dd-dot"></span><span>${m.label}</span>
      </div>`);
    }
    rows.push(`<div class="agent-dd-sep"></div>`);
    rows.push(`<div style="padding:6px 8px;font-size:10px;color:var(--text-dim)">Generates a fresh spoofed profile for this tab and switches its user agent. Also happens automatically when a page shows hostile/blocking behavior.</div>`);

    identityDropdown.innerHTML = rows.join('');
    identityDropdown.querySelectorAll('[data-mode]').forEach(el => {
      el.addEventListener('click', async () => {
        const mode = el.dataset.mode;
        identityBadge.disabled = true;
        try {
          const result = await cg.context.switchFingerprint({ agentId, mode });
          if (result?.ok !== false) {
            currentIdentityMode = mode;
            identityModeLabel.textContent = mode;
          } else {
            console.warn('[identity] switch failed:', result?.error);
          }
        } catch (err) {
          console.warn('[identity] switch failed:', err.message);
        } finally {
          identityBadge.disabled = false;
          closeIdentityDropdown();
        }
      });
    });

    const rect = identityBadge.getBoundingClientRect();
    identityDropdown.style.left = rect.left + 'px';
    identityDropdown.style.top  = (rect.bottom + 6) + 'px';
    identityDropdown.classList.add('visible');
    identityDdVisible = true;
  }
  function closeIdentityDropdown() { identityDdVisible = false; identityDropdown.classList.remove('visible'); }

  identityBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    identityDdVisible ? closeIdentityDropdown() : openIdentityDropdown();
  });
  document.addEventListener('click', (e) => {
    if (identityDdVisible && !identityDropdown.contains(e.target) && e.target !== identityBadge) closeIdentityDropdown();
  });
  // Reflect automatic hostile-detection-triggered switches (main/index.js
  // emits context.fp.switch on hostile-page detection) so the badge stays
  // truthful even when the user didn't click anything.
  es.addEventListener('context.fp.switched', (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.agentId === agentId) { currentIdentityMode = d.mode; identityModeLabel.textContent = d.mode; }
    } catch (_) {}
  });

  // ════════════════════════════════════════════════════════════════════
  // SCREEN Q&A — James: "clearglass needs to help me with job
  // applications, answering on screen questions... using hotkey. right
  // click, answer question context option." Backend kernel (detector.js,
  // the /cli/screen-qa/* + screen-qa:* IPC surface, the isolated
  // notification) already real; this wires the two trigger paths
  // (hotkey = whole page, right-click = one field — James's own choice)
  // through the SAME real functions, into the SAME preview surface
  // (the Co-pilot panel's addMsg — James's own choice, "show it first in
  // the co pilot cli").
  // ════════════════════════════════════════════════════════════════════

  // §HONEST LIMIT — an autofill profile's documents.resume is a file
  // REFERENCE ({path, filename}), not extracted text; reading and
  // parsing an uploaded resume (PDF/doc) into prompt-ready text is real,
  // separate scope (a document-parsing pipeline) not attempted here. A
  // profile's own field values (name, email, a free-text "summary" field
  // if one exists, etc.) ARE included — a resume being on file is named,
  // not silently dropped, so the person knows it wasn't actually read.
  async function _screenQaContext() {
    let settings = {};
    try { settings = await cg.api.get(); } catch (_) { /* falls through to context-only below */ }
    const parts = [];
    if (settings.screenQaProfileId) {
      try {
        const profile = await cg.autofill.getProfile(settings.screenQaProfileId);
        if (profile) {
          const fieldLines = Object.entries(profile.fields || {}).map(([k, v]) => `${k}: ${v}`);
          if (fieldLines.length) parts.push(fieldLines.join('\n'));
          if (profile.documents && profile.documents.resume) {
            parts.push(`(a resume file is on record — ${profile.documents.resume.filename || 'unnamed'} — its contents are NOT included here, only the profile fields above)`);
          }
        }
      } catch (_) { /* profile fetch failed — context continues with whatever else is real */ }
    }
    if (settings.screenQaContext) parts.push(settings.screenQaContext);
    return { text: parts.join('\n\n'), minConfidence: settings.screenQaMinConfidence || 'medium', profileId: settings.screenQaProfileId || null, enabled: settings.screenQaEnabled !== false };
  }

  // One shared render for both trigger paths — a single question/answer
  // pair, preview-first: "use" is a real, separate click that calls
  // cg.screenQa.inject; nothing is written to the page from this render
  // alone. Same discipline as autofill's own fill preview.
  function _screenQaRenderAnswer({ cgId, question, answer, error }) {
    const safeQ = question.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const id = `sqa-${cgId}-${Date.now()}`;
    if (error) {
      addMsg('assistant', `<div class="sqa-block"><div class="sqa-q">✨ "${safeQ}"</div><div class="sqa-err">✗ ${error.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</div></div>`, true);
      return;
    }
    const safeA = answer.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    addMsg('assistant', `<div class="sqa-block" id="${id}"><div class="sqa-q">✨ "${safeQ}"</div><div class="sqa-a">${safeA}</div>` +
      `<div class="sqa-actions"><button class="sqa-use">use this</button><button class="sqa-dismiss">dismiss</button></div></div>`, true);
    const block = document.getElementById(id);
    block.querySelector('.sqa-use').addEventListener('click', async () => {
      try {
        const r = await cg.screenQa.inject(cgId, answer, agentId);
        block.querySelector('.sqa-actions').innerHTML = r && !r.error ? '<span class="sqa-done">✓ filled</span>' : `<span class="sqa-err">✗ ${(r && r.error) || 'inject failed'}</span>`;
      } catch (e) { block.querySelector('.sqa-actions').innerHTML = `<span class="sqa-err">✗ ${e.message}</span>`; }
    });
    block.querySelector('.sqa-dismiss').addEventListener('click', () => { block.remove(); });
  }

  // Right-click path — one field, from screen-qa:element-at + the SAME
  // deriveQuestion() the whole-page scan uses, not a second copy of it.
  async function screenQaAnswerAt(x, y) {
    const ctx = await _screenQaContext();
    if (!ctx.enabled) { addMsg('assistant', '<div class="sqa-block"><div class="sqa-err">Screen Q&amp;A is off — enable it in Settings.</div></div>', true); return; }
    let field;
    try { field = await cg.screenQa.elementAt(x, y, agentId); }
    catch (e) { addMsg('assistant', `<div class="sqa-block"><div class="sqa-err">✗ ${e.message}</div></div>`, true); return; }
    if (!field) { addMsg('assistant', '<div class="sqa-block"><div class="sqa-err">No element at that point.</div></div>', true); return; }
    const derived = await cg.screenQa.deriveQuestion(field);
    if (!derived) { addMsg('assistant', '<div class="sqa-block"><div class="sqa-err">Nothing here looks like a question — no label, aria-label, placeholder, or field name to go on.</div></div>', true); return; }
    addMsg('assistant', `<div class="sqa-block"><div class="sqa-q">✨ "${derived.question}"</div>thinking…</div>`, true);
    try {
      const r = await cg.screenQa.answer(derived.question, ctx.text, agentId);
      _screenQaRenderAnswer({ cgId: field.id, question: derived.question, answer: r.answer, error: r.ok ? null : r.error });
    } catch (e) { _screenQaRenderAnswer({ cgId: field.id, question: derived.question, answer: null, error: e.message }); }
  }

  // Hotkey path — the whole page, every open-shaped field detectOpenQuestions
  // finds (already excludes whatever autofill would confidently fill).
  async function screenQaScanPage() {
    const ctx = await _screenQaContext();
    if (!ctx.enabled) { addMsg('assistant', '<div class="sqa-block"><div class="sqa-err">Screen Q&amp;A is off — enable it in Settings.</div></div>', true); return; }
    let result;
    try { result = await cg.screenQa.detect(ctx.profileId, agentId); }
    catch (e) { addMsg('assistant', `<div class="sqa-block"><div class="sqa-err">✗ ${e.message}</div></div>`, true); return; }
    if (result.error) { addMsg('assistant', `<div class="sqa-block"><div class="sqa-err">✗ ${result.error}</div></div>`, true); return; }
    const questions = result.questions || [];
    if (!questions.length) { addMsg('assistant', '<div class="sqa-block">No open-ended questions found on this page.</div>', true); return; }
    addMsg('assistant', `<div class="sqa-block">Found ${questions.length} question${questions.length === 1 ? '' : 's'} — answering…</div>`, true);
    for (const q of questions) {
      try {
        const r = await cg.screenQa.answer(q.question, ctx.text, agentId);
        _screenQaRenderAnswer({ cgId: q.cgId, question: q.question, answer: r.answer, error: r.ok ? null : r.error });
      } catch (e) { _screenQaRenderAnswer({ cgId: q.cgId, question: q.question, answer: null, error: e.message }); }
    }
  }

  // §BUILT 2026-09-21 — free key combo, checked directly against every
  // existing binding in this file before picking it (Ctrl+T/W/Tab/1-9/
  // L/R/D/H/J/P/F, Alt+Left/Right, F5, F11 — none use Shift+A).
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      copilotVisible = true; copilotPane.classList.remove('hidden'); copilotToggle.classList.add('active');
      screenQaScanPage();
    }
  });

  // ── Right-click context menu ──────────────────────────────────────────
  const ctxMenu = document.getElementById('ctx-menu');
  // §NEW 2026-08-30 — which pinned toolbar command (if any) the current
  // right-click landed on; drives the "Unpin from toolbar" row's
  // visibility and is what the 'unpin' action below actually unpins.
  // Null for a page right-click (wv's context-menu listener) or a
  // chrome-bar right-click that didn't land on a pinned command.
  let ctxPinTarget = null;
  // §fix 2026-09-02 — companion flag to ctxPinTarget: whether this
  // right-click landed on the chrome bar at all (vs. page content),
  // independent of whether it hit a *pinned* command specifically.
  // Drives the new "Customize Toolbar…" row's visibility.
  let ctxIsChrome = false;
  // §BUILT 2026-09-21 — the last right-click's WEBVIEW-relative point
  // (deliberately NOT window-relative — that's what showCtxMenu's own
  // §FIX above adds separately for menu positioning). elementAt() runs
  // document.elementFromPoint INSIDE the page's own coordinate space,
  // via wv.executeJavaScript, so it needs the page's own numbers, not
  // the window-adjusted ones.
  let ctxPageXY = null;

  function _findPinnedCommandAt(target) {
    return TOOLBAR_COMMANDS.find(c => {
      if (!c.id || !c.pinnable || !currentPinned.includes(c.id)) return false;
      const node = c.id === 'picker-btn' ? document.getElementById('tool-picker-group') : document.getElementById(c.id);
      return node && (node === target || node.contains(target));
    }) || null;
  }

  function showCtxMenu(x, y) {
    ctxMenu.querySelector('[data-action="unpin"]').style.display = ctxPinTarget ? '' : 'none';
    ctxMenu.querySelector('[data-action="unpin-sep"]').style.display = ctxPinTarget ? '' : 'none';
    ctxMenu.querySelector('[data-action="customize-toolbar"]').style.display = ctxIsChrome ? '' : 'none';
    ctxMenu.querySelector('[data-action="customize-toolbar-sep"]').style.display = ctxIsChrome ? '' : 'none';
    // §0.39.265 — clamp to the menu's real, measured size (it grows with
    // its rows) instead of a guessed 180×220, and never to a NaN position.
    ctxMenu.classList.add('visible');
    const w = ctxMenu.offsetWidth || 180, h = ctxMenu.offsetHeight || 220;
    const px = Number.isFinite(x) ? x : 0, py = Number.isFinite(y) ? y : 0;
    ctxMenu.style.left = Math.max(4, Math.min(px, window.innerWidth - w - 4)) + 'px';
    ctxMenu.style.top  = Math.max(4, Math.min(py, window.innerHeight - h - 4)) + 'px';
  }
  function hideCtxMenu() { ctxMenu.classList.remove('visible'); }

  document.addEventListener('click', hideCtxMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu(); });

  // Right-click on chrome bar or webview area
  document.getElementById('chrome').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctxPinTarget = _findPinnedCommandAt(e.target);
    ctxIsChrome = true;
    ctxPageXY = null; // a chrome-bar right-click has no page point
    showCtxMenu(e.clientX, e.clientY);
  });

  wv.addEventListener('context-menu', (e) => {
    e.preventDefault();
    ctxPinTarget = null; // page content is never a pinned toolbar command
    ctxIsChrome = false;
    // §FIX 2026-09-21 — James: "right click is stuck in the corner." Root
    // cause: <webview>'s own context-menu event reports e.x/e.y relative
    // to the WEBVIEW's content area, not the outer window — confirmed
    // against Electron's WebContents 'context-menu' params directly, not
    // assumed. #ctx-menu is position:fixed (window-relative), so every
    // page right-click landed short by exactly the chrome bar's own
    // height/width — reading as "stuck in the corner" regardless of
    // where on the page the click actually was. Adding the webview's own
    // offset within the window converts it to window-relative, the same
    // coordinate space showCtxMenu()'s Math.min clamp already assumes.
    //
    // §0.39.265 — still stuck: Electron's <webview> 'context-menu' event
    // carries the point as e.params.x / e.params.y; e.x / e.y are undefined,
    // so left/top became "NaNpx", which the browser ignores, and the menu sat
    // at its default top-left corner. Read params (e.x kept as a fallback).
    const r = wv.getBoundingClientRect();
    const p = e.params || e;
    ctxPageXY = { x: p.x, y: p.y };
    showCtxMenu(r.left + p.x, r.top + p.y);
  });

  ctxMenu.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    hideCtxMenu();

    switch (action) {
      case 'customize-toolbar': {
        _openToolbarEditor();
        break;
      }
      case 'unpin': {
        if (!ctxPinTarget) break;
        const next = currentPinned.filter(id => id !== ctxPinTarget.id);
        cg.options.set({ pinnedToolbarButtons: next })
          .then(() => { applyToolbarPins(next); addMsg('assistant', `Unpinned ${ctxPinTarget.label} from the toolbar.`); })
          .catch(err => addMsg('assistant', `Failed to unpin: ${err.message}`));
        break;
      }
      case 'bookmark': {
        const url = wv.getURL(), title = wv.getTitle();
        if (url && url !== 'about:blank') {
          const isMarked = await cg.bookmarks.check({ url, agentId }).catch(() => false);
          if (isMarked) {
            const bks = await cg.bookmarks.list({ agentId });
            const found = bks.find(b => b.url === url);
            if (found) await cg.bookmarks.remove({ id: found.id });
            addMsg('assistant', `Bookmark removed: ${title}`);
          } else {
            await cg.bookmarks.add({ url, title, agentId });
            addMsg('assistant', `★ Bookmarked: ${title}`);
          }
          loadBookmarks();
        }
        break;
      }
      case 'snapshot': {
        await cg.rewind.snapshot(agentId, { label: 'manual' });
        addMsg('assistant', '📍 Snapshot saved.');
        break;
      }
      case 'answer-question': {
        copilotVisible = true; copilotPane.classList.remove('hidden'); copilotToggle.classList.add('active');
        if (!ctxPageXY) { addMsg('assistant', '<div class="sqa-block"><div class="sqa-err">Right-click a page element, not the toolbar.</div></div>', true); break; }
        screenQaAnswerAt(ctxPageXY.x, ctxPageXY.y);
        break;
      }
      case 'find': {
        openFindBar();
        break;
      }
      case 'print': {
        // §CORRECTED before shipping — cg.driver.exec() is fire-and-
        // forget (confirmed directly: bridge.js's rendererEmit() just
        // emits onto the bus and returns {ok:true} immediately; the
        // real result arrives later as a separate driver.result/
        // driver.error SSE event, not as this call's resolved value).
        // An earlier version of this handler awaited it and showed a
        // "Sent to printer" toast right after — that would have shown
        // "success" even if the print failed or was cancelled. Fixed:
        // fire the action, no false success claim — the real OS print
        // dialog opening is itself the visible confirmation, and the
        // existing generic driver.error SSE listener (below) already
        // surfaces a genuine failure honestly.
        cg.driver.exec({ action: 'print', agentId });
        break;
      }
      case 'pick': {
        pickerActive = true;
        pickerBtn.classList.add('active');
        // §BUILD 2026-08-23 — James: "rebuild it completely for this
        // nexus... do not change any css, style, themes." Real,
        // complete, faithful port of the old Guardian's pick+popup+
        // zoom/nearby+listener-config workflow (clear-glass/renderer/
        // guardian-picker.js — every real CSS/HTML string extracted
        // byte-for-byte from the confirmed, converged v3.4.0 archive).
        // Fetched once and cached — same real, relative-to-browser.html
        // loading browser.js itself already uses, not a new mechanism.
        // Falls back to the old, simpler PICKER_SCRIPT if the fetch
        // genuinely fails, so a person still has a working picker
        // rather than none at all.
        try {
          if (!window.__guardianPickerSrc) {
            window.__guardianPickerSrc = await fetch('./guardian-picker.js').then(r => r.text());
          }
          await wv.executeJavaScript(window.__guardianPickerSrc);
        } catch (err) {
          console.error('[pick] guardian-picker.js load failed, falling back:', err);
          await wv.executeJavaScript(PICKER_SCRIPT);
        }
        break;
      }
      case 'copilot-page': {
        const url = wv.getURL(), title = wv.getTitle();
        copilotInput.value = `Tell me about this page: ${title} (${url})`;
        copilotVisible = true;
        copilotPane.classList.remove('hidden');
        copilotToggle.classList.add('active');
        copilotInput.focus();
        break;
      }
      case 'tokens': {
        addMsg('assistant', 'Scanning page for LLM/API patterns...');
        await cg.driver.exec({ action: 'dom.tokens', agentId });
        break;
      }
      case 'bg-tab': {
        const url = wv.getURL();
        await cg.bgTabs.open({ agentId: agentId + '-bg', url });
        addMsg('assistant', `Moved to background tab: ${url}`);
        break;
      }
      case 'new-agent': {
        const url = wv.getURL();
        await cg.window.open({ agentId: undefined, url });
        break;
      }
    }
  });

  // ── Inline DOM mesh script (injected into webview) ─────────────────
  const DOM_MESH_SCRIPT = `(function(){if(window.__cgDomMesh)return;const mesh=new Map();let c=0;function nid(el){if(!el.__cgId)el.__cgId='cg-'+(++c);return el.__cgId;}function meta(el){const r=el.getBoundingClientRect?el.getBoundingClientRect():{};return{id:el.__cgId||null,tag:el.tagName?.toLowerCase()||'#text',id_attr:el.id||null,classes:el.className&&typeof el.className==='string'?el.className.trim().split(/\\s+/).filter(Boolean):[],text:el.innerText?.slice(0,200)||null,rect:{top:r.top,left:r.left,width:r.width,height:r.height},visible:r.width>0&&r.height>0,children:el.childElementCount||0};}function ser(el,d=0,max=4){if(!el||el.nodeType!==1)return null;const m=meta(el);m.id=nid(el);if(d<max){m.children=[];for(const c of el.children){const s=ser(c,d+1,max);if(s)m.children.push(s);}}else m.children=el.childElementCount;return m;}window.__cgDomMesh={query(s){return[...document.querySelectorAll(s)].map(el=>({...meta(el),id:nid(el)}));},getTree(max=4){return ser(document.documentElement,0,max);},highlight(s,c='#00f5ff'){document.querySelectorAll('[data-cgh]').forEach(e=>{e.style.outline='';delete e.dataset.cgh;});document.querySelectorAll(s).forEach(e=>{e.style.outline='2px solid '+c;e.dataset.cgh='1';});},};})();`;

  // §BUILD 2026-07-09 — real DOM → SSE streaming. Separate from
  // DOM_MESH_SCRIPT above (which is query-on-demand, used by the tree
  // panel) — this one runs continuously. Batches mutations on a short
  // timer rather than emitting per-mutation, so a busy page (chat UIs
  // streaming tokens, for instance) doesn't flood the bridge with one
  // IPC call per character.
  const DOM_STREAM_SCRIPT = `
(function() {
  if (window.__cgDomStream) return;

  function meta(el) {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : {};
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : '#text',
      id_attr: el.id || null,
      classes: el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\\s+/).filter(Boolean) : [],
      text: el.innerText ? el.innerText.slice(0, 200) : (el.textContent ? el.textContent.slice(0, 200) : null),
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
    };
  }

  let pending = [];
  let flushTimer = null;
  const FLUSH_MS = 250;
  const MAX_BATCH = 500; // hard cap so one giant re-render can't build an unbounded payload

  function schedule() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, FLUSH_MS);
  }

  function flush() {
    flushTimer = null;
    if (!pending.length) return;
    const batch = pending.slice(0, MAX_BATCH);
    const dropped = pending.length - batch.length;
    pending = [];
    try {
      window.__cg?.send('dom:event', {
        type: 'dom.mutations',
        url: location.href,
        changes: batch,
        dropped: dropped > 0 ? dropped : undefined,
        ts: Date.now(),
      });
    } catch (_) {}
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => { if (n.nodeType === 1) pending.push({ type: 'added', ...meta(n) }); });
        m.removedNodes.forEach(n => { if (n.nodeType === 1) pending.push({ type: 'removed', tag: n.tagName ? n.tagName.toLowerCase() : '#text' }); });
      } else if (m.type === 'attributes') {
        pending.push({ type: 'attribute', tag: m.target.tagName?.toLowerCase(), attr: m.attributeName, value: m.target.getAttribute(m.attributeName) });
      } else if (m.type === 'characterData') {
        pending.push({ type: 'text', text: m.target.textContent ? m.target.textContent.slice(0, 200) : null });
      }
    }
    schedule();
  });

  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });

  // Initial full snapshot so a subscriber gets a starting point, not just deltas
  try {
    window.__cg?.send('dom:event', { type: 'dom.snapshot', url: location.href, ts: Date.now(), root: meta(document.documentElement) });
  } catch (_) {}

  window.__cgDomStream = {
    stop() { observer.disconnect(); clearTimeout(flushTimer); window.__cgDomStream = null; }
  };
})();
  `;

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

})();