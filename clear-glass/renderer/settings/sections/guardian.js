'use strict';
/**
 * renderer/settings/sections/guardian.js — Guardian  (styles: guardian.css)
 *
 * §0.60.218 SP4 — James, 2026-10-23: "Cleardriver, agentmesh and guardian setting." Guardian had no settings section in Clear Glass. One
 * place for what Clear Glass does for it: page listeners on or off (options guardian.listen → findListenersForUrl), chat capture on or off
 * (guardian.capture → the chat ledger), and listener decay (listenerDecay, which existed since 0.39.265 with no control). A site's own choice
 * in Site settings wins over the first two.
 */
(function () {
  const { cg, h, call, toast, field, pane, row, toggle, section, goto, btn, chip } = window.CGS;
  const setOpt = (patch, msg) => call(() => cg.options.set(patch), 'save').then(() => msg && toast(msg));

  function days(cur, save) {
    const i = h('input', { type: 'number', value: String(cur), min: '1', max: '365' });
    i.addEventListener('change', () => {
      const n = Number(i.value);
      if (!Number.isInteger(n) || n < 1 || n > 365) { toast(`Days are 1 to 365 (got ${i.value})`, 'bad'); i.value = String(cur); return; }
      cur = n; save(n).catch(e => toast(e.message, 'bad'));
    });
    return i;
  }

  section({
    id: 'guardian', group: 'Agents', icon: '⛨', label: 'Guardian',
    keywords: 'guardian listeners listen capture chats ledger decay pages',
    blurb: 'What Clear Glass does for Guardian: page listeners, chat capture, and how long an unused listener lasts. A site’s own choice in Site settings wins.',
    async render() {
      const o = await call(() => cg.options.get(), 'options');
      const g = { listen: true, capture: true, ...(o.guardian || {}) };
      const dec = { enabled: true, disableAfterDays: 14, removeAfterDays: 30, ...(o.listenerDecay || {}) };
      const listen = toggle(g.listen !== false, (on) => setOpt({ guardian: { listen: on } }, on ? 'Guardian listens on pages' : 'Guardian listens on no page unless a site allows it'), 'Page listeners');
      const capture = toggle(g.capture !== false, (on) => setOpt({ guardian: { capture: on } }, on ? 'Chats are captured' : 'Chats are not captured unless a site allows it'), 'Chat capture');
      const decay = toggle(dec.enabled !== false, (on) => setOpt({ listenerDecay: { ...dec, enabled: on } }), 'Listener decay');
      listen.dataset.opt = 'guardian.listen'; capture.dataset.opt = 'guardian.capture'; decay.dataset.opt = 'listenerDecay.enabled';
      const off = days(dec.disableAfterDays, (n) => { dec.disableAfterDays = n; return setOpt({ listenerDecay: { ...dec } }, `Unused listeners switch off after ${n} days`); });
      const rm = days(dec.removeAfterDays, (n) => { dec.removeAfterDays = n; return setOpt({ listenerDecay: { ...dec } }, `Switched-off listeners are removed after ${n} days`); });
      const n = Object.keys(o.listeners || {}).length;
      return [
        pane({ title: 'Pages', flush: true, body: [
          row('Page listeners', `Listeners you set with the picker fire on their pages. ${n} saved.`, listen),
          row('Chat capture', 'Every chat with an agent is kept in the chat ledger as it is written.', capture),
        ] }),
        pane({ title: 'Listener decay', sub: 'A pinned listener never decays.', flush: true, body: [
          row('Unused listeners decay', null, decay),
          row('Switch off after (days)', null, off),
          row('Remove after (days)', null, rm),
        ] }),
        pane({ title: 'Per site', flush: true, body: row('Site settings', 'Turn listeners or capture off, or on, for one site.', btn('Open', () => goto('sites'), 'sm'), chip('wins over these', 'plain')) }),
      ];
    },
  });
})();
