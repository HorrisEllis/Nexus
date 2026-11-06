'use strict';
/**
 * renderer/element-engine/sections/eros-options.js — Element Engine → ErosmancerOS options  (styles: eros-options.css). EE3a, 0.60.416.
 * Every ErosmancerOS option in plain words (ES1): change it, or put it back to its default; the ones fixed in its code are shown, changed
 * only in Edit TypeScript. The same store as `eros options` / `eros set` (GET/POST /cli/eros/options); each change recorded (§17.12).
 */
(function () {
  const { h, busy, pane, row, btn, chip, select, toast, goto, section } = window.CGS;
  const { api, matches } = window.CGL;
  const show = (v) => (Array.isArray(v) ? v.join(', ') : String(v));

  section({
    id: 'eros-options', group: 'ErosmancerOS', icon: '⚙', label: 'Options',
    keywords: 'erosmancer pace behaviour routing selector telemetry replay',
    blurb: 'How ErosmancerOS moves and finds things, in plain words. Pace and how actions are sent apply now; the rest the next time it connects.',
    async render({ rerender, query }) {
      const d = await api('/cli/eros/options');
      const O = (d.options || []).filter(o => matches(query, o.key, o.words, o.does, o.section));
      const secs = [...new Set(O.map(o => o.section || 'Options'))];
      const set = async (b, body, words) => busy(b, async () => {
        const r = await api('/cli/eros/options', { method: 'POST', body: { ...body, by: 'james (Element Engine page)' } });
        toast(`${r.words || words}: ${show(r.value)}${r.applied ? ` · applied ${r.applied}` : r.note ? ` · ${r.note}` : ''}`); rerender();
      });
      const panes = secs.map(s => pane({ title: s, flush: true, body: O.filter(o => (o.section || 'Options') === s).map(o => {
        const input = o.kind === 'enum' ? select(o.allowed.map(a => ({ value: a, label: a })), o.value) : h('input', { type: 'text', class: 'mono', value: show(o.value), placeholder: show(o.default), 'aria-label': o.words });
        const apply = btn('Set', (e) => set(e.currentTarget, { key: o.key, value: input.value }, o.words), 'sm primary');
        if (input.tagName === 'INPUT') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply.click(); });
        return row(`${o.words}${o.kind === 'ms' ? ' (ms)' : ''}`, `${o.does} · default ${show(o.default)}${o.when === 'live' ? '' : ' · at the next connect'}`,
          o.changed ? chip('yours', 'warn') : chip('default'), input, apply,
          o.changed ? btn('Default', (e) => set(e.currentTarget, { key: o.key, reset: true }, o.words), 'sm') : null);
      }) }));
      const fixed = (d.fixed || []).filter(f => matches(query, f.key, f.does));
      if (fixed.length) panes.push(pane({ title: 'Fixed in its code', sub: 'Changed only by editing its TypeScript', tools: btn('Edit TypeScript', () => goto('typescript'), 'sm'), flush: true,
        body: fixed.map(f => row(f.key, f.does, h('code', { class: 'ee-sel', text: JSON.stringify(f.value) }))) }));
      return panes;
    },
  });
})();
