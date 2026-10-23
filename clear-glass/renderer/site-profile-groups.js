'use strict';
/**
 * renderer/site-profile-groups.js — one site's settings, grouped by feature, drawn from the key table (SP3, 0.60.217).  (styles: site-profile-groups.css)
 * Spec: clear-glass/spec/site-profile.spec MOD-SP-UI · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP3
 *
 * James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
 * Cleardriver, agentmesh and guardian setting."
 *
 * window.CGSiteGroups.build({ url, profile, keys, live, onSet, onClear, lists }) → { el, pending() }
 *   profile  ClearGlass.siteProfile.get(url) — each value and where it came from (site | global | default)
 *   keys     ClearGlass.siteProfile.keys().keys — every control comes from this table; nothing is listed by hand here
 *   live     true (the toolbar's popup): a change is written at once and the row redrawn; a refused write shows its why on the row.
 *            false (Settings › Sites): changes wait in pending() until the dialog's Save.
 *   lists    optional { 'autofill.profileId': [{ value, label }], … } — choices for an id key (a free id can still be typed)
 * Each row says "this site" (with ↺ to go back to the default) or "default" / "Settings" with the value it falls back to.
 * The Network group is the site's netPolicy route (key network.via): Default, Direct, Through Snowflake, Blocked.
 */
