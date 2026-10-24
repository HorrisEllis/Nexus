/* ============================================================================
   NexusPanel — core.js
   DOM helpers, the API wrapper, toasts, and formatters.

   The old api() swallowed every failure into `null`, so a dead engine and an
   empty result looked identical to every caller and the panel just showed
   blank tables. This one distinguishes them and says which.
   ========================================================================= */

import { icon } from './icons.js';

const $  = id  => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/** Set innerHTML by id, tolerating a missing node. */
function html(id, content) {
  const el = $(id);
  if (el) el.innerHTML = content;
  return el;
}

/** Set textContent by id. */
function text(id, content) {
  const el = $(id);
  if (el) el.textContent = content;
  return el;
}

/** Escape for interpolation into markup. Used for anything server-supplied. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escape for use inside a JS string in an inline handler attribute. */
function jsq(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── api ─────────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

/**
 * Fetch JSON from the panel's own API.
 * Throws ApiError on transport failure or non-2xx — callers that want the
 * old silent behaviour use apiSoft().
 */
async function api(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new ApiError(`cannot reach panel API: ${e.message}`, 0, url);
  }

  let data = {};
  try { data = await res.json(); } catch { /* empty body is legal */ }

  if (!res.ok) {
    throw new ApiError(data.error || `${res.status} ${res.statusText}`, res.status, url);
  }
  return data;
}

/** api() that returns null instead of throwing, for optional/background reads. */
async function apiSoft(url, opts = {}) {
  try { return await api(url, opts); }
  catch (e) { console.warn('[panel]', url, e.message); return null; }
}

/**
 * Run an action, toast the outcome, and hand back success as a boolean.
 * Keeps every button handler from repeating the same try/catch/toast block.
 */
async function act(label, fn) {
  try {
    const r = await fn();
    toast(label);
    return r ?? true;
  } catch (e) {
    toast(`${label} failed — ${e.message}`, 'err');
    return false;
  }
}

// ── toast ───────────────────────────────────────────────────────────────────

function toast(msg, type = 'ok') {
  const host = $('toast');
  if (!host) return;
  const d = document.createElement('div');
  d.className = 'toast-item ' + type;
  d.setAttribute('role', type === 'err' ? 'alert' : 'status');
  d.textContent = msg;
  host.appendChild(d);
  setTimeout(() => {
    d.style.transition = 'opacity .2s, transform .2s';
    d.style.opacity = '0';
    d.style.transform = 'translateX(20px)';
    setTimeout(() => d.remove(), 220);
  }, 4200);
}

// ── render helpers ──────────────────────────────────────────────────────────

/** An empty-state block. Empty screens are an invitation to act, not a dash. */
function empty(title, hint) {
  return `<div class="empty"><strong>${esc(title)}</strong>${hint ? esc(hint) : ''}</div>`;
}

/** An empty-state row sized to a table. */
function emptyRow(cols, title, hint) {
  return `<tr><td colspan="${cols}"><div class="empty">`
       + `<strong>${esc(title)}</strong>${hint ? esc(hint) : ''}</div></td></tr>`;
}

/** A stat tile row from [{label, val, cls}]. */
function stats(items) {
  return items.map(s =>
    `<div class="stat"><div class="slabel">${esc(s.label)}</div>` +
    `<div class="sval ${s.cls || ''}">${esc(s.val)}</div></div>`
  ).join('');
}

function badge(state, label) {
  const cls = state === true ? 'up' : state === false ? 'down' : 'pending';
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function btn(label, onclick, cls = 'sec sm', glyph) {
  return `<button class="${cls}" onclick="${esc(onclick)}">`
       + (glyph ? icon(glyph, 12) : '') + esc(label) + `</button>`;
}

/** Icon-only button — carries an accessible name, since there's no text. */
function iconBtn(glyph, onclick, title, cls = 'sec sm') {
  return `<button class="${cls}" onclick="${esc(onclick)}" `
       + `title="${esc(title)}" aria-label="${esc(title)}">${icon(glyph, 12)}</button>`;
}

// ── formatters ──────────────────────────────────────────────────────────────

function bytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(1)) + ' ' + u[i];
}

function when(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? '—' : d.toLocaleString();
}

function day(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? '—' : d.toLocaleDateString();
}

// ── panel config, delivered by the server ───────────────────────────────────

const config = { domain: 'localhost', siteTitle: 'NexusPanel', port: 9000 };

async function loadConfig() {
  const c = await apiSoft('/ui/config');
  if (c) Object.assign(config, c);
  return config;
}

export {
  $, $$, html, text, esc, jsq,
  api, apiSoft, act, ApiError,
  toast, empty, emptyRow, stats, badge, btn, iconBtn,
  bytes, when, day,
  config, loadConfig,
};
