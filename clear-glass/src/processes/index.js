'use strict';
/**
 * clear-glass/src/processes/index.js — what is running in Clear Glass, and what just happened (SP5, 0.60.219).
 * Spec: clear-glass/spec/site-profile.spec MOD-SP-PROCESSES (schemas ProcessRow, ActivityEvent) · Map: SP5_processes_and_activity
 *
 * James, 2026-10-23: "Also need a processes screen for background tabs and activity."
 *
 * Stands on what exists: Electron's own app.getAppMetrics() (the numbers src/diagnostic/process-metrics.js already reports, per process
 * type) joined here to every webContents by its OS pid, so a row says which tab, background tab or provider tab it is; main's background-tab
 * map and closeBackgroundTab; and the SISO bus every system already emits on (one bus.on('*') feeds the activity ring, as page attention does).
 *
 * createProcesses({ electron, bgTabs, windows, providerIds, closeBackgroundTab, activity }) → { list, end }
 *   list()                 → { rows: ProcessRow-with-tabs[], totals, why? } — one row per pid; its pages under it (tabs[])
 *   end(wcId, { by })      → { ok, did, why } — a person only (decision SP_D3): a background tab is closed; any other page's renderer is ended
 *                            (forcefullyCrashRenderer; the tab shows its crashed page and can be reloaded). An agent is refused, said.
 * createActivity({ max }) → { push, recent, fromEvent, dropped }
 *   push(ev)               → the event as kept (ts, kind, origin, what, by, wcId, level, ref), or null when it has no kind (counted)
 *   recent({ limit, kind, origin }) → newest first
 *   fromEvent(type, data)  → maps a bus event (driver.*, bgtab.*, downloads.completed, automation.run.*, error.captured) into the ring
 * The ring is memory only — the last 500 — nothing written to disk by it (ActivityEvent contract).
 */
const KINDS = new Set(['nav', 'bgtab.open', 'bgtab.close', 'driver', 'macro', 'workflow', 'download', 'error', 'process.end']);
const AGENT_PAGE = /^(mesh|ncp|auto)-/;
// the driver actions worth a line: what changes a page, not the reads agents make many times a second
const DRIVER_SHOWN = new Set(['navigate', 'click', 'type', 'scroll', 'hover', 'eval', 'select', 'check', 'setValue', 'pressKey', 'upload', 'pointer', 'back', 'forward', 'reload', 'screenshot', 'print']);

const originOf = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch (_) { return null; } };
const r1 = (n) => Math.round(n * 10) / 10;

