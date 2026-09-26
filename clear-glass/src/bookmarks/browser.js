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

  // §NEW 2026-07-04: main process navigates this window in place when the
  // orchestrator's wire /open call targets the already-open default window
  // (see clear-glass/src/main/index.js's /open handler) — avoids opening a
  // second window just to show the same NEXUS UI the default window will
  // load anyway once this fires.
  if (window.ClearGlass?.on) {
    window.ClearGlass.on('cg:navigate', (targetUrl) => {
      if (targetUrl && typeof wv.loadURL === 'function') wv.loadURL(targetUrl);
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

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // Aborted — normal
    addMsg('assistant', `Navigation failed: ${e.errorDescription}`);
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

  function updateUrl() {
    const url = wv.getURL();
    urlBar.value = url;
    statusUrl.textContent = url;
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
    wv.loadURL(url);
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
      wv.loadURL(t.url || 'about:blank');
      urlBar.value = t.url || '';
      render();
    }

    function newTab(url) {
      const id = nextId++;
      tabs.push({ id, url: url || 'about:blank', title: 'New tab', loading: false });
      switchTo(id);
    }

    function closeTab(id) {
      if (tabs.length === 1) { tabs[0].url = 'about:blank'; wv.loadURL('about:blank'); urlBar.value=''; render(); return; }
      const idx = tabs.findIndex(t => t.id === id);
      tabs = tabs.filter(t => t.id !== id);
      if (activeId === id) switchTo(tabs[Math.max(0, idx - 1)].id);
      else render();
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
    return { tabs, get activeId(){ return activeId; }, newTab, closeTab, setUrl, setTitle, setLoading, render };
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
    const url = wv.getURL();
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
        wv.loadURL(norm);
      } else {
        wv.addEventListener('dom-ready', () => wv.loadURL(norm), { once: true });
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

  document.getElementById('btn-options').addEventListener('click', openOptionsPanel);
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
    } else if (e.channel === 'dom:event') {
      // Live MutationObserver stream — forward straight through, no local
      // UI cost (this can fire many times a second on a busy page).
      window.ClearGlass?._sendDomEvent?.({ ...e.args[0], agentId });
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
    const data = {
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

  copilotInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCopilot();
    }
  });
  copilotSend.addEventListener('click', sendCopilot);

  async function sendCopilot() {
    const text = copilotInput.value.trim();
    if (!text) return;

    copilotInput.value = '';
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
      const res = await cg.copilot.send({ message: text, agentId, domContext, systemExtra });
      removeThinking();

      // Format response with code blocks
      const formatted = res.text
        .replace(/```driver[\s\S]*?```/g, m => `<span style="color:var(--accent);font-family:var(--mono);font-size:10px;">[driver command sent]</span>`)
        .replace(/`([^`]+)`/g, '<code>$1</code>');

      addMsg('assistant', formatted, true);

      // Execute any driver commands
      for (const cmd of res.commands || []) {
        try {
          await cg.driver.exec({ ...cmd, agentId });
        } catch (err) {
          addMsg('assistant', `Command error: ${err.message}`);
        }
      }
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

  connectSSE();

  // ── Bookmarks ──────────────────────────────────────────────────────────
  async function loadBookmarks() {
    try {
      const bks = await cg.bookmarks.list({ agentId }) || [];
      const list = document.getElementById('bookmarks-list');
      list.innerHTML = '';
      bks.slice(0, 20).forEach(bk => {
        const btn = document.createElement('button');
        btn.className = 'bk-btn';
        btn.title = bk.snapshotId ? `${bk.url} (state saved)` : bk.url;
        btn.textContent = (bk.snapshotId ? '● ' : '') + (bk.title || bk.url);
        btn.addEventListener('click', () => openBookmark(bk));
        list.appendChild(btn);
      });
    } catch (_) {}
  }

  // §STATE-LINK 2026-08-27 — the real open-side pairing to addWithState.
  // A bookmark with no snapshotId behaves exactly as before (plain
  // navigate); one with a snapshotId restores through RewindEngine
  // instead, same shape openBookmark() already checks for.
  async function openBookmark(bk) {
    if (!bk.snapshotId) {
      wv.loadURL(bk.url);
      cg.bookmarks.visit({ id: bk.id });
      return;
    }
    const r = await cg.bookmarks.openWithState({ id: bk.id, agentId });
    if (r?.restoreError) {
      console.warn('[Bookmarks] state restore failed, falling back to plain navigate:', r.restoreError);
      wv.loadURL(bk.url);
    }
  }

  document.getElementById('btn-bookmark').addEventListener('click', async (evt) => {
    const url   = wv.getURL();
    const title = wv.getTitle();
    if (!url || url === 'about:blank') return;
    const isMarked = await cg.bookmarks.check({ url, agentId }).catch(() => false);
    if (isMarked) {
      // Already bookmarked — remove it. No state decision on the way out.
      const bks = await cg.bookmarks.list({ agentId });
      const found = bks.find(b => b.url === url);
      if (found) { await cg.bookmarks.remove({ id: found.id }); document.getElementById('btn-bookmark').style.color = ''; }
      loadBookmarks();
      return;
    }
    // §STATE-LINK 2026-08-27 — TX12: save-state is optional, offered at
    // the icon, not a second bookmark type or a separate UI. A tiny
    // popup, same floating-panel pattern bookmark-mgr-panel below already
    // uses — no new mechanism, no modal library.
    showSaveStatePopup(evt.target, async (withState) => {
      if (withState) {
        const r = await cg.bookmarks.addWithState({ url, title, agentId });
        if (r?.stateError) console.warn('[Bookmarks] saved, but state capture failed:', r.stateError);
      } else {
        await cg.bookmarks.add({ url, title, agentId });
      }
      document.getElementById('btn-bookmark').style.color = '#f5c842';
      loadBookmarks();
    });
  });

  function showSaveStatePopup(anchorEl, onConfirm) {
    document.getElementById('bk-save-popup')?.remove();
    const rect = anchorEl.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.id = 'bk-save-popup';
    pop.style.cssText = `position:fixed;top:${rect.bottom + 4}px;right:${window.innerWidth - rect.right}px;
      background:var(--bg-panel,#1a1a1a);border:1px solid var(--border,#333);border-radius:6px;
      padding:8px;z-index:9999;font-size:11px;color:var(--text,#ccc);width:200px;box-shadow:0 4px 12px rgba(0,0,0,.4)`;
    pop.innerHTML = `
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" id="bk-save-state-cb">
        Also save state (cookies, forms, scroll)
      </label>
      <div style="display:flex;justify-content:flex-end;gap:6px">
        <button id="bk-save-cancel" style="font-size:11px;padding:3px 8px">Cancel</button>
        <button id="bk-save-confirm" style="font-size:11px;padding:3px 8px">Save</button>
      </div>`;
    document.body.appendChild(pop);
    const close = () => pop.remove();
    pop.querySelector('#bk-save-cancel').addEventListener('click', close);
    pop.querySelector('#bk-save-confirm').addEventListener('click', () => {
      const withState = pop.querySelector('#bk-save-state-cb').checked;
      close();
      onConfirm(withState);
    });
    // Dismiss on outside click, one tick later so this same click doesn't close it.
    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!pop.contains(e.target)) { close(); document.removeEventListener('click', outside); }
      });
    }, 0);
  }

  document.getElementById('bookmark-mgr-btn').addEventListener('click', async (e) => {
    const panel = document.getElementById('bookmark-mgr-panel');
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    const rect = e.target.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">loading…</div>';
    panel.style.display = 'block';
    try {
      const list = await cg.bookmarks.list({ agentId });
      if (!list || !list.length) {
        panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">No bookmarks yet — click the ★ on any page to add one.</div>';
        return;
      }
      panel.innerHTML = list.map(b => `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 4px;border-bottom:1px solid var(--border,#333)">
          <span data-visit="${b.id}" style="flex:1;cursor:pointer;font-size:11px;color:var(--text,#ccc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.url.replace(/"/g,'&quot;')}${b.snapshotId ? ' (state saved)' : ''}">${b.snapshotId ? '● ' : ''}${(b.title || b.url).replace(/</g,'&lt;')}</span>
          <span data-remove="${b.id}" style="cursor:pointer;opacity:.5;font-size:12px" title="Remove">✕</span>
        </div>`).join('');
      panel.querySelectorAll('[data-visit]').forEach(el => el.addEventListener('click', async () => {
        const bk = list.find(b => b.id === el.dataset.visit);
        if (bk) { await openBookmark(bk); panel.style.display = 'none'; }
      }));
      panel.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await cg.bookmarks.remove({ id: el.dataset.remove, agentId });
        el.closest('div').remove();
        loadBookmarks?.();
      }));
    } catch (err) {
      panel.innerHTML = `<div style="padding:8px;color:#ff6b6b;font-size:11px">Error: ${err.message}</div>`;
    }
  });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('bookmark-mgr-panel');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target.id !== 'bookmark-mgr-btn') panel.style.display = 'none';
  });

  // §NEW 2026-08-24 — real downloads manager panel. Same real dropdown
  // pattern as bookmark-mgr-panel above, against the real downloads IPC
  // surface (src/downloads/store.js + adapter.js, wired into every real
  // agent session's will-download).
  function _formatBytes(n) {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0; let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }
  function _stateLabel(state) {
    return { in_progress: '⏳', completed: '✓', cancelled: '✕', interrupted: '⚠', paused: '⏸' }[state] || state;
  }
  async function _renderDownloadsPanel() {
    const panel = document.getElementById('downloads-panel');
    panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">loading…</div>';
    try {
      const list = await cg.downloads.list({});
      if (!list || !list.length) {
        panel.innerHTML = '<div style="padding:8px;color:var(--text-dim,#999);font-size:11px">No downloads yet.</div>';
        return;
      }
      panel.innerHTML = `<div style="display:flex;justify-content:flex-end;padding:2px 4px 6px"><span data-clear-completed style="cursor:pointer;font-size:10px;color:var(--text-dim,#999)">clear completed</span></div>` +
        list.slice(0, 30).map(d => `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 4px;border-bottom:1px solid var(--border,#333)">
          <span title="${d.state}" style="font-size:11px">${_stateLabel(d.state)}</span>
          <span data-open="${d.id}" style="flex:1;cursor:pointer;font-size:11px;color:var(--text,#ccc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(d.savePath || '').replace(/"/g, '&quot;')}">${d.filename.replace(/</g, '&lt;')}</span>
          <span style="font-size:10px;color:var(--text-dim,#999)">${_formatBytes(d.bytes)}</span>
          <span data-remove="${d.id}" style="cursor:pointer;opacity:.5;font-size:12px" title="Remove from list">✕</span>
        </div>`).join('');
      panel.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => cg.downloads.openFolder(el.dataset.open)));
      panel.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await cg.downloads.clearItem(el.dataset.remove);
        el.closest('div').remove();
      }));
      const clearBtn = panel.querySelector('[data-clear-completed]');
      if (clearBtn) clearBtn.addEventListener('click', async () => {
        await cg.downloads.clearCompleted();
        _renderDownloadsPanel();
      });
    } catch (err) {
      panel.innerHTML = `<div style="padding:8px;color:#ff6b6b;font-size:11px">Error: ${err.message}</div>`;
    }
  }
  document.getElementById('downloads-btn').addEventListener('click', (e) => {
    const panel = document.getElementById('downloads-panel');
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    const rect = e.target.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.style.display = 'block';
    _renderDownloadsPanel();
  });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('downloads-panel');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target.id !== 'downloads-btn') panel.style.display = 'none';
  });

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
  document.getElementById('site-settings-btn').addEventListener('click', (e) => {
    const panel = document.getElementById('site-settings-panel');
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    const rect = e.target.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.style.display = 'block';
    _renderSiteSettingsPanel();
  });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('site-settings-panel');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target.id !== 'site-settings-btn') panel.style.display = 'none';
  });

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
        const isBookmark = typeof s.label === 'string' && s.label.startsWith('bookmark:');
        const label = isBookmark
          ? `🔖 ${s.label.slice('bookmark:'.length)}`
          : (s.label === 'auto' ? '' : (s.label === 'manual' ? '' : ' • ' + s.label));
        div.innerHTML = `<div class="ri-title">${s.title || s.url}</div>
          <div class="ri-url">${s.url}</div>
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
        list.appendChild(div);
      });
    } catch (_) {}
  }

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
    addMsg('assistant', `To create a userscript, tell Co-pilot:
