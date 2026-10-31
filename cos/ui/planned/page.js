/**
 * cos/ui/planned/page.js — the contract's planned pages, each with its phase, what it will do and what it waits on. MG18, 0.60.336.
 * Read from the manager's contract (GET /api/cos/contract), so this list and the rail cannot disagree.
 */
(async function () {
  'use strict';
  const { h } = COS; const $ = (id) => document.getElementById(id);
  try { await COS.page('planned'); } catch (e) { return e.down ? COS.down($('road'), e.message) : COS.say($('road'), { glyph: 'x', title: 'This page could not start', text: COS.esc(e.message) }); }
  const c = (await COS.call('GET', '/api/cos/contract')).contract;
  $('road').replaceChildren(...(c.planned || []).map(p => h('article', { class: 'plan panel rise' },
    h('span', { class: 'phase' }, p.phase), h('h3', {}, p.title), h('p', {}, p.does),
    h('div', { class: 'waits' }, h('span', { class: 'eyebrow', style: 'align-self:center;margin-right:4px' }, 'waits on'), ...(p.waitsOn || []).map(w => h('span', { class: 'tag' }, w.replace(/_/g, ' ')))))));
})();
