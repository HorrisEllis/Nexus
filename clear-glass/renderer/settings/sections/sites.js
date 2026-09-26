'use strict';
/**
 * renderer/settings/sections/sites.js — Site settings  (styles: sites.css)
 *
 * §BUILT 2026-09-26 — James: "expand per site settings." Was one pane
 * inside Privacy: a list of origins with Show (raw JSON) and Reset. Now
 * its own area, and every control here is ENFORCED somewhere — nothing is
 * a setting that nothing reads:
 *   permission:<name>  'allow' | 'deny'  → plugins/permissions (Electron's
 *                      permission request handler, per tab session)
 *   zoomFactor         number            → renderer/browser.js restores it
 *                      per origin on every navigation
 *   contentFilter      'off'             → src/plugins/webrequest-adapter.js
 *                      skips content filters (adblocker…) for pages on it
 * Any other key someone stored (the CLI's /site, a plugin) is listed as-is
 * and can be deleted or edited, never silently dropped.
 */
(function () {
  const { cg, h, call, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, select, section } = window.CGS;

  // Electron permission names. HIGH_RISK mirrors plugins/permissions/index.js:
  // with no per-site choice those are blocked, everything else is allowed.
  const HIGH_RISK = new Set(['media', 'geolocation']);
  const PERMS = [
    ['media', 'Camera and microphone'], ['geolocation', 'Location'], ['notifications', 'Notifications'],
    ['clipboard-read', 'Read clipboard'], ['clipboard-sanitized-write', 'Write clipboard'], ['display-capture', 'Screen capture'],
    ['fullscreen', 'Full screen'], ['pointerLock', 'Pointer lock'], ['keyboardLock', 'Keyboard lock'],
    ['midi', 'MIDI devices'], ['midiSysex', 'MIDI system messages'], ['idle-detection', 'Idle detection'],
    ['window-management', 'Window management'], ['openExternal', 'Open other apps (links)'], ['storage-access', 'Third-party storage access'],
  ];
  const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const KNOWN = new Set(['zoomFactor', 'contentFilter', ...PERMS.map(([p]) => `permission:${p}`)]);
  const label = Object.fromEntries(PERMS);

  function summary(all) {
    const out = [];
    for (const [k, v] of Object.entries(all || {})) {
      if (k.startsWith('permission:')) out.push(chip(`${label[k.slice(11)] || k.slice(11)}: ${v === 'allow' ? 'allowed' : 'blocked'}`, v === 'allow' ? 'ok' : 'bad'));
      else if (k === 'zoomFactor') out.push(chip(`Zoom ${Math.round(Number(v) * 100)}%`, 'plain'));
      else if (k === 'contentFilter' && v === 'off') out.push(chip('Blocking off', 'warn'));
      else out.push(chip(`${k}`, 'plain'));
    }
    return out;
  }

  function normalizeOrigin(input) {
    let v = String(input || '').trim();
    if (!v) return null;
    if (!/^[a-z]+:\/\//i.test(v)) v = (/^(localhost|127\.|\[::1\])/.test(v) ? 'http://' : 'https://') + v;
    try { const u = new URL(v); return `${u.protocol}//${u.host}`; } catch (_) { return null; }
  }

  async function editor(origin, rerender) {
    const all = await call(() => cg.siteSettings.getAll(origin), 'site settings');
    const permSel = Object.fromEntries(PERMS.map(([p]) => {
      const cur = all[`permission:${p}`];
      return [p, select([{ value: '', label: `Default (${HIGH_RISK.has(p) ? 'block' : 'allow'})` }, { value: 'allow', label: 'Allow' }, { value: 'deny', label: 'Block' }], cur === 'allow' || cur === 'deny' ? cur : '')];
    }));
    const zoom = select([{ value: '', label: 'Default (100%)' }, ...ZOOMS.map(z => ({ value: String(z), label: `${Math.round(z * 100)}%` }))], all.zoomFactor ? String(all.zoomFactor) : '');
    if (all.zoomFactor && !ZOOMS.includes(Number(all.zoomFactor))) zoom.append(h('option', { value: String(all.zoomFactor), text: `${Math.round(all.zoomFactor * 100)}% (current)`, selected: 'selected' }));
    const filter = select([{ value: '', label: 'On (default)' }, { value: 'off', label: 'Off for this site' }], all.contentFilter === 'off' ? 'off' : '');
    const others = Object.entries(all).filter(([k]) => !KNOWN.has(k));
    const otherRows = others.map(([k, v]) => {
      const inp = h('input', { type: 'text', class: 'mono', value: typeof v === 'string' ? v : JSON.stringify(v) });
      const del = h('input', { type: 'checkbox' });
      return { k, inp, del, node: h('div', { class: 'kv' }, h('code', { text: k }), inp, h('label', { class: 'check' }, del, h('span', { text: ' delete' }))) };
    });
    const newKey = h('input', { type: 'text', class: 'mono', placeholder: 'key' });
    const newVal = h('input', { type: 'text', class: 'mono', placeholder: 'value (text, number, true/false)' });
    const r = await modal({ title: origin, wide: true, body: [
      h('h3', { class: 'sub-h', text: 'Permissions' }),
      h('div', { class: 'perm-grid' }, PERMS.map(([p, l]) => field(l, permSel[p]))),
      h('h3', { class: 'sub-h', text: 'Page' }),
      h('div', { class: 'grid' }, field('Zoom', zoom, 'Restored every time you open this site'), field('Content blocking', filter, 'Ad and tracker filters for pages on this site')),
      h('h3', { class: 'sub-h', text: 'Other stored values' }),
      otherRows.length ? h('div', { class: 'kv-list' }, otherRows.map(o => o.node)) : h('p', { class: 'blurb', text: 'None. Values stored by the co-pilot CLI (/site key value) or a plugin show up here.' }),
      h('div', { class: 'kv' }, newKey, newVal),
    ], actions: [{ label: 'Save', primary: true, run: async () => {
      const ops = [];
      for (const [p] of PERMS) {
        const k = `permission:${p}`, v = permSel[p].value;
        if (!v && all[k] !== undefined) ops.push(() => cg.siteSettings.deleteKey(origin, k));
        else if (v && all[k] !== v) ops.push(() => cg.siteSettings.set(origin, k, v));
      }
      if (!zoom.value && all.zoomFactor !== undefined) ops.push(() => cg.siteSettings.deleteKey(origin, 'zoomFactor'));
      else if (zoom.value && Number(zoom.value) !== Number(all.zoomFactor)) ops.push(() => cg.siteSettings.set(origin, 'zoomFactor', Number(zoom.value)));
      if (!filter.value && all.contentFilter !== undefined) ops.push(() => cg.siteSettings.deleteKey(origin, 'contentFilter'));
      else if (filter.value && all.contentFilter !== filter.value) ops.push(() => cg.siteSettings.set(origin, 'contentFilter', filter.value));
      const parse = (s) => { try { return JSON.parse(s); } catch (_) { return s; } };
      for (const o of otherRows) {
        if (o.del.checked) ops.push(() => cg.siteSettings.deleteKey(origin, o.k));
        else if (o.inp.value !== (typeof all[o.k] === 'string' ? all[o.k] : JSON.stringify(all[o.k]))) ops.push(() => cg.siteSettings.set(origin, o.k, parse(o.inp.value)));
      }
      if (newKey.value.trim()) {
        if (KNOWN.has(newKey.value.trim())) throw new Error(`${newKey.value.trim()} has its own control above.`);
        ops.push(() => cg.siteSettings.set(origin, newKey.value.trim(), parse(newVal.value)));
      }
      for (const op of ops) { const res = await op(); if (res === false) throw new Error(`${origin} isn’t a valid site address.`); }
      return ops.length;
    } }] });
    if (r !== null) { toast(r ? `${origin}: ${r} change${r === 1 ? '' : 's'} saved` : 'No changes'); rerender(); }
  }

  async function copyTo(from, origins, rerender) {
    const target = h('input', { type: 'text', placeholder: 'example.com', list: 'site-origins' });
    const dl = h('datalist', { id: 'site-origins' }, origins.filter(o => o !== from).map(o => h('option', { value: o })));
    const r = await modal({ title: `Copy ${from}’s settings`, body: [field('To site', target, 'Existing values there are overwritten key by key'), dl],
      actions: [{ label: 'Copy', primary: true, run: async () => {
        const to = normalizeOrigin(target.value);
        if (!to) throw new Error('Enter a site address.');
        if (to === from) throw new Error('Pick a different site.');
        const all = await call(() => cg.siteSettings.getAll(from), 'read');
        for (const [k, v] of Object.entries(all)) await cg.siteSettings.set(to, k, v);
        return to;
      } }] });
    if (r) { toast(`Copied to ${r}`); rerender(); }
  }

  section({
    id: 'sites', group: 'Browser', icon: '◎', label: 'Site settings',
    keywords: 'site settings per site origin permissions camera microphone location notifications clipboard zoom adblock content blocking exceptions',
    blurb: 'Choices Clear Glass remembers per site: permissions, zoom, and whether ad and tracker blocking runs there. Sites with no choice follow the defaults below.',
    async render({ tools, rerender, query }) {
      const origins = await call(() => cg.siteSettings.listOrigins(), 'sites');
      const q = (query || '').toLowerCase();
      tools.append(btn('Add a site', async () => {
        const inp = h('input', { type: 'text', placeholder: 'example.com' });
        const o = await modal({ title: 'Add a site', body: [field('Site address', inp)], actions: [{ label: 'Next', primary: true, run: () => { const v = normalizeOrigin(inp.value); if (!v) throw new Error('Enter a site address.'); return v; } }] });
        if (o) editor(o, rerender).catch(e => toast(e.message, 'bad'));
      }, 'primary'));
      const filterInp = h('input', { type: 'search', placeholder: 'Filter sites', value: q });
      const listBox = h('div');
      const details = await Promise.all(origins.map(async o => ({ o, all: await cg.siteSettings.getAll(o).catch(() => ({})) })));
      const paint = () => {
        const f = filterInp.value.trim().toLowerCase();
        const shown = details.filter(d => !f || d.o.toLowerCase().includes(f));
        listBox.replaceChildren(...(shown.length ? shown.map(({ o, all }) => {
          const r = row(o, null,
            btn('Edit', () => editor(o, rerender).catch(e => toast(e.message, 'bad')), 'sm primary'),
            btn('Copy to…', () => copyTo(o, origins, rerender).catch(e => toast(e.message, 'bad')), 'sm'),
            btn('Reset', async () => { if (await confirmDo(`Reset ${o}?`, 'Every choice for this site is removed; it follows the defaults again.', 'Reset')) await busy(null, async () => { await cg.siteSettings.clear(o); toast(`Reset ${o}`); rerender(); }); }, 'sm danger'));
          r.querySelector('.what').append(h('div', { class: 'chips' }, summary(all)));
          return r;
        }) : [empty(origins.length ? 'No site matches.' : 'No site has its own settings yet. Allow or block a permission when a site asks, change zoom on a page, or add one here.')]));
      };
      filterInp.addEventListener('input', paint);
      paint();
      return [
        pane({ title: 'Sites', sub: `${origins.length} site${origins.length === 1 ? '' : 's'} with their own settings`, tools: filterInp, flush: true, body: listBox }),
        pane({ title: 'Defaults', flush: true, body: [
          row('Camera, microphone and location', 'Blocked unless a site is allowed here. You see a notice each time one is blocked.', chip('block', 'bad')),
          row('Other permissions', 'Notifications, clipboard, full screen and the rest are allowed unless a site is blocked here.', chip('allow', 'ok')),
          row('Zoom', 'Each site keeps the zoom you last set on it.', chip('100%', 'plain')),
          row('Content blocking', 'The ad and tracker filters run on every site unless turned off for it here.', chip('on', 'ok')),
          row('Reset every site', null, btn('Reset all', async () => { if (await confirmDo('Reset every site?', 'All per-site choices are removed. Sites will follow the defaults again.', 'Reset all')) await busy(null, async () => { await cg.siteSettings.clearAll(); rerender(); }); }, 'sm danger')),
        ] }),
      ];
    },
  });
})();
