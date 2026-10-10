'use strict';
/**
 * clear-glass/src/page/attention.js — where each window's attention is (FN2, docs/2026-10-10-shape-of-nexus-phasemap.spec).
 * comp_id: clear-glass.page.attention
 * Version: 1.0.0
 *
 * James, 2026-10-10: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?"
 *
 * Nexus Nerve is the attention layer (docs/nexus-nerve.spec). Its per-window attention (P7) read Clear Glass's /bus/log,
 * which at the EVENTS level carries no event data — no agentId — and answers { level, count, entries }, not the array
 * Nerve looked for; so it never saw a window. This keeps what Nerve needs, small and per window, from the events Clear
 * Glass already emits: page changes (dom.*), and the interaction field (field.map, field.spotlight, field.pointer).
 * Observation only — nothing here acts. Served at GET /cli/attention (ipc/agent-routes.js).
 */

const MODULE_ID = 'clear-glass.page.attention';
const VERSION = '1.0.0';
const WINDOW_IDLE_MS = 15000;   // nerve's own WINDOW_STALE_MS
const FORGET_MS = 10 * 60000;   // a window silent this long is dropped

function createAttention({ now = () => Date.now() } = {}) {
  const wins = new Map();   // agentId → { agentId, url, lastMutation, mutationCount, field, spotlight, pointer, lastAt }
  const picks = [];         // §0.59.2 — elements handed to the agents from the Guardian picker (→ CLAUDE CODE), newest last
  const MAX_PICKS = 25;
  const win = (id) => { if (!wins.has(id)) wins.set(id, { agentId: id, url: null, lastMutation: 0, mutationCount: 0, field: null, spotlight: null, pointer: null, lastAt: 0 }); return wins.get(id); };

  /** note(type, data) — fed every Clear Glass bus event; keeps only what says where attention is */
  function note(type, data = {}) {
    if (type === 'dom.pick.sent' && data && data.selector) {
      picks.push({ n: (picks.length ? picks[picks.length - 1].n : 0) + 1, at: +data.ts || now(), selector: data.selector, xpath: data.xpath || null, url: data.url || null,
        title: data.title || null, label: data.label || null, tag: data.tag || null, text: String(data.text || '').slice(0, 600), html: String(data.html || '').slice(0, 2000), rect: data.rect || null });
      if (picks.length > MAX_PICKS) picks.splice(0, picks.length - MAX_PICKS);
      return true;
    }
    const id = data && data.agentId;
    if (!id || typeof type !== 'string') return false;
    const t = +data.ts || now();
    if (type.startsWith('dom.')) {
      const w = win(id);
      if (type === 'dom.injected' && data.url) w.url = data.url;
      else { w.lastMutation = Math.max(w.lastMutation, t); w.mutationCount++; }
      w.lastAt = Math.max(w.lastAt, t);
      return true;
    }
    if (type === 'field.map') { const w = win(id); w.field = { targets: +data.targets || 0, url: data.url || null, overlay: !!data.overlay, at: t }; if (data.url) w.url = data.url; w.lastAt = t; return true; }
    if (type === 'field.spotlight') { const w = win(id); w.spotlight = data.off ? null : { label: data.label || null, n: data.n ?? null, selector: data.selector || null, ok: data.ok !== false, at: t }; w.lastAt = t; return true; }
    if (type === 'field.pointer') { const w = win(id); w.pointer = { do: data.do || 'click', x: data.x, y: data.y, n: data.n ?? null, name: data.name || null, covered: !!data.covered, via: data.via || 'native', at: t }; w.lastAt = t; return true; }
    return false;
  }

  /** windows() → [{ agentId, lastMutation, msSinceLastMutation, mutationCount, idle, focus: { url, field, spotlight, pointer, at } }] newest first */
  function windows() {
    const t = now();
    for (const [id, w] of wins) if (t - w.lastAt > FORGET_MS) wins.delete(id);
    return [...wins.values()].sort((a, b) => b.lastAt - a.lastAt).map(w => ({
      agentId: w.agentId, lastMutation: w.lastMutation || null, msSinceLastMutation: w.lastMutation ? t - w.lastMutation : null,
      mutationCount: w.mutationCount, idle: t - w.lastAt > WINDOW_IDLE_MS,
      focus: { url: w.url, field: w.field, spotlight: w.spotlight, pointer: w.pointer, at: w.lastAt },
    }));
  }

  /** picks() → the elements handed to the agents, newest first */
  function pickList() { return picks.slice().reverse(); }

  return { note, windows, picks: pickList };
}

let _shared = null;
/** shared() — the one record for this Clear Glass process: main/index.js feeds it from the bus, /cli/attention reads it */
function shared() { return _shared || (_shared = createAttention()); }

module.exports = { MODULE_ID, VERSION, createAttention, shared };
