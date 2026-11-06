'use strict';
/**
 * renderer/element-engine/sections/overview.js — Element Engine → Overview  (styles: overview.css). EE3a, 0.60.416.
 * James, 2026-11-06: "It needs to have a full page to edit, change and add. Like it needs to be fully featured."
 * The switch, what is in use, Pick an element, Update lists, ErosmancerOS's state and his copy — each a link into its area.
 * Reads GET /cli/element-engine/overview (bridge) and /eros-supervisor (wire); sets through POST /cli/adblock/enabled|update.
 */
(function () {
  const { h, busy, pane, row, btn, chip, toggle, goto, wire, toast, section } = window.CGS;
  const { api } = window.CGL; const { pick } = window.CGE;
  const stat = (n, label, to) => h('button', { class: 'ee-stat', onclick: to ? () => goto(to) : null, title: to ? `Open ${label}` : null },
    h('b', { text: typeof n === 'number' ? n.toLocaleString('en') : String(n) }), h('span', { text: label }));

  section({
    id: 'overview', group: 'Ad blocking', icon: '🛡', label: 'Overview',
    keywords: 'adblock ad blocker element engine status picker',
    blurb: 'One engine for what Clear Glass does with a page’s elements: ad blocking, hiding what you point at, the Guardian picker, and ErosmancerOS. Was the Ad Blocker; your lists, filters and allowed sites are the same ones.',
    async render({ rerender }) {
      const o = await api('/cli/element-engine/overview');
      let sup = null; try { sup = await wire('/eros-supervisor', { allowNotOk: true }); } catch (_) {}
      const b = o.blocker;
      const out = [];
      if (!b) out.push(pane({ body: h('div', { class: 'empty', text: o.note || 'The blocker is not running.' }) }));
      else {
        out.push(pane({ title: 'Blocking', sub: b.enabled ? 'On for every site you have not allowed' : 'Off: nothing is blocked or hidden',
          tools: toggle(b.enabled, async (on) => { await api('/cli/adblock/enabled', { method: 'POST', body: { on } }); toast(on ? 'Blocking is on' : 'Blocking is off'); rerender(); }, 'Block ads and trackers'),
          body: h('div', { class: 'ee-stats' },
            stat(b.network, 'blocking rules', 'lists'), stat(b.cosmetic, 'hiding rules', 'lists'),
            stat(`${b.lists.filter(l => l.on).length} / ${b.lists.length}`, 'filter lists on', 'lists'),
            stat(b.hidden, 'elements you hid', 'hidden'), stat(b.allowed.length, 'allowed sites', 'allowed'),
            stat(String(b.custom || '').split('\n').filter(l => l.trim() && !l.trim().startsWith('!')).length, 'lines in My filters', 'filters')) }));
        const failing = b.lists.filter(l => l.on && l.error);
        out.push(pane({ title: 'Do', body: [
          row('Pick an element', 'The browser window comes forward and the Guardian picker starts. After a pick, the bar under the page offers Hide this element, Gate this element and Bind a key.', btn('Pick an element', (e) => pick(e.currentTarget), 'primary')),
          row('Update every list now', failing.length ? `${failing.length} list(s) failed last time: ${failing.map(l => l.title).join(', ')}` : 'Lists update on their own; this fetches them now.',
            btn('Update now', (e) => busy(e.currentTarget, async () => { const r = await api('/cli/adblock/update', { method: 'POST', body: { id: 'all' } }); toast(r.ok === false ? 'Some lists failed' : 'Lists updated', r.ok === false ? 'bad' : 'ok'); rerender(); }))),
        ] }));
      }
      const st = sup && (sup.state || (sup.ok === false ? 'not answering' : null));
      out.push(pane({ title: 'ErosmancerOS', sub: 'Its own process, started by Clear Glass', body: [
        row(`State: ${st || 'not answering'}`, sup && (sup.lastError || sup.why) ? (sup.lastError || sup.why) : (sup && sup.port ? `port ${sup.port}` : 'Options, threats and the workbench are in the ErosmancerOS group.'),
          chip(st || 'not answering', st === 'running' || st === 'connected' ? 'ok' : 'warn'), btn('Options', () => goto('eros-options')), btn('Threats', () => goto('threats'))),
        row('Your TypeScript copy', o.copy && o.copy.exported ? `${o.copy.files} file${o.copy.files === 1 ? '' : 's'} in ${o.copy.dir}${o.copy.changed ? ` · ${o.copy.changed} changed` : ''}` : `Not exported yet (it goes to ${o.copy && o.copy.dir})`,
          btn('Edit TypeScript', () => goto('typescript'))),
      ] }));
      return out;
    },
  });
})();
