'use strict';
/**
 * renderer/element-engine/sections/hidden.js — Element Engine → Hidden elements  (styles: hidden.css). EE3a, 0.60.416.
 * Every element-hiding rule in his filters, by site: add one by hand, change one, take one out, or Pick on a page (the picker's Hide writes
 * the same line, EE2). GET/POST /cli/element-engine/hidden (src/element-engine/index.js); a change is his (person:true).
 */
(function () {
  const { h, busy, pane, row, btn, chip, empty, field, modal, toast, confirmDo, section } = window.CGS;
  const { api, matches } = window.CGL; const { his, say, pick } = window.CGE;

  async function editRule(r, rerender) {
    const site = h('input', { type: 'text', value: r ? r.site : '', placeholder: 'example.com (empty: every site)' });
    const sel = h('input', { type: 'text', class: 'mono', value: r ? r.selector : '', placeholder: '.banner, #ad-slot, div[data-ad]' });
    const exc = h('input', { type: 'checkbox', checked: r ? r.exception : false });
    const done = await modal({ title: r ? 'Change a hidden element' : 'Hide an element', body: [
      field('Site', site, 'Only this site (and its subdomains). Empty hides it on every site.'),
      field('What to hide (a CSS selector)', sel, 'Pick an element on the page to get one, or write it.'),
      h('label', { class: 'field' }, h('span', { text: 'Exception' }), h('span', {}, exc, ' Show it here even if a list hides it (#@#)')),
    ], actions: [{ label: r ? 'Save' : 'Hide', primary: true, run: () => his('/cli/element-engine/hidden', r
      ? { op: 'edit', rule: r.rule, site: site.value, selector: sel.value, exception: exc.checked }
      : { op: 'add', site: site.value, selector: sel.value, exception: exc.checked }) }] });
    if (done) { say(done); rerender(); }
  }

  section({
    id: 'hidden', group: 'Elements', icon: '◌', label: 'Hidden elements',
    keywords: 'hide cosmetic element picker selector',
    blurb: 'What you hide on pages: one line in My filters per element. Changes show on the next page load.',
    async render({ rerender, query }) {
      const r = await api('/cli/element-engine/hidden');
      const all = r.rules || []; const L = all.filter(x => matches(query, x.site, x.selector));
      const bySite = new Map(); for (const x of L) { const k = x.site || ''; if (!bySite.has(k)) bySite.set(k, []); bySite.get(k).push(x); }
      const sites = [...bySite.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
      const top = pane({ title: 'Hide something', body: [
        h('div', { class: 'ee-bar' }, btn('Pick an element on the page', (e) => pick(e.currentTarget), 'primary'), btn('Write a rule…', () => editRule(null, rerender))),
      ] });
      const list = sites.map(s => [h('div', { class: 'ee-site', text: s || 'every site' }), ...bySite.get(s).map(x => {
        const rw = row(x.selector, x.exception ? 'shown here even if a list hides it' : null,
          x.exception ? chip('exception', 'warn') : null,
          btn('Change', () => editRule(x, rerender), 'sm'),
          btn('Remove', async (e) => { if (!await confirmDo('Show this element again?', `${x.rule}`, 'Remove')) return; await busy(e.target, async () => { say(await his('/cli/element-engine/hidden', { op: 'remove', rule: x.rule })); rerender(); }); }, 'sm danger'));
        rw.querySelector('.t').classList.add('ee-sel'); return rw;
      })]);
      return [top, pane({ title: query ? `${L.length} of ${all.length}` : `${all.length} hidden`, flush: true, body: list.length ? list : empty('Nothing hidden yet. Pick an element on a page, then Hide.') })];
    },
  });
})();
