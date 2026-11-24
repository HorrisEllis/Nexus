'use strict';
/**
 * renderer/settings/sections/import.js — Import from Firefox (BS7, 0.60.179; everything, BS1 expanded 2026-11-24). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-SURFACE.
 *
 * James, 2026-10-21: "can you build a import for firefox profiles and cookies for clearglass.?" · 2026-11-24: "this needs to be built, importing
 * all of it from firefox." · "can you have it import the autofill and password from firefox also? into the plugin and autofill, and chip."
 * Each Firefox profile on this machine, what it holds, and a real import (src/import/firefox.js through http://127.0.0.1:7702/cli/firefox/*):
 * cookies into a profile, bookmarks, saved logins into the Password Manager, history with its dates, addresses into autofill, and the profile's
 * user agent. Firefox's files are read from a copy, so Firefox can stay open. The report counts; it never shows a cookie, a username or a password.
 */
(function () {
  const { cg, h, section, pane, row, btn, chip, select, toggle, toast, fail } = window.CGS;
  const BRIDGE = window.__CG_BRIDGE || 'http://127.0.0.1:7702';
  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try { res = await fetch(BRIDGE + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) }); }
    catch (e) { throw new Error(`Clear Glass bridge :7702 unreachable (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); }
    let j = null; try { j = await res.json(); } catch (_) {}
    if (!res.ok || (j && j.ok === false && !j.cookies && !j.needsPrimary)) throw new Error((j && (j.error || (j.errors || []).join('; '))) || `HTTP ${res.status}`);
    return j || {};
  }
  const SKIP = { expired: 'expired', container: 'in a container tab', private: 'from a private window', partitioned: 'partitioned (third-party)', bad: 'unreadable', refused: 'refused by Chromium' };

  section({
    id: 'import', group: 'Browser', icon: '🦊', label: 'Import',
    keywords: 'firefox import profile cookies bookmarks sign in logins passwords history addresses autofill migrate mozilla user agent persona',
    blurb: 'Bring a Firefox profile into Clear Glass: its sign-ins, saved passwords, history, addresses, bookmarks and user agent. Firefox can stay open; its files are read from a copy.',
    async render() {
      let d;
      try { d = await api('/cli/firefox/profiles'); } catch (e) { return [pane({ title: 'Import from Firefox', body: h('div', { class: 'err-box', text: e.message }) })]; }
      const profiles = d.profiles || [];
      if (!profiles.length) return [pane({ title: 'Import from Firefox', body: [h('p', { class: 'blurb', text: 'No Firefox profile was found on this machine. Looked in:' }), h('pre', { class: 'out', text: (d.looked || []).join('\n') })] })];

      let pick = (profiles.find(p => p.isDefault) || profiles[0]).path;
      const want = { cookies: true, passwords: true, history: true, addresses: true, bookmarks: true, persona: false };
      const mine = await cg.profiles.list().then((l) => (l && l.profiles) || []).catch(() => []);
      // 2026-11-24 — his "should only be one profile": an import lands in one of HIS profiles; a provider tab is part of its profile's jar
      // (AC10, one jar per profile), so provider tabs are no longer targets of their own
      const places = mine.length ? mine.map((p) => ({ value: p.partition.replace(/^persist:/, ''), label: p.name })) : [{ value: 'default', label: 'Default' }];
      const into = select(places, 'default');
      const report = h('div', { class: 'imp-report' });
      const rows = profiles.map(p => {
        const r = row(`${p.name}`, p.path, chip(p.isDefault ? 'default' : 'profile', p.isDefault ? 'ok' : ''),
          ...['cookies', 'places', 'prefs'].map(k => chip(k === 'places' ? 'bookmarks' : k, p.has && p.has[k] ? 'ok' : '')));
        r.classList.add('imp-profile'); r.dataset.path = p.path; r.tabIndex = 0; r.setAttribute('role', 'radio');
        const choose = () => { pick = p.path; document.querySelectorAll('.imp-profile').forEach(x => x.setAttribute('aria-checked', String(x.dataset.path === pick))); };
        r.addEventListener('click', choose); r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
        r.setAttribute('aria-checked', String(p.path === pick));
        return r;
      });
      // a Firefox primary password, asked for only when the profile has one; sent with this import, never kept
      const primary = h('input', { type: 'password', class: 'inp', placeholder: 'Firefox primary password', autocomplete: 'off', 'aria-label': 'Firefox primary password' });
      const primaryRow = row('Primary password', 'This Firefox profile locks its saved passwords with a primary password. Enter it to bring them; it is used for this import only and never kept.', primary);
      const showPrimary = (on) => { primaryRow.style.display = on ? '' : 'none'; };   // a row's own display wins over [hidden]
      showPrimary(false);
      const anyOn = () => Object.values(want).some(Boolean);
      const go = async (onlyPasswords) => {
        if (!anyOn()) return toast('choose at least one thing to bring');
        run.disabled = true; report.replaceChildren(h('p', { class: 'blurb', text: 'Importing…' }));
        try {
          const body = onlyPasswords ? { profile: pick, cookies: false, passwords: true, primary: primary.value }
            : { profile: pick, ...want, into: into.value, ...(primary.value ? { primary: primary.value } : {}) };
          const r = await api('/cli/firefox/import', { method: 'POST', body });
          primary.value = '';
          const c = r.cookies, b = r.bookmarks, pw = r.passwords, hi = r.history, ad = r.addresses;
          const skipped = c ? Object.entries(c.skipped || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${SKIP[k] || k}`) : [];
          const lines = [
            c && row('Cookies', `${c.imported} of ${c.read} imported into ${(places.find((x) => x.value === r.into) || { label: r.into }).label}${skipped.length ? ` · skipped: ${skipped.join(', ')}` : ''}`, chip(`${c.imported}`, 'ok')),
            pw && row('Passwords', `${pw.imported} of ${pw.found} saved logins into the Password Manager · ${pw.already} already there${pw.noUsername ? ` · ${pw.noUsername} without a username skipped` : ''}${pw.unreadable ? ` · ${pw.unreadable} unreadable` : ''}`, chip(`${pw.imported}`, 'ok')),
            hi && row('History', `${hi.added} visits added, with their own dates · ${hi.already} already there${hi.dropped ? ` · the oldest ${hi.dropped} dropped (Clear Glass keeps 5,000)` : ''}`, chip(`${hi.added}`, 'ok')),
            ad && row('Addresses', `${ad.imported} of ${ad.found} became autofill profiles · ${ad.already} already there${ad.cardsLeftInFirefox ? ` · ${ad.cardsLeftInFirefox} saved cards stay in Firefox` : ''}`, chip(`${ad.imported}`, 'ok')),
            b && row('Bookmarks', `${b.added} added · ${b.existing} already there`, chip(`${b.added}`, 'ok')),
            r.persona && row('User agent', r.persona.userAgent ? 'Firefox’s user agent override applied to this window’s persona' : 'This profile has no user agent override; nothing changed', chip(r.persona.userAgent ? 'applied' : 'none', r.persona.userAgent ? 'ok' : '')),
            ...(r.errors || []).filter((e) => !(r.needsPrimary && /^passwords:/.test(e))).map(e => h('p', { class: 'warn-box', text: e })),
            r.needsPrimary && h('p', { class: 'warn-box', text: 'The saved passwords were not imported: this Firefox profile has a primary password. Enter it above, then Import passwords.' }),
          ].filter(Boolean);   // 2026-11-24: an empty line was drawn as the text "null"
          showPrimary(!!r.needsPrimary);
          report.replaceChildren(...lines);
          toast(r.needsPrimary ? 'imported; the passwords need Firefox’s primary password' : 'Firefox import done');
        } catch (e) { report.replaceChildren(h('p', { class: 'err-box', text: e.message })); fail(e); }
        finally { run.disabled = false; }
      };
      const run = btn('Import', () => go(false), 'primary');
      run.id = 'imp-run';
      primaryRow.append(btn('Import passwords', () => go(true)));
      return [
        // 2026-11-24 — his "why is there 3?": they are Firefox's own profiles (profiles.ini); Clear Glass only reads them. The one Firefox
        // opens is shown; the others wait behind one link
        pane({ title: 'Firefox profile', sub: 'The profile Firefox opens. Firefox keeps its other profiles itself; Clear Glass only reads them.', body: (() => {
          const main = rows.filter((r) => r.dataset.path === pick), rest = rows.filter((r) => r.dataset.path !== pick);
          const more = h('div', { class: 'imp-list', role: 'radiogroup', style: { display: 'none' } }, rest);
          const link = rest.length ? btn(`Show ${rest.length} other Firefox profile${rest.length > 1 ? 's' : ''}`, () => { const open = more.style.display === 'none'; more.style.display = open ? '' : 'none'; link.textContent = open ? 'Hide the other Firefox profiles' : `Show ${rest.length} other Firefox profile${rest.length > 1 ? 's' : ''}`; }) : null;
          return [h('div', { class: 'imp-list', role: 'radiogroup' }, main), link && h('div', { class: 'acts' }, link), more].filter(Boolean); })() }),
        pane({ title: 'What to bring', body: [
          row('Cookies', 'Your sign-ins come with you. Container tabs, private windows and expired cookies are skipped and counted. Snowflake windows never receive them.', toggle(want.cookies, (on) => { want.cookies = on; })),
          row('Into', 'The Clear Glass profile the sign-ins, passwords and history go into', into),
          row('Passwords', 'Saved logins go into the Password Manager, and the chip under a sign-in field offers them. A login you already have here is left as it is.', toggle(want.passwords, (on) => { want.passwords = on; })),
          primaryRow,
          row('History', 'Your visits, each with its own date, newest first. Clear Glass keeps the newest 5,000.', toggle(want.history, (on) => { want.history = on; })),
          row('Addresses', 'Firefox’s saved addresses become autofill profiles. Saved cards stay in Firefox: Windows locks them.', toggle(want.addresses, (on) => { want.addresses = on; })),
          row('Bookmarks', 'Added with the tag "firefox" and their folder; ones you already have are left alone.', toggle(want.bookmarks, (on) => { want.bookmarks = on; })),
          row('User agent', 'If the profile sets general.useragent.override, this window’s persona takes it.', toggle(want.persona, (on) => { want.persona = on; })),
          h('div', { class: 'acts imp-acts' }, run),
          report,
        ] }),
        pane({ title: 'What is not imported', body: h('p', { class: 'blurb', text: 'Saved cards (Firefox keeps them under Windows’ own key), open tabs, and add-ons’ own data.' }) }),
      ];
    },
  });
})();