function createActivity({ max = 500, now = () => Date.now() } = {}) {
  const ring = [];
  let dropped = 0;
  function push(ev = {}) {
    if (!ev || !KINDS.has(ev.kind)) { dropped++; return null; }
    const e = {
      ts: ev.ts || now(), kind: ev.kind, origin: ev.origin || originOf(ev.url) || null, what: String(ev.what || ev.kind).slice(0, 300),
      by: ev.by || 'system', wcId: ev.wcId != null ? ev.wcId : null, level: ev.level || 'info', ref: ev.ref != null ? String(ev.ref) : null,
    };
    ring.push(e);
    if (ring.length > max) ring.splice(0, ring.length - max);
    return e;
  }
  function recent({ limit = 100, kind = null, origin = null } = {}) {
    const out = [];
    for (let i = ring.length - 1; i >= 0 && out.length < limit; i--) {
      const e = ring[i];
      if (kind && !(e.kind === kind || e.kind.startsWith(kind + '.'))) continue;
      if (origin && e.origin !== origin) continue;
      out.push(e);
    }
    return out;
  }
  function fromEvent(type, d = {}) {
    d = d || {};
    const who = (id) => (id && AGENT_PAGE.test(String(id)) ? `agent:${id}` : d.by || 'system');
    switch (type) {
      case 'driver.result':
      case 'driver.error': {
        if (!DRIVER_SHOWN.has(d.action)) return null;
        const r = d.result || {};
        return push({ kind: 'driver', what: `${d.action}${r.url ? ` ${r.url}` : ''}${type === 'driver.error' ? ` — ${d.error}` : ''}`, url: r.url,
          by: who(d.agentId), level: type === 'driver.error' ? 'error' : 'info', ref: d.execId });
      }
      case 'bgtab.opened': return push({ kind: 'bgtab.open', what: `background tab ${d.agentId}${d.url && d.url !== 'about:blank' ? ` — ${d.url}` : ''}`, url: d.url, by: d.by || who(d.agentId), ref: d.agentId });
      case 'bgtab.closed': return push({ kind: 'bgtab.close', what: `background tab ${d.agentId} closed`, by: d.by || 'system', ref: d.agentId });
      case 'downloads.completed': return push({ kind: 'download', what: `${d.filename || 'a file'} — ${d.state || 'done'}`, url: d.url, level: d.state && d.state !== 'completed' ? 'warn' : 'info', ref: d.id });
      case 'automation.run.start': return push({ kind: 'workflow', what: `workflow ${d.id} started${d.reason ? ` (${d.reason})` : ''}`, ref: d.id });
      case 'automation.run.complete': return push({ kind: 'workflow', what: `workflow ${d.id} finished`, ref: d.id });
      case 'automation.run.error': return push({ kind: 'workflow', what: `workflow ${d.id} failed${d.step ? ` at ${d.step}` : ''}: ${d.error}`, level: 'error', ref: d.id });
      case 'error.captured': return push({ kind: 'error', what: `${d.type || 'error'}: ${String(d.message || '').split('\n')[0]}`, url: d.url, level: 'error', ref: d.id });
      default: return null;
    }
  }
  return { push, recent, fromEvent, dropped: () => dropped, size: () => ring.length };
}

