'use strict';
/**
 * src/providers/gm-shim.js — Tampermonkey GM_* API shim
 * UUID: cg-gm-shim-v1-0000-0000-000000000013
 *
 * Guardian's userscripts (userscript-claude.js etc.) are written for
 * Tampermonkey and use three GM_* calls:
 *   - GM_xmlhttpRequest({ method, url, headers, data, timeout, onload, onerror, ontimeout })
 *   - GM_getValue(key, default)
 *   - GM_setValue(key, value)
 *
 * Electron's webview has no Tampermonkey sandbox, so this builds a plain
 * JS shim that's injected ahead of the userscript body via executeJavaScript.
 * It is deliberately NOT a 1:1 reimplementation of Tampermonkey's extension
 * storage — GM_getValue/GM_setValue here are backed by localStorage, which
 * is scoped to the webview's own session partition rather than shared
 * across every tab running the script the way real GM storage is. For a
 * dedicated, one-tab-per-provider host (which is what ProviderHost spawns)
 * that distinction doesn't matter — there's no second tab to race with —
 * but it would matter if you ever pointed two webviews at the same
 * provider under the same partition. Noting it here rather than pretending
 * it's identical.
 *
 * GM_xmlhttpRequest is backed by fetch(), which is sufficient: the NCP doc
 * already establishes that fetch() to 127.0.0.1 works fine from an https://
 * page under Private Network Access, which is exactly what these calls do
 * (Guardian, Cortex, Orchestrator, Ollama — all loopback).
 *
 * §FIX 2026-09-06 — James: "clearglass needs to work. the ncp." Traced
 * directly: guardian/userscript-claude.js's _gmEventSource() (the real
 * incremental SSE parser NCP's live channel connection depends on)
 * requires GM_xmlhttpRequest to call onprogress repeatedly as new SSE
 * chunks arrive, with res.responseText carrying the FULL text received
 * so far — and to stay open indefinitely for timeout:0. The shim below,
 * before this fix, did one single fetch().then(res => res.text()) and
 * only ever called onload ONCE, after the entire response body finished.
 * For a real, live, intentionally-never-closing SSE stream, that never
 * happens — onprogress was never called at all, meaning NCP's live
 * connection could never see a single frame when baked into Electron
 * this way, even though it worked under real Tampermonkey (whose real
 * GM_xmlhttpRequest genuinely streams). Fixed by reading fetch()'s own
 * real response.body ReadableStream incrementally via a reader, calling
 * onprogress after every chunk with the true accumulated responseText —
 * the same real contract Tampermonkey's own implementation provides,
 * not a fetch()-once-and-pretend.
 */

function buildGmShim() {
  return `
(function() {
  if (window.GM_xmlhttpRequest) return; // already shimmed (re-injection guard)

  window.GM_xmlhttpRequest = function(opts) {
    const controller = new AbortController();
    let timedOut = false;
    let aborted  = false;
    const t = opts.timeout ? setTimeout(() => { timedOut = true; controller.abort(); }, opts.timeout) : null;

    fetch(opts.url, {
      method:  opts.method || 'GET',
      headers: opts.headers || {},
      body:    opts.data,
      signal:  controller.signal,
    }).then(async (res) => {
      // Real "connection open" signal — headers are in, body streaming
      // begins now. Matches real EventSource/XHR readyState 2/3 timing,
      // which _gmEventSource() checks for onopen.
      opts.onreadystatechange && opts.onreadystatechange({ readyState: 3, status: res.status });

      if (!res.body || typeof res.body.getReader !== 'function') {
        // No real streaming body available (older engine, or a response
        // type that genuinely has none) — fall back to the original
        // one-shot behavior rather than hanging forever on a reader
        // that doesn't exist.
        if (t) clearTimeout(t);
        const responseText = await res.text();
        opts.onload && opts.onload({ status: res.status, statusText: res.statusText, responseText, response: responseText, finalUrl: res.url });
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      for (;;) {
        let chunk;
        try { chunk = await reader.read(); }
        catch (e) {
          if (t) clearTimeout(t);
          if (aborted && timedOut) { opts.ontimeout && opts.ontimeout(); return; }
          if (aborted) return; // deliberate close() — not a real error
          opts.onerror && opts.onerror(e);
          return;
        }
        if (chunk.done) break;
        accumulated += decoder.decode(chunk.value, { stream: true });
        // Real, repeated progress callback — the exact thing the old
        // shim never called even once. responseText is the FULL text
        // received so far, matching the real XHR/GM contract
        // _gmEventSource()'s own _parseNewFrames() already relies on.
        opts.onprogress && opts.onprogress({ status: res.status, statusText: res.statusText, responseText: accumulated, response: accumulated, finalUrl: res.url });
      }
      if (t) clearTimeout(t);
      // Real, genuine end of stream (server actually closed it) — not
      // fired on every chunk, only here, matching _gmEventSource()'s
      // own onload handler ("NCP stream ended").
      opts.onload && opts.onload({ status: res.status, statusText: res.statusText, responseText: accumulated, response: accumulated, finalUrl: res.url });
    }).catch((err) => {
      if (t) clearTimeout(t);
      if (timedOut) { opts.ontimeout && opts.ontimeout(); return; }
      if (aborted) return; // deliberate close() before any response — not a real error
      opts.onerror && opts.onerror(err);
    });

    return { abort: () => { aborted = true; controller.abort(); } };
  };

  window.GM_getValue = function(key, defaultValue) {
    try {
      const raw = localStorage.getItem('__gm_' + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) { return defaultValue; }
  };

  window.GM_setValue = function(key, value) {
    try { localStorage.setItem('__gm_' + key, JSON.stringify(value)); }
    catch (e) {}
  };
})();
`;
}

module.exports = { buildGmShim };
