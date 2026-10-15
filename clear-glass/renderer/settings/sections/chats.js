'use strict';
/**
 * renderer/settings/sections/chats.js — Chat capture  (styles: chats.css)
 * 0.60.55 PI5. James, 2026-10-15: "make sure you add extensive settings for all of this, expand the settings the best you can."
 *
 * Every row is drawn from the one table in lib/chat-crawl-settings.js (cg.chats.schema()), so a setting, its default, its limits and its words cannot
 * drift apart. Saving goes through cg.chats.save(), which clamps every value and says what it changed. Per account: its own on/off switch, and an
 * override for each setting the table marks per:'account'. Everything starts OFF.
 */
(function () {
  const { cg, h, call, toast, pane, row, btn, chip, toggle, select, section } = window.CGS;

  function control(spec, value, onChange) {
    if (spec.type === 'bool') return toggle(!!value, (on) => onChange(on), spec.label);
    if (spec.type === 'enum') { const s = select(spec.options.map(o => ({ value: o, label: o })), value); s.addEventListener('change', () => onChange(s.value)); return s; }
    if (spec.type === 'list') { const t = h('textarea', { rows: 3, placeholder: 'one per line', 'aria-label': spec.label }); t.value = (value || []).join('\n'); t.addEventListener('change', () => onChange(t.value.split('\n').map(x => x.trim()).filter(Boolean))); return t; }
    const i = h('input', { type: 'number', min: spec.min, max: spec.max, value: String(value), 'aria-label': spec.label, class: 'num' });
    i.addEventListener('change', () => onChange(Number(i.value))); return i;
  }

  section({
    id: 'chats', group: 'Accounts & agents', icon: '⧉', label: 'Chat capture',
    keywords: 'chats capture crawl backfill catch up listener keywords links personal accounts chatgpt claude history import pace limits privacy',
    blurb: 'Reads your own chats on your own accounts, in the background, one at a time: every existing chat first, then only what is new. Off for every account until you turn it on.',
    related: ['accounts', 'privacy'],
    async render({ rerender }) {
      const [{ GROUPS, SCHEMA }, cur, providers, accounts] = await Promise.all([call(() => cg.chats.schema(), 'schema'), call(() => cg.chats.settings(), 'settings'),
        cg.accounts.portal.providers().catch(() => []), cg.accounts.list().catch(() => [])]);
      const state = { global: { ...cur.global }, accounts: JSON.parse(JSON.stringify(cur.accounts || {})) };
      let timer = null;
      const save = () => { clearTimeout(timer); timer = setTimeout(async () => {
        const r = await call(() => cg.chats.save({ global: state.global, accounts: state.accounts }), 'save');
        state.global = r.global; state.accounts = r.accounts;
        toast(r.notes && r.notes.length ? `Saved. ${r.notes.slice(0, 2).join(' ')}` : 'Saved', r.notes && r.notes.length ? 'warn' : undefined, r.notes && r.notes.length ? 7000 : undefined);
      }, 350); };

      const out = [h('div', { class: 'banner warn' }, h('div', {}, h('div', { class: 't', text: 'The crawler that reads these settings is not running yet' }),
        h('div', { class: 'd', text: 'These are saved, checked and kept (the plan they drive is built and tested: lib/chat-crawl-plan.js). Turning an account on does not read anything until the crawler ships in Clear Glass.' })))];

      // ── per account ──
      const accRows = [];
      for (const prov of providers) for (const a of accounts.filter(x => (x.agentKeys || []).includes(prov.id))) {
        const key = `${prov.id}:${a.id}`; const ov = state.accounts[key] = state.accounts[key] || {};
        const val = (spec) => (spec.key in ov ? ov[spec.key] : state.global[spec.key]);
        const details = h('details', { class: 'acct-more' }, h('summary', { text: 'This account’s own limits and lists' }),
          ...SCHEMA.filter(s => s.per === 'account' && s.key !== 'enabled').map(s => row(s.label, s.help + (s.key in ov ? '' : ' (using the general value)'), control(s, val(s), (v) => { ov[s.key] = v; save(); }))),
          btn('Use the general values', () => { for (const k of Object.keys(ov)) if (k !== 'enabled') delete ov[k]; save(); setTimeout(rerender, 450); }, 'sm ghost'));
        const spec = SCHEMA.find(s => s.key === 'enabled');
        const r = row(`${prov.name} · ${a.label}`, 'Capture this account’s chats', ov.enabled ? chip('on', 'ok') : chip('off', 'plain'),
          control(spec, !!ov.enabled, (v) => { ov.enabled = v; save(); setTimeout(rerender, 450); }));
        r.append(details); r.classList.add('acct-row'); r.style.setProperty('--prov', prov.color || 'var(--cyan)'); accRows.push(r);
      }
      out.push(pane({ title: 'Accounts', sub: 'Each account has its own switch. All are off.', flush: true, body: accRows.length ? accRows : h('div', { class: 'blurb', text: 'No accounts yet. Add one in Providers & accounts.' }) }));

      // ── the general settings, by group, straight from the table ──
      for (const g of GROUPS) {
        const specs = SCHEMA.filter(s => s.group === g && s.key !== 'enabled'); if (!specs.length) continue;
        out.push(pane({ title: g, flush: true, body: specs.map(s => row(s.label, s.help, control(s, state.global[s.key], (v) => { state.global[s.key] = v; save(); }))) }));
      }
      out.push(pane({ title: 'Defaults', flush: true, body: [row('Reset every setting on this page', 'Back to the defaults above, with every account off.',
        btn('Reset', async () => { state.global = {}; state.accounts = {}; await call(() => cg.chats.save({ global: {}, accounts: {} }), 'reset'); toast('Reset'); rerender(); }, 'sm danger'))] }));
      return out;
    },
  });
})();
