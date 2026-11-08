/* cos/ui/hub/page.js — the Hub page (OC8a, 0.60.446; docs/orchestration-console.spec MOD-OC-HUB-PAGE).
   James, 2026-11-08: "queues, contracts, dag, it should all be there, waiting to be wired in." Each slot: its state, what it does, its owner,
   its route, and why (who answered, or the phase that wires it). Reads only COS's own route. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else if (v != null) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c) e.appendChild(c); return e; };
  async function read() {
    try {
      const r = await fetch('/api/cos/hub'); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.error || `refused (${r.status})`);
      $('hub-sum').textContent = `${d.wired} wired · ${d.waiting} waiting · ${d.down} down`;
      $('hub-list').replaceChildren(...d.slots.map(s => el('div', { class: 'hub-row', 'data-slot': s.id, 'data-state': s.state }, [
        el('span', { class: 'hub-state s-' + s.state, text: s.state }), el('b', { text: s.id }),
        el('span', { class: 'hub-owner', text: s.owner ? `${s.owner}${s.route ? ' · ' + s.route : ''}` : 'no owner yet' }),
        el('div', { class: 'hub-detail', text: [s.does, s.why, s.moves || ''].filter(Boolean).join(' · ') })])));
    } catch (e) { $('hub-sum').textContent = `COS's manager did not answer: ${e.message}`; }
  }
  read(); setInterval(() => { if (!document.hidden) read(); }, 10000);
  window.HUB = { read };
})();