function createProcesses({ electron, bgTabs = () => new Map(), windows = () => new Map(), providerIds = () => [], closeBackgroundTab = null, activity = null } = {}) {
  const el = electron || require('electron');

  // which window or background tab a page belongs to: the key of main's maps (its agentId), and what kind of page it is
  function ownerOf(wc) {
    const host = (() => { try { return wc.hostWebContents && !wc.hostWebContents.isDestroyed() ? wc.hostWebContents : null; } catch (_) { return null; } })();
    const top = host || wc;
    const find = (m) => { for (const [id, w] of m) { try { const c = w.webContents || (w.win && w.win.webContents); if (c && c.id === top.id) return id; } catch (_) {} } return null; };
    const bg = find(bgTabs());
    if (bg) return { kind: 'background-tab', agentId: bg };
    const win = find(windows());
    if (win) return { kind: providerIds().includes(win) || AGENT_PAGE.test(win) ? 'provider' : 'tab', agentId: win };
    let url = ''; try { url = wc.getURL() || ''; } catch (_) {}
    if (/^file:.*\/renderer\//.test(url) || /^devtools:/.test(url)) return { kind: 'window', agentId: null };
    return { kind: host ? 'tab' : 'window', agentId: null };
  }

  function list() {
    let metrics = [], why = null;
    try { metrics = el.app.getAppMetrics() || []; } catch (e) { why = `process metrics unavailable (${e.message}); rows have no memory or CPU`; }
    const byPid = new Map(metrics.map(m => [m.pid, m]));
    const rows = new Map();   // pid → row
    const rowFor = (pid, kind) => {
      if (!rows.has(pid)) {
        const m = byPid.get(pid);
        rows.set(pid, { pid, kind, title: null, url: null, origin: null, memoryMB: m && m.memory ? r1((m.memory.workingSetSize || 0) / 1024) : null,
          cpu: m && m.cpu ? r1(m.cpu.percentCPUUsage || 0) : null, webContentsId: null, startedAt: m && m.creationTime ? Math.round(m.creationTime) : null, tabs: [] });
      }
      return rows.get(pid);
    };
    let all = []; try { all = el.webContents.getAllWebContents(); } catch (_) {}
    for (const wc of all) {
      try {
        if (wc.isDestroyed()) continue;
        const pid = wc.getOSProcessId();
        const own = ownerOf(wc);
        const url = wc.getURL() || null;
        // a window's own page (browser.html, settings.html …) is the window; the sites inside it are its tabs
        const chrome = !wc.hostWebContents && /^file:.*\/renderer\//.test(url || '');
        const kind = chrome ? 'window' : own.kind;
        const row = rowFor(pid, kind);
        if (row.kind === 'window' && kind !== 'window') row.kind = kind;   // a process that hosts a page is that page's kind
        const tab = { webContentsId: wc.id, kind, agentId: own.agentId, title: (() => { try { return wc.getTitle() || null; } catch (_) { return null; } })(),
          url, origin: originOf(url), crashed: (() => { try { return wc.isCrashed(); } catch (_) { return false; } })() };
        row.tabs.push(tab);
        if (!row.webContentsId || (row.kind === kind && kind !== 'window' && !row.origin)) Object.assign(row, { webContentsId: tab.webContentsId, title: tab.title, url: tab.url, origin: tab.origin });
      } catch (_) { /* a page that went away while listed */ }
    }
    // the processes with no page: the browser process, the GPU, utilities
    const TYPE = { browser: 'browser', gpu: 'gpu', tab: 'tab' };
    for (const m of metrics) if (!rows.has(m.pid)) rowFor(m.pid, TYPE[String(m.type || '').toLowerCase()] || 'utility');
    const out = [...rows.values()].sort((a, b) => (b.memoryMB || 0) - (a.memoryMB || 0));
    const totals = { processes: out.length, memoryMB: r1(out.reduce((s, r) => s + (r.memoryMB || 0), 0)), cpu: r1(out.reduce((s, r) => s + (r.cpu || 0), 0)),
      backgroundTabs: bgTabs().size };
    return { rows: out, totals, ...(why ? { why } : {}) };
  }

  function end(wcId, { by = null } = {}) {
    if (by !== 'person') return { ok: false, status: 403, why: 'ending a process is a person\'s action (agents can list, not end)' };
    let wc = null; try { wc = el.webContents.fromId(Number(wcId)); } catch (_) {}
    if (!wc || wc.isDestroyed()) return { ok: false, status: 404, why: `no page ${wcId} — it closed since the list was read` };
    const own = ownerOf(wc);
    let url = null; try { url = wc.getURL(); } catch (_) {}
    if (own.kind === 'background-tab' && closeBackgroundTab) {
      closeBackgroundTab(own.agentId, { by: 'person' });
      if (activity) activity.push({ kind: 'process.end', what: `closed background tab ${own.agentId}`, url, by: 'person', wcId: Number(wcId), ref: own.agentId });
      return { ok: true, did: 'closed', agentId: own.agentId };
    }
    const chrome = !wc.hostWebContents && /^file:.*\/renderer\//.test(url || '');
    if (own.kind === 'window' || chrome) return { ok: false, status: 409, why: 'that is a Clear Glass window, not a page; close it from its own window' };
    try { wc.forcefullyCrashRenderer(); } catch (e) { return { ok: false, status: 500, why: `the renderer was not ended: ${e.message}` }; }
    if (activity) activity.push({ kind: 'process.end', what: `ended the page's process${url ? ` — ${url}` : ''}`, url, by: 'person', wcId: Number(wcId), level: 'warn' });
    return { ok: true, did: 'ended', note: 'the tab shows that its page crashed; reload it to start it again' };
  }

  return { list, end, ownerOf };
}

let _activity = null;
/** the one ring main feeds and the bridge reads */
function activity() { return _activity || (_activity = createActivity()); }

module.exports = { createProcesses, createActivity, activity, KINDS };
