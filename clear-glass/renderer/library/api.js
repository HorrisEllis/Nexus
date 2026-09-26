'use strict';
/**
 * renderer/library/api.js — what every Library area shares beyond the Settings
 * runtime (window.CGS, ../settings/core.js).
 * §BUILT 0.39.241 — James: "need control j to popout a window like the
 * screenshot. thats what it was supposed to look like, the settings ui but with
 * the library." The Library was a separate page (ui/library/, served by the
 * orchestrator on :9000) with its own orange terminal styling, opened inside an
 * agent browser window. It is now a Clear Glass window of its own, built on the
 * Settings runtime, so it IS the Settings UI.
 *
 * Data comes from the same Clear Glass bridge routes the old page used
 * (http://127.0.0.1:7702/cli/*) — tested, and reachable without IPC. Actions that
 * need the OS shell (open a file, show it in its folder) go through
 * window.ClearGlass, which this window has because it loads the preload.
 */
(function () {
  const BRIDGE = 'http://127.0.0.1:7702';

  /** api(path, {method, body}) — resolves with the JSON; throws with the bridge's own reason on any refusal. */
  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(BRIDGE + path, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
      });
    } catch (e) { throw new Error(`Clear Glass bridge :7702 unreachable (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); }
    let j = null; try { j = await res.json(); } catch (_) { /* empty or non-JSON body */ }
    if (!res.ok || (j && (j.error || j.ok === false))) throw new Error((j && j.error) || `HTTP ${res.status} on ${path}`);
    return j || {};
  }

  function fmtBytes(n) {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;   // 99.3 MB, 18 KB — as Firefox's Library writes sizes
  }

  /** fmtWhen(ts) — like Firefox's Library: a time today, a weekday this week, a date before that. */
  function fmtWhen(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function host(url) {
    if (!url) return '';
    if (/^(blob|data):/i.test(url)) return url.slice(0, url.indexOf(':'));
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
  }

  /** matches(q, ...fields) — the rail search box's filter ('list' mode): every area applies it the same way. */
  const matches = (q, ...fields) => !q || fields.some(f => String(f ?? '').toLowerCase().includes(q));

  window.CGL = { api, fmtBytes, fmtWhen, host, matches, BRIDGE };
})();
