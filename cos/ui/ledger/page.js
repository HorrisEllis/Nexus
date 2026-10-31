/**
 * cos/ui/ledger/page.js — the supervisor's ledger, newest first, live from the bus (MOD-MG-UI-LEDGER). MG18, 0.60.336.
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus." Read-only: it hears cos.ledger and never polls.
 */
(async function () {
  'use strict';
  const { h } = COS; const $ = (id) => document.getElementById(id);
  const S = { entries: [], system: '', kinds: new Set(), q: '', shown: 200, fresh: new Set() };
  try { await COS.page('ledger'); } catch (e) { return e.down ? COS.down($('feed'), e.message) : COS.say($('feed'), { glyph: 'x', title: 'This page could not start', text: COS.esc(e.message) }); }

  try {
    const [l, s] = await Promise.all([COS.call('GET', '/api/cos/ledger?limit=2000'), COS.call('GET', '/api/cos/systems')]);
    S.entries = l.entries.reverse();
    $('f-system').replaceChildren(h('option', { value: '' }, 'All systems'), ...s.systems.map(x => h('option', { value: x.name }, x.name)));
  } catch (e) { return e.down ? COS.down($('feed'), e.message) : COS.say($('feed'), { glyph: 'x', title: 'The ledger could not be read', text: COS.esc(e.message) }); }

  const sysParam = COS.param('system'); if (sysParam) { S.system = sysParam; $('f-system').value = sysParam; }
  $('f-system').onchange = (e) => { S.system = e.target.value; render(); };
  $('f-q').oninput = (e) => { S.q = e.target.value.toLowerCase(); render(); };

  function kinds() {
    const all = [...new Set(S.entries.map(e => e.kind))].sort();
    $('f-kind').replaceChildren(...all.map(k => h('button', { class: 'chip', 'aria-pressed': String(S.kinds.has(k)), onclick: () => { S.kinds.has(k) ? S.kinds.delete(k) : S.kinds.add(k); render(); } },
      k, h('span', { class: 'n' }, String(S.entries.filter(e => e.kind === k).length)))));
  }
  const byClass = (by) => /^person/.test(by || '') ? 'person' : /^agent/.test(by || '') ? 'agent' : '';
  function render() {
    kinds();
    const list = S.entries.filter(e => (!S.system || e.system === S.system) && (!S.kinds.size || S.kinds.has(e.kind))
      && (!S.q || `${e.why} ${e.by} ${e.pid} ${e.system} ${e.kind}`.toLowerCase().includes(S.q)));
    if (!S.entries.length) return COS.say($('feed'), { glyph: 'list', title: 'The ledger is empty', text: 'The supervisor writes a line before every act. Nothing has been done yet.' });
    if (!list.length) return COS.say($('feed'), { glyph: 'search', title: 'Nothing matches', text: 'No line has that system, kind or text.' });
    const out = []; let day = '';
    for (const e of list.slice(0, S.shown)) {
      const d = new Date(e.ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); if (d !== day) { day = d; out.push(h('div', { class: 'day' }, d)); }
      out.push(h('div', { class: `row${S.fresh.has(e.id) ? ' fresh' : ''}`, 'data-k': e.kind, title: `${new Date(e.ts).toISOString()} · id ${e.id}` },
        h('span', { class: 'rail' }), h('span', { class: 't' }, COS.clock(e.ts)), h('span', { class: 'mk' }), h('span', { class: 'kind' }, e.kind),
        e.system ? h('span', { class: 'sys', onclick: () => COS.navigate(`#/c/${encodeURIComponent(e.system)}`) }, e.system) : h('span', { class: 'faint' }, 'COS'),
        h('span', { class: 'why' }, e.why || ''), h('span', { class: `by ${byClass(e.by)}` }, `${e.by}${e.pid ? ` · pid ${e.pid}` : ''}${e.code != null ? ` · code ${e.code}` : ''}`)));
    }
    if (list.length > S.shown) out.push(h('div', { class: 'more' }, h('button', { class: 'btn sm', onclick: () => { S.shown += 300; render(); } }, `Show ${Math.min(300, list.length - S.shown)} older`)));
    $('feed').replaceChildren(...out); S.fresh.clear();
  }
  COS.on('cos.ledger', ({ entry }) => { S.entries.unshift(entry); S.fresh.add(entry.id); render(); });
  render();
})();
