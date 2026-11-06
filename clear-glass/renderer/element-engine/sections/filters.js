'use strict';
/**
 * renderer/element-engine/sections/filters.js — Element Engine → My filters  (styles: filters.css). EE3a, 0.60.416.
 * His own filters, the whole text, in a real editor: saved through POST /cli/adblock/rules {person:true} (his to write, AB4). The elements he
 * hides (Hidden elements, the picker's Hide) are lines of this same text.
 */
(function () {
  const { h, busy, pane, btn, toast, confirmDo, section } = window.CGS;
  const { api } = window.CGL; const { his } = window.CGE;
  const count = (t) => String(t).split('\n').filter(l => l.trim() && !l.trim().startsWith('!')).length;

  section({
    id: 'filters', group: 'Ad blocking', icon: '✎', label: 'My filters',
    keywords: 'custom rules abp ublock syntax',
    blurb: 'Your own rules, Adblock Plus / uBlock syntax, one per line. ||ads.example.com^ blocks a host; example.com##.banner hides an element on one site; ##.banner on every site; @@||example.com^ allows. Lines starting with ! are notes.',
    async render({ rerender }) {
      const o = await api('/cli/element-engine/overview');
      const saved = (o.blocker && o.blocker.custom) || '';
      const ta = h('textarea', { class: 'ee-big', spellcheck: 'false', 'aria-label': 'My filters', value: saved });
      const meta = h('div', { class: 'ee-meta' });
      const upd = () => { meta.textContent = `${count(ta.value)} rule line(s)${ta.value !== saved ? ' · not saved' : ''}`; };
      ta.addEventListener('input', upd);
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save.click(); } });
      const save = btn('Save', (e) => busy(e.currentTarget, async () => {
        const r = await his('/cli/adblock/rules', { text: ta.value });
        toast(`${r.rules} of your filters in use${r.skipped ? `, ${r.skipped} skipped (${Object.keys(r.skippedBy || {}).join(', ')})` : ''}`, r.skipped ? 'bad' : 'ok', 6000); rerender();
      }), 'primary');
      const revert = btn('Revert', async () => { if (ta.value === saved || await confirmDo('Throw away your edits?', 'The box goes back to what is saved.', 'Revert')) { ta.value = saved; upd(); } });
      upd();
      return pane({ title: 'My filters', sub: 'Ctrl+S saves', tools: h('div', { class: 'acts' }, revert, save), body: [ta, meta] });
    },
  });
})();