(function () {
  const FEATURE = {
    autofill: 'Autofill', macros: 'Macros', workflows: 'Workflows', passwords: 'Passwords & account', network: 'Network',
    resume: 'Resume', driver: 'ClearDriver', mesh: 'Co-pilot & agent mesh', guardian: 'Guardian',
  };
  const ORDER = ['autofill', 'macros', 'workflows', 'passwords', 'network', 'resume', 'driver', 'mesh', 'guardian'];
  const ROUTE = [['direct', 'Direct'], ['transport', 'Through Snowflake'], ['block', 'Blocked']];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const show = (v) => v === true ? 'on' : v === false ? 'off' : v == null || v === '' ? 'none' : Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : String(v);

  function valueOf(profile, key) {
    if (key === 'network.via') return profile.network ? profile.network.via : 'default';
    const [f, n] = key.split('.');
    return profile[f] ? profile[f][n] : undefined;
  }

  function control(k, cur, fromSite, lists) {
    const dflt = (label) => Object.assign(el('option', null, label), { value: '' });
    if (k.type === 'bool') {
      const s = el('select', 'sp-input');
      s.append(dflt(fromSite ? 'Default' : `Default (${show(cur)})`), Object.assign(el('option', null, 'On'), { value: 'true' }), Object.assign(el('option', null, 'Off'), { value: 'false' }));
      s.value = fromSite ? String(!!cur) : '';
      return s;
    }
    if (k.type === 'enum' || k.key === 'network.via') {
      const s = el('select', 'sp-input');
      const vals = k.key === 'network.via' ? ROUTE : k.values.map(v => [v, v === 'scroll+forms' ? 'Scroll and forms' : v[0].toUpperCase() + v.slice(1)]);
      s.append(dflt(fromSite ? 'Default' : `Default (${show(cur)})`), ...vals.map(([v, l]) => Object.assign(el('option', null, l), { value: v })));
      s.value = fromSite ? String(cur) : '';
      return s;
    }
    const i = el('input', 'sp-input');
    i.type = k.type === 'int' ? 'number' : 'text';
    if (k.type === 'int') { if (k.min != null) i.min = k.min; if (k.max != null) i.max = k.max; }
    i.placeholder = fromSite ? '' : `Default: ${show(cur)}`;
    i.value = fromSite ? (Array.isArray(cur) ? cur.join(', ') : cur == null ? '' : String(cur)) : '';
    i.spellcheck = false;
    const opts = lists && lists[k.key];
    if (opts && opts.length) {
      const id = `sp-dl-${k.key.replace(/\W/g, '-')}`;
      i.setAttribute('list', id);
      const dl = el('datalist'); dl.id = id;
      for (const o of opts) dl.append(Object.assign(el('option', null, o.label || o.value), { value: o.value }));
      i._dl = dl;
    }
    if (k.type === 'string[]') i.placeholder = fromSite ? 'names, comma separated' : `Default: ${show(cur)} — names, comma separated`;
    return i;
  }

  function build({ url, profile, keys, live = false, onSet, onClear, lists = {} } = {}) {
    const root = el('div', 'sp-groups');
    const pending = new Map();   // key → value | null (null = back to the default)
    const rows = (keys || []).concat([{ key: 'network.via', feature: 'network', type: 'route', does: 'How this site is reached: directly, through Snowflake, or not at all' }]);
    let prof = profile || {};

    function draw() {
      root.replaceChildren();
      if (!prof.origin) { root.append(el('div', 'sp-empty', 'This page is not a website, so it has no site settings.')); return; }
      for (const f of ORDER) {
        const ks = rows.filter(k => k.feature === f);
        if (!ks.length) continue;
        const g = el('section', 'sp-group'); g.dataset.feature = f;
        g.append(el('h4', 'sp-group-h', FEATURE[f] || f));
        for (const k of ks) g.append(row(k));
        root.append(g);
      }
    }

    function row(k) {
      const from = (prof.from || {})[k.key] || 'default';
      const fromSite = pending.has(k.key) ? pending.get(k.key) !== null : from === 'site';
      const cur = pending.has(k.key) && pending.get(k.key) !== null ? pending.get(k.key) : valueOf(prof, k.key);
      const r = el('div', 'sp-row'); r.dataset.key = k.key;
      const what = el('div', 'sp-what');
      what.append(el('div', 'sp-label', k.does), el('code', 'sp-key', k.key));
      const c = control(k, cur, fromSite, lists);
      const tag = el('span', `sp-tag ${fromSite ? 'site' : 'default'}`, fromSite ? 'this site' : from === 'global' ? 'Settings' : 'default');
      tag.title = fromSite ? 'Set for this site' : from === 'global' ? 'Follows the setting in Settings' : 'Follows the default';
      const reset = el('button', 'sp-reset', '↺'); reset.type = 'button'; reset.title = 'Back to the default'; reset.hidden = !fromSite;
      const note = el('div', 'sp-note'); note.hidden = true;
      const say = (t) => { note.textContent = t; note.hidden = !t; };
      const commit = async (value) => {
        if (!live) { pending.set(k.key, value); root.dispatchEvent(new CustomEvent('sp-change', { detail: { key: k.key, value } })); redrawRow(r, k); return; }
        try {
          const res = value === null ? await onClear(k.key) : await onSet(k.key, value);
          if (res && res.ok === false) { say(res.why || res.error || 'Not saved'); return; }
          if (typeof live === 'function') prof = (await live()) || prof;
          redrawRow(r, k);
        } catch (e) { say(e.message); }
      };
      c.addEventListener('change', () => {
        const v = c.value;
        if (v === '') return commit(null);
        commit(k.type === 'bool' ? v === 'true' : k.type === 'int' ? Number(v) : v);
      });
      reset.addEventListener('click', (e) => { e.stopPropagation(); commit(null); });
      const ctl = el('div', 'sp-ctl'); ctl.append(c, tag, reset); if (c._dl) ctl.append(c._dl);
      r.append(what, ctl, note);
      return r;
    }
    function redrawRow(r, k) { const n = row(k); r.replaceWith(n); }

    draw();
    return { el: root, pending: () => new Map(pending), setProfile(p) { prof = p || {}; pending.clear(); draw(); } };
  }

  /** load(url) → { profile, keys, lists } through ClearGlass — the lists are best-effort (a missing one leaves the key free text) */
  async function load(cg, url) {
    const [profile, k] = await Promise.all([cg.siteProfile.get(url), cg.siteProfile.keys()]);
    const norm = (x, key) => (Array.isArray(x) ? x : (x && (x[key] || x.items || x.list)) || []).map(o => typeof o === 'string' ? { value: o } : { value: o.id || o.name || o.key, label: o.label || o.name || o.id });
    const lists = {};
    const get = async (fn, key) => { try { return norm(await fn(), key).filter(o => o.value); } catch (_) { return []; } };
    [lists['autofill.profileId'], lists['passwords.accountId'], lists['macros.autoRun'], lists['mesh.agent']] = await Promise.all([
      get(() => cg.autofill && cg.autofill.listProfiles(), 'profiles'), get(() => cg.accounts && cg.accounts.list(), 'accounts'),
      get(() => cg.macros && cg.macros.list(), 'macros'), get(() => cg.agents && cg.agents.list(), 'agents')]);
    return { profile, keys: (k && k.keys) || [], lists };
  }

  window.CGSiteGroups = { build, load, FEATURE };
})();