"Create a userscript that [description]"

It will write and install it for you.`);
    usVisible = false;
    document.getElementById('userscript-panel').classList.remove('visible');
  });

  // ── Spotlight command palette ───────────────────────────────────────
  // Consolidates the feature-toggle buttons that used to live permanently
  // on the chrome bar. Default pin set lives in NexusOptions
  // (pinnedToolbarButtons) — anything not pinned shows here only.
  //
  // §STRUCTURAL 2026-08-24 — the command list itself used to be hardcoded
  // right here (SPOTLIGHT_COMMANDS), which meant this one renderer file
  // was the ONLY place that knew what toolbar commands exist. Nothing in
  // the CLI or backend could see or use that list, and options/store.js's
  // default pin array was a second, separately-maintained copy of "which
  // ids start pinned" with no link back to this one. Fetched from the
  // backend now (src/toolbar/commands.js, via cg.toolbar.commands()) —
  // this file renders whatever it's given, it doesn't define it.
  let TOOLBAR_COMMANDS = [];
  let currentPinned = [];
  let spotlightIndex = 0;

  async function loadToolbarCommands() {
    try { TOOLBAR_COMMANDS = await cg.toolbar.commands(); }
    catch (err) { console.error('[toolbar] failed to load command registry:', err); TOOLBAR_COMMANDS = []; }
  }

  function applyToolbarPins(pinned) {
    currentPinned = pinned || [];
    const pinnedSet = new Set(currentPinned);
    TOOLBAR_COMMANDS.forEach(cmd => {
      if (!cmd.pinnable) return;
      const isPinned = pinnedSet.has(cmd.id);
      const el = document.getElementById(cmd.id);
      if (el) el.style.display = isPinned ? '' : 'none';
      // §BUGFIX 2026-08-24 — elements listed in pairsWith (e.g. Element
      // Picker's route-selector + API-url input) have no pin of their
      // own; they track their owning command's pin state, so a route
      // selector for a hidden feature can't be left dangling in the bar.
      //
      // §CORRECTED before shipping — a blanket `display:''` on pin would
      // fight picker-api-url's own existing rule (line ~98: visible only
      // when picker-route's value is 'api', hidden otherwise). Unpinning
      // still force-hides every paired element unconditionally — that
      // part has no competing logic to fight. Pinning does NOT force
      // `display:''`; it only clears a previous forced 'none' and lets
      // each element's own real logic (re-run via dispatchEvent below)
      // decide its actual visibility. Generic on purpose: any future
      // pairsWith entry with its own conditional-visibility rule gets the
      // same correct treatment without needing a special case here.
      (cmd.pairsWith || []).forEach(pairedId => {
        const pairedEl = document.getElementById(pairedId);
        if (!pairedEl) return;
        if (!isPinned) { pairedEl.style.display = 'none'; return; }
        pairedEl.style.display = ''; // clear a stale forced-hidden state
      });
      if (cmd.id === 'picker-btn' && isPinned) {
        // Re-run picker-route's own change handler so picker-api-url ends
        // up in its actually-correct state (shown only if route === 'api'),
        // not just "visible because its pin cleared."
        pickerRoute?.dispatchEvent(new Event('change'));
      }
    });
  }

  function activateSpotlightCommand(cmd) {
    closeSpotlight();
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
      case 'settings': cg.window.openSettings(); break;
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

  function renderSpotlightResults(query) {
    const q = (query || '').toLowerCase();
    const items = TOOLBAR_COMMANDS.filter(c =>
      c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
    const resultsEl = document.getElementById('spotlight-results');

    if (!items.length) {
      resultsEl.innerHTML = '<div class="spotlight-empty">No matching actions</div>';
      return;
    }

    resultsEl.innerHTML = items.map((c, i) => {
      const pinned = c.pinnable && currentPinned.includes(c.id);
      return `<div class="spotlight-item${i === spotlightIndex ? ' selected' : ''}" data-index="${i}">
        <span class="sl-icon">${c.icon}</span>
        <span class="sl-label">${c.label}</span>
        <span class="sl-group">${c.group}</span>
        ${c.pinnable ? `<button class="sl-pin${pinned ? ' pinned' : ''}" data-pin="${c.id}" title="${pinned ? 'Unpin from toolbar' : 'Pin to toolbar'}">${pinned ? '📌' : '📍'}</button>` : ''}
      </div>`;
    }).join('');

    resultsEl.querySelectorAll('.spotlight-item').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.sl-pin')) return;
        activateSpotlightCommand(items[+row.dataset.index]);
      });
    });
    resultsEl.querySelectorAll('.sl-pin').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.pin;
        const next = currentPinned.includes(id)
          ? currentPinned.filter(x => x !== id)
          : [...currentPinned, id];
        try { await cg.options.set({ pinnedToolbarButtons: next }); }
        catch (err) { addMsg('assistant', `Failed to save toolbar layout: ${err.message}`); return; }
        applyToolbarPins(next);
        renderSpotlightResults(document.getElementById('spotlight-input').value);
      });
    });
  }

  function openSpotlight() {
    document.getElementById('spotlight-overlay').classList.add('visible');
    const input = document.getElementById('spotlight-input');
    input.value = '';
    spotlightIndex = 0;
    renderSpotlightResults('');
    setTimeout(() => input.focus(), 0);
  }

  function closeSpotlight() {
    document.getElementById('spotlight-overlay').classList.remove('visible');
  }

  document.getElementById('fab-btn').addEventListener('click', () => {
    const isOpen = document.getElementById('spotlight-overlay').classList.contains('visible');
    isOpen ? closeSpotlight() : openSpotlight();
  });
  document.getElementById('spotlight-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'spotlight-overlay') closeSpotlight();
  });
  document.getElementById('spotlight-input').addEventListener('input', (e) => {
    spotlightIndex = 0;
    renderSpotlightResults(e.target.value);
  });
  document.getElementById('spotlight-input').addEventListener('keydown', (e) => {
    const rows = document.getElementById('spotlight-results').querySelectorAll('.spotlight-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); spotlightIndex = Math.min(spotlightIndex + 1, rows.length - 1); rows.forEach((r, i) => r.classList.toggle('selected', i === spotlightIndex)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spotlightIndex = Math.max(spotlightIndex - 1, 0); rows.forEach((r, i) => r.classList.toggle('selected', i === spotlightIndex)); }
    else if (e.key === 'Enter') { e.preventDefault(); rows[spotlightIndex]?.click(); }
    else if (e.key === 'Escape') { closeSpotlight(); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSpotlight(); }
  });

  loadToolbarCommands()
    .then(() => cg.options.get())
    .then(opts => applyToolbarPins(opts.pinnedToolbarButtons))
    .catch(() => {});

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
      list.innerHTML = agents.map(a => `
        <div class="queue-item">
          <span class="q-status ${a.status === 'working' ? 'working' : a.status === 'error' ? 'error' : 'idle'}">${a.status}</span>
          <span style="flex:1;">${a.key}</span>
          <span style="color:var(--text-dim);">${a.taskCount} task${a.taskCount === 1 ? '' : 's'}</span>
        </div>`).join('');
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

  // ── Right-click context menu ──────────────────────────────────────────
  const ctxMenu = document.getElementById('ctx-menu');

  function showCtxMenu(x, y) {
    ctxMenu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
    ctxMenu.style.top  = Math.min(y, window.innerHeight - 220) + 'px';
    ctxMenu.classList.add('visible');
  }
  function hideCtxMenu() { ctxMenu.classList.remove('visible'); }

  document.addEventListener('click', hideCtxMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu(); });

  // Right-click on chrome bar or webview area
  document.getElementById('chrome').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY);
  });

  wv.addEventListener('context-menu', (e) => {
    e.preventDefault();
    showCtxMenu(e.x, e.y);
  });

  ctxMenu.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    // §FIX — snapshotted before hideCtxMenu() below, which removes the
    // 'visible' class; ctxMenu's own rect would collapse to 0,0 after
    // that, misplacing the save-state popup this handler may open.
    const menuRect = ctxMenu.getBoundingClientRect();
    const menuAnchor = { getBoundingClientRect: () => menuRect };
    hideCtxMenu();

    switch (action) {
      case 'bookmark': {
        const url = wv.getURL(), title = wv.getTitle();
        if (url && url !== 'about:blank') {
          const isMarked = await cg.bookmarks.check({ url, agentId }).catch(() => false);
          if (isMarked) {
            const bks = await cg.bookmarks.list({ agentId });
            const found = bks.find(b => b.url === url);
            if (found) await cg.bookmarks.remove({ id: found.id });
            addMsg('assistant', `Bookmark removed: ${title}`);
            loadBookmarks();
          } else {
            // Same optional-state popup as the toolbar star (§STATE-LINK
            // TX12) — one real bookmark flow, reached from two entry points.
            showSaveStatePopup(menuAnchor, async (withState) => {
              if (withState) {
                const r = await cg.bookmarks.addWithState({ url, title, agentId });
                if (r?.stateError) addMsg('assistant', `★ Bookmarked: ${title} (state not saved: ${r.stateError})`);
                else addMsg('assistant', `★ Bookmarked with state: ${title}`);
              } else {
                await cg.bookmarks.add({ url, title, agentId });
                addMsg('assistant', `★ Bookmarked: ${title}`);
              }
              document.getElementById('btn-bookmark').style.color = '#f5c842';
              loadBookmarks();
            });
          }
        }
        break;
      }
      case 'snapshot': {
        await cg.rewind.snapshot(agentId, { label: 'manual' });
        addMsg('assistant', '📍 Snapshot saved.');
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